/**
 * ResilienceLayer Unit Tests
 */

import {
  ResilienceLayer,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_CONFIG,
} from '../../plugins/browser/ResilienceLayer';

describe('ResilienceLayer', () => {
  let resilience: ResilienceLayer;

  beforeEach(() => {
    jest.clearAllMocks();
    // Use fast backoff for tests
    resilience = new ResilienceLayer(
      { maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2, maxBackoffMs: 100 },
      { failureThreshold: 3, resetTimeoutMs: 100, halfOpenMaxAttempts: 2 }
    );
  });

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  describe('Constructor', () => {
    it('should use default config when not provided', () => {
      const r = new ResilienceLayer();
      expect(r).toBeDefined();
    });

    it('should merge provided config with defaults', () => {
      const r = new ResilienceLayer({ maxAttempts: 5 }, { failureThreshold: 10 });
      expect(r).toBeDefined();
    });
  });

  // ============================================================================
  // RETRY LOGIC
  // ============================================================================

  describe('Retry Logic', () => {
    describe('withRetry', () => {
      it('should succeed on first attempt', async () => {
        const operation = jest.fn().mockResolvedValue('success');

        const result = await resilience.withRetry('test-op', operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should retry on retryable error', async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValueOnce('success');

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const result = await resilience.withRetry('test-op', operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);

        consoleSpy.mockRestore();
      });

      it('should not retry on non-retryable error', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('invalid data'));

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await expect(resilience.withRetry('test-op', operation)).rejects.toThrow('invalid data');

        expect(operation).toHaveBeenCalledTimes(1);

        consoleSpy.mockRestore();
      });

      it('should fail after max attempts', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('timeout'));

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await expect(resilience.withRetry('test-op', operation)).rejects.toThrow('timeout');

        expect(operation).toHaveBeenCalledTimes(3); // maxAttempts = 3

        consoleSpy.mockRestore();
      });

      it('should call onRetry callback', async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValueOnce('success');

        const onRetry = jest.fn();
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await resilience.withRetry('test-op', operation, { onRetry });

        expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));

        consoleSpy.mockRestore();
      });

      it('should use custom isRetryable function', async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('custom error'))
          .mockResolvedValueOnce('success');

        const isRetryable = jest.fn().mockReturnValue(true);
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await resilience.withRetry('test-op', operation, { isRetryable });

        expect(isRetryable).toHaveBeenCalled();
        expect(operation).toHaveBeenCalledTimes(2);

        consoleSpy.mockRestore();
      });

      it('should apply exponential backoff', async () => {
        const r = new ResilienceLayer(
          { maxAttempts: 3, backoffMs: 50, backoffMultiplier: 2, maxBackoffMs: 1000 }
        );

        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('timeout'))
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValueOnce('success');

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        const start = Date.now();

        await r.withRetry('test-op', operation);

        const elapsed = Date.now() - start;
        // Should have waited ~50ms + ~100ms (with jitter)
        expect(elapsed).toBeGreaterThanOrEqual(100);

        consoleSpy.mockRestore();
      });

      it('should respect maxBackoffMs', async () => {
        const r = new ResilienceLayer(
          { maxAttempts: 4, backoffMs: 100, backoffMultiplier: 10, maxBackoffMs: 200 }
        );

        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('timeout'))
          .mockRejectedValueOnce(new Error('timeout'))
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValueOnce('success');

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        const start = Date.now();

        await r.withRetry('test-op', operation);

        const elapsed = Date.now() - start;
        // Third delay should be capped at 200ms, not 1000ms
        expect(elapsed).toBeLessThan(1000);

        consoleSpy.mockRestore();
      });
    });

    describe('Retryable Errors', () => {
      it.each([
        ['timeout'],
        ['navigation failed'],
        ['net::ERR_FAILED'],
        ['ECONNRESET'],
        ['ETIMEDOUT'],
        ['socket hang up'],
        ['Target closed'],
        ['Session closed'],
        ['frame was detached'],
        ['Execution context was destroyed'],
      ])('should retry on "%s" error', async (errorMessage) => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error(errorMessage))
          .mockResolvedValueOnce('success');

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const result = await resilience.withRetry('test-op', operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);

        consoleSpy.mockRestore();
      });
    });
  });

  // ============================================================================
  // CIRCUIT BREAKER
  // ============================================================================

  describe('Circuit Breaker', () => {
    describe('Initial State', () => {
      it('should start in closed state', () => {
        const state = resilience.getCircuitState('new-op');
        expect(state.state).toBe('closed');
      });
    });

    describe('State Transitions', () => {
      it('should open after failure threshold', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('timeout'));

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // Trigger multiple failures
        for (let i = 0; i < 3; i++) {
          try {
            await resilience.withRetry('test-circuit', operation);
          } catch (e) {
            // Expected
          }
        }

        const state = resilience.getCircuitState('test-circuit');
        expect(state.state).toBe('open');

        consoleSpy.mockRestore();
      });

      it('should reject immediately when open', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('timeout'));

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // Open the circuit
        for (let i = 0; i < 3; i++) {
          try {
            await resilience.withRetry('test-circuit', operation);
          } catch (e) {
            // Expected
          }
        }

        // Should reject without calling operation
        operation.mockClear();

        await expect(resilience.withRetry('test-circuit', operation)).rejects.toThrow(
          'Circuit breaker open'
        );

        expect(operation).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('should transition to half-open after reset timeout', async () => {
        const r = new ResilienceLayer(
          { maxAttempts: 1, backoffMs: 10, backoffMultiplier: 2, maxBackoffMs: 100 },
          { failureThreshold: 2, resetTimeoutMs: 50, halfOpenMaxAttempts: 2 }
        );

        const operation = jest.fn().mockRejectedValue(new Error('timeout'));

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // Open the circuit
        for (let i = 0; i < 2; i++) {
          try {
            await r.withRetry('test-circuit', operation);
          } catch (e) {
            // Expected
          }
        }

        expect(r.getCircuitState('test-circuit').state).toBe('open');

        // Wait for reset timeout
        await new Promise((resolve) => setTimeout(resolve, 60));

        // Should now allow attempt (half-open)
        operation.mockClear();
        try {
          await r.withRetry('test-circuit', operation);
        } catch (e) {
          // Expected
        }

        // Operation should have been called (half-open allows attempts)
        expect(operation).toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('should close after successful half-open attempt', async () => {
        const r = new ResilienceLayer(
          { maxAttempts: 1, backoffMs: 10, backoffMultiplier: 2, maxBackoffMs: 100 },
          { failureThreshold: 2, resetTimeoutMs: 50, halfOpenMaxAttempts: 2 }
        );

        let shouldFail = true;
        const operation = jest.fn().mockImplementation(() => {
          if (shouldFail) {
            return Promise.reject(new Error('timeout'));
          }
          return Promise.resolve('success');
        });

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // Open the circuit
        for (let i = 0; i < 2; i++) {
          try {
            await r.withRetry('test-circuit', operation);
          } catch (e) {
            // Expected
          }
        }

        // Wait for reset timeout
        await new Promise((resolve) => setTimeout(resolve, 60));

        // Make next attempt succeed
        shouldFail = false;

        const result = await r.withRetry('test-circuit', operation);
        expect(result).toBe('success');

        const state = r.getCircuitState('test-circuit');
        expect(state.state).toBe('closed');

        consoleSpy.mockRestore();
      });
    });

    describe('Circuit Management', () => {
      it('should reset specific circuit', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('timeout'));

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // Open the circuit
        for (let i = 0; i < 3; i++) {
          try {
            await resilience.withRetry('test-circuit', operation);
          } catch (e) {
            // Expected
          }
        }

        resilience.resetCircuit('test-circuit');

        const state = resilience.getCircuitState('test-circuit');
        expect(state.state).toBe('closed');

        consoleSpy.mockRestore();
      });

      it('should reset all circuits', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('timeout'));

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // Open multiple circuits
        for (let i = 0; i < 3; i++) {
          try {
            await resilience.withRetry('circuit-1', operation);
          } catch (e) {}
          try {
            await resilience.withRetry('circuit-2', operation);
          } catch (e) {}
        }

        resilience.resetAllCircuits();

        const states = resilience.getAllCircuitStates();
        expect(states.size).toBe(0);

        consoleSpy.mockRestore();
      });

      it('should force open circuit', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        resilience.forceOpen('test-circuit');

        const state = resilience.getCircuitState('test-circuit');
        expect(state.state).toBe('open');

        consoleSpy.mockRestore();
      });

      it('should force close circuit', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('timeout'));

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // Open the circuit
        for (let i = 0; i < 3; i++) {
          try {
            await resilience.withRetry('test-circuit', operation);
          } catch (e) {}
        }

        resilience.forceClose('test-circuit');

        const state = resilience.getCircuitState('test-circuit');
        expect(state.state).toBe('closed');
        expect(state.failures).toBe(0);

        consoleSpy.mockRestore();
      });
    });

    describe('getAllCircuitStates', () => {
      it('should return all circuit states', async () => {
        const operation = jest.fn().mockResolvedValue('success');

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await resilience.withRetry('circuit-1', operation);
        await resilience.withRetry('circuit-2', operation);

        const states = resilience.getAllCircuitStates();

        expect(states.size).toBe(2);
        expect(states.has('circuit-1')).toBe(true);
        expect(states.has('circuit-2')).toBe(true);

        consoleSpy.mockRestore();
      });
    });
  });

  // ============================================================================
  // DEFAULT CONFIGS
  // ============================================================================

  describe('Default Configs', () => {
    it('should have sensible retry defaults', () => {
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.backoffMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.maxBackoffMs).toBe(30000);
    });

    it('should have sensible circuit breaker defaults', () => {
      expect(DEFAULT_CIRCUIT_CONFIG.failureThreshold).toBe(5);
      expect(DEFAULT_CIRCUIT_CONFIG.resetTimeoutMs).toBe(300000); // 5 minutes
      expect(DEFAULT_CIRCUIT_CONFIG.halfOpenMaxAttempts).toBe(3);
    });

    it('should have common retryable errors', () => {
      expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain('timeout');
      expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain('navigation');
      expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain('ECONNRESET');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle non-Error rejections', async () => {
      const operation = jest.fn().mockRejectedValue('string error');

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await expect(resilience.withRetry('test-op', operation)).rejects.toThrow();

      consoleSpy.mockRestore();
    });

    it('should handle concurrent operations on same circuit', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const results = await Promise.all([
        resilience.withRetry('shared-circuit', operation),
        resilience.withRetry('shared-circuit', operation),
        resilience.withRetry('shared-circuit', operation),
      ]);

      expect(results).toEqual(['success', 'success', 'success']);
    });

    it('should isolate different operation circuits', async () => {
      const failingOp = jest.fn().mockRejectedValue(new Error('timeout'));
      const successOp = jest.fn().mockResolvedValue('success');

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Fail circuit-1
      for (let i = 0; i < 3; i++) {
        try {
          await resilience.withRetry('circuit-1', failingOp);
        } catch (e) {}
      }

      // circuit-2 should still work
      const result = await resilience.withRetry('circuit-2', successOp);
      expect(result).toBe('success');

      consoleSpy.mockRestore();
    });
  });
});
