'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ConfirmationData } from '@/lib/chat-parser';
import {
  AlertTriangle,
  Info,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface ChatConfirmationProps {
  data: ConfirmationData;
  onAction?: (action: string, data?: Record<string, unknown>) => void;
  className?: string;
}

function getTypeConfig(type: string) {
  switch (type) {
    case 'warning':
      return {
        icon: AlertTriangle,
        containerClass: 'border-yellow-500/30 bg-yellow-500/5',
        iconClass: 'text-yellow-500',
        confirmClass: 'bg-yellow-600 hover:bg-yellow-700 text-white',
      };
    case 'danger':
      return {
        icon: AlertCircle,
        containerClass: 'border-red-500/30 bg-red-500/5',
        iconClass: 'text-red-500',
        confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      };
    default:
      return {
        icon: Info,
        containerClass: 'border-blue-500/30 bg-blue-500/5',
        iconClass: 'text-blue-500',
        confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
      };
  }
}

export function ChatConfirmation({ data, onAction, className }: ChatConfirmationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

  const {
    id,
    title,
    message,
    type,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    details,
    action,
    actionData,
  } = data;

  const config = getTypeConfig(type);
  const Icon = config.icon;

  const handleConfirm = async () => {
    if (isLoading || isConfirmed || isCancelled) return;

    setIsLoading(true);
    try {
      if (onAction) {
        await onAction(action, { ...actionData, confirmed: true, confirmationId: id });
      }
      setIsConfirmed(true);
    } catch (error) {
      console.error('Confirmation action failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    if (isLoading || isConfirmed || isCancelled) return;

    setIsLoading(true);
    try {
      if (onAction) {
        await onAction(action, { ...actionData, confirmed: false, confirmationId: id });
      }
      setIsCancelled(true);
    } catch (error) {
      console.error('Cancel action failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Already actioned
  if (isConfirmed || isCancelled) {
    return (
      <div className={cn(
        'w-full max-w-sm p-4 rounded-xl border my-3',
        isConfirmed ? 'border-green-500/30 bg-green-500/5' : 'border-zinc-700 bg-zinc-900/50',
        className
      )}>
        <div className="flex items-center gap-2">
          {isConfirmed ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-sm text-green-400">Confirmed</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-5 w-5 text-zinc-500" />
              <span className="text-sm text-zinc-400">Cancelled</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      'w-full max-w-sm rounded-xl border overflow-hidden my-3',
      config.containerClass,
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-inherit flex items-start gap-3">
        <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', config.iconClass)} />
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
          <p className="text-xs text-zinc-400 mt-1">{message}</p>
        </div>
      </div>

      {/* Details */}
      {details && Object.keys(details).length > 0 && (
        <div className="px-4 py-3 bg-zinc-900/50 border-b border-inherit">
          <div className="space-y-1.5">
            {Object.entries(details).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                <span className="text-zinc-200 font-medium">
                  {typeof value === 'number' && key.toLowerCase().includes('price')
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
                    : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-xs h-9"
          onClick={handleCancel}
          disabled={isLoading}
        >
          {cancelLabel}
        </Button>
        <Button
          size="sm"
          className={cn('flex-1 text-xs h-9', config.confirmClass)}
          onClick={handleConfirm}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              Processing...
            </>
          ) : (
            confirmLabel
          )}
        </Button>
      </div>
    </div>
  );
}

export default ChatConfirmation;
