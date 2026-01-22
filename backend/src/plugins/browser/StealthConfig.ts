/**
 * Stealth Configuration for Browser Automation
 *
 * Anti-detection measures to avoid bot detection on auction sites.
 */

export interface BrowserFingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  locale: string;
  timezone: string;
  platform: string;
  deviceScaleFactor: number;
}

export interface StealthConfig {
  fingerprint: BrowserFingerprint;
  humanization: {
    mouseMovement: boolean;
    typingSpeed: { min: number; max: number }; // ms per char
    randomDelays: boolean;
    scrollBehavior: boolean;
  };
  antiDetection: {
    hideWebdriver: boolean;
    mockPlugins: boolean;
    mockChrome: boolean;
    mockPermissions: boolean;
  };
}

// Common real-world user agents (updated regularly)
export const USER_AGENTS = {
  chrome_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  chrome_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  chrome_linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  firefox_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  firefox_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  safari_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  edge_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
};

// Common viewport sizes
export const VIEWPORTS = {
  desktop_1080p: { width: 1920, height: 1080 },
  desktop_1440p: { width: 2560, height: 1440 },
  laptop_15: { width: 1366, height: 768 },
  laptop_13: { width: 1280, height: 800 },
  macbook_pro: { width: 1440, height: 900 },
  imac_27: { width: 2560, height: 1440 },
};

// Timezones by region
export const TIMEZONES = {
  us_eastern: 'America/New_York',
  us_central: 'America/Chicago',
  us_mountain: 'America/Denver',
  us_pacific: 'America/Los_Angeles',
  uk: 'Europe/London',
  eu_central: 'Europe/Berlin',
};

/**
 * Generate a random but consistent fingerprint
 */
export function generateFingerprint(region: 'us' | 'eu' | 'random' = 'us'): BrowserFingerprint {
  const userAgents = Object.values(USER_AGENTS);
  const viewports = Object.values(VIEWPORTS);

  // Pick random but weighted towards common configs
  const userAgent = userAgents[Math.floor(Math.random() * 3)]; // Favor Chrome
  const viewport = viewports[Math.floor(Math.random() * viewports.length)];

  let timezone: string;
  if (region === 'us') {
    const usTimezones = [TIMEZONES.us_eastern, TIMEZONES.us_central, TIMEZONES.us_pacific];
    timezone = usTimezones[Math.floor(Math.random() * usTimezones.length)];
  } else if (region === 'eu') {
    timezone = Math.random() > 0.5 ? TIMEZONES.uk : TIMEZONES.eu_central;
  } else {
    const allTimezones = Object.values(TIMEZONES);
    timezone = allTimezones[Math.floor(Math.random() * allTimezones.length)];
  }

  const platform = userAgent.includes('Windows')
    ? 'Win32'
    : userAgent.includes('Mac')
      ? 'MacIntel'
      : 'Linux x86_64';

  return {
    userAgent,
    viewport,
    locale: 'en-US',
    timezone,
    platform,
    deviceScaleFactor: Math.random() > 0.7 ? 2 : 1, // 30% chance of retina
  };
}

/**
 * Default stealth configuration
 */
export const DEFAULT_STEALTH_CONFIG: StealthConfig = {
  fingerprint: generateFingerprint('us'),
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

/**
 * Anti-detection scripts to inject into page context
 */
export const ANTI_DETECTION_SCRIPTS = {
  hideWebdriver: `
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true
    });

    // Remove webdriver from prototype
    delete Navigator.prototype.webdriver;
  `,

  mockPlugins: `
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        plugins.length = 3;
        return plugins;
      },
      configurable: true
    });
  `,

  mockChrome: `
    window.chrome = {
      runtime: {
        connect: () => {},
        sendMessage: () => {},
        onMessage: { addListener: () => {} },
        onConnect: { addListener: () => {} },
        id: undefined
      },
      loadTimes: () => ({}),
      csi: () => ({}),
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      }
    };
  `,

  mockPermissions: `
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  `,

  mockLanguages: `
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true
    });
  `,

  hideAutomation: `
    // Remove automation-related properties
    const automationProps = [
      'domAutomation',
      'domAutomationController',
      '_Selenium_IDE_Recorder',
      '_selenium',
      '__webdriver_script_fn',
      '__driver_evaluate',
      '__webdriver_evaluate',
      '__selenium_evaluate',
      '__fxdriver_evaluate',
      '__driver_unwrapped',
      '__webdriver_unwrapped',
      '__selenium_unwrapped',
      '__fxdriver_unwrapped',
      '__webdriver_script_func',
      '$chrome_asyncScriptInfo',
      '$cdc_asdjflasutopfhvcZLmcfl_'
    ];

    for (const prop of automationProps) {
      delete window[prop];
      delete document[prop];
    }
  `,

  mockWebGL: `
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) {
        return 'Intel Inc.';
      }
      if (parameter === 37446) {
        return 'Intel Iris OpenGL Engine';
      }
      return getParameter.apply(this, arguments);
    };
  `,
};

/**
 * Combine all anti-detection scripts
 */
export function getAntiDetectionScript(config: StealthConfig['antiDetection']): string {
  const scripts: string[] = [];

  if (config.hideWebdriver) {
    scripts.push(ANTI_DETECTION_SCRIPTS.hideWebdriver);
    scripts.push(ANTI_DETECTION_SCRIPTS.hideAutomation);
  }

  if (config.mockPlugins) {
    scripts.push(ANTI_DETECTION_SCRIPTS.mockPlugins);
  }

  if (config.mockChrome) {
    scripts.push(ANTI_DETECTION_SCRIPTS.mockChrome);
  }

  if (config.mockPermissions) {
    scripts.push(ANTI_DETECTION_SCRIPTS.mockPermissions);
  }

  scripts.push(ANTI_DETECTION_SCRIPTS.mockLanguages);
  scripts.push(ANTI_DETECTION_SCRIPTS.mockWebGL);

  return scripts.join('\n\n');
}

/**
 * Browser launch arguments for stealth
 */
export const STEALTH_BROWSER_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--disable-infobars',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--disable-translate',
  '--hide-scrollbars',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',
  '--ignore-certificate-errors',
  '--ignore-ssl-errors',
  '--ignore-certificate-errors-spki-list',
  // Disable features that identify automation
  '--disable-features=IsolateOrigins,site-per-process',
  '--flag-switches-begin',
  '--flag-switches-end',
];
