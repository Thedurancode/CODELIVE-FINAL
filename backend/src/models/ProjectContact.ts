/**
 * ProjectContact Model (Junction Table)
 *
 * Many-to-many relationship between Projects and Contacts.
 * Stores role information and notes about the contact's involvement.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

type GitHubInviteStatus = 'none' | 'pending' | 'accepted' | 'declined' | 'failed';

interface ProjectContactAttributes {
  id: number;
  projectId: string;
  contactId: string;
  role: string | null;
  isPrimary: boolean;
  addedById: string | null;
  notes: string | null;
  githubInviteStatus: GitHubInviteStatus;
  githubInviteId: number | null;
  githubInvitedAt: Date | null;
  githubInviteError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectContactCreationAttributes
  extends Optional<
    ProjectContactAttributes,
    'id' | 'role' | 'isPrimary' | 'addedById' | 'notes' | 'githubInviteStatus' | 'githubInviteId' | 'githubInvitedAt' | 'githubInviteError' | 'createdAt' | 'updatedAt'
  > {}

class ProjectContact
  extends Model<ProjectContactAttributes, ProjectContactCreationAttributes>
  implements ProjectContactAttributes
{
  declare id: number;
  declare projectId: string;
  declare contactId: string;
  declare role: string | null;
  declare isPrimary: boolean;
  declare addedById: string | null;
  declare notes: string | null;
  declare githubInviteStatus: GitHubInviteStatus;
  declare githubInviteId: number | null;
  declare githubInvitedAt: Date | null;
  declare githubInviteError: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields populated by associations
  declare contact?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    type?: string;
    company?: string;
  };
  declare project?: {
    id: string;
    title: string;
    status?: string;
  };
  declare addedBy?: {
    id: string;
    name?: string;
    email?: string;
  };

  // Static helper methods
  static async getContactsForProject(projectId: string) {
    return this.findAll({
      where: { projectId },
      order: [
        ['isPrimary', 'DESC'],
        ['createdAt', 'ASC'],
      ],
    });
  }

  static async getProjectsForContact(contactId: string) {
    return this.findAll({
      where: { contactId },
      order: [['createdAt', 'DESC']],
    });
  }

  static async isContactOnProject(projectId: string, contactId: string): Promise<boolean> {
    const count = await this.count({ where: { projectId, contactId } });
    return count > 0;
  }

  static async addContactToProject(data: {
    projectId: string;
    contactId: string;
    role?: string;
    isPrimary?: boolean;
    addedById?: string;
    notes?: string;
  }): Promise<ProjectContact> {
    return this.create(data);
  }

  static async removeContactFromProject(projectId: string, contactId: string): Promise<boolean> {
    const deleted = await this.destroy({ where: { projectId, contactId } });
    return deleted > 0;
  }

  static async getPrimaryContact(projectId: string): Promise<ProjectContact | null> {
    return this.findOne({
      where: { projectId, isPrimary: true },
    });
  }

  static async setPrimaryContact(projectId: string, contactId: string): Promise<void> {
    // Remove primary flag from all contacts on project
    await this.update({ isPrimary: false }, { where: { projectId } });
    // Set primary flag on specified contact
    await this.update({ isPrimary: true }, { where: { projectId, contactId } });
  }
}

ProjectContact.init(
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
    contactId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'contact_id',
      references: {
        model: 'contacts',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    role: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Role on project (e.g., Developer, Client, Stakeholder)',
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_primary',
      comment: 'Primary contact for this project',
    },
    addedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'added_by_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'User who added this contact to the project',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Notes about this contact assignment',
    },
    githubInviteStatus: {
      type: DataTypes.ENUM('none', 'pending', 'accepted', 'declined', 'failed'),
      allowNull: false,
      defaultValue: 'none',
      field: 'github_invite_status',
      comment: 'Status of GitHub repository invite',
    },
    githubInviteId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'github_invite_id',
      comment: 'GitHub invitation ID for tracking',
    },
    githubInvitedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'github_invited_at',
      comment: 'When the GitHub invite was sent',
    },
    githubInviteError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'github_invite_error',
      comment: 'Error message if invite failed',
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
    tableName: 'project_contacts',
    modelName: 'ProjectContact',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['contact_id'] },
      { fields: ['project_id', 'contact_id'], unique: true },
      { fields: ['is_primary'] },
      { fields: ['added_by_id'] },
      { fields: ['github_invite_status'] },
    ],
  }
);

export default ProjectContact;
export { ProjectContactAttributes, ProjectContactCreationAttributes, GitHubInviteStatus };
