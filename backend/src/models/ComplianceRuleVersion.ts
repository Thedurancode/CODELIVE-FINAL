/**
 * Compliance Rule Version Model
 *
 * Tracks historical versions of compliance rules for audit trail.
 * Enables proving what rules were in effect at any point in time.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';
import { createHash } from 'crypto';

export interface ComplianceRuleVersionAttributes {
  id?: number;
  ruleId: number;
  version: number;
  versionHash: string;
  snapshot: object;
  changedBy?: string;
  changeReason?: string;
  changeType: 'created' | 'updated' | 'deleted';
  effectiveFrom: Date;
  effectiveTo?: Date;
  createdAt?: Date;
}

type ComplianceRuleVersionCreationAttributes = Optional<
  ComplianceRuleVersionAttributes,
  'id' | 'effectiveTo' | 'changeReason' | 'changedBy' | 'createdAt'
>;

class ComplianceRuleVersion
  extends Model<ComplianceRuleVersionAttributes, ComplianceRuleVersionCreationAttributes>
  implements ComplianceRuleVersionAttributes
{
  declare id: number;
  declare ruleId: number;
  declare version: number;
  declare versionHash: string;
  declare snapshot: object;
  declare changedBy?: string;
  declare changeReason?: string;
  declare changeType: 'created' | 'updated' | 'deleted';
  declare effectiveFrom: Date;
  declare effectiveTo?: Date;
  declare createdAt: Date;

  /**
   * Create a version hash from rule snapshot
   */
  static generateHash(snapshot: object): string {
    return createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Create a new version record for a rule
   */
  static async createVersion(
    ruleId: number,
    snapshot: object,
    changeType: 'created' | 'updated' | 'deleted',
    options?: { changedBy?: string; changeReason?: string }
  ): Promise<ComplianceRuleVersion> {
    // Close previous version
    const previousVersion = await this.findOne({
      where: { ruleId, effectiveTo: { [Op.is]: null } } as any,
      order: [['version', 'DESC']],
    });

    if (previousVersion) {
      await previousVersion.update({ effectiveTo: new Date() });
    }

    const nextVersion = (previousVersion?.version || 0) + 1;
    const versionHash = this.generateHash(snapshot);

    return this.create({
      ruleId,
      version: nextVersion,
      versionHash,
      snapshot,
      changeType,
      changedBy: options?.changedBy,
      changeReason: options?.changeReason,
      effectiveFrom: new Date(),
    });
  }

  /**
   * Get the version of a rule at a specific point in time
   */
  static async getVersionAt(ruleId: number, timestamp: Date): Promise<ComplianceRuleVersion | null> {
    return this.findOne({
      where: {
        ruleId,
        effectiveFrom: { [Op.lte]: timestamp },
        [Op.or]: [
          { effectiveTo: { [Op.is]: null } },
          { effectiveTo: { [Op.gte]: timestamp } },
        ],
      } as any,
    });
  }

  /**
   * Get all versions of a rule
   */
  static async getVersionHistory(ruleId: number): Promise<ComplianceRuleVersion[]> {
    return this.findAll({
      where: { ruleId },
      order: [['version', 'DESC']],
    });
  }

  /**
   * Get current version of a rule
   */
  static async getCurrentVersion(ruleId: number): Promise<ComplianceRuleVersion | null> {
    return this.findOne({
      where: { ruleId, effectiveTo: { [Op.is]: null } } as any,
      order: [['version', 'DESC']],
    });
  }
}

ComplianceRuleVersion.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    ruleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'state_compliance_rules',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    versionHash: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    snapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    changedBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    changeReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    changeType: {
      type: DataTypes.ENUM('created', 'updated', 'deleted'),
      allowNull: false,
    },
    effectiveFrom: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    effectiveTo: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'compliance_rule_versions',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['ruleId'] },
      { fields: ['ruleId', 'version'], unique: true },
      { fields: ['versionHash'] },
      { fields: ['effectiveFrom'] },
      { fields: ['effectiveTo'] },
    ],
  }
);

export default ComplianceRuleVersion;
