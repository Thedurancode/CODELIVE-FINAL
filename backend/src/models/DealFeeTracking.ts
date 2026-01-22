/**
 * Deal Fee Tracking Model
 *
 * Tracks all fees associated with a deal for closing statement integration.
 * Includes broker fees, TC fees, and wholesaler assignment fees.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type FeeType = 'broker' | 'tc' | 'wholesaler_assignment';
export type RecipientType = 'broker' | 'dispotree' | 'wholesaler';
export type FeeStatus = 'pending' | 'due_at_closing' | 'invoiced' | 'collected' | 'waived' | 'refunded';

interface DealFeeTrackingAttributes {
  id: string;
  dealId: string;
  msaId: string;
  propertyId: number;
  feeType: FeeType;
  feeName: string;
  description?: string;
  amount: number;
  currency: string;
  recipientType: RecipientType;
  recipientId: string;
  recipientName?: string;
  recipientEmail?: string;
  status: FeeStatus;
  // Closing details
  closingDate?: Date;
  closingStatementRef?: string;
  // Collection tracking
  invoicedAt?: Date;
  invoiceNumber?: string;
  collectedAt?: Date;
  collectedAmount?: number;
  collectionMethod?: string;
  collectionReference?: string;
  // Waiver/Refund
  waivedAt?: Date;
  waivedBy?: string;
  waiverReason?: string;
  refundedAt?: Date;
  refundedBy?: string;
  refundAmount?: number;
  refundReason?: string;
  // Notes
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface DealFeeTrackingCreationAttributes
  extends Optional<
    DealFeeTrackingAttributes,
    | 'id'
    | 'description'
    | 'currency'
    | 'recipientName'
    | 'recipientEmail'
    | 'status'
    | 'closingDate'
    | 'closingStatementRef'
    | 'invoicedAt'
    | 'invoiceNumber'
    | 'collectedAt'
    | 'collectedAmount'
    | 'collectionMethod'
    | 'collectionReference'
    | 'waivedAt'
    | 'waivedBy'
    | 'waiverReason'
    | 'refundedAt'
    | 'refundedBy'
    | 'refundAmount'
    | 'refundReason'
    | 'notes'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class DealFeeTracking
  extends Model<DealFeeTrackingAttributes, DealFeeTrackingCreationAttributes>
  implements DealFeeTrackingAttributes
{
  declare id: string;
  declare dealId: string;
  declare msaId: string;
  declare propertyId: number;
  declare feeType: FeeType;
  declare feeName: string;
  declare description: string | undefined;
  declare amount: number;
  declare currency: string;
  declare recipientType: RecipientType;
  declare recipientId: string;
  declare recipientName: string | undefined;
  declare recipientEmail: string | undefined;
  declare status: FeeStatus;
  declare closingDate: Date | undefined;
  declare closingStatementRef: string | undefined;
  declare invoicedAt: Date | undefined;
  declare invoiceNumber: string | undefined;
  declare collectedAt: Date | undefined;
  declare collectedAmount: number | undefined;
  declare collectionMethod: string | undefined;
  declare collectionReference: string | undefined;
  declare waivedAt: Date | undefined;
  declare waivedBy: string | undefined;
  declare waiverReason: string | undefined;
  declare refundedAt: Date | undefined;
  declare refundedBy: string | undefined;
  declare refundAmount: number | undefined;
  declare refundReason: string | undefined;
  declare notes: string | undefined;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Mark fee as due at closing
   */
  async markDueAtClosing(closingDate: Date): Promise<void> {
    this.status = 'due_at_closing';
    this.closingDate = closingDate;
    await this.save();
  }

  /**
   * Mark fee as invoiced
   */
  async markInvoiced(invoiceNumber: string): Promise<void> {
    this.status = 'invoiced';
    this.invoicedAt = new Date();
    this.invoiceNumber = invoiceNumber;
    await this.save();
  }

  /**
   * Mark fee as collected
   */
  async markCollected(
    amount: number,
    method: string,
    reference?: string
  ): Promise<void> {
    this.status = 'collected';
    this.collectedAt = new Date();
    this.collectedAmount = amount;
    this.collectionMethod = method;
    if (reference) this.collectionReference = reference;
    await this.save();
  }

  /**
   * Waive the fee
   */
  async waive(waivedBy: string, reason: string): Promise<void> {
    this.status = 'waived';
    this.waivedAt = new Date();
    this.waivedBy = waivedBy;
    this.waiverReason = reason;
    await this.save();
  }

  /**
   * Process a refund
   */
  async refund(refundedBy: string, amount: number, reason: string): Promise<void> {
    this.status = 'refunded';
    this.refundedAt = new Date();
    this.refundedBy = refundedBy;
    this.refundAmount = amount;
    this.refundReason = reason;
    await this.save();
  }

  /**
   * Check if fee is still pending collection
   */
  isPending(): boolean {
    return ['pending', 'due_at_closing', 'invoiced'].includes(this.status);
  }

  /**
   * Get fee summary
   */
  getSummary(): {
    type: string;
    name: string;
    amount: string;
    status: string;
    recipient: string;
  } {
    return {
      type: this.feeType,
      name: this.feeName,
      amount: `${this.currency} ${this.amount.toFixed(2)}`,
      status: this.status,
      recipient: this.recipientName || this.recipientId,
    };
  }

  /**
   * Create broker fee record
   */
  static async createBrokerFee(
    dealId: string,
    msaId: string,
    propertyId: number,
    brokerId: string,
    brokerName?: string,
    brokerEmail?: string,
    amount: number = 100
  ): Promise<DealFeeTracking> {
    return DealFeeTracking.create({
      dealId,
      msaId,
      propertyId,
      feeType: 'broker',
      feeName: 'Broker Supervision Fee',
      description: 'Fee for broker supervision and compliance oversight',
      amount,
      recipientType: 'broker',
      recipientId: brokerId,
      recipientName: brokerName,
      recipientEmail: brokerEmail,
    });
  }

  /**
   * Create TC fee record
   */
  static async createTCFee(
    dealId: string,
    msaId: string,
    propertyId: number,
    amount: number = 700
  ): Promise<DealFeeTracking> {
    return DealFeeTracking.create({
      dealId,
      msaId,
      propertyId,
      feeType: 'tc',
      feeName: 'Transaction Coordination Fee',
      description: 'DispoTree transaction coordination and platform fee',
      amount,
      recipientType: 'dispotree',
      recipientId: 'dispotree',
      recipientName: 'DispoTree',
    });
  }

  /**
   * Create wholesaler assignment fee record
   */
  static async createAssignmentFee(
    dealId: string,
    msaId: string,
    propertyId: number,
    wholesalerId: string,
    wholesalerName?: string,
    amount: number = 0
  ): Promise<DealFeeTracking> {
    return DealFeeTracking.create({
      dealId,
      msaId,
      propertyId,
      feeType: 'wholesaler_assignment',
      feeName: 'Assignment Fee',
      description: 'Wholesaler assignment/assignment fee disclosed to parties',
      amount,
      recipientType: 'wholesaler',
      recipientId: wholesalerId,
      recipientName: wholesalerName,
    });
  }

  /**
   * Get all fees for a deal
   */
  static async getFeesForDeal(dealId: string): Promise<DealFeeTracking[]> {
    return DealFeeTracking.findAll({
      where: { dealId },
      order: [['feeType', 'ASC']],
    });
  }

  /**
   * Get total pending fees for a deal
   */
  static async getTotalPendingFees(dealId: string): Promise<number> {
    const fees = await DealFeeTracking.findAll({
      where: {
        dealId,
        status: ['pending', 'due_at_closing', 'invoiced'],
      },
    });
    return fees.reduce((sum, fee) => sum + fee.amount, 0);
  }

  /**
   * Get fees by recipient
   */
  static async getFeesByRecipient(
    recipientId: string,
    status?: FeeStatus[]
  ): Promise<DealFeeTracking[]> {
    const where: any = { recipientId };
    if (status && status.length > 0) {
      where.status = status;
    }
    return DealFeeTracking.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
  }
}

DealFeeTracking.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    msaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'deal_broker_msas',
        key: 'id',
      },
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
    },
    feeType: {
      type: DataTypes.ENUM('broker', 'tc', 'wholesaler_assignment'),
      allowNull: false,
    },
    feeName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'USD',
    },
    recipientType: {
      type: DataTypes.ENUM('broker', 'dispotree', 'wholesaler'),
      allowNull: false,
    },
    recipientId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    recipientName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    recipientEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'due_at_closing', 'invoiced', 'collected', 'waived', 'refunded'),
      defaultValue: 'pending',
    },
    closingDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    closingStatementRef: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    invoicedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    collectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    collectedAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    collectionMethod: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    collectionReference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    waivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    waivedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    waiverReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    refundedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    refundedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    refundAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    refundReason: {
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
    tableName: 'deal_fee_tracking',
    timestamps: true,
    indexes: [
      { fields: ['dealId'] },
      { fields: ['msaId'] },
      { fields: ['propertyId'] },
      { fields: ['feeType'] },
      { fields: ['recipientId'] },
      { fields: ['status'] },
      { fields: ['closingDate'] },
      { fields: ['dealId', 'feeType'] },
      { fields: ['recipientId', 'status'] },
    ],
  }
);

export default DealFeeTracking;
