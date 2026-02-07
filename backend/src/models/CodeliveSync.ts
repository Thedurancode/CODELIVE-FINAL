/**
 * CodeliveSync Model
 *
 * Tracks synchronization state between Dispotree tasks and Codelive features.
 * This enables bidirectional sync between the two systems.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Sync status options
export type CodeliveSyncStatus = 'pending' | 'synced' | 'running' | 'completed' | 'failed';

interface CodeliveSyncAttributes {
  id: string;
  taskId: string; // Dispotree task ID (UUID)
  codeliveFeatureId: string; // Codelive feature ID
  projectPath: string; // Path to the project directory
  status: CodeliveSyncStatus;
  codeliveStatus: string | null; // Feature status in Codelive
  agentOutput: string | null; // AI agent output/log
  lastSyncedAt: Date;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CodeliveSyncCreationAttributes
  extends Optional<
    CodeliveSyncAttributes,
    | 'id'
    | 'status'
    | 'codeliveStatus'
    | 'agentOutput'
    | 'lastSyncedAt'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class CodeliveSync
  extends Model<CodeliveSyncAttributes, CodeliveSyncCreationAttributes>
  implements CodeliveSyncAttributes
{
  declare id: string;
  declare taskId: string;
  declare codeliveFeatureId: string;
  declare projectPath: string;
  declare status: CodeliveSyncStatus;
  declare codeliveStatus: string | null;
  declare agentOutput: string | null;
  declare lastSyncedAt: Date;
  declare metadata: Record<string, unknown> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Static helper methods

  /**
   * Find sync record by Dispotree task ID
   */
  static async findByTaskId(taskId: string): Promise<CodeliveSync | null> {
    return this.findOne({ where: { taskId } });
  }

  /**
   * Find sync record by Codelive feature ID
   */
  static async findByFeatureId(featureId: string): Promise<CodeliveSync | null> {
    return this.findOne({ where: { codeliveFeatureId: featureId } });
  }

  /**
   * Find all sync records for a project
   */
  static async findByProject(projectPath: string): Promise<CodeliveSync[]> {
    return this.findAll({
      where: { projectPath },
      order: [['lastSyncedAt', 'DESC']],
    });
  }

  /**
   * Get running syncs (features with active agents)
   */
  static async getRunning(): Promise<CodeliveSync[]> {
    return this.findAll({
      where: { status: 'running' },
      order: [['updatedAt', 'DESC']],
    });
  }

  /**
   * Get pending syncs that need to be processed
   */
  static async getPending(): Promise<CodeliveSync[]> {
    return this.findAll({
      where: { status: 'pending' },
      order: [['createdAt', 'ASC']],
    });
  }

  /**
   * Update sync status and optionally agent output
   */
  async updateStatus(
    status: CodeliveSyncStatus,
    codeliveStatus?: string,
    agentOutput?: string
  ): Promise<void> {
    await this.update({
      status,
      ...(codeliveStatus !== undefined && { codeliveStatus }),
      ...(agentOutput !== undefined && { agentOutput }),
      lastSyncedAt: new Date(),
    });
  }

  /**
   * Append to agent output
   */
  async appendAgentOutput(output: string): Promise<void> {
    const currentOutput = this.agentOutput || '';
    await this.update({
      agentOutput: currentOutput + output,
      lastSyncedAt: new Date(),
    });
  }
}

CodeliveSync.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    taskId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tasks',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    codeliveFeatureId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    projectPath: {
      type: DataTypes.STRING(1024),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'synced', 'running', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    codeliveStatus: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    agentOutput: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastSyncedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'codelive_syncs',
    timestamps: true,
    indexes: [
      { fields: ['taskId'], unique: true },
      { fields: ['codeliveFeatureId'] },
      { fields: ['projectPath'] },
      { fields: ['status'] },
      { fields: ['lastSyncedAt'] },
    ],
  }
);

export default CodeliveSync;
