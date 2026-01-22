import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Contact, ContactFilters, PaginatedResponse, PropertyContact } from '@/types';

export function useContacts(filters: ContactFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.type) params.append('type', filters.type);
  if (filters.status) params.append('status', filters.status);
  if (filters.search) params.append('search', filters.search);
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['contacts', filtersKey],
    queryFn: () => api.get<PaginatedResponse<Contact>>(`/api/contacts?${params.toString()}`),
  });
}

interface ContactResponse {
  success: boolean;
  data: Contact;
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: async () => {
      const response = await api.get<ContactResponse | Contact>(`/api/contacts/${id}`);
      // Handle wrapped response due to /api/contacts prefix matching paginated endpoints
      if (response && typeof response === 'object' && 'data' in response && 'success' in response) {
        return (response as ContactResponse).data;
      }
      return response as Contact;
    },
    enabled: !!id,
  });
}

interface ContactPropertiesResponse {
  success: boolean;
  data: PropertyContact[];
}

export function useContactProperties(contactId: string) {
  return useQuery({
    queryKey: ['contactProperties', contactId],
    queryFn: async () => {
      const response = await api.get<ContactPropertiesResponse | PropertyContact[]>(`/api/contacts/${contactId}/properties`);
      // Handle both wrapped and unwrapped responses
      if (Array.isArray(response)) {
        return response;
      }
      if (response && typeof response === 'object' && 'data' in response) {
        return response.data || [];
      }
      return [];
    },
    enabled: !!contactId,
  });
}

export function useContactStats() {
  return useQuery({
    queryKey: ['contactStats'],
    queryFn: () => api.get<{ total: number; byType: Record<string, number>; byStatus: Record<string, number> }>('/api/contacts/stats'),
  });
}

export function useSearchContacts(query: string, limit: number = 10) {
  return useQuery({
    queryKey: ['contactSearch', query],
    queryFn: () => api.get<Contact[]>(`/api/contacts/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    enabled: query.length >= 2,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Contact>) => api.post<Contact>('/api/contacts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactStats'] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) =>
      api.patch<Contact>(`/api/contacts/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', id] });
      queryClient.invalidateQueries({ queryKey: ['contactStats'] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactStats'] });
    },
  });
}

export function useBulkImportContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contacts: Partial<Contact>[]) =>
      api.post<Contact[]>('/api/contacts/bulk', { contacts }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactStats'] });
      queryClient.invalidateQueries({ queryKey: ['contactTags'] });
    },
  });
}

// Tag types
export interface ContactTag {
  tag: string;
  count: number;
}

/**
 * Get all unique tags with counts
 */
export function useContactTags() {
  return useQuery({
    queryKey: ['contactTags'],
    queryFn: () => api.get<ContactTag[]>('/api/contacts/tags'),
  });
}

/**
 * Add tags to multiple contacts
 */
export function useBulkAddTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ contactIds, tags }: { contactIds: string[]; tags: string[] }) =>
      api.post<{ updatedCount: number }>('/api/contacts/bulk/tags', { contactIds, tags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactTags'] });
    },
  });
}

/**
 * Remove tags from multiple contacts
 */
export function useBulkRemoveTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ contactIds, tags }: { contactIds: string[]; tags: string[] }) =>
      api.delete<{ updatedCount: number }>('/api/contacts/bulk/tags', { contactIds, tags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactTags'] });
    },
  });
}

/**
 * Delete multiple contacts
 */
export function useBulkDeleteContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactIds: string[]) =>
      api.post<{ deletedCount: number }>('/api/contacts/bulk/delete', { contactIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactStats'] });
      queryClient.invalidateQueries({ queryKey: ['contactTags'] });
    },
  });
}

/**
 * Promote a contact to team member
 * Creates a MarketplaceUser account if needed and sets role to team_member
 */
export function useMakeTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactId: string) =>
      api.post<{ contact: Contact; user: { id: string; email: string; name: string; role: string } | null }>(
        `/api/contacts/${contactId}/make-team-member`
      ),
    onSuccess: (_, contactId) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contactTags'] });
    },
  });
}

/**
 * Helper: Get consistent color for a tag based on its name
 */
const TAG_COLORS = [
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-green-500/20 text-green-400 border-green-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'bg-red-500/20 text-red-400 border-red-500/30',
  'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
];

export function getTagColor(tag: string): string {
  const hash = tag.toLowerCase().split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}
