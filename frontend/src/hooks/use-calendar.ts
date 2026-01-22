/**
 * React Query hooks for Calendar API
 *
 * Provides hooks for managing Google Calendar integration,
 * viewing events, and CRUD operations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

export interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  lastSyncAt?: string;
  error?: string;
  message?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees: string[];
  status: string;
  link?: string;
  propertyId?: number;
  buyerId?: string;
  isAllDay: boolean;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees?: string[];
  propertyId?: number;
  buyerId?: string;
  reminders?: { method: 'email' | 'popup'; minutes: number }[];
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export interface ListEventsOptions {
  maxResults?: number;
  timeMin?: string;
  timeMax?: string;
  query?: string;
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const calendarKeys = {
  all: ['calendar'] as const,
  status: () => [...calendarKeys.all, 'status'] as const,
  events: () => [...calendarKeys.all, 'events'] as const,
  eventsList: (options?: ListEventsOptions) => [...calendarKeys.events(), options] as const,
  freeSlots: (params: Record<string, unknown>) => [...calendarKeys.all, 'freeSlots', params] as const,
};

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Check calendar connection status
 */
export function useCalendarStatus() {
  return useQuery({
    queryKey: calendarKeys.status(),
    queryFn: async () => {
      const data = await api.get<CalendarStatus>('/calendar/status');
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Fetch calendar events
 */
export function useCalendarEvents(options?: ListEventsOptions) {
  return useQuery({
    queryKey: calendarKeys.eventsList(options),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.maxResults) params.append('maxResults', options.maxResults.toString());
      if (options?.timeMin) params.append('timeMin', options.timeMin);
      if (options?.timeMax) params.append('timeMax', options.timeMax);
      if (options?.query) params.append('query', options.query);

      const data = await api.get<CalendarEvent[]>(
        `/calendar/events?${params.toString()}`
      );
      return data;
    },
  });
}

/**
 * Find free time slots
 */
export function useFreeSlots(
  durationMinutes: number,
  startDate: string,
  endDate: string,
  maxSlots?: number
) {
  return useQuery({
    queryKey: calendarKeys.freeSlots({ durationMinutes, startDate, endDate, maxSlots }),
    queryFn: async () => {
      const params = new URLSearchParams({
        durationMinutes: durationMinutes.toString(),
        startDate,
        endDate,
      });
      if (maxSlots) params.append('maxSlots', maxSlots.toString());

      const data = await api.get<TimeSlot[]>(
        `/calendar/free-slots?${params.toString()}`
      );
      return data;
    },
    enabled: !!durationMinutes && !!startDate && !!endDate,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Get OAuth URL to connect Google Calendar
 */
export function useConnectCalendar() {
  return useMutation({
    mutationFn: async () => {
      const data = await api.get<{ authUrl: string }>('/calendar/connect/google');
      return data;
    },
  });
}

/**
 * Disconnect Google Calendar
 */
export function useDisconnectCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const data = await api.post<{ disconnected: boolean }>('/calendar/disconnect');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.status() });
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

/**
 * Create a calendar event
 */
export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const data = await api.post<CalendarEvent>('/calendar/events', input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

/**
 * Update a calendar event
 */
export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateEventInput & { id: string }) => {
      const data = await api.patch<CalendarEvent>(`/calendar/events/${id}`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

/**
 * Delete a calendar event
 */
export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/calendar/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}
