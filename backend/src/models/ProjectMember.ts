/**
 * ProjectMember Model
 *
 * Associates team members with specific projects.
 * Team members can be assigned during project creation with select all functionality.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type ProjectRole =
  | 'owner'        // Project owner/creator
  | 'lead'         // Project lead
  | 'developer'    // Developer on the project
  | 'designer'     // Designer on the project
  | 'manager'      // Project manager
  | 'contributor'  // General contributor
  | 'viewer';      // View-only access

export interface ProjectMemberAttributes {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  projectRole: ProjectRole;
  assignedAt: Date;
  assignedBy?: string; // userId who assigned this team member
  isActive: boolean;

  // Integration settings
  githubUsername?: string; // GitHub username for repo invites
  githubInvited: boolean;  // Whether GitHub invite was sent
  githubInvitedAt?: Date;

  // Notification preferences for this specific project
  notifyOnTask: boolean;
  notifyOnNote: boolean;
  notifyOnStatusChange: boolean;
  notifyOnMention: boolean;

  notes?: string; // Internal notes about this assignment
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMemberCreationAttributes
  extends Optional<
    ProjectMemberAttributes,
    | 'id'
    | 'assignedAt'
    | 'assignedBy'
    | 'isActive'
    | 'githubUsername'
    | 'githubInvited'
    | 'githubInvitedAt'
    | 'notifyOnTask'
    | 'notifyOnNote'
    | 'notifyOnStatusChange'
    | 'notifyOnMention'
    | 'notes'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ProjectMember
  extends Model<ProjectMemberAttributes, ProjectMemberCreationAttributes>
  implements ProjectMemberAttributes
{
  declare id: number;
  declare projectId: string;
  declare userId: string;
  declare organizationId: string;
  declare projectRole: ProjectRole;
  declare assignedAt: Date;
  declare assignedBy: string | undefined;
  declare isActive: boolean;

  declare githubUsername: string | undefined;
  declare githubInvited: boolean;
  declare githubInvitedAt: Date | undefined;

  declare notifyOnTask: boolean;
  declare notifyOnNote: boolean;
  declare notifyOnStatusChange: boolean;
  declare notifyOnMention: boolean;

  declare notes: string | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields populated by associations
  declare user?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    title?: string;
  };

  declare project?: {
    id: string;
    title: string;
    status: string;
  };

  /**
   * Get all team members for a project
   */
  static async getForProject(
    projectId: string,
    includeInactive = false
  ): Promise<ProjectMember[]> {
    const where: any = { projectId };
    if (!includeInactive) {
      where.isActive = true;
    }
    return this.findAll({
      where,
      order: [
        ['projectRole', 'ASC'],
        ['assignedAt', 'ASC'],
      ],
    });
  }

  /**
   * Get all projects assigned to a user
   */
  static async getForUser(
    userId: string,
    organizationId: string,
    includeInactive = false
  ): Promise<ProjectMember[]> {
    const where: any = { userId, organizationId };
    if (!includeInactive) {
      where.isActive = true;
    }
    return this.findAll({
      where,
      order: [['assignedAt', 'DESC']],
    });
  }

  /**
   * Assign a team member to a project
   */
  static async assignToProject(data: {
    projectId: string;
    userId: string;
    organizationId: string;
    projectRole: ProjectRole;
    assignedBy?: string;
    githubUsername?: string;
    notes?: string;
  }): Promise<ProjectMember> {
    // Check if already assigned
    const existing = await this.findOne({
      where: {
        projectId: data.projectId,
        userId: data.userId,
      },
    });

    if (existing) {
      // Reactivate if inactive
      if (!existing.isActive) {
        return existing.update({
          isActive: true,
          projectRole: data.projectRole,
          assignedBy: data.assignedBy,
          assignedAt: new Date(),
          githubUsername: data.githubUsername,
          notes: data.notes,
        });
      }
      // Update role if already active
      return existing.update({
        projectRole: data.projectRole,
        githubUsername: data.githubUsername,
        notes: data.notes,
      });
    }

    return this.create({
      ...data,
      assignedAt: new Date(),
    });
  }

  /**
   * Bulk assign team members to a project
   */
  static async bulkAssignToProject(
    projectId: string,
    organizationId: string,
    userIds: string[],
    assignedBy: string,
    defaultRole: ProjectRole = 'contributor'
  ): Promise<ProjectMember[]> {
    const results: ProjectMember[] = [];

    for (const userId of userIds) {
      const member = await this.assignToProject({
        projectId,
        userId,
        organizationId,
        projectRole: defaultRole,
        assignedBy,
      });
      results.push(member);
    }

    return results;
  }

  /**
   * Remove a team member from a project (soft delete)
   */
  static async removeFromProject(
    projectId: string,
    userId: string
  ): Promise<boolean> {
    const assignment = await this.findOne({
      where: { projectId, userId },
    });

    if (!assignment) return false;

    await assignment.update({ isActive: false });
    return true;
  }

  /**
   * Update GitHub invite status
   */
  async markGitHubInvited(): Promise<ProjectMember> {
    return this.update({
      githubInvited: true,
      githubInvitedAt: new Date(),
    });
  }

  /**
   * Get the owner/lead of a project
   */
  static async getProjectLead(projectId: string): Promise<ProjectMember | null> {
    return this.findOne({
      where: {
        projectId,
        projectRole: ['owner', 'lead'],
        isActive: true,
      },
      order: [['projectRole', 'ASC']], // owner comes before lead
    });
  }
}

ProjectMember.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
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
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
    },
    projectRole: {
      type: DataTypes.ENUM('owner', 'lead', 'developer', 'designer', 'manager', 'contributor', 'viewer'),
      allowNull: false,
      defaultValue: 'contributor',
      field: 'project_role',
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'assigned_at',
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_by',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    githubUsername: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'github_username',
    },
    githubInvited: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'github_invited',
    },
    githubInvitedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'github_invited_at',
    },
    notifyOnTask: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_task',
    },
    notifyOnNote: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_note',
    },
    notifyOnStatusChange: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_status_change',
    },
    notifyOnMention: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_mention',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'project_members',
    modelName: 'ProjectMember',
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['user_id'] },
      { fields: ['organization_id'] },
      { fields: ['project_id', 'user_id'], unique: true },
      { fields: ['project_role'] },
      { fields: ['is_active'] },
      { fields: ['project_id', 'is_active'] },
    ],
  }
);

export default ProjectMember;
