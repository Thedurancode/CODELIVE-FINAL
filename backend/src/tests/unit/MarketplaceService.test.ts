/**
 * MarketplaceService Unit Tests
 */

import { marketplaceService } from '../../services/MarketplaceService';
import MarketplaceUser from '../../models/MarketplaceUser';
import UserBuyBox from '../../models/UserBuyBox';
import DealAction from '../../models/DealAction';
import DealOffer from '../../models/DealOffer';

// Mock the models
jest.mock('../../models/MarketplaceUser');
jest.mock('../../models/UserBuyBox');
jest.mock('../../models/DealAction');
jest.mock('../../models/DealOffer');

describe('MarketplaceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // USER MANAGEMENT TESTS
  // ============================================================================

  describe('User Management', () => {
    describe('createUser', () => {
      it('should create a new user with required fields', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'buyer',
        };

        (MarketplaceUser.create as jest.Mock).mockResolvedValue(mockUser);

        const result = await marketplaceService.createUser({
          email: 'test@example.com',
          name: 'Test User',
        });

        expect(MarketplaceUser.create).toHaveBeenCalledWith({
          email: 'test@example.com',
          name: 'Test User',
          company: undefined,
          phone: undefined,
          role: 'buyer',
        });
        expect(result).toEqual(mockUser);
      });

      it('should create a user with all fields', async () => {
        const userData = {
          email: 'investor@example.com',
          name: 'John Investor',
          company: 'ABC Investments',
          phone: '555-1234',
          role: 'investor' as const,
        };

        const mockUser = { id: 'user-456', ...userData };
        (MarketplaceUser.create as jest.Mock).mockResolvedValue(mockUser);

        const result = await marketplaceService.createUser(userData);

        expect(result).toEqual(mockUser);
        expect(MarketplaceUser.create).toHaveBeenCalledWith(userData);
      });
    });

    describe('getUser', () => {
      it('should return user when found', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        };

        (MarketplaceUser.findByPk as jest.Mock).mockResolvedValue(mockUser);

        const result = await marketplaceService.getUser('user-123');

        expect(MarketplaceUser.findByPk).toHaveBeenCalledWith('user-123');
        expect(result).toEqual(mockUser);
      });

      it('should return null when user not found', async () => {
        (MarketplaceUser.findByPk as jest.Mock).mockResolvedValue(null);

        const result = await marketplaceService.getUser('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('updateUserActivity', () => {
      it('should update last active timestamp', async () => {
        (MarketplaceUser.update as jest.Mock).mockResolvedValue([1]);

        await marketplaceService.updateUserActivity('user-123');

        expect(MarketplaceUser.update).toHaveBeenCalledWith(
          expect.objectContaining({ lastActiveAt: expect.any(Date) }),
          expect.objectContaining({ where: { id: 'user-123' } })
        );
      });
    });
  });

  // ============================================================================
  // BUY BOX TESTS
  // ============================================================================

  describe('Buy Box Management', () => {
    describe('createUserBuyBox', () => {
      it('should create a buy box with required fields', async () => {
        const buyBoxData = {
          name: 'Texas Properties',
          states: ['TX'],
        };

        const mockBuyBox = {
          id: 'bb-123',
          userId: 'user-123',
          ...buyBoxData,
          propertyTypes: ['single_family'],
        };

        (UserBuyBox.create as jest.Mock).mockResolvedValue(mockBuyBox);

        const result = await marketplaceService.createUserBuyBox('user-123', buyBoxData);

        expect(UserBuyBox.create).toHaveBeenCalledWith({
          userId: 'user-123',
          name: 'Texas Properties',
          states: ['TX'],
          propertyTypes: ['single_family'],
        });
        expect(result).toEqual(mockBuyBox);
      });

      it('should create a buy box with all criteria', async () => {
        const buyBoxData = {
          name: 'Premium Texas',
          states: ['TX'],
          propertyTypes: ['single_family', 'townhouse'],
          minPrice: 100000,
          maxPrice: 300000,
          minBedrooms: 3,
          minEquity: 20,
        };

        const mockBuyBox = {
          id: 'bb-456',
          userId: 'user-123',
          ...buyBoxData,
        };

        (UserBuyBox.create as jest.Mock).mockResolvedValue(mockBuyBox);

        const result = await marketplaceService.createUserBuyBox('user-123', buyBoxData);

        expect(result).toEqual(mockBuyBox);
      });
    });

    describe('getUserBuyBoxes', () => {
      it('should return active buy boxes ordered by priority', async () => {
        const mockBuyBoxes = [
          { id: 'bb-1', name: 'Primary', priority: 10 },
          { id: 'bb-2', name: 'Secondary', priority: 5 },
        ];

        (UserBuyBox.findAll as jest.Mock).mockResolvedValue(mockBuyBoxes);

        const result = await marketplaceService.getUserBuyBoxes('user-123');

        expect(UserBuyBox.findAll).toHaveBeenCalledWith({
          where: { userId: 'user-123', active: true },
          order: [['priority', 'DESC']],
        });
        expect(result).toEqual(mockBuyBoxes);
      });
    });
  });

  // ============================================================================
  // SWIPE ACTIONS TESTS
  // ============================================================================

  describe('Swipe Actions', () => {
    describe('recordSwipe', () => {
      it('should record a like action', async () => {
        (DealAction.create as jest.Mock).mockResolvedValue({
          id: 'action-123',
          actionType: 'like',
        });
        (MarketplaceUser.increment as jest.Mock).mockResolvedValue([1]);
        (MarketplaceUser.update as jest.Mock).mockResolvedValue([1]);

        const result = await marketplaceService.recordSwipe({
          userId: 'user-123',
          dealId: 'deal-001',
          action: 'like',
          viewDuration: 15000,
        });

        expect(result.success).toBe(true);
        expect(result.message).toContain('liked');
        expect(DealAction.create).toHaveBeenCalled();
        expect(MarketplaceUser.increment).toHaveBeenCalledWith('totalLikes', {
          where: { id: 'user-123' },
        });
      });

      it('should record a pass action with reason', async () => {
        (DealAction.create as jest.Mock).mockResolvedValue({
          id: 'action-124',
          actionType: 'pass',
          passReason: 'price_too_high',
        });
        (MarketplaceUser.increment as jest.Mock).mockResolvedValue([1]);
        (MarketplaceUser.update as jest.Mock).mockResolvedValue([1]);

        const result = await marketplaceService.recordSwipe({
          userId: 'user-123',
          dealId: 'deal-002',
          action: 'pass',
          passReason: 'price_too_high',
          viewDuration: 5000,
        });

        expect(result.success).toBe(true);
        expect(result.message).toContain('passed');
        expect(MarketplaceUser.increment).toHaveBeenCalledWith('totalPasses', {
          where: { id: 'user-123' },
        });
      });

      it('should store deal snapshot in action', async () => {
        (DealAction.create as jest.Mock).mockResolvedValue({ id: 'action-125' });
        (MarketplaceUser.increment as jest.Mock).mockResolvedValue([1]);
        (MarketplaceUser.update as jest.Mock).mockResolvedValue([1]);

        await marketplaceService.recordSwipe({
          userId: 'user-123',
          dealId: 'deal-001', // Mock deal exists
          action: 'like',
        });

        expect(DealAction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            dealSnapshotPrice: expect.any(Number),
            dealSnapshotState: expect.any(String),
          })
        );
      });
    });

    describe('recordView', () => {
      it('should record a view action', async () => {
        (DealAction.create as jest.Mock).mockResolvedValue({ id: 'view-123' });
        (MarketplaceUser.increment as jest.Mock).mockResolvedValue([1]);
        (MarketplaceUser.update as jest.Mock).mockResolvedValue([1]);

        await marketplaceService.recordView('user-123', 'deal-001', 10000);

        expect(DealAction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-123',
            dealId: 'deal-001',
            actionType: 'view',
            viewDuration: 10000,
          })
        );
        expect(MarketplaceUser.increment).toHaveBeenCalledWith('totalDealsViewed', {
          where: { id: 'user-123' },
        });
      });
    });
  });

  // ============================================================================
  // OFFERS TESTS
  // ============================================================================

  describe('Offers', () => {
    describe('createOffer', () => {
      it('should create an offer with required fields', async () => {
        const offerData = {
          userId: 'user-123',
          dealId: 'deal-001',
          offerAmount: 200000,
          closingDays: 14,
          financeType: 'cash' as const,
        };

        const mockOffer = {
          id: 'offer-123',
          ...offerData,
          status: 'pending',
        };

        (DealOffer.create as jest.Mock).mockResolvedValue(mockOffer);
        (DealAction.create as jest.Mock).mockResolvedValue({ id: 'action-126' });
        (MarketplaceUser.increment as jest.Mock).mockResolvedValue([1]);

        const result = await marketplaceService.createOffer(offerData);

        expect(DealOffer.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-123',
            dealId: 'deal-001',
            offerAmount: 200000,
            closingDays: 14,
            financeType: 'cash',
          })
        );
        expect(result.id).toBe('offer-123');
      });

      it('should create an offer with contingencies', async () => {
        const offerData = {
          userId: 'user-123',
          dealId: 'deal-001',
          offerAmount: 200000,
          closingDays: 30,
          financeType: 'conventional' as const,
          contingencies: ['inspection', 'financing', 'appraisal'],
          earnestMoney: 5000,
        };

        const mockOffer = { id: 'offer-124', ...offerData };
        (DealOffer.create as jest.Mock).mockResolvedValue(mockOffer);
        (DealAction.create as jest.Mock).mockResolvedValue({ id: 'action-127' });
        (MarketplaceUser.increment as jest.Mock).mockResolvedValue([1]);

        const result = await marketplaceService.createOffer(offerData);

        expect(result.contingencies).toEqual(['inspection', 'financing', 'appraisal']);
      });
    });

    describe('getUserOffers', () => {
      it('should return all offers for a user', async () => {
        const mockOffers = [
          { id: 'offer-1', status: 'pending' },
          { id: 'offer-2', status: 'accepted' },
        ];

        (DealOffer.findAll as jest.Mock).mockResolvedValue(mockOffers);

        const result = await marketplaceService.getUserOffers('user-123');

        expect(DealOffer.findAll).toHaveBeenCalledWith({
          where: { userId: 'user-123' },
          order: [['createdAt', 'DESC']],
        });
        expect(result).toEqual(mockOffers);
      });

      it('should filter offers by status', async () => {
        const mockOffers = [{ id: 'offer-1', status: 'pending' }];

        (DealOffer.findAll as jest.Mock).mockResolvedValue(mockOffers);

        await marketplaceService.getUserOffers('user-123', 'pending');

        expect(DealOffer.findAll).toHaveBeenCalledWith({
          where: { userId: 'user-123', status: 'pending' },
          order: [['createdAt', 'DESC']],
        });
      });
    });

    describe('respondToOffer', () => {
      it('should accept an offer', async () => {
        const mockOffer = {
          id: 'offer-123',
          userId: 'user-123',
          update: jest.fn().mockResolvedValue(true),
        };

        (DealOffer.findByPk as jest.Mock).mockResolvedValue(mockOffer);
        (MarketplaceUser.increment as jest.Mock).mockResolvedValue([1]);

        const result = await marketplaceService.respondToOffer('offer-123', 'accepted');

        expect(mockOffer.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'accepted',
            respondedAt: expect.any(Date),
          })
        );
        expect(MarketplaceUser.increment).toHaveBeenCalledWith('acceptedOffers', {
          where: { id: 'user-123' },
        });
      });

      it('should counter an offer', async () => {
        const mockOffer = {
          id: 'offer-123',
          userId: 'user-123',
          update: jest.fn().mockResolvedValue(true),
        };

        (DealOffer.findByPk as jest.Mock).mockResolvedValue(mockOffer);

        await marketplaceService.respondToOffer('offer-123', 'countered', {
          amount: 210000,
          closingDays: 10,
          notes: 'Best and final',
        });

        expect(mockOffer.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'countered',
            counterOfferAmount: 210000,
            counterOfferClosingDays: 10,
            counterOfferNotes: 'Best and final',
          })
        );
      });

      it('should return null for non-existent offer', async () => {
        (DealOffer.findByPk as jest.Mock).mockResolvedValue(null);

        const result = await marketplaceService.respondToOffer('nonexistent', 'accepted');

        expect(result).toBeNull();
      });
    });
  });

  // ============================================================================
  // HIGH-SIGNAL TRACKING TESTS
  // ============================================================================

  describe('High-Signal Tracking', () => {
    describe('trackSave', () => {
      it('should track a save action', async () => {
        (DealAction.create as jest.Mock).mockResolvedValue({ id: 'save-123' });
        (MarketplaceUser.update as jest.Mock).mockResolvedValue([1]);

        await marketplaceService.trackSave('user-123', 'deal-001');

        expect(DealAction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-123',
            dealId: 'deal-001',
            actionType: 'save',
          })
        );
      });
    });

    describe('trackShare', () => {
      it('should track a share action', async () => {
        (DealAction.create as jest.Mock).mockResolvedValue({ id: 'share-123' });
        (MarketplaceUser.update as jest.Mock).mockResolvedValue([1]);

        await marketplaceService.trackShare('user-123', 'deal-001');

        expect(DealAction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-123',
            dealId: 'deal-001',
            actionType: 'share',
          })
        );
      });
    });

    describe('trackRequestInfo', () => {
      it('should track an info request', async () => {
        (DealAction.create as jest.Mock).mockResolvedValue({ id: 'info-123' });
        (MarketplaceUser.update as jest.Mock).mockResolvedValue([1]);

        await marketplaceService.trackRequestInfo('user-123', 'deal-001');

        expect(DealAction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-123',
            dealId: 'deal-001',
            actionType: 'request_info',
          })
        );
      });
    });
  });

  // ============================================================================
  // BEHAVIOR PROFILE TESTS
  // ============================================================================

  describe('Behavior Profile', () => {
    describe('getUserBehaviorProfile', () => {
      it('should return null with insufficient data', async () => {
        (DealAction.findAll as jest.Mock).mockResolvedValue([
          { actionType: 'view' },
          { actionType: 'like' },
        ]);

        const result = await marketplaceService.getUserBehaviorProfile('user-123');

        expect(result).toBeNull();
      });

      it('should calculate profile with sufficient data', async () => {
        const mockActions = [
          // Likes
          { actionType: 'like', dealSnapshotPrice: 200000, dealSnapshotState: 'TX', createdAt: new Date() },
          { actionType: 'like', dealSnapshotPrice: 180000, dealSnapshotState: 'TX', createdAt: new Date() },
          { actionType: 'like', dealSnapshotPrice: 220000, dealSnapshotState: 'TX', createdAt: new Date() },
          // Passes
          { actionType: 'pass', dealSnapshotPrice: 300000, dealSnapshotState: 'FL', passReason: 'price_too_high', createdAt: new Date() },
          { actionType: 'pass', dealSnapshotPrice: 280000, dealSnapshotState: 'FL', passReason: 'price_too_high', createdAt: new Date() },
          // Views
          { actionType: 'view', createdAt: new Date() },
          { actionType: 'view', createdAt: new Date() },
          { actionType: 'view', createdAt: new Date() },
          { actionType: 'view', createdAt: new Date() },
          { actionType: 'view', createdAt: new Date() },
        ];

        (DealAction.findAll as jest.Mock).mockResolvedValue(mockActions);

        const result = await marketplaceService.getUserBehaviorProfile('user-123');

        expect(result).not.toBeNull();
        expect(result?.implicitPreferences.avgLikedPrice).toBe(200000); // (200000 + 180000 + 220000) / 3
        expect(result?.topPassReasons).toBeDefined();
        expect(result?.likeRate).toBeDefined();
      });
    });
  });
});
