/**
 * NotificationService Unit Tests
 */

import { EventEmitter } from 'events';

// Mock WebSocket before importing the service
const mockSend = jest.fn();
const mockClose = jest.fn();
const mockTerminate = jest.fn();
const mockPing = jest.fn();

const mockSocket = {
  send: mockSend,
  close: mockClose,
  terminate: mockTerminate,
  ping: mockPing,
  readyState: 1, // WebSocket.OPEN
  on: jest.fn(),
};

const mockWssOn = jest.fn();
const mockWssClose = jest.fn();

jest.mock('ws', () => ({
  WebSocket: {
    OPEN: 1,
    CLOSED: 3,
  },
  WebSocketServer: jest.fn().mockImplementation(() => ({
    on: mockWssOn,
    close: mockWssClose,
  })),
}));

// Mock Supabase for authentication
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockImplementation(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

// Import after mocking
import { notificationService } from '../../services/NotificationService';

describe('NotificationService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the service state
    (notificationService as any).clients = new Map();
    (notificationService as any).notificationQueue = [];
    (notificationService as any).wss = null;
    (notificationService as any).pingInterval = null;

    // Set up Supabase env vars for tests
    process.env = {
      ...originalEnv,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
    };

    // Default mock: successful auth
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    // Clean up any intervals
    if ((notificationService as any).pingInterval) {
      clearInterval((notificationService as any).pingInterval);
      (notificationService as any).pingInterval = null;
    }
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('initialize', () => {
    it('should create WebSocket server with correct path', () => {
      const mockServer = {} as any;
      notificationService.initialize(mockServer);

      const { WebSocketServer } = require('ws');
      expect(WebSocketServer).toHaveBeenCalledWith({
        server: mockServer,
        path: '/ws/notifications',
      });
    });

    it('should set up connection handler', () => {
      const mockServer = {} as any;
      notificationService.initialize(mockServer);

      expect(mockWssOn).toHaveBeenCalledWith('connection', expect.any(Function));
      expect(mockWssOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should start ping interval', () => {
      jest.useFakeTimers();
      const mockServer = {} as any;
      notificationService.initialize(mockServer);

      expect((notificationService as any).pingInterval).toBeDefined();
      jest.useRealTimers();
    });
  });

  describe('shutdown', () => {
    it('should clear ping interval', () => {
      const mockServer = {} as any;
      notificationService.initialize(mockServer);

      expect((notificationService as any).pingInterval).not.toBeNull();

      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      notificationService.shutdown();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('should close all client connections', () => {
      // Add mock clients
      const mockClient = {
        socket: { ...mockSocket },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.shutdown();

      expect(mockClient.socket.close).toHaveBeenCalledWith(1000, 'Server shutdown');
    });
  });

  // ============================================================================
  // NOTIFICATION SENDING TESTS
  // ============================================================================

  describe('sendToUser', () => {
    it('should send notification to connected user', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.sendToUser('user-1', {
        type: 'system',
        title: 'Test',
        message: 'Test message',
      });

      expect(mockClient.socket.send).toHaveBeenCalled();
      const sentData = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      expect(sentData.type).toBe('notification');
      expect(sentData.notification.title).toBe('Test');
      expect(sentData.notification.message).toBe('Test message');
    });

    it('should queue notification for disconnected user', () => {
      notificationService.sendToUser('offline-user', {
        type: 'system',
        title: 'Queued',
        message: 'This will be queued',
      });

      const queued = notificationService.getQueuedNotifications('offline-user');
      expect(queued).toHaveLength(1);
      expect(queued[0].title).toBe('Queued');
    });

    it('should generate unique notification IDs', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.sendToUser('user-1', { title: 'Test 1', message: 'msg1' });
      notificationService.sendToUser('user-1', { title: 'Test 2', message: 'msg2' });

      const call1 = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      const call2 = JSON.parse(mockClient.socket.send.mock.calls[1][0]);

      expect(call1.notification.id).not.toBe(call2.notification.id);
      expect(call1.notification.id).toMatch(/^notif_\d+_[a-z0-9]+$/);
    });

    it('should set default values for notifications', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.sendToUser('user-1', {});

      const sentData = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      expect(sentData.notification.type).toBe('system');
      expect(sentData.notification.title).toBe('Notification');
      expect(sentData.notification.priority).toBe('normal');
      expect(sentData.notification.read).toBe(false);
    });

    it('should emit notification:sent event', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      const sentHandler = jest.fn();
      notificationService.on('notification:sent', sentHandler);

      notificationService.sendToUser('user-1', { title: 'Test', message: 'msg' });

      expect(sentHandler).toHaveBeenCalled();
      notificationService.off('notification:sent', sentHandler);
    });
  });

  describe('sendToChannel', () => {
    it('should send to all users subscribed to channel', () => {
      const mockClient1 = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all', 'deals:texas']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      const mockClient2 = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-2',
        subscriptions: new Set(['all', 'deals:florida']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient1]);
      (notificationService as any).clients.set('user-2', [mockClient2]);

      notificationService.sendToChannel('deals:texas', {
        title: 'Texas Deal',
        message: 'New deal in Texas',
      });

      expect(mockClient1.socket.send).toHaveBeenCalled();
      expect(mockClient2.socket.send).not.toHaveBeenCalled();
    });

    it('should not send to users not subscribed to channel', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.sendToChannel('deals:texas', {
        title: 'Texas Deal',
        message: 'New deal',
      });

      expect(mockClient.socket.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('should send to all connected clients', () => {
      const mockClient1 = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      const mockClient2 = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-2',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient1]);
      (notificationService as any).clients.set('user-2', [mockClient2]);

      notificationService.broadcast({
        type: 'system',
        title: 'System Announcement',
        message: 'Server maintenance at midnight',
      });

      expect(mockClient1.socket.send).toHaveBeenCalled();
      expect(mockClient2.socket.send).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // DEAL MATCH NOTIFICATION TESTS
  // ============================================================================

  describe('notifyDealMatch', () => {
    it('should send deal match notification with correct structure', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.notifyDealMatch(
        'user-1',
        {
          id: 'deal-123',
          address: '123 Main St',
          price: 200000,
          arv: 280000,
          equity: 28,
          propertyType: 'single_family',
          bedrooms: 3,
          bathrooms: 2,
        },
        {
          id: 'buybox-456',
          name: 'Texas Flips',
        },
        85
      );

      const sentData = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      expect(sentData.notification.type).toBe('deal_match');
      expect(sentData.notification.data.dealId).toBe('deal-123');
      expect(sentData.notification.data.buyBoxId).toBe('buybox-456');
      expect(sentData.notification.data.matchScore).toBe(85);
      expect(sentData.notification.data.dealSummary.address).toBe('123 Main St');
    });

    it('should set high priority for high match scores', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.notifyDealMatch(
        'user-1',
        { id: 'd1', address: 'addr', price: 100000, propertyType: 'sfh' },
        { id: 'bb1', name: 'My Box' },
        95 // High score
      );

      const sentData = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      expect(sentData.notification.priority).toBe('high');
    });

    it('should set normal priority for lower match scores', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.notifyDealMatch(
        'user-1',
        { id: 'd1', address: 'addr', price: 100000, propertyType: 'sfh' },
        { id: 'bb1', name: 'My Box' },
        75 // Lower score
      );

      const sentData = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      expect(sentData.notification.priority).toBe('normal');
    });
  });

  // ============================================================================
  // OFFER STATUS NOTIFICATION TESTS
  // ============================================================================

  describe('notifyOfferStatus', () => {
    it('should send offer accepted notification with urgent priority', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.notifyOfferStatus('user-1', {
        id: 'offer-123',
        dealId: 'deal-456',
        amount: 200000,
        status: 'accepted',
      });

      const sentData = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      expect(sentData.notification.type).toBe('offer_status');
      expect(sentData.notification.priority).toBe('urgent');
      expect(sentData.notification.title).toBe('Offer Accepted');
      expect(sentData.notification.message).toContain('accepted');
    });

    it('should send counter offer notification with high priority', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.notifyOfferStatus('user-1', {
        id: 'offer-123',
        dealId: 'deal-456',
        amount: 200000,
        status: 'countered',
        counterOfferAmount: 210000,
      });

      const sentData = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      expect(sentData.notification.priority).toBe('high');
      expect(sentData.notification.data.counterOfferAmount).toBe(210000);
      expect(sentData.notification.message).toContain('210,000');
    });

    it('should handle rejected offer', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient]);

      notificationService.notifyOfferStatus('user-1', {
        id: 'offer-123',
        dealId: 'deal-456',
        amount: 200000,
        status: 'rejected',
      });

      const sentData = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      expect(sentData.notification.priority).toBe('normal');
      expect(sentData.notification.message).toContain('not accepted');
    });
  });

  // ============================================================================
  // NEW DEAL NOTIFICATION TESTS
  // ============================================================================

  describe('notifyNewDeal', () => {
    it('should notify all matched users', async () => {
      const mockClient1 = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      const mockClient2 = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-2',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      (notificationService as any).clients.set('user-1', [mockClient1]);
      (notificationService as any).clients.set('user-2', [mockClient2]);

      await notificationService.notifyNewDeal(
        {
          id: 'deal-new',
          address: '456 Oak Ave',
          price: 150000,
          state: 'TX',
          propertyType: 'single_family',
        },
        [
          { userId: 'user-1', buyBoxId: 'bb1', buyBoxName: 'Texas Deals', matchScore: 90 },
          { userId: 'user-2', buyBoxId: 'bb2', buyBoxName: 'Budget Flips', matchScore: 78 },
        ]
      );

      expect(mockClient1.socket.send).toHaveBeenCalled();
      expect(mockClient2.socket.send).toHaveBeenCalled();

      const data1 = JSON.parse(mockClient1.socket.send.mock.calls[0][0]);
      expect(data1.notification.data.matchScore).toBe(90);
      expect(data1.notification.data.buyBoxName).toBe('Texas Deals');

      const data2 = JSON.parse(mockClient2.socket.send.mock.calls[0][0]);
      expect(data2.notification.data.matchScore).toBe(78);
      expect(data2.notification.data.buyBoxName).toBe('Budget Flips');
    });
  });

  // ============================================================================
  // UTILITY METHOD TESTS
  // ============================================================================

  describe('getConnectionCount', () => {
    it('should return total number of connections', () => {
      (notificationService as any).clients.set('user-1', [{}, {}]); // 2 connections
      (notificationService as any).clients.set('user-2', [{}]); // 1 connection

      expect(notificationService.getConnectionCount()).toBe(3);
    });

    it('should return 0 when no connections', () => {
      expect(notificationService.getConnectionCount()).toBe(0);
    });
  });

  describe('getConnectedUsers', () => {
    it('should return list of connected user IDs', () => {
      (notificationService as any).clients.set('user-1', [{}]);
      (notificationService as any).clients.set('user-2', [{}]);
      (notificationService as any).clients.set('user-3', [{}]);

      const users = notificationService.getConnectedUsers();
      expect(users).toHaveLength(3);
      expect(users).toContain('user-1');
      expect(users).toContain('user-2');
      expect(users).toContain('user-3');
    });
  });

  describe('isUserConnected', () => {
    it('should return true for connected user', () => {
      (notificationService as any).clients.set('user-1', [{}]);

      expect(notificationService.isUserConnected('user-1')).toBe(true);
    });

    it('should return false for disconnected user', () => {
      expect(notificationService.isUserConnected('offline-user')).toBe(false);
    });

    it('should return false for user with empty connections array', () => {
      (notificationService as any).clients.set('user-1', []);

      expect(notificationService.isUserConnected('user-1')).toBe(false);
    });
  });

  describe('getQueuedNotifications', () => {
    it('should return queued notifications for specific user', () => {
      (notificationService as any).notificationQueue = [
        { userId: 'user-1', title: 'Notif 1' },
        { userId: 'user-2', title: 'Notif 2' },
        { userId: 'user-1', title: 'Notif 3' },
      ];

      const queued = notificationService.getQueuedNotifications('user-1');
      expect(queued).toHaveLength(2);
      expect(queued[0].title).toBe('Notif 1');
      expect(queued[1].title).toBe('Notif 3');
    });
  });

  describe('clearQueuedNotifications', () => {
    it('should remove notifications for specific user', () => {
      (notificationService as any).notificationQueue = [
        { userId: 'user-1', title: 'Notif 1' },
        { userId: 'user-2', title: 'Notif 2' },
        { userId: 'user-1', title: 'Notif 3' },
      ];

      notificationService.clearQueuedNotifications('user-1');

      const queue = (notificationService as any).notificationQueue;
      expect(queue).toHaveLength(1);
      expect(queue[0].userId).toBe('user-2');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      (notificationService as any).clients.set('user-1', [{}, {}]);
      (notificationService as any).clients.set('user-2', [{}]);
      (notificationService as any).notificationQueue = [{}, {}, {}];

      const stats = notificationService.getStats();

      expect(stats.connections).toBe(3);
      expect(stats.users).toBe(2);
      expect(stats.queuedNotifications).toBe(3);
    });
  });

  // ============================================================================
  // CONNECTION HANDLING TESTS
  // ============================================================================

  describe('handleConnection', () => {
    it('should reject connection without token', async () => {
      const mockWs = { close: jest.fn(), on: jest.fn() };
      const mockRequest = {
        url: '/ws/notifications',
        headers: { host: 'localhost' },
      };

      await (notificationService as any).handleConnection(mockWs, mockRequest);

      expect(mockWs.close).toHaveBeenCalledWith(4001, 'Authentication token required');
    });

    it('should reject connection with invalid token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const mockWs = {
        close: jest.fn(),
        on: jest.fn(),
        send: jest.fn(),
        readyState: 1,
      };
      const mockRequest = {
        url: '/ws/notifications?token=invalid-token',
        headers: { host: 'localhost' },
      };

      await (notificationService as any).handleConnection(mockWs, mockRequest);

      expect(mockWs.close).toHaveBeenCalledWith(4002, 'Invalid or expired token');
    });

    it('should accept connection with valid token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const mockWs = {
        close: jest.fn(),
        on: jest.fn(),
        send: jest.fn(),
        readyState: 1,
      };
      const mockRequest = {
        url: '/ws/notifications?token=valid-token',
        headers: { host: 'localhost' },
      };

      await (notificationService as any).handleConnection(mockWs, mockRequest);

      expect(mockWs.close).not.toHaveBeenCalled();
      expect(notificationService.isUserConnected('user-123')).toBe(true);
    });

    it('should send welcome message on connection', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const mockWs = {
        close: jest.fn(),
        on: jest.fn(),
        send: jest.fn(),
        readyState: 1,
      };
      const mockRequest = {
        url: '/ws/notifications?token=valid-token',
        headers: { host: 'localhost' },
      };

      await (notificationService as any).handleConnection(mockWs, mockRequest);

      expect(mockWs.send).toHaveBeenCalled();
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.type).toBe('connected');
      expect(sentData.subscriptions).toContain('all');
      expect(sentData.subscriptions).toContain('user:user-123');
    });
  });

  // ============================================================================
  // MESSAGE HANDLING TESTS
  // ============================================================================

  describe('handleMessage', () => {
    it('should respond to ping with pong', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      (notificationService as any).handleMessage(mockClient, { type: 'ping' });

      const sentData = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      expect(sentData.type).toBe('pong');
      expect(sentData.timestamp).toBeDefined();
    });

    it('should handle subscribe request', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all', 'user:user-1']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      (notificationService as any).handleMessage(mockClient, {
        type: 'subscribe',
        channels: ['deals:texas', 'deals:florida'],
      });

      expect(mockClient.subscriptions.has('deals:texas')).toBe(true);
      expect(mockClient.subscriptions.has('deals:florida')).toBe(true);
    });

    it('should prevent subscribing to other users channels', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all', 'user:user-1']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      (notificationService as any).handleMessage(mockClient, {
        type: 'subscribe',
        channels: ['user:user-2'],
      });

      expect(mockClient.subscriptions.has('user:user-2')).toBe(false);
    });

    it('should handle unsubscribe request', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all', 'user:user-1', 'deals:texas']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      (notificationService as any).handleMessage(mockClient, {
        type: 'unsubscribe',
        channels: ['deals:texas'],
      });

      expect(mockClient.subscriptions.has('deals:texas')).toBe(false);
    });

    it('should not allow unsubscribing from required channels', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all', 'user:user-1']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      (notificationService as any).handleMessage(mockClient, {
        type: 'unsubscribe',
        channels: ['all', 'user:user-1'],
      });

      expect(mockClient.subscriptions.has('all')).toBe(true);
      expect(mockClient.subscriptions.has('user:user-1')).toBe(true);
    });

    it('should emit ack event on notification acknowledgment', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      const ackHandler = jest.fn();
      notificationService.on('notification:ack', ackHandler);

      (notificationService as any).handleMessage(mockClient, {
        type: 'ack',
        notificationId: 'notif-123',
      });

      expect(ackHandler).toHaveBeenCalledWith({
        userId: 'user-1',
        notificationId: 'notif-123',
      });

      notificationService.off('notification:ack', ackHandler);
    });

    it('should handle unknown message type', () => {
      const mockClient = {
        socket: { ...mockSocket, send: jest.fn(), readyState: 1 },
        userId: 'user-1',
        subscriptions: new Set(['all']),
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      (notificationService as any).handleMessage(mockClient, { type: 'unknown' });

      const sentData = JSON.parse(mockClient.socket.send.mock.calls[0][0]);
      expect(sentData.type).toBe('error');
      expect(sentData.message).toBe('Unknown message type');
    });
  });
});
