'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface KnowledgeEntry {
  id: number;
  state: string;
  type: KnowledgeType;
  title: string;
  content: string;
  summary?: string;
  category?: string;
  tags?: string[];
  sourceUrl?: string;
  sourceName?: string;
  effectiveDate?: string;
  expirationDate?: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeType =
  | 'law'
  | 'regulation'
  | 'legal_requirement'
  | 'form'
  | 'license_info'
  | 'fee_structure'
  | 'timeline'
  | 'disclosure'
  | 'restriction'
  | 'penalty'
  | 'case_law'
  | 'best_practice'
  | 'contact'
  | 'link'
  | 'note';

export interface CreateKnowledgePayload {
  state: string;
  type: KnowledgeType;
  title: string;
  content: string;
  summary?: string;
  category?: string;
  tags?: string[];
  sourceUrl?: string;
  sourceName?: string;
  effectiveDate?: string;
  expirationDate?: string;
  priority?: number;
  enabled?: boolean;
}

export const KNOWLEDGE_TYPES: { value: KnowledgeType; label: string; description: string }[] = [
  { value: 'law', label: 'Law', description: 'State statutes and laws' },
  { value: 'regulation', label: 'Regulation', description: 'Administrative rules' },
  { value: 'legal_requirement', label: 'Legal Requirement', description: 'Practical legal requirements' },
  { value: 'form', label: 'Form', description: 'Required forms and documents' },
  { value: 'license_info', label: 'License Info', description: 'Licensing requirements' },
  { value: 'fee_structure', label: 'Fee Structure', description: 'Recording fees, transfer taxes' },
  { value: 'timeline', label: 'Timeline', description: 'Required timelines' },
  { value: 'disclosure', label: 'Disclosure', description: 'Disclosure requirements' },
  { value: 'restriction', label: 'Restriction', description: 'What is NOT allowed' },
  { value: 'penalty', label: 'Penalty', description: 'Penalties for violations' },
  { value: 'case_law', label: 'Case Law', description: 'Relevant court cases' },
  { value: 'best_practice', label: 'Best Practice', description: 'Recommended practices' },
  { value: 'contact', label: 'Contact', description: 'State board contacts' },
  { value: 'link', label: 'Link', description: 'External resource links' },
  { value: 'note', label: 'Note', description: 'General notes' },
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

// Fetch knowledge entries
export function useKnowledgeEntries(state?: string, type?: string) {
  return useQuery({
    queryKey: ['compliance-knowledge', state, type],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (state && state !== 'all') params.append('state', state);
      if (type && type !== 'all') params.append('type', type);
      const url = `/api/compliance/knowledge${params.toString() ? `?${params}` : ''}`;
      const response = await api.get<KnowledgeEntry[]>(url);
      return Array.isArray(response) ? response : [];
    },
    retry: 1,
    staleTime: 30000,
  });
}

// Get a single knowledge entry
export function useKnowledgeEntry(id: number) {
  return useQuery({
    queryKey: ['compliance-knowledge', id],
    queryFn: async () => {
      const response = await api.get<KnowledgeEntry>(`/api/compliance/knowledge/${id}`);
      return response;
    },
    enabled: !!id,
  });
}

// Create a knowledge entry
export function useCreateKnowledgeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateKnowledgePayload) => {
      const response = await api.post<KnowledgeEntry>('/api/compliance/knowledge', data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-knowledge'] });
    },
  });
}

// Update a knowledge entry
export function useUpdateKnowledgeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CreateKnowledgePayload> }) => {
      const response = await api.put<KnowledgeEntry>(`/api/compliance/knowledge/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-knowledge'] });
    },
  });
}

// Delete a knowledge entry
export function useDeleteKnowledgeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/compliance/knowledge/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-knowledge'] });
    },
  });
}

// Toggle enabled status
export function useToggleKnowledgeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const response = await api.put<KnowledgeEntry>(`/api/compliance/knowledge/${id}`, { enabled });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-knowledge'] });
    },
  });
}

// Seed default knowledge
export function useSeedDefaultKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ message: string; totalEntries: number }>('/api/compliance/knowledge/seed');
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-knowledge'] });
    },
  });
}
