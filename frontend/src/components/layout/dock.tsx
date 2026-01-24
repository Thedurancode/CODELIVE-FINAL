'use client';

import { useState, useCallback, useEffect } from 'react';
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
  ChevronDown,
  Pin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DockItem } from './dock-item';
import { DockAgentsItem } from './dock-agents-item';

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

const DOCK_TRIGGER_ZONE = 8; // px from very bottom edge to trigger dock show

export function Dock() {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isHovering, setIsHovering] = useState(false);

  // Load hidden preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('dock_hidden');
    if (saved === 'true') {
      setIsHidden(true);
      setIsVisible(false);
    }
  }, []);

  // Detect touch device on mount
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Handle showing dock when mouse hits bottom edge
  useEffect(() => {
    if (!isHidden) {
      setIsVisible(true);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const distanceFromBottom = window.innerHeight - e.clientY;

      // Only show when mouse is at the very bottom edge
      if (distanceFromBottom <= DOCK_TRIGGER_ZONE) {
        setIsVisible(true);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isHidden]);

  // Hide dock when mouse leaves (only in hidden mode)
  useEffect(() => {
    if (!isHidden || !isVisible) return;

    // If not hovering over dock, hide after a short delay
    if (!isHovering) {
      const timeout = setTimeout(() => {
        setIsVisible(false);
      }, 400);
      return () => clearTimeout(timeout);
    }
  }, [isHidden, isVisible, isHovering]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isTouchDevice) {
      setMouseX(e.clientX);
    }
  }, [isTouchDevice]);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMouseX(null);
    setIsHovering(false);
  }, []);

  const handleHide = useCallback(() => {
    setIsHidden(true);
    setIsVisible(false);
    localStorage.setItem('dock_hidden', 'true');
  }, []);

  const handlePin = useCallback(() => {
    setIsHidden(false);
    setIsVisible(true);
    localStorage.setItem('dock_hidden', 'false');
  }, []);

  return (
    <>
      {/* Hidden dock trigger zone - full width at bottom */}
      {isHidden && !isVisible && (
        <div
          className="fixed bottom-0 left-0 right-0 h-2 z-50 cursor-pointer"
          onMouseEnter={() => setIsVisible(true)}
        >
          {/* Visual indicator line */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-muted-foreground/20 rounded-full hover:bg-muted-foreground/40 transition-colors" />
        </div>
      )}

      {/* Main Dock */}
      <AnimatePresence>
        {isVisible && (
          <motion.div
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

            {/* Running Agents */}
            <DockAgentsItem mouseX={isTouchDevice ? null : mouseX} />

            {/* Separator */}
            <div className="w-px h-10 bg-border/50 mx-1" />

            {/* Hide/Pin button */}
            {isHidden ? (
              <button
                onClick={handlePin}
                className="flex flex-col items-center gap-1 cursor-pointer transition-opacity hover:opacity-100 opacity-70"
                title="Pin dock (always visible)"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-secondary/60 hover:bg-secondary transition-colors">
                  <Pin className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">Pin</span>
              </button>
            ) : (
              <button
                onClick={handleHide}
                className="flex flex-col items-center gap-1 cursor-pointer transition-opacity hover:opacity-100 opacity-70"
                title="Hide dock"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-secondary/60 hover:bg-secondary transition-colors">
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">Hide</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
