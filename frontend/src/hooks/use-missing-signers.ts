/**
 * Missing Signers Hook
 *
 * React Query hooks for checking and managing contract signers.
 * Provides UI feedback for missing contacts and manual overrides.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ============================================================================
// TYPES
// ============================================================================

export interface MissingSignerInfo {
  role: 'seller' | 'buyer' | 'wholesaler' | 'broker';
  reason: string;
  suggestedAction: string;
  attemptedSources: string[];
  affectedPhases?: number[];
}

export interface AvailableSigner {
  role: string;
  name: string;
  email: string;
  source: string;
  verified: boolean;
  contactId?: number;
}

export interface SignerOverride {
  role: 'seller' | 'buyer' | 'wholesaler' | 'broker';
  contactId?: number;
  email?: string;
  name?: string;
  phone?: string;
}

export interface MissingSignersResponse {
  missingSigners: MissingSignerInfo[];
  totalMissing: number;
  canSendAllContracts: boolean;
  phase?: number;
  canSendContracts?: boolean;
}

export interface SignerCheckResponse {
  templateId: number;
  templateName: string;
  category: string;
  requiredRoles: string[];
  available: AvailableSigner[];
  missing: MissingSignerInfo[];
  canSend: boolean;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get missing signers for a deal (all phases or specific phase)
 */
export function useMissingSigners(dealId: number | string, state = 'OK', phase?: number) {
  return useQuery({
    queryKey: ['missing-signers', dealId, state, phase],
    queryFn: async () => {
      const params = new URLSearchParams({ state });
      if (phase !== undefined) params.set('phase', phase.toString());

      const response = await api.get<{ success: boolean; data: MissingSignersResponse }>(
        `/api/state-compliance/deals/${dealId}/signers/missing?${params}`
      );
      return response.data;
    },
    enabled: !!dealId,
    staleTime: 10000, // 10 seconds
  });
}

/**
 * Check signer availability for a specific template
 */
export function useSignerCheck(dealId: number | string, templateId: number) {
  return useQuery({
    queryKey: ['signer-check', dealId, templateId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: SignerCheckResponse }>(
        `/api/state-compliance/deals/${dealId}/signers/check?templateId=${templateId}`
      );
      return response.data;
    },
    enabled: !!dealId && !!templateId,
    staleTime: 10000,
  });
}

/**
 * Set manual signer overrides for a deal
 */
export function useSetSignerOverrides(dealId: number | string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ state = 'OK', overrides }: { state?: string; overrides: SignerOverride[] }) => {
      const response = await api.post<{ success: boolean; message: string }>(
        `/api/state-compliance/deals/${dealId}/signers/overrides`,
        { state, overrides }
      );
      return response;
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['missing-signers', dealId] });
      queryClient.invalidateQueries({ queryKey: ['signer-check', dealId] });
      queryClient.invalidateQueries({ queryKey: ['phase-contracts', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deal-compliance', dealId] });
    },
  });
}

/**
 * Clear all signer overrides for a deal
 */
export function useClearSignerOverrides(dealId: number | string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (state?: string) => {
      const stateParam = state || 'OK';
      const response = await api.delete<{ success: boolean; message: string }>(
        `/api/state-compliance/deals/${dealId}/signers/overrides?state=${stateParam}`
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missing-signers', dealId] });
      queryClient.invalidateQueries({ queryKey: ['signer-check', dealId] });
      queryClient.invalidateQueries({ queryKey: ['phase-contracts', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deal-compliance', dealId] });
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get role display name
 */
export function getRoleDisplayName(role: string): string {
  const names: Record<string, string> = {
    seller: 'Seller',
    buyer: 'Buyer',
    wholesaler: 'Wholesaler',
    broker: 'Broker',
  };
  return names[role] || role;
}

/**
 * Get source display name
 */
export function getSourceDisplayName(source: string): string {
  const names: Record<string, string> = {
    contacts: 'Contacts',
    property: 'Property Info',
    llcProfile: 'LLC Profile',
    pipeline: 'Pipeline',
    ocrData: 'Document OCR',
    dealMatch: 'Deal Match',
    compliance: 'Compliance Record',
    manual_override: 'Manual Override',
  };
  return names[source] || source;
}

/**
 * Get suggested action icon/type
 */
export function getSuggestedActionType(role: string): 'contacts' | 'pipeline' | 'settings' | 'other' {
  switch (role) {
    case 'seller':
      return 'contacts';
    case 'buyer':
      return 'pipeline';
    case 'wholesaler':
      return 'settings';
    case 'broker':
      return 'contacts';
    default:
      return 'other';
  }
}
