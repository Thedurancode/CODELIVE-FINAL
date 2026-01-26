import { Request, Response } from 'express';
import {
  GuardrailCheckRequest,
  GuardrailCheckResponse,
  Violation,
  ViolationType,
  ViolationAction,
  AIAgentResponse
} from '../types/ai-agents';

/**
 * AI Guardrail & Compliance Enforcement Agent
 *
 * This controller implements real-time content moderation:
 * - Detects phone numbers and email addresses
 * - Identifies circumvention attempts
 * - Flags unlicensed brokerage language
 * - Detects harassment and inappropriate content
 * - Provides redacted versions of violating messages
 */

// =====================================================
// Pattern Detection Functions
// =====================================================

/**
 * Detect phone number sharing
 */
function detectPhoneNumbers(message: string): Violation[] {
  const violations: Violation[] = [];

  // Phone number patterns
  const phonePatterns = [
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,                    // 123-456-7890
    /\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b/g,                  // (123) 456-7890
    /\b\d{3}\s+\d{3}\s+\d{4}\b/g,                        // 123 456 7890
    /\bcall me at\s+\d/i,                                // call me at 555...
    /\btext me at\s+\d/i,                                // text me at 555...
    /\bmy (phone|number|cell) is\s+\d/i                  // my phone is 555...
  ];

  for (const pattern of phonePatterns) {
    if (pattern.test(message)) {
      violations.push({
        type: 'phone_number_sharing',
        severity: 'high',
        action: 'redact_and_warn',
        matchedPattern: pattern.source,
        context: 'Phone number sharing detected'
      });
      break; // Only report once
    }
  }

  return violations;
}

/**
 * Detect email address sharing
 */
function detectEmailAddresses(message: string): Violation[] {
  const violations: Violation[] = [];

  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

  if (emailPattern.test(message)) {
    violations.push({
      type: 'email_sharing',
      severity: 'high',
      action: 'redact_and_warn',
      matchedPattern: emailPattern.source,
      context: 'Email address sharing detected'
    });
  }

  return violations;
}

/**
 * Detect circumvention attempts
 */
function detectCircumvention(message: string): Violation[] {
  const violations: Violation[] = [];
  const lowerMessage = message.toLowerCase();

  const circumventionPhrases = [
    { phrase: "let's meet directly", severity: 'critical' as const },
    { phrase: "let's talk offline", severity: 'critical' as const },
    { phrase: "call me directly", severity: 'critical' as const },
    { phrase: "skip the platform", severity: 'critical' as const },
    { phrase: "go around", severity: 'critical' as const },
    { phrase: "bypass this system", severity: 'critical' as const },
    { phrase: "deal outside", severity: 'critical' as const },
    { phrase: "contact me outside", severity: 'critical' as const },
    { phrase: "text me directly", severity: 'high' as const },
    { phrase: "reach out to me at", severity: 'high' as const },
    { phrase: "get in touch with me at", severity: 'high' as const }
  ];

  for (const { phrase, severity } of circumventionPhrases) {
    if (lowerMessage.includes(phrase)) {
      violations.push({
        type: 'circumvention_attempt',
        severity,
        action: 'block_and_escalate',
        matchedPattern: phrase,
        context: 'Attempt to circumvent platform communication'
      });
      break; // Only report once
    }
  }

  return violations;
}

/**
 * Detect unlicensed brokerage activity
 */
function detectUnlicensedBrokerage(message: string): Violation[] {
  const violations: Violation[] = [];
  const lowerMessage = message.toLowerCase();

  const brokeragePhrases = [
    { phrase: "i recommend you", severity: 'critical' as const },
    { phrase: "you should offer", severity: 'critical' as const },
    { phrase: "this is a great deal", severity: 'high' as const },
    { phrase: "this is worth", severity: 'high' as const },
    { phrase: "the property is worth", severity: 'critical' as const },
    { phrase: "you should buy this", severity: 'critical' as const },
    { phrase: "i advise you to", severity: 'critical' as const },
    { phrase: "my professional opinion", severity: 'critical' as const },
    { phrase: "as your agent", severity: 'critical' as const },
    { phrase: "i represent you", severity: 'critical' as const }
  ];

  for (const { phrase, severity } of brokeragePhrases) {
    if (lowerMessage.includes(phrase)) {
      violations.push({
        type: 'unlicensed_brokerage',
        severity,
        action: 'block_and_escalate',
        matchedPattern: phrase,
        context: 'Language suggests acting as a licensed broker'
      });
      break;
    }
  }

  return violations;
}

/**
 * Detect harassment and inappropriate content
 */
function detectInappropriateContent(message: string): Violation[] {
  const violations: Violation[] = [];
  const lowerMessage = message.toLowerCase();

  const harassmentPhrases = [
    "you're an idiot",
    "you're stupid",
    "f**k you",
    "screw you",
    "this is a scam",
    "you're a scammer",
    "i'll sue you",
    "i'll report you"
  ];

  for (const phrase of harassmentPhrases) {
    if (lowerMessage.includes(phrase)) {
      violations.push({
        type: 'harassment',
        severity: 'high',
        action: 'block_and_escalate',
        matchedPattern: phrase,
        context: 'Inappropriate or harassing language detected'
      });
      break;
    }
  }

  return violations;
}

/**
 * Detect potential fraud attempts
 */
function detectFraudAttempts(message: string): Violation[] {
  const violations: Violation[] = [];
  const lowerMessage = message.toLowerCase();

  const fraudPhrases = [
    "falsify",
    "fake the",
    "make up the",
    "lie about",
    "don't tell them",
    "hide the fact",
    "forge the"
  ];

  for (const phrase of fraudPhrases) {
    if (lowerMessage.includes(phrase)) {
      violations.push({
        type: 'fraud_attempt',
        severity: 'critical',
        action: 'block_and_escalate',
        matchedPattern: phrase,
        context: 'Potential fraud or misrepresentation detected'
      });
      break;
    }
  }

  return violations;
}

/**
 * Redact sensitive information from message
 */
function redactMessage(message: string, violations: Violation[]): string {
  let redacted = message;

  // Redact phone numbers
  const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
  redacted = redacted.replace(phonePattern, '[PHONE REDACTED]');

  const phonePattern2 = /\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b/g;
  redacted = redacted.replace(phonePattern2, '[PHONE REDACTED]');

  // Redact emails
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  redacted = redacted.replace(emailPattern, '[EMAIL REDACTED]');

  return redacted;
}

/**
 * Generate warning message based on violations
 */
function generateWarningMessage(violations: Violation[]): string {
  const criticalViolations = violations.filter(v => v.severity === 'critical');
  const highViolations = violations.filter(v => v.severity === 'high');

  if (criticalViolations.length > 0) {
    const types = criticalViolations.map(v => v.type).join(', ');
    return `Your message has been blocked due to: ${types}. All communication must go through this platform to ensure compliance and protect both parties.`;
  }

  if (highViolations.length > 0) {
    return 'For compliance and tracking purposes, please refrain from sharing contact information. All communication should go through this platform. Your message has been modified to remove sensitive information.';
  }

  return 'Please keep all communication professional and within platform guidelines.';
}

// =====================================================
// Controller Functions
// =====================================================

/**
 * POST /api/ai/guardrail/check
 * Check message for compliance violations
 */
export const checkMessage = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const requestData: GuardrailCheckRequest = req.body;
    const { message, conversationContext, buyerId, propertyId } = requestData;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    // Run all detection functions
    const violations: Violation[] = [
      ...detectPhoneNumbers(message),
      ...detectEmailAddresses(message),
      ...detectCircumvention(message),
      ...detectUnlicensedBrokerage(message),
      ...detectInappropriateContent(message),
      ...detectFraudAttempts(message)
    ];

    // Determine if message should be allowed
    const hasCritical = violations.some(v => v.severity === 'critical');
    const hasBlockingViolation = violations.some(v =>
      v.action === 'block_and_escalate'
    );

    const allowed = !hasBlockingViolation;
    const escalateToHuman = hasCritical || violations.length > 2;

    // Generate redacted version if needed
    let redactedMessage: string | undefined;
    let warningMessage: string | undefined;

    if (violations.length > 0) {
      redactedMessage = redactMessage(message, violations);
      warningMessage = generateWarningMessage(violations);
    }

    const response: GuardrailCheckResponse = {
      allowed,
      violations,
      redactedMessage,
      warningMessage,
      escalateToHuman
    };

    // TODO: Log to database if violations found
    // if (violations.length > 0) {
    //   await BuyerInteraction.create({
    //     property_id: propertyId,
    //     buyer_id: buyerId,
    //     interaction_type: 'message',
    //     message_content: message,
    //     flagged_for_review: true,
    //     flag_reason: violations.map(v => v.type).join(', ')
    //   });
    // }

    // TODO: Log to audit trail
    // await AIAgentAuditLog.create({
    //   agent_type: 'guardrail',
    //   action: 'check_message',
    //   entity_type: 'conversation',
    //   entity_id: propertyId || 0,
    //   input_data: { message, buyerId, propertyId },
    //   output_data: { allowed, violationCount: violations.length },
    //   success: true,
    //   execution_time_ms: Date.now() - startTime
    // });

    const apiResponse: AIAgentResponse<GuardrailCheckResponse> = {
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    };

    res.json(apiResponse);

  } catch (error) {
    console.error('Error in guardrail check:', error);

    const apiResponse: AIAgentResponse<GuardrailCheckResponse> = {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    };

    res.status(500).json(apiResponse);
  }
};

/**
 * GET /api/ai/guardrail/flagged
 * Get all flagged messages for review
 */
export const getFlaggedMessages = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // TODO: Query from database
    // const flagged = await BuyerInteraction.findAll({
    //   where: { flagged_for_review: true },
    //   order: [['created_at', 'DESC']],
    //   limit: 100
    // });

    const mockFlagged = [
      {
        id: 1,
        property_id: 1,
        buyer_id: 1,
        message_content: 'Call me at 555-1234',
        flag_reason: 'phone_number_sharing',
        created_at: new Date()
      }
    ];

    res.json({
      success: true,
      data: mockFlagged,
      count: mockFlagged.length,
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error fetching flagged messages:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });
  }
};
