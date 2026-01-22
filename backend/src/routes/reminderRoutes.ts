/**
 * Reminder Routes
 *
 * API routes for reminder management
 *
 * SECURITY:
 * - Authentication required for all endpoints
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getReminders,
  getMyReminders,
  getReminder,
  createReminder,
  updateReminder,
  deleteReminder,
  snoozeReminder,
  acknowledgeReminder,
  cancelReminder,
  getUpcomingReminders,
  getRemindersByDeal,
  getRemindersByTask,
  getRemindersByBuyer,
  getReminderStats,
} from '../controllers/reminderController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limiting
const reminderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting to ALL reminder routes
router.use(authenticate);
router.use(reminderLimiter);

/**
 * @swagger
 * /api/reminders:
 *   get:
 *     summary: Get all reminders with filtering
 *     tags: [Reminders]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Comma-separated status filter
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *         description: Comma-separated priority filter
 *     responses:
 *       200:
 *         description: List of reminders with pagination
 */
router.get('/', getReminders);

/**
 * @swagger
 * /api/reminders/my:
 *   get:
 *     summary: Get current user's reminders
 *     tags: [Reminders]
 *     responses:
 *       200:
 *         description: List of user's reminders
 */
router.get('/my', getMyReminders);

/**
 * @swagger
 * /api/reminders/upcoming:
 *   get:
 *     summary: Get upcoming reminders for current user
 *     tags: [Reminders]
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *         description: Hours ahead to look (default 24)
 *     responses:
 *       200:
 *         description: List of upcoming reminders
 */
router.get('/upcoming', getUpcomingReminders);

/**
 * @swagger
 * /api/reminders/stats:
 *   get:
 *     summary: Get reminder statistics
 *     tags: [Reminders]
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *           enum: [user, organization, all]
 *         description: Scope of statistics
 *     responses:
 *       200:
 *         description: Reminder statistics
 */
router.get('/stats', getReminderStats);

/**
 * @swagger
 * /api/reminders/deal/{propertyId}:
 *   get:
 *     summary: Get reminders for a deal
 *     tags: [Reminders]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of reminders for the deal
 */
router.get('/deal/:propertyId', getRemindersByDeal);

/**
 * @swagger
 * /api/reminders/task/{taskId}:
 *   get:
 *     summary: Get reminders for a task
 *     tags: [Reminders]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of reminders for the task
 */
router.get('/task/:taskId', getRemindersByTask);

/**
 * @swagger
 * /api/reminders/buyer/{buyerId}:
 *   get:
 *     summary: Get reminders for a buyer
 *     tags: [Reminders]
 *     parameters:
 *       - in: path
 *         name: buyerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of reminders for the buyer
 */
router.get('/buyer/:buyerId', getRemindersByBuyer);

/**
 * @swagger
 * /api/reminders/{id}:
 *   get:
 *     summary: Get a reminder by ID
 *     tags: [Reminders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reminder details
 *       404:
 *         description: Reminder not found
 */
router.get('/:id', getReminder);

/**
 * @swagger
 * /api/reminders:
 *   post:
 *     summary: Create a new reminder
 *     tags: [Reminders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - reminderTime
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               reminderTime:
 *                 type: string
 *                 format: date-time
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high, urgent]
 *               linkType:
 *                 type: string
 *                 enum: [deal, task, buyer, contract, compliance, general]
 *     responses:
 *       201:
 *         description: Reminder created
 */
router.post('/', createReminder);

/**
 * @swagger
 * /api/reminders/{id}:
 *   patch:
 *     summary: Update a reminder
 *     tags: [Reminders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reminder updated
 *       404:
 *         description: Reminder not found
 */
router.patch('/:id', updateReminder);

/**
 * @swagger
 * /api/reminders/{id}:
 *   delete:
 *     summary: Delete a reminder
 *     tags: [Reminders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reminder deleted
 *       404:
 *         description: Reminder not found
 */
router.delete('/:id', deleteReminder);

/**
 * @swagger
 * /api/reminders/{id}/snooze:
 *   post:
 *     summary: Snooze a reminder
 *     tags: [Reminders]
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
 *               - minutes
 *             properties:
 *               minutes:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Reminder snoozed
 *       404:
 *         description: Reminder not found
 */
router.post('/:id/snooze', snoozeReminder);

/**
 * @swagger
 * /api/reminders/{id}/acknowledge:
 *   post:
 *     summary: Acknowledge a reminder
 *     tags: [Reminders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reminder acknowledged
 *       404:
 *         description: Reminder not found
 */
router.post('/:id/acknowledge', acknowledgeReminder);

/**
 * @swagger
 * /api/reminders/{id}/cancel:
 *   post:
 *     summary: Cancel a reminder
 *     tags: [Reminders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reminder cancelled
 *       404:
 *         description: Reminder not found
 */
router.post('/:id/cancel', cancelReminder);

export default router;
