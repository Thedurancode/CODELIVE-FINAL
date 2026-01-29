'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ============================================================================
// TYPES
// ============================================================================

export interface HAConfig {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  lastConnected: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface HAEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
  friendly_name?: string;
  domain?: string;
}

export interface HADevice {
  entity_id: string;
  state: string;
  friendly_name: string;
  domain: string;
  attributes: Record<string, any>;
}

export interface HATestResult {
  success: boolean;
  version?: string;
  error?: string;
}

// ============================================================================
// CONFIGURATION HOOKS
// ============================================================================

/**
 * List all Home Assistant configurations
 */
export function useHAConfigs() {
  return useQuery({
    queryKey: ['ha-configs'],
    queryFn: () => api.get<HAConfig[]>('/api/home-assistant/configs'),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Get a specific configuration
 */
export function useHAConfig(configId: string) {
  return useQuery({
    queryKey: ['ha-config', configId],
    queryFn: () => api.get<HAConfig>(`/api/home-assistant/configs/${configId}`),
    enabled: !!configId,
  });
}

/**
 * Create a new Home Assistant configuration
 */
export function useCreateHAConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; url: string; token: string; isDefault?: boolean }) =>
      api.post<HAConfig>('/api/home-assistant/configs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ha-configs'] });
    },
  });
}

/**
 * Update a configuration
 */
export function useUpdateHAConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; url?: string; token?: string; isDefault?: boolean }) =>
      api.put<HAConfig>(`/api/home-assistant/configs/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['ha-configs'] });
      queryClient.invalidateQueries({ queryKey: ['ha-config', id] });
    },
  });
}

/**
 * Delete a configuration
 */
export function useDeleteHAConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/home-assistant/configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ha-configs'] });
    },
  });
}

/**
 * Test connection to Home Assistant
 */
export function useTestHAConnection() {
  return useMutation({
    mutationFn: (data: { url: string; token: string }) =>
      api.post<HATestResult>('/api/home-assistant/configs/test', data),
  });
}

// ============================================================================
// STATE HOOKS
// ============================================================================

/**
 * Get all entity states for a configuration
 */
export function useHAStates(configId: string | undefined) {
  return useQuery({
    queryKey: ['ha-states', configId],
    queryFn: () => api.get<HAEntityState[]>(`/api/home-assistant/configs/${configId}/states`),
    enabled: !!configId,
    staleTime: 5000, // 5 seconds
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

/**
 * Get a specific entity state
 */
export function useHAState(configId: string | undefined, entityId: string | undefined) {
  return useQuery({
    queryKey: ['ha-state', configId, entityId],
    queryFn: () => api.get<HAEntityState>(`/api/home-assistant/configs/${configId}/states/${entityId}`),
    enabled: !!configId && !!entityId,
    staleTime: 3000,
  });
}

/**
 * Get entities by domain
 */
export function useHAEntitiesByDomain(configId: string | undefined, domain: string) {
  return useQuery({
    queryKey: ['ha-entities', configId, domain],
    queryFn: () => api.get<HAEntityState[]>(`/api/home-assistant/configs/${configId}/entities/${domain}`),
    enabled: !!configId && !!domain,
    staleTime: 5000,
  });
}

/**
 * Get all lights
 */
export function useHALights(configId: string | undefined) {
  return useHAEntitiesByDomain(configId, 'light');
}

/**
 * Get all switches
 */
export function useHASwitches(configId: string | undefined) {
  return useHAEntitiesByDomain(configId, 'switch');
}

/**
 * Get all climate devices
 */
export function useHAClimate(configId: string | undefined) {
  return useHAEntitiesByDomain(configId, 'climate');
}

/**
 * Get all media players
 */
export function useHAMediaPlayers(configId: string | undefined) {
  return useHAEntitiesByDomain(configId, 'media_player');
}

/**
 * Get all scenes
 */
export function useHAScenes(configId: string | undefined) {
  return useHAEntitiesByDomain(configId, 'scene');
}

/**
 * Get all sensors
 */
export function useHASensors(configId: string | undefined) {
  return useHAEntitiesByDomain(configId, 'sensor');
}

// ============================================================================
// ACTION HOOKS
// ============================================================================

/**
 * Turn on an entity
 */
export function useHATurnOn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configId, entityId, options }: { configId: string; entityId: string; options?: Record<string, any> }) =>
      api.post(`/api/home-assistant/configs/${configId}/entities/${entityId}/turn_on`, options || {}),
    onSuccess: (_, { configId }) => {
      queryClient.invalidateQueries({ queryKey: ['ha-states', configId] });
    },
  });
}

/**
 * Turn off an entity
 */
export function useHATurnOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configId, entityId }: { configId: string; entityId: string }) =>
      api.post(`/api/home-assistant/configs/${configId}/entities/${entityId}/turn_off`, {}),
    onSuccess: (_, { configId }) => {
      queryClient.invalidateQueries({ queryKey: ['ha-states', configId] });
    },
  });
}

/**
 * Toggle an entity
 */
export function useHAToggle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configId, entityId }: { configId: string; entityId: string }) =>
      api.post(`/api/home-assistant/configs/${configId}/entities/${entityId}/toggle`, {}),
    onSuccess: (_, { configId }) => {
      queryClient.invalidateQueries({ queryKey: ['ha-states', configId] });
    },
  });
}

/**
 * Set light brightness (0-255)
 */
export function useHASetBrightness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configId, entityId, brightness }: { configId: string; entityId: string; brightness: number }) =>
      api.post(`/api/home-assistant/configs/${configId}/lights/${entityId}/brightness`, { brightness }),
    onSuccess: (_, { configId }) => {
      queryClient.invalidateQueries({ queryKey: ['ha-states', configId] });
    },
  });
}

/**
 * Set light color
 */
export function useHASetColor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      configId,
      entityId,
      color,
    }: {
      configId: string;
      entityId: string;
      color: { r: number; g: number; b: number } | string;
    }) => {
      const body = typeof color === 'string' ? { hex_color: color } : { rgb_color: [color.r, color.g, color.b] };
      return api.post(`/api/home-assistant/configs/${configId}/lights/${entityId}/color`, body);
    },
    onSuccess: (_, { configId }) => {
      queryClient.invalidateQueries({ queryKey: ['ha-states', configId] });
    },
  });
}

/**
 * Set climate temperature
 */
export function useHASetTemperature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configId, entityId, temperature }: { configId: string; entityId: string; temperature: number }) =>
      api.post(`/api/home-assistant/configs/${configId}/climate/${entityId}/temperature`, { temperature }),
    onSuccess: (_, { configId }) => {
      queryClient.invalidateQueries({ queryKey: ['ha-states', configId] });
    },
  });
}

/**
 * Activate a scene
 */
export function useHAActivateScene() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configId, sceneId }: { configId: string; sceneId: string }) =>
      api.post(`/api/home-assistant/configs/${configId}/scenes/${sceneId}/activate`, {}),
    onSuccess: (_, { configId }) => {
      queryClient.invalidateQueries({ queryKey: ['ha-states', configId] });
    },
  });
}

/**
 * Call any Home Assistant service
 */
export function useHACallService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      configId,
      domain,
      service,
      entityId,
      data,
    }: {
      configId: string;
      domain: string;
      service: string;
      entityId?: string;
      data?: Record<string, any>;
    }) =>
      api.post(`/api/home-assistant/configs/${configId}/services/${domain}/${service}`, {
        entity_id: entityId,
        ...data,
      }),
    onSuccess: (_, { configId }) => {
      queryClient.invalidateQueries({ queryKey: ['ha-states', configId] });
    },
  });
}

// ============================================================================
// HELPER HOOKS
// ============================================================================

/**
 * Get default configuration or first available
 */
export function useDefaultHAConfig() {
  const { data: configs, isLoading } = useHAConfigs();

  const defaultConfig = configs?.find((c) => c.isDefault) || configs?.[0];

  return {
    config: defaultConfig,
    isLoading,
    hasConfig: !!defaultConfig,
  };
}

/**
 * Group entities by domain
 */
export function useHAEntitiesGrouped(configId: string | undefined) {
  const { data: states, isLoading, error } = useHAStates(configId);

  const grouped = states?.reduce(
    (acc, entity) => {
      const domain = entity.entity_id.split('.')[0];
      if (!acc[domain]) {
        acc[domain] = [];
      }
      acc[domain].push({
        ...entity,
        domain,
        friendly_name: entity.attributes?.friendly_name || entity.entity_id,
      });
      return acc;
    },
    {} as Record<string, HADevice[]>
  );

  return {
    entities: grouped,
    isLoading,
    error,
  };
}
