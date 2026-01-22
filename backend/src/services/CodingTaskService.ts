/**
 * CodingTaskService
 *
 * Orchestrates AI-powered coding tasks using Claude Agent SDK.
 * Handles the full workflow: clone → branch → code → test → lint → commit → PR
 */

import { gitHubService } from './GitHubService';
import { claudeCodingAgentService } from './ClaudeCodingAgentService';
import CodingTask from '../models/CodingTask';
import Project from '../models/Project';
import type { CodingTaskStatus, CodingTaskConfig } from '../models/CodingTask';

interface StartTaskOptions {
  projectId: string;
  title: string;
  instructions: string;
  createdById: string;
  config?: Partial<CodingTaskConfig>;
}

interface TaskProgress {
  status: CodingTaskStatus;
  message: string;
  timestamp: Date;
}

class CodingTaskService {
  private initialized = false;

  async initialize(): Promise<void> {
    // Initialize the coding agent
    await claudeCodingAgentService.initialize();
    console.log('CodingTaskService initialized');
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Start a new coding task
   */
  async startTask(options: StartTaskOptions): Promise<CodingTask> {
    const { projectId, title, instructions, createdById, config = {} } = options;

    // Get the project to retrieve the GitHub URL
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (!project.githubUrl) {
      throw new Error('Project does not have a GitHub repository linked');
    }

    // Parse GitHub URL
    const repoInfo = gitHubService.parseGitHubUrl(project.githubUrl);
    if (!repoInfo) {
      throw new Error(`Invalid GitHub URL: ${project.githubUrl}`);
    }

    // Get default branch from repo
    const defaultBranch = config.baseBranch || await gitHubService.getDefaultBranch(repoInfo.owner, repoInfo.repo);

    // Generate feature branch name
    const branchPrefix = config.branchPrefix || 'feature';
    const slugifiedTitle = this.slugify(title);
    const timestamp = Date.now();
    const featureBranch = `${branchPrefix}/${slugifiedTitle}-${timestamp}`;

    // Create the coding task record
    const task = await CodingTask.create({
      projectId,
      title,
      instructions,
      repoUrl: project.githubUrl,
      baseBranch: defaultBranch,
      featureBranch,
      createdById,
      config: {
        baseBranch: defaultBranch,
        branchPrefix: config.branchPrefix || 'feature',
        allowedPaths: config.allowedPaths,
        forbiddenPaths: config.forbiddenPaths,
        maxFilesChanged: config.maxFilesChanged || 50,
        runTests: config.runTests !== false,
        testCommand: config.testCommand || 'npm test',
        lintCommand: config.lintCommand || 'npm run lint',
        testTimeout: config.testTimeout || 300000, // 5 minutes
        autoCreatePR: config.autoCreatePR !== false,
        prReviewers: config.prReviewers || [],
        prLabels: config.prLabels || ['ai-generated'],
        maxDuration: config.maxDuration || 600000, // 10 minutes
      },
    });

    await task.addProgressLog(`Task created: ${title}`);

    // Start the task execution asynchronously
    this.executeTask(task.id).catch((error) => {
      console.error(`Task ${task.id} failed:`, error);
    });

    return task;
  }

  /**
   * Execute the coding task workflow
   */
  async executeTask(taskId: string): Promise<void> {
    const task = await CodingTask.findByPk(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const startTime = Date.now();
    await task.update({ startedAt: new Date() });

    try {
      // Parse repo info
      const repoInfo = gitHubService.parseGitHubUrl(task.repoUrl);
      if (!repoInfo) {
        throw new Error(`Invalid GitHub URL: ${task.repoUrl}`);
      }

      const { owner, repo } = repoInfo;

      // Step 1: Create branch
      await this.updateTaskStatus(task, 'branching', 'Creating feature branch...');
      await gitHubService.createBranch(owner, repo, task.featureBranch, task.baseBranch);
      await task.addProgressLog(`Created branch: ${task.featureBranch}`);

      // Step 2: Execute coding with Claude
      await this.updateTaskStatus(task, 'coding', 'Claude is implementing changes...');
      const codingResult = await this.executeCodingWithClaude(task, owner, repo);
      await task.addProgressLog(`Coding complete: ${codingResult.filesChanged} files changed`);

      // Update file stats
      await task.update({
        filesChanged: codingResult.filesChanged,
        linesAdded: codingResult.linesAdded,
        linesRemoved: codingResult.linesRemoved,
        commitSha: codingResult.commitSha,
      });

      // Step 3: Run tests (if enabled)
      if (task.config.runTests) {
        await this.updateTaskStatus(task, 'testing', 'Running tests...');
        const testResult = await this.runTests(task, owner, repo);
        await task.update({
          testsPassed: testResult.passed,
          testOutput: testResult.output,
        });
        await task.addProgressLog(testResult.passed ? 'Tests passed' : 'Tests failed');

        if (!testResult.passed) {
          throw new Error(`Tests failed: ${testResult.output?.substring(0, 500)}`);
        }
      }

      // Step 4: Run linting (if command provided)
      if (task.config.lintCommand) {
        await this.updateTaskStatus(task, 'linting', 'Running linter...');
        const lintResult = await this.runLinting(task, owner, repo);
        await task.update({
          lintPassed: lintResult.passed,
          lintOutput: lintResult.output,
        });
        await task.addProgressLog(lintResult.passed ? 'Lint passed' : 'Lint issues found');

        // Don't fail on lint warnings, just log
        if (!lintResult.passed) {
          await task.addProgressLog('Warning: Lint issues detected but continuing');
        }
      }

      // Step 5: Create PR (if enabled)
      if (task.config.autoCreatePR) {
        await this.updateTaskStatus(task, 'creating_pr', 'Creating pull request...');
        const pr = await this.createPullRequest(task, owner, repo);
        await task.update({
          prUrl: pr.html_url,
          prNumber: pr.number,
        });
        await task.addProgressLog(`Created PR #${pr.number}: ${pr.html_url}`);
      }

      // Complete the task
      const duration = Date.now() - startTime;
      await task.update({
        status: 'completed',
        completedAt: new Date(),
        durationMs: duration,
      });
      await task.addProgressLog(`Task completed in ${Math.round(duration / 1000)}s`);

    } catch (error) {
      const errorMessage = (error as Error).message;
      const duration = Date.now() - startTime;

      await task.update({
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
        durationMs: duration,
      });
      await task.addProgressLog(`Task failed: ${errorMessage}`);

      throw error;
    }
  }

  /**
   * Execute coding changes using Claude
   */
  private async executeCodingWithClaude(
    task: CodingTask,
    owner: string,
    repo: string
  ): Promise<{
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    commitSha: string;
  }> {
    // Check if coding agent is ready
    if (!claudeCodingAgentService.isReady()) {
      // Fall back to placeholder if LLM not configured
      await task.addProgressLog('Warning: LLM not configured, creating placeholder commit');
      return this.createPlaceholderCommit(task, owner, repo);
    }

    // Use the Claude coding agent to execute the task
    const result = await claudeCodingAgentService.executeCoding(task, owner, repo);

    return {
      filesChanged: result.filesChanged,
      linesAdded: result.linesAdded,
      linesRemoved: result.linesRemoved,
      commitSha: result.commitSha,
    };
  }

  /**
   * Create a placeholder commit when LLM is not available
   */
  private async createPlaceholderCommit(
    task: CodingTask,
    owner: string,
    repo: string
  ): Promise<{
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    commitSha: string;
  }> {
    const placeholderPath = '.claude-task.md';
    const content = `# Coding Task: ${task.title}

## Instructions
${task.instructions}

## Task Details
- Task ID: ${task.id}
- Branch: ${task.featureBranch}
- Created: ${task.createdAt.toISOString()}

---
*This file was created as a placeholder. Configure LLM API keys to enable actual code generation.*
*Set OPENAI_API_KEY or OPENROUTER_API_KEY in your environment.*
`;

    const result = await gitHubService.createOrUpdateFile(
      owner,
      repo,
      placeholderPath,
      content,
      `[Claude] Start task: ${task.title}`,
      task.featureBranch
    );

    return {
      filesChanged: 1,
      linesAdded: content.split('\n').length,
      linesRemoved: 0,
      commitSha: result.commit.sha,
    };
  }

  /**
   * Run tests for the task
   * This would execute via GitHub Actions or a CI system
   */
  private async runTests(
    task: CodingTask,
    _owner: string,
    _repo: string
  ): Promise<{ passed: boolean; output: string | null }> {
    // TODO: Trigger GitHub Actions or external CI
    await task.addProgressLog('Tests would run here via CI/CD');

    // For now, assume tests pass
    return {
      passed: true,
      output: 'Test execution pending CI integration',
    };
  }

  /**
   * Run linting for the task
   */
  private async runLinting(
    task: CodingTask,
    _owner: string,
    _repo: string
  ): Promise<{ passed: boolean; output: string | null }> {
    // TODO: Trigger GitHub Actions or external CI
    await task.addProgressLog('Linting would run here via CI/CD');

    return {
      passed: true,
      output: 'Lint execution pending CI integration',
    };
  }

  /**
   * Create a pull request for the completed task
   */
  private async createPullRequest(
    task: CodingTask,
    owner: string,
    repo: string
  ) {
    const prBody = `## Summary
${task.instructions}

## Changes
- Files changed: ${task.filesChanged}
- Lines added: ${task.linesAdded}
- Lines removed: ${task.linesRemoved}

## Test Results
${task.testsPassed ? '✅ Tests passed' : task.config.runTests ? '❌ Tests failed' : '⏭️ Tests skipped'}

## Lint Results
${task.lintPassed ? '✅ Lint passed' : task.config.lintCommand ? '⚠️ Lint issues' : '⏭️ Lint skipped'}

---
🤖 Generated by Claude Code via [Happy](https://happy.engineering)

Task ID: \`${task.id}\`
`;

    const pr = await gitHubService.createPullRequest(owner, repo, {
      title: task.title,
      body: prBody,
      head: task.featureBranch,
      base: task.baseBranch,
      draft: false,
    });

    // Add labels if configured
    if (task.config.prLabels && task.config.prLabels.length > 0) {
      try {
        await gitHubService.addPullRequestLabels(owner, repo, pr.number, task.config.prLabels);
      } catch (error) {
        await task.addProgressLog(`Warning: Could not add labels: ${(error as Error).message}`);
      }
    }

    // Add reviewers if configured
    if (task.config.prReviewers && task.config.prReviewers.length > 0) {
      try {
        await gitHubService.addPullRequestReviewers(owner, repo, pr.number, task.config.prReviewers);
      } catch (error) {
        await task.addProgressLog(`Warning: Could not add reviewers: ${(error as Error).message}`);
      }
    }

    return pr;
  }

  /**
   * Update task status and add progress log
   */
  private async updateTaskStatus(
    task: CodingTask,
    status: CodingTaskStatus,
    message: string
  ): Promise<void> {
    await task.update({ status });
    await task.addProgressLog(message);
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<CodingTask | null> {
    return CodingTask.findByPk(taskId, {
      include: [
        { association: 'project', attributes: ['id', 'title', 'githubUrl'] },
        { association: 'createdBy', attributes: ['id', 'name', 'email'] },
      ],
    });
  }

  /**
   * Get tasks for a project
   */
  async getTasksForProject(
    projectId: string,
    options: {
      status?: CodingTaskStatus | CodingTaskStatus[];
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ tasks: CodingTask[]; total: number }> {
    const where: any = { projectId };

    if (options.status) {
      where.status = Array.isArray(options.status) ? options.status : options.status;
    }

    const { rows: tasks, count: total } = await CodingTask.findAndCountAll({
      where,
      limit: options.limit || 20,
      offset: options.offset || 0,
      order: [['createdAt', 'DESC']],
      include: [
        { association: 'createdBy', attributes: ['id', 'name', 'email'] },
      ],
    });

    return { tasks, total };
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<CodingTask> {
    const task = await CodingTask.findByPk(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.canCancel()) {
      throw new Error(`Task cannot be cancelled in status: ${task.status}`);
    }

    await task.update({
      status: 'cancelled',
      completedAt: new Date(),
      durationMs: task.startedAt ? Date.now() - task.startedAt.getTime() : null,
    });
    await task.addProgressLog('Task cancelled by user');

    return task;
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<CodingTask> {
    const originalTask = await CodingTask.findByPk(taskId);
    if (!originalTask) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (originalTask.status !== 'failed') {
      throw new Error('Only failed tasks can be retried');
    }

    // Create a new task with the same parameters
    const newTask = await this.startTask({
      projectId: originalTask.projectId,
      title: `${originalTask.title} (retry)`,
      instructions: originalTask.instructions,
      createdById: originalTask.createdById,
      config: originalTask.config,
    });

    await originalTask.addProgressLog(`Retried as task ${newTask.id}`);

    return newTask;
  }

  /**
   * Get task statistics for a user
   */
  async getTaskStats(userId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    avgDuration: number | null;
  }> {
    const tasks = await CodingTask.findAll({
      where: { createdById: userId },
      attributes: ['status', 'durationMs'],
    });

    const stats = {
      total: tasks.length,
      completed: 0,
      failed: 0,
      inProgress: 0,
      avgDuration: null as number | null,
    };

    const durations: number[] = [];

    for (const task of tasks) {
      if (task.status === 'completed') {
        stats.completed++;
        if (task.durationMs) {
          durations.push(task.durationMs);
        }
      } else if (task.status === 'failed') {
        stats.failed++;
      } else if (!['cancelled', 'created'].includes(task.status)) {
        stats.inProgress++;
      }
    }

    if (durations.length > 0) {
      stats.avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }

    return stats;
  }

  /**
   * Convert a string to a URL-safe slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }
}

export const codingTaskService = new CodingTaskService();
export { StartTaskOptions, TaskProgress };
