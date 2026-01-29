/**
 * DealSource Model
 *
 * Persists deal source configurations (email, webhook, API, etc.)
 * so they survive server restarts.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type DealSourceType = 'csv' | 'api' | 'email' | 'webhook' | 'manual' | 'firecrawl' | 'pdf';

export interface DealSourceAttributes {
  id: string;
  userId: string; // Owner of this source
  name: string;
  type: DealSourceType;
  enabled: boolean;
  settings: Record<string, any>;
  lastFetchAt?: Date;
  lastFetchStatus?: 'success' | 'failed';
  lastFetchError?: string;
  totalDealsIngested: number;
  createdAt: Date;
  updatedAt: Date;
}

interface DealSourceCreationAttributes
  extends Optional<
    DealSourceAttributes,
    | 'id'
    | 'enabled'
    | 'lastFetchAt'
    | 'lastFetchStatus'
    | 'lastFetchError'
    | 'totalDealsIngested'
    | 'createdAt'
    | 'updatedAt'
  > {}

class DealSource
  extends Model<DealSourceAttributes, DealSourceCreationAttributes>
  implements DealSourceAttributes
{
  public id!: string;
  public userId!: string;
  public name!: string;
  public type!: DealSourceType;
  public enabled!: boolean;
  public settings!: Record<string, any>;
  public lastFetchAt?: Date;
  public lastFetchStatus?: 'success' | 'failed';
  public lastFetchError?: string;
  public totalDealsIngested!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Get all enabled sources
   */
  static async getEnabled(): Promise<DealSource[]> {
    return DealSource.findAll({
      where: { enabled: true },
      order: [['name', 'ASC']],
    });
  }

  /**
   * Get sources by type
   */
  static async getByType(type: DealSourceType): Promise<DealSource[]> {
    return DealSource.findAll({
      where: { type },
      order: [['name', 'ASC']],
    });
  }

  /**
   * Update fetch status after a fetch operation
   */
  async updateFetchStatus(
    status: 'success' | 'failed',
    dealsIngested?: number,
    error?: string
  ): Promise<void> {
    const updates: Partial<DealSourceAttributes> = {
      lastFetchAt: new Date(),
      lastFetchStatus: status,
    };

    if (status === 'success' && dealsIngested) {
      updates.totalDealsIngested = this.totalDealsIngested + dealsIngested;
    }

    if (status === 'failed' && error) {
      updates.lastFetchError = error;
    } else {
      updates.lastFetchError = undefined;
    }

    await this.update(updates);
  }
}

DealSource.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('csv', 'api', 'email', 'webhook', 'manual', 'firecrawl', 'pdf'),
      allowNull: false,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    lastFetchAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_fetch_at',
    },
    lastFetchStatus: {
      type: DataTypes.ENUM('success', 'failed'),
      allowNull: true,
      field: 'last_fetch_status',
    },
    lastFetchError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_fetch_error',
    },
    totalDealsIngested: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_deals_ingested',
    },
  },
  {
    sequelize,
    tableName: 'deal_sources',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['type'] },
      { fields: ['enabled'] },
      { fields: ['user_id', 'type'] },
    ],
  }
);

export default DealSource;
