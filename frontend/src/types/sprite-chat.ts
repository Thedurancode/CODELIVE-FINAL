/**
 * Sprite Chat Types
 *
 * Types for the sprite chat interface that allows users to interact
 * with Claude Code running inside a sprite without using the terminal.
 */

// Chat message roles
export type SpriteChatRole = 'user' | 'assistant' | 'system';

// Chat message structure
export interface SpriteChatMessage {
  id: string;
  role: SpriteChatRole;
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  // Tool usage info (when Claude uses tools)
  toolUse?: {
    name: string;
    input?: Record<string, unknown>;
  };
  // Error info if message failed
  error?: string;
}

// Chat session/conversation
export interface SpriteChatSession {
  id: string;
  spriteId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

// Stream request payload
export interface SpriteChatStreamRequest {
  prompt: string;
  conversationId?: string;
  workDir?: string;
}

// Claude Code stream-json event types
export type ClaudeStreamEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop'
  | 'error';

// Content block types
export type ContentBlockType = 'text' | 'tool_use' | 'tool_result';

// Text delta
export interface TextDelta {
  type: 'text_delta';
  text: string;
}

// Tool use delta
export interface ToolUseDelta {
  type: 'input_json_delta';
  partial_json: string;
}

// Content block start event
export interface ContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: {
    type: ContentBlockType;
    id?: string;
    name?: string;
    text?: string;
  };
}

// Content block delta event
export interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: TextDelta | ToolUseDelta;
}

// Content block stop event
export interface ContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

// Message start event
export interface MessageStartEvent {
  type: 'message_start';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
  };
}

// Message delta event (for usage info)
export interface MessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason?: string;
    stop_sequence?: string | null;
  };
  usage?: {
    output_tokens: number;
  };
}

// Message stop event
export interface MessageStopEvent {
  type: 'message_stop';
}

// Error event
export interface ErrorEvent {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

// Union type for all stream events
export type ClaudeStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | ErrorEvent;

// SSE event from our backend
export interface SpriteChatSSEEvent {
  type: 'text' | 'tool_start' | 'tool_end' | 'error' | 'done' | 'init';
  data?: string;
  tool?: {
    name: string;
    input?: Record<string, unknown>;
  };
  error?: string;
  sessionId?: string;
}

// State for the chat hook
export interface SpriteChatState {
  messages: SpriteChatMessage[];
  isStreaming: boolean;
  error: string | null;
  conversationId: string | null;
}
