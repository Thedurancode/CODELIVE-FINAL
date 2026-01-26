/**
 * Compliance Trigger Service
 *
 * Real-time event-triggered compliance checks.
 * Replaces purely cron-based watchdog with event-driven triggers.
 */

import { EventEmitter } from 'events';
import { complianceService } from './ComplianceService';
import { complianceEventStream } from './ComplianceEventStream';
import { sanctionsScreeningService } from './SanctionsScreeningService';
import Property from '../models/Property';
import DeadLetterQueue from '../models/DeadLetterQueue';
import { circuitBreakerRegistry, CircuitBreakerOpenError } from '../utils/CircuitBreaker';

// Circuit breaker configuration
const CIRCUIT_CONFIG = {
  failureThreshold: 5,    // Open after 5 failures
  resetTimeout: 30000,    // Try again after 30 seconds
  successThreshold: 2,    // Need 2 successes to close
  callTimeout: 15000,     // 15 second timeout per call
};

// Dead letter configuration
const DEAD_LETTER_CONFIG = {
  maxAttempts: 10,        // Abandon after 10 attempts
  retryIntervalMs: 600000, // 10 minutes between auto-retries
};

export interface TriggerConfig {
  eventType: string;
  conditions?: Record<string, any>;
  checkType: 'full' | 'quick' | 'sanctions' | 'specific';
  priority: 'immediate' | 'queued' | 'low';
  rateLimit?: { maxPerMinute: number };
  enabled: boolean;
}

interface QueuedCheck {
  propertyId: number;
  checkType: string;
  priority: number;
  queuedAt: Date;
  eventType: string;
  data?: Record<string, any>;
}

class ComplianceTriggerService extends EventEmitter {
  private triggers: Map<string, TriggerConfig> = new Map();
  private processingQueue: QueuedCheck[] = [];
  private rateLimits: Map<string, number[]> = new Map();
  private processing = false;
  private initialized = false;
  private retryTaskId: NodeJS.Timeout | null = null;

  // Circuit breakers for external services
  private complianceCircuit = circuitBreakerRegistry.get('compliance-service', CIRCUIT_CONFIG);
  private sanctionsCircuit = circuitBreakerRegistry.get('sanctions-service', CIRCUIT_CONFIG);

  constructor() {
    super();
    this.registerDefaultTriggers();
    console.log('✅ ComplianceTriggerService initialized');
  }

  /**
   * Initialize and start listening for events
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Start queue processor
    this.startQueueProcessor();

    // Start dead letter auto-retry (every 10 minutes)
    this.startDeadLetterRetryScheduler();

    this.initialized = true;
    console.log('✅ ComplianceTriggerService started with auto-retry scheduler');
  }

  /**
   * Start the dead letter auto-retry scheduler
   */
  private startDeadLetterRetryScheduler(): void {
    if (this.retryTaskId) return;

    this.retryTaskId = setInterval(async () => {
      await this.autoRetryDeadLetters();
    }, DEAD_LETTER_CONFIG.retryIntervalMs);

    console.log(`🔄 Dead letter auto-retry scheduler started (every ${DEAD_LETTER_CONFIG.retryIntervalMs / 60000} min)`);
  }

  /**
   * Stop the dead letter auto-retry scheduler
   */
  stopDeadLetterRetryScheduler(): void {
    if (this.retryTaskId) {
      clearInterval(this.retryTaskId);
      this.retryTaskId = null;
      console.log('⏹️ Dead letter auto-retry scheduler stopped');
    }
  }

  /**
   * Auto-retry pending dead letters (called by scheduler)
   */
  private async autoRetryDeadLetters(): Promise<void> {
    // Don't retry if circuits are open - wait for them to recover
    if (this.complianceCircuit.getState() === 'OPEN' && this.sanctionsCircuit.getState() === 'OPEN') {
      console.log('⏸️ Skipping dead letter retry - all circuits are OPEN');
      return;
    }

    try {
      const result = await this.retryAllPendingDeadLetters();
      if (result.total > 0) {
        console.log(`🔄 Auto-retry completed: ${result.succeeded}/${result.total} succeeded, ${result.failed} failed`);
      }
    } catch (error) {
      console.error('❌ Auto-retry failed:', error);
    }
  }

  /**
   * Register default triggers
   */
  private registerDefaultTriggers(): void {
    // Trigger on property creation
    this.triggers.set('property.created', {
      eventType: 'property.created',
      checkType: 'full',
      priority: 'immediate',
      rateLimit: { maxPerMinute: 30 },
      enabled: true,
    });

    // Trigger on contract upload
    this.triggers.set('document.uploaded.contract', {
      eventType: 'document.uploaded',
      conditions: { documentType: 'purchase_contract' },
      checkType: 'full',
      priority: 'immediate',
      enabled: true,
    });

    // Trigger on property status change
    this.triggers.set('property.status_changed', {
      eventType: 'property.status_changed',
      checkType: 'quick',
      priority: 'queued',
      enabled: true,
    });

    // Trigger on broker assignment
    this.triggers.set('property.broker_assigned', {
      eventType: 'property.broker_assigned',
      checkType: 'specific',
      priority: 'immediate',
      enabled: true,
    });

    // Trigger on seller change (sanctions check)
    this.triggers.set('property.seller_changed', {
      eventType: 'property.seller_changed',
      checkType: 'sanctions',
      priority: 'immediate',
      enabled: true,
    });

    // Trigger on deal pipeline movement
    this.triggers.set('pipeline.stage_changed', {
      eventType: 'pipeline.stage_changed',
      conditions: { stage: ['due_diligence', 'offered', 'under_contract'] },
      checkType: 'full',
      priority: 'immediate',
      enabled: true,
    });

    // Trigger when compliance expires (from watchdog)
    this.triggers.set('compliance.expired', {
      eventType: 'compliance.alert.created',
      conditions: { alertType: 'compliance_degraded' },
      checkType: 'full',
      priority: 'queued',
      enabled: true,
    });

    // Trigger on offer created (screen buyer)
    this.triggers.set('offer.created', {
      eventType: 'offer.created',
      checkType: 'sanctions',
      priority: 'immediate',
      enabled: true,
    });

    // Trigger on contract signed (full compliance verification)
    this.triggers.set('contract.signed', {
      eventType: 'contract.signed',
      checkType: 'full',
      priority: 'immediate',
      enabled: true,
    });

    // Trigger on buyer added/changed (sanctions screen)
    this.triggers.set('buyer.added', {
      eventType: 'buyer.added',
      checkType: 'sanctions',
      priority: 'immediate',
      enabled: true,
    });

    // Trigger on price change (fraud detection)
    this.triggers.set('property.price_changed', {
      eventType: 'property.price_changed',
      checkType: 'specific',
      priority: 'queued',
      rateLimit: { maxPerMinute: 20 },
      enabled: true,
    });

    // Trigger on deal closed (final compliance snapshot)
    this.triggers.set('deal.closed', {
      eventType: 'deal.closed',
      checkType: 'full',
      priority: 'immediate',
      enabled: true,
    });
  }

  /**
   * Handle incoming property event
   */
  async handlePropertyEvent(
    eventType: string,
    propertyId: number,
    data: Record<string, any> = {}
  ): Promise<void> {
    // Find all triggers that match this eventType (not by key, but by eventType property)
    const matchingTriggers: Array<[string, TriggerConfig]> = [];
    for (const [name, config] of this.triggers) {
      if (config.eventType === eventType && config.enabled) {
        matchingTriggers.push([name, config]);
      }
    }

    if (matchingTriggers.length === 0) {
      return;
    }

    // Process each matching trigger
    for (const [triggerName, trigger] of matchingTriggers) {
      await this.processTrigger(triggerName, trigger, eventType, propertyId, data);
    }
  }

  /**
   * Process a single trigger
   */
  private async processTrigger(
    triggerName: string,
    trigger: TriggerConfig,
    eventType: string,
    propertyId: number,
    data: Record<string, any>
  ): Promise<void> {
    if (!trigger.enabled) {
      return;
    }

    // Check conditions
    if (trigger.conditions) {
      const conditionsMet = Object.entries(trigger.conditions).every(([key, value]) => {
        if (Array.isArray(value)) {
          return value.includes(data[key]);
        }
        return data[key] === value;
      });

      if (!conditionsMet) {
        return;
      }
    }

    // Check rate limit
    if (trigger.rateLimit && !this.checkRateLimit(triggerName, trigger.rateLimit.maxPerMinute)) {
      console.log(`⏳ Rate limit hit for trigger ${triggerName}, queueing check`);
      this.queueCheck(propertyId, trigger.checkType, 0, eventType, data);
      return;
    }

    // Execute based on priority
    if (trigger.priority === 'immediate') {
      await this.runComplianceCheck(propertyId, trigger.checkType, data, eventType);
    } else {
      const priorityValue = trigger.priority === 'queued' ? 1 : 2;
      this.queueCheck(propertyId, trigger.checkType, priorityValue, eventType, data);
    }

    // Emit event for monitoring
    this.emit('trigger.executed', {
      triggerName,
      eventType,
      propertyId,
      checkType: trigger.checkType,
      priority: trigger.priority,
    });
  }

  /**
   * Run compliance check with circuit breaker protection
   */
  private async runComplianceCheck(
    propertyId: number,
    checkType: string,
    data?: Record<string, any>,
    eventType?: string
  ): Promise<void> {
    try {
      console.log(`🔍 Running ${checkType} compliance check for property ${propertyId}`);

      const property = await Property.findByPk(propertyId);
      if (!property) {
        console.warn(`⚠️ Property ${propertyId} not found for compliance check`);
        return;
      }

      switch (checkType) {
        case 'full':
        case 'quick':
        case 'specific':
          // Use compliance circuit breaker for compliance service calls
          await this.complianceCircuit.execute(async () => {
            await complianceService.checkProperty(property);
          });
          break;

        case 'sanctions':
          // Use sanctions circuit breaker for sanctions service calls
          if (sanctionsScreeningService.isEnabled()) {
            await this.sanctionsCircuit.execute(async () => {
              await sanctionsScreeningService.screenPropertyParties(propertyId);
            });
          }
          break;

        default:
          await this.complianceCircuit.execute(async () => {
            await complianceService.checkProperty(property);
          });
      }

      console.log(`✅ Compliance check completed for property ${propertyId}`);
    } catch (error) {
      // Handle circuit breaker open errors differently
      if (error instanceof CircuitBreakerOpenError) {
        console.warn(`⏸️ Circuit breaker open for property ${propertyId}, queueing for later`);
        // Queue for retry when circuit recovers - don't add to dead letter
        this.queueCheck(propertyId, checkType, 2, eventType || 'unknown', data);
        return;
      }

      console.error(`❌ Compliance check failed for property ${propertyId}:`, error);

      // Emit failure event
      complianceEventStream.publish(
        'compliance.check.failed',
        'property',
        propertyId,
        {
          checkType,
          error: (error as Error).message,
          triggeredBy: 'real_time_trigger',
          circuitState: {
            compliance: this.complianceCircuit.getState(),
            sanctions: this.sanctionsCircuit.getState(),
          },
        },
        { source: 'system', metadata: { severity: 'warning' } }
      );

      // Push to dead letter queue for retry
      await this.pushToDeadLetter(propertyId, checkType, eventType || 'unknown', data || {}, error as Error);
    }
  }

  /**
   * Push failed trigger to dead letter queue
   */
  private async pushToDeadLetter(
    propertyId: number,
    checkType: string,
    eventType: string,
    data: Record<string, any>,
    error: Error
  ): Promise<void> {
    try {
      const now = new Date();

      // Check if there's already a pending dead letter for this property + checkType
      const existing = await DeadLetterQueue.findOne({
        where: {
          automationId: 'compliance_trigger',
          actionId: String(propertyId),
          actionType: checkType,
          status: 'pending_review',
        },
      });

      if (existing) {
        // Update existing entry
        existing.attempts += 1;
        existing.lastFailedAt = now;
        existing.error = error.message;
        existing.context = { ...existing.context as object, lastEventData: data };

        // Check if max attempts exceeded - abandon if so
        if (existing.attempts >= DEAD_LETTER_CONFIG.maxAttempts) {
          await existing.markAbandoned(`Max retry attempts (${DEAD_LETTER_CONFIG.maxAttempts}) exceeded`);
          console.log(`🚫 Dead letter for property ${propertyId} abandoned after ${existing.attempts} attempts`);

          // Emit abandonment event for monitoring
          this.emit('deadLetter.abandoned', {
            propertyId,
            checkType,
            eventType,
            attempts: existing.attempts,
            error: error.message,
          });
        } else {
          await existing.save();
          console.log(`📬 Updated dead letter for property ${propertyId} (attempt ${existing.attempts}/${DEAD_LETTER_CONFIG.maxAttempts})`);
        }
      } else {
        // Create new entry
        await DeadLetterQueue.create({
          automationId: 'compliance_trigger',
          automationName: `Compliance Trigger: ${eventType}`,
          actionId: String(propertyId),
          actionType: checkType,
          actionConfig: { checkType, eventType },
          context: { propertyId, eventType, data },
          error: error.message,
          attempts: 1,
          firstFailedAt: now,
          lastFailedAt: now,
          status: 'pending_review',
        });
        console.log(`📬 Added to dead letter queue: property ${propertyId}, type ${checkType}`);
      }
    } catch (dlqError) {
      // Don't fail silently but also don't throw - just log
      console.error('❌ Failed to push to dead letter queue:', dlqError);
    }
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(eventType: string, maxPerMinute: number): boolean {
    const now = Date.now();
    const windowMs = 60000;

    let timestamps = this.rateLimits.get(eventType) || [];

    // Remove old timestamps
    timestamps = timestamps.filter(t => now - t < windowMs);

    if (timestamps.length >= maxPerMinute) {
      return false;
    }

    timestamps.push(now);
    this.rateLimits.set(eventType, timestamps);
    return true;
  }

  /**
   * Queue a check for later processing
   */
  private queueCheck(
    propertyId: number,
    checkType: string,
    priority: number,
    eventType: string,
    data?: Record<string, any>
  ): void {
    // Avoid duplicates
    const existing = this.processingQueue.find(
      q => q.propertyId === propertyId && q.checkType === checkType
    );

    if (existing) {
      // Update priority if higher
      if (priority < existing.priority) {
        existing.priority = priority;
      }
      // Merge data if provided
      if (data) {
        existing.data = { ...existing.data, ...data };
      }
      return;
    }

    this.processingQueue.push({
      propertyId,
      checkType,
      priority,
      queuedAt: new Date(),
      eventType,
      data,
    });

    // Sort by priority
    this.processingQueue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    setInterval(async () => {
      if (this.processing || this.processingQueue.length === 0) return;

      this.processing = true;

      try {
        // Process up to 5 items at a time
        const batch = this.processingQueue.splice(0, 5);

        for (const item of batch) {
          await this.runComplianceCheck(item.propertyId, item.checkType, item.data, item.eventType);
        }
      } finally {
        this.processing = false;
      }
    }, 5000); // Process queue every 5 seconds
  }

  /**
   * Register a custom trigger
   */
  registerTrigger(name: string, config: TriggerConfig): void {
    this.triggers.set(name, config);
    console.log(`📋 Registered compliance trigger: ${name}`);
  }

  /**
   * Unregister a trigger
   */
  unregisterTrigger(name: string): boolean {
    return this.triggers.delete(name);
  }

  /**
   * Get all triggers
   */
  getTriggers(): Map<string, TriggerConfig> {
    return new Map(this.triggers);
  }

  /**
   * Enable/disable a trigger
   */
  setTriggerEnabled(name: string, enabled: boolean): boolean {
    const trigger = this.triggers.get(name);
    if (!trigger) return false;

    trigger.enabled = enabled;
    return true;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    processing: boolean;
    items: QueuedCheck[];
  } {
    return {
      queueLength: this.processingQueue.length,
      processing: this.processing,
      items: [...this.processingQueue],
    };
  }

  /**
   * Clear the queue
   */
  clearQueue(): number {
    const count = this.processingQueue.length;
    this.processingQueue = [];
    return count;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    compliance: { state: string; failures: number; available: boolean };
    sanctions: { state: string; failures: number; available: boolean };
  } {
    const complianceStats = this.complianceCircuit.getStats();
    const sanctionsStats = this.sanctionsCircuit.getStats();

    return {
      compliance: {
        state: complianceStats.state,
        failures: complianceStats.failures,
        available: this.complianceCircuit.isAvailable(),
      },
      sanctions: {
        state: sanctionsStats.state,
        failures: sanctionsStats.failures,
        available: this.sanctionsCircuit.isAvailable(),
      },
    };
  }

  /**
   * Reset circuit breakers (for manual intervention)
   */
  resetCircuitBreakers(): void {
    this.complianceCircuit.reset();
    this.sanctionsCircuit.reset();
    console.log('🔄 All circuit breakers reset');
  }

  /**
   * Get trigger statistics
   */
  getStats(): {
    triggers: number;
    enabledTriggers: number;
    queueLength: number;
    rateLimitStatus: Record<string, { count: number; maxPerMinute: number }>;
    circuitBreakers: { compliance: string; sanctions: string };
    autoRetryEnabled: boolean;
  } {
    const enabledTriggers = Array.from(this.triggers.values()).filter(t => t.enabled).length;

    const rateLimitStatus: Record<string, { count: number; maxPerMinute: number }> = {};
    for (const [eventType, timestamps] of this.rateLimits) {
      const trigger = this.triggers.get(eventType);
      rateLimitStatus[eventType] = {
        count: timestamps.length,
        maxPerMinute: trigger?.rateLimit?.maxPerMinute || 0,
      };
    }

    return {
      triggers: this.triggers.size,
      enabledTriggers,
      queueLength: this.processingQueue.length,
      rateLimitStatus,
      circuitBreakers: {
        compliance: this.complianceCircuit.getState(),
        sanctions: this.sanctionsCircuit.getState(),
      },
      autoRetryEnabled: this.retryTaskId !== null,
    };
  }

  /**
   * Retry a failed trigger from the dead letter queue
   */
  async retryDeadLetter(deadLetterId: string): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
    try {
      const deadLetter = await DeadLetterQueue.findByPk(deadLetterId);
      if (!deadLetter) {
        return { success: false, error: 'Dead letter not found' };
      }

      if (deadLetter.automationId !== 'compliance_trigger') {
        return { success: false, error: 'Not a compliance trigger dead letter' };
      }

      // Check if already at max attempts
      if (deadLetter.attempts >= DEAD_LETTER_CONFIG.maxAttempts) {
        await deadLetter.markAbandoned(`Max retry attempts (${DEAD_LETTER_CONFIG.maxAttempts}) exceeded`);
        return { success: false, error: 'Max attempts exceeded, abandoned' };
      }

      const config = deadLetter.actionConfig as { checkType: string; eventType: string };

      // Check if relevant circuit breaker is open
      const circuitForCheck = config.checkType === 'sanctions' ? this.sanctionsCircuit : this.complianceCircuit;
      if (!circuitForCheck.isAvailable()) {
        // Skip retry - circuit is open, will be retried later
        return { success: false, error: 'Circuit breaker open, skipping', skipped: true };
      }

      // Mark as retrying
      await deadLetter.markRetrying();

      const context = deadLetter.context as { propertyId: number; eventType: string; data: Record<string, any> };

      console.log(`🔄 Retrying dead letter ${deadLetterId} for property ${context.propertyId} (attempt ${deadLetter.attempts + 1}/${DEAD_LETTER_CONFIG.maxAttempts})`);

      try {
        await this.runComplianceCheck(
          context.propertyId,
          config.checkType,
          context.data,
          config.eventType
        );

        // Success - mark as resolved
        await deadLetter.markResolved('system', 'Retry successful');
        console.log(`✅ Dead letter ${deadLetterId} resolved via retry`);

        return { success: true };
      } catch (retryError) {
        // Handle circuit breaker open during retry
        if (retryError instanceof CircuitBreakerOpenError) {
          deadLetter.status = 'pending_review';
          await deadLetter.save();
          return { success: false, error: 'Circuit breaker opened during retry', skipped: true };
        }

        // Failed again - update the dead letter
        deadLetter.attempts += 1;
        deadLetter.lastFailedAt = new Date();
        deadLetter.error = (retryError as Error).message;

        // Check if now at max attempts
        if (deadLetter.attempts >= DEAD_LETTER_CONFIG.maxAttempts) {
          await deadLetter.markAbandoned(`Max retry attempts (${DEAD_LETTER_CONFIG.maxAttempts}) exceeded`);
          console.log(`🚫 Dead letter ${deadLetterId} abandoned after ${deadLetter.attempts} attempts`);
        } else {
          deadLetter.status = 'pending_review';
          await deadLetter.save();
          console.log(`❌ Dead letter ${deadLetterId} retry failed (attempt ${deadLetter.attempts}/${DEAD_LETTER_CONFIG.maxAttempts})`);
        }

        return { success: false, error: (retryError as Error).message };
      }
    } catch (error) {
      console.error('❌ Failed to retry dead letter:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Retry all pending compliance trigger dead letters
   */
  async retryAllPendingDeadLetters(): Promise<{ total: number; succeeded: number; failed: number; skipped: number }> {
    const pendingDeadLetters = await DeadLetterQueue.findAll({
      where: {
        automationId: 'compliance_trigger',
        status: 'pending_review',
      },
      order: [['firstFailedAt', 'ASC']],
    });

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const deadLetter of pendingDeadLetters) {
      const result = await this.retryDeadLetter(deadLetter.id);
      if (result.success) {
        succeeded++;
      } else if (result.skipped) {
        skipped++;
      } else {
        failed++;
      }
    }

    return { total: pendingDeadLetters.length, succeeded, failed, skipped };
  }

  /**
   * Get dead letter statistics for compliance triggers
   */
  async getDeadLetterStats(): Promise<{
    pending: number;
    retrying: number;
    resolved: number;
    abandoned: number;
    oldestPending: Date | null;
  }> {
    const stats = await DeadLetterQueue.findAll({
      where: { automationId: 'compliance_trigger' },
      attributes: ['status', [DeadLetterQueue.sequelize!.fn('COUNT', DeadLetterQueue.sequelize!.col('status')), 'count']],
      group: ['status'],
      raw: true,
    }) as unknown as Array<{ status: string; count: string }>;

    const counts: Record<string, number> = {};
    stats.forEach(row => {
      counts[row.status] = parseInt(row.count, 10);
    });

    const oldestPending = await DeadLetterQueue.findOne({
      where: { automationId: 'compliance_trigger', status: 'pending_review' },
      order: [['firstFailedAt', 'ASC']],
    });

    return {
      pending: counts['pending_review'] || 0,
      retrying: counts['retrying'] || 0,
      resolved: counts['resolved'] || 0,
      abandoned: counts['abandoned'] || 0,
      oldestPending: oldestPending?.firstFailedAt || null,
    };
  }
}

export const complianceTriggerService = new ComplianceTriggerService();
export default complianceTriggerService;
