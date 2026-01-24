/**
 * GitHub Webhook Routes
 *
 * Handles incoming webhooks from GitHub for:
 * - Issue events (labeled with "sprite" -> triggers sprite processing)
 * - Pull request events (merged -> marks task complete)
 *
 * Setup:
 * 1. Go to your GitHub repo -> Settings -> Webhooks
 * 2. Add webhook: https://your-domain.com/api/webhooks/github
 * 3. Content type: application/json
 * 4. Secret: Set GITHUB_WEBHOOK_SECRET in your environment
 * 5. Events: Issues, Pull requests
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { spriteTaskService } from '../services/SpriteTaskService';

const router = Router();

// Rate limiter for webhooks
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { success: false, error: 'Too many webhook requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(req: Request): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('GITHUB_WEBHOOK_SECRET not configured');
      return false;
    }
    // In development, warn but allow
    console.warn('⚠️  GITHUB_WEBHOOK_SECRET not set - GitHub webhooks are unprotected');
    return true;
  }

  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) {
    return false;
  }

  const payload = JSON.stringify(req.body);
  const expectedSignature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * @swagger
 * tags:
 *   name: GitHub Webhooks
 *   description: GitHub webhook endpoints for sprite automation
 */

/**
 * @swagger
 * /api/webhooks/github:
 *   post:
 *     summary: GitHub webhook receiver
 *     description: |
 *       Receives events from GitHub and triggers sprite task processing.
 *
 *       Supported events:
 *       - **issues.labeled**: When an issue is labeled with "CodeLive" (configurable via SPRITE_TRIGGER_LABEL),
 *         the issue is automatically picked up by an available sprite for implementation.
 *       - **issues.closed**: When an issue is closed, any associated task is marked complete.
 *       - **pull_request.closed**: When a PR is merged, associated tasks are marked complete.
 *
 *       Setup:
 *       1. Add webhook to your GitHub repo
 *       2. URL: https://your-domain.com/api/webhooks/github
 *       3. Content type: application/json
 *       4. Secret: Set GITHUB_WEBHOOK_SECRET env var
 *       5. Events: Issues, Pull requests
 *     tags: [GitHub Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Invalid signature
 */
router.post('/', webhookLimiter, async (req: Request, res: Response) => {
  // Verify signature
  if (!verifyGitHubSignature(req)) {
    console.error('Invalid GitHub webhook signature');
    return res.status(401).json({
      success: false,
      error: 'Invalid webhook signature',
    });
  }

  const event = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  console.log(`📨 GitHub webhook received: ${event} (delivery: ${deliveryId})`);

  try {
    switch (event) {
      case 'issues': {
        const task = await spriteTaskService.handleGitHubIssueWebhook(req.body);

        if (task) {
          return res.json({
            success: true,
            message: `Issue #${req.body.issue.number} queued for processing`,
            taskId: task.id,
            taskStatus: task.status,
          });
        }

        return res.json({
          success: true,
          message: 'Webhook received, no action taken',
          reason:
            req.body.action === 'labeled'
              ? `Label "${req.body.label?.name}" is not the trigger label`
              : `Action "${req.body.action}" not handled`,
        });
      }

      case 'pull_request': {
        const { action, pull_request: pr, repository } = req.body;

        // When PR is merged, check if it closes an issue and mark task complete
        if (action === 'closed' && pr.merged) {
          console.log(`🎉 PR #${pr.number} merged in ${repository.full_name}`);

          // Check if PR body references an issue (e.g., "Fixes #123")
          const issueMatch = pr.body?.match(/(?:fixes|closes|resolves)\s+#(\d+)/i);
          if (issueMatch) {
            const issueNumber = parseInt(issueMatch[1], 10);

            // Mark associated task as complete
            const tasks = await import('../models/SpriteTask').then(
              (m) => m.default.findAll({ where: { githubIssueNumber: issueNumber } })
            );

            for (const task of tasks) {
              if (task.status === 'pr_created') {
                await spriteTaskService.completeTask(task.id);
                console.log(`✅ Task ${task.id} completed (issue #${issueNumber})`);
              }
            }
          }

          return res.json({
            success: true,
            message: `PR #${pr.number} merged processed`,
          });
        }

        return res.json({
          success: true,
          message: 'PR event received, no action taken',
        });
      }

      case 'ping': {
        // GitHub sends a ping when webhook is first configured
        console.log(`🏓 GitHub webhook ping received for ${req.body.repository?.full_name}`);
        return res.json({
          success: true,
          message: 'Pong! Webhook configured successfully.',
          zen: req.body.zen,
        });
      }

      default:
        return res.json({
          success: true,
          message: `Event "${event}" not handled`,
        });
    }
  } catch (error) {
    console.error('GitHub webhook error:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/webhooks/github/test:
 *   post:
 *     summary: Test GitHub webhook handler
 *     description: Simulate a GitHub issue labeled event for testing (non-production only)
 *     tags: [GitHub Webhooks]
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
 *               issueNumber:
 *                 type: integer
 *               spriteId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test event processed
 *       403:
 *         description: Not available in production
 */
router.post('/test', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Test endpoint is disabled in production',
    });
  }

  try {
    const { projectId, issueNumber, spriteId } = req.body;
    const { organizationId, userId } = req.user as { organizationId: string; userId: string };

    if (!projectId || !issueNumber) {
      return res.status(400).json({
        success: false,
        error: 'projectId and issueNumber are required',
      });
    }

    const task = await spriteTaskService.processGitHubIssue({
      projectId,
      organizationId,
      issueNumber,
      spriteId,
      createdById: userId,
    });

    res.json({
      success: true,
      message: `Issue #${issueNumber} processing started`,
      data: task,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
