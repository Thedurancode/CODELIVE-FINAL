/**
 * Compliance Analytics Service
 *
 * Provides analytics, trends, and insights for compliance data.
 * Supports dashboards, reports, and monitoring.
 */

import { Op, fn, col, literal } from 'sequelize';
import ComplianceCheck from '../models/ComplianceCheck';
import ComplianceAlert from '../models/ComplianceAlert';
import ComplianceEvent from '../models/ComplianceEvent';
import StateComplianceRule from '../models/StateComplianceRule';
import SanctionsScreening from '../models/SanctionsScreening';

export interface ComplianceOverview {
  totalChecks: number;
  passRate: number;
  warningRate: number;
  failRate: number;
  averageIssuesPerCheck: number;
  checksToday: number;
  checksThisWeek: number;
  checksThisMonth: number;
}

export interface StateAnalytics {
  state: string;
  totalChecks: number;
  passRate: number;
  warningRate: number;
  failRate: number;
  commonIssues: Array<{ ruleName: string; count: number; category: string }>;
  trend: 'improving' | 'stable' | 'declining';
}

export interface RuleEffectiveness {
  ruleId: number;
  ruleName: string;
  category: string;
  state: string;
  triggerCount: number;
  triggerRate: number;
  severityBreakdown: { critical: number; warning: number; info: number };
  lastTriggered?: Date;
}

export interface TrendData {
  date: string;
  passed: number;
  warned: number;
  failed: number;
  total: number;
  passRate: number;
}

export interface ComplianceAnalytics {
  overview: ComplianceOverview;
  byState: StateAnalytics[];
  byCategory: Array<{ category: string; failureCount: number; percentage: number }>;
  trends: {
    daily: TrendData[];
    weekly: TrendData[];
  };
  topFailures: RuleEffectiveness[];
  sanctionsStats: {
    totalScreenings: number;
    matchesFound: number;
    pendingReview: number;
    cleared: number;
    blocked: number;
  };
  alertStats: {
    active: number;
    critical: number;
    warning: number;
    resolvedToday: number;
  };
}

class ComplianceAnalyticsService {
  /**
   * Get comprehensive analytics dashboard data
   */
  async getAnalytics(options?: {
    startDate?: Date;
    endDate?: Date;
    states?: string[];
  }): Promise<ComplianceAnalytics> {
    const where: any = {};
    if (options?.startDate) {
      where.checkedAt = { [Op.gte]: options.startDate };
    }
    if (options?.endDate) {
      where.checkedAt = { ...where.checkedAt, [Op.lte]: options.endDate };
    }
    if (options?.states?.length) {
      where.state = { [Op.in]: options.states };
    }

    const [overview, byState, byCategory, dailyTrends, weeklyTrends, topFailures, sanctionsStats, alertStats] =
      await Promise.all([
        this.getOverview(where),
        this.getByState(where),
        this.getByCategory(where),
        this.getDailyTrends(30),
        this.getWeeklyTrends(12),
        this.getTopFailures(where, 10),
        this.getSanctionsStats(options?.startDate),
        this.getAlertStats(),
      ]);

    return {
      overview,
      byState,
      byCategory,
      trends: { daily: dailyTrends, weekly: weeklyTrends },
      topFailures,
      sanctionsStats,
      alertStats,
    };
  }

  /**
   * Get overview statistics
   */
  private async getOverview(where: any): Promise<ComplianceOverview> {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(now);
    startOfMonth.setDate(1);

    const [totalChecks, statusCounts, issueSum, checksToday, checksThisWeek, checksThisMonth] = await Promise.all([
      ComplianceCheck.count({ where }),
      ComplianceCheck.findAll({
        where,
        attributes: ['status', [fn('COUNT', '*'), 'count']],
        group: ['status'],
        raw: true,
      }),
      ComplianceCheck.findAll({
        where,
        attributes: [[fn('AVG', col('failedRules')), 'avgIssues']],
        raw: true,
      }),
      ComplianceCheck.count({ where: { ...where, checkedAt: { [Op.gte]: startOfDay } } }),
      ComplianceCheck.count({ where: { ...where, checkedAt: { [Op.gte]: startOfWeek } } }),
      ComplianceCheck.count({ where: { ...where, checkedAt: { [Op.gte]: startOfMonth } } }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of statusCounts as any[]) {
      counts[row.status] = parseInt(row.count, 10);
    }

    const total = totalChecks || 1;
    return {
      totalChecks,
      passRate: ((counts['Green'] || 0) / total) * 100,
      warningRate: ((counts['Yellow'] || 0) / total) * 100,
      failRate: ((counts['Red'] || 0) / total) * 100,
      averageIssuesPerCheck: parseFloat((issueSum as any[])[0]?.avgIssues || '0'),
      checksToday,
      checksThisWeek,
      checksThisMonth,
    };
  }

  /**
   * Get analytics by state
   */
  private async getByState(where: any): Promise<StateAnalytics[]> {
    const stateData = await ComplianceCheck.findAll({
      where,
      attributes: [
        'state',
        [fn('COUNT', '*'), 'totalChecks'],
        [fn('SUM', literal("CASE WHEN status = 'Green' THEN 1 ELSE 0 END")), 'passed'],
        [fn('SUM', literal("CASE WHEN status = 'Yellow' THEN 1 ELSE 0 END")), 'warned'],
        [fn('SUM', literal("CASE WHEN status = 'Red' THEN 1 ELSE 0 END")), 'failed'],
      ],
      group: ['state'],
      order: [[fn('COUNT', '*'), 'DESC']],
      raw: true,
    });

    return stateData.map((row: any) => {
      const total = parseInt(row.totalChecks, 10) || 1;
      const passed = parseInt(row.passed, 10) || 0;
      const warned = parseInt(row.warned, 10) || 0;
      const failed = parseInt(row.failed, 10) || 0;

      return {
        state: row.state,
        totalChecks: total,
        passRate: (passed / total) * 100,
        warningRate: (warned / total) * 100,
        failRate: (failed / total) * 100,
        commonIssues: [], // Would need subquery
        trend: 'stable' as const,
      };
    });
  }

  /**
   * Get analytics by category
   */
  private async getByCategory(where: any): Promise<Array<{ category: string; failureCount: number; percentage: number }>> {
    // Aggregate issues from JSONB column
    const checks = await ComplianceCheck.findAll({
      where: { ...where, status: { [Op.ne]: 'Green' } },
      attributes: ['issues'],
      raw: true,
    });

    const categoryCount: Record<string, number> = {};
    let totalIssues = 0;

    for (const check of checks as any[]) {
      for (const issue of check.issues || []) {
        categoryCount[issue.category] = (categoryCount[issue.category] || 0) + 1;
        totalIssues++;
      }
    }

    return Object.entries(categoryCount)
      .map(([category, count]) => ({
        category,
        failureCount: count,
        percentage: totalIssues > 0 ? (count / totalIssues) * 100 : 0,
      }))
      .sort((a, b) => b.failureCount - a.failureCount);
  }

  /**
   * Get daily trends
   */
  private async getDailyTrends(days: number): Promise<TrendData[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const results = await ComplianceCheck.findAll({
      where: { checkedAt: { [Op.gte]: since } },
      attributes: [
        [fn('DATE', col('checkedAt')), 'date'],
        [fn('SUM', literal("CASE WHEN status = 'Green' THEN 1 ELSE 0 END")), 'passed'],
        [fn('SUM', literal("CASE WHEN status = 'Yellow' THEN 1 ELSE 0 END")), 'warned'],
        [fn('SUM', literal("CASE WHEN status = 'Red' THEN 1 ELSE 0 END")), 'failed'],
        [fn('COUNT', '*'), 'total'],
      ],
      group: [fn('DATE', col('checkedAt'))],
      order: [[fn('DATE', col('checkedAt')), 'ASC']],
      raw: true,
    });

    return (results as any[]).map(row => {
      const total = parseInt(row.total, 10) || 1;
      const passed = parseInt(row.passed, 10) || 0;
      return {
        date: row.date,
        passed,
        warned: parseInt(row.warned, 10) || 0,
        failed: parseInt(row.failed, 10) || 0,
        total,
        passRate: (passed / total) * 100,
      };
    });
  }

  /**
   * Get weekly trends
   */
  private async getWeeklyTrends(weeks: number): Promise<TrendData[]> {
    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);

    const results = await ComplianceCheck.findAll({
      where: { checkedAt: { [Op.gte]: since } },
      attributes: [
        [fn('DATE_TRUNC', 'week', col('checkedAt')), 'week'],
        [fn('SUM', literal("CASE WHEN status = 'Green' THEN 1 ELSE 0 END")), 'passed'],
        [fn('SUM', literal("CASE WHEN status = 'Yellow' THEN 1 ELSE 0 END")), 'warned'],
        [fn('SUM', literal("CASE WHEN status = 'Red' THEN 1 ELSE 0 END")), 'failed'],
        [fn('COUNT', '*'), 'total'],
      ],
      group: [fn('DATE_TRUNC', 'week', col('checkedAt'))],
      order: [[fn('DATE_TRUNC', 'week', col('checkedAt')), 'ASC']],
      raw: true,
    });

    return (results as any[]).map(row => {
      const total = parseInt(row.total, 10) || 1;
      const passed = parseInt(row.passed, 10) || 0;
      return {
        date: row.week,
        passed,
        warned: parseInt(row.warned, 10) || 0,
        failed: parseInt(row.failed, 10) || 0,
        total,
        passRate: (passed / total) * 100,
      };
    });
  }

  /**
   * Get top rule failures
   */
  private async getTopFailures(where: any, limit: number): Promise<RuleEffectiveness[]> {
    const checks = await ComplianceCheck.findAll({
      where: { ...where, status: { [Op.ne]: 'Green' } },
      attributes: ['issues'],
      raw: true,
    });

    const ruleStats: Map<number, {
      ruleName: string;
      category: string;
      state: string;
      count: number;
      severities: { critical: number; warning: number; info: number };
      lastSeen: Date;
    }> = new Map();

    for (const check of checks as any[]) {
      for (const issue of check.issues || []) {
        const existing = ruleStats.get(issue.ruleId) || {
          ruleName: issue.ruleName,
          category: issue.category,
          state: '',
          count: 0,
          severities: { critical: 0, warning: 0, info: 0 },
          lastSeen: new Date(0),
        };

        existing.count++;
        existing.severities[issue.severity as keyof typeof existing.severities]++;
        existing.lastSeen = new Date();
        ruleStats.set(issue.ruleId, existing);
      }
    }

    const totalChecks = checks.length || 1;

    return Array.from(ruleStats.entries())
      .map(([ruleId, data]) => ({
        ruleId,
        ruleName: data.ruleName,
        category: data.category,
        state: data.state,
        triggerCount: data.count,
        triggerRate: (data.count / totalChecks) * 100,
        severityBreakdown: data.severities,
        lastTriggered: data.lastSeen,
      }))
      .sort((a, b) => b.triggerCount - a.triggerCount)
      .slice(0, limit);
  }

  /**
   * Get sanctions screening statistics
   */
  private async getSanctionsStats(since?: Date): Promise<{
    totalScreenings: number;
    matchesFound: number;
    pendingReview: number;
    cleared: number;
    blocked: number;
  }> {
    try {
      const stats = await SanctionsScreening.getStats({ since });
      return {
        totalScreenings: stats.total,
        matchesFound: stats.matches,
        pendingReview: stats.pending,
        cleared: stats.cleared,
        blocked: stats.blocked,
      };
    } catch {
      return {
        totalScreenings: 0,
        matchesFound: 0,
        pendingReview: 0,
        cleared: 0,
        blocked: 0,
      };
    }
  }

  /**
   * Get alert statistics
   */
  private async getAlertStats(): Promise<{
    active: number;
    critical: number;
    warning: number;
    resolvedToday: number;
  }> {
    try {
      const stats = await ComplianceAlert.getStats();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const resolvedToday = await ComplianceAlert.count({
        where: {
          status: 'resolved',
          resolvedAt: { [Op.gte]: startOfDay },
        },
      });

      return {
        active: stats.active,
        critical: stats.bySeverity?.critical || 0,
        warning: stats.bySeverity?.warning || 0,
        resolvedToday,
      };
    } catch {
      return { active: 0, critical: 0, warning: 0, resolvedToday: 0 };
    }
  }

  /**
   * Get state comparison report
   */
  async getStateComparison(states: string[]): Promise<StateAnalytics[]> {
    const where = { state: { [Op.in]: states } };
    return this.getByState(where);
  }

  /**
   * Get rule effectiveness report
   */
  async getRuleEffectiveness(options?: { state?: string; category?: string }): Promise<RuleEffectiveness[]> {
    const where: any = {};
    if (options?.state) {
      where.state = options.state;
    }

    return this.getTopFailures(where, 50);
  }

  /**
   * Export analytics data as CSV-ready format
   */
  async exportAnalytics(
    type: 'checks' | 'rules' | 'alerts',
    options?: { startDate?: Date; endDate?: Date; state?: string }
  ): Promise<Array<Record<string, any>>> {
    const where: any = {};
    if (options?.startDate) {
      where.checkedAt = { [Op.gte]: options.startDate };
    }
    if (options?.endDate) {
      where.checkedAt = { ...where.checkedAt, [Op.lte]: options.endDate };
    }
    if (options?.state) {
      where.state = options.state;
    }

    switch (type) {
      case 'checks':
        const checks = await ComplianceCheck.findAll({
          where,
          order: [['checkedAt', 'DESC']],
          limit: 10000,
          raw: true,
        });
        return checks.map((c: any) => ({
          id: c.id,
          propertyId: c.propertyId,
          status: c.status,
          state: c.state,
          totalRules: c.totalRules,
          passedRules: c.passedRules,
          failedRules: c.failedRules,
          checkedAt: c.checkedAt,
        }));

      case 'rules':
        const rules = await StateComplianceRule.findAll({ raw: true });
        return rules as any[];

      case 'alerts':
        const alerts = await ComplianceAlert.findAll({
          where: options?.state ? { state: options.state } : {},
          order: [['createdAt', 'DESC']],
          limit: 10000,
          raw: true,
        });
        return alerts as any[];

      default:
        return [];
    }
  }

  /**
   * Get event statistics from persistent store
   */
  async getEventStats(days: number = 30): Promise<{
    total: number;
    byType: Record<string, number>;
    byDay: Array<{ date: string; count: number }>;
  }> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const [byType, daily] = await Promise.all([
        ComplianceEvent.getCountsByType({ since }),
        ComplianceEvent.getDailySummary(days),
      ]);

      const total = Object.values(byType).reduce((a, b) => a + b, 0);

      return {
        total,
        byType,
        byDay: daily.map(d => ({ date: d.date, count: d.total })),
      };
    } catch {
      return { total: 0, byType: {}, byDay: [] };
    }
  }
}

export const complianceAnalyticsService = new ComplianceAnalyticsService();
export default complianceAnalyticsService;
