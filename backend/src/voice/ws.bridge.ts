/**
 * WebSocket Bridge - Twilio <-> OpenAI Realtime
 *
 * Bridges audio streams between Twilio Media Streams and OpenAI Realtime API.
 */

import WebSocket from 'ws';
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../services/LoggerService';
import { executeToolCall } from './tools';
import { getAgentPromptConfig, getInitialGreeting } from './prompts';
import { runPostCallAnalysis } from './analysis';
import {
  BridgeSession,
  TwilioMediaMessage,
  OpenAIRealtimeMessage,
  CallContext,
  CallRecord,
  CallEventRecord,
  AgentProfile,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';
const EVENT_FLUSH_INTERVAL = 5000; // Flush events every 5 seconds
const EVENT_BATCH_SIZE = 20; // Max events to buffer before flush

// ============================================================================
// Session Store
// ============================================================================

const sessions = new Map<string, BridgeSession>();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert mulaw to PCM16 for OpenAI
 */
function mulawToPcm16(mulawBase64: string): string {
  const mulawData = Buffer.from(mulawBase64, 'base64');
  const pcmData = Buffer.alloc(mulawData.length * 2);

  // mulaw to linear conversion table
  const MULAW_DECODE = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const mu = ~i;
    const sign = mu & 0x80;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    MULAW_DECODE[i] = sign ? sample : -sample;
  }

  for (let i = 0; i < mulawData.length; i++) {
    const sample = MULAW_DECODE[mulawData[i]];
    pcmData.writeInt16LE(sample, i * 2);
  }

  return pcmData.toString('base64');
}

/**
 * Convert PCM16 to mulaw for Twilio
 */
function pcm16ToMulaw(pcmBase64: string): string {
  const pcmData = Buffer.from(pcmBase64, 'base64');
  const mulawData = Buffer.alloc(pcmData.length / 2);

  function linearToMulaw(sample: number): number {
    const MULAW_MAX = 32635;
    const MULAW_BIAS = 132;
    const sign = (sample >> 8) & 0x80;

    if (sign) sample = -sample;
    if (sample > MULAW_MAX) sample = MULAW_MAX;

    sample += MULAW_BIAS;
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
      exponent--;
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    const mulawByte = ~(sign | (exponent << 4) | mantissa);
    return mulawByte & 0xff;
  }

  for (let i = 0; i < pcmData.length; i += 2) {
    const sample = pcmData.readInt16LE(i);
    mulawData[i / 2] = linearToMulaw(sample);
  }

  return mulawData.toString('base64');
}

// ============================================================================
// Event Buffer Management
// ============================================================================

/**
 * Flush buffered events to database
 */
async function flushEvents(session: BridgeSession): Promise<void> {
  if (session.eventBuffer.length === 0) return;

  const events = [...session.eventBuffer];
  session.eventBuffer = [];
  session.lastFlushTime = Date.now();

  try {
    const { error } = await supabaseAdmin.from('call_events').insert(
      events.map((e) => ({
        call_id: e.call_id,
        type: e.type,
        speaker: e.speaker,
        payload: e.payload,
        ts: e.ts.toISOString(),
      }))
    );

    if (error) {
      logger.error('Error flushing call events', { callId: session.callId }, error);
      // Re-add events to buffer on error
      session.eventBuffer.push(...events);
    }
  } catch (error) {
    logger.error('Error flushing call events', { callId: session.callId }, error);
    session.eventBuffer.push(...events);
  }
}

/**
 * Add event to buffer and flush if needed
 */
async function bufferEvent(session: BridgeSession, event: Omit<CallEventRecord, 'id' | 'created_at'>): Promise<void> {
  session.eventBuffer.push({
    ...event,
    id: '', // Will be set by database
    created_at: new Date(),
  } as CallEventRecord);

  // Flush if buffer is full or enough time has passed
  const shouldFlush =
    session.eventBuffer.length >= EVENT_BATCH_SIZE ||
    Date.now() - session.lastFlushTime >= EVENT_FLUSH_INTERVAL;

  if (shouldFlush) {
    await flushEvents(session);
  }
}

// ============================================================================
// OpenAI Connection
// ============================================================================

/**
 * Connect to OpenAI Realtime API
 */
function connectToOpenAI(session: BridgeSession): WebSocket | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error('OPENAI_API_KEY not configured');
    return null;
  }

  const ws = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  ws.on('open', () => {
    logger.info('OpenAI Realtime connected', { callId: session.callId });

    // Configure session
    const promptConfig = getAgentPromptConfig(
      (session.context.call.agent_profile as AgentProfile) || 'sales',
      session.context
    );

    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: promptConfig.systemPrompt,
        voice: 'alloy',
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
        tools: promptConfig.tools.map((t) => ({
          type: t.type,
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
    };

    ws.send(JSON.stringify(sessionConfig));

    // Send initial greeting for outbound calls
    if (session.context.call.direction === 'outbound') {
      const greeting = getInitialGreeting(
        (session.context.call.agent_profile as AgentProfile) || 'sales',
        session.context
      );

      setTimeout(() => {
        ws.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: `[System: Call connected. Greet the caller with: "${greeting}"]`,
                },
              ],
            },
          })
        );

        ws.send(JSON.stringify({ type: 'response.create' }));
      }, 500);
    }
  });

  ws.on('message', async (data) => {
    try {
      const message: OpenAIRealtimeMessage = JSON.parse(data.toString());
      await handleOpenAIMessage(session, message);
    } catch (error) {
      logger.error('Error parsing OpenAI message', { callId: session.callId }, error);
    }
  });

  ws.on('error', (error) => {
    logger.error('OpenAI WebSocket error', { callId: session.callId }, error);
  });

  ws.on('close', (code, reason) => {
    logger.info('OpenAI WebSocket closed', {
      callId: session.callId,
      code,
      reason: reason.toString(),
    });
  });

  return ws;
}

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Handle messages from OpenAI
 */
async function handleOpenAIMessage(session: BridgeSession, message: OpenAIRealtimeMessage): Promise<void> {
  switch (message.type) {
    case 'session.created':
      logger.info('OpenAI session created', { callId: session.callId });
      break;

    case 'session.updated':
      logger.info('OpenAI session updated', { callId: session.callId });
      break;

    case 'response.audio.delta':
      // Send audio to Twilio
      if (session.twilioWs && session.streamSid && message.delta) {
        const mulawAudio = pcm16ToMulaw(message.delta);
        session.twilioWs.send(
          JSON.stringify({
            event: 'media',
            streamSid: session.streamSid,
            media: {
              payload: mulawAudio,
            },
          })
        );
      }
      break;

    case 'response.audio_transcript.delta':
      // Partial transcript from assistant
      break;

    case 'response.audio_transcript.done':
      // Final transcript from assistant
      if (message.transcript) {
        session.transcriptParts.push({
          speaker: 'assistant',
          text: message.transcript,
          ts: new Date(),
        });

        await bufferEvent(session, {
          call_id: session.callId,
          ts: new Date(),
          type: 'transcript',
          speaker: 'assistant',
          payload: { text: message.transcript },
        });
      }
      break;

    case 'conversation.item.input_audio_transcription.completed':
      // Final transcript from user
      if (message.transcript) {
        session.transcriptParts.push({
          speaker: 'user',
          text: message.transcript,
          ts: new Date(),
        });

        await bufferEvent(session, {
          call_id: session.callId,
          ts: new Date(),
          type: 'transcript',
          speaker: 'user',
          payload: { text: message.transcript },
        });
      }
      break;

    case 'response.function_call_arguments.done':
      // Tool call from OpenAI
      if (message.item) {
        const { name, call_id: toolCallId, arguments: argsString } = message.item;

        if (name && toolCallId && argsString) {
          try {
            const args = JSON.parse(argsString);

            await bufferEvent(session, {
              call_id: session.callId,
              ts: new Date(),
              type: 'tool_call',
              speaker: 'assistant',
              payload: { name, arguments: args },
            });

            // Execute the tool
            const result = await executeToolCall({
              name,
              arguments: args,
              call_id: session.callId,
            });

            // Send result back to OpenAI
            session.openaiWs?.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: toolCallId,
                  output: JSON.stringify(result),
                },
              })
            );

            // Continue response generation
            session.openaiWs?.send(JSON.stringify({ type: 'response.create' }));

            await bufferEvent(session, {
              call_id: session.callId,
              ts: new Date(),
              type: 'tool_result',
              speaker: 'system',
              payload: { name, result },
            });
          } catch (error) {
            logger.error('Error executing tool call', { callId: session.callId, name }, error);
          }
        }
      }
      break;

    case 'error':
      logger.error('OpenAI error', { callId: session.callId, error: message.error });
      await bufferEvent(session, {
        call_id: session.callId,
        ts: new Date(),
        type: 'error',
        speaker: 'system',
        payload: { error: message.error },
      });
      break;
  }
}

/**
 * Handle messages from Twilio
 */
async function handleTwilioMessage(session: BridgeSession, message: TwilioMediaMessage): Promise<void> {
  switch (message.event) {
    case 'connected':
      logger.info('Twilio stream connected', { callId: session.callId });
      break;

    case 'start':
      // Handled in handleTwilioConnection to extract callId from customParameters
      break;

    case 'media':
      if (message.media && session.openaiWs?.readyState === WebSocket.OPEN) {
        // Convert mulaw to PCM16 and send to OpenAI
        const pcmAudio = mulawToPcm16(message.media.payload);
        session.openaiWs.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: pcmAudio,
          })
        );
      }
      break;

    case 'stop':
      logger.info('Twilio stream stopped', { callId: session.callId });

      await bufferEvent(session, {
        call_id: session.callId,
        ts: new Date(),
        type: 'state',
        speaker: 'system',
        payload: { event: 'stream_stopped' },
      });

      // Flush remaining events
      await flushEvents(session);

      // Close OpenAI connection
      if (session.openaiWs) {
        session.openaiWs.close();
        session.openaiWs = null;
      }

      // Trigger post-call analysis
      setTimeout(() => {
        runPostCallAnalysis(session.callId).catch((err) => {
          logger.error('Error in post-call analysis', { callId: session.callId }, err);
        });
      }, 2000);
      break;

    case 'mark':
      // Acknowledge marks (used for synchronization)
      break;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load call context from database
 * If call record not found, creates a minimal context for testing/development
 */
async function loadCallContext(callId: string): Promise<CallContext | null> {
  try {
    const { data: callData, error } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (error || !callData) {
      // Try to find by call_sid as fallback
      const { data: callBySid } = await supabaseAdmin
        .from('calls')
        .select('*')
        .eq('call_sid', callId)
        .single();

      if (callBySid) {
        const call = callBySid as CallRecord;
        let contact = null;
        if (call.contact_id) {
          const { loadContactContext } = await import('./tools');
          contact = await loadContactContext(call.contact_id);
        }
        return { call, contact, deal: null };
      }

      // Create minimal context for testing when no call record exists
      logger.warn('Call record not found, creating minimal context for testing', { callId });
      const minimalCall: CallRecord = {
        id: callId,
        call_sid: callId,
        direction: 'outbound',
        from_number: process.env.TWILIO_NUMBER || '',
        to_number: '',
        status: 'in-progress',
        agent_profile: 'sales',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return { call: minimalCall, contact: null, deal: null };
    }

    const call = callData as CallRecord;

    // Load contact if available
    let contact = null;
    if (call.contact_id) {
      const { loadContactContext } = await import('./tools');
      contact = await loadContactContext(call.contact_id);
    }

    // Load deal if available
    let deal = null;
    if (call.deal_id) {
      const { loadDealContext } = await import('./tools');
      deal = await loadDealContext(call.deal_id);
    }

    return { call, contact, deal };
  } catch (error) {
    logger.error('Error loading call context', { callId }, error);
    return null;
  }
}

/**
 * Handle a new Twilio WebSocket connection
 * Note: callId may be null initially - it will be extracted from Twilio's "start" event customParameters
 */
export async function handleTwilioConnection(
  ws: WebSocket,
  callId: string | null
): Promise<void> {
  logger.info('New Twilio WebSocket connection', { callId: callId || 'pending' });

  // Session will be initialized when we receive the "start" event with customParameters
  let session: BridgeSession | null = null;

  // Handle Twilio messages
  ws.on('message', async (data) => {
    try {
      const message: TwilioMediaMessage = JSON.parse(data.toString());

      // Handle "start" event specially to extract callId from customParameters
      if (message.event === 'start' && message.start) {
        // Extract callId from customParameters (set via Stream Parameters in TwiML)
        const actualCallId = message.start.customParameters?.callId || callId || message.start.callSid;

        logger.info('Twilio stream start received', {
          callId: actualCallId,
          callSid: message.start.callSid,
          customParameters: message.start.customParameters,
        });

        // Load call context now that we have the callId
        const context = await loadCallContext(actualCallId);
        if (!context) {
          logger.error('Could not load call context', { callId: actualCallId });
          ws.close(1011, 'Call not found');
          return;
        }

        // Create session
        session = {
          callId: actualCallId,
          callSid: message.start.callSid || context.call.call_sid || '',
          streamSid: message.start.streamSid,
          openaiWs: null,
          twilioWs: ws,
          context,
          eventBuffer: [],
          lastFlushTime: Date.now(),
          transcriptParts: [],
        };

        sessions.set(actualCallId, session);

        // Connect to OpenAI now that we have the context
        try {
          session.openaiWs = connectToOpenAI(session);
          if (!session.openaiWs) {
            logger.error('Failed to create OpenAI WebSocket', { callId: actualCallId });
          }
        } catch (openaiError) {
          logger.error('Error connecting to OpenAI', { callId: actualCallId }, openaiError);
        }

        await bufferEvent(session, {
          call_id: session.callId,
          ts: new Date(),
          type: 'state',
          speaker: 'system',
          payload: {
            event: 'stream_started',
            streamSid: session.streamSid,
            callSid: session.callSid,
          },
        });
        return;
      }

      // For all other events, we need an initialized session
      if (!session) {
        logger.warn('Received Twilio message before session initialized', { event: message.event });
        return;
      }

      await handleTwilioMessage(session, message);
    } catch (error) {
      logger.error('Error handling Twilio message', { callId: session?.callId }, error);
    }
  });

  ws.on('error', (error) => {
    logger.error('Twilio WebSocket error', { callId: session?.callId }, error);
  });

  ws.on('close', async (code, reason) => {
    logger.info('Twilio WebSocket closed', {
      callId: session?.callId,
      code,
      reason: reason.toString(),
    });

    // Cleanup
    if (session) {
      await flushEvents(session);
      if (session.openaiWs) {
        session.openaiWs.close();
      }
      sessions.delete(session.callId);
    }
  });
}

/**
 * Get active session count
 */
export function getActiveSessionCount(): number {
  return sessions.size;
}

/**
 * Close all sessions (for graceful shutdown)
 */
export async function closeAllSessions(): Promise<void> {
  for (const [callId, session] of sessions) {
    logger.info('Closing session', { callId });
    await flushEvents(session);
    session.twilioWs?.close();
    session.openaiWs?.close();
  }
  sessions.clear();
}
