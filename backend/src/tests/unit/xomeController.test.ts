/**
 * Xome Controller Unit Tests
 */

import { Request, Response } from 'express';
import {
  getPropertiesForXome,
  submitToXome,
} from '../../controllers/xomeController';
import Property from '../../models/Property';

jest.mock('../../models/Property');

describe('XomeController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  const createMockProperty = (overrides = {}) => ({
    id: 1,
    propertyId: 'PROP-001',
    propertyType: 'Single Family',
    propertyOwnership: 'Individual',
    workflowType: 'Standard',
    address: {
      houseNumber: '123',
      street: 'Main St',
      address2: '',
    },
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    county: 'Travis',
    country: 'USA',
    yearBuilt: 1990,
    livingSpaceSqFt: 1800,
    lotSizeSqFt: 7500,
    bedroomCount: 3,
    bathroomCount: 2,
    fullBathrooms: 2,
    partialBathrooms: 0,
    stories: 1,
    garage: '2 Car',
    garageCount: 2,
    pool: false,
    solar: false,
    purchaseContractPrice: 200000,
    reservePrice: 180000,
    buyItNowPrice: 220000,
    startingBidAmount: 150000,
    monthlyRent: 1800,
    arv: 280000,
    renovationBudget: 30000,
    bpoValue1: 260000,
    bpoValue1Date: new Date('2024-12-01'),
    bpoValue2: 270000,
    bpoValue2Date: new Date('2024-12-15'),
    appraisalValue: 265000,
    appraisalDate: new Date('2024-11-01'),
    mlsListingPrice: 275000,
    commissionPercentage: 3,
    occupancyStatus: 'Vacant',
    occupancyDetails: 'No tenants',
    deliveredVacant: true,
    accessToProperty: 'Lockbox',
    lockboxCode: '1234',
    hoa: true,
    hoaBillingFrequency: 'Monthly',
    hoaDuesAmount: 150,
    liveOnHubzu: false,
    onMarketOffMarket: 'Off Market',
    syndication: true,
    listedOnMLS: false,
    mlsNumber: null,
    mlsListedDate: null,
    mlsExpirationDate: null,
    mlsEligible: true,
    photosFolder: '/photos/PROP-001',
    photoLinks: ['photo1.jpg', 'photo2.jpg'],
    propertyListingDescription: 'Great investment property',
    agentFirstName: 'John',
    agentLastName: 'Smith',
    agentEmail: 'john@realty.com',
    agentPhoneNumber: '555-0123',
    agentLicenseNumber: 'TX12345',
    licensedState: 'TX',
    agentAddress: '456 Agent St',
    agentCity: 'Austin',
    agentState: 'TX',
    agentZip: '78702',
    brokerCompany: 'ABC Realty',
    brokerLicenseNumber: 'BR12345',
    managingBroker: 'Jane Doe',
    managingBrokerLicenseNumber: 'MB12345',
    conveyanceType: 'Assignment of Contract',
    status: 'Green',
    complianceNotes: null,
    update: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

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
  });

  // ============================================================================
  // GET PROPERTIES FOR XOME
  // ============================================================================

  describe('getPropertiesForXome', () => {
    it('should return properties formatted for Xome submission', async () => {
      const mockProperties = [createMockProperty()];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

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
              assetType: 'Single Family',
              address: expect.objectContaining({
                city: 'Austin',
                state: 'TX',
              }),
            }),
          ]),
        })
      );
    });

    it('should format address correctly', async () => {
      const mockProperties = [createMockProperty()];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0].address).toEqual(
        expect.objectContaining({
          houseNumber: '123',
          street: 'Main St',
          city: 'Austin',
          state: 'TX',
          zip: '78701',
          county: 'Travis',
          country: 'USA',
        })
      );
    });

    it('should include property details', async () => {
      const mockProperties = [createMockProperty()];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0].propertyDetails).toEqual(
        expect.objectContaining({
          propertyId: 'PROP-001',
          propertyType: 'Single Family',
          yearBuilt: 1990,
          livingSpaceSqFt: 1800,
          bedroomCount: 3,
          bathroomCount: 2,
        })
      );
    });

    it('should include financial information', async () => {
      const mockProperties = [createMockProperty()];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0].financial).toEqual(
        expect.objectContaining({
          purchaseContractPrice: 200000,
          reservePrice: 180000,
          buyItNowPrice: 220000,
          arv: 280000,
        })
      );
    });

    it('should include occupancy information', async () => {
      const mockProperties = [createMockProperty()];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0].occupancy).toEqual(
        expect.objectContaining({
          occupancyStatus: 'Vacant',
          deliveredVacant: true,
          accessToProperty: 'Lockbox',
        })
      );
    });

    it('should include agent information when present', async () => {
      const mockProperties = [createMockProperty()];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0].agent).toEqual(
        expect.objectContaining({
          agentFirstName: 'John',
          agentLastName: 'Smith',
          agentEmail: 'john@realty.com',
        })
      );
    });

    it('should not include agent when agentFirstName is missing', async () => {
      const mockProperties = [createMockProperty({ agentFirstName: null })];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0].agent).toBeUndefined();
    });

    it('should handle empty results', async () => {
      (Property.findAll as jest.Mock).mockResolvedValue([]);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

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

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to fetch properties for Xome submission',
        })
      );

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // SUBMIT TO XOME
  // ============================================================================

  describe('submitToXome', () => {
    it('should submit compliant property to Xome', async () => {
      const mockProperty = createMockProperty();
      mockRequest.params = { propertyId: '1' };
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await submitToXome(mockRequest as Request, mockResponse as Response);

      expect(mockProperty.update).toHaveBeenCalledWith({
        liveOnHubzu: true,
        updatedAt: expect.any(Date),
      });

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Property successfully submitted to Xome',
          data: expect.objectContaining({
            propertyId: '1',
            submittedAt: expect.any(String),
          }),
        })
      );
    });

    it('should return 404 when property not found', async () => {
      mockRequest.params = { propertyId: '999' };
      (Property.findByPk as jest.Mock).mockResolvedValue(null);

      await submitToXome(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Property not found',
        })
      );
    });

    it('should return 400 when property status is not Green', async () => {
      const mockProperty = createMockProperty({
        status: 'Yellow',
        complianceNotes: 'Missing marketing clause',
      });
      mockRequest.params = { propertyId: '1' };
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await submitToXome(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('not ready for Xome submission'),
          complianceNotes: 'Missing marketing clause',
        })
      );
    });

    it('should return 400 when property status is Red', async () => {
      const mockProperty = createMockProperty({ status: 'Red' });
      mockRequest.params = { propertyId: '1' };
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await submitToXome(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should include full submission data in response', async () => {
      const mockProperty = createMockProperty();
      mockRequest.params = { propertyId: '1' };
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await submitToXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data.submissionData).toEqual(
        expect.objectContaining({
          assetType: expect.any(String),
          address: expect.any(Object),
          propertyDetails: expect.any(Object),
          financial: expect.any(Object),
          occupancy: expect.any(Object),
          hoa: expect.any(Object),
          marketing: expect.any(Object),
          broker: expect.any(Object),
          transaction: expect.any(Object),
        })
      );
    });

    it('should handle database errors', async () => {
      mockRequest.params = { propertyId: '1' };
      (Property.findByPk as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await submitToXome(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to submit property to Xome',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should set default conveyance type if not specified', async () => {
      const mockProperty = createMockProperty({ conveyanceType: null });
      mockRequest.params = { propertyId: '1' };
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await submitToXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data.submissionData.transaction.conveyanceType).toBe('Assignment of Contract');
    });

    it('should set default on/off market status', async () => {
      const mockProperty = createMockProperty({ onMarketOffMarket: null });
      mockRequest.params = { propertyId: '1' };
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      await submitToXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data.submissionData.marketing.onMarketOffMarket).toBe('Off Market');
    });
  });

  // ============================================================================
  // DATA TRANSFORMATION TESTS
  // ============================================================================

  describe('Data Transformation', () => {
    it('should handle properties with address2', async () => {
      const mockProperties = [
        createMockProperty({
          address: {
            houseNumber: '123',
            street: 'Main St',
            address2: 'Unit 5',
          },
        }),
      ];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0].address.address2).toBe('Unit 5');
    });

    it('should default pool to false', async () => {
      const mockProperties = [createMockProperty({ pool: undefined })];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0].propertyDetails.pool).toBe(false);
    });

    it('should default solar to false', async () => {
      const mockProperties = [createMockProperty({ solar: undefined })];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0].propertyDetails.solar).toBe(false);
    });

    it('should default country to USA', async () => {
      const mockProperties = [createMockProperty({ country: undefined })];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      await getPropertiesForXome(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0].address.country).toBe('USA');
    });
  });
});
