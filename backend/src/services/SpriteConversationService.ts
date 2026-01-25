/**
 * SpriteConversationService
 *
 * Manages chat conversations for sprites using ConversationHistory model.
 * Handles session creation, message persistence, and conversation retrieval.
 */

import ConversationHistory from '../models/ConversationHistory';

interface SpriteConversation {
  id: string;
  spriteId: string;
  title: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface SpriteMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: any[];
  createdAt: Date;
}

class SpriteConversationService {
  /**
   * Generate a unique session ID for a sprite conversation
   */
  generateSessionId(spriteId: string): string {
    return `sprite-${spriteId}-${Date.now()}`;
  }

  /**
   * Parse a session ID to extract sprite ID
   */
  parseSpriteIdFromSession(sessionId: string): string | null {
    const match = sessionId.match(/^sprite-([^-]+)-/);
    return match ? match[1] : null;
  }

  /**
   * Check if a session ID is a sprite conversation
   */
  isSpriteSession(sessionId: string): boolean {
    return sessionId.startsWith('sprite-');
  }

  /**
   * Save a message to a conversation
   */
  async saveMessage(
    sessionId: string,
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    options?: {
      toolCalls?: any[];
      metadata?: Record<string, any>;
    }
  ): Promise<ConversationHistory> {
    return ConversationHistory.create({
      sessionId,
      userId,
      role,
      content,
      toolCalls: options?.toolCalls,
      metadata: options?.metadata,
    });
  }

  /**
   * Get conversation history for a session
   */
  async getHistory(sessionId: string): Promise<SpriteMessage[]> {
    const messages = await ConversationHistory.findAll({
      where: { sessionId },
      order: [['createdAt', 'ASC']],
    });

    return messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls,
      createdAt: msg.createdAt,
    }));
  }

  /**
   * List all conversations for a sprite
   */
  async listConversations(spriteId: string): Promise<SpriteConversation[]> {
    // Find all unique sessions for this sprite
    const sessionPrefix = `sprite-${spriteId}-`;

    const messages = await ConversationHistory.findAll({
      where: {
        sessionId: {
          // Use LIKE for prefix matching
          [require('sequelize').Op.like]: `${sessionPrefix}%`,
        },
      },
      order: [['createdAt', 'ASC']],
    });

    // Group by session
    const sessionMap = new Map<
      string,
      {
        messages: typeof messages;
        firstMsg: (typeof messages)[0];
        lastMsg: (typeof messages)[0];
      }
    >();

    for (const msg of messages) {
      const existing = sessionMap.get(msg.sessionId);
      if (existing) {
        existing.messages.push(msg);
        existing.lastMsg = msg;
      } else {
        sessionMap.set(msg.sessionId, {
          messages: [msg],
          firstMsg: msg,
          lastMsg: msg,
        });
      }
    }

    // Convert to conversation objects
    const conversations: SpriteConversation[] = [];

    for (const [sessionId, data] of sessionMap.entries()) {
      // Generate title from first user message
      const firstUserMsg = data.messages.find((m) => m.role === 'user');
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
        : 'New conversation';

      conversations.push({
        id: sessionId,
        spriteId,
        title,
        messageCount: data.messages.length,
        createdAt: data.firstMsg.createdAt,
        updatedAt: data.lastMsg.createdAt,
      });
    }

    // Sort by most recent first
    conversations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return conversations;
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(sessionId: string): Promise<number> {
    const deleted = await ConversationHistory.destroy({
      where: { sessionId },
    });
    return deleted;
  }

  /**
   * Get the last message timestamp for a conversation
   */
  async getLastMessageTime(sessionId: string): Promise<Date | null> {
    const lastMessage = await ConversationHistory.findOne({
      where: { sessionId },
      order: [['createdAt', 'DESC']],
    });
    return lastMessage?.createdAt || null;
  }

  /**
   * Count messages in a conversation
   */
  async countMessages(sessionId: string): Promise<number> {
    return ConversationHistory.count({
      where: { sessionId },
    });
  }
}

export const spriteConversationService = new SpriteConversationService();
export default spriteConversationService;
