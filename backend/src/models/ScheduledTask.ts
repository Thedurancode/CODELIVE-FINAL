/**
 * ScheduledTask Model
 *
 * Persistent storage for scheduled reminders, reports, and agent actions.
 * Used by ScheduledTaskScheduler for cron-based execution.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type ScheduledTaskType = 'reminder' | 'report' | 'action';
export type ScheduledTaskStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

interface ScheduledTaskAttributes {
  id: string;
  userId: string;
  sessionId: string;

  // Task type and scheduling
  type: ScheduledTaskType;
  scheduledFor: Date;
  recurrence?: string; // Cron expression for recurring tasks
  timezone?: string; // User's timezone for scheduling

  // Content
  title: string;
  message: string;

  // For action tasks: tool to invoke
  actionType?: string;
  actionParams?: Record<string, unknown>;

  // Status tracking
  status: ScheduledTaskStatus;
  executedAt?: Date;
  result?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;

  // Metadata
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface ScheduledTaskCreationAttributes
  extends Optional<
    ScheduledTaskAttributes,
    | 'id'
    | 'recurrence'
    | 'timezone'
    | 'actionType'
    | 'actionParams'
    | 'status'
    | 'executedAt'
    | 'result'
    | 'error'
    | 'retryCount'
    | 'maxRetries'
    | 'nextRetryAt'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ScheduledTask
  extends Model<ScheduledTaskAttributes, ScheduledTaskCreationAttributes>
  implements ScheduledTaskAttributes
{
  declare id: string;
  declare userId: string;
  declare sessionId: string;
  declare type: ScheduledTaskType;
  declare scheduledFor: Date;
  declare recurrence: string | undefined;
  declare timezone: string | undefined;
  declare title: string;
  declare message: string;
  declare actionType: string | undefined;
  declare actionParams: Record<string, unknown> | undefined;
  declare status: ScheduledTaskStatus;
  declare executedAt: Date | undefined;
  declare result: Record<string, unknown> | undefined;
  declare error: string | undefined;
  declare retryCount: number;
  declare maxRetries: number;
  declare nextRetryAt: Date | undefined;
  declare metadata: Record<string, unknown> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if task is due for execution
   */
  isDue(): boolean {
    return this.status === 'pending' && new Date() >= this.scheduledFor;
  }

  /**
   * Check if task can be retried
   */
  canRetry(): boolean {
    return this.status === 'failed' && this.retryCount < this.maxRetries;
  }

  /**
   * Check if task is recurring
   */
  isRecurring(): boolean {
    return !!this.recurrence;
  }
}

ScheduledTask.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: () => `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('reminder', 'report', 'action'),
      allowNull: false,
    },
    scheduledFor: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    recurrence: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    timezone: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'America/Chicago',
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    actionType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    actionParams: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
      defaultValue: 'pending',
    },
    executedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    result: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    retryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    maxRetries: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
    },
    nextRetryAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'scheduled_tasks',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['scheduledFor'] },
      { fields: ['type'] },
      {
        name: 'scheduled_tasks_due',
        fields: ['status', 'scheduledFor'],
        where: { status: 'pending' },
      },
    ],
  }
);

export default ScheduledTask;
export { ScheduledTaskAttributes, ScheduledTaskCreationAttributes };
