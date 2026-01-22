/**
 * Training Run Model
 *
 * Tracks individual training job executions:
 * - Hyperparameters used
 * - Training progress and metrics
 * - Success/failure status
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type TrainingStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface Hyperparameters {
  learningRate: number;
  batchSize: number;
  epochs: number;
  hiddenLayers: number[];
  dropout?: number;
  optimizer: string;
  l2Regularization?: number;
  validationSplit?: number;
}

interface TrainingRunAttributes {
  id: string;
  modelVersionId?: string;

  // Configuration
  modelType: string;
  hyperparameters: Hyperparameters;

  // Progress
  status: TrainingStatus;
  currentEpoch?: number;
  totalEpochs: number;

  // Results
  trainingLoss?: number[];
  validationLoss?: number[];
  finalMetrics?: Record<string, number>;

  // Timing
  startedAt?: Date;
  completedAt?: Date;

  // Error handling
  errorMessage?: string;

  createdAt: Date;
}

interface TrainingRunCreationAttributes
  extends Optional<
    TrainingRunAttributes,
    | 'id'
    | 'modelVersionId'
    | 'currentEpoch'
    | 'trainingLoss'
    | 'validationLoss'
    | 'finalMetrics'
    | 'startedAt'
    | 'completedAt'
    | 'errorMessage'
    | 'createdAt'
  > {}

class TrainingRun
  extends Model<TrainingRunAttributes, TrainingRunCreationAttributes>
  implements TrainingRunAttributes
{
  declare id: string;
  declare modelVersionId: string | undefined;

  declare modelType: string;
  declare hyperparameters: Hyperparameters;

  declare status: TrainingStatus;
  declare currentEpoch: number | undefined;
  declare totalEpochs: number;

  declare trainingLoss: number[] | undefined;
  declare validationLoss: number[] | undefined;
  declare finalMetrics: Record<string, number> | undefined;

  declare startedAt: Date | undefined;
  declare completedAt: Date | undefined;

  declare errorMessage: string | undefined;

  declare readonly createdAt: Date;

  /**
   * Calculate training duration in milliseconds
   */
  getDurationMs(): number | null {
    if (!this.startedAt) return null;
    const endTime = this.completedAt || new Date();
    return endTime.getTime() - this.startedAt.getTime();
  }

  /**
   * Get training progress as percentage
   */
  getProgress(): number {
    if (!this.currentEpoch) return 0;
    return Math.round((this.currentEpoch / this.totalEpochs) * 100);
  }

  /**
   * Start the training run
   */
  async start(): Promise<void> {
    this.status = 'running';
    this.startedAt = new Date();
    this.trainingLoss = [];
    this.validationLoss = [];
    await this.save();
  }

  /**
   * Update epoch progress
   */
  async updateProgress(
    epoch: number,
    trainLoss: number,
    valLoss?: number
  ): Promise<void> {
    this.currentEpoch = epoch;

    if (!this.trainingLoss) this.trainingLoss = [];
    this.trainingLoss.push(trainLoss);

    if (valLoss !== undefined) {
      if (!this.validationLoss) this.validationLoss = [];
      this.validationLoss.push(valLoss);
    }

    await this.save();
  }

  /**
   * Complete the training run successfully
   */
  async complete(
    modelVersionId: string,
    metrics: Record<string, number>
  ): Promise<void> {
    this.status = 'completed';
    this.completedAt = new Date();
    this.modelVersionId = modelVersionId;
    this.finalMetrics = metrics;
    this.currentEpoch = this.totalEpochs;
    await this.save();
  }

  /**
   * Fail the training run
   */
  async fail(errorMessage: string): Promise<void> {
    this.status = 'failed';
    this.completedAt = new Date();
    this.errorMessage = errorMessage;
    await this.save();
  }
}

TrainingRun.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    modelVersionId: {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: 'model_versions',
        key: 'id',
      },
    },
    modelType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    hyperparameters: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('queued', 'running', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'queued',
    },
    currentEpoch: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    totalEpochs: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    trainingLoss: {
      type: DataTypes.ARRAY(DataTypes.FLOAT),
      allowNull: true,
    },
    validationLoss: {
      type: DataTypes.ARRAY(DataTypes.FLOAT),
      allowNull: true,
    },
    finalMetrics: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'training_runs',
    timestamps: false,
    indexes: [
      { fields: ['modelVersionId'] },
      { fields: ['modelType'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
      // For finding latest run per model type
      { fields: ['modelType', 'createdAt'] },
    ],
  }
);

export default TrainingRun;
