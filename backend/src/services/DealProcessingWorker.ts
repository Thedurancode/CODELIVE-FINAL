/**
 * Deal Processing Worker
 *
 * Background worker that processes deals through the pipeline:
 * 1. Enrichment (optional)
 * 2. Scoring (required)
 * 3. Queue for approval
 * 4. Emit ready event for automations
 *
 * Uses the outbox pattern for guaranteed delivery and processing order.
 */

import Property from '../models/Property';
import Outbox from '../models/Outbox';
import { dealProcessingQueue } from './DealProcessingQueue';
import { scoringEngine } from '../plugins';
import { automationEngine } from '../plugins';
import { dealApprovalService } from './DealApprovalService';
import { propertyService } from './propertyService';
import {
  DealProcessingState,
  DealProcessingResult,
  ProcessingStepResult,
} from '../types/dealProcessing';
import { NormalizedDeal } from '../plugins/types';

class DealProcessingWorker {
  private running = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 2000; // 2 seconds
  private readonly BATCH_SIZE = 5;
  private consecutiveErrors = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 5;
  private readonly ERROR_BACKOFF_MS = 5000; // 5 seconds backoff after errors

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('⚠️ DealProcessingWorker already running');
      return;
    }

    await dealProcessingQueue.initialize();
    this.running = true;

    console.log('🚀 DealProcessingWorker started');

    // Start processing loop
    this.processingInterval = setInterval(
      () => this.processLoop(),
      this.POLL_INTERVAL
    );

    // Run immediately
    this.processLoop();
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.running = false;
    console.log('🛑 DealProcessingWorker stopped');
  }

  /**
   * Check if worker is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Main processing loop
   */
  private async processLoop(): Promise<void> {
    if (!this.running) return;

    try {
      // Process pending events
      const pendingEvents = await dealProcessingQueue.fetchPendingEvents(this.BATCH_SIZE);
      for (const event of pendingEvents) {
        await this.processEvent(event);
      }

      // Process retryable failed events
      const retryableEvents = await dealProcessingQueue.fetchRetryableEvents(this.BATCH_SIZE);
      for (const event of retryableEvents) {
        await this.processEvent(event);
      }
    } catch (error) {
      this.consecutiveErrors++;
      console.error(`❌ Error in processing loop (attempt ${this.consecutiveErrors}/${this.MAX_CONSECUTIVE_ERRORS}):`, error);

      if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
        console.error('⛔ Too many consecutive errors in DealProcessingWorker. Pausing for recovery...');
        // Pause processing and schedule recovery
        this.stop();
        setTimeout(() => {
          console.log('🔄 Attempting to restart DealProcessingWorker after error recovery period...');
          this.consecutiveErrors = 0;
          this.start().catch((restartError) => {
            console.error('❌ Failed to restart DealProcessingWorker:', restartError);
          });
        }, this.ERROR_BACKOFF_MS);
      }
      return; // Exit early on error
    }
    // Reset error counter on successful processing
    this.consecutiveErrors = 0;
  }

  /**
   * Process a single outbox event
   */
  private async processEvent(event: Outbox): Promise<void> {
    // Try to claim the event
    const claimed = await dealProcessingQueue.claimEvent(event.id);
    if (!claimed) {
      // Another worker claimed it
      return;
    }

    console.log(`📦 Processing event ${event.id}: ${event.eventType} for ${event.aggregateType}#${event.aggregateId}`);

    try {
      switch (event.eventType) {
        case 'deal.created':
          await this.processDealCreated(event);
          break;
        case 'deal.processing_started':
        case 'deal.scoring_completed':
        case 'deal.ready':
        case 'deal.approved':
        case 'deal.rejected':
        case 'deal.blocked':
          // These are notification events - forward to automation engine
          await this.forwardToAutomationEngine(event);
          break;
        default:
          console.log(`ℹ️ Unhandled event type: ${event.eventType}`);
      }

      await dealProcessingQueue.completeEvent(event.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to process event ${event.id}:`, errorMessage);
      await dealProcessingQueue.failEvent(event.id, errorMessage);
    }
  }

  /**
   * Process a newly created deal through the pipeline
   */
  private async processDealCreated(event: Outbox): Promise<DealProcessingResult> {
    const startTime = Date.now();
    const propertyId = parseInt(event.aggregateId, 10);
    const steps: ProcessingStepResult[] = [];

    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    console.log(`🔄 Processing deal: Property ${propertyId}`);

    // Step 1: Run enrichment (optional, non-blocking)
    // Get enrichment options from event metadata
    const enrichmentOptions = event.metadata?.enrichmentOptions as {
      enabled?: boolean;
      fetchZestimate?: boolean;
      fetchPriceHistory?: boolean;
      fetchTaxHistory?: boolean;
      fetchSkipTrace?: boolean;
      fetchPropertyImages?: boolean;
      fetchComparables?: boolean;
    } | undefined;
    const enrichmentResult = await this.runEnrichment(property, enrichmentOptions);
    steps.push(enrichmentResult);
    // Enrichment failure is not blocking

    // Emit deal.enriched event for automations (e.g., enrichment email)
    if (enrichmentResult.success && !enrichmentResult.data?.skipped) {
      // Refetch property to get updated enrichment data
      const enrichedProperty = await Property.findByPk(propertyId);
      if (enrichedProperty) {
        await this.emitDealEnriched(enrichedProperty, enrichmentResult.data, event.payload);
      }
    }

    // Step 5: Transition to SCORING
    await dealProcessingQueue.transitionState(propertyId, DealProcessingState.SCORING, {
      reason: 'Starting scoring',
    });

    // Step 6: Run scoring
    const scoringResult = await this.runScoring(property);
    steps.push(scoringResult);

    // Step 7: Transition to SCORED
    await dealProcessingQueue.transitionState(propertyId, DealProcessingState.SCORED, {
      reason: 'Scoring complete',
      metadata: scoringResult.data,
    });

    // Step 8: Transition to APPROVAL_PENDING
    const approvalTransition = await dealProcessingQueue.transitionState(propertyId, DealProcessingState.APPROVAL_PENDING, {
      reason: 'Queued for broker approval',
    });

    // Step 9: Queue for broker approval
    const approvalResult = await this.queueForApproval(property);
    steps.push(approvalResult);

    // Step 10: Emit deal.ready event for automations if outbox transition failed
    if (!approvalTransition.success) {
      await this.emitDealReady(property, event.payload);
    }

    const finalState = DealProcessingState.APPROVAL_PENDING;
    const totalDuration = Date.now() - startTime;

    console.log(`✅ Deal processing complete: Property ${propertyId} in ${totalDuration}ms (${finalState})`);

    return {
      propertyId,
      success: true,
      finalState,
      steps,
      totalDuration,
    };
  }

  /**
   * Run enrichment (optional)
   */
  private async runEnrichment(
    property: Property,
    options?: {
      enabled?: boolean;
      fetchZestimate?: boolean;
      fetchPriceHistory?: boolean;
      fetchTaxHistory?: boolean;
      fetchSkipTrace?: boolean;
      fetchPropertyImages?: boolean;
      fetchComparables?: boolean;
    }
  ): Promise<ProcessingStepResult> {
    const startTime = Date.now();

    try {
      // Check if enrichment is enabled (from payload options or global setting)
      if (options && options.enabled === false) {
        try {
          const existing = (property.get('marketDataEnrichment') as any) || {};
          await property.update({
            marketDataEnrichment: {
              ...existing,
              status: 'skipped',
              reason: 'Enrichment disabled by user',
              skippedAt: new Date(),
              enabledOptions: options,
            },
            enrichedAt: new Date(),
            enrichmentSource: 'rapidapi-zillow',
          } as any);
        } catch (updateError) {
          console.warn('⚠️ Failed to persist enrichment skip state:', updateError);
        }
        return {
          success: true,
          step: 'enrichment',
          duration: Date.now() - startTime,
          data: { skipped: true, reason: 'Enrichment disabled by user' },
        };
      }

      // If no options provided, check global setting
      if (!options || options.enabled === undefined) {
        const { settingsService } = await import('./settingsService');
        const enrichmentEnabled = await settingsService.isEnabled('enrichment.enabled');

        if (!enrichmentEnabled) {
          try {
            const existing = (property.get('marketDataEnrichment') as any) || {};
            await property.update({
              marketDataEnrichment: {
                ...existing,
                status: 'skipped',
                reason: 'Enrichment disabled globally',
                skippedAt: new Date(),
              },
              enrichedAt: new Date(),
              enrichmentSource: 'rapidapi-zillow',
            } as any);
          } catch (updateError) {
            console.warn('⚠️ Failed to persist enrichment skip state:', updateError);
          }
          return {
            success: true,
            step: 'enrichment',
            duration: Date.now() - startTime,
            data: { skipped: true, reason: 'Enrichment disabled globally' },
          };
        }
      }

      const result = await propertyService.enrichProperty(property, options);

      return {
        success: result.success,
        step: 'enrichment',
        duration: Date.now() - startTime,
        data: result.data,
        error: result.error,
      };
    } catch (error) {
      // Enrichment failure is not blocking
      return {
        success: true, // Non-blocking
        step: 'enrichment',
        duration: Date.now() - startTime,
        data: { skipped: true, reason: 'Enrichment failed (non-blocking)' },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run scoring against all buy boxes
   */
  private async runScoring(property: Property): Promise<ProcessingStepResult> {
    const startTime = Date.now();

    try {
      // Create normalized deal for scoring
      const normalizedDeal = this.createNormalizedDeal(property);

      // Score against all buy boxes
      const scoringResults = await scoringEngine.scoreDealAgainstAllBuyBoxes(normalizedDeal);

      // Find best match
      const bestMatch = scoringResults.length > 0
        ? scoringResults.reduce((best, current) =>
            (current.percentage || 0) > (best.percentage || 0) ? current : best
          )
        : null;

      return {
        success: true,
        step: 'scoring',
        duration: Date.now() - startTime,
        data: {
          matchCount: scoringResults.length,
          bestMatchScore: bestMatch?.percentage || 0,
          bestMatchBuyBox: bestMatch?.buyBoxId,
          results: scoringResults.slice(0, 5), // Top 5 matches
        },
      };
    } catch (error) {
      return {
        success: true, // Scoring failure shouldn't block the deal
        step: 'scoring',
        duration: Date.now() - startTime,
        data: { matchCount: 0 },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Queue for broker approval
   */
  private async queueForApproval(property: Property): Promise<ProcessingStepResult> {
    const startTime = Date.now();

    try {
      await dealApprovalService.queueForApproval(property.id);

      return {
        success: true,
        step: 'approval_queue',
        duration: Date.now() - startTime,
        data: { queued: true },
      };
    } catch (error) {
      // Log but don't fail - deal is still processed
      console.warn(`⚠️ Failed to queue property ${property.id} for approval:`, error);

      return {
        success: true, // Non-blocking
        step: 'approval_queue',
        duration: Date.now() - startTime,
        data: { queued: false },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Emit deal.ready event for automations
   */
  private async emitDealReady(property: Property, originalPayload: any): Promise<void> {
    try {
      const normalizedDeal = this.createNormalizedDeal(property);

      await automationEngine.safeEmitEvent({
        id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'deal.ready',
        timestamp: new Date(),
        payload: {
          deal: normalizedDeal,
          property,
          originalSource: originalPayload?.sourceId,
        },
        metadata: {
          sourceId: originalPayload?.sourceId || 'processing-worker',
          dealId: property.id?.toString(),
        },
      });

      console.log(`📤 Emitted deal.ready event for property ${property.id}`);
    } catch (error) {
      // Log but don't fail - deal is already processed
      console.warn(`⚠️ Failed to emit deal.ready for property ${property.id}:`, error);
    }
  }

  /**
   * Emit deal.enriched event for automations (enrichment email, etc.)
   */
  private async emitDealEnriched(property: Property, enrichmentData: any, originalPayload: any): Promise<void> {
    try {
      const normalizedDeal = this.createNormalizedDeal(property);
      const p = property as any;

      // Build enrichment result structure that matches the email template expectations
      // Template uses {{enrichmentResult.data.zestimate}}, etc.
      const enrichmentResult = {
        success: true,
        timestamp: new Date().toISOString(),
        data: {
          zestimate: p.zestimate,
          rentZestimate: p.rentZestimate,
          pricePerSqft: p.zestimate && p.livingSpaceSqFt ? Math.round(p.zestimate / p.livingSpaceSqFt) : null,
          taxAssessment: p.taxAssessedValue,
          annualTaxes: p.marketDataEnrichment?.property?.taxHistory?.[0]?.taxPaid,
          hoaFee: p.hoaDuesAmount,
          daysOnMarket: p.marketDataEnrichment?.property?.daysOnMarket,
          zillowUrl: p.zpid ? `https://www.zillow.com/homedetails/${p.zpid}_zpid/` : null,
          equityVsZestimate: p.zestimate && normalizedDeal.askingPrice ? p.zestimate - normalizedDeal.askingPrice : null,
          discountPercent: p.zestimate && normalizedDeal.askingPrice ? Math.round((1 - normalizedDeal.askingPrice / p.zestimate) * 100) : null,
          capRate: p.rentZestimate && normalizedDeal.askingPrice ? Math.round((p.rentZestimate * 12 / normalizedDeal.askingPrice) * 1000) / 10 : null,
          grm: p.rentZestimate && normalizedDeal.askingPrice ? Math.round(normalizedDeal.askingPrice / (p.rentZestimate * 12) * 10) / 10 : null,
          // Also include raw enrichment data
          ...enrichmentData,
        },
      };

      await automationEngine.safeEmitEvent({
        id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'deal.enriched',
        timestamp: new Date(),
        payload: {
          deal: normalizedDeal,
          enrichmentResult,
          property,
        },
        metadata: {
          sourceId: originalPayload?.sourceId || 'processing-worker',
          dealId: property.id?.toString(),
        },
      });

      console.log(`📤 Emitted deal.enriched event for property ${property.id}`);
    } catch (error) {
      // Log but don't fail - enrichment event is not critical
      console.warn(`⚠️ Failed to emit deal.enriched for property ${property.id}:`, error);
    }
  }

  /**
   * Forward event to automation engine
   */
  private async forwardToAutomationEngine(event: Outbox): Promise<void> {
    try {
      await automationEngine.safeEmitEvent({
        id: `event-${event.id}-${Date.now()}`,
        type: event.eventType as any,
        timestamp: new Date(),
        payload: event.payload,
        metadata: event.metadata || {},
      });
    } catch (error) {
      console.warn(`⚠️ Failed to forward event ${event.id} to automation engine:`, error);
      throw error;
    }
  }

  /**
   * Create normalized deal from property
   */
  private createNormalizedDeal(property: Property): NormalizedDeal {
    const p = property as any;
    const streetAddress = p.address
      ? `${p.address.houseNumber || ''} ${p.address.street || ''}`.trim()
      : '';

    return {
      externalId: p.id?.toString(),
      sourceId: 'processing-worker',
      sourceName: 'Deal Processing Worker',
      address: {
        street: streetAddress,
        city: p.city || '',
        state: p.state || '',
        zip: p.zip || '',
        county: p.county,
      },
      propertyType: p.propertyType,
      bedrooms: p.bedroomCount || 0,
      bathrooms: p.bathroomCount || 0,
      sqft: p.livingSpaceSqFt || 0,
      yearBuilt: p.yearBuilt || 0,
      askingPrice: parseFloat(p.mlsListingPrice) || parseFloat(p.reservePrice) || 0,
      arv: parseFloat(p.arv) || 0,
      repairEstimate: parseFloat(p.rehabCost) || 0,
      normalizedAt: new Date(),
    } as NormalizedDeal;
  }

  /**
   * Get worker statistics
   */
  async getStats(): Promise<{
    running: boolean;
    queueStats: {
      pending: number;
      processing: number;
      completed: number;
      failed: number;
      deadLetter: number;
    };
  }> {
    const queueStats = await dealProcessingQueue.getStats();
    return {
      running: this.running,
      queueStats,
    };
  }
}

// Export singleton instance
export const dealProcessingWorker = new DealProcessingWorker();
export default dealProcessingWorker;
