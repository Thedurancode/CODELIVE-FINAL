/**
 * Resilience Layer for Browser Automation
 *
 * Provides retry logic, circuit breaker, and failure handling
 * for robust browser automation operations.
 */

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  retryableErrors: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailure: Date | null;
  halfOpenAttempts: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
  retryableErrors: [
    'timeout',
    'navigation',
    'net::',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'socket hang up',
    'Target closed',
    'Session closed',
    'frame was detached',
    'Execution context was destroyed',
  ],
};

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 300000, // 5 minutes
  halfOpenMaxAttempts: 3,
};

export class ResilienceLayer {
  private circuits: Map<string, CircuitBreakerState> = new Map();
  private retryConfig: RetryConfig;
  private circuitConfig: CircuitBreakerConfig;

  constructor(
    retryConfig: Partial<RetryConfig> = {},
    circuitConfig: Partial<CircuitBreakerConfig> = {}
  ) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.circuitConfig = { ...DEFAULT_CIRCUIT_CONFIG, ...circuitConfig };
  }

  // ============================================================================
  // RETRY LOGIC
  // ============================================================================

  /**
   * Execute an operation with retry logic
   */
  async withRetry<T>(
    operationId: string,
    operation: () => Promise<T>,
    options: {
      onRetry?: (attempt: number, error: Error, delayMs: number) => void;
      isRetryable?: (error: Error) => boolean;
      customConfig?: Partial<RetryConfig>;
    } = {}
  ): Promise<T> {
    const config = { ...this.retryConfig, ...options.customConfig };
    const isRetryable = options.isRetryable || ((error) => this.isRetryableError(error, config));

    // Check circuit breaker first
    this.checkCircuit(operationId);

    let lastError: Error | null = null;
    let delay = config.backoffMs;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        this.recordSuccess(operationId);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        console.log(
          `⚠️ [${operationId}] Attempt ${attempt}/${config.maxAttempts} failed: ${lastError.message}`
        );

        // Don't retry if not retryable or last attempt
        if (!isRetryable(lastError)) {
          console.log(`❌ [${operationId}] Error is not retryable`);
          this.recordFailure(operationId);
          throw lastError;
        }

        if (attempt === config.maxAttempts) {
          console.log(`❌ [${operationId}] Max attempts reached`);
          this.recordFailure(operationId);
          throw lastError;
        }

        // Calculate delay with jitter
        const jitter = Math.random() * 0.3 * delay;
        const actualDelay = Math.min(delay + jitter, config.maxBackoffMs);

        if (options.onRetry) {
          options.onRetry(attempt, lastError, actualDelay);
        }

        console.log(`🔄 [${operationId}] Retrying in ${Math.round(actualDelay)}ms...`);
        await this.sleep(actualDelay);

        // Exponential backoff
        delay = Math.min(delay * config.backoffMultiplier, config.maxBackoffMs);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error('Unknown error in retry logic');
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error, config: RetryConfig): boolean {
    const message = error.message.toLowerCase();
    return config.retryableErrors.some((pattern) => message.includes(pattern.toLowerCase()));
  }

  // ============================================================================
  // CIRCUIT BREAKER
  // ============================================================================

  /**
   * Get or create circuit breaker state
   */
  private getCircuit(operationId: string): CircuitBreakerState {
    if (!this.circuits.has(operationId)) {
      this.circuits.set(operationId, {
        state: 'closed',
        failures: 0,
        lastFailure: null,
        halfOpenAttempts: 0,
      });
    }
    return this.circuits.get(operationId)!;
  }

  /**
   * Check circuit breaker state before operation
   */
  private checkCircuit(operationId: string): void {
    const circuit = this.getCircuit(operationId);

    switch (circuit.state) {
      case 'open':
        // Check if reset timeout has passed
        if (circuit.lastFailure) {
          const elapsed = Date.now() - circuit.lastFailure.getTime();
          if (elapsed >= this.circuitConfig.resetTimeoutMs) {
            console.log(`🔄 [${operationId}] Circuit transitioning to half-open`);
            circuit.state = 'half-open';
            circuit.halfOpenAttempts = 0;
          } else {
            const remaining = Math.ceil((this.circuitConfig.resetTimeoutMs - elapsed) / 1000);
            throw new Error(
              `Circuit breaker open for ${operationId}. Retry in ${remaining}s`
            );
          }
        }
        break;

      case 'half-open':
        if (circuit.halfOpenAttempts >= this.circuitConfig.halfOpenMaxAttempts) {
          throw new Error(`Circuit breaker half-open limit reached for ${operationId}`);
        }
        circuit.halfOpenAttempts++;
        break;

      case 'closed':
        // Normal operation
        break;
    }
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(operationId: string): void {
    const circuit = this.getCircuit(operationId);

    if (circuit.state === 'half-open') {
      console.log(`✅ [${operationId}] Circuit closing after successful half-open attempt`);
    }

    circuit.state = 'closed';
    circuit.failures = 0;
    circuit.halfOpenAttempts = 0;
  }

  /**
   * Record a failed operation
   */
  private recordFailure(operationId: string): void {
    const circuit = this.getCircuit(operationId);
    circuit.failures++;
    circuit.lastFailure = new Date();

    if (circuit.state === 'half-open') {
      console.log(`🔴 [${operationId}] Circuit opening after half-open failure`);
      circuit.state = 'open';
      return;
    }

    if (circuit.failures >= this.circuitConfig.failureThreshold) {
      console.log(
        `🔴 [${operationId}] Circuit breaker opened after ${circuit.failures} failures`
      );
      circuit.state = 'open';
    }
  }

  /**
   * Get circuit state for monitoring
   */
  getCircuitState(operationId: string): CircuitBreakerState {
    return { ...this.getCircuit(operationId) };
  }

  /**
   * Get all circuit states
   */
  getAllCircuitStates(): Map<string, CircuitBreakerState> {
    const states = new Map<string, CircuitBreakerState>();
    for (const [id, state] of this.circuits) {
      states.set(id, { ...state });
    }
    return states;
  }

  /**
   * Reset a specific circuit
   */
  resetCircuit(operationId: string): void {
    this.circuits.delete(operationId);
    console.log(`🔄 [${operationId}] Circuit reset`);
  }

  /**
   * Reset all circuits
   */
  resetAllCircuits(): void {
    this.circuits.clear();
    console.log('🔄 All circuits reset');
  }

  /**
   * Force open a circuit (for maintenance)
   */
  forceOpen(operationId: string): void {
    const circuit = this.getCircuit(operationId);
    circuit.state = 'open';
    circuit.lastFailure = new Date();
    console.log(`🔴 [${operationId}] Circuit force opened`);
  }

  /**
   * Force close a circuit
   */
  forceClose(operationId: string): void {
    const circuit = this.getCircuit(operationId);
    circuit.state = 'closed';
    circuit.failures = 0;
    console.log(`🟢 [${operationId}] Circuit force closed`);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const resilienceLayer = new ResilienceLayer();
export default resilienceLayer;
