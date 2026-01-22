/**
 * ML Prediction Model
 *
 * Audit log of all ML predictions for:
 * - Tracking prediction accuracy over time
 * - Backfilling outcomes for retraining
 * - Debugging and explainability
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type MLModelType = 'deal_quality' | 'fund_match' | 'close_probability';
export type PredictionOutcome = 'positive' | 'negative' | 'unknown';

interface MLPredictionAttributes {
  id: string;
  dealId: string;
  buyBoxId?: string;

  // Model info
  modelVersion: string;
  modelType: MLModelType;

  // Prediction results
  predictedScore: number;
  confidence: number;
  featureVector?: number[];

  // Actual outcome (filled in later for feedback loop)
  actualOutcome?: PredictionOutcome;
  outcomeRecordedAt?: Date;

  createdAt: Date;
}

interface MLPredictionCreationAttributes
  extends Optional<
    MLPredictionAttributes,
    | 'id'
    | 'buyBoxId'
    | 'featureVector'
    | 'actualOutcome'
    | 'outcomeRecordedAt'
    | 'createdAt'
  > {}

class MLPrediction
  extends Model<MLPredictionAttributes, MLPredictionCreationAttributes>
  implements MLPredictionAttributes
{
  declare id: string;
  declare dealId: string;
  declare buyBoxId: string | undefined;

  declare modelVersion: string;
  declare modelType: MLModelType;

  declare predictedScore: number;
  declare confidence: number;
  declare featureVector: number[] | undefined;

  declare actualOutcome: PredictionOutcome | undefined;
  declare outcomeRecordedAt: Date | undefined;

  declare readonly createdAt: Date;

  /**
   * Check if prediction was correct (for accuracy calculation)
   */
  isCorrect(): boolean | null {
    if (!this.actualOutcome || this.actualOutcome === 'unknown') {
      return null;
    }

    const predictedPositive = this.predictedScore >= 0.5;
    const actualPositive = this.actualOutcome === 'positive';
    return predictedPositive === actualPositive;
  }

  /**
   * Record the actual outcome for this prediction
   */
  async recordOutcome(outcome: PredictionOutcome): Promise<void> {
    this.actualOutcome = outcome;
    this.outcomeRecordedAt = new Date();
    await this.save();
  }
}

MLPrediction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    buyBoxId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    modelVersion: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    modelType: {
      type: DataTypes.ENUM('deal_quality', 'fund_match', 'close_probability'),
      allowNull: false,
    },
    predictedScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    featureVector: {
      type: DataTypes.ARRAY(DataTypes.FLOAT),
      allowNull: true,
    },
    actualOutcome: {
      type: DataTypes.ENUM('positive', 'negative', 'unknown'),
      allowNull: true,
    },
    outcomeRecordedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'ml_predictions',
    timestamps: false,
    indexes: [
      { fields: ['dealId'] },
      { fields: ['modelVersion'] },
      { fields: ['modelType'] },
      { fields: ['createdAt'] },
      { fields: ['actualOutcome'] },
      // Composite indexes for accuracy queries
      { fields: ['modelType', 'modelVersion', 'createdAt'] },
      { fields: ['modelType', 'actualOutcome'] },
    ],
  }
);

export default MLPrediction;
