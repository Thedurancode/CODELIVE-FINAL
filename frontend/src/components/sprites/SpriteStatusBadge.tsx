/**
 * SpriteStatusBadge
 *
 * Displays the current status of a Sprite with appropriate styling.
 */

'use client';

import { cn } from '@/lib/utils';
import type { SpriteStatus } from '@/types/sprite';
import { SPRITE_STATUS_COLORS, SPRITE_STATUS_LABELS } from '@/types/sprite';

interface SpriteStatusBadgeProps {
  status: SpriteStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  pulse?: boolean;
  className?: string;
}

export function SpriteStatusBadge({
  status,
  size = 'md',
  showLabel = true,
  pulse = false,
  className,
}: SpriteStatusBadgeProps) {
  const colorClass = SPRITE_STATUS_COLORS[status];
  const label = SPRITE_STATUS_LABELS[status];

  // Determine if status should pulse (transitional states)
  const shouldPulse =
    pulse || ['creating', 'initializing', 'checkpointing', 'restoring'].includes(status);

  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="relative flex">
        <span
          className={cn(
            'rounded-full',
            sizeClasses[size],
            colorClass,
            shouldPulse && 'animate-pulse'
          )}
        />
        {shouldPulse && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
              colorClass
            )}
          />
        )}
      </span>
      {showLabel && (
        <span
          className={cn(
            'font-medium text-muted-foreground',
            textSizeClasses[size]
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}

// Compact version for tight spaces
export function SpriteStatusDot({
  status,
  className,
}: {
  status: SpriteStatus;
  className?: string;
}) {
  return (
    <SpriteStatusBadge
      status={status}
      size="sm"
      showLabel={false}
      className={className}
    />
  );
}
