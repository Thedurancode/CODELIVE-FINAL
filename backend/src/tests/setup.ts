/**
 * Jest Test Setup
 *
 * Global test configuration and utilities
 */

import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Keep warn and error for debugging
  warn: console.warn,
  error: console.error,
};

// Global test utilities
export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const generateTestId = () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Cleanup after all tests
afterAll(async () => {
  jest.clearAllMocks();
});
