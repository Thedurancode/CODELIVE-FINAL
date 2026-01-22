/**
 * UserEmailConfig Model
 *
 * Stores per-user email account configuration for IMAP inbox sync.
 * Each user can have ONE email account configured.
 * Passwords are encrypted using AES-256-GCM.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface UserEmailConfigAttributes {
  id: string;
  userId: string;
  accountEmail: string;
  displayName?: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  encryptedPassword: string;
  passwordIv: string;
  passwordAuthTag: string;
  smtpFrom?: string;
  isActive: boolean;
  lastSyncAt?: Date;
  lastSyncError?: string;
  syncStatus: SyncStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserEmailConfigCreationAttributes
  extends Optional<
    UserEmailConfigAttributes,
    'id' | 'displayName' | 'smtpFrom' | 'lastSyncAt' | 'lastSyncError' | 'createdAt' | 'updatedAt'
  > {}

class UserEmailConfig
  extends Model<UserEmailConfigAttributes, UserEmailConfigCreationAttributes>
  implements UserEmailConfigAttributes
{
  public id!: string;
  public userId!: string;
  public accountEmail!: string;
  public displayName?: string;
  public imapHost!: string;
  public imapPort!: number;
  public imapSecure!: boolean;
  public imapUser!: string;
  public encryptedPassword!: string;
  public passwordIv!: string;
  public passwordAuthTag!: string;
  public smtpFrom?: string;
  public isActive!: boolean;
  public lastSyncAt?: Date;
  public lastSyncError?: string;
  public syncStatus!: SyncStatus;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Get a safe version of the config (no password fields)
   */
  toSafeJSON(): Omit<UserEmailConfigAttributes, 'encryptedPassword' | 'passwordIv' | 'passwordAuthTag'> & { hasPassword: boolean } {
    const { encryptedPassword, passwordIv, passwordAuthTag, ...safe } = this.toJSON() as UserEmailConfigAttributes;
    return {
      ...safe,
      hasPassword: !!encryptedPassword,
    };
  }

  /**
   * Update sync status
   */
  async updateSyncStatus(status: SyncStatus, error?: string): Promise<void> {
    this.syncStatus = status;
    if (status === 'idle') {
      this.lastSyncAt = new Date();
      this.lastSyncError = undefined;
    } else if (status === 'error' && error) {
      this.lastSyncError = error;
    }
    await this.save();
  }
}

UserEmailConfig.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true, // One email config per user
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      field: 'user_id',
    },
    accountEmail: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'account_email',
      validate: {
        isEmail: true,
      },
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'display_name',
    },
    imapHost: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'imap_host',
    },
    imapPort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 993,
      field: 'imap_port',
    },
    imapSecure: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'imap_secure',
    },
    imapUser: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'imap_user',
    },
    encryptedPassword: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'encrypted_password',
    },
    passwordIv: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: 'password_iv',
    },
    passwordAuthTag: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: 'password_auth_tag',
    },
    smtpFrom: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'smtp_from',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_sync_at',
    },
    lastSyncError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_sync_error',
    },
    syncStatus: {
      type: DataTypes.ENUM('idle', 'syncing', 'error'),
      allowNull: false,
      defaultValue: 'idle',
      field: 'sync_status',
    },
  },
  {
    sequelize,
    tableName: 'user_email_configs',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['user_id'], unique: true },
      { fields: ['account_email'] },
      { fields: ['is_active'] },
    ],
  }
);

export default UserEmailConfig;
