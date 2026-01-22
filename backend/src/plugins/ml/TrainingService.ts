/**
 * Training Service
 *
 * Orchestrates ML model training:
 * - Data preparation from feedback
 * - Model training with validation
 * - Performance evaluation
 * - Model versioning and deployment
 */

import { Op } from 'sequelize';
import { DealQualityModel } from './models/DealQualityModel';
import { FeatureExtractor } from './FeatureExtractor';
import { ModelManager } from './ModelManager';
import FundFeedback from '../../models/FundFeedback';
import DealAction from '../../models/DealAction';
import DealOffer from '../../models/DealOffer';
import TrainingRun, { Hyperparameters } from '../../models/TrainingRun';
import { MLModelType } from '../../models/MLPrediction';
import {
  TrainingDataPoint,
  TrainingOptions,
  TrainingResult,
  ModelMetrics,
  DataSplit,
  MIN_TRAINING_SAMPLES,
  MODEL_AUC_THRESHOLD,
  NormalizationParams,
} from './types';
import { NormalizedDeal, BuyBox } from '../types';

const DEFAULT_HYPERPARAMETERS: Hyperparameters = {
  learningRate: 0.001,
  batchSize: 32,
  epochs: 100,
  hiddenLayers: [64, 32, 16],
  dropout: 0.3,
  optimizer: 'adam',
  l2Regularization: 0.01,
  validationSplit: 0.15,
};

export class TrainingService {
  private featureExtractor: FeatureExtractor;
  private modelManager: ModelManager;

  constructor(
    featureExtractor?: FeatureExtractor,
    modelManager?: ModelManager
  ) {
    this.featureExtractor = featureExtractor || new FeatureExtractor();
    this.modelManager = modelManager || new ModelManager();
  }

  /**
   * Check if we have enough data to train
   */
  async canTrain(modelType: MLModelType): Promise<{
    canTrain: boolean;
    reason: string;
    dataCount: number;
  }> {
    const data = await this.getTrainingDataset({ modelType });

    if (data.length < MIN_TRAINING_SAMPLES) {
      return {
        canTrain: false,
        reason: `Need ${MIN_TRAINING_SAMPLES - data.length} more labeled outcomes (have ${data.length})`,
        dataCount: data.length,
      };
    }

    // Check class balance
    const positives = data.filter(d => d.outcome === 'positive').length;
    const negatives = data.filter(d => d.outcome === 'negative').length;
    const minClassSize = Math.min(positives, negatives);

    if (minClassSize < 20) {
      return {
        canTrain: false,
        reason: `Class imbalance: ${positives} positives, ${negatives} negatives. Need at least 20 of each.`,
        dataCount: data.length,
      };
    }

    return {
      canTrain: true,
      reason: `Ready to train with ${data.length} samples (${positives} positive, ${negatives} negative)`,
      dataCount: data.length,
    };
  }

  /**
   * Get training dataset from feedback sources
   */
  async getTrainingDataset(options: {
    modelType?: MLModelType;
    since?: Date;
  } = {}): Promise<TrainingDataPoint[]> {
    const dataPoints: TrainingDataPoint[] = [];

    // 1. Fund Feedback (primary source)
    const fundFeedback = await FundFeedback.findAll({
      where: {
        responseType: {
          [Op.in]: ['offer_accepted', 'closed', 'passed', 'no_response'],
        },
        ...(options.since && { createdAt: { [Op.gte]: options.since } }),
      },
    });

    for (const feedback of fundFeedback) {
      // Only include stale no_response as negative
      if (feedback.responseType === 'no_response' && !feedback.isStale()) {
        continue;
      }

      dataPoints.push({
        dealSnapshot: feedback.dealSnapshot as unknown as Partial<NormalizedDeal>,
        buyBoxSnapshot: feedback.buyBoxSnapshot as Partial<BuyBox>,
        outcome: feedback.isPositiveOutcome() ? 'positive' : 'negative',
        feedbackType: 'fund_feedback',
        timestamp: feedback.createdAt,
      });
    }

    // 2. Deal Actions (supplementary - likes/passes with high engagement)
    const dealActions = await DealAction.findAll({
      where: {
        actionType: { [Op.in]: ['like', 'pass', 'offer'] },
        viewDuration: { [Op.gte]: 5000 }, // At least 5 seconds viewing
        ...(options.since && { createdAt: { [Op.gte]: options.since } }),
      },
    });

    for (const action of dealActions) {
      // Only use actions with deal snapshots
      if (!action.dealSnapshotPrice) continue;

      const dealSnapshot: Partial<NormalizedDeal> = {
        askingPrice: action.dealSnapshotPrice,
        arv: action.dealSnapshotArv,
        address: {
          street: '',
          city: action.dealSnapshotCity || '',
          state: action.dealSnapshotState || '',
          zip: '',
        },
        propertyType: action.dealSnapshotPropertyType,
        bedrooms: action.dealSnapshotBedrooms,
        bathrooms: action.dealSnapshotBathrooms,
        sqft: action.dealSnapshotSqft,
        yearBuilt: action.dealSnapshotYearBuilt,
      };

      dataPoints.push({
        dealSnapshot,
        outcome: action.actionType === 'pass' ? 'negative' : 'positive',
        feedbackType: 'deal_action',
        timestamp: action.createdAt,
      });
    }

    // 3. Deal Offers (offers that were accepted vs rejected)
    const dealOffers = await DealOffer.findAll({
      where: {
        status: { [Op.in]: ['accepted', 'rejected'] },
        ...(options.since && { createdAt: { [Op.gte]: options.since } }),
      },
    });

    for (const offer of dealOffers) {
      dataPoints.push({
        dealSnapshot: {
          askingPrice: offer.offerAmount,
        },
        outcome: offer.status === 'accepted' ? 'positive' : 'negative',
        feedbackType: 'deal_offer',
        timestamp: offer.createdAt,
      });
    }

    return dataPoints;
  }

  /**
   * Train a model
   */
  async trainModel(
    modelType: MLModelType,
    options: TrainingOptions = {}
  ): Promise<TrainingResult> {
    const hyperparameters: Hyperparameters = {
      ...DEFAULT_HYPERPARAMETERS,
      epochs: options.epochs || DEFAULT_HYPERPARAMETERS.epochs,
      batchSize: options.batchSize || DEFAULT_HYPERPARAMETERS.batchSize,
      learningRate: options.learningRate || DEFAULT_HYPERPARAMETERS.learningRate,
    };

    // Create training run record
    const trainingRun = await TrainingRun.create({
      modelType,
      hyperparameters,
      totalEpochs: hyperparameters.epochs,
      status: 'queued',
    });

    try {
      await trainingRun.start();

      // 1. Fetch training data
      console.log('[Training] Fetching training data...');
      const rawData = await this.getTrainingDataset({
        modelType,
        since: options.since,
      });

      if (rawData.length < MIN_TRAINING_SAMPLES) {
        await trainingRun.fail(`Insufficient data: ${rawData.length} samples`);
        return {
          success: false,
          reason: `Need at least ${MIN_TRAINING_SAMPLES} samples, have ${rawData.length}`,
          trainingDataCount: rawData.length,
        };
      }

      // 2. Prepare features and labels
      console.log('[Training] Extracting features...');
      const { features, labels } = this.prepareTrainingData(rawData);

      // 3. Split data
      const { train, validation, test } = this.splitData(features, labels, {
        trainRatio: 0.7,
        validationRatio: 0.15,
        testRatio: 0.15,
      });

      console.log(`[Training] Data split: ${train.features.length} train, ${validation.features.length} val, ${test.features.length} test`);

      // 4. Build and train model
      console.log('[Training] Building model...');
      const model = new DealQualityModel({
        inputDim: features[0].length,
        hiddenLayers: hyperparameters.hiddenLayers,
        learningRate: hyperparameters.learningRate,
      });

      model.buildModel(features[0].length);
      model.compile();

      console.log('[Training] Training model...');
      const history = await model.train(
        train.features,
        train.labels,
        validation.features,
        validation.labels,
        {
          epochs: hyperparameters.epochs,
          batchSize: hyperparameters.batchSize,
          earlyStopping: true,
          patience: 10,
        }
      );

      // Update training run with loss history
      const trainingLoss = history.history.loss as number[];
      const validationLoss = history.history.val_loss as number[] | undefined;

      trainingRun.trainingLoss = trainingLoss;
      trainingRun.validationLoss = validationLoss;
      await trainingRun.save();

      // 5. Evaluate on test set
      console.log('[Training] Evaluating model...');
      const metrics = await model.evaluate(test.features, test.labels);

      const auc = metrics.auc ?? 0;
      const accuracy = metrics.accuracy ?? 0;
      console.log(`[Training] Metrics: AUC=${auc.toFixed(3)}, Accuracy=${accuracy.toFixed(3)}`);

      // 6. Check quality threshold
      if (auc < MODEL_AUC_THRESHOLD) {
        await trainingRun.fail(`Model AUC (${auc.toFixed(3)}) below threshold (${MODEL_AUC_THRESHOLD})`);
        model.dispose();
        return {
          success: false,
          reason: `Model quality too low: AUC ${auc.toFixed(3)} < ${MODEL_AUC_THRESHOLD}`,
          metrics,
          trainingDataCount: rawData.length,
        };
      }

      // 7. Save model
      console.log('[Training] Saving model...');
      const extractorConfig = this.featureExtractor.getConfig();
      const featureConfig = {
        inputFeatures: [...extractorConfig.numericFeatures, ...extractorConfig.categoricalFeatures],
        inputDim: features[0].length,
        normalizationParams: this.featureExtractor.getNormalizationParams(),
      };

      const version = await this.modelManager.saveModel(
        model,
        modelType,
        metrics,
        featureConfig,
        rawData.length
      );

      // 8. Complete training run
      const metricsRecord: Record<string, number> = {};
      if (metrics.accuracy !== undefined) metricsRecord.accuracy = metrics.accuracy;
      if (metrics.auc !== undefined) metricsRecord.auc = metrics.auc;
      if (metrics.precision !== undefined) metricsRecord.precision = metrics.precision;
      if (metrics.recall !== undefined) metricsRecord.recall = metrics.recall;
      if (metrics.f1Score !== undefined) metricsRecord.f1Score = metrics.f1Score;
      await trainingRun.complete(version, metricsRecord);

      console.log(`[Training] Complete! Model version: ${version}`);

      return {
        success: true,
        modelVersion: version,
        metrics,
        trainingDataCount: rawData.length,
      };
    } catch (error: any) {
      console.error('[Training] Error:', error);
      await trainingRun.fail(error.message || 'Unknown error');
      return {
        success: false,
        error: error.message || 'Unknown error',
        trainingDataCount: 0,
      };
    }
  }

  /**
   * Prepare features and labels from raw data
   */
  private prepareTrainingData(rawData: TrainingDataPoint[]): {
    features: number[][];
    labels: number[];
  } {
    const features: number[][] = [];
    const labels: number[] = [];

    for (const point of rawData) {
      const featureVector = this.featureExtractor.extractFeatures(
        point.dealSnapshot as NormalizedDeal,
        point.buyBoxSnapshot as BuyBox | undefined
      );

      features.push(featureVector.raw);
      labels.push(point.outcome === 'positive' ? 1 : 0);
    }

    // Fit normalization on training data
    this.featureExtractor.fitNormalization(features);

    // Apply normalization
    const normalizedFeatures = features.map(f =>
      this.featureExtractor.isReady() ? f : f
    );

    return { features: normalizedFeatures, labels };
  }

  /**
   * Split data into train/validation/test sets
   */
  private splitData(
    features: number[][],
    labels: number[],
    ratios: { trainRatio: number; validationRatio: number; testRatio: number }
  ): { train: DataSplit; validation: DataSplit; test: DataSplit } {
    // Shuffle data
    const indices = Array.from({ length: features.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const shuffledFeatures = indices.map(i => features[i]);
    const shuffledLabels = indices.map(i => labels[i]);

    // Calculate split indices
    const trainEnd = Math.floor(features.length * ratios.trainRatio);
    const valEnd = trainEnd + Math.floor(features.length * ratios.validationRatio);

    return {
      train: {
        features: shuffledFeatures.slice(0, trainEnd),
        labels: shuffledLabels.slice(0, trainEnd),
      },
      validation: {
        features: shuffledFeatures.slice(trainEnd, valEnd),
        labels: shuffledLabels.slice(trainEnd, valEnd),
      },
      test: {
        features: shuffledFeatures.slice(valEnd),
        labels: shuffledLabels.slice(valEnd),
      },
    };
  }

  /**
   * Get training run history
   */
  async getTrainingHistory(
    modelType?: MLModelType,
    limit: number = 10
  ): Promise<TrainingRun[]> {
    return TrainingRun.findAll({
      where: modelType ? { modelType } : {},
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  /**
   * Get a specific training run
   */
  async getTrainingRun(runId: string): Promise<TrainingRun | null> {
    return TrainingRun.findByPk(runId);
  }
}

// Singleton instance
export const trainingService = new TrainingService();
export default trainingService;
