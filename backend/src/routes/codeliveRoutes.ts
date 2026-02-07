/**
 * Codelive Routes
 * API endpoints for Codelive (Automaker) integration
 *
 * SECURITY:
 * - Authentication required for all endpoints
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { codeliveService } from '../services/CodeliveService';
import { taskService } from '../services/TaskService';
import { gitHubService } from '../services/GitHubService';
import CodeliveSync from '../models/CodeliveSync';
import Task from '../models/Task';
import { logger } from '../services/LoggerService';

const router = Router();

// Rate limiting
const codeliveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting to ALL routes
router.use(authenticate);
router.use(codeliveLimiter);

// ============================================================================
// STATUS AND CONNECTION
// ============================================================================

/**
 * @swagger
 * /api/codelive/status:
 *   post:
 *     summary: Check Codelive server status
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Codelive server status
 */
router.post('/status', async (req: Request, res: Response) => {
  try {
    const status = await codeliveService.getStatus();
    res.json({
      success: true,
      data: {
        ...status,
        wsConnected: codeliveService.isWebSocketConnected(),
      },
    });
  } catch (error) {
    logger.error('Failed to check Codelive status', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Codelive status',
    });
  }
});

// ============================================================================
// FEATURE MANAGEMENT
// ============================================================================

/**
 * @swagger
 * /api/codelive/features:
 *   post:
 *     summary: List features for a project
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectPath
 *             properties:
 *               projectPath:
 *                 type: string
 *     responses:
 *       200:
 *         description: List of features
 */
router.post('/features', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      });
    }

    const features = await codeliveService.listFeatures(projectPath);
    res.json({
      success: true,
      data: features,
    });
  } catch (error) {
    logger.error('Failed to list Codelive features', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to list features',
    });
  }
});

/**
 * @swagger
 * /api/codelive/features/create:
 *   post:
 *     summary: Create a feature from task or issue
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectPath
 *               - title
 *               - description
 *             properties:
 *               projectPath:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [backlog, ready, in-progress, review, done]
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high, urgent]
 *               labels:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Feature created
 */
router.post('/features/create', async (req: Request, res: Response) => {
  try {
    const { projectPath, title, description, status, priority, labels, metadata } = req.body;

    if (!projectPath || !title) {
      return res.status(400).json({
        success: false,
        error: 'projectPath and title are required',
      });
    }

    const feature = await codeliveService.createFeature(projectPath, {
      title,
      description: description || '',
      status: status || 'ready',
      priority: priority || 'normal',
      labels: labels || [],
      metadata,
    });

    res.status(201).json({
      success: true,
      data: feature,
    });
  } catch (error) {
    logger.error('Failed to create Codelive feature', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to create feature',
    });
  }
});

/**
 * @swagger
 * /api/codelive/features/run:
 *   post:
 *     summary: Run AI agent on a feature
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectPath
 *               - featureId
 *             properties:
 *               projectPath:
 *                 type: string
 *               featureId:
 *                 type: string
 *               autoCommit:
 *                 type: boolean
 *               planningMode:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Agent started
 */
router.post('/features/run', async (req: Request, res: Response) => {
  try {
    const { projectPath, featureId, autoCommit, planningMode } = req.body;

    if (!projectPath || !featureId) {
      return res.status(400).json({
        success: false,
        error: 'projectPath and featureId are required',
      });
    }

    await codeliveService.runFeature({
      projectPath,
      featureId,
      autoCommit: autoCommit ?? false,
      planningMode: planningMode ?? false,
    });

    // Update sync record if exists
    const sync = await CodeliveSync.findByFeatureId(featureId);
    if (sync) {
      await sync.updateStatus('running');
    }

    res.json({
      success: true,
      message: 'Agent started successfully',
    });
  } catch (error) {
    logger.error('Failed to run Codelive agent', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to start agent',
    });
  }
});

/**
 * @swagger
 * /api/codelive/features/stop:
 *   post:
 *     summary: Stop a running agent
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - featureId
 *             properties:
 *               featureId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agent stopped
 */
router.post('/features/stop', async (req: Request, res: Response) => {
  try {
    const { featureId } = req.body;

    if (!featureId) {
      return res.status(400).json({
        success: false,
        error: 'featureId is required',
      });
    }

    await codeliveService.stopFeature(featureId);

    // Update sync record if exists
    const sync = await CodeliveSync.findByFeatureId(featureId);
    if (sync) {
      await sync.updateStatus('synced');
    }

    res.json({
      success: true,
      message: 'Agent stopped',
    });
  } catch (error) {
    logger.error('Failed to stop Codelive agent', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop agent',
    });
  }
});

/**
 * @swagger
 * /api/codelive/features/{id}/output:
 *   get:
 *     summary: Get agent output for a feature
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: projectPath
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent output
 */
router.get('/features/:id/output', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { projectPath } = req.query;

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'projectPath query parameter is required',
      });
    }

    const output = await codeliveService.getAgentOutput(projectPath, id);
    res.json({
      success: true,
      data: output,
    });
  } catch (error) {
    logger.error('Failed to get Codelive agent output', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get agent output',
    });
  }
});

// ============================================================================
// PROJECT ANALYSIS
// ============================================================================

/**
 * @swagger
 * /api/codelive/analyze:
 *   post:
 *     summary: Analyze a project for AI context
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectPath
 *             properties:
 *               projectPath:
 *                 type: string
 *     responses:
 *       200:
 *         description: Project analysis
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      });
    }

    const analysis = await codeliveService.analyzeProject(projectPath);
    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    logger.error('Failed to analyze project', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze project',
    });
  }
});

/**
 * @swagger
 * /api/codelive/suggestions:
 *   post:
 *     summary: Generate AI suggestions for a project
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectPath
 *             properties:
 *               projectPath:
 *                 type: string
 *     responses:
 *       200:
 *         description: Suggestions generation started
 */
router.post('/suggestions', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      });
    }

    await codeliveService.generateSuggestions(projectPath);
    res.json({
      success: true,
      message: 'Suggestions generation started',
    });
  } catch (error) {
    logger.error('Failed to generate suggestions', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate suggestions',
    });
  }
});

// ============================================================================
// TASK SYNC
// ============================================================================

/**
 * @swagger
 * /api/codelive/sync/task:
 *   post:
 *     summary: Sync a Dispotree task to Codelive
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskId
 *               - projectPath
 *             properties:
 *               taskId:
 *                 type: string
 *               projectPath:
 *                 type: string
 *               autoRun:
 *                 type: boolean
 *                 description: Automatically run the AI agent after creating the feature
 *     responses:
 *       201:
 *         description: Task synced to Codelive
 */
router.post('/sync/task', async (req: Request, res: Response) => {
  try {
    const { taskId, projectPath, autoRun } = req.body;

    if (!taskId || !projectPath) {
      return res.status(400).json({
        success: false,
        error: 'taskId and projectPath are required',
      });
    }

    // Check if already synced
    const existingSync = await CodeliveSync.findByTaskId(taskId);
    if (existingSync) {
      return res.status(400).json({
        success: false,
        error: 'Task is already synced to Codelive',
        data: {
          syncId: existingSync.id,
          featureId: existingSync.codeliveFeatureId,
        },
      });
    }

    // Get the task
    const task = await taskService.getTask(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    // Create feature in Codelive
    const feature = await codeliveService.createFeatureFromTask(projectPath, {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      tags: task.tags,
      metadata: task.metadata,
    });

    // Create sync record
    const sync = await CodeliveSync.create({
      taskId: task.id,
      codeliveFeatureId: feature.id,
      projectPath,
      status: 'synced',
      codeliveStatus: feature.status,
      metadata: {
        createdBy: (req as any).user?.id,
      },
    });

    // Optionally run the agent
    if (autoRun) {
      await codeliveService.runFeature({
        projectPath,
        featureId: feature.id,
      });
      await sync.updateStatus('running');
    }

    res.status(201).json({
      success: true,
      data: {
        sync: {
          id: sync.id,
          taskId: sync.taskId,
          featureId: sync.codeliveFeatureId,
          status: sync.status,
        },
        feature,
      },
    });
  } catch (error) {
    logger.error('Failed to sync task to Codelive', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync task to Codelive',
    });
  }
});

/**
 * @swagger
 * /api/codelive/sync/github-issue:
 *   post:
 *     summary: Create a Codelive feature from a GitHub issue
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - owner
 *               - repo
 *               - issueNumber
 *               - projectPath
 *             properties:
 *               owner:
 *                 type: string
 *               repo:
 *                 type: string
 *               issueNumber:
 *                 type: integer
 *               projectPath:
 *                 type: string
 *               autoRun:
 *                 type: boolean
 *               createTask:
 *                 type: boolean
 *                 description: Also create a Dispotree task linked to this feature
 *     responses:
 *       201:
 *         description: Feature created from GitHub issue
 */
router.post('/sync/github-issue', async (req: Request, res: Response) => {
  try {
    const { owner, repo, issueNumber, projectPath, autoRun, createTask } = req.body;

    if (!owner || !repo || !issueNumber || !projectPath) {
      return res.status(400).json({
        success: false,
        error: 'owner, repo, issueNumber, and projectPath are required',
      });
    }

    // Fetch the GitHub issue
    const issue = await gitHubService.getIssue(owner, repo, issueNumber);

    // Create feature in Codelive
    const feature = await codeliveService.createFeatureFromGitHubIssue(projectPath, issue);

    let task = null;
    let sync = null;

    // Optionally create a Dispotree task
    if (createTask) {
      const user = (req as any).user;
      task = await taskService.createTask({
        title: issue.title,
        description: issue.body || undefined,
        status: 'pending',
        priority: 'normal',
        tags: ['github-issue', ...issue.labels.map((l) => l.name)],
        linkType: 'project',
        createdBy: user?.id,
        organizationId: user?.organizationId,
        metadata: {
          githubIssueId: issue.id,
          githubIssueNumber: issue.number,
          githubIssueUrl: issue.html_url,
          codeliveFeatureId: feature.id,
        },
      });

      // Create sync record
      sync = await CodeliveSync.create({
        taskId: task.id,
        codeliveFeatureId: feature.id,
        projectPath,
        status: 'synced',
        codeliveStatus: feature.status,
        metadata: {
          githubIssueId: issue.id,
          githubIssueNumber: issue.number,
          createdBy: user?.id,
        },
      });
    }

    // Optionally run the agent
    if (autoRun) {
      await codeliveService.runFeature({
        projectPath,
        featureId: feature.id,
      });
      if (sync) {
        await sync.updateStatus('running');
      }
    }

    res.status(201).json({
      success: true,
      data: {
        feature,
        task: task ? { id: task.id, title: task.title } : null,
        sync: sync ? { id: sync.id, status: sync.status } : null,
      },
    });
  } catch (error) {
    logger.error('Failed to create feature from GitHub issue', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to create feature from GitHub issue',
    });
  }
});

/**
 * @swagger
 * /api/codelive/sync/status:
 *   get:
 *     summary: Get sync status for a project or task
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectPath
 *         schema:
 *           type: string
 *       - in: query
 *         name: taskId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sync status
 */
router.get('/sync/status', async (req: Request, res: Response) => {
  try {
    const { projectPath, taskId } = req.query;

    if (taskId && typeof taskId === 'string') {
      const sync = await CodeliveSync.findByTaskId(taskId);
      if (!sync) {
        return res.json({
          success: true,
          data: null,
        });
      }
      return res.json({
        success: true,
        data: sync,
      });
    }

    if (projectPath && typeof projectPath === 'string') {
      const syncs = await CodeliveSync.findByProject(projectPath);
      return res.json({
        success: true,
        data: syncs,
      });
    }

    // Get all running syncs
    const runningSyncs = await CodeliveSync.getRunning();
    res.json({
      success: true,
      data: runningSyncs,
    });
  } catch (error) {
    logger.error('Failed to get sync status', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync status',
    });
  }
});

// ============================================================================
// DEAL VALIDATION
// ============================================================================

/**
 * @swagger
 * /api/codelive/validate-deal:
 *   post:
 *     summary: Use AI to validate a deal/property
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectPath
 *               - propertyId
 *               - address
 *             properties:
 *               projectPath:
 *                 type: string
 *               propertyId:
 *                 type: integer
 *               address:
 *                 type: string
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *               requirements:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Validation started
 */
router.post('/validate-deal', async (req: Request, res: Response) => {
  try {
    const { projectPath, propertyId, address, documents, requirements } = req.body;

    if (!projectPath || !propertyId || !address) {
      return res.status(400).json({
        success: false,
        error: 'projectPath, propertyId, and address are required',
      });
    }

    const result = await codeliveService.validateDealWithAI(projectPath, {
      propertyId,
      address,
      documents: documents || [],
      requirements: requirements || [
        'Property title is clear',
        'No outstanding liens or encumbrances',
        'Property taxes are current',
        'Zoning compliance verified',
        'Environmental clearance obtained',
      ],
    });

    if (result.status === 'error') {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      data: {
        featureId: result.featureId,
        message: 'Deal validation started. Monitor progress via WebSocket or poll for output.',
      },
    });
  } catch (error) {
    logger.error('Failed to start deal validation', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to start deal validation',
    });
  }
});

// ============================================================================
// AGENT ACTIONS
// ============================================================================

/**
 * @swagger
 * /api/codelive/features/commit:
 *   post:
 *     summary: Commit feature changes
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 */
router.post('/features/commit', async (req: Request, res: Response) => {
  try {
    const { projectPath, featureId, message } = req.body;

    if (!projectPath || !featureId) {
      return res.status(400).json({
        success: false,
        error: 'projectPath and featureId are required',
      });
    }

    await codeliveService.commitFeature(projectPath, featureId, message);
    res.json({
      success: true,
      message: 'Changes committed',
    });
  } catch (error) {
    logger.error('Failed to commit feature changes', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to commit changes',
    });
  }
});

/**
 * @swagger
 * /api/codelive/features/approve-plan:
 *   post:
 *     summary: Approve a plan for a feature in planning mode
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 */
router.post('/features/approve-plan', async (req: Request, res: Response) => {
  try {
    const { projectPath, featureId } = req.body;

    if (!projectPath || !featureId) {
      return res.status(400).json({
        success: false,
        error: 'projectPath and featureId are required',
      });
    }

    await codeliveService.approvePlan(projectPath, featureId);
    res.json({
      success: true,
      message: 'Plan approved',
    });
  } catch (error) {
    logger.error('Failed to approve plan', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve plan',
    });
  }
});

/**
 * @swagger
 * /api/codelive/features/follow-up:
 *   post:
 *     summary: Send follow-up instructions to a running agent
 *     tags: [Codelive]
 *     security:
 *       - bearerAuth: []
 */
router.post('/features/follow-up', async (req: Request, res: Response) => {
  try {
    const { projectPath, featureId, message } = req.body;

    if (!projectPath || !featureId || !message) {
      return res.status(400).json({
        success: false,
        error: 'projectPath, featureId, and message are required',
      });
    }

    await codeliveService.followUpFeature(projectPath, featureId, message);
    res.json({
      success: true,
      message: 'Follow-up sent',
    });
  } catch (error) {
    logger.error('Failed to send follow-up', {}, error);
    res.status(500).json({
      success: false,
      error: 'Failed to send follow-up',
    });
  }
});

export default router;
