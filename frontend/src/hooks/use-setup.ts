import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface SetupStatus {
  needsSetup: boolean;
  hasOrganization: boolean;
  hasUsers: boolean;
  agentConfig: {
    name: string;
    avatar: string;
  };
}

interface AgentConfig {
  name: string;
  avatar: string;
  personality: string;
}

interface InitializeParams {
  organizationName: string;
  organizationSlug?: string;
  agentName?: string;
  agentAvatar?: string;
  agentPersonality?: string;
  teamMembers?: Array<{
    email: string;
    name?: string;
    role?: 'admin' | 'user';
  }>;
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup', 'status'],
    queryFn: () => api.get<SetupStatus>('/api/setup/status'),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false,
  });
}

export function useAgentConfig() {
  return useQuery({
    queryKey: ['setup', 'agent'],
    queryFn: () => api.get<AgentConfig>('/api/setup/agent'),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useInitializeSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: InitializeParams) => api.post('/api/setup/initialize', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup'] });
    },
  });
}

export function useUpdateAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Partial<AgentConfig>) => api.put('/api/setup/agent', config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup', 'agent'] });
    },
  });
}
