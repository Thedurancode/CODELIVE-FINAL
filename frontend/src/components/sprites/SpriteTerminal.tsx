/**
 * SpriteTerminal
 *
 * xterm.js terminal component for Sprite interaction.
 * Handles terminal rendering, input/output, and WebSocket connection.
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSpriteWebSocket } from '@/hooks/use-sprite-websocket';
import { useSpriteStore, useTerminalDimensions } from '@/stores/sprite-store';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { WebLinksAddon } from '@xterm/addon-web-links';

// Import xterm CSS at module level for Next.js
import '@xterm/xterm/css/xterm.css';

interface SpriteTerminalProps {
  spriteId: string;
  sessionId?: string;
  className?: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
}

export function SpriteTerminal({
  spriteId,
  sessionId,
  className,
  onConnected,
  onDisconnected,
  onError,
}: SpriteTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { cols: terminalCols, rows: terminalRows } = useTerminalDimensions();
  const setTerminalDimensions = useSpriteStore((state) => state.setTerminalDimensions);

  // Handle terminal output
  const handleOutput = useCallback((data: string) => {
    if (terminalRef.current) {
      terminalRef.current.write(data);
    }
  }, []);

  // Handle connection errors
  const handleError = useCallback(
    (error: string) => {
      setLoadError(error);
      onError?.(error);
    },
    [onError]
  );

  // Handle status changes
  const handleStatusChange = useCallback(
    (status: 'disconnected' | 'connecting' | 'connected' | 'error') => {
      if (status === 'connected') {
        setLoadError(null);
        onConnected?.();
      } else if (status === 'disconnected') {
        onDisconnected?.();
      }
    },
    [onConnected, onDisconnected]
  );

  // WebSocket connection
  const { status, connect, disconnect, send, resize, isConnected, error } =
    useSpriteWebSocket({
      spriteId,
      sessionId,
      cols: terminalCols,
      rows: terminalRows,
      onOutput: handleOutput,
      onError: handleError,
      onStatusChange: handleStatusChange,
      autoConnect: false, // We'll connect after terminal is ready
    });

  // Initialize xterm
  useEffect(() => {
    let mounted = true;

    const initTerminal = async () => {
      console.log('[SpriteTerminal] Starting initialization, container:', !!containerRef.current);

      if (!containerRef.current) {
        console.warn('[SpriteTerminal] Container ref not available yet');
        return;
      }

      try {
        setIsLoading(true);
        setLoadError(null);

        console.log('[SpriteTerminal] Loading xterm modules...');
        // Dynamic import xterm and addons (CSS imported at module level)
        const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/addon-web-links'),
        ]);
        console.log('[SpriteTerminal] xterm modules loaded');

        if (!mounted || !containerRef.current) {
          console.log('[SpriteTerminal] Component unmounted or container lost');
          return;
        }

        // Create terminal instance
        const terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: 'block',
          fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
          fontSize: 14,
          lineHeight: 1.2,
          theme: {
            background: '#18181b', // zinc-900
            foreground: '#fafafa', // zinc-50
            cursor: '#a855f7', // purple-500
            cursorAccent: '#18181b',
            selectionBackground: '#7c3aed50', // purple-600 with opacity
            black: '#27272a',
            red: '#ef4444',
            green: '#22c55e',
            yellow: '#eab308',
            blue: '#3b82f6',
            magenta: '#a855f7',
            cyan: '#06b6d4',
            white: '#fafafa',
            brightBlack: '#52525b',
            brightRed: '#f87171',
            brightGreen: '#4ade80',
            brightYellow: '#facc15',
            brightBlue: '#60a5fa',
            brightMagenta: '#c084fc',
            brightCyan: '#22d3ee',
            brightWhite: '#ffffff',
          },
          allowProposedApi: true,
        });

        // Initialize addons
        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);

        // Open terminal in container
        terminal.open(containerRef.current);

        // Fit terminal to container
        fitAddon.fit();

        // Store refs
        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;

        // Handle input
        terminal.onData((data) => {
          send(data);
        });

        // Handle resize
        terminal.onResize(({ cols, rows }) => {
          setTerminalDimensions(cols, rows);
          resize(cols, rows);
        });

        // Update dimensions
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          setTerminalDimensions(dims.cols, dims.rows);
        }

        console.log('[SpriteTerminal] Terminal initialized, dimensions:', dims);
        setIsLoading(false);

        // Connect to WebSocket
        console.log('[SpriteTerminal] Connecting to WebSocket...');
        connect();
      } catch (err) {
        console.error('[SpriteTerminal] Initialization error:', err);
        if (mounted) {
          setLoadError((err as Error).message);
          setIsLoading(false);
        }
      }
    };

    initTerminal();

    return () => {
      mounted = false;
      disconnect();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [spriteId, sessionId]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isLoading]);

  // Handle reconnect
  const handleReconnect = useCallback(() => {
    setLoadError(null);
    connect();
  }, [connect]);

  // Clear terminal
  const clearTerminal = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  // Focus terminal
  const focusTerminal = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  // Always render the container so xterm can attach to it
  // Overlay loading/error states on top
  return (
    <div className={cn('relative', className)}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-20">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500 mx-auto" />
            <p className="text-zinc-400">Loading terminal...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {(loadError || error) && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-20">
          <div className="text-center space-y-4 max-w-md px-4">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
            <p className="text-red-400">{loadError || error}</p>
            <Button onClick={handleReconnect} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry Connection
            </Button>
          </div>
        </div>
      )}

      {/* Connection status indicator */}
      {status === 'connecting' && !isLoading && !loadError && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10">
          <div className="text-center space-y-3">
            <Loader2 className="h-6 w-6 animate-spin text-purple-500 mx-auto" />
            <p className="text-zinc-400 text-sm">Connecting...</p>
          </div>
        </div>
      )}

      {/* Terminal container - always rendered so xterm can attach */}
      <div
        ref={containerRef}
        className="h-full w-full bg-zinc-900"
        onClick={focusTerminal}
      />
    </div>
  );
}

// Export helper functions
export function useSpriteTerminalControls() {
  const terminalRef = useRef<{
    clear: () => void;
    focus: () => void;
  } | null>(null);

  return {
    terminalRef,
    clear: () => terminalRef.current?.clear(),
    focus: () => terminalRef.current?.focus(),
  };
}
