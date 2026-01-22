/**
 * Universal State Deal Compliance Model
 *
 * Tracks compliance checks for wholesale deals in ANY state.
 * State-specific rules are loaded from compliance-specs JSON files.
 */

import { Model, DataTypes, Sequelize } from 'sequelize';

export type ComplianceStatus = 'GREEN' | 'YELLOW' | 'RED' | null;

export type TransactionType = 'wholesale' | 'novation' | 'double_closing';
export type BrokerDecision = 'pending' | 'approved' | 'rejected' | 'needs_info';
export type DistributionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type DistributionChannel = 'auction' | 'funds' | 'private_buyers';

export interface StateDealComplianceAttributes {
  id?: number;
  dealId: number;
  llcId: number;
  state: string;
  county?: string;
  specVersion?: string;

  // Phase 1: Transaction Type
  transactionType?: TransactionType;

  // Phase 3: Universal Contract Checks (all states)
  phase3Status?: ComplianceStatus;
  buyerMatchesLlc?: boolean;
  sellerMatchesRecords?: boolean;
  contractAssignable?: boolean;
  asIsLanguage?: boolean;
  contractNotExpired?: boolean;
  sellerSignaturePresent?: boolean;
  phase3Details?: Record<string, any>;

  // Phase 4: Disclosure Checks (varies by state)
  phase4Status?: ComplianceStatus;
  disclosureScore?: number;
  totalDisclosures?: number;
  disclosureResults?: Record<string, boolean>;
  disclosureEvidence?: Record<string, string>;
  phase4Details?: Record<string, any>;

  // Phase 5: Overall Compliance
  overallStatus?: ComplianceStatus;

  // Phase 8: Broker Review
  brokerReviewed?: boolean;
  brokerReviewedBy?: string;
  brokerReviewedAt?: Date;
  brokerDecision?: BrokerDecision;
  brokerNotes?: string;

  // Phase 9: Distribution Status
  distributionStartedAt?: Date;
  distributionStatus?: DistributionStatus;
  distributionNotes?: string;

  // Phase 10: Timing Validation (states that require it)
  contractAcceptanceDate?: Date;
  cancellationDeliveryDate?: Date;
  cancellationAcknowledged?: boolean;
  timingValid?: boolean;
  phase10Details?: Record<string, any>;

  // Phase 11: Assignment Execution
  assignmentExecutionDate?: Date;
  assignmentFee?: number;
  assigneeName?: string;
  assigneeEntityType?: string;
  phase11Details?: Record<string, any>;

  // Permissions
  canDistribute: boolean;
  canExecuteAssignment: boolean;

  // State-specific fields stored as JSONB
  stateSpecificData?: Record<string, any>;

  // Remediation tracking
  remediationAttempts?: number;
  lastRemediationAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

class StateDealCompliance
  extends Model<StateDealComplianceAttributes>
  implements StateDealComplianceAttributes
{
  public id!: number;
  public dealId!: number;
  public llcId!: number;
  public state!: string;
  public county?: string;
  public specVersion?: string;

  // Phase 1
  public transactionType?: TransactionType;

  // Phase 3
  public phase3Status?: ComplianceStatus;
  public buyerMatchesLlc?: boolean;
  public sellerMatchesRecords?: boolean;
  public contractAssignable?: boolean;
  public asIsLanguage?: boolean;
  public contractNotExpired?: boolean;
  public sellerSignaturePresent?: boolean;
  public phase3Details?: Record<string, any>;

  // Phase 4
  public phase4Status?: ComplianceStatus;
  public disclosureScore?: number;
  public totalDisclosures?: number;
  public disclosureResults?: Record<string, boolean>;
  public disclosureEvidence?: Record<string, string>;
  public phase4Details?: Record<string, any>;

  // Phase 5
  public overallStatus?: ComplianceStatus;

  // Phase 8: Broker Review
  public brokerReviewed?: boolean;
  public brokerReviewedBy?: string;
  public brokerReviewedAt?: Date;
  public brokerDecision?: BrokerDecision;
  public brokerNotes?: string;

  // Phase 9: Distribution Status
  public distributionStartedAt?: Date;
  public distributionStatus?: DistributionStatus;
  public distributionNotes?: string;

  // Phase 10
  public contractAcceptanceDate?: Date;
  public cancellationDeliveryDate?: Date;
  public cancellationAcknowledged?: boolean;
  public timingValid?: boolean;
  public phase10Details?: Record<string, any>;

  // Phase 11
  public assignmentExecutionDate?: Date;
  public assignmentFee?: number;
  public assigneeName?: string;
  public assigneeEntityType?: string;
  public phase11Details?: Record<string, any>;

  public canDistribute!: boolean;
  public canExecuteAssignment!: boolean;

  public stateSpecificData?: Record<string, any>;

  public remediationAttempts?: number;
  public lastRemediationAt?: Date;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Calculate Phase 3 status from universal contract checks
   */
  calculatePhase3Status(): ComplianceStatus {
    const criticalChecks = [
      this.buyerMatchesLlc,
      this.contractAssignable,
      this.contractNotExpired,
      this.sellerSignaturePresent,
    ];

    // All critical must pass for GREEN
    const allCriticalPass = criticalChecks.every((c) => c === true);

    // AS-IS and seller records are warnings
    const hasWarnings =
      this.asIsLanguage !== true || this.sellerMatchesRecords !== true;

    if (criticalChecks.some((c) => c === false)) {
      return 'RED';
    } else if (allCriticalPass && !hasWarnings) {
      return 'GREEN';
    } else if (allCriticalPass && hasWarnings) {
      return 'YELLOW';
    } else {
      return 'RED';
    }
  }

  /**
   * Update Phase 3 status
   */
  updatePhase3Status(): void {
    this.phase3Status = this.calculatePhase3Status();
    this.updateOverallStatus();
  }

  /**
   * Calculate Phase 4 status from disclosure score
   */
  calculatePhase4Status(): ComplianceStatus {
    if (!this.totalDisclosures || this.totalDisclosures === 0) return null;

    const score = this.disclosureScore || 0;
    const percentage = score / this.totalDisclosures;

    if (percentage === 1) {
      return 'GREEN';
    } else if (percentage >= 0.5) {
      return 'YELLOW';
    } else {
      return 'RED';
    }
  }

  /**
   * Update Phase 4 status from disclosure results
   */
  updatePhase4Status(): void {
    if (this.disclosureResults) {
      const results = Object.values(this.disclosureResults);
      this.disclosureScore = results.filter((v) => v === true).length;
      this.totalDisclosures = results.length;
    }
    this.phase4Status = this.calculatePhase4Status();
    this.updateOverallStatus();
  }

  /**
   * Update overall compliance status
   */
  updateOverallStatus(): void {
    if (this.phase3Status === 'RED' || this.phase4Status === 'RED') {
      this.overallStatus = 'RED';
      this.canDistribute = false;
    } else if (this.phase3Status === 'YELLOW' || this.phase4Status === 'YELLOW') {
      this.overallStatus = 'YELLOW';
      this.canDistribute = false;
    } else if (this.phase3Status === 'GREEN' && this.phase4Status === 'GREEN') {
      this.overallStatus = 'GREEN';
      this.canDistribute = true;
    } else {
      this.overallStatus = null;
      this.canDistribute = false;
    }
  }

  /**
   * Validate Phase 10 timing (contract → cancellation → assignment)
   */
  validateTiming(): boolean {
    if (!this.contractAcceptanceDate || !this.cancellationDeliveryDate) {
      return false;
    }

    const contractDate = new Date(this.contractAcceptanceDate);
    const cancellationDate = new Date(this.cancellationDeliveryDate);

    // Cancellation must be after contract acceptance
    if (cancellationDate <= contractDate) {
      this.timingValid = false;
      this.canExecuteAssignment = false;
      return false;
    }

    // If assignment date provided, must be after cancellation
    if (this.assignmentExecutionDate) {
      const assignmentDate = new Date(this.assignmentExecutionDate);
      if (assignmentDate <= cancellationDate) {
        this.timingValid = false;
        this.canExecuteAssignment = false;
        return false;
      }
    }

    this.timingValid = true;
    this.canExecuteAssignment = this.cancellationAcknowledged === true;
    return true;
  }

  /**
   * Set disclosure result by ID
   */
  setDisclosureResult(disclosureId: string, found: boolean, evidence?: string): void {
    if (!this.disclosureResults) this.disclosureResults = {};
    if (!this.disclosureEvidence) this.disclosureEvidence = {};

    this.disclosureResults[disclosureId] = found;
    if (evidence) {
      this.disclosureEvidence[disclosureId] = evidence;
    }

    this.updatePhase4Status();
  }

  /**
   * Get state-specific field value
   */
  getStateField<T>(fieldName: string): T | undefined {
    return this.stateSpecificData?.[fieldName] as T | undefined;
  }

  /**
   * Set state-specific field value
   */
  setStateField(fieldName: string, value: any): void {
    if (!this.stateSpecificData) this.stateSpecificData = {};
    this.stateSpecificData[fieldName] = value;
  }

  /**
   * Increment remediation attempts
   */
  incrementRemediation(): void {
    this.remediationAttempts = (this.remediationAttempts || 0) + 1;
    this.lastRemediationAt = new Date();
  }

  // ========================================================================
  // PHASE 1: Transaction Type Methods
  // ========================================================================

  /**
   * Update transaction type (Phase 1)
   */
  updateTransactionType(type: TransactionType): void {
    this.transactionType = type;
  }

  /**
   * Check if transaction type is allowed for state (Oklahoma only allows wholesale)
   */
  isTransactionTypeAllowed(state: string): boolean {
    if (state === 'OK') {
      return this.transactionType === 'wholesale';
    }
    // Other states may have different rules
    return true;
  }

  // ========================================================================
  // PHASE 6: Distribution Channels Methods
  // ========================================================================

  /**
   * Get selected distribution channels
   */
  getDistributionChannels(): DistributionChannel[] {
    return this.getStateField<DistributionChannel[]>('distributionChannels') || [];
  }

  /**
   * Set distribution channels (Phase 6)
   */
  setDistributionChannels(channels: DistributionChannel[]): void {
    this.setStateField('distributionChannels', channels);
  }

  /**
   * Check if auction channel is selected (triggers ASA requirement)
   */
  hasAuctionChannel(): boolean {
    const channels = this.getDistributionChannels();
    return channels.includes('auction');
  }

  // ========================================================================
  // PHASE 8: Broker Review Methods
  // ========================================================================

  /**
   * Record broker review (Phase 8)
   */
  recordBrokerReview(
    reviewedBy: string,
    decision: BrokerDecision,
    notes?: string
  ): void {
    this.brokerReviewed = true;
    this.brokerReviewedBy = reviewedBy;
    this.brokerReviewedAt = new Date();
    this.brokerDecision = decision;
    this.brokerNotes = notes;

    // Update canDistribute based on decision
    if (decision === 'approved' && this.overallStatus === 'GREEN') {
      this.canDistribute = true;
    } else {
      this.canDistribute = false;
    }
  }

  /**
   * Check if broker has approved
   */
  isBrokerApproved(): boolean {
    return this.brokerReviewed === true && this.brokerDecision === 'approved';
  }

  // ========================================================================
  // PHASE 9: Distribution Status Methods
  // ========================================================================

  /**
   * Start distribution (Phase 9)
   */
  startDistribution(notes?: string): void {
    this.distributionStartedAt = new Date();
    this.distributionStatus = 'in_progress';
    if (notes) {
      this.distributionNotes = notes;
    }
  }

  /**
   * Complete distribution
   */
  completeDistribution(notes?: string): void {
    this.distributionStatus = 'completed';
    if (notes) {
      this.distributionNotes = notes;
    }
  }

  /**
   * Mark distribution as failed
   */
  failDistribution(reason: string): void {
    this.distributionStatus = 'failed';
    this.distributionNotes = reason;
  }

  /**
   * Update distribution status
   */
  updateDistributionStatus(status: DistributionStatus, notes?: string): void {
    this.distributionStatus = status;
    if (status === 'in_progress' && !this.distributionStartedAt) {
      this.distributionStartedAt = new Date();
    }
    if (notes) {
      this.distributionNotes = notes;
    }
  }
}

export function initStateDealCompliance(sequelize: Sequelize): typeof StateDealCompliance {
  StateDealCompliance.init(
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
      llcId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'llc_id',
      },
      state: {
        type: DataTypes.STRING(2),
        allowNull: false,
        comment: 'State code (OK, TX, FL, etc.)',
      },
      county: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'County name (optional, for county-specific rules)',
      },
      specVersion: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'spec_version',
        comment: 'Version of compliance spec used',
      },

      // Phase 1: Transaction Type
      transactionType: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'transaction_type',
        comment: 'Transaction type: wholesale, novation, double_closing',
      },

      // Phase 3
      phase3Status: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: 'phase3_status',
      },
      buyerMatchesLlc: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'buyer_matches_llc',
      },
      sellerMatchesRecords: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'seller_matches_records',
      },
      contractAssignable: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'contract_assignable',
      },
      asIsLanguage: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'as_is_language',
      },
      contractNotExpired: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'contract_not_expired',
      },
      sellerSignaturePresent: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'seller_signature_present',
      },
      phase3Details: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'phase3_details',
      },

      // Phase 4
      phase4Status: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: 'phase4_status',
      },
      disclosureScore: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'disclosure_score',
        comment: 'Number of required disclosures found',
      },
      totalDisclosures: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'total_disclosures',
        comment: 'Total required disclosures for this state',
      },
      disclosureResults: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'disclosure_results',
        comment: 'Map of disclosureId -> boolean',
      },
      disclosureEvidence: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'disclosure_evidence',
        comment: 'Map of disclosureId -> evidence text',
      },
      phase4Details: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'phase4_details',
      },

      // Phase 5
      overallStatus: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: 'overall_status',
      },

      // Phase 8: Broker Review
      brokerReviewed: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        field: 'broker_reviewed',
        comment: 'Whether broker has reviewed the deal',
      },
      brokerReviewedBy: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'broker_reviewed_by',
        comment: 'Name of broker who reviewed',
      },
      brokerReviewedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'broker_reviewed_at',
        comment: 'Timestamp of broker review',
      },
      brokerDecision: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'broker_decision',
        comment: 'Broker decision: pending, approved, rejected, needs_info',
      },
      brokerNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'broker_notes',
        comment: 'Broker review notes/comments',
      },

      // Phase 9: Distribution Status
      distributionStartedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'distribution_started_at',
        comment: 'When distribution began',
      },
      distributionStatus: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'distribution_status',
        comment: 'Distribution status: pending, in_progress, completed, failed',
      },
      distributionNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'distribution_notes',
        comment: 'Distribution notes and details',
      },

      // Phase 10
      contractAcceptanceDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'contract_acceptance_date',
      },
      cancellationDeliveryDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'cancellation_delivery_date',
      },
      cancellationAcknowledged: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'cancellation_acknowledged',
      },
      timingValid: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'timing_valid',
      },
      phase10Details: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'phase10_details',
      },

      // Phase 11
      assignmentExecutionDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'assignment_execution_date',
      },
      assignmentFee: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: 'assignment_fee',
      },
      assigneeName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'assignee_name',
      },
      assigneeEntityType: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'assignee_entity_type',
      },
      phase11Details: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'phase11_details',
      },

      // Permissions
      canDistribute: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'can_distribute',
      },
      canExecuteAssignment: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'can_execute_assignment',
      },

      // State-specific data
      stateSpecificData: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'state_specific_data',
        comment: 'State-specific fields (e.g., TX: optionPeriod, OK: marketingClause)',
      },

      // Remediation
      remediationAttempts: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        field: 'remediation_attempts',
      },
      lastRemediationAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_remediation_at',
      },

      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at',
      },
    },
    {
      sequelize,
      tableName: 'state_deal_compliance',
      timestamps: true,
      underscored: true,
      indexes: [
        { unique: true, fields: ['deal_id', 'state'] },
        { fields: ['llc_id'] },
        { fields: ['state'] },
        { fields: ['overall_status'] },
        { fields: ['can_distribute'] },
        { fields: ['can_execute_assignment'] },
        { fields: ['transaction_type'] },
        { fields: ['broker_decision'] },
        { fields: ['distribution_status'] },
      ],
    }
  );

  return StateDealCompliance;
}

export default StateDealCompliance;
