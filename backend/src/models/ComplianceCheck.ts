/**
 * Compliance Check Model
 *
 * Persists compliance check results for auditability and history.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type ComplianceStatus = 'Green' | 'Yellow' | 'Red';

export interface ComplianceIssueRecord {
  issueId?: string;
  ruleId: number;
  ruleName: string;
  category: string;
  field: string;
  severity: string;
  baseSeverity?: string;
  message: string;
  currentValue?: any;
  expectedValue?: string;
  valueSource?: string;
  sourceDetail?: Record<string, any>;
  links?: Record<string, string>;
  dataQuality?: Record<string, any>;
}

export interface RuleSnapshot {
  id: number;
  name: string;
  state: string;
  category: string;
  field: string;
  operator: string;
  value?: string;
  severity: string;
  message: string;
  enabled: boolean;
  order: number;
  evidenceRequirements?: Record<string, any>;
  evidenceSeverity?: string;
  severityOverrides?: Record<string, any>;
  validFrom?: Date;
  validTo?: Date;
  county?: string;
}

export interface ComplianceCheckAttributes {
  id?: number;
  propertyId: number;
  status: ComplianceStatus;
  state: string;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  issues: ComplianceIssueRecord[];
  passedChecks: string[];
  checkedAt: Date;
  // Compliance passport fields
  propertySnapshot?: Record<string, any>;
  propertySnapshotHash?: string;
  evidenceSnapshot?: Record<string, any>;
  evidenceHash?: string;
  compliancePassportHash?: string;
  // Rule versioning fields
  ruleSnapshot?: RuleSnapshot[];
  ruleVersionHash?: string;
  rulesEvaluated?: number;
  // Sanctions screening reference
  sanctionsCleared?: boolean;
  sanctionsCheckId?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

type ComplianceCheckCreationAttributes = Optional<
  ComplianceCheckAttributes,
  'id' | 'issues' | 'passedChecks' | 'propertySnapshot' | 'propertySnapshotHash' | 'evidenceSnapshot' | 'evidenceHash' | 'compliancePassportHash' | 'ruleSnapshot' | 'ruleVersionHash' | 'rulesEvaluated' | 'sanctionsCleared' | 'sanctionsCheckId' | 'createdAt' | 'updatedAt'
>;

class ComplianceCheck
  extends Model<ComplianceCheckAttributes, ComplianceCheckCreationAttributes>
  implements ComplianceCheckAttributes
{
  declare id: number;
  declare propertyId: number;
  declare status: ComplianceStatus;
  declare state: string;
  declare totalRules: number;
  declare passedRules: number;
  declare failedRules: number;
  declare issues: ComplianceIssueRecord[];
  declare passedChecks: string[];
  declare checkedAt: Date;
  declare propertySnapshot?: Record<string, any>;
  declare propertySnapshotHash?: string;
  declare evidenceSnapshot?: Record<string, any>;
  declare evidenceHash?: string;
  declare compliancePassportHash?: string;
  declare ruleSnapshot?: RuleSnapshot[];
  declare ruleVersionHash?: string;
  declare rulesEvaluated?: number;
  declare sanctionsCleared?: boolean;
  declare sanctionsCheckId?: number;
  declare createdAt: Date;
  declare updatedAt: Date;

  /**
   * Get the rules that were in effect when this check was performed
   */
  getRulesAtCheckTime(): RuleSnapshot[] {
    return this.ruleSnapshot || [];
  }

  /**
   * Verify that rules haven't changed since check
   */
  async verifyRulesUnchanged(): Promise<boolean> {
    if (!this.ruleVersionHash) return true;

    // Import here to avoid circular dependency
    const { createHash } = await import('crypto');
    const StateComplianceRule = (await import('./StateComplianceRule')).default;

    const currentRules = await StateComplianceRule.getRulesForState(this.state);
    const currentSnapshot = currentRules.map(r => ({
      id: r.id,
      name: r.name,
      state: r.state,
      category: r.category,
      field: r.field,
      operator: r.operator,
      value: r.value,
      severity: r.severity,
      message: r.message,
      enabled: r.enabled,
      order: r.order,
      evidenceRequirements: r.evidenceRequirements,
      evidenceSeverity: r.evidenceSeverity,
      validFrom: r.validFrom,
      validTo: r.validTo,
      county: r.county,
    }));

    const currentHash = createHash('sha256')
      .update(JSON.stringify(currentSnapshot))
      .digest('hex')
      .substring(0, 16);

    return currentHash === this.ruleVersionHash;
  }
}

ComplianceCheck.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    status: {
      type: DataTypes.ENUM('Green', 'Yellow', 'Red'),
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    totalRules: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    passedRules: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    failedRules: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    issues: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    passedChecks: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    checkedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    propertySnapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    propertySnapshotHash: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    evidenceSnapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    evidenceHash: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    compliancePassportHash: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    ruleSnapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    ruleVersionHash: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
    rulesEvaluated: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    sanctionsCleared: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    sanctionsCheckId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'compliance_checks',
    timestamps: true,
    indexes: [
      { fields: ['propertyId'] },
      { fields: ['status'] },
      { fields: ['state'] },
      { fields: ['checkedAt'] },
      { fields: ['ruleVersionHash'] },
      { fields: ['compliancePassportHash'] },
      { fields: ['propertySnapshotHash'] },
      { fields: ['evidenceHash'] },
    ],
  }
);

export default ComplianceCheck;
