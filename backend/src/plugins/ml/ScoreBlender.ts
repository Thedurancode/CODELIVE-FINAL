/**
 * Score Blender
 *
 * Blends ML predictions with rule-based scores.
 * Implements adaptive weighting based on:
 * - ML confidence level
 * - Training data quantity
 * - Model performance history
 */

import {
  BlendConfig,
  BlendResult,
  BlendBreakdown,
  DEFAULT_BLEND_CONFIG,
} from './types';

export class ScoreBlender {
  private config: BlendConfig;

  constructor(config: Partial<BlendConfig> = {}) {
    this.config = { ...DEFAULT_BLEND_CONFIG, ...config };
  }

  /**
   * Blend ML score with rule-based score
   */
  blendScores(
    ruleBasedScore: number,
    mlScore: number,
    mlConfidence: number
  ): BlendResult {
    const { mlWeight, adjustmentReason } = this.calculateMLWeight(mlConfidence);
    const ruleWeight = 1 - mlWeight;

    // Weighted average
    const finalScore = (ruleBasedScore * ruleWeight) + (mlScore * mlWeight);

    return {
      finalScore: Math.round(finalScore * 100) / 100,
      breakdown: {
        ruleBasedScore,
        ruleWeight,
        mlScore,
        mlWeight,
        mlConfidence,
        adjustmentReason,
      },
    };
  }

  /**
   * Calculate adaptive ML weight based on confidence and data
   */
  private calculateMLWeight(mlConfidence: number): {
    mlWeight: number;
    adjustmentReason: string;
  } {
    let mlWeight = this.config.baseMLWeight;
    let adjustmentReason = 'Standard ML weight';

    // Reduce weight if confidence is below threshold
    if (mlConfidence < this.config.minConfidenceThreshold) {
      mlWeight = 0;
      adjustmentReason = `ML confidence (${(mlConfidence * 100).toFixed(0)}%) below threshold`;
      return { mlWeight, adjustmentReason };
    }

    // Scale weight by confidence (linear interpolation)
    if (mlConfidence < this.config.highConfidenceThreshold) {
      const confidenceRange = this.config.highConfidenceThreshold - this.config.minConfidenceThreshold;
      const confidenceAboveMin = mlConfidence - this.config.minConfidenceThreshold;
      const confidenceRatio = confidenceAboveMin / confidenceRange;

      mlWeight *= confidenceRatio;
      adjustmentReason = `ML weight scaled by confidence (${(mlConfidence * 100).toFixed(0)}%)`;
    }

    // Cap weight based on training data quantity
    if (this.config.trainingDataCount < this.config.minDataForFullWeight) {
      const dataRatio = this.config.trainingDataCount / this.config.minDataForFullWeight;
      const maxWeight = this.config.baseMLWeight * Math.max(0.2, dataRatio);

      if (mlWeight > maxWeight) {
        mlWeight = maxWeight;
        adjustmentReason = `ML weight capped (${this.config.trainingDataCount} training samples)`;
      }
    }

    return { mlWeight, adjustmentReason };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<BlendConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): BlendConfig {
    return { ...this.config };
  }

  /**
   * Set training data count (for weight adjustment)
   */
  setTrainingDataCount(count: number): void {
    this.config.trainingDataCount = count;
  }

  /**
   * Check if ML should be used based on current config
   */
  shouldUseML(): boolean {
    // Only use ML if we have some training data
    return this.config.trainingDataCount >= 100;
  }

  /**
   * Get explanation for current blending strategy
   */
  getStrategyExplanation(): string {
    const { trainingDataCount, minDataForFullWeight, baseMLWeight } = this.config;

    if (trainingDataCount < 100) {
      return 'Cold start: Collecting training data. ML scores not yet used.';
    }

    if (trainingDataCount < minDataForFullWeight) {
      const effectiveWeight = baseMLWeight * (trainingDataCount / minDataForFullWeight);
      return `Early training: ML weight limited to ${(effectiveWeight * 100).toFixed(0)}% (${trainingDataCount}/${minDataForFullWeight} samples)`;
    }

    return `Full ML: Using ${(baseMLWeight * 100).toFixed(0)}% ML weight with ${trainingDataCount} training samples`;
  }
}

// Singleton instance
export const scoreBlender = new ScoreBlender();
export default scoreBlender;
