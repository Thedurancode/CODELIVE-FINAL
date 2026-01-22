/**
 * Compliance Routes
 *
 * API routes for managing state-specific compliance rules.
 *
 * SECURITY:
 * - Read operations require authentication
 * - Write operations (create, update, delete) require admin role
 * - Webhooks use signature verification (handled in controller)
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import * as complianceController from '../controllers/complianceController';
import { authenticate, authorize } from '../middleware/auth';
import {
  validate,
  createRuleSchema,
  updateRuleSchema,
  createKnowledgeSchema,
  createDocumentTemplateSchema,
  bulkCheckSchema,
  checkByIdentifierSchema,
  issueReviewSchema,
} from '../validators/complianceValidator';
import { mlFraudPredictionService } from '../services/MLFraudPredictionService';
import { fraudNetworkGraphService } from '../services/FraudNetworkGraphService';
import { complianceWebSocketService } from '../services/ComplianceWebSocketService';

const router = Router();

// =============================================================================
// DOCUSEAL WEBHOOK SIGNATURE VERIFICATION
// =============================================================================

/**
 * Verify HMAC signature for DocuSeal webhook payloads
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
 * Middleware to verify DocuSeal webhook signature
 * Skips verification in development if no secret is configured
 */
function verifyDocuSealSignature(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;

  // If no secret is configured, warn in development, reject in production
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ DOCUSEAL_WEBHOOK_SECRET not set - rejecting webhook in production');
      res.status(503).json({
        success: false,
        error: 'Webhook endpoint not configured. Set DOCUSEAL_WEBHOOK_SECRET environment variable.',
      });
      return;
    }
    // In development, warn but allow
    console.warn('⚠️ DOCUSEAL_WEBHOOK_SECRET not set - webhook signature verification skipped');
    next();
    return;
  }

  const signature = req.headers['x-docuseal-signature'] as string;
  if (!signature) {
    console.warn('⚠️ Missing DocuSeal signature header');
    res.status(401).json({
      success: false,
      error: 'Missing DocuSeal signature. Configure webhook signing in DocuSeal.',
    });
    return;
  }

  const payload = JSON.stringify(req.body);
  if (!verifyWebhookSignature(payload, signature, secret)) {
    console.warn('⚠️ Invalid DocuSeal webhook signature');
    res.status(401).json({
      success: false,
      error: 'Invalid DocuSeal webhook signature',
    });
    return;
  }

  next();
}

/**
 * @swagger
 * tags:
 *   name: Compliance
 *   description: State-specific compliance rule management
 */

// =============================================================================
// RATE LIMITERS
// =============================================================================

// Rate limit for compliance checks (expensive operations)
const complianceCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 checks per minute per IP
  message: { success: false, error: 'Too many compliance checks. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for write operations
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 writes per minute
  message: { success: false, error: 'Too many write operations. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// =============================================================================
// RULES CRUD - Admin write, authenticated read
// =============================================================================

// AI-powered rule generation and templates (must be before :id routes)
router.post('/rules/generate', authenticate, complianceController.generateRulesFromAI);
router.get('/rules/templates', authenticate, complianceController.getRuleTemplates);

// Rule testing (must be before :id routes)
router.get('/rules/:id/test', authenticate, complianceController.testRule);

router.get('/rules', authenticate, complianceController.getRules);
router.get('/rules/:id', authenticate, complianceController.getRule);
router.post('/rules', authenticate, authorize('admin'), writeLimiter, validate(createRuleSchema), complianceController.createRule);
router.put('/rules/:id', authenticate, authorize('admin'), writeLimiter, validate(updateRuleSchema), complianceController.updateRule);
router.delete('/rules/:id', authenticate, authorize('admin'), writeLimiter, complianceController.deleteRule);

// =============================================================================
// STATES
// =============================================================================

router.get('/states', authenticate, complianceController.getConfiguredStates);

// =============================================================================
// DOCUMENT TEMPLATES - Link DocuSeal templates to states
// =============================================================================

router.get('/document-templates', authenticate, complianceController.getDocumentTemplates);
router.get('/document-templates/docuseal', authenticate, complianceController.getDocuSealTemplates); // Must be before :id route
router.get('/document-templates/:id(\\d+)', authenticate, complianceController.getDocumentTemplate); // Only match numeric IDs
router.post('/document-templates', authenticate, authorize('admin'), writeLimiter, complianceController.createDocumentTemplate);
router.put('/document-templates/:id', authenticate, authorize('admin'), writeLimiter, complianceController.updateDocumentTemplate);
router.delete('/document-templates/:id', authenticate, authorize('admin'), writeLimiter, complianceController.deleteDocumentTemplate);

// =============================================================================
// DOCUMENT REQUIREMENTS - Check required documents for a property/state
// =============================================================================

// Get document requirements and completion status for a specific property
router.get('/documents/:propertyId/requirements', authenticate, complianceController.getPropertyDocumentRequirements);

// Get required documents for a state (without a specific property)
router.get('/documents/requirements/:state', authenticate, complianceController.getStateDocumentRequirements);

// =============================================================================
// COMPLIANCE DASHBOARD & ANALYTICS
// =============================================================================

router.get('/dashboard', authenticate, complianceController.getDashboardStats);
router.post('/bulk-check', authenticate, complianceCheckLimiter, complianceController.bulkComplianceCheck);

// =============================================================================
// COMPLIANCE CHECKS - Authenticated with rate limiting
// =============================================================================

router.get('/checks/latest/:propertyId', authenticate, complianceController.getLatestComplianceCheck);
router.get('/checks/:checkId', authenticate, complianceController.getComplianceCheck);
router.get('/checks/:checkId/reviews', authenticate, complianceController.getComplianceIssueReviews);
router.post('/checks/:checkId/issues/:issueId/review', authenticate, validate(issueReviewSchema), complianceController.reviewComplianceIssue);
router.get('/freshness/:propertyId', authenticate, complianceController.getComplianceFreshness);
router.post('/check/:propertyId', authenticate, complianceCheckLimiter, complianceController.checkProperty);
router.post('/check/by-identifier', authenticate, complianceCheckLimiter, validate(checkByIdentifierSchema), complianceController.checkPropertyByIdentifier);
router.post('/check/bulk', authenticate, complianceCheckLimiter, validate(bulkCheckSchema), complianceController.checkBulk);

// =============================================================================
// SEED DEFAULTS - Admin only
// =============================================================================

router.post('/seed', authenticate, complianceController.seedDefaultRules);

// =============================================================================
// KNOWLEDGE BASE CRUD - Admin write, authenticated read
// =============================================================================

router.get('/knowledge', authenticate, complianceController.getKnowledge);
router.get('/knowledge/context/:state', authenticate, complianceController.getKnowledgeContext);
router.get('/knowledge/:id', authenticate, complianceController.getKnowledgeEntry);
router.post('/knowledge', authenticate, authorize('admin'), writeLimiter, validate(createKnowledgeSchema), complianceController.createKnowledge);
router.put('/knowledge/:id', authenticate, authorize('admin'), writeLimiter, complianceController.updateKnowledge);
router.delete('/knowledge/:id', authenticate, authorize('admin'), writeLimiter, complianceController.deleteKnowledge);
router.post('/knowledge/seed', authenticate, authorize('admin'), complianceController.seedDefaultKnowledge);

// =============================================================================
// DOCUMENT TEMPLATES - Admin write, authenticated read
// =============================================================================

router.get('/templates', authenticate, complianceController.getDocumentTemplates);
router.get('/templates/required/:state', authenticate, complianceController.getRequiredDocuments);
router.post('/templates', authenticate, authorize('admin'), writeLimiter, validate(createDocumentTemplateSchema), complianceController.createDocumentTemplate);
router.put('/templates/:id', authenticate, authorize('admin'), writeLimiter, complianceController.updateDocumentTemplate);
router.delete('/templates/:id', authenticate, authorize('admin'), writeLimiter, complianceController.deleteDocumentTemplate);
router.post('/templates/send', authenticate, complianceController.sendDocument);
router.get('/docuseal/templates', authenticate, complianceController.listDocuSealTemplates);

// =============================================================================
// COMPLIANCE CHECKLIST - Authenticated
// =============================================================================

router.get('/checklist/:propertyId', authenticate, complianceController.getComplianceChecklist);

// =============================================================================
// DOCUSEAL WEBHOOKS - Verified via HMAC signature
// These endpoints are called by DocuSeal servers, not users
// Signature verification protects against spoofed webhook events
// =============================================================================

router.post('/webhooks/docuseal', verifyDocuSealSignature, complianceController.handleDocuSealWebhook);
router.post('/webhooks/docuseal/test', authenticate, authorize('admin'), complianceController.testDocuSealWebhook);

// =============================================================================
// DOCUMENT STATUS MANAGEMENT - Authenticated
// =============================================================================

router.post('/documents/:propertyId/refresh', authenticate, complianceController.refreshDocumentStatus);

// =============================================================================
// COMPLIANCE WATCHDOG - Proactive Expiration Monitoring
// =============================================================================

import { complianceWatchdogScheduler } from '../services/ComplianceWatchdogScheduler';
import { complianceEventStream, ComplianceEventType } from '../services/ComplianceEventStream';
import { complianceAnalyticsService } from '../services/ComplianceAnalyticsService';
import { sanctionsScreeningService } from '../services/SanctionsScreeningService';
import { escalationService } from '../services/EscalationService';
import { complianceTriggerService } from '../services/ComplianceTriggerService';
import { complianceService } from '../services/ComplianceService';
import ComplianceAlert from '../models/ComplianceAlert';
import { ComplianceWebhook, WebhookDeliveryLog } from '../models/ComplianceWebhook';
import EscalationPolicy, { EscalationExecution } from '../models/EscalationPolicy';
import SanctionsScreening from '../models/SanctionsScreening';
import ComplianceRuleVersion from '../models/ComplianceRuleVersion';
import ComplianceEvent from '../models/ComplianceEvent';

/**
 * @swagger
 * /api/compliance/watchdog/status:
 *   get:
 *     summary: Get watchdog scheduler status
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Watchdog status
 */
router.get('/watchdog/status', authenticate, (req, res) => {
  try {
    const status = complianceWatchdogScheduler.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/config:
 *   get:
 *     summary: Get watchdog configuration
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Watchdog configuration
 */
router.get('/watchdog/config', authenticate, (req, res) => {
  try {
    const config = complianceWatchdogScheduler.getConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/config:
 *   put:
 *     summary: Update watchdog configuration
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated configuration
 */
router.put('/watchdog/config', authenticate, authorize('admin'), (req, res) => {
  try {
    complianceWatchdogScheduler.updateConfig(req.body);
    const config = complianceWatchdogScheduler.getConfig();
    res.json({ success: true, data: config, message: 'Configuration updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/run:
 *   post:
 *     summary: Manually trigger watchdog run
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Run results
 */
router.post('/watchdog/run', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await complianceWatchdogScheduler.run();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/run/{checkType}:
 *   post:
 *     summary: Run specific check type
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: checkType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [contracts, licenses, eo_insurance, stale_deals, documents, compliance, mls]
 *     responses:
 *       200:
 *         description: Check results
 */
router.post('/watchdog/run/:checkType', authenticate, authorize('admin'), async (req, res) => {
  try {
    const checkType = req.params.checkType as any;
    const validTypes = ['contracts', 'licenses', 'eo_insurance', 'stale_deals', 'documents', 'compliance', 'mls'];

    if (!validTypes.includes(checkType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid check type. Valid types: ${validTypes.join(', ')}`,
      });
    }

    const alerts = await complianceWatchdogScheduler.runCheck(checkType);
    res.json({ success: true, data: { checkType, alertCount: alerts.length, alerts } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/alerts:
 *   get:
 *     summary: Get active compliance alerts
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [critical, warning, info]
 *       - in: query
 *         name: acknowledged
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of alerts
 */
router.get('/watchdog/alerts', authenticate, async (req, res) => {
  try {
    const { type, severity, acknowledged, resourceType, limit } = req.query;

    // Get from database for persistence
    const dbAlerts = await ComplianceAlert.getActiveAlerts({
      type: type as any,
      severity: severity as any,
      resourceType: resourceType as any,
      limit: limit ? parseInt(limit as string) : 100,
    });

    // Also get in-memory alerts from scheduler
    const memoryAlerts = complianceWatchdogScheduler.getAlerts({
      type: type as any,
      severity: severity as any,
      acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
    });

    res.json({
      success: true,
      data: {
        persisted: dbAlerts,
        active: memoryAlerts,
        totalActive: memoryAlerts.length,
        totalPersisted: dbAlerts.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/alerts/stats:
 *   get:
 *     summary: Get alert statistics
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Alert statistics
 */
router.get('/watchdog/alerts/stats', authenticate, async (req, res) => {
  try {
    const stats = await ComplianceAlert.getStats();
    const schedulerStatus = complianceWatchdogScheduler.getStatus();

    res.json({
      success: true,
      data: {
        database: stats,
        scheduler: {
          activeAlerts: schedulerStatus.activeAlerts,
          totalRuns: schedulerStatus.stats.totalRuns,
          lastRunAt: schedulerStatus.stats.lastRunAt,
          alertsByType: schedulerStatus.stats.byType,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/alerts/{alertId}/acknowledge:
 *   post:
 *     summary: Acknowledge an alert
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert acknowledged
 */
router.post('/watchdog/alerts/:alertId/acknowledge', authenticate, async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = (req as any).user?.id;

    // Acknowledge in scheduler memory
    const memoryAck = complianceWatchdogScheduler.acknowledgeAlert(alertId, userId);

    // Also try database
    const dbAlert = await ComplianceAlert.findOne({ where: { alertKey: alertId } });
    if (dbAlert) {
      await dbAlert.acknowledge(userId);
    }

    if (!memoryAck && !dbAlert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/alerts/{alertId}/resolve:
 *   post:
 *     summary: Resolve an alert
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Alert resolved
 */
router.post('/watchdog/alerts/:alertId/resolve', authenticate, async (req, res) => {
  try {
    const { alertId } = req.params;
    const { notes } = req.body;
    const userId = (req as any).user?.id;

    const dbAlert = await ComplianceAlert.findOne({ where: { alertKey: alertId } });
    if (!dbAlert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    await dbAlert.resolve(userId, notes);
    res.json({ success: true, message: 'Alert resolved' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/alerts/clear-acknowledged:
 *   post:
 *     summary: Clear all acknowledged alerts from memory
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cleared count
 */
router.post('/watchdog/alerts/clear-acknowledged', authenticate, authorize('admin'), (req, res) => {
  try {
    const cleared = complianceWatchdogScheduler.clearAcknowledgedAlerts();
    res.json({ success: true, data: { cleared }, message: `Cleared ${cleared} acknowledged alerts` });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/alerts/resource/{resourceType}/{resourceId}:
 *   get:
 *     summary: Get alerts for a specific resource
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resourceType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [property, broker, document]
 *       - in: path
 *         name: resourceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resource alerts
 */
router.get('/watchdog/alerts/resource/:resourceType/:resourceId', authenticate, async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    const alerts = await ComplianceAlert.getAlertsForResource(
      resourceType as 'property' | 'broker' | 'document',
      resourceId
    );
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/watchdog/cleanup:
 *   post:
 *     summary: Cleanup old resolved/expired alerts
 *     tags: [Compliance Watchdog]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               retentionDays:
 *                 type: number
 *                 default: 90
 *     responses:
 *       200:
 *         description: Cleanup result
 */
router.post('/watchdog/cleanup', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { retentionDays = 90 } = req.body;
    const deleted = await ComplianceAlert.cleanup(retentionDays);
    res.json({ success: true, data: { deleted }, message: `Deleted ${deleted} old alerts` });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// COMPLIANCE EVENT STREAM - Real-time Events & Webhooks
// =============================================================================

/**
 * @swagger
 * /api/compliance/events/types:
 *   get:
 *     summary: Get available event types
 *     tags: [Compliance Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of event types
 */
router.get('/events/types', authenticate, (req, res) => {
  try {
    const types = complianceEventStream.getEventTypes();
    res.json({ success: true, data: types });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/events/stats:
 *   get:
 *     summary: Get event stream statistics
 *     tags: [Compliance Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Event stream stats
 */
router.get('/events/stats', authenticate, async (req, res) => {
  try {
    const streamStats = complianceEventStream.getStats();
    const webhookStats = await ComplianceWebhook.getStats();

    res.json({
      success: true,
      data: {
        stream: streamStats,
        webhooks: webhookStats,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/events/history:
 *   get:
 *     summary: Get event history
 *     tags: [Compliance Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *         description: Comma-separated event types
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *       - in: query
 *         name: resourceId
 *         schema:
 *           type: string
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Event history
 */
router.get('/events/history', authenticate, (req, res) => {
  try {
    const { types, resourceType, resourceId, since, limit } = req.query;

    const events = complianceEventStream.getHistory({
      types: types ? (types as string).split(',') as ComplianceEventType[] : undefined,
      resourceType: resourceType as string,
      resourceId: resourceId as string,
      since: since ? new Date(since as string) : undefined,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({ success: true, data: events, count: events.length });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/events/{eventId}:
 *   get:
 *     summary: Get specific event
 *     tags: [Compliance Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Event details
 */
router.get('/events/:eventId', authenticate, (req, res) => {
  try {
    const event = complianceEventStream.getEvent(req.params.eventId);

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// WEBHOOK SUBSCRIPTIONS
// =============================================================================

/**
 * @swagger
 * /api/compliance/webhooks:
 *   get:
 *     summary: List user's webhook subscriptions
 *     tags: [Compliance Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks
 */
router.get('/webhooks', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const webhooks = await ComplianceWebhook.getByUser(userId);

    // Hide secrets in response
    const sanitized = webhooks.map(w => ({
      ...w.toJSON(),
      secret: w.secret.substring(0, 10) + '...',
    }));

    res.json({ success: true, data: sanitized });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/webhooks:
 *   post:
 *     summary: Create webhook subscription
 *     tags: [Compliance Webhooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - url
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                 default: ["*"]
 *               headers:
 *                 type: object
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Webhook created
 */
router.post('/webhooks', authenticate, writeLimiter, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { name, url, events = ['*'], headers, metadata } = req.body;

    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Name and URL are required',
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
      });
    }

    // Validate events
    const validEvents = complianceEventStream.getEventTypes();
    for (const event of events) {
      if (event !== '*' && !validEvents.includes(event)) {
        return res.status(400).json({
          success: false,
          error: `Invalid event type: ${event}`,
        });
      }
    }

    const webhook = await ComplianceWebhook.create({
      userId,
      name,
      url,
      secret: `whsec_${crypto.randomBytes(24).toString('hex')}`,
      events,
      headers,
      metadata,
    });

    // Also register in memory for immediate use
    complianceEventStream.subscribe(userId, url, events, { webhookId: webhook.id });

    res.status(201).json({
      success: true,
      data: {
        ...webhook.toJSON(),
        secret: webhook.secret, // Show full secret only on creation
      },
      message: 'Webhook created. Save the secret - it will not be shown again.',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/webhooks/{webhookId}:
 *   get:
 *     summary: Get webhook details
 *     tags: [Compliance Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook details
 */
router.get('/webhooks/:webhookId', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const webhook = await ComplianceWebhook.findByPk(req.params.webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    res.json({
      success: true,
      data: {
        ...webhook.toJSON(),
        secret: webhook.secret.substring(0, 10) + '...',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/webhooks/{webhookId}:
 *   put:
 *     summary: Update webhook
 *     tags: [Compliance Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               active:
 *                 type: boolean
 *               headers:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook updated
 */
router.put('/webhooks/:webhookId', authenticate, writeLimiter, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const webhook = await ComplianceWebhook.findByPk(req.params.webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    const { name, url, events, active, headers, metadata } = req.body;

    if (url) {
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid URL format' });
      }
    }

    await webhook.update({
      ...(name && { name }),
      ...(url && { url }),
      ...(events && { events }),
      ...(active !== undefined && { active }),
      ...(headers && { headers }),
      ...(metadata && { metadata }),
    });

    res.json({
      success: true,
      data: {
        ...webhook.toJSON(),
        secret: webhook.secret.substring(0, 10) + '...',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/webhooks/{webhookId}:
 *   delete:
 *     summary: Delete webhook
 *     tags: [Compliance Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook deleted
 */
router.delete('/webhooks/:webhookId', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const webhook = await ComplianceWebhook.findByPk(req.params.webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    await webhook.destroy();
    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/webhooks/{webhookId}/secret:
 *   post:
 *     summary: Regenerate webhook secret
 *     tags: [Compliance Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: New secret generated
 */
router.post('/webhooks/:webhookId/secret', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const webhook = await ComplianceWebhook.findByPk(req.params.webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    const newSecret = await webhook.regenerateSecret();

    res.json({
      success: true,
      data: { secret: newSecret },
      message: 'Secret regenerated. Save it - it will not be shown again.',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/webhooks/{webhookId}/test:
 *   post:
 *     summary: Send test event to webhook
 *     tags: [Compliance Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Test result
 */
router.post('/webhooks/:webhookId/test', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const webhook = await ComplianceWebhook.findByPk(req.params.webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    const result = await complianceEventStream.testWebhook(webhook.id);

    res.json({
      success: true,
      data: result,
      message: result.success ? 'Test event delivered successfully' : 'Test event delivery failed',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/webhooks/{webhookId}/deliveries:
 *   get:
 *     summary: Get webhook delivery logs
 *     tags: [Compliance Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
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
 *         description: Delivery logs
 */
router.get('/webhooks/:webhookId/deliveries', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const webhook = await ComplianceWebhook.findByPk(req.params.webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    const { limit, offset } = req.query;
    const deliveries = await WebhookDeliveryLog.getByWebhook(webhook.id, {
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({ success: true, data: deliveries });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/webhooks/{webhookId}/replay:
 *   post:
 *     summary: Replay events to webhook
 *     tags: [Compliance Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               since:
 *                 type: string
 *                 format: date-time
 *               types:
 *                 type: array
 *                 items:
 *                   type: string
 *               limit:
 *                 type: integer
 *                 default: 100
 *     responses:
 *       200:
 *         description: Replay result
 */
router.post('/webhooks/:webhookId/replay', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const webhook = await ComplianceWebhook.findByPk(req.params.webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    const { since, types, limit } = req.body;

    const result = await complianceEventStream.replayEvents(webhook.id, {
      since: since ? new Date(since) : undefined,
      types,
      limit: limit || 100,
    });

    res.json({
      success: true,
      data: result,
      message: `Replayed ${result.delivered} events (${result.failed} failed)`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/events/publish:
 *   post:
 *     summary: Publish a custom compliance event (admin only)
 *     tags: [Compliance Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - resourceType
 *               - resourceId
 *             properties:
 *               type:
 *                 type: string
 *               resourceType:
 *                 type: string
 *                 enum: [property, broker, document, rule, alert]
 *               resourceId:
 *                 type: string
 *               data:
 *                 type: object
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Event published
 */
router.post('/events/publish', authenticate, authorize('admin'), (req, res) => {
  try {
    const { type, resourceType, resourceId, data = {}, metadata } = req.body;
    const userId = (req as any).user?.id;

    if (!type || !resourceType || !resourceId) {
      return res.status(400).json({
        success: false,
        error: 'type, resourceType, and resourceId are required',
      });
    }

    const event = complianceEventStream.publish(
      type as ComplianceEventType,
      resourceType,
      resourceId,
      data,
      { source: 'user', userId, metadata }
    );

    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// COMPLIANCE ANALYTICS - Enterprise Analytics Dashboard
// =============================================================================

/**
 * @swagger
 * /api/compliance/analytics:
 *   get:
 *     summary: Get comprehensive compliance analytics
 *     tags: [Compliance Analytics]
 *     security:
 *       - bearerAuth: []
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
 *         name: states
 *         schema:
 *           type: string
 *         description: Comma-separated state codes
 *     responses:
 *       200:
 *         description: Analytics data
 */
router.get('/analytics', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, states } = req.query;
    const analytics = await complianceAnalyticsService.getAnalytics({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      states: states ? (states as string).split(',') : undefined,
    });
    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/analytics/trends:
 *   get:
 *     summary: Get compliance trends over time
 *     tags: [Compliance Analytics]
 */
router.get('/analytics/trends', authenticate, async (req, res) => {
  try {
    const { days = '30' } = req.query;
    const analytics = await complianceAnalyticsService.getAnalytics();
    res.json({ success: true, data: analytics.trends });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/analytics/by-state:
 *   get:
 *     summary: Get compliance analytics by state
 *     tags: [Compliance Analytics]
 */
router.get('/analytics/by-state', authenticate, async (req, res) => {
  try {
    const { states } = req.query;
    const stateList = states ? (states as string).split(',') : undefined;
    const comparison = stateList
      ? await complianceAnalyticsService.getStateComparison(stateList)
      : (await complianceAnalyticsService.getAnalytics()).byState;
    res.json({ success: true, data: comparison });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/analytics/rule-effectiveness:
 *   get:
 *     summary: Get rule effectiveness report
 *     tags: [Compliance Analytics]
 */
router.get('/analytics/rule-effectiveness', authenticate, async (req, res) => {
  try {
    const { state, category } = req.query;
    const effectiveness = await complianceAnalyticsService.getRuleEffectiveness({
      state: state as string,
      category: category as string,
    });
    res.json({ success: true, data: effectiveness });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/analytics/export:
 *   post:
 *     summary: Export analytics data
 *     tags: [Compliance Analytics]
 */
router.post('/analytics/export', authenticate, async (req, res) => {
  try {
    const { type, startDate, endDate, state } = req.body;
    const data = await complianceAnalyticsService.exportAnalytics(type, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      state,
    });
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// SANCTIONS SCREENING - OFAC/Sanctions Integration
// =============================================================================

/**
 * @swagger
 * /api/compliance/sanctions/screen:
 *   post:
 *     summary: Screen an entity against sanctions lists
 *     tags: [Sanctions Screening]
 *     security:
 *       - bearerAuth: []
 */
router.post('/sanctions/screen', authenticate, async (req, res) => {
  try {
    const { entityName, entityType, partyRole, propertyId, additionalIdentifiers } = req.body;

    if (!entityName || !entityType || !partyRole) {
      return res.status(400).json({
        success: false,
        error: 'entityName, entityType, and partyRole are required',
      });
    }

    const result = await sanctionsScreeningService.screenEntity({
      entityName,
      entityType,
      partyRole,
      propertyId,
      additionalIdentifiers,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/sanctions/property/{propertyId}:
 *   post:
 *     summary: Screen all parties for a property
 *     tags: [Sanctions Screening]
 */
router.post('/sanctions/property/:propertyId', authenticate, async (req, res) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const result = await sanctionsScreeningService.screenPropertyParties(propertyId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/sanctions/property/{propertyId}/history:
 *   get:
 *     summary: Get screening history for a property
 *     tags: [Sanctions Screening]
 */
router.get('/sanctions/property/:propertyId/history', authenticate, async (req, res) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const screenings = await sanctionsScreeningService.getPropertyScreenings(propertyId);
    res.json({ success: true, data: screenings });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/sanctions/pending:
 *   get:
 *     summary: Get pending sanctions matches requiring review
 *     tags: [Sanctions Screening]
 */
router.get('/sanctions/pending', authenticate, async (req, res) => {
  try {
    const pending = await sanctionsScreeningService.getPendingMatches();
    res.json({ success: true, data: pending });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/sanctions/{screeningId}/resolve:
 *   post:
 *     summary: Resolve a sanctions match
 *     tags: [Sanctions Screening]
 */
router.post('/sanctions/:screeningId/resolve', authenticate, async (req, res) => {
  try {
    const screeningId = parseInt(req.params.screeningId);
    const { status, notes } = req.body;
    const userId = (req as any).user?.id;

    if (!['cleared', 'blocked', 'escalated'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'status must be one of: cleared, blocked, escalated',
      });
    }

    await sanctionsScreeningService.resolveMatch(screeningId, userId, status, notes);
    res.json({ success: true, message: `Match ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/sanctions/stats:
 *   get:
 *     summary: Get sanctions screening statistics
 *     tags: [Sanctions Screening]
 */
router.get('/sanctions/stats', authenticate, async (req, res) => {
  try {
    const { since, propertyId } = req.query;
    const stats = await sanctionsScreeningService.getStats({
      since: since ? new Date(since as string) : undefined,
      propertyId: propertyId ? parseInt(propertyId as string) : undefined,
    });
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// ESCALATION POLICIES - Configurable Alert Escalation
// =============================================================================

/**
 * @swagger
 * /api/compliance/escalation/policies:
 *   get:
 *     summary: List escalation policies
 *     tags: [Escalation]
 */
router.get('/escalation/policies', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const policies = await EscalationPolicy.getByUser(userId);
    res.json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/escalation/policies:
 *   post:
 *     summary: Create escalation policy
 *     tags: [Escalation]
 */
router.post('/escalation/policies', authenticate, writeLimiter, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { name, description, triggerConditions, actions, cooldownMinutes, maxAlertsPerHour, priority } = req.body;

    if (!name || !triggerConditions || !actions) {
      return res.status(400).json({
        success: false,
        error: 'name, triggerConditions, and actions are required',
      });
    }

    const policy = await EscalationPolicy.create({
      userId,
      name,
      description,
      enabled: true,
      triggerConditions,
      actions,
      cooldownMinutes: cooldownMinutes || 15,
      maxAlertsPerHour: maxAlertsPerHour || 10,
      priority: priority || 0,
      triggerCount: 0,
    });

    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/escalation/policies/{policyId}:
 *   put:
 *     summary: Update escalation policy
 *     tags: [Escalation]
 */
router.put('/escalation/policies/:policyId', authenticate, writeLimiter, async (req, res) => {
  try {
    const policyId = parseInt(req.params.policyId);
    const userId = (req as any).user?.id;

    const policy = await EscalationPolicy.findByPk(policyId);
    if (!policy || policy.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    const updates = req.body;
    await policy.update(updates);

    res.json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/escalation/policies/{policyId}:
 *   delete:
 *     summary: Delete escalation policy
 *     tags: [Escalation]
 */
router.delete('/escalation/policies/:policyId', authenticate, async (req, res) => {
  try {
    const policyId = parseInt(req.params.policyId);
    const userId = (req as any).user?.id;

    const policy = await EscalationPolicy.findByPk(policyId);
    if (!policy || policy.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    await policy.destroy();
    res.json({ success: true, message: 'Policy deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/escalation/policies/{policyId}/test:
 *   post:
 *     summary: Test an escalation policy
 *     tags: [Escalation]
 */
router.post('/escalation/policies/:policyId/test', authenticate, async (req, res) => {
  try {
    const policyId = parseInt(req.params.policyId);
    const result = await escalationService.testPolicy(policyId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/escalation/history:
 *   get:
 *     summary: Get escalation execution history
 *     tags: [Escalation]
 */
router.get('/escalation/history', authenticate, async (req, res) => {
  try {
    const { policyId, status, limit } = req.query;
    const history = await escalationService.getHistory({
      policyId: policyId ? parseInt(policyId as string) : undefined,
      status: status as string,
      limit: limit ? parseInt(limit as string) : 50,
    });
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/escalation/{executionId}/cancel:
 *   post:
 *     summary: Cancel a pending escalation
 *     tags: [Escalation]
 */
router.post('/escalation/:executionId/cancel', authenticate, async (req, res) => {
  try {
    const executionId = parseInt(req.params.executionId);
    await escalationService.cancelEscalation(executionId);
    res.json({ success: true, message: 'Escalation cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// REAL-TIME TRIGGERS - Event-Driven Compliance
// =============================================================================

/**
 * @swagger
 * /api/compliance/triggers:
 *   get:
 *     summary: List compliance triggers
 *     tags: [Compliance Triggers]
 */
router.get('/triggers', authenticate, (req, res) => {
  try {
    const triggers = complianceTriggerService.getTriggers();
    const data = Array.from(triggers.entries()).map(([name, config]) => ({
      name,
      ...config,
    }));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/triggers/stats:
 *   get:
 *     summary: Get trigger statistics
 *     tags: [Compliance Triggers]
 */
router.get('/triggers/stats', authenticate, (req, res) => {
  try {
    const stats = complianceTriggerService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/triggers/queue:
 *   get:
 *     summary: Get trigger queue status
 *     tags: [Compliance Triggers]
 */
router.get('/triggers/queue', authenticate, (req, res) => {
  try {
    const status = complianceTriggerService.getQueueStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/triggers/{name}/toggle:
 *   post:
 *     summary: Enable/disable a trigger
 *     tags: [Compliance Triggers]
 */
router.post('/triggers/:name/toggle', authenticate, authorize('admin'), (req, res) => {
  try {
    const { enabled } = req.body;
    const success = complianceTriggerService.setTriggerEnabled(req.params.name, enabled);

    if (!success) {
      return res.status(404).json({ success: false, error: 'Trigger not found' });
    }

    res.json({ success: true, message: `Trigger ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// RULE VERSIONING - Audit Trail
// =============================================================================

/**
 * @swagger
 * /api/compliance/rules/{ruleId}/versions:
 *   get:
 *     summary: Get version history for a rule
 *     tags: [Compliance Rules]
 */
router.get('/rules/:ruleId/versions', authenticate, async (req, res) => {
  try {
    const ruleId = parseInt(req.params.ruleId);
    const versions = await ComplianceRuleVersion.getVersionHistory(ruleId);
    res.json({ success: true, data: versions });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/checks/{checkId}/rules-at-check:
 *   get:
 *     summary: Get the rules that were in effect when a check was performed
 *     tags: [Compliance Checks]
 */
router.get('/checks/:checkId/rules-at-check', authenticate, async (req, res) => {
  try {
    const checkId = parseInt(req.params.checkId);
    const rules = await complianceService.getRulesAtCheckTime(checkId);
    res.json({ success: true, data: rules });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/checks/{checkId}/verify-rules:
 *   get:
 *     summary: Verify if rules have changed since a check was performed
 *     tags: [Compliance Checks]
 */
router.get('/checks/:checkId/verify-rules', authenticate, async (req, res) => {
  try {
    const checkId = parseInt(req.params.checkId);
    const result = await complianceService.verifyRulesUnchanged(checkId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// PERSISTENT EVENT STORE
// =============================================================================

/**
 * @swagger
 * /api/compliance/events/persistent:
 *   get:
 *     summary: Query events from persistent store
 *     tags: [Compliance Events]
 */
router.get('/events/persistent', authenticate, async (req, res) => {
  try {
    const { types, resourceType, resourceId, propertyId, state, severity, since, until, limit, offset } = req.query;

    const events = await ComplianceEvent.query({
      types: types ? (types as string).split(',') as any[] : undefined,
      resourceType: resourceType as string,
      resourceId: resourceId as string,
      propertyId: propertyId ? parseInt(propertyId as string) : undefined,
      state: state as string,
      severity: severity as any,
      since: since ? new Date(since as string) : undefined,
      until: until ? new Date(until as string) : undefined,
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({ success: true, data: events, count: events.length });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/events/daily-summary:
 *   get:
 *     summary: Get daily event summary
 *     tags: [Compliance Events]
 */
router.get('/events/daily-summary', authenticate, async (req, res) => {
  try {
    const { days = '30' } = req.query;
    const summary = await ComplianceEvent.getDailySummary(parseInt(days as string));
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/events/property/{propertyId}:
 *   get:
 *     summary: Get events for a specific property
 *     tags: [Compliance Events]
 */
router.get('/events/property/:propertyId', authenticate, async (req, res) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { types, limit } = req.query;

    const events = await ComplianceEvent.getForProperty(propertyId, {
      types: types ? (types as string).split(',') as any[] : undefined,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// DOCUMENT OCR VERIFICATION - Contract, ID, Title Document Analysis
// =============================================================================

import { complianceOCRService } from '../services/ComplianceOCRService';
import { propertyVerificationService } from '../services/PropertyVerificationService';
import { titleVerificationService } from '../services/TitleVerificationService';
import { soc2AuditLogger } from '../services/SOC2AuditLogger';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * @swagger
 * /api/compliance/ocr/contract:
 *   post:
 *     summary: Extract and verify contract fields via OCR
 *     tags: [Document OCR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - document
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Contract extraction result
 */
router.post('/ocr/contract', authenticate, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No document uploaded' });
    }

    await complianceOCRService.initialize();
    const result = await complianceOCRService.extractContractFields(req.file.buffer);

    soc2AuditLogger.logVerification(
      { type: 'contract', name: req.file.originalname },
      { type: 'user', id: (req as any).user?.id },
      'ocr_extraction',
      result.success ? 'success' : 'failure',
      undefined,
      { confidence: result.confidence }
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/ocr/seller-id:
 *   post:
 *     summary: Verify seller ID document via OCR
 *     tags: [Document OCR]
 */
router.post('/ocr/seller-id', authenticate, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No document uploaded' });
    }

    const { expectedName } = req.body;
    await complianceOCRService.initialize();
    const result = await complianceOCRService.verifySellerID(req.file.buffer, expectedName);

    soc2AuditLogger.logVerification(
      { type: 'seller_id' },
      { type: 'user', id: (req as any).user?.id },
      'id_verification',
      result.success && result.nameMatch ? 'success' : 'failure',
      undefined,
      { nameMatch: result.nameMatch, matchScore: result.matchScore }
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/ocr/title-document:
 *   post:
 *     summary: Parse title document for liens and encumbrances
 *     tags: [Document OCR]
 */
router.post('/ocr/title-document', authenticate, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No document uploaded' });
    }

    await complianceOCRService.initialize();
    const result = await complianceOCRService.parseTitleDocument(req.file.buffer);

    soc2AuditLogger.logVerification(
      { type: 'title_document', name: result.documentType },
      { type: 'user', id: (req as any).user?.id },
      'title_parsing',
      result.success ? 'success' : 'failure',
      undefined,
      { liensFound: result.liens.length, encumbrancesFound: result.encumbrances.length }
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/ocr/full-verification:
 *   post:
 *     summary: Full compliance verification pipeline (contract + ID + title)
 *     tags: [Document OCR]
 */
router.post('/ocr/full-verification', authenticate, upload.fields([
  { name: 'contract', maxCount: 1 },
  { name: 'sellerId', maxCount: 1 },
  { name: 'titleDocument', maxCount: 1 },
]), async (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const { expectedSellerName, expectedPropertyAddress, expectedPurchasePrice, propertyId } = req.body;

    await complianceOCRService.initialize();

    const result = await complianceOCRService.verifyCompliance({
      contractBuffer: files.contract?.[0]?.buffer,
      sellerIdBuffer: files.sellerId?.[0]?.buffer,
      titleDocBuffer: files.titleDocument?.[0]?.buffer,
      expectedSellerName,
      expectedPropertyAddress,
      expectedPurchasePrice: expectedPurchasePrice ? parseFloat(expectedPurchasePrice) : undefined,
      propertyId: propertyId ? parseInt(propertyId) : undefined,
    });

    soc2AuditLogger.logVerification(
      { type: 'full_compliance', id: propertyId },
      { type: 'user', id: (req as any).user?.id },
      'full_verification',
      result.success ? 'success' : 'failure',
      { propertyId: propertyId ? parseInt(propertyId) : undefined },
      { flags: result.flags.length, confidence: result.overallConfidence, auditHash: result.auditHash }
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// PROPERTY VERIFICATION - ATTOM/CoreLogic Integration
// =============================================================================

/**
 * @swagger
 * /api/compliance/property-verification/verify:
 *   post:
 *     summary: Verify property ownership and details via ATTOM/CoreLogic
 *     tags: [Property Verification]
 *     security:
 *       - bearerAuth: []
 */
router.post('/property-verification/verify', authenticate, async (req, res) => {
  try {
    const {
      propertyAddress, city, state, zip,
      expectedOwnerName, expectedBedrooms, expectedBathrooms, expectedSqft, apn,
    } = req.body;

    if (!propertyAddress || !city || !state || !zip) {
      return res.status(400).json({
        success: false,
        error: 'propertyAddress, city, state, and zip are required',
      });
    }

    await propertyVerificationService.initialize();
    const result = await propertyVerificationService.verifyProperty({
      propertyAddress, city, state, zip,
      expectedOwnerName, expectedBedrooms, expectedBathrooms, expectedSqft, apn,
    });

    soc2AuditLogger.logVerification(
      { type: 'property', name: propertyAddress },
      { type: 'user', id: (req as any).user?.id },
      'property_verification',
      result.verified ? 'success' : 'failure',
      { state },
      { source: result.source, confidence: result.confidence, flags: result.flags.length }
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/property-verification/batch:
 *   post:
 *     summary: Batch verify multiple properties
 *     tags: [Property Verification]
 */
router.post('/property-verification/batch', authenticate, async (req, res) => {
  try {
    const { properties } = req.body;

    if (!Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({ success: false, error: 'properties array is required' });
    }

    if (properties.length > 25) {
      return res.status(400).json({ success: false, error: 'Maximum 25 properties per batch' });
    }

    await propertyVerificationService.initialize();
    const results = await propertyVerificationService.batchVerify(properties);

    res.json({
      success: true,
      data: Object.fromEntries(results),
      count: results.size,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// TITLE VERIFICATION - First American/Qualia Integration
// =============================================================================

/**
 * @swagger
 * /api/compliance/title-verification/verify:
 *   post:
 *     summary: Verify title status via First American/Qualia
 *     tags: [Title Verification]
 *     security:
 *       - bearerAuth: []
 */
router.post('/title-verification/verify', authenticate, async (req, res) => {
  try {
    const {
      propertyAddress, city, state, zip, county, apn,
      expectedOwnerName, purchasePrice, loanAmount, closingDate, orderType,
    } = req.body;

    if (!propertyAddress || !city || !state || !zip) {
      return res.status(400).json({
        success: false,
        error: 'propertyAddress, city, state, and zip are required',
      });
    }

    await titleVerificationService.initialize();
    const result = await titleVerificationService.verifyTitle({
      propertyAddress, city, state, zip, county, apn,
      expectedOwnerName,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : undefined,
      loanAmount: loanAmount ? parseFloat(loanAmount) : undefined,
      closingDate: closingDate ? new Date(closingDate) : undefined,
      orderType,
    });

    soc2AuditLogger.logVerification(
      { type: 'title', name: propertyAddress, id: result.orderId },
      { type: 'user', id: (req as any).user?.id },
      'title_verification',
      result.status === 'clear' ? 'success' : 'partial',
      { state },
      { source: result.source, status: result.status, liens: result.liens.length }
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/title-verification/payoff-request:
 *   post:
 *     summary: Request payoff letter for a lien
 *     tags: [Title Verification]
 */
router.post('/title-verification/payoff-request', authenticate, async (req, res) => {
  try {
    const { lienId, closingDate } = req.body;

    if (!lienId || !closingDate) {
      return res.status(400).json({ success: false, error: 'lienId and closingDate are required' });
    }

    await titleVerificationService.initialize();
    const result = await titleVerificationService.requestPayoffLetter(lienId, new Date(closingDate));

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// SOC 2 AUDIT LOGS - Immutable Compliance Logging
// =============================================================================

/**
 * @swagger
 * /api/compliance/audit/logs:
 *   get:
 *     summary: Query SOC 2 audit logs
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 */
router.get('/audit/logs', authenticate, authorize('admin'), async (req, res) => {
  try {
    const {
      startDate, endDate, eventTypes, eventCategories, severities,
      actorTypes, actorId, resourceTypes, resourceId, outcomes, limit, offset,
    } = req.query;

    await soc2AuditLogger.initialize();
    const result = await soc2AuditLogger.query({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      eventTypes: eventTypes ? (eventTypes as string).split(',') : undefined,
      eventCategories: eventCategories ? (eventCategories as string).split(',') as any : undefined,
      severities: severities ? (severities as string).split(',') as any : undefined,
      actorTypes: actorTypes ? (actorTypes as string).split(',') as any : undefined,
      actorId: actorId as string,
      resourceTypes: resourceTypes ? (resourceTypes as string).split(',') : undefined,
      resourceId: resourceId as string,
      outcomes: outcomes ? (outcomes as string).split(',') as any : undefined,
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/audit/verify-chain:
 *   get:
 *     summary: Verify audit log chain integrity
 *     tags: [Audit Logs]
 */
router.get('/audit/verify-chain', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { fromSequence } = req.query;

    await soc2AuditLogger.initialize();
    const result = await soc2AuditLogger.verifyChain(
      fromSequence ? parseInt(fromSequence as string) : undefined
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/audit/export:
 *   post:
 *     summary: Export audit logs for external auditors
 *     tags: [Audit Logs]
 */
router.post('/audit/export', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { startDate, endDate, eventTypes, resourceTypes, includeDetails, format } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
    }

    await soc2AuditLogger.initialize();
    const result = await soc2AuditLogger.exportForAudit(
      new Date(startDate),
      new Date(endDate),
      { eventTypes, resourceTypes, includeDetails, format }
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit-export-${result.exportId}.csv`);
      res.send(result.data);
    } else {
      res.json({ success: true, data: result });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/audit/stats:
 *   get:
 *     summary: Get audit log statistics
 *     tags: [Audit Logs]
 */
router.get('/audit/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { days = '30' } = req.query;

    await soc2AuditLogger.initialize();
    const stats = await soc2AuditLogger.getStatistics(parseInt(days as string));

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// FRAUD DETECTION - Velocity, Pattern, and Network Analysis
// =============================================================================

import { fraudDetectionService } from '../services/FraudDetectionService';
import FraudSignal from '../models/FraudSignal';

/**
 * @swagger
 * /api/compliance/fraud/check:
 *   post:
 *     summary: Run fraud detection check on a deal
 *     tags: [Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyAddress
 *               - city
 *               - state
 *               - zip
 *             properties:
 *               propertyId:
 *                 type: integer
 *               propertyAddress:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zip:
 *                 type: string
 *               sellerName:
 *                 type: string
 *               sellerPhone:
 *                 type: string
 *               sellerEmail:
 *                 type: string
 *               wholesalerName:
 *                 type: string
 *               askingPrice:
 *                 type: number
 *               estimatedValue:
 *                 type: number
 *     responses:
 *       200:
 *         description: Fraud check results
 */
router.post('/fraud/check', authenticate, async (req, res) => {
  try {
    const submissionIp = req.ip || req.socket.remoteAddress;
    const result = await fraudDetectionService.checkDeal({
      ...req.body,
      submissionIp,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/fraud/signals:
 *   get:
 *     summary: Get active fraud signals
 *     tags: [Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, cleared, confirmed_fraud, under_review]
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of fraud signals
 */
router.get('/fraud/signals', authenticate, async (req, res) => {
  try {
    const { status, severity, entityType, limit = '50' } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (entityType) where.entityType = entityType;

    const signals = await FraudSignal.findAll({
      where,
      order: [['riskScore', 'DESC'], ['lastSeenAt', 'DESC']],
      limit: parseInt(limit as string),
    });

    res.json({ success: true, data: signals });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/fraud/signals/{signalId}:
 *   get:
 *     summary: Get fraud signal details
 *     tags: [Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: signalId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Signal details
 */
router.get('/fraud/signals/:signalId', authenticate, async (req, res) => {
  try {
    const signal = await FraudSignal.findByPk(req.params.signalId);

    if (!signal) {
      return res.status(404).json({ success: false, error: 'Signal not found' });
    }

    res.json({ success: true, data: signal });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/fraud/signals/{signalId}/resolve:
 *   post:
 *     summary: Resolve a fraud signal
 *     tags: [Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: signalId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resolution
 *             properties:
 *               resolution:
 *                 type: string
 *                 enum: [cleared, confirmed_fraud]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Signal resolved
 */
router.post('/fraud/signals/:signalId/resolve', authenticate, writeLimiter, async (req, res) => {
  try {
    const userId = (req as any).user?.id || 'unknown';
    const { resolution, notes } = req.body;

    if (!['cleared', 'confirmed_fraud'].includes(resolution)) {
      return res.status(400).json({
        success: false,
        error: 'Resolution must be "cleared" or "confirmed_fraud"',
      });
    }

    if (resolution === 'cleared') {
      await fraudDetectionService.clearSignal(
        parseInt(req.params.signalId),
        userId,
        notes
      );
    } else {
      const signal = await FraudSignal.findByPk(req.params.signalId);
      if (signal) {
        await fraudDetectionService.confirmFraud(
          signal.entityType,
          signal.entityValue,
          userId,
          notes
        );
      }
    }

    res.json({ success: true, message: `Signal ${resolution}` });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/fraud/confirm:
 *   post:
 *     summary: Mark an entity as confirmed fraud
 *     tags: [Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - entityValue
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [seller, property, wholesaler, phone, email, address, ip]
 *               entityValue:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Entity marked as fraud
 */
router.post('/fraud/confirm', authenticate, authorize('admin'), writeLimiter, async (req, res) => {
  try {
    const userId = (req as any).user?.id || 'unknown';
    const { entityType, entityValue, notes } = req.body;

    if (!entityType || !entityValue) {
      return res.status(400).json({
        success: false,
        error: 'entityType and entityValue are required',
      });
    }

    await fraudDetectionService.confirmFraud(entityType, entityValue, userId, notes);

    res.json({
      success: true,
      message: `Entity marked as confirmed fraud: ${entityType} = ${entityValue}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/fraud/stats:
 *   get:
 *     summary: Get fraud detection statistics
 *     tags: [Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Fraud statistics
 */
router.get('/fraud/stats', authenticate, async (req, res) => {
  try {
    const { since } = req.query;
    const stats = await fraudDetectionService.getStats({
      since: since ? new Date(since as string) : undefined,
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/fraud/property/{propertyId}:
 *   get:
 *     summary: Get fraud signals for a property
 *     tags: [Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Property fraud signals
 */
router.get('/fraud/property/:propertyId', authenticate, async (req, res) => {
  try {
    const signals = await FraudSignal.getPropertySignals(parseInt(req.params.propertyId));

    res.json({ success: true, data: signals });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// ML FRAUD PREDICTION ROUTES
// =============================================================================

/**
 * @swagger
 * /api/compliance/ml/predict/{propertyId}:
 *   post:
 *     summary: Run ML-powered fraud prediction on a property
 *     tags: [ML Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: ML prediction result
 */
router.post('/ml/predict/:propertyId', authenticate, async (req, res) => {
  try {
    const propertyId = parseInt(req.params.propertyId);

    // Extract features from the property
    const Property = (await import('../models/Property')).default;
    const property = await Property.findByPk(propertyId);

    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    const features = await mlFraudPredictionService.extractFeatures({
      propertyId,
      propertyAddress: property.address || '',
      city: property.city || '',
      state: property.state || '',
      zip: property.zip || '',
      sellerName: property.sellerLlcName,
      sellerPhone: property.sellerPhone,
      sellerEmail: property.sellerEmail,
      wholesalerName: property.wholesalerLlcName,
      askingPrice: property.askingPrice,
      estimatedValue: property.estimatedValue,
    });

    const prediction = await mlFraudPredictionService.predict(features, propertyId);

    res.json({ success: true, data: prediction });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/ml/train:
 *   post:
 *     summary: Train the ML fraud detection model
 *     tags: [ML Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forceRetrain:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Training result with metrics
 */
router.post('/ml/train', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { forceRetrain } = req.body;
    const result = await mlFraudPredictionService.train(forceRetrain);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/ml/feedback:
 *   post:
 *     summary: Add feedback for ML model improvement
 *     tags: [ML Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyId
 *               - isConfirmedFraud
 *             properties:
 *               propertyId:
 *                 type: integer
 *               isConfirmedFraud:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Feedback recorded
 */
router.post('/ml/feedback', authenticate, async (req, res) => {
  try {
    const { propertyId, isConfirmedFraud } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    await mlFraudPredictionService.addFeedback(propertyId, isConfirmedFraud, userId);

    res.json({ success: true, message: 'Feedback recorded' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/ml/metrics:
 *   get:
 *     summary: Get ML model metrics
 *     tags: [ML Fraud Detection]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Model metrics
 */
router.get('/ml/metrics', authenticate, async (req, res) => {
  try {
    const metrics = mlFraudPredictionService.getMetrics();
    const modelInfo = mlFraudPredictionService.getModelInfo();

    res.json({ success: true, data: { metrics, modelInfo } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// FRAUD NETWORK GRAPH ROUTES
// =============================================================================

/**
 * @swagger
 * /api/compliance/graph/analyze:
 *   post:
 *     summary: Analyze fraud network and detect fraud rings
 *     tags: [Fraud Network Graph]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Network analysis result with fraud rings
 */
router.post('/graph/analyze', authenticate, async (req, res) => {
  try {
    const result = await fraudNetworkGraphService.analyzeNetwork();

    res.json({
      success: true,
      data: {
        ...result,
        fraudRings: result.fraudRings.map(ring => ({
          id: ring.id,
          nodeCount: ring.nodes.length,
          edgeCount: ring.edges.length,
          riskScore: ring.riskScore,
          confirmedFraudCount: ring.confirmedFraudCount,
          totalDeals: ring.totalDeals,
          status: ring.status,
        })),
        centralityScores: Object.fromEntries(result.centralityScores),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/graph/check-connection:
 *   post:
 *     summary: Check if entity is connected to known fraud
 *     tags: [Fraud Network Graph]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - entityValue
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [seller, phone, email, address, ip, wholesaler]
 *               entityValue:
 *                 type: string
 *     responses:
 *       200:
 *         description: Connection check result
 */
router.post('/graph/check-connection', authenticate, async (req, res) => {
  try {
    const { entityType, entityValue } = req.body;
    const result = await fraudNetworkGraphService.checkFraudConnection(entityType, entityValue);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/graph/entity-ring:
 *   post:
 *     summary: Get the fraud ring containing an entity
 *     tags: [Fraud Network Graph]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - entityValue
 *             properties:
 *               entityType:
 *                 type: string
 *               entityValue:
 *                 type: string
 *     responses:
 *       200:
 *         description: Fraud ring details
 */
router.post('/graph/entity-ring', authenticate, async (req, res) => {
  try {
    const { entityType, entityValue } = req.body;
    const ring = await fraudNetworkGraphService.getEntityRing(entityType, entityValue);

    if (!ring) {
      return res.json({ success: true, data: null, message: 'Entity not found in any fraud ring' });
    }

    res.json({
      success: true,
      data: {
        id: ring.id,
        nodeCount: ring.nodes.length,
        edgeCount: ring.edges.length,
        riskScore: ring.riskScore,
        confirmedFraudCount: ring.confirmedFraudCount,
        status: ring.status,
        nodes: ring.nodes.map(n => ({
          id: n.id,
          type: n.type,
          value: n.value,
          riskScore: n.riskScore,
          confirmedFraud: n.confirmedFraud,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/graph/stats:
 *   get:
 *     summary: Get fraud network graph statistics
 *     tags: [Fraud Network Graph]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Graph statistics
 */
router.get('/graph/stats', authenticate, async (req, res) => {
  try {
    const stats = fraudNetworkGraphService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/graph/rebuild:
 *   post:
 *     summary: Rebuild the fraud network graph
 *     tags: [Fraud Network Graph]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Graph rebuilt
 */
router.post('/graph/rebuild', authenticate, authorize('admin'), async (req, res) => {
  try {
    await fraudNetworkGraphService.rebuildGraph();
    const stats = fraudNetworkGraphService.getStats();

    res.json({
      success: true,
      message: 'Graph rebuilt successfully',
      data: stats,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/graph/visualize:
 *   get:
 *     summary: Export graph data for visualization
 *     tags: [Fraud Network Graph]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Graph visualization data
 */
router.get('/graph/visualize', authenticate, async (req, res) => {
  try {
    const data = fraudNetworkGraphService.exportForVisualization();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/graph/mark-fraud:
 *   post:
 *     summary: Mark an entity as confirmed fraud in the graph
 *     tags: [Fraud Network Graph]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - entityValue
 *             properties:
 *               entityType:
 *                 type: string
 *               entityValue:
 *                 type: string
 *     responses:
 *       200:
 *         description: Entity marked as fraud
 */
router.post('/graph/mark-fraud', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { entityType, entityValue } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    await fraudNetworkGraphService.markAsFraud(entityType, entityValue, userId);

    res.json({ success: true, message: 'Entity marked as confirmed fraud' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// WEBSOCKET STATUS ROUTES
// =============================================================================

/**
 * @swagger
 * /api/compliance/ws/stats:
 *   get:
 *     summary: Get WebSocket service statistics
 *     tags: [Compliance WebSocket]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: WebSocket statistics
 */
router.get('/ws/stats', authenticate, async (req, res) => {
  try {
    const stats = complianceWebSocketService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/ws/clients:
 *   get:
 *     summary: Get connected WebSocket clients
 *     tags: [Compliance WebSocket]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connected clients list
 */
router.get('/ws/clients', authenticate, authorize('admin'), async (req, res) => {
  try {
    const clients = complianceWebSocketService.getConnectedClients();
    res.json({ success: true, data: clients });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/compliance/ws/broadcast:
 *   post:
 *     summary: Broadcast a message to all connected clients
 *     tags: [Compliance WebSocket]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Broadcast result
 */
router.post('/ws/broadcast', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { message, data } = req.body;

    const count = complianceWebSocketService.broadcast({
      type: 'event',
      payload: { message, data },
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: `Broadcasted to ${count} clients` });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// EXTRACTION PROFILE ROUTES
// =============================================================================

/**
 * @swagger
 * /api/compliance/extraction-profiles:
 *   get:
 *     summary: Get all extraction profiles
 *     tags: [Compliance Extraction Profiles]
 *     security:
 *       - bearerAuth: []
 */
router.get('/extraction-profiles', authenticate, complianceController.getExtractionProfiles);

/**
 * @swagger
 * /api/compliance/extraction-profiles/find-best:
 *   get:
 *     summary: Find the best matching extraction profile
 *     tags: [Compliance Extraction Profiles]
 *     security:
 *       - bearerAuth: []
 */
router.get('/extraction-profiles/find-best', authenticate, complianceController.findBestExtractionProfile);

/**
 * @swagger
 * /api/compliance/extraction-profiles/{id}:
 *   get:
 *     summary: Get a specific extraction profile
 *     tags: [Compliance Extraction Profiles]
 *     security:
 *       - bearerAuth: []
 */
router.get('/extraction-profiles/:id', authenticate, complianceController.getExtractionProfile);

/**
 * @swagger
 * /api/compliance/extraction-profiles:
 *   post:
 *     summary: Create a new extraction profile
 *     tags: [Compliance Extraction Profiles]
 *     security:
 *       - bearerAuth: []
 */
router.post('/extraction-profiles', authenticate, authorize('admin'), complianceController.createExtractionProfile);

/**
 * @swagger
 * /api/compliance/extraction-profiles/{id}:
 *   put:
 *     summary: Update an extraction profile
 *     tags: [Compliance Extraction Profiles]
 *     security:
 *       - bearerAuth: []
 */
router.put('/extraction-profiles/:id', authenticate, authorize('admin'), complianceController.updateExtractionProfile);

/**
 * @swagger
 * /api/compliance/extraction-profiles/{id}:
 *   delete:
 *     summary: Delete an extraction profile
 *     tags: [Compliance Extraction Profiles]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/extraction-profiles/:id', authenticate, authorize('admin'), complianceController.deleteExtractionProfile);

// =============================================================================
// CONTACT REQUIREMENTS - Manage required contacts by state
// =============================================================================

/**
 * @swagger
 * /api/compliance/contact-requirements:
 *   get:
 *     summary: Get all contact requirement types across states
 *     tags: [Compliance Contact Requirements]
 *     security:
 *       - bearerAuth: []
 */
router.get('/contact-requirements', authenticate, complianceController.getContactRequirements);

/**
 * @swagger
 * /api/compliance/contact-requirements/types:
 *   get:
 *     summary: Get unique contact types with their state assignments
 *     tags: [Compliance Contact Requirements]
 *     security:
 *       - bearerAuth: []
 */
router.get('/contact-requirements/types', authenticate, complianceController.getContactRequirementTypes);

/**
 * @swagger
 * /api/compliance/contact-requirements/state/{state}:
 *   get:
 *     summary: Get contact requirements for a specific state
 *     tags: [Compliance Contact Requirements]
 *     security:
 *       - bearerAuth: []
 */
router.get('/contact-requirements/state/:state', authenticate, complianceController.getContactRequirementsForState);

/**
 * @swagger
 * /api/compliance/contact-requirements/state/{state}:
 *   put:
 *     summary: Update contact requirements for a state
 *     tags: [Compliance Contact Requirements]
 *     security:
 *       - bearerAuth: []
 */
router.put('/contact-requirements/state/:state', authenticate, authorize('admin'), complianceController.updateContactRequirementsForState);

/**
 * @swagger
 * /api/compliance/contact-requirements/bulk-assign:
 *   post:
 *     summary: Bulk assign a contact type to multiple states
 *     tags: [Compliance Contact Requirements]
 *     security:
 *       - bearerAuth: []
 */
router.post('/contact-requirements/bulk-assign', authenticate, authorize('admin'), complianceController.bulkAssignContactRequirement);

/**
 * @swagger
 * /api/compliance/contact-requirements/bulk-remove:
 *   post:
 *     summary: Bulk remove a contact type from multiple states
 *     tags: [Compliance Contact Requirements]
 *     security:
 *       - bearerAuth: []
 */
router.post('/contact-requirements/bulk-remove', authenticate, authorize('admin'), complianceController.bulkRemoveContactRequirement);

export default router;
