/**
 * Sprite Tasks Routes
 *
 * API routes for managing the sprite task queue.
 */

import { Router } from 'express';
import spriteTasksController from '../controllers/spriteTasksController';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Sprite Tasks
 *   description: Task queue management for sprites
 */

// ============================================================================
// TASK CRUD
// ============================================================================

/**
 * @swagger
 * /api/sprite-tasks:
 *   post:
 *     summary: Create a new task
 *     description: |
 *       Create a task and add it to the queue. Tasks can be:
 *       - Created manually with a title and description
 *       - Linked to a GitHub issue for tracking
 *
 *       Tasks are processed by sprites which:
 *       1. Create a branch named after the task
 *       2. Run Claude to implement the task
 *       3. Create a PR that references the issue
 *     tags: [Sprite Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - title
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               title:
 *                 type: string
 *                 description: Task title (used for branch naming)
 *               description:
 *                 type: string
 *                 description: Detailed description
 *               prompt:
 *                 type: string
 *                 description: Custom prompt for Claude (auto-generated if not provided)
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: medium
 *               githubIssueNumber:
 *                 type: integer
 *                 description: GitHub issue number to link
 *               githubIssueUrl:
 *                 type: string
 *                 description: Full GitHub issue URL
 *     responses:
 *       200:
 *         description: Task created
 *       400:
 *         description: Invalid input
 */
router.post('/', spriteTasksController.createTask);

/**
 * @swagger
 * /api/sprite-tasks:
 *   get:
 *     summary: Get all tasks
 *     tags: [Sprite Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Comma-separated status filter (pending,in_progress,completed,etc)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max number of tasks to return
 *     responses:
 *       200:
 *         description: List of tasks
 */
router.get('/', spriteTasksController.getTasks);

/**
 * @swagger
 * /api/sprite-tasks/stats:
 *   get:
 *     summary: Get queue statistics
 *     tags: [Sprite Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project
 *     responses:
 *       200:
 *         description: Queue statistics
 */
router.get('/stats', spriteTasksController.getQueueStats);

/**
 * @swagger
 * /api/sprite-tasks/{id}:
 *   get:
 *     summary: Get a single task
 *     tags: [Sprite Tasks]
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
router.get('/:id', spriteTasksController.getTask);

/**
 * @swagger
 * /api/sprite-tasks/{id}:
 *   put:
 *     summary: Update a task
 *     description: Only pending or assigned tasks can be updated
 *     tags: [Sprite Tasks]
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
 *               prompt:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *     responses:
 *       200:
 *         description: Task updated
 */
router.put('/:id', spriteTasksController.updateTask);

// ============================================================================
// TASK ACTIONS
// ============================================================================

/**
 * @swagger
 * /api/sprite-tasks/{id}/cancel:
 *   post:
 *     summary: Cancel a task
 *     description: Only pending or assigned tasks can be cancelled
 *     tags: [Sprite Tasks]
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
 *         description: Task cancelled
 */
router.post('/:id/cancel', spriteTasksController.cancelTask);

/**
 * @swagger
 * /api/sprite-tasks/{id}/retry:
 *   post:
 *     summary: Retry a failed task
 *     description: Only failed or cancelled tasks can be retried
 *     tags: [Sprite Tasks]
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
 *         description: Task queued for retry
 */
router.post('/:id/retry', spriteTasksController.retryTask);

/**
 * @swagger
 * /api/sprite-tasks/{id}/assign:
 *   post:
 *     summary: Manually assign a task to a sprite
 *     tags: [Sprite Tasks]
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
 *               - spriteId
 *             properties:
 *               spriteId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Task assigned
 */
router.post('/:id/assign', spriteTasksController.assignTask);

/**
 * @swagger
 * /api/sprite-tasks/{id}/start:
 *   post:
 *     summary: Start processing an assigned task
 *     description: Creates the branch and marks task as in_progress
 *     tags: [Sprite Tasks]
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
 *         description: Task started
 */
router.post('/:id/start', spriteTasksController.startTask);

/**
 * @swagger
 * /api/sprite-tasks/{id}/process:
 *   post:
 *     summary: Process a task completely
 *     description: |
 *       Runs the full workflow:
 *       1. Assign to sprite (if not already)
 *       2. Create branch
 *       3. Run Claude
 *       4. Create PR
 *
 *       This is an async operation that may take several minutes.
 *     tags: [Sprite Tasks]
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
 *               spriteId:
 *                 type: string
 *                 description: Optional sprite ID (auto-selects if not provided)
 *     responses:
 *       200:
 *         description: Task processed
 */
router.post('/:id/process', spriteTasksController.processTask);

/**
 * @swagger
 * /api/sprite-tasks/{id}/pr:
 *   post:
 *     summary: Create PR for a task
 *     description: Creates a pull request for an in_progress task
 *     tags: [Sprite Tasks]
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
 *         description: PR created
 */
router.post('/:id/pr', spriteTasksController.createPR);

/**
 * @swagger
 * /api/sprite-tasks/{id}/complete:
 *   post:
 *     summary: Mark a task as completed
 *     description: Manually mark a task as completed (usually done automatically when PR is merged)
 *     tags: [Sprite Tasks]
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
 *         description: Task completed
 */
router.post('/:id/complete', spriteTasksController.completeTask);

// ============================================================================
// GITHUB ISSUE INTEGRATION
// ============================================================================

/**
 * @swagger
 * /api/sprite-tasks/from-issue:
 *   post:
 *     summary: Create a task from a GitHub issue
 *     description: |
 *       Fetches the GitHub issue details and creates a task in the queue.
 *       The issue title becomes the task title, and the issue body becomes the prompt.
 *       This does NOT start processing - use process-issue for one-click execution.
 *     tags: [Sprite Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - issueNumber
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *                 description: The project (must have githubUrl configured)
 *               issueNumber:
 *                 type: integer
 *                 description: GitHub issue number
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: medium
 *               spriteId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional specific sprite to use for fetching issue
 *     responses:
 *       200:
 *         description: Task created from issue
 *       400:
 *         description: Invalid input or issue already closed
 */
router.post('/from-issue', spriteTasksController.createFromIssue);

/**
 * @swagger
 * /api/sprite-tasks/process-issue:
 *   post:
 *     summary: Process a GitHub issue (one-click automation)
 *     description: |
 *       The main entry point for processing GitHub issues. This:
 *       1. Fetches the issue from GitHub
 *       2. Creates a tracking task
 *       3. Assigns to an available sprite
 *       4. Creates a feature branch named after the issue
 *       5. Runs Claude to implement the changes
 *       6. Creates a PR that references and will close the issue when merged
 *
 *       This is an async operation that may take several minutes.
 *     tags: [Sprite Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - issueNumber
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *                 description: The project (must have githubUrl and a running sprite)
 *               issueNumber:
 *                 type: integer
 *                 description: GitHub issue number to process
 *               spriteId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional specific sprite (auto-selects if not provided)
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: medium
 *     responses:
 *       200:
 *         description: Issue processing started
 *       400:
 *         description: Invalid input
 *       404:
 *         description: No available sprite
 */
router.post('/process-issue', spriteTasksController.processIssue);

export default router;
