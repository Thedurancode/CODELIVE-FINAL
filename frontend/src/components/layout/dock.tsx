'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Activity,
  FolderKanban,
  Users,
  Phone,
  Calendar,
  Mail,
  Settings,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DockItem } from './dock-item';

const dockItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/activity-feed', label: 'Activity', icon: Activity },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/email', label: 'Email', icon: Mail },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const DOCK_HIDE_DELAY = 1000; // ms before hiding dock
const DOCK_TRIGGER_ZONE = 50; // px from bottom to trigger dock show

export function Dock() {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [autoHide, setAutoHide] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  // Load auto-hide preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('dock_auto_hide');
    if (saved === 'true') {
      setAutoHide(true);
      setIsVisible(false);
    }
  }, []);

  // Detect touch device on mount
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Handle global mouse movement for auto-hide
  useEffect(() => {
    if (!autoHide) {
      setIsVisible(true);
      return;
    }

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const distanceFromBottom = window.innerHeight - e.clientY;

      if (distanceFromBottom <= DOCK_TRIGGER_ZONE) {
        // Mouse near bottom - show dock
        setIsVisible(true);
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
      } else if (!isHovering) {
        // Mouse away and not hovering on dock - start hide timer
        if (!hideTimeoutRef.current) {
          hideTimeoutRef.current = setTimeout(() => {
            setIsVisible(false);
            hideTimeoutRef.current = null;
          }, DOCK_HIDE_DELAY);
        }
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [autoHide, isHovering]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isTouchDevice) {
      setMouseX(e.clientX);
    }
  }, [isTouchDevice]);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMouseX(null);
    setIsHovering(false);
  }, []);

  const toggleAutoHide = useCallback(() => {
    const newValue = !autoHide;
    setAutoHide(newValue);
    localStorage.setItem('dock_auto_hide', String(newValue));
    if (!newValue) {
      setIsVisible(true);
    }
  }, [autoHide]);

  // Show indicator when dock is hidden
  const showDockIndicator = autoHide && !isVisible;

  return (
    <>
      {/* Hidden dock trigger zone / indicator */}
      <AnimatePresence>
        {showDockIndicator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 pb-1"
          >
            <div className="flex flex-col items-center gap-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <ChevronUp className="w-4 h-4 animate-bounce" />
              <div className="w-16 h-1 bg-muted-foreground/30 rounded-full" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Dock */}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            ref={dockRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={cn(
              // Positioning - fixed at bottom center
              'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
              // Glass/blur effect
              'bg-card/70 backdrop-blur-xl',
              // Border and shadow
              'border border-border/50 rounded-2xl',
              'shadow-lg shadow-black/10 dark:shadow-black/30',
              // Padding
              'px-3 py-2',
              // Layout - items aligned to bottom for magnification effect
              'flex items-end gap-2',
              // Mobile adjustments
              'max-sm:bottom-2 max-sm:px-2 max-sm:py-1.5 max-sm:gap-1'
            )}
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
            }}
          >
            {dockItems.map((item) => (
              <DockItem
                key={item.href}
                {...item}
                mouseX={isTouchDevice ? null : mouseX}
              />
            ))}

            {/* Separator */}
            <div className="w-px h-10 bg-border/50 mx-1" />

            {/* Auto-hide toggle button */}
            <button
              onClick={toggleAutoHide}
              className={cn(
                'flex flex-col items-center gap-1 cursor-pointer',
                'transition-opacity hover:opacity-100',
                autoHide ? 'opacity-100' : 'opacity-50'
              )}
              title={autoHide ? 'Disable auto-hide' : 'Enable auto-hide (like macOS)'}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center',
                  'bg-secondary/60 hover:bg-secondary transition-colors',
                  autoHide && 'bg-primary/20 hover:bg-primary/30'
                )}
              >
                <ChevronUp
                  className={cn(
                    'w-5 h-5 transition-transform',
                    autoHide ? 'text-primary rotate-180' : 'text-muted-foreground'
                  )}
                />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">
                {autoHide ? 'Pinned' : 'Hide'}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
