/**
 * SpriteChatPanel
 *
 * Chat interface for communicating with Claude Code running inside a sprite.
 * Provides a simple chat UI with streaming responses.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Loader2,
  MessageSquare,
  Plus,
  History,
  X,
  ChevronLeft,
  StopCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSpriteChat, useSpriteConversations } from '@/hooks/use-sprite-chat';
import { useSpriteByProject } from '@/hooks/use-sprites';
import type { SpriteStatus } from '@/types/sprite';
import type { SpriteChatMessage } from '@/types/sprite-chat';
import ReactMarkdown from 'react-markdown';

interface SpriteChatPanelProps {
  projectId: string;
  className?: string;
}

// Simple markdown code block renderer
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <pre className={cn('bg-zinc-900 rounded p-2 overflow-x-auto text-sm', className)}>
      <code>{children}</code>
    </pre>
  );
}

// Chat message bubble component
function ChatMessage({
  message,
  isLast,
}: {
  message: SpriteChatMessage;
  isLast: boolean;
}) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-blue-600' : 'bg-purple-600'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          'flex-1 max-w-[85%] rounded-lg px-4 py-2',
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-zinc-800 text-zinc-100'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              components={{
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="bg-zinc-700 px-1 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    );
                  }
                  return <CodeBlock className={className}>{children}</CodeBlock>;
                },
                pre: ({ children }) => <>{children}</>,
              }}
            >
              {message.content || (isStreaming ? '' : '...')}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1" />
            )}
          </div>
        )}

        {/* Tool usage indicator */}
        {message.toolUse && (
          <div className="mt-2 text-xs text-zinc-400 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Using tool: {message.toolUse.name}
          </div>
        )}

        {/* Error indicator */}
        {message.error && (
          <div className="mt-2 text-xs text-red-400">
            Error: {message.error}
          </div>
        )}
      </div>
    </div>
  );
}

// Conversation history sidebar
function ConversationSidebar({
  spriteId,
  onSelectConversation,
  onNewConversation,
  currentConversationId,
  onClose,
}: {
  spriteId: string;
  onSelectConversation: (sessionId: string) => void;
  onNewConversation: () => void;
  currentConversationId: string | null;
  onClose: () => void;
}) {
  const { data: conversations, isLoading } = useSpriteConversations(spriteId);

  return (
    <div className="w-64 h-full border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-100">History</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={onNewConversation}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1 p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : conversations && conversations.length > 0 ? (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                className={cn(
                  'w-full text-left p-2 rounded text-sm hover:bg-zinc-800 transition-colors',
                  currentConversationId === conv.id && 'bg-zinc-800'
                )}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="truncate text-zinc-100">{conv.title}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {conv.messageCount} messages
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 text-center py-4">
            No conversations yet
          </p>
        )}
      </ScrollArea>
    </div>
  );
}

export function SpriteChatPanel({ projectId, className }: SpriteChatPanelProps) {
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: sprite, isLoading: spriteLoading } = useSpriteByProject(projectId);
  const spriteId = sprite?.id;

  const {
    messages,
    isStreaming,
    error,
    conversationId,
    sendMessage,
    cancelStream,
    clearMessages,
    loadConversation,
  } = useSpriteChat(spriteId);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || isStreaming || !spriteId) return;

    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleNewConversation = () => {
    clearMessages();
    setShowHistory(false);
  };

  const handleSelectConversation = (sessionId: string) => {
    loadConversation(sessionId);
    setShowHistory(false);
  };

  // Loading state
  if (spriteLoading) {
    return (
      <Card className={cn('bg-card border h-full flex flex-col', className)}>
        <CardContent className="flex items-center justify-center flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No sprite
  if (!sprite) {
    return (
      <Card className={cn('bg-card border h-full flex flex-col', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-purple-400" />
            Chat with Claude
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center flex-1">
          <div className="text-center text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Create a coding agent first to use chat.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Chat only works when sprite is actually running
  // (not hibernating, initializing, restoring, etc.)
  const isRunning = sprite.status === 'running';

  // Helper to get status-specific message
  const getStatusMessage = (status: SpriteStatus): { message: string; showSpinner: boolean } => {
    switch (status) {
      case 'hibernating':
        return { message: 'Resume the coding agent to use chat.', showSpinner: false };
      case 'initializing':
        return { message: 'Agent is initializing...', showSpinner: true };
      case 'restoring':
        return { message: 'Agent is waking up...', showSpinner: true };
      case 'creating':
        return { message: 'Agent is being created...', showSpinner: true };
      case 'checkpointing':
        return { message: 'Agent is saving state...', showSpinner: true };
      case 'error':
        return { message: 'Agent encountered an error. Please check the Agent tab.', showSpinner: false };
      case 'deleted':
        return { message: 'Agent was deleted. Create a new one to use chat.', showSpinner: false };
      case 'stopped':
        return { message: 'Agent is stopped. Start it to use chat.', showSpinner: false };
      default:
        return { message: 'Start the coding agent to use chat.', showSpinner: false };
    }
  };

  if (!isRunning) {
    const { message, showSpinner } = getStatusMessage(sprite.status);

    return (
      <Card className={cn('bg-card border h-full flex flex-col', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-purple-400" />
            Chat with Claude
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center flex-1">
          <div className="text-center text-muted-foreground">
            {showSpinner ? (
              <Loader2 className="h-12 w-12 mx-auto mb-4 opacity-50 animate-spin" />
            ) : (
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
            )}
            <p>{message}</p>
            <p className="text-sm mt-2 text-zinc-500">Status: {sprite.status}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('bg-card border h-full flex flex-col overflow-hidden', className)}>
      <div className="flex flex-1 overflow-hidden">
        {/* History Sidebar */}
        {showHistory && spriteId && (
          <ConversationSidebar
            spriteId={spriteId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            currentConversationId={conversationId}
            onClose={() => setShowHistory(false)}
          />
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <CardHeader className="pb-3 flex-shrink-0 border-b border-zinc-800/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-purple-400" />
                Chat with Claude
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleNewConversation}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          {/* Messages Area */}
          <ScrollArea className="flex-1 p-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Start a conversation</p>
                  <p className="text-sm mt-1">
                    Ask Claude to help you with your code.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isLast={index === messages.length - 1}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Error Display */}
          {error && (
            <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 border-t border-zinc-800/50 flex-shrink-0">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Claude..."
                  disabled={isStreaming}
                  rows={1}
                  className={cn(
                    'w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800/50',
                    'px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500',
                    'focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50',
                    'min-h-[48px] max-h-[200px]',
                    isStreaming && 'opacity-50'
                  )}
                  style={{
                    height: 'auto',
                    minHeight: '48px',
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                  }}
                />
              </div>
              {isStreaming ? (
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-12 w-12"
                  onClick={cancelStream}
                >
                  <StopCircle className="h-5 w-5" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className={cn(
                    'h-12 w-12',
                    input.trim()
                      ? 'bg-purple-600 hover:bg-purple-500'
                      : 'bg-zinc-700 text-zinc-500'
                  )}
                  disabled={!input.trim()}
                  onClick={handleSubmit}
                >
                  <Send className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
