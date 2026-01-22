'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation, PanInfo } from 'framer-motion';
import {
  Heart,
  SlidersHorizontal,
  RefreshCw,
  Loader2,
  AlertCircle,
  Sparkles,
  RotateCcw,
  WifiOff,
  ArrowDown,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SwipeCard, SwipeActions } from './swipe-card';
import { DealCard } from './deal-card';
import { PassReasonModal } from './pass-reason-modal';
import { OfferModal } from './offer-modal';
import { LikedDealsDrawer } from './liked-deals-drawer';
import { MatchCelebration } from './match-celebration';
import { useMarketplaceStore } from '@/stores/marketplace-store';
import {
  useMarketplaceFeed,
  useSwipeDeal,
  useRecordView,
  useCreateOffer,
  useSaveDeal,
} from '@/hooks/use-marketplace';
import type { MarketplaceDeal, SwipeDirection, PassReason, OfferRequest, MatchInfo } from '@/types/marketplace';
import { cn } from '@/lib/utils';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum retry attempts for failed API calls */
const MAX_RETRY_ATTEMPTS = 3;
/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY = 1000;
/** Pull-to-refresh threshold in pixels */
const PULL_REFRESH_THRESHOLD = 80;
/** Maximum pull distance */
const MAX_PULL_DISTANCE = 120;

// =============================================================================
// UTILITIES
// =============================================================================

/** Exponential backoff delay calculation */
const getRetryDelay = (attempt: number): number => {
  return RETRY_BASE_DELAY * Math.pow(2, attempt);
};

/** Sleep utility for retry delays */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/** Preload images for upcoming cards */
const preloadImages = (deals: MarketplaceDeal[], startIndex: number, count: number = 2): void => {
  const dealsToPreload = deals.slice(startIndex, startIndex + count);
  dealsToPreload.forEach((deal) => {
    const photos = deal.deal.photos || [];
    photos.slice(0, 2).forEach((photoUrl) => {
      const img = new Image();
      img.src = photoUrl;
    });
  });
};

/** Offline swipe queue key */
const OFFLINE_QUEUE_KEY = 'dispotree-offline-swipe-queue';

interface QueuedSwipe {
  dealId: string;
  action: 'like' | 'pass' | 'super_like';
  passReason?: string;
  passReasonCustom?: string;
  viewDuration: number;
  timestamp: number;
}

/** Get queued swipes from localStorage */
const getQueuedSwipes = (): QueuedSwipe[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

/** Add swipe to offline queue */
const queueSwipe = (swipe: QueuedSwipe): void => {
  if (typeof window === 'undefined') return;
  try {
    const queue = getQueuedSwipes();
    queue.push(swipe);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage errors
  }
};

/** Clear offline queue */
const clearQueue = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    // Ignore
  }
};

// =============================================================================
// TYPES
// =============================================================================

interface MarketplaceSwipeProps {
  userId: string;
}

export function MarketplaceSwipe({ userId }: MarketplaceSwipeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);
  const viewStartTimeRef = useRef<number>(Date.now());

  // Match celebration state
  const [showMatchCelebration, setShowMatchCelebration] = useState(false);
  const [currentMatchInfo, setCurrentMatchInfo] = useState<MatchInfo | null>(null);
  const [matchedDeal, setMatchedDeal] = useState<MarketplaceDeal | null>(null);

  // Pull-to-refresh motion values
  const pullY = useMotionValue(0);
  const pullControls = useAnimation();
  const pullOpacity = useTransform(pullY, [0, PULL_REFRESH_THRESHOLD], [0, 1]);
  const pullRotation = useTransform(pullY, [0, PULL_REFRESH_THRESHOLD], [0, 180]);
  const pullScale = useTransform(pullY, [0, PULL_REFRESH_THRESHOLD / 2, PULL_REFRESH_THRESHOLD], [0.5, 0.8, 1]);

  // Store state
  const {
    likedDeals,
    addLikedDeal,
    addPassedDeal,
    undoLastPass,
    recentlyPassedDeals,
    markDealAsOffered,
    activeFilters,
    setFilters,
    isLikedDrawerOpen,
    setLikedDrawerOpen,
    showPassReasonModal,
    setShowPassReasonModal,
    showOfferModal,
    setShowOfferModal,
    selectedDealForAction,
    setSelectedDealForAction,
    incrementSessionStat,
    hasSeenTutorial,
    setHasSeenTutorial,
  } = useMarketplaceStore();

  // API hooks
  const {
    data: feedData,
    isLoading,
    isError,
    refetch,
  } = useMarketplaceFeed(userId, {
    limit: 20,
    sortBy: activeFilters.sortBy,
  });

  const swipeMutation = useSwipeDeal(userId);
  const recordViewMutation = useRecordView(userId);
  const createOfferMutation = useCreateOffer(userId);
  const saveDealMutation = useSaveDeal(userId);

  const deals = feedData?.deals || [];
  const currentDeal = deals[currentIndex];
  const hasMoreDeals = currentIndex < deals.length - 1;

  // Preload images for upcoming cards
  useEffect(() => {
    if (deals.length > 0 && currentIndex < deals.length) {
      preloadImages(deals, currentIndex + 1, 3);
    }
  }, [deals, currentIndex]);

  // Process offline queue when online
  useEffect(() => {
    const processQueue = async () => {
      const queue = getQueuedSwipes();
      if (queue.length === 0) return;

      for (const swipe of queue) {
        try {
          await swipeMutation.mutateAsync({
            dealId: swipe.dealId,
            action: swipe.action,
            passReason: swipe.passReason as PassReason | undefined,
            passReasonCustom: swipe.passReasonCustom,
            viewDuration: swipe.viewDuration,
          });
        } catch {
          // Keep in queue if still failing
          return;
        }
      }
      // All processed successfully
      clearQueue();
    };

    // Process queue on mount and when coming back online
    processQueue();
    window.addEventListener('online', processQueue);
    return () => window.removeEventListener('online', processQueue);
  }, [swipeMutation]);

  // Store stable references for use in effects
  const recordViewRef = useRef(recordViewMutation.mutate);
  const incrementStatRef = useRef(incrementSessionStat);
  useEffect(() => {
    recordViewRef.current = recordViewMutation.mutate;
    incrementStatRef.current = incrementSessionStat;
  }, [recordViewMutation.mutate, incrementSessionStat]);

  // Track view when card changes
  useEffect(() => {
    if (currentDeal) {
      viewStartTimeRef.current = Date.now();
      recordViewRef.current({ dealId: currentDeal.id });
      incrementStatRef.current('viewed');
    }
  }, [currentDeal?.id]);

  const getViewDuration = useCallback(() => {
    return Date.now() - viewStartTimeRef.current;
  }, []);

  const handleSwipe = useCallback(
    async (direction: SwipeDirection, passReason?: PassReason, customReason?: string) => {
      if (!currentDeal || isTransitioning) return;

      setIsTransitioning(true);
      const viewDuration = getViewDuration();
      // Determine action based on direction
      const action = direction === 'up' ? 'super_like' : direction === 'right' ? 'like' : 'pass';

      // Store the deal for potential match celebration
      const swipedDeal = currentDeal;

      // Retry logic with exponential backoff
      let lastError: Error | null = null;
      let matchInfo: MatchInfo | undefined;

      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          // Record the swipe
          const response = await swipeMutation.mutateAsync({
            dealId: currentDeal.id,
            action,
            passReason,
            passReasonCustom: customReason,
            viewDuration,
          });

          // Check for match in response
          matchInfo = response?.match;

          // Update local state on success
          if (direction === 'up') {
            // Super Like - add to liked with super flag
            addLikedDeal({ ...currentDeal, isSuperLiked: true } as MarketplaceDeal & { isSuperLiked: boolean });
            incrementSessionStat('liked');
          } else if (direction === 'right') {
            addLikedDeal(currentDeal);
            incrementSessionStat('liked');
          } else {
            addPassedDeal(currentDeal);
            incrementSessionStat('passed');
          }

          // Move to next card
          setCurrentIndex((prev) => prev + 1);
          setIsTransitioning(false);

          // Show match celebration if it's a match
          if (matchInfo?.isMatch) {
            setMatchedDeal(swipedDeal);
            setCurrentMatchInfo(matchInfo);
            setShowMatchCelebration(true);
          }

          return; // Success - exit retry loop
        } catch (error) {
          lastError = error as Error;
          console.warn(`Swipe attempt ${attempt + 1} failed:`, error);

          if (attempt < MAX_RETRY_ATTEMPTS - 1) {
            // Wait before retrying
            await sleep(getRetryDelay(attempt));
          }
        }
      }

      // All retries failed - queue for later and update UI optimistically
      console.error('All swipe attempts failed, queuing for later:', lastError);

      // Queue swipe for when back online
      queueSwipe({
        dealId: currentDeal.id,
        action,
        passReason,
        passReasonCustom: customReason,
        viewDuration,
        timestamp: Date.now(),
      });

      // Optimistically update UI even if API failed
      if (direction === 'up') {
        addLikedDeal({ ...currentDeal, isSuperLiked: true } as MarketplaceDeal & { isSuperLiked: boolean });
        incrementSessionStat('liked');
        // For super likes, always show match celebration optimistically
        setMatchedDeal(swipedDeal);
        setCurrentMatchInfo({
          isMatch: true,
          matchType: 'super_like',
          matchScore: 100,
          matchReasons: ['You Super Liked this deal!'],
          celebrationMessage: "⭐ It's a Super Match! This deal has been prioritized for you.",
        });
        setShowMatchCelebration(true);
      } else if (direction === 'right') {
        addLikedDeal(currentDeal);
        incrementSessionStat('liked');
      } else {
        addPassedDeal(currentDeal);
        incrementSessionStat('passed');
      }
      setCurrentIndex((prev) => prev + 1);
      setIsTransitioning(false);
    },
    [currentDeal, isTransitioning, getViewDuration, swipeMutation, addLikedDeal, addPassedDeal, incrementSessionStat]
  );

  const handleSwipeRight = useCallback(() => {
    handleSwipe('right');
  }, [handleSwipe]);

  const handleSwipeLeft = useCallback(() => {
    // Show pass reason modal
    if (currentDeal) {
      setSelectedDealForAction(currentDeal);
      setShowPassReasonModal(true);
    }
  }, [currentDeal, setSelectedDealForAction, setShowPassReasonModal]);

  const handleSuperLike = useCallback(() => {
    handleSwipe('up');
  }, [handleSwipe]);

  const handlePassReasonSubmit = useCallback(
    (reason?: PassReason, customReason?: string) => {
      handleSwipe('left', reason, customReason);
      setShowPassReasonModal(false);
      setSelectedDealForAction(null);
    },
    [handleSwipe, setShowPassReasonModal, setSelectedDealForAction]
  );

  const handleUndo = useCallback(() => {
    const lastPassed = undoLastPass();
    if (lastPassed && currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [undoLastPass, currentIndex]);

  const handleMakeOffer = useCallback(
    (deal: MarketplaceDeal) => {
      setSelectedDealForAction(deal);
      setShowOfferModal(true);
    },
    [setSelectedDealForAction, setShowOfferModal]
  );

  const handleOfferSubmit = async (data: OfferRequest) => {
    if (!selectedDealForAction) return;

    await createOfferMutation.mutateAsync({
      dealId: selectedDealForAction.id,
      ...data,
    });

    markDealAsOffered(selectedDealForAction.id);
    incrementSessionStat('offers');
    setShowOfferModal(false);
    setSelectedDealForAction(null);
  };

  const handleSave = useCallback(() => {
    if (currentDeal) {
      saveDealMutation.mutate(currentDeal.id);
    }
  }, [currentDeal, saveDealMutation]);

  // Pull-to-refresh handlers
  const handlePullStart = useCallback(() => {
    // Reset pull position
  }, []);

  const handlePull = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Only allow pull down, not up
    if (info.offset.y > 0 && !isRefreshing) {
      // Apply resistance as user pulls further
      const resistance = 0.5;
      const newY = Math.min(info.offset.y * resistance, MAX_PULL_DISTANCE);
      pullY.set(newY);
    }
  }, [isRefreshing, pullY]);

  const handlePullEnd = useCallback(async (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const pullDistance = pullY.get();

    if (pullDistance >= PULL_REFRESH_THRESHOLD && !isRefreshing) {
      // Trigger refresh
      setIsRefreshing(true);

      // Hold at threshold position while refreshing
      await pullControls.start({ y: PULL_REFRESH_THRESHOLD, transition: { type: 'spring', stiffness: 400, damping: 30 } });

      // Perform refresh
      await refetch();
      setCurrentIndex(0);

      // Animate back
      setIsRefreshing(false);
      pullY.set(0);
      await pullControls.start({ y: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
    } else {
      // Snap back
      pullY.set(0);
      await pullControls.start({ y: 0, transition: { type: 'spring', stiffness: 500, damping: 30 } });
    }
  }, [isRefreshing, pullY, pullControls, refetch]);

  // Card flip handler
  const handleCardFlip = useCallback((dealId: string) => {
    setFlippedCardId(prev => prev === dealId ? null : dealId);
  }, []);

  // Tutorial overlay for first-time users
  const TutorialOverlay = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-8"
    >
      <div className="max-w-sm rounded-xl bg-card p-6 text-center">
        <Sparkles className="mx-auto mb-4 h-12 w-12 text-primary" />
        <h3 className="text-xl font-bold">Welcome to Deal Swipe!</h3>
        <p className="mt-2 text-muted-foreground">
          Swipe right to like, left to pass, or up to super like your favorite deals!
          Pull down to refresh your feed.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <div className="text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border-2 border-red-500 text-red-500">
              ←
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Pass</div>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border-2 border-cyan-500 text-cyan-500">
              <Star className="h-5 w-5" />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Super Like</div>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border-2 border-accent-500 text-accent-500">
              ↻
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Flip</div>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border-2 border-green-500 text-green-500">
              →
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Like</div>
          </div>
        </div>
        <Button className="mt-6 w-full" onClick={() => setHasSeenTutorial(true)}>
          Got it!
        </Button>
      </div>
    </motion.div>
  );

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        {/* Skeleton header */}
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-6 w-24 animate-pulse rounded bg-muted" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-9 w-32 animate-pulse rounded bg-muted" />
              <div className="h-9 w-9 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="mt-3">
            <div className="h-1.5 w-full animate-pulse rounded bg-muted" />
            <div className="mt-1 flex justify-between">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>

        {/* Skeleton card */}
        <div className="relative flex-1 overflow-hidden p-4">
          <div className="mx-auto h-full max-w-md">
            <div className="h-full w-full overflow-hidden rounded-2xl border bg-card shadow-xl">
              {/* Skeleton photo */}
              <div className="h-[55%] w-full animate-pulse bg-muted" />
              {/* Skeleton content */}
              <div className="flex flex-col gap-3 p-4">
                <div className="flex justify-between">
                  <div>
                    <div className="h-8 w-32 animate-pulse rounded bg-muted" />
                    <div className="mt-1 h-4 w-40 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                </div>
                <div className="flex gap-4">
                  <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3">
                  <div className="h-12 animate-pulse rounded bg-muted" />
                  <div className="h-12 animate-pulse rounded bg-muted" />
                </div>
                <div className="flex gap-2">
                  <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                  <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Skeleton action buttons */}
        <div className="border-t px-4 py-6">
          <div className="flex items-center justify-center gap-4">
            <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
            <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
            <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h3 className="text-lg font-medium">Failed to load deals</h3>
        <p className="text-muted-foreground">Please try again later.</p>
        <Button onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (deals.length === 0 || currentIndex >= deals.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <Sparkles className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">No more deals</h3>
        <p className="text-muted-foreground">
          You&apos;ve seen all available deals. Check back later for new listings!
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setLikedDrawerOpen(true)}>
            <Heart className="mr-2 h-4 w-4" />
            View {likedDeals.length} Liked
          </Button>
          <Button
            onClick={() => {
              setCurrentIndex(0);
              refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Feed
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Deal Feed</h1>
            <Badge variant="secondary" className="text-xs">
              {currentIndex + 1} / {deals.length}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Sort selector */}
            <Select
              value={activeFilters.sortBy}
              onValueChange={(value: typeof activeFilters.sortBy) => setFilters({ sortBy: value })}
            >
              <SelectTrigger className="w-[140px]" aria-label="Sort deals by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="match_score">Best Match</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="price_low">Price: Low</SelectItem>
                <SelectItem value="price_high">Price: High</SelectItem>
              </SelectContent>
            </Select>

            {/* Liked deals button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setLikedDrawerOpen(true)}
              className="relative"
              aria-label={`View ${likedDeals.length} liked deals`}
            >
              <Heart className="h-5 w-5" aria-hidden="true" />
              {likedDeals.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs text-foreground" aria-hidden="true">
                  {likedDeals.length}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <Progress
            value={(currentIndex / deals.length) * 100}
            className="h-1.5"
            aria-label={`Progress: ${currentIndex} of ${deals.length} deals reviewed`}
          />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{deals.length - currentIndex} remaining</span>
            <span>{Math.round((currentIndex / deals.length) * 100)}% complete</span>
          </div>
        </div>
      </div>

      {/* Card stack area with pull-to-refresh */}
      <motion.div
        className="relative flex-1 overflow-hidden p-4"
        drag={!isTransitioning ? 'y' : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0}
        onDragStart={handlePullStart}
        onDrag={handlePull}
        onDragEnd={handlePullEnd}
        style={{ y: pullY }}
      >
        {/* Pull-to-refresh indicator */}
        <motion.div
          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full flex flex-col items-center justify-center pt-4 pb-2"
          style={{ opacity: pullOpacity }}
        >
          <motion.div
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
            style={{ scale: pullScale, rotate: pullRotation }}
          >
            {isRefreshing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ArrowDown className="h-5 w-5" />
            )}
          </motion.div>
          <span className="mt-2 text-xs text-muted-foreground">
            {isRefreshing ? 'Refreshing...' : 'Pull to refresh'}
          </span>
        </motion.div>

        <div className="relative mx-auto h-full max-w-md">
          {/* Card stack */}
          <AnimatePresence>
            {deals.slice(currentIndex, currentIndex + 3).map((deal, index) => (
              <SwipeCard
                key={deal.id}
                index={index}
                isTopCard={index === 0}
                disabled={isTransitioning || index !== 0 || isRefreshing}
                onSwipe={(direction) => {
                  if (direction === 'up') {
                    handleSuperLike();
                  } else if (direction === 'right') {
                    handleSwipeRight();
                  } else {
                    handleSwipeLeft();
                  }
                }}
                onInfoClick={() => handleCardFlip(deal.id)}
                isFlipped={flippedCardId === deal.id}
                onFlipBack={() => setFlippedCardId(null)}
                onMakeOffer={() => handleMakeOffer(deal)}
                dealData={{
                  price: deal.deal.price,
                  arv: deal.deal.arv,
                  equity: deal.deal.equity,
                  address: deal.deal.address,
                  city: deal.deal.city,
                  state: deal.deal.state,
                  zip: deal.deal.zip,
                  wholesalerName: deal.deal.wholesalerName,
                  wholesalerPhone: deal.deal.wholesalerPhone,
                  wholesalerEmail: deal.deal.wholesalerEmail,
                  repairEstimate: deal.deal.repairEstimate,
                  propertyType: deal.deal.propertyType,
                  description: deal.deal.description,
                }}
              >
                <DealCard
                  deal={deal}
                  onSave={handleSave}
                  showActions={index === 0}
                />
              </SwipeCard>
            ))}
          </AnimatePresence>

          {/* Tutorial overlay */}
          <AnimatePresence>
            {!hasSeenTutorial && <TutorialOverlay />}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Action buttons */}
      <div className="border-t px-4 py-6">
        <SwipeActions
          onPass={handleSwipeLeft}
          onLike={handleSwipeRight}
          onSuperLike={handleSuperLike}
          onUndo={handleUndo}
          onInfo={() => currentDeal && handleMakeOffer(currentDeal)}
          disabled={isTransitioning || !currentDeal}
          canUndo={recentlyPassedDeals.length > 0 && currentIndex > 0}
        />
      </div>

      {/* Modals */}
      <PassReasonModal
        open={showPassReasonModal}
        onOpenChange={setShowPassReasonModal}
        onSubmit={handlePassReasonSubmit}
        dealAddress={selectedDealForAction?.deal.city + ', ' + selectedDealForAction?.deal.state}
      />

      <OfferModal
        open={showOfferModal}
        onOpenChange={setShowOfferModal}
        deal={selectedDealForAction}
        onSubmit={handleOfferSubmit}
        isSubmitting={createOfferMutation.isPending}
      />

      <LikedDealsDrawer
        open={isLikedDrawerOpen}
        onClose={() => setLikedDrawerOpen(false)}
        onMakeOffer={handleMakeOffer}
      />

      {/* Match Celebration Modal */}
      {matchedDeal && currentMatchInfo && (
        <MatchCelebration
          isOpen={showMatchCelebration}
          onClose={() => {
            setShowMatchCelebration(false);
            setMatchedDeal(null);
            setCurrentMatchInfo(null);
          }}
          matchInfo={currentMatchInfo}
          deal={matchedDeal}
          onMakeOffer={() => {
            setShowMatchCelebration(false);
            handleMakeOffer(matchedDeal);
          }}
          onViewDeal={() => {
            setShowMatchCelebration(false);
            setLikedDrawerOpen(true);
          }}
        />
      )}
    </div>
  );
}
