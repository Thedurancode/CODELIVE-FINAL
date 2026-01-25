/**
 * Claude Stream Parser
 *
 * Parses Claude Code's `stream-json` output format.
 * Each line is a JSON object representing a streaming event.
 */

import type {
  ClaudeStreamEvent,
  ContentBlockDeltaEvent,
  SpriteChatSSEEvent,
} from '@/types/sprite-chat';

/**
 * Parse a single line of Claude's stream-json output
 */
export function parseClaudeStreamLine(line: string): ClaudeStreamEvent | null {
  if (!line || line.trim() === '') {
    return null;
  }

  try {
    const event = JSON.parse(line) as ClaudeStreamEvent;
    return event;
  } catch {
    console.warn('[ClaudeStreamParser] Failed to parse line:', line);
    return null;
  }
}

/**
 * Extract text content from a stream event
 * Returns the text if this is a text delta, null otherwise
 */
export function extractText(event: ClaudeStreamEvent): string | null {
  if (event.type === 'content_block_delta') {
    const deltaEvent = event as ContentBlockDeltaEvent;
    if (deltaEvent.delta.type === 'text_delta') {
      return deltaEvent.delta.text;
    }
  }
  return null;
}

/**
 * Check if this event indicates the message is complete
 */
export function isMessageComplete(event: ClaudeStreamEvent): boolean {
  return event.type === 'message_stop';
}

/**
 * Check if this event is an error
 */
export function isErrorEvent(event: ClaudeStreamEvent): boolean {
  return event.type === 'error';
}

/**
 * Extract error message from an error event
 */
export function extractErrorMessage(event: ClaudeStreamEvent): string | null {
  if (event.type === 'error') {
    return event.error?.message || 'Unknown error';
  }
  return null;
}

/**
 * Parse SSE data from our backend
 * Our backend wraps Claude events in a simpler format
 */
export function parseSSEData(data: string): SpriteChatSSEEvent | null {
  if (!data || data.trim() === '') {
    return null;
  }

  try {
    return JSON.parse(data) as SpriteChatSSEEvent;
  } catch {
    console.warn('[ClaudeStreamParser] Failed to parse SSE data:', data);
    return null;
  }
}

/**
 * Process a Server-Sent Events stream
 * Yields parsed events as they arrive
 */
export async function* processSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SpriteChatSSEEvent, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      // Process any remaining data in buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            const event = parseSSEData(data);
            if (event) {
              yield event;
            }
          }
        }
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        const event = parseSSEData(data);
        if (event) {
          yield event;
        }
      }
      // Ignore other SSE fields (event:, id:, retry:, comments)
    }
  }
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
