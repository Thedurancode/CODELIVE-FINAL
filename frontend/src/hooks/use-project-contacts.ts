import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectContact } from '@/types';

export function useProjectContacts(projectId: string) {
  return useQuery({
    queryKey: ['projectContacts', projectId],
    queryFn: () => api.get<ProjectContact[]>(`/api/projects/${projectId}/contacts`),
    enabled: !!projectId,
  });
}

export function useAddProjectContact(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { contactId: string; role?: string; isPrimary?: boolean; notes?: string }) =>
      api.post<ProjectContact>(`/api/projects/${projectId}/contacts`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectContacts', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

export function useUpdateProjectContact(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      contactId,
      data,
    }: {
      contactId: string;
      data: { role?: string | null; isPrimary?: boolean; notes?: string | null };
    }) => api.patch<ProjectContact>(`/api/projects/${projectId}/contacts/${contactId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectContacts', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

export function useRemoveProjectContact(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      api.delete(`/api/projects/${projectId}/contacts/${contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectContacts', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

export function useInviteContactToGitHub(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      api.post<{ success: boolean; message: string }>(
        `/api/projects/${projectId}/contacts/${contactId}/github-invite`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectContacts', projectId] });
    },
  });
}
