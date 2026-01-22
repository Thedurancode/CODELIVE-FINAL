/**
 * Post-Call Analysis Module
 *
 * Analyzes call transcripts and generates summaries, outcomes, and extracted data.
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../services/LoggerService';
import {
  CallRecord,
  CallEventRecord,
  CallAnalysisResult,
  CallOutcome,
  ExtractedCallData,
} from './types';

// ============================================================================
// OpenAI Client
// ============================================================================

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

// ============================================================================
// Transcript Builder
// ============================================================================

/**
 * Build a formatted transcript from call events
 */
export async function buildTranscript(callId: string): Promise<string> {
  try {
    const { data: events, error } = await supabaseAdmin
      .from('call_events')
      .select('*')
      .eq('call_id', callId)
      .eq('type', 'transcript')
      .order('ts', { ascending: true });

    if (error) {
      logger.error('Error fetching call events for transcript', { callId }, error);
      return '';
    }

    if (!events || events.length === 0) {
      return '';
    }

    const transcriptLines = events.map((event: CallEventRecord) => {
      const speaker = event.speaker === 'user' ? 'Caller' : 'Agent';
      const text = (event.payload as any)?.text || (event.payload as any)?.transcript || '';
      return `${speaker}: ${text}`;
    });

    return transcriptLines.join('\n');
  } catch (error) {
    logger.error('Error building transcript', { callId }, error);
    return '';
  }
}

// ============================================================================
// Analysis Prompt
// ============================================================================

const ANALYSIS_SYSTEM_PROMPT = `You are an expert call analyst. Analyze the following phone call transcript and provide a structured analysis.

Your response MUST be valid JSON with this exact structure:
{
  "summary": "A 2-3 sentence summary of the call",
  "outcome": "one of: no_answer, left_voicemail, follow_up, hot_lead, not_interested, wrong_number, resolved, escalate",
  "sentiment": 0.5,
  "extracted": {
    "name": "caller's name if mentioned",
    "intent": "what the caller wanted",
    "next_step": "agreed next action if any",
    "callback_time": "requested callback time if any",
    "objections": ["list of objections raised"],
    "budget": "budget mentioned if any",
    "email": "email if provided",
    "additional_contacts": ["other contacts mentioned"]
  },
  "action_items": ["list of action items from the call"]
}

Rules:
1. Be objective and factual
2. Only include fields that are actually mentioned or clearly implied
3. sentiment should be 0.0 (very negative) to 1.0 (very positive), with 0.5 being neutral
4. outcome should reflect the actual result of the call
5. For unanswered calls or voicemails, use "no_answer" or "left_voicemail"
6. action_items should be specific and actionable`;

// ============================================================================
// Analysis Function
// ============================================================================

/**
 * Analyze a completed call and generate insights
 */
export async function analyzeCall(callId: string): Promise<CallAnalysisResult | null> {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      logger.warn('OpenAI not configured, skipping call analysis');
      return null;
    }

    // Get call record
    const { data: callData, error: callError } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (callError || !callData) {
      logger.error('Call not found for analysis', { callId }, callError);
      return null;
    }

    const call = callData as CallRecord;

    // Build transcript
    const transcript = await buildTranscript(callId);

    // If no transcript, generate minimal analysis
    if (!transcript || transcript.trim().length === 0) {
      logger.info('No transcript available for analysis', { callId });

      // Determine outcome based on call status
      let outcome: CallOutcome = 'no_answer';
      if (call.status === 'completed' && call.duration_sec && call.duration_sec > 30) {
        outcome = 'resolved';
      } else if (call.status === 'busy') {
        outcome = 'no_answer';
      } else if (call.status === 'no-answer') {
        outcome = 'no_answer';
      }

      return {
        summary: `Call ${call.direction} to ${call.to_number} - ${call.status}. Duration: ${call.duration_sec || 0} seconds.`,
        outcome,
        sentiment: 0.5,
        extracted: {},
        action_items: [],
      };
    }

    // Call OpenAI for analysis
    logger.info('Analyzing call with OpenAI', { callId, transcriptLength: transcript.length });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Analyze this call transcript:\n\n${transcript}`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      logger.error('No response from OpenAI analysis', { callId });
      return null;
    }

    // Parse the response
    const analysis = JSON.parse(content) as CallAnalysisResult;

    // Validate and sanitize the response
    const validOutcomes: CallOutcome[] = [
      'no_answer',
      'left_voicemail',
      'follow_up',
      'hot_lead',
      'not_interested',
      'wrong_number',
      'resolved',
      'escalate',
    ];

    if (!validOutcomes.includes(analysis.outcome)) {
      analysis.outcome = 'resolved';
    }

    if (typeof analysis.sentiment !== 'number' || analysis.sentiment < 0 || analysis.sentiment > 1) {
      analysis.sentiment = 0.5;
    }

    if (!Array.isArray(analysis.action_items)) {
      analysis.action_items = [];
    }

    if (!analysis.extracted || typeof analysis.extracted !== 'object') {
      analysis.extracted = {};
    }

    logger.info('Call analysis complete', {
      callId,
      outcome: analysis.outcome,
      sentiment: analysis.sentiment,
    });

    return analysis;
  } catch (error) {
    logger.error('Error analyzing call', { callId }, error);
    return null;
  }
}

// ============================================================================
// Save Analysis Results
// ============================================================================

/**
 * Save analysis results to the calls table
 */
export async function saveAnalysisResults(
  callId: string,
  analysis: CallAnalysisResult
): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('calls')
      .update({
        summary: analysis.summary,
        outcome: analysis.outcome,
        sentiment: analysis.sentiment,
        extracted: analysis.extracted,
        action_items: analysis.action_items,
        updated_at: new Date().toISOString(),
      })
      .eq('id', callId);

    if (error) {
      logger.error('Error saving analysis results', { callId }, error);
      return false;
    }

    logger.info('Analysis results saved', { callId });
    return true;
  } catch (error) {
    logger.error('Error saving analysis results', { callId }, error);
    return false;
  }
}

// ============================================================================
// Full Analysis Pipeline
// ============================================================================

/**
 * Run the complete post-call analysis pipeline
 */
export async function runPostCallAnalysis(callId: string): Promise<void> {
  try {
    logger.info('Starting post-call analysis', { callId });

    // Analyze the call
    const analysis = await analyzeCall(callId);

    if (!analysis) {
      logger.warn('No analysis generated for call', { callId });
      return;
    }

    // Save results
    const saved = await saveAnalysisResults(callId, analysis);

    if (saved) {
      logger.info('Post-call analysis complete', {
        callId,
        outcome: analysis.outcome,
      });

      // Log to call_events
      await supabaseAdmin.from('call_events').insert({
        call_id: callId,
        type: 'state',
        speaker: 'system',
        payload: {
          event: 'analysis_complete',
          outcome: analysis.outcome,
          sentiment: analysis.sentiment,
        },
      });
    }
  } catch (error) {
    logger.error('Error in post-call analysis pipeline', { callId }, error);
  }
}

// ============================================================================
// Batch Analysis (for backfill)
// ============================================================================

/**
 * Analyze calls that don't have analysis yet
 */
export async function analyzeUnprocessedCalls(limit: number = 10): Promise<number> {
  try {
    const { data: calls, error } = await supabaseAdmin
      .from('calls')
      .select('id')
      .eq('status', 'completed')
      .is('summary', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching unprocessed calls', {}, error);
      return 0;
    }

    if (!calls || calls.length === 0) {
      return 0;
    }

    logger.info('Processing unanalyzed calls', { count: calls.length });

    let processed = 0;
    for (const call of calls) {
      await runPostCallAnalysis(call.id);
      processed++;
      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return processed;
  } catch (error) {
    logger.error('Error in batch analysis', {}, error);
    return 0;
  }
}
