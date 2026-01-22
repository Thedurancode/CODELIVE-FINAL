/**
 * MarketDataService Unit Tests
 */

import { MarketDataService } from '../../services/MarketDataService';

// Mock fetch globally
global.fetch = jest.fn();

describe('MarketDataService', () => {
  let service: MarketDataService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Get fresh instance for each test
    (MarketDataService as any).instance = null;
    service = MarketDataService.getInstance();
    service.clearCache();
  });

  // ============================================================================
  // SINGLETON PATTERN
  // ============================================================================

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = MarketDataService.getInstance();
      const instance2 = MarketDataService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  // ============================================================================
  // FALLBACK DATA (No API Key)
  // ============================================================================

  describe('Fallback Data', () => {
    beforeEach(() => {
      // Ensure no API key
      delete process.env.RAPIDAPI_KEY;
      delete process.env.RAPIDAPI_ZILLOW_KEY;
      // Reset singleton to pick up env change
      (MarketDataService as any).instance = null;
      service = MarketDataService.getInstance();
    });

    it('should return fallback data when no API key is configured', async () => {
      const result = await service.getMarketData({
        address: '123 Main St, Austin, TX 78701',
        state: 'TX',
      });

      expect(result).toBeDefined();
      expect(result.dataSource).toBe('fallback');
      expect(result.confidence).toBe(20);
      expect(result.stateMedianPrice).toBeDefined();
    });

    it('should use state median for fallback', async () => {
      const result = await service.getMarketData({
        address: '123 Main St, Miami, FL 33101',
        state: 'FL',
      });

      expect(result.stateMedianPrice).toBe(400000); // FL median
    });

    it('should extract state from address if not provided', async () => {
      const result = await service.getMarketData({
        address: '456 Oak Ave, Dallas, TX 75201',
      });

      expect(result.state).toBe('TX');
    });
  });

  // ============================================================================
  // CACHING
  // ============================================================================

  describe('Caching', () => {
    beforeEach(() => {
      process.env.RAPIDAPI_KEY = 'test-api-key';
      (MarketDataService as any).instance = null;
      service = MarketDataService.getInstance();
    });

    it('should cache results', async () => {
      const mockResponse = {
        property: {
          zpid: '12345',
          zestimate: 300000,
          rentZestimate: 2000,
          address: { city: 'Austin', state: 'TX', zipcode: '78701' },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // First call - should fetch
      const result1 = await service.getMarketData({
        address: '123 Main St, Austin, TX 78701',
      });

      // Second call - should use cache
      const result2 = await service.getMarketData({
        address: '123 Main St, Austin, TX 78701',
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result1.zestimate).toBe(result2.zestimate);
    });

    it('should return cache stats', () => {
      const stats = service.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('keys');
    });

    it('should clear cache', async () => {
      // Add something to cache
      await service.getMarketData({ address: 'test', state: 'TX' });

      service.clearCache();
      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  // ============================================================================
  // API INTEGRATION
  // ============================================================================

  describe('API Integration', () => {
    beforeEach(() => {
      process.env.RAPIDAPI_KEY = 'test-api-key';
      (MarketDataService as any).instance = null;
      service = MarketDataService.getInstance();
    });

    it('should fetch property data from API', async () => {
      const mockResponse = {
        property: {
          zpid: '12345',
          zestimate: 350000,
          rentZestimate: 2200,
          address: {
            city: 'Jacksonville',
            state: 'FL',
            zipcode: '32205',
          },
          resoFacts: {
            bedrooms: 3,
            bathrooms: 2,
            livingArea: 1500,
            yearBuilt: 1985,
          },
          priceHistory: [
            { date: '2024-01-01', price: 320000, event: 'Sold' },
            { date: '2023-01-01', price: 280000, event: 'Sold' },
          ],
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.getMarketData({
        address: '1875 AVONDALE Circle, Jacksonville, FL 32205',
      });

      expect(result.zestimate).toBe(350000);
      expect(result.rentZestimate).toBe(2200);
      expect(result.bedrooms).toBe(3);
      expect(result.bathrooms).toBe(2);
      expect(result.dataSource).toBe('rapidapi-zillow');
      expect(result.confidence).toBeGreaterThan(50);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const result = await service.getMarketData({
        address: '123 Main St, Austin, TX 78701',
        state: 'TX',
      });

      // Should return fallback data
      expect(result.dataSource).toBe('fallback');
    });

    it('should handle non-200 responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const result = await service.getMarketData({
        address: '123 Main St, Austin, TX 78701',
        state: 'TX',
      });

      expect(result.dataSource).toBe('fallback');
    });
  });

  // ============================================================================
  // ZIP MARKET STATS
  // ============================================================================

  describe('ZIP Market Stats', () => {
    beforeEach(() => {
      delete process.env.RAPIDAPI_KEY;
      (MarketDataService as any).instance = null;
      service = MarketDataService.getInstance();
    });

    it('should return market stats for a ZIP code', async () => {
      const stats = await service.getZipMarketStats('78701');

      expect(stats).toHaveProperty('medianPrice');
      expect(stats).toHaveProperty('pricePerSqft');
      expect(stats).toHaveProperty('rentEstimate');
      expect(stats).toHaveProperty('daysOnMarket');
    });

    it('should apply premium multiplier for NYC ZIP', async () => {
      const stats = await service.getZipMarketStats('10001');

      // NYC should have higher prices
      expect(stats.medianPrice).toBeGreaterThan(400000);
    });
  });

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  describe('Batch Operations', () => {
    beforeEach(() => {
      delete process.env.RAPIDAPI_KEY;
      (MarketDataService as any).instance = null;
      service = MarketDataService.getInstance();
    });

    it('should batch fetch market data', async () => {
      const requests = [
        { address: '123 Main St', state: 'TX' },
        { address: '456 Oak Ave', state: 'FL' },
        { address: '789 Pine Rd', state: 'CA' },
      ];

      const results = await service.batchGetMarketData(requests);

      expect(results.size).toBe(3);
      expect(results.get('123 Main St')).toBeDefined();
      expect(results.get('456 Oak Ave')).toBeDefined();
      expect(results.get('789 Pine Rd')).toBeDefined();
    });
  });

  // ============================================================================
  // DATA NORMALIZATION
  // ============================================================================

  describe('Data Normalization', () => {
    beforeEach(() => {
      process.env.RAPIDAPI_KEY = 'test-api-key';
      (MarketDataService as any).instance = null;
      service = MarketDataService.getInstance();
    });

    it('should calculate price per sqft', async () => {
      const mockResponse = {
        property: {
          zestimate: 300000,
          resoFacts: { livingArea: 1500 },
          address: { city: 'Austin', state: 'TX', zipcode: '78701' },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.getMarketData({
        address: '123 Main St, Austin, TX 78701',
      });

      expect(result.pricePerSqft).toBe(200); // 300000 / 1500
    });

    it('should calculate confidence score based on available data', async () => {
      const mockResponse = {
        property: {
          zestimate: 300000,
          rentZestimate: 2000,
          priceHistory: [{ date: '2024-01-01', price: 280000 }],
          comps: [{ address: '124 Main St', price: 295000 }],
          taxAssessedValue: 275000,
          address: { city: 'Austin', state: 'TX', zipcode: '78701' },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.getMarketData({
        address: '123 Main St, Austin, TX 78701',
      });

      // Should have high confidence with all data present
      expect(result.confidence).toBeGreaterThanOrEqual(90);
    });
  });

  // ============================================================================
  // API REQUEST COUNT
  // ============================================================================

  describe('API Request Count', () => {
    it('should return null when no API key', async () => {
      delete process.env.RAPIDAPI_KEY;
      (MarketDataService as any).instance = null;
      service = MarketDataService.getInstance();

      const count = await service.getApiRequestCount();
      expect(count).toBeNull();
    });

    it('should return request count from API', async () => {
      process.env.RAPIDAPI_KEY = 'test-api-key';
      (MarketDataService as any).instance = null;
      service = MarketDataService.getInstance();

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ used: 100, remaining: 900, limit: 1000 }),
      });

      const count = await service.getApiRequestCount();

      expect(count).toEqual({
        used: 100,
        remaining: 900,
        limit: 1000,
      });
    });
  });
});
