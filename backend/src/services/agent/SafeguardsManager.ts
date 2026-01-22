/**
 * Safeguards Manager
 *
 * Production safeguards for the AI agent including:
 * - Circuit breaker to prevent cascading failures
 * - Concurrent request limiting
 * - Token usage tracking and budget enforcement
 * - Request timeout wrapper
 */

import { logger } from '../LoggerService';
import type {
  CircuitBreakerState,
  TokenUsage,
  SafeguardStatus,
  CacheEntry,
} from './types';
import {
  SAFEGUARD_SETTINGS,
  TOKEN_COSTS,
  CACHE_SETTINGS,
} from './types';

const {
  LLM_TIMEOUT_MS,
  CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_MS,
  CIRCUIT_BREAKER_HALF_OPEN_REQUESTS,
  MAX_CONCURRENT_REQUESTS_PER_SESSION,
  MAX_GLOBAL_CONCURRENT_REQUESTS,
  DAILY_TOKEN_LIMIT,
} = SAFEGUARD_SETTINGS;

/**
 * Manages production safeguards for the AI agent
 */
class SafeguardsManager {
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    state: 'closed',
    halfOpenSuccesses: 0,
  };

  private activeRequests: Map<string, number> = new Map();
  private globalActiveRequests = 0;

  private tokenUsage: TokenUsage = {
    date: new Date().toISOString().split('T')[0],
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
  };

  // Cache references for status reporting
  private conversationCacheRef: Map<string, CacheEntry<any>> | null = null;
  private summaryCacheRef: Map<string, CacheEntry<any>> | null = null;

  private log = logger.child({ service: 'safeguards' });

  // =============================================================================
  // CIRCUIT BREAKER
  // =============================================================================

  /**
   * Check if circuit breaker is preventing requests
   */
  isCircuitOpen(): boolean {
    const now = Date.now();

    if (this.circuitBreaker.state === 'closed') {
      return false;
    }

    if (this.circuitBreaker.state === 'open') {
      // Check if we should transition to half-open
      if (now - this.circuitBreaker.lastFailure >= CIRCUIT_BREAKER_RESET_MS) {
        this.circuitBreaker.state = 'half-open';
        this.circuitBreaker.halfOpenSuccesses = 0;
        this.log.info('Circuit breaker transitioning to half-open');
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
  recordSuccess(): void {
    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.halfOpenSuccesses++;
      if (this.circuitBreaker.halfOpenSuccesses >= CIRCUIT_BREAKER_HALF_OPEN_REQUESTS) {
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failures = 0;
        this.log.info('Circuit breaker closed (recovered)');
      }
    } else if (this.circuitBreaker.state === 'closed') {
      // Reset failure count on success
      this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
    }
  }

  /**
   * Record a failed LLM call
   */
  recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.state = 'open';
      this.log.warn('Circuit breaker re-opened after half-open failure');
    } else if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.state = 'open';
      this.log.warn('Circuit breaker opened', { failures: this.circuitBreaker.failures });
    }
  }

  /**
   * Manually reset the circuit breaker (emergency recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      state: 'closed',
      halfOpenSuccesses: 0,
    };
    this.log.info('Circuit breaker manually reset');
  }

  // =============================================================================
  // CONCURRENT REQUEST LIMITING
  // =============================================================================

  /**
   * Try to acquire a request slot for a session
   * @returns release function if acquired, null if rejected
   */
  tryAcquireRequestSlot(sessionId: string): (() => void) | null {
    // Check global limit
    if (this.globalActiveRequests >= MAX_GLOBAL_CONCURRENT_REQUESTS) {
      this.log.warn('Request rejected: global limit reached', {
        global: this.globalActiveRequests,
        max: MAX_GLOBAL_CONCURRENT_REQUESTS,
      });
      return null;
    }

    // Check per-session limit
    const sessionCount = this.activeRequests.get(sessionId) || 0;
    if (sessionCount >= MAX_CONCURRENT_REQUESTS_PER_SESSION) {
      this.log.warn('Request rejected: session has active request', { sessionId });
      return null;
    }

    // Acquire slot
    this.activeRequests.set(sessionId, sessionCount + 1);
    this.globalActiveRequests++;

    // Return release function
    return () => {
      const count = this.activeRequests.get(sessionId) || 1;
      if (count <= 1) {
        this.activeRequests.delete(sessionId);
      } else {
        this.activeRequests.set(sessionId, count - 1);
      }
      this.globalActiveRequests--;
    };
  }

  // =============================================================================
  // TOKEN USAGE TRACKING
  // =============================================================================

  /**
   * Track token usage from an LLM response
   */
  trackTokenUsage(inputTokens: number, outputTokens: number): void {
    const today = new Date().toISOString().split('T')[0];

    // Reset if new day
    if (this.tokenUsage.date !== today) {
      this.log.info('Token usage reset for new day', {
        previousTotal: this.tokenUsage.inputTokens + this.tokenUsage.outputTokens,
        previousCost: this.tokenUsage.totalCost.toFixed(2),
      });
      this.tokenUsage = {
        date: today,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
      };
    }

    this.tokenUsage.inputTokens += inputTokens;
    this.tokenUsage.outputTokens += outputTokens;
    this.tokenUsage.totalCost +=
      (inputTokens / 1000) * TOKEN_COSTS.INPUT_PER_1K +
      (outputTokens / 1000) * TOKEN_COSTS.OUTPUT_PER_1K;
  }

  /**
   * Check if daily token limit is exceeded
   */
  isTokenLimitExceeded(): boolean {
    const today = new Date().toISOString().split('T')[0];
    if (this.tokenUsage.date !== today) {
      return false; // New day, reset
    }
    return this.tokenUsage.inputTokens + this.tokenUsage.outputTokens >= DAILY_TOKEN_LIMIT;
  }

  // =============================================================================
  // TIMEOUT WRAPPER
  // =============================================================================

  /**
   * Wraps a promise with a timeout
   * @throws Error if the promise doesn't resolve within the timeout
   */
  async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = LLM_TIMEOUT_MS,
    operation: string = 'Operation'
  ): Promise<T> {
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

  // =============================================================================
  // CACHE MANAGEMENT (References)
  // =============================================================================

  /**
   * Set cache references for status reporting
   */
  setCacheReferences(
    conversationCache: Map<string, CacheEntry<any>>,
    summaryCache: Map<string, CacheEntry<any>>
  ): void {
    this.conversationCacheRef = conversationCache;
    this.summaryCacheRef = summaryCache;
  }

  // =============================================================================
  // STATUS & MONITORING
  // =============================================================================

  /**
   * Get complete safeguard status for health checks
   */
  getStatus(): SafeguardStatus {
    const total = this.tokenUsage.inputTokens + this.tokenUsage.outputTokens;

    return {
      circuitBreaker: {
        state: this.circuitBreaker.state,
        failures: this.circuitBreaker.failures,
        lastFailure: this.circuitBreaker.lastFailure
          ? new Date(this.circuitBreaker.lastFailure)
          : null,
      },
      requests: {
        global: this.globalActiveRequests,
        sessions: this.activeRequests.size,
        maxGlobal: MAX_GLOBAL_CONCURRENT_REQUESTS,
      },
      tokenUsage: {
        ...this.tokenUsage,
        remaining: Math.max(0, DAILY_TOKEN_LIMIT - total),
        percentUsed: Math.min(100, (total / DAILY_TOKEN_LIMIT) * 100),
      },
      cache: {
        conversations: this.conversationCacheRef?.size ?? 0,
        summaries: this.summaryCacheRef?.size ?? 0,
        maxSize: CACHE_SETTINGS.MAX_CACHE_SIZE,
      },
    };
  }

  /**
   * Get overall health status string
   */
  getHealthStatus(): 'healthy' | 'degraded' | 'recovering' | 'warning' {
    if (this.circuitBreaker.state === 'open') {
      return 'degraded';
    }
    if (this.circuitBreaker.state === 'half-open') {
      return 'recovering';
    }

    const total = this.tokenUsage.inputTokens + this.tokenUsage.outputTokens;
    const percentUsed = (total / DAILY_TOKEN_LIMIT) * 100;

    if (percentUsed > 90) {
      return 'warning';
    }

    return 'healthy';
  }
}

// Export singleton instance
export const safeguardsManager = new SafeguardsManager();
export default safeguardsManager;
