'use client';

import { useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, useSpring, useTransform } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DockItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  mouseX: number | null;
}

// Magnification constants
const BASE_SIZE = 48;
const MAX_SIZE = 72;
const MAGNIFICATION_DISTANCE = 140;

export function DockItem({ href, label, icon: Icon, mouseX }: DockItemProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = pathname === href || pathname.startsWith(href + '/');
  const ref = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Dock item clicked:', href);
    router.push(href);
  }, [href, router]);

  // Calculate size based on distance with spring physics
  const sizeSpring = useSpring(BASE_SIZE, {
    stiffness: 400,
    damping: 25,
    mass: 0.5,
  });

  // Update size when mouseX changes
  if (ref.current && mouseX !== null) {
    const rect = ref.current.getBoundingClientRect();
    const itemCenterX = rect.left + rect.width / 2;
    const dist = Math.abs(mouseX - itemCenterX);

    // Calculate new size with cosine-based falloff
    if (dist < MAGNIFICATION_DISTANCE) {
      const magnificationFactor = Math.cos((dist / MAGNIFICATION_DISTANCE) * (Math.PI / 2));
      const newSize = BASE_SIZE + (MAX_SIZE - BASE_SIZE) * magnificationFactor;
      sizeSpring.set(newSize);
    } else {
      sizeSpring.set(BASE_SIZE);
    }
  } else if (mouseX === null) {
    sizeSpring.set(BASE_SIZE);
  }

  // Transform size to icon size (50% of container)
  const iconSize = useTransform(sizeSpring, (size) => size * 0.5);

  return (
    <motion.div
      ref={ref}
      className="flex flex-col items-center gap-1 cursor-pointer select-none"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(href);
        }
      }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        style={{
          width: sizeSpring,
          height: sizeSpring,
        }}
        className={cn(
          'relative flex items-center justify-center rounded-xl',
          'bg-secondary/60 hover:bg-secondary',
          'transition-colors duration-150'
        )}
      >
        <motion.div
          style={{
            width: iconSize,
            height: iconSize,
          }}
          className="flex items-center justify-center"
        >
          <Icon
            className={cn(
              'w-full h-full',
              isActive ? 'text-primary' : 'text-foreground'
            )}
          />
        </motion.div>

        {/* Active indicator dot */}
        {isActive && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
          />
        )}
      </motion.div>

      {/* Label */}
      <span
        className={cn(
          'text-[10px] font-medium leading-tight text-center max-w-[56px] truncate',
          isActive ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
    </motion.div>
  );
}
