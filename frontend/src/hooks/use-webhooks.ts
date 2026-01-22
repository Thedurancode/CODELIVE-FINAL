/**
 * React Query hooks for Webhook Management API
 *
 * Provides hooks for managing webhook subscriptions,
 * viewing delivery logs, and testing webhooks.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

export interface Webhook {
  id: string;
  name: string;
  description?: string;
  url: string;
  secret?: string;
  events: string[];
  headers?: Record<string, string>;
  active: boolean;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: 'success' | 'failed' | null;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  retryEnabled: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  createdAt: string;
  updatedAt: string;
  stats: {
    successRate: number;
    totalDeliveries: number;
    isHealthy: boolean;
  };
  deliveryStats?: {
    total: number;
    successful: number;
    failed: number;
    pendingRetries: number;
    averageResponseTime: number;
  };
}

export interface WebhookDelivery {
  id: number;
  eventId: string;
  eventType: string;
  statusCode: number | null;
  responseTime: number | null;
  success: boolean;
  error: string | null;
  retryCount: number;
  deliveredAt: string;
}

export interface CreateWebhookInput {
  name: string;
  description?: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  retryEnabled?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface UpdateWebhookInput {
  name?: string;
  description?: string;
  url?: string;
  events?: string[];
  headers?: Record<string, string>;
  active?: boolean;
  retryEnabled?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface EventTypes {
  events: string[];
  categories: {
    deal: string[];
    offer: string[];
    compliance: string[];
  };
}

export interface WebhookTestResult {
  delivered: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const webhookKeys = {
  all: ['webhooks'] as const,
  list: () => [...webhookKeys.all, 'list'] as const,
  detail: (id: string) => [...webhookKeys.all, 'detail', id] as const,
  deliveries: (id: string) => [...webhookKeys.all, 'deliveries', id] as const,
  eventTypes: () => [...webhookKeys.all, 'eventTypes'] as const,
  stats: () => [...webhookKeys.all, 'stats'] as const,
};

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch all webhooks for the current user
 */
export function useWebhooks(options?: { includeInactive?: boolean }) {
  return useQuery({
    queryKey: webhookKeys.list(),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.includeInactive) {
        params.append('includeInactive', 'true');
      }
      const data = await api.get<Webhook[]>(
        `/webhooks/manage?${params.toString()}`
      );
      return data;
    },
  });
}

/**
 * Fetch a single webhook by ID
 */
export function useWebhook(id: string | undefined) {
  return useQuery({
    queryKey: webhookKeys.detail(id!),
    queryFn: async () => {
      const data = await api.get<Webhook>(
        `/webhooks/manage/${id}`
      );
      return data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch delivery logs for a webhook
 */
export function useWebhookDeliveries(
  webhookId: string | undefined,
  options?: { limit?: number; offset?: number; successOnly?: boolean }
) {
  return useQuery({
    queryKey: [...webhookKeys.deliveries(webhookId!), options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.offset) params.append('offset', options.offset.toString());
      if (options?.successOnly !== undefined) {
        params.append('successOnly', options.successOnly.toString());
      }
      const data = await api.get<WebhookDelivery[]>(
        `/webhooks/manage/${webhookId}/deliveries?${params.toString()}`
      );
      return data;
    },
    enabled: !!webhookId,
  });
}

/**
 * Fetch available event types
 */
export function useWebhookEventTypes() {
  return useQuery({
    queryKey: webhookKeys.eventTypes(),
    queryFn: async () => {
      const data = await api.get<EventTypes>(
        '/webhooks/manage/events/types'
      );
      return data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Fetch global webhook statistics
 */
interface WebhookStats {
  totalEvents: number;
  deliveredEvents: number;
  failedEvents: number;
  pendingRetries: number;
  activeWebhooks: number;
  lastEventAt: string | null;
}

export function useWebhookStats() {
  return useQuery({
    queryKey: webhookKeys.stats(),
    queryFn: async () => {
      const data = await api.get<WebhookStats>('/webhooks/manage/stats/global');
      return data;
    },
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Create a new webhook
 */
export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWebhookInput) => {
      const data = await api.post<Webhook & { secret: string }>(
        '/webhooks/manage',
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list() });
    },
  });
}

/**
 * Update a webhook
 */
export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateWebhookInput & { id: string }) => {
      const data = await api.put<Webhook>(`/webhooks/manage/${id}`, input);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list() });
      queryClient.invalidateQueries({ queryKey: webhookKeys.detail(variables.id) });
    },
  });
}

/**
 * Delete a webhook
 */
export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/webhooks/manage/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list() });
    },
  });
}

/**
 * Regenerate webhook secret
 */
export function useRegenerateWebhookSecret() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await api.post<{ secret: string }>(`/webhooks/manage/${id}/secret`);
      return data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.detail(id) });
    },
  });
}

/**
 * Reset webhook failures and re-enable
 */
export function useResetWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await api.post<{ id: string; active: boolean; consecutiveFailures: number }>(
        `/webhooks/manage/${id}/reset`
      );
      return data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list() });
      queryClient.invalidateQueries({ queryKey: webhookKeys.detail(id) });
    },
  });
}

/**
 * Test a webhook
 */
export function useTestWebhook() {
  return useMutation({
    mutationFn: async (id: string) => {
      const data = await api.post<WebhookTestResult>(`/webhooks/manage/${id}/test`);
      return data;
    },
  });
}

/**
 * Retry a failed delivery
 */
export function useRetryDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ webhookId, deliveryId }: { webhookId: string; deliveryId: number }) => {
      const data = await api.post<WebhookTestResult>(
        `/webhooks/manage/${webhookId}/deliveries/${deliveryId}/retry`
      );
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.deliveries(variables.webhookId) });
      queryClient.invalidateQueries({ queryKey: webhookKeys.detail(variables.webhookId) });
    },
  });
}
