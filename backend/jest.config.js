/**
 * Jest Configuration
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/tests/unit/**/*.test.ts',
    '**/tests/integration/**/*.test.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/src/tests/viewDurationSignals.test.ts', // Uses real DB, run separately
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chokidar)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/tests/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 25,
      functions: 30,
      lines: 30,
      statements: 30,
    },
    // Critical paths require higher coverage
    './src/controllers/authController.ts': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/services/PipelineService.ts': {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    './src/services/PortfolioService.ts': {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    './src/plugins/ml/**/*.ts': {
      branches: 40,
      functions: 50,
      lines: 50,
      statements: 50,
    },
    './src/plugins/scoring/**/*.ts': {
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^chokidar$': '<rootDir>/src/tests/__mocks__/chokidar.ts',
  },
  testTimeout: 30000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
};
