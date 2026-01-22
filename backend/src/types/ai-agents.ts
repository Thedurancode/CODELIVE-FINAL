/**
 * AI Agent System Type Definitions
 * Comprehensive types for all AI agents and automation features
 */

// =====================================================
// Compliance Agent Types
// =====================================================

export type ComplianceStatus = 'Green' | 'Yellow' | 'Red';

export interface ComplianceIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  field?: string;
  suggestedFix?: string;
}

export interface ExtractedContractData {
  sellerName?: string;
  buyerEntity?: string;
  signerName?: string;
  assignable?: boolean;
  marketingClauseFound?: boolean;
  contractDate?: string;
  expirationDate?: string;
  purchasePrice?: number;
  propertyAddress?: string;
  earnestMoney?: number;
  closingDate?: string;
}

export interface ComplianceCheck {
  id?: number;
  property_id: number;
  check_type: 'contract_analysis' | 'seller_verification' | 'entity_verification' | 'daisy_chain_check';
  status: ComplianceStatus;
  issues: ComplianceIssue[];
  extracted_data: ExtractedContractData;
  recommendations: string[];
  confidence_score: number;
  reviewed_by?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface ComplianceAnalysisRequest {
  propertyId: number;
  contractPDF?: string; // base64 encoded
  contractURL?: string;
  wholesalerEntityName?: string;
  expectedSellerName?: string;
}

export interface ComplianceAnalysisResponse {
  status: ComplianceStatus;
  issues: ComplianceIssue[];
  extractedData: ExtractedContractData;
  recommendations: string[];
  confidenceScore: number;
  needsHumanReview: boolean;
  nextSteps: string[];
}

// =====================================================
// Underwriting & Data Enrichment Types
// =====================================================

export type DataSource = 'zillow' | 'attom' | 'rentometer' | 'google_maps' | 'county_assessor' | 'mls' | 'manual';

export interface EnrichedField {
  fieldName: string;
  oldValue: any;
  newValue: any;
  source: DataSource;
  confidence: number;
  autoApplied: boolean;
}

export interface PropertyComparable {
  address: string;
  city: string;
  state: string;
  distance: number; // miles
  soldPrice: number;
  soldDate: string;
  bedroomCount: number;
  bathroomCount: number;
  livingSpaceSqFt: number;
  similarity: number; // 0-100
}

export interface ARVCalculation {
  arv: number;
  confidence: number;
  breakdown: {
    zillow?: number;
    comps?: number;
    assessor?: number;
    bpo?: number;
  };
  weights: {
    zillow: number;
    comps: number;
    assessor: number;
    bpo: number;
  };
}

export interface RentEstimate {
  estimatedRent: number;
  confidenceRange: {
    low: number;
    high: number;
  };
  source: DataSource;
  comparables: PropertyComparable[];
}

export interface EnrichmentRequest {
  propertyId: number;
  fieldsToEnrich?: string[];
  autoApply?: boolean;
}

export interface EnrichmentResponse {
  propertyId: number;
  enrichedFields: EnrichedField[];
  arv?: ARVCalculation;
  rentEstimate?: RentEstimate;
  comparables: PropertyComparable[];
  totalFieldsEnriched: number;
  confidenceScore: number;
}

export interface PropertyEnrichmentLog {
  id?: number;
  property_id: number;
  field_name: string;
  old_value?: string;
  new_value: string;
  data_source: DataSource;
  confidence_score: number;
  auto_applied: boolean;
  reviewed_by?: number;
  created_at?: Date;
}

// =====================================================
// Buy Box & Fund Matching Types
// =====================================================

export interface BuyBoxCriteria {
  states: string[];
  minBeds: number;
  maxBeds: number;
  minBaths: number;
  maxBaths: number;
  minPrice: number;
  maxPrice: number;
  minYearBuilt: number;
  propertyTypes: string[];
  mustHavePool?: boolean;
  noHOA?: boolean;
  preferVacant?: boolean;
  minLivingSpaceSqFt?: number;
  maxLivingSpaceSqFt?: number;
  mustBeCash?: boolean;
  maxDaysOnMarket?: number;
}

export interface HedgeFundBuyBox {
  id?: number;
  fund_name: string;
  fund_type: 'Institutional' | 'Family Office' | 'REIT' | 'Private Equity' | 'Individual Investor';
  criteria: BuyBoxCriteria;
  contact_email: string;
  contact_phone?: string;
  contact_name?: string;
  submission_method: 'email' | 'api' | 'portal';
  api_endpoint?: string;
  api_key_encrypted?: string;
  active: boolean;
  priority: number;
  created_at?: Date;
  updated_at?: Date;
}

export type MatchType = 'strong' | 'moderate' | 'weak';

/**
 * Predicted engagement probabilities (Twitter-inspired)
 * Replaces arbitrary point scores with actionable probability predictions
 */
export interface PredictedEngagement {
  probClose: number;       // Probability investor will close (0-1)
  probBid: number;         // Probability investor will bid (0-1)
  probSave: number;        // Probability investor will save/bookmark (0-1)
  probPass: number;        // Probability investor will pass (0-1)
  confidence: number;      // Model confidence in predictions (0-1)
  modelVersion: string;    // Version of the scoring model used
  factors: EngagementFactor[];  // Factors that influenced the prediction
}

export interface EngagementFactor {
  name: string;            // Factor name (e.g., "price_alignment", "location_match")
  contribution: number;    // How much this factor contributed to the score (-1 to 1)
  description: string;     // Human-readable explanation
}

export interface BuyBoxMatch {
  fundId: number;
  fundName: string;
  score: number;
  matchType: MatchType;
  reasons: string[];
  criteriaMatched: string[];
  criteriaMissed: string[];
  // New probability-based scoring
  engagement?: PredictedEngagement;
}

export interface BuyBoxMatchRequest {
  propertyId: number;
  minScore?: number;
}

export interface BuyBoxMatchResponse {
  propertyId: number;
  propertyAddress: string;
  matches: BuyBoxMatch[];
  strongMatches: BuyBoxMatch[];
  autoSubmitRecommendation: number[];
  totalMatches: number;
}

export interface FundSubmission {
  id?: number;
  property_id: number;
  fund_id: number;
  match_score: number;
  match_type: MatchType;
  submission_method: 'email' | 'api' | 'csv_download';
  submission_data: any;
  submitted_at?: Date;
  response_received: boolean;
  response_received_at?: Date;
  response_type?: 'interested' | 'passed' | 'offer_made' | 'no_response';
  offer_amount?: number;
  offer_details?: any;
  status: 'pending' | 'interested' | 'passed' | 'offer_made' | 'accepted' | 'rejected';
  notes?: string;
  created_at?: Date;
  updated_at?: Date;
}

// =====================================================
// Buyer Communication & Interaction Types
// =====================================================

export type InteractionType = 'view' | 'question' | 'offer' | 'message' | 'swipe_right' | 'swipe_left' | 'photo_view' | 'document_download';

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface BuyerInteraction {
  id?: number;
  property_id: number;
  buyer_id: number;
  interaction_type: InteractionType;
  interaction_data?: any;
  message_content?: string;
  ai_response?: string;
  response_time_seconds?: number;
  sentiment?: Sentiment;
  flagged_for_review: boolean;
  flag_reason?: string;
  created_at?: Date;
}

export interface ChatMessage {
  role: 'buyer' | 'seller' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}

export interface ChatContext {
  propertyId: number;
  buyerId: number;
  conversationHistory: ChatMessage[];
  propertyDetails: any;
  dealStatus: string;
}

export interface ChatRequest {
  propertyId: number;
  buyerId: number;
  message: string;
}

export interface ChatResponse {
  response: string;
  sentiment: Sentiment;
  needsEscalation: boolean;
  escalationReason?: string;
  suggestedActions?: string[];
}

// =====================================================
// Buyer Profile & Behavior Types
// =====================================================

export type BuyerTier = 'hot' | 'warm' | 'cold';

export type BuyerType = 'individual' | 'investor' | 'hedge_fund' | 'flipper' | 'wholesaler';

export interface BuyerProfile {
  id?: number;
  buyer_email: string;
  buyer_name?: string;
  buyer_type: BuyerType;
  total_views: number;
  total_questions: number;
  total_offers: number;
  total_closed_deals: number;
  avg_offer_to_ask_ratio?: number;
  avg_response_time_hours?: number;
  preferred_states: string[];
  preferred_property_types: string[];
  min_price?: number;
  max_price?: number;
  cash_buyer: boolean;
  behavior_score: number;
  tier: BuyerTier;
  last_activity_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface BuyerBehaviorFeatures {
  offerToAskRatio: number;
  closingRate: number;
  avgResponseTime: number;
  viewDuration: number;
  photoViewCount: number;
  questionCount: number;
  timeSinceView: number;
  offerAmount: number;
  offerToARV: number;
  cashBuyer: boolean;
}

export interface OfferRankingRequest {
  offers: Array<{
    buyerId: number;
    offerAmount: number;
    financingType: 'cash' | 'hard_money' | 'conventional';
    closingTimeline: number;
  }>;
  propertyId: number;
}

export interface RankedOffer {
  buyerId: number;
  buyerName: string;
  offerAmount: number;
  score: number;
  tier: BuyerTier;
  closingRate: number;
  predictions: {
    likelyToClose: boolean;
    expectedCloseTimeDays: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  recommendedAction: 'prioritize' | 'standard' | 'monitor';
}

export interface OfferRankingResponse {
  propertyId: number;
  rankedOffers: RankedOffer[];
  topOffer: RankedOffer;
  recommendations: string[];
}

// =====================================================
// Guardrail & Compliance Enforcement Types
// =====================================================

export type ViolationType =
  | 'phone_number_sharing'
  | 'email_sharing'
  | 'circumvention_attempt'
  | 'unlicensed_brokerage'
  | 'harassment'
  | 'fraud_attempt'
  | 'inappropriate_content';

export type ViolationAction = 'allow' | 'redact_and_warn' | 'block_and_escalate' | 'escalate_to_human';

export interface Violation {
  type: ViolationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: ViolationAction;
  matchedPattern?: string;
  context?: string;
}

export interface GuardrailCheckRequest {
  message: string;
  conversationContext?: ChatMessage[];
  buyerId?: number;
  propertyId?: number;
}

export interface GuardrailCheckResponse {
  allowed: boolean;
  violations: Violation[];
  redactedMessage?: string;
  warningMessage?: string;
  escalateToHuman: boolean;
}

// =====================================================
// AI Agent Audit Log Types
// =====================================================

export type AgentType =
  | 'compliance'
  | 'underwriting'
  | 'buybox'
  | 'communication'
  | 'guardrail'
  | 'offer_ranking'
  | 'workflow_orchestrator';

export type EntityType = 'property' | 'buyer' | 'fund' | 'conversation' | 'offer';

export interface AIAgentAuditLog {
  id?: number;
  agent_type: AgentType;
  action: string;
  entity_type: EntityType;
  entity_id: number;
  input_data?: any;
  output_data?: any;
  success: boolean;
  error_message?: string;
  execution_time_ms: number;
  created_at?: Date;
}

// =====================================================
// Workflow Orchestrator Types
// =====================================================

export type WorkflowStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

export interface WorkflowStep {
  stepName: string;
  agentType: AgentType;
  status: WorkflowStatus;
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: string;
}

export interface PropertyWorkflow {
  propertyId: number;
  currentStep: string;
  steps: WorkflowStep[];
  overallStatus: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// API Response Wrappers
// =====================================================

export interface AIAgentResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  executionTimeMs: number;
}

export interface BatchProcessingResult<T> {
  totalProcessed: number;
  successful: number;
  failed: number;
  results: T[];
  errors: Array<{ entityId: number; error: string }>;
}
