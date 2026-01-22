import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MarketplaceDeal, SwipeAction, PassReason } from '@/types/marketplace';

interface LikedDeal extends MarketplaceDeal {
  likedAt: string;
  hasOffer: boolean;
}

interface MaybeDeal extends MarketplaceDeal {
  addedAt: string;
  notes?: string;
}

interface MarketplaceState {
  // User ID (stored after first marketplace visit)
  userId: string | null;
  setUserId: (id: string) => void;

  // Current view state
  currentCardIndex: number;
  setCurrentCardIndex: (index: number) => void;

  // Liked deals (for quick access without API call)
  likedDeals: LikedDeal[];
  addLikedDeal: (deal: MarketplaceDeal) => void;
  removeLikedDeal: (dealId: string) => void;
  markDealAsOffered: (dealId: string) => void;
  clearLikedDeals: () => void;

  // Passed deals (track locally for undo feature - last 10)
  recentlyPassedDeals: MarketplaceDeal[];
  addPassedDeal: (deal: MarketplaceDeal) => void;
  undoLastPass: () => MarketplaceDeal | null;
  getUndoCount: () => number;

  // Maybe deals (needs more research)
  maybeDeals: MaybeDeal[];
  addMaybeDeal: (deal: MarketplaceDeal, notes?: string) => void;
  removeMaybeDeal: (dealId: string) => void;
  updateMaybeNotes: (dealId: string, notes: string) => void;
  resolveMaybeDeal: (dealId: string, decision: 'like' | 'pass') => void;

  // View tracking
  currentViewStartTime: number | null;
  startViewTracking: () => void;
  getViewDuration: () => number;

  // Filter preferences
  activeFilters: {
    sortBy: 'match_score' | 'newest' | 'price_low' | 'price_high';
    buyBoxId?: string;
    minPrice?: number;
    maxPrice?: number;
    states?: string[];
    propertyTypes?: string[];
  };
  setFilters: (filters: Partial<MarketplaceState['activeFilters']>) => void;
  resetFilters: () => void;

  // UI state
  isLikedDrawerOpen: boolean;
  setLikedDrawerOpen: (open: boolean) => void;
  showPassReasonModal: boolean;
  setShowPassReasonModal: (show: boolean) => void;
  showOfferModal: boolean;
  setShowOfferModal: (show: boolean) => void;
  selectedDealForAction: MarketplaceDeal | null;
  setSelectedDealForAction: (deal: MarketplaceDeal | null) => void;

  // Comparison mode
  comparisonDeals: string[];
  toggleComparisonDeal: (dealId: string) => void;
  clearComparisonDeals: () => void;

  // Tutorial/onboarding
  hasSeenTutorial: boolean;
  setHasSeenTutorial: (seen: boolean) => void;

  // Stats for current session
  sessionStats: {
    viewed: number;
    liked: number;
    passed: number;
    maybe: number;
    offers: number;
  };
  incrementSessionStat: (stat: keyof MarketplaceState['sessionStats']) => void;
  resetSessionStats: () => void;
}

const DEFAULT_FILTERS: MarketplaceState['activeFilters'] = {
  sortBy: 'match_score',
};

export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set, get) => ({
      // User ID
      userId: null,
      setUserId: (id) => set({ userId: id }),

      // Card navigation
      currentCardIndex: 0,
      setCurrentCardIndex: (index) => set({ currentCardIndex: index }),

      // Liked deals
      likedDeals: [],
      addLikedDeal: (deal) =>
        set((state) => ({
          likedDeals: [
            { ...deal, likedAt: new Date().toISOString(), hasOffer: false },
            ...state.likedDeals,
          ],
        })),
      removeLikedDeal: (dealId) =>
        set((state) => ({
          likedDeals: state.likedDeals.filter((d) => d.id !== dealId),
        })),
      markDealAsOffered: (dealId) =>
        set((state) => ({
          likedDeals: state.likedDeals.map((d) =>
            d.id === dealId ? { ...d, hasOffer: true } : d
          ),
        })),
      clearLikedDeals: () => set({ likedDeals: [] }),

      // Passed deals (keep last 10 for undo)
      recentlyPassedDeals: [],
      addPassedDeal: (deal) =>
        set((state) => ({
          recentlyPassedDeals: [deal, ...state.recentlyPassedDeals].slice(0, 10),
        })),
      undoLastPass: () => {
        const state = get();
        if (state.recentlyPassedDeals.length === 0) return null;
        const [lastPassed, ...rest] = state.recentlyPassedDeals;
        set({ recentlyPassedDeals: rest });
        return lastPassed;
      },
      getUndoCount: () => get().recentlyPassedDeals.length,

      // Maybe deals (needs more research)
      maybeDeals: [],
      addMaybeDeal: (deal, notes) =>
        set((state) => ({
          maybeDeals: [
            { ...deal, addedAt: new Date().toISOString(), notes },
            ...state.maybeDeals.filter((d) => d.id !== deal.id),
          ],
        })),
      removeMaybeDeal: (dealId) =>
        set((state) => ({
          maybeDeals: state.maybeDeals.filter((d) => d.id !== dealId),
        })),
      updateMaybeNotes: (dealId, notes) =>
        set((state) => ({
          maybeDeals: state.maybeDeals.map((d) =>
            d.id === dealId ? { ...d, notes } : d
          ),
        })),
      resolveMaybeDeal: (dealId, decision) => {
        const state = get();
        const maybeDeal = state.maybeDeals.find((d) => d.id === dealId);
        if (!maybeDeal) return;

        if (decision === 'like') {
          set((s) => ({
            likedDeals: [
              { ...maybeDeal, likedAt: new Date().toISOString(), hasOffer: false },
              ...s.likedDeals,
            ],
            maybeDeals: s.maybeDeals.filter((d) => d.id !== dealId),
          }));
        } else {
          set((s) => ({
            maybeDeals: s.maybeDeals.filter((d) => d.id !== dealId),
          }));
        }
      },

      // View tracking
      currentViewStartTime: null,
      startViewTracking: () => set({ currentViewStartTime: Date.now() }),
      getViewDuration: () => {
        const startTime = get().currentViewStartTime;
        return startTime ? Date.now() - startTime : 0;
      },

      // Filters
      activeFilters: DEFAULT_FILTERS,
      setFilters: (filters) =>
        set((state) => ({
          activeFilters: { ...state.activeFilters, ...filters },
        })),
      resetFilters: () => set({ activeFilters: DEFAULT_FILTERS }),

      // UI state
      isLikedDrawerOpen: false,
      setLikedDrawerOpen: (open) => set({ isLikedDrawerOpen: open }),
      showPassReasonModal: false,
      setShowPassReasonModal: (show) => set({ showPassReasonModal: show }),
      showOfferModal: false,
      setShowOfferModal: (show) => set({ showOfferModal: show }),
      selectedDealForAction: null,
      setSelectedDealForAction: (deal) => set({ selectedDealForAction: deal }),

      // Comparison
      comparisonDeals: [],
      toggleComparisonDeal: (dealId) =>
        set((state) => {
          const exists = state.comparisonDeals.includes(dealId);
          if (exists) {
            return { comparisonDeals: state.comparisonDeals.filter((id) => id !== dealId) };
          }
          if (state.comparisonDeals.length >= 5) return state; // Max 5
          return { comparisonDeals: [...state.comparisonDeals, dealId] };
        }),
      clearComparisonDeals: () => set({ comparisonDeals: [] }),

      // Tutorial
      hasSeenTutorial: false,
      setHasSeenTutorial: (seen) => set({ hasSeenTutorial: seen }),

      // Session stats
      sessionStats: { viewed: 0, liked: 0, passed: 0, maybe: 0, offers: 0 },
      incrementSessionStat: (stat) =>
        set((state) => ({
          sessionStats: {
            ...state.sessionStats,
            [stat]: state.sessionStats[stat] + 1,
          },
        })),
      resetSessionStats: () =>
        set({ sessionStats: { viewed: 0, liked: 0, passed: 0, maybe: 0, offers: 0 } }),
    }),
    {
      name: 'dispotree-marketplace',
      partialize: (state) => ({
        userId: state.userId,
        likedDeals: state.likedDeals,
        maybeDeals: state.maybeDeals,
        activeFilters: state.activeFilters,
        hasSeenTutorial: state.hasSeenTutorial,
      }),
    }
  )
);
