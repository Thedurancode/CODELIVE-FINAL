/**
 * Test Fixtures
 *
 * Reusable test data and mock factories for consistent testing
 */

// ============================================================================
// USER FIXTURES
// ============================================================================

export const mockUser = {
  id: 'user-123',
  email: 'testuser@example.com',
  name: 'Test User',
  company: 'Test Company',
  phone: '555-1234',
  role: 'buyer' as const,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  lastActiveAt: new Date('2024-01-15'),
};

export const createMockUser = (overrides: Partial<typeof mockUser> = {}) => ({
  ...mockUser,
  ...overrides,
});

// ============================================================================
// PROPERTY FIXTURES
// ============================================================================

export const mockProperty = {
  id: 1,
  propertyId: 'PROP-001',
  address: '123 Main St',
  city: 'Austin',
  state: 'TX',
  zipCode: '78701',
  propertyType: 'SFR',
  bedroomCount: 3,
  bathroomCount: 2,
  livingSpaceSqFt: 1500,
  yearBuilt: 2000,
  purchaseContractPrice: 150000,
  reservePrice: 160000,
  arv: 200000,
  repairEstimate: 25000,
  monthlyRent: 1500,
  status: 'new',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const createMockProperty = (overrides: Partial<typeof mockProperty> = {}) => ({
  ...mockProperty,
  ...overrides,
});

// ============================================================================
// BUY BOX FIXTURES
// ============================================================================

export const mockBuyBox = {
  id: 'bb-123',
  name: 'Texas SFR Buy Box',
  description: 'Single family homes in Texas under $200k',
  fundName: 'Texas Capital Fund',
  contactEmail: 'acquisitions@texascap.com',
  enabled: true,
  priority: 1,
  criteria: {
    states: ['TX'],
    propertyTypes: ['SFR', 'Townhouse'],
    minPrice: 50000,
    maxPrice: 200000,
    minBedrooms: 2,
    maxBedrooms: 5,
    minBathrooms: 1,
    minYearBuilt: 1970,
    maxHOA: 300,
    minPhotos: 5,
    occupancyPreference: 'vacant',
  },
  autoSubmit: false,
  autoSubmitThreshold: 85,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const createMockBuyBox = (overrides: Partial<typeof mockBuyBox> = {}) => ({
  ...mockBuyBox,
  ...overrides,
});

// ============================================================================
// PIPELINE FIXTURES
// ============================================================================

export const mockPipelineItem = {
  id: 'pipeline-123',
  userId: 'user-123',
  dealId: 'deal-456',
  propertyId: 1,
  stage: 'new' as const,
  stageHistory: [
    {
      stage: 'new',
      enteredAt: '2024-01-01T00:00:00Z',
      triggeredBy: 'user' as const,
    },
  ],
  entrySnapshot: {
    price: 150000,
    arv: 200000,
    state: 'TX',
    city: 'Austin',
    propertyType: 'SFR',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1500,
  },
  notes: null,
  outcome: null,
  outcomeReason: null,
  closePrice: null,
  closedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const createMockPipelineItem = (overrides: Partial<typeof mockPipelineItem> = {}) => ({
  ...mockPipelineItem,
  ...overrides,
  isClosed: () => overrides.stage === 'closed_won' || overrides.stage === 'closed_lost',
  getDaysInPipeline: () => 30,
  getStageTimings: () => ({ new: 5, analyzing: 10 }),
});

// ============================================================================
// PORTFOLIO FIXTURES
// ============================================================================

export const mockPortfolioItem = {
  id: 'portfolio-123',
  userId: 'user-123',
  propertyId: 1,
  dealPipelineId: 'pipeline-123',
  address: '123 Main St',
  city: 'Austin',
  state: 'TX',
  propertyType: 'SFR',
  bedrooms: 3,
  bathrooms: 2,
  sqft: 1500,
  acquisitionDate: new Date('2024-01-15'),
  acquisitionPrice: 150000,
  acquisitionSource: 'wholesale' as const,
  closingCosts: 5000,
  rehabCost: 20000,
  totalInvested: 175000,
  currentValue: 200000,
  lastValuedAt: new Date('2024-02-01'),
  valuationSource: 'zillow' as const,
  equity: 25000,
  monthlyRent: 1500,
  monthlyExpenses: 400,
  monthlyCashFlow: 1100,
  annualCashFlow: 13200,
  cashOnCashReturn: 7.5,
  status: 'renting' as const,
  occupancyRate: 100,
  createdAt: new Date('2024-01-15'),
  updatedAt: new Date('2024-02-01'),
};

export const createMockPortfolioItem = (overrides: Partial<typeof mockPortfolioItem> = {}) => ({
  ...mockPortfolioItem,
  ...overrides,
  updateCalculatedFields: jest.fn(),
  getHoldingPeriodMonths: () => 6,
});

// ============================================================================
// ML / SCORING FIXTURES
// ============================================================================

export const mockScoringResult = {
  buyBoxId: 'bb-123',
  fundName: 'Texas Capital Fund',
  score: 85,
  matchType: 'strong' as const,
  breakdown: [
    { criterion: 'geographic', score: 100, weight: 25, passed: true },
    { criterion: 'price', score: 90, weight: 20, passed: true },
    { criterion: 'propertyType', score: 100, weight: 10, passed: true },
    { criterion: 'bedrooms', score: 100, weight: 5, passed: true },
  ],
  hardRequirementsFailed: [],
  recommendations: [],
  scoredAt: new Date('2024-01-15'),
};

export const createMockScoringResult = (overrides: Partial<typeof mockScoringResult> = {}) => ({
  ...mockScoringResult,
  ...overrides,
});

export const mockMLFeatures = {
  numeric: [150000, 200000, 1500, 2000, 3, 2, 10, 25000, 1500],
  derived: [100, 1.33, 25, 24, 0.17, 0.12],
  categorical: new Array(65).fill(0),
  buyBoxMatch: [1, 1, 1, 1, 1],
  imageFeatures: new Array(16).fill(0.5),
  raw: new Array(85).fill(0),
};

// ============================================================================
// DEAL / NORMALIZED DEAL FIXTURES
// ============================================================================

export const mockNormalizedDeal = {
  externalId: 'deal-123',
  source: 'manual',
  askingPrice: 150000,
  arv: 200000,
  sqft: 1500,
  yearBuilt: 2000,
  bedrooms: 3,
  bathrooms: 2,
  propertyType: 'SFR',
  occupancyStatus: 'vacant',
  repairEstimate: 25000,
  monthlyRent: 1500,
  address: {
    street: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
  },
  photos: [
    'https://example.com/photo1.jpg',
    'https://example.com/photo2.jpg',
  ],
  description: 'Beautiful single family home',
  receivedAt: new Date('2024-01-01'),
};

export const createMockNormalizedDeal = (overrides: Partial<typeof mockNormalizedDeal> = {}) => ({
  ...mockNormalizedDeal,
  ...overrides,
});

// ============================================================================
// COMPLIANCE FIXTURES
// ============================================================================

export const mockComplianceRule = {
  id: 1,
  state: 'TX',
  name: 'Wholesaler LLC Required',
  category: 'general',
  field: 'wholesalerLLC',
  operator: 'required' as const,
  value: '',
  severity: 'warning' as const,
  message: 'Wholesaler LLC information is recommended',
  enabled: true,
  order: 1,
};

export const createMockComplianceRule = (overrides: Partial<typeof mockComplianceRule> = {}) => ({
  ...mockComplianceRule,
  ...overrides,
});

export const mockComplianceResult = {
  status: 'Green' as const,
  totalRules: 5,
  passedRules: 5,
  failedRules: 0,
  passedChecks: ['LLC Required', 'Contract Type', 'Disclosure'],
  issues: [],
  recommendations: [],
  checkId: 1,
  checkedAt: new Date('2024-01-15'),
};

// ============================================================================
// AUTH / SESSION FIXTURES
// ============================================================================

export const mockSession = {
  access_token: 'mock-access-token-abc123',
  refresh_token: 'mock-refresh-token-xyz789',
  expires_in: 3600,
  token_type: 'Bearer',
};

export const mockSupabaseUser = {
  id: 'supabase-user-123',
  email: 'test@example.com',
  email_confirmed_at: '2024-01-01T00:00:00Z',
  user_metadata: {
    name: 'Test User',
    company: 'Test Company',
    phone: '555-1234',
    role: 'buyer',
  },
};

// ============================================================================
// EXPRESS MOCK HELPERS
// ============================================================================

export const createMockRequest = (overrides: {
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
  user?: any;
} = {}) => ({
  body: overrides.body || {},
  params: overrides.params || {},
  query: overrides.query || {},
  headers: overrides.headers || {},
  user: overrides.user,
});

export const createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
};

// ============================================================================
// FACTORY HELPERS
// ============================================================================

/**
 * Create multiple mock items with unique IDs
 */
export function createMockList<T extends { id?: string | number }>(
  factory: (overrides?: Partial<T>) => T,
  count: number,
  overridesFn?: (index: number) => Partial<T>
): T[] {
  return Array.from({ length: count }, (_, i) =>
    factory({
      ...(overridesFn ? overridesFn(i) : {}),
      id: `${factory({}).id || 'item'}-${i}`,
    } as Partial<T>)
  );
}

/**
 * Create a mock Sequelize model instance with common methods
 */
export function createMockModelInstance<T>(data: T) {
  return {
    ...data,
    save: jest.fn().mockResolvedValue(data),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    reload: jest.fn().mockResolvedValue(data),
    toJSON: () => data,
    get: (key?: string) => (key ? (data as any)[key] : data),
    dataValues: data,
  };
}
