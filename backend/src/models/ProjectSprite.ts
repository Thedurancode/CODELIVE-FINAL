/**
 * ProjectSprite Model
 *
 * Links Projects to Sprites (persistent Linux environments from sprites.dev).
 * Each project can have associated Sprites with checkpoints, sessions, and Claude Code.
 * Organization-scoped for team collaboration.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

// Sprite status options
export type SpriteStatus =
  | 'creating' // Sprite being created via API
  | 'initializing' // Running init script (cloning, setting up Claude)
  | 'running' // Sprite is active and ready
  | 'hibernating' // Sprite is hibernating (auto after inactivity)
  | 'stopped' // Sprite stopped by user
  | 'checkpointing' // Creating a checkpoint
  | 'restoring' // Restoring from checkpoint
  | 'error' // Error state
  | 'deleted'; // Soft deleted

// URL settings from Sprites API
export interface SpriteUrlSettings {
  url?: string; // Main sprite URL
  auth?: 'sprite' | 'public';
}

interface ProjectSpriteAttributes {
  id: string;
  projectId: string;
  organizationId: string;

  // Sprites API identifiers
  spriteName: string; // Unique name for the sprite in Sprites API
  spriteId: string | null; // ID returned from Sprites API

  // Status
  status: SpriteStatus;
  statusMessage: string | null;
  errorMessage: string | null;

  // Configuration
  repoUrl: string;
  branch: string;
  featureBranch: string | null; // Auto-created feature branch for sprite work
  workingDirectory: string;
  claudeConfigured: boolean;
  anthropicApiKeyConfigured: boolean;
  githubConfigured: boolean;

  // Task automation settings
  autoShutdownAfterTask: boolean;

  // Resource info from Sprites API
  urlSettings: SpriteUrlSettings | null;

  // Checkpoints
  lastCheckpointId: string | null;
  lastCheckpointAt: Date | null;
  checkpointCount: number;

  // Audit
  createdById: string | null;
  lastAccessedAt: Date | null;
  lastAccessedById: string | null;

  // Runtime tracking
  totalRuntimeSeconds: number;
  sessionCount: number;
  lastStartedAt: Date | null;
  currentSessionId: string | null;

  // Shell session persistence
  lastShellDirectory: string | null; // Last working directory in the shell
  startupCommand: string | null; // Command to run on terminal connect (e.g., "npm run dev")
  tmuxSessionName: string | null; // Name of the tmux session for persistent terminal

  // MCP (Model Context Protocol) settings
  mcpEnabled: boolean; // Whether MCP server is enabled
  mcpPort: number | null; // Port the MCP server is listening on
  mcpInstalledAt: Date | null; // When MCP server was installed

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectSpriteCreationAttributes
  extends Optional<
    ProjectSpriteAttributes,
    | 'id'
    | 'spriteId'
    | 'status'
    | 'statusMessage'
    | 'errorMessage'
    | 'branch'
    | 'featureBranch'
    | 'workingDirectory'
    | 'claudeConfigured'
    | 'anthropicApiKeyConfigured'
    | 'githubConfigured'
    | 'autoShutdownAfterTask'
    | 'urlSettings'
    | 'lastCheckpointId'
    | 'lastCheckpointAt'
    | 'checkpointCount'
    | 'createdById'
    | 'lastAccessedAt'
    | 'lastAccessedById'
    | 'totalRuntimeSeconds'
    | 'sessionCount'
    | 'lastStartedAt'
    | 'currentSessionId'
    | 'lastShellDirectory'
    | 'startupCommand'
    | 'tmuxSessionName'
    | 'mcpEnabled'
    | 'mcpPort'
    | 'mcpInstalledAt'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ProjectSprite
  extends Model<ProjectSpriteAttributes, ProjectSpriteCreationAttributes>
  implements ProjectSpriteAttributes
{
  declare id: string;
  declare projectId: string;
  declare organizationId: string;

  declare spriteName: string;
  declare spriteId: string | null;

  declare status: SpriteStatus;
  declare statusMessage: string | null;
  declare errorMessage: string | null;

  declare repoUrl: string;
  declare branch: string;
  declare featureBranch: string | null;
  declare workingDirectory: string;
  declare claudeConfigured: boolean;
  declare anthropicApiKeyConfigured: boolean;
  declare githubConfigured: boolean;
  declare autoShutdownAfterTask: boolean;

  declare urlSettings: SpriteUrlSettings | null;

  declare lastCheckpointId: string | null;
  declare lastCheckpointAt: Date | null;
  declare checkpointCount: number;

  declare createdById: string | null;
  declare lastAccessedAt: Date | null;
  declare lastAccessedById: string | null;

  declare totalRuntimeSeconds: number;
  declare sessionCount: number;
  declare lastStartedAt: Date | null;
  declare currentSessionId: string | null;
  declare lastShellDirectory: string | null;
  declare startupCommand: string | null;
  declare tmuxSessionName: string | null;
  declare mcpEnabled: boolean;
  declare mcpPort: number | null;
  declare mcpInstalledAt: Date | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields populated by associations
  declare project?: {
    id: string;
    title: string;
    githubUrl?: string;
  };

  declare createdBy?: {
    id: string;
    name?: string;
    email?: string;
  };

  // Static helper methods
  static async getByProject(projectId: string): Promise<ProjectSprite | null> {
    return this.findOne({
      where: { projectId, status: { [Op.ne]: 'deleted' } },
      order: [['updatedAt', 'DESC']],
    });
  }

  static async getByOrganization(organizationId: string, includeDeleted = false) {
    const where: Record<string, unknown> = { organizationId };
    if (!includeDeleted) {
      where.status = { [Op.ne]: 'deleted' };
    }
    return this.findAll({
      where,
      order: [['updatedAt', 'DESC']],
    });
  }

  static async getActiveSprites(organizationId: string) {
    return this.findAll({
      where: {
        organizationId,
        status: ['running', 'initializing', 'restoring'],
      },
      order: [['lastAccessedAt', 'DESC']],
    });
  }

  static async getBySpriteName(spriteName: string): Promise<ProjectSprite | null> {
    return this.findOne({
      where: { spriteName },
    });
  }

  /**
   * Check if sprite is in a terminal state
   */
  isTerminalState(): boolean {
    return ['deleted', 'error'].includes(this.status);
  }

  /**
   * Check if sprite is active (actually running and accepting commands)
   * Hibernating sprites are NOT active - they need to be resumed first
   */
  isActive(): boolean {
    return ['running', 'initializing', 'restoring'].includes(this.status);
  }

  /**
   * Check if sprite can be resumed
   */
  canResume(): boolean {
    return ['stopped', 'hibernating', 'error'].includes(this.status);
  }

  /**
   * Get sprite URL for web access
   */
  getSpriteUrl(): string | null {
    return this.urlSettings?.url || null;
  }

  /**
   * Get total runtime formatted as human-readable string
   */
  getFormattedRuntime(): string {
    const seconds = this.totalRuntimeSeconds || 0;
    if (seconds < 60) {
      return `${seconds}s`;
    }
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  /**
   * Get current session runtime (if active)
   * Returns seconds since last started, or 0 if not active
   */
  getCurrentSessionRuntime(): number {
    if (!this.lastStartedAt || !this.currentSessionId) {
      return 0;
    }
    return Math.floor((Date.now() - this.lastStartedAt.getTime()) / 1000);
  }

  /**
   * Get total runtime including current active session
   */
  getTotalRuntimeWithCurrent(): number {
    return this.totalRuntimeSeconds + this.getCurrentSessionRuntime();
  }

  /**
   * Generate a unique sprite name for the Sprites API
   */
  static generateSpriteName(projectId: string, orgSlug: string): string {
    const shortId = projectId.slice(0, 8);
    const timestamp = Date.now().toString(36);
    return `${orgSlug}-${shortId}-${timestamp}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }
}

ProjectSprite.init(
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
      comment: 'Project this sprite belongs to',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'CASCADE',
      comment: 'Organization (denormalized for query efficiency)',
    },
    spriteName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'sprite_name',
      comment: 'Unique name for the sprite in Sprites API',
    },
    spriteId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'sprite_id',
      comment: 'ID returned from Sprites API',
    },
    status: {
      type: DataTypes.ENUM(
        'creating',
        'initializing',
        'running',
        'hibernating',
        'stopped',
        'checkpointing',
        'restoring',
        'error',
        'deleted'
      ),
      allowNull: false,
      defaultValue: 'creating',
    },
    statusMessage: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'status_message',
      comment: 'Human-readable status message',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
      comment: 'Last error message if status is error',
    },
    repoUrl: {
      type: DataTypes.STRING(2048),
      allowNull: false,
      field: 'repo_url',
      validate: {
        isUrl: true,
      },
      comment: 'GitHub repository URL to clone',
    },
    branch: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'main',
      comment: 'Base branch to checkout (e.g., main)',
    },
    featureBranch: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      field: 'feature_branch',
      comment: 'Auto-created feature branch for sprite work (e.g., sprite/xyz-abc-123)',
    },
    workingDirectory: {
      type: DataTypes.STRING(1024),
      allowNull: false,
      defaultValue: '/home/sprite/project',
      field: 'working_directory',
      comment: 'Working directory path inside the sprite',
    },
    claudeConfigured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'claude_configured',
      comment: 'Whether Claude CLI is set up',
    },
    anthropicApiKeyConfigured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'anthropic_api_key_configured',
      comment: 'Whether Anthropic API key is configured in sprite env',
    },
    githubConfigured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'github_configured',
      comment: 'Whether GitHub authentication is configured (gh CLI + git credentials)',
    },
    autoShutdownAfterTask: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'auto_shutdown_after_task',
      comment: 'Whether to automatically stop the sprite after completing a task',
    },
    urlSettings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      field: 'url_settings',
      comment: 'URL settings from Sprites API',
    },
    lastCheckpointId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'last_checkpoint_id',
      comment: 'ID of the last checkpoint',
    },
    lastCheckpointAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_checkpoint_at',
      comment: 'When the last checkpoint was created',
    },
    checkpointCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'checkpoint_count',
      comment: 'Number of checkpoints created',
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
      comment: 'User who created this sprite',
    },
    lastAccessedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_accessed_at',
      comment: 'When the sprite was last accessed',
    },
    lastAccessedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'last_accessed_by_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'User who last accessed this sprite',
    },
    totalRuntimeSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_runtime_seconds',
      comment: 'Total accumulated runtime in seconds',
    },
    sessionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'session_count',
      comment: 'Total number of sessions',
    },
    lastStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_started_at',
      comment: 'When the sprite was last started',
    },
    currentSessionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'current_session_id',
      comment: 'Currently active terminal session ID from Sprites.dev',
    },
    lastShellDirectory: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'last_shell_directory',
      comment: 'Last working directory in the shell session',
    },
    startupCommand: {
      type: DataTypes.STRING(1024),
      allowNull: true,
      field: 'startup_command',
      comment: 'Command to run when terminal connects (e.g., npm run dev)',
    },
    tmuxSessionName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'tmux_session_name',
      comment: 'Name of the tmux session for persistent terminal',
    },
    mcpEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'mcp_enabled',
      comment: 'Whether MCP server is enabled on this sprite',
    },
    mcpPort: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'mcp_port',
      comment: 'Port the MCP server is listening on',
    },
    mcpInstalledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'mcp_installed_at',
      comment: 'When MCP server was installed',
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
    tableName: 'project_sprites',
    modelName: 'ProjectSprite',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['organization_id'] },
      { fields: ['sprite_name'], unique: true },
      { fields: ['status'] },
      { fields: ['organization_id', 'status'] },
      { fields: ['created_by_id'] },
      { fields: ['last_accessed_at'] },
    ],
  }
);

export default ProjectSprite;
export { ProjectSpriteAttributes, ProjectSpriteCreationAttributes };
