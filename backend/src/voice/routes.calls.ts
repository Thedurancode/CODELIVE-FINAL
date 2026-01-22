/**
 * Call Management Routes
 *
 * REST API for managing calls - initiating outbound calls, listing calls, etc.
 */

import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import { supabaseAdmin } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import { logger } from '../services/LoggerService';
import Contact from '../models/Contact';
import { loadContactContext, loadDealContext } from './tools';
import { getActiveSessionCount } from './ws.bridge';
import { analyzeUnprocessedCalls } from './analysis';
import {
  OutboundCallRequest,
  OutboundCallResponse,
  AgentProfile,
  CallRecord,
} from './types';

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

const getTwilioNumber = (): string | null => {
  return process.env.TWILIO_NUMBER || null;
};

// ============================================================================
// Middleware
// ============================================================================

router.use(authenticate);

// ============================================================================
// Outbound Call
// ============================================================================

/**
 * POST /voice/calls/outbound
 * Initiate an outbound call to a contact
 */
router.post('/outbound', async (req: Request, res: Response) => {
  try {
    const body: OutboundCallRequest = req.body;
    const userId = req.user!.id;

    logger.info('Outbound call request', { body, userId });

    // Validate required fields
    if (!body.contact_id) {
      return res.status(400).json({
        success: false,
        error: 'contact_id is required',
      });
    }

    // Get Twilio client
    const twilioClient = getTwilioClient();
    if (!twilioClient) {
      return res.status(503).json({
        success: false,
        error: 'Twilio not configured',
      });
    }

    // Get Twilio number
    const fromNumber = body.from_number || getTwilioNumber();
    if (!fromNumber) {
      return res.status(400).json({
        success: false,
        error: 'No from_number provided and TWILIO_NUMBER not configured',
      });
    }

    // Load contact
    const contact = await Contact.findByPk(body.contact_id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found',
      });
    }

    if (!contact.phone) {
      return res.status(400).json({
        success: false,
        error: 'Contact has no phone number',
      });
    }

    // Load deal if provided
    let dealId: number | null = null;
    if (body.deal_id) {
      const deal = await loadDealContext(body.deal_id);
      if (!deal) {
        return res.status(404).json({
          success: false,
          error: 'Deal not found',
        });
      }
      dealId = deal.id;
    }

    // Determine agent profile
    const agentProfile: AgentProfile = body.agent_profile || 'sales';

    // Create call record first
    const { data: callData, error: insertError } = await supabaseAdmin
      .from('calls')
      .insert({
        direction: 'outbound',
        from_number: fromNumber,
        to_number: contact.phone,
        contact_id: contact.id,
        deal_id: dealId,
        organization_id: contact.organizationId,
        initiated_by: userId,
        agent_profile: agentProfile,
        status: 'initiated',
      })
      .select()
      .single();

    if (insertError || !callData) {
      logger.error('Error creating call record', {}, insertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create call record',
      });
    }

    const callId = callData.id;
    const baseUrl = getPublicBaseUrl();

    // Initiate Twilio call
    try {
      const call = await twilioClient.calls.create({
        to: contact.phone,
        from: fromNumber,
        url: `${baseUrl}/voice/twilio/outbound?callId=${callId}`,
        statusCallback: `${baseUrl}/voice/twilio/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        record: true,
        recordingStatusCallback: `${baseUrl}/voice/twilio/recording`,
        recordingStatusCallbackMethod: 'POST',
        machineDetection: 'DetectMessageEnd',
        machineDetectionTimeout: 30,
      });

      // Update call record with Twilio's SID
      await supabaseAdmin
        .from('calls')
        .update({
          call_sid: call.sid,
          status: 'ringing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', callId);

      logger.info('Outbound call initiated', {
        callId,
        callSid: call.sid,
        to: contact.phone,
      });

      const response: OutboundCallResponse = {
        success: true,
        call_id: callId,
        call_sid: call.sid,
        status: 'ringing',
      };

      res.json(response);
    } catch (twilioError) {
      logger.error('Twilio error initiating call', {}, twilioError);

      // Update call record with error
      await supabaseAdmin
        .from('calls')
        .update({
          status: 'failed',
          metadata: { error: (twilioError as Error).message },
          updated_at: new Date().toISOString(),
        })
        .eq('id', callId);

      return res.status(500).json({
        success: false,
        error: 'Failed to initiate call',
        call_id: callId,
      });
    }
  } catch (error) {
    logger.error('Error in outbound call endpoint', {}, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// List Calls
// ============================================================================

/**
 * GET /voice/calls
 * List calls with filtering and pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '20',
      direction,
      status,
      contact_id,
      deal_id,
      outcome,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    // Build query
    let query = supabaseAdmin
      .from('calls')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    // Apply filters
    if (direction) {
      query = query.eq('direction', direction);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (contact_id) {
      query = query.eq('contact_id', contact_id);
    }
    if (deal_id) {
      query = query.eq('deal_id', deal_id);
    }
    if (outcome) {
      query = query.eq('outcome', outcome);
    }

    const { data: calls, count, error } = await query;

    if (error) {
      logger.error('Error fetching calls', {}, error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch calls',
      });
    }

    res.json({
      success: true,
      data: calls,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        pages: Math.ceil((count || 0) / limitNum),
      },
    });
  } catch (error) {
    logger.error('Error in list calls endpoint', {}, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Get Call Details
// ============================================================================

/**
 * GET /voice/calls/:id
 * Get detailed information about a call
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get call record
    const { data: call, error: callError } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', id)
      .single();

    if (callError || !call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found',
      });
    }

    // Get call events
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('call_events')
      .select('*')
      .eq('call_id', id)
      .order('ts', { ascending: true });

    if (eventsError) {
      logger.error('Error fetching call events', { callId: id }, eventsError);
    }

    // Build transcript from events
    const transcript = (events || [])
      .filter((e: any) => e.type === 'transcript')
      .map((e: any) => ({
        speaker: e.speaker === 'user' ? 'Caller' : 'Agent',
        text: e.payload?.text || e.payload?.transcript || '',
        ts: e.ts,
      }));

    // Load related entities
    let contact = null;
    if (call.contact_id) {
      contact = await loadContactContext(call.contact_id);
    }

    let deal = null;
    if (call.deal_id) {
      deal = await loadDealContext(call.deal_id);
    }

    res.json({
      success: true,
      data: {
        call,
        events: events || [],
        transcript,
        contact,
        deal,
      },
    });
  } catch (error) {
    logger.error('Error in get call endpoint', {}, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Get Call Transcript
// ============================================================================

/**
 * GET /voice/calls/:id/transcript
 * Get the formatted transcript of a call
 */
router.get('/:id/transcript', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    // Get transcript events
    const { data: events, error } = await supabaseAdmin
      .from('call_events')
      .select('*')
      .eq('call_id', id)
      .eq('type', 'transcript')
      .order('ts', { ascending: true });

    if (error) {
      logger.error('Error fetching transcript', { callId: id }, error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch transcript',
      });
    }

    const transcript = (events || []).map((e: any) => ({
      speaker: e.speaker === 'user' ? 'Caller' : 'Agent',
      text: e.payload?.text || e.payload?.transcript || '',
      ts: e.ts,
    }));

    if (format === 'text') {
      const textTranscript = transcript
        .map((t: any) => `${t.speaker}: ${t.text}`)
        .join('\n\n');

      res.type('text/plain');
      res.send(textTranscript);
    } else {
      res.json({
        success: true,
        data: transcript,
      });
    }
  } catch (error) {
    logger.error('Error in get transcript endpoint', {}, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Service Status
// ============================================================================

/**
 * GET /voice/calls/status
 * Get voice calling service status
 */
router.get('/service/status', async (req: Request, res: Response) => {
  try {
    const twilioClient = getTwilioClient();
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const activeSessions = getActiveSessionCount();

    // Get recent call stats
    const { data: recentCalls, error } = await supabaseAdmin
      .from('calls')
      .select('status')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const stats = {
      total: recentCalls?.length || 0,
      completed: recentCalls?.filter((c: any) => c.status === 'completed').length || 0,
      failed: recentCalls?.filter((c: any) => c.status === 'failed').length || 0,
      inProgress: recentCalls?.filter((c: any) => c.status === 'in-progress').length || 0,
    };

    res.json({
      success: true,
      status: {
        twilio: {
          configured: !!twilioClient,
          number: getTwilioNumber() ? 'configured' : 'not configured',
        },
        openai: {
          configured: hasOpenAI,
        },
        activeSessions,
        last24Hours: stats,
      },
    });
  } catch (error) {
    logger.error('Error in service status endpoint', {}, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Reanalyze Call
// ============================================================================

/**
 * POST /voice/calls/:id/analyze
 * Trigger reanalysis of a call
 */
router.post('/:id/analyze', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify call exists
    const { data: call, error } = await supabaseAdmin
      .from('calls')
      .select('id, status')
      .eq('id', id)
      .single();

    if (error || !call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found',
      });
    }

    // Import and run analysis
    const { runPostCallAnalysis } = await import('./analysis');
    await runPostCallAnalysis(id);

    // Fetch updated call
    const { data: updatedCall } = await supabaseAdmin
      .from('calls')
      .select('summary, outcome, sentiment, extracted, action_items')
      .eq('id', id)
      .single();

    res.json({
      success: true,
      data: updatedCall,
    });
  } catch (error) {
    logger.error('Error in analyze call endpoint', {}, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Batch Analysis
// ============================================================================

/**
 * POST /voice/calls/analyze-batch
 * Analyze calls that haven't been analyzed yet
 */
router.post('/analyze-batch', async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.body;

    const processed = await analyzeUnprocessedCalls(Math.min(limit, 50));

    res.json({
      success: true,
      processed,
    });
  } catch (error) {
    logger.error('Error in batch analysis endpoint', {}, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
