import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PropertyInquiry, InquiryFilters, InquiryStats, PaginatedResponse } from '@/types';

/**
 * Hook to fetch pending inquiries (for sellers/admins)
 */
export function useInquiries(filters: InquiryFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  if (filters.propertyId) params.append('propertyId', String(filters.propertyId));
  if (filters.buyerId) params.append('buyerId', filters.buyerId);
  if (filters.category) params.append('category', filters.category);
  if (filters.priority) params.append('priority', filters.priority);
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['inquiries', filtersKey],
    queryFn: () => api.get<PaginatedResponse<PropertyInquiry>>(`/api/inquiries?${params.toString()}`),
  });
}

/**
 * Hook to fetch a single inquiry by ID
 */
export function useInquiry(id: number | string) {
  return useQuery({
    queryKey: ['inquiry', id],
    queryFn: () => api.get<PropertyInquiry>(`/api/inquiries/${id}`),
    enabled: !!id,
  });
}

/**
 * Hook to fetch inquiry statistics
 */
export function useInquiryStats() {
  return useQuery({
    queryKey: ['inquiry-stats'],
    queryFn: () => api.get<InquiryStats>('/api/inquiries/stats'),
  });
}

/**
 * Hook to fetch inquiries for a specific property
 */
export function usePropertyInquiries(propertyId: number | string, filters: Omit<InquiryFilters, 'propertyId'> = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));

  return useQuery({
    queryKey: ['property-inquiries', propertyId, filters],
    queryFn: () => api.get<PaginatedResponse<PropertyInquiry>>(`/api/inquiries/property/${propertyId}?${params.toString()}`),
    enabled: !!propertyId,
  });
}

/**
 * Hook to answer an inquiry
 */
export function useAnswerInquiry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, response }: { id: number; response: string }) =>
      api.post<PropertyInquiry>(`/api/inquiries/${id}/answer`, { response }),
    onSuccess: (_, { id }) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      queryClient.invalidateQueries({ queryKey: ['inquiry', id] });
      queryClient.invalidateQueries({ queryKey: ['inquiry-stats'] });
    },
  });
}

/**
 * Hook to cancel an inquiry
 */
export function useCancelInquiry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.post<PropertyInquiry>(`/api/inquiries/${id}/cancel`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      queryClient.invalidateQueries({ queryKey: ['inquiry', id] });
      queryClient.invalidateQueries({ queryKey: ['inquiry-stats'] });
    },
  });
}

/**
 * Hook to fetch buyer's own inquiries
 */
export function useMyInquiries(filters: Omit<InquiryFilters, 'buyerId'> = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['my-inquiries', filtersKey],
    queryFn: () => api.get<PaginatedResponse<PropertyInquiry>>(`/api/inquiries/my?${params.toString()}`),
  });
}
