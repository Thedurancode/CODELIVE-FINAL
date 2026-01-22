/**
 * Universal State Workflow State Model
 *
 * Tracks workflow phase progression for deals in ANY state.
 * Phase requirements are loaded from compliance-specs JSON files.
 */

import { Model, DataTypes, Sequelize } from 'sequelize';

export interface StateWorkflowStateAttributes {
  id?: number;
  dealId: number;
  state: string;
  county?: string;
  currentPhase: number;
  maxPhase: number;

  // Phase completion tracking (dynamic based on state spec)
  phaseCompletions: Record<number, boolean>;
  phaseCompletedAt: Record<number, Date>;

  // Blocking state
  blocked: boolean;
  blockedReason?: string;
  blockedAtPhase?: number;
  blockedByGate?: string;

  // Progress metadata
  startedAt?: Date;
  lastAdvancedAt?: Date;
  completedAt?: Date;

  updatedAt?: Date;
}

class StateWorkflowState
  extends Model<StateWorkflowStateAttributes>
  implements StateWorkflowStateAttributes
{
  public id!: number;
  public dealId!: number;
  public state!: string;
  public county?: string;
  public currentPhase!: number;
  public maxPhase!: number;

  public phaseCompletions!: Record<number, boolean>;
  public phaseCompletedAt!: Record<number, Date>;

  public blocked!: boolean;
  public blockedReason?: string;
  public blockedAtPhase?: number;
  public blockedByGate?: string;

  public startedAt?: Date;
  public lastAdvancedAt?: Date;
  public completedAt?: Date;

  public readonly updatedAt!: Date;

  /**
   * Check if a phase is complete
   */
  isPhaseComplete(phase: number): boolean {
    return this.phaseCompletions?.[phase] === true;
  }

  /**
   * Mark a phase as complete
   */
  async completePhase(phase: number): Promise<void> {
    if (!this.phaseCompletions) this.phaseCompletions = {};
    if (!this.phaseCompletedAt) this.phaseCompletedAt = {};

    this.phaseCompletions[phase] = true;
    this.phaseCompletedAt[phase] = new Date();

    // Advance current phase if completing the current one
    if (this.currentPhase === phase && phase < this.maxPhase) {
      this.currentPhase = phase + 1;
      this.lastAdvancedAt = new Date();
    }

    // Check if workflow is complete
    if (this.currentPhase >= this.maxPhase && !this.completedAt) {
      this.completedAt = new Date();
    }

    // Unblock if was blocked
    if (this.blocked && !this.blockedReason) {
      this.blocked = false;
      this.blockedAtPhase = undefined;
      this.blockedByGate = undefined;
    }

    await this.save();
  }

  /**
   * Block workflow with reason
   */
  async block(reason: string, gateId?: string): Promise<void> {
    this.blocked = true;
    this.blockedReason = reason;
    this.blockedAtPhase = this.currentPhase;
    this.blockedByGate = gateId;
    await this.save();
  }

  /**
   * Unblock workflow
   */
  async unblock(): Promise<void> {
    this.blocked = false;
    this.blockedReason = undefined;
    this.blockedAtPhase = undefined;
    this.blockedByGate = undefined;
    await this.save();
  }

  /**
   * Check if can proceed to a specific phase
   */
  canProceedToPhase(phase: number, prerequisites: number[]): boolean {
    if (this.blocked) return false;

    // Check all prerequisites are complete
    for (const prereq of prerequisites) {
      if (!this.isPhaseComplete(prereq)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get phase completion percentage
   */
  getCompletionPercentage(): number {
    if (this.maxPhase === 0) return 0;

    const completedPhases = Object.values(this.phaseCompletions || {}).filter(
      (v) => v === true
    ).length;

    return Math.round((completedPhases / (this.maxPhase + 1)) * 100);
  }

  /**
   * Get list of incomplete phases
   */
  getIncompletePhases(): number[] {
    const incomplete: number[] = [];
    for (let p = 0; p <= this.maxPhase; p++) {
      if (!this.isPhaseComplete(p)) {
        incomplete.push(p);
      }
    }
    return incomplete;
  }

  /**
   * Get phases completed in order
   */
  getCompletedPhasesInOrder(): Array<{ phase: number; completedAt: Date }> {
    return Object.entries(this.phaseCompletions || {})
      .filter(([_, complete]) => complete)
      .map(([phase, _]) => ({
        phase: parseInt(phase),
        completedAt: this.phaseCompletedAt?.[parseInt(phase)] || new Date(),
      }))
      .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  }

  /**
   * Reset to a specific phase (for remediation)
   */
  async resetToPhase(phase: number): Promise<void> {
    // Clear completions for phases after the reset point
    for (const key of Object.keys(this.phaseCompletions || {})) {
      const p = parseInt(key);
      if (p > phase) {
        delete this.phaseCompletions[p];
        if (this.phaseCompletedAt) delete this.phaseCompletedAt[p];
      }
    }

    this.currentPhase = phase;
    this.completedAt = undefined;
    this.blocked = false;
    this.blockedReason = undefined;
    this.blockedAtPhase = undefined;
    this.blockedByGate = undefined;

    await this.save();
  }
}

export function initStateWorkflowState(sequelize: Sequelize): typeof StateWorkflowState {
  StateWorkflowState.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      dealId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'deal_id',
      },
      state: {
        type: DataTypes.STRING(2),
        allowNull: false,
        comment: 'State code (OK, TX, FL, etc.)',
      },
      county: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'County name (optional)',
      },
      currentPhase: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'current_phase',
      },
      maxPhase: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 11,
        field: 'max_phase',
        comment: 'Maximum phase for this state workflow',
      },

      // Phase completions
      phaseCompletions: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        field: 'phase_completions',
        comment: 'Map of phase number -> boolean',
      },
      phaseCompletedAt: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        field: 'phase_completed_at',
        comment: 'Map of phase number -> completion timestamp',
      },

      // Blocking
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
      blockedAtPhase: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'blocked_at_phase',
      },
      blockedByGate: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'blocked_by_gate',
        comment: 'Gate ID that caused blocking',
      },

      // Progress
      startedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'started_at',
      },
      lastAdvancedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_advanced_at',
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'completed_at',
      },

    },
    {
      sequelize,
      tableName: 'state_workflow_state',
      timestamps: true,
      createdAt: false,
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        { unique: true, fields: ['deal_id', 'state'] },
        { fields: ['state'] },
        { fields: ['current_phase'] },
        { fields: ['blocked'] },
      ],
    }
  );

  return StateWorkflowState;
}

export default StateWorkflowState;
