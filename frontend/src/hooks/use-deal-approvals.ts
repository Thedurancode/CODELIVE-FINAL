import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Property } from '@/types';

// Types
export type ApprovalStatus = 'draft' | 'pending_broker_approval' | 'approved' | 'rejected' | 'live';

export interface PendingDeal {
  id: number;
  propertyId: string;
  address: {
    houseNumber: string;
    street: string;
  };
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  bedroomCount: number;
  bathroomCount: number;
  reservePrice?: number;
  buyItNowPrice?: number;
  arv?: number;
  status?: 'Green' | 'Yellow' | 'Red';
  complianceNotes?: string[];
  approvalStatus: ApprovalStatus;
  submittedForApprovalAt?: string;
  changesRequested?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface ApprovalStats {
  pending: number;
  approvedThisWeek: number;
  rejectedThisWeek: number;
  avgApprovalTimeHours: number;
}

export interface ApprovalHistoryEntry {
  action: 'queued' | 'approved' | 'rejected' | 'changes_requested' | 'resubmitted' | 'made_live';
  performedBy: string;
  performedByName?: string;
  timestamp: string;
  notes?: string;
}

// Hooks

/**
 * Get pending deals awaiting broker approval
 */
export function usePendingApprovals() {
  return useQuery({
    queryKey: ['broker-approvals'],
    queryFn: async () => {
      const response = await api.get<{ data: PendingDeal[]; count: number }>('/api/broker/approvals');
      return response.data;
    },
  });
}

/**
 * Get approval statistics for the broker
 */
export function useApprovalStats() {
  return useQuery({
    queryKey: ['broker-approval-stats'],
    queryFn: async () => {
      const response = await api.get<{ data: ApprovalStats }>('/api/broker/approvals/stats');
      return response.data;
    },
  });
}

/**
 * Approve a deal (auto-goes live)
 */
export function useApproveDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ propertyId, notes }: { propertyId: number; notes?: string }) => {
      const response = await api.put<{ data: PendingDeal; message: string }>(
        `/api/broker/approvals/${propertyId}/approve`,
        { notes }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['broker-approval-stats'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

/**
 * Reject a deal
 */
export function useRejectDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ propertyId, reason }: { propertyId: number; reason: string }) => {
      const response = await api.put<{ data: PendingDeal; message: string }>(
        `/api/broker/approvals/${propertyId}/reject`,
        { reason }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['broker-approval-stats'] });
    },
  });
}

/**
 * Request changes before approval
 */
export function useRequestChanges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ propertyId, changes }: { propertyId: number; changes: string }) => {
      const response = await api.put<{ data: PendingDeal; message: string }>(
        `/api/broker/approvals/${propertyId}/request-changes`,
        { changes }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['broker-approval-stats'] });
    },
  });
}

/**
 * Get approval history for a property
 */
export function useApprovalHistory(propertyId: number | null) {
  return useQuery({
    queryKey: ['approval-history', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const response = await api.get<{ data: ApprovalHistoryEntry[]; count: number }>(
        `/api/broker/approvals/${propertyId}/history`
      );
      return response.data;
    },
    enabled: !!propertyId,
  });
}

// ============================================================================
// SUBMIT FOR APPROVAL (Wholesaler side)
// ============================================================================

/**
 * Submit a single property for broker approval
 */
export function useSubmitForApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (propertyId: string) => {
      const response = await api.post<{ data: Property; message: string }>(
        `/api/listings/${propertyId}/submit`
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['broker-approvals'] });
    },
  });
}

/**
 * Bulk submit properties for broker approval
 */
export function useBulkSubmitForApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (propertyIds: string[]) => {
      const response = await api.post<{
        data: { submitted: number[]; failed: { id: number; error: string }[] };
        message: string;
      }>('/api/listings/bulk/submit', { propertyIds });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['broker-approvals'] });
    },
  });
}

/**
 * Resubmit a property after changes were requested
 */
export function useResubmitForApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (propertyId: string) => {
      const response = await api.post<{ data: Property; message: string }>(
        `/api/listings/${propertyId}/resubmit`
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['broker-approvals'] });
    },
  });
}
