/**
 * Contract Controller
 *
 * REST API endpoints for managing DocuSeal contract submissions.
 * Provides full CRUD operations, analytics, and reminder management.
 */

import { Request, Response } from 'express';
import DocuSealSubmission, { SubmitterRecord, SubmissionStatus } from '../models/DocuSealSubmission';
import Property from '../models/Property';
import Contact from '../models/Contact';
import StateDocumentTemplate from '../models/StateDocumentTemplate';
import { docuSealService } from '../services/DocuSealService';
import { contractReminderScheduler } from '../services/ContractReminderScheduler';
import { signatureService } from '../services/SignatureService';
import { buildPropertyFields } from '../utils/documentFields';
import { activityFeedService } from '../services/ActivityFeedService';
import { Op } from 'sequelize';

// ============================================================================
// SUBMISSION CRUD OPERATIONS
// ============================================================================

/**
 * @swagger
 * /api/contracts:
 *   get:
 *     summary: List all contract submissions
 *     tags: [Contracts]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, viewed, partially_signed, completed, declined, expired, archived]
 *       - in: query
 *         name: propertyId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of submissions
 */
export async function listSubmissions(req: Request, res: Response) {
  try {
    const {
      status,
      propertyId,
      pipelineId,
      state,
      templateId,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = req.query;

    const where: any = {};

    if (status) {
      where.status = Array.isArray(status) ? status : status;
    }
    if (propertyId) where.propertyId = Number(propertyId);
    if (pipelineId) where.pipelineId = Number(pipelineId);
    if (state) where.state = String(state).toUpperCase();
    if (templateId) where.templateId = Number(templateId);
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate as string);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate as string);
    }

    const { rows: submissions, count: total } = await DocuSealSubmission.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(Number(limit), 100),
      offset: Number(offset),
    });

    res.json({
      success: true,
      data: submissions,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + submissions.length < total,
      },
    });
  } catch (error) {
    console.error('Error listing contract submissions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list submissions',
    });
  }
}

/**
 * @swagger
 * /api/contracts/{id}:
 *   get:
 *     summary: Get a specific submission
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Local submission ID or DocuSeal submission ID (prefix with 'ds:')
 *     responses:
 *       200:
 *         description: Submission details
 */
export async function getSubmission(req: Request, res: Response) {
  try {
    const { id } = req.params;

    let submission: DocuSealSubmission | null;

    // Allow lookup by DocuSeal ID with 'ds:' prefix
    if (String(id).startsWith('ds:')) {
      const docuSealId = parseInt(id.substring(3), 10);
      submission = await DocuSealSubmission.findByDocuSealId(docuSealId);
    } else {
      submission = await DocuSealSubmission.findByPk(Number(id));
    }

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }

    res.json({
      success: true,
      data: submission,
    });
  } catch (error) {
    console.error('Error getting contract submission:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get submission',
    });
  }
}

/**
 * @swagger
 * /api/contracts:
 *   post:
 *     summary: Create a new contract submission
 *     tags: [Contracts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateId
 *               - propertyId
 *             properties:
 *               templateId:
 *                 type: integer
 *                 description: StateDocumentTemplate ID (not DocuSeal template ID)
 *               propertyId:
 *                 type: integer
 *               signers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *               expireInDays:
 *                 type: integer
 *                 default: 7
 *               sendEmail:
 *                 type: boolean
 *                 default: true
 *               additionalFields:
 *                 type: object
 *     responses:
 *       201:
 *         description: Submission created
 */
export async function createSubmission(req: Request, res: Response) {
  try {
    const {
      templateId,
      propertyId,
      pipelineId,
      signers,
      expireInDays = 7,
      sendEmail = true,
      additionalFields,
    } = req.body;

    if (!templateId || !propertyId) {
      return res.status(400).json({
        success: false,
        error: 'templateId and propertyId are required',
      });
    }

    // Get template mapping
    const template = await StateDocumentTemplate.findByPk(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Get property data
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    // Build fields from property
    const fields = buildPropertyFields(property, template.fieldMappings, additionalFields);

    // Helper function to get signature base64 for a signer by email
    const getSignatureForSigner = async (email: string): Promise<string | null> => {
      try {
        // Look up contact by email
        const contact = await Contact.findOne({
          where: { email: { [Op.iLike]: email } },
        });

        if (!contact || !contact.signatureStorageKey) {
          return null;
        }

        // Get the signature as base64
        const { base64, error } = await signatureService.getSignatureBase64(contact.id);
        if (error || !base64) {
          console.log(`[Contract] No signature found for ${email}: ${error || 'No base64'}`);
          return null;
        }

        console.log(`[Contract] Found signature for ${email}, will prefill`);
        return base64;
      } catch (err) {
        console.warn(`[Contract] Error getting signature for ${email}:`, err);
        return null;
      }
    };

    // Determine signers
    const sellerEmail = signers?.[0]?.email || property.llcOwnerEmail || '';
    const sellerName = signers?.[0]?.name || property.wholesalerLlcName || 'Seller';

    if (!sellerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Seller email is required. Provide in signers array or ensure property has llcOwnerEmail.',
      });
    }

    const expireAt = new Date(Date.now() + expireInDays * 24 * 60 * 60 * 1000);

    // Build primary signer (seller) fields with signature prefill
    const primarySignerFields = Object.entries(fields).map(([name, value]) => ({
      name,
      default_value: String(value ?? ''),
    }));

    // Get signature for primary signer if available
    const primarySignature = await getSignatureForSigner(sellerEmail);
    if (primarySignature) {
      // Add signature to fields - DocuSeal uses 'Signature' as the default field name
      primarySignerFields.push({
        name: 'Signature',
        default_value: primarySignature,
      });
    }

    // Build additional signers with their signatures
    const additionalSubmitters = await Promise.all(
      (signers?.slice(1) || []).map(async (s: any) => {
        const signerFields: { name: string; default_value: string }[] = [];

        // Get signature for this signer
        const signature = await getSignatureForSigner(s.email);
        if (signature) {
          signerFields.push({
            name: 'Signature',
            default_value: signature,
          });
        }

        return {
          email: s.email,
          name: s.name,
          role: s.role || 'Signer',
          send_email: sendEmail,
          ...(signerFields.length > 0 ? { fields: signerFields } : {}),
        };
      })
    );

    // Create DocuSeal submission
    const docuSealSubmission = await docuSealService.createSubmission({
      templateId: template.docuSealTemplateId,
      submitters: [
        {
          email: sellerEmail,
          name: sellerName,
          role: signers?.[0]?.role || 'Seller',
          send_email: sendEmail,
          fields: primarySignerFields,
        },
        ...additionalSubmitters,
      ],
      sendEmail,
      expireAt,
      metadata: {
        propertyId: property.id,
        pipelineId,
        templateId: template.id,
        state: property.state,
        category: template.category,
        signaturesPrefilled: [
          primarySignature ? sellerEmail : null,
          ...additionalSubmitters
            .filter((s: any) => s.fields?.some((f: any) => f.name === 'Signature'))
            .map((s: any) => s.email),
        ].filter(Boolean),
      },
    });

    // Create local submission record
    const submitters: SubmitterRecord[] = docuSealSubmission.submitters.map(s => ({
      id: s.id,
      email: s.email,
      name: s.name,
      role: s.role,
      status: 'sent',
      sentAt: new Date().toISOString(),
      embedUrl: s.embed_src,
    }));

    // Calculate next reminder time (default: 24 hours or half of time to expiry)
    const timeToExpiry = expireAt.getTime() - Date.now();
    const nextReminderIn = Math.min(24 * 60 * 60 * 1000, timeToExpiry / 2);
    const nextReminderAt = new Date(Date.now() + nextReminderIn);

    const submission = await DocuSealSubmission.create({
      docuSealSubmissionId: docuSealSubmission.id,
      templateId: template.docuSealTemplateId,
      templateName: template.name,
      propertyId: property.id,
      pipelineId,
      userId: req.user?.id ? Number(req.user.id) : undefined,
      status: 'sent',
      submitters,
      documentCategory: template.category,
      state: property.state,
      metadata: {
        propertyAddress: `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city}, ${property.state}`.trim(),
        fieldsFilled: Object.keys(fields).length,
      },
      sentAt: new Date(),
      expireAt,
      reminderCount: 0,
      nextReminderAt,
      auditLogUrl: docuSealSubmission.audit_log_url,
    });

    // Update property documentStatus
    const documentStatus = (property as any).documentStatus || {};
    documentStatus[template.category] = {
      status: 'sent',
      submissionId: docuSealSubmission.id,
      localSubmissionId: submission.id,
      sentAt: new Date().toISOString(),
      templateId: template.id,
      templateName: template.name,
    };
    await property.update({ documentStatus } as any);

    console.log(`📄 Contract created: ${template.name} for property ${property.id}, submission: ${docuSealSubmission.id}`);

    // Log activity feed event for contract sent (non-blocking)
    try {
      activityFeedService.createActivity({
        eventType: 'deal_updated',
        actor: {
          type: 'user',
          id: req.user?.id ? String(req.user.id) : undefined,
          name: req.user?.name || 'User',
        },
        resource: {
          type: 'deal',
          id: String(property.id),
          name: template.name,
        },
        action: 'sent contract',
        summary: `Contract sent: ${template.name}`,
        importance: 'normal',
      }).catch(() => {});
    } catch {
      // Activity logging is non-critical
    }

    // Get list of emails with prefilled signatures
    const signaturesPrefilled = [
      primarySignature ? sellerEmail : null,
      ...additionalSubmitters
        .filter((s: any) => s.fields?.some((f: any) => f.name === 'Signature'))
        .map((s: any) => s.email),
    ].filter(Boolean) as string[];

    res.status(201).json({
      success: true,
      data: {
        id: submission.id,
        docuSealSubmissionId: docuSealSubmission.id,
        status: submission.status,
        category: template.category,
        templateName: template.name,
        fieldsFilled: Object.keys(fields).length,
        signaturesPrefilled,
        expireAt,
        submitters: submitters.map(s => ({
          email: s.email,
          name: s.name,
          role: s.role,
          status: s.status,
          signUrl: s.embedUrl,
          signaturePrefilled: signaturesPrefilled.includes(s.email),
        })),
      },
    });
  } catch (error) {
    console.error('Error creating contract submission:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create submission',
    });
  }
}

/**
 * @swagger
 * /api/contracts/{id}:
 *   put:
 *     summary: Update a submission (status, metadata)
 *     tags: [Contracts]
 */
export async function updateSubmission(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const submission = await DocuSealSubmission.findByPk(Number(id));

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }

    const { status, metadata, nextReminderAt } = req.body;

    // Only allow updating certain fields
    if (status && ['archived'].includes(status)) {
      submission.status = status as SubmissionStatus;
      if (status === 'archived') {
        submission.archivedAt = new Date();
      }
    }

    if (metadata) {
      submission.metadata = { ...submission.metadata, ...metadata };
    }

    if (nextReminderAt) {
      submission.nextReminderAt = new Date(nextReminderAt);
    }

    await submission.save();

    res.json({
      success: true,
      data: submission,
    });
  } catch (error) {
    console.error('Error updating contract submission:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update submission',
    });
  }
}

/**
 * @swagger
 * /api/contracts/{id}:
 *   delete:
 *     summary: Archive a submission
 *     tags: [Contracts]
 */
export async function deleteSubmission(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const submission = await DocuSealSubmission.findByPk(Number(id));

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }

    // Archive in DocuSeal
    if (docuSealService.isReady()) {
      try {
        await docuSealService.archiveSubmission(submission.docuSealSubmissionId);
      } catch (e) {
        console.warn('Could not archive in DocuSeal:', e);
      }
    }

    // Mark as archived locally (soft delete)
    submission.status = 'archived';
    submission.archivedAt = new Date();
    await submission.save();

    res.json({
      success: true,
      message: 'Submission archived',
    });
  } catch (error) {
    console.error('Error archiving contract submission:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive submission',
    });
  }
}

// ============================================================================
// REMINDER OPERATIONS
// ============================================================================

/**
 * @swagger
 * /api/contracts/{id}/remind:
 *   post:
 *     summary: Send reminder to pending signers
 *     tags: [Contracts]
 */
export async function sendReminder(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { submitterEmail, nextReminderIn } = req.body;

    const submission = await DocuSealSubmission.findByPk(Number(id));

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }

    // Check if already completed/declined/expired
    if (['completed', 'declined', 'expired', 'archived'].includes(submission.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot send reminder - submission is ${submission.status}`,
      });
    }

    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    // Find pending submitters to remind
    const pendingSubmitters = submission.submitters.filter(
      s => ['pending', 'sent', 'opened'].includes(s.status) &&
           (!submitterEmail || s.email === submitterEmail)
    );

    if (pendingSubmitters.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No pending signers to remind',
      });
    }

    // Send reminders
    const remindedSubmitters: string[] = [];
    for (const submitter of pendingSubmitters) {
      try {
        await docuSealService.resendEmail(submitter.id);
        remindedSubmitters.push(submitter.email);
      } catch (e) {
        console.warn(`Could not resend email to ${submitter.email}:`, e);
      }
    }

    // Record reminder sent
    await submission.recordReminderSent(nextReminderIn);

    res.json({
      success: true,
      data: {
        reminded: remindedSubmitters,
        reminderCount: submission.reminderCount,
        nextReminderAt: submission.nextReminderAt,
      },
    });
  } catch (error) {
    console.error('Error sending contract reminder:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send reminder',
    });
  }
}

/**
 * @swagger
 * /api/contracts/reminders/due:
 *   get:
 *     summary: Get submissions due for reminders
 *     tags: [Contracts]
 */
export async function getDueReminders(req: Request, res: Response) {
  try {
    const submissions = await DocuSealSubmission.findDueForReminder();

    res.json({
      success: true,
      data: submissions,
      count: submissions.length,
    });
  } catch (error) {
    console.error('Error getting due reminders:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get due reminders',
    });
  }
}

/**
 * @swagger
 * /api/contracts/reminders/expiring:
 *   get:
 *     summary: Get submissions expiring soon
 *     tags: [Contracts]
 */
export async function getExpiringSoon(req: Request, res: Response) {
  try {
    const hours = Number(req.query.hours) || 24;
    const submissions = await DocuSealSubmission.findExpiringSoon(hours);

    res.json({
      success: true,
      data: submissions,
      count: submissions.length,
    });
  } catch (error) {
    console.error('Error getting expiring submissions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get expiring submissions',
    });
  }
}

// ============================================================================
// DECLINE OPERATIONS
// ============================================================================

/**
 * @swagger
 * /api/contracts/{id}/decline:
 *   post:
 *     summary: Record a decline with reason
 *     tags: [Contracts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *               reason:
 *                 type: string
 */
export async function recordDecline(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { email, reason } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'email is required',
      });
    }

    const submission = await DocuSealSubmission.findByPk(Number(id));

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }

    await submission.recordDecline(email, reason);

    // Update property documentStatus if linked
    if (submission.propertyId && submission.documentCategory) {
      const property = await Property.findByPk(submission.propertyId);
      if (property) {
        const docStatus = (property as any).documentStatus || {};
        if (docStatus[submission.documentCategory]) {
          docStatus[submission.documentCategory].status = 'declined';
          docStatus[submission.documentCategory].declinedAt = new Date().toISOString();
          docStatus[submission.documentCategory].declinedBy = email;
          docStatus[submission.documentCategory].declineReason = reason;
          await property.update({ documentStatus: docStatus } as any);
        }
      }
    }

    res.json({
      success: true,
      data: submission,
    });
  } catch (error) {
    console.error('Error recording decline:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record decline',
    });
  }
}

/**
 * @swagger
 * /api/contracts/declines:
 *   get:
 *     summary: Get all declined submissions with reasons
 *     tags: [Contracts]
 */
export async function getDeclinedSubmissions(req: Request, res: Response) {
  try {
    const { startDate, endDate, limit = 50, offset = 0 } = req.query;

    const where: any = { status: 'declined' };

    if (startDate || endDate) {
      where.declinedAt = {};
      if (startDate) where.declinedAt[Op.gte] = new Date(startDate as string);
      if (endDate) where.declinedAt[Op.lte] = new Date(endDate as string);
    }

    const { rows: submissions, count: total } = await DocuSealSubmission.findAndCountAll({
      where,
      order: [['declinedAt', 'DESC']],
      limit: Math.min(Number(limit), 100),
      offset: Number(offset),
    });

    res.json({
      success: true,
      data: submissions.map(s => ({
        id: s.id,
        docuSealSubmissionId: s.docuSealSubmissionId,
        templateName: s.templateName,
        propertyId: s.propertyId,
        declinedBy: s.declinedBy,
        declineReason: s.declineReason,
        declinedAt: s.declinedAt,
        sentAt: s.sentAt,
        state: s.state,
      })),
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    console.error('Error getting declined submissions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get declined submissions',
    });
  }
}

// ============================================================================
// ANALYTICS OPERATIONS
// ============================================================================

/**
 * @swagger
 * /api/contracts/analytics:
 *   get:
 *     summary: Get contract submission analytics
 *     tags: [Contracts]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 */
export async function getAnalytics(req: Request, res: Response) {
  try {
    const { startDate, endDate, state, templateId, userId } = req.query;

    const analytics = await DocuSealSubmission.getAnalytics({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      state: state as string,
      templateId: templateId ? Number(templateId) : undefined,
      userId: userId ? Number(userId) : undefined,
    });

    // Convert ms to hours for display
    res.json({
      success: true,
      data: {
        ...analytics,
        avgTimeToComplete: analytics.avgTimeToComplete
          ? Math.round(analytics.avgTimeToComplete / (1000 * 60 * 60)) // hours
          : null,
        avgTimeToView: analytics.avgTimeToView
          ? Math.round(analytics.avgTimeToView / (1000 * 60)) // minutes
          : null,
        completionRate: Math.round(analytics.completionRate * 10) / 10,
        declineRate: Math.round(analytics.declineRate * 10) / 10,
        expiryRate: Math.round(analytics.expiryRate * 10) / 10,
      },
    });
  } catch (error) {
    console.error('Error getting contract analytics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get analytics',
    });
  }
}

/**
 * @swagger
 * /api/contracts/analytics/funnel:
 *   get:
 *     summary: Get contract funnel analytics
 *     tags: [Contracts]
 */
export async function getFunnelAnalytics(req: Request, res: Response) {
  try {
    const { startDate, endDate, state } = req.query;

    const funnel = await DocuSealSubmission.getFunnelAnalytics({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      state: state as string,
    });

    res.json({
      success: true,
      data: {
        ...funnel,
        sentToViewedRate: Math.round(funnel.sentToViewedRate * 10) / 10,
        viewedToCompletedRate: Math.round(funnel.viewedToCompletedRate * 10) / 10,
        overallConversionRate: Math.round(funnel.overallConversionRate * 10) / 10,
      },
    });
  } catch (error) {
    console.error('Error getting funnel analytics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get funnel analytics',
    });
  }
}

/**
 * @swagger
 * /api/contracts/analytics/decline-reasons:
 *   get:
 *     summary: Get decline reason analytics
 *     tags: [Contracts]
 */
export async function getDeclineReasonAnalytics(req: Request, res: Response) {
  try {
    const { startDate, endDate } = req.query;

    const reasons = await DocuSealSubmission.getDeclineReasons({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: reasons.map(r => ({
        ...r,
        percentage: Math.round(r.percentage * 10) / 10,
      })),
    });
  } catch (error) {
    console.error('Error getting decline reason analytics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get decline reasons',
    });
  }
}

/**
 * @swagger
 * /api/contracts/analytics/timeline:
 *   get:
 *     summary: Get timeline analytics
 *     tags: [Contracts]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [hour, day, week]
 *           default: day
 */
export async function getTimelineAnalytics(req: Request, res: Response) {
  try {
    const { startDate, endDate, granularity = 'day' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
      });
    }

    const timeline = await DocuSealSubmission.getTimelineAnalytics({
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      granularity: granularity as 'hour' | 'day' | 'week',
    });

    res.json({
      success: true,
      data: timeline,
    });
  } catch (error) {
    console.error('Error getting timeline analytics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get timeline analytics',
    });
  }
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * @swagger
 * /api/contracts/{id}/sync:
 *   post:
 *     summary: Sync submission status from DocuSeal
 *     tags: [Contracts]
 */
export async function syncSubmission(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const submission = await DocuSealSubmission.findByPk(Number(id));

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }

    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    // Fetch from DocuSeal
    const docuSealSubmission = await docuSealService.getSubmission(submission.docuSealSubmissionId);

    // Update submitters
    submission.submitters = docuSealSubmission.submitters.map(s => ({
      id: s.id,
      email: s.email,
      name: s.name,
      role: s.role,
      status: s.status === 'completed' ? 'completed' : s.status as any,
      sentAt: s.sent_at,
      openedAt: s.opened_at,
      completedAt: s.completed_at,
      embedUrl: s.embed_src,
    }));

    // Update status
    const oldStatus = submission.status;
    submission.status = submission.calculateStatus();

    // Update timestamps
    if (docuSealSubmission.completed_at && !submission.completedAt) {
      submission.completedAt = new Date(docuSealSubmission.completed_at);
    }

    // Update document URLs if completed
    if (submission.status === 'completed') {
      submission.combinedDocumentUrl = docuSealSubmission.combined_document_url;
      submission.documentUrls = docuSealSubmission.documents.map(d => d.url);
    }

    await submission.save();

    res.json({
      success: true,
      data: {
        submission,
        statusChanged: oldStatus !== submission.status,
        previousStatus: oldStatus,
      },
    });
  } catch (error) {
    console.error('Error syncing contract submission:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync submission',
    });
  }
}

/**
 * @swagger
 * /api/contracts/{id}/documents:
 *   get:
 *     summary: Get signed document URLs
 *     tags: [Contracts]
 */
export async function getSubmissionDocuments(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const submission = await DocuSealSubmission.findByPk(Number(id));

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }

    if (submission.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Documents only available for completed submissions',
      });
    }

    // If we have cached URLs, return them
    if (submission.documentUrls && submission.documentUrls.length > 0) {
      return res.json({
        success: true,
        data: {
          combinedDocumentUrl: submission.combinedDocumentUrl,
          documentUrls: submission.documentUrls,
          auditLogUrl: submission.auditLogUrl,
        },
      });
    }

    // Otherwise, fetch from DocuSeal
    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    const documents = await docuSealService.getSubmissionDocuments(submission.docuSealSubmissionId);

    // Cache the URLs
    submission.documentUrls = documents.map(d => d.url);
    await submission.save();

    res.json({
      success: true,
      data: {
        combinedDocumentUrl: submission.combinedDocumentUrl,
        documentUrls: submission.documentUrls,
        auditLogUrl: submission.auditLogUrl,
        documents,
      },
    });
  } catch (error) {
    console.error('Error getting submission documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get documents',
    });
  }
}

// ============================================================================
// SCHEDULER CONTROL
// ============================================================================

/**
 * @swagger
 * /api/contracts/scheduler/status:
 *   get:
 *     summary: Get reminder scheduler status
 *     tags: [Contracts]
 */
export async function getSchedulerStatus(req: Request, res: Response) {
  try {
    const status = contractReminderScheduler.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get scheduler status',
    });
  }
}

/**
 * @swagger
 * /api/contracts/scheduler/run:
 *   post:
 *     summary: Manually trigger reminder processing
 *     tags: [Contracts]
 */
export async function triggerScheduler(req: Request, res: Response) {
  try {
    const result = await contractReminderScheduler.processReminders();
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error triggering scheduler:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger scheduler',
    });
  }
}
