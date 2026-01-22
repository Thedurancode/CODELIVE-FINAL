'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Sparkles, Target, Trophy, Heart, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MatchInfo, MatchType, MarketplaceDeal } from '@/types/marketplace';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface MatchCelebrationProps {
  isOpen: boolean;
  onClose: () => void;
  matchInfo: MatchInfo;
  deal: MarketplaceDeal;
  onMakeOffer: () => void;
  onViewDeal: () => void;
}

// =============================================================================
// CONFETTI PARTICLES
// =============================================================================

const PARTICLE_COLORS = {
  super_like: ['#00d4ff', '#0ea5e9', '#7dd3fc', '#38bdf8', '#ffffff'],
  ml_prediction: ['#a855f7', '#d946ef', '#f0abfc', '#e879f9', '#ffffff'],
  buybox_score: ['#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#ffffff'],
  priority_match: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#ffffff'],
};

const MATCH_ICONS: Record<MatchType, typeof Star> = {
  super_like: Star,
  ml_prediction: Target,
  buybox_score: Sparkles,
  priority_match: Trophy,
};

const MATCH_GRADIENTS: Record<MatchType, string> = {
  super_like: 'from-cyan-500 via-accent-500 to-cyan-400',
  ml_prediction: 'from-purple-500 via-pink-500 to-purple-400',
  buybox_score: 'from-green-500 via-emerald-500 to-green-400',
  priority_match: 'from-amber-500 via-orange-500 to-amber-400',
};

// =============================================================================
// CONFETTI PARTICLE COMPONENT
// =============================================================================

function ConfettiParticle({
  index,
  color,
  matchType,
}: {
  index: number;
  color: string;
  matchType: MatchType;
}) {
  const randomX = Math.random() * 100;
  const randomDelay = Math.random() * 0.5;
  const randomDuration = 2 + Math.random() * 2;
  const randomSize = 4 + Math.random() * 8;
  const randomRotation = Math.random() * 360;

  return (
    <motion.div
      className="absolute"
      initial={{
        x: `${randomX}vw`,
        y: -20,
        rotate: 0,
        scale: 0,
      }}
      animate={{
        y: '100vh',
        rotate: randomRotation + 360,
        scale: [0, 1, 1, 0.5],
      }}
      transition={{
        duration: randomDuration,
        delay: randomDelay,
        ease: 'easeOut',
      }}
      style={{
        width: randomSize,
        height: randomSize,
        backgroundColor: color,
        borderRadius: index % 2 === 0 ? '50%' : '2px',
      }}
    />
  );
}

// =============================================================================
// SPARKLING STARS COMPONENT
// =============================================================================

function SparklingStars({ matchType }: { matchType: MatchType }) {
  const colors = PARTICLE_COLORS[matchType];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 20 }).map((_, i) => {
        const randomX = 10 + Math.random() * 80;
        const randomY = 10 + Math.random() * 80;
        const randomDelay = Math.random() * 2;
        const randomScale = 0.5 + Math.random() * 0.5;

        return (
          <motion.div
            key={i}
            className="absolute"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, randomScale, 0],
            }}
            transition={{
              duration: 1.5,
              delay: randomDelay,
              repeat: Infinity,
              repeatDelay: Math.random() * 2,
            }}
            style={{
              left: `${randomX}%`,
              top: `${randomY}%`,
            }}
          >
            <Star
              className="h-4 w-4"
              style={{ color: colors[i % colors.length] }}
              fill="currentColor"
            />
          </motion.div>
        );
      })}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function MatchCelebration({
  isOpen,
  onClose,
  matchInfo,
  deal,
  onMakeOffer,
  onViewDeal,
}: MatchCelebrationProps) {
  const matchType = matchInfo.matchType || 'buybox_score';
  const MatchIcon = MATCH_ICONS[matchType];
  const gradient = MATCH_GRADIENTS[matchType];
  const colors = PARTICLE_COLORS[matchType];

  // Trigger haptic feedback on mobile
  useEffect(() => {
    if (isOpen && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      // Pattern: celebration vibration
      navigator.vibrate([100, 50, 100, 50, 200]);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Format price
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Confetti */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 50 }).map((_, i) => (
              <ConfettiParticle
                key={i}
                index={i}
                color={colors[i % colors.length]}
                matchType={matchType}
              />
            ))}
          </div>

          {/* Sparkling Stars */}
          <SparklingStars matchType={matchType} />

          {/* Main Content */}
          <motion.div
            className="relative z-10 mx-4 max-w-sm w-full"
            initial={{ scale: 0.5, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 50 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 20,
            }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute -top-2 -right-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-foreground backdrop-blur-sm hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Card */}
            <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-card to-card/90 shadow-2xl border border-white/10">
              {/* Header with gradient */}
              <div className={cn('relative px-6 py-8 bg-gradient-to-r', gradient)}>
                {/* Icon */}
                <motion.div
                  className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', delay: 0.2, stiffness: 200 }}
                >
                  <MatchIcon className="h-10 w-10 text-foreground" fill="currentColor" />
                </motion.div>

                {/* Title */}
                <motion.h2
                  className="text-center text-2xl font-bold text-foreground"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  It&apos;s a Match!
                </motion.h2>

                {/* Match score */}
                <motion.div
                  className="mt-2 text-center text-foreground/90"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <span className="text-4xl font-bold">{Math.round(matchInfo.matchScore)}%</span>
                  <span className="ml-1 text-sm">match</span>
                </motion.div>
              </div>

              {/* Deal info */}
              <motion.div
                className="px-6 py-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                {/* Price and location */}
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {formatPrice(deal.deal.price)}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {deal.deal.city}, {deal.deal.state}
                  </div>
                </div>

                {/* Match reasons */}
                <div className="mt-4 space-y-2">
                  {matchInfo.matchReasons.slice(0, 3).map((reason, i) => (
                    <motion.div
                      key={i}
                      className="flex items-center gap-2 text-sm"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.1 }}
                    >
                      <div className={cn('flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-r', gradient)}>
                        <Sparkles className="h-3 w-3 text-foreground" />
                      </div>
                      <span className="text-muted-foreground">{reason}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Celebration message */}
                {matchInfo.celebrationMessage && (
                  <motion.p
                    className="mt-4 text-center text-sm text-muted-foreground"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9 }}
                  >
                    {matchInfo.celebrationMessage.replace(/^[^\s]+\s/, '')}
                  </motion.p>
                )}
              </motion.div>

              {/* Actions */}
              <motion.div
                className="border-t px-6 py-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
              >
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      onClose();
                      onViewDeal();
                    }}
                  >
                    <Heart className="mr-2 h-4 w-4" />
                    View Deal
                  </Button>
                  <Button
                    className={cn('flex-1 bg-gradient-to-r text-foreground hover:opacity-90', gradient)}
                    onClick={() => {
                      onClose();
                      onMakeOffer();
                    }}
                  >
                    Make Offer
                  </Button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
