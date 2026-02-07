/**
 * Fly.io React Query Hooks
 *
 * Custom hooks for Fly.io app and machine management using TanStack Query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  FlyApp,
  FlyMachine,
  FlyCertificate,
  FlySecret,
  FlyStatus,
  CreateFlyAppOptions,
} from '@/types/fly';

// Query keys
export const flyKeys = {
  all: ['fly'] as const,
  status: () => [...flyKeys.all, 'status'] as const,
  apps: () => [...flyKeys.all, 'apps'] as const,
  app: (name: string) => [...flyKeys.all, 'app', name] as const,
  machines: (appName: string) => [...flyKeys.all, 'machines', appName] as const,
  certificates: (appName: string) => [...flyKeys.all, 'certificates', appName] as const,
  secrets: (appName: string) => [...flyKeys.all, 'secrets', appName] as const,
};

// ============================================================================
// STATUS
// ============================================================================

export function useFlyStatus() {
  return useQuery({
    queryKey: flyKeys.status(),
    queryFn: () => api.get<FlyStatus>('/api/fly/status'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================================================
// APPS
// ============================================================================

export function useFlyApps() {
  return useQuery({
    queryKey: flyKeys.apps(),
    queryFn: () => api.get<FlyApp[]>('/api/fly/apps'),
  });
}

export function useFlyApp(appName: string | null | undefined) {
  return useQuery({
    queryKey: flyKeys.app(appName ?? ''),
    queryFn: () => api.get<FlyApp>(`/api/fly/apps/${appName}`),
    enabled: !!appName,
  });
}

export function useCreateFlyApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options: CreateFlyAppOptions) =>
      api.post<FlyApp>('/api/fly/apps', options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flyKeys.apps() });
    },
  });
}

// ============================================================================
// MACHINES
// ============================================================================

export function useFlyMachines(appName: string | null | undefined) {
  return useQuery({
    queryKey: flyKeys.machines(appName ?? ''),
    queryFn: () => api.get<FlyMachine[]>(`/api/fly/apps/${appName}/machines`),
    enabled: !!appName,
    refetchInterval: 15000, // Poll every 15s for machine state changes
  });
}

export function useStartFlyMachine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appName, machineId }: { appName: string; machineId: string }) =>
      api.post(`/api/fly/apps/${appName}/machines/${machineId}/start`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: flyKeys.machines(variables.appName),
      });
    },
  });
}

export function useStopFlyMachine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appName, machineId }: { appName: string; machineId: string }) =>
      api.post(`/api/fly/apps/${appName}/machines/${machineId}/stop`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: flyKeys.machines(variables.appName),
      });
    },
  });
}

export function useRestartFlyMachine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appName, machineId }: { appName: string; machineId: string }) =>
      api.post(`/api/fly/apps/${appName}/machines/${machineId}/restart`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: flyKeys.machines(variables.appName),
      });
    },
  });
}

export function useDeleteFlyMachine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appName, machineId }: { appName: string; machineId: string }) =>
      api.delete(`/api/fly/apps/${appName}/machines/${machineId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: flyKeys.machines(variables.appName),
      });
    },
  });
}

// ============================================================================
// CERTIFICATES
// ============================================================================

export function useFlyCertificates(appName: string | null | undefined) {
  return useQuery({
    queryKey: flyKeys.certificates(appName ?? ''),
    queryFn: () => api.get<FlyCertificate[]>(`/api/fly/apps/${appName}/certificates`),
    enabled: !!appName,
  });
}

export function useAddFlyCertificate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appName, hostname }: { appName: string; hostname: string }) =>
      api.post<FlyCertificate>(`/api/fly/apps/${appName}/certificates`, { hostname }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: flyKeys.certificates(variables.appName),
      });
    },
  });
}

export function useDeleteFlyCertificate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appName, hostname }: { appName: string; hostname: string }) =>
      api.delete(`/api/fly/apps/${appName}/certificates/${hostname}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: flyKeys.certificates(variables.appName),
      });
    },
  });
}

export function useCheckFlyCertificate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appName, hostname }: { appName: string; hostname: string }) =>
      api.post<FlyCertificate>(`/api/fly/apps/${appName}/certificates/${hostname}/check`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: flyKeys.certificates(variables.appName),
      });
    },
  });
}

// ============================================================================
// SECRETS
// ============================================================================

export function useFlySecrets(appName: string | null | undefined) {
  return useQuery({
    queryKey: flyKeys.secrets(appName ?? ''),
    queryFn: () => api.get<FlySecret[]>(`/api/fly/apps/${appName}/secrets`),
    enabled: !!appName,
  });
}

export function useSetFlySecrets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appName, secrets }: { appName: string; secrets: Array<{ key: string; value: string }> }) =>
      api.post(`/api/fly/apps/${appName}/secrets`, { secrets }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: flyKeys.secrets(variables.appName),
      });
    },
  });
}
