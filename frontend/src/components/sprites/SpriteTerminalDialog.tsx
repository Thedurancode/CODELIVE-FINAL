/**
 * SpriteTerminalDialog
 *
 * Terminal dialog for viewing and interacting with Sprites.
 * Uses xterm.js with WebSocket connection to Sprites API.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, ExternalLink, Terminal, Bot, Maximize2, Minimize2, Play, GripHorizontal, Download, RotateCw, Globe, PanelRightClose, PanelRightOpen, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useSpriteStore,
  useTerminalOpen,
  useCurrentSpriteId,
  useCurrentProjectId,
} from '@/stores/sprite-store';
import { useSprite, useResumeSprite, useInitializeSprite } from '@/hooks/use-sprites';
import { SpriteStatusBadge } from './SpriteStatusBadge';
import { SpriteTerminal } from './SpriteTerminal';
import { isSpriteActive, canResumeSprite } from '@/types/sprite';

export function SpriteTerminalDialog() {
  const open = useTerminalOpen();
  const spriteId = useCurrentSpriteId();
  const projectId = useCurrentProjectId();
  const closeTerminal = useSpriteStore((state) => state.closeTerminal);

  const [isMaximized, setIsMaximized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewKey, setPreviewKey] = useState(0);
  const dragControls = useDragControls();
  const constraintsRef = useRef(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fetch sprite details with polling during transitions
  const { data: sprite, isLoading, refetch } = useSprite(spriteId);
  const resumeSprite = useResumeSprite();
  const initializeSprite = useInitializeSprite();

  const isActive = sprite ? isSpriteActive(sprite.status) : false;
  const canResume = sprite ? canResumeSprite(sprite.status) : false;
  const isRestoring = sprite?.status === 'restoring' || resumeSprite.isPending;
  const isInitializing = sprite?.status === 'initializing' || initializeSprite.isPending;

  // Poll sprite status during transitions
  useEffect(() => {
    if (!open || !sprite) return;

    const transitionStatuses = ['creating', 'initializing', 'checkpointing', 'restoring'];
    if (transitionStatuses.includes(sprite.status)) {
      console.log('[SpriteTerminalDialog] Polling sprite status during transition:', sprite.status);
      const pollInterval = setInterval(() => {
        refetch();
      }, 2000);

      return () => clearInterval(pollInterval);
    }
  }, [open, sprite?.status, refetch]);

  const handleClose = useCallback(() => {
    closeTerminal();
    setIsMaximized(false);
    setIsConnected(false);
  }, [closeTerminal]);

  const handleOpenExternal = useCallback(() => {
    window.open('https://sprites.dev/dashboard', '_blank');
  }, []);

  const handleResume = useCallback(() => {
    if (spriteId && projectId) {
      resumeSprite.mutate({ id: spriteId, projectId });
    }
  }, [spriteId, projectId, resumeSprite]);

  const handleInitialize = useCallback(async () => {
    if (spriteId && projectId) {
      console.log('[SpriteTerminalDialog] handleInitialize called', { spriteId, projectId });
      toast.loading('Initializing sprite (cloning repo, setting up Claude)...');
      try {
        await initializeSprite.mutateAsync({ id: spriteId, projectId });
        toast.dismiss();
        toast.success('Sprite initialized successfully!');
      } catch (error) {
        toast.dismiss();
        toast.error(error instanceof Error ? error.message : 'Failed to initialize sprite');
        console.error('[SpriteTerminalDialog] Initialize error:', error);
      }
    } else {
      console.warn('[SpriteTerminalDialog] handleInitialize - missing spriteId or projectId', { spriteId, projectId });
    }
  }, [spriteId, projectId, initializeSprite]);

  const handleConnected = useCallback(() => {
    setIsConnected(true);
  }, []);

  const handleDisconnected = useCallback(() => {
    setIsConnected(false);
  }, []);

  // Construct the preview URL with the dev server port
  const getPreviewUrl = useCallback(() => {
    if (!sprite?.urlSettings?.url) return null;
    const port = sprite.devServerPort || 8080;
    try {
      const url = new URL(sprite.urlSettings.url);
      // If the sprites platform uses subdomains for ports, the format might be different
      // For now, assume we can just use the port directly
      url.port = String(port);
      return url.toString();
    } catch {
      // Fallback: just append port to the URL
      const baseUrl = sprite.urlSettings.url.replace(/\/$/, '');
      return `${baseUrl}:${port}`;
    }
  }, [sprite?.urlSettings?.url, sprite?.devServerPort]);

  const previewUrl = getPreviewUrl();

  const handleRefreshPreview = useCallback(() => {
    setPreviewLoading(true);
    setPreviewKey((prev) => prev + 1);
  }, []);

  const handlePreviewLoad = useCallback(() => {
    setPreviewLoading(false);
  }, []);

  // Debug - always log state
  console.log('[SpriteTerminalDialog] Render state:', {
    open,
    spriteId,
    projectId,
    spriteName: sprite?.spriteName,
    spriteStatus: sprite?.status,
    isActive,
    isInitializing,
    canResume,
    isPending: initializeSprite.isPending
  });

  // Don't render if not open
  if (!open) {
    return null;
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Drag constraints container - covers the entire viewport */}
          <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[99]" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            drag={!isMaximized}
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragConstraints={constraintsRef}
            dragElastic={0}
            className={cn(
              'fixed z-[100]',
              isMaximized
                ? 'inset-0'
                : showPreview && previewUrl
                  ? 'bottom-24 right-4 w-[1400px] h-[600px]'
                  : 'bottom-24 right-4 w-[800px] h-[500px]',
              'flex flex-col',
              'bg-zinc-900 border border-zinc-700',
              isMaximized ? 'rounded-none' : 'rounded-xl',
              'shadow-2xl shadow-black/50',
              'overflow-hidden'
            )}
          >
          {/* Header - Draggable */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-zinc-800 border-b border-zinc-700 cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => !isMaximized && dragControls.start(e)}
          >
            <div className="flex items-center gap-3">
              {/* Drag handle indicator */}
              {!isMaximized && (
                <GripHorizontal className="w-4 h-4 text-zinc-500" />
              )}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleClose}
                  className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400"
                  title="Close"
                />
                <button
                  onClick={() => setIsMaximized(false)}
                  className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400"
                  title="Minimize"
                />
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400"
                  title={isMaximized ? 'Restore' : 'Maximize'}
                />
              </div>
              <div className="flex items-center gap-2 ml-2">
                <Bot className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-zinc-200">
                  {sprite?.spriteName || 'Coding Agent Terminal'}
                </span>
                {sprite && <SpriteStatusBadge status={sprite.status} size="sm" />}
                {isConnected && (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Connected
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Initialize button - clone repo and setup Claude */}
              {isActive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8",
                    isInitializing
                      ? "text-yellow-400 hover:text-yellow-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                  onClick={handleInitialize}
                  disabled={isInitializing}
                  title="Initialize: Clone repo and setup Claude"
                >
                  {isInitializing ? (
                    <RotateCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              )}
              {/* Live preview toggle */}
              {previewUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8",
                    showPreview ? "text-green-400 hover:text-green-300" : "text-zinc-400 hover:text-zinc-200"
                  )}
                  onClick={() => setShowPreview(!showPreview)}
                  title={showPreview ? "Hide live preview" : "Show live preview"}
                >
                  {showPreview ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
                onClick={() => setIsMaximized(!isMaximized)}
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
                onClick={handleOpenExternal}
                title="Open Coding Agents Dashboard"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
                onClick={handleClose}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content - Split view with terminal and preview */}
          <div className="flex-1 flex overflow-hidden">
            {/* Terminal Panel */}
            <div className={cn(
              "flex flex-col overflow-hidden",
              showPreview && previewUrl ? "w-1/2 border-r border-zinc-700" : "w-full"
            )}>
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-zinc-400">Loading coding agent...</p>
                </div>
              ) : isActive && spriteId ? (
                /* Active sprite - show terminal */
                <SpriteTerminal
                  spriteId={spriteId}
                  sessionId={sprite?.currentSessionId || undefined}
                  className="flex-1"
                  onConnected={handleConnected}
                  onDisconnected={handleDisconnected}
                />
              ) : (
                /* Inactive sprite - show start prompt */
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-zinc-500/20 to-zinc-600/20 flex items-center justify-center border border-zinc-500/30 mb-6">
                    <Terminal className="w-10 h-10 text-zinc-400" />
                  </div>

                  <h3 className="text-xl font-semibold text-zinc-200 mb-2">
                    Coding Agent is {sprite?.status || 'Stopped'}
                  </h3>

                  <p className="text-sm text-zinc-400 mb-6 max-w-sm">
                    {canResume
                      ? 'Resume the coding agent to access the terminal.'
                      : sprite?.status === 'creating' || sprite?.status === 'initializing'
                      ? 'Coding agent is starting up. Please wait...'
                      : 'Start the coding agent to access the terminal.'}
                  </p>

                  {canResume && (
                    <Button
                      onClick={handleResume}
                      disabled={resumeSprite.isPending}
                      className="gap-2 bg-green-600 hover:bg-green-500 text-white mb-4"
                    >
                      <Play className="h-4 w-4" />
                      {resumeSprite.isPending ? 'Resuming...' : 'Resume Coding Agent'}
                    </Button>
                  )}

                  <div className="text-xs text-zinc-500 mt-4">
                    <p>Or use CLI:</p>
                    <code className="text-green-400 select-all">
                      sprite console -s {sprite?.spriteName}
                    </code>
                  </div>
                </div>
              )}
            </div>

            {/* Live Preview Panel */}
            {showPreview && previewUrl && (
              <div className="w-1/2 flex flex-col bg-zinc-950">
                {/* Preview Header */}
                <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-zinc-300 font-medium">Live Preview</span>
                    {sprite?.devServerStatus === 'running' && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Port {sprite.devServerPort || 8080}
                      </span>
                    )}
                    {sprite?.devServerStatus === 'starting' && (
                      <span className="flex items-center gap-1 text-xs text-yellow-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Starting...
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-zinc-400 hover:text-zinc-200"
                      onClick={handleRefreshPreview}
                      title="Refresh preview"
                    >
                      <RefreshCw className={cn("h-3 w-3", previewLoading && "animate-spin")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-zinc-400 hover:text-zinc-200"
                      onClick={() => window.open(previewUrl, '_blank')}
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Preview Content */}
                <div className="flex-1 relative">
                  {previewLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 z-10">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                        <p className="text-xs text-zinc-500">Loading preview...</p>
                      </div>
                    </div>
                  )}
                  <iframe
                    ref={iframeRef}
                    key={previewKey}
                    src={previewUrl}
                    className="w-full h-full border-0 bg-white"
                    onLoad={handlePreviewLoad}
                    title="Live Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                </div>

                {/* Preview URL bar */}
                <div className="px-3 py-1.5 bg-zinc-800/30 border-t border-zinc-700">
                  <div className="flex items-center gap-2 px-2 py-1 bg-zinc-900/50 rounded text-xs text-zinc-400 truncate">
                    <Globe className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{previewUrl}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-zinc-700 bg-zinc-800/50 text-xs text-zinc-500 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {sprite?.repoUrl && <span className="truncate max-w-xs">{sprite.repoUrl}</span>}
              {previewUrl && (
                <span className="flex items-center gap-1.5 text-green-400/70">
                  <Globe className="h-3 w-3" />
                  <span className="truncate max-w-xs">{previewUrl}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {sprite?.devServerStatus === 'running' && (
                <span className="text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Dev server running
                </span>
              )}
              {sprite?.devServerStatus === 'starting' && (
                <span className="text-yellow-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Starting dev server...
                </span>
              )}
              {isRestoring && (
                <span className="text-blue-400 flex items-center gap-1">
                  <RotateCw className="h-3 w-3 animate-spin" />
                  Resuming coding agent...
                </span>
              )}
              {isInitializing && !isRestoring && (
                <span className="text-yellow-400 flex items-center gap-1">
                  <RotateCw className="h-3 w-3 animate-spin" />
                  Cloning repo & setting up Claude...
                </span>
              )}
            </div>
          </div>
        </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
