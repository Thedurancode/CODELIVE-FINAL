/**
 * DeployStatusBadge
 *
 * Shows deployment status indicator for completed tasks.
 * Displays when deploy hooks are configured and triggered.
 */

'use client';

import { Rocket, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDeployStats } from '@/hooks/use-deploy-hooks';
import { cn } from '@/lib/utils';

interface DeployStatusBadgeProps {
  projectId: string;
  taskStatus: string;
  className?: string;
}

export function DeployStatusBadge({ projectId, taskStatus, className }: DeployStatusBadgeProps) {
  const { data: stats, isLoading } = useDeployStats(projectId);

  // Only show for completed tasks when deploy hooks exist
  if (taskStatus !== 'completed' || !stats?.totalHooks) {
    return null;
  }

  if (isLoading) {
    return (
      <Badge variant="outline" className={cn('text-xs px-1.5 py-0.5', className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
      </Badge>
    );
  }

  // Determine status based on last deployment stats
  const hasActiveHooks = stats.activeHooks > 0;
  const hasDeployments = stats.totalDeploys > 0;
  const successRate = stats.overallSuccessRate;

  if (!hasActiveHooks) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'text-xs px-1.5 py-0.5 cursor-help',
              successRate >= 90 && 'border-green-500 text-green-500',
              successRate >= 50 && successRate < 90 && 'border-yellow-500 text-yellow-500',
              successRate < 50 && hasDeployments && 'border-red-500 text-red-500',
              className
            )}
          >
            <Rocket className="h-3 w-3 mr-0.5" />
            {hasDeployments ? (
              successRate >= 90 ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : successRate >= 50 ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )
            ) : (
              'Deploy'
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p className="font-medium">Deploy Hooks</p>
            <p>{stats.activeHooks} active hook{stats.activeHooks !== 1 ? 's' : ''}</p>
            {hasDeployments && (
              <p>
                {stats.successfulDeploys}/{stats.totalDeploys} successful ({successRate}%)
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
