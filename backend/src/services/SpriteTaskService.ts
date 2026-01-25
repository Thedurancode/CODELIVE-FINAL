/**
 * SpriteTaskService
 *
 * Manages the task queue for sprites using GitHub Issues as the source of truth.
 *
 * Workflow:
 * 1. Issue is labeled (e.g., "sprite") or manually triggered from UI
 * 2. Service fetches issue details from GitHub
 * 3. Creates tracking record in SpriteTask
 * 4. Assigns to available sprite
 * 5. Creates feature branch named from issue
 * 6. Runs Claude to implement
 * 7. Creates PR that references and closes the issue
 *
 * The GitHub Issue IS the task - SpriteTask just tracks processing status.
 */

import SpriteTask, { SpriteTaskStatus, SpriteTaskPriority, SpriteTaskSource } from '../models/SpriteTask';
import ProjectSprite from '../models/ProjectSprite';
import Project from '../models/Project';
import { spritesService } from './SpritesService';

/**
 * GitHub Issue data (source of truth)
 */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: 'open' | 'closed';
  labels: string[];
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskFromIssueOptions {
  projectId: string;
  organizationId: string;
  issueNumber: number;
  issueUrl?: string;
  priority?: SpriteTaskPriority;
  createdById?: string;
  spriteId?: string; // Optional: auto-assign to specific sprite
}

export interface CreateTaskOptions {
  projectId: string;
  organizationId: string;
  title: string;
  description?: string;
  prompt?: string;
  priority?: SpriteTaskPriority;
  source?: SpriteTaskSource;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  createdById?: string;
}

export interface AssignTaskOptions {
  taskId: string;
  spriteId: string;
  assignedById?: string;
}

class SpriteTaskService {
  private initialized: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initialize(): void {
    this.initialized = true;
    console.log('✅ SpriteTaskService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Start automatic task processing (call on server startup)
   */
  startAutoProcessing(intervalMs: number = 30000): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(async () => {
      try {
        await this.processAllQueues();
      } catch (error) {
        console.error('[SpriteTaskService] Auto-processing error:', error);
      }
    }, intervalMs);

    console.log(`🔄 SpriteTaskService auto-processing started (every ${intervalMs / 1000}s)`);
  }

  stopAutoProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('⏹️ SpriteTaskService auto-processing stopped');
    }
  }

  // ============================================================================
  // GITHUB ISSUE FETCHING (SOURCE OF TRUTH)
  // ============================================================================

  /**
   * Parse GitHub repo owner/name from a URL
   */
  parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    // Match: https://github.com/owner/repo or git@github.com:owner/repo.git
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
   * Fetch issue details from GitHub using gh CLI on a sprite
   */
  async fetchGitHubIssue(
    sprite: ProjectSprite,
    issueNumber: number
  ): Promise<GitHubIssue> {
    const project = await Project.findByPk(sprite.projectId);
    if (!project?.githubUrl) {
      throw new Error('Project does not have a GitHub URL configured');
    }

    const parsed = this.parseGitHubUrl(project.githubUrl);
    if (!parsed) {
      throw new Error(`Invalid GitHub URL: ${project.githubUrl}`);
    }

    // Use gh CLI to fetch issue as JSON
    const command = `gh issue view ${issueNumber} --repo ${parsed.owner}/${parsed.repo} --json number,title,body,url,state,labels,assignees,createdAt,updatedAt`;

    const result = await spritesService.execCommand(
      sprite.organizationId,
      sprite.spriteName,
      command
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to fetch issue #${issueNumber}: ${result.output}`);
    }

    try {
      const data = JSON.parse(result.output);
      return {
        number: data.number,
        title: data.title,
        body: data.body,
        url: data.url,
        state: data.state.toLowerCase() as 'open' | 'closed',
        labels: data.labels?.map((l: { name: string }) => l.name) || [],
        assignee: data.assignees?.[0]?.login || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    } catch {
      throw new Error(`Failed to parse issue data: ${result.output}`);
    }
  }

  /**
   * Create a task from a GitHub issue (issue is source of truth)
   */
  async createTaskFromIssue(options: CreateTaskFromIssueOptions): Promise<SpriteTask> {
    const { projectId, organizationId, issueNumber, priority = 'medium', createdById, spriteId } = options;

    // Check for duplicate
    const existing = await SpriteTask.findByGitHubIssue(projectId, issueNumber);
    if (existing) {
      // Return existing task instead of throwing
      console.log(`📋 Task already exists for issue #${issueNumber}: ${existing.id}`);
      return existing;
    }

    // Find a sprite to fetch issue details
    let sprite: ProjectSprite | null = null;
    if (spriteId) {
      sprite = await ProjectSprite.findByPk(spriteId);
    } else {
      sprite = await ProjectSprite.findOne({
        where: { projectId, status: 'running', githubConfigured: true },
      });
    }

    if (!sprite) {
      throw new Error('No configured sprite available to fetch GitHub issue');
    }

    // Fetch issue from GitHub (source of truth)
    const issue = await this.fetchGitHubIssue(sprite, issueNumber);

    if (issue.state === 'closed') {
      throw new Error(`Issue #${issueNumber} is already closed`);
    }

    // Create tracking record - minimal data, issue is source of truth
    const task = await SpriteTask.create({
      projectId,
      organizationId,
      title: issue.title,
      description: issue.body,
      prompt: this.generatePromptFromIssue(issue),
      priority,
      source: 'github_issue',
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.url,
      createdById,
      queuedAt: new Date(),
    });

    console.log(`📋 Task created from issue #${issueNumber}: ${task.title}`);
    return task;
  }

  /**
   * Generate prompt from GitHub issue
   */
  private generatePromptFromIssue(issue: GitHubIssue): string {
    const lines = [
      `Please implement the following GitHub issue:`,
      ``,
      `## Issue #${issue.number}: ${issue.title}`,
    ];

    if (issue.body) {
      lines.push(``, `## Description:`, issue.body);
    }

    if (issue.labels.length > 0) {
      lines.push(``, `## Labels:`, issue.labels.map(l => `- ${l}`).join('\n'));
    }

    lines.push(
      ``,
      `## Instructions:`,
      `1. Analyze the codebase to understand the current implementation`,
      `2. Implement the changes described in this issue`,
      `3. Ensure all changes are properly tested`,
      `4. Commit your changes with clear commit messages`,
      `5. The PR will automatically reference and close this issue when merged`
    );

    return lines.join('\n');
  }

  // ============================================================================
  // TASK CRUD
  // ============================================================================

  /**
   * Create a new task and add to queue
   */
  async createTask(options: CreateTaskOptions): Promise<SpriteTask> {
    const {
      projectId,
      organizationId,
      title,
      description,
      prompt,
      priority = 'medium',
      source = 'manual',
      githubIssueNumber,
      githubIssueUrl,
      createdById,
    } = options;

    // Check for duplicate GitHub issue
    if (githubIssueNumber) {
      const existing = await SpriteTask.findByGitHubIssue(projectId, githubIssueNumber);
      if (existing) {
        throw new Error(`Task already exists for issue #${githubIssueNumber}`);
      }
    }

    const task = await SpriteTask.create({
      projectId,
      organizationId,
      title,
      description,
      prompt: prompt || this.generateDefaultPrompt(title, description),
      priority,
      source,
      githubIssueNumber,
      githubIssueUrl,
      createdById,
      queuedAt: new Date(),
    });

    console.log(`📋 Task created: ${task.title} (${task.id})`);
    return task;
  }

  /**
   * Generate default prompt from task title/description
   */
  private generateDefaultPrompt(title: string, description?: string): string {
    const lines = [
      `Please implement the following task:`,
      ``,
      `## Task: ${title}`,
    ];

    if (description) {
      lines.push(``, `## Description:`, description);
    }

    lines.push(
      ``,
      `## Instructions:`,
      `1. Analyze the codebase to understand the current implementation`,
      `2. Make the necessary changes to complete this task`,
      `3. Ensure all changes are properly tested`,
      `4. Commit your changes with clear commit messages`,
      `5. When done, create a pull request with a summary of changes`
    );

    return lines.join('\n');
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<SpriteTask | null> {
    return SpriteTask.findByPk(taskId);
  }

  /**
   * Get tasks for a project
   */
  async getTasksForProject(
    projectId: string,
    options?: { status?: SpriteTaskStatus[]; limit?: number }
  ): Promise<SpriteTask[]> {
    return SpriteTask.getTasksForProject(projectId, options);
  }

  /**
   * Get tasks for organization
   */
  async getTasksForOrganization(
    organizationId: string,
    options?: { status?: SpriteTaskStatus[]; limit?: number }
  ): Promise<SpriteTask[]> {
    return SpriteTask.getTasksForOrganization(organizationId, options);
  }

  /**
   * Update task
   */
  async updateTask(
    taskId: string,
    updates: Partial<{
      title: string;
      description: string;
      prompt: string;
      priority: SpriteTaskPriority;
    }>
  ): Promise<SpriteTask> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task) throw new Error('Task not found');

    if (!['pending', 'assigned'].includes(task.status)) {
      throw new Error(`Cannot update task in status: ${task.status}`);
    }

    await task.update(updates);
    return task;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<SpriteTask> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task) throw new Error('Task not found');

    if (!task.canCancel()) {
      throw new Error(`Cannot cancel task in status: ${task.status}`);
    }

    await task.update({
      status: 'cancelled',
      statusMessage: 'Cancelled by user',
    });

    return task;
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<SpriteTask> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task) throw new Error('Task not found');

    if (!task.canRetry()) {
      throw new Error(`Cannot retry task in status: ${task.status}`);
    }

    await task.update({
      status: 'pending',
      statusMessage: 'Retrying...',
      errorMessage: null,
      spriteId: null,
      branchName: null,
      pullRequestNumber: null,
      pullRequestUrl: null,
      startedAt: null,
      completedAt: null,
      queuedAt: new Date(),
    });

    return task;
  }

  // ============================================================================
  // TASK ASSIGNMENT & PROCESSING
  // ============================================================================

  /**
   * Assign a task to a sprite
   */
  async assignTask(options: AssignTaskOptions): Promise<SpriteTask> {
    const { taskId, spriteId, assignedById } = options;

    const task = await SpriteTask.findByPk(taskId);
    if (!task) throw new Error('Task not found');

    if (task.status !== 'pending') {
      throw new Error(`Cannot assign task in status: ${task.status}`);
    }

    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    // Check if sprite already has an active task
    const activeTask = await SpriteTask.getActiveTaskForSprite(spriteId);
    if (activeTask) {
      throw new Error(`Sprite already has an active task: ${activeTask.title}`);
    }

    // Generate branch name
    const branchName = task.generateBranchName();

    await task.update({
      spriteId,
      status: 'assigned',
      statusMessage: 'Assigned to sprite, waiting to start',
      branchName,
      assignedById,
    });

    console.log(`✅ Task assigned: ${task.title} -> ${sprite.spriteName}`);
    return task;
  }

  /**
   * Start working on a task (called by sprite)
   */
  async startTask(taskId: string): Promise<SpriteTask> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task) throw new Error('Task not found');

    if (task.status !== 'assigned') {
      throw new Error(`Cannot start task in status: ${task.status}`);
    }

    if (!task.spriteId) {
      throw new Error('Task not assigned to a sprite');
    }

    const sprite = await ProjectSprite.findByPk(task.spriteId);
    if (!sprite) throw new Error('Assigned sprite not found');

    // Create the branch for this task
    try {
      await this.createTaskBranch(sprite, task);
    } catch (error) {
      await task.update({
        status: 'failed',
        errorMessage: `Failed to create branch: ${(error as Error).message}`,
      });
      throw error;
    }

    await task.update({
      status: 'in_progress',
      statusMessage: 'Working on task...',
      startedAt: new Date(),
    });

    console.log(`🚀 Task started: ${task.title}`);
    return task;
  }

  /**
   * Create a branch for the task
   */
  private async createTaskBranch(sprite: ProjectSprite, task: SpriteTask): Promise<void> {
    if (!task.branchName) {
      throw new Error('No branch name set for task');
    }

    const commands = [
      // Make sure we're on the base branch
      `cd ${sprite.workingDirectory} && git checkout ${sprite.branch}`,
      // Pull latest changes
      `cd ${sprite.workingDirectory} && git pull origin ${sprite.branch}`,
      // Create and checkout the task branch
      `cd ${sprite.workingDirectory} && git checkout -b ${task.branchName}`,
      // Push the branch
      `cd ${sprite.workingDirectory} && git push -u origin ${task.branchName}`,
    ];

    for (const command of commands) {
      const result = await spritesService.execCommand(
        sprite.organizationId,
        sprite.spriteName,
        command
      );

      if (result.exitCode !== 0 && !command.includes('git pull')) {
        throw new Error(`Command failed: ${command}\nOutput: ${result.output}`);
      }
    }

    // Update sprite's feature branch
    await sprite.update({ featureBranch: task.branchName });

    console.log(`🌿 Branch created: ${task.branchName}`);
  }

  /**
   * Run Claude on a task
   */
  async runClaudeOnTask(taskId: string): Promise<void> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task) throw new Error('Task not found');

    if (task.status !== 'in_progress') {
      throw new Error(`Task not in progress: ${task.status}`);
    }

    if (!task.spriteId) throw new Error('No sprite assigned');

    const sprite = await ProjectSprite.findByPk(task.spriteId);
    if (!sprite) throw new Error('Sprite not found');

    // Run Claude with the task prompt
    const claudeCommand = `cd ${sprite.workingDirectory} && claude --print "${task.prompt?.replace(/"/g, '\\"')}"`;

    try {
      await task.update({ statusMessage: 'Claude is working...' });

      const result = await spritesService.execCommand(
        sprite.organizationId,
        sprite.spriteName,
        claudeCommand,
        { timeout: 600000 } // 10 minute timeout for Claude
      );

      if (result.exitCode !== 0) {
        throw new Error(`Claude failed: ${result.output}`);
      }

      console.log(`🤖 Claude completed task: ${task.title}`);
    } catch (error) {
      await task.update({
        status: 'failed',
        errorMessage: `Claude failed: ${(error as Error).message}`,
      });
      throw error;
    }
  }

  /**
   * Create PR for a task
   */
  async createPRForTask(taskId: string): Promise<SpriteTask> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task) throw new Error('Task not found');

    if (task.status !== 'in_progress') {
      throw new Error(`Cannot create PR for task in status: ${task.status}`);
    }

    if (!task.spriteId) throw new Error('No sprite assigned');
    if (!task.branchName) throw new Error('No branch name');

    const sprite = await ProjectSprite.findByPk(task.spriteId);
    if (!sprite) throw new Error('Sprite not found');

    // Commit any remaining changes
    const commitMessage = `feat: ${task.title}

${task.description || ''}

${task.githubIssueNumber ? `Fixes #${task.githubIssueNumber}` : ''}

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Dispotree Sprite <sprite@dispotree.com>`.trim();

    const prBody = task.generatePRBody();

    const commands = [
      // Stage all changes
      `cd ${sprite.workingDirectory} && git add -A`,
      // Commit if there are changes
      `cd ${sprite.workingDirectory} && git diff --staged --quiet || git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
      // Push changes
      `cd ${sprite.workingDirectory} && git push origin ${task.branchName}`,
      // Create PR using gh CLI
      `cd ${sprite.workingDirectory} && gh pr create --title "${task.title.replace(/"/g, '\\"')}" --body "${prBody.replace(/"/g, '\\"')}" --base ${sprite.branch}`,
    ];

    let prUrl: string | null = null;
    let prNumber: number | null = null;

    try {
      for (const command of commands) {
        const result = await spritesService.execCommand(
          sprite.organizationId,
          sprite.spriteName,
          command
        );

        // Extract PR URL from gh pr create output
        if (command.includes('gh pr create') && result.exitCode === 0) {
          const urlMatch = result.output.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);
          if (urlMatch) {
            prUrl = urlMatch[0];
            prNumber = parseInt(urlMatch[1], 10);
          }
        }
      }

      await task.update({
        status: 'pr_created',
        statusMessage: 'Pull request created',
        pullRequestUrl: prUrl,
        pullRequestNumber: prNumber,
      });

      console.log(`🔀 PR created for task: ${task.title} -> ${prUrl}`);
      return task;
    } catch (error) {
      await task.update({
        status: 'failed',
        errorMessage: `Failed to create PR: ${(error as Error).message}`,
      });
      throw error;
    }
  }

  /**
   * Mark task as completed
   */
  async completeTask(taskId: string): Promise<SpriteTask> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task) throw new Error('Task not found');

    await task.update({
      status: 'completed',
      statusMessage: 'Task completed',
      completedAt: new Date(),
    });

    // Free up the sprite and optionally shut it down
    if (task.spriteId) {
      const sprite = await ProjectSprite.findByPk(task.spriteId);
      if (sprite) {
        // Reset to base branch
        await sprite.update({ featureBranch: null });

        // Auto-shutdown if configured
        if (sprite.autoShutdownAfterTask) {
          console.log(`⏹️ Auto-shutting down sprite: ${sprite.spriteName}`);
          try {
            await spritesService.stopSprite(sprite.organizationId, sprite.spriteName);
          } catch (error) {
            console.error(`Failed to auto-shutdown sprite ${sprite.spriteName}:`, error);
            // Don't throw - task is still completed successfully
          }
        }
      }
    }

    console.log(`✅ Task completed: ${task.title}`);
    return task;
  }

  // ============================================================================
  // AUTO PROCESSING
  // ============================================================================

  /**
   * Process all task queues (called periodically)
   */
  async processAllQueues(): Promise<void> {
    // Find all sprites that are:
    // 1. Running (available)
    // 2. GitHub configured (can create branches/PRs)
    // 3. Don't have an active task
    const availableSprites = await ProjectSprite.findAll({
      where: {
        status: 'running',
        githubConfigured: true,
      },
    });

    for (const sprite of availableSprites) {
      const activeTask = await SpriteTask.getActiveTaskForSprite(sprite.id);
      if (activeTask) continue; // Sprite is busy

      // Get next pending task for this project
      const nextTask = await SpriteTask.getNextPendingTask(sprite.projectId);
      if (!nextTask) continue; // No tasks in queue

      try {
        // Assign and start the task
        await this.assignTask({ taskId: nextTask.id, spriteId: sprite.id });
        await this.startTask(nextTask.id);
        await this.runClaudeOnTask(nextTask.id);
        await this.createPRForTask(nextTask.id);
      } catch (error) {
        console.error(`[SpriteTaskService] Failed to process task ${nextTask.id}:`, error);
      }
    }
  }

  /**
   * Process a single task completely
   */
  async processTask(taskId: string, spriteId?: string): Promise<SpriteTask> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task) throw new Error('Task not found');

    // Find or validate sprite
    let sprite: ProjectSprite | null = null;

    if (spriteId) {
      sprite = await ProjectSprite.findByPk(spriteId);
    } else {
      // Find available sprite for this project
      sprite = await ProjectSprite.findOne({
        where: {
          projectId: task.projectId,
          status: 'running',
          githubConfigured: true,
        },
      });
    }

    if (!sprite) {
      throw new Error('No available sprite found for this task');
    }

    // Check if sprite is busy
    const activeTask = await SpriteTask.getActiveTaskForSprite(sprite.id);
    if (activeTask && activeTask.id !== taskId) {
      throw new Error(`Sprite is busy with another task: ${activeTask.title}`);
    }

    // Run the full workflow
    if (task.status === 'pending') {
      await this.assignTask({ taskId, spriteId: sprite.id });
    }

    if (task.status === 'assigned' || task.status === 'pending') {
      await this.startTask(taskId);
    }

    if (task.status === 'in_progress') {
      await this.runClaudeOnTask(taskId);
      await this.createPRForTask(taskId);
    }

    return task.reload();
  }

  // ============================================================================
  // GITHUB ISSUE DIRECT PROCESSING
  // ============================================================================

  /**
   * Process a GitHub issue directly (one-call to do everything)
   *
   * This is the main entry point for processing issues. It:
   * 1. Fetches issue from GitHub
   * 2. Creates tracking record
   * 3. Assigns to sprite
   * 4. Creates feature branch
   * 5. Runs Claude
   * 6. Creates PR that closes the issue
   */
  async processGitHubIssue(options: {
    projectId: string;
    organizationId: string;
    issueNumber: number;
    spriteId?: string;
    priority?: SpriteTaskPriority;
    createdById?: string;
  }): Promise<SpriteTask> {
    const { projectId, organizationId, issueNumber, spriteId, priority, createdById } = options;

    console.log(`🚀 Processing GitHub issue #${issueNumber}...`);

    // Create task from issue (fetches from GitHub)
    const task = await this.createTaskFromIssue({
      projectId,
      organizationId,
      issueNumber,
      priority,
      createdById,
      spriteId,
    });

    // If task was already being processed, just return it
    if (task.status !== 'pending') {
      console.log(`📋 Issue #${issueNumber} already being processed (status: ${task.status})`);
      return task;
    }

    // Process the task (assign, start, run Claude, create PR)
    return this.processTask(task.id, spriteId);
  }

  /**
   * Handle GitHub webhook for issue events
   */
  async handleGitHubIssueWebhook(payload: {
    action: string;
    issue: {
      number: number;
      title: string;
      body: string | null;
      html_url: string;
      state: string;
      labels: Array<{ name: string }>;
    };
    repository: {
      full_name: string;
      html_url: string;
    };
    label?: { name: string };
  }): Promise<SpriteTask | null> {
    const { action, issue, repository, label } = payload;

    console.log(`📨 GitHub webhook: ${action} on issue #${issue.number} in ${repository.full_name}`);

    // Only process "labeled" events with our trigger label
    const triggerLabel = process.env.SPRITE_TRIGGER_LABEL || 'CodeLive';

    if (action === 'labeled' && label?.name === triggerLabel) {
      // Find project by GitHub URL
      const project = await Project.findOne({
        where: {
          githubUrl: repository.html_url,
        },
      });

      if (!project) {
        console.warn(`⚠️ No project found for repo: ${repository.full_name}`);
        return null;
      }

      // Process the issue
      return this.processGitHubIssue({
        projectId: project.id,
        organizationId: project.organizationId,
        issueNumber: issue.number,
      });
    }

    // Handle PR merged -> complete task
    if (action === 'closed' && issue.state === 'closed') {
      // Find task for this issue
      const tasks = await SpriteTask.findAll({
        where: { githubIssueNumber: issue.number },
      });

      for (const task of tasks) {
        if (task.status === 'pr_created') {
          await this.completeTask(task.id);
          console.log(`✅ Task completed for issue #${issue.number}`);
        }
      }
    }

    return null;
  }

  /**
   * Get the git diff for a task's branch
   * Returns structured diff data for display
   */
  async getTaskDiff(taskId: string): Promise<{
    files: Array<{
      path: string;
      status: 'added' | 'modified' | 'deleted' | 'renamed';
      additions: number;
      deletions: number;
    }>;
    branchName: string | null;
    baseBranch: string;
    additions: number;
    deletions: number;
    changedFiles: number;
  }> {
    const task = await SpriteTask.findByPk(taskId);
    if (!task || !task.branchName || !task.spriteId) {
      return {
        files: [],
        branchName: task?.branchName || null,
        baseBranch: 'main',
        additions: 0,
        deletions: 0,
        changedFiles: 0,
      };
    }

    // TODO: Execute git diff via sprite WebSocket
    // For now, return basic info
    // Future: Send command to sprite to run `git diff main...{branchName} --stat`
    // and parse the output

    return {
      files: [],
      branchName: task.branchName,
      baseBranch: 'main',
      additions: 0,
      deletions: 0,
      changedFiles: 0,
    };
  }
}

export const spriteTaskService = new SpriteTaskService();
export default spriteTaskService;
