import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  company?: string;
  phone?: string;
  role: string;
  verified: boolean;
  avatar?: string;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyPush: boolean;
  dealAlerts: boolean;
  instantAlerts: boolean;
  dailyDigest: boolean;
  totalDealsViewed: number;
  totalLikes: number;
  totalPasses: number;
  totalOffers: number;
  acceptedOffers: number;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}

export interface UpdateProfileData {
  name?: string;
  company?: string;
  phone?: string;
  avatar?: string;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['user', 'me'],
    queryFn: () => api.get<UserProfile>('/api/auth/me'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProfileData) =>
      api.patch<UserProfile>('/api/auth/me', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
    },
  });
}
