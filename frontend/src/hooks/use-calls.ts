import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ============================================================================
// Types
// ============================================================================

export type CallDirection = 'inbound' | 'outbound';

export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'no-answer'
  | 'failed'
  | 'canceled';

export type CallOutcome =
  | 'no_answer'
  | 'left_voicemail'
  | 'follow_up'
  | 'hot_lead'
  | 'not_interested'
  | 'wrong_number'
  | 'resolved'
  | 'escalate';

export type AgentProfile = 'sales' | 'support' | 'collections';

export interface Call {
  id: string;
  call_sid: string | null;
  direction: CallDirection;
  from_number: string;
  to_number: string;
  deal_id: number | null;
  contact_id: string | null;
  organization_id: string | null;
  initiated_by: string | null;
  agent_profile: AgentProfile;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  recording_url: string | null;
  recording_sid: string | null;
  status: CallStatus;
  summary: string | null;
  outcome: CallOutcome | null;
  sentiment: number | null;
  extracted: ExtractedCallData | null;
  action_items: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractedCallData {
  name?: string;
  intent?: string;
  next_step?: string;
  callback_time?: string;
  objections?: string[];
  budget?: string;
  email?: string;
  additional_contacts?: string[];
}

export interface CallEvent {
  id: string;
  call_id: string;
  ts: string;
  type: 'transcript' | 'tool_call' | 'tool_result' | 'error' | 'state' | 'audio' | 'dtmf';
  speaker: 'user' | 'assistant' | 'system' | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TranscriptEntry {
  speaker: string;
  text: string;
  ts: string;
}

export interface ContactContext {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string;
  company: string | null;
  tags: string[];
  notes: string | null;
}

export interface DealContext {
  id: number;
  propertyId: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string | null;
  processingState: string | null;
  approvalStatus: string | null;
  reservePrice: number | null;
  buyItNowPrice: number | null;
  propertyType: string | null;
  bedroomCount: number | null;
  bathroomCount: number | null;
  livingSpaceSqFt: number | null;
  condition: string | null;
}

export interface CallDetail {
  call: Call;
  events: CallEvent[];
  transcript: TranscriptEntry[];
  contact: ContactContext | null;
  deal: DealContext | null;
}

export interface CallFilters {
  page?: number;
  limit?: number;
  direction?: CallDirection;
  status?: CallStatus;
  outcome?: CallOutcome;
  contact_id?: string;
  deal_id?: number;
}

export interface CallsResponse {
  success: boolean;
  data: Call[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CallDetailResponse {
  success: boolean;
  data: CallDetail;
}

export interface OutboundCallRequest {
  contact_id: string;
  deal_id?: number;
  from_number?: string;
  agent_profile?: AgentProfile;
}

export interface OutboundCallResponse {
  success: boolean;
  call_id?: string;
  call_sid?: string;
  status?: CallStatus;
  error?: string;
}

export interface ServiceStatus {
  twilio: {
    configured: boolean;
    number: string;
  };
  openai: {
    configured: boolean;
  };
  activeSessions: number;
  last24Hours: {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
  };
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch calls with filtering and pagination
 */
export function useCalls(filters: CallFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.direction) params.append('direction', filters.direction);
  if (filters.status) params.append('status', filters.status);
  if (filters.outcome) params.append('outcome', filters.outcome);
  if (filters.contact_id) params.append('contact_id', filters.contact_id);
  if (filters.deal_id) params.append('deal_id', String(filters.deal_id));

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['calls', filtersKey],
    queryFn: async () => {
      const response = await api.get<CallsResponse>(`/voice/calls?${params.toString()}`);
      return response;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch a single call with full details
 */
export function useCall(id: string | null) {
  return useQuery({
    queryKey: ['call', id],
    queryFn: async () => {
      const response = await api.get<CallDetailResponse>(`/voice/calls/${id}`);
      return response.data;
    },
    enabled: !!id,
    staleTime: 10 * 1000,
  });
}

/**
 * Fetch call transcript
 */
export function useCallTranscript(id: string | null, format: 'json' | 'text' = 'json') {
  return useQuery({
    queryKey: ['callTranscript', id, format],
    queryFn: async () => {
      if (format === 'text') {
        const response = await fetch(`/voice/calls/${id}/transcript?format=text`);
        return response.text();
      }
      const response = await api.get<{ success: boolean; data: TranscriptEntry[] }>(
        `/voice/calls/${id}/transcript`
      );
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch voice service status
 */
export function useVoiceServiceStatus() {
  return useQuery({
    queryKey: ['voiceServiceStatus'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; status: ServiceStatus }>(
        '/voice/calls/service/status'
      );
      return response.status;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Initiate an outbound call
 */
export function useInitiateCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: OutboundCallRequest) => {
      const response = await api.post<OutboundCallResponse>('/voice/calls/outbound', request);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });
}

/**
 * Trigger reanalysis of a call
 */
export function useReanalyzeCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      const response = await api.post<{
        success: boolean;
        data: {
          summary: string;
          outcome: CallOutcome;
          sentiment: number;
          extracted: ExtractedCallData;
          action_items: string[];
        };
      }>(`/voice/calls/${callId}/analyze`);
      return response;
    },
    onSuccess: (_, callId) => {
      queryClient.invalidateQueries({ queryKey: ['call', callId] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });
}

/**
 * Batch analyze unprocessed calls
 */
export function useBatchAnalyzeCalls() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (limit: number = 10) => {
      const response = await api.post<{ success: boolean; processed: number }>(
        '/voice/calls/analyze-batch',
        { limit }
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format call duration from seconds to human readable
 */
export function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

/**
 * Get status badge color
 */
export function getStatusColor(status: CallStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'in-progress':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'ringing':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'failed':
    case 'busy':
    case 'no-answer':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'canceled':
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
}

/**
 * Get outcome badge color
 */
export function getOutcomeColor(outcome: CallOutcome | null): string {
  switch (outcome) {
    case 'hot_lead':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'follow_up':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'resolved':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    case 'not_interested':
      return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    case 'wrong_number':
    case 'no_answer':
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    case 'left_voicemail':
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    case 'escalate':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
}

/**
 * Get sentiment color (0-1 scale)
 */
export function getSentimentColor(sentiment: number | null): string {
  if (sentiment === null) return 'text-gray-400';
  if (sentiment >= 0.7) return 'text-green-500';
  if (sentiment >= 0.4) return 'text-amber-500';
  return 'text-red-500';
}

/**
 * Format outcome for display
 */
export function formatOutcome(outcome: CallOutcome | null): string {
  if (!outcome) return '-';
  return outcome.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}
