/**
 * Model Version Model
 *
 * Tracks trained ML model versions:
 * - Model metadata and file paths
 * - Training metrics (accuracy, AUC, etc.)
 * - Production status and deployment
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import { MLModelType } from './MLPrediction';

export type ModelStatus = 'training' | 'validating' | 'active' | 'deprecated' | 'failed';

export interface ModelMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  auc?: number;
  validationLoss?: number;
  trainingLoss?: number;
}

export interface FeatureConfig {
  inputFeatures: string[];
  inputDim: number;
  normalizationParams: Record<string, { mean: number; std: number }>;
  categoricalEncodings?: Record<string, string[]>;
}

interface ModelVersionAttributes {
  id: string;
  modelType: MLModelType;
  version: string;

  // Training metadata
  trainingDataCount: number;
  trainingStartedAt: Date;
  trainingCompletedAt?: Date;

  // Model performance
  metrics?: ModelMetrics;

  // Model storage
  modelPath: string;
  weightsPath: string;

  // Status
  status: ModelStatus;
  isProduction: boolean;

  // Feature configuration
  featureConfig: FeatureConfig;

  createdAt: Date;
  updatedAt: Date;
}

interface ModelVersionCreationAttributes
  extends Optional<
    ModelVersionAttributes,
    | 'trainingCompletedAt'
    | 'metrics'
    | 'isProduction'
    | 'createdAt'
    | 'updatedAt'
  > {}

class ModelVersion
  extends Model<ModelVersionAttributes, ModelVersionCreationAttributes>
  implements ModelVersionAttributes
{
  declare id: string;
  declare modelType: MLModelType;
  declare version: string;

  declare trainingDataCount: number;
  declare trainingStartedAt: Date;
  declare trainingCompletedAt: Date | undefined;

  declare metrics: ModelMetrics | undefined;

  declare modelPath: string;
  declare weightsPath: string;

  declare status: ModelStatus;
  declare isProduction: boolean;

  declare featureConfig: FeatureConfig;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if this model meets minimum quality thresholds
   */
  meetsQualityThreshold(): boolean {
    if (!this.metrics) return false;
    return (this.metrics.auc || 0) >= 0.65;
  }

  /**
   * Get age in days since creation
   */
  getAgeInDays(): number {
    return (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  }

  /**
   * Promote this model to production
   */
  async promoteToProduction(): Promise<void> {
    // Demote current production model of same type
    await ModelVersion.update(
      { isProduction: false },
      { where: { modelType: this.modelType, isProduction: true } }
    );

    // Promote this model
    this.isProduction = true;
    this.status = 'active';
    await this.save();
  }

  /**
   * Deprecate this model
   */
  async deprecate(): Promise<void> {
    this.status = 'deprecated';
    this.isProduction = false;
    await this.save();
  }
}

ModelVersion.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    modelType: {
      type: DataTypes.ENUM('deal_quality', 'fund_match', 'close_probability'),
      allowNull: false,
    },
    version: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    trainingDataCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    trainingStartedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    trainingCompletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metrics: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    modelPath: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    weightsPath: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('training', 'validating', 'active', 'deprecated', 'failed'),
      allowNull: false,
      defaultValue: 'training',
    },
    isProduction: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    featureConfig: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'model_versions',
    timestamps: true,
    indexes: [
      { fields: ['modelType'] },
      { fields: ['status'] },
      { fields: ['isProduction'] },
      { fields: ['createdAt'] },
      // Composite for finding active production model
      { fields: ['modelType', 'isProduction', 'status'] },
    ],
  }
);

export default ModelVersion;
