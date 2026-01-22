'use client';

import { useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Paperclip, Mic, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Message DispoBot...',
  className,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className={cn('relative', className)}>
      <div className={cn(
        'flex items-end gap-3 p-3 rounded-2xl transition-all duration-200',
        'bg-zinc-800/80 border border-zinc-700/50',
        'focus-within:border-accent-500/50 focus-within:bg-zinc-800',
        'shadow-lg shadow-black/20'
      )}>
        {/* Attachment button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 rounded-xl flex-shrink-0',
            'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50',
            'transition-colors'
          )}
          disabled={disabled}
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent py-2',
            'text-zinc-100 placeholder:text-zinc-500',
            'focus:outline-none',
            'min-h-[24px] max-h-[200px]',
            'text-[15px] leading-relaxed'
          )}
        />

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Mic button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-9 w-9 rounded-xl',
              'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50',
              'transition-colors'
            )}
            disabled={disabled}
          >
            <Mic className="h-5 w-5" />
          </Button>

          {/* Send button */}
          <Button
            type="button"
            size="icon"
            className={cn(
              'h-9 w-9 rounded-xl transition-all duration-200',
              value.trim() && !disabled
                ? 'bg-accent-600 hover:bg-accent-500 text-white shadow-md shadow-accent-600/30'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            )}
            disabled={disabled || !value.trim()}
            onClick={onSubmit}
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
