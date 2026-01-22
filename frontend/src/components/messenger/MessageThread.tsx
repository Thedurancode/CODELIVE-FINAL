'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

/**
 * Robust HTML sanitizer to prevent XSS attacks
 * Uses allowlist approach for safety
 */
function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Create a temporary DOM element to parse HTML safely
  if (typeof document === 'undefined') {
    // Server-side: use basic regex sanitization as fallback
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*\s+on\w+\s*=/gi, '<')
      .replace(/javascript:/gi, '')
      .replace(/<(iframe|object|embed|form|input|button|meta|link|base)[^>]*>/gi, '')
      .replace(/<\/(iframe|object|embed|form|input|button|meta|link|base)>/gi, '');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Allowed tags (safe formatting elements)
  const allowedTags = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  ]);

  // Allowed attributes per tag
  const allowedAttrs: Record<string, Set<string>> = {
    a: new Set(['href', 'title', 'target', 'rel']),
    img: new Set(['src', 'alt', 'title', 'width', 'height']),
    '*': new Set(['class', 'id']),
  };

  function sanitizeNode(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();

      // Remove disallowed tags entirely
      if (!allowedTags.has(tagName)) {
        // Keep text content but remove the tag
        const text = document.createTextNode(el.textContent || '');
        el.parentNode?.replaceChild(text, el);
        return;
      }

      // Remove all event handlers and dangerous attributes
      const attrsToRemove: string[] = [];
      for (const attr of Array.from(el.attributes)) {
        const attrName = attr.name.toLowerCase();

        // Remove any on* event handlers
        if (attrName.startsWith('on')) {
          attrsToRemove.push(attr.name);
          continue;
        }

        // Remove javascript: and data: URLs
        if (['href', 'src', 'action'].includes(attrName)) {
          const value = attr.value.toLowerCase().trim();
          if (value.startsWith('javascript:') || value.startsWith('data:') || value.startsWith('vbscript:')) {
            attrsToRemove.push(attr.name);
            continue;
          }
        }

        // Check if attribute is allowed
        const tagAllowed = allowedAttrs[tagName]?.has(attrName);
        const globalAllowed = allowedAttrs['*']?.has(attrName);
        if (!tagAllowed && !globalAllowed) {
          attrsToRemove.push(attr.name);
        }
      }

      attrsToRemove.forEach(attr => el.removeAttribute(attr));

      // Add security attrs to links
      if (tagName === 'a') {
        el.setAttribute('rel', 'noopener noreferrer');
        if (!el.getAttribute('target')) {
          el.setAttribute('target', '_blank');
        }
      }
    }

    // Recursively sanitize children
    Array.from(node.childNodes).forEach(sanitizeNode);
  }

  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  MessageSquare,
  MoreVertical,
  Archive,
  ExternalLink,
  Home,
  ChevronDown,
  CheckCheck,
  Check,
  Clock,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  useTeamMessages,
  useInfiniteTeamMessages,
  useMarkTeamMessagesRead,
  useArchiveTeamConversation,
  usePendingMessages,
  useRetryPendingMessages,
  useConnectionStatus,
} from '@/hooks/use-team-chat';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { useOnlineUsers } from '@/hooks/use-user-presence';
import { MessageInput } from './MessageInput';
import { MessageContent } from './MessageContent';
import type { TeamConversation, TeamMessage } from '@/types';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';

export interface MessageThreadProps {
  conversation: TeamConversation;
  onBack: () => void;
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'sms':
      return <Phone className="h-3 w-3" />;
    case 'email':
      return <Mail className="h-3 w-3" />;
    default:
      return <MessageSquare className="h-3 w-3" />;
  }
}

function getSourceLabel(source: string) {
  switch (source) {
    case 'sms':
      return 'SMS';
    case 'email':
      return 'Email';
    default:
      return 'Platform';
  }
}

function formatMessageTime(date: Date | string) {
  const d = new Date(date);
  return format(d, 'h:mm a');
}

function formatDateHeader(date: Date | string) {
  const d = new Date(date);
  if (isToday(d)) {
    return 'Today';
  }
  if (isYesterday(d)) {
    return 'Yesterday';
  }
  return format(d, 'EEEE, MMMM d, yyyy');
}

function getInitials(name?: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function DateHeader({ date }: { date: string }) {
  return (
    <div className="flex items-center justify-center my-4">
      <div className="bg-muted/80 text-muted-foreground text-xs font-medium px-3 py-1 rounded-full">
        {formatDateHeader(date)}
      </div>
    </div>
  );
}

function DeliveryStatusIcon({ status, readBy }: { status?: string; readBy?: any[] }) {
  const hasBeenRead = readBy && readBy.length > 0;

  if (hasBeenRead) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <CheckCheck className="h-3 w-3 text-blue-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Read by {readBy.length} {readBy.length === 1 ? 'person' : 'people'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  switch (status) {
    case 'pending':
      return <Clock className="h-3 w-3 text-muted-foreground animate-pulse" />;
    case 'sending':
      return <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />;
    case 'sent':
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'failed':
      return <AlertCircle className="h-3 w-3 text-red-500" />;
    default:
      return <Check className="h-3 w-3 text-muted-foreground" />;
  }
}

function MessageBubble({
  message,
  isOwn,
  currentUserId,
  onRetry,
  isSenderOnline,
}: {
  message: TeamMessage;
  isOwn: boolean;
  currentUserId?: string;
  onRetry?: () => void;
  isSenderOnline?: boolean;
}) {
  const isFailed = message.deliveryStatus === 'failed';
  const isPending = message.deliveryStatus === 'pending' || message.id.startsWith('optimistic_') || message.id.startsWith('pending_');

  return (
    <div
      className={cn(
        'flex gap-2 mb-3 group',
        isOwn ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {!isOwn && (
        <div className="relative flex-shrink-0">
          <Avatar className="h-8 w-8">
            {message.senderAvatar ? (
              <AvatarImage src={message.senderAvatar} alt={message.senderName} />
            ) : null}
            <AvatarFallback className="text-xs">
              {getInitials(message.senderName)}
            </AvatarFallback>
          </Avatar>
          {isSenderOnline && (
            <OnlineIndicator
              isOnline={true}
              size="sm"
              className="absolute -bottom-0.5 -right-0.5"
            />
          )}
        </div>
      )}

      <div
        className={cn(
          'flex flex-col max-w-[75%]',
          isOwn ? 'items-end' : 'items-start'
        )}
      >
        {/* Sender info */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-medium">{message.senderName}</span>
            <Badge variant="outline" className="h-4 px-1 text-[10px] gap-0.5">
              {getSourceIcon(message.source)}
              {getSourceLabel(message.source)}
            </Badge>
          </div>
        )}

        {/* Message content */}
        <div
          className={cn(
            'rounded-2xl px-3 py-2 relative',
            isOwn
              ? isPending
                ? 'bg-primary/70 text-primary-foreground rounded-br-md'
                : isFailed
                ? 'bg-red-500/20 text-red-900 dark:text-red-100 rounded-br-md border border-red-500/50'
                : 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted rounded-bl-md'
          )}
        >
          {message.contentHtml ? (
            <div
              className="text-sm prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.contentHtml) }}
            />
          ) : (
            <MessageContent
              content={message.content}
              currentUserId={currentUserId}
              mentions={message.mentions}
              showLinkPreviews={!isOwn} // Only show link previews in received messages to save space
            />
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.attachments.map((attachment, idx) => (
                <a
                  key={idx}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs underline"
                >
                  {attachment.filename}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Time, status, and retry */}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-muted-foreground">
            {formatMessageTime(message.createdAt)}
          </span>
          {message.isEdited && (
            <span className="text-[10px] text-muted-foreground">(edited)</span>
          )}
          {isOwn && (
            <DeliveryStatusIcon status={message.deliveryStatus} readBy={message.readBy} />
          )}
          {isFailed && onRetry && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-red-500 hover:text-red-600"
              onClick={onRetry}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="flex gap-2 mb-3">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div>
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-16 w-48 rounded-2xl" />
      </div>
    </div>
  );
}

function TypingIndicator({ userName }: { userName: string }) {
  return (
    <div className="flex gap-2 mb-3">
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-xs">
          {getInitials(userName)}
        </AvatarFallback>
      </Avatar>
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function NewMessagesIndicator({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      size="sm"
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 shadow-lg gap-1.5 animate-bounce"
    >
      <ChevronDown className="h-4 w-4" />
      {count} new {count === 1 ? 'message' : 'messages'}
    </Button>
  );
}

function ConnectionBanner({ isOnline, isConnected }: { isOnline: boolean; isConnected: boolean }) {
  if (isOnline && isConnected) return null;

  return (
    <div className={cn(
      'flex items-center justify-center gap-2 py-1.5 text-xs font-medium',
      !isOnline ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' : 'bg-orange-500/20 text-orange-700 dark:text-orange-300'
    )}>
      {!isOnline ? (
        <>
          <WifiOff className="h-3 w-3" />
          You're offline - messages will be sent when reconnected
        </>
      ) : (
        <>
          <Wifi className="h-3 w-3 animate-pulse" />
          Reconnecting to chat...
        </>
      )}
    </div>
  );
}

export function MessageThread({ conversation, onBack }: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isNearTop, setIsNearTop] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const lastMessageCountRef = useRef(0);
  const previousScrollHeightRef = useRef<number>(0);

  // Get current user ID from localStorage (set during auth)
  const currentUserId = typeof window !== 'undefined'
    ? (() => {
        try {
          const userData = localStorage.getItem('user');
          if (userData) {
            return JSON.parse(userData).id || localStorage.getItem('user_id') || '';
          }
          return localStorage.getItem('user_id') || '';
        } catch {
          return localStorage.getItem('user_id') || '';
        }
      })()
    : '';

  // Hooks - Use infinite query for loading more messages
  const {
    messages,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    isLoadingMore,
  } = useInfiniteTeamMessages(conversation.id);
  const pendingMessages = usePendingMessages(conversation.id);
  const { markAsRead } = useMarkTeamMessagesRead();
  const archiveConversation = useArchiveTeamConversation();
  const { retryAll, isRetrying, pendingCount } = useRetryPendingMessages();
  const { isOnline } = useConnectionStatus();
  const { isUserOnline } = useOnlineUsers();

  // Use ref to track if we've already marked as read for this conversation
  const markedAsReadRef = useRef<string | null>(null);

  // Supabase Realtime for typing indicators and live updates
  const { isConnected } = useSupabaseRealtime({
    conversationId: conversation.id,
    onTypingStart: (userId, userName) => {
      if (userId !== currentUserId) {
        setTypingUsers((prev) => new Map(prev).set(userId, userName));
      }
    },
    onTypingStop: (userId) => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    },
    onNewMessage: () => {
      // If not at bottom, increment new message count
      if (!isAtBottom) {
        setNewMessageCount((prev) => prev + 1);
      }
    },
  });

  // Check scroll position - uses the viewport element inside ScrollArea
  const handleScroll = useCallback((e?: Event) => {
    // Get the scroll target - either from event or find viewport in ref
    let scrollElement: HTMLElement | null = null;

    if (e?.target instanceof HTMLElement) {
      scrollElement = e.target;
    } else if (scrollAreaRef.current) {
      // Find the viewport element inside ScrollArea (Radix UI uses data-radix-scroll-area-viewport)
      scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    }

    if (!scrollElement) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom < 50;
    const nearTop = scrollTop < 100;

    setIsAtBottom(atBottom);
    setIsNearTop(nearTop);

    // Clear new message indicator when scrolled to bottom
    if (atBottom && newMessageCount > 0) {
      setNewMessageCount(0);
    }
  }, [newMessageCount]);

  // Attach scroll handler to the actual viewport element inside ScrollArea
  useEffect(() => {
    if (!scrollAreaRef.current) return;

    // Find the viewport element (Radix UI ScrollArea uses this data attribute)
    const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;

    const scrollHandler = (e: Event) => handleScroll(e);
    viewport.addEventListener('scroll', scrollHandler);

    // Also update scrollAreaRef to point to viewport for other uses
    // Store original ref for cleanup
    const originalRef = scrollAreaRef.current;

    return () => {
      const viewportToRemove = originalRef?.querySelector('[data-radix-scroll-area-viewport]');
      viewportToRemove?.removeEventListener('scroll', scrollHandler);
    };
  }, [handleScroll]);

  // Helper to get the viewport element
  const getViewport = useCallback(() => {
    return scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
  }, []);

  // Load more when scrolled near top (auto-load)
  useEffect(() => {
    if (isNearTop && hasMore && !isLoadingMore) {
      // Save current scroll height to maintain position after loading
      const viewport = getViewport();
      if (viewport) {
        previousScrollHeightRef.current = viewport.scrollHeight;
      }
      loadMore();
    }
  }, [isNearTop, hasMore, isLoadingMore, loadMore, getViewport]);

  // Maintain scroll position after loading older messages
  useEffect(() => {
    const viewport = getViewport();
    if (!isLoadingMore && previousScrollHeightRef.current > 0 && viewport) {
      const newScrollHeight = viewport.scrollHeight;
      const scrollDiff = newScrollHeight - previousScrollHeightRef.current;
      if (scrollDiff > 0) {
        viewport.scrollTop += scrollDiff;
      }
      previousScrollHeightRef.current = 0;
    }
  }, [isLoadingMore, messages, getViewport]);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
      setNewMessageCount(0);
    }
  }, []);

  // Mark messages as read when viewing (only once per conversation)
  useEffect(() => {
    // Set ref IMMEDIATELY before any async operations to prevent race conditions
    const conversationId = conversation.id;
    const unreadCount = conversation.unreadCount ?? 0;

    if (conversationId && unreadCount > 0 && markedAsReadRef.current !== conversationId) {
      // Set ref synchronously BEFORE the async call
      markedAsReadRef.current = conversationId;
      markAsRead(conversationId);
    }
  }, [conversation.id, conversation.unreadCount, markAsRead]);

  // Auto-scroll to bottom on initial load and when at bottom
  useEffect(() => {
    if (messages && messages.length > 0) {
      const messageCount = messages.length;

      // Initial load or if at bottom
      if (lastMessageCountRef.current === 0 || isAtBottom) {
        scrollToBottom(lastMessageCountRef.current > 0);
      }

      lastMessageCountRef.current = messageCount;
    }
  }, [messages, isAtBottom, scrollToBottom]);

  const handleArchive = async () => {
    try {
      await archiveConversation.mutateAsync(conversation.id);
      onBack();
    } catch (error) {
      console.error('Failed to archive conversation:', error);
    }
  };

  const handleRetryMessage = () => {
    retryAll();
  };

  // Combine messages with pending messages
  const allMessages = useMemo(() => {
    const combined = [...(messages || [])];

    // Add pending messages that aren't already in the list
    pendingMessages.forEach((pending) => {
      if (!combined.some((m) => m.id === pending.id)) {
        combined.push({
          id: pending.id,
          conversationId: pending.conversationId,
          senderId: currentUserId,
          senderName: 'You',
          senderType: 'team',
          senderPhone: null,
          senderEmail: null,
          source: 'platform',
          content: pending.content,
          contentHtml: null,
          attachments: pending.attachments || [],
          mentions: [],
          isEdited: false,
          editedAt: null,
          readBy: [],
          deliveryStatus: pending.status === 'failed' ? 'failed' : 'pending',
          externalMessageId: null,
          replyToMessageId: pending.replyToMessageId,
          createdAt: pending.createdAt.toString(),
          updatedAt: pending.createdAt.toString(),
        } as TeamMessage);
      }
    });

    // Sort by creation time
    combined.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return combined;
  }, [messages, pendingMessages, currentUserId]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Connection Banner */}
      <ConnectionBanner isOnline={isOnline} isConnected={isConnected} />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Property image or icon */}
        <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
          {conversation.propertyImage ? (
            <img
              src={conversation.propertyImage}
              alt={conversation.propertyAddress || 'Property'}
              className="h-full w-full object-cover"
            />
          ) : conversation.propertyId ? (
            <Home className="h-4 w-4 text-primary" />
          ) : (
            <MessageSquare className="h-4 w-4 text-primary" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {conversation.title || conversation.propertyAddress || 'General Conversation'}
            </span>
            {conversation.propertyId && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] flex-shrink-0">
                <MapPin className="h-3 w-3 mr-0.5" />
                Property
              </Badge>
            )}
            {/* Connection indicator */}
            <span
              className={cn(
                'h-2 w-2 rounded-full flex-shrink-0',
                isConnected && isOnline ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
              )}
              title={isConnected && isOnline ? 'Connected' : 'Reconnecting...'}
            />
          </div>
          {conversation.propertyAddress && conversation.title !== conversation.propertyAddress && (
            <p className="text-xs text-muted-foreground truncate">
              {conversation.propertyAddress}
            </p>
          )}
        </div>

        {/* View Property Button */}
        {conversation.propertyId && (
          <Button
            variant="ghost"
            size="icon-sm"
            asChild
            title="View Property"
          >
            <a href={`/deals/${conversation.propertyId}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {conversation.propertyId && (
              <DropdownMenuItem asChild>
                <a href={`/deals/${conversation.propertyId}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Property
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Messages
            </DropdownMenuItem>
            {pendingCount > 0 && (
              <DropdownMenuItem onClick={handleRetryMessage} disabled={isRetrying}>
                <RefreshCw className={cn("h-4 w-4 mr-2", isRetrying && "animate-spin")} />
                Retry Failed ({pendingCount})
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleArchive}>
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div className="flex-1 relative overflow-hidden">
        <ScrollArea
          className="h-full p-3"
          ref={scrollAreaRef}
        >
          {isLoading ? (
            <>
              <MessageSkeleton />
              <MessageSkeleton />
              <MessageSkeleton />
            </>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <AlertCircle className="h-12 w-12 text-red-500/50 mb-3" />
              <p className="text-sm text-muted-foreground">Failed to load messages</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          ) : allMessages.length > 0 ? (
            <>
              {/* Load more indicator at top */}
              <div ref={topRef} className="flex justify-center py-2">
                {isLoadingMore ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Loading older messages...
                  </div>
                ) : hasMore ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => loadMore()}
                  >
                    Load older messages
                  </Button>
                ) : allMessages.length > 10 ? (
                  <span className="text-xs text-muted-foreground">
                    Beginning of conversation
                  </span>
                ) : null}
              </div>

              {allMessages.map((message, index) => {
                const messageDate = new Date(message.createdAt);
                const prevMessage = allMessages[index - 1];
                const showDateHeader = !prevMessage || !isSameDay(
                  messageDate,
                  new Date(prevMessage.createdAt)
                );

                return (
                  <div key={message.id}>
                    {showDateHeader && (
                      <DateHeader date={message.createdAt} />
                    )}
                    <MessageBubble
                      message={message}
                      isOwn={message.senderId === currentUserId}
                      currentUserId={currentUserId}
                      onRetry={message.deliveryStatus === 'failed' ? handleRetryMessage : undefined}
                      isSenderOnline={message.senderId ? isUserOnline(message.senderId) : false}
                    />
                  </div>
                );
              })}
              {/* Typing indicators */}
              {Array.from(typingUsers.entries()).map(([userId, userName]) => (
                <TypingIndicator key={userId} userName={userName} />
              ))}
              {/* Bottom anchor */}
              <div ref={bottomRef} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Send a message to start the conversation
              </p>
            </div>
          )}
        </ScrollArea>

        {/* New messages indicator */}
        {newMessageCount > 0 && !isAtBottom && (
          <NewMessagesIndicator count={newMessageCount} onClick={() => scrollToBottom(true)} />
        )}
      </div>

      {/* Input */}
      <MessageInput
        conversationId={conversation.id}
        onMessageSent={() => scrollToBottom(true)}
        disabled={!isOnline}
      />
    </div>
  );
}

export default MessageThread;
