import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

export type ActivityEventType =
  | 'deal_created'
  | 'deal_updated'
  | 'deal_deleted'
  | 'deal_viewed'
  | 'deal_liked'
  | 'deal_passed'
  | 'offer_made'
  | 'offer_updated'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'offer_expired'
  | 'buyer_created'
  | 'buyer_updated'
  | 'buyer_contacted'
  | 'task_created'
  | 'task_assigned'
  | 'task_completed'
  | 'task_overdue'
  | 'compliance_check_passed'
  | 'compliance_check_failed'
  | 'compliance_issue_resolved'
  | 'document_uploaded'
  | 'document_signed'
  | 'message_sent'
  | 'team_member_added'
  | 'team_member_removed'
  | 'pipeline_stage_changed'
  | 'system_event';

export type ActivityResourceType =
  | 'deal'
  | 'buyer'
  | 'task'
  | 'compliance'
  | 'document'
  | 'message'
  | 'team'
  | 'offer'
  | 'pipeline'
  | 'system';

export type ActivityActorType = 'user' | 'system' | 'automation' | 'external';

export type ActivityImportance = 'low' | 'normal' | 'high' | 'critical';

export interface ActivityFeedEntry {
  id: string;
  organizationId?: string;
  eventType: ActivityEventType;
  timestamp: string;
  actor: {
    type: ActivityActorType;
    id?: string;
    name: string;
    avatar?: string;
    email?: string;
  };
  resource: {
    type: ActivityResourceType;
    id: string;
    name?: string;
    url?: string;
  };
  action: string;
  summary: string;
  details?: Record<string, any>;
  metadata?: {
    ip?: string;
    userAgent?: string;
    location?: string;
  };
  importance: ActivityImportance;
  readBy: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityFeedQueryParams {
  organizationId?: string;
  eventTypes?: ActivityEventType[];
  resourceTypes?: ActivityResourceType[];
  actorId?: string;
  startDate?: string;
  endDate?: string;
  importance?: ActivityImportance[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityFeedResponse {
  activities: ActivityFeedEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ActivityStatistics {
  totalActivities: number;
  byEventType: Record<string, number>;
  byResourceType: Record<string, number>;
  byImportance: Record<string, number>;
  dailyCount: { date: string; count: number }[];
}

export interface ActivityFilterOptions {
  eventTypes: string[];
  resourceTypes: string[];
  importanceLevels: string[];
  actors: { id: string; name: string }[];
}

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch activity feed with filters and pagination
 */
export function useActivityFeed(params: ActivityFeedQueryParams = {}) {
  const queryString = buildQueryString(params);

  return useQuery({
    queryKey: ['activity-feed', params],
    queryFn: async () => {
      const response = await api.get<ActivityFeedResponse>(`/api/activity-feed?${queryString}`);
      return response;
    },
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Fetch a single activity entry
 */
export function useActivityEntry(id?: string) {
  return useQuery({
    queryKey: ['activity-entry', id],
    queryFn: () => api.get<ActivityFeedEntry>(`/api/activity-feed/${id}`),
    enabled: !!id,
  });
}

/**
 * Fetch activity statistics
 */
export function useActivityStatistics(organizationId?: string, days: number = 7) {
  return useQuery({
    queryKey: ['activity-statistics', organizationId, days],
    queryFn: () =>
      api.get<ActivityStatistics>(`/api/activity-feed/statistics?organizationId=${organizationId}&days=${days}`),
    enabled: !!organizationId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Fetch unread count for current user
 */
export function useUnreadCount(organizationId?: string) {
  return useQuery({
    queryKey: ['activity-unread-count', organizationId],
    queryFn: () => api.get<{ unreadCount: number }>(`/api/activity-feed/unread-count?organizationId=${organizationId}`),
    enabled: !!organizationId,
    staleTime: 30000,
    refetchInterval: 60000, // Refetch every minute
  });
}

/**
 * Fetch available filter options
 */
export function useActivityFilterOptions(organizationId?: string) {
  return useQuery({
    queryKey: ['activity-filter-options', organizationId],
    queryFn: () =>
      api.get<ActivityFilterOptions>(
        `/api/activity-feed/filter-options${organizationId ? `?organizationId=${organizationId}` : ''}`
      ),
    staleTime: 300000, // 5 minutes
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Mark activities as read
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activityIds: string[]) => {
      const response = await api.post<{ updatedCount: number }>('/api/activity-feed/mark-read', { activityIds });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      queryClient.invalidateQueries({ queryKey: ['activity-unread-count'] });
    },
  });
}

/**
 * Create a new activity
 */
export function useCreateActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      organizationId?: string;
      eventType: ActivityEventType;
      actor: {
        type: ActivityActorType;
        id?: string;
        name: string;
      };
      resource: {
        type: ActivityResourceType;
        id: string;
        name?: string;
        url?: string;
      };
      action: string;
      summary: string;
      details?: Record<string, any>;
      importance?: ActivityImportance;
    }) => {
      const response = await api.post<ActivityFeedEntry>('/api/activity-feed', data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      queryClient.invalidateQueries({ queryKey: ['activity-statistics'] });
    },
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function buildQueryString(params: ActivityFeedQueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.organizationId) searchParams.set('organizationId', params.organizationId);
  if (params.eventTypes?.length) searchParams.set('eventTypes', params.eventTypes.join(','));
  if (params.resourceTypes?.length) searchParams.set('resourceTypes', params.resourceTypes.join(','));
  if (params.actorId) searchParams.set('actorId', params.actorId);
  if (params.startDate) searchParams.set('startDate', params.startDate);
  if (params.endDate) searchParams.set('endDate', params.endDate);
  if (params.importance?.length) searchParams.set('importance', params.importance.join(','));
  if (params.search) searchParams.set('search', params.search);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());

  return searchParams.toString();
}

// =============================================================================
// COLOR MAPPINGS
// =============================================================================

export const IMPORTANCE_COLORS = {
  low: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40',
  normal: 'text-accent-400 bg-accent-500/10 border-accent-500/40',
  high: 'text-amber-400 bg-amber-500/10 border-amber-500/40',
  critical: 'text-red-500 bg-red-600/20 border-red-600/60',
};

export const EVENT_TYPE_COLORS: Record<string, string> = {
  deal_created: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  deal_updated: 'text-blue-400 bg-blue-500/10 border-blue-500/40',
  deal_deleted: 'text-red-400 bg-red-500/10 border-red-500/40',
  deal_viewed: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40',
  deal_liked: 'text-pink-400 bg-pink-500/10 border-pink-500/40',
  deal_passed: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40',
  offer_made: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  offer_updated: 'text-blue-400 bg-blue-500/10 border-blue-500/40',
  offer_accepted: 'text-emerald-500 bg-emerald-600/20 border-emerald-600/60',
  offer_rejected: 'text-red-400 bg-red-500/10 border-red-500/40',
  offer_expired: 'text-amber-400 bg-amber-500/10 border-amber-500/40',
  buyer_created: 'text-purple-400 bg-purple-500/10 border-purple-500/40',
  buyer_updated: 'text-purple-400 bg-purple-500/10 border-purple-500/40',
  buyer_contacted: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/40',
  task_created: 'text-blue-400 bg-blue-500/10 border-blue-500/40',
  task_assigned: 'text-blue-400 bg-blue-500/10 border-blue-500/40',
  task_completed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  task_overdue: 'text-red-400 bg-red-500/10 border-red-500/40',
  compliance_check_passed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  compliance_check_failed: 'text-red-500 bg-red-600/20 border-red-600/60',
  compliance_issue_resolved: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  document_uploaded: 'text-blue-400 bg-blue-500/10 border-blue-500/40',
  document_signed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  message_sent: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/40',
  team_member_added: 'text-purple-400 bg-purple-500/10 border-purple-500/40',
  team_member_removed: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40',
  pipeline_stage_changed: 'text-blue-400 bg-blue-500/10 border-blue-500/40',
  system_event: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40',
};

export const RESOURCE_TYPE_COLORS: Record<string, string> = {
  deal: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  buyer: 'text-purple-400 bg-purple-500/10 border-purple-500/40',
  task: 'text-blue-400 bg-blue-500/10 border-blue-500/40',
  compliance: 'text-amber-400 bg-amber-500/10 border-amber-500/40',
  document: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/40',
  message: 'text-pink-400 bg-pink-500/10 border-pink-500/40',
  team: 'text-purple-400 bg-purple-500/10 border-purple-500/40',
  offer: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  pipeline: 'text-blue-400 bg-blue-500/10 border-blue-500/40',
  system: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40',
};

// =============================================================================
// DISPLAY LABELS
// =============================================================================

export const EVENT_TYPE_LABELS: Record<ActivityEventType, string> = {
  deal_created: 'Deal Created',
  deal_updated: 'Deal Updated',
  deal_deleted: 'Deal Deleted',
  deal_viewed: 'Deal Viewed',
  deal_liked: 'Deal Liked',
  deal_passed: 'Deal Passed',
  offer_made: 'Offer Made',
  offer_updated: 'Offer Updated',
  offer_accepted: 'Offer Accepted',
  offer_rejected: 'Offer Rejected',
  offer_expired: 'Offer Expired',
  buyer_created: 'Buyer Added',
  buyer_updated: 'Buyer Updated',
  buyer_contacted: 'Buyer Contacted',
  task_created: 'Task Created',
  task_assigned: 'Task Assigned',
  task_completed: 'Task Completed',
  task_overdue: 'Task Overdue',
  compliance_check_passed: 'Compliance Passed',
  compliance_check_failed: 'Compliance Failed',
  compliance_issue_resolved: 'Issue Resolved',
  document_uploaded: 'Document Uploaded',
  document_signed: 'Document Signed',
  message_sent: 'Message Sent',
  team_member_added: 'Member Added',
  team_member_removed: 'Member Removed',
  pipeline_stage_changed: 'Stage Changed',
  system_event: 'System Event',
};

export const RESOURCE_TYPE_LABELS: Record<ActivityResourceType, string> = {
  deal: 'Deal',
  buyer: 'Buyer',
  task: 'Task',
  compliance: 'Compliance',
  document: 'Document',
  message: 'Message',
  team: 'Team',
  offer: 'Offer',
  pipeline: 'Pipeline',
  system: 'System',
};

export const ACTOR_TYPE_LABELS: Record<ActivityActorType, string> = {
  user: 'User',
  system: 'System',
  automation: 'Automation',
  external: 'External',
};

export const IMPORTANCE_LABELS: Record<ActivityImportance, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  critical: 'Critical',
};

// =============================================================================
// ICONS
// =============================================================================

export const EVENT_TYPE_ICONS: Record<string, string> = {
  deal_created: 'plus',
  deal_updated: 'edit',
  deal_deleted: 'trash',
  deal_viewed: 'eye',
  deal_liked: 'heart',
  deal_passed: 'x',
  offer_made: 'dollar-sign',
  offer_updated: 'edit',
  offer_accepted: 'check-circle',
  offer_rejected: 'x-circle',
  offer_expired: 'clock',
  buyer_created: 'user-plus',
  buyer_updated: 'user',
  buyer_contacted: 'phone',
  task_created: 'clipboard',
  task_assigned: 'user-check',
  task_completed: 'check-square',
  task_overdue: 'alert-circle',
  compliance_check_passed: 'shield-check',
  compliance_check_failed: 'shield-x',
  compliance_issue_resolved: 'shield',
  document_uploaded: 'upload',
  document_signed: 'file-check',
  message_sent: 'message-circle',
  team_member_added: 'user-plus',
  team_member_removed: 'user-minus',
  pipeline_stage_changed: 'arrow-right',
  system_event: 'settings',
};
