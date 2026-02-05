/**
 * GitHub Actions Service
 *
 * Trigger GitHub Actions workflows programmatically via workflow_dispatch API.
 * Supports:
 * - Triggering workflows with custom inputs
 * - Checking workflow run status
 * - Listing available workflows
 * - Getting workflow run logs
 */

import { gitHubService, GitHubService } from './GitHubService';

interface WorkflowDispatchInputs {
  [key: string]: string | number | boolean;
}

interface TriggerWorkflowOptions {
  owner: string;
  repo: string;
  workflowId: string | number; // Workflow file name or ID
  ref?: string; // Branch/tag to run on (default: main)
  inputs?: WorkflowDispatchInputs;
}

interface WorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  head_branch: string;
  head_sha: string;
}

interface Workflow {
  id: number;
  name: string;
  path: string;
  state: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

interface CommandParseResult {
  command: string;
  workflow?: string;
  inputs?: Record<string, string>;
  ref?: string;
}

class GitHubActionsService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('✅ GitHubActionsService initialized');
  }

  isReady(): boolean {
    return this.initialized && gitHubService.isConfigured();
  }

  // ============================================================================
  // WORKFLOW DISPATCH - Trigger workflows
  // ============================================================================

  /**
   * Trigger a GitHub Actions workflow
   *
   * @example
   * await githubActionsService.triggerWorkflow({
   *   owner: 'myorg',
   *   repo: 'myrepo',
   *   workflowId: 'deploy.yml',
   *   ref: 'main',
   *   inputs: {
   *     environment: 'production',
   *     version: '1.2.3'
   *   }
   * });
   */
  async triggerWorkflow(options: TriggerWorkflowOptions): Promise<{
    success: boolean;
    message: string;
    runUrl?: string;
  }> {
    if (!gitHubService.isConfigured()) {
      throw new Error('GitHub integration not configured');
    }

    const { owner, repo, workflowId, ref = 'main', inputs = {} } = options;

    try {
      // Trigger workflow dispatch
      const response = await (gitHubService as any).request(
        `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
        {
          method: 'POST',
          body: JSON.stringify({
            ref,
            inputs,
          }),
        }
      );

      console.log(`[GitHubActions] Triggered workflow ${workflowId} on ${owner}/${repo}@${ref}`);

      // GitHub returns 204 No Content on success
      // We need to fetch the latest run to get the URL
      const latestRun = await this.getLatestWorkflowRun(owner, repo, workflowId);

      return {
        success: true,
        message: `Workflow ${workflowId} triggered successfully`,
        runUrl: latestRun?.html_url,
      };
    } catch (error) {
      console.error('[GitHubActions] Failed to trigger workflow:', error);
      return {
        success: false,
        message: `Failed to trigger workflow: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get the latest workflow run for a specific workflow
   */
  async getLatestWorkflowRun(
    owner: string,
    repo: string,
    workflowId: string | number
  ): Promise<WorkflowRun | null> {
    try {
      const response = await (gitHubService as any).request<{ workflow_runs: WorkflowRun[] }>(
        `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=1`
      );

      return response.workflow_runs[0] || null;
    } catch (error) {
      console.error('[GitHubActions] Failed to get latest run:', error);
      return null;
    }
  }

  /**
   * List all workflows in a repository
   */
  async listWorkflows(owner: string, repo: string): Promise<Workflow[]> {
    try {
      const response = await (gitHubService as any).request<{ workflows: Workflow[] }>(
        `/repos/${owner}/${repo}/actions/workflows`
      );

      return response.workflows.filter((w) => w.state === 'active');
    } catch (error) {
      console.error('[GitHubActions] Failed to list workflows:', error);
      return [];
    }
  }

  /**
   * Get workflow run status
   */
  async getWorkflowRun(owner: string, repo: string, runId: number): Promise<WorkflowRun | null> {
    try {
      return await (gitHubService as any).request<WorkflowRun>(
        `/repos/${owner}/${repo}/actions/runs/${runId}`
      );
    } catch (error) {
      console.error('[GitHubActions] Failed to get workflow run:', error);
      return null;
    }
  }

  /**
   * Cancel a workflow run
   */
  async cancelWorkflowRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      await (gitHubService as any).request(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, {
        method: 'POST',
      });

      return {
        success: true,
        message: `Workflow run ${runId} cancelled`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to cancel run: ${(error as Error).message}`,
      };
    }
  }

  // ============================================================================
  // @CLAUDE COMMAND PARSING
  // ============================================================================

  /**
   * Parse @claude command from issue comment
   *
   * Supported formats:
   * - @claude deploy
   * - @claude run deploy.yml
   * - @claude run deploy.yml --ref staging --env=production
   * - @claude run deploy.yml environment=production version=1.2.3
   */
  parseCommand(comment: string): CommandParseResult | null {
    // Match @claude followed by command
    const mentionRegex = /@claude\s+(.+)/i;
    const match = comment.match(mentionRegex);

    if (!match) {
      return null;
    }

    const commandText = match[1].trim();

    // Simple command: @claudecode deploy
    if (!commandText.includes(' ') && !commandText.includes('--')) {
      return {
        command: commandText,
        workflow: `${commandText}.yml`,
      };
    }

    // Parse complex command
    const parts = commandText.split(/\s+/);
    const command = parts[0];

    const result: CommandParseResult = {
      command,
      inputs: {},
    };

    // If first word is "run", second word is the workflow
    if (command === 'run' && parts.length > 1) {
      result.workflow = parts[1];
      parts.splice(0, 2); // Remove 'run' and workflow name
    } else {
      result.workflow = `${command}.yml`;
      parts.splice(0, 1); // Remove command
    }

    // Parse remaining arguments
    for (const part of parts) {
      // --ref staging
      if (part.startsWith('--ref=') || part.startsWith('--branch=')) {
        result.ref = part.split('=')[1];
      } else if (part === '--ref' || part === '--branch') {
        const nextIndex = parts.indexOf(part) + 1;
        if (nextIndex < parts.length) {
          result.ref = parts[nextIndex];
        }
      }
      // key=value inputs
      else if (part.includes('=')) {
        const [key, value] = part.split('=');
        if (key && value && result.inputs) {
          result.inputs[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Handle @claude mention from issue comment
   */
  async handleMentionCommand(
    owner: string,
    repo: string,
    issueNumber: number,
    comment: string,
    commentId: number
  ): Promise<{
    success: boolean;
    message: string;
    workflowRun?: WorkflowRun;
  }> {
    const parsed = this.parseCommand(comment);

    if (!parsed || !parsed.workflow) {
      return {
        success: false,
        message: 'Invalid @claude command',
      };
    }

    console.log(`[GitHubActions] Parsed command:`, parsed);

    // Add issue context to inputs
    const inputs = {
      ...(parsed.inputs || {}),
      issue_number: String(issueNumber),
      triggered_by: 'claudecode',
      comment_id: String(commentId),
    };

    // Trigger the workflow
    const result = await this.triggerWorkflow({
      owner,
      repo,
      workflowId: parsed.workflow,
      ref: parsed.ref,
      inputs,
    });

    // Get the workflow run
    const workflowRun = result.runUrl
      ? await this.getLatestWorkflowRun(owner, repo, parsed.workflow)
      : null;

    return {
      success: result.success,
      message: result.message,
      workflowRun: workflowRun || undefined,
    };
  }

  /**
   * Post a response comment to the issue
   */
  async postResponseComment(
    owner: string,
    repo: string,
    issueNumber: number,
    result: {
      success: boolean;
      message: string;
      workflowRun?: WorkflowRun;
    }
  ): Promise<void> {
    const emoji = result.success ? '✅' : '❌';
    const statusEmoji = result.workflowRun?.status === 'queued' ? '⏳' : '🔄';

    let comment = `${emoji} **ClaudeCode Response**\n\n${result.message}`;

    if (result.workflowRun) {
      comment += `\n\n${statusEmoji} **Workflow Run:** [${result.workflowRun.name} #${result.workflowRun.id}](${result.workflowRun.html_url})`;
      comment += `\n**Status:** ${result.workflowRun.status}`;
      if (result.workflowRun.conclusion) {
        comment += ` (${result.workflowRun.conclusion})`;
      }
    }

    comment += `\n\n---\n_Automated by [Claude](https://dispotree.com)_`;

    try {
      await gitHubService.createIssueComment(owner, repo, issueNumber, comment);
      console.log(`[GitHubActions] Posted response comment to issue #${issueNumber}`);
    } catch (error) {
      console.error('[GitHubActions] Failed to post response comment:', error);
    }
  }
}

export const githubActionsService = new GitHubActionsService();
export { GitHubActionsService, TriggerWorkflowOptions, WorkflowRun, Workflow, CommandParseResult };
