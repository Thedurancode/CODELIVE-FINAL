/**
 * Task Routes
 * API endpoints for task management
 *
 * SECURITY:
 * - Authentication required for all endpoints
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as taskController from '../controllers/taskController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limiting
const taskLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting to ALL task routes
router.use(authenticate);
router.use(taskLimiter);

// ============================================================================
// CRUD ROUTES
// ============================================================================

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get all tasks
 *     description: Retrieve all tasks with filtering and pagination
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           description: Comma-separated list (pending,in_progress,completed,blocked,cancelled)
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           description: Comma-separated list (low,normal,high,urgent)
 *       - in: query
 *         name: assignedTo
 *         schema:
 *           type: string
 *           description: User UUID
 *       - in: query
 *         name: linkType
 *         schema:
 *           type: string
 *           enum: [deal, buyer, compliance, none]
 *       - in: query
 *         name: propertyId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: buyerId
 *         schema:
 *           type: string
 *       - in: query
 *         name: complianceCheckId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: dueBefore
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dueAfter
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *           description: Comma-separated list of tags
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *     responses:
 *       200:
 *         description: List of tasks with pagination
 */
router.get('/', taskController.getTasks);

/**
 * @swagger
 * /api/tasks/stats:
 *   get:
 *     summary: Get task statistics
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *           enum: [user, organization, all]
 *           default: user
 *         description: Scope of statistics
 *     responses:
 *       200:
 *         description: Task statistics
 */
router.get('/stats', taskController.getTaskStats);

/**
 * @swagger
 * /api/tasks/my:
 *   get:
 *     summary: Get tasks assigned to current user
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of user's tasks
 */
router.get('/my', taskController.getMyTasks);

/**
 * @swagger
 * /api/tasks/deal/{propertyId}:
 *   get:
 *     summary: Get tasks linked to a deal
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of tasks for the deal
 */
router.get('/deal/:propertyId', taskController.getTasksByDeal);

/**
 * @swagger
 * /api/tasks/buyer/{buyerId}:
 *   get:
 *     summary: Get tasks linked to a buyer
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buyerId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of tasks for the buyer
 */
router.get('/buyer/:buyerId', taskController.getTasksByBuyer);

/**
 * @swagger
 * /api/tasks/compliance/{complianceCheckId}:
 *   get:
 *     summary: Get tasks linked to a compliance check
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: complianceCheckId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of tasks for the compliance check
 */
router.get('/compliance/:complianceCheckId', taskController.getTasksByCompliance);

/**
 * @swagger
 * /api/tasks/{id}:
 *   get:
 *     summary: Get task by ID
 *     tags: [Tasks]
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
 *         description: Task details
 *       404:
 *         description: Task not found
 */
router.get('/:id', taskController.getTask);

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a new task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [pending, in_progress, completed, blocked, cancelled]
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high, urgent]
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               assignedTo:
 *                 type: string
 *               propertyId:
 *                 type: integer
 *               buyerId:
 *                 type: string
 *               complianceCheckId:
 *                 type: integer
 *               dependsOn:
 *                 type: array
 *                 items:
 *                   type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Task created successfully
 */
router.post('/', taskController.createTask);

/**
 * @swagger
 * /api/tasks/workflow:
 *   post:
 *     summary: Trigger workflow to create tasks
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - trigger
 *             properties:
 *               trigger:
 *                 type: string
 *                 enum: [deal_created, deal_stage_changed, compliance_issue, buyer_matched]
 *               propertyId:
 *                 type: integer
 *               buyerId:
 *                 type: string
 *               complianceCheckId:
 *                 type: integer
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Tasks created from workflow
 */
router.post('/workflow', taskController.triggerWorkflow);

/**
 * @swagger
 * /api/tasks/{id}:
 *   patch:
 *     summary: Update a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
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
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       404:
 *         description: Task not found
 */
router.patch('/:id', taskController.updateTask);

/**
 * @swagger
 * /api/tasks/{id}/complete:
 *   post:
 *     summary: Mark a task as completed
 *     tags: [Tasks]
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
 *         description: Task completed successfully
 *       404:
 *         description: Task not found
 */
router.post('/:id/complete', taskController.completeTask);

/**
 * @swagger
 * /api/tasks/{id}/cancel:
 *   post:
 *     summary: Cancel a task
 *     tags: [Tasks]
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
 *         description: Task cancelled successfully
 *       404:
 *         description: Task not found
 */
router.post('/:id/cancel', taskController.cancelTask);

/**
 * @swagger
 * /api/tasks/{id}/assign:
 *   post:
 *     summary: Assign a task to a user
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
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
 *               - assignedTo
 *             properties:
 *               assignedTo:
 *                 type: string
 *                 description: User UUID to assign the task to
 *     responses:
 *       200:
 *         description: Task assigned successfully
 *       404:
 *         description: Task not found
 */
router.post('/:id/assign', taskController.assignTask);

/**
 * @swagger
 * /api/tasks/{id}/status:
 *   post:
 *     summary: Update task status
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, in_progress, completed, blocked, cancelled]
 *     responses:
 *       200:
 *         description: Task status updated
 *       404:
 *         description: Task not found
 */
router.post('/:id/status', taskController.updateTaskStatus);

/**
 * @swagger
 * /api/tasks/{id}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
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
 *         description: Task deleted successfully
 *       404:
 *         description: Task not found
 */
router.delete('/:id', taskController.deleteTask);

export default router;
