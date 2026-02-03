/**
 * Project Contracts Hook
 *
 * React Query hook for managing project contracts (DocuSeal integration)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ContractStatus =
  | 'pending'
  | 'sent'
  | 'viewed'
  | 'partially_signed'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'archived';

export interface SubmitterRecord {
  id: number;
  email: string;
  name?: string;
  role: string;
  status: 'pending' | 'sent' | 'opened' | 'completed' | 'declined';
  sentAt?: string;
  openedAt?: string;
  completedAt?: string;
  declinedAt?: string;
  declineReason?: string;
}

export interface ContractSigner {
  id: number;
  submissionId: number;
  contactId?: string;
  projectId?: string;
  docuSealSignerId?: number;
  email: string;
  name?: string;
  phone?: string;
  role: string;
  status: 'pending' | 'sent' | 'opened' | 'completed' | 'declined';
  order?: number;
  sentAt?: string;
  openedAt?: string;
  completedAt?: string;
  declinedAt?: string;
  declineReason?: string;
  embedUrl?: string;
  signedDocumentUrl?: string;
  lastReminderAt?: string;
  reminderCount: number;
  contact?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProjectContract {
  id: number;
  docuSealSubmissionId: number;
  templateId: number;
  templateName?: string;
  projectId: string;
  status: ContractStatus;
  submitters: SubmitterRecord[];
  signers?: ContractSigner[]; // New: linked signers with contact info
  documentCategory?: string;
  sentAt?: string;
  firstViewedAt?: string;
  completedAt?: string;
  declinedAt?: string;
  expireAt?: string;
  auditLogUrl?: string;
  combinedDocumentUrl?: string;
  documentUrls?: string[];
  createdAt: string;
  updatedAt: string;
}

// Get all contracts for a project
export function useProjectContracts(projectId: string, status?: ContractStatus) {
  return useQuery({
    queryKey: ['projects', projectId, 'contracts', { status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const query = params.toString();
      const response = await api.get<{ data: ProjectContract[] }>(`/api/projects/${projectId}/contracts${query ? `?${query}` : ''}`);
      return response.data;
    },
    enabled: !!projectId && typeof window !== 'undefined', // Only run on client
    retry: false, // Don't retry on failure
    staleTime: 30000, // Cache for 30 seconds
  });
}

// Link a contract to a project
export function useLinkProjectContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, docuSealSubmissionId }: { projectId: string; docuSealSubmissionId: number }) =>
      api.post<ProjectContract>(`/api/projects/${projectId}/contracts`, { docuSealSubmissionId }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'contracts'] });
    },
  });
}

// Unlink a contract from a project
export function useUnlinkProjectContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, contractId }: { projectId: string; contractId: number }) =>
      api.delete(`/api/projects/${projectId}/contracts/${contractId}`),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'contracts'] });
    },
  });
}

// Helper to get status color
export function getContractStatusColor(status: ContractStatus): string {
  switch (status) {
    case 'completed':
      return 'text-green-500';
    case 'pending':
    case 'sent':
      return 'text-yellow-500';
    case 'viewed':
    case 'partially_signed':
      return 'text-blue-500';
    case 'declined':
    case 'expired':
      return 'text-red-500';
    case 'archived':
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground';
  }
}

// Helper to get status label
export function getContractStatusLabel(status: ContractStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'sent':
      return 'Sent';
    case 'viewed':
      return 'Viewed';
    case 'partially_signed':
      return 'Partially Signed';
    case 'completed':
      return 'Completed';
    case 'declined':
      return 'Declined';
    case 'expired':
      return 'Expired';
    case 'archived':
      return 'Archived';
    default:
      return status;
  }
}

// =============================================================================
// CONTRACT SIGNER HOOKS
// =============================================================================

// Response type for contract signers
interface ContractSignersResponse {
  data: ContractSigner[];
}

// Get signers for a contract
export function useContractSigners(contractId: number) {
  return useQuery({
    queryKey: ['contracts', contractId, 'signers'],
    queryFn: () => api.get<ContractSignersResponse>(`/api/contracts/${contractId}/signers`),
    enabled: !!contractId && typeof window !== 'undefined',
    staleTime: 30000,
  });
}

// Response type for project signers (includes stats)
interface ProjectSignersResponse {
  data: ContractSigner[];
  stats: {
    total: number;
    pending: number;
    sent: number;
    opened: number;
    completed: number;
    declined: number;
    completionRate: number;
  };
}

// Get all signers for a project (across all contracts)
export function useProjectSigners(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'signers'],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectSignersResponse }>(`/api/projects/${projectId}/signers`);
      return response.data;
    },
    enabled: !!projectId && typeof window !== 'undefined',
    staleTime: 30000,
  });
}

// Get signing history for a contact
export function useContactSigningHistory(contactId: string) {
  return useQuery({
    queryKey: ['contacts', contactId, 'signings'],
    queryFn: () => api.get<ContractSigner[]>(`/api/contacts/${contactId}/signings`),
    enabled: !!contactId && typeof window !== 'undefined',
    staleTime: 30000,
  });
}

// Add a signer to a contract
export function useAddContractSigner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      contractId,
      ...data
    }: {
      contractId: number;
      email: string;
      name?: string;
      role?: string;
      contactId?: string;
      order?: number;
    }) => api.post<ContractSigner>(`/api/contracts/${contractId}/signers`, data),
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ['contracts', contractId, 'signers'] });
    },
  });
}

// Update a signer
export function useUpdateContractSigner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      signerId,
      ...data
    }: {
      signerId: number;
      contractId: number;
      email?: string;
      name?: string;
      role?: string;
      contactId?: string;
      order?: number;
    }) => api.patch<ContractSigner>(`/api/contracts/signers/${signerId}`, data),
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ['contracts', contractId, 'signers'] });
    },
  });
}

// Link signer to contact
export function useLinkSignerToContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      signerId,
      contactId,
      contractId,
    }: {
      signerId: number;
      contactId: string;
      contractId: number;
    }) => api.patch<ContractSigner>(`/api/contracts/signers/${signerId}`, { contactId }),
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ['contracts', contractId, 'signers'] });
    },
  });
}

// Remove a signer
export function useRemoveContractSigner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ signerId, contractId }: { signerId: number; contractId: number }) =>
      api.delete(`/api/contracts/signers/${signerId}`),
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ['contracts', contractId, 'signers'] });
    },
  });
}

// Send reminder to signer
export function useSendSignerReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ signerId, contractId }: { signerId: number; contractId: number }) =>
      api.post(`/api/contracts/signers/${signerId}/remind`),
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ['contracts', contractId, 'signers'] });
    },
  });
}

// Get signer status color
export function getSignerStatusColor(status: ContractSigner['status']): string {
  switch (status) {
    case 'completed':
      return 'text-green-500';
    case 'pending':
    case 'sent':
      return 'text-yellow-500';
    case 'opened':
      return 'text-blue-500';
    case 'declined':
      return 'text-red-500';
    default:
      return 'text-muted-foreground';
  }
}

// Get signer status label
export function getSignerStatusLabel(status: ContractSigner['status']): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'sent':
      return 'Sent';
    case 'opened':
      return 'Viewed';
    case 'completed':
      return 'Signed';
    case 'declined':
      return 'Declined';
    default:
      return status;
  }
}
