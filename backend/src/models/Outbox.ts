/**
 * Outbox Model - Transactional Event Delivery
 *
 * Implements the transactional outbox pattern to guarantee event delivery.
 * Events are written to this table within the same transaction as the business data,
 * then processed asynchronously by a background worker.
 *
 * This ensures:
 * - No lost events (events are persisted before commit)
 * - At-least-once delivery (failed events are retried)
 * - Ordered processing (events processed in order per aggregate)
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export type OutboxEventType =
  | 'deal.created'
  | 'deal.updated'
  | 'deal.processing_started'
  | 'deal.compliance_completed'
  | 'deal.scoring_completed'
  | 'deal.ready'
  | 'deal.blocked'
  | 'deal.approved'
  | 'deal.rejected';

export type OutboxStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';

export interface OutboxAttributes {
  id: number;
  eventType: OutboxEventType;
  aggregateType: string;      // e.g., 'Property', 'Deal'
  aggregateId: string;        // e.g., property.id
  payload: Record<string, any>;
  metadata?: Record<string, any>;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  lastAttemptAt?: Date;
  processAfter?: Date;        // For delayed/scheduled events
  processedAt?: Date;
  idempotencyKey?: string;    // For deduplication
  createdAt: Date;
  updatedAt: Date;
}

interface OutboxCreationAttributes extends Optional<OutboxAttributes,
  'id' | 'status' | 'attempts' | 'maxAttempts' | 'createdAt' | 'updatedAt'
> {}

class Outbox extends Model<OutboxAttributes, OutboxCreationAttributes> implements OutboxAttributes {
  declare id: number;
  declare eventType: OutboxEventType;
  declare aggregateType: string;
  declare aggregateId: string;
  declare payload: Record<string, any>;
  declare metadata: Record<string, any> | undefined;
  declare status: OutboxStatus;
  declare attempts: number;
  declare maxAttempts: number;
  declare lastError: string | undefined;
  declare lastAttemptAt: Date | undefined;
  declare processAfter: Date | undefined;
  declare processedAt: Date | undefined;
  declare idempotencyKey: string | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if this event can be retried
   */
  canRetry(): boolean {
    return this.status === 'failed' && this.attempts < this.maxAttempts;
  }

  /**
   * Check if this event is ready to process (not delayed)
   */
  isReady(): boolean {
    if (!this.processAfter) return true;
    return new Date() >= this.processAfter;
  }

  /**
   * Calculate next retry delay using exponential backoff
   */
  getNextRetryDelay(): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 60s
    const baseDelay = 1000;
    const delay = Math.min(baseDelay * Math.pow(2, this.attempts), 60000);
    return delay;
  }
}

Outbox.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    eventType: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    aggregateType: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    aggregateId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'dead_letter'),
      allowNull: false,
      defaultValue: 'pending',
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    maxAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastAttemptAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    processAfter: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    idempotencyKey: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'Outbox',
    tableName: 'outbox',
    timestamps: true,
    indexes: [
      // Primary processing query: pending events ready to process
      {
        name: 'idx_outbox_pending_processing',
        fields: ['status', 'processAfter'],
        where: { status: 'pending' },
      },
      // Failed events for retry
      {
        name: 'idx_outbox_failed_retry',
        fields: ['status', 'attempts', 'lastAttemptAt'],
        where: { status: 'failed' },
      },
      // Lookup by aggregate (for debugging/admin)
      {
        name: 'idx_outbox_aggregate',
        fields: ['aggregateType', 'aggregateId'],
      },
      // Idempotency check (unique where not null)
      {
        name: 'idx_outbox_idempotency',
        fields: ['idempotencyKey'],
        unique: true,
        where: sequelize.literal('"idempotencyKey" IS NOT NULL'),
      },
      // Event type for analytics
      {
        name: 'idx_outbox_event_type',
        fields: ['eventType', 'createdAt'],
      },
    ],
  }
);

export default Outbox;
