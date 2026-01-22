import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Reminder, ReminderFilters, ReminderStats, ReminderStatus, ReminderPriority, PaginatedResponse } from '@/types';

export function useReminders(filters: ReminderFilters = {}) {
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
  if (filters.linkType) params.append('linkType', filters.linkType);
  if (filters.propertyId) params.append('propertyId', String(filters.propertyId));
  if (filters.taskId) params.append('taskId', filters.taskId);
  if (filters.buyerId) params.append('buyerId', filters.buyerId);
  if (filters.reminderBefore) params.append('reminderBefore', filters.reminderBefore);
  if (filters.reminderAfter) params.append('reminderAfter', filters.reminderAfter);
  if (filters.tags) params.append('tags', filters.tags.join(','));
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
  if (filters.includeOverdue) params.append('includeOverdue', 'true');

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['reminders', filtersKey],
    queryFn: () => api.get<PaginatedResponse<Reminder>>(`/api/reminders?${params.toString()}`),
  });
}

export function useMyReminders(filters: Omit<ReminderFilters, 'userId'> = {}) {
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
    queryKey: ['myReminders', filtersKey],
    queryFn: () => api.get<PaginatedResponse<Reminder>>(`/api/reminders/my?${params.toString()}`),
  });
}

export function useReminder(id: string) {
  return useQuery({
    queryKey: ['reminder', id],
    queryFn: () => api.get<Reminder>(`/api/reminders/${id}`),
    enabled: !!id,
  });
}

export function useReminderStats(scope?: 'user' | 'organization' | 'all') {
  const params = scope ? `?scope=${scope}` : '';
  return useQuery({
    queryKey: ['reminderStats', scope],
    queryFn: () => api.get<ReminderStats>(`/api/reminders/stats${params}`),
  });
}

export function useUpcomingReminders(hours?: number) {
  const params = hours ? `?hours=${hours}` : '';
  return useQuery({
    queryKey: ['upcomingReminders', hours],
    queryFn: () => api.get<Reminder[]>(`/api/reminders/upcoming${params}`),
  });
}

export function useRemindersByDeal(propertyId: number, status?: ReminderStatus[]) {
  const params = status ? `?status=${status.join(',')}` : '';
  return useQuery({
    queryKey: ['remindersByDeal', propertyId, status],
    queryFn: () => api.get<Reminder[]>(`/api/reminders/deal/${propertyId}${params}`),
    enabled: !!propertyId,
  });
}

export function useRemindersByTask(taskId: string, status?: ReminderStatus[]) {
  const params = status ? `?status=${status.join(',')}` : '';
  return useQuery({
    queryKey: ['remindersByTask', taskId, status],
    queryFn: () => api.get<Reminder[]>(`/api/reminders/task/${taskId}${params}`),
    enabled: !!taskId,
  });
}

export function useRemindersByBuyer(buyerId: string, status?: ReminderStatus[]) {
  const params = status ? `?status=${status.join(',')}` : '';
  return useQuery({
    queryKey: ['remindersByBuyer', buyerId, status],
    queryFn: () => api.get<Reminder[]>(`/api/reminders/buyer/${buyerId}${params}`),
    enabled: !!buyerId,
  });
}

export function useCreateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Reminder>) => api.post<Reminder>('/api/reminders', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['myReminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminderStats'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingReminders'] });
      queryClient.invalidateQueries({ queryKey: ['remindersByDeal'] });
      queryClient.invalidateQueries({ queryKey: ['remindersByTask'] });
      queryClient.invalidateQueries({ queryKey: ['remindersByBuyer'] });
    },
  });
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Reminder> }) =>
      api.patch<Reminder>(`/api/reminders/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['myReminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder', id] });
      queryClient.invalidateQueries({ queryKey: ['reminderStats'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingReminders'] });
    },
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/reminders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['myReminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminderStats'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingReminders'] });
    },
  });
}

export function useSnoozeReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      api.post<Reminder>(`/api/reminders/${id}/snooze`, { minutes }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['myReminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder', id] });
      queryClient.invalidateQueries({ queryKey: ['reminderStats'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingReminders'] });
    },
  });
}

export function useAcknowledgeReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<Reminder>(`/api/reminders/${id}/acknowledge`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['myReminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder', id] });
      queryClient.invalidateQueries({ queryKey: ['reminderStats'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingReminders'] });
    },
  });
}

export function useCancelReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<Reminder>(`/api/reminders/${id}/cancel`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['myReminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder', id] });
      queryClient.invalidateQueries({ queryKey: ['reminderStats'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingReminders'] });
    },
  });
}
