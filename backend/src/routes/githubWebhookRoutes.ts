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
import { githubIssueSyncService } from '../services/GitHubIssueSyncService';
import { githubSyncWebSocketService } from '../services/GitHubSyncWebSocketService';
import { deployHookService } from '../services/DeployHookService';

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
 *       - **issues.edited**: When an issue title/body is edited, linked tasks are updated instantly.
 *       - **issues.closed**: When an issue is closed, any associated task is marked complete.
 *       - **issue_comment.created/edited**: When someone comments on an issue, the comment is synced to linked tasks.
 *       - **pull_request.closed**: When a PR is merged, associated tasks are marked complete.
 *
 *       Setup:
 *       1. Add webhook to your GitHub repo
 *       2. URL: https://your-domain.com/api/webhooks/github
 *       3. Content type: application/json
 *       4. Secret: Set GITHUB_WEBHOOK_SECRET env var
 *       5. Events: Issues, Issue comments, Pull requests
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
        const { action, issue, repository } = req.body;

        // Handle issue edits - sync title/body changes to linked tasks
        if (action === 'edited') {
          console.log(`📝 Issue #${issue.number} edited in ${repository.full_name}`);

          // Find tasks linked to this issue
          const SpriteTask = await import('../models/SpriteTask').then((m) => m.default);
          const tasks = await SpriteTask.findAll({
            where: { githubIssueNumber: issue.number },
          });

          let syncedCount = 0;
          for (const task of tasks) {
            try {
              // Update task title/description if they changed
              const updates: Record<string, unknown> = {};
              if (task.title !== issue.title) {
                updates.title = issue.title;
              }
              if (task.description !== issue.body) {
                updates.description = issue.body;
              }

              if (Object.keys(updates).length > 0) {
                await task.update(updates);
                syncedCount++;
                console.log(`✅ Task ${task.id} synced with issue #${issue.number} edits`);

                // Broadcast WebSocket event
                githubSyncWebSocketService.broadcastSyncEvent({
                  eventType: 'issue_edited',
                  projectId: task.projectId,
                  taskId: task.id,
                  issueNumber: issue.number,
                  repository: repository.full_name,
                  data: {
                    title: issue.title,
                    body: issue.body,
                    updatedFields: Object.keys(updates),
                  },
                });
              }
            } catch (err) {
              console.error(`Failed to sync task ${task.id}:`, err);
            }
          }

          return res.json({
            success: true,
            message: `Issue #${issue.number} edit processed`,
            syncedTasks: syncedCount,
          });
        }

        // Handle labeled/closed actions via existing service
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

      case 'issue_comment': {
        const { action, issue, comment, repository } = req.body;

        // Only process new or edited comments (not deleted)
        if (action !== 'created' && action !== 'edited') {
          return res.json({
            success: true,
            message: `Comment action "${action}" not handled`,
          });
        }

        // Skip bot comments to avoid infinite loops
        if (comment.user?.type === 'Bot' || comment.body?.includes('<!-- sprite-bot -->')) {
          return res.json({
            success: true,
            message: 'Bot comment ignored',
          });
        }

        console.log(`💬 Issue #${issue.number} received comment in ${repository.full_name}`);

        // Find tasks linked to this issue and trigger sync
        const SpriteTask = await import('../models/SpriteTask').then((m) => m.default);
        const tasks = await SpriteTask.findAll({
          where: { githubIssueNumber: issue.number },
        });

        let syncedCount = 0;
        for (const task of tasks) {
          try {
            // Sync comments from GitHub to task activity
            await githubIssueSyncService.syncIssueComments(task.id);
            syncedCount++;
            console.log(`✅ Task ${task.id} comments synced from issue #${issue.number}`);

            // Broadcast WebSocket event
            githubSyncWebSocketService.broadcastSyncEvent({
              eventType: 'issue_comment',
              projectId: task.projectId,
              taskId: task.id,
              issueNumber: issue.number,
              repository: repository.full_name,
              data: {
                action,
                commentId: comment.id,
                author: comment.user?.login,
                body: comment.body?.substring(0, 200), // Truncate for preview
                createdAt: comment.created_at,
              },
            });
          } catch (err) {
            console.error(`Failed to sync comments for task ${task.id}:`, err);
          }
        }

        return res.json({
          success: true,
          message: `Issue #${issue.number} comment synced`,
          syncedTasks: syncedCount,
          commentAction: action,
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

                // Trigger deploy hooks for PR merged (in addition to task_completed)
                try {
                  const deployResults = await deployHookService.onPRMerged({
                    projectId: task.projectId,
                    taskId: task.id,
                    taskTitle: task.title,
                    branchName: pr.head?.ref || task.branchName,
                    commitSha: pr.merge_commit_sha,
                    prNumber: pr.number,
                  });
                  if (deployResults.length > 0) {
                    const successful = deployResults.filter(r => r.success).length;
                    console.log(`🚀 Triggered ${successful}/${deployResults.length} PR merge deploy hooks`);
                  }
                } catch (deployError) {
                  console.error('Deploy hook trigger failed for PR merge:', deployError);
                }

                // Broadcast WebSocket event
                githubSyncWebSocketService.broadcastSyncEvent({
                  eventType: 'pr_merged',
                  projectId: task.projectId,
                  taskId: task.id,
                  issueNumber,
                  repository: repository.full_name,
                  data: {
                    prNumber: pr.number,
                    prTitle: pr.title,
                    prUrl: pr.html_url,
                    mergedBy: pr.merged_by?.login,
                    mergedAt: pr.merged_at,
                    newStatus: 'completed',
                  },
                });
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
