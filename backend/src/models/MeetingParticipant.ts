/**
 * MeetingParticipant Model
 *
 * Junction table linking Meetings to participants (users or contacts).
 * Tracks RSVP status, attendance, and participant roles.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

// Participant role in meeting
export type ParticipantRole = 'host' | 'co_host' | 'presenter' | 'attendee';

// RSVP status
export type RsvpStatus = 'pending' | 'accepted' | 'declined' | 'tentative' | 'no_response';

// Attendance status
export type AttendanceStatus = 'not_joined' | 'joined' | 'left' | 'no_show';

export interface MeetingParticipantAttributes {
  id: number;
  meetingId: string;
  organizationId: string;

  // Participant can be a user OR a contact (one should be set)
  userId: string | null;
  contactId: string | null;

  // Participant info (denormalized for external/guest participants)
  email: string;
  name: string;
  phone: string | null;

  // Role & Status
  role: ParticipantRole;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;

  // Tracking
  invitedAt: Date;
  respondedAt: Date | null;
  joinedAt: Date | null;
  leftAt: Date | null;

  // Notifications
  emailInviteSent: boolean;
  emailReminderSent: boolean;

  // For video meetings
  canShareScreen: boolean;
  canUnmute: boolean;

  // Notes
  notes: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingParticipantCreationAttributes
  extends Optional<
    MeetingParticipantAttributes,
    | 'id'
    | 'userId'
    | 'contactId'
    | 'phone'
    | 'role'
    | 'rsvpStatus'
    | 'attendanceStatus'
    | 'invitedAt'
    | 'respondedAt'
    | 'joinedAt'
    | 'leftAt'
    | 'emailInviteSent'
    | 'emailReminderSent'
    | 'canShareScreen'
    | 'canUnmute'
    | 'notes'
    | 'createdAt'
    | 'updatedAt'
  > {}

class MeetingParticipant
  extends Model<MeetingParticipantAttributes, MeetingParticipantCreationAttributes>
  implements MeetingParticipantAttributes
{
  declare id: number;
  declare meetingId: string;
  declare organizationId: string;

  declare userId: string | null;
  declare contactId: string | null;

  declare email: string;
  declare name: string;
  declare phone: string | null;

  declare role: ParticipantRole;
  declare rsvpStatus: RsvpStatus;
  declare attendanceStatus: AttendanceStatus;

  declare invitedAt: Date;
  declare respondedAt: Date | null;
  declare joinedAt: Date | null;
  declare leftAt: Date | null;

  declare emailInviteSent: boolean;
  declare emailReminderSent: boolean;

  declare canShareScreen: boolean;
  declare canUnmute: boolean;

  declare notes: string | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields from associations
  declare user?: { id: string; name?: string; email?: string; avatar?: string };
  declare contact?: { id: string; name: string; email?: string; phone?: string };
  declare meeting?: { id: string; title: string; scheduledAt: Date };

  /**
   * Check if participant is the host
   */
  isHost(): boolean {
    return this.role === 'host' || this.role === 'co_host';
  }

  /**
   * Check if participant has responded
   */
  hasResponded(): boolean {
    return this.rsvpStatus !== 'pending' && this.rsvpStatus !== 'no_response';
  }

  /**
   * Calculate attendance duration in minutes
   */
  getAttendanceDuration(): number | null {
    if (!this.joinedAt || !this.leftAt) return null;
    return Math.round((this.leftAt.getTime() - this.joinedAt.getTime()) / 60000);
  }

  /**
   * Get participants for a meeting
   */
  static async getForMeeting(meetingId: string): Promise<MeetingParticipant[]> {
    return MeetingParticipant.findAll({
      where: { meetingId },
      order: [
        ['role', 'ASC'], // Hosts first
        ['name', 'ASC'],
      ],
    });
  }

  /**
   * Get meetings for a user
   */
  static async getMeetingsForUser(
    userId: string,
    options?: {
      status?: RsvpStatus[];
      upcoming?: boolean;
    }
  ): Promise<MeetingParticipant[]> {
    const where: Record<string, unknown> = { userId };

    if (options?.status) {
      where.rsvpStatus = { [Op.in]: options.status };
    }

    return MeetingParticipant.findAll({
      where,
      order: [['invitedAt', 'DESC']],
    });
  }

  /**
   * Get meetings for a contact
   */
  static async getMeetingsForContact(contactId: string): Promise<MeetingParticipant[]> {
    return MeetingParticipant.findAll({
      where: { contactId },
      order: [['invitedAt', 'DESC']],
    });
  }

  /**
   * Add participant to meeting
   */
  static async addParticipant(
    meetingId: string,
    organizationId: string,
    participant: {
      email: string;
      name: string;
      userId?: string;
      contactId?: string;
      role?: ParticipantRole;
      phone?: string;
    }
  ): Promise<MeetingParticipant> {
    // Check if already exists
    const existing = await MeetingParticipant.findOne({
      where: {
        meetingId,
        email: participant.email,
      },
    });

    if (existing) {
      return existing;
    }

    return MeetingParticipant.create({
      meetingId,
      organizationId,
      email: participant.email,
      name: participant.name,
      userId: participant.userId || null,
      contactId: participant.contactId || null,
      role: participant.role || 'attendee',
      phone: participant.phone || null,
    });
  }

  /**
   * Update RSVP status
   */
  static async updateRsvp(
    participantId: number,
    status: RsvpStatus
  ): Promise<MeetingParticipant | null> {
    const participant = await MeetingParticipant.findByPk(participantId);
    if (!participant) return null;

    await participant.update({
      rsvpStatus: status,
      respondedAt: new Date(),
    });

    return participant;
  }

  /**
   * Record participant joining meeting
   */
  static async recordJoin(participantId: number): Promise<MeetingParticipant | null> {
    const participant = await MeetingParticipant.findByPk(participantId);
    if (!participant) return null;

    await participant.update({
      attendanceStatus: 'joined',
      joinedAt: new Date(),
    });

    return participant;
  }

  /**
   * Record participant leaving meeting
   */
  static async recordLeave(participantId: number): Promise<MeetingParticipant | null> {
    const participant = await MeetingParticipant.findByPk(participantId);
    if (!participant) return null;

    await participant.update({
      attendanceStatus: 'left',
      leftAt: new Date(),
    });

    return participant;
  }

  /**
   * Get participants needing invite emails
   */
  static async getNeedingInvites(meetingId: string): Promise<MeetingParticipant[]> {
    return MeetingParticipant.findAll({
      where: {
        meetingId,
        emailInviteSent: false,
      },
    });
  }

  /**
   * Get participants needing reminder emails
   */
  static async getNeedingReminders(meetingId: string): Promise<MeetingParticipant[]> {
    return MeetingParticipant.findAll({
      where: {
        meetingId,
        emailReminderSent: false,
        rsvpStatus: { [Op.in]: ['accepted', 'tentative', 'pending'] },
      },
    });
  }
}

MeetingParticipant.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    meetingId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'meeting_id',
      references: {
        model: 'meetings',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    contactId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'contact_id',
      references: {
        model: 'contacts',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isEmail: true,
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM('host', 'co_host', 'presenter', 'attendee'),
      allowNull: false,
      defaultValue: 'attendee',
    },
    rsvpStatus: {
      type: DataTypes.ENUM('pending', 'accepted', 'declined', 'tentative', 'no_response'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'rsvp_status',
    },
    attendanceStatus: {
      type: DataTypes.ENUM('not_joined', 'joined', 'left', 'no_show'),
      allowNull: false,
      defaultValue: 'not_joined',
      field: 'attendance_status',
    },
    invitedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'invited_at',
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'responded_at',
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'joined_at',
    },
    leftAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'left_at',
    },
    emailInviteSent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'email_invite_sent',
    },
    emailReminderSent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'email_reminder_sent',
    },
    canShareScreen: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'can_share_screen',
    },
    canUnmute: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'can_unmute',
    },
    notes: {
      type: DataTypes.TEXT,
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
    tableName: 'meeting_participants',
    modelName: 'MeetingParticipant',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['meeting_id'] },
      { fields: ['user_id'] },
      { fields: ['contact_id'] },
      { fields: ['organization_id'] },
      { fields: ['email'] },
      { fields: ['meeting_id', 'email'], unique: true },
      { fields: ['meeting_id', 'user_id'] },
      { fields: ['meeting_id', 'contact_id'] },
      { fields: ['rsvp_status'] },
      { fields: ['attendance_status'] },
    ],
  }
);

export default MeetingParticipant;
