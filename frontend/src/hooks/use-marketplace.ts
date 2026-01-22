import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import type {
  MarketplaceFeed,
  MarketplaceDeal,
  FeedRequest,
  SwipeRequest,
  SwipeResponse,
  OfferRequest,
  DealOffer,
  UserBuyBox,
  UserBehaviorProfile,
  DealPrediction,
  DealAnalytics,
  PassReasonAnalytics,
  DealComparison,
  MarketplaceUser,
} from '@/types/marketplace';

// ============================================================================
// USER HOOKS
// ============================================================================

export function useMarketplaceUser(userId: string) {
  return useQuery({
    queryKey: ['marketplace', 'user', userId],
    queryFn: () => api.get<MarketplaceUser>(`/api/marketplace/users/${userId}`),
    enabled: !!userId,
  });
}

export function useCreateMarketplaceUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      email: string;
      name: string;
      company?: string;
      phone?: string;
      role?: 'buyer' | 'investor' | 'wholesaler' | 'agent';
    }) => api.post<MarketplaceUser>('/api/marketplace/users', data),
    onSuccess: (user) => {
      queryClient.setQueryData(['marketplace', 'user', user.id], user);
    },
  });
}

// ============================================================================
// BUY BOX HOOKS
// ============================================================================

export function useUserBuyBoxes(userId: string) {
  return useQuery({
    queryKey: ['marketplace', 'buyboxes', userId],
    queryFn: () => api.get<UserBuyBox[]>(`/api/marketplace/users/${userId}/buyboxes`),
    enabled: !!userId,
  });
}

export function useCreateBuyBox(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<UserBuyBox>) =>
      api.post<UserBuyBox>(`/api/marketplace/users/${userId}/buyboxes`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'buyboxes', userId] });
    },
  });
}

export function useUpdateBuyBox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ buyBoxId, data }: { buyBoxId: string; data: Partial<UserBuyBox> }) =>
      api.put<UserBuyBox>(`/api/marketplace/buyboxes/${buyBoxId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'buyboxes'] });
    },
  });
}

// ============================================================================
// FEED HOOKS
// ============================================================================

export function useMarketplaceFeed(userId: string, options?: FeedRequest) {
  // Memoize options key to prevent unnecessary cache invalidation
  const optionsKey = useMemo(
    () => (options ? JSON.stringify(options) : ''),
    [options?.page, options?.limit, options?.sortBy, options?.buyBoxId, options?.minPrice, options?.maxPrice, options?.states, options?.propertyTypes]
  );

  return useQuery({
    queryKey: ['marketplace', 'feed', userId, optionsKey],
    queryFn: () => {
      const params = new URLSearchParams();
      if (options?.page) params.set('page', String(options.page));
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.sortBy) params.set('sortBy', options.sortBy);
      if (options?.buyBoxId) params.set('buyBoxId', options.buyBoxId);
      if (options?.minPrice) params.set('minPrice', String(options.minPrice));
      if (options?.maxPrice) params.set('maxPrice', String(options.maxPrice));
      if (options?.states) params.set('states', options.states);
      if (options?.propertyTypes) params.set('propertyTypes', options.propertyTypes);

      const query = params.toString();
      return api.get<MarketplaceFeed>(`/api/marketplace/users/${userId}/feed${query ? `?${query}` : ''}`);
    },
    enabled: !!userId,
  });
}

export function useInfiniteMarketplaceFeed(userId: string, options?: Omit<FeedRequest, 'page'>) {
  // Memoize options key to prevent unnecessary cache invalidation
  const optionsKey = useMemo(
    () => (options ? JSON.stringify(options) : ''),
    [options?.limit, options?.sortBy, options?.buyBoxId, options?.minPrice, options?.maxPrice, options?.states, options?.propertyTypes]
  );

  return useInfiniteQuery({
    queryKey: ['marketplace', 'feed', 'infinite', userId, optionsKey],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      params.set('page', String(pageParam));
      params.set('limit', String(options?.limit || 10));
      if (options?.sortBy) params.set('sortBy', options.sortBy);
      if (options?.buyBoxId) params.set('buyBoxId', options.buyBoxId);

      return api.get<MarketplaceFeed>(`/api/marketplace/users/${userId}/feed?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.hasMore) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    enabled: !!userId,
  });
}

// ============================================================================
// SWIPE HOOKS
// ============================================================================

export function useSwipeDeal(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, ...data }: SwipeRequest & { dealId: string }) =>
      api.post<SwipeResponse>(
        `/api/marketplace/users/${userId}/deals/${dealId}/swipe`,
        data
      ),
    onSuccess: () => {
      // Invalidate feed to get next deals
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'feed'] });
      // Invalidate user stats
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'user', userId] });
    },
  });
}

export function useRecordView(userId: string) {
  return useMutation({
    mutationFn: ({ dealId, duration }: { dealId: string; duration?: number }) =>
      api.post(`/api/marketplace/users/${userId}/deals/${dealId}/view`, { duration }),
  });
}

export function usePassReasons() {
  return useQuery({
    queryKey: ['marketplace', 'pass-reasons'],
    queryFn: () => api.get<{ value: string; label: string }[]>('/api/marketplace/pass-reasons'),
    staleTime: Infinity, // These don't change
  });
}

// ============================================================================
// OFFER HOOKS
// ============================================================================

export function useCreateOffer(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, ...data }: OfferRequest & { dealId: string }) =>
      api.post<DealOffer>(`/api/marketplace/users/${userId}/deals/${dealId}/offers`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'offers', userId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'user', userId] });
    },
  });
}

export function useUserOffers(userId: string, status?: string) {
  return useQuery({
    queryKey: ['marketplace', 'offers', userId, status],
    queryFn: () => {
      const query = status ? `?status=${status}` : '';
      return api.get<DealOffer[]>(`/api/marketplace/users/${userId}/offers${query}`);
    },
    enabled: !!userId,
  });
}

export function useRespondToOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      offerId,
      response,
      counterOffer,
    }: {
      offerId: string;
      response: 'accepted' | 'rejected' | 'countered';
      counterOffer?: { amount: number; closingDays?: number; notes?: string };
    }) => api.post<DealOffer>(`/api/marketplace/offers/${offerId}/respond`, { response, counterOffer }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'offers'] });
    },
  });
}

// ============================================================================
// HIGH-SIGNAL ACTION HOOKS
// ============================================================================

export function useSaveDeal(userId: string) {
  return useMutation({
    mutationFn: (dealId: string) =>
      api.post(`/api/marketplace/users/${userId}/deals/${dealId}/save`),
  });
}

export function useShareDeal(userId: string) {
  return useMutation({
    mutationFn: (dealId: string) =>
      api.post(`/api/marketplace/users/${userId}/deals/${dealId}/share`),
  });
}

export function useRequestInfo(userId: string) {
  return useMutation({
    mutationFn: (dealId: string) =>
      api.post(`/api/marketplace/users/${userId}/deals/${dealId}/request-info`),
  });
}

export function useTrackFilters(userId: string) {
  return useMutation({
    mutationFn: (filters: Record<string, unknown>) =>
      api.post(`/api/marketplace/users/${userId}/filters`, { filters }),
  });
}

// ============================================================================
// ANALYTICS & PREDICTION HOOKS
// ============================================================================

export function useUserBehaviorProfile(userId: string) {
  return useQuery({
    queryKey: ['marketplace', 'profile', userId],
    queryFn: () => api.get<UserBehaviorProfile>(`/api/marketplace/users/${userId}/profile`),
    enabled: !!userId,
  });
}

export function usePredictDealInterest(userId: string, dealId: string) {
  return useQuery({
    queryKey: ['marketplace', 'predict', userId, dealId],
    queryFn: () => api.get<DealPrediction>(`/api/marketplace/users/${userId}/deals/${dealId}/predict`),
    enabled: !!userId && !!dealId,
  });
}

export function usePassReasonAnalytics(userId?: string) {
  return useQuery({
    queryKey: ['marketplace', 'analytics', 'pass-reasons', userId],
    queryFn: () => {
      const query = userId ? `?userId=${userId}` : '';
      return api.get<PassReasonAnalytics[]>(`/api/marketplace/analytics/pass-reasons${query}`);
    },
  });
}

export function useDealAnalytics(dealId: string) {
  return useQuery({
    queryKey: ['marketplace', 'analytics', 'deal', dealId],
    queryFn: () => api.get<DealAnalytics>(`/api/marketplace/deals/${dealId}/analytics`),
    enabled: !!dealId,
  });
}

// ============================================================================
// COMPARISON HOOKS
// ============================================================================

export function useCompareDeals() {
  return useMutation({
    mutationFn: ({
      dealIds,
      userId,
      weights,
    }: {
      dealIds: string[];
      userId?: string;
      weights?: Record<string, number>;
    }) => api.post<DealComparison>(`/api/marketplace/compare${userId ? `?userId=${userId}` : ''}`, {
      dealIds,
      weights,
    }),
  });
}

export function useQuickCompareDeals() {
  return useMutation({
    mutationFn: (dealIds: string[]) =>
      api.post<{ deals: Array<{ dealId: string; price: number; arv: number; equity: number }> }>(
        '/api/marketplace/compare/quick',
        { dealIds }
      ),
  });
}
