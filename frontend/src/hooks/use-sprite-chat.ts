/**
 * Sprite Chat React Hooks
 *
 * Custom hooks for sprite chat functionality using Claude Code.
 * Provides streaming chat, conversation management, and state tracking.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, streamSpriteChat, type SpriteChatEvent } from '@/lib/api';
import type { SpriteChatMessage, SpriteChatSession } from '@/types/sprite-chat';

// Query keys for sprite chat
export const spriteChatKeys = {
  all: ['sprite-chat'] as const,
  conversations: (spriteId: string) => [...spriteChatKeys.all, 'conversations', spriteId] as const,
  history: (sessionId: string) => [...spriteChatKeys.all, 'history', sessionId] as const,
};

// Generate unique message IDs
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Hook for managing sprite chat state and streaming
 */
export function useSpriteChat(spriteId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<SpriteChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Send a message and stream the response
  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!spriteId || !prompt.trim()) return;

      setError(null);
      setIsStreaming(true);

      // Add user message
      const userMessage: SpriteChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder for assistant message
      const assistantMessageId = generateMessageId();
      const assistantMessage: SpriteChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        const result = await streamSpriteChat(spriteId, prompt, {
          conversationId: conversationId || undefined,
          abortSignal: abortControllerRef.current.signal,
          onText: (text) => {
            // Update assistant message content incrementally
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + text }
                  : msg
              )
            );
          },
          onEvent: (event: SpriteChatEvent) => {
            // Handle tool events
            if (event.type === 'tool_start' && event.tool) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, toolUse: { name: event.tool!.name, input: event.tool!.input } }
                    : msg
                )
              );
            }
          },
        });

        // Update conversation ID from response
        if (result.sessionId) {
          setConversationId(result.sessionId);
        }

        // Mark streaming as complete
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg
          )
        );

        // Invalidate conversations query
        queryClient.invalidateQueries({ queryKey: spriteChatKeys.conversations(spriteId) });
      } catch (err) {
        // Handle abort
        if ((err as Error).name === 'AbortError') {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, isStreaming: false, content: msg.content || '(Message cancelled)' }
                : msg
            )
          );
        } else {
          const errorMessage = (err as Error).message || 'Failed to send message';
          setError(errorMessage);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, isStreaming: false, error: errorMessage }
                : msg
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [spriteId, conversationId, queryClient]
  );

  // Cancel the current streaming request
  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Clear messages and start a new conversation
  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  // Load a conversation by session ID
  const loadConversation = useCallback(
    async (sessionId: string) => {
      if (!spriteId) return;

      try {
        const history = await api.get<SpriteChatMessage[]>(
          `/api/sprites/${spriteId}/chat/conversations/${sessionId}`
        );
        setMessages(
          history.map((msg) => ({
            ...msg,
            id: msg.id || generateMessageId(),
          }))
        );
        setConversationId(sessionId);
        setError(null);
      } catch (err) {
        setError((err as Error).message || 'Failed to load conversation');
      }
    },
    [spriteId]
  );

  return {
    messages,
    isStreaming,
    error,
    conversationId,
    sendMessage,
    cancelStream,
    clearMessages,
    loadConversation,
    setConversationId,
  };
}

/**
 * Hook for fetching sprite chat conversations
 */
export function useSpriteConversations(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteChatKeys.conversations(spriteId ?? ''),
    queryFn: () =>
      api.get<SpriteChatSession[]>(`/api/sprites/${spriteId}/chat/conversations`),
    enabled: !!spriteId,
  });
}

/**
 * Hook for fetching conversation history
 */
export function useSpriteConversationHistory(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: spriteChatKeys.history(sessionId ?? ''),
    queryFn: () =>
      api.get<SpriteChatMessage[]>(`/api/sprites/placeholder/chat/conversations/${sessionId}`),
    enabled: !!sessionId,
  });
}
