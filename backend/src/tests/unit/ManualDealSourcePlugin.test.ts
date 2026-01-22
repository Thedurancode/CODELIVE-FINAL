/**
 * ManualDealSourcePlugin Unit Tests
 */

import { ManualDealSourcePlugin } from '../../plugins/sources/ManualDealSourcePlugin';
import { DealSourceConfig, DealSourceType } from '../../plugins/types';

describe('ManualDealSourcePlugin', () => {
  let plugin: ManualDealSourcePlugin;
  let baseConfig: DealSourceConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    baseConfig = {
      id: 'test-manual-source',
      name: 'Test Manual Source',
      type: 'manual' as DealSourceType,
      enabled: true,
      settings: {
        requiredFields: 'address.street,address.city,address.state,address.zip,askingPrice',
        defaultPropertyType: 'single_family',
        idPrefix: 'MAN',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    plugin = new ManualDealSourcePlugin();
  });

  // ============================================================================
  // PLUGIN METADATA
  // ============================================================================

  describe('Plugin Metadata', () => {
    it('should have correct type', () => {
      expect(plugin.type).toBe('manual');
    });

    it('should have correct name', () => {
      expect(plugin.name).toBe('Manual Entry');
    });

    it('should have version', () => {
      expect(plugin.version).toBeDefined();
    });

    it('should have description', () => {
      expect(plugin.description).toBeDefined();
    });

    it('should have config schema', () => {
      expect(plugin.configSchema).toBeDefined();
      expect(plugin.configSchema.fields).toBeDefined();
    });
  });

  // ============================================================================
  // CONFIG SCHEMA
  // ============================================================================

  describe('Config Schema', () => {
    it('should have requiredFields field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'requiredFields');
      expect(field).toBeDefined();
    });

    it('should have defaultPropertyType field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'defaultPropertyType');
      expect(field).toBeDefined();
    });

    it('should have idPrefix field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'idPrefix');
      expect(field).toBeDefined();
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await plugin.initialize(baseConfig);
      // Verify plugin works after initialization
      const result = await plugin.fetchDeals();
      expect(result).toBeDefined();
    });

    it('should dispose successfully', async () => {
      await plugin.initialize(baseConfig);
      await plugin.dispose();
      // After dispose, operations should throw
      await expect(plugin.fetchDeals()).rejects.toThrow();
    });
  });

  // ============================================================================
  // TEST CONNECTION
  // ============================================================================

  describe('testConnection', () => {
    it('should return success for manual plugin', async () => {
      const result = await plugin.testConnection(baseConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Manual');
    });
  });

  // ============================================================================
  // SUBMIT DEAL
  // ============================================================================

  describe('submitDeal', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should accept valid deal data', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1500,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
      expect(result.deal).toBeDefined();
    });

    it('should generate unique external ID', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.deal?.externalId).toBeDefined();
      expect(result.deal?.externalId).toContain('MAN');
    });

    it('should validate required fields', async () => {
      const dealData = {
        address: { street: '123 Main St' },
        // Missing city, state, zip, askingPrice
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should apply default values', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.deal?.propertyType).toBe('single_family');
    });

    it('should not override provided values with defaults', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
        propertyType: 'multi_family',
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.deal?.propertyType).toBe('multi_family');
    });

    it('should include source information', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.deal?.sourceId).toBe('test-manual-source');
      expect(result.deal?.sourceName).toBe('Test Manual Source');
    });
  });

  // ============================================================================
  // SUBMIT BULK
  // ============================================================================

  describe('submitBulk', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should accept multiple deals', async () => {
      const deals = [
        {
          address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
          askingPrice: 150000,
        },
        {
          address: { street: '456 Oak Ave', city: 'Dallas', state: 'TX', zip: '75201' },
          askingPrice: 200000,
        },
      ];

      const result = await plugin.submitBulk(deals);

      expect(result.success).toBe(true);
      expect(result.processed).toHaveLength(2);
    });

    it('should process valid deals and report invalid ones', async () => {
      const deals = [
        {
          address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
          askingPrice: 150000,
        },
        {
          address: { street: '456 Oak Ave' },
          // Missing required fields
          askingPrice: 200000,
        },
      ];

      const result = await plugin.submitBulk(deals);

      // Should have at least one successful deal
      expect(result.processed.length).toBeGreaterThanOrEqual(1);
      // Should have errors for invalid deal
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should generate unique IDs for each deal', async () => {
      const deals = [
        {
          address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
          askingPrice: 150000,
        },
        {
          address: { street: '456 Oak Ave', city: 'Dallas', state: 'TX', zip: '75201' },
          askingPrice: 200000,
        },
      ];

      const result = await plugin.submitBulk(deals);

      const ids = result.processed.map((d) => d.externalId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should handle empty array', async () => {
      const result = await plugin.submitBulk([]);

      expect(result.success).toBe(true);
      expect(result.processed).toHaveLength(0);
    });
  });

  // ============================================================================
  // VALIDATION
  // ============================================================================

  describe('Validation', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should validate address.street field', async () => {
      const dealData = {
        address: { city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('address.street'))).toBe(true);
    });

    it('should validate address.city field', async () => {
      const dealData = {
        address: { street: '123 Main St', state: 'TX', zip: '78701' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('address.city'))).toBe(true);
    });

    it('should validate address.state field', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', zip: '78701' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('address.state'))).toBe(true);
    });

    it('should validate address.zip field', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('address.zip'))).toBe(true);
    });

    it('should accept valid numeric values', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
        bedrooms: 3,
        bathrooms: 2.5,
        sqft: 1500,
        yearBuilt: 1990,
        arv: 200000,
        repairEstimate: 30000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
      expect(result.deal?.askingPrice).toBe(150000);
      expect(result.deal?.bedrooms).toBe(3);
      expect(result.deal?.bathrooms).toBe(2.5);
    });

    it('should handle string numeric values', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: '150000',
        bedrooms: '3',
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
      expect(result.deal?.askingPrice).toBe(150000);
      expect(result.deal?.bedrooms).toBe(3);
    });
  });

  // ============================================================================
  // CUSTOM REQUIRED FIELDS
  // ============================================================================

  describe('Custom Required Fields', () => {
    it('should respect custom required fields configuration', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          requiredFields: 'address.street,askingPrice',
        },
      };

      await plugin.initialize(config);

      const dealData = {
        address: { street: '123 Main St' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
    });

    it('should validate against custom required fields', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          requiredFields: 'address.street,askingPrice,arv',
        },
      };

      await plugin.initialize(config);

      const dealData = {
        address: { street: '123 Main St' },
        askingPrice: 150000,
        // Missing arv
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('arv'))).toBe(true);
    });
  });

  // ============================================================================
  // CUSTOM DEFAULT VALUES
  // ============================================================================

  describe('Custom Default Values', () => {
    it('should apply custom default property type', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          requiredFields: 'address.street,askingPrice',
          defaultPropertyType: 'condo',
        },
      };

      await plugin.initialize(config);

      const dealData = {
        address: { street: '123 Main St' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
      expect(result.deal?.propertyType).toBe('condo');
    });
  });

  // ============================================================================
  // ID PREFIX
  // ============================================================================

  describe('ID Prefix', () => {
    it('should use custom ID prefix', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          idPrefix: 'CUSTOM',
        },
      };

      await plugin.initialize(config);

      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.deal?.externalId).toContain('CUSTOM');
    });

    it('should use default prefix if not specified', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          idPrefix: undefined,
        },
      };

      await plugin.initialize(config);

      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.deal?.externalId).toBeDefined();
    });
  });

  // ============================================================================
  // FETCH DEALS
  // ============================================================================

  describe('fetchDeals', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should return empty array for manual source', async () => {
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(0);
    });
  });

  // ============================================================================
  // NORMALIZATION
  // ============================================================================

  describe('Deal Normalization', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should normalize all deal fields', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1500,
        yearBuilt: 1990,
        lotSize: 5000,
        propertyType: 'single_family',
        arv: 200000,
        repairEstimate: 30000,
        description: 'Beautiful home',
        wholesalerName: 'John Doe',
        wholesalerPhone: '555-123-4567',
        wholesalerEmail: 'john@example.com',
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
      expect(result.deal).toMatchObject({
        address: expect.objectContaining({
          street: '123 Main St',
          city: 'Austin',
          state: 'TX',
          zip: '78701',
        }),
        askingPrice: 150000,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1500,
        yearBuilt: 1990,
        arv: 200000,
        repairEstimate: 30000,
      });
    });

    it('should handle full address string', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          requiredFields: 'address.street,askingPrice',
        },
      };

      await plugin.initialize(config);

      const dealData = {
        address: { street: '123 Main St, Austin, TX 78701' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
      expect(result.deal?.address.street).toContain('123 Main St');
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should handle null deal data', async () => {
      // Plugin may throw on null input
      await expect(plugin.submitDeal(null as any)).rejects.toThrow();
    });

    it('should handle undefined deal data', async () => {
      // Plugin may throw on undefined input
      await expect(plugin.submitDeal(undefined as any)).rejects.toThrow();
    });

    it('should handle empty object', async () => {
      const result = await plugin.submitDeal({});

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return descriptive error messages', async () => {
      const dealData = {
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.errors.length).toBeGreaterThan(0);
      result.errors.forEach((error) => {
        expect(typeof error).toBe('string');
        expect(error.length).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // METADATA
  // ============================================================================

  describe('Result Metadata', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should include deal data on success', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
      expect(result.deal).toBeDefined();
      expect(result.deal?.externalId).toBeDefined();
    });

    it('should track processed count in bulk', async () => {
      const deals = [
        {
          address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
          askingPrice: 150000,
        },
        {
          address: { street: '456 Oak Ave', city: 'Dallas', state: 'TX', zip: '75201' },
          askingPrice: 200000,
        },
      ];

      const result = await plugin.submitBulk(deals);

      expect(result.success).toBe(true);
      expect(result.processed).toHaveLength(2);
    });
  });

  // ============================================================================
  // ADDITIONAL FIELDS
  // ============================================================================

  describe('Additional Fields', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should preserve custom fields in rawData', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
        customField1: 'custom value 1',
        customField2: 123,
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
      expect(result.deal?.rawData?.customField1).toBe('custom value 1');
      expect(result.deal?.rawData?.customField2).toBe(123);
    });

    it('should handle notes field', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
        notes: 'This is a great investment property',
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
    });

    it('should handle photos array', async () => {
      const dealData = {
        address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        askingPrice: 150000,
        photos: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
      };

      const result = await plugin.submitDeal(dealData);

      expect(result.success).toBe(true);
      expect(result.deal?.photos).toEqual([
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
      ]);
    });
  });
});
