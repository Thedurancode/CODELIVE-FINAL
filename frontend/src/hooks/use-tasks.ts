import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Task, TaskFilters, TaskStats, TaskStatus, TaskPriority, PaginatedResponse } from '@/types';

export function useTasks(filters: TaskFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.search) params.append('search', filters.search);
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status.join(',') : filters.status;
    params.append('status', statuses);
  }
  if (filters.priority) {
    const priorities = Array.isArray(filters.priority) ? filters.priority.join(',') : filters.priority;
    params.append('priority', priorities);
  }
  if (filters.assignedTo) params.append('assignedTo', filters.assignedTo);
  if (filters.createdBy) params.append('createdBy', filters.createdBy);
  if (filters.linkType) params.append('linkType', filters.linkType);
  if (filters.propertyId) params.append('propertyId', String(filters.propertyId));
  if (filters.buyerId) params.append('buyerId', filters.buyerId);
  if (filters.complianceCheckId) params.append('complianceCheckId', String(filters.complianceCheckId));
  if (filters.dueBefore) params.append('dueBefore', filters.dueBefore);
  if (filters.dueAfter) params.append('dueAfter', filters.dueAfter);
  if (filters.tags) params.append('tags', filters.tags.join(','));
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
  if (filters.includeOverdue) params.append('includeOverdue', 'true');

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['tasks', filtersKey],
    queryFn: () => api.get<PaginatedResponse<Task>>(`/api/tasks?${params.toString()}`),
  });
}

export function useMyTasks(filters: Omit<TaskFilters, 'assignedTo'> = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status.join(',') : filters.status;
    params.append('status', statuses);
  }
  if (filters.priority) {
    const priorities = Array.isArray(filters.priority) ? filters.priority.join(',') : filters.priority;
    params.append('priority', priorities);
  }
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['myTasks', filtersKey],
    queryFn: () => api.get<PaginatedResponse<Task>>(`/api/tasks/my?${params.toString()}`),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => api.get<Task>(`/api/tasks/${id}`),
    enabled: !!id,
  });
}

export function useTaskStats(scope?: 'user' | 'organization' | 'all') {
  const params = scope ? `?scope=${scope}` : '';
  return useQuery({
    queryKey: ['taskStats', scope],
    queryFn: () => api.get<TaskStats>(`/api/tasks/stats${params}`),
  });
}

export function useTasksByDeal(propertyId: number, status?: TaskStatus[]) {
  const params = status ? `?status=${status.join(',')}` : '';
  return useQuery({
    queryKey: ['tasksByDeal', propertyId, status],
    queryFn: () => api.get<Task[]>(`/api/tasks/deal/${propertyId}${params}`),
    enabled: !!propertyId,
  });
}

export function useTasksByBuyer(buyerId: string, status?: TaskStatus[]) {
  const params = status ? `?status=${status.join(',')}` : '';
  return useQuery({
    queryKey: ['tasksByBuyer', buyerId, status],
    queryFn: () => api.get<Task[]>(`/api/tasks/buyer/${buyerId}${params}`),
    enabled: !!buyerId,
  });
}

export function useTasksByCompliance(complianceCheckId: number, status?: TaskStatus[]) {
  const params = status ? `?status=${status.join(',')}` : '';
  return useQuery({
    queryKey: ['tasksByCompliance', complianceCheckId, status],
    queryFn: () => api.get<Task[]>(`/api/tasks/compliance/${complianceCheckId}${params}`),
    enabled: !!complianceCheckId,
  });
}

export function useTasksByProject(projectId: string, status?: TaskStatus[]) {
  const params = status ? `?status=${status.join(',')}` : '';
  return useQuery({
    queryKey: ['tasksByProject', projectId, status],
    queryFn: () => api.get<Task[]>(`/api/projects/${projectId}/tasks${params}`),
    enabled: !!projectId,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Task>) => api.post<Task>('/api/tasks', data),
    onSuccess: () => {
      // Use exact: false to match all queries starting with these keys (regardless of filters)
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['myTasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['taskStats'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['tasksByDeal'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['tasksByBuyer'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['tasksByCompliance'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['tasksByProject'], exact: false });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) =>
      api.patch<Task>(`/api/tasks/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['myTasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'], exact: false });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['myTasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['taskStats'], exact: false });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<Task>(`/api/tasks/${id}/complete`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['myTasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'], exact: false });
    },
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<Task>(`/api/tasks/${id}/cancel`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['myTasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'], exact: false });
    },
  });
}

export function useAssignTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, assignedTo }: { id: string; assignedTo: string }) =>
      api.post<Task>(`/api/tasks/${id}/assign`, { assignedTo }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['myTasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
    },
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.post<Task>(`/api/tasks/${id}/status`, { status }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['myTasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'], exact: false });
    },
  });
}

export function useTriggerWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      trigger: 'deal_created' | 'deal_stage_changed' | 'compliance_issue' | 'buyer_matched';
      propertyId?: number;
      buyerId?: string;
      complianceCheckId?: number;
      metadata?: Record<string, unknown>;
    }) => api.post<Task[]>('/api/tasks/workflow', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['myTasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['taskStats'], exact: false });
    },
  });
}
