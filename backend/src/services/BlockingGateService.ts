/**
 * Blocking Gate Service
 *
 * Evaluates blocking gates for state compliance workflows.
 * Gates prevent phase advancement until conditions are met.
 */

import { stateComplianceEngine } from './StateComplianceEngine';
import sequelize from '../config/database';

export interface GateEvaluationContext {
  dealId: number;
  state: string;
  currentPhase: number;
  targetPhase: number;
  // Compliance data
  compliance?: any;
  workflow?: any;
  // Additional context
  llcProfile?: any;
  documents?: any[];
  agreements?: any[];
  brokerReview?: any;
}

export interface GateEvaluationResult {
  gateId: string;
  gateName: string;
  passed: boolean;
  blocked: boolean;
  errorMessage?: string;
  missingRequirements: string[];
  phase: number;
  blocksPhase: number;
}

export interface GateStatusSummary {
  dealId: number;
  state: string;
  currentPhase: number;
  canAdvanceTo: number;
  blockedAtGate?: string;
  blockedReason?: string;
  gates: GateEvaluationResult[];
  allGatesPassed: boolean;
}

class BlockingGateService {
  /**
   * Evaluate all gates for a deal and determine what phase can be advanced to
   */
  async evaluateAllGates(dealId: number, state: string): Promise<GateStatusSummary> {
    await stateComplianceEngine.initialize();

    // Get compliance and workflow data
    const context = await this.buildContext(dealId, state);
    const gates = stateComplianceEngine.getBlockingGates(state);

    const results: GateEvaluationResult[] = [];
    let canAdvanceTo = 11; // Max phase
    let blockedAtGate: string | undefined;
    let blockedReason: string | undefined;

    for (const gate of gates) {
      const result = await this.evaluateGate(gate, context);
      results.push(result);

      // If gate blocks and we haven't passed it, record the block
      if (result.blocked && !result.passed) {
        if (gate.blocksPhase < canAdvanceTo) {
          canAdvanceTo = gate.blocksPhase - 1;
          blockedAtGate = gate.gateId;
          blockedReason = result.errorMessage;
        }
      }
    }

    return {
      dealId,
      state,
      currentPhase: context.workflow?.current_phase || 0,
      canAdvanceTo: Math.max(0, canAdvanceTo),
      blockedAtGate,
      blockedReason,
      gates: results,
      allGatesPassed: results.every((r) => r.passed),
    };
  }

  /**
   * Check if a specific phase can be entered
   */
  async canEnterPhase(dealId: number, state: string, targetPhase: number): Promise<{
    allowed: boolean;
    blockedBy?: string;
    reason?: string;
    missingRequirements: string[];
  }> {
    const summary = await this.evaluateAllGates(dealId, state);

    // Find any gate that blocks this phase
    const blockingGate = summary.gates.find(
      (g) => g.blocksPhase === targetPhase && !g.passed
    );

    if (blockingGate) {
      return {
        allowed: false,
        blockedBy: blockingGate.gateId,
        reason: blockingGate.errorMessage,
        missingRequirements: blockingGate.missingRequirements,
      };
    }

    // Also check if we're trying to skip phases
    if (targetPhase > summary.currentPhase + 1) {
      // Find any gates between current and target
      for (let p = summary.currentPhase + 1; p < targetPhase; p++) {
        const gateForPhase = summary.gates.find((g) => g.blocksPhase === p && !g.passed);
        if (gateForPhase) {
          return {
            allowed: false,
            blockedBy: gateForPhase.gateId,
            reason: `Must complete phase ${p - 1} first: ${gateForPhase.errorMessage}`,
            missingRequirements: gateForPhase.missingRequirements,
          };
        }
      }
    }

    return {
      allowed: true,
      missingRequirements: [],
    };
  }

  /**
   * Evaluate a single gate
   */
  private async evaluateGate(
    gate: any,
    context: GateEvaluationContext
  ): Promise<GateEvaluationResult> {
    const missingRequirements: string[] = [];
    let passed = false;

    switch (gate.gateId) {
      case 'OK-GATE-1':
        passed = this.evaluateLLCGate(context, missingRequirements);
        break;

      case 'OK-GATE-2':
        passed = this.evaluatePhase3Gate(context, missingRequirements);
        break;

      case 'OK-GATE-3':
        passed = this.evaluateComplianceStatusGate(context, missingRequirements);
        break;

      case 'OK-GATE-4':
        passed = this.evaluateDistributionAgreementsGate(context, missingRequirements);
        break;

      case 'OK-GATE-5':
        passed = this.evaluateBrokerReviewGate(context, missingRequirements);
        break;

      case 'OK-GATE-6':
        passed = this.evaluateTimingGate(context, missingRequirements);
        break;

      default:
        // Unknown gate - check if phase is already complete
        passed = (context.workflow?.phase_completions?.[gate.phase] === true);
    }

    return {
      gateId: gate.gateId,
      gateName: gate.name,
      passed,
      blocked: !passed,
      errorMessage: passed ? undefined : gate.errorMessage,
      missingRequirements,
      phase: gate.phase,
      blocksPhase: gate.blocksPhase,
    };
  }

  /**
   * OK-GATE-1: LLC Hard Gate
   * Blocks Phase 2 until LLC setup is complete
   */
  private evaluateLLCGate(context: GateEvaluationContext, missing: string[]): boolean {
    const { llcProfile, documents, agreements } = context;

    // Check LLC profile exists and is complete
    if (!llcProfile) {
      missing.push('LLC profile not found');
      return false;
    }

    if (!llcProfile.legal_name) missing.push('LLC legal name required');
    if (!llcProfile.ein) missing.push('LLC EIN required');
    if (!llcProfile.state_of_formation) missing.push('LLC state of formation required');

    // Check for required documents (uploaded docs)
    const hasArticles = documents?.some(
      (d: any) => d.document_type === 'llc_articles' || d.category === 'articles'
    );
    const hasOperatingAgreement = documents?.some(
      (d: any) => d.document_type === 'llc_operating_agreement' || d.category === 'operating_agreement'
    );

    // CSA can be in documents OR signed via DocuSeal
    const hasCSADoc = documents?.some(
      (d: any) => d.document_type === 'csa' || d.category === 'csa'
    );
    // Check DocuSeal for signed CSA (status = 'completed')
    const hasCSASigned = agreements?.some(
      (a: any) =>
        (a.document_type === 'csa' || a.category === 'csa') &&
        a.status === 'completed'
    );
    const hasCSA = hasCSADoc || hasCSASigned;

    if (!hasArticles) missing.push('Articles of Organization not uploaded');
    if (!hasOperatingAgreement) missing.push('Operating Agreement not uploaded');
    if (!hasCSA) {
      // Check if CSA is pending signature
      const csaPending = agreements?.some(
        (a: any) =>
          (a.document_type === 'csa' || a.category === 'csa') &&
          (a.status === 'sent' || a.status === 'pending' || a.status === 'viewed')
      );
      if (csaPending) {
        missing.push('CSA sent but awaiting signature');
      } else {
        missing.push('CSA not sent');
      }
    }

    // Check authorized signer
    if (!llcProfile.authorized_signer_name) {
      missing.push('Authorized signer not identified');
    }

    return missing.length === 0;
  }

  /**
   * OK-GATE-2: Phase 3 Validation Gate
   * Blocks Phase 4 until contract validation passes
   */
  private evaluatePhase3Gate(context: GateEvaluationContext, missing: string[]): boolean {
    const { compliance } = context;

    if (!compliance) {
      missing.push('No compliance record found');
      return false;
    }

    // Check Phase 3 status
    if (compliance.phase3_status !== 'GREEN') {
      // Check individual Phase 3 checks
      if (!compliance.buyer_matches_llc) missing.push('Buyer name does not match LLC');
      if (!compliance.contract_assignable) missing.push('Contract is not assignable');
      if (!compliance.as_is_language) missing.push('AS-IS language not found');
      if (!compliance.contract_not_expired) missing.push('Contract has expired');
      if (!compliance.seller_signature_present) missing.push('Seller signature not present');

      return false;
    }

    return true;
  }

  /**
   * OK-GATE-3: Compliance Status Gate
   * Blocks Phase 6 until overall status is GREEN
   */
  private evaluateComplianceStatusGate(context: GateEvaluationContext, missing: string[]): boolean {
    const { compliance } = context;

    if (!compliance) {
      missing.push('No compliance record found');
      return false;
    }

    if (compliance.overall_status !== 'GREEN') {
      missing.push(`Overall compliance status is ${compliance.overall_status || 'not set'}, must be GREEN`);

      // Add specific issues
      if (compliance.phase3_status !== 'GREEN') {
        missing.push('Phase 3 (contract validation) not GREEN');
      }
      if (compliance.phase4_status !== 'GREEN') {
        const score = compliance.disclosure_score || 0;
        const total = compliance.total_disclosures || 8;
        missing.push(`Phase 4 (disclosures) not GREEN: ${score}/${total} disclosures found`);
      }

      return false;
    }

    return true;
  }

  /**
   * OK-GATE-4: Distribution Agreements Gate
   * Blocks Phase 8 until MSA (and ASA if auction) executed
   */
  private evaluateDistributionAgreementsGate(
    context: GateEvaluationContext,
    missing: string[]
  ): boolean {
    const { agreements, compliance } = context;

    // First, check if distribution channels have been selected (Phase 6)
    const stateSpecificData = compliance?.state_specific_data || {};
    const distributionChannels: string[] = stateSpecificData.distributionChannels || [];

    if (distributionChannels.length === 0) {
      missing.push('Distribution channels not selected (Phase 6 required)');
      return false;
    }

    // Check for MSA (required for all channels)
    const hasMSA = agreements?.some(
      (a: any) =>
        (a.agreement_type === 'MSA' || a.document_type === 'msa' || a.category === 'msa') &&
        (a.status === 'executed' || a.status === 'completed')
    );

    if (!hasMSA) {
      missing.push('Marketing Services Agreement (MSA) not executed');
    }

    // Check for ASA if auction channel is selected
    const hasAuctionChannel = distributionChannels.includes('auction');
    if (hasAuctionChannel) {
      const hasASA = agreements?.some(
        (a: any) =>
          (a.agreement_type === 'ASA' || a.document_type === 'asa' || a.category === 'asa') &&
          (a.status === 'executed' || a.status === 'completed')
      );

      if (!hasASA) {
        missing.push('Auction Services Agreement (ASA) not executed (required for auction channel)');
      }
    }

    return missing.length === 0;
  }

  /**
   * OK-GATE-5: Broker Review Gate
   * Blocks Phase 9 until broker approves
   */
  private evaluateBrokerReviewGate(context: GateEvaluationContext, missing: string[]): boolean {
    const { brokerReview, compliance } = context;

    // Check if broker review exists and is approved
    if (!brokerReview) {
      // Check compliance record for broker approval fields
      if (compliance?.broker_reviewed !== true) {
        missing.push('Deal pending broker review');
        return false;
      }
      if (compliance?.broker_decision !== 'approved') {
        missing.push(`Broker decision: ${compliance?.broker_decision || 'pending'}`);
        return false;
      }
      return true;
    }

    if (brokerReview.decision !== 'approved') {
      if (!brokerReview.decision) {
        missing.push('Deal pending broker review');
      } else {
        missing.push(`Broker ${brokerReview.decision}: ${brokerReview.notes || ''}`);
      }
      return false;
    }

    return true;
  }

  /**
   * OK-GATE-6: Timing Validation Gate
   * Blocks Phase 11 until timing is validated
   */
  private evaluateTimingGate(context: GateEvaluationContext, missing: string[]): boolean {
    const { compliance } = context;

    if (!compliance) {
      missing.push('No compliance record found');
      return false;
    }

    // Check timing validation
    if (compliance.timing_valid !== true) {
      if (!compliance.contract_acceptance_date) {
        missing.push('Contract acceptance date not set');
      }
      if (!compliance.cancellation_delivery_date) {
        missing.push('Cancellation delivery date not set');
      }
      if (!compliance.cancellation_acknowledged) {
        missing.push('Seller has not acknowledged cancellation rights');
      }

      // Check timing order
      if (compliance.contract_acceptance_date && compliance.cancellation_delivery_date) {
        const acceptance = new Date(compliance.contract_acceptance_date);
        const delivery = new Date(compliance.cancellation_delivery_date);
        if (delivery <= acceptance) {
          missing.push('CRITICAL: Cancellation must be delivered AFTER contract acceptance');
        }
      }

      return false;
    }

    return true;
  }

  /**
   * Build evaluation context from database
   */
  private async buildContext(dealId: number, state: string): Promise<GateEvaluationContext> {
    // Get compliance record
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId AND state = :state LIMIT 1',
      { replacements: { dealId, state: state.toUpperCase() } }
    );
    const compliance = (complianceResults as any[])?.[0];

    // Get workflow record
    const [workflowResults] = await sequelize.query(
      'SELECT * FROM state_workflow_state WHERE deal_id = :dealId AND state = :state LIMIT 1',
      { replacements: { dealId, state: state.toUpperCase() } }
    );
    const workflow = (workflowResults as any[])?.[0];

    // Get property for LLC info
    const [propertyResults] = await sequelize.query(
      'SELECT * FROM properties WHERE id = :dealId LIMIT 1',
      { replacements: { dealId } }
    );
    const property = (propertyResults as any[])?.[0];

    // Get LLC profile if property has one
    let llcProfile = null;
    if (property?.llc_profile_id) {
      const [llcResults] = await sequelize.query(
        'SELECT * FROM llc_profiles WHERE id = :llcId LIMIT 1',
        { replacements: { llcId: property.llc_profile_id } }
      );
      llcProfile = (llcResults as any[])?.[0];
    }

    // Get documents for this deal
    const [documents] = await sequelize.query(
      'SELECT * FROM property_documents WHERE property_id = :dealId',
      { replacements: { dealId } }
    );

    // Get agreements/contracts - check each source separately to handle missing tables
    let agreements: any[] = [];
    try {
      // Try docuseal_submissions first
      const [docusealResults] = await sequelize.query(
        'SELECT * FROM docuseal_submissions WHERE property_id = :dealId',
        { replacements: { dealId } }
      );
      agreements = agreements.concat(docusealResults as any[]);
    } catch {
      // Table may not exist, continue
    }

    // Get agreements from property_documents
    const [docAgreements] = await sequelize.query(
      `SELECT * FROM property_documents WHERE property_id = :dealId AND category IN ('msa', 'asa', 'csa')`,
      { replacements: { dealId } }
    );
    agreements = agreements.concat(docAgreements as any[]);

    // Get broker review if exists
    const [brokerResults] = await sequelize.query(
      `SELECT * FROM compliance_audit_log
       WHERE property_id = :dealId AND action_type = 'broker_review'
       ORDER BY created_at DESC LIMIT 1`,
      { replacements: { dealId } }
    );
    const brokerReview = (brokerResults as any[])?.[0];

    return {
      dealId,
      state: state.toUpperCase(),
      currentPhase: workflow?.current_phase || 0,
      targetPhase: 0,
      compliance,
      workflow,
      llcProfile,
      documents: documents as any[],
      agreements: agreements as any[],
      brokerReview,
    };
  }

  /**
   * Get a human-readable summary of gate status
   */
  async getGateSummaryText(dealId: number, state: string): Promise<string> {
    const summary = await this.evaluateAllGates(dealId, state);

    const lines: string[] = [
      `Gate Status for Deal ${dealId} (${state})`,
      `Current Phase: ${summary.currentPhase}`,
      `Can Advance To: Phase ${summary.canAdvanceTo}`,
      '',
    ];

    for (const gate of summary.gates) {
      const status = gate.passed ? '✅' : '❌';
      lines.push(`${status} ${gate.gateName} (${gate.gateId})`);
      lines.push(`   Phase ${gate.phase} → Blocks Phase ${gate.blocksPhase}`);

      if (!gate.passed && gate.missingRequirements.length > 0) {
        for (const req of gate.missingRequirements) {
          lines.push(`   - ${req}`);
        }
      }
      lines.push('');
    }

    if (summary.blockedAtGate) {
      lines.push(`🚫 BLOCKED at ${summary.blockedAtGate}: ${summary.blockedReason}`);
    } else {
      lines.push('✅ All gates passed - workflow can proceed');
    }

    return lines.join('\n');
  }
}

export const blockingGateService = new BlockingGateService();
export default blockingGateService;
