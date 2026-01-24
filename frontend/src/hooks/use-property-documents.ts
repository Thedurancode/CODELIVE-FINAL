'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Define ApiError type locally to avoid import issues
interface ApiError extends Error {
  status?: number;
}

export interface DocumentClassification {
  success: boolean;
  classifiedType: PropertyDocument['documentType'];
  confidence: number;
  allScores?: Record<string, number>;
  source: 'vision' | 'text' | 'filename' | 'mimetype' | 'manual';
  extractedFields?: Record<string, any>;
  suggestedWorkflow?: string;
  classifiedAt: string;
  classificationModel?: string;
  processingTimeMs?: number;
  wasAutoApplied: boolean;
  userOverride?: {
    previousType: PropertyDocument['documentType'];
    overriddenAt: string;
    overriddenBy?: string;
  };
}

export interface PropertyDocument {
  id: number;
  propertyId: number;
  documentType: 'contract' | 'photo' | 'inspection' | 'appraisal' | 'disclosure' | 'title' | 'other';
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  uploadedBy?: string;
  status: 'uploading' | 'ready' | 'processing' | 'classifying' | 'failed';
  complianceCategory?: string; // Links to state_document_template category
  metadata?: {
    width?: number;
    height?: number;
    pages?: number;
    extractedText?: string;
    classification?: DocumentClassification;
  };
  createdAt: string;
  updatedAt: string;
}

interface DocumentsResponse {
  documents: PropertyDocument[];
  total: number;
}

interface UploadResponse {
  documents: PropertyDocument[];
  errors: Array<{ fileName: string; error: string }>;
}

/**
 * Hook to fetch documents for a property
 */
export function usePropertyDocuments(propertyId: string) {
  return useQuery<DocumentsResponse, Error>({
    queryKey: ['property-documents', propertyId],
    queryFn: async () => {
      try {
        // API client returns full response for /api/listings/* endpoints (treated as paginated)
        // Response format: { success: true, data: PropertyDocument[], metadata: {...} }
        const response = await api.get<
          | PropertyDocument[]
          | { data?: PropertyDocument[]; documents?: PropertyDocument[] }
        >(`/api/listings/${propertyId}/documents`);

        // Handle different response formats
        let documents: PropertyDocument[] = [];
        if (Array.isArray(response)) {
          // Direct array (if api.get unwraps data)
          documents = response;
        } else if (response && typeof response === 'object') {
          // Check for 'data' property first (standard API response format)
          if ('data' in response && Array.isArray(response.data)) {
            documents = response.data;
          } else if ('documents' in response && Array.isArray(response.documents)) {
            documents = response.documents;
          }
        }

        return {
          documents,
          total: documents.length,
        };
      } catch (error) {
        console.error('Error fetching documents:', error);
        throw error;
      }
    },
    enabled: !!propertyId,
    retry: 1,
    staleTime: 0, // Always refetch
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to upload documents to a property
 */
export function useUploadDocuments(propertyId: string) {
  const queryClient = useQueryClient();

  return useMutation<UploadResponse, Error, { files: File[]; documentType?: string }>({
    mutationFn: async ({ files, documentType }) => {
      const formData = new FormData();
      files.forEach((file) => {
        // Use 'files' as the field name to match backend expectation
        formData.append('files', file);
      });
      if (documentType) {
        formData.append('documentType', documentType);
      }

      // Get token from Supabase session or localStorage (try all possible token keys)
      let token = localStorage.getItem('dispotree_token') || localStorage.getItem('codelive_token') || localStorage.getItem('token');

      try {
        const { supabase } = await import('@/lib/supabase');
        if (supabase?.auth) {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.access_token) {
            token = data.session.access_token;
          }
        }
      } catch (e) {
        // Supabase not available, use localStorage token
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/listings/${propertyId}/documents`,
        {
          method: 'POST',
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: formData,
        }
      );

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }
      return data.data;
    },
    onSuccess: () => {
      // Invalidate and immediately refetch
      queryClient.invalidateQueries({ queryKey: ['property-documents', propertyId] });
      queryClient.refetchQueries({ queryKey: ['property-documents', propertyId] });
    },
  });
}

/**
 * Hook to delete a document
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { documentId: number; propertyId: string }>({
    mutationFn: async ({ documentId }) => {
      await api.delete(`/api/documents/${documentId}`);
    },
    onSuccess: (_, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['property-documents', propertyId] });
    },
  });
}

/**
 * Hook to update a document's type
 */
export function useUpdateDocumentType() {
  const queryClient = useQueryClient();

  return useMutation<PropertyDocument, Error, { documentId: number; propertyId: string; documentType: string }>({
    mutationFn: async ({ documentId, documentType }) => {
      const response = await api.patch<PropertyDocument>(`/api/documents/${documentId}`, {
        documentType,
      });
      return response;
    },
    onSuccess: (_, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['property-documents', propertyId] });
    },
  });
}

/**
 * Hook to rename a document
 */
export function useRenameDocument() {
  const queryClient = useQueryClient();

  return useMutation<PropertyDocument, Error, { documentId: number; propertyId: string; originalName: string }>({
    mutationFn: async ({ documentId, originalName }) => {
      const response = await api.patch<PropertyDocument>(`/api/documents/${documentId}`, {
        originalName,
      });
      return response;
    },
    onSuccess: (_, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['property-documents', propertyId] });
    },
  });
}

/**
 * Get download URL for a document
 */
export function getDocumentDownloadUrl(documentId: number): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  return `${baseUrl}/api/documents/${documentId}/download`;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get icon name based on document type/mime
 */
export function getDocumentIcon(mimeType: string, documentType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'spreadsheet';

  switch (documentType) {
    case 'contract':
      return 'contract';
    case 'inspection':
      return 'inspection';
    case 'appraisal':
      return 'appraisal';
    case 'disclosure':
      return 'disclosure';
    case 'title':
      return 'title';
    default:
      return 'file';
  }
}

/**
 * Hook to classify a single document
 */
export function useClassifyDocument() {
  const queryClient = useQueryClient();

  return useMutation<
    { classification: DocumentClassification; wasAutoApplied: boolean },
    Error,
    { documentId: number; propertyId: string; autoApply?: boolean; confidenceThreshold?: number }
  >({
    mutationFn: async ({ documentId, autoApply = true, confidenceThreshold = 0.7 }) => {
      const response = await api.post<{
        classification: DocumentClassification;
        wasAutoApplied: boolean;
      }>(`/api/documents/${documentId}/classify`, {
        autoApply,
        confidenceThreshold,
      });
      return response;
    },
    onSuccess: (_, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['property-documents', propertyId] });
    },
  });
}

/**
 * Hook to override document classification
 */
export function useOverrideClassification() {
  const queryClient = useQueryClient();

  return useMutation<
    PropertyDocument,
    Error,
    { documentId: number; propertyId: string; documentType: string }
  >({
    mutationFn: async ({ documentId, documentType }) => {
      const response = await api.post<{ document: PropertyDocument }>(
        `/api/documents/${documentId}/classification/override`,
        { documentType }
      );
      return response.document;
    },
    onSuccess: (_, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['property-documents', propertyId] });
    },
  });
}

/**
 * Hook to classify all documents for a property
 */
export function useClassifyAllDocuments() {
  const queryClient = useQueryClient();

  return useMutation<
    {
      results: Array<{
        documentId: number;
        originalName: string;
        status: 'classified' | 'skipped' | 'failed';
        classification?: DocumentClassification;
        error?: string;
      }>;
      summary: { total: number; classified: number; skipped: number; failed: number };
    },
    Error,
    { propertyId: string; forceReclassify?: boolean; autoApply?: boolean }
  >({
    mutationFn: async ({ propertyId, forceReclassify = false, autoApply = true }) => {
      const response = await api.post<{
        results: any[];
        summary: any;
      }>(`/api/listings/${propertyId}/documents/classify-all`, {
        forceReclassify,
        autoApply,
      });
      return response;
    },
    onSuccess: (_, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['property-documents', propertyId] });
    },
  });
}

/**
 * Get confidence level label
 */
export function getConfidenceLabel(confidence: number): {
  label: string;
  color: string;
} {
  if (confidence >= 0.9) return { label: 'Very High', color: 'text-green-500' };
  if (confidence >= 0.7) return { label: 'High', color: 'text-emerald-500' };
  if (confidence >= 0.5) return { label: 'Medium', color: 'text-amber-500' };
  if (confidence >= 0.3) return { label: 'Low', color: 'text-orange-500' };
  return { label: 'Very Low', color: 'text-red-500' };
}

/**
 * Format classification source for display
 */
export function formatClassificationSource(source: string): string {
  const sourceLabels: Record<string, string> = {
    vision: 'AI Vision',
    text: 'Text Analysis',
    filename: 'Filename',
    mimetype: 'File Type',
    manual: 'Manual',
  };
  return sourceLabels[source] || source;
}
