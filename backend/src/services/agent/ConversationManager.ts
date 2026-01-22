/**
 * Conversation Manager
 *
 * Manages conversation history with:
 * - 3-tier caching (Memory → Redis → Database)
 * - Automatic summarization for long conversations
 * - Cache cleanup and TTL management
 */

import { HumanMessage, AIMessage, SystemMessage } from 'langchain';
import type { BaseMessage } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { logger } from '../LoggerService';
import { redisService, CACHE_PREFIX, CACHE_TTL } from '../RedisService';
import ConversationHistory from '../../models/ConversationHistory';
import Conversation from '../../models/Conversation';
import type { CacheEntry } from './types';
import { CONVERSATION_SETTINGS, CACHE_SETTINGS } from './types';
import { safeguardsManager } from './SafeguardsManager';

const {
  MAX_HISTORY_MESSAGES,
  RECENT_MESSAGES_TO_KEEP,
  SUMMARIZATION_THRESHOLD,
  SUMMARIZATION_MODEL,
} = CONVERSATION_SETTINGS;

const {
  CONVERSATION_CACHE_TTL,
  SUMMARY_CACHE_TTL,
  CACHE_CLEANUP_INTERVAL,
  MAX_CACHE_SIZE,
} = CACHE_SETTINGS;

/**
 * Manages conversation history and caching
 */
class ConversationManager {
  private conversationCache: Map<string, CacheEntry<BaseMessage[]>> = new Map();
  private summaryCache: Map<string, CacheEntry<string>> = new Map();
  private cacheLocks: Map<string, Promise<void>> = new Map();
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private initialized = false;

  private log = logger.child({ service: 'conversation' });

  /**
   * Initialize the conversation manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Start periodic cache cleanup
    this.startCacheCleanup();

    // Share cache references with safeguards manager for status reporting
    safeguardsManager.setCacheReferences(this.conversationCache, this.summaryCache);

    this.initialized = true;
    this.log.info('Conversation manager initialized');
  }

  /**
   * Check if manager is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    this.stopCacheCleanup();
    this.conversationCache.clear();
    this.summaryCache.clear();
    this.cacheLocks.clear();
    this.initialized = false;
  }

  // =============================================================================
  // CACHE CLEANUP
  // =============================================================================

  private startCacheCleanup(): void {
    if (this.cleanupIntervalId !== null) return;

    this.cleanupIntervalId = setInterval(() => {
      this.runCacheCleanup();
    }, CACHE_CLEANUP_INTERVAL);

    // Allow process to exit even if interval is running
    this.cleanupIntervalId.unref();
  }

  private stopCacheCleanup(): void {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  private runCacheCleanup(): void {
    try {
      const now = Date.now();

      // Clean up expired conversation cache entries
      for (const [key, entry] of this.conversationCache.entries()) {
        if (now - entry.timestamp > CONVERSATION_CACHE_TTL) {
          this.conversationCache.delete(key);
        }
      }

      // Clean up expired summary cache entries
      for (const [key, entry] of this.summaryCache.entries()) {
        if (now - entry.timestamp > SUMMARY_CACHE_TTL) {
          this.summaryCache.delete(key);
        }
      }

      // Enforce size limits
      this.enforceCacheLimit(this.conversationCache, MAX_CACHE_SIZE);
      this.enforceCacheLimit(this.summaryCache, MAX_CACHE_SIZE);

      // Clean up old cache locks (safety valve)
      if (this.cacheLocks.size > MAX_CACHE_SIZE) {
        this.log.warn('Cache locks exceeded max size, clearing all locks', {
          size: this.cacheLocks.size,
        });
        this.cacheLocks.clear();
      }
    } catch (error) {
      this.log.error('Cache cleanup error', {}, error);
    }
  }

  private enforceCacheLimit(cache: Map<string, CacheEntry<any>>, maxSize: number): void {
    if (cache.size <= maxSize) return;

    const entries = Array.from(cache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    const toRemove = entries.slice(0, entries.length - maxSize);
    toRemove.forEach(([key]) => cache.delete(key));
  }

  // =============================================================================
  // CACHE LOCKING
  // =============================================================================

  /**
   * Acquire a lock for cache operations on a specific session
   */
  async acquireCacheLock(sessionId: string): Promise<() => void> {
    const existingLock = this.cacheLocks.get(sessionId);
    if (existingLock) {
      await existingLock;
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.cacheLocks.set(sessionId, lockPromise);

    return () => {
      this.cacheLocks.delete(sessionId);
      releaseLock!();
    };
  }

  // =============================================================================
  // HISTORY LOADING (3-Tier Cache)
  // =============================================================================

  /**
   * Load conversation history from cache layers
   * L1: In-memory cache (fastest)
   * L2: Redis cache (fast, shared across instances)
   * L3: Database (persistent storage)
   */
  async loadHistory(sessionId: string): Promise<BaseMessage[]> {
    // L1: Check in-memory cache first
    const cached = this.conversationCache.get(sessionId);
    if (cached) {
      cached.timestamp = Date.now(); // Update timestamp on access
      return cached.data;
    }

    // L2: Check Redis cache
    try {
      const redisKey = `${CACHE_PREFIX.CONVERSATION}${sessionId}`;
      const redisData = await redisService.get<Array<{ role: string; content: string }>>(
        redisKey
      );

      if (redisData && Array.isArray(redisData)) {
        const messages = this.deserializeMessages(redisData);
        this.conversationCache.set(sessionId, { data: messages, timestamp: Date.now() });
        return messages;
      }
    } catch (error) {
      this.log.warn('Redis cache read error', { sessionId }, error);
    }

    // L3: Fall back to database
    try {
      const records = await ConversationHistory.findAll({
        where: { sessionId },
        order: [['createdAt', 'ASC']],
        limit: MAX_HISTORY_MESSAGES,
      });

      const messages = this.deserializeMessages(
        records.map((r) => ({ role: r.role, content: r.content }))
      );

      // Populate L1 cache
      this.conversationCache.set(sessionId, { data: messages, timestamp: Date.now() });

      // Populate L2 cache (async, fire-and-forget)
      if (records.length > 0) {
        const cacheData = records.map((r) => ({ role: r.role, content: r.content }));
        redisService
          .set(`${CACHE_PREFIX.CONVERSATION}${sessionId}`, cacheData, CACHE_TTL.CONVERSATION_HISTORY)
          .catch((err) => this.log.warn('Redis cache write error', { sessionId }, err));
      }

      return messages;
    } catch (error) {
      this.log.warn('Could not load conversation history', { sessionId }, error);
      return [];
    }
  }

  /**
   * Get optimized conversation history with summarization for long conversations
   */
  async getOptimizedHistory(sessionId: string): Promise<BaseMessage[]> {
    // Load full history
    let fullHistory: BaseMessage[];

    const cached = this.conversationCache.get(sessionId);
    if (cached) {
      cached.timestamp = Date.now();
      fullHistory = cached.data;
    } else {
      fullHistory = await this.loadHistory(sessionId);
    }

    // If under threshold, return all messages
    if (fullHistory.length <= SUMMARIZATION_THRESHOLD) {
      return fullHistory;
    }

    // Split into old messages (to summarize) and recent messages (to keep)
    const splitPoint = fullHistory.length - RECENT_MESSAGES_TO_KEEP;
    const oldMessages = fullHistory.slice(0, splitPoint);
    const recentMessages = fullHistory.slice(splitPoint);

    // Check if we have a cached summary
    const summaryCacheKey = `${sessionId}:${splitPoint}`;
    let summary: string;

    const cachedSummary = this.summaryCache.get(summaryCacheKey);
    if (cachedSummary) {
      summary = cachedSummary.data;
    } else {
      // Generate new summary
      summary = await this.summarizeConversation(oldMessages);
      this.summaryCache.set(summaryCacheKey, { data: summary, timestamp: Date.now() });
      this.log.debug('Summarized conversation', {
        sessionId: sessionId.substring(0, 8),
        messagesCount: oldMessages.length,
      });
    }

    // Return summary as system message followed by recent messages
    const optimizedHistory: BaseMessage[] = [];

    if (summary) {
      optimizedHistory.push(new SystemMessage(`[Previous conversation summary: ${summary}]`));
    }

    optimizedHistory.push(...recentMessages);
    return optimizedHistory;
  }

  // =============================================================================
  // HISTORY SAVING
  // =============================================================================

  /**
   * Ensure a Conversation record exists for this session
   * Creates one if it doesn't exist, updates lastMessageAt if it does
   */
  async ensureConversation(sessionId: string, userId: string): Promise<void> {
    try {
      const [conversation, created] = await Conversation.findOrCreate({
        where: { id: sessionId },
        defaults: {
          id: sessionId,
          userId,
          title: 'New Conversation',
          generatedTitle: false,
          messageCount: 0,
          lastMessageAt: new Date(),
        },
      });

      if (created) {
        this.log.debug('Created conversation record', { sessionId, userId });
      }
    } catch (error) {
      this.log.warn('Could not ensure conversation exists', { sessionId, userId }, error);
    }
  }

  /**
   * Save a message to database and invalidate caches
   * If userId is provided, ensures a Conversation record exists
   */
  async saveMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    userId?: string
  ): Promise<void> {
    try {
      // Ensure conversation record exists if we have a userId
      if (userId) {
        await this.ensureConversation(sessionId, userId);
      }

      await ConversationHistory.create({
        sessionId,
        role,
        content,
      });

      // Update conversation message count and timestamp
      if (userId) {
        await Conversation.increment('messageCount', {
          by: 1,
          where: { id: sessionId },
        });
        await Conversation.update(
          { lastMessageAt: new Date() },
          { where: { id: sessionId } }
        );
      }

      // Update in-memory cache
      const cached = this.conversationCache.get(sessionId);
      if (cached) {
        const message = this.createMessage(role, content);
        cached.data.push(message);
        cached.timestamp = Date.now();
      }

      // Invalidate Redis cache (will be rebuilt on next load)
      redisService
        .del(`${CACHE_PREFIX.CONVERSATION}${sessionId}`)
        .catch((err) => this.log.warn('Redis cache invalidation error', { sessionId }, err));

      // Invalidate summary cache
      this.invalidateSummaryCache(sessionId);
    } catch (error) {
      this.log.warn('Could not save conversation message', { sessionId, role }, error);
    }
  }

  /**
   * Clear all history for a session
   */
  async clearHistory(sessionId: string): Promise<void> {
    try {
      // Clear database
      await ConversationHistory.destroy({ where: { sessionId } });

      // Clear all caches
      this.conversationCache.delete(sessionId);
      this.invalidateSummaryCache(sessionId);

      // Clear Redis
      await redisService.del(`${CACHE_PREFIX.CONVERSATION}${sessionId}`);

      this.log.info('Cleared conversation history', { sessionId });
    } catch (error) {
      this.log.error('Error clearing conversation history', { sessionId }, error);
    }
  }

  /**
   * Get formatted history for API responses
   */
  async getFormattedHistory(
    sessionId: string
  ): Promise<Array<{ role: string; content: string; type: string }>> {
    const history = await this.loadHistory(sessionId);
    return history.map((m) => ({
      role: m._getType() === 'human' ? 'user' : m._getType() === 'ai' ? 'assistant' : 'system',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      type: m._getType(),
    }));
  }

  /**
   * Get active sessions from cache
   */
  getActiveSessions(): string[] {
    return Array.from(this.conversationCache.keys());
  }

  // =============================================================================
  // SUMMARIZATION
  // =============================================================================

  private async summarizeConversation(messages: BaseMessage[]): Promise<string> {
    if (messages.length === 0) {
      return '';
    }

    const openAIKey = process.env.OPENAI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    // Format messages for summarization
    const conversationText = messages
      .map((m) => {
        const role = m._getType() === 'human' ? 'User' : m._getType() === 'ai' ? 'Assistant' : 'System';
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        const truncated = content.length > 500 ? content.substring(0, 500) + '...' : content;
        return `${role}: ${truncated}`;
      })
      .join('\n');

    const summaryPrompt = `Summarize this conversation between a user and an AI real estate assistant.
Focus on: key topics discussed, properties mentioned (with IDs if any), decisions made, and important context for future messages.
Keep the summary concise (2-4 sentences) but include specific details like property IDs, prices, and locations.

Conversation:
${conversationText}

Summary:`;

    try {
      let summaryModel: ChatOpenAI;

      if (openAIKey) {
        summaryModel = new ChatOpenAI({
          model: SUMMARIZATION_MODEL,
          apiKey: openAIKey,
          temperature: 0.3,
          maxTokens: 300,
        });
      } else if (openRouterKey) {
        summaryModel = new ChatOpenAI({
          model: SUMMARIZATION_MODEL,
          apiKey: openRouterKey,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
              'X-Title': 'Dispotree',
            },
          },
          temperature: 0.3,
          maxTokens: 300,
        });
      } else {
        return this.createFallbackSummary(messages);
      }

      const response = await summaryModel.invoke([new HumanMessage(summaryPrompt)]);
      return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    } catch (error) {
      this.log.warn('Failed to generate conversation summary', {}, error);
      return this.createFallbackSummary(messages);
    }
  }

  private createFallbackSummary(messages: BaseMessage[]): string {
    const propertyIds = new Set<string>();
    const cities = new Set<string>();

    for (const m of messages) {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);

      // Find property IDs
      const idMatches = content.match(/(?:property(?:Id)?|ID)[:\s]*([A-Za-z0-9-]+)/gi);
      if (idMatches) {
        idMatches.forEach((match) => {
          const id = match.replace(/property(?:Id)?[:\s]*/i, '').replace(/ID[:\s]*/i, '');
          if (id.length > 3) propertyIds.add(id);
        });
      }

      // Find cities
      const cityMatches = content.match(
        /(?:in|near|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*(?:[A-Z]{2})?/g
      );
      if (cityMatches) {
        cityMatches.forEach((match) => {
          const city = match.replace(/(?:in|near|at)\s+/i, '').trim();
          if (city.length > 2) cities.add(city);
        });
      }
    }

    const parts: string[] = [];
    parts.push(`Previous conversation with ${messages.length} messages.`);

    if (propertyIds.size > 0) {
      parts.push(`Properties discussed: ${Array.from(propertyIds).slice(0, 5).join(', ')}.`);
    }
    if (cities.size > 0) {
      parts.push(`Locations: ${Array.from(cities).slice(0, 3).join(', ')}.`);
    }

    return parts.join(' ');
  }

  private invalidateSummaryCache(sessionId: string): void {
    for (const key of this.summaryCache.keys()) {
      if (key.startsWith(sessionId + ':')) {
        this.summaryCache.delete(key);
      }
    }
  }

  // =============================================================================
  // HELPERS
  // =============================================================================

  private deserializeMessages(data: Array<{ role: string; content: string }>): BaseMessage[] {
    return data.map((r) => this.createMessage(r.role as 'user' | 'assistant' | 'system', r.content));
  }

  private createMessage(role: 'user' | 'assistant' | 'system', content: string): BaseMessage {
    switch (role) {
      case 'user':
        return new HumanMessage(content);
      case 'assistant':
        return new AIMessage(content);
      default:
        return new SystemMessage(content);
    }
  }
}

// Export singleton instance
export const conversationManager = new ConversationManager();
export default conversationManager;
