/**
 * Deal Processing Queue Service
 *
 * Manages the job queue for deal processing using the transactional outbox pattern.
 * Provides guaranteed delivery and ordered processing of deal events.
 */

import { Transaction, Op, fn, col } from 'sequelize';
import sequelize from '../config/database';
import Property from '../models/Property';
import Outbox, { OutboxEventType, OutboxStatus } from '../models/Outbox';
import {
  DealProcessingState,
  DealProcessingJob,
  isValidTransition,
  StateTransitionEvent,
} from '../types/dealProcessing';
import { NormalizedDeal } from '../plugins/types';

class DealProcessingQueue {
  private initialized = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 1000; // 1 second
  private readonly BATCH_SIZE = 10;

  /**
   * Initialize the queue service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure Outbox table exists
      await Outbox.sync();
      this.initialized = true;
      console.log('✅ DealProcessingQueue initialized');
    } catch (error) {
      console.error('❌ Failed to initialize DealProcessingQueue:', error);
      throw error;
    }
  }

  /**
   * Check if queue is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Enqueue a new deal for processing within a transaction
   *
   * This is the key method that ensures atomicity:
   * - Property is created/updated
   * - Outbox event is created
   * - Both succeed or both fail together
   */
  async enqueueDeal(
    property: Property,
    normalizedDeal: Partial<NormalizedDeal>,
    options: {
      transaction: Transaction;
      sourceId: string;
      sourceName: string;
      metadata?: Record<string, any>;
    }
  ): Promise<Outbox> {
    const { transaction, sourceId, sourceName, metadata } = options;

    // Get the property ID (use .get() to avoid Sequelize class field shadowing)
    const propertyId = property.get('id') as number;

    // Generate idempotency key to prevent duplicate processing
    const idempotencyKey = `deal-${propertyId}-${Date.now()}`;

    // Create outbox event within the same transaction
    const outboxEvent = await Outbox.create(
      {
        eventType: 'deal.created',
        aggregateType: 'Property',
        aggregateId: String(propertyId),
        payload: {
          propertyId: propertyId,
          deal: normalizedDeal,
          sourceId,
          sourceName,
        },
        metadata: {
          ...metadata,
          enqueuedAt: new Date().toISOString(),
        },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        idempotencyKey,
      },
      { transaction }
    );

    return outboxEvent;
  }

  /**
   * Transition a deal to a new processing state
   *
   * Validates the transition and creates an audit event
   */
  async transitionState(
    propertyId: number,
    toState: DealProcessingState,
    options: {
      transaction?: Transaction;
      reason?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<{ success: boolean; error?: string }> {
    const { transaction, reason, metadata } = options;

    try {
      const property = await Property.findByPk(propertyId, { transaction });
      if (!property) {
        return { success: false, error: `Property ${propertyId} not found` };
      }

      const fromState = (property as any).processingState as DealProcessingState || DealProcessingState.CREATED;

      // Validate transition
      if (!isValidTransition(fromState, toState)) {
        return {
          success: false,
          error: `Invalid state transition: ${fromState} → ${toState}`,
        };
      }

      // Update property state
      await property.update(
        {
          processingState: toState,
          processingStateUpdatedAt: new Date(),
        } as any,
        { transaction }
      );

      const eventType = this.getEventTypeForState(toState);

      // Create state transition event in outbox when mapped
      if (eventType) {
        await Outbox.create(
          {
            eventType,
            aggregateType: 'Property',
            aggregateId: String(propertyId),
            payload: {
              propertyId,
              fromState,
              toState,
              reason,
            },
            metadata: {
              ...metadata,
              transitionedAt: new Date().toISOString(),
            },
            status: 'pending',
            attempts: 0,
            maxAttempts: 3,
          },
          { transaction }
        );
      }

      console.log(`📊 State transition: Property ${propertyId} ${fromState} → ${toState}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ State transition failed for property ${propertyId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getEventTypeForState(toState: DealProcessingState): OutboxEventType | null {
    switch (toState) {
      case DealProcessingState.CREATED:
        return 'deal.created';
      case DealProcessingState.COMPLIANCE_PENDING:
        return 'deal.processing_started';
      case DealProcessingState.COMPLIANCE_PASSED:
      case DealProcessingState.COMPLIANCE_FAILED:
        return 'deal.compliance_completed';
      case DealProcessingState.SCORED:
        return 'deal.scoring_completed';
      case DealProcessingState.APPROVAL_PENDING:
        return 'deal.ready';
      case DealProcessingState.ACTIVE:
        return 'deal.approved';
      case DealProcessingState.REJECTED:
        return 'deal.rejected';
      case DealProcessingState.BLOCKED:
        return 'deal.blocked';
      default:
        return null;
    }
  }

  /**
   * Fetch pending events from the outbox for processing
   */
  async fetchPendingEvents(limit: number = this.BATCH_SIZE): Promise<Outbox[]> {
    const now = new Date();

    // Fetch pending events that are ready to process
    const events = await Outbox.findAll({
      where: {
        status: 'pending',
        [Op.or]: [
          { processAfter: { [Op.is]: null } },
          { processAfter: { [Op.lte]: now } },
        ],
      } as any,
      order: [['createdAt', 'ASC']],
      limit,
    });

    return events;
  }

  /**
   * Fetch failed events that can be retried
   */
  async fetchRetryableEvents(limit: number = this.BATCH_SIZE): Promise<Outbox[]> {
    const now = new Date();

    const events = await Outbox.findAll({
      where: {
        status: 'failed',
        attempts: { [Op.lt]: col('maxAttempts') },
      },
      order: [['lastAttemptAt', 'ASC']],
      limit,
    });

    // Filter events that have waited long enough for retry
    return events.filter((event) => {
      if (!event.lastAttemptAt) return true;
      const retryDelay = event.getNextRetryDelay();
      const retryAfter = new Date(event.lastAttemptAt.getTime() + retryDelay);
      return now >= retryAfter;
    });
  }

  /**
   * Mark an event as processing (claim it)
   */
  async claimEvent(eventId: number): Promise<boolean> {
    const [updatedCount] = await Outbox.update(
      {
        status: 'processing',
        lastAttemptAt: new Date(),
        attempts: sequelize.Sequelize.literal('attempts + 1'),
      } as any,
      {
        where: {
          id: eventId,
          status: { [Op.in]: ['pending', 'failed'] },
        },
      }
    );

    return updatedCount > 0;
  }

  /**
   * Mark an event as completed
   */
  async completeEvent(eventId: number): Promise<void> {
    await Outbox.update(
      {
        status: 'completed',
        processedAt: new Date(),
      },
      { where: { id: eventId } }
    );
  }

  /**
   * Mark an event as failed
   */
  async failEvent(eventId: number, error: string): Promise<void> {
    const event = await Outbox.findByPk(eventId);
    if (!event) return;

    const newStatus: OutboxStatus =
      event.attempts >= event.maxAttempts ? 'dead_letter' : 'failed';

    await event.update({
      status: newStatus,
      lastError: error,
    });

    if (newStatus === 'dead_letter') {
      console.warn(`⚠️ Event ${eventId} moved to dead letter queue after ${event.attempts} attempts`);
    }
  }

  /**
   * Check for duplicate event (idempotency)
   */
  async isDuplicate(idempotencyKey: string): Promise<boolean> {
    const existing = await Outbox.findOne({
      where: {
        idempotencyKey,
        status: { [Op.in]: ['completed', 'processing'] },
      },
    });
    return !!existing;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    dead_letter: number;
  }> {
    const counts = await Outbox.findAll({
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });

    const stats: Record<OutboxStatus, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead_letter: 0,
    };

    for (const row of counts as any[]) {
      const status = row.status as OutboxStatus;
      if (status in stats) {
        stats[status] = parseInt(row.count, 10);
      }
    }

    return stats;
  }

  /**
   * Get dead letter events for manual review
   */
  async getDeadLetterEvents(limit: number = 50): Promise<Outbox[]> {
    return Outbox.findAll({
      where: { status: 'dead_letter' },
      order: [['updatedAt', 'DESC']],
      limit,
    });
  }

  /**
   * Retry a dead letter event manually
   */
  async retryDeadLetter(eventId: number): Promise<boolean> {
    const [updatedCount] = await Outbox.update(
      {
        status: 'pending',
        attempts: 0,
        lastError: undefined,
        processAfter: undefined,
      },
      { where: { id: eventId, status: 'dead_letter' } }
    );

    return updatedCount > 0;
  }

  /**
   * Cleanup old completed events (for maintenance)
   */
  async cleanupCompleted(olderThanDays: number = 7): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const deleted = await Outbox.destroy({
      where: {
        status: 'completed',
        processedAt: { [Op.lt]: cutoff },
      },
    });

    if (deleted > 0) {
      console.log(`🧹 Cleaned up ${deleted} completed outbox events older than ${olderThanDays} days`);
    }

    return deleted;
  }
}

// Export singleton instance
export const dealProcessingQueue = new DealProcessingQueue();
export default dealProcessingQueue;
