/**
 * ApiKey Model
 *
 * Stores API keys for external application access.
 * Keys are hashed for security - only the prefix is stored in plain text for identification.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import crypto from 'crypto';

// API key scopes - what the key can access
export type ApiKeyScope =
  | 'sprites:read'
  | 'sprites:write'
  | 'sprites:execute'
  | 'tasks:read'
  | 'tasks:write'
  | 'files:read'
  | 'files:write'
  | 'chat:read'
  | 'chat:write'
  | 'projects:read'
  | 'projects:write'
  | '*'; // Full access

interface ApiKeyAttributes {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  keyPrefix: string; // First 8 chars of the key (for identification)
  keyHash: string; // SHA-256 hash of the full key
  scopes: ApiKeyScope[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdById: string | null;
  rateLimit: number; // Requests per minute
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ApiKeyCreationAttributes
  extends Optional<
    ApiKeyAttributes,
    | 'id'
    | 'description'
    | 'lastUsedAt'
    | 'expiresAt'
    | 'isActive'
    | 'createdById'
    | 'rateLimit'
    | 'usageCount'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ApiKey
  extends Model<ApiKeyAttributes, ApiKeyCreationAttributes>
  implements ApiKeyAttributes
{
  declare id: string;
  declare organizationId: string;
  declare name: string;
  declare description: string | null;
  declare keyPrefix: string;
  declare keyHash: string;
  declare scopes: ApiKeyScope[];
  declare lastUsedAt: Date | null;
  declare expiresAt: Date | null;
  declare isActive: boolean;
  declare createdById: string | null;
  declare rateLimit: number;
  declare usageCount: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Generate a new API key
   * Returns the full key (only shown once) and the model data
   */
  static generateKey(): { fullKey: string; prefix: string; hash: string } {
    // Generate a secure random key: sk_live_<32 random bytes as hex>
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const fullKey = `sk_live_${randomBytes}`;
    const prefix = fullKey.substring(0, 16); // "sk_live_" + 8 chars
    const hash = crypto.createHash('sha256').update(fullKey).digest('hex');

    return { fullKey, prefix, hash };
  }

  /**
   * Hash a key for comparison
   */
  static hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Find an API key by its full key value
   */
  static async findByKey(fullKey: string): Promise<ApiKey | null> {
    const hash = this.hashKey(fullKey);
    return this.findOne({
      where: {
        keyHash: hash,
        isActive: true,
      },
    });
  }

  /**
   * Check if the key has a specific scope
   */
  hasScope(scope: ApiKeyScope): boolean {
    return this.scopes.includes('*') || this.scopes.includes(scope);
  }

  /**
   * Check if the key has any of the specified scopes
   */
  hasAnyScope(scopes: ApiKeyScope[]): boolean {
    return this.scopes.includes('*') || scopes.some((s) => this.scopes.includes(s));
  }

  /**
   * Check if the key is expired
   */
  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  /**
   * Record usage of this key
   */
  async recordUsage(): Promise<void> {
    await this.update({
      lastUsedAt: new Date(),
      usageCount: this.usageCount + 1,
    });
  }
}

ApiKey.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Human-readable name for the API key',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Optional description of what this key is used for',
    },
    keyPrefix: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'key_prefix',
      comment: 'First 16 chars of the key for identification (sk_live_xxxxxxxx)',
    },
    keyHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'key_hash',
      comment: 'SHA-256 hash of the full API key',
    },
    scopes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ['sprites:read'],
      comment: 'Array of permission scopes',
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_used_at',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
      comment: 'Optional expiration date',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
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
    rateLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60, // 60 requests per minute
      field: 'rate_limit',
      comment: 'Maximum requests per minute',
    },
    usageCount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      field: 'usage_count',
      comment: 'Total number of API calls made with this key',
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
    tableName: 'api_keys',
    modelName: 'ApiKey',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['organization_id'] },
      { fields: ['key_hash'], unique: true },
      { fields: ['key_prefix'] },
      { fields: ['is_active'] },
      { fields: ['created_by_id'] },
    ],
  }
);

export default ApiKey;
export { ApiKeyAttributes, ApiKeyCreationAttributes };
