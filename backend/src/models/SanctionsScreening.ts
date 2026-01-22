/**
 * Sanctions Screening Model
 *
 * Persists OFAC/sanctions screening results for compliance audit trail.
 * Tracks all parties screened and any matches found.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export interface SanctionsScreeningAttributes {
  id?: number;
  propertyId?: number;
  entityName: string;
  entityType: 'individual' | 'company';
  partyRole: 'seller' | 'buyer' | 'wholesaler' | 'agent' | 'broker' | 'other';
  screenedAt: Date;
  provider: 'ofac_api' | 'dow_jones' | 'world_check' | 'local_cache' | 'manual';
  matchFound: boolean;
  matchType?: 'exact' | 'fuzzy' | 'alias' | 'partial';
  matchScore?: number;
  matchDetails?: object;
  lists: string[];
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionStatus?: 'pending' | 'cleared' | 'blocked' | 'escalated';
  resolutionNotes?: string;
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

type SanctionsScreeningCreationAttributes = Optional<
  SanctionsScreeningAttributes,
  | 'id'
  | 'propertyId'
  | 'matchType'
  | 'matchScore'
  | 'matchDetails'
  | 'resolvedBy'
  | 'resolvedAt'
  | 'resolutionStatus'
  | 'resolutionNotes'
  | 'expiresAt'
  | 'createdAt'
  | 'updatedAt'
>;

class SanctionsScreening
  extends Model<SanctionsScreeningAttributes, SanctionsScreeningCreationAttributes>
  implements SanctionsScreeningAttributes
{
  declare id: number;
  declare propertyId?: number;
  declare entityName: string;
  declare entityType: 'individual' | 'company';
  declare partyRole: 'seller' | 'buyer' | 'wholesaler' | 'agent' | 'broker' | 'other';
  declare screenedAt: Date;
  declare provider: 'ofac_api' | 'dow_jones' | 'world_check' | 'local_cache' | 'manual';
  declare matchFound: boolean;
  declare matchType?: 'exact' | 'fuzzy' | 'alias' | 'partial';
  declare matchScore?: number;
  declare matchDetails?: object;
  declare lists: string[];
  declare resolvedBy?: string;
  declare resolvedAt?: Date;
  declare resolutionStatus?: 'pending' | 'cleared' | 'blocked' | 'escalated';
  declare resolutionNotes?: string;
  declare expiresAt?: Date;
  declare createdAt: Date;
  declare updatedAt: Date;

  /**
   * Get screenings for a property
   */
  static async getForProperty(propertyId: number): Promise<SanctionsScreening[]> {
    return this.findAll({
      where: { propertyId },
      order: [['screenedAt', 'DESC']],
    });
  }

  /**
   * Get pending matches requiring resolution
   */
  static async getPendingMatches(): Promise<SanctionsScreening[]> {
    return this.findAll({
      where: {
        matchFound: true,
        resolutionStatus: { [Op.or]: [null, 'pending'] },
      },
      order: [['matchScore', 'DESC'], ['screenedAt', 'ASC']],
    });
  }

  /**
   * Check if entity was recently screened (within cache TTL)
   */
  static async getRecentScreening(
    entityName: string,
    entityType: 'individual' | 'company',
    maxAgeHours: number = 24
  ): Promise<SanctionsScreening | null> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - maxAgeHours);

    return this.findOne({
      where: {
        entityName: { [Op.iLike]: entityName },
        entityType,
        screenedAt: { [Op.gte]: cutoff },
        expiresAt: { [Op.or]: [null, { [Op.gt]: new Date() }] },
      },
      order: [['screenedAt', 'DESC']],
    });
  }

  /**
   * Resolve a match
   */
  async resolve(
    userId: string,
    status: 'cleared' | 'blocked' | 'escalated',
    notes?: string
  ): Promise<void> {
    await this.update({
      resolvedBy: userId,
      resolvedAt: new Date(),
      resolutionStatus: status,
      resolutionNotes: notes,
    });
  }

  /**
   * Get screening statistics
   */
  static async getStats(options?: { since?: Date; propertyId?: number }): Promise<{
    total: number;
    matches: number;
    cleared: number;
    blocked: number;
    pending: number;
    byProvider: Record<string, number>;
    byPartyRole: Record<string, number>;
  }> {
    const where: any = {};
    if (options?.since) {
      where.screenedAt = { [Op.gte]: options.since };
    }
    if (options?.propertyId) {
      where.propertyId = options.propertyId;
    }

    const [total, matches, statusCounts, providerCounts, roleCounts] = await Promise.all([
      this.count({ where }),
      this.count({ where: { ...where, matchFound: true } }),
      this.findAll({
        where: { ...where, matchFound: true },
        attributes: ['resolutionStatus', [sequelize.fn('COUNT', '*'), 'count']],
        group: ['resolutionStatus'],
        raw: true,
      }),
      this.findAll({
        where,
        attributes: ['provider', [sequelize.fn('COUNT', '*'), 'count']],
        group: ['provider'],
        raw: true,
      }),
      this.findAll({
        where,
        attributes: ['partyRole', [sequelize.fn('COUNT', '*'), 'count']],
        group: ['partyRole'],
        raw: true,
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts as any[]) {
      statusMap[row.resolutionStatus || 'pending'] = parseInt(row.count);
    }

    const providerMap: Record<string, number> = {};
    for (const row of providerCounts as any[]) {
      providerMap[row.provider] = parseInt(row.count);
    }

    const roleMap: Record<string, number> = {};
    for (const row of roleCounts as any[]) {
      roleMap[row.partyRole] = parseInt(row.count);
    }

    return {
      total,
      matches,
      cleared: statusMap['cleared'] || 0,
      blocked: statusMap['blocked'] || 0,
      pending: statusMap['pending'] || 0,
      byProvider: providerMap,
      byPartyRole: roleMap,
    };
  }

  /**
   * Cleanup expired screenings
   */
  static async cleanup(retentionDays: number = 365): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    return this.destroy({
      where: {
        screenedAt: { [Op.lt]: cutoff },
        matchFound: false,
      },
    });
  }
}

SanctionsScreening.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'properties',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    entityName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    entityType: {
      type: DataTypes.ENUM('individual', 'company'),
      allowNull: false,
    },
    partyRole: {
      type: DataTypes.ENUM('seller', 'buyer', 'wholesaler', 'agent', 'broker', 'other'),
      allowNull: false,
    },
    screenedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    provider: {
      type: DataTypes.ENUM('ofac_api', 'dow_jones', 'world_check', 'local_cache', 'manual'),
      allowNull: false,
    },
    matchFound: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    matchType: {
      type: DataTypes.ENUM('exact', 'fuzzy', 'alias', 'partial'),
      allowNull: true,
    },
    matchScore: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    matchDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    lists: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: ['sdn'],
    },
    resolvedBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolutionStatus: {
      type: DataTypes.ENUM('pending', 'cleared', 'blocked', 'escalated'),
      allowNull: true,
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'sanctions_screenings',
    timestamps: true,
    indexes: [
      { fields: ['propertyId'] },
      { fields: ['entityName'] },
      { fields: ['entityType'] },
      { fields: ['matchFound'] },
      { fields: ['resolutionStatus'] },
      { fields: ['screenedAt'] },
      { fields: ['expiresAt'] },
    ],
  }
);

export default SanctionsScreening;
