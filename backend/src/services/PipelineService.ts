/**
 * Pipeline Service
 *
 * Manages deal pipeline for users:
 * - Add/remove deals from pipeline
 * - Track stage transitions
 * - Calculate pipeline stats and conversion rates
 * - Move closed deals to portfolio
 */

import { Op } from 'sequelize';
import DealPipeline, {
  PipelineStage,
  StageHistoryEntry,
  DealSnapshot,
  PipelineOutcome,
  PIPELINE_STAGES,
} from '../models/DealPipeline';
import Portfolio from '../models/Portfolio';
import { Property } from '../models';
import { notificationService } from './NotificationService';
import { complianceTriggerService } from './ComplianceTriggerService';
import { activityFeedService } from './ActivityFeedService';
import { pipelineContractService } from './PipelineContractService';

// Pipeline statistics
export interface PipelineStats {
  totalDeals: number;
  byStage: Record<PipelineStage, number>;
  avgDaysInPipeline: number;
  closedWon: number;
  closedLost: number;
  withdrawn: number;
  winRate: number;
}

// Conversion rates between stages
export interface ConversionRates {
  stages: {
    from: PipelineStage;
    to: PipelineStage;
    count: number;
    rate: number;
  }[];
  overallWinRate: number;
  avgTimeToClose: number;
}

// Stage timing averages
export interface StageTimings {
  [stage: string]: {
    avgDays: number;
    minDays: number;
    maxDays: number;
  };
}

class PipelineService {
  /**
   * Add a deal to the pipeline
   */
  async addToPipeline(
    userId: string,
    dealId: string,
    options: {
      stage?: PipelineStage;
      propertyId?: number;
      snapshot?: DealSnapshot;
      notes?: string;
      triggeredBy?: 'user' | 'agent' | 'automation';
    } = {}
  ): Promise<DealPipeline> {
    const {
      stage = 'new',
      propertyId,
      snapshot = {},
      notes,
      triggeredBy = 'user',
    } = options;

    // Check if deal already exists in pipeline for this user
    const existing = await DealPipeline.findOne({
      where: { userId, dealId },
    });

    if (existing) {
      throw new Error(`Deal ${dealId} is already in your pipeline`);
    }

    // Get property data for snapshot if propertyId provided
    let entrySnapshot = snapshot;
    if (propertyId && Object.keys(snapshot).length === 0) {
      const property = await Property.findByPk(propertyId);
      if (property) {
        entrySnapshot = {
          price: property.reservePrice || property.purchaseContractPrice,
          arv: property.arv,
          state: property.state,
          city: property.city,
          propertyType: property.propertyType,
          bedrooms: property.bedroomCount,
          bathrooms: property.bathroomCount,
          sqft: property.livingSpaceSqFt,
        };
      }
    }

    // Create initial stage history entry
    const stageHistory: StageHistoryEntry[] = [
      {
        stage,
        enteredAt: new Date().toISOString(),
        triggeredBy,
        notes,
      },
    ];

    const pipeline = await DealPipeline.create({
      userId,
      dealId,
      propertyId,
      stage,
      stageHistory,
      entrySnapshot,
      notes,
    });

    // Fire compliance trigger for new pipeline entry at critical stages
    if (propertyId && ['due_diligence', 'offered', 'under_contract'].includes(stage)) {
      complianceTriggerService
        .handlePropertyEvent('pipeline.stage_changed', propertyId, {
          pipelineId: pipeline.id,
          previousStage: 'new',
          stage,
          triggeredBy,
        })
        .catch(err => console.warn('Pipeline created trigger failed:', err.message));

      // Trigger automatic contract sending for initial stage (non-blocking)
      pipelineContractService.handleStageChange(
        propertyId,
        'new',
        stage
      ).then(results => {
        const totalSent = results.reduce((sum, r) => sum + r.contractsSent, 0);
        if (totalSent > 0) {
          console.log(
            `[PipelineService] Initial contract auto-send: ${totalSent} sent for deal ${propertyId}`
          );
        }
      }).catch(err => console.warn('Initial contract auto-send failed:', err.message));
    }

    return pipeline;
  }

  /**
   * Update the stage of a pipeline deal
   */
  async updateStage(
    pipelineId: string,
    newStage: PipelineStage,
    options: {
      notes?: string;
      triggeredBy?: 'user' | 'agent' | 'automation';
    } = {}
  ): Promise<DealPipeline> {
    const { notes, triggeredBy = 'user' } = options;

    const pipeline = await DealPipeline.findByPk(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline item ${pipelineId} not found`);
    }

    if (pipeline.isClosed()) {
      throw new Error('Cannot update stage of a closed deal');
    }

    const now = new Date().toISOString();
    const history = [...(pipeline.stageHistory || [])];

    // Close out current stage
    const currentStageIndex = history.findIndex(
      (h) => h.stage === pipeline.stage && !h.exitedAt
    );
    if (currentStageIndex >= 0) {
      history[currentStageIndex].exitedAt = now;
    }

    // Add new stage entry
    history.push({
      stage: newStage,
      enteredAt: now,
      triggeredBy,
      notes,
    });

    // Update the pipeline
    pipeline.stage = newStage;
    pipeline.stageHistory = history;

    // Handle closed stages
    if (newStage === 'closed_won') {
      pipeline.outcome = 'won';
      pipeline.closedAt = new Date();
    } else if (newStage === 'closed_lost') {
      pipeline.outcome = 'lost';
      pipeline.closedAt = new Date();
    }

    await pipeline.save();

    // Send real-time notification for stage change
    const previousStage = history[history.length - 2]?.stage || 'new';
    try {
      notificationService.sendToUser(pipeline.userId, {
        type: 'pipeline_update',
        title: 'Pipeline Stage Updated',
        message: `Deal moved from ${previousStage} to ${newStage}`,
        priority: newStage.startsWith('closed') ? 'high' : 'normal',
        data: {
          pipelineId: pipeline.id,
          dealId: pipeline.dealId,
          propertyId: pipeline.propertyId,
          previousStage,
          newStage,
          triggeredBy,
        },
      });
    } catch (notifyError) {
      // Don't fail the operation if notification fails
      console.warn('Failed to send pipeline update notification:', notifyError);
    }

    // Log activity feed event for stage change
    activityFeedService.logActivity({
      eventType: 'deal_stage_changed',
      entityType: 'deal',
      entityId: pipeline.dealId,
      entityName: `Deal ${pipeline.dealId}`,
      actor: {
        id: pipeline.userId,
        name: triggeredBy === 'automation' ? 'Automation' : 'User',
        type: triggeredBy === 'automation' ? 'system' : 'user',
      },
      metadata: {
        pipelineId: pipeline.id,
        propertyId: pipeline.propertyId,
        previousStage,
        newStage,
        triggeredBy,
      },
    }).catch(err => console.warn('Activity logging failed:', err.message));

    // Fire compliance trigger for pipeline stage changes (non-blocking)
    if (pipeline.propertyId) {
      const previousStage = history[history.length - 2]?.stage || 'new';
      complianceTriggerService.handlePropertyEvent('pipeline.stage_changed', pipeline.propertyId, {
        pipelineId: pipeline.id,
        previousStage,
        stage: newStage,
        triggeredBy,
      }).catch(err => console.warn('Compliance trigger failed:', err.message));

      // Fire deal.closed trigger for final compliance snapshot
      if (newStage === 'closed_won' || newStage === 'closed_lost') {
        complianceTriggerService.handlePropertyEvent('deal.closed', pipeline.propertyId, {
          pipelineId: pipeline.id,
          outcome: newStage === 'closed_won' ? 'won' : 'lost',
          closedAt: new Date().toISOString(),
          triggeredBy,
        }).catch(err => console.warn('Deal closed trigger failed:', err.message));
      }

      // Trigger automatic contract sending for stage transitions (non-blocking)
      pipelineContractService.handleStageChange(
        pipeline.propertyId,
        previousStage as PipelineStage,
        newStage
      ).then(results => {
        const totalSent = results.reduce((sum, r) => sum + r.contractsSent, 0);
        const totalFailed = results.reduce((sum, r) => sum + r.contractsFailed, 0);
        if (totalSent > 0 || totalFailed > 0) {
          console.log(
            `[PipelineService] Contract auto-send: ${totalSent} sent, ${totalFailed} failed for deal ${pipeline.propertyId}`
          );
        }
      }).catch(err => console.warn('Contract auto-send failed:', err.message));
    }

    return pipeline;
  }

  /**
   * Remove a deal from the pipeline
   */
  async removeFromPipeline(pipelineId: string): Promise<void> {
    const pipeline = await DealPipeline.findByPk(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline item ${pipelineId} not found`);
    }
    await pipeline.destroy();
  }

  /**
   * Mark a deal as closed
   */
  async markAsClosed(
    pipelineId: string,
    outcome: PipelineOutcome,
    options: {
      closePrice?: number;
      reason?: string;
    } = {}
  ): Promise<DealPipeline> {
    const { closePrice, reason } = options;

    const pipeline = await DealPipeline.findByPk(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline item ${pipelineId} not found`);
    }

    const newStage: PipelineStage =
      outcome === 'won' ? 'closed_won' : 'closed_lost';

    // Update stage history
    const now = new Date().toISOString();
    const history = [...(pipeline.stageHistory || [])];

    const currentStageIndex = history.findIndex(
      (h) => h.stage === pipeline.stage && !h.exitedAt
    );
    if (currentStageIndex >= 0) {
      history[currentStageIndex].exitedAt = now;
    }

    history.push({
      stage: newStage,
      enteredAt: now,
      triggeredBy: 'user',
      notes: reason,
    });

    pipeline.stage = newStage;
    pipeline.stageHistory = history;
    pipeline.outcome = outcome;
    pipeline.outcomeReason = reason;
    pipeline.closePrice = closePrice;
    pipeline.closedAt = new Date();

    await pipeline.save();

    // Log activity feed event for deal closed
    const previousStage = history[history.length - 2]?.stage || 'new';
    activityFeedService.logActivity({
      eventType: 'deal_stage_changed',
      entityType: 'deal',
      entityId: pipeline.dealId,
      entityName: `Deal ${pipeline.dealId}`,
      actor: {
        id: pipeline.userId,
        name: 'User',
        type: 'user',
      },
      metadata: {
        pipelineId: pipeline.id,
        propertyId: pipeline.propertyId,
        previousStage,
        newStage,
        outcome,
        closePrice,
        reason,
      },
    }).catch(err => console.warn('Activity logging failed:', err.message));

    // Fire deal.closed trigger for final compliance snapshot
    if (pipeline.propertyId) {
      complianceTriggerService.handlePropertyEvent('deal.closed', pipeline.propertyId, {
        pipelineId: pipeline.id,
        outcome,
        closePrice,
        reason,
        closedAt: new Date().toISOString(),
        triggeredBy: 'user',
      }).catch(err => console.warn('Deal closed trigger failed:', err.message));
    }

    return pipeline;
  }

  /**
   * Move a closed won deal to the portfolio
   */
  async moveToPortfolio(
    pipelineId: string,
    acquisitionDetails: {
      acquisitionPrice: number;
      closingCosts?: number;
      rehabCost?: number;
      monthlyRent?: number;
      monthlyExpenses?: number;
      status?: 'holding' | 'renting' | 'renovating';
    }
  ): Promise<Portfolio> {
    const pipeline = await DealPipeline.findByPk(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline item ${pipelineId} not found`);
    }

    if (pipeline.outcome !== 'won') {
      throw new Error('Only won deals can be moved to portfolio');
    }

    // Create portfolio entry
    const snapshot = pipeline.entrySnapshot;
    const portfolio = await Portfolio.create({
      userId: pipeline.userId,
      propertyId: pipeline.propertyId,
      dealPipelineId: pipeline.id,
      address: snapshot.city
        ? `${snapshot.city}, ${snapshot.state}`
        : 'Unknown',
      city: snapshot.city || 'Unknown',
      state: snapshot.state || 'Unknown',
      propertyType: snapshot.propertyType || 'SFR',
      bedrooms: snapshot.bedrooms,
      bathrooms: snapshot.bathrooms,
      sqft: snapshot.sqft,
      acquisitionDate: pipeline.closedAt || new Date(),
      acquisitionPrice: acquisitionDetails.acquisitionPrice,
      acquisitionSource: 'pipeline',
      closingCosts: acquisitionDetails.closingCosts,
      rehabCost: acquisitionDetails.rehabCost,
      totalInvested:
        acquisitionDetails.acquisitionPrice +
        (acquisitionDetails.closingCosts || 0) +
        (acquisitionDetails.rehabCost || 0),
      monthlyRent: acquisitionDetails.monthlyRent,
      monthlyExpenses: acquisitionDetails.monthlyExpenses,
      status: acquisitionDetails.status || 'holding',
      currentValue: snapshot.arv || acquisitionDetails.acquisitionPrice,
      lastValuedAt: new Date(),
      valuationSource: 'manual',
    });

    return portfolio;
  }

  /**
   * Get user's pipeline
   */
  async getUserPipeline(
    userId: string,
    options: {
      stage?: PipelineStage;
      includeCompleted?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: DealPipeline[]; total: number }> {
    const { stage, includeCompleted = false, limit = 50, offset = 0 } = options;

    const where: any = { userId };

    if (stage) {
      where.stage = stage;
    } else if (!includeCompleted) {
      where.stage = { [Op.notIn]: ['closed_won', 'closed_lost'] };
    }

    const { rows: items, count: total } = await DealPipeline.findAndCountAll({
      where,
      order: [['updatedAt', 'DESC']],
      limit,
      offset,
    });

    return { items, total };
  }

  /**
   * Get pipeline by stage
   */
  async getPipelineByStage(
    userId: string,
    stage: PipelineStage
  ): Promise<DealPipeline[]> {
    return DealPipeline.findAll({
      where: { userId, stage },
      order: [['updatedAt', 'DESC']],
    });
  }

  /**
   * Get pipeline statistics for a user
   */
  async getPipelineStats(userId?: string): Promise<PipelineStats> {
    const where: any = {};
    if (userId) where.userId = userId;

    const pipelines = await DealPipeline.findAll({ where });

    // Count by stage
    const byStage: Record<PipelineStage, number> = {} as any;
    for (const stage of PIPELINE_STAGES) {
      byStage[stage] = 0;
    }

    let totalDaysInPipeline = 0;
    let closedCount = 0;
    let closedWon = 0;
    let closedLost = 0;
    let withdrawn = 0;

    for (const p of pipelines) {
      byStage[p.stage]++;

      if (p.isClosed()) {
        closedCount++;
        totalDaysInPipeline += p.getDaysInPipeline();

        if (p.outcome === 'won') closedWon++;
        else if (p.outcome === 'lost') closedLost++;
        else if (p.outcome === 'withdrawn') withdrawn++;
      }
    }

    return {
      totalDeals: pipelines.length,
      byStage,
      avgDaysInPipeline: closedCount > 0 ? totalDaysInPipeline / closedCount : 0,
      closedWon,
      closedLost,
      withdrawn,
      winRate:
        closedWon + closedLost > 0
          ? (closedWon / (closedWon + closedLost)) * 100
          : 0,
    };
  }

  /**
   * Get conversion rates between stages
   */
  async getConversionRates(userId?: string): Promise<ConversionRates> {
    const where: any = {};
    if (userId) where.userId = userId;

    const pipelines = await DealPipeline.findAll({ where });

    // Track transitions
    const transitions: Record<string, number> = {};
    const stageEntries: Record<string, number> = {};

    for (const p of pipelines) {
      const history = p.stageHistory || [];
      for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        stageEntries[entry.stage] = (stageEntries[entry.stage] || 0) + 1;

        if (i < history.length - 1) {
          const nextEntry = history[i + 1];
          const key = `${entry.stage}->${nextEntry.stage}`;
          transitions[key] = (transitions[key] || 0) + 1;
        }
      }
    }

    // Calculate rates
    const stages: ConversionRates['stages'] = [];
    for (const [key, count] of Object.entries(transitions)) {
      const [from, to] = key.split('->') as [PipelineStage, PipelineStage];
      const fromCount = stageEntries[from] || 1;
      stages.push({
        from,
        to,
        count,
        rate: (count / fromCount) * 100,
      });
    }

    // Calculate overall metrics
    const wonDeals = pipelines.filter((p) => p.outcome === 'won');
    const closedDeals = pipelines.filter((p) => p.isClosed());

    const avgTimeToClose =
      wonDeals.length > 0
        ? wonDeals.reduce((sum, p) => sum + p.getDaysInPipeline(), 0) /
          wonDeals.length
        : 0;

    return {
      stages: stages.sort((a, b) => b.count - a.count),
      overallWinRate:
        closedDeals.length > 0
          ? (wonDeals.length / closedDeals.length) * 100
          : 0,
      avgTimeToClose,
    };
  }

  /**
   * Get average time by stage
   */
  async getAverageTimeByStage(userId?: string): Promise<StageTimings> {
    const where: any = {};
    if (userId) where.userId = userId;

    const pipelines = await DealPipeline.findAll({ where });

    const stageTimes: Record<string, number[]> = {};

    for (const p of pipelines) {
      const timings = p.getStageTimings();
      for (const [stage, days] of Object.entries(timings)) {
        if (!stageTimes[stage]) stageTimes[stage] = [];
        stageTimes[stage].push(days);
      }
    }

    const result: StageTimings = {};
    for (const [stage, times] of Object.entries(stageTimes)) {
      if (times.length > 0) {
        result[stage] = {
          avgDays: times.reduce((a, b) => a + b, 0) / times.length,
          minDays: Math.min(...times),
          maxDays: Math.max(...times),
        };
      }
    }

    return result;
  }

  /**
   * Get a single pipeline item
   */
  async getPipelineItem(pipelineId: string): Promise<DealPipeline | null> {
    return DealPipeline.findByPk(pipelineId);
  }

  /**
   * Find pipeline item by deal ID
   */
  async findByDealId(
    userId: string,
    dealId: string
  ): Promise<DealPipeline | null> {
    return DealPipeline.findOne({
      where: { userId, dealId },
    });
  }
}

export const pipelineService = new PipelineService();
export default pipelineService;
