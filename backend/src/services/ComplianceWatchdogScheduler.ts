/**
 * Compliance Watchdog Scheduler
 *
 * Proactive monitoring system for compliance-related expirations and issues.
 * Runs periodic checks for:
 * - Expiring purchase contracts
 * - Expiring broker licenses
 * - Stale deals (inactive for X days)
 * - Expiring E&O insurance policies
 * - Properties needing compliance re-check
 * - Document signature expirations
 *
 * Integrates with:
 * - StateComplianceRule for state-specific rules
 * - BrokerProfile for license tracking
 * - Property for contract/deal tracking
 * - NotificationService for alerts
 * - AutomationEngine for event triggers
 */

import cron from 'node-cron';
import { Op } from 'sequelize';
import Property from '../models/Property';
import BrokerProfile from '../models/BrokerProfile';
import DocuSealSubmission from '../models/DocuSealSubmission';
import ComplianceCheck from '../models/ComplianceCheck';
import { notificationService } from './NotificationService';
import { complianceService } from './ComplianceService';
import { complianceTriggerService } from './ComplianceTriggerService';

// Alert types for categorization
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

export interface ComplianceAlert {
  id: string;
  type: ComplianceAlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  resourceType: 'property' | 'broker' | 'document';
  resourceId: string | number;
  metadata: Record<string, any>;
  daysUntilExpiration?: number;
  createdAt: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

export interface WatchdogConfig {
  // Check intervals
  checkInterval: string; // Cron expression (default: every 6 hours)

  // Contract expiration thresholds (days)
  contractWarningDays: number; // Default: 14
  contractCriticalDays: number; // Default: 7
  contractUrgentDays: number; // Default: 3

  // License expiration thresholds (days)
  licenseWarningDays: number; // Default: 60
  licenseCriticalDays: number; // Default: 30
  licenseUrgentDays: number; // Default: 14

  // E&O Insurance thresholds (days)
  eoWarningDays: number; // Default: 60
  eoCriticalDays: number; // Default: 30

  // Stale deal threshold (days)
  staleDealDays: number; // Default: 30

  // MLS expiration thresholds (days)
  mlsWarningDays: number; // Default: 14
  mlsCriticalDays: number; // Default: 7

  // Compliance re-check interval (days)
  complianceRecheckDays: number; // Default: 30

  // Notification settings
  notifyOnWarning: boolean;
  notifyOnCritical: boolean;
  broadcastAlerts: boolean;

  // Email digest settings
  sendDailyDigest: boolean;
  digestHour: number; // 0-23, default: 9 (9 AM)
}

interface WatchdogStats {
  totalRuns: number;
  lastRunAt: Date | null;
  lastRunDuration: number;
  alertsGenerated: number;
  byType: Record<ComplianceAlertType, number>;
}

interface WatchdogRunResult {
  success: boolean;
  duration: number;
  alerts: ComplianceAlert[];
  summary: {
    contractsExpiring: number;
    licensesExpiring: number;
    eoInsuranceExpiring: number;
    staleDeals: number;
    documentsExpiring: number;
    complianceDegraded: number;
    mlsExpiring: number;
  };
  errors: string[];
}

class ComplianceWatchdogScheduler {
  private task: cron.ScheduledTask | null = null;
  private digestTask: cron.ScheduledTask | null = null;
  private running: boolean = false;
  private processing: boolean = false;
  private config: WatchdogConfig;
  private stats: WatchdogStats;
  private alerts: Map<string, ComplianceAlert> = new Map();

  constructor() {
    // Default configuration
    this.config = {
      checkInterval: '0 */6 * * *', // Every 6 hours
      contractWarningDays: 14,
      contractCriticalDays: 7,
      contractUrgentDays: 3,
      licenseWarningDays: 60,
      licenseCriticalDays: 30,
      licenseUrgentDays: 14,
      eoWarningDays: 60,
      eoCriticalDays: 30,
      staleDealDays: 30,
      mlsWarningDays: 14,
      mlsCriticalDays: 7,
      complianceRecheckDays: 30,
      notifyOnWarning: true,
      notifyOnCritical: true,
      broadcastAlerts: true,
      sendDailyDigest: true,
      digestHour: 9,
    };

    this.stats = {
      totalRuns: 0,
      lastRunAt: null,
      lastRunDuration: 0,
      alertsGenerated: 0,
      byType: {} as Record<ComplianceAlertType, number>,
    };
  }

  /**
   * Start the watchdog scheduler
   */
  start(cronExpression?: string): void {
    if (this.task) {
      console.log('⚠️ Compliance Watchdog already running');
      return;
    }

    const expression = cronExpression || this.config.checkInterval;

    this.task = cron.schedule(expression, async () => {
      await this.run();
    });

    // Start daily digest if enabled
    if (this.config.sendDailyDigest) {
      const digestCron = `0 ${this.config.digestHour} * * *`;
      this.digestTask = cron.schedule(digestCron, async () => {
        await this.sendDailyDigest();
      });
    }

    this.running = true;
    console.log(`✅ Compliance Watchdog started (${expression})`);

    // Run immediately on start
    this.run().catch(err => console.error('Initial watchdog run failed:', err));
  }

  /**
   * Stop the watchdog scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    if (this.digestTask) {
      this.digestTask.stop();
      this.digestTask = null;
    }
    this.running = false;
    console.log('⏹️ Compliance Watchdog stopped');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<WatchdogConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart if interval changed
    if (newConfig.checkInterval && this.task) {
      this.stop();
      this.start(newConfig.checkInterval);
    }

    // Update digest schedule if needed
    if (newConfig.sendDailyDigest !== undefined || newConfig.digestHour !== undefined) {
      if (this.digestTask) {
        this.digestTask.stop();
        this.digestTask = null;
      }
      if (this.config.sendDailyDigest) {
        const digestCron = `0 ${this.config.digestHour} * * *`;
        this.digestTask = cron.schedule(digestCron, async () => {
          await this.sendDailyDigest();
        });
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): WatchdogConfig {
    return { ...this.config };
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    processing: boolean;
    config: WatchdogConfig;
    stats: WatchdogStats;
    activeAlerts: number;
  } {
    return {
      running: this.running,
      processing: this.processing,
      config: this.config,
      stats: { ...this.stats },
      activeAlerts: this.alerts.size,
    };
  }

  /**
   * Get all active alerts
   */
  getAlerts(options?: {
    type?: ComplianceAlertType;
    severity?: AlertSeverity;
    acknowledged?: boolean;
  }): ComplianceAlert[] {
    let alerts = Array.from(this.alerts.values());

    if (options?.type) {
      alerts = alerts.filter(a => a.type === options.type);
    }
    if (options?.severity) {
      alerts = alerts.filter(a => a.severity === options.severity);
    }
    if (options?.acknowledged !== undefined) {
      alerts = alerts.filter(a => a.acknowledged === options.acknowledged);
    }

    return alerts.sort((a, b) => {
      // Sort by severity (critical first), then by days until expiration
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return (a.daysUntilExpiration || 999) - (b.daysUntilExpiration || 999);
    });
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, userId?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = userId;
    return true;
  }

  /**
   * Clear acknowledged alerts
   */
  clearAcknowledgedAlerts(): number {
    let cleared = 0;
    for (const [id, alert] of this.alerts) {
      if (alert.acknowledged) {
        this.alerts.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Main run method - executes all watchdog checks
   */
  async run(): Promise<WatchdogRunResult> {
    if (this.processing) {
      console.log('⚠️ Compliance Watchdog already processing');
      return {
        success: false,
        duration: 0,
        alerts: [],
        summary: {
          contractsExpiring: 0,
          licensesExpiring: 0,
          eoInsuranceExpiring: 0,
          staleDeals: 0,
          documentsExpiring: 0,
          complianceDegraded: 0,
          mlsExpiring: 0,
        },
        errors: ['Already processing'],
      };
    }

    this.processing = true;
    const startTime = Date.now();
    const errors: string[] = [];
    const newAlerts: ComplianceAlert[] = [];

    console.log('🔍 Compliance Watchdog running checks...');

    try {
      // Run all checks in parallel
      const [
        contractAlerts,
        licenseAlerts,
        eoAlerts,
        staleAlerts,
        documentAlerts,
        complianceAlerts,
        mlsAlerts,
      ] = await Promise.all([
        this.checkExpiringContracts().catch(e => {
          errors.push(`Contract check failed: ${e.message}`);
          return [];
        }),
        this.checkExpiringLicenses().catch(e => {
          errors.push(`License check failed: ${e.message}`);
          return [];
        }),
        this.checkExpiringEOInsurance().catch(e => {
          errors.push(`E&O check failed: ${e.message}`);
          return [];
        }),
        this.checkStaleDeals().catch(e => {
          errors.push(`Stale deals check failed: ${e.message}`);
          return [];
        }),
        this.checkExpiringDocuments().catch(e => {
          errors.push(`Document check failed: ${e.message}`);
          return [];
        }),
        this.checkComplianceDegradation().catch(e => {
          errors.push(`Compliance check failed: ${e.message}`);
          return [];
        }),
        this.checkExpiringMLS().catch(e => {
          errors.push(`MLS check failed: ${e.message}`);
          return [];
        }),
      ]);

      // Combine all alerts
      newAlerts.push(
        ...contractAlerts,
        ...licenseAlerts,
        ...eoAlerts,
        ...staleAlerts,
        ...documentAlerts,
        ...complianceAlerts,
        ...mlsAlerts
      );

      // Store alerts (update existing or add new)
      for (const alert of newAlerts) {
        this.alerts.set(alert.id, alert);

        // Update stats
        this.stats.byType[alert.type] = (this.stats.byType[alert.type] || 0) + 1;

        // Send notifications for new critical/warning alerts
        if (this.config.broadcastAlerts) {
          if (
            (alert.severity === 'critical' && this.config.notifyOnCritical) ||
            (alert.severity === 'warning' && this.config.notifyOnWarning)
          ) {
            this.sendAlertNotification(alert);
          }
        }
      }

      const duration = Date.now() - startTime;

      // Update stats
      this.stats.totalRuns++;
      this.stats.lastRunAt = new Date();
      this.stats.lastRunDuration = duration;
      this.stats.alertsGenerated += newAlerts.length;

      const summary = {
        contractsExpiring: contractAlerts.length,
        licensesExpiring: licenseAlerts.length,
        eoInsuranceExpiring: eoAlerts.length,
        staleDeals: staleAlerts.length,
        documentsExpiring: documentAlerts.length,
        complianceDegraded: complianceAlerts.length,
        mlsExpiring: mlsAlerts.length,
      };

      console.log(
        `✅ Compliance Watchdog completed in ${duration}ms: ` +
          `${newAlerts.length} alerts (` +
          `${summary.contractsExpiring} contracts, ` +
          `${summary.licensesExpiring} licenses, ` +
          `${summary.staleDeals} stale deals)`
      );

      return {
        success: true,
        duration,
        alerts: newAlerts,
        summary,
        errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(message);
      console.error('Compliance Watchdog run failed:', error);

      return {
        success: false,
        duration: Date.now() - startTime,
        alerts: newAlerts,
        summary: {
          contractsExpiring: 0,
          licensesExpiring: 0,
          eoInsuranceExpiring: 0,
          staleDeals: 0,
          documentsExpiring: 0,
          complianceDegraded: 0,
          mlsExpiring: 0,
        },
        errors,
      };
    } finally {
      this.processing = false;
    }
  }

  /**
   * Check for expiring purchase contracts
   */
  private async checkExpiringContracts(): Promise<ComplianceAlert[]> {
    const alerts: ComplianceAlert[] = [];
    const now = new Date();

    // Calculate date thresholds
    const urgentDate = new Date(now);
    urgentDate.setDate(urgentDate.getDate() + this.config.contractUrgentDays);

    const criticalDate = new Date(now);
    criticalDate.setDate(criticalDate.getDate() + this.config.contractCriticalDays);

    const warningDate = new Date(now);
    warningDate.setDate(warningDate.getDate() + this.config.contractWarningDays);

    // Find properties with expiring contracts
    const properties = await Property.findAll({
      where: {
        purchaseContractExpiration: {
          [Op.and]: [{ [Op.not]: null } as any, { [Op.lte]: warningDate }],
        },
        approvalStatus: {
          [Op.notIn]: ['rejected'],
        },
      } as any,
      attributes: [
        'id',
        'propertyId',
        'address',
        'city',
        'state',
        'purchaseContractExpiration',
        'wholesalerLlcName',
        'approvalStatus',
      ],
    });

    for (const property of properties) {
      const expDate = new Date(property.purchaseContractExpiration!);
      const daysUntil = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let severity: AlertSeverity = 'info';
      let type: ComplianceAlertType = 'contract_expiring';

      if (daysUntil <= 0) {
        severity = 'critical';
        type = 'contract_expired';
      } else if (daysUntil <= this.config.contractUrgentDays) {
        severity = 'critical';
      } else if (daysUntil <= this.config.contractCriticalDays) {
        severity = 'warning';
      }

      const addressStr =
        typeof property.address === 'object'
          ? `${(property.address as any).houseNumber || ''} ${(property.address as any).street || ''}`
          : String(property.address);

      alerts.push({
        id: `contract-${property.id}-${expDate.toISOString().split('T')[0]}`,
        type,
        severity,
        title:
          daysUntil <= 0
            ? 'Contract Expired'
            : `Contract Expiring in ${daysUntil} Day${daysUntil === 1 ? '' : 's'}`,
        message:
          daysUntil <= 0
            ? `Purchase contract for ${addressStr}, ${property.city}, ${property.state} has expired.`
            : `Purchase contract for ${addressStr}, ${property.city}, ${property.state} expires on ${expDate.toLocaleDateString()}.`,
        resourceType: 'property',
        resourceId: property.id,
        metadata: {
          propertyId: property.propertyId,
          address: addressStr,
          city: property.city,
          state: property.state,
          expirationDate: expDate.toISOString(),
          wholesaler: property.wholesalerLlcName,
          approvalStatus: property.approvalStatus,
        },
        daysUntilExpiration: daysUntil,
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    return alerts;
  }

  /**
   * Check for expiring broker licenses
   */
  private async checkExpiringLicenses(): Promise<ComplianceAlert[]> {
    const alerts: ComplianceAlert[] = [];
    const now = new Date();

    const warningDate = new Date(now);
    warningDate.setDate(warningDate.getDate() + this.config.licenseWarningDays);

    const brokers = await BrokerProfile.findAll({
      where: {
        status: 'approved',
        licenseExpirationDate: {
          [Op.lte]: warningDate,
        },
      },
    });

    for (const broker of brokers) {
      const expDate = new Date(broker.licenseExpirationDate);
      const daysUntil = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let severity: AlertSeverity = 'info';
      let type: ComplianceAlertType = 'license_expiring';

      if (daysUntil <= 0) {
        severity = 'critical';
        type = 'license_expired';
      } else if (daysUntil <= this.config.licenseUrgentDays) {
        severity = 'critical';
      } else if (daysUntil <= this.config.licenseCriticalDays) {
        severity = 'warning';
      }

      alerts.push({
        id: `license-${broker.id}-${expDate.toISOString().split('T')[0]}`,
        type,
        severity,
        title:
          daysUntil <= 0
            ? 'Broker License Expired'
            : `Broker License Expiring in ${daysUntil} Day${daysUntil === 1 ? '' : 's'}`,
        message:
          daysUntil <= 0
            ? `License #${broker.licenseNumber} (${broker.licenseState}) for ${broker.brokerageCompany} has expired.`
            : `License #${broker.licenseNumber} (${broker.licenseState}) for ${broker.brokerageCompany} expires on ${expDate.toLocaleDateString()}.`,
        resourceType: 'broker',
        resourceId: broker.id,
        metadata: {
          brokerId: broker.id,
          userId: broker.userId,
          licenseNumber: broker.licenseNumber,
          licenseState: broker.licenseState,
          brokerageCompany: broker.brokerageCompany,
          expirationDate: expDate.toISOString(),
          activeDeals: broker.activeDeals,
        },
        daysUntilExpiration: daysUntil,
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    return alerts;
  }

  /**
   * Check for expiring E&O insurance policies
   */
  private async checkExpiringEOInsurance(): Promise<ComplianceAlert[]> {
    const alerts: ComplianceAlert[] = [];
    const now = new Date();

    const warningDate = new Date(now);
    warningDate.setDate(warningDate.getDate() + this.config.eoWarningDays);

    const brokers = await BrokerProfile.findAll({
      where: {
        status: 'approved',
        eoExpirationDate: {
          [Op.and]: [{ [Op.not]: null } as any, { [Op.lte]: warningDate }],
        },
      } as any,
    });

    for (const broker of brokers) {
      const expDate = new Date(broker.eoExpirationDate!);
      const daysUntil = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let severity: AlertSeverity = 'info';
      let type: ComplianceAlertType = 'eo_insurance_expiring';

      if (daysUntil <= 0) {
        severity = 'critical';
        type = 'eo_insurance_expired';
      } else if (daysUntil <= this.config.eoCriticalDays) {
        severity = 'warning';
      }

      alerts.push({
        id: `eo-${broker.id}-${expDate.toISOString().split('T')[0]}`,
        type,
        severity,
        title:
          daysUntil <= 0
            ? 'E&O Insurance Expired'
            : `E&O Insurance Expiring in ${daysUntil} Day${daysUntil === 1 ? '' : 's'}`,
        message:
          daysUntil <= 0
            ? `E&O insurance policy ${broker.eoInsurancePolicy} for ${broker.brokerageCompany} has expired.`
            : `E&O insurance policy ${broker.eoInsurancePolicy} for ${broker.brokerageCompany} expires on ${expDate.toLocaleDateString()}.`,
        resourceType: 'broker',
        resourceId: broker.id,
        metadata: {
          brokerId: broker.id,
          policyNumber: broker.eoInsurancePolicy,
          brokerageCompany: broker.brokerageCompany,
          expirationDate: expDate.toISOString(),
        },
        daysUntilExpiration: daysUntil,
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    return alerts;
  }

  /**
   * Check for stale deals (inactive for X days)
   */
  private async checkStaleDeals(): Promise<ComplianceAlert[]> {
    const alerts: ComplianceAlert[] = [];
    const now = new Date();

    const staleDate = new Date(now);
    staleDate.setDate(staleDate.getDate() - this.config.staleDealDays);

    // Find properties that haven't been updated in staleDealDays
    // and are still in active workflow states
    const properties = await Property.findAll({
      where: {
        updatedAt: {
          [Op.lte]: staleDate,
        },
        approvalStatus: {
          [Op.in]: ['draft', 'pending_broker_approval'],
        },
      },
      attributes: [
        'id',
        'propertyId',
        'address',
        'city',
        'state',
        'updatedAt',
        'approvalStatus',
        'wholesalerLlcName',
      ],
    });

    for (const property of properties) {
      const lastUpdate = new Date(property.updatedAt);
      const daysInactive = Math.ceil((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));

      const addressStr =
        typeof property.address === 'object'
          ? `${(property.address as any).houseNumber || ''} ${(property.address as any).street || ''}`
          : String(property.address);

      alerts.push({
        id: `stale-${property.id}-${now.toISOString().split('T')[0]}`,
        type: 'deal_stale',
        severity: daysInactive > this.config.staleDealDays * 2 ? 'warning' : 'info',
        title: `Deal Inactive for ${daysInactive} Days`,
        message: `${addressStr}, ${property.city}, ${property.state} has been inactive since ${lastUpdate.toLocaleDateString()}. Status: ${property.approvalStatus}`,
        resourceType: 'property',
        resourceId: property.id,
        metadata: {
          propertyId: property.propertyId,
          address: addressStr,
          city: property.city,
          state: property.state,
          lastUpdate: lastUpdate.toISOString(),
          daysInactive,
          approvalStatus: property.approvalStatus,
          wholesaler: property.wholesalerLlcName,
        },
        daysUntilExpiration: -daysInactive, // Negative = already past
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    return alerts;
  }

  /**
   * Check for expiring document signatures
   */
  private async checkExpiringDocuments(): Promise<ComplianceAlert[]> {
    const alerts: ComplianceAlert[] = [];

    try {
      // Check if DocuSealSubmission model exists and has the method
      if (typeof DocuSealSubmission.findExpiringSoon === 'function') {
        const expiringDocs = await DocuSealSubmission.findExpiringSoon(48); // 48 hours

        for (const doc of expiringDocs) {
          const expDate = doc.expireAt ? new Date(doc.expireAt) : null;
          if (!expDate) continue;

          const now = new Date();
          const hoursUntil = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60));
          const daysUntil = Math.ceil(hoursUntil / 24);

          alerts.push({
            id: `doc-${doc.id}-${expDate.toISOString().split('T')[0]}`,
            type: 'document_expiring',
            severity: hoursUntil <= 24 ? 'critical' : 'warning',
            title: `Document Signature Expiring in ${hoursUntil} Hours`,
            message: `"${doc.templateName || 'Contract'}" requires signature before ${expDate.toLocaleString()}`,
            resourceType: 'document',
            resourceId: doc.id,
            metadata: {
              submissionId: doc.id,
              docuSealSubmissionId: doc.docuSealSubmissionId,
              templateName: doc.templateName,
              propertyId: doc.propertyId,
              expirationDate: expDate.toISOString(),
              status: doc.status,
              reminderCount: doc.reminderCount,
            },
            daysUntilExpiration: daysUntil,
            createdAt: new Date(),
            acknowledged: false,
          });
        }
      }
    } catch (error) {
      console.warn('Document expiration check skipped:', (error as Error).message);
    }

    return alerts;
  }

  /**
   * Check for properties that need compliance re-check
   */
  private async checkComplianceDegradation(): Promise<ComplianceAlert[]> {
    const alerts: ComplianceAlert[] = [];
    const now = new Date();

    const recheckDate = new Date(now);
    recheckDate.setDate(recheckDate.getDate() - this.config.complianceRecheckDays);

    // Find properties with old compliance checks
    const properties = await Property.findAll({
      where: {
        approvalStatus: {
          [Op.in]: ['live', 'approved'],
        },
        status: 'Green', // Only check previously compliant properties
      },
      attributes: ['id', 'propertyId', 'address', 'city', 'state', 'status'],
    });

    for (const property of properties) {
      // Get last compliance check
      const lastCheck = await ComplianceCheck.findOne({
        where: { propertyId: property.id },
        order: [['checkedAt', 'DESC']],
      });

      if (!lastCheck || new Date(lastCheck.checkedAt) < recheckDate) {
        // Re-run compliance check
        try {
          const result = await complianceService.checkProperty(property, { autoRemediate: false });

          // Alert if compliance status degraded
          if (result.status !== 'Green') {
            const addressStr =
              typeof property.address === 'object'
                ? `${(property.address as any).houseNumber || ''} ${(property.address as any).street || ''}`
                : String(property.address);

            alerts.push({
              id: `compliance-${property.id}-${now.toISOString().split('T')[0]}`,
              type: 'compliance_degraded',
              severity: result.status === 'Red' ? 'critical' : 'warning',
              title: `Compliance Status Changed to ${result.status}`,
              message: `${addressStr}, ${property.city}, ${property.state} now has ${result.failedRules} compliance issue(s).`,
              resourceType: 'property',
              resourceId: property.id,
              metadata: {
                propertyId: property.propertyId,
                address: addressStr,
                city: property.city,
                state: property.state,
                previousStatus: 'Green',
                newStatus: result.status,
                issues: result.issues,
                checkId: result.checkId,
              },
              createdAt: new Date(),
              acknowledged: false,
            });

            // Update property status
            await property.update({
              status: result.status,
              complianceNotes: result.issues.map(i => i.message),
            });

            // Fire compliance trigger for degraded status
            complianceTriggerService
              .handlePropertyEvent('compliance.alert.created', property.id, {
                alertType: 'compliance_degraded',
                previousStatus: 'Green',
                newStatus: result.status,
                issues: result.issues,
                state: property.state,
              })
              .catch(err => console.warn('Compliance degraded trigger failed:', err.message));
          }
        } catch (error) {
          console.warn(`Failed to re-check compliance for property ${property.id}:`, error);
        }
      }
    }

    return alerts;
  }

  /**
   * Check for expiring MLS listings
   */
  private async checkExpiringMLS(): Promise<ComplianceAlert[]> {
    const alerts: ComplianceAlert[] = [];
    const now = new Date();

    const warningDate = new Date(now);
    warningDate.setDate(warningDate.getDate() + this.config.mlsWarningDays);

    const properties = await Property.findAll({
      where: {
        listedOnMLS: true,
        mlsExpirationDate: {
          [Op.and]: [{ [Op.not]: null } as any, { [Op.lte]: warningDate }],
        },
      } as any,
      attributes: [
        'id',
        'propertyId',
        'address',
        'city',
        'state',
        'mlsNumber',
        'mlsExpirationDate',
      ],
    });

    for (const property of properties) {
      const expDate = new Date(property.mlsExpirationDate!);
      const daysUntil = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const addressStr =
        typeof property.address === 'object'
          ? `${(property.address as any).houseNumber || ''} ${(property.address as any).street || ''}`
          : String(property.address);

      alerts.push({
        id: `mls-${property.id}-${expDate.toISOString().split('T')[0]}`,
        type: 'mls_expiring',
        severity: daysUntil <= this.config.mlsCriticalDays ? 'warning' : 'info',
        title: `MLS Listing Expiring in ${daysUntil} Day${daysUntil === 1 ? '' : 's'}`,
        message: `MLS #${property.mlsNumber} for ${addressStr}, ${property.city}, ${property.state} expires on ${expDate.toLocaleDateString()}.`,
        resourceType: 'property',
        resourceId: property.id,
        metadata: {
          propertyId: property.propertyId,
          address: addressStr,
          city: property.city,
          state: property.state,
          mlsNumber: property.mlsNumber,
          expirationDate: expDate.toISOString(),
        },
        daysUntilExpiration: daysUntil,
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    return alerts;
  }

  /**
   * Send notification for an alert
   */
  private sendAlertNotification(alert: ComplianceAlert): void {
    try {
      if (notificationService && typeof notificationService.broadcast === 'function') {
        const icon =
          alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';

        notificationService.broadcast({
          type: 'system',
          title: `${icon} ${alert.title}`,
          message: alert.message,
          data: {
            category: 'compliance_watchdog',
            alertId: alert.id,
            alertType: alert.type,
            severity: alert.severity,
            resourceType: alert.resourceType,
            resourceId: alert.resourceId,
            daysUntilExpiration: alert.daysUntilExpiration,
          },
        });
      }
    } catch (error) {
      console.warn('Failed to send alert notification:', error);
    }
  }

  /**
   * Send daily digest email
   */
  private async sendDailyDigest(): Promise<void> {
    const activeAlerts = this.getAlerts({ acknowledged: false });

    if (activeAlerts.length === 0) {
      console.log('📧 No active alerts for daily digest');
      return;
    }

    const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
    const warningCount = activeAlerts.filter(a => a.severity === 'warning').length;

    console.log(
      `📧 Daily compliance digest: ${activeAlerts.length} alerts (${criticalCount} critical, ${warningCount} warnings)`
    );

    // Broadcast digest notification
    if (notificationService && typeof notificationService.broadcast === 'function') {
      notificationService.broadcast({
        type: 'system',
        title: '📋 Daily Compliance Digest',
        message: `${activeAlerts.length} active alerts: ${criticalCount} critical, ${warningCount} warnings`,
        data: {
          category: 'compliance_digest',
          totalAlerts: activeAlerts.length,
          criticalCount,
          warningCount,
          alerts: activeAlerts.slice(0, 10).map(a => ({
            id: a.id,
            type: a.type,
            severity: a.severity,
            title: a.title,
          })),
        },
      });
    }
  }

  /**
   * Manual trigger for specific check types
   */
  async runCheck(
    checkType:
      | 'contracts'
      | 'licenses'
      | 'eo_insurance'
      | 'stale_deals'
      | 'documents'
      | 'compliance'
      | 'mls'
  ): Promise<ComplianceAlert[]> {
    switch (checkType) {
      case 'contracts':
        return this.checkExpiringContracts();
      case 'licenses':
        return this.checkExpiringLicenses();
      case 'eo_insurance':
        return this.checkExpiringEOInsurance();
      case 'stale_deals':
        return this.checkStaleDeals();
      case 'documents':
        return this.checkExpiringDocuments();
      case 'compliance':
        return this.checkComplianceDegradation();
      case 'mls':
        return this.checkExpiringMLS();
      default:
        return [];
    }
  }
}

// Export singleton instance
export const complianceWatchdogScheduler = new ComplianceWatchdogScheduler();
export default complianceWatchdogScheduler;
