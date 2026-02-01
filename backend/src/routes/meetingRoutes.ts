/**
 * Meeting Routes
 *
 * API routes for meeting management with video room support.
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import {
  meetingService,
  CreateMeetingInput,
  UpdateMeetingInput,
  MeetingFilters,
} from '../services/MeetingService';
import { meetingNotificationService } from '../services/MeetingNotificationService';
import type { MeetingStatus, MeetingType } from '../models/Meeting';
import type { RsvpStatus, ParticipantRole } from '../models/MeetingParticipant';

const router = Router();

// Rate limiting
const meetingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests' },
});

// Apply auth and rate limiting
router.use(authenticate);
router.use(meetingLimiter);

// =============================================================================
// MEETING CRUD
// =============================================================================

/**
 * @swagger
 * /api/meetings:
 *   get:
 *     summary: Get meetings with filters
 *     tags: [Meetings]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of meetings
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const filters: MeetingFilters = {
      status: req.query.status as MeetingStatus | undefined,
      meetingType: req.query.meetingType as MeetingType | undefined,
      projectId: req.query.projectId as string | undefined,
      createdById: req.query.createdById as string | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      search: req.query.search as string | undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      sortBy: (req.query.sortBy as string) || 'scheduledAt',
      sortOrder: (req.query.sortOrder as 'ASC' | 'DESC') || 'ASC',
      upcoming: req.query.upcoming === 'true',
    };

    const result = await meetingService.getMeetings(user.organizationId, filters);

    res.json({
      success: true,
      data: result.meetings,
      pagination: {
        page: result.page,
        limit: filters.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/upcoming:
 *   get:
 *     summary: Get upcoming meetings
 *     tags: [Meetings]
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of upcoming meetings
 */
router.get('/upcoming', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const meetings = await meetingService.getUpcomingMeetings(user.organizationId, {
      userId: user.id,
      projectId: req.query.projectId as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
    });

    res.json({ success: true, data: meetings });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/project/{projectId}:
 *   get:
 *     summary: Get meetings for a specific project
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of project meetings
 */
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { projectId } = req.params;

    const filters: MeetingFilters = {
      projectId,
      status: req.query.status as MeetingStatus | undefined,
      upcoming: req.query.upcoming === 'true',
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      sortBy: (req.query.sortBy as string) || 'scheduledAt',
      sortOrder: (req.query.sortOrder as 'ASC' | 'DESC') || 'ASC',
    };

    const result = await meetingService.getMeetings(user.organizationId, filters);

    res.json({
      success: true,
      data: result.meetings,
      pagination: {
        page: result.page,
        limit: filters.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/stats:
 *   get:
 *     summary: Get meeting statistics
 *     tags: [Meetings]
 *     responses:
 *       200:
 *         description: Meeting statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const stats = await meetingService.getStats(user.organizationId, startDate, endDate);

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}:
 *   get:
 *     summary: Get meeting by ID
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meeting details
 *       404:
 *         description: Meeting not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const meeting = await meetingService.getMeetingById(req.params.id, user.organizationId);

    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    res.json({ success: true, data: meeting });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings:
 *   post:
 *     summary: Create a new meeting
 *     tags: [Meetings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - scheduledAt
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               meetingType:
 *                 type: string
 *                 enum: [video, in_person, phone, external_link]
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *               duration:
 *                 type: integer
 *               projectId:
 *                 type: string
 *               participants:
 *                 type: array
 *     responses:
 *       201:
 *         description: Meeting created
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id || !user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const {
      title,
      description,
      meetingType,
      scheduledAt,
      duration,
      timezone,
      projectId,
      location,
      externalLink,
      recurrence,
      recurrenceRule,
      recurrenceEndDate,
      reminderMinutesBefore,
      agenda,
      tags,
      participants,
      roomOptions,
    } = req.body;

    if (!title || !scheduledAt) {
      return res.status(400).json({
        success: false,
        error: 'Title and scheduledAt are required',
      });
    }

    const input: CreateMeetingInput = {
      organizationId: user.organizationId,
      createdById: user.id,
      title,
      description,
      meetingType,
      scheduledAt: new Date(scheduledAt),
      duration,
      timezone,
      projectId,
      location,
      externalLink,
      recurrence,
      recurrenceRule,
      recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : undefined,
      reminderMinutesBefore,
      agenda,
      tags,
      participants,
      roomOptions,
    };

    const meeting = await meetingService.createMeeting(input);

    res.status(201).json({ success: true, data: meeting });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}:
 *   patch:
 *     summary: Update a meeting
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Meeting updated
 *       404:
 *         description: Meeting not found
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const updates: UpdateMeetingInput = req.body;

    // Convert date strings if present
    if (updates.scheduledAt) {
      updates.scheduledAt = new Date(updates.scheduledAt);
    }

    const meeting = await meetingService.updateMeeting(
      req.params.id,
      user.organizationId,
      updates
    );

    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    res.json({ success: true, data: meeting });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}:
 *   delete:
 *     summary: Delete a meeting
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meeting deleted
 *       404:
 *         description: Meeting not found
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const deleted = await meetingService.deleteMeeting(req.params.id, user.organizationId);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    res.json({ success: true, message: 'Meeting deleted' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// MEETING ACTIONS
// =============================================================================

/**
 * @swagger
 * /api/meetings/{id}/start:
 *   post:
 *     summary: Start a meeting
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meeting started
 */
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const meeting = await meetingService.startMeeting(req.params.id, user.organizationId);

    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    res.json({ success: true, data: meeting });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}/end:
 *   post:
 *     summary: End a meeting
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meeting ended
 */
router.post('/:id/end', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const meeting = await meetingService.endMeeting(req.params.id, user.organizationId);

    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    res.json({ success: true, data: meeting });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// PARTICIPANTS
// =============================================================================

/**
 * @swagger
 * /api/meetings/{id}/participants:
 *   get:
 *     summary: Get meeting participants
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of participants
 */
router.get('/:id/participants', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const participants = await meetingService.getParticipants(req.params.id);

    res.json({ success: true, data: participants });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}/participants:
 *   post:
 *     summary: Add participant to meeting
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *               userId:
 *                 type: string
 *               contactId:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       201:
 *         description: Participant added
 */
router.post('/:id/participants', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { email, name, userId, contactId, role, phone, sendNotification, sendSms } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email and name are required',
      });
    }

    const participant = await meetingService.addParticipant(
      req.params.id,
      user.organizationId,
      { email, name, userId, contactId, role, phone },
      { sendNotification: sendNotification !== false, sendSms: sendSms === true }
    );

    res.status(201).json({ success: true, data: participant });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}/participants/{participantId}:
 *   delete:
 *     summary: Remove participant from meeting
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: participantId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Participant removed
 */
router.delete('/:id/participants/:participantId', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const deleted = await meetingService.removeParticipant(
      parseInt(req.params.participantId, 10)
    );

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }

    res.json({ success: true, message: 'Participant removed' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}/participants/{participantId}/rsvp:
 *   patch:
 *     summary: Update participant RSVP status
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: participantId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [accepted, declined, tentative]
 *     responses:
 *       200:
 *         description: RSVP updated
 */
router.patch('/:id/participants/:participantId/rsvp', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const participant = await meetingService.updateParticipantRsvp(
      parseInt(req.params.participantId, 10),
      status as RsvpStatus
    );

    if (!participant) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }

    res.json({ success: true, data: participant });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// VIDEO ROOM
// =============================================================================

/**
 * @swagger
 * /api/meetings/{id}/room/token:
 *   post:
 *     summary: Get video room access token
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Room token generated
 */
router.post('/:id/room/token', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id || !user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const meeting = await meetingService.getMeetingById(req.params.id, user.organizationId);
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    if (meeting.meetingType !== 'video') {
      return res.status(400).json({ success: false, error: 'Not a video meeting' });
    }

    // Check if user is a participant
    const isParticipant = meeting.participants?.some(
      (p) => p.userId === user.id || p.email === user.email
    );
    const isCreator = meeting.createdById === user.id;

    if (!isParticipant && !isCreator) {
      return res.status(403).json({ success: false, error: 'Not a meeting participant' });
    }

    const token = await meetingService.generateRoomToken(
      req.params.id,
      user.organizationId,
      {
        participantId: user.id,
        participantName: user.name || user.email,
        isHost: isCreator,
      }
    );

    if (!token) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate room token. Video service may not be configured.',
      });
    }

    res.json({ success: true, data: token });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// NOTIFICATIONS
// =============================================================================

/**
 * @swagger
 * /api/meetings/{id}/notifications/invite:
 *   post:
 *     summary: Send invitation to a specific participant
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - participantId
 *             properties:
 *               participantId:
 *                 type: integer
 *               sendSms:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Invitation sent
 */
router.post('/:id/notifications/invite', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { participantId, sendSms } = req.body;

    if (!participantId) {
      return res.status(400).json({ success: false, error: 'participantId is required' });
    }

    const results = await meetingNotificationService.sendInvitation(
      req.params.id,
      participantId,
      { sendSms: sendSms === true }
    );

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}/notifications/invite-all:
 *   post:
 *     summary: Send invitations to all participants who haven't received one
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sendSms:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Invitations sent
 */
router.post('/:id/notifications/invite-all', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { sendSms } = req.body || {};

    const results = await meetingNotificationService.sendPendingInvitations(
      req.params.id,
      { sendSms: sendSms === true }
    );

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}/notifications/reminder:
 *   post:
 *     summary: Send reminder to a specific participant
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - participantId
 *             properties:
 *               participantId:
 *                 type: integer
 *               sendSms:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Reminder sent
 */
router.post('/:id/notifications/reminder', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { participantId, sendSms } = req.body;

    if (!participantId) {
      return res.status(400).json({ success: false, error: 'participantId is required' });
    }

    const results = await meetingNotificationService.sendReminder(
      req.params.id,
      participantId,
      { sendSms: sendSms === true }
    );

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}/notifications/remind-all:
 *   post:
 *     summary: Send reminders to all participants who haven't received one
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sendSms:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Reminders sent
 */
router.post('/:id/notifications/remind-all', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { sendSms } = req.body || {};

    const results = await meetingNotificationService.sendPendingReminders(
      req.params.id,
      { sendSms: sendSms === true }
    );

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/meetings/{id}/cancel:
 *   post:
 *     summary: Cancel a meeting and notify all participants
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *               sendNotifications:
 *                 type: boolean
 *               sendSms:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Meeting cancelled
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { reason, sendNotifications, sendSms } = req.body || {};

    const meeting = await meetingService.cancelMeeting(
      req.params.id,
      user.organizationId,
      {
        reason,
        sendNotifications: sendNotifications !== false,
        sendSms: sendSms === true,
      }
    );

    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    res.json({ success: true, data: meeting, message: 'Meeting cancelled and participants notified' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
