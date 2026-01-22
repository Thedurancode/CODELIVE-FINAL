/**
 * Property Checklist Service
 *
 * Generates dynamic compliance checklists for properties based on:
 * - Property state (OK, TX, FL, etc.)
 * - Current phase
 * - Attached contacts and documents
 * - Executed agreements
 *
 * Now includes:
 * - Phase-based timeline view
 * - Blocking gates between phases
 * - DocuSeal signing status
 */

import Property from '../models/Property';
import PropertyDocument from '../models/PropertyDocument';
import Contact from '../models/Contact';
import { Op } from 'sequelize';
import { stateComplianceEngine } from './StateComplianceEngine';

interface ChecklistItem {
  id: string;
  category: 'llc' | 'contact' | 'document' | 'agreement' | 'rule';
  name: string;
  description: string;
  required: boolean;
  phase: number;
  status: 'complete' | 'partial' | 'missing' | 'pending' | 'not_applicable';
  blocking: boolean;
  completedAt?: Date;
  details?: any;
  metadata?: any;
  signingStatus?: 'not_sent' | 'sent' | 'opened' | 'completed' | 'declined' | 'expired';
}

// Phase definitions for Oklahoma workflow
interface PhaseDefinition {
  phase: number;
  name: string;
  shortName: string;
  description: string;
  icon: string;
}

// Gate definitions - blocking checkpoints between phases
interface GateDefinition {
  gateId: string;
  name: string;
  afterPhase: number;
  blocksPhase: number;
  requirements: string[];
  errorMessage: string;
}

interface GateStatus {
  gateId: string;
  name: string;
  afterPhase: number;
  blocksPhase: number;
  status: 'passed' | 'blocked' | 'pending';
  requirements: {
    requirement: string;
    met: boolean;
  }[];
  errorMessage?: string;
}

interface PhaseStatus {
  phase: number;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  status: 'complete' | 'in_progress' | 'blocked' | 'pending';
  progress: number;
  items: ChecklistItem[];
  gateAfter?: GateStatus;
}

interface PropertyChecklist {
  propertyId: number;
  state: string;
  currentPhase: number;
  overallStatus: 'complete' | 'incomplete' | 'blocked';
  overallProgress: number; // 0-100
  // Legacy sections for backwards compatibility
  sections: {
    llcSetup: ChecklistSection;
    contacts: ChecklistSection;
    documents: ChecklistSection;
    agreements: ChecklistSection;
    complianceRules: ChecklistSection;
  };
  // NEW: Phase-based timeline
  phases: PhaseStatus[];
  gates: GateStatus[];
  blockingIssues: string[];
  nextSteps: string[];
}

interface ChecklistSection {
  name: string;
  progress: number; // 0-100
  items: ChecklistItem[];
  requiredCount: number;
  completedCount: number;
}

// Oklahoma Phase Definitions (7-Phase Structure)
const OKLAHOMA_PHASES: PhaseDefinition[] = [
  { phase: 0, name: 'Account Setup & Entity Verification', shortName: 'Setup', description: 'LLC profile, Articles, Operating Agreement, CSA', icon: '🏢' },
  { phase: 1, name: 'Property Submission', shortName: 'Submit', description: 'Purchase contract, seller disclosures', icon: '📄' },
  { phase: 2, name: 'Compliance Review & Approval', shortName: 'Review', description: 'Contract validation, disclosure check, scoring', icon: '🔍' },
  { phase: 3, name: 'Approved / Pre-Distribution', shortName: 'Approved', description: 'MSA/ASA signing, broker review', icon: '✅' },
  { phase: 4, name: 'Offer Accepted / Pre-Buyer Ack', shortName: 'Accepted', description: 'Seller acknowledgment, 3-day statutory hold', icon: '📋' },
  { phase: 5, name: 'Buyer Contract Execution', shortName: 'Execute', description: 'Assignment OR Double Close PSA', icon: '🤝' },
  { phase: 6, name: 'Title, Closing & Settlement', shortName: 'Close', description: 'Outside platform - tracking only', icon: '🎉' },
];

// Oklahoma Gate Definitions (5 Gates for 7-Phase Structure)
const OKLAHOMA_GATES: GateDefinition[] = [
  {
    gateId: 'OK-GATE-1',
    name: 'LLC Hard Gate',
    afterPhase: 0,
    blocksPhase: 1,
    requirements: [
      'LLC profile complete',
      'Articles of Organization uploaded',
      'Operating Agreement uploaded',
      'Authorized signer identified',
      'CSA executed',
    ],
    errorMessage: 'Cannot submit property without complete LLC setup',
  },
  {
    gateId: 'OK-GATE-2',
    name: 'Contract Upload Gate',
    afterPhase: 1,
    blocksPhase: 2,
    requirements: [
      'Purchase contract uploaded',
      'Contract is signed by seller',
      'Seller disclosures completed',
    ],
    errorMessage: 'Upload signed purchase contract before compliance review',
  },
  {
    gateId: 'OK-GATE-3',
    name: 'Compliance Status Gate',
    afterPhase: 2,
    blocksPhase: 3,
    requirements: [
      'Overall compliance = GREEN',
      'Contract validation passed',
      'All required disclosures present',
    ],
    errorMessage: 'Must be GREEN to proceed to distribution',
  },
  {
    gateId: 'OK-GATE-4',
    name: 'Broker Approval Gate',
    afterPhase: 3,
    blocksPhase: 4,
    requirements: [
      'MSA executed',
      'ASA executed (if using auction)',
      'Broker has reviewed',
      'Broker decision = approved',
    ],
    errorMessage: 'Waiting for broker approval before accepting offers',
  },
  {
    gateId: 'OK-GATE-5',
    name: 'Timing Validation Gate (3-Day Hold)',
    afterPhase: 4,
    blocksPhase: 5,
    requirements: [
      'Seller acknowledgment signed',
      '3-day statutory hold period elapsed',
      'Cancellation period expired',
    ],
    errorMessage: 'CRITICAL: 3-day statutory hold must pass before buyer contract execution',
  },
];

class PropertyChecklistService {
  /**
   * Generate complete checklist for a property
   */
  async generateChecklist(propertyId: number): Promise<PropertyChecklist> {
    // Load property with associations
    const property = await Property.findByPk(propertyId, {
      include: [
        { association: 'documents' },
        {
          association: 'assignedContacts',
          include: [{ association: 'contact' }],
        },
      ],
    });

    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    const state = property.state || 'OK'; // Default to Oklahoma
    const currentPhase = property.currentPhase || 0;

    // Load state compliance config
    const stateConfig = await this.loadStateConfig(state);

    // Generate each section (legacy support)
    const llcSetup = await this.generateLLCSetupSection(property, stateConfig);
    const contacts = await this.generateContactsSection(property, stateConfig);
    const documents = await this.generateDocumentsSection(property, stateConfig, currentPhase);
    const agreements = await this.generateAgreementsSection(property, stateConfig, currentPhase);
    const complianceRules = await this.generateComplianceRulesSection(property, stateConfig, currentPhase);

    // Calculate overall progress
    const allSections = [llcSetup, contacts, documents, agreements, complianceRules];
    const overallProgress = Math.round(
      allSections.reduce((sum, section) => sum + section.progress, 0) / allSections.length
    );

    // Find blocking issues
    const blockingIssues: string[] = [];
    allSections.forEach(section => {
      section.items.forEach(item => {
        if (item.blocking && item.status === 'missing') {
          blockingIssues.push(`${section.name}: ${item.name}`);
        }
      });
    });

    // NEW: Generate phase timeline and gates
    const phases = await this.generatePhaseTimeline(property, stateConfig, currentPhase, allSections);
    const gates = await this.evaluateGates(property, stateConfig, currentPhase, allSections);

    // Generate next steps (enhanced with phase context)
    const nextSteps = this.generateNextStepsEnhanced(property, phases, gates, currentPhase);

    return {
      propertyId,
      state,
      currentPhase,
      overallStatus: blockingIssues.length > 0 ? 'blocked' : (overallProgress === 100 ? 'complete' : 'incomplete'),
      overallProgress,
      sections: {
        llcSetup,
        contacts,
        documents,
        agreements,
        complianceRules,
      },
      phases,
      gates,
      blockingIssues,
      nextSteps,
    };
  }

  /**
   * Generate phase-based timeline view
   */
  private async generatePhaseTimeline(
    property: any,
    stateConfig: any,
    currentPhase: number,
    allSections: ChecklistSection[]
  ): Promise<PhaseStatus[]> {
    const state = property.state || 'OK';
    const phaseDefinitions = state === 'OK' ? OKLAHOMA_PHASES : OKLAHOMA_PHASES; // Add other states later
    const gateDefinitions = state === 'OK' ? OKLAHOMA_GATES : OKLAHOMA_GATES;

    // Collect all items by phase
    const itemsByPhase: { [phase: number]: ChecklistItem[] } = {};
    allSections.forEach(section => {
      section.items.forEach(item => {
        const phase = item.phase;
        if (!itemsByPhase[phase]) itemsByPhase[phase] = [];
        itemsByPhase[phase].push(item);
      });
    });

    // Build phase statuses
    const phases: PhaseStatus[] = [];

    for (const phaseDef of phaseDefinitions) {
      const phaseItems = itemsByPhase[phaseDef.phase] || [];
      const requiredItems = phaseItems.filter(i => i.required);
      const completedItems = requiredItems.filter(i => i.status === 'complete');
      const progress = requiredItems.length > 0
        ? Math.round((completedItems.length / requiredItems.length) * 100)
        : (phaseDef.phase <= currentPhase ? 100 : 0);

      // Determine phase status
      let status: 'complete' | 'in_progress' | 'blocked' | 'pending';
      if (phaseDef.phase < currentPhase) {
        status = 'complete';
      } else if (phaseDef.phase === currentPhase) {
        const hasBlockingIssues = phaseItems.some(i => i.blocking && i.status === 'missing');
        status = hasBlockingIssues ? 'blocked' : (progress === 100 ? 'complete' : 'in_progress');
      } else {
        // Check if blocked by a gate
        const blockingGate = gateDefinitions.find(g => g.blocksPhase === phaseDef.phase);
        status = blockingGate ? 'pending' : 'pending';
      }

      // Find gate after this phase
      const gateAfterPhase = gateDefinitions.find(g => g.afterPhase === phaseDef.phase);
      let gateAfter: GateStatus | undefined;
      if (gateAfterPhase && phaseDef.phase <= currentPhase) {
        gateAfter = await this.evaluateSingleGate(gateAfterPhase, property, stateConfig, allSections);
      }

      phases.push({
        phase: phaseDef.phase,
        name: phaseDef.name,
        shortName: phaseDef.shortName,
        description: phaseDef.description,
        icon: phaseDef.icon,
        status,
        progress,
        items: phaseItems,
        gateAfter,
      });
    }

    return phases;
  }

  /**
   * Evaluate all gates for the deal
   */
  private async evaluateGates(
    property: any,
    stateConfig: any,
    currentPhase: number,
    allSections: ChecklistSection[]
  ): Promise<GateStatus[]> {
    const state = property.state || 'OK';
    const gateDefinitions = state === 'OK' ? OKLAHOMA_GATES : OKLAHOMA_GATES;

    const gates: GateStatus[] = [];
    for (const gateDef of gateDefinitions) {
      const gateStatus = await this.evaluateSingleGate(gateDef, property, stateConfig, allSections);
      gates.push(gateStatus);
    }

    return gates;
  }

  /**
   * Evaluate a single gate
   */
  private async evaluateSingleGate(
    gateDef: GateDefinition,
    property: any,
    stateConfig: any,
    allSections: ChecklistSection[]
  ): Promise<GateStatus> {
    const requirements: { requirement: string; met: boolean }[] = [];
    let allMet = true;

    // Evaluate each requirement based on gate type
    switch (gateDef.gateId) {
      case 'OK-GATE-1': // LLC Hard Gate
        const llcSection = allSections.find(s => s.name === 'LLC Setup');
        requirements.push({
          requirement: 'LLC profile complete',
          met: (llcSection?.items.find(i => i.id === 'llc-articles')?.status === 'complete') || false,
        });
        requirements.push({
          requirement: 'Articles of Organization uploaded',
          met: (llcSection?.items.find(i => i.id === 'llc-articles')?.status === 'complete') || false,
        });
        requirements.push({
          requirement: 'Operating Agreement uploaded',
          met: (llcSection?.items.find(i => i.id === 'llc-operating-agreement')?.status === 'complete') || false,
        });
        requirements.push({
          requirement: 'Authorized signer identified',
          met: (llcSection?.items.find(i => i.id === 'llc-authorized-signer')?.status === 'complete') || false,
        });
        requirements.push({
          requirement: 'CSA executed',
          met: (llcSection?.items.find(i => i.id === 'llc-csa')?.status === 'complete') || false,
        });
        break;

      case 'OK-GATE-2': // Contract Validation Gate
        const rulesSection = allSections.find(s => s.name === 'State Compliance');
        const contractItem = rulesSection?.items.find(i => i.id === 'compliance-contract-validation');
        const checks = contractItem?.details?.checks || [];
        requirements.push({
          requirement: 'Buyer matches LLC',
          met: checks.find((c: any) => c.key === 'buyer_matches_llc')?.passed === true,
        });
        requirements.push({
          requirement: 'Contract is assignable',
          met: checks.find((c: any) => c.key === 'contract_assignable')?.passed === true,
        });
        requirements.push({
          requirement: 'AS-IS language present',
          met: checks.find((c: any) => c.key === 'as_is_language')?.passed === true,
        });
        requirements.push({
          requirement: 'Contract not expired',
          met: checks.find((c: any) => c.key === 'contract_not_expired')?.passed === true,
        });
        requirements.push({
          requirement: 'Seller signature present',
          met: checks.find((c: any) => c.key === 'seller_signature_present')?.passed === true,
        });
        break;

      case 'OK-GATE-3': // Compliance Status Gate
        const complianceSection = allSections.find(s => s.name === 'State Compliance');
        const overallItem = complianceSection?.items.find(i => i.id === 'compliance-overall');
        const disclosuresItem = complianceSection?.items.find(i => i.id === 'compliance-disclosures');
        requirements.push({
          requirement: 'Overall compliance = GREEN',
          met: overallItem?.details?.overallStatus === 'GREEN',
        });
        requirements.push({
          requirement: 'All 8 disclosures present',
          met: disclosuresItem?.status === 'complete',
        });
        break;

      case 'OK-GATE-4': // Broker Approval Gate (afterPhase 3, blocks Phase 4)
        // Check for MSA/ASA agreements (IDs now include template ID, so use startsWith)
        const agreementsSection = allSections.find(s => s.name === 'Agreements');
        const msaItem = agreementsSection?.items.find(i => i.id.startsWith('agreement-msa'));
        const asaItem = agreementsSection?.items.find(i => i.id.startsWith('agreement-asa'));
        requirements.push({
          requirement: 'MSA executed',
          met: msaItem?.status === 'complete',
        });
        // ASA only required if using auction
        if (asaItem) {
          requirements.push({
            requirement: 'ASA executed (if using auction)',
            met: asaItem.status === 'complete',
          });
        } else {
          requirements.push({
            requirement: 'ASA executed (if using auction)',
            met: true, // Not using auction, so requirement is met
          });
        }
        // Also check broker approval
        const approvalStatus = property.approvalStatus;
        requirements.push({
          requirement: 'Broker has reviewed',
          met: ['approved', 'rejected'].includes(approvalStatus),
        });
        requirements.push({
          requirement: 'Broker decision = approved',
          met: approvalStatus === 'approved',
        });
        break;

      case 'OK-GATE-5': // Timing Validation Gate (afterPhase 4, blocks Phase 5)
        // Check seller acknowledgment and 3-day hold
        const sellerAckItem = allSections.find(s => s.name === 'Agreements')?.items.find(i =>
          i.id.startsWith('agreement-seller_acknowledgment') || i.id.startsWith('agreement-cancellation')
        );
        requirements.push({
          requirement: 'Seller acknowledgment signed',
          met: sellerAckItem?.status === 'complete',
        });

        const timingSection = allSections.find(s => s.name === 'State Compliance');
        const timingItem = timingSection?.items.find(i => i.id === 'compliance-timing');
        requirements.push({
          requirement: '3-day statutory hold period elapsed',
          met: timingItem?.details?.timingValid === true,
        });
        requirements.push({
          requirement: 'Cancellation period expired',
          met: timingItem?.details?.canExecuteAssignment === true,
        });
        break;

      default:
        // Generic gate - check if all items in blocking phase are complete
        gateDef.requirements.forEach(req => {
          requirements.push({ requirement: req, met: false });
        });
    }

    allMet = requirements.every(r => r.met);

    // Determine gate status
    let status: 'passed' | 'blocked' | 'pending';
    if (allMet) {
      status = 'passed';
    } else if (property.currentPhase >= gateDef.afterPhase) {
      status = 'blocked';
    } else {
      status = 'pending';
    }

    return {
      gateId: gateDef.gateId,
      name: gateDef.name,
      afterPhase: gateDef.afterPhase,
      blocksPhase: gateDef.blocksPhase,
      status,
      requirements,
      errorMessage: status === 'blocked' ? gateDef.errorMessage : undefined,
    };
  }

  /**
   * Enhanced next steps with phase context
   */
  private generateNextStepsEnhanced(
    property: any,
    phases: PhaseStatus[],
    gates: GateStatus[],
    currentPhase: number
  ): string[] {
    const nextSteps: string[] = [];

    // Find current phase
    const currentPhaseStatus = phases.find(p => p.phase === currentPhase);

    // Check for blocked gates
    const blockedGate = gates.find(g => g.status === 'blocked');
    if (blockedGate) {
      nextSteps.push(`🚫 GATE BLOCKED: ${blockedGate.name}`);
      blockedGate.requirements
        .filter(r => !r.met)
        .slice(0, 3)
        .forEach(r => {
          nextSteps.push(`   ↳ ${r.requirement}`);
        });
      return nextSteps;
    }

    // Find incomplete items in current phase
    if (currentPhaseStatus) {
      const incompleteItems = currentPhaseStatus.items.filter(
        i => i.required && (i.status === 'missing' || i.status === 'pending')
      );

      if (incompleteItems.length > 0) {
        nextSteps.push(`📍 Phase ${currentPhase}: ${currentPhaseStatus.name}`);
        incompleteItems.slice(0, 3).forEach(item => {
          const icon = item.blocking ? '🚨' : '⚠️';
          nextSteps.push(`   ${icon} ${item.name}`);
        });
      } else {
        // Current phase complete, show next phase
        const nextPhase = phases.find(p => p.phase === currentPhase + 1);
        if (nextPhase) {
          nextSteps.push(`✅ Phase ${currentPhase} complete!`);
          nextSteps.push(`➡️ Next: Phase ${nextPhase.phase} - ${nextPhase.name}`);
          nextSteps.push(`   ${nextPhase.description}`);
        } else {
          nextSteps.push(`🎉 All phases complete!`);
        }
      }
    }

    return nextSteps.slice(0, 6);
  }

  /**
   * Generate LLC Setup section
   */
  private async generateLLCSetupSection(property: any, stateConfig: any): Promise<ChecklistSection> {
    const items: ChecklistItem[] = [];

    // Check if LLC profile exists with proper association
    const llcSelected = property.selectedLlcId !== null && property.selectedLlcId !== undefined;

    // Only check LLC documents/agreements if a proper LLC profile is linked
    if (llcSelected) {
      // Load LLC profile
      const { default: LLCProfile } = await import('../models/LLCProfile');
      const llc = await LLCProfile.findByPk(property.selectedLlcId, {
        include: ['documents', 'authorizedSigners', 'agreements'],
      });

      if (llc) {
        // Articles of Organization
        const articles = llc.documents?.find((d: any) => d.documentType === 'articles');
        items.push({
          id: 'llc-articles',
          category: 'llc',
          name: `${stateConfig.state === 'TX' ? 'Certificate of Formation' : 'Articles of Organization'}`,
          description: 'State-filed formation document',
          required: true,
          phase: 0,
          status: articles ? 'complete' : 'missing',
          blocking: true,
          completedAt: articles?.uploadedAt,
        });

        // Operating Agreement
        const operatingAgreement = llc.documents?.find((d: any) =>
          d.documentType === 'operating_agreement' || d.documentType === 'company_agreement'
        );
        items.push({
          id: 'llc-operating-agreement',
          category: 'llc',
          name: `${stateConfig.state === 'TX' ? 'Company Agreement' : 'Operating Agreement'}`,
          description: 'Internal LLC governing document',
          required: true,
          phase: 0,
          status: operatingAgreement ? 'complete' : 'missing',
          blocking: true,
          completedAt: operatingAgreement?.uploadedAt,
        });

        // Authorized Signer
        const hasSigner = llc.authorizedSigners && llc.authorizedSigners.length > 0;
        items.push({
          id: 'llc-authorized-signer',
          category: 'llc',
          name: 'Authorized Signer Identified',
          description: 'Person authorized to sign contracts for the LLC',
          required: true,
          phase: 0,
          status: hasSigner ? 'complete' : 'missing',
          blocking: true,
        });

        // CSA Executed
        const csa = llc.agreements?.find((a: any) => a.agreementType === 'CSA' && a.status === 'executed');
        items.push({
          id: 'llc-csa',
          category: 'llc',
          name: 'Client Services Agreement (CSA)',
          description: 'Agreement between platform and LLC',
          required: true,
          phase: 0,
          status: csa ? 'complete' : (llc.agreements?.some((a: any) => a.agreementType === 'CSA') ? 'pending' : 'missing'),
          blocking: true,
          completedAt: csa?.executedAt,
        });
      }
    }

    const requiredCount = items.filter(i => i.required).length;
    const completedCount = items.filter(i => i.required && i.status === 'complete').length;
    const progress = requiredCount > 0 ? Math.round((completedCount / requiredCount) * 100) : 0;

    return {
      name: 'LLC Setup',
      progress,
      items,
      requiredCount,
      completedCount,
    };
  }

  /**
   * Generate Contacts section
   */
  private async generateContactsSection(property: any, stateConfig: any): Promise<ChecklistSection> {
    const items: ChecklistItem[] = [];

    // Get contacts spec from state config
    const contactsSpec = stateConfig.contacts || [];

    console.log(`\n=== Checking Contacts for Property ${property.id} ===`);
    console.log(`Found ${property.assignedContacts?.length || 0} assigned contacts`);

    for (const contactSpec of contactsSpec) {
      // Check through assignedContacts join table with precise matching
      const matchedAssignment = property.assignedContacts?.find((ac: any) => {
        const contact = ac.contact;

        if (!contact) return false;

        // Normalize strings for comparison
        const normalizeStr = (str: string) => (str || '').toLowerCase().trim();
        const contactCategory = normalizeStr(contact.category || '');
        const contactRole = normalizeStr(contact.role || '');
        const acRole = normalizeStr(ac.role || '');
        const specCategory = normalizeStr(contactSpec.category);
        const specRole = normalizeStr(contactSpec.role);

        // Category must be an exact match (case-insensitive)
        const categoryMatch = contactCategory === specCategory;

        // Role matching: exact match or role contains the category as a word
        // e.g., "Property Seller" should match category "seller"
        // but "wholesaler" should NOT match category "seller"
        const roleWords = contactRole.split(/\s+/);
        const acRoleWords = acRole.split(/\s+/);

        const roleMatch = contactRole === specRole ||
                         acRole === specRole ||
                         roleWords.includes(specCategory) ||
                         acRoleWords.includes(specCategory);

        const matched = categoryMatch || roleMatch;

        if (matched) {
          console.log(`✓ Matched: ${contactSpec.role}`);
          console.log(`  Contact category: "${contact.category}", role: "${contact.role}"`);
          console.log(`  Assignment role: "${ac.role}"`);
        }

        return matched;
      });

      const attached = !!matchedAssignment;
      const matchedContact = matchedAssignment?.contact;

      if (!attached) {
        console.log(`✗ Missing: ${contactSpec.role} (looking for category="${contactSpec.category}" or role="${contactSpec.role}")`);
      }

      items.push({
        id: `contact-${contactSpec.category}`,
        category: 'contact',
        name: contactSpec.role,
        description: `Required fields: ${contactSpec.requiredFields?.map((f: any) => f.displayName).join(', ')}`,
        required: contactSpec.blocking,
        phase: contactSpec.phase,
        status: attached ? 'complete' : (contactSpec.blocking ? 'missing' : 'not_applicable'),
        blocking: contactSpec.blocking,
        details: contactSpec,
        metadata: {
          category: contactSpec.category,
          role: contactSpec.role,
          contactName: matchedContact?.name,
          contactId: matchedContact?.id,
        },
      });
    }

    const requiredCount = items.filter(i => i.required).length;
    const completedCount = items.filter(i => i.required && i.status === 'complete').length;
    const progress = requiredCount > 0 ? Math.round((completedCount / requiredCount) * 100) : 0;

    return {
      name: 'Contacts',
      progress,
      items,
      requiredCount,
      completedCount,
    };
  }

  /**
   * Generate Documents section
   */
  private async generateDocumentsSection(property: any, stateConfig: any, currentPhase: number): Promise<ChecklistSection> {
    const items: ChecklistItem[] = [];

    // Get documents spec from state config
    const documentsSpec = stateConfig.documents || [];

    // Check if property is pre-1978 (requires Lead-Based Paint Disclosure)
    const yearBuilt = property.yearBuilt;
    const isPre1978 = yearBuilt && yearBuilt < 1978;

    for (const docSpec of documentsSpec) {
      // Only include documents up to current phase + 1
      if (docSpec.phase > currentPhase + 1) continue;

      const uploaded = property.documents?.some((d: any) =>
        d.documentType === docSpec.documentType || d.category === docSpec.category
      );

      const document = property.documents?.find((d: any) =>
        d.documentType === docSpec.documentType || d.category === docSpec.category
      );

      // Lead-Based Paint Disclosure is REQUIRED for pre-1978 properties (federal law)
      let isRequired = docSpec.required;
      let description = `Phase ${docSpec.phase} - ${docSpec.category}`;
      if (docSpec.documentType === 'lead_paint_disclosure') {
        isRequired = isPre1978;
        description = isPre1978
          ? `REQUIRED - Property built ${yearBuilt} (pre-1978)`
          : `Not required - Property built ${yearBuilt || 'unknown'} (post-1978)`;
      }

      items.push({
        id: `document-${docSpec.documentType}`,
        category: 'document',
        name: docSpec.officialName,
        description,
        required: isRequired,
        phase: docSpec.phase,
        status: uploaded ? 'complete' : (isRequired && docSpec.phase <= currentPhase ? 'missing' : 'pending'),
        blocking: isRequired && docSpec.phase <= currentPhase,
        completedAt: document?.uploadedAt,
        details: {
          extractionFields: docSpec.extractionFields,
          retentionPeriod: docSpec.retentionPeriod,
          yearBuilt,
          isPre1978,
        },
      });
    }

    const requiredCount = items.filter(i => i.required && i.phase <= currentPhase).length;
    const completedCount = items.filter(i => i.required && i.phase <= currentPhase && i.status === 'complete').length;
    const progress = requiredCount > 0 ? Math.round((completedCount / requiredCount) * 100) : 0;

    return {
      name: 'Documents',
      progress,
      items,
      requiredCount,
      completedCount,
    };
  }

  /**
   * Generate Agreements section with DocuSeal signing status
   * Now reads from StateDocumentTemplate for dynamic contract requirements
   */
  private async generateAgreementsSection(property: any, stateConfig: any, currentPhase: number): Promise<ChecklistSection> {
    const items: ChecklistItem[] = [];
    const state = property.state || 'OK';

    // Import models
    const { default: DocuSealSubmission } = await import('../models/DocuSealSubmission');
    const { default: StateDocumentTemplate } = await import('../models/StateDocumentTemplate');

    // Helper to get signing status from DocuSeal
    const getSigningStatus = (submission: any): 'not_sent' | 'sent' | 'opened' | 'completed' | 'declined' | 'expired' => {
      if (!submission) return 'not_sent';
      switch (submission.status) {
        case 'completed': return 'completed';
        case 'declined': return 'declined';
        case 'expired': return 'expired';
        case 'opened': return 'opened';
        case 'sent': return 'sent';
        case 'pending': return 'sent';
        default: return 'not_sent';
      }
    };

    const getSigningDescription = (signingStatus: string): string => {
      switch (signingStatus) {
        case 'completed': return 'Signed';
        case 'declined': return 'Declined - needs resend';
        case 'expired': return 'Expired - needs resend';
        case 'opened': return 'Opened - awaiting signature';
        case 'sent': return 'Sent - awaiting signature';
        default: return 'Not sent yet';
      }
    };

    // Map category to document types for DocuSeal lookup
    const categoryToDocTypes: Record<string, string[]> = {
      'csa': ['csa', 'CSA'],
      'msa': ['msa', 'MSA'],
      'asa': ['asa', 'ASA'],
      'seller_acknowledgment': ['seller_acknowledgment', 'seller-acknowledgment'],
      'cancellation_disclosure': ['cancellation_disclosure', 'cancellation'],
      'assignment_addendum': ['assignment_addendum', 'assignment_agreement', 'assignment'],
      'double_close_psa': ['double_close_psa', 'psa'],
      'wholesaler_disclosure': ['wholesaler_disclosure'],
      'equity_disclosure': ['equity_disclosure'],
      'purchase_contract': ['purchase_contract', 'contract'],
    };

    // Load contract templates from StateDocumentTemplate for this state
    // Only get templates that have a phase assigned (these are the ones for compliance tracking)
    const templates = await StateDocumentTemplate.findAll({
      where: {
        state: [state.toUpperCase(), 'ALL'],
        enabled: true,
        phase: { [Op.not]: null },
      },
      order: [['phase', 'ASC'], ['priority', 'DESC']],
    });

    console.log(`\n=== Loading ${templates.length} contract templates for ${state} ===`);

    // Process each template
    for (const template of templates) {
      const templatePhase = template.phase as number;

      // Check conditional requirements (e.g., ASA only for auction)
      if (template.conditionalOn) {
        const conditions = template.conditionalOn as any;

        // Check distribution channel condition
        if (conditions.distributionChannels?.length > 0) {
          const dealChannels = property.distributionChannels || [];
          const hasRequiredChannel = conditions.distributionChannels.some(
            (ch: string) => dealChannels.includes(ch)
          );
          if (!hasRequiredChannel) {
            console.log(`  Skipping ${template.name} - distribution channel condition not met`);
            continue;
          }
        }

        // Check transaction type condition
        if (conditions.transactionType) {
          const dealType = property.transactionType || 'wholesale';
          if (dealType !== conditions.transactionType) {
            console.log(`  Skipping ${template.name} - transaction type condition not met`);
            continue;
          }
        }
      }

      // Only show templates for phases up to currentPhase + 1
      if (templatePhase > currentPhase + 1) {
        continue;
      }

      // Look up DocuSeal submission for this template
      const docTypes = categoryToDocTypes[template.category] || [template.category];
      const submission = await DocuSealSubmission.findOne({
        where: {
          propertyId: property.id,
          documentType: { [Op.in]: docTypes },
        },
        order: [['createdAt', 'DESC']],
      });

      const signingStatus = getSigningStatus(submission);
      const isComplete = signingStatus === 'completed';

      // Determine if this is required and blocking based on phase
      const isRequired = templatePhase <= currentPhase;
      const isBlocking = isRequired && !isComplete;

      console.log(`  ${template.name} (Phase ${templatePhase}): ${signingStatus} - ${isComplete ? 'Complete' : isRequired ? 'Missing' : 'Pending'}`);

      items.push({
        id: `agreement-${template.category}-${template.id}`,
        category: 'agreement',
        name: template.name,
        description: `Phase ${templatePhase} - ${template.description || template.category} - ${getSigningDescription(signingStatus)}`,
        required: isRequired,
        phase: templatePhase,
        status: isComplete ? 'complete' : (isRequired ? 'missing' : 'pending'),
        blocking: isBlocking,
        completedAt: submission?.completedAt,
        signingStatus: signingStatus,
        metadata: {
          templateId: template.id,
          docuSealTemplateId: template.docuSealTemplateId,
          docuSealSubmissionId: submission?.docuSealSubmissionId,
          submissionStatus: submission?.status,
          category: template.category,
          signerRoles: template.signerRoles,
          autoSend: template.autoSend,
          triggerOn: template.triggerOn,
        },
      });
    }

    // Sort items by phase
    items.sort((a, b) => a.phase - b.phase);

    const requiredCount = items.filter(i => i.required).length;
    const completedCount = items.filter(i => i.required && i.status === 'complete').length;
    const progress = requiredCount > 0 ? Math.round((completedCount / requiredCount) * 100) : 0;

    return {
      name: 'Agreements',
      progress,
      items,
      requiredCount,
      completedCount,
    };
  }

  /**
   * Generate Compliance Rules section - integrates with StateComplianceEngine
   */
  private async generateComplianceRulesSection(property: any, stateConfig: any, currentPhase: number): Promise<ChecklistSection> {
    const items: ChecklistItem[] = [];
    const state = stateConfig.state || property.state || 'OK';

    // Initialize state compliance engine
    await stateComplianceEngine.initialize();

    // Load actual compliance results from universal state_deal_compliance table
    let complianceRecord: any = null;
    let workflowRecord: any = null;
    try {
      const { default: sequelize } = await import('../config/database');

      // Query universal state_deal_compliance table
      const [complianceResults] = await sequelize.query(
        'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId AND state = :state LIMIT 1',
        { replacements: { propertyId: property.id, state: state.toUpperCase() } }
      );
      complianceRecord = complianceResults?.[0] || null;

      // Query workflow state
      const [workflowResults] = await sequelize.query(
        'SELECT * FROM state_workflow_state WHERE deal_id = :dealId AND state = :state LIMIT 1',
        { replacements: { propertyId: property.id, state: state.toUpperCase() } }
      );
      workflowRecord = workflowResults?.[0] || null;
    } catch (error) {
      // Tables may not exist yet
      console.log('State compliance tables not yet created');
    }

    // Get disclosures from StateComplianceEngine (loads from JSON specs)
    const disclosures = stateComplianceEngine.getDisclosures(state);
    const requiredDisclosures = disclosures.filter(d => d.required);

    // Add Disclosures item (Phase 1 - Property Submission)
    if (requiredDisclosures.length > 0) {
      const disclosureResults = complianceRecord?.disclosure_results || {};
      const foundCount = Object.values(disclosureResults).filter(v => v === true).length;
      const totalCount = requiredDisclosures.length;
      const allFound = foundCount === totalCount;
      const someFound = foundCount > 0;

      items.push({
        id: 'compliance-disclosures',
        category: 'rule',
        name: `${state} Disclosures (${foundCount}/${totalCount})`,
        description: requiredDisclosures.map(d => d.name).join(', '),
        required: true,
        phase: 1, // Phase 1: Property Submission
        status: allFound ? 'complete' : (someFound ? 'partial' : (complianceRecord ? 'missing' : 'pending')),
        blocking: true,
        details: {
          disclosures: requiredDisclosures.map(d => ({
            disclosureId: d.disclosureId,
            name: d.name,
            legalCitation: d.legalCitation,
            found: disclosureResults[d.disclosureId] === true,
          })),
          phase4Status: complianceRecord?.phase4_status,
          disclosureScore: foundCount,
          totalDisclosures: totalCount,
        },
      });
    }

    // Add Contract Validation item (Phase 2 - Compliance Review)
    if (complianceRecord || currentPhase >= 1) {
      const contractChecks = [
        { key: 'buyer_matches_llc', name: 'Buyer matches LLC' },
        { key: 'seller_matches_records', name: 'Seller matches records' },
        { key: 'contract_assignable', name: 'Contract assignable' },
        { key: 'as_is_language', name: 'AS-IS language' },
        { key: 'contract_not_expired', name: 'Contract not expired' },
        { key: 'seller_signature_present', name: 'Seller signature' },
      ];

      const passedChecks = contractChecks.filter(c => complianceRecord?.[c.key] === true).length;
      const failedChecks = contractChecks.filter(c => complianceRecord?.[c.key] === false).length;
      const phase3Status = complianceRecord?.phase3_status;

      items.push({
        id: 'compliance-contract-validation',
        category: 'rule',
        name: `Contract Validation (${passedChecks}/${contractChecks.length})`,
        description: `${contractChecks.map(c => c.name).join(', ')}`,
        required: true,
        phase: 2, // Phase 2: Compliance Review & Approval
        status: phase3Status === 'GREEN' ? 'complete' :
                phase3Status === 'YELLOW' ? 'partial' :
                (failedChecks > 0 ? 'missing' : 'pending'),
        blocking: true,
        details: {
          checks: contractChecks.map(c => ({
            key: c.key,
            name: c.name,
            passed: complianceRecord?.[c.key],
          })),
          phase3Status,
        },
      });
    }

    // Add Overall Compliance Status (Phase 2 - Compliance Review)
    if (complianceRecord) {
      const overallStatus = complianceRecord.overall_status;
      items.push({
        id: 'compliance-overall',
        category: 'rule',
        name: `Overall: ${overallStatus || 'Pending'}`,
        description: `Can distribute: ${complianceRecord.can_distribute ? 'Yes' : 'No'}`,
        required: true,
        phase: 2, // Phase 2: Compliance Review & Approval
        status: overallStatus === 'GREEN' ? 'complete' :
                overallStatus === 'YELLOW' ? 'partial' :
                overallStatus === 'RED' ? 'missing' : 'pending',
        blocking: overallStatus !== 'GREEN',
        details: {
          overallStatus,
          canDistribute: complianceRecord.can_distribute,
          canExecuteAssignment: complianceRecord.can_execute_assignment,
          workflowPhase: workflowRecord?.current_phase,
          workflowBlocked: workflowRecord?.blocked,
          workflowBlockedReason: workflowRecord?.blocked_reason,
        },
      });
    }

    // Add Timing Validation item (Phase 4 - Offer Accepted / 3-Day Hold)
    if (currentPhase >= 4 || complianceRecord?.timing_valid !== undefined) {
      items.push({
        id: 'compliance-timing',
        category: 'rule',
        name: 'Timing Validation (3-Day Hold)',
        description: 'Contract acceptance → Cancellation delivery → 3-day statutory hold',
        required: true,
        phase: 4, // Phase 4: Offer Accepted / Pre-Buyer Ack
        status: complianceRecord?.timing_valid === true ? 'complete' :
                complianceRecord?.cancellation_acknowledged ? 'partial' : 'pending',
        blocking: true,
        details: {
          contractAcceptanceDate: complianceRecord?.contract_acceptance_date,
          cancellationDeliveryDate: complianceRecord?.cancellation_delivery_date,
          cancellationAcknowledged: complianceRecord?.cancellation_acknowledged,
          timingValid: complianceRecord?.timing_valid,
          canExecuteAssignment: complianceRecord?.can_execute_assignment,
        },
      });
    }

    // Add rules from state config (legacy support) - map old phases to new 7-phase structure
    const rules = stateConfig.rules?.filter((r: any) => r.phase <= currentPhase) || [];
    const rulesByPhase: { [key: number]: any[] } = {};
    rules.forEach((rule: any) => {
      // Map old 12-phase numbers to new 7-phase structure
      let mappedPhase = rule.phase;
      if (mappedPhase > 6) {
        // Old phases 7-11 map to new phases 3-6
        mappedPhase = Math.min(6, Math.floor(mappedPhase / 2));
      }
      if (!rulesByPhase[mappedPhase]) rulesByPhase[mappedPhase] = [];
      rulesByPhase[mappedPhase].push(rule);
    });

    for (const phase of Object.keys(rulesByPhase).sort()) {
      const phaseNum = parseInt(phase);
      // Skip phases we've already covered with specific items (1, 2, 4)
      if ([1, 2, 4].includes(phaseNum)) continue;

      const phaseRules = rulesByPhase[phaseNum];
      const criticalRules = phaseRules.filter((r: any) => r.blocking);

      // Check if phase is complete in workflow
      const phaseComplete = workflowRecord?.phase_completions?.[phaseNum] === true;

      items.push({
        id: `compliance-phase-${phase}`,
        category: 'rule',
        name: `Phase ${phase} Rules`,
        description: `${criticalRules.length} critical, ${phaseRules.length - criticalRules.length} warnings`,
        required: criticalRules.length > 0,
        phase: phaseNum,
        status: phaseComplete ? 'complete' : 'pending',
        blocking: criticalRules.length > 0 && !phaseComplete,
        details: {
          rules: phaseRules.map((r: any) => ({
            ruleId: r.ruleId,
            description: r.description,
            severity: r.severity,
          })),
        },
      });
    }

    const requiredCount = items.filter(i => i.required).length;
    const completedCount = items.filter(i => i.required && i.status === 'complete').length;
    const progress = requiredCount > 0 ? Math.round((completedCount / requiredCount) * 100) : 0;

    return {
      name: 'State Compliance',
      progress,
      items,
      requiredCount,
      completedCount,
    };
  }

  /**
   * Generate next steps based on checklist
   */
  private generateNextSteps(property: any, sections: ChecklistSection[], currentPhase: number): string[] {
    const nextSteps: string[] = [];

    // Find first incomplete item in each section
    for (const section of sections) {
      const firstIncomplete = section.items.find(
        item => item.required && (item.status === 'missing' || item.status === 'pending')
      );

      if (firstIncomplete) {
        if (firstIncomplete.blocking) {
          nextSteps.push(`🚨 BLOCKING: ${firstIncomplete.name} - ${firstIncomplete.description}`);
        } else {
          nextSteps.push(`⚠️  ${firstIncomplete.name} - ${firstIncomplete.description}`);
        }
      }
    }

    // If no blocking issues, suggest next phase
    if (nextSteps.filter(s => s.includes('BLOCKING')).length === 0) {
      nextSteps.push(`✅ Ready to proceed to Phase ${currentPhase + 1}`);
    }

    return nextSteps.slice(0, 5); // Return top 5 next steps
  }

  /**
   * Load state compliance configuration
   */
  private async loadStateConfig(state: string): Promise<any> {
    try {
      const { default: sequelize } = await import('../config/database');

      const [results] = await sequelize.query(
        'SELECT * FROM state_compliance_configs WHERE state = :state LIMIT 1',
        {
          replacements: { state },
        }
      );

      if (results && results.length > 0) {
        const config = results[0] as any;
        console.log(`Loaded compliance config for ${state}: ${config.contacts?.length || 0} contacts, ${config.documents?.length || 0} documents, ${config.rules?.length || 0} rules`);
        return config;
      }

      // Return default/empty config if not found
      console.warn(`No compliance config found for state ${state}, using defaults`);
      return {
        state,
        contacts: [],
        documents: [],
        rules: [],
        disclosures: [],
      };
    } catch (error) {
      console.error('Error loading state config:', error);
      // Return minimal default to prevent crashes
      return {
        state,
        contacts: [],
        documents: [],
        rules: [],
        disclosures: [],
      };
    }
  }
}

export const propertyChecklistService = new PropertyChecklistService();
export default propertyChecklistService;
