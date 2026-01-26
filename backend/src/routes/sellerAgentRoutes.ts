/**
 * Seller Agent Routes
 *
 * AI-powered chat interface for sellers and admins.
 * Helps manage buyer inquiries and respond to questions.
 *
 * SECURITY:
 * - All endpoints require authentication
 * - Requires admin, seller, or broker role
 * - Rate limited to prevent abuse
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { sellerAgentService } from '../services/SellerAgentService';
import { authenticate, authorize } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Roles that can use the seller agent
const SELLER_ROLES = ['admin', 'super_admin', 'seller', 'broker'];

// Rate limiters
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many requests. Please slow down.' },
});

const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many streaming requests.' },
});

/**
 * @swagger
 * tags:
 *   name: Seller Agent
 *   description: AI-powered assistant for sellers and admins
 */

/**
 * @swagger
 * /api/seller/chat:
 *   post:
 *     summary: Chat with the seller agent
 *     description: |
 *       Send a message to the AI seller assistant. The agent can help with:
 *       - Viewing pending buyer inquiries
 *       - Answering buyer questions
 *       - Managing property information
 *     tags: [Seller Agent]
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
 *                 example: "Show me pending inquiries"
 *               sessionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agent response
 *       403:
 *         description: Forbidden - requires seller/admin role
 */
router.post(
  '/chat',
  authenticate,
  authorize(...SELLER_ROLES),
  chatLimiter,
  async (req: Request, res: Response) => {
    try {
      const { message, sessionId } = req.body;
      const sellerId = req.user!.id;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Message is required',
        });
      }

      if (message.length > 5000) {
        return res.status(400).json({
          success: false,
          error: 'Message too long. Maximum 5,000 characters.',
        });
      }

      const session = sessionId || `seller-${uuidv4()}`;

      if (!sellerAgentService.isReady()) {
        return res.status(503).json({
          success: false,
          error: 'Seller Agent not available. Please try again later.',
        });
      }

      const response = await sellerAgentService.chat(session, message, sellerId);

      res.json({
        success: true,
        data: {
          response,
          sessionId: session,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Seller agent chat error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @swagger
 * /api/seller/chat/stream:
 *   post:
 *     summary: Chat with streaming response
 *     tags: [Seller Agent]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/chat/stream',
  authenticate,
  authorize(...SELLER_ROLES),
  streamLimiter,
  async (req: Request, res: Response) => {
    try {
      const { message, sessionId } = req.body;
      const sellerId = req.user!.id;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Message is required',
        });
      }

      const session = sessionId || `seller-${uuidv4()}`;

      if (!sellerAgentService.isReady()) {
        return res.status(503).json({
          success: false,
          error: 'Seller Agent not available.',
        });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Session-Id', session);
      res.flushHeaders();

      for await (const chunk of sellerAgentService.chatStream(session, message, sellerId, true)) {
        res.write(chunk);
      }

      res.end();
    } catch (error) {
      console.error('Seller agent stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        res.end();
      }
    }
  }
);

/**
 * @swagger
 * /api/seller/chat/{sessionId}:
 *   delete:
 *     summary: Clear conversation history
 *     tags: [Seller Agent]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/chat/:sessionId',
  authenticate,
  authorize(...SELLER_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      await sellerAgentService.clearHistory(sessionId);

      res.json({
        success: true,
        message: 'Conversation history cleared',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/seller/chat/{sessionId}/history:
 *   get:
 *     summary: Get conversation history
 *     tags: [Seller Agent]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/chat/:sessionId/history',
  authenticate,
  authorize(...SELLER_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const history = await sellerAgentService.getHistory(sessionId);

      res.json({
        success: true,
        data: history,
        count: history.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/seller/status:
 *   get:
 *     summary: Get seller agent status
 *     tags: [Seller Agent]
 */
router.get('/status', async (req: Request, res: Response) => {
  const status = sellerAgentService.getStatus();
  res.json({ success: true, data: status });
});

/**
 * @swagger
 * /api/seller/examples:
 *   get:
 *     summary: Get example prompts for sellers
 *     tags: [Seller Agent]
 */
router.get('/examples', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      inquiries: [
        'Show me all pending inquiries',
        'What urgent inquiries need attention?',
        'Show inquiries about pricing',
        'Get details for inquiry #123',
      ],
      answering: [
        'Answer inquiry #123 with: The seller is motivated and flexible on closing date.',
        'Respond to the latest inquiry about property condition',
      ],
      properties: [
        'Show my properties in Texas',
        'Get details for property #456',
        'How many inquiries does property #789 have?',
      ],
      stats: [
        'What are my inquiry statistics?',
        'How many inquiries are pending?',
        "What's the average response time?",
      ],
    },
  });
});

export default router;
