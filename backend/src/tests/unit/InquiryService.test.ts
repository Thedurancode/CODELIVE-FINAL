/**
 * Inquiry Service Unit Tests
 *
 * Tests for buyer-seller inquiry management:
 * - Creating inquiries from buyer agent
 * - Answering inquiries and notifying buyers
 * - Inquiry lifecycle management
 * - Statistics and queries
 */

import { inquiryService } from '../../services/InquiryService';
import PropertyInquiry from '../../models/PropertyInquiry';
import Property from '../../models/Property';
import MarketplaceUser from '../../models/MarketplaceUser';
import ConversationHistory from '../../models/ConversationHistory';
import { notificationService } from '../../services/NotificationService';

// Mock models
jest.mock('../../models/PropertyInquiry', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
}));

jest.mock('../../models/Property', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
  },
}));

jest.mock('../../models/MarketplaceUser', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
  },
}));

jest.mock('../../models/ConversationHistory', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
  },
}));

// Mock notification service
jest.mock('../../services/NotificationService', () => ({
  notificationService: {
    sendToUser: jest.fn(),
    sendToChannel: jest.fn(),
  },
}));

// Mock Resend - skip actual email sending
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ data: { id: 'email-123' } }),
    },
  })),
}));

describe('InquiryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // CREATE INQUIRY TESTS
  // ============================================================================

  describe('createInquiry', () => {
    it('should create a new inquiry', async () => {
      const mockProperty = {
        id: 1,
        getDataValue: jest.fn((key) => {
          const data: Record<string, any> = {
            address: '123 Main St',
            city: 'Dallas',
            state: 'TX',
          };
          return data[key];
        }),
      };

      const mockInquiry = {
        id: 1,
        propertyId: 1,
        buyerId: 'buyer-123',
        sessionId: 'session-456',
        question: 'Why is the seller selling?',
        category: 'seller_motivation',
        status: 'pending',
        notifiedBuyer: false,
      };

      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);
      (PropertyInquiry.create as jest.Mock).mockResolvedValue(mockInquiry);
      (MarketplaceUser.findByPk as jest.Mock).mockResolvedValue({
        getDataValue: () => 'Test Buyer',
      });

      // Force initialization
      await inquiryService.initialize();

      const result = await inquiryService.createInquiry({
        propertyId: 1,
        buyerId: 'buyer-123',
        sessionId: 'session-456',
        question: 'Why is the seller selling?',
        category: 'seller_motivation',
      });

      expect(PropertyInquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyId: 1,
          buyerId: 'buyer-123',
          sessionId: 'session-456',
          question: 'Why is the seller selling?',
          category: 'seller_motivation',
          status: 'pending',
        })
      );
      expect(result).toEqual(mockInquiry);
    });

    it('should throw error if property not found', async () => {
      (Property.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        inquiryService.createInquiry({
          propertyId: 999,
          buyerId: 'buyer-123',
          sessionId: 'session-456',
          question: 'Test question',
        })
      ).rejects.toThrow('Property 999 not found');
    });
  });

  // ============================================================================
  // ANSWER INQUIRY TESTS
  // ============================================================================

  describe('answerInquiry', () => {
    it('should answer a pending inquiry and notify buyer', async () => {
      const mockInquiry = {
        id: 1,
        propertyId: 1,
        buyerId: 'buyer-123',
        sessionId: 'session-456',
        question: 'Why is the seller selling?',
        status: 'pending',
        update: jest.fn().mockResolvedValue(true),
      };

      const mockProperty = {
        getDataValue: jest.fn((key) => {
          const data: Record<string, any> = {
            address: '123 Main St',
            city: 'Dallas',
            state: 'TX',
          };
          return data[key];
        }),
      };

      const mockBuyer = {
        getDataValue: jest.fn((key) => {
          const data: Record<string, any> = {
            email: 'buyer@test.com',
            name: 'Test Buyer',
          };
          return data[key];
        }),
      };

      (PropertyInquiry.findByPk as jest.Mock).mockResolvedValue(mockInquiry);
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);
      (MarketplaceUser.findByPk as jest.Mock).mockResolvedValue(mockBuyer);

      const result = await inquiryService.answerInquiry({
        inquiryId: 1,
        response: 'The seller is relocating for work.',
        answeredBy: 'seller-456',
        answeredByRole: 'seller',
      });

      expect(mockInquiry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          sellerResponse: 'The seller is relocating for work.',
          status: 'answered',
          answeredBy: 'seller-456',
          answeredByRole: 'seller',
        })
      );

      // Should inject message into conversation
      expect(ConversationHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-456',
          role: 'system',
        })
      );

      // Should notify buyer via WebSocket
      expect(notificationService.sendToUser).toHaveBeenCalledWith(
        'buyer-123',
        expect.objectContaining({
          type: 'system',
          title: 'Seller Responded!',
        })
      );
    });

    it('should throw error if inquiry not found', async () => {
      (PropertyInquiry.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        inquiryService.answerInquiry({
          inquiryId: 999,
          response: 'Test response',
          answeredBy: 'seller-456',
          answeredByRole: 'seller',
        })
      ).rejects.toThrow('Inquiry 999 not found');
    });

    it('should throw error if inquiry not pending', async () => {
      const mockInquiry = {
        id: 1,
        status: 'answered',
      };

      (PropertyInquiry.findByPk as jest.Mock).mockResolvedValue(mockInquiry);

      await expect(
        inquiryService.answerInquiry({
          inquiryId: 1,
          response: 'Test response',
          answeredBy: 'seller-456',
          answeredByRole: 'seller',
        })
      ).rejects.toThrow('Inquiry 1 is not pending');
    });
  });

  // ============================================================================
  // QUERY TESTS
  // ============================================================================

  describe('getPendingInquiries', () => {
    it('should return pending inquiries for a property', async () => {
      const mockInquiries = [
        { id: 1, question: 'Question 1', status: 'pending' },
        { id: 2, question: 'Question 2', status: 'pending' },
      ];

      (PropertyInquiry.findAll as jest.Mock).mockResolvedValue(mockInquiries);

      const result = await inquiryService.getPendingInquiries(1);

      expect(PropertyInquiry.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { propertyId: 1, status: 'pending' },
        })
      );
      expect(result).toEqual(mockInquiries);
    });
  });

  describe('getBuyerInquiries', () => {
    it('should return inquiries for a buyer', async () => {
      const mockInquiries = [
        { id: 1, question: 'Question 1', buyerId: 'buyer-123' },
      ];

      (PropertyInquiry.findAll as jest.Mock).mockResolvedValue(mockInquiries);

      const result = await inquiryService.getBuyerInquiries('buyer-123');

      expect(PropertyInquiry.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { buyerId: 'buyer-123' },
        })
      );
      expect(result).toEqual(mockInquiries);
    });

    it('should filter by status if provided', async () => {
      (PropertyInquiry.findAll as jest.Mock).mockResolvedValue([]);

      await inquiryService.getBuyerInquiries('buyer-123', 'pending');

      expect(PropertyInquiry.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { buyerId: 'buyer-123', status: 'pending' },
        })
      );
    });
  });

  // ============================================================================
  // STATISTICS TESTS
  // ============================================================================

  describe('getStats', () => {
    it('should return inquiry statistics', async () => {
      (PropertyInquiry.count as jest.Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(20)  // pending
        .mockResolvedValueOnce(70)  // answered
        .mockResolvedValueOnce(10); // expired

      (PropertyInquiry.findAll as jest.Mock).mockResolvedValue([
        {
          createdAt: new Date('2024-01-01T10:00:00Z'),
          answeredAt: new Date('2024-01-01T12:00:00Z'),
        },
        {
          createdAt: new Date('2024-01-02T10:00:00Z'),
          answeredAt: new Date('2024-01-02T14:00:00Z'),
        },
      ]);

      const result = await inquiryService.getStats();

      expect(result).toEqual(
        expect.objectContaining({
          total: 100,
          pending: 20,
          answered: 70,
          expired: 10,
          avgResponseTimeHours: expect.any(Number),
        })
      );
    });
  });

  // ============================================================================
  // LIFECYCLE TESTS
  // ============================================================================

  describe('cancelInquiry', () => {
    it('should allow buyer to cancel their own pending inquiry', async () => {
      const mockInquiry = {
        id: 1,
        buyerId: 'buyer-123',
        status: 'pending',
        update: jest.fn().mockResolvedValue(true),
      };

      (PropertyInquiry.findByPk as jest.Mock).mockResolvedValue(mockInquiry);

      const result = await inquiryService.cancelInquiry(1, 'buyer-123');

      expect(mockInquiry.update).toHaveBeenCalledWith({ status: 'cancelled' });
    });

    it('should not allow cancelling another buyer\'s inquiry', async () => {
      const mockInquiry = {
        id: 1,
        buyerId: 'buyer-123',
        status: 'pending',
      };

      (PropertyInquiry.findByPk as jest.Mock).mockResolvedValue(mockInquiry);

      await expect(
        inquiryService.cancelInquiry(1, 'other-buyer')
      ).rejects.toThrow('You can only cancel your own inquiries');
    });
  });

  describe('hasPendingInquiry', () => {
    it('should detect duplicate pending inquiries', async () => {
      const mockInquiry = { id: 1, question: 'Why is the seller selling?' };
      (PropertyInquiry.findOne as jest.Mock).mockResolvedValue(mockInquiry);

      const result = await inquiryService.hasPendingInquiry(
        'buyer-123',
        1,
        'Why is the seller selling this property?'
      );

      expect(result).toEqual(mockInquiry);
    });

    it('should return null if no duplicate found', async () => {
      (PropertyInquiry.findOne as jest.Mock).mockResolvedValue(null);

      const result = await inquiryService.hasPendingInquiry(
        'buyer-123',
        1,
        'New question'
      );

      expect(result).toBeNull();
    });
  });
});
