/**
 * Meeting Service
 *
 * Business logic for meeting management including:
 * - CRUD operations for meetings
 * - Participant management
 * - Video room creation with Daily.co integration
 * - Calendar integration
 */

import { Op } from 'sequelize';
import Meeting, {
  MeetingStatus,
  MeetingType,
  RecurrencePattern,
} from '../models/Meeting';
import MeetingParticipant, {
  ParticipantRole,
  RsvpStatus,
} from '../models/MeetingParticipant';
import MeetingRoom from '../models/MeetingRoom';
import MarketplaceUser from '../models/MarketplaceUser';
import Project from '../models/Project';

// =============================================================================
// TYPES
// =============================================================================

interface CreateMeetingInput {
  organizationId: string;
  createdById: string;
  title: string;
  description?: string;
  meetingType?: MeetingType;
  scheduledAt: Date;
  duration?: number;
  timezone?: string;
  projectId?: string;
  location?: string;
  externalLink?: string;
  recurrence?: RecurrencePattern;
  recurrenceRule?: string;
  recurrenceEndDate?: Date;
  reminderMinutesBefore?: number;
  agenda?: string;
  tags?: string[];
  participants?: Array<{
    email: string;
    name: string;
    userId?: string;
    contactId?: string;
    role?: ParticipantRole;
  }>;
  roomOptions?: {
    recordingEnabled?: boolean;
    waitingRoomEnabled?: boolean;
    maxParticipants?: number;
    backgroundUrl?: string;
    logoUrl?: string;
    welcomeMessage?: string;
  };
}

interface UpdateMeetingInput {
  title?: string;
  description?: string;
  meetingType?: MeetingType;
  status?: MeetingStatus;
  scheduledAt?: Date;
  duration?: number;
  timezone?: string;
  projectId?: string | null;
  location?: string;
  externalLink?: string;
  notes?: string;
  agenda?: string;
  tags?: string[];
}

interface MeetingFilters {
  status?: MeetingStatus | MeetingStatus[];
  meetingType?: MeetingType;
  projectId?: string;
  createdById?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  tags?: string[];
  upcoming?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

interface MeetingResponse {
  id: string;
  organizationId: string;
  createdById: string;
  projectId: string | null;
  title: string;
  description: string | null;
  meetingType: MeetingType;
  status: MeetingStatus;
  scheduledAt: Date;
  duration: number;
  timezone: string;
  endedAt: Date | null;
  location: string | null;
  externalLink: string | null;
  videoRoomId: string | null;
  recurrence: RecurrencePattern;
  notes: string | null;
  agenda: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  creator?: { id: string; name?: string; email?: string };
  project?: { id: string; title: string };
  participants?: Array<{
    id: number;
    email: string;
    name: string;
    role: ParticipantRole;
    rsvpStatus: RsvpStatus;
    userId: string | null;
    contactId: string | null;
  }>;
  room?: {
    id: string;
    roomName: string;
    status: string;
    currentParticipants: number;
    dailyRoomUrl?: string;
  } | null;
}

interface RoomTokenResponse {
  token: string;
  roomName: string;
  roomUrl: string;
  participantName: string;
  participantId: string;
}

// Daily.co API types
interface DailyRoomResponse {
  id: string;
  name: string;
  api_created: boolean;
  privacy: string;
  url: string;
  created_at: string;
  config: {
    max_participants?: number;
    enable_chat?: boolean;
    enable_screenshare?: boolean;
    enable_recording?: string;
    start_video_off?: boolean;
    start_audio_off?: boolean;
  };
}

interface DailyMeetingTokenResponse {
  token: string;
}

// =============================================================================
// SERVICE
// =============================================================================

class MeetingService {
  private initialized = false;
  private dailyApiKey: string | null = null;
  private dailyDomain: string | null = null;

  async initialize(): Promise<void> {
    // Initialize Daily.co credentials
    this.dailyApiKey = process.env.DAILY_API_KEY || null;
    this.dailyDomain = process.env.DAILY_DOMAIN || null;

    if (this.dailyApiKey && this.dailyDomain) {
      console.log('[MeetingService] Daily.co integration configured');
    } else {
      console.warn('[MeetingService] Daily.co not configured - video rooms will be limited');
      console.warn('[MeetingService] Set DAILY_API_KEY and DAILY_DOMAIN environment variables');
    }

    this.initialized = true;
    console.log('MeetingService initialized');
  }

  isReady(): boolean {
    return this.initialized && this.isDailyConfigured();
  }

  isDailyConfigured(): boolean {
    return !!(this.dailyApiKey && this.dailyDomain);
  }

  // ===========================================================================
  // DAILY.CO API
  // ===========================================================================

  /**
   * Create a room in Daily.co
   */
  private async createDailyRoom(
    roomName: string,
    options?: {
      maxParticipants?: number;
      enableRecording?: boolean;
      enableWaitingRoom?: boolean;
      expiryMinutes?: number;
    }
  ): Promise<DailyRoomResponse | null> {
    if (!this.isDailyConfigured()) {
      console.warn('[MeetingService] Daily.co not configured');
      return null;
    }

    try {
      const response = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.dailyApiKey}`,
        },
        body: JSON.stringify({
          name: roomName,
          privacy: 'private', // Requires token to join
          properties: {
            max_participants: options?.maxParticipants || 50,
            enable_chat: true,
            enable_screenshare: true,
            enable_recording: options?.enableRecording ? 'cloud' : undefined,
            enable_knocking: options?.enableWaitingRoom || false,
            exp: options?.expiryMinutes
              ? Math.floor(Date.now() / 1000) + options.expiryMinutes * 60
              : undefined,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[MeetingService] Failed to create Daily room:', error);
        return null;
      }

      return (await response.json()) as DailyRoomResponse;
    } catch (error) {
      console.error('[MeetingService] Daily.co API error:', error);
      return null;
    }
  }

  /**
   * Delete a room from Daily.co
   */
  private async deleteDailyRoom(roomName: string): Promise<boolean> {
    if (!this.isDailyConfigured()) return false;

    try {
      const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.dailyApiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('[MeetingService] Failed to delete Daily room:', error);
      return false;
    }
  }

  /**
   * Generate a meeting token for Daily.co
   */
  private async createDailyMeetingToken(
    roomName: string,
    participantInfo: {
      participantId: string;
      participantName: string;
      isOwner?: boolean;
      expiryMinutes?: number;
    }
  ): Promise<string | null> {
    if (!this.isDailyConfigured()) return null;

    try {
      const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.dailyApiKey}`,
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_id: participantInfo.participantId,
            user_name: participantInfo.participantName,
            is_owner: participantInfo.isOwner || false,
            enable_screenshare: true,
            start_video_off: false,
            start_audio_off: false,
            exp: Math.floor(Date.now() / 1000) + (participantInfo.expiryMinutes || 120) * 60,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[MeetingService] Failed to create Daily token:', error);
        return null;
      }

      const data = (await response.json()) as DailyMeetingTokenResponse;
      return data.token;
    } catch (error) {
      console.error('[MeetingService] Daily.co token API error:', error);
      return null;
    }
  }

  /**
   * Get the Daily.co room URL
   */
  private getDailyRoomUrl(roomName: string): string {
    return `https://${this.dailyDomain}.daily.co/${roomName}`;
  }

  // ===========================================================================
  // MEETING CRUD
  // ===========================================================================

  /**
   * Create a new meeting
   */
  async createMeeting(input: CreateMeetingInput): Promise<MeetingResponse> {
    const {
      organizationId,
      createdById,
      title,
      description,
      meetingType = 'video',
      scheduledAt,
      duration = 30,
      timezone = 'America/New_York',
      projectId,
      location,
      externalLink,
      recurrence = 'none',
      recurrenceRule,
      recurrenceEndDate,
      reminderMinutesBefore = 15,
      agenda,
      tags = [],
      participants = [],
      roomOptions,
    } = input;

    // Create the meeting
    const meeting = await Meeting.create({
      organizationId,
      createdById,
      title,
      description: description || null,
      meetingType,
      scheduledAt,
      duration,
      timezone,
      projectId: projectId || null,
      location: location || null,
      externalLink: externalLink || null,
      recurrence,
      recurrenceRule: recurrenceRule || null,
      recurrenceEndDate: recurrenceEndDate || null,
      reminderMinutesBefore,
      agenda: agenda || null,
      tags,
    });

    // Create video room if it's a video meeting
    if (meetingType === 'video') {
      const room = await MeetingRoom.createForMeeting(
        meeting.id,
        organizationId,
        {
          ...roomOptions,
          provider: 'daily',
        }
      );

      // Create the room in Daily.co
      if (this.isDailyConfigured()) {
        const dailyRoom = await this.createDailyRoom(room.roomName, {
          maxParticipants: roomOptions?.maxParticipants,
          enableRecording: roomOptions?.recordingEnabled,
          enableWaitingRoom: roomOptions?.waitingRoomEnabled,
          expiryMinutes: duration + 60, // Room expires 1 hour after scheduled end
        });

        if (dailyRoom) {
          await room.update({
            roomSid: dailyRoom.id,
            providerMetadata: {
              dailyUrl: dailyRoom.url,
              dailyRoomId: dailyRoom.id,
            },
          });
        }
      }

      await meeting.update({ videoRoomId: room.id });
    }

    // Add creator as host
    const creator = await MarketplaceUser.findByPk(createdById);
    if (creator) {
      await MeetingParticipant.addParticipant(meeting.id, organizationId, {
        email: creator.email,
        name: creator.name || creator.email,
        userId: createdById,
        role: 'host',
      });
    }

    // Add other participants
    for (const participant of participants) {
      await MeetingParticipant.addParticipant(meeting.id, organizationId, participant);
    }

    return this.getMeetingById(meeting.id, organizationId) as Promise<MeetingResponse>;
  }

  /**
   * Get meeting by ID
   */
  async getMeetingById(
    meetingId: string,
    organizationId: string
  ): Promise<MeetingResponse | null> {
    const meeting = await Meeting.findOne({
      where: { id: meetingId, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'title'],
        },
      ],
    });

    if (!meeting) return null;

    // Get participants
    const participants = await MeetingParticipant.getForMeeting(meetingId);

    // Get room if exists
    let room = null;
    if (meeting.videoRoomId) {
      const meetingRoom = await MeetingRoom.findByPk(meeting.videoRoomId);
      if (meetingRoom) {
        room = {
          id: meetingRoom.id,
          roomName: meetingRoom.roomName,
          status: meetingRoom.status,
          currentParticipants: meetingRoom.currentParticipants,
          dailyRoomUrl: this.isDailyConfigured()
            ? this.getDailyRoomUrl(meetingRoom.roomName)
            : undefined,
        };
      }
    }

    return this.formatMeeting(meeting, participants, room);
  }

  /**
   * Get meetings with filters
   */
  async getMeetings(
    organizationId: string,
    filters: MeetingFilters = {}
  ): Promise<{ meetings: MeetingResponse[]; total: number; page: number; totalPages: number }> {
    const {
      status,
      meetingType,
      projectId,
      createdById,
      startDate,
      endDate,
      search,
      tags,
      upcoming,
      page = 1,
      limit = 20,
      sortBy = 'scheduledAt',
      sortOrder = 'ASC',
    } = filters;

    const where: Record<string, unknown> = { organizationId };

    // Handle upcoming filter - show scheduled meetings in the future
    if (upcoming) {
      where.status = 'scheduled';
      where.scheduledAt = { [Op.gte]: new Date() };
    } else if (status) {
      where.status = Array.isArray(status) ? { [Op.in]: status } : status;
    }
    if (meetingType) where.meetingType = meetingType;
    if (projectId) where.projectId = projectId;
    if (createdById) where.createdById = createdById;
    if (startDate) where.scheduledAt = { ...(where.scheduledAt as object || {}), [Op.gte]: startDate };
    if (endDate) where.scheduledAt = { ...(where.scheduledAt as object || {}), [Op.lte]: endDate };
    if (search) {
      where[Op.or as unknown as string] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (tags && tags.length > 0) {
      where.tags = { [Op.overlap]: tags };
    }

    const offset = (page - 1) * limit;

    const { rows: meetings, count: total } = await Meeting.findAndCountAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'title'],
        },
      ],
      order: [[sortBy, sortOrder]],
      limit,
      offset,
    });

    // Get participants for each meeting
    const meetingResponses = await Promise.all(
      meetings.map(async (meeting) => {
        const participants = await MeetingParticipant.getForMeeting(meeting.id);
        return this.formatMeeting(meeting, participants);
      })
    );

    return {
      meetings: meetingResponses,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get upcoming meetings
   */
  async getUpcomingMeetings(
    organizationId: string,
    options?: { userId?: string; projectId?: string; limit?: number }
  ): Promise<MeetingResponse[]> {
    const where: Record<string, unknown> = {
      organizationId,
      status: 'scheduled',
      scheduledAt: { [Op.gte]: new Date() },
    };

    if (options?.projectId) where.projectId = options.projectId;

    const meetings = await Meeting.findAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'title'],
        },
      ],
      order: [['scheduledAt', 'ASC']],
      limit: options?.limit || 10,
    });

    // Filter by user participation if specified
    if (options?.userId) {
      const userMeetingIds = await MeetingParticipant.findAll({
        where: { userId: options.userId },
        attributes: ['meetingId'],
      }).then((p) => p.map((p) => p.meetingId));

      const filteredMeetings = meetings.filter(
        (m) => userMeetingIds.includes(m.id) || m.createdById === options.userId
      );

      return Promise.all(
        filteredMeetings.map(async (meeting) => {
          const participants = await MeetingParticipant.getForMeeting(meeting.id);
          return this.formatMeeting(meeting, participants);
        })
      );
    }

    return Promise.all(
      meetings.map(async (meeting) => {
        const participants = await MeetingParticipant.getForMeeting(meeting.id);
        return this.formatMeeting(meeting, participants);
      })
    );
  }

  /**
   * Update meeting
   */
  async updateMeeting(
    meetingId: string,
    organizationId: string,
    updates: UpdateMeetingInput
  ): Promise<MeetingResponse | null> {
    const meeting = await Meeting.findOne({
      where: { id: meetingId, organizationId },
    });

    if (!meeting) return null;

    await meeting.update(updates);

    return this.getMeetingById(meetingId, organizationId);
  }

  /**
   * Delete meeting
   */
  async deleteMeeting(meetingId: string, organizationId: string): Promise<boolean> {
    const meeting = await Meeting.findOne({
      where: { id: meetingId, organizationId },
    });

    if (!meeting) return false;

    // End any active room
    if (meeting.videoRoomId) {
      const room = await MeetingRoom.findByPk(meeting.videoRoomId);
      if (room) {
        await this.endRoom(room.id);
      }
    }

    await meeting.destroy();
    return true;
  }

  /**
   * Start meeting (change status to in_progress)
   */
  async startMeeting(meetingId: string, organizationId: string): Promise<MeetingResponse | null> {
    const meeting = await Meeting.findOne({
      where: { id: meetingId, organizationId },
    });

    if (!meeting) return null;

    await meeting.update({ status: 'in_progress' });

    // Start the room if it's a video meeting
    if (meeting.videoRoomId) {
      const room = await MeetingRoom.findByPk(meeting.videoRoomId);
      if (room) {
        await room.start();
      }
    }

    return this.getMeetingById(meetingId, organizationId);
  }

  /**
   * End meeting
   */
  async endMeeting(meetingId: string, organizationId: string): Promise<MeetingResponse | null> {
    const meeting = await Meeting.findOne({
      where: { id: meetingId, organizationId },
    });

    if (!meeting) return null;

    await meeting.update({
      status: 'completed',
      endedAt: new Date(),
    });

    // End the room
    if (meeting.videoRoomId) {
      await this.endRoom(meeting.videoRoomId);
    }

    return this.getMeetingById(meetingId, organizationId);
  }

  // ===========================================================================
  // PARTICIPANTS
  // ===========================================================================

  /**
   * Add participant to meeting
   */
  async addParticipant(
    meetingId: string,
    organizationId: string,
    participant: {
      email: string;
      name: string;
      userId?: string;
      contactId?: string;
      role?: ParticipantRole;
    }
  ): Promise<MeetingParticipant> {
    return MeetingParticipant.addParticipant(meetingId, organizationId, participant);
  }

  /**
   * Remove participant from meeting
   */
  async removeParticipant(participantId: number): Promise<boolean> {
    const participant = await MeetingParticipant.findByPk(participantId);
    if (!participant) return false;

    await participant.destroy();
    return true;
  }

  /**
   * Update participant RSVP
   */
  async updateParticipantRsvp(
    participantId: number,
    status: RsvpStatus
  ): Promise<MeetingParticipant | null> {
    return MeetingParticipant.updateRsvp(participantId, status);
  }

  /**
   * Get participants for meeting
   */
  async getParticipants(meetingId: string): Promise<MeetingParticipant[]> {
    return MeetingParticipant.getForMeeting(meetingId);
  }

  // ===========================================================================
  // VIDEO ROOMS
  // ===========================================================================

  /**
   * Check if a Daily.co room exists
   */
  private async checkDailyRoomExists(roomName: string): Promise<boolean> {
    if (!this.isDailyConfigured()) return false;

    try {
      const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.dailyApiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('[MeetingService] Error checking Daily room:', error);
      return false;
    }
  }

  /**
   * Get or create room for meeting
   * Always ensures the Daily.co room exists before returning
   */
  async getOrCreateRoom(meetingId: string, organizationId: string): Promise<MeetingRoom | null> {
    const meeting = await Meeting.findOne({
      where: { id: meetingId, organizationId },
    });

    if (!meeting || meeting.meetingType !== 'video') return null;

    let room = meeting.videoRoomId
      ? await MeetingRoom.findByPk(meeting.videoRoomId)
      : null;

    if (!room) {
      room = await MeetingRoom.createForMeeting(meetingId, organizationId, {
        provider: 'daily',
      });
      await meeting.update({ videoRoomId: room.id });
    }

    // Always ensure the Daily.co room exists (it may have expired)
    if (this.isDailyConfigured()) {
      const roomExists = await this.checkDailyRoomExists(room.roomName);

      if (!roomExists) {
        console.log(`[MeetingService] Daily room ${room.roomName} not found, creating...`);

        // Calculate expiry: room should be valid until meeting ends + 1 hour buffer
        const meetingEnd = new Date(meeting.scheduledAt);
        meetingEnd.setMinutes(meetingEnd.getMinutes() + meeting.duration + 60);
        const minutesUntilExpiry = Math.max(
          Math.ceil((meetingEnd.getTime() - Date.now()) / 60000),
          180 // Minimum 3 hours
        );

        const dailyRoom = await this.createDailyRoom(room.roomName, {
          expiryMinutes: minutesUntilExpiry,
        });

        if (dailyRoom) {
          await room.update({
            roomSid: dailyRoom.id,
            providerMetadata: {
              dailyUrl: dailyRoom.url,
              dailyRoomId: dailyRoom.id,
            },
          });
          console.log(`[MeetingService] Daily room ${room.roomName} created successfully`);
        } else {
          console.error(`[MeetingService] Failed to create Daily room ${room.roomName}`);
        }
      }
    }

    return room;
  }

  /**
   * Generate room token for participant (Daily.co meeting token)
   */
  async generateRoomToken(
    meetingId: string,
    organizationId: string,
    participantInfo: {
      participantId: string;
      participantName: string;
      isHost?: boolean;
    }
  ): Promise<RoomTokenResponse | null> {
    if (!this.isDailyConfigured()) {
      console.warn('[MeetingService] Daily.co not configured');
      return null;
    }

    const room = await this.getOrCreateRoom(meetingId, organizationId);
    if (!room) return null;

    // Create meeting token
    const token = await this.createDailyMeetingToken(room.roomName, {
      participantId: participantInfo.participantId,
      participantName: participantInfo.participantName,
      isOwner: participantInfo.isHost,
      expiryMinutes: 180, // 3 hour token validity
    });

    if (!token) return null;

    return {
      token,
      roomName: room.roomName,
      roomUrl: this.getDailyRoomUrl(room.roomName),
      participantName: participantInfo.participantName,
      participantId: participantInfo.participantId,
    };
  }

  /**
   * End room and cleanup
   */
  async endRoom(roomId: string): Promise<boolean> {
    const room = await MeetingRoom.findByPk(roomId);
    if (!room) return false;

    await room.end();

    // Delete room from Daily.co
    if (this.isDailyConfigured()) {
      await this.deleteDailyRoom(room.roomName);
    }

    return true;
  }

  /**
   * Update room participant count (called by webhooks)
   */
  async updateRoomParticipantCount(roomName: string, delta: number): Promise<void> {
    const room = await MeetingRoom.findOne({ where: { roomName } });
    if (room) {
      await room.updateParticipantCount(delta);
    }
  }

  // ===========================================================================
  // STATS
  // ===========================================================================

  /**
   * Get meeting statistics
   */
  async getStats(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalMeetings: number;
    upcomingMeetings: number;
    completedMeetings: number;
    cancelledMeetings: number;
    byType: Record<MeetingType, number>;
    avgDuration: number;
    avgParticipants: number;
  }> {
    const baseWhere: Record<string, unknown> = { organizationId };

    if (startDate || endDate) {
      baseWhere.scheduledAt = {};
      if (startDate) (baseWhere.scheduledAt as Record<string, unknown>)[Op.gte] = startDate;
      if (endDate) (baseWhere.scheduledAt as Record<string, unknown>)[Op.lte] = endDate;
    }

    const [total, upcoming, completed, cancelled, byType, allMeetings] = await Promise.all([
      Meeting.count({ where: baseWhere }),
      Meeting.count({ where: { ...baseWhere, status: 'scheduled', scheduledAt: { [Op.gte]: new Date() } } }),
      Meeting.count({ where: { ...baseWhere, status: 'completed' } }),
      Meeting.count({ where: { ...baseWhere, status: 'cancelled' } }),
      Meeting.findAll({
        where: baseWhere,
        attributes: ['meetingType'],
        group: ['meetingType'],
      }),
      Meeting.findAll({
        where: { ...baseWhere, status: 'completed' },
        attributes: ['duration'],
      }),
    ]);

    const typeCount: Record<MeetingType, number> = {
      video: 0,
      in_person: 0,
      phone: 0,
      external_link: 0,
    };
    byType.forEach((m) => {
      typeCount[m.meetingType] = (typeCount[m.meetingType] || 0) + 1;
    });

    const totalDuration = allMeetings.reduce((sum, m) => sum + m.duration, 0);

    return {
      totalMeetings: total,
      upcomingMeetings: upcoming,
      completedMeetings: completed,
      cancelledMeetings: cancelled,
      byType: typeCount,
      avgDuration: allMeetings.length > 0 ? Math.round(totalDuration / allMeetings.length) : 0,
      avgParticipants: 0, // Would need to join with participants
    };
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Format meeting for response
   */
  private formatMeeting(
    meeting: Meeting,
    participants?: MeetingParticipant[],
    room?: { id: string; roomName: string; status: string; currentParticipants: number; dailyRoomUrl?: string } | null
  ): MeetingResponse {
    return {
      id: meeting.id,
      organizationId: meeting.organizationId,
      createdById: meeting.createdById,
      projectId: meeting.projectId,
      title: meeting.title,
      description: meeting.description,
      meetingType: meeting.meetingType,
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      duration: meeting.duration,
      timezone: meeting.timezone,
      endedAt: meeting.endedAt,
      location: meeting.location,
      externalLink: meeting.externalLink,
      videoRoomId: meeting.videoRoomId,
      recurrence: meeting.recurrence,
      notes: meeting.notes,
      agenda: meeting.agenda,
      tags: meeting.tags,
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
      creator: meeting.creator,
      project: meeting.project,
      participants: participants?.map((p) => ({
        id: p.id,
        email: p.email,
        name: p.name,
        role: p.role,
        rsvpStatus: p.rsvpStatus,
        userId: p.userId,
        contactId: p.contactId,
      })),
      room,
    };
  }
}

export const meetingService = new MeetingService();
export { CreateMeetingInput, UpdateMeetingInput, MeetingFilters, MeetingResponse, RoomTokenResponse };
