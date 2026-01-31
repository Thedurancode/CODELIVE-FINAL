/**
 * ProjectEnvVariable Model
 *
 * Stores encrypted environment variables/secrets for projects.
 * Values are encrypted at rest using AES-256-GCM.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import crypto from 'crypto';

// Encryption key from environment or generate a default for development
const ENCRYPTION_KEY = process.env.ENV_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
const ALGORITHM = 'aes-256-gcm';

export interface ProjectEnvVariableAttributes {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  name: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectEnvVariableCreationAttributes
  extends Optional<
    ProjectEnvVariableAttributes,
    'id' | 'description' | 'createdAt' | 'updatedAt'
  > {}

class ProjectEnvVariable
  extends Model<ProjectEnvVariableAttributes, ProjectEnvVariableCreationAttributes>
  implements ProjectEnvVariableAttributes
{
  declare id: number;
  declare projectId: string;
  declare userId: string;
  declare organizationId: string;
  declare name: string;
  declare encryptedValue: string;
  declare iv: string;
  declare authTag: string;
  declare description: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual field populated by association
  declare author?: {
    id: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
  };

  /**
   * Encrypt a value before storing
   */
  static encrypt(value: string): { encryptedValue: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf-8'), iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encryptedValue: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt a stored value
   */
  static decrypt(encryptedValue: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'utf-8'),
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Get the decrypted value
   */
  getDecryptedValue(): string {
    return ProjectEnvVariable.decrypt(this.encryptedValue, this.iv, this.authTag);
  }

  /**
   * Check if user is the author
   */
  isAuthor(userId: string): boolean {
    return this.userId === userId;
  }

  /**
   * Get env variables for a project
   */
  static async getForProject(
    projectId: string,
    organizationId: string
  ): Promise<ProjectEnvVariable[]> {
    return this.findAll({
      where: { projectId, organizationId },
      order: [['name', 'ASC']],
    });
  }
}

ProjectEnvVariable.init(
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        // Allow common env var naming patterns
        is: /^[A-Za-z_][A-Za-z0-9_]*$/i,
      },
    },
    encryptedValue: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'encrypted_value',
    },
    iv: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    authTag: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: 'auth_tag',
    },
    description: {
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
    tableName: 'project_env_variables',
    modelName: 'ProjectEnvVariable',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['user_id'] },
      { fields: ['organization_id'] },
      { fields: ['project_id', 'organization_id'] },
      { fields: ['project_id', 'name'], unique: true }, // Unique name per project
      { fields: ['created_at'] },
    ],
  }
);

export default ProjectEnvVariable;
