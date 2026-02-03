import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectEnvVariable } from '@/types';

export function useProjectEnvVariables(projectId: string) {
  return useQuery({
    queryKey: ['projectEnvVariables', projectId],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectEnvVariable[] }>(`/api/projects/${projectId}/env-variables`);
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectEnvVariable(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; value: string; description?: string }) =>
      api.post<ProjectEnvVariable>(`/api/projects/${projectId}/env-variables`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectEnvVariables', projectId] });
    },
  });
}

export function useUpdateProjectEnvVariable(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ envId, data }: { envId: number; data: { name?: string; value?: string; description?: string } }) =>
      api.patch<ProjectEnvVariable>(`/api/projects/${projectId}/env-variables/${envId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectEnvVariables', projectId] });
    },
  });
}

export function useDeleteProjectEnvVariable(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (envId: number) =>
      api.delete(`/api/projects/${projectId}/env-variables/${envId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectEnvVariables', projectId] });
    },
  });
}

export function useGetEnvVariableValue(projectId: string) {
  return useMutation({
    mutationFn: async (envId: number) => {
      const response = await api.get<{ data: { value: string } }>(`/api/projects/${projectId}/env-variables/${envId}/value`);
      return response.data;
    },
  });
}
