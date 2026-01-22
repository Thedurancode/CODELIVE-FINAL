/**
 * Compliance Report Schedule Model
 *
 * Manages scheduled compliance report generation.
 * Supports recurring reports (daily, weekly, monthly) with configurable delivery options.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';
import { ReportType, DeliveryMethod } from './ComplianceReport';

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'failed';

interface ComplianceReportScheduleAttributes {
  id: string;
  name: string;
  description?: string;
  reportType: ReportType;
  status: ScheduleStatus;

  // Schedule configuration
  frequency: ScheduleFrequency;
  cronExpression?: string; // For custom schedules
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number; // 1-31 for monthly
  hourOfDay: number; // 0-23
  timezone: string;

  // Report parameters (same as ComplianceReport)
  parameters: {
    dealIds?: number[];
    propertyIds?: string[];
    portfolioId?: string;
    startDate?: string; // Can be relative like "-30d"
    endDate?: string; // Can be relative like "now"
    states?: string[];
    complianceStatuses?: string[];
    includeAlerts?: boolean;
    includeAuditLogs?: boolean;
    includeIssueReviews?: boolean;
    includeChecks?: boolean;
    sections?: string[];
  };

  // Delivery configuration
  deliveryMethod: DeliveryMethod;
  recipients: string[]; // Email addresses
  ccRecipients?: string[];

  // Execution tracking
  lastRunAt?: Date;
  lastRunStatus?: 'success' | 'failed';
  lastRunError?: string;
  lastReportId?: string;
  nextRunAt?: Date;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;

  // Ownership
  createdBy: string;
  createdByName?: string;
  updatedBy?: string;

  createdAt: Date;
  updatedAt: Date;
}

interface ComplianceReportScheduleCreationAttributes
  extends Optional<
    ComplianceReportScheduleAttributes,
    | 'id'
    | 'status'
    | 'description'
    | 'cronExpression'
    | 'dayOfWeek'
    | 'dayOfMonth'
    | 'ccRecipients'
    | 'lastRunAt'
    | 'lastRunStatus'
    | 'lastRunError'
    | 'lastReportId'
    | 'nextRunAt'
    | 'totalRuns'
    | 'successfulRuns'
    | 'failedRuns'
    | 'createdByName'
    | 'updatedBy'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ComplianceReportSchedule
  extends Model<ComplianceReportScheduleAttributes, ComplianceReportScheduleCreationAttributes>
  implements ComplianceReportScheduleAttributes
{
  declare id: string;
  declare name: string;
  declare description: string | undefined;
  declare reportType: ReportType;
  declare status: ScheduleStatus;
  declare frequency: ScheduleFrequency;
  declare cronExpression: string | undefined;
  declare dayOfWeek: number | undefined;
  declare dayOfMonth: number | undefined;
  declare hourOfDay: number;
  declare timezone: string;
  declare parameters: ComplianceReportScheduleAttributes['parameters'];
  declare deliveryMethod: DeliveryMethod;
  declare recipients: string[];
  declare ccRecipients: string[] | undefined;
  declare lastRunAt: Date | undefined;
  declare lastRunStatus: 'success' | 'failed' | undefined;
  declare lastRunError: string | undefined;
  declare lastReportId: string | undefined;
  declare nextRunAt: Date | undefined;
  declare totalRuns: number;
  declare successfulRuns: number;
  declare failedRuns: number;
  declare createdBy: string;
  declare createdByName: string | undefined;
  declare updatedBy: string | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Calculate the next run date based on schedule configuration
   */
  calculateNextRun(): Date {
    const now = new Date();
    const next = new Date();

    // Set hour
    next.setHours(this.hourOfDay, 0, 0, 0);

    switch (this.frequency) {
      case 'daily':
        // If today's run time has passed, schedule for tomorrow
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        break;

      case 'weekly':
        // Find next occurrence of the specified day
        const targetDay = this.dayOfWeek ?? 1; // Default to Monday
        const currentDay = next.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0 || (daysUntil === 0 && next <= now)) {
          daysUntil += 7;
        }
        next.setDate(next.getDate() + daysUntil);
        break;

      case 'monthly':
        // Find next occurrence of the specified day of month
        const targetDate = this.dayOfMonth ?? 1;
        next.setDate(targetDate);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        break;

      case 'quarterly':
        // Run on the first day of each quarter
        const currentMonth = now.getMonth();
        const quarterStarts = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
        let nextQuarter = quarterStarts.find(m => m > currentMonth);
        if (nextQuarter === undefined) {
          nextQuarter = 0;
          next.setFullYear(next.getFullYear() + 1);
        }
        next.setMonth(nextQuarter);
        next.setDate(this.dayOfMonth ?? 1);
        break;
    }

    return next;
  }

  /**
   * Update next run time
   */
  async updateNextRun(): Promise<void> {
    this.nextRunAt = this.calculateNextRun();
    await this.save();
  }

  /**
   * Record a successful run
   */
  async recordSuccess(reportId: string): Promise<void> {
    this.lastRunAt = new Date();
    this.lastRunStatus = 'success';
    this.lastRunError = undefined;
    this.lastReportId = reportId;
    this.totalRuns++;
    this.successfulRuns++;
    this.nextRunAt = this.calculateNextRun();
    await this.save();
  }

  /**
   * Record a failed run
   */
  async recordFailure(error: string): Promise<void> {
    this.lastRunAt = new Date();
    this.lastRunStatus = 'failed';
    this.lastRunError = error;
    this.totalRuns++;
    this.failedRuns++;
    this.nextRunAt = this.calculateNextRun();
    await this.save();
  }

  /**
   * Pause the schedule
   */
  async pause(): Promise<void> {
    this.status = 'paused';
    await this.save();
  }

  /**
   * Resume the schedule
   */
  async resume(): Promise<void> {
    this.status = 'active';
    this.nextRunAt = this.calculateNextRun();
    await this.save();
  }

  /**
   * Get schedules due for execution
   */
  static async getDueSchedules(): Promise<ComplianceReportSchedule[]> {
    const now = new Date();
    return ComplianceReportSchedule.findAll({
      where: {
        status: 'active',
        nextRunAt: { [Op.lte]: now },
      },
      order: [['nextRunAt', 'ASC']],
    });
  }

  /**
   * Get active schedules
   */
  static async getActive(): Promise<ComplianceReportSchedule[]> {
    return ComplianceReportSchedule.findAll({
      where: { status: 'active' },
      order: [['nextRunAt', 'ASC']],
    });
  }

  /**
   * Get schedules for a user
   */
  static async getForUser(userId: string, options?: {
    status?: ScheduleStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ schedules: ComplianceReportSchedule[]; total: number }> {
    const where: any = { createdBy: userId };
    if (options?.status) where.status = options.status;

    const { rows: schedules, count: total } = await ComplianceReportSchedule.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
    });

    return { schedules, total };
  }

  /**
   * Get statistics
   */
  static async getStats(): Promise<{
    total: number;
    active: number;
    paused: number;
    byFrequency: Record<ScheduleFrequency, number>;
    totalRuns: number;
    successRate: number;
  }> {
    const schedules = await ComplianceReportSchedule.findAll({
      attributes: ['status', 'frequency', 'totalRuns', 'successfulRuns'],
    });

    const stats = {
      total: schedules.length,
      active: 0,
      paused: 0,
      byFrequency: {
        daily: 0,
        weekly: 0,
        monthly: 0,
        quarterly: 0,
      } as Record<ScheduleFrequency, number>,
      totalRuns: 0,
      successRate: 0,
    };

    let totalSuccessful = 0;

    for (const schedule of schedules) {
      if (schedule.status === 'active') stats.active++;
      else if (schedule.status === 'paused') stats.paused++;
      stats.byFrequency[schedule.frequency]++;
      stats.totalRuns += schedule.totalRuns;
      totalSuccessful += schedule.successfulRuns;
    }

    stats.successRate = stats.totalRuns > 0 ? (totalSuccessful / stats.totalRuns) * 100 : 100;

    return stats;
  }
}

ComplianceReportSchedule.init(
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
      type: DataTypes.ENUM('active', 'paused', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'active',
    },
    frequency: {
      type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'quarterly'),
      allowNull: false,
    },
    cronExpression: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    dayOfWeek: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 0, max: 6 },
    },
    dayOfMonth: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 31 },
    },
    hourOfDay: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 9,
      validate: { min: 0, max: 23 },
    },
    timezone: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'America/New_York',
    },
    parameters: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    deliveryMethod: {
      type: DataTypes.ENUM('email', 'download', 'both'),
      allowNull: false,
      defaultValue: 'email',
    },
    recipients: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    ccRecipients: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    lastRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastRunStatus: {
      type: DataTypes.ENUM('success', 'failed'),
      allowNull: true,
    },
    lastRunError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastReportId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    nextRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totalRuns: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    successfulRuns: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    failedRuns: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    createdByName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
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
    tableName: 'compliance_report_schedules',
    timestamps: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['frequency'] },
      { fields: ['createdBy'] },
      { fields: ['nextRunAt'] },
      { fields: ['status', 'nextRunAt'] },
    ],
  }
);

export default ComplianceReportSchedule;
