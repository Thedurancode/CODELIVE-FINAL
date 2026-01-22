'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, MessageSquare, Settings, Volume2, VolumeX, BellOff, Check, MapPin, MessageSquareOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useTeamConversations, useTeamUnreadCount, useMarkTeamMessagesRead } from '@/hooks/use-team-chat';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { notificationManager } from '@/lib/notifications';
import { formatDistanceToNow } from 'date-fns';
import type { TeamConversation, TeamMessage } from '@/types';

export interface NotificationBellProps {
  onOpenMessenger?: (conversation?: TeamConversation) => void;
}

export function NotificationBell({ onOpenMessenger }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentUserIdRef = useRef<string | null>(null);

  // Fetch conversations and unread count
  const { data: conversations = [] } = useTeamConversations();
  const { data: unreadData } = useTeamUnreadCount();
  const markAsRead = useMarkTeamMessagesRead();

  const totalUnread = unreadData?.count ?? 0;

  // Get conversations with unread messages
  const unreadConversations = conversations.filter(c => (c.unreadCount ?? 0) > 0);

  // Load preferences on mount
  useEffect(() => {
    setSoundEnabled(notificationManager.isSoundEnabled());
    setNotificationsEnabled(notificationManager.isNotificationsEnabled());
    setNotificationPermission(notificationManager.getNotificationPermission());

    // Get current user ID
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        currentUserIdRef.current = user.id;
      } catch {
        // Ignore
      }
    }
  }, []);

  // Handle new message notifications
  const handleNewMessage = useCallback((message: TeamMessage) => {
    // Don't notify for own messages
    if (message.senderId === currentUserIdRef.current) return;

    const isMention = message.mentions?.includes(currentUserIdRef.current || '');

    // Play sound
    if (soundEnabled) {
      notificationManager.playNotificationSound(isMention ? 'mention' : 'message');
    }

    // Show browser notification
    if (notificationsEnabled && !document.hasFocus()) {
      const title = isMention ? `${message.senderName} mentioned you` : `New message from ${message.senderName}`;
      notificationManager.showNotification(title, {
        body: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
        tag: `team-chat-${message.conversationId}`,
        onClick: () => {
          const conv = conversations.find(c => c.id === message.conversationId);
          if (conv && onOpenMessenger) {
            onOpenMessenger(conv);
          }
        },
      });
    }
  }, [soundEnabled, notificationsEnabled, conversations, onOpenMessenger]);

  // Supabase Realtime for real-time updates
  const { isConnected } = useSupabaseRealtime({
    onNewMessage: handleNewMessage,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle handlers
  const handleToggleSound = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled);
    notificationManager.setSoundEnabled(enabled);
    if (enabled) {
      notificationManager.playNotificationSound('message');
    }
  }, []);

  const handleToggleNotifications = useCallback(async (enabled: boolean) => {
    if (enabled && notificationPermission !== 'granted') {
      const granted = await notificationManager.requestNotificationPermission();
      setNotificationPermission(notificationManager.getNotificationPermission());
      setNotificationsEnabled(granted);
    } else {
      setNotificationsEnabled(enabled);
      notificationManager.setNotificationsEnabled(enabled);
    }
  }, [notificationPermission]);

  const handleConversationClick = (conversation: TeamConversation) => {
    // Mark as read
    markAsRead.mutate(conversation.id);
    setIsOpen(false);
    if (onOpenMessenger) {
      onOpenMessenger(conversation);
    }
  };

  const handleMarkAllRead = () => {
    unreadConversations.forEach(conv => {
      markAsRead.mutate(conv.id);
    });
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative text-muted-foreground hover:text-foreground hover:bg-secondary transition-all',
          isOpen && 'bg-secondary text-foreground'
        )}
      >
        <Bell className={cn('h-5 w-5', totalUnread > 0 && 'animate-wiggle')} />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-foreground ring-2 ring-zinc-950">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </Button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-card border border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border bg-card/80 backdrop-blur">
            <h3 className="font-semibold text-foreground text-lg">Notifications</h3>
            <div className="flex items-center gap-1">
              {totalUnread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="text-xs text-accent-400 hover:text-accent-300 hover:bg-secondary h-8"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  'h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary',
                  showSettings && 'bg-secondary text-foreground'
                )}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="px-4 py-3 border-b border bg-secondary/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {soundEnabled ? (
                    <Volume2 className="h-4 w-4 text-accent-400" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm text-foreground">Notification sounds</span>
                </div>
                <Switch
                  checked={soundEnabled}
                  onCheckedChange={handleToggleSound}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {notificationsEnabled ? (
                    <Bell className="h-4 w-4 text-accent-400" />
                  ) : (
                    <BellOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm text-foreground">Desktop notifications</span>
                </div>
                <Switch
                  checked={notificationsEnabled}
                  onCheckedChange={handleToggleNotifications}
                />
              </div>
              {notificationPermission === 'denied' && (
                <p className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1.5 rounded">
                  Notifications blocked by browser. Enable in site settings.
                </p>
              )}
            </div>
          )}

          {/* Notifications List */}
          <ScrollArea className="max-h-[400px]">
            {unreadConversations.length > 0 ? (
              <div className="divide-y divide-border/50">
                {unreadConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => handleConversationClick(conversation)}
                    className="w-full flex items-start gap-3 p-4 hover:bg-secondary/50 transition-colors text-left group"
                  >
                    {/* Property Image or Icon */}
                    <div className={cn(
                      'flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center overflow-hidden',
                      conversation.propertyId ? 'bg-accent-500/20' : 'bg-orange-500/20'
                    )}>
                      {conversation.propertyImage ? (
                        <img
                          src={conversation.propertyImage}
                          alt={conversation.propertyAddress || 'Property'}
                          className="h-full w-full object-cover"
                        />
                      ) : conversation.propertyId ? (
                        <MapPin className="h-5 w-5 text-accent-400" />
                      ) : (
                        <MessageSquareOff className="h-5 w-5 text-orange-400" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-foreground text-sm truncate group-hover:text-accent-300 transition-colors">
                          {conversation.title || conversation.propertyAddress || 'General Chat'}
                        </p>
                        {(conversation.unreadCount ?? 0) > 0 && (
                          <Badge className="bg-accent-500 text-foreground text-[10px] px-1.5 h-5 shrink-0">
                            {conversation.unreadCount}
                          </Badge>
                        )}
                      </div>
                      {conversation.lastMessagePreview && (
                        <p className="text-muted-foreground text-xs truncate mt-0.5">
                          {conversation.lastMessagePreview}
                        </p>
                      )}
                      {conversation.lastMessageAt && (
                        <p className="text-muted-foreground text-[10px] mt-1">
                          {formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <Bell className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">All caught up!</p>
                <p className="text-muted-foreground text-sm mt-1">No new notifications</p>
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <Separator className="bg-secondary" />
          <div className="p-2">
            <Button
              variant="ghost"
              className="w-full justify-center text-accent-400 hover:text-accent-300 hover:bg-secondary text-sm"
              onClick={() => {
                setIsOpen(false);
                if (onOpenMessenger) {
                  onOpenMessenger();
                }
              }}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Open Messenger
            </Button>
          </div>
        </div>
      )}

      {/* Wiggle animation */}
      <style jsx global>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(-12deg); }
          20% { transform: rotate(12deg); }
          30% { transform: rotate(-8deg); }
          40% { transform: rotate(8deg); }
          50% { transform: rotate(0deg); }
        }
        .animate-wiggle {
          animation: wiggle 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}

export default NotificationBell;
