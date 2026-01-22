/**
 * Test: Add property at 10 OLIVE STREET BLOOMFIELD NJ 07003
 */

import { Request, Response } from 'express';
import { createProperty } from '../../controllers/propertyController';
import Property from '../../models/Property';

// Mock the Property model
jest.mock('../../models/Property');

// Mock the automation engine
jest.mock('../../plugins', () => ({
  automationEngine: {
    emitEvent: jest.fn().mockResolvedValue(undefined),
  },
  scoringEngine: {
    scoreDealAgainstAllBuyBoxes: jest.fn().mockResolvedValue([]),
  },
}));

import { automationEngine } from '../../plugins';

describe('Add Property: 10 OLIVE STREET BLOOMFIELD NJ 07003', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockResponse = {
      json: jsonMock,
      status: statusMock,
    };
  });

  it('should successfully create property at 10 Olive Street, Bloomfield NJ', async () => {
    const oliveStreetProperty = {
      propertyType: 'Single Family',
      address: {
        houseNumber: '10',
        street: 'OLIVE STREET',
      },
      city: 'BLOOMFIELD',
      state: 'NJ',
      zip: '07003',
      county: 'Essex',
    };

    const createdProperty = {
      id: 1,
      ...oliveStreetProperty,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockRequest = { body: oliveStreetProperty };

    (Property.create as jest.Mock).mockResolvedValue(createdProperty);

    await createProperty(mockRequest as Request, mockResponse as Response);

    // Verify create was called with correct data
    expect(Property.create).toHaveBeenCalledWith(oliveStreetProperty);

    // Verify response
    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        city: 'BLOOMFIELD',
        state: 'NJ',
        zip: '07003',
        address: expect.objectContaining({
          houseNumber: '10',
          street: 'OLIVE STREET',
        }),
      })
    );
  });

  it('should create property with full details', async () => {
    const fullPropertyData = {
      propertyType: 'Single Family',
      address: {
        houseNumber: '10',
        street: 'OLIVE STREET',
      },
      city: 'BLOOMFIELD',
      state: 'NJ',
      zip: '07003',
      county: 'Essex',
      bedroomCount: 3,
      bathroomCount: 2,
      livingSpaceSqFt: 1500,
      yearBuilt: 1960,
      reservePrice: 250000,
      arv: 350000,
    };

    const createdProperty = {
      id: 2,
      ...fullPropertyData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockRequest = { body: fullPropertyData };

    (Property.create as jest.Mock).mockResolvedValue(createdProperty);

    await createProperty(mockRequest as Request, mockResponse as Response);

    expect(Property.create).toHaveBeenCalledWith(fullPropertyData);
    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bedroomCount: 3,
        bathroomCount: 2,
        livingSpaceSqFt: 1500,
        yearBuilt: 1960,
        reservePrice: 250000,
        arv: 350000,
      })
    );
  });

  it('should trigger deal.created automation event', async () => {
    const oliveStreetProperty = {
      propertyType: 'Single Family',
      address: {
        houseNumber: '10',
        street: 'OLIVE STREET',
      },
      city: 'BLOOMFIELD',
      state: 'NJ',
      zip: '07003',
      county: 'Essex',
      reservePrice: 275000,
      arv: 375000,
    };

    const createdProperty = {
      id: 1,
      ...oliveStreetProperty,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockRequest = { body: oliveStreetProperty };

    (Property.create as jest.Mock).mockResolvedValue(createdProperty);

    await createProperty(mockRequest as Request, mockResponse as Response);

    // Wait for async event emission
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify automation event was emitted
    expect(automationEngine.emitEvent).toHaveBeenCalledTimes(1);
    expect(automationEngine.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'deal.created',
        payload: expect.objectContaining({
          deal: expect.objectContaining({
            sourceId: 'manual',
            sourceName: 'Manual Entry',
            address: expect.objectContaining({
              street: '10 OLIVE STREET',
              city: 'BLOOMFIELD',
              state: 'NJ',
              zip: '07003',
            }),
          }),
          property: expect.objectContaining({
            id: 1,
            city: 'BLOOMFIELD',
          }),
        }),
        metadata: expect.objectContaining({
          sourceId: 'manual',
          dealId: '1',
        }),
      })
    );
  });

  it('should handle database unavailable gracefully', async () => {
    const oliveStreetProperty = {
      propertyType: 'Single Family',
      address: {
        houseNumber: '10',
        street: 'OLIVE STREET',
      },
      city: 'BLOOMFIELD',
      state: 'NJ',
      zip: '07003',
    };

    mockRequest = { body: oliveStreetProperty };

    // Simulate database error
    (Property.create as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

    await createProperty(mockRequest as Request, mockResponse as Response);

    // Should still return 201 with mock data
    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        city: 'BLOOMFIELD',
        state: 'NJ',
        zip: '07003',
        _mock: true,
      })
    );
  });
});
