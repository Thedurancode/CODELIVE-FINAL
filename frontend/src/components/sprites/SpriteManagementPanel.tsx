/**
 * SpriteManagementPanel
 *
 * Panel for managing sprite sessions and checkpoints.
 * Used within the terminal dialog.
 */

'use client';

import { useState } from 'react';
import {
  Save,
  RotateCcw,
  Clock,
  Terminal as TerminalIcon,
  Trash2,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  useSpriteCheckpoints,
  useSpriteSessions,
  useCreateCheckpoint,
  useRestoreCheckpoint,
  useDeleteSprite,
} from '@/hooks/use-sprites';
import type { SpriteCheckpoint, SpriteSession } from '@/types/sprite';

interface SpriteManagementPanelProps {
  spriteId: string;
  projectId: string;
  onClose?: () => void;
  className?: string;
}

export function SpriteManagementPanel({
  spriteId,
  projectId,
  onClose,
  className,
}: SpriteManagementPanelProps) {
  const [checkpointComment, setCheckpointComment] = useState('');

  const { data: checkpoints, isLoading: loadingCheckpoints } =
    useSpriteCheckpoints(spriteId);
  const { data: sessions, isLoading: loadingSessions } =
    useSpriteSessions(spriteId);
  const createCheckpoint = useCreateCheckpoint();
  const restoreCheckpoint = useRestoreCheckpoint();
  const deleteSprite = useDeleteSprite();

  const handleCreateCheckpoint = async () => {
    await createCheckpoint.mutateAsync({
      spriteId,
      projectId,
      comment: checkpointComment || undefined,
    });
    setCheckpointComment('');
  };

  const handleRestoreCheckpoint = async (checkpoint: SpriteCheckpoint) => {
    await restoreCheckpoint.mutateAsync({
      spriteId,
      projectId,
      checkpointId: checkpoint.id,
    });
  };

  const handleDeleteSprite = async () => {
    await deleteSprite.mutateAsync({ id: spriteId, projectId });
    onClose?.();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className={cn('flex flex-col h-full bg-zinc-900 border-l border-zinc-800', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h3 className="font-semibold text-white">Sprite Management</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Create Checkpoint Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-zinc-400">Save Checkpoint</h4>
            <div className="flex gap-2">
              <Input
                placeholder="Checkpoint description (optional)"
                value={checkpointComment}
                onChange={(e) => setCheckpointComment(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
              <Button
                onClick={handleCreateCheckpoint}
                disabled={createCheckpoint.isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {createCheckpoint.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <Accordion type="multiple" defaultValue={['checkpoints', 'sessions']}>
            {/* Checkpoints Section */}
            <AccordionItem value="checkpoints" className="border-zinc-800">
              <AccordionTrigger className="text-zinc-400 hover:text-white">
                <div className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  <span>Checkpoints ({checkpoints?.length || 0})</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {loadingCheckpoints ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                  </div>
                ) : checkpoints && checkpoints.length > 0 ? (
                  <div className="space-y-2">
                    {checkpoints.map((checkpoint) => (
                      <CheckpointItem
                        key={checkpoint.id}
                        checkpoint={checkpoint}
                        onRestore={() => handleRestoreCheckpoint(checkpoint)}
                        isRestoring={restoreCheckpoint.isPending}
                        formatDate={formatDate}
                        formatRelativeTime={formatRelativeTime}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 py-2">
                    No checkpoints yet. Save a checkpoint to preserve the current state.
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Sessions Section */}
            <AccordionItem value="sessions" className="border-zinc-800">
              <AccordionTrigger className="text-zinc-400 hover:text-white">
                <div className="flex items-center gap-2">
                  <TerminalIcon className="h-4 w-4" />
                  <span>Sessions ({sessions?.length || 0})</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {loadingSessions ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                  </div>
                ) : sessions && sessions.length > 0 ? (
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        formatRelativeTime={formatRelativeTime}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 py-2">No active sessions.</p>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Danger Zone */}
          <div className="pt-4 border-t border-zinc-800">
            <h4 className="text-sm font-medium text-red-400 mb-3">Danger Zone</h4>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full border-red-900 text-red-400 hover:bg-red-950 hover:text-red-300"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Sprite
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Delete Sprite?</AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400">
                    This will permanently delete the sprite and all its checkpoints.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteSprite}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {deleteSprite.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// Checkpoint list item
function CheckpointItem({
  checkpoint,
  onRestore,
  isRestoring,
  formatDate,
  formatRelativeTime,
}: {
  checkpoint: SpriteCheckpoint;
  onRestore: () => void;
  isRestoring: boolean;
  formatDate: (date: string) => string;
  formatRelativeTime: (date: string) => string;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">
          {checkpoint.comment || 'Checkpoint'}
        </p>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Clock className="h-3 w-3" />
          <span title={formatDate(checkpoint.createdAt)}>
            {formatRelativeTime(checkpoint.createdAt)}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRestore}
        disabled={isRestoring}
        className="text-purple-400 hover:text-purple-300 hover:bg-purple-900/20"
      >
        {isRestoring ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RotateCcw className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

// Session list item
function SessionItem({
  session,
  formatRelativeTime,
}: {
  session: SpriteSession;
  formatRelativeTime: (date: string) => string;
}) {
  const statusColor =
    session.status === 'active'
      ? 'bg-green-500'
      : session.status === 'running'
        ? 'bg-blue-500'
        : 'bg-zinc-500';

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
      <span className={cn('h-2 w-2 rounded-full', statusColor)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate font-mono">
          {session.command || 'Shell session'}
        </p>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="capitalize">{session.status}</span>
          <span>-</span>
          <span>{formatRelativeTime(session.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
