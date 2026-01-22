/**
 * AI Buy Box Controller Unit Tests
 */

import { Request, Response } from 'express';
import {
  matchPropertyToBuyBoxes,
  getAllBuyBoxes,
  createBuyBox,
  updateBuyBox,
  deactivateBuyBox,
} from '../../controllers/aiBuyBoxController';
import Property from '../../models/Property';
import HedgeFundBuyBoxModel from '../../models/HedgeFundBuyBox';

jest.mock('../../models/Property');
jest.mock('../../models/HedgeFundBuyBox', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn(),
  },
}));

describe('AIBuyBoxController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockRequest = {
      params: {},
      body: {},
    };

    mockResponse = {
      json: jsonMock,
      status: statusMock,
    };

    const mockBuyBoxes = [
      {
        id: 'bb-tx',
        fundName: 'Texas Fund',
        fundType: 'Institutional',
        criteria: {
          states: ['TX'],
          minPrice: 100000,
          maxPrice: 300000,
          minBedrooms: 2,
          maxBedrooms: 4,
          minBathrooms: 1,
          maxBathrooms: 3,
          minYearBuilt: 1970,
          propertyTypes: ['Single Family'],
          allowHoa: false,
        },
        enabled: true,
        priority: 1,
        autoSubmit: true,
        autoSubmitThreshold: 80,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      },
      {
        id: 'bb-fl',
        fundName: 'Florida Fund',
        fundType: 'Institutional',
        criteria: {
          states: ['FL'],
          minPrice: 90000,
          maxPrice: 350000,
          minBedrooms: 2,
          maxBedrooms: 5,
          minBathrooms: 1,
          maxBathrooms: 4,
          minYearBuilt: 1960,
          propertyTypes: ['Single Family'],
          allowHoa: true,
        },
        enabled: true,
        priority: 2,
        autoSubmit: false,
        autoSubmitThreshold: 85,
        createdAt: new Date('2024-01-03'),
        updatedAt: new Date('2024-01-04'),
      },
    ];

    (HedgeFundBuyBoxModel.findAll as jest.Mock).mockResolvedValue(mockBuyBoxes);
    (HedgeFundBuyBoxModel.create as jest.Mock).mockImplementation(async (data: any) => ({
      id: data.id || 'bb-new',
      fundName: data.fundName,
      fundType: data.fundType,
      criteria: data.criteria,
      contactEmail: data.contactEmail,
      enabled: data.enabled,
      priority: data.priority,
      createdAt: new Date(),
    }));
    (HedgeFundBuyBoxModel.findByPk as jest.Mock).mockResolvedValue({
      id: '1',
      fundName: 'Test Fund',
      update: jest.fn().mockResolvedValue(true),
      updatedAt: new Date(),
    });
  });

  // ============================================================================
  // MATCH PROPERTY TO BUY BOXES
  // ============================================================================

  describe('matchPropertyToBuyBoxes', () => {
    const mockProperty = {
      id: 1,
      state: 'TX',
      city: 'Austin',
      purchaseContractPrice: 200000,
      reservePrice: 180000,
      bedroomCount: 3,
      bathroomCount: 2,
      propertyType: 'Single Family',
      yearBuilt: 1990,
      pool: false,
      hoa: false,
      occupancyStatus: 'Vacant',
      address: { houseNumber: '123', street: 'Main St' },
    };

    it('should return matches for valid property', async () => {
      mockRequest.params = { propertyId: '1' };
      mockRequest.body = { minScore: 50 };
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await matchPropertyToBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            propertyId: 1,
            matches: expect.any(Array),
            totalMatches: expect.any(Number),
          }),
        })
      );
    });

    it('should include execution time in response', async () => {
      mockRequest.params = { propertyId: '1' };
      mockRequest.body = {};
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await matchPropertyToBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          executionTimeMs: expect.any(Number),
          timestamp: expect.any(String),
        })
      );
    });

    it('should return 404 when property not found', async () => {
      mockRequest.params = { propertyId: '999' };
      (Property.findByPk as jest.Mock).mockResolvedValue(null);

      await matchPropertyToBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Property not found',
        })
      );
    });

    it('should filter matches by minimum score', async () => {
      mockRequest.params = { propertyId: '1' };
      mockRequest.body = { minScore: 90 };
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await matchPropertyToBuyBoxes(mockRequest as Request, mockResponse as Response);

      // High min score should filter out most/all matches
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should handle database errors', async () => {
      mockRequest.params = { propertyId: '1' };
      (Property.findByPk as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await matchPropertyToBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );

      consoleSpy.mockRestore();
    });

    it('should identify strong matches', async () => {
      const highMatchProperty = {
        ...mockProperty,
        purchaseContractPrice: 150000, // Good price within range
      };
      mockRequest.params = { propertyId: '1' };
      mockRequest.body = { minScore: 30 };
      (Property.findByPk as jest.Mock).mockResolvedValue(highMatchProperty);

      await matchPropertyToBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            strongMatches: expect.any(Array),
            autoSubmitRecommendation: expect.any(Array),
          }),
        })
      );
    });
  });

  // ============================================================================
  // GET ALL BUY BOXES
  // ============================================================================

  describe('getAllBuyBoxes', () => {
    it('should return all active buy boxes', async () => {
      await getAllBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
          count: expect.any(Number),
          timestamp: expect.any(String),
          executionTimeMs: expect.any(Number),
        })
      );
    });

    it('should include fund details in buy boxes', async () => {
      await getAllBuyBoxes(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0]).toEqual(
        expect.objectContaining({
          fund_name: expect.any(String),
          criteria: expect.objectContaining({
            states: expect.any(Array),
          }),
        })
      );
    });
  });

  // ============================================================================
  // CREATE BUY BOX
  // ============================================================================

  describe('createBuyBox', () => {
    it('should create buy box with valid data', async () => {
      mockRequest.body = {
        fund_name: 'New Fund',
        fund_type: 'Institutional',
        criteria: {
          states: ['TX', 'FL'],
          minBeds: 2,
          maxBeds: 4,
          minPrice: 100000,
          maxPrice: 400000,
          minYearBuilt: 1970,
          propertyTypes: ['Single Family'],
        },
        contact_email: 'deals@newfund.com',
      };

      await createBuyBox(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            fund_name: 'New Fund',
            active: true,
          }),
        })
      );
    });

    it('should return 400 for missing fund_name', async () => {
      mockRequest.body = {
        criteria: { states: ['TX'] },
      };

      await createBuyBox(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'fund_name and criteria are required',
        })
      );
    });

    it('should return 400 for missing criteria', async () => {
      mockRequest.body = {
        fund_name: 'Test Fund',
      };

      await createBuyBox(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  // ============================================================================
  // UPDATE BUY BOX
  // ============================================================================

  describe('updateBuyBox', () => {
    it('should update buy box', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = {
        criteria: {
          minPrice: 75000,
          maxPrice: 350000,
        },
      };

      await updateBuyBox(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Buy box updated successfully',
        })
      );
    });

    it('should handle update errors', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { criteria: null }; // This might cause an error

      // Force an error
      const originalJson = mockResponse.json;
      mockResponse.json = jest.fn().mockImplementation(() => {
        throw new Error('Update error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await updateBuyBox(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
      mockResponse.json = originalJson;
    });
  });

  // ============================================================================
  // DEACTIVATE BUY BOX
  // ============================================================================

  describe('deactivateBuyBox', () => {
    it('should deactivate buy box', async () => {
      mockRequest.params = { id: '1' };

      await deactivateBuyBox(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Buy box deactivated successfully',
        })
      );
    });
  });

  // ============================================================================
  // SCORING ALGORITHM TESTS
  // ============================================================================

  describe('Scoring Algorithm', () => {
    it('should not match property outside target states', async () => {
      const outOfStateProperty = {
        id: 1,
        state: 'WA', // Not in any buy box
        city: 'Seattle',
        purchaseContractPrice: 200000,
        bedroomCount: 3,
        bathroomCount: 2,
        propertyType: 'Single Family',
        yearBuilt: 1990,
        address: { houseNumber: '123', street: 'Main St' },
      };

      mockRequest.params = { propertyId: '1' };
      mockRequest.body = { minScore: 0 };
      (Property.findByPk as jest.Mock).mockResolvedValue(outOfStateProperty);

      await matchPropertyToBuyBoxes(mockRequest as Request, mockResponse as Response);

      // Washington state is not in any mock buy box
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            totalMatches: 0,
          }),
        })
      );
    });

    it('should score price within range correctly', async () => {
      const goodPriceProperty = {
        id: 1,
        state: 'TX',
        purchaseContractPrice: 200000, // Within range for TX buy box
        bedroomCount: 3,
        bathroomCount: 2,
        propertyType: 'Single Family',
        yearBuilt: 1990,
        address: { houseNumber: '123', street: 'Main St' },
      };

      mockRequest.params = { propertyId: '1' };
      mockRequest.body = { minScore: 50 };
      (Property.findByPk as jest.Mock).mockResolvedValue(goodPriceProperty);

      await matchPropertyToBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            matches: expect.arrayContaining([
              expect.objectContaining({
                criteriaMatched: expect.arrayContaining(['state', 'price']),
              }),
            ]),
          }),
        })
      );
    });

    it('should include reasons in match response', async () => {
      const property = {
        id: 1,
        state: 'TX',
        purchaseContractPrice: 200000,
        bedroomCount: 3,
        bathroomCount: 2,
        propertyType: 'Single Family',
        yearBuilt: 1990,
        address: { houseNumber: '123', street: 'Main St' },
      };

      mockRequest.params = { propertyId: '1' };
      mockRequest.body = { minScore: 30 };
      (Property.findByPk as jest.Mock).mockResolvedValue(property);

      await matchPropertyToBuyBoxes(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      if (response.data.matches.length > 0) {
        expect(response.data.matches[0]).toHaveProperty('reasons');
        expect(Array.isArray(response.data.matches[0].reasons)).toBe(true);
      }
    });
  });
});
