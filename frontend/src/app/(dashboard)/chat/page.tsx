'use client';

import { ArtifactPanel } from '@/components/chat/ArtifactPanel';
import { ChatInput } from '@/components/chat/ChatInput';
import { ConversationSidebar } from '@/components/chat/ConversationSidebar';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { RealtimeVoice } from '@/components/chat/RealtimeVoice';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useConversation,
  useConversations,
  useGenerateConversationTitle,
  type ConversationMessage,
} from '@/hooks/use-conversations';
import { useSound, useSoundSettings } from '@/hooks/use-sound';
import { useCurrentUser } from '@/hooks/use-user';
import { useAgent } from '@/contexts/agent-context';
import { streamChat, type ToolEvent } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { useChatStore } from '@/stores/chat-store';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import {
  BarChart3,
  MapPin,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  Search,
  TrendingUp,
  Volume2,
  VolumeX
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; status: 'running' | 'done' }[];
}

const quickPrompts = [
  {
    label: 'Find deals',
    description: 'Search properties by location and price',
    prompt: 'Find deals in Texas under $300K',
    icon: Search,
  },
  {
    label: 'Score deals',
    description: 'Evaluate against buy box criteria',
    prompt: 'Score my latest deals against all buy boxes',
    icon: TrendingUp,
  },
  {
    label: 'Pipeline summary',
    description: 'View your deal pipeline status',
    prompt: 'Show me my pipeline summary',
    icon: BarChart3,
  },
  {
    label: 'Market analysis',
    description: 'Get market insights by region',
    prompt: 'What is market like in Florida for fix and flip?',
    icon: MapPin,
  },
];

const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
      staggerChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
    },
  },
};

const headerVariants: Variants = {
  initial: { opacity: 0, y: -10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: 0.1 },
  },
};

const contentVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: 0.2 },
  },
};

const quickPromptVariants: Variants = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.3,
      delay: 0.3 + i * 0.08,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
  hover: {
    scale: 1.02,
    transition: { duration: 0.2 },
  },
  tap: {
    scale: 0.98,
  },
};

export default function ChatPage() {
  const { currentConversationId, setCurrentConversation } = useAppStore();
  const {
    conversationSidebarOpen,
    setConversationSidebarOpen,
    inputValue,
    setInputValue,
    isStreaming,
    setIsStreaming,
  } = useChatStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [shouldConnectVoice, setShouldConnectVoice] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevConversationIdRef = useRef<string | null>(null);
  const isSendingRef = useRef(false);
  const hasLocalMessagesRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageCountRef = useRef(0);
  const prevMessageCountRef = useRef(0);
  const loadedConversationIdRef = useRef<string | null>(null); // Track which conversation's messages we've loaded

  const generateMessageId = useCallback(() => {
    messageCountRef.current += 1;
    return `msg-${Date.now()}-${messageCountRef.current}-${Math.random().toString(36).substring(2, 9)}`;
  }, []);

  const { refetch: refetchConversations } = useConversations();
  const { data: currentConversationData, isLoading: isLoadingConversation, error: conversationError } = useConversation(currentConversationId);
  const generateTitleMutation = useGenerateConversationTitle();
  const { playMessageSound, playSendSound } = useSound();
  const { soundEnabled, setSoundEnabled } = useSoundSettings();
  const { data: currentUser } = useCurrentUser();
  const { agent } = useAgent();

  // Get first name for personalized greeting
  const firstName = currentUser?.name?.split(' ')[0] || '';

  useEffect(() => {
    const prevId = prevConversationIdRef.current;

    // Reset when switching between existing conversations OR when selecting a conversation from fresh state
    if (currentConversationId !== null && currentConversationId !== prevId) {
      setMessages([]);
      hasLocalMessagesRef.current = false;
      isSendingRef.current = false;
      loadedConversationIdRef.current = null;
    }

    prevConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    if (!isVoiceMode && shouldConnectVoice) {
      setShouldConnectVoice(false);
    }
  }, [isVoiceMode, shouldConnectVoice]);

  // Handle conversation load errors (e.g., conversation was deleted)
  useEffect(() => {
    if (conversationError && currentConversationId) {
      console.warn('Failed to load conversation:', conversationError);
      // Clear the current conversation and start fresh
      setCurrentConversation(null);
      setMessages([]);
      hasLocalMessagesRef.current = false;
      loadedConversationIdRef.current = null;
    }
  }, [conversationError, currentConversationId, setCurrentConversation]);

  useEffect(() => {
    // Load messages from server when we have data for the current conversation
    const conversationId = currentConversationData?.id;

    if (
      currentConversationData?.messages &&
      conversationId &&
      loadedConversationIdRef.current !== conversationId &&
      !hasLocalMessagesRef.current &&
      !isStreaming &&
      !isSendingRef.current
    ) {
      const loadedMessages: Message[] = currentConversationData.messages
        .filter((m: ConversationMessage) => {
          if (m.role === 'system') return false;
          if (!m.content || m.content.trim() === '') return false;
          return true;
        })
        .map((m: ConversationMessage, idx: number) => ({
          id: m.id ? `server-${m.id}` : `loaded-${idx}-${m.role || 'msg'}-${(m.content || '').substring(0, 20).replace(/\s/g, '_')}`,
          role: m.role as 'user' | 'assistant',
          content: m.content || '',
          toolCalls: m.toolCalls?.map(tc => ({
            name: tc.name,
            status: (tc.status === 'running' ? 'running' : 'done') as 'running' | 'done',
          })),
        }));

      setMessages(loadedMessages);
      loadedConversationIdRef.current = conversationId;
    }
  }, [currentConversationData, isStreaming]);

  useEffect(() => {
    const currentCount = messages.length;
    if (currentCount > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = currentCount;
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming || isSendingRef.current) return;

    isSendingRef.current = true;
    hasLocalMessagesRef.current = true;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const currentAbortController = abortControllerRef.current;

    const userMessageId = generateMessageId();
    const assistantMessageId = generateMessageId();

    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: inputValue.trim(),
    };

    const messageContent = userMessage.content;

    setIsStreaming(true);
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantMessageId, role: 'assistant', content: '' },
    ]);
    setInputValue('');
    playSendSound(); // Play send sound

    const isNewConversation = !currentConversationId;
    const sessionId = currentConversationId || generateMessageId();

    if (isNewConversation) {
      setCurrentConversation(sessionId);
    }

    const toolCallsMap = new Map<string, { name: string; status: 'running' | 'done' }>();

    try {
      let fullContent = '';
      await streamChat(
        messageContent,
        sessionId,
        (chunk) => {
          if (currentAbortController.signal.aborted) return;

          fullContent += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId ? { ...m, content: fullContent } : m
            )
          );
        },
        (event: ToolEvent) => {
          if (currentAbortController.signal.aborted) return;

          if (event.type === 'tool_start') {
            toolCallsMap.set(event.tool, { name: event.tool, status: 'running' });
          } else if (event.type === 'tool_end') {
            const existing = toolCallsMap.get(event.tool);
            if (existing) {
              existing.status = 'done';
            }
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, toolCalls: Array.from(toolCallsMap.values()) }
                : m
            )
          );
        },
        currentAbortController.signal
      );

      if (currentAbortController.signal.aborted) return;

      // Play message received sound
      playMessageSound();

      // Refetch conversations in background - don't let auth errors interrupt the chat
      try {
        await refetchConversations();
      } catch (refetchError) {
        console.warn('Failed to refetch conversations:', refetchError);
        // Don't throw - let the chat continue even if refetch fails
      }

      if (isNewConversation && sessionId) {
        generateTitleMutation.mutate(sessionId);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;

      console.error('Chat error:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: 'Sorry, I encountered an error. Please try again.' }
            : m
        )
      );
    } finally {
      if (abortControllerRef.current === currentAbortController) {
        setIsStreaming(false);
        isSendingRef.current = false;
      }
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInputValue(prompt);
  };

  const startNewChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setCurrentConversation(null);
    setIsStreaming(false);
    prevConversationIdRef.current = null;
    isSendingRef.current = false;
    hasLocalMessagesRef.current = false;
    prevMessageCountRef.current = 0;
    loadedConversationIdRef.current = null; // Reset loaded conversation tracker
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  return (
    <motion.div
      className="flex h-full bg-zinc-950"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <ConversationSidebar onNewChat={startNewChat} />

      <div
        className="flex-1 flex flex-col min-w-0 relative"
        style={{
          backgroundColor: 'rgb(9, 9, 11)',
          backgroundImage: 'linear-gradient(rgba(9,9,11,0.93), rgba(9,9,11,0.93)), url(/wallpaper.jpg)',
          backgroundSize: '120% 120%',
          backgroundPosition: 'center center',
        }}
      >
        <motion.div
          className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-transparent"
          variants={headerVariants}
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              onClick={() => setConversationSidebarOpen(!conversationSidebarOpen)}
            >
              {conversationSidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeftOpen className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={startNewChat}
              className="gap-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-4 rounded-lg font-medium transition-all',
                !isVoiceMode
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-transparent'
              )}
              onClick={() => {
                setIsVoiceMode(false);
                setShouldConnectVoice(false);
              }}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Text
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-4 rounded-lg font-medium transition-all',
                isVoiceMode
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-transparent',
                isVoiceConnected && 'text-green-400'
              )}
              onClick={() => {
                setIsVoiceMode(true);
                setShouldConnectVoice(true);
              }}
            >
              <Phone className="h-4 w-4 mr-2" />
              Voice
            </Button>
          </div>

          {/* Sound toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-9 w-9 rounded-lg transition-all',
              soundEnabled
                ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
            )}
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
          >
            {soundEnabled ? (
              <Volume2 className="h-5 w-5" />
            ) : (
              <VolumeX className="h-5 w-5" />
            )}
          </Button>
        </motion.div>

        <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
          <AnimatePresence mode="popLayout">
            <motion.div
              className="flex-1 flex flex-col min-w-0 relative z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {isVoiceMode ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <RealtimeVoice
                    onTranscription={(text, role) => {
                      hasLocalMessagesRef.current = true;
                      const message: Message = {
                        id: generateMessageId(),
                        role,
                        content: text,
                      };
                      setMessages((prev) => [...prev, message]);
                    }}
                    onUserSpeakingChange={() => {}}
                    onAiSpeakingChange={() => {}}
                    onError={(error) => {
                      console.error('Voice error:', error);
                      setShouldConnectVoice(false);
                    }}
                    onConnectionChange={(connected) => {
                      setIsVoiceConnected(connected);
                      setShouldConnectVoice(connected);
                    }}
                    autoConnect={shouldConnectVoice}
                    className="w-full max-w-md"
                  />
                </div>
              ) : (
                <>
                  <ScrollArea className="flex-1 h-0" ref={scrollRef}>
                    <motion.div
                      className="max-w-3xl mx-auto px-4 py-8"
                      variants={contentVariants}
                    >
                      {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                          <motion.div
                            className="relative mb-8"
                            initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            transition={{
                              duration: 0.5,
                              delay: 0.2,
                              type: 'spring',
                              stiffness: 200,
                            }}
                          >
                            {/* Animated glow effect */}
                            <motion.div
                              className="pointer-events-none absolute -inset-4 rounded-2xl bg-gradient-to-br from-cyan-400/30 via-accent-500/25 to-fuchsia-500/30 blur-xl"
                              animate={{
                                opacity: [0.4, 0.7, 0.4],
                                scale: [0.95, 1.08, 0.95],
                              }}
                              transition={{
                                duration: 2.5,
                                repeat: Infinity,
                                ease: 'easeInOut',
                              }}
                            />
                            {/* Pulsing border ring */}
                            <motion.div
                              className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-accent-400/30"
                              animate={{
                                opacity: [0.2, 0.5, 0.2],
                              }}
                              transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: 'easeInOut',
                              }}
                            />
                            {/* Square avatar with rounded corners */}
                            <div className="relative z-10 h-20 w-20 rounded-2xl bg-gradient-to-br from-accent-500/20 to-accent-600/10 ring-2 ring-accent-500/40 overflow-hidden shadow-xl shadow-accent-500/20">
                              <Image
                                src={agent.avatar}
                                alt={agent.name}
                                fill
                                sizes="80px"
                                className="object-cover"
                              />
                            </div>
                            {/* Online status indicator */}
                            <motion.div
                              className="absolute -bottom-1 -right-1 z-20 w-6 h-6 rounded-lg bg-green-500 border-3 border-zinc-950 shadow-lg shadow-green-500/50"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.3, delay: 0.5, type: 'spring', stiffness: 200 }}
                            />
                          </motion.div>
                          <motion.h1
                            className="text-3xl font-bold text-zinc-100 mb-3"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.3 }}
                          >
                            How can I help you{firstName ? `, ${firstName}` : ''}?
                          </motion.h1>
                          <motion.p
                            className="text-zinc-400 max-w-lg mb-10 leading-relaxed"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.4 }}
                          >
                            I can help you find deals, analyze properties, manage your pipeline,
                            and answer questions about real estate wholesaling.
                          </motion.p>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full">
                            {quickPrompts.map((item, index) => {
                              const Icon = item.icon;
                              return (
                                <motion.button
                                  key={item.prompt}
                                  custom={index}
                                  variants={quickPromptVariants}
                                  initial="initial"
                                  animate="animate"
                                  whileHover="hover"
                                  whileTap="tap"
                                  className={cn(
                                    'group flex items-start gap-3 p-4 rounded-xl text-left',
                                    'bg-zinc-900/50 border border-zinc-800/50',
                                    'hover:bg-zinc-800/80 hover:border-zinc-700/50',
                                    'transition-colors duration-200'
                                  )}
                                  onClick={() => handleQuickPrompt(item.prompt)}
                                >
                                  <div className={cn(
                                    'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                                    'bg-zinc-800 group-hover:bg-accent-600/20',
                                    'transition-colors duration-200'
                                  )}>
                                    <Icon className="h-5 w-5 text-zinc-400 group-hover:text-accent-400 transition-colors" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors">
                                      {item.label}
                                    </p>
                                    <p className="text-sm text-zinc-500 group-hover:text-zinc-400 transition-colors truncate">
                                      {item.description}
                                    </p>
                                  </div>
                              </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      ) : isLoadingConversation && currentConversationId && messages.length === 0 ? (
                        // Loading skeleton when fetching saved conversation
                        <div className="space-y-6">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className={`flex gap-3 ${i % 2 === 0 ? 'justify-end' : ''}`}>
                              {i % 2 !== 0 && <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />}
                              <div className={`flex flex-col gap-2 ${i % 2 === 0 ? 'items-end' : ''}`}>
                                <Skeleton className={`h-4 ${i % 2 === 0 ? 'w-20' : 'w-24'}`} />
                                <Skeleton className={`h-20 ${i % 2 === 0 ? 'w-48' : 'w-64'} rounded-xl`} />
                              </div>
                              {i % 2 === 0 && <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {messages.map((message, index) => (
                            <MessageBubble
                              key={message.id}
                              message={message}
                              isStreaming={
                                isStreaming &&
                                index === messages.length - 1 &&
                                message.role === 'assistant'
                              }
                              onDelete={handleDeleteMessage}
                              onCopy={handleCopyMessage}
                            />
                          ))}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </motion.div>
                  </ScrollArea>

                  <motion.div
                    className="border-t border-white/5 bg-transparent"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                  >
                    <div className="max-w-3xl mx-auto px-4 py-4">
                      <ChatInput
                        value={inputValue}
                        onChange={setInputValue}
                        onSubmit={handleSend}
                        disabled={isStreaming}
                        placeholder={`Message ${agent.name}...`}
                      />
                      <p className="text-xs text-zinc-600 text-center mt-3">
                        {agent.name} can make mistakes. Verify important information.
                      </p>
                    </div>
                  </motion.div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <ArtifactPanel />
      </div>
    </motion.div>
  );
}
