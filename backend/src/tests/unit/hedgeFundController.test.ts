/**
 * HedgeFundController Unit Tests
 */

import { Request, Response } from 'express';
import {
  getPropertiesForHedgeFunds,
  generateHedgeFundCSV,
  submitToHedgeFund,
  getHedgeFundBuyBoxes,
  matchPropertiesToBuyBoxes,
} from '../../controllers/hedgeFundController';
import Property from '../../models/Property';

jest.mock('../../models/Property');

describe('HedgeFundController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;
  let setHeaderMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn();
    sendMock = jest.fn();
    setHeaderMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockRequest = {
      params: {},
      body: {},
    };

    mockResponse = {
      json: jsonMock,
      status: statusMock,
      send: sendMock,
      setHeader: setHeaderMock,
    };
  });

  // ============================================================================
  // GET PROPERTIES FOR HEDGE FUNDS
  // ============================================================================

  describe('getPropertiesForHedgeFunds', () => {
    it('should return properties formatted for hedge fund submission', async () => {
      const mockProperties = [
        {
          address: { houseNumber: '123', street: 'Main St', address2: '' },
          city: 'Austin',
          state: 'TX',
          zip: '78701',
          bedroomCount: 3,
          bathroomCount: 2,
          livingSpaceSqFt: 1500,
          lotSizeSqFt: 5000,
          yearBuilt: 1990,
          garage: '2 Car Attached',
          hoa: true,
          hoaDuesAmount: 150,
          pool: false,
          solar: false,
          septic: false,
          well: false,
          roof: 'Shingle',
          electric: 'Standard',
          sewer: 'Public',
          foundationType: 'Slab',
          waterHeater: 'Gas',
          hvac: 'Central A/C',
          condition: 'Good',
          typeOfRehab: null,
          propertyListingDescription: 'Nice home',
          photosFolder: '/photos/123',
          onMarketOffMarket: 'Off Market',
          financeable: true,
          ownItNowAllowedAuction: true,
          ownItNowAllowedPreAuction: false,
          buyItNowPrice: 250000,
          reservePrice: 200000,
          purchaseContractPrice: 180000,
          purchaseContractExpiration: new Date('2025-03-01'),
          propertyType: 'Single Family',
        },
      ];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForHedgeFunds(mockRequest as Request, mockResponse as Response);

      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          assignable: true,
          marketingClauseFound: true,
          brokerOnFile: true,
        },
      });

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 1,
          data: expect.arrayContaining([
            expect.objectContaining({
              propertyAddress: '123 Main St',
              city: 'Austin',
              state: 'TX',
              beds: 3,
              baths: 2,
            }),
          ]),
        })
      );
    });

    it('should handle empty results', async () => {
      (Property.findAll as jest.Mock).mockResolvedValue([]);

      await getPropertiesForHedgeFunds(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 0,
          data: [],
        })
      );
    });

    it('should handle database errors', async () => {
      (Property.findAll as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await getPropertiesForHedgeFunds(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to fetch properties for Hedge Fund submission',
        })
      );

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // GENERATE HEDGE FUND CSV
  // ============================================================================

  describe('generateHedgeFundCSV', () => {
    it('should generate CSV file for hedge fund', async () => {
      const mockProperties = [
        {
          address: { houseNumber: '123', street: 'Main St', address2: '' },
          city: 'Austin',
          state: 'TX',
          zip: '78701',
          bedroomCount: 3,
          bathroomCount: 2,
          livingSpaceSqFt: 1500,
          lotSizeSqFt: 5000,
          yearBuilt: 1990,
          garage: '2 Car',
          hoa: true,
          hoaDuesAmount: 150,
          pool: false,
          solar: false,
          septic: false,
          well: false,
          roof: 'Shingle',
          electric: 'Standard',
          sewer: 'Public',
          foundationType: 'Slab',
          waterHeater: 'Gas',
          hvac: 'Central',
          condition: 'Good',
          propertyListingDescription: 'Nice property',
          photosFolder: '/photos',
          onMarketOffMarket: 'Off Market',
        },
      ];

      mockRequest.body = { fundId: 1, fundName: 'ABC_Fund' };
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await generateHedgeFundCSV(mockRequest as Request, mockResponse as Response);

      expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('ABC_Fund_properties_')
      );
      expect(sendMock).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockRequest.body = { fundId: 1, fundName: 'Test' };
      (Property.findAll as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await generateHedgeFundCSV(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // SUBMIT TO HEDGE FUND
  // ============================================================================

  describe('submitToHedgeFund', () => {
    it('should submit properties to hedge fund', async () => {
      const mockProperties = [
        { id: 1, propertyId: 'PROP-001' },
        { id: 2, propertyId: 'PROP-002' },
      ];

      mockRequest.body = {
        fundId: 1,
        fundName: 'ABC Investments',
        fundEmail: 'deals@abc.com',
        propertyIds: [1, 2],
      };

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await submitToHedgeFund(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('2 properties'),
          data: expect.objectContaining({
            fundName: 'ABC Investments',
            submittedPropertyCount: 2,
          }),
        })
      );
    });

    it('should return 400 when no valid properties found', async () => {
      mockRequest.body = {
        fundId: 1,
        fundName: 'ABC Investments',
        fundEmail: 'deals@abc.com',
        propertyIds: [999],
      };

      (Property.findAll as jest.Mock).mockResolvedValue([]);

      await submitToHedgeFund(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'No valid properties found for submission',
        })
      );
    });

    it('should handle database errors', async () => {
      mockRequest.body = {
        fundId: 1,
        fundName: 'Test',
        fundEmail: 'test@test.com',
        propertyIds: [1],
      };

      (Property.findAll as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await submitToHedgeFund(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // GET HEDGE FUND BUY BOXES
  // ============================================================================

  describe('getHedgeFundBuyBoxes', () => {
    it('should return mock buy boxes', async () => {
      await getHedgeFundBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(Number),
              fundName: expect.any(String),
              criteria: expect.objectContaining({
                states: expect.any(Array),
              }),
            }),
          ]),
        })
      );
    });
  });

  // ============================================================================
  // MATCH PROPERTIES TO BUY BOXES
  // ============================================================================

  describe('matchPropertiesToBuyBoxes', () => {
    it('should match property to buy boxes', async () => {
      const mockProperty = {
        address: { houseNumber: '123', street: 'Main St' },
      };

      mockRequest.params = { propertyId: '1' };
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await matchPropertiesToBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            propertyId: '1',
            matchingBuyBoxes: expect.any(Array),
          }),
        })
      );
    });

    it('should return 404 when property not found', async () => {
      mockRequest.params = { propertyId: '999' };
      (Property.findByPk as jest.Mock).mockResolvedValue(null);

      await matchPropertiesToBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Property not found',
        })
      );
    });

    it('should handle database errors', async () => {
      mockRequest.params = { propertyId: '1' };
      (Property.findByPk as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await matchPropertiesToBuyBoxes(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });
});
