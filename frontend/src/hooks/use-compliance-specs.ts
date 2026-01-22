/**
 * React Query hooks for Compliance Spec Admin API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

export interface StateSpec {
  state_code: string;
  state_name: string;
  version: string;
  status: 'active' | 'draft' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface StateSummary {
  stateCode: string;
  stateName: string;
  version: string;
  status: string;
  rules: number;
  disclosures: number;
  gates: number;
}

export interface Rule {
  id?: string;
  rule_code: string;
  phase: number;
  name: string;
  description: string;
  validation_type: string;
  severity: 'critical' | 'warning' | 'info';
  is_blocking: boolean;
  is_active: boolean;
  error_message?: string;
  remediation?: string;
}

export interface Disclosure {
  id?: string;
  disclosure_code: string;
  name: string;
  description: string;
  legal_citation?: string;
  is_required: boolean;
  phase: number;
  keywords?: string[];
  is_active: boolean;
}

export interface Gate {
  id?: string;
  gate_code: string;
  name: string;
  after_phase: number;
  blocks_phase: number;
  condition_description: string;
  error_message: string;
  is_active: boolean;
}

export interface AICommand {
  id: string;
  state_code: string;
  raw_command: string;
  parsed_intent: string;
  parsed_params: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  requires_approval: boolean;
  created_at: string;
  executed_at?: string;
  error_message?: string;
}

export interface CacheStats {
  type: 'redis' | 'memory';
  keys: number;
  memoryKeys: number;
}

export interface WebhookStats {
  webhooks: number;
  pendingRetries: number;
}

export interface DatabaseStats {
  states: number;
  rules: number;
  activeRules: number;
  disclosures: number;
  gates: number;
}

export interface StateBreakdown {
  state_code: string;
  state_name: string;
  rules_count: string;
  disclosures_count: string;
  gates_count: string;
}

export interface SpecStats {
  database: DatabaseStats;
  byState: StateBreakdown[];
  cache: CacheStats;
  webhooks: WebhookStats;
}

export interface CommandInfo {
  name: string;
  description: string;
  dangerous: boolean;
}

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Get all state specs
 */
export function useStateSpecs() {
  return useQuery({
    queryKey: ['compliance-specs', 'states'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: StateSpec | StateSpec[] }>(
        '/api/compliance-specs/states'
      );
      // Handle both single object and array responses
      const data = response.data;
      return Array.isArray(data) ? data : [data];
    },
  });
}

/**
 * Get summary for a specific state
 */
export function useStateSummary(stateCode: string) {
  return useQuery({
    queryKey: ['compliance-specs', 'summary', stateCode],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: StateSummary }>(
        `/api/compliance-specs/states/${stateCode}`
      );
      return response.data;
    },
    enabled: !!stateCode,
  });
}

/**
 * Get rules for a state
 */
export function useStateRules(stateCode: string, phase?: number) {
  return useQuery({
    queryKey: ['compliance-specs', 'rules', stateCode, phase],
    queryFn: async () => {
      const url = phase !== undefined
        ? `/api/compliance-specs/states/${stateCode}/rules?phase=${phase}`
        : `/api/compliance-specs/states/${stateCode}/rules`;
      const response = await api.get<{ success: boolean; data: Rule[] }>(url);
      return response.data || [];
    },
    enabled: !!stateCode,
  });
}

/**
 * Get disclosures for a state
 */
export function useStateDisclosures(stateCode: string) {
  return useQuery({
    queryKey: ['compliance-specs', 'disclosures', stateCode],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: Disclosure[] }>(
        `/api/compliance-specs/states/${stateCode}/disclosures`
      );
      return response.data || [];
    },
    enabled: !!stateCode,
  });
}

/**
 * Get pending approvals
 */
export function usePendingApprovals() {
  return useQuery({
    queryKey: ['compliance-specs', 'approvals'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: AICommand[] }>(
        '/api/compliance-specs/approvals'
      );
      return response.data || [];
    },
  });
}

/**
 * Get available commands
 */
export function useAvailableCommands() {
  return useQuery({
    queryKey: ['compliance-specs', 'commands'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: CommandInfo[] }>(
        '/api/compliance-specs/commands'
      );
      return response.data || [];
    },
  });
}

/**
 * Get database, cache and webhook stats
 */
export function useSpecStats() {
  return useQuery({
    queryKey: ['compliance-specs', 'stats'],
    queryFn: async () => {
      const response = await api.get<{
        success: boolean;
        data: SpecStats;
      }>('/api/compliance-specs/stats');
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Get version history for a state
 */
export function useVersionHistory(stateCode: string) {
  return useQuery({
    queryKey: ['compliance-specs', 'versions', stateCode],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: any[] }>(
        `/api/compliance-specs/versions/${stateCode}`
      );
      return response.data || [];
    },
    enabled: !!stateCode,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Execute an AI command
 */
export function useAICommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      command,
      execute = true,
      skipApproval = false,
    }: {
      command: string;
      execute?: boolean;
      skipApproval?: boolean;
    }) => {
      const response = await api.post<{
        success: boolean;
        parsed: any;
        result?: any;
        message?: string;
      }>('/api/compliance-specs/ai/command', { command, execute, skipApproval });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-specs'] });
    },
  });
}

/**
 * Clone a state spec
 */
export function useCloneState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceState,
      targetState,
      targetStateName,
    }: {
      sourceState: string;
      targetState: string;
      targetStateName: string;
    }) => {
      const response = await api.post<{ success: boolean; message: string }>(
        `/api/compliance-specs/states/${sourceState}/clone`,
        { targetState, targetStateName }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-specs', 'states'] });
    },
  });
}

/**
 * Add a rule
 */
export function useAddRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stateCode,
      rule,
    }: {
      stateCode: string;
      rule: Partial<Rule>;
    }) => {
      const response = await api.post<{ success: boolean; message: string }>(
        `/api/compliance-specs/states/${stateCode}/rules`,
        rule
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['compliance-specs', 'rules', variables.stateCode],
      });
      queryClient.invalidateQueries({
        queryKey: ['compliance-specs', 'summary', variables.stateCode],
      });
    },
  });
}

/**
 * Update a rule
 */
export function useUpdateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stateCode,
      ruleCode,
      updates,
    }: {
      stateCode: string;
      ruleCode: string;
      updates: Partial<Rule>;
    }) => {
      const response = await api.put<{ success: boolean; message: string }>(
        `/api/compliance-specs/states/${stateCode}/rules/${ruleCode}`,
        updates
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['compliance-specs', 'rules', variables.stateCode],
      });
    },
  });
}

/**
 * Delete a rule
 */
export function useDeleteRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stateCode,
      ruleCode,
    }: {
      stateCode: string;
      ruleCode: string;
    }) => {
      const response = await api.delete<{ success: boolean; message: string }>(
        `/api/compliance-specs/states/${stateCode}/rules/${ruleCode}`
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['compliance-specs', 'rules', variables.stateCode],
      });
      queryClient.invalidateQueries({
        queryKey: ['compliance-specs', 'summary', variables.stateCode],
      });
    },
  });
}

/**
 * Add a disclosure
 */
export function useAddDisclosure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stateCode,
      disclosure,
    }: {
      stateCode: string;
      disclosure: Partial<Disclosure>;
    }) => {
      const response = await api.post<{ success: boolean; message: string }>(
        `/api/compliance-specs/states/${stateCode}/disclosures`,
        disclosure
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['compliance-specs', 'disclosures', variables.stateCode],
      });
      queryClient.invalidateQueries({
        queryKey: ['compliance-specs', 'summary', variables.stateCode],
      });
    },
  });
}

/**
 * Bulk toggle rules
 */
export function useBulkToggleRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stateCode,
      action,
      phase,
      ruleCodes,
    }: {
      stateCode: string;
      action: 'enable' | 'disable';
      phase?: number;
      ruleCodes?: string[];
    }) => {
      const response = await api.post<{ success: boolean; message: string; data?: { affected: number } }>(
        `/api/compliance-specs/states/${stateCode}/rules/bulk`,
        { action, phase, ruleCodes }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['compliance-specs', 'rules', variables.stateCode],
      });
    },
  });
}

/**
 * Approve a pending command
 */
export function useApproveCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commandId: string) => {
      const response = await api.post<{ success: boolean; result: any }>(
        `/api/compliance-specs/approvals/${commandId}/approve`
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-specs'] });
    },
  });
}

/**
 * Reject a pending command
 */
export function useRejectCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commandId, reason }: { commandId: string; reason?: string }) => {
      const response = await api.post<{ success: boolean; message: string }>(
        `/api/compliance-specs/approvals/${commandId}/reject`,
        { reason }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-specs', 'approvals'] });
    },
  });
}

/**
 * Validate rule logic
 */
export function useValidateLogic() {
  return useMutation({
    mutationFn: async (logic: string) => {
      const response = await api.post<{
        success: boolean;
        data: { valid: boolean; issues: string[] };
      }>('/api/compliance-specs/validate-logic', { logic });
      return response.data;
    },
  });
}

/**
 * Export state spec
 */
export function useExportState() {
  return useMutation({
    mutationFn: async (stateCode: string) => {
      const response = await api.get<{ success: boolean; data: any }>(
        `/api/compliance-specs/states/${stateCode}/export`
      );
      return response.data;
    },
  });
}
