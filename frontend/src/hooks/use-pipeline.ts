import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DealPipeline } from '@/types';

export function usePipeline() {
  return useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api.get<DealPipeline[]>('/api/pipeline'),
  });
}

export function useAddToPipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ propertyId, stage }: { propertyId: string; stage: string }) =>
      api.post<DealPipeline>('/api/pipeline', { propertyId, stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });
}

export function useUpdatePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, stage, notes }: { id: string; stage: string; notes?: string }) =>
      api.put<DealPipeline>(`/api/pipeline/${id}`, { stage, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });
}

export function useRemoveFromPipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/pipeline/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });
}
