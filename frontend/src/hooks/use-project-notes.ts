import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectNote } from '@/types';

export function useProjectNotes(projectId: string) {
  return useQuery({
    queryKey: ['projectNotes', projectId],
    queryFn: () => api.get<ProjectNote[]>(`/api/projects/${projectId}/notes`),
    enabled: !!projectId,
  });
}

export function useCreateProjectNote(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string; subject?: string }) =>
      api.post<ProjectNote>(`/api/projects/${projectId}/notes`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectNotes', projectId] });
    },
  });
}

export function useUpdateProjectNote(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      noteId,
      data,
    }: {
      noteId: number;
      data: { content?: string; subject?: string | null };
    }) => api.patch<ProjectNote>(`/api/projects/${projectId}/notes/${noteId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectNotes', projectId] });
    },
  });
}

export function useDeleteProjectNote(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: number) =>
      api.delete(`/api/projects/${projectId}/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectNotes', projectId] });
    },
  });
}

export function useCreateGitHubIssueFromNote(projectId: string) {
  return useMutation({
    mutationFn: ({ noteId, labels }: { noteId: number; labels?: string[] }) =>
      api.post<{ issueNumber: number; issueUrl: string; title: string }>(
        `/api/projects/${projectId}/notes/${noteId}/github-issue`,
        { labels }
      ),
  });
}
