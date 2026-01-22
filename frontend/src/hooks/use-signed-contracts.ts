'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SignedContract {
  id: number;
  docuSealSubmissionId: number;
  templateId?: number;
  templateName?: string;
  propertyId: number;
  pipelineId?: number;
  userId?: number;
  status: 'pending' | 'sent' | 'viewed' | 'partially_signed' | 'completed' | 'declined' | 'expired' | 'archived';
  submitters: Array<{
    email: string;
    role?: string;
    status: 'pending' | 'sent' | 'opened' | 'completed' | 'declined';
    completedAt?: string;
  }>;
  documentCategory?: string;
  state?: string;
  sentAt?: string;
  firstViewedAt?: string;
  completedAt?: string;
  declinedAt?: string;
  expireAt?: string;
  auditLogUrl?: string;
  combinedDocumentUrl?: string;
  documentUrls?: string[];
  reminderCount: number;
  lastReminderAt?: string;
  declineReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface SignedContractsResponse {
  success: boolean;
  data: SignedContract[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * Fetch all signed contracts (DocuSeal submissions) for a property
 */
export function useSignedContracts(propertyId: string | number | null) {
  return useQuery({
    queryKey: ['signed-contracts', propertyId],
    queryFn: async () => {
      const response = await api.get<SignedContractsResponse>(
        `/api/contracts?propertyId=${propertyId}`
      );
      return response.data;
    },
    enabled: !!propertyId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Fetch a single submission's details
 */
export function useSignedContract(submissionId: number | null) {
  return useQuery({
    queryKey: ['signed-contract', submissionId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: SignedContract }>(
        `/api/contracts/${submissionId}`
      );
      return response.data;
    },
    enabled: !!submissionId,
  });
}

/**
 * Send a reminder to pending signers
 */
export function useSendContractReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (submissionId: number) => {
      const response = await api.post<{ success: boolean; remindedCount: number }>(
        `/api/contracts/${submissionId}/remind`
      );
      return response;
    },
    onSuccess: (_, submissionId) => {
      queryClient.invalidateQueries({ queryKey: ['signed-contract', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['signed-contracts'] });
    },
  });
}

/**
 * Sync submission status with DocuSeal
 */
export function useSyncContractStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (submissionId: number) => {
      const response = await api.post<{ success: boolean; data: SignedContract }>(
        `/api/contracts/${submissionId}/sync`
      );
      return response.data;
    },
    onSuccess: (_, submissionId) => {
      queryClient.invalidateQueries({ queryKey: ['signed-contract', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['signed-contracts'] });
    },
  });
}

/**
 * Get status color and label for display
 */
export function getContractStatusDisplay(status: SignedContract['status']) {
  const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    pending: { label: 'Pending', color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/20' },
    sent: { label: 'Sent', color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20' },
    viewed: { label: 'Viewed', color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/20' },
    partially_signed: { label: 'Partially Signed', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10 border-cyan-500/20' },
    completed: { label: 'Completed', color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20' },
    declined: { label: 'Declined', color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20' },
    expired: { label: 'Expired', color: 'text-zinc-400', bgColor: 'bg-zinc-500/10 border-zinc-500/20' },
    archived: { label: 'Archived', color: 'text-zinc-500', bgColor: 'bg-zinc-500/10 border-zinc-500/20' },
  };

  return statusConfig[status] || statusConfig.pending;
}

/**
 * Format date for display
 */
export function formatContractDate(date?: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
