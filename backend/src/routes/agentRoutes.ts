/**
 * AI Agent Chat Routes
 *
 * Provides conversational interface to all Dispotree features
 *
 * SECURITY:
 * - All chat endpoints require authentication
 * - Rate limited to prevent abuse
 * - User ID validated from JWT token
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { agentService } from '../services/agentService';
import { authenticate, optionalAuth } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// =============================================================================
// RATE LIMITERS
// =============================================================================

// Rate limit for chat endpoints (AI calls are expensive)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 messages per minute per IP
  message: { success: false, error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for streaming (more resource intensive)
const streamLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 streaming requests per minute
  message: { success: false, error: 'Too many streaming requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * tags:
 *   name: Agent
 *   description: AI-powered conversational agent for Dispotree
 */

/**
 * @swagger
 * /api/agent/chat:
 *   post:
 *     summary: Chat with the AI agent
 *     description: Send a message to the AI agent and get a response. The agent can search properties, analyze deals, submit to auction sites, and more. Optionally pass userId to enable long-term memory across sessions.
 *     tags: [Agent]
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
 *                 description: The message to send to the agent
 *                 example: "Find me 3 bedroom properties in Texas under $300,000"
 *               sessionId:
 *                 type: string
 *                 description: Session ID for conversation continuity (auto-generated if not provided)
 *                 example: "session-abc123"
 *               userId:
 *                 type: string
 *                 description: User ID to enable long-term memory. When provided, the agent remembers user preferences and past decisions across sessions.
 *                 example: "user-456"
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
 *                       description: The agent's response
 *                     sessionId:
 *                       type: string
 *                       description: Session ID for follow-up messages
 *                 timestamp:
 *                   type: string
 */
router.post('/chat', authenticate, chatLimiter, async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Validate message length to prevent abuse
    if (message.length > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Message too long. Maximum 10,000 characters.',
        timestamp: new Date().toISOString(),
      });
    }

    // Use provided session ID or generate new one
    const session = sessionId || `session-${uuidv4()}`;

    // SECURITY: Always use authenticated user ID, never from request body
    const user = req.user!.id;

    // Check if agent is ready
    if (!agentService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'AI Agent not available. Please set OPENAI_API_KEY.',
        timestamp: new Date().toISOString(),
      });
    }

    // Get response from agent (with optional userId for long-term memory)
    const response = await agentService.chat(session, message, user, req.user!.name);

    res.json({
      success: true,
      data: {
        response,
        sessionId: session,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Agent chat error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/agent/chat/stream:
 *   post:
 *     summary: Stream chat with the AI agent
 *     description: Send a message to the AI agent and receive a streaming response. Compatible with Vercel AI SDK. Optionally pass userId to enable long-term memory.
 *     tags: [Agent]
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
 *                 description: The message to send to the agent
 *               sessionId:
 *                 type: string
 *                 description: Session ID for conversation continuity
 *               userId:
 *                 type: string
 *                 description: User ID to enable long-term memory across sessions
 *     responses:
 *       200:
 *         description: Streaming text response
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.post('/chat/stream', authenticate, streamLimiter, async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    // Validate message length
    if (message.length > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Message too long. Maximum 10,000 characters.',
      });
    }

    const session = sessionId || `session-${uuidv4()}`;
    // SECURITY: Always use authenticated user ID
    const user = req.user!.id;

    if (!agentService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'AI Agent not available. Please set OPENAI_API_KEY.',
      });
    }

    // Set headers for SSE / Vercel AI SDK format
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', session);

    // Stream the response (with optional userId for long-term memory)
    console.log('[agentRoutes] Streaming with userName:', req.user!.name, 'full user:', req.user);
    for await (const chunk of agentService.chatStream(session, message, true, user, req.user!.name)) {
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    console.error('Agent stream error:', error);
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
 * /api/agent/chat/{sessionId}:
 *   delete:
 *     summary: Clear conversation history
 *     description: Clear the conversation history for a specific session
 *     tags: [Agent]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The session ID to clear
 *     responses:
 *       200:
 *         description: History cleared
 */
router.delete('/chat/:sessionId', authenticate, async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  // SECURITY: Validate session ID format
  if (!sessionId || sessionId.length > 100) {
    return res.status(400).json({
      success: false,
      error: 'Invalid session ID',
      timestamp: new Date().toISOString(),
    });
  }

  await agentService.clearHistory(sessionId);

  res.json({
    success: true,
    message: `Conversation history cleared for session ${sessionId}`,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/agent/chat/{sessionId}/history:
 *   get:
 *     summary: Get conversation history
 *     description: Retrieve the full conversation history for a session
 *     tags: [Agent]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The session ID to get history for
 *     responses:
 *       200:
 *         description: Conversation history
 */
router.get('/chat/:sessionId/history', authenticate, async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  // SECURITY: Validate session ID format
  if (!sessionId || sessionId.length > 100) {
    return res.status(400).json({
      success: false,
      error: 'Invalid session ID',
      timestamp: new Date().toISOString(),
    });
  }

  const history = await agentService.getHistory(sessionId);

  res.json({
    success: true,
    data: {
      sessionId,
      messageCount: history.length,
      messages: history,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/agent/sessions:
 *   get:
 *     summary: List active sessions
 *     description: Get all active conversation sessions
 *     tags: [Agent]
 *     responses:
 *       200:
 *         description: List of session IDs
 */
router.get('/sessions', authenticate, async (req: Request, res: Response) => {
  const sessions = await agentService.getActiveSessions();

  res.json({
    success: true,
    data: {
      count: sessions.length,
      sessions,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/agent/status:
 *   get:
 *     summary: Get agent status
 *     description: Check if the AI agent is initialized and ready
 *     tags: [Agent]
 *     responses:
 *       200:
 *         description: Agent status
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
 *                     ready:
 *                       type: boolean
 *                     model:
 *                       type: string
 *                     tools:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.get('/status', (req: Request, res: Response) => {
  const ready = agentService.isReady();

  res.json({
    success: true,
    data: {
      ready,
      model: ready ? agentService.getModelName() : 'not initialized',
      provider: ready ? (process.env.OPENAI_API_KEY ? 'OpenAI' : 'OpenRouter') : 'none',
      toolCount: ready ? agentService.getToolCount() : 0,
      tools: ready ? [
        // Property Search & Query
        'search_properties',
        'get_property_details',
        'get_property_count',
        'get_recent_deals',
        'find_similar_properties',
        'compare_deals',
        'get_top_deals',
        // Property Creation
        'create_property',
        'import_from_url',
        // Deal Analysis
        'analyze_deal',
        'score_deal_against_buyboxes',
        // Buy Box Management
        'list_buyboxes',
        'create_buybox',
        // Auction Sites
        'list_auction_sites',
        'submit_property_to_site',
        // Market Insights
        'get_market_stats',
        // Web Scraping
        'scrape_website',
        'map_website',
        // Communication
        'send_deal_to_fund',
      ] : [],
      features: ready ? {
        persistentMemory: true,
        urlImport: true,
        dealComparison: true,
        buyBoxCreation: true,
        fundCommunication: true,
      } : {},
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/agent/health:
 *   get:
 *     summary: Get detailed health status for monitoring
 *     description: Returns comprehensive health metrics including circuit breaker state, request stats, token usage, and cache metrics. Useful for production monitoring and alerting.
 *     tags: [Agent]
 *     responses:
 *       200:
 *         description: Health status
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
 *                     ready:
 *                       type: boolean
 *                     circuitBreaker:
 *                       type: object
 *                       properties:
 *                         state:
 *                           type: string
 *                           enum: [closed, open, half-open]
 *                         failures:
 *                           type: number
 *                         lastFailure:
 *                           type: string
 *                           format: date-time
 *                     requests:
 *                       type: object
 *                       properties:
 *                         global:
 *                           type: number
 *                         sessions:
 *                           type: number
 *                         maxGlobal:
 *                           type: number
 *                     tokenUsage:
 *                       type: object
 *                       properties:
 *                         date:
 *                           type: string
 *                         inputTokens:
 *                           type: number
 *                         outputTokens:
 *                           type: number
 *                         totalCost:
 *                           type: number
 *                         remaining:
 *                           type: number
 *                         percentUsed:
 *                           type: number
 *                     cache:
 *                       type: object
 *                       properties:
 *                         conversations:
 *                           type: number
 *                         summaries:
 *                           type: number
 *                         maxSize:
 *                           type: number
 */
router.get('/health', (req: Request, res: Response) => {
  const health = agentService.getHealthStatus();

  // Determine overall status based on circuit breaker
  const status = health.circuitBreaker.state === 'open' ? 'degraded' :
                 health.circuitBreaker.state === 'half-open' ? 'recovering' :
                 health.tokenUsage.percentUsed > 90 ? 'warning' : 'healthy';

  res.json({
    success: true,
    data: {
      status,
      ...health,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/agent/health/reset-circuit-breaker:
 *   post:
 *     summary: Manually reset the circuit breaker
 *     description: Emergency endpoint to manually reset the circuit breaker if the LLM service has recovered. Requires authentication.
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Circuit breaker reset
 */
router.post('/health/reset-circuit-breaker', authenticate, (req: Request, res: Response) => {
  agentService.resetCircuitBreaker();

  res.json({
    success: true,
    message: 'Circuit breaker has been reset',
    data: agentService.getHealthStatus().circuitBreaker,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/agent/examples:
 *   get:
 *     summary: Get example prompts
 *     description: Get example prompts to help users understand what the agent can do
 *     tags: [Agent]
 *     responses:
 *       200:
 *         description: Example prompts
 */
router.get('/examples', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      categories: [
        {
          name: 'Property Search',
          examples: [
            'Find me 3 bedroom properties in Texas under $300,000',
            'Show me all properties in Miami',
            'What properties do we have in California?',
            'How many properties are in our database?',
            'Show me the 5 most recent deals',
          ],
        },
        {
          name: 'Deal Analysis',
          examples: [
            'Analyze this deal: 123 Main St, Dallas TX, asking $250,000',
            'What\'s the profit potential on a $200k property with ARV of $280k?',
            'Is this a good deal: 4 bed house in Houston for $180,000?',
            'Compare these properties: prop_123, prop_456, prop_789',
            'Find properties similar to prop_abc123',
          ],
        },
        {
          name: 'Top Deals & Matching',
          examples: [
            'What are the top 10 deals right now?',
            'Score this deal against our buy boxes: 3 bed in Austin for $275k',
            'Which hedge funds would be interested in a $400k property in Florida?',
            'Get me the highest scoring deals in Texas',
          ],
        },
        {
          name: 'Buy Box Management',
          examples: [
            'List all our buy boxes',
            'Create a buy box for Texas SFR under $300k, 3+ beds',
            'Create a new fund: Florida Focus, targeting FL properties $200k-$400k',
          ],
        },
        {
          name: 'Property Import',
          examples: [
            'Import this listing: https://www.zillow.com/...',
            'Create a new property: 456 Oak St, Miami FL 33101, $350,000, 4 bed 3 bath',
            'Scrape this website for property data: https://example.com/listing',
          ],
        },
        {
          name: 'Communication',
          examples: [
            'Send this deal to ABC Investments',
            'Email prop_123 to the Florida Focus fund',
            'What auction sites can we submit to?',
          ],
        },
        {
          name: 'Market Insights',
          examples: [
            'What are the average prices in Texas?',
            'Give me market stats for Virginia Beach',
            'Compare pricing in Miami vs Houston',
          ],
        },
        {
          name: 'Web Scraping',
          examples: [
            'Scrape this URL: https://www.redfin.com/...',
            'Map all the pages on this website',
            'What\'s the content on this page?',
          ],
        },
      ],
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/agent/v1/chat/completions:
 *   post:
 *     summary: OpenAI-compatible chat completions (for OpenWebUI)
 *     description: OpenAI-compatible endpoint for integration with OpenWebUI and other tools
 *     tags: [Agent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                     content:
 *                       type: string
 *               stream:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Chat completion response
 */
router.post('/v1/chat/completions', async (req: Request, res: Response) => {
  try {
    const { messages, stream = false } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Messages array is required',
          type: 'invalid_request_error',
        },
      });
    }

    if (!agentService.isReady()) {
      return res.status(503).json({
        error: {
          message: 'AI Agent not available',
          type: 'server_error',
        },
      });
    }

    // Get the last user message
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
    if (!lastUserMessage) {
      return res.status(400).json({
        error: {
          message: 'No user message found',
          type: 'invalid_request_error',
        },
      });
    }

    // Create a session ID based on the conversation
    const sessionId = `openwebui-${Date.now()}`;

    if (stream) {
      // Streaming response (SSE format for OpenAI compatibility)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const completionId = `chatcmpl-${uuidv4()}`;
      const created = Math.floor(Date.now() / 1000);

      for await (const chunk of agentService.chatStream(sessionId, lastUserMessage.content)) {
        const data = {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: agentService.getModelName(),
          choices: [{
            index: 0,
            delta: { content: chunk },
            finish_reason: null,
          }],
        };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }

      // Send final message
      const finalData = {
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model: agentService.getModelName(),
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop',
        }],
      };
      res.write(`data: ${JSON.stringify(finalData)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      const response = await agentService.chat(sessionId, lastUserMessage.content);

      res.json({
        id: `chatcmpl-${uuidv4()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: agentService.getModelName(),
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: response,
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      });
    }
  } catch (error) {
    console.error('OpenAI-compatible endpoint error:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: 'server_error',
      },
    });
  }
});

/**
 * @swagger
 * /api/agent/v1/models:
 *   get:
 *     summary: List available models (OpenAI-compatible)
 *     description: Returns the available models for OpenWebUI
 *     tags: [Agent]
 *     responses:
 *       200:
 *         description: List of models
 */
router.get('/v1/models', (req: Request, res: Response) => {
  res.json({
    object: 'list',
    data: [{
      id: 'dispotree-agent',
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'dispotree',
      permission: [],
      root: 'dispotree-agent',
      parent: null,
    }],
  });
});

export default router;
