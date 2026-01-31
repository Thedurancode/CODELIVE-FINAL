/**
 * Meeting Model
 *
 * Stores scheduled meetings with support for:
 * - Project association (optional)
 * - Multiple participants (via MeetingParticipant)
 * - Video room integration
 * - External meeting links (Zoom, Google Meet, etc.)
 * - Recurring meeting support
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

// Meeting status
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

// Meeting type
export type MeetingType = 'video' | 'in_person' | 'phone' | 'external_link';

// Recurrence pattern
export type RecurrencePattern = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

export interface MeetingAttributes {
  id: string;
  organizationId: string;
  createdById: string;
  projectId: string | null;

  // Basic info
  title: string;
  description: string | null;
  meetingType: MeetingType;
  status: MeetingStatus;

  // Scheduling
  scheduledAt: Date;
  duration: number; // minutes
  timezone: string;
  endedAt: Date | null;

  // Location/Link
  location: string | null; // Physical address or description
  externalLink: string | null; // Zoom, Google Meet, etc.
  videoRoomId: string | null; // Our internal video room

  // Recurrence
  recurrence: RecurrencePattern;
  recurrenceRule: string | null; // iCal RRULE format for custom patterns
  recurrenceEndDate: Date | null;
  parentMeetingId: string | null; // For recurring instances

  // Reminders
  reminderSent: boolean;
  reminderMinutesBefore: number;

  // Notes & Recording
  notes: string | null;
  agenda: string | null;
  recordingUrl: string | null;
  transcriptUrl: string | null;

  // Calendar sync
  calendarEventId: string | null;
  calendarProvider: string | null; // 'google' | 'outlook'

  // Metadata
  tags: string[];
  metadata: Record<string, unknown> | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingCreationAttributes
  extends Optional<
    MeetingAttributes,
    | 'id'
    | 'projectId'
    | 'description'
    | 'status'
    | 'endedAt'
    | 'location'
    | 'externalLink'
    | 'videoRoomId'
    | 'recurrence'
    | 'recurrenceRule'
    | 'recurrenceEndDate'
    | 'parentMeetingId'
    | 'reminderSent'
    | 'reminderMinutesBefore'
    | 'notes'
    | 'agenda'
    | 'recordingUrl'
    | 'transcriptUrl'
    | 'calendarEventId'
    | 'calendarProvider'
    | 'tags'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class Meeting
  extends Model<MeetingAttributes, MeetingCreationAttributes>
  implements MeetingAttributes
{
  declare id: string;
  declare organizationId: string;
  declare createdById: string;
  declare projectId: string | null;

  declare title: string;
  declare description: string | null;
  declare meetingType: MeetingType;
  declare status: MeetingStatus;

  declare scheduledAt: Date;
  declare duration: number;
  declare timezone: string;
  declare endedAt: Date | null;

  declare location: string | null;
  declare externalLink: string | null;
  declare videoRoomId: string | null;

  declare recurrence: RecurrencePattern;
  declare recurrenceRule: string | null;
  declare recurrenceEndDate: Date | null;
  declare parentMeetingId: string | null;

  declare reminderSent: boolean;
  declare reminderMinutesBefore: number;

  declare notes: string | null;
  declare agenda: string | null;
  declare recordingUrl: string | null;
  declare transcriptUrl: string | null;

  declare calendarEventId: string | null;
  declare calendarProvider: string | null;

  declare tags: string[];
  declare metadata: Record<string, unknown> | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields from associations
  declare creator?: { id: string; name?: string; email?: string };
  declare project?: { id: string; title: string };
  declare participants?: Array<{
    id: number;
    contactId: string | null;
    userId: string | null;
    email: string;
    name: string;
    role: string;
    status: string;
  }>;

  /**
   * Check if meeting is upcoming
   */
  isUpcoming(): boolean {
    return this.status === 'scheduled' && new Date(this.scheduledAt) > new Date();
  }

  /**
   * Check if meeting is happening now
   */
  isHappeningNow(): boolean {
    const now = new Date();
    const start = new Date(this.scheduledAt);
    const end = new Date(start.getTime() + this.duration * 60000);
    return now >= start && now <= end;
  }

  /**
   * Get end time
   */
  getEndTime(): Date {
    return new Date(new Date(this.scheduledAt).getTime() + this.duration * 60000);
  }

  /**
   * Get upcoming meetings for organization
   */
  static async getUpcoming(
    organizationId: string,
    options?: {
      projectId?: string;
      userId?: string;
      limit?: number;
      includeParticipants?: boolean;
    }
  ): Promise<Meeting[]> {
    const where: Record<string, unknown> = {
      organizationId,
      status: 'scheduled',
      scheduledAt: { [Op.gte]: new Date() },
    };

    if (options?.projectId) {
      where.projectId = options.projectId;
    }

    return Meeting.findAll({
      where,
      order: [['scheduledAt', 'ASC']],
      limit: options?.limit || 50,
    });
  }

  /**
   * Get meetings needing reminders
   */
  static async getNeedingReminders(): Promise<Meeting[]> {
    const now = new Date();

    return Meeting.findAll({
      where: {
        status: 'scheduled',
        reminderSent: false,
        scheduledAt: {
          [Op.gte]: now,
          [Op.lte]: new Date(now.getTime() + 24 * 60 * 60000), // Next 24 hours
        },
      },
    });
  }
}

Meeting.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    projectId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'project_id',
      references: {
        model: 'projects',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    meetingType: {
      type: DataTypes.ENUM('video', 'in_person', 'phone', 'external_link'),
      allowNull: false,
      field: 'meeting_type',
      defaultValue: 'video',
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'),
      allowNull: false,
      defaultValue: 'scheduled',
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'scheduled_at',
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      validate: {
        min: 5,
        max: 480, // 8 hours max
      },
    },
    timezone: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'America/New_York',
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ended_at',
    },
    location: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    externalLink: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'external_link',
    },
    videoRoomId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'video_room_id',
    },
    recurrence: {
      type: DataTypes.ENUM('none', 'daily', 'weekly', 'biweekly', 'monthly', 'custom'),
      allowNull: false,
      defaultValue: 'none',
    },
    recurrenceRule: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'recurrence_rule',
    },
    recurrenceEndDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'recurrence_end_date',
    },
    parentMeetingId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_meeting_id',
      references: {
        model: 'meetings',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    reminderSent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'reminder_sent',
    },
    reminderMinutesBefore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 15,
      field: 'reminder_minutes_before',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    agenda: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    recordingUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'recording_url',
    },
    transcriptUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'transcript_url',
    },
    calendarEventId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'calendar_event_id',
    },
    calendarProvider: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'calendar_provider',
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'meetings',
    modelName: 'Meeting',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['organization_id'] },
      { fields: ['created_by_id'] },
      { fields: ['project_id'] },
      { fields: ['status'] },
      { fields: ['scheduled_at'] },
      { fields: ['organization_id', 'status', 'scheduled_at'] },
      { fields: ['organization_id', 'project_id'] },
      { fields: ['video_room_id'] },
      { fields: ['parent_meeting_id'] },
      { fields: ['calendar_event_id'] },
    ],
  }
);

export default Meeting;
