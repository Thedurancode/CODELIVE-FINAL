/**
 * Compliance Webhook Model
 *
 * Persists webhook subscriptions and delivery logs for the compliance event stream.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

// Webhook subscription types
export type ComplianceEventType =
  | 'compliance.check.passed'
  | 'compliance.check.failed'
  | 'compliance.check.warning'
  | 'compliance.rule.created'
  | 'compliance.rule.updated'
  | 'compliance.rule.deleted'
  | 'compliance.document.sent'
  | 'compliance.document.signed'
  | 'compliance.document.expired'
  | 'compliance.broker.approved'
  | 'compliance.broker.rejected'
  | 'compliance.broker.changes_requested'
  | 'compliance.license.expiring'
  | 'compliance.license.expired'
  | 'compliance.alert.created'
  | 'compliance.alert.resolved'
  | 'compliance.watchdog.run'
  | '*';

interface ComplianceWebhookAttributes {
  id: string;
  userId: string;
  name: string;
  url: string;
  secret: string;
  events: ComplianceEventType[];
  headers?: Record<string, string>;
  active: boolean;
  lastDeliveryAt: Date | null;
  lastDeliveryStatus: 'success' | 'failed' | null;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastError: string | null;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface ComplianceWebhookCreationAttributes
  extends Optional<
    ComplianceWebhookAttributes,
    | 'id'
    | 'headers'
    | 'active'
    | 'lastDeliveryAt'
    | 'lastDeliveryStatus'
    | 'successCount'
    | 'failureCount'
    | 'consecutiveFailures'
    | 'lastError'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ComplianceWebhook
  extends Model<ComplianceWebhookAttributes, ComplianceWebhookCreationAttributes>
  implements ComplianceWebhookAttributes
{
  declare id: string;
  declare userId: string;
  declare name: string;
  declare url: string;
  declare secret: string;
  declare events: ComplianceEventType[];
  declare headers: Record<string, string> | undefined;
  declare active: boolean;
  declare lastDeliveryAt: Date | null;
  declare lastDeliveryStatus: 'success' | 'failed' | null;
  declare successCount: number;
  declare failureCount: number;
  declare consecutiveFailures: number;
  declare lastError: string | null;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Record successful delivery
   */
  async recordSuccess(): Promise<void> {
    this.lastDeliveryAt = new Date();
    this.lastDeliveryStatus = 'success';
    this.successCount++;
    this.consecutiveFailures = 0;
    this.lastError = null;
    await this.save();
  }

  /**
   * Record failed delivery
   */
  async recordFailure(error: string): Promise<void> {
    this.lastDeliveryAt = new Date();
    this.lastDeliveryStatus = 'failed';
    this.failureCount++;
    this.consecutiveFailures++;
    this.lastError = error;

    // Auto-disable after 10 consecutive failures
    if (this.consecutiveFailures >= 10) {
      this.active = false;
    }

    await this.save();
  }

  /**
   * Check if webhook should receive event
   */
  shouldReceiveEvent(eventType: ComplianceEventType): boolean {
    if (!this.active) return false;
    if (this.events.includes('*')) return true;
    return this.events.includes(eventType);
  }

  /**
   * Regenerate secret
   */
  async regenerateSecret(): Promise<string> {
    const crypto = require('crypto');
    this.secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    await this.save();
    return this.secret;
  }

  /**
   * Get user's webhooks
   */
  static async getByUser(userId: string): Promise<ComplianceWebhook[]> {
    return ComplianceWebhook.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get active webhooks for event
   */
  static async getActiveForEvent(eventType: ComplianceEventType): Promise<ComplianceWebhook[]> {
    return ComplianceWebhook.findAll({
      where: {
        active: true,
        [Op.or]: [
          { events: { [Op.contains]: [eventType] } },
          { events: { [Op.contains]: ['*'] } },
        ],
      },
    });
  }

  /**
   * Get webhook statistics
   */
  static async getStats(): Promise<{
    total: number;
    active: number;
    totalDeliveries: number;
    totalFailures: number;
  }> {
    const webhooks = await ComplianceWebhook.findAll();

    return {
      total: webhooks.length,
      active: webhooks.filter(w => w.active).length,
      totalDeliveries: webhooks.reduce((sum, w) => sum + w.successCount, 0),
      totalFailures: webhooks.reduce((sum, w) => sum + w.failureCount, 0),
    };
  }
}

ComplianceWebhook.init(
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING(2048),
      allowNull: false,
      validate: {
        isUrl: true,
      },
    },
    secret: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    events: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: ['*'],
    },
    headers: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastDeliveryAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastDeliveryStatus: {
      type: DataTypes.ENUM('success', 'failed'),
      allowNull: true,
    },
    successCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    failureCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    consecutiveFailures: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'compliance_webhooks',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['active'] },
      { fields: ['events'], using: 'gin' },
    ],
  }
);

// ============================================================================
// WEBHOOK DELIVERY LOG MODEL
// ============================================================================

interface WebhookDeliveryLogAttributes {
  id: number;
  webhookId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
  statusCode: number | null;
  responseTime: number | null;
  success: boolean;
  error: string | null;
  retryCount: number;
  deliveredAt: Date;
}

interface WebhookDeliveryLogCreationAttributes
  extends Optional<
    WebhookDeliveryLogAttributes,
    'id' | 'statusCode' | 'responseTime' | 'error' | 'retryCount'
  > {}

class WebhookDeliveryLog
  extends Model<WebhookDeliveryLogAttributes, WebhookDeliveryLogCreationAttributes>
  implements WebhookDeliveryLogAttributes
{
  declare id: number;
  declare webhookId: string;
  declare eventId: string;
  declare eventType: string;
  declare payload: Record<string, any>;
  declare statusCode: number | null;
  declare responseTime: number | null;
  declare success: boolean;
  declare error: string | null;
  declare retryCount: number;
  declare deliveredAt: Date;

  /**
   * Get delivery logs for webhook
   */
  static async getByWebhook(
    webhookId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<WebhookDeliveryLog[]> {
    return WebhookDeliveryLog.findAll({
      where: { webhookId },
      order: [['deliveredAt', 'DESC']],
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });
  }

  /**
   * Cleanup old logs
   */
  static async cleanup(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    return WebhookDeliveryLog.destroy({
      where: {
        deliveredAt: { [Op.lt]: cutoffDate },
      },
    });
  }
}

WebhookDeliveryLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    webhookId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'compliance_webhooks',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    eventId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    eventType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    statusCode: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    responseTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    success: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    retryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'webhook_delivery_logs',
    timestamps: false,
    indexes: [
      { fields: ['webhookId'] },
      { fields: ['eventId'] },
      { fields: ['deliveredAt'] },
      { fields: ['success'] },
    ],
  }
);

// Associations
ComplianceWebhook.hasMany(WebhookDeliveryLog, {
  foreignKey: 'webhookId',
  as: 'deliveryLogs',
  onDelete: 'CASCADE',
});
WebhookDeliveryLog.belongsTo(ComplianceWebhook, {
  foreignKey: 'webhookId',
  as: 'webhook',
});

export { ComplianceWebhook, WebhookDeliveryLog };
export default ComplianceWebhook;
