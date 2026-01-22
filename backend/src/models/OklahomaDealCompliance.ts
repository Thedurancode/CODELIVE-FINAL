/**
 * Oklahoma Deal Compliance Model
 *
 * Tracks all compliance checks and results for Oklahoma wholesale deals
 */

import { Model, DataTypes, Sequelize } from 'sequelize';

export interface OklahomaDealComplianceAttributes {
  id?: number;
  dealId: number;
  llcId: number;

  // Phase 3
  phase3Status?: 'GREEN' | 'YELLOW' | 'RED';
  buyerMatchesLlc?: boolean;
  sellerMatchesRecords?: boolean;
  contractAssignable?: boolean;
  asIsLanguage?: boolean;
  contractNotExpired?: boolean;
  phase3Details?: any;

  // Phase 4
  phase4Status?: 'GREEN' | 'YELLOW' | 'RED';
  disclosureNotLicensedBroker?: boolean;
  disclosureActingPrincipal?: boolean;
  disclosureEquitableInterest?: boolean;
  disclosureIntentAssign?: boolean;
  disclosureCompensation?: boolean;
  disclosureDueDiligence?: boolean;
  disclosureNoGuarantee?: boolean;
  disclosureIndependentAdvice?: boolean;
  phase4Details?: any;

  // Phase 5
  overallComplianceStatus?: 'GREEN' | 'YELLOW' | 'RED';

  // Phase 10
  contractAcceptanceDate?: Date;
  cancellationDeliveryDate?: Date;
  cancellationAcknowledged?: boolean;
  timingValid?: boolean;
  phase10Details?: any;

  // Phase 11
  assignmentExecutionDate?: Date;
  assignmentFee?: number;
  assigneeName?: string;
  phase11Details?: any;

  canDistribute: boolean;
  canExecuteAssignment: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

class OklahomaDealCompliance extends Model<OklahomaDealComplianceAttributes> implements OklahomaDealComplianceAttributes {
  public id!: number;
  public dealId!: number;
  public llcId!: number;

  public phase3Status?: 'GREEN' | 'YELLOW' | 'RED';
  public buyerMatchesLlc?: boolean;
  public sellerMatchesRecords?: boolean;
  public contractAssignable?: boolean;
  public asIsLanguage?: boolean;
  public contractNotExpired?: boolean;
  public phase3Details?: any;

  public phase4Status?: 'GREEN' | 'YELLOW' | 'RED';
  public disclosureNotLicensedBroker?: boolean;
  public disclosureActingPrincipal?: boolean;
  public disclosureEquitableInterest?: boolean;
  public disclosureIntentAssign?: boolean;
  public disclosureCompensation?: boolean;
  public disclosureDueDiligence?: boolean;
  public disclosureNoGuarantee?: boolean;
  public disclosureIndependentAdvice?: boolean;
  public phase4Details?: any;

  public overallComplianceStatus?: 'GREEN' | 'YELLOW' | 'RED';

  public contractAcceptanceDate?: Date;
  public cancellationDeliveryDate?: Date;
  public cancellationAcknowledged?: boolean;
  public timingValid?: boolean;
  public phase10Details?: any;

  public assignmentExecutionDate?: Date;
  public assignmentFee?: number;
  public assigneeName?: string;
  public phase11Details?: any;

  public canDistribute!: boolean;
  public canExecuteAssignment!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Calculate Phase 4 disclosure score
   */
  calculateDisclosureScore(): number {
    const disclosures = [
      this.disclosureNotLicensedBroker,
      this.disclosureActingPrincipal,
      this.disclosureEquitableInterest,
      this.disclosureIntentAssign,
      this.disclosureCompensation,
      this.disclosureDueDiligence,
      this.disclosureNoGuarantee,
      this.disclosureIndependentAdvice,
    ];

    return disclosures.filter(d => d === true).length;
  }

  /**
   * Update Phase 4 status based on disclosure score
   */
  updatePhase4Status(): void {
    const score = this.calculateDisclosureScore();

    if (score === 8) {
      this.phase4Status = 'GREEN';
    } else if (score >= 5) {
      this.phase4Status = 'YELLOW';
    } else {
      this.phase4Status = 'RED';
    }
  }

  /**
   * Update overall compliance status
   */
  updateOverallStatus(): void {
    if (this.phase3Status === 'RED' || this.phase4Status === 'RED') {
      this.overallComplianceStatus = 'RED';
      this.canDistribute = false;
    } else if (this.phase3Status === 'YELLOW' || this.phase4Status === 'YELLOW') {
      this.overallComplianceStatus = 'YELLOW';
      this.canDistribute = false;
    } else if (this.phase3Status === 'GREEN' && this.phase4Status === 'GREEN') {
      this.overallComplianceStatus = 'GREEN';
      this.canDistribute = true;
    }
  }

  /**
   * Validate Phase 10 timing
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
}

export function initOklahomaDealCompliance(sequelize: Sequelize): typeof OklahomaDealCompliance {
  OklahomaDealCompliance.init(
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
      llcId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'llc_id',
      },
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
      phase3Details: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'phase3_details',
      },
      phase4Status: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: 'phase4_status',
      },
      disclosureNotLicensedBroker: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'disclosure_not_licensed_broker',
      },
      disclosureActingPrincipal: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'disclosure_acting_principal',
      },
      disclosureEquitableInterest: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'disclosure_equitable_interest',
      },
      disclosureIntentAssign: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'disclosure_intent_assign',
      },
      disclosureCompensation: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'disclosure_compensation',
      },
      disclosureDueDiligence: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'disclosure_due_diligence',
      },
      disclosureNoGuarantee: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'disclosure_no_guarantee',
      },
      disclosureIndependentAdvice: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'disclosure_independent_advice',
      },
      phase4Details: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'phase4_details',
      },
      overallComplianceStatus: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: 'overall_compliance_status',
      },
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
      phase11Details: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'phase11_details',
      },
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
      tableName: 'oklahoma_deal_compliance',
      timestamps: true,
      underscored: true,
    }
  );

  return OklahomaDealCompliance;
}

export default OklahomaDealCompliance;
