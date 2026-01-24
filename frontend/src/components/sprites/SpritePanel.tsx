/**
 * SpritePanel
 *
 * Panel showing sprite status and controls for a project.
 * Displays running status, start/stop controls, public URL, and preview link.
 */

'use client';

import { useState } from 'react';
import {
  Bot,
  Play,
  Square,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Lock,
  Download,
  RotateCw,
  Loader2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SpriteStatusBadge } from './SpriteStatusBadge';
import {
  useSpriteByProject,
  useCreateSprite,
  useResumeSprite,
  useStopSprite,
  useDeleteSprite,
  useInitializeSprite,
} from '@/hooks/use-sprites';
import { useSpriteStore } from '@/stores/sprite-store';
import { isSpriteActive, canResumeSprite } from '@/types/sprite';
import { api } from '@/lib/api';

interface SpritePanelProps {
  projectId: string;
  projectTitle?: string;
  className?: string;
}

export function SpritePanel({ projectId, projectTitle, className }: SpritePanelProps) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [isUpdatingAuth, setIsUpdatingAuth] = useState(false);

  const { data: sprite, isLoading, refetch } = useSpriteByProject(projectId);
  const createSprite = useCreateSprite();
  const resumeSprite = useResumeSprite();
  const stopSprite = useStopSprite();
  const deleteSprite = useDeleteSprite();
  const initializeSprite = useInitializeSprite();

  const openTerminal = useSpriteStore((state) => state.openTerminal);
  const addRecentSession = useSpriteStore((state) => state.addRecentSession);

  const hasSprite = !!(sprite && sprite.id && sprite.status);
  const isActive = hasSprite ? isSpriteActive(sprite.status) : false;
  const canResume = hasSprite ? canResumeSprite(sprite.status) : false;
  const isInError = hasSprite ? sprite.status === 'error' : false;
  const isTransitioning = hasSprite
    ? ['creating', 'initializing', 'checkpointing', 'restoring'].includes(sprite.status)
    : false;
  const isInitializing = hasSprite && sprite.status === 'initializing' || initializeSprite.isPending;

  const isPending =
    createSprite.isPending ||
    resumeSprite.isPending ||
    stopSprite.isPending ||
    deleteSprite.isPending ||
    initializeSprite.isPending;

  // Get the sprite public URL
  const spriteUrl = sprite?.urlSettings?.url;
  const isPublic = sprite?.urlSettings?.auth === 'public';

  const handleCreate = async () => {
    try {
      toast.loading('Creating coding agent...');
      const newSprite = await createSprite.mutateAsync({ projectId });
      toast.dismiss();
      toast.success('Coding agent created');
      openTerminal(newSprite.id, projectId);
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to create coding agent');
    }
  };

  const handleResume = async () => {
    if (!sprite) return;
    try {
      toast.loading('Resuming coding agent...');
      await resumeSprite.mutateAsync({ id: sprite.id, projectId });
      toast.dismiss();
      toast.success('Coding agent resumed');
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to resume coding agent');
    }
  };

  const handleStop = async () => {
    if (!sprite) return;
    try {
      toast.loading('Stopping coding agent...');
      await stopSprite.mutateAsync({ id: sprite.id, projectId });
      toast.dismiss();
      toast.success('Coding agent stopped');
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to stop coding agent');
    }
  };

  const handleOpenTerminal = () => {
    if (sprite) {
      openTerminal(sprite.id, projectId);
      addRecentSession({
        spriteId: sprite.id,
        projectId,
        projectTitle: projectTitle || 'Project',
        sessionId: '',
      });
    }
  };

  const handleInitialize = async () => {
    if (!sprite) return;
    try {
      toast.loading('Initializing coding agent (cloning repo)...');
      await initializeSprite.mutateAsync({ id: sprite.id, projectId });
      toast.dismiss();
      toast.success('Coding agent initialized');
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to initialize coding agent');
    }
  };

  const handleDelete = async () => {
    if (!sprite) return;
    if (!confirm('Are you sure you want to delete this coding agent? This action cannot be undone.')) return;
    try {
      toast.loading('Deleting coding agent...');
      await deleteSprite.mutateAsync({ id: sprite.id, projectId });
      toast.dismiss();
      toast.success('Coding agent deleted');
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to delete coding agent');
    }
  };

  const handleCopyUrl = () => {
    if (spriteUrl) {
      navigator.clipboard.writeText(spriteUrl).then(() => {
        setUrlCopied(true);
        toast.success('URL copied to clipboard');
        setTimeout(() => setUrlCopied(false), 2000);
      }).catch(() => {
        toast.error('Failed to copy URL');
      });
    }
  };

  const handleTogglePublic = async () => {
    if (!sprite) return;
    setIsUpdatingAuth(true);
    try {
      const newAuth = isPublic ? 'sprite' : 'public';
      await api.put(`/api/sprites/${sprite.id}/url-settings`, { auth: newAuth });
      toast.success(newAuth === 'public' ? 'URL is now public' : 'URL is now private');
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update URL settings');
    } finally {
      setIsUpdatingAuth(false);
    }
  };

  if (isLoading) {
    return (
      <Card className={cn('bg-card border', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-400" />
            Coding Agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasSprite) {
    return (
      <Card className={cn('bg-card border', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-400" />
            Coding Agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-4">
              No coding agent created for this project yet.
            </p>
            <Button
              onClick={handleCreate}
              disabled={isPending}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
              Create Coding Agent
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('bg-card border', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-400" />
            Coding Agent
          </CardTitle>
          <SpriteStatusBadge status={sprite.status} size="sm" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status and Controls */}
        <div className="flex flex-wrap gap-2">
          {isActive && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenTerminal}
                className="gap-1.5"
              >
                <Terminal className="h-4 w-4" />
                Terminal
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={isPending}
                className="gap-1.5 text-red-400 hover:text-red-300 hover:border-red-400/50"
              >
                {stopSprite.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Stop
              </Button>
            </>
          )}
          {canResume && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResume}
              disabled={isPending}
              className="gap-1.5 text-green-400 hover:text-green-300 hover:border-green-400/50"
            >
              {resumeSprite.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Resume
            </Button>
          )}
          {isInError && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreate}
              disabled={isPending}
              className="gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              Recreate
            </Button>
          )}
        </div>

        {/* Initialize Button */}
        {isActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleInitialize}
            disabled={isInitializing}
            className={cn(
              "w-full gap-1.5",
              isInitializing && "text-yellow-400"
            )}
          >
            {isInitializing ? (
              <RotateCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isInitializing ? 'Initializing...' : 'Initialize (Clone Repo)'}
          </Button>
        )}

        {/* Error Message */}
        {isInError && sprite.errorMessage && (
          <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded">
            {sprite.errorMessage}
          </div>
        )}

        <Separator />

        {/* Public URL Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">Public URL</Label>
            <div className="flex items-center gap-2">
              {isPublic ? (
                <Badge variant="outline" className="text-green-400 border-green-400/50 text-xs">
                  <Globe className="h-3 w-3 mr-1" />
                  Public
                </Badge>
              ) : (
                <Badge variant="outline" className="text-zinc-400 border-zinc-400/50 text-xs">
                  <Lock className="h-3 w-3 mr-1" />
                  Private
                </Badge>
              )}
              <Switch
                checked={isPublic}
                onCheckedChange={handleTogglePublic}
                disabled={isUpdatingAuth || !isActive}
              />
            </div>
          </div>

          {spriteUrl ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-secondary/50 p-2 rounded truncate text-muted-foreground">
                {spriteUrl}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyUrl}
                className="h-8 w-8 shrink-0"
              >
                {urlCopied ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              URL will be available when coding agent is running.
            </p>
          )}

          {/* Preview Link */}
          {spriteUrl && isActive && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              asChild
            >
              <a href={spriteUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open Preview
              </a>
            </Button>
          )}
        </div>

        <Separator />

        {/* Sprite Info */}
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Name:</span>
            <span className="font-mono text-foreground">{sprite.spriteName}</span>
          </div>
          <div className="flex justify-between">
            <span>Branch:</span>
            <span className="text-foreground">{sprite.branch}</span>
          </div>
          <div className="flex justify-between">
            <span>Claude CLI:</span>
            <span className={sprite.claudeConfigured ? 'text-green-400' : 'text-zinc-400'}>
              {sprite.claudeConfigured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          {sprite.lastAccessedAt && (
            <div className="flex justify-between">
              <span>Last accessed:</span>
              <span className="text-foreground">
                {new Date(sprite.lastAccessedAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Delete Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          className="w-full gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
          Delete Coding Agent
        </Button>
      </CardContent>
    </Card>
  );
}
