/**
 * Calendar Routes
 *
 * REST API routes for Google Calendar integration.
 */

import { Router } from 'express';
import { calendarController } from '../controllers/calendarController';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     CalendarStatus:
 *       type: object
 *       properties:
 *         configured:
 *           type: boolean
 *           description: Whether Google Calendar is configured on the server
 *         connected:
 *           type: boolean
 *           description: Whether the user has connected their calendar
 *         email:
 *           type: string
 *           description: Connected calendar email
 *         lastSyncAt:
 *           type: string
 *           format: date-time
 *         error:
 *           type: string
 *     CalendarEvent:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         startTime:
 *           type: string
 *           format: date-time
 *         endTime:
 *           type: string
 *           format: date-time
 *         location:
 *           type: string
 *         attendees:
 *           type: array
 *           items:
 *             type: string
 *         status:
 *           type: string
 *         link:
 *           type: string
 *         propertyId:
 *           type: integer
 *         buyerId:
 *           type: string
 *         isAllDay:
 *           type: boolean
 *     CreateEventInput:
 *       type: object
 *       required:
 *         - title
 *         - startTime
 *         - endTime
 *       properties:
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         startTime:
 *           type: string
 *           format: date-time
 *         endTime:
 *           type: string
 *           format: date-time
 *         location:
 *           type: string
 *         attendees:
 *           type: array
 *           items:
 *             type: string
 *         propertyId:
 *           type: integer
 *         buyerId:
 *           type: string
 */

/**
 * @swagger
 * /api/calendar/status:
 *   get:
 *     summary: Get calendar connection status
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Calendar status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CalendarStatus'
 */
router.get('/status', authenticate, calendarController.getStatus);

/**
 * @swagger
 * /api/calendar/connect/google:
 *   get:
 *     summary: Get Google OAuth URL to connect calendar
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OAuth URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     authUrl:
 *                       type: string
 */
router.get('/connect/google', authenticate, calendarController.getConnectUrl);

/**
 * @swagger
 * /api/calendar/callback:
 *   get:
 *     summary: Handle Google OAuth callback
 *     tags: [Calendar]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirect to calendar page
 */
router.get('/callback', calendarController.handleCallback);

/**
 * @swagger
 * /api/calendar/disconnect:
 *   post:
 *     summary: Disconnect Google Calendar
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Calendar disconnected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     disconnected:
 *                       type: boolean
 */
router.post('/disconnect', authenticate, calendarController.disconnect);

/**
 * @swagger
 * /api/calendar/events:
 *   get:
 *     summary: List calendar events
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: maxResults
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: timeMin
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: timeMax
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CalendarEvent'
 */
router.get('/events', authenticate, calendarController.listEvents);

/**
 * @swagger
 * /api/calendar/events:
 *   post:
 *     summary: Create a calendar event
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEventInput'
 *     responses:
 *       200:
 *         description: Event created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CalendarEvent'
 */
router.post('/events', authenticate, calendarController.createEvent);

/**
 * @swagger
 * /api/calendar/events/{id}:
 *   patch:
 *     summary: Update a calendar event
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               location:
 *                 type: string
 *     responses:
 *       200:
 *         description: Event updated
 */
router.patch('/events/:id', authenticate, calendarController.updateEvent);

/**
 * @swagger
 * /api/calendar/events/{id}:
 *   delete:
 *     summary: Delete a calendar event
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Event deleted
 */
router.delete('/events/:id', authenticate, calendarController.deleteEvent);

/**
 * @swagger
 * /api/calendar/free-slots:
 *   get:
 *     summary: Find free time slots
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: durationMinutes
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: maxSlots
 *         schema:
 *           type: integer
 *           default: 5
 *     responses:
 *       200:
 *         description: Available time slots
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       start:
 *                         type: string
 *                         format: date-time
 *                       end:
 *                         type: string
 *                         format: date-time
 */
router.get('/free-slots', authenticate, calendarController.findFreeSlots);

export default router;
