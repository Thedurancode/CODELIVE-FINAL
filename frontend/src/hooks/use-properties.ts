import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Property, PropertyFilters, PaginatedResponse } from '@/types';

export function useProperties(filters: PropertyFilters & { enabled?: boolean } = {}) {
  const { enabled = true, ...restFilters } = filters;

  const params = new URLSearchParams();
  if (restFilters.page) params.append('page', String(restFilters.page));
  if (restFilters.limit) params.append('limit', String(restFilters.limit));
  if (restFilters.state?.length) params.append('state', restFilters.state.join(','));
  if (restFilters.minPrice) params.append('minPrice', String(restFilters.minPrice));
  if (restFilters.maxPrice) params.append('maxPrice', String(restFilters.maxPrice));
  if (restFilters.minBeds) params.append('minBeds', String(restFilters.minBeds));
  if (restFilters.maxBeds) params.append('maxBeds', String(restFilters.maxBeds));
  if (restFilters.minBaths) params.append('minBaths', String(restFilters.minBaths));
  if (restFilters.maxBaths) params.append('maxBaths', String(restFilters.maxBaths));
  if (restFilters.status) params.append('status', restFilters.status);
  if (restFilters.approvalStatus) params.append('approvalStatus', restFilters.approvalStatus);
  if (restFilters.search) params.append('search', restFilters.search);
  if (restFilters.sortBy) params.append('sortBy', restFilters.sortBy);
  if (restFilters.sortOrder) params.append('sortOrder', restFilters.sortOrder);

  // Serialize filters for stable query key (objects cause unnecessary cache invalidation)
  const filtersKey = JSON.stringify(restFilters);

  return useQuery({
    queryKey: ['properties', filtersKey],
    queryFn: () => api.get<PaginatedResponse<Property>>(`/api/listings?${params.toString()}`),
    enabled,
  });
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: ['property', id],
    queryFn: () => api.get<Property>(`/api/listings/${id}`),
    enabled: !!id,
  });
}

export function useCreateProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Property>) => api.post<Property>('/api/listings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export function useUpdateProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Property> }) =>
      api.put<Property>(`/api/listings/${id}`, data),
    // Optimistic update for smooth drag-drop
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['properties'] });

      // Snapshot the previous value
      const previousData = queryClient.getQueriesData({ queryKey: ['properties'] });

      // Optimistically update all matching queries
      queryClient.setQueriesData(
        { queryKey: ['properties'] },
        (old: PaginatedResponse<Property> | undefined) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((item: Property) =>
              String(item.id) === String(id) ? { ...item, ...data } : item
            ),
          };
        }
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export function useDeleteProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/listings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export function useBulkDeleteProperties() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) =>
      api.delete<{
        success: boolean;
        results: { deleted: number[]; notFound: number[]; errors: Array<{ id: number; error: string }> };
        metadata: { totalRequested: number; totalDeleted: number; totalNotFound: number; totalErrors: number; processingTimeMs: number };
      }>(
        '/api/listings/bulk',
        { ids: ids.map(id => parseInt(id, 10)) }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export function useEnrichProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post(`/api/listings/${id}/enrich`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['property', id] });
    },
  });
}
