/**
 * SpriteTaskProgress
 *
 * Real-time progress display for active tasks with polling.
 */

'use client';

import { useEffect, useRef } from 'react';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';
import { Loader2, Clock, XCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePollSpriteTask, useCancelSpriteTask } from '@/hooks/use-sprite-tasks';
import type { SpriteTaskStatus } from '@/types/spriteTask';

interface SpriteTaskProgressProps {
  taskId: string;
  onComplete?: () => void;
  className?: string;
}

// Estimate progress based on status and elapsed time
function estimateProgress(status: SpriteTaskStatus, startedAt: string | null): number {
  if (status === 'pending') return 0;
  if (status === 'assigned') return 5;
  if (status === 'pr_created') return 95;
  if (status === 'completed') return 100;
  if (status === 'failed' || status === 'cancelled') return 0;

  // For in_progress, estimate based on time elapsed
  // Typical task takes 30-120 seconds
  if (status === 'in_progress' && startedAt) {
    const elapsed = differenceInSeconds(new Date(), new Date(startedAt));
    // Cap at 90% until PR is created
    const estimated = Math.min(90, 10 + (elapsed / 60) * 40);
    return Math.round(estimated);
  }

  return 10;
}

// Status step indicator
const STEPS = [
  { key: 'pending', label: 'Queued' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'Working' },
  { key: 'pr_created', label: 'PR Created' },
  { key: 'completed', label: 'Done' },
];

function getStepIndex(status: SpriteTaskStatus): number {
  const index = STEPS.findIndex((s) => s.key === status);
  if (status === 'failed' || status === 'cancelled') return -1;
  return index;
}

export function SpriteTaskProgress({
  taskId,
  onComplete,
  className,
}: SpriteTaskProgressProps) {
  const { data: task, isLoading } = usePollSpriteTask(taskId, true);
  const cancelMutation = useCancelSpriteTask();
  const prevStatusRef = useRef<SpriteTaskStatus | null>(null);

  // Call onComplete when task completes
  useEffect(() => {
    if (!task) return;

    const prev = prevStatusRef.current;
    const curr = task.status;

    if (prev && prev !== curr && (curr === 'completed' || curr === 'pr_created')) {
      onComplete?.();
    }

    prevStatusRef.current = curr;
  }, [task?.status, onComplete]);

  if (isLoading || !task) {
    return (
      <Card className={className}>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const progress = estimateProgress(task.status, task.startedAt);
  const currentStep = getStepIndex(task.status);
  const isFailed = task.status === 'failed';
  const isCancelled = task.status === 'cancelled';
  const isComplete = task.status === 'completed' || task.status === 'pr_created';
  const isActive = task.status === 'assigned' || task.status === 'in_progress';

  const elapsedTime = task.startedAt
    ? formatDistanceToNow(new Date(task.startedAt), { includeSeconds: true })
    : null;

  return (
    <Card className={cn(isActive && 'ring-2 ring-yellow-500/50', className)}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {isActive && <Loader2 className="h-4 w-4 animate-spin" />}
            {isComplete && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {isFailed && <AlertCircle className="h-4 w-4 text-red-500" />}
            {isCancelled && <XCircle className="h-4 w-4 text-gray-400" />}
            {task.title}
          </CardTitle>
          {elapsedTime && isActive && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {elapsedTime}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-4">
        {/* Progress bar */}
        {!isFailed && !isCancelled && (
          <div className="space-y-1.5">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">{progress}%</p>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => {
            const isCurrentStep = i === currentStep;
            const isPastStep = currentStep > i;
            const isFutureStep = currentStep < i;

            return (
              <div
                key={step.key}
                className={cn(
                  'flex flex-col items-center gap-1',
                  isFutureStep && 'opacity-40'
                )}
              >
                <div
                  className={cn(
                    'w-3 h-3 rounded-full',
                    isPastStep && 'bg-green-500',
                    isCurrentStep && isActive && 'bg-yellow-500 animate-pulse',
                    isCurrentStep && isComplete && 'bg-green-500',
                    isFutureStep && 'bg-muted'
                  )}
                />
                <span className="text-[10px] text-muted-foreground">{step.label}</span>
              </div>
            );
          })}
        </div>

        {/* Status message */}
        {task.statusMessage && (
          <ScrollArea className="h-20 w-full rounded border bg-muted/50 p-2">
            <p className="text-xs font-mono whitespace-pre-wrap">{task.statusMessage}</p>
          </ScrollArea>
        )}

        {/* Error message */}
        {task.errorMessage && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-2">
            <p className="text-xs text-red-600 dark:text-red-400 font-mono">
              {task.errorMessage}
            </p>
          </div>
        )}

        {/* Cancel button for active tasks */}
        {(task.status === 'pending' || task.status === 'assigned') && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => cancelMutation.mutate(task.id)}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <XCircle className="h-4 w-4 mr-1" />
            )}
            Cancel Task
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
