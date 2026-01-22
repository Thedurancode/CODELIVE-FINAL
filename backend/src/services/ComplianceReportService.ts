/**
 * Compliance Report Service
 *
 * Generates detailed compliance reports for deals, portfolios, or time periods.
 * Aggregates data from compliance checks, alerts, audit logs, and issue reviews.
 */

import { Op } from 'sequelize';
import ComplianceReport, { ReportType, ReportStatus, DeliveryMethod } from '../models/ComplianceReport';
import ComplianceReportSchedule, { ScheduleFrequency } from '../models/ComplianceReportSchedule';
import Property from '../models/Property';
import ComplianceCheck from '../models/ComplianceCheck';
import ComplianceAlert from '../models/ComplianceAlert';
import ComplianceAuditLog from '../models/ComplianceAuditLog';
import ComplianceIssueReview from '../models/ComplianceIssueReview';
import Portfolio from '../models/Portfolio';
import { complianceReportExportService } from './ComplianceReportExportService';

export interface CreateReportParams {
  name: string;
  description?: string;
  reportType: ReportType;
  parameters: ComplianceReport['parameters'];
  deliveryMethod: DeliveryMethod;
  recipients?: string[];
  generatedBy: string;
  generatedByName?: string;
}

export interface CreateScheduleParams {
  name: string;
  description?: string;
  reportType: ReportType;
  frequency: ScheduleFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  hourOfDay: number;
  timezone?: string;
  parameters: ComplianceReportSchedule['parameters'];
  deliveryMethod: DeliveryMethod;
  recipients: string[];
  ccRecipients?: string[];
  createdBy: string;
  createdByName?: string;
}

export interface ReportData {
  deals: DealReportData[];
  alerts: AlertSummary;
  auditLogs?: AuditLogSummary;
  issueReviews?: IssueReviewSummary;
  complianceChecks?: ComplianceCheckSummary;
}

export interface DealReportData {
  id: number;
  propertyId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  complianceStatus: string;
  approvalStatus: string;
  latestCheck?: {
    id: number;
    checkedAt: string;
    status: string;
    passedRules: number;
    failedRules: number;
    warnings: number;
    issues: any[];
  };
  alerts: {
    critical: number;
    high: number;
    warning: number;
    info: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AlertSummary {
  total: number;
  bySeverity: {
    critical: number;
    high: number;
    warning: number;
    info: number;
  };
  byType: Record<string, number>;
  byStatus: {
    active: number;
    acknowledged: number;
    resolved: number;
    expired: number;
  };
  recentAlerts: any[];
}

export interface AuditLogSummary {
  totalEntries: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  byOutcome: Record<string, number>;
  recentLogs: any[];
}

export interface IssueReviewSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  recentReviews: any[];
}

export interface ComplianceCheckSummary {
  total: number;
  passed: number;
  failed: number;
  averagePassRate: number;
  recentChecks: any[];
}

class ComplianceReportService {
  /**
   * Create a new report request
   */
  async createReport(params: CreateReportParams): Promise<ComplianceReport> {
    const report = await ComplianceReport.create({
      name: params.name,
      description: params.description,
      reportType: params.reportType,
      parameters: params.parameters,
      deliveryMethod: params.deliveryMethod,
      generatedBy: params.generatedBy,
      generatedByName: params.generatedByName,
      status: 'pending',
    });

    // Start generation asynchronously
    this.generateReportAsync(report.id).catch(err => {
      console.error(`Failed to generate report ${report.id}:`, err);
    });

    return report;
  }

  /**
   * Generate a report asynchronously
   */
  async generateReportAsync(reportId: string): Promise<void> {
    const report = await ComplianceReport.findByPk(reportId);
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    try {
      await report.markGenerating();

      // Generate report data
      const reportData = await this.generateReportData(report);

      // Calculate summary
      const summary = this.calculateSummary(reportData);

      // Generate PDF
      const { pdfBuffer, pdfSize } = await complianceReportExportService.generatePDF(
        report,
        reportData,
        summary
      );

      // Store PDF (in a real implementation, upload to storage)
      const pdfUrl = `reports/${report.id}.pdf`;

      // Mark as completed
      await report.markCompleted({
        summary,
        reportData,
        pdfUrl,
        pdfSize,
      });

      // Handle delivery
      if (report.deliveryMethod !== 'download' && report.parameters.dealIds?.length) {
        // Email delivery handled separately based on recipients
      }

      console.log(`✅ Report ${reportId} generated successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await report.markFailed(errorMessage);
      console.error(`❌ Report ${reportId} generation failed:`, errorMessage);
      throw error;
    }
  }

  /**
   * Generate report data based on parameters
   */
  async generateReportData(report: ComplianceReport): Promise<ReportData> {
    const params = report.parameters;
    let deals: DealReportData[] = [];

    // Fetch deals based on report type
    switch (report.reportType) {
      case 'deal':
        deals = await this.fetchDealData(params.dealIds || params.propertyIds?.map(id => parseInt(id)));
        break;

      case 'portfolio':
        deals = await this.fetchPortfolioDeals(params.portfolioId);
        break;

      case 'time_period':
        deals = await this.fetchDealsByTimePeriod(params.startDate, params.endDate, params.states);
        break;

      case 'audit':
        deals = await this.fetchAllDealsForAudit(params);
        break;

      case 'custom':
        deals = await this.fetchDealsWithFilters(params);
        break;
    }

    // Fetch alerts
    const alerts = await this.fetchAlertSummary(deals.map(d => d.id), params);

    // Fetch optional data
    let auditLogs: AuditLogSummary | undefined;
    let issueReviews: IssueReviewSummary | undefined;
    let complianceChecks: ComplianceCheckSummary | undefined;

    if (params.includeAuditLogs) {
      auditLogs = await this.fetchAuditLogSummary(deals.map(d => d.id), params);
    }

    if (params.includeIssueReviews) {
      issueReviews = await this.fetchIssueReviewSummary(deals.map(d => d.id));
    }

    if (params.includeChecks) {
      complianceChecks = await this.fetchComplianceCheckSummary(deals.map(d => d.id));
    }

    return {
      deals,
      alerts,
      auditLogs,
      issueReviews,
      complianceChecks,
    };
  }

  /**
   * Fetch deal data for specific IDs
   */
  private async fetchDealData(dealIds?: number[]): Promise<DealReportData[]> {
    if (!dealIds?.length) return [];

    const properties = await Property.findAll({
      where: { id: { [Op.in]: dealIds } },
      order: [['createdAt', 'DESC']],
    });

    return this.formatDealData(properties);
  }

  /**
   * Fetch deals from a portfolio
   */
  private async fetchPortfolioDeals(portfolioId?: string): Promise<DealReportData[]> {
    if (!portfolioId) return [];

    const portfolioItems = await Portfolio.findAll({
      where: { id: portfolioId },
      include: [{ model: Property, as: 'property' }],
    });

    const properties = portfolioItems
      .map(item => (item as any).property)
      .filter(Boolean);

    return this.formatDealData(properties);
  }

  /**
   * Fetch deals by time period
   */
  private async fetchDealsByTimePeriod(
    startDate?: string,
    endDate?: string,
    states?: string[]
  ): Promise<DealReportData[]> {
    const where: any = {};

    if (startDate) {
      where.createdAt = where.createdAt || {};
      where.createdAt[Op.gte] = new Date(startDate);
    }

    if (endDate) {
      where.createdAt = where.createdAt || {};
      where.createdAt[Op.lte] = new Date(endDate);
    }

    if (states?.length) {
      where.state = { [Op.in]: states };
    }

    const properties = await Property.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 1000, // Safety limit
    });

    return this.formatDealData(properties);
  }

  /**
   * Fetch all deals for audit report
   */
  private async fetchAllDealsForAudit(params: ComplianceReport['parameters']): Promise<DealReportData[]> {
    const where: any = {};

    if (params.states?.length) {
      where.state = { [Op.in]: params.states };
    }

    if (params.complianceStatuses?.length) {
      where.status = { [Op.in]: params.complianceStatuses };
    }

    const properties = await Property.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    return this.formatDealData(properties);
  }

  /**
   * Fetch deals with custom filters
   */
  private async fetchDealsWithFilters(params: ComplianceReport['parameters']): Promise<DealReportData[]> {
    const where: any = {};

    if (params.dealIds?.length) {
      where.id = { [Op.in]: params.dealIds };
    }

    if (params.states?.length) {
      where.state = { [Op.in]: params.states };
    }

    if (params.complianceStatuses?.length) {
      where.status = { [Op.in]: params.complianceStatuses };
    }

    if (params.startDate) {
      where.createdAt = where.createdAt || {};
      where.createdAt[Op.gte] = new Date(params.startDate);
    }

    if (params.endDate) {
      where.createdAt = where.createdAt || {};
      where.createdAt[Op.lte] = new Date(params.endDate);
    }

    const properties = await Property.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 1000,
    });

    return this.formatDealData(properties);
  }

  /**
   * Format property data for reports
   */
  private async formatDealData(properties: Property[]): Promise<DealReportData[]> {
    const deals: DealReportData[] = [];

    for (const property of properties) {
      // Get latest compliance check
      const latestCheck = await ComplianceCheck.findOne({
        where: { propertyId: property.id },
        order: [['checkedAt', 'DESC']],
      });

      // Get alert counts
      const alertCounts = await ComplianceAlert.findAll({
        where: {
          resourceType: 'property',
          resourceId: String(property.id),
          status: 'active',
        },
        attributes: ['severity'],
      });

      const alertsBySeverity = {
        critical: 0,
        high: 0,
        warning: 0,
        info: 0,
      };

      for (const alert of alertCounts) {
        alertsBySeverity[alert.severity]++;
      }

      const addressStr = typeof property.address === 'object'
        ? `${(property.address as any).houseNumber || ''} ${(property.address as any).street || ''}`
        : String(property.address || '');

      deals.push({
        id: property.id,
        propertyId: property.propertyId,
        address: addressStr,
        city: property.city || '',
        state: property.state || '',
        zip: property.zip || '',
        status: property.status || 'Unknown',
        complianceStatus: property.status || 'Unknown',
        approvalStatus: property.approvalStatus || 'Unknown',
        latestCheck: latestCheck ? {
          id: latestCheck.id,
          checkedAt: latestCheck.checkedAt.toISOString(),
          status: latestCheck.status,
          passedRules: latestCheck.passedRules,
          failedRules: latestCheck.failedRules,
          warnings: latestCheck.warnings,
          issues: latestCheck.issues || [],
        } : undefined,
        alerts: alertsBySeverity,
        createdAt: property.createdAt.toISOString(),
        updatedAt: property.updatedAt.toISOString(),
      });
    }

    return deals;
  }

  /**
   * Fetch alert summary
   */
  private async fetchAlertSummary(
    propertyIds: number[],
    params: ComplianceReport['parameters']
  ): Promise<AlertSummary> {
    const where: any = {};

    if (propertyIds.length) {
      where[Op.or] = [
        { resourceType: 'property', resourceId: { [Op.in]: propertyIds.map(String) } },
        { resourceType: 'system' }, // Include system alerts
      ];
    }

    const alerts = await ComplianceAlert.findAll({ where });

    const summary: AlertSummary = {
      total: alerts.length,
      bySeverity: { critical: 0, high: 0, warning: 0, info: 0 },
      byType: {},
      byStatus: { active: 0, acknowledged: 0, resolved: 0, expired: 0 },
      recentAlerts: [],
    };

    for (const alert of alerts) {
      summary.bySeverity[alert.severity]++;
      summary.byType[alert.type] = (summary.byType[alert.type] || 0) + 1;
      summary.byStatus[alert.status]++;
    }

    // Get recent alerts
    summary.recentAlerts = alerts
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map(a => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        status: a.status,
        title: a.title,
        message: a.message,
        createdAt: a.createdAt.toISOString(),
      }));

    return summary;
  }

  /**
   * Fetch audit log summary
   */
  private async fetchAuditLogSummary(
    propertyIds: number[],
    params: ComplianceReport['parameters']
  ): Promise<AuditLogSummary> {
    const where: any = {};

    if (params.startDate || params.endDate) {
      where.timestamp = {};
      if (params.startDate) where.timestamp[Op.gte] = new Date(params.startDate);
      if (params.endDate) where.timestamp[Op.lte] = new Date(params.endDate);
    }

    const logs = await ComplianceAuditLog.findAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: 500,
    });

    const summary: AuditLogSummary = {
      totalEntries: logs.length,
      byCategory: {},
      bySeverity: {},
      byOutcome: {},
      recentLogs: [],
    };

    for (const log of logs) {
      summary.byCategory[log.eventCategory] = (summary.byCategory[log.eventCategory] || 0) + 1;
      summary.bySeverity[log.severity] = (summary.bySeverity[log.severity] || 0) + 1;
      summary.byOutcome[log.outcome] = (summary.byOutcome[log.outcome] || 0) + 1;
    }

    summary.recentLogs = logs.slice(0, 20).map(log => ({
      id: log.id,
      eventType: log.eventType,
      eventCategory: log.eventCategory,
      severity: log.severity,
      action: log.action,
      outcome: log.outcome,
      timestamp: log.timestamp.toISOString(),
    }));

    return summary;
  }

  /**
   * Fetch issue review summary
   */
  private async fetchIssueReviewSummary(propertyIds: number[]): Promise<IssueReviewSummary> {
    const where: any = {};

    if (propertyIds.length) {
      where.propertyId = { [Op.in]: propertyIds };
    }

    const reviews = await ComplianceIssueReview.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    const summary: IssueReviewSummary = {
      total: reviews.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      recentReviews: [],
    };

    for (const review of reviews) {
      if (review.status === 'pending') summary.pending++;
      else if (review.status === 'approved') summary.approved++;
      else if (review.status === 'rejected') summary.rejected++;
    }

    summary.recentReviews = reviews.slice(0, 10).map(r => ({
      id: r.id,
      status: r.status,
      issueType: r.issueType,
      reviewerNotes: r.reviewerNotes,
      createdAt: r.createdAt.toISOString(),
    }));

    return summary;
  }

  /**
   * Fetch compliance check summary
   */
  private async fetchComplianceCheckSummary(propertyIds: number[]): Promise<ComplianceCheckSummary> {
    const where: any = {};

    if (propertyIds.length) {
      where.propertyId = { [Op.in]: propertyIds };
    }

    const checks = await ComplianceCheck.findAll({
      where,
      order: [['checkedAt', 'DESC']],
    });

    const summary: ComplianceCheckSummary = {
      total: checks.length,
      passed: 0,
      failed: 0,
      averagePassRate: 0,
      recentChecks: [],
    };

    let totalPassRate = 0;

    for (const check of checks) {
      if (check.status === 'Green') summary.passed++;
      else summary.failed++;

      const totalRules = check.passedRules + check.failedRules;
      if (totalRules > 0) {
        totalPassRate += (check.passedRules / totalRules) * 100;
      }
    }

    summary.averagePassRate = checks.length > 0 ? totalPassRate / checks.length : 0;

    summary.recentChecks = checks.slice(0, 10).map(c => ({
      id: c.id,
      propertyId: c.propertyId,
      status: c.status,
      passedRules: c.passedRules,
      failedRules: c.failedRules,
      warnings: c.warnings,
      checkedAt: c.checkedAt.toISOString(),
    }));

    return summary;
  }

  /**
   * Calculate report summary
   */
  private calculateSummary(data: ReportData): ComplianceReport['summary'] {
    const totalDeals = data.deals.length;
    let compliantDeals = 0;
    let nonCompliantDeals = 0;
    let pendingDeals = 0;

    for (const deal of data.deals) {
      if (deal.complianceStatus === 'Green') compliantDeals++;
      else if (deal.complianceStatus === 'Red') nonCompliantDeals++;
      else pendingDeals++;
    }

    return {
      totalDeals,
      compliantDeals,
      nonCompliantDeals,
      pendingDeals,
      criticalAlerts: data.alerts.bySeverity.critical,
      highAlerts: data.alerts.bySeverity.high,
      warningAlerts: data.alerts.bySeverity.warning,
      complianceRate: totalDeals > 0 ? (compliantDeals / totalDeals) * 100 : 0,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get report by ID
   */
  async getReport(reportId: string): Promise<ComplianceReport | null> {
    return ComplianceReport.findByPk(reportId);
  }

  /**
   * Get reports for a user
   */
  async getUserReports(userId: string, options?: {
    status?: ReportStatus;
    reportType?: ReportType;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: ComplianceReport[]; total: number }> {
    return ComplianceReport.getForUser(userId, options);
  }

  /**
   * Delete a report
   */
  async deleteReport(reportId: string): Promise<boolean> {
    const report = await ComplianceReport.findByPk(reportId);
    if (!report) return false;

    await report.destroy();
    return true;
  }

  /**
   * Create a report schedule
   */
  async createSchedule(params: CreateScheduleParams): Promise<ComplianceReportSchedule> {
    const schedule = await ComplianceReportSchedule.create({
      name: params.name,
      description: params.description,
      reportType: params.reportType,
      frequency: params.frequency,
      dayOfWeek: params.dayOfWeek,
      dayOfMonth: params.dayOfMonth,
      hourOfDay: params.hourOfDay,
      timezone: params.timezone || 'America/New_York',
      parameters: params.parameters,
      deliveryMethod: params.deliveryMethod,
      recipients: params.recipients,
      ccRecipients: params.ccRecipients,
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      status: 'active',
    });

    // Calculate next run time
    await schedule.updateNextRun();

    return schedule;
  }

  /**
   * Get schedule by ID
   */
  async getSchedule(scheduleId: string): Promise<ComplianceReportSchedule | null> {
    return ComplianceReportSchedule.findByPk(scheduleId);
  }

  /**
   * Get user schedules
   */
  async getUserSchedules(userId: string, options?: {
    status?: ComplianceReportSchedule['status'];
    limit?: number;
    offset?: number;
  }): Promise<{ schedules: ComplianceReportSchedule[]; total: number }> {
    return ComplianceReportSchedule.getForUser(userId, options);
  }

  /**
   * Update a schedule
   */
  async updateSchedule(
    scheduleId: string,
    updates: Partial<CreateScheduleParams>,
    updatedBy: string
  ): Promise<ComplianceReportSchedule | null> {
    const schedule = await ComplianceReportSchedule.findByPk(scheduleId);
    if (!schedule) return null;

    await schedule.update({
      ...updates,
      updatedBy,
    });

    // Recalculate next run if schedule changed
    if (updates.frequency || updates.dayOfWeek || updates.dayOfMonth || updates.hourOfDay) {
      await schedule.updateNextRun();
    }

    return schedule;
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId: string): Promise<boolean> {
    const schedule = await ComplianceReportSchedule.findByPk(scheduleId);
    if (!schedule) return false;

    await schedule.destroy();
    return true;
  }

  /**
   * Pause a schedule
   */
  async pauseSchedule(scheduleId: string): Promise<boolean> {
    const schedule = await ComplianceReportSchedule.findByPk(scheduleId);
    if (!schedule) return false;

    await schedule.pause();
    return true;
  }

  /**
   * Resume a schedule
   */
  async resumeSchedule(scheduleId: string): Promise<boolean> {
    const schedule = await ComplianceReportSchedule.findByPk(scheduleId);
    if (!schedule) return false;

    await schedule.resume();
    return true;
  }

  /**
   * Get report statistics
   */
  async getReportStats(options?: { days?: number }): Promise<ReturnType<typeof ComplianceReport.getStats>> {
    return ComplianceReport.getStats(options);
  }

  /**
   * Get schedule statistics
   */
  async getScheduleStats(): Promise<ReturnType<typeof ComplianceReportSchedule.getStats>> {
    return ComplianceReportSchedule.getStats();
  }

  /**
   * Send report via email
   */
  async sendReportEmail(reportId: string, recipients: string[]): Promise<{ success: boolean; message: string }> {
    const report = await ComplianceReport.findByPk(reportId);
    if (!report) {
      return { success: false, message: 'Report not found' };
    }

    if (report.status !== 'completed') {
      return { success: false, message: 'Report is not ready for delivery' };
    }

    try {
      const result = await complianceReportExportService.sendReportEmail(
        report,
        recipients
      );

      if (result.success) {
        await report.markDelivered(recipients);
      } else {
        await report.markDeliveryFailed(result.message);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await report.markDeliveryFailed(errorMessage);
      return { success: false, message: errorMessage };
    }
  }
}

export const complianceReportService = new ComplianceReportService();
export default complianceReportService;
