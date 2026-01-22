'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DocumentCategory } from './use-document-templates';

// Document requirement status from backend
export type DocumentRequirementStatus = 'missing' | 'pending' | 'completed' | 'needs_resend';

// Submission details from backend
export interface DocumentSubmissionDetails {
  submissionId: number;
  status: string;
  sentAt?: string;
  completedAt?: string;
  submitters?: Array<{
    email: string;
    name?: string;
    status: string;
    completedAt?: string;
  }>;
}

// Document requirement from backend
export interface DocumentRequirement {
  templateId: number;
  docuSealTemplateId: number;
  category: DocumentCategory | string;
  name: string;
  description?: string;
  required: boolean;
  priority: number;
  status: DocumentRequirementStatus;
  submission?: DocumentSubmissionDetails;
}

// API response for document requirements
export interface DocumentRequirementsResponse {
  requirements: DocumentRequirement[];
  summary: {
    total: number;
    completed: number;
    pending: number;
    missing: number;
  };
  allSatisfied: boolean;
}

// Legacy types for backwards compatibility
export interface DocumentChecklistItem {
  category: DocumentCategory;
  name: string;
  description?: string;
  required: boolean;
  status: 'not_started' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired';
  isComplete: boolean;
  details?: {
    submissionId?: number;
    sentAt?: string;
    signedAt?: string;
    signers?: Array<{
      email: string;
      status: string;
      signedAt?: string;
    }>;
  };
  templateId: number;
  docuSealTemplateId: number;
}

// Compliance issue
export interface ComplianceIssue {
  rule: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  field?: string;
}

// Full checklist response (legacy format)
export interface DocumentChecklist {
  propertyId: number;
  propertyAddress: string;
  state: string;
  transactionType: string;
  overallStatus: 'complete' | 'in_progress' | 'pending' | 'issues';
  completionPercentage: number;

  complianceRules: {
    status: 'Green' | 'Yellow' | 'Red';
    passed: number;
    failed: number;
    total: number;
    issues: ComplianceIssue[];
    passedChecks: Array<{ rule: string }>;
  };

  documents: {
    total: number;
    signed: number;
    pending: number;
    notStarted: number;
    items: DocumentChecklistItem[];
  };

  summary: {
    totalItems: number;
    completedItems: number;
    criticalIssues: number;
    warnings: number;
    nextSteps: string[];
  };

  lastUpdated: string;
}

// Create contract payload
export interface SendDocumentPayload {
  templateId: number;
  propertyId: string;
  signers: Array<{
    email: string;
    name?: string;
    role?: string;
  }>;
  expiresInDays?: number;
  message?: string;
}

/**
 * Fetch document requirements for a property
 * Uses the new document requirements API endpoint
 */
export function useDocumentRequirements(
  propertyId: string | number | undefined,
  transactionType: 'wholesaling' | 'retail' | 'all' = 'wholesaling'
) {
  return useQuery({
    queryKey: ['document-requirements', propertyId, transactionType],
    queryFn: async () => {
      const response = await api.get<DocumentRequirementsResponse>(
        `/api/compliance/documents/${propertyId}/requirements?transactionType=${transactionType}`
      );
      return response;
    },
    enabled: !!propertyId,
    staleTime: 30000, // 30 seconds
    retry: 1,
  });
}

/**
 * Fetch document requirements for a state (without a specific property)
 */
export function useStateDocumentRequirements(
  state: string | undefined,
  transactionType: 'wholesaling' | 'retail' | 'all' = 'wholesaling'
) {
  return useQuery({
    queryKey: ['state-document-requirements', state, transactionType],
    queryFn: async () => {
      const response = await api.get<DocumentRequirement[]>(
        `/api/compliance/documents/requirements/${state}?transactionType=${transactionType}`
      );
      return response;
    },
    enabled: !!state,
    staleTime: 60000, // 1 minute
    retry: 1,
  });
}

/**
 * Fetch the document requirements checklist for a property (legacy)
 * @deprecated Use useDocumentRequirements instead
 */
export function useDocumentChecklist(
  propertyId: string | undefined,
  transactionType: 'wholesaling' | 'retail' | 'all' = 'wholesaling'
) {
  return useQuery({
    queryKey: ['document-checklist', propertyId, transactionType],
    queryFn: async () => {
      const response = await api.get<DocumentChecklist>(
        `/api/compliance/checklist/${propertyId}?transactionType=${transactionType}`
      );
      return response;
    },
    enabled: !!propertyId,
    staleTime: 30000, // 30 seconds
    retry: 1,
  });
}

/**
 * Send a document for signature
 */
export function useSendDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SendDocumentPayload) => {
      const response = await api.post<{
        success: boolean;
        submissionId: number;
        signerUrls: Array<{ email: string; url: string }>;
      }>('/api/contracts', payload);
      return response;
    },
    onSuccess: (_, variables) => {
      // Invalidate the checklist to refresh status
      queryClient.invalidateQueries({
        queryKey: ['document-checklist', variables.propertyId],
      });
      // Also invalidate property to update documentStatus
      queryClient.invalidateQueries({
        queryKey: ['property', variables.propertyId],
      });
    },
  });
}

/**
 * Send a reminder for a pending document
 */
export function useSendDocumentReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      submissionId,
      propertyId,
    }: {
      submissionId: number;
      propertyId: string;
    }) => {
      const response = await api.post<{ success: boolean; remindersSent: number }>(
        `/api/contracts/${submissionId}/remind`
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['document-checklist', variables.propertyId],
      });
    },
  });
}

/**
 * Get signed document URLs
 */
export function useDocumentUrls(submissionId: number | undefined) {
  return useQuery({
    queryKey: ['document-urls', submissionId],
    queryFn: async () => {
      const response = await api.get<{
        combinedDocumentUrl?: string;
        documentUrls?: string[];
      }>(`/api/contracts/${submissionId}/documents`);
      return response;
    },
    enabled: !!submissionId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Sync document status from DocuSeal
 */
export function useSyncDocumentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      submissionId,
      propertyId,
    }: {
      submissionId: number;
      propertyId: string;
    }) => {
      const response = await api.post<{ success: boolean }>(
        `/api/contracts/${submissionId}/sync`
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['document-checklist', variables.propertyId],
      });
    },
  });
}

// Helper to get status display info
export function getDocumentStatusInfo(status: DocumentChecklistItem['status']) {
  const statusConfig: Record<
    DocumentChecklistItem['status'],
    { label: string; color: string; bgColor: string; icon: string }
  > = {
    not_started: {
      label: 'Not Sent',
      color: 'text-zinc-400',
      bgColor: 'bg-zinc-500/10',
      icon: 'circle',
    },
    sent: {
      label: 'Sent',
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      icon: 'send',
    },
    viewed: {
      label: 'Viewed',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      icon: 'eye',
    },
    signed: {
      label: 'Signed',
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      icon: 'check',
    },
    declined: {
      label: 'Declined',
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      icon: 'x',
    },
    expired: {
      label: 'Expired',
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      icon: 'clock',
    },
  };

  return statusConfig[status] || statusConfig.not_started;
}
