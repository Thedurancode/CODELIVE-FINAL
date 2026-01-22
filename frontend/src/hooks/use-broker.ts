import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Set user role (development only)
 */
export function useSetUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (role: string) => {
      const response = await api.put<{ success: boolean; data: any; message: string }>(
        '/api/auth/set-role',
        { role }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

// Types
export interface BrokerApplication {
  licenseNumber: string;
  licenseState: string;
  licenseExpirationDate: string;
  brokerageCompany: string;
  brokerageAddress?: string;
  brokeragePhone?: string;
  brokerageEmail?: string;
  eoInsurancePolicy?: string;
  eoExpirationDate?: string;
}

export interface BrokerProfile {
  id: string;
  userId: string;
  licenseNumber: string;
  licenseState: string;
  licensedStates?: string[]; // All states the broker can operate in
  licenseExpirationDate: string;
  brokerageCompany: string;
  brokerageAddress?: string;
  brokeragePhone?: string;
  brokerageEmail?: string;
  eoInsurancePolicy?: string;
  eoExpirationDate?: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  rejectionReason?: string;
  activeDealsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrokerUpdateData {
  licenseNumber?: string;
  licenseState?: string;
  licensedStates?: string[];
  licenseExpirationDate?: string;
  brokerageCompany?: string;
  brokerageAddress?: string;
  brokeragePhone?: string;
  brokerageEmail?: string;
  eoInsurancePolicy?: string;
  eoExpirationDate?: string;
  notes?: string;
}

interface BrokerProfileResponse {
  success: boolean;
  data: BrokerProfile;
}

interface PendingApplicationsResponse {
  success: boolean;
  data: BrokerProfile[];
  count: number;
}

/**
 * Submit broker application
 */
export function useApplyAsBroker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: BrokerApplication) => {
      const response = await api.post<BrokerProfileResponse>('/api/broker/apply', data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-profile'] });
    },
  });
}

/**
 * Get current user's broker profile
 */
export function useBrokerProfile() {
  return useQuery({
    queryKey: ['broker-profile'],
    queryFn: async () => {
      try {
        const response = await api.get<BrokerProfileResponse>('/api/broker/profile');
        return response.data;
      } catch {
        return null;
      }
    },
  });
}

/**
 * Get application status by ID
 */
export function useApplicationStatus(applicationId: string | null) {
  return useQuery({
    queryKey: ['broker-application', applicationId],
    queryFn: async () => {
      if (!applicationId) return null;
      const response = await api.get<BrokerProfileResponse>(`/api/broker/application/${applicationId}`);
      return response.data;
    },
    enabled: !!applicationId,
  });
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Get pending broker applications (admin only)
 */
export function usePendingBrokerApplications() {
  return useQuery({
    queryKey: ['broker-applications-pending'],
    queryFn: async () => {
      // api.get already unwraps data.data, so response is the array directly
      const response = await api.get<BrokerProfile[]>('/api/broker/admin/applications');
      // Ensure we never return undefined - React Query requires a defined value
      if (!response) return [];
      return Array.isArray(response) ? response : [];
    },
    retry: false, // Don't retry on auth errors
  });
}

/**
 * Approve broker application (admin only)
 */
export function useApproveBrokerApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const response = await api.put<BrokerProfileResponse>(
        `/api/broker/admin/applications/${applicationId}/approve`,
        {}
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-applications-pending'] });
    },
  });
}

/**
 * Reject broker application (admin only)
 */
export function useRejectBrokerApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, reason }: { applicationId: string; reason: string }) => {
      const response = await api.put<BrokerProfileResponse>(
        `/api/broker/admin/applications/${applicationId}/reject`,
        { reason }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-applications-pending'] });
    },
  });
}

/**
 * Get all approved brokers (admin only)
 */
export function useApprovedBrokers() {
  return useQuery({
    queryKey: ['brokers-approved'],
    queryFn: async () => {
      // api.get already unwraps data.data, so response is the array directly
      const response = await api.get<BrokerProfile[]>('/api/broker/admin/brokers');
      // Ensure we never return undefined - React Query requires a defined value
      if (!response) return [];
      return Array.isArray(response) ? response : [];
    },
    retry: false, // Don't retry on auth errors
  });
}

/**
 * Update broker information (admin only)
 */
export function useUpdateBroker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ brokerId, data }: { brokerId: string; data: BrokerUpdateData }) => {
      const response = await api.put<BrokerProfileResponse>(
        `/api/broker/admin/brokers/${brokerId}`,
        data
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokers-approved'] });
      queryClient.invalidateQueries({ queryKey: ['broker-applications-pending'] });
    },
  });
}

// ============================================================================
// ADMIN DEAL APPROVAL FUNCTIONS
// ============================================================================

import { Property } from '@/types';

/**
 * Get pending deal approvals (admin only)
 */
export function useAdminPendingDeals() {
  return useQuery({
    queryKey: ['admin-pending-deals'],
    queryFn: async () => {
      const response = await api.get<Property[]>('/api/broker/admin/deals/pending');
      if (!response) return [];
      return Array.isArray(response) ? response : [];
    },
    retry: false,
  });
}

/**
 * Set deal to live (admin only)
 */
export function useAdminSetDealLive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (propertyId: string | number) => {
      const response = await api.post(`/api/broker/admin/deals/${propertyId}/set-live`, {});
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-deals'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

/**
 * Reject deal (admin only)
 */
export function useAdminRejectDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ propertyId, reason }: { propertyId: string | number; reason: string }) => {
      const response = await api.post(`/api/broker/admin/deals/${propertyId}/reject`, { reason });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-deals'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

/**
 * Bulk set deals to live (admin only)
 */
export function useAdminBulkSetLive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (propertyIds: (string | number)[]) => {
      const response = await api.post('/api/broker/admin/deals/bulk-set-live', { propertyIds });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-deals'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}
