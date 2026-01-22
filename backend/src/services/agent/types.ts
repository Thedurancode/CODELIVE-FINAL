/**
 * Agent Module Types
 *
 * Shared interfaces and types for the modular AI agent system.
 */

import type { z } from 'zod';

// =============================================================================
// FILE ATTACHMENT TYPES
// =============================================================================

/**
 * Parsed content from file analysis
 */
export interface ParsedFileContent {
  type: 'pdf' | 'image' | 'csv' | 'text' | 'excel';
  textContent?: string;
  tables?: TableData[];
  metadata?: Record<string, unknown>;
  pageCount?: number;
  wordCount?: number;
}

/**
 * Table data extracted from files
 */
export interface TableData {
  headers: string[];
  rows: string[][];
  name?: string;
}

/**
 * File attached to a chat message
 */
export interface AttachedFile {
  id: string;
  originalName: string;
  mimeType: string;
  path: string;
  size: number;
  parsed?: ParsedFileContent;
}

// =============================================================================
// BATCH OPERATION TYPES
// =============================================================================

/**
 * Progress callback for batch operations
 */
export interface BatchProgress {
  current: number;
  total: number;
  percentage: number;
  message?: string;
  itemId?: string;
}

// =============================================================================
// APPROVAL TYPES
// =============================================================================

/**
 * Approval request sent to client during streaming
 */
export interface ApprovalRequest {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reason: string;
  expiresAt: Date;
}

/**
 * Approval response from client
 */
export interface ApprovalResponse {
  approved: boolean;
  reason?: string;
}

// =============================================================================
// TOOL TYPES
// =============================================================================

/**
 * Context passed to every tool execution
 */
export interface ToolContext {
  sessionId: string;
  userId?: string;
  requestId: string;
  traceId?: string;
  // File attachments for this request
  files?: AttachedFile[];
  // Progress callback for batch operations
  emitProgress?: (progress: BatchProgress) => void;
  // Approval callback for human-in-the-loop
  requestApproval?: (request: ApprovalRequest) => Promise<ApprovalResponse>;
}

/**
 * Standardized tool result format
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  cached?: boolean;
  durationMs?: number;
  /**
   * UI component markers for Generative UI rendering.
   * These are JSON strings that the frontend will parse and render as React components.
   * Example: ['{"type":"property_list","data":{"properties":[...]}}']
   */
  uiComponents?: string[];
}

/**
 * Tool category for organization and metrics
 */
export type ToolCategory =
  | 'property'
  | 'analysis'
  | 'buybox'
  | 'market_data'
  | 'pipeline'
  | 'portfolio'
  | 'knowledge'
  | 'automation'
  | 'contract'
  | 'web'
  | 'settings'
  | 'communication'
  | 'offer'
  | 'file'
  | 'scheduling'
  | 'contacts'
  | 'mcp'
  | 'calendar'
  | 'batch'
  | 'voice';

/**
 * Tool definition for registration
 */
export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: ToolCategory;
  schema: z.ZodObject<any>;
  handler: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
  cacheable?: boolean;
  cacheTTL?: number; // seconds

  // Human approval configuration
  requiresApproval?: boolean | ((input: TInput) => boolean);
  approvalReason?: string;
  approvalTimeout?: number; // seconds, default 300 (5 min)

  // Batch operation support
  supportsProgress?: boolean;
}

/**
 * Tool execution event for streaming
 */
export interface ToolExecutionEvent {
  type: 'tool_start' | 'tool_end' | 'tool_error' | 'tool_progress';
  tool: string;
  message?: string;
  durationMs?: number;
  cached?: boolean;
  progress?: number; // 0-100 for multi-step tools
}

// =============================================================================
// CONVERSATION TYPES
// =============================================================================

/**
 * Single conversation message entry
 */
export interface ConversationEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Cache entry with timestamp for TTL management
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// =============================================================================
// SAFEGUARD TYPES
// =============================================================================

/**
 * Circuit breaker state machine
 */
export type CircuitBreakerStateType = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker internal state
 */
export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: CircuitBreakerStateType;
  halfOpenSuccesses: number;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  date: string; // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  totalCost: number; // Estimated USD
}

/**
 * Complete safeguard status for health checks
 */
export interface SafeguardStatus {
  circuitBreaker: {
    state: string;
    failures: number;
    lastFailure: Date | null;
  };
  requests: {
    global: number;
    sessions: number;
    maxGlobal: number;
  };
  tokenUsage: TokenUsage & {
    remaining: number;
    percentUsed: number;
  };
  cache: {
    conversations: number;
    summaries: number;
    maxSize: number;
  };
}

// =============================================================================
// AGENT SERVICE TYPES
// =============================================================================

/**
 * Agent health status including all subsystems
 */
export interface AgentHealthStatus extends SafeguardStatus {
  ready: boolean;
  model: string;
  provider: string;
  toolCount: number;
}

/**
 * Stream event types for chat streaming
 */
export interface StreamEvent {
  type:
    | 'tool_start'
    | 'tool_end'
    | 'tool_progress'
    | 'text'
    | 'error'
    | 'done'
    | 'approval_required'
    | 'approval_resolved';
  tool?: string;
  message?: string;
  content?: string;
  progress?: number;
  durationMs?: number;
  cached?: boolean;
  // Approval-specific fields
  approvalId?: string;
  approvalReason?: string;
  approvalInput?: Record<string, unknown>;
  approvalStatus?: 'approved' | 'rejected' | 'expired';
}

// =============================================================================
// TRACING TYPES
// =============================================================================

/**
 * Trace span for observability
 */
export interface TraceSpan {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  metadata?: Record<string, any>;
  children: TraceSpan[];
  status: 'running' | 'success' | 'error';
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Conversation optimization settings
 */
export const CONVERSATION_SETTINGS = {
  MAX_HISTORY_MESSAGES: 100,
  RECENT_MESSAGES_TO_KEEP: 10,
  SUMMARIZATION_THRESHOLD: 15,
  SUMMARIZATION_MODEL: 'gpt-4o-mini',
} as const;

/**
 * Cache TTL settings (in milliseconds)
 */
export const CACHE_SETTINGS = {
  CONVERSATION_CACHE_TTL: 30 * 60 * 1000, // 30 minutes
  SUMMARY_CACHE_TTL: 60 * 60 * 1000, // 1 hour
  CACHE_CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
  MAX_CACHE_SIZE: 1000,
} as const;

/**
 * Safeguard settings
 */
export const SAFEGUARD_SETTINGS = {
  LLM_TIMEOUT_MS: 120 * 1000, // 120 seconds
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_RESET_MS: 60 * 1000, // 1 minute
  CIRCUIT_BREAKER_HALF_OPEN_REQUESTS: 2,
  MAX_CONCURRENT_REQUESTS_PER_SESSION: 1,
  MAX_GLOBAL_CONCURRENT_REQUESTS: 100,
  DAILY_TOKEN_LIMIT: 1_000_000,
} as const;

/**
 * Token cost estimates (per 1K tokens)
 */
export const TOKEN_COSTS = {
  INPUT_PER_1K: 0.003, // $3 per 1M input
  OUTPUT_PER_1K: 0.015, // $15 per 1M output
} as const;

/**
 * Default tool result cache TTLs by tool name (seconds)
 */
export const TOOL_CACHE_TTLS: Record<string, number> = {
  search_properties: 15 * 60, // 15 minutes
  get_property_details: 30 * 60, // 30 minutes
  get_property_count: 15 * 60, // 15 minutes
  get_recent_deals: 5 * 60, // 5 minutes
  list_buyboxes: 60 * 60, // 1 hour
  get_buybox_details: 60 * 60, // 1 hour
  lookup_market_data: 6 * 60 * 60, // 6 hours
  get_rental_market_trends: 24 * 60 * 60, // 24 hours
  get_market_stats: 60 * 60, // 1 hour
  list_auction_sites: 24 * 60 * 60, // 24 hours
  list_contract_templates: 60 * 60, // 1 hour
  get_settings: 30 * 60, // 30 minutes
  list_automations: 30 * 60, // 30 minutes
  get_knowledge_stats: 60 * 60, // 1 hour
  get_email_status: 5 * 60, // 5 minutes
  get_offer_stats: 5 * 60, // 5 minutes
};
