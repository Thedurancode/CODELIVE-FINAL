/**
 * Contract Controller
 *
 * REST API endpoints for managing DocuSeal contract submissions.
 * Provides full CRUD operations, analytics, and reminder management.
 */

import { Request, Response } from 'express';
import DocuSealSubmission, { SubmissionStatus } from '../models/DocuSealSubmission';
import ContractSigner from '../models/ContractSigner';
import Property from '../models/Property';
import Contact from '../models/Contact';
import { docuSealService } from '../services/DocuSealService';
import { contractReminderScheduler } from '../services/ContractReminderScheduler';
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
 *                 description: Template ID (deprecated - endpoint no longer functional)
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
  // StateDocumentTemplate model has been removed as part of compliance code cleanup.
  // Contract creation via state document templates is no longer supported.
  return res.status(410).json({
    success: false,
    error: 'State document template-based contract creation has been removed. Use DocuSeal direct integration instead.',
  });
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

// ============================================================================
// CONTRACT SIGNER OPERATIONS
// ============================================================================

/**
 * Get all signers for a contract
 */
export async function getContractSigners(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const signers = await ContractSigner.findAll({
      where: { submissionId: Number(id) },
      include: [
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'name', 'email', 'phone'],
          required: false,
        },
      ],
      order: [['order', 'ASC'], ['createdAt', 'ASC']],
    });

    res.json({
      success: true,
      data: signers,
    });
  } catch (error) {
    console.error('Error getting contract signers:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get signers',
    });
  }
}

/**
 * Add a signer to a contract
 */
export async function addContractSigner(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { email, name, role, contactId, order, phone } = req.body;

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
        error: 'Contract not found',
      });
    }

    // Check if signer already exists
    const existing = await ContractSigner.findOne({
      where: {
        submissionId: Number(id),
        email: email.toLowerCase(),
      },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Signer with this email already exists for this contract',
      });
    }

    const signer = await ContractSigner.create({
      submissionId: Number(id),
      projectId: submission.projectId,
      contactId,
      email: email.toLowerCase(),
      name,
      phone,
      role: role || 'signer',
      status: 'pending',
      order,
    });

    res.status(201).json({
      success: true,
      data: signer,
    });
  } catch (error) {
    console.error('Error adding contract signer:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add signer',
    });
  }
}

/**
 * Update a signer
 */
export async function updateContractSigner(req: Request, res: Response) {
  try {
    const { signerId } = req.params;
    const { email, name, role, contactId, order, phone } = req.body;

    const signer = await ContractSigner.findByPk(Number(signerId));
    if (!signer) {
      return res.status(404).json({
        success: false,
        error: 'Signer not found',
      });
    }

    // Update allowed fields
    if (email) signer.email = email.toLowerCase();
    if (name !== undefined) signer.name = name;
    if (phone !== undefined) signer.phone = phone;
    if (role) signer.role = role;
    if (contactId !== undefined) signer.contactId = contactId;
    if (order !== undefined) signer.order = order;

    await signer.save();

    res.json({
      success: true,
      data: signer,
    });
  } catch (error) {
    console.error('Error updating contract signer:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update signer',
    });
  }
}

/**
 * Remove a signer
 */
export async function removeContractSigner(req: Request, res: Response) {
  try {
    const { signerId } = req.params;

    const signer = await ContractSigner.findByPk(Number(signerId));
    if (!signer) {
      return res.status(404).json({
        success: false,
        error: 'Signer not found',
      });
    }

    // Don't allow removing completed signers
    if (signer.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot remove a signer who has already signed',
      });
    }

    await signer.destroy();

    res.json({
      success: true,
      message: 'Signer removed',
    });
  } catch (error) {
    console.error('Error removing contract signer:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove signer',
    });
  }
}

/**
 * Send reminder to a specific signer
 */
export async function sendSignerReminder(req: Request, res: Response) {
  try {
    const { signerId } = req.params;

    const signer = await ContractSigner.findByPk(Number(signerId));
    if (!signer) {
      return res.status(404).json({
        success: false,
        error: 'Signer not found',
      });
    }

    // Check signer status
    if (signer.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Signer has already completed signing',
      });
    }

    if (signer.status === 'declined') {
      return res.status(400).json({
        success: false,
        error: 'Signer has declined to sign',
      });
    }

    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    // Send reminder via DocuSeal if we have the DocuSeal signer ID
    if (signer.docuSealSignerId) {
      try {
        await docuSealService.resendEmail(signer.docuSealSignerId);
      } catch (e) {
        console.warn(`Could not resend email to signer ${signer.email}:`, e);
      }
    }

    // Record reminder sent
    await signer.recordReminderSent();

    res.json({
      success: true,
      data: {
        email: signer.email,
        reminderCount: signer.reminderCount,
        lastReminderAt: signer.lastReminderAt,
      },
    });
  } catch (error) {
    console.error('Error sending signer reminder:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send reminder',
    });
  }
}
