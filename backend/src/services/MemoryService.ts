/**
 * Memory Service - Long-term Vector Memory for AI Agent
 *
 * Stores and retrieves user memories using Pinecone vector database.
 * Memories include:
 * - User preferences (markets, property types, price ranges)
 * - Past deal decisions (liked, rejected, reasons)
 * - Important facts mentioned in conversations
 * - Session summaries
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

export interface Memory {
  id: string;
  userId: string;
  type: 'preference' | 'deal_decision' | 'fact' | 'session_summary';
  content: string;
  metadata: {
    createdAt: Date;
    source?: string; // 'conversation', 'deal_action', 'explicit'
    importance?: number; // 1-10
    propertyId?: string;
    sessionId?: string;
    tags?: string[];
  };
}

export interface MemorySearchResult {
  id: string;
  content: string;
  type: Memory['type'];
  score: number;
  metadata: Memory['metadata'];
}

export interface MemoryStats {
  totalMemories: number;
  byType: Record<string, number>;
  oldestMemory?: Date;
  newestMemory?: Date;
}

// Production safeguards
const EXTRACTION_COOLDOWN_MS = 30 * 1000; // 30 seconds between extractions per user
const MAX_MEMORIES_PER_USER = 500; // Cap memories per user

class MemoryService {
  private pinecone: Pinecone | null = null;
  private openai: OpenAI | null = null;
  private indexName: string = 'dispotree-memory';
  private initialized: boolean = false;
  private embeddingModel: string = 'text-embedding-3-small';
  private embeddingDimensions: number = 1536;
  private lastExtractionTime: Map<string, number> = new Map(); // userId -> timestamp

  /**
   * Initialize the memory service
   */
  async initialize(): Promise<void> {
    const pineconeKey = process.env.PINECONE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!pineconeKey || !openaiKey) {
      console.warn('  Memory Service: Missing API keys - disabled');
      return;
    }

    try {
      this.pinecone = new Pinecone({ apiKey: pineconeKey });
      this.openai = new OpenAI({ apiKey: openaiKey });

      await this.ensureIndex();
      this.initialized = true;
      console.log(`  Memory Service initialized with index: ${this.indexName}`);
    } catch (error) {
      console.error('  Failed to initialize Memory Service:', error);
    }
  }

  /**
   * Ensure the Pinecone index exists
   */
  private async ensureIndex(): Promise<void> {
    if (!this.pinecone) return;

    try {
      const indexes = await this.pinecone.listIndexes();
      const indexExists = indexes.indexes?.some((idx) => idx.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating memory index: ${this.indexName}...`);
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: this.embeddingDimensions,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1',
            },
          },
        });

        // Wait for index to be ready
        await this.waitForIndex();
      }
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Wait for index to be ready
   */
  private async waitForIndex(): Promise<void> {
    if (!this.pinecone) return;

    let ready = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!ready && attempts < maxAttempts) {
      const description = await this.pinecone.describeIndex(this.indexName);
      ready = description.status?.ready === true;

      if (!ready) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;
      }
    }

    if (!ready) {
      throw new Error('Memory index failed to become ready');
    }
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }

    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return response.data[0].embedding;
  }

  /**
   * Store a memory
   */
  async storeMemory(memory: Omit<Memory, 'id'>): Promise<string> {
    if (!this.initialized || !this.pinecone) {
      throw new Error('Memory service not initialized');
    }

    const id = `mem-${memory.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const embedding = await this.generateEmbedding(memory.content);

    const index = this.pinecone.index(this.indexName);

    // Build metadata without undefined values (Pinecone doesn't accept undefined)
    const metadata: Record<string, string | number> = {
      userId: memory.userId,
      type: memory.type,
      content: memory.content.substring(0, 1000), // Truncate for metadata
      createdAt: memory.metadata.createdAt.toISOString(),
      source: memory.metadata.source || 'conversation',
      importance: memory.metadata.importance || 5,
      tags: memory.metadata.tags?.join(',') || '',
    };

    // Only add optional fields if they have values
    if (memory.metadata.propertyId) {
      metadata.propertyId = memory.metadata.propertyId;
    }
    if (memory.metadata.sessionId) {
      metadata.sessionId = memory.metadata.sessionId;
    }

    await index.upsert([
      {
        id,
        values: embedding,
        metadata,
      },
    ]);

    return id;
  }

  /**
   * Store multiple memories efficiently
   */
  async storeMemories(memories: Omit<Memory, 'id'>[]): Promise<string[]> {
    if (!this.initialized || !this.pinecone) {
      throw new Error('Memory service not initialized');
    }

    const vectors = await Promise.all(
      memories.map(async (memory) => {
        const id = `mem-${memory.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const embedding = await this.generateEmbedding(memory.content);

        // Build metadata without undefined values
        const metadata: Record<string, string | number> = {
          userId: memory.userId,
          type: memory.type,
          content: memory.content.substring(0, 1000),
          createdAt: memory.metadata.createdAt.toISOString(),
          source: memory.metadata.source || 'conversation',
          importance: memory.metadata.importance || 5,
          tags: memory.metadata.tags?.join(',') || '',
        };

        if (memory.metadata.propertyId) {
          metadata.propertyId = memory.metadata.propertyId;
        }
        if (memory.metadata.sessionId) {
          metadata.sessionId = memory.metadata.sessionId;
        }

        return { id, values: embedding, metadata };
      })
    );

    const index = this.pinecone.index(this.indexName);
    await index.upsert(vectors);

    return vectors.map((v) => v.id);
  }

  /**
   * Search memories by semantic similarity
   */
  async searchMemories(
    userId: string,
    query: string,
    options: {
      topK?: number;
      types?: Memory['type'][];
      minImportance?: number;
    } = {}
  ): Promise<MemorySearchResult[]> {
    if (!this.initialized || !this.pinecone) {
      return [];
    }

    const { topK = 5, types, minImportance } = options;
    const queryEmbedding = await this.generateEmbedding(query);

    const index = this.pinecone.index(this.indexName);

    // Build filter
    const filter: Record<string, any> = { userId };
    if (types && types.length > 0) {
      filter.type = { $in: types };
    }
    if (minImportance) {
      filter.importance = { $gte: minImportance };
    }

    const results = await index.query({
      vector: queryEmbedding,
      topK,
      filter,
      includeMetadata: true,
    });

    return (results.matches || []).map((match) => ({
      id: match.id,
      content: (match.metadata?.content as string) || '',
      type: (match.metadata?.type as Memory['type']) || 'fact',
      score: match.score || 0,
      metadata: {
        createdAt: new Date((match.metadata?.createdAt as string) || Date.now()),
        source: match.metadata?.source as string,
        importance: match.metadata?.importance as number,
        propertyId: match.metadata?.propertyId as string,
        sessionId: match.metadata?.sessionId as string,
        tags: (match.metadata?.tags as string)?.split(',').filter(Boolean),
      },
    }));
  }

  /**
   * Get all memories for a user (with optional filtering)
   */
  async getUserMemories(
    userId: string,
    options: {
      type?: Memory['type'];
      limit?: number;
    } = {}
  ): Promise<MemorySearchResult[]> {
    if (!this.initialized || !this.pinecone) {
      return [];
    }

    // Use a generic query to get user's memories
    return this.searchMemories(userId, 'user preferences and past decisions', {
      topK: options.limit || 20,
      types: options.type ? [options.type] : undefined,
    });
  }

  /**
   * Delete a memory
   */
  async deleteMemory(memoryId: string): Promise<void> {
    if (!this.initialized || !this.pinecone) {
      throw new Error('Memory service not initialized');
    }

    const index = this.pinecone.index(this.indexName);
    await index.deleteOne(memoryId);
  }

  /**
   * Delete all memories for a user
   */
  async clearUserMemories(userId: string): Promise<void> {
    if (!this.initialized || !this.pinecone) {
      throw new Error('Memory service not initialized');
    }

    const index = this.pinecone.index(this.indexName);
    await index.deleteMany({ userId });
  }

  /**
   * Extract memories from a conversation
   * Uses GPT to identify important information worth remembering
   * Rate-limited per user to prevent cost explosion
   */
  async extractMemoriesFromConversation(
    userId: string,
    sessionId: string,
    messages: { role: string; content: string }[]
  ): Promise<Memory[]> {
    if (!this.openai) {
      return [];
    }

    // Check cooldown to prevent excessive API calls
    const lastExtraction = this.lastExtractionTime.get(userId) || 0;
    const now = Date.now();
    if (now - lastExtraction < EXTRACTION_COOLDOWN_MS) {
      return []; // Skip extraction, still in cooldown
    }
    this.lastExtractionTime.set(userId, now);

    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You extract important information from real estate conversations that should be remembered for future interactions.

Extract the following types of memories:
1. PREFERENCES: User's preferred markets, property types, price ranges, deal criteria
2. DEAL_DECISIONS: Deals the user liked, rejected, or showed interest in (and why)
3. FACTS: Important information about the user's situation, goals, or constraints

Return a JSON array of memories. Each memory should have:
- type: "preference" | "deal_decision" | "fact"
- content: A clear, concise statement of what to remember
- importance: 1-10 (10 = critical to remember)
- tags: Array of relevant tags

Only extract genuinely important information. Skip routine queries.
If nothing important to remember, return an empty array.`,
          },
          {
            role: 'user',
            content: conversationText,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
      });

      // PRODUCTION FIX: Safely parse JSON with try-catch to handle malformed LLM responses
      let result: { memories?: any[] };
      try {
        result = JSON.parse(response.choices[0].message.content || '{"memories":[]}');
      } catch (parseError) {
        console.error('Failed to parse memory extraction response:', parseError);
        console.error('Raw content:', response.choices[0].message.content?.substring(0, 200));
        return []; // Return empty instead of crashing
      }

      // Validate the parsed result has the expected structure
      if (!result || typeof result !== 'object' || !Array.isArray(result.memories)) {
        console.warn('Memory extraction returned unexpected format:', typeof result);
        return [];
      }

      const memories: Memory[] = (result.memories || []).map((m: any) => ({
        id: '', // Will be assigned when storing
        userId,
        type: m.type,
        content: m.content,
        metadata: {
          createdAt: new Date(),
          source: 'conversation',
          importance: m.importance || 5,
          sessionId,
          tags: m.tags || [],
        },
      }));

      return memories;
    } catch (error) {
      console.error('Error extracting memories:', error);
      return [];
    }
  }

  /**
   * Store a deal decision memory
   */
  async storeDealDecision(
    userId: string,
    propertyId: string,
    decision: 'liked' | 'rejected' | 'submitted' | 'passed',
    reason?: string
  ): Promise<string> {
    const content = reason
      ? `User ${decision} property ${propertyId}: ${reason}`
      : `User ${decision} property ${propertyId}`;

    return this.storeMemory({
      userId,
      type: 'deal_decision',
      content,
      metadata: {
        createdAt: new Date(),
        source: 'deal_action',
        importance: decision === 'submitted' ? 8 : 6,
        propertyId,
        tags: [decision],
      },
    });
  }

  /**
   * Store a user preference
   */
  async storePreference(
    userId: string,
    preference: string,
    importance: number = 7
  ): Promise<string> {
    return this.storeMemory({
      userId,
      type: 'preference',
      content: preference,
      metadata: {
        createdAt: new Date(),
        source: 'explicit',
        importance,
        tags: ['preference'],
      },
    });
  }

  /**
   * Get relevant context for a query
   * Returns formatted string of relevant memories
   */
  async getRelevantContext(userId: string, query: string): Promise<string | null> {
    const memories = await this.searchMemories(userId, query, {
      topK: 5,
      minImportance: 4,
    });

    if (memories.length === 0) {
      return null;
    }

    const contextParts = memories.map((m) => {
      const typeLabel = {
        preference: 'User Preference',
        deal_decision: 'Past Decision',
        fact: 'Known Fact',
        session_summary: 'Previous Context',
      }[m.type];

      return `[${typeLabel}] ${m.content}`;
    });

    return `Relevant user context:\n${contextParts.join('\n')}`;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get memory statistics for a user
   */
  async getStats(userId: string): Promise<MemoryStats> {
    const memories = await this.getUserMemories(userId, { limit: 100 });

    const byType: Record<string, number> = {};
    let oldestDate: Date | undefined;
    let newestDate: Date | undefined;

    for (const memory of memories) {
      byType[memory.type] = (byType[memory.type] || 0) + 1;

      const memDate = memory.metadata.createdAt;
      if (!oldestDate || memDate < oldestDate) oldestDate = memDate;
      if (!newestDate || memDate > newestDate) newestDate = memDate;
    }

    return {
      totalMemories: memories.length,
      byType,
      oldestMemory: oldestDate,
      newestMemory: newestDate,
    };
  }
}

export const memoryService = new MemoryService();
export default memoryService;
