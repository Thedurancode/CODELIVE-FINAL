/**
 * ProxyManager Unit Tests
 */

import { ProxyManager, Proxy, ProxyProtocol } from '../../plugins/browser/ProxyManager';

describe('ProxyManager', () => {
  let proxyManager: ProxyManager;

  beforeEach(() => {
    proxyManager = new ProxyManager({
      maxFailures: 3,
      cooldownMs: 1000,
    });
  });

  afterEach(() => {
    proxyManager.stopHealthChecks();
  });

  // ============================================================================
  // PROXY MANAGEMENT
  // ============================================================================

  describe('Proxy Management', () => {
    describe('addProxy', () => {
      it('should add a proxy with correct defaults', () => {
        const proxy = proxyManager.addProxy({
          host: '192.168.1.1',
          port: 8080,
          protocol: 'http',
        });

        expect(proxy.id).toBe('192.168.1.1:8080');
        expect(proxy.failures).toBe(0);
        expect(proxy.successes).toBe(0);
        expect(proxy.isHealthy).toBe(true);
      });

      it('should add proxy with authentication', () => {
        const proxy = proxyManager.addProxy({
          host: '192.168.1.1',
          port: 8080,
          protocol: 'http',
          username: 'user',
          password: 'pass',
        });

        expect(proxy.username).toBe('user');
        expect(proxy.password).toBe('pass');
      });

      it('should add proxy with country information', () => {
        const proxy = proxyManager.addProxy({
          host: '192.168.1.1',
          port: 8080,
          protocol: 'http',
          country: 'US',
          city: 'New York',
        });

        expect(proxy.country).toBe('US');
        expect(proxy.city).toBe('New York');
      });
    });

    describe('addProxies', () => {
      it('should add multiple proxies', () => {
        const proxies = proxyManager.addProxies([
          { host: '192.168.1.1', port: 8080, protocol: 'http' as ProxyProtocol },
          { host: '192.168.1.2', port: 8080, protocol: 'http' as ProxyProtocol },
          { host: '192.168.1.3', port: 8080, protocol: 'http' as ProxyProtocol },
        ]);

        expect(proxies.length).toBe(3);
        expect(proxyManager.getAllProxies().length).toBe(3);
      });
    });

    describe('addProxiesFromString', () => {
      it('should parse host:port format', () => {
        const proxies = proxyManager.addProxiesFromString([
          '192.168.1.1:8080',
          '192.168.1.2:8081',
        ]);

        expect(proxies.length).toBe(2);
        expect(proxies[0].host).toBe('192.168.1.1');
        expect(proxies[0].port).toBe(8080);
      });

      it('should parse host:port:user:pass format', () => {
        const proxies = proxyManager.addProxiesFromString([
          '192.168.1.1:8080:admin:secret',
        ]);

        expect(proxies[0].username).toBe('admin');
        expect(proxies[0].password).toBe('secret');
      });

      it('should skip invalid entries', () => {
        const proxies = proxyManager.addProxiesFromString([
          '192.168.1.1:8080',
          'invalid',
          '192.168.1.2:8081',
        ]);

        expect(proxies.length).toBe(2);
      });

      it('should use specified protocol', () => {
        const proxies = proxyManager.addProxiesFromString(
          ['192.168.1.1:8080'],
          'socks5'
        );

        expect(proxies[0].protocol).toBe('socks5');
      });

      it('should use specified country', () => {
        const proxies = proxyManager.addProxiesFromString(
          ['192.168.1.1:8080'],
          'http',
          'US'
        );

        expect(proxies[0].country).toBe('US');
      });
    });

    describe('removeProxy', () => {
      it('should remove proxy by id', () => {
        proxyManager.addProxy({
          host: '192.168.1.1',
          port: 8080,
          protocol: 'http',
        });

        expect(proxyManager.getAllProxies().length).toBe(1);

        proxyManager.removeProxy('192.168.1.1:8080');

        expect(proxyManager.getAllProxies().length).toBe(0);
      });
    });

    describe('getHealthyProxies', () => {
      it('should return only healthy proxies', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });
        proxyManager.addProxy({ host: '192.168.1.2', port: 8080, protocol: 'http' });

        // Mark one as unhealthy
        proxyManager.recordFailure('192.168.1.1:8080');
        proxyManager.recordFailure('192.168.1.1:8080');
        proxyManager.recordFailure('192.168.1.1:8080');

        const healthy = proxyManager.getHealthyProxies();
        expect(healthy.length).toBe(1);
        expect(healthy[0].host).toBe('192.168.1.2');
      });
    });

    describe('getProxiesByCountry', () => {
      it('should filter proxies by country', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http', country: 'US' });
        proxyManager.addProxy({ host: '192.168.1.2', port: 8080, protocol: 'http', country: 'UK' });
        proxyManager.addProxy({ host: '192.168.1.3', port: 8080, protocol: 'http', country: 'US' });

        const usProxies = proxyManager.getProxiesByCountry('US');
        expect(usProxies.length).toBe(2);
      });

      it('should be case-insensitive', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http', country: 'US' });

        const proxies = proxyManager.getProxiesByCountry('us');
        expect(proxies.length).toBe(1);
      });
    });
  });

  // ============================================================================
  // PROXY SELECTION
  // ============================================================================

  describe('Proxy Selection', () => {
    describe('getNextProxy', () => {
      it('should return proxy in round-robin order', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });
        proxyManager.addProxy({ host: '192.168.1.2', port: 8080, protocol: 'http' });

        // Disable cooldown for testing
        const pm = new ProxyManager({ cooldownMs: 0, maxFailures: 3 });
        pm.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });
        pm.addProxy({ host: '192.168.1.2', port: 8080, protocol: 'http' });

        const first = pm.getNextProxy();
        const second = pm.getNextProxy();

        expect(first?.host).not.toBe(second?.host);
      });

      it('should return null when no proxies available', () => {
        const proxy = proxyManager.getNextProxy();
        expect(proxy).toBeNull();
      });

      it('should prefer specified country', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http', country: 'US' });
        proxyManager.addProxy({ host: '192.168.1.2', port: 8080, protocol: 'http', country: 'UK' });

        const proxy = proxyManager.getNextProxy('US');
        expect(proxy?.country).toBe('US');
      });

      it('should update lastUsed timestamp', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        const proxy = proxyManager.getNextProxy();
        expect(proxy?.lastUsed).toBeDefined();
      });
    });

    describe('getBestProxy', () => {
      it('should prefer proxy with higher success rate', () => {
        const pm = new ProxyManager({ cooldownMs: 0, maxFailures: 10 });
        pm.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });
        pm.addProxy({ host: '192.168.1.2', port: 8080, protocol: 'http' });

        // Record more successes for second proxy
        pm.recordSuccess('192.168.1.2:8080');
        pm.recordSuccess('192.168.1.2:8080');
        pm.recordSuccess('192.168.1.2:8080');
        pm.recordFailure('192.168.1.1:8080');

        const best = pm.getBestProxy();
        expect(best?.host).toBe('192.168.1.2');
      });

      it('should return null when no healthy proxies', () => {
        const proxy = proxyManager.getBestProxy();
        expect(proxy).toBeNull();
      });
    });

    describe('getRandomProxy', () => {
      it('should return a proxy when available', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        const proxy = proxyManager.getRandomProxy();
        expect(proxy).not.toBeNull();
      });

      it('should prefer specified country', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http', country: 'US' });
        proxyManager.addProxy({ host: '192.168.1.2', port: 8080, protocol: 'http', country: 'UK' });

        // Run multiple times to check preference
        for (let i = 0; i < 5; i++) {
          const proxy = proxyManager.getRandomProxy('US');
          expect(proxy?.country).toBe('US');
        }
      });
    });
  });

  // ============================================================================
  // SUCCESS/FAILURE TRACKING
  // ============================================================================

  describe('Success/Failure Tracking', () => {
    describe('recordSuccess', () => {
      it('should increment success count', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        proxyManager.recordSuccess('192.168.1.1:8080');
        proxyManager.recordSuccess('192.168.1.1:8080');

        const proxies = proxyManager.getAllProxies();
        expect(proxies[0].successes).toBe(2);
      });

      it('should reduce failure count on success', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        proxyManager.recordFailure('192.168.1.1:8080');
        proxyManager.recordFailure('192.168.1.1:8080');
        proxyManager.recordSuccess('192.168.1.1:8080');

        const proxies = proxyManager.getAllProxies();
        expect(proxies[0].failures).toBe(1);
      });

      it('should update average latency', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        proxyManager.recordSuccess('192.168.1.1:8080', 100);

        const proxies = proxyManager.getAllProxies();
        expect(proxies[0].avgLatency).toBe(100);
      });

      it('should use exponential moving average for latency', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        proxyManager.recordSuccess('192.168.1.1:8080', 100);
        proxyManager.recordSuccess('192.168.1.1:8080', 200);

        const proxies = proxyManager.getAllProxies();
        // 100 * 0.8 + 200 * 0.2 = 120
        expect(proxies[0].avgLatency).toBe(120);
      });
    });

    describe('recordFailure', () => {
      it('should increment failure count', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        proxyManager.recordFailure('192.168.1.1:8080');

        const proxies = proxyManager.getAllProxies();
        expect(proxies[0].failures).toBe(1);
      });

      it('should mark proxy unhealthy after max failures', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        proxyManager.recordFailure('192.168.1.1:8080');
        proxyManager.recordFailure('192.168.1.1:8080');
        proxyManager.recordFailure('192.168.1.1:8080');

        const proxies = proxyManager.getAllProxies();
        expect(proxies[0].isHealthy).toBe(false);

        consoleSpy.mockRestore();
      });
    });

    describe('resetFailures', () => {
      it('should reset failure count and mark healthy', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        proxyManager.recordFailure('192.168.1.1:8080');
        proxyManager.recordFailure('192.168.1.1:8080');
        proxyManager.recordFailure('192.168.1.1:8080');

        proxyManager.resetFailures('192.168.1.1:8080');

        const proxies = proxyManager.getAllProxies();
        expect(proxies[0].failures).toBe(0);
        expect(proxies[0].isHealthy).toBe(true);

        consoleSpy.mockRestore();
      });
    });
  });

  // ============================================================================
  // PROXY URL GENERATION
  // ============================================================================

  describe('getProxyUrl', () => {
    it('should generate URL without auth', () => {
      const proxy: Proxy = {
        id: 'test',
        host: '192.168.1.1',
        port: 8080,
        protocol: 'http',
        failures: 0,
        successes: 0,
        isHealthy: true,
      };

      const url = proxyManager.getProxyUrl(proxy);
      expect(url).toBe('http://192.168.1.1:8080');
    });

    it('should generate URL with auth', () => {
      const proxy: Proxy = {
        id: 'test',
        host: '192.168.1.1',
        port: 8080,
        protocol: 'http',
        username: 'user',
        password: 'pass',
        failures: 0,
        successes: 0,
        isHealthy: true,
      };

      const url = proxyManager.getProxyUrl(proxy);
      expect(url).toBe('http://user:pass@192.168.1.1:8080');
    });

    it('should handle socks5 protocol', () => {
      const proxy: Proxy = {
        id: 'test',
        host: '192.168.1.1',
        port: 1080,
        protocol: 'socks5',
        failures: 0,
        successes: 0,
        isHealthy: true,
      };

      const url = proxyManager.getProxyUrl(proxy);
      expect(url).toBe('socks5://192.168.1.1:1080');
    });
  });

  // ============================================================================
  // STATISTICS
  // ============================================================================

  describe('Statistics', () => {
    describe('getStats', () => {
      it('should return correct statistics', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http', country: 'US' });
        proxyManager.addProxy({ host: '192.168.1.2', port: 8080, protocol: 'http', country: 'US' });
        proxyManager.addProxy({ host: '192.168.1.3', port: 8080, protocol: 'http', country: 'UK' });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        // Mark one unhealthy
        proxyManager.recordFailure('192.168.1.1:8080');
        proxyManager.recordFailure('192.168.1.1:8080');
        proxyManager.recordFailure('192.168.1.1:8080');

        const stats = proxyManager.getStats();

        expect(stats.total).toBe(3);
        expect(stats.healthy).toBe(2);
        expect(stats.unhealthy).toBe(1);
        expect(stats.byCountry['US']).toBe(2);
        expect(stats.byCountry['UK']).toBe(1);

        consoleSpy.mockRestore();
      });

      it('should calculate average success rate', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        proxyManager.recordSuccess('192.168.1.1:8080');
        proxyManager.recordSuccess('192.168.1.1:8080');
        proxyManager.recordFailure('192.168.1.1:8080');

        const stats = proxyManager.getStats();
        // 2 successes, 1 failure = 2/3 = 0.667
        expect(stats.avgSuccessRate).toBeCloseTo(0.667, 1);
      });

      it('should calculate average latency', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });
        proxyManager.addProxy({ host: '192.168.1.2', port: 8080, protocol: 'http' });

        proxyManager.recordSuccess('192.168.1.1:8080', 100);
        proxyManager.recordSuccess('192.168.1.2:8080', 200);

        const stats = proxyManager.getStats();
        expect(stats.avgLatency).toBe(150);
      });
    });

    describe('logStats', () => {
      it('should log statistics', () => {
        proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        proxyManager.logStats();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });
  });

  // ============================================================================
  // HEALTH CHECK CONTROLS
  // ============================================================================

  describe('Health Check Controls', () => {
    it('should start health checks', () => {
      proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      proxyManager.startHealthChecks();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Starting proxy health checks'));

      proxyManager.stopHealthChecks();
      consoleSpy.mockRestore();
    });

    it('should not start health checks twice', () => {
      proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      proxyManager.startHealthChecks();
      proxyManager.startHealthChecks(); // Should not start again

      expect(consoleSpy).toHaveBeenCalledTimes(2); // Once for start, once for initial check result

      proxyManager.stopHealthChecks();
      consoleSpy.mockRestore();
    });

    it('should stop health checks', () => {
      proxyManager.addProxy({ host: '192.168.1.1', port: 8080, protocol: 'http' });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      proxyManager.startHealthChecks();
      proxyManager.stopHealthChecks();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Stopped proxy health checks'));

      consoleSpy.mockRestore();
    });
  });
});
