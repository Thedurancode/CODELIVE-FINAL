/**
 * Browser Automation Metrics & Monitoring
 *
 * Tracks performance, errors, and success rates:
 * - Submission metrics per site
 * - Latency tracking
 * - Error categorization
 * - Alerting on thresholds
 */

export interface SubmissionMetric {
  id: string;
  siteId: string;
  siteName: string;
  dealId: string;
  timestamp: Date;
  success: boolean;
  duration: number; // ms
  errorType?: string;
  errorMessage?: string;
  retryCount: number;
  captchaSolved: boolean;
  proxyUsed?: string;
  steps: StepMetric[];
}

export interface StepMetric {
  name: string;
  startTime: number;
  endTime: number;
  success: boolean;
  error?: string;
}

export interface SiteStats {
  siteId: string;
  siteName: string;
  totalSubmissions: number;
  successfulSubmissions: number;
  failedSubmissions: number;
  successRate: number;
  avgDuration: number;
  avgRetries: number;
  captchaSolveRate: number;
  errorBreakdown: Record<string, number>;
  lastSubmission?: Date;
  last24Hours: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface AlertConfig {
  failureRateThreshold: number; // 0-1, e.g., 0.5 = 50%
  failureCountThreshold: number; // Consecutive failures
  latencyThreshold: number; // ms
  windowMinutes: number; // Time window for rate calculation
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: string;
  siteId: string;
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  metadata?: Record<string, any>;
}

export type AlertHandler = (alert: Alert) => void | Promise<void>;

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  failureRateThreshold: 0.5, // Alert if >50% failures
  failureCountThreshold: 3, // Alert after 3 consecutive failures
  latencyThreshold: 60000, // Alert if avg latency >60s
  windowMinutes: 60, // Look at last hour
};

export class BrowserMetrics {
  private metrics: SubmissionMetric[] = [];
  private consecutiveFailures: Map<string, number> = new Map();
  private alerts: Alert[] = [];
  private alertHandlers: AlertHandler[] = [];
  private alertConfig: AlertConfig;
  private maxMetrics: number = 10000; // Keep last 10k metrics

  constructor(alertConfig: Partial<AlertConfig> = {}) {
    this.alertConfig = { ...DEFAULT_ALERT_CONFIG, ...alertConfig };
  }

  // ============================================================================
  // METRIC RECORDING
  // ============================================================================

  /**
   * Record a submission metric
   */
  record(metric: Omit<SubmissionMetric, 'id'>): void {
    const fullMetric: SubmissionMetric = {
      ...metric,
      id: `metric-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    this.metrics.push(fullMetric);

    // Track consecutive failures
    if (metric.success) {
      this.consecutiveFailures.set(metric.siteId, 0);
    } else {
      const current = this.consecutiveFailures.get(metric.siteId) || 0;
      this.consecutiveFailures.set(metric.siteId, current + 1);
    }

    // Check for alerts
    this.checkAlerts(metric.siteId);

    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log metric
    const status = metric.success ? '✅' : '❌';
    console.log(
      `${status} [${metric.siteName}] ${metric.dealId} - ${metric.duration}ms` +
        (metric.retryCount > 0 ? ` (${metric.retryCount} retries)` : '') +
        (metric.captchaSolved ? ' [CAPTCHA]' : '')
    );
  }

  /**
   * Start tracking a submission (returns a function to complete it)
   */
  startSubmission(siteId: string, siteName: string, dealId: string): SubmissionTracker {
    return new SubmissionTracker(this, siteId, siteName, dealId);
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get statistics for a specific site
   */
  getSiteStats(siteId: string): SiteStats | null {
    const siteMetrics = this.metrics.filter((m) => m.siteId === siteId);
    if (siteMetrics.length === 0) return null;

    const siteName = siteMetrics[0].siteName;
    const successful = siteMetrics.filter((m) => m.success);
    const failed = siteMetrics.filter((m) => !m.success);

    // Error breakdown
    const errorBreakdown: Record<string, number> = {};
    for (const metric of failed) {
      const errorType = metric.errorType || 'unknown';
      errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
    }

    // Last 24 hours
    const last24Hours = Date.now() - 24 * 60 * 60 * 1000;
    const recentMetrics = siteMetrics.filter((m) => m.timestamp.getTime() > last24Hours);
    const recentSuccessful = recentMetrics.filter((m) => m.success);

    // CAPTCHA stats
    const captchaSolved = siteMetrics.filter((m) => m.captchaSolved).length;

    return {
      siteId,
      siteName,
      totalSubmissions: siteMetrics.length,
      successfulSubmissions: successful.length,
      failedSubmissions: failed.length,
      successRate: siteMetrics.length > 0 ? successful.length / siteMetrics.length : 0,
      avgDuration: successful.length > 0
        ? successful.reduce((sum, m) => sum + m.duration, 0) / successful.length
        : 0,
      avgRetries: siteMetrics.length > 0
        ? siteMetrics.reduce((sum, m) => sum + m.retryCount, 0) / siteMetrics.length
        : 0,
      captchaSolveRate: siteMetrics.length > 0 ? captchaSolved / siteMetrics.length : 0,
      errorBreakdown,
      lastSubmission: siteMetrics.length > 0 ? siteMetrics[siteMetrics.length - 1].timestamp : undefined,
      last24Hours: {
        total: recentMetrics.length,
        successful: recentSuccessful.length,
        failed: recentMetrics.length - recentSuccessful.length,
      },
    };
  }

  /**
   * Get statistics for all sites
   */
  getAllSiteStats(): SiteStats[] {
    const siteIds = [...new Set(this.metrics.map((m) => m.siteId))];
    return siteIds.map((id) => this.getSiteStats(id)!).filter(Boolean);
  }

  /**
   * Get overall statistics
   */
  getOverallStats(): {
    totalSubmissions: number;
    successRate: number;
    avgDuration: number;
    siteCount: number;
    last24Hours: { total: number; successful: number; failed: number };
    topErrors: Array<{ error: string; count: number }>;
  } {
    const successful = this.metrics.filter((m) => m.success);
    const siteIds = new Set(this.metrics.map((m) => m.siteId));

    // Last 24 hours
    const last24Hours = Date.now() - 24 * 60 * 60 * 1000;
    const recentMetrics = this.metrics.filter((m) => m.timestamp.getTime() > last24Hours);
    const recentSuccessful = recentMetrics.filter((m) => m.success);

    // Top errors
    const errorCounts: Record<string, number> = {};
    for (const metric of this.metrics.filter((m) => !m.success)) {
      const error = metric.errorType || 'unknown';
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    }

    const topErrors = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([error, count]) => ({ error, count }));

    return {
      totalSubmissions: this.metrics.length,
      successRate: this.metrics.length > 0 ? successful.length / this.metrics.length : 0,
      avgDuration: successful.length > 0
        ? successful.reduce((sum, m) => sum + m.duration, 0) / successful.length
        : 0,
      siteCount: siteIds.size,
      last24Hours: {
        total: recentMetrics.length,
        successful: recentSuccessful.length,
        failed: recentMetrics.length - recentSuccessful.length,
      },
      topErrors,
    };
  }

  /**
   * Get recent failure rate for a site
   */
  getRecentFailureRate(siteId: string, windowMinutes?: number): number {
    const window = windowMinutes || this.alertConfig.windowMinutes;
    const cutoff = Date.now() - window * 60 * 1000;

    const recentMetrics = this.metrics.filter(
      (m) => m.siteId === siteId && m.timestamp.getTime() > cutoff
    );

    if (recentMetrics.length === 0) return 0;

    const failures = recentMetrics.filter((m) => !m.success).length;
    return failures / recentMetrics.length;
  }

  /**
   * Get metrics for time range
   */
  getMetricsInRange(startTime: Date, endTime: Date, siteId?: string): SubmissionMetric[] {
    return this.metrics.filter((m) => {
      const inRange = m.timestamp >= startTime && m.timestamp <= endTime;
      const matchesSite = !siteId || m.siteId === siteId;
      return inRange && matchesSite;
    });
  }

  // ============================================================================
  // ALERTING
  // ============================================================================

  /**
   * Check if alerts should be triggered
   */
  private checkAlerts(siteId: string): void {
    // Check consecutive failures
    const consecutiveFailures = this.consecutiveFailures.get(siteId) || 0;
    if (consecutiveFailures >= this.alertConfig.failureCountThreshold) {
      this.createAlert(siteId, 'critical', `${consecutiveFailures} consecutive failures`, {
        consecutiveFailures,
      });
    }

    // Check failure rate
    const failureRate = this.getRecentFailureRate(siteId);
    if (failureRate >= this.alertConfig.failureRateThreshold) {
      this.createAlert(
        siteId,
        'warning',
        `High failure rate: ${(failureRate * 100).toFixed(1)}%`,
        { failureRate }
      );
    }

    // Check latency
    const stats = this.getSiteStats(siteId);
    if (stats && stats.avgDuration > this.alertConfig.latencyThreshold) {
      this.createAlert(
        siteId,
        'warning',
        `High latency: ${(stats.avgDuration / 1000).toFixed(1)}s avg`,
        { avgDuration: stats.avgDuration }
      );
    }
  }

  /**
   * Create an alert
   */
  private createAlert(
    siteId: string,
    severity: AlertSeverity,
    message: string,
    metadata?: Record<string, any>
  ): void {
    // Check for duplicate recent alerts
    const recentDuplicate = this.alerts.find(
      (a) =>
        a.siteId === siteId &&
        a.message === message &&
        !a.acknowledged &&
        Date.now() - a.timestamp.getTime() < 5 * 60 * 1000 // Within 5 minutes
    );

    if (recentDuplicate) return;

    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      siteId,
      severity,
      message,
      timestamp: new Date(),
      acknowledged: false,
      metadata,
    };

    this.alerts.push(alert);

    // Log alert
    const icon = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${icon} ALERT [${siteId}]: ${message}`);

    // Notify handlers
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
        console.error('Alert handler error:', error);
      }
    }
  }

  /**
   * Register an alert handler
   */
  onAlert(handler: AlertHandler): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Get unacknowledged alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter((a) => !a.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /**
   * Acknowledge all alerts for a site
   */
  acknowledgeAllForSite(siteId: string): void {
    this.alerts
      .filter((a) => a.siteId === siteId && !a.acknowledged)
      .forEach((a) => (a.acknowledged = true));
  }

  // ============================================================================
  // REPORTING
  // ============================================================================

  /**
   * Generate a summary report
   */
  generateReport(): string {
    const overall = this.getOverallStats();
    const siteStats = this.getAllSiteStats();

    let report = '📊 Browser Automation Report\n';
    report += '═══════════════════════════════════════\n\n';

    report += '📈 Overall Statistics\n';
    report += `   Total Submissions: ${overall.totalSubmissions}\n`;
    report += `   Success Rate: ${(overall.successRate * 100).toFixed(1)}%\n`;
    report += `   Avg Duration: ${(overall.avgDuration / 1000).toFixed(1)}s\n`;
    report += `   Sites: ${overall.siteCount}\n\n`;

    report += '📅 Last 24 Hours\n';
    report += `   Total: ${overall.last24Hours.total}\n`;
    report += `   Successful: ${overall.last24Hours.successful}\n`;
    report += `   Failed: ${overall.last24Hours.failed}\n\n`;

    if (overall.topErrors.length > 0) {
      report += '❌ Top Errors\n';
      for (const { error, count } of overall.topErrors) {
        report += `   ${error}: ${count}\n`;
      }
      report += '\n';
    }

    report += '🌐 Site Breakdown\n';
    for (const site of siteStats) {
      report += `   ${site.siteName}\n`;
      report += `      Success Rate: ${(site.successRate * 100).toFixed(1)}%\n`;
      report += `      Submissions: ${site.totalSubmissions} (${site.successfulSubmissions}✓ / ${site.failedSubmissions}✗)\n`;
      report += `      Avg Duration: ${(site.avgDuration / 1000).toFixed(1)}s\n`;
      if (site.captchaSolveRate > 0) {
        report += `      CAPTCHA Rate: ${(site.captchaSolveRate * 100).toFixed(1)}%\n`;
      }
      report += '\n';
    }

    const activeAlerts = this.getActiveAlerts();
    if (activeAlerts.length > 0) {
      report += '🚨 Active Alerts\n';
      for (const alert of activeAlerts) {
        const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵';
        report += `   ${icon} [${alert.siteId}] ${alert.message}\n`;
      }
    }

    return report;
  }

  /**
   * Log report to console
   */
  logReport(): void {
    console.log(this.generateReport());
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Clear old metrics
   */
  clearOldMetrics(olderThanDays: number = 30): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const originalCount = this.metrics.length;
    this.metrics = this.metrics.filter((m) => m.timestamp.getTime() > cutoff);
    const removed = originalCount - this.metrics.length;
    console.log(`🗑️ Cleared ${removed} old metrics`);
    return removed;
  }

  /**
   * Clear all metrics
   */
  clearAll(): void {
    this.metrics = [];
    this.consecutiveFailures.clear();
    this.alerts = [];
    console.log('🗑️ Cleared all metrics');
  }
}

/**
 * Helper class to track a single submission
 */
export class SubmissionTracker {
  private metrics: BrowserMetrics;
  private siteId: string;
  private siteName: string;
  private dealId: string;
  private startTime: number;
  private steps: StepMetric[] = [];
  private currentStep?: { name: string; startTime: number };
  private retryCount = 0;
  private captchaSolved = false;
  private proxyUsed?: string;

  constructor(metrics: BrowserMetrics, siteId: string, siteName: string, dealId: string) {
    this.metrics = metrics;
    this.siteId = siteId;
    this.siteName = siteName;
    this.dealId = dealId;
    this.startTime = Date.now();
  }

  startStep(name: string): void {
    if (this.currentStep) {
      this.endStep(true);
    }
    this.currentStep = { name, startTime: Date.now() };
  }

  endStep(success: boolean, error?: string): void {
    if (this.currentStep) {
      this.steps.push({
        name: this.currentStep.name,
        startTime: this.currentStep.startTime,
        endTime: Date.now(),
        success,
        error,
      });
      this.currentStep = undefined;
    }
  }

  incrementRetry(): void {
    this.retryCount++;
  }

  setCaptchaSolved(): void {
    this.captchaSolved = true;
  }

  setProxy(proxyId: string): void {
    this.proxyUsed = proxyId;
  }

  complete(success: boolean, errorType?: string, errorMessage?: string): void {
    if (this.currentStep) {
      this.endStep(success, errorMessage);
    }

    this.metrics.record({
      siteId: this.siteId,
      siteName: this.siteName,
      dealId: this.dealId,
      timestamp: new Date(),
      success,
      duration: Date.now() - this.startTime,
      errorType,
      errorMessage,
      retryCount: this.retryCount,
      captchaSolved: this.captchaSolved,
      proxyUsed: this.proxyUsed,
      steps: this.steps,
    });
  }
}

// Export singleton instance
export const browserMetrics = new BrowserMetrics();
export default browserMetrics;
