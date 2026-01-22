/**
 * Twilio Webhook Routes
 *
 * Handles inbound calls, status callbacks, and recording notifications from Twilio.
 */

import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../services/LoggerService';
import { runPostCallAnalysis } from './analysis';
import { findContactByPhone } from './tools';
import { CallStatus, CallStatusUpdate, ContactContext } from './types';
import { ContactActivity, Contact } from '../models';
import { getDefaultOrganizationId, resolveCommunicationContext } from '../utils/organizationDefaults';

const router = Router();

// ============================================================================
// Configuration
// ============================================================================

const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return null;
  }

  return twilio(accountSid, authToken);
};

const getPublicBaseUrl = (): string => {
  return process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
};

const getVoiceWsSecret = (): string | null => {
  return process.env.VOICE_WS_SECRET || process.env.JWT_SECRET || null;
};

const createTwilioStreamToken = (callId: string): string | null => {
  const secret = getVoiceWsSecret();
  if (!secret) {
    return null;
  }

  return jwt.sign(
    { callId, type: 'twilio' },
    secret,
    { expiresIn: '10m', issuer: 'dispotree' }
  );
};

const buildTwilioStreamUrl = (baseUrl: string): string => {
  const host = baseUrl.replace(/^https?:\/\//, '');
  return `wss://${host}/voice/ws/twilio`;
};

const respondWithVoiceError = (res: Response, message: string) => {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: 'Polly.Joanna' }, message);
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
};

const buildContactContext = (contact: Contact): ContactContext => ({
  id: contact.id,
  name: contact.name,
  phone: contact.phone,
  email: contact.email,
  type: contact.type,
  company: contact.company,
  tags: contact.tags || [],
  notes: contact.notes,
});

const findOrCreateContactByPhone = async (phone?: string): Promise<ContactContext | null> => {
  if (!phone) return null;

  const existing = await findContactByPhone(phone);
  if (existing) return existing;

  const organizationId = await getDefaultOrganizationId();
  if (!organizationId) {
    logger.warn('No active organization found for inbound contact auto-create', { phone });
    return null;
  }

  const contact = await Contact.create({
    organizationId,
    createdById: null,
    type: 'other',
    name: phone ? `Caller ${phone}` : 'Unknown Caller',
    phone: phone || null,
    notes: 'Auto-created from inbound call',
    status: 'active',
  });

  logger.info('Auto-created contact for inbound call', { contactId: contact.id, phone });

  return buildContactContext(contact);
};

// ============================================================================
// Webhook Signature Validation
// ============================================================================

const validateTwilioSignature = (req: Request): boolean => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const twilioSignature = req.headers['x-twilio-signature'] as string;
  if (!twilioSignature) return false;

  const url = `${getPublicBaseUrl()}${req.originalUrl}`;
  const params = req.body;

  return twilio.validateRequest(authToken, twilioSignature, url, params);
};

// ============================================================================
// Inbound Call Handler
// ============================================================================

/**
 * POST /voice/twilio/inbound
 * Handles inbound calls - returns TwiML to connect to WebSocket bridge
 */
router.post('/inbound', async (req: Request, res: Response) => {
  try {
    logger.info('Inbound call received', {
      from: req.body.From,
      to: req.body.To,
      callSid: req.body.CallSid,
    });

    // Validate Twilio signature in production
    if (process.env.NODE_ENV === 'production' && !validateTwilioSignature(req)) {
      logger.warn('Invalid Twilio signature for inbound call');
      return res.status(403).send('Invalid signature');
    }

    const callSid = req.body.CallSid;
    const from = req.body.From;
    const to = req.body.To;

    // Find or create contact by phone
    const contact = await findOrCreateContactByPhone(from);
    const { userId: defaultUserId, organizationId } = await resolveCommunicationContext({
      organizationId: contact?.organizationId,
    });

    // Create call record
    const { data: callData, error: insertError } = await supabaseAdmin
      .from('calls')
      .insert({
        call_sid: callSid,
        direction: 'inbound',
        from_number: from,
        to_number: to,
        contact_id: contact?.id || null,
        organization_id: organizationId || null,
        initiated_by: defaultUserId || null,
        status: 'ringing',
        agent_profile: 'support', // Default for inbound
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Error creating call record', {}, insertError);
      // Continue anyway - don't fail the call
    }

    const callId = callData?.id || callSid;
    const baseUrl = getPublicBaseUrl();
    const streamToken = createTwilioStreamToken(String(callId));
    if (!streamToken && process.env.NODE_ENV === 'production') {
      logger.error('Voice WebSocket secret not configured for inbound call');
      return respondWithVoiceError(
        res,
        'We are experiencing technical difficulties. Please try again later.'
      );
    }
    const streamUrl = buildTwilioStreamUrl(baseUrl);

    // Generate TwiML response
    const response = new twilio.twiml.VoiceResponse();

    // Say a brief connecting message
    response.say(
      { voice: 'Polly.Joanna' },
      'Thank you for calling. Please hold while I connect you.'
    );

    // Connect to WebSocket for AI conversation
    const connect = response.connect();
    const stream = connect.stream({
      url: streamUrl,
      statusCallback: `${baseUrl}/voice/twilio/stream-status`,
      statusCallbackMethod: 'POST',
    });
    // Pass callId and token as Stream Parameters (Twilio strips URL query params)
    stream.parameter({ name: 'callId', value: String(callId) });
    if (streamToken) {
      stream.parameter({ name: 'token', value: streamToken });
    }

    // Set status callback for call events
    response.redirect({
      method: 'POST',
    }, `${baseUrl}/voice/twilio/status`);

    res.type('text/xml');
    res.send(response.toString());

    logger.info('TwiML response sent for inbound call', { callId, callSid });
  } catch (error) {
    logger.error('Error handling inbound call', {}, error);

    // Return a friendly error message
    const response = new twilio.twiml.VoiceResponse();
    response.say(
      { voice: 'Polly.Joanna' },
      'We are experiencing technical difficulties. Please try again later.'
    );
    response.hangup();

    res.type('text/xml');
    res.send(response.toString());
  }
});

// ============================================================================
// Outbound Call TwiML
// ============================================================================

/**
 * POST /voice/twilio/outbound
 * Returns TwiML for outbound calls (called by Twilio when call connects)
 */
router.post('/outbound', async (req: Request, res: Response) => {
  try {
    const callId = req.query.callId as string;
    const callSid = req.body.CallSid;

    logger.info('Outbound call connected', { callId, callSid });

    // Validate Twilio signature in production
    if (process.env.NODE_ENV === 'production' && !validateTwilioSignature(req)) {
      logger.warn('Invalid Twilio signature for outbound call');
      return res.status(403).send('Invalid signature');
    }

    // Update call record with Twilio's CallSid
    await supabaseAdmin
      .from('calls')
      .update({
        call_sid: callSid,
        status: 'in-progress',
        started_at: new Date().toISOString(),
      })
      .eq('id', callId);

    const baseUrl = getPublicBaseUrl();
    const streamToken = createTwilioStreamToken(callId || 'unknown');
    if (!streamToken && process.env.NODE_ENV === 'production') {
      logger.error('Voice WebSocket secret not configured for outbound call');
      return respondWithVoiceError(
        res,
        'We are experiencing technical difficulties. Please try again later.'
      );
    }
    const streamUrl = buildTwilioStreamUrl(baseUrl);

    // Generate TwiML response
    const response = new twilio.twiml.VoiceResponse();

    // Connect to WebSocket for AI conversation
    const connect = response.connect();
    const stream = connect.stream({
      url: streamUrl,
      statusCallback: `${baseUrl}/voice/twilio/stream-status`,
      statusCallbackMethod: 'POST',
    });
    // Pass callId and token as Stream Parameters (Twilio strips URL query params)
    stream.parameter({ name: 'callId', value: callId || callSid });
    if (streamToken) {
      stream.parameter({ name: 'token', value: streamToken });
    }

    res.type('text/xml');
    res.send(response.toString());

    logger.info('TwiML response sent for outbound call', { callId, callSid });
  } catch (error) {
    logger.error('Error handling outbound call TwiML', {}, error);

    const response = new twilio.twiml.VoiceResponse();
    response.say(
      { voice: 'Polly.Joanna' },
      'We are experiencing technical difficulties.'
    );
    response.hangup();

    res.type('text/xml');
    res.send(response.toString());
  }
});

// ============================================================================
// Status Callback
// ============================================================================

/**
 * Map Twilio status to our status
 */
function mapTwilioStatus(twilioStatus: string): CallStatus {
  const statusMap: Record<string, CallStatus> = {
    queued: 'initiated',
    ringing: 'ringing',
    'in-progress': 'in-progress',
    completed: 'completed',
    busy: 'busy',
    'no-answer': 'no-answer',
    failed: 'failed',
    canceled: 'canceled',
  };
  return statusMap[twilioStatus] || 'initiated';
}

/**
 * POST /voice/twilio/status
 * Handles call status updates from Twilio
 */
router.post('/status', async (req: Request, res: Response) => {
  try {
    const update: CallStatusUpdate = req.body;

    logger.info('Call status update', {
      callSid: update.CallSid,
      status: update.CallStatus,
      duration: update.CallDuration,
    });

    // Validate Twilio signature in production
    if (process.env.NODE_ENV === 'production' && !validateTwilioSignature(req)) {
      logger.warn('Invalid Twilio signature for status callback');
      return res.status(403).send('Invalid signature');
    }

    const callSid = update.CallSid;
    const status = mapTwilioStatus(update.CallStatus);

    // Build update object
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    // Add duration if completed
    if (update.CallDuration) {
      updateData.duration_sec = parseInt(update.CallDuration, 10);
    }

    // Add ended_at for terminal states
    if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(status)) {
      updateData.ended_at = new Date().toISOString();
    }

    // Update call record
    const { data: callData, error } = await supabaseAdmin
      .from('calls')
      .update(updateData)
      .eq('call_sid', callSid)
      .select()
      .single();

    if (error) {
      logger.error('Error updating call status', { callSid }, error);
    }

    // Trigger post-call analysis for completed calls
    if (status === 'completed' && callData) {
      // Log to ContactActivity if we have a contact
      if (callData.contact_id) {
        try {
          const { userId: logUserId, organizationId: logOrganizationId } = await resolveCommunicationContext({
            userId: callData.initiated_by,
            organizationId: callData.organization_id,
          });

          await ContactActivity.logCall({
            contactId: callData.contact_id,
            direction: callData.direction === 'inbound' ? 'inbound' : 'outbound',
            callSid: callSid,
            duration: callData.duration_sec,
            recordingUrl: callData.recording_url,
            summary: callData.summary,
            outcome: callData.outcome,
            userId: logUserId || undefined,
            organizationId: logOrganizationId || undefined,
            dealId: callData.deal_id,
            propertyId: callData.property_id,
            metadata: {
              agentProfile: callData.agent_profile,
              from: callData.from_number,
              to: callData.to_number,
            },
          });
          logger.info('Call logged to ContactActivity', { callId: callData.id, contactId: callData.contact_id });
        } catch (logError) {
          logger.error('Error logging call to ContactActivity', { callId: callData.id }, logError);
        }
      }

      setTimeout(() => {
        runPostCallAnalysis(callData.id).catch((err) => {
          logger.error('Error in post-call analysis', { callId: callData.id }, err);
        });
      }, 3000);
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error handling status callback', {}, error);
    res.status(500).send('Error');
  }
});

// ============================================================================
// Recording Callback
// ============================================================================

/**
 * POST /voice/twilio/recording
 * Handles recording completion notifications
 */
router.post('/recording', async (req: Request, res: Response) => {
  try {
    const {
      CallSid: callSid,
      RecordingSid: recordingSid,
      RecordingUrl: recordingUrl,
      RecordingDuration: duration,
    } = req.body;

    logger.info('Recording completed', {
      callSid,
      recordingSid,
      duration,
    });

    // Validate Twilio signature in production
    if (process.env.NODE_ENV === 'production' && !validateTwilioSignature(req)) {
      logger.warn('Invalid Twilio signature for recording callback');
      return res.status(403).send('Invalid signature');
    }

    // Update call record with recording info
    const { error } = await supabaseAdmin
      .from('calls')
      .update({
        recording_url: recordingUrl,
        recording_sid: recordingSid,
        updated_at: new Date().toISOString(),
      })
      .eq('call_sid', callSid);

    if (error) {
      logger.error('Error updating recording info', { callSid }, error);
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error handling recording callback', {}, error);
    res.status(500).send('Error');
  }
});

// ============================================================================
// Stream Status Callback
// ============================================================================

/**
 * POST /voice/twilio/stream-status
 * Handles media stream status updates
 */
router.post('/stream-status', async (req: Request, res: Response) => {
  try {
    const { StreamSid: streamSid, StreamStatus: status } = req.body;

    logger.info('Stream status update', { streamSid, status });

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error handling stream status', {}, error);
    res.status(500).send('Error');
  }
});

// ============================================================================
// Fallback Handler
// ============================================================================

/**
 * POST /voice/twilio/fallback
 * Handles errors - provides a graceful message to caller
 */
router.post('/fallback', (req: Request, res: Response) => {
  logger.error('Twilio fallback triggered', { body: req.body });

  const response = new twilio.twiml.VoiceResponse();
  response.say(
    { voice: 'Polly.Joanna' },
    'We apologize, but we are unable to process your call at this time. Please try again later.'
  );
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

export default router;
