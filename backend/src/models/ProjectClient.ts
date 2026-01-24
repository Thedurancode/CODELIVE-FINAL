/**
 * ProjectClient Model
 *
 * Links clients to projects they have access to via invite tokens.
 * Enables client portal functionality for viewing project activity.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import crypto from 'crypto';
import sequelize from '../config/database';

// Client access status
export type ProjectClientStatus = 'pending' | 'active' | 'revoked';

interface ProjectClientAttributes {
  id: number;
  projectId: string;
  clientUserId: string | null;     // Null until invite is accepted
  inviteToken: string;
  invitedByUserId: string;
  invitedAt: Date;
  acceptedAt: Date | null;
  status: ProjectClientStatus;
  clientEmail: string | null;       // Email the invite was sent to
  clientName: string | null;        // Name provided during registration
  expiresAt: Date | null;
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectClientCreationAttributes
  extends Optional<
    ProjectClientAttributes,
    | 'id'
    | 'clientUserId'
    | 'invitedAt'
    | 'acceptedAt'
    | 'status'
    | 'clientEmail'
    | 'clientName'
    | 'expiresAt'
    | 'lastAccessedAt'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ProjectClient
  extends Model<ProjectClientAttributes, ProjectClientCreationAttributes>
  implements ProjectClientAttributes
{
  declare id: number;
  declare projectId: string;
  declare clientUserId: string | null;
  declare inviteToken: string;
  declare invitedByUserId: string;
  declare invitedAt: Date;
  declare acceptedAt: Date | null;
  declare status: ProjectClientStatus;
  declare clientEmail: string | null;
  declare clientName: string | null;
  declare expiresAt: Date | null;
  declare lastAccessedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields from associations
  declare project?: {
    id: string;
    title: string;
    logoUrl?: string;
    githubUrl?: string;
  };
  declare client?: {
    id: string;
    name?: string;
    email?: string;
  };
  declare invitedBy?: {
    id: string;
    name?: string;
    email?: string;
  };

  /**
   * Generate a secure random invite token
   */
  static generateToken(): string {
    return crypto.randomBytes(24).toString('base64url'); // 32 chars, URL-safe
  }

  /**
   * Find invite by token
   */
  static async findByToken(token: string): Promise<ProjectClient | null> {
    return this.findOne({
      where: { inviteToken: token },
    });
  }

  /**
   * Get all clients for a project
   */
  static async getByProject(projectId: string, includeRevoked = false) {
    const where: Record<string, unknown> = { projectId };
    if (!includeRevoked) {
      where.status = ['pending', 'active'];
    }
    return this.findAll({
      where,
      order: [['invitedAt', 'DESC']],
    });
  }

  /**
   * Get all projects a client has access to
   */
  static async getByClient(clientUserId: string) {
    return this.findAll({
      where: { clientUserId, status: 'active' },
      order: [['acceptedAt', 'DESC']],
    });
  }

  /**
   * Check if invite is valid (not expired, not revoked)
   */
  isValid(): boolean {
    if (this.status === 'revoked') return false;
    if (this.expiresAt && new Date(this.expiresAt) < new Date()) return false;
    return true;
  }

  /**
   * Check if invite is pending (not yet accepted)
   */
  isPending(): boolean {
    return this.status === 'pending' && !this.clientUserId;
  }

  /**
   * Accept invite and link to client user
   */
  async accept(clientUserId: string, clientName?: string): Promise<void> {
    await this.update({
      clientUserId,
      clientName: clientName || this.clientName,
      acceptedAt: new Date(),
      status: 'active',
    });
  }

  /**
   * Revoke client access
   */
  async revoke(): Promise<void> {
    await this.update({ status: 'revoked' });
  }

  /**
   * Update last accessed timestamp
   */
  async touch(): Promise<void> {
    await this.update({ lastAccessedAt: new Date() });
  }
}

ProjectClient.init(
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
    clientUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'client_user_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      comment: 'Linked MarketplaceUser with client role (null until accepted)',
    },
    inviteToken: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'invite_token',
      comment: 'Unique token for invite link',
    },
    invitedByUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'invited_by_user_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    invitedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'invited_at',
      defaultValue: DataTypes.NOW,
    },
    acceptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'accepted_at',
    },
    status: {
      type: DataTypes.ENUM('pending', 'active', 'revoked'),
      allowNull: false,
      defaultValue: 'pending',
    },
    clientEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'client_email',
      validate: {
        isEmail: true,
      },
      comment: 'Email the invite was intended for',
    },
    clientName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'client_name',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
      comment: 'Optional expiration for the invite',
    },
    lastAccessedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_accessed_at',
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
    tableName: 'project_clients',
    modelName: 'ProjectClient',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['client_user_id'] },
      { fields: ['invite_token'], unique: true },
      { fields: ['invited_by_user_id'] },
      { fields: ['status'] },
      { fields: ['project_id', 'client_user_id'], unique: true },
      { fields: ['expires_at'] },
    ],
  }
);

export default ProjectClient;
export { ProjectClientAttributes, ProjectClientCreationAttributes };
