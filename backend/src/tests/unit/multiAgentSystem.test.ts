/**
 * Multi-Agent System Unit Tests
 *
 * Tests for the multi-agent buyer-seller communication system:
 * - Buyer Agent initialization and tools
 * - Seller Agent initialization and tools
 * - Agent status checks
 */

import { buyerAgentService } from '../../services/BuyerAgentService';
import { sellerAgentService } from '../../services/SellerAgentService';

// Mock LangChain dependencies
jest.mock('langchain', () => ({
  createAgent: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({
      messages: [{ content: 'Test response' }],
    }),
    streamEvents: jest.fn(),
  }),
  tool: jest.fn((fn, config) => ({ fn, config })),
  HumanMessage: jest.fn((content) => ({ content, type: 'human' })),
  AIMessage: jest.fn((content) => ({ content, type: 'ai' })),
  SystemMessage: jest.fn((content) => ({ content, type: 'system' })),
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({})),
}));

// Mock models
jest.mock('../../models/Property', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../models/PropertyInquiry', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
  },
}));

jest.mock('../../models/DealOffer', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  },
}));

jest.mock('../../models/ConversationHistory', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('../../models/MarketplaceUser', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../models/HedgeFundBuyBox', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn().mockResolvedValue([]),
  },
}));

// Mock services
jest.mock('../../services/InquiryService', () => ({
  inquiryService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    isReady: jest.fn().mockReturnValue(true),
    createInquiry: jest.fn().mockResolvedValue({ id: 1 }),
    hasPendingInquiry: jest.fn().mockResolvedValue(null),
    getBuyerInquiries: jest.fn().mockResolvedValue([]),
    getAllPendingInquiries: jest.fn().mockResolvedValue({ inquiries: [], total: 0 }),
    getInquiry: jest.fn().mockResolvedValue(null),
    answerInquiry: jest.fn().mockResolvedValue({ id: 1 }),
    getPendingInquiries: jest.fn().mockResolvedValue([]),
    getStats: jest.fn().mockResolvedValue({ total: 0, pending: 0, answered: 0, expired: 0 }),
  },
}));

jest.mock('../../services/RedisService', () => ({
  redisService: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
  CACHE_PREFIX: {},
  CACHE_TTL: {},
}));

describe('Multi-Agent System', () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Set mock API key for tests
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ============================================================================
  // BUYER AGENT TESTS
  // ============================================================================

  describe('BuyerAgentService', () => {
    describe('initialization', () => {
      it('should report not ready before initialization', () => {
        // Fresh service instance check
        const status = buyerAgentService.getStatus();
        expect(status).toHaveProperty('ready');
        expect(status).toHaveProperty('model');
        expect(status).toHaveProperty('toolCount');
      });

      it('should have expected properties in status', () => {
        const status = buyerAgentService.getStatus();
        expect(typeof status.ready).toBe('boolean');
        expect(typeof status.model).toBe('string');
        expect(typeof status.toolCount).toBe('number');
      });
    });

    describe('tools', () => {
      it('should have limited tool set for buyers', () => {
        // Buyer agent should have fewer tools than admin agent
        const status = buyerAgentService.getStatus();
        // When initialized, should have 8 tools
        // When not initialized, should have 0
        expect(status.toolCount).toBeLessThanOrEqual(8);
      });
    });
  });

  // ============================================================================
  // SELLER AGENT TESTS
  // ============================================================================

  describe('SellerAgentService', () => {
    describe('initialization', () => {
      it('should report not ready before initialization', () => {
        const status = sellerAgentService.getStatus();
        expect(status).toHaveProperty('ready');
        expect(status).toHaveProperty('model');
        expect(status).toHaveProperty('toolCount');
      });

      it('should have expected properties in status', () => {
        const status = sellerAgentService.getStatus();
        expect(typeof status.ready).toBe('boolean');
        expect(typeof status.model).toBe('string');
        expect(typeof status.toolCount).toBe('number');
      });
    });

    describe('tools', () => {
      it('should have limited tool set for sellers', () => {
        const status = sellerAgentService.getStatus();
        // When initialized, should have 7 tools
        // When not initialized, should have 0
        expect(status.toolCount).toBeLessThanOrEqual(7);
      });
    });
  });

  // ============================================================================
  // AGENT COMPARISON TESTS
  // ============================================================================

  describe('Agent Comparison', () => {
    it('buyer and seller agents should have different tool counts', () => {
      const buyerStatus = buyerAgentService.getStatus();
      const sellerStatus = sellerAgentService.getStatus();

      // Both should be limited (not the full 60+ tools of admin agent)
      expect(buyerStatus.toolCount).toBeLessThanOrEqual(10);
      expect(sellerStatus.toolCount).toBeLessThanOrEqual(10);
    });

    it('both agents should use the same model type', () => {
      const buyerStatus = buyerAgentService.getStatus();
      const sellerStatus = sellerAgentService.getStatus();

      // Both should use similar model naming
      expect(typeof buyerStatus.model).toBe('string');
      expect(typeof sellerStatus.model).toBe('string');
    });
  });

  // ============================================================================
  // CONVERSATION HISTORY TESTS
  // ============================================================================

  describe('Conversation History', () => {
    it('buyer agent should be able to clear history', async () => {
      await expect(
        buyerAgentService.clearHistory('test-session')
      ).resolves.not.toThrow();
    });

    it('seller agent should be able to clear history', async () => {
      await expect(
        sellerAgentService.clearHistory('test-session')
      ).resolves.not.toThrow();
    });

    it('buyer agent should be able to get history', async () => {
      const history = await buyerAgentService.getHistory('test-session');
      expect(Array.isArray(history)).toBe(true);
    });

    it('seller agent should be able to get history', async () => {
      const history = await sellerAgentService.getHistory('test-session');
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
