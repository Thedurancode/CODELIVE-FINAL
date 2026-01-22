'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Create Supabase client for realtime only
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Store guest token in localStorage
const GUEST_TOKEN_KEY = 'dispotree_guest_token';
const GUEST_INFO_KEY = 'dispotree_guest_info';

export interface GuestInfo {
  phone: string;
  name?: string;
  email?: string;
  token: string;
  expiresAt: string;
}

export interface PublicChatInfo {
  conversationId: string;
  propertyId: number;
  propertyAddress: string;
  title: string;
  participantCount: number;
  messageCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  property: {
    id: number;
    address: string;
    city: string;
    state: string;
    askingPrice: number;
    photoLinks: string[];
  };
}

export interface PublicChatMessage {
  id: string;
  conversationId: string;
  senderName: string;
  senderPhone: string | null;
  content: string;
  createdAt: string;
  senderType: 'guest' | 'team' | 'system';
}

async function fetchPublicApi<T>(
  endpoint: string,
  options: RequestInit = {},
  guestToken?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (guestToken) {
    headers['x-guest-token'] = guestToken;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'API Error');
  }

  return data.data !== undefined ? data.data : data;
}

/**
 * Hook to manage guest authentication state
 */
export function useGuestAuth() {
  const [guestInfo, setGuestInfo] = useState<GuestInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load guest info from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(GUEST_INFO_KEY);
    if (stored) {
      try {
        const info = JSON.parse(stored) as GuestInfo;
        // Check if token is still valid
        if (new Date(info.expiresAt) > new Date()) {
          setGuestInfo(info);
        } else {
          // Token expired, clear it
          localStorage.removeItem(GUEST_TOKEN_KEY);
          localStorage.removeItem(GUEST_INFO_KEY);
        }
      } catch {
        localStorage.removeItem(GUEST_INFO_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const saveGuestInfo = useCallback((info: GuestInfo) => {
    setGuestInfo(info);
    localStorage.setItem(GUEST_TOKEN_KEY, info.token);
    localStorage.setItem(GUEST_INFO_KEY, JSON.stringify(info));
  }, []);

  const clearGuestInfo = useCallback(() => {
    setGuestInfo(null);
    localStorage.removeItem(GUEST_TOKEN_KEY);
    localStorage.removeItem(GUEST_INFO_KEY);
  }, []);

  const getToken = useCallback(() => {
    return guestInfo?.token || localStorage.getItem(GUEST_TOKEN_KEY);
  }, [guestInfo]);

  return {
    guestInfo,
    isAuthenticated: !!guestInfo,
    isLoading,
    saveGuestInfo,
    clearGuestInfo,
    getToken,
  };
}

/**
 * Get public chat info for a property
 */
export function usePublicChatInfo(propertyId: number | null) {
  return useQuery({
    queryKey: ['public-chat-info', propertyId],
    queryFn: () => fetchPublicApi<PublicChatInfo>(`/api/public-chat/${propertyId}`),
    enabled: !!propertyId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Check if phone exists and send magic link if it does
 */
export function useCheckPhone(propertyId: number) {
  return useMutation({
    mutationFn: async (phone: string) => {
      return fetchPublicApi<{
        exists: boolean;
        phone: string;
        name?: string;
        linkSent?: boolean;
        needsRegistration?: boolean;
        expiresIn?: number;
        magicLink?: string;
      }>(
        `/api/public-chat/${propertyId}/check-phone`,
        {
          method: 'POST',
          body: JSON.stringify({ phone }),
        }
      );
    },
  });
}

/**
 * Register new user and send magic link
 */
export function useRegisterGuest(propertyId: number) {
  return useMutation({
    mutationFn: async ({ phone, name, email }: { phone: string; name: string; email?: string }) => {
      return fetchPublicApi<{
        phone: string;
        name: string;
        email?: string;
        expiresIn: number;
        magicLink?: string;
      }>(
        `/api/public-chat/${propertyId}/register`,
        {
          method: 'POST',
          body: JSON.stringify({ phone, name, email }),
        }
      );
    },
  });
}

/**
 * Verify magic link token
 */
export function useVerifyMagicToken(propertyId: number) {
  const { saveGuestInfo } = useGuestAuth();

  return useMutation({
    mutationFn: async (token: string) => {
      const result = await fetchPublicApi<{
        token: string;
        expiresAt: string;
        name: string;
        phone: string;
        email?: string;
      }>(`/api/public-chat/${propertyId}/verify-token`, {
        method: 'POST',
        body: JSON.stringify({ token }),
      });

      // Save to local storage
      saveGuestInfo({
        phone: result.phone,
        name: result.name,
        email: result.email,
        token: result.token,
        expiresAt: result.expiresAt,
      });

      return result;
    },
  });
}

/**
 * Verify SMS code
 */
export function useVerifyCode(propertyId: number) {
  const { saveGuestInfo } = useGuestAuth();

  return useMutation({
    mutationFn: async ({ phone, code }: { phone: string; code: string }) => {
      const result = await fetchPublicApi<{
        token: string;
        expiresAt: string;
        name: string;
        phone: string;
        email?: string;
      }>(`/api/public-chat/${propertyId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      });

      // Save to local storage
      saveGuestInfo({
        phone: result.phone,
        name: result.name,
        email: result.email,
        token: result.token,
        expiresAt: result.expiresAt,
      });

      return result;
    },
  });
}

/**
 * Get public chat messages
 */
export function usePublicChatMessages(propertyId: number | null, enabled: boolean = true) {
  const { getToken, isAuthenticated } = useGuestAuth();

  return useQuery({
    queryKey: ['public-chat-messages', propertyId],
    queryFn: () =>
      fetchPublicApi<PublicChatMessage[]>(
        `/api/public-chat/${propertyId}/messages`,
        {},
        getToken()
      ),
    enabled: !!propertyId && isAuthenticated && enabled,
    refetchInterval: 5000, // Poll every 5 seconds
  });
}

/**
 * Send a message to public chat
 */
export function useSendPublicMessage(propertyId: number) {
  const queryClient = useQueryClient();
  const { getToken } = useGuestAuth();

  return useMutation({
    mutationFn: async (content: string) => {
      return fetchPublicApi<PublicChatMessage>(
        `/api/public-chat/${propertyId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        },
        getToken()
      );
    },
    onSuccess: () => {
      // Invalidate messages query to refetch
      queryClient.invalidateQueries({ queryKey: ['public-chat-messages', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['public-chat-info', propertyId] });
    },
  });
}

/**
 * Get participant info
 */
export function usePublicChatParticipants(propertyId: number | null) {
  return useQuery({
    queryKey: ['public-chat-participants', propertyId],
    queryFn: () =>
      fetchPublicApi<{ count: number; recent: { id: string; name: string; lastActiveAt: string }[] }>(
        `/api/public-chat/${propertyId}/participants`
      ),
    enabled: !!propertyId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Real-time subscription for public chat
 */
export interface RealtimeEvents {
  onMessage?: (message: PublicChatMessage) => void;
  onTyping?: (data: { guestId: string; guestName: string; isTyping: boolean }) => void;
  onMessageRead?: (data: { userId: string }) => void;
  onReaction?: (data: {
    messageId: string;
    reaction: string;
    userId: string;
    userName: string;
    action: 'add' | 'remove';
  }) => void;
  onMessageEdit?: (data: { messageId: string; content: string; editedAt: string }) => void;
  onMessageDelete?: (data: { messageId: string }) => void;
}

export function usePublicChatRealtime(
  propertyId: number | null,
  enabled: boolean,
  events: RealtimeEvents
) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!propertyId || !enabled || !supabase) return;

    // Subscribe to the public chat channel
    const channel = supabase.channel(`public-chat:${propertyId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'public_message' }, ({ payload }) => {
        // Add new message to query cache
        queryClient.setQueryData(
          ['public-chat-messages', propertyId],
          (old: PublicChatMessage[] | undefined) => {
            if (!old) return [payload];
            // Avoid duplicates
            if (old.find((m) => m.id === payload.id)) return old;
            return [...old, payload];
          }
        );
        events.onMessage?.(payload);
      })
      .on('broadcast', { event: 'public_typing' }, ({ payload }) => {
        events.onTyping?.(payload);
      })
      .on('broadcast', { event: 'message_read' }, ({ payload }) => {
        events.onMessageRead?.(payload);
      })
      .on('broadcast', { event: 'message_reaction' }, ({ payload }) => {
        // Update message in cache
        queryClient.setQueryData(
          ['public-chat-messages', propertyId],
          (old: PublicChatMessage[] | undefined) => {
            if (!old) return old;
            return old.map((m) => {
              if (m.id === payload.messageId) {
                const metadata = (m as any).metadata || {};
                const reactions = metadata.reactions || {};
                if (payload.action === 'remove') {
                  if (reactions[payload.reaction]) {
                    reactions[payload.reaction] = reactions[payload.reaction].filter(
                      (r: any) => r.guestId !== payload.userId
                    );
                    if (reactions[payload.reaction].length === 0) {
                      delete reactions[payload.reaction];
                    }
                  }
                } else {
                  if (!reactions[payload.reaction]) {
                    reactions[payload.reaction] = [];
                  }
                  if (!reactions[payload.reaction].find((r: any) => r.guestId === payload.userId)) {
                    reactions[payload.reaction].push({
                      guestId: payload.userId,
                      guestName: payload.userName,
                    });
                  }
                }
                return { ...m, metadata: { ...metadata, reactions } } as PublicChatMessage;
              }
              return m;
            });
          }
        );
        events.onReaction?.(payload);
      })
      .on('broadcast', { event: 'message_edited' }, ({ payload }) => {
        // Update message in cache
        queryClient.setQueryData(
          ['public-chat-messages', propertyId],
          (old: PublicChatMessage[] | undefined) => {
            if (!old) return old;
            return old.map((m) =>
              m.id === payload.messageId
                ? { ...m, content: payload.content, metadata: { ...(m as any).metadata, editedAt: payload.editedAt } }
                : m
            ) as PublicChatMessage[];
          }
        );
        events.onMessageEdit?.(payload);
      })
      .on('broadcast', { event: 'message_deleted' }, ({ payload }) => {
        // Update message in cache
        queryClient.setQueryData(
          ['public-chat-messages', propertyId],
          (old: PublicChatMessage[] | undefined) => {
            if (!old) return old;
            return old.map((m) =>
              m.id === payload.messageId
                ? { ...m, content: '[Message deleted]', metadata: { ...(m as any).metadata, deletedAt: new Date().toISOString() } }
                : m
            ) as PublicChatMessage[];
          }
        );
        events.onMessageDelete?.(payload);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [propertyId, enabled, queryClient, events]);
}

/**
 * Send typing indicator
 */
export function useSendTyping(propertyId: number) {
  const { getToken } = useGuestAuth();
  const lastSentRef = useRef<number>(0);

  return useCallback(
    async (isTyping: boolean) => {
      // Throttle to once per second
      const now = Date.now();
      if (now - lastSentRef.current < 1000) return;
      lastSentRef.current = now;

      try {
        await fetchPublicApi(
          `/api/public-chat/${propertyId}/typing`,
          {
            method: 'POST',
            body: JSON.stringify({ isTyping }),
          },
          getToken()
        );
      } catch {
        // Ignore typing errors
      }
    },
    [propertyId, getToken]
  );
}

/**
 * Mark message as read
 */
export function useMarkMessageRead(propertyId: number) {
  const { getToken } = useGuestAuth();

  return useMutation({
    mutationFn: async (messageId: string) => {
      return fetchPublicApi(
        `/api/public-chat/${propertyId}/messages/${messageId}/read`,
        {
          method: 'POST',
        },
        getToken()
      );
    },
  });
}

/**
 * Add/remove reaction
 */
export function useMessageReaction(propertyId: number) {
  const queryClient = useQueryClient();
  const { getToken } = useGuestAuth();

  return useMutation({
    mutationFn: async ({
      messageId,
      reaction,
      action = 'add',
    }: {
      messageId: string;
      reaction: string;
      action?: 'add' | 'remove';
    }) => {
      return fetchPublicApi<{ reactions: Record<string, { guestId: string; guestName: string }[]> }>(
        `/api/public-chat/${propertyId}/messages/${messageId}/reaction`,
        {
          method: 'POST',
          body: JSON.stringify({ reaction, action }),
        },
        getToken()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-chat-messages', propertyId] });
    },
  });
}

/**
 * Edit message
 */
export function useEditMessage(propertyId: number) {
  const queryClient = useQueryClient();
  const { getToken } = useGuestAuth();

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      return fetchPublicApi<PublicChatMessage>(
        `/api/public-chat/${propertyId}/messages/${messageId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ content }),
        },
        getToken()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-chat-messages', propertyId] });
    },
  });
}

/**
 * Delete message
 */
export function useDeleteMessage(propertyId: number) {
  const queryClient = useQueryClient();
  const { getToken } = useGuestAuth();

  return useMutation({
    mutationFn: async (messageId: string) => {
      return fetchPublicApi(
        `/api/public-chat/${propertyId}/messages/${messageId}`,
        {
          method: 'DELETE',
        },
        getToken()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-chat-messages', propertyId] });
    },
  });
}

/**
 * Report a message or user
 */
export function useReportContent(propertyId: number) {
  const { getToken } = useGuestAuth();

  return useMutation({
    mutationFn: async ({
      messageId,
      userId,
      reason,
      details,
    }: {
      messageId?: string;
      userId?: string;
      reason: string;
      details?: string;
    }) => {
      return fetchPublicApi(
        `/api/public-chat/${propertyId}/report`,
        {
          method: 'POST',
          body: JSON.stringify({ messageId, userId, reason, details }),
        },
        getToken()
      );
    },
  });
}

/**
 * Block a user
 */
export function useBlockUser(propertyId: number) {
  const queryClient = useQueryClient();
  const { getToken } = useGuestAuth();

  return useMutation({
    mutationFn: async (userId: string) => {
      return fetchPublicApi(
        `/api/public-chat/${propertyId}/block`,
        {
          method: 'POST',
          body: JSON.stringify({ userId }),
        },
        getToken()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-chat-blocked', propertyId] });
    },
  });
}

/**
 * Unblock a user
 */
export function useUnblockUser(propertyId: number) {
  const queryClient = useQueryClient();
  const { getToken } = useGuestAuth();

  return useMutation({
    mutationFn: async (userId: string) => {
      return fetchPublicApi(
        `/api/public-chat/${propertyId}/block/${userId}`,
        {
          method: 'DELETE',
        },
        getToken()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-chat-blocked', propertyId] });
    },
  });
}

/**
 * Get blocked users
 */
export function useBlockedUsers(propertyId: number | null) {
  const { getToken, isAuthenticated } = useGuestAuth();

  return useQuery({
    queryKey: ['public-chat-blocked', propertyId],
    queryFn: () =>
      fetchPublicApi<string[]>(`/api/public-chat/${propertyId}/blocked`, {}, getToken()),
    enabled: !!propertyId && isAuthenticated,
  });
}
