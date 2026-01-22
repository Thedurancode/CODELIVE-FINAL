/**
 * Push Subscription Model
 *
 * Stores Web Push API subscriptions for sending push notifications
 * when users are offline or have the app in the background.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface PushSubscriptionAttributes {
  id: string;
  userId: string;
  endpoint: string;
  keys: PushSubscriptionKeys;
  expirationTime: number | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PushSubscriptionCreationAttributes
  extends Optional<
    PushSubscriptionAttributes,
    'id' | 'expirationTime' | 'userAgent' | 'createdAt' | 'updatedAt'
  > {}

class PushSubscription
  extends Model<PushSubscriptionAttributes, PushSubscriptionCreationAttributes>
  implements PushSubscriptionAttributes
{
  declare id: string;
  declare userId: string;
  declare endpoint: string;
  declare keys: PushSubscriptionKeys;
  declare expirationTime: number | null;
  declare userAgent: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Find all subscriptions for a user
   */
  static async findByUserId(userId: string): Promise<PushSubscription[]> {
    return PushSubscription.findAll({
      where: { userId },
    });
  }

  /**
   * Find subscription by endpoint
   */
  static async findByEndpoint(endpoint: string): Promise<PushSubscription | null> {
    return PushSubscription.findOne({
      where: { endpoint },
    });
  }

  /**
   * Upsert a subscription (create or update by endpoint)
   */
  static async upsertSubscription(
    userId: string,
    subscription: {
      endpoint: string;
      keys: PushSubscriptionKeys;
      expirationTime?: number | null;
    },
    userAgent?: string
  ): Promise<PushSubscription> {
    const existing = await PushSubscription.findByEndpoint(subscription.endpoint);

    if (existing) {
      // Update existing subscription
      existing.userId = userId;
      existing.keys = subscription.keys;
      existing.expirationTime = subscription.expirationTime || null;
      existing.userAgent = userAgent || existing.userAgent;
      await existing.save();
      return existing;
    }

    // Create new subscription
    return PushSubscription.create({
      userId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      expirationTime: subscription.expirationTime || null,
      userAgent: userAgent || null,
    });
  }

  /**
   * Remove a subscription by endpoint
   */
  static async removeByEndpoint(endpoint: string): Promise<boolean> {
    const deleted = await PushSubscription.destroy({
      where: { endpoint },
    });
    return deleted > 0;
  }

  /**
   * Remove all subscriptions for a user
   */
  static async removeAllForUser(userId: string): Promise<number> {
    return PushSubscription.destroy({
      where: { userId },
    });
  }

  /**
   * Get the subscription data in the format needed by web-push library
   */
  toWebPushFormat(): {
    endpoint: string;
    keys: PushSubscriptionKeys;
    expirationTime?: number | null;
  } {
    return {
      endpoint: this.endpoint,
      keys: this.keys,
      expirationTime: this.expirationTime,
    };
  }
}

PushSubscription.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    endpoint: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    keys: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Web Push encryption keys (p256dh and auth)',
    },
    expirationTime: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(500),
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
    tableName: 'push_subscriptions',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { unique: true, fields: ['endpoint'] },
    ],
  }
);

export default PushSubscription;
