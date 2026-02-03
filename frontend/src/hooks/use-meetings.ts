import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Meeting,
  MeetingFilters,
  MeetingParticipant,
  MeetingRoomToken,
  CreateMeetingInput,
  UpdateMeetingInput,
  PaginatedResponse,
  ParticipantRole,
  RsvpStatus,
} from '@/types';

export function useMeetings(filters: MeetingFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.search) params.append('search', filters.search);
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status.join(',') : filters.status;
    params.append('status', statuses);
  }
  if (filters.meetingType) {
    const types = Array.isArray(filters.meetingType) ? filters.meetingType.join(',') : filters.meetingType;
    params.append('meetingType', types);
  }
  if (filters.projectId) params.append('projectId', filters.projectId);
  if (filters.upcoming) params.append('upcoming', 'true');
  if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.append('dateTo', filters.dateTo);
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['meetings', filtersKey],
    queryFn: () => api.get<PaginatedResponse<Meeting>>(`/api/meetings?${params.toString()}`),
  });
}

export function useUpcomingMeetings(limit?: number) {
  const params = new URLSearchParams();
  params.append('upcoming', 'true');
  if (limit) params.append('limit', String(limit));

  return useQuery({
    queryKey: ['upcomingMeetings', limit],
    queryFn: () => api.get<PaginatedResponse<Meeting>>(`/api/meetings?${params.toString()}`),
  });
}

export function useMeeting(id: string) {
  return useQuery({
    queryKey: ['meeting', id],
    queryFn: () => api.get<Meeting>(`/api/meetings/${id}`),
    enabled: !!id,
  });
}

export function useMeetingsByProject(projectId: string, filters: Omit<MeetingFilters, 'projectId'> = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status.join(',') : filters.status;
    params.append('status', statuses);
  }
  if (filters.upcoming) params.append('upcoming', 'true');
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['meetingsByProject', projectId, filtersKey],
    queryFn: () => api.get<PaginatedResponse<Meeting>>(`/api/meetings/project/${projectId}?${params.toString()}`),
    enabled: !!projectId,
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMeetingInput) => api.post<Meeting>('/api/meetings', data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingMeetings'] });
      if (data?.projectId) {
        queryClient.invalidateQueries({ queryKey: ['meetingsByProject', data.projectId] });
      }
    },
  });
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMeetingInput }) =>
      api.patch<Meeting>(`/api/meetings/${id}`, data),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingMeetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', id] });
      if (data?.projectId) {
        queryClient.invalidateQueries({ queryKey: ['meetingsByProject', data.projectId] });
      }
    },
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/meetings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingMeetings'] });
      queryClient.invalidateQueries({ queryKey: ['meetingsByProject'] });
    },
  });
}

export function useStartMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<Meeting>(`/api/meetings/${id}/start`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingMeetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', id] });
    },
  });
}

export function useEndMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<Meeting>(`/api/meetings/${id}/end`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingMeetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', id] });
    },
  });
}

// Participant Management

export function useMeetingParticipants(meetingId: string) {
  return useQuery({
    queryKey: ['meetingParticipants', meetingId],
    queryFn: () => api.get<MeetingParticipant[]>(`/api/meetings/${meetingId}/participants`),
    enabled: !!meetingId,
  });
}

export function useAddMeetingParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      meetingId,
      participant,
    }: {
      meetingId: string;
      participant: {
        email: string;
        name: string;
        userId?: string;
        contactId?: string;
        role?: ParticipantRole;
        phone?: string;
      };
    }) => api.post<MeetingParticipant>(`/api/meetings/${meetingId}/participants`, participant),
    onSuccess: (_, { meetingId }) => {
      queryClient.invalidateQueries({ queryKey: ['meetingParticipants', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] });
    },
  });
}

export function useRemoveMeetingParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ meetingId, participantId }: { meetingId: string; participantId: number }) =>
      api.delete(`/api/meetings/${meetingId}/participants/${participantId}`),
    onSuccess: (_, { meetingId }) => {
      queryClient.invalidateQueries({ queryKey: ['meetingParticipants', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] });
    },
  });
}

export function useUpdateParticipantRsvp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      meetingId,
      participantId,
      status,
    }: {
      meetingId: string;
      participantId: number;
      status: RsvpStatus;
    }) => api.patch<MeetingParticipant>(`/api/meetings/${meetingId}/participants/${participantId}`, { rsvpStatus: status }),
    onSuccess: (_, { meetingId }) => {
      queryClient.invalidateQueries({ queryKey: ['meetingParticipants', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] });
    },
  });
}

// Video Room

export function useMeetingRoomToken(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (participantInfo?: { name?: string; email?: string }) =>
      api.post<MeetingRoomToken>(`/api/meetings/${meetingId}/room/token`, participantInfo || {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] });
    },
  });
}

// Transcription

export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface MeetingTranscription {
  status: TranscriptionStatus;
  transcript?: string;
  error?: string;
  duration?: number;
  language?: string;
  completedAt?: string;
  chunks?: number; // Number of chunks for long recordings
  progress?: number; // Progress percentage (0-100)
  source?: 'daily' | 'whisper'; // Transcription source
}

export function useMeetingTranscription(meetingId: string) {
  return useQuery({
    queryKey: ['meetingTranscription', meetingId],
    queryFn: () => api.get<MeetingTranscription>(`/api/meetings/${meetingId}/transcription`),
    enabled: !!meetingId,
    refetchInterval: (query) => {
      // Auto-refetch while processing
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'processing') {
        return 5000; // 5 seconds
      }
      return false;
    },
  });
}

export function useStartMeetingTranscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      meetingId,
      recordingUrl,
      language,
    }: {
      meetingId: string;
      recordingUrl?: string;
      language?: string;
    }) =>
      api.post(`/api/meetings/${meetingId}/transcription/start`, {
        recordingUrl,
        language,
      }),
    onSuccess: (_, { meetingId }) => {
      queryClient.invalidateQueries({ queryKey: ['meetingTranscription', meetingId] });
    },
  });
}

export function useRetryMeetingTranscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      meetingId,
      recordingUrl,
      language,
    }: {
      meetingId: string;
      recordingUrl?: string;
      language?: string;
    }) =>
      api.post(`/api/meetings/${meetingId}/transcription/retry`, {
        recordingUrl,
        language,
      }),
    onSuccess: (_, { meetingId }) => {
      queryClient.invalidateQueries({ queryKey: ['meetingTranscription', meetingId] });
    },
  });
}

// Recording

export interface MeetingRecording {
  recordingUrl: string | null;
  dailyRecordingUrl: string | null;
  wasabiRecordingUrl: string | null;
  storageSource: 'wasabi' | 'daily' | null;
  hasRecording: boolean;
  recordingStoragePath: string | null;
  status: string;
  meetingType: string;
}

export function useMeetingRecording(meetingId: string) {
  return useQuery({
    queryKey: ['meetingRecording', meetingId],
    queryFn: () => api.get<MeetingRecording>(`/api/meetings/${meetingId}/recording`),
    enabled: !!meetingId,
  });
}
