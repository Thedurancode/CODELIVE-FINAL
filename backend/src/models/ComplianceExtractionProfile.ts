/**
 * Compliance Extraction Profile Model
 *
 * Per-state extraction profiles for powerful, state-specific document field extraction.
 * Enables configurable field labels, regex patterns, and vision prompts per state + template.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface FieldLabels {
  [field: string]: string[]; // e.g., seller: ['Seller', 'Grantor', 'Vendor']
}

export interface RegexHints {
  [field: string]: string; // e.g., seller: "/(?:seller|grantor)[:\\s]+([A-Z][a-z]+)/i"
}

export interface ExtractionStats {
  totalExtractions?: number;
  successfulExtractions?: number;
  averageConfidence?: number;
  fieldAccuracy?: Record<string, number>;
  lastExtraction?: Date;
}

export interface ComplianceExtractionProfileAttributes {
  id?: number;
  state: string;
  docuSealTemplateId?: string;
  category?: string;
  name: string;
  description?: string;
  fieldLabels: FieldLabels;
  regexHints: RegexHints;
  promptOverrides?: string;
  requiredFields: string[];
  minConfidence: number;
  enabled: boolean;
  priority: number;
  extractionStats?: ExtractionStats;
  createdAt?: Date;
  updatedAt?: Date;
}

type ComplianceExtractionProfileCreationAttributes = Optional<
  ComplianceExtractionProfileAttributes,
  | 'id'
  | 'docuSealTemplateId'
  | 'category'
  | 'description'
  | 'promptOverrides'
  | 'enabled'
  | 'priority'
  | 'extractionStats'
  | 'createdAt'
  | 'updatedAt'
>;

class ComplianceExtractionProfile
  extends Model<ComplianceExtractionProfileAttributes, ComplianceExtractionProfileCreationAttributes>
  implements ComplianceExtractionProfileAttributes
{
  declare id: number;
  declare state: string;
  declare docuSealTemplateId?: string;
  declare category?: string;
  declare name: string;
  declare description?: string;
  declare fieldLabels: FieldLabels;
  declare regexHints: RegexHints;
  declare promptOverrides?: string;
  declare requiredFields: string[];
  declare minConfidence: number;
  declare enabled: boolean;
  declare priority: number;
  declare extractionStats?: ExtractionStats;
  declare createdAt: Date;
  declare updatedAt: Date;

  /**
   * Find the best matching profile for a given state + template/category
   */
  static async findBestProfile(
    state: string,
    docuSealTemplateId?: string,
    category?: string
  ): Promise<ComplianceExtractionProfile | null> {
    // Try exact match first: state + templateId
    if (docuSealTemplateId) {
      const exactMatch = await ComplianceExtractionProfile.findOne({
        where: {
          state,
          docuSealTemplateId,
          enabled: true,
        },
        order: [['priority', 'DESC']],
      });
      if (exactMatch) return exactMatch;
    }

    // Try state + category match
    if (category) {
      const categoryMatch = await ComplianceExtractionProfile.findOne({
        where: {
          state,
          category,
          enabled: true,
        },
        order: [['priority', 'DESC']],
      });
      if (categoryMatch) return categoryMatch;
    }

    // Fallback: state-only match (generic for that state)
    const stateMatch = await ComplianceExtractionProfile.findOne({
      where: {
        state,
        enabled: true,
      },
      order: [['priority', 'DESC']],
    });

    return stateMatch;
  }

  /**
   * Get all profiles for a given state
   */
  static async getProfilesForState(state: string): Promise<ComplianceExtractionProfile[]> {
    return ComplianceExtractionProfile.findAll({
      where: {
        state,
        enabled: true,
      },
      order: [['priority', 'DESC']],
    });
  }

  /**
   * Update extraction statistics after each extraction
   */
  async recordExtraction(success: boolean, confidence: number, fieldResults?: Record<string, boolean>): Promise<void> {
    const stats = this.extractionStats || {
      totalExtractions: 0,
      successfulExtractions: 0,
      averageConfidence: 0,
      fieldAccuracy: {},
    };

    stats.totalExtractions = (stats.totalExtractions || 0) + 1;
    if (success) {
      stats.successfulExtractions = (stats.successfulExtractions || 0) + 1;
    }

    // Update average confidence (running average)
    const prevTotal = (stats.totalExtractions - 1) * (stats.averageConfidence || 0);
    stats.averageConfidence = (prevTotal + confidence) / stats.totalExtractions;

    // Update field accuracy
    if (fieldResults) {
      stats.fieldAccuracy = stats.fieldAccuracy || {};
      for (const [field, accurate] of Object.entries(fieldResults)) {
        const currentAccuracy = stats.fieldAccuracy[field] || 0.5;
        // Simple moving average
        stats.fieldAccuracy[field] = (currentAccuracy * 0.9) + (accurate ? 0.1 : 0);
      }
    }

    stats.lastExtraction = new Date();

    this.extractionStats = stats;
    await this.save();
  }

  /**
   * Get field labels for a specific field (with fallback)
   */
  getFieldLabels(field: string): string[] {
    return this.fieldLabels[field] || [];
  }

  /**
   * Get regex hint for a specific field
   */
  getRegexHint(field: string): string | undefined {
    return this.regexHints[field];
  }
}

ComplianceExtractionProfile.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    state: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },
    docuSealTemplateId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    fieldLabels: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    regexHints: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    promptOverrides: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    requiredFields: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    minConfidence: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 0.70,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    extractionStats: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'compliance_extraction_profiles',
    timestamps: true,
    indexes: [
      { fields: ['state'] },
      { fields: ['docuSealTemplateId'] },
      { fields: ['category'] },
      { fields: ['enabled'] },
      { fields: ['state', 'docuSealTemplateId', 'category'] },
    ],
  }
);

export default ComplianceExtractionProfile;
