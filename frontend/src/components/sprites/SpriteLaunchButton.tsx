/**
 * SpriteLaunchButton
 *
 * Button to launch, resume, or access a Sprite for a project.
 * Shows status and provides quick actions.
 */

'use client';

import { useState } from 'react';
import { Bot, Play, Square, Terminal, RotateCcw, ChevronDown, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { SpriteLaunchDialog } from './SpriteLaunchDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SpriteStatusBadge, SpriteStatusDot } from './SpriteStatusBadge';
import {
  useSpriteByProject,
  useCreateSprite,
  useResumeSprite,
  useStopSprite,
  useDeleteSprite,
  useSpriteCheckpoints,
  useRestoreCheckpoint,
} from '@/hooks/use-sprites';
import { useSpriteStore } from '@/stores/sprite-store';
import { isSpriteActive, canResumeSprite } from '@/types/sprite';
import type { SpriteCheckpoint } from '@/types/sprite';

interface SpriteLaunchButtonProps {
  projectId: string;
  projectTitle?: string;
  githubUrl?: string | null;
  compact?: boolean;
  className?: string;
}

export function SpriteLaunchButton({
  projectId,
  projectTitle,
  githubUrl,
  compact = false,
  className,
}: SpriteLaunchButtonProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLaunchDialogOpen, setIsLaunchDialogOpen] = useState(false);

  const { data: sprite, isLoading, error: spriteError, isError, isFetching } = useSpriteByProject(projectId);

  // Debug: Log sprite data on every render
  console.log('[SpriteLaunchButton] Render:', {
    projectId,
    sprite,
    isLoading,
    isFetching,
    isError,
    spriteError: spriteError?.message,
    hasId: sprite?.id,
    hasStatus: sprite?.status,
  });

  // Log any errors from the query
  if (spriteError) {
    console.error('[SpriteLaunchButton] Error fetching sprite:', spriteError);
  }
  const { data: checkpoints } = useSpriteCheckpoints(sprite?.id);
  const createSprite = useCreateSprite();
  const resumeSprite = useResumeSprite();
  const stopSprite = useStopSprite();
  const deleteSprite = useDeleteSprite();
  const restoreCheckpoint = useRestoreCheckpoint();

  const openTerminal = useSpriteStore((state) => state.openTerminal);
  const addRecentSession = useSpriteStore((state) => state.addRecentSession);

  // Safely check for sprite with all required properties
  const hasSprite = !!(sprite && sprite.id && sprite.status);
  const isActive = hasSprite ? isSpriteActive(sprite.status) : false;
  const canResume = hasSprite ? canResumeSprite(sprite.status) : false;
  const isInError = hasSprite ? sprite.status === 'error' : false;
  const isTransitioning = hasSprite
    ? ['creating', 'initializing', 'checkpointing', 'restoring'].includes(sprite.status)
    : false;
  const isRestoring = hasSprite ? sprite.status === 'restoring' : false;
  const isCheckpointing = hasSprite ? sprite.status === 'checkpointing' : false;

  const handleLaunch = async () => {
    console.log('[SpriteLaunchButton] handleLaunch called', { hasSprite, isActive, canResume, projectId });
    try {
      if (hasSprite && isActive) {
        // Open terminal for active sprite
        console.log('[SpriteLaunchButton] Opening terminal for active sprite');
        openTerminal(sprite!.id, projectId);
        addRecentSession({
          spriteId: sprite!.id,
          projectId,
          projectTitle: projectTitle || 'Project',
          sessionId: '', // Will be set when terminal connects
        });
      } else if (hasSprite && canResume) {
        // Resume stopped sprite
        console.log('[SpriteLaunchButton] Resuming stopped sprite');
        toast.loading('Resuming coding agent...');
        await resumeSprite.mutateAsync({ id: sprite!.id, projectId });
        toast.dismiss();
        toast.success('Coding agent resumed');
        openTerminal(sprite!.id, projectId);
      } else if (!hasSprite) {
        // Open launch dialog for branch selection
        console.log('[SpriteLaunchButton] Opening launch dialog');
        setIsLaunchDialogOpen(true);
      }
    } catch (error) {
      console.error('[SpriteLaunchButton] Error:', error);
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to launch coding agent');
    }
  };

  const handleStop = async () => {
    if (sprite) {
      await stopSprite.mutateAsync({ id: sprite.id, projectId });
    }
  };

  const handleRestoreCheckpoint = async (checkpoint: SpriteCheckpoint) => {
    if (sprite) {
      await restoreCheckpoint.mutateAsync({
        spriteId: sprite.id,
        projectId,
        checkpointId: checkpoint.id,
      });
      openTerminal(sprite.id, projectId);
    }
    setIsDropdownOpen(false);
  };

  const handleDelete = async () => {
    if (!sprite) return;

    try {
      toast.loading('Deleting coding agent...');
      await deleteSprite.mutateAsync({ id: sprite.id, projectId });
      toast.dismiss();
      toast.success('Coding agent deleted. You can create a new one.');
      setIsDropdownOpen(false);
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to delete coding agent');
    }
  };

  const handleDeleteAndRecreate = async () => {
    if (!sprite) return;

    try {
      toast.loading('Recreating coding agent...');
      await deleteSprite.mutateAsync({ id: sprite.id, projectId });
      const newSprite = await createSprite.mutateAsync({ projectId });
      toast.dismiss();
      toast.success('Coding agent recreated');
      openTerminal(newSprite.id, projectId);
      setIsDropdownOpen(false);
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to recreate coding agent');
    }
  };

  const isLoaded = !isLoading;
  const isPending =
    createSprite.isPending ||
    resumeSprite.isPending ||
    stopSprite.isPending ||
    deleteSprite.isPending ||
    restoreCheckpoint.isPending;

  // Debug logging
  console.log('[SpriteLaunchButton] State:', {
    projectId,
    isLoading,
    isLoaded,
    isPending,
    isTransitioning,
    hasSprite,
    sprite: sprite?.status,
    buttonDisabled: isPending || isTransitioning || !isLoaded
  });

  // Compact button for table rows
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={isInError ? handleDeleteAndRecreate : handleLaunch}
              disabled={isPending || isTransitioning || !isLoaded}
              className={cn(
                'relative h-9 w-9 rounded-xl',
                isInError
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                  : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400',
                className
              )}
            >
              {isPending || isTransitioning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isInError ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <>
                  <Bot className="h-4 w-4" />
                  {hasSprite && (
                    <span className="absolute -right-0.5 -top-0.5">
                      <SpriteStatusDot status={sprite!.status} />
                    </span>
                  )}
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {!hasSprite && 'Launch Coding Agent'}
            {hasSprite && isActive && 'Open Terminal'}
            {hasSprite && canResume && 'Resume Coding Agent'}
            {hasSprite && isInError && 'Recreate Coding Agent (checkpoint lost)'}
            {hasSprite && isRestoring && 'Restoring from checkpoint...'}
            {hasSprite && isCheckpointing && 'Saving checkpoint...'}
            {hasSprite && isTransitioning && !isRestoring && !isCheckpointing && `Status: ${sprite?.status}`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full button with dropdown
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        variant={isActive ? 'default' : isInError ? 'destructive' : 'outline'}
        size="sm"
        onClick={isInError ? handleDeleteAndRecreate : handleLaunch}
        disabled={isPending || isTransitioning || !isLoaded}
        className={cn(
          'gap-2',
          isActive && 'bg-purple-600 hover:bg-purple-700 text-white'
        )}
      >
        {isPending || isTransitioning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isInError ? (
          <AlertTriangle className="h-4 w-4" />
        ) : isActive ? (
          <Terminal className="h-4 w-4" />
        ) : canResume ? (
          <Play className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
        <span>
          {!hasSprite && 'Coding Agent'}
          {hasSprite && isActive && 'Open Terminal'}
          {hasSprite && canResume && 'Resume'}
          {hasSprite && isInError && 'Recreate'}
          {hasSprite && isRestoring && 'Restoring...'}
          {hasSprite && isCheckpointing && 'Saving...'}
          {hasSprite && isTransitioning && !isRestoring && !isCheckpointing && 'Starting...'}
        </span>
        {hasSprite && !isInError && <SpriteStatusDot status={sprite!.status} />}
      </Button>

      {/* Stop button - visible when sprite is running */}
      {hasSprite && isActive && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={stopSprite.isPending}
                className="px-2 border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-400"
              >
                {stopSprite.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop Coding Agent</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {hasSprite && (
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="px-2">
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <SpriteStatusBadge status={sprite!.status} size="sm" />
              {isInError && sprite!.errorMessage && (
                <p className="text-xs text-destructive mt-1">{sprite!.errorMessage}</p>
              )}
            </div>
            <DropdownMenuSeparator />

            {isInError && (
              <>
                <DropdownMenuItem onClick={handleDeleteAndRecreate}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Recreate Coding Agent
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Coding Agent
                </DropdownMenuItem>
              </>
            )}

            {isActive && (
              <DropdownMenuItem onClick={() => openTerminal(sprite!.id, projectId)}>
                <Terminal className="mr-2 h-4 w-4" />
                Open Terminal
              </DropdownMenuItem>
            )}

            {canResume && (
              <DropdownMenuItem
                onClick={() =>
                  resumeSprite.mutate({ id: sprite!.id, projectId })
                }
              >
                <Play className="mr-2 h-4 w-4" />
                Resume Coding Agent
              </DropdownMenuItem>
            )}

            {isActive && (
              <DropdownMenuItem onClick={handleStop}>
                <Square className="mr-2 h-4 w-4" />
                Stop Coding Agent
              </DropdownMenuItem>
            )}

            {checkpoints && checkpoints.length > 0 && !isInError && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Restore from checkpoint
                </div>
                {checkpoints.slice(0, 5).map((checkpoint) => (
                  <DropdownMenuItem
                    key={checkpoint.id}
                    onClick={() => handleRestoreCheckpoint(checkpoint)}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    <span className="flex-1 truncate">
                      {checkpoint.comment || 'Checkpoint'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(checkpoint.createdAt).toLocaleDateString()}
                    </span>
                  </DropdownMenuItem>
                ))}
              </>
            )}

            {!isInError && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Coding Agent
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Launch Dialog for Branch Selection */}
      <SpriteLaunchDialog
        open={isLaunchDialogOpen}
        onOpenChange={setIsLaunchDialogOpen}
        projectId={projectId}
        projectTitle={projectTitle}
        githubUrl={githubUrl ?? null}
      />
    </div>
  );
}
