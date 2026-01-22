/**
 * Oklahoma Workflow State Model
 *
 * Tracks which phases are complete for an Oklahoma deal
 * 7-Phase Structure:
 *   Phase 0: Account Setup & Entity Verification
 *   Phase 1: Property Submission
 *   Phase 2: Compliance Review & Approval
 *   Phase 3: Approved / Pre-Distribution
 *   Phase 4: Offer Accepted / Pre-Buyer Seller Acknowledgment (3-day hold)
 *   Phase 5: Buyer Contract Execution
 *   Phase 6: Title, Closing & Settlement
 */

import { Model, DataTypes, Sequelize } from 'sequelize';

export interface OklahomaWorkflowStateAttributes {
  id?: number;
  dealId: number;
  currentPhase: number;
  phase0Complete: boolean;
  phase1Complete: boolean;
  phase2Complete: boolean;
  phase3Complete: boolean;
  phase4Complete: boolean;
  phase5Complete: boolean;
  phase6Complete: boolean;
  blocked: boolean;
  blockedReason?: string;
  // Track 3-day statutory hold
  sellerAcknowledgmentDate?: Date;
  statutoryHoldExpiresAt?: Date;
  transactionType?: 'wholesale' | 'double_closing';
  updatedAt?: Date;
}

class OklahomaWorkflowState extends Model<OklahomaWorkflowStateAttributes> implements OklahomaWorkflowStateAttributes {
  public id!: number;
  public dealId!: number;
  public currentPhase!: number;
  public phase0Complete!: boolean;
  public phase1Complete!: boolean;
  public phase2Complete!: boolean;
  public phase3Complete!: boolean;
  public phase4Complete!: boolean;
  public phase5Complete!: boolean;
  public phase6Complete!: boolean;
  public blocked!: boolean;
  public blockedReason?: string;
  public sellerAcknowledgmentDate?: Date;
  public statutoryHoldExpiresAt?: Date;
  public transactionType?: 'wholesale' | 'double_closing';
  public readonly updatedAt!: Date;

  /**
   * Mark a phase as complete and advance to next phase
   */
  async completePhase(phase: number, reason?: string): Promise<void> {
    const phaseField = `phase${phase}Complete` as keyof OklahomaWorkflowStateAttributes;
    (this as any)[phaseField] = true;

    // Advance current phase
    if (this.currentPhase === phase) {
      this.currentPhase = phase + 1;
    }

    // Unblock if was blocked
    if (this.blocked && !reason) {
      this.blocked = false;
      this.blockedReason = undefined;
    }

    await this.save();
  }

  /**
   * Block workflow with reason
   */
  async block(reason: string): Promise<void> {
    this.blocked = true;
    this.blockedReason = reason;
    await this.save();
  }

  /**
   * Unblock workflow
   */
  async unblock(): Promise<void> {
    this.blocked = false;
    this.blockedReason = undefined;
    await this.save();
  }

  /**
   * Start the 3-day statutory hold (Phase 4)
   */
  async startStatutoryHold(): Promise<void> {
    const now = new Date();
    this.sellerAcknowledgmentDate = now;
    // 3 business days = roughly 3 calendar days (can be adjusted for business day calculation)
    const holdExpires = new Date(now);
    holdExpires.setDate(holdExpires.getDate() + 3);
    this.statutoryHoldExpiresAt = holdExpires;
    await this.save();
  }

  /**
   * Check if statutory hold has expired
   */
  isStatutoryHoldExpired(): boolean {
    if (!this.statutoryHoldExpiresAt) return false;
    return new Date() >= this.statutoryHoldExpiresAt;
  }

  /**
   * Check if can proceed to specific phase
   */
  canProceedToPhase(phase: number): boolean {
    if (this.blocked) return false;

    // Phase dependencies (7-phase structure)
    const dependencies: { [key: number]: number[] } = {
      1: [0],       // Need Account Setup before Property Submission
      2: [1],       // Need Property Submission before Compliance Review
      3: [2],       // Need Compliance Review before Pre-Distribution
      4: [3],       // Need Pre-Distribution before Offer Accepted
      5: [4],       // Need Offer Accepted (and 3-day hold) before Buyer Contract
      6: [5],       // Need Buyer Contract before Closing
    };

    const required = dependencies[phase] || [];
    for (const reqPhase of required) {
      const phaseField = `phase${reqPhase}Complete` as keyof OklahomaWorkflowStateAttributes;
      if (!(this as any)[phaseField]) {
        return false;
      }
    }

    // Special check for Phase 5: must wait for 3-day statutory hold
    if (phase === 5 && !this.isStatutoryHoldExpired()) {
      return false;
    }

    return true;
  }
}

export function initOklahomaWorkflowState(sequelize: Sequelize): typeof OklahomaWorkflowState {
  OklahomaWorkflowState.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      dealId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        field: 'deal_id',
      },
      currentPhase: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'current_phase',
      },
      phase0Complete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'phase0_complete',
      },
      phase1Complete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'phase1_complete',
      },
      phase2Complete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'phase2_complete',
      },
      phase3Complete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'phase3_complete',
      },
      phase4Complete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'phase4_complete',
      },
      phase5Complete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'phase5_complete',
      },
      phase6Complete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'phase6_complete',
      },
      blocked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      blockedReason: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'blocked_reason',
      },
      sellerAcknowledgmentDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'seller_acknowledgment_date',
        comment: 'Date seller signed acknowledgment - starts 3-day hold',
      },
      statutoryHoldExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'statutory_hold_expires_at',
        comment: 'When the 3-day statutory hold expires',
      },
      transactionType: {
        type: DataTypes.ENUM('wholesale', 'double_closing'),
        allowNull: true,
        defaultValue: 'wholesale',
        field: 'transaction_type',
        comment: 'Transaction type: wholesale (assignment) or double_closing',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at',
      },
    },
    {
      sequelize,
      tableName: 'oklahoma_workflow_state',
      timestamps: false,
      updatedAt: 'updated_at',
      underscored: true,
    }
  );

  return OklahomaWorkflowState;
}

export default OklahomaWorkflowState;
