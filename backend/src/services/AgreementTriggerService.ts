/**
 * Agreement Trigger Service
 *
 * Automatically triggers agreement creation (MSA, ASA) based on
 * compliance workflow phase completion and distribution channel selection.
 *
 * Now integrates with PhaseContractService to send actual DocuSeal contracts
 * instead of creating placeholder documents.
 */

import sequelize from '../config/database';
import { stateComplianceEngine } from './StateComplianceEngine';
import { phaseContractService, ContractSendResult } from './PhaseContractService';

export interface AgreementRequirement {
  agreementType: 'MSA' | 'ASA' | 'CSA';
  required: boolean;
  reason: string;
  triggered?: boolean;
  triggeredAt?: Date;
}

export interface AgreementTriggerResult {
  dealId: number;
  state: string;
  triggeredAgreements: string[];
  pendingAgreements: string[];
  errors: string[];
}

class AgreementTriggerService {
  /**
   * Check what agreements are required for a deal based on distribution channels
   */
  async checkAgreementRequirements(
    dealId: number,
    state: string
  ): Promise<AgreementRequirement[]> {
    await stateComplianceEngine.initialize();

    // Get compliance record to check distribution channels
    const [results] = await sequelize.query(
      `SELECT state_specific_data FROM state_deal_compliance
       WHERE deal_id = :dealId AND state = :state LIMIT 1`,
      { replacements: { dealId, state: state.toUpperCase() } }
    );

    const compliance = (results as any[])?.[0];
    const stateSpecificData = compliance?.state_specific_data || {};
    const distributionChannels: string[] = stateSpecificData.distributionChannels || [];

    const requirements: AgreementRequirement[] = [];

    // MSA is required for all distribution channels
    if (distributionChannels.length > 0) {
      requirements.push({
        agreementType: 'MSA',
        required: true,
        reason: 'Required for all distribution channels',
      });
    }

    // ASA is required if auction channel is selected
    if (distributionChannels.includes('auction')) {
      requirements.push({
        agreementType: 'ASA',
        required: true,
        reason: 'Required for auction distribution channel',
      });
    }

    // Check which agreements are already triggered/executed
    await this.checkExistingAgreements(dealId, requirements);

    return requirements;
  }

  /**
   * Check existing agreements for a deal
   */
  private async checkExistingAgreements(
    dealId: number,
    requirements: AgreementRequirement[]
  ): Promise<void> {
    // Check property_documents for agreements
    const [documents] = await sequelize.query(
      `SELECT category, document_type, status, created_at
       FROM property_documents
       WHERE property_id = :dealId
         AND category IN ('msa', 'asa', 'csa')`,
      { replacements: { dealId } }
    );

    const docs = documents as any[];

    for (const req of requirements) {
      const matchingDoc = docs.find(
        (d) =>
          d.category === req.agreementType.toLowerCase() ||
          d.document_type === req.agreementType.toLowerCase()
      );

      if (matchingDoc) {
        req.triggered = true;
        req.triggeredAt = matchingDoc.created_at;
      }
    }

    // Also check docuseal_submissions if the table exists
    try {
      const [submissions] = await sequelize.query(
        `SELECT document_type, status, created_at
         FROM docuseal_submissions
         WHERE property_id = :dealId
           AND document_type IN ('msa', 'asa', 'csa')`,
        { replacements: { dealId } }
      );

      const subs = submissions as any[];

      for (const req of requirements) {
        if (!req.triggered) {
          const matchingSub = subs.find(
            (s) => s.document_type === req.agreementType.toLowerCase()
          );

          if (matchingSub) {
            req.triggered = true;
            req.triggeredAt = matchingSub.created_at;
          }
        }
      }
    } catch {
      // docuseal_submissions table may not exist
    }
  }

  /**
   * Trigger MSA agreement for a deal via DocuSeal
   */
  async triggerMSA(dealId: number, state: string): Promise<{
    success: boolean;
    submissionId?: number;
    error?: string;
  }> {
    try {
      // Check if MSA already exists
      const requirements = await this.checkAgreementRequirements(dealId, state);
      const msaReq = requirements.find((r) => r.agreementType === 'MSA');

      if (msaReq?.triggered) {
        return { success: true, error: 'MSA already triggered' };
      }

      // Send MSA via PhaseContractService (Phase 7 is distribution agreements)
      const result = await phaseContractService.sendPhaseContract(
        dealId,
        state,
        7 // Phase 7: Distribution Agreements
      );

      if (result.success) {
        // Log the trigger event
        await this.logAgreementTrigger(dealId, 'MSA', 'sent');
        return { success: true, submissionId: result.submissionId };
      }

      // Fallback: Create placeholder if DocuSeal fails
      console.warn('DocuSeal send failed, creating placeholder:', result.error);
      const [fallbackResult] = await sequelize.query(
        `INSERT INTO property_documents
         (property_id, category, document_type, display_name, status, created_at, updated_at)
         VALUES (:dealId, 'msa', 'msa', 'Marketing Services Agreement', 'pending', NOW(), NOW())
         RETURNING id`,
        {
          replacements: { dealId },
          type: 'INSERT' as any,
        }
      );

      const docId = (fallbackResult as any)?.[0]?.id;
      await this.logAgreementTrigger(dealId, 'MSA', 'triggered_placeholder');

      return { success: true, submissionId: docId };
    } catch (error) {
      console.error('Error triggering MSA:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Trigger ASA agreement for a deal via DocuSeal
   */
  async triggerASA(dealId: number, state: string): Promise<{
    success: boolean;
    submissionId?: number;
    error?: string;
  }> {
    try {
      // Check if ASA already exists
      const requirements = await this.checkAgreementRequirements(dealId, state);
      const asaReq = requirements.find((r) => r.agreementType === 'ASA');

      if (!asaReq?.required) {
        return { success: false, error: 'ASA not required for this deal' };
      }

      if (asaReq?.triggered) {
        return { success: true, error: 'ASA already triggered' };
      }

      // Get ASA template specifically (look for category = 'asa')
      const StateDocumentTemplate = require('../models/StateDocumentTemplate').default;
      const asaTemplate = await StateDocumentTemplate.getPrimaryTemplate(state, 'asa');

      if (asaTemplate) {
        // Send ASA via PhaseContractService
        const result = await phaseContractService.sendPhaseContract(
          dealId,
          state,
          7, // Phase 7: Distribution Agreements
          asaTemplate.id
        );

        if (result.success) {
          await this.logAgreementTrigger(dealId, 'ASA', 'sent');
          return { success: true, submissionId: result.submissionId };
        }

        console.warn('DocuSeal send failed for ASA:', result.error);
      }

      // Fallback: Create placeholder if DocuSeal fails or no template
      const [fallbackResult] = await sequelize.query(
        `INSERT INTO property_documents
         (property_id, category, document_type, display_name, status, created_at, updated_at)
         VALUES (:dealId, 'asa', 'asa', 'Auction Services Agreement', 'pending', NOW(), NOW())
         RETURNING id`,
        {
          replacements: { dealId },
          type: 'INSERT' as any,
        }
      );

      const docId = (fallbackResult as any)?.[0]?.id;
      await this.logAgreementTrigger(dealId, 'ASA', 'triggered_placeholder');

      return { success: true, submissionId: docId };
    } catch (error) {
      console.error('Error triggering ASA:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Trigger all required agreements when Phase 6 is completed
   * This is the legacy method - prefer onPhaseComplete for new code
   */
  async onPhase6Complete(dealId: number, state: string): Promise<AgreementTriggerResult> {
    // Phase 6 completion triggers Phase 7 contracts (distribution agreements)
    return this.onPhaseComplete(dealId, state, 7);
  }

  /**
   * Generic phase completion handler - sends all required contracts for a phase
   */
  async onPhaseComplete(
    dealId: number,
    state: string,
    phase: number
  ): Promise<AgreementTriggerResult> {
    const result: AgreementTriggerResult = {
      dealId,
      state,
      triggeredAgreements: [],
      pendingAgreements: [],
      errors: [],
    };

    try {
      // Send all auto-send contracts for this phase
      const sendResults = await phaseContractService.sendAllPhaseContracts(
        dealId,
        state,
        phase,
        'phase_enter'
      );

      for (const sendResult of sendResults) {
        if (sendResult.success) {
          result.triggeredAgreements.push(sendResult.category);
        } else {
          result.errors.push(`${sendResult.category}: ${sendResult.error}`);
        }
      }

      // Also check legacy agreement requirements for backward compatibility
      if (phase === 7) {
        const requirements = await this.checkAgreementRequirements(dealId, state);
        for (const req of requirements) {
          if (req.triggered && !result.triggeredAgreements.includes(req.agreementType)) {
            result.pendingAgreements.push(req.agreementType);
          }
        }
      }
    } catch (error) {
      result.errors.push(`Phase ${phase}: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Send a specific contract for a phase manually
   */
  async sendContract(
    dealId: number,
    state: string,
    phase: number,
    templateId?: number
  ): Promise<ContractSendResult> {
    return phaseContractService.sendPhaseContract(dealId, state, phase, templateId);
  }

  /**
   * Check if all phase contracts are signed
   */
  async arePhaseContractsSigned(
    dealId: number,
    state: string,
    phase: number
  ): Promise<boolean> {
    return phaseContractService.arePhaseContractsSigned(dealId, state, phase);
  }

  /**
   * Get summary of agreement status for a deal
   */
  async getAgreementSummary(dealId: number, state: string): Promise<{
    requirements: AgreementRequirement[];
    allExecuted: boolean;
    pendingCount: number;
    executedCount: number;
  }> {
    const requirements = await this.checkAgreementRequirements(dealId, state);

    // Check execution status from documents
    const [documents] = await sequelize.query(
      `SELECT category, status
       FROM property_documents
       WHERE property_id = :dealId
         AND category IN ('msa', 'asa', 'csa')
         AND status IN ('executed', 'completed')`,
      { replacements: { dealId } }
    );

    const executedDocs = new Set(
      (documents as any[]).map((d) => d.category.toUpperCase())
    );

    let pendingCount = 0;
    let executedCount = 0;

    for (const req of requirements) {
      if (executedDocs.has(req.agreementType)) {
        executedCount++;
      } else if (req.required) {
        pendingCount++;
      }
    }

    return {
      requirements,
      allExecuted: pendingCount === 0 && requirements.length > 0,
      pendingCount,
      executedCount,
    };
  }

  /**
   * Log agreement trigger event for audit trail
   */
  private async logAgreementTrigger(
    dealId: number,
    agreementType: string,
    action: string
  ): Promise<void> {
    try {
      await sequelize.query(
        `INSERT INTO compliance_audit_log
         (property_id, action_type, action_details, created_at)
         VALUES (:dealId, :actionType, :details, NOW())`,
        {
          replacements: {
            dealId,
            actionType: `agreement.${agreementType.toLowerCase()}.${action}`,
            details: JSON.stringify({
              agreementType,
              action,
              triggeredAt: new Date().toISOString(),
            }),
          },
        }
      );
    } catch (error) {
      console.error('Error logging agreement trigger:', error);
    }
  }
}

export const agreementTriggerService = new AgreementTriggerService();
export default agreementTriggerService;
