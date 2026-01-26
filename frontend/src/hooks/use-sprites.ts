/**
 * Sprites React Query Hooks
 *
 * Custom hooks for Sprites integration using TanStack Query.
 * Provides data fetching, mutations, and cache management for sprites.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Sprite,
  SpriteCheckpoint,
  SpriteSession,
  SpriteTerminalInfo,
  SpritesConfig,
  CreateSpriteOptions,
  SpriteService,
  CreateServiceOptions,
  ServiceLogsResponse,
  InstalledMcpServer,
  McpEnvVar,
  AutoStartServerInfo,
  AutoStartResult,
  McpUpdateCheckResult,
  McpServerUpdateResult,
  McpBulkUpdateResult,
  McpServerUpdateInfo,
} from '@/types/sprite';
import { useSpriteStore } from '@/stores/sprite-store';

// Query keys
export const spriteKeys = {
  all: ['sprites'] as const,
  lists: () => [...spriteKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...spriteKeys.lists(), filters] as const,
  details: () => [...spriteKeys.all, 'detail'] as const,
  detail: (id: string) => [...spriteKeys.details(), id] as const,
  byProject: (projectId: string) => [...spriteKeys.all, 'project', projectId] as const,
  checkpoints: (spriteId: string) => [...spriteKeys.all, 'checkpoints', spriteId] as const,
  sessions: (spriteId: string) => [...spriteKeys.all, 'sessions', spriteId] as const,
  terminal: (spriteId: string) => [...spriteKeys.all, 'terminal', spriteId] as const,
  services: (spriteId: string) => [...spriteKeys.all, 'services', spriteId] as const,
  service: (spriteId: string, serviceId: string) => [...spriteKeys.services(spriteId), serviceId] as const,
  serviceLogs: (spriteId: string, serviceId: string) => [...spriteKeys.service(spriteId, serviceId), 'logs'] as const,
  config: () => [...spriteKeys.all, 'config'] as const,
  // Git & PR keys
  branchStatus: (spriteId: string) => [...spriteKeys.all, 'git', 'status', spriteId] as const,
  pullRequest: (spriteId: string) => [...spriteKeys.all, 'pr', spriteId] as const,
  // MCP keys
  mcpHealth: (spriteId: string) => [...spriteKeys.all, 'mcp', 'health', spriteId] as const,
  mcpTools: (spriteId: string) => [...spriteKeys.all, 'mcp', 'tools', spriteId] as const,
  // MCP Registry keys
  mcpRegistry: () => [...spriteKeys.all, 'mcp-registry'] as const,
  mcpRegistryServers: (search?: string) => [...spriteKeys.mcpRegistry(), 'servers', search] as const,
  mcpRegistryPopular: () => [...spriteKeys.mcpRegistry(), 'popular'] as const,
  mcpRegistryServer: (name: string) => [...spriteKeys.mcpRegistry(), 'server', name] as const,
  // MCP Server Config keys (installed servers on sprite)
  mcpInstalledServers: (spriteId: string) => [...spriteKeys.all, 'mcp', 'installed', spriteId] as const,
  mcpInstalledServer: (spriteId: string, serverName: string) => [...spriteKeys.mcpInstalledServers(spriteId), serverName] as const,
  mcpAutoStart: (spriteId: string) => [...spriteKeys.all, 'mcp', 'auto-start', spriteId] as const,
  // MCP Update keys
  mcpUpdates: (spriteId: string) => [...spriteKeys.all, 'mcp', 'updates', spriteId] as const,
  mcpServerUpdate: (spriteId: string, serverName: string) => [...spriteKeys.mcpUpdates(spriteId), serverName] as const,
};

// ============================================================================
// SPRITES QUERIES
// ============================================================================

/**
 * Fetch all sprites for the organization
 */
export function useSprites(options?: { includeDeleted?: boolean }) {
  const params = new URLSearchParams();
  if (options?.includeDeleted) {
    params.set('includeDeleted', 'true');
  }

  return useQuery({
    queryKey: spriteKeys.list(options),
    // Note: api.get already extracts data.data from response
    queryFn: () =>
      api.get<Sprite[]>(
        `/api/sprites${params.toString() ? `?${params.toString()}` : ''}`
      ),
  });
}

/**
 * Fetch a single sprite by ID
 */
export function useSprite(id: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.detail(id ?? ''),
    // Note: api.get already extracts data.data from response
    queryFn: () => api.get<Sprite>(`/api/sprites/${id}`),
    enabled: !!id,
  });
}

/**
 * Fetch sprite for a specific project
 */
export function useSpriteByProject(projectId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.byProject(projectId ?? ''),
    queryFn: async () => {
      // Note: api.get already extracts data.data from response
      const sprite = await api.get<Sprite | null>(
        `/api/sprites/project/${projectId}`
      );
      console.log('[useSpriteByProject] Sprite for', projectId, ':', sprite);
      return sprite;
    },
    enabled: !!projectId,
  });
}

/**
 * Fetch checkpoints for a sprite
 */
export function useSpriteCheckpoints(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.checkpoints(spriteId ?? ''),
    // Note: api.get already extracts data.data from response
    queryFn: () =>
      api.get<SpriteCheckpoint[]>(`/api/sprites/${spriteId}/checkpoints`),
    enabled: !!spriteId,
  });
}

/**
 * Fetch exec sessions for a sprite
 */
export function useSpriteSessions(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.sessions(spriteId ?? ''),
    // Note: api.get already extracts data.data from response
    queryFn: () =>
      api.get<SpriteSession[]>(`/api/sprites/${spriteId}/sessions`),
    enabled: !!spriteId,
  });
}

/**
 * Get terminal WebSocket connection info
 */
export function useSpriteTerminalInfo(
  spriteId: string | null | undefined,
  options?: { cols?: number; rows?: number; sessionId?: string }
) {
  const params = new URLSearchParams();
  if (options?.cols) params.set('cols', options.cols.toString());
  if (options?.rows) params.set('rows', options.rows.toString());
  if (options?.sessionId) params.set('sessionId', options.sessionId);

  return useQuery({
    queryKey: spriteKeys.terminal(spriteId ?? ''),
    // Note: api.get already extracts data.data from response
    queryFn: () =>
      api.get<SpriteTerminalInfo>(
        `/api/sprites/${spriteId}/terminal${params.toString() ? `?${params.toString()}` : ''}`
      ),
    enabled: !!spriteId,
    // Don't cache terminal info - always get fresh connection
    staleTime: 0,
    gcTime: 0,
  });
}

/**
 * Get Sprites configuration status
 */
export function useSpritesConfig() {
  return useQuery({
    queryKey: spriteKeys.config(),
    // Note: api.get already extracts data.data from response
    queryFn: () => api.get<SpritesConfig>('/api/sprites/config'),
    staleTime: 30000, // Cache for 30 seconds
  });
}

// ============================================================================
// SPRITES MUTATIONS
// ============================================================================

/**
 * Create a new sprite for a project
 */
export function useCreateSprite() {
  const queryClient = useQueryClient();
  const setActiveSprite = useSpriteStore((state) => state.setActiveSprite);

  return useMutation({
    mutationFn: async (options: CreateSpriteOptions) => {
      // Note: api.post already extracts data.data from response
      const sprite = await api.post<Sprite>('/api/sprites', options);
      return sprite;
    },
    onSuccess: (sprite) => {
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: spriteKeys.lists() });
      // Set in cache
      queryClient.setQueryData(spriteKeys.detail(sprite.id), sprite);
      queryClient.setQueryData(spriteKeys.byProject(sprite.projectId), sprite);
      // Update store
      setActiveSprite(sprite.projectId, sprite);
    },
  });
}

/**
 * Delete a sprite
 */
export function useDeleteSprite() {
  const queryClient = useQueryClient();
  const removeActiveSprite = useSpriteStore((state) => state.removeActiveSprite);

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await api.delete(`/api/sprites/${id}`);
      return { id, projectId };
    },
    onSuccess: ({ id, projectId }) => {
      // Invalidate all sprite queries
      queryClient.invalidateQueries({ queryKey: spriteKeys.all });
      // Remove from cache
      queryClient.removeQueries({ queryKey: spriteKeys.detail(id) });
      queryClient.removeQueries({ queryKey: spriteKeys.byProject(projectId) });
      // Update store
      removeActiveSprite(projectId);
    },
  });
}

/**
 * Stop a running sprite
 */
export function useStopSprite() {
  const queryClient = useQueryClient();
  const updateSpriteStatus = useSpriteStore((state) => state.updateSpriteStatus);

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      // Note: api.post already extracts data.data from response
      const sprite = await api.post<Sprite>(`/api/sprites/${id}/stop`);
      return { sprite, projectId };
    },
    onMutate: async ({ projectId }) => {
      // Optimistic update
      updateSpriteStatus(projectId, 'stopped');
    },
    onSuccess: ({ sprite, projectId }) => {
      // Update cache
      queryClient.setQueryData(spriteKeys.detail(sprite.id), sprite);
      queryClient.setQueryData(spriteKeys.byProject(projectId), sprite);
      queryClient.invalidateQueries({ queryKey: spriteKeys.lists() });
    },
    onError: (_, { projectId }) => {
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: spriteKeys.byProject(projectId) });
    },
  });
}

/**
 * Resume a stopped or hibernating sprite
 */
export function useResumeSprite() {
  const queryClient = useQueryClient();
  const updateSpriteStatus = useSpriteStore((state) => state.updateSpriteStatus);
  const setActiveSprite = useSpriteStore((state) => state.setActiveSprite);

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      console.log('[useResumeSprite] Resuming sprite:', id);
      // Note: api.post already extracts data.data from response
      const sprite = await api.post<Sprite>(`/api/sprites/${id}/resume`);
      console.log('[useResumeSprite] Resume complete, sprite status:', sprite.status);
      return { sprite, projectId };
    },
    onMutate: async ({ projectId }) => {
      // Optimistic update to 'restoring' status
      updateSpriteStatus(projectId, 'restoring');
    },
    onSuccess: ({ sprite, projectId }) => {
      console.log('[useResumeSprite] onSuccess - updating cache with status:', sprite.status);
      // Update cache with returned sprite (should be 'running' status from backend)
      queryClient.setQueryData(spriteKeys.detail(sprite.id), sprite);
      queryClient.setQueryData(spriteKeys.byProject(projectId), sprite);
      queryClient.invalidateQueries({ queryKey: spriteKeys.lists() });

      // Update store with new sprite data so terminal can access it immediately
      setActiveSprite(projectId, sprite);

      // Also update store status to match backend response
      if (sprite.status) {
        updateSpriteStatus(projectId, sprite.status);
      }
    },
    onError: (error, { projectId }) => {
      console.error('[useResumeSprite] Error:', error);
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: spriteKeys.byProject(projectId) });
    },
  });
}

/**
 * Initialize or re-initialize a sprite (clone repo, setup Claude)
 */
export function useInitializeSprite() {
  const queryClient = useQueryClient();
  const updateSpriteStatus = useSpriteStore((state) => state.updateSpriteStatus);

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      console.log('[useInitializeSprite] Starting initialization for sprite:', id);
      // Note: api.post already extracts data.data from response
      const sprite = await api.post<Sprite>(`/api/sprites/${id}/initialize`);
      console.log('[useInitializeSprite] Initialization complete:', sprite);
      return { sprite, projectId };
    },
    onMutate: async ({ projectId }) => {
      console.log('[useInitializeSprite] onMutate - setting status to initializing');
      // Optimistic update to 'initializing' status
      updateSpriteStatus(projectId, 'initializing');
    },
    onSuccess: ({ sprite, projectId }) => {
      console.log('[useInitializeSprite] onSuccess - initialization completed');
      // Update cache
      queryClient.setQueryData(spriteKeys.detail(sprite.id), sprite);
      queryClient.setQueryData(spriteKeys.byProject(projectId), sprite);
      queryClient.invalidateQueries({ queryKey: spriteKeys.lists() });
    },
    onError: (error, { projectId }) => {
      console.error('[useInitializeSprite] onError - initialization failed:', error);
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: spriteKeys.byProject(projectId) });
    },
  });
}

/**
 * Create a checkpoint for a sprite
 */
export function useCreateCheckpoint() {
  const queryClient = useQueryClient();
  const updateSpriteStatus = useSpriteStore((state) => state.updateSpriteStatus);

  return useMutation({
    mutationFn: async ({
      spriteId,
      projectId,
      comment,
    }: {
      spriteId: string;
      projectId: string;
      comment?: string;
    }) => {
      // Note: api.post already extracts data.data from response
      const checkpoint = await api.post<SpriteCheckpoint>(
        `/api/sprites/${spriteId}/checkpoints`,
        { comment }
      );
      return { checkpoint, spriteId, projectId };
    },
    onMutate: async ({ projectId }) => {
      // Optimistic update to 'checkpointing' status
      updateSpriteStatus(projectId, 'checkpointing');
    },
    onSuccess: ({ spriteId, projectId }) => {
      // Invalidate checkpoint list
      queryClient.invalidateQueries({ queryKey: spriteKeys.checkpoints(spriteId) });
      // Refresh sprite to get updated checkpoint info
      queryClient.invalidateQueries({ queryKey: spriteKeys.detail(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.byProject(projectId) });
    },
    onError: (_, { projectId }) => {
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: spriteKeys.byProject(projectId) });
    },
  });
}

/**
 * Restore a sprite from a checkpoint
 */
export function useRestoreCheckpoint() {
  const queryClient = useQueryClient();
  const updateSpriteStatus = useSpriteStore((state) => state.updateSpriteStatus);

  return useMutation({
    mutationFn: async ({
      spriteId,
      projectId,
      checkpointId,
    }: {
      spriteId: string;
      projectId: string;
      checkpointId: string;
    }) => {
      // Note: api.post already extracts data.data from response
      const sprite = await api.post<Sprite>(
        `/api/sprites/${spriteId}/checkpoints/${checkpointId}/restore`
      );
      return { sprite, projectId };
    },
    onMutate: async ({ projectId }) => {
      // Optimistic update to 'restoring' status
      updateSpriteStatus(projectId, 'restoring');
    },
    onSuccess: ({ sprite, projectId }) => {
      // Update cache
      queryClient.setQueryData(spriteKeys.detail(sprite.id), sprite);
      queryClient.setQueryData(spriteKeys.byProject(projectId), sprite);
      queryClient.invalidateQueries({ queryKey: spriteKeys.lists() });
    },
    onError: (_, { projectId }) => {
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: spriteKeys.byProject(projectId) });
    },
  });
}

// ============================================================================
// CONFIGURATION MUTATIONS
// ============================================================================

/**
 * Set Sprites API token
 */
export function useSetSpritesToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      await api.post('/api/sprites/config/token', { token });
    },
    onSuccess: () => {
      // Invalidate config to refresh status
      queryClient.invalidateQueries({ queryKey: spriteKeys.config() });
    },
  });
}

/**
 * Remove Sprites API token
 */
export function useRemoveSpritesToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.delete('/api/sprites/config/token');
    },
    onSuccess: () => {
      // Invalidate config to refresh status
      queryClient.invalidateQueries({ queryKey: spriteKeys.config() });
      // Invalidate all sprites since they won't work without token
      queryClient.invalidateQueries({ queryKey: spriteKeys.all });
    },
  });
}

// ============================================================================
// GITHUB TOKEN CONFIGURATION
// ============================================================================

/**
 * Get GitHub configuration status
 */
export function useGitHubConfig() {
  return useQuery({
    queryKey: [...spriteKeys.config(), 'github'],
    queryFn: () => api.get<{ configured: boolean; tokenPrefix: string | null }>('/api/sprites/config/github'),
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Set GitHub Personal Access Token
 */
export function useSetGitHubToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      await api.post('/api/sprites/config/github', { token });
    },
    onSuccess: () => {
      // Invalidate GitHub config to refresh status
      queryClient.invalidateQueries({ queryKey: [...spriteKeys.config(), 'github'] });
    },
  });
}

/**
 * Remove GitHub token
 */
export function useRemoveGitHubToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.delete('/api/sprites/config/github');
    },
    onSuccess: () => {
      // Invalidate GitHub config to refresh status
      queryClient.invalidateQueries({ queryKey: [...spriteKeys.config(), 'github'] });
    },
  });
}

// ============================================================================
// SPRITE SETTINGS
// ============================================================================

/**
 * Sprite settings type for update mutation
 */
export interface SpriteSettingsUpdate {
  autoShutdownAfterTask?: boolean;
  startupCommand?: string | null;
  lastShellDirectory?: string | null;
}

/**
 * Update sprite settings (e.g., autoShutdownAfterTask, shell persistence)
 */
export function useUpdateSpriteSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spriteId,
      projectId,
      settings,
    }: {
      spriteId: string;
      projectId: string;
      settings: SpriteSettingsUpdate;
    }) => {
      const sprite = await api.patch<Sprite>(
        `/api/sprites/${spriteId}/settings`,
        settings
      );
      return { sprite, projectId };
    },
    onSuccess: ({ sprite, projectId }) => {
      // Update cache
      queryClient.setQueryData(spriteKeys.detail(sprite.id), sprite);
      queryClient.setQueryData(spriteKeys.byProject(projectId), sprite);
      queryClient.invalidateQueries({ queryKey: spriteKeys.lists() });
    },
  });
}

// ============================================================================
// POLLING HOOK FOR SPRITE STATUS
// ============================================================================

/**
 * Poll sprite status during transitions (creating, initializing, etc.)
 */
export function usePollSpriteStatus(
  projectId: string | null | undefined,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: [...spriteKeys.byProject(projectId ?? ''), 'poll'],
    // Note: api.get already extracts data.data from response
    queryFn: () =>
      api.get<Sprite | null>(
        `/api/sprites/project/${projectId}`
      ),
    enabled: !!projectId && enabled,
    refetchInterval: (query) => {
      const sprite = query.state.data;
      if (!sprite) return false;

      // Poll every 2 seconds during transitions
      const transitionStatuses = ['creating', 'initializing', 'checkpointing', 'restoring'];
      if (transitionStatuses.includes(sprite.status)) {
        return 2000;
      }

      return false;
    },
  });
}

// ============================================================================
// SERVICES API
// ============================================================================

/**
 * List all services for a sprite
 */
export function useSpriteServices(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.services(spriteId ?? ''),
    queryFn: () => api.get<SpriteService[]>(`/api/sprites/${spriteId}/services`),
    enabled: !!spriteId,
  });
}

/**
 * Get a specific service
 */
export function useSpriteService(
  spriteId: string | null | undefined,
  serviceId: string | null | undefined
) {
  return useQuery({
    queryKey: spriteKeys.service(spriteId ?? '', serviceId ?? ''),
    queryFn: () =>
      api.get<SpriteService>(`/api/sprites/${spriteId}/services/${serviceId}`),
    enabled: !!spriteId && !!serviceId,
  });
}

/**
 * Get service logs
 */
export function useSpriteServiceLogs(
  spriteId: string | null | undefined,
  serviceId: string | null | undefined,
  options: { tail?: number; since?: string } = {}
) {
  const params = new URLSearchParams();
  if (options.tail !== undefined) {
    params.append('tail', options.tail.toString());
  }
  if (options.since) {
    params.append('since', options.since);
  }
  const queryString = params.toString();

  return useQuery({
    queryKey: [...spriteKeys.serviceLogs(spriteId ?? '', serviceId ?? ''), options],
    queryFn: () =>
      api.get<ServiceLogsResponse>(
        `/api/sprites/${spriteId}/services/${serviceId}/logs${queryString ? `?${queryString}` : ''}`
      ),
    enabled: !!spriteId && !!serviceId,
    refetchInterval: 5000, // Poll for new logs every 5 seconds
  });
}

/**
 * Create a new service
 */
export function useCreateSpriteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spriteId,
      options,
    }: {
      spriteId: string;
      options: CreateServiceOptions;
    }) => {
      return api.post<SpriteService>(`/api/sprites/${spriteId}/services`, options);
    },
    onSuccess: (service, { spriteId }) => {
      // Invalidate services list
      queryClient.invalidateQueries({ queryKey: spriteKeys.services(spriteId) });
    },
  });
}

/**
 * Start a service
 */
export function useStartSpriteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spriteId,
      serviceId,
    }: {
      spriteId: string;
      serviceId: string;
    }) => {
      return api.post<SpriteService>(
        `/api/sprites/${spriteId}/services/${serviceId}/start`
      );
    },
    onMutate: async ({ spriteId, serviceId }) => {
      // Optimistic update
      await queryClient.cancelQueries({
        queryKey: spriteKeys.service(spriteId, serviceId),
      });

      const previousService = queryClient.getQueryData<SpriteService>(
        spriteKeys.service(spriteId, serviceId)
      );

      if (previousService) {
        queryClient.setQueryData(spriteKeys.service(spriteId, serviceId), {
          ...previousService,
          status: 'starting' as const,
        });
      }

      return { previousService };
    },
    onError: (_err, { spriteId, serviceId }, context) => {
      if (context?.previousService) {
        queryClient.setQueryData(
          spriteKeys.service(spriteId, serviceId),
          context.previousService
        );
      }
    },
    onSuccess: (service, { spriteId }) => {
      // Update cache with actual response
      queryClient.setQueryData(spriteKeys.service(spriteId, service.id), service);
      queryClient.invalidateQueries({ queryKey: spriteKeys.services(spriteId) });
    },
  });
}

/**
 * Stop a service
 */
export function useStopSpriteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spriteId,
      serviceId,
    }: {
      spriteId: string;
      serviceId: string;
    }) => {
      return api.post<SpriteService>(
        `/api/sprites/${spriteId}/services/${serviceId}/stop`
      );
    },
    onMutate: async ({ spriteId, serviceId }) => {
      // Optimistic update
      await queryClient.cancelQueries({
        queryKey: spriteKeys.service(spriteId, serviceId),
      });

      const previousService = queryClient.getQueryData<SpriteService>(
        spriteKeys.service(spriteId, serviceId)
      );

      if (previousService) {
        queryClient.setQueryData(spriteKeys.service(spriteId, serviceId), {
          ...previousService,
          status: 'stopping' as const,
        });
      }

      return { previousService };
    },
    onError: (_err, { spriteId, serviceId }, context) => {
      if (context?.previousService) {
        queryClient.setQueryData(
          spriteKeys.service(spriteId, serviceId),
          context.previousService
        );
      }
    },
    onSuccess: (service, { spriteId }) => {
      // Update cache with actual response
      queryClient.setQueryData(spriteKeys.service(spriteId, service.id), service);
      queryClient.invalidateQueries({ queryKey: spriteKeys.services(spriteId) });
    },
  });
}

/**
 * Restart a service
 */
export function useRestartSpriteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spriteId,
      serviceId,
    }: {
      spriteId: string;
      serviceId: string;
    }) => {
      return api.post<SpriteService>(
        `/api/sprites/${spriteId}/services/${serviceId}/restart`
      );
    },
    onMutate: async ({ spriteId, serviceId }) => {
      // Optimistic update
      await queryClient.cancelQueries({
        queryKey: spriteKeys.service(spriteId, serviceId),
      });

      const previousService = queryClient.getQueryData<SpriteService>(
        spriteKeys.service(spriteId, serviceId)
      );

      if (previousService) {
        queryClient.setQueryData(spriteKeys.service(spriteId, serviceId), {
          ...previousService,
          status: 'starting' as const,
        });
      }

      return { previousService };
    },
    onError: (_err, { spriteId, serviceId }, context) => {
      if (context?.previousService) {
        queryClient.setQueryData(
          spriteKeys.service(spriteId, serviceId),
          context.previousService
        );
      }
    },
    onSuccess: (service, { spriteId }) => {
      // Update cache with actual response
      queryClient.setQueryData(spriteKeys.service(spriteId, service.id), service);
      queryClient.invalidateQueries({ queryKey: spriteKeys.services(spriteId) });
    },
  });
}

/**
 * Delete a service
 */
export function useDeleteSpriteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spriteId,
      serviceId,
    }: {
      spriteId: string;
      serviceId: string;
    }) => {
      await api.delete(`/api/sprites/${spriteId}/services/${serviceId}`);
      return { spriteId, serviceId };
    },
    onSuccess: ({ spriteId, serviceId }) => {
      // Remove from cache
      queryClient.removeQueries({
        queryKey: spriteKeys.service(spriteId, serviceId),
      });
      queryClient.invalidateQueries({ queryKey: spriteKeys.services(spriteId) });
    },
  });
}

// ============================================================================
// GIT & PULL REQUEST HOOKS
// ============================================================================

import type {
  BranchStatus,
  PullRequestInfo,
  CreatePullRequestOptions,
  PushResult,
  McpTool,
  McpHealthResponse,
  McpToolCallResult,
  McpInstallResult,
  McpRegistryServer,
  McpRegistryMetadata,
  McpRegistryInstallResult,
} from '@/types/sprite';

/**
 * Get branch status for a sprite (commits ahead/behind, uncommitted changes)
 */
export function useBranchStatus(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.branchStatus(spriteId ?? ''),
    queryFn: () => api.get<BranchStatus>(`/api/sprites/${spriteId}/git/status`),
    enabled: !!spriteId,
    // Refresh every 30 seconds since git status can change
    staleTime: 30000,
  });
}

/**
 * Get existing pull request for a sprite
 */
export function usePullRequest(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.pullRequest(spriteId ?? ''),
    queryFn: () => api.get<PullRequestInfo | null>(`/api/sprites/${spriteId}/pr`),
    enabled: !!spriteId,
    // Cache for a bit since PRs don't change often
    staleTime: 60000,
  });
}

/**
 * Push local commits to remote
 */
export function usePushChanges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId }: { spriteId: string }) => {
      return api.post<PushResult>(`/api/sprites/${spriteId}/git/push`);
    },
    onSuccess: (_, { spriteId }) => {
      // Invalidate branch status to reflect pushed changes
      queryClient.invalidateQueries({ queryKey: spriteKeys.branchStatus(spriteId) });
    },
  });
}

/**
 * Create a pull request from sprite
 */
export function useCreatePullRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spriteId,
      options,
    }: {
      spriteId: string;
      options?: CreatePullRequestOptions;
    }) => {
      return api.post<PullRequestInfo>(`/api/sprites/${spriteId}/pr`, options ?? {});
    },
    onSuccess: (pr, { spriteId }) => {
      // Update PR cache
      queryClient.setQueryData(spriteKeys.pullRequest(spriteId), pr);
      // Invalidate branch status
      queryClient.invalidateQueries({ queryKey: spriteKeys.branchStatus(spriteId) });
    },
  });
}

// ============================================================================
// MCP (MODEL CONTEXT PROTOCOL) HOOKS
// ============================================================================

/**
 * Check MCP server health on a sprite
 */
export function useMcpHealth(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.mcpHealth(spriteId ?? ''),
    queryFn: () => api.get<McpHealthResponse>(`/api/sprites/${spriteId}/mcp/health`),
    enabled: !!spriteId,
    staleTime: 10000, // Cache for 10 seconds
    refetchInterval: 30000, // Poll every 30 seconds when active
  });
}

/**
 * Get available MCP tools on a sprite
 */
export function useMcpTools(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.mcpTools(spriteId ?? ''),
    queryFn: () => api.get<{ tools: McpTool[] }>(`/api/sprites/${spriteId}/mcp/tools`),
    enabled: !!spriteId,
    staleTime: 60000, // Tools don't change often
  });
}

/**
 * Install MCP server on a sprite
 */
export function useInstallMcp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId }: { spriteId: string }) => {
      return api.post<McpInstallResult>(`/api/sprites/${spriteId}/mcp/install`);
    },
    onSuccess: (_, { spriteId }) => {
      // Invalidate MCP queries
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpHealth(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpTools(spriteId) });
      // Invalidate sprite to get updated mcpEnabled status
      queryClient.invalidateQueries({ queryKey: spriteKeys.detail(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.lists() });
    },
  });
}

/**
 * Call an MCP tool on a sprite
 */
export function useCallMcpTool() {
  return useMutation({
    mutationFn: async ({
      spriteId,
      tool,
      args = {},
    }: {
      spriteId: string;
      tool: string;
      args?: Record<string, unknown>;
    }) => {
      return api.post<McpToolCallResult>(`/api/sprites/${spriteId}/mcp/call`, {
        tool,
        arguments: args,
      });
    },
  });
}

// ============================================================================
// MCP REGISTRY HOOKS
// ============================================================================

/**
 * Search MCP servers in the registry
 */
export function useMcpRegistrySearch(search?: string, options?: { limit?: number }) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (options?.limit) params.set('limit', String(options.limit));

  return useQuery({
    queryKey: spriteKeys.mcpRegistryServers(search),
    queryFn: () =>
      api.get<McpRegistryServer[]>(
        `/api/sprites/mcp-registry/servers?${params.toString()}`
      ),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Get popular MCP servers
 */
export function useMcpRegistryPopular() {
  return useQuery({
    queryKey: spriteKeys.mcpRegistryPopular(),
    queryFn: () => api.get<McpRegistryServer[]>('/api/sprites/mcp-registry/servers/popular'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Get details for a specific MCP server
 */
export function useMcpRegistryServer(name: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.mcpRegistryServer(name ?? ''),
    queryFn: () => api.get<McpRegistryServer>(`/api/sprites/mcp-registry/servers/${encodeURIComponent(name ?? '')}`),
    enabled: !!name,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Install an MCP server from registry onto a sprite
 */
export function useInstallMcpFromRegistry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spriteId,
      serverName,
      version,
    }: {
      spriteId: string;
      serverName: string;
      version?: string;
    }) => {
      return api.post<McpRegistryInstallResult>(
        `/api/sprites/${spriteId}/mcp/install-from-registry`,
        { serverName, version }
      );
    },
    onSuccess: (_, { spriteId }) => {
      // Invalidate MCP queries to reflect newly installed server
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpHealth(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpTools(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.detail(spriteId) });
    },
  });
}

// ============================================================================
// MCP SERVER CONFIGURATION MANAGEMENT
// ============================================================================

/**
 * Get all installed MCP servers for a sprite
 */
export function useInstalledMcpServers(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.mcpInstalledServers(spriteId ?? ''),
    queryFn: () => api.get<InstalledMcpServer[]>(`/api/sprites/${spriteId}/mcp/servers`),
    enabled: !!spriteId,
  });
}

/**
 * Get a specific installed MCP server configuration
 */
export function useInstalledMcpServer(spriteId: string | null | undefined, serverName: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.mcpInstalledServer(spriteId ?? '', serverName ?? ''),
    queryFn: () => api.get<InstalledMcpServer>(`/api/sprites/${spriteId}/mcp/servers/${encodeURIComponent(serverName ?? '')}`),
    enabled: !!spriteId && !!serverName,
  });
}

/**
 * Install an MCP server with configuration (including env vars)
 */
export function useInstallMcpServerWithConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spriteId,
      serverName,
      version,
      envVars,
      autoStart,
    }: {
      spriteId: string;
      serverName: string;
      version?: string;
      envVars?: McpEnvVar[];
      autoStart?: boolean;
    }) => {
      return api.post<InstalledMcpServer>(`/api/sprites/${spriteId}/mcp/servers`, {
        serverName,
        version,
        envVars,
        autoStart,
      });
    },
    onSuccess: (_, { spriteId }) => {
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServers(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpHealth(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpTools(spriteId) });
    },
  });
}

/**
 * Update MCP server configuration (env vars, auto-start, etc.)
 */
export function useUpdateMcpServerConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spriteId,
      serverName,
      displayName,
      autoStart,
      startOrder,
      envVars,
    }: {
      spriteId: string;
      serverName: string;
      displayName?: string;
      autoStart?: boolean;
      startOrder?: number;
      envVars?: McpEnvVar[];
    }) => {
      return api.put<InstalledMcpServer>(`/api/sprites/${spriteId}/mcp/servers/${encodeURIComponent(serverName)}`, {
        displayName,
        autoStart,
        startOrder,
        envVars,
      });
    },
    onSuccess: (_, { spriteId, serverName }) => {
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServers(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServer(spriteId, serverName) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpAutoStart(spriteId) });
    },
  });
}

/**
 * Start an installed MCP server
 */
export function useStartMcpServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId, serverName }: { spriteId: string; serverName: string }) => {
      return api.post<{ serverName: string; status: string; lastStartedAt: string }>(
        `/api/sprites/${spriteId}/mcp/servers/${encodeURIComponent(serverName)}/start`
      );
    },
    onSuccess: (_, { spriteId, serverName }) => {
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServers(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServer(spriteId, serverName) });
    },
  });
}

/**
 * Stop an installed MCP server
 */
export function useStopMcpServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId, serverName }: { spriteId: string; serverName: string }) => {
      return api.post<{ serverName: string; status: string; lastStoppedAt: string }>(
        `/api/sprites/${spriteId}/mcp/servers/${encodeURIComponent(serverName)}/stop`
      );
    },
    onSuccess: (_, { spriteId, serverName }) => {
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServers(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServer(spriteId, serverName) });
    },
  });
}

/**
 * Uninstall an MCP server
 */
export function useUninstallMcpServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId, serverName }: { spriteId: string; serverName: string }) => {
      return api.delete<{ serverName: string; uninstalled: boolean }>(
        `/api/sprites/${spriteId}/mcp/servers/${encodeURIComponent(serverName)}`
      );
    },
    onSuccess: (_, { spriteId }) => {
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServers(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpHealth(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpTools(spriteId) });
    },
  });
}

// ============================================================================
// MCP AUTO-START MANAGEMENT
// ============================================================================

/**
 * Get auto-start configuration for a sprite
 */
export function useMcpAutoStartConfig(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.mcpAutoStart(spriteId ?? ''),
    queryFn: () => api.get<AutoStartServerInfo[]>(`/api/sprites/${spriteId}/mcp/auto-start`),
    enabled: !!spriteId,
  });
}

/**
 * Update auto-start order for MCP servers
 */
export function useUpdateMcpAutoStartOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId, serverOrder }: { spriteId: string; serverOrder: string[] }) => {
      return api.put<{ serverOrder: string[] }>(`/api/sprites/${spriteId}/mcp/auto-start/order`, {
        serverOrder,
      });
    },
    onSuccess: (_, { spriteId }) => {
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpAutoStart(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServers(spriteId) });
    },
  });
}

/**
 * Manually trigger auto-start for all configured servers
 */
export function useStartAutoStartServers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId }: { spriteId: string }) => {
      return api.post<AutoStartResult>(`/api/sprites/${spriteId}/mcp/auto-start/start`);
    },
    onSuccess: (_, { spriteId }) => {
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServers(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpAutoStart(spriteId) });
    },
  });
}

/**
 * Get required environment variables for a server from the registry
 */
export function useMcpServerRequiredEnvVars(serverName: string | null | undefined) {
  return useQuery({
    queryKey: ['mcp-required-env', serverName],
    queryFn: () =>
      api.get<{ serverName: string; requiredEnvVars: string[] }>(
        `/api/sprites/mcp-registry/servers/${encodeURIComponent(serverName ?? '')}/required-env`
      ),
    enabled: !!serverName,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  });
}

// ============================================================================
// MCP SERVER UPDATE HOOKS
// ============================================================================

/**
 * Check for updates for all installed MCP servers on a sprite
 */
export function useMcpServerUpdates(spriteId: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.mcpUpdates(spriteId ?? ''),
    queryFn: () => api.get<McpUpdateCheckResult>(`/api/sprites/${spriteId}/mcp/check-updates`),
    enabled: !!spriteId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Check for update for a single MCP server
 */
export function useMcpServerUpdate(spriteId: string | null | undefined, serverName: string | null | undefined) {
  return useQuery({
    queryKey: spriteKeys.mcpServerUpdate(spriteId ?? '', serverName ?? ''),
    queryFn: () =>
      api.get<McpServerUpdateInfo>(
        `/api/sprites/${spriteId}/mcp/${encodeURIComponent(serverName ?? '')}/check-update`
      ),
    enabled: !!spriteId && !!serverName,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Update a single MCP server to the latest version
 */
export function useUpdateMcpServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId, serverName }: { spriteId: string; serverName: string }) => {
      return api.post<McpServerUpdateResult>(
        `/api/sprites/${spriteId}/mcp/${encodeURIComponent(serverName)}/update`
      );
    },
    onSuccess: (_, { spriteId, serverName }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServers(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServer(spriteId, serverName) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpUpdates(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpServerUpdate(spriteId, serverName) });
    },
  });
}

/**
 * Update all MCP servers with available updates
 */
export function useUpdateAllMcpServers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId }: { spriteId: string }) => {
      return api.post<McpBulkUpdateResult>(`/api/sprites/${spriteId}/mcp/update-all`);
    },
    onSuccess: (_, { spriteId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServers(spriteId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpUpdates(spriteId) });
    },
  });
}

/**
 * Manually trigger update check for all servers
 */
export function useCheckMcpUpdates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId }: { spriteId: string }) => {
      return api.get<McpUpdateCheckResult>(`/api/sprites/${spriteId}/mcp/check-updates`);
    },
    onSuccess: (data, { spriteId }) => {
      // Update the cache with the fresh data
      queryClient.setQueryData(spriteKeys.mcpUpdates(spriteId), data);
      // Also invalidate installed servers to refresh version info
      queryClient.invalidateQueries({ queryKey: spriteKeys.mcpInstalledServers(spriteId) });
    },
  });
}
