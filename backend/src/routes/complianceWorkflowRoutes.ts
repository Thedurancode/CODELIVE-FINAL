/**
 * Compliance Workflow Routes
 * API endpoints for compliance workflow automation management
 *
 * SECURITY:
 * - Authentication required for all endpoints
 *
 * @swagger
 * tags:
 *   - name: Compliance Workflows
 *     description: Compliance workflow automation management
 *   - name: Compliance Workflow Executions
 *     description: Workflow execution tracking and management
 */

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { complianceWorkflowService } from '../services/ComplianceWorkflowService';
import ComplianceWorkflow, { ComplianceWorkflowExecution } from '../models/ComplianceWorkflow';

const router = Router();

// Rate limiting
const workflowLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting
router.use(authenticate);
router.use(workflowLimiter);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const triggerConditionsSchema = z.object({
  severities: z.array(z.enum(['critical', 'warning', 'info', 'all'])),
  categories: z.array(z.string()).optional(),
  ruleIds: z.array(z.number()).optional(),
  states: z.array(z.string()).optional(),
  dealStages: z.array(z.string()).optional(),
  excludeRuleIds: z.array(z.number()).optional(),
  minIssueCount: z.number().optional(),
});

const taskTemplateSchema = z.object({
  titleTemplate: z.string().min(1),
  descriptionTemplate: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  dueDays: z.number().min(1),
  tags: z.array(z.string()),
  assignmentStrategy: z.enum([
    'round_robin',
    'workload_based',
    'specific_user',
    'role_based',
    'property_owner',
  ]),
  assignToUserId: z.string().optional(),
  assignToRoleId: z.string().optional(),
});

const escalationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  afterHours: z.number().min(1),
  escalateTo: z.array(z.string()),
  notificationChannels: z.array(z.enum(['email', 'sms', 'slack', 'in_app'])),
  messageTemplate: z.string().optional(),
  repeatInterval: z.number().optional(),
  maxEscalations: z.number().optional(),
});

const workflowStepSchema = z.object({
  id: z.string(),
  order: z.number(),
  name: z.string(),
  description: z.string().optional(),
  actionType: z.enum([
    'create_task',
    'assign_task',
    'send_notification',
    'hold_deal',
    'escalate',
    'custom',
  ]),
  condition: z
    .object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'contains', 'gt', 'lt', 'in']),
      value: z.unknown(),
    })
    .optional(),
  taskTemplate: taskTemplateSchema.optional(),
  notificationConfig: z
    .object({
      channels: z.array(z.enum(['email', 'sms', 'slack', 'in_app'])),
      recipients: z.array(z.string()),
      messageTemplate: z.string(),
      subject: z.string().optional(),
    })
    .optional(),
  holdDealConfig: z
    .object({
      holdStages: z.array(z.string()),
      releaseOnResolution: z.boolean(),
      notifyDealOwner: z.boolean(),
    })
    .optional(),
  escalationConfig: escalationRuleSchema.optional(),
  delayMinutes: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  triggerConditions: triggerConditionsSchema,
  steps: z.array(workflowStepSchema).min(1),
  autoHoldEnabled: z.boolean().optional(),
  autoHoldSeverities: z.array(z.enum(['critical', 'warning', 'info', 'all'])).optional(),
  autoHoldDealStages: z.array(z.string()).optional(),
  defaultDeadlineDays: z.number().min(1).optional(),
  escalationRules: z.array(escalationRuleSchema).optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
  triggerConditions: triggerConditionsSchema.optional(),
  steps: z.array(workflowStepSchema).optional(),
  autoHoldEnabled: z.boolean().optional(),
  autoHoldSeverities: z.array(z.enum(['critical', 'warning', 'info', 'all'])).optional(),
  autoHoldDealStages: z.array(z.string()).optional(),
  defaultDeadlineDays: z.number().min(1).optional(),
  escalationRules: z.array(escalationRuleSchema).optional(),
});

// ============================================================================
// WORKFLOW CRUD ROUTES
// ============================================================================

/**
 * @swagger
 * /api/compliance-workflows:
 *   get:
 *     summary: List all workflows
 *     description: Get all compliance workflows for the current user/organization
 *     tags: [Compliance Workflows]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of compliance workflows
 *       401:
 *         description: Unauthorized
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const workflows = await complianceWorkflowService.getWorkflows(userId, organizationId);

    return res.json({
      success: true,
      data: workflows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/stats:
 *   get:
 *     summary: Get workflow statistics
 *     description: Get aggregated statistics about compliance workflows
 *     tags: [Compliance Workflows]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workflow statistics
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const stats = await complianceWorkflowService.getStats(userId, organizationId);

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/holds:
 *   get:
 *     summary: Get active deal holds
 *     description: Retrieve all currently active deal holds from compliance workflows
 *     tags: [Compliance Workflows]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active deal holds
 */
router.get('/holds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const holds = await complianceWorkflowService.getActiveHolds();

    return res.json({
      success: true,
      data: holds,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/{id}:
 *   get:
 *     summary: Get a specific workflow
 *     description: Retrieve details of a specific compliance workflow by ID
 *     tags: [Compliance Workflows]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Workflow ID
 *     responses:
 *       200:
 *         description: Workflow details
 *       404:
 *         description: Workflow not found
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const workflow = await complianceWorkflowService.getWorkflow(parseInt(id, 10));

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    return res.json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows:
 *   post:
 *     summary: Create a new workflow
 *     description: Create a new compliance workflow with trigger conditions and steps
 *     tags: [Compliance Workflows]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, triggerConditions, steps]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               triggerConditions:
 *                 type: object
 *               steps:
 *                 type: array
 *     responses:
 *       201:
 *         description: Workflow created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const validation = createWorkflowSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validation.error.errors,
      });
    }

    const workflow = await complianceWorkflowService.createWorkflow({
      ...validation.data,
      userId,
      organizationId,
    });

    return res.status(201).json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/{id}:
 *   patch:
 *     summary: Update a workflow
 *     description: Update an existing compliance workflow
 *     tags: [Compliance Workflows]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Workflow updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Workflow not found
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const validation = updateWorkflowSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validation.error.errors,
      });
    }

    const workflow = await complianceWorkflowService.updateWorkflow(
      parseInt(id, 10),
      validation.data
    );

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    return res.json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/{id}:
 *   delete:
 *     summary: Delete a workflow
 *     description: Delete a compliance workflow by ID
 *     tags: [Compliance Workflows]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Workflow deleted successfully
 *       404:
 *         description: Workflow not found
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const deleted = await complianceWorkflowService.deleteWorkflow(parseInt(id, 10));

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    return res.json({
      success: true,
      message: 'Workflow deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/{id}/activate:
 *   post:
 *     summary: Activate a workflow
 *     description: Set a workflow status to active
 *     tags: [Compliance Workflows]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Workflow activated
 *       404:
 *         description: Workflow not found
 */
router.post('/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const workflow = await complianceWorkflowService.updateWorkflow(parseInt(id, 10), {
      status: 'active',
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    return res.json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/{id}/pause:
 *   post:
 *     summary: Pause a workflow
 *     description: Set a workflow status to paused
 *     tags: [Compliance Workflows]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Workflow paused
 *       404:
 *         description: Workflow not found
 */
router.post('/:id/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const workflow = await complianceWorkflowService.updateWorkflow(parseInt(id, 10), {
      status: 'paused',
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    return res.json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// EXECUTION ROUTES
// ============================================================================

/**
 * @swagger
 * /api/compliance-workflows/executions:
 *   get:
 *     summary: List workflow executions
 *     description: Get workflow executions with optional filters
 *     tags: [Compliance Workflow Executions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, cancelled]
 *     responses:
 *       200:
 *         description: List of workflow executions
 */
router.get('/executions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { propertyId, status } = req.query;

    let executions: ComplianceWorkflowExecution[];

    if (propertyId) {
      executions = await complianceWorkflowService.getExecutionsByProperty(
        parseInt(propertyId as string, 10)
      );
    } else if (status === 'pending') {
      executions = await ComplianceWorkflowExecution.getPending();
    } else {
      executions = await ComplianceWorkflowExecution.findAll({
        order: [['triggeredAt', 'DESC']],
        limit: 100,
      });
    }

    return res.json({
      success: true,
      data: executions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/executions/{id}:
 *   get:
 *     summary: Get a specific execution
 *     description: Retrieve details of a specific workflow execution
 *     tags: [Compliance Workflow Executions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Execution details
 *       404:
 *         description: Execution not found
 */
router.get('/executions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const execution = await complianceWorkflowService.getExecution(parseInt(id, 10));

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
    }

    return res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/executions/{id}/resolve:
 *   post:
 *     summary: Resolve a workflow execution
 *     description: Mark a workflow execution as resolved
 *     tags: [Compliance Workflow Executions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 *         description: Execution resolved
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Execution not found
 */
router.post('/executions/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const execution = await complianceWorkflowService.resolveExecution(
      parseInt(id, 10),
      userId,
      notes
    );

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
    }

    return res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/executions/{id}/cancel:
 *   post:
 *     summary: Cancel a workflow execution
 *     description: Cancel an in-progress workflow execution
 *     tags: [Compliance Workflow Executions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Execution cancelled
 *       404:
 *         description: Execution not found
 */
router.post('/executions/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const execution = await complianceWorkflowService.cancelExecution(parseInt(id, 10));

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
    }

    return res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/compliance-workflows/executions/{id}/release-hold:
 *   post:
 *     summary: Release a deal hold
 *     description: Release a deal from compliance hold
 *     tags: [Compliance Workflow Executions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deal hold released
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Execution not found or deal is not held
 */
router.post(
  '/executions/:id/release-hold',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const execution = await complianceWorkflowService.releaseDealHold(
        parseInt(id, 10),
        userId
      );

      if (!execution) {
        return res.status(404).json({
          success: false,
          error: 'Execution not found or deal is not held',
        });
      }

      return res.json({
        success: true,
        data: execution,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// PROPERTY ROUTES
// ============================================================================

/**
 * @swagger
 * /api/compliance-workflows/property/{propertyId}/executions:
 *   get:
 *     summary: Get property executions
 *     description: Get all workflow executions for a specific property
 *     tags: [Compliance Workflow Executions]
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
 *         description: List of executions for the property
 */
router.get(
  '/property/:propertyId/executions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { propertyId } = req.params;

      const executions = await complianceWorkflowService.getExecutionsByProperty(
        parseInt(propertyId, 10)
      );

      return res.json({
        success: true,
        data: executions,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
