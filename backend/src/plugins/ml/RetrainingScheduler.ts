/**
 * Retraining Scheduler
 *
 * Automatically triggers model retraining based on:
 * - New labeled outcomes
 * - Model age
 * - Performance degradation
 */

import cron from 'node-cron';
import { Op } from 'sequelize';
import { TrainingService, trainingService } from './TrainingService';
import { ModelManager, modelManager } from './ModelManager';
import { MLScoringPlugin, mlScoringPlugin } from './MLScoringPlugin';
import ModelVersion from '../../models/ModelVersion';
import FundFeedback from '../../models/FundFeedback';
import MLPrediction from '../../models/MLPrediction';
import { MLModelType } from '../../models/MLPrediction';
import {
  RetrainingConfig,
  RetrainingCheck,
  DEFAULT_RETRAINING_CONFIG,
} from './types';

export class RetrainingScheduler {
  private config: RetrainingConfig;
  private trainer: TrainingService;
  private manager: ModelManager;
  private plugin: MLScoringPlugin;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;

  constructor(
    config: Partial<RetrainingConfig> = {},
    trainer?: TrainingService,
    manager?: ModelManager,
    plugin?: MLScoringPlugin
  ) {
    this.config = { ...DEFAULT_RETRAINING_CONFIG, ...config };
    this.trainer = trainer || trainingService;
    this.manager = manager || modelManager;
    this.plugin = plugin || mlScoringPlugin;
  }

  /**
   * Check if a model should be retrained
   */
  async shouldRetrain(modelType: MLModelType): Promise<RetrainingCheck> {
    const activeModel = await ModelVersion.findOne({
      where: { modelType, isProduction: true, status: 'active' },
    });

    // No model exists - definitely should train
    if (!activeModel) {
      const canTrain = await this.trainer.canTrain(modelType);
      if (canTrain.canTrain) {
        return { should: true, reason: 'No active model exists' };
      }
      return { should: false, reason: canTrain.reason };
    }

    // Check age
    const ageInDays = (Date.now() - activeModel.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays > this.config.maxAgeDays) {
      return {
        should: true,
        reason: `Model is ${Math.floor(ageInDays)} days old (max: ${this.config.maxAgeDays})`,
        modelAge: ageInDays,
      };
    }

    // Check for new outcomes since model was created
    const newOutcomes = await FundFeedback.count({
      where: {
        createdAt: { [Op.gt]: activeModel.createdAt },
        responseType: { [Op.in]: ['offer_accepted', 'closed', 'passed'] },
      },
    });

    if (newOutcomes >= this.config.minNewOutcomes) {
      return {
        should: true,
        reason: `${newOutcomes} new labeled outcomes since last training`,
        newOutcomesCount: newOutcomes,
      };
    }

    // Check for performance degradation
    const performanceDrop = await this.checkPerformanceDrop(modelType, activeModel);
    if (performanceDrop !== null && performanceDrop > this.config.performanceDropThreshold) {
      return {
        should: true,
        reason: `Accuracy dropped by ${(performanceDrop * 100).toFixed(1)}%`,
        performanceDrop,
      };
    }

    return {
      should: false,
      reason: `Model is current (${Math.floor(ageInDays)} days old, ${newOutcomes} new outcomes)`,
    };
  }

  /**
   * Check if model accuracy has degraded
   */
  private async checkPerformanceDrop(
    modelType: MLModelType,
    activeModel: ModelVersion
  ): Promise<number | null> {
    // Get recent predictions with outcomes
    const recentPredictions = await MLPrediction.findAll({
      where: {
        modelType,
        modelVersion: activeModel.version,
        actualOutcome: { [Op.in]: ['positive', 'negative'] },
        createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      },
    });

    if (recentPredictions.length < 20) {
      return null; // Not enough data to measure
    }

    // Calculate recent accuracy
    let correct = 0;
    for (const pred of recentPredictions) {
      const predictedPositive = pred.predictedScore >= 0.5;
      const actualPositive = pred.actualOutcome === 'positive';
      if (predictedPositive === actualPositive) correct++;
    }
    const recentAccuracy = correct / recentPredictions.length;

    // Compare to model's original accuracy
    const originalAccuracy = activeModel.metrics?.accuracy || 0.7;
    const drop = originalAccuracy - recentAccuracy;

    return drop > 0 ? drop : null;
  }

  /**
   * Run retraining check and trigger if needed
   */
  async runCheck(): Promise<{
    checked: boolean;
    retrained: boolean;
    results: Record<MLModelType, RetrainingCheck>;
  }> {
    if (this.isRunning) {
      console.log('[Retraining] Check already in progress, skipping');
      return { checked: false, retrained: false, results: {} as any };
    }

    this.isRunning = true;
    const results: Record<string, RetrainingCheck> = {};
    let retrained = false;

    try {
      const modelTypes: MLModelType[] = ['deal_quality', 'fund_match'];

      for (const modelType of modelTypes) {
        const check = await this.shouldRetrain(modelType);
        results[modelType] = check;

        if (check.should) {
          console.log(`[Retraining] Triggering retraining for ${modelType}: ${check.reason}`);

          try {
            const result = await this.trainer.trainModel(modelType);

            if (result.success && result.modelVersion) {
              // Auto-promote if AUC improved
              const currentModel = await this.manager.getActiveModelInfo(modelType);
              const currentAuc = currentModel?.metrics?.auc || 0;
              const newAuc = result.metrics?.auc || 0;

              if (newAuc > currentAuc) {
                console.log(`[Retraining] New model ${result.modelVersion} has better AUC (${newAuc.toFixed(3)} vs ${currentAuc.toFixed(3)}), promoting`);
                await this.manager.promoteToProduction(modelType, result.modelVersion);
                await this.plugin.reloadModel();
                retrained = true;
              } else {
                console.log(`[Retraining] New model ${result.modelVersion} did not improve AUC, keeping current model`);
              }
            } else {
              console.log(`[Retraining] Training failed for ${modelType}: ${result.reason || result.error}`);
            }
          } catch (error: any) {
            console.error(`[Retraining] Error training ${modelType}:`, error.message);
          }
        }
      }

      return { checked: true, retrained, results: results as any };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.cronJob) {
      console.log('[Retraining] Scheduler already running');
      return;
    }

    // Parse scheduled time (format: "HH:MM")
    const [hour, minute] = this.config.scheduledTime.split(':').map(Number);

    // Create cron expression: minute hour * * * (every day at specified time)
    const cronExpression = `${minute} ${hour} * * *`;

    this.cronJob = cron.schedule(cronExpression, async () => {
      console.log('[Retraining] Running scheduled check...');
      const result = await this.runCheck();
      console.log('[Retraining] Scheduled check complete:', result);
    });

    console.log(`[Retraining] Scheduler started, will run daily at ${this.config.scheduledTime}`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[Retraining] Scheduler stopped');
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<RetrainingConfig>): void {
    this.config = { ...this.config, ...updates };

    // Restart scheduler with new config if running
    if (this.cronJob) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): RetrainingConfig {
    return { ...this.config };
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.cronJob !== null;
  }
}

// Singleton instance
export const retrainingScheduler = new RetrainingScheduler();
export default retrainingScheduler;
