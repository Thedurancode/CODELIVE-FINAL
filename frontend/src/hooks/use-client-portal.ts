/**
 * Client Portal Hooks
 *
 * React Query hooks for the client portal feature.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ClientProject,
  ClientIssue,
  ClientPullRequest,
  ClientCommit,
  ClientActivity,
  InviteDetails,
  ClientUser,
  ProjectClient,
} from '@/types/client';

// =============================================================================
// PUBLIC HOOKS (No Auth Required)
// =============================================================================

/**
 * Get invite details by token
 */
export function useInviteDetails(token: string | null) {
  return useQuery({
    queryKey: ['client-invite', token],
    queryFn: () => api.get<InviteDetails>(`/api/client/invite/${token}`),
    enabled: !!token,
    staleTime: 60000,
  });
}

/**
 * Accept invite and register
 */
export function useAcceptInvite() {
  return useMutation({
    mutationFn: ({
      token,
      email,
      password,
      name,
    }: {
      token: string;
      email: string;
      password: string;
      name: string;
    }) =>
      api.post<{ user: ClientUser; accessToken: string }>(
        `/api/client/invite/${token}/accept`,
        { email, password, name }
      ),
  });
}

// =============================================================================
// CLIENT AUTH HOOKS
// =============================================================================

/**
 * Get current client profile
 */
export function useClientProfile() {
  return useQuery({
    queryKey: ['client-profile'],
    queryFn: () => api.get<{ user: ClientUser; projectCount: number }>('/api/client/auth/me'),
    staleTime: 300000, // 5 minutes
  });
}

// =============================================================================
// CLIENT PORTAL HOOKS (Authenticated)
// =============================================================================

/**
 * Get all projects client has access to
 */
export function useClientProjects() {
  return useQuery({
    queryKey: ['client-projects'],
    queryFn: () => api.get<ClientProject[]>('/api/client/projects'),
    staleTime: 60000,
  });
}

/**
 * Get project details
 */
export function useClientProject(projectId: string | null) {
  return useQuery({
    queryKey: ['client-project', projectId],
    queryFn: () => api.get<ClientProject>(`/api/client/projects/${projectId}`),
    enabled: !!projectId,
    staleTime: 60000,
  });
}

/**
 * Get project issues
 */
export function useClientIssues(
  projectId: string | null,
  options: { state?: 'open' | 'closed' | 'all'; page?: number; perPage?: number } = {}
) {
  const { state = 'all', page = 1, perPage = 30 } = options;
  return useQuery({
    queryKey: ['client-issues', projectId, state, page, perPage],
    queryFn: () =>
      api.get<ClientIssue[]>(
        `/api/client/projects/${projectId}/issues?state=${state}&page=${page}&per_page=${perPage}`
      ),
    enabled: !!projectId,
    staleTime: 60000,
  });
}

/**
 * Get a single issue
 */
export function useClientIssue(projectId: string | null, issueNumber: number | null) {
  return useQuery({
    queryKey: ['client-issue', projectId, issueNumber],
    queryFn: () =>
      api.get<ClientIssue>(`/api/client/projects/${projectId}/issues/${issueNumber}`),
    enabled: !!projectId && !!issueNumber,
    staleTime: 60000,
  });
}

/**
 * Submit a new issue
 */
export function useSubmitIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      title,
      description,
    }: {
      projectId: string;
      title: string;
      description?: string;
    }) =>
      api.post<ClientIssue>(`/api/client/projects/${projectId}/issues`, {
        title,
        description,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client-issues', variables.projectId] });
    },
  });
}

/**
 * Get project pull requests
 */
export function useClientPullRequests(
  projectId: string | null,
  options: { state?: 'open' | 'closed' | 'all'; page?: number; perPage?: number } = {}
) {
  const { state = 'all', page = 1, perPage = 30 } = options;
  return useQuery({
    queryKey: ['client-prs', projectId, state, page, perPage],
    queryFn: () =>
      api.get<ClientPullRequest[]>(
        `/api/client/projects/${projectId}/prs?state=${state}&page=${page}&per_page=${perPage}`
      ),
    enabled: !!projectId,
    staleTime: 60000,
  });
}

/**
 * Get project commits
 */
export function useClientCommits(
  projectId: string | null,
  options: { page?: number; perPage?: number } = {}
) {
  const { page = 1, perPage = 30 } = options;
  return useQuery({
    queryKey: ['client-commits', projectId, page, perPage],
    queryFn: () =>
      api.get<ClientCommit[]>(
        `/api/client/projects/${projectId}/commits?page=${page}&per_page=${perPage}`
      ),
    enabled: !!projectId,
    staleTime: 60000,
  });
}

/**
 * Get project activity feed
 */
export function useClientActivity(projectId: string | null, limit: number = 20) {
  return useQuery({
    queryKey: ['client-activity', projectId, limit],
    queryFn: () =>
      api.get<ClientActivity[]>(`/api/client/projects/${projectId}/activity?limit=${limit}`),
    enabled: !!projectId,
    staleTime: 60000,
  });
}

// =============================================================================
// ADMIN HOOKS (Project Owners)
// =============================================================================

/**
 * Get clients for a project
 */
export function useProjectClients(projectId: string | null) {
  return useQuery({
    queryKey: ['project-clients', projectId],
    queryFn: () => api.get<ProjectClient[]>(`/api/projects/${projectId}/clients`),
    enabled: !!projectId,
    staleTime: 60000,
  });
}

/**
 * Generate invite link for a project
 */
export function useGenerateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      clientEmail,
      expiresInDays,
      sendEmail = true,
    }: {
      projectId: string;
      clientEmail?: string;
      expiresInDays?: number;
      sendEmail?: boolean;
    }) =>
      api.post<{ inviteToken: string; inviteUrl: string; expiresAt: string; emailSent: boolean }>(
        `/api/projects/${projectId}/clients/invite`,
        { clientEmail, expiresInDays, sendEmail }
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-clients', variables.projectId] });
    },
  });
}

/**
 * Revoke client access
 */
export function useRevokeClientAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, clientId }: { projectId: string; clientId: number }) =>
      api.delete(`/api/projects/${projectId}/clients/${clientId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-clients', variables.projectId] });
    },
  });
}
