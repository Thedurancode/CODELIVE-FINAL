/**
 * SpritePanel
 *
 * OS-style panel showing sprite status and controls for a project.
 * Clean, minimal design with clear visual hierarchy.
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
  ChevronDown,
  ChevronRight,
  Clock,
  Zap,
  HardDrive,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
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
  const [showSettings, setShowSettings] = useState(false);
  const [showGit, setShowGit] = useState(true);

  const { data: sprite, isLoading, refetch } = useSpriteByProject(projectId);
  const createSprite = useCreateSprite();
  const resumeSprite = useResumeSprite();
  const stopSprite = useStopSprite();
  const deleteSprite = useDeleteSprite();
  const initializeSprite = useInitializeSprite();
  const updateSettings = useUpdateSpriteSettings();

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

  useEffect(() => {
    if (!hasSprite || !isTransitioning) return;
    const pollInterval = setInterval(() => refetch(), 2000);
    return () => clearInterval(pollInterval);
  }, [hasSprite, isTransitioning, sprite?.status, refetch]);

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
        toast.success('URL copied');
        setTimeout(() => setUrlCopied(false), 2000);
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
        action: { label: 'Open', onClick: () => window.open(pr.url, '_blank') },
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

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-hidden', className)}>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      </div>
    );
  }

  // No sprite state
  if (!hasSprite) {
    return (
      <div className={cn('rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-hidden', className)}>
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
            <Bot className="h-8 w-8 text-purple-400" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No Agent Running</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-xs">
            Create a coding agent to enable Claude-powered development for this project.
          </p>
          <Button
            onClick={handleCreate}
            disabled={isPending}
            className="gap-2 bg-purple-600 hover:bg-purple-500 text-white"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Create Agent
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Main Agent Window */}
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-hidden">
        {/* Window Title Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-3 h-3 rounded-full',
              isActive ? 'bg-green-500 shadow-lg shadow-green-500/50' :
              isInError ? 'bg-red-500' :
              isTransitioning ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-600'
            )} />
            <span className="font-medium text-white text-sm">Coding Agent</span>
            <span className="text-xs text-zinc-500 font-mono">{sprite.spriteName?.split('-').pop()}</span>
          </div>
          <SpriteStatusBadge status={sprite.status} size="sm" />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 bg-zinc-800/30 border-b border-zinc-800/50">
          {isActive && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenTerminal}
                className="h-8 px-3 text-xs gap-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700"
              >
                <Terminal className="h-3.5 w-3.5" />
                Terminal
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStop}
                disabled={isPending}
                className="h-8 px-3 text-xs gap-1.5 text-zinc-300 hover:text-red-400 hover:bg-red-500/10"
              >
                {stopSprite.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                Stop
              </Button>
              <div className="w-px h-4 bg-zinc-700 mx-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleInitialize}
                disabled={isInitializing}
                className="h-8 px-3 text-xs gap-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700"
              >
                {isInitializing ? <RotateCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {isInitializing ? 'Initializing...' : 'Init Repo'}
              </Button>
            </>
          )}
          {canResume && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResume}
              disabled={isPending}
              className="h-8 px-3 text-xs gap-1.5 text-green-400 hover:text-green-300 hover:bg-green-500/10"
            >
              {resumeSprite.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Resume
            </Button>
          )}
          {isInError && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreate}
              disabled={isPending}
              className="h-8 px-3 text-xs gap-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Recreate
            </Button>
          )}
        </div>

        {/* Transition/Error Messages */}
        {isTransitioning && (
          <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/5 border-b border-purple-500/20">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
            <span className="text-xs text-purple-300">
              {sprite.status === 'restoring' && 'Restoring from checkpoint...'}
              {sprite.status === 'checkpointing' && 'Saving checkpoint...'}
              {sprite.status === 'initializing' && 'Initializing environment...'}
              {sprite.status === 'creating' && 'Creating sprite...'}
            </span>
          </div>
        )}
        {isInError && sprite.errorMessage && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/5 border-b border-red-500/20">
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-xs text-red-300">{sprite.errorMessage}</span>
          </div>
        )}

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-px bg-zinc-800/50">
          <InfoRow icon={<HardDrive className="h-3.5 w-3.5" />} label="Branch" value={sprite.branch} />
          <InfoRow icon={<GitBranch className="h-3.5 w-3.5" />} label="Feature" value={sprite.featureBranch || '—'} mono />
          <InfoRow
            icon={<Bot className="h-3.5 w-3.5" />}
            label="Claude CLI"
            value={sprite.claudeConfigured ? 'Ready' : 'Not configured'}
            valueClass={sprite.claudeConfigured ? 'text-green-400' : 'text-zinc-500'}
          />
          <InfoRow
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Last Active"
            value={sprite.lastAccessedAt ? new Date(sprite.lastAccessedAt).toLocaleDateString() : '—'}
          />
        </div>

        {/* Collapsible Settings Section */}
        <div className="border-t border-zinc-800">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-zinc-800/30 transition-colors"
          >
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Shell Settings</span>
            {showSettings ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
          </button>
          {showSettings && (
            <div className="px-4 pb-4 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="npm run dev"
                  value={startupCommand}
                  onChange={(e) => { setStartupCommand(e.target.value); setStartupCommandEdited(true); }}
                  className="flex-1 h-8 text-xs bg-zinc-800/50 border-zinc-700 focus:border-zinc-600"
                />
                {startupCommandEdited && (
                  <Button
                    size="sm"
                    onClick={handleSaveStartupCommand}
                    disabled={updateSettings.isPending}
                    className="h-8 px-3 text-xs bg-purple-600 hover:bg-purple-500"
                  >
                    {updateSettings.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                  </Button>
                )}
              </div>
              <p className="text-xs text-zinc-500">Runs automatically when terminal connects.</p>
            </div>
          )}
        </div>

        {/* Git Section */}
        {sprite.githubConfigured && sprite.featureBranch && (
          <div className="border-t border-zinc-800">
            <button
              onClick={() => setShowGit(!showGit)}
              className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-zinc-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Git & PR</span>
                {branchStatus && branchStatus.ahead > 0 && (
                  <Badge className="h-4 px-1.5 text-[10px] bg-green-500/20 text-green-400 border-0">
                    {branchStatus.ahead} ahead
                  </Badge>
                )}
                {existingPr && (
                  <Badge className="h-4 px-1.5 text-[10px] bg-purple-500/20 text-purple-400 border-0">
                    PR #{existingPr.number}
                  </Badge>
                )}
              </div>
              {showGit ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
            </button>
            {showGit && (
              <div className="px-4 pb-4 space-y-3">
                {/* Branch Status Badges */}
                {branchStatus && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {branchStatus.ahead > 0 && (
                      <Badge variant="outline" className="text-xs text-green-400 border-green-500/30 bg-green-500/5">
                        ↑ {branchStatus.ahead} ahead
                      </Badge>
                    )}
                    {branchStatus.behind > 0 && (
                      <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-500/30 bg-yellow-500/5">
                        ↓ {branchStatus.behind} behind
                      </Badge>
                    )}
                    {branchStatus.hasUncommittedChanges && (
                      <Badge variant="outline" className="text-xs text-orange-400 border-orange-500/30 bg-orange-500/5">
                        • Uncommitted
                      </Badge>
                    )}
                    {branchStatus.ahead === 0 && branchStatus.behind === 0 && !branchStatus.hasUncommittedChanges && (
                      <span className="text-xs text-zinc-500">Up to date with main</span>
                    )}
                  </div>
                )}

                {/* Existing PR Link */}
                {existingPr && (
                  <a
                    href={existingPr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20 hover:bg-purple-500/10 transition-colors group"
                  >
                    <GitPullRequest className="h-4 w-4 text-purple-400" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white group-hover:text-purple-300 truncate block">
                        #{existingPr.number}: {existingPr.title}
                      </span>
                      <span className="text-xs text-zinc-500">{existingPr.state}</span>
                    </div>
                    <ExternalLink className="h-4 w-4 text-zinc-500 group-hover:text-purple-400" />
                  </a>
                )}

                {/* Git Actions */}
                <div className="flex gap-2">
                  {branchStatus && branchStatus.ahead > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePush}
                      disabled={isPending || !isActive}
                      className="flex-1 h-8 text-xs gap-1.5 border-zinc-700 hover:bg-zinc-800"
                    >
                      {pushChanges.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Push Changes
                    </Button>
                  )}
                  {!existingPr && branchStatus && branchStatus.ahead > 0 && (
                    <Button
                      size="sm"
                      onClick={handleCreatePR}
                      disabled={isPending || !isActive}
                      className="flex-1 h-8 text-xs gap-1.5 bg-purple-600 hover:bg-purple-500"
                    >
                      {createPullRequest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitPullRequest className="h-3.5 w-3.5" />}
                      Create PR
                    </Button>
                  )}
                </div>

                {branchStatus && branchStatus.ahead === 0 && !existingPr && (
                  <p className="text-xs text-zinc-500">
                    Use <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">claude</code> to make changes, then create a PR.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-zinc-800/20 border-t border-zinc-800 flex items-center justify-between">
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Agent
          </button>
        </div>
      </div>

      {/* URL Panel */}
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-blue-400" />
            <span className="font-medium text-white text-sm">Preview URL</span>
          </div>
          <div className="flex items-center gap-2">
            {isPublic ? (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Public
              </span>
            ) : (
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Private
              </span>
            )}
            <Switch
              checked={isPublic}
              onCheckedChange={handleTogglePublic}
              disabled={isUpdatingAuth || !isActive}
              className="scale-75"
            />
          </div>
        </div>

        <div className="p-4 space-y-3">
          {spriteUrl ? (
            <>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                <code className="flex-1 text-xs text-zinc-400 truncate">{spriteUrl}</code>
                <button
                  onClick={handleCopyUrl}
                  className="p-1.5 rounded hover:bg-zinc-700 transition-colors"
                >
                  {urlCopied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-zinc-500" />}
                </button>
              </div>
              {isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 text-xs gap-1.5 border-zinc-700 hover:bg-zinc-800"
                  asChild
                >
                  <a href={spriteUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Preview
                  </a>
                </Button>
              )}
            </>
          ) : (
            <p className="text-xs text-zinc-500 text-center py-2">
              URL available when agent is running
            </p>
          )}

          {/* Dev Server Ports */}
          {sprite && (
            <SpriteServicesPanel spriteId={sprite.id} isActive={isActive} />
          )}
        </div>
      </div>
    </div>
  );
}

// Info Row Component
function InfoRow({
  icon,
  label,
  value,
  mono = false,
  valueClass = 'text-white'
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/50">
      <div className="flex items-center gap-2 text-zinc-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className={cn('text-xs', mono && 'font-mono', valueClass)}>{value}</span>
    </div>
  );
}
