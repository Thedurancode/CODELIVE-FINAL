/**
 * Plugin System Routes
 * API routes for the extensible plugin system
 *
 * SECURITY:
 * - All routes require authentication
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as pluginController from '../controllers/pluginController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Rate limit for plugin operations
const pluginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: 'Too many requests.' },
});

// Apply authentication to ALL plugin routes
router.use(authenticate);
router.use(pluginLimiter);

// ============================================================================
// DEAL SOURCES
// ============================================================================

/**
 * @swagger
 * /api/plugins/sources/types:
 *   get:
 *     summary: Get available deal source plugin types
 *     description: Returns all registered deal source plugins with their configuration schemas
 *     tags: [Plugin - Deal Sources]
 *     responses:
 *       200:
 *         description: List of available source types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         example: csv
 *                       name:
 *                         type: string
 *                         example: CSV Import
 *                       description:
 *                         type: string
 *                       configSchema:
 *                         type: object
 */
router.get('/sources/types', pluginController.getAvailableSourceTypes);

/**
 * @swagger
 * /api/plugins/sources:
 *   get:
 *     summary: Get all active deal sources
 *     description: Returns all configured and active deal sources
 *     tags: [Plugin - Deal Sources]
 *     responses:
 *       200:
 *         description: List of active deal sources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       config:
 *                         type: object
 */
router.get('/sources', pluginController.getActiveSources);

/**
 * @swagger
 * /api/plugins/sources:
 *   post:
 *     summary: Add a new deal source
 *     description: Configure and add a new deal source plugin
 *     tags: [Plugin - Deal Sources]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *               - settings
 *             properties:
 *               name:
 *                 type: string
 *                 example: Wholesaler ABC CSV
 *               type:
 *                 type: string
 *                 enum: [csv, api, email, webhook, manual]
 *                 example: csv
 *               settings:
 *                 type: object
 *                 example:
 *                   importMethod: upload
 *                   delimiter: ","
 *                   hasHeaders: true
 *     responses:
 *       200:
 *         description: Deal source created successfully
 *       400:
 *         description: Invalid configuration
 */
router.post('/sources', pluginController.addDealSource);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}:
 *   delete:
 *     summary: Remove a deal source
 *     description: Deactivate and remove a deal source
 *     tags: [Plugin - Deal Sources]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The deal source ID
 *     responses:
 *       200:
 *         description: Deal source removed
 *       404:
 *         description: Source not found
 */
router.delete('/sources/:sourceId', pluginController.removeDealSource);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/fetch:
 *   post:
 *     summary: Fetch deals from a specific source
 *     description: Trigger a fetch operation from the specified deal source
 *     tags: [Plugin - Deal Sources]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               options:
 *                 type: object
 *                 properties:
 *                   limit:
 *                     type: number
 *                   since:
 *                     type: string
 *                     format: date-time
 *     responses:
 *       200:
 *         description: Deals fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     deals:
 *                       type: array
 *                     fetchedCount:
 *                       type: number
 */
router.post('/sources/:sourceId/fetch', pluginController.fetchDealsFromSource);

/**
 * @swagger
 * /api/plugins/sources/fetch-all:
 *   post:
 *     summary: Fetch deals from all active sources
 *     description: Trigger fetch operations from all configured deal sources
 *     tags: [Plugin - Deal Sources]
 *     responses:
 *       200:
 *         description: Fetch operations completed
 */
router.post('/sources/fetch-all', pluginController.fetchDealsFromAllSources);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/webhook:
 *   post:
 *     summary: Webhook endpoint for receiving data
 *     description: |
 *       Receive incoming data via webhook for email and webhook sources.
 *
 *       **For Email Sources:** Forward emails from services like SendGrid, Mailgun, or Postmark.
 *
 *       **Supported Email Formats:**
 *       - Generic: `{ from, subject, body/text, html }`
 *       - SendGrid: `{ envelope, subject, text, html }`
 *       - Mailgun: `{ sender, subject, body-plain, body-html }`
 *
 *       **Example Email Payload:**
 *       ```json
 *       {
 *         "from": "wholesaler@example.com",
 *         "subject": "Hot Deal - 123 Main St",
 *         "body": "Address: 123 Main St\\nCity: Dallas\\nState: TX\\nPrice: $150,000"
 *       }
 *       ```
 *     tags: [Plugin - Deal Sources]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The deal source ID to receive the webhook
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               from:
 *                 type: string
 *                 example: wholesaler@example.com
 *               subject:
 *                 type: string
 *                 example: Hot Deal - 123 Main St, Dallas TX
 *               body:
 *                 type: string
 *                 example: "Address: 123 Main St\\nCity: Dallas\\nState: TX\\nPrice: $150,000"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     deals:
 *                       type: array
 *                     metadata:
 *                       type: object
 *       400:
 *         description: Invalid payload or source doesn't support webhooks
 */
router.post('/sources/:sourceId/webhook', pluginController.handleSourceWebhook);

// ============================================================================
// EMAIL SOURCE MANAGEMENT
// ============================================================================

/**
 * @swagger
 * /api/plugins/sources/email/test:
 *   post:
 *     summary: Test email connection before saving
 *     description: Test an email source configuration without saving it
 *     tags: [Plugin - Email Sources]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fetchMethod:
 *                 type: string
 *                 enum: [webhook, imap, gmail]
 *               imapHost:
 *                 type: string
 *               imapPort:
 *                 type: number
 *               imapSecure:
 *                 type: boolean
 *               emailUsername:
 *                 type: string
 *               emailPassword:
 *                 type: string
 *               gmailCredentials:
 *                 type: object
 *     responses:
 *       200:
 *         description: Connection test result
 */
router.post('/sources/email/test', pluginController.testEmailConnection);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/update:
 *   put:
 *     summary: Update an existing deal source
 *     description: Update configuration for an existing deal source
 *     tags: [Plugin - Deal Sources]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Source updated successfully
 *       404:
 *         description: Source not found
 */
router.put('/sources/:sourceId/update', pluginController.updateDealSource);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/inbox:
 *   get:
 *     summary: Get email inbox history for a source
 *     description: Returns received emails and extracted deals for an email source
 *     tags: [Plugin - Email Sources]
 *     parameters:
 *       - in: path
 *         name: sourceId
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, success, failed, skipped]
 *     responses:
 *       200:
 *         description: Email inbox history
 */
router.get('/sources/:sourceId/inbox', pluginController.getEmailInbox);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/inbox/summary:
 *   get:
 *     summary: Get email inbox summary for a source
 *     description: Returns summary statistics for an email source
 *     tags: [Plugin - Email Sources]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Inbox summary statistics
 */
router.get('/sources/:sourceId/inbox/summary', pluginController.getEmailInboxSummary);

// ============================================================================
// BUY BOXES
// ============================================================================

/**
 * @swagger
 * /api/plugins/buyboxes:
 *   get:
 *     summary: Get all buy boxes
 *     description: Returns all configured hedge fund buy boxes
 *     tags: [Plugin - Buy Boxes]
 *     responses:
 *       200:
 *         description: List of buy boxes
 */
router.get('/buyboxes', pluginController.getAllBuyBoxes);

/**
 * @swagger
 * /api/plugins/buyboxes:
 *   post:
 *     summary: Add a buy box
 *     description: Create a new hedge fund buy box configuration
 *     tags: [Plugin - Buy Boxes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - criteria
 *             properties:
 *               name:
 *                 type: string
 *                 example: ABC Investments
 *               criteria:
 *                 type: object
 *                 properties:
 *                   states:
 *                     type: array
 *                     items:
 *                       type: string
 *                   minPrice:
 *                     type: number
 *                   maxPrice:
 *                     type: number
 *                   minBeds:
 *                     type: number
 *                   maxBeds:
 *                     type: number
 *                   propertyTypes:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: Buy box created
 */
router.post('/buyboxes', pluginController.addBuyBox);

/**
 * @swagger
 * /api/plugins/buyboxes/{buyBoxId}:
 *   put:
 *     summary: Update a buy box
 *     description: Update an existing buy box configuration
 *     tags: [Plugin - Buy Boxes]
 *     parameters:
 *       - in: path
 *         name: buyBoxId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Buy box updated
 */
router.put('/buyboxes/:buyBoxId', pluginController.updateBuyBox);

/**
 * @swagger
 * /api/plugins/buyboxes/{buyBoxId}:
 *   delete:
 *     summary: Remove a buy box
 *     description: Deactivate a buy box
 *     tags: [Plugin - Buy Boxes]
 *     parameters:
 *       - in: path
 *         name: buyBoxId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Buy box removed
 */
router.delete('/buyboxes/:buyBoxId', pluginController.removeBuyBox);

/**
 * @swagger
 * /api/plugins/buyboxes/score:
 *   post:
 *     summary: Score a deal against all buy boxes
 *     description: Calculate match scores for a deal against all active buy boxes
 *     tags: [Plugin - Buy Boxes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address:
 *                 type: object
 *                 properties:
 *                   state:
 *                     type: string
 *                   city:
 *                     type: string
 *                   zip:
 *                     type: string
 *               askingPrice:
 *                 type: number
 *               bedrooms:
 *                 type: number
 *               bathrooms:
 *                 type: number
 *               propertyType:
 *                 type: string
 *     responses:
 *       200:
 *         description: Scoring results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     scores:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           buyBoxId:
 *                             type: string
 *                           score:
 *                             type: number
 *                           matchType:
 *                             type: string
 *                             enum: [strong, moderate, weak, no_match]
 */
router.post('/buyboxes/score', pluginController.scoreDeal);

/**
 * @swagger
 * /api/plugins/buyboxes/match:
 *   post:
 *     summary: Find best matching buy boxes for a deal
 *     description: Returns buy boxes sorted by match score
 *     tags: [Plugin - Buy Boxes]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *         description: Maximum number of matches to return
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Matching buy boxes
 */
router.post('/buyboxes/match', pluginController.findBestMatches);

// ============================================================================
// DEAL ANALYSIS
// ============================================================================

/**
 * @swagger
 * /api/plugins/analysis/enrich:
 *   post:
 *     summary: Enrich a deal with external data
 *     description: Fetch additional data from external providers (Zillow, ATTOM, etc.)
 *     tags: [Plugin - Analysis]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deal:
 *                 type: object
 *               providers:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [zillow, attom, google_maps, assessor, rentometer]
 *     responses:
 *       200:
 *         description: Enriched deal data
 */
router.post('/analysis/enrich', pluginController.enrichDeal);

/**
 * @swagger
 * /api/plugins/analysis/analyze:
 *   post:
 *     summary: Perform comprehensive deal analysis
 *     description: AI-powered analysis including valuation, risk assessment, and recommendations
 *     tags: [Plugin - Analysis]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Deal analysis results
 */
router.post('/analysis/analyze', pluginController.analyzeDeal);

// ============================================================================
// AUTOMATIONS
// ============================================================================

/**
 * @swagger
 * /api/plugins/automations:
 *   get:
 *     summary: Get all automations
 *     description: Returns all configured automation rules
 *     tags: [Plugin - Automations]
 *     responses:
 *       200:
 *         description: List of automations
 */
router.get('/automations', pluginController.getAllAutomations);

/**
 * @swagger
 * /api/plugins/automations:
 *   post:
 *     summary: Add an automation
 *     description: Create a new event-driven automation rule
 *     tags: [Plugin - Automations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - trigger
 *               - actions
 *             properties:
 *               name:
 *                 type: string
 *               trigger:
 *                 type: object
 *                 properties:
 *                   event:
 *                     type: string
 *                     enum: [deal.received, deal.scored, deal.matched, compliance.checked]
 *               conditions:
 *                 type: array
 *               actions:
 *                 type: array
 *     responses:
 *       200:
 *         description: Automation created
 */
router.post('/automations', pluginController.addAutomation);

/**
 * @swagger
 * /api/plugins/automations/{automationId}/trigger:
 *   post:
 *     summary: Trigger an automation manually
 *     description: Manually execute an automation with optional payload
 *     tags: [Plugin - Automations]
 *     parameters:
 *       - in: path
 *         name: automationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Automation triggered
 */
router.post('/automations/:automationId/trigger', pluginController.triggerAutomation);

/**
 * @swagger
 * /api/plugins/automations/{automationId}:
 *   get:
 *     summary: Get automation details
 *     description: Returns details for a specific automation
 *     tags: [Plugin - Automations]
 *     parameters:
 *       - in: path
 *         name: automationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Automation details
 *       404:
 *         description: Automation not found
 */
router.get('/automations/:automationId', pluginController.getAutomationById);

/**
 * @swagger
 * /api/plugins/automations/{automationId}:
 *   put:
 *     summary: Update an automation
 *     description: Update an existing automation
 *     tags: [Plugin - Automations]
 *     parameters:
 *       - in: path
 *         name: automationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Automation updated
 *       404:
 *         description: Automation not found
 */
router.put('/automations/:automationId', pluginController.updateAutomation);

/**
 * @swagger
 * /api/plugins/automations/{automationId}:
 *   delete:
 *     summary: Delete an automation
 *     description: Delete an automation rule
 *     tags: [Plugin - Automations]
 *     parameters:
 *       - in: path
 *         name: automationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Automation deleted
 *       404:
 *         description: Automation not found
 */
router.delete('/automations/:automationId', pluginController.deleteAutomation);

/**
 * @swagger
 * /api/plugins/automations/{automationId}/toggle:
 *   patch:
 *     summary: Enable/disable an automation
 *     description: Toggle an automation's enabled status
 *     tags: [Plugin - Automations]
 *     parameters:
 *       - in: path
 *         name: automationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Automation toggled
 *       404:
 *         description: Automation not found
 */
router.patch('/automations/:automationId/toggle', pluginController.toggleAutomation);

/**
 * @swagger
 * /api/plugins/automations/{automationId}/history:
 *   get:
 *     summary: Get automation execution history
 *     description: Returns execution history for a specific automation
 *     tags: [Plugin - Automations]
 *     parameters:
 *       - in: path
 *         name: automationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Execution history
 */
router.get('/automations/:automationId/history', pluginController.getAutomationHistory);

/**
 * @swagger
 * /api/plugins/automations/{automationId}/test:
 *   post:
 *     summary: Test an automation (dry run)
 *     description: Test an automation without actually executing actions
 *     tags: [Plugin - Automations]
 *     parameters:
 *       - in: path
 *         name: automationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payload:
 *                 type: object
 *     responses:
 *       200:
 *         description: Test results
 */
router.post('/automations/:automationId/test', pluginController.testAutomation);

/**
 * @swagger
 * /api/plugins/automations/executions:
 *   get:
 *     summary: Get execution history with filtering
 *     tags: [Plugin - Automations]
 *     parameters:
 *       - in: query
 *         name: automationId
 *         schema:
 *           type: string
 *         description: Filter by automation ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [success, failed, partial, skipped]
 *         description: Filter by execution status
 *       - in: query
 *         name: triggeredBy
 *         schema:
 *           type: string
 *           enum: [event, manual, schedule, api]
 *         description: Filter by trigger source
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter executions after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter executions before this date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Max results (1-200)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Execution history
 */
router.get('/automations/executions', pluginController.getExecutionHistoryFiltered);

/**
 * @swagger
 * /api/plugins/automations/stats:
 *   get:
 *     summary: Get aggregated execution statistics
 *     tags: [Plugin - Automations]
 *     parameters:
 *       - in: query
 *         name: automationId
 *         schema:
 *           type: string
 *         description: Filter by automation ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Stats from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Stats until this date
 *     responses:
 *       200:
 *         description: Execution statistics including success rates, timing, and failures
 */
router.get('/automations/stats', pluginController.getExecutionStats);

/**
 * @swagger
 * /api/plugins/automations/executions/cleanup:
 *   post:
 *     summary: Cleanup old execution records
 *     tags: [Plugin - Automations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               retentionDays:
 *                 type: integer
 *                 default: 30
 *                 description: Delete records older than this (1-365 days)
 *     responses:
 *       200:
 *         description: Cleanup completed with count of deleted records
 */
router.post('/automations/executions/cleanup', authorize('admin'), pluginController.cleanupExecutions);

// ============================================================================
// WORKFLOWS
// ============================================================================

/**
 * @swagger
 * /api/plugins/workflows:
 *   get:
 *     summary: Get all workflows
 *     description: Returns all configured workflows
 *     tags: [Plugin - Workflows]
 *     responses:
 *       200:
 *         description: List of workflows
 */
router.get('/workflows', pluginController.getAllWorkflows);

/**
 * @swagger
 * /api/plugins/workflows/templates:
 *   get:
 *     summary: Get workflow templates
 *     description: Returns available workflow templates (Standard, Fast Track, High Value)
 *     tags: [Plugin - Workflows]
 *     responses:
 *       200:
 *         description: List of workflow templates
 */
router.get('/workflows/templates', pluginController.getWorkflowTemplates);

/**
 * @swagger
 * /api/plugins/workflows:
 *   post:
 *     summary: Add a workflow
 *     description: Create a new multi-step workflow
 *     tags: [Plugin - Workflows]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Workflow created
 */
router.post('/workflows', pluginController.addWorkflow);

/**
 * @swagger
 * /api/plugins/workflows/{workflowId}/start:
 *   post:
 *     summary: Start a workflow for a deal
 *     description: Begin processing a deal through the specified workflow
 *     tags: [Plugin - Workflows]
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Workflow started
 */
router.post('/workflows/:workflowId/start', pluginController.startWorkflow);

/**
 * @swagger
 * /api/plugins/workflows/executions/{executionId}/resume:
 *   post:
 *     summary: Resume a paused workflow
 *     description: Continue a workflow that was paused for human review
 *     tags: [Plugin - Workflows]
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Workflow resumed
 */
router.post('/workflows/executions/:executionId/resume', pluginController.resumeWorkflow);

/**
 * @swagger
 * /api/plugins/workflows/reviews:
 *   get:
 *     summary: Get pending human reviews
 *     description: Returns workflows waiting for human review/approval
 *     tags: [Plugin - Workflows]
 *     responses:
 *       200:
 *         description: List of pending reviews
 */
router.get('/workflows/reviews', pluginController.getPendingReviews);

/**
 * @swagger
 * /api/plugins/workflows/reviews/{reviewId}:
 *   post:
 *     summary: Submit a human review
 *     description: Approve or reject a workflow step requiring human review
 *     tags: [Plugin - Workflows]
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - approved
 *             properties:
 *               approved:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Review submitted
 */
router.post('/workflows/reviews/:reviewId', pluginController.submitReview);

// ============================================================================
// FULL DEAL PROCESSING
// ============================================================================

/**
 * @swagger
 * /api/plugins/process:
 *   post:
 *     summary: Process a deal through the full pipeline
 *     description: Run a deal through scoring, analysis, and matching in one call
 *     tags: [Plugin - Processing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deal:
 *                 type: object
 *               options:
 *                 type: object
 *                 properties:
 *                   skipCompliance:
 *                     type: boolean
 *                   autoSubmit:
 *                     type: boolean
 *                   enrichProviders:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: Processing results
 */
router.post('/process', pluginController.processDeal);

// ============================================================================
// FIRECRAWL
// ============================================================================

/**
 * @swagger
 * /api/plugins/firecrawl/test:
 *   post:
 *     summary: Test Firecrawl API connection
 *     description: Test connection to Firecrawl API (cloud or self-hosted)
 *     tags: [Plugin - Firecrawl]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apiUrl:
 *                 type: string
 *                 description: Self-hosted Firecrawl API URL (optional, defaults to cloud)
 *                 example: http://localhost:3002
 *               apiKey:
 *                 type: string
 *                 description: API key (optional for self-hosted without auth)
 *     responses:
 *       200:
 *         description: Connection test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 details:
 *                   type: object
 */
router.post('/firecrawl/test', pluginController.testFirecrawlConnection);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/firecrawl/sites:
 *   get:
 *     summary: Get all crawl sites for a Firecrawl source
 *     description: Returns all configured sites for this Firecrawl source
 *     tags: [Plugin - Firecrawl]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Firecrawl source ID
 *     responses:
 *       200:
 *         description: List of configured sites
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FirecrawlSite'
 *       404:
 *         description: Source not found
 */
router.get('/sources/:sourceId/firecrawl/sites', pluginController.getFirecrawlSites);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/firecrawl/sites:
 *   post:
 *     summary: Add a new crawl site
 *     description: Configure a new website to crawl for real estate deals
 *     tags: [Plugin - Firecrawl]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
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
 *                 example: Wholesaler XYZ Listings
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: https://wholesaler-xyz.com/listings
 *               enabled:
 *                 type: boolean
 *                 default: true
 *               crawlMode:
 *                 type: string
 *                 enum: [scrape, batch, crawl, map_then_scrape]
 *                 default: scrape
 *               urlPatterns:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: URL patterns to match when crawling (glob patterns)
 *               maxPages:
 *                 type: number
 *                 default: 50
 *               customPrompt:
 *                 type: string
 *                 description: Custom AI prompt for extraction
 *               extractionSchema:
 *                 type: object
 *                 description: Custom JSON schema for structured extraction
 *               schedule:
 *                 type: string
 *                 description: Cron expression for scheduled crawls
 *     responses:
 *       201:
 *         description: Site created
 *       404:
 *         description: Source not found
 */
router.post('/sources/:sourceId/firecrawl/sites', pluginController.addFirecrawlSite);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/firecrawl/sites/{siteId}:
 *   get:
 *     summary: Get a specific crawl site
 *     tags: [Plugin - Firecrawl]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Site details
 *       404:
 *         description: Source or site not found
 */
router.get('/sources/:sourceId/firecrawl/sites/:siteId', pluginController.getFirecrawlSite);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/firecrawl/sites/{siteId}:
 *   put:
 *     summary: Update a crawl site
 *     tags: [Plugin - Firecrawl]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *               enabled:
 *                 type: boolean
 *               crawlMode:
 *                 type: string
 *               urlPatterns:
 *                 type: array
 *                 items:
 *                   type: string
 *               maxPages:
 *                 type: number
 *     responses:
 *       200:
 *         description: Site updated
 *       404:
 *         description: Source or site not found
 */
router.put('/sources/:sourceId/firecrawl/sites/:siteId', pluginController.updateFirecrawlSite);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/firecrawl/sites/{siteId}:
 *   delete:
 *     summary: Delete a crawl site
 *     tags: [Plugin - Firecrawl]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Site deleted
 *       404:
 *         description: Source or site not found
 */
router.delete('/sources/:sourceId/firecrawl/sites/:siteId', pluginController.deleteFirecrawlSite);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/firecrawl/sites/{siteId}/crawl:
 *   post:
 *     summary: Trigger a crawl for a specific site
 *     description: Start crawling the specified site and extract deals
 *     tags: [Plugin - Firecrawl]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Crawl results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     dealsFound:
 *                       type: number
 *                     deals:
 *                       type: array
 *                     errors:
 *                       type: array
 *       404:
 *         description: Source or site not found
 */
router.post('/sources/:sourceId/firecrawl/sites/:siteId/crawl', pluginController.crawlFirecrawlSite);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/firecrawl/preview:
 *   post:
 *     summary: Preview extraction from a URL
 *     description: Test AI extraction on a URL before adding it as a site
 *     tags: [Plugin - Firecrawl]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: URL to preview extraction from
 *               schema:
 *                 type: object
 *                 description: Custom extraction schema (optional)
 *               prompt:
 *                 type: string
 *                 description: Custom extraction prompt (optional)
 *     responses:
 *       200:
 *         description: Extraction preview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     extract:
 *                       type: object
 *                     markdown:
 *                       type: string
 *                     metadata:
 *                       type: object
 */
router.post('/sources/:sourceId/firecrawl/preview', pluginController.previewFirecrawlExtraction);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/firecrawl/crawl-and-save:
 *   post:
 *     summary: Crawl a URL and save properties to database
 *     description: |
 *       Crawl a real estate listing URL, extract property data using AI, and save to the database.
 *       This is the main endpoint for importing real estate listings from websites like Zillow, Redfin, etc.
 *     tags: [Plugin - Firecrawl]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Firecrawl source ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: URL to crawl (alternative to siteId)
 *                 example: https://www.zillow.com/homes/61245_rid/
 *               siteId:
 *                 type: string
 *                 description: Existing site ID to crawl (alternative to url)
 *               prompt:
 *                 type: string
 *                 description: Custom extraction prompt
 *               schema:
 *                 type: object
 *                 description: Custom extraction schema
 *               saveToDb:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to save extracted properties to database
 *     responses:
 *       200:
 *         description: Crawl and save results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     crawl:
 *                       type: object
 *                       properties:
 *                         dealsExtracted:
 *                           type: number
 *                         deals:
 *                           type: array
 *                         errors:
 *                           type: array
 *                     database:
 *                       type: object
 *                       properties:
 *                         saved:
 *                           type: boolean
 *                         total:
 *                           type: number
 *                         created:
 *                           type: number
 *                         updated:
 *                           type: number
 *                         skipped:
 *                           type: number
 *       404:
 *         description: Source not found
 */
router.post('/sources/:sourceId/firecrawl/crawl-and-save', pluginController.crawlAndSaveToDatabase);

/**
 * @swagger
 * /api/plugins/sources/{sourceId}/firecrawl/sites/{siteId}/crawl-and-save:
 *   post:
 *     summary: Crawl a configured site and save to database
 *     description: Crawl an existing configured site and save all extracted properties to the database
 *     tags: [Plugin - Firecrawl]
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Crawl and save results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     site:
 *                       type: object
 *                     crawl:
 *                       type: object
 *                     database:
 *                       type: object
 *                       properties:
 *                         saved:
 *                           type: boolean
 *                         total:
 *                           type: number
 *                         created:
 *                           type: number
 *                         updated:
 *                           type: number
 *                         properties:
 *                           type: array
 *       404:
 *         description: Source or site not found
 */
router.post('/sources/:sourceId/firecrawl/sites/:siteId/crawl-and-save', pluginController.crawlSiteAndSave);

// ============================================================================
// BROWSER AUTOMATION - AUCTION SUBMISSION
// ============================================================================

/**
 * @swagger
 * /api/plugins/browser/auction-sites:
 *   get:
 *     summary: Get all configured auction sites
 *     description: Returns all auction sites with their configuration (credentials masked)
 *     tags: [Plugin - Browser Automation]
 *     responses:
 *       200:
 *         description: List of auction sites
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [xome, hubzu, auction_com, custom]
 *                       enabled:
 *                         type: boolean
 *                       baseUrl:
 *                         type: string
 */
router.get('/browser/auction-sites', pluginController.getAuctionSites);

/**
 * @swagger
 * /api/plugins/browser/auction-sites:
 *   post:
 *     summary: Register a new auction site
 *     description: Add a new auction site configuration
 *     tags: [Plugin - Browser Automation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, name, type, baseUrl, loginUrl, submitUrl]
 *             properties:
 *               id:
 *                 type: string
 *                 example: my-xome
 *               name:
 *                 type: string
 *                 example: My Xome Account
 *               type:
 *                 type: string
 *                 enum: [xome, hubzu, auction_com, custom]
 *               baseUrl:
 *                 type: string
 *               loginUrl:
 *                 type: string
 *               submitUrl:
 *                 type: string
 *               enabled:
 *                 type: boolean
 *               credentials:
 *                 type: object
 *                 properties:
 *                   username:
 *                     type: string
 *                   password:
 *                     type: string
 *     responses:
 *       201:
 *         description: Site registered successfully
 */
router.post('/browser/auction-sites', pluginController.registerAuctionSite);

/**
 * @swagger
 * /api/plugins/browser/auction-sites/{siteId}/credentials:
 *   put:
 *     summary: Update auction site credentials
 *     description: Set or update login credentials for an auction site
 *     tags: [Plugin - Browser Automation]
 *     parameters:
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *         example: xome
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Credentials updated
 *       404:
 *         description: Site not found
 */
router.put('/browser/auction-sites/:siteId/credentials', pluginController.updateAuctionCredentials);

/**
 * @swagger
 * /api/plugins/browser/auction-sites/{siteId}/test-login:
 *   post:
 *     summary: Test login to an auction site
 *     description: Attempt to log in to verify credentials work
 *     tags: [Plugin - Browser Automation]
 *     parameters:
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Login test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     loginSuccess:
 *                       type: boolean
 *                     error:
 *                       type: string
 *       404:
 *         description: Site not found
 */
router.post('/browser/auction-sites/:siteId/test-login', pluginController.testAuctionLogin);

/**
 * @swagger
 * /api/plugins/browser/auction-sites/{siteId}/submit:
 *   post:
 *     summary: Submit a deal to an auction site
 *     description: Use browser automation to submit a deal to a specific auction site
 *     tags: [Plugin - Browser Automation]
 *     parameters:
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zip:
 *                     type: string
 *               askingPrice:
 *                 type: number
 *               bedrooms:
 *                 type: integer
 *               bathrooms:
 *                 type: number
 *               sqft:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Submission result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     siteId:
 *                       type: string
 *                     siteName:
 *                       type: string
 *                     confirmationNumber:
 *                       type: string
 *                     screenshot:
 *                       type: string
 */
router.post('/browser/auction-sites/:siteId/submit', pluginController.submitToAuction);

/**
 * @swagger
 * /api/plugins/browser/auction-sites/{siteId}:
 *   delete:
 *     summary: Remove an auction site
 *     description: Remove an auction site configuration
 *     tags: [Plugin - Browser Automation]
 *     parameters:
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Site removed
 *       404:
 *         description: Site not found
 */
router.delete('/browser/auction-sites/:siteId', pluginController.removeAuctionSite);

/**
 * @swagger
 * /api/plugins/browser/submit-multiple:
 *   post:
 *     summary: Submit a deal to multiple auction sites
 *     description: Submit a deal to multiple specified auction sites in sequence
 *     tags: [Plugin - Browser Automation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [deal, siteIds]
 *             properties:
 *               deal:
 *                 type: object
 *                 properties:
 *                   address:
 *                     type: object
 *                   askingPrice:
 *                     type: number
 *                   bedrooms:
 *                     type: integer
 *               siteIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [xome, hubzu]
 *     responses:
 *       200:
 *         description: Submission job created
 */
router.post('/browser/submit-multiple', pluginController.submitToMultipleAuctions);

/**
 * @swagger
 * /api/plugins/browser/submit-all:
 *   post:
 *     summary: Submit a deal to all enabled auction sites
 *     description: Submit a deal to all enabled auction sites
 *     tags: [Plugin - Browser Automation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address:
 *                 type: object
 *               askingPrice:
 *                 type: number
 *               bedrooms:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Submission job created
 *       400:
 *         description: No enabled auction sites configured
 */
router.post('/browser/submit-all', pluginController.submitToAllAuctions);

/**
 * @swagger
 * /api/plugins/browser/jobs:
 *   get:
 *     summary: Get recent submission jobs
 *     description: Returns recent browser automation submission jobs
 *     tags: [Plugin - Browser Automation]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of jobs to return
 *     responses:
 *       200:
 *         description: List of submission jobs
 */
router.get('/browser/jobs', pluginController.getSubmissionJobs);

/**
 * @swagger
 * /api/plugins/browser/jobs/{jobId}:
 *   get:
 *     summary: Get a specific submission job
 *     description: Get details of a specific submission job
 *     tags: [Plugin - Browser Automation]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job details
 *       404:
 *         description: Job not found
 */
router.get('/browser/jobs/:jobId', pluginController.getSubmissionJob);

// ============================================================================
// DATABASE TO AUCTION SITE SUBMISSION
// ============================================================================

/**
 * @swagger
 * /api/plugins/browser/properties/{propertyId}/submit/{siteId}:
 *   post:
 *     summary: Submit a property from database to an auction site
 *     description: Fetch a property from the database and submit it to the specified auction site using browser automation
 *     tags: [Plugin - Browser Automation]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *         description: The property ID in the database
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *         description: The auction site ID (e.g., zillow, xome, hubzu)
 *     responses:
 *       200:
 *         description: Submission result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     property:
 *                       type: object
 *                     submission:
 *                       type: object
 *       404:
 *         description: Property not found
 */
router.post('/browser/properties/:propertyId/submit/:siteId', pluginController.submitPropertyFromDatabase);

/**
 * @swagger
 * /api/plugins/browser/properties/{propertyId}/submit-multiple:
 *   post:
 *     summary: Submit a property to multiple auction sites
 *     description: Fetch a property from the database and submit it to multiple auction sites
 *     tags: [Plugin - Browser Automation]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [siteIds]
 *             properties:
 *               siteIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["zillow", "xome", "hubzu"]
 *     responses:
 *       200:
 *         description: Submission job created
 *       404:
 *         description: Property not found
 */
router.post('/browser/properties/:propertyId/submit-multiple', pluginController.submitPropertyToMultipleSites);

/**
 * @swagger
 * /api/plugins/browser/submit-by-criteria:
 *   post:
 *     summary: Submit multiple properties matching criteria to auction sites
 *     description: Query the database for properties matching criteria and submit them all to specified auction sites
 *     tags: [Plugin - Browser Automation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [siteIds]
 *             properties:
 *               siteIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["zillow", "xome"]
 *               criteria:
 *                 type: object
 *                 properties:
 *                   state:
 *                     type: string
 *                     example: TX
 *                   city:
 *                     type: string
 *                   minPrice:
 *                     type: number
 *                   maxPrice:
 *                     type: number
 *                   propertyType:
 *                     type: string
 *                   minBedrooms:
 *                     type: integer
 *               limit:
 *                 type: integer
 *                 default: 10
 *                 maximum: 50
 *     responses:
 *       200:
 *         description: Batch submission results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     propertiesProcessed:
 *                       type: integer
 *                     sitesTargeted:
 *                       type: integer
 *                     results:
 *                       type: array
 */
router.post('/browser/submit-by-criteria', pluginController.submitPropertiesByCriteria);

/**
 * @swagger
 * /api/plugins/browser/properties/{propertyId}/listing-status:
 *   get:
 *     summary: Get property listing status
 *     description: Get where a property is currently listed, owner info, and submission history
 *     tags: [Plugin - Browser Automation]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Property listing status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     propertyId:
 *                       type: string
 *                     address:
 *                       type: string
 *                     owner:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                     listings:
 *                       type: object
 *                       properties:
 *                         currentSites:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["zillow", "xome", "hubzu"]
 *                         mls:
 *                           type: object
 *                         lastSubmittedAt:
 *                           type: string
 *                           format: date-time
 *                     history:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           siteId:
 *                             type: string
 *                           siteName:
 *                             type: string
 *                           submittedAt:
 *                             type: string
 *                           confirmationNumber:
 *                             type: string
 *                           status:
 *                             type: string
 *       404:
 *         description: Property not found
 */
router.get('/browser/properties/:propertyId/listing-status', pluginController.getPropertyListingStatus);

export default router;
