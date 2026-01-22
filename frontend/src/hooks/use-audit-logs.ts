import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

export interface AuditLogEntry {
  id: number;
  sequenceNumber: number;
  previousHash: string;
  currentHash: string;
  timestamp: string;
  eventType: string;
  eventCategory: 'access' | 'modification' | 'verification' | 'decision' | 'system' | 'security';
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  actorType: 'user' | 'system' | 'api' | 'automation' | 'external';
  actorId?: string;
  actorName?: string;
  actorIp?: string;
  actorUserAgent?: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  action: string;
  outcome: 'success' | 'failure' | 'partial' | 'pending';
  details: Record<string, any>;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
    diff?: string[];
  };
  complianceContext?: {
    propertyId?: number;
    checkId?: number;
    ruleId?: string;
    state?: string;
    requirement?: string;
  };
  signature?: string;
  verified: boolean;
  exportedAt?: string;
  retentionDate: string;
  createdAt: string;
}

export interface AuditLogQueryParams {
  startDate?: string;
  endDate?: string;
  eventTypes?: string[];
  eventCategories?: ('access' | 'modification' | 'verification' | 'decision' | 'system' | 'security')[];
  severities?: ('debug' | 'info' | 'warning' | 'error' | 'critical')[];
  actorTypes?: ('user' | 'system' | 'api' | 'automation' | 'external')[];
  actorId?: string;
  resourceTypes?: string[];
  resourceId?: string;
  outcomes?: ('success' | 'failure' | 'partial' | 'pending')[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogResponse {
  logs: AuditLogEntry[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export interface AuditStatistics {
  totalEntries: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  byOutcome: Record<string, number>;
  chainIntegrity: boolean;
  oldestEntry?: string;
  newestEntry?: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  entriesChecked: number;
  firstInvalid?: number;
  errors: string[];
  verifiedAt: string;
}

export interface RetentionInfo {
  retentionYears: number;
  totalEntries: number;
  expiringWithinYear: number;
  oldestEntry?: string;
  newestEntry?: string;
  oldestRetentionDate?: string;
  newestRetentionDate?: string;
}

export interface FilterOptions {
  eventTypes: string[];
  eventCategories: string[];
  severities: string[];
  actorTypes: string[];
  outcomes: string[];
  resourceTypes: string[];
  actorIds: string[];
}

export interface ExportParams {
  startDate: string;
  endDate: string;
  eventTypes?: string[];
  resourceTypes?: string[];
  includeDetails?: boolean;
  format?: 'json' | 'csv';
}

export interface ExportResult {
  exportId: string;
  count: number;
  chainValid: boolean;
  exportedAt: string;
  logs?: any[];
}

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch audit logs with filters and pagination
 */
export function useAuditLogs(params: AuditLogQueryParams = {}) {
  const queryString = buildQueryString(params);

  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () => {
      const response = await api.get<AuditLogResponse>(`/api/audit-logs?${queryString}`);
      return response;
    },
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Fetch a single audit log entry
 */
export function useAuditLogEntry(id?: number) {
  return useQuery({
    queryKey: ['audit-log', id],
    queryFn: () => api.get<AuditLogEntry>(`/api/audit-logs/${id}`),
    enabled: !!id,
  });
}

/**
 * Fetch audit statistics
 */
export function useAuditStatistics(days: number = 30) {
  return useQuery({
    queryKey: ['audit-statistics', days],
    queryFn: () => api.get<AuditStatistics>(`/api/audit-logs/statistics?days=${days}`),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Fetch audit history for a specific resource
 */
export function useResourceAuditHistory(resourceType?: string, resourceId?: string) {
  return useQuery({
    queryKey: ['audit-resource-history', resourceType, resourceId],
    queryFn: () => api.get<AuditLogEntry[]>(`/api/audit-logs/resource/${resourceType}/${resourceId}`),
    enabled: !!resourceType && !!resourceId,
  });
}

/**
 * Fetch retention policy information
 */
export function useRetentionInfo() {
  return useQuery({
    queryKey: ['audit-retention-info'],
    queryFn: () => api.get<RetentionInfo>(`/api/audit-logs/retention/info`),
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Fetch available filter options
 */
export function useAuditFilterOptions() {
  return useQuery({
    queryKey: ['audit-filter-options'],
    queryFn: () => api.get<FilterOptions>(`/api/audit-logs/filter-options`),
    staleTime: 300000, // 5 minutes
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Verify audit log chain integrity
 */
export function useVerifyChain() {
  return useMutation({
    mutationFn: async (fromSequence?: number) => {
      const response = await api.post<ChainVerificationResult>('/api/audit-logs/verify-chain', {
        fromSequence,
      });
      return response;
    },
  });
}

/**
 * Export audit logs
 */
export function useExportAuditLogs() {
  return useMutation({
    mutationFn: async (params: ExportParams) => {
      const response = await api.post<ExportResult>('/api/audit-logs/export', params);
      return response;
    },
  });
}

/**
 * Cleanup expired audit logs
 */
export function useCleanupExpiredLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ deletedCount: number; message: string }>('/api/audit-logs/retention/cleanup', {});
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['audit-statistics'] });
      queryClient.invalidateQueries({ queryKey: ['audit-retention-info'] });
    },
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function buildQueryString(params: AuditLogQueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.startDate) searchParams.set('startDate', params.startDate);
  if (params.endDate) searchParams.set('endDate', params.endDate);
  if (params.eventTypes?.length) searchParams.set('eventTypes', params.eventTypes.join(','));
  if (params.eventCategories?.length) searchParams.set('eventCategories', params.eventCategories.join(','));
  if (params.severities?.length) searchParams.set('severities', params.severities.join(','));
  if (params.actorTypes?.length) searchParams.set('actorTypes', params.actorTypes.join(','));
  if (params.actorId) searchParams.set('actorId', params.actorId);
  if (params.resourceTypes?.length) searchParams.set('resourceTypes', params.resourceTypes.join(','));
  if (params.resourceId) searchParams.set('resourceId', params.resourceId);
  if (params.outcomes?.length) searchParams.set('outcomes', params.outcomes.join(','));
  if (params.search) searchParams.set('search', params.search);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());

  return searchParams.toString();
}

// Severity color mapping
export const SEVERITY_COLORS = {
  debug: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40',
  info: 'text-accent-400 bg-accent-500/10 border-accent-500/40',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/40',
  error: 'text-red-400 bg-red-500/10 border-red-500/40',
  critical: 'text-red-500 bg-red-600/20 border-red-600/60',
};

// Category color mapping
export const CATEGORY_COLORS = {
  access: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/40',
  modification: 'text-purple-400 bg-purple-500/10 border-purple-500/40',
  verification: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  decision: 'text-amber-400 bg-amber-500/10 border-amber-500/40',
  system: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40',
  security: 'text-red-400 bg-red-500/10 border-red-500/40',
};

// Outcome color mapping
export const OUTCOME_COLORS = {
  success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  failure: 'text-red-400 bg-red-500/10 border-red-500/40',
  partial: 'text-amber-400 bg-amber-500/10 border-amber-500/40',
  pending: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40',
};

// Actor type labels
export const ACTOR_TYPE_LABELS = {
  user: 'User',
  system: 'System',
  api: 'API',
  automation: 'Automation',
  external: 'External',
};

// Category labels
export const CATEGORY_LABELS = {
  access: 'Access',
  modification: 'Modification',
  verification: 'Verification',
  decision: 'Decision',
  system: 'System',
  security: 'Security',
};
