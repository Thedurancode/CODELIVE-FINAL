/**
 * Voice Calling Module Types
 *
 * Type definitions for the Twilio + OpenAI Realtime voice calling system.
 */

// ============================================================================
// Call Types
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

export type CallEventType =
  | 'transcript'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'state'
  | 'audio'
  | 'dtmf';

export type Speaker = 'user' | 'assistant' | 'system';

// ============================================================================
// Database Record Types
// ============================================================================

export interface CallRecord {
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
  started_at: Date | null;
  ended_at: Date | null;
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
  created_at: Date;
  updated_at: Date;
}

export interface CallEventRecord {
  id: string;
  call_id: string;
  ts: Date;
  type: CallEventType;
  speaker: Speaker | null;
  payload: Record<string, unknown>;
  created_at: Date;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

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

export interface CallStatusUpdate {
  CallSid: string;
  CallStatus: string;
  CallDuration?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
  From?: string;
  To?: string;
  Direction?: string;
  Timestamp?: string;
}

// ============================================================================
// Extracted Data Types
// ============================================================================

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

export interface CallAnalysisResult {
  summary: string;
  outcome: CallOutcome;
  sentiment: number; // 0.0 to 1.0
  extracted: ExtractedCallData;
  action_items: string[];
}

// ============================================================================
// Tool Calling Types
// ============================================================================

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  };
}

export interface ToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
  call_id: string;
}

export interface ToolCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================================
// Contact & Deal Context Types
// ============================================================================

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

export interface CallContext {
  call: CallRecord;
  contact: ContactContext | null;
  deal: DealContext | null;
}

// ============================================================================
// WebSocket Bridge Types
// ============================================================================

export interface TwilioMediaMessage {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark';
  sequenceNumber?: string;
  streamSid?: string;
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    customParameters: Record<string, string>;
    mediaFormat: {
      encoding: string;
      sampleRate: number;
      channels: number;
    };
  };
  media?: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string; // base64 encoded audio
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
  mark?: {
    name: string;
  };
}

export interface OpenAIRealtimeMessage {
  type: string;
  event_id?: string;
  // Input audio buffer
  audio?: string; // base64 encoded
  // Response
  response?: {
    id?: string;
    status?: string;
    output?: Array<{
      type: string;
      content?: Array<{
        type: string;
        text?: string;
        transcript?: string;
      }>;
    }>;
  };
  // Transcript
  transcript?: string;
  delta?: string;
  // Tool calls
  item?: {
    id?: string;
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
  };
  // Errors
  error?: {
    type: string;
    code: string;
    message: string;
  };
}

export interface BridgeSession {
  callId: string;
  callSid: string;
  streamSid: string | null;
  openaiWs: WebSocket | null;
  twilioWs: WebSocket | null;
  context: CallContext;
  eventBuffer: CallEventRecord[];
  lastFlushTime: number;
  transcriptParts: Array<{
    speaker: Speaker;
    text: string;
    ts: Date;
  }>;
}

// ============================================================================
// Agent Prompt Types
// ============================================================================

export interface AgentPromptConfig {
  profile: AgentProfile;
  systemPrompt: string;
  voiceInstructions?: string;
  tools: ToolDefinition[];
}

// ============================================================================
// Service Response Types
// ============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
