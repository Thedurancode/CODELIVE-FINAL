/**
 * DocuSealSubmission Model
 *
 * Persists all contract submission data locally for:
 * - Audit trail and compliance tracking
 * - Analytics (completion rates, timelines, funnel)
 * - Offline access to submission history
 * - Faster queries without hitting DocuSeal API
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export type SubmissionStatus = 'pending' | 'sent' | 'viewed' | 'partially_signed' | 'completed' | 'declined' | 'expired' | 'archived';

export interface SubmitterRecord {
  id: number;
  email: string;
  name?: string;
  role: string;
  status: 'pending' | 'sent' | 'opened' | 'completed' | 'declined';
  sentAt?: string;
  openedAt?: string;
  completedAt?: string;
  declinedAt?: string;
  declineReason?: string;
  embedUrl?: string;
}

export interface DocuSealSubmissionAttributes {
  id?: number;
  docuSealSubmissionId: number;
  templateId: number;
  templateName?: string;
  propertyId?: number;
  pipelineId?: number;
  projectId?: string; // UUID for project association
  userId?: number;
  status: SubmissionStatus;
  submitters: SubmitterRecord[];
  documentCategory?: string;
  state?: string;
  metadata?: Record<string, any>;
  // Timestamps from DocuSeal
  sentAt?: Date;
  firstViewedAt?: Date;
  completedAt?: Date;
  declinedAt?: Date;
  expireAt?: Date;
  archivedAt?: Date;
  // Decline tracking
  declinedBy?: string;
  declineReason?: string;
  // Reminder tracking
  lastReminderAt?: Date;
  reminderCount: number;
  nextReminderAt?: Date;
  // Document URLs
  auditLogUrl?: string;
  combinedDocumentUrl?: string;
  documentUrls?: string[];
  // Sequelize timestamps
  createdAt?: Date;
  updatedAt?: Date;
}

type DocuSealSubmissionCreationAttributes = Optional<
  DocuSealSubmissionAttributes,
  'id' | 'submitters' | 'metadata' | 'reminderCount' | 'createdAt' | 'updatedAt'
>;

class DocuSealSubmission
  extends Model<DocuSealSubmissionAttributes, DocuSealSubmissionCreationAttributes>
  implements DocuSealSubmissionAttributes
{
  declare id: number;
  declare docuSealSubmissionId: number;
  declare templateId: number;
  declare templateName?: string;
  declare propertyId?: number;
  declare pipelineId?: number;
  declare projectId?: string;
  declare userId?: number;
  declare status: SubmissionStatus;
  declare submitters: SubmitterRecord[];
  declare documentCategory?: string;
  declare state?: string;
  declare metadata?: Record<string, any>;
  declare sentAt?: Date;
  declare firstViewedAt?: Date;
  declare completedAt?: Date;
  declare declinedAt?: Date;
  declare expireAt?: Date;
  declare archivedAt?: Date;
  declare declinedBy?: string;
  declare declineReason?: string;
  declare lastReminderAt?: Date;
  declare reminderCount: number;
  declare nextReminderAt?: Date;
  declare auditLogUrl?: string;
  declare combinedDocumentUrl?: string;
  declare documentUrls?: string[];
  declare createdAt: Date;
  declare updatedAt: Date;

  // ============================================================================
  // STATIC HELPER METHODS
  // ============================================================================

  /**
   * Find submission by DocuSeal submission ID
   */
  static async findByDocuSealId(docuSealSubmissionId: number): Promise<DocuSealSubmission | null> {
    return DocuSealSubmission.findOne({
      where: { docuSealSubmissionId },
    });
  }

  /**
   * Find all submissions for a property
   */
  static async findByPropertyId(propertyId: number): Promise<DocuSealSubmission[]> {
    return DocuSealSubmission.findAll({
      where: { propertyId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Find all submissions for a project
   */
  static async findByProjectId(projectId: string): Promise<DocuSealSubmission[]> {
    return DocuSealSubmission.findAll({
      where: { projectId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Find all submissions for a user
   */
  static async findByUserId(userId: number): Promise<DocuSealSubmission[]> {
    return DocuSealSubmission.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Find pending submissions that need reminders
   */
  static async findDueForReminder(): Promise<DocuSealSubmission[]> {
    return DocuSealSubmission.findAll({
      where: {
        status: ['pending', 'sent', 'viewed', 'partially_signed'],
        nextReminderAt: {
          [Op.lte]: new Date(),
        },
        expireAt: {
          [Op.gt]: new Date(), // Not expired yet
        },
      },
      order: [['nextReminderAt', 'ASC']],
    });
  }

  /**
   * Find submissions expiring soon (for proactive reminders)
   */
  static async findExpiringSoon(hoursUntilExpiry: number = 24): Promise<DocuSealSubmission[]> {
    const threshold = new Date(Date.now() + hoursUntilExpiry * 60 * 60 * 1000);
    return DocuSealSubmission.findAll({
      where: {
        status: ['pending', 'sent', 'viewed', 'partially_signed'],
        expireAt: {
          [Op.gt]: new Date(),
          [Op.lte]: threshold,
        },
      },
      order: [['expireAt', 'ASC']],
    });
  }

  // ============================================================================
  // ANALYTICS METHODS
  // ============================================================================

  /**
   * Get completion analytics for a time period
   */
  static async getAnalytics(options: {
    startDate?: Date;
    endDate?: Date;
    state?: string;
    templateId?: number;
    userId?: number;
  } = {}): Promise<{
    total: number;
    byStatus: Record<SubmissionStatus, number>;
    completionRate: number;
    avgTimeToComplete: number | null;
    avgTimeToView: number | null;
    declineRate: number;
    expiryRate: number;
  }> {
    const where: any = {};

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt[Op.gte] = options.startDate;
      if (options.endDate) where.createdAt[Op.lte] = options.endDate;
    }
    if (options.state) where.state = options.state;
    if (options.templateId) where.templateId = options.templateId;
    if (options.userId) where.userId = options.userId;

    const submissions = await DocuSealSubmission.findAll({ where });

    const total = submissions.length;
    if (total === 0) {
      return {
        total: 0,
        byStatus: {
          pending: 0,
          sent: 0,
          viewed: 0,
          partially_signed: 0,
          completed: 0,
          declined: 0,
          expired: 0,
          archived: 0,
        },
        completionRate: 0,
        avgTimeToComplete: null,
        avgTimeToView: null,
        declineRate: 0,
        expiryRate: 0,
      };
    }

    // Count by status
    const byStatus: Record<SubmissionStatus, number> = {
      pending: 0,
      sent: 0,
      viewed: 0,
      partially_signed: 0,
      completed: 0,
      declined: 0,
      expired: 0,
      archived: 0,
    };

    let completedCount = 0;
    let declinedCount = 0;
    let expiredCount = 0;
    let totalTimeToComplete = 0;
    let completedWithTimeCount = 0;
    let totalTimeToView = 0;
    let viewedWithTimeCount = 0;

    for (const sub of submissions) {
      byStatus[sub.status]++;

      if (sub.status === 'completed') {
        completedCount++;
        if (sub.completedAt && sub.sentAt) {
          totalTimeToComplete += sub.completedAt.getTime() - sub.sentAt.getTime();
          completedWithTimeCount++;
        }
      } else if (sub.status === 'declined') {
        declinedCount++;
      } else if (sub.status === 'expired') {
        expiredCount++;
      }

      if (sub.firstViewedAt && sub.sentAt) {
        totalTimeToView += sub.firstViewedAt.getTime() - sub.sentAt.getTime();
        viewedWithTimeCount++;
      }
    }

    return {
      total,
      byStatus,
      completionRate: (completedCount / total) * 100,
      avgTimeToComplete: completedWithTimeCount > 0 ? totalTimeToComplete / completedWithTimeCount : null,
      avgTimeToView: viewedWithTimeCount > 0 ? totalTimeToView / viewedWithTimeCount : null,
      declineRate: (declinedCount / total) * 100,
      expiryRate: (expiredCount / total) * 100,
    };
  }

  /**
   * Get funnel analytics (sent → viewed → signed)
   */
  static async getFunnelAnalytics(options: {
    startDate?: Date;
    endDate?: Date;
    state?: string;
  } = {}): Promise<{
    sent: number;
    viewed: number;
    partiallySigned: number;
    completed: number;
    declined: number;
    expired: number;
    sentToViewedRate: number;
    viewedToCompletedRate: number;
    overallConversionRate: number;
  }> {
    const where: any = {};

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt[Op.gte] = options.startDate;
      if (options.endDate) where.createdAt[Op.lte] = options.endDate;
    }
    if (options.state) where.state = options.state;

    const submissions = await DocuSealSubmission.findAll({ where });

    // Funnel stages (cumulative - someone who completed also counted as viewed)
    let sent = 0;
    let viewed = 0;
    let partiallySigned = 0;
    let completed = 0;
    let declined = 0;
    let expired = 0;

    for (const sub of submissions) {
      sent++; // All submissions were sent

      // Was it viewed? (viewed, partially_signed, completed all imply viewed)
      if (['viewed', 'partially_signed', 'completed'].includes(sub.status) || sub.firstViewedAt) {
        viewed++;
      }

      if (sub.status === 'partially_signed') {
        partiallySigned++;
      } else if (sub.status === 'completed') {
        partiallySigned++; // Completed implies partial signing happened
        completed++;
      } else if (sub.status === 'declined') {
        declined++;
      } else if (sub.status === 'expired') {
        expired++;
      }
    }

    return {
      sent,
      viewed,
      partiallySigned,
      completed,
      declined,
      expired,
      sentToViewedRate: sent > 0 ? (viewed / sent) * 100 : 0,
      viewedToCompletedRate: viewed > 0 ? (completed / viewed) * 100 : 0,
      overallConversionRate: sent > 0 ? (completed / sent) * 100 : 0,
    };
  }

  /**
   * Get decline reasons summary
   */
  static async getDeclineReasons(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<Array<{ reason: string; count: number; percentage: number }>> {
    const where: any = { status: 'declined' };

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt[Op.gte] = options.startDate;
      if (options.endDate) where.createdAt[Op.lte] = options.endDate;
    }

    const submissions = await DocuSealSubmission.findAll({ where });
    const total = submissions.length;

    if (total === 0) return [];

    // Count reasons
    const reasonCounts = new Map<string, number>();
    for (const sub of submissions) {
      const reason = sub.declineReason || 'No reason provided';
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }

    return Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get timeline analytics (hourly/daily distribution)
   */
  static async getTimelineAnalytics(options: {
    startDate: Date;
    endDate: Date;
    granularity?: 'hour' | 'day' | 'week';
  }): Promise<Array<{ period: string; sent: number; completed: number; declined: number }>> {
    const { granularity = 'day' } = options;

    // Use raw query for date truncation
    let dateFormat: string;
    switch (granularity) {
      case 'hour':
        dateFormat = 'YYYY-MM-DD HH24:00';
        break;
      case 'week':
        dateFormat = 'IYYY-IW';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    const [results] = await sequelize.query(`
      SELECT
        TO_CHAR("createdAt", '${dateFormat}') as period,
        COUNT(*) as sent,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined
      FROM "docuseal_submissions"
      WHERE "createdAt" >= :startDate AND "createdAt" <= :endDate
      GROUP BY period
      ORDER BY period ASC
    `, {
      replacements: {
        startDate: options.startDate,
        endDate: options.endDate,
      },
    });

    return (results as any[]).map(r => ({
      period: r.period,
      sent: parseInt(r.sent, 10),
      completed: parseInt(r.completed, 10),
      declined: parseInt(r.declined, 10),
    }));
  }

  // ============================================================================
  // INSTANCE METHODS
  // ============================================================================

  /**
   * Update status based on submitters
   */
  calculateStatus(): SubmissionStatus {
    if (!this.submitters || this.submitters.length === 0) {
      return 'pending';
    }

    const allCompleted = this.submitters.every(s => s.status === 'completed');
    const anyDeclined = this.submitters.some(s => s.status === 'declined');
    const anyCompleted = this.submitters.some(s => s.status === 'completed');
    const anyOpened = this.submitters.some(s => s.status === 'opened' || s.openedAt);

    if (allCompleted) return 'completed';
    if (anyDeclined) return 'declined';
    if (anyCompleted) return 'partially_signed';
    if (anyOpened) return 'viewed';
    if (this.submitters.some(s => s.status === 'sent')) return 'sent';

    return 'pending';
  }

  /**
   * Record reminder sent
   */
  async recordReminderSent(nextReminderIn?: number): Promise<void> {
    this.lastReminderAt = new Date();
    this.reminderCount = (this.reminderCount || 0) + 1;

    // Schedule next reminder (default: 24 hours later, or custom)
    if (nextReminderIn) {
      this.nextReminderAt = new Date(Date.now() + nextReminderIn);
    } else if (this.expireAt) {
      // Schedule reminder for halfway to expiry, min 24 hours
      const timeToExpiry = this.expireAt.getTime() - Date.now();
      const nextReminderTime = Math.max(timeToExpiry / 2, 24 * 60 * 60 * 1000);
      this.nextReminderAt = new Date(Date.now() + nextReminderTime);
    }

    await this.save();
  }

  /**
   * Record decline with reason
   */
  async recordDecline(declinedBy: string, reason?: string): Promise<void> {
    this.status = 'declined';
    this.declinedAt = new Date();
    this.declinedBy = declinedBy;
    this.declineReason = reason;
    this.nextReminderAt = undefined;

    // Update submitter record
    const submitter = this.submitters.find(s => s.email === declinedBy);
    if (submitter) {
      submitter.status = 'declined';
      submitter.declinedAt = new Date().toISOString();
      submitter.declineReason = reason;
    }

    await this.save();
  }
}

DocuSealSubmission.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    docuSealSubmissionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'docuseal_submission_id',
    },
    templateId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'template_id',
    },
    templateName: {
      type: DataTypes.STRING,
      field: 'template_name',
    },
    propertyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'properties',
        key: 'id',
      },
      onDelete: 'SET NULL',
      field: 'property_id',
    },
    pipelineId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'deal_pipelines',
        key: 'id',
      },
      onDelete: 'SET NULL',
      field: 'pipeline_id',
    },
    projectId: {
      type: DataTypes.UUID,
      references: {
        model: 'projects',
        key: 'id',
      },
      onDelete: 'SET NULL',
      field: 'project_id',
    },
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      field: 'user_id',
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'viewed', 'partially_signed', 'completed', 'declined', 'expired', 'archived'),
      allowNull: false,
      defaultValue: 'pending',
    },
    submitters: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    documentCategory: {
      type: DataTypes.STRING(50),
      field: 'document_category',
    },
    state: {
      type: DataTypes.STRING(10),
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    sentAt: {
      type: DataTypes.DATE,
      field: 'sent_at',
    },
    firstViewedAt: {
      type: DataTypes.DATE,
      field: 'first_viewed_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      field: 'completed_at',
    },
    declinedAt: {
      type: DataTypes.DATE,
      field: 'declined_at',
    },
    expireAt: {
      type: DataTypes.DATE,
      field: 'expire_at',
    },
    archivedAt: {
      type: DataTypes.DATE,
      field: 'archived_at',
    },
    declinedBy: {
      type: DataTypes.STRING,
      field: 'declined_by',
    },
    declineReason: {
      type: DataTypes.TEXT,
      field: 'decline_reason',
    },
    lastReminderAt: {
      type: DataTypes.DATE,
      field: 'last_reminder_at',
    },
    reminderCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'reminder_count',
    },
    nextReminderAt: {
      type: DataTypes.DATE,
      field: 'next_reminder_at',
    },
    auditLogUrl: {
      type: DataTypes.STRING,
      field: 'audit_log_url',
    },
    combinedDocumentUrl: {
      type: DataTypes.STRING,
      field: 'combined_document_url',
    },
    documentUrls: {
      type: DataTypes.JSONB,
      field: 'document_urls',
      defaultValue: [],
    },
  },
  {
    sequelize,
    tableName: 'docuseal_submissions',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['docuseal_submission_id'] },
      { fields: ['property_id'] },
      { fields: ['pipeline_id'] },
      { fields: ['project_id'] },
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['state'] },
      { fields: ['document_category'] },
      { fields: ['template_id'] },
      { fields: ['expire_at'] },
      { fields: ['next_reminder_at'] },
      { fields: ['created_at'] },
      // Composite index for reminder queries
      {
        fields: ['status', 'next_reminder_at', 'expire_at'],
        name: 'idx_reminder_due',
      },
      // Composite index for analytics queries
      {
        fields: ['created_at', 'status'],
        name: 'idx_analytics',
      },
    ],
  }
);

export default DocuSealSubmission;
