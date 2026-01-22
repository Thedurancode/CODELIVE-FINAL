/**
 * Compliance Alert Model
 *
 * Persists compliance watchdog alerts for history, reporting, and audit.
 * Tracks expiring contracts, licenses, stale deals, and compliance issues.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export type ComplianceAlertType =
  | 'contract_expiring'
  | 'contract_expired'
  | 'license_expiring'
  | 'license_expired'
  | 'eo_insurance_expiring'
  | 'eo_insurance_expired'
  | 'deal_stale'
  | 'document_expiring'
  | 'compliance_degraded'
  | 'review_required'
  | 'mls_expiring'
  | 'configuration'  // System configuration issues
  | 'api_failure'    // External API failures
  | 'fraud_detection'; // Fraud detection alerts

export type AlertSeverity = 'critical' | 'high' | 'warning' | 'info';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'expired';

interface ComplianceAlertAttributes {
  id: number;
  alertKey: string; // Unique key to prevent duplicates (e.g., "contract-123-2024-01-15")
  type: ComplianceAlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  resourceType: 'property' | 'broker' | 'document' | 'system' | 'screening';
  resourceId: string;
  metadata: Record<string, any>;
  daysUntilExpiration: number | null;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  notificationSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ComplianceAlertCreationAttributes
  extends Optional<
    ComplianceAlertAttributes,
    | 'id'
    | 'status'
    | 'acknowledgedAt'
    | 'acknowledgedBy'
    | 'resolvedAt'
    | 'resolvedBy'
    | 'resolutionNotes'
    | 'notificationSentAt'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ComplianceAlert
  extends Model<ComplianceAlertAttributes, ComplianceAlertCreationAttributes>
  implements ComplianceAlertAttributes
{
  declare id: number;
  declare alertKey: string;
  declare type: ComplianceAlertType;
  declare severity: AlertSeverity;
  declare status: AlertStatus;
  declare title: string;
  declare message: string;
  declare resourceType: 'property' | 'broker' | 'document' | 'system' | 'screening';
  declare resourceId: string;
  declare metadata: Record<string, any>;
  declare daysUntilExpiration: number | null;
  declare acknowledgedAt: Date | null;
  declare acknowledgedBy: string | null;
  declare resolvedAt: Date | null;
  declare resolvedBy: string | null;
  declare resolutionNotes: string | null;
  declare notificationSentAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Acknowledge an alert
   */
  async acknowledge(userId: string): Promise<void> {
    this.status = 'acknowledged';
    this.acknowledgedAt = new Date();
    this.acknowledgedBy = userId;
    await this.save();
  }

  /**
   * Resolve an alert
   */
  async resolve(userId: string, notes?: string): Promise<void> {
    this.status = 'resolved';
    this.resolvedAt = new Date();
    this.resolvedBy = userId;
    if (notes) this.resolutionNotes = notes;
    await this.save();
  }

  /**
   * Mark notification as sent
   */
  async markNotificationSent(): Promise<void> {
    this.notificationSentAt = new Date();
    await this.save();
  }

  /**
   * Find or create an alert by key (prevents duplicates)
   */
  static async findOrCreateAlert(
    data: ComplianceAlertCreationAttributes
  ): Promise<[ComplianceAlert, boolean]> {
    return ComplianceAlert.findOrCreate({
      where: { alertKey: data.alertKey },
      defaults: data,
    });
  }

  /**
   * Update existing alert or create new
   */
  static async upsertAlert(data: ComplianceAlertCreationAttributes): Promise<ComplianceAlert> {
    const [alert, created] = await ComplianceAlert.findOrCreate({
      where: { alertKey: data.alertKey },
      defaults: data,
    });

    if (!created && alert.status === 'active') {
      // Update existing active alert
      await alert.update({
        severity: data.severity,
        title: data.title,
        message: data.message,
        daysUntilExpiration: data.daysUntilExpiration,
        metadata: data.metadata,
      });
    }

    return alert;
  }

  /**
   * Get active alerts with optional filters
   */
  static async getActiveAlerts(options?: {
    type?: ComplianceAlertType;
    severity?: AlertSeverity;
    resourceType?: 'property' | 'broker' | 'document' | 'system' | 'screening';
    limit?: number;
  }): Promise<ComplianceAlert[]> {
    const where: any = { status: 'active' };

    if (options?.type) where.type = options.type;
    if (options?.severity) where.severity = options.severity;
    if (options?.resourceType) where.resourceType = options.resourceType;

    return ComplianceAlert.findAll({
      where,
      order: [
        ['severity', 'ASC'], // critical first (alphabetically)
        ['daysUntilExpiration', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit: options?.limit || 100,
    });
  }

  /**
   * Get alerts for a specific resource
   */
  static async getAlertsForResource(
    resourceType: 'property' | 'broker' | 'document' | 'system' | 'screening',
    resourceId: string
  ): Promise<ComplianceAlert[]> {
    return ComplianceAlert.findAll({
      where: { resourceType, resourceId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get alert statistics
   */
  static async getStats(): Promise<{
    total: number;
    active: number;
    acknowledged: number;
    resolved: number;
    bySeverity: Record<AlertSeverity, number>;
    byType: Record<string, number>;
  }> {
    const all = await ComplianceAlert.findAll({
      attributes: ['status', 'severity', 'type'],
    });

    const stats = {
      total: all.length,
      active: 0,
      acknowledged: 0,
      resolved: 0,
      bySeverity: { critical: 0, high: 0, warning: 0, info: 0 } as Record<AlertSeverity, number>,
      byType: {} as Record<string, number>,
    };

    for (const alert of all) {
      if (alert.status === 'active') stats.active++;
      else if (alert.status === 'acknowledged') stats.acknowledged++;
      else if (alert.status === 'resolved') stats.resolved++;

      stats.bySeverity[alert.severity]++;
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Auto-resolve alerts for resolved issues
   */
  static async autoResolveExpired(): Promise<number> {
    // Mark alerts as expired if their expiration date has passed significantly
    const [count] = await ComplianceAlert.update(
      { status: 'expired' },
      {
        where: {
          status: 'active',
          daysUntilExpiration: { [Op.lt]: -30 }, // More than 30 days past
        },
      }
    );
    return count;
  }

  /**
   * Cleanup old resolved/expired alerts
   */
  static async cleanup(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await ComplianceAlert.destroy({
      where: {
        status: { [Op.in]: ['resolved', 'expired'] },
        updatedAt: { [Op.lt]: cutoffDate },
      },
    });

    return result;
  }
}

ComplianceAlert.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    alertKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    type: {
      type: DataTypes.ENUM(
        'contract_expiring',
        'contract_expired',
        'license_expiring',
        'license_expired',
        'eo_insurance_expiring',
        'eo_insurance_expired',
        'deal_stale',
        'document_expiring',
        'compliance_degraded',
        'review_required',
        'mls_expiring'
        ,
        'configuration',
        'api_failure',
        'fraud_detection'
      ),
      allowNull: false,
    },
    severity: {
      type: DataTypes.ENUM('critical', 'high', 'warning', 'info'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('active', 'acknowledged', 'resolved', 'expired'),
      allowNull: false,
      defaultValue: 'active',
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    resourceType: {
      type: DataTypes.ENUM('property', 'broker', 'document', 'system', 'screening'),
      allowNull: false,
    },
    resourceId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    daysUntilExpiration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    acknowledgedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    acknowledgedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notificationSentAt: {
      type: DataTypes.DATE,
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
    tableName: 'compliance_alerts',
    timestamps: true,
    indexes: [
      { fields: ['alertKey'], unique: true },
      { fields: ['status'] },
      { fields: ['type'] },
      { fields: ['severity'] },
      { fields: ['resourceType', 'resourceId'] },
      { fields: ['status', 'severity'] },
      { fields: ['createdAt'] },
    ],
  }
);

export default ComplianceAlert;
