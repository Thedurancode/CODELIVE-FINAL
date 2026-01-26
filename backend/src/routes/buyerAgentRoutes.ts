/**
 * Buyer Agent Routes
 *
 * AI-powered chat interface for buyers.
 * Unlike the admin agent, this has limited tools focused on:
 * - Searching and viewing properties
 * - Making offers
 * - Asking questions (escalated to sellers when needed)
 *
 * SECURITY:
 * - All endpoints require authentication
 * - Rate limited to prevent abuse
 * - Buyer ID validated from JWT token
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { buyerAgentService } from '../services/BuyerAgentService';
import { authenticate } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ============================================================================
// RATE LIMITERS
// ============================================================================

// Rate limit for chat endpoints
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 messages per minute
  message: { success: false, error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limit for streaming
const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 streaming requests per minute
  message: { success: false, error: 'Too many streaming requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * tags:
 *   name: Buyer Agent
 *   description: AI-powered assistant for buyers
 */

/**
 * @swagger
 * /api/buyer/chat:
 *   post:
 *     summary: Chat with the buyer agent
 *     description: |
 *       Send a message to the AI buyer assistant. The agent can help with:
 *       - Searching for properties
 *       - Viewing property details and scores
 *       - Making offers
 *       - Asking questions about properties (escalated to sellers)
 *
 *       When the agent can't answer a question from available data, it will
 *       automatically contact the seller and notify you when they respond.
 *     tags: [Buyer Agent]
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
 *                 description: The message to send
 *                 example: "Show me 3 bedroom houses in Texas under $250,000"
 *               sessionId:
 *                 type: string
 *                 description: Session ID for conversation continuity
 *     responses:
 *       200:
 *         description: Agent response
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
 *                     response:
 *                       type: string
 *                     sessionId:
 *                       type: string
 */
router.post('/chat', authenticate, chatLimiter, async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;
    const buyerId = req.user!.id;

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

    // Use provided session ID or generate new one
    const session = sessionId || `buyer-${uuidv4()}`;

    // Check if agent is ready
    if (!buyerAgentService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Buyer Agent not available. Please try again later.',
      });
    }

    // Get response from agent
    const response = await buyerAgentService.chat(session, message, buyerId);

    res.json({
      success: true,
      data: {
        response,
        sessionId: session,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Buyer agent chat error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/buyer/chat/stream:
 *   post:
 *     summary: Chat with streaming response
 *     description: Same as /chat but with Server-Sent Events for real-time response streaming
 *     tags: [Buyer Agent]
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
 *               sessionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Streaming response (text/event-stream)
 */
router.post('/chat/stream', authenticate, streamLimiter, async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;
    const buyerId = req.user!.id;

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

    const session = sessionId || `buyer-${uuidv4()}`;

    if (!buyerAgentService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Buyer Agent not available.',
      });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', session);
    res.flushHeaders();

    // Stream response
    for await (const chunk of buyerAgentService.chatStream(session, message, buyerId, true)) {
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    console.error('Buyer agent stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      res.end();
    }
  }
});

/**
 * @swagger
 * /api/buyer/chat/{sessionId}:
 *   delete:
 *     summary: Clear conversation history
 *     description: Clear the conversation history for a session
 *     tags: [Buyer Agent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: History cleared
 */
router.delete('/chat/:sessionId', authenticate, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    await buyerAgentService.clearHistory(sessionId);

    res.json({
      success: true,
      message: 'Conversation history cleared',
    });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/buyer/chat/{sessionId}/history:
 *   get:
 *     summary: Get conversation history
 *     description: Get the conversation history for a session
 *     tags: [Buyer Agent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation history
 */
router.get('/chat/:sessionId/history', authenticate, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const history = await buyerAgentService.getHistory(sessionId);

    res.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/buyer/status:
 *   get:
 *     summary: Get buyer agent status
 *     description: Check if the buyer agent is ready and get tool count
 *     tags: [Buyer Agent]
 *     responses:
 *       200:
 *         description: Agent status
 */
router.get('/status', async (req: Request, res: Response) => {
  const status = buyerAgentService.getStatus();

  res.json({
    success: true,
    data: status,
  });
});

/**
 * @swagger
 * /api/buyer/examples:
 *   get:
 *     summary: Get example prompts
 *     description: Get example prompts to help buyers get started
 *     tags: [Buyer Agent]
 *     responses:
 *       200:
 *         description: Example prompts by category
 */
router.get('/examples', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      search: [
        'Show me 3 bedroom houses in Texas under $200,000',
        'Find properties in Florida with at least 2 bathrooms',
        'What properties do you have in the Dallas area?',
      ],
      details: [
        'Tell me more about property ABC123',
        'What are the scores for this property?',
        'Show me similar properties to this one',
      ],
      offers: [
        "I'd like to make an offer of $180,000 on this property",
        'What offers have I submitted?',
        "What's the status of my offers?",
      ],
      questions: [
        'Why is the seller selling this property?',
        'Are there any known issues with the property?',
        'Is the seller flexible on closing date?',
        'What appliances are included?',
      ],
    },
  });
});

export default router;
