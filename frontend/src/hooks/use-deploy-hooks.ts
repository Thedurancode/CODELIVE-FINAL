/**
 * Deploy Hooks React Query Hooks
 *
 * Custom hooks for deploy hook management using TanStack Query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  DeployHook,
  CreateDeployHookOptions,
  UpdateDeployHookOptions,
  DeploymentResult,
  DeployProjectStats,
  TestHookResult,
} from '@/types/deployHook';

// Query keys
export const deployHookKeys = {
  all: ['deploy-hooks'] as const,
  lists: () => [...deployHookKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...deployHookKeys.lists(), filters] as const,
  details: () => [...deployHookKeys.all, 'detail'] as const,
  detail: (id: string) => [...deployHookKeys.details(), id] as const,
  byProject: (projectId: string) => [...deployHookKeys.all, 'project', projectId] as const,
  stats: (projectId: string) => [...deployHookKeys.all, 'stats', projectId] as const,
};

// ============================================================================
// HOOK QUERIES
// ============================================================================

/**
 * Fetch all deploy hooks for the organization
 */
export function useDeployHooks(projectId?: string) {
  const params = projectId ? `?projectId=${projectId}` : '';
  return useQuery({
    queryKey: deployHookKeys.list({ projectId }),
    queryFn: () => api.get<DeployHook[]>(`/api/deploy-hooks${params}`),
  });
}

/**
 * Fetch deploy hooks for a specific project
 */
export function useDeployHooksByProject(projectId: string | null | undefined) {
  return useQuery({
    queryKey: deployHookKeys.byProject(projectId ?? ''),
    queryFn: () => api.get<DeployHook[]>(`/api/deploy-hooks?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

/**
 * Fetch a single deploy hook by ID
 */
export function useDeployHook(id: string | null | undefined) {
  return useQuery({
    queryKey: deployHookKeys.detail(id ?? ''),
    queryFn: () => api.get<DeployHook>(`/api/deploy-hooks/${id}`),
    enabled: !!id,
  });
}

/**
 * Fetch deployment statistics for a project
 */
export function useDeployStats(projectId: string | null | undefined) {
  return useQuery({
    queryKey: deployHookKeys.stats(projectId ?? ''),
    queryFn: () => api.get<DeployProjectStats>(`/api/deploy-hooks/stats/${projectId}`),
    enabled: !!projectId,
  });
}

// ============================================================================
// HOOK MUTATIONS
// ============================================================================

/**
 * Create a new deploy hook
 */
export function useCreateDeployHook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options: CreateDeployHookOptions) =>
      api.post<DeployHook>('/api/deploy-hooks', options),
    onSuccess: (_, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: deployHookKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: deployHookKeys.byProject(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: deployHookKeys.stats(variables.projectId),
      });
    },
  });
}

/**
 * Update a deploy hook
 */
export function useUpdateDeployHook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: UpdateDeployHookOptions & { id: string }) =>
      api.put<DeployHook>(`/api/deploy-hooks/${id}`, updates),
    onSuccess: (data) => {
      // Update cache
      queryClient.setQueryData(deployHookKeys.detail(data.id), data);
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: deployHookKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: deployHookKeys.byProject(data.projectId),
      });
    },
  });
}

/**
 * Delete a deploy hook
 */
export function useDeleteDeployHook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) =>
      api.delete(`/api/deploy-hooks/${id}`),
    onSuccess: (_, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: deployHookKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: deployHookKeys.byProject(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: deployHookKeys.stats(variables.projectId),
      });
    },
  });
}

/**
 * Toggle hook status (active/inactive)
 */
export function useToggleDeployHook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<DeployHook>(`/api/deploy-hooks/${id}/toggle`),
    onSuccess: (data) => {
      // Update cache
      queryClient.setQueryData(deployHookKeys.detail(data.id), data);
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: deployHookKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: deployHookKeys.byProject(data.projectId),
      });
    },
  });
}

/**
 * Manually trigger a deployment
 */
export function useTriggerDeployHook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<DeploymentResult>(`/api/deploy-hooks/${id}/trigger`),
    onSuccess: (_, id) => {
      // Invalidate to refresh stats
      queryClient.invalidateQueries({ queryKey: deployHookKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: deployHookKeys.lists() });
    },
  });
}

/**
 * Test hook connection
 */
export function useTestDeployHook() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<TestHookResult>(`/api/deploy-hooks/${id}/test`),
  });
}
