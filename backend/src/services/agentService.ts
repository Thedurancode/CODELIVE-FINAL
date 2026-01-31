/**
 * AI Agent Service - Enhanced LangChain-powered conversational agent
 *
 * Features:
 * - Database-persisted conversation memory
 * - 20+ tools for comprehensive real estate management
 * - Bulk import from listing URLs
 * - Deal comparison and similarity analysis
 * - Buy box creation via conversation
 * - Fund email notifications
 * - Smart deal insights and recommendations
 */

import { createAgent, tool, HumanMessage, AIMessage, SystemMessage } from 'langchain';
import type { BaseMessage } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import Property from '../models/Property';
import HedgeFundBuyBox from '../models/HedgeFundBuyBox';
import DealOffer from '../models/DealOffer';
import ConversationHistory from '../models/ConversationHistory';
import Conversation from '../models/Conversation';
import Contact from '../models/Contact';
import PropertyContact from '../models/PropertyContact';
import { Op, fn, col, literal, Sequelize } from 'sequelize';
import { propertyService } from './propertyService';
import { dealIntakeService } from './DealIntakeService';
import { dealProcessingService } from '../plugins';
import { AuctionSubmissionPlugin } from '../plugins/browser';
import Firecrawl from '@mendable/firecrawl-js';
import { knowledgeService } from './knowledge';
import { MarketDataService } from './MarketDataService';
import { redisService, CACHE_PREFIX, CACHE_TTL } from './RedisService';
import { memoryService } from './MemoryService';
import { scheduledTaskService } from './agent/ScheduledTaskService';
import { pipelineService } from './PipelineService';
import { portfolioService } from './PortfolioService';
import { winLossService } from './WinLossService';
import { agentMetricsService } from './AgentMetricsService';
import { docuSealService } from './DocuSealService';
import { dealIntelligenceService } from './DealIntelligenceService';
import { batchFetchProperties, batchFetchBuyBoxes, extractIds } from '../utils/batchQueries';
import {
  buildConversationContext,
  formatContextAsPrompt,
  extractEntityReferences,
} from './agent/contextLoader';
import { dealNoteService } from './DealNoteService';
import { complianceSpecAIService } from './ComplianceSpecAIService';
import { projectService } from './ProjectService';
import { projectContactService } from './ProjectContactService';
import { gitHubService } from './GitHubService';
import Project from '../models/Project';
import ProjectNote from '../models/ProjectNote';
import Task from '../models/Task';

// =============================================================================
// PROPERTY CARD MARKERS
// =============================================================================
// Helper functions to emit structured property data for frontend rendering

interface PropertyCardData {
  id: number;
  propertyId?: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  arv?: number;
  bedroomCount?: number;
  bathroomCount?: number;
  livingSpaceSqFt?: number;
  yearBuilt?: number;
  status?: string;
  photoLinks?: string[];
  propertyType?: string;
}

/**
 * Generate a property card marker for frontend rendering
 */
function createPropertyCardMarker(property: any): string {
  const cardData: PropertyCardData = {
    id: property.id,
    propertyId: property.propertyId,
    address: property.address?.street
      ? `${property.address.houseNumber || ''} ${property.address.street}`.trim()
      : property.address || '',
    city: property.city,
    state: property.state,
    zip: property.zip,
    price: property.mlsListingPrice || property.buyItNowPrice || property.price,
    arv: property.arv,
    bedroomCount: property.bedroomCount || property.bedrooms,
    bathroomCount: property.bathroomCount || property.bathrooms,
    livingSpaceSqFt: property.livingSpaceSqFt || property.sqft,
    yearBuilt: property.yearBuilt,
    status: property.status,
    photoLinks: property.photoLinks?.slice(0, 3),
    propertyType: property.propertyType,
  };

  return `{"type":"property_card","data":${JSON.stringify(cardData)}}`;
}

/**
 * Generate property card markers for multiple properties
 */
function createPropertyCardsSection(properties: any[]): string {
  if (!properties || properties.length === 0) return '';
  return properties.map(createPropertyCardMarker).join('\n');
}

// Get the singleton instance
const auctionSubmissionPlugin = new AuctionSubmissionPlugin();

// In-memory cache for active conversations (backed by database)
// Includes timestamp for TTL-based cleanup
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const conversationCache: Map<string, CacheEntry<BaseMessage[]>> = new Map();

// Cache for conversation summaries with TTL
const summaryCache: Map<string, CacheEntry<string>> = new Map();

// =============================================================================
// CONVERSATION CONTEXT OPTIMIZATION SETTINGS
// =============================================================================
// These settings control how conversation history is managed to optimize token usage

// Total messages to load from database
const MAX_HISTORY_MESSAGES = 100;

// Number of recent messages to keep verbatim (not summarized)
const RECENT_MESSAGES_TO_KEEP = 10;

// Threshold: if total messages exceed this, older messages get summarized
const SUMMARIZATION_THRESHOLD = 15;

// Model to use for summarization (smaller/cheaper model)
const SUMMARIZATION_MODEL = 'gpt-4o-mini';

// Cache TTL settings (in milliseconds)
const CONVERSATION_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const SUMMARY_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // Run cleanup every 5 minutes
const MAX_CACHE_SIZE = 1000; // Maximum entries per cache

// =============================================================================
// PRODUCTION SAFEGUARDS
// =============================================================================

// LLM timeout - prevents hanging requests
const LLM_TIMEOUT_MS = 120 * 1000; // 120 seconds (LLM calls can be slow with tool usage)

// Circuit breaker settings
const CIRCUIT_BREAKER_THRESHOLD = 5; // Failures before opening circuit
const CIRCUIT_BREAKER_RESET_MS = 60 * 1000; // 1 minute before trying again
const CIRCUIT_BREAKER_HALF_OPEN_REQUESTS = 2; // Test requests when half-open

// Concurrent request limiting
const MAX_CONCURRENT_REQUESTS_PER_SESSION = 1; // Only 1 active request per session
const MAX_GLOBAL_CONCURRENT_REQUESTS = 100; // Max total concurrent LLM requests

// Token usage tracking
const DAILY_TOKEN_LIMIT = 1_000_000; // Daily token budget (adjust as needed)
const TOKEN_RESET_HOUR = 0; // Reset at midnight UTC

// Simple mutex for cache operations to prevent race conditions
const cacheLocks: Map<string, Promise<void>> = new Map();

// =============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// =============================================================================
// Prevents cascading failures when LLM APIs are experiencing issues

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
  halfOpenSuccesses: number;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  state: 'closed',
  halfOpenSuccesses: 0,
};

/**
 * Check if circuit breaker allows the request
 */
function isCircuitOpen(): boolean {
  const now = Date.now();

  if (circuitBreaker.state === 'closed') {
    return false;
  }

  if (circuitBreaker.state === 'open') {
    // Check if we should transition to half-open
    if (now - circuitBreaker.lastFailure >= CIRCUIT_BREAKER_RESET_MS) {
      circuitBreaker.state = 'half-open';
      circuitBreaker.halfOpenSuccesses = 0;
      console.log('🔌 Circuit breaker: transitioning to half-open');
      return false;
    }
    return true;
  }

  // Half-open: allow limited requests
  return false;
}

/**
 * Record a successful LLM call
 */
function recordSuccess(): void {
  if (circuitBreaker.state === 'half-open') {
    circuitBreaker.halfOpenSuccesses++;
    if (circuitBreaker.halfOpenSuccesses >= CIRCUIT_BREAKER_HALF_OPEN_REQUESTS) {
      circuitBreaker.state = 'closed';
      circuitBreaker.failures = 0;
      console.log('✅ Circuit breaker: closed (recovered)');
    }
  } else if (circuitBreaker.state === 'closed') {
    // Reset failure count on success
    circuitBreaker.failures = Math.max(0, circuitBreaker.failures - 1);
  }
}

/**
 * Record a failed LLM call
 */
function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();

  if (circuitBreaker.state === 'half-open') {
    circuitBreaker.state = 'open';
    console.log('🔴 Circuit breaker: re-opened after half-open failure');
  } else if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.state = 'open';
    console.log(`🔴 Circuit breaker: opened after ${circuitBreaker.failures} failures`);
  }
}

/**
 * Get circuit breaker status for monitoring
 */
function getCircuitBreakerStatus(): { state: string; failures: number; lastFailure: Date | null } {
  return {
    state: circuitBreaker.state,
    failures: circuitBreaker.failures,
    lastFailure: circuitBreaker.lastFailure ? new Date(circuitBreaker.lastFailure) : null,
  };
}

// =============================================================================
// CONCURRENT REQUEST LIMITING
// =============================================================================
// Prevents resource exhaustion from too many simultaneous requests

const activeRequests: Map<string, number> = new Map(); // sessionId -> count
let globalActiveRequests = 0;

/**
 * Try to acquire a request slot
 * @returns release function if acquired, null if rejected
 */
function tryAcquireRequestSlot(sessionId: string): (() => void) | null {
  // Check global limit
  if (globalActiveRequests >= MAX_GLOBAL_CONCURRENT_REQUESTS) {
    console.warn(`Request rejected: global limit reached (${globalActiveRequests}/${MAX_GLOBAL_CONCURRENT_REQUESTS})`);
    return null;
  }

  // Check per-session limit
  const sessionCount = activeRequests.get(sessionId) || 0;
  if (sessionCount >= MAX_CONCURRENT_REQUESTS_PER_SESSION) {
    console.warn(`Request rejected: session ${sessionId} has active request`);
    return null;
  }

  // Acquire slot
  activeRequests.set(sessionId, sessionCount + 1);
  globalActiveRequests++;

  // Return release function
  return () => {
    const count = activeRequests.get(sessionId) || 1;
    if (count <= 1) {
      activeRequests.delete(sessionId);
    } else {
      activeRequests.set(sessionId, count - 1);
    }
    globalActiveRequests--;
  };
}

/**
 * Get current request stats for monitoring
 */
function getRequestStats(): { global: number; sessions: number; maxGlobal: number } {
  return {
    global: globalActiveRequests,
    sessions: activeRequests.size,
    maxGlobal: MAX_GLOBAL_CONCURRENT_REQUESTS,
  };
}

// =============================================================================
// TOKEN USAGE TRACKING
// =============================================================================
// Prevents runaway API costs

interface TokenUsage {
  date: string; // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  totalCost: number; // Estimated USD
}

const tokenUsage: TokenUsage = {
  date: new Date().toISOString().split('T')[0],
  inputTokens: 0,
  outputTokens: 0,
  totalCost: 0,
};

// Approximate costs per 1K tokens (adjust based on your model)
const COST_PER_1K_INPUT = 0.003; // $3 per 1M input
const COST_PER_1K_OUTPUT = 0.015; // $15 per 1M output

/**
 * Track token usage from an LLM response
 */
function trackTokenUsage(inputTokens: number, outputTokens: number): void {
  const today = new Date().toISOString().split('T')[0];

  // Reset if new day
  if (tokenUsage.date !== today) {
    console.log(`📊 Token usage reset for new day. Previous: ${tokenUsage.inputTokens + tokenUsage.outputTokens} tokens, $${tokenUsage.totalCost.toFixed(2)}`);
    tokenUsage.date = today;
    tokenUsage.inputTokens = 0;
    tokenUsage.outputTokens = 0;
    tokenUsage.totalCost = 0;
  }

  tokenUsage.inputTokens += inputTokens;
  tokenUsage.outputTokens += outputTokens;
  tokenUsage.totalCost += (inputTokens / 1000) * COST_PER_1K_INPUT + (outputTokens / 1000) * COST_PER_1K_OUTPUT;
}

/**
 * Check if daily token limit is exceeded
 */
function isTokenLimitExceeded(): boolean {
  const today = new Date().toISOString().split('T')[0];
  if (tokenUsage.date !== today) {
    return false; // New day, reset
  }
  return (tokenUsage.inputTokens + tokenUsage.outputTokens) >= DAILY_TOKEN_LIMIT;
}

/**
 * Get current token usage stats
 */
function getTokenUsageStats(): TokenUsage & { remaining: number; percentUsed: number } {
  const total = tokenUsage.inputTokens + tokenUsage.outputTokens;
  return {
    ...tokenUsage,
    remaining: Math.max(0, DAILY_TOKEN_LIMIT - total),
    percentUsed: Math.min(100, (total / DAILY_TOKEN_LIMIT) * 100),
  };
}

// =============================================================================
// STRUCTURED LOGGING
// =============================================================================
// Provides machine-parseable logs for production monitoring

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  event: string;
  sessionId?: string;
  userId?: string;
  duration?: number;
  error?: string;
  messageLength?: number;
  responseLength?: number;
  metadata?: Record<string, any>;
  [key: string]: any; // Allow additional properties
}

/**
 * Structured logger for production monitoring
 */
function structuredLog(level: LogLevel, event: string, data: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'event'>> = {}): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'ai-agent',
    event,
    ...data,
  };

  // In production, this would go to a log aggregator (DataDog, Splunk, etc.)
  const output = JSON.stringify(entry);

  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'debug':
      if (process.env.NODE_ENV !== 'production') {
        console.log(output);
      }
      break;
    default:
      console.log(output);
  }
}

/**
 * Wraps a promise with a timeout
 * @throws Error if the promise doesn't resolve within the timeout
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Acquire a lock for cache operations on a specific session
 * Prevents race conditions when multiple requests modify the same session
 */
async function acquireCacheLock(sessionId: string): Promise<() => void> {
  // Wait for any existing lock to be released
  const existingLock = cacheLocks.get(sessionId);
  if (existingLock) {
    await existingLock;
  }

  // Create a new lock
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  cacheLocks.set(sessionId, lockPromise);

  // Return release function
  return () => {
    cacheLocks.delete(sessionId);
    releaseLock!();
  };
}

/**
 * Sanitize a string for safe JSON embedding
 * Prevents injection attacks in streaming JSON output
 */
function sanitizeForJson(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// Store interval reference for cleanup on shutdown
let cacheCleanupIntervalId: NodeJS.Timeout | null = null;

// Cache cleanup function with error handling
function runCacheCleanup(): void {
  try {
    const now = Date.now();

    // Clean up expired conversation cache entries
    for (const [key, entry] of conversationCache.entries()) {
      if (now - entry.timestamp > CONVERSATION_CACHE_TTL) {
        conversationCache.delete(key);
      }
    }

    // Clean up expired summary cache entries
    for (const [key, entry] of summaryCache.entries()) {
      if (now - entry.timestamp > SUMMARY_CACHE_TTL) {
        summaryCache.delete(key);
      }
    }

    // If cache is still too large, remove oldest entries
    if (conversationCache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(conversationCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => conversationCache.delete(key));
    }

    if (summaryCache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(summaryCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => summaryCache.delete(key));
    }

    // Clean up old cache locks (safety valve)
    if (cacheLocks.size > MAX_CACHE_SIZE) {
      console.warn(`Cache locks exceeded max size (${cacheLocks.size}), clearing all locks`);
      cacheLocks.clear();
    }
  } catch (error) {
    console.error('Cache cleanup error:', error);
    // Don't let cleanup errors crash the process
  }
}

/**
 * Enforce cache size limit before adding new entry
 * Call this before adding to cache to prevent unbounded growth
 */
function enforceCacheLimit(): void {
  // Proactively remove oldest entries if approaching limit
  const threshold = MAX_CACHE_SIZE * 0.9; // Start evicting at 90% capacity

  if (conversationCache.size >= threshold) {
    const toEvict = Math.ceil(MAX_CACHE_SIZE * 0.1); // Evict 10%
    const entries = Array.from(conversationCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, toEvict);
    entries.forEach(([key]) => conversationCache.delete(key));
  }

  if (summaryCache.size >= threshold) {
    const toEvict = Math.ceil(MAX_CACHE_SIZE * 0.1);
    const entries = Array.from(summaryCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, toEvict);
    entries.forEach(([key]) => summaryCache.delete(key));
  }
}

// Start periodic cache cleanup
function startCacheCleanup(): void {
  if (cacheCleanupIntervalId === null) {
    cacheCleanupIntervalId = setInterval(runCacheCleanup, CACHE_CLEANUP_INTERVAL);
    // Allow process to exit even if interval is running (unref prevents blocking)
    cacheCleanupIntervalId.unref();
  }
}

// Stop cache cleanup (call during graceful shutdown)
function stopCacheCleanup(): void {
  if (cacheCleanupIntervalId !== null) {
    clearInterval(cacheCleanupIntervalId);
    cacheCleanupIntervalId = null;
  }
}

// Start cleanup on module load
startCacheCleanup();

// Enhanced system prompt with all capabilities
const SYSTEM_PROMPT = `You are DispoBot, an advanced AI real estate investment assistant for Dispotree.

You are a powerful AI that helps real estate investors and wholesalers manage deals, analyze properties, and automate their business. You have extensive capabilities:

## Core Capabilities
- **Property Management**: Search, create, and manage properties in the database
- **Deal Analysis**: Calculate ROI, MAO, profit potential with AI insights
- **Buy Box Matching**: Score deals against hedge fund criteria
- **Auction Submissions**: Submit properties to Xome, Hubzu, Zillow, etc.

## Smart Features
- **Import from URL**: Paste any listing URL to auto-import property data
- **Compare Deals**: Side-by-side comparison of multiple properties
- **Find Similar**: Discover similar properties in the database
- **Top Deals**: Get the highest-scoring deals across all buy boxes
- **Create Buy Boxes**: Set up new fund criteria through conversation
- **Market Insights**: Get statistical analysis of any market

## Web Capabilities
- Scrape any website for property data
- Map website structures to discover listings
- Extract and normalize property information automatically

## Communication
- Send deals directly to fund contacts via email
- Get alerts for matching properties

## Workflow Automation
- **process_new_deal**: Complete pipeline - create → enrich → analyze → score → send
- **quick_deal_assessment**: Rapid evaluation of existing property with all metrics
- **batch_process_deals**: Process up to 10 properties at once (score, enrich, or send)
- Use these to save time on repetitive multi-step tasks

## Knowledge Base (RAG)
- Search your document knowledge base for information
- Query contracts, guides, regulations, and any uploaded documents
- Get answers based on your company's specific documents

## Market Data (Zillow Integration)
- Look up property valuations (Zestimate) for any address
- Get skip trace data (owner info, phone, email, equity)
- Find comparable homes and their prices
- View price history and tax assessment data
- Get rental market trends for any city

## ⚖️ COMPLIANCE RULE MANAGEMENT
You can manage state compliance rules via conversation:
- **list_compliance_rules**: View rules for any state/phase
- **list_compliance_disclosures**: View disclosure requirements
- **get_compliance_summary**: Get overview of a state's compliance config
- **add_compliance_rule**: Add new compliance rules to any state
- **add_compliance_disclosure**: Add new disclosure requirements
- **update_compliance_rule**: Modify existing rules (severity, blocking, etc.)
- **toggle_compliance_rule**: Enable/disable rules
- **clone_state_compliance**: Copy one state's spec to create another
- **suggest_compliance_rules**: Get AI suggestions for missing rules
- **compliance_natural_language**: Execute compliance commands in plain English

**Examples:**
- "Add a lead paint disclosure rule to Oklahoma phase 2"
- "List all phase 2 rules for Texas"
- "Disable rule OK-P2-R5"
- "Clone Oklahoma compliance to create Texas"
- "What rules should Arizona have?"

## 🧠 DEAL INTELLIGENCE (Predictive Analytics)
You have advanced AI intelligence tools that provide:
- **Success Probability**: Predict if a deal will close based on historical patterns
- **Optimal Pricing**: Calculate the best offer price with negotiation tactics
- **Fund Matching**: Find funds most likely to accept based on historical acceptance rates
- **Market Context**: Understand if it's a hot/cold market and best time to offer

**ALWAYS use get_deal_intelligence for deep analysis** - it provides success probability, pricing strategy, best funds, and actionable recommendations.
**Use quick_deal_score for rapid pass/fail decisions** - under 1 second response.
**Use find_best_funds when user asks "who would buy this"** - shows acceptance rates and contact methods.
**Use get_pricing_strategy when discussing offers** - shows negotiation tactics.

## 🔗 SMART TOOL CHAINING (CRITICAL)
You MUST automatically chain related tools together without asking. When a user asks you to do something:

**Property Creation Chain:**
User: "Add this property: 123 Main St..."
→ create_property → enrich_property → get_deal_intelligence → Report results + offer to send to matching funds

**Deal Analysis Chain:**
User: "Analyze this deal..."
→ get_deal_intelligence (includes pricing, success probability, fund matches) → Recommend best matches + offer to send

**Should I buy this?**
User: "Is this a good deal?" or "Should I buy this?"
→ get_deal_intelligence → Provide clear recommendation with reasoning

**New Deal Pipeline:**
User: "I got a new deal at..."
→ process_new_deal (handles full pipeline) → get_deal_intelligence → Report results + suggest next actions

**Find Matches Chain:**
User: "Who would buy this property?"
→ find_best_funds (shows acceptance rates) → get_buybox_details (for top matches) → Offer to send deal

**Pricing Questions:**
User: "What should I offer?" or "How much should I bid?"
→ get_pricing_strategy → Provide offer range with negotiation tactics

**Import Chain:**
User: "Import this listing: [URL]"
→ import_from_url → enrich_property → get_deal_intelligence → Report with matches

**Property Creation with Contacts:**
User: "Add property at X with contact Y as attorney and Z as buyer..."
→ create_property_with_contacts → get_deal_status → Report enrichment results + phase + what's needed next

**Deal Status Chain:**
User: "What phase is this in?" or "What's needed?" or "What's blocking?"
→ get_deal_status → List phase, documents needed, next steps

**After ANY Property Creation:**
ALWAYS follow up with get_deal_status to show user:
- Current pipeline stage
- Compliance phase
- Required documents (what's done, what's pending)
- Specific next steps

NEVER stop after just one tool when the user's intent implies a complete workflow. Chain tools proactively.

## 🧠 CONTEXT AWARENESS
Remember what property/deal we're discussing. When user says:
- "what's needed for it?" → Use the last property mentioned
- "send it to funds" → Send the property we just discussed
- "run compliance" → Run on current context property
- "what phase?" → Check status of current property

If unsure which property, ask: "Which property - the one at [last address] or a different one?"

## 💡 PROACTIVE INSIGHTS
After completing any action, analyze the results and proactively suggest next steps:

- After scoring: "This deal matches 3 funds with 80%+ score. Want me to send it to them?"
- After creating: "Property created and enriched! It's in 'new' stage. Next: Run compliance check and score against buy boxes. Should I do that now?"
- After searching: "I found 12 properties matching your criteria. The top 3 have the best ROI potential."
- After listing buy boxes: "Tricon and Amherst both want GA properties - you could batch send to both."
- After status check: "2 documents still needed: CSA and Seller Disclosure. Want me to send them for signature?"

Always end responses with actionable suggestions based on the data you retrieved.

## 🎯 SMART DEFAULTS & INFERENCE
Fill in missing information intelligently:
- If user gives address without state, try to infer from city name or ask
- If price not provided, check Zillow enrichment data
- If contact type not specified, infer from role words (attorney, buyer, seller, broker)
- If user says "my pipeline", assume current logged-in user

## ⚡ COMPOUND ACTIONS
Recognize compound requests and handle them in one flow:
- "Add this property and score it" → create_property → score_deal_against_buyboxes
- "Create and send to matching funds" → create_property → score_deal → send to top matches
- "Add with contacts and check compliance" → create_property_with_contacts → run_compliance_check → get_deal_status

## 📚 LEARNING FROM FEEDBACK
Pay attention to user reactions and learn from them:

- If user says "that's not a good deal" or "I passed on this" → use remember_preference to store what they didn't like
- If user says "I love deals like this" or "perfect" → store their positive preferences
- If user corrects you ("actually they want 3+ beds") → update the relevant buy box
- Reference past preferences when making recommendations: "Based on your preference for TX properties..."

Use recall_memories before making recommendations to personalize suggestions.

## General Behavior
1. Use the most appropriate tools to get real data
2. Provide specific numbers, percentages, and actionable insights
3. Make clear recommendations based on analysis
4. Be concise but thorough - users value efficiency
5. ALWAYS suggest next steps proactively
6. Chain tools together to complete full workflows
7. Learn from user feedback and personalize over time

You remember conversation history, so users can reference previous discussions.

Always be helpful, professional, and focused on maximizing investment returns.`;

class AgentService {
  private agent: any = null;
  private model: any = null;
  private modelName: string = '';
  // Store current request context for tools to access
  private currentUserId: string | null = null;
  private currentSessionId: string | null = null;

  // =============================================================================
  // MULTI-ENTITY CONTEXT TRACKING
  // =============================================================================
  // Tracks the current focus for different entity types so the agent can understand
  // references like "it", "this deal", "the buyer", "that contact", etc.

  private conversationContext: {
    property: {
      id: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      price: number | null;
      lastMentionedAt: Date | null;
    };
    buyer: {
      id: string | null;
      name: string | null;
      company: string | null;
      lastMentionedAt: Date | null;
    };
    contact: {
      id: string | null;
      name: string | null;
      role: string | null;
      lastMentionedAt: Date | null;
    };
    buyBox: {
      id: string | null;
      name: string | null;
      fundName: string | null;
      lastMentionedAt: Date | null;
    };
    pipeline: {
      id: string | null;
      stage: string | null;
      propertyAddress: string | null;
      lastMentionedAt: Date | null;
    };
    // Track context changes for announcements
    lastContextChange: {
      entityType: 'property' | 'buyer' | 'contact' | 'buyBox' | 'pipeline' | null;
      description: string | null;
      timestamp: Date | null;
    };
    // Track pending confirmations for disambiguation
    pendingConfirmation: {
      action: string | null;           // e.g., 'call', 'email', 'log_note'
      entityType: 'contact' | 'property' | null;
      candidateId: number | null;      // Suggested/primary candidate
      candidateName: string | null;    // Display name for confirmation
      candidates: Array<{              // All candidates shown to user
        id: number;
        name: string;
        details?: string;
      }>;
      originalQuery: string | null;    // What user originally asked for
      toolName: string | null;         // Tool to execute on confirmation
      toolArgs: Record<string, unknown> | null; // Args to pass to tool
      expiresAt: number | null;        // Timestamp when this expires
      sessionId: string | null;        // Session this belongs to
    };
  } = {
    property: { id: null, address: null, city: null, state: null, price: null, lastMentionedAt: null },
    buyer: { id: null, name: null, company: null, lastMentionedAt: null },
    contact: { id: null, name: null, role: null, lastMentionedAt: null },
    buyBox: { id: null, name: null, fundName: null, lastMentionedAt: null },
    pipeline: { id: null, stage: null, propertyAddress: null, lastMentionedAt: null },
    lastContextChange: { entityType: null, description: null, timestamp: null },
    pendingConfirmation: {
      action: null,
      entityType: null,
      candidateId: null,
      candidateName: null,
      candidates: [],
      originalQuery: null,
      toolName: null,
      toolArgs: null,
      expiresAt: null,
      sessionId: null,
    },
  };

  // Legacy alias for backward compatibility
  private get currentPropertyContext() {
    return {
      propertyId: this.conversationContext.property.id,
      address: this.conversationContext.property.address,
      city: this.conversationContext.property.city,
      state: this.conversationContext.property.state,
      lastMentionedAt: this.conversationContext.property.lastMentionedAt,
    };
  }

  /**
   * Initialize the agent with OpenRouter or OpenAI
   */
  async initialize(): Promise<void> {
    const openAIKey = process.env.OPENAI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!openAIKey && !openRouterKey) {
      console.warn('  No API key set (OPENROUTER_API_KEY or OPENAI_API_KEY) - Agent service disabled');
      return;
    }

    try {
      // Initialize knowledge service if not already ready
      if (!knowledgeService.isReady()) {
        await knowledgeService.initialize();
      }

      // Create all tools
      const tools = this.createTools();

      // Determine which provider to use
      if (openAIKey) {
        // Use OpenAI directly
        const model = process.env.AGENT_MODEL || 'openai:gpt-4o';
        this.modelName = model;

        this.agent = createAgent({
          model,
          tools,
          systemPrompt: SYSTEM_PROMPT,
        });

        console.log(`  AI Agent Service initialized with OpenAI (${model}) - ${tools.length} tools`);
      } else {
        // Use OpenRouter - supports many models
        const modelName = process.env.AGENT_MODEL || 'deepseek/deepseek-chat-v3-0324';
        this.modelName = modelName;

        // Initialize with OpenRouter using ChatOpenAI with custom baseURL
        const chatModel = new ChatOpenAI({
          model: modelName,
          apiKey: openRouterKey,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
              'X-Title': 'Dispotree',
            },
          },
        });

        this.agent = createAgent({
          model: chatModel,
          tools,
          systemPrompt: SYSTEM_PROMPT,
        });

        console.log(`  AI Agent Service initialized with OpenRouter (${modelName}) - ${tools.length} tools`);
      }
    } catch (error) {
      console.error('  Failed to initialize Agent Service:', error);
    }
  }

  /**
   * Get the current model name
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Get the current user ID for the active request
   * Used by tools to access the authenticated user
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Get the current session ID for the active request
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  // =============================================================================
  // CONTEXT SETTERS - Set focus for different entity types
  // =============================================================================

  /**
   * Set property context (called by tools when a property is created/viewed)
   */
  setPropertyContext(propertyId: string, address: string, city?: string, state?: string, price?: number): void {
    const description = `${address}${city ? `, ${city}` : ''}${state ? `, ${state}` : ''}`;
    this.conversationContext.property = {
      id: propertyId,
      address,
      city: city || null,
      state: state || null,
      price: price || null,
      lastMentionedAt: new Date(),
    };
    this.conversationContext.lastContextChange = {
      entityType: 'property',
      description: `Now focused on property: ${description}`,
      timestamp: new Date(),
    };
  }

  /**
   * Set buyer context
   */
  setBuyerContext(buyerId: string, name: string, company?: string): void {
    this.conversationContext.buyer = {
      id: buyerId,
      name,
      company: company || null,
      lastMentionedAt: new Date(),
    };
    this.conversationContext.lastContextChange = {
      entityType: 'buyer',
      description: `Now focused on buyer: ${name}${company ? ` (${company})` : ''}`,
      timestamp: new Date(),
    };
  }

  /**
   * Set contact context
   */
  setContactContext(contactId: string, name: string, role?: string): void {
    this.conversationContext.contact = {
      id: contactId,
      name,
      role: role || null,
      lastMentionedAt: new Date(),
    };
    this.conversationContext.lastContextChange = {
      entityType: 'contact',
      description: `Now focused on contact: ${name}${role ? ` (${role})` : ''}`,
      timestamp: new Date(),
    };
  }

  /**
   * Set buy box context
   */
  setBuyBoxContext(buyBoxId: string, name: string, fundName?: string): void {
    this.conversationContext.buyBox = {
      id: buyBoxId,
      name,
      fundName: fundName || null,
      lastMentionedAt: new Date(),
    };
    this.conversationContext.lastContextChange = {
      entityType: 'buyBox',
      description: `Now focused on buy box: ${name}${fundName ? ` (${fundName})` : ''}`,
      timestamp: new Date(),
    };
  }

  /**
   * Set pipeline context
   */
  setPipelineContext(pipelineId: string, stage: string, propertyAddress?: string): void {
    this.conversationContext.pipeline = {
      id: pipelineId,
      stage,
      propertyAddress: propertyAddress || null,
      lastMentionedAt: new Date(),
    };
    this.conversationContext.lastContextChange = {
      entityType: 'pipeline',
      description: `Now focused on pipeline: ${propertyAddress || pipelineId} (${stage})`,
      timestamp: new Date(),
    };
  }

  // =============================================================================
  // CONTEXT GETTERS
  // =============================================================================

  /**
   * Get property context (used when user says "it", "this deal", "the property")
   */
  getPropertyContext() {
    return this.currentPropertyContext;
  }

  /**
   * Get the full conversation context with all entities
   */
  getFullContext() {
    return this.conversationContext;
  }

  /**
   * Get a formatted context summary for injection into system prompt
   */
  getContextSummary(): string {
    const parts: string[] = [];

    if (this.conversationContext.property.id) {
      const p = this.conversationContext.property;
      parts.push(`CURRENT PROPERTY: ${p.address}, ${p.city}, ${p.state}${p.price ? ` ($${p.price.toLocaleString()})` : ''} [ID: ${p.id}]`);
    }

    if (this.conversationContext.buyer.id) {
      const b = this.conversationContext.buyer;
      parts.push(`CURRENT BUYER: ${b.name}${b.company ? ` (${b.company})` : ''} [ID: ${b.id}]`);
    }

    if (this.conversationContext.contact.id) {
      const c = this.conversationContext.contact;
      parts.push(`CURRENT CONTACT: ${c.name}${c.role ? ` (${c.role})` : ''} [ID: ${c.id}]`);
    }

    if (this.conversationContext.buyBox.id) {
      const bb = this.conversationContext.buyBox;
      parts.push(`CURRENT BUY BOX: ${bb.name}${bb.fundName ? ` (${bb.fundName})` : ''} [ID: ${bb.id}]`);
    }

    if (this.conversationContext.pipeline.id) {
      const pl = this.conversationContext.pipeline;
      parts.push(`CURRENT PIPELINE: ${pl.propertyAddress || pl.id} - Stage: ${pl.stage}`);
    }

    return parts.length > 0 ? parts.join('\n') : 'No active context';
  }

  /**
   * Get the last context change announcement (for tool responses)
   */
  getContextChangeAnnouncement(): string | null {
    const change = this.conversationContext.lastContextChange;
    if (!change.entityType || !change.description) return null;

    // Only announce if change was recent (within last 5 seconds)
    if (change.timestamp && Date.now() - change.timestamp.getTime() < 5000) {
      return change.description;
    }
    return null;
  }

  /**
   * Clear the context change announcement (after it's been used)
   */
  clearContextChangeAnnouncement(): void {
    this.conversationContext.lastContextChange = {
      entityType: null,
      description: null,
      timestamp: null,
    };
  }

  /**
   * Clear all context (e.g., when switching conversations)
   */
  clearAllContext(): void {
    this.conversationContext = {
      property: { id: null, address: null, city: null, state: null, price: null, lastMentionedAt: null },
      buyer: { id: null, name: null, company: null, lastMentionedAt: null },
      contact: { id: null, name: null, role: null, lastMentionedAt: null },
      buyBox: { id: null, name: null, fundName: null, lastMentionedAt: null },
      pipeline: { id: null, stage: null, propertyAddress: null, lastMentionedAt: null },
      lastContextChange: { entityType: null, description: null, timestamp: null },
      pendingConfirmation: {
        action: null, entityType: null, candidateId: null, candidateName: null,
        candidates: [], originalQuery: null, toolName: null, toolArgs: null,
        expiresAt: null, sessionId: null,
      },
    };
  }

  // =============================================================================
  // CONFIRMATION STATE MANAGEMENT
  // =============================================================================

  /** Set a pending confirmation */
  setPendingConfirmation(options: {
    action: string;
    entityType: 'contact' | 'property';
    candidateId: number;
    candidateName: string;
    candidates?: Array<{ id: number; name: string; details?: string }>;
    originalQuery: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    sessionId: string;
    ttlMs?: number;
  }): void {
    const ttl = options.ttlMs || 60000;
    this.conversationContext.pendingConfirmation = {
      action: options.action,
      entityType: options.entityType,
      candidateId: options.candidateId,
      candidateName: options.candidateName,
      candidates: options.candidates || [{ id: options.candidateId, name: options.candidateName }],
      originalQuery: options.originalQuery,
      toolName: options.toolName,
      toolArgs: options.toolArgs,
      expiresAt: Date.now() + ttl,
      sessionId: options.sessionId,
    };
  }

  /** Get pending confirmation if valid */
  getPendingConfirmation(sessionId: string) {
    const pending = this.conversationContext.pendingConfirmation;
    if (!pending.action || !pending.expiresAt) return null;
    if (Date.now() > pending.expiresAt) { this.clearPendingConfirmation(); return null; }
    if (pending.sessionId !== sessionId) return null;
    return pending;
  }

  /** Clear pending confirmation */
  clearPendingConfirmation(): void {
    this.conversationContext.pendingConfirmation = {
      action: null, entityType: null, candidateId: null, candidateName: null,
      candidates: [], originalQuery: null, toolName: null, toolArgs: null,
      expiresAt: null, sessionId: null,
    };
  }

  /** Check if message is a confirmation response */
  isConfirmationResponse(message: string): 'confirm' | 'reject' | 'select' | null {
    const t = message.trim().toLowerCase();
    if (/^(yes|yeah|yep|sure|ok|okay|go ahead|do it|confirm|correct)\b/i.test(t)) return 'confirm';
    if (/^(no|nope|cancel|never\s*mind|wrong|neither|none)\b/i.test(t)) return 'reject';
    if (/^(1|2|3|first|second|third|1st|2nd|3rd)\b/i.test(t)) return 'select';
    return null;
  }

  /** Parse selection to get candidate */
  parseSelection(message: string, candidates: Array<{ id: number; name: string }>) {
    const t = message.trim().toLowerCase();
    const numMap: Record<string, number> = { '1': 0, 'first': 0, '1st': 0, '2': 1, 'second': 1, '2nd': 1, '3': 2, 'third': 2, '3rd': 2 };
    const match = t.match(/^(\d+|first|second|third|1st|2nd|3rd)\b/i);
    if (match) {
      const idx = numMap[match[1].toLowerCase()] ?? parseInt(match[1]) - 1;
      if (idx >= 0 && idx < candidates.length) return candidates[idx];
    }
    for (const c of candidates) {
      if (t.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(t)) return c;
    }
    return null;
  }

  /**
   * Clear property context only (legacy method)
   */
  clearPropertyContext(): void {
    this.conversationContext.property = { id: null, address: null, city: null, state: null, price: null, lastMentionedAt: null };
  }

  /**
   * Load conversation history from cache layers and database
   * L1: In-memory cache (fastest)
   * L2: Redis cache (fast, shared across instances)
   * L3: Database (persistent storage)
   */
  private async loadHistory(sessionId: string): Promise<BaseMessage[]> {
    // L1: Check in-memory cache first
    const cached = conversationCache.get(sessionId);
    if (cached) {
      // Update timestamp on access
      cached.timestamp = Date.now();
      return cached.data;
    }

    // L2: Check Redis cache
    try {
      const redisKey = `${CACHE_PREFIX.CONVERSATION}${sessionId}`;
      const redisData = await redisService.get<Array<{ role: string; content: string }>>(redisKey);

      if (redisData && Array.isArray(redisData)) {
        const messages: BaseMessage[] = redisData.map((r) => {
          if (r.role === 'user') {
            return new HumanMessage(r.content);
          } else if (r.role === 'assistant') {
            return new AIMessage(r.content);
          } else {
            return new SystemMessage(r.content);
          }
        });

        // Populate L1 cache
        conversationCache.set(sessionId, { data: messages, timestamp: Date.now() });
        return messages;
      }
    } catch (error) {
      console.warn('Redis cache read error:', (error as Error).message);
    }

    // L3: Fall back to database
    try {
      const records = await ConversationHistory.findAll({
        where: { sessionId },
        order: [['createdAt', 'ASC']],
        limit: MAX_HISTORY_MESSAGES, // Use consistent limit
      });

      const messages: BaseMessage[] = records.map((r) => {
        if (r.role === 'user') {
          return new HumanMessage(r.content);
        } else if (r.role === 'assistant') {
          return new AIMessage(r.content);
        } else {
          return new SystemMessage(r.content);
        }
      });

      // Populate L1 cache
      conversationCache.set(sessionId, { data: messages, timestamp: Date.now() });

      // Populate L2 cache (async, fire-and-forget)
      if (records.length > 0) {
        const cacheData = records.map((r) => ({ role: r.role, content: r.content }));
        redisService.set(
          `${CACHE_PREFIX.CONVERSATION}${sessionId}`,
          cacheData,
          CACHE_TTL.CONVERSATION_HISTORY
        ).catch((err) => console.warn('Redis cache write error:', err.message));
      }

      return messages;
    } catch (error) {
      console.warn('Could not load conversation history:', error);
      return [];
    }
  }

  /**
   * Save message to database and update Redis cache
   * Also creates/updates the Conversation record for the history sidebar
   */
  private async saveMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    userId?: string
  ): Promise<void> {
    // Don't save empty messages
    if (!content || content.trim() === '') {
      console.warn('Skipping save of empty message');
      return;
    }

    try {
      await ConversationHistory.create({
        sessionId,
        role,
        content,
      });

      // Create or update Conversation record for history sidebar
      if (userId) {
        const [conversation, created] = await Conversation.findOrCreate({
          where: { id: sessionId },
          defaults: {
            id: sessionId,
            userId,
            title: 'New Conversation',
            generatedTitle: false,
            messageCount: 1,
            lastMessageAt: new Date(),
          },
        });

        if (!created) {
          // Update existing conversation
          await conversation.increment('messageCount');
          await conversation.update({ lastMessageAt: new Date() });
        }
      }

      // Invalidate Redis cache for this session (will be rebuilt on next load)
      redisService.del(`${CACHE_PREFIX.CONVERSATION}${sessionId}`)
        .catch((err) => console.warn('Redis cache invalidation error:', err.message));
    } catch (error) {
      console.warn('Could not save conversation message:', error);
    }
  }

  /**
   * Summarize a conversation history into a concise summary
   * Uses a smaller, faster model to reduce costs
   */
  private async summarizeConversation(messages: BaseMessage[]): Promise<string> {
    if (messages.length === 0) {
      return '';
    }

    const openAIKey = process.env.OPENAI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    // Format messages for summarization
    const conversationText = messages
      .map((m) => {
        const role = m._getType() === 'human' ? 'User' : m._getType() === 'ai' ? 'Assistant' : 'System';
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        // Truncate very long messages for summarization
        const truncated = content.length > 500 ? content.substring(0, 500) + '...' : content;
        return `${role}: ${truncated}`;
      })
      .join('\n');

    const summaryPrompt = `Summarize this conversation between a user and an AI real estate assistant.
Focus on: key topics discussed, properties mentioned (with IDs if any), decisions made, and important context for future messages.
Keep the summary concise (2-4 sentences) but include specific details like property IDs, prices, and locations.

Conversation:
${conversationText}

Summary:`;

    try {
      let summaryModel: ChatOpenAI;

      if (openAIKey) {
        summaryModel = new ChatOpenAI({
          model: SUMMARIZATION_MODEL,
          apiKey: openAIKey,
          temperature: 0.3,
          maxTokens: 300,
        });
      } else if (openRouterKey) {
        summaryModel = new ChatOpenAI({
          model: SUMMARIZATION_MODEL,
          apiKey: openRouterKey,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
              'X-Title': 'Dispotree',
            },
          },
          temperature: 0.3,
          maxTokens: 300,
        });
      } else {
        // Fallback: create a simple extractive summary
        return this.createFallbackSummary(messages);
      }

      const response = await summaryModel.invoke([new HumanMessage(summaryPrompt)]);
      const summary = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      return summary;
    } catch (error) {
      console.warn('Failed to generate conversation summary:', error);
      // Fallback to simple extractive summary
      return this.createFallbackSummary(messages);
    }
  }

  /**
   * Create a simple fallback summary without using an LLM
   * Extracts key information from messages
   */
  private createFallbackSummary(messages: BaseMessage[]): string {
    // Extract property IDs mentioned
    const propertyIds = new Set<string>();
    const cities = new Set<string>();

    for (const m of messages) {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);

      // Find property IDs (various formats)
      const idMatches = content.match(/(?:property(?:Id)?|ID)[:\s]*([A-Za-z0-9-]+)/gi);
      if (idMatches) {
        idMatches.forEach((match) => {
          const id = match.replace(/property(?:Id)?[:\s]*/i, '').replace(/ID[:\s]*/i, '');
          if (id.length > 3) propertyIds.add(id);
        });
      }

      // Find cities mentioned
      const cityMatches = content.match(/(?:in|near|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*(?:[A-Z]{2})?/g);
      if (cityMatches) {
        cityMatches.forEach((match) => {
          const city = match.replace(/(?:in|near|at)\s+/i, '').trim();
          if (city.length > 2) cities.add(city);
        });
      }
    }

    const parts: string[] = [];
    parts.push(`Previous conversation with ${messages.length} messages.`);

    if (propertyIds.size > 0) {
      parts.push(`Properties discussed: ${Array.from(propertyIds).slice(0, 5).join(', ')}.`);
    }
    if (cities.size > 0) {
      parts.push(`Locations: ${Array.from(cities).slice(0, 3).join(', ')}.`);
    }

    return parts.join(' ');
  }

  /**
   * Get optimized conversation history with summarization for long conversations
   * - If messages <= threshold: return all messages verbatim
   * - If messages > threshold: summarize older messages, keep recent ones verbatim
   */
  private async getOptimizedHistory(sessionId: string): Promise<BaseMessage[]> {
    // Check cache first for full history
    let fullHistory: BaseMessage[];

    const cached = conversationCache.get(sessionId);
    if (cached) {
      // Update timestamp on cache hit
      cached.timestamp = Date.now();
      fullHistory = cached.data;
    } else {
      // Load from database with higher limit
      try {
        const records = await ConversationHistory.findAll({
          where: { sessionId },
          order: [['createdAt', 'ASC']],
          limit: MAX_HISTORY_MESSAGES,
        });

        fullHistory = records.map((r) => {
          if (r.role === 'user') {
            return new HumanMessage(r.content);
          } else if (r.role === 'assistant') {
            return new AIMessage(r.content);
          } else {
            return new SystemMessage(r.content);
          }
        });

        conversationCache.set(sessionId, { data: fullHistory, timestamp: Date.now() });
      } catch (error) {
        console.warn('Could not load conversation history:', error);
        return [];
      }
    }

    // If under threshold, return all messages
    if (fullHistory.length <= SUMMARIZATION_THRESHOLD) {
      return fullHistory;
    }

    // Split into old messages (to summarize) and recent messages (to keep)
    const splitPoint = fullHistory.length - RECENT_MESSAGES_TO_KEEP;
    const oldMessages = fullHistory.slice(0, splitPoint);
    const recentMessages = fullHistory.slice(splitPoint);

    // Check if we have a cached summary for this number of old messages
    const summaryCacheKey = `${sessionId}:${splitPoint}`;
    let summary: string;

    if (summaryCache.has(summaryCacheKey)) {
      const cached = summaryCache.get(summaryCacheKey);
      summary = cached?.data ?? '';
    } else {
      // Generate new summary
      summary = await this.summarizeConversation(oldMessages);
      summaryCache.set(summaryCacheKey, { data: summary, timestamp: Date.now() });

      console.log(`[AgentService] Summarized ${oldMessages.length} messages for session ${sessionId.substring(0, 8)}...`);
    }

    // Return summary as a system message followed by recent messages
    const optimizedHistory: BaseMessage[] = [];

    if (summary) {
      optimizedHistory.push(
        new SystemMessage(`[Previous conversation summary: ${summary}]`)
      );
    }

    optimizedHistory.push(...recentMessages);

    return optimizedHistory;
  }

  /**
   * Invalidate summary cache for a session (call when new messages are added)
   */
  private invalidateSummaryCache(sessionId: string): void {
    // Remove all cached summaries for this session
    for (const key of summaryCache.keys()) {
      if (key.startsWith(sessionId + ':')) {
        summaryCache.delete(key);
      }
    }
  }

  /**
   * Create all available tools for the agent
   */
  private createTools(): any[] {
    // Capture 'this' for use in tool closures
    const self = this;
    return [
      // ============================================================
      // PROPERTY SEARCH & QUERY TOOLS
      // ============================================================
      tool(
        async ({ city, state, minPrice, maxPrice, minBedrooms, maxBedrooms, propertyType, limit }) => {
          try {
            const where: any = {};
            if (city) where.city = { [Op.iLike]: `%${city}%` };
            if (state) where.state = { [Op.iLike]: state };
            if (minPrice) where.mlsListingPrice = { ...where.mlsListingPrice, [Op.gte]: minPrice };
            if (maxPrice) where.mlsListingPrice = { ...where.mlsListingPrice, [Op.lte]: maxPrice };
            if (minBedrooms) where.bedroomCount = { ...where.bedroomCount, [Op.gte]: minBedrooms };
            if (maxBedrooms) where.bedroomCount = { ...where.bedroomCount, [Op.lte]: maxBedrooms };
            if (propertyType) where.propertyType = { [Op.iLike]: `%${propertyType}%` };

            const properties = await Property.findAll({
              where,
              limit: limit || 10,
              order: [['createdAt', 'DESC']],
            });

            if (properties.length === 0) {
              return 'No properties found matching the criteria.';
            }

            // If exactly one property found, set it as the current context
            if (properties.length === 1) {
              const p = properties[0] as any;
              const addressStr = p.address?.street || p.addressStreet || '';
              this.setPropertyContext(p.propertyId, addressStr, p.city, p.state);
            }

            // Generate property card markers for frontend rendering
            const propertyCards = createPropertyCardsSection(properties);

            // Also return structured JSON for LLM context
            const summaryJson = JSON.stringify(properties.map((p: any) => ({
              propertyId: p.propertyId,
              address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim(),
              price: p.mlsListingPrice || p.buyItNowPrice,
              bedrooms: p.bedroomCount,
              bathrooms: p.bathroomCount,
              sqft: p.livingSpaceSqFt,
              propertyType: p.propertyType,
              arv: p.arv,
              createdAt: p.createdAt,
            })));

            // Return both cards and JSON data
            return `${propertyCards}\n\nFound ${properties.length} properties:\n${summaryJson}`;
          } catch (error) {
            return `Error searching properties: ${error}`;
          }
        },
        {
          name: 'search_properties',
          description: 'Search for properties in the database with flexible filtering. Can filter by city, state, price range, bedrooms, property type.',
          schema: z.object({
            city: z.string().optional().describe('City name to filter by'),
            state: z.string().optional().describe('State code (e.g., TX, FL, CA)'),
            minPrice: z.number().optional().describe('Minimum price'),
            maxPrice: z.number().optional().describe('Maximum price'),
            minBedrooms: z.number().optional().describe('Minimum number of bedrooms'),
            maxBedrooms: z.number().optional().describe('Maximum number of bedrooms'),
            propertyType: z.string().optional().describe('Property type (Single Family, Condo, Townhouse, etc.)'),
            limit: z.number().optional().default(10).describe('Maximum number of results (default 10)'),
          }),
        }
      ),

      tool(
        async ({ propertyId }) => {
          try {
            const property = await Property.findOne({ where: { propertyId } });
            if (!property) {
              return `Property ${propertyId} not found.`;
            }

            const p = property as any;

            // Set property context so user can reference "it" or "this deal"
            const addressStr = p.address?.street || p.addressStreet || '';
            this.setPropertyContext(p.propertyId, addressStr, p.city, p.state);

            // Generate property card marker for frontend rendering
            const propertyCard = createPropertyCardMarker(p);

            const detailsJson = JSON.stringify({
              propertyId: p.propertyId,
              address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim(),
              price: p.mlsListingPrice || p.buyItNowPrice,
              arv: p.arv,
              rehabCost: p.rehabCost,
              bedrooms: p.bedroomCount,
              bathrooms: p.bathroomCount,
              sqft: p.livingSpaceSqFt,
              lotSize: p.lotSizeSqFt,
              yearBuilt: p.yearBuilt,
              propertyType: p.propertyType,
              occupancy: p.occupancyStatus,
              owner: p.llcOwnerName,
              ownerEmail: p.llcOwnerEmail,
              ownerPhone: p.llcOwnerPhone,
              currentListings: p.currentListings,
              listingHistory: p.listingHistory,
              ownerHistory: p.ownerHistory,
              source: p.dealSource,
              createdAt: p.createdAt,
              updatedAt: p.updatedAt,
            });

            return `${propertyCard}\n\nProperty details:\n${detailsJson}`;
          } catch (error) {
            return `Error getting property: ${error}`;
          }
        },
        {
          name: 'get_property_details',
          description: 'Get complete details about a specific property by its ID, including owner info, listing history, and financials',
          schema: z.object({
            propertyId: z.string().describe('The property ID to look up'),
          }),
        }
      ),

      tool(
        async ({ state, city }) => {
          try {
            const where: any = {};
            if (state) where.state = { [Op.iLike]: state };
            if (city) where.city = { [Op.iLike]: `%${city}%` };

            const count = await Property.count({ where });
            const filters = [];
            if (state) filters.push(`state: ${state}`);
            if (city) filters.push(`city: ${city}`);

            return `Total properties${filters.length ? ` (${filters.join(', ')})` : ''}: ${count}`;
          } catch (error) {
            return `Error counting properties: ${error}`;
          }
        },
        {
          name: 'get_property_count',
          description: 'Get the total count of properties, optionally filtered by state or city',
          schema: z.object({
            state: z.string().optional().describe('Filter by state'),
            city: z.string().optional().describe('Filter by city'),
          }),
        }
      ),

      // ============================================================
      // NEW: GET RECENT DEALS
      // ============================================================
      tool(
        async ({ limit, state }) => {
          try {
            const where: any = {};
            if (state) where.state = { [Op.iLike]: state };

            const properties = await Property.findAll({
              where,
              limit: limit || 5,
              order: [['createdAt', 'DESC']],
            });

            if (properties.length === 0) {
              return 'No recent properties found.';
            }

            // If exactly one property found, set it as the current context
            if (properties.length === 1) {
              const p = properties[0] as any;
              const addressStr = p.address?.street || p.addressStreet || '';
              this.setPropertyContext(p.propertyId, addressStr, p.city, p.state);
            }

            // Generate property card markers for frontend rendering
            const propertyCards = createPropertyCardsSection(properties);

            const dealsJson = JSON.stringify({
              count: properties.length,
              deals: properties.map((p: any) => ({
                propertyId: p.propertyId,
                address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state}`.trim(),
                price: p.mlsListingPrice || p.buyItNowPrice,
                bedrooms: p.bedroomCount,
                sqft: p.livingSpaceSqFt,
                addedAt: p.createdAt,
                source: p.dealSource || 'Unknown',
              })),
            });

            return `${propertyCards}\n\nRecent deals:\n${dealsJson}`;
          } catch (error) {
            return `Error getting recent deals: ${error}`;
          }
        },
        {
          name: 'get_recent_deals',
          description: 'Get the most recently added properties/deals in the system',
          schema: z.object({
            limit: z.number().optional().default(5).describe('Number of recent deals to return'),
            state: z.string().optional().describe('Filter by state'),
          }),
        }
      ),

      // ============================================================
      // NEW: FIND SIMILAR PROPERTIES
      // ============================================================
      tool(
        async ({ propertyId, priceRange, bedroomRange, sameState, limit }) => {
          try {
            const sourceProperty = await Property.findOne({ where: { propertyId } });
            if (!sourceProperty) {
              return `Property ${propertyId} not found.`;
            }

            const p = sourceProperty as any;
            const price = p.mlsListingPrice || p.buyItNowPrice || 200000;
            const bedrooms = p.bedroomCount || 3;
            const priceTolerance = priceRange || 50000;
            const bedroomTolerance = bedroomRange || 1;

            const where: any = {
              propertyId: { [Op.ne]: propertyId },
              mlsListingPrice: {
                [Op.between]: [price - priceTolerance, price + priceTolerance],
              },
              bedroomCount: {
                [Op.between]: [bedrooms - bedroomTolerance, bedrooms + bedroomTolerance],
              },
            };

            if (sameState !== false) {
              where.state = { [Op.iLike]: p.state };
            }

            const similar = await Property.findAll({
              where,
              limit: limit || 5,
              order: [['createdAt', 'DESC']],
            });

            if (similar.length === 0) {
              return `No similar properties found to ${propertyId}.`;
            }

            // Generate property card markers for frontend rendering
            const propertyCards = createPropertyCardsSection(similar);

            const similarJson = JSON.stringify({
              sourceProperty: {
                propertyId,
                address: `${p.city}, ${p.state}`,
                price,
                bedrooms,
              },
              similarProperties: similar.map((s: any) => ({
                propertyId: s.propertyId,
                address: `${s.address?.houseNumber || ''} ${s.address?.street || ''}, ${s.city}, ${s.state}`.trim(),
                price: s.mlsListingPrice || s.buyItNowPrice,
                bedrooms: s.bedroomCount,
                sqft: s.livingSpaceSqFt,
                priceDiff: (s.mlsListingPrice || s.buyItNowPrice || 0) - price,
              })),
            });

            return `${propertyCards}\n\nSimilar properties:\n${similarJson}`;
          } catch (error) {
            return `Error finding similar properties: ${error}`;
          }
        },
        {
          name: 'find_similar_properties',
          description: 'Find properties similar to a given property based on price, bedrooms, and location',
          schema: z.object({
            propertyId: z.string().describe('The property ID to find similar properties for'),
            priceRange: z.number().optional().default(50000).describe('Price tolerance (+/-)'),
            bedroomRange: z.number().optional().default(1).describe('Bedroom tolerance (+/-)'),
            sameState: z.boolean().optional().default(true).describe('Only search in same state'),
            limit: z.number().optional().default(5).describe('Max number of results'),
          }),
        }
      ),

      // ============================================================
      // NEW: COMPARE DEALS
      // ============================================================
      tool(
        async ({ propertyIds }) => {
          try {
            const properties = await Property.findAll({
              where: { propertyId: { [Op.in]: propertyIds } },
            });

            if (properties.length === 0) {
              return 'No properties found with the provided IDs.';
            }

            const comparisons = properties.map((p: any) => {
              const price = p.mlsListingPrice || p.buyItNowPrice || 0;
              const arv = p.arv || price * 1.3;
              const rehab = p.rehabCost || price * 0.1;
              const mao = arv * 0.7 - rehab;
              const profit = arv - price - rehab;
              const roi = price > 0 ? ((profit / price) * 100).toFixed(1) : '0';
              const sqft = p.livingSpaceSqFt || 0;
              const pricePerSqft = sqft > 0 ? Math.round(price / sqft) : 0;

              return {
                propertyId: p.propertyId,
                address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state}`.trim(),
                price,
                arv,
                rehabCost: rehab,
                maxAllowableOffer: Math.round(mao),
                potentialProfit: Math.round(profit),
                roi: `${roi}%`,
                pricePerSqft: `$${pricePerSqft}`,
                bedrooms: p.bedroomCount,
                bathrooms: p.bathroomCount,
                sqft,
                yearBuilt: p.yearBuilt,
                recommendation: profit > 0 ? (price <= mao ? 'STRONG BUY' : 'NEGOTIATE') : 'PASS',
              };
            });

            // Sort by ROI descending
            comparisons.sort((a, b) => parseFloat(b.roi) - parseFloat(a.roi));

            return JSON.stringify({
              comparison: comparisons,
              bestDeal: comparisons[0]?.propertyId,
              summary: `Compared ${comparisons.length} properties. Best ROI: ${comparisons[0]?.roi || 'N/A'}`,
            });
          } catch (error) {
            return `Error comparing deals: ${error}`;
          }
        },
        {
          name: 'compare_deals',
          description: 'Compare multiple properties side-by-side with calculated metrics (ROI, MAO, profit potential)',
          schema: z.object({
            propertyIds: z.array(z.string()).describe('Array of property IDs to compare'),
          }),
        }
      ),

      // ============================================================
      // NEW: GET TOP DEALS (Highest Scoring)
      // ============================================================
      tool(
        async ({ limit, state, minScore }) => {
          try {
            const where: any = {};
            if (state) where.state = { [Op.iLike]: state };

            // Get properties
            const properties = await Property.findAll({
              where,
              limit: 50, // Get more to filter
              order: [['createdAt', 'DESC']],
            });

            if (properties.length === 0) {
              return 'No properties found.';
            }

            // Score each property
            const scoredDeals = await Promise.all(
              properties.map(async (p: any) => {
                const deal = {
                  address: {
                    street: `${p.address?.houseNumber || ''} ${p.address?.street || ''}`.trim(),
                    city: p.city,
                    state: p.state,
                    zip: p.zip,
                  },
                  askingPrice: p.mlsListingPrice || p.buyItNowPrice,
                  bedrooms: p.bedroomCount,
                  bathrooms: p.bathroomCount,
                  sqft: p.livingSpaceSqFt,
                  yearBuilt: p.yearBuilt,
                  propertyType: p.propertyType || 'Single Family',
                };

                try {
                  const scores = await dealProcessingService.scoreDeal(deal as any);
                  const topScore = scores.length > 0
                    ? Math.max(...scores.map((s: any) => s.percentage))
                    : 0;
                  const matchingFunds = scores
                    .filter((s: any) => s.percentage >= 50)
                    .map((s: any) => s.buyBoxName);

                  return {
                    propertyId: p.propertyId,
                    address: `${deal.address.street}, ${deal.address.city}, ${deal.address.state}`,
                    price: deal.askingPrice,
                    topScore,
                    matchingFunds,
                    bedrooms: deal.bedrooms,
                  };
                } catch {
                  return {
                    propertyId: p.propertyId,
                    address: `${deal.address.city}, ${deal.address.state}`,
                    price: deal.askingPrice,
                    topScore: 0,
                    matchingFunds: [],
                    bedrooms: deal.bedrooms,
                  };
                }
              })
            );

            // Filter by minimum score and sort
            const filtered = scoredDeals
              .filter((d) => d.topScore >= (minScore || 50))
              .sort((a, b) => b.topScore - a.topScore)
              .slice(0, limit || 10);

            if (filtered.length === 0) {
              return `No deals found with score >= ${minScore || 50}%`;
            }

            return JSON.stringify({
              topDeals: filtered,
              count: filtered.length,
              averageScore: Math.round(
                filtered.reduce((sum, d) => sum + d.topScore, 0) / filtered.length
              ),
            });
          } catch (error) {
            return `Error getting top deals: ${error}`;
          }
        },
        {
          name: 'get_top_deals',
          description: 'Get the highest-scoring deals across all buy boxes. Great for finding the best investment opportunities.',
          schema: z.object({
            limit: z.number().optional().default(10).describe('Number of top deals to return'),
            state: z.string().optional().describe('Filter by state'),
            minScore: z.number().optional().default(50).describe('Minimum score percentage'),
          }),
        }
      ),

      // ============================================================
      // CONTEXT TOOLS - Get/manage conversation focus
      // ============================================================
      tool(
        async () => {
          const fullContext = this.getFullContext();
          const hasAnyContext = fullContext.property.id || fullContext.buyer.id ||
            fullContext.contact.id || fullContext.buyBox.id || fullContext.pipeline.id;

          if (!hasAnyContext) {
            return JSON.stringify({
              success: true,
              hasContext: false,
              message: 'No entities currently in context. Ask the user which property, buyer, or contact they mean.',
            });
          }

          // Build context response with all active entities
          const response: any = {
            success: true,
            hasContext: true,
            summary: this.getContextSummary(),
          };

          if (fullContext.property.id) {
            response.property = {
              id: fullContext.property.id,
              address: fullContext.property.address,
              city: fullContext.property.city,
              state: fullContext.property.state,
              price: fullContext.property.price,
              lastMentionedAt: fullContext.property.lastMentionedAt,
            };
          }

          if (fullContext.buyer.id) {
            response.buyer = {
              id: fullContext.buyer.id,
              name: fullContext.buyer.name,
              company: fullContext.buyer.company,
              lastMentionedAt: fullContext.buyer.lastMentionedAt,
            };
          }

          if (fullContext.contact.id) {
            response.contact = {
              id: fullContext.contact.id,
              name: fullContext.contact.name,
              role: fullContext.contact.role,
              lastMentionedAt: fullContext.contact.lastMentionedAt,
            };
          }

          if (fullContext.buyBox.id) {
            response.buyBox = {
              id: fullContext.buyBox.id,
              name: fullContext.buyBox.name,
              fundName: fullContext.buyBox.fundName,
              lastMentionedAt: fullContext.buyBox.lastMentionedAt,
            };
          }

          if (fullContext.pipeline.id) {
            response.pipeline = {
              id: fullContext.pipeline.id,
              stage: fullContext.pipeline.stage,
              propertyAddress: fullContext.pipeline.propertyAddress,
              lastMentionedAt: fullContext.pipeline.lastMentionedAt,
            };
          }

          return JSON.stringify(response);
        },
        {
          name: 'get_current_context',
          description: 'Get all currently focused entities (property, buyer, contact, buy box, pipeline). Use when user refers to "it", "this deal", "the buyer", "that contact", etc. The context is auto-injected into the conversation, so you rarely need to call this explicitly.',
          schema: z.object({}),
        }
      ),

      // ============================================================
      // PROPERTY CREATION & UPDATE TOOLS
      // ============================================================
      tool(
        async ({ street, city, state, zip, price, bedrooms, bathrooms, sqft, propertyType, arv, rehabCost, runPipeline, enrichWithMarketData }) => {
          try {
            // Validate required fields
            if (!city || city.trim() === '') {
              return JSON.stringify({
                success: false,
                error: 'City is required. Please provide the city name (e.g., "Austin", "Dallas").',
              });
            }
            if (!state || state.trim() === '' || state.trim().length !== 2) {
              return JSON.stringify({
                success: false,
                error: 'State is required. Please provide the two-letter state code (e.g., "TX", "FL", "CA").',
              });
            }
            if (!street || street.trim() === '') {
              return JSON.stringify({
                success: false,
                error: 'Street address is required.',
              });
            }

            // Normalize values
            const normalizedState = state.trim().toUpperCase();
            const normalizedCity = city.trim();
            const normalizedStreet = street.trim();
            const normalizedZip = zip?.trim() || '';

            // Create the normalized deal
            const deal: any = {
              sourceId: 'agent',
              sourceName: 'AI Agent',
              address: {
                street: normalizedStreet,
                city: normalizedCity,
                state: normalizedState,
                zip: normalizedZip
              },
              askingPrice: price,
              bedrooms,
              bathrooms,
              sqft,
              propertyType: propertyType || 'Single Family',
              arv,
              repairEstimate: rehabCost,
              normalizedAt: new Date(),
              confidence: 1.0,
              rawData: {},
            };

            // Save to database and enqueue processing if requested
            const result = await dealIntakeService.ingestDeal(deal, {
              enrichWithMarketData: enrichWithMarketData !== false,
              queueProcessing: runPipeline !== false,
            });

            if (!result.success) {
              return `Failed to create property: ${result.error}`;
            }

            // Set property context so user can reference "it" or "this deal"
            this.setPropertyContext(result.propertyId!, normalizedStreet, normalizedCity, normalizedState);

            // Build response with clear duplicate/update messaging
            const response: any = {
              success: true,
              propertyId: result.propertyId,
              action: result.action,
            };

            // Add clear status message based on action
            if (result.action === 'duplicate') {
              response.status = 'DUPLICATE_FOUND';
              response.message = `This property already exists in the system as ${result.propertyId}. No changes were made.`;
              response.existingPropertyId = result.duplicateOf || result.propertyId;
            } else if (result.action === 'updated') {
              response.status = 'EXISTING_UPDATED';
              response.message = `Property ${result.propertyId} already existed and has been updated with the new information.`;
            } else if (result.action === 'created') {
              response.status = 'NEW_CREATED';
              response.message = `New property ${result.propertyId} has been created successfully.`;
            }

            // Include enrichment data if available
            if (result.enriched && result.enrichmentData) {
              response.enrichment = {
                enriched: true,
                zestimate: result.enrichmentData.zestimate,
                rentZestimate: result.enrichmentData.rentZestimate,
                ownerName: result.enrichmentData.ownerName,
                comparablesCount: result.enrichmentData.comparablesCount,
              };
            } else if (enrichWithMarketData !== false) {
              response.enrichment = { enriched: false, reason: 'Market data not available for this address' };
            }

            // Run through pipeline if requested (default: true)
            if (runPipeline !== false) {
              // Score against all buy boxes
              const scoringResults = await dealProcessingService.scoreDeal(deal);

              // Format scoring results
              const matches = scoringResults
                .filter((r: any) => r.percentage >= 50)
                .map((r: any) => `${r.buyBoxName}: ${r.percentage}%`)
                .join(', ');

              const autoSubmits = scoringResults
                .filter((r: any) => r.percentage >= (r.autoSubmitThreshold || 80))
                .map((r: any) => r.buyBoxName);

              const topMatches = scoringResults
                .filter((r: any) => r.percentage >= 70)
                .slice(0, 3);

              response.pipeline = {
                stage: 'new',
                scored: true,
                matchingBuyBoxes: matches || 'None',
                autoSubmitTo: autoSubmits.length > 0 ? autoSubmits : 'None (below threshold)',
                topMatches: topMatches.map((m: any) => ({ fund: m.buyBoxName, score: m.percentage })),
              };
            }

            // Add smart next steps
            response.nextSteps = [];
            if (response.action === 'created') {
              response.nextSteps.push('Run compliance check to verify deal legitimacy');
              if (!response.enrichment?.enriched) {
                response.nextSteps.push('Verify property details manually (Zillow data unavailable)');
              }
              if (response.pipeline?.topMatches?.length > 0) {
                response.nextSteps.push(`Send to top matching funds: ${response.pipeline.topMatches.map((m: any) => m.fund).join(', ')}`);
              }
            }

            response.suggestedActions = [
              { action: 'run_compliance_check', description: 'Verify deal compliance' },
              { action: 'get_deal_intelligence', description: 'Get AI analysis & recommendations' },
              { action: 'get_deal_status', description: 'View pipeline status and requirements' },
            ];

            return JSON.stringify(response);
          } catch (error) {
            return `Error creating property: ${error}`;
          }
        },
        {
          name: 'create_property',
          description: 'Create a new property in the database, automatically enrich with Zillow market data (Zestimate, owner info), and score against all buy boxes. IMPORTANT: You MUST provide city and state - these are required fields. If the user provides a full address like "123 Main St, Austin, TX 78701", extract the city (Austin) and state (TX) from it.',
          schema: z.object({
            street: z.string().min(1).describe('Street address (e.g., "123 Main St")'),
            city: z.string().min(1).describe('City name - REQUIRED (e.g., "Austin", "Dallas", "Houston")'),
            state: z.string().min(2).max(2).describe('Two-letter state code - REQUIRED (e.g., "TX", "FL", "CA")'),
            zip: z.string().min(5).describe('ZIP code (e.g., "78701")'),
            price: z.number().describe('Listing price'),
            bedrooms: z.number().optional().describe('Number of bedrooms'),
            bathrooms: z.number().optional().describe('Number of bathrooms'),
            sqft: z.number().optional().describe('Square footage'),
            propertyType: z.string().optional().default('Single Family').describe('Property type'),
            arv: z.number().optional().describe('After Repair Value'),
            rehabCost: z.number().optional().describe('Estimated repair cost'),
            runPipeline: z.boolean().optional().default(true).describe('Run through scoring pipeline automatically'),
            enrichWithMarketData: z.boolean().optional().default(true).describe('Auto-enrich with Zillow data (Zestimate, owner info, comps)'),
          }),
        }
      ),

      // ============================================================
      // NEW: IMPORT FROM URL
      // ============================================================
      tool(
        async ({ url }) => {
          try {
            const firecrawlKey = process.env.FIRECRAWL_API_KEY;
            if (!firecrawlKey) {
              return 'Firecrawl API key not configured. Cannot scrape listing URL.';
            }

            const firecrawl = new Firecrawl({ apiKey: firecrawlKey });

            // Scrape the listing URL
            const result = await firecrawl.scrapeUrl(url, {
              formats: ['markdown'],
            });

            if (!result.success) {
              return `Failed to scrape URL: ${(result as any).error || 'Unknown error'}`;
            }

            const content = result.markdown || '';

            // Extract property data using patterns
            const extractNumber = (patterns: RegExp[]): number | undefined => {
              for (const pattern of patterns) {
                const match = content.match(pattern);
                if (match) {
                  const num = parseFloat(match[1].replace(/,/g, ''));
                  if (!isNaN(num)) return num;
                }
              }
              return undefined;
            };

            const extractString = (patterns: RegExp[]): string | undefined => {
              for (const pattern of patterns) {
                const match = content.match(pattern);
                if (match) return match[1].trim();
              }
              return undefined;
            };

            // Price patterns
            const price = extractNumber([
              /\$([0-9,]+(?:\.[0-9]+)?)\s*(?:asking|list|sale)/i,
              /(?:price|asking|list).*?\$([0-9,]+)/i,
              /\$([0-9,]+)/,
            ]);

            // Bedrooms
            const bedrooms = extractNumber([
              /(\d+)\s*(?:bed|bedroom|br|bd)/i,
              /(?:bed|bedroom|br).*?(\d+)/i,
            ]);

            // Bathrooms
            const bathrooms = extractNumber([
              /(\d+(?:\.\d+)?)\s*(?:bath|bathroom|ba)/i,
              /(?:bath|bathroom|ba).*?(\d+(?:\.\d+)?)/i,
            ]);

            // Square feet
            const sqft = extractNumber([
              /([0-9,]+)\s*(?:sq\.?\s*ft|sqft|square feet)/i,
              /(?:sq\.?\s*ft|sqft).*?([0-9,]+)/i,
            ]);

            // Address - try to find full address
            const addressMatch = content.match(
              /(\d+\s+[^,\n]+),?\s*([A-Za-z\s]+),?\s*([A-Z]{2})\s*(\d{5})/i
            );

            // Property type
            const propertyType = extractString([
              /(?:property type|type):\s*([^\n,]+)/i,
              /(single family|condo|townhouse|multi-family|duplex|triplex)/i,
            ]) || 'Single Family';

            if (!addressMatch && !price) {
              return JSON.stringify({
                success: false,
                error: 'Could not extract property data from URL',
                rawContent: content.substring(0, 500),
                hint: 'Try providing the property details manually using create_property',
              });
            }

            const extractedData = {
              url,
              street: addressMatch?.[1] || 'Unknown',
              city: addressMatch?.[2] || 'Unknown',
              state: addressMatch?.[3] || 'XX',
              zip: addressMatch?.[4] || '00000',
              price: price || 0,
              bedrooms: bedrooms || 0,
              bathrooms: bathrooms || 0,
              sqft: sqft || 0,
              propertyType,
              source: new URL(url).hostname,
            };

            // Save to database
            if (extractedData.price > 0 && extractedData.street !== 'Unknown') {
              const saveResult = await dealIntakeService.ingestDeal({
                sourceId: 'url-import',
                sourceName: `URL Import (${extractedData.source})`,
                address: {
                  street: extractedData.street,
                  city: extractedData.city,
                  state: extractedData.state,
                  zip: extractedData.zip,
                },
                askingPrice: extractedData.price,
                bedrooms: extractedData.bedrooms,
                bathrooms: extractedData.bathrooms,
                sqft: extractedData.sqft,
                propertyType: extractedData.propertyType,
                normalizedAt: new Date(),
                confidence: 0.8,
                rawData: { sourceUrl: url },
              }, { queueProcessing: true, enrichWithMarketData: true });

              return JSON.stringify({
                success: true,
                extracted: extractedData,
                saved: saveResult.success,
                propertyId: saveResult.propertyId,
                action: saveResult.action,
              });
            }

            return JSON.stringify({
              success: true,
              extracted: extractedData,
              saved: false,
              reason: 'Incomplete data - review and use create_property to save',
            });
          } catch (error) {
            return `Error importing from URL: ${error}`;
          }
        },
        {
          name: 'import_from_url',
          description: 'Import a property from any listing URL (Zillow, Redfin, Realtor, etc). Automatically extracts and saves property data.',
          schema: z.object({
            url: z.string().describe('The listing URL to import from'),
          }),
        }
      ),

      // ============================================================
      // DEAL ANALYSIS TOOLS
      // ============================================================
      tool(
        async ({ address, city, state, askingPrice, arv, rehabCost, bedrooms, bathrooms, sqft }) => {
          try {
            // Calculate basic metrics
            const estimatedArv = arv || askingPrice * 1.3;
            const estimatedRehab = rehabCost || askingPrice * 0.1;
            const maxAllowableOffer = estimatedArv * 0.7 - estimatedRehab;
            const potentialProfit = estimatedArv - askingPrice - estimatedRehab;
            const roi = ((potentialProfit / askingPrice) * 100).toFixed(1);
            const cashOnCash = ((potentialProfit / (askingPrice * 0.25)) * 100).toFixed(1); // Assuming 25% down

            // Calculate price per sqft if available
            const pricePerSqft = sqft ? Math.round(askingPrice / sqft) : null;

            // Generate AI insights
            const insights: string[] = [];

            if (parseFloat(roi) >= 20) {
              insights.push('Excellent ROI potential - prioritize this deal');
            } else if (parseFloat(roi) >= 10) {
              insights.push('Good ROI - worth pursuing');
            } else if (parseFloat(roi) < 5) {
              insights.push('Low margin - negotiate aggressively or pass');
            }

            if (askingPrice <= maxAllowableOffer) {
              insights.push('Price is below MAO - strong buying position');
            } else {
              const overMao = ((askingPrice - maxAllowableOffer) / maxAllowableOffer * 100).toFixed(0);
              insights.push(`Price is ${overMao}% above MAO - needs negotiation`);
            }

            if (estimatedRehab / askingPrice > 0.2) {
              insights.push('High rehab ratio - verify repair estimates carefully');
            }

            return JSON.stringify({
              analysis: {
                askingPrice,
                estimatedARV: estimatedArv,
                estimatedRehab: estimatedRehab,
                maxAllowableOffer: Math.round(maxAllowableOffer),
                potentialProfit: Math.round(potentialProfit),
                roi: `${roi}%`,
                cashOnCashReturn: `${cashOnCash}%`,
                pricePerSqft: pricePerSqft ? `$${pricePerSqft}` : 'N/A',
                recommendation: potentialProfit > 0 ?
                  (askingPrice <= maxAllowableOffer ? 'STRONG BUY' : 'NEGOTIATE DOWN') :
                  'PASS - Negative margin',
              },
              dealDetails: {
                address: `${address}, ${city}, ${state}`,
                bedrooms,
                bathrooms,
                sqft,
              },
              insights,
            });
          } catch (error) {
            return `Error analyzing deal: ${error}`;
          }
        },
        {
          name: 'analyze_deal',
          description: 'Deep analysis of a deal including ROI, MAO (70% rule), cash-on-cash return, and AI-powered insights',
          schema: z.object({
            address: z.string().describe('Property address'),
            city: z.string().describe('City'),
            state: z.string().describe('State'),
            askingPrice: z.number().describe('Current asking price'),
            arv: z.number().optional().describe('After Repair Value (if known)'),
            rehabCost: z.number().optional().describe('Estimated repair cost (if known)'),
            bedrooms: z.number().optional().describe('Number of bedrooms'),
            bathrooms: z.number().optional().describe('Number of bathrooms'),
            sqft: z.number().optional().describe('Square footage'),
          }),
        }
      ),

      tool(
        async ({ address, city, state, zip, askingPrice, bedrooms, bathrooms, sqft, yearBuilt, propertyType }) => {
          try {
            const deal = {
              address: { street: address, city, state, zip },
              askingPrice,
              bedrooms,
              bathrooms,
              sqft,
              yearBuilt,
              propertyType: propertyType || 'Single Family',
            };

            const results = await dealProcessingService.scoreDeal(deal as any);

            if (results.length === 0) {
              return 'No buy boxes registered. Create buy boxes first.';
            }

            return JSON.stringify({
              scores: results.map((r: any) => ({
                buyBox: r.buyBoxName,
                score: `${r.percentage}%`,
                matchType: r.matchType,
                autoSubmit: r.percentage >= (r.autoSubmitThreshold || 80),
                fundContact: r.contactEmail || null,
              })),
              summary: {
                totalBuyBoxes: results.length,
                strongMatches: results.filter((r: any) => r.percentage >= 80).length,
                moderateMatches: results.filter((r: any) => r.percentage >= 60 && r.percentage < 80).length,
                weakMatches: results.filter((r: any) => r.percentage >= 50 && r.percentage < 60).length,
              },
            });
          } catch (error) {
            return `Error scoring deal: ${error}`;
          }
        },
        {
          name: 'score_deal_against_buyboxes',
          description: 'Score a deal against all registered hedge fund buy boxes to find matches and get fund contact info',
          schema: z.object({
            address: z.string().describe('Property address'),
            city: z.string().describe('City'),
            state: z.string().describe('State'),
            zip: z.string().describe('ZIP code'),
            askingPrice: z.number().describe('Asking price'),
            bedrooms: z.number().optional().describe('Number of bedrooms'),
            bathrooms: z.number().optional().describe('Number of bathrooms'),
            sqft: z.number().optional().describe('Square footage'),
            yearBuilt: z.number().optional().describe('Year built'),
            propertyType: z.string().optional().describe('Property type'),
          }),
        }
      ),

      // ============================================================
      // BUY BOX TOOLS
      // ============================================================
      tool(
        async () => {
          try {
            const buyBoxes = dealProcessingService.getAllBuyBoxes();

            if (buyBoxes.length === 0) {
              return 'No buy boxes registered. Use create_buybox to add one.';
            }

            return JSON.stringify(buyBoxes.map((bb: any) => ({
              id: bb.id,
              name: bb.name,
              enabled: bb.enabled,
              fundName: bb.fundName,
              contactEmail: bb.contactEmail,
              states: bb.criteria?.states?.join(', ') || 'Any',
              priceRange: bb.criteria?.minPrice && bb.criteria?.maxPrice
                ? `$${bb.criteria.minPrice.toLocaleString()} - $${bb.criteria.maxPrice.toLocaleString()}`
                : 'Any',
              bedroomRange: bb.criteria?.minBedrooms && bb.criteria?.maxBedrooms
                ? `${bb.criteria.minBedrooms} - ${bb.criteria.maxBedrooms}`
                : 'Any',
              autoSubmitThreshold: bb.autoSubmitThreshold || 80,
            })));
          } catch (error) {
            return `Error listing buy boxes: ${error}`;
          }
        },
        {
          name: 'list_buyboxes',
          description: 'List all registered hedge fund buy boxes with their criteria and contact info',
          schema: z.object({}),
        }
      ),

      // ============================================================
      // NEW: CREATE BUY BOX (Enhanced with all criteria)
      // ============================================================
      tool(
        async (params) => {
          try {
            const {
              name, fundName, contactEmail, description, priority,
              states, counties, minPrice, maxPrice,
              minBedrooms, maxBedrooms, minBathrooms, maxBathrooms,
              minSqft, maxSqft, minYearBuilt, maxYearBuilt, minGarages,
              propertyTypes, conditionLevels, investmentStrategies,
              allowPool, allowSeptic, allowSolarPanels, allowCarport,
              allowMainRoad, allowFloodZone, allowFireDamage,
              allowFoundationIssues, allowStructuralIssues,
              allowAgeRestrictions, allowLeasingRestrictions,
              minGrossYield, minSchoolScore, hardNos,
              autoSubmitThreshold,
            } = params;

            const buyBoxData = {
              name,
              description: description || '',
              fundName: fundName || name,
              contactEmail,
              enabled: true,
              priority: priority || 1,
              autoSubmitEnabled: !!autoSubmitThreshold,
              autoSubmitThreshold: autoSubmitThreshold || 80,
              criteria: {
                states: states || [],
                counties: counties || [],
                minPrice,
                maxPrice,
                minBedrooms,
                maxBedrooms,
                minBathrooms,
                maxBathrooms,
                minSqft,
                maxSqft,
                minYearBuilt,
                maxYearBuilt,
                minGarages,
                propertyTypes: propertyTypes || ['Single Family'],
                conditionLevels: conditionLevels || [],
                investmentStrategies: investmentStrategies || [],
                allowPool: allowPool !== false,
                allowSeptic: allowSeptic !== false,
                allowSolarPanels: allowSolarPanels !== false,
                allowCarport: allowCarport !== false,
                allowMainRoad: allowMainRoad !== false,
                allowFloodZone: allowFloodZone !== false,
                allowFireDamage: allowFireDamage !== false,
                allowFoundationIssues: allowFoundationIssues !== false,
                allowStructuralIssues: allowStructuralIssues !== false,
                allowAgeRestrictions: allowAgeRestrictions !== false,
                allowLeasingRestrictions: allowLeasingRestrictions !== false,
                minGrossYield,
                minSchoolScore,
                hardNos: hardNos || '',
              },
              weights: {
                locationWeight: 20,
                priceWeight: 20,
                propertyTypeWeight: 15,
                bedroomsWeight: 15,
                bathroomsWeight: 10,
                sqftWeight: 10,
                yearBuiltWeight: 5,
                conditionWeight: 5,
              },
            };

            // Save to database
            const created = await HedgeFundBuyBox.create(buyBoxData as any);

            // Reload buy boxes in scoring engine
            await dealProcessingService.loadBuyBoxesFromDatabase();

            // Build summary of criteria
            const criteriaSummary: string[] = [];
            if (states?.length) criteriaSummary.push(`States: ${states.join(', ')}`);
            if (counties?.length) criteriaSummary.push(`Counties: ${counties.join(', ')}`);
            if (minPrice || maxPrice) {
              const priceRange = minPrice && maxPrice
                ? `$${minPrice.toLocaleString()} - $${maxPrice.toLocaleString()}`
                : minPrice ? `$${minPrice.toLocaleString()}+` : `Up to $${maxPrice?.toLocaleString()}`;
              criteriaSummary.push(`Price: ${priceRange}`);
            }
            if (minBedrooms || maxBedrooms) criteriaSummary.push(`Beds: ${minBedrooms || 0}-${maxBedrooms || 'any'}`);
            if (minBathrooms || maxBathrooms) criteriaSummary.push(`Baths: ${minBathrooms || 0}-${maxBathrooms || 'any'}`);
            if (minSqft || maxSqft) criteriaSummary.push(`Sqft: ${minSqft || 0}-${maxSqft || 'any'}`);
            if (propertyTypes?.length) criteriaSummary.push(`Types: ${propertyTypes.join(', ')}`);
            if (investmentStrategies?.length) criteriaSummary.push(`Strategies: ${investmentStrategies.join(', ')}`);

            // Build exclusions list
            const exclusions: string[] = [];
            if (allowPool === false) exclusions.push('pools');
            if (allowSeptic === false) exclusions.push('septic');
            if (allowFloodZone === false) exclusions.push('flood zones');
            if (allowFireDamage === false) exclusions.push('fire damage');
            if (allowFoundationIssues === false) exclusions.push('foundation issues');
            if (allowStructuralIssues === false) exclusions.push('structural issues');
            if (exclusions.length) criteriaSummary.push(`Excludes: ${exclusions.join(', ')}`);

            return JSON.stringify({
              success: true,
              buyBox: {
                id: (created as any).id,
                name: (created as any).name,
                fundName: (created as any).fundName,
                contactEmail: (created as any).contactEmail,
              },
              criteria: criteriaSummary,
              message: 'Buy box created and activated! Deals will now be scored against it.',
            });
          } catch (error) {
            return `Error creating buy box: ${error}`;
          }
        },
        {
          name: 'create_buybox',
          description: 'Create a new hedge fund buy box with comprehensive investment criteria. Supports location, price, property specs, condition, investment strategy, and exclusion rules.',
          schema: z.object({
            // Basic info
            name: z.string().describe('Buy box name (e.g., "Texas SFR Under 300k")'),
            fundName: z.string().optional().describe('Fund/investor name'),
            contactEmail: z.string().optional().describe('Contact email for this fund'),
            description: z.string().optional().describe('Description of investment criteria'),
            priority: z.number().optional().describe('Priority (1-100, higher = more important)'),

            // Location criteria
            states: z.array(z.string()).optional().describe('Target states (e.g., ["TX", "FL", "GA"])'),
            counties: z.array(z.string()).optional().describe('Target counties (e.g., ["Harris", "Dallas"])'),

            // Price criteria
            minPrice: z.number().optional().describe('Minimum property price'),
            maxPrice: z.number().optional().describe('Maximum property price'),

            // Property specs
            minBedrooms: z.number().optional().describe('Minimum bedrooms'),
            maxBedrooms: z.number().optional().describe('Maximum bedrooms'),
            minBathrooms: z.number().optional().describe('Minimum bathrooms'),
            maxBathrooms: z.number().optional().describe('Maximum bathrooms'),
            minSqft: z.number().optional().describe('Minimum square footage'),
            maxSqft: z.number().optional().describe('Maximum square footage'),
            minYearBuilt: z.number().optional().describe('Minimum year built (e.g., 1980)'),
            maxYearBuilt: z.number().optional().describe('Maximum year built'),
            minGarages: z.number().optional().describe('Minimum garage spaces'),
            propertyTypes: z.array(z.string()).optional().describe('Property types: Single Family, Condo, Townhouse, Multi-Family, Mobile Home'),

            // Condition & strategy
            conditionLevels: z.array(z.string()).optional().describe('Allowed conditions: light, medium, heavy'),
            investmentStrategies: z.array(z.string()).optional().describe('Strategies: fix_flip, long_term_rental, short_term_rental, wholesale, novation, subject_to'),

            // Exclusion flags (set to false to exclude)
            allowPool: z.boolean().optional().describe('Allow properties with pools (default: true)'),
            allowSeptic: z.boolean().optional().describe('Allow septic systems (default: true)'),
            allowSolarPanels: z.boolean().optional().describe('Allow solar panels (default: true)'),
            allowCarport: z.boolean().optional().describe('Allow carports (default: true)'),
            allowMainRoad: z.boolean().optional().describe('Allow main road locations (default: true)'),
            allowFloodZone: z.boolean().optional().describe('Allow flood zone properties (default: true)'),
            allowFireDamage: z.boolean().optional().describe('Allow fire damaged properties (default: true)'),
            allowFoundationIssues: z.boolean().optional().describe('Allow foundation issues (default: true)'),
            allowStructuralIssues: z.boolean().optional().describe('Allow structural issues (default: true)'),
            allowAgeRestrictions: z.boolean().optional().describe('Allow age-restricted communities (default: true)'),
            allowLeasingRestrictions: z.boolean().optional().describe('Allow leasing restrictions (default: true)'),

            // Yield & quality
            minGrossYield: z.number().optional().describe('Minimum gross yield (e.g., 0.08 for 8%)'),
            minSchoolScore: z.number().optional().describe('Minimum school score (1-10)'),
            hardNos: z.string().optional().describe('Hard no criteria as text (e.g., "no mold, no termite damage")'),

            // Auto-submit
            autoSubmitThreshold: z.number().optional().describe('Score threshold for auto-submission (e.g., 85)'),
          }),
        }
      ),

      // ============================================================
      // AUCTION SITE TOOLS
      // ============================================================
      tool(
        async () => {
          try {
            const sites = auctionSubmissionPlugin.getAllSites();
            return JSON.stringify(sites.map((s: any) => ({
              id: s.id,
              name: s.name,
              type: s.type,
              enabled: s.enabled,
              hasCredentials: !!s.credentials?.username,
              lastSubmission: s.lastSubmission || 'Never',
            })));
          } catch (error) {
            return `Error listing auction sites: ${error}`;
          }
        },
        {
          name: 'list_auction_sites',
          description: 'List all configured auction sites for property submission (Xome, Hubzu, etc)',
          schema: z.object({}),
        }
      ),

      tool(
        async ({ propertyId, siteId }) => {
          try {
            const property = await Property.findOne({ where: { propertyId } });
            if (!property) {
              return `Property ${propertyId} not found.`;
            }

            const p = property as any;
            const deal = {
              address: {
                street: `${p.address?.houseNumber || ''} ${p.address?.street || ''}`.trim(),
                city: p.city,
                state: p.state,
                zip: p.zip,
              },
              askingPrice: p.mlsListingPrice || p.buyItNowPrice,
              bedrooms: p.bedroomCount,
              bathrooms: p.bathroomCount,
              sqft: p.livingSpaceSqFt,
              description: p.propertyListingDescription,
              photos: p.photoLinks,
            };

            const result = await auctionSubmissionPlugin.submitDeal(deal as any, siteId);

            if (result.success) {
              return `Successfully submitted to ${siteId}! Confirmation: ${result.confirmationNumber || 'Pending'}`;
            } else {
              return `Failed to submit: ${result.error}`;
            }
          } catch (error) {
            return `Error submitting property: ${error}`;
          }
        },
        {
          name: 'submit_property_to_site',
          description: 'Submit a property from the database to an auction site',
          schema: z.object({
            propertyId: z.string().describe('The property ID to submit'),
            siteId: z.string().describe('The auction site ID (e.g., xome, hubzu, zillow)'),
          }),
        }
      ),

      // ============================================================
      // STATISTICS & INSIGHTS TOOLS
      // ============================================================
      tool(
        async ({ state, city }) => {
          try {
            const where: any = {};
            if (state) where.state = { [Op.iLike]: state };
            if (city) where.city = { [Op.iLike]: `%${city}%` };

            const properties = await Property.findAll({ where });

            if (properties.length === 0) {
              return 'No properties found in this area.';
            }

            const prices = properties
              .map((p: any) => p.mlsListingPrice || p.buyItNowPrice)
              .filter((p: any) => p && p > 0);

            const bedrooms = properties
              .map((p: any) => p.bedroomCount)
              .filter((b: any) => b && b > 0);

            const sqfts = properties
              .map((p: any) => p.livingSpaceSqFt)
              .filter((s: any) => s && s > 0);

            const avgPrice = prices.length > 0
              ? Math.round(prices.reduce((a: number, b: number) => a + Number(b), 0) / prices.length)
              : 0;
            const medianPrice = prices.length > 0
              ? prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]
              : 0;
            const minPrice = prices.length > 0 ? Math.min(...prices.map(Number)) : 0;
            const maxPrice = prices.length > 0 ? Math.max(...prices.map(Number)) : 0;
            const avgBedrooms = bedrooms.length > 0
              ? (bedrooms.reduce((a: number, b: number) => a + b, 0) / bedrooms.length).toFixed(1)
              : 0;
            const avgSqft = sqfts.length > 0
              ? Math.round(sqfts.reduce((a: number, b: number) => a + b, 0) / sqfts.length)
              : 0;
            const avgPricePerSqft = avgSqft > 0 ? Math.round(avgPrice / avgSqft) : 0;

            return JSON.stringify({
              area: city ? `${city}, ${state || 'All States'}` : state || 'All Areas',
              inventory: {
                totalProperties: properties.length,
                propertyTypes: [...new Set(properties.map((p: any) => p.propertyType))].filter(Boolean),
              },
              pricing: {
                averagePrice: `$${avgPrice.toLocaleString()}`,
                medianPrice: `$${medianPrice.toLocaleString()}`,
                priceRange: `$${minPrice.toLocaleString()} - $${maxPrice.toLocaleString()}`,
                avgPricePerSqft: `$${avgPricePerSqft}`,
              },
              characteristics: {
                averageBedrooms: avgBedrooms,
                averageSqft: avgSqft.toLocaleString(),
              },
            });
          } catch (error) {
            return `Error getting market stats: ${error}`;
          }
        },
        {
          name: 'get_market_stats',
          description: 'Get comprehensive market statistics for a specific area (prices, inventory, property types)',
          schema: z.object({
            state: z.string().optional().describe('State to analyze'),
            city: z.string().optional().describe('City to analyze'),
          }),
        }
      ),

      // ============================================================
      // WEB SCRAPING TOOLS
      // ============================================================
      tool(
        async ({ url }) => {
          try {
            const firecrawlKey = process.env.FIRECRAWL_API_KEY;
            if (!firecrawlKey) {
              return 'Firecrawl API key not configured. Set FIRECRAWL_API_KEY in environment.';
            }

            const firecrawl = new Firecrawl({ apiKey: firecrawlKey });

            // Scrape the URL
            const result = await firecrawl.scrapeUrl(url, {
              formats: ['markdown'],
            });

            if (!result.success) {
              return `Failed to scrape URL: ${(result as any).error || 'Unknown error'}`;
            }

            // Return markdown content (truncated if too long)
            const content = result.markdown || 'No content extracted';
            const truncated = content.length > 8000 ? content.substring(0, 8000) + '\n\n... [truncated]' : content;

            return JSON.stringify({
              url: url,
              title: result.metadata?.title || 'Unknown',
              description: result.metadata?.description || '',
              content: truncated,
            });
          } catch (error) {
            return `Error scraping URL: ${error}`;
          }
        },
        {
          name: 'scrape_website',
          description: 'Scrape content from any website URL and return it as markdown.',
          schema: z.object({
            url: z.string().describe('The full URL to scrape'),
          }),
        }
      ),

      tool(
        async ({ url, maxPages }) => {
          try {
            const firecrawlKey = process.env.FIRECRAWL_API_KEY;
            if (!firecrawlKey) {
              return 'Firecrawl API key not configured. Set FIRECRAWL_API_KEY in environment.';
            }

            const firecrawl = new Firecrawl({ apiKey: firecrawlKey });

            // Map the website to discover all pages
            const result = await firecrawl.mapUrl(url, {
              limit: maxPages || 50,
            } as any);

            if (!result.success) {
              return `Failed to map URL: ${(result as any).error || 'Unknown error'}`;
            }

            return JSON.stringify({
              url: url,
              pagesFound: result.links?.length || 0,
              pages: result.links?.slice(0, 20) || [], // Return first 20 URLs
            });
          } catch (error) {
            return `Error mapping URL: ${error}`;
          }
        },
        {
          name: 'map_website',
          description: 'Discover all pages/URLs on a website. Useful for understanding site structure before scraping.',
          schema: z.object({
            url: z.string().describe('The base URL to map'),
            maxPages: z.number().optional().default(50).describe('Maximum number of pages to discover'),
          }),
        }
      ),

      // ============================================================
      // NEW: SEND DEAL TO FUND
      // ============================================================
      tool(
        async ({ propertyId, fundName, customMessage }) => {
          try {
            // Get property details
            const property = await Property.findOne({ where: { propertyId } });
            if (!property) {
              return `Property ${propertyId} not found.`;
            }

            // Find matching buy box for the fund
            const buyBoxes = dealProcessingService.getAllBuyBoxes();
            const fundBuyBox = buyBoxes.find((bb: any) =>
              bb.name.toLowerCase().includes(fundName.toLowerCase()) ||
              bb.fundName?.toLowerCase().includes(fundName.toLowerCase())
            );

            if (!fundBuyBox) {
              return `No buy box found for fund "${fundName}". Available funds: ${buyBoxes.map((b: any) => b.name).join(', ')}`;
            }

            const contactEmail = fundBuyBox.contactEmail;
            if (!contactEmail) {
              return `No contact email configured for ${fundBuyBox.name}. Update the buy box with contact info.`;
            }

            const p = property as any;
            const dealSummary = {
              address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim(),
              price: p.mlsListingPrice || p.buyItNowPrice,
              bedrooms: p.bedroomCount,
              bathrooms: p.bathroomCount,
              sqft: p.livingSpaceSqFt,
              yearBuilt: p.yearBuilt,
              propertyType: p.propertyType,
            };

            // In a real implementation, this would send an email
            // For now, return what would be sent
            return JSON.stringify({
              success: true,
              emailDetails: {
                to: contactEmail,
                fund: fundBuyBox.name,
                subject: `New Deal: ${dealSummary.address}`,
                property: dealSummary,
                customMessage: customMessage || 'New property matching your buy box criteria.',
              },
              note: 'Email functionality requires SMTP configuration. Details prepared for sending.',
            });
          } catch (error) {
            return `Error preparing email: ${error}`;
          }
        },
        {
          name: 'send_deal_to_fund',
          description: 'Send a property deal to a hedge fund contact via email',
          schema: z.object({
            propertyId: z.string().describe('The property ID to send'),
            fundName: z.string().describe('Name of the fund/buy box to send to'),
            customMessage: z.string().optional().describe('Optional custom message to include'),
          }),
        }
      ),

      // Send property report to any contact by email
      tool(
        async ({ propertyAddress, contactEmail, contactName, reportType, customMessage }) => {
          try {
            const { Property, Contact } = await import('../models');
            const { emailService } = await import('./emailService');

            // Find property by address
            let property = null;
            if (propertyAddress) {
              property = await Property.findOne({
                where: {
                  [Op.or]: [
                    { address: { [Op.iLike]: `%${propertyAddress}%` } },
                  ],
                },
              });
            }

            // Try to find contact if only name provided
            let email = contactEmail;
            let name = contactName || 'there';
            if (!email && contactName) {
              const contact = await Contact.findOne({
                where: {
                  [Op.or]: [
                    { name: { [Op.iLike]: `%${contactName}%` } },
                    { firstName: { [Op.iLike]: `%${contactName}%` } },
                    { lastName: { [Op.iLike]: `%${contactName}%` } },
                  ],
                },
              });
              if (contact) {
                email = contact.email;
                name = contact.name || `${contact.firstName} ${contact.lastName}`.trim();
              }
            }

            if (!email) {
              return JSON.stringify({
                success: false,
                error: 'No email address provided or found for the contact. Please provide an email address.',
              });
            }

            // Build property report
            let propertyDetails = null;
            if (property) {
              const p = property as any;
              propertyDetails = {
                address: p.address || 'N/A',
                city: p.city,
                state: p.state,
                zip: p.zip,
                price: p.mlsListingPrice || p.buyItNowPrice || p.purchaseContractPrice,
                bedrooms: p.bedroomCount,
                bathrooms: p.bathroomCount,
                sqft: p.livingSpaceSqFt,
                yearBuilt: p.yearBuilt,
                propertyType: p.propertyType,
                condition: p.condition,
                arv: p.arv,
                rehabCost: p.rehabCost,
                description: p.propertyListingDescription,
              };
            }

            const subject = property
              ? `Property Report: ${propertyDetails?.address}, ${propertyDetails?.city}, ${propertyDetails?.state}`
              : `Property Report from Dispotree`;

            // Try to send email if email service is available
            let emailSent = false;
            try {
              if (emailService && emailService.isReady && emailService.isReady()) {
                await emailService.sendEmail({
                  to: email,
                  subject,
                  html: `
                    <h2>Property Report</h2>
                    <p>Hi ${name},</p>
                    ${customMessage ? `<p>${customMessage}</p>` : ''}
                    ${propertyDetails ? `
                      <h3>Property Details</h3>
                      <ul>
                        <li><strong>Address:</strong> ${propertyDetails.address}, ${propertyDetails.city}, ${propertyDetails.state} ${propertyDetails.zip}</li>
                        <li><strong>Price:</strong> $${propertyDetails.price?.toLocaleString() || 'N/A'}</li>
                        <li><strong>Beds/Baths:</strong> ${propertyDetails.bedrooms || 'N/A'} / ${propertyDetails.bathrooms || 'N/A'}</li>
                        <li><strong>Sq Ft:</strong> ${propertyDetails.sqft?.toLocaleString() || 'N/A'}</li>
                        <li><strong>Year Built:</strong> ${propertyDetails.yearBuilt || 'N/A'}</li>
                        <li><strong>Property Type:</strong> ${propertyDetails.propertyType || 'N/A'}</li>
                        <li><strong>Condition:</strong> ${propertyDetails.condition || 'N/A'}</li>
                        ${propertyDetails.arv ? `<li><strong>ARV:</strong> $${propertyDetails.arv.toLocaleString()}</li>` : ''}
                        ${propertyDetails.rehabCost ? `<li><strong>Rehab Cost:</strong> $${propertyDetails.rehabCost.toLocaleString()}</li>` : ''}
                      </ul>
                      ${propertyDetails.description ? `<p><strong>Description:</strong> ${propertyDetails.description}</p>` : ''}
                    ` : '<p>No property details available.</p>'}
                    <p>Best regards,<br>Dispotree</p>
                  `,
                });
                emailSent = true;
              }
            } catch (emailError) {
              console.warn('Email send failed:', emailError);
            }

            return JSON.stringify({
              success: true,
              emailSent,
              recipient: { name, email },
              subject,
              property: propertyDetails,
              message: emailSent
                ? `Property report sent to ${name} at ${email}`
                : `Property report prepared for ${name} (${email}). Email service not configured - would send: ${subject}`,
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: `Error sending property report: ${error}`,
            });
          }
        },
        {
          name: 'send_property_report',
          description: 'Send a property report to any contact via email. Use this when user says things like "send the property report to Steve" or "email the deal details to the attorney".',
          schema: z.object({
            propertyAddress: z.string().optional().describe('Property address to include in report'),
            contactEmail: z.string().optional().describe('Email address to send to (e.g., steve@aol.com)'),
            contactName: z.string().optional().describe('Contact name - will look up email if not provided'),
            reportType: z.enum(['summary', 'detailed', 'investment']).optional().default('summary').describe('Type of report'),
            customMessage: z.string().optional().describe('Custom message to include in the email'),
          }),
        }
      ),

      // ============================================================
      // KNOWLEDGE BASE TOOLS
      // ============================================================
      tool(
        async ({ query, topK }) => {
          try {
            if (!knowledgeService.isReady()) {
              return 'Knowledge base not initialized. Please configure PINECONE_API_KEY and OPENAI_API_KEY.';
            }

            const results = await knowledgeService.search(query, topK || 5);

            if (results.length === 0) {
              return `No relevant documents found for: "${query}"`;
            }

            // Format results with source info
            const formattedResults = results.map((r, i) => ({
              rank: i + 1,
              relevance: `${(r.score * 100).toFixed(1)}%`,
              source: r.metadata.filename,
              excerpt: r.text.length > 500 ? r.text.substring(0, 500) + '...' : r.text,
            }));

            return JSON.stringify({
              query,
              resultsCount: results.length,
              results: formattedResults,
            });
          } catch (error) {
            return `Error searching knowledge base: ${error}`;
          }
        },
        {
          name: 'search_knowledge',
          description: 'Search the Pinecone vector knowledge base for information from indexed documents. This includes: buy box criteria from institutional investors (Tricon, Amherst, Peak Capital, Fortune, Mainstreet, Progress Residential, etc.), target states and markets, price ranges, property requirements, contact emails, real estate guides, and any uploaded PDFs. ALWAYS use this tool when users ask about buy box criteria, which investors/funds buy in certain states, investor requirements, or fund contacts.',
          schema: z.object({
            query: z.string().describe('The search query - what information are you looking for?'),
            topK: z.number().optional().default(5).describe('Number of results to return (default 5)'),
          }),
        }
      ),

      tool(
        async () => {
          try {
            if (!knowledgeService.isReady()) {
              return JSON.stringify({
                status: 'not_initialized',
                message: 'Knowledge base not configured. Set PINECONE_API_KEY and OPENAI_API_KEY.',
              });
            }

            const stats = await knowledgeService.getStats();
            const docs = knowledgeService.getDocuments();

            return JSON.stringify({
              status: stats.status,
              totalDocuments: stats.totalDocuments,
              totalChunks: stats.totalChunks,
              indexName: stats.indexName,
              lastUpdated: stats.lastUpdated,
              documents: docs.map(d => ({
                filename: d.filename,
                fileType: d.fileType,
                chunks: d.chunksCount,
                status: d.status,
                indexedAt: d.indexedAt,
              })),
              supportedFormats: knowledgeService.getSupportedExtensions(),
            });
          } catch (error) {
            return `Error getting knowledge stats: ${error}`;
          }
        },
        {
          name: 'get_knowledge_stats',
          description: 'Get statistics about the knowledge base - how many documents are indexed, what file types, etc.',
          schema: z.object({}),
        }
      ),

      // ============================================================
      // SETTINGS TOOLS
      // ============================================================
      tool(
        async ({ category }) => {
          try {
            const { settingsService } = await import('./settingsService');

            if (category) {
              const settings = await settingsService.getByCategory(category);
              return JSON.stringify({
                category,
                settings,
              });
            }

            const grouped = await settingsService.getAllGrouped();
            return JSON.stringify({
              settings: grouped,
              availableKeys: settingsService.getAvailableKeys(),
            });
          } catch (error) {
            return `Error getting settings: ${error}`;
          }
        },
        {
          name: 'get_settings',
          description: 'Get app settings. Optionally filter by category (enrichment, scoring, notifications, marketplace, api).',
          schema: z.object({
            category: z.enum(['enrichment', 'scoring', 'notifications', 'marketplace', 'api', 'general']).optional().describe('Optional category to filter by'),
          }),
        }
      ),

      tool(
        async ({ key, value }) => {
          try {
            const { settingsService } = await import('./settingsService');

            const availableKeys = settingsService.getAvailableKeys();
            if (!availableKeys.includes(key)) {
              return `Unknown setting key: ${key}. Available keys: ${availableKeys.join(', ')}`;
            }

            await settingsService.set(key, value);
            const updated = await settingsService.getInfo(key);

            return JSON.stringify({
              success: true,
              message: `Setting "${key}" updated to ${JSON.stringify(value)}`,
              setting: updated,
            });
          } catch (error) {
            return `Error updating setting: ${error}`;
          }
        },
        {
          name: 'update_setting',
          description: 'Update an app setting. Common settings: enrichment.enabled, scoring.enabled, scoring.autoSubmitThreshold, scoring.autoSubmitEnabled, notifications.webhook',
          schema: z.object({
            key: z.string().describe('The setting key (e.g., "enrichment.enabled")'),
            value: z.union([z.boolean(), z.number(), z.string()]).describe('The new value for the setting'),
          }),
        }
      ),

      tool(
        async ({ key }) => {
          try {
            const { settingsService } = await import('./settingsService');

            const availableKeys = settingsService.getAvailableKeys();
            if (!availableKeys.includes(key)) {
              return `Unknown setting key: ${key}. Available keys: ${availableKeys.join(', ')}`;
            }

            const defaultValue = await settingsService.reset(key);
            const updated = await settingsService.getInfo(key);

            return JSON.stringify({
              success: true,
              message: `Setting "${key}" reset to default value: ${JSON.stringify(defaultValue)}`,
              setting: updated,
            });
          } catch (error) {
            return `Error resetting setting: ${error}`;
          }
        },
        {
          name: 'reset_setting',
          description: 'Reset a setting to its default value',
          schema: z.object({
            key: z.string().describe('The setting key to reset'),
          }),
        }
      ),

      // ============================================================
      // COMPLIANCE TOOLS
      // ============================================================
      tool(
        async ({ propertyAddress, propertyId }) => {
          try {
            const { complianceService } = await import('./ComplianceService');
            const { ComplianceCheck } = await import('../models');

            // Find the property
            let property;
            if (propertyId) {
              property = await Property.findOne({
                where: {
                  [Op.or]: [
                    { id: !isNaN(Number(propertyId)) ? Number(propertyId) : -1 },
                    { propertyId },
                  ],
                },
              });
            } else if (propertyAddress) {
              property = await Property.findOne({
                where: Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.cast(Sequelize.fn('jsonb_extract_path_text', Sequelize.col('address'), 'street'), 'text')),
                  { [Op.like]: `%${propertyAddress.toLowerCase()}%` }
                ),
              });
            }

            if (!property) {
              return JSON.stringify({ success: false, error: `Property not found: ${propertyAddress || propertyId}` });
            }

            // Get the latest compliance check
            const latestCheck = await ComplianceCheck.findOne({
              where: { propertyId: property.id },
              order: [['createdAt', 'DESC']],
            });

            if (latestCheck) {
              const issues = latestCheck.issues || [];
              const criticalIssues = issues.filter((i: any) => i.severity === 'critical' || i.severity === 'blocker');
              const warnings = issues.filter((i: any) => i.severity === 'warning' || i.severity === 'medium');
              const passed = (latestCheck as any).passedRules || 0;
              const failed = (latestCheck as any).failedRules || 0;
              const score = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : 0;

              return JSON.stringify({
                success: true,
                property: {
                  id: property.id,
                  address: property.address?.street || 'Unknown',
                  city: property.city,
                  state: property.state,
                },
                compliance: {
                  status: latestCheck.status,
                  score: `${score}%`,
                  checkedAt: latestCheck.createdAt,
                  totalIssues: issues.length,
                  criticalIssues: criticalIssues.length,
                  warnings: warnings.length,
                  passedChecks: passed,
                  issues: issues.slice(0, 5).map((i: any) => ({
                    rule: i.ruleName,
                    severity: i.severity,
                    message: i.message,
                    field: i.field,
                  })),
                  recommendation: latestCheck.status === 'Green'
                    ? 'Property is compliant and ready to proceed.'
                    : latestCheck.status === 'Yellow'
                    ? 'Property has minor issues that should be reviewed before proceeding.'
                    : 'Property has critical compliance issues that must be resolved.',
                },
              });
            }

            // No previous check - run a new one
            const result = await complianceService.checkProperty(property);
            const passed = result.passedRules || 0;
            const failed = result.failedRules || 0;
            const score = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : 0;

            return JSON.stringify({
              success: true,
              property: {
                id: property.id,
                address: property.address?.street || 'Unknown',
                city: property.city,
                state: property.state,
              },
              compliance: {
                status: result.status,
                score: `${score}%`,
                checkedAt: new Date().toISOString(),
                totalIssues: result.issues?.length || 0,
                criticalIssues: result.issues?.filter((i: any) => i.severity === 'critical' || i.severity === 'blocker').length || 0,
                warnings: result.issues?.filter((i: any) => i.severity === 'warning' || i.severity === 'medium').length || 0,
                passedChecks: result.passedChecks?.length || 0,
                issues: (result.issues || []).slice(0, 5).map((i: any) => ({
                  rule: i.ruleName,
                  severity: i.severity,
                  message: i.message,
                  field: i.field,
                })),
                recommendation: result.status === 'Green'
                  ? 'Property is compliant and ready to proceed.'
                  : result.status === 'Yellow'
                  ? 'Property has minor issues that should be reviewed before proceeding.'
                  : 'Property has critical compliance issues that must be resolved.',
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error checking compliance: ${error}` });
          }
        },
        {
          name: 'check_property_compliance',
          description: 'Check the compliance status of a property. Returns compliance score, status (GREEN/YELLOW/RED), and any issues found.',
          schema: z.object({
            propertyAddress: z.string().optional().describe('Property street address to check'),
            propertyId: z.string().optional().describe('Property ID if known'),
          }),
        }
      ),

      tool(
        async ({ propertyAddress, propertyId, runFresh }) => {
          try {
            const { complianceService } = await import('./ComplianceService');

            // Find the property
            let property;
            if (propertyId) {
              property = await Property.findOne({
                where: {
                  [Op.or]: [
                    { id: !isNaN(Number(propertyId)) ? Number(propertyId) : -1 },
                    { propertyId },
                  ],
                },
              });
            } else if (propertyAddress) {
              property = await Property.findOne({
                where: Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.cast(Sequelize.fn('jsonb_extract_path_text', Sequelize.col('address'), 'street'), 'text')),
                  { [Op.like]: `%${propertyAddress.toLowerCase()}%` }
                ),
              });
            }

            if (!property) {
              return JSON.stringify({ success: false, error: `Property not found: ${propertyAddress || propertyId}` });
            }

            // Run a fresh compliance check
            const result = await complianceService.checkProperty(property, {
              includeEvidence: true,
            });

            const passed = result.passedRules || 0;
            const failed = result.failedRules || 0;
            const score = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : 0;

            return JSON.stringify({
              success: true,
              message: `Compliance check completed for ${property.address?.street || 'property'}`,
              property: {
                id: property.id,
                address: property.address?.street || 'Unknown',
                state: property.state,
              },
              result: {
                status: result.status,
                score: `${score}%`,
                totalRulesChecked: result.totalRules || 0,
                passed: passed,
                failed: failed,
                criticalIssues: result.issues?.filter((i: any) => i.severity === 'critical' || i.severity === 'blocker') || [],
                warnings: result.issues?.filter((i: any) => i.severity === 'warning' || i.severity === 'medium') || [],
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error running compliance check: ${error}` });
          }
        },
        {
          name: 'run_compliance_check',
          description: 'Run a fresh compliance check on a property. Use this to re-evaluate compliance after changes.',
          schema: z.object({
            propertyAddress: z.string().optional().describe('Property street address'),
            propertyId: z.string().optional().describe('Property ID if known'),
            runFresh: z.boolean().optional().default(true).describe('Always runs fresh check'),
          }),
        }
      ),

      // ============================================================
      // COMPLIANCE RULE MANAGEMENT TOOLS
      // ============================================================
      tool(
        async ({ state, category, includeDisabled }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');

            const where: any = {};
            if (state) {
              where.state = { [Op.in]: [state.toUpperCase(), 'ALL'] };
            }
            if (category) {
              where.category = category;
            }
            if (!includeDisabled) {
              where.enabled = true;
            }

            const rules = await StateComplianceRule.findAll({
              where,
              order: [['state', 'ASC'], ['order', 'ASC']],
            });

            if (rules.length === 0) {
              return JSON.stringify({
                success: true,
                rules: [],
                message: state ? `No compliance rules found for ${state}.` : 'No compliance rules found.',
              });
            }

            // Group by state
            const byState: Record<string, any[]> = {};
            for (const rule of rules) {
              const r = rule as any;
              const stateKey = r.state;
              if (!byState[stateKey]) byState[stateKey] = [];
              byState[stateKey].push({
                id: r.id,
                name: r.name,
                category: r.category,
                field: r.field,
                operator: r.operator,
                value: r.value,
                severity: r.severity,
                message: r.message,
                enabled: r.enabled,
                county: r.county,
              });
            }

            return JSON.stringify({
              success: true,
              totalRules: rules.length,
              byState,
              categories: [...new Set(rules.map((r: any) => r.category))],
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error listing compliance rules: ${error}` });
          }
        },
        {
          name: 'list_compliance_rules',
          description: 'List compliance rules for a state. Shows all rules including licensing, disclosure, and contract requirements.',
          schema: z.object({
            state: z.string().optional().describe('State code (e.g., TX, CA, FL). If omitted, lists all states.'),
            category: z.enum(['licensing', 'disclosure', 'contract', 'general']).optional().describe('Filter by category'),
            includeDisabled: z.boolean().optional().default(false).describe('Include disabled rules'),
          }),
        }
      ),

      tool(
        async ({ state, name, category, field, operator, value, severity, message, county, description }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');

            // Validate required fields
            if (!state || state.length !== 2) {
              return JSON.stringify({
                success: false,
                error: 'State is required and must be a 2-letter code (e.g., TX, CA, FL) or "ALL" for universal rules.',
              });
            }

            if (!name) {
              return JSON.stringify({ success: false, error: 'Rule name is required.' });
            }

            if (!field) {
              return JSON.stringify({
                success: false,
                error: 'Field is required. Common fields: agentLicenseNumber, brokerLicenseNumber, knownMaterialDefects, assignable, floodZone, hoa, condition',
              });
            }

            // Check for duplicate rule
            const existing = await StateComplianceRule.findOne({
              where: {
                state: state.toUpperCase(),
                name: { [Op.iLike]: name },
              },
            });

            if (existing) {
              return JSON.stringify({
                success: false,
                error: `A rule named "${name}" already exists for ${state}. Use update_compliance_rule to modify it.`,
                existingRule: { id: existing.id, name: existing.name },
              });
            }

            // Get the next order number for this state
            const maxOrder = await StateComplianceRule.max('order', {
              where: { state: state.toUpperCase() },
            }) as number || 0;

            const rule = await StateComplianceRule.create({
              state: state.toUpperCase(),
              name,
              description: description || null,
              category: category || 'general',
              field,
              operator: operator || 'required',
              value: value || null,
              severity: severity || 'warning',
              message: message || `${name} - compliance requirement`,
              enabled: true,
              order: maxOrder + 10,
              county: county || null,
            } as any);

            return JSON.stringify({
              success: true,
              rule: {
                id: rule.id,
                state: rule.state,
                name: rule.name,
                category: rule.category,
                field: rule.field,
                operator: rule.operator,
                value: rule.value,
                severity: rule.severity,
                message: rule.message,
                county: rule.county,
                enabled: rule.enabled,
              },
              message: `✅ Created compliance rule "${name}" for ${state}${county ? ` (${county} County)` : ''}.`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error creating compliance rule: ${error}` });
          }
        },
        {
          name: 'create_compliance_rule',
          description: 'Create a new compliance rule for a state or county. Use this to add licensing requirements, disclosure rules, or contract requirements.',
          schema: z.object({
            state: z.string().describe('2-letter state code (e.g., TX, CA, FL) or "ALL" for universal rules'),
            name: z.string().describe('Human-readable rule name (e.g., "Texas Flood Zone Disclosure")'),
            category: z.enum(['licensing', 'disclosure', 'contract', 'general']).optional().describe('Rule category'),
            field: z.string().describe('Property field to check (e.g., agentLicenseNumber, floodZone, knownMaterialDefects, assignable)'),
            operator: z.enum(['required', 'equals', 'not_equals', 'contains', 'min_value', 'max_value', 'is_true', 'is_false', 'in_list', 'regex']).optional().describe('How to evaluate the field'),
            value: z.string().optional().describe('Value to compare against (for equals, min_value, etc.)'),
            severity: z.enum(['critical', 'warning', 'info']).optional().describe('Rule severity: critical=RED/blocker, warning=YELLOW, info=GREEN'),
            message: z.string().optional().describe('Message to display when rule fails'),
            county: z.string().optional().describe('County name for county-specific rules (e.g., "Harris" for Harris County)'),
            description: z.string().optional().describe('Detailed description of the rule'),
          }),
        }
      ),

      tool(
        async ({ ruleId, ruleName, state, updates }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');

            // Find the rule
            let rule;
            if (ruleId) {
              rule = await StateComplianceRule.findByPk(ruleId);
            } else if (ruleName && state) {
              rule = await StateComplianceRule.findOne({
                where: {
                  name: { [Op.iLike]: `%${ruleName}%` },
                  state: state.toUpperCase(),
                },
              });
            } else if (ruleName) {
              rule = await StateComplianceRule.findOne({
                where: { name: { [Op.iLike]: `%${ruleName}%` } },
              });
            }

            if (!rule) {
              return JSON.stringify({
                success: false,
                error: `Rule not found. Provide ruleId or ruleName${state ? '' : ' with state'}.`,
              });
            }

            // Build update object
            const updateData: any = {};
            if (updates.name !== undefined) updateData.name = updates.name;
            if (updates.category !== undefined) updateData.category = updates.category;
            if (updates.field !== undefined) updateData.field = updates.field;
            if (updates.operator !== undefined) updateData.operator = updates.operator;
            if (updates.value !== undefined) updateData.value = updates.value;
            if (updates.severity !== undefined) updateData.severity = updates.severity;
            if (updates.message !== undefined) updateData.message = updates.message;
            if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
            if (updates.county !== undefined) updateData.county = updates.county;
            if (updates.description !== undefined) updateData.description = updates.description;

            if (Object.keys(updateData).length === 0) {
              return JSON.stringify({
                success: false,
                error: 'No updates provided. Specify what to change in the updates object.',
              });
            }

            await rule.update(updateData);

            return JSON.stringify({
              success: true,
              rule: {
                id: rule.id,
                state: rule.state,
                name: rule.name,
                category: rule.category,
                field: rule.field,
                operator: rule.operator,
                severity: rule.severity,
                enabled: rule.enabled,
                county: rule.county,
              },
              updated: Object.keys(updateData),
              message: `✅ Updated compliance rule "${rule.name}".`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error updating compliance rule: ${error}` });
          }
        },
        {
          name: 'update_compliance_rule',
          description: 'Update an existing compliance rule. Can modify severity, message, enabled status, or other properties.',
          schema: z.object({
            ruleId: z.number().optional().describe('Rule ID if known'),
            ruleName: z.string().optional().describe('Rule name to search for'),
            state: z.string().optional().describe('State code to help find rule by name'),
            updates: z.object({
              name: z.string().optional(),
              category: z.enum(['licensing', 'disclosure', 'contract', 'general']).optional(),
              field: z.string().optional(),
              operator: z.enum(['required', 'equals', 'not_equals', 'contains', 'min_value', 'max_value', 'is_true', 'is_false', 'in_list', 'regex']).optional(),
              value: z.string().optional(),
              severity: z.enum(['critical', 'warning', 'info']).optional(),
              message: z.string().optional(),
              enabled: z.boolean().optional(),
              county: z.string().optional(),
              description: z.string().optional(),
            }).describe('Fields to update'),
          }),
        }
      ),

      tool(
        async ({ ruleId, ruleName, state, confirm }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');

            // Find the rule
            let rule;
            if (ruleId) {
              rule = await StateComplianceRule.findByPk(ruleId);
            } else if (ruleName && state) {
              rule = await StateComplianceRule.findOne({
                where: {
                  name: { [Op.iLike]: `%${ruleName}%` },
                  state: state.toUpperCase(),
                },
              });
            }

            if (!rule) {
              return JSON.stringify({
                success: false,
                error: `Rule not found. Provide ruleId or ruleName with state.`,
              });
            }

            if (!confirm) {
              return JSON.stringify({
                success: false,
                requiresConfirmation: true,
                rule: {
                  id: rule.id,
                  state: rule.state,
                  name: rule.name,
                  severity: rule.severity,
                },
                message: `⚠️ Are you sure you want to delete "${rule.name}" (${rule.state})? Set confirm=true to proceed.`,
              });
            }

            const deletedRule = {
              id: rule.id,
              state: rule.state,
              name: rule.name,
              category: rule.category,
            };

            await rule.destroy();

            return JSON.stringify({
              success: true,
              deleted: deletedRule,
              message: `🗑️ Deleted compliance rule "${deletedRule.name}" from ${deletedRule.state}.`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error deleting compliance rule: ${error}` });
          }
        },
        {
          name: 'delete_compliance_rule',
          description: 'Delete a compliance rule. Requires confirmation to prevent accidental deletion.',
          schema: z.object({
            ruleId: z.number().optional().describe('Rule ID to delete'),
            ruleName: z.string().optional().describe('Rule name to search for'),
            state: z.string().optional().describe('State code to help find rule by name'),
            confirm: z.boolean().optional().default(false).describe('Must be true to confirm deletion'),
          }),
        }
      ),

      tool(
        async ({ propertyAddress, propertyId }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');

            // Find the property
            let property;
            if (propertyId) {
              property = await Property.findOne({
                where: {
                  [Op.or]: [
                    { id: !isNaN(Number(propertyId)) ? Number(propertyId) : -1 },
                    { propertyId },
                  ],
                },
              });
            } else if (propertyAddress) {
              property = await Property.findOne({
                where: {
                  [Op.or]: [
                    Sequelize.where(
                      Sequelize.fn('LOWER', Sequelize.cast(Sequelize.fn('jsonb_extract_path_text', Sequelize.col('address'), 'street'), 'text')),
                      { [Op.like]: `%${propertyAddress.toLowerCase()}%` }
                    ),
                    { city: { [Op.iLike]: `%${propertyAddress}%` } },
                  ],
                },
              });
            }

            if (!property) {
              return JSON.stringify({ success: false, error: `Property not found: ${propertyAddress || propertyId}` });
            }

            const p = property as any;
            const state = p.state?.toUpperCase() || 'TX';
            const county = p.county || null;

            // Set property context
            const addressStr = p.address?.street || p.addressStreet || '';
            this.setPropertyContext(p.propertyId, addressStr, p.city, p.state);

            // Get all rules for this state + county
            const rules = await StateComplianceRule.getRulesForState(state, { county });

            if (rules.length === 0) {
              return JSON.stringify({
                success: true,
                property: { address: addressStr, city: p.city, state, county },
                message: `No compliance rules configured for ${state}${county ? ` (${county} County)` : ''}.`,
                rules: [],
              });
            }

            // Helper to get nested property value
            const getFieldValue = (obj: any, path: string): any => {
              const parts = path.split('.');
              let value = obj;
              for (const part of parts) {
                if (value === null || value === undefined) return undefined;
                value = value[part];
              }
              return value;
            };

            // Evaluate each rule against the property
            const evaluatedRules: any[] = [];
            const summary = { passed: 0, failed: 0, critical: 0, warning: 0, info: 0 };

            for (const rule of rules) {
              const r = rule as any;
              const fieldValue = getFieldValue(p, r.field);
              let passed = false;
              let actualValue = fieldValue;
              let guidance = '';

              // Evaluate based on operator
              switch (r.operator) {
                case 'required':
                  passed = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
                  guidance = passed ? '' : `Provide a value for "${r.field}"`;
                  break;
                case 'equals':
                  passed = String(fieldValue).toLowerCase() === String(r.value).toLowerCase();
                  guidance = passed ? '' : `"${r.field}" must equal "${r.value}"`;
                  break;
                case 'not_equals':
                  passed = String(fieldValue).toLowerCase() !== String(r.value).toLowerCase();
                  guidance = passed ? '' : `"${r.field}" must not equal "${r.value}"`;
                  break;
                case 'contains':
                  passed = String(fieldValue || '').toLowerCase().includes(String(r.value).toLowerCase());
                  guidance = passed ? '' : `"${r.field}" must contain "${r.value}"`;
                  break;
                case 'is_true':
                  passed = fieldValue === true || fieldValue === 'true' || fieldValue === 1;
                  guidance = passed ? '' : `"${r.field}" must be true/enabled`;
                  break;
                case 'is_false':
                  passed = fieldValue === false || fieldValue === 'false' || fieldValue === 0;
                  guidance = passed ? '' : `"${r.field}" must be false/disabled`;
                  break;
                case 'min_value':
                  passed = Number(fieldValue) >= Number(r.value);
                  guidance = passed ? '' : `"${r.field}" must be at least ${r.value}`;
                  break;
                case 'max_value':
                  passed = Number(fieldValue) <= Number(r.value);
                  guidance = passed ? '' : `"${r.field}" must be at most ${r.value}`;
                  break;
                case 'min_days_until':
                  if (fieldValue) {
                    const daysUntil = Math.floor((new Date(fieldValue).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    passed = daysUntil >= Number(r.value);
                    actualValue = `${daysUntil} days`;
                    guidance = passed ? '' : `Only ${daysUntil} days until ${r.field} - need at least ${r.value} days`;
                  } else {
                    passed = true; // No date set, rule doesn't apply
                    actualValue = 'not set';
                  }
                  break;
                case 'in_list':
                  const allowedValues = String(r.value).split(',').map(v => v.trim().toLowerCase());
                  passed = allowedValues.includes(String(fieldValue || '').toLowerCase());
                  guidance = passed ? '' : `"${r.field}" must be one of: ${r.value}`;
                  break;
                case 'regex':
                  try {
                    const regex = new RegExp(r.value, 'i');
                    passed = regex.test(String(fieldValue || ''));
                    guidance = passed ? '' : `"${r.field}" must match pattern: ${r.value}`;
                  } catch {
                    passed = false;
                    guidance = 'Invalid regex pattern';
                  }
                  break;
                default:
                  passed = true;
              }

              // Update summary
              if (passed) {
                summary.passed++;
              } else {
                summary.failed++;
                if (r.severity === 'critical') summary.critical++;
                else if (r.severity === 'warning') summary.warning++;
                else summary.info++;
              }

              evaluatedRules.push({
                id: r.id,
                name: r.name,
                category: r.category,
                field: r.field,
                operator: r.operator,
                expectedValue: r.value,
                actualValue: actualValue === undefined ? 'not set' : actualValue,
                severity: r.severity,
                passed,
                message: r.message,
                guidance: guidance,
                county: r.county,
              });
            }

            // Group by category
            const byCategory: Record<string, any[]> = {};
            for (const rule of evaluatedRules) {
              if (!byCategory[rule.category]) byCategory[rule.category] = [];
              byCategory[rule.category].push(rule);
            }

            // Generate overall status
            let overallStatus = 'GREEN';
            let statusEmoji = '🟢';
            if (summary.critical > 0) {
              overallStatus = 'RED';
              statusEmoji = '🔴';
            } else if (summary.warning > 0) {
              overallStatus = 'YELLOW';
              statusEmoji = '🟡';
            }

            // Generate actionable next steps
            const nextSteps: string[] = [];
            const criticalIssues = evaluatedRules.filter(r => !r.passed && r.severity === 'critical');
            const warnings = evaluatedRules.filter(r => !r.passed && r.severity === 'warning');

            if (criticalIssues.length > 0) {
              nextSteps.push(`Fix ${criticalIssues.length} critical issue(s) before proceeding:`);
              criticalIssues.slice(0, 3).forEach(issue => {
                nextSteps.push(`  • ${issue.guidance || issue.message}`);
              });
            }
            if (warnings.length > 0) {
              nextSteps.push(`Address ${warnings.length} warning(s):`);
              warnings.slice(0, 3).forEach(warn => {
                nextSteps.push(`  • ${warn.guidance || warn.message}`);
              });
            }

            return JSON.stringify({
              success: true,
              property: {
                id: p.id,
                propertyId: p.propertyId,
                address: addressStr,
                city: p.city,
                state,
                county,
              },
              status: {
                overall: overallStatus,
                emoji: statusEmoji,
                score: Math.round((summary.passed / (summary.passed + summary.failed)) * 100),
              },
              summary,
              byCategory,
              criticalIssues: criticalIssues.map(r => ({ name: r.name, message: r.message, guidance: r.guidance, field: r.field })),
              warnings: warnings.map(r => ({ name: r.name, message: r.message, guidance: r.guidance, field: r.field })),
              nextSteps,
              _contextAnnouncement: this.getContextChangeAnnouncement(),
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error getting compliance breakdown: ${error}` });
          }
        },
        {
          name: 'get_property_compliance_breakdown',
          description: 'Get a detailed compliance breakdown for a property showing all rules that apply based on state + county, whether each passes or fails, and specific guidance on what\'s needed. Use when user asks "what compliance rules apply", "check compliance", "what\'s needed for compliance", etc.',
          schema: z.object({
            propertyAddress: z.string().optional().describe('Property address to look up'),
            propertyId: z.string().optional().describe('Property ID if known'),
          }),
        }
      ),

      // ============================================================
      // BULK COMPLIANCE & ANALYTICS TOOLS
      // ============================================================
      tool(
        async ({ dealIds, state, limit, dateRange }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');
            const { default: ComplianceCheck } = await import('../models/ComplianceCheck');

            // Build query for properties
            const whereClause: any = {};
            if (dealIds && dealIds.length > 0) {
              whereClause[Op.or] = [
                { id: { [Op.in]: dealIds.filter((id: string) => !isNaN(Number(id))).map(Number) } },
                { propertyId: { [Op.in]: dealIds } },
              ];
            }
            if (state) {
              whereClause.state = { [Op.iLike]: state };
            }

            const properties = await Property.findAll({
              where: whereClause,
              limit: limit || 100,
              order: [['createdAt', 'DESC']],
            });

            if (properties.length === 0) {
              return JSON.stringify({
                success: true,
                message: 'No properties found matching criteria.',
                results: [],
              });
            }

            // Helper to get nested property value
            const getFieldValue = (obj: any, path: string): any => {
              const parts = path.split('.');
              let value = obj;
              for (const part of parts) {
                if (value === null || value === undefined) return undefined;
                value = value[part];
              }
              return value;
            };

            // Evaluate rule against property
            const evaluateRule = (rule: any, property: any): { passed: boolean; guidance: string } => {
              const fieldValue = getFieldValue(property, rule.field);
              let passed = false;
              let guidance = '';

              switch (rule.operator) {
                case 'required':
                  passed = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
                  guidance = passed ? '' : `Provide "${rule.field}"`;
                  break;
                case 'equals':
                  passed = String(fieldValue).toLowerCase() === String(rule.value).toLowerCase();
                  guidance = passed ? '' : `"${rule.field}" must equal "${rule.value}"`;
                  break;
                case 'is_true':
                  passed = fieldValue === true || fieldValue === 'true' || fieldValue === 1;
                  guidance = passed ? '' : `"${rule.field}" must be true`;
                  break;
                case 'is_false':
                  passed = fieldValue === false || fieldValue === 'false' || fieldValue === 0;
                  guidance = passed ? '' : `"${rule.field}" must be false`;
                  break;
                case 'min_value':
                  passed = Number(fieldValue) >= Number(rule.value);
                  guidance = passed ? '' : `"${rule.field}" must be >= ${rule.value}`;
                  break;
                case 'max_value':
                  passed = Number(fieldValue) <= Number(rule.value);
                  guidance = passed ? '' : `"${rule.field}" must be <= ${rule.value}`;
                  break;
                case 'contains':
                  passed = String(fieldValue || '').toLowerCase().includes(String(rule.value).toLowerCase());
                  guidance = passed ? '' : `"${rule.field}" must contain "${rule.value}"`;
                  break;
                case 'in_list':
                  const allowedValues = String(rule.value).split(',').map((v: string) => v.trim().toLowerCase());
                  passed = allowedValues.includes(String(fieldValue || '').toLowerCase());
                  guidance = passed ? '' : `"${rule.field}" must be one of: ${rule.value}`;
                  break;
                case 'regex':
                  try {
                    const regex = new RegExp(rule.value, 'i');
                    passed = regex.test(String(fieldValue || ''));
                    guidance = passed ? '' : `"${rule.field}" must match pattern`;
                  } catch {
                    passed = false;
                    guidance = 'Invalid regex pattern';
                  }
                  break;
                default:
                  passed = true;
              }
              return { passed, guidance };
            };

            const results: any[] = [];
            const overallSummary = {
              totalDeals: properties.length,
              green: 0,
              yellow: 0,
              red: 0,
              totalIssues: 0,
              criticalIssues: 0,
              warningIssues: 0,
            };

            // Batch process each property
            for (const property of properties) {
              const p = property as any;
              const propState = p.state?.toUpperCase() || 'TX';
              const county = p.county || null;

              const rules = await StateComplianceRule.getRulesForState(propState, { county });

              let passed = 0;
              let failed = 0;
              let critical = 0;
              let warning = 0;
              const issues: any[] = [];

              for (const rule of rules) {
                const r = rule as any;
                const { passed: rulePassed, guidance } = evaluateRule(r, p);

                if (rulePassed) {
                  passed++;
                } else {
                  failed++;
                  if (r.severity === 'critical') {
                    critical++;
                    overallSummary.criticalIssues++;
                  } else if (r.severity === 'warning') {
                    warning++;
                    overallSummary.warningIssues++;
                  }
                  overallSummary.totalIssues++;
                  issues.push({
                    rule: r.name,
                    severity: r.severity,
                    field: r.field,
                    guidance,
                  });
                }
              }

              let status = 'GREEN';
              if (critical > 0) {
                status = 'RED';
                overallSummary.red++;
              } else if (warning > 0) {
                status = 'YELLOW';
                overallSummary.yellow++;
              } else {
                overallSummary.green++;
              }

              const addressStr = p.address?.street || p.addressStreet || 'Unknown';
              results.push({
                propertyId: p.propertyId,
                address: `${addressStr}, ${p.city || ''} ${propState}`,
                status,
                score: rules.length > 0 ? Math.round((passed / rules.length) * 100) : 100,
                rulesChecked: rules.length,
                passed,
                failed,
                criticalIssues: critical,
                warningIssues: warning,
                topIssues: issues.slice(0, 3),
              });
            }

            // Sort by status (RED first, then YELLOW, then GREEN)
            const statusOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
            results.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

            return JSON.stringify({
              success: true,
              summary: {
                ...overallSummary,
                complianceRate: Math.round((overallSummary.green / overallSummary.totalDeals) * 100),
              },
              results,
              message: `✅ Checked ${properties.length} deals: ${overallSummary.green} GREEN, ${overallSummary.yellow} YELLOW, ${overallSummary.red} RED`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error in bulk compliance check: ${error}` });
          }
        },
        {
          name: 'bulk_check_compliance',
          description: 'Check compliance for multiple deals at once. Returns summary of all violations by deal. Use when user wants to check many deals or asks "check all my deals", "compliance status of my pipeline", etc.',
          schema: z.object({
            dealIds: z.array(z.string()).optional().describe('Specific deal/property IDs to check'),
            state: z.string().optional().describe('Filter by state (e.g., TX, CA)'),
            limit: z.number().optional().default(100).describe('Max deals to check (default 100)'),
            dateRange: z.object({
              from: z.string().optional(),
              to: z.string().optional(),
            }).optional().describe('Filter by date range'),
          }),
        }
      ),

      tool(
        async ({ state, dateRange }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');
            const { default: ComplianceCheck } = await import('../models/ComplianceCheck');

            // Get date range (default to last 30 days)
            const endDate = dateRange?.to ? new Date(dateRange.to) : new Date();
            const startDate = dateRange?.from ? new Date(dateRange.from) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

            // Build where clause for compliance checks
            const whereClause: any = {
              checkedAt: {
                [Op.between]: [startDate, endDate],
              },
            };
            if (state) {
              whereClause.state = { [Op.iLike]: state };
            }

            // Get recent compliance checks
            const checks = await ComplianceCheck.findAll({
              where: whereClause,
              order: [['checkedAt', 'DESC']],
            });

            // Get all rules for counting
            const allRules = await StateComplianceRule.findAll({
              where: { enabled: true },
            });

            // Calculate metrics
            const totalChecks = checks.length;
            const statusCounts = { Green: 0, Yellow: 0, Red: 0 };
            const issuesByRule: Record<string, { count: number; severity: string; name: string }> = {};
            const issuesByState: Record<string, number> = {};
            let totalIssues = 0;
            let totalPassed = 0;
            let totalFailed = 0;

            for (const check of checks) {
              const c = check as any;
              statusCounts[c.status as keyof typeof statusCounts]++;
              totalPassed += c.passedRules || 0;
              totalFailed += c.failedRules || 0;

              // Track issues by rule
              if (c.issues && Array.isArray(c.issues)) {
                for (const issue of c.issues) {
                  totalIssues++;
                  const key = issue.ruleName || issue.ruleId || 'Unknown';
                  if (!issuesByRule[key]) {
                    issuesByRule[key] = { count: 0, severity: issue.severity, name: key };
                  }
                  issuesByRule[key].count++;
                }
              }

              // Track by state
              if (c.state) {
                issuesByState[c.state] = (issuesByState[c.state] || 0) + (c.failedRules || 0);
              }
            }

            // Calculate compliance rate
            const complianceRate = totalChecks > 0
              ? Math.round((statusCounts.Green / totalChecks) * 100)
              : 100;

            // Get top violated rules
            const topViolatedRules = Object.values(issuesByRule)
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
              .map(r => ({
                rule: r.name,
                violations: r.count,
                severity: r.severity,
              }));

            // Get states with most issues
            const statesWithIssues = Object.entries(issuesByState)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([st, count]) => ({ state: st, issues: count }));

            // Determine trend (compare first half to second half of period)
            const midPoint = new Date((startDate.getTime() + endDate.getTime()) / 2);
            const firstHalf = checks.filter(c => new Date(c.checkedAt) < midPoint);
            const secondHalf = checks.filter(c => new Date(c.checkedAt) >= midPoint);

            const firstHalfRate = firstHalf.length > 0
              ? (firstHalf.filter(c => c.status === 'Green').length / firstHalf.length) * 100
              : 0;
            const secondHalfRate = secondHalf.length > 0
              ? (secondHalf.filter(c => c.status === 'Green').length / secondHalf.length) * 100
              : 0;

            let trend = 'stable';
            let trendEmoji = '➡️';
            if (secondHalfRate > firstHalfRate + 5) {
              trend = 'improving';
              trendEmoji = '📈';
            } else if (secondHalfRate < firstHalfRate - 5) {
              trend = 'declining';
              trendEmoji = '📉';
            }

            // Overall health status
            let healthStatus = '🟢 Healthy';
            if (complianceRate < 50) {
              healthStatus = '🔴 Critical';
            } else if (complianceRate < 75) {
              healthStatus = '🟡 Needs Attention';
            }

            return JSON.stringify({
              success: true,
              snapshot: {
                period: {
                  from: startDate.toISOString().split('T')[0],
                  to: endDate.toISOString().split('T')[0],
                  days: Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
                },
                health: healthStatus,
                complianceRate: `${complianceRate}%`,
                trend: `${trendEmoji} ${trend}`,
                dealsChecked: totalChecks,
                statusBreakdown: {
                  green: statusCounts.Green,
                  yellow: statusCounts.Yellow,
                  red: statusCounts.Red,
                },
                issuesSummary: {
                  total: totalIssues,
                  avgPerDeal: totalChecks > 0 ? Math.round(totalIssues / totalChecks * 10) / 10 : 0,
                },
                topViolatedRules,
                statesWithMostIssues: statesWithIssues,
                totalRulesConfigured: allRules.length,
                rulesEvaluated: totalPassed + totalFailed,
              },
              recommendations: [
                ...(complianceRate < 75 ? ['Review and address critical compliance issues'] : []),
                ...(topViolatedRules.length > 0 ? [`Focus on "${topViolatedRules[0].rule}" - most common violation`] : []),
                ...(trend === 'declining' ? ['Compliance trending down - investigate recent changes'] : []),
                ...(statesWithIssues.length > 0 ? [`Pay attention to ${statesWithIssues[0].state} - highest issue count`] : []),
              ],
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error getting compliance health: ${error}` });
          }
        },
        {
          name: 'compliance_health_snapshot',
          description: 'Get a dashboard overview of compliance health including rates, trends, top violations, and recommendations. Use when user asks "how is compliance", "compliance dashboard", "compliance overview", "show me compliance stats".',
          schema: z.object({
            state: z.string().optional().describe('Filter by state'),
            dateRange: z.object({
              from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
              to: z.string().optional().describe('End date (YYYY-MM-DD)'),
            }).optional().describe('Date range for analysis (default: last 30 days)'),
          }),
        }
      ),

      tool(
        async ({ state }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');

            // Get all enabled rules
            const whereClause: any = { enabled: true };
            if (state) {
              whereClause.state = { [Op.in]: [state.toUpperCase(), 'ALL'] };
            }

            const rules = await StateComplianceRule.findAll({
              where: whereClause,
              order: [['state', 'ASC'], ['field', 'ASC']],
            });

            const conflicts: any[] = [];

            // Group rules by field
            const rulesByField: Record<string, any[]> = {};
            for (const rule of rules) {
              const r = rule as any;
              const key = `${r.state}:${r.field}`;
              if (!rulesByField[key]) rulesByField[key] = [];
              rulesByField[key].push(r);
            }

            // Check for conflicts within same field
            for (const [key, fieldRules] of Object.entries(rulesByField)) {
              if (fieldRules.length < 2) continue;

              // Check for contradictory operators
              const operators = fieldRules.map(r => r.operator);

              // is_true vs is_false conflict
              if (operators.includes('is_true') && operators.includes('is_false')) {
                conflicts.push({
                  type: 'contradictory_boolean',
                  severity: 'critical',
                  field: fieldRules[0].field,
                  state: fieldRules[0].state,
                  rules: fieldRules.map(r => ({ id: r.id, name: r.name, operator: r.operator })),
                  message: `Rules require "${fieldRules[0].field}" to be both TRUE and FALSE`,
                  recommendation: 'Disable one of these rules or merge into a single rule',
                });
              }

              // min_value > max_value conflict
              const minRule = fieldRules.find(r => r.operator === 'min_value');
              const maxRule = fieldRules.find(r => r.operator === 'max_value');
              if (minRule && maxRule && Number(minRule.value) > Number(maxRule.value)) {
                conflicts.push({
                  type: 'impossible_range',
                  severity: 'critical',
                  field: fieldRules[0].field,
                  state: fieldRules[0].state,
                  rules: [
                    { id: minRule.id, name: minRule.name, operator: 'min_value', value: minRule.value },
                    { id: maxRule.id, name: maxRule.name, operator: 'max_value', value: maxRule.value },
                  ],
                  message: `Min value (${minRule.value}) > Max value (${maxRule.value}) for "${fieldRules[0].field}"`,
                  recommendation: 'Adjust values so min <= max',
                });
              }

              // equals with different values conflict
              const equalsRules = fieldRules.filter(r => r.operator === 'equals');
              if (equalsRules.length > 1) {
                const uniqueValues = [...new Set(equalsRules.map(r => r.value))];
                if (uniqueValues.length > 1) {
                  conflicts.push({
                    type: 'multiple_equals',
                    severity: 'critical',
                    field: fieldRules[0].field,
                    state: fieldRules[0].state,
                    rules: equalsRules.map(r => ({ id: r.id, name: r.name, value: r.value })),
                    message: `Field "${fieldRules[0].field}" must equal multiple different values: ${uniqueValues.join(', ')}`,
                    recommendation: 'Use in_list operator instead, or keep only one equals rule',
                  });
                }
              }

              // required + equals NULL or empty conflict
              const requiredRule = fieldRules.find(r => r.operator === 'required');
              const equalsEmptyRule = fieldRules.find(r => r.operator === 'equals' && (!r.value || r.value === ''));
              if (requiredRule && equalsEmptyRule) {
                conflicts.push({
                  type: 'required_empty',
                  severity: 'warning',
                  field: fieldRules[0].field,
                  state: fieldRules[0].state,
                  rules: [
                    { id: requiredRule.id, name: requiredRule.name, operator: 'required' },
                    { id: equalsEmptyRule.id, name: equalsEmptyRule.name, operator: 'equals', value: 'empty' },
                  ],
                  message: `"${fieldRules[0].field}" is required but also expected to be empty`,
                  recommendation: 'Remove one of these conflicting rules',
                });
              }
            }

            // Check for duplicate rules (same state, field, operator, value)
            const ruleSignatures: Record<string, any[]> = {};
            for (const rule of rules) {
              const r = rule as any;
              const sig = `${r.state}:${r.field}:${r.operator}:${r.value || ''}`;
              if (!ruleSignatures[sig]) ruleSignatures[sig] = [];
              ruleSignatures[sig].push(r);
            }

            for (const [sig, dupeRules] of Object.entries(ruleSignatures)) {
              if (dupeRules.length > 1) {
                conflicts.push({
                  type: 'duplicate',
                  severity: 'info',
                  field: dupeRules[0].field,
                  state: dupeRules[0].state,
                  rules: dupeRules.map(r => ({ id: r.id, name: r.name })),
                  message: `Duplicate rules found for "${dupeRules[0].field}" in ${dupeRules[0].state}`,
                  recommendation: 'Remove duplicate rules to avoid confusion',
                });
              }
            }

            // Sort by severity
            const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
            conflicts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

            const criticalCount = conflicts.filter(c => c.severity === 'critical').length;
            const warningCount = conflicts.filter(c => c.severity === 'warning').length;
            const infoCount = conflicts.filter(c => c.severity === 'info').length;

            return JSON.stringify({
              success: true,
              summary: {
                totalConflicts: conflicts.length,
                critical: criticalCount,
                warning: warningCount,
                info: infoCount,
                rulesAnalyzed: rules.length,
                health: criticalCount > 0 ? '🔴 Has Critical Conflicts' : warningCount > 0 ? '🟡 Has Warnings' : '🟢 No Conflicts',
              },
              conflicts,
              message: conflicts.length > 0
                ? `⚠️ Found ${conflicts.length} conflict(s): ${criticalCount} critical, ${warningCount} warnings, ${infoCount} info`
                : '✅ No rule conflicts detected!',
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error detecting rule conflicts: ${error}` });
          }
        },
        {
          name: 'detect_rule_conflicts',
          description: 'Find contradictory or conflicting compliance rules. Detects impossible conditions like "field must be true AND false", duplicate rules, and invalid ranges. Use when user asks "check for conflicts", "are my rules valid", "find rule problems".',
          schema: z.object({
            state: z.string().optional().describe('Filter by state (e.g., TX). If omitted, checks all states.'),
          }),
        }
      ),

      tool(
        async ({ state, dealType, propertyType, includeGuidance }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');
            const { default: StateKnowledge } = await import('../models/StateKnowledge');

            if (!state) {
              return JSON.stringify({
                success: false,
                error: 'State is required. Provide a 2-letter state code (e.g., TX, CA, FL).',
              });
            }

            const stateUpper = state.toUpperCase();

            // Get all rules for this state
            const rules = await StateComplianceRule.getRulesForState(stateUpper);

            if (rules.length === 0) {
              return JSON.stringify({
                success: true,
                state: stateUpper,
                message: `No compliance rules configured for ${stateUpper}. Consider adding state-specific rules.`,
                checklist: [],
              });
            }

            // Get state knowledge for additional context
            let stateContext = '';
            try {
              const knowledge = await StateKnowledge.getForState(stateUpper);
              if (knowledge && knowledge.length > 0) {
                const laws = knowledge.filter((k: any) => k.type === 'law' || k.type === 'regulation');
                if (laws.length > 0) {
                  stateContext = laws.slice(0, 2).map((k: any) => k.summary || k.title).join('. ');
                }
              }
            } catch {
              // Knowledge not available, continue without it
            }

            // Group rules by category
            const byCategory: Record<string, any[]> = {
              licensing: [],
              disclosure: [],
              contract: [],
              general: [],
            };

            for (const rule of rules) {
              const r = rule as any;
              const category = r.category || 'general';
              if (!byCategory[category]) byCategory[category] = [];
              byCategory[category].push(r);
            }

            // Build checklist
            const checklist: any[] = [];
            let itemNumber = 1;

            const categoryTitles: Record<string, string> = {
              licensing: '📋 Licensing Requirements',
              disclosure: '📄 Disclosure Requirements',
              contract: '📝 Contract Requirements',
              general: '✅ General Requirements',
            };

            const categoryOrder = ['licensing', 'disclosure', 'contract', 'general'];

            for (const category of categoryOrder) {
              const categoryRules = byCategory[category];
              if (categoryRules.length === 0) continue;

              // Sort by severity (critical first)
              categoryRules.sort((a, b) => {
                const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
                return severityOrder[a.severity] - severityOrder[b.severity];
              });

              const items = categoryRules.map((r: any) => {
                const severityEmoji = r.severity === 'critical' ? '🔴' : r.severity === 'warning' ? '🟡' : '🟢';
                const item: any = {
                  number: itemNumber++,
                  requirement: r.name,
                  field: r.field,
                  severity: r.severity,
                  severityEmoji,
                  message: r.message,
                };

                if (includeGuidance) {
                  // Add specific guidance based on operator
                  switch (r.operator) {
                    case 'required':
                      item.guidance = `Ensure "${r.field}" is provided and not empty`;
                      break;
                    case 'equals':
                      item.guidance = `Set "${r.field}" to exactly "${r.value}"`;
                      break;
                    case 'is_true':
                      item.guidance = `Mark "${r.field}" as true/yes/enabled`;
                      break;
                    case 'is_false':
                      item.guidance = `Ensure "${r.field}" is false/no/disabled`;
                      break;
                    case 'min_value':
                      item.guidance = `"${r.field}" must be at least ${r.value}`;
                      break;
                    case 'max_value':
                      item.guidance = `"${r.field}" must not exceed ${r.value}`;
                      break;
                    case 'contains':
                      item.guidance = `"${r.field}" must include "${r.value}"`;
                      break;
                    case 'in_list':
                      item.guidance = `"${r.field}" must be one of: ${r.value}`;
                      break;
                    default:
                      item.guidance = r.message;
                  }

                  if (r.county) {
                    item.guidance += ` (${r.county} County specific)`;
                  }
                }

                return item;
              });

              checklist.push({
                category: categoryTitles[category] || category,
                items,
              });
            }

            // Summary stats
            const criticalCount = rules.filter(r => (r as any).severity === 'critical').length;
            const warningCount = rules.filter(r => (r as any).severity === 'warning').length;

            return JSON.stringify({
              success: true,
              state: stateUpper,
              dealType: dealType || 'wholesale',
              summary: {
                totalRequirements: rules.length,
                critical: criticalCount,
                warning: warningCount,
                info: rules.length - criticalCount - warningCount,
                categories: Object.entries(byCategory).filter(([, v]) => v.length > 0).map(([k, v]) => `${k}: ${v.length}`),
              },
              stateContext: stateContext || undefined,
              checklist,
              message: `📋 Compliance checklist for ${stateUpper}: ${rules.length} requirements (${criticalCount} critical, ${warningCount} warnings)`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error generating checklist: ${error}` });
          }
        },
        {
          name: 'generate_compliance_checklist',
          description: 'Generate a compliance checklist for a specific state and deal type. Returns all requirements grouped by category with guidance. Use when user asks "what do I need for Texas deals", "compliance checklist for CA", "requirements for wholesale in Florida".',
          schema: z.object({
            state: z.string().describe('2-letter state code (e.g., TX, CA, FL)'),
            dealType: z.enum(['wholesale', 'retail', 'novation', 'subject_to']).optional().describe('Type of deal'),
            propertyType: z.enum(['sfr', 'multifamily', 'land', 'commercial']).optional().describe('Property type'),
            includeGuidance: z.boolean().optional().default(true).describe('Include specific guidance for each requirement'),
          }),
        }
      ),

      tool(
        async ({ state, dateRange, limit }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');
            const { default: ComplianceCheck } = await import('../models/ComplianceCheck');

            // Get date range (default to last 90 days for better data)
            const endDate = dateRange?.to ? new Date(dateRange.to) : new Date();
            const startDate = dateRange?.from ? new Date(dateRange.from) : new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

            // Build where clause
            const whereClause: any = {
              checkedAt: {
                [Op.between]: [startDate, endDate],
              },
            };
            if (state) {
              whereClause.state = { [Op.iLike]: state };
            }

            // Get compliance checks with issues
            const checks = await ComplianceCheck.findAll({
              where: whereClause,
              order: [['checkedAt', 'DESC']],
            });

            // Track rule metrics
            const ruleMetrics: Record<string, {
              ruleId: number;
              ruleName: string;
              state: string;
              severity: string;
              triggered: number;
              // For effectiveness we need to track outcomes - using pass rate as proxy
              associatedDeals: number;
              passedDeals: number;
              failedDeals: number;
            }> = {};

            // Aggregate data from checks
            for (const check of checks) {
              const c = check as any;

              // Track triggered rules (from issues)
              if (c.issues && Array.isArray(c.issues)) {
                for (const issue of c.issues) {
                  const key = issue.ruleId || issue.ruleName || 'Unknown';
                  if (!ruleMetrics[key]) {
                    ruleMetrics[key] = {
                      ruleId: issue.ruleId,
                      ruleName: issue.ruleName || key,
                      state: c.state,
                      severity: issue.severity || 'unknown',
                      triggered: 0,
                      associatedDeals: 0,
                      passedDeals: 0,
                      failedDeals: 0,
                    };
                  }
                  ruleMetrics[key].triggered++;
                  ruleMetrics[key].associatedDeals++;
                  ruleMetrics[key].failedDeals++;
                }
              }

              // Track passed rules
              if (c.passedChecks && Array.isArray(c.passedChecks)) {
                for (const passedRule of c.passedChecks) {
                  const key = passedRule;
                  if (!ruleMetrics[key]) {
                    ruleMetrics[key] = {
                      ruleId: 0,
                      ruleName: key,
                      state: c.state,
                      severity: 'unknown',
                      triggered: 0,
                      associatedDeals: 0,
                      passedDeals: 0,
                      failedDeals: 0,
                    };
                  }
                  ruleMetrics[key].associatedDeals++;
                  ruleMetrics[key].passedDeals++;
                }
              }
            }

            // Calculate effectiveness metrics
            const ruleStats = Object.values(ruleMetrics).map(m => {
              const violationRate = m.associatedDeals > 0
                ? Math.round((m.failedDeals / m.associatedDeals) * 100)
                : 0;

              // Effectiveness heuristic:
              // - High violation rate for critical rules = effective (catching issues)
              // - High violation rate for info rules = possibly too strict
              let effectiveness = 'unknown';
              let effectivenessScore = 50;

              if (m.associatedDeals >= 5) {
                if (m.severity === 'critical') {
                  // Critical rules should have low violation rates in healthy systems
                  if (violationRate < 10) {
                    effectiveness = 'effective';
                    effectivenessScore = 90;
                  } else if (violationRate < 30) {
                    effectiveness = 'monitoring';
                    effectivenessScore = 70;
                  } else {
                    effectiveness = 'high_trigger';
                    effectivenessScore = 50;
                  }
                } else if (m.severity === 'warning') {
                  if (violationRate < 20) {
                    effectiveness = 'effective';
                    effectivenessScore = 85;
                  } else if (violationRate < 50) {
                    effectiveness = 'monitoring';
                    effectivenessScore = 65;
                  } else {
                    effectiveness = 'possibly_too_strict';
                    effectivenessScore = 40;
                  }
                } else {
                  if (violationRate > 70) {
                    effectiveness = 'too_strict';
                    effectivenessScore = 30;
                  } else {
                    effectiveness = 'effective';
                    effectivenessScore = 75;
                  }
                }
              } else {
                effectiveness = 'insufficient_data';
                effectivenessScore = 50;
              }

              return {
                ruleName: m.ruleName,
                state: m.state,
                severity: m.severity,
                timesTriggered: m.triggered,
                dealsEvaluated: m.associatedDeals,
                violationRate: `${violationRate}%`,
                effectiveness,
                effectivenessScore,
              };
            });

            // Sort by triggered count (most triggered first)
            ruleStats.sort((a, b) => b.timesTriggered - a.timesTriggered);

            // Take top N
            const topRules = ruleStats.slice(0, limit || 20);

            // Find rules that might need attention
            const needsAttention = ruleStats.filter(r =>
              r.effectiveness === 'too_strict' ||
              r.effectiveness === 'possibly_too_strict' ||
              (r.effectiveness === 'high_trigger' && r.severity === 'critical')
            );

            // Find most effective rules
            const mostEffective = ruleStats
              .filter(r => r.effectiveness === 'effective' && r.dealsEvaluated >= 5)
              .sort((a, b) => b.effectivenessScore - a.effectivenessScore)
              .slice(0, 5);

            return JSON.stringify({
              success: true,
              period: {
                from: startDate.toISOString().split('T')[0],
                to: endDate.toISOString().split('T')[0],
              },
              summary: {
                totalChecksAnalyzed: checks.length,
                uniqueRulesTriggered: Object.keys(ruleMetrics).length,
                avgViolationsPerCheck: checks.length > 0
                  ? Math.round(Object.values(ruleMetrics).reduce((sum, m) => sum + m.triggered, 0) / checks.length * 10) / 10
                  : 0,
              },
              topTriggeredRules: topRules,
              mostEffectiveRules: mostEffective,
              rulesNeedingReview: needsAttention,
              recommendations: [
                ...(needsAttention.length > 0 ? [`Review ${needsAttention.length} rule(s) that may be too strict`] : []),
                ...(mostEffective.length > 0 ? [`"${mostEffective[0].ruleName}" is your most effective rule`] : []),
                ...(checks.length < 10 ? ['More compliance checks needed for accurate effectiveness analysis'] : []),
              ],
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error analyzing rule effectiveness: ${error}` });
          }
        },
        {
          name: 'get_rule_effectiveness',
          description: 'Analyze which compliance rules are most/least effective based on historical data. Shows violation rates, identifies overly strict rules, and recommends improvements. Use when user asks "which rules work best", "rule effectiveness", "are my rules too strict".',
          schema: z.object({
            state: z.string().optional().describe('Filter by state'),
            dateRange: z.object({
              from: z.string().optional(),
              to: z.string().optional(),
            }).optional().describe('Date range for analysis (default: last 90 days)'),
            limit: z.number().optional().default(20).describe('Max rules to return'),
          }),
        }
      ),

      tool(
        async ({ propertyId, propertyAddress, issueType }) => {
          try {
            const { default: StateComplianceRule } = await import('../models/StateComplianceRule');
            const { default: StateKnowledge } = await import('../models/StateKnowledge');

            // Find the property
            let property;
            if (propertyId) {
              property = await Property.findOne({
                where: {
                  [Op.or]: [
                    { id: !isNaN(Number(propertyId)) ? Number(propertyId) : -1 },
                    { propertyId },
                  ],
                },
              });
            } else if (propertyAddress) {
              property = await Property.findOne({
                where: {
                  [Op.or]: [
                    Sequelize.where(
                      Sequelize.fn('LOWER', Sequelize.cast(Sequelize.fn('jsonb_extract_path_text', Sequelize.col('address'), 'street'), 'text')),
                      { [Op.like]: `%${propertyAddress.toLowerCase()}%` }
                    ),
                    { city: { [Op.iLike]: `%${propertyAddress}%` } },
                  ],
                },
              });
            }

            if (!property) {
              return JSON.stringify({
                success: false,
                error: `Property not found. Provide a valid propertyId or propertyAddress.`,
              });
            }

            const p = property as any;
            const state = p.state?.toUpperCase() || 'TX';
            const county = p.county || null;

            // Get rules for this state
            const rules = await StateComplianceRule.getRulesForState(state, { county });

            // Helper to get nested property value
            const getFieldValue = (obj: any, path: string): any => {
              const parts = path.split('.');
              let value = obj;
              for (const part of parts) {
                if (value === null || value === undefined) return undefined;
                value = value[part];
              }
              return value;
            };

            // Find failing rules
            const failingRules: any[] = [];
            for (const rule of rules) {
              const r = rule as any;
              const fieldValue = getFieldValue(p, r.field);
              let passed = false;

              switch (r.operator) {
                case 'required':
                  passed = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
                  break;
                case 'equals':
                  passed = String(fieldValue).toLowerCase() === String(r.value).toLowerCase();
                  break;
                case 'is_true':
                  passed = fieldValue === true || fieldValue === 'true' || fieldValue === 1;
                  break;
                case 'is_false':
                  passed = fieldValue === false || fieldValue === 'false' || fieldValue === 0;
                  break;
                case 'min_value':
                  passed = Number(fieldValue) >= Number(r.value);
                  break;
                case 'max_value':
                  passed = Number(fieldValue) <= Number(r.value);
                  break;
                case 'contains':
                  passed = String(fieldValue || '').toLowerCase().includes(String(r.value).toLowerCase());
                  break;
                case 'in_list':
                  const allowedValues = String(r.value).split(',').map((v: string) => v.trim().toLowerCase());
                  passed = allowedValues.includes(String(fieldValue || '').toLowerCase());
                  break;
                default:
                  passed = true;
              }

              if (!passed) {
                failingRules.push({
                  ...r.toJSON(),
                  currentValue: fieldValue,
                });
              }
            }

            // Filter by issue type if specified
            let filteredRules = failingRules;
            if (issueType) {
              filteredRules = failingRules.filter(r => r.category === issueType || r.severity === issueType);
            }

            if (filteredRules.length === 0) {
              return JSON.stringify({
                success: true,
                property: {
                  id: p.id,
                  propertyId: p.propertyId,
                  address: p.address?.street || p.addressStreet,
                  city: p.city,
                  state,
                },
                message: '✅ No compliance issues found! Property passes all rules.',
                remediations: [],
              });
            }

            // Get state knowledge for context
            let stateKnowledge: any[] = [];
            try {
              stateKnowledge = await StateKnowledge.getForState(state);
            } catch {
              // Continue without knowledge
            }

            // Generate remediations
            const remediations: any[] = [];

            for (const rule of filteredRules) {
              const remediation: any = {
                issue: rule.name,
                severity: rule.severity,
                severityEmoji: rule.severity === 'critical' ? '🔴' : rule.severity === 'warning' ? '🟡' : '🟢',
                field: rule.field,
                currentValue: rule.currentValue === undefined ? 'not set' : rule.currentValue,
                message: rule.message,
              };

              // Generate specific fix based on operator
              switch (rule.operator) {
                case 'required':
                  remediation.fix = `Add a value for "${rule.field}"`;
                  remediation.action = 'update_property';
                  remediation.suggestedUpdate = { [rule.field]: '<provide value>' };
                  break;
                case 'equals':
                  remediation.fix = `Change "${rule.field}" to "${rule.value}"`;
                  remediation.action = 'update_property';
                  remediation.suggestedUpdate = { [rule.field]: rule.value };
                  break;
                case 'is_true':
                  remediation.fix = `Set "${rule.field}" to true`;
                  remediation.action = 'update_property';
                  remediation.suggestedUpdate = { [rule.field]: true };
                  break;
                case 'is_false':
                  remediation.fix = `Set "${rule.field}" to false`;
                  remediation.action = 'update_property';
                  remediation.suggestedUpdate = { [rule.field]: false };
                  break;
                case 'min_value':
                  remediation.fix = `Increase "${rule.field}" to at least ${rule.value}`;
                  remediation.action = 'update_property';
                  remediation.suggestedUpdate = { [rule.field]: Number(rule.value) };
                  break;
                case 'max_value':
                  remediation.fix = `Reduce "${rule.field}" to at most ${rule.value}`;
                  remediation.action = 'update_property';
                  remediation.suggestedUpdate = { [rule.field]: Number(rule.value) };
                  break;
                case 'contains':
                  remediation.fix = `Ensure "${rule.field}" contains "${rule.value}"`;
                  remediation.action = 'update_property';
                  const currentStr = String(rule.currentValue || '');
                  remediation.suggestedUpdate = { [rule.field]: currentStr ? `${currentStr} ${rule.value}` : rule.value };
                  break;
                case 'in_list':
                  const options = rule.value.split(',').map((v: string) => v.trim());
                  remediation.fix = `Change "${rule.field}" to one of: ${options.join(', ')}`;
                  remediation.action = 'update_property';
                  remediation.suggestedUpdate = { [rule.field]: options[0] };
                  remediation.validOptions = options;
                  break;
                default:
                  remediation.fix = rule.message;
                  remediation.action = 'manual_review';
              }

              // Add context from state knowledge if available
              if (rule.category === 'licensing') {
                const licenseKnowledge = stateKnowledge.find((k: any) => k.type === 'license_info');
                if (licenseKnowledge) {
                  remediation.stateContext = licenseKnowledge.summary || licenseKnowledge.content?.substring(0, 200);
                }
              } else if (rule.category === 'disclosure') {
                const disclosureKnowledge = stateKnowledge.find((k: any) => k.type === 'disclosure');
                if (disclosureKnowledge) {
                  remediation.stateContext = disclosureKnowledge.summary || disclosureKnowledge.content?.substring(0, 200);
                }
              }

              // Priority based on severity
              remediation.priority = rule.severity === 'critical' ? 1 : rule.severity === 'warning' ? 2 : 3;

              remediations.push(remediation);
            }

            // Sort by priority
            remediations.sort((a, b) => a.priority - b.priority);

            // Generate quick fix command
            const criticalFixes = remediations.filter(r => r.severity === 'critical' && r.suggestedUpdate);
            let quickFixSuggestion = null;
            if (criticalFixes.length > 0) {
              const updates = criticalFixes.reduce((acc, r) => ({ ...acc, ...r.suggestedUpdate }), {});
              quickFixSuggestion = {
                message: `Fix ${criticalFixes.length} critical issue(s) with one update:`,
                command: `update_property({ propertyId: "${p.propertyId}", updates: ${JSON.stringify(updates)} })`,
              };
            }

            return JSON.stringify({
              success: true,
              property: {
                id: p.id,
                propertyId: p.propertyId,
                address: p.address?.street || p.addressStreet,
                city: p.city,
                state,
                county,
              },
              summary: {
                totalIssues: filteredRules.length,
                critical: filteredRules.filter(r => r.severity === 'critical').length,
                warning: filteredRules.filter(r => r.severity === 'warning').length,
                info: filteredRules.filter(r => r.severity === 'info').length,
              },
              remediations,
              quickFix: quickFixSuggestion,
              message: `🔧 Found ${filteredRules.length} issue(s) with suggested fixes`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error suggesting remediation: ${error}` });
          }
        },
        {
          name: 'suggest_remediation',
          description: 'Get AI-powered suggestions for fixing compliance issues on a property. Returns specific field updates and actions needed. Use when user asks "how do I fix compliance", "what do I need to fix", "help me pass compliance".',
          schema: z.object({
            propertyId: z.string().optional().describe('Property ID'),
            propertyAddress: z.string().optional().describe('Property address to look up'),
            issueType: z.string().optional().describe('Filter by issue type (licensing, disclosure, contract) or severity (critical, warning)'),
          }),
        }
      ),

      // ============================================================
      // AUTOMATION/TRIGGER TOOLS
      // ============================================================
      tool(
        async ({ showDisabled }) => {
          try {
            const automations = dealProcessingService.getAllAutomations();

            const filtered = showDisabled ? automations : automations.filter(a => a.enabled);

            const summary = filtered.map(a => ({
              id: a.id,
              name: a.name,
              enabled: a.enabled,
              trigger: a.trigger.type,
              actionsCount: a.actions.length,
              executionCount: a.executionCount || 0,
              lastExecuted: a.lastExecutedAt,
            }));

            return JSON.stringify({
              automations: summary,
              total: automations.length,
              enabled: automations.filter(a => a.enabled).length,
              disabled: automations.filter(a => !a.enabled).length,
            });
          } catch (error) {
            return `Error listing automations: ${error}`;
          }
        },
        {
          name: 'list_automations',
          description: 'List all automation rules/triggers. Shows name, status, trigger type, and execution count.',
          schema: z.object({
            showDisabled: z.boolean().optional().default(true).describe('Include disabled automations'),
          }),
        }
      ),

      tool(
        async ({ automationId }) => {
          try {
            const automation = dealProcessingService.getAutomation(automationId);

            if (!automation) {
              const all = dealProcessingService.getAllAutomations();
              return `Automation "${automationId}" not found. Available: ${all.map(a => a.name).join(', ')}`;
            }

            return JSON.stringify({
              automation,
            });
          } catch (error) {
            return `Error getting automation: ${error}`;
          }
        },
        {
          name: 'get_automation',
          description: 'Get full details of a specific automation including trigger, conditions, and actions.',
          schema: z.object({
            automationId: z.string().describe('The automation ID or name'),
          }),
        }
      ),

      tool(
        async ({ automationId, enabled }) => {
          try {
            const automation = dealProcessingService.getAutomation(automationId);

            if (!automation) {
              return `Automation "${automationId}" not found`;
            }

            // Toggle if no value provided
            const newEnabled = enabled !== undefined ? enabled : !automation.enabled;
            const updated = await dealProcessingService.updateAutomation(automationId, { enabled: newEnabled });

            return JSON.stringify({
              success: true,
              automationId,
              name: automation.name,
              enabled: newEnabled,
              message: `Automation "${automation.name}" ${newEnabled ? 'enabled' : 'disabled'}`,
            });
          } catch (error) {
            return `Error toggling automation: ${error}`;
          }
        },
        {
          name: 'toggle_automation',
          description: 'Enable or disable an automation. If no value provided, toggles current state.',
          schema: z.object({
            automationId: z.string().describe('The automation ID'),
            enabled: z.boolean().optional().describe('Set to true to enable, false to disable, or omit to toggle'),
          }),
        }
      ),

      tool(
        async ({ name, description, triggerType, triggerConfig, conditions, actions, enabled }) => {
          try {
            const automation = {
              id: `automation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name,
              description,
              enabled: enabled !== false,
              trigger: {
                type: triggerType,
                config: triggerConfig || {},
              },
              conditions: conditions || [],
              actions: actions.map((a: any, i: number) => ({
                type: a.type,
                config: a.config || {},
                order: i + 1,
                continueOnError: a.continueOnError || false,
              })),
              executionCount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            await dealProcessingService.addAutomation(automation as any);

            return JSON.stringify({
              success: true,
              automation: {
                id: automation.id,
                name: automation.name,
                enabled: automation.enabled,
                trigger: automation.trigger.type,
                actionsCount: automation.actions.length,
              },
              message: `Automation "${name}" created successfully`,
            });
          } catch (error) {
            return `Error creating automation: ${error}`;
          }
        },
        {
          name: 'create_automation',
          description: 'Create a new automation trigger. Trigger types: deal_received, deal_scored, deal_matched, score_threshold, manual, webhook_received',
          schema: z.object({
            name: z.string().describe('Name for the automation'),
            description: z.string().optional().describe('Description of what this automation does'),
            triggerType: z.enum(['deal_received', 'deal_enriched', 'deal_analyzed', 'deal_scored', 'deal_matched', 'compliance_checked', 'score_threshold', 'deal_updated', 'webhook_received', 'schedule', 'manual']).describe('The event that triggers this automation'),
            triggerConfig: z.record(z.string(), z.unknown()).optional().describe('Additional trigger configuration'),
            conditions: z.array(z.object({
              field: z.string(),
              operator: z.string(),
              value: z.unknown(),
            })).optional().describe('Conditions that must be met for automation to run'),
            actions: z.array(z.object({
              type: z.enum(['send_email', 'send_webhook', 'update_deal', 'add_tag', 'send_notification', 'log_event', 'score_against_buybox', 'run_compliance_check', 'enrich_deal', 'submit_to_marketplace']),
              config: z.record(z.string(), z.unknown()).optional(),
              continueOnError: z.boolean().optional(),
            })).describe('Actions to execute when triggered'),
            enabled: z.boolean().optional().default(true).describe('Whether the automation is enabled'),
          }),
        }
      ),

      tool(
        async ({ automationId, confirm }) => {
          try {
            if (!confirm) {
              return 'Deletion not confirmed. Set confirm=true to delete the automation.';
            }

            const automation = dealProcessingService.getAutomation(automationId);
            if (!automation) {
              return `Automation "${automationId}" not found`;
            }

            await dealProcessingService.deleteAutomation(automationId);

            return JSON.stringify({
              success: true,
              message: `Automation "${automation.name}" deleted`,
            });
          } catch (error) {
            return `Error deleting automation: ${error}`;
          }
        },
        {
          name: 'delete_automation',
          description: 'Delete an automation. Requires confirmation.',
          schema: z.object({
            automationId: z.string().describe('The automation ID to delete'),
            confirm: z.boolean().describe('Must be true to confirm deletion'),
          }),
        }
      ),

      tool(
        async ({ automationId, limit }) => {
          try {
            const { AutomationExecution } = await import('../models');

            const history = await AutomationExecution.findAll({
              where: { automationId },
              order: [['executedAt', 'DESC']],
              limit: limit || 10,
            });

            if (history.length === 0) {
              return `No execution history found for automation "${automationId}"`;
            }

            const summary = history.map(h => ({
              id: h.id,
              status: h.status,
              triggeredBy: h.triggeredBy,
              eventType: h.eventType,
              actionsExecuted: h.actionsExecuted,
              actionsFailed: h.actionsFailed,
              duration: h.duration,
              error: h.error,
              executedAt: h.executedAt,
            }));

            return JSON.stringify({
              automationId,
              executions: summary,
              count: history.length,
            });
          } catch (error) {
            return `Error getting automation history: ${error}`;
          }
        },
        {
          name: 'get_automation_history',
          description: 'Get execution history for an automation - shows when it ran, status, and any errors.',
          schema: z.object({
            automationId: z.string().describe('The automation ID'),
            limit: z.number().optional().default(10).describe('Number of recent executions to return'),
          }),
        }
      ),

      // ============================================================
      // SCHEDULING TOOLS (REMINDERS/REPORTS/ACTIONS)
      // ============================================================
      tool(
        async ({ title, message, scheduledFor, recurrence, timezone }) => {
          try {
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'User authentication required to schedule reminders.' });
            }

            const sessionId = self.getCurrentSessionId() || `session-${Date.now()}`;
            const parsedTime = scheduledTaskService.parseNaturalTime(scheduledFor, timezone);
            if (!parsedTime) {
              return JSON.stringify({
                success: false,
                error: `Could not understand the time "${scheduledFor}". Try "in 2 hours", "tomorrow at 9am", or "next Monday".`,
              });
            }

            let parsedRecurrence: string | undefined;
            if (recurrence) {
              parsedRecurrence = scheduledTaskService.parseRecurrence(recurrence) || undefined;
              if (!parsedRecurrence) {
                return JSON.stringify({
                  success: false,
                  error: `Could not understand recurrence "${recurrence}". Try "daily", "weekly", "monthly", or "every Monday".`,
                });
              }
            }

            const task = await scheduledTaskService.createTask({
              userId,
              sessionId,
              type: 'reminder',
              title,
              message,
              scheduledFor: parsedTime,
              recurrence: parsedRecurrence,
              timezone,
            });

            return JSON.stringify({
              success: true,
              taskId: task.id,
              title: task.title,
              scheduledFor: task.scheduledFor.toISOString(),
              formattedTime: task.scheduledFor.toLocaleString(),
              recurring: !!parsedRecurrence,
              message: `Reminder scheduled for ${task.scheduledFor.toLocaleString()}`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error scheduling reminder: ${error}` });
          }
        },
        {
          name: 'schedule_reminder',
          description: 'Schedule a reminder for the user. Accepts natural language times like "in 2 hours", "tomorrow at 9am", "next Monday".',
          schema: z.object({
            title: z.string().describe('Short title for the reminder'),
            message: z.string().describe('Reminder message/details'),
            scheduledFor: z.string().describe('When to send the reminder (natural language)'),
            recurrence: z.string().optional().describe('Optional recurrence: "daily", "weekly", "monthly", or "every Monday"'),
            timezone: z.string().optional().describe('User timezone (e.g., America/Chicago)'),
          }),
        }
      ),

      tool(
        async ({ title, reportType, scheduledFor, recurrence, parameters, timezone }) => {
          try {
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'User authentication required to schedule reports.' });
            }

            const sessionId = self.getCurrentSessionId() || `session-${Date.now()}`;
            const parsedTime = scheduledTaskService.parseNaturalTime(scheduledFor, timezone);
            if (!parsedTime) {
              return JSON.stringify({ success: false, error: `Could not understand the time "${scheduledFor}".` });
            }

            let parsedRecurrence: string | undefined;
            if (recurrence) {
              parsedRecurrence = scheduledTaskService.parseRecurrence(recurrence) || undefined;
            }

            const task = await scheduledTaskService.createTask({
              userId,
              sessionId,
              type: 'report',
              title,
              message: `${reportType} report`,
              scheduledFor: parsedTime,
              recurrence: parsedRecurrence,
              timezone,
              actionType: reportType,
              actionParams: parameters,
            });

            return JSON.stringify({
              success: true,
              taskId: task.id,
              title: task.title,
              reportType,
              scheduledFor: task.scheduledFor.toISOString(),
              recurring: !!parsedRecurrence,
              recurrencePattern: recurrence,
              message: `${reportType} report scheduled for ${task.scheduledFor.toLocaleString()}`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error scheduling report: ${error}` });
          }
        },
        {
          name: 'schedule_report',
          description: 'Schedule a one-time or recurring report (market summary, deal pipeline, buy box matches, property alerts).',
          schema: z.object({
            title: z.string().describe('Report title'),
            reportType: z.enum(['market_summary', 'deal_pipeline', 'buy_box_matches', 'property_alerts', 'custom']).describe('Type of report to generate'),
            scheduledFor: z.string().describe('When to generate the first report (natural language)'),
            recurrence: z.string().optional().describe('Recurrence pattern: "daily", "weekly", "monthly"'),
            parameters: z.record(z.string(), z.any()).optional().describe('Report-specific parameters'),
            timezone: z.string().optional().describe('User timezone (e.g., America/Chicago)'),
          }),
        }
      ),

      tool(
        async ({ title, actionType, actionParams, scheduledFor, timezone }) => {
          try {
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'User authentication required to schedule actions.' });
            }

            const sessionId = self.getCurrentSessionId() || `session-${Date.now()}`;
            const parsedTime = scheduledTaskService.parseNaturalTime(scheduledFor, timezone);
            if (!parsedTime) {
              return JSON.stringify({ success: false, error: `Could not understand the time "${scheduledFor}".` });
            }

            const task = await scheduledTaskService.createTask({
              userId,
              sessionId,
              type: 'action',
              title,
              message: `Execute ${actionType}`,
              scheduledFor: parsedTime,
              timezone,
              actionType,
              actionParams,
            });

            return JSON.stringify({
              success: true,
              taskId: task.id,
              title: task.title,
              actionType,
              scheduledFor: task.scheduledFor.toISOString(),
              message: `Action "${actionType}" scheduled for ${task.scheduledFor.toLocaleString()}`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error scheduling action: ${error}` });
          }
        },
        {
          name: 'schedule_action',
          description: 'Schedule a tool/action to run at a specific time (e.g., "analyze this property tomorrow").',
          schema: z.object({
            title: z.string().describe('Description of the scheduled action'),
            actionType: z.string().describe('Name of the tool to execute'),
            actionParams: z.record(z.string(), z.any()).describe('Parameters to pass to the tool'),
            scheduledFor: z.string().describe('When to execute the action (natural language)'),
            timezone: z.string().optional().describe('User timezone (e.g., America/Chicago)'),
          }),
        }
      ),

      tool(
        async ({ status, type, limit }) => {
          try {
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'User authentication required.' });
            }

            const statusFilter =
              status === 'all'
                ? ['pending', 'completed', 'failed', 'cancelled']
                : [status || 'pending'];

            const { tasks, total } = await scheduledTaskService.listTasks(userId, {
              status: statusFilter as any,
              type,
              limit,
            });

            return JSON.stringify({
              success: true,
              tasks: tasks.map((t) => ({
                id: t.id,
                type: t.type,
                title: t.title,
                message: t.message,
                scheduledFor: t.scheduledFor.toISOString(),
                formattedTime: t.scheduledFor.toLocaleString(),
                status: t.status,
                recurring: !!t.recurrence,
                actionType: t.actionType,
              })),
              count: tasks.length,
              total,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error listing scheduled tasks: ${error}` });
          }
        },
        {
          name: 'list_scheduled_tasks',
          description: 'List scheduled tasks (reminders, reports, actions). Shows pending tasks by default.',
          schema: z.object({
            status: z.enum(['pending', 'completed', 'failed', 'cancelled', 'all']).optional().default('pending').describe('Filter by status'),
            type: z.enum(['reminder', 'report', 'action']).optional().describe('Filter by task type'),
            limit: z.number().optional().default(20).describe('Maximum tasks to return'),
          }),
        }
      ),

      tool(
        async ({ taskId }) => {
          try {
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'User authentication required.' });
            }

            const cancelled = await scheduledTaskService.cancelTask(taskId, userId);
            if (!cancelled) {
              return JSON.stringify({
                success: false,
                error: `Could not cancel task ${taskId}. It may not exist, already completed, or belong to another user.`,
              });
            }

            return JSON.stringify({
              success: true,
              taskId,
              cancelled: true,
              message: `Task ${taskId} has been cancelled.`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error cancelling task: ${error}` });
          }
        },
        {
          name: 'cancel_scheduled_task',
          description: 'Cancel a pending scheduled task by ID.',
          schema: z.object({
            taskId: z.string().describe('ID of the task to cancel'),
          }),
        }
      ),

      tool(
        async ({ taskId, newTime, timezone }) => {
          try {
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'User authentication required.' });
            }

            const task = await scheduledTaskService.rescheduleTask(taskId, userId, newTime, timezone);
            if (!task) {
              return JSON.stringify({
                success: false,
                error: `Could not reschedule task ${taskId}. It may not exist or belong to another user.`,
              });
            }

            return JSON.stringify({
              success: true,
              taskId: task.id,
              title: task.title,
              newTime: task.scheduledFor.toISOString(),
              formattedTime: task.scheduledFor.toLocaleString(),
              message: `Task rescheduled to ${task.scheduledFor.toLocaleString()}`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error rescheduling task: ${error}` });
          }
        },
        {
          name: 'reschedule_task',
          description: 'Reschedule a pending task to a new time.',
          schema: z.object({
            taskId: z.string().describe('ID of the task to reschedule'),
            newTime: z.string().describe('New time for the task (natural language)'),
            timezone: z.string().optional().describe('User timezone (e.g., America/Chicago)'),
          }),
        }
      ),

      // ============================================================
      // MARKET DATA TOOLS (Zillow Integration)
      // ============================================================
      tool(
        async ({ address, city, state, zip, includeComparables, includeSkipTrace }) => {
          try {
            const service = MarketDataService.getInstance();
            const result = await service.getFullPropertyLookup(
              { address, city, state, zip },
              {
                includeImages: false, // Keep response size manageable
                includePriceHistory: true,
                includeTaxHistory: true,
                includeComparables: includeComparables !== false,
              }
            );

            const prop = result.property;

            // Format for agent consumption
            const summary: any = {
              zpid: prop.zpid,
              address: prop.address,
              city: prop.city,
              state: prop.state,
              zip: prop.zip,
              valuation: {
                zestimate: prop.zestimate,
                zestimateRange: prop.zestimateRangeLow && prop.zestimateRangeHigh
                  ? `$${prop.zestimateRangeLow?.toLocaleString()} - $${prop.zestimateRangeHigh?.toLocaleString()}`
                  : null,
                rentZestimate: prop.rentZestimate,
                pricePerSqft: prop.pricePerSqft,
              },
              property: {
                bedrooms: prop.bedrooms,
                bathrooms: prop.bathrooms,
                sqft: prop.sqft,
                lotSize: prop.lotSize,
                yearBuilt: prop.yearBuilt,
                propertyType: prop.propertyType,
              },
              lastSale: prop.lastSoldPrice ? {
                price: prop.lastSoldPrice,
                date: prop.lastSoldDate,
              } : null,
              taxAssessed: prop.taxAssessedValue,
              dataSource: prop.dataSource,
            };

            // Add skip trace if available
            if (includeSkipTrace && result.skipTrace) {
              const firstOwner = result.skipTrace.owners?.[0];
              summary.owner = {
                name: firstOwner?.name,
                mailingAddress: result.skipTrace.mailingAddress,
                phones: firstOwner?.phones?.slice(0, 3).map(p => p.number),
                emails: firstOwner?.emails?.slice(0, 3),
              };
            }

            // Add comparables summary
            if (result.comparables?.comparables?.length) {
              const comps = result.comparables.comparables;
              summary.comparables = {
                count: comps.length,
                averagePrice: Math.round(
                  comps.reduce((sum, c) => sum + (c.price || 0), 0) / comps.length
                ),
                homes: comps.slice(0, 5).map(c => ({
                  address: c.address,
                  price: c.price,
                  bedrooms: c.bedrooms,
                  bathrooms: c.bathrooms,
                  sqft: c.sqft,
                  distance: c.distance,
                })),
              };
            }

            // Add price history summary
            if (result.priceHistory?.history?.length) {
              summary.priceHistory = {
                totalEvents: result.priceHistory.totalEvents,
                lastSale: result.priceHistory.lastSalePrice
                  ? { price: result.priceHistory.lastSalePrice, date: result.priceHistory.lastSaleDate }
                  : null,
                recentEvents: result.priceHistory.history.slice(0, 5).map(e => ({
                  date: e.date,
                  event: e.event,
                  price: e.price,
                })),
              };
            }

            return JSON.stringify(summary);
          } catch (error) {
            return `Error looking up market data: ${error}`;
          }
        },
        {
          name: 'lookup_market_data',
          description: 'Look up comprehensive market data for a property including Zestimate valuation, property details, comparable homes, price history, and optionally owner/skip trace info. Uses cached data when available to save API calls.',
          schema: z.object({
            address: z.string().describe('Full property address (e.g., "123 Main St, Austin, TX 78701")'),
            city: z.string().optional().describe('City name'),
            state: z.string().optional().describe('State code (e.g., TX)'),
            zip: z.string().optional().describe('ZIP code'),
            includeComparables: z.boolean().optional().default(true).describe('Include comparable homes'),
            includeSkipTrace: z.boolean().optional().default(false).describe('Include owner/contact info (skip trace)'),
          }),
        }
      ),

      tool(
        async ({ address, city, state, zip }) => {
          try {
            const service = MarketDataService.getInstance();
            const result = await service.getSkipTrace({ address, city, state, zip });

            if (!result) {
              return 'No skip trace data found for this property.';
            }

            const firstOwner = result.owners?.[0];

            return JSON.stringify({
              owner: {
                name: firstOwner?.name,
                occupancy: result.ownerOccupied ? 'Owner Occupied' : 'Non-Owner Occupied',
                ownershipType: result.ownershipType,
              },
              contact: {
                phones: firstOwner?.phones?.map(p => ({ number: p.number, type: p.type })) || [],
                emails: firstOwner?.emails || [],
                mailingAddress: result.mailingAddress,
              },
              dataSource: result.dataSource,
            });
          } catch (error) {
            return `Error getting skip trace: ${error}`;
          }
        },
        {
          name: 'skip_trace_property',
          description: 'Get owner/contact information for a property (skip trace). Returns owner name, phone numbers, emails, mailing address, and equity info.',
          schema: z.object({
            address: z.string().describe('Property address'),
            city: z.string().optional().describe('City'),
            state: z.string().optional().describe('State'),
            zip: z.string().optional().describe('ZIP code'),
          }),
        }
      ),

      tool(
        async ({ location, bedroomType, homeType }) => {
          try {
            const service = MarketDataService.getInstance();
            const result = await service.getRentalMarketTrends(
              location,
              bedroomType || 'All_Bedrooms',
              homeType || 'All_Property_Types'
            );

            if (!result) {
              return `No rental market data found for ${location}`;
            }

            return JSON.stringify({
              location: result.location,
              summary: {
                medianRent: result.medianRent,
                averageRent: result.averageRent,
                totalListings: result.totalListings,
                yearOverYearChange: result.yearOverYearChange,
                monthOverMonthChange: result.monthOverMonthChange,
              },
              trends: result.trends?.slice(0, 12).map(t => ({
                date: t.date,
                medianRent: t.medianRent,
                rentChange: t.rentChangePercent,
              })),
              rentalYield: result.medianRent
                ? `Median rent $${result.medianRent}/mo from ${result.totalListings || 'N/A'} listings`
                : null,
              dataSource: result.dataSource,
            });
          } catch (error) {
            return `Error getting rental trends: ${error}`;
          }
        },
        {
          name: 'get_rental_market_trends',
          description: 'Get rental market trends for a city/area including median rent, average rent, listing counts, and historical trends.',
          schema: z.object({
            location: z.string().describe('City and state (e.g., "Austin, TX")'),
            bedroomType: z.string().optional().describe('Bedroom filter: All_Bedrooms, Studio, One, Two, Three, Four_Plus'),
            homeType: z.string().optional().describe('Home type: All_Property_Types, Apartments, Houses, Condos, Townhomes'),
          }),
        }
      ),

      tool(
        async ({ limit }) => {
          try {
            const service = MarketDataService.getInstance();
            const results = await service.getRecentLookups(limit || 10);

            if (results.length === 0) {
              return 'No recent property lookups found in database.';
            }

            return JSON.stringify({
              count: results.length,
              lookups: results.map(r => ({
                zpid: r.zpid,
                address: r.address,
                city: r.city,
                state: r.state,
                zestimate: r.zestimate,
                bedrooms: r.bedrooms,
                bathrooms: r.bathrooms,
                sqft: r.sqft,
                lookupCount: r.lookupCount,
                lastLookupAt: r.lastLookupAt,
              })),
            });
          } catch (error) {
            return `Error getting recent lookups: ${error}`;
          }
        },
        {
          name: 'get_recent_market_lookups',
          description: 'Get recently looked up properties from the market data cache. Useful for reviewing what properties have been researched.',
          schema: z.object({
            limit: z.number().optional().default(10).describe('Number of recent lookups to return'),
          }),
        }
      ),

      // ============================================================
      // OFFER MANAGEMENT TOOLS
      // ============================================================
      tool(
        async ({ propertyId, offerAmount, closingDays, financeType, earnestMoney, contingencies, notes, expiresInDays }) => {
          try {
            // Check if property exists
            const property = await Property.findOne({ where: { propertyId } });
            if (!property) {
              return `Property ${propertyId} not found.`;
            }

            const p = property as any;

            // Create the offer
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + (expiresInDays || 7));

            const offer = await DealOffer.create({
              userId: 'agent-user', // Default agent user
              dealId: propertyId,
              propertyId: p.id?.toString(),
              offerAmount,
              closingDays: closingDays || 14,
              financeType: financeType || 'cash',
              earnestMoney: earnestMoney || Math.round(offerAmount * 0.01), // Default 1% EMD
              contingencies: contingencies || [],
              notes,
              expiresAt,
              status: 'pending',
            });

            const askingPrice = p.mlsListingPrice || p.buyItNowPrice || 0;
            const discount = askingPrice > 0 ? ((askingPrice - offerAmount) / askingPrice * 100).toFixed(1) : '0';

            return JSON.stringify({
              success: true,
              offer: {
                id: offer.id,
                propertyId,
                address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state}`.trim(),
                offerAmount,
                askingPrice,
                discount: `${discount}%`,
                closingDays,
                financeType: financeType || 'cash',
                earnestMoney: offer.earnestMoney,
                status: 'pending',
                expiresAt: expiresAt.toISOString(),
              },
              message: `Offer created for $${offerAmount.toLocaleString()} (${discount}% below asking)`,
            });
          } catch (error) {
            return `Error creating offer: ${error}`;
          }
        },
        {
          name: 'create_offer',
          description: 'Create a new offer on a property. Tracks offer amount, closing timeline, financing, and earnest money.',
          schema: z.object({
            propertyId: z.string().describe('The property ID to make an offer on'),
            offerAmount: z.number().describe('Offer amount in dollars'),
            closingDays: z.number().optional().default(14).describe('Days to close (default 14)'),
            financeType: z.enum(['cash', 'hard_money', 'conventional', 'other']).optional().default('cash').describe('Financing type'),
            earnestMoney: z.number().optional().describe('Earnest money deposit (defaults to 1% of offer)'),
            contingencies: z.array(z.string()).optional().describe('List of contingencies (e.g., inspection, financing)'),
            notes: z.string().optional().describe('Additional notes for the offer'),
            expiresInDays: z.number().optional().default(7).describe('Days until offer expires (default 7)'),
          }),
        }
      ),

      tool(
        async ({ status, propertyId, limit }) => {
          try {
            const where: any = {};
            if (status) where.status = status;
            if (propertyId) where.dealId = propertyId;

            const offers = await DealOffer.findAll({
              where,
              order: [['createdAt', 'DESC']],
              limit: limit || 20,
            });

            if (offers.length === 0) {
              return status
                ? `No ${status} offers found.`
                : 'No offers found.';
            }

            // Batch fetch all properties to avoid N+1 queries
            const propertyIds = offers.map((o) => o.dealId).filter(Boolean);
            const propertyMap = await batchFetchProperties(propertyIds);

            // Map offers with pre-fetched property data
            const offerDetails = offers.map((offer) => {
              const property = propertyMap.get(offer.dealId);
              const p = property as any;

              return {
                id: offer.id,
                propertyId: offer.dealId,
                address: p ? `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state}`.trim() : 'Unknown',
                offerAmount: offer.offerAmount,
                askingPrice: p?.mlsListingPrice || p?.buyItNowPrice,
                status: offer.status,
                closingDays: offer.closingDays,
                financeType: offer.financeType,
                earnestMoney: offer.earnestMoney,
                counterOffer: offer.counterOfferAmount ? {
                  amount: offer.counterOfferAmount,
                  closingDays: offer.counterOfferClosingDays,
                  notes: offer.counterOfferNotes,
                } : null,
                createdAt: offer.createdAt,
                expiresAt: offer.expiresAt,
              };
            });

            const summary = {
              pending: offers.filter(o => o.status === 'pending').length,
              accepted: offers.filter(o => o.status === 'accepted').length,
              rejected: offers.filter(o => o.status === 'rejected').length,
              countered: offers.filter(o => o.status === 'countered').length,
            };

            return JSON.stringify({
              count: offers.length,
              summary,
              offers: offerDetails,
            });
          } catch (error) {
            return `Error listing offers: ${error}`;
          }
        },
        {
          name: 'list_offers',
          description: 'List all offers with optional filtering by status or property. Shows offer details, counter offers, and status.',
          schema: z.object({
            status: z.enum(['pending', 'viewed', 'countered', 'accepted', 'rejected', 'expired', 'withdrawn']).optional().describe('Filter by offer status'),
            propertyId: z.string().optional().describe('Filter by property ID'),
            limit: z.number().optional().default(20).describe('Maximum number of offers to return'),
          }),
        }
      ),

      // ============================================================
      // PROPERTY CRUD TOOLS
      // ============================================================
      tool(
        async ({ propertyId, updates }) => {
          try {
            const property = await Property.findOne({ where: { propertyId } });
            if (!property) {
              return `Property ${propertyId} not found.`;
            }

            // Apply updates
            const allowedFields = [
              // Pricing
              'mlsListingPrice', 'buyItNowPrice', 'arv', 'rehabCost', 'reservePrice',
              // Property details
              'bedroomCount', 'bathroomCount', 'livingSpaceSqFt', 'lotSizeSqFt',
              'yearBuilt', 'propertyType', 'propertyOwnership', 'stories',
              // Location
              'city', 'state', 'zip', 'county',
              // Occupancy
              'occupancyStatus', 'occupancyDetails', 'deliveredVacant',
              // Contact/Wholesaler
              'wholesalerLlcName', 'llcOwnerName', 'llcOwnerEmail',
              // Description & Notes
              'propertyListingDescription', 'notes',
              // Compliance
              'assignable', 'marketingClauseFound', 'brokerOnFile',
              // Features
              'pool', 'solar', 'septic', 'well', 'hoa',
            ];

            const updateData: any = {};
            for (const [key, value] of Object.entries(updates)) {
              if (allowedFields.includes(key) && value !== undefined) {
                updateData[key] = value;
              }
            }

            if (Object.keys(updateData).length === 0) {
              return 'No valid fields to update. Allowed fields: ' + allowedFields.join(', ');
            }

            await property.update(updateData);

            return JSON.stringify({
              success: true,
              propertyId,
              updated: Object.keys(updateData),
              message: `Updated ${Object.keys(updateData).length} field(s) on property ${propertyId}`,
            });
          } catch (error) {
            return `Error updating property: ${error}`;
          }
        },
        {
          name: 'update_property',
          description: 'Update ANY field on an existing property. Use this when user wants to change price, ARV, bedrooms, description, location, contact info, or any other detail. First search for the property to get its ID, then update it.',
          schema: z.object({
            propertyId: z.string().describe('The property ID to update (e.g., "prop_abc123" or numeric ID)'),
            updates: z.object({
              // Pricing
              mlsListingPrice: z.number().optional().describe('Listing/asking price'),
              buyItNowPrice: z.number().optional().describe('Buy it now price'),
              reservePrice: z.number().optional().describe('Reserve price'),
              arv: z.number().optional().describe('After repair value'),
              rehabCost: z.number().optional().describe('Estimated rehab/repair cost'),
              // Property details
              bedroomCount: z.number().optional().describe('Number of bedrooms'),
              bathroomCount: z.number().optional().describe('Number of bathrooms'),
              livingSpaceSqFt: z.number().optional().describe('Living space square feet'),
              lotSizeSqFt: z.number().optional().describe('Lot size square feet'),
              yearBuilt: z.number().optional().describe('Year built'),
              stories: z.number().optional().describe('Number of stories'),
              propertyType: z.string().optional().describe('Property type (Single Family, Townhouse, etc.)'),
              propertyOwnership: z.string().optional().describe('Ownership type (Fee Simple, etc.)'),
              // Location
              city: z.string().optional().describe('City name'),
              state: z.string().optional().describe('State code (TX, FL, etc.)'),
              zip: z.string().optional().describe('ZIP code'),
              county: z.string().optional().describe('County name'),
              // Occupancy
              occupancyStatus: z.string().optional().describe('Occupancy status (Vacant, Owner Occupied, Tenant Occupied)'),
              occupancyDetails: z.string().optional().describe('Additional occupancy details'),
              deliveredVacant: z.boolean().optional().describe('Will be delivered vacant'),
              // Contact/Wholesaler
              wholesalerLlcName: z.string().optional().describe('Wholesaler company name'),
              llcOwnerName: z.string().optional().describe('Contact/owner name'),
              llcOwnerEmail: z.string().optional().describe('Contact email'),
              // Description
              propertyListingDescription: z.string().optional().describe('Property description'),
              notes: z.string().optional().describe('Internal notes'),
              // Compliance
              assignable: z.boolean().optional().describe('Contract is assignable'),
              marketingClauseFound: z.boolean().optional().describe('Has marketing clause'),
              brokerOnFile: z.boolean().optional().describe('Has broker on file'),
              // Features
              pool: z.boolean().optional().describe('Has pool'),
              solar: z.boolean().optional().describe('Has solar panels'),
              septic: z.boolean().optional().describe('Has septic system'),
              well: z.boolean().optional().describe('Has well water'),
              hoa: z.boolean().optional().describe('Has HOA'),
            }).describe('Fields to update - include only the fields you want to change'),
          }),
        }
      ),

      tool(
        async ({ propertyId, confirm }) => {
          try {
            if (!confirm) {
              return 'Deletion not confirmed. Set confirm=true to delete the property.';
            }

            const property = await Property.findOne({ where: { propertyId } });
            if (!property) {
              return `Property ${propertyId} not found.`;
            }

            const p = property as any;
            const address = `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state}`.trim();

            await property.destroy();

            return JSON.stringify({
              success: true,
              deleted: {
                propertyId,
                address,
              },
              message: `Property ${propertyId} has been deleted.`,
            });
          } catch (error) {
            return `Error deleting property: ${error}`;
          }
        },
        {
          name: 'delete_property',
          description: 'Permanently delete a property from the database. Requires confirmation.',
          schema: z.object({
            propertyId: z.string().describe('The property ID to delete'),
            confirm: z.boolean().describe('Must be true to confirm deletion'),
          }),
        }
      ),

      // Enrich property with market data on-demand
      tool(
        async ({ propertyId }) => {
          try {
            const result = await propertyService.enrichPropertyById(propertyId);

            if (!result.success) {
              return `Failed to enrich property: ${result.error}`;
            }

            return JSON.stringify({
              success: true,
              propertyId,
              enrichment: result.data,
              message: `Property ${propertyId} enriched with market data.`,
            });
          } catch (error) {
            return `Error enriching property: ${error}`;
          }
        },
        {
          name: 'enrich_property',
          description: 'Enrich an existing property with Zillow market data including Zestimate, rent estimate, owner info, and comparable properties.',
          schema: z.object({
            propertyId: z.string().describe('The property ID to enrich with market data'),
          }),
        }
      ),

      // ============================================================
      // DEAL NOTES TOOLS
      // ============================================================
      tool(
        async ({ propertyId, content, subject }) => {
          try {
            const { MarketplaceUser } = await import('../models');
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'Authentication required to create notes' });
            }

            const user = await MarketplaceUser.findByPk(userId);
            if (!user?.organizationId) {
              return JSON.stringify({ success: false, error: 'Organization context required' });
            }

            // Initialize service if needed
            if (!dealNoteService.isReady()) {
              await dealNoteService.initialize();
            }

            const note = await dealNoteService.createNote({
              propertyId,
              userId,
              organizationId: user.organizationId,
              content,
              subject,
            });

            return JSON.stringify({
              success: true,
              note: {
                id: note.id,
                content: note.content,
                subject: note.subject,
                author: note.author.name,
                createdAt: note.createdAt,
              },
              message: `Note added to property ${propertyId}`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error creating note: ${error}` });
          }
        },
        {
          name: 'add_deal_note',
          description: 'Add a note to a deal/property. Use this when the user wants to leave a note, comment, or observation about a deal. Notes are visible to all team members and include who wrote them.',
          schema: z.object({
            propertyId: z.number().describe('The property/deal ID (numeric ID)'),
            content: z.string().describe('The note content - what the user wants to record about this deal'),
            subject: z.string().optional().describe('Optional title or subject for the note'),
          }),
        }
      ),

      tool(
        async ({ propertyId }) => {
          try {
            const { MarketplaceUser } = await import('../models');
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'Authentication required' });
            }

            const user = await MarketplaceUser.findByPk(userId);
            if (!user?.organizationId) {
              return JSON.stringify({ success: false, error: 'Organization context required' });
            }

            // Initialize service if needed
            if (!dealNoteService.isReady()) {
              await dealNoteService.initialize();
            }

            const notes = await dealNoteService.getNotesForProperty(propertyId, user.organizationId);

            if (notes.length === 0) {
              return JSON.stringify({
                success: true,
                count: 0,
                notes: [],
                message: 'No notes found for this property',
              });
            }

            const formattedNotes = notes.map(note => ({
              id: note.id,
              content: note.content,
              subject: note.subject,
              author: note.author.name,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
            }));

            return JSON.stringify({
              success: true,
              count: notes.length,
              notes: formattedNotes,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error fetching notes: ${error}` });
          }
        },
        {
          name: 'get_deal_notes',
          description: 'Get all notes for a deal/property. Shows notes with who wrote them and when. Use this when the user asks to see notes, comments, or history on a deal.',
          schema: z.object({
            propertyId: z.number().describe('The property/deal ID (numeric ID)'),
          }),
        }
      ),

      // ============================================================
      // TEAM MEMBER TOOLS
      // ============================================================
      tool(
        async ({}) => {
          try {
            const { MarketplaceUser } = await import('../models');
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'Authentication required' });
            }

            const user = await MarketplaceUser.findByPk(userId);
            if (!user?.organizationId) {
              return JSON.stringify({ success: false, error: 'Organization context required' });
            }

            const teamMembers = await MarketplaceUser.findAll({
              where: { organizationId: user.organizationId },
              attributes: ['id', 'name', 'email', 'phone', 'role', 'title', 'bio', 'expertise', 'avatar', 'lastActiveAt'],
              order: [['name', 'ASC']],
            });

            const formatted = teamMembers.map(m => ({
              id: m.id,
              name: m.name,
              email: m.email,
              phone: m.phone || null,
              role: m.role,
              title: m.title || null,
              bio: m.bio || null,
              expertise: m.expertise || [],
              avatar: m.avatar || null,
              lastActiveAt: m.lastActiveAt,
            }));

            return JSON.stringify({
              success: true,
              count: formatted.length,
              teamMembers: formatted,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error fetching team members: ${error}` });
          }
        },
        {
          name: 'list_team_members',
          description: 'List all team members in the organization. Shows their names, roles, contact info, expertise, and bios. Use this when the user asks about their team, who is on the team, or wants to see team member details.',
          schema: z.object({}),
        }
      ),

      tool(
        async ({ teamMemberId }) => {
          try {
            const { MarketplaceUser } = await import('../models');
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'Authentication required' });
            }

            const user = await MarketplaceUser.findByPk(userId);
            if (!user?.organizationId) {
              return JSON.stringify({ success: false, error: 'Organization context required' });
            }

            const teamMember = await MarketplaceUser.findOne({
              where: { id: teamMemberId, organizationId: user.organizationId },
            });

            if (!teamMember) {
              return JSON.stringify({ success: false, error: 'Team member not found in your organization' });
            }

            return JSON.stringify({
              success: true,
              teamMember: {
                id: teamMember.id,
                name: teamMember.name,
                email: teamMember.email,
                phone: teamMember.phone || null,
                role: teamMember.role,
                title: teamMember.title || null,
                bio: teamMember.bio || null,
                expertise: teamMember.expertise || [],
                avatar: teamMember.avatar || null,
                company: teamMember.company || null,
                verified: teamMember.verified,
                lastActiveAt: teamMember.lastActiveAt,
                createdAt: teamMember.createdAt,
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error fetching team member: ${error}` });
          }
        },
        {
          name: 'get_team_member',
          description: 'Get detailed information about a specific team member. Use this when the user asks about a particular team member by name or ID.',
          schema: z.object({
            teamMemberId: z.string().describe('The team member user ID (UUID)'),
          }),
        }
      ),

      tool(
        async ({ propertyId, teamMemberId, dealRole, notes }) => {
          try {
            const { MarketplaceUser, DealTeamMember } = await import('../models');
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'Authentication required' });
            }

            const user = await MarketplaceUser.findByPk(userId);
            if (!user?.organizationId) {
              return JSON.stringify({ success: false, error: 'Organization context required' });
            }

            // Verify the team member exists in the organization
            const teamMember = await MarketplaceUser.findOne({
              where: { id: teamMemberId, organizationId: user.organizationId },
            });

            if (!teamMember) {
              return JSON.stringify({ success: false, error: 'Team member not found in your organization' });
            }

            const assignment = await DealTeamMember.assignToProperty({
              propertyId,
              userId: teamMemberId,
              organizationId: user.organizationId,
              dealRole: dealRole || 'support',
              assignedBy: userId,
              notes,
            });

            return JSON.stringify({
              success: true,
              message: `${teamMember.name} has been assigned to deal ${propertyId} as ${dealRole || 'support'}`,
              assignment: {
                id: assignment.id,
                teamMemberName: teamMember.name,
                teamMemberEmail: teamMember.email,
                dealRole: assignment.dealRole,
                propertyId: assignment.propertyId,
                assignedAt: assignment.assignedAt,
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error assigning team member: ${error}` });
          }
        },
        {
          name: 'assign_team_member_to_deal',
          description: 'Assign a team member to a deal/property. The team member will receive notifications for all activity on this deal. Use when the user wants to add someone to a deal team.',
          schema: z.object({
            propertyId: z.number().describe('The property/deal ID (numeric ID)'),
            teamMemberId: z.string().describe('The team member user ID (UUID) to assign'),
            dealRole: z.enum(['lead', 'acquisitions', 'underwriting', 'closing', 'support', 'observer']).optional()
              .describe('The role on this deal: lead (primary responsible), acquisitions (negotiation), underwriting (analysis), closing (closing process), support (general help), observer (view-only)'),
            notes: z.string().optional().describe('Optional notes about this assignment'),
          }),
        }
      ),

      tool(
        async ({ propertyId, teamMemberId }) => {
          try {
            const { MarketplaceUser, DealTeamMember } = await import('../models');
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'Authentication required' });
            }

            const user = await MarketplaceUser.findByPk(userId);
            if (!user?.organizationId) {
              return JSON.stringify({ success: false, error: 'Organization context required' });
            }

            const removed = await DealTeamMember.removeFromProperty(
              propertyId,
              teamMemberId,
              user.organizationId
            );

            if (!removed) {
              return JSON.stringify({ success: false, error: 'Team member not found on this deal' });
            }

            return JSON.stringify({
              success: true,
              message: `Team member removed from deal ${propertyId}`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error removing team member: ${error}` });
          }
        },
        {
          name: 'remove_team_member_from_deal',
          description: 'Remove a team member from a deal/property. They will no longer receive notifications for this deal. Use when the user wants to remove someone from a deal team.',
          schema: z.object({
            propertyId: z.number().describe('The property/deal ID (numeric ID)'),
            teamMemberId: z.string().describe('The team member user ID (UUID) to remove'),
          }),
        }
      ),

      tool(
        async ({ propertyId }) => {
          try {
            const { MarketplaceUser, DealTeamMember } = await import('../models');
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'Authentication required' });
            }

            const user = await MarketplaceUser.findByPk(userId);
            if (!user?.organizationId) {
              return JSON.stringify({ success: false, error: 'Organization context required' });
            }

            const assignments = await DealTeamMember.getForProperty(propertyId, user.organizationId);

            if (assignments.length === 0) {
              return JSON.stringify({
                success: true,
                count: 0,
                teamMembers: [],
                message: 'No team members assigned to this deal',
              });
            }

            // Get user details for each assignment
            const userIds = assignments.map(a => a.userId);
            const users = await MarketplaceUser.findAll({
              where: { id: userIds },
              attributes: ['id', 'name', 'email', 'phone', 'title', 'avatar'],
            });
            const userMap = new Map(users.map(u => [u.id, u]));

            const formatted = assignments.map(a => {
              const teamMember = userMap.get(a.userId);
              return {
                assignmentId: a.id,
                dealRole: a.dealRole,
                assignedAt: a.assignedAt,
                notes: a.notes,
                teamMember: teamMember ? {
                  id: teamMember.id,
                  name: teamMember.name,
                  email: teamMember.email,
                  phone: teamMember.phone || null,
                  title: teamMember.title || null,
                } : null,
              };
            });

            return JSON.stringify({
              success: true,
              count: formatted.length,
              teamMembers: formatted,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error fetching deal team: ${error}` });
          }
        },
        {
          name: 'get_deal_team',
          description: 'Get all team members assigned to a specific deal/property. Shows who is working on the deal and their roles. Use when the user asks who is on a deal or wants to see the deal team.',
          schema: z.object({
            propertyId: z.number().describe('The property/deal ID (numeric ID)'),
          }),
        }
      ),

      tool(
        async ({ teamMemberId, bio, expertise, title, phone }) => {
          try {
            const { MarketplaceUser } = await import('../models');
            const userId = self.getCurrentUserId();
            if (!userId) {
              return JSON.stringify({ success: false, error: 'Authentication required' });
            }

            const user = await MarketplaceUser.findByPk(userId);
            if (!user?.organizationId) {
              return JSON.stringify({ success: false, error: 'Organization context required' });
            }

            // Users can only update their own profile unless admin
            const isAdmin = user.role === 'admin' || user.role === 'super_admin';
            const targetId = teamMemberId || userId;

            if (!isAdmin && targetId !== userId) {
              return JSON.stringify({ success: false, error: 'You can only update your own profile' });
            }

            const targetUser = await MarketplaceUser.findOne({
              where: { id: targetId, organizationId: user.organizationId },
            });

            if (!targetUser) {
              return JSON.stringify({ success: false, error: 'Team member not found in your organization' });
            }

            const updates: any = {};
            if (bio !== undefined) updates.bio = bio;
            if (expertise !== undefined) updates.expertise = expertise;
            if (title !== undefined) updates.title = title;
            if (phone !== undefined) updates.phone = phone;

            await targetUser.update(updates);

            return JSON.stringify({
              success: true,
              message: `Profile updated for ${targetUser.name}`,
              profile: {
                id: targetUser.id,
                name: targetUser.name,
                email: targetUser.email,
                phone: targetUser.phone || null,
                title: targetUser.title || null,
                bio: targetUser.bio || null,
                expertise: targetUser.expertise || [],
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error updating profile: ${error}` });
          }
        },
        {
          name: 'update_team_member_profile',
          description: 'Update a team member profile (bio, expertise, title, phone). Users can update their own profile, admins can update any team member. Use when someone wants to update their profile information.',
          schema: z.object({
            teamMemberId: z.string().optional().describe('The team member ID to update (optional - defaults to current user)'),
            bio: z.string().optional().describe('Biography or about section'),
            expertise: z.array(z.string()).optional().describe('List of expertise areas (e.g., ["acquisitions", "underwriting", "closing"])'),
            title: z.string().optional().describe('Job title (e.g., "Acquisitions Manager")'),
            phone: z.string().optional().describe('Phone number'),
          }),
        }
      ),

      // ============================================================
      // CONTACT MANAGEMENT TOOLS
      // ============================================================
      tool(
        async ({ name, type, email, phone, company, role, notes }) => {
          try {
            // Get organization - try from current user first, then fall back to finding any org
            const { MarketplaceUser, Organization } = await import('../models');
            let organizationId: string | null = null;
            let createdById: string | null = null;

            // Try to get from authenticated user
            const userId = self.getCurrentUserId();
            if (userId) {
              const user = await MarketplaceUser.findByPk(userId);
              if (user?.organizationId) {
                organizationId = user.organizationId;
                createdById = userId;
              }
            }

            // Fall back to finding any organization if no user context
            if (!organizationId) {
              const org = await Organization.findOne({ where: { status: 'active' } });
              if (org) {
                organizationId = org.id;
              }
            }

            if (!organizationId) {
              return JSON.stringify({ success: false, error: 'No organization found. Please create an organization first.' });
            }

            // Check for existing contact by name (and phone/email if provided)
            const existingWhere: any = {
              organizationId,
              status: 'active',
              name: { [Op.iLike]: name.trim() },
            };

            // If phone or email provided, also match on those for more precise matching
            if (phone || email) {
              const orConditions: any[] = [{ name: { [Op.iLike]: name.trim() } }];
              if (phone) orConditions.push({ phone: phone.trim() });
              if (email) orConditions.push({ email: { [Op.iLike]: email.trim() } });
              existingWhere[Op.or] = orConditions;
              delete existingWhere.name;
            }

            const existingContact = await Contact.findOne({ where: existingWhere });

            if (existingContact) {
              // Update existing contact with any new info provided
              const updates: any = {};
              if (type && !existingContact.type) updates.type = type;
              if (email && !existingContact.email) updates.email = email.trim();
              if (phone && !existingContact.phone) updates.phone = phone.trim();
              if (company && !existingContact.company) updates.company = company.trim();
              if (role && !existingContact.role) updates.role = role.trim();
              if (notes) updates.notes = existingContact.notes ? `${existingContact.notes}\n${notes.trim()}` : notes.trim();

              if (Object.keys(updates).length > 0) {
                await existingContact.update(updates);
              }

              // Set contact context
              this.setContactContext(existingContact.id.toString(), existingContact.name, existingContact.type);

              return JSON.stringify({
                success: true,
                existing: true,
                contact: {
                  id: existingContact.id,
                  name: existingContact.name,
                  type: existingContact.type,
                  email: existingContact.email,
                  phone: existingContact.phone,
                  company: existingContact.company,
                },
                message: `Found existing contact "${existingContact.name}" and updated with new information.`,
                _contextAnnouncement: this.getContextChangeAnnouncement(),
              });
            }

            const contact = await Contact.create({
              organizationId,
              createdById,
              name: name.trim(),
              type: type || 'other',
              email: email?.trim() || null,
              phone: phone?.trim() || null,
              company: company?.trim() || null,
              role: role?.trim() || null,
              notes: notes?.trim() || null,
              status: 'active',
              tags: [],
            });

            // Set contact context
            this.setContactContext(contact.id.toString(), contact.name, contact.type);

            return JSON.stringify({
              success: true,
              existing: false,
              contact: {
                id: contact.id,
                name: contact.name,
                type: contact.type,
                email: contact.email,
                phone: contact.phone,
                company: contact.company,
              },
              message: `Contact "${name}" created successfully.`,
              _contextAnnouncement: this.getContextChangeAnnouncement(),
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error creating contact: ${error}` });
          }
        },
        {
          name: 'create_contact',
          description: 'Create a new contact or find an existing one. IMPORTANT: Extract phone numbers from input and put in phone field, NOT in name field. If type is not provided, ASK the user what type of contact this is.',
          schema: z.object({
            name: z.string().min(1).describe('ONLY the person name (e.g., "John Smith"), do NOT include phone numbers'),
            type: z.enum(['broker', 'buyer', 'seller', 'wholesaler', 'attorney', 're_agent', 'transaction_coordinator', 'title_company', 'team_member', 'other']).describe('Contact type - ASK USER if not provided'),
            email: z.string().optional().describe('Email address if provided'),
            phone: z.string().optional().describe('Phone number - extract numbers like "2013005189" from user input'),
            company: z.string().optional().describe('Company name if provided'),
            role: z.string().optional().describe('Specific role (e.g., "Listing Agent", "Seller Attorney")'),
            notes: z.string().optional().describe('Notes about the contact'),
          }),
        }
      ),

      // Convenience tool: create contact and attach to property in one step
      tool(
        async ({ name, phone, email, contactType, propertyAddress, role }) => {
          try {
            const { MarketplaceUser, Organization } = await import('../models');

            // Get organization
            let organizationId: string | null = null;
            let createdById: string | null = null;
            const userId = self.getCurrentUserId();
            if (userId) {
              const user = await MarketplaceUser.findByPk(userId);
              if (user?.organizationId) {
                organizationId = user.organizationId;
                createdById = userId;
              }
            }
            if (!organizationId) {
              const org = await Organization.findOne({ where: { status: 'active' } });
              if (org) organizationId = org.id;
            }
            if (!organizationId) {
              return JSON.stringify({ success: false, error: 'No organization found.' });
            }

            // Find the property by address (search in address.street JSON field)
            const property = await Property.findOne({
              where: Sequelize.where(
                Sequelize.fn('LOWER', Sequelize.cast(Sequelize.fn('jsonb_extract_path_text', Sequelize.col('address'), 'street'), 'text')),
                { [Op.like]: `%${propertyAddress.toLowerCase()}%` }
              ),
            });

            if (!property) {
              return JSON.stringify({ success: false, error: `Property at "${propertyAddress}" not found.` });
            }

            // Find or create the contact
            const existingContact = await Contact.findOne({
              where: {
                organizationId,
                status: 'active',
                [Op.or]: [
                  { name: { [Op.iLike]: name.trim() } },
                  ...(phone ? [{ phone: phone.trim() }] : []),
                  ...(email ? [{ email: { [Op.iLike]: email.trim() } }] : []),
                ],
              },
            });

            let contact;
            if (existingContact) {
              contact = existingContact;
              // Update with new info if provided
              const updates: any = {};
              if (contactType && !contact.type) updates.type = contactType;
              if (phone && !contact.phone) updates.phone = phone.trim();
              if (email && !contact.email) updates.email = email.trim();
              if (Object.keys(updates).length > 0) await contact.update(updates);
            } else {
              contact = await Contact.create({
                organizationId,
                createdById,
                name: name.trim(),
                type: contactType || 'other',
                phone: phone?.trim() || null,
                email: email?.trim() || null,
                status: 'active',
                tags: [],
              });
            }

            // Attach contact to property
            const existingLink = await PropertyContact.findOne({
              where: { propertyId: property.id, contactId: contact.id, role: role || contactType || 'other' },
            });

            if (!existingLink) {
              await PropertyContact.create({
                propertyId: property.id,
                contactId: contact.id,
                role: role || contactType || 'other',
                isPrimary: false,
              });
            }

            const propertyAddr = property.address?.street || 'unknown address';
            return JSON.stringify({
              success: true,
              message: `Contact "${contact.name}" ${existingContact ? 'found' : 'created'} and attached to property at ${propertyAddr} as ${role || contactType || 'contact'}.`,
              contact: { id: contact.id, name: contact.name, type: contact.type, phone: contact.phone },
              property: { id: property.id, address: propertyAddr },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error: ${error}` });
          }
        },
        {
          name: 'create_and_attach_contact',
          description: 'Create a new contact (or find existing) AND attach them to an EXISTING property by address. IMPORTANT: (1) Extract phone numbers from input and put in phone field, NOT in name. (2) If contactType is not provided, ASK the user.',
          schema: z.object({
            name: z.string().describe('ONLY the person name (e.g., "Daffy Duck"), do NOT include phone numbers'),
            phone: z.string().optional().describe('Phone number - extract numbers like "2013005189" from user input'),
            email: z.string().optional().describe('Email address if provided'),
            contactType: z.enum(['broker', 'buyer', 'seller', 'wholesaler', 'attorney', 're_agent', 'other']).describe('Type of contact - ASK USER if not provided'),
            propertyAddress: z.string().describe('Property address to attach the contact to'),
            role: z.enum(['agent', 'broker', 'seller', 'wholesaler', 'attorney', 'buyer', 'other']).optional().describe('Role for this property'),
          }),
        }
      ),

      // Create property WITH contact in one step
      tool(
        async ({ propertyStreet, propertyCity, propertyState, propertyZip, contactName, contactPhone, contactEmail, contactType }) => {
          try {
            const { MarketplaceUser, Organization } = await import('../models');

            // Get organization
            let organizationId: string | null = null;
            let createdById: string | null = null;
            const userId = self.getCurrentUserId();
            if (userId) {
              const user = await MarketplaceUser.findByPk(userId);
              if (user?.organizationId) {
                organizationId = user.organizationId;
                createdById = userId;
              }
            }
            if (!organizationId) {
              const org = await Organization.findOne({ where: { status: 'active' } });
              if (org) organizationId = org.id;
            }
            if (!organizationId) {
              return JSON.stringify({ success: false, error: 'No organization found.' });
            }

            // Create the property
            const property = await Property.create({
              address: {
                street: propertyStreet,
                city: propertyCity,
                state: propertyState.toUpperCase(),
                zip: propertyZip || '',
              },
              city: propertyCity,
              state: propertyState.toUpperCase(),
              status: 'new',
              source: 'agent-chat',
            } as any);

            // Create the contact
            const contact = await Contact.create({
              organizationId,
              createdById,
              name: contactName.trim(),
              type: contactType || 'other',
              phone: contactPhone?.trim() || null,
              email: contactEmail?.trim() || null,
              status: 'active',
              tags: [],
            });

            // Attach contact to property
            await PropertyContact.create({
              propertyId: property.id,
              contactId: contact.id,
              role: contactType || 'other',
              isPrimary: true,
            });

            // Set property context so user can reference "it" or "this deal"
            this.setPropertyContext(property.propertyId || property.id.toString(), propertyStreet, propertyCity, propertyState);

            return JSON.stringify({
              success: true,
              message: `Created property at ${propertyStreet}, ${propertyCity}, ${propertyState} with contact "${contactName}" (${contactType}) attached.`,
              property: { id: property.id, address: `${propertyStreet}, ${propertyCity}, ${propertyState}` },
              contact: { id: contact.id, name: contact.name, type: contact.type, phone: contact.phone },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error: ${error}` });
          }
        },
        {
          name: 'create_property_with_contact',
          description: 'Create a NEW property AND a contact attached to it in one step. Use when user says "create a new property at X with contact Y". IMPORTANT: (1) Extract phone numbers from the input and put them in contactPhone field, NOT in the name. (2) If contactType is not provided, ASK the user what type of contact this is before calling this tool.',
          schema: z.object({
            propertyStreet: z.string().describe('Street address of the property'),
            propertyCity: z.string().describe('City'),
            propertyState: z.string().describe('State (2-letter code like FL, NJ, TX)'),
            propertyZip: z.string().optional().describe('ZIP code'),
            contactName: z.string().describe('ONLY the person name (e.g., "John Smith"), do NOT include phone numbers in this field'),
            contactPhone: z.string().optional().describe('Phone number - extract any numbers like "2013005189" or "201-300-5189" from user input'),
            contactEmail: z.string().optional().describe('Email address if provided'),
            contactType: z.enum(['broker', 'buyer', 'seller', 'wholesaler', 'attorney', 're_agent', 'other']).describe('Type of contact - ASK USER if not provided'),
          }),
        }
      ),

      // Create property with MULTIPLE contacts
      tool(
        async ({ propertyStreet, propertyCity, propertyState, propertyZip, price, contacts }) => {
          try {
            const { MarketplaceUser, Organization } = await import('../models');
            const self = this;

            // Get organization and user context
            let organizationId: string | null = null;
            let createdById: string | null = null;

            const userId = self.getCurrentUserId();
            if (userId) {
              const user = await MarketplaceUser.findByPk(userId);
              if (user?.organizationId) {
                organizationId = user.organizationId;
                createdById = userId;
              }
            }

            if (!organizationId) {
              const org = await Organization.findOne({ where: { status: 'active' } });
              if (org) organizationId = org.id;
            }

            if (!organizationId) {
              return JSON.stringify({ success: false, error: 'No organization found. Please create an organization first.' });
            }

            // Step 1: Create the property
            const deal: any = {
              sourceId: 'agent-multi-contact',
              sourceName: 'AI Agent (Multi-Contact)',
              address: { street: propertyStreet, city: propertyCity, state: propertyState, zip: propertyZip },
              askingPrice: price,
              propertyType: 'Single Family',
              normalizedAt: new Date(),
              confidence: 1.0,
              rawData: {},
            };

            const result = await dealIntakeService.ingestDeal(deal, {
              enrichWithMarketData: true,
              queueProcessing: true,
            });

            if (!result.success || !result.propertyId) {
              return JSON.stringify({ success: false, error: result.error || 'Failed to create property' });
            }

            const property = await Property.findOne({ where: { propertyId: result.propertyId } });
            if (!property) {
              return JSON.stringify({ success: false, error: 'Property created but not found' });
            }

            // Set property context so user can reference "it" or "this deal"
            this.setPropertyContext(result.propertyId, propertyStreet, propertyCity, propertyState);

            // Step 2: Create and attach each contact
            const contactResults: any[] = [];
            for (const c of contacts) {
              try {
                // Find or create contact
                let contact = await Contact.findOne({
                  where: {
                    [Op.or]: [
                      { name: { [Op.iLike]: c.name } },
                      ...(c.phone ? [{ phone: c.phone }] : []),
                      ...(c.email ? [{ email: { [Op.iLike]: c.email } }] : []),
                    ],
                  },
                });

                if (!contact) {
                  contact = await Contact.create({
                    organizationId,
                    createdById,
                    name: c.name,
                    phone: c.phone || null,
                    email: c.email || null,
                    type: c.type,
                    status: 'active',
                    tags: [],
                  });
                }

                // Attach to property
                await PropertyContact.create({
                  propertyId: property.id,
                  contactId: contact.id,
                  role: c.role || c.type,
                  isPrimary: false,
                });

                contactResults.push({
                  success: true,
                  name: contact.name,
                  type: c.type,
                  role: c.role || c.type,
                  contactId: contact.id,
                });
              } catch (err) {
                contactResults.push({
                  success: false,
                  name: c.name,
                  error: String(err),
                });
              }
            }

            // Generate property card for display
            const p = property as any;
            const propertyCard = createPropertyCardMarker({
              id: property.id,
              propertyId: property.propertyId,
              address: propertyStreet,
              city: propertyCity,
              state: propertyState,
              zip: propertyZip,
              price: price,
              zestimate: p.zestimate,
              photoLinks: p.photoLinks,
              status: p.status,
            });

            // Build smart next steps based on what was created
            const nextSteps: string[] = [];
            nextSteps.push('Run compliance check to verify deal legitimacy');
            nextSteps.push('Score against buy boxes to find matching funds');
            if (!p.zestimate) {
              nextSteps.push('Zillow data not available - verify property details manually');
            }
            if (contactResults.some(c => !c.success)) {
              nextSteps.push('Some contacts failed to attach - review and retry');
            }

            return JSON.stringify({
              success: true,
              message: `Property created at ${propertyStreet}, ${propertyCity}, ${propertyState} with ${contactResults.filter(c => c.success).length} contacts attached.`,
              property: {
                id: property.id,
                propertyId: property.propertyId,
                address: `${propertyStreet}, ${propertyCity}, ${propertyState}`,
                enriched: !!p.zestimate,
                zestimate: p.zestimate,
                rentZestimate: p.rentZestimate,
                ownerName: p.ownerName,
                photoCount: p.photoLinks?.length || 0,
              },
              contacts: contactResults,
              propertyCard,
              pipeline: {
                stage: 'new',
                stageNumber: 1,
                totalStages: 7,
              },
              nextSteps,
              suggestedActions: [
                { action: 'run_compliance_check', description: 'Verify deal compliance' },
                { action: 'score_deal_against_buyboxes', description: 'Find matching funds' },
                { action: 'get_deal_intelligence', description: 'Get AI analysis & recommendations' },
              ],
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error: ${error}` });
          }
        },
        {
          name: 'create_property_with_contacts',
          description: 'Create a NEW property with MULTIPLE contacts attached. Use when user wants to add a property with 2+ contacts (e.g., "add property at X with attorney Y and buyer Z"). Auto-enriches with Zillow data.',
          schema: z.object({
            propertyStreet: z.string().describe('Street address'),
            propertyCity: z.string().describe('City'),
            propertyState: z.string().describe('State (2-letter code)'),
            propertyZip: z.string().optional().describe('ZIP code'),
            price: z.number().optional().describe('Asking price'),
            contacts: z.array(z.object({
              name: z.string().describe('Contact name (no phone numbers)'),
              phone: z.string().optional().describe('Phone number'),
              email: z.string().optional().describe('Email'),
              type: z.enum(['broker', 'buyer', 'seller', 'wholesaler', 'attorney', 're_agent', 'other']).describe('Contact type'),
              role: z.enum(['agent', 'broker', 'seller', 'wholesaler', 'attorney', 'buyer', 'other']).optional().describe('Role on this property'),
            })).describe('Array of contacts to attach'),
          }),
        }
      ),

      tool(
        async ({ query, type }) => {
          try {
            const where: any = { status: 'active' };

            if (type) {
              where.type = type;
            }

            if (query) {
              where[Op.or] = [
                { name: { [Op.iLike]: `%${query}%` } },
                { email: { [Op.iLike]: `%${query}%` } },
                { company: { [Op.iLike]: `%${query}%` } },
                { phone: { [Op.iLike]: `%${query}%` } },
              ];
            }

            const contacts = await Contact.findAll({
              where,
              limit: 20,
              order: [['name', 'ASC']],
            });

            if (contacts.length === 0) {
              return JSON.stringify({
                success: true,
                contacts: [],
                message: query ? `No contacts found matching "${query}".` : 'No contacts found.',
              });
            }

            // If exactly one contact found, set it as the current context
            if (contacts.length === 1) {
              const c = contacts[0];
              this.setContactContext(c.id.toString(), c.name, c.type);
            }

            return JSON.stringify({
              success: true,
              contacts: contacts.map(c => ({
                id: c.id,
                name: c.name,
                type: c.type,
                email: c.email,
                phone: c.phone,
                company: c.company,
                role: c.role,
              })),
              count: contacts.length,
              _contextAnnouncement: contacts.length === 1 ? this.getContextChangeAnnouncement() : null,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error searching contacts: ${error}` });
          }
        },
        {
          name: 'search_contacts',
          description: 'Search for existing contacts by name, email, company, or phone. Use this to find contacts before attaching them to properties.',
          schema: z.object({
            query: z.string().optional().describe('Search query (name, email, company, or phone)'),
            type: z.enum(['broker', 'buyer', 'seller', 'wholesaler', 'attorney', 're_agent', 'transaction_coordinator', 'title_company', 'team_member', 'other']).optional().describe('Filter by contact type'),
          }),
        }
      ),

      tool(
        async ({ propertyId, contactId, role, isPrimary, notes }) => {
          try {
            // Find the property
            const property = await Property.findOne({
              where: {
                [Op.or]: [
                  { propertyId },
                  { id: !isNaN(Number(propertyId)) ? Number(propertyId) : -1 },
                ],
              },
            });

            if (!property) {
              return JSON.stringify({ success: false, error: `Property ${propertyId} not found.` });
            }

            // Find the contact
            const contact = await Contact.findByPk(contactId);
            if (!contact) {
              return JSON.stringify({ success: false, error: `Contact ${contactId} not found.` });
            }

            // Check if already attached
            const existing = await PropertyContact.findOne({
              where: { propertyId: property.id, contactId, role },
            });

            if (existing) {
              return JSON.stringify({
                success: false,
                error: `Contact "${contact.name}" is already attached to this property as ${role}.`,
              });
            }

            // Create the link
            await PropertyContact.create({
              propertyId: property.id,
              contactId,
              role: role || 'other',
              isPrimary: isPrimary || false,
              notes: notes || null,
            });

            // Set contact context
            this.setContactContext(contact.id.toString(), contact.name, contact.type);

            return JSON.stringify({
              success: true,
              message: `Contact "${contact.name}" attached to property as ${role}.`,
              property: {
                id: property.id,
                propertyId: property.propertyId,
              },
              contact: {
                id: contact.id,
                name: contact.name,
                type: contact.type,
              },
              role,
              _contextAnnouncement: this.getContextChangeAnnouncement(),
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error attaching contact: ${error}` });
          }
        },
        {
          name: 'attach_contact_to_property',
          description: 'Attach an existing contact to a property with a specific role (seller, wholesaler, broker, etc.).',
          schema: z.object({
            propertyId: z.string().describe('The property ID to attach the contact to'),
            contactId: z.string().describe('The contact ID to attach'),
            role: z.enum(['agent', 'broker', 'seller', 'wholesaler', 'attorney', 're_agent', 'buyer', 'other']).describe('Role of this contact for this property'),
            isPrimary: z.boolean().optional().describe('Is this the primary contact for this role'),
            notes: z.string().optional().describe('Notes about this contact-property relationship'),
          }),
        }
      ),

      tool(
        async ({ propertyId }) => {
          try {
            // Find the property
            const property = await Property.findOne({
              where: {
                [Op.or]: [
                  { propertyId },
                  { id: !isNaN(Number(propertyId)) ? Number(propertyId) : -1 },
                ],
              },
            });

            if (!property) {
              return JSON.stringify({ success: false, error: `Property ${propertyId} not found.` });
            }

            // Get all contacts for this property
            const propertyContacts = await PropertyContact.findAll({
              where: { propertyId: property.id },
              include: [{ model: Contact, as: 'contact' }],
            });

            if (propertyContacts.length === 0) {
              return JSON.stringify({
                success: true,
                contacts: [],
                message: 'No contacts attached to this property.',
              });
            }

            return JSON.stringify({
              success: true,
              propertyId: property.propertyId,
              contacts: propertyContacts.map(pc => ({
                id: (pc as any).contact?.id,
                name: (pc as any).contact?.name,
                type: (pc as any).contact?.type,
                email: (pc as any).contact?.email,
                phone: (pc as any).contact?.phone,
                company: (pc as any).contact?.company,
                role: pc.role,
                isPrimary: pc.isPrimary,
                notes: pc.notes,
              })),
              count: propertyContacts.length,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: `Error getting property contacts: ${error}` });
          }
        },
        {
          name: 'get_property_contacts',
          description: 'Get all contacts attached to a property.',
          schema: z.object({
            propertyId: z.string().describe('The property ID to get contacts for'),
          }),
        }
      ),

      // ============================================================
      // BUY BOX CRUD TOOLS
      // ============================================================
      tool(
        async ({ buyBoxId }) => {
          try {
            const buyBox = await HedgeFundBuyBox.findByPk(buyBoxId);
            if (!buyBox) {
              // Try finding by name
              const byName = await HedgeFundBuyBox.findOne({
                where: { name: { [Op.iLike]: `%${buyBoxId}%` } },
              });

              if (!byName) {
                return `Buy box "${buyBoxId}" not found.`;
              }

              // Set buy box context
              this.setBuyBoxContext(byName.id, byName.name, byName.fundName);

              return JSON.stringify({
                id: byName.id,
                name: byName.name,
                description: byName.description,
                fundName: byName.fundName,
                contactEmail: byName.contactEmail,
                enabled: byName.enabled,
                priority: byName.priority,
                autoSubmit: byName.autoSubmit,
                autoSubmitThreshold: byName.autoSubmitThreshold,
                criteria: byName.criteria,
                scoringWeights: byName.scoringWeights,
                createdAt: byName.createdAt,
                updatedAt: byName.updatedAt,
                _contextAnnouncement: this.getContextChangeAnnouncement(),
              });
            }

            // Set buy box context
            this.setBuyBoxContext(buyBox.id, buyBox.name, buyBox.fundName);

            return JSON.stringify({
              id: buyBox.id,
              name: buyBox.name,
              description: buyBox.description,
              fundName: buyBox.fundName,
              contactEmail: buyBox.contactEmail,
              enabled: buyBox.enabled,
              priority: buyBox.priority,
              autoSubmit: buyBox.autoSubmit,
              autoSubmitThreshold: buyBox.autoSubmitThreshold,
              criteria: buyBox.criteria,
              scoringWeights: buyBox.scoringWeights,
              createdAt: buyBox.createdAt,
              updatedAt: buyBox.updatedAt,
              _contextAnnouncement: this.getContextChangeAnnouncement(),
            });
          } catch (error) {
            return `Error getting buy box details: ${error}`;
          }
        },
        {
          name: 'get_buybox_details',
          description: 'Get complete details of a specific buy box including all criteria and scoring weights.',
          schema: z.object({
            buyBoxId: z.string().describe('Buy box ID or name to look up'),
          }),
        }
      ),

      tool(
        async ({ buyBoxId, updates }) => {
          try {
            let buyBox = await HedgeFundBuyBox.findByPk(buyBoxId);

            // Try finding by name if not found by ID
            if (!buyBox) {
              buyBox = await HedgeFundBuyBox.findOne({
                where: { name: { [Op.iLike]: `%${buyBoxId}%` } },
              });
            }

            if (!buyBox) {
              return `Buy box "${buyBoxId}" not found.`;
            }

            // Build update object
            const updateData: any = {};

            // Simple fields
            if (updates.name !== undefined) updateData.name = updates.name;
            if (updates.description !== undefined) updateData.description = updates.description;
            if (updates.fundName !== undefined) updateData.fundName = updates.fundName;
            if (updates.contactEmail !== undefined) updateData.contactEmail = updates.contactEmail;
            if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
            if (updates.priority !== undefined) updateData.priority = updates.priority;
            if (updates.autoSubmit !== undefined) updateData.autoSubmit = updates.autoSubmit;
            if (updates.autoSubmitThreshold !== undefined) updateData.autoSubmitThreshold = updates.autoSubmitThreshold;

            // Merge criteria if provided
            if (updates.criteria) {
              updateData.criteria = { ...buyBox.criteria, ...updates.criteria };
            }

            if (Object.keys(updateData).length === 0) {
              return 'No updates provided.';
            }

            await buyBox.update(updateData);

            // Reload buy boxes in scoring engine
            await dealProcessingService.loadBuyBoxesFromDatabase();

            return JSON.stringify({
              success: true,
              buyBoxId: buyBox.id,
              name: buyBox.name,
              updated: Object.keys(updateData),
              message: `Updated buy box "${buyBox.name}"`,
            });
          } catch (error) {
            return `Error updating buy box: ${error}`;
          }
        },
        {
          name: 'update_buybox',
          description: 'Update a buy box criteria, contact info, or settings. Changes take effect immediately for scoring.',
          schema: z.object({
            buyBoxId: z.string().describe('Buy box ID or name to update'),
            updates: z.object({
              name: z.string().optional().describe('New name'),
              description: z.string().optional().describe('Description'),
              fundName: z.string().optional().describe('Fund name'),
              contactEmail: z.string().optional().describe('Contact email'),
              enabled: z.boolean().optional().describe('Enable/disable'),
              priority: z.number().optional().describe('Priority (1-100)'),
              autoSubmit: z.boolean().optional().describe('Enable auto-submit'),
              autoSubmitThreshold: z.number().optional().describe('Auto-submit score threshold'),
              criteria: z.object({
                states: z.array(z.string()).optional().describe('Target states'),
                counties: z.array(z.string()).optional().describe('Target counties'),
                minPrice: z.number().optional().describe('Minimum price'),
                maxPrice: z.number().optional().describe('Maximum price'),
                minBedrooms: z.number().optional().describe('Minimum bedrooms'),
                maxBedrooms: z.number().optional().describe('Maximum bedrooms'),
                minBathrooms: z.number().optional().describe('Minimum bathrooms'),
                minSqft: z.number().optional().describe('Minimum square footage'),
                maxSqft: z.number().optional().describe('Maximum square footage'),
                propertyTypes: z.array(z.string()).optional().describe('Allowed property types'),
                minYearBuilt: z.number().optional().describe('Minimum year built'),
                maxYearBuilt: z.number().optional().describe('Maximum year built'),
                minGarages: z.number().optional().describe('Minimum garages'),
                allowPool: z.boolean().optional().describe('Allow properties with pools'),
                allowSeptic: z.boolean().optional().describe('Allow septic systems'),
                allowSolarPanels: z.boolean().optional().describe('Allow solar panels'),
                allowCarport: z.boolean().optional().describe('Allow carports'),
                allowMainRoad: z.boolean().optional().describe('Allow main road locations'),
                allowFloodZone: z.boolean().optional().describe('Allow flood zones'),
                allowFireDamage: z.boolean().optional().describe('Allow fire damaged properties'),
                allowFoundationIssues: z.boolean().optional().describe('Allow foundation issues'),
                allowStructuralIssues: z.boolean().optional().describe('Allow structural issues'),
                allowAgeRestrictions: z.boolean().optional().describe('Allow age-restricted communities'),
                allowLeasingRestrictions: z.boolean().optional().describe('Allow leasing restrictions'),
                conditionLevels: z.array(z.string()).optional().describe('Allowed condition levels (light, medium, heavy)'),
                investmentStrategies: z.array(z.string()).optional().describe('Investment strategies (fix_flip, long_term_rental, etc.)'),
                minGrossYield: z.number().optional().describe('Minimum gross yield (e.g., 0.075 for 7.5%)'),
                minSchoolScore: z.number().optional().describe('Minimum school score (1-10)'),
                hardNos: z.string().optional().describe('Hard no criteria as text'),
              }).optional().describe('Criteria updates (merged with existing)'),
            }).describe('Fields to update'),
          }),
        }
      ),

      tool(
        async ({ buyBoxId, confirm }) => {
          try {
            if (!confirm) {
              return 'Deletion not confirmed. Set confirm=true to delete the buy box.';
            }

            let buyBox = await HedgeFundBuyBox.findByPk(buyBoxId);

            // Try finding by name if not found by ID
            if (!buyBox) {
              buyBox = await HedgeFundBuyBox.findOne({
                where: { name: { [Op.iLike]: `%${buyBoxId}%` } },
              });
            }

            if (!buyBox) {
              return `Buy box "${buyBoxId}" not found.`;
            }

            const name = buyBox.name;
            const id = buyBox.id;

            await buyBox.destroy();

            // Reload buy boxes in scoring engine
            await dealProcessingService.loadBuyBoxesFromDatabase();

            return JSON.stringify({
              success: true,
              deleted: {
                id,
                name,
              },
              message: `Buy box "${name}" has been deleted.`,
            });
          } catch (error) {
            return `Error deleting buy box: ${error}`;
          }
        },
        {
          name: 'delete_buybox',
          description: 'Permanently delete a buy box. Requires confirmation. Deals will no longer be scored against it.',
          schema: z.object({
            buyBoxId: z.string().describe('Buy box ID or name to delete'),
            confirm: z.boolean().describe('Must be true to confirm deletion'),
          }),
        }
      ),

      // ============================================================
      // QUICK UPDATE BUY BOX - Flat parameters for easy updates
      // ============================================================
      tool(
        async (params) => {
          try {
            const { buyBoxId, ...updates } = params;

            // Find the buy box
            let buyBox = await HedgeFundBuyBox.findByPk(buyBoxId);
            if (!buyBox) {
              buyBox = await HedgeFundBuyBox.findOne({
                where: { name: { [Op.iLike]: `%${buyBoxId}%` } },
              });
            }

            if (!buyBox) {
              return `Buy box "${buyBoxId}" not found. Use list_buyboxes to see available buy boxes.`;
            }

            const bb = buyBox as any;
            const changes: string[] = [];
            const existingCriteria = bb.criteria || {};

            // Build updates object
            const updateData: any = {};
            const criteriaUpdates: any = {};

            // Basic fields
            if (updates.name !== undefined) {
              updateData.name = updates.name;
              changes.push(`Name → ${updates.name}`);
            }
            if (updates.fundName !== undefined) {
              updateData.fundName = updates.fundName;
              changes.push(`Fund → ${updates.fundName}`);
            }
            if (updates.contactEmail !== undefined) {
              updateData.contactEmail = updates.contactEmail;
              changes.push(`Email → ${updates.contactEmail}`);
            }
            if (updates.enabled !== undefined) {
              updateData.enabled = updates.enabled;
              changes.push(`Status → ${updates.enabled ? 'enabled' : 'disabled'}`);
            }
            if (updates.priority !== undefined) {
              updateData.priority = updates.priority;
              changes.push(`Priority → ${updates.priority}`);
            }

            // Location criteria
            if (updates.addStates?.length) {
              const existing = existingCriteria.states || [];
              criteriaUpdates.states = [...new Set([...existing, ...updates.addStates])];
              changes.push(`Added states: ${updates.addStates.join(', ')}`);
            }
            if (updates.removeStates?.length) {
              const existing = existingCriteria.states || [];
              criteriaUpdates.states = existing.filter((s: string) => !updates.removeStates!.includes(s));
              changes.push(`Removed states: ${updates.removeStates.join(', ')}`);
            }
            if (updates.states !== undefined) {
              criteriaUpdates.states = updates.states;
              changes.push(`States → ${updates.states.join(', ') || 'Any'}`);
            }
            if (updates.counties !== undefined) {
              criteriaUpdates.counties = updates.counties;
              changes.push(`Counties → ${updates.counties.join(', ') || 'Any'}`);
            }

            // Price criteria
            if (updates.minPrice !== undefined) {
              criteriaUpdates.minPrice = updates.minPrice;
              changes.push(`Min price → $${updates.minPrice.toLocaleString()}`);
            }
            if (updates.maxPrice !== undefined) {
              criteriaUpdates.maxPrice = updates.maxPrice;
              changes.push(`Max price → $${updates.maxPrice.toLocaleString()}`);
            }

            // Property specs
            if (updates.minBedrooms !== undefined) {
              criteriaUpdates.minBedrooms = updates.minBedrooms;
              changes.push(`Min beds → ${updates.minBedrooms}`);
            }
            if (updates.maxBedrooms !== undefined) {
              criteriaUpdates.maxBedrooms = updates.maxBedrooms;
              changes.push(`Max beds → ${updates.maxBedrooms}`);
            }
            if (updates.minBathrooms !== undefined) {
              criteriaUpdates.minBathrooms = updates.minBathrooms;
              changes.push(`Min baths → ${updates.minBathrooms}`);
            }
            if (updates.minSqft !== undefined) {
              criteriaUpdates.minSqft = updates.minSqft;
              changes.push(`Min sqft → ${updates.minSqft.toLocaleString()}`);
            }
            if (updates.maxSqft !== undefined) {
              criteriaUpdates.maxSqft = updates.maxSqft;
              changes.push(`Max sqft → ${updates.maxSqft.toLocaleString()}`);
            }
            if (updates.minYearBuilt !== undefined) {
              criteriaUpdates.minYearBuilt = updates.minYearBuilt;
              changes.push(`Min year → ${updates.minYearBuilt}`);
            }
            if (updates.propertyTypes !== undefined) {
              criteriaUpdates.propertyTypes = updates.propertyTypes;
              changes.push(`Property types → ${updates.propertyTypes.join(', ')}`);
            }

            // Exclusion flags
            if (updates.allowFloodZone !== undefined) {
              criteriaUpdates.allowFloodZone = updates.allowFloodZone;
              changes.push(`Flood zones → ${updates.allowFloodZone ? 'allowed' : 'excluded'}`);
            }
            if (updates.allowPool !== undefined) {
              criteriaUpdates.allowPool = updates.allowPool;
              changes.push(`Pools → ${updates.allowPool ? 'allowed' : 'excluded'}`);
            }
            if (updates.allowSeptic !== undefined) {
              criteriaUpdates.allowSeptic = updates.allowSeptic;
              changes.push(`Septic → ${updates.allowSeptic ? 'allowed' : 'excluded'}`);
            }
            if (updates.allowFoundationIssues !== undefined) {
              criteriaUpdates.allowFoundationIssues = updates.allowFoundationIssues;
              changes.push(`Foundation issues → ${updates.allowFoundationIssues ? 'allowed' : 'excluded'}`);
            }
            if (updates.allowFireDamage !== undefined) {
              criteriaUpdates.allowFireDamage = updates.allowFireDamage;
              changes.push(`Fire damage → ${updates.allowFireDamage ? 'allowed' : 'excluded'}`);
            }

            // Strategy
            if (updates.investmentStrategies !== undefined) {
              criteriaUpdates.investmentStrategies = updates.investmentStrategies;
              changes.push(`Strategies → ${updates.investmentStrategies.join(', ')}`);
            }
            if (updates.conditionLevels !== undefined) {
              criteriaUpdates.conditionLevels = updates.conditionLevels;
              changes.push(`Conditions → ${updates.conditionLevels.join(', ')}`);
            }

            // Yield
            if (updates.minGrossYield !== undefined) {
              criteriaUpdates.minGrossYield = updates.minGrossYield;
              changes.push(`Min yield → ${(updates.minGrossYield * 100).toFixed(1)}%`);
            }

            // Hard nos
            if (updates.hardNos !== undefined) {
              criteriaUpdates.hardNos = updates.hardNos;
              changes.push(`Hard nos → ${updates.hardNos}`);
            }

            // Auto-submit
            if (updates.autoSubmitThreshold !== undefined) {
              updateData.autoSubmitEnabled = updates.autoSubmitThreshold > 0;
              updateData.autoSubmitThreshold = updates.autoSubmitThreshold;
              changes.push(`Auto-submit → ${updates.autoSubmitThreshold > 0 ? `enabled at ${updates.autoSubmitThreshold}%` : 'disabled'}`);
            }

            if (changes.length === 0) {
              return 'No changes specified. Provide at least one field to update.';
            }

            // Merge criteria updates
            if (Object.keys(criteriaUpdates).length > 0) {
              updateData.criteria = { ...existingCriteria, ...criteriaUpdates };
            }

            // Apply updates
            await buyBox.update(updateData);

            // Reload buy boxes in scoring engine
            await dealProcessingService.loadBuyBoxesFromDatabase();

            // Set context
            this.setBuyBoxContext(bb.id, updateData.name || bb.name, updateData.fundName || bb.fundName);

            return JSON.stringify({
              success: true,
              buyBox: {
                id: bb.id,
                name: updateData.name || bb.name,
              },
              changes,
              message: `Updated ${changes.length} field(s). Changes take effect immediately.`,
            });
          } catch (error) {
            return `Error updating buy box: ${error}`;
          }
        },
        {
          name: 'quick_update_buybox',
          description: 'Quickly update a buy box with flat parameters. Use this for simple updates like changing price limits, adding states, or toggling features. Changes take effect immediately.',
          schema: z.object({
            buyBoxId: z.string().describe('Buy box ID or name to update'),

            // Basic info
            name: z.string().optional().describe('New name'),
            fundName: z.string().optional().describe('New fund name'),
            contactEmail: z.string().optional().describe('New contact email'),
            enabled: z.boolean().optional().describe('Enable or disable'),
            priority: z.number().optional().describe('Priority (1-100)'),

            // State management (add/remove helpers)
            addStates: z.array(z.string()).optional().describe('Add these states to existing list'),
            removeStates: z.array(z.string()).optional().describe('Remove these states from list'),
            states: z.array(z.string()).optional().describe('Replace all states with this list'),
            counties: z.array(z.string()).optional().describe('Set target counties'),

            // Price
            minPrice: z.number().optional().describe('Set minimum price'),
            maxPrice: z.number().optional().describe('Set maximum price'),

            // Property specs
            minBedrooms: z.number().optional().describe('Set minimum bedrooms'),
            maxBedrooms: z.number().optional().describe('Set maximum bedrooms'),
            minBathrooms: z.number().optional().describe('Set minimum bathrooms'),
            minSqft: z.number().optional().describe('Set minimum sqft'),
            maxSqft: z.number().optional().describe('Set maximum sqft'),
            minYearBuilt: z.number().optional().describe('Set minimum year built'),
            propertyTypes: z.array(z.string()).optional().describe('Set allowed property types'),

            // Exclusion flags
            allowFloodZone: z.boolean().optional().describe('Allow/exclude flood zones'),
            allowPool: z.boolean().optional().describe('Allow/exclude pools'),
            allowSeptic: z.boolean().optional().describe('Allow/exclude septic'),
            allowFoundationIssues: z.boolean().optional().describe('Allow/exclude foundation issues'),
            allowFireDamage: z.boolean().optional().describe('Allow/exclude fire damage'),

            // Strategy
            investmentStrategies: z.array(z.string()).optional().describe('Set investment strategies'),
            conditionLevels: z.array(z.string()).optional().describe('Set allowed conditions'),

            // Yield
            minGrossYield: z.number().optional().describe('Set minimum gross yield (e.g., 0.08 for 8%)'),

            // Hard nos
            hardNos: z.string().optional().describe('Set hard no criteria text'),

            // Auto-submit
            autoSubmitThreshold: z.number().optional().describe('Set auto-submit threshold (0 to disable)'),
          }),
        }
      ),

      // ============================================================
      // CLONE BUY BOX - Duplicate with modifications
      // ============================================================
      tool(
        async ({ sourceBuyBoxId, newName, modifications }) => {
          try {
            // Find source buy box
            let source = await HedgeFundBuyBox.findByPk(sourceBuyBoxId);
            if (!source) {
              source = await HedgeFundBuyBox.findOne({
                where: { name: { [Op.iLike]: `%${sourceBuyBoxId}%` } },
              });
            }

            if (!source) {
              return `Buy box "${sourceBuyBoxId}" not found. Use list_buyboxes to see available buy boxes.`;
            }

            const s = source as any;

            // Build new buy box data
            const newBuyBoxData: any = {
              name: newName,
              description: modifications?.description || s.description || '',
              fundName: modifications?.fundName || s.fundName,
              contactEmail: modifications?.contactEmail || s.contactEmail,
              enabled: true,
              priority: modifications?.priority || s.priority || 1,
              autoSubmitEnabled: s.autoSubmitEnabled,
              autoSubmitThreshold: modifications?.autoSubmitThreshold || s.autoSubmitThreshold || 80,
              weights: { ...s.weights },
            };

            // Clone and merge criteria
            const baseCriteria = { ...s.criteria };
            if (modifications) {
              // Location
              if (modifications.states !== undefined) baseCriteria.states = modifications.states;
              if (modifications.counties !== undefined) baseCriteria.counties = modifications.counties;
              // Price
              if (modifications.minPrice !== undefined) baseCriteria.minPrice = modifications.minPrice;
              if (modifications.maxPrice !== undefined) baseCriteria.maxPrice = modifications.maxPrice;
              // Specs
              if (modifications.minBedrooms !== undefined) baseCriteria.minBedrooms = modifications.minBedrooms;
              if (modifications.maxBedrooms !== undefined) baseCriteria.maxBedrooms = modifications.maxBedrooms;
              if (modifications.minBathrooms !== undefined) baseCriteria.minBathrooms = modifications.minBathrooms;
              if (modifications.minSqft !== undefined) baseCriteria.minSqft = modifications.minSqft;
              if (modifications.maxSqft !== undefined) baseCriteria.maxSqft = modifications.maxSqft;
              if (modifications.minYearBuilt !== undefined) baseCriteria.minYearBuilt = modifications.minYearBuilt;
              if (modifications.propertyTypes !== undefined) baseCriteria.propertyTypes = modifications.propertyTypes;
              // Exclusions
              if (modifications.allowFloodZone !== undefined) baseCriteria.allowFloodZone = modifications.allowFloodZone;
              if (modifications.allowPool !== undefined) baseCriteria.allowPool = modifications.allowPool;
              if (modifications.allowSeptic !== undefined) baseCriteria.allowSeptic = modifications.allowSeptic;
              if (modifications.allowFoundationIssues !== undefined) baseCriteria.allowFoundationIssues = modifications.allowFoundationIssues;
              if (modifications.allowFireDamage !== undefined) baseCriteria.allowFireDamage = modifications.allowFireDamage;
              // Strategy
              if (modifications.investmentStrategies !== undefined) baseCriteria.investmentStrategies = modifications.investmentStrategies;
              if (modifications.conditionLevels !== undefined) baseCriteria.conditionLevels = modifications.conditionLevels;
              if (modifications.minGrossYield !== undefined) baseCriteria.minGrossYield = modifications.minGrossYield;
              if (modifications.hardNos !== undefined) baseCriteria.hardNos = modifications.hardNos;
            }
            newBuyBoxData.criteria = baseCriteria;

            // Create the clone
            const created = await HedgeFundBuyBox.create(newBuyBoxData);

            // Reload buy boxes
            await dealProcessingService.loadBuyBoxesFromDatabase();

            // Set context
            this.setBuyBoxContext((created as any).id, newName, newBuyBoxData.fundName);

            // Build differences summary
            const differences: string[] = [];
            if (modifications) {
              if (modifications.states) differences.push(`States: ${modifications.states.join(', ')}`);
              if (modifications.minPrice || modifications.maxPrice) {
                differences.push(`Price: $${(modifications.minPrice || baseCriteria.minPrice || 0).toLocaleString()} - $${(modifications.maxPrice || baseCriteria.maxPrice || 0).toLocaleString()}`);
              }
              if (modifications.fundName) differences.push(`Fund: ${modifications.fundName}`);
            }

            return JSON.stringify({
              success: true,
              original: {
                id: s.id,
                name: s.name,
              },
              clone: {
                id: (created as any).id,
                name: newName,
                fundName: newBuyBoxData.fundName,
              },
              differences: differences.length > 0 ? differences : ['Exact copy'],
              message: `Cloned "${s.name}" as "${newName}". The new buy box is active and ready for scoring.`,
            });
          } catch (error) {
            return `Error cloning buy box: ${error}`;
          }
        },
        {
          name: 'clone_buybox',
          description: 'Clone an existing buy box with optional modifications. Great for creating variations like "Texas version" or "higher price tier" of an existing buy box.',
          schema: z.object({
            sourceBuyBoxId: z.string().describe('Buy box ID or name to clone'),
            newName: z.string().describe('Name for the new buy box'),
            modifications: z.object({
              fundName: z.string().optional().describe('Override fund name'),
              contactEmail: z.string().optional().describe('Override contact email'),
              description: z.string().optional().describe('Override description'),
              priority: z.number().optional().describe('Override priority'),
              states: z.array(z.string()).optional().describe('Override states'),
              counties: z.array(z.string()).optional().describe('Override counties'),
              minPrice: z.number().optional().describe('Override min price'),
              maxPrice: z.number().optional().describe('Override max price'),
              minBedrooms: z.number().optional().describe('Override min bedrooms'),
              maxBedrooms: z.number().optional().describe('Override max bedrooms'),
              minBathrooms: z.number().optional().describe('Override min bathrooms'),
              minSqft: z.number().optional().describe('Override min sqft'),
              maxSqft: z.number().optional().describe('Override max sqft'),
              minYearBuilt: z.number().optional().describe('Override min year built'),
              propertyTypes: z.array(z.string()).optional().describe('Override property types'),
              allowFloodZone: z.boolean().optional().describe('Override flood zone setting'),
              allowPool: z.boolean().optional().describe('Override pool setting'),
              allowSeptic: z.boolean().optional().describe('Override septic setting'),
              allowFoundationIssues: z.boolean().optional().describe('Override foundation issues setting'),
              allowFireDamage: z.boolean().optional().describe('Override fire damage setting'),
              investmentStrategies: z.array(z.string()).optional().describe('Override investment strategies'),
              conditionLevels: z.array(z.string()).optional().describe('Override condition levels'),
              minGrossYield: z.number().optional().describe('Override min gross yield'),
              hardNos: z.string().optional().describe('Override hard nos'),
              autoSubmitThreshold: z.number().optional().describe('Override auto-submit threshold'),
            }).optional().describe('Fields to modify from the original'),
          }),
        }
      ),

      // ============================================================
      // COMPOUND WORKFLOW TOOLS
      // These tools chain multiple operations for common workflows
      // ============================================================

      tool(
        async ({ address, city, state, zip, mlsListingPrice, arv, rehabCost, propertyType, bedroomCount, bathroomCount, sqft, autoSubmitToFunds }) => {
          const steps: { step: string; status: 'success' | 'failed' | 'skipped'; details?: any; error?: string }[] = [];

          try {
            // Step 1: Create the property via intake pipeline
            let propertyId: string;
            let deal: any;
            try {
              deal = {
                sourceId: 'agent-workflow',
                sourceName: 'AI Agent Workflow',
                address: { street: address, city, state, zip },
                askingPrice: mlsListingPrice,
                bedrooms: bedroomCount,
                bathrooms: bathroomCount,
                sqft,
                propertyType: propertyType || 'Single Family',
                arv,
                repairEstimate: rehabCost,
                normalizedAt: new Date(),
                confidence: 1.0,
                rawData: {},
              };

              const result = await dealIntakeService.ingestDeal(deal, {
                enrichWithMarketData: true,  // Auto-enrich with Zillow data
                queueProcessing: true,
              });
              if (!result.success || !result.propertyId) {
                throw new Error(result.error || 'Failed to create property');
              }
              propertyId = result.propertyId;
              steps.push({ step: 'create_property', status: 'success', details: { propertyId, action: result.action } });
            } catch (error) {
              steps.push({ step: 'create_property', status: 'failed', error: String(error) });
              return JSON.stringify({ success: false, steps, error: 'Failed to create property' });
            }

            // Step 2: Report on market data enrichment (already happened in ingestDeal)
            try {
              const property = await Property.findOne({ where: { propertyId } });
              if (property) {
                const p = property as any;
                const enrichmentData = {
                  zestimate: p.zestimate,
                  rentZestimate: p.rentZestimate,
                  ownerName: p.ownerName,
                  yearBuilt: p.yearBuilt,
                  photoCount: p.photoLinks?.length || 0,
                };
                const wasEnriched = enrichmentData.zestimate || enrichmentData.ownerName || enrichmentData.photoCount > 0;
                steps.push({
                  step: 'enrich_market_data',
                  status: wasEnriched ? 'success' : 'skipped',
                  details: wasEnriched ? enrichmentData : { reason: 'No market data available for this address' },
                });
              }
            } catch (error) {
              steps.push({ step: 'enrich_market_data', status: 'failed', error: String(error) });
            }

            // Step 3: Analyze the deal
            let analysis: any = null;
            try {
              const property = await Property.findOne({ where: { propertyId } });
              if (property) {
                const p = property as any;
                const purchasePrice = p.mlsListingPrice || p.buyItNowPrice || 0;
                const arvValue = p.arv || 0;
                const rehabValue = p.rehabCost || 0;

                // Calculate key metrics
                const mao = arvValue * 0.7 - rehabValue; // 70% rule
                const potentialProfit = arvValue - purchasePrice - rehabValue;
                const roi = purchasePrice > 0 ? (potentialProfit / purchasePrice) * 100 : 0;
                const dealScore = mao > purchasePrice ? Math.min(100, 50 + (mao - purchasePrice) / 1000) : Math.max(0, 50 - (purchasePrice - mao) / 1000);

                analysis = {
                  purchasePrice,
                  arv: arvValue,
                  rehabCost: rehabValue,
                  mao: Math.round(mao),
                  potentialProfit: Math.round(potentialProfit),
                  roi: Math.round(roi * 10) / 10,
                  dealScore: Math.round(dealScore),
                  recommendation: mao > purchasePrice ? 'Good deal - under MAO' : 'Caution - above MAO',
                };
                steps.push({ step: 'analyze_deal', status: 'success', details: analysis });
              }
            } catch (error) {
              steps.push({ step: 'analyze_deal', status: 'failed', error: String(error) });
            }

            // Step 4: Score against buy boxes
            let matchingFunds: any[] = [];
            try {
              const scores = await dealProcessingService.scoreDeal(deal);
              matchingFunds = scores.filter((s: any) => s.percentage >= 70);
              steps.push({
                step: 'score_buyboxes',
                status: 'success',
                details: {
                  totalBuyBoxes: scores.length,
                  matchingFunds: matchingFunds.length,
                  topMatches: matchingFunds.slice(0, 3).map((m: any) => ({ name: m.buyBoxName, score: m.percentage })),
                },
              });
            } catch (error) {
              steps.push({ step: 'score_buyboxes', status: 'failed', error: String(error) });
            }

            // Step 5: Optionally send to matching funds
            if (autoSubmitToFunds && matchingFunds.length > 0) {
              try {
                const property = await Property.findOne({ where: { propertyId } });
                if (property) {
                  const p = property as any;
                  const addressStr = `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state}`.trim();
                  const sentTo: string[] = [];

                  // Batch fetch buy boxes to avoid N+1 queries
                  const topMatches = matchingFunds.slice(0, 3);
                  const buyBoxIds = extractIds(topMatches, 'buyBoxId');
                  const buyBoxMap = await batchFetchBuyBoxes(buyBoxIds);

                  for (const match of topMatches) {
                    if (match.buyBoxId) {
                      const buyBox = buyBoxMap.get(match.buyBoxId);
                      if (buyBox && buyBox.contactEmail && buyBox.fundName) {
                        // Note: In real implementation, this would send an email
                        sentTo.push(buyBox.fundName);
                      }
                    }
                  }

                  steps.push({
                    step: 'send_to_funds',
                    status: 'success',
                    details: { sentTo, count: sentTo.length },
                  });
                }
              } catch (error) {
                steps.push({ step: 'send_to_funds', status: 'failed', error: String(error) });
              }
            } else if (autoSubmitToFunds) {
              steps.push({ step: 'send_to_funds', status: 'skipped', details: { reason: 'No matching funds found' } });
            }

            // Build summary
            const successCount = steps.filter((s) => s.status === 'success').length;
            const summary = {
              success: true,
              propertyId,
              stepsCompleted: `${successCount}/${steps.length}`,
              analysis,
              matchingFunds: matchingFunds.length,
              steps,
            };

            return JSON.stringify(summary, null, 2);
          } catch (error) {
            return JSON.stringify({ success: false, steps, error: String(error) });
          }
        },
        {
          name: 'process_new_deal',
          description: `Complete end-to-end deal processing pipeline. Chains together: create property → enrich with market data → analyze deal → score against buy boxes → optionally send to matching funds. Use this for processing new deals quickly.`,
          schema: z.object({
            address: z.string().describe('Street address (e.g., "123 Main St")'),
            city: z.string().describe('City name'),
            state: z.string().describe('State code (e.g., TX, FL)'),
            zip: z.string().describe('ZIP code'),
            mlsListingPrice: z.number().describe('Asking price or purchase price'),
            arv: z.number().optional().describe('After Repair Value (if known, otherwise will be looked up)'),
            rehabCost: z.number().optional().describe('Estimated rehab cost'),
            propertyType: z.string().optional().describe('Property type (Single Family, Condo, etc.)'),
            bedroomCount: z.number().optional().describe('Number of bedrooms'),
            bathroomCount: z.number().optional().describe('Number of bathrooms'),
            sqft: z.number().optional().describe('Square footage'),
            autoSubmitToFunds: z.boolean().optional().default(false).describe('Automatically send to matching funds (score >= 70)'),
          }),
        }
      ),

      tool(
        async ({ propertyId, sendToTopFunds }) => {
          const results: { step: string; status: 'success' | 'failed'; details?: any; error?: string }[] = [];

          try {
            // Get property
            const property = await Property.findOne({ where: { propertyId } });
            if (!property) {
              return JSON.stringify({ success: false, error: `Property ${propertyId} not found` });
            }

            const p = property as any;
            const addressStr = `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim();

            // Step 1: Get market valuation
            let marketData: any = null;
            try {
              const marketDataService = MarketDataService.getInstance();
              const result = await marketDataService.getFullPropertyLookup(
                { address: addressStr, city: p.city, state: p.state, zip: p.zip },
                { includeImages: false, includePriceHistory: false, includeTaxHistory: false, includeComparables: true }
              );
              if (result?.property) {
                marketData = result.property;
                results.push({
                  step: 'market_valuation',
                  status: 'success',
                  details: {
                    zestimate: marketData.zestimate,
                    rentEstimate: marketData.rentZestimate,
                    comparables: (result.comparables as any)?.homes?.length || 0,
                  },
                });
              } else {
                results.push({ step: 'market_valuation', status: 'failed', error: 'No data available' });
              }
            } catch (error) {
              results.push({ step: 'market_valuation', status: 'failed', error: String(error) });
            }

            // Step 2: Analyze deal
            const purchasePrice = p.mlsListingPrice || p.buyItNowPrice || 0;
            const arvValue = marketData?.zestimate || p.arv || 0;
            const rehabValue = p.rehabCost || 0;

            const mao = arvValue * 0.7 - rehabValue;
            const potentialProfit = arvValue - purchasePrice - rehabValue;
            const roi = purchasePrice > 0 ? (potentialProfit / purchasePrice) * 100 : 0;
            const cashOnCash = purchasePrice > 0 && marketData?.rentZestimate
              ? ((marketData.rentZestimate * 12 * 0.7) / (purchasePrice * 0.25)) * 100  // 25% down, 70% net
              : null;

            const analysis = {
              address: addressStr,
              purchasePrice,
              arv: arvValue,
              rehabCost: rehabValue,
              mao: Math.round(mao),
              potentialProfit: Math.round(potentialProfit),
              roi: `${Math.round(roi)}%`,
              cashOnCash: cashOnCash ? `${Math.round(cashOnCash)}%` : 'N/A',
              verdict: mao > purchasePrice ? '✓ GOOD DEAL' : '✗ OVERPRICED',
              margin: Math.round(mao - purchasePrice),
            };
            results.push({ step: 'deal_analysis', status: 'success', details: analysis });

            // Step 3: Score against all buy boxes
            let matchingFunds: any[] = [];
            try {
              // Build deal object from property for scoring
              const dealForScoring = {
                sourceId: 'quick-assessment',
                sourceName: 'Quick Deal Assessment',
                address: { street: addressStr, city: p.city, state: p.state, zip: p.zip },
                askingPrice: purchasePrice,
                bedrooms: p.bedroomCount,
                bathrooms: p.bathroomCount,
                sqft: p.livingSpaceSqFt,
                propertyType: p.propertyType,
                arv: arvValue,
                repairEstimate: rehabValue,
                normalizedAt: new Date(),
                confidence: 1.0,
                rawData: {},
              };
              const scores = await dealProcessingService.scoreDeal(dealForScoring);
              matchingFunds = scores
                .filter((s: any) => s.percentage >= 60)
                .sort((a: any, b: any) => b.percentage - a.percentage);

              results.push({
                step: 'buybox_scoring',
                status: 'success',
                details: {
                  totalScored: scores.length,
                  matches: matchingFunds.map((m: any) => ({
                    fund: m.buyBoxName,
                    score: m.percentage,
                    status: m.percentage >= 80 ? 'Strong Match' : m.percentage >= 70 ? 'Good Match' : 'Potential',
                  })),
                },
              });
            } catch (error) {
              results.push({ step: 'buybox_scoring', status: 'failed', error: String(error) });
            }

            // Step 4: Send to top funds if requested
            if (sendToTopFunds && matchingFunds.length > 0) {
              const topFunds = matchingFunds.filter((m: any) => m.percentage >= 70).slice(0, 3);
              const sentTo: string[] = [];

              // Batch fetch buy boxes to avoid N+1 queries
              const buyBoxIds = extractIds(topFunds, 'buyBoxId');
              const buyBoxMap = await batchFetchBuyBoxes(buyBoxIds);

              for (const match of topFunds) {
                if (match.buyBoxId) {
                  const buyBox = buyBoxMap.get(match.buyBoxId);
                  if (buyBox && buyBox.contactEmail && buyBox.fundName) {
                    sentTo.push(buyBox.fundName);
                  }
                }
              }

              results.push({
                step: 'send_to_funds',
                status: 'success',
                details: { fundsNotified: sentTo },
              });
            }

            return JSON.stringify({
              success: true,
              propertyId,
              summary: analysis,
              matchingFunds: matchingFunds.length,
              results,
            }, null, 2);
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error), results });
          }
        },
        {
          name: 'quick_deal_assessment',
          description: 'Quick comprehensive assessment of an existing property. Gets market valuation, calculates deal metrics (ROI, MAO, profit), scores against all buy boxes, and optionally sends to matching funds. Perfect for rapid deal evaluation.',
          schema: z.object({
            propertyId: z.string().describe('Property ID to assess'),
            sendToTopFunds: z.boolean().optional().default(false).describe('Send to funds with score >= 70'),
          }),
        }
      ),

      tool(
        async ({ propertyIds, action, fundId }) => {
          if (propertyIds.length > 10) {
            return JSON.stringify({ success: false, error: 'Maximum 10 properties per batch' });
          }

          const results: { propertyId: string; status: 'success' | 'failed'; details?: any; error?: string }[] = [];

          // Batch fetch all properties upfront to avoid N+1 queries
          const propertyMap = await batchFetchProperties(propertyIds);

          for (const propertyId of propertyIds) {
            try {
              const property = propertyMap.get(propertyId);
              if (!property) {
                results.push({ propertyId, status: 'failed', error: 'Not found' });
                continue;
              }

              switch (action) {
                case 'score':
                  // Convert property to NormalizedDeal format for scoring
                  const propData = property as any;
                  const streetAddress = typeof propData.address === 'object'
                    ? `${propData.address?.houseNumber || ''} ${propData.address?.street || ''}`.trim()
                    : propData.address || '';
                  const normalizedDeal = {
                    sourceId: propertyId,
                    sourceName: 'database',
                    address: {
                      street: streetAddress,
                      city: propData.city || '',
                      state: propData.state || '',
                      zip: propData.zip || '',
                    },
                    askingPrice: propData.purchaseContractPrice || propData.reservePrice || 0,
                    arv: propData.arv || 0,
                    bedrooms: propData.bedroomCount || 0,
                    bathrooms: propData.bathroomCount || 0,
                    sqft: propData.livingSpaceSqFt || 0,
                    propertyType: propData.propertyType || 'SFR',
                    normalizedAt: new Date(),
                    confidence: 1.0,
                    rawData: propData,
                  };
                  const scores = await dealProcessingService.scoreDeal(normalizedDeal as any);
                  const topScore = scores.length > 0 ? Math.max(...scores.map((s: any) => s.percentage)) : 0;
                  results.push({
                    propertyId,
                    status: 'success',
                    details: { topScore, matchCount: scores.filter((s: any) => s.percentage >= 70).length },
                  });
                  break;

                case 'enrich':
                  const p = property as any;
                  const addr = `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim();
                  const mdService = MarketDataService.getInstance();
                  const lookupResult = await mdService.getFullPropertyLookup(
                    { address: addr, city: p.city, state: p.state, zip: p.zip },
                    { includeImages: false, includePriceHistory: false, includeTaxHistory: false, includeComparables: false }
                  );
                  if (lookupResult?.property?.zestimate) {
                    await property.update({ arv: lookupResult.property.zestimate });
                    results.push({ propertyId, status: 'success', details: { arv: lookupResult.property.zestimate } });
                  } else {
                    results.push({ propertyId, status: 'failed', error: 'No market data' });
                  }
                  break;

                case 'send_to_fund':
                  if (!fundId) {
                    results.push({ propertyId, status: 'failed', error: 'fundId required' });
                  } else {
                    const buyBox = await HedgeFundBuyBox.findByPk(fundId);
                    if (buyBox && buyBox.contactEmail) {
                      results.push({ propertyId, status: 'success', details: { sentTo: buyBox.fundName } });
                    } else {
                      results.push({ propertyId, status: 'failed', error: 'Fund not found or no email' });
                    }
                  }
                  break;

                default:
                  results.push({ propertyId, status: 'failed', error: `Unknown action: ${action}` });
              }
            } catch (error) {
              results.push({ propertyId, status: 'failed', error: String(error) });
            }
          }

          const successCount = results.filter((r) => r.status === 'success').length;
          return JSON.stringify({
            success: true,
            processed: results.length,
            successful: successCount,
            failed: results.length - successCount,
            results,
          }, null, 2);
        },
        {
          name: 'batch_process_deals',
          description: 'Process multiple properties in batch. Supports actions: "score" (score against buy boxes), "enrich" (get market data), "send_to_fund" (send to specific fund). Max 10 properties per batch.',
          schema: z.object({
            propertyIds: z.array(z.string()).describe('Array of property IDs to process'),
            action: z.enum(['score', 'enrich', 'send_to_fund']).describe('Action to perform on each property'),
            fundId: z.string().optional().describe('Fund ID (required for send_to_fund action)'),
          }),
        }
      ),

      // =============================================================================
      // MEMORY MANAGEMENT TOOLS
      // =============================================================================

      // Remember a user preference
      tool(
        async ({ userId, preference, importance }) => {
          if (!memoryService.isReady()) {
            return { success: false, error: 'Memory service not available' };
          }

          try {
            const memoryId = await memoryService.storePreference(userId, preference, importance);
            return {
              success: true,
              message: `Remembered: "${preference}"`,
              memoryId,
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        {
          name: 'remember_preference',
          description: 'Store a user preference or important information to remember for future conversations. Use this when the user explicitly asks to remember something or states a clear preference.',
          schema: z.object({
            userId: z.string().describe('The user ID'),
            preference: z.string().describe('The preference or information to remember'),
            importance: z.number().min(1).max(10).optional().default(7).describe('Importance level 1-10'),
          }),
        }
      ),

      // Search user memories
      tool(
        async ({ userId, query, types }) => {
          if (!memoryService.isReady()) {
            return { success: false, error: 'Memory service not available', memories: [] };
          }

          try {
            const memories = await memoryService.searchMemories(userId, query, {
              topK: 5,
              types: types as any,
            });

            return {
              success: true,
              count: memories.length,
              memories: memories.map(m => ({
                content: m.content,
                type: m.type,
                relevance: `${(m.score * 100).toFixed(0)}%`,
                createdAt: m.metadata.createdAt,
              })),
            };
          } catch (error) {
            return { success: false, error: String(error), memories: [] };
          }
        },
        {
          name: 'recall_memories',
          description: 'Search and retrieve stored memories about the user. Use this to recall user preferences, past decisions, or previously discussed topics.',
          schema: z.object({
            userId: z.string().describe('The user ID'),
            query: z.string().describe('What to search for in memories'),
            types: z.array(z.enum(['preference', 'deal_decision', 'fact', 'session_summary'])).optional().describe('Filter by memory types'),
          }),
        }
      ),

      // Get memory stats
      tool(
        async ({ userId }) => {
          if (!memoryService.isReady()) {
            return { success: false, error: 'Memory service not available' };
          }

          try {
            const stats = await memoryService.getStats(userId);
            return {
              success: true,
              stats: {
                totalMemories: stats.totalMemories,
                byType: stats.byType,
                oldestMemory: stats.oldestMemory?.toISOString(),
                newestMemory: stats.newestMemory?.toISOString(),
              },
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        {
          name: 'get_memory_stats',
          description: 'Get statistics about stored memories for a user.',
          schema: z.object({
            userId: z.string().describe('The user ID'),
          }),
        }
      ),

      // Clear user memories
      tool(
        async ({ userId, confirmClear }) => {
          if (!memoryService.isReady()) {
            return { success: false, error: 'Memory service not available' };
          }

          if (!confirmClear) {
            return {
              success: false,
              error: 'Please confirm by setting confirmClear to true',
              warning: 'This will permanently delete all stored memories for this user',
            };
          }

          try {
            await memoryService.clearUserMemories(userId);
            return {
              success: true,
              message: 'All memories cleared successfully',
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        {
          name: 'clear_memories',
          description: 'Clear all stored memories for a user. Use with caution - this is irreversible.',
          schema: z.object({
            userId: z.string().describe('The user ID'),
            confirmClear: z.boolean().describe('Must be true to confirm deletion'),
          }),
        }
      ),

      // ============================================================
      // DEAL PIPELINE TOOLS
      // ============================================================

      tool(
        async ({ userId, dealId, stage, notes }) => {
          try {
            const pipeline = await pipelineService.addToPipeline(userId, dealId, {
              stage,
              notes,
              triggeredBy: 'agent',
            });

            return JSON.stringify({
              success: true,
              pipelineId: pipeline.id,
              dealId: pipeline.dealId,
              stage: pipeline.stage,
              message: `Deal ${dealId} added to your pipeline at stage "${pipeline.stage}"`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'add_to_pipeline',
          description: 'Add a deal to the user\'s pipeline for tracking. Use when user wants to track or follow up on a property.',
          schema: z.object({
            userId: z.string().describe('The user ID'),
            dealId: z.string().describe('The deal/property ID to add'),
            stage: z.enum(['new', 'analyzing', 'due_diligence', 'offered', 'negotiating', 'under_contract']).optional().describe('Initial pipeline stage'),
            notes: z.string().optional().describe('Notes about the deal'),
          }),
        }
      ),

      tool(
        async ({ pipelineId, stage, notes }) => {
          try {
            const pipeline = await pipelineService.updateStage(pipelineId, stage as any, {
              notes,
              triggeredBy: 'agent',
            });

            return JSON.stringify({
              success: true,
              pipelineId: pipeline.id,
              previousStage: pipeline.stageHistory[pipeline.stageHistory.length - 2]?.stage,
              newStage: pipeline.stage,
              daysInPipeline: pipeline.getDaysInPipeline(),
              message: `Pipeline updated to "${pipeline.stage}"`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'update_pipeline_stage',
          description: 'Move a deal to a new stage in the pipeline. Use when user updates deal progress.',
          schema: z.object({
            pipelineId: z.string().describe('The pipeline item ID'),
            stage: z.enum(['new', 'analyzing', 'due_diligence', 'offered', 'negotiating', 'under_contract', 'closed_won', 'closed_lost']).describe('New stage'),
            notes: z.string().optional().describe('Notes about the stage change'),
          }),
        }
      ),

      tool(
        async ({ userId, stage, includeCompleted }) => {
          try {
            const result = await pipelineService.getUserPipeline(userId, {
              stage: stage as any,
              includeCompleted,
            });

            const summary = result.items.map((p: any) => ({
              pipelineId: p.id,
              dealId: p.dealId,
              stage: p.stage,
              daysInPipeline: p.getDaysInPipeline(),
              outcome: p.outcome,
              enteredAt: p.stageHistory[0]?.enteredAt,
            }));

            return JSON.stringify({
              success: true,
              totalDeals: result.total,
              deals: summary,
              stages: {
                new: summary.filter((d: any) => d.stage === 'new').length,
                analyzing: summary.filter((d: any) => d.stage === 'analyzing').length,
                due_diligence: summary.filter((d: any) => d.stage === 'due_diligence').length,
                offered: summary.filter((d: any) => d.stage === 'offered').length,
                negotiating: summary.filter((d: any) => d.stage === 'negotiating').length,
                under_contract: summary.filter((d: any) => d.stage === 'under_contract').length,
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_my_pipeline',
          description: 'Get the user\'s current deal pipeline with all active deals and their stages.',
          schema: z.object({
            userId: z.string().describe('The user ID'),
            stage: z.enum(['new', 'analyzing', 'due_diligence', 'offered', 'negotiating', 'under_contract', 'closed_won', 'closed_lost']).optional().describe('Filter by stage'),
            includeCompleted: z.boolean().optional().default(false).describe('Include closed deals'),
          }),
        }
      ),

      tool(
        async ({ pipelineId, outcome, closePrice, reason }) => {
          try {
            const pipeline = await pipelineService.markAsClosed(pipelineId, outcome as any, {
              closePrice,
              reason,
            });

            return JSON.stringify({
              success: true,
              pipelineId: pipeline.id,
              outcome: pipeline.outcome,
              closePrice: pipeline.closePrice,
              daysToClose: pipeline.getDaysInPipeline(),
              message: outcome === 'won'
                ? `Congratulations! Deal closed for $${closePrice?.toLocaleString() || 'N/A'}`
                : `Deal marked as ${outcome}${reason ? `: ${reason}` : ''}`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'close_deal',
          description: 'Mark a deal as closed (won, lost, or withdrawn). Use when user closes or loses a deal.',
          schema: z.object({
            pipelineId: z.string().describe('The pipeline item ID'),
            outcome: z.enum(['won', 'lost', 'withdrawn']).describe('Deal outcome'),
            closePrice: z.number().optional().describe('Final close price (for won deals)'),
            reason: z.string().optional().describe('Reason for loss or withdrawal'),
          }),
        }
      ),

      // Get deal status with phase, requirements, and blockers
      tool(
        async ({ propertyAddress, propertyId }) => {
          try {
            const { DealPipeline, ComplianceWorkflowExecution, StateDocumentTemplate, DocuSealSubmission } = await import('../models');

            // Find the property
            const property = await Property.findOne({
              where: propertyAddress
                ? { [Op.or]: [
                    Sequelize.where(fn('LOWER', col('address')), 'LIKE', `%${propertyAddress.toLowerCase()}%`),
                    { propertyId: propertyAddress },
                  ]}
                : { [Op.or]: [{ propertyId }, { id: !isNaN(Number(propertyId)) ? Number(propertyId) : -1 }] },
            });

            if (!property) {
              return JSON.stringify({ success: false, error: `Property not found: ${propertyAddress || propertyId}` });
            }

            const p = property as any;
            const state = p.state || 'TX';

            // Set property context so user can reference "it" or "this deal"
            const addressStr = p.address?.street || p.addressStreet || '';
            this.setPropertyContext(p.propertyId, addressStr, p.city, p.state);

            // Get pipeline status
            const pipeline = await DealPipeline.findOne({
              where: { dealId: property.id.toString() },
              order: [['createdAt', 'DESC']],
            });

            // Get compliance workflow execution
            const workflowExec = await ComplianceWorkflowExecution.findOne({
              where: { propertyId: property.id },
              order: [['createdAt', 'DESC']],
            });
            const we = workflowExec as any;

            // Get required documents for current phase
            let requiredDocs: any[] = [];
            const currentPhase = we?.currentStepIndex || 0;
            try {
              const templates = await StateDocumentTemplate.findAll({
                where: {
                  state,
                  phase: { [Op.lte]: currentPhase + 1 },
                  enabled: true,
                },
                order: [['phase', 'ASC']],
              });

              // Check which are already completed
              for (const t of templates) {
                const template = t as any;
                const submission = await DocuSealSubmission.findOne({
                  where: {
                    propertyId: property.id,
                    templateId: template.docuSealTemplateId,
                    status: { [Op.in]: ['completed', 'sent', 'pending'] },
                  },
                });

                const isRequired = template.requiredFor?.includes('all') || template.requiredFor?.includes('wholesaling');
                requiredDocs.push({
                  name: template.name,
                  category: template.category,
                  phase: template.phase,
                  required: isRequired,
                  status: submission?.status || 'not_started',
                  completed: submission?.status === 'completed',
                });
              }
            } catch (e) {
              // Document templates may not be configured
            }

            // Build status response
            const pipelineStages = ['new', 'analyzing', 'due_diligence', 'offered', 'negotiating', 'under_contract', 'closed'];
            const currentStage = pipeline?.stage || 'new';
            const stageIndex = pipelineStages.indexOf(currentStage);

            const response: any = {
              success: true,
              property: {
                id: property.id,
                address: p.address?.street || p.addressStreet,
                city: p.city,
                state: p.state,
                price: p.mlsListingPrice || p.buyItNowPrice,
              },
              pipeline: {
                stage: currentStage,
                stageNumber: stageIndex + 1,
                totalStages: pipelineStages.length,
                daysInPipeline: pipeline?.getDaysInPipeline?.() || 0,
                nextStage: stageIndex < pipelineStages.length - 1 ? pipelineStages[stageIndex + 1] : null,
              },
              compliance: {
                phase: currentPhase,
                status: we?.status || 'not_started',
                dealHeld: we?.dealHeld || false,
              },
              documents: {
                required: requiredDocs.filter(d => d.required && !d.completed).length,
                completed: requiredDocs.filter(d => d.completed).length,
                total: requiredDocs.length,
                list: requiredDocs,
              },
              nextSteps: [] as string[],
            };

            // Generate next steps based on status
            if (requiredDocs.some(d => d.required && !d.completed)) {
              const pending = requiredDocs.filter(d => d.required && !d.completed);
              response.nextSteps.push(`Complete ${pending.length} required document(s): ${pending.map(d => d.name).join(', ')}`);
            }
            if (we?.dealHeld) {
              response.nextSteps.push(`Deal is on hold: ${we.holdReason || 'Awaiting review'}`);
            }
            if (currentStage === 'new') {
              response.nextSteps.push('Run compliance check and score against buy boxes');
            }
            if (currentStage === 'analyzing') {
              response.nextSteps.push('Complete due diligence and verify property details');
            }
            if (currentStage === 'due_diligence') {
              response.nextSteps.push('Submit offer to matching funds');
            }
            if (currentStage === 'offered') {
              response.nextSteps.push('Follow up on pending offers and negotiate terms');
            }

            return JSON.stringify(response);
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_deal_status',
          description: 'Get comprehensive deal status including: pipeline stage, compliance phase, required documents, blocking gates, and next steps. Use when user asks "what phase is this in", "what\'s needed", "what\'s blocking this deal", or "deal status".',
          schema: z.object({
            propertyAddress: z.string().optional().describe('Property address to look up'),
            propertyId: z.string().optional().describe('Property ID if known'),
          }),
        }
      ),

      // ============================================================
      // PORTFOLIO TOOLS
      // ============================================================

      tool(
        async ({ userId, address, city, state, propertyType, acquisitionDate, acquisitionPrice, totalInvested, monthlyRent, monthlyExpenses, pipelineId }) => {
          try {
            let portfolio;

            if (pipelineId) {
              // Move from pipeline to portfolio
              portfolio = await pipelineService.moveToPortfolio(pipelineId, {
                acquisitionPrice,
                closingCosts: (totalInvested || acquisitionPrice) - acquisitionPrice,
                monthlyRent,
                monthlyExpenses,
              });
            } else {
              // Direct add to portfolio
              portfolio = await portfolioService.addProperty(userId, {
                address: address || 'Unknown',
                city: city || 'Unknown',
                state: state || 'Unknown',
                propertyType: propertyType || 'Single Family',
                acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : new Date(),
                acquisitionPrice,
                totalInvested: totalInvested || acquisitionPrice,
                monthlyRent: monthlyRent || 0,
                monthlyExpenses: monthlyExpenses || 0,
              } as any);
            }

            return JSON.stringify({
              success: true,
              portfolioId: portfolio.id,
              address: `${portfolio.address}, ${portfolio.city}, ${portfolio.state}`,
              acquisitionPrice: portfolio.acquisitionPrice,
              currentValue: portfolio.currentValue,
              equity: portfolio.equity,
              cashFlow: portfolio.monthlyCashFlow,
              message: 'Property added to your portfolio!',
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'add_to_portfolio',
          description: 'Add a property to the user\'s portfolio for tracking investments. Can move from pipeline or add directly.',
          schema: z.object({
            userId: z.string().describe('The user ID'),
            address: z.string().optional().describe('Property address (if adding directly)'),
            city: z.string().optional().describe('City'),
            state: z.string().optional().describe('State'),
            propertyType: z.string().optional().describe('Property type'),
            acquisitionDate: z.string().optional().describe('Date acquired (ISO format)'),
            acquisitionPrice: z.number().describe('Purchase price'),
            totalInvested: z.number().optional().describe('Total investment including rehab'),
            monthlyRent: z.number().optional().describe('Monthly rental income'),
            monthlyExpenses: z.number().optional().describe('Monthly expenses'),
            pipelineId: z.string().optional().describe('Pipeline ID if moving from pipeline'),
          }),
        }
      ),

      tool(
        async ({ userId, status, state }) => {
          try {
            const result = await portfolioService.getUserPortfolio(userId, {
              status: status as any,
              state,
            });

            const summary = result.items.map((p: any) => ({
              portfolioId: p.id,
              address: `${p.address}, ${p.city}, ${p.state}`,
              status: p.status,
              acquisitionPrice: p.acquisitionPrice,
              currentValue: p.currentValue,
              equity: p.equity,
              cashFlow: p.monthlyCashFlow,
              roi: p.cashOnCashReturn,
            }));

            return JSON.stringify({
              success: true,
              totalProperties: result.total,
              properties: summary,
              statusBreakdown: {
                holding: summary.filter((p: any) => p.status === 'holding').length,
                renting: summary.filter((p: any) => p.status === 'renting').length,
                renovating: summary.filter((p: any) => p.status === 'renovating').length,
                listed_for_sale: summary.filter((p: any) => p.status === 'listed_for_sale').length,
                sold: summary.filter((p: any) => p.status === 'sold').length,
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_my_portfolio',
          description: 'Get the user\'s property portfolio with all investments and their status.',
          schema: z.object({
            userId: z.string().describe('The user ID'),
            status: z.enum(['holding', 'renting', 'renovating', 'listed_for_sale', 'sold']).optional().describe('Filter by status'),
            state: z.string().optional().describe('Filter by state'),
          }),
        }
      ),

      tool(
        async ({ userId }) => {
          try {
            const [summary, totalValue] = await Promise.all([
              portfolioService.getPortfolioSummary(userId),
              portfolioService.getTotalValue(userId),
            ]);

            return JSON.stringify({
              success: true,
              totalValue: totalValue.totalValue,
              totalEquity: totalValue.totalEquity,
              totalProperties: summary.totalProperties,
              totalInvested: summary.totalInvested,
              byStatus: summary.byStatus,
              byState: summary.byState,
              message: `Your portfolio has ${summary.totalProperties} properties worth $${totalValue.totalValue.toLocaleString()} with $${totalValue.totalEquity.toLocaleString()} in equity`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_portfolio_value',
          description: 'Get the total value and equity of the user\'s portfolio.',
          schema: z.object({
            userId: z.string().describe('The user ID'),
          }),
        }
      ),

      tool(
        async ({ portfolioId, value, source }) => {
          try {
            const portfolio = await portfolioService.updateValuation(
              portfolioId,
              value,
              source as any
            );

            const previousValue = portfolio.acquisitionPrice;
            const appreciation = ((value - previousValue) / previousValue) * 100;

            return JSON.stringify({
              success: true,
              portfolioId: portfolio.id,
              address: `${portfolio.address}, ${portfolio.city}, ${portfolio.state}`,
              previousValue,
              newValue: value,
              appreciation: `${appreciation.toFixed(1)}%`,
              newEquity: portfolio.equity,
              source,
              message: `Valuation updated to $${value.toLocaleString()} (${appreciation >= 0 ? '+' : ''}${appreciation.toFixed(1)}% from acquisition)`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'update_property_value',
          description: 'Update the current valuation of a property in the portfolio.',
          schema: z.object({
            portfolioId: z.string().describe('The portfolio property ID'),
            value: z.number().describe('New property value'),
            source: z.enum(['zestimate', 'appraisal', 'cma', 'manual']).describe('Valuation source'),
          }),
        }
      ),

      // ============================================================
      // WIN/LOSS ANALYTICS TOOLS
      // ============================================================

      tool(
        async ({ userId, buyBoxId, startDate, endDate }) => {
          try {
            const stats = await winLossService.getWinLossStats({
              buyBoxId,
              startDate: startDate ? new Date(startDate) : undefined,
              endDate: endDate ? new Date(endDate) : undefined,
            });

            const insights = await winLossService.generateInsights({ buyBoxId });

            return JSON.stringify({
              success: true,
              stats: {
                totalSubmissions: stats.totalSubmissions,
                wins: stats.wins,
                losses: stats.losses,
                pending: stats.pending,
                winRate: stats.winRate,
                avgResponseTime: stats.avgResponseTime,
              },
              insights: insights.slice(0, 3),
              message: `Win rate: ${stats.winRate.toFixed(1)}% (${stats.wins} wins / ${stats.wins + stats.losses} closed)`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_win_loss_stats',
          description: 'Get win/loss statistics and insights for deal submissions.',
          schema: z.object({
            userId: z.string().optional().describe('The user ID'),
            buyBoxId: z.string().optional().describe('Filter by buy box'),
            startDate: z.string().optional().describe('Start date (ISO format)'),
            endDate: z.string().optional().describe('End date (ISO format)'),
          }),
        }
      ),

      tool(
        async ({ userId, startDate, endDate }) => {
          try {
            const [overallStats, trend] = await Promise.all([
              agentMetricsService.getOverallStats({
                userId,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
              }),
              agentMetricsService.getPerformanceTrend({
                userId,
                days: 30,
              }),
            ]);

            return JSON.stringify({
              success: true,
              accuracy: {
                overall: overallStats.accuracyRate,
                avgUserRating: overallStats.avgUserRating,
              },
              performance: {
                totalExecutions: overallStats.totalExecutions,
                avgDuration: `${(overallStats.avgDurationMs / 1000).toFixed(1)}s`,
                avgToolSuccessRate: overallStats.avgToolSuccessRate,
                errorRate: overallStats.errorRate,
              },
              topTools: overallStats.topTools.slice(0, 5),
              recentTrend: trend.slice(-7),
              message: `Agent accuracy: ${overallStats.accuracyRate?.toFixed(1) || 'N/A'}%, Avg rating: ${overallStats.avgUserRating?.toFixed(1) || 'N/A'}/5`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_agent_accuracy',
          description: 'Get agent performance and accuracy metrics over time.',
          schema: z.object({
            userId: z.string().optional().describe('The user ID'),
            startDate: z.string().optional().describe('Start date (ISO format)'),
            endDate: z.string().optional().describe('End date (ISO format)'),
          }),
        }
      ),

      // ============================================================
      // DOCUSEAL E-SIGNATURE TOOLS
      // ============================================================

      tool(
        async ({}) => {
          try {
            if (!docuSealService.isReady()) {
              return JSON.stringify({
                success: false,
                error: 'DocuSeal not configured. Set DOCUSEAL_API_KEY in environment.',
              });
            }

            const templates = await docuSealService.listTemplates({ limit: 20 });

            return JSON.stringify({
              success: true,
              templates: templates.map(t => ({
                id: t.id,
                name: t.name,
                createdAt: t.created_at,
                folder: t.folder_name,
              })),
              count: templates.length,
              message: `Found ${templates.length} contract templates`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'list_contract_templates',
          description: 'List available DocuSeal contract templates for e-signatures.',
          schema: z.object({}),
        }
      ),

      tool(
        async ({ templateId, propertyAddress, city, state, zip, purchasePrice, sellerName, sellerEmail, closingDate, sendEmail, expireInDays }) => {
          try {
            if (!docuSealService.isReady()) {
              return JSON.stringify({
                success: false,
                error: 'DocuSeal not configured. Set DOCUSEAL_API_KEY in environment.',
              });
            }

            const submission = await docuSealService.createDealSubmission(templateId, {
              propertyAddress,
              city,
              state,
              zip,
              purchasePrice,
              sellerName,
              sellerEmail,
            }, {
              sendEmail: sendEmail ?? true,
              expireInDays: expireInDays ?? 7,
              metadata: {
                createdVia: 'agent',
              },
            });

            return JSON.stringify({
              success: true,
              submissionId: submission.id,
              status: submission.status,
              signers: submission.submitters.map(s => ({
                email: s.email,
                role: s.role,
                status: s.status,
                signingUrl: s.embed_src,
              })),
              message: `Contract sent to ${sellerEmail} for signing`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'send_contract',
          description: 'Send a contract for e-signature via DocuSeal. Use when user wants to send a purchase agreement or contract to a seller.',
          schema: z.object({
            templateId: z.number().describe('DocuSeal template ID (use list_contract_templates to find)'),
            propertyAddress: z.string().describe('Property street address'),
            city: z.string().describe('City'),
            state: z.string().describe('State code'),
            zip: z.string().describe('ZIP code'),
            purchasePrice: z.number().describe('Purchase price'),
            sellerName: z.string().describe('Seller full name'),
            sellerEmail: z.string().describe('Seller email address'),
            closingDate: z.string().optional().describe('Closing date (YYYY-MM-DD)'),
            sendEmail: z.boolean().optional().default(true).describe('Send email notification'),
            expireInDays: z.number().optional().default(7).describe('Days until contract expires'),
          }),
        }
      ),

      tool(
        async ({ submissionId }) => {
          try {
            if (!docuSealService.isReady()) {
              return JSON.stringify({
                success: false,
                error: 'DocuSeal not configured',
              });
            }

            const submission = await docuSealService.getSubmission(submissionId);

            const statusMessage = {
              pending: 'Waiting for signatures',
              completed: 'All parties have signed!',
              expired: 'Contract has expired',
              archived: 'Contract was archived',
            };

            return JSON.stringify({
              success: true,
              submissionId: submission.id,
              status: submission.status,
              completedAt: submission.completed_at,
              signers: submission.submitters.map(s => ({
                email: s.email,
                role: s.role,
                status: s.status,
                signedAt: s.completed_at,
                viewedAt: s.opened_at,
              })),
              documents: submission.documents?.map(d => ({
                name: d.name,
                url: d.url,
              })),
              message: statusMessage[submission.status] || submission.status,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_contract_status',
          description: 'Check the signing status of a contract sent via DocuSeal.',
          schema: z.object({
            submissionId: z.number().describe('DocuSeal submission ID'),
          }),
        }
      ),

      tool(
        async ({ submitterId }) => {
          try {
            if (!docuSealService.isReady()) {
              return JSON.stringify({
                success: false,
                error: 'DocuSeal not configured',
              });
            }

            const submitter = await docuSealService.resendEmail(submitterId);

            return JSON.stringify({
              success: true,
              email: submitter.email,
              status: submitter.status,
              message: `Signing reminder sent to ${submitter.email}`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'resend_contract_reminder',
          description: 'Resend a signing reminder email to a signer who hasn\'t completed their signature.',
          schema: z.object({
            submitterId: z.number().describe('DocuSeal submitter ID (from get_contract_status)'),
          }),
        }
      ),

      // ============================================================
      // DEAL INTELLIGENCE TOOLS (Predictive Analytics)
      // ============================================================
      tool(
        async ({ address, city, state, askingPrice, arv, bedrooms, bathrooms, sqft, yearBuilt, condition, daysOnMarket }) => {
          try {
            const intelligence = await dealIntelligenceService.analyzeDeal({
              address,
              city,
              state,
              askingPrice,
              arv,
              bedrooms,
              bathrooms,
              sqft,
              yearBuilt,
              condition,
              daysOnMarket,
            });

            return JSON.stringify({
              success: true,
              intelligence: {
                address: intelligence.address,
                successProbability: `${intelligence.prediction.successProbability}%`,
                confidence: intelligence.prediction.confidence,
                positiveFactors: intelligence.prediction.factors.positive,
                negativeFactors: intelligence.prediction.factors.negative,
                pricing: {
                  suggestedOffer: `$${intelligence.pricing.suggestedOffer.toLocaleString()}`,
                  minOffer: `$${intelligence.pricing.minOffer.toLocaleString()}`,
                  maxOffer: `$${intelligence.pricing.maxOffer.toLocaleString()}`,
                  discount: `${intelligence.pricing.discount}%`,
                  strategy: intelligence.pricing.strategy,
                  reasoning: intelligence.pricing.reasoning,
                  negotiationTactics: intelligence.pricing.negotiationTactics,
                },
                topFundMatches: intelligence.fundMatches.slice(0, 3).map(f => ({
                  fund: f.fundName,
                  matchScore: `${f.matchScore}%`,
                  acceptanceRate: `${f.historicalAcceptanceRate}%`,
                  responseTime: f.expectedResponseTime,
                  contactMethod: f.contactRecommendation,
                  reasoning: f.reasoning,
                })),
                marketContext: intelligence.marketContext,
                recommendation: intelligence.actionRecommendation,
                urgency: intelligence.urgency,
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_deal_intelligence',
          description: 'Get comprehensive AI-powered deal intelligence including: success probability prediction, optimal offer price with negotiation tactics, best fund matches with acceptance rates, and market context. Use this for deep analysis of any deal.',
          schema: z.object({
            address: z.string().describe('Property street address'),
            city: z.string().describe('City'),
            state: z.string().describe('State abbreviation (e.g., TX, FL, GA)'),
            askingPrice: z.number().describe('Current asking price'),
            arv: z.number().optional().describe('After Repair Value'),
            bedrooms: z.number().optional().describe('Number of bedrooms'),
            bathrooms: z.number().optional().describe('Number of bathrooms'),
            sqft: z.number().optional().describe('Square footage'),
            yearBuilt: z.number().optional().describe('Year built'),
            condition: z.string().optional().describe('Property condition (light, medium, heavy rehab)'),
            daysOnMarket: z.number().optional().describe('Days on market'),
          }),
        }
      ),

      tool(
        async ({ state, askingPrice, arv, bedrooms }) => {
          try {
            const result = dealIntelligenceService.quickScore({ state, askingPrice, arv, bedrooms });
            return JSON.stringify({
              success: true,
              score: result.score,
              verdict: result.verdict,
              topReason: result.topReason,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'quick_deal_score',
          description: 'Get a quick pass/fail score for a deal in under 1 second. Returns success probability, verdict (Strong Buy/Consider/Weak/Pass), and top reason.',
          schema: z.object({
            state: z.string().describe('State abbreviation'),
            askingPrice: z.number().describe('Asking price'),
            arv: z.number().optional().describe('After Repair Value'),
            bedrooms: z.number().optional().describe('Number of bedrooms'),
          }),
        }
      ),

      tool(
        async ({ state, askingPrice, arv, sqft, daysOnMarket }) => {
          try {
            const pricing = dealIntelligenceService.calculateOptimalPricing({
              state,
              askingPrice,
              arv,
              sqft,
              daysOnMarket,
            });

            return JSON.stringify({
              success: true,
              pricing: {
                suggestedOffer: `$${pricing.suggestedOffer.toLocaleString()}`,
                offerRange: `$${pricing.minOffer.toLocaleString()} - $${pricing.maxOffer.toLocaleString()}`,
                targetDiscount: `${pricing.discount}%`,
                strategy: pricing.strategy,
                reasoning: pricing.reasoning,
                tactics: pricing.negotiationTactics,
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_pricing_strategy',
          description: 'Get optimal pricing and negotiation strategy for a deal. Returns suggested offer price, acceptable range, discount target, and specific negotiation tactics.',
          schema: z.object({
            state: z.string().describe('State abbreviation'),
            askingPrice: z.number().describe('Asking price'),
            arv: z.number().optional().describe('After Repair Value'),
            sqft: z.number().optional().describe('Square footage'),
            daysOnMarket: z.number().optional().describe('Days on market'),
          }),
        }
      ),

      tool(
        async ({ state, askingPrice, bedrooms, city }) => {
          try {
            const matches = dealIntelligenceService.findBestFundMatches({ state, askingPrice, bedrooms, city });

            return JSON.stringify({
              success: true,
              matches: matches.map(m => ({
                fund: m.fundName,
                matchScore: `${m.matchScore}%`,
                confidence: `${m.confidence}%`,
                historicalAcceptanceRate: `${m.historicalAcceptanceRate}%`,
                expectedResponse: m.expectedResponseTime,
                contactMethod: m.contactRecommendation,
                reasoning: m.reasoning,
              })),
              recommendation: matches.length > 0
                ? `Top match: ${matches[0].fundName} (${matches[0].matchScore}% match, ${matches[0].historicalAcceptanceRate}% historical acceptance)`
                : 'No strong fund matches found for this property profile',
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'find_best_funds',
          description: 'Find the best matching institutional funds for a property based on their historical preferences, acceptance rates, and response times. More accurate than just buy box criteria matching.',
          schema: z.object({
            state: z.string().describe('State abbreviation'),
            askingPrice: z.number().describe('Asking price'),
            bedrooms: z.number().optional().describe('Number of bedrooms'),
            city: z.string().optional().describe('City name'),
          }),
        }
      ),

      // ============================================================
      // COMPLIANCE RULE MANAGEMENT TOOLS
      // These tools allow management of state compliance rules via chat
      // ============================================================

      tool(
        async ({ stateCode, phase }) => {
          try {
            // Initialize the service if needed
            await complianceSpecAIService.initialize();

            const command = {
              intent: 'list_rules' as const,
              params: { stateCode, phase },
              confidence: 1,
              requiresApproval: false,
              explanation: `List compliance rules for ${stateCode}${phase !== undefined ? ` phase ${phase}` : ''}`,
            };

            const result = await complianceSpecAIService.executeCommand(command, 'agent', true);

            if (!result.success) {
              return JSON.stringify({ success: false, error: result.message });
            }

            const rules = result.data || [];
            return JSON.stringify({
              success: true,
              stateCode,
              phase: phase ?? 'all',
              rulesCount: rules.length,
              rules: rules.map((r: any) => ({
                ruleCode: r.rule_code,
                name: r.name,
                phase: r.phase,
                severity: r.severity,
                blocking: r.is_blocking,
                active: r.is_active,
                description: r.description,
              })),
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'list_compliance_rules',
          description: 'List compliance rules for a state. Can filter by phase. Use this to see what rules exist before adding or modifying them.',
          schema: z.object({
            stateCode: z.string().describe('State code (e.g., OK, TX, FL)'),
            phase: z.number().optional().describe('Filter by phase number (0-6)'),
          }),
        }
      ),

      tool(
        async ({ stateCode }) => {
          try {
            await complianceSpecAIService.initialize();

            const command = {
              intent: 'list_disclosures' as const,
              params: { stateCode },
              confidence: 1,
              requiresApproval: false,
              explanation: `List disclosures for ${stateCode}`,
            };

            const result = await complianceSpecAIService.executeCommand(command, 'agent', true);

            if (!result.success) {
              return JSON.stringify({ success: false, error: result.message });
            }

            const disclosures = result.data || [];
            return JSON.stringify({
              success: true,
              stateCode,
              disclosuresCount: disclosures.length,
              disclosures: disclosures.map((d: any) => ({
                disclosureCode: d.disclosure_code,
                name: d.name,
                description: d.description,
                required: d.is_required,
                active: d.is_active,
                legalCitation: d.legal_citation,
              })),
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'list_compliance_disclosures',
          description: 'List disclosure requirements for a state. Shows all required disclosures with their legal citations.',
          schema: z.object({
            stateCode: z.string().describe('State code (e.g., OK, TX, FL)'),
          }),
        }
      ),

      tool(
        async ({ stateCode }) => {
          try {
            await complianceSpecAIService.initialize();

            const command = {
              intent: 'get_state_summary' as const,
              params: { stateCode },
              confidence: 1,
              requiresApproval: false,
              explanation: `Get compliance summary for ${stateCode}`,
            };

            const result = await complianceSpecAIService.executeCommand(command, 'agent', true);

            if (!result.success) {
              return JSON.stringify({ success: false, error: result.message });
            }

            return JSON.stringify({
              success: true,
              stateCode,
              summary: result.data,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_compliance_summary',
          description: 'Get a summary of compliance configuration for a state. Shows counts of rules, disclosures, gates, and phases.',
          schema: z.object({
            stateCode: z.string().describe('State code (e.g., OK, TX, FL)'),
          }),
        }
      ),

      tool(
        async ({ stateCode, ruleCode, name, phase, description, severity, blocking, errorMessage, remediation }) => {
          try {
            await complianceSpecAIService.initialize();

            const command = {
              intent: 'add_rule' as const,
              params: {
                stateCode,
                ruleCode: ruleCode || `${stateCode}-P${phase}-R${Date.now().toString().slice(-4)}`,
                name,
                phase,
                description,
                severity: severity || 'warning',
                blocking: blocking ?? false,
                errorMessage: errorMessage || `Rule ${name} not satisfied`,
                remediation,
              },
              confidence: 1,
              requiresApproval: false,
              explanation: `Add rule "${name}" to ${stateCode} phase ${phase}`,
            };

            const result = await complianceSpecAIService.executeCommand(command, 'agent', true);

            return JSON.stringify({
              success: result.success,
              message: result.message,
              rule: result.success ? {
                ruleCode: command.params.ruleCode,
                name,
                phase,
                severity: command.params.severity,
                blocking: command.params.blocking,
              } : null,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'add_compliance_rule',
          description: 'Add a new compliance rule to a state. Rules define requirements that must be met for deals to proceed through the compliance workflow.',
          schema: z.object({
            stateCode: z.string().describe('State code (e.g., OK, TX, FL)'),
            ruleCode: z.string().optional().describe('Rule code (e.g., OK-P2-R5). Auto-generated if not provided.'),
            name: z.string().describe('Rule name (e.g., "Lead Paint Disclosure Required")'),
            phase: z.number().describe('Phase this rule applies to (0-6)'),
            description: z.string().optional().describe('Detailed description of the rule'),
            severity: z.enum(['critical', 'warning', 'info']).optional().describe('Severity level. Critical rules cause RED status if failed.'),
            blocking: z.boolean().optional().describe('Whether failing this rule blocks the deal from proceeding'),
            errorMessage: z.string().optional().describe('Message shown when rule fails'),
            remediation: z.string().optional().describe('Instructions for fixing a failed rule'),
          }),
        }
      ),

      tool(
        async ({ stateCode, disclosureCode, name, description, required, legalCitation, keywords }) => {
          try {
            await complianceSpecAIService.initialize();

            const command = {
              intent: 'add_disclosure' as const,
              params: {
                stateCode,
                disclosureCode: disclosureCode || `${stateCode}-D${Date.now().toString().slice(-4)}`,
                name,
                description,
                required: required ?? true,
                legalCitation,
                keywords: keywords || [],
              },
              confidence: 1,
              requiresApproval: false,
              explanation: `Add disclosure "${name}" to ${stateCode}`,
            };

            const result = await complianceSpecAIService.executeCommand(command, 'agent', true);

            return JSON.stringify({
              success: result.success,
              message: result.message,
              disclosure: result.success ? {
                disclosureCode: command.params.disclosureCode,
                name,
                required: command.params.required,
              } : null,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'add_compliance_disclosure',
          description: 'Add a new disclosure requirement to a state. Disclosures are specific items that must be present in contracts (e.g., lead paint disclosure, assignment intent disclosure).',
          schema: z.object({
            stateCode: z.string().describe('State code (e.g., OK, TX, FL)'),
            disclosureCode: z.string().optional().describe('Disclosure code (e.g., OK-D9). Auto-generated if not provided.'),
            name: z.string().describe('Disclosure name (e.g., "Lead Paint Disclosure")'),
            description: z.string().optional().describe('Description of what must be disclosed'),
            required: z.boolean().optional().describe('Whether this disclosure is required (default: true)'),
            legalCitation: z.string().optional().describe('Legal citation (e.g., "Oklahoma Statutes Title 59 §858-312")'),
            keywords: z.array(z.string()).optional().describe('Keywords to search for in documents to verify disclosure'),
          }),
        }
      ),

      tool(
        async ({ stateCode, ruleCode, updates }) => {
          try {
            await complianceSpecAIService.initialize();

            const command = {
              intent: 'update_rule' as const,
              params: {
                stateCode,
                ruleCode,
                ...updates,
              },
              confidence: 1,
              requiresApproval: false,
              explanation: `Update rule ${ruleCode} in ${stateCode}`,
            };

            const result = await complianceSpecAIService.executeCommand(command, 'agent', true);

            return JSON.stringify({
              success: result.success,
              message: result.message,
              updated: result.success ? { ruleCode, changes: updates } : null,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'update_compliance_rule',
          description: 'Update an existing compliance rule. Can change severity, blocking status, error message, or other properties.',
          schema: z.object({
            stateCode: z.string().describe('State code (e.g., OK, TX, FL)'),
            ruleCode: z.string().describe('Rule code to update (e.g., OK-P2-R5)'),
            updates: z.object({
              name: z.string().optional().describe('New rule name'),
              description: z.string().optional().describe('New description'),
              severity: z.enum(['critical', 'warning', 'info']).optional().describe('New severity level'),
              blocking: z.boolean().optional().describe('New blocking status'),
              active: z.boolean().optional().describe('Enable or disable the rule'),
              errorMessage: z.string().optional().describe('New error message'),
              remediation: z.string().optional().describe('New remediation instructions'),
            }).describe('Fields to update'),
          }),
        }
      ),

      tool(
        async ({ stateCode, ruleCode, active }) => {
          try {
            await complianceSpecAIService.initialize();

            const command = {
              intent: 'toggle_rule' as const,
              params: { stateCode, ruleCode, active },
              confidence: 1,
              requiresApproval: false,
              explanation: `${active ? 'Enable' : 'Disable'} rule ${ruleCode} in ${stateCode}`,
            };

            const result = await complianceSpecAIService.executeCommand(command, 'agent', true);

            return JSON.stringify({
              success: result.success,
              message: result.message,
              ruleCode,
              active,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'toggle_compliance_rule',
          description: 'Enable or disable a compliance rule. Disabled rules are not checked during compliance validation.',
          schema: z.object({
            stateCode: z.string().describe('State code (e.g., OK, TX, FL)'),
            ruleCode: z.string().describe('Rule code to toggle (e.g., OK-P2-R5)'),
            active: z.boolean().describe('true to enable, false to disable'),
          }),
        }
      ),

      tool(
        async ({ sourceState, targetState, targetStateName }) => {
          try {
            await complianceSpecAIService.initialize();

            const command = {
              intent: 'clone_state' as const,
              params: { sourceState, targetState, targetStateName },
              confidence: 1,
              requiresApproval: true, // This is a dangerous operation
              explanation: `Clone compliance spec from ${sourceState} to ${targetState}`,
            };

            const result = await complianceSpecAIService.executeCommand(command, 'agent', true);

            return JSON.stringify({
              success: result.success,
              message: result.message,
              sourceState,
              targetState,
              targetStateName,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'clone_state_compliance',
          description: 'Clone an existing state compliance spec to create a new state. This copies all rules, disclosures, gates, and documents. Useful for creating similar state specs.',
          schema: z.object({
            sourceState: z.string().describe('State code to copy from (e.g., OK)'),
            targetState: z.string().describe('New state code (e.g., TX)'),
            targetStateName: z.string().describe('Full state name (e.g., "Texas")'),
          }),
        }
      ),

      tool(
        async ({ stateCode }) => {
          try {
            await complianceSpecAIService.initialize();

            const command = {
              intent: 'suggest_rules' as const,
              params: { stateCode },
              confidence: 1,
              requiresApproval: false,
              explanation: `Suggest additional rules for ${stateCode}`,
            };

            const result = await complianceSpecAIService.executeCommand(command, 'agent', true);

            return JSON.stringify({
              success: result.success,
              stateCode,
              suggestions: result.data || [],
              message: result.message,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'suggest_compliance_rules',
          description: 'Get AI suggestions for additional compliance rules that other states have but this state is missing. Helps ensure comprehensive compliance coverage.',
          schema: z.object({
            stateCode: z.string().describe('State code to get suggestions for (e.g., TX)'),
          }),
        }
      ),

      tool(
        async ({ command }) => {
          try {
            await complianceSpecAIService.initialize();

            // Parse the natural language command
            const parsed = await complianceSpecAIService.parseCommand(command, 'agent');

            if (parsed.confidence < 0.5) {
              return JSON.stringify({
                success: false,
                error: 'Could not understand the command. Please be more specific.',
                parsed: {
                  intent: parsed.intent,
                  confidence: parsed.confidence,
                  explanation: parsed.explanation,
                },
              });
            }

            // Execute the command
            const result = await complianceSpecAIService.executeCommand(parsed, 'agent', true);

            return JSON.stringify({
              success: result.success,
              message: result.message,
              data: result.data,
              command: {
                intent: parsed.intent,
                confidence: parsed.confidence,
                explanation: parsed.explanation,
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'compliance_natural_language',
          description: 'Execute a compliance management command using natural language. Examples: "Add a lead paint disclosure to Texas", "Disable all phase 4 rules in Oklahoma", "Clone Oklahoma to create Arizona".',
          schema: z.object({
            command: z.string().describe('Natural language command describing what to do with compliance rules'),
          }),
        }
      ),

      // ============================================================
      // PROJECT MANAGEMENT TOOLS
      // ============================================================

      tool(
        async ({ organizationId, search, status, tags, limit }) => {
          try {
            const result = await projectService.getProjects(organizationId, {
              search,
              status: status as any,
              tags,
              limit: limit || 10,
            });

            const summary = result.data.map((p: any) => ({
              id: p.id,
              title: p.title,
              status: p.status,
              githubUrl: p.githubUrl,
              taskCount: p.taskCount || 0,
              contactCount: p.contactCount || 0,
              tags: p.tags,
              createdAt: p.createdAt,
              updatedAt: p.updatedAt,
            }));

            return JSON.stringify({
              success: true,
              total: result.pagination.total,
              projects: summary,
              message: `Found ${result.pagination.total} projects`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'list_projects',
          description: 'List all projects for the organization with optional filtering by search term, status, or tags.',
          schema: z.object({
            organizationId: z.string().describe('The organization ID'),
            search: z.string().optional().describe('Search by title or description'),
            status: z.enum(['active', 'on_hold', 'completed', 'archived', 'cancelled']).optional().describe('Filter by status'),
            tags: z.array(z.string()).optional().describe('Filter by tags'),
            limit: z.number().optional().default(10).describe('Maximum number of results'),
          }),
        }
      ),

      tool(
        async ({ projectId }) => {
          try {
            const project = await projectService.getProject(projectId);
            if (!project) {
              return JSON.stringify({ success: false, error: 'Project not found' });
            }

            const contacts = await projectContactService.getProjectContacts(projectId);

            return JSON.stringify({
              success: true,
              project: {
                id: project.id,
                title: project.title,
                description: project.description,
                status: project.status,
                githubUrl: project.githubUrl,
                deploymentUrl: project.deploymentUrl,
                startDate: project.startDate,
                targetEndDate: project.targetEndDate,
                actualEndDate: project.actualEndDate,
                tags: project.tags,
                contactCount: contacts.length,
                contacts: contacts.map((c: any) => ({
                  name: c.contact?.name,
                  email: c.contact?.email,
                  role: c.role,
                  isPrimary: c.isPrimary,
                  githubInviteStatus: c.githubInviteStatus,
                })),
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
              },
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_project_details',
          description: 'Get detailed information about a specific project including contacts and their GitHub invite status.',
          schema: z.object({
            projectId: z.string().describe('The project ID (UUID)'),
          }),
        }
      ),

      tool(
        async ({ organizationId, title, description, githubUrl, status, tags, createdById }) => {
          try {
            const project = await projectService.createProject({
              organizationId,
              title,
              description,
              githubUrl,
              status: status as any || 'active',
              tags,
              createdById,
            });

            return JSON.stringify({
              success: true,
              project: {
                id: project.id,
                title: project.title,
                status: project.status,
                githubUrl: project.githubUrl,
              },
              message: `Project "${project.title}" created successfully!`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'create_project',
          description: 'Create a new project. Can optionally link to a GitHub repository.',
          schema: z.object({
            organizationId: z.string().describe('The organization ID'),
            title: z.string().describe('Project title'),
            description: z.string().optional().describe('Project description'),
            githubUrl: z.string().optional().describe('GitHub repository URL (e.g., https://github.com/owner/repo)'),
            status: z.enum(['active', 'on_hold', 'completed', 'archived', 'cancelled']).optional().default('active').describe('Initial status'),
            tags: z.array(z.string()).optional().describe('Tags for categorization'),
            createdById: z.string().optional().describe('User ID who created the project'),
          }),
        }
      ),

      tool(
        async ({ projectId, title, description, githubUrl, status, tags }) => {
          try {
            // First get the project to find its organizationId
            const existingProject = await projectService.getProject(projectId);
            if (!existingProject) {
              return JSON.stringify({ success: false, error: 'Project not found' });
            }

            const project = await projectService.updateProject(projectId, existingProject.organizationId, {
              title,
              description,
              githubUrl,
              status: status as any,
              tags,
            });

            if (!project) {
              return JSON.stringify({ success: false, error: 'Project not found' });
            }

            return JSON.stringify({
              success: true,
              project: {
                id: project.id,
                title: project.title,
                status: project.status,
                githubUrl: project.githubUrl,
              },
              message: `Project "${project.title}" updated successfully!`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'update_project',
          description: 'Update an existing project. Can change title, description, status, GitHub URL, or tags.',
          schema: z.object({
            projectId: z.string().describe('The project ID (UUID)'),
            title: z.string().optional().describe('New project title'),
            description: z.string().optional().describe('New description'),
            githubUrl: z.string().optional().describe('New GitHub repository URL'),
            status: z.enum(['active', 'on_hold', 'completed', 'archived', 'cancelled']).optional().describe('New status'),
            tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
          }),
        }
      ),

      tool(
        async ({ projectId, contactId, contactEmail, role, notes }) => {
          try {
            // If contactEmail is provided, find the contact by email
            let actualContactId = contactId;
            if (!actualContactId && contactEmail) {
              const contact = await Contact.findOne({ where: { email: contactEmail } });
              if (!contact) {
                return JSON.stringify({ success: false, error: `No contact found with email ${contactEmail}` });
              }
              actualContactId = contact.id;
            }

            if (!actualContactId) {
              return JSON.stringify({ success: false, error: 'Must provide either contactId or contactEmail' });
            }

            const projectContact = await projectContactService.addContact({
              projectId,
              contactId: actualContactId,
              role,
              notes,
            });

            return JSON.stringify({
              success: true,
              projectContact: {
                contactName: projectContact.contact?.name,
                contactEmail: projectContact.contact?.email,
                role: projectContact.role,
                githubInviteStatus: projectContact.githubInviteStatus,
              },
              message: `Contact "${projectContact.contact?.name}" added to project. ${projectContact.githubInviteStatus === 'pending' ? 'GitHub invite sent!' : ''}`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'add_contact_to_project',
          description: 'Add a contact to a project. If the project has a GitHub URL, the contact will automatically be invited to the repository.',
          schema: z.object({
            projectId: z.string().describe('The project ID (UUID)'),
            contactId: z.string().optional().describe('The contact ID (UUID) - provide this OR contactEmail'),
            contactEmail: z.string().optional().describe('Contact email address - will look up contact by email'),
            role: z.string().optional().describe('Role on the project (e.g., Developer, Client, Stakeholder)'),
            notes: z.string().optional().describe('Notes about this contact on the project'),
          }),
        }
      ),

      tool(
        async ({ projectId, contactId }) => {
          try {
            const result = await projectContactService.inviteToGitHub(projectId, contactId);
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'invite_project_contact_to_github',
          description: 'Manually trigger a GitHub repository invite for a contact on a project. Useful if the auto-invite failed or to retry.',
          schema: z.object({
            projectId: z.string().describe('The project ID (UUID)'),
            contactId: z.string().describe('The contact ID (UUID)'),
          }),
        }
      ),

      tool(
        async ({ projectId }) => {
          try {
            const contacts = await projectContactService.getProjectContacts(projectId);

            const summary = contacts.map((c: any) => ({
              contactId: c.contactId,
              name: c.contact?.name,
              email: c.contact?.email,
              phone: c.contact?.phone,
              role: c.role,
              isPrimary: c.isPrimary,
              githubInviteStatus: c.githubInviteStatus,
              githubInviteError: c.githubInviteError,
              notes: c.notes,
            }));

            const githubStats = {
              total: contacts.length,
              accepted: contacts.filter((c: any) => c.githubInviteStatus === 'accepted').length,
              pending: contacts.filter((c: any) => c.githubInviteStatus === 'pending').length,
              failed: contacts.filter((c: any) => c.githubInviteStatus === 'failed').length,
              notInvited: contacts.filter((c: any) => c.githubInviteStatus === 'none').length,
            };

            return JSON.stringify({
              success: true,
              contacts: summary,
              githubStats,
              message: `Project has ${contacts.length} contacts. GitHub: ${githubStats.accepted} collaborators, ${githubStats.pending} pending, ${githubStats.failed} failed.`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_project_contacts',
          description: 'Get all contacts assigned to a project with their roles and GitHub invite status.',
          schema: z.object({
            projectId: z.string().describe('The project ID (UUID)'),
          }),
        }
      ),

      tool(
        async ({ projectId, content, subject, userId }) => {
          try {
            const project = await Project.findByPk(projectId);
            if (!project) {
              return JSON.stringify({ success: false, error: 'Project not found' });
            }

            const note = await ProjectNote.create({
              projectId,
              content,
              subject,
              userId: userId || '',
              organizationId: project.organizationId,
            });

            return JSON.stringify({
              success: true,
              note: {
                id: note.id,
                subject: note.subject,
                content: note.content,
                createdAt: note.createdAt,
              },
              message: 'Note added to project!',
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'add_project_note',
          description: 'Add a note to a project for documentation or communication.',
          schema: z.object({
            projectId: z.string().describe('The project ID (UUID)'),
            content: z.string().describe('The note content'),
            subject: z.string().optional().describe('Optional subject/title for the note'),
            userId: z.string().optional().describe('User ID who created the note'),
          }),
        }
      ),

      tool(
        async ({ projectId, title, description, status, priority, dueDate, assignedToId }) => {
          try {
            const project = await Project.findByPk(projectId);
            if (!project) {
              return JSON.stringify({ success: false, error: 'Project not found' });
            }

            const task = await Task.create({
              projectId,
              organizationId: project.organizationId,
              title,
              description,
              status: status || 'pending',
              priority: priority || 'normal',
              dueDate: dueDate ? new Date(dueDate) : undefined,
              assignedTo: assignedToId || null,
            });

            return JSON.stringify({
              success: true,
              task: {
                id: task.id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                dueDate: task.dueDate,
              },
              message: `Task "${task.title}" created!`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'create_project_task',
          description: 'Create a task within a project for tracking work items.',
          schema: z.object({
            projectId: z.string().describe('The project ID (UUID)'),
            title: z.string().describe('Task title'),
            description: z.string().optional().describe('Task description'),
            status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().default('pending').describe('Task status'),
            priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal').describe('Task priority'),
            dueDate: z.string().optional().describe('Due date (ISO format)'),
            assignedToId: z.string().optional().describe('User ID to assign the task to'),
          }),
        }
      ),

      tool(
        async ({ projectId, status }) => {
          try {
            const tasks = await Task.findAll({
              where: {
                projectId,
                ...(status ? { status } : {}),
              },
              order: [['createdAt', 'DESC']],
            });

            const summary = tasks.map((t: any) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              dueDate: t.dueDate,
              assignedToId: t.assignedToId,
            }));

            const statusCounts = {
              pending: tasks.filter((t: any) => t.status === 'pending').length,
              in_progress: tasks.filter((t: any) => t.status === 'in_progress').length,
              completed: tasks.filter((t: any) => t.status === 'completed').length,
              cancelled: tasks.filter((t: any) => t.status === 'cancelled').length,
            };

            return JSON.stringify({
              success: true,
              tasks: summary,
              statusCounts,
              total: tasks.length,
              message: `Project has ${tasks.length} tasks: ${statusCounts.completed} completed, ${statusCounts.in_progress} in progress, ${statusCounts.pending} pending.`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_project_tasks',
          description: 'Get all tasks for a project with their status and details.',
          schema: z.object({
            projectId: z.string().describe('The project ID (UUID)'),
            status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().describe('Filter by status'),
          }),
        }
      ),

      tool(
        async ({ organizationId }) => {
          try {
            const stats = await projectService.getProjectStats(organizationId);

            return JSON.stringify({
              success: true,
              stats,
              message: `You have ${stats.total} projects: ${stats.byStatus.active} active, ${stats.byStatus.completed} completed, ${stats.byStatus.on_hold} on hold.`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'get_project_stats',
          description: 'Get statistics about all projects in the organization.',
          schema: z.object({
            organizationId: z.string().describe('The organization ID'),
          }),
        }
      ),

      // =========================================================================
      // GITHUB TOOLS
      // =========================================================================

      tool(
        async ({ projectId, title, body, labels }) => {
          try {
            // Get project to find GitHub URL
            const project = await projectService.getProject(projectId);
            if (!project) {
              return JSON.stringify({ success: false, error: 'Project not found' });
            }

            if (!project.githubUrl) {
              return JSON.stringify({ success: false, error: 'Project has no GitHub repository linked' });
            }

            // Parse GitHub URL
            const repoInfo = gitHubService.parseGitHubUrl(project.githubUrl);
            if (!repoInfo) {
              return JSON.stringify({ success: false, error: `Could not parse GitHub URL: ${project.githubUrl}` });
            }

            // Check if GitHub service is configured
            if (!gitHubService.isConfigured()) {
              return JSON.stringify({ success: false, error: 'GitHub integration not configured. Set GITHUB_TOKEN environment variable.' });
            }

            // Create the issue
            const issue = await gitHubService.createIssue(repoInfo.owner, repoInfo.repo, {
              title,
              body,
              labels,
            });

            return JSON.stringify({
              success: true,
              issue: {
                number: issue.number,
                title: issue.title,
                url: issue.html_url,
                state: issue.state,
                labels: issue.labels.map((l) => l.name),
              },
              message: `Issue #${issue.number} created: "${issue.title}"`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'create_github_issue',
          description: 'Create a GitHub issue for a project. The project must have a GitHub repository linked.',
          schema: z.object({
            projectId: z.string().describe('The project ID (UUID)'),
            title: z.string().describe('Issue title'),
            body: z.string().optional().describe('Issue description/body (supports markdown)'),
            labels: z.array(z.string()).optional().describe('Labels to apply to the issue'),
          }),
        }
      ),

      tool(
        async ({ projectId, state, limit }) => {
          try {
            // Get project to find GitHub URL
            const project = await projectService.getProject(projectId);
            if (!project) {
              return JSON.stringify({ success: false, error: 'Project not found' });
            }

            if (!project.githubUrl) {
              return JSON.stringify({ success: false, error: 'Project has no GitHub repository linked' });
            }

            // Parse GitHub URL
            const repoInfo = gitHubService.parseGitHubUrl(project.githubUrl);
            if (!repoInfo) {
              return JSON.stringify({ success: false, error: `Could not parse GitHub URL: ${project.githubUrl}` });
            }

            // Check if GitHub service is configured
            if (!gitHubService.isConfigured()) {
              return JSON.stringify({ success: false, error: 'GitHub integration not configured. Set GITHUB_TOKEN environment variable.' });
            }

            // Fetch issues
            const issues = await gitHubService.listIssues(repoInfo.owner, repoInfo.repo, {
              state: state || 'open',
              perPage: limit || 10,
            });

            // Filter out pull requests (GitHub returns PRs in issues endpoint)
            const filteredIssues = issues.filter((issue: any) => !issue.pull_request);

            return JSON.stringify({
              success: true,
              issues: filteredIssues.map((issue) => ({
                number: issue.number,
                title: issue.title,
                state: issue.state,
                url: issue.html_url,
                labels: issue.labels.map((l) => l.name),
                createdAt: issue.created_at,
                updatedAt: issue.updated_at,
              })),
              message: `Found ${filteredIssues.length} ${state || 'open'} issues`,
            });
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
        {
          name: 'list_github_issues',
          description: 'List GitHub issues for a project. The project must have a GitHub repository linked.',
          schema: z.object({
            projectId: z.string().describe('The project ID (UUID)'),
            state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('Filter by issue state'),
            limit: z.number().optional().default(10).describe('Maximum number of issues to return'),
          }),
        }
      ),
    ];
  }

  /**
   * Chat with the agent
   * Uses optimized history with automatic summarization for long conversations
   * Includes long-term memory context when userId is provided
   */
  async chat(sessionId: string, message: string, userId?: string, userName?: string): Promise<string> {
    const startTime = Date.now();

    if (!this.agent) {
      return 'Agent not initialized. Please set OPENROUTER_API_KEY or OPENAI_API_KEY environment variable.';
    }

    // Check for pending confirmation and handle yes/no responses
    const pendingConfirmation = this.getPendingConfirmation(sessionId);
    if (pendingConfirmation) {
      const responseType = this.isConfirmationResponse(message);

      if (responseType === 'confirm') {
        // User confirmed - inject confirmed entity into message for LLM
        this.clearPendingConfirmation();
        const confirmedName = pendingConfirmation.candidateName;
        const confirmedId = pendingConfirmation.candidateId;
        message = `[User confirmed: ${confirmedName} (ID: ${confirmedId})] ${pendingConfirmation.action} ${confirmedName}`;
        structuredLog('info', 'confirmation_accepted', { sessionId, confirmedId, confirmedName });
      } else if (responseType === 'reject') {
        // User rejected - clear and acknowledge
        this.clearPendingConfirmation();
        return `No problem. What would you like to do instead?`;
      } else if (responseType === 'select') {
        // User selected from list
        const selected = this.parseSelection(message, pendingConfirmation.candidates);
        if (selected) {
          this.clearPendingConfirmation();
          message = `[User selected: ${selected.name} (ID: ${selected.id})] ${pendingConfirmation.action} ${selected.name}`;
          structuredLog('info', 'confirmation_selected', { sessionId, selectedId: selected.id, selectedName: selected.name });
        }
        // If parse failed, let it flow through normally
      }
      // If not a clear confirmation/rejection, let the message flow through normally
    }

    // Check circuit breaker
    if (isCircuitOpen()) {
      structuredLog('warn', 'circuit_breaker_rejected', { sessionId, userId });
      return 'The AI service is temporarily unavailable. Please try again in a minute.';
    }

    // Check token limit
    if (isTokenLimitExceeded()) {
      structuredLog('warn', 'token_limit_exceeded', { sessionId, userId, ...getTokenUsageStats() });
      return 'Daily usage limit reached. Please try again tomorrow.';
    }

    // Try to acquire request slot
    const releaseSlot = tryAcquireRequestSlot(sessionId);
    if (!releaseSlot) {
      structuredLog('warn', 'concurrent_request_rejected', { sessionId, userId, ...getRequestStats() });
      return 'You already have an active request. Please wait for it to complete.';
    }

    // Acquire cache lock to prevent race conditions
    const releaseLock = await acquireCacheLock(sessionId);

    try {
      structuredLog('info', 'chat_started', { sessionId, userId, messageLength: message.length });

      // === PARALLEL CONTEXT LOADING WITH TIMEOUT ===
      // Load all context sources in parallel with a timeout to avoid blocking
      const CONTEXT_TIMEOUT_MS = 500; // Max wait for context loading

      // Start all async context loading in parallel
      const historyPromise = this.getOptimizedHistory(sessionId);

      const memoryPromise = (async (): Promise<BaseMessage[]> => {
        if (!userId || !memoryService.isReady()) return [];
        try {
          const relevantContext = await memoryService.getRelevantContext(userId, message);
          return relevantContext ? [new SystemMessage(relevantContext)] : [];
        } catch (error) {
          console.warn('Failed to fetch memory context:', error);
          return [];
        }
      })();

      const preloadedPromise = (async (): Promise<BaseMessage[]> => {
        try {
          const entityRefs = extractEntityReferences(message);
          const contextPropertyIds = this.conversationContext.property.id ? [this.conversationContext.property.id] : [];
          const contextContactIds = this.conversationContext.contact.id ? [this.conversationContext.contact.id] : [];

          if (
            entityRefs.names.length === 0 &&
            entityRefs.addresses.length === 0 &&
            contextPropertyIds.length === 0 &&
            contextContactIds.length === 0 &&
            !userId
          ) {
            return [];
          }

          const conversationContextData = await buildConversationContext({
            userId: userId || undefined,
            contactIds: contextContactIds,
            propertyIds: contextPropertyIds,
            mentionedNames: entityRefs.names,
            mentionedAddresses: entityRefs.addresses,
          });

          const preloadedPrompt = formatContextAsPrompt(conversationContextData);
          if (preloadedPrompt) {
            return [new SystemMessage(`
=== PRELOADED CONTEXT (Recent Activity & History) ===
${preloadedPrompt}

Use this context to disambiguate references. For example, if the user says "the lawyer on 141 Throop", check the contacts above to identify who they mean. When there's ambiguity, ask for confirmation before taking action.
===`)];
          }
          return [];
        } catch (error) {
          console.warn('Failed to preload conversation context:', error);
          return [];
        }
      })();

      // Wait for history (required) and race timeout for optional context
      const [optimizedHistory, optionalContext] = await Promise.all([
        historyPromise,
        // Race: get optional context or timeout with empty arrays
        Promise.race([
          Promise.all([memoryPromise, preloadedPromise]),
          new Promise<[BaseMessage[], BaseMessage[]]>((resolve) =>
            setTimeout(() => {
              console.warn(`Context loading timed out after ${CONTEXT_TIMEOUT_MS}ms`);
              resolve([[], []]);
            }, CONTEXT_TIMEOUT_MS)
          ),
        ]),
      ]);

      const [memoryContext, preloadedContextMessages] = optionalContext;

      // Inject current conversation context (property, buyer, contact, etc.)
      const contextSummary = this.getContextSummary();
      let contextMessages: BaseMessage[] = [];
      if (contextSummary !== 'No active context') {
        contextMessages = [new SystemMessage(`
=== CURRENT CONTEXT ===
${contextSummary}

When the user says "it", "this property", "the deal", "that buyer", "this contact", etc., they are referring to the entities listed above. Use the IDs provided when calling tools.
===`)];
      }

      // Also get full history for cache update
      const cachedEntry = conversationCache.get(sessionId);
      let fullHistory = cachedEntry?.data || [];

      // Build user context message if userName is provided
      let userContextMessages: BaseMessage[] = [];
      if (userName) {
        userContextMessages = [new SystemMessage(`IMPORTANT: You are currently speaking with ${userName}. This is their logged-in account name. Use their name naturally in conversation. You DO know their name - it is ${userName}.`)];
      }

      // Invoke the agent with memory context, conversation context, preloaded context, history, and the new message
      // PRODUCTION FIX: Wrap with timeout to prevent hanging requests
      // Set current userId for tools to access
      this.currentUserId = userId || null;
      this.currentSessionId = sessionId;
      console.log('[AgentService.chat] Set currentUserId to:', this.currentUserId);
      const result = await withTimeout(
        this.agent.invoke(
          {
            messages: [
              ...userContextMessages,
              ...memoryContext,
              ...contextMessages,
              ...preloadedContextMessages,
              ...optimizedHistory,
              new HumanMessage(message),
            ],
          },
          {
            configurable: { userId },
          }
        ),
        LLM_TIMEOUT_MS,
        'LLM agent invocation'
      ) as { messages: BaseMessage[] };

      // Extract the response - last message should be the AI response
      // PRODUCTION FIX: Add null check for empty response
      if (!result.messages || result.messages.length === 0) {
        return 'Sorry, I received an empty response. Please try again.';
      }
      const lastMessage = result.messages[result.messages.length - 1];
      const responseText = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      // Save messages to database (includes Conversation record creation)
      await this.saveMessage(sessionId, 'user', message, userId);
      await this.saveMessage(sessionId, 'assistant', responseText, userId);

      // Invalidate summary cache since we added new messages
      this.invalidateSummaryCache(sessionId);

      // Update full history cache (not the optimized one)
      fullHistory.push(new HumanMessage(message));
      fullHistory.push(new AIMessage(responseText));

      // Keep only last MAX_HISTORY_MESSAGES in cache
      if (fullHistory.length > MAX_HISTORY_MESSAGES) {
        fullHistory = fullHistory.slice(-MAX_HISTORY_MESSAGES);
      }
      // PRODUCTION FIX: Enforce cache limit before adding new entry
      enforceCacheLimit();
      conversationCache.set(sessionId, { data: fullHistory, timestamp: Date.now() });

      // Extract and store memories asynchronously (don't block response)
      if (userId && memoryService.isReady()) {
        this.extractAndStoreMemories(userId, sessionId, message, responseText).catch((err) => {
          console.warn('Memory extraction failed:', err);
        });
      }

      // Record success for circuit breaker
      recordSuccess();

      // Track token usage (estimate based on response length)
      const estimatedInputTokens = Math.ceil(message.length / 4);
      const estimatedOutputTokens = Math.ceil(responseText.length / 4);
      trackTokenUsage(estimatedInputTokens, estimatedOutputTokens);

      // Log successful completion
      const duration = Date.now() - startTime;
      structuredLog('info', 'chat_completed', {
        sessionId,
        userId,
        duration,
        responseLength: responseText.length,
        metadata: { estimatedTokens: estimatedInputTokens + estimatedOutputTokens },
      });

      return responseText;
    } catch (error) {
      // Record failure for circuit breaker
      recordFailure();

      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timed out');

      structuredLog('error', 'chat_failed', {
        sessionId,
        userId,
        duration,
        error: errorMessage,
        metadata: { isTimeout },
      });

      return isTimeout
        ? 'Sorry, the request took too long. Please try a simpler query or try again later.'
        : `Sorry, I encountered an error. Please try again.`;
    } finally {
      // Always release the lock and request slot
      releaseLock();
      releaseSlot();
    }
  }

  /**
   * Extract and store memories from a conversation exchange
   */
  private async extractAndStoreMemories(
    userId: string,
    sessionId: string,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    try {
      const memories = await memoryService.extractMemoriesFromConversation(userId, sessionId, [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantResponse },
      ]);

      if (memories.length > 0) {
        await memoryService.storeMemories(memories);
        console.log(`Stored ${memories.length} memories for user ${userId}`);
      }
    } catch (error) {
      console.error('Error extracting memories:', error);
    }
  }

  /**
   * Stream chat response using async generator
   * Compatible with Vercel AI SDK format
   * Includes tool visibility events
   * Uses optimized history with automatic summarization for long conversations
   * Includes long-term memory context when userId is provided
   */
  async *chatStream(
    sessionId: string,
    message: string,
    includeToolEvents: boolean = true,
    userId?: string,
    userName?: string
  ): AsyncGenerator<string, void, unknown> {
    const startTime = Date.now();

    if (!this.agent) {
      yield 'Agent not initialized. Please set OPENROUTER_API_KEY or OPENAI_API_KEY environment variable.';
      return;
    }

    // Check circuit breaker
    if (isCircuitOpen()) {
      structuredLog('warn', 'stream_circuit_breaker_rejected', { sessionId, userId });
      yield 'The AI service is temporarily unavailable. Please try again in a minute.';
      return;
    }

    // Check token limit
    if (isTokenLimitExceeded()) {
      structuredLog('warn', 'stream_token_limit_exceeded', { sessionId, userId });
      yield 'Daily usage limit reached. Please try again tomorrow.';
      return;
    }

    // Try to acquire request slot
    const releaseSlot = tryAcquireRequestSlot(sessionId);
    if (!releaseSlot) {
      structuredLog('warn', 'stream_concurrent_request_rejected', { sessionId, userId });
      yield 'You already have an active request. Please wait for it to complete.';
      return;
    }

    // Acquire cache lock to prevent race conditions
    const releaseLock = await acquireCacheLock(sessionId);

    try {
      structuredLog('info', 'stream_started', { sessionId, userId, messageLength: message.length });

      // Load optimized conversation history (with summarization for long conversations)
      const optimizedHistory = await this.getOptimizedHistory(sessionId);

      // Fetch relevant memories if userId is provided
      let memoryContext: BaseMessage[] = [];
      if (userId && memoryService.isReady()) {
        try {
          const relevantContext = await memoryService.getRelevantContext(userId, message);
          if (relevantContext) {
            memoryContext = [new SystemMessage(relevantContext)];
          }
        } catch (error) {
          console.warn('Failed to fetch memory context:', error);
        }
      }

      // Get full history for cache update
      const cachedEntry = conversationCache.get(sessionId);
      let fullHistory = cachedEntry?.data || [];

      // Save user message immediately (includes Conversation record creation)
      await this.saveMessage(sessionId, 'user', message, userId);

      let fullResponse = '';
      const activeTools: Set<string> = new Set();

      // Tool name to friendly description mapping
      const toolDescriptions: Record<string, string> = {
        search_properties: 'Searching properties...',
        get_property_details: 'Getting property details...',
        get_property_count: 'Counting properties...',
        get_recent_deals: 'Fetching recent deals...',
        find_similar_properties: 'Finding similar properties...',
        compare_deals: 'Comparing deals...',
        get_top_deals: 'Getting top deals...',
        get_current_context: 'Checking current context...',
        create_property: 'Creating property...',
        create_property_with_contact: 'Creating property with contact...',
        create_property_with_contacts: 'Creating property with contacts...',
        create_and_attach_contact: 'Attaching contact to property...',
        get_deal_status: 'Getting deal status...',
        import_from_url: 'Importing from URL...',
        analyze_deal: 'Analyzing deal...',
        score_deal_against_buyboxes: 'Scoring against buy boxes...',
        list_buyboxes: 'Loading buy boxes...',
        create_buybox: 'Creating buy box...',
        list_auction_sites: 'Loading auction sites...',
        submit_property_to_site: 'Submitting to auction site...',
        get_market_stats: 'Fetching market stats...',
        scrape_website: 'Scraping website...',
        map_website: 'Mapping website...',
        send_deal_to_fund: 'Sending to fund...',
        send_property_report: 'Sending property report...',
        search_knowledge: 'Searching knowledge base...',
        get_property_valuation: 'Getting property valuation...',
        get_skip_trace: 'Running skip trace...',
        get_comparable_homes: 'Finding comparable homes...',
        get_rental_trends: 'Getting rental trends...',
        schedule_reminder: 'Scheduling reminder...',
        schedule_report: 'Scheduling report...',
        schedule_action: 'Scheduling action...',
        list_scheduled_tasks: 'Listing scheduled tasks...',
        cancel_scheduled_task: 'Cancelling scheduled task...',
        reschedule_task: 'Rescheduling task...',
        // Compliance tools
        list_compliance_rules: 'Loading compliance rules...',
        list_compliance_disclosures: 'Loading disclosure requirements...',
        get_compliance_summary: 'Getting compliance summary...',
        add_compliance_rule: 'Adding compliance rule...',
        add_compliance_disclosure: 'Adding disclosure requirement...',
        update_compliance_rule: 'Updating compliance rule...',
        toggle_compliance_rule: 'Toggling compliance rule...',
        clone_state_compliance: 'Cloning state compliance spec...',
        suggest_compliance_rules: 'Getting rule suggestions...',
        compliance_natural_language: 'Processing compliance command...',
      };

      // Build user context message if userName is provided
      let userContextMessages: BaseMessage[] = [];
      console.log('[AgentService.chatStream] userName received:', userName);
      if (userName) {
        const userNameMessage = `IMPORTANT: You are currently speaking with ${userName}. This is their logged-in account name - you know their name is ${userName}. Greet them by name and use their name naturally in conversation.`;
        console.log('[AgentService.chatStream] Adding user context message:', userNameMessage);
        userContextMessages = [new SystemMessage(userNameMessage)];
      }

      // Stream the agent response with memory context and optimized history
      // Set current userId for tools to access
      this.currentUserId = userId || null;
      this.currentSessionId = sessionId;
      const stream = await this.agent.streamEvents(
        { messages: [...userContextMessages, ...memoryContext, ...optimizedHistory, new HumanMessage(message)] },
        { version: 'v2', configurable: { userId } }
      );

      for await (const event of stream) {
        // Handle tool start events
        if (event.event === 'on_tool_start' && includeToolEvents) {
          const toolName = event.name || 'unknown_tool';
          if (!activeTools.has(toolName)) {
            activeTools.add(toolName);
            const description = toolDescriptions[toolName] || `Running ${toolName}...`;
            // PRODUCTION FIX: Sanitize tool names to prevent JSON injection
            const safeToolName = sanitizeForJson(toolName);
            const safeDescription = sanitizeForJson(description);
            yield `\n{"type":"tool_start","tool":"${safeToolName}","message":"${safeDescription}"}\n`;
          }
        }

        // Handle tool end events
        if (event.event === 'on_tool_end' && includeToolEvents) {
          const toolName = event.name || 'unknown_tool';
          if (activeTools.has(toolName)) {
            activeTools.delete(toolName);
            // PRODUCTION FIX: Sanitize tool names to prevent JSON injection
            const safeToolName = sanitizeForJson(toolName);
            yield `\n{"type":"tool_end","tool":"${safeToolName}"}\n`;
          }
        }

        // Handle chat model stream (actual response text)
        if (event.event === 'on_chat_model_stream') {
          const chunk = event.data?.chunk;
          if (chunk?.content) {
            const text = typeof chunk.content === 'string'
              ? chunk.content
              : chunk.content[0]?.text || '';
            if (text) {
              fullResponse += text;
              yield text;
            }
          }
        }
      }

      // Save the complete response (includes Conversation record update)
      if (fullResponse) {
        await this.saveMessage(sessionId, 'assistant', fullResponse, userId);

        // Invalidate summary cache since we added new messages
        this.invalidateSummaryCache(sessionId);

        // Update full history cache (not the optimized one)
        fullHistory.push(new HumanMessage(message));
        fullHistory.push(new AIMessage(fullResponse));

        // Keep only last MAX_HISTORY_MESSAGES in cache
        if (fullHistory.length > MAX_HISTORY_MESSAGES) {
          fullHistory = fullHistory.slice(-MAX_HISTORY_MESSAGES);
        }
        // PRODUCTION FIX: Enforce cache limit before adding new entry
        enforceCacheLimit();
        conversationCache.set(sessionId, { data: fullHistory, timestamp: Date.now() });

        // Extract and store memories asynchronously (don't block response)
        if (userId && memoryService.isReady()) {
          this.extractAndStoreMemories(userId, sessionId, message, fullResponse).catch((err) => {
            console.warn('Memory extraction failed:', err);
          });
        }

        // Record success for circuit breaker
        recordSuccess();

        // Track token usage (estimate based on response length)
        const estimatedInputTokens = Math.ceil(message.length / 4);
        const estimatedOutputTokens = Math.ceil(fullResponse.length / 4);
        trackTokenUsage(estimatedInputTokens, estimatedOutputTokens);

        // Log successful completion
        const duration = Date.now() - startTime;
        structuredLog('info', 'stream_completed', {
          sessionId,
          userId,
          duration,
          responseLength: fullResponse.length,
          metadata: { estimatedTokens: estimatedInputTokens + estimatedOutputTokens },
        });
      }
    } catch (error) {
      // Record failure for circuit breaker
      recordFailure();

      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      structuredLog('error', 'stream_failed', {
        sessionId,
        userId,
        duration,
        error: errorMessage,
      });

      yield 'Sorry, I encountered an error. Please try again.';
    } finally {
      // Always release the lock and request slot
      releaseLock();
      releaseSlot();
    }
  }

  /**
   * Clear conversation history for a session (all cache layers and database)
   */
  async clearHistory(sessionId: string): Promise<void> {
    // Clear L1 cache
    conversationCache.delete(sessionId);
    this.invalidateSummaryCache(sessionId);

    // Clear L2 cache (Redis)
    redisService.del(`${CACHE_PREFIX.CONVERSATION}${sessionId}`)
      .catch((err) => console.warn('Redis cache clear error:', err.message));

    // Clear L3 (database)
    try {
      await ConversationHistory.destroy({
        where: { sessionId },
      });
    } catch (error) {
      console.warn('Could not clear conversation history from database:', error);
    }
  }

  /**
   * Get conversation history for a session
   */
  async getHistory(sessionId: string): Promise<{ role: string; content: string; createdAt: Date }[]> {
    try {
      const records = await ConversationHistory.findAll({
        where: { sessionId },
        order: [['createdAt', 'ASC']],
        attributes: ['role', 'content', 'createdAt'],
        limit: MAX_HISTORY_MESSAGES,
      });
      return records.map((r) => ({
        role: r.role,
        content: r.content,
        createdAt: r.createdAt,
      }));
    } catch (error) {
      console.warn('Could not get conversation history:', error);
      return [];
    }
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<string[]> {
    try {
      const sessions = await ConversationHistory.findAll({
        attributes: [[fn('DISTINCT', col('session_id')), 'sessionId']],
        raw: true,
      });
      return sessions.map((s: any) => s.sessionId);
    } catch (error) {
      console.warn('Could not get active sessions:', error);
      return Array.from(conversationCache.keys());
    }
  }

  /**
   * Check if agent is ready
   */
  isReady(): boolean {
    return this.agent !== null;
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return 36; // 20 core + 2 knowledge + 4 market data + 7 CRUD tools + 3 workflow tools
  }

  /**
   * Get comprehensive health status for monitoring
   * Includes circuit breaker, request stats, token usage, and cache metrics
   */
  getHealthStatus(): {
    ready: boolean;
    circuitBreaker: { state: string; failures: number; lastFailure: Date | null };
    requests: { global: number; sessions: number; maxGlobal: number };
    tokenUsage: { date: string; inputTokens: number; outputTokens: number; totalCost: number; remaining: number; percentUsed: number };
    cache: { conversations: number; summaries: number; maxSize: number };
  } {
    return {
      ready: this.isReady(),
      circuitBreaker: getCircuitBreakerStatus(),
      requests: getRequestStats(),
      tokenUsage: getTokenUsageStats(),
      cache: {
        conversations: conversationCache.size,
        summaries: summaryCache.size,
        maxSize: MAX_CACHE_SIZE,
      },
    };
  }

  /**
   * Reset all internal caches (for testing purposes)
   */
  resetCaches(): void {
    conversationCache.clear();
    summaryCache.clear();
  }

  /**
   * Manually reset circuit breaker (for emergency recovery)
   */
  resetCircuitBreaker(): void {
    circuitBreaker.state = 'closed';
    circuitBreaker.failures = 0;
    circuitBreaker.halfOpenSuccesses = 0;
    structuredLog('info', 'circuit_breaker_manual_reset', {});
  }
}

export const agentService = new AgentService();

// Export cleanup function for graceful shutdown
export { stopCacheCleanup };

export default agentService;
