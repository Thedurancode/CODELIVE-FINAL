'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, X, Minimize2, Maximize2, GripVertical, Volume2, VolumeX, Bell, BellOff, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useTeamConversations, useTeamUnreadCount, useTeamConversationByProperty } from '@/hooks/use-team-chat';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { notificationManager } from '@/lib/notifications';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import type { TeamConversation, TeamMessage } from '@/types';

export interface MessengerWidgetProps {
  className?: string;
  defaultOpen?: boolean;
}

// Default position (bottom-right)
const DEFAULT_POSITION = { x: 24, y: 24 };

export function MessengerWidget({ className, defaultOpen = false }: MessengerWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<TeamConversation | null>(null);
  const [pendingPropertyId, setPendingPropertyId] = useState<number | null>(null);

  // Dragging state
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Notification preferences
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Fetch conversations and unread count
  const { data: conversations, isLoading: conversationsLoading } = useTeamConversations();
  const { data: unreadData } = useTeamUnreadCount();

  // Fetch conversation for pending property (when clicking Team Chat from deal page)
  const { data: propertyConversation } = useTeamConversationByProperty(pendingPropertyId);

  // Track current user ID to avoid playing sounds for own messages
  const currentUserIdRef = useRef<string | null>(null);

  // Load notification preferences on mount
  useEffect(() => {
    setSoundEnabled(notificationManager.isSoundEnabled());
    setNotificationsEnabled(notificationManager.isNotificationsEnabled());
    setNotificationPermission(notificationManager.getNotificationPermission());

    // Load saved position
    const savedPosition = localStorage.getItem('messenger_position');
    if (savedPosition) {
      try {
        const pos = JSON.parse(savedPosition);
        setPosition(pos);
      } catch {
        // Use default
      }
    }

    // Get current user ID from localStorage
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
    console.log('New message received:', message.id);

    // Don't play sound/notification for own messages
    if (message.senderId === currentUserIdRef.current) {
      return;
    }

    // Check if this is a mention
    const isMention = message.mentions?.includes(currentUserIdRef.current || '');

    // Play notification sound
    if (soundEnabled) {
      notificationManager.playNotificationSound(isMention ? 'mention' : 'message');
    }

    // Show browser notification if enabled and tab not focused
    if (notificationsEnabled && !document.hasFocus()) {
      const title = isMention ? `${message.senderName} mentioned you` : `New message from ${message.senderName}`;
      notificationManager.showNotification(title, {
        body: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
        tag: `team-chat-${message.conversationId}`,
        onClick: () => {
          // Open the conversation when clicking notification
          if (conversations) {
            const conv = conversations.find(c => c.id === message.conversationId);
            if (conv) {
              setSelectedConversation(conv);
              setIsOpen(true);
              setIsMinimized(false);
            }
          }
        },
      });
    }
  }, [soundEnabled, notificationsEnabled, conversations]);

  // Supabase Realtime connection for real-time updates
  const { isConnected } = useSupabaseRealtime({
    onNewMessage: handleNewMessage,
    onUnreadCountUpdate: (count: number) => {
      console.log('Unread count updated:', count);
    },
  });

  const totalUnread = unreadData?.count ?? 0;

  // Toggle handlers
  const handleToggle = useCallback(() => {
    if (isMinimized) {
      setIsMinimized(false);
    } else {
      setIsOpen(!isOpen);
    }
  }, [isOpen, isMinimized]);

  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const handleMaximize = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(false);
    setSelectedConversation(null);
  }, []);

  const handleSelectConversation = useCallback((conversation: TeamConversation) => {
    setSelectedConversation(conversation);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedConversation(null);
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragStartRef.current) return;

    const deltaX = dragStartRef.current.x - e.clientX;
    const deltaY = dragStartRef.current.y - e.clientY;

    // Calculate new position (from bottom-right)
    const newX = Math.max(0, dragStartRef.current.posX + deltaX);
    const newY = Math.max(0, dragStartRef.current.posY + deltaY);

    // Constrain to viewport
    const maxX = window.innerWidth - 100;
    const maxY = window.innerHeight - 100;

    setPosition({
      x: Math.min(newX, maxX),
      y: Math.min(newY, maxY),
    });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;

      // Save position to localStorage
      localStorage.setItem('messenger_position', JSON.stringify(position));
    }
  }, [isDragging, position]);

  // Reset position handler
  const handleResetPosition = useCallback(() => {
    setPosition(DEFAULT_POSITION);
    localStorage.removeItem('messenger_position');
  }, []);

  // Attach drag listeners to document
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Notification permission request
  const handleRequestNotificationPermission = useCallback(async () => {
    const granted = await notificationManager.requestNotificationPermission();
    setNotificationPermission(notificationManager.getNotificationPermission());
    setNotificationsEnabled(granted);
  }, []);

  // Toggle sound
  const handleToggleSound = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled);
    notificationManager.setSoundEnabled(enabled);
    // Play a test sound when enabling
    if (enabled) {
      notificationManager.playNotificationSound('message');
    }
  }, []);

  // Toggle notifications
  const handleToggleNotifications = useCallback((enabled: boolean) => {
    if (enabled && notificationPermission !== 'granted') {
      handleRequestNotificationPermission();
    } else {
      setNotificationsEnabled(enabled);
      notificationManager.setNotificationsEnabled(enabled);
    }
  }, [notificationPermission, handleRequestNotificationPermission]);

  // Listen for custom event to open messenger for a property
  useEffect(() => {
    const handleOpenForProperty = (e: CustomEvent<{ propertyId: number; conversationId?: string }>) => {
      const { propertyId, conversationId } = e.detail;

      // If we already have the conversation, open it directly
      if (conversationId && conversations) {
        const conv = conversations.find(c => c.id === conversationId);
        if (conv) {
          setSelectedConversation(conv);
          setIsOpen(true);
          setIsMinimized(false);
          return;
        }
      }

      // Otherwise, set pending property ID to fetch the conversation
      setPendingPropertyId(propertyId);
      setIsOpen(true);
      setIsMinimized(false);
    };

    window.addEventListener('openMessengerForProperty', handleOpenForProperty as EventListener);
    return () => window.removeEventListener('openMessengerForProperty', handleOpenForProperty as EventListener);
  }, [conversations]);

  // Listen for open messenger widget event (from NotificationBell)
  useEffect(() => {
    const handleOpenWidget = (e: CustomEvent<{ conversation?: TeamConversation }>) => {
      const { conversation } = e.detail;

      if (conversation) {
        setSelectedConversation(conversation);
      }

      setIsOpen(true);
      setIsMinimized(false);
    };

    window.addEventListener('openMessengerWidget', handleOpenWidget as EventListener);
    return () => window.removeEventListener('openMessengerWidget', handleOpenWidget as EventListener);
  }, []);

  // When property conversation loads, select it
  useEffect(() => {
    if (propertyConversation && pendingPropertyId) {
      setSelectedConversation(propertyConversation);
      setPendingPropertyId(null);
    }
  }, [propertyConversation, pendingPropertyId]);

  // Keyboard shortcut: Ctrl/Cmd + Shift + M to toggle messenger
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'm') {
        e.preventDefault();
        handleToggle();
      }
      // Escape to close when open
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggle, handleClose, isOpen]);

  return (
    <div
      ref={containerRef}
      className={cn('fixed z-50', className)}
      style={{
        right: `${position.x}px`,
        bottom: `${position.y}px`,
      }}
    >
      {/* Floating Action Button */}
      {!isOpen && (
        <Button
          onClick={handleToggle}
          size="icon-lg"
          className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        >
          <MessageSquare className="h-6 w-6" />
          {totalUnread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs"
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </Badge>
          )}
        </Button>
      )}

      {/* Messenger Panel */}
      {isOpen && (
        <div
          className={cn(
            'bg-background border rounded-lg shadow-2xl flex flex-col transition-all duration-200',
            isMinimized
              ? 'w-80 h-12'
              : 'w-[28rem] h-[38rem] lg:w-[32rem] lg:h-[42rem]',
            isDragging && 'cursor-grabbing'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50 rounded-t-lg">
            {/* Drag Handle */}
            <div
              onMouseDown={handleDragStart}
              className="flex items-center gap-2 cursor-grab active:cursor-grabbing select-none"
              title="Drag to move"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <MessageSquare className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">
                {selectedConversation ? 'Messages' : 'Team Chat'}
              </span>
              {/* Connection Status */}
              <span
                className={`h-2 w-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
                }`}
                title={isConnected ? 'Connected' : 'Connecting...'}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {/* Settings Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Notification Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="end">
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Notification Settings</h4>

                    {/* Sound Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {soundEnabled ? (
                          <Volume2 className="h-4 w-4 text-primary" />
                        ) : (
                          <VolumeX className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm">Sound</span>
                      </div>
                      <Switch
                        checked={soundEnabled}
                        onCheckedChange={handleToggleSound}
                      />
                    </div>

                    {/* Desktop Notifications Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {notificationsEnabled ? (
                          <Bell className="h-4 w-4 text-primary" />
                        ) : (
                          <BellOff className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm">Desktop Notifications</span>
                      </div>
                      <Switch
                        checked={notificationsEnabled}
                        onCheckedChange={handleToggleNotifications}
                      />
                    </div>

                    {notificationPermission === 'denied' && (
                      <p className="text-xs text-muted-foreground">
                        Notifications blocked. Enable in browser settings.
                      </p>
                    )}

                    {/* Reset Position */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleResetPosition}
                    >
                      Reset Position
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={isMinimized ? handleMaximize : handleMinimize}
                title={isMinimized ? 'Maximize' : 'Minimize'}
              >
                {isMinimized ? (
                  <Maximize2 className="h-4 w-4" />
                ) : (
                  <Minimize2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleClose}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          {!isMinimized && (
            <div className="flex-1 overflow-hidden">
              {selectedConversation ? (
                <MessageThread
                  conversation={selectedConversation}
                  onBack={handleBackToList}
                />
              ) : (
                <ConversationList
                  conversations={conversations || []}
                  isLoading={conversationsLoading}
                  onSelectConversation={handleSelectConversation}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MessengerWidget;
