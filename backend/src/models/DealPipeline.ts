/**
 * DealPipeline Model
 *
 * Tracks deals through stages for each user:
 * new → analyzing → due_diligence → offered → negotiating → under_contract → closed_won/closed_lost
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Pipeline stages enum
export const PIPELINE_STAGES = [
  'new',
  'analyzing',
  'due_diligence',
  'offered',
  'negotiating',
  'under_contract',
  'closed_won',
  'closed_lost',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// Stage history entry
export interface StageHistoryEntry {
  stage: PipelineStage;
  enteredAt: string;
  exitedAt?: string;
  notes?: string;
  triggeredBy: 'user' | 'agent' | 'automation';
}

// Deal snapshot at pipeline entry
export interface DealSnapshot {
  price?: number;
  arv?: number;
  equity?: number;
  state?: string;
  city?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
}

// Outcome types
export type PipelineOutcome = 'won' | 'lost' | 'withdrawn';

// Hold reason types
export type HoldReason = 'compliance' | 'fraud' | 'document_review' | 'manual' | 'other';

// Hold status entry
export interface HoldEntry {
  id: string;
  reason: HoldReason;
  description: string;
  heldAt: string;
  heldBy: 'user' | 'automation' | 'system';
  heldByUserId?: string;
  releasedAt?: string;
  releasedBy?: string;
  releasedByUserId?: string;
  workflowExecutionId?: number;
  metadata?: Record<string, unknown>;
}

export interface DealPipelineAttributes {
  id: string;
  userId: string;
  dealId: string;
  propertyId?: number;

  // Current stage
  stage: PipelineStage;

  // Stage history (audit trail)
  stageHistory: StageHistoryEntry[];

  // Deal snapshot at entry
  entrySnapshot: DealSnapshot;

  // Outcome tracking
  outcome?: PipelineOutcome;
  outcomeReason?: string;
  closePrice?: number;
  closedAt?: Date;

  // Hold tracking
  isHeld: boolean;
  holdEntries: HoldEntry[];
  currentHoldId?: string;

  // Notes
  notes?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface DealPipelineCreationAttributes
  extends Optional<
    DealPipelineAttributes,
    | 'id'
    | 'propertyId'
    | 'stageHistory'
    | 'entrySnapshot'
    | 'outcome'
    | 'outcomeReason'
    | 'closePrice'
    | 'closedAt'
    | 'isHeld'
    | 'holdEntries'
    | 'currentHoldId'
    | 'notes'
    | 'createdAt'
    | 'updatedAt'
  > {}

class DealPipeline
  extends Model<DealPipelineAttributes, DealPipelineCreationAttributes>
  implements DealPipelineAttributes
{
  declare id: string;
  declare userId: string;
  declare dealId: string;
  declare propertyId?: number;
  declare stage: PipelineStage;
  declare stageHistory: StageHistoryEntry[];
  declare entrySnapshot: DealSnapshot;
  declare outcome?: PipelineOutcome;
  declare outcomeReason?: string;
  declare closePrice?: number;
  declare closedAt?: Date;
  declare isHeld: boolean;
  declare holdEntries: HoldEntry[];
  declare currentHoldId?: string;
  declare notes?: string;
  declare createdAt: Date;
  declare updatedAt: Date;

  /**
   * Calculate days in pipeline
   */
  getDaysInPipeline(): number {
    const endDate = this.closedAt || new Date();
    const startDate = this.createdAt;
    const diffTime = endDate.getTime() - startDate.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate days in current stage
   */
  getDaysInCurrentStage(): number {
    const history = this.stageHistory || [];
    const currentStageEntry = history.find(
      (h) => h.stage === this.stage && !h.exitedAt
    );
    if (!currentStageEntry) return 0;

    const enteredAt = new Date(currentStageEntry.enteredAt);
    const diffTime = Math.abs(Date.now() - enteredAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if deal is closed
   */
  isClosed(): boolean {
    return this.stage === 'closed_won' || this.stage === 'closed_lost';
  }

  /**
   * Check if deal was won
   */
  isWon(): boolean {
    return this.stage === 'closed_won' || this.outcome === 'won';
  }

  /**
   * Get time spent in each stage
   */
  getStageTimings(): Record<string, number> {
    const timings: Record<string, number> = {};
    const history = this.stageHistory || [];

    for (const entry of history) {
      const enteredAt = new Date(entry.enteredAt);
      const exitedAt = entry.exitedAt ? new Date(entry.exitedAt) : new Date();
      const daysInStage = Math.ceil(
        (exitedAt.getTime() - enteredAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      timings[entry.stage] = (timings[entry.stage] || 0) + daysInStage;
    }

    return timings;
  }

  /**
   * Hold the deal
   */
  async hold(
    reason: HoldReason,
    description: string,
    options: {
      heldBy?: 'user' | 'automation' | 'system';
      heldByUserId?: string;
      workflowExecutionId?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<HoldEntry> {
    const holdId = require('crypto').randomUUID();
    const holdEntry: HoldEntry = {
      id: holdId,
      reason,
      description,
      heldAt: new Date().toISOString(),
      heldBy: options.heldBy || 'system',
      heldByUserId: options.heldByUserId,
      workflowExecutionId: options.workflowExecutionId,
      metadata: options.metadata,
    };

    const holdEntries = [...(this.holdEntries || []), holdEntry];

    await this.update({
      isHeld: true,
      holdEntries,
      currentHoldId: holdId,
    });

    return holdEntry;
  }

  /**
   * Release a hold on the deal
   */
  async releaseHold(
    holdId: string,
    releasedBy: string,
    releasedByUserId?: string
  ): Promise<boolean> {
    const holdEntries = [...(this.holdEntries || [])];
    const holdIndex = holdEntries.findIndex(h => h.id === holdId);

    if (holdIndex === -1) {
      return false;
    }

    holdEntries[holdIndex] = {
      ...holdEntries[holdIndex],
      releasedAt: new Date().toISOString(),
      releasedBy,
      releasedByUserId,
    };

    // Check if any holds are still active
    const hasActiveHolds = holdEntries.some(h => !h.releasedAt);

    await this.update({
      isHeld: hasActiveHolds,
      holdEntries,
      currentHoldId: hasActiveHolds
        ? holdEntries.find(h => !h.releasedAt)?.id
        : undefined,
    });

    return true;
  }

  /**
   * Release all active holds
   */
  async releaseAllHolds(releasedBy: string, releasedByUserId?: string): Promise<void> {
    const holdEntries = (this.holdEntries || []).map(h => ({
      ...h,
      releasedAt: h.releasedAt || new Date().toISOString(),
      releasedBy: h.releasedBy || releasedBy,
      releasedByUserId: h.releasedByUserId || releasedByUserId,
    }));

    await this.update({
      isHeld: false,
      holdEntries,
      currentHoldId: undefined,
    });
  }

  /**
   * Get active holds
   */
  getActiveHolds(): HoldEntry[] {
    return (this.holdEntries || []).filter(h => !h.releasedAt);
  }

  /**
   * Check if deal has a specific type of hold
   */
  hasHoldType(reason: HoldReason): boolean {
    return this.getActiveHolds().some(h => h.reason === reason);
  }

  /**
   * Get deals with active holds (static)
   */
  static async getHeldDeals(userId?: string): Promise<DealPipeline[]> {
    const where: Record<string, unknown> = { isHeld: true };
    if (userId) where.userId = userId;

    return this.findAll({
      where,
      order: [['updatedAt', 'DESC']],
    });
  }

  /**
   * Get deals with compliance holds (static)
   */
  static async getComplianceHeldDeals(userId?: string): Promise<DealPipeline[]> {
    const deals = await this.getHeldDeals(userId);
    return deals.filter(d => d.hasHoldType('compliance'));
  }
}

DealPipeline.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    stage: {
      type: DataTypes.ENUM(...PIPELINE_STAGES),
      allowNull: false,
      defaultValue: 'new',
    },
    stageHistory: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    entrySnapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    outcome: {
      type: DataTypes.ENUM('won', 'lost', 'withdrawn'),
      allowNull: true,
    },
    outcomeReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    closePrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isHeld: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    holdEntries: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    currentHoldId: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'deal_pipelines',
    modelName: 'DealPipeline',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['dealId'] },
      { fields: ['stage'] },
      { fields: ['userId', 'stage'] },
      { fields: ['outcome'] },
      { fields: ['createdAt'] },
      { fields: ['closedAt'] },
      { fields: ['isHeld'] },
      { fields: ['userId', 'isHeld'] },
    ],
  }
);

export default DealPipeline;
