/**
 * GitHub Actions API Routes
 *
 * Manual workflow triggering and management endpoints
 */

import { Router, Request, Response } from 'express';
import { githubActionsService } from '../services/GitHubActionsService';
import { gitHubService } from '../services/GitHubService';

const router = Router();

/**
 * @swagger
 * /api/github-actions/workflows:
 *   get:
 *     summary: List available workflows in a repository
 *     tags: [GitHub Actions]
 *     parameters:
 *       - in: query
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of workflows
 */
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo } = req.query;

    if (!owner || !repo) {
      return res.status(400).json({
        success: false,
        error: 'owner and repo are required',
      });
    }

    const workflows = await githubActionsService.listWorkflows(
      owner as string,
      repo as string
    );

    res.json({
      success: true,
      data: workflows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github-actions/trigger:
 *   post:
 *     summary: Trigger a GitHub Actions workflow
 *     tags: [GitHub Actions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - owner
 *               - repo
 *               - workflowId
 *             properties:
 *               owner:
 *                 type: string
 *                 description: Repository owner
 *               repo:
 *                 type: string
 *                 description: Repository name
 *               workflowId:
 *                 type: string
 *                 description: Workflow file name (e.g., deploy.yml) or workflow ID
 *               ref:
 *                 type: string
 *                 description: Branch or tag to run on
 *                 default: main
 *               inputs:
 *                 type: object
 *                 description: Workflow input parameters
 *           example:
 *             owner: "myorg"
 *             repo: "myrepo"
 *             workflowId: "deploy.yml"
 *             ref: "main"
 *             inputs:
 *               environment: "production"
 *               version: "1.2.3"
 *     responses:
 *       200:
 *         description: Workflow triggered successfully
 */
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo, workflowId, ref, inputs } = req.body;

    if (!owner || !repo || !workflowId) {
      return res.status(400).json({
        success: false,
        error: 'owner, repo, and workflowId are required',
      });
    }

    const result = await githubActionsService.triggerWorkflow({
      owner,
      repo,
      workflowId,
      ref,
      inputs,
    });

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        runUrl: result.runUrl,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github-actions/runs/{runId}:
 *   get:
 *     summary: Get workflow run status
 *     tags: [GitHub Actions]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workflow run details
 */
router.get('/runs/:runId', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { runId } = req.params;
    const { owner, repo } = req.query;

    if (!owner || !repo) {
      return res.status(400).json({
        success: false,
        error: 'owner and repo are required',
      });
    }

    const run = await githubActionsService.getWorkflowRun(
      owner as string,
      repo as string,
      parseInt(runId, 10)
    );

    if (!run) {
      return res.status(404).json({
        success: false,
        error: 'Workflow run not found',
      });
    }

    res.json({
      success: true,
      data: run,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github-actions/runs/{runId}/cancel:
 *   post:
 *     summary: Cancel a workflow run
 *     tags: [GitHub Actions]
 *     parameters:
 *       - in: path
 *         name: runId
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
 *               - owner
 *               - repo
 *             properties:
 *               owner:
 *                 type: string
 *               repo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Workflow run cancelled
 */
router.post('/runs/:runId/cancel', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { runId } = req.params;
    const { owner, repo } = req.body;

    if (!owner || !repo) {
      return res.status(400).json({
        success: false,
        error: 'owner and repo are required',
      });
    }

    const result = await githubActionsService.cancelWorkflowRun(
      owner,
      repo,
      parseInt(runId, 10)
    );

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github-actions/parse-command:
 *   post:
 *     summary: Parse a @claude command
 *     description: Test command parsing without actually triggering a workflow
 *     tags: [GitHub Actions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - comment
 *             properties:
 *               comment:
 *                 type: string
 *                 description: Comment text containing @claude
 *           example:
 *             comment: "@claude deploy environment=production version=1.2.3"
 *     responses:
 *       200:
 *         description: Parsed command
 */
router.post('/parse-command', async (req: Request, res: Response) => {
  try {
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({
        success: false,
        error: 'comment is required',
      });
    }

    const parsed = githubActionsService.parseCommand(comment);

    if (!parsed) {
      return res.json({
        success: false,
        message: 'No @claude command found',
      });
    }

    res.json({
      success: true,
      data: parsed,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
