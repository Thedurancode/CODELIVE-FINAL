/**
 * SpriteTask Model
 *
 * Task queue for sprites to work on. Tasks can be created manually or synced from GitHub issues.
 * Each task represents a unit of work that a sprite will:
 * 1. Create a branch named after the task
 * 2. Have Claude work on the implementation
 * 3. Create a PR that references and closes the issue
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

// Task status lifecycle
export type SpriteTaskStatus =
  | 'pending'      // Waiting in queue
  | 'assigned'     // Assigned to a sprite, waiting to start
  | 'in_progress'  // Sprite is actively working on it
  | 'pr_created'   // PR has been created, waiting for review/merge
  | 'completed'    // Task completed (PR merged or manually closed)
  | 'failed'       // Task failed (error during execution)
  | 'cancelled';   // Task was cancelled

// Task priority levels
export type SpriteTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// Task source - where did this task come from
export type SpriteTaskSource = 'manual' | 'github_issue' | 'github_label' | 'automation';

interface SpriteTaskAttributes {
  id: string;
  projectId: string;
  organizationId: string;
  spriteId: string | null; // Assigned sprite (null if pending)

  // Task details
  title: string;
  description: string | null;
  prompt: string | null; // Prompt for Claude to work on

  // Status
  status: SpriteTaskStatus;
  priority: SpriteTaskPriority;
  statusMessage: string | null;
  errorMessage: string | null;

  // Source tracking
  source: SpriteTaskSource;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;

  // Branch & PR
  branchName: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;

  // Timing
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;

  // Audit
  createdById: string | null;
  assignedById: string | null;

  createdAt: Date;
  updatedAt: Date;
}

interface SpriteTaskCreationAttributes
  extends Optional<
    SpriteTaskAttributes,
    | 'id'
    | 'spriteId'
    | 'description'
    | 'prompt'
    | 'status'
    | 'priority'
    | 'statusMessage'
    | 'errorMessage'
    | 'source'
    | 'githubIssueNumber'
    | 'githubIssueUrl'
    | 'branchName'
    | 'pullRequestNumber'
    | 'pullRequestUrl'
    | 'queuedAt'
    | 'startedAt'
    | 'completedAt'
    | 'createdById'
    | 'assignedById'
    | 'createdAt'
    | 'updatedAt'
  > {}

class SpriteTask
  extends Model<SpriteTaskAttributes, SpriteTaskCreationAttributes>
  implements SpriteTaskAttributes
{
  declare id: string;
  declare projectId: string;
  declare organizationId: string;
  declare spriteId: string | null;

  declare title: string;
  declare description: string | null;
  declare prompt: string | null;

  declare status: SpriteTaskStatus;
  declare priority: SpriteTaskPriority;
  declare statusMessage: string | null;
  declare errorMessage: string | null;

  declare source: SpriteTaskSource;
  declare githubIssueNumber: number | null;
  declare githubIssueUrl: string | null;

  declare branchName: string | null;
  declare pullRequestNumber: number | null;
  declare pullRequestUrl: string | null;

  declare queuedAt: Date;
  declare startedAt: Date | null;
  declare completedAt: Date | null;

  declare createdById: string | null;
  declare assignedById: string | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // ============================================================================
  // STATIC HELPERS
  // ============================================================================

  /**
   * Get next pending task for a project (FIFO with priority)
   */
  static async getNextPendingTask(projectId: string): Promise<SpriteTask | null> {
    return this.findOne({
      where: {
        projectId,
        status: 'pending',
      },
      order: [
        // Priority order: urgent > high > medium > low
        [sequelize.literal(`CASE
          WHEN priority = 'urgent' THEN 1
          WHEN priority = 'high' THEN 2
          WHEN priority = 'medium' THEN 3
          ELSE 4
        END`), 'ASC'],
        ['queuedAt', 'ASC'],
      ],
    });
  }

  /**
   * Get all pending tasks for a project
   */
  static async getPendingTasks(projectId: string): Promise<SpriteTask[]> {
    return this.findAll({
      where: {
        projectId,
        status: 'pending',
      },
      order: [
        [sequelize.literal(`CASE
          WHEN priority = 'urgent' THEN 1
          WHEN priority = 'high' THEN 2
          WHEN priority = 'medium' THEN 3
          ELSE 4
        END`), 'ASC'],
        ['queuedAt', 'ASC'],
      ],
    });
  }

  /**
   * Get task currently being worked on by a sprite
   */
  static async getActiveTaskForSprite(spriteId: string): Promise<SpriteTask | null> {
    return this.findOne({
      where: {
        spriteId,
        status: ['assigned', 'in_progress'],
      },
    });
  }

  /**
   * Get all tasks for a project
   */
  static async getTasksForProject(
    projectId: string,
    options?: { status?: SpriteTaskStatus[]; limit?: number }
  ): Promise<SpriteTask[]> {
    const where: Record<string, unknown> = { projectId };
    if (options?.status) {
      where.status = options.status;
    }

    return this.findAll({
      where,
      order: [['updatedAt', 'DESC']],
      limit: options?.limit,
    });
  }

  /**
   * Get tasks for organization
   */
  static async getTasksForOrganization(
    organizationId: string,
    options?: { status?: SpriteTaskStatus[]; limit?: number }
  ): Promise<SpriteTask[]> {
    const where: Record<string, unknown> = { organizationId };
    if (options?.status) {
      where.status = options.status;
    }

    return this.findAll({
      where,
      order: [['updatedAt', 'DESC']],
      limit: options?.limit,
    });
  }

  /**
   * Check if a GitHub issue already has a task
   */
  static async findByGitHubIssue(
    projectId: string,
    issueNumber: number
  ): Promise<SpriteTask | null> {
    return this.findOne({
      where: {
        projectId,
        githubIssueNumber: issueNumber,
        status: { [Op.notIn]: ['completed', 'cancelled', 'failed'] },
      },
    });
  }

  // ============================================================================
  // INSTANCE HELPERS
  // ============================================================================

  /**
   * Generate branch name from task title
   * e.g., "Fix login bug" -> "issue/fix-login-bug-123"
   */
  generateBranchName(): string {
    const slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    const suffix = this.githubIssueNumber
      ? `-${this.githubIssueNumber}`
      : `-${this.id.slice(0, 8)}`;

    return `issue/${slug}${suffix}`;
  }

  /**
   * Generate PR body with issue reference
   */
  generatePRBody(): string {
    const lines: string[] = [];

    lines.push('## Summary');
    lines.push(this.description || this.title);
    lines.push('');

    if (this.githubIssueNumber) {
      lines.push(`Fixes #${this.githubIssueNumber}`);
      lines.push('');
    }

    lines.push('## Changes');
    lines.push('_Implemented by Claude via Dispotree Sprites_');
    lines.push('');

    if (this.prompt) {
      lines.push('## Task Prompt');
      lines.push('```');
      lines.push(this.prompt);
      lines.push('```');
      lines.push('');
    }

    lines.push('---');
    lines.push('🤖 Generated with [Dispotree Sprites](https://dispotree.com)');

    return lines.join('\n');
  }

  /**
   * Check if task can be cancelled
   */
  canCancel(): boolean {
    return ['pending', 'assigned'].includes(this.status);
  }

  /**
   * Check if task can be retried
   */
  canRetry(): boolean {
    return ['failed', 'cancelled'].includes(this.status);
  }
}

SpriteTask.init(
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
    },
    spriteId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'sprite_id',
      references: {
        model: 'project_sprites',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'Assigned sprite (null if pending in queue)',
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'Task title (used for branch naming)',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Detailed task description',
    },
    prompt: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Prompt for Claude to work on',
    },
    status: {
      type: DataTypes.ENUM(
        'pending',
        'assigned',
        'in_progress',
        'pr_created',
        'completed',
        'failed',
        'cancelled'
      ),
      allowNull: false,
      defaultValue: 'pending',
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      allowNull: false,
      defaultValue: 'medium',
    },
    statusMessage: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'status_message',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    },
    source: {
      type: DataTypes.ENUM('manual', 'github_issue', 'github_label', 'automation'),
      allowNull: false,
      defaultValue: 'manual',
    },
    githubIssueNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'github_issue_number',
      comment: 'GitHub issue number if synced from issue',
    },
    githubIssueUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
      field: 'github_issue_url',
    },
    branchName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'branch_name',
      comment: 'Git branch created for this task',
    },
    pullRequestNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'pull_request_number',
    },
    pullRequestUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
      field: 'pull_request_url',
    },
    queuedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'queued_at',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
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
    },
    assignedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_by_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
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
    tableName: 'sprite_tasks',
    modelName: 'SpriteTask',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['organization_id'] },
      { fields: ['sprite_id'] },
      { fields: ['status'] },
      { fields: ['priority'] },
      { fields: ['project_id', 'status'] },
      { fields: ['project_id', 'github_issue_number'], unique: true },
      { fields: ['queued_at'] },
    ],
  }
);

export default SpriteTask;
export { SpriteTaskAttributes, SpriteTaskCreationAttributes };
