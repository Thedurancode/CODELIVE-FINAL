/**
 * Vercel React Query Hooks
 *
 * Custom hooks for Vercel project management using TanStack Query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  VercelProject,
  VercelDeployment,
  VercelEnvVar,
  VercelStatus,
  VercelDomain,
  CreateVercelProjectOptions,
  CreateVercelEnvVarOptions,
  AddVercelDomainOptions,
} from '@/types/vercel';

// Query keys
export const vercelKeys = {
  all: ['vercel'] as const,
  status: () => [...vercelKeys.all, 'status'] as const,
  projects: () => [...vercelKeys.all, 'projects'] as const,
  project: (idOrName: string) => [...vercelKeys.all, 'project', idOrName] as const,
  envVars: (projectId: string) => [...vercelKeys.all, 'env', projectId] as const,
  deployments: (projectId: string) => [...vercelKeys.all, 'deployments', projectId] as const,
  domains: (projectId: string) => [...vercelKeys.all, 'domains', projectId] as const,
};

// ============================================================================
// STATUS
// ============================================================================

export function useVercelStatus() {
  return useQuery({
    queryKey: vercelKeys.status(),
    queryFn: () => api.get<VercelStatus>('/api/vercel/status'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================================================
// PROJECTS
// ============================================================================

export function useVercelProjects() {
  return useQuery({
    queryKey: vercelKeys.projects(),
    queryFn: () => api.get<VercelProject[]>('/api/vercel/projects'),
  });
}

export function useVercelProject(idOrName: string | null | undefined) {
  return useQuery({
    queryKey: vercelKeys.project(idOrName ?? ''),
    queryFn: () => api.get<VercelProject>(`/api/vercel/projects/${idOrName}`),
    enabled: !!idOrName,
  });
}

export function useCreateVercelProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options: CreateVercelProjectOptions) =>
      api.post<VercelProject>('/api/vercel/projects', options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vercelKeys.projects() });
    },
  });
}

export function useDeleteVercelProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (idOrName: string) =>
      api.delete(`/api/vercel/projects/${idOrName}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vercelKeys.projects() });
    },
  });
}

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

export function useVercelEnvVars(projectId: string | null | undefined) {
  return useQuery({
    queryKey: vercelKeys.envVars(projectId ?? ''),
    queryFn: () => api.get<VercelEnvVar[]>(`/api/vercel/projects/${projectId}/env`),
    enabled: !!projectId,
  });
}

export function useCreateVercelEnvVar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, ...options }: CreateVercelEnvVarOptions & { projectId: string }) =>
      api.post<VercelEnvVar>(`/api/vercel/projects/${projectId}/env`, options),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: vercelKeys.envVars(variables.projectId),
      });
    },
  });
}

export function useUpdateVercelEnvVar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      envId,
      ...updates
    }: Partial<CreateVercelEnvVarOptions> & { projectId: string; envId: string }) =>
      api.patch<VercelEnvVar>(`/api/vercel/projects/${projectId}/env/${envId}`, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: vercelKeys.envVars(variables.projectId),
      });
    },
  });
}

export function useDeleteVercelEnvVar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, envId }: { projectId: string; envId: string }) =>
      api.delete(`/api/vercel/projects/${projectId}/env/${envId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: vercelKeys.envVars(variables.projectId),
      });
    },
  });
}

// ============================================================================
// DEPLOYMENTS
// ============================================================================

export function useVercelDeployments(projectId: string | null | undefined, limit?: number) {
  const params = limit ? `?limit=${limit}` : '';
  return useQuery({
    queryKey: vercelKeys.deployments(projectId ?? ''),
    queryFn: () =>
      api.get<VercelDeployment[]>(`/api/vercel/projects/${projectId}/deployments${params}`),
    enabled: !!projectId,
    refetchInterval: 30000, // Poll every 30s for deployment status
  });
}

export function useCreateVercelDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      target,
      gitBranch,
    }: {
      projectId: string;
      target?: 'production' | 'preview';
      gitBranch?: string;
    }) =>
      api.post<VercelDeployment>(`/api/vercel/projects/${projectId}/deployments`, {
        target,
        gitBranch,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: vercelKeys.deployments(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: vercelKeys.project(variables.projectId),
      });
    },
  });
}

// ============================================================================
// DOMAINS
// ============================================================================

export function useVercelDomains(projectId: string | null | undefined) {
  return useQuery({
    queryKey: vercelKeys.domains(projectId ?? ''),
    queryFn: () => api.get<VercelDomain[]>(`/api/vercel/projects/${projectId}/domains`),
    enabled: !!projectId,
  });
}

export function useAddVercelDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, ...options }: AddVercelDomainOptions & { projectId: string }) =>
      api.post<VercelDomain>(`/api/vercel/projects/${projectId}/domains`, options),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: vercelKeys.domains(variables.projectId),
      });
    },
  });
}

export function useRemoveVercelDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, domain }: { projectId: string; domain: string }) =>
      api.delete(`/api/vercel/projects/${projectId}/domains/${domain}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: vercelKeys.domains(variables.projectId),
      });
    },
  });
}

export function useVerifyVercelDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, domain }: { projectId: string; domain: string }) =>
      api.post<VercelDomain>(`/api/vercel/projects/${projectId}/domains/${domain}/verify`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: vercelKeys.domains(variables.projectId),
      });
    },
  });
}
