/**
 * Webhook Model
 *
 * General-purpose webhook subscription model for platform events.
 * Supports: deal events, offer events, and compliance events.
 * Includes retry logic and delivery tracking.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';
import crypto from 'crypto';

// =============================================================================
// EVENT TYPES
// =============================================================================

// Deal events
export type DealEventType =
  | 'deal.created'
  | 'deal.updated'
  | 'deal.deleted'
  | 'deal.status_changed'
  | 'deal.approved'
  | 'deal.rejected'
  | 'deal.matched';

// Offer events
export type OfferEventType =
  | 'offer.created'
  | 'offer.updated'
  | 'offer.accepted'
  | 'offer.rejected'
  | 'offer.countered'
  | 'offer.expired'
  | 'offer.withdrawn';

// Compliance events
export type ComplianceEventType =
  | 'compliance.check.passed'
  | 'compliance.check.failed'
  | 'compliance.check.warning'
  | 'compliance.document.sent'
  | 'compliance.document.signed'
  | 'compliance.document.expired'
  | 'compliance.broker.approved'
  | 'compliance.broker.rejected'
  | 'compliance.alert.created'
  | 'compliance.alert.resolved'
  | 'compliance.issue.created'
  | 'compliance.issue.resolved';

// Agent events
export type AgentEventType =
  | 'agent.tool.completed'
  | 'agent.tool.failed'
  | 'agent.task.scheduled'
  | 'agent.task.executed'
  | 'agent.approval.requested'
  | 'agent.approval.received'
  | 'agent.batch.completed'
  | 'agent.session.started'
  | 'agent.session.ended';

// Combined event type
export type WebhookEventType = DealEventType | OfferEventType | ComplianceEventType | AgentEventType | '*';

// Event categories
export const EVENT_CATEGORIES = {
  deal: [
    'deal.created',
    'deal.updated',
    'deal.deleted',
    'deal.status_changed',
    'deal.approved',
    'deal.rejected',
    'deal.matched',
  ] as DealEventType[],
  offer: [
    'offer.created',
    'offer.updated',
    'offer.accepted',
    'offer.rejected',
    'offer.countered',
    'offer.expired',
    'offer.withdrawn',
  ] as OfferEventType[],
  compliance: [
    'compliance.check.passed',
    'compliance.check.failed',
    'compliance.check.warning',
    'compliance.document.sent',
    'compliance.document.signed',
    'compliance.document.expired',
    'compliance.broker.approved',
    'compliance.broker.rejected',
    'compliance.alert.created',
    'compliance.alert.resolved',
    'compliance.issue.created',
    'compliance.issue.resolved',
  ] as ComplianceEventType[],
  agent: [
    'agent.tool.completed',
    'agent.tool.failed',
    'agent.task.scheduled',
    'agent.task.executed',
    'agent.approval.requested',
    'agent.approval.received',
    'agent.batch.completed',
    'agent.session.started',
    'agent.session.ended',
  ] as AgentEventType[],
};

export const ALL_EVENT_TYPES: WebhookEventType[] = [
  ...EVENT_CATEGORIES.deal,
  ...EVENT_CATEGORIES.offer,
  ...EVENT_CATEGORIES.compliance,
  ...EVENT_CATEGORIES.agent,
];

// =============================================================================
// WEBHOOK MODEL
// =============================================================================

interface WebhookAttributes {
  id: string;
  userId: string;
  organizationId?: string;
  name: string;
  description?: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  headers?: Record<string, string>;
  active: boolean;
  // Delivery tracking
  lastDeliveryAt: Date | null;
  lastDeliveryStatus: 'success' | 'failed' | null;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastError: string | null;
  // Configuration
  retryEnabled: boolean;
  maxRetries: number;
  timeoutMs: number;
  metadata?: Record<string, any>;
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface WebhookCreationAttributes
  extends Optional<
    WebhookAttributes,
    | 'id'
    | 'organizationId'
    | 'description'
    | 'headers'
    | 'active'
    | 'lastDeliveryAt'
    | 'lastDeliveryStatus'
    | 'successCount'
    | 'failureCount'
    | 'consecutiveFailures'
    | 'lastError'
    | 'retryEnabled'
    | 'maxRetries'
    | 'timeoutMs'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class Webhook
  extends Model<WebhookAttributes, WebhookCreationAttributes>
  implements WebhookAttributes
{
  declare id: string;
  declare userId: string;
  declare organizationId: string | undefined;
  declare name: string;
  declare description: string | undefined;
  declare url: string;
  declare secret: string;
  declare events: WebhookEventType[];
  declare headers: Record<string, string> | undefined;
  declare active: boolean;
  declare lastDeliveryAt: Date | null;
  declare lastDeliveryStatus: 'success' | 'failed' | null;
  declare successCount: number;
  declare failureCount: number;
  declare consecutiveFailures: number;
  declare lastError: string | null;
  declare retryEnabled: boolean;
  declare maxRetries: number;
  declare timeoutMs: number;
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
   * Reset failure count (for manual re-enable)
   */
  async resetFailures(): Promise<void> {
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.active = true;
    await this.save();
  }

  /**
   * Check if webhook should receive event
   */
  shouldReceiveEvent(eventType: WebhookEventType): boolean {
    if (!this.active) return false;
    if (this.events.includes('*')) return true;
    return this.events.includes(eventType);
  }

  /**
   * Regenerate secret
   */
  async regenerateSecret(): Promise<string> {
    this.secret = Webhook.generateSecret();
    await this.save();
    return this.secret;
  }

  /**
   * Get webhook statistics
   */
  getStats(): {
    successRate: number;
    totalDeliveries: number;
    isHealthy: boolean;
  } {
    const totalDeliveries = this.successCount + this.failureCount;
    const successRate = totalDeliveries > 0 ? (this.successCount / totalDeliveries) * 100 : 100;
    const isHealthy = this.active && this.consecutiveFailures < 5;

    return {
      successRate: Math.round(successRate * 100) / 100,
      totalDeliveries,
      isHealthy,
    };
  }

  // =============================================================================
  // STATIC METHODS
  // =============================================================================

  /**
   * Generate a webhook secret
   */
  static generateSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString('hex')}`;
  }

  /**
   * Generate HMAC signature for payload
   */
  static generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verify webhook signature
   */
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = Webhook.generateSignature(payload, secret);
    const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    } catch {
      return false;
    }
  }

  /**
   * Get user's webhooks
   */
  static async getByUser(
    userId: string,
    options?: { includeInactive?: boolean }
  ): Promise<Webhook[]> {
    const where: any = { userId };
    if (!options?.includeInactive) {
      where.active = true;
    }

    return Webhook.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get organization's webhooks
   */
  static async getByOrganization(
    organizationId: string,
    options?: { includeInactive?: boolean }
  ): Promise<Webhook[]> {
    const where: any = { organizationId };
    if (!options?.includeInactive) {
      where.active = true;
    }

    return Webhook.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get active webhooks for a specific event
   */
  static async getActiveForEvent(eventType: WebhookEventType): Promise<Webhook[]> {
    return Webhook.findAll({
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
   * Get global webhook statistics
   */
  static async getGlobalStats(): Promise<{
    total: number;
    active: number;
    disabled: number;
    totalDeliveries: number;
    totalFailures: number;
    averageSuccessRate: number;
  }> {
    const webhooks = await Webhook.findAll();

    const total = webhooks.length;
    const active = webhooks.filter(w => w.active).length;
    const disabled = total - active;
    const totalDeliveries = webhooks.reduce((sum, w) => sum + w.successCount, 0);
    const totalFailures = webhooks.reduce((sum, w) => sum + w.failureCount, 0);
    const allDeliveries = totalDeliveries + totalFailures;
    const averageSuccessRate =
      allDeliveries > 0 ? Math.round((totalDeliveries / allDeliveries) * 10000) / 100 : 100;

    return {
      total,
      active,
      disabled,
      totalDeliveries,
      totalFailures,
      averageSuccessRate,
    };
  }
}

Webhook.init(
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
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    retryEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    maxRetries: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    timeoutMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30000,
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
    tableName: 'webhooks',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['organizationId'] },
      { fields: ['active'] },
      { fields: ['events'], using: 'gin' },
    ],
  }
);

// =============================================================================
// WEBHOOK DELIVERY MODEL
// =============================================================================

interface WebhookDeliveryAttributes {
  id: number;
  webhookId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
  statusCode: number | null;
  responseTime: number | null;
  responseBody: string | null;
  success: boolean;
  error: string | null;
  retryCount: number;
  nextRetryAt: Date | null;
  deliveredAt: Date;
}

interface WebhookDeliveryCreationAttributes
  extends Optional<
    WebhookDeliveryAttributes,
    'id' | 'statusCode' | 'responseTime' | 'responseBody' | 'error' | 'retryCount' | 'nextRetryAt'
  > {}

class WebhookDelivery
  extends Model<WebhookDeliveryAttributes, WebhookDeliveryCreationAttributes>
  implements WebhookDeliveryAttributes
{
  declare id: number;
  declare webhookId: string;
  declare eventId: string;
  declare eventType: string;
  declare payload: Record<string, any>;
  declare statusCode: number | null;
  declare responseTime: number | null;
  declare responseBody: string | null;
  declare success: boolean;
  declare error: string | null;
  declare retryCount: number;
  declare nextRetryAt: Date | null;
  declare deliveredAt: Date;

  /**
   * Get delivery logs for a webhook with pagination
   */
  static async getByWebhook(
    webhookId: string,
    options?: { limit?: number; offset?: number; successOnly?: boolean }
  ): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    const where: any = { webhookId };
    if (options?.successOnly !== undefined) {
      where.success = options.successOnly;
    }

    const [deliveries, total] = await Promise.all([
      WebhookDelivery.findAll({
        where,
        order: [['deliveredAt', 'DESC']],
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      }),
      WebhookDelivery.count({ where }),
    ]);

    return { deliveries, total };
  }

  /**
   * Get pending retries
   */
  static async getPendingRetries(): Promise<WebhookDelivery[]> {
    return WebhookDelivery.findAll({
      where: {
        success: false,
        nextRetryAt: {
          [Op.lte]: new Date(),
          [Op.not]: null,
        },
      },
      order: [['nextRetryAt', 'ASC']],
      limit: 100,
    });
  }

  /**
   * Cleanup old delivery logs
   */
  static async cleanup(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    return WebhookDelivery.destroy({
      where: {
        deliveredAt: { [Op.lt]: cutoffDate },
      },
    });
  }

  /**
   * Get delivery statistics for a webhook
   */
  static async getStats(webhookId: string): Promise<{
    total: number;
    successful: number;
    failed: number;
    pendingRetries: number;
    averageResponseTime: number;
  }> {
    const [total, successful, pendingRetries, avgResponse] = await Promise.all([
      WebhookDelivery.count({ where: { webhookId } }),
      WebhookDelivery.count({ where: { webhookId, success: true } }),
      WebhookDelivery.count({
        where: {
          webhookId,
          success: false,
          nextRetryAt: { [Op.not]: null },
        },
      }),
      WebhookDelivery.findOne({
        where: { webhookId, responseTime: { [Op.not]: null } },
        attributes: [
          [sequelize.fn('AVG', sequelize.col('responseTime')), 'avgTime'],
        ],
        raw: true,
      }) as Promise<{ avgTime: number | null } | null>,
    ]);

    return {
      total,
      successful,
      failed: total - successful,
      pendingRetries,
      averageResponseTime: Math.round((avgResponse?.avgTime || 0) * 100) / 100,
    };
  }
}

WebhookDelivery.init(
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
        model: 'webhooks',
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
    responseBody: {
      type: DataTypes.TEXT,
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
    nextRetryAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'webhook_deliveries',
    timestamps: false,
    indexes: [
      { fields: ['webhookId'] },
      { fields: ['eventId'] },
      { fields: ['eventType'] },
      { fields: ['deliveredAt'] },
      { fields: ['success'] },
      { fields: ['nextRetryAt'] },
    ],
  }
);

// =============================================================================
// ASSOCIATIONS
// =============================================================================

Webhook.hasMany(WebhookDelivery, {
  foreignKey: 'webhookId',
  as: 'deliveries',
  onDelete: 'CASCADE',
});

WebhookDelivery.belongsTo(Webhook, {
  foreignKey: 'webhookId',
  as: 'webhook',
});

// =============================================================================
// EXPORTS
// =============================================================================

export { Webhook, WebhookDelivery };
export default Webhook;
