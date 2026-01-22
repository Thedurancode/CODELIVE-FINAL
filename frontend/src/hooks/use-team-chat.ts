import { useQuery, useMutation, useQueryClient, useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useCallback, useRef, useEffect, useState } from 'react';
import type {
  TeamConversation,
  TeamMessage,
  TeamChatFilters,
  TeamMessageFilters,
  TeamChatStats,
} from '@/types';
import {
  calculateBackoffDelay,
  shouldRetry,
  formatDelay,
  categorizeError,
  DEFAULT_RETRY_CONFIG,
} from '@/lib/retry-utils';

// ============================================================================
// TYPES
// ============================================================================

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  company?: string;
  phone?: string;
  title?: string;
  bio?: string;
  expertise?: string[];
  timezone?: string;
  avatar?: string;
  lastActiveAt?: string;
}

export interface PendingMessage {
  id: string;
  conversationId: string;
  content: string;
  replyToMessageId?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    url?: string;
  }>;
  status: 'pending' | 'sending' | 'failed';
  retryCount: number;
  createdAt: Date;
  /** Timestamp (ms) for when next retry should be attempted */
  nextRetryAt?: number;
  /** Last error message for debugging */
  lastError?: string;
}

// ============================================================================
// OFFLINE MESSAGE QUEUE
// ============================================================================

const PENDING_MESSAGES_KEY = 'team_chat_pending_messages';
const MAX_RETRIES = DEFAULT_RETRY_CONFIG.maxRetries;

function getPendingMessages(): PendingMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(PENDING_MESSAGES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function savePendingMessages(messages: PendingMessage[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PENDING_MESSAGES_KEY, JSON.stringify(messages));
}

function addPendingMessage(
  message: Omit<PendingMessage, 'id' | 'status' | 'retryCount' | 'createdAt' | 'nextRetryAt'>
): PendingMessage {
  const initialDelay = calculateBackoffDelay(0);
  const pendingMessage: PendingMessage = {
    ...message,
    id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'pending',
    retryCount: 0,
    createdAt: new Date(),
    nextRetryAt: Date.now() + initialDelay,
  };
  const messages = getPendingMessages();
  messages.push(pendingMessage);
  savePendingMessages(messages);
  return pendingMessage;
}

function removePendingMessage(id: string) {
  const messages = getPendingMessages().filter(m => m.id !== id);
  savePendingMessages(messages);
}

function updatePendingMessage(id: string, updates: Partial<PendingMessage>) {
  const messages = getPendingMessages().map(m =>
    m.id === id ? { ...m, ...updates } : m
  );
  savePendingMessages(messages);
}

// ============================================================================
// CONVERSATION HOOKS
// ============================================================================

/**
 * Get all conversations for the current user with smart refetching
 */
export function useTeamConversations(filters: TeamChatFilters = {}) {
  const params = new URLSearchParams();
  if (filters.includeArchived) params.append('includeArchived', 'true');
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.offset) params.append('offset', String(filters.offset));

  return useQuery({
    queryKey: ['team-conversations', JSON.stringify(filters)],
    queryFn: () =>
      api.get<TeamConversation[]>(
        `/api/team-chat/conversations?${params.toString()}`
      ),
    // WebSocket handles real-time updates, so polling is just a backup
    refetchInterval: 60000, // Refetch every 60 seconds as backup
    staleTime: 30000, // Consider data fresh for 30 seconds
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 5000),
    refetchOnWindowFocus: true,
  });
}

/**
 * Get a single conversation by ID
 */
export function useTeamConversation(conversationId: string | null) {
  return useQuery({
    queryKey: ['team-conversation', conversationId],
    queryFn: () =>
      api.get<TeamConversation>(`/api/team-chat/conversations/${conversationId}`),
    enabled: !!conversationId,
    retry: 2,
  });
}

/**
 * Get conversation by property ID
 */
export function useTeamConversationByProperty(propertyId: number | null) {
  return useQuery({
    queryKey: ['team-conversation-property', propertyId],
    queryFn: () =>
      api.get<TeamConversation>(
        `/api/team-chat/conversations/property/${propertyId}`
      ),
    enabled: !!propertyId,
    retry: 2,
  });
}

/**
 * Create a new conversation with optimistic update
 */
export function useCreateTeamConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { propertyId?: number; title?: string }) =>
      api.post<TeamConversation>('/api/team-chat/conversations', data),
    onSuccess: (newConversation) => {
      // Add to cache immediately
      queryClient.setQueryData<TeamConversation[]>(
        ['team-conversations', '{}'],
        (old) => old ? [newConversation, ...old] : [newConversation]
      );
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      toast.success('Conversation created');
    },
    onError: (error) => {
      toast.error((error as Error).message || 'Failed to create conversation');
    },
  });
}

/**
 * Archive a conversation with optimistic update
 */
export function useArchiveTeamConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) =>
      api.post(`/api/team-chat/conversations/${conversationId}/archive`),
    onMutate: async (conversationId) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['team-conversations'] });

      // Snapshot previous value
      const previousConversations = queryClient.getQueryData<TeamConversation[]>(['team-conversations', '{}']);

      // Optimistically update
      queryClient.setQueryData<TeamConversation[]>(
        ['team-conversations', '{}'],
        (old) => old?.map(c => c.id === conversationId ? { ...c, isArchived: true } : c)
      );

      return { previousConversations };
    },
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousConversations) {
        queryClient.setQueryData(['team-conversations', '{}'], context.previousConversations);
      }
      toast.error('Failed to archive conversation');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      toast.success('Conversation archived');
    },
  });
}

/**
 * Unarchive a conversation
 */
export function useUnarchiveTeamConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) =>
      api.post(`/api/team-chat/conversations/${conversationId}/unarchive`),
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: ['team-conversations'] });
      const previousConversations = queryClient.getQueryData<TeamConversation[]>(['team-conversations', '{}']);

      queryClient.setQueryData<TeamConversation[]>(
        ['team-conversations', '{}'],
        (old) => old?.map(c => c.id === conversationId ? { ...c, isArchived: false } : c)
      );

      return { previousConversations };
    },
    onError: (error, _, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(['team-conversations', '{}'], context.previousConversations);
      }
      toast.error('Failed to unarchive conversation');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      toast.success('Conversation unarchived');
    },
  });
}

/**
 * Delete a conversation (admin only)
 */
export function useDeleteTeamConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) =>
      api.delete(`/api/team-chat/conversations/${conversationId}`),
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: ['team-conversations'] });
      const previousConversations = queryClient.getQueryData<TeamConversation[]>(['team-conversations', '{}']);

      queryClient.setQueryData<TeamConversation[]>(
        ['team-conversations', '{}'],
        (old) => old?.filter(c => c.id !== conversationId)
      );

      return { previousConversations };
    },
    onError: (error, _, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(['team-conversations', '{}'], context.previousConversations);
      }
      toast.error((error as Error).message || 'Failed to delete conversation');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      toast.success('Conversation deleted');
    },
  });
}

/**
 * Add participants to a conversation
 */
export function useAddParticipants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, userIds }: { conversationId: string; userIds: string[] }) =>
      api.post(`/api/team-chat/conversations/${conversationId}/participants`, { userIds }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['team-conversation-participants', variables.conversationId] });
      toast.success('Participants added');
    },
    onError: (error) => {
      toast.error((error as Error).message || 'Failed to add participants');
    },
  });
}

/**
 * Get conversation participants
 */
export function useConversationParticipants(conversationId: string | null) {
  return useQuery({
    queryKey: ['team-conversation-participants', conversationId],
    queryFn: () => api.get<TeamMember[]>(`/api/team-chat/conversations/${conversationId}/participants`),
    enabled: !!conversationId,
    staleTime: 60000, // Cache for 1 minute
  });
}

/**
 * Search conversations
 */
export function useSearchTeamConversations(query: string, limit: number = 10) {
  return useQuery({
    queryKey: ['team-conversations-search', query, limit],
    queryFn: () =>
      api.get<TeamConversation[]>(
        `/api/team-chat/search?q=${encodeURIComponent(query)}&limit=${limit}`
      ),
    enabled: query.length >= 2,
    staleTime: 5000,
  });
}

// ============================================================================
// MESSAGE HOOKS
// ============================================================================

/**
 * Get messages for a conversation with smart polling
 */
export function useTeamMessages(
  conversationId: string | null,
  filters: TeamMessageFilters = {}
) {
  const params = new URLSearchParams();
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.offset) params.append('offset', String(filters.offset));
  if (filters.before) params.append('before', filters.before);
  if (filters.after) params.append('after', filters.after);

  return useQuery({
    queryKey: ['team-messages', conversationId, JSON.stringify(filters)],
    queryFn: () =>
      api.get<TeamMessage[]>(
        `/api/team-chat/conversations/${conversationId}/messages?${params.toString()}`
      ),
    enabled: !!conversationId,
    // WebSocket handles real-time updates, polling is backup only
    refetchInterval: 30000, // Backup poll every 30 seconds
    staleTime: 15000, // Consider data fresh for 15 seconds
    retry: 3,
    retryDelay: 500,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * Get messages for a conversation with infinite scroll (load more when scrolling up)
 */
export function useInfiniteTeamMessages(
  conversationId: string | null,
  pageSize: number = 30
) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['team-messages-infinite', conversationId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.append('limit', String(pageSize));
      if (pageParam) {
        params.append('before', pageParam);
      }

      const messages = await api.get<TeamMessage[]>(
        `/api/team-chat/conversations/${conversationId}/messages?${params.toString()}`
      );

      return messages;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage, allPages) => {
      // For loading older messages when scrolling up:
      // - Backend returns messages in ASC order (oldest first in each page)
      // - We need to find the oldest message across ALL pages to get older ones
      // - On initial load, if we got fewer than pageSize, there are no older messages
      if (lastPage.length < pageSize) return undefined; // No more pages

      // Get the oldest message from the first page (which contains the oldest messages we have)
      // Since pages are added in order: [initial/newest page, older page 1, older page 2, ...]
      // The oldest message overall is the first message of the last page fetched
      const oldestMessageInPage = lastPage[0];
      return oldestMessageInPage?.createdAt;
    },
    enabled: !!conversationId,
    // WebSocket handles real-time updates, polling is backup only
    refetchInterval: 30000, // Backup poll every 30 seconds
    staleTime: 15000,
  });

  // Flatten all pages into a single array
  // Pages are ordered: [initial/recent page, older page 1, older page 2, ...]
  // We need to reverse the page order so older messages come first
  const allMessages = query.data?.pages
    ? [...query.data.pages].reverse().flatMap((page) => page)
    : [];

  // Function to prepend new message (for real-time updates)
  const addMessage = useCallback((message: TeamMessage) => {
    queryClient.setQueryData<InfiniteData<TeamMessage[]>>(
      ['team-messages-infinite', conversationId],
      (oldData) => {
        if (!oldData) return oldData;

        // Check if message already exists
        const exists = oldData.pages.some((page) =>
          page.some((m) => m.id === message.id)
        );
        if (exists) return oldData;

        // Add to the last page (newest messages)
        const newPages = [...oldData.pages];
        const lastPageIndex = newPages.length - 1;
        newPages[lastPageIndex] = [...newPages[lastPageIndex], message];

        return {
          ...oldData,
          pages: newPages,
        };
      }
    );
  }, [conversationId, queryClient]);

  return {
    ...query,
    messages: allMessages,
    addMessage,
    loadMore: query.fetchNextPage,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
  };
}

/**
 * Get pending messages for a conversation (offline queue)
 */
export function usePendingMessages(conversationId: string | null) {
  const [pending, setPending] = useState<PendingMessage[]>([]);

  useEffect(() => {
    if (!conversationId) return;
    const messages = getPendingMessages().filter(m => m.conversationId === conversationId);
    setPending(messages);

    // Listen for storage changes
    const handleStorage = () => {
      const messages = getPendingMessages().filter(m => m.conversationId === conversationId);
      setPending(messages);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [conversationId]);

  return pending;
}

/**
 * Send a message with optimistic update and retry logic
 */
export function useSendTeamMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      replyToMessageId,
      attachments,
      optimisticId,
    }: {
      conversationId: string;
      content: string;
      replyToMessageId?: string;
      attachments?: Array<{
        filename: string;
        contentType: string;
        size: number;
        url?: string;
      }>;
      optimisticId?: string;
    }) => {
      const result = await api.post<TeamMessage>(
        `/api/team-chat/conversations/${conversationId}/messages`,
        { content, replyToMessageId, attachments }
      );
      // Remove from pending queue if it was there
      if (optimisticId) {
        removePendingMessage(optimisticId);
      }
      return result;
    },
    onMutate: async (variables) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({
        queryKey: ['team-messages', variables.conversationId],
      });

      // Get current messages
      const previousMessages = queryClient.getQueryData<TeamMessage[]>([
        'team-messages',
        variables.conversationId,
        '{}',
      ]);

      // Get current user info with robust error handling
      let currentUser = { id: '', name: 'You', email: '' };
      try {
        const userData = localStorage.getItem('user');
        if (userData) {
          const user = JSON.parse(userData);
          // Safely extract user properties with fallbacks
          if (user && typeof user === 'object') {
            currentUser = {
              id: user.id || localStorage.getItem('user_id') || '',
              name: user.name || user.email || 'You',
              email: user.email || '',
            };
          }
        }
        // Fallback to user_id if user object doesn't have id
        if (!currentUser.id) {
          currentUser.id = localStorage.getItem('user_id') || '';
        }
      } catch {
        // If parsing fails, try to at least get user_id
        currentUser.id = localStorage.getItem('user_id') || '';
      }

      // Create optimistic message
      const optimisticMessage: TeamMessage = {
        id: variables.optimisticId || `optimistic_${Date.now()}`,
        conversationId: variables.conversationId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderType: 'team',
        senderPhone: null,
        senderEmail: currentUser.email,
        source: 'platform',
        content: variables.content,
        contentHtml: null,
        attachments: variables.attachments || [],
        mentions: [],
        isEdited: false,
        editedAt: null,
        readBy: [],
        deliveryStatus: 'pending',
        externalMessageId: null,
        replyToMessageId: variables.replyToMessageId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Optimistically add message
      queryClient.setQueryData<TeamMessage[]>(
        ['team-messages', variables.conversationId, '{}'],
        (old) => [...(old || []), optimisticMessage]
      );

      // Update conversation preview
      queryClient.setQueryData<TeamConversation[]>(
        ['team-conversations', '{}'],
        (old) =>
          old?.map((c) =>
            c.id === variables.conversationId
              ? {
                  ...c,
                  lastMessageAt: new Date().toISOString(),
                  lastMessagePreview: variables.content.substring(0, 100),
                  lastMessageSender: currentUser.name,
                  lastMessageSource: 'platform',
                }
              : c
          )
      );

      return { previousMessages, optimisticMessage };
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['team-messages', variables.conversationId, '{}'],
          context.previousMessages
        );
      }

      // Add to pending queue for retry with exponential backoff
      const pendingMsg = addPendingMessage({
        conversationId: variables.conversationId,
        content: variables.content,
        replyToMessageId: variables.replyToMessageId,
        attachments: variables.attachments,
      });

      const initialDelay = calculateBackoffDelay(0);
      toast.error(`Message failed. Retrying in ${formatDelay(initialDelay)}...`, {
        description: 'Will automatically retry with backoff',
        action: {
          label: 'Retry Now',
          onClick: () => {
            // Reset retry time to now for immediate retry
            updatePendingMessage(pendingMsg.id, { nextRetryAt: Date.now() });
            window.dispatchEvent(new CustomEvent('retry-pending-messages'));
          },
        },
      });
    },
    onSuccess: (newMessage, variables, context) => {
      // Replace ONLY the specific optimistic message with the real one
      const optimisticId = context?.optimisticMessage?.id;
      queryClient.setQueryData<TeamMessage[]>(
        ['team-messages', variables.conversationId, '{}'],
        (old) =>
          old?.map((m) => {
            // Only replace the exact optimistic message that was sent
            if (optimisticId && m.id === optimisticId) {
              return { ...newMessage, deliveryStatus: 'sent' };
            }
            return m;
          })
      );
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
    },
  });
}

/**
 * Retry pending messages hook with exponential backoff
 *
 * Uses intelligent scheduling to retry failed messages:
 * - Exponential delays: ~1s, ~2s, ~4s, ~8s, ~16s (with jitter)
 * - Respects nextRetryAt timestamp for each message
 * - Auto-schedules next retry after each attempt
 */
export function useRetryPendingMessages() {
  const sendMessage = useSendTeamMessage();
  const [isRetrying, setIsRetrying] = useState(false);
  const [nextRetryIn, setNextRetryIn] = useState<number | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear any scheduled retry
  const clearScheduledRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setNextRetryIn(null);
  }, []);

  // Schedule the next retry based on pending messages
  const scheduleNextRetry = useCallback(() => {
    clearScheduledRetry();

    const pending = getPendingMessages().filter(
      (m) => m.status !== 'sending' && shouldRetry(m.retryCount)
    );

    if (pending.length === 0) return;

    // Find the message with the earliest nextRetryAt
    const now = Date.now();
    let earliestTime = Infinity;
    let targetMessage: PendingMessage | null = null;

    for (const msg of pending) {
      const retryTime = msg.nextRetryAt || now;
      if (retryTime < earliestTime) {
        earliestTime = retryTime;
        targetMessage = msg;
      }
    }

    if (!targetMessage) return;

    const delay = Math.max(0, earliestTime - now);

    // Update countdown every second
    setNextRetryIn(delay);
    countdownIntervalRef.current = setInterval(() => {
      setNextRetryIn((prev) => {
        if (prev === null || prev <= 1000) return null;
        return prev - 1000;
      });
    }, 1000);

    // Schedule the retry
    retryTimeoutRef.current = setTimeout(() => {
      retrySingleMessage(targetMessage!);
    }, delay);
  }, [clearScheduledRetry]);

  // Retry a single message
  const retrySingleMessage = useCallback(
    async (message: PendingMessage) => {
      setIsRetrying(true);
      clearScheduledRetry();
      updatePendingMessage(message.id, { status: 'sending' });

      try {
        await sendMessage.mutateAsync({
          conversationId: message.conversationId,
          content: message.content,
          replyToMessageId: message.replyToMessageId,
          attachments: message.attachments,
          optimisticId: message.id,
        });
        // Success - message is removed by the mutation's onSuccess
        toast.success('Message sent successfully');
      } catch (error) {
        const newRetryCount = message.retryCount + 1;
        const { isRetryable, message: errorMsg } = categorizeError(error);

        if (isRetryable && shouldRetry(newRetryCount)) {
          const nextDelay = calculateBackoffDelay(newRetryCount);
          updatePendingMessage(message.id, {
            status: 'failed',
            retryCount: newRetryCount,
            nextRetryAt: Date.now() + nextDelay,
            lastError: errorMsg,
          });

          toast.error(`Message failed. Retrying in ${formatDelay(nextDelay)}...`, {
            description: `Attempt ${newRetryCount} of ${MAX_RETRIES}`,
          });
        } else {
          // Max retries exceeded or non-retryable error
          updatePendingMessage(message.id, {
            status: 'failed',
            retryCount: newRetryCount,
            lastError: errorMsg,
            nextRetryAt: undefined, // No more auto-retries
          });

          toast.error('Message failed to send after multiple attempts.', {
            description: 'Please check your connection and try again.',
            action: {
              label: 'Retry',
              onClick: () => {
                // Reset retry count and try again
                updatePendingMessage(message.id, {
                  retryCount: 0,
                  nextRetryAt: Date.now(),
                });
                window.dispatchEvent(new CustomEvent('retry-pending-messages'));
              },
            },
          });
        }
      }

      setIsRetrying(false);
      // Schedule next pending message
      scheduleNextRetry();
    },
    [sendMessage, clearScheduledRetry, scheduleNextRetry]
  );

  // Retry all pending messages immediately (manual trigger)
  const retryAll = useCallback(async () => {
    if (isRetrying) return;

    const pending = getPendingMessages().filter(
      (m) => m.status !== 'sending' && shouldRetry(m.retryCount)
    );

    if (pending.length === 0) return;

    // Reset nextRetryAt to now for all pending messages to trigger immediate retry
    for (const msg of pending) {
      updatePendingMessage(msg.id, { nextRetryAt: Date.now() });
    }

    // Start processing
    scheduleNextRetry();
  }, [isRetrying, scheduleNextRetry]);

  // Listen for retry events
  useEffect(() => {
    const handleRetry = () => retryAll();
    window.addEventListener('retry-pending-messages', handleRetry);
    return () => window.removeEventListener('retry-pending-messages', handleRetry);
  }, [retryAll]);

  // Auto-schedule on mount and when coming back online
  useEffect(() => {
    const handleOnline = () => {
      // When coming back online, reset retry times and start immediately
      const pending = getPendingMessages();
      for (const msg of pending) {
        if (msg.status !== 'sending') {
          updatePendingMessage(msg.id, { nextRetryAt: Date.now() + 1000 });
        }
      }
      setTimeout(scheduleNextRetry, 1000);
      toast.success('Back online! Retrying pending messages...');
    };

    window.addEventListener('online', handleOnline);

    // Schedule on mount if there are pending messages
    const pending = getPendingMessages();
    if (pending.length > 0) {
      setTimeout(scheduleNextRetry, 2000);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      clearScheduledRetry();
    };
  }, [scheduleNextRetry, clearScheduledRetry]);

  return {
    retryAll,
    isRetrying,
    pendingCount: getPendingMessages().length,
    nextRetryIn: nextRetryIn ? formatDelay(nextRetryIn) : null,
  };
}

/**
 * Mark messages as read with debouncing
 */
export function useMarkTeamMessagesRead() {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingConversationRef = useRef<string | null>(null);

  const mutation = useMutation({
    mutationFn: (conversationId: string) =>
      api.post(`/api/team-chat/conversations/${conversationId}/read`),
    onMutate: async (conversationId) => {
      // Optimistically clear unread count
      queryClient.setQueryData<TeamConversation[]>(
        ['team-conversations', '{}'],
        (old) =>
          old?.map((c) =>
            c.id === conversationId ? { ...c, unreadCount: 0 } : c
          )
      );
    },
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['team-conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['team-unread-count'] });
    },
  });

  // Debounced mark as read - handles rapid conversation switches
  const markAsRead = useCallback((conversationId: string) => {
    // If switching to a different conversation, mark the previous one immediately
    if (pendingConversationRef.current && pendingConversationRef.current !== conversationId) {
      mutation.mutate(pendingConversationRef.current);
    }

    pendingConversationRef.current = conversationId;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (pendingConversationRef.current) {
        mutation.mutate(pendingConversationRef.current);
        pendingConversationRef.current = null;
      }
    }, 500);
  }, [mutation]);

  return { ...mutation, markAsRead };
}

/**
 * Edit a message with optimistic update
 */
export function useEditTeamMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      conversationId,
      messageId,
      content,
    }: {
      conversationId: string;
      messageId: string;
      content: string;
    }) =>
      api.put<TeamMessage>(
        `/api/team-chat/conversations/${conversationId}/messages/${messageId}`,
        { content }
      ),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: ['team-messages', variables.conversationId],
      });

      const previousMessages = queryClient.getQueryData<TeamMessage[]>([
        'team-messages',
        variables.conversationId,
        '{}',
      ]);

      // Optimistically update
      queryClient.setQueryData<TeamMessage[]>(
        ['team-messages', variables.conversationId, '{}'],
        (old) =>
          old?.map((m) =>
            m.id === variables.messageId
              ? { ...m, content: variables.content, isEdited: true, editedAt: new Date().toISOString() }
              : m
          )
      );

      return { previousMessages };
    },
    onError: (error, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['team-messages', variables.conversationId, '{}'],
          context.previousMessages
        );
      }
      toast.error('Failed to edit message');
    },
    onSuccess: () => {
      toast.success('Message edited');
    },
  });
}

/**
 * Delete a message with optimistic update
 */
export function useDeleteTeamMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      conversationId,
      messageId,
    }: {
      conversationId: string;
      messageId: string;
    }) =>
      api.delete(
        `/api/team-chat/conversations/${conversationId}/messages/${messageId}`
      ),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: ['team-messages', variables.conversationId],
      });

      const previousMessages = queryClient.getQueryData<TeamMessage[]>([
        'team-messages',
        variables.conversationId,
        '{}',
      ]);

      // Optimistically remove
      queryClient.setQueryData<TeamMessage[]>(
        ['team-messages', variables.conversationId, '{}'],
        (old) => old?.filter((m) => m.id !== variables.messageId)
      );

      return { previousMessages };
    },
    onError: (error, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['team-messages', variables.conversationId, '{}'],
          context.previousMessages
        );
      }
      toast.error('Failed to delete message');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      toast.success('Message deleted');
    },
  });
}

/**
 * Send typing indicator with throttling
 */
export function useSendTypingIndicator() {
  const lastSentRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mutation = useMutation({
    mutationFn: ({
      conversationId,
      typing,
    }: {
      conversationId: string;
      typing: boolean;
    }) =>
      api.post(`/api/team-chat/conversations/${conversationId}/typing`, {
        typing,
      }),
  });

  // Throttled send
  const sendTyping = useCallback(
    (conversationId: string, typing: boolean) => {
      const now = Date.now();

      // Throttle to once per second for typing=true
      if (typing && now - lastSentRef.current < 1000) {
        return;
      }

      lastSentRef.current = now;
      mutation.mutate({ conversationId, typing });

      // Auto-stop typing after 3 seconds
      if (typing) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          mutation.mutate({ conversationId, typing: false });
        }, 3000);
      }
    },
    [mutation]
  );

  return { ...mutation, sendTyping };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Get total unread count with background updates
 */
export function useTeamUnreadCount() {
  return useQuery({
    queryKey: ['team-unread-count'],
    queryFn: () =>
      api.get<{ count: number }>('/api/team-chat/unread-count'),
    // WebSocket handles real-time updates, polling is backup only
    refetchInterval: 60000, // Backup poll every 60 seconds
    staleTime: 30000,
    retry: 2,
  });
}

/**
 * Get team chat statistics
 */
export function useTeamChatStats(conversationId?: string) {
  const params = conversationId ? `?conversationId=${conversationId}` : '';

  return useQuery({
    queryKey: ['team-chat-stats', conversationId],
    queryFn: () => api.get<TeamChatStats>(`/api/team-chat/stats${params}`),
    staleTime: 60000, // Cache for 1 minute
  });
}

/**
 * Get team members for @mentions
 */
export function useTeamMembers(search?: string) {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';

  return useQuery({
    queryKey: ['team-members', search],
    queryFn: () => api.get<TeamMember[]>(`/api/team-chat/members${params}`),
    staleTime: 60000, // Cache for 1 minute
  });
}

/**
 * Update a user's role
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.put<TeamMember>(`/api/team-chat/members/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast.success('Role updated');
    },
    onError: (error) => {
      toast.error((error as Error).message || 'Failed to update role');
    },
  });
}

/**
 * Connection status hook - monitors online/offline state
 */
export function useConnectionStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        toast.success('Back online! Messages will sync.');
        setWasOffline(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      toast.warning('You are offline. Messages will be queued.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  return { isOnline, wasOffline };
}
