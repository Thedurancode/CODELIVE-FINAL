/**
 * Deal Broker MSA Model
 *
 * Tracks the Master Service Agreement between Wholesaler, Broker, and DispoTree
 * for each deal. Includes fee structure, signature status, and document references.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type MSAStatus = 'draft' | 'pending_signatures' | 'active' | 'completed' | 'terminated' | 'expired';

export interface FeeStructure {
  brokerFee: number;
  tcFee: number;
  wholesalerAssignmentFee: number;
  currency: string;
}

export interface MSAClauses {
  brokerMarketingAuthority: boolean;
  aiAssistantAuthorization: boolean;
  brokerSupervision: boolean;
  feeDisclosure: boolean;
  recordkeeping: boolean;
  communicationRouting: boolean;
  stateSpecificClauses?: string[];
}

interface DealBrokerMSAAttributes {
  id: string;
  propertyId: number;
  dealId: string;
  wholesalerId: string;
  brokerId: string;
  status: MSAStatus;
  docuSealSubmissionId?: number;
  docuSealTemplateId?: number;
  msaDocumentUrl?: string;
  clauses: MSAClauses;
  feeStructure: FeeStructure;
  effectiveDate?: Date;
  expirationDate?: Date;
  signedByWholesaler: boolean;
  signedByWholesalerAt?: Date;
  wholesalerSignatureId?: string;
  signedByBroker: boolean;
  signedByBrokerAt?: Date;
  brokerSignatureId?: string;
  signedByDispotree: boolean;
  signedByDispotreeAt?: Date;
  dispotreeSignatureId?: string;
  terminatedAt?: Date;
  terminatedBy?: string;
  terminationReason?: string;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface DealBrokerMSACreationAttributes
  extends Optional<
    DealBrokerMSAAttributes,
    | 'id'
    | 'status'
    | 'docuSealSubmissionId'
    | 'docuSealTemplateId'
    | 'msaDocumentUrl'
    | 'effectiveDate'
    | 'expirationDate'
    | 'signedByWholesaler'
    | 'signedByWholesalerAt'
    | 'wholesalerSignatureId'
    | 'signedByBroker'
    | 'signedByBrokerAt'
    | 'brokerSignatureId'
    | 'signedByDispotree'
    | 'signedByDispotreeAt'
    | 'dispotreeSignatureId'
    | 'terminatedAt'
    | 'terminatedBy'
    | 'terminationReason'
    | 'notes'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class DealBrokerMSA
  extends Model<DealBrokerMSAAttributes, DealBrokerMSACreationAttributes>
  implements DealBrokerMSAAttributes
{
  declare id: string;
  declare propertyId: number;
  declare dealId: string;
  declare wholesalerId: string;
  declare brokerId: string;
  declare status: MSAStatus;
  declare docuSealSubmissionId: number | undefined;
  declare docuSealTemplateId: number | undefined;
  declare msaDocumentUrl: string | undefined;
  declare clauses: MSAClauses;
  declare feeStructure: FeeStructure;
  declare effectiveDate: Date | undefined;
  declare expirationDate: Date | undefined;
  declare signedByWholesaler: boolean;
  declare signedByWholesalerAt: Date | undefined;
  declare wholesalerSignatureId: string | undefined;
  declare signedByBroker: boolean;
  declare signedByBrokerAt: Date | undefined;
  declare brokerSignatureId: string | undefined;
  declare signedByDispotree: boolean;
  declare signedByDispotreeAt: Date | undefined;
  declare dispotreeSignatureId: string | undefined;
  declare terminatedAt: Date | undefined;
  declare terminatedBy: string | undefined;
  declare terminationReason: string | undefined;
  declare notes: string | undefined;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if MSA is fully signed by all parties
   */
  isFullySigned(): boolean {
    return this.signedByWholesaler && this.signedByBroker && this.signedByDispotree;
  }

  /**
   * Check if MSA is active and valid
   */
  isActive(): boolean {
    if (this.status !== 'active') return false;
    if (this.expirationDate && this.expirationDate < new Date()) return false;
    return true;
  }

  /**
   * Get total fees for the deal
   */
  getTotalFees(): number {
    return (
      this.feeStructure.brokerFee +
      this.feeStructure.tcFee +
      this.feeStructure.wholesalerAssignmentFee
    );
  }

  /**
   * Get pending signatures
   */
  getPendingSignatures(): string[] {
    const pending: string[] = [];
    if (!this.signedByWholesaler) pending.push('wholesaler');
    if (!this.signedByBroker) pending.push('broker');
    if (!this.signedByDispotree) pending.push('dispotree');
    return pending;
  }

  /**
   * Record a signature
   */
  async recordSignature(
    signerType: 'wholesaler' | 'broker' | 'dispotree',
    signatureId?: string
  ): Promise<void> {
    const now = new Date();

    switch (signerType) {
      case 'wholesaler':
        this.signedByWholesaler = true;
        this.signedByWholesalerAt = now;
        if (signatureId) this.wholesalerSignatureId = signatureId;
        break;
      case 'broker':
        this.signedByBroker = true;
        this.signedByBrokerAt = now;
        if (signatureId) this.brokerSignatureId = signatureId;
        break;
      case 'dispotree':
        this.signedByDispotree = true;
        this.signedByDispotreeAt = now;
        if (signatureId) this.dispotreeSignatureId = signatureId;
        break;
    }

    // If all signed, activate the MSA
    if (this.isFullySigned()) {
      this.status = 'active';
      this.effectiveDate = now;
      // Default expiration: 1 year from effective date
      const expiration = new Date(now);
      expiration.setFullYear(expiration.getFullYear() + 1);
      this.expirationDate = expiration;
    }

    await this.save();
  }

  /**
   * Terminate the MSA
   */
  async terminate(terminatedBy: string, reason: string): Promise<void> {
    this.status = 'terminated';
    this.terminatedAt = new Date();
    this.terminatedBy = terminatedBy;
    this.terminationReason = reason;
    await this.save();
  }

  /**
   * Get default fee structure
   */
  static getDefaultFeeStructure(): FeeStructure {
    return {
      brokerFee: 100,
      tcFee: 700,
      wholesalerAssignmentFee: 0,
      currency: 'USD',
    };
  }

  /**
   * Get default clauses
   */
  static getDefaultClauses(): MSAClauses {
    return {
      brokerMarketingAuthority: true,
      aiAssistantAuthorization: true,
      brokerSupervision: true,
      feeDisclosure: true,
      recordkeeping: true,
      communicationRouting: true,
    };
  }
}

DealBrokerMSA.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    wholesalerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    brokerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'broker_profiles',
        key: 'id',
      },
    },
    status: {
      type: DataTypes.ENUM('draft', 'pending_signatures', 'active', 'completed', 'terminated', 'expired'),
      defaultValue: 'draft',
    },
    docuSealSubmissionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    docuSealTemplateId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    msaDocumentUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    clauses: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: DealBrokerMSA.getDefaultClauses(),
    },
    feeStructure: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: DealBrokerMSA.getDefaultFeeStructure(),
    },
    effectiveDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expirationDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    signedByWholesaler: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    signedByWholesalerAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    wholesalerSignatureId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    signedByBroker: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    signedByBrokerAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    brokerSignatureId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    signedByDispotree: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    signedByDispotreeAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    dispotreeSignatureId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    terminatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    terminatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    terminationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
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
    tableName: 'deal_broker_msas',
    timestamps: true,
    indexes: [
      { fields: ['propertyId'] },
      { fields: ['dealId'] },
      { fields: ['wholesalerId'] },
      { fields: ['brokerId'] },
      { fields: ['status'] },
      { fields: ['docuSealSubmissionId'] },
      { fields: ['brokerId', 'status'] },
      { fields: ['wholesalerId', 'status'] },
    ],
  }
);

export default DealBrokerMSA;
