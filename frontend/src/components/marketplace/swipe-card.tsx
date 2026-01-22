'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimation,
  PanInfo,
  AnimatePresence,
  useReducedMotion,
} from 'framer-motion';
import { Heart, X, RotateCcw, Info, RotateCw, DollarSign, FileText, Phone, Mail, MapPin, Calculator, TrendingUp, Building, Star, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwipeDirection } from '@/types/marketplace';

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

/** Base swipe threshold in pixels - scales with screen width */
const BASE_SWIPE_THRESHOLD = 100;
/** Minimum swipe threshold for small screens */
const MIN_SWIPE_THRESHOLD = 60;
/** Screen width threshold percentage for responsive scaling */
const SCREEN_THRESHOLD_RATIO = 0.25;
/** Velocity threshold for quick flick gestures (px/s) */
const VELOCITY_THRESHOLD = 500;
/** Super Like swipe up threshold in pixels */
const SUPER_LIKE_THRESHOLD = 80;
/** Super Like velocity threshold (px/s) */
const SUPER_LIKE_VELOCITY_THRESHOLD = 400;
/** Maximum rotation angle in degrees */
const MAX_ROTATION = 15;
/** Exit animation distance */
const EXIT_DISTANCE = 500;
/** Exit rotation angle */
const EXIT_ROTATION = 30;
/** Spring stiffness for rubber-band effect */
const SPRING_STIFFNESS = 500;
/** Spring damping for rubber-band effect */
const SPRING_DAMPING = 30;
/** Haptic vibration duration in ms */
const HAPTIC_DURATION = 10;
/** Double-tap detection window in ms */
const DOUBLE_TAP_DELAY = 300;

// =============================================================================
// UTILITIES
// =============================================================================

/** Trigger haptic feedback on supported devices */
const triggerHaptic = (pattern: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    const duration = pattern === 'light' ? HAPTIC_DURATION : pattern === 'medium' ? 20 : 30;
    navigator.vibrate(duration);
  }
};

/** Calculate responsive swipe threshold based on screen width */
const getResponsiveThreshold = (screenWidth: number): number => {
  const calculatedThreshold = screenWidth * SCREEN_THRESHOLD_RATIO;
  return Math.max(MIN_SWIPE_THRESHOLD, Math.min(BASE_SWIPE_THRESHOLD, calculatedThreshold));
};

// =============================================================================
// TYPES
// =============================================================================

interface SwipeCardProps {
  children: React.ReactNode;
  onSwipe: (direction: SwipeDirection) => void;
  onSwipeStart?: () => void;
  onSwipeCancel?: () => void;
  onInfoClick?: () => void;
  onMakeOffer?: () => void;
  className?: string;
  disabled?: boolean;
  index?: number;
  isTopCard?: boolean;
  /** Whether the card is flipped to show back */
  isFlipped?: boolean;
  /** Callback when user wants to flip back */
  onFlipBack?: () => void;
  /** Accessible label for the card */
  ariaLabel?: string;
  /** Deal data for the back of card - passed through children context */
  dealData?: {
    price: number;
    arv?: number;
    equity?: number;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    wholesalerName?: string;
    wholesalerPhone?: string;
    wholesalerEmail?: string;
    repairEstimate?: number;
    propertyType?: string;
    description?: string;
  };
}

export function SwipeCard({
  children,
  onSwipe,
  onSwipeStart,
  onSwipeCancel,
  onInfoClick,
  onMakeOffer,
  className,
  disabled = false,
  index = 0,
  isTopCard = true,
  isFlipped = false,
  onFlipBack,
  ariaLabel,
  dealData,
}: SwipeCardProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [exitDirection, setExitDirection] = useState<SwipeDirection | null>(null);
  const [swipeThreshold, setSwipeThreshold] = useState(BASE_SWIPE_THRESHOLD);
  const [showDoubleTapHeart, setShowDoubleTapHeart] = useState(false);
  const [showSuperLikeStar, setShowSuperLikeStar] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<number>(0);
  const superLikeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeouts on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (superLikeTimeoutRef.current) {
        clearTimeout(superLikeTimeoutRef.current);
      }
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);
  const prefersReducedMotion = useReducedMotion();

  // Motion values for drag
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const controls = useAnimation();

  // Update threshold on screen resize
  useEffect(() => {
    const updateThreshold = () => {
      setSwipeThreshold(getResponsiveThreshold(window.innerWidth));
    };
    updateThreshold();
    window.addEventListener('resize', updateThreshold);
    return () => window.removeEventListener('resize', updateThreshold);
  }, []);

  // Keyboard navigation for accessibility
  useEffect(() => {
    if (!isTopCard || disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if card or its children are focused
      if (!cardRef.current?.contains(document.activeElement) && document.activeElement !== cardRef.current) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          triggerSwipe('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          triggerSwipe('right');
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleSuperLikeClick();
          break;
        case 'Enter':
        case ' ':
          if (onInfoClick) {
            e.preventDefault();
            onInfoClick();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTopCard, disabled, onInfoClick]);

  // Transform drag distance to rotation and opacity
  const rotate = useTransform(x, [-300, 0, 300], [-MAX_ROTATION, 0, MAX_ROTATION]);
  const likeOpacity = useTransform(x, [0, swipeThreshold], [0, 1]);
  const passOpacity = useTransform(x, [-swipeThreshold, 0], [1, 0]);
  const superLikeOpacity = useTransform(y, [-SUPER_LIKE_THRESHOLD, 0], [1, 0]);

  // Velocity-based scale for overlay (more intense swipe = bigger indicator)
  const likeScale = useTransform(x, [0, swipeThreshold, swipeThreshold * 1.5], [0.8, 1, 1.15]);
  const passScale = useTransform(x, [-swipeThreshold * 1.5, -swipeThreshold, 0], [1.15, 1, 0.8]);
  const superLikeScale = useTransform(y, [-SUPER_LIKE_THRESHOLD * 1.5, -SUPER_LIKE_THRESHOLD, 0], [1.15, 1, 0.8]);

  // Background card scale effect (cards behind scale up as top card moves)
  const scale = isTopCard ? 1 : 0.95 - index * 0.02;
  const translateY = isTopCard ? 0 : 10 + index * 5;

  const handleDragStart = useCallback(() => {
    triggerHaptic('light');
    onSwipeStart?.();
  }, [onSwipeStart]);

  const handleDragEnd = useCallback(
    async (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset, velocity } = info;

      // Check if swipe exceeds threshold (position or velocity)
      const swipedRight = offset.x > swipeThreshold || velocity.x > VELOCITY_THRESHOLD;
      const swipedLeft = offset.x < -swipeThreshold || velocity.x < -VELOCITY_THRESHOLD;
      const swipedUp = offset.y < -SUPER_LIKE_THRESHOLD || velocity.y < -SUPER_LIKE_VELOCITY_THRESHOLD;

      // Super Like takes priority if swiped up
      if (swipedUp && Math.abs(offset.y) > Math.abs(offset.x)) {
        setExitDirection('up');
        setIsExiting(true);
        triggerHaptic('heavy');

        // Animate card up and out
        const exitAnimation = prefersReducedMotion
          ? { y: -EXIT_DISTANCE, opacity: 0 }
          : {
              y: -EXIT_DISTANCE,
              x: offset.x * 0.3,
              scale: 1.1,
              opacity: 0,
            };

        await controls.start({
          ...exitAnimation,
          transition: { duration: prefersReducedMotion ? 0.15 : 0.4, ease: 'easeOut' },
        });

        onSwipe('up');
      } else if (swipedRight || swipedLeft) {
        const direction: SwipeDirection = swipedRight ? 'right' : 'left';
        setExitDirection(direction);
        setIsExiting(true);
        triggerHaptic('medium');

        // Animate card off screen (or instant if reduced motion)
        const exitAnimation = prefersReducedMotion
          ? { x: direction === 'right' ? EXIT_DISTANCE : -EXIT_DISTANCE, opacity: 0 }
          : {
              x: direction === 'right' ? EXIT_DISTANCE : -EXIT_DISTANCE,
              y: offset.y,
              rotate: direction === 'right' ? EXIT_ROTATION : -EXIT_ROTATION,
              opacity: 0,
            };

        await controls.start({
          ...exitAnimation,
          transition: { duration: prefersReducedMotion ? 0.15 : 0.3, ease: 'easeOut' },
        });

        onSwipe(direction);
      } else {
        // Rubber band back to center
        onSwipeCancel?.();
        controls.start({
          x: 0,
          y: 0,
          rotate: 0,
          transition: prefersReducedMotion
            ? { duration: 0.15 }
            : { type: 'spring', stiffness: SPRING_STIFFNESS, damping: SPRING_DAMPING },
        });
      }
    },
    [controls, onSwipe, onSwipeCancel, swipeThreshold, prefersReducedMotion]
  );

  // Programmatic swipe (for button clicks and keyboard)
  const triggerSwipe = useCallback(
    async (direction: SwipeDirection) => {
      if (disabled || isExiting) return;

      setExitDirection(direction);
      setIsExiting(true);
      triggerHaptic(direction === 'up' ? 'heavy' : 'medium');

      let exitAnimation;
      if (direction === 'up') {
        // Super Like animation - goes up with scale
        exitAnimation = prefersReducedMotion
          ? { y: -EXIT_DISTANCE, opacity: 0 }
          : {
              y: -EXIT_DISTANCE,
              scale: 1.1,
              opacity: 0,
            };
      } else {
        // Regular like/pass animation
        exitAnimation = prefersReducedMotion
          ? { x: direction === 'right' ? EXIT_DISTANCE : -EXIT_DISTANCE, opacity: 0 }
          : {
              x: direction === 'right' ? EXIT_DISTANCE : -EXIT_DISTANCE,
              rotate: direction === 'right' ? EXIT_ROTATION : -EXIT_ROTATION,
              opacity: 0,
            };
      }

      await controls.start({
        ...exitAnimation,
        transition: { duration: prefersReducedMotion ? 0.15 : 0.4, ease: 'easeOut' },
      });

      onSwipe(direction);
    },
    [controls, disabled, isExiting, onSwipe, prefersReducedMotion]
  );

  // Expose trigger function via ref pattern
  const handleLikeClick = () => triggerSwipe('right');
  const handlePassClick = () => triggerSwipe('left');
  const handleSuperLikeClick = () => {
    if (!disabled && !isExiting) {
      setShowSuperLikeStar(true);
      // Clear any existing timeout
      if (superLikeTimeoutRef.current) {
        clearTimeout(superLikeTimeoutRef.current);
      }
      superLikeTimeoutRef.current = setTimeout(() => {
        superLikeTimeoutRef.current = null;
        setShowSuperLikeStar(false);
        triggerSwipe('up');
      }, 400);
    }
  };

  // Double-tap to like (Instagram-style)
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    if (timeSinceLastTap < DOUBLE_TAP_DELAY && timeSinceLastTap > 0) {
      // Double tap detected!
      if (!disabled && !isExiting) {
        setShowDoubleTapHeart(true);
        triggerHaptic('heavy');

        // Clear any existing timeout
        if (doubleTapTimeoutRef.current) {
          clearTimeout(doubleTapTimeoutRef.current);
        }
        // Hide heart after animation
        doubleTapTimeoutRef.current = setTimeout(() => {
          doubleTapTimeoutRef.current = null;
          setShowDoubleTapHeart(false);
          triggerSwipe('right');
        }, 400);
      }
      lastTapRef.current = 0; // Reset to prevent triple-tap
    } else {
      lastTapRef.current = now;
    }
  }, [disabled, isExiting]);

  if (!isTopCard) {
    // Background cards - no interaction, hidden from screen readers
    return (
      <motion.div
        className={cn(
          'absolute inset-0 rounded-2xl bg-card shadow-xl',
          className
        )}
        style={{
          scale,
          y: translateY,
          zIndex: -index,
        }}
        initial={{ scale, y: translateY }}
        aria-hidden="true"
      >
        {children}
      </motion.div>
    );
  }

  // Format currency for back of card
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          ref={cardRef}
          className={cn(
            'absolute inset-0 touch-none cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            className
          )}
          style={{ x, y, rotate: isFlipped ? 0 : rotate, zIndex: 10, perspective: 1000 }}
          drag={!disabled && !isFlipped}
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragDirectionLock={false}
          dragElastic={0.9}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onTap={isFlipped ? undefined : handleDoubleTap}
          animate={controls}
          initial={{ scale: 0.95, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 300, damping: 25 }}
          tabIndex={0}
          role="article"
          aria-label={ariaLabel || 'Swipeable deal card. Use arrow keys to like or pass. Double-tap to like.'}
          aria-describedby="swipe-instructions"
        >
          {/* Screen reader instructions */}
          <span id="swipe-instructions" className="sr-only">
            Press right arrow to like, left arrow to pass, up arrow to super like, Enter or Space for more info.
          </span>

          {/* 3D Flip Container */}
          <div className="relative h-full w-full" style={{ transformStyle: 'preserve-3d' }}>
            {/* Front of card */}
            <motion.div
              className="absolute inset-0 overflow-hidden rounded-2xl bg-card shadow-2xl"
              style={{ backfaceVisibility: 'hidden' }}
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            >
              {children}

              {/* Like indicator overlay */}
              <motion.div
                className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-4 border-green-500 bg-green-500/20"
                style={{ opacity: likeOpacity }}
                aria-hidden="true"
              >
                <motion.div
                  className="rounded-xl bg-green-500 px-8 py-4 shadow-lg"
                  style={{ scale: likeScale }}
                >
                  <span className="text-4xl font-bold text-foreground">LIKE</span>
                </motion.div>
              </motion.div>

              {/* Pass indicator overlay */}
              <motion.div
                className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-4 border-red-500 bg-red-500/20"
                style={{ opacity: passOpacity }}
                aria-hidden="true"
              >
                <motion.div
                  className="rounded-xl bg-red-500 px-8 py-4 shadow-lg"
                  style={{ scale: passScale }}
                >
                  <span className="text-4xl font-bold text-foreground">PASS</span>
                </motion.div>
              </motion.div>

              {/* Super Like indicator overlay */}
              <motion.div
                className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-4 border-cyan-500 bg-gradient-to-t from-cyan-500/30 to-accent-500/30"
                style={{ opacity: superLikeOpacity }}
                aria-hidden="true"
              >
                <motion.div
                  className="flex flex-col items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-accent-500 px-8 py-4 shadow-lg"
                  style={{ scale: superLikeScale }}
                >
                  <Star className="h-10 w-10 fill-white text-foreground" />
                  <span className="text-3xl font-bold text-foreground">SUPER LIKE</span>
                </motion.div>
              </motion.div>

              {/* Double-tap heart animation (Instagram-style) */}
              <AnimatePresence>
                {showDoubleTapHeart && (
                  <motion.div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.5 }}
                    transition={{ duration: 0.3 }}
                    aria-hidden="true"
                  >
                    <Heart className="h-32 w-32 fill-white text-foreground drop-shadow-lg" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Super Like star animation */}
              <AnimatePresence>
                {showSuperLikeStar && (
                  <motion.div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0, rotate: -180 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 2, y: -100 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    aria-hidden="true"
                  >
                    <div className="relative">
                      <Star className="h-32 w-32 fill-cyan-400 text-cyan-400 drop-shadow-lg" />
                      {/* Sparkle effects */}
                      <motion.div
                        className="absolute -top-4 -right-4"
                        initial={{ scale: 0 }}
                        animate={{ scale: [0, 1.2, 0] }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                      >
                        <Zap className="h-8 w-8 fill-yellow-300 text-yellow-300" />
                      </motion.div>
                      <motion.div
                        className="absolute -bottom-2 -left-4"
                        initial={{ scale: 0 }}
                        animate={{ scale: [0, 1, 0] }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                      >
                        <Zap className="h-6 w-6 fill-yellow-300 text-yellow-300" />
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Back of card - Deal Details */}
            <motion.div
              className="absolute inset-0 overflow-hidden rounded-2xl bg-card shadow-2xl"
              style={{ backfaceVisibility: 'hidden', rotateY: 180 }}
              animate={{ rotateY: isFlipped ? 0 : -180 }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="flex h-full flex-col">
                {/* Back header */}
                <div className="flex items-center justify-between border-b bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3">
                  <h3 className="text-lg font-bold">Deal Details</h3>
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFlipBack?.();
                    }}
                    className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/80"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <RotateCw className="h-4 w-4" />
                    Flip Back
                  </motion.button>
                </div>

                {/* Back content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {/* Financial breakdown */}
                  <div className="mb-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 p-4 dark:from-green-950/30 dark:to-emerald-950/30">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
                      <Calculator className="h-4 w-4" />
                      Financial Analysis
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {dealData?.price && (
                        <div className="rounded-lg bg-white/60 p-2 dark:bg-background/20">
                          <div className="text-xs text-muted-foreground">Asking Price</div>
                          <div className="font-bold text-green-600">{formatPrice(dealData.price)}</div>
                        </div>
                      )}
                      {dealData?.arv && (
                        <div className="rounded-lg bg-white/60 p-2 dark:bg-background/20">
                          <div className="text-xs text-muted-foreground">ARV</div>
                          <div className="font-bold text-green-600">{formatPrice(dealData.arv)}</div>
                        </div>
                      )}
                      {dealData?.repairEstimate && (
                        <div className="rounded-lg bg-white/60 p-2 dark:bg-background/20">
                          <div className="text-xs text-muted-foreground">Repair Estimate</div>
                          <div className="font-bold text-amber-600">{formatPrice(dealData.repairEstimate)}</div>
                        </div>
                      )}
                      {dealData?.arv && dealData?.price && (
                        <div className="rounded-lg bg-white/60 p-2 dark:bg-background/20">
                          <div className="text-xs text-muted-foreground">Potential Profit</div>
                          <div className="font-bold text-green-600">
                            {formatPrice(dealData.arv - dealData.price - (dealData.repairEstimate || 0))}
                          </div>
                        </div>
                      )}
                      {dealData?.equity && (
                        <div className="rounded-lg bg-white/60 p-2 dark:bg-background/20">
                          <div className="text-xs text-muted-foreground">Equity</div>
                          <div className="font-bold text-green-600">{dealData.equity}%</div>
                        </div>
                      )}
                      {dealData?.arv && dealData?.price && (
                        <div className="rounded-lg bg-white/60 p-2 dark:bg-background/20">
                          <div className="text-xs text-muted-foreground">ROI</div>
                          <div className="font-bold text-green-600">
                            {Math.round(((dealData.arv - dealData.price) / dealData.price) * 100)}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Property info */}
                  <div className="mb-4 rounded-xl bg-muted/50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Building className="h-4 w-4" />
                      Property Information
                    </div>
                    {dealData?.address && (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <span>{dealData.address}, {dealData.city}, {dealData.state} {dealData.zip}</span>
                      </div>
                    )}
                    {dealData?.propertyType && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        Type: <span className="font-medium text-foreground">{dealData.propertyType}</span>
                      </div>
                    )}
                    {dealData?.description && (
                      <p className="mt-3 text-sm text-muted-foreground">{dealData.description}</p>
                    )}
                  </div>

                  {/* Wholesaler contact */}
                  {dealData?.wholesalerName && (
                    <div className="rounded-xl border p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <FileText className="h-4 w-4" />
                        Wholesaler Contact
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="font-medium">{dealData.wholesalerName}</div>
                        {dealData.wholesalerPhone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-4 w-4" />
                            {dealData.wholesalerPhone}
                          </div>
                        )}
                        {dealData.wholesalerEmail && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-4 w-4" />
                            {dealData.wholesalerEmail}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Back footer with CTA */}
                <div className="border-t bg-muted/30 p-4">
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMakeOffer?.();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <DollarSign className="h-5 w-5" />
                    Make an Offer
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Action buttons - only show when not flipped */}
          {!isFlipped && (
            <div className="absolute -bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-4" role="group" aria-label="Card actions">
              {/* Pass button */}
              <motion.button
                onClick={handlePassClick}
                disabled={disabled}
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500 bg-card text-red-500 shadow-lg transition-colors hover:bg-red-500 hover:text-foreground disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                whileHover={prefersReducedMotion ? {} : { scale: 1.1 }}
                whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                aria-label="Pass on this deal"
              >
                <X className="h-8 w-8" aria-hidden="true" />
              </motion.button>

              {/* Info/Flip button */}
              {onInfoClick && (
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    onInfoClick();
                  }}
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-accent-500 bg-card text-accent-500 shadow-lg transition-colors hover:bg-accent-500 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
                  whileHover={prefersReducedMotion ? {} : { scale: 1.1 }}
                  whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                  aria-label="Flip card for more details"
                >
                  <RotateCw className="h-6 w-6" aria-hidden="true" />
                </motion.button>
              )}

              {/* Super Like button */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSuperLikeClick();
                }}
                disabled={disabled}
                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-cyan-500 bg-card text-cyan-500 shadow-lg transition-colors hover:bg-gradient-to-r hover:from-cyan-500 hover:to-accent-500 hover:text-foreground hover:border-transparent disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
                whileHover={prefersReducedMotion ? {} : { scale: 1.15, y: -4 }}
                whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                aria-label="Super Like this deal"
              >
                <Star className="h-7 w-7" aria-hidden="true" />
              </motion.button>

              {/* Like button */}
              <motion.button
                onClick={handleLikeClick}
                disabled={disabled}
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-green-500 bg-card text-green-500 shadow-lg transition-colors hover:bg-green-500 hover:text-foreground disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                whileHover={prefersReducedMotion ? {} : { scale: 1.1 }}
                whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                aria-label="Like this deal"
              >
                <Heart className="h-8 w-8" aria-hidden="true" />
              </motion.button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Standalone action buttons for use outside the card
interface SwipeActionsProps {
  onPass: () => void;
  onLike: () => void;
  onSuperLike?: () => void;
  onUndo?: () => void;
  onInfo?: () => void;
  disabled?: boolean;
  canUndo?: boolean;
  className?: string;
}

export function SwipeActions({
  onPass,
  onLike,
  onSuperLike,
  onUndo,
  onInfo,
  disabled = false,
  canUndo = false,
  className,
}: SwipeActionsProps) {
  const prefersReducedMotion = useReducedMotion();

  const handlePass = () => {
    triggerHaptic('medium');
    onPass();
  };

  const handleLike = () => {
    triggerHaptic('medium');
    onLike();
  };

  const handleSuperLike = () => {
    triggerHaptic('heavy');
    onSuperLike?.();
  };

  const handleUndo = () => {
    triggerHaptic('light');
    onUndo?.();
  };

  return (
    <div className={cn('flex items-center justify-center gap-3', className)} role="group" aria-label="Deal actions">
      {/* Undo button */}
      {onUndo && (
        <motion.button
          onClick={handleUndo}
          disabled={!canUndo || disabled}
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-amber-500 bg-card text-amber-500 shadow-lg transition-colors hover:bg-amber-500 hover:text-foreground disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          whileHover={prefersReducedMotion ? {} : { scale: canUndo ? 1.1 : 1 }}
          whileTap={prefersReducedMotion ? {} : { scale: canUndo ? 0.95 : 1 }}
          aria-label="Undo last pass"
        >
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </motion.button>
      )}

      {/* Pass button */}
      <motion.button
        onClick={handlePass}
        disabled={disabled}
        className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-500 bg-card text-red-500 shadow-lg transition-colors hover:bg-red-500 hover:text-foreground disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
        whileHover={prefersReducedMotion ? {} : { scale: 1.1 }}
        whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
        aria-label="Pass on this deal"
      >
        <X className="h-7 w-7" aria-hidden="true" />
      </motion.button>

      {/* Super Like button */}
      {onSuperLike && (
        <motion.button
          onClick={handleSuperLike}
          disabled={disabled}
          className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-cyan-500 bg-card text-cyan-500 shadow-lg transition-colors hover:bg-gradient-to-r hover:from-cyan-500 hover:to-accent-500 hover:text-foreground hover:border-transparent disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
          whileHover={prefersReducedMotion ? {} : { scale: 1.15, y: -4 }}
          whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
          aria-label="Super Like this deal"
        >
          <Star className="h-6 w-6" aria-hidden="true" />
        </motion.button>
      )}

      {/* Info button */}
      {onInfo && (
        <motion.button
          onClick={onInfo}
          disabled={disabled}
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-accent-500 bg-card text-accent-500 shadow-lg transition-colors hover:bg-accent-500 hover:text-foreground disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
          whileHover={prefersReducedMotion ? {} : { scale: 1.1 }}
          whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
          aria-label="View more information and make offer"
        >
          <Info className="h-5 w-5" aria-hidden="true" />
        </motion.button>
      )}

      {/* Like button */}
      <motion.button
        onClick={handleLike}
        disabled={disabled}
        className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-500 bg-card text-green-500 shadow-lg transition-colors hover:bg-green-500 hover:text-foreground disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
        whileHover={prefersReducedMotion ? {} : { scale: 1.1 }}
        whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
        aria-label="Like this deal"
      >
        <Heart className="h-7 w-7" aria-hidden="true" />
      </motion.button>
    </div>
  );
}
