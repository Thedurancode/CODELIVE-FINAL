/**
 * Property Creation Service
 *
 * SINGLE ENTRY POINT for all property creation in the system.
 * Ensures consistent behavior across all creation paths:
 * - Manual UI entry
 * - Bulk imports
 * - External intake (email, webhook, API, CSV)
 *
 * Handles:
 * - Property creation with proper state
 * - Duplicate detection
 * - Compliance trigger firing
 * - Automation event emission
 * - Deal processing queue (optional)
 */

import { Transaction } from 'sequelize';
import Property from '../models/Property';
import sequelize from '../config/database';
import { PropertyAttributes } from '../types';
import { NormalizedDeal } from '../plugins/types';
import { DealProcessingState } from '../types/dealProcessing';
import { complianceTriggerService } from './ComplianceTriggerService';
import { automationEngine } from '../plugins';
import { dealProcessingQueue } from './DealProcessingQueue';
import { webhookService } from './WebhookService';
import { entitySearchService } from './EntitySearchService';
import { Op } from 'sequelize';

// =============================================================================
// Types
// =============================================================================

export interface CreatePropertyOptions {
  /** Source identifier (e.g., 'manual', 'bulk-import', 'email-intake') */
  sourceId: string;
  /** Human-readable source name */
  sourceName: string;
  /** User ID who created this (if applicable) */
  createdBy?: string;
  /** Skip duplicate checking */
  skipDuplicateCheck?: boolean;
  /** Enqueue for deal processing pipeline */
  enqueueForProcessing?: boolean;
  /** Emit automation events */
  emitAutomationEvents?: boolean;
  /** Fire compliance triggers */
  fireComplianceTriggers?: boolean;
  /** Enrichment options for processing queue */
  enrichmentOptions?: {
    enabled?: boolean;
    fetchZestimate?: boolean;
    fetchPriceHistory?: boolean;
    fetchTaxHistory?: boolean;
    fetchSkipTrace?: boolean;
    fetchPropertyImages?: boolean;
    fetchComparables?: boolean;
  };
  /** Run compliance check in processing pipeline */
  runComplianceCheck?: boolean;
  /** Score against buy boxes in processing pipeline */
  scoreAgainstBuyBoxes?: boolean;
  /** Use external transaction (for bulk operations) */
  transaction?: Transaction;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface CreatePropertyResult {
  success: boolean;
  property?: Property;
  error?: string;
  action: 'created' | 'duplicate' | 'failed';
  duplicateOf?: number;
  processingQueued?: boolean;
  /** Callback to fire post-commit side effects (for transaction batching) */
  firePostCommitEffects?: () => void;
}

export interface BulkCreateResult {
  created: Property[];
  duplicates: Array<{ index: number; existingId: number; data: any }>;
  errors: Array<{ index: number; error: string; data: any }>;
  totalRequested: number;
  totalCreated: number;
  processingTimeMs: number;
}

// =============================================================================
// Service
// =============================================================================

class PropertyCreationService {
  /**
   * Create a single property - THE canonical way to create properties
   */
  async createProperty(
    propertyData: Partial<PropertyAttributes>,
    options: CreatePropertyOptions
  ): Promise<CreatePropertyResult> {
    const {
      sourceId,
      sourceName,
      createdBy,
      skipDuplicateCheck = false,
      enqueueForProcessing = true,
      emitAutomationEvents = true,
      fireComplianceTriggers = true,
      enrichmentOptions = { enabled: true },
      runComplianceCheck = true,
      scoreAgainstBuyBoxes = true,
      transaction: externalTransaction,
      metadata = {},
    } = options;

    // Use external transaction or create our own
    const useExternalTransaction = !!externalTransaction;
    const transaction = externalTransaction || await sequelize.transaction();

    try {
      // Check for duplicates
      if (!skipDuplicateCheck) {
        const duplicate = await this.findDuplicate(propertyData, transaction);
        if (duplicate) {
          if (!useExternalTransaction) await transaction.rollback();
          return {
            success: false,
            action: 'duplicate',
            duplicateOf: duplicate.id,
            error: `Duplicate property exists: ${duplicate.id}`,
          };
        }
      }

      // Create property with processing state
      const property = await Property.create(
        {
          ...propertyData,
          approvalStatus: 'draft',
          processingState: DealProcessingState.CREATED,
          processingStateUpdatedAt: new Date(),
        } as any,
        { transaction }
      );

      // Enqueue for processing pipeline (within transaction for atomicity)
      let processingQueued = false;
      if (enqueueForProcessing) {
        const normalizedDeal = this.buildNormalizedDeal(property, sourceId, sourceName);
        await dealProcessingQueue.enqueueDeal(property, normalizedDeal, {
          transaction,
          sourceId,
          sourceName,
          metadata: {
            createdBy,
            enrichmentOptions,
            runComplianceCheck,
            scoreAgainstBuyBoxes,
            ...metadata,
          },
        });
        processingQueued = true;
      }

      // Commit if we own the transaction
      if (!useExternalTransaction) {
        await transaction.commit();
      }

      console.log(`✅ Property ${property.id} created via ${sourceName} (${sourceId})`);

      // === POST-COMMIT SIDE EFFECTS ===
      // Create a callback for firing side effects (deferred for external transactions)
      const firePostCommitEffects = () => {
        // Fire compliance trigger
        if (fireComplianceTriggers) {
          complianceTriggerService
            .handlePropertyEvent('property.created', property.id, {
              state: property.state,
              propertyType: property.propertyType,
              source: sourceId,
              createdBy,
            })
            .catch(err => console.warn('Compliance trigger failed:', err.message));
        }

        // Emit automation event
        if (emitAutomationEvents && !enqueueForProcessing) {
          // Only emit directly if not using processing queue (queue handles it)
          const normalizedDeal = this.buildNormalizedDeal(property, sourceId, sourceName);
          automationEngine.safeEmitEvent({
            id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'deal.created',
            timestamp: new Date(),
            payload: { deal: normalizedDeal, property },
            metadata: { sourceId, dealId: property.id?.toString() },
          });

          // Emit webhook event for external integrations
          webhookService
            .emitDealEvent('deal.created', property.id, {
              propertyId: property.id,
              address: property.address,
              city: property.city,
              state: property.state,
              zipCode: property.zipCode,
              price: property.price,
              propertyType: property.propertyType,
              source: sourceId,
              createdBy,
            }, { userId: createdBy })
            .catch(err => console.warn('Webhook emission failed for deal.created:', err.message));
        }

        // Index property for semantic search (async, non-blocking)
        entitySearchService.indexProperty(property).catch((err) => {
          console.warn('[PropertyCreationService] Failed to index property for search:', err.message);
        });
      };

      // Fire immediately if we own the transaction (already committed)
      // Otherwise, return the callback for the caller to fire after their commit
      if (!useExternalTransaction) {
        firePostCommitEffects();
      }

      return {
        success: true,
        property,
        action: 'created',
        processingQueued,
        firePostCommitEffects: useExternalTransaction ? firePostCommitEffects : undefined,
      };
    } catch (error) {
      if (!useExternalTransaction) {
        await transaction.rollback();
      }
      console.error('Property creation failed:', error);
      return {
        success: false,
        action: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Bulk create properties efficiently
   */
  async bulkCreate(
    properties: Partial<PropertyAttributes>[],
    options: Omit<CreatePropertyOptions, 'transaction'> & {
      /** Stop on first error */
      stopOnError?: boolean;
      /** Use single transaction for all (rollback all on any error) */
      useTransaction?: boolean;
    }
  ): Promise<BulkCreateResult> {
    const startTime = Date.now();
    const {
      stopOnError = false,
      useTransaction = false,
      ...createOptions
    } = options;

    const created: Property[] = [];
    const duplicates: BulkCreateResult['duplicates'] = [];
    const errors: BulkCreateResult['errors'] = [];
    const postCommitEffects: Array<() => void> = [];

    // Use transaction if requested
    const transaction = useTransaction ? await sequelize.transaction() : undefined;

    try {
      for (let i = 0; i < properties.length; i++) {
        const propertyData = properties[i];

        const result = await this.createProperty(propertyData, {
          ...createOptions,
          transaction,
          // Don't queue each individually in bulk - let caller decide
          enqueueForProcessing: createOptions.enqueueForProcessing ?? false,
        });

        if (result.success && result.property) {
          created.push(result.property);
          // Collect post-commit effects for later (when using transaction)
          if (result.firePostCommitEffects) {
            postCommitEffects.push(result.firePostCommitEffects);
          }
        } else if (result.action === 'duplicate') {
          duplicates.push({
            index: i,
            existingId: result.duplicateOf!,
            data: propertyData,
          });
        } else {
          errors.push({
            index: i,
            error: result.error || 'Unknown error',
            data: propertyData,
          });

          if (stopOnError) {
            break;
          }
        }
      }

      // Commit transaction if we used one
      if (transaction) {
        if (errors.length > 0 && stopOnError) {
          await transaction.rollback();
          // Clear created since we rolled back - don't fire effects
          created.length = 0;
          postCommitEffects.length = 0;
        } else {
          await transaction.commit();
          // Fire all post-commit effects AFTER successful commit
          postCommitEffects.forEach(fn => fn());
        }
      }
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      throw error;
    }

    return {
      created,
      duplicates,
      errors,
      totalRequested: properties.length,
      totalCreated: created.length,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Find duplicate property by address
   */
  private async findDuplicate(
    propertyData: Partial<PropertyAttributes>,
    transaction?: Transaction
  ): Promise<Property | null> {
    if (!propertyData.city && !propertyData.address) {
      return null;
    }

    const conditions: any[] = [];

    // Build conditions - must match city/state/zip AND street
    if (propertyData.city) conditions.push({ city: propertyData.city });
    if (propertyData.state) conditions.push({ state: propertyData.state });
    if (propertyData.zip) conditions.push({ zip: propertyData.zip });

    // Add street matching if available
    if (propertyData.address?.street) {
      conditions.push(
        sequelize.where(
          sequelize.fn('LOWER', sequelize.json('address.street')),
          propertyData.address.street.toLowerCase()
        )
      );
    }

    if (conditions.length === 0) {
      return null;
    }

    // All conditions must match (AND)
    return Property.findOne({
      where: { [Op.and]: conditions },
      transaction,
    });
  }

  /**
   * Build normalized deal from property
   */
  private buildNormalizedDeal(
    property: Property,
    sourceId: string,
    sourceName: string
  ): Partial<NormalizedDeal> {
    const toNumber = (val: any): number => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') return parseFloat(val) || 0;
      if (typeof val === 'object' && val.toString) return parseFloat(val.toString()) || 0;
      return 0;
    };

    const streetAddress = property.address
      ? `${property.address.houseNumber || ''} ${property.address.street || ''}`.trim()
      : '';

    return {
      externalId: property.id?.toString(),
      sourceId,
      sourceName,
      address: {
        street: streetAddress,
        city: property.city || '',
        state: property.state || '',
        zip: property.zip || '',
        county: property.county,
      },
      propertyType: property.propertyType,
      bedrooms: property.bedroomCount || 0,
      bathrooms: property.bathroomCount || 0,
      sqft: property.livingSpaceSqFt || 0,
      yearBuilt: property.yearBuilt || 0,
      askingPrice: toNumber(property.mlsListingPrice) || toNumber(property.reservePrice) || 0,
      arv: toNumber(property.arv),
      repairEstimate: toNumber(property.rehabCost),
      normalizedAt: new Date(),
    };
  }
}

// Export singleton
export const propertyCreationService = new PropertyCreationService();
export default propertyCreationService;
