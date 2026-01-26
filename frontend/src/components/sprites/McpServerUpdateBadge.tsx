/**
 * MCP Server Update Badge
 *
 * A badge component that shows when an MCP server has an available update.
 * Shows version comparison and provides a quick update action.
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ArrowUp, Download, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface McpServerUpdateBadgeProps {
  currentVersion: string | null;
  latestVersion: string | null;
  changelogUrl?: string | null;
  registryUrl?: string | null;
  isUpdating?: boolean;
  onUpdate?: () => void;
  showVersions?: boolean;
  compact?: boolean;
  className?: string;
}

export function McpServerUpdateBadge({
  currentVersion,
  latestVersion,
  changelogUrl,
  registryUrl,
  isUpdating = false,
  onUpdate,
  showVersions = true,
  compact = false,
  className,
}: McpServerUpdateBadgeProps) {
  // Check if update is available
  const hasUpdate = currentVersion && latestVersion && currentVersion !== latestVersion;

  if (!hasUpdate) {
    // Show current version if available and showVersions is true
    if (currentVersion && showVersions && !compact) {
      return (
        <Badge variant="outline" className={cn('text-xs text-muted-foreground', className)}>
          v{currentVersion}
        </Badge>
      );
    }
    return null;
  }

  const tooltipContent = (
    <div className="space-y-2 text-xs">
      <div className="font-medium">Update Available</div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Current:</span>
        <span className="font-mono">v{currentVersion}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Latest:</span>
        <span className="font-mono text-green-400">v{latestVersion}</span>
      </div>
      {(changelogUrl || registryUrl) && (
        <div className="pt-1 border-t border-border/50 flex gap-2">
          {changelogUrl && (
            <a
              href={changelogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              Changelog <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {registryUrl && (
            <a
              href={registryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              Registry <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'text-xs text-amber-400 border-amber-400/30 gap-1 cursor-pointer hover:bg-amber-500/10',
                className
              )}
              onClick={(e) => {
                e.stopPropagation();
                onUpdate?.();
              }}
            >
              {isUpdating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowUp className="h-3 w-3" />
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1.5', className)}>
            {showVersions && (
              <>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  v{currentVersion}
                </Badge>
                <span className="text-muted-foreground">→</span>
              </>
            )}
            <Badge
              variant="outline"
              className="text-xs text-green-400 border-green-400/30 gap-1"
            >
              v{latestVersion}
            </Badge>
            {onUpdate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate();
                }}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default McpServerUpdateBadge;
