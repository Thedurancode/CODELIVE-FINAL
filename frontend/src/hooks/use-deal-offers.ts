'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DealOffer, OfferStatus } from '@/types/marketplace';

// Extended offer type with user information
export interface DealOfferWithUser extends DealOffer {
  user?: {
    id: string;
    name: string;
    email: string;
    company?: string;
    phone?: string;
  };
}

interface OffersResponse {
  success: boolean;
  data: DealOfferWithUser[];
  timestamp: string;
}

/**
 * Hook to fetch offers for a specific deal (seller view)
 */
export function useDealOffers(dealId: string, status?: OfferStatus) {
  return useQuery<DealOfferWithUser[], Error>({
    queryKey: ['deal-offers', dealId, status],
    queryFn: async () => {
      const query = status ? `?status=${status}` : '';
      const response = await api.get<OffersResponse | DealOfferWithUser[]>(
        `/api/marketplace/deals/${dealId}/offers${query}`
      );

      // Handle wrapped response or direct array
      if (Array.isArray(response)) {
        return response;
      }
      if (response && typeof response === 'object' && 'data' in response) {
        return response.data;
      }
      return [];
    },
    enabled: !!dealId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to respond to an offer (accept, reject, counter)
 */
export function useRespondToOffer() {
  const queryClient = useQueryClient();

  return useMutation<
    DealOffer,
    Error,
    {
      offerId: string;
      dealId: string;
      response: 'accepted' | 'rejected' | 'countered';
      counterOffer?: {
        amount: number;
        closingDays?: number;
        notes?: string;
      };
    }
  >({
    mutationFn: async ({ offerId, response, counterOffer }) => {
      const result = await api.post<DealOffer>(
        `/api/marketplace/offers/${offerId}/respond`,
        { response, counterOffer }
      );
      return result;
    },
    onSuccess: (_, { dealId }) => {
      queryClient.invalidateQueries({ queryKey: ['deal-offers', dealId] });
    },
  });
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get status badge color
 */
export function getOfferStatusColor(status: OfferStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'viewed':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'countered':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'accepted':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'rejected':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'expired':
      return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    case 'withdrawn':
      return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    default:
      return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
  }
}

/**
 * Get human-readable status label
 */
export function getOfferStatusLabel(status: OfferStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'viewed':
      return 'Viewed';
    case 'countered':
      return 'Countered';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Rejected';
    case 'expired':
      return 'Expired';
    case 'withdrawn':
      return 'Withdrawn';
    default:
      return status;
  }
}
