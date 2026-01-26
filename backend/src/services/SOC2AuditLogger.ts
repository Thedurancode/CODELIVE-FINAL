/**
 * SOC 2 Audit Logger Service
 *
 * Provides immutable, cryptographically-chained audit logging
 * for SOC 2 Type II compliance.
 *
 * Features:
 * - Append-only log entries with hash chaining
 * - Tamper detection via chain verification
 * - Configurable retention periods (default 7 years)
 * - Export capabilities for auditors
 * - Real-time chain integrity monitoring
 */

import * as crypto from 'crypto';
import { ComplianceAuditLog, ComplianceAuditLogAttributes } from '../models/ComplianceAuditLog';

export interface AuditLogEntry {
  eventType: string;
  eventCategory: 'access' | 'modification' | 'verification' | 'decision' | 'system' | 'security';
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  actor: {
    type: 'user' | 'system' | 'api' | 'automation' | 'external';
    id?: string;
    name?: string;
    ip?: string;
    userAgent?: string;
  };
  resource: {
    type: string;
    id?: string;
    name?: string;
  };
  action: string;
  outcome: 'success' | 'failure' | 'partial' | 'pending';
  details?: Record<string, any>;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  complianceContext?: {
    propertyId?: number;
    checkId?: number;
    ruleId?: string;
    state?: string;
    requirement?: string;
  };
}

export interface AuditQueryOptions {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: string[];
  eventCategories?: Array<'access' | 'modification' | 'verification' | 'decision' | 'system' | 'security'>;
  severities?: Array<'debug' | 'info' | 'warning' | 'error' | 'critical'>;
  actorTypes?: Array<'user' | 'system' | 'api' | 'automation' | 'external'>;
  actorId?: string;
  resourceTypes?: string[];
  resourceId?: string;
  outcomes?: Array<'success' | 'failure' | 'partial' | 'pending'>;
  limit?: number;
  offset?: number;
}

export interface ChainVerificationResult {
  valid: boolean;
  entriesChecked: number;
  firstInvalid?: number;
  errors: string[];
  verifiedAt: Date;
}

class SOC2AuditLogger {
  private initialized = false;
  private sequenceCounter: number = 0;
  private lastHash: string = '0'.repeat(64); // Genesis hash
  private retentionYears = 7;
  private signingKey?: string;
  private writeQueue: AuditLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isWriting = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Get the last log entry to continue the chain
    try {
      const lastEntry = await ComplianceAuditLog.getLatest();
      if (lastEntry) {
        this.sequenceCounter = lastEntry.sequenceNumber;
        this.lastHash = lastEntry.currentHash;
      }
    } catch (error) {
      // Table may not exist yet
      console.log('[SOC2Audit] Starting fresh chain (table may not exist yet)');
    }

    this.signingKey = process.env.AUDIT_SIGNING_KEY;

    if (process.env.AUDIT_RETENTION_YEARS) {
      this.retentionYears = parseInt(process.env.AUDIT_RETENTION_YEARS, 10);
    }

    // Start flush interval for batched writes
    this.flushInterval = setInterval(() => this.flushQueue(), 5000);

    this.initialized = true;
    console.log('[SOC2Audit] Service initialized', {
      sequenceNumber: this.sequenceCounter,
      retentionYears: this.retentionYears,
      signingEnabled: !!this.signingKey,
    });
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Log an audit event (non-blocking, queued)
   */
  log(entry: AuditLogEntry): void {
    if (!this.initialized) {
      console.warn('[SOC2Audit] Logger not initialized, entry will be queued');
    }
    this.writeQueue.push(entry);

    // Immediate flush for critical events
    if (entry.severity === 'critical' || entry.severity === 'error') {
      this.flushQueue();
    }
  }

  /**
   * Log an audit event (blocking, immediate write)
   */
  async logSync(entry: AuditLogEntry): Promise<ComplianceAuditLog> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.writeEntry(entry);
  }

  /**
   * Convenience methods for common event types
   */
  logAccess(resource: { type: string; id?: string; name?: string }, actor: AuditLogEntry['actor'], action: string, outcome: AuditLogEntry['outcome'], details?: Record<string, any>): void {
    this.log({
      eventType: `${resource.type}.accessed`,
      eventCategory: 'access',
      severity: 'info',
      actor,
      resource,
      action,
      outcome,
      details,
    });
  }

  logModification(resource: { type: string; id?: string; name?: string }, actor: AuditLogEntry['actor'], action: string, outcome: AuditLogEntry['outcome'], changes?: { before?: Record<string, any>; after?: Record<string, any> }, details?: Record<string, any>): void {
    this.log({
      eventType: `${resource.type}.modified`,
      eventCategory: 'modification',
      severity: 'info',
      actor,
      resource,
      action,
      outcome,
      changes,
      details,
    });
  }

  logVerification(resource: { type: string; id?: string; name?: string }, actor: AuditLogEntry['actor'], action: string, outcome: AuditLogEntry['outcome'], complianceContext?: AuditLogEntry['complianceContext'], details?: Record<string, any>): void {
    this.log({
      eventType: `${resource.type}.verified`,
      eventCategory: 'verification',
      severity: outcome === 'failure' ? 'warning' : 'info',
      actor,
      resource,
      action,
      outcome,
      complianceContext,
      details,
    });
  }

  logDecision(resource: { type: string; id?: string; name?: string }, actor: AuditLogEntry['actor'], action: string, outcome: AuditLogEntry['outcome'], complianceContext?: AuditLogEntry['complianceContext'], details?: Record<string, any>): void {
    this.log({
      eventType: `${resource.type}.decision`,
      eventCategory: 'decision',
      severity: 'info',
      actor,
      resource,
      action,
      outcome,
      complianceContext,
      details,
    });
  }

  logSecurityEvent(eventType: string, actor: AuditLogEntry['actor'], action: string, outcome: AuditLogEntry['outcome'], details?: Record<string, any>): void {
    this.log({
      eventType: `security.${eventType}`,
      eventCategory: 'security',
      severity: outcome === 'failure' ? 'warning' : 'info',
      actor,
      resource: { type: 'security' },
      action,
      outcome,
      details,
    });
  }

  logSystemEvent(eventType: string, action: string, outcome: AuditLogEntry['outcome'], details?: Record<string, any>): void {
    this.log({
      eventType: `system.${eventType}`,
      eventCategory: 'system',
      severity: outcome === 'failure' ? 'error' : 'info',
      actor: { type: 'system', name: 'Dispotree' },
      resource: { type: 'system' },
      action,
      outcome,
      details,
    });
  }

  /**
   * Flush the write queue
   */
  private async flushQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) return;

    this.isWriting = true;
    const entries = [...this.writeQueue];
    this.writeQueue = [];

    try {
      for (const entry of entries) {
        await this.writeEntry(entry);
      }
    } catch (error) {
      // Put entries back in queue on failure
      this.writeQueue.unshift(...entries);
      console.error('[SOC2Audit] Failed to flush queue:', error);
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Write a single entry with hash chaining
   */
  private async writeEntry(entry: AuditLogEntry): Promise<ComplianceAuditLog> {
    // Increment sequence
    this.sequenceCounter++;
    const sequenceNumber = this.sequenceCounter;

    // Calculate diff if changes provided
    let changes: ComplianceAuditLogAttributes['changes'];
    if (entry.changes) {
      changes = {
        before: entry.changes.before,
        after: entry.changes.after,
        diff: this.calculateDiff(entry.changes.before, entry.changes.after),
      };
    }

    // Prepare entry data
    const timestamp = new Date();
    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() + this.retentionYears);

    const logData: Partial<ComplianceAuditLogAttributes> = {
      sequenceNumber,
      previousHash: this.lastHash,
      timestamp,
      eventType: entry.eventType,
      eventCategory: entry.eventCategory,
      severity: entry.severity || 'info',
      actorType: entry.actor.type,
      actorId: entry.actor.id,
      actorName: entry.actor.name,
      actorIp: entry.actor.ip,
      actorUserAgent: entry.actor.userAgent,
      resourceType: entry.resource.type,
      resourceId: entry.resource.id,
      resourceName: entry.resource.name,
      action: entry.action,
      outcome: entry.outcome,
      details: entry.details || {},
      changes,
      complianceContext: entry.complianceContext,
      verified: true,
      retentionDate,
    };

    // Compute hash
    const currentHash = this.computeHash(logData);
    logData.currentHash = currentHash;

    // Sign if key available
    if (this.signingKey) {
      logData.signature = this.sign(currentHash);
    }

    // Create log entry
    const log = await ComplianceAuditLog.create(logData as any);

    // Update chain state
    this.lastHash = currentHash;

    return log;
  }

  /**
   * Compute SHA-256 hash for an entry
   */
  private computeHash(data: Partial<ComplianceAuditLogAttributes>): string {
    const hashData = JSON.stringify({
      sequenceNumber: data.sequenceNumber,
      previousHash: data.previousHash,
      timestamp: data.timestamp,
      eventType: data.eventType,
      eventCategory: data.eventCategory,
      actorType: data.actorType,
      actorId: data.actorId,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      action: data.action,
      outcome: data.outcome,
      details: data.details,
    });

    return crypto.createHash('sha256').update(hashData).digest('hex');
  }

  /**
   * Sign a hash with the signing key
   */
  private sign(hash: string): string {
    if (!this.signingKey) return '';

    const hmac = crypto.createHmac('sha256', this.signingKey);
    hmac.update(hash);
    return hmac.digest('hex');
  }

  /**
   * Calculate diff between before and after states
   */
  private calculateDiff(before?: Record<string, any>, after?: Record<string, any>): string[] {
    const diff: string[] = [];
    if (!before && !after) return diff;

    const allKeys = new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]);

    for (const key of allKeys) {
      const beforeVal = before?.[key];
      const afterVal = after?.[key];

      if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
        if (beforeVal === undefined) {
          diff.push(`+ ${key}`);
        } else if (afterVal === undefined) {
          diff.push(`- ${key}`);
        } else {
          diff.push(`~ ${key}`);
        }
      }
    }

    return diff;
  }

  /**
   * Query audit logs
   */
  async query(options: AuditQueryOptions): Promise<{
    logs: ComplianceAuditLog[];
    total: number;
    hasMore: boolean;
  }> {
    const { Op } = await import('sequelize');
    const where: any = {};

    if (options.startDate || options.endDate) {
      where.timestamp = {};
      if (options.startDate) where.timestamp[Op.gte] = options.startDate;
      if (options.endDate) where.timestamp[Op.lte] = options.endDate;
    }

    if (options.eventTypes?.length) {
      where.eventType = { [Op.in]: options.eventTypes };
    }

    if (options.eventCategories?.length) {
      where.eventCategory = { [Op.in]: options.eventCategories };
    }

    if (options.severities?.length) {
      where.severity = { [Op.in]: options.severities };
    }

    if (options.actorTypes?.length) {
      where.actorType = { [Op.in]: options.actorTypes };
    }

    if (options.actorId) {
      where.actorId = options.actorId;
    }

    if (options.resourceTypes?.length) {
      where.resourceType = { [Op.in]: options.resourceTypes };
    }

    if (options.resourceId) {
      where.resourceId = options.resourceId;
    }

    if (options.outcomes?.length) {
      where.outcome = { [Op.in]: options.outcomes };
    }

    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const { count, rows } = await ComplianceAuditLog.findAndCountAll({
      where,
      order: [['sequenceNumber', 'DESC']],
      limit,
      offset,
    });

    return {
      logs: rows,
      total: count,
      hasMore: offset + rows.length < count,
    };
  }

  /**
   * Verify the integrity of the audit chain
   */
  async verifyChain(fromSequence?: number): Promise<ChainVerificationResult> {
    const result = await ComplianceAuditLog.verifyChain(fromSequence);
    return {
      ...result,
      verifiedAt: new Date(),
    };
  }

  /**
   * Export logs for external audit
   */
  async exportForAudit(startDate: Date, endDate: Date, options?: {
    eventTypes?: string[];
    resourceTypes?: string[];
    includeDetails?: boolean;
    format?: 'json' | 'csv';
  }): Promise<{
    exportId: string;
    count: number;
    data: any;
    chainValid: boolean;
    exportedAt: Date;
  }> {
    const result = await ComplianceAuditLog.exportForAudit(startDate, endDate, {
      eventTypes: options?.eventTypes,
      resourceTypes: options?.resourceTypes,
      includeDetails: options?.includeDetails,
    });

    let data: any = result.logs;

    if (options?.format === 'csv') {
      data = this.convertToCSV(result.logs);
    }

    // Log the export event
    this.log({
      eventType: 'audit.export',
      eventCategory: 'system',
      severity: 'info',
      actor: { type: 'system', name: 'SOC2AuditLogger' },
      resource: { type: 'audit_log', id: result.exportId },
      action: 'export',
      outcome: 'success',
      details: {
        startDate,
        endDate,
        count: result.count,
        format: options?.format || 'json',
      },
    });

    return {
      exportId: result.exportId,
      count: result.count,
      data,
      chainValid: result.chainValid,
      exportedAt: result.exportedAt,
    };
  }

  /**
   * Convert logs to CSV format
   */
  private convertToCSV(logs: Partial<ComplianceAuditLogAttributes>[]): string {
    const headers = [
      'sequenceNumber',
      'timestamp',
      'eventType',
      'eventCategory',
      'severity',
      'actorType',
      'actorId',
      'actorName',
      'resourceType',
      'resourceId',
      'resourceName',
      'action',
      'outcome',
      'currentHash',
      'verified',
    ];

    const rows = logs.map(log => headers.map(h => {
      const value = (log as any)[h];
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value).replace(/"/g, '""');
    }).map(v => `"${v}"`).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Get audit statistics
   */
  async getStatistics(days: number = 30): Promise<{
    totalEntries: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    byOutcome: Record<string, number>;
    chainIntegrity: boolean;
    oldestEntry?: Date;
    newestEntry?: Date;
  }> {
    const { Op, fn, col } = await import('sequelize');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [total, byCategory, bySeverity, byOutcome, oldest, newest] = await Promise.all([
      ComplianceAuditLog.count({
        where: { timestamp: { [Op.gte]: startDate } },
      }),
      ComplianceAuditLog.findAll({
        attributes: ['eventCategory', [fn('COUNT', '*'), 'count']],
        where: { timestamp: { [Op.gte]: startDate } },
        group: ['eventCategory'],
        raw: true,
      }),
      ComplianceAuditLog.findAll({
        attributes: ['severity', [fn('COUNT', '*'), 'count']],
        where: { timestamp: { [Op.gte]: startDate } },
        group: ['severity'],
        raw: true,
      }),
      ComplianceAuditLog.findAll({
        attributes: ['outcome', [fn('COUNT', '*'), 'count']],
        where: { timestamp: { [Op.gte]: startDate } },
        group: ['outcome'],
        raw: true,
      }),
      ComplianceAuditLog.findOne({
        order: [['timestamp', 'ASC']],
        attributes: ['timestamp'],
      }),
      ComplianceAuditLog.findOne({
        order: [['timestamp', 'DESC']],
        attributes: ['timestamp'],
      }),
    ]);

    // Quick chain verification (check last 100 entries)
    const chainCheck = await this.verifyChain(Math.max(1, this.sequenceCounter - 100));

    return {
      totalEntries: total,
      byCategory: Object.fromEntries((byCategory as any[]).map(r => [r.eventCategory, parseInt(r.count)])),
      bySeverity: Object.fromEntries((bySeverity as any[]).map(r => [r.severity, parseInt(r.count)])),
      byOutcome: Object.fromEntries((byOutcome as any[]).map(r => [r.outcome, parseInt(r.count)])),
      chainIntegrity: chainCheck.valid,
      oldestEntry: oldest?.timestamp,
      newestEntry: newest?.timestamp,
    };
  }

  /**
   * Cleanup old entries past retention date
   */
  async cleanupExpired(): Promise<number> {
    const { Op } = await import('sequelize');

    const deleted = await ComplianceAuditLog.destroy({
      where: {
        retentionDate: { [Op.lt]: new Date() },
      },
    });

    if (deleted > 0) {
      this.log({
        eventType: 'audit.cleanup',
        eventCategory: 'system',
        severity: 'info',
        actor: { type: 'system', name: 'SOC2AuditLogger' },
        resource: { type: 'audit_log' },
        action: 'cleanup_expired',
        outcome: 'success',
        details: { deletedCount: deleted },
      });
    }

    return deleted;
  }

  /**
   * Shutdown the logger gracefully
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush
    await this.flushQueue();

    this.initialized = false;
    console.log('[SOC2Audit] Service shut down');
  }
}

export const soc2AuditLogger = new SOC2AuditLogger();
export default soc2AuditLogger;
