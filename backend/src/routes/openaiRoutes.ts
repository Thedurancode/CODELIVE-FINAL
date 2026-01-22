/**
 * OpenAI-Compatible API Routes
 *
 * Provides OpenAI API compatibility for integration with:
 * - OpenWebUI
 * - ChatGPT-compatible clients
 * - LangChain
 * - Any OpenAI SDK
 */

import { Router, Request, Response } from 'express';
import { agentService } from '../services/agentService';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Model info
const DISPOTREE_MODEL = {
  id: 'dispotree-agent',
  object: 'model',
  created: Math.floor(Date.now() / 1000),
  owned_by: 'dispotree',
  permission: [],
  root: 'dispotree-agent',
  parent: null,
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  user?: string;
}

/**
 * @swagger
 * /v1/models:
 *   get:
 *     summary: List available models
 *     description: OpenAI-compatible endpoint to list available models
 *     tags: [OpenAI Compatible]
 *     responses:
 *       200:
 *         description: List of models
 */
router.get('/models', (req: Request, res: Response) => {
  res.json({
    object: 'list',
    data: [DISPOTREE_MODEL],
  });
});

/**
 * @swagger
 * /v1/models/{model}:
 *   get:
 *     summary: Get model info
 *     description: OpenAI-compatible endpoint to get model details
 *     tags: [OpenAI Compatible]
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Model details
 */
router.get('/models/:model', (req: Request, res: Response) => {
  const { model } = req.params;

  if (model === 'dispotree-agent' || model === 'gpt-4' || model === 'gpt-3.5-turbo') {
    res.json(DISPOTREE_MODEL);
  } else {
    res.status(404).json({
      error: {
        message: `Model '${model}' not found`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
  }
});

/**
 * @swagger
 * /v1/chat/completions:
 *   post:
 *     summary: Create chat completion
 *     description: OpenAI-compatible chat completions endpoint. Works with OpenWebUI and other OpenAI clients.
 *     tags: [OpenAI Compatible]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *             properties:
 *               model:
 *                 type: string
 *                 default: dispotree-agent
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [system, user, assistant]
 *                     content:
 *                       type: string
 *               stream:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Chat completion response
 */
router.post('/chat/completions', async (req: Request, res: Response) => {
  try {
    const body: ChatCompletionRequest = req.body;
    const { messages, stream = false, user } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages is required and must be a non-empty array',
          type: 'invalid_request_error',
          code: 'invalid_messages',
        },
      });
    }

    // Check if agent is ready
    if (!agentService.isReady()) {
      return res.status(503).json({
        error: {
          message: 'AI Agent not available. Please configure OPENROUTER_API_KEY or OPENAI_API_KEY.',
          type: 'server_error',
          code: 'agent_unavailable',
        },
      });
    }

    // Extract session ID from user field or generate new one
    const sessionId = user || `openai-${uuidv4()}`;

    // Get the last user message
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) {
      return res.status(400).json({
        error: {
          message: 'No user message found in messages array',
          type: 'invalid_request_error',
          code: 'no_user_message',
        },
      });
    }

    const completionId = `chatcmpl-${uuidv4()}`;
    const created = Math.floor(Date.now() / 1000);

    if (stream) {
      // Streaming response (SSE format)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      let fullContent = '';

      try {
        for await (const chunk of agentService.chatStream(sessionId, lastUserMessage.content, false)) {
          fullContent += chunk;

          const data = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: 'dispotree-agent',
            choices: [{
              index: 0,
              delta: { content: chunk },
              finish_reason: null,
            }],
          };

          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }

        // Send final chunk with finish_reason
        const finalData = {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: 'dispotree-agent',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
        };
        res.write(`data: ${JSON.stringify(finalData)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError) {
        console.error('Stream error:', streamError);
        if (!res.writableEnded) {
          res.end();
        }
      }
    } else {
      // Non-streaming response
      const response = await agentService.chat(sessionId, lastUserMessage.content);

      res.json({
        id: completionId,
        object: 'chat.completion',
        created,
        model: 'dispotree-agent',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: response,
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: lastUserMessage.content.length,
          completion_tokens: response.length,
          total_tokens: lastUserMessage.content.length + response.length,
        },
      });
    }
  } catch (error) {
    console.error('Chat completion error:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Internal server error',
        type: 'server_error',
        code: 'internal_error',
      },
    });
  }
});

/**
 * Health check for OpenAI compatibility
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: agentService.isReady() ? 'healthy' : 'degraded',
    model: 'dispotree-agent',
    features: [
      'Property search and analysis',
      'Buy box management',
      'Deal scoring',
      'Market data enrichment',
      'Automation management',
      'Knowledge base queries',
    ],
  });
});

export default router;
