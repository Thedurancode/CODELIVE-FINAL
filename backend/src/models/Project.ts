/**
 * Project Model
 *
 * Project management with GitHub URL, linked contacts, notes, and tasks.
 * Organization-scoped for team collaboration.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Project status options
export type ProjectStatus = 'in_talks' | 'now_coding' | 'needs_review' | 'completed' | 'cancelled';

interface ProjectAttributes {
  id: string;
  title: string;
  description: string | null;
  logoUrl: string | null;
  githubUrl: string | null;
  deploymentUrl: string | null;
  status: ProjectStatus;

  // Organization scoping (team-shared)
  organizationId: string;
  createdById: string | null;

  // Dates
  startDate: Date | null;
  targetEndDate: Date | null;
  actualEndDate: Date | null;

  // Additional info
  tags: string[];
  metadata: Record<string, unknown> | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectCreationAttributes
  extends Optional<
    ProjectAttributes,
    | 'id'
    | 'description'
    | 'logoUrl'
    | 'githubUrl'
    | 'deploymentUrl'
    | 'status'
    | 'createdById'
    | 'startDate'
    | 'targetEndDate'
    | 'actualEndDate'
    | 'tags'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class Project
  extends Model<ProjectAttributes, ProjectCreationAttributes>
  implements ProjectAttributes
{
  declare id: string;
  declare title: string;
  declare description: string | null;
  declare logoUrl: string | null;
  declare githubUrl: string | null;
  declare deploymentUrl: string | null;
  declare status: ProjectStatus;

  declare organizationId: string;
  declare createdById: string | null;

  declare startDate: Date | null;
  declare targetEndDate: Date | null;
  declare actualEndDate: Date | null;

  declare tags: string[];
  declare metadata: Record<string, unknown> | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields populated by associations
  declare createdBy?: {
    id: string;
    name?: string;
    email?: string;
  };

  // Static helper methods
  static async getByOrganization(organizationId: string, status?: ProjectStatus) {
    const where: Record<string, unknown> = { organizationId };
    if (status) where.status = status;
    return this.findAll({
      where,
      order: [['updatedAt', 'DESC']],
    });
  }

  static async getByCreator(createdById: string) {
    return this.findAll({
      where: { createdById },
      order: [['createdAt', 'DESC']],
    });
  }

  static async getActiveProjects(organizationId: string) {
    return this.findAll({
      where: { organizationId, status: 'now_coding' },
      order: [['updatedAt', 'DESC']],
    });
  }

  static async getOverdueProjects(organizationId: string) {
    const { Op } = require('sequelize');
    return this.findAll({
      where: {
        organizationId,
        status: ['in_talks', 'now_coding', 'needs_review'],
        targetEndDate: { [Op.lt]: new Date() },
      },
      order: [['targetEndDate', 'ASC']],
    });
  }

  /**
   * Check if project is overdue
   */
  isOverdue(): boolean {
    if (!this.targetEndDate) return false;
    if (['completed', 'cancelled'].includes(this.status)) return false;
    return new Date(this.targetEndDate) < new Date();
  }

  /**
   * Get days until target end date (negative if overdue)
   */
  getDaysUntilDue(): number | null {
    if (!this.targetEndDate) return null;
    const now = new Date();
    const due = new Date(this.targetEndDate);
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }
}

Project.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    logoUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
      field: 'logo_url',
      comment: 'Project logo image URL',
    },
    githubUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
      field: 'github_url',
      validate: {
        isUrl: true,
      },
      comment: 'GitHub repository URL',
    },
    deploymentUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
      field: 'deployment_url',
      validate: {
        isUrl: true,
      },
      comment: 'Live deployment/preview URL',
    },
    status: {
      type: DataTypes.ENUM('in_talks', 'now_coding', 'needs_review', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'in_talks',
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
      comment: 'Organization that owns this project (team-shared)',
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
      comment: 'User who created this project (preserved on user deletion)',
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'start_date',
    },
    targetEndDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'target_end_date',
    },
    actualEndDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'actual_end_date',
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Flexible metadata for additional fields',
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
    tableName: 'projects',
    modelName: 'Project',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['organization_id'] },
      { fields: ['created_by_id'] },
      { fields: ['status'] },
      { fields: ['organization_id', 'status'] },
      { fields: ['target_end_date'] },
      { fields: ['tags'], using: 'gin' },
    ],
  }
);

export default Project;
export { ProjectAttributes, ProjectCreationAttributes };
