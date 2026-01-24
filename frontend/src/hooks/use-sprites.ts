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
  config: () => [...spriteKeys.all, 'config'] as const,
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

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      // Note: api.post already extracts data.data from response
      const sprite = await api.post<Sprite>(`/api/sprites/${id}/resume`);
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
 * Update sprite settings (e.g., autoShutdownAfterTask)
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
      settings: { autoShutdownAfterTask?: boolean };
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
