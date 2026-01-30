/**
 * Contract Routes
 *
 * REST API routes for managing DocuSeal contract submissions.
 * Full CRUD operations, analytics, reminders, and decline tracking.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../middleware/auth';
import * as contractController from '../controllers/contractController';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Contracts
 *   description: DocuSeal contract submission management
 */

// =============================================================================
// RATE LIMITERS
// =============================================================================

// Rate limit for creating submissions (expensive operation)
const createLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 submissions per minute
  message: { success: false, error: 'Too many contract submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for reminders
const reminderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 reminders per minute
  message: { success: false, error: 'Too many reminder requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// =============================================================================
// SUBMISSION CRUD
// =============================================================================

/**
 * @swagger
 * /api/contracts:
 *   get:
 *     summary: List all contract submissions
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, viewed, partially_signed, completed, declined, expired, archived]
 *       - in: query
 *         name: propertyId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of submissions
 */
router.get('/', authenticate, contractController.listSubmissions);

/**
 * @swagger
 * /api/contracts/{id}:
 *   get:
 *     summary: Get a specific submission
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Local ID or DocuSeal ID (prefix with 'ds:')
 */
router.get('/:id', authenticate, contractController.getSubmission);

/**
 * @swagger
 * /api/contracts:
 *   post:
 *     summary: Create a new contract submission
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', authenticate, createLimiter, contractController.createSubmission);

/**
 * @swagger
 * /api/contracts/{id}:
 *   put:
 *     summary: Update a submission
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', authenticate, contractController.updateSubmission);

/**
 * @swagger
 * /api/contracts/{id}:
 *   delete:
 *     summary: Archive a submission
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', authenticate, contractController.deleteSubmission);

// =============================================================================
// DOCUMENT OPERATIONS
// =============================================================================

/**
 * @swagger
 * /api/contracts/{id}/documents:
 *   get:
 *     summary: Get signed document URLs
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/documents', authenticate, contractController.getSubmissionDocuments);

/**
 * @swagger
 * /api/contracts/{id}/sync:
 *   post:
 *     summary: Sync submission status from DocuSeal
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/sync', authenticate, contractController.syncSubmission);

// =============================================================================
// REMINDER OPERATIONS
// =============================================================================

/**
 * @swagger
 * /api/contracts/{id}/remind:
 *   post:
 *     summary: Send reminder to pending signers
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/remind', authenticate, reminderLimiter, contractController.sendReminder);

/**
 * @swagger
 * /api/contracts/reminders/due:
 *   get:
 *     summary: Get submissions due for reminders
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/reminders/due', authenticate, contractController.getDueReminders);

/**
 * @swagger
 * /api/contracts/reminders/expiring:
 *   get:
 *     summary: Get submissions expiring soon
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/reminders/expiring', authenticate, contractController.getExpiringSoon);

// =============================================================================
// DECLINE OPERATIONS
// =============================================================================

/**
 * @swagger
 * /api/contracts/{id}/decline:
 *   post:
 *     summary: Record a decline with reason
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/decline', authenticate, contractController.recordDecline);

/**
 * @swagger
 * /api/contracts/declines:
 *   get:
 *     summary: Get all declined submissions
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/declines', authenticate, contractController.getDeclinedSubmissions);

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * @swagger
 * /api/contracts/analytics:
 *   get:
 *     summary: Get contract submission analytics
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 */
router.get('/analytics', authenticate, contractController.getAnalytics);

/**
 * @swagger
 * /api/contracts/analytics/funnel:
 *   get:
 *     summary: Get contract funnel analytics
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/analytics/funnel', authenticate, contractController.getFunnelAnalytics);

/**
 * @swagger
 * /api/contracts/analytics/decline-reasons:
 *   get:
 *     summary: Get decline reason analytics
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/analytics/decline-reasons', authenticate, contractController.getDeclineReasonAnalytics);

/**
 * @swagger
 * /api/contracts/analytics/timeline:
 *   get:
 *     summary: Get timeline analytics
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/analytics/timeline', authenticate, contractController.getTimelineAnalytics);

// =============================================================================
// CONTRACT SIGNERS
// =============================================================================

/**
 * @swagger
 * /api/contracts/{id}/signers:
 *   get:
 *     summary: Get all signers for a contract
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.get('/:id/signers', authenticate, contractController.getContractSigners);

/**
 * @swagger
 * /api/contracts/{id}/signers:
 *   post:
 *     summary: Add a signer to a contract
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *               contactId:
 *                 type: string
 *               order:
 *                 type: integer
 */
router.post('/:id/signers', authenticate, contractController.addContractSigner);

/**
 * @swagger
 * /api/contracts/signers/{signerId}:
 *   patch:
 *     summary: Update a signer
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: signerId
 *         required: true
 *         schema:
 *           type: integer
 */
router.patch('/signers/:signerId', authenticate, contractController.updateContractSigner);

/**
 * @swagger
 * /api/contracts/signers/{signerId}:
 *   delete:
 *     summary: Remove a signer
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: signerId
 *         required: true
 *         schema:
 *           type: integer
 */
router.delete('/signers/:signerId', authenticate, contractController.removeContractSigner);

/**
 * @swagger
 * /api/contracts/signers/{signerId}/remind:
 *   post:
 *     summary: Send reminder to a specific signer
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: signerId
 *         required: true
 *         schema:
 *           type: integer
 */
router.post('/signers/:signerId/remind', authenticate, reminderLimiter, contractController.sendSignerReminder);

// =============================================================================
// SCHEDULER CONTROL (Admin only)
// =============================================================================

/**
 * @swagger
 * /api/contracts/scheduler/status:
 *   get:
 *     summary: Get reminder scheduler status
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/scheduler/status', authenticate, authorize('admin'), contractController.getSchedulerStatus);

/**
 * @swagger
 * /api/contracts/scheduler/run:
 *   post:
 *     summary: Manually trigger reminder processing
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 */
router.post('/scheduler/run', authenticate, authorize('admin'), contractController.triggerScheduler);

export default router;
