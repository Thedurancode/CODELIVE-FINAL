/**
 * Compliance Report Model
 *
 * Stores compliance report metadata and results for deals, portfolios, or time periods.
 * Supports PDF export, email delivery, and scheduled report generation for audits.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export type ReportType = 'deal' | 'portfolio' | 'time_period' | 'audit' | 'custom';
export type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'delivered';
export type DeliveryMethod = 'email' | 'download' | 'both';

interface ComplianceReportAttributes {
  id: string;
  name: string;
  description?: string;
  reportType: ReportType;
  status: ReportStatus;

  // Report parameters
  parameters: {
    // For deal reports
    dealIds?: number[];
    propertyIds?: string[];

    // For portfolio reports
    portfolioId?: string;

    // For time period reports
    startDate?: string;
    endDate?: string;

    // Filter options
    states?: string[];
    complianceStatuses?: string[];
    includeAlerts?: boolean;
    includeAuditLogs?: boolean;
    includeIssueReviews?: boolean;
    includeChecks?: boolean;

    // Custom options
    sections?: string[];
  };

  // Report content
  summary?: {
    totalDeals: number;
    compliantDeals: number;
    nonCompliantDeals: number;
    pendingDeals: number;
    criticalAlerts: number;
    highAlerts: number;
    warningAlerts: number;
    complianceRate: number;
    generatedAt: string;
  };

  reportData?: Record<string, any>;

  // File storage
  pdfUrl?: string;
  pdfSize?: number;
  csvUrl?: string;

  // Delivery
  deliveryMethod: DeliveryMethod;
  deliveredTo?: string[];
  deliveredAt?: Date;
  deliveryError?: string;

  // Generation tracking
  generatedBy: string;
  generatedByName?: string;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;

  // Schedule reference
  scheduleId?: string;

  createdAt: Date;
  updatedAt: Date;
}

interface ComplianceReportCreationAttributes
  extends Optional<
    ComplianceReportAttributes,
    | 'id'
    | 'status'
    | 'description'
    | 'summary'
    | 'reportData'
    | 'pdfUrl'
    | 'pdfSize'
    | 'csvUrl'
    | 'deliveredTo'
    | 'deliveredAt'
    | 'deliveryError'
    | 'generatedByName'
    | 'startedAt'
    | 'completedAt'
    | 'errorMessage'
    | 'scheduleId'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ComplianceReport
  extends Model<ComplianceReportAttributes, ComplianceReportCreationAttributes>
  implements ComplianceReportAttributes
{
  declare id: string;
  declare name: string;
  declare description: string | undefined;
  declare reportType: ReportType;
  declare status: ReportStatus;
  declare parameters: ComplianceReportAttributes['parameters'];
  declare summary: ComplianceReportAttributes['summary'] | undefined;
  declare reportData: Record<string, any> | undefined;
  declare pdfUrl: string | undefined;
  declare pdfSize: number | undefined;
  declare csvUrl: string | undefined;
  declare deliveryMethod: DeliveryMethod;
  declare deliveredTo: string[] | undefined;
  declare deliveredAt: Date | undefined;
  declare deliveryError: string | undefined;
  declare generatedBy: string;
  declare generatedByName: string | undefined;
  declare startedAt: Date | undefined;
  declare completedAt: Date | undefined;
  declare errorMessage: string | undefined;
  declare scheduleId: string | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Mark report as generating
   */
  async markGenerating(): Promise<void> {
    this.status = 'generating';
    this.startedAt = new Date();
    await this.save();
  }

  /**
   * Mark report as completed
   */
  async markCompleted(options: {
    summary: ComplianceReportAttributes['summary'];
    reportData?: Record<string, any>;
    pdfUrl?: string;
    pdfSize?: number;
    csvUrl?: string;
  }): Promise<void> {
    this.status = 'completed';
    this.completedAt = new Date();
    this.summary = options.summary;
    this.reportData = options.reportData;
    this.pdfUrl = options.pdfUrl;
    this.pdfSize = options.pdfSize;
    this.csvUrl = options.csvUrl;
    await this.save();
  }

  /**
   * Mark report as failed
   */
  async markFailed(errorMessage: string): Promise<void> {
    this.status = 'failed';
    this.completedAt = new Date();
    this.errorMessage = errorMessage;
    await this.save();
  }

  /**
   * Mark report as delivered
   */
  async markDelivered(to: string[]): Promise<void> {
    this.status = 'delivered';
    this.deliveredTo = to;
    this.deliveredAt = new Date();
    await this.save();
  }

  /**
   * Mark delivery failed
   */
  async markDeliveryFailed(error: string): Promise<void> {
    this.deliveryError = error;
    await this.save();
  }

  /**
   * Get reports by status
   */
  static async getByStatus(status: ReportStatus, limit: number = 50): Promise<ComplianceReport[]> {
    return ComplianceReport.findAll({
      where: { status },
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  /**
   * Get reports for a user
   */
  static async getForUser(userId: string, options?: {
    status?: ReportStatus;
    reportType?: ReportType;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: ComplianceReport[]; total: number }> {
    const where: any = { generatedBy: userId };
    if (options?.status) where.status = options.status;
    if (options?.reportType) where.reportType = options.reportType;

    const { rows: reports, count: total } = await ComplianceReport.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
    });

    return { reports, total };
  }

  /**
   * Get pending reports (for scheduler)
   */
  static async getPending(): Promise<ComplianceReport[]> {
    return ComplianceReport.findAll({
      where: { status: 'pending' },
      order: [['createdAt', 'ASC']],
    });
  }

  /**
   * Cleanup old reports
   */
  static async cleanup(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await ComplianceReport.destroy({
      where: {
        createdAt: { [Op.lt]: cutoffDate },
        status: { [Op.in]: ['completed', 'delivered', 'failed'] },
      },
    });

    return result;
  }

  /**
   * Get statistics
   */
  static async getStats(options?: { days?: number }): Promise<{
    total: number;
    byStatus: Record<ReportStatus, number>;
    byType: Record<ReportType, number>;
    averageGenerationTime: number;
  }> {
    const where: any = {};
    if (options?.days) {
      const since = new Date();
      since.setDate(since.getDate() - options.days);
      where.createdAt = { [Op.gte]: since };
    }

    const reports = await ComplianceReport.findAll({
      where,
      attributes: ['status', 'reportType', 'startedAt', 'completedAt'],
    });

    const stats = {
      total: reports.length,
      byStatus: {
        pending: 0,
        generating: 0,
        completed: 0,
        failed: 0,
        delivered: 0,
      } as Record<ReportStatus, number>,
      byType: {
        deal: 0,
        portfolio: 0,
        time_period: 0,
        audit: 0,
        custom: 0,
      } as Record<ReportType, number>,
      averageGenerationTime: 0,
    };

    let totalTime = 0;
    let completedCount = 0;

    for (const report of reports) {
      stats.byStatus[report.status]++;
      stats.byType[report.reportType]++;

      if (report.startedAt && report.completedAt) {
        totalTime += report.completedAt.getTime() - report.startedAt.getTime();
        completedCount++;
      }
    }

    stats.averageGenerationTime = completedCount > 0 ? totalTime / completedCount : 0;

    return stats;
  }
}

ComplianceReport.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reportType: {
      type: DataTypes.ENUM('deal', 'portfolio', 'time_period', 'audit', 'custom'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'generating', 'completed', 'failed', 'delivered'),
      allowNull: false,
      defaultValue: 'pending',
    },
    parameters: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    summary: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    reportData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    pdfUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    pdfSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    csvUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    deliveryMethod: {
      type: DataTypes.ENUM('email', 'download', 'both'),
      allowNull: false,
      defaultValue: 'download',
    },
    deliveredTo: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveryError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    generatedBy: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    generatedByName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    scheduleId: {
      type: DataTypes.UUID,
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
    tableName: 'compliance_reports',
    timestamps: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['reportType'] },
      { fields: ['generatedBy'] },
      { fields: ['scheduleId'] },
      { fields: ['createdAt'] },
      { fields: ['status', 'createdAt'] },
    ],
  }
);

export default ComplianceReport;
