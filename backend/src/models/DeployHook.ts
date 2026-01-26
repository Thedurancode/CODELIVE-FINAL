/**
 * DeployHook Model
 *
 * Stores deploy webhook configurations for triggering deployments
 * on Vercel, Netlify, or custom endpoints when tasks complete.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Deploy hook provider types
export type DeployHookProvider = 'vercel' | 'netlify' | 'custom';

// Deploy hook status
export type DeployHookStatus = 'active' | 'inactive' | 'error';

// Trigger conditions
export type DeployTrigger = 'task_completed' | 'pr_merged' | 'manual';

// Environment targets
export type DeployEnvironment = 'preview' | 'production';

// Deploy execution status
export type DeployExecutionStatus = 'pending' | 'building' | 'success' | 'failed' | 'cancelled';

// Provider-specific configuration
interface ProviderConfig {
  // Vercel
  vercelProjectId?: string;
  vercelTeamId?: string;
  // Netlify
  netlifySiteId?: string;
  // Custom
  customHeaders?: Record<string, string>;
  customMethod?: 'POST' | 'GET';
}

// Deploy hook attributes
interface DeployHookAttributes {
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

  // Trigger settings
  triggers: DeployTrigger[];
  branchFilter: string | null; // e.g., 'main' or 'main,develop' or '*'
  labelFilter: string | null; // Only trigger for tasks with specific labels

  // Provider-specific config
  providerConfig: ProviderConfig;

  // Statistics
  lastTriggeredAt: Date | null;
  lastDeployStatus: DeployExecutionStatus | null;
  lastDeployUrl: string | null;
  totalDeploys: number;
  successfulDeploys: number;
  failedDeploys: number;

  // Error tracking
  lastError: string | null;
  consecutiveFailures: number;

  createdAt: Date;
  updatedAt: Date;
}

// Creation attributes - mark optional fields
interface DeployHookCreationAttributes
  extends Optional<
    DeployHookAttributes,
    | 'id'
    | 'createdById'
    | 'status'
    | 'branchFilter'
    | 'labelFilter'
    | 'providerConfig'
    | 'lastTriggeredAt'
    | 'lastDeployStatus'
    | 'lastDeployUrl'
    | 'totalDeploys'
    | 'successfulDeploys'
    | 'failedDeploys'
    | 'lastError'
    | 'consecutiveFailures'
    | 'createdAt'
    | 'updatedAt'
  > {}

/**
 * DeployHook model class
 */
class DeployHook
  extends Model<DeployHookAttributes, DeployHookCreationAttributes>
  implements DeployHookAttributes
{
  declare id: string;
  declare projectId: string;
  declare organizationId: string;
  declare createdById: string | null;

  declare name: string;
  declare provider: DeployHookProvider;
  declare webhookUrl: string;
  declare environment: DeployEnvironment;
  declare status: DeployHookStatus;

  declare triggers: DeployTrigger[];
  declare branchFilter: string | null;
  declare labelFilter: string | null;

  declare providerConfig: ProviderConfig;

  declare lastTriggeredAt: Date | null;
  declare lastDeployStatus: DeployExecutionStatus | null;
  declare lastDeployUrl: string | null;
  declare totalDeploys: number;
  declare successfulDeploys: number;
  declare failedDeploys: number;

  declare lastError: string | null;
  declare consecutiveFailures: number;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields for associations
  declare project?: {
    id: string;
    title: string;
    githubRepoUrl?: string;
  };

  declare createdBy?: {
    id: string;
    name?: string;
    email?: string;
  };

  // ============================================================================
  // STATIC METHODS
  // ============================================================================

  /**
   * Get all hooks for a project
   */
  static async getByProject(projectId: string) {
    return this.findAll({
      where: { projectId },
      order: [['name', 'ASC']],
    });
  }

  /**
   * Get active hooks for a project that match a trigger type
   */
  static async getActiveHooksForTrigger(
    projectId: string,
    trigger: DeployTrigger,
    branchName?: string
  ) {
    const hooks = await this.findAll({
      where: {
        projectId,
        status: 'active',
      },
    });

    return hooks.filter((hook) => {
      // Check if trigger matches
      if (!hook.triggers.includes(trigger)) {
        return false;
      }

      // Check branch filter if provided
      if (branchName && hook.branchFilter) {
        const allowedBranches = hook.branchFilter.split(',').map((b) => b.trim());
        if (!allowedBranches.includes('*') && !allowedBranches.includes(branchName)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get hooks by organization
   */
  static async getByOrganization(organizationId: string) {
    return this.findAll({
      where: { organizationId },
      order: [['updatedAt', 'DESC']],
    });
  }

  // ============================================================================
  // INSTANCE METHODS
  // ============================================================================

  /**
   * Check if hook is active
   */
  isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Check if hook should be disabled due to consecutive failures
   */
  shouldAutoDisable(): boolean {
    return this.consecutiveFailures >= 5;
  }

  /**
   * Record a successful deploy
   */
  async recordSuccess(deployUrl?: string) {
    await this.update({
      lastTriggeredAt: new Date(),
      lastDeployStatus: 'success',
      lastDeployUrl: deployUrl || null,
      totalDeploys: this.totalDeploys + 1,
      successfulDeploys: this.successfulDeploys + 1,
      consecutiveFailures: 0,
      lastError: null,
    });
  }

  /**
   * Record a failed deploy
   */
  async recordFailure(error: string) {
    const newConsecutiveFailures = this.consecutiveFailures + 1;
    const shouldDisable = newConsecutiveFailures >= 5;

    await this.update({
      lastTriggeredAt: new Date(),
      lastDeployStatus: 'failed',
      totalDeploys: this.totalDeploys + 1,
      failedDeploys: this.failedDeploys + 1,
      consecutiveFailures: newConsecutiveFailures,
      lastError: error,
      status: shouldDisable ? 'error' : this.status,
    });
  }

  /**
   * Get success rate as percentage
   */
  getSuccessRate(): number {
    if (this.totalDeploys === 0) return 100;
    return Math.round((this.successfulDeploys / this.totalDeploys) * 100);
  }
}

// Initialize model
DeployHook.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    projectId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'project_id',
      references: {
        model: 'projects',
        key: 'id',
      },
      onDelete: 'CASCADE',
      comment: 'Project this hook belongs to',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
      comment: 'Organization for access control',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'User who created this hook',
    },

    // Configuration
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Display name for the hook',
    },
    provider: {
      type: DataTypes.ENUM('vercel', 'netlify', 'custom'),
      allowNull: false,
      comment: 'Deploy provider type',
    },
    webhookUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'webhook_url',
      comment: 'Deploy hook URL (encrypted in production)',
    },
    environment: {
      type: DataTypes.ENUM('preview', 'production'),
      allowNull: false,
      defaultValue: 'preview',
      comment: 'Target deployment environment',
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'error'),
      allowNull: false,
      defaultValue: 'active',
      comment: 'Hook status',
    },

    // Trigger settings
    triggers: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: ['task_completed'],
      comment: 'Events that trigger this hook',
    },
    branchFilter: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'branch_filter',
      comment: 'Comma-separated branch names or * for all',
    },
    labelFilter: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'label_filter',
      comment: 'Only trigger for tasks with specific labels',
    },

    // Provider config
    providerConfig: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'provider_config',
      comment: 'Provider-specific configuration',
    },

    // Statistics
    lastTriggeredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_triggered_at',
      comment: 'When this hook was last triggered',
    },
    lastDeployStatus: {
      type: DataTypes.ENUM('pending', 'building', 'success', 'failed', 'cancelled'),
      allowNull: true,
      field: 'last_deploy_status',
      comment: 'Status of the last deployment',
    },
    lastDeployUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_deploy_url',
      comment: 'URL of the last deployment',
    },
    totalDeploys: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_deploys',
      comment: 'Total number of deploys triggered',
    },
    successfulDeploys: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'successful_deploys',
      comment: 'Number of successful deploys',
    },
    failedDeploys: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'failed_deploys',
      comment: 'Number of failed deploys',
    },

    // Error tracking
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error',
      comment: 'Last error message',
    },
    consecutiveFailures: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'consecutive_failures',
      comment: 'Number of consecutive failures (auto-disables at 5)',
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'deploy_hooks',
    modelName: 'DeployHook',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['organization_id'] },
      { fields: ['status'] },
      { fields: ['created_by_id'] },
      { fields: ['provider'] },
      { fields: ['project_id', 'status'] },
      { fields: ['triggers'], using: 'gin' },
    ],
  }
);

export default DeployHook;
export {
  DeployHookAttributes,
  DeployHookCreationAttributes,
  DeployHookProvider,
  DeployHookStatus,
  DeployTrigger,
  DeployEnvironment,
  DeployExecutionStatus,
  ProviderConfig,
};
