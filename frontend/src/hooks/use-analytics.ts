import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DealAnalytics } from '@/types';

export function useDealAnalytics() {
  return useQuery({
    queryKey: ['analytics', 'deals'],
    queryFn: () => api.get<DealAnalytics>('/api/analytics/deals'),
  });
}

export function useScoringAnalytics() {
  return useQuery({
    queryKey: ['analytics', 'scoring'],
    queryFn: () => api.get<{
      totalScored: number;
      avgScore: number;
      byFund: Record<string, number>;
    }>('/api/analytics/scoring'),
  });
}
