/**
 * Dispotree Extensible Plugin System - Type Definitions
 *
 * This module defines all interfaces for the extensible architecture:
 * - Deal Sources: Pull deals from various wholesalers/platforms
 * - Buy Box Scoring: Configurable scoring criteria
 * - Automations: Event-driven actions and workflows
 */

import { PropertyType, MarketContact } from '../../types';

// ============================================================================
// DEAL SOURCE TYPES
// ============================================================================

export interface DealSourceConfig {
  id: string;
  name: string;
  type: DealSourceType;
  enabled: boolean;
  credentials?: Record<string, string>;
  settings: Record<string, any>;
  pollInterval?: number; // in milliseconds, for polling sources
  webhookUrl?: string; // for webhook-based sources
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type DealSourceType =
  | 'api'           // REST API integration
  | 'csv'           // CSV file upload/import
  | 'email'         // Email parsing (forwarded wholesaler emails)
  | 'webhook'       // Incoming webhooks
  | 'scraper'       // Web scraping (with permission)
  | 'firecrawl'     // Firecrawl-powered web crawler
  | 'pdf'           // PDF file import with OCR and AI extraction
  | 'mls'           // MLS feed integration
  | 'marketplace'   // External marketplaces (DealMachine, PropStream, etc.)
  | 'manual'        // Manual entry
  | 'custom';       // Custom plugin

export interface RawDeal {
  sourceId: string;
  sourceName: string;
  externalId?: string;
  rawData: Record<string, any>;
  receivedAt: Date;
}

export interface NormalizedDeal {
  // Core identification
  externalId?: string;
  sourceId: string;
  sourceName: string;

  // Property details
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    county?: string;
  };
  propertyType?: string;

  // Physical characteristics
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  lotSize?: number;
  yearBuilt?: number;

  // Financial
  askingPrice: number;
  arv?: number;
  repairEstimate?: number;
  monthlyRent?: number;

  // Wholesaler info
  wholesalerName?: string;
  wholesalerEmail?: string;
  wholesalerPhone?: string;
  wholesalerCompany?: string;

  // Contract details
  contractExpiration?: Date;
  assignmentFee?: number;
  emDeposit?: number;

  // Occupancy
  occupancyStatus?: 'vacant' | 'occupied' | 'tenant' | 'owner' | 'unknown';

  // Additional data
  description?: string;
  photos?: string[];
  documents?: string[];

  // Metadata
  rawData: Record<string, any>;
  normalizedAt: Date;
  confidence: number; // 0-100, how confident we are in the normalization
}

export interface DealSourceResult {
  success: boolean;
  deals: NormalizedDeal[];
  errors: DealSourceError[];
  metadata: {
    totalFound: number;
    totalProcessed: number;
    totalErrors: number;
    syncDuration: number;
    nextCursor?: string;
  };
}

export interface DealSourceError {
  externalId?: string;
  error: string;
  rawData?: Record<string, any>;
}

// ============================================================================
// DEAL SOURCE PLUGIN INTERFACE
// ============================================================================

export interface IDealSourcePlugin {
  /**
   * Unique identifier for this plugin type
   */
  readonly type: DealSourceType;

  /**
   * Human-readable name
   */
  readonly name: string;

  /**
   * Plugin version
   */
  readonly version: string;

  /**
   * Description of what this plugin does
   */
  readonly description: string;

  /**
   * Configuration schema for this plugin
   */
  readonly configSchema: PluginConfigSchema;

  /**
   * Initialize the plugin with configuration
   */
  initialize(config: DealSourceConfig): Promise<void>;

  /**
   * Validate the configuration
   */
  validateConfig(config: DealSourceConfig): Promise<ValidationResult>;

  /**
   * Test the connection/credentials
   */
  testConnection(config: DealSourceConfig): Promise<ConnectionTestResult>;

  /**
   * Fetch deals from the source
   */
  fetchDeals(options?: FetchOptions): Promise<DealSourceResult>;

  /**
   * Normalize a raw deal to our standard format
   */
  normalizeDeal(rawDeal: RawDeal): Promise<NormalizedDeal>;

  /**
   * Handle incoming webhook (for webhook-based sources)
   * @param payload - The parsed payload object
   * @param headers - Request headers
   * @param rawBody - Optional raw body string for signature verification
   */
  handleWebhook?(payload: any, headers: Record<string, string>, rawBody?: string): Promise<DealSourceResult>;

  /**
   * Cleanup resources
   */
  dispose(): Promise<void>;
}

export interface PluginConfigSchema {
  fields: PluginConfigField[];
}

export interface PluginConfigField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'password' | 'textarea' | 'json';
  required: boolean;
  default?: any;
  options?: { value: string; label: string }[];
  description?: string;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, any>;
}

export interface FetchOptions {
  cursor?: string;
  limit?: number;
  since?: Date;
  filters?: Record<string, any>;
}

// ============================================================================
// BUY BOX SCORING TYPES
// ============================================================================

export interface BuyBox {
  id: string;
  name: string;
  description?: string;
  fundName?: string;
  fundType?: string;
  contactEmail?: string;
  contactPhone?: string;
  marketContacts?: MarketContact[];
  enabled: boolean;
  priority: number; // Higher = more important
  criteria: BuyBoxCriteria;
  scoringWeights: ScoringWeights;
  autoSubmit: boolean;
  autoSubmitThreshold: number; // Minimum score to auto-submit
  createdAt: Date;
  updatedAt: Date;
}

export interface BuyBoxCriteria {
  // Geographic
  states?: string[];
  counties?: string[];
  cities?: string[];
  zipCodes?: string[];
  excludeZipCodes?: string[];

  // Property type
  propertyTypes?: PropertyType[];
  excludePropertyTypes?: PropertyType[];

  // Physical characteristics
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minSqft?: number;
  maxSqft?: number;
  minLivingSpaceSqFt?: number;
  maxLivingSpaceSqFt?: number;
  minLotSize?: number;
  maxLotSize?: number;
  minYearBuilt?: number;
  maxYearBuilt?: number;

  // Financial
  minPrice?: number;
  maxPrice?: number;
  minArv?: number;
  maxArv?: number;
  maxArvPercentage?: number; // Max price as % of ARV
  minArvSpread?: number; // Minimum spread between price and ARV
  minCapRate?: number; // Minimum cap rate for rentals
  minRentMultiplier?: number; // Price / Monthly Rent
  maxRepairEstimate?: number;
  maxDaysOnMarket?: number;

  // Occupancy preferences
  preferVacant?: boolean;
  allowOccupied?: boolean;
  allowTenant?: boolean;

  // HOA preferences
  allowHoa?: boolean;
  maxHoaMonthly?: number;

  // Other preferences
  allowPool?: boolean;
  allowSeptic?: boolean;
  allowWell?: boolean;
  requirePhotos?: boolean;
  minPhotoCount?: number;

  // Custom criteria (for extensibility)
  customCriteria?: Array<{
    text: string;
    enabled: boolean;
    weight?: number;
  }>;
  customCriteriaParsed?: Array<{
    field: string;
    operator: string;
    value: unknown;
    confidence: number;
  }>;
}

// Extended custom criterion for advanced use cases
export interface CustomCriterion {
  id?: string;
  name?: string;
  field: string; // JSON path to field in deal
  operator: CriterionOperator | string;
  value: unknown;
  weight?: number;
  confidence?: number;
  required?: boolean;
}

export type CriterionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'regex'
  | 'exists'
  | 'not_exists';

export interface ScoringWeights {
  geographic: number;      // Default: 25
  price: number;           // Default: 20
  propertyType: number;    // Default: 10
  bedrooms: number;        // Default: 5
  bathrooms: number;       // Default: 5
  yearBuilt: number;       // Default: 5
  occupancy: number;       // Default: 5
  hoa: number;             // Default: 5
  photos: number;          // Default: 5
  condition: number;       // Default: 5
  riskFactors: number;     // Default: 5
  strategyMetrics: number; // Default: 5
  custom: number;          // Default: 0 (for custom criteria)
  marketValue?: number;    // Default: 10 (market data scoring)
}

export interface ScoringResult {
  buyBoxId: string;
  buyBoxName: string;
  fundName?: string;
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  matchType: 'strong' | 'moderate' | 'weak' | 'no_match';
  breakdown: ScoreBreakdown[];
  passedHardRequirements: boolean;
  failedHardRequirements: string[];
  recommendation: string;
  autoSubmitEligible: boolean;
  // Market contact for this match (automatically resolved from property location)
  marketContact?: MarketContact;
  contactMatchedOn?: string; // What location field matched (e.g., "Atlanta, GA")
}

export interface ScoreBreakdown {
  criterion: string;
  weight: number;
  maxPoints: number;
  earnedPoints: number;
  passed: boolean;
  details: string;
}

// ============================================================================
// AUTOMATION TYPES
// ============================================================================

export interface Automation {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  cooldown?: number; // Minimum time between executions (ms)
  maxExecutionsPerHour?: number;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  executionCount: number;
}

export type AutomationTriggerType =
  | 'deal_received'        // New deal from any source
  | 'deal_enriched'        // Deal has been enriched with external data
  | 'deal_analyzed'        // Deal has been analyzed by AI
  | 'deal_scored'          // Deal has been scored
  | 'deal_matched'         // Deal matched a buy box
  | 'compliance_checked'   // Compliance check completed
  | 'score_threshold'      // Score crossed a threshold
  | 'deal_updated'         // Deal was updated
  | 'deal_expired'         // Contract expiration approaching
  | 'webhook_received'     // External webhook received
  | 'schedule'             // Scheduled trigger (cron)
  | 'manual'               // Manual trigger
  // New triggers
  | 'price_dropped'        // Asking price decreased
  | 'deal_stale'           // Deal sitting without action (7+ days)
  | 'offer_received'       // Buyer submitted an offer
  | 'offer_accepted'       // Offer was accepted
  | 'offer_rejected'       // Offer was rejected
  | 'pipeline_stage_changed' // Deal moved in pipeline
  | 'buybox_threshold_met' // Score crossed 80%+ threshold
  | 'market_comps_updated' // New comparables found
  | 'schedule_daily'       // Daily scheduled trigger
  | 'schedule_weekly';     // Weekly scheduled trigger

export interface AutomationTrigger {
  type: AutomationTriggerType;
  config: Record<string, any>;
}

export interface AutomationCondition {
  id: string;
  field: string;
  operator: CriterionOperator;
  value: any;
  logicalOperator?: 'and' | 'or';
}

export type AutomationActionType =
  | 'send_email'
  | 'send_webhook'
  | 'update_deal'
  | 'create_task'
  | 'assign_to_user'
  | 'add_tag'
  | 'remove_tag'
  | 'submit_to_marketplace'
  | 'run_compliance_check'
  | 'score_against_buybox'
  | 'enrich_deal'
  | 'send_notification'
  | 'log_event'
  | 'custom_function'
  // New actions
  | 'send_sms'              // Send SMS notification
  | 'send_slack'            // Send Slack message
  | 'send_discord'          // Send Discord message
  | 'calculate_mao'         // Calculate Max Allowable Offer
  | 'generate_offer_letter' // Generate PDF offer letter
  | 'create_followup'       // Schedule follow-up reminder
  | 'run_comps_analysis'    // Find comparable sales
  | 'export_to_crm'         // Push to external CRM
  // Document automation
  | 'send_document'         // Send state-specific compliance document via DocuSeal
  // Flow control
  | 'conditional';          // Conditional branching (IF/ELSE IF/ELSE)

export interface AutomationAction {
  id: string;
  type: AutomationActionType;
  config: Record<string, any>;
  order: number;
  continueOnError?: boolean;
}

/**
 * Configuration for the 'conditional' action type.
 * Enables IF/ELSE IF/ELSE branching within automation workflows.
 */
export interface ConditionalActionConfig {
  branches: ConditionalBranch[];
}

/**
 * A single branch in a conditional action.
 * The first branch with matching conditions (or empty conditions for ELSE) is executed.
 */
export interface ConditionalBranch {
  /** Optional label for debugging and logging */
  name?: string;
  /** Conditions to evaluate. Empty array acts as ELSE (always matches) */
  conditions: AutomationCondition[];
  /** Actions to execute if this branch matches */
  actions: AutomationAction[];
}

export interface AutomationExecutionResult {
  automationId: string;
  triggerId: string;
  success: boolean;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  actionsExecuted: ActionExecutionResult[];
  error?: string;
}

export interface ActionExecutionResult {
  actionId: string;
  actionType: AutomationActionType;
  success: boolean;
  result?: any;
  error?: string;
  durationMs: number;
}

// ============================================================================
// EVENT SYSTEM TYPES
// ============================================================================

export type EventType =
  | 'deal.received'
  | 'deal.normalized'
  | 'deal.created'
  | 'deal.updated'
  | 'deal.deleted'
  | 'deal.enriched'
  | 'deal.analyzed'
  | 'deal.scored'
  | 'deal.matched'
  | 'deal.submitted'
  | 'compliance.started'
  | 'compliance.completed'
  | 'source.synced'
  | 'source.error'
  | 'automation.triggered'
  | 'automation.completed'
  | 'automation.error'
  // New events
  | 'deal.price_dropped'
  | 'deal.stale'
  | 'offer.received'
  | 'offer.accepted'
  | 'offer.rejected'
  | 'pipeline.stage_changed'
  | 'buybox.threshold_met'
  | 'market.comps_updated'
  | 'schedule.daily'
  | 'schedule.weekly';

export interface SystemEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  payload: Record<string, any>;
  metadata: {
    sourceId?: string;
    dealId?: string;
    userId?: string;
    automationId?: string;
  };
}

export interface EventHandler {
  eventType: EventType | EventType[];
  handler: (event: SystemEvent) => Promise<void>;
  priority?: number;
}

// ============================================================================
// WORKFLOW TYPES
// ============================================================================

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  steps: WorkflowStep[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  config: Record<string, any>;
  nextSteps: WorkflowTransition[];
}

export type WorkflowStepType =
  | 'start'
  | 'end'
  | 'action'
  | 'condition'
  | 'parallel'
  | 'wait'
  | 'human_review';

export interface WorkflowTransition {
  targetStepId: string;
  condition?: AutomationCondition;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  dealId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  currentStepId: string;
  stepHistory: WorkflowStepExecution[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface WorkflowStepExecution {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

// Re-export MarketContact from shared types
export { MarketContact } from '../../types';
