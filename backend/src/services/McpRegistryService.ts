/**
 * MCP Registry Service
 *
 * Fetches MCP server listings from the official registry.
 * https://registry.modelcontextprotocol.io
 */

const REGISTRY_BASE_URL = 'https://registry.modelcontextprotocol.io/v0.1';

export interface McpRegistryServer {
  name: string;
  description: string;
  version: string;
  repository?: {
    url: string;
    source?: string;
    id?: string;
  };
  website?: string;
  license?: string;
  packages?: McpPackage[];
  remotes?: McpRemote[];
  tools?: string[];
  prompts?: string[];
  resources?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface McpPackage {
  registry: 'npm' | 'pypi' | 'cargo' | 'docker';
  name: string;
  version?: string;
  runtime?: string;
  runtimeArgs?: string[];
  packageArgs?: string[];
  environmentVariables?: string[];
}

export interface McpRemote {
  transportType: 'sse' | 'http';
  url: string;
}

export interface McpRegistryResponse {
  servers: McpRegistryServer[];
  metadata: {
    nextCursor?: string;
    count: number;
  };
}

export interface McpRegistrySearchOptions {
  search?: string;
  limit?: number;
  cursor?: string;
  category?: string;
}

class McpRegistryService {
  private cache: Map<string, { data: McpRegistryResponse; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Search/list servers from the MCP registry
   */
  async searchServers(options: McpRegistrySearchOptions = {}): Promise<McpRegistryResponse> {
    const { search, limit = 50, cursor, category } = options;

    // Build cache key
    const cacheKey = JSON.stringify({ search, limit, cursor, category });
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    // Build query params
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('version', 'latest');
    if (search) params.set('search', search);
    if (cursor) params.set('cursor', cursor);

    const url = `${REGISTRY_BASE_URL}/servers?${params.toString()}`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Dispotree-MCP-Browser/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Registry API error: ${response.status}`);
      }

      const data = (await response.json()) as McpRegistryResponse;

      // Cache the result
      this.cache.set(cacheKey, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      console.error('[McpRegistry] Failed to fetch servers:', error);
      throw error;
    }
  }

  /**
   * Get details for a specific server
   */
  async getServerDetails(
    serverName: string,
    version = 'latest'
  ): Promise<McpRegistryServer | null> {
    const cacheKey = `server:${serverName}:${version}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data.servers[0] || null;
    }

    const url = `${REGISTRY_BASE_URL}/servers/${encodeURIComponent(serverName)}/versions/${version}`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Dispotree-MCP-Browser/1.0',
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Registry API error: ${response.status}`);
      }

      const server = (await response.json()) as McpRegistryServer;

      // Cache as single-server response
      this.cache.set(cacheKey, {
        data: { servers: [server], metadata: { count: 1 } },
        timestamp: Date.now(),
      });

      return server;
    } catch (error) {
      console.error('[McpRegistry] Failed to fetch server details:', error);
      return null;
    }
  }

  /**
   * Get popular/featured servers
   */
  async getPopularServers(): Promise<McpRegistryServer[]> {
    // Fetch a larger batch and return top ones
    const result = await this.searchServers({ limit: 100 });
    return result.servers.slice(0, 20);
  }

  /**
   * Get servers by category/tag
   */
  async getServersByCategory(category: string): Promise<McpRegistryServer[]> {
    const result = await this.searchServers({ search: category, limit: 50 });
    return result.servers;
  }

  /**
   * Generate the install command for a server package
   */
  getInstallCommand(server: McpRegistryServer): string | null {
    if (!server.packages || server.packages.length === 0) {
      return null;
    }

    const pkg = server.packages[0];

    switch (pkg.registry) {
      case 'npm':
        return `npm install -g ${pkg.name}`;
      case 'pypi':
        return `pip install ${pkg.name}`;
      case 'cargo':
        return `cargo install ${pkg.name}`;
      case 'docker':
        return `docker pull ${pkg.name}`;
      default:
        return null;
    }
  }

  /**
   * Generate the run command for a server package
   */
  getRunCommand(server: McpRegistryServer): string | null {
    if (!server.packages || server.packages.length === 0) {
      return null;
    }

    const pkg = server.packages[0];

    if (pkg.runtime && pkg.runtimeArgs) {
      const args = pkg.runtimeArgs.join(' ');
      const pkgArgs = pkg.packageArgs?.join(' ') || '';
      return `${pkg.runtime} ${args} ${pkgArgs}`.trim();
    }

    switch (pkg.registry) {
      case 'npm':
        return `npx ${pkg.name}`;
      case 'pypi':
        return `python -m ${pkg.name.replace(/-/g, '_')}`;
      default:
        return null;
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const mcpRegistryService = new McpRegistryService();
export default mcpRegistryService;
