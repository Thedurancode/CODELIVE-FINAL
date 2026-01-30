/**
 * Settings Hook
 *
 * React Query hook for managing application settings
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Setting {
  key: string;
  value: any;
  type: 'boolean' | 'number' | 'string' | 'json';
  category: string;
  description: string;
  updatedAt: string;
}

export interface SettingsResponse {
  success: boolean;
  data: Setting[];
}

// Get all settings
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting[]>('/api/settings'),
  });
}

// Get settings by category
export function useSettingsByCategory(category: string) {
  return useQuery({
    queryKey: ['settings', 'category', category],
    queryFn: () => api.get<Setting[]>(`/api/settings/category/${category}`),
    enabled: !!category,
  });
}

// Get a single setting
export function useSetting(key: string) {
  return useQuery({
    queryKey: ['settings', key],
    queryFn: () => api.get<Setting>(`/api/settings/${key}`),
    enabled: !!key,
  });
}

// Update a setting
export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) =>
      api.put<Setting>(`/api/settings/${key}`, { value }),
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', key] });
    },
  });
}

// Reset a setting to default
export function useResetSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (key: string) => api.post<Setting>(`/api/settings/${key}/reset`),
    onSuccess: (_, key) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', key] });
    },
  });
}
