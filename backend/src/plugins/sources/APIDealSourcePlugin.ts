/**
 * API Deal Source Plugin
 *
 * Fetch deals from external REST APIs - supports:
 * - RESTful API endpoints
 * - Multiple authentication methods (API Key, Bearer Token, Basic Auth, OAuth2)
 * - Pagination handling
 * - Rate limiting
 * - Custom headers and query parameters
 */

import { BaseDealSourcePlugin } from './BaseDealSourcePlugin';
import {
  DealSourceType,
  DealSourceConfig,
  DealSourceResult,
  RawDeal,
  NormalizedDeal,
  ConnectionTestResult,
  FetchOptions,
  PluginConfigSchema,
  DealSourceError,
} from '../types';

interface APIResponse {
  data: any[];
  pagination?: {
    nextCursor?: string;
    hasMore?: boolean;
    total?: number;
  };
}

export class APIDealSourcePlugin extends BaseDealSourcePlugin {
  readonly type: DealSourceType = 'api';
  readonly name = 'REST API Integration';
  readonly version = '1.0.0';
  readonly description = 'Fetch deals from external REST APIs with support for various authentication methods.';

  readonly configSchema: PluginConfigSchema = {
    fields: [
      {
        name: 'baseUrl',
        label: 'Base URL',
        type: 'string',
        required: true,
        description: 'Base URL of the API (e.g., https://api.wholesaler.com/v1)',
        validation: { pattern: '^https?://' },
      },
      {
        name: 'endpoint',
        label: 'Deals Endpoint',
        type: 'string',
        required: true,
        default: '/deals',
        description: 'API endpoint path for fetching deals',
      },
      {
        name: 'authMethod',
        label: 'Authentication Method',
        type: 'select',
        required: true,
        default: 'api_key',
        options: [
          { value: 'none', label: 'No Authentication' },
          { value: 'api_key', label: 'API Key (Header)' },
          { value: 'api_key_query', label: 'API Key (Query Parameter)' },
          { value: 'bearer', label: 'Bearer Token' },
          { value: 'basic', label: 'Basic Auth' },
          { value: 'oauth2', label: 'OAuth 2.0' },
        ],
      },
      {
        name: 'apiKeyHeader',
        label: 'API Key Header Name',
        type: 'string',
        required: false,
        default: 'X-API-Key',
        description: 'Header name for API key authentication',
      },
      {
        name: 'apiKey',
        label: 'API Key / Token',
        type: 'password',
        required: false,
        description: 'API key or bearer token for authentication',
      },
      {
        name: 'username',
        label: 'Username',
        type: 'string',
        required: false,
        description: 'Username for Basic Auth',
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        required: false,
        description: 'Password for Basic Auth',
      },
      {
        name: 'oauth2Config',
        label: 'OAuth2 Configuration',
        type: 'json',
        required: false,
        description: 'OAuth2 config: { clientId, clientSecret, tokenUrl, scope }',
      },
      {
        name: 'httpMethod',
        label: 'HTTP Method',
        type: 'select',
        required: false,
        default: 'GET',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
        ],
      },
      {
        name: 'customHeaders',
        label: 'Custom Headers',
        type: 'json',
        required: false,
        description: 'Additional HTTP headers (JSON object)',
      },
      {
        name: 'queryParams',
        label: 'Query Parameters',
        type: 'json',
        required: false,
        description: 'Default query parameters (JSON object)',
      },
      {
        name: 'requestBody',
        label: 'Request Body',
        type: 'json',
        required: false,
        description: 'Request body for POST requests (JSON object)',
      },
      {
        name: 'dataPath',
        label: 'Data Path',
        type: 'string',
        required: false,
        default: 'data',
        description: 'JSON path to the deals array in the response (e.g., "data", "results.deals")',
      },
      {
        name: 'paginationType',
        label: 'Pagination Type',
        type: 'select',
        required: false,
        default: 'cursor',
        options: [
          { value: 'none', label: 'No Pagination' },
          { value: 'cursor', label: 'Cursor-based' },
          { value: 'offset', label: 'Offset-based' },
          { value: 'page', label: 'Page-based' },
          { value: 'link', label: 'Link Header' },
        ],
      },
      {
        name: 'paginationConfig',
        label: 'Pagination Configuration',
        type: 'json',
        required: false,
        description: 'Pagination config: { cursorParam, cursorPath, limitParam, offsetParam, pageParam }',
      },
      {
        name: 'rateLimit',
        label: 'Rate Limit (requests/minute)',
        type: 'number',
        required: false,
        default: 60,
        validation: { min: 1, max: 1000 },
      },
      {
        name: 'fieldMapping',
        label: 'Field Mapping',
        type: 'json',
        required: false,
        description: 'Map API fields to deal fields (JSON object)',
      },
      {
        name: 'wholesalerName',
        label: 'Wholesaler Name',
        type: 'string',
        required: false,
        description: 'Name of the wholesaler for this data source',
      },
    ],
  };

  private oauthToken: string | null = null;
  private tokenExpiry: Date | null = null;

  async testConnection(config: DealSourceConfig): Promise<ConnectionTestResult> {
    try {
      const headers = await this.buildHeaders(config);
      const url = this.buildUrl(config, {});

      const response = await fetch(url, {
        method: config.settings.httpMethod || 'GET',
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          message: 'API connection successful',
          details: {
            statusCode: response.status,
            responseKeys: Object.keys(data as Record<string, unknown>),
          },
        };
      } else {
        return {
          success: false,
          message: `API returned status ${response.status}: ${response.statusText}`,
          details: {
            statusCode: response.status,
            body: await response.text(),
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async fetchDeals(options?: FetchOptions): Promise<DealSourceResult> {
    this.ensureInitialized();
    const startTime = Date.now();
    const deals: NormalizedDeal[] = [];
    const errors: DealSourceError[] = [];

    try {
      const headers = await this.buildHeaders(this.config!);
      const url = this.buildUrl(this.config!, options || {});

      const fetchOptions: RequestInit = {
        method: this.config!.settings.httpMethod || 'GET',
        headers,
      };

      // Add request body for POST
      if (fetchOptions.method === 'POST' && this.config!.settings.requestBody) {
        fetchOptions.body = JSON.stringify(this.config!.settings.requestBody);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        return {
          success: false,
          deals: [],
          errors: [{ error: `API returned status ${response.status}: ${response.statusText}` }],
          metadata: {
            totalFound: 0,
            totalProcessed: 0,
            totalErrors: 1,
            syncDuration: Date.now() - startTime,
          },
        };
      }

      const responseData = await response.json();
      const dealsArray = this.extractDealsFromResponse(responseData);
      const pagination = this.extractPagination(responseData);

      // Process each deal
      for (const dealData of dealsArray) {
        try {
          const rawDeal: RawDeal = {
            sourceId: this.config!.id,
            sourceName: this.config!.name,
            externalId: dealData.id || dealData.deal_id || dealData.property_id,
            rawData: dealData,
            receivedAt: new Date(),
          };

          const normalized = await this.normalizeDeal(rawDeal);
          deals.push(normalized);
        } catch (error) {
          errors.push({
            externalId: dealData.id,
            error: error instanceof Error ? error.message : String(error),
            rawData: dealData,
          });
        }
      }

      return {
        success: true,
        deals,
        errors,
        metadata: {
          totalFound: pagination.total || dealsArray.length,
          totalProcessed: deals.length,
          totalErrors: errors.length,
          syncDuration: Date.now() - startTime,
          nextCursor: pagination.nextCursor,
        },
      };
    } catch (error) {
      return {
        success: false,
        deals: [],
        errors: [{ error: error instanceof Error ? error.message : String(error) }],
        metadata: {
          totalFound: 0,
          totalProcessed: 0,
          totalErrors: 1,
          syncDuration: Date.now() - startTime,
        },
      };
    }
  }

  private async buildHeaders(config: DealSourceConfig): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...config.settings.customHeaders,
    };

    const authMethod = config.settings.authMethod;

    switch (authMethod) {
      case 'api_key':
        const headerName = config.settings.apiKeyHeader || 'X-API-Key';
        headers[headerName] = config.settings.apiKey;
        break;

      case 'bearer':
        headers['Authorization'] = `Bearer ${config.settings.apiKey}`;
        break;

      case 'basic':
        const credentials = Buffer.from(`${config.settings.username}:${config.settings.password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
        break;

      case 'oauth2':
        const token = await this.getOAuthToken(config);
        headers['Authorization'] = `Bearer ${token}`;
        break;
    }

    return headers;
  }

  private async getOAuthToken(config: DealSourceConfig): Promise<string> {
    // Check if we have a valid cached token
    if (this.oauthToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.oauthToken;
    }

    const oauth2Config = config.settings.oauth2Config;
    if (!oauth2Config) {
      throw new Error('OAuth2 configuration is required');
    }

    const tokenResponse = await fetch(oauth2Config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: oauth2Config.clientId,
        client_secret: oauth2Config.clientSecret,
        scope: oauth2Config.scope || '',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`OAuth2 token request failed: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string; expires_in?: number };
    this.oauthToken = tokenData.access_token;
    this.tokenExpiry = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

    return this.oauthToken!;
  }

  private buildUrl(config: DealSourceConfig, options: FetchOptions): string {
    const baseUrl = config.settings.baseUrl.replace(/\/$/, '');
    const endpoint = config.settings.endpoint.replace(/^\//, '');
    let url = `${baseUrl}/${endpoint}`;

    const params = new URLSearchParams();

    // Add default query params
    if (config.settings.queryParams) {
      for (const [key, value] of Object.entries(config.settings.queryParams)) {
        params.set(key, String(value));
      }
    }

    // Add API key as query param if configured
    if (config.settings.authMethod === 'api_key_query') {
      const keyParam = config.settings.apiKeyHeader || 'api_key';
      params.set(keyParam, config.settings.apiKey);
    }

    // Add pagination params
    const paginationConfig = config.settings.paginationConfig || {};
    const paginationType = config.settings.paginationType;

    if (options.limit) {
      const limitParam = paginationConfig.limitParam || 'limit';
      params.set(limitParam, String(options.limit));
    }

    if (options.cursor) {
      switch (paginationType) {
        case 'cursor':
          const cursorParam = paginationConfig.cursorParam || 'cursor';
          params.set(cursorParam, options.cursor);
          break;
        case 'offset':
          const offsetParam = paginationConfig.offsetParam || 'offset';
          params.set(offsetParam, options.cursor);
          break;
        case 'page':
          const pageParam = paginationConfig.pageParam || 'page';
          params.set(pageParam, options.cursor);
          break;
      }
    }

    // Add filter params
    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        params.set(key, String(value));
      }
    }

    // Add since param for incremental sync
    if (options.since) {
      const sinceParam = paginationConfig.sinceParam || 'updated_since';
      params.set(sinceParam, options.since.toISOString());
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    return url;
  }

  private extractDealsFromResponse(response: any): any[] {
    const dataPath = this.config!.settings.dataPath || 'data';
    const pathParts = dataPath.split('.');

    let data = response;
    for (const part of pathParts) {
      if (data && data[part] !== undefined) {
        data = data[part];
      } else {
        data = null;
        break;
      }
    }

    if (Array.isArray(data)) {
      return data;
    }

    // If response is directly an array
    if (Array.isArray(response)) {
      return response;
    }

    console.warn(`Could not find deals array at path '${dataPath}', returning empty array`);
    return [];
  }

  private extractPagination(response: any): { nextCursor?: string; total?: number } {
    const paginationConfig = this.config!.settings.paginationConfig || {};
    const cursorPath = paginationConfig.cursorPath || 'pagination.next_cursor';

    let nextCursor: string | undefined;
    const pathParts = cursorPath.split('.');
    let data = response;
    for (const part of pathParts) {
      if (data && data[part] !== undefined) {
        data = data[part];
      } else {
        data = null;
        break;
      }
    }
    if (data) {
      nextCursor = String(data);
    }

    // Try to get total count
    let total: number | undefined;
    const totalPath = paginationConfig.totalPath || 'pagination.total';
    const totalParts = totalPath.split('.');
    data = response;
    for (const part of totalParts) {
      if (data && data[part] !== undefined) {
        data = data[part];
      } else {
        data = null;
        break;
      }
    }
    if (typeof data === 'number') {
      total = data;
    }

    return { nextCursor, total };
  }

  protected async customNormalization(normalized: NormalizedDeal, rawDeal: RawDeal): Promise<NormalizedDeal> {
    const fieldMapping = this.config?.settings.fieldMapping || {};

    // Apply custom field mapping
    for (const [apiField, dealField] of Object.entries(fieldMapping)) {
      const value = this.getNestedValue(rawDeal.rawData, apiField);
      if (value !== undefined) {
        this.setNestedValue(normalized, dealField as string, value);
      }
    }

    // Set wholesaler name if configured
    if (this.config?.settings.wholesalerName && !normalized.wholesalerName) {
      normalized.wholesalerName = this.config.settings.wholesalerName;
    }

    return normalized;
  }

  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value && value[part] !== undefined) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
}
