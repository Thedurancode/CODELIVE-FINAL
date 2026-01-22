/**
 * Compliance Issue Review Model
 *
 * Stores human-in-the-loop decisions for compliance issues.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type ComplianceIssueDecision = 'confirmed' | 'dismissed' | 'overridden';

export interface ComplianceIssueReviewAttributes {
  id?: number;
  propertyId: number;
  checkId: number;
  issueId: string;
  ruleId?: number | null;
  decision: ComplianceIssueDecision;
  reviewerId?: string | null;
  reviewerEmail?: string | null;
  notes?: string | null;
  overrideSeverity?: string | null;
  overrideMessage?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ComplianceIssueReviewCreationAttributes
  extends Optional<ComplianceIssueReviewAttributes, 'id' | 'ruleId' | 'reviewerId' | 'reviewerEmail' | 'notes' | 'overrideSeverity' | 'overrideMessage' | 'createdAt' | 'updatedAt'> {}

class ComplianceIssueReview
  extends Model<ComplianceIssueReviewAttributes, ComplianceIssueReviewCreationAttributes>
  implements ComplianceIssueReviewAttributes
{
  declare id: number;
  declare propertyId: number;
  declare checkId: number;
  declare issueId: string;
  declare ruleId?: number | null;
  declare decision: ComplianceIssueDecision;
  declare reviewerId?: string | null;
  declare reviewerEmail?: string | null;
  declare notes?: string | null;
  declare overrideSeverity?: string | null;
  declare overrideMessage?: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ComplianceIssueReview.init(
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
    checkId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'compliance_checks',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    issueId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    ruleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    decision: {
      type: DataTypes.ENUM('confirmed', 'dismissed', 'overridden'),
      allowNull: false,
    },
    reviewerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reviewerEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    overrideSeverity: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    overrideMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'compliance_issue_reviews',
    timestamps: true,
    indexes: [
      { fields: ['propertyId'] },
      { fields: ['checkId'] },
      { fields: ['issueId'] },
      { fields: ['checkId', 'issueId'], unique: true },
    ],
  }
);

export default ComplianceIssueReview;
