/**
 * SpriteTaskCard
 *
 * Displays an individual task in the queue with status, priority, and actions.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  GitBranch,
  GitPullRequest,
  Loader2,
  ExternalLink,
  XCircle,
  RotateCcw,
  Play,
  RefreshCw,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  History,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SpriteTask, SpriteTaskStatus, SpriteTaskPriority } from '@/types/spriteTask';
import {
  SPRITE_TASK_STATUS_COLORS,
  SPRITE_TASK_STATUS_LABELS,
  SPRITE_TASK_PRIORITY_COLORS,
  SPRITE_TASK_PRIORITY_LABELS,
  isTaskActive,
  canCancelTask,
  canRetryTask,
} from '@/types/spriteTask';
import {
  useCancelSpriteTask,
  useRetrySpriteTask,
  useProcessSpriteTask,
  useTaskSyncStatus,
  useTaskActivity,
  useSyncTask,
} from '@/hooks/use-sprite-tasks';
import type { TaskActivityEntry } from '@/types/spriteTask';
import { useTaskDiff } from '@/hooks/use-task-diff';
import { TaskDiffViewer } from './TaskDiffViewer';

interface SpriteTaskCardProps {
  task: SpriteTask;
  spriteId?: string | null;
  showProject?: boolean;
  className?: string;
}

// Status icon mapping
function getStatusIcon(status: SpriteTaskStatus) {
  switch (status) {
    case 'pending':
      return <Clock className="h-3.5 w-3.5" />;
    case 'assigned':
    case 'in_progress':
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    case 'pr_created':
      return <GitPullRequest className="h-3.5 w-3.5" />;
    case 'completed':
      return <GitPullRequest className="h-3.5 w-3.5 text-green-500" />;
    case 'failed':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'cancelled':
      return <XCircle className="h-3.5 w-3.5 text-gray-400" />;
    default:
      return <Clock className="h-3.5 w-3.5" />;
  }
}

// Activity entry component for the timeline
function ActivityEntry({ entry }: { entry: TaskActivityEntry }) {
  const getIcon = () => {
    switch (entry.type) {
      case 'status_change':
        return <RefreshCw className="h-3 w-3 text-indigo-500" />;
      case 'comment':
        return <MessageSquare className="h-3 w-3 text-blue-400" />;
      case 'pr_created':
        return <GitPullRequest className="h-3 w-3 text-purple-500" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex items-start gap-2 text-xs">
      <div className="mt-0.5 shrink-0">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {entry.actor && (
            <span className="font-medium text-foreground flex items-center gap-1">
              <User className="h-2.5 w-2.5" />
              {entry.actor}
            </span>
          )}
          <span className="text-muted-foreground">
            {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
          </span>
        </div>
        <p className="text-muted-foreground line-clamp-2 mt-0.5">
          {entry.message}
        </p>
      </div>
    </div>
  );
}

export function SpriteTaskCard({
  task,
  spriteId,
  showProject = false,
  className,
}: SpriteTaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasAutoSynced = useRef(false);

  const cancelMutation = useCancelSpriteTask();
  const retryMutation = useRetrySpriteTask();
  const processMutation = useProcessSpriteTask();
  const syncMutation = useSyncTask();

  // Auto-sync with GitHub when card is expanded for the first time
  useEffect(() => {
    if (isExpanded && task.githubIssueNumber && !hasAutoSynced.current && !syncMutation.isPending) {
      hasAutoSynced.current = true;
      // Silently sync in background without showing toast
      syncMutation.mutate(task.id);
    }
  }, [isExpanded, task.githubIssueNumber, task.id, syncMutation]);

  // Fetch sync status when task has a GitHub issue
  const { data: syncStatus } = useTaskSyncStatus(task.githubIssueNumber ? task.id : null);

  // Fetch activity when expanded and has a GitHub issue
  const { data: activity, isLoading: activityLoading } = useTaskActivity(
    isExpanded && task.githubIssueNumber ? task.id : null,
    { enabled: isExpanded && !!task.githubIssueNumber }
  );

  // Fetch diff when task has a branch and is expanded
  const { data: diffData } = useTaskDiff(
    isExpanded && task.branchName ? task.id : null,
    { enabled: isExpanded && !!task.branchName }
  );

  const isActive = isTaskActive(task.status);
  const canCancel = canCancelTask(task.status);
  const canRetry = canRetryTask(task.status);

  const handleCancel = () => {
    cancelMutation.mutate(task.id);
  };

  const handleRetry = () => {
    retryMutation.mutate(task.id);
  };

  const handleProcess = () => {
    processMutation.mutate({
      taskId: task.id,
      spriteId: spriteId ?? undefined,
    });
  };

  const handleSync = () => {
    syncMutation.mutate(task.id, {
      onSuccess: (result) => {
        if (result.newComments > 0 || result.issueUpdated || result.labelsUpdated) {
          toast.success('Synced with GitHub', {
            description: result.newComments > 0
              ? `${result.newComments} new comment${result.newComments !== 1 ? 's' : ''} synced`
              : 'Issue data updated',
          });
        } else {
          toast.info('Already in sync');
        }
      },
      onError: (error) => {
        toast.error('Sync failed', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      },
    });
  };

  // Truncate description for collapsed view
  const truncatedDescription =
    task.description && task.description.length > 120
      ? task.description.slice(0, 120) + '...'
      : task.description;

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        isActive && 'ring-2 ring-yellow-500/50',
        className
      )}
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {/* Status Badge */}
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-white text-xs px-1.5 py-0.5',
                    SPRITE_TASK_STATUS_COLORS[task.status]
                  )}
                >
                  <span className="flex items-center gap-1">
                    {getStatusIcon(task.status)}
                    {SPRITE_TASK_STATUS_LABELS[task.status]}
                  </span>
                </Badge>

                {/* Priority Badge */}
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs px-1.5 py-0.5',
                    task.priority === 'urgent' && 'border-red-500 text-red-500',
                    task.priority === 'high' && 'border-orange-500 text-orange-500',
                    task.priority === 'medium' && 'border-blue-500 text-blue-500',
                    task.priority === 'low' && 'border-gray-400 text-gray-400'
                  )}
                >
                  {SPRITE_TASK_PRIORITY_LABELS[task.priority]}
                </Badge>

                {/* GitHub Issue Link with Sync Status */}
                {task.githubIssueUrl && (
                  <div className="flex items-center gap-1">
                    <a
                      href={task.githubIssueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                        #{task.githubIssueNumber}
                      </Badge>
                    </a>
                    {/* Sync status indicator */}
                    {syncStatus && (
                      <div className="flex items-center gap-1">
                        {syncStatus.commentCount > 0 && (
                          <Badge
                            variant="outline"
                            className="text-xs px-1 py-0 text-muted-foreground"
                            title={`${syncStatus.commentCount} comment${syncStatus.commentCount !== 1 ? 's' : ''}`}
                          >
                            <MessageSquare className="h-3 w-3 mr-0.5" />
                            {syncStatus.commentCount}
                          </Badge>
                        )}
                        {syncStatus.lastSynced && (
                          <CheckCircle2
                            className="h-3 w-3 text-green-500"
                            title={`Synced ${formatDistanceToNow(new Date(syncStatus.lastSynced), { addSuffix: true })}`}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Title */}
              <h4 className="font-medium text-sm truncate">{task.title}</h4>

              {/* Time info */}
              <p className="text-xs text-muted-foreground mt-1">
                Queued {formatDistanceToNow(new Date(task.queuedAt), { addSuffix: true })}
                {task.startedAt && (
                  <> • Started {formatDistanceToNow(new Date(task.startedAt), { addSuffix: true })}</>
                )}
              </p>
            </div>

            {/* Expand toggle */}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>

          {/* Collapsed description preview */}
          {!isExpanded && truncatedDescription && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {truncatedDescription}
            </p>
          )}
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-4 pt-0 space-y-3">
            {/* Full description */}
            {task.description && (
              <div>
                <h5 className="text-xs font-medium text-muted-foreground mb-1">
                  Description
                </h5>
                <p className="text-sm whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            {/* Prompt */}
            {task.prompt && task.prompt !== task.description && (
              <div>
                <h5 className="text-xs font-medium text-muted-foreground mb-1">
                  Prompt
                </h5>
                <p className="text-sm whitespace-pre-wrap font-mono text-xs bg-muted p-2 rounded">
                  {task.prompt}
                </p>
              </div>
            )}

            {/* Branch info */}
            {task.branchName && (
              <div className="flex items-center gap-2 text-sm">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {task.branchName}
                </code>
              </div>
            )}

            {/* File Changes Diff */}
            {task.branchName && diffData?.files && diffData.files.length > 0 && (
              <div className="pt-2">
                <h5 className="text-xs font-medium text-muted-foreground mb-2">
                  File Changes
                </h5>
                <TaskDiffViewer files={diffData.files} branchName={task.branchName} />
              </div>
            )}

            {/* PR Link */}
            {task.pullRequestUrl && (
              <a
                href={task.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-500 hover:underline"
              >
                <GitPullRequest className="h-4 w-4" />
                Pull Request #{task.pullRequestNumber}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            {/* Error message */}
            {task.errorMessage && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-2">
                <h5 className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                  Error
                </h5>
                <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                  {task.errorMessage}
                </p>
              </div>
            )}

            {/* Status message */}
            {task.statusMessage && !task.errorMessage && (
              <p className="text-xs text-muted-foreground italic">
                {task.statusMessage}
              </p>
            )}

            {/* Activity Timeline */}
            {task.githubIssueNumber && (
              <div className="pt-2">
                <h5 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Activity
                  {activityLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                </h5>
                {activity && activity.length > 0 ? (
                  <ScrollArea className="h-[150px]">
                    <div className="space-y-2 pr-2">
                      {activity.slice(0, 10).map((entry, idx) => (
                        <ActivityEntry key={`${entry.type}-${entry.timestamp}-${idx}`} entry={entry} />
                      ))}
                      {activity.length > 10 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          +{activity.length - 10} more events
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                ) : !activityLoading ? (
                  <p className="text-xs text-muted-foreground">No activity yet</p>
                ) : null}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t">
              {/* Process button for pending tasks */}
              {task.status === 'pending' && spriteId && (
                <Button
                  size="sm"
                  onClick={handleProcess}
                  disabled={processMutation.isPending}
                >
                  {processMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  Process Now
                </Button>
              )}

              {/* Cancel button */}
              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-1" />
                  )}
                  Cancel
                </Button>
              )}

              {/* Retry button */}
              {canRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  disabled={retryMutation.isPending}
                >
                  {retryMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-1" />
                  )}
                  Retry
                </Button>
              )}

              {/* Sync with GitHub button */}
              {task.githubIssueNumber && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSync}
                  disabled={syncMutation.isPending}
                  title="Sync with GitHub issue"
                >
                  {syncMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Sync
                </Button>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
