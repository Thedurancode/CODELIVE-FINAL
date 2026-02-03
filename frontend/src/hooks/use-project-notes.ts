import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectNote } from '@/types';

export function useProjectNotes(projectId: string) {
  return useQuery({
    queryKey: ['projectNotes', projectId],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectNote[] }>(`/api/projects/${projectId}/notes`);
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectNote(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { content: string; subject?: string }) => {
      const response = await api.post<{ data: ProjectNote }>(`/api/projects/${projectId}/notes`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectNotes', projectId] });
    },
  });
}

export function useUpdateProjectNote(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      noteId,
      data,
    }: {
      noteId: number;
      data: { content?: string; subject?: string | null };
    }) => {
      const response = await api.patch<{ data: ProjectNote }>(`/api/projects/${projectId}/notes/${noteId}`, data);
      return response.data;
    },
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
    mutationFn: async ({ noteId, labels }: { noteId: number; labels?: string[] }) => {
      const response = await api.post<{ data: { issueNumber: number; issueUrl: string; title: string } }>(
        `/api/projects/${projectId}/notes/${noteId}/github-issue`,
        { labels }
      );
      return response.data;
    },
  });
}

// Mentionable users for @mention autocomplete
export interface MentionableUser {
  id: string;
  name: string;
  email: string;
  type: 'user' | 'contact';
}

export function useMentionableUsers(projectId: string) {
  return useQuery({
    queryKey: ['mentionableUsers', projectId],
    queryFn: async () => {
      const response = await api.get<{ data: MentionableUser[] }>(`/api/projects/${projectId}/mentionable-users`);
      return response.data;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// Note Attachments
export interface NoteAttachment {
  id: number;
  noteId: number;
  projectId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  type: 'image' | 'document' | 'audio' | 'video' | 'other';
  metadata?: Record<string, unknown>;
  createdAt: string;
  uploader?: {
    id: string;
    name?: string;
    email?: string;
  };
  githubUrl?: string; // URL to file in GitHub repo (if synced)
  usedLfs?: boolean; // True if stored via Git LFS
  lfsOid?: string; // LFS object ID (SHA-256)
  // Cloud storage info
  storageType?: 'local' | 'github' | 'wasabi'; // Where the file is stored
  wasabiUrl?: string; // URL to file in Wasabi cloud storage
  wasabiKey?: string; // Wasabi storage key
}

export function useNoteAttachments(projectId: string, noteId: number) {
  return useQuery({
    queryKey: ['noteAttachments', projectId, noteId],
    queryFn: async () => {
      const response = await api.get<{ data: NoteAttachment[] }>(`/api/projects/${projectId}/notes/${noteId}/attachments`);
      return response.data;
    },
    enabled: !!projectId && !!noteId,
  });
}

export function useUploadNoteAttachment(projectId: string, noteId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<NoteAttachment>(
        `/api/projects/${projectId}/notes/${noteId}/attachments`,
        formData
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['noteAttachments', projectId, noteId] });
    },
  });
}

export function useDeleteNoteAttachment(projectId: string, noteId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: number) =>
      api.delete(`/api/projects/${projectId}/notes/${noteId}/attachments/${attachmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['noteAttachments', projectId, noteId] });
    },
  });
}
