/**
 * Broker MSA Service
 *
 * Handles Master Service Agreement generation, signing, and fee tracking.
 * Integrates with DocuSeal for e-signatures.
 */

import DealBrokerMSA, {
  FeeStructure,
  MSAClauses,
  MSAStatus,
} from '../models/DealBrokerMSA';
import DealFeeTracking, { FeeStatus } from '../models/DealFeeTracking';
import BrokerProfile from '../models/BrokerProfile';
import MarketplaceUser from '../models/MarketplaceUser';
import Property from '../models/Property';
import { docuSealService, DocuSealSubmitter } from './DocuSealService';
import { brokerService } from './BrokerService';

export interface MSAGenerationOptions {
  propertyId: number;
  dealId: string;
  wholesalerId: string;
  brokerId?: string; // If not provided, auto-assign
  feeStructure?: Partial<FeeStructure>;
  clauses?: Partial<MSAClauses>;
}

export interface MSASignatureRequest {
  msaId: string;
  sendEmail?: boolean;
  expireInDays?: number;
}

export interface MSAWithDetails extends DealBrokerMSA {
  property?: Property;
  broker?: BrokerProfile;
  wholesaler?: MarketplaceUser;
  fees?: DealFeeTracking[];
}

class BrokerMSAService {
  private initialized = false;
  private msaTemplateId: number | null = null;

  async initialize(): Promise<void> {
    // Get MSA template ID from env or discover it
    const templateIdStr = process.env.MSA_TEMPLATE_ID;
    if (templateIdStr) {
      this.msaTemplateId = parseInt(templateIdStr, 10);
    }
    this.initialized = true;
    console.log('BrokerMSAService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Format property address as a string
   */
  private formatPropertyAddress(property: Property | null): string {
    if (!property) return '';
    const address = property.address;
    if (typeof address === 'string') return address;
    if (address && typeof address === 'object') {
      const parts = [
        address.houseNumber,
        address.street,
        address.address2,
      ].filter(Boolean);
      return `${parts.join(' ')}, ${property.city}, ${property.state} ${property.zip}`;
    }
    return '';
  }

  /**
   * Generate a new MSA for a deal
   */
  async generateMSA(options: MSAGenerationOptions): Promise<DealBrokerMSA> {
    // Get the property
    const property = await Property.findByPk(options.propertyId);
    if (!property) {
      throw new Error('Property not found');
    }

    // Get the wholesaler
    const wholesaler = await MarketplaceUser.findByPk(options.wholesalerId);
    if (!wholesaler) {
      throw new Error('Wholesaler not found');
    }

    // Get or assign broker
    let brokerId = options.brokerId;
    if (!brokerId) {
      // Auto-assign based on property state
      const state = property.getDataValue('state') || 'TX';
      const assignment = await brokerService.getAvailableBroker(state);
      if (!assignment.success || !assignment.brokerId) {
        throw new Error(assignment.message);
      }
      brokerId = assignment.brokerId;
    }

    // Verify broker exists and is active
    const broker = await BrokerProfile.findByPk(brokerId);
    if (!broker) {
      throw new Error('Broker not found');
    }
    if (!broker.isActive()) {
      throw new Error('Broker is not active');
    }

    // Build fee structure
    const feeStructure: FeeStructure = {
      ...DealBrokerMSA.getDefaultFeeStructure(),
      ...options.feeStructure,
    };

    // Build clauses
    const clauses: MSAClauses = {
      ...DealBrokerMSA.getDefaultClauses(),
      ...options.clauses,
    };

    // Create the MSA
    const msa = await DealBrokerMSA.create({
      propertyId: options.propertyId,
      dealId: options.dealId,
      wholesalerId: options.wholesalerId,
      brokerId,
      status: 'draft',
      feeStructure,
      clauses,
    });

    // Create fee tracking records
    await this.createFeeRecords(msa, broker);

    // Increment broker's active deals
    await brokerService.assignBrokerToDeal(brokerId);

    return msa;
  }

  /**
   * Create fee tracking records for an MSA
   */
  private async createFeeRecords(
    msa: DealBrokerMSA,
    broker: BrokerProfile
  ): Promise<void> {
    const brokerUser = await MarketplaceUser.findByPk(broker.userId);

    // Create broker fee record
    await DealFeeTracking.createBrokerFee(
      msa.dealId,
      msa.id,
      msa.propertyId,
      broker.id,
      brokerUser?.name,
      brokerUser?.email,
      msa.feeStructure.brokerFee
    );

    // Create TC fee record
    await DealFeeTracking.createTCFee(
      msa.dealId,
      msa.id,
      msa.propertyId,
      msa.feeStructure.tcFee
    );

    // Create wholesaler assignment fee record if > 0
    if (msa.feeStructure.wholesalerAssignmentFee > 0) {
      const wholesaler = await MarketplaceUser.findByPk(msa.wholesalerId);
      await DealFeeTracking.createAssignmentFee(
        msa.dealId,
        msa.id,
        msa.propertyId,
        msa.wholesalerId,
        wholesaler?.name,
        msa.feeStructure.wholesalerAssignmentFee
      );
    }
  }

  /**
   * Send MSA for e-signatures via DocuSeal
   */
  async sendForSignature(request: MSASignatureRequest): Promise<DealBrokerMSA> {
    if (!docuSealService.isReady()) {
      throw new Error('DocuSeal service not available');
    }

    if (!this.msaTemplateId) {
      throw new Error('MSA template not configured');
    }

    const msa = await this.getMSAWithDetails(request.msaId);
    if (!msa) {
      throw new Error('MSA not found');
    }

    if (msa.status !== 'draft') {
      throw new Error(`Cannot send MSA with status: ${msa.status}`);
    }

    // Get all parties
    const wholesaler = await MarketplaceUser.findByPk(msa.wholesalerId);
    const broker = await BrokerProfile.findByPk(msa.brokerId);
    const brokerUser = broker
      ? await MarketplaceUser.findByPk(broker.userId)
      : null;
    const property = await Property.findByPk(msa.propertyId);

    if (!wholesaler || !brokerUser || !property) {
      throw new Error('Missing required party information');
    }

    // Build submitters for DocuSeal
    const submitters: DocuSealSubmitter[] = [
      {
        email: wholesaler.email,
        name: wholesaler.name,
        role: 'Wholesaler',
        send_email: request.sendEmail ?? true,
        fields: [
          { name: 'wholesaler_name', default_value: wholesaler.name },
          { name: 'wholesaler_company', default_value: wholesaler.company || '' },
          {
            name: 'property_address',
            default_value: this.formatPropertyAddress(property),
          },
          {
            name: 'broker_fee',
            default_value: msa.feeStructure.brokerFee.toString(),
          },
          { name: 'tc_fee', default_value: msa.feeStructure.tcFee.toString() },
          {
            name: 'assignment_fee',
            default_value: msa.feeStructure.wholesalerAssignmentFee.toString(),
          },
        ],
        metadata: { msaId: msa.id, role: 'wholesaler' },
      },
      {
        email: brokerUser.email,
        name: brokerUser.name,
        role: 'Broker',
        send_email: request.sendEmail ?? true,
        fields: [
          { name: 'broker_name', default_value: brokerUser.name },
          { name: 'broker_license', default_value: broker!.licenseNumber },
          { name: 'brokerage_company', default_value: broker!.brokerageCompany },
        ],
        metadata: { msaId: msa.id, role: 'broker' },
      },
      {
        email: process.env.DISPOTREE_SIGNING_EMAIL || 'contracts@dispotree.com',
        name: 'DispoTree',
        role: 'DispoTree',
        send_email: request.sendEmail ?? true,
        fields: [],
        metadata: { msaId: msa.id, role: 'dispotree' },
      },
    ];

    // Calculate expiration
    const expireAt = request.expireInDays
      ? new Date(Date.now() + request.expireInDays * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 7 days

    // Create DocuSeal submission
    const submission = await docuSealService.createSubmission({
      templateId: this.msaTemplateId,
      submitters,
      sendEmail: request.sendEmail ?? true,
      expireAt,
      metadata: {
        msaId: msa.id,
        dealId: msa.dealId,
        propertyId: msa.propertyId,
      },
    });

    // Update MSA with DocuSeal submission info
    await msa.update({
      status: 'pending_signatures',
      docuSealSubmissionId: submission.id,
      docuSealTemplateId: this.msaTemplateId,
    });

    return msa;
  }

  /**
   * Handle DocuSeal webhook for signature events
   */
  async handleSignatureWebhook(
    submissionId: number,
    signerEmail: string,
    event: 'completed' | 'declined'
  ): Promise<DealBrokerMSA | null> {
    // Find MSA by DocuSeal submission ID
    const msa = await DealBrokerMSA.findOne({
      where: { docuSealSubmissionId: submissionId },
    });

    if (!msa) {
      console.warn(`No MSA found for submission ${submissionId}`);
      return null;
    }

    if (event === 'declined') {
      await msa.update({ status: 'terminated' });
      return msa;
    }

    // Determine which party signed based on email
    const wholesaler = await MarketplaceUser.findByPk(msa.wholesalerId);
    const broker = await BrokerProfile.findByPk(msa.brokerId);
    const brokerUser = broker
      ? await MarketplaceUser.findByPk(broker.userId)
      : null;
    const dispotreeEmail =
      process.env.DISPOTREE_SIGNING_EMAIL || 'contracts@dispotree.com';

    if (wholesaler && signerEmail === wholesaler.email) {
      await msa.recordSignature('wholesaler');
    } else if (brokerUser && signerEmail === brokerUser.email) {
      await msa.recordSignature('broker');
    } else if (signerEmail === dispotreeEmail) {
      await msa.recordSignature('dispotree');
    }

    return msa;
  }

  /**
   * Get MSA by ID with all details
   */
  async getMSAWithDetails(msaId: string): Promise<MSAWithDetails | null> {
    const msa = await DealBrokerMSA.findByPk(msaId, {
      include: [
        { model: Property, as: 'property' },
        { model: BrokerProfile, as: 'broker' },
        { model: MarketplaceUser, as: 'wholesaler' },
        { model: DealFeeTracking, as: 'fees' },
      ],
    });
    return msa as MSAWithDetails | null;
  }

  /**
   * Get MSA by deal ID
   */
  async getMSAByDealId(dealId: string): Promise<DealBrokerMSA | null> {
    return DealBrokerMSA.findOne({
      where: { dealId },
      include: [
        { model: Property, as: 'property' },
        { model: BrokerProfile, as: 'broker' },
        { model: DealFeeTracking, as: 'fees' },
      ],
    });
  }

  /**
   * Get MSA signature status
   */
  async getSignatureStatus(msaId: string): Promise<{
    status: MSAStatus;
    pendingSignatures: string[];
    signatures: {
      wholesaler: { signed: boolean; signedAt?: Date };
      broker: { signed: boolean; signedAt?: Date };
      dispotree: { signed: boolean; signedAt?: Date };
    };
  }> {
    const msa = await DealBrokerMSA.findByPk(msaId);
    if (!msa) {
      throw new Error('MSA not found');
    }

    return {
      status: msa.status,
      pendingSignatures: msa.getPendingSignatures(),
      signatures: {
        wholesaler: {
          signed: msa.signedByWholesaler,
          signedAt: msa.signedByWholesalerAt,
        },
        broker: {
          signed: msa.signedByBroker,
          signedAt: msa.signedByBrokerAt,
        },
        dispotree: {
          signed: msa.signedByDispotree,
          signedAt: msa.signedByDispotreeAt,
        },
      },
    };
  }

  /**
   * Get fees for an MSA
   */
  async getMSAFees(msaId: string): Promise<DealFeeTracking[]> {
    return DealFeeTracking.findAll({
      where: { msaId },
      order: [['feeType', 'ASC']],
    });
  }

  /**
   * Update fee status
   */
  async updateFeeStatus(
    feeId: string,
    status: FeeStatus,
    details?: {
      closingDate?: Date;
      invoiceNumber?: string;
      collectedAmount?: number;
      collectionMethod?: string;
      collectionReference?: string;
      waivedBy?: string;
      waiverReason?: string;
    }
  ): Promise<DealFeeTracking> {
    const fee = await DealFeeTracking.findByPk(feeId);
    if (!fee) {
      throw new Error('Fee not found');
    }

    switch (status) {
      case 'due_at_closing':
        if (details?.closingDate) {
          await fee.markDueAtClosing(details.closingDate);
        } else {
          throw new Error('Closing date required');
        }
        break;

      case 'invoiced':
        if (details?.invoiceNumber) {
          await fee.markInvoiced(details.invoiceNumber);
        } else {
          throw new Error('Invoice number required');
        }
        break;

      case 'collected':
        if (details?.collectedAmount && details?.collectionMethod) {
          await fee.markCollected(
            details.collectedAmount,
            details.collectionMethod,
            details.collectionReference
          );
        } else {
          throw new Error('Collection amount and method required');
        }
        break;

      case 'waived':
        if (details?.waivedBy && details?.waiverReason) {
          await fee.waive(details.waivedBy, details.waiverReason);
        } else {
          throw new Error('Waiver information required');
        }
        break;

      default:
        await fee.update({ status });
    }

    return fee;
  }

  /**
   * Mark all MSA fees as due at closing
   */
  async markFeesDueAtClosing(
    msaId: string,
    closingDate: Date
  ): Promise<DealFeeTracking[]> {
    const fees = await this.getMSAFees(msaId);

    for (const fee of fees) {
      if (fee.status === 'pending') {
        await fee.markDueAtClosing(closingDate);
      }
    }

    return fees;
  }

  /**
   * Get fee summary for closing statement
   */
  async getFeesSummaryForClosing(msaId: string): Promise<{
    brokerFee: { amount: number; status: FeeStatus; recipient: string };
    tcFee: { amount: number; status: FeeStatus; recipient: string };
    assignmentFee?: { amount: number; status: FeeStatus; recipient: string };
    totalFees: number;
    pendingFees: number;
  }> {
    const fees = await this.getMSAFees(msaId);

    const brokerFee = fees.find((f) => f.feeType === 'broker');
    const tcFee = fees.find((f) => f.feeType === 'tc');
    const assignmentFee = fees.find((f) => f.feeType === 'wholesaler_assignment');

    const totalFees = fees.reduce((sum, f) => sum + f.amount, 0);
    const pendingFees = await DealFeeTracking.getTotalPendingFees(
      fees[0]?.dealId || ''
    );

    return {
      brokerFee: {
        amount: brokerFee?.amount || 0,
        status: brokerFee?.status || 'pending',
        recipient: brokerFee?.recipientName || 'Broker',
      },
      tcFee: {
        amount: tcFee?.amount || 0,
        status: tcFee?.status || 'pending',
        recipient: 'DispoTree',
      },
      ...(assignmentFee && {
        assignmentFee: {
          amount: assignmentFee.amount,
          status: assignmentFee.status,
          recipient: assignmentFee.recipientName || 'Wholesaler',
        },
      }),
      totalFees,
      pendingFees,
    };
  }

  /**
   * Get MSAs for a broker
   */
  async getMSAsForBroker(
    brokerId: string,
    status?: MSAStatus[]
  ): Promise<DealBrokerMSA[]> {
    const where: any = { brokerId };
    if (status && status.length > 0) {
      where.status = status;
    }

    return DealBrokerMSA.findAll({
      where,
      include: [
        { model: Property, as: 'property' },
        { model: MarketplaceUser, as: 'wholesaler' },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get MSAs for a wholesaler
   */
  async getMSAsForWholesaler(
    wholesalerId: string,
    status?: MSAStatus[]
  ): Promise<DealBrokerMSA[]> {
    const where: any = { wholesalerId };
    if (status && status.length > 0) {
      where.status = status;
    }

    return DealBrokerMSA.findAll({
      where,
      include: [
        { model: Property, as: 'property' },
        { model: BrokerProfile, as: 'broker' },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Terminate an MSA
   */
  async terminateMSA(
    msaId: string,
    terminatedBy: string,
    reason: string
  ): Promise<DealBrokerMSA> {
    const msa = await DealBrokerMSA.findByPk(msaId);
    if (!msa) {
      throw new Error('MSA not found');
    }

    await msa.terminate(terminatedBy, reason);

    // Decrement broker's active deals
    await brokerService.completeDeal(msa.brokerId);

    return msa;
  }

  /**
   * Complete an MSA (deal closed)
   */
  async completeMSA(msaId: string): Promise<DealBrokerMSA> {
    const msa = await DealBrokerMSA.findByPk(msaId);
    if (!msa) {
      throw new Error('MSA not found');
    }

    if (msa.status !== 'active') {
      throw new Error(`Cannot complete MSA with status: ${msa.status}`);
    }

    await msa.update({ status: 'completed' });

    // Decrement broker's active deals
    await brokerService.completeDeal(msa.brokerId);

    return msa;
  }

  /**
   * Update MSA fee structure
   */
  async updateFeeStructure(
    msaId: string,
    feeStructure: Partial<FeeStructure>
  ): Promise<DealBrokerMSA> {
    const msa = await DealBrokerMSA.findByPk(msaId);
    if (!msa) {
      throw new Error('MSA not found');
    }

    if (msa.status !== 'draft') {
      throw new Error('Can only update fee structure for draft MSAs');
    }

    const updatedFeeStructure = {
      ...msa.feeStructure,
      ...feeStructure,
    };

    await msa.update({ feeStructure: updatedFeeStructure });

    // Update fee tracking records
    const fees = await this.getMSAFees(msaId);
    for (const fee of fees) {
      if (fee.feeType === 'broker' && feeStructure.brokerFee !== undefined) {
        await fee.update({ amount: feeStructure.brokerFee });
      }
      if (fee.feeType === 'tc' && feeStructure.tcFee !== undefined) {
        await fee.update({ amount: feeStructure.tcFee });
      }
      if (
        fee.feeType === 'wholesaler_assignment' &&
        feeStructure.wholesalerAssignmentFee !== undefined
      ) {
        await fee.update({ amount: feeStructure.wholesalerAssignmentFee });
      }
    }

    return msa;
  }
}

export const brokerMSAService = new BrokerMSAService();
export default brokerMSAService;
