/**
 * Phase Contract Service (Stub)
 *
 * The StateDocumentTemplate model has been removed as part of compliance code cleanup.
 * This service previously handled automatic contract sending based on compliance phases.
 * All methods now return safe no-op results.
 */

// ============================================================================
// TYPES (preserved for backward compatibility with importing code)
// ============================================================================

export type DocumentCategory = string;
export type TriggerOn = 'phase_enter' | 'phase_complete' | 'manual';
export type SignerRole = 'seller' | 'buyer' | 'wholesaler' | 'broker';

export interface ContractRequirement {
  template: any;
  required: boolean;
  conditionsMet: boolean;
  alreadySent: boolean;
  submissionId?: number;
  submissionStatus?: string;
  missingSigners?: MissingSignerInfo[];
}

export interface Signer {
  email: string;
  name: string;
  role: SignerRole;
  phone?: string;
  contactId?: number;
  source?: string;
  verified?: boolean;
}

export interface MissingSignerInfo {
  role: SignerRole;
  reason: string;
  suggestedAction: string;
  attemptedSources: string[];
}

export interface SignerOverride {
  role: SignerRole;
  contactId?: number;
  email?: string;
  name?: string;
  phone?: string;
}

export interface ContractSendResult {
  success: boolean;
  templateId: number;
  templateName: string;
  category: DocumentCategory;
  submissionId?: number;
  signers?: Signer[];
  missingSigners?: MissingSignerInfo[];
  error?: string;
  sentAt?: Date;
}

export interface DealContext {
  dealId: number;
  state: string;
  property?: any;
  compliance?: any;
  contacts?: any[];
  llcProfile?: any;
  pipeline?: any;
  ocrData?: any;
  dealMatches?: any[];
  signerOverrides?: SignerOverride[];
  distributionChannels?: string[];
  transactionType?: string;
  _cachedAt?: number;
}

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
  invalidEmails: string[];
  missingSigners: MissingSignerInfo[];
  warnings: string[];
}

// ============================================================================
// SERVICE (Stub - StateDocumentTemplate model removed)
// ============================================================================

class PhaseContractService {
  /**
   * @deprecated StateDocumentTemplate model removed. Always returns empty array.
   */
  async getPhaseContracts(
    _dealId: number,
    _state: string,
    _phase: number
  ): Promise<ContractRequirement[]> {
    return [];
  }

  /**
   * @deprecated StateDocumentTemplate model removed. Always returns empty.
   */
  async checkSignerAvailability(
    _dealId: number,
    _template: any
  ): Promise<{ available: Signer[]; missing: MissingSignerInfo[] }> {
    return { available: [], missing: [] };
  }

  /**
   * @deprecated StateDocumentTemplate model removed. Always returns empty.
   */
  async getMissingSigners(
    _dealId: number,
    _templateId: number
  ): Promise<MissingSignerInfo[]> {
    return [];
  }

  /**
   * @deprecated StateDocumentTemplate model removed. Always returns failure.
   */
  async sendPhaseContract(
    _dealId: number,
    _state: string,
    _phase: number,
    _templateId?: number
  ): Promise<ContractSendResult> {
    return {
      success: false,
      templateId: _templateId || 0,
      templateName: 'N/A',
      category: 'other',
      error: 'StateDocumentTemplate model has been removed. Phase contract sending is no longer available.',
    };
  }

  /**
   * @deprecated StateDocumentTemplate model removed. Always returns empty.
   */
  async sendAllPhaseContracts(
    _dealId: number,
    _state: string,
    _phase: number,
    _triggerOn: TriggerOn = 'phase_enter'
  ): Promise<ContractSendResult[]> {
    return [];
  }

  /**
   * @deprecated StateDocumentTemplate model removed. Always returns true.
   */
  async arePhaseContractsSigned(
    _dealId: number,
    _state: string,
    _phase: number
  ): Promise<boolean> {
    return true;
  }

  /**
   * @deprecated StateDocumentTemplate model removed.
   */
  async getPhaseContractStatus(
    _dealId: number,
    _state: string,
    _phase: number
  ): Promise<{
    total: number;
    sent: number;
    signed: number;
    pending: number;
    allSigned: boolean;
    contracts: ContractRequirement[];
    missingSigners: MissingSignerInfo[];
  }> {
    return {
      total: 0,
      sent: 0,
      signed: 0,
      pending: 0,
      allSigned: true,
      contracts: [],
      missingSigners: [],
    };
  }

  /**
   * @deprecated StateDocumentTemplate model removed.
   */
  async retryFromDeadLetter(_deadLetterId: number): Promise<ContractSendResult> {
    return {
      success: false,
      templateId: 0,
      templateName: 'N/A',
      category: 'other',
      error: 'StateDocumentTemplate model has been removed.',
    };
  }

  /**
   * @deprecated StateDocumentTemplate model removed.
   */
  async getDeadLetterItems(_dealId?: number): Promise<any[]> {
    return [];
  }

  /**
   * @deprecated StateDocumentTemplate model removed.
   */
  async setSignerOverrides(
    _dealId: number,
    _state: string,
    _overrides: SignerOverride[]
  ): Promise<void> {
    // No-op
  }

  /**
   * @deprecated StateDocumentTemplate model removed.
   */
  async clearSignerOverrides(_dealId: number, _state: string): Promise<void> {
    // No-op
  }

  /**
   * @deprecated StateDocumentTemplate model removed.
   */
  async logContractEvent(
    _dealId: number,
    _action: string,
    _details: Record<string, any>
  ): Promise<void> {
    // No-op
  }
}

export const phaseContractService = new PhaseContractService();
export default phaseContractService;
