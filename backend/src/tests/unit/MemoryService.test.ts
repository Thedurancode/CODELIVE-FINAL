/**
 * MemoryService Unit Tests
 *
 * Tests for the long-term vector memory system
 */

// Mock Pinecone
const mockUpsert = jest.fn().mockResolvedValue({});
const mockQuery = jest.fn().mockResolvedValue({ matches: [] });
const mockDeleteOne = jest.fn().mockResolvedValue({});
const mockDeleteMany = jest.fn().mockResolvedValue({});

jest.mock('@pinecone-database/pinecone', () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    listIndexes: jest.fn().mockResolvedValue({
      indexes: [{ name: 'dispotree-memory' }],
    }),
    describeIndex: jest.fn().mockResolvedValue({
      status: { ready: true },
    }),
    index: jest.fn().mockReturnValue({
      upsert: mockUpsert,
      query: mockQuery,
      deleteOne: mockDeleteOne,
      deleteMany: mockDeleteMany,
    }),
    createIndex: jest.fn().mockResolvedValue({}),
  })),
}));

// Mock OpenAI
const mockEmbeddingsCreate = jest.fn().mockResolvedValue({
  data: [{ embedding: new Array(1536).fill(0.1) }],
});

const mockChatCreate = jest.fn().mockResolvedValue({
  choices: [
    {
      message: {
        content: JSON.stringify({
          memories: [
            {
              type: 'preference',
              content: 'User prefers properties in Tampa',
              importance: 8,
              tags: ['location', 'tampa'],
            },
          ],
        }),
      },
    },
  ],
});

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: mockEmbeddingsCreate,
    },
    chat: {
      completions: {
        create: mockChatCreate,
      },
    },
  }));
});

import { memoryService } from '../../services/MemoryService';

describe('MemoryService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      PINECONE_API_KEY: 'test-pinecone-key',
      OPENAI_API_KEY: 'test-openai-key',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('initialize', () => {
    it('should initialize successfully with API keys', async () => {
      await memoryService.initialize();
      expect(memoryService.isReady()).toBe(true);
    });

    it('should not initialize without Pinecone API key', async () => {
      delete process.env.PINECONE_API_KEY;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Create a fresh instance to test initialization
      const MemoryServiceClass = (memoryService as any).constructor;
      const freshService = new MemoryServiceClass();
      await freshService.initialize();

      expect(freshService.isReady()).toBe(false);
      warnSpy.mockRestore();
    });

    it('should not initialize without OpenAI API key', async () => {
      delete process.env.OPENAI_API_KEY;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const MemoryServiceClass = (memoryService as any).constructor;
      const freshService = new MemoryServiceClass();
      await freshService.initialize();

      expect(freshService.isReady()).toBe(false);
      warnSpy.mockRestore();
    });
  });

  // ============================================================================
  // STORE MEMORY TESTS
  // ============================================================================

  describe('storeMemory', () => {
    beforeEach(async () => {
      await memoryService.initialize();
    });

    it('should store a memory successfully', async () => {
      const memoryId = await memoryService.storeMemory({
        userId: 'user-123',
        type: 'preference',
        content: 'User prefers Tampa market',
        metadata: {
          createdAt: new Date(),
          source: 'conversation',
          importance: 8,
          tags: ['location'],
        },
      });

      expect(memoryId).toMatch(/^mem-user-123-/);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'User prefers Tampa market',
      });
      expect(mockUpsert).toHaveBeenCalled();
    });

    it('should truncate long content in metadata', async () => {
      const longContent = 'x'.repeat(2000);

      await memoryService.storeMemory({
        userId: 'user-123',
        type: 'fact',
        content: longContent,
        metadata: {
          createdAt: new Date(),
          importance: 5,
        },
      });

      const upsertCall = mockUpsert.mock.calls[0][0][0];
      expect(upsertCall.metadata.content.length).toBeLessThanOrEqual(1000);
    });

    it('should handle optional metadata fields', async () => {
      await memoryService.storeMemory({
        userId: 'user-123',
        type: 'preference',
        content: 'Test content',
        metadata: {
          createdAt: new Date(),
          propertyId: 'prop-456',
          sessionId: 'session-789',
        },
      });

      const upsertCall = mockUpsert.mock.calls[0][0][0];
      expect(upsertCall.metadata.propertyId).toBe('prop-456');
      expect(upsertCall.metadata.sessionId).toBe('session-789');
    });
  });

  // ============================================================================
  // STORE MEMORIES (BATCH) TESTS
  // ============================================================================

  describe('storeMemories', () => {
    beforeEach(async () => {
      await memoryService.initialize();
    });

    it('should store multiple memories in batch', async () => {
      const memories = [
        {
          userId: 'user-123',
          type: 'preference' as const,
          content: 'Prefers Tampa',
          metadata: { createdAt: new Date(), importance: 8 },
        },
        {
          userId: 'user-123',
          type: 'fact' as const,
          content: 'Budget is $300k',
          metadata: { createdAt: new Date(), importance: 7 },
        },
      ];

      const ids = await memoryService.storeMemories(memories);

      expect(ids).toHaveLength(2);
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // SEARCH MEMORIES TESTS
  // ============================================================================

  describe('searchMemories', () => {
    beforeEach(async () => {
      await memoryService.initialize();
    });

    it('should search memories by query', async () => {
      mockQuery.mockResolvedValueOnce({
        matches: [
          {
            id: 'mem-123',
            score: 0.95,
            metadata: {
              content: 'User prefers Tampa',
              type: 'preference',
              createdAt: new Date().toISOString(),
              source: 'conversation',
              importance: 8,
              tags: 'location,tampa',
            },
          },
        ],
      });

      const results = await memoryService.searchMemories('user-123', 'Tampa properties');

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('User prefers Tampa');
      expect(results[0].score).toBe(0.95);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          topK: 5,
          filter: { userId: 'user-123' },
          includeMetadata: true,
        })
      );
    });

    it('should filter by memory types', async () => {
      mockQuery.mockResolvedValueOnce({ matches: [] });

      await memoryService.searchMemories('user-123', 'query', {
        types: ['preference', 'fact'],
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            userId: 'user-123',
            type: { $in: ['preference', 'fact'] },
          },
        })
      );
    });

    it('should filter by minimum importance', async () => {
      mockQuery.mockResolvedValueOnce({ matches: [] });

      await memoryService.searchMemories('user-123', 'query', {
        minImportance: 7,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            userId: 'user-123',
            importance: { $gte: 7 },
          },
        })
      );
    });

    it('should return empty array when not initialized', async () => {
      const MemoryServiceClass = (memoryService as any).constructor;
      const uninitService = new MemoryServiceClass();

      const results = await uninitService.searchMemories('user-123', 'query');

      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // EXTRACT MEMORIES TESTS
  // ============================================================================

  describe('extractMemoriesFromConversation', () => {
    beforeEach(async () => {
      await memoryService.initialize();
      // Reset the cooldown tracking
      (memoryService as any).lastExtractionTime.clear();
    });

    it('should extract memories from conversation', async () => {
      const memories = await memoryService.extractMemoriesFromConversation(
        'user-123',
        'session-456',
        [
          { role: 'user', content: 'I prefer properties in Tampa under $200k' },
          { role: 'assistant', content: 'Got it! I\'ll remember that.' },
        ]
      );

      expect(memories).toHaveLength(1);
      expect(memories[0].type).toBe('preference');
      expect(memories[0].content).toBe('User prefers properties in Tampa');
      expect(mockChatCreate).toHaveBeenCalled();
    });

    it('should respect cooldown period', async () => {
      // First extraction should work
      await memoryService.extractMemoriesFromConversation('user-123', 'session-1', [
        { role: 'user', content: 'Test message' },
      ]);

      // Second extraction within cooldown should be skipped
      const memories = await memoryService.extractMemoriesFromConversation(
        'user-123',
        'session-2',
        [{ role: 'user', content: 'Another message' }]
      );

      expect(memories).toEqual([]);
      expect(mockChatCreate).toHaveBeenCalledTimes(1);
    });

    it('should allow extraction for different users', async () => {
      await memoryService.extractMemoriesFromConversation('user-123', 'session-1', [
        { role: 'user', content: 'Test' },
      ]);

      await memoryService.extractMemoriesFromConversation('user-456', 'session-2', [
        { role: 'user', content: 'Test' },
      ]);

      expect(mockChatCreate).toHaveBeenCalledTimes(2);
    });

    it('should handle empty response from GPT', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"memories":[]}' } }],
      });

      const memories = await memoryService.extractMemoriesFromConversation(
        'user-new',
        'session-1',
        [{ role: 'user', content: 'Hello' }]
      );

      expect(memories).toEqual([]);
    });
  });

  // ============================================================================
  // DELETE MEMORY TESTS
  // ============================================================================

  describe('deleteMemory', () => {
    beforeEach(async () => {
      await memoryService.initialize();
    });

    it('should delete a single memory', async () => {
      await memoryService.deleteMemory('mem-123');

      expect(mockDeleteOne).toHaveBeenCalledWith('mem-123');
    });
  });

  describe('clearUserMemories', () => {
    beforeEach(async () => {
      await memoryService.initialize();
    });

    it('should clear all memories for a user', async () => {
      await memoryService.clearUserMemories('user-123');

      expect(mockDeleteMany).toHaveBeenCalledWith({ userId: 'user-123' });
    });
  });

  // ============================================================================
  // HELPER METHODS TESTS
  // ============================================================================

  describe('storeDealDecision', () => {
    beforeEach(async () => {
      await memoryService.initialize();
    });

    it('should store a deal decision', async () => {
      await memoryService.storeDealDecision(
        'user-123',
        'prop-456',
        'liked',
        'Great ARV spread'
      );

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0][0][0];
      expect(upsertCall.metadata.type).toBe('deal_decision');
      expect(upsertCall.metadata.propertyId).toBe('prop-456');
    });
  });

  describe('storePreference', () => {
    beforeEach(async () => {
      await memoryService.initialize();
    });

    it('should store a preference', async () => {
      await memoryService.storePreference('user-123', 'Prefers Tampa market', 9);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0][0][0];
      expect(upsertCall.metadata.type).toBe('preference');
      expect(upsertCall.metadata.importance).toBe(9);
    });
  });

  describe('getRelevantContext', () => {
    beforeEach(async () => {
      await memoryService.initialize();
    });

    it('should return formatted context string', async () => {
      mockQuery.mockResolvedValueOnce({
        matches: [
          {
            id: 'mem-1',
            score: 0.9,
            metadata: {
              content: 'User prefers Tampa',
              type: 'preference',
              createdAt: new Date().toISOString(),
              importance: 8,
            },
          },
          {
            id: 'mem-2',
            score: 0.85,
            metadata: {
              content: 'Rejected property due to flood zone',
              type: 'deal_decision',
              createdAt: new Date().toISOString(),
              importance: 7,
            },
          },
        ],
      });

      const context = await memoryService.getRelevantContext('user-123', 'Tampa deals');

      expect(context).toContain('Relevant user context:');
      expect(context).toContain('[User Preference] User prefers Tampa');
      expect(context).toContain('[Past Decision] Rejected property due to flood zone');
    });

    it('should return null when no memories found', async () => {
      mockQuery.mockResolvedValueOnce({ matches: [] });

      const context = await memoryService.getRelevantContext('user-123', 'query');

      expect(context).toBeNull();
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await memoryService.initialize();
    });

    it('should return memory statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        matches: [
          {
            id: 'mem-1',
            score: 0.9,
            metadata: {
              type: 'preference',
              content: 'Test',
              createdAt: '2024-01-01T00:00:00Z',
            },
          },
          {
            id: 'mem-2',
            score: 0.85,
            metadata: {
              type: 'preference',
              content: 'Test 2',
              createdAt: '2024-01-15T00:00:00Z',
            },
          },
          {
            id: 'mem-3',
            score: 0.8,
            metadata: {
              type: 'fact',
              content: 'Test 3',
              createdAt: '2024-01-10T00:00:00Z',
            },
          },
        ],
      });

      const stats = await memoryService.getStats('user-123');

      expect(stats.totalMemories).toBe(3);
      expect(stats.byType.preference).toBe(2);
      expect(stats.byType.fact).toBe(1);
    });
  });
});
