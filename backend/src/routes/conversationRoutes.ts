/**
 * Conversation Routes
 *
 * API endpoints for managing chat conversations:
 * - List user's conversations
 * - Get conversation with messages
 * - Update conversation title
 * - Delete conversation
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { conversationTitleService } from '../services/ConversationTitleService';
import { Conversation, ConversationHistory } from '../models';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Conversations
 *   description: Chat conversation management
 */

/**
 * @swagger
 * /api/conversations:
 *   get:
 *     summary: List user's conversations
 *     description: Get all conversations for the authenticated user, sorted by last message
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const conversations = await conversationTitleService.getConversations(userId);

    res.json({
      success: true,
      data: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        generatedTitle: c.generatedTitle,
        messageCount: c.messageCount,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversations',
    });
  }
});

/**
 * @swagger
 * /api/conversations/{id}:
 *   get:
 *     summary: Get conversation with messages
 *     description: Get a conversation and its message history
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation/session ID
 *     responses:
 *       200:
 *         description: Conversation with messages
 *       404:
 *         description: Conversation not found
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Pagination parameters
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100 messages per request
    const page = parseInt(req.query.page as string) || 1;
    const offset = (page - 1) * limit;

    const conversation = await conversationTitleService.getConversation(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    // Verify ownership
    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Get total count for pagination
    const totalMessages = await ConversationHistory.count({
      where: { sessionId: id },
    });

    // Get messages for this conversation with pagination
    const messages = await ConversationHistory.findAll({
      where: { sessionId: id },
      order: [['createdAt', 'ASC']],
      attributes: ['id', 'role', 'content', 'toolCalls', 'createdAt'],
      limit,
      offset,
    });

    // Filter out empty assistant messages and system messages
    const filteredMessages = messages
      .filter((m) => {
        // Skip system messages
        if (m.role === 'system') return false;
        // Skip empty assistant messages
        if (m.role === 'assistant' && (!m.content || m.content.trim() === '')) return false;
        return true;
      })
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        createdAt: m.createdAt,
      }));

    const totalPages = Math.ceil(totalMessages / limit);

    res.json({
      success: true,
      data: {
        id: conversation.id,
        title: conversation.title,
        generatedTitle: conversation.generatedTitle,
        messageCount: conversation.messageCount,
        lastMessageAt: conversation.lastMessageAt,
        createdAt: conversation.createdAt,
        messages: filteredMessages,
      },
      pagination: {
        page,
        limit,
        total: totalMessages,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation',
    });
  }
});

/**
 * @swagger
 * /api/conversations/{id}:
 *   patch:
 *     summary: Update conversation title
 *     description: Update the title of a conversation (manual edit)
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation/session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 description: New title for the conversation
 *     responses:
 *       200:
 *         description: Title updated successfully
 *       404:
 *         description: Conversation not found
 */
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { title } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Title is required',
      });
    }

    const conversation = await conversationTitleService.getConversation(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    // Verify ownership
    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    await conversationTitleService.updateTitle(id, title.trim(), false);

    res.json({
      success: true,
      data: {
        id,
        title: title.trim(),
        generatedTitle: false,
      },
    });
  } catch (error) {
    console.error('Error updating conversation title:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update title',
    });
  }
});

/**
 * @swagger
 * /api/conversations/{id}:
 *   delete:
 *     summary: Delete conversation
 *     description: Delete a conversation and all its messages
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation/session ID
 *     responses:
 *       200:
 *         description: Conversation deleted successfully
 *       404:
 *         description: Conversation not found
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const conversation = await conversationTitleService.getConversation(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    // Verify ownership
    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Delete messages first
    await ConversationHistory.destroy({
      where: { sessionId: id },
    });

    // Delete conversation
    await conversationTitleService.deleteConversation(id);

    res.json({
      success: true,
      message: 'Conversation deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete conversation',
    });
  }
});

/**
 * @swagger
 * /api/conversations/{id}/generate-title:
 *   post:
 *     summary: Generate or regenerate conversation title
 *     description: Use AI to generate a smart title for the conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation/session ID
 *     responses:
 *       200:
 *         description: Title generated successfully
 *       404:
 *         description: Conversation not found
 */
router.post('/:id/generate-title', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const conversation = await conversationTitleService.getConversation(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    // Verify ownership
    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Get first few messages to generate title
    const messages = await ConversationHistory.findAll({
      where: { sessionId: id },
      order: [['createdAt', 'ASC']],
      limit: 4,
      attributes: ['role', 'content'],
    });

    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No messages in conversation to generate title from',
      });
    }

    const firstUserMessage = messages.find((m) => m.role === 'user')?.content || '';
    const firstAssistantMessage = messages.find((m) => m.role === 'assistant')?.content;

    const title = await conversationTitleService.generateTitle(
      firstUserMessage,
      firstAssistantMessage
    );

    await conversationTitleService.updateTitle(id, title, true);

    res.json({
      success: true,
      data: {
        id,
        title,
        generatedTitle: true,
      },
    });
  } catch (error) {
    console.error('Error generating title:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate title',
    });
  }
});

export default router;
