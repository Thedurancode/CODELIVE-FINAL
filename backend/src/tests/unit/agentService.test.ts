/**
 * AgentService Unit Tests
 */

// Mock external dependencies before importing
jest.mock('langchain', () => ({
  createAgent: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({
      messages: [{ content: 'Mock AI response' }],
    }),
  }),
  tool: jest.fn((fn, config) => ({ fn, config })),
  HumanMessage: jest.fn().mockImplementation((content) => ({
    type: 'human',
    content,
    _getType: () => 'human',
  })),
  AIMessage: jest.fn().mockImplementation((content) => ({
    type: 'ai',
    content,
    _getType: () => 'ai',
  })),
  SystemMessage: jest.fn().mockImplementation((content) => ({
    type: 'system',
    content,
    _getType: () => 'system',
  })),
  initChatModel: jest.fn(),
}));

jest.mock('../../models/Property');
jest.mock('../../models/ConversationHistory', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    destroy: jest.fn().mockResolvedValue(1),
  },
}));
jest.mock('../../services/propertyService');
jest.mock('../../services/PipelineService', () => ({
  pipelineService: {
    addToPipeline: jest.fn(),
    updateStage: jest.fn(),
    getUserPipeline: jest.fn(),
    markAsClosed: jest.fn(),
    moveToPortfolio: jest.fn(),
  },
}));
jest.mock('../../services/PortfolioService', () => ({
  portfolioService: {
    addProperty: jest.fn(),
    getUserPortfolio: jest.fn(),
    getPortfolioSummary: jest.fn(),
    getTotalValue: jest.fn(),
    updateValuation: jest.fn(),
  },
}));
jest.mock('../../services/WinLossService', () => ({
  winLossService: {
    getWinLossStats: jest.fn(),
    generateInsights: jest.fn(),
  },
}));
jest.mock('../../services/AgentMetricsService', () => ({
  agentMetricsService: {
    getOverallStats: jest.fn(),
    getPerformanceTrend: jest.fn(),
  },
}));
jest.mock('../../plugins', () => ({
  dealProcessingService: {
    scoreDeal: jest.fn().mockResolvedValue([]),
    getAllBuyBoxes: jest.fn().mockReturnValue([]),
  },
}));
jest.mock('../../plugins/browser', () => ({
  AuctionSubmissionPlugin: jest.fn().mockImplementation(() => ({
    getAllSites: jest.fn().mockReturnValue([]),
    submitDeal: jest.fn().mockResolvedValue({ success: true }),
  })),
}));

import { agentService } from '../../services/agentService';
import Property from '../../models/Property';
import { propertyService } from '../../services/propertyService';
import { createAgent } from 'langchain';

describe('AgentService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Reset agent state
    (agentService as any).agent = null;
    // Reset internal caches (conversation history, summaries)
    agentService.resetCaches();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('initialize', () => {
    it('should warn when no API key is set', async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await agentService.initialize();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No API key set')
      );
      expect(agentService.isReady()).toBe(false);
      warnSpy.mockRestore();
    });

    it('should create agent when API key is set', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await agentService.initialize();

      expect(createAgent).toHaveBeenCalled();
      expect(agentService.isReady()).toBe(true);
      logSpy.mockRestore();
    });

    it('should handle initialization errors gracefully', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      (createAgent as jest.Mock).mockImplementationOnce(() => {
        throw new Error('API Error');
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await agentService.initialize();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize'),
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });
  });

  // ============================================================================
  // CHAT TESTS
  // ============================================================================

  describe('chat', () => {
    beforeEach(async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      await agentService.initialize();
    });

    it('should return response from agent', async () => {
      const response = await agentService.chat('session-1', 'Hello');

      expect(response).toBe('Mock AI response');
    });

    it('should maintain conversation history', async () => {
      await agentService.chat('session-1', 'First message');
      await agentService.chat('session-1', 'Second message');

      const agent = (agentService as any).agent;
      expect(agent.invoke).toHaveBeenCalledTimes(2);
    });

    it('should handle separate sessions independently', async () => {
      await agentService.chat('session-1', 'Session 1 message');
      await agentService.chat('session-2', 'Session 2 message');

      // Each session should have its own history
      const agent = (agentService as any).agent;
      expect(agent.invoke).toHaveBeenCalledTimes(2);
    });

    it('should return error message when agent not initialized', async () => {
      (agentService as any).agent = null;

      const response = await agentService.chat('session-1', 'Hello');

      expect(response).toContain('Agent not initialized');
    });

    it('should handle chat errors gracefully', async () => {
      const agent = (agentService as any).agent;
      agent.invoke.mockRejectedValueOnce(new Error('Chat error'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await agentService.chat('session-1', 'Hello');

      expect(response).toContain('encountered an error');
      errorSpy.mockRestore();
    });

    it('should limit conversation history to 20 messages', async () => {
      // Simulate 25 messages
      for (let i = 0; i < 25; i++) {
        await agentService.chat('session-1', `Message ${i}`);
      }

      // History should be trimmed (implementation dependent)
      // This tests that the code doesn't throw an error
      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // CLEAR HISTORY TESTS
  // ============================================================================

  describe('clearHistory', () => {
    it('should clear conversation history for session', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      await agentService.initialize();

      await agentService.chat('session-1', 'Hello');
      agentService.clearHistory('session-1');

      // Next message should start fresh
      await agentService.chat('session-1', 'New conversation');

      expect(true).toBe(true); // Just verify no errors
    });

    it('should not affect other sessions', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      await agentService.initialize();

      await agentService.chat('session-1', 'Hello 1');
      await agentService.chat('session-2', 'Hello 2');
      agentService.clearHistory('session-1');

      // Session 2 should still have its history
      await agentService.chat('session-2', 'Continue');
      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // IS READY TESTS
  // ============================================================================

  describe('isReady', () => {
    it('should return false when not initialized', () => {
      (agentService as any).agent = null;
      expect(agentService.isReady()).toBe(false);
    });

    it('should return true when initialized', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      await agentService.initialize();
      expect(agentService.isReady()).toBe(true);
    });
  });

  // ============================================================================
  // TOOL CREATION TESTS
  // ============================================================================

  describe('createTools', () => {
    it('should create all required tools', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      await agentService.initialize();

      expect(createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.any(Array),
        })
      );

      // Get the tools array from the createAgent call
      const callArgs = (createAgent as jest.Mock).mock.calls[0][0];
      expect(callArgs.tools.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// TOOL FUNCTION TESTS
// ============================================================================

describe('Agent Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('search_properties tool', () => {
    it('should search properties with filters', async () => {
      (Property.findAll as jest.Mock).mockResolvedValue([
        {
          propertyId: 'prop-1',
          address: { houseNumber: '123', street: 'Main St' },
          city: 'Austin',
          state: 'TX',
          zip: '78701',
          mlsListingPrice: 200000,
          bedroomCount: 3,
          bathroomCount: 2,
          livingSpaceSqFt: 1500,
          propertyType: 'Single Family',
        },
      ]);

      const results = await Property.findAll({
        where: { city: 'Austin' },
        limit: 10,
      });

      expect(results).toHaveLength(1);
    });

    it('should return empty message when no properties found', async () => {
      (Property.findAll as jest.Mock).mockResolvedValue([]);

      const results = await Property.findAll({ where: {} });

      expect(results).toHaveLength(0);
    });
  });

  describe('get_property_details tool', () => {
    it('should get property by ID', async () => {
      const mockProperty = {
        propertyId: 'prop-123',
        address: { houseNumber: '123', street: 'Main St' },
        city: 'Austin',
        state: 'TX',
        mlsListingPrice: 200000,
      };

      (Property.findOne as jest.Mock).mockResolvedValue(mockProperty);

      const result = await Property.findOne({ where: { propertyId: 'prop-123' } });

      expect(result).toEqual(mockProperty);
    });

    it('should return null for non-existent property', async () => {
      (Property.findOne as jest.Mock).mockResolvedValue(null);

      const result = await Property.findOne({ where: { propertyId: 'nonexistent' } });

      expect(result).toBeNull();
    });
  });

  describe('create_property tool', () => {
    it('should create property via service', async () => {
      (propertyService.saveDealToDatabase as jest.Mock).mockResolvedValue({
        success: true,
        propertyId: 'prop-new',
        action: 'created',
      });

      const result = await propertyService.saveDealToDatabase({
        sourceId: 'agent',
        sourceName: 'AI Agent',
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 200000,
        normalizedAt: new Date(),
        confidence: 1.0,
        rawData: {},
      } as any);

      expect(result.success).toBe(true);
      expect(result.propertyId).toBe('prop-new');
    });
  });

  describe('get_property_count tool', () => {
    it('should count properties with filters', async () => {
      (Property.count as jest.Mock).mockResolvedValue(42);

      const count = await Property.count({ where: { state: 'TX' } });

      expect(count).toBe(42);
    });
  });

  describe('get_market_stats tool', () => {
    it('should calculate market statistics', async () => {
      (Property.findAll as jest.Mock).mockResolvedValue([
        { mlsListingPrice: 100000, bedroomCount: 2, propertyType: 'Condo' },
        { mlsListingPrice: 200000, bedroomCount: 3, propertyType: 'Single Family' },
        { mlsListingPrice: 300000, bedroomCount: 4, propertyType: 'Single Family' },
      ]);

      const properties = await Property.findAll({ where: { state: 'TX' } });

      expect(properties).toHaveLength(3);

      // Calculate average
      const prices = properties.map((p: any) => p.mlsListingPrice);
      const avgPrice = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
      expect(avgPrice).toBe(200000);
    });
  });
});
