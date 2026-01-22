/**
 * APIDealSourcePlugin Unit Tests
 */

import { APIDealSourcePlugin } from '../../plugins/sources/APIDealSourcePlugin';
import { DealSourceConfig, DealSourceType } from '../../plugins/types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('APIDealSourcePlugin', () => {
  let plugin: APIDealSourcePlugin;
  let baseConfig: DealSourceConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();

    baseConfig = {
      id: 'test-api-source',
      name: 'Test API Source',
      type: 'api' as DealSourceType,
      enabled: true,
      settings: {
        baseUrl: 'https://api.example.com',
        endpoint: '/deals',
        authMethod: 'none',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    plugin = new APIDealSourcePlugin();
  });

  // ============================================================================
  // PLUGIN METADATA
  // ============================================================================

  describe('Plugin Metadata', () => {
    it('should have correct type', () => {
      expect(plugin.type).toBe('api');
    });

    it('should have correct name', () => {
      expect(plugin.name).toBe('REST API Integration');
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
      expect(Array.isArray(plugin.configSchema.fields)).toBe(true);
    });
  });

  // ============================================================================
  // CONFIG SCHEMA
  // ============================================================================

  describe('Config Schema', () => {
    it('should have required baseUrl field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'baseUrl');
      expect(field).toBeDefined();
      expect(field?.required).toBe(true);
    });

    it('should have endpoint field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'endpoint');
      expect(field).toBeDefined();
    });

    it('should have authMethod field with options', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'authMethod');
      expect(field).toBeDefined();
      expect(field?.type).toBe('select');
      expect(field?.options).toBeDefined();
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await plugin.initialize(baseConfig);
      // Verify plugin works after initialization
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deals: [] }),
      });
      const result = await plugin.fetchDeals();
      expect(result.success).toBe(true);
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
    it('should return success for valid connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deals: [] }),
      });

      const result = await plugin.testConnection(baseConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('successful');
    });

    it('should return failure for invalid URL', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await plugin.testConnection(baseConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
    });

    it('should return failure for HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await plugin.testConnection(baseConfig);

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // AUTHENTICATION METHODS
  // ============================================================================

  describe('Authentication Methods', () => {
    describe('No Auth', () => {
      it('should make request without auth headers', async () => {
        await plugin.initialize(baseConfig);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ deals: [] }),
        });

        await plugin.fetchDeals();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.not.objectContaining({
              Authorization: expect.any(String),
            }),
          })
        );
      });
    });

    describe('API Key Auth', () => {
      it('should include API key in header', async () => {
        const config = {
          ...baseConfig,
          settings: {
            ...baseConfig.settings,
            authMethod: 'api_key',
            apiKey: 'test-api-key',
            apiKeyHeader: 'X-API-Key',
          },
        };

        await plugin.initialize(config);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ deals: [] }),
        });

        await plugin.fetchDeals();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-API-Key': 'test-api-key',
            }),
          })
        );
      });

      it('should use default header name if not specified', async () => {
        const config = {
          ...baseConfig,
          settings: {
            ...baseConfig.settings,
            authMethod: 'api_key',
            apiKey: 'test-api-key',
          },
        };

        await plugin.initialize(config);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ deals: [] }),
        });

        await plugin.fetchDeals();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-API-Key': 'test-api-key',
            }),
          })
        );
      });
    });

    describe('API Key Query Auth', () => {
      it('should include API key in query string', async () => {
        const config = {
          ...baseConfig,
          settings: {
            ...baseConfig.settings,
            authMethod: 'api_key_query',
            apiKey: 'test-api-key',
            apiKeyParam: 'api_key',
          },
        };

        await plugin.initialize(config);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ deals: [] }),
        });

        await plugin.fetchDeals();

        const calledUrl = mockFetch.mock.calls[0][0];
        expect(calledUrl).toContain('api_key=test-api-key');
      });
    });

    describe('Bearer Token Auth', () => {
      it('should include Bearer token in header', async () => {
        const config = {
          ...baseConfig,
          settings: {
            ...baseConfig.settings,
            authMethod: 'bearer',
            apiKey: 'test-bearer-token',
          },
        };

        await plugin.initialize(config);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        });

        await plugin.fetchDeals();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-bearer-token',
            }),
          })
        );
      });
    });

    describe('Basic Auth', () => {
      it('should include Basic auth header', async () => {
        const config = {
          ...baseConfig,
          settings: {
            ...baseConfig.settings,
            authMethod: 'basic',
            username: 'testuser',
            password: 'testpass',
          },
        };

        await plugin.initialize(config);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ deals: [] }),
        });

        await plugin.fetchDeals();

        const expectedAuth = Buffer.from('testuser:testpass').toString('base64');
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: `Basic ${expectedAuth}`,
            }),
          })
        );
      });
    });

    describe('OAuth2 Auth', () => {
      it('should fetch OAuth token before making request', async () => {
        const config = {
          ...baseConfig,
          settings: {
            ...baseConfig.settings,
            authMethod: 'oauth2',
            oauth2Config: {
              tokenUrl: 'https://auth.example.com/token',
              clientId: 'client-id',
              clientSecret: 'client-secret',
            },
          },
        };

        await plugin.initialize(config);

        // Mock token request
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'oauth-access-token',
            expires_in: 3600,
          }),
        });

        // Mock deals request
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        });

        await plugin.fetchDeals();

        // First call should be to token URL
        expect(mockFetch).toHaveBeenNthCalledWith(
          1,
          'https://auth.example.com/token',
          expect.objectContaining({
            method: 'POST',
          })
        );

        // Second call should include Bearer token
        expect(mockFetch).toHaveBeenNthCalledWith(
          2,
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer oauth-access-token',
            }),
          })
        );
      });
    });
  });

  // ============================================================================
  // FETCH DEALS
  // ============================================================================

  describe('fetchDeals', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should fetch and normalize deals', async () => {
      const mockDeals = [
        {
          id: 'deal-1',
          address: '123 Main St, Austin, TX 78701',
          price: 150000,
          bedrooms: 3,
          bathrooms: 2,
          sqft: 1500,
        },
        {
          id: 'deal-2',
          address: '456 Oak Ave, Dallas, TX 75201',
          price: 200000,
          bedrooms: 4,
          bathrooms: 3,
          sqft: 2000,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockDeals }),
      });

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(2);
    });

    it('should return empty array when no deals found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should include metadata in result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });

      const result = await plugin.fetchDeals();

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.syncDuration).toBeDefined();
    });
  });

  // ============================================================================
  // PAGINATION
  // ============================================================================

  describe('Pagination', () => {
    describe('Offset Pagination', () => {
      it('should handle offset pagination', async () => {
        const config = {
          ...baseConfig,
          settings: {
            ...baseConfig.settings,
            paginationType: 'offset',
            paginationConfig: {
              offsetParam: 'offset',
              limitParam: 'limit',
            },
          },
        };

        await plugin.initialize(config);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: Array(10).fill({ id: 'deal', address: '123 Main St' }),
            total: 25,
          }),
        });

        const result = await plugin.fetchDeals({ limit: 10 });

        // Single page fetch returns what's on that page
        expect(result.deals.length).toBe(10);
      });
    });

    describe('Cursor Pagination', () => {
      it('should handle cursor pagination', async () => {
        const config = {
          ...baseConfig,
          settings: {
            ...baseConfig.settings,
            paginationType: 'cursor',
            paginationConfig: {
              cursorParam: 'cursor',
              cursorPath: 'nextCursor',
            },
          },
        };

        await plugin.initialize(config);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: Array(10).fill({ id: 'deal', address: '123 Main St' }),
            nextCursor: 'cursor-1',
          }),
        });

        const result = await plugin.fetchDeals({ limit: 10 });

        // Single page fetch returns what's on that page
        expect(result.deals.length).toBe(10);
      });
    });
  });

  // ============================================================================
  // DATA PATH EXTRACTION
  // ============================================================================

  describe('Data Path Extraction', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should extract deals from nested path', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          dataPath: 'response.data.items',
        },
      };

      await plugin.initialize(config);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            data: {
              items: [
                { id: 'deal-1', address: '123 Main St' },
                { id: 'deal-2', address: '456 Oak Ave' },
              ],
            },
          },
        }),
      });

      const result = await plugin.fetchDeals();

      expect(result.deals).toHaveLength(2);
    });
  });

  // ============================================================================
  // CUSTOM HEADERS
  // ============================================================================

  describe('Custom Headers', () => {
    it('should include custom headers in request', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          customHeaders: {
            'X-Custom-Header': 'custom-value',
            'X-Another-Header': 'another-value',
          },
        },
      };

      await plugin.initialize(config);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });

      await plugin.fetchDeals();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
            'X-Another-Header': 'another-value',
          }),
        })
      );
    });
  });

  // ============================================================================
  // URL BUILDING
  // ============================================================================

  describe('URL Building', () => {
    it('should build correct URL from base and endpoint', async () => {
      await plugin.initialize(baseConfig);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deals: [] }),
      });

      await plugin.fetchDeals();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/deals',
        expect.any(Object)
      );
    });

    it('should handle trailing slash in base URL', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          baseUrl: 'https://api.example.com/',
        },
      };

      await plugin.initialize(config);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deals: [] }),
      });

      await plugin.fetchDeals();

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).not.toContain('//deals');
    });
  });

  // ============================================================================
  // NORMALIZATION
  // ============================================================================

  describe('Deal Normalization', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should normalize deal with all fields', async () => {
      const mockDeal = {
        id: 'deal-1',
        address: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        price: 150000,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1500,
        yearBuilt: 1990,
        propertyType: 'single_family',
        arv: 200000,
        repairEstimate: 30000,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [mockDeal] }),
      });

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals.length).toBeGreaterThan(0);
      expect(result.deals[0]).toMatchObject({
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
      });
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should handle 401 Unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.error.includes('401') || e.error.includes('Unauthorized'))).toBe(true);
    });

    it('should handle 404 Not Found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(false);
    });

    it('should handle 500 Server Error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(false);
    });

    it('should handle network timeout', async () => {
      mockFetch.mockRejectedValueOnce(new Error('timeout'));

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(false);
    });

    it('should handle invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  describe('Rate Limiting', () => {
    it('should respect rate limit settings', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          rateLimitPerMinute: 10,
        },
      };

      await plugin.initialize(config);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deals: [] }),
      });

      // Multiple fetches should work within rate limit
      await plugin.fetchDeals();
      await plugin.fetchDeals();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
