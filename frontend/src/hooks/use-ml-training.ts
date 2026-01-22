import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types for ML training data
export interface FundOption {
  id: string;
  name: string;
  fundName: string;
}

export interface StateOption {
  code: string;
  name: string;
}

export interface PropertyTypeOption {
  value: string;
  label: string;
}

export interface ResponseTypeOption {
  value: string;
  label: string;
  category: 'positive' | 'neutral' | 'negative';
}

export interface LossCategoryOption {
  value: string;
  label: string;
}

export interface WinFactorOption {
  value: string;
  label: string;
}

export interface MLTrainingEntry {
  dealId: string;
  askingPrice: number;
  arv: number;
  sqft: number;
  yearBuilt: number;
  bedrooms: number;
  bathrooms: number;
  repairEstimate: number;
  state: string;
  propertyType: string;
  street?: string;
  city?: string;
  zip?: string;
  monthlyRent?: number;
  photoCount?: number;
  daysOnMarket?: number;
  occupancyStatus?: string;
  condition?: string;
  fundName: string;
  buyBoxId: string;
  submissionScore: number;
  responseType: string;
  offerAmount?: number;
  lossCategory?: string;
  winFactors?: string[];
  lessonsLearned?: string;
}

export interface MLStatus {
  modelLoaded: boolean;
  modelVersion: string | null;
  predictionCount: number;
  lastTrainingDate: string | null;
}

export interface TrainingReadiness {
  ready: boolean;
  sampleCount: number;
  minRequired: number;
  positiveCount: number;
  negativeCount: number;
  recommendation: string;
}

// Get funds list for dropdown
export function useFunds() {
  return useQuery({
    queryKey: ['ml-reference', 'funds'],
    queryFn: () =>
      api.get<{ funds: string[]; buyBoxes: FundOption[] }>('/api/ml/reference/funds'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Get US states for dropdown
export function useStates() {
  return useQuery({
    queryKey: ['ml-reference', 'states'],
    queryFn: () => api.get<StateOption[]>('/api/ml/reference/states'),
    staleTime: Infinity, // Never stale - static data
  });
}

// Get property types for dropdown
export function usePropertyTypes() {
  return useQuery({
    queryKey: ['ml-reference', 'property-types'],
    queryFn: () => api.get<PropertyTypeOption[]>('/api/ml/reference/property-types'),
    staleTime: Infinity,
  });
}

// Get response types for dropdown
export function useResponseTypes() {
  return useQuery({
    queryKey: ['ml-reference', 'response-types'],
    queryFn: () => api.get<ResponseTypeOption[]>('/api/ml/reference/response-types'),
    staleTime: Infinity,
  });
}

// Get loss categories for dropdown
export function useLossCategories() {
  return useQuery({
    queryKey: ['ml-reference', 'loss-categories'],
    queryFn: () => api.get<LossCategoryOption[]>('/api/ml/reference/loss-categories'),
    staleTime: Infinity,
  });
}

// Get win factors for dropdown
export function useWinFactors() {
  return useQuery({
    queryKey: ['ml-reference', 'win-factors'],
    queryFn: () => api.get<WinFactorOption[]>('/api/ml/reference/win-factors'),
    staleTime: Infinity,
  });
}

// Get ML service status
export function useMLStatus() {
  return useQuery({
    queryKey: ['ml', 'status'],
    queryFn: () => api.get<MLStatus>('/api/ml/status'),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Get training readiness
export function useTrainingReadiness() {
  return useQuery({
    queryKey: ['ml', 'readiness'],
    queryFn: () => api.get<TrainingReadiness>('/api/ml/readiness'),
  });
}

// Record ML feedback
export function useRecordFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      dealId: string;
      buyBoxId: string;
      fundName: string;
      responseType: string;
      submissionScore: number;
      dealSnapshot: Record<string, unknown>;
      offerAmount?: number;
      lossCategory?: string;
      winFactors?: string;
      lessonsLearned?: string;
    }) => api.post<{ id: string }>('/api/ml/feedback', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ml', 'readiness'] });
      queryClient.invalidateQueries({ queryKey: ['ml', 'status'] });
    },
  });
}

// Trigger ML training
export function useTriggerTraining() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (modelType: string = 'deal_quality') =>
      api.post<{ success: boolean; message: string; metrics?: Record<string, number> }>(
        '/api/ml/training/trigger',
        { modelType }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ml'] });
    },
  });
}

// Get training history
export function useTrainingHistory(limit: number = 10) {
  return useQuery({
    queryKey: ['ml', 'training-history', limit],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          modelType: string;
          status: string;
          metrics?: Record<string, number>;
          startedAt: string;
          completedAt?: string;
        }>
      >(`/api/ml/training/runs?limit=${limit}`),
  });
}
