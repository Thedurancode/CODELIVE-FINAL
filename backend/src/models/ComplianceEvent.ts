/**
 * Compliance Event Model
 *
 * Persistent storage for compliance events.
 * Replaces in-memory event history with database-backed storage.
 */

import { DataTypes, Model, Optional, Op, fn, col, literal } from 'sequelize';
import sequelize from '../config/database';

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
  | 'compliance.sanctions.match_found'
  | 'compliance.sanctions.cleared'
  | 'compliance.escalation.triggered'
  | 'compliance.escalation.resolved';

export interface ComplianceEventAttributes {
  id?: string;
  type: ComplianceEventType;
  timestamp: Date;
  source: 'system' | 'user' | 'webhook' | 'scheduler' | 'broker' | 'escalation';
  resourceType: 'property' | 'broker' | 'document' | 'rule' | 'alert' | 'screening';
  resourceId: string;
  userId?: string;
  data: object;
  metadata?: object;
  checkId?: number;
  propertyId?: number;
  state?: string;
  severity?: 'info' | 'warning' | 'critical';
  processed: boolean;
  createdAt?: Date;
}

type ComplianceEventCreationAttributes = Optional<
  ComplianceEventAttributes,
  'id' | 'userId' | 'metadata' | 'checkId' | 'propertyId' | 'state' | 'severity' | 'processed' | 'createdAt'
>;

export interface EventQueryOptions {
  types?: ComplianceEventType[];
  resourceType?: string;
  resourceId?: string;
  propertyId?: number;
  state?: string;
  severity?: 'info' | 'warning' | 'critical';
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

class ComplianceEvent
  extends Model<ComplianceEventAttributes, ComplianceEventCreationAttributes>
  implements ComplianceEventAttributes
{
  declare id: string;
  declare type: ComplianceEventType;
  declare timestamp: Date;
  declare source: 'system' | 'user' | 'webhook' | 'scheduler' | 'broker' | 'escalation';
  declare resourceType: 'property' | 'broker' | 'document' | 'rule' | 'alert' | 'screening';
  declare resourceId: string;
  declare userId?: string;
  declare data: object;
  declare metadata?: object;
  declare checkId?: number;
  declare propertyId?: number;
  declare state?: string;
  declare severity?: 'info' | 'warning' | 'critical';
  declare processed: boolean;
  declare createdAt: Date;

  /**
   * Query events with filters
   */
  static async query(options: EventQueryOptions): Promise<ComplianceEvent[]> {
    const where: any = {};

    if (options.types?.length) {
      where.type = { [Op.in]: options.types };
    }
    if (options.resourceType) {
      where.resourceType = options.resourceType;
    }
    if (options.resourceId) {
      where.resourceId = options.resourceId;
    }
    if (options.propertyId) {
      where.propertyId = options.propertyId;
    }
    if (options.state) {
      where.state = options.state;
    }
    if (options.severity) {
      where.severity = options.severity;
    }
    if (options.since) {
      where.timestamp = { ...where.timestamp, [Op.gte]: options.since };
    }
    if (options.until) {
      where.timestamp = { ...where.timestamp, [Op.lte]: options.until };
    }

    return this.findAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: options.limit || 100,
      offset: options.offset || 0,
    });
  }

  /**
   * Get event counts by type for analytics
   */
  static async getCountsByType(options?: {
    since?: Date;
    until?: Date;
    state?: string;
  }): Promise<Record<string, number>> {
    const where: any = {};

    if (options?.since) {
      where.timestamp = { [Op.gte]: options.since };
    }
    if (options?.until) {
      where.timestamp = { ...where.timestamp, [Op.lte]: options.until };
    }
    if (options?.state) {
      where.state = options.state;
    }

    const results = await this.findAll({
      where,
      attributes: ['type', [fn('COUNT', '*'), 'count']],
      group: ['type'],
      raw: true,
    });

    return results.reduce((acc: Record<string, number>, row: any) => {
      acc[row.type] = parseInt(row.count);
      return acc;
    }, {});
  }

  /**
   * Get events for a specific property
   */
  static async getForProperty(
    propertyId: number,
    options?: { limit?: number; types?: ComplianceEventType[] }
  ): Promise<ComplianceEvent[]> {
    return this.query({
      propertyId,
      types: options?.types,
      limit: options?.limit || 50,
    });
  }

  /**
   * Get daily event summary for analytics
   */
  static async getDailySummary(days: number = 30): Promise<Array<{
    date: string;
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  }>> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const results = await this.findAll({
      where: { timestamp: { [Op.gte]: since } },
      attributes: [
        [fn('DATE', col('timestamp')), 'date'],
        'type',
        'severity',
        [fn('COUNT', '*'), 'count'],
      ],
      group: [fn('DATE', col('timestamp')), 'type', 'severity'],
      order: [[fn('DATE', col('timestamp')), 'ASC']],
      raw: true,
    });

    // Aggregate by date
    const byDate: Map<string, { total: number; byType: Record<string, number>; bySeverity: Record<string, number> }> = new Map();

    for (const row of results as any[]) {
      const dateStr = row.date;
      if (!byDate.has(dateStr)) {
        byDate.set(dateStr, { total: 0, byType: {}, bySeverity: {} });
      }

      const dayData = byDate.get(dateStr)!;
      const count = parseInt(row.count);

      dayData.total += count;
      dayData.byType[row.type] = (dayData.byType[row.type] || 0) + count;
      if (row.severity) {
        dayData.bySeverity[row.severity] = (dayData.bySeverity[row.severity] || 0) + count;
      }
    }

    return Array.from(byDate.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  /**
   * Cleanup old events
   */
  static async cleanup(retentionDays: number = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const deleted = await this.destroy({
      where: {
        timestamp: { [Op.lt]: cutoff },
        processed: true,
      },
    });

    return deleted;
  }

  /**
   * Get unprocessed events (for replay/recovery)
   */
  static async getUnprocessed(limit: number = 100): Promise<ComplianceEvent[]> {
    return this.findAll({
      where: { processed: false },
      order: [['timestamp', 'ASC']],
      limit,
    });
  }

  /**
   * Mark events as processed
   */
  static async markProcessed(ids: string[]): Promise<void> {
    await this.update(
      { processed: true },
      { where: { id: { [Op.in]: ids } } }
    );
  }
}

ComplianceEvent.init(
  {
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      defaultValue: () => `evt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    source: {
      type: DataTypes.ENUM('system', 'user', 'webhook', 'scheduler', 'broker', 'escalation'),
      allowNull: false,
      defaultValue: 'system',
    },
    resourceType: {
      type: DataTypes.ENUM('property', 'broker', 'document', 'rule', 'alert', 'screening'),
      allowNull: false,
    },
    resourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    checkId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'compliance_checks',
        key: 'id',
      },
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'critical'),
      allowNull: true,
    },
    processed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'compliance_events',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['type'] },
      { fields: ['timestamp'] },
      { fields: ['resourceType', 'resourceId'] },
      { fields: ['propertyId'] },
      { fields: ['state'] },
      { fields: ['severity'] },
      { fields: ['processed'] },
      { fields: ['checkId'] },
    ],
  }
);

export default ComplianceEvent;
