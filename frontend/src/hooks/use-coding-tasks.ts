/**
 * Coding Tasks Hooks
 *
 * React Query hooks for managing AI-powered coding tasks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export type CodingTaskStatus =
  | 'created'
  | 'cloning'
  | 'branching'
  | 'coding'
  | 'testing'
  | 'linting'
  | 'committing'
  | 'creating_pr'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface CodingTaskConfig {
  baseBranch?: string;
  branchPrefix?: 'feature' | 'bugfix' | 'refactor';
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  maxFilesChanged?: number;
  runTests?: boolean;
  testCommand?: string;
  lintCommand?: string;
  testTimeout?: number;
  autoCreatePR?: boolean;
  prReviewers?: string[];
  prLabels?: string[];
  maxDuration?: number;
}

export interface CodingTask {
  id: string;
  projectId: string;
  title: string;
  instructions: string;
  status: CodingTaskStatus;
  repoUrl: string;
  baseBranch: string;
  featureBranch: string;
  workspacePath: string | null;
  prUrl: string | null;
  prNumber: number | null;
  commitSha: string | null;
  testsPassed: boolean | null;
  lintPassed: boolean | null;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  testOutput: string | null;
  lintOutput: string | null;
  errorMessage: string | null;
  progressLog: string[];
  config: CodingTaskConfig;
  createdById: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: string;
    title: string;
    githubUrl: string;
  };
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface CodingTaskStats {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  avgDuration: number | null;
}

export interface StartCodingTaskInput {
  projectId: string;
  title: string;
  instructions: string;
  config?: Partial<CodingTaskConfig>;
}

// Query Keys
const CODING_TASK_KEYS = {
  all: ['coding-tasks'] as const,
  task: (id: string) => ['coding-tasks', id] as const,
  project: (projectId: string) => ['coding-tasks', 'project', projectId] as const,
  stats: ['coding-tasks', 'stats'] as const,
};

/**
 * Get a single coding task by ID
 */
export function useCodingTask(taskId: string | undefined) {
  return useQuery({
    queryKey: CODING_TASK_KEYS.task(taskId || ''),
    queryFn: async () => {
      const response = await api.get<CodingTask>(`/api/coding-tasks/${taskId}`);
      return response;
    },
    enabled: !!taskId,
    refetchInterval: (query) => {
      // Refresh more frequently for active tasks
      const task = query.state.data;
      if (task && !['completed', 'failed', 'cancelled'].includes(task.status)) {
        return 3000; // 3 seconds for active tasks
      }
      return false;
    },
  });
}

/**
 * Get coding tasks for a project
 */
export function useCodingTasksForProject(
  projectId: string | undefined,
  options?: {
    status?: CodingTaskStatus | CodingTaskStatus[];
    limit?: number;
    offset?: number;
  }
) {
  return useQuery({
    queryKey: [...CODING_TASK_KEYS.project(projectId || ''), options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.status) {
        if (Array.isArray(options.status)) {
          options.status.forEach((s) => params.append('status', s));
        } else {
          params.set('status', options.status);
        }
      }
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.offset) params.set('offset', String(options.offset));

      const queryString = params.toString();
      const url = `/api/coding-tasks/project/${projectId}${queryString ? `?${queryString}` : ''}`;

      return api.get<{
        data: CodingTask[];
        pagination: { total: number; limit: number; offset: number };
      }>(url);
    },
    enabled: !!projectId,
    refetchInterval: 10000, // 10 seconds
  });
}

/**
 * Get user's coding task stats
 */
export function useCodingTaskStats() {
  return useQuery({
    queryKey: CODING_TASK_KEYS.stats,
    queryFn: () => api.get<CodingTaskStats>('/api/coding-tasks/stats/user'),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Start a new coding task
 */
export function useStartCodingTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartCodingTaskInput) =>
      api.post<CodingTask>('/api/coding-tasks', input),
    onSuccess: (data) => {
      // Invalidate project tasks
      queryClient.invalidateQueries({
        queryKey: CODING_TASK_KEYS.project(data.projectId),
      });
      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: CODING_TASK_KEYS.stats,
      });
    },
  });
}

/**
 * Cancel a coding task
 */
export function useCancelCodingTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) =>
      api.post<CodingTask>(`/api/coding-tasks/${taskId}/cancel`),
    onSuccess: (data) => {
      // Update the task in cache
      queryClient.setQueryData(CODING_TASK_KEYS.task(data.id), data);
      // Invalidate project tasks
      queryClient.invalidateQueries({
        queryKey: CODING_TASK_KEYS.project(data.projectId),
      });
      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: CODING_TASK_KEYS.stats,
      });
    },
  });
}

/**
 * Retry a failed coding task
 */
export function useRetryCodingTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) =>
      api.post<CodingTask>(`/api/coding-tasks/${taskId}/retry`),
    onSuccess: (data) => {
      // Invalidate project tasks
      queryClient.invalidateQueries({
        queryKey: CODING_TASK_KEYS.project(data.projectId),
      });
      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: CODING_TASK_KEYS.stats,
      });
    },
  });
}

// Helper functions

/**
 * Get status display info
 */
export function getStatusInfo(status: CodingTaskStatus): {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
} {
  const statusMap: Record<
    CodingTaskStatus,
    { label: string; color: string; bgColor: string; icon: string }
  > = {
    created: {
      label: 'Created',
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      icon: '📝',
    },
    cloning: {
      label: 'Cloning',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      icon: '📦',
    },
    branching: {
      label: 'Branching',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      icon: '🌿',
    },
    coding: {
      label: 'Coding',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      icon: '💻',
    },
    testing: {
      label: 'Testing',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      icon: '🧪',
    },
    linting: {
      label: 'Linting',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      icon: '🔍',
    },
    committing: {
      label: 'Committing',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      icon: '💾',
    },
    creating_pr: {
      label: 'Creating PR',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      icon: '🔀',
    },
    completed: {
      label: 'Completed',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      icon: '✅',
    },
    failed: {
      label: 'Failed',
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      icon: '❌',
    },
    cancelled: {
      label: 'Cancelled',
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      icon: '🚫',
    },
  };

  return statusMap[status] || statusMap.created;
}

/**
 * Check if a task is in a terminal state
 */
export function isTerminalStatus(status: CodingTaskStatus): boolean {
  return ['completed', 'failed', 'cancelled'].includes(status);
}

/**
 * Check if a task is actively running
 */
export function isActiveStatus(status: CodingTaskStatus): boolean {
  return !['created', 'completed', 'failed', 'cancelled'].includes(status);
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number | null): string {
  if (!ms) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
