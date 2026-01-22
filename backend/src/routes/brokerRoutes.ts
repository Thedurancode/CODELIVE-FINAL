/**
 * Broker Routes
 *
 * API endpoints for broker application, management, and supervision.
 *
 * SECURITY:
 * - Most routes require authentication
 * - Broker-specific routes require broker role
 * - Admin routes require admin role
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { brokerService } from '../services/BrokerService';
import { brokerMSAService } from '../services/BrokerMSAService';
import { brokerCommunicationService } from '../services/BrokerCommunicationService';
import { dealApprovalService } from '../services/DealApprovalService';
import { authenticate } from '../middleware/auth';
import Property from '../models/Property';

const router = Router();

// Rate limiting
const brokerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: 'Too many requests.' },
});

// Middleware to check if user is a broker
const requireBroker = async (req: Request, res: Response, next: Function) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const profile = await brokerService.getBrokerByUserId(userId);
  if (!profile || profile.status !== 'approved') {
    return res.status(403).json({ success: false, error: 'Broker access required' });
  }

  // Attach broker profile to request
  (req as any).brokerProfile = profile;
  next();
};

// Middleware to check if user is admin
const requireAdmin = (req: Request, res: Response, next: Function) => {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

router.use(brokerLimiter);

/**
 * @swagger
 * tags:
 *   name: Broker
 *   description: Broker management and supervision
 */

// ============================================================================
// PUBLIC/AUTH ROUTES
// ============================================================================

/**
 * @swagger
 * /api/broker/apply:
 *   post:
 *     summary: Submit broker application
 *     tags: [Broker]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - licenseNumber
 *               - licenseState
 *               - licenseExpirationDate
 *               - brokerageCompany
 *             properties:
 *               licenseNumber:
 *                 type: string
 *               licenseState:
 *                 type: string
 *               licenseExpirationDate:
 *                 type: string
 *                 format: date
 *               brokerageCompany:
 *                 type: string
 *               brokerageAddress:
 *                 type: string
 *               brokeragePhone:
 *                 type: string
 *               brokerageEmail:
 *                 type: string
 */
router.post('/apply', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const {
      licenseNumber,
      licenseState,
      licenseExpirationDate,
      brokerageCompany,
      brokerageAddress,
      brokeragePhone,
      brokerageEmail,
      eoInsurancePolicy,
      eoExpirationDate,
    } = req.body;

    if (!licenseNumber || !licenseState || !licenseExpirationDate || !brokerageCompany) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    const profile = await brokerService.applyAsBroker({
      userId,
      licenseNumber,
      licenseState,
      licenseExpirationDate: new Date(licenseExpirationDate),
      brokerageCompany,
      brokerageAddress,
      brokeragePhone,
      brokerageEmail,
      eoInsurancePolicy,
      eoExpirationDate: eoExpirationDate ? new Date(eoExpirationDate) : undefined,
    });

    res.status(201).json({
      success: true,
      data: profile,
      message: 'Broker application submitted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/application/{id}:
 *   get:
 *     summary: Get application status
 *     tags: [Broker]
 */
router.get('/application/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const application = await brokerService.getApplication(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    res.json({ success: true, data: application });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// BROKER ROUTES
// ============================================================================

/**
 * @swagger
 * /api/broker/profile:
 *   get:
 *     summary: Get own broker profile
 *     tags: [Broker]
 */
router.get('/profile', authenticate, requireBroker, async (req: Request, res: Response) => {
  try {
    const profile = (req as any).brokerProfile;
    const stats = await brokerService.getBrokerStats(profile.id);

    res.json({
      success: true,
      data: {
        ...profile.toJSON(),
        stats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/deals:
 *   get:
 *     summary: Get broker's assigned deals
 *     tags: [Broker]
 */
router.get('/deals', authenticate, requireBroker, async (req: Request, res: Response) => {
  try {
    const profile = (req as any).brokerProfile;
    const { status } = req.query;

    const statusArray = status ? (status as string).split(',') : undefined;
    const msas = await brokerMSAService.getMSAsForBroker(profile.id, statusArray as any);

    res.json({
      success: true,
      data: msas,
      count: msas.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/deals/{dealId}:
 *   get:
 *     summary: Get deal details
 *     tags: [Broker]
 */
router.get('/deals/:dealId', authenticate, requireBroker, async (req: Request, res: Response) => {
  try {
    const msa = await brokerMSAService.getMSAByDealId(req.params.dealId);
    if (!msa) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }

    const communications = await brokerCommunicationService.getDealCommunications(req.params.dealId);
    const fees = await brokerMSAService.getMSAFees(msa.id);

    res.json({
      success: true,
      data: {
        msa,
        communications,
        fees,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/communications:
 *   get:
 *     summary: Get broker's communication queue
 *     tags: [Broker]
 */
router.get('/communications', authenticate, requireBroker, async (req: Request, res: Response) => {
  try {
    const profile = (req as any).brokerProfile;
    const queue = await brokerCommunicationService.getBrokerReviewQueue(profile.id);

    res.json({
      success: true,
      data: queue,
      count: queue.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/communications/{id}/review:
 *   put:
 *     summary: Mark communication as reviewed
 *     tags: [Broker]
 */
router.put(
  '/communications/:id/review',
  authenticate,
  requireBroker,
  async (req: Request, res: Response) => {
    try {
      const profile = (req as any).brokerProfile;
      const { approved, notes } = req.body;

      const communication = await brokerCommunicationService.reviewCommunication(
        req.params.id,
        profile.id,
        approved !== false,
        notes
      );

      res.json({ success: true, data: communication });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/communications/{id}/override:
 *   put:
 *     summary: Override communication content
 *     tags: [Broker]
 */
router.put(
  '/communications/:id/override',
  authenticate,
  requireBroker,
  async (req: Request, res: Response) => {
    try {
      const profile = (req as any).brokerProfile;
      const { newContent, reason } = req.body;

      if (!newContent || !reason) {
        return res.status(400).json({
          success: false,
          error: 'New content and reason are required',
        });
      }

      const communication = await brokerCommunicationService.overrideCommunication(
        req.params.id,
        profile.id,
        newContent,
        reason
      );

      res.json({ success: true, data: communication });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/communications/{id}/block:
 *   put:
 *     summary: Block a communication
 *     tags: [Broker]
 */
router.put(
  '/communications/:id/block',
  authenticate,
  requireBroker,
  async (req: Request, res: Response) => {
    try {
      const profile = (req as any).brokerProfile;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'Block reason is required',
        });
      }

      const communication = await brokerCommunicationService.blockCommunication(
        req.params.id,
        profile.id,
        reason
      );

      res.json({ success: true, data: communication });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/supervision/summary:
 *   get:
 *     summary: Get supervision summary
 *     tags: [Broker]
 */
router.get('/supervision/summary', authenticate, requireBroker, async (req: Request, res: Response) => {
  try {
    const profile = (req as any).brokerProfile;
    const summary = await brokerCommunicationService.getBrokerSupervisionSummary(profile.id);

    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/deals/{dealId}/audit:
 *   get:
 *     summary: Get deal audit log
 *     tags: [Broker]
 */
router.get('/deals/:dealId/audit', authenticate, requireBroker, async (req: Request, res: Response) => {
  try {
    const auditLog = await brokerCommunicationService.getAuditLog(req.params.dealId);

    res.json({
      success: true,
      data: auditLog,
      count: auditLog.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// DEAL APPROVAL ROUTES
// ============================================================================

/**
 * @swagger
 * /api/broker/approvals:
 *   get:
 *     summary: Get deals pending broker approval
 *     tags: [Broker]
 *     responses:
 *       200:
 *         description: List of pending deals
 */
router.get('/approvals', authenticate, requireBroker, async (req: Request, res: Response) => {
  try {
    const profile = (req as any).brokerProfile;
    const deals = await dealApprovalService.getPendingApprovals(profile.id);

    res.json({
      success: true,
      data: deals,
      count: deals.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/approvals/stats:
 *   get:
 *     summary: Get approval statistics
 *     tags: [Broker]
 */
router.get('/approvals/stats', authenticate, requireBroker, async (req: Request, res: Response) => {
  try {
    const profile = (req as any).brokerProfile;
    const stats = await dealApprovalService.getBrokerApprovalStats(profile.id);

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/approvals/{propertyId}/approve:
 *   put:
 *     summary: Approve a deal (auto-goes live)
 *     tags: [Broker]
 *     parameters:
 *       - in: path
 *         name: propertyId
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
 */
router.put(
  '/approvals/:propertyId/approve',
  authenticate,
  requireBroker,
  async (req: Request, res: Response) => {
    try {
      const profile = (req as any).brokerProfile;
      const { propertyId } = req.params;
      const { notes } = req.body;

      const property = await dealApprovalService.approveDeal(
        parseInt(propertyId),
        profile.id,
        notes
      );

      res.json({
        success: true,
        data: property,
        message: 'Deal approved and is now live in marketplace',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/approvals/{propertyId}/reject:
 *   put:
 *     summary: Reject a deal
 *     tags: [Broker]
 *     parameters:
 *       - in: path
 *         name: propertyId
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 */
router.put(
  '/approvals/:propertyId/reject',
  authenticate,
  requireBroker,
  async (req: Request, res: Response) => {
    try {
      const profile = (req as any).brokerProfile;
      const { propertyId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'Rejection reason is required',
        });
      }

      const property = await dealApprovalService.rejectDeal(
        parseInt(propertyId),
        profile.id,
        reason
      );

      res.json({
        success: true,
        data: property,
        message: 'Deal rejected',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/approvals/{propertyId}/request-changes:
 *   put:
 *     summary: Request changes before approval
 *     tags: [Broker]
 *     parameters:
 *       - in: path
 *         name: propertyId
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
 *               - changes
 *             properties:
 *               changes:
 *                 type: string
 */
router.put(
  '/approvals/:propertyId/request-changes',
  authenticate,
  requireBroker,
  async (req: Request, res: Response) => {
    try {
      const profile = (req as any).brokerProfile;
      const { propertyId } = req.params;
      const { changes } = req.body;

      if (!changes) {
        return res.status(400).json({
          success: false,
          error: 'Changes description is required',
        });
      }

      const property = await dealApprovalService.requestChanges(
        parseInt(propertyId),
        profile.id,
        changes
      );

      res.json({
        success: true,
        data: property,
        message: 'Changes requested',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/approvals/{propertyId}/history:
 *   get:
 *     summary: Get approval audit trail
 *     tags: [Broker]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 */
router.get(
  '/approvals/:propertyId/history',
  authenticate,
  requireBroker,
  async (req: Request, res: Response) => {
    try {
      const { propertyId } = req.params;
      const history = await dealApprovalService.getApprovalHistory(parseInt(propertyId));

      res.json({
        success: true,
        data: history,
        count: history.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * @swagger
 * /api/broker/admin/applications:
 *   get:
 *     summary: Get pending broker applications (admin)
 *     tags: [Broker]
 */
router.get('/admin/applications', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const applications = await brokerService.getPendingApplications();

    res.json({
      success: true,
      data: applications,
      count: applications.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/admin/applications/{id}/approve:
 *   put:
 *     summary: Approve broker application (admin)
 *     tags: [Broker]
 */
router.put(
  '/admin/applications/:id/approve',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const adminUserId = req.user?.id;
      if (!adminUserId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const profile = await brokerService.approveApplication(req.params.id, adminUserId);

      res.json({
        success: true,
        data: profile,
        message: 'Broker application approved',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/admin/applications/{id}/reject:
 *   put:
 *     summary: Reject broker application (admin)
 *     tags: [Broker]
 */
router.put(
  '/admin/applications/:id/reject',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const adminUserId = req.user?.id;
      if (!adminUserId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Rejection reason is required' });
      }

      const profile = await brokerService.rejectApplication(req.params.id, adminUserId, reason);

      res.json({
        success: true,
        data: profile,
        message: 'Broker application rejected',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/admin/brokers:
 *   get:
 *     summary: Get all approved brokers (admin)
 *     tags: [Broker]
 */
router.get('/admin/brokers', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const brokers = await brokerService.getAllApprovedBrokers();

    res.json({
      success: true,
      data: brokers,
      count: brokers.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/admin/brokers/{id}:
 *   put:
 *     summary: Update broker information (admin)
 *     tags: [Broker]
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
 *               licenseNumber:
 *                 type: string
 *               licenseState:
 *                 type: string
 *               licensedStates:
 *                 type: array
 *                 items:
 *                   type: string
 *               licenseExpirationDate:
 *                 type: string
 *                 format: date
 *               brokerageCompany:
 *                 type: string
 *               brokerageAddress:
 *                 type: string
 *               brokeragePhone:
 *                 type: string
 *               brokerageEmail:
 *                 type: string
 *               eoInsurancePolicy:
 *                 type: string
 *               eoExpirationDate:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 */
router.put('/admin/brokers/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const broker = await brokerService.updateBroker(id, updateData);

    res.json({
      success: true,
      data: broker,
      message: 'Broker updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/broker/admin/brokers/{id}/suspend:
 *   put:
 *     summary: Suspend a broker (admin)
 *     tags: [Broker]
 */
router.put(
  '/admin/brokers/:id/suspend',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const adminUserId = req.user?.id;
      if (!adminUserId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Suspension reason is required' });
      }

      const profile = await brokerService.suspendBroker(req.params.id, adminUserId, reason);

      res.json({
        success: true,
        data: profile,
        message: 'Broker suspended',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/admin/expiring-licenses:
 *   get:
 *     summary: Get brokers with expiring licenses (admin)
 *     tags: [Broker]
 */
router.get('/admin/expiring-licenses', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const brokers = await brokerService.getBrokersWithExpiringLicenses();

    res.json({
      success: true,
      data: brokers,
      count: brokers.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// ADMIN DEAL APPROVAL BYPASS
// ============================================================================

/**
 * @swagger
 * /api/broker/admin/deals/pending:
 *   get:
 *     summary: Admin - Get all deals pending approval
 *     tags: [Broker]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending deals
 */
router.get(
  '/admin/deals/pending',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const deals = await Property.findAll({
        where: { approvalStatus: 'pending_broker_approval' },
        order: [['createdAt', 'DESC']],
      });

      res.json({ success: true, data: deals });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/admin/deals/{id}/reject:
 *   post:
 *     summary: Admin - Reject a deal
 *     tags: [Broker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Deal rejected
 */
router.post(
  '/admin/deals/:id/reject',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const adminId = req.user?.id;
      const { reason } = req.body;

      if (!adminId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (!reason || !reason.trim()) {
        return res.status(400).json({ success: false, error: 'Rejection reason is required' });
      }

      const property = await Property.findByPk(propertyId);
      if (!property) {
        return res.status(404).json({ success: false, error: 'Property not found' });
      }

      await property.update({
        approvalStatus: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: adminId,
        rejectionReason: reason.trim(),
        processingState: 'rejected',
        processingStateUpdatedAt: new Date(),
      });

      res.json({
        success: true,
        message: 'Deal rejected',
        data: property,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/admin/deals/{id}/set-live:
 *   post:
 *     summary: Admin bypass - Set a deal to live status (bypasses broker approval)
 *     tags: [Broker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Deal set to live
 */
router.post(
  '/admin/deals/:id/set-live',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const adminId = req.user?.id;

      if (!adminId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const property = await dealApprovalService.adminSetLive(propertyId, adminId);

      res.json({
        success: true,
        data: property,
        message: `Deal ${propertyId} is now LIVE`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/broker/admin/deals/bulk-set-live:
 *   post:
 *     summary: Admin bypass - Set multiple deals to live status
 *     tags: [Broker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               propertyIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Deals set to live
 */
router.post(
  '/admin/deals/bulk-set-live',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { propertyIds } = req.body;
      const adminId = req.user?.id;

      if (!adminId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
        return res.status(400).json({ success: false, error: 'propertyIds array is required' });
      }

      const result = await dealApprovalService.adminBulkSetLive(propertyIds, adminId);

      res.json({
        success: true,
        data: result,
        message: `Set ${result.success} deals to LIVE (${result.failed} failed)`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

export default router;
