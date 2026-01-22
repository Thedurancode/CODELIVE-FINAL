/**
 * Property Checklist Hook
 *
 * Fetches and manages property compliance checklist data
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ChecklistItem {
  id: string;
  category: 'llc' | 'contact' | 'document' | 'agreement' | 'rule';
  name: string;
  description: string;
  required: boolean;
  phase: number;
  status: 'complete' | 'partial' | 'missing' | 'pending' | 'not_applicable';
  blocking: boolean;
  completedAt?: string;
  details?: any;
  signingStatus?: 'not_sent' | 'sent' | 'opened' | 'completed' | 'declined' | 'expired';
  metadata?: {
    category?: string;
    role?: string;
    contactName?: string;
    contactId?: string;
    docuSealSubmissionId?: string;
    submissionStatus?: string;
    [key: string]: any;
  };
}

// Phase definition
export interface PhaseStatus {
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

// Gate status between phases
export interface GateStatus {
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

export interface ChecklistSection {
  name: string;
  progress: number; // 0-100
  items: ChecklistItem[];
  requiredCount: number;
  completedCount: number;
}

export interface PropertyChecklist {
  propertyId: number;
  state: string;
  currentPhase: number;
  overallStatus: 'complete' | 'incomplete' | 'blocked';
  overallProgress: number; // 0-100
  sections: {
    llcSetup: ChecklistSection;
    contacts: ChecklistSection;
    documents: ChecklistSection;
    agreements: ChecklistSection;
    complianceRules: ChecklistSection;
  };
  // NEW: Phase-based timeline view
  phases: PhaseStatus[];
  gates: GateStatus[];
  blockingIssues: string[];
  nextSteps: string[];
}

export interface ChecklistSummary {
  propertyId: number;
  overallProgress: number;
  overallStatus: string;
  blockingCount: number;
  completedCount: number;
  totalCount: number;
}

/**
 * Fetch full property checklist
 */
export function usePropertyChecklist(propertyId: number | undefined, enabled = true) {
  return useQuery<PropertyChecklist>({
    queryKey: ['property-checklist', propertyId],
    queryFn: () => api.get<PropertyChecklist>(`/api/properties/${propertyId}/checklist`),
    enabled: enabled && !!propertyId && !isNaN(propertyId),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
    retry: (failureCount, error: any) => {
      // Don't retry if property not found
      if (error?.message?.includes('not found')) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

/**
 * Fetch property checklist summary (lightweight)
 */
export function usePropertyChecklistSummary(propertyId: number | undefined, enabled = true) {
  return useQuery<ChecklistSummary>({
    queryKey: ['property-checklist-summary', propertyId],
    queryFn: () => api.get<ChecklistSummary>(`/api/properties/${propertyId}/checklist/summary`),
    enabled: enabled && !!propertyId && !isNaN(propertyId),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
    retry: (failureCount, error: any) => {
      // Don't retry if property not found
      if (error?.message?.includes('not found')) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

/**
 * Get status icon for checklist item
 */
export function getStatusIcon(status: ChecklistItem['status']): string {
  switch (status) {
    case 'complete':
      return '✓';
    case 'partial':
      return '◐';
    case 'missing':
      return '✗';
    case 'pending':
      return '⏳';
    case 'not_applicable':
      return '—';
    default:
      return '?';
  }
}

/**
 * Get status color for checklist item
 */
export function getStatusColor(status: ChecklistItem['status']): string {
  switch (status) {
    case 'complete':
      return 'text-green-600';
    case 'partial':
      return 'text-yellow-600';
    case 'missing':
      return 'text-red-600';
    case 'pending':
      return 'text-blue-600';
    case 'not_applicable':
      return 'text-gray-400';
    default:
      return 'text-gray-500';
  }
}

/**
 * Get status badge color
 */
export function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'complete':
      return 'bg-green-100 text-green-800';
    case 'incomplete':
      return 'bg-yellow-100 text-yellow-800';
    case 'blocked':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get phase status styling
 */
export function getPhaseStatusStyles(status: PhaseStatus['status']): {
  icon: string;
  bg: string;
  border: string;
  text: string;
} {
  switch (status) {
    case 'complete':
      return {
        icon: '✓',
        bg: 'bg-green-500',
        border: 'border-green-500',
        text: 'text-green-600',
      };
    case 'in_progress':
      return {
        icon: '●',
        bg: 'bg-blue-500',
        border: 'border-blue-500',
        text: 'text-blue-600',
      };
    case 'blocked':
      return {
        icon: '✗',
        bg: 'bg-red-500',
        border: 'border-red-500',
        text: 'text-red-600',
      };
    case 'pending':
    default:
      return {
        icon: '○',
        bg: 'bg-gray-300',
        border: 'border-gray-300',
        text: 'text-gray-400',
      };
  }
}

/**
 * Get gate status styling
 */
export function getGateStatusStyles(status: GateStatus['status']): {
  icon: string;
  bg: string;
  text: string;
  label: string;
} {
  switch (status) {
    case 'passed':
      return {
        icon: '🔓',
        bg: 'bg-green-100',
        text: 'text-green-700',
        label: 'Passed',
      };
    case 'blocked':
      return {
        icon: '🔒',
        bg: 'bg-red-100',
        text: 'text-red-700',
        label: 'Blocked',
      };
    case 'pending':
    default:
      return {
        icon: '⏸',
        bg: 'bg-gray-100',
        text: 'text-gray-500',
        label: 'Pending',
      };
  }
}

/**
 * Get signing status styling
 */
export function getSigningStatusStyles(status: ChecklistItem['signingStatus']): {
  icon: string;
  bg: string;
  text: string;
  label: string;
} {
  switch (status) {
    case 'completed':
      return {
        icon: '✓',
        bg: 'bg-green-100',
        text: 'text-green-700',
        label: 'Signed',
      };
    case 'declined':
      return {
        icon: '✗',
        bg: 'bg-red-100',
        text: 'text-red-700',
        label: 'Declined',
      };
    case 'expired':
      return {
        icon: '⏰',
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        label: 'Expired',
      };
    case 'opened':
      return {
        icon: '👁',
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        label: 'Opened',
      };
    case 'sent':
      return {
        icon: '📧',
        bg: 'bg-purple-100',
        text: 'text-purple-700',
        label: 'Sent',
      };
    case 'not_sent':
    default:
      return {
        icon: '○',
        bg: 'bg-gray-100',
        text: 'text-gray-500',
        label: 'Not Sent',
      };
  }
}
