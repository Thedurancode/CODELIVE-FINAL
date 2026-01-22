'use client';

import { cn } from '@/lib/utils';

export interface OnlineIndicatorProps {
  isOnline: boolean;
  status?: 'online' | 'away' | 'offline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showRing?: boolean;
}

const sizeClasses = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

const statusColors = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  offline: 'bg-gray-400',
};

export function OnlineIndicator({
  isOnline,
  status = isOnline ? 'online' : 'offline',
  size = 'md',
  className,
  showRing = true,
}: OnlineIndicatorProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full',
        sizeClasses[size],
        statusColors[status],
        showRing && 'ring-2 ring-background',
        className
      )}
      title={status.charAt(0).toUpperCase() + status.slice(1)}
    />
  );
}

export default OnlineIndicator;
