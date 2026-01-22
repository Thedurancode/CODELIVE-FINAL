'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ActionButtonsData } from '@/lib/chat-parser';
import {
  Loader2,
  ExternalLink,
  Plus,
  Send,
  Eye,
  Edit,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Check,
  X,
  ArrowRight,
  Search,
  Filter,
  Star,
  Heart,
  Share,
  Copy,
} from 'lucide-react';

interface ChatActionButtonsProps {
  data: ActionButtonsData;
  onAction?: (action: string, data?: Record<string, unknown>) => void;
  className?: string;
}

// Map icon names to Lucide icons
const ICON_MAP: Record<string, typeof ExternalLink> = {
  external: ExternalLink,
  plus: Plus,
  add: Plus,
  send: Send,
  view: Eye,
  edit: Edit,
  delete: Trash2,
  trash: Trash2,
  download: Download,
  upload: Upload,
  refresh: RefreshCw,
  check: Check,
  close: X,
  cancel: X,
  arrow: ArrowRight,
  next: ArrowRight,
  search: Search,
  filter: Filter,
  star: Star,
  favorite: Heart,
  heart: Heart,
  share: Share,
  copy: Copy,
};

function getVariantClass(variant?: string): string {
  switch (variant) {
    case 'primary':
      return 'bg-accent-600 hover:bg-accent-700 text-white border-transparent';
    case 'secondary':
      return 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200 border-transparent';
    case 'destructive':
      return 'bg-red-600 hover:bg-red-700 text-white border-transparent';
    case 'outline':
      return 'bg-transparent hover:bg-zinc-800 text-zinc-300 border-zinc-700';
    default:
      return 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700';
  }
}

export function ChatActionButtons({ data, onAction, className }: ChatActionButtonsProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());

  const { buttons, layout = 'horizontal' } = data;

  const handleClick = async (action: string, buttonData?: Record<string, unknown>) => {
    if (loadingAction || completedActions.has(action)) return;

    setLoadingAction(action);
    try {
      if (onAction) {
        await onAction(action, buttonData);
      }
      setCompletedActions(prev => new Set([...prev, action]));
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setLoadingAction(null);
    }
  };

  if (!buttons || buttons.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'my-3',
        layout === 'horizontal' ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2 max-w-xs',
        className
      )}
    >
      {buttons.map((button, index) => {
        const Icon = button.icon ? ICON_MAP[button.icon.toLowerCase()] : null;
        const isLoading = loadingAction === button.action;
        const isCompleted = completedActions.has(button.action);

        return (
          <Button
            key={index}
            size="sm"
            className={cn(
              'text-xs h-8 gap-1.5 transition-all',
              getVariantClass(button.variant),
              layout === 'vertical' && 'w-full justify-start',
              isCompleted && 'bg-green-600 hover:bg-green-600 cursor-default'
            )}
            onClick={() => handleClick(button.action, button.data)}
            disabled={isLoading || isCompleted}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isCompleted ? (
              <Check className="h-3 w-3" />
            ) : Icon ? (
              <Icon className="h-3 w-3" />
            ) : null}
            {isCompleted ? 'Done' : button.label}
          </Button>
        );
      })}
    </div>
  );
}

export default ChatActionButtons;
