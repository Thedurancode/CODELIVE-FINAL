/**
 * Contact Activity Model
 *
 * Unified log of all communications with a contact: calls, emails, SMS, notes.
 * Provides a complete timeline view of all interactions.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type ActivityType = 'call' | 'email' | 'sms' | 'note' | 'meeting' | 'task' | 'voicemail';
export type ActivityDirection = 'inbound' | 'outbound' | 'internal';
export type ActivityStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

interface ContactActivityAttributes {
  id: number;
  contactId: string;
  organizationId?: string;
  userId?: string;

  // Activity type and direction
  type: ActivityType;
  direction: ActivityDirection;
  status: ActivityStatus;

  // Content
  subject?: string;
  content?: string;
  summary?: string;

  // Channel-specific data
  // For calls
  callSid?: string;
  callDuration?: number;
  callRecordingUrl?: string;
  callTranscript?: string;
  callOutcome?: string;

  // For emails
  emailMessageId?: string;
  emailFrom?: string;
  emailTo?: string[];
  emailCc?: string[];
  emailBcc?: string[];

  // For SMS
  smsSid?: string;
  smsFrom?: string;
  smsTo?: string;

  // Related entities
  dealId?: number;
  propertyId?: number;

  // Timestamps
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;

  // AI analysis
  aiSummary?: string;
  aiSentiment?: string;
  aiNextAction?: string;

  // Metadata
  metadata?: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

interface ContactActivityCreationAttributes
  extends Optional<
    ContactActivityAttributes,
    | 'id'
    | 'organizationId'
    | 'userId'
    | 'status'
    | 'subject'
    | 'content'
    | 'summary'
    | 'callSid'
    | 'callDuration'
    | 'callRecordingUrl'
    | 'callTranscript'
    | 'callOutcome'
    | 'emailMessageId'
    | 'emailFrom'
    | 'emailTo'
    | 'emailCc'
    | 'emailBcc'
    | 'smsSid'
    | 'smsFrom'
    | 'smsTo'
    | 'dealId'
    | 'propertyId'
    | 'scheduledAt'
    | 'startedAt'
    | 'completedAt'
    | 'aiSummary'
    | 'aiSentiment'
    | 'aiNextAction'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ContactActivity
  extends Model<ContactActivityAttributes, ContactActivityCreationAttributes>
  implements ContactActivityAttributes
{
  declare id: number;
  declare contactId: string;
  declare organizationId: string | undefined;
  declare userId: string | undefined;
  declare type: ActivityType;
  declare direction: ActivityDirection;
  declare status: ActivityStatus;
  declare subject: string | undefined;
  declare content: string | undefined;
  declare summary: string | undefined;
  declare callSid: string | undefined;
  declare callDuration: number | undefined;
  declare callRecordingUrl: string | undefined;
  declare callTranscript: string | undefined;
  declare callOutcome: string | undefined;
  declare emailMessageId: string | undefined;
  declare emailFrom: string | undefined;
  declare emailTo: string[] | undefined;
  declare emailCc: string[] | undefined;
  declare emailBcc: string[] | undefined;
  declare smsSid: string | undefined;
  declare smsFrom: string | undefined;
  declare smsTo: string | undefined;
  declare dealId: number | undefined;
  declare propertyId: number | undefined;
  declare scheduledAt: Date | undefined;
  declare startedAt: Date | undefined;
  declare completedAt: Date | undefined;
  declare aiSummary: string | undefined;
  declare aiSentiment: string | undefined;
  declare aiNextAction: string | undefined;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Log a phone call
   */
  static async logCall(data: {
    contactId: string;
    direction: ActivityDirection;
    callSid?: string;
    duration?: number;
    recordingUrl?: string;
    transcript?: string;
    outcome?: string;
    summary?: string;
    userId?: string;
    organizationId?: string;
    dealId?: number;
    propertyId?: number;
    metadata?: Record<string, any>;
  }): Promise<ContactActivity> {
    return ContactActivity.create({
      contactId: data.contactId,
      type: 'call',
      direction: data.direction,
      status: 'completed',
      callSid: data.callSid,
      callDuration: data.duration,
      callRecordingUrl: data.recordingUrl,
      callTranscript: data.transcript,
      callOutcome: data.outcome,
      summary: data.summary,
      userId: data.userId,
      organizationId: data.organizationId,
      dealId: data.dealId,
      propertyId: data.propertyId,
      completedAt: new Date(),
      metadata: data.metadata,
    });
  }

  /**
   * Log an email
   */
  static async logEmail(data: {
    contactId: string;
    direction: ActivityDirection;
    messageId?: string;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    content: string;
    status?: ActivityStatus;
    userId?: string;
    organizationId?: string;
    dealId?: number;
    propertyId?: number;
    metadata?: Record<string, any>;
  }): Promise<ContactActivity> {
    return ContactActivity.create({
      contactId: data.contactId,
      type: 'email',
      direction: data.direction,
      status: data.status || 'completed',
      emailMessageId: data.messageId,
      emailFrom: data.from,
      emailTo: data.to,
      emailCc: data.cc,
      emailBcc: data.bcc,
      subject: data.subject,
      content: data.content,
      userId: data.userId,
      organizationId: data.organizationId,
      dealId: data.dealId,
      propertyId: data.propertyId,
      completedAt: new Date(),
      metadata: data.metadata,
    });
  }

  /**
   * Log an SMS
   */
  static async logSms(data: {
    contactId: string;
    direction: ActivityDirection;
    smsSid?: string;
    from: string;
    to: string;
    content: string;
    status?: ActivityStatus;
    userId?: string;
    organizationId?: string;
    dealId?: number;
    propertyId?: number;
    metadata?: Record<string, any>;
  }): Promise<ContactActivity> {
    return ContactActivity.create({
      contactId: data.contactId,
      type: 'sms',
      direction: data.direction,
      status: data.status || 'completed',
      smsSid: data.smsSid,
      smsFrom: data.from,
      smsTo: data.to,
      content: data.content,
      userId: data.userId,
      organizationId: data.organizationId,
      dealId: data.dealId,
      propertyId: data.propertyId,
      completedAt: new Date(),
      metadata: data.metadata,
    });
  }

  /**
   * Log a note
   */
  static async logNote(data: {
    contactId: string;
    content: string;
    subject?: string;
    userId?: string;
    organizationId?: string;
    dealId?: number;
    propertyId?: number;
    metadata?: Record<string, any>;
  }): Promise<ContactActivity> {
    return ContactActivity.create({
      contactId: data.contactId,
      type: 'note',
      direction: 'internal',
      status: 'completed',
      subject: data.subject,
      content: data.content,
      userId: data.userId,
      organizationId: data.organizationId,
      dealId: data.dealId,
      propertyId: data.propertyId,
      completedAt: new Date(),
      metadata: data.metadata,
    });
  }

  /**
   * Get activity timeline for a contact
   */
  static async getTimeline(
    contactId: string,
    options?: {
      types?: ActivityType[];
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{ activities: ContactActivity[]; total: number }> {
    const where: any = { contactId };

    if (options?.types && options.types.length > 0) {
      where.type = options.types;
    }

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options?.startDate) where.createdAt[sequelize.Sequelize.Op.gte] = options.startDate;
      if (options?.endDate) where.createdAt[sequelize.Sequelize.Op.lte] = options.endDate;
    }

    const [activities, total] = await Promise.all([
      ContactActivity.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      }),
      ContactActivity.count({ where }),
    ]);

    return { activities, total };
  }

  /**
   * Get activity summary for a contact
   */
  static async getSummary(contactId: string): Promise<{
    totalCalls: number;
    totalEmails: number;
    totalSms: number;
    totalNotes: number;
    lastActivity: Date | null;
    lastCall: Date | null;
    lastEmail: Date | null;
  }> {
    const [counts, lastActivity, lastCall, lastEmail] = await Promise.all([
      ContactActivity.findAll({
        where: { contactId },
        attributes: [
          'type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        ],
        group: ['type'],
        raw: true,
      }) as Promise<Array<{ type: string; count: string }>>,
      ContactActivity.findOne({
        where: { contactId },
        order: [['createdAt', 'DESC']],
        attributes: ['createdAt'],
      }),
      ContactActivity.findOne({
        where: { contactId, type: 'call' },
        order: [['createdAt', 'DESC']],
        attributes: ['createdAt'],
      }),
      ContactActivity.findOne({
        where: { contactId, type: 'email' },
        order: [['createdAt', 'DESC']],
        attributes: ['createdAt'],
      }),
    ]);

    const countMap = counts.reduce((acc, c) => {
      acc[c.type] = parseInt(c.count, 10);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalCalls: countMap['call'] || 0,
      totalEmails: countMap['email'] || 0,
      totalSms: countMap['sms'] || 0,
      totalNotes: countMap['note'] || 0,
      lastActivity: lastActivity?.createdAt || null,
      lastCall: lastCall?.createdAt || null,
      lastEmail: lastEmail?.createdAt || null,
    };
  }
}

ContactActivity.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    contactId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'contacts',
        key: 'id',
      },
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM('call', 'email', 'sms', 'note', 'meeting', 'task', 'voicemail'),
      allowNull: false,
    },
    direction: {
      type: DataTypes.ENUM('inbound', 'outbound', 'internal'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'failed', 'cancelled'),
      defaultValue: 'completed',
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Call fields
    callSid: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    callDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    callRecordingUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    callTranscript: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    callOutcome: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Email fields
    emailMessageId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    emailFrom: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    emailTo: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    emailCc: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    emailBcc: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    // SMS fields
    smsSid: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    smsFrom: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    smsTo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Related entities
    dealId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // Timestamps
    scheduledAt: {
      type: DataTypes.DATE,
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
    // AI analysis
    aiSummary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    aiSentiment: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    aiNextAction: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Metadata
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'contact_activities',
    timestamps: true,
    indexes: [
      { fields: ['contactId'] },
      { fields: ['type'] },
      { fields: ['direction'] },
      { fields: ['status'] },
      { fields: ['userId'] },
      { fields: ['organizationId'] },
      { fields: ['dealId'] },
      { fields: ['propertyId'] },
      { fields: ['createdAt'] },
      { fields: ['contactId', 'type'] },
      { fields: ['contactId', 'createdAt'] },
      { fields: ['callSid'], unique: true, where: { callSid: { [sequelize.Sequelize.Op.ne]: null } } },
      { fields: ['emailMessageId'] },
      { fields: ['smsSid'] },
    ],
  }
);

export default ContactActivity;
