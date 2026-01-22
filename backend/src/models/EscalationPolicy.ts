/**
 * Escalation Policy Model
 *
 * Configurable escalation policies for compliance events.
 * Supports multi-channel notifications with delays and rate limiting.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';
import { ComplianceEventType } from './ComplianceEvent';

export interface EscalationAction {
  type: 'email' | 'sms' | 'slack' | 'pagerduty' | 'webhook';
  delayMinutes: number;
  enabled: boolean;
  config: {
    recipients?: string[];
    slackChannel?: string;
    slackWebhook?: string;
    webhookUrl?: string;
    webhookHeaders?: Record<string, string>;
    pagerDutyRoutingKey?: string;
    pagerDutySeverity?: 'critical' | 'error' | 'warning' | 'info';
    messageTemplate?: string;
    subject?: string;
  };
}

export interface TriggerConditions {
  eventTypes: ComplianceEventType[];
  severities: ('critical' | 'warning' | 'info')[];
  states?: string[];
  resourceTypes?: string[];
  minOccurrences?: number;
  timeWindowMinutes?: number;
  propertyIds?: number[];
  excludePropertyIds?: number[];
}

export interface EscalationPolicyAttributes {
  id?: number;
  name: string;
  description?: string;
  enabled: boolean;
  userId: string;
  triggerConditions: TriggerConditions;
  actions: EscalationAction[];
  cooldownMinutes: number;
  maxAlertsPerHour: number;
  lastTriggeredAt?: Date;
  triggerCount: number;
  priority: number;
  createdAt?: Date;
  updatedAt?: Date;
}

type EscalationPolicyCreationAttributes = Optional<
  EscalationPolicyAttributes,
  'id' | 'description' | 'lastTriggeredAt' | 'triggerCount' | 'priority' | 'createdAt' | 'updatedAt'
>;

class EscalationPolicy
  extends Model<EscalationPolicyAttributes, EscalationPolicyCreationAttributes>
  implements EscalationPolicyAttributes
{
  declare id: number;
  declare name: string;
  declare description?: string;
  declare enabled: boolean;
  declare userId: string;
  declare triggerConditions: TriggerConditions;
  declare actions: EscalationAction[];
  declare cooldownMinutes: number;
  declare maxAlertsPerHour: number;
  declare lastTriggeredAt?: Date;
  declare triggerCount: number;
  declare priority: number;
  declare createdAt: Date;
  declare updatedAt: Date;

  /**
   * Get all enabled policies
   */
  static async getEnabled(): Promise<EscalationPolicy[]> {
    return this.findAll({
      where: { enabled: true },
      order: [['priority', 'DESC']],
    });
  }

  /**
   * Get policies for a user
   */
  static async getByUser(userId: string): Promise<EscalationPolicy[]> {
    return this.findAll({
      where: { userId },
      order: [['priority', 'DESC'], ['name', 'ASC']],
    });
  }

  /**
   * Check if policy is on cooldown
   */
  isOnCooldown(): boolean {
    if (!this.lastTriggeredAt) return false;
    const cooldownEnd = new Date(this.lastTriggeredAt.getTime() + this.cooldownMinutes * 60 * 1000);
    return new Date() < cooldownEnd;
  }

  /**
   * Check if policy has exceeded rate limit
   */
  async hasExceededRateLimit(): Promise<boolean> {
    if (this.maxAlertsPerHour <= 0) return false;

    // Count triggers in the last hour from EscalationExecution
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentTriggers = await EscalationExecution.count({
      where: {
        policyId: this.id,
        triggeredAt: { [Op.gte]: oneHourAgo },
      },
    });

    return recentTriggers >= this.maxAlertsPerHour;
  }

  /**
   * Record a trigger
   */
  async recordTrigger(): Promise<void> {
    await this.update({
      lastTriggeredAt: new Date(),
      triggerCount: this.triggerCount + 1,
    });
  }

  /**
   * Check if event matches policy conditions
   */
  matchesEvent(event: {
    type: ComplianceEventType;
    severity?: string;
    state?: string;
    resourceType?: string;
    propertyId?: number;
  }): boolean {
    const { triggerConditions } = this;

    // Check event type
    if (!triggerConditions.eventTypes.includes(event.type)) {
      return false;
    }

    // Check severity
    if (triggerConditions.severities.length > 0 && event.severity) {
      if (!triggerConditions.severities.includes(event.severity as any)) {
        return false;
      }
    }

    // Check state
    if (triggerConditions.states?.length && event.state) {
      if (!triggerConditions.states.includes(event.state)) {
        return false;
      }
    }

    // Check resource type
    if (triggerConditions.resourceTypes?.length && event.resourceType) {
      if (!triggerConditions.resourceTypes.includes(event.resourceType)) {
        return false;
      }
    }

    // Check property filters
    if (event.propertyId) {
      if (triggerConditions.propertyIds?.length) {
        if (!triggerConditions.propertyIds.includes(event.propertyId)) {
          return false;
        }
      }
      if (triggerConditions.excludePropertyIds?.length) {
        if (triggerConditions.excludePropertyIds.includes(event.propertyId)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get actions sorted by delay
   */
  getSortedActions(): EscalationAction[] {
    return [...this.actions]
      .filter(a => a.enabled)
      .sort((a, b) => a.delayMinutes - b.delayMinutes);
  }
}

EscalationPolicy.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    triggerConditions: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    actions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    cooldownMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 15,
    },
    maxAlertsPerHour: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    lastTriggeredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    triggerCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'escalation_policies',
    timestamps: true,
    indexes: [
      { fields: ['enabled'] },
      { fields: ['userId'] },
      { fields: ['priority'] },
    ],
  }
);

// ============================================================================
// ESCALATION EXECUTION MODEL
// ============================================================================

export interface EscalationExecutionAttributes {
  id?: number;
  policyId: number;
  eventId: string;
  triggeredAt: Date;
  actions: Array<{
    type: string;
    status: 'pending' | 'sent' | 'failed';
    scheduledFor: Date;
    sentAt?: Date;
    error?: string;
    response?: object;
  }>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  completedAt?: Date;
  createdAt?: Date;
}

type EscalationExecutionCreationAttributes = Optional<
  EscalationExecutionAttributes,
  'id' | 'completedAt' | 'createdAt'
>;

class EscalationExecution
  extends Model<EscalationExecutionAttributes, EscalationExecutionCreationAttributes>
  implements EscalationExecutionAttributes
{
  declare id: number;
  declare policyId: number;
  declare eventId: string;
  declare triggeredAt: Date;
  declare actions: Array<{
    type: string;
    status: 'pending' | 'sent' | 'failed';
    scheduledFor: Date;
    sentAt?: Date;
    error?: string;
    response?: object;
  }>;
  declare status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  declare completedAt?: Date;
  declare createdAt: Date;

  /**
   * Get pending executions with actions to send
   */
  static async getPendingActions(): Promise<EscalationExecution[]> {
    const now = new Date();
    return this.findAll({
      where: {
        status: { [Op.in]: ['pending', 'in_progress'] },
      },
    });
  }

  /**
   * Update action status
   */
  async updateAction(
    index: number,
    status: 'sent' | 'failed',
    details?: { error?: string; response?: object }
  ): Promise<void> {
    const actions = [...this.actions];
    actions[index] = {
      ...actions[index],
      status,
      sentAt: new Date(),
      error: details?.error,
      response: details?.response,
    };

    const allCompleted = actions.every(a => a.status !== 'pending');
    const anyFailed = actions.some(a => a.status === 'failed');

    await this.update({
      actions,
      status: allCompleted ? (anyFailed ? 'failed' : 'completed') : 'in_progress',
      completedAt: allCompleted ? new Date() : undefined,
    });
  }

  /**
   * Cancel pending actions
   */
  async cancel(): Promise<void> {
    await this.update({
      status: 'cancelled',
      completedAt: new Date(),
    });
  }
}

EscalationExecution.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    policyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'escalation_policies',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    eventId: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    triggeredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    actions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'escalation_executions',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['policyId'] },
      { fields: ['eventId'] },
      { fields: ['status'] },
      { fields: ['triggeredAt'] },
    ],
  }
);

// Define association
EscalationPolicy.hasMany(EscalationExecution, {
  foreignKey: 'policyId',
  as: 'executions',
});
EscalationExecution.belongsTo(EscalationPolicy, {
  foreignKey: 'policyId',
  as: 'policy',
});

export { EscalationExecution };
export default EscalationPolicy;
