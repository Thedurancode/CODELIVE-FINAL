import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Conversation {
  id: string;
  title: string;
  generatedTitle: boolean;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: { name: string; status: string }[];
  createdAt: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

/**
 * Fetch all conversations for the current user
 */
export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/api/conversations'),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch a single conversation with its messages
 */
export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.get<ConversationWithMessages>(`/api/conversations/${id}`),
    enabled: !!id,
    staleTime: 0, // Always refetch when switching conversations
    refetchOnMount: true,
  });
}

/**
 * Update conversation title
 */
export function useUpdateConversationTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch<{ id: string; title: string; generatedTitle: boolean }>(
        `/api/conversations/${id}`,
        { title }
      ),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });
}

/**
 * Delete a conversation
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/conversations/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.removeQueries({ queryKey: ['conversation', id] });
    },
  });
}

/**
 * Generate/regenerate title for a conversation
 */
export function useGenerateConversationTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ id: string; title: string; generatedTitle: boolean }>(
        `/api/conversations/${id}/generate-title`
      ),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });
}

/**
 * Invalidate conversation queries (useful after sending a message)
 */
export function useInvalidateConversations() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
    invalidateOne: (id: string) => queryClient.invalidateQueries({ queryKey: ['conversation', id] }),
  };
}
