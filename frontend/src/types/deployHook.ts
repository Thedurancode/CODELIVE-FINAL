/**
 * Deploy Hook Types
 *
 * Types for Vercel/Netlify/custom deploy hook management.
 */

// Supported providers
export type DeployHookProvider = 'vercel' | 'netlify' | 'custom';

// Events that can trigger a deployment
export type DeployTrigger = 'task_completed' | 'pr_merged' | 'manual';

// Target environments
export type DeployEnvironment = 'preview' | 'production';

// Hook status
export type DeployHookStatus = 'active' | 'inactive';

// Last deployment status
export type DeployExecutionStatus = 'success' | 'failure' | 'pending';

// Provider-specific configuration
export interface ProviderConfig {
  // Vercel
  vercelProjectId?: string;
  vercelTeamId?: string;
  // Netlify
  netlifySiteId?: string;
  // Custom
  customMethod?: 'GET' | 'POST' | 'PUT';
  customHeaders?: Record<string, string>;
}

// Main DeployHook entity
export interface DeployHook {
  id: string;
  projectId: string;
  organizationId: string;
  createdById: string | null;

  // Configuration
  name: string;
  provider: DeployHookProvider;
  webhookUrl: string;
  environment: DeployEnvironment;
  status: DeployHookStatus;
  triggers: DeployTrigger[];
  branchFilter: string | null;
  labelFilter: string | null;
  providerConfig: ProviderConfig;

  // Statistics
  lastTriggeredAt: string | null;
  lastDeployStatus: DeployExecutionStatus | null;
  lastDeployUrl: string | null;
  totalDeploys: number;
  successfulDeploys: number;
  failedDeploys: number;
  successRate: number;
  consecutiveFailures: number;
  lastError: string | null;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Create hook options
export interface CreateDeployHookOptions {
  projectId: string;
  name: string;
  provider: DeployHookProvider;
  webhookUrl: string;
  environment?: DeployEnvironment;
  triggers?: DeployTrigger[];
  branchFilter?: string;
  labelFilter?: string;
  providerConfig?: ProviderConfig;
}

// Update hook options
export interface UpdateDeployHookOptions {
  name?: string;
  webhookUrl?: string;
  environment?: DeployEnvironment;
  status?: DeployHookStatus;
  triggers?: DeployTrigger[];
  branchFilter?: string | null;
  labelFilter?: string | null;
  providerConfig?: ProviderConfig;
}

// Deployment result
export interface DeploymentResult {
  success: boolean;
  deploymentId?: string;
  deploymentUrl?: string;
  error?: string;
  provider: DeployHookProvider;
}

// Project deploy statistics
export interface DeployProjectStats {
  totalHooks: number;
  activeHooks: number;
  totalDeploys: number;
  successfulDeploys: number;
  failedDeploys: number;
  overallSuccessRate: number;
}

// Test hook result
export interface TestHookResult {
  success: boolean;
  message: string;
}

// Provider labels for UI
export const PROVIDER_LABELS: Record<DeployHookProvider, string> = {
  vercel: 'Vercel',
  netlify: 'Netlify',
  custom: 'Custom Webhook',
};

// Provider colors for UI
export const PROVIDER_COLORS: Record<DeployHookProvider, string> = {
  vercel: 'bg-black',
  netlify: 'bg-teal-500',
  custom: 'bg-purple-500',
};

// Trigger labels for UI
export const TRIGGER_LABELS: Record<DeployTrigger, string> = {
  task_completed: 'Task Completed',
  pr_merged: 'PR Merged',
  manual: 'Manual',
};

// Environment labels for UI
export const ENVIRONMENT_LABELS: Record<DeployEnvironment, string> = {
  preview: 'Preview',
  production: 'Production',
};

// Status labels for UI
export const STATUS_LABELS: Record<DeployHookStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
};

// Execution status labels for UI
export const EXECUTION_STATUS_LABELS: Record<DeployExecutionStatus, string> = {
  success: 'Success',
  failure: 'Failed',
  pending: 'Pending',
};

// Execution status colors for UI
export const EXECUTION_STATUS_COLORS: Record<DeployExecutionStatus, string> = {
  success: 'bg-green-500',
  failure: 'bg-red-500',
  pending: 'bg-yellow-500',
};
