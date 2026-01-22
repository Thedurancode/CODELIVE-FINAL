/**
 * Browser Automation Plugins - Production Hardened
 *
 * Export all browser automation related components including:
 * - Core automation service with stealth measures
 * - Auction site submission plugin
 * - Anti-detection and stealth configuration
 * - Human-like behavior simulation
 * - Retry logic and circuit breaker
 * - CAPTCHA solving integration
 * - Proxy rotation
 * - Smart selector detection
 * - Metrics and monitoring
 * - Secure credential storage
 */

// Core services
export * from './BrowserAutomationService';
export * from './AuctionSubmissionPlugin';

// Production-hardening modules
export * from './StealthConfig';
export * from './HumanBehavior';
export * from './ResilienceLayer';
export * from './CaptchaSolver';
export * from './ProxyManager';
export * from './SmartSelector';
export * from './BrowserMetrics';
export * from './SecureCredentialStore';

// Import singletons for convenient access
import { browserAutomation, BrowserAutomationService } from './BrowserAutomationService';
import { auctionSubmission, AuctionSubmissionPlugin } from './AuctionSubmissionPlugin';
import { humanBehavior, HumanBehavior } from './HumanBehavior';
import { resilienceLayer, ResilienceLayer } from './ResilienceLayer';
import { proxyManager, ProxyManager } from './ProxyManager';
import { smartSelector, SmartSelector } from './SmartSelector';
import { browserMetrics, BrowserMetrics } from './BrowserMetrics';
import { getCredentialStore, SecureCredentialStore } from './SecureCredentialStore';
import { createCaptchaSolver, CaptchaSolver } from './CaptchaSolver';

// Export singleton instances
export {
  // Core
  browserAutomation,
  auctionSubmission,
  // Production-hardening
  humanBehavior,
  resilienceLayer,
  proxyManager,
  smartSelector,
  browserMetrics,
  getCredentialStore,
  createCaptchaSolver,
};

// Export classes for custom instantiation
export {
  BrowserAutomationService,
  AuctionSubmissionPlugin,
  HumanBehavior,
  ResilienceLayer,
  ProxyManager,
  SmartSelector,
  BrowserMetrics,
  SecureCredentialStore,
  CaptchaSolver,
};
