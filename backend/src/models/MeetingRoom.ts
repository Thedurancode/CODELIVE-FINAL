/**
 * MeetingRoom Model
 *
 * Manages video room instances for meetings.
 * Supports LiveKit integration for real-time video conferencing.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

// Room status
export type RoomStatus = 'pending' | 'active' | 'ended' | 'failed';

export interface MeetingRoomAttributes {
  id: string;
  meetingId: string;
  organizationId: string;

  // Room identification
  roomName: string; // Unique room name for video provider
  roomSid: string | null; // Provider-assigned room ID

  // Status
  status: RoomStatus;

  // Timing
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;

  // Participants tracking
  maxParticipants: number;
  currentParticipants: number;
  totalParticipantsJoined: number;

  // Recording
  recordingEnabled: boolean;
  recordingStartedAt: Date | null;
  recordingUrl: string | null;
  recordingDuration: number | null; // seconds

  // Branding
  backgroundUrl: string | null;
  logoUrl: string | null;
  welcomeMessage: string | null;

  // Settings
  waitingRoomEnabled: boolean;
  chatEnabled: boolean;
  screenShareEnabled: boolean;
  participantVideoEnabled: boolean;
  participantAudioEnabled: boolean;

  // Provider info
  provider: string; // 'livekit' | 'twilio' | 'daily'
  providerMetadata: Record<string, unknown> | null;

  // Analytics
  metadata: Record<string, unknown> | null;

  updatedAt: Date;
}

export interface MeetingRoomCreationAttributes
  extends Optional<
    MeetingRoomAttributes,
    | 'id'
    | 'roomSid'
    | 'status'
    | 'startedAt'
    | 'endedAt'
    | 'maxParticipants'
    | 'currentParticipants'
    | 'totalParticipantsJoined'
    | 'recordingEnabled'
    | 'recordingStartedAt'
    | 'recordingUrl'
    | 'recordingDuration'
    | 'backgroundUrl'
    | 'logoUrl'
    | 'welcomeMessage'
    | 'waitingRoomEnabled'
    | 'chatEnabled'
    | 'screenShareEnabled'
    | 'participantVideoEnabled'
    | 'participantAudioEnabled'
    | 'provider'
    | 'providerMetadata'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class MeetingRoom
  extends Model<MeetingRoomAttributes, MeetingRoomCreationAttributes>
  implements MeetingRoomAttributes
{
  declare id: string;
  declare meetingId: string;
  declare organizationId: string;

  declare roomName: string;
  declare roomSid: string | null;

  declare status: RoomStatus;

  declare startedAt: Date | null;
  declare endedAt: Date | null;

  declare maxParticipants: number;
  declare currentParticipants: number;
  declare totalParticipantsJoined: number;

  declare recordingEnabled: boolean;
  declare recordingStartedAt: Date | null;
  declare recordingUrl: string | null;
  declare recordingDuration: number | null;

  declare backgroundUrl: string | null;
  declare logoUrl: string | null;
  declare welcomeMessage: string | null;

  declare waitingRoomEnabled: boolean;
  declare chatEnabled: boolean;
  declare screenShareEnabled: boolean;
  declare participantVideoEnabled: boolean;
  declare participantAudioEnabled: boolean;

  declare provider: string;
  declare providerMetadata: Record<string, unknown> | null;

  declare metadata: Record<string, unknown> | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields from associations
  declare meeting?: {
    id: string;
    title: string;
    scheduledAt: Date;
    duration: number;
  };

  /**
   * Check if room is active
   */
  isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Check if room can be joined
   */
  canJoin(): boolean {
    return (
      this.status === 'pending' ||
      (this.status === 'active' && this.currentParticipants < this.maxParticipants)
    );
  }

  /**
   * Get room duration in minutes
   */
  getDuration(): number | null {
    if (!this.startedAt) return null;
    const end = this.endedAt || new Date();
    return Math.round((end.getTime() - this.startedAt.getTime()) / 60000);
  }

  /**
   * Generate a unique room name
   */
  static generateRoomName(meetingId: string, organizationId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${organizationId.substring(0, 8)}-${meetingId.substring(0, 8)}-${timestamp}-${random}`;
  }

  /**
   * Get room by meeting ID
   */
  static async getByMeetingId(meetingId: string): Promise<MeetingRoom | null> {
    return MeetingRoom.findOne({
      where: { meetingId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get active room by meeting ID
   */
  static async getActiveByMeetingId(meetingId: string): Promise<MeetingRoom | null> {
    return MeetingRoom.findOne({
      where: {
        meetingId,
        status: { [Op.in]: ['pending', 'active'] },
      },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Create room for meeting
   */
  static async createForMeeting(
    meetingId: string,
    organizationId: string,
    options?: {
      recordingEnabled?: boolean;
      waitingRoomEnabled?: boolean;
      maxParticipants?: number;
      backgroundUrl?: string;
      logoUrl?: string;
      welcomeMessage?: string;
    }
  ): Promise<MeetingRoom> {
    const roomName = MeetingRoom.generateRoomName(meetingId, organizationId);

    return MeetingRoom.create({
      meetingId,
      organizationId,
      roomName,
      recordingEnabled: options?.recordingEnabled ?? false,
      waitingRoomEnabled: options?.waitingRoomEnabled ?? false,
      maxParticipants: options?.maxParticipants ?? 50,
      backgroundUrl: options?.backgroundUrl ?? null,
      logoUrl: options?.logoUrl ?? null,
      welcomeMessage: options?.welcomeMessage ?? null,
    });
  }

  /**
   * Start the room
   */
  async start(roomSid?: string): Promise<MeetingRoom> {
    await this.update({
      status: 'active',
      startedAt: new Date(),
      roomSid: roomSid || null,
    });
    return this;
  }

  /**
   * End the room
   */
  async end(): Promise<MeetingRoom> {
    await this.update({
      status: 'ended',
      endedAt: new Date(),
      currentParticipants: 0,
    });
    return this;
  }

  /**
   * Update participant count
   */
  async updateParticipantCount(delta: number): Promise<MeetingRoom> {
    const newCount = Math.max(0, this.currentParticipants + delta);
    const updates: Partial<MeetingRoomAttributes> = {
      currentParticipants: newCount,
    };

    if (delta > 0) {
      updates.totalParticipantsJoined = this.totalParticipantsJoined + delta;
    }

    await this.update(updates);
    return this;
  }

  /**
   * Get active rooms needing cleanup (ended but not marked)
   */
  static async getStaleRooms(olderThanMinutes: number = 60): Promise<MeetingRoom[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60000);

    return MeetingRoom.findAll({
      where: {
        status: 'active',
        startedAt: { [Op.lt]: cutoff },
        currentParticipants: 0,
      },
    });
  }

  /**
   * Get room statistics for organization
   */
  static async getStats(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalRooms: number;
    totalDuration: number;
    totalParticipants: number;
    avgDuration: number;
    avgParticipants: number;
  }> {
    const where: Record<string, unknown> = {
      organizationId,
      status: 'ended',
    };

    if (startDate || endDate) {
      const endedAtConditions: Record<symbol, Date> = {};
      if (startDate) endedAtConditions[Op.gte] = startDate;
      if (endDate) endedAtConditions[Op.lte] = endDate;
      where.endedAt = endedAtConditions;
    }

    const rooms = await MeetingRoom.findAll({ where });

    const stats = rooms.reduce(
      (acc, room) => {
        const duration = room.getDuration() || 0;
        return {
          totalRooms: acc.totalRooms + 1,
          totalDuration: acc.totalDuration + duration,
          totalParticipants: acc.totalParticipants + room.totalParticipantsJoined,
        };
      },
      { totalRooms: 0, totalDuration: 0, totalParticipants: 0 }
    );

    return {
      ...stats,
      avgDuration: stats.totalRooms > 0 ? Math.round(stats.totalDuration / stats.totalRooms) : 0,
      avgParticipants:
        stats.totalRooms > 0 ? Math.round(stats.totalParticipants / stats.totalRooms) : 0,
    };
  }
}

MeetingRoom.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
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
    roomName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'room_name',
    },
    roomSid: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'room_sid',
    },
    status: {
      type: DataTypes.ENUM('pending', 'active', 'ended', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at',
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ended_at',
    },
    maxParticipants: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50,
      field: 'max_participants',
    },
    currentParticipants: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'current_participants',
    },
    totalParticipantsJoined: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_participants_joined',
    },
    recordingEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'recording_enabled',
    },
    recordingStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'recording_started_at',
    },
    recordingUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'recording_url',
    },
    recordingDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'recording_duration',
    },
    backgroundUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'background_url',
    },
    logoUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'logo_url',
    },
    welcomeMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'welcome_message',
    },
    waitingRoomEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'waiting_room_enabled',
    },
    chatEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'chat_enabled',
    },
    screenShareEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'screen_share_enabled',
    },
    participantVideoEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'participant_video_enabled',
    },
    participantAudioEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'participant_audio_enabled',
    },
    provider: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'daily',
    },
    providerMetadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'provider_metadata',
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
    tableName: 'meeting_rooms',
    modelName: 'MeetingRoom',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['meeting_id'] },
      { fields: ['organization_id'] },
      { fields: ['room_name'], unique: true },
      { fields: ['room_sid'] },
      { fields: ['status'] },
      { fields: ['organization_id', 'status'] },
      { fields: ['started_at'] },
      { fields: ['ended_at'] },
    ],
  }
);

export default MeetingRoom;
