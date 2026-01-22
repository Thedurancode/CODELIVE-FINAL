import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { HedgeFundBuyBox, BuyBoxCriteria } from '@/types';

// API payload format (snake_case for backend)
interface CreateBuyBoxPayload {
  fund_name: string;
  fund_type?: string;
  description?: string;
  criteria: BuyBoxCriteria;
  contact_email?: string;
  contact_phone?: string;
  active?: boolean;
  priority?: number;
  auto_submit?: boolean;
  auto_submit_threshold?: number;
}

export function useBuyBoxes() {
  return useQuery({
    queryKey: ['buyboxes'],
    queryFn: async () => {
      const response = await api.get<HedgeFundBuyBox[] | { data: HedgeFundBuyBox[] }>('/api/hedgefunds/buyboxes');
      // Handle both array and paginated response formats
      return Array.isArray(response) ? response : (response?.data || []);
    },
  });
}

export function useBuyBox(id: string) {
  return useQuery({
    queryKey: ['buybox', id],
    queryFn: () => api.get<HedgeFundBuyBox>(`/api/ai/buybox/${id}`),
    enabled: !!id,
  });
}

export function useCreateBuyBox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBuyBoxPayload) =>
      api.post<HedgeFundBuyBox>('/api/ai/buybox/create', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyboxes'] });
    },
  });
}

export function useUpdateBuyBox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateBuyBoxPayload> }) =>
      api.put<HedgeFundBuyBox>(`/api/ai/buybox/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['buyboxes'] });
      queryClient.invalidateQueries({ queryKey: ['buybox', id] });
    },
  });
}

export function useDeleteBuyBox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/ai/buybox/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyboxes'] });
    },
  });
}

export function useToggleBuyBox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.put<HedgeFundBuyBox>(`/api/ai/buybox/${id}`, { active: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyboxes'] });
    },
  });
}
