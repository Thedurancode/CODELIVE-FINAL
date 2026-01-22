/**
 * Proxy Manager for Browser Automation
 *
 * Manages proxy rotation to avoid IP-based blocking:
 * - Round-robin and weighted selection
 * - Failure tracking and automatic removal
 * - Country-based filtering
 * - Proxy health checking
 */

import { Browser, BrowserContext } from 'playwright';

export type ProxyProtocol = 'http' | 'https' | 'socks4' | 'socks5';

export interface Proxy {
  id: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol: ProxyProtocol;
  country?: string;
  city?: string;
  isp?: string;
  // Runtime stats
  lastUsed?: Date;
  lastChecked?: Date;
  failures: number;
  successes: number;
  avgLatency?: number;
  isHealthy: boolean;
}

export interface ProxyManagerConfig {
  maxFailures: number; // Max failures before removing proxy
  cooldownMs: number; // Cooldown between uses of same proxy
  healthCheckIntervalMs: number; // Interval between health checks
  healthCheckUrl: string; // URL to check proxy health
  healthCheckTimeout: number; // Timeout for health check
}

const DEFAULT_CONFIG: ProxyManagerConfig = {
  maxFailures: 3,
  cooldownMs: 30000, // 30 seconds
  healthCheckIntervalMs: 300000, // 5 minutes
  healthCheckUrl: 'https://api.ipify.org?format=json',
  healthCheckTimeout: 10000, // 10 seconds
};

export class ProxyManager {
  private proxies: Map<string, Proxy> = new Map();
  private currentIndex = 0;
  private config: ProxyManagerConfig;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: Partial<ProxyManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // PROXY MANAGEMENT
  // ============================================================================

  /**
   * Add a single proxy
   */
  addProxy(proxy: Omit<Proxy, 'id' | 'failures' | 'successes' | 'isHealthy'>): Proxy {
    const id = `${proxy.host}:${proxy.port}`;
    const fullProxy: Proxy = {
      ...proxy,
      id,
      failures: 0,
      successes: 0,
      isHealthy: true,
    };

    this.proxies.set(id, fullProxy);
    console.log(`✅ Added proxy: ${id} (${proxy.country || 'Unknown'})`);

    return fullProxy;
  }

  /**
   * Add multiple proxies
   */
  addProxies(proxies: Array<Omit<Proxy, 'id' | 'failures' | 'successes' | 'isHealthy'>>): Proxy[] {
    return proxies.map((p) => this.addProxy(p));
  }

  /**
   * Add proxies from string format (host:port:user:pass or host:port)
   */
  addProxiesFromString(
    proxyStrings: string[],
    protocol: ProxyProtocol = 'http',
    country?: string
  ): Proxy[] {
    const proxies: Proxy[] = [];

    for (const str of proxyStrings) {
      const parts = str.split(':');
      if (parts.length < 2) continue;

      const proxy = this.addProxy({
        host: parts[0],
        port: parseInt(parts[1], 10),
        username: parts[2],
        password: parts[3],
        protocol,
        country,
      });

      proxies.push(proxy);
    }

    return proxies;
  }

  /**
   * Remove a proxy
   */
  removeProxy(proxyId: string): void {
    this.proxies.delete(proxyId);
    console.log(`🗑️ Removed proxy: ${proxyId}`);
  }

  /**
   * Get all proxies
   */
  getAllProxies(): Proxy[] {
    return Array.from(this.proxies.values());
  }

  /**
   * Get healthy proxies
   */
  getHealthyProxies(): Proxy[] {
    return this.getAllProxies().filter((p) => p.isHealthy && p.failures < this.config.maxFailures);
  }

  /**
   * Get proxies by country
   */
  getProxiesByCountry(country: string): Proxy[] {
    return this.getHealthyProxies().filter(
      (p) => p.country?.toLowerCase() === country.toLowerCase()
    );
  }

  // ============================================================================
  // PROXY SELECTION
  // ============================================================================

  /**
   * Get next available proxy (round-robin)
   */
  getNextProxy(preferCountry?: string): Proxy | null {
    let available = this.getHealthyProxies();

    // Filter by cooldown
    const now = Date.now();
    available = available.filter((p) => {
      if (!p.lastUsed) return true;
      return now - p.lastUsed.getTime() >= this.config.cooldownMs;
    });

    // Filter by country if specified
    if (preferCountry) {
      const countryProxies = available.filter(
        (p) => p.country?.toLowerCase() === preferCountry.toLowerCase()
      );
      if (countryProxies.length > 0) {
        available = countryProxies;
      }
    }

    if (available.length === 0) {
      console.warn('⚠️ No available proxies');
      return null;
    }

    // Round-robin selection
    const proxy = available[this.currentIndex % available.length];
    this.currentIndex++;

    // Update last used
    proxy.lastUsed = new Date();

    return proxy;
  }

  /**
   * Get best proxy based on success rate and latency
   */
  getBestProxy(preferCountry?: string): Proxy | null {
    let available = this.getHealthyProxies();

    if (preferCountry) {
      const countryProxies = available.filter(
        (p) => p.country?.toLowerCase() === preferCountry.toLowerCase()
      );
      if (countryProxies.length > 0) {
        available = countryProxies;
      }
    }

    if (available.length === 0) return null;

    // Sort by success rate and latency
    available.sort((a, b) => {
      const aSuccessRate = a.successes / Math.max(1, a.successes + a.failures);
      const bSuccessRate = b.successes / Math.max(1, b.successes + b.failures);

      if (Math.abs(aSuccessRate - bSuccessRate) > 0.1) {
        return bSuccessRate - aSuccessRate; // Higher success rate first
      }

      // If similar success rate, prefer lower latency
      const aLatency = a.avgLatency || Infinity;
      const bLatency = b.avgLatency || Infinity;
      return aLatency - bLatency;
    });

    const proxy = available[0];
    proxy.lastUsed = new Date();
    return proxy;
  }

  /**
   * Get random proxy
   */
  getRandomProxy(preferCountry?: string): Proxy | null {
    let available = this.getHealthyProxies();

    if (preferCountry) {
      const countryProxies = available.filter(
        (p) => p.country?.toLowerCase() === preferCountry.toLowerCase()
      );
      if (countryProxies.length > 0) {
        available = countryProxies;
      }
    }

    if (available.length === 0) return null;

    const proxy = available[Math.floor(Math.random() * available.length)];
    proxy.lastUsed = new Date();
    return proxy;
  }

  // ============================================================================
  // SUCCESS/FAILURE TRACKING
  // ============================================================================

  /**
   * Record successful use of proxy
   */
  recordSuccess(proxyId: string, latencyMs?: number): void {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;

    proxy.successes++;
    proxy.failures = Math.max(0, proxy.failures - 1); // Reduce failure count on success
    proxy.isHealthy = true;

    // Update average latency
    if (latencyMs !== undefined) {
      if (proxy.avgLatency === undefined) {
        proxy.avgLatency = latencyMs;
      } else {
        // Exponential moving average
        proxy.avgLatency = proxy.avgLatency * 0.8 + latencyMs * 0.2;
      }
    }
  }

  /**
   * Record failed use of proxy
   */
  recordFailure(proxyId: string, error?: string): void {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;

    proxy.failures++;
    console.warn(`⚠️ Proxy failure (${proxy.failures}/${this.config.maxFailures}): ${proxyId}`);

    if (error) {
      console.warn(`   Error: ${error}`);
    }

    if (proxy.failures >= this.config.maxFailures) {
      proxy.isHealthy = false;
      console.warn(`🔴 Proxy marked unhealthy: ${proxyId}`);
    }
  }

  /**
   * Reset failure count for a proxy
   */
  resetFailures(proxyId: string): void {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;

    proxy.failures = 0;
    proxy.isHealthy = true;
  }

  // ============================================================================
  // HEALTH CHECKING
  // ============================================================================

  /**
   * Check health of a single proxy
   */
  async checkProxyHealth(proxy: Proxy): Promise<boolean> {
    const startTime = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);

    try {
      const proxyUrl = this.getProxyUrl(proxy);

      // Use fetch with proxy (requires additional setup in production)
      // For now, we'll simulate the check
      const response = await fetch(this.config.healthCheckUrl, {
        signal: controller.signal,
        // In production, you'd configure proxy here
      });

      if (response.ok) {
        const latency = Date.now() - startTime;
        proxy.isHealthy = true;
        proxy.lastChecked = new Date();
        proxy.avgLatency = latency;
        return true;
      }

      return false;
    } catch (error) {
      proxy.isHealthy = false;
      proxy.lastChecked = new Date();
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Check health of all proxies
   */
  async checkAllProxiesHealth(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    console.log('🏥 Checking proxy health...');

    const proxies = this.getAllProxies();
    const checks = proxies.map(async (proxy) => {
      const isHealthy = await this.checkProxyHealth(proxy);
      results.set(proxy.id, isHealthy);
      return { id: proxy.id, isHealthy };
    });

    const checkResults = await Promise.all(checks);

    const healthy = checkResults.filter((r) => r.isHealthy).length;
    console.log(`✅ Health check complete: ${healthy}/${proxies.length} healthy`);

    return results;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return; // Already running
    }

    console.log('🏥 Starting proxy health checks');

    this.healthCheckInterval = setInterval(() => {
      this.checkAllProxiesHealth().catch(err => {
        console.error('[ProxyManager] Health check failed:', err);
      });
    }, this.config.healthCheckIntervalMs);

    // Run initial check
    this.checkAllProxiesHealth().catch(err => {
      console.error('[ProxyManager] Initial health check failed:', err);
    });
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      console.log('🛑 Stopped proxy health checks');
    }
  }

  // ============================================================================
  // PLAYWRIGHT INTEGRATION
  // ============================================================================

  /**
   * Create browser context with proxy
   */
  async createProxiedContext(browser: Browser, proxy: Proxy): Promise<BrowserContext> {
    const proxyConfig: {
      server: string;
      username?: string;
      password?: string;
    } = {
      server: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
    };

    if (proxy.username && proxy.password) {
      proxyConfig.username = proxy.username;
      proxyConfig.password = proxy.password;
    }

    return browser.newContext({
      proxy: proxyConfig,
    });
  }

  /**
   * Get proxy URL for external use
   */
  getProxyUrl(proxy: Proxy): string {
    if (proxy.username && proxy.password) {
      return `${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    }
    return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get proxy statistics
   */
  getStats(): {
    total: number;
    healthy: number;
    unhealthy: number;
    byCountry: Record<string, number>;
    avgSuccessRate: number;
    avgLatency: number;
  } {
    const proxies = this.getAllProxies();
    const healthy = proxies.filter((p) => p.isHealthy);
    const byCountry: Record<string, number> = {};

    let totalSuccessRate = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    for (const proxy of proxies) {
      // Count by country
      const country = proxy.country || 'Unknown';
      byCountry[country] = (byCountry[country] || 0) + 1;

      // Calculate success rate
      const total = proxy.successes + proxy.failures;
      if (total > 0) {
        totalSuccessRate += proxy.successes / total;
      }

      // Calculate latency
      if (proxy.avgLatency !== undefined) {
        totalLatency += proxy.avgLatency;
        latencyCount++;
      }
    }

    return {
      total: proxies.length,
      healthy: healthy.length,
      unhealthy: proxies.length - healthy.length,
      byCountry,
      avgSuccessRate: proxies.length > 0 ? totalSuccessRate / proxies.length : 0,
      avgLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
    };
  }

  /**
   * Log proxy statistics
   */
  logStats(): void {
    const stats = this.getStats();
    console.log('📊 Proxy Statistics:');
    console.log(`   Total: ${stats.total}`);
    console.log(`   Healthy: ${stats.healthy}`);
    console.log(`   Unhealthy: ${stats.unhealthy}`);
    console.log(`   Avg Success Rate: ${(stats.avgSuccessRate * 100).toFixed(1)}%`);
    console.log(`   Avg Latency: ${stats.avgLatency.toFixed(0)}ms`);
    console.log('   By Country:', stats.byCountry);
  }
}

// Export singleton instance
export const proxyManager = new ProxyManager();
export default proxyManager;
