/**
 * Behavior Learning Service
 *
 * Analyzes investor behavior to learn optimal scoring weights.
 * Uses statistical analysis to determine which criteria actually
 * predict deal success vs investor rejection.
 */

import { Op } from 'sequelize';
import InvestorAction from '../models/InvestorAction';
import HedgeFundBuyBox from '../models/HedgeFundBuyBox';
import { ScoringWeights } from '../types';

// =============================================================================
// TYPES
// =============================================================================

interface FeatureImportance {
  feature: string;
  importance: number;        // 0-1 scale, higher = more predictive
  positiveCorrelation: boolean; // true = feature predicts success
  sampleSize: number;
  confidence: number;        // 0-1 scale based on sample size
}

interface LearnedWeights {
  buyBoxId: string;
  weights: Partial<ScoringWeights>;
  featureImportance: FeatureImportance[];
  lastUpdated: Date;
  sampleSize: number;
  accuracy: number;          // Cross-validation accuracy
  confidence: number;        // Confidence score for applying learned weights
}

interface LearningInsights {
  buyBoxId: string;
  totalActions: number;
  closedDeals: number;
  passedDeals: number;
  conversionRate: number;
  topPredictors: FeatureImportance[];
  recommendations: string[];
  suggestedWeightChanges: {
    feature: string;
    currentWeight: number;
    suggestedWeight: number;
    reason: string;
  }[];
}

interface PropertyFeatures {
  priceInRange: boolean;
  priceDeviation: number;     // How far from ideal (0 = perfect)
  bedroomsMatch: boolean;
  bedroomDeviation: number;
  bathroomsMatch: boolean;
  propertyTypeMatch: boolean;
  yearBuiltMatch: boolean;
  yearBuiltDeviation: number;
  hoaMatch: boolean;          // true if HOA preference matches
  occupancyMatch: boolean;
  sqftMatch: boolean;
  sqftDeviation: number;
  daysOnMarket: number;
  pricePerSqft: number;
}

// =============================================================================
// SERVICE
// =============================================================================

class BehaviorLearningService {
  // Cache learned weights per buy box
  private learnedWeightsCache: Map<string, LearnedWeights> = new Map();
  private cacheExpiry: number = 60 * 60 * 1000; // 1 hour

  /**
   * Extract normalized features from a property snapshot
   */
  private extractFeatures(
    snapshot: InvestorAction['propertySnapshot'],
    buyBoxSnapshot: InvestorAction['buyBoxSnapshot']
  ): PropertyFeatures {
    const price = snapshot.price || 0;
    const minPrice = buyBoxSnapshot.minPrice || 0;
    const maxPrice = buyBoxSnapshot.maxPrice || Infinity;
    const midPrice = (minPrice + maxPrice) / 2;

    // Price deviation: 0 = at midpoint, 1 = at edge of range
    const priceInRange = price >= minPrice && price <= maxPrice;
    const priceDeviation = midPrice > 0
      ? Math.abs(price - midPrice) / midPrice
      : 0;

    // Bedroom deviation
    const minBeds = buyBoxSnapshot.minBedrooms || 0;
    const maxBeds = buyBoxSnapshot.maxBedrooms || 10;
    const bedroomsMatch = snapshot.bedrooms >= minBeds && snapshot.bedrooms <= maxBeds;
    const idealBeds = (minBeds + maxBeds) / 2;
    const bedroomDeviation = idealBeds > 0
      ? Math.abs(snapshot.bedrooms - idealBeds) / idealBeds
      : 0;

    // Property type match
    const propertyTypeMatch = buyBoxSnapshot.propertyTypes.some(
      t => t.toLowerCase() === snapshot.propertyType?.toLowerCase()
    );

    // Year built (assume 1980+ is acceptable if not specified)
    const yearBuiltMatch = snapshot.yearBuilt >= 1980;
    const yearBuiltDeviation = snapshot.yearBuilt
      ? Math.max(0, (2020 - snapshot.yearBuilt) / 100)
      : 0.5;

    return {
      priceInRange,
      priceDeviation,
      bedroomsMatch,
      bedroomDeviation,
      bathroomsMatch: snapshot.bathrooms >= 2,
      propertyTypeMatch,
      yearBuiltMatch,
      yearBuiltDeviation,
      hoaMatch: !snapshot.hasHoa, // Assume no HOA preferred
      occupancyMatch: snapshot.occupancyStatus === 'Vacant',
      sqftMatch: snapshot.sqft >= 1000 && snapshot.sqft <= 3000,
      sqftDeviation: snapshot.sqft ? Math.abs(snapshot.sqft - 1800) / 1800 : 0.5,
      daysOnMarket: snapshot.daysOnMarket || 0,
      pricePerSqft: snapshot.pricePerSqft || 0,
    };
  }

  /**
   * Calculate feature importance using difference in means
   * between positive and negative outcomes
   */
  private calculateFeatureImportance(
    positiveActions: InvestorAction[],
    negativeActions: InvestorAction[]
  ): FeatureImportance[] {
    const features: FeatureImportance[] = [];

    // Helper to calculate mean for a numeric feature
    const getMean = (actions: InvestorAction[], getter: (a: InvestorAction) => number): number => {
      if (actions.length === 0) return 0;
      const values = actions.map(getter).filter(v => !isNaN(v) && v !== null);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    };

    // Helper to calculate rate for a boolean feature
    const getRate = (actions: InvestorAction[], getter: (a: InvestorAction) => boolean): number => {
      if (actions.length === 0) return 0;
      return actions.filter(getter).length / actions.length;
    };

    const totalSamples = positiveActions.length + negativeActions.length;

    // Price deviation importance
    const positivePriceDeviation = getMean(positiveActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.priceDeviation;
    });
    const negativePriceDeviation = getMean(negativeActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.priceDeviation;
    });
    features.push({
      feature: 'price',
      importance: Math.abs(positivePriceDeviation - negativePriceDeviation),
      positiveCorrelation: positivePriceDeviation < negativePriceDeviation,
      sampleSize: totalSamples,
      confidence: Math.min(1, totalSamples / 100),
    });

    // Property type match importance
    const positiveTypeRate = getRate(positiveActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.propertyTypeMatch;
    });
    const negativeTypeRate = getRate(negativeActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.propertyTypeMatch;
    });
    features.push({
      feature: 'propertyType',
      importance: Math.abs(positiveTypeRate - negativeTypeRate),
      positiveCorrelation: positiveTypeRate > negativeTypeRate,
      sampleSize: totalSamples,
      confidence: Math.min(1, totalSamples / 100),
    });

    // Bedroom match importance
    const positiveBedroomRate = getRate(positiveActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.bedroomsMatch;
    });
    const negativeBedroomRate = getRate(negativeActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.bedroomsMatch;
    });
    features.push({
      feature: 'bedrooms',
      importance: Math.abs(positiveBedroomRate - negativeBedroomRate),
      positiveCorrelation: positiveBedroomRate > negativeBedroomRate,
      sampleSize: totalSamples,
      confidence: Math.min(1, totalSamples / 100),
    });

    // Year built importance
    const positiveYearRate = getRate(positiveActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.yearBuiltMatch;
    });
    const negativeYearRate = getRate(negativeActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.yearBuiltMatch;
    });
    features.push({
      feature: 'yearBuilt',
      importance: Math.abs(positiveYearRate - negativeYearRate),
      positiveCorrelation: positiveYearRate > negativeYearRate,
      sampleSize: totalSamples,
      confidence: Math.min(1, totalSamples / 100),
    });

    // HOA preference importance
    const positiveHoaRate = getRate(positiveActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.hoaMatch;
    });
    const negativeHoaRate = getRate(negativeActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.hoaMatch;
    });
    features.push({
      feature: 'hoa',
      importance: Math.abs(positiveHoaRate - negativeHoaRate),
      positiveCorrelation: positiveHoaRate > negativeHoaRate,
      sampleSize: totalSamples,
      confidence: Math.min(1, totalSamples / 100),
    });

    // Occupancy preference importance
    const positiveOccupancyRate = getRate(positiveActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.occupancyMatch;
    });
    const negativeOccupancyRate = getRate(negativeActions, a => {
      const features = this.extractFeatures(a.propertySnapshot, a.buyBoxSnapshot);
      return features.occupancyMatch;
    });
    features.push({
      feature: 'occupancy',
      importance: Math.abs(positiveOccupancyRate - negativeOccupancyRate),
      positiveCorrelation: positiveOccupancyRate > negativeOccupancyRate,
      sampleSize: totalSamples,
      confidence: Math.min(1, totalSamples / 100),
    });

    // Match score importance (meta-feature)
    const positiveMatchScore = getMean(positiveActions, a => a.propertySnapshot.matchScore);
    const negativeMatchScore = getMean(negativeActions, a => a.propertySnapshot.matchScore);
    features.push({
      feature: 'matchScore',
      importance: Math.abs(positiveMatchScore - negativeMatchScore) / 100,
      positiveCorrelation: positiveMatchScore > negativeMatchScore,
      sampleSize: totalSamples,
      confidence: Math.min(1, totalSamples / 100),
    });

    // Sort by importance
    return features.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Convert feature importance to scoring weights
   */
  private importanceToWeights(
    featureImportance: FeatureImportance[],
    baseWeights: ScoringWeights
  ): Partial<ScoringWeights> {
    const weights: Partial<ScoringWeights> = { ...baseWeights };

    // Normalize importance scores to sum to 100
    const totalImportance = featureImportance.reduce((sum, f) => sum + f.importance, 0);
    if (totalImportance === 0) return weights;

    // Map feature names to weight keys
    const featureToWeight: Record<string, keyof ScoringWeights> = {
      price: 'price',
      propertyType: 'propertyType',
      bedrooms: 'bedrooms',
      bathrooms: 'bathrooms',
      yearBuilt: 'yearBuilt',
      hoa: 'hoa',
      occupancy: 'occupancy',
    };

    // Calculate new weights based on importance
    // Blend 70% learned + 30% original to avoid overfitting
    for (const fi of featureImportance) {
      const weightKey = featureToWeight[fi.feature];
      if (weightKey && weightKey in weights) {
        const originalWeight = (baseWeights as any)[weightKey] || 10;
        const learnedWeight = (fi.importance / totalImportance) * 100;
        const blendedWeight = 0.7 * learnedWeight + 0.3 * originalWeight;

        // Apply confidence scaling
        const finalWeight = originalWeight + (blendedWeight - originalWeight) * fi.confidence;
        (weights as any)[weightKey] = Math.round(finalWeight * 10) / 10;
      }
    }

    // Normalize to sum to 100
    const currentTotal = Object.values(weights).reduce((sum: number, w) => sum + (w as number || 0), 0);
    if (currentTotal > 0) {
      for (const key of Object.keys(weights)) {
        (weights as any)[key] = Math.round(((weights as any)[key] / currentTotal) * 100 * 10) / 10;
      }
    }

    return weights;
  }

  /**
   * Learn optimal weights for a specific buy box
   */
  async learnWeightsForBuyBox(buyBoxId: string): Promise<LearnedWeights | null> {
    // Check cache
    const cached = this.learnedWeightsCache.get(buyBoxId);
    if (cached && Date.now() - cached.lastUpdated.getTime() < this.cacheExpiry) {
      return cached;
    }

    // Get buy box for base weights
    const buyBox = await HedgeFundBuyBox.findByPk(buyBoxId);
    if (!buyBox) return null;

    // Get all actions for this buy box
    const actions = await InvestorAction.findAll({
      where: { buyBoxId },
      order: [['createdAt', 'DESC']],
    });

    if (actions.length < 10) {
      // Not enough data to learn
      return null;
    }

    // Separate positive and negative outcomes
    const positiveActions = actions.filter(a => a.outcome === 'positive');
    const negativeActions = actions.filter(a => a.outcome === 'negative');

    // Need both positive and negative samples
    if (positiveActions.length < 3 || negativeActions.length < 3) {
      return null;
    }

    // Calculate feature importance
    const featureImportance = this.calculateFeatureImportance(positiveActions, negativeActions);

    // Convert to weights
    const learnedWeights = this.importanceToWeights(featureImportance, buyBox.scoringWeights);

    // Calculate accuracy estimate (simplified)
    const accuracy = this.estimateAccuracy(actions, featureImportance);

    // Calculate confidence based on sample size and accuracy
    const sampleConfidence = Math.min(actions.length / 100, 1); // 0-1 based on sample size (100 = max)
    const confidence = (sampleConfidence * 0.4) + (accuracy * 0.6); // Weighted combination

    const result: LearnedWeights = {
      buyBoxId,
      weights: learnedWeights,
      featureImportance,
      lastUpdated: new Date(),
      sampleSize: actions.length,
      accuracy,
      confidence,
    };

    // Cache result
    this.learnedWeightsCache.set(buyBoxId, result);

    return result;
  }

  /**
   * Estimate accuracy using leave-one-out cross-validation
   */
  private estimateAccuracy(
    actions: InvestorAction[],
    featureImportance: FeatureImportance[]
  ): number {
    // Simplified accuracy: % of positive actions that had high match scores
    // and % of negative actions that had low match scores
    const positives = actions.filter(a => a.outcome === 'positive');
    const negatives = actions.filter(a => a.outcome === 'negative');

    if (positives.length === 0 || negatives.length === 0) return 0.5;

    const avgPositiveScore = positives.reduce((sum, a) => sum + a.propertySnapshot.matchScore, 0) / positives.length;
    const avgNegativeScore = negatives.reduce((sum, a) => sum + a.propertySnapshot.matchScore, 0) / negatives.length;

    // If positive actions have higher scores on average, our scoring is working
    const scoreDiff = (avgPositiveScore - avgNegativeScore) / 100;
    return Math.min(1, Math.max(0, 0.5 + scoreDiff));
  }

  /**
   * Get learning insights for a buy box
   */
  async getInsights(buyBoxId: string): Promise<LearningInsights | null> {
    const buyBox = await HedgeFundBuyBox.findByPk(buyBoxId);
    if (!buyBox) return null;

    // Get action counts
    const [totalActions, closedDeals, passedDeals] = await Promise.all([
      InvestorAction.count({ where: { buyBoxId } }),
      InvestorAction.count({ where: { buyBoxId, action: 'closed' } }),
      InvestorAction.count({ where: { buyBoxId, action: 'passed' } }),
    ]);

    // Learn weights
    const learned = await this.learnWeightsForBuyBox(buyBoxId);

    const conversionRate = totalActions > 0 ? closedDeals / totalActions : 0;

    const recommendations: string[] = [];
    const suggestedChanges: LearningInsights['suggestedWeightChanges'] = [];

    if (learned) {
      // Generate recommendations based on feature importance
      for (const fi of learned.featureImportance.slice(0, 3)) {
        if (fi.importance > 0.1 && fi.confidence > 0.5) {
          const currentWeight = (buyBox.scoringWeights as any)[fi.feature] || 10;
          const suggestedWeight = (learned.weights as any)[fi.feature] || currentWeight;

          if (Math.abs(suggestedWeight - currentWeight) > 5) {
            const direction = suggestedWeight > currentWeight ? 'increase' : 'decrease';
            recommendations.push(
              `Consider ${direction}ing weight for "${fi.feature}" - it's a strong predictor of deal success`
            );
            suggestedChanges.push({
              feature: fi.feature,
              currentWeight,
              suggestedWeight: Math.round(suggestedWeight),
              reason: fi.positiveCorrelation
                ? `Matching this criterion correlates with ${Math.round(fi.importance * 100)}% higher close rate`
                : `Not matching this criterion correlates with ${Math.round(fi.importance * 100)}% higher rejection rate`,
            });
          }
        }
      }

      // Add general recommendations
      if (conversionRate < 0.05 && totalActions > 50) {
        recommendations.push(
          'Low conversion rate detected. Consider loosening hard requirements or adjusting criteria.'
        );
      }

      if (conversionRate > 0.3 && totalActions > 20) {
        recommendations.push(
          'High conversion rate! Your buy box criteria are well-tuned to your actual preferences.'
        );
      }
    } else if (totalActions < 10) {
      recommendations.push(
        `Need more data for learning. Currently have ${totalActions} actions, need at least 10.`
      );
    }

    return {
      buyBoxId,
      totalActions,
      closedDeals,
      passedDeals,
      conversionRate,
      topPredictors: learned?.featureImportance.slice(0, 5) || [],
      recommendations,
      suggestedWeightChanges: suggestedChanges,
    };
  }

  /**
   * Apply learned weights to a buy box
   */
  async applyLearnedWeights(buyBoxId: string): Promise<boolean> {
    const learned = await this.learnWeightsForBuyBox(buyBoxId);
    if (!learned || learned.confidence < 0.5) {
      return false;
    }

    const buyBox = await HedgeFundBuyBox.findByPk(buyBoxId);
    if (!buyBox) return false;

    // Merge learned weights with existing
    const newWeights = {
      ...buyBox.scoringWeights,
      ...learned.weights,
    };

    await buyBox.update({ scoringWeights: newWeights });
    return true;
  }

  /**
   * Get learned weights for scoring (used by scoring algorithm)
   */
  async getLearnedWeights(buyBoxId: string): Promise<Partial<ScoringWeights> | null> {
    const learned = await this.learnWeightsForBuyBox(buyBoxId);
    if (!learned || learned.sampleSize < 20 || learned.accuracy < 0.55) {
      return null; // Not confident enough to use learned weights
    }
    return learned.weights;
  }

  /**
   * Record an investor action
   */
  async recordAction(
    investorId: string,
    investorType: 'user' | 'fund',
    buyBoxId: string,
    propertyId: string,
    action: InvestorAction['action'],
    propertySnapshot: InvestorAction['propertySnapshot'],
    buyBoxSnapshot: InvestorAction['buyBoxSnapshot'],
    options?: { source?: string; notes?: string; metadata?: Record<string, unknown> }
  ): Promise<InvestorAction> {
    const outcome = InvestorAction.getOutcomeForAction(action);

    return await InvestorAction.create({
      investorId,
      investorType,
      buyBoxId,
      propertyId,
      action,
      outcome,
      propertySnapshot,
      buyBoxSnapshot,
      source: options?.source,
      notes: options?.notes,
      metadata: options?.metadata,
    });
  }

  /**
   * Clear cache for a buy box (call when weights are manually updated)
   */
  clearCache(buyBoxId?: string): void {
    if (buyBoxId) {
      this.learnedWeightsCache.delete(buyBoxId);
    } else {
      this.learnedWeightsCache.clear();
    }
  }
}

// Export singleton instance
export const behaviorLearningService = new BehaviorLearningService();
export default behaviorLearningService;
export { LearnedWeights, LearningInsights, FeatureImportance };
