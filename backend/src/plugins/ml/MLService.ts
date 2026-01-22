/**
 * ML Service
 *
 * Central service for ML functionality:
 * - Initialization and plugin registration
 * - Training orchestration
 * - Status reporting
 */

import { scoringEngine } from '../scoring/ScoringEngine';
import { mlScoringPlugin, MLScoringPlugin } from './MLScoringPlugin';
import { modelManager, ModelManager } from './ModelManager';
import { trainingService, TrainingService } from './TrainingService';
import { MLModelType } from '../../models/MLPrediction';
import FundFeedback from '../../models/FundFeedback';
import MLPrediction from '../../models/MLPrediction';
import ModelVersion from '../../models/ModelVersion';
import TrainingRun from '../../models/TrainingRun';
import { MIN_TRAINING_SAMPLES } from './types';

export interface MLServiceStatus {
  initialized: boolean;
  models: {
    deal_quality: ModelStatus;
    fund_match: ModelStatus;
  };
  training: {
    canTrain: boolean;
    dataCount: number;
    lastRun?: TrainingRunSummary;
  };
  predictions: {
    total: number;
    withOutcomes: number;
    accuracy?: number;
  };
}

export interface ModelStatus {
  hasActiveModel: boolean;
  version: string | null;
  isProduction: boolean;
  metrics?: {
    accuracy: number;
    auc: number;
  };
  createdAt?: Date;
}

export interface TrainingRunSummary {
  id: string;
  status: string;
  startedAt?: Date;
  completedAt?: Date;
  metrics?: Record<string, number>;
}

export class MLService {
  private isInitialized: boolean = false;
  private plugin: MLScoringPlugin;
  private manager: ModelManager;
  private trainer: TrainingService;

  constructor() {
    this.plugin = mlScoringPlugin;
    this.manager = modelManager;
    this.trainer = trainingService;
  }

  /**
   * Initialize the ML service and register with scoring engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[ML Service] Already initialized');
      return;
    }

    console.log('[ML Service] Initializing...');

    try {
      // Initialize model manager
      await this.manager.initialize();

      // Initialize the ML plugin
      await this.plugin.initialize();

      // Register plugin with scoring engine
      scoringEngine.registerPlugin(this.plugin);

      this.isInitialized = true;
      console.log('[ML Service] Initialized successfully');
    } catch (error) {
      console.error('[ML Service] Initialization failed:', error);
      // Don't throw - ML is optional, system should work without it
      // Note: isInitialized remains false, allowing retry on next call
    }
  }

  /**
   * Get comprehensive ML status
   */
  async getStatus(): Promise<MLServiceStatus> {
    const [
      dealQualityInfo,
      fundMatchInfo,
      canTrainResult,
      feedbackCount,
      predictionCount,
      predictionsWithOutcomes,
      lastTrainingRun,
    ] = await Promise.all([
      this.manager.getActiveModelInfo('deal_quality'),
      this.manager.getActiveModelInfo('fund_match'),
      this.trainer.canTrain('deal_quality'),
      FundFeedback.count(),
      MLPrediction.count(),
      MLPrediction.count({ where: { actualOutcome: ['positive', 'negative'] } }),
      TrainingRun.findOne({ order: [['createdAt', 'DESC']] }),
    ]);

    return {
      initialized: this.isInitialized,
      models: {
        deal_quality: {
          hasActiveModel: dealQualityInfo !== null,
          version: dealQualityInfo?.version || null,
          isProduction: dealQualityInfo?.isProduction || false,
          metrics: dealQualityInfo?.metrics ? {
            accuracy: dealQualityInfo.metrics.accuracy || 0,
            auc: dealQualityInfo.metrics.auc || 0,
          } : undefined,
          createdAt: dealQualityInfo?.createdAt,
        },
        fund_match: {
          hasActiveModel: fundMatchInfo !== null,
          version: fundMatchInfo?.version || null,
          isProduction: fundMatchInfo?.isProduction || false,
          metrics: fundMatchInfo?.metrics ? {
            accuracy: fundMatchInfo.metrics.accuracy || 0,
            auc: fundMatchInfo.metrics.auc || 0,
          } : undefined,
          createdAt: fundMatchInfo?.createdAt,
        },
      },
      training: {
        canTrain: canTrainResult.canTrain,
        dataCount: canTrainResult.dataCount,
        lastRun: lastTrainingRun ? {
          id: lastTrainingRun.id,
          status: lastTrainingRun.status,
          startedAt: lastTrainingRun.startedAt,
          completedAt: lastTrainingRun.completedAt,
          metrics: lastTrainingRun.finalMetrics,
        } : undefined,
      },
      predictions: {
        total: predictionCount,
        withOutcomes: predictionsWithOutcomes,
        accuracy: predictionsWithOutcomes > 0 ? await this.calculateRecentAccuracy() : undefined,
      },
    };
  }

  /**
   * Calculate recent prediction accuracy
   */
  private async calculateRecentAccuracy(): Promise<number | undefined> {
    const predictions = await MLPrediction.findAll({
      where: {
        actualOutcome: ['positive', 'negative'],
      },
      limit: 100,
      order: [['createdAt', 'DESC']],
    });

    if (predictions.length < 10) return undefined;

    let correct = 0;
    for (const pred of predictions) {
      const predictedPositive = pred.predictedScore >= 0.5;
      const actualPositive = pred.actualOutcome === 'positive';
      if (predictedPositive === actualPositive) correct++;
    }

    return correct / predictions.length;
  }

  /**
   * Trigger model training
   */
  async triggerTraining(modelType: MLModelType = 'deal_quality'): Promise<{
    success: boolean;
    message: string;
    runId?: string;
  }> {
    const canTrain = await this.trainer.canTrain(modelType);

    if (!canTrain.canTrain) {
      return {
        success: false,
        message: canTrain.reason,
      };
    }

    const result = await this.trainer.trainModel(modelType);

    if (result.success) {
      // Reload the plugin with new model
      await this.plugin.reloadModel();

      return {
        success: true,
        message: `Training complete. Model ${result.modelVersion} created with AUC ${result.metrics?.auc?.toFixed(3)}`,
        runId: result.modelVersion,
      };
    }

    return {
      success: false,
      message: result.reason || result.error || 'Training failed',
    };
  }

  /**
   * Promote a model to production
   */
  async promoteModel(modelType: MLModelType, version: string): Promise<void> {
    await this.manager.promoteToProduction(modelType, version);
    await this.plugin.reloadModel();
  }

  /**
   * Record fund feedback for training
   */
  async recordFeedback(data: {
    dealId: string;
    buyBoxId: string;
    fundName: string;
    responseType: 'interested' | 'passed' | 'offer_made' | 'offer_accepted' | 'closed' | 'no_response';
    submissionScore: number;
    dealSnapshot: Record<string, any>;
    buyBoxSnapshot?: Record<string, any>;
    offerAmount?: number;
    askingPrice?: number;
    responseNotes?: string;
  }): Promise<FundFeedback> {
    const feedback = await FundFeedback.create({
      ...data,
      submittedAt: new Date(),
      responseAt: data.responseType !== 'no_response' ? new Date() : undefined,
    } as any);

    // Update training data count
    await this.plugin.refreshTrainingDataCount();

    return feedback;
  }

  /**
   * Get training readiness info
   */
  async getTrainingReadiness(): Promise<{
    ready: boolean;
    dataCount: number;
    needed: number;
    breakdown: {
      fundFeedback: number;
      dealActions: number;
      dealOffers: number;
    };
  }> {
    const [fundFeedback, dealActions, dealOffers] = await Promise.all([
      FundFeedback.count({
        where: {
          responseType: ['offer_accepted', 'closed', 'passed'],
        },
      }),
      (await import('../../models/DealAction')).default.count({
        where: {
          actionType: ['like', 'pass', 'offer'],
          viewDuration: { [Symbol.for('gte')]: 5000 },
        },
      }),
      (await import('../../models/DealOffer')).default.count({
        where: {
          status: ['accepted', 'rejected'],
        },
      }),
    ]);

    const total = fundFeedback + dealActions + dealOffers;

    return {
      ready: total >= MIN_TRAINING_SAMPLES,
      dataCount: total,
      needed: Math.max(0, MIN_TRAINING_SAMPLES - total),
      breakdown: {
        fundFeedback,
        dealActions,
        dealOffers,
      },
    };
  }

  /**
   * Get model versions
   */
  async getModelVersions(modelType?: MLModelType): Promise<ModelVersion[]> {
    const where = modelType ? { modelType } : {};
    return ModelVersion.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get training history
   */
  async getTrainingHistory(limit: number = 10): Promise<TrainingRun[]> {
    return TrainingRun.findAll({
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  /**
   * Check if ML is ready for use
   */
  isReady(): boolean {
    return this.isInitialized && this.manager.hasActiveModel('deal_quality');
  }

  /**
   * Get plugin status
   */
  getPluginStatus() {
    return this.plugin.getStatus();
  }
}

// Singleton instance
export const mlService = new MLService();
export default mlService;
