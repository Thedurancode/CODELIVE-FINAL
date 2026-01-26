/**
 * Realtime Voice Service
 *
 * Handles real-time voice conversations using OpenAI's Realtime API.
 * Proxies WebSocket connections and handles tool calls.
 *
 * Now integrated with the full agent tool registry (100+ tools) via RealtimeAgentBridge.
 */

import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { realtimeAgentBridge } from './RealtimeAgentBridge';
import { voiceContextLoader, VoiceContext } from './VoiceContextLoader';
import { logger } from './LoggerService';

const log = logger.child({ service: 'realtime-voice' });

// Base session configuration (tools and instructions added dynamically)
const BASE_SESSION_CONFIG = {
  modalities: ['text', 'audio'],
  voice: 'nova',
  input_audio_format: 'pcm16',
  output_audio_format: 'pcm16',
  input_audio_transcription: {
    model: 'whisper-1',
  },
  turn_detection: {
    type: 'server_vad',
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 500,
  },
  tool_choice: 'auto',
};

/**
 * Build session config with tools from the agent bridge
 * @param userContext - Optional pre-loaded user context summary
 */
function buildSessionConfig(userContext?: string): typeof BASE_SESSION_CONFIG & { instructions: string; tools: object[] } {
  // Get tools from the agent bridge (priority tools for voice)
  const tools = realtimeAgentBridge.getRealtimeToolDefinitions({ priorityOnly: true });

  // Get voice-optimized system prompt with user context
  const instructions = realtimeAgentBridge.getVoiceSystemPrompt(userContext);

  return {
    ...BASE_SESSION_CONFIG,
    instructions,
    tools,
  };
}

interface RealtimeSession {
  ws: WebSocket;
  openaiWs: WebSocket | null;
  userId: string;
  sessionId: string;
  context?: VoiceContext;
}

class RealtimeVoiceService {
  private sessions: Map<string, RealtimeSession> = new Map();
  private initialized = false;

  /**
   * Initialize the service and bridge
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await realtimeAgentBridge.initialize();
    this.initialized = true;

    log.info('RealtimeVoiceService initialized', {
      toolCount: realtimeAgentBridge.getToolCount(),
    });
  }

  /**
   * Handle a new WebSocket connection for real-time voice
   */
  async handleConnection(ws: WebSocket, req: IncomingMessage, userId: string): Promise<void> {
    // Ensure bridge is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    const sessionId = `realtime-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    log.info('New voice connection', { sessionId, userId });
    log.debug('Client WebSocket state', { state: ws.readyState });

    // Send immediate acknowledgment to client
    try {
      ws.send(JSON.stringify({ type: 'connection.acknowledged', sessionId }));
      log.debug('Sent connection acknowledgment to client');
    } catch (err) {
      log.error('Failed to send acknowledgment', {}, err);
    }

    // Load user context proactively (non-blocking)
    let userContext: VoiceContext | undefined;
    try {
      // Only send if WebSocket is open
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'context.loading', message: 'Loading your context...' }));
      }
      userContext = await voiceContextLoader.loadContext(userId);
      log.info('User context loaded', {
        sessionId,
        pipelineCount: userContext.pipeline.total,
        tasksDue: userContext.dueTasks.length,
        hasPreferences: !!userContext.preferences.strategy,
      });
    } catch (err) {
      log.warn('Failed to load user context, continuing without', { sessionId }, err);
      // Continue without context - don't crash the connection
    }

    const session: RealtimeSession = {
      ws,
      openaiWs: null,
      userId,
      sessionId,
      context: userContext,
    };

    this.sessions.set(sessionId, session);

    // Connect to OpenAI Realtime API
    this.connectToOpenAI(session);

    // Handle messages from client
    ws.on('message', (data) => {
      this.handleClientMessage(session, data);
    });

    // Handle client disconnect
    ws.on('close', () => {
      log.info('Client disconnected', { sessionId });
      this.cleanup(sessionId);
    });

    ws.on('error', (error) => {
      log.error('Client WebSocket error', { sessionId }, error);
      this.cleanup(sessionId);
    });
  }

  /**
   * Connect to OpenAI's Realtime API
   */
  private connectToOpenAI(session: RealtimeSession): void {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      log.error('No OpenAI API key configured');
      this.sendToClient(session, {
        type: 'error',
        error: { message: 'OpenAI API key not configured' },
      });
      session.ws.close(1008, 'No API key');
      return;
    }

    log.info('Connecting to OpenAI Realtime API', { sessionId: session.sessionId });
    log.debug('API key configured', { keyPrefix: apiKey.substring(0, 10) });

    // Use the model name without date suffix for broader compatibility
    const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';

    try {
      const openaiWs = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
        // Enable per-message deflate to handle OpenAI's compressed frames
        perMessageDeflate: {
          zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3,
          },
          zlibInflateOptions: {
            chunkSize: 10 * 1024,
          },
          clientNoContextTakeover: true,
          serverNoContextTakeover: true,
          serverMaxWindowBits: 10,
          concurrencyLimit: 10,
          threshold: 1024,
        },
      });

      session.openaiWs = openaiWs;

      openaiWs.on('open', () => {
        log.info('Connected to OpenAI', { sessionId: session.sessionId });

        // Build session config with full agent tools and user context
        const contextSummary = session.context?.summary;
        const sessionConfig = buildSessionConfig(contextSummary);
        log.info('Session configured with tools and context', {
          sessionId: session.sessionId,
          toolCount: sessionConfig.tools.length,
          hasContext: !!contextSummary,
          contextLength: contextSummary?.length || 0,
        });

        // Configure the session
        this.sendToOpenAI(session, {
          type: 'session.update',
          session: sessionConfig,
        });

        // Notify client that we're ready with context info
        this.sendToClient(session, {
          type: 'session.ready',
          sessionId: session.sessionId,
          toolCount: sessionConfig.tools.length,
          hasContext: !!contextSummary,
          context: session.context ? {
            pipelineCount: session.context.pipeline.total,
            tasksDue: session.context.dueTasks.length,
            remindersDue: session.context.dueReminders.length,
          } : null,
        });
      });

      openaiWs.on('message', (data) => {
        this.handleOpenAIMessage(session, data);
      });

      openaiWs.on('close', (code, reason) => {
        log.info('OpenAI connection closed', {
          sessionId: session.sessionId,
          code,
          reason: reason.toString(),
        });
        this.sendToClient(session, { type: 'session.closed', code, reason: reason.toString() });
      });

      openaiWs.on('error', (error: any) => {
        log.error('OpenAI WebSocket error', {
          sessionId: session.sessionId,
          message: error.message,
          code: error.code,
        }, error);
        this.sendToClient(session, {
          type: 'error',
          error: { message: `Connection to AI failed: ${error.message || 'Unknown error'}`, code: error.code },
        });
        // Don't close the client here - let them know the error but keep connection for retry
      });
    } catch (err) {
      log.error('Failed to create OpenAI WebSocket', {}, err);
      this.sendToClient(session, {
        type: 'error',
        error: 'Failed to connect to AI service',
      });
      session.ws.close();
    }
  }

  /**
   * Handle messages from the client
   */
  private handleClientMessage(session: RealtimeSession, data: WebSocket.RawData): void {
    try {
      const message = JSON.parse(data.toString());

      // Forward audio data to OpenAI
      if (message.type === 'input_audio_buffer.append') {
        this.sendToOpenAI(session, message);
      }
      // Forward other control messages
      else if (message.type === 'input_audio_buffer.commit' ||
               message.type === 'input_audio_buffer.clear' ||
               message.type === 'response.cancel') {
        this.sendToOpenAI(session, message);
      }
      // Handle text input
      else if (message.type === 'conversation.item.create') {
        this.sendToOpenAI(session, message);
      }
    } catch (error) {
      log.error('Error parsing client message', { sessionId: session.sessionId }, error);
    }
  }

  /**
   * Handle messages from OpenAI
   */
  private async handleOpenAIMessage(session: RealtimeSession, data: WebSocket.RawData): Promise<void> {
    try {
      const message = JSON.parse(data.toString());

      // Handle tool calls
      if (message.type === 'response.function_call_arguments.done') {
        await this.handleToolCall(session, message);
        return;
      }

      // Forward relevant events to client
      const forwardEvents = [
        'session.created',
        'session.updated',
        'conversation.item.created',
        'conversation.item.input_audio_transcription.completed',
        'response.created',
        'response.output_item.added',
        'response.audio.delta',
        'response.audio.done',
        'response.audio_transcript.delta',
        'response.audio_transcript.done',
        'response.text.delta',
        'response.text.done',
        'response.done',
        'input_audio_buffer.speech_started',
        'input_audio_buffer.speech_stopped',
        'input_audio_buffer.committed',
        'error',
      ];

      if (forwardEvents.includes(message.type)) {
        this.sendToClient(session, message);
      }
    } catch (error) {
      log.error('Error handling OpenAI message', { sessionId: session.sessionId }, error);
    }
  }

  /**
   * Handle tool calls from OpenAI - now uses the full agent tool registry
   */
  private async handleToolCall(session: RealtimeSession, message: any): Promise<void> {
    const { call_id, name, arguments: argsJson } = message;

    log.info('Voice tool call', { sessionId: session.sessionId, tool: name });

    let result: { success: boolean; data?: any; error?: string };
    try {
      const args = JSON.parse(argsJson);

      // Execute using the agent bridge (access to 100+ tools)
      result = await realtimeAgentBridge.executeTool(name, args, {
        sessionId: session.sessionId,
        userId: session.userId,
        requestId: call_id,
      });

      log.info('Voice tool completed', {
        sessionId: session.sessionId,
        tool: name,
        success: result.success,
      });
    } catch (error) {
      log.error('Voice tool execution failed', { tool: name }, error);
      result = {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }

    // Send tool result back to OpenAI
    this.sendToOpenAI(session, {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id,
        output: JSON.stringify(result),
      },
    });

    // Trigger response generation
    this.sendToOpenAI(session, {
      type: 'response.create',
    });
  }

  /**
   * Send a message to the client
   */
  private sendToClient(session: RealtimeSession, message: any): void {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send a message to OpenAI
   */
  private sendToOpenAI(session: RealtimeSession, message: any): void {
    if (session.openaiWs?.readyState === WebSocket.OPEN) {
      session.openaiWs.send(JSON.stringify(message));
    }
  }

  /**
   * Cleanup a session
   */
  private cleanup(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.openaiWs) {
        session.openaiWs.close();
      }
      this.sessions.delete(sessionId);
    }
  }
}

export const realtimeVoiceService = new RealtimeVoiceService();
