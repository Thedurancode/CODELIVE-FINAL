/**
 * Team Profile Hooks
 *
 * React Query hooks for team member profile management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface TeamProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  company?: string;
  role: string;
  avatar?: string;
  bio?: string;
  expertise?: string[];
  title?: string;
  timezone?: string;
  organizationId?: string;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyPush: boolean;
  dealAlerts: boolean;
  instantAlerts: boolean;
  dailyDigest?: boolean;
  createdAt: string;
  lastActiveAt: string;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  avatar?: string;
  bio?: string;
  expertise?: string[];
  title?: string;
  timezone?: string;
  lastActiveAt: string;
  dealAssignments?: Array<{
    propertyId: number;
    role: string;
    assignedAt: string;
    property?: {
      id: number;
      address: string;
      city: string;
      state: string;
      askingPrice?: number;
      status?: string;
    };
  }>;
}

export interface MyDealAssignment {
  id: number;
  propertyId: number;
  role: string;
  assignedAt: string;
  notifyOnOffer: boolean;
  notifyOnMessage: boolean;
  notifyOnStatusChange: boolean;
  notifyOnDocument: boolean;
  notifyOnNote: boolean;
  property?: {
    id: number;
    address: string;
    city: string;
    state: string;
    askingPrice?: number;
    status?: string;
    propertyType?: string;
    bedrooms?: number;
    bathrooms?: number;
  };
}

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  bio?: string;
  expertise?: string[];
  title?: string;
  timezone?: string;
  avatar?: string;
}

export interface UpdateNotificationPrefsInput {
  notifyEmail?: boolean;
  notifySms?: boolean;
  notifyPush?: boolean;
  dealAlerts?: boolean;
  instantAlerts?: boolean;
  dailyDigest?: boolean;
}

export interface UpdateDealNotificationPrefsInput {
  notifyOnOffer?: boolean;
  notifyOnMessage?: boolean;
  notifyOnStatusChange?: boolean;
  notifyOnDocument?: boolean;
  notifyOnNote?: boolean;
}

/**
 * Get current user's team profile
 */
export function useTeamProfile() {
  return useQuery({
    queryKey: ['team', 'profile'],
    queryFn: () => api.get<TeamProfile>('/api/team/profile'),
  });
}

/**
 * Update current user's team profile
 */
export function useUpdateTeamProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProfileInput) =>
      api.patch<TeamProfile>('/api/team/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });
}

/**
 * Update notification preferences
 */
export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateNotificationPrefsInput) =>
      api.patch<TeamProfile>('/api/team/profile/notifications', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'profile'] });
    },
  });
}

/**
 * Get all team members in the organization
 */
export function useTeamMembers() {
  return useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => api.get<TeamMember[]>('/api/team/members'),
  });
}

/**
 * Get a specific team member's profile
 */
export function useTeamMember(userId: string | null) {
  return useQuery({
    queryKey: ['team', 'members', userId],
    queryFn: () => api.get<TeamMember>(`/api/team/members/${userId}`),
    enabled: !!userId,
  });
}

export interface UpdateTeamMemberInput {
  name?: string;
  phone?: string;
  company?: string;
  title?: string;
  bio?: string;
  expertise?: string[];
  timezone?: string;
  role?: string;
}

/**
 * Update a team member's profile (admin only)
 */
export function useUpdateTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, ...data }: UpdateTeamMemberInput & { userId: string }) =>
      api.patch<TeamMember>(`/api/team/members/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });
}

/**
 * Get deals assigned to the current user
 */
export function useMyDealAssignments() {
  return useQuery({
    queryKey: ['team', 'my-deals'],
    queryFn: () => api.get<MyDealAssignment[]>('/api/team/my-deals'),
  });
}

/**
 * Update notification preferences for a specific deal
 */
export function useUpdateDealNotificationPrefs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ propertyId, ...data }: UpdateDealNotificationPrefsInput & { propertyId: number }) =>
      api.patch(`/api/team/deals/${propertyId}/notifications`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'my-deals'] });
    },
  });
}

/**
 * Common expertise options
 */
export const EXPERTISE_OPTIONS = [
  { value: 'acquisitions', label: 'Acquisitions' },
  { value: 'underwriting', label: 'Underwriting' },
  { value: 'due_diligence', label: 'Due Diligence' },
  { value: 'closing', label: 'Closing' },
  { value: 'negotiations', label: 'Negotiations' },
  { value: 'property_analysis', label: 'Property Analysis' },
  { value: 'market_research', label: 'Market Research' },
  { value: 'buyer_relations', label: 'Buyer Relations' },
  { value: 'seller_relations', label: 'Seller Relations' },
  { value: 'title_research', label: 'Title Research' },
  { value: 'legal_compliance', label: 'Legal/Compliance' },
  { value: 'financing', label: 'Financing' },
];

/**
 * Common timezone options
 */
export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
];

// =========================================================================
// Organization Management
// =========================================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  memberCount: number;
}

export interface InviteTeamMemberInput {
  email: string;
  role?: string;
}

export interface SyncContactsResult {
  created: number;
  skipped: number;
  total: number;
}

/**
 * Get current user's organization details
 */
export function useOrganization() {
  return useQuery({
    queryKey: ['team', 'organization'],
    queryFn: () => api.get<Organization>('/api/team/organization'),
  });
}

/**
 * Invite a user to join the organization
 */
export function useInviteTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InviteTeamMemberInput) =>
      api.post<{ id: string; email: string; name: string; role: string }>(
        '/api/team/invite',
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
      queryClient.invalidateQueries({ queryKey: ['team', 'organization'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

/**
 * Sync all organization members to contacts
 */
export function useSyncTeamContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<SyncContactsResult>('/api/team/sync-contacts'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });
}

/**
 * Role options for team members
 */
export const TEAM_ROLE_OPTIONS = [
  { value: 'team_member', label: 'Team Member' },
  { value: 'broker_assistant', label: 'Broker Assistant' },
  { value: 'transaction_coordinator', label: 'Transaction Coordinator' },
  { value: 'admin', label: 'Admin' },
];
