/**
 * User Presence Hook
 *
 * Tracks online/offline status of users in real-time.
 * Listens for presence updates via WebSocket.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useWebSocket } from './use-websocket';

// ============================================================================
// TYPES
// ============================================================================

export interface UserPresence {
  id: string;
  name: string;
  avatar?: string;
  isOnline: boolean;
  onlineStatus: 'online' | 'away' | 'offline';
  lastSeenAt?: string;
  lastActiveAt?: string;
}

export interface PresenceUpdateEvent {
  type: 'presence_update';
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeenAt?: string;
  user?: {
    id: string;
    name: string;
    avatar?: string;
  };
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to track online users
 * Returns a map of userId -> presence info
 */
export function useOnlineUsers() {
  const queryClient = useQueryClient();
  const [presenceMap, setPresenceMap] = useState<Map<string, UserPresence>>(new Map());

  // Fetch initial list of online users
  const { data: onlineUsers, isLoading } = useQuery({
    queryKey: ['online-users'],
    queryFn: async () => {
      try {
        const response = await api.get<{ data: UserPresence[] }>('/api/team-chat/online');
        return response.data || [];
      } catch {
        return [];
      }
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute as backup
  });

  // Initialize presence map from query
  useEffect(() => {
    if (onlineUsers) {
      const map = new Map<string, UserPresence>();
      onlineUsers.forEach((user) => {
        map.set(user.id, {
          ...user,
          isOnline: user.onlineStatus === 'online',
        });
      });
      setPresenceMap(map);
    }
  }, [onlineUsers]);

  // Listen for real-time presence updates via WebSocket
  const { lastMessage } = useWebSocket();

  useEffect(() => {
    if (lastMessage?.type === 'presence_update') {
      const event = lastMessage as PresenceUpdateEvent;

      setPresenceMap((prev) => {
        const newMap = new Map(prev);

        if (event.status === 'offline') {
          // Update to offline
          const existing = newMap.get(event.userId);
          if (existing) {
            newMap.set(event.userId, {
              ...existing,
              isOnline: false,
              onlineStatus: 'offline',
              lastSeenAt: event.lastSeenAt,
            });
          }
        } else {
          // User came online
          if (event.user) {
            newMap.set(event.userId, {
              id: event.user.id,
              name: event.user.name,
              avatar: event.user.avatar,
              isOnline: true,
              onlineStatus: event.status,
              lastSeenAt: event.lastSeenAt,
            });
          }
        }

        return newMap;
      });

      // Note: We don't invalidate the query here since we're already
      // updating local state via WebSocket. The API query is only
      // used for initial load and periodic backup (every 60s).
    }
  }, [lastMessage]);

  // Helper to check if a specific user is online
  const isUserOnline = useCallback(
    (userId: string): boolean => {
      const presence = presenceMap.get(userId);
      return presence?.isOnline ?? false;
    },
    [presenceMap]
  );

  // Get presence info for a specific user
  const getUserPresence = useCallback(
    (userId: string): UserPresence | undefined => {
      return presenceMap.get(userId);
    },
    [presenceMap]
  );

  // Get all online user IDs
  const onlineUserIds = useMemo(() => {
    return Array.from(presenceMap.entries())
      .filter(([, presence]) => presence.isOnline)
      .map(([id]) => id);
  }, [presenceMap]);

  return {
    presenceMap,
    onlineUserIds,
    onlineCount: onlineUserIds.length,
    isLoading,
    isUserOnline,
    getUserPresence,
  };
}

/**
 * Hook to track presence of specific users (e.g., conversation participants)
 */
export function useParticipantPresence(participantIds: string[]) {
  const { presenceMap, isUserOnline, getUserPresence } = useOnlineUsers();

  const participantPresence = useMemo(() => {
    return participantIds.map((id) => ({
      id,
      presence: getUserPresence(id),
      isOnline: isUserOnline(id),
    }));
  }, [participantIds, getUserPresence, isUserOnline]);

  const onlineParticipants = useMemo(() => {
    return participantPresence.filter((p) => p.isOnline);
  }, [participantPresence]);

  return {
    participantPresence,
    onlineParticipants,
    onlineCount: onlineParticipants.length,
    totalCount: participantIds.length,
  };
}

/**
 * Format "last seen" time in a human-readable way
 */
export function formatLastSeen(lastSeenAt?: string): string {
  if (!lastSeenAt) return 'Never';

  const date = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default useOnlineUsers;
