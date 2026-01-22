import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Buyer, BuyerFilters, BuyerStats, MatchedBuyer, PaginatedResponse } from '@/types';

export function useBuyers(filters: BuyerFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.search) params.append('search', filters.search);
  if (filters.county) params.append('county', filters.county);
  if (filters.state) params.append('state', filters.state);
  if (filters.zip) params.append('zip', filters.zip);
  if (filters.status) params.append('status', filters.status);
  if (filters.hotOnly) params.append('hotOnly', 'true');
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['buyers', filtersKey],
    queryFn: () => api.get<PaginatedResponse<Buyer>>(`/api/buyers?${params.toString()}`),
  });
}

export function useBuyer(id: string) {
  return useQuery({
    queryKey: ['buyer', id],
    queryFn: () => api.get<Buyer>(`/api/buyers/${id}`),
    enabled: !!id,
  });
}

export function useBuyerStats() {
  return useQuery({
    queryKey: ['buyerStats'],
    queryFn: () => api.get<BuyerStats>('/api/buyers/stats'),
  });
}

export function useHotBuyers(state?: string) {
  const params = state ? `?state=${state}` : '';
  return useQuery({
    queryKey: ['hotBuyers', state],
    queryFn: () => api.get<Buyer[]>(`/api/buyers/hot${params}`),
  });
}

export function useSearchBuyers(query: string, limit: number = 10) {
  return useQuery({
    queryKey: ['buyerSearch', query],
    queryFn: () => api.get<Buyer[]>(`/api/buyers/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    enabled: query.length >= 2,
  });
}

export function useMatchedBuyers(propertyId: string | number) {
  return useQuery({
    queryKey: ['matchedBuyers', propertyId],
    queryFn: () =>
      api.get<{
        data: MatchedBuyer[];
        meta: {
          total: number;
          hotBuyers: number;
          zipcodeMatches: number;
          countyMatches: number;
        };
      }>(`/api/buyers/match/${propertyId}`),
    enabled: !!propertyId,
  });
}

export function useCreateBuyer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Buyer>) => api.post<Buyer>('/api/buyers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
      queryClient.invalidateQueries({ queryKey: ['buyerStats'] });
    },
  });
}

export function useUpdateBuyer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Buyer> }) =>
      api.patch<Buyer>(`/api/buyers/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
      queryClient.invalidateQueries({ queryKey: ['buyer', id] });
      queryClient.invalidateQueries({ queryKey: ['buyerStats'] });
    },
  });
}

export function useDeleteBuyer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/buyers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
      queryClient.invalidateQueries({ queryKey: ['buyerStats'] });
    },
  });
}

export function useImportBuyers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (csvContent: string) =>
      api.post<{ imported: number; errors: string[]; totalErrors: number }>('/api/buyers/import', { csvContent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
      queryClient.invalidateQueries({ queryKey: ['buyerStats'] });
    },
  });
}
