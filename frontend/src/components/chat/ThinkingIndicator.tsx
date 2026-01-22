'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useAgent } from '@/contexts/agent-context';

interface ThinkingIndicatorProps {
  className?: string;
  showLabel?: boolean;
  label?: string;
}

export function ThinkingIndicator({
  className,
  showLabel = true,
  label,
}: ThinkingIndicatorProps) {
  const { agent } = useAgent();
  const displayLabel = label || `${agent.name} is working`;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Animated dots */}
      <div className="flex items-center gap-1">
        <motion.span
          className="w-2 h-2 rounded-full bg-accent-400"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: 0,
          }}
        />
        <motion.span
          className="w-2 h-2 rounded-full bg-accent-400"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: 0.2,
          }}
        />
        <motion.span
          className="w-2 h-2 rounded-full bg-accent-400"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: 0.4,
          }}
        />
      </div>

      {/* Typing label */}
      {showLabel && (
        <motion.span
          className="text-sm text-zinc-400 font-medium"
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {displayLabel}
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            ...
          </motion.span>
        </motion.span>
      )}
    </div>
  );
}
