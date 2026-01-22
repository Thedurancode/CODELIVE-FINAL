'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DocumentTemplate {
  id: number;
  state: string;
  category: DocumentCategory;
  name: string;
  description?: string;
  docuSealTemplateId: number;
  docuSealTemplateName?: string;
  requiredFor?: string[];
  fieldMappings?: Record<string, string>;
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export type DocumentCategory =
  | 'purchase_contract'
  | 'assignment_addendum'
  | 'seller_disclosure'
  | 'lead_paint'
  | 'hoa_disclosure'
  | 'inspection_notice'
  | 'financing_addendum'
  | 'closing_instructions'
  | 'proof_of_funds'
  | 'offer_letter'
  | 'jv_agreement'
  | 'other';

export interface CreateTemplatePayload {
  state: string;
  category: DocumentCategory;
  name: string;
  description?: string;
  docuSealTemplateId: number;
  requiredFor?: string[];
  fieldMappings?: Record<string, string>;
  priority?: number;
  enabled?: boolean;
}

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string; description: string }[] = [
  { value: 'purchase_contract', label: 'Purchase Contract', description: 'Main purchase/assignment contract' },
  { value: 'assignment_addendum', label: 'Assignment Addendum', description: 'Assignment of contract addendum' },
  { value: 'seller_disclosure', label: 'Seller Disclosure', description: 'Seller property disclosure form' },
  { value: 'lead_paint', label: 'Lead Paint Disclosure', description: 'Lead-based paint disclosure (pre-1978)' },
  { value: 'hoa_disclosure', label: 'HOA Disclosure', description: 'HOA disclosure documents' },
  { value: 'inspection_notice', label: 'Inspection Notice', description: 'Inspection contingency notice' },
  { value: 'financing_addendum', label: 'Financing Addendum', description: 'Financing terms addendum' },
  { value: 'closing_instructions', label: 'Closing Instructions', description: 'Title/closing instructions' },
  { value: 'proof_of_funds', label: 'Proof of Funds', description: 'POF letter template' },
  { value: 'offer_letter', label: 'Offer Letter', description: 'Letter of Intent / Offer' },
  { value: 'jv_agreement', label: 'JV Agreement', description: 'Joint venture agreement' },
  { value: 'other', label: 'Other', description: 'Other document types' },
];

export const REQUIRED_FOR_OPTIONS = [
  { value: 'all', label: 'All Transactions' },
  { value: 'wholesaling', label: 'Wholesaling Only' },
  { value: 'retail', label: 'Retail Only' },
];

export const US_STATES = [
  { value: 'ALL', label: 'All States (Universal)' },
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

// DocuSeal template type
export interface DocuSealTemplate {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  folder_name?: string;
  fields?: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
}

// Fetch document templates
export function useDocumentTemplates(state?: string, category?: string) {
  return useQuery({
    queryKey: ['document-templates', state, category],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (state && state !== 'all') params.append('state', state);
      if (category && category !== 'all') params.append('category', category);
      const url = `/api/compliance/document-templates${params.toString() ? `?${params}` : ''}`;
      // API client auto-unwraps data.data, so response is already the templates array
      const templates = await api.get<DocumentTemplate[]>(url);
      return Array.isArray(templates) ? templates : [];
    },
    retry: 1,
    staleTime: 30000,
  });
}

// Fetch DocuSeal templates (for selection)
export function useDocuSealTemplates() {
  return useQuery({
    queryKey: ['docuseal-templates'],
    queryFn: async () => {
      // api.get auto-unwraps data.data, so response is already the templates array
      const templates = await api.get<DocuSealTemplate[]>('/api/compliance/document-templates/docuseal');
      return Array.isArray(templates) ? templates : [];
    },
    retry: false, // Don't retry if DocuSeal is not configured
    staleTime: 60000,
  });
}

// Create a document template
export function useCreateDocumentTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTemplatePayload) => {
      // API client auto-unwraps data.data, so response is already the template
      const template = await api.post<DocumentTemplate>('/api/compliance/document-templates', data);
      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
    },
  });
}

// Create multiple document templates at once
export function useCreateMultipleDocumentTemplates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templates: CreateTemplatePayload[]) => {
      // API client auto-unwraps data.data, so each result is already the template
      const results = await Promise.all(
        templates.map(data =>
          api.post<DocumentTemplate>('/api/compliance/document-templates', data)
        )
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
    },
  });
}

// Update a document template
export function useUpdateDocumentTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CreateTemplatePayload> }) => {
      // API client auto-unwraps data.data
      const template = await api.put<DocumentTemplate>(`/api/compliance/document-templates/${id}`, data);
      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
    },
  });
}

// Delete a document template
export function useDeleteDocumentTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/compliance/document-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
    },
  });
}

// Toggle enabled status
export function useToggleDocumentTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      // API client auto-unwraps data.data
      const template = await api.put<DocumentTemplate>(`/api/compliance/document-templates/${id}`, { enabled });
      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
    },
  });
}
