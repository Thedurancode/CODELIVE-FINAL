/**
 * StealthConfig Unit Tests
 */

import {
  USER_AGENTS,
  VIEWPORTS,
  TIMEZONES,
  StealthConfig,
  BrowserFingerprint,
} from '../../plugins/browser/StealthConfig';

describe('StealthConfig Constants', () => {
  // ============================================================================
  // USER AGENTS TESTS
  // ============================================================================

  describe('USER_AGENTS', () => {
    it('should contain common browser user agents', () => {
      expect(USER_AGENTS).toBeDefined();
      expect(USER_AGENTS.chrome_windows).toBeDefined();
      expect(USER_AGENTS.chrome_mac).toBeDefined();
      expect(USER_AGENTS.firefox_windows).toBeDefined();
    });

    it('should have valid Chrome user agent strings', () => {
      expect(USER_AGENTS.chrome_windows).toContain('Chrome');
      expect(USER_AGENTS.chrome_mac).toContain('Chrome');
    });

    it('should have valid Firefox user agent strings', () => {
      expect(USER_AGENTS.firefox_windows).toContain('Firefox');
      expect(USER_AGENTS.firefox_mac).toContain('Firefox');
    });

    it('should have valid Safari user agent string', () => {
      expect(USER_AGENTS.safari_mac).toContain('Safari');
    });

    it('should have valid Edge user agent string', () => {
      expect(USER_AGENTS.edge_windows).toContain('Edg');
    });
  });

  // ============================================================================
  // VIEWPORTS TESTS
  // ============================================================================

  describe('VIEWPORTS', () => {
    it('should contain common viewport sizes', () => {
      expect(VIEWPORTS).toBeDefined();
      expect(VIEWPORTS.desktop_1080p).toBeDefined();
      expect(VIEWPORTS.laptop_15).toBeDefined();
    });

    it('should have correct 1080p dimensions', () => {
      expect(VIEWPORTS.desktop_1080p.width).toBe(1920);
      expect(VIEWPORTS.desktop_1080p.height).toBe(1080);
    });

    it('should have correct 1440p dimensions', () => {
      expect(VIEWPORTS.desktop_1440p.width).toBe(2560);
      expect(VIEWPORTS.desktop_1440p.height).toBe(1440);
    });

    it('should have correct laptop dimensions', () => {
      expect(VIEWPORTS.laptop_15.width).toBe(1366);
      expect(VIEWPORTS.laptop_15.height).toBe(768);
    });

    it('should have correct MacBook Pro dimensions', () => {
      expect(VIEWPORTS.macbook_pro.width).toBe(1440);
      expect(VIEWPORTS.macbook_pro.height).toBe(900);
    });
  });

  // ============================================================================
  // TIMEZONES TESTS
  // ============================================================================

  describe('TIMEZONES', () => {
    it('should contain US timezones', () => {
      expect(TIMEZONES).toBeDefined();
      expect(TIMEZONES.us_eastern).toBe('America/New_York');
      expect(TIMEZONES.us_central).toBe('America/Chicago');
      expect(TIMEZONES.us_mountain).toBe('America/Denver');
      expect(TIMEZONES.us_pacific).toBe('America/Los_Angeles');
    });

    it('should contain international timezones', () => {
      expect(TIMEZONES.uk).toBe('Europe/London');
      expect(TIMEZONES.eu_central).toBe('Europe/Berlin');
    });
  });
});

describe('StealthConfig Interface', () => {
  it('should allow creating a valid StealthConfig object', () => {
    const config: StealthConfig = {
      fingerprint: {
        userAgent: USER_AGENTS.chrome_windows,
        viewport: VIEWPORTS.desktop_1080p,
        locale: 'en-US',
        timezone: TIMEZONES.us_eastern,
        platform: 'Win32',
        deviceScaleFactor: 1,
      },
      humanization: {
        mouseMovement: true,
        typingSpeed: { min: 50, max: 150 },
        randomDelays: true,
        scrollBehavior: true,
      },
      antiDetection: {
        hideWebdriver: true,
        mockPlugins: true,
        mockChrome: true,
        mockPermissions: true,
      },
    };

    expect(config.fingerprint.userAgent).toContain('Chrome');
    expect(config.humanization.mouseMovement).toBe(true);
    expect(config.antiDetection.hideWebdriver).toBe(true);
  });

  it('should allow creating a BrowserFingerprint object', () => {
    const fingerprint: BrowserFingerprint = {
      userAgent: USER_AGENTS.firefox_mac,
      viewport: { width: 1440, height: 900 },
      locale: 'en-GB',
      timezone: 'Europe/London',
      platform: 'MacIntel',
      deviceScaleFactor: 2,
    };

    expect(fingerprint.userAgent).toContain('Firefox');
    expect(fingerprint.viewport.width).toBe(1440);
    expect(fingerprint.deviceScaleFactor).toBe(2);
  });

  it('should support various platform values', () => {
    const platforms = ['Win32', 'MacIntel', 'Linux x86_64'];

    platforms.forEach((platform) => {
      const fingerprint: BrowserFingerprint = {
        userAgent: USER_AGENTS.chrome_windows,
        viewport: VIEWPORTS.desktop_1080p,
        locale: 'en-US',
        timezone: TIMEZONES.us_eastern,
        platform,
        deviceScaleFactor: 1,
      };

      expect(fingerprint.platform).toBe(platform);
    });
  });

  it('should support various device scale factors', () => {
    const scaleFactors = [1, 1.25, 1.5, 2, 3];

    scaleFactors.forEach((factor) => {
      const fingerprint: BrowserFingerprint = {
        userAgent: USER_AGENTS.chrome_mac,
        viewport: VIEWPORTS.macbook_pro,
        locale: 'en-US',
        timezone: TIMEZONES.us_pacific,
        platform: 'MacIntel',
        deviceScaleFactor: factor,
      };

      expect(fingerprint.deviceScaleFactor).toBe(factor);
    });
  });
});
