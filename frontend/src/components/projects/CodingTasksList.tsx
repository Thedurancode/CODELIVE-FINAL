'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Bot,
  ExternalLink,
  MoreVertical,
  RefreshCw,
  XCircle,
  GitBranch,
  GitPullRequest,
  Clock,
  FileCode,
} from 'lucide-react';
import {
  useCodingTasksForProject,
  useCancelCodingTask,
  useRetryCodingTask,
  getStatusInfo,
  isTerminalStatus,
  isActiveStatus,
  formatDuration,
  type CodingTask,
} from '@/hooks/use-coding-tasks';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface CodingTasksListProps {
  projectId: string;
  onViewTask?: (taskId: string) => void;
}

export function CodingTasksList({ projectId, onViewTask }: CodingTasksListProps) {
  const { data, isLoading, error } = useCodingTasksForProject(projectId);
  const cancelTask = useCancelCodingTask();
  const retryTask = useRetryCodingTask();

  const handleCancel = async (task: CodingTask) => {
    try {
      await cancelTask.mutateAsync(task.id);
      toast.success('Task cancelled');
    } catch (error) {
      toast.error('Failed to cancel task', {
        description: (error as Error).message,
      });
    }
  };

  const handleRetry = async (task: CodingTask) => {
    try {
      const newTask = await retryTask.mutateAsync(task.id);
      toast.success('Task retried', {
        description: `New task created: ${newTask.id.slice(0, 8)}`,
      });
    } catch (error) {
      toast.error('Failed to retry task', {
        description: (error as Error).message,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load coding tasks</p>
        </CardContent>
      </Card>
    );
  }

  const tasks = data?.data || [];

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No coding tasks yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Start a coding task to let Claude implement changes
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <CodingTaskCard
          key={task.id}
          task={task}
          onView={() => onViewTask?.(task.id)}
          onCancel={() => handleCancel(task)}
          onRetry={() => handleRetry(task)}
          isCancelling={cancelTask.isPending}
          isRetrying={retryTask.isPending}
        />
      ))}
    </div>
  );
}

interface CodingTaskCardProps {
  task: CodingTask;
  onView?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  isCancelling?: boolean;
  isRetrying?: boolean;
}

function CodingTaskCard({
  task,
  onView,
  onCancel,
  onRetry,
  isCancelling,
  isRetrying,
}: CodingTaskCardProps) {
  const statusInfo = getStatusInfo(task.status);
  const isActive = isActiveStatus(task.status);
  const isTerminal = isTerminalStatus(task.status);

  return (
    <Card className={isActive ? 'border-purple-300 bg-purple-50/50' : undefined}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Title and Status */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{statusInfo.icon}</span>
              <h4 className="font-medium truncate">{task.title}</h4>
              <Badge variant="secondary" className={`${statusInfo.bgColor} ${statusInfo.color}`}>
                {statusInfo.label}
              </Badge>
            </div>

            {/* Instructions preview */}
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
              {task.instructions}
            </p>

            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {task.featureBranch}
              </span>

              {task.filesChanged > 0 && (
                <span className="flex items-center gap-1">
                  <FileCode className="w-3 h-3" />
                  {task.filesChanged} files
                  <span className="text-green-600">+{task.linesAdded}</span>
                  <span className="text-red-600">-{task.linesRemoved}</span>
                </span>
              )}

              {task.prNumber && (
                <a
                  href={task.prUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <GitPullRequest className="w-3 h-3" />
                  PR #{task.prNumber}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
              </span>

              {task.durationMs && (
                <span>Duration: {formatDuration(task.durationMs)}</span>
              )}
            </div>

            {/* Error message */}
            {task.errorMessage && (
              <p className="text-sm text-destructive mt-2 line-clamp-2">
                Error: {task.errorMessage}
              </p>
            )}

            {/* Progress for active tasks */}
            {isActive && task.progressLog.length > 0 && (
              <p className="text-xs text-purple-600 mt-2 animate-pulse">
                {task.progressLog[task.progressLog.length - 1]}
              </p>
            )}
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onView && (
                <DropdownMenuItem onClick={onView}>
                  View Details
                </DropdownMenuItem>
              )}
              {!isTerminal && onCancel && (
                <DropdownMenuItem
                  onClick={onCancel}
                  disabled={isCancelling}
                  className="text-destructive"
                >
                  {isCancelling ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-2" />
                  )}
                  Cancel Task
                </DropdownMenuItem>
              )}
              {task.status === 'failed' && onRetry && (
                <DropdownMenuItem onClick={onRetry} disabled={isRetrying}>
                  {isRetrying ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Retry Task
                </DropdownMenuItem>
              )}
              {task.prUrl && (
                <DropdownMenuItem asChild>
                  <a href={task.prUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Pull Request
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
