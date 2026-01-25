/**
 * GitHub Issue Sync Service
 *
 * Handles bidirectional synchronization between GitHub issues and SpriteTask records:
 * - Posts task progress updates as GitHub issue comments
 * - Syncs issue comments to task activity log
 * - Updates issue labels based on task status
 * - Polls for changes as webhook fallback
 */

import SpriteTask, { SpriteTaskStatus } from '../models/SpriteTask';
import Project from '../models/Project';
import { GitHubService } from './GitHubService';
import { spritesService } from './SpritesService';

// Label mapping for task status
const STATUS_LABELS: Record<SpriteTaskStatus, string> = {
  pending: 'sprite:queued',
  assigned: 'sprite:assigned',
  in_progress: 'sprite:in-progress',
  pr_created: 'sprite:pr-ready',
  completed: 'sprite:completed',
  failed: 'sprite:failed',
  cancelled: 'sprite:cancelled',
};

// Status label colors (GitHub hex without #)
const STATUS_LABEL_COLORS: Record<string, string> = {
  'sprite:queued': 'fbca04',      // Yellow
  'sprite:assigned': '0e8a16',    // Green
  'sprite:in-progress': '1d76db', // Blue
  'sprite:pr-ready': '5319e7',    // Purple
  'sprite:completed': '0e8a16',   // Green
  'sprite:failed': 'd93f0b',      // Red
  'sprite:cancelled': 'e4e669',   // Light yellow
};

// Comment marker for our bot comments (so we can find and update them)
const BOT_COMMENT_MARKER = '<!-- sprite-task-sync -->';

interface SyncedComment {
  id: number;
  body: string;
  createdAt: string;
  author: string;
}

interface TaskActivityEntry {
  type: 'status_change' | 'comment' | 'pr_created' | 'error';
  timestamp: string;
  message: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

class GitHubIssueSyncService {
  private initialized = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private githubService: GitHubService | null = null;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initialize(): void {
    this.initialized = true;
    console.log('✅ GitHubIssueSyncService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Start polling for issue changes (fallback for webhooks)
   */
  startPolling(intervalMs: number = 60000): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollAllActiveIssues();
      } catch (error) {
        console.error('[GitHubIssueSync] Polling error:', error);
      }
    }, intervalMs);

    console.log(`🔄 GitHubIssueSyncService polling started (every ${intervalMs / 1000}s)`);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('⏹️ GitHubIssueSyncService polling stopped');
    }
  }

  // ============================================================================
  // PROGRESS COMMENTS - Post task updates to GitHub issues
  // ============================================================================

  /**
   * Post a progress comment on the linked GitHub issue
   */
  async postProgressComment(
    taskId: string,
    message: string,
    options: { updateExisting?: boolean } = {}
  ): Promise<void> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task || !task.githubIssueNumber) {
      return; // No linked issue
    }

    const project = await Project.findByPk(task.projectId);
    if (!project?.githubUrl) {
      return;
    }

    const parsed = this.parseGitHubUrl(project.githubUrl);
    if (!parsed) {
      return;
    }

    const github = await this.getGitHubService(task.organizationId);
    if (!github) {
      console.warn('[GitHubIssueSync] No GitHub token available');
      return;
    }

    try {
      const commentBody = this.formatProgressComment(task, message);

      if (options.updateExisting) {
        // Find and update existing bot comment
        const existingComment = await this.findBotComment(
          github,
          parsed.owner,
          parsed.repo,
          task.githubIssueNumber
        );

        if (existingComment) {
          await github.updateIssueComment(
            parsed.owner,
            parsed.repo,
            existingComment.id,
            commentBody
          );
          console.log(`[GitHubIssueSync] Updated progress comment on issue #${task.githubIssueNumber}`);
          return;
        }
      }

      // Create new comment
      await github.createIssueComment(
        parsed.owner,
        parsed.repo,
        task.githubIssueNumber,
        commentBody
      );
      console.log(`[GitHubIssueSync] Posted progress comment on issue #${task.githubIssueNumber}`);
    } catch (error) {
      console.error(`[GitHubIssueSync] Failed to post comment:`, error);
    }
  }

  /**
   * Post status change comment when task status changes
   */
  async postStatusChange(
    taskId: string,
    newStatus: SpriteTaskStatus,
    details?: string
  ): Promise<void> {
    const statusMessages: Record<SpriteTaskStatus, string> = {
      pending: '⏳ Task has been queued for processing',
      assigned: '👤 Task has been assigned to a sprite',
      in_progress: '🔄 Sprite is now working on this task',
      pr_created: '🎉 Pull request has been created',
      completed: '✅ Task completed successfully',
      failed: '❌ Task failed',
      cancelled: '🚫 Task was cancelled',
    };

    let message = statusMessages[newStatus];
    if (details) {
      message += `\n\n${details}`;
    }

    await this.postProgressComment(taskId, message);
    await this.updateIssueLabels(taskId, newStatus);
  }

  /**
   * Format a progress comment with task status
   */
  private formatProgressComment(task: SpriteTask, message: string): string {
    const lines = [
      BOT_COMMENT_MARKER,
      '## 🤖 Sprite Task Update',
      '',
      message,
      '',
      '---',
      '',
      `**Status:** ${this.getStatusEmoji(task.status)} ${task.status}`,
    ];

    if (task.branchName) {
      lines.push(`**Branch:** \`${task.branchName}\``);
    }

    if (task.pullRequestUrl) {
      lines.push(`**PR:** ${task.pullRequestUrl}`);
    }

    if (task.startedAt) {
      const elapsed = this.formatDuration(new Date(task.startedAt), new Date());
      lines.push(`**Elapsed:** ${elapsed}`);
    }

    lines.push(
      '',
      '---',
      '_Automated by [Dispotree Sprites](https://dispotree.com)_'
    );

    return lines.join('\n');
  }

  private getStatusEmoji(status: SpriteTaskStatus): string {
    const emojis: Record<SpriteTaskStatus, string> = {
      pending: '⏳',
      assigned: '👤',
      in_progress: '🔄',
      pr_created: '🎉',
      completed: '✅',
      failed: '❌',
      cancelled: '🚫',
    };
    return emojis[status] || '📋';
  }

  // ============================================================================
  // ISSUE LABELS - Sync task status to GitHub labels
  // ============================================================================

  /**
   * Update issue labels based on task status
   */
  async updateIssueLabels(taskId: string, newStatus: SpriteTaskStatus): Promise<void> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task || !task.githubIssueNumber) {
      return;
    }

    const project = await Project.findByPk(task.projectId);
    if (!project?.githubUrl) {
      return;
    }

    const parsed = this.parseGitHubUrl(project.githubUrl);
    if (!parsed) {
      return;
    }

    const github = await this.getGitHubService(task.organizationId);
    if (!github) {
      return;
    }

    try {
      // Get current labels on the issue
      const issue = await github.getIssue(parsed.owner, parsed.repo, task.githubIssueNumber);
      const currentLabels = issue.labels.map(l => l.name);

      // Remove old sprite status labels
      const spriteLabels = currentLabels.filter(l => l.startsWith('sprite:'));
      for (const label of spriteLabels) {
        try {
          await github.removeIssueLabel(parsed.owner, parsed.repo, task.githubIssueNumber, label);
        } catch {
          // Label might not exist, ignore
        }
      }

      // Add new status label
      const newLabel = STATUS_LABELS[newStatus];
      if (newLabel) {
        // Ensure label exists in repo (create if needed)
        await this.ensureLabelExists(github, parsed.owner, parsed.repo, newLabel);
        await github.addIssueLabels(parsed.owner, parsed.repo, task.githubIssueNumber, [newLabel]);
      }

      console.log(`[GitHubIssueSync] Updated labels on issue #${task.githubIssueNumber} to ${newLabel}`);
    } catch (error) {
      console.error(`[GitHubIssueSync] Failed to update labels:`, error);
    }
  }

  /**
   * Ensure a label exists in the repository
   */
  private async ensureLabelExists(
    github: GitHubService,
    owner: string,
    repo: string,
    labelName: string
  ): Promise<void> {
    const color = STATUS_LABEL_COLORS[labelName] || '666666';
    try {
      // Try to create the label (will fail if exists, which is fine)
      await (github as any).request(`/repos/${owner}/${repo}/labels`, {
        method: 'POST',
        body: JSON.stringify({
          name: labelName,
          color,
          description: `Sprite task status: ${labelName.replace('sprite:', '')}`,
        }),
      });
    } catch {
      // Label already exists or other error, ignore
    }
  }

  // ============================================================================
  // COMMENT SYNC - Pull issue comments into task activity
  // ============================================================================

  /**
   * Sync comments from GitHub issue to task activity log
   */
  async syncIssueComments(taskId: string): Promise<SyncedComment[]> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task || !task.githubIssueNumber) {
      return [];
    }

    const project = await Project.findByPk(task.projectId);
    if (!project?.githubUrl) {
      return [];
    }

    const parsed = this.parseGitHubUrl(project.githubUrl);
    if (!parsed) {
      return [];
    }

    const github = await this.getGitHubService(task.organizationId);
    if (!github) {
      return [];
    }

    try {
      const comments = await github.getIssueComments(
        parsed.owner,
        parsed.repo,
        task.githubIssueNumber,
        { perPage: 100 }
      );

      // Filter out our bot comments
      const userComments = comments.filter(
        c => !c.body.includes(BOT_COMMENT_MARKER)
      );

      return userComments.map(c => ({
        id: c.id,
        body: c.body,
        createdAt: c.created_at,
        author: c.user.login,
      }));
    } catch (error) {
      console.error(`[GitHubIssueSync] Failed to sync comments:`, error);
      return [];
    }
  }

  /**
   * Get activity timeline for a task (includes GitHub comments)
   */
  async getTaskActivity(taskId: string): Promise<TaskActivityEntry[]> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task) {
      return [];
    }

    const activity: TaskActivityEntry[] = [];

    // Add task creation
    activity.push({
      type: 'status_change',
      timestamp: task.createdAt.toISOString(),
      message: `Task created: ${task.title}`,
      metadata: { status: 'pending' },
    });

    // Add status changes based on timestamps
    if (task.startedAt) {
      activity.push({
        type: 'status_change',
        timestamp: task.startedAt.toISOString(),
        message: 'Task started',
        metadata: { status: 'in_progress' },
      });
    }

    if (task.pullRequestUrl) {
      activity.push({
        type: 'pr_created',
        timestamp: task.updatedAt.toISOString(),
        message: `Pull request created: ${task.pullRequestUrl}`,
        metadata: { prUrl: task.pullRequestUrl, prNumber: task.pullRequestNumber },
      });
    }

    if (task.completedAt) {
      activity.push({
        type: 'status_change',
        timestamp: task.completedAt.toISOString(),
        message: `Task ${task.status === 'completed' ? 'completed' : task.status}`,
        metadata: { status: task.status },
      });
    }

    if (task.errorMessage) {
      activity.push({
        type: 'error',
        timestamp: task.updatedAt.toISOString(),
        message: task.errorMessage,
      });
    }

    // Sync and add GitHub comments
    if (task.githubIssueNumber) {
      const comments = await this.syncIssueComments(taskId);
      for (const comment of comments) {
        activity.push({
          type: 'comment',
          timestamp: comment.createdAt,
          message: comment.body,
          actor: comment.author,
          metadata: { commentId: comment.id },
        });
      }
    }

    // Sort by timestamp
    activity.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return activity;
  }

  // ============================================================================
  // POLLING - Fallback for webhook reliability
  // ============================================================================

  /**
   * Poll all active issues for changes
   */
  async pollAllActiveIssues(): Promise<void> {
    // Get all in-progress tasks with linked GitHub issues
    const tasks = await SpriteTask.findAll({
      where: {
        status: ['pending', 'assigned', 'in_progress', 'pr_created'],
        githubIssueNumber: { $ne: null },
      },
    });

    console.log(`[GitHubIssueSync] Polling ${tasks.length} active tasks...`);

    for (const task of tasks) {
      try {
        await this.pollIssueChanges(task.id);
      } catch (error) {
        console.error(`[GitHubIssueSync] Polling error for task ${task.id}:`, error);
      }
    }
  }

  /**
   * Poll a single issue for changes
   */
  async pollIssueChanges(taskId: string): Promise<{
    issueUpdated: boolean;
    newComments: number;
    issueClosed: boolean;
  }> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task || !task.githubIssueNumber) {
      return { issueUpdated: false, newComments: 0, issueClosed: false };
    }

    const project = await Project.findByPk(task.projectId);
    if (!project?.githubUrl) {
      return { issueUpdated: false, newComments: 0, issueClosed: false };
    }

    const parsed = this.parseGitHubUrl(project.githubUrl);
    if (!parsed) {
      return { issueUpdated: false, newComments: 0, issueClosed: false };
    }

    const github = await this.getGitHubService(task.organizationId);
    if (!github) {
      return { issueUpdated: false, newComments: 0, issueClosed: false };
    }

    try {
      // Fetch current issue state
      const issue = await github.getIssue(parsed.owner, parsed.repo, task.githubIssueNumber);

      let issueUpdated = false;
      let issueClosed = false;

      // Check if issue title/body changed
      if (issue.title !== task.title || issue.body !== task.description) {
        await task.update({
          title: issue.title,
          description: issue.body,
        });
        issueUpdated = true;
        console.log(`[GitHubIssueSync] Issue #${task.githubIssueNumber} content updated`);
      }

      // Check if issue was closed externally
      if (issue.state === 'closed' && !['completed', 'cancelled', 'failed'].includes(task.status)) {
        issueClosed = true;
        console.log(`[GitHubIssueSync] Issue #${task.githubIssueNumber} was closed externally`);
        // Don't auto-complete, just log - let webhook handle it
      }

      // Count new comments
      const comments = await this.syncIssueComments(taskId);
      const newComments = comments.length;

      return { issueUpdated, newComments, issueClosed };
    } catch (error) {
      console.error(`[GitHubIssueSync] Polling failed for issue #${task.githubIssueNumber}:`, error);
      return { issueUpdated: false, newComments: 0, issueClosed: false };
    }
  }

  // ============================================================================
  // SYNC STATUS - Track sync state
  // ============================================================================

  /**
   * Get sync status for a task
   */
  async getSyncStatus(taskId: string): Promise<{
    hasLinkedIssue: boolean;
    lastSynced: Date | null;
    issueNumber: number | null;
    issueUrl: string | null;
    commentCount: number;
    currentLabels: string[];
  }> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task) {
      return {
        hasLinkedIssue: false,
        lastSynced: null,
        issueNumber: null,
        issueUrl: null,
        commentCount: 0,
        currentLabels: [],
      };
    }

    if (!task.githubIssueNumber) {
      return {
        hasLinkedIssue: false,
        lastSynced: null,
        issueNumber: null,
        issueUrl: null,
        commentCount: 0,
        currentLabels: [],
      };
    }

    const project = await Project.findByPk(task.projectId);
    const parsed = project?.githubUrl ? this.parseGitHubUrl(project.githubUrl) : null;
    const github = await this.getGitHubService(task.organizationId);

    let commentCount = 0;
    let currentLabels: string[] = [];

    if (github && parsed) {
      try {
        const issue = await github.getIssue(parsed.owner, parsed.repo, task.githubIssueNumber);
        currentLabels = issue.labels.map(l => l.name);

        const comments = await github.getIssueComments(
          parsed.owner,
          parsed.repo,
          task.githubIssueNumber,
          { perPage: 100 }
        );
        commentCount = comments.filter(c => !c.body.includes(BOT_COMMENT_MARKER)).length;
      } catch {
        // Ignore errors
      }
    }

    return {
      hasLinkedIssue: true,
      lastSynced: task.updatedAt,
      issueNumber: task.githubIssueNumber,
      issueUrl: task.githubIssueUrl,
      commentCount,
      currentLabels,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Parse owner/repo from GitHub URL
   */
  private parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.\s]+)/);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2].replace(/\.git$/, '') };
    }
    const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/.\s]+)/);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2].replace(/\.git$/, '') };
    }
    return null;
  }

  /**
   * Get GitHub service with token for organization
   */
  private async getGitHubService(organizationId: string): Promise<GitHubService | null> {
    const token = await spritesService.getGitHubToken(organizationId);
    if (!token) {
      return null;
    }
    return new GitHubService(token);
  }

  /**
   * Find existing bot comment on an issue
   */
  private async findBotComment(
    github: GitHubService,
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<{ id: number } | null> {
    try {
      const comments = await github.getIssueComments(owner, repo, issueNumber, { perPage: 100 });
      const botComment = comments.find(c => c.body.includes(BOT_COMMENT_MARKER));
      return botComment ? { id: botComment.id } : null;
    } catch {
      return null;
    }
  }

  /**
   * Format duration between two dates
   */
  private formatDuration(start: Date, end: Date): string {
    const ms = end.getTime() - start.getTime();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

export const githubIssueSyncService = new GitHubIssueSyncService();
export default githubIssueSyncService;
