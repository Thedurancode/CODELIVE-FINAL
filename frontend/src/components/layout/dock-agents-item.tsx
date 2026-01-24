'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Terminal, Loader2, Plus, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpriteStore } from '@/stores/sprite-store';
import { useSprites } from '@/hooks/use-sprites';
import { SpriteStatusDot } from '@/components/sprites/SpriteStatusBadge';
import { isSpriteActive } from '@/types/sprite';

interface DockAgentsItemProps {
  mouseX: number | null;
}

export function DockAgentsItem({ mouseX }: DockAgentsItemProps) {
  const [showPopup, setShowPopup] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const openTerminal = useSpriteStore((state) => state.openTerminal);
  const { data: sprites, isLoading } = useSprites();

  // Filter to only active/running sprites
  const activeSprites = sprites?.filter((sprite) => isSpriteActive(sprite.status)) || [];
  const hasActiveSprites = activeSprites.length > 0;

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    clearHideTimeout();
    setShowPopup(true);
  }, [clearHideTimeout]);

  const handleMouseLeave = useCallback(() => {
    clearHideTimeout();
    // Delay hiding to allow mouse to move to popup
    hideTimeoutRef.current = setTimeout(() => {
      setShowPopup(false);
    }, 150);
  }, [clearHideTimeout]);

  const handleOpenTerminal = useCallback((e: React.MouseEvent, spriteId: string, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[DockAgentsItem] Opening terminal for sprite:', { spriteId, projectId });
    console.log('[DockAgentsItem] Calling openTerminal...');
    openTerminal(spriteId, projectId);
    console.log('[DockAgentsItem] openTerminal called, closing popup');
    setShowPopup(false);
  }, [openTerminal]);

  const handleGoToProjects = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Navigating to /projects');
    setShowPopup(false);
    // Use setTimeout to ensure popup closes first
    setTimeout(() => {
      router.push('/projects');
    }, 50);
  }, [router]);

  const handleIconClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Toggle popup on click for touch devices
    if (!showPopup) {
      setShowPopup(true);
    } else {
      // If popup is open, navigate to projects
      setShowPopup(false);
      setTimeout(() => {
        router.push('/projects');
      }, 50);
    }
  }, [showPopup, router]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main dock icon */}
      <motion.div
        className="flex flex-col items-center gap-1 cursor-pointer select-none"
        onClick={handleIconClick}
        whileTap={{ scale: 0.95 }}
        role="button"
        tabIndex={0}
      >
        <motion.div
          className={cn(
            'relative w-12 h-12 flex items-center justify-center rounded-xl',
            'bg-secondary/60 hover:bg-secondary',
            'transition-colors duration-150',
            hasActiveSprites && 'bg-purple-500/20 hover:bg-purple-500/30'
          )}
        >
          <Bot
            className={cn(
              'w-6 h-6',
              hasActiveSprites ? 'text-purple-400' : 'text-foreground'
            )}
          />

          {/* Active count badge */}
          {hasActiveSprites && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full bg-purple-500 text-white text-xs font-medium">
              {activeSprites.length}
            </span>
          )}

          {/* Pulsing indicator when agents are running */}
          {hasActiveSprites && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </motion.div>

        <span
          className={cn(
            'text-[10px] font-medium leading-tight text-center',
            hasActiveSprites ? 'text-purple-400' : 'text-muted-foreground'
          )}
        >
          Agents
        </span>
      </motion.div>

      {/* Hover popup with running agents */}
      <AnimatePresence>
        {showPopup && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute bottom-full left-1/2 -translate-x-1/2 mb-2',
              'min-w-72 max-w-80',
              'bg-card backdrop-blur-xl',
              'border border-border rounded-xl',
              'shadow-xl shadow-black/20',
              'overflow-hidden z-[60]'
            )}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Running Agents</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {activeSprites.length} active
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-72 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : activeSprites.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center">
                    <Bot className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No agents running</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Launch a coding agent from the projects page
                  </p>
                </div>
              ) : (
                <div className="py-2">
                  {activeSprites.map((sprite) => (
                    <button
                      key={sprite.id}
                      type="button"
                      onClick={(e) => handleOpenTerminal(e, sprite.id, sprite.projectId)}
                      className={cn(
                        'w-full px-4 py-3 flex items-center gap-3',
                        'hover:bg-muted/70 active:bg-muted transition-colors',
                        'text-left cursor-pointer'
                      )}
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <Terminal className="w-5 h-5 text-purple-400" />
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <SpriteStatusDot status={sprite.status} />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {sprite.spriteName || 'Coding Agent'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {sprite.repoUrl
                            ? sprite.repoUrl.split('/').slice(-1)[0].replace('.git', '')
                            : sprite.branch || `Project ${sprite.projectId.slice(0, 8)}`}
                        </p>
                      </div>
                      <div className={cn(
                        "flex-shrink-0 flex items-center gap-1.5 text-xs font-medium",
                        sprite.status === 'running' && "text-green-500",
                        sprite.status === 'initializing' && "text-yellow-500",
                        sprite.status === 'hibernating' && "text-blue-500"
                      )}>
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          sprite.status === 'running' && "bg-green-500 animate-pulse",
                          sprite.status === 'initializing' && "bg-yellow-500 animate-pulse",
                          sprite.status === 'hibernating' && "bg-blue-500"
                        )} />
                        <span>
                          {sprite.status === 'running' && 'Live'}
                          {sprite.status === 'initializing' && 'Starting'}
                          {sprite.status === 'hibernating' && 'Sleeping'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-3 border-t border-border bg-muted/50">
              <button
                type="button"
                onClick={handleGoToProjects}
                className={cn(
                  'w-full flex items-center justify-center gap-2',
                  'py-2.5 px-4 rounded-lg',
                  'text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 active:bg-primary/80',
                  'transition-colors cursor-pointer'
                )}
              >
                <Plus className="w-4 h-4" />
                <span>Launch New Agent</span>
              </button>
              <button
                type="button"
                onClick={handleGoToProjects}
                className={cn(
                  'w-full flex items-center justify-center gap-2 mt-2',
                  'py-2 px-4 rounded-lg',
                  'text-xs text-muted-foreground',
                  'hover:text-foreground hover:bg-muted/50',
                  'transition-colors cursor-pointer'
                )}
              >
                <ExternalLink className="w-3 h-3" />
                <span>View All Projects</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
