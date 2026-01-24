/**
 * Sprite Tasks React Query Hooks
 *
 * Custom hooks for sprite task queue management using TanStack Query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  SpriteTask,
  SpriteTaskStatus,
  SpriteTaskQueueStats,
  CreateSpriteTaskOptions,
  SpriteTaskPriority,
} from '@/types/spriteTask';

// Query keys
export const spriteTaskKeys = {
  all: ['sprite-tasks'] as const,
  lists: () => [...spriteTaskKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...spriteTaskKeys.lists(), filters] as const,
  details: () => [...spriteTaskKeys.all, 'detail'] as const,
  detail: (id: string) => [...spriteTaskKeys.details(), id] as const,
  byProject: (projectId: string) => [...spriteTaskKeys.all, 'project', projectId] as const,
  stats: (projectId?: string) => [...spriteTaskKeys.all, 'stats', projectId] as const,
};

// ============================================================================
// TASK QUERIES
// ============================================================================

/**
 * Fetch all tasks (optionally filtered by project or status)
 */
export function useSpriteTasks(options?: {
  projectId?: string;
  status?: SpriteTaskStatus[];
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (options?.projectId) params.set('projectId', options.projectId);
  if (options?.status) params.set('status', options.status.join(','));
  if (options?.limit) params.set('limit', options.limit.toString());

  return useQuery({
    queryKey: spriteTaskKeys.list(options),
    queryFn: () =>
      api.get<SpriteTask[]>(
        `/api/sprite-tasks${params.toString() ? `?${params.toString()}` : ''}`
      ),
  });
}

/**
 * Fetch tasks for a specific project
 */
export function useSpriteTasksByProject(
  projectId: string | null | undefined,
  options?: { status?: SpriteTaskStatus[]; limit?: number }
) {
  return useQuery({
    queryKey: spriteTaskKeys.byProject(projectId ?? ''),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('projectId', projectId!);
      if (options?.status) params.set('status', options.status.join(','));
      if (options?.limit) params.set('limit', options.limit.toString());
      return api.get<SpriteTask[]>(`/api/sprite-tasks?${params.toString()}`);
    },
    enabled: !!projectId,
  });
}

/**
 * Fetch a single task by ID
 */
export function useSpriteTask(id: string | null | undefined) {
  return useQuery({
    queryKey: spriteTaskKeys.detail(id ?? ''),
    queryFn: () => api.get<SpriteTask>(`/api/sprite-tasks/${id}`),
    enabled: !!id,
  });
}

/**
 * Fetch queue statistics
 */
export function useSpriteTaskStats(projectId?: string) {
  const params = projectId ? `?projectId=${projectId}` : '';
  return useQuery({
    queryKey: spriteTaskKeys.stats(projectId),
    queryFn: () => api.get<SpriteTaskQueueStats>(`/api/sprite-tasks/stats${params}`),
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

// ============================================================================
// TASK MUTATIONS
// ============================================================================

/**
 * Create a new task
 */
export function useCreateSpriteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: CreateSpriteTaskOptions) => {
      const task = await api.post<SpriteTask>('/api/sprite-tasks', options);
      return task;
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.stats() });
    },
  });
}

/**
 * Update a task
 */
export function useUpdateSpriteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      title?: string;
      description?: string;
      prompt?: string;
      priority?: SpriteTaskPriority;
    }) => {
      const task = await api.put<SpriteTask>(`/api/sprite-tasks/${id}`, updates);
      return task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(spriteTaskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
    },
  });
}

/**
 * Cancel a task
 */
export function useCancelSpriteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const task = await api.post<SpriteTask>(`/api/sprite-tasks/${id}/cancel`);
      return task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(spriteTaskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.stats() });
    },
  });
}

/**
 * Retry a failed task
 */
export function useRetrySpriteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const task = await api.post<SpriteTask>(`/api/sprite-tasks/${id}/retry`);
      return task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(spriteTaskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.stats() });
    },
  });
}

/**
 * Assign a task to a sprite
 */
export function useAssignSpriteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, spriteId }: { taskId: string; spriteId: string }) => {
      const task = await api.post<SpriteTask>(`/api/sprite-tasks/${taskId}/assign`, {
        spriteId,
      });
      return task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(spriteTaskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.stats() });
    },
  });
}

/**
 * Start a task (create branch, mark in_progress)
 */
export function useStartSpriteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const task = await api.post<SpriteTask>(`/api/sprite-tasks/${id}/start`);
      return task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(spriteTaskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.stats() });
    },
  });
}

/**
 * Process a task completely (assign, start, run Claude, create PR)
 */
export function useProcessSpriteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, spriteId }: { taskId: string; spriteId?: string }) => {
      const task = await api.post<SpriteTask>(`/api/sprite-tasks/${taskId}/process`, {
        spriteId,
      });
      return task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(spriteTaskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.stats() });
    },
  });
}

/**
 * Create PR for a task
 */
export function useCreatePRForTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const task = await api.post<SpriteTask>(`/api/sprite-tasks/${id}/pr`);
      return task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(spriteTaskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.stats() });
    },
  });
}

// ============================================================================
// GITHUB ISSUE INTEGRATION
// ============================================================================

/**
 * Create a task from a GitHub issue (without processing)
 */
export function useCreateTaskFromIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: {
      projectId: string;
      issueNumber: number;
      priority?: SpriteTaskPriority;
      spriteId?: string;
    }) => {
      const task = await api.post<SpriteTask>('/api/sprite-tasks/from-issue', options);
      return task;
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.stats() });
    },
  });
}

/**
 * Process a GitHub issue directly (one-click automation)
 * This is the main entry point for processing issues.
 */
export function useProcessGitHubIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: {
      projectId: string;
      issueNumber: number;
      spriteId?: string;
      priority?: SpriteTaskPriority;
    }) => {
      const task = await api.post<SpriteTask>('/api/sprite-tasks/process-issue', options);
      return task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(spriteTaskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.stats() });
    },
  });
}

/**
 * Mark a task as completed
 */
export function useCompleteSpriteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const task = await api.post<SpriteTask>(`/api/sprite-tasks/${id}/complete`);
      return task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(spriteTaskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(task.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.stats() });
    },
  });
}

// ============================================================================
// POLLING HOOK FOR ACTIVE TASKS
// ============================================================================

/**
 * Poll task status during active processing
 */
export function usePollSpriteTask(taskId: string | null | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: [...spriteTaskKeys.detail(taskId ?? ''), 'poll'],
    queryFn: () => api.get<SpriteTask>(`/api/sprite-tasks/${taskId}`),
    enabled: !!taskId && enabled,
    refetchInterval: (query) => {
      const task = query.state.data;
      if (!task) return false;

      // Poll every 3 seconds during active processing
      const activeStatuses = ['assigned', 'in_progress'];
      if (activeStatuses.includes(task.status)) {
        return 3000;
      }

      return false;
    },
  });
}
