'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket, WebSocketMessage } from './use-websocket';
import type { TeamChatWebSocketEvent, TeamMessage, TeamConversation } from '@/types';

export interface UseTeamChatWebSocketOptions {
  conversationId?: string | null;
  onNewMessage?: (message: TeamMessage) => void;
  onTypingStart?: (userId: string, userName: string) => void;
  onTypingStop?: (userId: string) => void;
  onMessageRead?: (userId: string) => void;
  onNewConversation?: (conversation: TeamConversation) => void;
  onUnreadCountUpdate?: (count: number, totalCount: number) => void;
}

export interface UseTeamChatWebSocketReturn {
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  typingUsers: Map<string, string>; // userId -> userName
}

export function useTeamChatWebSocket(
  options: UseTeamChatWebSocketOptions = {}
): UseTeamChatWebSocketReturn {
  const {
    conversationId,
    onNewMessage,
    onTypingStart,
    onTypingStop,
    onMessageRead,
    onNewConversation,
    onUnreadCountUpdate,
  } = options;

  const queryClient = useQueryClient();
  // Use state for typingUsers so components re-render when it changes
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Use refs for callbacks to prevent reconnections
  const onNewMessageRef = useRef(onNewMessage);
  const onTypingStartRef = useRef(onTypingStart);
  const onTypingStopRef = useRef(onTypingStop);
  const onMessageReadRef = useRef(onMessageRead);
  const onNewConversationRef = useRef(onNewConversation);
  const onUnreadCountUpdateRef = useRef(onUnreadCountUpdate);

  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
    onTypingStartRef.current = onTypingStart;
    onTypingStopRef.current = onTypingStop;
    onMessageReadRef.current = onMessageRead;
    onNewConversationRef.current = onNewConversation;
    onUnreadCountUpdateRef.current = onUnreadCountUpdate;
  }, [onNewMessage, onTypingStart, onTypingStop, onMessageRead, onNewConversation, onUnreadCountUpdate]);

  const handleWebSocketMessage = useCallback(
    (message: WebSocketMessage) => {
      // Only handle team chat events
      const teamChatTypes = [
        'team_message',
        'typing_start',
        'typing_stop',
        'message_read',
        'conversation_created',
        'unread_count',
      ];

      if (!teamChatTypes.includes(message.type)) {
        return;
      }

      const event = message as unknown as TeamChatWebSocketEvent;

      switch (event.type) {
        case 'team_message':
          if (event.message) {
            // Call callback
            onNewMessageRef.current?.(event.message);

            // Immediately add message to cache (don't wait for refetch)
            if (event.conversationId) {
              // Update messages cache directly
              queryClient.setQueryData<TeamMessage[]>(
                ['team-messages', event.conversationId, '{}'],
                (oldMessages) => {
                  if (!oldMessages) return [event.message!];

                  // Check for exact ID duplicate only
                  const existingIndex = oldMessages.findIndex((msg) => msg.id === event.message!.id);
                  if (existingIndex !== -1) {
                    // Update existing message with latest data
                    const updated = [...oldMessages];
                    updated[existingIndex] = event.message!;
                    return updated;
                  }

                  // Check if this completes an optimistic message from the current user
                  // Only match optimistic messages, not by content (to avoid false positives)
                  const optimisticIndex = oldMessages.findIndex((msg) => {
                    // Only match optimistic messages from same sender
                    if (typeof msg.id !== 'string' || !msg.id.startsWith('optimistic_')) {
                      return false;
                    }
                    // Must be same sender
                    if (msg.senderId !== event.message!.senderId) {
                      return false;
                    }
                    // Must be within a reasonable time window (10 seconds)
                    const timeDiff = Math.abs(
                      new Date(msg.createdAt).getTime() - new Date(event.message!.createdAt).getTime()
                    );
                    if (timeDiff > 10000) {
                      return false;
                    }
                    // Content must match exactly
                    return msg.content === event.message!.content;
                  });

                  if (optimisticIndex !== -1) {
                    // Replace optimistic message with real one
                    const updated = [...oldMessages];
                    updated[optimisticIndex] = event.message!;
                    return updated;
                  }

                  // Add new message at the end (newest last for display)
                  return [...oldMessages, event.message!];
                }
              );

              // Also invalidate to ensure consistency
              queryClient.invalidateQueries({
                queryKey: ['team-messages', event.conversationId],
                refetchType: 'none', // Don't refetch immediately, let polling handle it
              });
            }

            // Update conversations list with new last message
            queryClient.setQueryData<TeamConversation[]>(
              ['team-conversations', '{}'],
              (oldConversations) => {
                if (!oldConversations) return oldConversations;
                return oldConversations.map((conv) => {
                  if (conv.id === event.conversationId) {
                    return {
                      ...conv,
                      lastMessage: event.message!.content,
                      lastMessageAt: event.message!.createdAt,
                      lastMessageSender: event.message!.senderName || 'Unknown',
                    };
                  }
                  return conv;
                });
              }
            );

            queryClient.invalidateQueries({
              queryKey: ['team-unread-count'],
            });
          }
          break;

        case 'typing_start':
          if (event.userId && event.userName) {
            // Add to typing users (using setState for reactivity)
            setTypingUsers((prev) => {
              const next = new Map(prev);
              next.set(event.userId!, event.userName!);
              return next;
            });

            // Clear existing timeout for this user
            const existingTimeout = typingTimeoutsRef.current.get(event.userId);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
            }

            // Auto-clear typing after 5 seconds
            const timeout = setTimeout(() => {
              setTypingUsers((prev) => {
                const next = new Map(prev);
                next.delete(event.userId!);
                return next;
              });
              typingTimeoutsRef.current.delete(event.userId!);
              onTypingStopRef.current?.(event.userId!);
            }, 5000);
            typingTimeoutsRef.current.set(event.userId, timeout);

            onTypingStartRef.current?.(event.userId, event.userName);
          }
          break;

        case 'typing_stop':
          if (event.userId) {
            // Remove from typing users (using setState for reactivity)
            setTypingUsers((prev) => {
              const next = new Map(prev);
              next.delete(event.userId!);
              return next;
            });

            // Clear timeout
            const timeout = typingTimeoutsRef.current.get(event.userId);
            if (timeout) {
              clearTimeout(timeout);
              typingTimeoutsRef.current.delete(event.userId);
            }

            onTypingStopRef.current?.(event.userId);
          }
          break;

        case 'message_read':
          if (event.userId) {
            onMessageReadRef.current?.(event.userId);
          }
          break;

        case 'conversation_created':
          if (event.conversation) {
            onNewConversationRef.current?.(event.conversation);

            // Invalidate conversations list
            queryClient.invalidateQueries({
              queryKey: ['team-conversations'],
            });
          }
          break;

        case 'unread_count':
          if (event.count !== undefined && event.totalCount !== undefined) {
            onUnreadCountUpdateRef.current?.(event.count, event.totalCount);

            // Invalidate unread count query
            queryClient.invalidateQueries({
              queryKey: ['team-unread-count'],
            });
          }
          break;
      }
    },
    [queryClient]
  );

  const { isConnected, connectionState, subscribe, unsubscribe } = useWebSocket({
    autoConnect: true,
    onMessage: handleWebSocketMessage,
  });

  // Subscribe to team chat channel when connected
  useEffect(() => {
    if (isConnected) {
      subscribe('team_chat');
    }

    return () => {
      if (isConnected) {
        unsubscribe('team_chat');
      }
    };
  }, [isConnected, subscribe, unsubscribe]);

  // Subscribe to specific conversation if provided
  useEffect(() => {
    if (isConnected && conversationId) {
      subscribe(`conversation:${conversationId}`);
    }

    return () => {
      if (isConnected && conversationId) {
        unsubscribe(`conversation:${conversationId}`);
      }
    };
  }, [isConnected, conversationId, subscribe, unsubscribe]);

  // Cleanup typing timeouts on unmount
  useEffect(() => {
    return () => {
      typingTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeoutsRef.current.clear();
    };
  }, []);

  return {
    isConnected,
    connectionState,
    typingUsers,
  };
}

export default useTeamChatWebSocket;
