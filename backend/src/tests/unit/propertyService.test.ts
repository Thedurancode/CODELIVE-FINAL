/**
 * PropertyService Unit Tests
 */

import { propertyService } from '../../services/propertyService';
import Property from '../../models/Property';
import { NormalizedDeal } from '../../plugins/types';

// Mock the Property model
jest.mock('../../models/Property');

describe('PropertyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // ADDRESS NORMALIZATION TESTS
  // ============================================================================

  describe('normalizeAddress', () => {
    it('should normalize street names to abbreviations', () => {
      const service = propertyService as any;

      expect(service.normalizeAddress('123 Main Street')).toBe('123 main st');
      expect(service.normalizeAddress('456 Oak Avenue')).toBe('456 oak ave');
      expect(service.normalizeAddress('789 Pine Road')).toBe('789 pine rd');
      expect(service.normalizeAddress('101 Elm Drive')).toBe('101 elm dr');
      expect(service.normalizeAddress('202 Cedar Lane')).toBe('202 cedar ln');
      expect(service.normalizeAddress('303 Maple Court')).toBe('303 maple ct');
      expect(service.normalizeAddress('404 Birch Boulevard')).toBe('404 birch blvd');
    });

    it('should remove punctuation', () => {
      const service = propertyService as any;

      expect(service.normalizeAddress('123 Main St.')).toBe('123 main st');
      expect(service.normalizeAddress('456 Oak Ave, #5')).toBe('456 oak ave 5');
    });

    it('should normalize whitespace', () => {
      const service = propertyService as any;

      expect(service.normalizeAddress('123   Main    Street')).toBe('123 main st');
      expect(service.normalizeAddress('  456 Oak Ave  ')).toBe('456 oak ave');
    });

    it('should convert to lowercase', () => {
      const service = propertyService as any;

      expect(service.normalizeAddress('123 MAIN STREET')).toBe('123 main st');
      expect(service.normalizeAddress('456 OAK Avenue')).toBe('456 oak ave');
    });
  });

  // ============================================================================
  // PARSE STREET ADDRESS TESTS
  // ============================================================================

  describe('parseStreetAddress', () => {
    it('should parse standard addresses', () => {
      const service = propertyService as any;

      expect(service.parseStreetAddress('123 Main Street')).toEqual({
        houseNumber: '123',
        street: 'Main Street',
      });
    });

    it('should handle addresses with letter suffixes', () => {
      const service = propertyService as any;

      expect(service.parseStreetAddress('123A Main Street')).toEqual({
        houseNumber: '123A',
        street: 'Main Street',
      });
    });

    it('should handle addresses with dashes', () => {
      const service = propertyService as any;

      expect(service.parseStreetAddress('123-45 Main Street')).toEqual({
        houseNumber: '123-45',
        street: 'Main Street',
      });
    });

    it('should handle addresses without house numbers', () => {
      const service = propertyService as any;

      expect(service.parseStreetAddress('Main Street')).toEqual({
        houseNumber: '',
        street: 'Main Street',
      });
    });

    it('should handle empty addresses', () => {
      const service = propertyService as any;

      expect(service.parseStreetAddress('')).toEqual({
        houseNumber: '',
        street: '',
      });
    });
  });

  // ============================================================================
  // FIND BY ADDRESS TESTS
  // ============================================================================

  describe('findByAddress', () => {
    it('should find property by normalized address', async () => {
      const mockProperty = {
        propertyId: 'prop-123',
        dataValues: {
          address: { houseNumber: '123', street: 'Main Street' },
        },
      };

      (Property.findAll as jest.Mock).mockResolvedValue([mockProperty]);

      const result = await propertyService.findByAddress('123 Main St', 'Austin', 'TX');

      expect(Property.findAll).toHaveBeenCalled();
      expect(result).toBe(mockProperty);
    });

    it('should return null when no match found', async () => {
      (Property.findAll as jest.Mock).mockResolvedValue([]);

      const result = await propertyService.findByAddress('123 Main St', 'Austin', 'TX');

      expect(result).toBeNull();
    });

    it('should match with street abbreviations', async () => {
      const mockProperty = {
        propertyId: 'prop-123',
        dataValues: {
          address: { houseNumber: '456', street: 'Oak Avenue' },
        },
      };

      (Property.findAll as jest.Mock).mockResolvedValue([mockProperty]);

      const result = await propertyService.findByAddress('456 Oak Ave', 'Austin', 'TX');

      expect(result).toBe(mockProperty);
    });
  });

  // ============================================================================
  // CHECK DUPLICATE TESTS
  // ============================================================================

  describe('checkDuplicate', () => {
    it('should detect duplicate by external ID', async () => {
      const existingProperty = { propertyId: 'prop-123' };
      (Property.findOne as jest.Mock).mockResolvedValue(existingProperty);

      const deal: Partial<NormalizedDeal> = {
        externalId: 'prop-123',
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
      };

      const result = await propertyService.checkDuplicate(deal as NormalizedDeal);

      expect(result.isDuplicate).toBe(true);
      expect(result.existingProperty).toBe(existingProperty);
    });

    it('should detect duplicate by address', async () => {
      const existingProperty = {
        propertyId: 'prop-456',
        dataValues: {
          address: { houseNumber: '123', street: 'Main Street' },
        },
      };

      (Property.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findAll as jest.Mock).mockResolvedValue([existingProperty]);

      const deal: Partial<NormalizedDeal> = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
      };

      const result = await propertyService.checkDuplicate(deal as NormalizedDeal);

      expect(result.isDuplicate).toBe(true);
    });

    it('should return false when no duplicate found', async () => {
      (Property.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findAll as jest.Mock).mockResolvedValue([]);

      const deal: Partial<NormalizedDeal> = {
        address: { street: '999 New Street', city: 'Austin', state: 'TX', zip: '78701' },
      };

      const result = await propertyService.checkDuplicate(deal as NormalizedDeal);

      expect(result.isDuplicate).toBe(false);
    });
  });

  // ============================================================================
  // SAVE DEAL TO DATABASE TESTS
  // ============================================================================

  describe('saveDealToDatabase', () => {
    const mockDeal: Partial<NormalizedDeal> = {
      sourceId: 'source-1',
      sourceName: 'Test Source',
      address: {
        street: '123 Main Street',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      },
      askingPrice: 200000,
      bedrooms: 3,
      bathrooms: 2,
      sqft: 1500,
      propertyType: 'Single Family',
      normalizedAt: new Date(),
      confidence: 0.9,
      rawData: {},
    };

    it('should create new property when no duplicate exists', async () => {
      const newProperty = {
        propertyId: 'prop-new',
        ...mockDeal,
      };

      (Property.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findAll as jest.Mock).mockResolvedValue([]);
      (Property.create as jest.Mock).mockResolvedValue(newProperty);

      const result = await propertyService.saveDealToDatabase(mockDeal as NormalizedDeal);

      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(Property.create).toHaveBeenCalled();
    });

    it('should return duplicate when allowUpdate is false', async () => {
      const existingProperty = {
        propertyId: 'prop-existing',
        dataValues: {
          address: { houseNumber: '123', street: 'Main Street' },
        },
      };

      (Property.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findAll as jest.Mock).mockResolvedValue([existingProperty]);

      const result = await propertyService.saveDealToDatabase(
        mockDeal as NormalizedDeal,
        { allowUpdate: false }
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('duplicate');
      expect(result.duplicateOf).toBe('prop-existing');
    });

    it('should update existing property when allowUpdate is true', async () => {
      const existingProperty = {
        propertyId: 'prop-existing',
        llcOwnerName: null,
        ownerHistory: [],
        dataValues: {
          address: { houseNumber: '123', street: 'Main Street' },
        },
        update: jest.fn().mockResolvedValue(true),
      };

      (Property.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findAll as jest.Mock).mockResolvedValue([existingProperty]);

      const result = await propertyService.saveDealToDatabase(mockDeal as NormalizedDeal);

      expect(result.success).toBe(true);
      expect(result.action).toBe('updated');
      expect(existingProperty.update).toHaveBeenCalled();
    });

    it('should detect owner change', async () => {
      const existingProperty = {
        propertyId: 'prop-existing',
        llcOwnerName: 'Old Owner LLC',
        wholesalerLlcName: 'Old Owner LLC',
        ownerHistory: [],
        dataValues: {
          address: { houseNumber: '123', street: 'Main Street' },
        },
        update: jest.fn().mockResolvedValue(true),
      };

      (Property.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findAll as jest.Mock).mockResolvedValue([existingProperty]);

      const dealWithNewOwner = {
        ...mockDeal,
        wholesalerName: 'New Owner LLC',
      };

      const result = await propertyService.saveDealToDatabase(dealWithNewOwner as NormalizedDeal);

      expect(result.success).toBe(true);
      expect(result.ownerChanged).toBe(true);
      expect(result.previousOwner).toBe('Old Owner LLC');
    });

    it('should handle errors gracefully', async () => {
      (Property.findOne as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await propertyService.saveDealToDatabase(mockDeal as NormalizedDeal);

      // Service may catch error internally
      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });
  });

  // ============================================================================
  // BULK SAVE DEALS TESTS
  // ============================================================================

  describe('bulkSaveDeals', () => {
    const mockDeals: Partial<NormalizedDeal>[] = [
      {
        sourceId: 'source-1',
        sourceName: 'Test',
        address: { street: '111 First St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 100000,
        normalizedAt: new Date(),
        confidence: 0.9,
        rawData: {},
      },
      {
        sourceId: 'source-2',
        sourceName: 'Test',
        address: { street: '222 Second St', city: 'Austin', state: 'TX', zip: '78702' },
        askingPrice: 200000,
        normalizedAt: new Date(),
        confidence: 0.9,
        rawData: {},
      },
    ];

    it('should save multiple deals', async () => {
      (Property.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findAll as jest.Mock).mockResolvedValue([]);
      (Property.create as jest.Mock)
        .mockResolvedValueOnce({ propertyId: 'prop-1' })
        .mockResolvedValueOnce({ propertyId: 'prop-2' });

      const result = await propertyService.bulkSaveDeals(mockDeals as NormalizedDeal[]);

      expect(result.total).toBe(2);
      expect(result.created).toBe(2);
      expect(result.properties).toHaveLength(2);
    });

    it('should track duplicates', async () => {
      const existingProperty = {
        propertyId: 'prop-existing',
        dataValues: {
          address: { houseNumber: '111', street: 'First St' },
        },
      };

      (Property.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findAll as jest.Mock)
        .mockResolvedValueOnce([existingProperty])
        .mockResolvedValueOnce([]);
      (Property.create as jest.Mock).mockResolvedValue({ propertyId: 'prop-2' });

      const result = await propertyService.bulkSaveDeals(
        mockDeals as NormalizedDeal[],
        { allowUpdate: false }
      );

      expect(result.duplicates).toBe(1);
      expect(result.created).toBe(1);
    });

    it('should skip duplicates when skipDuplicates is true', async () => {
      const existingProperty = {
        propertyId: 'prop-existing',
        dataValues: {
          address: { houseNumber: '111', street: 'First St' },
        },
      };

      (Property.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findAll as jest.Mock)
        .mockResolvedValueOnce([existingProperty])
        .mockResolvedValueOnce([]);
      (Property.create as jest.Mock).mockResolvedValue({ propertyId: 'prop-2' });

      const result = await propertyService.bulkSaveDeals(
        mockDeals as NormalizedDeal[],
        { skipDuplicates: true }
      );

      expect(result.duplicates).toBe(1);
      expect(result.duplicateProperties).toHaveLength(1);
    });

    it('should track results for all deals', async () => {
      // Mock successful saves
      (Property.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findAll as jest.Mock).mockResolvedValue([]);
      (Property.create as jest.Mock)
        .mockResolvedValueOnce({ propertyId: 'prop-1' })
        .mockResolvedValueOnce({ propertyId: 'prop-2' });

      const result = await propertyService.bulkSaveDeals(mockDeals as NormalizedDeal[]);

      expect(result.total).toBe(2);
      expect(result.created + result.updated + result.duplicates + result.skipped).toBe(2);
    });
  });

  // ============================================================================
  // GET PROPERTIES TESTS
  // ============================================================================

  describe('getProperties', () => {
    it('should return paginated properties', async () => {
      const mockProperties = [
        { propertyId: 'prop-1' },
        { propertyId: 'prop-2' },
      ];

      (Property.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: mockProperties,
        count: 100,
      });

      const result = await propertyService.getProperties({ limit: 10, offset: 0 });

      expect(result.properties).toHaveLength(2);
      expect(result.total).toBe(100);
      expect(Property.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 0,
        })
      );
    });

    it('should apply filters', async () => {
      (Property.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await propertyService.getProperties({
        filters: {
          city: 'Austin',
          state: 'TX',
          propertyType: 'Single Family',
        },
      });

      expect(Property.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            city: 'Austin',
            state: 'TX',
            propertyType: 'Single Family',
          }),
        })
      );
    });

    it('should use default pagination values', async () => {
      (Property.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await propertyService.getProperties();

      expect(Property.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 0,
        })
      );
    });
  });

  // ============================================================================
  // DELETE PROPERTY TESTS
  // ============================================================================

  describe('deleteProperty', () => {
    it('should return true when property deleted', async () => {
      (Property.destroy as jest.Mock).mockResolvedValue(1);

      const result = await propertyService.deleteProperty('prop-123');

      expect(result).toBe(true);
      expect(Property.destroy).toHaveBeenCalledWith({
        where: { propertyId: 'prop-123' },
      });
    });

    it('should return false when property not found', async () => {
      (Property.destroy as jest.Mock).mockResolvedValue(0);

      const result = await propertyService.deleteProperty('nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // MAP DEAL TO PROPERTY TESTS
  // ============================================================================

  describe('mapDealToProperty', () => {
    it('should map all deal fields to property', () => {
      const service = propertyService as any;
      const deal: Partial<NormalizedDeal> = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 200000,
        arv: 280000,
        repairEstimate: 30000,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1500,
        lotSize: 0.25, // Acres
        yearBuilt: 1990,
        propertyType: 'Single Family',
        occupancyStatus: 'vacant',
        wholesalerName: 'Test Wholesaler',
        wholesalerCompany: 'Test LLC',
        wholesalerEmail: 'test@example.com',
        description: 'Great property',
        photos: ['photo1.jpg', 'photo2.jpg'],
      };

      const result = service.mapDealToProperty(deal, 'prop-123');

      expect(result.propertyId).toBe('prop-123');
      expect(result.city).toBe('Austin');
      expect(result.state).toBe('TX');
      expect(result.bedroomCount).toBe(3);
      expect(result.bathroomCount).toBe(2);
      expect(result.livingSpaceSqFt).toBe(1500);
      expect(result.lotSizeSqFt).toBe(10890); // 0.25 acres * 43560
      expect(result.arv).toBe(280000);
      expect(result.rehabCost).toBe(30000);
      expect(result.occupancyStatus).toBe('Vacant');
      expect(result.llcOwnerName).toBe('Test Wholesaler');
      expect(result.photoLinks).toEqual(['photo1.jpg', 'photo2.jpg']);
    });

    it('should handle missing optional fields', () => {
      const service = propertyService as any;
      const deal: Partial<NormalizedDeal> = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '' },
        askingPrice: 200000,
      };

      const result = service.mapDealToProperty(deal, 'prop-123');

      expect(result.propertyId).toBe('prop-123');
      expect(result.bedroomCount).toBe(0);
      expect(result.bathroomCount).toBe(0);
      // Empty zip gets defaulted by the service
      expect(result.zip).toBeDefined();
    });

    it('should convert lot size from sqft when > 100', () => {
      const service = propertyService as any;
      const deal: Partial<NormalizedDeal> = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        lotSize: 5000, // Already in sqft
      };

      const result = service.mapDealToProperty(deal, 'prop-123');

      expect(result.lotSizeSqFt).toBe(5000);
    });
  });
});
