/**
 * Broker MSA Routes
 *
 * API endpoints for MSA generation, signing, and fee tracking.
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { brokerMSAService } from '../services/BrokerMSAService';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limiting
const msaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many requests.' },
});

router.use(authenticate);
router.use(msaLimiter);

/**
 * @swagger
 * tags:
 *   name: MSA
 *   description: Master Service Agreement management
 */

/**
 * @swagger
 * /api/msa/generate:
 *   post:
 *     summary: Generate MSA for a deal
 *     tags: [MSA]
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      propertyId,
      dealId,
      wholesalerId,
      brokerId,
      feeStructure,
      clauses,
    } = req.body;

    if (!propertyId || !dealId || !wholesalerId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: propertyId, dealId, wholesalerId',
      });
    }

    const msa = await brokerMSAService.generateMSA({
      propertyId,
      dealId,
      wholesalerId,
      brokerId,
      feeStructure,
      clauses,
    });

    res.status(201).json({
      success: true,
      data: msa,
      message: 'MSA generated successfully',
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
 * /api/msa/{id}:
 *   get:
 *     summary: Get MSA details
 *     tags: [MSA]
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const msa = await brokerMSAService.getMSAWithDetails(req.params.id);
    if (!msa) {
      return res.status(404).json({ success: false, error: 'MSA not found' });
    }

    res.json({ success: true, data: msa });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/msa/deal/{dealId}:
 *   get:
 *     summary: Get MSA by deal ID
 *     tags: [MSA]
 */
router.get('/deal/:dealId', async (req: Request, res: Response) => {
  try {
    const msa = await brokerMSAService.getMSAByDealId(req.params.dealId);
    if (!msa) {
      return res.status(404).json({ success: false, error: 'MSA not found for this deal' });
    }

    res.json({ success: true, data: msa });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/msa/{id}/send:
 *   post:
 *     summary: Send MSA for signatures
 *     tags: [MSA]
 */
router.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const { sendEmail, expireInDays } = req.body;

    const msa = await brokerMSAService.sendForSignature({
      msaId: req.params.id,
      sendEmail: sendEmail !== false,
      expireInDays: expireInDays || 7,
    });

    res.json({
      success: true,
      data: msa,
      message: 'MSA sent for signatures',
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
 * /api/msa/{id}/status:
 *   get:
 *     summary: Get MSA signature status
 *     tags: [MSA]
 */
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const status = await brokerMSAService.getSignatureStatus(req.params.id);

    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/msa/{id}/fees:
 *   get:
 *     summary: Get MSA fees
 *     tags: [MSA]
 */
router.get('/:id/fees', async (req: Request, res: Response) => {
  try {
    const fees = await brokerMSAService.getMSAFees(req.params.id);

    res.json({
      success: true,
      data: fees,
      count: fees.length,
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
 * /api/msa/{id}/fees/summary:
 *   get:
 *     summary: Get fee summary for closing statement
 *     tags: [MSA]
 */
router.get('/:id/fees/summary', async (req: Request, res: Response) => {
  try {
    const summary = await brokerMSAService.getFeesSummaryForClosing(req.params.id);

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
 * /api/msa/fees/{feeId}:
 *   put:
 *     summary: Update fee status
 *     tags: [MSA]
 */
router.put('/fees/:feeId', async (req: Request, res: Response) => {
  try {
    const { status, ...details } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    const fee = await brokerMSAService.updateFeeStatus(req.params.feeId, status, details);

    res.json({ success: true, data: fee });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/msa/{id}/fees/closing:
 *   post:
 *     summary: Mark all fees as due at closing
 *     tags: [MSA]
 */
router.post('/:id/fees/closing', async (req: Request, res: Response) => {
  try {
    const { closingDate } = req.body;

    if (!closingDate) {
      return res.status(400).json({
        success: false,
        error: 'Closing date is required',
      });
    }

    const fees = await brokerMSAService.markFeesDueAtClosing(
      req.params.id,
      new Date(closingDate)
    );

    res.json({
      success: true,
      data: fees,
      message: 'Fees marked as due at closing',
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
 * /api/msa/{id}/fee-structure:
 *   put:
 *     summary: Update MSA fee structure (draft only)
 *     tags: [MSA]
 */
router.put('/:id/fee-structure', async (req: Request, res: Response) => {
  try {
    const { brokerFee, tcFee, wholesalerAssignmentFee } = req.body;

    const msa = await brokerMSAService.updateFeeStructure(req.params.id, {
      brokerFee,
      tcFee,
      wholesalerAssignmentFee,
    });

    res.json({ success: true, data: msa });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/msa/{id}/terminate:
 *   post:
 *     summary: Terminate an MSA
 *     tags: [MSA]
 */
router.post('/:id/terminate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Termination reason is required',
      });
    }

    const msa = await brokerMSAService.terminateMSA(req.params.id, userId, reason);

    res.json({
      success: true,
      data: msa,
      message: 'MSA terminated',
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
 * /api/msa/{id}/complete:
 *   post:
 *     summary: Mark MSA as complete (deal closed)
 *     tags: [MSA]
 */
router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const msa = await brokerMSAService.completeMSA(req.params.id);

    res.json({
      success: true,
      data: msa,
      message: 'MSA completed',
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
 * /api/msa/wholesaler:
 *   get:
 *     summary: Get MSAs for current wholesaler
 *     tags: [MSA]
 */
router.get('/wholesaler', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { status } = req.query;
    const statusArray = status ? (status as string).split(',') : undefined;

    const msas = await brokerMSAService.getMSAsForWholesaler(userId, statusArray as any);

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

export default router;
