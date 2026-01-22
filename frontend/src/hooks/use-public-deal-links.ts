'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export interface PublicDealSettings {
  showFinancials: boolean;
  showPropertyDetails: boolean;
  showOccupancy: boolean;
  showFeatures: boolean;
  showDocuments: boolean;
  showCompliance: boolean;
  showViewers: boolean;
  showBuyers: boolean;
  showOffers: boolean;
  showSkipTrace: boolean;
  showContacts: boolean;
  showDiscussion: boolean;
  showPhotos: boolean;
}

export interface PublicDealLink {
  id: number;
  propertyId: number;
  token: string;
  settings: PublicDealSettings;
  expiresAt: string | null;
  createdBy: string;
  isActive: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: string;
    name: string;
  };
}

export interface CreatePublicLinkData {
  settings?: Partial<PublicDealSettings>;
  expiresAt?: string | null;
}

export interface UpdatePublicLinkData {
  settings?: Partial<PublicDealSettings>;
  expiresAt?: string | null;
  isActive?: boolean;
}

/**
 * Get all public links for a property
 */
export function usePropertyPublicLinks(propertyId: string | number) {
  return useQuery({
    queryKey: ['public-links', propertyId],
    queryFn: () => api.get<PublicDealLink[]>(`/api/public/deals/${propertyId}/links`),
    enabled: !!propertyId,
  });
}

/**
 * Create a new public link for a property
 */
export function useCreatePublicLink(propertyId: string | number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePublicLinkData) =>
      api.post<{ link: PublicDealLink; url: string }>(`/api/public/deals/${propertyId}/links`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-links', propertyId] });
      toast.success('Public link created successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create public link');
    },
  });
}

/**
 * Update a public link
 */
export function useUpdatePublicLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ linkId, data }: { linkId: number; data: UpdatePublicLinkData }) =>
      api.patch<PublicDealLink>(`/api/public/links/${linkId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['public-links'] });
      toast.success('Public link updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update public link');
    },
  });
}

/**
 * Delete a public link
 */
export function useDeletePublicLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (linkId: number) => api.delete(`/api/public/links/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-links'] });
      toast.success('Public link deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete public link');
    },
  });
}

/**
 * Generate the full public URL for a link
 */
export function getPublicDealUrl(propertyId: string | number, token: string): string {
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return `${baseUrl}/public/deal/${propertyId}/${token}`;
}
