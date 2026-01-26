/**
 * Compliance Spec Management Routes
 *
 * API endpoints for managing compliance specs via AI or admin UI.
 * Designed to be AI-friendly with natural language support.
 *
 * @swagger
 * tags:
 *   - name: Compliance Specs
 *     description: Compliance specification management (AI-friendly natural language support)
 *   - name: Compliance Specs AI
 *     description: AI natural language endpoints for compliance management
 *   - name: Compliance Approvals
 *     description: Approval workflow for compliance changes
 *   - name: Compliance Webhooks
 *     description: Webhook configuration for compliance events
 */

import { Router, Request, Response } from 'express';
import { complianceSpecAIService } from '../services/ComplianceSpecAIService';

const router = Router();

// =============================================================================
// AI NATURAL LANGUAGE ENDPOINT
// =============================================================================

/**
 * @swagger
 * /api/compliance-specs/ai/command:
 *   post:
 *     summary: Process AI natural language command
 *     description: Process a natural language command for compliance spec management. Main endpoint for AI voice/chat interfaces.
 *     tags: [Compliance Specs AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [command]
 *             properties:
 *               command:
 *                 type: string
 *                 description: Natural language command
 *               execute:
 *                 type: boolean
 *                 default: false
 *                 description: Execute immediately (may require approval)
 *               skipApproval:
 *                 type: boolean
 *                 default: false
 *                 description: Skip approval if user has permission
 *     responses:
 *       200:
 *         description: Command parsed/executed
 *       400:
 *         description: Command is required
 */
router.post('/ai/command', async (req: Request, res: Response) => {
  try {
    const { command, execute = false, skipApproval = false } = req.body;
    const userId = (req as any).user?.id || 'anonymous';

    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Command is required',
      });
    }

    // Parse the natural language command
    const parsed = await complianceSpecAIService.parseCommand(command, userId);

    // If not executing, just return the parsed result
    if (!execute) {
      return res.json({
        success: true,
        parsed,
        message: 'Command parsed. Set execute=true to run it.',
      });
    }

    // Execute the command
    const result = await complianceSpecAIService.executeCommand(parsed, userId, skipApproval);

    return res.json({
      success: true,
      parsed,
      result,
    });
  } catch (error) {
    console.error('AI command error:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/compliance-specs/ai/batch:
 *   post:
 *     summary: Process batch AI commands
 *     description: Process multiple natural language commands in sequence
 *     tags: [Compliance Specs AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [commands]
 *             properties:
 *               commands:
 *                 type: array
 *                 items:
 *                   type: string
 *               dryRun:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Batch results
 */
router.post('/ai/batch', async (req: Request, res: Response) => {
  try {
    const { commands, dryRun = true } = req.body;
    const userId = (req as any).user?.id || 'anonymous';

    if (!commands || !Array.isArray(commands)) {
      return res.status(400).json({
        success: false,
        error: 'Commands array is required',
      });
    }

    const results = [];
    for (const command of commands) {
      const parsed = await complianceSpecAIService.parseCommand(command, userId);

      if (dryRun) {
        results.push({ command, parsed, executed: false });
      } else {
        const result = await complianceSpecAIService.executeCommand(parsed, userId, false);
        results.push({ command, parsed, result, executed: true });
      }
    }

    return res.json({
      success: true,
      dryRun,
      results,
      summary: {
        total: commands.length,
        executed: dryRun ? 0 : results.filter((r: any) => r.result?.success).length,
        pendingApproval: results.filter((r: any) => r.result?.pendingApprovalId).length,
      },
    });
  } catch (error) {
    console.error('AI batch error:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// =============================================================================
// APPROVAL WORKFLOW
// =============================================================================

/**
 * @swagger
 * /api/compliance-specs/approvals:
 *   get:
 *     summary: List pending approvals
 *     description: List pending approval requests for compliance changes
 *     tags: [Compliance Approvals]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           default: pending
 *     responses:
 *       200:
 *         description: List of pending approvals
 */
router.get('/approvals', async (req: Request, res: Response) => {
  try {
    const { status = 'pending' } = req.query;

    const [approvals] = await (await import('../config/database')).default.query(
      `SELECT * FROM compliance_ai_commands
       WHERE status = :status
       ORDER BY created_at DESC
       LIMIT 50`,
      { replacements: { status }, type: 'SELECT' as any }
    );

    return res.json({
      success: true,
      data: approvals,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/compliance-specs/approvals/{id}/approve:
 *   post:
 *     summary: Approve pending command
 *     description: Approve and execute a pending compliance command
 *     tags: [Compliance Approvals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Command approved and executed
 *       404:
 *         description: Pending command not found
 */
router.post('/approvals/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id || 'anonymous';

    // Get the pending command
    const sequelize = (await import('../config/database')).default;
    const [command] = await sequelize.query(
      `SELECT * FROM compliance_ai_commands WHERE id = :id AND status = 'pending'`,
      { replacements: { id }, type: 'SELECT' as any }
    ) as any[];

    if (!command) {
      return res.status(404).json({
        success: false,
        error: 'Pending command not found',
      });
    }

    // Reconstruct the parsed command
    const parsed = {
      intent: command.parsed_intent,
      params: command.parsed_params,
      confidence: 1,
      requiresApproval: false, // Already approved
      explanation: command.raw_command,
    };

    // Execute with approval
    const result = await complianceSpecAIService.executeCommand(parsed as any, userId, true);

    // Update approval status
    await sequelize.query(
      `UPDATE compliance_ai_commands SET status = 'approved' WHERE id = :id`,
      { replacements: { id } }
    );

    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/compliance-specs/approvals/{id}/reject:
 *   post:
 *     summary: Reject pending command
 *     description: Reject a pending compliance command
 *     tags: [Compliance Approvals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Command rejected
 */
router.post('/approvals/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const sequelize = (await import('../config/database')).default;
    await sequelize.query(
      `UPDATE compliance_ai_commands SET status = 'rejected', error_message = :reason WHERE id = :id`,
      { replacements: { id, reason: reason || 'Rejected by user' } }
    );

    return res.json({
      success: true,
      message: 'Command rejected',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// =============================================================================
// DIRECT API ENDPOINTS (for admin UI)
// =============================================================================

/**
 * @swagger
 * /api/compliance-specs/states:
 *   get:
 *     summary: List all state specs
 *     description: Get a list of all compliance state specifications
 *     tags: [Compliance Specs]
 *     responses:
 *       200:
 *         description: List of state specs
 */
router.get('/states', async (req: Request, res: Response) => {
  try {
    const sequelize = (await import('../config/database')).default;
    const [states] = await sequelize.query(
      `SELECT state_code, state_name, version, status, created_at, updated_at
       FROM compliance_state_specs
       ORDER BY state_code`,
      { type: 'SELECT' as any }
    );

    return res.json({
      success: true,
      data: states,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/compliance-specs/states/{stateCode}:
 *   get:
 *     summary: Get state spec
 *     description: Get full compliance specification for a state
 *     tags: [Compliance Specs]
 *     parameters:
 *       - in: path
 *         name: stateCode
 *         required: true
 *         schema:
 *           type: string
 *         example: TX
 *     responses:
 *       200:
 *         description: State specification
 */
router.get('/states/:stateCode', async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;
    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'get_state_summary',
        params: { stateCode },
        confidence: 1,
        requiresApproval: false,
        explanation: `Get summary for ${stateCode}`,
      },
      'api',
      true
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/compliance-specs/states/:stateCode/rules
 *
 * List rules for a state.
 */
router.get('/states/:stateCode/rules', async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;
    const { phase } = req.query;

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'list_rules',
        params: { stateCode, phase: phase ? parseInt(phase as string) : undefined },
        confidence: 1,
        requiresApproval: false,
        explanation: `List rules for ${stateCode}`,
      },
      'api',
      true
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/compliance-specs/states/:stateCode/disclosures
 *
 * List disclosures for a state.
 */
router.get('/states/:stateCode/disclosures', async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'list_disclosures',
        params: { stateCode },
        confidence: 1,
        requiresApproval: false,
        explanation: `List disclosures for ${stateCode}`,
      },
      'api',
      true
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/compliance-specs/states/:stateCode/validate
 *
 * Validate a state's spec.
 */
router.post('/states/:stateCode/validate', async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'validate_spec',
        params: { stateCode },
        confidence: 1,
        requiresApproval: false,
        explanation: `Validate ${stateCode} spec`,
      },
      'api',
      true
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/compliance-specs/versions/:stateCode
 *
 * Get version history for a state.
 */
router.get('/versions/:stateCode', async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;
    const { limit = 50 } = req.query;

    const sequelize = (await import('../config/database')).default;
    const [versions] = await sequelize.query(
      `SELECT v.* FROM compliance_spec_versions v
       JOIN compliance_state_specs s ON v.state_spec_id = s.id
       WHERE s.state_code = :stateCode
       ORDER BY v.created_at DESC
       LIMIT :limit`,
      { replacements: { stateCode, limit: parseInt(limit as string) }, type: 'SELECT' as any }
    );

    return res.json({
      success: true,
      data: versions,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// =============================================================================
// ENHANCED FEATURES (v2)
// =============================================================================

/**
 * POST /api/compliance-specs/states/:stateCode/clone
 *
 * Clone a state spec to create a new one.
 */
router.post('/states/:stateCode/clone', async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;
    const { targetState, targetStateName } = req.body;
    const userId = (req as any).user?.id || 'api';

    if (!targetState || !targetStateName) {
      return res.status(400).json({
        success: false,
        error: 'targetState and targetStateName are required',
      });
    }

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'clone_state',
        params: { sourceState: stateCode, targetState, targetStateName },
        confidence: 1,
        requiresApproval: false,
        explanation: `Clone ${stateCode} to ${targetState}`,
      },
      userId,
      true // Skip approval for direct API calls
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/compliance-specs/states/:stateCode/export
 *
 * Export a state spec to JSON.
 */
router.get('/states/:stateCode/export', async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'export_state',
        params: { stateCode },
        confidence: 1,
        requiresApproval: false,
        explanation: `Export ${stateCode} spec`,
      },
      'api',
      true
    );

    if (!result.success) {
      return res.status(404).json(result);
    }

    // Option to download as file
    const { download } = req.query;
    if (download === 'true') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${stateCode.toLowerCase()}-spec.json"`);
      return res.send(JSON.stringify(result.data, null, 2));
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/compliance-specs/states/:stateCode/rules/bulk
 *
 * Bulk enable/disable rules.
 */
router.post('/states/:stateCode/rules/bulk', async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;
    const { action, phase, ruleCodes } = req.body;
    const userId = (req as any).user?.id || 'api';

    if (!action || !['enable', 'disable'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'action must be "enable" or "disable"',
      });
    }

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'bulk_toggle_rules',
        params: { stateCode, phase, ruleCodes, active: action === 'enable' },
        confidence: 1,
        requiresApproval: false,
        explanation: `Bulk ${action} rules in ${stateCode}`,
      },
      userId,
      true
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/compliance-specs/validate-logic
 *
 * Validate that custom rule logic is safe JavaScript.
 */
router.post('/validate-logic', async (req: Request, res: Response) => {
  try {
    const { logic } = req.body;

    if (!logic) {
      return res.status(400).json({
        success: false,
        error: 'logic is required',
      });
    }

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'validate_rule_logic',
        params: { logic },
        confidence: 1,
        requiresApproval: false,
        explanation: 'Validate rule logic',
      },
      'api',
      true
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/compliance-specs/commands
 *
 * List all available commands.
 */
router.get('/commands', async (req: Request, res: Response) => {
  try {
    const commands = complianceSpecAIService.listCommands();

    return res.json({
      success: true,
      data: commands,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/compliance-specs/stats
 *
 * Get database statistics including rule/disclosure counts.
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const sequelize = (await import('../config/database')).default;

    // Get database counts
    const [[statesResult]] = await sequelize.query(
      `SELECT COUNT(*) as count FROM compliance_state_specs`,
      { type: 'SELECT' as any }
    ) as any;

    const [[rulesResult]] = await sequelize.query(
      `SELECT COUNT(*) as count FROM compliance_rules`,
      { type: 'SELECT' as any }
    ) as any;

    const [[activeRulesResult]] = await sequelize.query(
      `SELECT COUNT(*) as count FROM compliance_rules WHERE is_active = true`,
      { type: 'SELECT' as any }
    ) as any;

    const [[disclosuresResult]] = await sequelize.query(
      `SELECT COUNT(*) as count FROM compliance_disclosures`,
      { type: 'SELECT' as any }
    ) as any;

    const [[gatesResult]] = await sequelize.query(
      `SELECT COUNT(*) as count FROM compliance_gates`,
      { type: 'SELECT' as any }
    ) as any;

    // Get per-state breakdown
    const stateBreakdown = await sequelize.query(
      `SELECT
        s.state_code,
        s.state_name,
        COUNT(DISTINCT r.id) as rules_count,
        COUNT(DISTINCT d.id) as disclosures_count,
        COUNT(DISTINCT g.id) as gates_count
       FROM compliance_state_specs s
       LEFT JOIN compliance_rules r ON r.state_spec_id = s.id
       LEFT JOIN compliance_disclosures d ON d.state_spec_id = s.id
       LEFT JOIN compliance_gates g ON g.state_spec_id = s.id
       GROUP BY s.id, s.state_code, s.state_name
       ORDER BY s.state_code`,
      { type: 'SELECT' as any }
    );

    // Get cache/webhook stats
    const cacheStats = await complianceSpecAIService.getCacheStats();
    const webhookStats = complianceSpecAIService.getWebhookStats();

    return res.json({
      success: true,
      data: {
        database: {
          states: parseInt(statesResult.count),
          rules: parseInt(rulesResult.count),
          activeRules: parseInt(activeRulesResult.count),
          disclosures: parseInt(disclosuresResult.count),
          gates: parseInt(gatesResult.count),
        },
        byState: stateBreakdown,
        cache: cacheStats,
        webhooks: webhookStats,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// =============================================================================
// WEBHOOK CONFIGURATION
// =============================================================================

/**
 * GET /api/compliance-specs/webhooks
 *
 * List all configured webhooks.
 */
router.get('/webhooks', async (req: Request, res: Response) => {
  try {
    const sequelize = (await import('../config/database')).default;

    const webhooks = await sequelize.query(
      `SELECT id, name, url, events, is_active, created_at, updated_at,
              last_triggered_at, success_count, failure_count
       FROM compliance_webhooks
       ORDER BY name`,
      { type: 'SELECT' as any }
    );

    return res.json({
      success: true,
      data: webhooks,
    });
  } catch (error) {
    // Table might not exist yet
    if ((error as Error).message.includes('does not exist')) {
      return res.json({
        success: true,
        data: [],
        message: 'Webhook table not yet created. Run migrations to enable webhooks.',
      });
    }
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/compliance-specs/webhooks
 *
 * Create a new webhook.
 */
router.post('/webhooks', async (req: Request, res: Response) => {
  try {
    const { name, url, events, secret } = req.body;

    if (!name || !url || !events || !Array.isArray(events)) {
      return res.status(400).json({
        success: false,
        error: 'name, url, and events array are required',
      });
    }

    const sequelize = (await import('../config/database')).default;

    const [[result]] = await sequelize.query(
      `INSERT INTO compliance_webhooks (id, name, url, events, secret, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), :name, :url, :events, :secret, true, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          name,
          url,
          events: JSON.stringify(events),
          secret: secret || null,
        },
        type: 'SELECT' as any,
      }
    ) as any;

    return res.status(201).json({
      success: true,
      message: 'Webhook created',
      data: { id: result.id },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PUT /api/compliance-specs/webhooks/:id
 *
 * Update a webhook.
 */
router.put('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, url, events, secret, isActive } = req.body;

    const sequelize = (await import('../config/database')).default;

    const updates: string[] = ['updated_at = NOW()'];
    const replacements: any = { id };

    if (name !== undefined) {
      updates.push('name = :name');
      replacements.name = name;
    }
    if (url !== undefined) {
      updates.push('url = :url');
      replacements.url = url;
    }
    if (events !== undefined) {
      updates.push('events = :events');
      replacements.events = JSON.stringify(events);
    }
    if (secret !== undefined) {
      updates.push('secret = :secret');
      replacements.secret = secret;
    }
    if (isActive !== undefined) {
      updates.push('is_active = :isActive');
      replacements.isActive = isActive;
    }

    await sequelize.query(
      `UPDATE compliance_webhooks SET ${updates.join(', ')} WHERE id = :id`,
      { replacements }
    );

    return res.json({
      success: true,
      message: 'Webhook updated',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/compliance-specs/webhooks/:id
 *
 * Delete a webhook.
 */
router.delete('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const sequelize = (await import('../config/database')).default;

    await sequelize.query(
      `DELETE FROM compliance_webhooks WHERE id = :id`,
      { replacements: { id } }
    );

    return res.json({
      success: true,
      message: 'Webhook deleted',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/compliance-specs/webhooks/:id/test
 *
 * Test a webhook by sending a test event.
 */
router.post('/webhooks/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const sequelize = (await import('../config/database')).default;

    const [webhook] = await sequelize.query(
      `SELECT * FROM compliance_webhooks WHERE id = :id`,
      { replacements: { id }, type: 'SELECT' as any }
    ) as any[];

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    // Send test payload
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhook.secret ? { 'X-Webhook-Secret': webhook.secret } : {}),
        },
        body: JSON.stringify({
          event: 'test',
          timestamp: new Date().toISOString(),
          data: { message: 'This is a test webhook from Dispotree compliance specs' },
        }),
      });

      return res.json({
        success: true,
        message: 'Test webhook sent',
        data: {
          status: response.status,
          statusText: response.statusText,
        },
      });
    } catch (fetchError) {
      return res.json({
        success: false,
        message: 'Failed to reach webhook URL',
        error: (fetchError as Error).message,
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/compliance-specs/states/:stateCode/rules
 *
 * Add a new rule to a state.
 */
router.post('/states/:stateCode/rules', async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;
    const { ruleCode, name, phase, description, severity, isBlocking, errorMessage, remediation } = req.body;
    const userId = (req as any).user?.id || 'api';

    if (!ruleCode || !name || phase === undefined) {
      return res.status(400).json({
        success: false,
        error: 'ruleCode, name, and phase are required',
      });
    }

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'add_rule',
        params: { stateCode, ruleCode, name, phase, description, severity, isBlocking, errorMessage, remediation },
        confidence: 1,
        requiresApproval: false,
        explanation: `Add rule ${ruleCode} to ${stateCode}`,
      },
      userId,
      true
    );

    return res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PUT /api/compliance-specs/states/:stateCode/rules/:ruleCode
 *
 * Update an existing rule.
 */
router.put('/states/:stateCode/rules/:ruleCode', async (req: Request, res: Response) => {
  try {
    const { stateCode, ruleCode } = req.params;
    const updates = req.body;
    const userId = (req as any).user?.id || 'api';

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'update_rule',
        params: { stateCode, ruleCode, ...updates },
        confidence: 1,
        requiresApproval: false,
        explanation: `Update rule ${ruleCode} in ${stateCode}`,
      },
      userId,
      true
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/compliance-specs/states/:stateCode/rules/:ruleCode
 *
 * Delete a rule.
 */
router.delete('/states/:stateCode/rules/:ruleCode', async (req: Request, res: Response) => {
  try {
    const { stateCode, ruleCode } = req.params;
    const userId = (req as any).user?.id || 'api';

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'delete_rule',
        params: { stateCode, ruleCode },
        confidence: 1,
        requiresApproval: false,
        explanation: `Delete rule ${ruleCode} from ${stateCode}`,
      },
      userId,
      true
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/compliance-specs/states/:stateCode/disclosures
 *
 * Add a new disclosure to a state.
 */
router.post('/states/:stateCode/disclosures', async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;
    const { disclosureCode, name, description, legalCitation, isRequired, phase, keywords } = req.body;
    const userId = (req as any).user?.id || 'api';

    if (!disclosureCode || !name) {
      return res.status(400).json({
        success: false,
        error: 'disclosureCode and name are required',
      });
    }

    const result = await complianceSpecAIService.executeCommand(
      {
        intent: 'add_disclosure',
        params: { stateCode, disclosureCode, name, description, legalCitation, isRequired, phase, keywords },
        confidence: 1,
        requiresApproval: false,
        explanation: `Add disclosure ${disclosureCode} to ${stateCode}`,
      },
      userId,
      true
    );

    return res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
