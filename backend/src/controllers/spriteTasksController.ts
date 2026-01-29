/**
 * Sprite Tasks Controller
 *
 * Handles HTTP requests for sprite task queue management.
 */

import { Request, Response } from 'express';
import { spriteTaskService } from '../services/SpriteTaskService';
import { githubIssueSyncService } from '../services/GitHubIssueSyncService';
import { issueParserService } from '../services/IssueParserService';
import SpriteTask from '../models/SpriteTask';
import ProjectSprite from '../models/ProjectSprite';

/**
 * Create a new task
 */
export const createTask = async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = req.user as { organizationId: string; userId: string };
    const { projectId, title, description, prompt, priority, githubIssueNumber, githubIssueUrl } = req.body;

    if (!projectId || !title) {
      return res.status(400).json({
        success: false,
        error: 'projectId and title are required',
      });
    }

    const task = await spriteTaskService.createTask({
      projectId,
      organizationId,
      title,
      description,
      prompt,
      priority,
      githubIssueNumber,
      githubIssueUrl,
      createdById: userId,
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] createTask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get all tasks for organization
 */
export const getTasks = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user as { organizationId: string };
    const { projectId, status, limit } = req.query;

    let tasks: SpriteTask[];

    if (projectId) {
      tasks = await spriteTaskService.getTasksForProject(projectId as string, {
        status: status ? (status as string).split(',') as any[] : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });
    } else {
      tasks = await spriteTaskService.getTasksForOrganization(organizationId, {
        status: status ? (status as string).split(',') as any[] : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });
    }

    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error('[spriteTasksController] getTasks error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get a single task
 */
export const getTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await spriteTaskService.getTask(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] getTask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Update a task
 */
export const updateTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, prompt, priority } = req.body;

    const task = await spriteTaskService.updateTask(id, {
      title,
      description,
      prompt,
      priority,
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] updateTask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Cancel a task
 */
export const cancelTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await spriteTaskService.cancelTask(id);
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] cancelTask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Retry a failed task
 */
export const retryTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await spriteTaskService.retryTask(id);
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] retryTask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Manually assign a task to a sprite
 */
export const assignTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { spriteId } = req.body;
    const { userId } = req.user as { userId: string };

    if (!spriteId) {
      return res.status(400).json({
        success: false,
        error: 'spriteId is required',
      });
    }

    const task = await spriteTaskService.assignTask({
      taskId: id,
      spriteId,
      assignedById: userId,
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] assignTask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Start processing a task
 */
export const startTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await spriteTaskService.startTask(id);
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] startTask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Process a task completely (assign, start, run Claude, create PR)
 */
export const processTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { spriteId } = req.body;

    const task = await spriteTaskService.processTask(id, spriteId);
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] processTask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Create PR for a task (if in_progress)
 */
export const createPR = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await spriteTaskService.createPRForTask(id);
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] createPR error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Mark a task as completed
 */
export const completeTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await spriteTaskService.completeTask(id);
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] completeTask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get queue stats
 */
export const getQueueStats = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user as { organizationId: string };
    const { projectId } = req.query;

    const where: Record<string, unknown> = projectId
      ? { projectId: projectId as string }
      : { organizationId };

    const [pending, inProgress, prCreated, completed, failed] = await Promise.all([
      SpriteTask.count({ where: { ...where, status: 'pending' } }),
      SpriteTask.count({ where: { ...where, status: ['assigned', 'in_progress'] } }),
      SpriteTask.count({ where: { ...where, status: 'pr_created' } }),
      SpriteTask.count({ where: { ...where, status: 'completed' } }),
      SpriteTask.count({ where: { ...where, status: 'failed' } }),
    ]);

    res.json({
      success: true,
      data: {
        pending,
        inProgress,
        prCreated,
        completed,
        failed,
        total: pending + inProgress + prCreated + completed + failed,
      },
    });
  } catch (error) {
    console.error('[spriteTasksController] getQueueStats error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Process a GitHub issue directly
 * Creates a task from the issue and processes it (assign, branch, Claude, PR)
 */
export const processIssue = async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = req.user as { organizationId: string; userId: string };
    const { projectId, issueNumber, spriteId, priority } = req.body;

    if (!projectId || !issueNumber) {
      return res.status(400).json({
        success: false,
        error: 'projectId and issueNumber are required',
      });
    }

    const task = await spriteTaskService.processGitHubIssue({
      projectId,
      organizationId,
      issueNumber: parseInt(issueNumber, 10),
      spriteId,
      priority,
      createdById: userId,
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] processIssue error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Create a task from a GitHub issue (without processing)
 */
export const createFromIssue = async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = req.user as { organizationId: string; userId: string };
    const { projectId, issueNumber, priority, spriteId } = req.body;

    if (!projectId || !issueNumber) {
      return res.status(400).json({
        success: false,
        error: 'projectId and issueNumber are required',
      });
    }

    const task = await spriteTaskService.createTaskFromIssue({
      projectId,
      organizationId,
      issueNumber: parseInt(issueNumber, 10),
      priority,
      createdById: userId,
      spriteId,
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[spriteTasksController] createFromIssue error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get diff for a task's branch
 */
export const getTaskDiff = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await SpriteTask.findByPk(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    if (!task.branchName) {
      return res.json({
        success: true,
        data: {
          files: [],
          branchName: null,
          baseBranch: 'main',
          additions: 0,
          deletions: 0,
          changedFiles: 0,
        },
      });
    }

    // Get diff via sprite service if task has an assigned sprite
    if (task.spriteId) {
      try {
        const diff = await spriteTaskService.getTaskDiff(id);
        return res.json({ success: true, data: diff });
      } catch (error) {
        console.warn('[spriteTasksController] getTaskDiff via sprite failed:', error);
      }
    }

    // Return basic info if we can't get actual diff
    res.json({
      success: true,
      data: {
        files: [],
        branchName: task.branchName,
        baseBranch: 'main',
        additions: 0,
        deletions: 0,
        changedFiles: 0,
        status: task.status,
        statusMessage: task.statusMessage,
      },
    });
  } catch (error) {
    console.error('[spriteTasksController] getTaskDiff error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get sync status for a task
 */
export const getSyncStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await SpriteTask.findByPk(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    const syncStatus = await githubIssueSyncService.getSyncStatus(id);
    res.json({ success: true, data: syncStatus });
  } catch (error) {
    console.error('[spriteTasksController] getSyncStatus error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get activity timeline for a task
 */
export const getTaskActivity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await SpriteTask.findByPk(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    const activity = await githubIssueSyncService.getTaskActivity(id);
    res.json({ success: true, data: activity });
  } catch (error) {
    console.error('[spriteTasksController] getTaskActivity error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Force sync a task with its GitHub issue
 */
export const syncTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await SpriteTask.findByPk(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    if (!task.githubIssueNumber) {
      return res.status(400).json({
        success: false,
        error: 'Task is not linked to a GitHub issue',
      });
    }

    // Poll for changes (this syncs issue content and comments)
    const pollResult = await githubIssueSyncService.pollIssueChanges(id);

    // Update labels to match current task status
    await githubIssueSyncService.updateIssueLabels(id, task.status);

    res.json({
      success: true,
      data: {
        issueUpdated: pollResult.issueUpdated,
        newComments: pollResult.newComments,
        labelsUpdated: true,
        issueClosed: pollResult.issueClosed,
      },
    });
  } catch (error) {
    console.error('[spriteTasksController] syncTask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Parse a GitHub issue into structured task data (preview before creating)
 */
export const parseIssue = async (req: Request, res: Response) => {
  try {
    const { title, body, labels } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'title is required',
      });
    }

    const parsed = issueParserService.parseIssue(
      title,
      body || null,
      labels || []
    );

    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('[spriteTasksController] parseIssue error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Fetch and parse a GitHub issue by number
 */
export const parseGitHubIssue = async (req: Request, res: Response) => {
  try {
    const { projectId, issueNumber, spriteId } = req.body;

    if (!projectId || !issueNumber) {
      return res.status(400).json({
        success: false,
        error: 'projectId and issueNumber are required',
      });
    }

    // Get sprite for this project (use provided spriteId or find active one)
    const sprite = spriteId
      ? await ProjectSprite.findByPk(spriteId)
      : await ProjectSprite.findOne({
          where: { projectId, status: 'active' },
          order: [['createdAt', 'DESC']],
        });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'No active sprite found for this project',
      });
    }

    // Fetch the issue from GitHub via SpriteTaskService
    const issue = await spriteTaskService.fetchGitHubIssue(sprite, parseInt(issueNumber, 10));

    if (!issue) {
      return res.status(404).json({
        success: false,
        error: 'GitHub issue not found',
      });
    }

    // Parse the issue - convert labels from string[] to {name: string}[] format
    const parsed = issueParserService.parseGitHubIssue({
      title: issue.title,
      body: issue.body,
      labels: issue.labels.map((l) => ({ name: l })),
    });

    res.json({
      success: true,
      data: {
        ...parsed,
        issueNumber: issue.number,
        issueUrl: issue.url,
        issueState: issue.state,
        issueLabels: issue.labels,
      },
    });
  } catch (error) {
    console.error('[spriteTasksController] parseGitHubIssue error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

export default {
  createTask,
  getTasks,
  getTask,
  updateTask,
  cancelTask,
  retryTask,
  assignTask,
  startTask,
  processTask,
  createPR,
  completeTask,
  getQueueStats,
  processIssue,
  createFromIssue,
  getTaskDiff,
  getSyncStatus,
  getTaskActivity,
  syncTask,
  parseIssue,
  parseGitHubIssue,
};
