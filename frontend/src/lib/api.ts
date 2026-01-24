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
  // Try to get token from multiple sources
  let token = null;

  if (typeof window !== 'undefined') {
    // 1. Check localStorage first (fastest) - try all possible token keys
    token = localStorage.getItem('dispotree_token') || localStorage.getItem('codelive_token');

    // 2. Check cookie if no localStorage token
    if (!token) {
      const cookieMatch = document.cookie.match(/(?:dispotree_token|codelive_token)=([^;]+)/);
      if (cookieMatch) {
        token = cookieMatch[1];
        // Cache in localStorage for faster access
        localStorage.setItem('dispotree_token', token);
      }
    }

    // 3. Only try Supabase if no token found (with timeout to prevent hanging)
    if (!token) {
      try {
        // Dynamic import to avoid SSR issues
        const { supabase } = await import('./supabase');
        if (supabase?.auth) {
          // Add timeout to prevent hanging when Supabase is down
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Supabase timeout')), 2000)
          );

          const { data } = await Promise.race([sessionPromise, timeoutPromise]) as { data: { session: { access_token: string } | null } };
          if (data?.session?.access_token) {
            token = data.session.access_token;
            // Cache in localStorage for faster access
            localStorage.setItem('dispotree_token', token);
          }
        }
      } catch (e) {
        console.warn('Supabase auth not available:', e);
      }
    }
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
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
    let token = null;
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('dispotree_token') || localStorage.getItem('codelive_token');
      if (!token) {
        const cookieMatch = document.cookie.match(/(?:dispotree_token|codelive_token)=([^;]+)/);
        if (cookieMatch) {
          token = cookieMatch[1];
        }
      }
    }

    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
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
  // Get token from Supabase session first, fallback to localStorage (same as fetchApi)
  let token = null;
  if (typeof window !== 'undefined') {
    try {
      const { supabase } = await import('./supabase');
      if (supabase?.auth) {
        const { data } = await supabase.auth.getSession();
        token = data?.session?.access_token;
      }
    } catch (e) {
      console.warn('Supabase auth not available for chat:', e);
    }

    // Fallback to localStorage if no session
    if (!token) {
      token = localStorage.getItem('dispotree_token') || localStorage.getItem('codelive_token');
    }
  }

  let useOpenAICompat = !token;

  const requestChat = async (useCompat: boolean, authToken: string | null) => {
    const endpoint = useCompat ? '/v1/chat/completions' : '/api/agent/chat/stream';
    return fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
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

  let res = await requestChat(useOpenAICompat, token);

  // If auth fails, try the unauthenticated endpoint as fallback
  if (!res.ok && !useOpenAICompat && res.status === 401) {
    console.warn('Chat auth failed, falling back to unauthenticated endpoint');
    useOpenAICompat = true;
    res = await requestChat(true, null);
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

export { ApiError };
