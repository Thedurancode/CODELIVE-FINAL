/**
 * Fraud Signal Model
 *
 * Tracks fraud indicators, patterns, and suspicious activities
 * for cross-transaction analysis and velocity detection.
 */

import { Model, DataTypes, Optional, Sequelize, Op } from 'sequelize';

export interface FraudSignalAttributes {
  id: number;
  signalType: 'velocity' | 'pattern' | 'identity' | 'behavioral' | 'network';
  severity: 'low' | 'medium' | 'high' | 'critical';
  entityType: 'seller' | 'property' | 'wholesaler' | 'phone' | 'email' | 'address' | 'ip';
  entityValue: string;
  entityValueHash: string; // For privacy-preserving lookups
  propertyId?: number;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  details: Record<string, any>;
  relatedSignals?: number[]; // IDs of related fraud signals
  riskScore: number; // 0-100
  status: 'active' | 'cleared' | 'confirmed_fraud' | 'under_review';
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  expiresAt?: Date; // For auto-cleanup of old signals
  createdAt?: Date;
  updatedAt?: Date;
}

interface FraudSignalCreationAttributes extends Optional<FraudSignalAttributes, 'id' | 'occurrenceCount' | 'firstSeenAt' | 'lastSeenAt' | 'riskScore' | 'status' | 'createdAt' | 'updatedAt'> {}

class FraudSignal extends Model<FraudSignalAttributes, FraudSignalCreationAttributes> implements FraudSignalAttributes {
  public id!: number;
  public signalType!: 'velocity' | 'pattern' | 'identity' | 'behavioral' | 'network';
  public severity!: 'low' | 'medium' | 'high' | 'critical';
  public entityType!: 'seller' | 'property' | 'wholesaler' | 'phone' | 'email' | 'address' | 'ip';
  public entityValue!: string;
  public entityValueHash!: string;
  public propertyId?: number;
  public occurrenceCount!: number;
  public firstSeenAt!: Date;
  public lastSeenAt!: Date;
  public details!: Record<string, any>;
  public relatedSignals?: number[];
  public riskScore!: number;
  public status!: 'active' | 'cleared' | 'confirmed_fraud' | 'under_review';
  public resolvedBy?: string;
  public resolvedAt?: Date;
  public resolutionNotes?: string;
  public expiresAt?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Find or create a signal for an entity
   */
  static async recordSignal(
    signalType: FraudSignalAttributes['signalType'],
    entityType: FraudSignalAttributes['entityType'],
    entityValue: string,
    severity: FraudSignalAttributes['severity'],
    details: Record<string, any>,
    propertyId?: number
  ): Promise<FraudSignal> {
    const crypto = await import('crypto');
    const entityValueHash = crypto.createHash('sha256').update(entityValue.toLowerCase().trim()).digest('hex');

    const [signal, created] = await FraudSignal.findOrCreate({
      where: {
        signalType,
        entityType,
        entityValueHash,
        status: { [Op.in]: ['active', 'under_review'] },
      },
      defaults: {
        signalType,
        entityType,
        entityValue,
        entityValueHash,
        severity,
        propertyId,
        occurrenceCount: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        details,
        riskScore: this.calculateInitialRiskScore(severity),
        status: 'active',
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    });

    if (!created) {
      // Increment occurrence count and update
      signal.occurrenceCount += 1;
      signal.lastSeenAt = new Date();
      signal.details = { ...signal.details, ...details, lastPropertyId: propertyId };
      signal.riskScore = this.calculateRiskScore(signal);

      // Escalate severity if repeated
      if (signal.occurrenceCount >= 5 && signal.severity !== 'critical') {
        signal.severity = 'critical';
      } else if (signal.occurrenceCount >= 3 && signal.severity === 'low') {
        signal.severity = 'medium';
      } else if (signal.occurrenceCount >= 3 && signal.severity === 'medium') {
        signal.severity = 'high';
      }

      await signal.save();
    }

    return signal;
  }

  /**
   * Calculate initial risk score based on severity
   */
  private static calculateInitialRiskScore(severity: FraudSignalAttributes['severity']): number {
    switch (severity) {
      case 'critical': return 90;
      case 'high': return 70;
      case 'medium': return 50;
      case 'low': return 30;
      default: return 30;
    }
  }

  /**
   * Calculate risk score based on signal patterns
   */
  private static calculateRiskScore(signal: FraudSignal): number {
    let score = this.calculateInitialRiskScore(signal.severity);

    // Increase score based on occurrence count
    score += Math.min(signal.occurrenceCount * 5, 30);

    // Increase score for recent activity
    const hoursSinceFirst = (Date.now() - signal.firstSeenAt.getTime()) / (1000 * 60 * 60);
    const occurrenceRate = signal.occurrenceCount / Math.max(hoursSinceFirst, 1);
    if (occurrenceRate > 0.5) score += 20; // More than 1 occurrence per 2 hours

    return Math.min(score, 100);
  }

  /**
   * Get active signals for an entity
   */
  static async getActiveSignals(entityType: string, entityValue: string): Promise<FraudSignal[]> {
    const crypto = await import('crypto');
    const entityValueHash = crypto.createHash('sha256').update(entityValue.toLowerCase().trim()).digest('hex');

    return FraudSignal.findAll({
      where: {
        entityType,
        entityValueHash,
        status: { [Op.in]: ['active', 'under_review'] },
      },
      order: [['riskScore', 'DESC']],
    });
  }

  /**
   * Get all active signals for a property
   */
  static async getPropertySignals(propertyId: number): Promise<FraudSignal[]> {
    return FraudSignal.findAll({
      where: {
        propertyId,
        status: { [Op.in]: ['active', 'under_review'] },
      },
      order: [['riskScore', 'DESC']],
    });
  }

  /**
   * Check velocity for an entity (submissions within time window)
   */
  static async checkVelocity(
    entityType: FraudSignalAttributes['entityType'],
    entityValue: string,
    windowHours: number = 24
  ): Promise<{ count: number; signals: FraudSignal[] }> {
    const crypto = await import('crypto');
    const entityValueHash = crypto.createHash('sha256').update(entityValue.toLowerCase().trim()).digest('hex');
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const signals = await FraudSignal.findAll({
      where: {
        entityType,
        entityValueHash,
        lastSeenAt: { [Op.gte]: windowStart },
      },
    });

    const count = signals.reduce((sum, s) => sum + s.occurrenceCount, 0);
    return { count, signals };
  }

  /**
   * Get fraud statistics
   */
  static async getStats(options?: { since?: Date }): Promise<{
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    highRiskCount: number;
  }> {
    const where: any = {};
    if (options?.since) {
      where.createdAt = { [Op.gte]: options.since };
    }

    const [total, byType, bySeverity, byStatus, highRisk] = await Promise.all([
      FraudSignal.count({ where }),
      FraudSignal.findAll({
        attributes: ['signalType', [Sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['signalType'],
        raw: true,
      }),
      FraudSignal.findAll({
        attributes: ['severity', [Sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['severity'],
        raw: true,
      }),
      FraudSignal.findAll({
        attributes: ['status', [Sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['status'],
        raw: true,
      }),
      FraudSignal.count({
        where: { ...where, riskScore: { [Op.gte]: 70 }, status: 'active' },
      }),
    ]);

    return {
      total,
      byType: Object.fromEntries((byType as any[]).map(r => [r.signalType, parseInt(r.count)])),
      bySeverity: Object.fromEntries((bySeverity as any[]).map(r => [r.severity, parseInt(r.count)])),
      byStatus: Object.fromEntries((byStatus as any[]).map(r => [r.status, parseInt(r.count)])),
      highRiskCount: highRisk,
    };
  }

  /**
   * Cleanup expired signals
   */
  static async cleanupExpired(): Promise<number> {
    const result = await FraudSignal.destroy({
      where: {
        expiresAt: { [Op.lt]: new Date() },
        status: { [Op.notIn]: ['confirmed_fraud'] }, // Keep confirmed fraud signals
      },
    });
    return result;
  }
}

export function initFraudSignal(sequelize: Sequelize): typeof FraudSignal {
  FraudSignal.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      signalType: {
        type: DataTypes.ENUM('velocity', 'pattern', 'identity', 'behavioral', 'network'),
        allowNull: false,
      },
      severity: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
        defaultValue: 'medium',
      },
      entityType: {
        type: DataTypes.ENUM('seller', 'property', 'wholesaler', 'phone', 'email', 'address', 'ip'),
        allowNull: false,
      },
      entityValue: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      entityValueHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      propertyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      occurrenceCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      firstSeenAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      details: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      relatedSignals: {
        type: DataTypes.ARRAY(DataTypes.INTEGER),
        allowNull: true,
      },
      riskScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50,
      },
      status: {
        type: DataTypes.ENUM('active', 'cleared', 'confirmed_fraud', 'under_review'),
        allowNull: false,
        defaultValue: 'active',
      },
      resolvedBy: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      resolutionNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'fraud_signals',
      timestamps: true,
      indexes: [
        { fields: ['entityType', 'entityValueHash'] },
        { fields: ['signalType'] },
        { fields: ['severity'] },
        { fields: ['status'] },
        { fields: ['riskScore'] },
        { fields: ['propertyId'] },
        { fields: ['lastSeenAt'] },
        { fields: ['expiresAt'] },
      ],
    }
  );

  return FraudSignal;
}

export default FraudSignal;
