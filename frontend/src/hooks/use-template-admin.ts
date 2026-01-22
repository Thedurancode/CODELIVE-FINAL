/**
 * Template Admin Hooks
 *
 * React Query hooks for managing StateDocumentTemplates and DocuSeal integration.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ============================================================================
// TYPES
// ============================================================================

export interface StateDocumentTemplate {
  id: number;
  state: string;
  category: string;
  name: string;
  description?: string;
  docuSealTemplateId: number;
  docuSealTemplateName?: string;
  requiredFor?: string[];
  fieldMappings?: Record<string, any>;
  enabled: boolean;
  priority: number;
  phase?: number;
  triggerOn?: 'phase_enter' | 'phase_complete' | 'manual';
  autoSend?: boolean;
  signerRoles?: string[];
  conditionalOn?: Record<string, any>;
  expiresInDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocuSealTemplate {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  folderName?: string;
  fieldsCount: number;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
}

export interface TemplateOptions {
  categories: Array<{ value: string; label: string; description: string }>;
  triggers: Array<{ value: string; label: string; description: string }>;
  signerRoles: Array<{ value: string; label: string; description: string }>;
  phases: Array<{ value: number; label: string; description: string }>;
}

export interface FieldMappingConfig {
  defaultMappings: Record<string, { source: string; field: string; description: string }>;
  transforms: Array<{ name: string; description: string; example: string }>;
  sources: Array<{ name: string; description: string }>;
}

export interface TemplateSummary {
  state: string;
  total: number;
  configured: number;
  enabled: number;
  auto_send: number;
  phases: number[];
}

export interface TemplatePreview {
  template: {
    id: number;
    name: string;
    category: string;
    docuSealTemplateId: number;
  };
  preview: Record<string, { value: string; mapped: boolean; source?: string; field?: string }>;
  unmappedFields: Array<{ name: string; type: string; required: boolean }>;
  warnings: string[];
  sampleData: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  warnings: Array<{ level: 'error' | 'warning' | 'info'; field?: string; message: string }>;
  summary?: {
    total: number;
    mapped: number;
    required: number;
    errors: number;
    warnings: number;
  };
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List state document templates with filtering
 */
export function useTemplates(filters?: {
  state?: string;
  category?: string;
  phase?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['admin-templates', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.state) params.set('state', filters.state);
      if (filters?.category) params.set('category', filters.category);
      if (filters?.phase !== undefined) params.set('phase', filters.phase.toString());
      if (filters?.enabled !== undefined) params.set('enabled', filters.enabled.toString());

      const response = await api.get<{ success: boolean; data: StateDocumentTemplate[] }>(
        `/api/admin/templates?${params}`
      );
      return response.data;
    },
  });
}

/**
 * Get a single template
 */
export function useTemplate(id: number) {
  return useQuery({
    queryKey: ['admin-template', id],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: StateDocumentTemplate }>(
        `/api/admin/templates/${id}`
      );
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Get template options (categories, triggers, roles, phases)
 */
export function useTemplateOptions() {
  return useQuery({
    queryKey: ['admin-template-options'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: TemplateOptions }>(
        '/api/admin/templates/options'
      );
      return response.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get default field mappings
 */
export function useFieldMappings() {
  return useQuery({
    queryKey: ['admin-field-mappings'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: FieldMappingConfig }>(
        '/api/admin/templates/field-mappings'
      );
      return response.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get template summary by state
 */
export function useTemplateSummary() {
  return useQuery({
    queryKey: ['admin-template-summary'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: TemplateSummary[] }>(
        '/api/admin/templates/summary'
      );
      return response.data;
    },
  });
}

/**
 * List DocuSeal templates
 */
export function useDocuSealTemplates() {
  return useQuery({
    queryKey: ['docuseal-templates'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: DocuSealTemplate[] }>(
        '/api/admin/templates/docuseal'
      );
      return response.data;
    },
  });
}

/**
 * Get a single DocuSeal template with full field details
 */
export function useDocuSealTemplate(templateId: number) {
  return useQuery({
    queryKey: ['docuseal-template', templateId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: DocuSealTemplate }>(
        `/api/admin/templates/docuseal/${templateId}`
      );
      return response.data;
    },
    enabled: !!templateId,
  });
}

/**
 * Get template preview with sample data
 */
export function useTemplatePreview(templateId: number) {
  return useQuery({
    queryKey: ['admin-template-preview', templateId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: TemplatePreview }>(
        `/api/admin/templates/${templateId}/preview`
      );
      return response.data;
    },
    enabled: !!templateId,
  });
}

export interface TemplateDocumentInfo {
  templateId: number;
  docuSealTemplateId: number;
  name: string;
  documents: Array<{ name: string; url: string }>;
  editorUrl: string;
}

/**
 * Get template document URLs for PDF preview
 */
export function useTemplateDocument(templateId: number) {
  return useQuery({
    queryKey: ['admin-template-document', templateId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: TemplateDocumentInfo }>(
        `/api/admin/templates/${templateId}/document`
      );
      return response.data;
    },
    enabled: !!templateId,
  });
}

/**
 * Validate template field mappings
 */
export function useValidateMappings(templateId: number) {
  return useQuery({
    queryKey: ['admin-template-validation', templateId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: ValidationResult }>(
        `/api/admin/templates/${templateId}/validate`
      );
      return response.data;
    },
    enabled: !!templateId,
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new template
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<StateDocumentTemplate>) => {
      const response = await api.post<{ success: boolean; data: StateDocumentTemplate }>(
        '/api/admin/templates',
        data
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-templates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-template-summary'] });
    },
  });
}

/**
 * Update a template
 */
export function useUpdateTemplate(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<StateDocumentTemplate>) => {
      const response = await api.put<{ success: boolean; data: StateDocumentTemplate }>(
        `/api/admin/templates/${id}`,
        data
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-templates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-template', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-template-summary'] });
    },
  });
}

/**
 * Delete a template
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.delete<{ success: boolean; message: string }>(
        `/api/admin/templates/${id}`
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-templates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-template-summary'] });
    },
  });
}

/**
 * Assign a DocuSeal template to a state document template
 */
export function useAssignDocuSealTemplate(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (docuSealTemplateId: number) => {
      const response = await api.post<{ success: boolean; data: StateDocumentTemplate }>(
        `/api/admin/templates/${id}/assign`,
        { docuSealTemplateId }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-templates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-template', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-template-summary'] });
    },
  });
}

/**
 * Update field mappings for a template
 */
export function useUpdateFieldMappings(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fieldMappings: Record<string, any>) => {
      const response = await api.put<{ success: boolean; data: StateDocumentTemplate }>(
        `/api/admin/templates/${id}/field-mappings`,
        { fieldMappings }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-template', id] });
    },
  });
}

/**
 * Bulk assign DocuSeal templates
 */
export function useBulkAssignTemplates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignments: Array<{ id: number; docuSealTemplateId: number }>) => {
      const response = await api.post<{ success: boolean; data: any[]; message: string }>(
        '/api/admin/templates/bulk-assign',
        { assignments }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-templates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-template-summary'] });
    },
  });
}

/**
 * Send a test contract with sample data
 */
export function useTestSendTemplate(id: number) {
  return useMutation({
    mutationFn: async (recipientEmail: string) => {
      const response = await api.post<{
        success: boolean;
        data: {
          submissionId: number;
          templateId: number;
          templateName: string;
          recipientEmail: string;
          fieldValues: Record<string, string>;
        };
        message: string;
      }>(`/api/admin/templates/${id}/test-send`, { recipientEmail });
      return response;
    },
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get phase label
 */
export function getPhaseLabel(phase: number | undefined): string {
  const labels: Record<number, string> = {
    0: 'Account Setup',
    1: 'Property Submission',
    2: 'Compliance Review',
    3: 'Pre-Distribution',
    4: 'Offer Accepted',
    5: 'Buyer Contract',
    6: 'Closing',
  };
  return phase !== undefined ? labels[phase] || `Phase ${phase}` : 'N/A';
}

/**
 * Get trigger label
 */
export function getTriggerLabel(trigger: string | undefined): string {
  const labels: Record<string, string> = {
    phase_enter: 'On Enter',
    phase_complete: 'On Complete',
    manual: 'Manual',
  };
  return trigger ? labels[trigger] || trigger : 'Manual';
}

/**
 * Get category label
 */
export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    csa: 'CSA',
    msa: 'MSA',
    asa: 'ASA',
    purchase_contract: 'Purchase Contract',
    assignment_addendum: 'Assignment',
    seller_disclosure: 'Seller Disclosure',
    wholesaler_disclosure: 'Wholesaler Disclosure',
    equity_disclosure: 'Equity Disclosure',
    seller_acknowledgment: 'Seller Ack',
    cancellation_disclosure: 'Cancellation',
    double_close_psa: 'Double Close PSA',
    closing_disclosure: 'Closing Disclosure',
    other: 'Other',
  };
  return labels[category] || category;
}
