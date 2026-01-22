/**
 * State Compliance Hooks
 *
 * React Query hooks for universal state-based compliance workflow.
 * Works with any state - Oklahoma, Texas, Florida, etc.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ============================================================================
// TYPES
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

export interface BlockingGate {
  gateId: string;
  name: string;
  phase: number;
  blocksPhase: number;
  condition: string;
  errorMessage: string;
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

// Phase 1: Transaction Types
export type TransactionType = 'wholesale' | 'novation' | 'double_closing';

export interface TransactionTypeOption {
  type: TransactionType;
  label: string;
  allowed: boolean;
  reason?: string;
}

// Phase 6: Distribution Channels
export type DistributionChannel = 'auction' | 'funds' | 'private_buyers';

export interface DistributionChannelOption {
  channel: DistributionChannel;
  label: string;
  description: string;
  requiresAgreement?: string;
}

// Phase 8: Broker Review
export type BrokerDecision = 'pending' | 'approved' | 'rejected' | 'needs_info';

export interface BrokerDecisionOption {
  decision: BrokerDecision;
  label: string;
  description: string;
  requiresNotes: boolean;
}

// Phase 9: Distribution Status
export type DistributionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface DistributionStatusOption {
  status: DistributionStatus;
  label: string;
  description: string;
}

export interface StateSummary {
  state: string;
  totalContacts: number;
  totalDocuments: number;
  totalRules: number;
  totalDisclosures: number;
  requiredDisclosures: number;
  maxPhase: number;
  blockingGates: number;
  legalReferences: string[];
}

export interface DealCompliance {
  id: number;
  dealId: number;
  llcId: number;
  state: string;
  county?: string;
  specVersion?: string;
  phase3Status?: 'GREEN' | 'YELLOW' | 'RED' | null;
  buyerMatchesLlc?: boolean;
  sellerMatchesRecords?: boolean;
  contractAssignable?: boolean;
  asIsLanguage?: boolean;
  contractNotExpired?: boolean;
  sellerSignaturePresent?: boolean;
  phase3Details?: Record<string, any>;
  phase4Status?: 'GREEN' | 'YELLOW' | 'RED' | null;
  disclosureScore?: number;
  totalDisclosures?: number;
  disclosureResults?: Record<string, boolean>;
  disclosureEvidence?: Record<string, string>;
  phase4Details?: Record<string, any>;
  overallStatus?: 'GREEN' | 'YELLOW' | 'RED' | null;
  contractAcceptanceDate?: string;
  cancellationDeliveryDate?: string;
  cancellationAcknowledged?: boolean;
  timingValid?: boolean;
  phase10Details?: Record<string, any>;
  assignmentExecutionDate?: string;
  assignmentFee?: number;
  assigneeName?: string;
  assigneeEntityType?: string;
  phase11Details?: Record<string, any>;
  canDistribute: boolean;
  canExecuteAssignment: boolean;
  stateSpecificData?: Record<string, any>;
  remediationAttempts?: number;
  lastRemediationAt?: string;
  // Phase 1: Transaction Type
  transactionType?: TransactionType;
  // Phase 8: Broker Review
  brokerReviewed?: boolean;
  brokerReviewedBy?: string;
  brokerReviewedAt?: string;
  brokerDecision?: BrokerDecision;
  brokerNotes?: string;
  // Phase 9: Distribution Status
  distributionStartedAt?: string;
  distributionStatus?: DistributionStatus;
  distributionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowState {
  id: number;
  dealId: number;
  state: string;
  county?: string;
  currentPhase: number;
  maxPhase: number;
  phaseCompletions: Record<number, boolean>;
  phaseCompletedAt: Record<number, string>;
  blocked: boolean;
  blockedReason?: string;
  blockedAtPhase?: number;
  blockedByGate?: string;
  startedAt?: string;
  lastAdvancedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export interface DisclosureValidationResult {
  disclosureId: string;
  name: string;
  required: boolean;
  found: boolean;
  evidence?: string;
  confidence?: number;
}

// ============================================================================
// STATE SPEC HOOKS
// ============================================================================

export function useAvailableStates() {
  return useQuery({
    queryKey: ['state-compliance', 'states'],
    queryFn: () =>
      api.get<{ success: boolean; data: string[]; count: number }>(
        '/api/state-compliance/states'
      ),
  });
}

export function useStateSummary(state: string) {
  return useQuery({
    queryKey: ['state-compliance', 'summary', state],
    queryFn: () =>
      api.get<{ success: boolean; data: StateSummary }>(
        `/api/state-compliance/states/${state}`
      ),
    enabled: !!state,
  });
}

export function useStateContacts(state: string, phase?: number) {
  return useQuery({
    queryKey: ['state-compliance', 'contacts', state, phase],
    queryFn: () => {
      const url = phase !== undefined
        ? `/api/state-compliance/states/${state}/contacts?phase=${phase}`
        : `/api/state-compliance/states/${state}/contacts`;
      return api.get<{ success: boolean; data: ContactRequirement[]; count: number }>(url);
    },
    enabled: !!state,
  });
}

export function useStateDocuments(state: string, phase?: number) {
  return useQuery({
    queryKey: ['state-compliance', 'documents', state, phase],
    queryFn: () => {
      const url = phase !== undefined
        ? `/api/state-compliance/states/${state}/documents?phase=${phase}`
        : `/api/state-compliance/states/${state}/documents`;
      return api.get<{ success: boolean; data: DocumentRequirement[]; count: number }>(url);
    },
    enabled: !!state,
  });
}

export function useStateDisclosures(state: string) {
  return useQuery({
    queryKey: ['state-compliance', 'disclosures', state],
    queryFn: () =>
      api.get<{
        success: boolean;
        data: Disclosure[];
        count: number;
        requiredCount: number;
      }>(`/api/state-compliance/states/${state}/disclosures`),
    enabled: !!state,
  });
}

export function useStateRules(state: string, phase?: number) {
  return useQuery({
    queryKey: ['state-compliance', 'rules', state, phase],
    queryFn: () => {
      const url = phase !== undefined
        ? `/api/state-compliance/states/${state}/rules?phase=${phase}`
        : `/api/state-compliance/states/${state}/rules`;
      return api.get<{
        success: boolean;
        data: ComplianceRule[];
        count: number;
        blockingCount: number;
      }>(url);
    },
    enabled: !!state,
  });
}

export function useStateGates(state: string) {
  return useQuery({
    queryKey: ['state-compliance', 'gates', state],
    queryFn: () =>
      api.get<{ success: boolean; data: BlockingGate[]; count: number }>(
        `/api/state-compliance/states/${state}/gates`
      ),
    enabled: !!state,
  });
}

export function useStateExtractionProfiles(state: string) {
  return useQuery({
    queryKey: ['state-compliance', 'extraction-profiles', state],
    queryFn: () =>
      api.get<{ success: boolean; data: ExtractionProfile[]; count: number }>(
        `/api/state-compliance/states/${state}/extraction-profiles`
      ),
    enabled: !!state,
  });
}

export function useStateTransactionTypes(state: string) {
  return useQuery({
    queryKey: ['state-compliance', 'transaction-types', state],
    queryFn: () =>
      api.get<{ success: boolean; data: TransactionTypeOption[]; state: string }>(
        `/api/state-compliance/states/${state}/transaction-types`
      ),
    enabled: !!state,
  });
}

export function useStateDistributionChannels(state: string) {
  return useQuery({
    queryKey: ['state-compliance', 'distribution-channels', state],
    queryFn: () =>
      api.get<{
        success: boolean;
        data: DistributionChannelOption[];
        state: string;
      }>(`/api/state-compliance/states/${state}/distribution-channels`),
    enabled: !!state,
  });
}

export function useStateBrokerDecisions(state: string) {
  return useQuery({
    queryKey: ['state-compliance', 'broker-decisions', state],
    queryFn: () =>
      api.get<{
        success: boolean;
        data: BrokerDecisionOption[];
        state: string;
      }>(`/api/state-compliance/states/${state}/broker-decisions`),
    enabled: !!state,
  });
}

// ============================================================================
// DEAL COMPLIANCE HOOKS
// ============================================================================

export function useDealCompliance(dealId: number | string) {
  return useQuery({
    queryKey: ['state-compliance', 'deal', dealId],
    queryFn: () =>
      api.get<{
        success: boolean;
        data: { compliance: DealCompliance; workflow: WorkflowState };
      }>(`/api/state-compliance/deals/${dealId}`),
    enabled: !!dealId,
  });
}

export function useInitializeDealCompliance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      state,
      llcId,
      county,
    }: {
      dealId: number;
      state: string;
      llcId: number;
      county?: string;
    }) =>
      api.post<{
        success: boolean;
        data: {
          compliance: DealCompliance;
          workflow: WorkflowState;
          spec: {
            state: string;
            version: string;
            totalContacts: number;
            totalDocuments: number;
            totalDisclosures: number;
            requiredDisclosures: number;
          };
        };
      }>(`/api/state-compliance/deals/${dealId}/initialize`, {
        state,
        llcId,
        county,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
    },
  });
}

export function useUpdatePhase3() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      ...data
    }: {
      dealId: number;
      buyerMatchesLlc?: boolean;
      sellerMatchesRecords?: boolean;
      contractAssignable?: boolean;
      asIsLanguage?: boolean;
      contractNotExpired?: boolean;
      sellerSignaturePresent?: boolean;
      details?: Record<string, any>;
    }) =>
      api.post<{
        success: boolean;
        data: {
          phase3Status: 'GREEN' | 'YELLOW' | 'RED';
          overallStatus: 'GREEN' | 'YELLOW' | 'RED' | null;
          canDistribute: boolean;
        };
      }>(`/api/state-compliance/deals/${dealId}/phase3`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
    },
  });
}

export function useUpdateDisclosures() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      disclosureResults,
      disclosureEvidence,
    }: {
      dealId: number;
      disclosureResults: Record<string, boolean>;
      disclosureEvidence?: Record<string, string>;
    }) =>
      api.post<{
        success: boolean;
        data: {
          phase4Status: 'GREEN' | 'YELLOW' | 'RED';
          disclosureScore: number;
          totalDisclosures: number;
          overallStatus: 'GREEN' | 'YELLOW' | 'RED' | null;
          canDistribute: boolean;
        };
      }>(`/api/state-compliance/deals/${dealId}/disclosures`, {
        disclosureResults,
        disclosureEvidence,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
    },
  });
}

export function useValidateDisclosuresFromText() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, textContent }: { dealId: number; textContent: string }) =>
      api.post<{
        success: boolean;
        data: {
          results: DisclosureValidationResult[];
          phase4Status: 'GREEN' | 'YELLOW' | 'RED';
          disclosureScore: number;
          totalDisclosures: number;
          overallStatus: 'GREEN' | 'YELLOW' | 'RED' | null;
          canDistribute: boolean;
        };
      }>(`/api/state-compliance/deals/${dealId}/validate-disclosures`, {
        textContent,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
    },
  });
}

export function useUpdateTiming() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      contractAcceptanceDate,
      cancellationDeliveryDate,
      cancellationAcknowledged,
      assignmentExecutionDate,
    }: {
      dealId: number;
      contractAcceptanceDate?: string;
      cancellationDeliveryDate?: string;
      cancellationAcknowledged?: boolean;
      assignmentExecutionDate?: string;
    }) =>
      api.post<{
        success: boolean;
        data: {
          timingValid: boolean;
          canExecuteAssignment: boolean;
        };
      }>(`/api/state-compliance/deals/${dealId}/timing`, {
        contractAcceptanceDate,
        cancellationDeliveryDate,
        cancellationAcknowledged,
        assignmentExecutionDate,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
    },
  });
}

export function useRecordAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      assigneeName,
      assigneeEntityType,
      assignmentFee,
      assignmentExecutionDate,
      details,
    }: {
      dealId: number;
      assigneeName: string;
      assigneeEntityType?: string;
      assignmentFee?: number;
      assignmentExecutionDate?: string;
      details?: Record<string, any>;
    }) =>
      api.post<{
        success: boolean;
        data: {
          assignmentRecorded: boolean;
          timingValid: boolean;
          assigneeName: string;
          assignmentFee: number;
        };
      }>(`/api/state-compliance/deals/${dealId}/assignment`, {
        assigneeName,
        assigneeEntityType,
        assignmentFee,
        assignmentExecutionDate,
        details,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
    },
  });
}

// ============================================================================
// PHASE-SPECIFIC MUTATION HOOKS
// ============================================================================

/**
 * Phase 1: Update Transaction Type
 */
export function useUpdatePhase1() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      transactionType,
    }: {
      dealId: number;
      transactionType: TransactionType;
    }) =>
      api.post<{
        success: boolean;
        data: {
          transactionType: TransactionType;
          allowed: boolean;
          message: string;
        };
      }>(`/api/state-compliance/deals/${dealId}/phase1`, {
        transactionType,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'workflow', variables.dealId],
      });
    },
  });
}

/**
 * Phase 6: Update Distribution Channels
 */
export function useUpdatePhase6() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      distributionChannels,
    }: {
      dealId: number;
      distributionChannels: DistributionChannel[];
    }) =>
      api.post<{
        success: boolean;
        data: {
          distributionChannels: DistributionChannel[];
          requiredAgreements: string[];
          message: string;
        };
      }>(`/api/state-compliance/deals/${dealId}/phase6`, {
        distributionChannels,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'workflow', variables.dealId],
      });
    },
  });
}

/**
 * Phase 8: Record Broker Review
 */
export function useUpdatePhase8() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      reviewedBy,
      decision,
      notes,
    }: {
      dealId: number;
      reviewedBy: string;
      decision: BrokerDecision;
      notes?: string;
    }) =>
      api.post<{
        success: boolean;
        data: {
          brokerReviewed: boolean;
          brokerReviewedBy: string;
          brokerReviewedAt: string;
          brokerDecision: BrokerDecision;
          canDistribute: boolean;
          message: string;
        };
      }>(`/api/state-compliance/deals/${dealId}/phase8`, {
        reviewedBy,
        decision,
        notes,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'workflow', variables.dealId],
      });
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'gates', variables.dealId],
      });
    },
  });
}

/**
 * Phase 9: Update Distribution Status
 */
export function useUpdatePhase9() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      action,
      notes,
    }: {
      dealId: number;
      action: 'start' | 'complete' | 'fail';
      notes?: string;
    }) =>
      api.post<{
        success: boolean;
        data: {
          distributionStatus: DistributionStatus;
          distributionStartedAt?: string;
          message: string;
        };
      }>(`/api/state-compliance/deals/${dealId}/phase9`, {
        action,
        notes,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'workflow', variables.dealId],
      });
    },
  });
}

// ============================================================================
// WORKFLOW HOOKS
// ============================================================================

export function useDealWorkflow(dealId: number | string) {
  return useQuery({
    queryKey: ['state-compliance', 'workflow', dealId],
    queryFn: () =>
      api.get<{
        success: boolean;
        data: {
          workflow: WorkflowState;
          completionPercentage: number;
          incompletePhases: number[];
          completedPhasesInOrder: Array<{ phase: number; completedAt: string }>;
        };
      }>(`/api/state-compliance/deals/${dealId}/workflow`),
    enabled: !!dealId,
  });
}

export function useCompletePhase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, phase }: { dealId: number; phase: number }) =>
      api.post<{
        success: boolean;
        data: {
          currentPhase: number;
          phaseCompletions: Record<number, boolean>;
          completionPercentage: number;
        };
      }>(`/api/state-compliance/deals/${dealId}/workflow/complete-phase`, {
        phase,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'deal', variables.dealId],
      });
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'workflow', variables.dealId],
      });
    },
  });
}

export function useBlockWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      reason,
      gateId,
    }: {
      dealId: number;
      reason: string;
      gateId?: string;
    }) =>
      api.post<{
        success: boolean;
        data: {
          blocked: boolean;
          blockedReason: string;
          blockedAtPhase: number;
          blockedByGate?: string;
        };
      }>(`/api/state-compliance/deals/${dealId}/workflow/block`, {
        reason,
        gateId,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'workflow', variables.dealId],
      });
    },
  });
}

export function useUnblockWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId }: { dealId: number }) =>
      api.post<{
        success: boolean;
        data: {
          blocked: boolean;
          currentPhase: number;
        };
      }>(`/api/state-compliance/deals/${dealId}/workflow/unblock`, {}),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'workflow', variables.dealId],
      });
    },
  });
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Oklahoma 7-Phase Compliance Structure
export const PHASE_NAMES: Record<number, string> = {
  0: 'Account Setup & Entity Verification',
  1: 'Property Submission',
  2: 'Compliance Review & Approval',
  3: 'Approved / Pre-Distribution',
  4: 'Offer Accepted / Pre-Buyer Ack',
  5: 'Buyer Contract Execution',
  6: 'Title, Closing & Settlement',
};

export const STATUS_COLORS: Record<string, string> = {
  GREEN: 'bg-green-500',
  YELLOW: 'bg-yellow-500',
  RED: 'bg-red-500',
};

export const STATUS_TEXT_COLORS: Record<string, string> = {
  GREEN: 'text-green-400',
  YELLOW: 'text-yellow-400',
  RED: 'text-red-400',
};

// ============================================================================
// CONTRACT HOOKS
// ============================================================================

export interface PhaseContract {
  phase: number;
  templateId: number;
  templateName: string;
  category: string;
  required: boolean;
  conditionsMet: boolean;
  alreadySent: boolean;
  submissionStatus?: 'pending' | 'sent' | 'viewed' | 'completed' | 'declined' | 'expired';
  submissionId?: number;
  sentAt?: string;
  completedAt?: string;
}

export interface PhaseContractStatus {
  allSigned: boolean;
  contracts: Array<{
    templateId: number;
    templateName: string;
    category: string;
    sent: boolean;
    status: string;
    sentAt?: string;
    completedAt?: string;
  }>;
}

/**
 * Get contracts for a specific phase
 */
export function usePhaseContracts(dealId: number | string, phase: number) {
  return useQuery({
    queryKey: ['state-compliance', 'contracts', dealId, phase],
    queryFn: () =>
      api.get<{
        success: boolean;
        data: PhaseContract[];
        count: number;
      }>(`/api/state-compliance/deals/${dealId}/phase/${phase}/contracts`),
    enabled: !!dealId && phase !== undefined,
  });
}

/**
 * Get contract status for a phase (are all signed?)
 */
export function usePhaseContractStatus(dealId: number | string, phase: number) {
  return useQuery({
    queryKey: ['state-compliance', 'contract-status', dealId, phase],
    queryFn: () =>
      api.get<{
        success: boolean;
        data: PhaseContractStatus;
      }>(`/api/state-compliance/deals/${dealId}/phase/${phase}/contracts/status`),
    enabled: !!dealId && phase !== undefined,
  });
}

/**
 * Get all contracts for a deal (across all phases)
 */
export function useAllDealContracts(dealId: number | string) {
  return useQuery({
    queryKey: ['state-compliance', 'all-contracts', dealId],
    queryFn: () =>
      api.get<{
        success: boolean;
        data: PhaseContract[];
        count: number;
        summary: {
          total: number;
          sent: number;
          signed: number;
          pending: number;
        };
      }>(`/api/state-compliance/deals/${dealId}/contracts/all`),
    enabled: !!dealId,
  });
}

/**
 * Send contracts for a phase
 */
export function useSendPhaseContracts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      phase,
      templateIds,
    }: {
      dealId: number;
      phase: number;
      templateIds?: number[];
    }) =>
      api.post<{
        success: boolean;
        data: {
          results: Array<{
            success: boolean;
            category: string;
            submissionId?: number;
            error?: string;
          }>;
        };
        message: string;
      }>(`/api/state-compliance/deals/${dealId}/phase/${phase}/contracts/send`, {
        templateIds,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'contracts', variables.dealId],
      });
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'contract-status', variables.dealId],
      });
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'all-contracts', variables.dealId],
      });
    },
  });
}

/**
 * Resend a specific contract type
 */
export function useResendContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      category,
      state = 'OK',
    }: {
      dealId: number;
      category: string;
      state?: string;
    }) =>
      api.post<{
        success: boolean;
        data: {
          success: boolean;
          submissionId?: number;
          error?: string;
        };
        message: string;
      }>(`/api/state-compliance/deals/${dealId}/contracts/${category}/resend?state=${state}`, {}),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'contracts', variables.dealId],
      });
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'contract-status', variables.dealId],
      });
      queryClient.invalidateQueries({
        queryKey: ['state-compliance', 'all-contracts', variables.dealId],
      });
    },
  });
}
