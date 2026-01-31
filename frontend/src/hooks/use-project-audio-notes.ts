import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectAudioNote } from '@/types';

export function useProjectAudioNotes(projectId: string) {
  return useQuery({
    queryKey: ['projectAudioNotes', projectId],
    queryFn: () => api.get<ProjectAudioNote[]>(`/api/projects/${projectId}/audio-notes`),
    enabled: !!projectId,
    // Refetch every 10 seconds to catch transcription updates
    refetchInterval: 10000,
  });
}

export function useProjectAudioNote(projectId: string, audioId: number | null) {
  return useQuery({
    queryKey: ['projectAudioNote', projectId, audioId],
    queryFn: () => api.get<ProjectAudioNote>(`/api/projects/${projectId}/audio-notes/${audioId}`),
    enabled: !!projectId && audioId !== null,
  });
}

interface CreateAudioNoteInput {
  file: File | Blob;
  language?: string;
}

export function useCreateProjectAudioNote(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAudioNoteInput | File | Blob) => {
      // Handle both old and new input format
      const file = 'file' in input ? input.file : input;
      const language = 'language' in input ? input.language : undefined;

      const formData = new FormData();
      formData.append('audio', file, file instanceof File ? file.name : 'recording.webm');
      if (language && language !== 'auto') {
        formData.append('language', language);
      }

      // Use fetch directly for FormData (api.post doesn't handle FormData well)
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects/${projectId}/audio-notes`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload audio');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectAudioNotes', projectId] });
    },
  });
}

export function useDeleteProjectAudioNote(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (audioId: number) =>
      api.delete(`/api/projects/${projectId}/audio-notes/${audioId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectAudioNotes', projectId] });
    },
  });
}

export function useRetryAudioNoteTranscription(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (audioId: number) =>
      api.post(`/api/projects/${projectId}/audio-notes/${audioId}/retranscribe`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectAudioNotes', projectId] });
    },
  });
}
