/**
 * Retry Utilities with Exponential Backoff
 *
 * Implements intelligent retry delays to prevent overwhelming servers during outages.
 * Uses exponential backoff with jitter to spread retry attempts.
 */

export interface RetryConfig {
  /** Initial delay in milliseconds (default: 1000) */
  baseDelay: number;
  /** Maximum delay cap in milliseconds (default: 60000) */
  maxDelay: number;
  /** Maximum number of retry attempts (default: 5) */
  maxRetries: number;
  /** Random jitter factor 0-1, e.g., 0.3 for +/- 30% (default: 0.3) */
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  baseDelay: 1000, // 1 second
  maxDelay: 60000, // 1 minute
  maxRetries: 5,
  jitterFactor: 0.3,
};

/**
 * Calculate the delay before the next retry attempt using exponential backoff.
 *
 * Formula: min(baseDelay * 2^retryCount, maxDelay) +/- jitter
 *
 * Example delays with default config (approximate):
 * - Retry 0: ~1s (1000ms)
 * - Retry 1: ~2s (2000ms)
 * - Retry 2: ~4s (4000ms)
 * - Retry 3: ~8s (8000ms)
 * - Retry 4: ~16s (16000ms)
 * - Retry 5+: ~60s (capped at maxDelay)
 *
 * @param retryCount - Number of retries already attempted (0-indexed)
 * @param config - Optional retry configuration
 * @returns Delay in milliseconds before next retry
 */
export function calculateBackoffDelay(
  retryCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Exponential: baseDelay * 2^retryCount
  const exponentialDelay = config.baseDelay * Math.pow(2, retryCount);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);

  // Add jitter: +/- jitterFactor% to prevent thundering herd
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitter = jitterRange * (Math.random() * 2 - 1);

  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Check if another retry should be attempted based on retry count.
 *
 * @param retryCount - Number of retries already attempted
 * @param config - Optional retry configuration
 * @returns True if retry should be attempted, false if max retries exceeded
 */
export function shouldRetry(
  retryCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  return retryCount < config.maxRetries;
}

/**
 * Format a delay in milliseconds as a human-readable string.
 *
 * @param delayMs - Delay in milliseconds
 * @returns Human-readable string (e.g., "5s", "1m 30s")
 */
export function formatDelay(delayMs: number): string {
  const seconds = Math.round(delayMs / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Create a promise that resolves after the specified delay.
 * Useful for implementing delays in async retry loops.
 *
 * @param delayMs - Delay in milliseconds
 * @returns Promise that resolves after the delay
 */
export function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Categorize an error to determine if it's retryable.
 *
 * @param error - The error to categorize
 * @returns Object with isRetryable flag and error category
 */
export function categorizeError(error: unknown): {
  isRetryable: boolean;
  category: 'network' | 'server' | 'client' | 'unknown';
  message: string;
} {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors - always retryable
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return { isRetryable: true, category: 'network', message: error.message };
    }

    // Check for HTTP status codes in error
    const statusMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);

      // 5xx server errors - retryable
      if (status >= 500) {
        return { isRetryable: true, category: 'server', message: error.message };
      }

      // 429 Too Many Requests - retryable with backoff
      if (status === 429) {
        return { isRetryable: true, category: 'server', message: error.message };
      }

      // 4xx client errors - not retryable (except 429)
      return { isRetryable: false, category: 'client', message: error.message };
    }

    return { isRetryable: true, category: 'unknown', message: error.message };
  }

  return {
    isRetryable: true,
    category: 'unknown',
    message: String(error),
  };
}
