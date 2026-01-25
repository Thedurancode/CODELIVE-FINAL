/**
 * SpriteSession Model
 *
 * Tracks sprite runtime by recording start/stop events.
 * Each session represents a period when the sprite was active.
 * Used for billing, analytics, and usage tracking.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

// Session start reasons
export type SessionStartReason = 'created' | 'resumed' | 'restored' | 'restarted';

// Session end reasons
export type SessionEndReason = 'stopped' | 'hibernated' | 'error' | 'deleted' | 'checkpointed';

interface SpriteSessionAttributes {
  id: string;
  spriteId: string;
  projectId: string;
  organizationId: string;

  // Timing
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;

  // Reasons
  startReason: SessionStartReason;
  endReason: SessionEndReason | null;

  // Users
  startedById: string | null;
  endedById: string | null;

  // Metadata
  metadata: Record<string, unknown> | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface SpriteSessionCreationAttributes
  extends Optional<
    SpriteSessionAttributes,
    | 'id'
    | 'endedAt'
    | 'durationSeconds'
    | 'startReason'
    | 'endReason'
    | 'startedById'
    | 'endedById'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class SpriteSession
  extends Model<SpriteSessionAttributes, SpriteSessionCreationAttributes>
  implements SpriteSessionAttributes
{
  declare id: string;
  declare spriteId: string;
  declare projectId: string;
  declare organizationId: string;

  declare startedAt: Date;
  declare endedAt: Date | null;
  declare durationSeconds: number | null;

  declare startReason: SessionStartReason;
  declare endReason: SessionEndReason | null;

  declare startedById: string | null;
  declare endedById: string | null;

  declare metadata: Record<string, unknown> | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if session is still active (not ended)
   */
  isActive(): boolean {
    return this.endedAt === null;
  }

  /**
   * Calculate duration in seconds (for active sessions, calculates current duration)
   */
  getDuration(): number {
    if (this.durationSeconds !== null) {
      return this.durationSeconds;
    }
    // For active sessions, calculate current duration
    const endTime = this.endedAt || new Date();
    return Math.floor((endTime.getTime() - this.startedAt.getTime()) / 1000);
  }

  /**
   * End this session
   */
  async endSession(
    reason: SessionEndReason,
    endedById?: string
  ): Promise<SpriteSession> {
    const endedAt = new Date();
    const durationSeconds = Math.floor(
      (endedAt.getTime() - this.startedAt.getTime()) / 1000
    );

    await this.update({
      endedAt,
      durationSeconds,
      endReason: reason,
      endedById: endedById || null,
    });

    return this.reload();
  }

  // Static helper methods

  /**
   * Get active session for a sprite
   */
  static async getActiveSession(spriteId: string): Promise<SpriteSession | null> {
    return this.findOne({
      where: {
        spriteId,
        endedAt: null,
      },
    });
  }

  /**
   * Start a new session for a sprite
   */
  static async startSession(
    spriteId: string,
    projectId: string,
    organizationId: string,
    reason: SessionStartReason = 'created',
    startedById?: string
  ): Promise<SpriteSession> {
    // End any existing active session first
    const activeSession = await this.getActiveSession(spriteId);
    if (activeSession) {
      await activeSession.endSession('stopped', startedById);
    }

    return this.create({
      spriteId,
      projectId,
      organizationId,
      startedAt: new Date(),
      startReason: reason,
      startedById: startedById || null,
    });
  }

  /**
   * Get all sessions for a sprite
   */
  static async getSessionsForSprite(
    spriteId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<SpriteSession[]> {
    return this.findAll({
      where: { spriteId },
      order: [['startedAt', 'DESC']],
      limit: options.limit || 50,
      offset: options.offset || 0,
    });
  }

  /**
   * Get total runtime for a sprite (in seconds)
   */
  static async getTotalRuntime(spriteId: string): Promise<number> {
    // Get sum of completed sessions
    const result = await this.sum('durationSeconds', {
      where: {
        spriteId,
        endedAt: { [Op.ne]: null },
      },
    });

    let totalSeconds = result || 0;

    // Add current session duration if active
    const activeSession = await this.getActiveSession(spriteId);
    if (activeSession) {
      totalSeconds += activeSession.getDuration();
    }

    return totalSeconds;
  }

  /**
   * Get runtime for a specific time period
   */
  static async getRuntimeInPeriod(
    spriteId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const sessions = await this.findAll({
      where: {
        spriteId,
        startedAt: { [Op.lte]: endDate },
        [Op.or]: [
          { endedAt: null },
          { endedAt: { [Op.gte]: startDate } },
        ],
      },
    });

    let totalSeconds = 0;

    for (const session of sessions) {
      // Calculate overlap with the requested period
      const sessionStart = Math.max(session.startedAt.getTime(), startDate.getTime());
      const sessionEnd = Math.min(
        (session.endedAt || new Date()).getTime(),
        endDate.getTime()
      );

      if (sessionEnd > sessionStart) {
        totalSeconds += Math.floor((sessionEnd - sessionStart) / 1000);
      }
    }

    return totalSeconds;
  }

  /**
   * Get session count for a sprite
   */
  static async getSessionCount(spriteId: string): Promise<number> {
    return this.count({ where: { spriteId } });
  }

  /**
   * Get sessions for an organization
   */
  static async getSessionsForOrganization(
    organizationId: string,
    options: { limit?: number; offset?: number; startDate?: Date; endDate?: Date } = {}
  ): Promise<SpriteSession[]> {
    const where: Record<string, unknown> = { organizationId };

    if (options.startDate) {
      where.startedAt = { [Op.gte]: options.startDate };
    }
    if (options.endDate) {
      where.startedAt = {
        ...(where.startedAt as object || {}),
        [Op.lte]: options.endDate,
      };
    }

    return this.findAll({
      where,
      order: [['startedAt', 'DESC']],
      limit: options.limit || 100,
      offset: options.offset || 0,
    });
  }

  /**
   * Get total runtime for an organization (in seconds)
   */
  static async getOrganizationTotalRuntime(
    organizationId: string,
    options: { startDate?: Date; endDate?: Date } = {}
  ): Promise<number> {
    const where: Record<string, unknown> = {
      organizationId,
      endedAt: { [Op.ne]: null },
    };

    if (options.startDate) {
      where.startedAt = { [Op.gte]: options.startDate };
    }
    if (options.endDate) {
      where.startedAt = {
        ...(where.startedAt as object || {}),
        [Op.lte]: options.endDate,
      };
    }

    const result = await this.sum('durationSeconds', { where });
    let totalSeconds = result || 0;

    // Add active sessions
    const activeSessions = await this.findAll({
      where: {
        organizationId,
        endedAt: null,
      },
    });

    for (const session of activeSessions) {
      totalSeconds += session.getDuration();
    }

    return totalSeconds;
  }
}

SpriteSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    spriteId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'sprite_id',
      references: {
        model: 'project_sprites',
        key: 'id',
      },
      onDelete: 'CASCADE',
      comment: 'Reference to the project sprite',
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
      comment: 'Project this session belongs to',
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
      comment: 'Organization (denormalized for query efficiency)',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'started_at',
      comment: 'When the sprite session started',
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ended_at',
      comment: 'When the sprite session ended (NULL if still active)',
    },
    durationSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_seconds',
      comment: 'Calculated duration in seconds',
    },
    startReason: {
      type: DataTypes.ENUM('created', 'resumed', 'restored', 'restarted'),
      allowNull: false,
      defaultValue: 'created',
      field: 'start_reason',
      comment: 'Why the session started',
    },
    endReason: {
      type: DataTypes.ENUM('stopped', 'hibernated', 'error', 'deleted', 'checkpointed'),
      allowNull: true,
      field: 'end_reason',
      comment: 'Why the session ended',
    },
    startedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'started_by_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'User who started this session',
    },
    endedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'ended_by_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'User who ended this session',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional session metadata',
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
    tableName: 'sprite_sessions',
    modelName: 'SpriteSession',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['sprite_id'] },
      { fields: ['project_id'] },
      { fields: ['organization_id'] },
      { fields: ['started_at'] },
      { fields: ['ended_at'] },
    ],
  }
);

export default SpriteSession;
export { SpriteSessionAttributes, SpriteSessionCreationAttributes };
