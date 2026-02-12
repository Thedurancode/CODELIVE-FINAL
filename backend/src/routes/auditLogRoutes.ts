/**
 * Audit Log Routes
 *
 * API routes for viewing, searching, and exporting audit logs.
 *
 * SECURITY:
 * - All operations require authentication
 * - Admin role required for export and chain verification
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../middleware/auth';
import { soc2AuditLogger } from '../services/SOC2AuditLogger';

const router = Router();

// =============================================================================
// RATE LIMITERS
// =============================================================================

// Rate limit for audit log queries
const queryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 queries per minute per IP
  message: { success: false, error: 'Too many audit log queries. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for exports (expensive operation)
const exportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 exports per minute
  message: { success: false, error: 'Too many export requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// =============================================================================
// AUDIT LOG QUERIES
// =============================================================================

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: Query audit logs with filters
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date filter
 *       - in: query
 *         name: eventTypes
 *         schema:
 *           type: string
 *         description: Comma-separated event types
 *       - in: query
 *         name: eventCategories
 *         schema:
 *           type: string
 *         description: Comma-separated event categories
 *       - in: query
 *         name: severities
 *         schema:
 *           type: string
 *         description: Comma-separated severities
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *         description: Filter by actor ID
 *       - in: query
 *         name: resourceTypes
 *         schema:
 *           type: string
 *         description: Comma-separated resource types
 *       - in: query
 *         name: resourceId
 *         schema:
 *           type: string
 *         description: Filter by resource ID
 *       - in: query
 *         name: outcomes
 *         schema:
 *           type: string
 *         description: Comma-separated outcomes
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Full-text search query
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 */
router.get('/', authenticate, queryLimiter, async (req: Request, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      eventTypes,
      eventCategories,
      severities,
      actorTypes,
      actorId,
      resourceTypes,
      resourceId,
      outcomes,
      search,
      limit = '50',
      offset = '0',
    } = req.query;

    // Build query options
    const queryOptions: any = {
      limit: Math.min(parseInt(limit as string) || 50, 200),
      offset: parseInt(offset as string) || 0,
    };

    if (startDate) queryOptions.startDate = new Date(startDate as string);
    if (endDate) queryOptions.endDate = new Date(endDate as string);
    if (eventTypes) queryOptions.eventTypes = (eventTypes as string).split(',');
    if (eventCategories) queryOptions.eventCategories = (eventCategories as string).split(',') as any;
    if (severities) queryOptions.severities = (severities as string).split(',') as any;
    if (actorTypes) queryOptions.actorTypes = (actorTypes as string).split(',') as any;
    if (actorId) queryOptions.actorId = actorId as string;
    if (resourceTypes) queryOptions.resourceTypes = (resourceTypes as string).split(',');
    if (resourceId) queryOptions.resourceId = resourceId as string;
    if (outcomes) queryOptions.outcomes = (outcomes as string).split(',') as any;

    // Initialize logger if not ready
    if (!soc2AuditLogger.isReady()) {
      await soc2AuditLogger.initialize();
    }

    const result = await soc2AuditLogger.query(queryOptions);

    // Log this access
    soc2AuditLogger.logAccess(
      { type: 'audit_log', name: 'Audit Log Query' },
      {
        type: 'user',
        id: (req as any).user?.id,
        name: (req as any).user?.email,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      'query',
      'success',
      {
        filters: Object.keys(queryOptions).filter(k => k !== 'limit' && k !== 'offset'),
        resultCount: result.logs.length,
      }
    );

    res.json({
      success: true,
      data: {
        logs: result.logs,
        total: result.total,
        hasMore: result.hasMore,
        page: Math.floor(queryOptions.offset / queryOptions.limit) + 1,
        pageSize: queryOptions.limit,
      },
    });
  } catch (error: any) {
    console.error('Audit log query error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to query audit logs',
    });
  }
});

/**
 * @swagger
 * /api/audit-logs/statistics:
 *   get:
 *     summary: Get audit log statistics
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to include in statistics
 */
router.get('/statistics', authenticate, queryLimiter, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    if (!soc2AuditLogger.isReady()) {
      await soc2AuditLogger.initialize();
    }

    const statistics = await soc2AuditLogger.getStatistics(days);

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error: any) {
    console.error('Audit statistics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get audit statistics',
    });
  }
});

/**
 * @swagger
 * /api/audit-logs/{id}:
 *   get:
 *     summary: Get a single audit log entry
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Audit log entry ID
 */
router.get('/:id', authenticate, queryLimiter, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!soc2AuditLogger.isReady()) {
      await soc2AuditLogger.initialize();
    }

    const result = await soc2AuditLogger.query({ limit: 1, offset: parseInt(id as string) - 1 });
    const log = result.logs[0];

    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Audit log entry not found',
      });
    }

    res.json({
      success: true,
      data: log,
    });
  } catch (error: any) {
    console.error('Audit log fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch audit log entry',
    });
  }
});

/**
 * @swagger
 * /api/audit-logs/resource/{resourceType}/{resourceId}:
 *   get:
 *     summary: Get audit history for a specific resource
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resourceType
 *         required: true
 *         schema:
 *           type: string
 *         description: Resource type (e.g., property, compliance_rule)
 *       - in: path
 *         name: resourceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Resource ID
 */
router.get('/resource/:resourceType/:resourceId', authenticate, queryLimiter, async (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!soc2AuditLogger.isReady()) {
      await soc2AuditLogger.initialize();
    }

    const result = await soc2AuditLogger.query({
      resourceTypes: [resourceType],
      resourceId,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result.logs,
    });
  } catch (error: any) {
    console.error('Resource history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch resource history',
    });
  }
});

// =============================================================================
// CHAIN VERIFICATION (Admin Only)
// =============================================================================

/**
 * @swagger
 * /api/audit-logs/verify-chain:
 *   post:
 *     summary: Verify the integrity of the audit log chain
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fromSequence:
 *                 type: integer
 *                 description: Start verification from this sequence number
 */
router.post('/verify-chain', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { fromSequence } = req.body;

    if (!soc2AuditLogger.isReady()) {
      await soc2AuditLogger.initialize();
    }

    const result = await soc2AuditLogger.verifyChain(fromSequence);

    // Log the verification
    soc2AuditLogger.log({
      eventType: 'audit.chain_verification',
      eventCategory: 'security',
      severity: result.valid ? 'info' : 'warning',
      actor: {
        type: 'user',
        id: (req as any).user?.id,
        name: (req as any).user?.email,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      resource: { type: 'audit_log', name: 'Chain Verification' },
      action: 'verify_chain',
      outcome: result.valid ? 'success' : 'failure',
      details: {
        entriesChecked: result.entriesChecked,
        errorsFound: result.errors.length,
      },
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Chain verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify audit chain',
    });
  }
});

// =============================================================================
// EXPORT (Admin Only)
// =============================================================================

/**
 * @swagger
 * /api/audit-logs/export:
 *   post:
 *     summary: Export audit logs for compliance audit
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               eventTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *               resourceTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *               includeDetails:
 *                 type: boolean
 *                 default: true
 *               format:
 *                 type: string
 *                 enum: [json, csv]
 *                 default: json
 */
router.post('/export', authenticate, authorize('admin'), exportLimiter, async (req: Request, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      eventTypes,
      resourceTypes,
      includeDetails = true,
      format = 'json',
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
      });
    }

    if (!soc2AuditLogger.isReady()) {
      await soc2AuditLogger.initialize();
    }

    const result = await soc2AuditLogger.exportForAudit(
      new Date(startDate),
      new Date(endDate),
      {
        eventTypes,
        resourceTypes,
        includeDetails,
        format: format as 'json' | 'csv',
      }
    );

    // Set appropriate headers for download
    const filename = `audit-export-${result.exportId}.${format}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(result.data);
    }

    // JSON format
    res.json({
      success: true,
      data: {
        exportId: result.exportId,
        count: result.count,
        chainValid: result.chainValid,
        exportedAt: result.exportedAt,
        logs: result.data,
      },
    });
  } catch (error: any) {
    console.error('Audit export error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export audit logs',
    });
  }
});

// =============================================================================
// RETENTION MANAGEMENT (Admin Only)
// =============================================================================

/**
 * @swagger
 * /api/audit-logs/retention/cleanup:
 *   post:
 *     summary: Clean up expired audit logs
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 */
router.post('/retention/cleanup', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    if (!soc2AuditLogger.isReady()) {
      await soc2AuditLogger.initialize();
    }

    const deletedCount = await soc2AuditLogger.cleanupExpired();

    res.json({
      success: true,
      data: {
        deletedCount,
        message: `Cleaned up ${deletedCount} expired audit log entries`,
      },
    });
  } catch (error: any) {
    console.error('Retention cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cleanup expired logs',
    });
  }
});

/**
 * @swagger
 * /api/audit-logs/retention/info:
 *   get:
 *     summary: Get retention policy information
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 */
router.get('/retention/info', authenticate, async (req: Request, res: Response) => {
  try {
    const retentionYears = parseInt(process.env.AUDIT_RETENTION_YEARS || '7');

    if (!soc2AuditLogger.isReady()) {
      await soc2AuditLogger.initialize();
    }

    const statistics = await soc2AuditLogger.getStatistics(365);

    res.json({
      success: true,
      data: {
        retentionYears,
        totalEntries: statistics.totalEntries,
        oldestEntry: statistics.oldestEntry,
        newestEntry: statistics.newestEntry,
      },
    });
  } catch (error: any) {
    console.error('Retention info error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get retention info',
    });
  }
});

// =============================================================================
// FILTER OPTIONS
// =============================================================================

/**
 * @swagger
 * /api/audit-logs/filter-options:
 *   get:
 *     summary: Get available filter options for audit logs
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 */
router.get('/filter-options', authenticate, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        eventCategories: ['access', 'modification', 'verification', 'decision', 'system', 'security'],
        severities: ['debug', 'info', 'warning', 'error', 'critical'],
        actorTypes: ['user', 'system', 'api', 'automation', 'external'],
        outcomes: ['success', 'failure', 'partial', 'pending'],
      },
    });
  } catch (error: any) {
    console.error('Filter options error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get filter options',
    });
  }
});

export default router;
