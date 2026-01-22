/**
 * VelocityService
 *
 * Real-time pipeline health monitoring with:
 * - Inflow/outflow tracking
 * - Bottleneck detection
 * - Stage health analysis
 * - Health score calculation
 * - Velocity trends
 */

import { Op } from 'sequelize';
import DealPipeline, { PipelineStage, PIPELINE_STAGES } from '../models/DealPipeline';

// Stage thresholds (in days)
const STAGE_THRESHOLDS: Record<string, { expected: number; warning: number; critical: number }> = {
  new: { expected: 1, warning: 2, critical: 3 },
  analyzing: { expected: 2, warning: 4, critical: 7 },
  due_diligence: { expected: 5, warning: 10, critical: 14 },
  offered: { expected: 3, warning: 7, critical: 10 },
  negotiating: { expected: 5, warning: 10, critical: 14 },
  under_contract: { expected: 7, warning: 14, critical: 21 },
};

// Active stages (not closed)
const ACTIVE_STAGES: PipelineStage[] = [
  'new',
  'analyzing',
  'due_diligence',
  'offered',
  'negotiating',
  'under_contract',
];

// Interfaces
export interface FlowMetrics {
  today: number;
  thisWeek: number;
  thisMonth: number;
}

export interface StageHealth {
  stage: string;
  count: number;
  avgDays: number;
  threshold: number;
  status: 'healthy' | 'warning' | 'critical';
  stuckDeals: number;
}

export interface Bottleneck {
  stage: string;
  severity: 'none' | 'moderate' | 'severe';
  stuckCount: number;
  suggestion: string;
}

export interface VelocityTrendPoint {
  date: string;
  inflow: number;
  outflow: number;
  avgDaysToClose: number;
}

export interface StuckDeal {
  id: string;
  dealId: string;
  stage: string;
  daysInStage: number;
  daysInPipeline: number;
  entrySnapshot: any;
}

export interface VelocityMetrics {
  inflow: FlowMetrics;
  outflow: FlowMetrics;
  netFlow: number;
  stageHealth: StageHealth[];
  bottleneck: Bottleneck | null;
  velocityTrend: VelocityTrendPoint[];
  healthScore: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
}

class VelocityService {
  /**
   * Get comprehensive velocity metrics for a user
   */
  async getVelocityMetrics(userId?: string, days: number = 30): Promise<VelocityMetrics> {
    const [inflow, outflow, stageHealth, velocityTrend] = await Promise.all([
      this.getInflowMetrics(userId),
      this.getOutflowMetrics(userId),
      this.getStageHealth(userId),
      this.getVelocityTrend(userId, days),
    ]);

    const bottleneck = this.detectBottleneck(stageHealth);
    const { healthScore, healthStatus } = this.calculateHealthScore(
      stageHealth,
      inflow,
      outflow
    );

    return {
      inflow,
      outflow,
      netFlow: inflow.thisWeek - outflow.thisWeek,
      stageHealth,
      bottleneck,
      velocityTrend,
      healthScore,
      healthStatus,
    };
  }

  /**
   * Get inflow metrics (deals entering pipeline)
   */
  async getInflowMetrics(userId?: string): Promise<FlowMetrics> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const where: any = {};
    if (userId) where.userId = userId;

    const [today, thisWeek, thisMonth] = await Promise.all([
      DealPipeline.count({
        where: { ...where, createdAt: { [Op.gte]: startOfDay } },
      }),
      DealPipeline.count({
        where: { ...where, createdAt: { [Op.gte]: startOfWeek } },
      }),
      DealPipeline.count({
        where: { ...where, createdAt: { [Op.gte]: startOfMonth } },
      }),
    ]);

    return { today, thisWeek, thisMonth };
  }

  /**
   * Get outflow metrics (deals closed)
   */
  async getOutflowMetrics(userId?: string): Promise<FlowMetrics> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const where: any = {
      stage: { [Op.in]: ['closed_won', 'closed_lost'] },
    };
    if (userId) where.userId = userId;

    const [today, thisWeek, thisMonth] = await Promise.all([
      DealPipeline.count({
        where: { ...where, closedAt: { [Op.gte]: startOfDay } },
      }),
      DealPipeline.count({
        where: { ...where, closedAt: { [Op.gte]: startOfWeek } },
      }),
      DealPipeline.count({
        where: { ...where, closedAt: { [Op.gte]: startOfMonth } },
      }),
    ]);

    return { today, thisWeek, thisMonth };
  }

  /**
   * Get health status of each pipeline stage
   */
  async getStageHealth(userId?: string): Promise<StageHealth[]> {
    const where: any = {
      stage: { [Op.in]: ACTIVE_STAGES },
    };
    if (userId) where.userId = userId;

    const deals = await DealPipeline.findAll({ where });

    // Group deals by stage
    const stageGroups: Record<string, DealPipeline[]> = {};
    for (const stage of ACTIVE_STAGES) {
      stageGroups[stage] = [];
    }
    for (const deal of deals) {
      if (stageGroups[deal.stage]) {
        stageGroups[deal.stage].push(deal);
      }
    }

    // Calculate health for each stage
    const stageHealth: StageHealth[] = [];

    for (const stage of ACTIVE_STAGES) {
      const stageDeals = stageGroups[stage];
      const count = stageDeals.length;
      const threshold = STAGE_THRESHOLDS[stage] || { expected: 5, warning: 10, critical: 14 };

      // Calculate average days in stage
      let totalDays = 0;
      let stuckDeals = 0;

      for (const deal of stageDeals) {
        const daysInStage = deal.getDaysInCurrentStage();
        totalDays += daysInStage;
        if (daysInStage > threshold.warning) {
          stuckDeals++;
        }
      }

      const avgDays = count > 0 ? Math.round((totalDays / count) * 10) / 10 : 0;

      // Determine status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (avgDays >= threshold.critical || stuckDeals >= 5) {
        status = 'critical';
      } else if (avgDays >= threshold.warning || stuckDeals >= 2) {
        status = 'warning';
      }

      stageHealth.push({
        stage,
        count,
        avgDays,
        threshold: threshold.warning,
        status,
        stuckDeals,
      });
    }

    return stageHealth;
  }

  /**
   * Detect the most severe bottleneck
   */
  detectBottleneck(stageHealth: StageHealth[]): Bottleneck | null {
    // Find the stage with most issues
    let worstStage: StageHealth | null = null;
    let maxScore = 0;

    for (const stage of stageHealth) {
      // Score based on stuck deals and status
      let score = stage.stuckDeals * 2;
      if (stage.status === 'critical') score += 10;
      if (stage.status === 'warning') score += 5;

      if (score > maxScore) {
        maxScore = score;
        worstStage = stage;
      }
    }

    if (!worstStage || maxScore === 0) {
      return null;
    }

    // Determine severity
    let severity: 'none' | 'moderate' | 'severe' = 'none';
    if (worstStage.status === 'critical') {
      severity = 'severe';
    } else if (worstStage.status === 'warning') {
      severity = 'moderate';
    }

    // Generate suggestion
    const stageName = worstStage.stage.replace('_', ' ');
    let suggestion = '';

    if (worstStage.stuckDeals > 0) {
      suggestion = `${worstStage.stuckDeals} deal${worstStage.stuckDeals > 1 ? 's' : ''} stuck in ${stageName} > ${STAGE_THRESHOLDS[worstStage.stage]?.warning || 5} days. `;
    }

    switch (worstStage.stage) {
      case 'new':
        suggestion += 'Consider assigning deals for analysis faster.';
        break;
      case 'analyzing':
        suggestion += 'Review analysis capacity or automate initial checks.';
        break;
      case 'due_diligence':
        suggestion += 'Consider batch review or additional DD resources.';
        break;
      case 'offered':
        suggestion += 'Follow up on pending offers or adjust pricing.';
        break;
      case 'negotiating':
        suggestion += 'Escalate stalled negotiations or set deadlines.';
        break;
      case 'under_contract':
        suggestion += 'Expedite closing process or check for blockers.';
        break;
      default:
        suggestion += 'Review stuck deals and take action.';
    }

    return {
      stage: worstStage.stage,
      severity,
      stuckCount: worstStage.stuckDeals,
      suggestion,
    };
  }

  /**
   * Calculate overall health score (0-100)
   */
  calculateHealthScore(
    stageHealth: StageHealth[],
    inflow: FlowMetrics,
    outflow: FlowMetrics
  ): { healthScore: number; healthStatus: 'healthy' | 'warning' | 'critical' } {
    let score = 100;

    // Deduct for stage issues
    for (const stage of stageHealth) {
      if (stage.status === 'critical') {
        score -= 15;
      } else if (stage.status === 'warning') {
        score -= 5;
      }
    }

    // Deduct for negative net flow (pipeline backing up)
    if (inflow.thisWeek > outflow.thisWeek * 2) {
      score -= 10;
    }

    // Deduct for stuck deals
    const totalStuck = stageHealth.reduce((sum, s) => sum + s.stuckDeals, 0);
    score -= Math.min(totalStuck * 2, 20);

    // Deduct if no closures this week
    if (outflow.thisWeek === 0 && inflow.thisWeek > 0) {
      score -= 10;
    }

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine status
    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (score < 50) {
      healthStatus = 'critical';
    } else if (score < 75) {
      healthStatus = 'warning';
    }

    return { healthScore: Math.round(score), healthStatus };
  }

  /**
   * Get velocity trend over time
   */
  async getVelocityTrend(userId?: string, days: number = 7): Promise<VelocityTrendPoint[]> {
    const trend: VelocityTrendPoint[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const where: any = {};
      if (userId) where.userId = userId;

      const [inflowCount, closedDeals] = await Promise.all([
        DealPipeline.count({
          where: {
            ...where,
            createdAt: { [Op.gte]: startOfDay, [Op.lt]: endOfDay },
          },
        }),
        DealPipeline.findAll({
          where: {
            ...where,
            closedAt: { [Op.gte]: startOfDay, [Op.lt]: endOfDay },
          },
        }),
      ]);

      // Calculate avg days to close for deals closed that day
      let avgDaysToClose = 0;
      if (closedDeals.length > 0) {
        const totalDays = closedDeals.reduce((sum, d) => sum + d.getDaysInPipeline(), 0);
        avgDaysToClose = Math.round((totalDays / closedDeals.length) * 10) / 10;
      }

      trend.push({
        date: startOfDay.toISOString().split('T')[0],
        inflow: inflowCount,
        outflow: closedDeals.length,
        avgDaysToClose,
      });
    }

    return trend;
  }

  /**
   * Get list of stuck deals
   */
  async getStuckDeals(userId?: string, thresholdDays: number = 7): Promise<StuckDeal[]> {
    const where: any = {
      stage: { [Op.in]: ACTIVE_STAGES },
    };
    if (userId) where.userId = userId;

    const deals = await DealPipeline.findAll({ where });
    const stuckDeals: StuckDeal[] = [];

    for (const deal of deals) {
      const daysInStage = deal.getDaysInCurrentStage();
      const stageThreshold = STAGE_THRESHOLDS[deal.stage]?.warning || thresholdDays;

      if (daysInStage > stageThreshold) {
        stuckDeals.push({
          id: deal.id,
          dealId: deal.dealId,
          stage: deal.stage,
          daysInStage,
          daysInPipeline: deal.getDaysInPipeline(),
          entrySnapshot: deal.entrySnapshot,
        });
      }
    }

    // Sort by days in stage (most stuck first)
    stuckDeals.sort((a, b) => b.daysInStage - a.daysInStage);

    return stuckDeals;
  }

  /**
   * Get health score only (lightweight)
   */
  async getHealthScore(userId?: string): Promise<{ healthScore: number; healthStatus: string }> {
    const [inflow, outflow, stageHealth] = await Promise.all([
      this.getInflowMetrics(userId),
      this.getOutflowMetrics(userId),
      this.getStageHealth(userId),
    ]);

    return this.calculateHealthScore(stageHealth, inflow, outflow);
  }
}

// Export singleton instance
export const velocityService = new VelocityService();
export default velocityService;
