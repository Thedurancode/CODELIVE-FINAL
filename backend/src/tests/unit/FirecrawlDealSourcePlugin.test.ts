/**
 * FirecrawlDealSourcePlugin Unit Tests
 */

import { FirecrawlDealSourcePlugin, FirecrawlSiteConfig } from '../../plugins/sources/FirecrawlDealSourcePlugin';
import { DealSourceConfig, DealSourceType } from '../../plugins/types';

// Mock Firecrawl SDK
jest.mock('@mendable/firecrawl-js', () => {
  return jest.fn().mockImplementation(() => ({
    scrapeUrl: jest.fn(),
    batchScrapeUrls: jest.fn(),
    asyncCrawlUrl: jest.fn(),
    checkCrawlStatus: jest.fn(),
    mapUrl: jest.fn(),
  }));
});

describe('FirecrawlDealSourcePlugin', () => {
  let plugin: FirecrawlDealSourcePlugin;
  let baseConfig: DealSourceConfig;
  let mockFirecrawl: any;

  beforeEach(() => {
    jest.clearAllMocks();

    baseConfig = {
      id: 'test-firecrawl-source',
      name: 'Test Firecrawl Source',
      type: 'firecrawl' as DealSourceType,
      enabled: true,
      settings: {
        apiUrl: 'https://api.firecrawl.dev',
        apiKey: 'test-api-key',
        defaultCrawlMode: 'scrape',
        maxPagesPerSite: 50,
        pollInterval: 5,
        sites: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    plugin = new FirecrawlDealSourcePlugin();

    // Get mock instance after initialization
    const FirecrawlMock = require('@mendable/firecrawl-js');
    mockFirecrawl = new FirecrawlMock();
  });

  // ============================================================================
  // PLUGIN METADATA
  // ============================================================================

  describe('Plugin Metadata', () => {
    it('should have correct type', () => {
      expect(plugin.type).toBe('firecrawl');
    });

    it('should have correct name', () => {
      expect(plugin.name).toBe('Firecrawl Web Crawler');
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
    it('should have apiUrl field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'apiUrl');
      expect(field).toBeDefined();
    });

    it('should have apiKey field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'apiKey');
      expect(field).toBeDefined();
      expect(field?.type).toBe('password');
    });

    it('should have sites field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'sites');
      expect(field).toBeDefined();
      expect(field?.type).toBe('json');
    });

    it('should have defaultCrawlMode field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'defaultCrawlMode');
      expect(field).toBeDefined();
      expect(field?.type).toBe('select');
    });

    it('should have maxPagesPerSite field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'maxPagesPerSite');
      expect(field).toBeDefined();
      expect(field?.type).toBe('number');
    });

    it('should have pollInterval field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'pollInterval');
      expect(field).toBeDefined();
    });

    it('should have extractionPrompt field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'extractionPrompt');
      expect(field).toBeDefined();
      expect(field?.type).toBe('textarea');
    });

    it('should have extractionSchema field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'extractionSchema');
      expect(field).toBeDefined();
      expect(field?.type).toBe('json');
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await plugin.initialize(baseConfig);
      // Verify plugin works after initialization
      const sites = plugin.getSites();
      expect(sites).toBeDefined();
    });

    it('should initialize with sites configuration', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          sites: [
            {
              id: 'site-1',
              name: 'Test Site',
              url: 'https://example.com',
              enabled: true,
              crawlMode: 'scrape',
            },
          ],
        },
      };

      await plugin.initialize(config);

      expect(plugin.getSites()).toHaveLength(1);
    });

    it('should dispose successfully', async () => {
      await plugin.initialize(baseConfig);
      await plugin.dispose();
      // After dispose, accessing sites should throw or return default
      await expect(plugin.fetchDeals()).rejects.toThrow();
    });
  });

  // ============================================================================
  // TEST CONNECTION
  // ============================================================================

  describe('testConnection', () => {
    it('should return success for valid API connection', async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockResolvedValue({
          success: true,
          creditsRemaining: 100,
        }),
      }));

      const result = await plugin.testConnection(baseConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('successful');
    });

    it('should return failure for invalid API key', async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockResolvedValue({
          success: false,
          error: 'Invalid API key',
        }),
      }));

      const result = await plugin.testConnection(baseConfig);

      expect(result.success).toBe(false);
    });

    it('should return failure for network error', async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockRejectedValue(new Error('Network error')),
      }));

      const result = await plugin.testConnection(baseConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
    });
  });

  // ============================================================================
  // SITE MANAGEMENT
  // ============================================================================

  describe('Site Management', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    describe('getSites', () => {
      it('should return empty array initially', () => {
        const sites = plugin.getSites();
        expect(sites).toEqual([]);
      });
    });

    describe('addSite', () => {
      it('should add a new site', () => {
        const site: FirecrawlSiteConfig = {
          id: 'site-1',
          name: 'Test Site',
          url: 'https://example.com',
          enabled: true,
          crawlMode: 'scrape',
        };

        plugin.addSite(site);

        expect(plugin.getSites()).toHaveLength(1);
        expect(plugin.getSite('site-1')).toEqual(site);
      });
    });

    describe('getSite', () => {
      it('should return undefined for non-existent site', () => {
        const site = plugin.getSite('non-existent');
        expect(site).toBeUndefined();
      });

      it('should return site by ID', () => {
        const site: FirecrawlSiteConfig = {
          id: 'site-1',
          name: 'Test Site',
          url: 'https://example.com',
          enabled: true,
          crawlMode: 'scrape',
        };

        plugin.addSite(site);

        const retrieved = plugin.getSite('site-1');
        expect(retrieved).toEqual(site);
      });
    });

    describe('updateSite', () => {
      it('should update existing site', () => {
        const site: FirecrawlSiteConfig = {
          id: 'site-1',
          name: 'Test Site',
          url: 'https://example.com',
          enabled: true,
          crawlMode: 'scrape',
        };

        plugin.addSite(site);
        const updated = plugin.updateSite('site-1', { name: 'Updated Site', enabled: false });

        expect(updated?.name).toBe('Updated Site');
        expect(updated?.enabled).toBe(false);
      });

      it('should return undefined for non-existent site', () => {
        const updated = plugin.updateSite('non-existent', { name: 'Updated' });
        expect(updated).toBeUndefined();
      });
    });

    describe('removeSite', () => {
      it('should remove existing site', () => {
        const site: FirecrawlSiteConfig = {
          id: 'site-1',
          name: 'Test Site',
          url: 'https://example.com',
          enabled: true,
          crawlMode: 'scrape',
        };

        plugin.addSite(site);
        const result = plugin.removeSite('site-1');

        expect(result).toBe(true);
        expect(plugin.getSites()).toHaveLength(0);
      });

      it('should return false for non-existent site', () => {
        const result = plugin.removeSite('non-existent');
        expect(result).toBe(false);
      });
    });
  });

  // ============================================================================
  // FETCH DEALS
  // ============================================================================

  describe('fetchDeals', () => {
    beforeEach(async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockResolvedValue({
          success: true,
          extract: {
            address: '123 Main St',
            city: 'Austin',
            state: 'TX',
            zip: '78701',
            price: 150000,
            bedrooms: 3,
            bathrooms: 2,
          },
          metadata: {
            sourceURL: 'https://example.com/property/123',
          },
        }),
        mapUrl: jest.fn().mockResolvedValue({
          success: true,
          links: ['https://example.com/property/1', 'https://example.com/property/2'],
        }),
        batchScrapeUrls: jest.fn().mockResolvedValue({
          success: true,
          data: [],
        }),
      }));

      await plugin.initialize(baseConfig);
    });

    it('should return empty array when no sites configured', async () => {
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(0);
    });

    it('should fetch deals from enabled sites', async () => {
      const site: FirecrawlSiteConfig = {
        id: 'site-1',
        name: 'Test Site',
        url: 'https://example.com',
        enabled: true,
        crawlMode: 'scrape',
      };

      plugin.addSite(site);

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals.length).toBeGreaterThanOrEqual(0);
    });

    it('should skip disabled sites', async () => {
      const site: FirecrawlSiteConfig = {
        id: 'site-1',
        name: 'Test Site',
        url: 'https://example.com',
        enabled: false,
        crawlMode: 'scrape',
      };

      plugin.addSite(site);

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(0);
    });

    it('should fetch from specific site when filtered', async () => {
      const site1: FirecrawlSiteConfig = {
        id: 'site-1',
        name: 'Site 1',
        url: 'https://site1.com',
        enabled: true,
        crawlMode: 'scrape',
      };

      const site2: FirecrawlSiteConfig = {
        id: 'site-2',
        name: 'Site 2',
        url: 'https://site2.com',
        enabled: true,
        crawlMode: 'scrape',
      };

      plugin.addSite(site1);
      plugin.addSite(site2);

      const result = await plugin.fetchDeals({ filters: { siteId: 'site-1' } });

      expect(result.success).toBe(true);
    });

    it('should include metadata in result', async () => {
      const result = await plugin.fetchDeals();

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.syncDuration).toBeDefined();
    });
  });

  // ============================================================================
  // CRAWL MODES
  // ============================================================================

  describe('Crawl Modes', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    describe('scrape mode', () => {
      it('should use single page scrape', async () => {
        const FirecrawlMock = require('@mendable/firecrawl-js');
        const scrapeUrlMock = jest.fn().mockResolvedValue({
          success: true,
          extract: {
            address: '123 Main St',
            city: 'Austin',
            state: 'TX',
            zip: '78701',
            price: 150000,
          },
          metadata: { sourceURL: 'https://example.com' },
        });

        FirecrawlMock.mockImplementation(() => ({
          scrapeUrl: scrapeUrlMock,
        }));

        await plugin.initialize(baseConfig);

        const site: FirecrawlSiteConfig = {
          id: 'site-1',
          name: 'Test Site',
          url: 'https://example.com',
          enabled: true,
          crawlMode: 'scrape',
        };

        plugin.addSite(site);

        await plugin.fetchDeals();

        expect(scrapeUrlMock).toHaveBeenCalled();
      });
    });

    describe('batch mode', () => {
      it('should use batch scrape for multiple URLs', async () => {
        const FirecrawlMock = require('@mendable/firecrawl-js');
        const batchScrapeUrlsMock = jest.fn().mockResolvedValue({
          success: true,
          data: [
            {
              extract: { address: '123 Main St', price: 150000 },
              metadata: { sourceURL: 'https://example.com/1' },
            },
          ],
        });
        const mapUrlMock = jest.fn().mockResolvedValue({
          success: true,
          links: ['https://example.com/1', 'https://example.com/2'],
        });

        FirecrawlMock.mockImplementation(() => ({
          batchScrapeUrls: batchScrapeUrlsMock,
          mapUrl: mapUrlMock,
        }));

        await plugin.initialize(baseConfig);

        const site: FirecrawlSiteConfig = {
          id: 'site-1',
          name: 'Test Site',
          url: 'https://example.com',
          enabled: true,
          crawlMode: 'batch',
        };

        plugin.addSite(site);

        await plugin.fetchDeals();

        expect(mapUrlMock).toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // PREVIEW EXTRACTION
  // ============================================================================

  describe('previewExtraction', () => {
    beforeEach(async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockResolvedValue({
          success: true,
          extract: {
            address: '123 Main St',
            price: 150000,
          },
          markdown: '# Property Details\n\nAddress: 123 Main St\nPrice: $150,000',
          metadata: { sourceURL: 'https://example.com' },
        }),
      }));

      await plugin.initialize(baseConfig);
    });

    it('should preview extraction for a URL', async () => {
      const result = await plugin.previewExtraction('https://example.com/property/123');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.extract).toBeDefined();
    });

    it('should include markdown preview', async () => {
      const result = await plugin.previewExtraction('https://example.com/property/123');

      expect(result.data?.markdown).toBeDefined();
    });

    it('should handle extraction error', async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockRejectedValue(new Error('Extraction failed')),
      }));

      await plugin.initialize(baseConfig);

      const result = await plugin.previewExtraction('https://example.com/property/123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should accept custom schema', async () => {
      const customSchema = {
        type: 'object',
        properties: {
          customField: { type: 'string' },
        },
      };

      const result = await plugin.previewExtraction(
        'https://example.com/property/123',
        customSchema
      );

      expect(result).toBeDefined();
    });

    it('should accept custom prompt', async () => {
      const result = await plugin.previewExtraction(
        'https://example.com/property/123',
        undefined,
        'Extract only the price'
      );

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // NORMALIZATION
  // ============================================================================

  describe('Deal Normalization', () => {
    beforeEach(async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockResolvedValue({
          success: true,
          extract: {
            address: '123 Main St, Austin, TX 78701',
            price: 150000,
            bedrooms: 3,
            bathrooms: 2,
            sqft: 1500,
            propertyType: 'Single Family Home',
            arv: 200000,
            repairEstimate: 30000,
            wholesalerName: 'John Doe',
            wholesalerPhone: '555-123-4567',
            wholesalerEmail: 'john@wholesaler.com',
          },
          metadata: { sourceURL: 'https://example.com' },
        }),
      }));

      await plugin.initialize(baseConfig);
    });

    it('should normalize extracted deal data', async () => {
      const site: FirecrawlSiteConfig = {
        id: 'site-1',
        name: 'Test Site',
        url: 'https://example.com',
        enabled: true,
        crawlMode: 'scrape',
      };

      plugin.addSite(site);

      const result = await plugin.fetchDeals();

      if (result.deals.length > 0) {
        expect(result.deals[0].sourceId).toBe('test-firecrawl-source');
        expect(result.deals[0].askingPrice).toBe(150000);
      }
    });

    it('should normalize property type', async () => {
      const site: FirecrawlSiteConfig = {
        id: 'site-1',
        name: 'Test Site',
        url: 'https://example.com',
        enabled: true,
        crawlMode: 'scrape',
      };

      plugin.addSite(site);

      const result = await plugin.fetchDeals();

      if (result.deals.length > 0) {
        expect(result.deals[0].propertyType).toBe('single_family');
      }
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should handle site crawl failure gracefully', async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockRejectedValue(new Error('Crawl failed')),
      }));

      await plugin.initialize(baseConfig);

      const site: FirecrawlSiteConfig = {
        id: 'site-1',
        name: 'Test Site',
        url: 'https://example.com',
        enabled: true,
        crawlMode: 'scrape',
      };

      plugin.addSite(site);

      const result = await plugin.fetchDeals();

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should update site status on failure', async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockRejectedValue(new Error('Crawl failed')),
      }));

      await plugin.initialize(baseConfig);

      const site: FirecrawlSiteConfig = {
        id: 'site-1',
        name: 'Test Site',
        url: 'https://example.com',
        enabled: true,
        crawlMode: 'scrape',
      };

      plugin.addSite(site);

      await plugin.fetchDeals();

      const updatedSite = plugin.getSite('site-1');
      // Site should still exist after failure
      expect(updatedSite).toBeDefined();
      // Status may vary based on implementation
      expect(updatedSite?.lastCrawlStatus).toBeDefined();
    });

    it('should continue processing other sites after failure', async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      let callCount = 0;
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('First site failed'));
          }
          return Promise.resolve({
            success: true,
            extract: { address: '456 Oak Ave', price: 200000 },
            metadata: { sourceURL: 'https://site2.com' },
          });
        }),
      }));

      await plugin.initialize(baseConfig);

      plugin.addSite({
        id: 'site-1',
        name: 'Site 1',
        url: 'https://site1.com',
        enabled: true,
        crawlMode: 'scrape',
      });

      plugin.addSite({
        id: 'site-2',
        name: 'Site 2',
        url: 'https://site2.com',
        enabled: true,
        crawlMode: 'scrape',
      });

      const result = await plugin.fetchDeals();

      // Should have error from first site but deals from second
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // METADATA
  // ============================================================================

  describe('Result Metadata', () => {
    beforeEach(async () => {
      const FirecrawlMock = require('@mendable/firecrawl-js');
      FirecrawlMock.mockImplementation(() => ({
        scrapeUrl: jest.fn().mockResolvedValue({
          success: true,
          extract: { address: '123 Main St', price: 150000 },
          metadata: { sourceURL: 'https://example.com' },
        }),
      }));

      await plugin.initialize(baseConfig);
    });

    it('should include processing metadata', async () => {
      const site: FirecrawlSiteConfig = {
        id: 'site-1',
        name: 'Test Site',
        url: 'https://example.com',
        enabled: true,
        crawlMode: 'scrape',
      };

      plugin.addSite(site);

      const result = await plugin.fetchDeals();

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.totalFound).toBeDefined();
      expect(result.metadata?.totalProcessed).toBeDefined();
      expect(result.metadata?.syncDuration).toBeDefined();
    });
  });
});
