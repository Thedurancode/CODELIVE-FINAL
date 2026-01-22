/**
 * Knowledge & Memory Tools
 *
 * Tools for RAG knowledge base search and user memory management.
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import { knowledgeService } from '../../knowledge';
import { memoryService } from '../../MemoryService';

/**
 * Register all knowledge and memory tools with the registry
 */
export function registerKnowledgeTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // SEARCH KNOWLEDGE
    // =========================================================================
    defineTool({
      name: 'search_knowledge',
      description:
        'Search the knowledge base for information. Returns relevant documents, contracts, guides, and regulations.',
      category: 'knowledge',
      schema: z.object({
        query: z.string().describe('Search query'),
        category: z
          .string()
          .optional()
          .describe('Category filter (contracts, guides, regulations, etc.)'),
        limit: z.number().optional().default(5).describe('Number of results to return'),
      }),
      handler: async (input, context) => {
        try {
          if (!knowledgeService.isReady()) {
            return success({
              results: [],
              message: 'Knowledge service not available. Please check Pinecone configuration.',
            });
          }

          const results = await knowledgeService.search(input.query, input.limit || 5) as any[];

          return success({
            query: input.query,
            results: results.map((r: any) => ({
              title: r.title || r.metadata?.title,
              content: r.content?.substring(0, 500) + (r.content?.length > 500 ? '...' : ''),
              category: r.category || r.metadata?.category,
              score: r.score,
              source: r.source || r.metadata?.source,
            })),
            count: results.length,
          });
        } catch (error) {
          return failure(`Error searching knowledge base: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 30 * 60, // 30 minutes
    }),

    // =========================================================================
    // GET KNOWLEDGE STATS
    // =========================================================================
    defineTool({
      name: 'get_knowledge_stats',
      description: 'Get statistics about the knowledge base including document count and categories.',
      category: 'knowledge',
      schema: z.object({}),
      handler: async (input, context) => {
        try {
          if (!knowledgeService.isReady()) {
            return success({
              ready: false,
              message: 'Knowledge service not available.',
            });
          }

          const stats = await knowledgeService.getStats() as any;

          return success({
            ready: true,
            totalDocuments: stats.totalDocuments,
            lastUpdated: stats.lastUpdated,
          });
        } catch (error) {
          return failure(`Error getting knowledge stats: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 60 * 60, // 1 hour
    }),

    // =========================================================================
    // REMEMBER PREFERENCE
    // =========================================================================
    defineTool({
      name: 'remember_preference',
      description:
        "Store a user preference or important information in long-term memory. Use when user shares preferences, feedback, or important context that should be remembered for future conversations.",
      category: 'knowledge',
      schema: z.object({
        content: z.string().describe('The preference or information to remember'),
        category: z
          .enum(['preference', 'feedback', 'context', 'decision', 'instruction'])
          .describe('Category of the memory'),
        importance: z
          .enum(['low', 'medium', 'high'])
          .optional()
          .default('medium')
          .describe('Importance level'),
      }),
      handler: async (input, context) => {
        try {
          if (!memoryService.isReady()) {
            return success({
              stored: false,
              message: 'Memory service not available.',
            });
          }

          if (!context.userId) {
            return failure('User ID required to store memories.');
          }

          await memoryService.storeMemory({
            userId: context.userId,
            content: input.content,
            type: input.category as any,
            importance: input.importance,
            sessionId: context.sessionId,
          } as any);

          return success({
            stored: true,
            category: input.category,
            message: `I'll remember that: "${input.content.substring(0, 100)}${input.content.length > 100 ? '...' : ''}"`,
          });
        } catch (error) {
          return failure(`Error storing preference: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // RECALL MEMORIES
    // =========================================================================
    defineTool({
      name: 'recall_memories',
      description:
        'Recall relevant memories for the current context. Use to personalize responses based on past interactions.',
      category: 'knowledge',
      schema: z.object({
        query: z.string().optional().describe('Search query for specific memories'),
        category: z
          .enum(['preference', 'feedback', 'context', 'decision', 'instruction', 'all'])
          .optional()
          .default('all')
          .describe('Category filter'),
        limit: z.number().optional().default(5).describe('Number of memories to recall'),
      }),
      handler: async (input, context) => {
        try {
          if (!memoryService.isReady()) {
            return success({
              memories: [],
              message: 'Memory service not available.',
            });
          }

          if (!context.userId) {
            return failure('User ID required to recall memories.');
          }

          const memories = await memoryService.searchMemories(context.userId, input.query || '', {
            topK: input.limit,
          }) as any[];

          return success({
            memories: memories.map((m: any) => ({
              content: m.content,
              category: m.category,
              importance: m.importance,
              createdAt: m.createdAt,
            })),
            count: memories.length,
          });
        } catch (error) {
          return failure(`Error recalling memories: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET MEMORY STATS
    // =========================================================================
    defineTool({
      name: 'get_memory_stats',
      description: "Get statistics about the user's stored memories.",
      category: 'knowledge',
      schema: z.object({}),
      handler: async (input, context) => {
        try {
          if (!memoryService.isReady()) {
            return success({
              ready: false,
              message: 'Memory service not available.',
            });
          }

          if (!context.userId) {
            return failure('User ID required to get memory stats.');
          }

          const stats = await memoryService.getStats(context.userId) as any;

          return success({
            ready: true,
            totalMemories: stats.totalMemories,
            oldestMemory: stats.oldestMemory,
            newestMemory: stats.newestMemory,
          });
        } catch (error) {
          return failure(`Error getting memory stats: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // CLEAR MEMORIES
    // =========================================================================
    defineTool({
      name: 'clear_memories',
      description:
        "Clear stored memories. Use with caution - this permanently deletes the user's stored preferences and context.",
      category: 'knowledge',
      schema: z.object({
        category: z
          .enum(['preference', 'feedback', 'context', 'decision', 'instruction', 'all'])
          .optional()
          .default('all')
          .describe('Category to clear (or all)'),
        confirm: z.boolean().describe('Must be true to confirm deletion'),
      }),
      handler: async (input, context) => {
        try {
          if (!input.confirm) {
            return failure('Deletion not confirmed. Set confirm=true to clear memories.');
          }

          if (!memoryService.isReady()) {
            return success({
              cleared: false,
              message: 'Memory service not available.',
            });
          }

          if (!context.userId) {
            return failure('User ID required to clear memories.');
          }

          await memoryService.clearUserMemories(context.userId);

          return success({
            cleared: true,
            category: input.category,
            message:
              input.category === 'all'
                ? 'All memories have been cleared.'
                : `All ${input.category} memories have been cleared.`,
          });
        } catch (error) {
          return failure(`Error clearing memories: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerKnowledgeTools;
