/**
 * Webhook Routes
 *
 * Handles incoming webhooks from external services.
 * Currently supports:
 * - DocuSeal (e-signature events)
 * - Generic webhooks (with API key authentication)
 *
 * SECURITY:
 * - DocuSeal webhooks: Should be verified via signature (configured in DocuSeal)
 * - Generic webhooks: Require API key in header
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { docuSealService, WebhookPayload } from '../services/DocuSealService';
import { automationEngine } from '../plugins/automation/AutomationEngine';
import { pipelineService } from '../services/PipelineService';
import DocuSealSubmission from '../models/DocuSealSubmission';
import { phaseContractService } from '../services/PhaseContractService';
import { signedDocumentService } from '../services/SignedDocumentService';
import { activityFeedService } from '../services/ActivityFeedService';
import sequelize from '../config/database';

const router = Router();

// =============================================================================
// HELPER FUNCTIONS FOR PHASE COMPLETION
// =============================================================================

/**
 * Get phase number from a DocuSeal submission based on document type
 */
async function getPhaseFromSubmission(submission: DocuSealSubmission): Promise<number | null> {
  const docType = submission.documentCategory?.toLowerCase();

  // Map document types to phases (7-Phase Oklahoma Structure)
  // Phase 0: Account Setup & Entity Verification
  // Phase 1: Property Submission
  // Phase 2: Compliance Review & Approval
  // Phase 3: Approved / Pre-Distribution
  // Phase 4: Offer Accepted / Pre-Buyer Seller Acknowledgment (3-day hold)
  // Phase 5: Buyer Contract Execution
  // Phase 6: Title, Closing & Settlement
  const typeToPhase: Record<string, number> = {
    csa: 0,
    purchase_contract: 1,
    wholesaler_disclosure: 1,
    equity_disclosure: 1,
    seller_disclosure: 1,
    msa: 3,
    asa: 3,
    seller_acknowledgment: 4,
    cancellation_disclosure: 4,
    assignment_addendum: 5,
    double_close_psa: 5,
    closing_disclosure: 6,
    settlement_statement: 6,
    wiring_instructions: 6,
    hubzu_addendum: 6,
  };

  if (docType && typeToPhase[docType] !== undefined) {
    return typeToPhase[docType];
  }

  // Try to get from metadata if stored
  try {
    const metadata = submission.metadata as any;
    if (metadata?.phase !== undefined) {
      return parseInt(metadata.phase);
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Get the state for a deal from compliance record
 */
async function getDealState(dealId: number): Promise<string | null> {
  try {
    const [results] = await sequelize.query(
      `SELECT state FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1`,
      { replacements: { dealId } }
    );
    const record = (results as any[])?.[0];
    return record?.state || null;
  } catch {
    return null;
  }
}

/**
 * Auto-complete a phase when all contracts are signed
 */
async function autoCompletePhase(dealId: number, state: string, phase: number): Promise<void> {
  try {
    // Get current workflow
    const [workflowResults] = await sequelize.query(
      `SELECT * FROM state_workflow_state WHERE deal_id = :dealId AND state = :state LIMIT 1`,
      { replacements: { dealId, state: state.toUpperCase() } }
    );
    const workflow = (workflowResults as any[])?.[0];

    if (!workflow) {
      console.warn(`No workflow found for deal ${dealId} state ${state}`);
      return;
    }

    // Check if phase is already complete
    const phaseCompletions = workflow.phase_completions || {};
    if (phaseCompletions[phase] === true) {
      console.log(`Phase ${phase} already complete for deal ${dealId}`);
      return;
    }

    // Mark phase as complete
    phaseCompletions[phase] = true;

    // Calculate next phase
    let nextPhase = workflow.current_phase;
    if (phase === workflow.current_phase) {
      nextPhase = phase + 1;
    }

    // Update workflow
    await sequelize.query(
      `UPDATE state_workflow_state
       SET phase_completions = :completions,
           current_phase = :nextPhase,
           updated_at = NOW()
       WHERE deal_id = :dealId AND state = :state`,
      {
        replacements: {
          dealId,
          state: state.toUpperCase(),
          completions: JSON.stringify(phaseCompletions),
          nextPhase,
        },
      }
    );

    console.log(`✅ Auto-completed phase ${phase} for deal ${dealId}, advancing to phase ${nextPhase}`);

    // OKLAHOMA: Start 3-day statutory hold when Phase 4 completes
    // This is a required waiting period before buyer contracts can be executed (Phase 5)
    if (state.toUpperCase() === 'OK' && phase === 4) {
      try {
        const holdExpiresAt = new Date();
        holdExpiresAt.setDate(holdExpiresAt.getDate() + 3);
        await sequelize.query(
          `UPDATE oklahoma_workflow_state
           SET seller_acknowledgment_date = NOW(),
               statutory_hold_expires_at = :holdExpiresAt,
               updated_at = NOW()
           WHERE deal_id = :dealId`,
          { replacements: { dealId, holdExpiresAt: holdExpiresAt.toISOString() } }
        );
        console.log(`⏱️ Oklahoma 3-day statutory hold started for deal ${dealId}, expires at ${holdExpiresAt.toISOString()}`);
      } catch (holdErr) {
        console.warn('Could not start statutory hold:', holdErr);
      }
    }

    // Log to audit trail
    await sequelize.query(
      `INSERT INTO compliance_audit_log
       (property_id, action_type, action_details, created_at)
       VALUES (:dealId, 'phase.auto_completed', :details, NOW())`,
      {
        replacements: {
          dealId,
          details: JSON.stringify({
            phase,
            state,
            reason: 'all_contracts_signed',
            newPhase: nextPhase,
          }),
        },
      }
    );
  } catch (error) {
    console.error('Error auto-completing phase:', error);
  }
}

// =============================================================================
// WEBHOOK SECURITY UTILITIES
// =============================================================================

/**
 * Verify HMAC signature for webhook payloads
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: string = 'sha256'
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest('hex');

    // Handle both raw signature and prefixed (e.g., "sha256=...")
    const cleanSignature = signature.includes('=')
      ? signature.split('=')[1]
      : signature;

    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Middleware to verify API key for webhook endpoints
 */
function requireApiKey(req: Request, res: Response, next: Function): void {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedKey = process.env.WEBHOOK_API_KEY;

  // If no API key is configured, reject all requests in production
  if (!expectedKey) {
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({
        success: false,
        error: 'Webhook endpoint not configured. Set WEBHOOK_API_KEY environment variable.',
      });
      return;
    }
    // In development, warn but allow
    console.warn('⚠️  WEBHOOK_API_KEY not set - webhooks are unprotected');
    next();
    return;
  }

  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: 'Missing API key. Provide X-Api-Key header.',
    });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))) {
    res.status(401).json({
      success: false,
      error: 'Invalid API key',
    });
    return;
  }

  next();
}

/**
 * Optional signature verification middleware
 */
function verifySignatureIfConfigured(req: Request, res: Response, next: Function): void {
  const secret = process.env.WEBHOOK_SIGNATURE_SECRET;

  // If no secret configured, skip signature verification
  if (!secret) {
    next();
    return;
  }

  const signature = req.headers['x-webhook-signature'] as string;
  if (!signature) {
    res.status(401).json({
      success: false,
      error: 'Missing webhook signature. Provide X-Webhook-Signature header.',
    });
    return;
  }

  const payload = JSON.stringify(req.body);
  if (!verifyWebhookSignature(payload, signature, secret)) {
    res.status(401).json({
      success: false,
      error: 'Invalid webhook signature',
    });
    return;
  }

  next();
}

// Rate limiter for webhooks (prevent abuse)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { success: false, error: 'Too many webhook requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Incoming webhook endpoints for external services
 */

// =============================================================================
// DOCUSEAL WEBHOOKS
// =============================================================================

/**
 * @swagger
 * /api/webhooks/docuseal:
 *   post:
 *     summary: DocuSeal webhook receiver
 *     description: Receives events from DocuSeal (form.completed, form.declined, etc.)
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_type:
 *                 type: string
 *                 enum: [form.viewed, form.started, form.completed, form.declined, submission.created, submission.completed, submission.expired]
 *               timestamp:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload
 */
/**
 * Middleware to verify DocuSeal webhook signature
 */
function verifyDocuSealSignature(req: Request, res: Response, next: Function): void {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;

  // If no secret configured, reject in production
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('DOCUSEAL_WEBHOOK_SECRET not configured - rejecting webhook');
      res.status(503).json({
        success: false,
        error: 'DocuSeal webhook not configured. Set DOCUSEAL_WEBHOOK_SECRET environment variable.',
      });
      return;
    }
    // In development, warn but allow
    console.warn('⚠️  DOCUSEAL_WEBHOOK_SECRET not set - DocuSeal webhooks are unprotected');
    next();
    return;
  }

  const signature = req.headers['x-docuseal-signature'] as string;
  if (!signature) {
    res.status(401).json({
      success: false,
      error: 'Missing DocuSeal signature. Configure webhook signing in DocuSeal.',
    });
    return;
  }

  const payload = JSON.stringify(req.body);
  if (!verifyWebhookSignature(payload, signature, secret)) {
    res.status(401).json({
      success: false,
      error: 'Invalid DocuSeal webhook signature',
    });
    return;
  }

  next();
}

router.post('/docuseal', verifyDocuSealSignature, async (req: Request, res: Response) => {
  try {
    // Parse webhook payload
    const payload: WebhookPayload = docuSealService.parseWebhook(req.body);

    console.log(`📨 DocuSeal webhook received: ${payload.event_type}`);

    // Extract deal and pipeline IDs from metadata
    const dealId = docuSealService.getDealIdFromWebhook(payload);
    const pipelineId = docuSealService.getPipelineIdFromWebhook(payload);

    // Get submission ID from payload
    const submissionId = payload.data.submission_id || payload.data.id;

    // Update local DocuSealSubmission record if exists
    let localSubmission: DocuSealSubmission | null = null;
    if (submissionId) {
      try {
        localSubmission = await DocuSealSubmission.findByDocuSealId(submissionId);
        if (localSubmission) {
          // Update based on event type
          const signerEmail = payload.data.email;

          switch (payload.event_type) {
            case 'form.viewed':
              if (!localSubmission.firstViewedAt) {
                localSubmission.firstViewedAt = new Date();
              }
              // Update submitter status
              const viewedSubmitter = localSubmission.submitters.find(s => s.email === signerEmail);
              if (viewedSubmitter && viewedSubmitter.status !== 'completed') {
                viewedSubmitter.status = 'opened';
                viewedSubmitter.openedAt = new Date().toISOString();
              }
              localSubmission.status = localSubmission.calculateStatus();
              break;

            case 'form.completed':
              const completedSubmitter = localSubmission.submitters.find(s => s.email === signerEmail);
              if (completedSubmitter) {
                completedSubmitter.status = 'completed';
                completedSubmitter.completedAt = new Date().toISOString();
              }
              localSubmission.status = localSubmission.calculateStatus();
              break;

            case 'submission.completed':
              localSubmission.status = 'completed';
              localSubmission.completedAt = new Date();
              localSubmission.nextReminderAt = undefined; // Stop reminders
              // Update all submitters to completed
              localSubmission.submitters.forEach(s => {
                if (s.status !== 'completed') {
                  s.status = 'completed';
                  s.completedAt = new Date().toISOString();
                }
              });
              break;

            case 'form.declined':
              await localSubmission.recordDecline(signerEmail || 'unknown', payload.data.decline_reason);
              break;

            case 'submission.expired':
              localSubmission.status = 'expired';
              localSubmission.nextReminderAt = undefined;
              break;
          }

          await localSubmission.save();
          console.log(`   Updated local submission ${localSubmission.id} to status: ${localSubmission.status}`);
        }
      } catch (updateError) {
        console.warn('Could not update local submission:', updateError);
      }
    }

    // Emit event to automation engine
    await automationEngine.emitEvent({
      id: `docuseal-${Date.now()}`,
      type: `docuseal.${payload.event_type}` as any,
      timestamp: new Date(payload.timestamp),
      payload: {
        ...payload.data,
        dealId,
        pipelineId,
        localSubmissionId: localSubmission?.id,
      },
      metadata: {
        sourceId: 'docuseal',
      } as any,
    });

    // Handle specific events with built-in logic
    switch (payload.event_type) {
      case 'form.completed':
        // Signer completed their portion
        console.log(`✅ Signer completed: ${payload.data.email}`);

        // If we have a pipeline ID, consider updating the stage
        if (pipelineId) {
          try {
            // Check if all signers are done (submission.completed will handle full completion)
            console.log(`📋 Form signed for pipeline ${pipelineId}`);
          } catch (err) {
            console.warn('Could not update pipeline:', err);
          }
        }
        break;

      case 'submission.completed':
        // All parties have signed
        console.log(`🎉 All signatures collected for submission ${payload.data.id}`);

        // Log activity feed event for contract signed
        activityFeedService.logActivity({
          eventType: 'contract_signed',
          entityType: 'document',
          entityId: String(payload.data.id),
          entityName: localSubmission?.templateName || `Contract ${payload.data.id}`,
          actor: {
            id: 'docuseal',
            name: 'DocuSeal',
            type: 'system',
          },
          metadata: {
            submissionId: payload.data.id,
            dealId,
            pipelineId,
            documentType: localSubmission?.documentCategory,
            signers: localSubmission?.submitters?.map(s => s.email) || [],
          },
        }).catch(err => console.warn('Activity logging failed:', err.message));

        // Download the signed document, store it, run OCR extraction, and update compliance
        try {
          const downloadResult = await signedDocumentService.downloadAndProcessSignedDocument(
            payload.data.id,
            { runOCR: true, updateCompliance: true }
          );

          if (downloadResult.success) {
            console.log(`✅ Signed document processed: ID ${downloadResult.propertyDocumentId}`);
            if (downloadResult.extractedData) {
              console.log(`📄 Extracted ${Object.keys(downloadResult.extractedData).length} fields from signed document`);
              console.log(`📊 OCR confidence: ${downloadResult.ocrConfidence}%`);
            }
            if (downloadResult.localFilePath) {
              console.log(`💾 Document saved to: ${downloadResult.localFilePath}`);
            }
          } else {
            console.warn(`⚠️ Could not process signed document: ${downloadResult.error}`);
          }
        } catch (downloadErr) {
          console.warn('Could not download/process signed document:', downloadErr);
        }

        // Move pipeline to under_contract if we have the ID
        if (pipelineId) {
          try {
            await pipelineService.updateStage(pipelineId, 'under_contract', {
              notes: `Contract signed via DocuSeal (submission ${payload.data.id})`,
              triggeredBy: 'automation',
            });
            console.log(`📈 Pipeline ${pipelineId} moved to under_contract`);
          } catch (err) {
            console.warn('Could not update pipeline stage:', err);
          }
        }

        // Smart: Check if all phase contracts are now signed and auto-complete phase
        if (dealId && localSubmission) {
          try {
            const dealIdNum = parseInt(dealId, 10);
            if (!isNaN(dealIdNum)) {
              // Get the phase from submission metadata or document type
              const phase = await getPhaseFromSubmission(localSubmission);
              if (phase !== null) {
                const state = await getDealState(dealIdNum);
                if (state) {
                  const allSigned = await phaseContractService.arePhaseContractsSigned(
                    dealIdNum,
                    state,
                    phase
                  );

                  if (allSigned) {
                    console.log(`✅ All phase ${phase} contracts signed for deal ${dealId} - triggering phase completion`);

                    // Emit phase contracts signed event
                    await automationEngine.emitEvent({
                      id: `phase-contracts-signed-${dealId}-${phase}-${Date.now()}`,
                      type: 'compliance.phase_contracts_signed' as any,
                      timestamp: new Date(),
                      payload: {
                        dealId: dealIdNum,
                        state,
                        phase,
                        submissionId: payload.data.id,
                      },
                      metadata: {
                        sourceId: 'docuseal-webhook',
                      } as any,
                    });

                    // Auto-complete the phase in workflow
                    await autoCompletePhase(dealIdNum, state, phase);
                  }
                }
              }
            }
          } catch (phaseErr) {
            console.warn('Could not check/complete phase:', phaseErr);
          }
        }
        break;

      case 'form.declined':
        // Signer declined
        console.log(`❌ Signer declined: ${payload.data.email}`);

        // Optionally update pipeline
        if (pipelineId) {
          try {
            await pipelineService.updateStage(pipelineId, 'closed_lost', {
              notes: `Contract declined by ${payload.data.email}`,
              triggeredBy: 'automation',
            });
            console.log(`📉 Pipeline ${pipelineId} marked as closed_lost`);
          } catch (err) {
            console.warn('Could not update pipeline stage:', err);
          }
        }
        break;

      case 'form.viewed':
        console.log(`👀 Document viewed by ${payload.data.email}`);
        break;

      case 'form.started':
        console.log(`✏️ Signing started by ${payload.data.email}`);
        break;

      case 'submission.expired':
        console.log(`⏰ Submission expired: ${payload.data.id}`);

        // Queue expired contract to dead letter for potential retry
        if (dealId && localSubmission) {
          try {
            await sequelize.query(
              `INSERT INTO dead_letter_queue
               (entity_type, entity_id, action_type, payload, error_message, retry_count, created_at, updated_at)
               VALUES ('contract', :dealId, 'contract_expired', :payload, :error, 0, NOW(), NOW())`,
              {
                replacements: {
                  dealId,
                  payload: JSON.stringify({
                    submissionId: payload.data.id,
                    documentType: localSubmission.documentCategory,
                    templateId: localSubmission.templateId,
                    phase: await getPhaseFromSubmission(localSubmission),
                  }),
                  error: 'Contract expired without all signatures',
                },
              }
            );
            console.log(`📋 Queued expired contract to dead letter for deal ${dealId}`);

            // Emit expiration event for automations
            await automationEngine.emitEvent({
              id: `contract-expired-${dealId}-${Date.now()}`,
              type: 'compliance.contract_expired' as any,
              timestamp: new Date(),
              payload: {
                dealId,
                submissionId: payload.data.id,
                documentType: localSubmission.documentCategory,
              },
              metadata: {
                sourceId: 'docuseal-webhook',
              } as any,
            });
          } catch (expErr) {
            console.warn('Could not queue expired contract:', expErr);
          }
        }
        break;

      default:
        console.log(`📌 Unhandled DocuSeal event: ${payload.event_type}`);
    }

    res.json({
      success: true,
      message: `Webhook processed: ${payload.event_type}`,
      localSubmissionId: localSubmission?.id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('DocuSeal webhook error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/webhooks/docuseal/test:
 *   post:
 *     summary: Test DocuSeal webhook
 *     description: Simulate a DocuSeal webhook event for testing
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_type:
 *                 type: string
 *               dealId:
 *                 type: string
 *               pipelineId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test event processed
 */
router.post('/docuseal/test', requireApiKey, async (req: Request, res: Response) => {
  // Also restrict to non-production environments for safety
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Test endpoint is disabled in production',
    });
  }

  try {
    const { event_type = 'form.completed', dealId, pipelineId, email = 'test@example.com' } = req.body;

    const testPayload = {
      event_type,
      timestamp: new Date().toISOString(),
      data: {
        id: 12345,
        submission_id: 67890,
        email,
        status: event_type === 'form.completed' ? 'completed' : 'pending',
        metadata: {
          dealId,
          pipelineId,
        },
      },
    };

    // Send to the actual webhook handler
    const payload: WebhookPayload = docuSealService.parseWebhook(testPayload);

    await automationEngine.emitEvent({
      id: `docuseal-test-${Date.now()}`,
      type: `docuseal.${payload.event_type}` as any,
      timestamp: new Date(),
      payload: {
        ...payload.data,
        dealId,
        pipelineId,
        isTest: true,
      },
      metadata: {
        sourceId: 'docuseal',
      } as any,
    });

    res.json({
      success: true,
      message: `Test webhook sent: ${event_type}`,
      payload: testPayload,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// GENERIC WEBHOOK RECEIVER
// =============================================================================

/**
 * @swagger
 * /api/webhooks/generic:
 *   post:
 *     summary: Generic webhook receiver
 *     description: |
 *       Receives webhooks from any source and emits as automation events.
 *
 *       **Security:**
 *       - Requires X-Api-Key header with valid API key
 *       - Optionally verifies X-Webhook-Signature if WEBHOOK_SIGNATURE_SECRET is set
 *       - Rate limited to 100 requests/minute
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Api-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: API key for authentication
 *       - in: header
 *         name: X-Webhook-Signature
 *         schema:
 *           type: string
 *         description: HMAC signature (required if WEBHOOK_SIGNATURE_SECRET is configured)
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *         description: Source identifier (e.g., 'zapier', 'make', 'custom')
 *       - in: query
 *         name: event
 *         schema:
 *           type: string
 *         description: Event type to emit
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed
 *       401:
 *         description: Invalid or missing API key
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/generic',
  webhookLimiter,
  requireApiKey,
  verifySignatureIfConfigured,
  async (req: Request, res: Response) => {
    try {
      const source = (req.query.source as string) || 'generic';
      const eventType = (req.query.event as string) || 'webhook.received';

      // Validate event type (prevent injection of arbitrary events)
      const allowedEventPrefixes = ['webhook.', 'deal.', 'custom.'];
      const isAllowedEvent = allowedEventPrefixes.some(prefix => eventType.startsWith(prefix));

      if (!isAllowedEvent) {
        return res.status(400).json({
          success: false,
          error: `Invalid event type. Must start with: ${allowedEventPrefixes.join(', ')}`,
        });
      }

      console.log(`📨 Generic webhook received from ${source}: ${eventType}`);

      await automationEngine.emitEvent({
        id: `webhook-${Date.now()}`,
        type: eventType as any,
        timestamp: new Date(),
        payload: req.body,
        metadata: {
          sourceId: source,
          // Don't expose all headers - only safe ones
          clientIp: req.ip,
          userAgent: req.headers['user-agent'],
        } as any,
      });

      res.json({
        success: true,
        message: `Webhook processed: ${eventType}`,
        source,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Generic webhook error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

export default router;
