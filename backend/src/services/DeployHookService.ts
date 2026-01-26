/**
 * DeployHookService
 *
 * Service for managing deploy hooks and triggering deployments
 * on Vercel, Netlify, or custom endpoints.
 */

import DeployHook, {
  DeployHookProvider,
  DeployTrigger,
  DeployEnvironment,
  DeployExecutionStatus,
  ProviderConfig,
} from '../models/DeployHook';

// Deployment result from provider
interface DeploymentResult {
  success: boolean;
  deploymentId?: string;
  deploymentUrl?: string;
  error?: string;
  provider: DeployHookProvider;
}

// Deploy hook creation options
interface CreateDeployHookOptions {
  projectId: string;
  organizationId: string;
  createdById?: string;
  name: string;
  provider: DeployHookProvider;
  webhookUrl: string;
  environment?: DeployEnvironment;
  triggers?: DeployTrigger[];
  branchFilter?: string;
  labelFilter?: string;
  providerConfig?: ProviderConfig;
}

// Deploy hook update options
interface UpdateDeployHookOptions {
  name?: string;
  webhookUrl?: string;
  environment?: DeployEnvironment;
  status?: 'active' | 'inactive';
  triggers?: DeployTrigger[];
  branchFilter?: string | null;
  labelFilter?: string | null;
  providerConfig?: ProviderConfig;
}

// Trigger deploy options
interface TriggerDeployOptions {
  projectId: string;
  trigger: DeployTrigger;
  branchName?: string;
  taskId?: string;
  taskTitle?: string;
  commitSha?: string;
  prNumber?: number;
}

class DeployHookService {
  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  /**
   * Create a new deploy hook
   */
  async createHook(options: CreateDeployHookOptions): Promise<DeployHook> {
    const hook = await DeployHook.create({
      projectId: options.projectId,
      organizationId: options.organizationId,
      createdById: options.createdById || null,
      name: options.name,
      provider: options.provider,
      webhookUrl: options.webhookUrl,
      environment: options.environment || 'preview',
      triggers: options.triggers || ['task_completed'],
      branchFilter: options.branchFilter || null,
      labelFilter: options.labelFilter || null,
      providerConfig: options.providerConfig || {},
    });

    console.log(`[DeployHookService] Created hook "${hook.name}" for project ${hook.projectId}`);
    return hook;
  }

  /**
   * Get a hook by ID
   */
  async getHook(hookId: string): Promise<DeployHook | null> {
    return DeployHook.findByPk(hookId);
  }

  /**
   * Get all hooks for a project
   */
  async getHooksByProject(projectId: string): Promise<DeployHook[]> {
    return DeployHook.getByProject(projectId);
  }

  /**
   * Get all hooks for an organization
   */
  async getHooksByOrganization(organizationId: string): Promise<DeployHook[]> {
    return DeployHook.getByOrganization(organizationId);
  }

  /**
   * Update a hook
   */
  async updateHook(hookId: string, updates: UpdateDeployHookOptions): Promise<DeployHook | null> {
    const hook = await DeployHook.findByPk(hookId);
    if (!hook) return null;

    await hook.update(updates);
    console.log(`[DeployHookService] Updated hook "${hook.name}"`);
    return hook;
  }

  /**
   * Delete a hook
   */
  async deleteHook(hookId: string): Promise<boolean> {
    const hook = await DeployHook.findByPk(hookId);
    if (!hook) return false;

    await hook.destroy();
    console.log(`[DeployHookService] Deleted hook "${hook.name}"`);
    return true;
  }

  /**
   * Toggle hook status
   */
  async toggleHook(hookId: string): Promise<DeployHook | null> {
    const hook = await DeployHook.findByPk(hookId);
    if (!hook) return null;

    const newStatus = hook.status === 'active' ? 'inactive' : 'active';
    await hook.update({ status: newStatus, consecutiveFailures: 0, lastError: null });
    console.log(`[DeployHookService] Toggled hook "${hook.name}" to ${newStatus}`);
    return hook;
  }

  // ============================================================================
  // DEPLOYMENT TRIGGERS
  // ============================================================================

  /**
   * Trigger deployments for a project based on an event
   */
  async triggerDeploy(options: TriggerDeployOptions): Promise<DeploymentResult[]> {
    const { projectId, trigger, branchName, taskId, taskTitle, commitSha, prNumber } = options;

    // Find active hooks that match the trigger
    const hooks = await DeployHook.getActiveHooksForTrigger(projectId, trigger, branchName);

    if (hooks.length === 0) {
      console.log(`[DeployHookService] No active hooks for trigger "${trigger}" in project ${projectId}`);
      return [];
    }

    console.log(`[DeployHookService] Triggering ${hooks.length} hook(s) for "${trigger}"`);

    // Execute all hooks in parallel
    const results = await Promise.all(
      hooks.map((hook) =>
        this.executeHook(hook, {
          trigger,
          branchName,
          taskId,
          taskTitle,
          commitSha,
          prNumber,
        })
      )
    );

    return results;
  }

  /**
   * Execute a single deploy hook
   */
  private async executeHook(
    hook: DeployHook,
    context: {
      trigger: DeployTrigger;
      branchName?: string;
      taskId?: string;
      taskTitle?: string;
      commitSha?: string;
      prNumber?: number;
    }
  ): Promise<DeploymentResult> {
    console.log(`[DeployHookService] Executing hook "${hook.name}" (${hook.provider})`);

    try {
      let result: DeploymentResult;

      switch (hook.provider) {
        case 'vercel':
          result = await this.triggerVercel(hook, context);
          break;
        case 'netlify':
          result = await this.triggerNetlify(hook, context);
          break;
        case 'custom':
          result = await this.triggerCustom(hook, context);
          break;
        default:
          result = {
            success: false,
            error: `Unknown provider: ${hook.provider}`,
            provider: hook.provider,
          };
      }

      // Record success or failure
      if (result.success) {
        await hook.recordSuccess(result.deploymentUrl);
        console.log(`[DeployHookService] Hook "${hook.name}" triggered successfully`);
      } else {
        await hook.recordFailure(result.error || 'Unknown error');
        console.error(`[DeployHookService] Hook "${hook.name}" failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      await hook.recordFailure(errorMessage);
      console.error(`[DeployHookService] Hook "${hook.name}" error:`, error);

      return {
        success: false,
        error: errorMessage,
        provider: hook.provider,
      };
    }
  }

  /**
   * Trigger Vercel deployment
   */
  private async triggerVercel(
    hook: DeployHook,
    context: { trigger: DeployTrigger; branchName?: string; taskId?: string; taskTitle?: string }
  ): Promise<DeploymentResult> {
    try {
      // Vercel deploy hooks are simple POST requests
      const response = await fetch(hook.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Vercel accepts metadata in the request body
          meta: {
            trigger: context.trigger,
            taskId: context.taskId,
            taskTitle: context.taskTitle,
            deployedBy: 'CodeLive Sprite',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Vercel returned ${response.status}: ${errorText}`,
          provider: 'vercel',
        };
      }

      const data = await response.json();

      return {
        success: true,
        deploymentId: data.id || data.job?.id,
        deploymentUrl: data.url || undefined,
        provider: 'vercel',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        provider: 'vercel',
      };
    }
  }

  /**
   * Trigger Netlify deployment
   */
  private async triggerNetlify(
    hook: DeployHook,
    context: { trigger: DeployTrigger; branchName?: string; taskId?: string; taskTitle?: string }
  ): Promise<DeploymentResult> {
    try {
      // Netlify build hooks support trigger_title and trigger_branch params
      const url = new URL(hook.webhookUrl);

      if (context.taskTitle) {
        url.searchParams.set('trigger_title', `[CodeLive] ${context.taskTitle}`);
      }

      if (context.branchName) {
        url.searchParams.set('trigger_branch', context.branchName);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Netlify returned ${response.status}: ${errorText}`,
          provider: 'netlify',
        };
      }

      // Netlify returns empty body on success for build hooks
      // We consider 2xx as success
      return {
        success: true,
        provider: 'netlify',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        provider: 'netlify',
      };
    }
  }

  /**
   * Trigger custom webhook
   */
  private async triggerCustom(
    hook: DeployHook,
    context: {
      trigger: DeployTrigger;
      branchName?: string;
      taskId?: string;
      taskTitle?: string;
      commitSha?: string;
      prNumber?: number;
    }
  ): Promise<DeploymentResult> {
    try {
      const config = hook.providerConfig;
      const method = config.customMethod || 'POST';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...config.customHeaders,
      };

      const body = {
        event: context.trigger,
        timestamp: new Date().toISOString(),
        project: {
          id: hook.projectId,
        },
        task: context.taskId
          ? {
              id: context.taskId,
              title: context.taskTitle,
            }
          : undefined,
        git: {
          branch: context.branchName,
          commit: context.commitSha,
          prNumber: context.prNumber,
        },
        environment: hook.environment,
        source: 'codelive-sprite',
      };

      const response = await fetch(hook.webhookUrl, {
        method,
        headers,
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Custom webhook returned ${response.status}: ${errorText}`,
          provider: 'custom',
        };
      }

      // Try to parse response for deployment info
      try {
        const data = await response.json();
        return {
          success: true,
          deploymentId: data.id || data.deploymentId,
          deploymentUrl: data.url || data.deploymentUrl,
          provider: 'custom',
        };
      } catch {
        // Response wasn't JSON, still consider it success
        return {
          success: true,
          provider: 'custom',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        provider: 'custom',
      };
    }
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Trigger deploy when a task is completed
   */
  async onTaskCompleted(options: {
    projectId: string;
    taskId: string;
    taskTitle: string;
    branchName?: string;
  }): Promise<DeploymentResult[]> {
    return this.triggerDeploy({
      projectId: options.projectId,
      trigger: 'task_completed',
      taskId: options.taskId,
      taskTitle: options.taskTitle,
      branchName: options.branchName,
    });
  }

  /**
   * Trigger deploy when a PR is merged
   */
  async onPRMerged(options: {
    projectId: string;
    taskId?: string;
    taskTitle?: string;
    branchName: string;
    commitSha?: string;
    prNumber: number;
  }): Promise<DeploymentResult[]> {
    return this.triggerDeploy({
      projectId: options.projectId,
      trigger: 'pr_merged',
      taskId: options.taskId,
      taskTitle: options.taskTitle,
      branchName: options.branchName,
      commitSha: options.commitSha,
      prNumber: options.prNumber,
    });
  }

  /**
   * Manually trigger a specific hook
   */
  async triggerManually(hookId: string): Promise<DeploymentResult> {
    const hook = await DeployHook.findByPk(hookId);
    if (!hook) {
      return {
        success: false,
        error: 'Hook not found',
        provider: 'custom',
      };
    }

    return this.executeHook(hook, {
      trigger: 'manual',
    });
  }

  /**
   * Test a hook configuration without recording results
   */
  async testHook(hookId: string): Promise<{ success: boolean; message: string }> {
    const hook = await DeployHook.findByPk(hookId);
    if (!hook) {
      return { success: false, message: 'Hook not found' };
    }

    try {
      // Just check if the URL is reachable with a HEAD request
      const response = await fetch(hook.webhookUrl, {
        method: 'HEAD',
      });

      if (response.ok || response.status === 405) {
        // 405 Method Not Allowed is fine - it means the endpoint exists
        return { success: true, message: 'Webhook endpoint is reachable' };
      }

      return {
        success: false,
        message: `Endpoint returned status ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to reach endpoint: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get deployment statistics for a project
   */
  async getProjectStats(projectId: string): Promise<{
    totalHooks: number;
    activeHooks: number;
    totalDeploys: number;
    successfulDeploys: number;
    failedDeploys: number;
    overallSuccessRate: number;
  }> {
    const hooks = await DeployHook.getByProject(projectId);

    const stats = hooks.reduce(
      (acc, hook) => ({
        totalHooks: acc.totalHooks + 1,
        activeHooks: acc.activeHooks + (hook.status === 'active' ? 1 : 0),
        totalDeploys: acc.totalDeploys + hook.totalDeploys,
        successfulDeploys: acc.successfulDeploys + hook.successfulDeploys,
        failedDeploys: acc.failedDeploys + hook.failedDeploys,
      }),
      {
        totalHooks: 0,
        activeHooks: 0,
        totalDeploys: 0,
        successfulDeploys: 0,
        failedDeploys: 0,
      }
    );

    return {
      ...stats,
      overallSuccessRate:
        stats.totalDeploys > 0
          ? Math.round((stats.successfulDeploys / stats.totalDeploys) * 100)
          : 100,
    };
  }
}

export const deployHookService = new DeployHookService();
export default deployHookService;
export type {
  CreateDeployHookOptions,
  UpdateDeployHookOptions,
  TriggerDeployOptions,
  DeploymentResult,
};
