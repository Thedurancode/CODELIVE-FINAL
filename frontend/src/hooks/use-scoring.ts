import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ScoringResult, Property } from '@/types';

export function useScoreProperty() {
  return useMutation({
    mutationFn: (propertyId: string) =>
      api.post<ScoringResult[]>('/api/plugins/scoring/score', { propertyId }),
  });
}

export function useScoreDeal() {
  return useMutation({
    mutationFn: (deal: Partial<Property>) =>
      api.post<ScoringResult[]>('/api/plugins/scoring/score-deal', { deal }),
  });
}

export function useGetMatches(propertyId: string) {
  return useMutation({
    mutationFn: () =>
      api.get<ScoringResult[]>(`/api/hedgefunds/match/${propertyId}`),
  });
}
