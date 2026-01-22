/**
 * Coding Task Routes
 *
 * API endpoints for managing AI-powered coding tasks
 */

import { Router, Request, Response } from 'express';
import { codingTaskService } from '../services/CodingTaskService';

const router = Router();

/**
 * @swagger
 * /api/coding-tasks:
 *   post:
 *     summary: Start a new coding task
 *     tags: [Coding Tasks]
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
 *               - instructions
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               title:
 *                 type: string
 *                 description: Brief title for the coding task
 *               instructions:
 *                 type: string
 *                 description: Detailed instructions for Claude
 *               config:
 *                 type: object
 *                 properties:
 *                   baseBranch:
 *                     type: string
 *                     default: main
 *                   branchPrefix:
 *                     type: string
 *                     enum: [feature, bugfix, refactor]
 *                     default: feature
 *                   runTests:
 *                     type: boolean
 *                     default: true
 *                   testCommand:
 *                     type: string
 *                     default: npm test
 *                   lintCommand:
 *                     type: string
 *                     default: npm run lint
 *                   autoCreatePR:
 *                     type: boolean
 *                     default: true
 *                   prReviewers:
 *                     type: array
 *                     items:
 *                       type: string
 *                   prLabels:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       201:
 *         description: Coding task started
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { projectId, title, instructions, config } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!projectId || !title || !instructions) {
      return res.status(400).json({
        success: false,
        error: 'projectId, title, and instructions are required',
      });
    }

    const task = await codingTaskService.startTask({
      projectId,
      title,
      instructions,
      createdById: userId,
      config,
    });

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error('Error starting coding task:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/coding-tasks/{id}:
 *   get:
 *     summary: Get a coding task by ID
 *     tags: [Coding Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Coding task details
 *       404:
 *         description: Task not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const task = await codingTaskService.getTask(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Error getting coding task:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/coding-tasks/project/{projectId}:
 *   get:
 *     summary: Get coding tasks for a project
 *     tags: [Coding Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [created, cloning, branching, coding, testing, linting, committing, creating_pr, completed, failed, cancelled]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of coding tasks
 */
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { status, limit, offset } = req.query;

    const result = await codingTaskService.getTasksForProject(projectId, {
      status: status as any,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: result.tasks,
      pagination: {
        total: result.total,
        limit: limit ? parseInt(limit as string, 10) : 20,
        offset: offset ? parseInt(offset as string, 10) : 0,
      },
    });
  } catch (error) {
    console.error('Error getting coding tasks:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/coding-tasks/{id}/cancel:
 *   post:
 *     summary: Cancel a running coding task
 *     tags: [Coding Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Task cancelled
 *       400:
 *         description: Task cannot be cancelled
 *       404:
 *         description: Task not found
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const task = await codingTaskService.cancelTask(req.params.id);
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Error cancelling coding task:', error);
    const statusCode = (error as Error).message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/coding-tasks/{id}/retry:
 *   post:
 *     summary: Retry a failed coding task
 *     tags: [Coding Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: New task created as retry
 *       400:
 *         description: Task cannot be retried
 *       404:
 *         description: Task not found
 */
router.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const task = await codingTaskService.retryTask(req.params.id);
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error('Error retrying coding task:', error);
    const statusCode = (error as Error).message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/coding-tasks/stats/user:
 *   get:
 *     summary: Get coding task statistics for the current user
 *     tags: [Coding Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User task statistics
 */
router.get('/stats/user', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const stats = await codingTaskService.getTaskStats(userId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting task stats:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
