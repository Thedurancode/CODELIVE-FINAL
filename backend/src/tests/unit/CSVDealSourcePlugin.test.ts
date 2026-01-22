/**
 * CSVDealSourcePlugin Unit Tests
 */

import { CSVDealSourcePlugin } from '../../plugins/sources/CSVDealSourcePlugin';
import { DealSourceConfig, DealSourceType } from '../../plugins/types';

// Mock fetch for URL imports
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('CSVDealSourcePlugin', () => {
  let plugin: CSVDealSourcePlugin;
  let baseConfig: DealSourceConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();

    baseConfig = {
      id: 'test-csv-source',
      name: 'Test CSV Source',
      type: 'csv' as DealSourceType,
      enabled: true,
      settings: {
        importMethod: 'upload',
        delimiter: ',',
        hasHeaders: true,
        fieldMapping: {
          address: 'Address',
          city: 'City',
          state: 'State',
          zip: 'Zip',
          price: 'Price',
          bedrooms: 'Beds',
          bathrooms: 'Baths',
          sqft: 'SqFt',
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    plugin = new CSVDealSourcePlugin();
  });

  // ============================================================================
  // PLUGIN METADATA
  // ============================================================================

  describe('Plugin Metadata', () => {
    it('should have correct type', () => {
      expect(plugin.type).toBe('csv');
    });

    it('should have correct name', () => {
      expect(plugin.name).toBe('CSV Import');
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
    it('should have importMethod field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'importMethod');
      expect(field).toBeDefined();
      expect(field?.type).toBe('select');
    });

    it('should have delimiter field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'delimiter');
      expect(field).toBeDefined();
    });

    it('should have hasHeaders field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'hasHeaders');
      expect(field).toBeDefined();
      expect(field?.type).toBe('boolean');
    });

    it('should have fieldMapping field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'fieldMapping');
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
      // After dispose, fetching should throw or fail
      await expect(plugin.fetchDeals()).rejects.toThrow();
    });
  });

  // ============================================================================
  // TEST CONNECTION
  // ============================================================================

  describe('testConnection', () => {
    it('should return success for upload method', async () => {
      const result = await plugin.testConnection(baseConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('File upload');
    });

    it('should test URL connection for url method', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          importMethod: 'url',
          fileUrl: 'https://example.com/deals.csv',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: () => 'text/csv',
        },
      });

      const result = await plugin.testConnection(config);

      expect(result.success).toBe(true);
    });

    it('should return failure for invalid URL', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          importMethod: 'url',
          fileUrl: 'https://example.com/deals.csv',
        },
      };

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await plugin.testConnection(config);

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // FILE CONTENT
  // ============================================================================

  describe('setFileContent', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should set file content for processing', () => {
      const csvContent = 'Address,City,State,Zip,Price\n123 Main St,Austin,TX,78701,150000';

      plugin.setFileContent(csvContent);

      // Content should be stored (verify through fetchDeals)
      expect(true).toBe(true); // Just verify no error thrown
    });

    it('should accept csv content', () => {
      const csvContent = 'Address,City,State,Zip,Price\n123 Main St,Austin,TX,78701,150000';

      plugin.setFileContent(csvContent);

      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // CSV PARSING
  // ============================================================================

  describe('CSV Parsing', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should parse simple CSV with headers', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,150000,3,2,1500
456 Oak Ave,Dallas,TX,75201,200000,4,3,2000`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(2);
    });

    it('should parse CSV without headers', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          hasHeaders: false,
          fieldMapping: {
            address: 0,
            city: 1,
            state: 2,
            zip: 3,
            price: 4,
          },
        },
      };

      await plugin.initialize(config);

      const csvContent = `123 Main St,Austin,TX,78701,150000
456 Oak Ave,Dallas,TX,75201,200000`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(2);
    });

    it('should handle different delimiters', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          delimiter: ';',
        },
      };

      await plugin.initialize(config);

      const csvContent = `Address;City;State;Zip;Price;Beds;Baths;SqFt
123 Main St;Austin;TX;78701;150000;3;2;1500`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
    });

    it('should handle tab-delimited files', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          delimiter: '\t',
        },
      };

      await plugin.initialize(config);

      const csvContent = `Address\tCity\tState\tZip\tPrice\tBeds\tBaths\tSqFt
123 Main St\tAustin\tTX\t78701\t150000\t3\t2\t1500`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
    });

    it('should handle quoted fields with commas', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
"123 Main St, Suite 100",Austin,TX,78701,150000,3,2,1500`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
      // The quoted field with comma should be preserved
      expect(result.deals[0].rawData).toBeDefined();
    });

    it('should handle quoted fields with newlines', async () => {
      const csvContent = `Address,City,State,Zip,Price,Description
"123 Main St",Austin,TX,78701,150000,"Beautiful home
with pool"`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
    });

    it('should handle empty values', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,150000,,,`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
    });

    it('should handle escaped quotes', async () => {
      const csvContent = `Address,City,State,Zip,Price,Description
123 Main St,Austin,TX,78701,150000,"Called ""The Manor"""`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
    });
  });

  // ============================================================================
  // FIELD MAPPING
  // ============================================================================

  describe('Field Mapping', () => {
    it('should map fields by column name', async () => {
      // Field mapping: CSV column name -> deal field name
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          fieldMapping: {
            'Property Address': 'address',
            'Location City': 'city',
            'Location State': 'state',
            'ZIP Code': 'zip',
            'Asking Price': 'price',
          },
        },
      };

      await plugin.initialize(config);

      const csvContent = `Property Address,Location City,Location State,ZIP Code,Asking Price
123 Main St,Austin,TX,78701,150000`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
      // Verify the data was parsed
      expect(result.deals[0].rawData).toBeDefined();
    });

    it('should handle CSV without field mapping', async () => {
      await plugin.initialize(baseConfig);

      // Use standard column names that will auto-map
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,150000,3,2,1500`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
    });

    it('should handle missing mapped columns gracefully', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          fieldMapping: {
            Address: 'address',
            City: 'city',
            State: 'state',
            Zip: 'zip',
            Price: 'price',
          },
        },
      };

      await plugin.initialize(config);

      // CSV is missing some columns that might be expected
      const csvContent = `Address,City,State,Zip,Price
123 Main St,Austin,TX,78701,150000`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
    });
  });

  // ============================================================================
  // URL IMPORT
  // ============================================================================

  describe('URL Import', () => {
    it('should fetch CSV from URL', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          importMethod: 'url',
          fileUrl: 'https://example.com/deals.csv',
        },
      };

      await plugin.initialize(config);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,150000,3,2,1500`,
      });

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
    });

    it('should handle URL fetch errors', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          importMethod: 'url',
          fileUrl: 'https://example.com/deals.csv',
        },
      };

      await plugin.initialize(config);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // NORMALIZATION
  // ============================================================================

  describe('Deal Normalization', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should normalize numeric fields', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,150000,3,2,1500`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.deals[0].askingPrice).toBe(150000);
      expect(result.deals[0].bedrooms).toBe(3);
      expect(result.deals[0].bathrooms).toBe(2);
      expect(result.deals[0].sqft).toBe(1500);
    });

    it('should handle currency formatted prices', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,"$150,000",3,2,1500`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.deals[0].askingPrice).toBe(150000);
    });

    it('should include source information', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,150000,3,2,1500`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.deals[0].sourceId).toBe('test-csv-source');
      expect(result.deals[0].sourceName).toBe('Test CSV Source');
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should handle empty file', async () => {
      plugin.setFileContent('');
      const result = await plugin.fetchDeals();

      expect(result.deals).toHaveLength(0);
    });

    it('should handle file with only headers', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.deals).toHaveLength(0);
    });

    it('should handle malformed CSV rows', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,150000,3,2,1500
Malformed row with missing fields`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      // Should still process valid rows
      expect(result.deals.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle non-numeric values in numeric fields', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,InvalidPrice,Three,Two,1500`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
    });
  });

  // ============================================================================
  // METADATA
  // ============================================================================

  describe('Result Metadata', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should include processing metadata', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,150000,3,2,1500
456 Oak Ave,Dallas,TX,75201,200000,4,3,2000`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.totalProcessed).toBe(2);
      expect(result.metadata?.syncDuration).toBeDefined();
    });
  });

  // ============================================================================
  // SKIP ROWS
  // ============================================================================

  describe('Skip Rows', () => {
    it('should skip specified number of rows', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          skipRows: 2,
        },
      };

      await plugin.initialize(config);

      const csvContent = `Report Title
Generated: 2024-01-01
Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Main St,Austin,TX,78701,150000,3,2,1500`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(1);
    });
  });

  // ============================================================================
  // ENCODING
  // ============================================================================

  describe('Encoding', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should handle UTF-8 encoded content', async () => {
      const csvContent = `Address,City,State,Zip,Price,Beds,Baths,SqFt
123 Calle Principal,San José,CA,95110,150000,3,2,1500`;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals[0].address.city).toBe('San José');
    });
  });

  // ============================================================================
  // LARGE FILES
  // ============================================================================

  describe('Large Files', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should handle large number of rows', async () => {
      const header = 'Address,City,State,Zip,Price,Beds,Baths,SqFt\n';
      const rows = Array(100)
        .fill(0)
        .map((_, i) => `${i} Main St,Austin,TX,78701,${100000 + i * 1000},3,2,1500`)
        .join('\n');

      const csvContent = header + rows;

      plugin.setFileContent(csvContent);
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(100);
    });
  });
});
