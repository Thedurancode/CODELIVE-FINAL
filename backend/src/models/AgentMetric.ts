/**
 * AgentMetric Model
 *
 * Tracks AI agent performance per session (lightweight summary):
 * - Execution time and type
 * - Tools used and success rate
 * - Quality metrics for recommendations
 * - User feedback
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

// Execution types
export const EXECUTION_TYPES = ['chat', 'stream'] as const;
export type ExecutionType = (typeof EXECUTION_TYPES)[number];

// Recommendation types
export const RECOMMENDATION_TYPES = ['score', 'match', 'analysis', 'search', 'action'] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

// Outcome types
export const OUTCOME_TYPES = ['correct', 'incorrect', 'pending'] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

export interface AgentMetricAttributes {
  id: string;
  sessionId: string;
  userId?: string;

  // Execution context
  executionType: ExecutionType;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;

  // Tool usage (summary)
  toolsInvoked: string[];
  toolCount: number;
  toolSuccessRate: number;

  // Quality metrics
  dealId?: string;
  recommendationType?: RecommendationType;
  recommendedScore?: number;
  recommendedAction?: string;

  // Outcome (linked later)
  actualOutcome?: OutcomeType;
  outcomeRecordedAt?: Date;

  // Errors
  errorOccurred: boolean;
  errorMessage?: string;

  // User feedback
  userRating?: number;
  userFeedback?: string;

  // Message count
  messageCount: number;

  createdAt: Date;
}

export interface AgentMetricCreationAttributes
  extends Optional<
    AgentMetricAttributes,
    | 'id'
    | 'userId'
    | 'toolsInvoked'
    | 'toolCount'
    | 'toolSuccessRate'
    | 'dealId'
    | 'recommendationType'
    | 'recommendedScore'
    | 'recommendedAction'
    | 'actualOutcome'
    | 'outcomeRecordedAt'
    | 'errorMessage'
    | 'userRating'
    | 'userFeedback'
    | 'messageCount'
    | 'createdAt'
  > {}

class AgentMetric
  extends Model<AgentMetricAttributes, AgentMetricCreationAttributes>
  implements AgentMetricAttributes
{
  declare id: string;
  declare sessionId: string;
  declare userId?: string;
  declare executionType: ExecutionType;
  declare startedAt: Date;
  declare completedAt: Date;
  declare durationMs: number;
  declare toolsInvoked: string[];
  declare toolCount: number;
  declare toolSuccessRate: number;
  declare dealId?: string;
  declare recommendationType?: RecommendationType;
  declare recommendedScore?: number;
  declare recommendedAction?: string;
  declare actualOutcome?: OutcomeType;
  declare outcomeRecordedAt?: Date;
  declare errorOccurred: boolean;
  declare errorMessage?: string;
  declare userRating?: number;
  declare userFeedback?: string;
  declare messageCount: number;
  declare createdAt: Date;

  /**
   * Check if this execution was successful
   */
  isSuccessful(): boolean {
    return !this.errorOccurred && this.toolSuccessRate >= 90;
  }

  /**
   * Check if recommendation was accurate
   */
  isAccurate(): boolean {
    return this.actualOutcome === 'correct';
  }

  /**
   * Record the actual outcome
   */
  async recordOutcome(outcome: OutcomeType): Promise<void> {
    this.actualOutcome = outcome;
    this.outcomeRecordedAt = new Date();
    await this.save();
  }

  /**
   * Record user feedback
   */
  async recordFeedback(rating: number, feedback?: string): Promise<void> {
    this.userRating = rating;
    this.userFeedback = feedback;
    await this.save();
  }

  /**
   * Get aggregate stats for a time period
   */
  static async getStats(
    startDate?: Date,
    endDate?: Date,
    userId?: string
  ): Promise<{
    totalExecutions: number;
    avgDurationMs: number;
    avgToolCount: number;
    avgToolSuccessRate: number;
    errorRate: number;
    avgUserRating: number | null;
    accuracyRate: number | null;
    topTools: { tool: string; count: number }[];
  }> {
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = startDate;
      if (endDate) where.createdAt[Op.lte] = endDate;
    }
    if (userId) where.userId = userId;

    const metrics = await AgentMetric.findAll({ where });

    if (metrics.length === 0) {
      return {
        totalExecutions: 0,
        avgDurationMs: 0,
        avgToolCount: 0,
        avgToolSuccessRate: 0,
        errorRate: 0,
        avgUserRating: null,
        accuracyRate: null,
        topTools: [],
      };
    }

    // Calculate aggregates
    const totalExecutions = metrics.length;
    const avgDurationMs =
      metrics.reduce((sum, m) => sum + m.durationMs, 0) / totalExecutions;
    const avgToolCount =
      metrics.reduce((sum, m) => sum + m.toolCount, 0) / totalExecutions;
    const avgToolSuccessRate =
      metrics.reduce((sum, m) => sum + m.toolSuccessRate, 0) / totalExecutions;
    const errorRate =
      (metrics.filter((m) => m.errorOccurred).length / totalExecutions) * 100;

    // User rating average (only for rated sessions)
    const ratedMetrics = metrics.filter((m) => m.userRating != null);
    const avgUserRating =
      ratedMetrics.length > 0
        ? ratedMetrics.reduce((sum, m) => sum + (m.userRating || 0), 0) /
          ratedMetrics.length
        : null;

    // Accuracy rate (only for metrics with outcomes)
    const outcomeMetrics = metrics.filter(
      (m) => m.actualOutcome && m.actualOutcome !== 'pending'
    );
    const accuracyRate =
      outcomeMetrics.length > 0
        ? (outcomeMetrics.filter((m) => m.actualOutcome === 'correct').length /
            outcomeMetrics.length) *
          100
        : null;

    // Top tools
    const toolCounts: Record<string, number> = {};
    for (const m of metrics) {
      for (const tool of m.toolsInvoked || []) {
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      }
    }
    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tool, count]) => ({ tool, count }));

    return {
      totalExecutions,
      avgDurationMs: Math.round(avgDurationMs),
      avgToolCount: Math.round(avgToolCount * 10) / 10,
      avgToolSuccessRate: Math.round(avgToolSuccessRate * 10) / 10,
      errorRate: Math.round(errorRate * 10) / 10,
      avgUserRating: avgUserRating
        ? Math.round(avgUserRating * 10) / 10
        : null,
      accuracyRate: accuracyRate ? Math.round(accuracyRate * 10) / 10 : null,
      topTools,
    };
  }

  /**
   * Get performance trend over time
   */
  static async getPerformanceTrend(
    days: number = 30,
    userId?: string
  ): Promise<
    {
      date: string;
      executions: number;
      avgDuration: number;
      errorRate: number;
    }[]
  > {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: any = {
      createdAt: { [Op.gte]: startDate },
    };
    if (userId) where.userId = userId;

    const metrics = await AgentMetric.findAll({
      where,
      order: [['createdAt', 'ASC']],
    });

    // Group by date
    const byDate: Record<
      string,
      { executions: number; totalDuration: number; errors: number }
    > = {};

    for (const m of metrics) {
      const date = m.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) {
        byDate[date] = { executions: 0, totalDuration: 0, errors: 0 };
      }
      byDate[date].executions++;
      byDate[date].totalDuration += m.durationMs;
      if (m.errorOccurred) byDate[date].errors++;
    }

    return Object.entries(byDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date,
        executions: data.executions,
        avgDuration: Math.round(data.totalDuration / data.executions),
        errorRate: Math.round((data.errors / data.executions) * 100 * 10) / 10,
      }));
  }
}

AgentMetric.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    executionType: {
      type: DataTypes.ENUM(...EXECUTION_TYPES),
      allowNull: false,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    toolsInvoked: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    toolCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    toolSuccessRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 100,
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    recommendationType: {
      type: DataTypes.ENUM(...RECOMMENDATION_TYPES),
      allowNull: true,
    },
    recommendedScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    recommendedAction: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    actualOutcome: {
      type: DataTypes.ENUM(...OUTCOME_TYPES),
      allowNull: true,
    },
    outcomeRecordedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    errorOccurred: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    userRating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 5,
      },
    },
    userFeedback: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    messageCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'agent_metrics',
    modelName: 'AgentMetric',
    timestamps: false,
    indexes: [
      { fields: ['sessionId'] },
      { fields: ['userId'] },
      { fields: ['createdAt'] },
      { fields: ['executionType'] },
      { fields: ['errorOccurred'] },
      { fields: ['actualOutcome'] },
      { fields: ['userRating'] },
      { fields: ['userId', 'createdAt'] },
    ],
  }
);

export default AgentMetric;
