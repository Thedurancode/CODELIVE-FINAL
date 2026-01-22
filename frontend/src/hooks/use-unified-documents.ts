'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usePropertyDocuments, PropertyDocument } from './use-property-documents';
import { useSignedContracts, SignedContract } from './use-signed-contracts';
import {
  useAllDealContracts,
  PhaseContract,
  PHASE_NAMES,
} from './use-state-compliance';
import { DocumentCategory } from './use-document-templates';

// ============================================================================
// TYPES
// ============================================================================

export type UnifiedDocumentStatus =
  | 'not_sent'      // Requirement exists, no document/submission
  | 'uploaded'      // Document uploaded but not sent for signing
  | 'pending'       // Sent via DocuSeal, awaiting signatures
  | 'viewed'        // DocuSeal submission viewed
  | 'partially_signed' // Some signatures complete
  | 'signed'        // All signatures complete
  | 'declined'      // Signing declined
  | 'expired'       // Signing expired
  | 'failed';       // Upload or processing failed

export type UnifiedDocumentType = 'requirement' | 'uploaded' | 'signed';

export interface UnifiedDocument {
  id: string; // Unique identifier (e.g., "req-123", "doc-456", "sub-789")
  type: UnifiedDocumentType;
  category?: DocumentCategory | string;
  name: string;
  description?: string;
  phase?: number;
  required: boolean;
  status: UnifiedDocumentStatus;

  // If this is an uploaded document
  uploadedDoc?: PropertyDocument;

  // If this is a compliance requirement (phase contract)
  requirement?: PhaseContract;

  // If this is a DocuSeal submission
  submission?: SignedContract;

  // Metadata
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  mimeType?: string;
  fileSize?: number;
  downloadUrl?: string;
}

export interface PhaseGroup {
  phase: number;
  name: string;
  documents: UnifiedDocument[];
  totalRequired: number;
  totalCompleted: number;
}

export interface UnifiedDocumentsData {
  // Grouped by phase
  phaseGroups: PhaseGroup[];

  // Flat lists
  allDocuments: UnifiedDocument[];
  uploadedDocuments: UnifiedDocument[];
  signedDocuments: UnifiedDocument[];
  requiredDocuments: UnifiedDocument[];

  // Unlinked uploads (not associated with any requirement)
  otherDocuments: UnifiedDocument[];

  // Summary
  summary: {
    totalRequired: number;
    totalCompleted: number;
    totalPending: number;
    totalUploaded: number;
    totalSigned: number;
    completionPercentage: number;
  };

  // Loading states
  isLoading: boolean;
  isError: boolean;
  error?: Error;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map DocuSeal submission status to unified status
 */
function mapSubmissionStatus(status: SignedContract['status']): UnifiedDocumentStatus {
  switch (status) {
    case 'completed':
      return 'signed';
    case 'pending':
    case 'sent':
      return 'pending';
    case 'viewed':
      return 'viewed';
    case 'partially_signed':
      return 'partially_signed';
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    default:
      return 'not_sent';
  }
}

/**
 * Map phase contract status to unified status
 */
function mapPhaseContractStatus(contract: PhaseContract): UnifiedDocumentStatus {
  if (!contract.alreadySent) {
    return 'not_sent';
  }

  switch (contract.submissionStatus) {
    case 'completed':
      return 'signed';
    case 'pending':
    case 'sent':
      return 'pending';
    case 'viewed':
      return 'viewed';
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    default:
      return 'pending';
  }
}

/**
 * Map uploaded document status to unified status
 */
function mapUploadedDocStatus(doc: PropertyDocument): UnifiedDocumentStatus {
  if (doc.status === 'failed') {
    return 'failed';
  }
  return 'uploaded';
}

/**
 * Check if an uploaded document matches a compliance category
 */
function doesDocumentMatchCategory(doc: PropertyDocument, category: string): boolean {
  // Direct match via complianceCategory field
  if (doc.complianceCategory === category) {
    return true;
  }

  // Fallback: match by document type
  const categoryToDocType: Record<string, PropertyDocument['documentType'][]> = {
    purchase_contract: ['contract'],
    assignment_addendum: ['contract'],
    seller_disclosure: ['disclosure'],
    lead_paint: ['disclosure'],
    hoa_disclosure: ['disclosure'],
    inspection_notice: ['inspection'],
    financing_addendum: ['contract'],
    closing_instructions: ['contract'],
    proof_of_funds: ['other'],
    offer_letter: ['contract'],
    jv_agreement: ['contract'],
    appraisal: ['appraisal'],
    title: ['title'],
  };

  const matchingTypes = categoryToDocType[category];
  return matchingTypes?.includes(doc.documentType) || false;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Unified Documents Hook
 *
 * Combines data from:
 * - usePropertyDocuments (uploaded documents)
 * - useAllDealContracts (phase-based compliance requirements)
 * - useSignedContracts (DocuSeal submissions)
 *
 * Returns a unified view of all documents with phase grouping and status tracking.
 */
export function useUnifiedDocuments(
  propertyId: string | number | null,
  options?: {
    state?: string;
    transactionType?: 'wholesaling' | 'retail' | 'all';
  }
): UnifiedDocumentsData {
  const queryClient = useQueryClient();

  // Fetch uploaded documents
  const {
    data: uploadedData,
    isLoading: isLoadingUploaded,
    isError: isErrorUploaded,
    error: errorUploaded,
  } = usePropertyDocuments(propertyId?.toString() || '');

  // Fetch DocuSeal submissions
  const {
    data: signedData,
    isLoading: isLoadingSigned,
    isError: isErrorSigned,
    error: errorSigned,
  } = useSignedContracts(propertyId);

  // Fetch phase-based compliance contracts
  const {
    data: contractsData,
    isLoading: isLoadingContracts,
    isError: isErrorContracts,
    error: errorContracts,
  } = useAllDealContracts(propertyId?.toString() || '');

  // Combine loading and error states
  // Only consider it a full error if the core documents endpoint fails
  // Signed contracts and compliance contracts errors are treated as "no data"
  // Also consider query disabled states (when propertyId is empty)
  const isLoading = (isLoadingUploaded || isLoadingSigned || isLoadingContracts) && !!propertyId;
  const isError = isErrorUploaded && !!propertyId; // Only fail if uploaded documents can't be loaded
  const error = errorUploaded;

  // If no property ID, return empty state early
  if (!propertyId) {
    return {
      phaseGroups: [],
      allDocuments: [],
      uploadedDocuments: [],
      signedDocuments: [],
      requiredDocuments: [],
      otherDocuments: [],
      summary: {
        totalRequired: 0,
        totalCompleted: 0,
        totalPending: 0,
        totalUploaded: 0,
        totalSigned: 0,
        completionPercentage: 0,
      },
      isLoading: false,
      isError: false,
      error: undefined,
    };
  }

  // Build unified documents list
  const allDocuments: UnifiedDocument[] = [];
  const uploadedDocuments: UnifiedDocument[] = [];
  const signedDocuments: UnifiedDocument[] = [];
  const requiredDocuments: UnifiedDocument[] = [];
  const otherDocuments: UnifiedDocument[] = [];

  // Track which categories have been satisfied by uploads
  const satisfiedCategories = new Set<string>();

  // Process uploaded documents
  const uploadedDocs = uploadedData?.documents || [];
  for (const doc of uploadedDocs) {
    const unifiedDoc: UnifiedDocument = {
      id: `doc-${doc.id}`,
      type: 'uploaded',
      category: doc.complianceCategory || undefined,
      name: doc.originalName,
      required: false,
      status: mapUploadedDocStatus(doc),
      uploadedDoc: doc,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      downloadUrl: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/documents/${doc.id}/download`,
    };

    uploadedDocuments.push(unifiedDoc);
    allDocuments.push(unifiedDoc);

    // Track satisfied categories
    if (doc.complianceCategory) {
      satisfiedCategories.add(doc.complianceCategory);
    }
  }

  // Process DocuSeal submissions
  const submissions = signedData || [];
  for (const sub of submissions) {
    const status = mapSubmissionStatus(sub.status);

    const unifiedDoc: UnifiedDocument = {
      id: `sub-${sub.id}`,
      type: 'signed',
      category: sub.documentCategory || undefined,
      name: sub.templateName || `Contract #${sub.docuSealSubmissionId}`,
      required: false,
      status,
      submission: sub,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
      completedAt: sub.completedAt || undefined,
      downloadUrl: sub.combinedDocumentUrl || undefined,
    };

    signedDocuments.push(unifiedDoc);
    allDocuments.push(unifiedDoc);

    // Mark category as satisfied if signed
    if (sub.documentCategory && status === 'signed') {
      satisfiedCategories.add(sub.documentCategory);
    }
  }

  // Process phase contracts (compliance requirements)
  const phaseContracts = contractsData?.data || [];
  for (const contract of phaseContracts) {
    // Check if this requirement is already satisfied by an upload or submission
    const isSatisfiedByUpload = satisfiedCategories.has(contract.category);

    const status = contract.alreadySent
      ? mapPhaseContractStatus(contract)
      : (isSatisfiedByUpload ? 'uploaded' : 'not_sent');

    const unifiedDoc: UnifiedDocument = {
      id: `req-${contract.templateId}`,
      type: 'requirement',
      category: contract.category,
      name: contract.templateName,
      phase: contract.phase,
      required: contract.required,
      status,
      requirement: contract,
      completedAt: contract.completedAt || undefined,
    };

    requiredDocuments.push(unifiedDoc);

    // Don't add to allDocuments if already represented by a submission
    const hasSubmission = submissions.some(s => s.documentCategory === contract.category);
    if (!hasSubmission) {
      allDocuments.push(unifiedDoc);
    }
  }

  // Find uploads not linked to any requirement
  for (const doc of uploadedDocuments) {
    const isLinkedToRequirement = requiredDocuments.some(
      req => req.category && doc.category === req.category
    );
    if (!isLinkedToRequirement) {
      otherDocuments.push(doc);
    }
  }

  // Build phase groups
  const phaseGroupsMap = new Map<number, PhaseGroup>();

  // Initialize phase groups from PHASE_NAMES
  for (const [phaseStr, name] of Object.entries(PHASE_NAMES)) {
    const phase = parseInt(phaseStr);
    phaseGroupsMap.set(phase, {
      phase,
      name,
      documents: [],
      totalRequired: 0,
      totalCompleted: 0,
    });
  }

  // Add requirement documents to their phase groups
  for (const doc of requiredDocuments) {
    if (doc.phase !== undefined) {
      let group = phaseGroupsMap.get(doc.phase);
      if (!group) {
        group = {
          phase: doc.phase,
          name: `Phase ${doc.phase}`,
          documents: [],
          totalRequired: 0,
          totalCompleted: 0,
        };
        phaseGroupsMap.set(doc.phase, group);
      }

      // Add the document (or find matching signed/uploaded version)
      const matchingSubmission = signedDocuments.find(s => s.category === doc.category);
      const matchingUpload = uploadedDocuments.find(u => u.category === doc.category);

      // Use the submission or upload if available, otherwise use the requirement
      const docToAdd = matchingSubmission || matchingUpload || doc;
      group.documents.push({
        ...docToAdd,
        phase: doc.phase,
        required: doc.required,
        requirement: doc.requirement,
      });

      if (doc.required) {
        group.totalRequired++;
        if (doc.status === 'signed' || doc.status === 'uploaded') {
          group.totalCompleted++;
        }
      }
    }
  }

  // Convert to sorted array
  const phaseGroups = Array.from(phaseGroupsMap.values())
    .filter(g => g.documents.length > 0 || g.totalRequired > 0)
    .sort((a, b) => a.phase - b.phase);

  // Calculate summary
  const totalRequired = requiredDocuments.filter(d => d.required).length;
  const totalCompleted = requiredDocuments.filter(
    d => d.required && (d.status === 'signed' || d.status === 'uploaded')
  ).length;
  const totalPending = requiredDocuments.filter(
    d => d.status === 'pending' || d.status === 'viewed' || d.status === 'partially_signed'
  ).length;
  const totalUploaded = uploadedDocuments.length;
  const totalSigned = signedDocuments.filter(d => d.status === 'signed').length;

  const completionPercentage = totalRequired > 0
    ? Math.round((totalCompleted / totalRequired) * 100)
    : 0;

  return {
    phaseGroups,
    allDocuments,
    uploadedDocuments,
    signedDocuments,
    requiredDocuments,
    otherDocuments,
    summary: {
      totalRequired,
      totalCompleted,
      totalPending,
      totalUploaded,
      totalSigned,
      completionPercentage,
    },
    isLoading,
    isError,
    error: error || undefined,
  };
}

// ============================================================================
// LINK DOCUMENT TO COMPLIANCE CATEGORY
// ============================================================================

/**
 * Hook to link an uploaded document to a compliance category
 */
export function useLinkDocumentToCompliance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      documentId,
      complianceCategory,
    }: {
      documentId: number;
      complianceCategory: string;
    }) => {
      const response = await api.patch<PropertyDocument>(
        `/api/documents/${documentId}`,
        { complianceCategory }
      );
      return response;
    },
    onSuccess: (_, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['property-documents'] });
      queryClient.invalidateQueries({ queryKey: ['unified-documents'] });
    },
  });
}

/**
 * Hook to unlink a document from its compliance category
 */
export function useUnlinkDocumentFromCompliance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId }: { documentId: number }) => {
      const response = await api.patch<PropertyDocument>(
        `/api/documents/${documentId}`,
        { complianceCategory: null }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-documents'] });
      queryClient.invalidateQueries({ queryKey: ['unified-documents'] });
    },
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get display info for a unified document status
 */
export function getUnifiedStatusDisplay(status: UnifiedDocumentStatus): {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
} {
  const statusConfig: Record<UnifiedDocumentStatus, {
    label: string;
    color: string;
    bgColor: string;
    icon: string;
  }> = {
    not_sent: {
      label: 'Not Sent',
      color: 'text-zinc-400',
      bgColor: 'bg-zinc-500/10 border-zinc-500/20',
      icon: 'circle',
    },
    uploaded: {
      label: 'Uploaded',
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
      icon: 'upload',
    },
    pending: {
      label: 'Pending',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
      icon: 'clock',
    },
    viewed: {
      label: 'Viewed',
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10 border-purple-500/20',
      icon: 'eye',
    },
    partially_signed: {
      label: 'Partially Signed',
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10 border-cyan-500/20',
      icon: 'pen-tool',
    },
    signed: {
      label: 'Signed',
      color: 'text-green-400',
      bgColor: 'bg-green-500/10 border-green-500/20',
      icon: 'check-circle',
    },
    declined: {
      label: 'Declined',
      color: 'text-red-400',
      bgColor: 'bg-red-500/10 border-red-500/20',
      icon: 'x-circle',
    },
    expired: {
      label: 'Expired',
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10 border-orange-500/20',
      icon: 'alert-circle',
    },
    failed: {
      label: 'Failed',
      color: 'text-red-400',
      bgColor: 'bg-red-500/10 border-red-500/20',
      icon: 'alert-triangle',
    },
  };

  return statusConfig[status] || statusConfig.not_sent;
}

/**
 * Get phase name by number
 */
export function getPhaseName(phase: number): string {
  return PHASE_NAMES[phase] || `Phase ${phase}`;
}

/**
 * Check if a document is complete (signed or uploaded for non-signing requirements)
 */
export function isDocumentComplete(doc: UnifiedDocument): boolean {
  return doc.status === 'signed' || doc.status === 'uploaded';
}

/**
 * Check if a document needs attention (declined, expired, or failed)
 */
export function documentNeedsAttention(doc: UnifiedDocument): boolean {
  return doc.status === 'declined' || doc.status === 'expired' || doc.status === 'failed';
}

// Re-export phase names for convenience
export { PHASE_NAMES };
