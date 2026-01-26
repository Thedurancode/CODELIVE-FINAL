/**
 * Supabase Realtime Service
 *
 * Broadcasts team chat events via Supabase Realtime channels.
 * This replaces the custom WebSocket implementation for team chat.
 */

import { supabaseAdmin } from '../config/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface TeamMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderType: string;
  source: string;
  content: string;
  mentions?: string[];
  attachments?: any[];
  createdAt: Date;
}

interface TypingPayload {
  userId: string;
  userName: string;
  isTyping: boolean;
}

interface MessageReadPayload {
  userId: string;
  conversationId: string;
}

interface UnreadCountPayload {
  userId: string;
  conversationId: string;
  count: number;
  totalCount: number;
}

interface PublicChatMessagePayload {
  id: string;
  conversationId: string;
  propertyId: number;
  senderName: string;
  senderPhone: string | null;
  senderType: string;
  content: string;
  createdAt: Date;
}

interface PublicTypingPayload {
  guestId: string;
  guestName: string;
  propertyId: number;
  isTyping: boolean;
}

interface MessageReactionPayload {
  messageId: string;
  conversationId: string;
  reaction: string;
  userId: string;
  userName: string;
  action: 'add' | 'remove';
}

class SupabaseRealtimeService {
  private globalChannel: RealtimeChannel | null = null;
  private initialized = false;

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized || !supabaseAdmin) {
      return;
    }

    try {
      // Create global team chat channel for broadcasting
      this.globalChannel = supabaseAdmin.channel('team-chat-global');
      await this.globalChannel.subscribe();
      this.initialized = true;
      console.log('📡 Supabase Realtime Service initialized');
    } catch (error) {
      console.error('Failed to initialize Supabase Realtime:', error);
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized && this.globalChannel !== null;
  }

  /**
   * Broadcast a new team message to all subscribers
   */
  async broadcastTeamMessage(message: TeamMessagePayload): Promise<void> {
    if (!this.isReady()) {
      console.warn('Supabase Realtime not initialized, skipping broadcast');
      return;
    }

    try {
      await this.globalChannel!.send({
        type: 'broadcast',
        event: 'team_message',
        payload: message,
      });
      console.log(`📡 Broadcasted message ${message.id} to team-chat-global`);
    } catch (error) {
      console.error('Failed to broadcast team message:', error);
    }
  }

  /**
   * Broadcast typing indicator to a specific conversation
   */
  async broadcastTyping(conversationId: string, payload: TypingPayload): Promise<void> {
    if (!supabaseAdmin) return;

    try {
      const channel = supabaseAdmin.channel(`conversation:${conversationId}`);
      await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload,
      });
    } catch (error) {
      console.error('Failed to broadcast typing:', error);
    }
  }

  /**
   * Broadcast message read event
   */
  async broadcastMessageRead(conversationId: string, payload: MessageReadPayload): Promise<void> {
    if (!supabaseAdmin) return;

    try {
      const channel = supabaseAdmin.channel(`conversation:${conversationId}`);
      await channel.send({
        type: 'broadcast',
        event: 'message_read',
        payload,
      });
    } catch (error) {
      console.error('Failed to broadcast message read:', error);
    }
  }

  /**
   * Generic broadcast to a specific channel with custom event
   * Used for delivery confirmations and other custom events
   */
  async broadcastToChannel(
    channelName: string,
    event: string,
    payload: Record<string, any>
  ): Promise<void> {
    if (!supabaseAdmin) return;

    try {
      const channel = supabaseAdmin.channel(channelName);
      await channel.send({
        type: 'broadcast',
        event,
        payload,
      });
      console.log(`📡 Broadcasted ${event} to ${channelName}`);
    } catch (error) {
      console.error(`Failed to broadcast ${event} to ${channelName}:`, error);
    }
  }

  /**
   * Broadcast unread count update to a specific user
   */
  async broadcastUnreadCount(payload: UnreadCountPayload): Promise<void> {
    if (!this.isReady()) return;

    try {
      await this.globalChannel!.send({
        type: 'broadcast',
        event: 'unread_count',
        payload,
      });
    } catch (error) {
      console.error('Failed to broadcast unread count:', error);
    }
  }

  /**
   * Broadcast new conversation created
   */
  async broadcastNewConversation(conversation: any, participantIds: string[]): Promise<void> {
    if (!this.isReady()) return;

    try {
      await this.globalChannel!.send({
        type: 'broadcast',
        event: 'conversation_created',
        payload: {
          conversation,
          participantIds,
        },
      });
    } catch (error) {
      console.error('Failed to broadcast new conversation:', error);
    }
  }

  /**
   * Broadcast a public chat message
   */
  async broadcastPublicMessage(propertyId: number, message: PublicChatMessagePayload): Promise<void> {
    if (!supabaseAdmin) return;

    try {
      const channel = supabaseAdmin.channel(`public-chat:${propertyId}`);
      await channel.send({
        type: 'broadcast',
        event: 'public_message',
        payload: message,
      });
      console.log(`📡 Broadcasted public message to property ${propertyId}`);
    } catch (error) {
      console.error('Failed to broadcast public message:', error);
    }
  }

  /**
   * Broadcast typing indicator for public chat
   */
  async broadcastPublicTyping(propertyId: number, payload: PublicTypingPayload): Promise<void> {
    if (!supabaseAdmin) return;

    try {
      const channel = supabaseAdmin.channel(`public-chat:${propertyId}`);
      await channel.send({
        type: 'broadcast',
        event: 'public_typing',
        payload,
      });
    } catch (error) {
      console.error('Failed to broadcast public typing:', error);
    }
  }

  /**
   * Broadcast message reaction
   */
  async broadcastReaction(conversationId: string, payload: MessageReactionPayload): Promise<void> {
    if (!supabaseAdmin) return;

    try {
      const channel = supabaseAdmin.channel(`conversation:${conversationId}`);
      await channel.send({
        type: 'broadcast',
        event: 'message_reaction',
        payload,
      });
    } catch (error) {
      console.error('Failed to broadcast reaction:', error);
    }
  }

  /**
   * Broadcast message edit
   */
  async broadcastMessageEdit(conversationId: string, messageId: string, newContent: string, editedAt: Date): Promise<void> {
    if (!supabaseAdmin) return;

    try {
      const channel = supabaseAdmin.channel(`conversation:${conversationId}`);
      await channel.send({
        type: 'broadcast',
        event: 'message_edited',
        payload: { messageId, content: newContent, editedAt },
      });
    } catch (error) {
      console.error('Failed to broadcast message edit:', error);
    }
  }

  /**
   * Broadcast message deletion
   */
  async broadcastMessageDelete(conversationId: string, messageId: string): Promise<void> {
    if (!supabaseAdmin) return;

    try {
      const channel = supabaseAdmin.channel(`conversation:${conversationId}`);
      await channel.send({
        type: 'broadcast',
        event: 'message_deleted',
        payload: { messageId },
      });
    } catch (error) {
      console.error('Failed to broadcast message delete:', error);
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.globalChannel) {
      await this.globalChannel.unsubscribe();
      this.globalChannel = null;
    }
    this.initialized = false;
    console.log('📡 Supabase Realtime Service shut down');
  }
}

export const supabaseRealtimeService = new SupabaseRealtimeService();
export default supabaseRealtimeService;
