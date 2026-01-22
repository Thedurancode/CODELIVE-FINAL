/**
 * FollowUpExecution Model
 *
 * Tracks active follow-up chain executions for deals/offers.
 * Records which step is current and when the next action should occur.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export type FollowUpExecutionStatus = 'active' | 'paused' | 'completed' | 'cancelled';

// Record of an executed step
export interface StepExecutionRecord {
  stepNumber: number;
  executedAt: string;
  success: boolean;
  error?: string;
  result?: any;
  skipped?: boolean;
  skipReason?: string;
}

interface FollowUpExecutionAttributes {
  id: string;
  chainId: string;
  chainName: string;
  dealId?: string;
  offerId?: string;
  userId: string;
  currentStep: number;
  status: FollowUpExecutionStatus;
  nextExecutionAt: Date;
  stepHistory: StepExecutionRecord[];
  context: object; // Deal/offer data at time of start
  startedAt: Date;
  completedAt?: Date;
  cancelReason?: string;
  pausedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface FollowUpExecutionCreationAttributes
  extends Optional<
    FollowUpExecutionAttributes,
    | 'id'
    | 'currentStep'
    | 'status'
    | 'stepHistory'
    | 'completedAt'
    | 'cancelReason'
    | 'pausedAt'
    | 'createdAt'
    | 'updatedAt'
  > {}

class FollowUpExecution
  extends Model<FollowUpExecutionAttributes, FollowUpExecutionCreationAttributes>
  implements FollowUpExecutionAttributes
{
  declare id: string;
  declare chainId: string;
  declare chainName: string;
  declare dealId: string | undefined;
  declare offerId: string | undefined;
  declare userId: string;
  declare currentStep: number;
  declare status: FollowUpExecutionStatus;
  declare nextExecutionAt: Date;
  declare stepHistory: StepExecutionRecord[];
  declare context: object;
  declare startedAt: Date;
  declare completedAt: Date | undefined;
  declare cancelReason: string | undefined;
  declare pausedAt: Date | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if execution is active
   */
  isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Check if execution is due for processing
   */
  isDue(): boolean {
    return this.isActive() && this.nextExecutionAt <= new Date();
  }

  /**
   * Get elapsed time since start
   */
  getElapsedDays(): number {
    const elapsed = Date.now() - this.startedAt.getTime();
    return Math.floor(elapsed / (1000 * 60 * 60 * 24));
  }

  /**
   * Record step execution
   */
  recordStepExecution(record: StepExecutionRecord): void {
    this.stepHistory = [...(this.stepHistory || []), record];
  }

  /**
   * Advance to next step
   */
  advanceStep(nextStepNumber: number, nextExecutionAt: Date): void {
    this.currentStep = nextStepNumber;
    this.nextExecutionAt = nextExecutionAt;
  }

  /**
   * Mark as completed
   */
  markCompleted(): void {
    this.status = 'completed';
    this.completedAt = new Date();
  }

  /**
   * Mark as cancelled
   */
  markCancelled(reason: string): void {
    this.status = 'cancelled';
    this.cancelReason = reason;
    this.completedAt = new Date();
  }

  /**
   * Pause execution
   */
  pause(): void {
    this.status = 'paused';
    this.pausedAt = new Date();
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.status === 'paused') {
      this.status = 'active';
      this.pausedAt = undefined;
    }
  }

  /**
   * Get summary of execution
   */
  getSummary(): string {
    const stepsCompleted = this.stepHistory?.length || 0;
    const status = this.status;
    return `${this.chainName}: Step ${this.currentStep} (${stepsCompleted} completed) - ${status}`;
  }

  // Static query methods

  /**
   * Find executions due for processing
   */
  static async findDue(): Promise<FollowUpExecution[]> {
    return this.findAll({
      where: {
        status: 'active',
        nextExecutionAt: { [Op.lte]: new Date() },
      },
      order: [['nextExecutionAt', 'ASC']],
    });
  }

  /**
   * Find active executions for a deal
   */
  static async findByDeal(dealId: string): Promise<FollowUpExecution[]> {
    return this.findAll({
      where: {
        dealId,
        status: { [Op.in]: ['active', 'paused'] },
      },
    });
  }

  /**
   * Find active executions for an offer
   */
  static async findByOffer(offerId: string): Promise<FollowUpExecution[]> {
    return this.findAll({
      where: {
        offerId,
        status: { [Op.in]: ['active', 'paused'] },
      },
    });
  }

  /**
   * Cancel all active executions for a deal
   */
  static async cancelByDeal(dealId: string, reason: string): Promise<number> {
    const [affectedCount] = await this.update(
      {
        status: 'cancelled',
        cancelReason: reason,
        completedAt: new Date(),
      },
      {
        where: {
          dealId,
          status: { [Op.in]: ['active', 'paused'] },
        },
      }
    );
    return affectedCount;
  }

  /**
   * Cancel all active executions for an offer
   */
  static async cancelByOffer(offerId: string, reason: string): Promise<number> {
    const [affectedCount] = await this.update(
      {
        status: 'cancelled',
        cancelReason: reason,
        completedAt: new Date(),
      },
      {
        where: {
          offerId,
          status: { [Op.in]: ['active', 'paused'] },
        },
      }
    );
    return affectedCount;
  }

  /**
   * Get execution statistics
   */
  static async getStats(): Promise<{
    total: number;
    active: number;
    paused: number;
    completed: number;
    cancelled: number;
    dueNow: number;
  }> {
    const total = await this.count();
    const active = await this.count({ where: { status: 'active' } });
    const paused = await this.count({ where: { status: 'paused' } });
    const completed = await this.count({ where: { status: 'completed' } });
    const cancelled = await this.count({ where: { status: 'cancelled' } });
    const dueNow = await this.count({
      where: {
        status: 'active',
        nextExecutionAt: { [Op.lte]: new Date() },
      },
    });

    return { total, active, paused, completed, cancelled, dueNow };
  }

  /**
   * Cleanup old completed/cancelled executions
   */
  static async cleanup(retentionDays: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.destroy({
      where: {
        status: { [Op.in]: ['completed', 'cancelled'] },
        completedAt: { [Op.lt]: cutoff },
      },
    });
    return result;
  }
}

FollowUpExecution.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    chainId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    chainName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    offerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    currentStep: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    status: {
      type: DataTypes.ENUM('active', 'paused', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'active',
    },
    nextExecutionAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    stepHistory: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pausedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'follow_up_executions',
    timestamps: true,
    indexes: [
      { fields: ['chainId'] },
      { fields: ['dealId'] },
      { fields: ['offerId'] },
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['nextExecutionAt'] },
      { fields: ['status', 'nextExecutionAt'] }, // Composite for due query
    ],
  }
);

export default FollowUpExecution;
export { FollowUpExecutionAttributes, FollowUpExecutionCreationAttributes };
