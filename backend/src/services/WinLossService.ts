/**
 * Win/Loss Service
 *
 * Analyzes deal outcomes to learn from wins and losses:
 * - Track and categorize loss reasons
 * - Identify win patterns
 * - Calculate scoring accuracy
 * - Generate insights for improving buy boxes
 */

import { Op } from 'sequelize';
import FundFeedback, { LossCategory, LOSS_CATEGORIES } from '../models/FundFeedback';

// Win/Loss statistics
export interface WinLossStats {
  totalSubmissions: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  avgScoreForWins: number;
  avgScoreForLosses: number;
  avgResponseTime: number;
}

// Loss pattern
export interface LossPattern {
  category: LossCategory;
  count: number;
  percentage: number;
  avgScore: number;
  commonTraits: {
    avgPrice?: number;
    avgArv?: number;
    topStates?: string[];
    topPropertyTypes?: string[];
  };
}

// Win pattern
export interface WinPattern {
  avgScore: number;
  scoreRange: { min: number; max: number };
  avgDaysToClose: number;
  commonTraits: {
    avgPrice?: number;
    avgArv?: number;
    avgEquity?: number;
    topStates?: string[];
    topPropertyTypes?: string[];
  };
  winFactors: { factor: string; count: number }[];
}

// Accuracy metrics
export interface AccuracyMetrics {
  overallAccuracy: number;
  byScoreRange: {
    range: string;
    submissions: number;
    wins: number;
    accuracy: number;
  }[];
  optimalThreshold: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
}

// Insight for improvement
export interface Insight {
  type: 'warning' | 'suggestion' | 'opportunity';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  data?: any;
}

// Buy box improvement suggestion
export interface BuyBoxSuggestion {
  field: string;
  currentValue: any;
  suggestedValue: any;
  reason: string;
  confidence: number;
}

class WinLossService {
  /**
   * Record an outcome for a feedback entry
   */
  async recordOutcome(
    feedbackId: string,
    outcome: 'won' | 'lost',
    details: {
      lossCategory?: LossCategory;
      winFactors?: string[];
      lessonsLearned?: string;
      applyToFutureBuyBox?: boolean;
    } = {}
  ): Promise<FundFeedback> {
    const feedback = await FundFeedback.findByPk(feedbackId);
    if (!feedback) {
      throw new Error(`Feedback ${feedbackId} not found`);
    }

    // Update response type based on outcome
    if (outcome === 'won') {
      feedback.responseType = 'closed';
      feedback.winFactors = details.winFactors;
    } else {
      feedback.responseType = 'passed';
      feedback.lossCategory = details.lossCategory;
    }

    feedback.responseAt = new Date();
    feedback.lessonsLearned = details.lessonsLearned;
    feedback.applyToFutureBuyBox = details.applyToFutureBuyBox ?? false;

    // Calculate score accuracy
    if (outcome === 'won') {
      // High score + win = accurate
      feedback.scoreAccuracy = feedback.submissionScore >= 70 ? 100 : 50;
    } else {
      // Low score + loss = accurate, high score + loss = inaccurate
      feedback.scoreAccuracy = feedback.submissionScore < 70 ? 100 : 0;
    }

    await feedback.save();
    return feedback;
  }

  /**
   * Get win/loss statistics
   */
  async getWinLossStats(
    options: {
      userId?: string;
      buyBoxId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<WinLossStats> {
    const { userId, buyBoxId, startDate, endDate } = options;

    const where: any = {};
    if (buyBoxId) where.buyBoxId = buyBoxId;
    if (startDate || endDate) {
      where.submittedAt = {};
      if (startDate) where.submittedAt[Op.gte] = startDate;
      if (endDate) where.submittedAt[Op.lte] = endDate;
    }

    const feedbacks = await FundFeedback.findAll({ where });

    const wins = feedbacks.filter((f) => f.isPositiveOutcome());
    const losses = feedbacks.filter((f) => f.isNegativeOutcome());
    const pending = feedbacks.filter(
      (f) => !f.isPositiveOutcome() && !f.isNegativeOutcome()
    );

    // Calculate averages
    const avgScoreForWins =
      wins.length > 0
        ? wins.reduce((sum, f) => sum + f.submissionScore, 0) / wins.length
        : 0;

    const avgScoreForLosses =
      losses.length > 0
        ? losses.reduce((sum, f) => sum + f.submissionScore, 0) / losses.length
        : 0;

    // Calculate average response time
    const withResponse = feedbacks.filter((f) => f.responseAt);
    const avgResponseTime =
      withResponse.length > 0
        ? withResponse.reduce((sum, f) => {
            const responseTime =
              f.responseAt!.getTime() - f.submittedAt.getTime();
            return sum + responseTime / (1000 * 60 * 60 * 24); // days
          }, 0) / withResponse.length
        : 0;

    return {
      totalSubmissions: feedbacks.length,
      wins: wins.length,
      losses: losses.length,
      pending: pending.length,
      winRate:
        wins.length + losses.length > 0
          ? (wins.length / (wins.length + losses.length)) * 100
          : 0,
      avgScoreForWins,
      avgScoreForLosses,
      avgResponseTime,
    };
  }

  /**
   * Get loss patterns
   */
  async getLossPatterns(
    options: {
      buyBoxId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<LossPattern[]> {
    const { buyBoxId, startDate, endDate } = options;

    const where: any = {
      responseType: 'passed',
      lossCategory: { [Op.ne]: null },
    };
    if (buyBoxId) where.buyBoxId = buyBoxId;
    if (startDate || endDate) {
      where.submittedAt = {};
      if (startDate) where.submittedAt[Op.gte] = startDate;
      if (endDate) where.submittedAt[Op.lte] = endDate;
    }

    const losses = await FundFeedback.findAll({ where });
    const totalLosses = losses.length;

    // Group by category
    const byCategory: Record<LossCategory, FundFeedback[]> = {} as any;
    for (const category of LOSS_CATEGORIES) {
      byCategory[category] = [];
    }

    for (const loss of losses) {
      if (loss.lossCategory) {
        byCategory[loss.lossCategory].push(loss);
      }
    }

    // Build patterns
    const patterns: LossPattern[] = [];
    for (const [category, items] of Object.entries(byCategory)) {
      if (items.length === 0) continue;

      const avgScore =
        items.reduce((sum, f) => sum + f.submissionScore, 0) / items.length;

      // Analyze common traits from deal snapshots
      const prices = items
        .map((f) => f.dealSnapshot.price)
        .filter((p) => p != null) as number[];
      const arvs = items
        .map((f) => f.dealSnapshot.arv)
        .filter((a) => a != null) as number[];
      const states = items.map((f) => f.dealSnapshot.state).filter(Boolean);
      const types = items
        .map((f) => f.dealSnapshot.propertyType)
        .filter(Boolean);

      // Get top states and types
      const stateCounts: Record<string, number> = {};
      const typeCounts: Record<string, number> = {};
      for (const s of states) stateCounts[s] = (stateCounts[s] || 0) + 1;
      for (const t of types) typeCounts[t!] = (typeCounts[t!] || 0) + 1;

      patterns.push({
        category: category as LossCategory,
        count: items.length,
        percentage: totalLosses > 0 ? (items.length / totalLosses) * 100 : 0,
        avgScore,
        commonTraits: {
          avgPrice:
            prices.length > 0
              ? prices.reduce((a, b) => a + b, 0) / prices.length
              : undefined,
          avgArv:
            arvs.length > 0
              ? arvs.reduce((a, b) => a + b, 0) / arvs.length
              : undefined,
          topStates: Object.entries(stateCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([s]) => s),
          topPropertyTypes: Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([t]) => t),
        },
      });
    }

    return patterns.sort((a, b) => b.count - a.count);
  }

  /**
   * Get win patterns
   */
  async getWinPatterns(
    options: {
      buyBoxId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<WinPattern> {
    const { buyBoxId, startDate, endDate } = options;

    const where: any = {
      responseType: { [Op.in]: ['offer_accepted', 'closed'] },
    };
    if (buyBoxId) where.buyBoxId = buyBoxId;
    if (startDate || endDate) {
      where.submittedAt = {};
      if (startDate) where.submittedAt[Op.gte] = startDate;
      if (endDate) where.submittedAt[Op.lte] = endDate;
    }

    const wins = await FundFeedback.findAll({ where });

    if (wins.length === 0) {
      return {
        avgScore: 0,
        scoreRange: { min: 0, max: 0 },
        avgDaysToClose: 0,
        commonTraits: {},
        winFactors: [],
      };
    }

    // Calculate score stats
    const scores = wins.map((w) => w.submissionScore);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Calculate days to close
    const daysToClose = wins
      .filter((w) => w.responseAt)
      .map((w) => {
        const diff = w.responseAt!.getTime() - w.submittedAt.getTime();
        return diff / (1000 * 60 * 60 * 24);
      });

    // Analyze common traits
    const prices = wins
      .map((w) => w.dealSnapshot.price)
      .filter((p) => p != null) as number[];
    const arvs = wins
      .map((w) => w.dealSnapshot.arv)
      .filter((a) => a != null) as number[];
    const equities = wins
      .map((w) => w.dealSnapshot.equity)
      .filter((e) => e != null) as number[];
    const states = wins.map((w) => w.dealSnapshot.state).filter(Boolean);
    const types = wins.map((w) => w.dealSnapshot.propertyType).filter(Boolean);

    // Count states and types
    const stateCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    for (const s of states) stateCounts[s] = (stateCounts[s] || 0) + 1;
    for (const t of types) typeCounts[t!] = (typeCounts[t!] || 0) + 1;

    // Count win factors
    const factorCounts: Record<string, number> = {};
    for (const w of wins) {
      for (const factor of w.winFactors || []) {
        factorCounts[factor] = (factorCounts[factor] || 0) + 1;
      }
    }

    return {
      avgScore,
      scoreRange: scores.length > 0
        ? { min: Math.min(...scores), max: Math.max(...scores) }
        : { min: 0, max: 0 },
      avgDaysToClose:
        daysToClose.length > 0
          ? daysToClose.reduce((a, b) => a + b, 0) / daysToClose.length
          : 0,
      commonTraits: {
        avgPrice:
          prices.length > 0
            ? prices.reduce((a, b) => a + b, 0) / prices.length
            : undefined,
        avgArv:
          arvs.length > 0
            ? arvs.reduce((a, b) => a + b, 0) / arvs.length
            : undefined,
        avgEquity:
          equities.length > 0
            ? equities.reduce((a, b) => a + b, 0) / equities.length
            : undefined,
        topStates: Object.entries(stateCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([s]) => s),
        topPropertyTypes: Object.entries(typeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t]) => t),
      },
      winFactors: Object.entries(factorCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([factor, count]) => ({ factor, count })),
    };
  }

  /**
   * Get scoring accuracy metrics
   */
  async getScoringAccuracy(
    options: {
      buyBoxId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<AccuracyMetrics> {
    const { buyBoxId, startDate, endDate } = options;

    const where: any = {
      responseType: { [Op.in]: ['passed', 'offer_accepted', 'closed'] },
    };
    if (buyBoxId) where.buyBoxId = buyBoxId;
    if (startDate || endDate) {
      where.submittedAt = {};
      if (startDate) where.submittedAt[Op.gte] = startDate;
      if (endDate) where.submittedAt[Op.lte] = endDate;
    }

    const feedbacks = await FundFeedback.findAll({ where });

    // Define score ranges
    const ranges = [
      { min: 0, max: 50, label: '0-50%' },
      { min: 50, max: 70, label: '50-70%' },
      { min: 70, max: 85, label: '70-85%' },
      { min: 85, max: 100, label: '85-100%' },
    ];

    const byRange = ranges.map((range) => {
      const inRange = feedbacks.filter(
        (f) => f.submissionScore >= range.min && f.submissionScore < range.max
      );
      const wins = inRange.filter((f) => f.isPositiveOutcome());

      return {
        range: range.label,
        submissions: inRange.length,
        wins: wins.length,
        accuracy:
          inRange.length > 0 ? (wins.length / inRange.length) * 100 : 0,
      };
    });

    // Find optimal threshold (score where win rate > 50%)
    let optimalThreshold = 70;
    for (const range of byRange) {
      if (range.accuracy >= 50) {
        optimalThreshold = parseInt(range.range.split('-')[0]);
        break;
      }
    }

    // Calculate false positive/negative rates
    const highScoreThreshold = 70;
    const highScoreDeals = feedbacks.filter(
      (f) => f.submissionScore >= highScoreThreshold
    );
    const lowScoreDeals = feedbacks.filter(
      (f) => f.submissionScore < highScoreThreshold
    );

    const falsePositives = highScoreDeals.filter((f) =>
      f.isNegativeOutcome()
    ).length;
    const falseNegatives = lowScoreDeals.filter((f) =>
      f.isPositiveOutcome()
    ).length;

    return {
      overallAccuracy:
        feedbacks.length > 0
          ? (feedbacks.filter(
              (f) =>
                (f.submissionScore >= 70 && f.isPositiveOutcome()) ||
                (f.submissionScore < 70 && f.isNegativeOutcome())
            ).length /
              feedbacks.length) *
            100
          : 0,
      byScoreRange: byRange,
      optimalThreshold,
      falsePositiveRate:
        highScoreDeals.length > 0
          ? (falsePositives / highScoreDeals.length) * 100
          : 0,
      falseNegativeRate:
        lowScoreDeals.length > 0
          ? (falseNegatives / lowScoreDeals.length) * 100
          : 0,
    };
  }

  /**
   * Generate insights from win/loss data
   */
  async generateInsights(
    options: {
      buyBoxId?: string;
    } = {}
  ): Promise<Insight[]> {
    const { buyBoxId } = options;

    const insights: Insight[] = [];

    // Get stats and patterns
    const stats = await this.getWinLossStats({ buyBoxId });
    const lossPatterns = await this.getLossPatterns({ buyBoxId });
    const winPatterns = await this.getWinPatterns({ buyBoxId });
    const accuracy = await this.getScoringAccuracy({ buyBoxId });

    // Low win rate warning
    if (stats.winRate < 30 && stats.totalSubmissions > 10) {
      insights.push({
        type: 'warning',
        title: 'Low Win Rate',
        description: `Your win rate is ${stats.winRate.toFixed(1)}%. Consider adjusting your buy box criteria or submission strategy.`,
        impact: 'high',
        data: { winRate: stats.winRate },
      });
    }

    // High false positive rate
    if (accuracy.falsePositiveRate > 40) {
      insights.push({
        type: 'warning',
        title: 'High False Positive Rate',
        description: `${accuracy.falsePositiveRate.toFixed(1)}% of high-scoring deals are being rejected. Your scoring may be too optimistic.`,
        impact: 'high',
        data: { falsePositiveRate: accuracy.falsePositiveRate },
      });
    }

    // Dominant loss category
    if (lossPatterns.length > 0 && lossPatterns[0].percentage > 40) {
      const topLoss = lossPatterns[0];
      insights.push({
        type: 'suggestion',
        title: `Focus on ${topLoss.category.replace('_', ' ')} Issues`,
        description: `${topLoss.percentage.toFixed(1)}% of losses are due to ${topLoss.category}. Consider adjusting your criteria.`,
        impact: 'medium',
        data: { category: topLoss.category, percentage: topLoss.percentage },
      });
    }

    // Win pattern opportunity
    if (winPatterns.avgScore > 0) {
      insights.push({
        type: 'opportunity',
        title: 'Winning Score Range',
        description: `Winning deals average ${winPatterns.avgScore.toFixed(1)}% score (range: ${winPatterns.scoreRange.min.toFixed(0)}-${winPatterns.scoreRange.max.toFixed(0)}%). Target this range.`,
        impact: 'medium',
        data: winPatterns.scoreRange,
      });
    }

    // Quick response opportunity
    if (stats.avgResponseTime < 3 && stats.wins > 0) {
      insights.push({
        type: 'opportunity',
        title: 'Fast Responses',
        description: `Average response time is ${stats.avgResponseTime.toFixed(1)} days. This fund responds quickly - prioritize submissions here.`,
        impact: 'low',
        data: { avgResponseTime: stats.avgResponseTime },
      });
    }

    return insights;
  }

  /**
   * Suggest buy box improvements based on win/loss data
   */
  async suggestBuyBoxImprovements(
    buyBoxId: string
  ): Promise<BuyBoxSuggestion[]> {
    const suggestions: BuyBoxSuggestion[] = [];

    const lossPatterns = await this.getLossPatterns({ buyBoxId });
    const winPatterns = await this.getWinPatterns({ buyBoxId });

    // Price-related suggestion
    const priceLoss = lossPatterns.find((p) => p.category === 'price');
    if (priceLoss && priceLoss.percentage > 30 && winPatterns.commonTraits.avgPrice) {
      suggestions.push({
        field: 'maxPrice',
        currentValue: 'unknown',
        suggestedValue: Math.round(winPatterns.commonTraits.avgPrice * 0.9),
        reason: `${priceLoss.percentage.toFixed(0)}% of losses are price-related. Winning deals average $${winPatterns.commonTraits.avgPrice?.toLocaleString()}.`,
        confidence: 0.7,
      });
    }

    // Location-related suggestion
    const locationLoss = lossPatterns.find((p) => p.category === 'location');
    if (locationLoss && locationLoss.percentage > 25 && winPatterns.commonTraits.topStates) {
      suggestions.push({
        field: 'states',
        currentValue: 'current states',
        suggestedValue: winPatterns.commonTraits.topStates,
        reason: `${locationLoss.percentage.toFixed(0)}% of losses are location-related. Focus on: ${winPatterns.commonTraits.topStates?.join(', ')}.`,
        confidence: 0.65,
      });
    }

    // Condition-related suggestion
    const conditionLoss = lossPatterns.find((p) => p.category === 'condition');
    if (conditionLoss && conditionLoss.percentage > 30) {
      suggestions.push({
        field: 'acceptedConditions',
        currentValue: 'current conditions',
        suggestedValue: ['Good', 'Fair'],
        reason: `${conditionLoss.percentage.toFixed(0)}% of losses are condition-related. Consider stricter condition requirements.`,
        confidence: 0.6,
      });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }
}

export const winLossService = new WinLossService();
export default winLossService;
