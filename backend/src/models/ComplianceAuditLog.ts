/**
 * Compliance Audit Log Model
 *
 * Immutable audit trail for SOC 2 compliance.
 * Records are append-only with cryptographic chaining.
 */

import { Model, DataTypes, Sequelize, Optional, Op } from 'sequelize';
import * as crypto from 'crypto';

export interface ComplianceAuditLogAttributes {
  id: number;
  sequenceNumber: number;
  previousHash: string;
  currentHash: string;
  timestamp: Date;
  eventType: string;
  eventCategory: 'access' | 'modification' | 'verification' | 'decision' | 'system' | 'security';
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  actorType: 'user' | 'system' | 'api' | 'automation' | 'external';
  actorId?: string;
  actorName?: string;
  actorIp?: string;
  actorUserAgent?: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  action: string;
  outcome: 'success' | 'failure' | 'partial' | 'pending';
  details: Record<string, any>;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
    diff?: string[];
  };
  complianceContext?: {
    propertyId?: number;
    checkId?: number;
    ruleId?: string;
    state?: string;
    requirement?: string;
  };
  signature?: string;
  verified: boolean;
  exportedAt?: Date;
  retentionDate: Date;
  createdAt: Date;
}

interface ComplianceAuditLogCreationAttributes extends Optional<ComplianceAuditLogAttributes, 'id' | 'sequenceNumber' | 'previousHash' | 'currentHash' | 'verified' | 'createdAt' | 'retentionDate'> {}

export class ComplianceAuditLog extends Model<ComplianceAuditLogAttributes, ComplianceAuditLogCreationAttributes> implements ComplianceAuditLogAttributes {
  declare id: number;
  declare sequenceNumber: number;
  declare previousHash: string;
  declare currentHash: string;
  declare timestamp: Date;
  declare eventType: string;
  declare eventCategory: 'access' | 'modification' | 'verification' | 'decision' | 'system' | 'security';
  declare severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  declare actorType: 'user' | 'system' | 'api' | 'automation' | 'external';
  declare actorId?: string;
  declare actorName?: string;
  declare actorIp?: string;
  declare actorUserAgent?: string;
  declare resourceType: string;
  declare resourceId?: string;
  declare resourceName?: string;
  declare action: string;
  declare outcome: 'success' | 'failure' | 'partial' | 'pending';
  declare details: Record<string, any>;
  declare changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
    diff?: string[];
  };
  declare complianceContext?: {
    propertyId?: number;
    checkId?: number;
    ruleId?: string;
    state?: string;
    requirement?: string;
  };
  declare signature?: string;
  declare verified: boolean;
  declare exportedAt?: Date;
  declare retentionDate: Date;
  declare createdAt: Date;

  static initModel(sequelize: Sequelize): typeof ComplianceAuditLog {
    ComplianceAuditLog.init(
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        sequenceNumber: {
          type: DataTypes.BIGINT,
          allowNull: false,
          unique: true,
        },
        previousHash: {
          type: DataTypes.STRING(64),
          allowNull: false,
        },
        currentHash: {
          type: DataTypes.STRING(64),
          allowNull: false,
        },
        timestamp: {
          type: DataTypes.DATE(6),
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        eventType: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        eventCategory: {
          type: DataTypes.ENUM('access', 'modification', 'verification', 'decision', 'system', 'security'),
          allowNull: false,
        },
        severity: {
          type: DataTypes.ENUM('debug', 'info', 'warning', 'error', 'critical'),
          allowNull: false,
          defaultValue: 'info',
        },
        actorType: {
          type: DataTypes.ENUM('user', 'system', 'api', 'automation', 'external'),
          allowNull: false,
        },
        actorId: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        actorName: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        actorIp: {
          type: DataTypes.STRING(45),
          allowNull: true,
        },
        actorUserAgent: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        resourceType: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        resourceId: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        resourceName: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        action: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        outcome: {
          type: DataTypes.ENUM('success', 'failure', 'partial', 'pending'),
          allowNull: false,
        },
        details: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        changes: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        complianceContext: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        signature: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        verified: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        exportedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        retentionDate: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        tableName: 'compliance_audit_logs',
        timestamps: false,
        indexes: [
          { fields: ['sequenceNumber'], unique: true },
          { fields: ['currentHash'] },
          { fields: ['timestamp'] },
          { fields: ['eventType'] },
          { fields: ['eventCategory'] },
          { fields: ['severity'] },
          { fields: ['actorType', 'actorId'] },
          { fields: ['resourceType', 'resourceId'] },
          { fields: ['outcome'] },
          { fields: ['retentionDate'] },
          {
            fields: ['eventCategory', 'timestamp'],
            name: 'idx_audit_category_time',
          },
        ],
      }
    );

    return ComplianceAuditLog;
  }

  static async getLatest(): Promise<ComplianceAuditLog | null> {
    return ComplianceAuditLog.findOne({
      order: [['sequenceNumber', 'DESC']],
    });
  }

  static async verifyChain(fromSequence?: number): Promise<{
    valid: boolean;
    entriesChecked: number;
    firstInvalid?: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let entriesChecked = 0;
    let firstInvalid: number | undefined;

    const where: any = {};
    if (fromSequence) {
      where.sequenceNumber = { [Op.gte]: fromSequence };
    }

    const logs = await ComplianceAuditLog.findAll({
      where,
      order: [['sequenceNumber', 'ASC']],
    });

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      entriesChecked++;

      if (i > 0) {
        const prevLog = logs[i - 1];
        if (log.previousHash !== prevLog.currentHash) {
          errors.push(`Chain break at sequence ${log.sequenceNumber}: previousHash doesn't match`);
          if (!firstInvalid) firstInvalid = log.sequenceNumber;
        }
      }

      const computedHash = this.computeHash(log);
      if (computedHash !== log.currentHash) {
        errors.push(`Hash mismatch at sequence ${log.sequenceNumber}: record may have been tampered`);
        if (!firstInvalid) firstInvalid = log.sequenceNumber;
        await log.update({ verified: false });
      }
    }

    return {
      valid: errors.length === 0,
      entriesChecked,
      firstInvalid,
      errors,
    };
  }

  static computeHash(log: ComplianceAuditLog | ComplianceAuditLogCreationAttributes): string {
    const data = JSON.stringify({
      sequenceNumber: log.sequenceNumber,
      previousHash: log.previousHash,
      timestamp: log.timestamp,
      eventType: log.eventType,
      eventCategory: log.eventCategory,
      actorType: log.actorType,
      actorId: log.actorId,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      action: log.action,
      outcome: log.outcome,
      details: log.details,
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Log a compliance rule change
   * Used for tracking when rules are created, updated, or deleted
   */
  static async logRuleChange(
    ruleId: string,
    action: 'created' | 'updated' | 'deleted',
    actor: { id?: string; name?: string; type?: 'user' | 'system' | 'api' | 'automation' | 'external' },
    changes?: { before?: Record<string, any>; after?: Record<string, any> }
  ): Promise<ComplianceAuditLog> {
    const latest = await this.getLatest();
    const sequenceNumber = (latest?.sequenceNumber ?? 0) + 1;
    const previousHash = latest?.currentHash ?? '0'.repeat(64);

    const logEntry: ComplianceAuditLogCreationAttributes = {
      sequenceNumber,
      previousHash,
      timestamp: new Date(),
      eventType: `rule.${action}`,
      eventCategory: 'modification',
      severity: 'info',
      actorType: actor.type ?? 'user',
      actorId: actor.id,
      actorName: actor.name,
      resourceType: 'compliance_rule',
      resourceId: ruleId,
      action: `rule_${action}`,
      outcome: 'success',
      details: { ruleId, action },
      changes,
      retentionDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years retention
    };

    // Compute hash before creating
    logEntry.currentHash = this.computeHash(logEntry as any);

    return ComplianceAuditLog.create(logEntry);
  }

  /**
   * Log a knowledge base change
   */
  static async logKnowledgeChange(
    knowledgeId: string,
    action: 'created' | 'updated' | 'deleted',
    actor: { id?: string; name?: string; type?: 'user' | 'system' | 'api' | 'automation' | 'external' },
    changes?: { before?: Record<string, any>; after?: Record<string, any> }
  ): Promise<ComplianceAuditLog> {
    const latest = await this.getLatest();
    const sequenceNumber = (latest?.sequenceNumber ?? 0) + 1;
    const previousHash = latest?.currentHash ?? '0'.repeat(64);

    const logEntry: ComplianceAuditLogCreationAttributes = {
      sequenceNumber,
      previousHash,
      timestamp: new Date(),
      eventType: `knowledge.${action}`,
      eventCategory: 'modification',
      severity: 'info',
      actorType: actor.type ?? 'user',
      actorId: actor.id,
      actorName: actor.name,
      resourceType: 'knowledge',
      resourceId: knowledgeId,
      action: `knowledge_${action}`,
      outcome: 'success',
      details: { knowledgeId, action },
      changes,
      retentionDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
    };

    logEntry.currentHash = this.computeHash(logEntry as any);
    return ComplianceAuditLog.create(logEntry);
  }

  /**
   * Log a template change
   */
  static async logTemplateChange(
    templateId: string,
    action: 'created' | 'updated' | 'deleted',
    actor: { id?: string; name?: string; type?: 'user' | 'system' | 'api' | 'automation' | 'external' },
    changes?: { before?: Record<string, any>; after?: Record<string, any> }
  ): Promise<ComplianceAuditLog> {
    const latest = await this.getLatest();
    const sequenceNumber = (latest?.sequenceNumber ?? 0) + 1;
    const previousHash = latest?.currentHash ?? '0'.repeat(64);

    const logEntry: ComplianceAuditLogCreationAttributes = {
      sequenceNumber,
      previousHash,
      timestamp: new Date(),
      eventType: `template.${action}`,
      eventCategory: 'modification',
      severity: 'info',
      actorType: actor.type ?? 'user',
      actorId: actor.id,
      actorName: actor.name,
      resourceType: 'template',
      resourceId: templateId,
      action: `template_${action}`,
      outcome: 'success',
      details: { templateId, action },
      changes,
      retentionDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
    };

    logEntry.currentHash = this.computeHash(logEntry as any);
    return ComplianceAuditLog.create(logEntry);
  }

  /**
   * Get audit history for a specific resource
   */
  static async getResourceHistory(
    resourceType: string,
    resourceId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ComplianceAuditLog[]> {
    return ComplianceAuditLog.findAll({
      where: { resourceType, resourceId },
      order: [['timestamp', 'DESC']],
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    });
  }

  /**
   * Query audit logs with filters
   */
  static async getAuditLogs(options?: {
    eventType?: string;
    eventCategory?: 'access' | 'modification' | 'verification' | 'decision' | 'system' | 'security';
    actorId?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: ComplianceAuditLog[]; total: number }> {
    const where: any = {};

    if (options?.eventType) where.eventType = options.eventType;
    if (options?.eventCategory) where.eventCategory = options.eventCategory;
    if (options?.actorId) where.actorId = options.actorId;
    if (options?.resourceType) where.resourceType = options.resourceType;
    if (options?.startDate || options?.endDate) {
      where.timestamp = {};
      if (options?.startDate) where.timestamp[Op.gte] = options.startDate;
      if (options?.endDate) where.timestamp[Op.lte] = options.endDate;
    }

    const { rows: logs, count: total } = await ComplianceAuditLog.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    });

    return { logs, total };
  }

  /**
   * Get recent critical changes
   */
  static async getRecentCriticalChanges(
    hours: number = 24,
    limit: number = 50
  ): Promise<ComplianceAuditLog[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return ComplianceAuditLog.findAll({
      where: {
        timestamp: { [Op.gte]: since },
        severity: { [Op.in]: ['critical', 'error'] },
      },
      order: [['timestamp', 'DESC']],
      limit,
    });
  }

  static async exportForAudit(
    startDate: Date,
    endDate: Date,
    options?: {
      eventTypes?: string[];
      resourceTypes?: string[];
      includeDetails?: boolean;
    }
  ): Promise<{
    exportId: string;
    count: number;
    logs: Partial<ComplianceAuditLogAttributes>[];
    chainValid: boolean;
    exportedAt: Date;
  }> {
    const where: any = {
      timestamp: {
        [Op.between]: [startDate, endDate],
      },
    };

    if (options?.eventTypes?.length) {
      where.eventType = { [Op.in]: options.eventTypes };
    }

    if (options?.resourceTypes?.length) {
      where.resourceType = { [Op.in]: options.resourceTypes };
    }

    const logs = await ComplianceAuditLog.findAll({
      where,
      order: [['sequenceNumber', 'ASC']],
    });

    const chainVerification = await this.verifyChain(logs[0]?.sequenceNumber);

    const exportId = crypto.randomBytes(16).toString('hex');
    const exportedAt = new Date();

    await ComplianceAuditLog.update(
      { exportedAt },
      { where: { id: { [Op.in]: logs.map(l => l.id) } } }
    );

    return {
      exportId,
      count: logs.length,
      logs: logs.map(log => ({
        sequenceNumber: log.sequenceNumber,
        timestamp: log.timestamp,
        eventType: log.eventType,
        eventCategory: log.eventCategory,
        severity: log.severity,
        actorType: log.actorType,
        actorId: log.actorId,
        actorName: log.actorName,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        resourceName: log.resourceName,
        action: log.action,
        outcome: log.outcome,
        details: options?.includeDetails ? log.details : undefined,
        currentHash: log.currentHash,
        verified: log.verified,
      })),
      chainValid: chainVerification.valid,
      exportedAt,
    };
  }
}

export default ComplianceAuditLog;
