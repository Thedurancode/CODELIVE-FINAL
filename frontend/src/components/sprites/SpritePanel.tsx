/**
 * SpritePanel
 *
 * Panel showing sprite status and controls for a project.
 * Displays running status, start/stop controls, public URL, and preview link.
 */

'use client';

import { useState, useEffect } from 'react';
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
  GitPullRequest,
  GitBranch,
  Upload,
  AlertCircle,
  Settings,
  Save,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  useBranchStatus,
  usePullRequest,
  usePushChanges,
  useCreatePullRequest,
  useUpdateSpriteSettings,
} from '@/hooks/use-sprites';
import { useSpriteStore } from '@/stores/sprite-store';
import { isSpriteActive, canResumeSprite } from '@/types/sprite';
import { api } from '@/lib/api';
import { SpriteServicesPanel } from './SpriteServicesPanel';

interface SpritePanelProps {
  projectId: string;
  projectTitle?: string;
  className?: string;
}

export function SpritePanel({ projectId, projectTitle, className }: SpritePanelProps) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [isUpdatingAuth, setIsUpdatingAuth] = useState(false);
  const [startupCommand, setStartupCommand] = useState('');
  const [startupCommandEdited, setStartupCommandEdited] = useState(false);

  const { data: sprite, isLoading, refetch } = useSpriteByProject(projectId);
  const createSprite = useCreateSprite();
  const resumeSprite = useResumeSprite();
  const stopSprite = useStopSprite();
  const deleteSprite = useDeleteSprite();
  const initializeSprite = useInitializeSprite();
  const updateSettings = useUpdateSpriteSettings();

  // Git & PR hooks
  const { data: branchStatus, refetch: refetchBranchStatus } = useBranchStatus(sprite?.id);
  const { data: existingPr, refetch: refetchPr } = usePullRequest(sprite?.id);
  const pushChanges = usePushChanges();
  const createPullRequest = useCreatePullRequest();

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

  // Poll sprite status during transitions
  useEffect(() => {
    if (!hasSprite || !isTransitioning) return;

    console.log('[SpritePanel] Polling sprite status during transition:', sprite.status);
    const pollInterval = setInterval(() => {
      refetch();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [hasSprite, isTransitioning, sprite?.status, refetch]);

  // Initialize startup command from sprite data
  useEffect(() => {
    if (sprite?.startupCommand && !startupCommandEdited) {
      setStartupCommand(sprite.startupCommand);
    }
  }, [sprite?.startupCommand, startupCommandEdited]);

  const isPending =
    createSprite.isPending ||
    resumeSprite.isPending ||
    stopSprite.isPending ||
    deleteSprite.isPending ||
    initializeSprite.isPending ||
    pushChanges.isPending ||
    createPullRequest.isPending ||
    updateSettings.isPending;

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

  const handlePush = async () => {
    if (!sprite) return;
    try {
      toast.loading('Pushing changes...');
      const result = await pushChanges.mutateAsync({ spriteId: sprite.id });
      toast.dismiss();
      if (result.success) {
        toast.success(result.message);
        refetchBranchStatus();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to push changes');
    }
  };

  const handleCreatePR = async () => {
    if (!sprite) return;
    try {
      toast.loading('Creating pull request...');
      const pr = await createPullRequest.mutateAsync({ spriteId: sprite.id });
      toast.dismiss();
      toast.success(`PR #${pr.number} created`, {
        action: {
          label: 'Open',
          onClick: () => window.open(pr.url, '_blank'),
        },
      });
      refetchPr();
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to create pull request');
    }
  };

  const handleSaveStartupCommand = async () => {
    if (!sprite) return;
    try {
      await updateSettings.mutateAsync({
        spriteId: sprite.id,
        projectId,
        settings: { startupCommand: startupCommand.trim() || null },
      });
      setStartupCommandEdited(false);
      toast.success('Startup command saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save startup command');
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
    <>
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

        {/* Transition Status Messages */}
        {isTransitioning && (
          <div className="flex items-center gap-2 text-xs bg-purple-500/10 text-purple-300 p-2 rounded">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              {sprite.status === 'restoring' && 'Restoring from checkpoint... This may take 10-30 seconds.'}
              {sprite.status === 'checkpointing' && 'Saving checkpoint... Please wait.'}
              {sprite.status === 'initializing' && 'Initializing environment...'}
              {sprite.status === 'creating' && 'Creating sprite...'}
            </span>
          </div>
        )}

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
          {sprite.featureBranch && (
            <div className="flex justify-between">
              <span>Feature Branch:</span>
              <span className="text-foreground">{sprite.featureBranch}</span>
            </div>
          )}
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

        {/* Shell Persistence Settings */}
        <Separator />
        <div className="space-y-3">
          <Label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Shell Persistence
          </Label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="npm run dev"
                value={startupCommand}
                onChange={(e) => {
                  setStartupCommand(e.target.value);
                  setStartupCommandEdited(true);
                }}
                className="flex-1 text-sm h-8"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveStartupCommand}
                disabled={!startupCommandEdited || updateSettings.isPending}
                className="h-8 px-2"
              >
                {updateSettings.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This command runs automatically when the terminal connects (e.g., start a dev server).
            </p>
            {sprite.lastShellDirectory && (
              <p className="text-xs text-muted-foreground">
                Last directory: <code className="bg-secondary/50 px-1 rounded">{sprite.lastShellDirectory}</code>
              </p>
            )}
          </div>
        </div>

        {/* Git & Pull Request Section */}
        {sprite.githubConfigured && sprite.featureBranch && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Git & Pull Request
              </Label>

              {/* Branch Status */}
              {branchStatus && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Branch:</span>
                    <code className="text-foreground bg-secondary/50 px-2 py-0.5 rounded">
                      {branchStatus.featureBranch}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    {branchStatus.ahead > 0 && (
                      <Badge variant="outline" className="text-green-400 border-green-400/50">
                        {branchStatus.ahead} commit{branchStatus.ahead !== 1 ? 's' : ''} ahead
                      </Badge>
                    )}
                    {branchStatus.behind > 0 && (
                      <Badge variant="outline" className="text-yellow-400 border-yellow-400/50">
                        {branchStatus.behind} commit{branchStatus.behind !== 1 ? 's' : ''} behind
                      </Badge>
                    )}
                    {branchStatus.hasUncommittedChanges && (
                      <Badge variant="outline" className="text-orange-400 border-orange-400/50">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Uncommitted changes
                      </Badge>
                    )}
                    {branchStatus.ahead === 0 && branchStatus.behind === 0 && !branchStatus.hasUncommittedChanges && (
                      <span className="text-muted-foreground">Up to date</span>
                    )}
                  </div>
                  {branchStatus.lastCommitMessage && (
                    <div className="text-muted-foreground truncate">
                      Last commit: {branchStatus.lastCommitMessage}
                    </div>
                  )}
                </div>
              )}

              {/* Existing PR */}
              {existingPr && (
                <div className="flex items-center gap-2 p-2 bg-secondary/30 rounded">
                  <GitPullRequest className="h-4 w-4 text-purple-400" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={existingPr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-foreground hover:underline truncate block"
                    >
                      #{existingPr.number}: {existingPr.title}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {existingPr.state}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    asChild
                  >
                    <a href={existingPr.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {branchStatus && branchStatus.ahead > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePush}
                    disabled={isPending || !isActive}
                    className="gap-1.5 flex-1"
                  >
                    {pushChanges.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Push
                  </Button>
                )}
                {!existingPr && branchStatus && branchStatus.ahead > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreatePR}
                    disabled={isPending || !isActive}
                    className="gap-1.5 flex-1 text-purple-400 hover:text-purple-300 hover:border-purple-400/50"
                  >
                    {createPullRequest.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <GitPullRequest className="h-4 w-4" />
                    )}
                    Create PR
                  </Button>
                )}
              </div>

              {/* Hint when no commits */}
              {branchStatus && branchStatus.ahead === 0 && !existingPr && (
                <p className="text-xs text-muted-foreground">
                  Run <code className="bg-secondary/50 px-1 rounded">claude</code> in the terminal to make changes, then create a PR.
                </p>
              )}
            </div>
          </>
        )}

        {/* GitHub not configured hint */}
        {!sprite.githubConfigured && (
          <>
            <Separator />
            <div className="text-xs text-muted-foreground">
              <p className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                GitHub not configured. Re-initialize the sprite with a GitHub token to enable PR creation.
              </p>
            </div>
          </>
        )}

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

    {/* Public URL Panel - Separate Card */}
    <Card className={cn('bg-card border', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-400" />
            Public URL
          </CardTitle>
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
      </CardHeader>
      <CardContent className="space-y-4">
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
          <p className="text-sm text-muted-foreground">
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

        {/* Preview URLs Section - shows ports opened by dev servers */}
        {sprite && (
          <>
            <Separator />
            <SpriteServicesPanel
              spriteId={sprite.id}
              isActive={isActive}
            />
          </>
        )}
      </CardContent>
    </Card>
    </>
  );
}
