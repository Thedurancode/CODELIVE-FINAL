/**
 * DeadLetterQueue Model
 *
 * Stores failed automation actions that have exhausted all retry attempts.
 * Enables visibility into failures and manual recovery options.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export type DeadLetterStatus = 'pending_review' | 'retrying' | 'resolved' | 'abandoned';

interface DeadLetterQueueAttributes {
  id: string;
  automationId: string;
  automationName: string;
  actionId: string;
  actionType: string;
  actionConfig: object;
  context: object;
  error: string;
  attempts: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  status: DeadLetterStatus;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DeadLetterQueueCreationAttributes
  extends Optional<
    DeadLetterQueueAttributes,
    'id' | 'status' | 'resolvedAt' | 'resolvedBy' | 'resolutionNotes' | 'createdAt' | 'updatedAt'
  > {}

class DeadLetterQueue
  extends Model<DeadLetterQueueAttributes, DeadLetterQueueCreationAttributes>
  implements DeadLetterQueueAttributes
{
  declare id: string;
  declare automationId: string;
  declare automationName: string;
  declare actionId: string;
  declare actionType: string;
  declare actionConfig: object;
  declare context: object;
  declare error: string;
  declare attempts: number;
  declare firstFailedAt: Date;
  declare lastFailedAt: Date;
  declare status: DeadLetterStatus;
  declare resolvedAt: Date | undefined;
  declare resolvedBy: string | undefined;
  declare resolutionNotes: string | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Get a human-readable summary of the dead letter
   */
  getSummary(): string {
    const ageMs = Date.now() - this.firstFailedAt.getTime();
    const ageHours = Math.round(ageMs / (1000 * 60 * 60));
    return `[${this.actionType}] ${this.automationName} - Failed ${this.attempts}x over ${ageHours}h: ${this.error.substring(0, 100)}`;
  }

  /**
   * Check if this dead letter can be retried
   */
  canRetry(): boolean {
    return this.status === 'pending_review' || this.status === 'abandoned';
  }

  /**
   * Get time since first failure
   */
  getAgeMs(): number {
    return Date.now() - this.firstFailedAt.getTime();
  }

  // Static methods for querying

  /**
   * Get dead letters by status
   */
  static async findByStatus(
    status: DeadLetterStatus,
    options: { limit?: number; offset?: number } = {}
  ): Promise<DeadLetterQueue[]> {
    return this.findAll({
      where: { status },
      order: [['lastFailedAt', 'DESC']],
      limit: options.limit || 50,
      offset: options.offset || 0,
    });
  }

  /**
   * Get dead letters by action type
   */
  static async findByActionType(
    actionType: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<DeadLetterQueue[]> {
    return this.findAll({
      where: { actionType },
      order: [['lastFailedAt', 'DESC']],
      limit: options.limit || 50,
      offset: options.offset || 0,
    });
  }

  /**
   * Get aggregated stats
   */
  static async getStats(): Promise<{
    total: number;
    byStatus: Record<DeadLetterStatus, number>;
    byActionType: Record<string, number>;
    oldestPending: Date | null;
    last24Hours: number;
    last7Days: number;
  }> {
    const total = await this.count();

    // Count by status
    const statusCounts = await this.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('status')), 'count']],
      group: ['status'],
      raw: true,
    }) as any[];

    const byStatus: Record<DeadLetterStatus, number> = {
      pending_review: 0,
      retrying: 0,
      resolved: 0,
      abandoned: 0,
    };
    statusCounts.forEach((row: { status: DeadLetterStatus; count: string }) => {
      byStatus[row.status] = parseInt(row.count, 10);
    });

    // Count by action type
    const typeCounts = await this.findAll({
      attributes: ['actionType', [sequelize.fn('COUNT', sequelize.col('actionType')), 'count']],
      group: ['actionType'],
      raw: true,
    }) as any[];

    const byActionType: Record<string, number> = {};
    typeCounts.forEach((row: { actionType: string; count: string }) => {
      byActionType[row.actionType] = parseInt(row.count, 10);
    });

    // Oldest pending
    const oldestPending = await this.findOne({
      where: { status: 'pending_review' },
      order: [['firstFailedAt', 'ASC']],
    });

    // Last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24Hours = await this.count({
      where: { createdAt: { [Op.gte]: oneDayAgo } },
    });

    // Last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last7Days = await this.count({
      where: { createdAt: { [Op.gte]: sevenDaysAgo } },
    });

    return {
      total,
      byStatus,
      byActionType,
      oldestPending: oldestPending?.firstFailedAt || null,
      last24Hours,
      last7Days,
    };
  }

  /**
   * Mark as resolved
   */
  async markResolved(resolvedBy: string, notes?: string): Promise<void> {
    this.status = 'resolved';
    this.resolvedAt = new Date();
    this.resolvedBy = resolvedBy;
    this.resolutionNotes = notes;
    await this.save();
  }

  /**
   * Mark as retrying (when manual retry initiated)
   */
  async markRetrying(): Promise<void> {
    this.status = 'retrying';
    await this.save();
  }

  /**
   * Mark as abandoned (giving up)
   */
  async markAbandoned(notes?: string): Promise<void> {
    this.status = 'abandoned';
    this.resolutionNotes = notes;
    await this.save();
  }

  /**
   * Clean up old resolved entries
   */
  static async cleanupOld(retentionDays: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.destroy({
      where: {
        status: 'resolved',
        resolvedAt: { [Op.lt]: cutoff },
      },
    });
    return result;
  }
}

DeadLetterQueue.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    automationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    automationName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    actionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    actionType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    actionConfig: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    firstFailedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastFailedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending_review', 'retrying', 'resolved', 'abandoned'),
      allowNull: false,
      defaultValue: 'pending_review',
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolvedBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
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
    tableName: 'dead_letter_queue',
    timestamps: true,
    indexes: [
      { fields: ['automationId'] },
      { fields: ['actionType'] },
      { fields: ['status'] },
      { fields: ['firstFailedAt'] },
      { fields: ['lastFailedAt'] },
      { fields: ['createdAt'] },
    ],
  }
);

export default DeadLetterQueue;
export { DeadLetterQueueAttributes, DeadLetterQueueCreationAttributes };
