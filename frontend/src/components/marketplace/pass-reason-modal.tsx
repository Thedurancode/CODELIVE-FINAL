'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  DollarSign,
  MapPin,
  Wrench,
  TrendingDown,
  Home,
  Minimize2,
  Maximize2,
  Building,
  FileWarning,
  Copy,
  Wallet,
  HelpCircle,
  Clock,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { PassReason } from '@/types/marketplace';

// =============================================================================
// CONSTANTS
// =============================================================================

const PASS_REASON_OPTIONS: { value: PassReason; label: string; icon: React.ElementType }[] = [
  { value: 'price_too_high', label: 'Price too high', icon: DollarSign },
  { value: 'location_not_ideal', label: 'Location not ideal', icon: MapPin },
  { value: 'property_condition', label: 'Property condition', icon: Wrench },
  { value: 'not_enough_equity', label: 'Not enough equity', icon: TrendingDown },
  { value: 'wrong_property_type', label: 'Wrong property type', icon: Home },
  { value: 'too_small', label: 'Too small', icon: Minimize2 },
  { value: 'too_large', label: 'Too large', icon: Maximize2 },
  { value: 'bad_neighborhood', label: 'Neighborhood concerns', icon: Building },
  { value: 'title_issues', label: 'Title issues', icon: FileWarning },
  { value: 'already_have_similar', label: 'Have similar property', icon: Copy },
  { value: 'over_budget', label: 'Over my budget', icon: Wallet },
  { value: 'other', label: 'Other reason', icon: HelpCircle },
];

/** Maximum number of recent reasons to show for quick access */
const MAX_RECENT_REASONS = 3;
/** Local storage key for recent reasons */
const RECENT_REASONS_KEY = 'dispotree-recent-pass-reasons';

// =============================================================================
// UTILITIES
// =============================================================================

/** Get recent pass reasons from local storage */
const getRecentReasons = (): PassReason[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_REASONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

/** Save a reason to recent reasons in local storage */
const saveRecentReason = (reason: PassReason): void => {
  if (typeof window === 'undefined' || reason === 'other') return;
  try {
    const recent = getRecentReasons().filter((r) => r !== reason);
    const updated = [reason, ...recent].slice(0, MAX_RECENT_REASONS);
    localStorage.setItem(RECENT_REASONS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
};

// =============================================================================
// COMPONENT
// =============================================================================

interface PassReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason?: PassReason, customReason?: string) => void;
  dealAddress?: string;
}

export function PassReasonModal({
  open,
  onOpenChange,
  onSubmit,
  dealAddress,
}: PassReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState<PassReason | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [recentReasons, setRecentReasons] = useState<PassReason[]>([]);
  const prefersReducedMotion = useReducedMotion();

  // Load recent reasons on mount
  useEffect(() => {
    setRecentReasons(getRecentReasons());
  }, []);

  // Get quick access reasons (recent + most common)
  const quickAccessReasons = useMemo(() => {
    const recentOptions = recentReasons
      .map((r) => PASS_REASON_OPTIONS.find((o) => o.value === r))
      .filter(Boolean) as typeof PASS_REASON_OPTIONS;

    return recentOptions.slice(0, MAX_RECENT_REASONS);
  }, [recentReasons]);

  // Get remaining reasons (exclude quick access)
  const remainingReasons = useMemo(() => {
    const quickValues = new Set(quickAccessReasons.map((r) => r.value));
    return PASS_REASON_OPTIONS.filter((o) => !quickValues.has(o.value));
  }, [quickAccessReasons]);

  const handleReasonSelect = useCallback((reason: PassReason) => {
    setSelectedReason(reason);
  }, []);

  const handleSubmit = useCallback(() => {
    if (selectedReason) {
      saveRecentReason(selectedReason);
    }
    onSubmit(
      selectedReason || undefined,
      selectedReason === 'other' ? customReason : undefined
    );
    // Reset state
    setSelectedReason(null);
    setCustomReason('');
    onOpenChange(false);
  }, [selectedReason, customReason, onSubmit, onOpenChange]);

  const handleQuickPass = useCallback(
    (reason: PassReason) => {
      saveRecentReason(reason);
      onSubmit(reason);
      setSelectedReason(null);
      setCustomReason('');
      onOpenChange(false);
    },
    [onSubmit, onOpenChange]
  );

  const handleSkip = useCallback(() => {
    onSubmit();
    setSelectedReason(null);
    setCustomReason('');
    onOpenChange(false);
  }, [onSubmit, onOpenChange]);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.03,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby="pass-reason-description">
        <DialogHeader>
          <DialogTitle>Why are you passing?</DialogTitle>
          <DialogDescription id="pass-reason-description">
            Help us improve your recommendations by telling us why this deal isn&apos;t right for you.
            {dealAddress && (
              <span className="mt-1 block text-xs text-muted-foreground">{dealAddress}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Quick access section for recent reasons */}
        {quickAccessReasons.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="h-3 w-3" aria-hidden="true" />
              <span>Quick pass</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickAccessReasons.map((option) => {
                const Icon = option.icon;
                return (
                  <motion.button
                    key={option.value}
                    onClick={() => handleQuickPass(option.value)}
                    className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary hover:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
                    whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                    aria-label={`Quick pass: ${option.label}`}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {option.label}
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* Divider if quick access exists */}
        {quickAccessReasons.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or select a reason</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        {/* All reasons grid */}
        <motion.div
          className="grid grid-cols-2 gap-2 py-2"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          role="radiogroup"
          aria-label="Pass reasons"
        >
          {remainingReasons.map((option, index) => {
            const Icon = option.icon;
            const isSelected = selectedReason === option.value;

            return (
              <motion.button
                key={option.value}
                variants={itemVariants}
                onClick={() => handleReasonSelect(option.value)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50 hover:bg-muted'
                )}
                whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
                whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
                role="radio"
                aria-checked={isSelected}
                aria-label={option.label}
              >
                <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="line-clamp-1">{option.label}</span>
              </motion.button>
            );
          })}
        </motion.div>

        {/* Custom reason textarea */}
        <AnimatePresence>
          {selectedReason === 'other' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
            >
              <Textarea
                placeholder="Tell us more about why you're passing..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="resize-none"
                rows={3}
                aria-label="Custom reason"
                autoFocus
              />
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={selectedReason === 'other' && !customReason.trim()}
          >
            {selectedReason ? 'Submit Feedback' : 'Pass Without Reason'}
          </Button>
          <Button variant="ghost" onClick={handleSkip} className="w-full">
            Skip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
