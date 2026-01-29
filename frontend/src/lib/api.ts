const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// List of endpoints that return paginated responses (don't unwrap data.data)
const PAGINATED_ENDPOINTS = ['/api/listings', '/api/hedgefunds', '/api/contacts', '/api/buyers', '/api/email-client/folders', '/api/reminders', '/api/tasks', '/api/projects'];

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Send cookies for session-based auth
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Don't redirect here - it interrupts user flow during background requests
    // Auth redirect is handled by the middleware and auth providers
    console.warn('API returned 401 - session may have expired');
    throw new ApiError(401, 'Unauthorized');
  }

  const data = await res.json();

  if (!res.ok || data.success === false) {
    throw new ApiError(res.status, data.error || data.message || 'API Error');
  }

  // For paginated endpoints, return the whole response (includes data + pagination)
  // For other endpoints, unwrap data.data if it exists
  // Match exact path or path with query params (e.g., /api/reminders or /api/reminders?page=1)
  const basePath = endpoint.split('?')[0];
  const isPaginated = PAGINATED_ENDPOINTS.includes(basePath);
  if (isPaginated) {
    return data as T;
  }

  return data.data !== undefined ? data.data : data;
}

export const api = {
  get: <T>(endpoint: string) => fetchApi<T>(endpoint),

  post: <T>(endpoint: string, body?: unknown) =>
    fetchApi<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    }),

  put: <T>(endpoint: string, body: unknown) =>
    fetchApi<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),

  patch: <T>(endpoint: string, body: unknown) =>
    fetchApi<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body)
    }),

  delete: <T>(endpoint: string, body?: unknown) =>
    fetchApi<T>(endpoint, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    }),

  upload: async <T>(endpoint: string, formData: FormData): Promise<T> => {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      credentials: 'include', // Send cookies for session-based auth
      body: formData,
    });

    if (res.status === 401) {
      throw new ApiError(401, 'Unauthorized');
    }

    const data = await res.json();

    if (!res.ok || data.success === false) {
      throw new ApiError(res.status, data.error || data.message || 'Upload Error');
    }

    return data.data !== undefined ? data.data : data;
  },
};

// Tool event types
export interface ToolEvent {
  type: 'tool_start' | 'tool_end';
  tool: string;
}

// Streaming fetch for chat
export async function streamChat(
  message: string,
  conversationId?: string,
  onChunk: (chunk: string) => void = () => {},
  onToolEvent?: (event: ToolEvent) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  const requestChat = async (useCompat: boolean) => {
    const endpoint = useCompat ? '/v1/chat/completions' : '/api/agent/chat/stream';
    return fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      credentials: 'include', // Send cookies for session-based auth
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        useCompat
          ? {
              model: 'dispotree-agent',
              messages: [{ role: 'user', content: message }],
              stream: true,
              user: conversationId,
            }
          : { message, sessionId: conversationId }
      ),
      signal: abortSignal,
    });
  };

  let res = await requestChat(false);

  // If auth fails, try the unauthenticated endpoint as fallback
  if (!res.ok && res.status === 401) {
    console.warn('Chat auth failed, falling back to unauthenticated endpoint');
    res = await requestChat(true);
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    console.error('Chat request failed:', res.status, errorText);
    throw new ApiError(res.status, `Chat failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';

  // Track emitted events to prevent duplicates
  const emittedEvents = new Set<string>();

  // Helper to parse and emit tool events (prevents double-parsing)
  const parseToolEvents = (text: string): string => {
    // First, check for wrapped format and remove them from text
    let cleanText = text;

    // Match wrapped format: [TOOL_EVENT]{"type":"tool_start","tool":"name"}[/TOOL_EVENT]
    const wrappedRegex = /\[TOOL_EVENT\]([\s\S]*?)\[\/TOOL_EVENT\]/g;
    let match;
    while ((match = wrappedRegex.exec(text)) !== null) {
      try {
        const event = JSON.parse(match[1]) as ToolEvent;
        const eventKey = `${event.type}:${event.tool}`;
        if (!emittedEvents.has(eventKey)) {
          emittedEvents.add(eventKey);
          onToolEvent?.(event);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Remove wrapped events from text first
    cleanText = cleanText.replace(/\n?\[TOOL_EVENT\][\s\S]*?\[\/TOOL_EVENT\]\n?/g, '');

    // Only parse raw JSON if NOT inside a wrapped format (check cleaned text)
    const rawRegex = /\{"type":\s*"(tool_start|tool_end)",\s*"tool":\s*"([^"]+)"\}/g;
    while ((match = rawRegex.exec(cleanText)) !== null) {
      const eventKey = `${match[1]}:${match[2]}`;
      if (!emittedEvents.has(eventKey)) {
        emittedEvents.add(eventKey);
        onToolEvent?.({ type: match[1] as 'tool_start' | 'tool_end', tool: match[2] });
      }
    }

    // Return text with all tool events removed
    return cleanText
      .replace(/\{"type":\s*"tool_(start|end)"[^}]*\}\n?/g, '')
      .replace(/^\s*\n/gm, '');
  };

  if (reader) {
    let reading = true;
    let buffer = '';
    const useOpenAICompat = res.url.includes('/v1/');

    try {
      while (reading) {
        // Check abort signal before each read
        if (abortSignal?.aborted) {
          reader.cancel();
          throw new DOMException('Aborted', 'AbortError');
        }

        const { done, value } = await reader.read();
        if (done) {
          reading = false;
          break;
        }

        const chunk = decoder.decode(value, { stream: true });

        if (!useOpenAICompat) {
          // Parse tool events and get clean text
          const cleanChunk = parseToolEvents(chunk);

          if (cleanChunk.trim()) {
            fullContent += cleanChunk;
            onChunk(cleanChunk);
          }
          continue;
        }

        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            reading = false;
            break;
          }
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              onChunk(delta);
            }
          } catch (error) {
            console.warn('Failed to parse OpenAI stream chunk', error);
          }
        }
      }
    } finally {
      // Always release the reader
      try {
        reader.releaseLock();
      } catch {
        // Ignore release errors
      }
    }
  }

  return fullContent;
}

// Sprite chat event types
export interface SpriteChatEvent {
  type: 'init' | 'text' | 'tool_start' | 'tool_end' | 'error' | 'done';
  data?: string;
  tool?: { name: string; input?: Record<string, unknown> };
  error?: string;
  sessionId?: string;
}

/**
 * Stream chat with Claude Code running in a sprite.
 * Uses SSE to stream responses from the backend.
 */
export async function streamSpriteChat(
  spriteId: string,
  prompt: string,
  options: {
    conversationId?: string;
    workDir?: string;
    onEvent?: (event: SpriteChatEvent) => void;
    onText?: (text: string) => void;
    abortSignal?: AbortSignal;
  } = {}
): Promise<{ fullContent: string; sessionId?: string }> {
  const res = await fetch(`${API_URL}/api/sprites/${spriteId}/chat/stream`, {
    method: 'POST',
    credentials: 'include', // Send cookies for session-based auth
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      conversationId: options.conversationId,
      workDir: options.workDir,
    }),
    signal: options.abortSignal,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new ApiError(res.status, `Chat failed: ${errorText}`);
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let sessionId: string | undefined;
  let buffer = '';

  if (reader) {
    try {
      while (true) {
        if (options.abortSignal?.aborted) {
          reader.cancel();
          throw new DOMException('Aborted', 'AbortError');
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const event = JSON.parse(data) as SpriteChatEvent;
            options.onEvent?.(event);

            if (event.type === 'init' && event.sessionId) {
              sessionId = event.sessionId;
            } else if (event.type === 'text' && event.data) {
              fullContent += event.data;
              options.onText?.(event.data);
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Unknown error from sprite');
            } else if (event.type === 'done' && event.sessionId) {
              sessionId = event.sessionId;
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              console.warn('Failed to parse sprite chat event:', data);
            } else {
              throw e;
            }
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Ignore release errors
      }
    }
  }

  return { fullContent, sessionId };
}

// Sprite chat conversation types
export interface SpriteChatConversation {
  id: string;
  spriteId: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SpriteChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: any[];
  createdAt: string;
}

// Fetch sprite chat conversations
export function getSpriteChatConversations(spriteId: string) {
  return api.get<SpriteChatConversation[]>(`/api/sprites/${spriteId}/chat/conversations`);
}

// Fetch sprite chat history for a conversation
export function getSpriteChatHistory(spriteId: string, sessionId: string) {
  return api.get<SpriteChatMessage[]>(`/api/sprites/${spriteId}/chat/conversations/${sessionId}`);
}

// Delete sprite chat conversation
export function deleteSpriteChatConversation(spriteId: string, sessionId: string) {
  return api.delete<{ deleted: number }>(`/api/sprites/${spriteId}/chat/conversations/${sessionId}`);
}

export { ApiError };
