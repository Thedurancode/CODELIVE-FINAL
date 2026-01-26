/**
 * Sprite Chat Routes
 *
 * API endpoints for sprite chat functionality.
 * Enables chat interface with Claude Code running inside sprites.
 */

import express, { Request, Response } from 'express';
import { spritesService } from '../services/SpritesService';
import { spriteConversationService } from '../services/SpriteConversationService';

const router = express.Router();

/**
 * @swagger
 * /api/sprites/{id}/chat/stream:
 *   post:
 *     summary: Stream chat with Claude Code in a sprite
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: User message to send to Claude
 *               conversationId:
 *                 type: string
 *                 description: Existing conversation ID to continue
 *               workDir:
 *                 type: string
 *                 description: Working directory for the command
 *     responses:
 *       200:
 *         description: Server-Sent Events stream of chat responses
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.post('/:id/chat/stream', async (req: Request, res: Response) => {
  const { id: spriteId } = req.params;
  const { prompt, conversationId, workDir } = req.body;
  const userId = (req as any).user?.id || (req as any).userId;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ success: false, error: 'Prompt is required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Determine session ID (continue existing or create new)
  const sessionId = conversationId || spriteConversationService.generateSessionId(spriteId);
  const shouldContinue = !!conversationId;

  try {
    // Save user message
    await spriteConversationService.saveMessage(sessionId, userId, 'user', prompt);

    // Send init event with session info
    res.write(`data: ${JSON.stringify({ type: 'init', sessionId })}\n\n`);

    // Stream response from Claude
    let assistantContent = '';

    for await (const event of spritesService.execClaudeChatStream(spriteId, prompt, {
      continueSession: shouldContinue,
      workDir,
    })) {
      // Forward event to client
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Accumulate text for saving
      if (event.type === 'text' && event.data) {
        assistantContent += event.data;
      }

      // Check if client disconnected
      if (res.writableEnded) {
        break;
      }
    }

    // Save assistant response
    if (assistantContent) {
      await spriteConversationService.saveMessage(sessionId, userId, 'assistant', assistantContent);
    }

    // Send final done event
    res.write(`data: ${JSON.stringify({ type: 'done', sessionId })}\n\n`);
    res.end();
  } catch (error) {
    console.error('[SpriteChatRoutes] Error in stream:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: (error as Error).message })}\n\n`);
    res.end();
  }
});

/**
 * @swagger
 * /api/sprites/{id}/chat/conversations:
 *   get:
 *     summary: List chat conversations for a sprite
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *     responses:
 *       200:
 *         description: List of conversations
 */
router.get('/:id/chat/conversations', async (req: Request, res: Response) => {
  const { id: spriteId } = req.params;

  try {
    const conversations = await spriteConversationService.listConversations(spriteId);
    res.json({ success: true, data: conversations });
  } catch (error) {
    console.error('[SpriteChatRoutes] Error listing conversations:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/sprites/{id}/chat/conversations/{sessionId}:
 *   get:
 *     summary: Get conversation history
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation session ID
 *     responses:
 *       200:
 *         description: Conversation messages
 */
router.get('/:id/chat/conversations/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    const messages = await spriteConversationService.getHistory(sessionId);
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('[SpriteChatRoutes] Error getting conversation:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/sprites/{id}/chat/conversations/{sessionId}:
 *   delete:
 *     summary: Delete a conversation
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation session ID
 *     responses:
 *       200:
 *         description: Conversation deleted
 */
router.delete('/:id/chat/conversations/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    const deleted = await spriteConversationService.deleteConversation(sessionId);
    res.json({ success: true, data: { deleted } });
  } catch (error) {
    console.error('[SpriteChatRoutes] Error deleting conversation:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
