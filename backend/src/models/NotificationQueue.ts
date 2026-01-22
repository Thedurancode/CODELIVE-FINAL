/**
 * Notification Queue Model
 *
 * Stores pending notifications for batched delivery.
 * Respects user delivery frequency preferences (real_time, daily, weekly).
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

type NotificationType = 'deal_match' | 'deal_alert' | 'offer_received' | 'offer_update' | 'system';
type NotificationChannel = 'email' | 'sms' | 'in_app' | 'push';
type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';
type DeliveryFrequency = 'real_time' | 'daily' | 'weekly';

interface NotificationQueueAttributes {
  id: string;
  userId: string;

  // Notification content
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, any>;

  // Delivery settings
  channel: NotificationChannel;
  frequency: DeliveryFrequency;
  priority: 'low' | 'normal' | 'high' | 'urgent';

  // Status tracking
  status: NotificationStatus;
  scheduledFor: Date;
  sentAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  retryCount: number;

  // References
  dealId?: string;
  buyBoxId?: string;
  matchScore?: number;

  createdAt: Date;
  updatedAt: Date;
}

interface NotificationQueueCreationAttributes
  extends Optional<
    NotificationQueueAttributes,
    | 'id'
    | 'priority'
    | 'status'
    | 'scheduledFor'
    | 'sentAt'
    | 'failedAt'
    | 'failureReason'
    | 'retryCount'
    | 'dealId'
    | 'buyBoxId'
    | 'matchScore'
    | 'createdAt'
    | 'updatedAt'
  > {}

class NotificationQueue
  extends Model<NotificationQueueAttributes, NotificationQueueCreationAttributes>
  implements NotificationQueueAttributes
{
  declare id: string;
  declare userId: string;
  declare type: NotificationType;
  declare title: string;
  declare message: string;
  declare data: Record<string, any>;
  declare channel: NotificationChannel;
  declare frequency: DeliveryFrequency;
  declare priority: 'low' | 'normal' | 'high' | 'urgent';
  declare status: NotificationStatus;
  declare scheduledFor: Date;
  declare sentAt: Date | undefined;
  declare failedAt: Date | undefined;
  declare failureReason: string | undefined;
  declare retryCount: number;
  declare dealId: string | undefined;
  declare buyBoxId: string | undefined;
  declare matchScore: number | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Get pending notifications ready for delivery
   */
  static async getPendingForDelivery(channel?: NotificationChannel, limit = 100): Promise<NotificationQueue[]> {
    const where: Record<string, any> = {
      status: 'pending',
      scheduledFor: { [Op.lte]: new Date() },
    };

    if (channel) {
      where.channel = channel;
    }

    return NotificationQueue.findAll({
      where,
      order: [
        ['priority', 'DESC'],
        ['scheduledFor', 'ASC'],
      ],
      limit,
    });
  }

  /**
   * Get pending notifications for a user by frequency
   */
  static async getPendingForUser(
    userId: string,
    frequency: DeliveryFrequency,
    channel?: NotificationChannel
  ): Promise<NotificationQueue[]> {
    const where: Record<string, any> = {
      userId,
      status: 'pending',
      frequency,
    };

    if (channel) {
      where.channel = channel;
    }

    return NotificationQueue.findAll({
      where,
      order: [['createdAt', 'ASC']],
    });
  }

  /**
   * Get users with pending batch notifications
   */
  static async getUsersWithPendingBatch(
    frequency: DeliveryFrequency,
    channel: NotificationChannel
  ): Promise<string[]> {
    const results = await NotificationQueue.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('userId')), 'userId']],
      where: {
        status: 'pending',
        frequency,
        channel,
        scheduledFor: { [Op.lte]: new Date() },
      },
      raw: true,
    });

    return results.map((r: any) => r.userId);
  }

  /**
   * Mark notification as sent
   */
  async markSent(): Promise<void> {
    await this.update({
      status: 'sent',
      sentAt: new Date(),
    });
  }

  /**
   * Mark notification as failed
   */
  async markFailed(reason: string): Promise<void> {
    await this.update({
      status: 'failed',
      failedAt: new Date(),
      failureReason: reason,
      retryCount: this.retryCount + 1,
    });
  }

  /**
   * Reset for retry
   */
  async resetForRetry(delayMinutes = 5): Promise<void> {
    await this.update({
      status: 'pending',
      scheduledFor: new Date(Date.now() + delayMinutes * 60 * 1000),
    });
  }

  /**
   * Calculate scheduled time based on frequency
   */
  static calculateScheduledTime(frequency: DeliveryFrequency): Date {
    const now = new Date();

    switch (frequency) {
      case 'real_time':
        return now;

      case 'daily': {
        // Schedule for 8 AM next day (or today if before 8 AM)
        const daily = new Date(now);
        daily.setHours(8, 0, 0, 0);
        if (now.getHours() >= 8) {
          daily.setDate(daily.getDate() + 1);
        }
        return daily;
      }

      case 'weekly': {
        // Schedule for Monday 8 AM
        const weekly = new Date(now);
        weekly.setHours(8, 0, 0, 0);
        const daysUntilMonday = (8 - weekly.getDay()) % 7 || 7;
        weekly.setDate(weekly.getDate() + daysUntilMonday);
        return weekly;
      }

      default:
        return now;
    }
  }
}

NotificationQueue.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    channel: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    frequency: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    priority: {
      type: DataTypes.STRING,
      defaultValue: 'normal',
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'pending',
    },
    scheduledFor: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    retryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    buyBoxId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    matchScore: {
      type: DataTypes.FLOAT,
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
    tableName: 'notification_queue',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['channel'] },
      { fields: ['frequency'] },
      { fields: ['scheduledFor'] },
      { fields: ['status', 'scheduledFor'] },
      { fields: ['userId', 'status', 'frequency'] },
      { fields: ['dealId'] },
    ],
  }
);

export default NotificationQueue;
export { NotificationQueueAttributes, NotificationQueueCreationAttributes };
