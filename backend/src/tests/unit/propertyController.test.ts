/**
 * PropertyController Unit Tests
 *
 * Note: These tests focus on the controller logic without database integration.
 * For full integration tests, see the integration test suite.
 */

import { Request, Response } from 'express';

// Create mock Sequelize define function for model initialization
const mockSequelize = {
  define: jest.fn().mockReturnValue({}),
  transaction: jest.fn().mockImplementation(async () => ({
    commit: jest.fn(),
    rollback: jest.fn(),
  })),
  literal: jest.fn((val) => val),
};

// Mock config/database before any model imports
jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockSequelize,
}));

// Mock all models that are imported by propertyController
jest.mock('../../models/Property', () => ({
  __esModule: true,
  default: {
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('../../models/DealAction', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('../../models/MarketplaceUser', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../services/DealProcessingQueue', () => ({
  dealProcessingQueue: {
    enqueueDeal: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/ComplianceService', () => ({
  complianceService: {
    checkProperty: jest.fn().mockResolvedValue({ issues: [] }),
  },
}));

jest.mock('../../services/DealApprovalService', () => ({
  dealApprovalService: {
    queueForApproval: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../plugins', () => ({
  automationEngine: {
    safeEmitEvent: jest.fn(),
  },
  scoringEngine: {
    getAllBuyBoxes: jest.fn().mockReturnValue([]),
    scoreDealAgainstBuyBox: jest.fn(),
    scoreDealAgainstAllBuyBoxes: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../validators/propertyValidator', () => ({
  validateBulkCreate: jest.fn().mockReturnValue({ error: null, value: { properties: [], options: {} } }),
  validateBulkUpdate: jest.fn().mockReturnValue({ error: null, value: { updates: [], options: {} } }),
  validateBulkDelete: jest.fn().mockReturnValue({ error: null, value: { ids: [], options: {} } }),
  validateBulkScore: jest.fn().mockReturnValue({ error: null, value: { propertyIds: [] } }),
}));

// Import after mocks
import {
  getAllProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
} from '../../controllers/propertyController';
import Property from '../../models/Property';

describe('PropertyController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn();
    sendMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock, send: sendMock });

    mockRequest = {
      params: {},
      body: {},
      query: {},
    };

    mockResponse = {
      json: jsonMock,
      status: statusMock,
    };
  });

  // ============================================================================
  // GET ALL PROPERTIES TESTS
  // ============================================================================

  describe('getAllProperties', () => {
    it('should return all properties from database with pagination', async () => {
      const mockProperties = [
        { id: 1, propertyId: 'PROP-001', city: 'Austin' },
        { id: 2, propertyId: 'PROP-002', city: 'Dallas' },
      ];

      (Property.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: mockProperties,
        count: 2,
      });

      await getAllProperties(mockRequest as Request, mockResponse as Response);

      expect(Property.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['createdAt', 'DESC']],
        })
      );
      // Returns paginated response format
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: mockProperties,
          pagination: expect.objectContaining({
            total: 2,
          }),
        })
      );
    });

    it('should return mock data when database is unavailable', async () => {
      (Property.findAndCountAll as jest.Mock).mockRejectedValue(new Error('DB unavailable'));

      await getAllProperties(mockRequest as Request, mockResponse as Response);

      // Returns paginated response with mock data
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              propertyId: 'PROP-001',
              _mock: true,
            }),
          ]),
          pagination: expect.any(Object),
        })
      );
    });

    it('should handle errors gracefully', async () => {
      (Property.findAndCountAll as jest.Mock).mockRejectedValue(new Error('Unexpected error'));

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await getAllProperties(mockRequest as Request, mockResponse as Response);

      // Falls back to mock data due to inner try-catch
      expect(jsonMock).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  // ============================================================================
  // GET PROPERTY BY ID TESTS
  // ============================================================================

  describe('getPropertyById', () => {
    it('should return property when found', async () => {
      const mockProperty = { id: 1, propertyId: 'PROP-001', city: 'Austin' };
      mockRequest.params = { id: '1' };

      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await getPropertyById(mockRequest as Request, mockResponse as Response);

      expect(Property.findByPk).toHaveBeenCalledWith('1');
      expect(jsonMock).toHaveBeenCalledWith(mockProperty);
    });

    it('should return 404 when property not found', async () => {
      mockRequest.params = { id: '999' };

      (Property.findByPk as jest.Mock).mockResolvedValue(null);

      await getPropertyById(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Property not found' });
    });

    it('should return mock data when database is unavailable', async () => {
      mockRequest.params = { id: '123' };

      (Property.findByPk as jest.Mock).mockRejectedValue(new Error('DB unavailable'));

      await getPropertyById(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 123,
          _mock: true,
        })
      );
    });
  });

  // ============================================================================
  // CREATE PROPERTY TESTS
  // ============================================================================

  describe('createProperty', () => {
    const mockPropertyData = {
      propertyId: 'PROP-NEW',
      propertyType: 'Single Family',
      city: 'Austin',
      state: 'TX',
    };

    it('should create property in database with transactional queue', async () => {
      const createdProperty = {
        id: 1,
        ...mockPropertyData,
        toJSON: () => ({ id: 1, ...mockPropertyData }),
      };
      mockRequest.body = mockPropertyData;
      mockRequest.query = { skipDuplicateCheck: 'true' };

      (Property.create as jest.Mock).mockResolvedValue(createdProperty);
      (Property.findOne as jest.Mock).mockResolvedValue(null); // No duplicate

      await createProperty(mockRequest as Request, mockResponse as Response);

      expect(Property.create).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          _processingQueued: true,
        })
      );
    });

    it('should return 500 when database operation fails', async () => {
      mockRequest.body = mockPropertyData;
      mockRequest.query = { skipDuplicateCheck: 'true' };

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Simulate complete transaction failure
      mockSequelize.transaction.mockRejectedValueOnce(new Error('DB unavailable'));

      await createProperty(mockRequest as Request, mockResponse as Response);

      // Returns 500 on critical failure
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal server error',
        })
      );

      errorSpy.mockRestore();
    });

    it('should detect duplicate properties', async () => {
      const existingProperty = {
        id: 100,
        address: { houseNumber: '123', street: 'Main St' },
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        status: 'active',
        createdAt: new Date(),
      };
      mockRequest.body = {
        ...mockPropertyData,
        address: { houseNumber: '123', street: 'Main St' },
      };
      mockRequest.query = {}; // Don't skip duplicate check

      (Property.findAll as jest.Mock).mockResolvedValue([existingProperty]);

      await createProperty(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Duplicate property detected',
        })
      );
    });
  });

  // ============================================================================
  // UPDATE PROPERTY TESTS
  // ============================================================================

  describe('updateProperty', () => {
    it('should update existing property', async () => {
      const mockProperty = {
        id: 1,
        propertyId: 'PROP-001',
        update: jest.fn().mockResolvedValue(true),
      };
      mockRequest.params = { id: '1' };
      mockRequest.body = { city: 'Houston' };

      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await updateProperty(mockRequest as Request, mockResponse as Response);

      expect(mockProperty.update).toHaveBeenCalledWith({ city: 'Houston' });
      expect(jsonMock).toHaveBeenCalledWith(mockProperty);
    });

    it('should return 404 when property not found', async () => {
      mockRequest.params = { id: '999' };
      mockRequest.body = { city: 'Houston' };

      (Property.findByPk as jest.Mock).mockResolvedValue(null);

      await updateProperty(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Property not found' });
    });

    it('should return 500 on update error', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { city: 'Houston' };

      (Property.findByPk as jest.Mock).mockRejectedValue(new Error('Update failed'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await updateProperty(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      errorSpy.mockRestore();
    });
  });

  // ============================================================================
  // DELETE PROPERTY TESTS
  // ============================================================================

  describe('deleteProperty', () => {
    it('should delete existing property', async () => {
      const mockProperty = {
        id: 1,
        destroy: jest.fn().mockResolvedValue(true),
      };
      mockRequest.params = { id: '1' };

      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await deleteProperty(mockRequest as Request, mockResponse as Response);

      expect(mockProperty.destroy).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(204);
      expect(sendMock).toHaveBeenCalled();
    });

    it('should return 404 when property not found', async () => {
      mockRequest.params = { id: '999' };

      (Property.findByPk as jest.Mock).mockResolvedValue(null);

      await deleteProperty(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Property not found' });
    });

    it('should return 500 on delete error', async () => {
      mockRequest.params = { id: '1' };

      (Property.findByPk as jest.Mock).mockRejectedValue(new Error('Delete failed'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await deleteProperty(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      errorSpy.mockRestore();
    });
  });
});
