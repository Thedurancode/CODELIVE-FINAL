/**
 * Agent Metrics Service
 *
 * Tracks AI agent performance per session:
 * - Recording execution metrics
 * - Tool usage statistics
 * - Accuracy tracking
 * - Performance trends
 */

import { Op } from 'sequelize';
import AgentMetric, {
  ExecutionType,
  RecommendationType,
  OutcomeType,
} from '../models/AgentMetric';

// Execution context for tracking
interface ExecutionContext {
  id: string;
  sessionId: string;
  userId?: string;
  executionType: ExecutionType;
  startedAt: Date;
  toolsInvoked: string[];
  toolSuccesses: number;
  toolFailures: number;
  dealId?: string;
  recommendationType?: RecommendationType;
  recommendedScore?: number;
  recommendedAction?: string;
  errorOccurred: boolean;
  errorMessage?: string;
}

// In-memory tracking for ongoing executions
const activeExecutions = new Map<string, ExecutionContext>();

// Tool usage stats
export interface ToolStats {
  toolName: string;
  totalUses: number;
  avgDuration?: number;
  successRate?: number;
}

// Performance trend point
export interface PerformanceTrendPoint {
  date: string;
  executions: number;
  avgDuration: number;
  errorRate: number;
}

// Error pattern
export interface ErrorPattern {
  errorType: string;
  count: number;
  percentage: number;
  recentOccurrences: Date[];
}

class AgentMetricsService {
  /**
   * Start tracking an agent execution
   */
  startExecution(
    sessionId: string,
    executionType: ExecutionType,
    userId?: string
  ): string {
    const id = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const context: ExecutionContext = {
      id,
      sessionId,
      userId,
      executionType,
      startedAt: new Date(),
      toolsInvoked: [],
      toolSuccesses: 0,
      toolFailures: 0,
      errorOccurred: false,
    };

    activeExecutions.set(id, context);
    return id;
  }

  /**
   * Record a tool execution within a session
   */
  recordToolExecution(
    executionId: string,
    toolName: string,
    success: boolean,
    _durationMs?: number,
    error?: string
  ): void {
    const context = activeExecutions.get(executionId);
    if (!context) return;

    if (!context.toolsInvoked.includes(toolName)) {
      context.toolsInvoked.push(toolName);
    }

    if (success) {
      context.toolSuccesses++;
    } else {
      context.toolFailures++;
      if (error && !context.errorOccurred) {
        context.errorOccurred = true;
        context.errorMessage = error;
      }
    }
  }

  /**
   * Record a recommendation made by the agent
   */
  recordRecommendation(
    executionId: string,
    type: RecommendationType,
    dealId?: string,
    score?: number,
    action?: string
  ): void {
    const context = activeExecutions.get(executionId);
    if (!context) return;

    context.recommendationType = type;
    context.dealId = dealId;
    context.recommendedScore = score;
    context.recommendedAction = action;
  }

  /**
   * Complete an agent execution and persist metrics
   */
  async completeExecution(
    executionId: string,
    messageCount: number = 1
  ): Promise<AgentMetric | null> {
    const context = activeExecutions.get(executionId);
    if (!context) return null;

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - context.startedAt.getTime();
    const totalTools = context.toolSuccesses + context.toolFailures;
    const successRate =
      totalTools > 0 ? (context.toolSuccesses / totalTools) * 100 : 100;

    try {
      const metric = await AgentMetric.create({
        sessionId: context.sessionId,
        userId: context.userId,
        executionType: context.executionType,
        startedAt: context.startedAt,
        completedAt,
        durationMs,
        toolsInvoked: context.toolsInvoked,
        toolCount: totalTools,
        toolSuccessRate: successRate,
        dealId: context.dealId,
        recommendationType: context.recommendationType,
        recommendedScore: context.recommendedScore,
        recommendedAction: context.recommendedAction,
        errorOccurred: context.errorOccurred,
        errorMessage: context.errorMessage,
        messageCount,
      });

      activeExecutions.delete(executionId);
      return metric;
    } catch (error) {
      console.error('Failed to save agent metric:', error);
      activeExecutions.delete(executionId);
      return null;
    }
  }

  /**
   * Cancel/abort an execution without saving
   */
  cancelExecution(executionId: string): void {
    activeExecutions.delete(executionId);
  }

  /**
   * Record user feedback for a session
   */
  async recordFeedback(
    sessionId: string,
    rating: number,
    feedback?: string
  ): Promise<void> {
    // Find the most recent metric for this session
    const metric = await AgentMetric.findOne({
      where: { sessionId },
      order: [['createdAt', 'DESC']],
    });

    if (metric) {
      await metric.recordFeedback(rating, feedback);
    }
  }

  /**
   * Record outcome for a recommendation
   */
  async recordOutcome(
    sessionId: string,
    outcome: OutcomeType
  ): Promise<void> {
    const metric = await AgentMetric.findOne({
      where: { sessionId, recommendationType: { [Op.not]: null } } as any,
      order: [['createdAt', 'DESC']],
    });

    if (metric) {
      await metric.recordOutcome(outcome);
    }
  }

  /**
   * Get tool usage statistics
   */
  async getToolUsageStats(
    options: {
      startDate?: Date;
      endDate?: Date;
      userId?: string;
      limit?: number;
    } = {}
  ): Promise<ToolStats[]> {
    const { startDate, endDate, userId, limit = 20 } = options;

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = startDate;
      if (endDate) where.createdAt[Op.lte] = endDate;
    }
    if (userId) where.userId = userId;

    const metrics = await AgentMetric.findAll({ where });

    // Count tool usage
    const toolCounts: Record<string, number> = {};
    for (const m of metrics) {
      for (const tool of m.toolsInvoked || []) {
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      }
    }

    return Object.entries(toolCounts)
      .map(([toolName, totalUses]) => ({
        toolName,
        totalUses,
      }))
      .sort((a, b) => b.totalUses - a.totalUses)
      .slice(0, limit);
  }

  /**
   * Get accuracy metrics
   */
  async getAccuracyMetrics(
    options: {
      startDate?: Date;
      endDate?: Date;
      userId?: string;
    } = {}
  ): Promise<{
    overallAccuracy: number;
    byType: Record<string, { total: number; correct: number; accuracy: number }>;
    avgUserRating: number | null;
    ratedSessions: number;
  }> {
    const stats = await AgentMetric.getStats(
      options.startDate,
      options.endDate,
      options.userId
    );

    // Get type-specific accuracy
    const where: any = {
      actualOutcome: { [Op.and]: [{ [Op.not]: null }, { [Op.ne]: 'pending' }] },
    };
    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt[Op.gte] = options.startDate;
      if (options.endDate) where.createdAt[Op.lte] = options.endDate;
    }
    if (options.userId) where.userId = options.userId;

    const metricsWithOutcome = await AgentMetric.findAll({ where });

    const byType: Record<
      string,
      { total: number; correct: number; accuracy: number }
    > = {};

    for (const m of metricsWithOutcome) {
      const type = m.recommendationType || 'general';
      if (!byType[type]) {
        byType[type] = { total: 0, correct: 0, accuracy: 0 };
      }
      byType[type].total++;
      if (m.actualOutcome === 'correct') {
        byType[type].correct++;
      }
    }

    // Calculate accuracy for each type
    for (const type of Object.keys(byType)) {
      byType[type].accuracy =
        byType[type].total > 0
          ? (byType[type].correct / byType[type].total) * 100
          : 0;
    }

    // Get rated sessions count
    const ratedWhere: any = { userRating: { [Op.ne]: null } };
    if (options.userId) ratedWhere.userId = options.userId;
    const ratedSessions = await AgentMetric.count({ where: ratedWhere });

    return {
      overallAccuracy: stats.accuracyRate || 0,
      byType,
      avgUserRating: stats.avgUserRating,
      ratedSessions,
    };
  }

  /**
   * Get performance trend over time
   */
  async getPerformanceTrend(
    options: {
      days?: number;
      userId?: string;
    } = {}
  ): Promise<PerformanceTrendPoint[]> {
    const { days = 30, userId } = options;
    return AgentMetric.getPerformanceTrend(days, userId);
  }

  /**
   * Get error patterns
   */
  async getErrorPatterns(
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ): Promise<ErrorPattern[]> {
    const { startDate, endDate, limit = 10 } = options;

    const where: any = {
      errorOccurred: true,
      errorMessage: { [Op.ne]: null },
    };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = startDate;
      if (endDate) where.createdAt[Op.lte] = endDate;
    }

    const errorMetrics = await AgentMetric.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    const totalErrors = errorMetrics.length;

    // Group by error type (first line of error message)
    const errorGroups: Record<
      string,
      { count: number; occurrences: Date[] }
    > = {};

    for (const m of errorMetrics) {
      const errorType =
        m.errorMessage?.split('\n')[0]?.substring(0, 100) || 'Unknown error';
      if (!errorGroups[errorType]) {
        errorGroups[errorType] = { count: 0, occurrences: [] };
      }
      errorGroups[errorType].count++;
      if (errorGroups[errorType].occurrences.length < 5) {
        errorGroups[errorType].occurrences.push(m.createdAt);
      }
    }

    return Object.entries(errorGroups)
      .map(([errorType, data]) => ({
        errorType,
        count: data.count,
        percentage: totalErrors > 0 ? (data.count / totalErrors) * 100 : 0,
        recentOccurrences: data.occurrences,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get overall agent stats
   */
  async getOverallStats(
    options: {
      startDate?: Date;
      endDate?: Date;
      userId?: string;
    } = {}
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
    return AgentMetric.getStats(
      options.startDate,
      options.endDate,
      options.userId
    );
  }

  /**
   * Get slow executions for performance optimization
   */
  async getSlowExecutions(
    thresholdMs: number = 10000,
    limit: number = 20
  ): Promise<
    {
      sessionId: string;
      durationMs: number;
      toolsInvoked: string[];
      createdAt: Date;
    }[]
  > {
    const metrics = await AgentMetric.findAll({
      where: {
        durationMs: { [Op.gte]: thresholdMs },
      },
      order: [['durationMs', 'DESC']],
      limit,
    });

    return metrics.map((m) => ({
      sessionId: m.sessionId,
      durationMs: m.durationMs,
      toolsInvoked: m.toolsInvoked,
      createdAt: m.createdAt,
    }));
  }
}

export const agentMetricsService = new AgentMetricsService();
export default agentMetricsService;
