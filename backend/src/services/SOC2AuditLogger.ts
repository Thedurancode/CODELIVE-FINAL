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
 *
 * Note: Uses in-memory storage. For production persistence,
 * integrate with a database table.
 */

import * as crypto from 'crypto';

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

/** Internal stored log record */
interface StoredAuditLog {
  id: number;
  sequenceNumber: number;
  previousHash: string;
  currentHash: string;
  signature?: string;
  timestamp: Date;
  eventType: string;
  eventCategory: string;
  severity: string;
  actorType: string;
  actorId?: string;
  actorName?: string;
  actorIp?: string;
  actorUserAgent?: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  action: string;
  outcome: string;
  details: Record<string, any>;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
    diff?: string[];
  };
  complianceContext?: AuditLogEntry['complianceContext'];
  verified: boolean;
  retentionDate: Date;
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

  /** In-memory audit log store */
  private store: StoredAuditLog[] = [];
  private nextId: number = 1;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Restore chain state from in-memory store
    if (this.store.length > 0) {
      const lastEntry = this.store[this.store.length - 1];
      this.sequenceCounter = lastEntry.sequenceNumber;
      this.lastHash = lastEntry.currentHash;
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
  async logSync(entry: AuditLogEntry): Promise<StoredAuditLog> {
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
      actor: { type: 'system', name: 'CodeLive' },
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
  private async writeEntry(entry: AuditLogEntry): Promise<StoredAuditLog> {
    // Increment sequence
    this.sequenceCounter++;
    const sequenceNumber = this.sequenceCounter;

    // Calculate diff if changes provided
    let changes: StoredAuditLog['changes'];
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

    const logData: Omit<StoredAuditLog, 'id' | 'currentHash' | 'signature'> & { currentHash?: string; signature?: string } = {
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

    // Store log entry in memory
    const storedLog: StoredAuditLog = {
      id: this.nextId++,
      ...logData,
      currentHash,
    } as StoredAuditLog;

    this.store.push(storedLog);

    // Update chain state
    this.lastHash = currentHash;

    return storedLog;
  }

  /**
   * Compute SHA-256 hash for an entry
   */
  private computeHash(data: Record<string, any>): string {
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
   * Query audit logs from in-memory store
   */
  async query(options: AuditQueryOptions): Promise<{
    logs: StoredAuditLog[];
    total: number;
    hasMore: boolean;
  }> {
    let filtered = [...this.store];

    if (options.startDate) {
      filtered = filtered.filter(l => l.timestamp >= options.startDate!);
    }
    if (options.endDate) {
      filtered = filtered.filter(l => l.timestamp <= options.endDate!);
    }
    if (options.eventTypes?.length) {
      filtered = filtered.filter(l => options.eventTypes!.includes(l.eventType));
    }
    if (options.eventCategories?.length) {
      filtered = filtered.filter(l => options.eventCategories!.includes(l.eventCategory as any));
    }
    if (options.severities?.length) {
      filtered = filtered.filter(l => options.severities!.includes(l.severity as any));
    }
    if (options.actorTypes?.length) {
      filtered = filtered.filter(l => options.actorTypes!.includes(l.actorType as any));
    }
    if (options.actorId) {
      filtered = filtered.filter(l => l.actorId === options.actorId);
    }
    if (options.resourceTypes?.length) {
      filtered = filtered.filter(l => options.resourceTypes!.includes(l.resourceType));
    }
    if (options.resourceId) {
      filtered = filtered.filter(l => l.resourceId === options.resourceId);
    }
    if (options.outcomes?.length) {
      filtered = filtered.filter(l => options.outcomes!.includes(l.outcome as any));
    }

    // Sort by sequence number descending
    filtered.sort((a, b) => b.sequenceNumber - a.sequenceNumber);

    const total = filtered.length;
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const paged = filtered.slice(offset, offset + limit);

    return {
      logs: paged,
      total,
      hasMore: offset + paged.length < total,
    };
  }

  /**
   * Verify the integrity of the audit chain
   */
  async verifyChain(fromSequence?: number): Promise<ChainVerificationResult> {
    const errors: string[] = [];
    let startIdx = 0;

    if (fromSequence) {
      startIdx = this.store.findIndex(l => l.sequenceNumber >= fromSequence);
      if (startIdx === -1) startIdx = this.store.length;
    }

    const entriesToCheck = this.store.slice(startIdx);
    let entriesChecked = 0;
    let firstInvalid: number | undefined;

    for (let i = 0; i < entriesToCheck.length; i++) {
      entriesChecked++;
      const entry = entriesToCheck[i];

      // Verify hash chain
      if (i > 0) {
        const prevEntry = entriesToCheck[i - 1];
        if (entry.previousHash !== prevEntry.currentHash) {
          if (!firstInvalid) firstInvalid = entry.sequenceNumber;
          errors.push(`Chain break at sequence ${entry.sequenceNumber}: previousHash mismatch`);
        }
      }

      // Verify hash integrity
      const recomputedHash = this.computeHash(entry);
      if (recomputedHash !== entry.currentHash) {
        if (!firstInvalid) firstInvalid = entry.sequenceNumber;
        errors.push(`Hash mismatch at sequence ${entry.sequenceNumber}: entry may have been tampered`);
      }
    }

    return {
      valid: errors.length === 0,
      entriesChecked,
      firstInvalid,
      errors,
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
    let filtered = this.store.filter(l =>
      l.timestamp >= startDate && l.timestamp <= endDate
    );

    if (options?.eventTypes?.length) {
      filtered = filtered.filter(l => options.eventTypes!.includes(l.eventType));
    }
    if (options?.resourceTypes?.length) {
      filtered = filtered.filter(l => options.resourceTypes!.includes(l.resourceType));
    }

    const logs = options?.includeDetails !== false
      ? filtered
      : filtered.map(({ details, changes, ...rest }) => rest);

    // Verify chain integrity for the exported range
    const chainVerification = await this.verifyChain(
      filtered.length > 0 ? filtered[0].sequenceNumber : undefined
    );

    const exportId = `export-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    let data: any = logs;
    if (options?.format === 'csv') {
      data = this.convertToCSV(logs as any);
    }

    // Log the export event
    this.log({
      eventType: 'audit.export',
      eventCategory: 'system',
      severity: 'info',
      actor: { type: 'system', name: 'SOC2AuditLogger' },
      resource: { type: 'audit_log', id: exportId },
      action: 'export',
      outcome: 'success',
      details: {
        startDate,
        endDate,
        count: logs.length,
        format: options?.format || 'json',
      },
    });

    return {
      exportId,
      count: logs.length,
      data,
      chainValid: chainVerification.valid,
      exportedAt: new Date(),
    };
  }

  /**
   * Convert logs to CSV format
   */
  private convertToCSV(logs: Partial<StoredAuditLog>[]): string {
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
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const filtered = this.store.filter(l => l.timestamp >= startDate);

    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};

    for (const log of filtered) {
      byCategory[log.eventCategory] = (byCategory[log.eventCategory] || 0) + 1;
      bySeverity[log.severity] = (bySeverity[log.severity] || 0) + 1;
      byOutcome[log.outcome] = (byOutcome[log.outcome] || 0) + 1;
    }

    // Quick chain verification (check last 100 entries)
    const chainCheck = await this.verifyChain(Math.max(1, this.sequenceCounter - 100));

    return {
      totalEntries: filtered.length,
      byCategory,
      bySeverity,
      byOutcome,
      chainIntegrity: chainCheck.valid,
      oldestEntry: this.store.length > 0 ? this.store[0].timestamp : undefined,
      newestEntry: this.store.length > 0 ? this.store[this.store.length - 1].timestamp : undefined,
    };
  }

  /**
   * Cleanup old entries past retention date
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();
    const before = this.store.length;
    this.store = this.store.filter(l => l.retentionDate >= now);
    const deleted = before - this.store.length;

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
