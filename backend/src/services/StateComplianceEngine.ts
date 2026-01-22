/**
 * Universal State Compliance Engine
 *
 * Loads state-specific compliance specs from JSON and applies rules
 * to deals. Works with any state - Oklahoma, Texas, Florida, etc.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPE DEFINITIONS (matching spec JSON structure)
// ============================================================================

export interface RequiredField {
  fieldName: string;
  displayName: string;
  dataType: 'string' | 'email' | 'phone' | 'number' | 'date' | 'boolean';
  required: boolean;
  validation?: string;
}

export interface ContactRequirement {
  category: string;
  role: string;
  requiredFields: RequiredField[];
  phase: number;
  blocking: boolean;
  storageTable: string;
}

export interface DocumentRequirement {
  documentType: string;
  officialName: string;
  category: string;
  required: boolean;
  phase: number;
  extractionFields: string[];
  retentionPeriod: string;
}

export interface ComplianceRule {
  ruleId: string;
  phase: number;
  description: string;
  validationType: string;
  validation: {
    field1?: string;
    field2?: string;
    operator?: string;
    expectedValue?: any;
    customLogic?: string;
  };
  blocking: boolean;
  severity: 'critical' | 'warning' | 'info';
  errorMessage: string;
  remediation: string;
}

export interface Disclosure {
  disclosureId: string;
  name: string;
  description: string;
  legalCitation: string;
  required: boolean;
  substanceRequired: boolean;
  keywords: string[];
  regexPattern: string;
}

export interface TimingRule {
  ruleId: string;
  description: string;
  eventA: string;
  eventB: string;
  relationship: string;
  dayBuffer?: number;
  blocking: boolean;
  blocksPhase: number | null;
}

export interface ExtractionProfile {
  state: string;
  category: string;
  name: string;
  description: string;
  fieldLabels: Record<string, string[]>;
  regexHints: Record<string, string>;
  promptOverrides: string;
  requiredFields: string[];
  minConfidence: number;
  priority: number;
}

export interface ScoringRules {
  green: {
    description: string;
    conditions: string[];
    permissions: { canDistribute: boolean; canExecuteAssignment: boolean };
  };
  yellow: {
    description: string;
    conditions: string[];
    permissions: { canDistribute: boolean; canExecuteAssignment: boolean };
    remediationAllowed: boolean;
    maxRemediationAttempts: number;
  };
  red: {
    description: string;
    conditions: string[];
    permissions: { canDistribute: boolean; canExecuteAssignment: boolean };
    autoReject: boolean;
  };
}

export interface BlockingGate {
  gateId: string;
  name: string;
  phase: number;
  blocksPhase: number;
  condition: string;
  errorMessage: string;
}

export interface StateComplianceSpec {
  state: string;
  county: string;
  version: string;
  metadata: {
    generatedBy: string;
    generatedAt: string;
    legalReferences: string[];
    notes: string;
  };
  contacts: ContactRequirement[];
  documents: DocumentRequirement[];
  rules: ComplianceRule[];
  disclosures: Disclosure[];
  timingRules: TimingRule[];
  extractionProfiles: ExtractionProfile[];
  scoringRules: ScoringRules;
  blockingGates: BlockingGate[];
  databaseSchema?: {
    complianceTableFields: Array<{
      fieldName: string;
      dataType: string;
      nullable: boolean;
      comment: string;
    }>;
  };
}

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export interface RuleValidationResult {
  ruleId: string;
  passed: boolean;
  phase: number;
  blocking: boolean;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  remediation?: string;
  evidence?: any;
}

export interface ContactValidationResult {
  category: string;
  role: string;
  phase: number;
  blocking: boolean;
  satisfied: boolean;
  missingFields: string[];
  contactId?: string;
}

export interface DocumentValidationResult {
  documentType: string;
  officialName: string;
  phase: number;
  required: boolean;
  uploaded: boolean;
  extracted: boolean;
  extractionConfidence?: number;
  missingFields: string[];
  documentId?: string;
}

export interface DisclosureValidationResult {
  disclosureId: string;
  name: string;
  required: boolean;
  found: boolean;
  evidence?: string;
  confidence?: number;
}

export interface PhaseValidationResult {
  phase: number;
  status: 'GREEN' | 'YELLOW' | 'RED' | 'INCOMPLETE';
  canProceed: boolean;
  blockedBy?: string;
  rules: RuleValidationResult[];
  contacts: ContactValidationResult[];
  documents: DocumentValidationResult[];
  disclosures?: DisclosureValidationResult[];
}

export interface DealComplianceResult {
  dealId: number;
  state: string;
  county: string;
  specVersion: string;
  currentPhase: number;
  overallStatus: 'GREEN' | 'YELLOW' | 'RED';
  canDistribute: boolean;
  canExecuteAssignment: boolean;
  disclosureScore: number;
  totalDisclosures: number;
  phases: PhaseValidationResult[];
  blockedGates: BlockingGate[];
  timestamp: Date;
}

// ============================================================================
// STATE COMPLIANCE ENGINE
// ============================================================================

class StateComplianceEngine {
  private specs: Map<string, StateComplianceSpec> = new Map();
  private specsDir: string;
  private initialized = false;

  constructor() {
    this.specsDir = path.join(__dirname, '../../compliance-specs');
  }

  /**
   * Initialize the engine by loading all state specs
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if specs directory exists
      if (!fs.existsSync(this.specsDir)) {
        console.warn(`Compliance specs directory not found: ${this.specsDir}`);
        this.initialized = true;
        return;
      }

      // Load all spec files
      const files = fs.readdirSync(this.specsDir).filter((f) => f.endsWith('.json'));

      for (const file of files) {
        try {
          const filePath = path.join(this.specsDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const spec: StateComplianceSpec = JSON.parse(content);

          // Key by state-county (e.g., "OK-ALL", "TX-HARRIS")
          const key = `${spec.state}-${spec.county}`.toUpperCase();
          this.specs.set(key, spec);
          console.log(`Loaded compliance spec: ${key} (v${spec.version})`);
        } catch (err) {
          console.error(`Failed to load spec ${file}:`, err);
        }
      }

      this.initialized = true;
      console.log(`StateComplianceEngine initialized with ${this.specs.size} specs`);
    } catch (err) {
      console.error('Failed to initialize StateComplianceEngine:', err);
      this.initialized = true; // Continue without specs
    }
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get list of available states
   */
  getAvailableStates(): string[] {
    return Array.from(this.specs.keys());
  }

  /**
   * Get spec for a state (and optionally county)
   */
  getSpec(state: string, county: string = 'ALL'): StateComplianceSpec | null {
    const key = `${state}-${county}`.toUpperCase();

    // Try exact match first
    if (this.specs.has(key)) {
      return this.specs.get(key)!;
    }

    // Fall back to state-wide spec
    const fallbackKey = `${state}-ALL`.toUpperCase();
    if (this.specs.has(fallbackKey)) {
      return this.specs.get(fallbackKey)!;
    }

    return null;
  }

  /**
   * Get contact requirements for a state/phase
   */
  getContactRequirements(state: string, phase?: number): ContactRequirement[] {
    const spec = this.getSpec(state);
    if (!spec) return [];

    if (phase === undefined) return spec.contacts;
    return spec.contacts.filter((c) => c.phase === phase);
  }

  /**
   * Get document requirements for a state/phase
   */
  getDocumentRequirements(state: string, phase?: number): DocumentRequirement[] {
    const spec = this.getSpec(state);
    if (!spec) return [];

    if (phase === undefined) return spec.documents;
    return spec.documents.filter((d) => d.phase === phase);
  }

  /**
   * Get disclosures for a state
   */
  getDisclosures(state: string): Disclosure[] {
    const spec = this.getSpec(state);
    if (!spec) return [];
    return spec.disclosures;
  }

  /**
   * Get rules for a state/phase
   */
  getRules(state: string, phase?: number): ComplianceRule[] {
    const spec = this.getSpec(state);
    if (!spec) return [];

    if (phase === undefined) return spec.rules;
    return spec.rules.filter((r) => r.phase === phase);
  }

  /**
   * Get blocking gates for a state
   */
  getBlockingGates(state: string): BlockingGate[] {
    const spec = this.getSpec(state);
    if (!spec) return [];
    return spec.blockingGates;
  }

  /**
   * Get extraction profile for a document category
   */
  getExtractionProfile(state: string, category: string): ExtractionProfile | null {
    const spec = this.getSpec(state);
    if (!spec) return null;

    return spec.extractionProfiles.find(
      (p) => p.category.toLowerCase() === category.toLowerCase()
    ) || null;
  }

  /**
   * Calculate disclosure score from boolean fields
   */
  calculateDisclosureScore(
    state: string,
    disclosureResults: Record<string, boolean>
  ): { score: number; total: number; percentage: number } {
    const spec = this.getSpec(state);
    if (!spec) return { score: 0, total: 0, percentage: 0 };

    const total = spec.disclosures.filter((d) => d.required).length;
    const score = spec.disclosures
      .filter((d) => d.required)
      .filter((d) => {
        // Map disclosure ID to field name (e.g., OK-D1 -> disclosure_not_licensed_broker)
        const fieldName = this.disclosureIdToFieldName(d.disclosureId, state);
        return disclosureResults[fieldName] === true;
      }).length;

    return {
      score,
      total,
      percentage: total > 0 ? Math.round((score / total) * 100) : 0,
    };
  }

  /**
   * Map disclosure ID to database field name
   */
  private disclosureIdToFieldName(disclosureId: string, state: string): string {
    // Pattern: OK-D1 -> disclosure_not_licensed_broker
    // This mapping should come from the spec or a lookup table
    const spec = this.getSpec(state);
    if (!spec) return '';

    const disclosure = spec.disclosures.find((d) => d.disclosureId === disclosureId);
    if (!disclosure) return '';

    // Convert name to snake_case field name
    return (
      'disclosure_' +
      disclosure.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    );
  }

  /**
   * Determine overall status based on phase statuses
   */
  determineOverallStatus(
    phase3Status: 'GREEN' | 'YELLOW' | 'RED' | null,
    disclosureScore: number,
    totalDisclosures: number,
    state: string
  ): 'GREEN' | 'YELLOW' | 'RED' {
    const spec = this.getSpec(state);
    if (!spec) return 'RED';

    // If phase 3 (contract validation) failed, overall is RED
    if (phase3Status === 'RED') return 'RED';

    // Calculate disclosure percentage
    const percentage = totalDisclosures > 0 ? disclosureScore / totalDisclosures : 0;

    // Apply scoring rules
    if (phase3Status === 'GREEN' && percentage === 1) {
      return 'GREEN';
    } else if (percentage >= 0.5) {
      return 'YELLOW';
    } else {
      return 'RED';
    }
  }

  /**
   * Check if a gate is blocking
   */
  isGateBlocking(
    state: string,
    currentPhase: number,
    targetPhase: number,
    context: Record<string, any>
  ): { blocked: boolean; gate?: BlockingGate; reason?: string } {
    // OKLAHOMA: Special check for 3-day statutory hold (Phase 4 → Phase 5)
    // After seller signs acknowledgment in Phase 4, there's a mandatory 3-day waiting period
    // before buyer contracts (Phase 5) can be executed
    if (state.toUpperCase() === 'OK' && currentPhase === 4 && targetPhase === 5) {
      const holdExpiresAt = context.statutoryHoldExpiresAt;
      if (holdExpiresAt) {
        const expiresDate = new Date(holdExpiresAt);
        if (expiresDate > new Date()) {
          const hoursRemaining = Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60));
          return {
            blocked: true,
            gate: {
              gateId: 'OK-GATE-5-HOLD',
              name: '3-Day Statutory Hold',
              phase: 4,
              blocksPhase: 5,
              condition: 'statutoryHoldExpired',
              errorMessage: `Oklahoma requires a 3-day waiting period after seller acknowledgment. ${hoursRemaining} hours remaining until ${expiresDate.toLocaleDateString()}.`,
            },
            reason: `3-day statutory hold in effect. Expires at ${expiresDate.toISOString()}`,
          };
        }
      } else if (!context.sellerAcknowledgmentDate) {
        // Seller acknowledgment not yet signed - can't even start the hold
        return {
          blocked: true,
          gate: {
            gateId: 'OK-GATE-5-ACK',
            name: 'Seller Acknowledgment Required',
            phase: 4,
            blocksPhase: 5,
            condition: 'sellerAcknowledgmentSigned',
            errorMessage: 'Seller must sign acknowledgment before proceeding to buyer contract execution.',
          },
          reason: 'Seller acknowledgment not yet signed',
        };
      }
    }

    const gates = this.getBlockingGates(state);

    for (const gate of gates) {
      // Check if this gate applies to this phase transition
      if (gate.phase <= currentPhase && gate.blocksPhase === targetPhase) {
        // For now, return blocked - actual condition evaluation would need more context
        // In a full implementation, we'd evaluate gate.condition against context
        return {
          blocked: true,
          gate,
          reason: gate.errorMessage,
        };
      }
    }

    return { blocked: false };
  }

  /**
   * Get phases required before a target phase
   */
  getPhasePrerequisites(state: string, targetPhase: number): number[] {
    const spec = this.getSpec(state);
    if (!spec) return [];

    // Build dependency map from rules and gates
    const prerequisites: Set<number> = new Set();

    // Add phases that have blocking rules
    for (const gate of spec.blockingGates) {
      if (gate.blocksPhase === targetPhase) {
        prerequisites.add(gate.phase);
      }
    }

    // Also add any phases between 0 and target
    for (let p = 0; p < targetPhase; p++) {
      const phaseRules = spec.rules.filter((r) => r.phase === p && r.blocking);
      if (phaseRules.length > 0) {
        prerequisites.add(p);
      }
    }

    return Array.from(prerequisites).sort((a, b) => a - b);
  }

  /**
   * Get max phase number for a state
   */
  getMaxPhase(state: string): number {
    const spec = this.getSpec(state);
    if (!spec) return 11;

    let maxPhase = 0;
    for (const rule of spec.rules) {
      if (rule.phase > maxPhase) maxPhase = rule.phase;
    }
    for (const contact of spec.contacts) {
      if (contact.phase > maxPhase) maxPhase = contact.phase;
    }
    for (const doc of spec.documents) {
      if (doc.phase > maxPhase) maxPhase = doc.phase;
    }

    return maxPhase;
  }

  /**
   * Validate a disclosure against text content using spec patterns
   */
  validateDisclosure(
    state: string,
    disclosureId: string,
    textContent: string
  ): { found: boolean; evidence?: string; confidence: number } {
    const spec = this.getSpec(state);
    if (!spec) return { found: false, confidence: 0 };

    const disclosure = spec.disclosures.find((d) => d.disclosureId === disclosureId);
    if (!disclosure) return { found: false, confidence: 0 };

    // Try regex pattern first
    try {
      // Remove regex delimiters and flags
      const pattern = disclosure.regexPattern.replace(/^\/|\/[gimsuvy]*$/g, '');
      const flags = disclosure.regexPattern.match(/\/([gimsuvy]*)$/)?.[1] || 'i';
      const regex = new RegExp(pattern, flags);

      const match = textContent.match(regex);
      if (match) {
        return {
          found: true,
          evidence: match[0].substring(0, 200), // Limit evidence length
          confidence: 0.9,
        };
      }
    } catch (err) {
      console.warn(`Invalid regex for ${disclosureId}:`, err);
    }

    // Fall back to keyword search
    const lowerContent = textContent.toLowerCase();
    for (const keyword of disclosure.keywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        return {
          found: true,
          evidence: keyword,
          confidence: 0.7,
        };
      }
    }

    return { found: false, confidence: 0 };
  }

  /**
   * Validate all disclosures in document content
   */
  validateAllDisclosures(
    state: string,
    textContent: string
  ): DisclosureValidationResult[] {
    const disclosures = this.getDisclosures(state);
    return disclosures.map((disclosure) => {
      const result = this.validateDisclosure(state, disclosure.disclosureId, textContent);
      return {
        disclosureId: disclosure.disclosureId,
        name: disclosure.name,
        required: disclosure.required,
        found: result.found,
        evidence: result.evidence,
        confidence: result.confidence,
      };
    });
  }

  /**
   * Get timing rules for a state
   */
  getTimingRules(state: string): TimingRule[] {
    const spec = this.getSpec(state);
    if (!spec) return [];
    return spec.timingRules;
  }

  /**
   * Validate timing between events
   */
  validateTiming(
    state: string,
    events: Record<string, Date>
  ): { valid: boolean; violations: string[] } {
    const timingRules = this.getTimingRules(state);
    const violations: string[] = [];

    for (const rule of timingRules) {
      const dateA = events[rule.eventA];
      const dateB = events[rule.eventB];

      if (!dateA || !dateB) continue;

      switch (rule.relationship) {
        case 'before':
          if (dateA >= dateB) {
            violations.push(`${rule.description}: ${rule.eventA} must be before ${rule.eventB}`);
          }
          break;
        case 'after':
          if (dateA <= dateB) {
            violations.push(`${rule.description}: ${rule.eventA} must be after ${rule.eventB}`);
          }
          break;
        case 'within_days':
          const diffDays = Math.abs(dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24);
          if (rule.dayBuffer && diffDays > rule.dayBuffer) {
            violations.push(
              `${rule.description}: ${rule.eventA} and ${rule.eventB} must be within ${rule.dayBuffer} days`
            );
          }
          break;
      }
    }

    return {
      valid: violations.filter((_, i) => {
        const rule = timingRules[i];
        return rule?.blocking;
      }).length === 0,
      violations,
    };
  }

  /**
   * Get summary of state requirements
   */
  getStateSummary(state: string): {
    state: string;
    totalContacts: number;
    totalDocuments: number;
    totalRules: number;
    totalDisclosures: number;
    requiredDisclosures: number;
    maxPhase: number;
    blockingGates: number;
    legalReferences: string[];
  } | null {
    const spec = this.getSpec(state);
    if (!spec) return null;

    return {
      state: spec.state,
      totalContacts: spec.contacts.length,
      totalDocuments: spec.documents.length,
      totalRules: spec.rules.length,
      totalDisclosures: spec.disclosures.length,
      requiredDisclosures: spec.disclosures.filter((d) => d.required).length,
      maxPhase: this.getMaxPhase(state),
      blockingGates: spec.blockingGates.length,
      legalReferences: spec.metadata.legalReferences,
    };
  }

  // ========================================================================
  // PHASE 1: TRANSACTION TYPE VALIDATION
  // ========================================================================

  /**
   * Get allowed transaction types for a state
   */
  getAllowedTransactionTypes(state: string): {
    type: string;
    label: string;
    allowed: boolean;
    reason?: string;
  }[] {
    // Oklahoma supports wholesale and double closing
    if (state === 'OK') {
      return [
        { type: 'wholesale', label: 'Wholesale (Assignment)', allowed: true },
        { type: 'double_closing', label: 'Double Closing', allowed: true },
        {
          type: 'novation',
          label: 'Novation',
          allowed: false,
          reason: 'Novation not allowed in Oklahoma pilot program',
        },
      ];
    }

    // Default for other states
    return [
      { type: 'wholesale', label: 'Wholesale (Assignment)', allowed: true },
      { type: 'novation', label: 'Novation', allowed: true },
      { type: 'double_closing', label: 'Double Closing', allowed: true },
    ];
  }

  /**
   * Validate transaction type for a state
   */
  validateTransactionType(
    state: string,
    transactionType: string
  ): { valid: boolean; error?: string } {
    const allowed = this.getAllowedTransactionTypes(state);
    const typeConfig = allowed.find((t) => t.type === transactionType);

    if (!typeConfig) {
      return { valid: false, error: `Unknown transaction type: ${transactionType}` };
    }

    if (!typeConfig.allowed) {
      return { valid: false, error: typeConfig.reason };
    }

    return { valid: true };
  }

  // ========================================================================
  // PHASE 6: DISTRIBUTION CHANNEL VALIDATION
  // ========================================================================

  /**
   * Get available distribution channels for a state
   */
  getDistributionChannelOptions(state: string): {
    channel: string;
    label: string;
    description: string;
    requiresAgreement?: string;
    notes?: string;
  }[] {
    // Standard channels available for all states
    return [
      {
        channel: 'auction',
        label: 'Auction Services',
        description: 'List on auction platforms like Hubzu',
        requiresAgreement: 'ASA',
        notes: 'Requires Auction Services Agreement (ASA). Cash wholesale deals only.',
      },
      {
        channel: 'funds',
        label: 'Funds/Institutional Buyers',
        description: 'Distribute to hedge funds and institutional buyers',
        requiresAgreement: 'MSA',
        notes: 'Requires Marketing Services Agreement (MSA)',
      },
      {
        channel: 'private_buyers',
        label: 'Private Buyer Network',
        description: 'Distribute to vetted private buyer network',
        requiresAgreement: 'MSA',
        notes: 'Requires Marketing Services Agreement (MSA)',
      },
    ];
  }

  /**
   * Validate distribution channel selection
   */
  validateDistributionChannels(
    state: string,
    channels: string[]
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (channels.length === 0) {
      errors.push('At least one distribution channel must be selected');
      return { valid: false, errors, warnings };
    }

    const availableChannels = this.getDistributionChannelOptions(state);
    const validChannelIds = availableChannels.map((c) => c.channel);

    for (const channel of channels) {
      if (!validChannelIds.includes(channel)) {
        errors.push(`Unknown distribution channel: ${channel}`);
      }
    }

    // Add warnings for specific channel combinations
    if (channels.includes('auction')) {
      warnings.push('Auction channel requires ASA agreement and cash-only deals');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Get required agreements based on selected channels
   */
  getRequiredAgreements(state: string, channels: string[]): string[] {
    const agreements = new Set<string>();

    // MSA is always required if any channel is selected
    if (channels.length > 0) {
      agreements.add('MSA');
    }

    // ASA is required if auction channel is selected
    if (channels.includes('auction')) {
      agreements.add('ASA');
    }

    return Array.from(agreements);
  }

  // ========================================================================
  // PHASE 8: BROKER REVIEW HELPERS
  // ========================================================================

  /**
   * Get broker decision options
   */
  getBrokerDecisionOptions(): {
    decision: string;
    label: string;
    description: string;
    requiresNotes: boolean;
  }[] {
    return [
      {
        decision: 'approved',
        label: 'Approved',
        description: 'Deal meets all compliance requirements and is approved for distribution',
        requiresNotes: false,
      },
      {
        decision: 'rejected',
        label: 'Rejected',
        description: 'Deal does not meet compliance requirements and cannot proceed',
        requiresNotes: true,
      },
      {
        decision: 'needs_info',
        label: 'Needs More Information',
        description: 'Additional information or documents are needed before a decision can be made',
        requiresNotes: true,
      },
    ];
  }

  /**
   * Validate broker review submission
   */
  validateBrokerReview(
    decision: string,
    notes?: string
  ): { valid: boolean; error?: string } {
    const options = this.getBrokerDecisionOptions();
    const decisionConfig = options.find((o) => o.decision === decision);

    if (!decisionConfig) {
      return { valid: false, error: `Invalid decision: ${decision}` };
    }

    if (decisionConfig.requiresNotes && (!notes || notes.trim().length < 10)) {
      return {
        valid: false,
        error: `Notes are required for ${decisionConfig.label} decision (minimum 10 characters)`,
      };
    }

    return { valid: true };
  }

  // ========================================================================
  // PHASE 9: DISTRIBUTION STATUS HELPERS
  // ========================================================================

  /**
   * Get distribution status options
   */
  getDistributionStatusOptions(): {
    status: string;
    label: string;
    description: string;
  }[] {
    return [
      {
        status: 'pending',
        label: 'Pending',
        description: 'Distribution has not yet started',
      },
      {
        status: 'in_progress',
        label: 'In Progress',
        description: 'Deal is currently being distributed to selected channels',
      },
      {
        status: 'completed',
        label: 'Completed',
        description: 'Distribution has been completed to all channels',
      },
      {
        status: 'failed',
        label: 'Failed',
        description: 'Distribution failed due to an error',
      },
    ];
  }
}

// Export singleton instance
export const stateComplianceEngine = new StateComplianceEngine();
export default stateComplianceEngine;
