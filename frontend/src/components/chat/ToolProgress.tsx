'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Check, Loader2, Wrench } from 'lucide-react';

interface ToolCall {
  name: string;
  status: 'running' | 'done';
}

interface ToolProgressProps {
  tools: ToolCall[];
  className?: string;
}

// Format tool name for display
function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function ToolProgress({ tools, className }: ToolProgressProps) {
  const completedCount = tools.filter(t => t.status === 'done').length;
  const totalCount = tools.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isComplete = completedCount === totalCount;

  if (tools.length === 0) return null;

  // Single tool - show compact version
  if (tools.length === 1) {
    const tool = tools[0];
    return (
      <motion.div
        className={cn('flex items-center gap-2 mb-3', className)}
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
          tool.status === 'running'
            ? 'bg-accent-500/10 text-accent-400 border border-accent-500/20'
            : 'bg-green-500/10 text-green-400 border border-green-500/20'
        )}>
          {tool.status === 'running' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          <span>{formatToolName(tool.name)}</span>
        </div>
      </motion.div>
    );
  }

  // Multiple tools - show progress steps
  return (
    <motion.div
      className={cn('mb-4 space-y-3', className)}
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Progress bar header */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400 font-medium">
          {isComplete ? 'Completed' : 'Processing'}
        </span>
        <span className="text-zinc-500">
          {completedCount}/{totalCount} steps
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            isComplete
              ? 'bg-green-500'
              : 'bg-gradient-to-r from-accent-500 to-accent-400'
          )}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
        {!isComplete && (
          <motion.div
            className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>

      {/* Steps list */}
      <div className="space-y-1.5">
        {tools.map((tool, index) => (
          <motion.div
            key={index}
            className="flex items-center gap-2"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
          >
            {/* Step indicator */}
            <div className={cn(
              'flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium transition-colors',
              tool.status === 'done'
                ? 'bg-green-500/20 text-green-400'
                : tool.status === 'running'
                  ? 'bg-accent-500/20 text-accent-400'
                  : 'bg-zinc-800 text-zinc-500'
            )}>
              {tool.status === 'done' ? (
                <Check className="h-3 w-3" />
              ) : tool.status === 'running' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span>{index + 1}</span>
              )}
            </div>

            {/* Tool name */}
            <span className={cn(
              'text-sm transition-colors',
              tool.status === 'done'
                ? 'text-green-400'
                : tool.status === 'running'
                  ? 'text-accent-400'
                  : 'text-zinc-500'
            )}>
              {formatToolName(tool.name)}
            </span>

            {/* Running indicator */}
            {tool.status === 'running' && (
              <motion.span
                className="text-xs text-zinc-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                running...
              </motion.span>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
