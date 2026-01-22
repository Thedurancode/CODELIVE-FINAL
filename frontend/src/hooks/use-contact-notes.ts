'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ContactNote {
  id: number;
  contactId: string;
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
  data: ContactNote[];
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

// Normalize contactId to string for consistent query keys
const normalizeContactId = (id: string | null): string | null =>
  id ? String(id) : null;

/**
 * Hook to fetch notes for a specific contact
 */
export function useContactNotes(contactId: string | null) {
  const normalizedId = normalizeContactId(contactId);

  return useQuery<ContactNote[], Error>({
    queryKey: ['contact-notes', normalizedId],
    queryFn: async () => {
      const response = await api.get<ContactNote[] | NotesResponse>(
        `/api/contacts/${normalizedId}/notes`
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
 * Hook to create a new note on a contact
 */
export function useCreateContactNote(contactId: string) {
  const queryClient = useQueryClient();
  const normalizedId = normalizeContactId(contactId);

  return useMutation<ContactNote, Error, CreateNoteInput>({
    mutationFn: async (input) => {
      // api.post already unwraps data.data, so we get ContactNote directly
      const note = await api.post<ContactNote>(
        `/api/contacts/${normalizedId}/notes`,
        input
      );
      return note;
    },
    onSuccess: (newNote) => {
      // Optimistically update the cache with the new note
      if (newNote && newNote.id) {
        queryClient.setQueryData<ContactNote[]>(['contact-notes', normalizedId], (old) => {
          if (!old) return [newNote];
          return [newNote, ...old];
        });
      }
      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['contact-notes', normalizedId] });
    },
  });
}

/**
 * Hook to update an existing note
 */
export function useUpdateContactNote(contactId: string) {
  const queryClient = useQueryClient();
  const normalizedId = normalizeContactId(contactId);

  return useMutation<
    ContactNote,
    Error,
    { noteId: number; updates: UpdateNoteInput }
  >({
    mutationFn: async ({ noteId, updates }) => {
      // api.patch already unwraps data.data
      const note = await api.patch<ContactNote>(
        `/api/contacts/${normalizedId}/notes/${noteId}`,
        updates
      );
      return note;
    },
    onSuccess: (updatedNote) => {
      // Optimistically update the cache
      if (updatedNote && updatedNote.id) {
        queryClient.setQueryData<ContactNote[]>(['contact-notes', normalizedId], (old) => {
          if (!old) return [updatedNote];
          return old.map(note => note.id === updatedNote.id ? updatedNote : note);
        });
      }
      queryClient.invalidateQueries({ queryKey: ['contact-notes', normalizedId] });
    },
  });
}

/**
 * Hook to delete a note
 */
export function useDeleteContactNote(contactId: string) {
  const queryClient = useQueryClient();
  const normalizedId = normalizeContactId(contactId);

  return useMutation<void, Error, number>({
    mutationFn: async (noteId) => {
      await api.delete(`/api/contacts/${normalizedId}/notes/${noteId}`);
    },
    onSuccess: (_, noteId) => {
      // Optimistically remove from cache
      queryClient.setQueryData<ContactNote[]>(['contact-notes', normalizedId], (old) => {
        if (!old) return [];
        return old.filter(note => note.id !== noteId);
      });
      queryClient.invalidateQueries({ queryKey: ['contact-notes', normalizedId] });
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
