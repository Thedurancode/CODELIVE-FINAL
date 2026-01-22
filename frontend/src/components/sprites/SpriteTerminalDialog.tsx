/**
 * SpriteTerminalDialog
 *
 * Full-screen terminal dialog for Sprite interaction.
 * Includes terminal, status bar, and management panel.
 */

'use client';

import { useState, useCallback } from 'react';
import {
  X,
  Minimize2,
  Maximize2,
  Settings2,
  Save,
  Square,
  Play,
  Loader2,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SpriteTerminal } from './SpriteTerminal';
import { SpriteManagementPanel } from './SpriteManagementPanel';
import { SpriteStatusBadge } from './SpriteStatusBadge';
import { useSpriteStore, useTerminalOpen, useCurrentSpriteId, useCurrentProjectId } from '@/stores/sprite-store';
import {
  useSprite,
  useStopSprite,
  useResumeSprite,
  useCreateCheckpoint,
} from '@/hooks/use-sprites';
import { isSpriteActive, canResumeSprite } from '@/types/sprite';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

export function SpriteTerminalDialog() {
  const [showPanel, setShowPanel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [checkpointName, setCheckpointName] = useState('');
  const [showCheckpointInput, setShowCheckpointInput] = useState(false);

  const open = useTerminalOpen();
  const spriteId = useCurrentSpriteId();
  const projectId = useCurrentProjectId();
  const closeTerminal = useSpriteStore((state) => state.closeTerminal);

  const { data: sprite, isLoading } = useSprite(spriteId);
  const stopSprite = useStopSprite();
  const resumeSprite = useResumeSprite();
  const createCheckpoint = useCreateCheckpoint();

  const isActive = sprite ? isSpriteActive(sprite.status) : false;
  const canResume = sprite ? canResumeSprite(sprite.status) : false;

  const handleClose = useCallback(() => {
    closeTerminal();
    setShowPanel(false);
    setShowCheckpointInput(false);
    setCheckpointName('');
  }, [closeTerminal]);

  const handleStop = useCallback(async () => {
    if (sprite && projectId) {
      await stopSprite.mutateAsync({ id: sprite.id, projectId });
    }
  }, [sprite, projectId, stopSprite]);

  const handleResume = useCallback(async () => {
    if (sprite && projectId) {
      await resumeSprite.mutateAsync({ id: sprite.id, projectId });
    }
  }, [sprite, projectId, resumeSprite]);

  const handleCreateCheckpoint = useCallback(async () => {
    if (sprite && projectId) {
      await createCheckpoint.mutateAsync({
        spriteId: sprite.id,
        projectId,
        comment: checkpointName || undefined,
      });
      setCheckpointName('');
      setShowCheckpointInput(false);
    }
  }, [sprite, projectId, checkpointName, createCheckpoint]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  if (!open || !spriteId || !projectId) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        className={cn(
          'p-0 gap-0 border-zinc-800 bg-zinc-950 overflow-hidden',
          isFullscreen
            ? 'max-w-[100vw] w-[100vw] h-[100vh] max-h-[100vh] rounded-none'
            : 'max-w-5xl w-[90vw] h-[80vh]'
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>Sprite Terminal</DialogTitle>
        </VisuallyHidden>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-purple-500" />
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">
                {sprite?.spriteName || 'Claude Sprite'}
              </span>
              {sprite && <SpriteStatusBadge status={sprite.status} size="sm" />}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Checkpoint quick save */}
            {isActive && !showCheckpointInput && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCheckpointInput(true)}
                      disabled={createCheckpoint.isPending}
                      className="text-zinc-400 hover:text-white"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save Checkpoint</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Checkpoint input */}
            {showCheckpointInput && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Checkpoint name"
                  value={checkpointName}
                  onChange={(e) => setCheckpointName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCheckpoint()}
                  className="w-48 h-8 bg-zinc-800 border-zinc-700 text-white text-sm"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleCreateCheckpoint}
                  disabled={createCheckpoint.isPending}
                  className="h-8 bg-purple-600 hover:bg-purple-700"
                >
                  {createCheckpoint.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCheckpointInput(false);
                    setCheckpointName('');
                  }}
                  className="h-8 text-zinc-400"
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Stop/Resume button */}
            {isActive && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleStop}
                      disabled={stopSprite.isPending}
                      className="text-zinc-400 hover:text-red-400"
                    >
                      {stopSprite.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Stop Sprite</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {canResume && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResume}
                      disabled={resumeSprite.isPending}
                      className="text-zinc-400 hover:text-green-400"
                    >
                      {resumeSprite.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Resume Sprite</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Management panel toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPanel(!showPanel)}
                    className={cn(
                      'text-zinc-400',
                      showPanel && 'text-purple-400 bg-purple-900/20'
                    )}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showPanel ? 'Hide Panel' : 'Show Panel'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Fullscreen toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="text-zinc-400 hover:text-white"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Close button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="text-zinc-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 min-h-0">
          {/* Terminal */}
          <div className={cn('flex-1 min-w-0', showPanel && 'border-r border-zinc-800')}>
            {isLoading ? (
              <div className="flex items-center justify-center h-full bg-zinc-900">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              </div>
            ) : (
              <SpriteTerminal
                spriteId={spriteId}
                className="h-full"
              />
            )}
          </div>

          {/* Management panel */}
          {showPanel && sprite && (
            <SpriteManagementPanel
              spriteId={sprite.id}
              projectId={projectId}
              onClose={() => setShowPanel(false)}
              className="w-80"
            />
          )}
        </div>

        {/* Footer status bar */}
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-zinc-800 bg-zinc-900 text-xs text-zinc-500">
          <div className="flex items-center gap-4">
            {sprite?.repoUrl && (
              <span className="truncate max-w-md">{sprite.repoUrl}</span>
            )}
            {sprite?.branch && <span>Branch: {sprite.branch}</span>}
          </div>
          <div className="flex items-center gap-4">
            {sprite?.checkpointCount !== undefined && (
              <span>{sprite.checkpointCount} checkpoint(s)</span>
            )}
            {sprite?.lastCheckpointAt && (
              <span>
                Last saved: {new Date(sprite.lastCheckpointAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
