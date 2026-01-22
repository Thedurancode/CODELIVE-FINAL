/**
 * Marketplace API Integration Tests
 */

import express, { Express } from 'express';
import { spawnSync } from 'child_process';
import type { Server } from 'http';
import request from 'supertest';
import marketplaceRoutes from '../../routes/marketplaceRoutes';

// Mock the auth middleware to bypass authentication
jest.mock('../../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', email: 'test@example.com', role: 'admin' };
    next();
  },
  optionalAuth: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', email: 'test@example.com', role: 'admin' };
    next();
  },
  authorize: (...roles: string[]) => (req: any, res: any, next: any) => next(),
}));

// Mock the services
jest.mock('../../services/MarketplaceService', () => ({
  marketplaceService: {
    createUser: jest.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'buyer',
    }),
    getUser: jest.fn().mockImplementation((id) => {
      if (id === 'nonexistent') return Promise.resolve(null);
      return Promise.resolve({
        id,
        email: 'test@example.com',
        name: 'Test User',
      });
    }),
    createUserBuyBox: jest.fn().mockResolvedValue({
      id: 'bb-123',
      userId: 'user-123',
      name: 'Texas Properties',
      states: ['TX'],
    }),
    getUserBuyBoxes: jest.fn().mockResolvedValue([
      { id: 'bb-1', name: 'Texas', states: ['TX'] },
      { id: 'bb-2', name: 'Florida', states: ['FL'] },
    ]),
    updateUserBuyBox: jest.fn().mockResolvedValue(true),
    getFeedForUser: jest.fn().mockResolvedValue({
      deals: [
        { id: 'deal-1', matchScore: 95, deal: { price: 200000 } },
        { id: 'deal-2', matchScore: 85, deal: { price: 180000 } },
      ],
      pagination: { page: 1, limit: 20, total: 2, hasMore: false },
      filters: { sortBy: 'match_score' },
    }),
    recordSwipe: jest.fn().mockResolvedValue({ success: true, message: 'Deal liked!' }),
    recordView: jest.fn().mockResolvedValue(undefined),
    createOffer: jest.fn().mockResolvedValue({
      id: 'offer-123',
      userId: 'user-123',
      dealId: 'deal-001',
      offerAmount: 200000,
      status: 'pending',
    }),
    getUserOffers: jest.fn().mockResolvedValue([
      { id: 'offer-1', status: 'pending' },
      { id: 'offer-2', status: 'accepted' },
    ]),
    respondToOffer: jest.fn().mockImplementation((id, response) => {
      if (id === 'nonexistent') return Promise.resolve(null);
      return Promise.resolve({ id, status: response });
    }),
    getUserBehaviorProfile: jest.fn().mockResolvedValue({
      userId: 'user-123',
      implicitPreferences: { avgLikedPrice: 200000 },
      topPassReasons: [],
      likeRate: 60,
    }),
    predictDealInterest: jest.fn().mockResolvedValue({
      dealId: 'deal-001',
      userId: 'user-123',
      predictedAction: 'like',
      confidence: 85,
      factors: [{ factor: 'Price in range', impact: 'positive', weight: 15 }],
    }),
    getPassReasonAnalytics: jest.fn().mockResolvedValue([
      { reason: 'price_too_high', label: 'Price too high', count: 10, percentage: 40 },
    ]),
    getDealAnalytics: jest.fn().mockResolvedValue({
      views: 50,
      likes: 20,
      passes: 30,
      offers: 5,
      conversionRate: 10,
    }),
    trackSave: jest.fn().mockResolvedValue(undefined),
    trackShare: jest.fn().mockResolvedValue(undefined),
    trackRequestInfo: jest.fn().mockResolvedValue(undefined),
    trackFilterUsage: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/DealComparisonService', () => ({
  dealComparisonService: {
    compareDeals: jest.fn().mockResolvedValue({
      deals: [
        { dealId: 'deal-001', scores: { overall: 85 } },
        { dealId: 'deal-002', scores: { overall: 78 } },
      ],
      summary: { bestValue: 'deal-001' },
      winner: { dealId: 'deal-001', score: 85, reasons: ['Best overall'] },
      createdAt: new Date(),
    }),
    quickCompare: jest.fn().mockResolvedValue({
      deals: [
        { dealId: 'deal-001', price: 180000, profit: 70000 },
        { dealId: 'deal-002', price: 225000, profit: 85000 },
      ],
      best: 'deal-002',
    }),
  },
}));

jest.mock('../../services/NotificationService', () => ({
  notificationService: {
    getStats: jest.fn().mockReturnValue({
      connections: 5,
      users: 3,
      queuedNotifications: 2,
    }),
    sendToUser: jest.fn(),
    isUserConnected: jest.fn().mockReturnValue(true),
  },
}));

// Create test app
function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/marketplace', marketplaceRoutes);
  return app;
}

const canListen = (() => {
  const probeScript = [
    "const net = require('net');",
    "const server = net.createServer();",
    "server.once('error', () => process.exit(1));",
    "server.listen(0, '127.0.0.1', () => server.close(() => process.exit(0)));",
  ].join('');

  const result = spawnSync(process.execPath, ['-e', probeScript], { stdio: 'ignore' });
  return result.status === 0;
})();

const describeIf = canListen ? describe : describe.skip;

describeIf('Marketplace API', () => {
  let app: Express;
  let server: Server;

  beforeAll(async () => {
    app = createTestApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // USER ENDPOINTS
  // ============================================================================

  describe('POST /api/marketplace/users', () => {
    it('should create a new user', async () => {
      const response = await request(server)
        .post('/api/marketplace/users')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          role: 'buyer',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('user-123');
    });
  });

  describe('GET /api/marketplace/users/:userId', () => {
    it('should return user by ID', async () => {
      const response = await request(server)
        .get('/api/marketplace/users/user-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('user-123');
    });

    it('should return 404 for nonexistent user', async () => {
      const response = await request(server)
        .get('/api/marketplace/users/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================================
  // BUY BOX ENDPOINTS
  // ============================================================================

  describe('POST /api/marketplace/users/:userId/buyboxes', () => {
    it('should create a buy box', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/buyboxes')
        .send({
          name: 'Texas Properties',
          states: ['TX'],
          minPrice: 100000,
          maxPrice: 300000,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('bb-123');
    });
  });

  describe('GET /api/marketplace/users/:userId/buyboxes', () => {
    it('should return user buy boxes', async () => {
      const response = await request(server)
        .get('/api/marketplace/users/user-123/buyboxes');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('PUT /api/marketplace/buyboxes/:buyBoxId', () => {
    it('should update a buy box', async () => {
      const response = await request(server)
        .put('/api/marketplace/buyboxes/bb-123')
        .send({
          name: 'Updated Texas Properties',
          active: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // FEED ENDPOINT
  // ============================================================================

  describe('GET /api/marketplace/users/:userId/feed', () => {
    it('should return personalized deal feed', async () => {
      const response = await request(server)
        .get('/api/marketplace/users/user-123/feed');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deals).toHaveLength(2);
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should support pagination parameters', async () => {
      const response = await request(server)
        .get('/api/marketplace/users/user-123/feed')
        .query({ page: 2, limit: 10 });

      expect(response.status).toBe(200);
    });

    it('should support sorting', async () => {
      const response = await request(server)
        .get('/api/marketplace/users/user-123/feed')
        .query({ sortBy: 'price_low' });

      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // SWIPE ENDPOINTS
  // ============================================================================

  describe('POST /api/marketplace/users/:userId/deals/:dealId/swipe', () => {
    it('should record a like action', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/deals/deal-001/swipe')
        .send({
          action: 'like',
          viewDuration: 15000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should record a pass with reason', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/deals/deal-001/swipe')
        .send({
          action: 'pass',
          passReason: 'price_too_high',
          viewDuration: 5000,
        });

      expect(response.status).toBe(200);
    });

    it('should reject invalid action', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/deals/deal-001/swipe')
        .send({
          action: 'invalid',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/marketplace/users/:userId/deals/:dealId/view', () => {
    it('should record a view', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/deals/deal-001/view')
        .send({
          duration: 10000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/marketplace/pass-reasons', () => {
    it('should return list of pass reasons', async () => {
      const response = await request(server)
        .get('/api/marketplace/pass-reasons');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });
  });

  // ============================================================================
  // OFFER ENDPOINTS
  // ============================================================================

  describe('POST /api/marketplace/users/:userId/deals/:dealId/offers', () => {
    it('should create an offer', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/deals/deal-001/offers')
        .send({
          offerAmount: 200000,
          closingDays: 14,
          financeType: 'cash',
          earnestMoney: 5000,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('offer-123');
    });
  });

  describe('GET /api/marketplace/users/:userId/offers', () => {
    it('should return user offers', async () => {
      const response = await request(server)
        .get('/api/marketplace/users/user-123/offers');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const response = await request(server)
        .get('/api/marketplace/users/user-123/offers')
        .query({ status: 'pending' });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/marketplace/offers/:offerId/respond', () => {
    it('should accept an offer', async () => {
      const response = await request(server)
        .post('/api/marketplace/offers/offer-123/respond')
        .send({
          response: 'accepted',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should counter an offer', async () => {
      const response = await request(server)
        .post('/api/marketplace/offers/offer-123/respond')
        .send({
          response: 'countered',
          counterOffer: {
            amount: 210000,
            closingDays: 10,
          },
        });

      expect(response.status).toBe(200);
    });

    it('should reject invalid response', async () => {
      const response = await request(server)
        .post('/api/marketplace/offers/offer-123/respond')
        .send({
          response: 'invalid',
        });

      expect(response.status).toBe(400);
    });

    it('should return 404 for nonexistent offer', async () => {
      const response = await request(server)
        .post('/api/marketplace/offers/nonexistent/respond')
        .send({
          response: 'accepted',
        });

      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // ANALYTICS ENDPOINTS
  // ============================================================================

  describe('GET /api/marketplace/users/:userId/profile', () => {
    it('should return user behavior profile', async () => {
      const response = await request(server)
        .get('/api/marketplace/users/user-123/profile');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.implicitPreferences).toBeDefined();
    });
  });

  describe('GET /api/marketplace/users/:userId/deals/:dealId/predict', () => {
    it('should return deal prediction', async () => {
      const response = await request(server)
        .get('/api/marketplace/users/user-123/deals/deal-001/predict');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.predictedAction).toBeDefined();
      expect(response.body.data.confidence).toBeDefined();
    });
  });

  describe('GET /api/marketplace/analytics/pass-reasons', () => {
    it('should return pass reason analytics', async () => {
      const response = await request(server)
        .get('/api/marketplace/analytics/pass-reasons');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/marketplace/deals/:dealId/analytics', () => {
    it('should return deal analytics', async () => {
      const response = await request(server)
        .get('/api/marketplace/deals/deal-001/analytics');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.views).toBeDefined();
      expect(response.body.data.likes).toBeDefined();
    });
  });

  // ============================================================================
  // COMPARISON ENDPOINTS
  // ============================================================================

  describe('POST /api/marketplace/compare', () => {
    it('should compare multiple deals', async () => {
      const response = await request(server)
        .post('/api/marketplace/compare')
        .send({
          dealIds: ['deal-001', 'deal-002'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deals).toHaveLength(2);
      expect(response.body.data.winner).toBeDefined();
    });

    it('should support custom weights', async () => {
      const response = await request(server)
        .post('/api/marketplace/compare')
        .send({
          dealIds: ['deal-001', 'deal-002'],
          weights: {
            financial: 0.5,
            property: 0.2,
            location: 0.1,
            market: 0.1,
            competition: 0.1,
          },
        });

      expect(response.status).toBe(200);
    });

    it('should reject missing dealIds', async () => {
      const response = await request(server)
        .post('/api/marketplace/compare')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('dealIds');
    });
  });

  describe('POST /api/marketplace/compare/quick', () => {
    it('should return quick comparison', async () => {
      const response = await request(server)
        .post('/api/marketplace/compare/quick')
        .send({
          dealIds: ['deal-001', 'deal-002'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.best).toBeDefined();
    });
  });

  // ============================================================================
  // HIGH-SIGNAL ACTION ENDPOINTS
  // ============================================================================

  describe('POST /api/marketplace/users/:userId/deals/:dealId/save', () => {
    it('should track save action', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/deals/deal-001/save');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/marketplace/users/:userId/deals/:dealId/share', () => {
    it('should track share action', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/deals/deal-001/share');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/marketplace/users/:userId/deals/:dealId/request-info', () => {
    it('should track info request', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/deals/deal-001/request-info');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/marketplace/users/:userId/filters', () => {
    it('should track filter usage', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/filters')
        .send({
          filters: {
            states: ['TX', 'FL'],
            minPrice: 100000,
            maxPrice: 300000,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // NOTIFICATION ENDPOINTS
  // ============================================================================

  describe('GET /api/marketplace/notifications/stats', () => {
    it('should return notification stats', async () => {
      const response = await request(server)
        .get('/api/marketplace/notifications/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.connections).toBeDefined();
      expect(response.body.data.users).toBeDefined();
    });
  });

  describe('POST /api/marketplace/users/:userId/notifications/test', () => {
    it('should send test notification', async () => {
      const response = await request(server)
        .post('/api/marketplace/users/user-123/notifications/test')
        .send({
          title: 'Test',
          message: 'Test message',
          type: 'system',
          priority: 'normal',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.connected).toBeDefined();
    });
  });
});
