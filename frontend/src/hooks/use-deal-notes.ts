'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DealNote {
  id: number;
  propertyId: number;
  content: string;
  subject?: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    email?: string;
  };
}

interface NotesResponse {
  success: boolean;
  data: DealNote[];
  count: number;
}

interface CreateNoteInput {
  content: string;
  subject?: string;
}

interface UpdateNoteInput {
  content?: string;
  subject?: string;
}

// Normalize propertyId to string for consistent query keys
const normalizePropertyId = (id: string | number | null): string | null =>
  id ? String(id) : null;

/**
 * Hook to fetch notes for a specific property
 */
export function useDealNotes(propertyId: string | number | null) {
  const normalizedId = normalizePropertyId(propertyId);

  return useQuery<DealNote[], Error>({
    queryKey: ['deal-notes', normalizedId],
    queryFn: async () => {
      const response = await api.get<DealNote[] | NotesResponse>(
        `/api/listings/${normalizedId}/notes`
      );

      // Handle both unwrapped array and wrapped response
      if (Array.isArray(response)) {
        return response;
      }
      if (response && typeof response === 'object' && 'data' in response) {
        return response.data;
      }
      return [];
    },
    enabled: !!normalizedId,
    staleTime: 5000,
  });
}

/**
 * Hook to create a new note on a property
 */
export function useCreateDealNote(propertyId: string | number) {
  const queryClient = useQueryClient();
  const normalizedId = normalizePropertyId(propertyId);

  return useMutation<DealNote, Error, CreateNoteInput>({
    mutationFn: async (input) => {
      // api.post already unwraps data.data, so we get DealNote directly
      const note = await api.post<DealNote>(
        `/api/listings/${normalizedId}/notes`,
        input
      );
      return note;
    },
    onSuccess: (newNote) => {
      // Optimistically update the cache with the new note
      if (newNote && newNote.id) {
        queryClient.setQueryData<DealNote[]>(['deal-notes', normalizedId], (old) => {
          if (!old) return [newNote];
          return [newNote, ...old];
        });
      }
      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['deal-notes', normalizedId] });
    },
  });
}

/**
 * Hook to update an existing note
 */
export function useUpdateDealNote(propertyId: string | number) {
  const queryClient = useQueryClient();
  const normalizedId = normalizePropertyId(propertyId);

  return useMutation<
    DealNote,
    Error,
    { noteId: number; updates: UpdateNoteInput }
  >({
    mutationFn: async ({ noteId, updates }) => {
      // api.patch already unwraps data.data
      const note = await api.patch<DealNote>(
        `/api/listings/${normalizedId}/notes/${noteId}`,
        updates
      );
      return note;
    },
    onSuccess: (updatedNote) => {
      // Optimistically update the cache
      if (updatedNote && updatedNote.id) {
        queryClient.setQueryData<DealNote[]>(['deal-notes', normalizedId], (old) => {
          if (!old) return [updatedNote];
          return old.map(note => note.id === updatedNote.id ? updatedNote : note);
        });
      }
      queryClient.invalidateQueries({ queryKey: ['deal-notes', normalizedId] });
    },
  });
}

/**
 * Hook to delete a note
 */
export function useDeleteDealNote(propertyId: string | number) {
  const queryClient = useQueryClient();
  const normalizedId = normalizePropertyId(propertyId);

  return useMutation<void, Error, number>({
    mutationFn: async (noteId) => {
      await api.delete(`/api/listings/${normalizedId}/notes/${noteId}`);
    },
    onSuccess: (_, noteId) => {
      // Optimistically remove from cache
      queryClient.setQueryData<DealNote[]>(['deal-notes', normalizedId], (old) => {
        if (!old) return [];
        return old.filter(note => note.id !== noteId);
      });
      queryClient.invalidateQueries({ queryKey: ['deal-notes', normalizedId] });
    },
  });
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
