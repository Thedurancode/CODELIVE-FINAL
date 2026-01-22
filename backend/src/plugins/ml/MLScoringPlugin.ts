/**
 * ML Scoring Plugin
 *
 * Implements IScoringPlugin interface to integrate ML predictions
 * into the existing scoring engine.
 */

import { NormalizedDeal, BuyBox, ScoreBreakdown } from '../types';
import { FeatureExtractor } from './FeatureExtractor';
import { ModelManager } from './ModelManager';
import { ScoreBlender } from './ScoreBlender';
import MLPrediction from '../../models/MLPrediction';
import FundFeedback from '../../models/FundFeedback';
import { MIN_TRAINING_SAMPLES } from './types';

export interface IScoringPlugin {
  name: string;
  score(deal: NormalizedDeal, buyBox: BuyBox): Promise<ScoreBreakdown[]>;
}

export class MLScoringPlugin implements IScoringPlugin {
  readonly name = 'ml_scoring';

  private modelManager: ModelManager;
  private featureExtractor: FeatureExtractor;
  private scoreBlender: ScoreBlender;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null; // Prevents race condition

  private static ML_WEIGHT = 15; // ML gets 15 points out of total

  constructor(
    modelManager?: ModelManager,
    featureExtractor?: FeatureExtractor,
    scoreBlender?: ScoreBlender
  ) {
    this.modelManager = modelManager || new ModelManager();
    this.featureExtractor = featureExtractor || new FeatureExtractor();
    this.scoreBlender = scoreBlender || new ScoreBlender();
  }

  /**
   * Initialize the plugin
   * Uses Promise-based pattern to prevent race conditions with concurrent requests
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) return;

    // If initialization is in progress, wait for it to complete
    // This prevents duplicate model loading from concurrent requests
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization and store the promise
    this.initializationPromise = this._doInitialize();

    try {
      await this.initializationPromise;
    } finally {
      // Clear the promise after completion (success or failure)
      // so future calls can retry if needed
      this.initializationPromise = null;
    }
  }

  /**
   * Internal initialization logic
   */
  private async _doInitialize(): Promise<void> {
    try {
      // Load active model
      await this.modelManager.loadActiveModel('deal_quality');

      // Update training data count for score blending
      const feedbackCount = await FundFeedback.count({
        where: {
          responseType: ['offer_accepted', 'closed', 'passed'],
        },
      });
      this.scoreBlender.setTrainingDataCount(feedbackCount);

      this.isInitialized = true;
      console.log('[ML Plugin] Initialized successfully');
    } catch (error) {
      console.log('[ML Plugin] Initialization failed (model may not exist yet):', error);
      this.isInitialized = true; // Still mark as initialized, will use cold-start
    }
  }

  /**
   * Score a deal using ML
   */
  async score(deal: NormalizedDeal, buyBox: BuyBox): Promise<ScoreBreakdown[]> {
    const results: ScoreBreakdown[] = [];

    // Ensure initialized
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Check if model is ready
    if (!this.modelManager.hasActiveModel('deal_quality')) {
      results.push(this.getColdStartBreakdown());
      return results;
    }

    try {
      // Extract features
      const features = this.featureExtractor.extractFeatures(deal, buyBox);

      // Get prediction
      const prediction = await this.modelManager.predict('deal_quality', features.raw);

      // Log prediction for feedback loop
      await this.logPrediction(deal, buyBox, prediction, features.raw);

      // Check if confidence meets threshold
      if (this.scoreBlender.shouldUseML() && prediction.confidence >= 0.6) {
        const earnedPoints = Math.round(prediction.score * MLScoringPlugin.ML_WEIGHT);

        results.push({
          criterion: 'ML Deal Quality',
          weight: MLScoringPlugin.ML_WEIGHT,
          maxPoints: MLScoringPlugin.ML_WEIGHT,
          earnedPoints,
          passed: prediction.score >= 0.5,
          details: this.formatPredictionDetails(prediction),
        });
      } else {
        results.push(this.getLowConfidenceBreakdown(prediction));
      }

      // Add fund-specific scoring if available
      if (buyBox.fundName && this.modelManager.hasActiveModel('fund_match')) {
        const fundScore = await this.scoreFundMatch(deal, buyBox);
        if (fundScore) {
          results.push(fundScore);
        }
      }
    } catch (error) {
      console.error('[ML Plugin] Scoring error:', error);
      results.push(this.getErrorBreakdown());
    }

    return results;
  }

  /**
   * Score how well a deal matches a specific fund's preferences
   */
  private async scoreFundMatch(
    deal: NormalizedDeal,
    buyBox: BuyBox
  ): Promise<ScoreBreakdown | null> {
    try {
      if (!this.modelManager.hasActiveModel('fund_match')) {
        return null;
      }

      const features = this.featureExtractor.extractFeatures(deal, buyBox);
      const prediction = await this.modelManager.predict('fund_match', features.raw);

      if (prediction.confidence < 0.6) {
        return null;
      }

      return {
        criterion: `${buyBox.fundName} Historical Fit`,
        weight: 10,
        maxPoints: 10,
        earnedPoints: Math.round(prediction.score * 10),
        passed: prediction.score >= 0.5,
        details: `Based on ${buyBox.fundName}'s past acceptance patterns: ${(prediction.score * 100).toFixed(1)}%`,
      };
    } catch (error) {
      console.error('[ML Plugin] Fund match scoring error:', error);
      return null;
    }
  }

  /**
   * Log prediction for feedback loop
   */
  private async logPrediction(
    deal: NormalizedDeal,
    buyBox: BuyBox,
    prediction: { score: number; confidence: number },
    featureVector: number[]
  ): Promise<void> {
    try {
      await MLPrediction.create({
        dealId: deal.externalId || `deal-${Date.now()}`,
        buyBoxId: buyBox.id,
        modelVersion: this.modelManager.getActiveVersion('deal_quality') || 'unknown',
        modelType: 'deal_quality',
        predictedScore: prediction.score,
        confidence: prediction.confidence,
        featureVector,
      });
    } catch (error) {
      console.error('[ML Plugin] Failed to log prediction:', error);
    }
  }

  /**
   * Format prediction details for display
   */
  private formatPredictionDetails(prediction: { score: number; confidence: number }): string {
    const percentage = (prediction.score * 100).toFixed(1);
    const confidence = (prediction.confidence * 100).toFixed(0);
    const version = this.modelManager.getActiveVersion('deal_quality') || 'unknown';

    let quality = 'Average';
    if (prediction.score >= 0.8) quality = 'Excellent';
    else if (prediction.score >= 0.6) quality = 'Good';
    else if (prediction.score < 0.4) quality = 'Poor';

    return `${quality} deal quality prediction: ${percentage}% success probability (${confidence}% confidence, model ${version})`;
  }

  /**
   * Get breakdown for cold start (no model trained)
   */
  private getColdStartBreakdown(): ScoreBreakdown {
    const trainingCount = this.scoreBlender.getConfig().trainingDataCount;
    const needed = MIN_TRAINING_SAMPLES - trainingCount;

    return {
      criterion: 'ML Deal Quality',
      weight: MLScoringPlugin.ML_WEIGHT,
      maxPoints: MLScoringPlugin.ML_WEIGHT,
      earnedPoints: Math.round(MLScoringPlugin.ML_WEIGHT * 0.5), // Neutral score
      passed: true,
      details: `ML model training in progress. Need ${needed} more labeled outcomes.`,
    };
  }

  /**
   * Get breakdown for low confidence predictions
   */
  private getLowConfidenceBreakdown(prediction: { score: number; confidence: number }): ScoreBreakdown {
    return {
      criterion: 'ML Deal Quality',
      weight: MLScoringPlugin.ML_WEIGHT,
      maxPoints: MLScoringPlugin.ML_WEIGHT,
      earnedPoints: Math.round(MLScoringPlugin.ML_WEIGHT * 0.5), // Neutral score
      passed: true,
      details: `ML confidence too low (${(prediction.confidence * 100).toFixed(0)}%) - using neutral score`,
    };
  }

  /**
   * Get breakdown when ML scoring fails
   */
  private getErrorBreakdown(): ScoreBreakdown {
    return {
      criterion: 'ML Deal Quality',
      weight: MLScoringPlugin.ML_WEIGHT,
      maxPoints: MLScoringPlugin.ML_WEIGHT,
      earnedPoints: Math.round(MLScoringPlugin.ML_WEIGHT * 0.5), // Neutral score
      passed: true,
      details: 'ML scoring temporarily unavailable - using neutral score',
    };
  }

  /**
   * Get current ML status
   */
  getStatus(): {
    isReady: boolean;
    hasModel: boolean;
    modelVersion: string | null;
    trainingDataCount: number;
    strategy: string;
  } {
    return {
      isReady: this.isInitialized,
      hasModel: this.modelManager.hasActiveModel('deal_quality'),
      modelVersion: this.modelManager.getActiveVersion('deal_quality'),
      trainingDataCount: this.scoreBlender.getConfig().trainingDataCount,
      strategy: this.scoreBlender.getStrategyExplanation(),
    };
  }

  /**
   * Refresh training data count
   */
  async refreshTrainingDataCount(): Promise<void> {
    const feedbackCount = await FundFeedback.count({
      where: {
        responseType: ['offer_accepted', 'closed', 'passed'],
      },
    });
    this.scoreBlender.setTrainingDataCount(feedbackCount);
  }

  /**
   * Reload model (after retraining)
   */
  async reloadModel(): Promise<void> {
    await this.modelManager.loadActiveModel('deal_quality');
    await this.refreshTrainingDataCount();
  }
}

// Singleton instance
export const mlScoringPlugin = new MLScoringPlugin();
export default mlScoringPlugin;
