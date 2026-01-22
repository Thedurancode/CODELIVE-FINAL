/**
 * Dispotree Extensible Plugin System - Main Export
 *
 * This module provides a unified interface to all plugin functionality:
 * - Deal source plugins for pulling deals from various sources
 * - Scoring engine for buy box matching
 * - Automation engine for event-driven workflows
 * - AI analysis service for deal enrichment and analysis
 * - Workflow engine for multi-step processing
 */

// Types
export * from './types';

// Core components
export { pluginRegistry } from './registry/PluginRegistry';
export { scoringEngine, ScoringEngine } from './scoring/ScoringEngine';
export { automationEngine, AutomationEngine } from './automation/AutomationEngine';
export { dealAnalysisService, DealAnalysisService } from './ai/DealAnalysisService';
export { workflowEngine, WorkflowEngine } from './workflow/WorkflowEngine';

// Base classes
export { BaseDealSourcePlugin } from './sources/BaseDealSourcePlugin';

// Built-in plugins
export { CSVDealSourcePlugin } from './sources/CSVDealSourcePlugin';
export { APIDealSourcePlugin } from './sources/APIDealSourcePlugin';
export { EmailDealSourcePlugin } from './sources/EmailDealSourcePlugin';
export { WebhookDealSourcePlugin } from './sources/WebhookDealSourcePlugin';
export { ManualDealSourcePlugin } from './sources/ManualDealSourcePlugin';
export { FirecrawlDealSourcePlugin, FirecrawlSiteConfig } from './sources/FirecrawlDealSourcePlugin';

// ============================================================================
// UNIFIED DEAL PROCESSING SERVICE
// ============================================================================

import { pluginRegistry } from './registry/PluginRegistry';
import { scoringEngine } from './scoring/ScoringEngine';
import { automationEngine } from './automation/AutomationEngine';
import { dealAnalysisService, DealAnalysis } from './ai/DealAnalysisService';
import { workflowEngine } from './workflow/WorkflowEngine';
import {
  NormalizedDeal,
  DealSourceConfig,
  DealSourceResult,
  ScoringResult,
  BuyBox,
  Automation,
  Workflow,
  SystemEvent,
} from './types';
import { DEFAULT_AUTOMATIONS } from '../seeds/seedDefaultAutomations';

export interface DealProcessingResult {
  deal: NormalizedDeal;
  scoringResults?: ScoringResult[];
  analysis?: DealAnalysis;
  workflowExecutionId?: string;
}

export class DealProcessingService {
  private initialized = false;

  /**
   * Initialize the deal processing service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🚀 Initializing Deal Processing Service...');

    // Initialize plugin registry with default plugins
    await pluginRegistry.initialize();

    // Register workflow templates
    for (const template of workflowEngine.getWorkflowTemplates()) {
      workflowEngine.registerWorkflow(template);
    }

    // Load automations from database
    await automationEngine.loadFromDatabase();

    // Seed default automations if they don't exist
    await this.seedDefaultAutomations();

    // Load paused/running workflow executions from database
    await workflowEngine.loadExecutionsFromDatabase();

    // Set up automation listeners
    this.setupAutomationListeners();

    this.initialized = true;
    console.log('✅ Deal Processing Service initialized');
  }

  /**
   * Seed default automations if they don't exist
   */
  private async seedDefaultAutomations(): Promise<void> {
    const existing = automationEngine.getAllAutomations();

    for (const automation of DEFAULT_AUTOMATIONS) {
      const exists = existing.some(a => a.id === automation.id);
      if (!exists) {
        await automationEngine.saveAutomation(automation);
        console.log(`✅ Created default automation: ${automation.name}`);
      }
    }
  }

  /**
   * Set up event listeners for automation
   */
  private setupAutomationListeners(): void {
    // Listen for deal received events
    automationEngine.onEvent('deal.received', async (event) => {
      console.log('📥 Deal received event:', event.metadata.dealId);
    });

    // Listen for deal scored events
    automationEngine.onEvent('deal.scored', async (event) => {
      console.log('📊 Deal scored event:', event.metadata.dealId);
    });
  }

  // ============================================================================
  // DEAL SOURCE MANAGEMENT
  // ============================================================================

  /**
   * Get all available deal source plugin types
   */
  getAvailableSourceTypes() {
    return pluginRegistry.getAllDealSourcePlugins();
  }

  /**
   * Add a new deal source
   */
  async addDealSource(config: DealSourceConfig): Promise<{ success: boolean; errors: string[] }> {
    const result = await pluginRegistry.activateDealSource(config);
    return { success: result.valid, errors: result.errors };
  }

  /**
   * Remove a deal source
   */
  async removeDealSource(sourceId: string): Promise<void> {
    await pluginRegistry.deactivateDealSource(sourceId);
  }

  /**
   * Get all active deal sources
   */
  getActiveSources() {
    return pluginRegistry.getAllActiveSources();
  }

  /**
   * Fetch deals from a specific source
   */
  async fetchDealsFromSource(sourceId: string): Promise<DealSourceResult> {
    const source = pluginRegistry.getActiveSource(sourceId);
    if (!source) {
      return {
        success: false,
        deals: [],
        errors: [{ error: `Source not found: ${sourceId}` }],
        metadata: {
          totalFound: 0,
          totalProcessed: 0,
          totalErrors: 1,
          syncDuration: 0,
        },
      };
    }

    const result = await source.plugin.fetchDeals();

    // Emit events for received deals
    for (const deal of result.deals) {
      await this.emitDealReceivedEvent(deal, sourceId);
    }

    return result;
  }

  /**
   * Handle incoming webhook for a source (email, webhook, etc.)
   * @param sourceId - The source ID
   * @param payload - The parsed payload object
   * @param headers - Request headers
   * @param rawBody - Optional raw body string for signature verification
   */
  async handleSourceWebhook(
    sourceId: string,
    payload: any,
    headers: Record<string, string>,
    rawBody?: string
  ): Promise<DealSourceResult> {
    const source = pluginRegistry.getActiveSource(sourceId);
    if (!source) {
      return {
        success: false,
        deals: [],
        errors: [{ error: `Source not found: ${sourceId}` }],
        metadata: {
          totalFound: 0,
          totalProcessed: 0,
          totalErrors: 1,
          syncDuration: 0,
        },
      };
    }

    // Check if the plugin supports webhooks
    if (typeof (source.plugin as any).handleWebhook !== 'function') {
      return {
        success: false,
        deals: [],
        errors: [{ error: `Source ${sourceId} does not support webhooks` }],
        metadata: {
          totalFound: 0,
          totalProcessed: 0,
          totalErrors: 1,
          syncDuration: 0,
        },
      };
    }

    const result = await (source.plugin as any).handleWebhook(payload, headers, rawBody);

    // Emit events for received deals
    for (const deal of result.deals) {
      await this.emitDealReceivedEvent(deal, sourceId);
    }

    return result;
  }

  /**
   * Fetch deals from all active sources
   */
  async fetchDealsFromAllSources(): Promise<Map<string, DealSourceResult>> {
    const results = new Map<string, DealSourceResult>();
    const sources = pluginRegistry.getAllActiveSources();

    const settledResults = await Promise.allSettled(
      sources.map(async (source) => {
        const result = await this.fetchDealsFromSource(source.id);
        return { sourceId: source.id, result };
      })
    );

    for (const settled of settledResults) {
      if (settled.status === 'fulfilled') {
        results.set(settled.value.sourceId, settled.value.result);
      } else {
        // Log the failure but continue with other sources
        console.error(`Failed to fetch from source:`, settled.reason);
      }
    }

    return results;
  }

  // ============================================================================
  // BUY BOX MANAGEMENT
  // ============================================================================

  /**
   * Add a buy box (saves to database)
   */
  async addBuyBox(buyBox: BuyBox): Promise<void> {
    await scoringEngine.registerBuyBox(buyBox);
  }

  /**
   * Update a buy box (updates in database)
   */
  async updateBuyBox(buyBox: BuyBox): Promise<void> {
    await scoringEngine.updateBuyBox(buyBox);
  }

  /**
   * Remove a buy box (deletes from database)
   */
  async removeBuyBox(buyBoxId: string): Promise<void> {
    await scoringEngine.removeBuyBox(buyBoxId);
  }

  /**
   * Get all buy boxes
   */
  getAllBuyBoxes(): BuyBox[] {
    return scoringEngine.getAllBuyBoxes();
  }

  /**
   * Load buy boxes from database into memory cache
   */
  async loadBuyBoxesFromDatabase(): Promise<void> {
    await scoringEngine.loadFromDatabase();
  }

  /**
   * Score a deal against all buy boxes
   */
  async scoreDeal(deal: NormalizedDeal): Promise<ScoringResult[]> {
    const results = await scoringEngine.scoreDealAgainstAllBuyBoxes(deal);

    // Emit scoring event
    await automationEngine.emitEvent({
      id: `event-${Date.now()}`,
      type: 'deal.scored',
      timestamp: new Date(),
      payload: { deal, scoringResults: results },
      metadata: { dealId: deal.externalId },
    });

    return results;
  }

  /**
   * Find best matching buy boxes for a deal
   */
  async findBestMatches(deal: NormalizedDeal, limit?: number): Promise<ScoringResult[]> {
    return scoringEngine.findBestMatches(deal, limit);
  }

  // ============================================================================
  // DEAL ANALYSIS
  // ============================================================================

  /**
   * Enrich a deal with external data
   */
  async enrichDeal(deal: NormalizedDeal, providers?: string[]): Promise<NormalizedDeal> {
    const result = await dealAnalysisService.enrichDeal(deal, providers);

    // Emit enriched event
    await automationEngine.emitEvent({
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'deal.enriched',
      timestamp: new Date(),
      payload: { deal: result.enrichedDeal, enrichmentResult: result },
      metadata: { dealId: deal.externalId },
    });

    return result.enrichedDeal;
  }

  /**
   * Analyze a deal comprehensively
   */
  async analyzeDeal(deal: NormalizedDeal): Promise<DealAnalysis> {
    const analysis = await dealAnalysisService.analyzeDeal(deal);

    // Emit analyzed event
    await automationEngine.emitEvent({
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'deal.analyzed',
      timestamp: new Date(),
      payload: { deal, analysis },
      metadata: { dealId: deal.externalId },
    });

    return analysis;
  }

  // ============================================================================
  // AUTOMATION MANAGEMENT
  // ============================================================================

  /**
   * Add an automation (persists to database)
   */
  async addAutomation(automation: Automation): Promise<void> {
    await automationEngine.saveAutomation(automation);
  }

  /**
   * Update an existing automation by ID with partial updates
   */
  async updateAutomation(automationIdOrFull: string | Automation, updates?: Partial<Automation>): Promise<Automation | undefined> {
    // Support both signatures: (id, updates) and (fullAutomation)
    if (typeof automationIdOrFull === 'string') {
      const automationId = automationIdOrFull;
      const existing = automationEngine.getAutomation(automationId);
      if (!existing) return undefined;

      const updated: Automation = {
        ...existing,
        ...updates,
        id: automationId, // Ensure ID doesn't change
        updatedAt: new Date(),
      };

      automationEngine.updateAutomation(updated);
      return updated;
    } else {
      // Full automation object passed - legacy support
      await automationEngine.saveAutomation(automationIdOrFull);
      return automationIdOrFull;
    }
  }

  /**
   * Remove an automation (removes from database)
   */
  async removeAutomation(automationId: string): Promise<void> {
    await automationEngine.deleteAutomation(automationId);
  }

  /**
   * Delete an automation (alias for removeAutomation)
   */
  async deleteAutomation(automationId: string): Promise<void> {
    await automationEngine.deleteAutomation(automationId);
  }

  /**
   * Get all automations
   */
  getAllAutomations(): Automation[] {
    return automationEngine.getAllAutomations();
  }

  /**
   * Get a single automation by ID
   */
  getAutomation(automationId: string): Automation | undefined {
    return automationEngine.getAutomation(automationId);
  }

  /**
   * Trigger an automation manually
   */
  async triggerAutomation(automationId: string, payload?: Record<string, any>) {
    return automationEngine.triggerAutomation(automationId, payload);
  }

  /**
   * Get execution history with filtering
   */
  async getExecutionHistory(options: {
    automationId?: string;
    status?: string;
    triggeredBy?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    return automationEngine.getExecutionHistory(options as any);
  }

  /**
   * Get aggregated execution statistics
   */
  async getExecutionStats(options: {
    automationId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    return automationEngine.getExecutionStats(options);
  }

  /**
   * Cleanup old execution records
   */
  async cleanupOldExecutions(retentionDays: number = 30) {
    return automationEngine.cleanupOldExecutions(retentionDays);
  }

  // ============================================================================
  // WORKFLOW MANAGEMENT
  // ============================================================================

  /**
   * Add a workflow
   */
  addWorkflow(workflow: Workflow): void {
    workflowEngine.registerWorkflow(workflow);
  }

  /**
   * Get all workflows
   */
  getAllWorkflows(): Workflow[] {
    return workflowEngine.getAllWorkflows();
  }

  /**
   * Get workflow templates
   */
  getWorkflowTemplates(): Workflow[] {
    return workflowEngine.getWorkflowTemplates();
  }

  /**
   * Start a workflow for a deal
   */
  async startWorkflow(workflowId: string, deal: NormalizedDeal) {
    return workflowEngine.startWorkflow(workflowId, deal);
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(executionId: string, input?: Record<string, any>) {
    return workflowEngine.resumeWorkflow(executionId, input);
  }

  /**
   * Get pending human reviews
   */
  getPendingReviews() {
    return workflowEngine.getPendingReviews();
  }

  /**
   * Submit a human review
   */
  async submitReview(reviewId: string, approved: boolean, notes?: string) {
    return workflowEngine.submitReview(reviewId, approved, notes);
  }

  // ============================================================================
  // FULL DEAL PROCESSING
  // ============================================================================

  /**
   * Process a deal through the full pipeline
   */
  async processDeal(
    deal: NormalizedDeal,
    options: {
      enrich?: boolean;
      score?: boolean;
      analyze?: boolean;
      startWorkflow?: string;
    } = {}
  ): Promise<DealProcessingResult> {
    let processedDeal = deal;
    const result: DealProcessingResult = { deal: processedDeal };

    // Enrich deal
    if (options.enrich !== false) {
      processedDeal = await this.enrichDeal(processedDeal);
      result.deal = processedDeal;
    }

    // Score deal
    if (options.score !== false) {
      result.scoringResults = await this.scoreDeal(processedDeal);
    }

    // Analyze deal
    if (options.analyze) {
      result.analysis = await this.analyzeDeal(processedDeal);
    }

    // Start workflow
    if (options.startWorkflow) {
      const execution = await this.startWorkflow(options.startWorkflow, processedDeal);
      result.workflowExecutionId = execution.id;
    }

    return result;
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  private async emitDealReceivedEvent(deal: NormalizedDeal, sourceId: string): Promise<void> {
    const event: SystemEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'deal.received',
      timestamp: new Date(),
      payload: { deal },
      metadata: { sourceId, dealId: deal.externalId },
    };

    await automationEngine.emitEvent(event);
  }
}

// Export singleton instance
export const dealProcessingService = new DealProcessingService();
export default dealProcessingService;
