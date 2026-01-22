'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { notificationManager } from '@/lib/notifications';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { TeamMessage, TeamConversation } from '@/types';

// Event types for team chat
export interface TeamChatEvent {
  type: 'team_message' | 'typing' | 'message_read' | 'unread_count' | 'message_delivered';
  payload: any;
}

export interface UseSupabaseRealtimeOptions {
  conversationId?: string | null;
  onNewMessage?: (message: TeamMessage) => void;
  onTypingStart?: (userId: string, userName: string) => void;
  onTypingStop?: (userId: string) => void;
  onMessageRead?: (userId: string) => void;
  onUnreadCountUpdate?: (count: number) => void;
}

export interface UseSupabaseRealtimeReturn {
  isConnected: boolean;
  sendTypingIndicator: (conversationId: string, isTyping: boolean) => void;
  broadcastMessage: (conversationId: string, message: TeamMessage) => void;
}

export function useSupabaseRealtime(
  options: UseSupabaseRealtimeOptions = {}
): UseSupabaseRealtimeReturn {
  const {
    conversationId,
    onNewMessage,
    onTypingStart,
    onTypingStop,
    onMessageRead,
    onUnreadCountUpdate,
  } = options;

  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const conversationChannelRef = useRef<RealtimeChannel | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Use refs for callbacks to prevent reconnections
  const onNewMessageRef = useRef(onNewMessage);
  const onTypingStartRef = useRef(onTypingStart);
  const onTypingStopRef = useRef(onTypingStop);
  const onMessageReadRef = useRef(onMessageRead);
  const onUnreadCountUpdateRef = useRef(onUnreadCountUpdate);

  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
    onTypingStartRef.current = onTypingStart;
    onTypingStopRef.current = onTypingStop;
    onMessageReadRef.current = onMessageRead;
    onUnreadCountUpdateRef.current = onUnreadCountUpdate;
  }, [onNewMessage, onTypingStart, onTypingStop, onMessageRead, onUnreadCountUpdate]);

  // Get current user ID
  useEffect(() => {
    const getUserId = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      currentUserIdRef.current = user?.id || null;
    };
    getUserId();
  }, []);

  // Subscribe to global team chat channel
  useEffect(() => {
    if (!supabase) {
      console.warn('Supabase not configured - realtime disabled');
      return;
    }

    // Create global team chat channel
    const channel = supabase.channel('team-chat-global', {
      config: {
        broadcast: { self: false }, // Don't receive own broadcasts
      },
    });

    channel
      .on('broadcast', { event: 'team_message' }, (payload) => {
        const message = payload.payload as TeamMessage;

        // Call callback
        onNewMessageRef.current?.(message);

        // Play notification sound if not own message
        if (message.senderId !== currentUserIdRef.current) {
          const isMention = message.mentions?.includes(currentUserIdRef.current || '');
          notificationManager.playNotificationSound(isMention ? 'mention' : 'message');

          // Show browser notification if tab not focused
          if (!document.hasFocus()) {
            notificationManager.showNotification(
              isMention ? `${message.senderName} mentioned you` : `New message from ${message.senderName}`,
              {
                body: message.content.substring(0, 100),
                tag: `team-chat-${message.conversationId}`,
              }
            );
          }

          // Confirm delivery to backend (fire-and-forget, don't await)
          if (message.deliveryStatus === 'sent') {
            api.post(
              `/api/team-chat/conversations/${message.conversationId}/messages/${message.id}/delivered`
            ).catch((err) => {
              // Silent fail - delivery confirmation is best-effort
              console.debug('Delivery confirmation failed:', err);
            });
          }
        }

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['team-messages', message.conversationId] });
        queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
        queryClient.invalidateQueries({ queryKey: ['team-unread-count'] });
      })
      .on('broadcast', { event: 'unread_count' }, (payload) => {
        const { count } = payload.payload;
        onUnreadCountUpdateRef.current?.(count);
        queryClient.invalidateQueries({ queryKey: ['team-unread-count'] });
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          console.log('Connected to Supabase Realtime (global team chat)');
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [queryClient]);

  // Track current conversation ID for sendTypingIndicator
  const currentConversationIdRef = useRef<string | null>(null);

  // Subscribe to specific conversation channel (for typing indicators)
  useEffect(() => {
    if (!supabase || !conversationId) {
      currentConversationIdRef.current = null;
      return;
    }

    currentConversationIdRef.current = conversationId;

    const conversationChannel = supabase.channel(`conversation:${conversationId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: currentUserIdRef.current || 'anonymous' },
      },
    });

    conversationChannel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId, userName, isTyping } = payload.payload;

        if (userId === currentUserIdRef.current) return;

        if (isTyping) {
          onTypingStartRef.current?.(userId, userName);

          // Clear existing timeout
          const existingTimeout = typingTimeoutsRef.current.get(userId);
          if (existingTimeout) clearTimeout(existingTimeout);

          // Auto-clear after 5 seconds
          const timeout = setTimeout(() => {
            onTypingStopRef.current?.(userId);
            typingTimeoutsRef.current.delete(userId);
          }, 5000);
          typingTimeoutsRef.current.set(userId, timeout);
        } else {
          onTypingStopRef.current?.(userId);
          const timeout = typingTimeoutsRef.current.get(userId);
          if (timeout) {
            clearTimeout(timeout);
            typingTimeoutsRef.current.delete(userId);
          }
        }
      })
      .on('broadcast', { event: 'message_read' }, (payload) => {
        const { userId } = payload.payload;
        onMessageReadRef.current?.(userId);
      })
      .on('broadcast', { event: 'message_delivered' }, (payload) => {
        const { messageId, conversationId: convId, deliveryStatus } = payload.payload;

        // Update message in cache with new delivery status
        queryClient.setQueryData<TeamMessage[]>(
          ['team-messages', convId, '{}'],
          (old) =>
            old?.map((m) =>
              m.id === messageId
                ? { ...m, deliveryStatus: deliveryStatus || 'delivered' }
                : m
            )
        );
      })
      .subscribe();

    conversationChannelRef.current = conversationChannel;

    return () => {
      conversationChannel.unsubscribe();
      conversationChannelRef.current = null;
      currentConversationIdRef.current = null;
    };
  }, [conversationId]);

  // Cleanup typing timeouts
  useEffect(() => {
    return () => {
      typingTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeoutsRef.current.clear();
    };
  }, []);

  // Send typing indicator
  const sendTypingIndicator = useCallback(async (convId: string, isTyping: boolean) => {
    if (!supabase) return;

    // Use existing subscribed channel if we're in the same conversation
    // Creating a new unsubscribed channel won't broadcast properly
    if (convId === currentConversationIdRef.current && conversationChannelRef.current) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await conversationChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId: user.id,
          userName: user.user_metadata?.name || user.email || 'Unknown',
          isTyping,
        },
      });
    }
    // If sending to a different conversation, we don't have a subscribed channel
    // This is expected - typing indicators only work in the active conversation
  }, []);

  // Broadcast a message (called by backend, but can also be used client-side for optimistic updates)
  const broadcastMessage = useCallback(async (convId: string, message: TeamMessage) => {
    if (!supabase || !channelRef.current) return;

    await channelRef.current.send({
      type: 'broadcast',
      event: 'team_message',
      payload: message,
    });
  }, []);

  return {
    isConnected,
    sendTypingIndicator,
    broadcastMessage,
  };
}

export default useSupabaseRealtime;
