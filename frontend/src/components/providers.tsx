'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useState, createContext, useContext, useEffect, useCallback, ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { useWebSocket, WebSocketMessage } from '@/hooks/use-websocket';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';

// ============================================================================
// NOTIFICATION CONTEXT
// ============================================================================

interface NotificationContextValue {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  messages: WebSocketMessage[];
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  clearMessages: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

// Notification handler component that has access to queryClient
function NotificationHandler({
  children,
  wsState
}: {
  children: ReactNode;
  wsState: ReturnType<typeof useWebSocket>;
}) {
  const queryClient = useQueryClient();
  const { lastMessage } = wsState;

  // Handle incoming messages and invalidate queries
  useEffect(() => {
    if (!lastMessage) return;

    const { type, title, message, priority, data } = lastMessage;

    // Show toast notification for important messages
    if (title && message) {
      const toastOptions = {
        description: message,
        duration: priority === 'urgent' ? 10000 : priority === 'high' ? 7000 : 5000,
      };

      switch (priority) {
        case 'urgent':
          toast.error(title, toastOptions);
          break;
        case 'high':
          toast.warning(title, toastOptions);
          break;
        default:
          toast.info(title, toastOptions);
      }
    }

    // Invalidate relevant queries based on message type
    switch (type) {
      case 'pipeline_update':
        queryClient.invalidateQueries({ queryKey: ['pipeline'] });
        break;
      case 'deal_match':
      case 'new_deal':
        queryClient.invalidateQueries({ queryKey: ['properties'] });
        queryClient.invalidateQueries({ queryKey: ['marketplace'] });
        break;
      case 'offer_received':
      case 'offer_status':
        queryClient.invalidateQueries({ queryKey: ['offers'] });
        queryClient.invalidateQueries({ queryKey: ['pipeline'] });
        break;
      case 'price_drop':
        queryClient.invalidateQueries({ queryKey: ['properties'] });
        break;
      case 'dead_letter':
        queryClient.invalidateQueries({ queryKey: ['dead-letters'] });
        break;
      default:
        // Unknown type - no automatic invalidation
        break;
    }
  }, [lastMessage, queryClient]);

  return <>{children}</>;
}

function NotificationProvider({ children }: { children: ReactNode }) {
  const wsState = useWebSocket({
    autoConnect: true,
    reconnectAttempts: 10,
    reconnectInterval: 2000,
    onConnect: () => {
      console.log('🔌 Real-time notifications connected');
    },
    onDisconnect: () => {
      console.log('🔌 Real-time notifications disconnected');
    },
  });

  const contextValue: NotificationContextValue = {
    isConnected: wsState.isConnected,
    lastMessage: wsState.lastMessage,
    messages: wsState.messages,
    connectionState: wsState.connectionState,
    subscribe: wsState.subscribe,
    unsubscribe: wsState.unsubscribe,
    clearMessages: wsState.clearMessages,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      <NotificationHandler wsState={wsState}>
        {children}
      </NotificationHandler>
    </NotificationContext.Provider>
  );
}

// ============================================================================
// MAIN PROVIDERS
// ============================================================================

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={0}>
          <NotificationProvider>
            {children}
          </NotificationProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              className: 'bg-card text-foreground border',
            }}
          />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
