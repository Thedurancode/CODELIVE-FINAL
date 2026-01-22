/**
 * Buy Box Validation Schemas
 *
 * Zod schemas for validating buy box creation and update requests.
 * Provides type-safe validation with clear error messages.
 */

import { z } from 'zod';

// =============================================================================
// REUSABLE SCHEMA COMPONENTS
// =============================================================================

/**
 * US State codes
 */
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

/**
 * Property types
 */
const PROPERTY_TYPES = [
  'single_family', 'townhouse', 'condo', 'duplex', 'triplex',
  'fourplex', 'multi_family', 'manufactured', 'mobile_home',
  'land', 'commercial', 'mixed_use',
] as const;

/**
 * Investment strategies
 */
const INVESTMENT_STRATEGIES = [
  'fix_and_flip', 'long_term_rental', 'short_term_rental',
  'brrrr', 'wholesale', 'novation', 'subject_to',
  'seller_financing', 'lease_option',
] as const;

/**
 * Condition levels
 */
const CONDITION_LEVELS = [
  'any', 'turnkey', 'light_rehab', 'medium_rehab', 'heavy_rehab', 'full_gut',
] as const;

/**
 * Occupancy statuses
 */
const OCCUPANCY_STATUSES = [
  'vacant_only', 'vacant_preferred', 'tenant_in_place',
  'tenant_occupied_ok', 'owner_occupied', 'owner_occupied_ok', 'any',
] as const;

/**
 * Crime tolerance levels
 */
const CRIME_TOLERANCES = ['low', 'medium', 'high', 'any'] as const;

// =============================================================================
// CONTACT SCHEMA
// =============================================================================

const contactSchema = z.object({
  name: z.string().min(1, 'Contact name is required').max(100),
  email: z.string().email('Invalid email format'),
  phone: z.string().max(20).optional(),
  markets: z.array(z.string()).optional(),
});

// =============================================================================
// ZIPCODE SCHEMA (supports both string and object formats)
// =============================================================================

const zipcodeEntrySchema = z.union([
  z.string().regex(/^\d{5}$/, 'Zipcode must be 5 digits'),
  z.object({
    zipcode: z.string().regex(/^\d{5}$/, 'Zipcode must be 5 digits'),
    contact: contactSchema.optional(),
  }),
]);

// =============================================================================
// CUSTOM CRITERIA SCHEMA
// =============================================================================

const customCriterionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  text: z.string().min(1).max(200).optional(),
  enabled: z.boolean().default(true),
  weight: z.number().min(0).max(100).optional(),
}).refine(
  (data) => data.name || data.text,
  { message: 'Either name or text is required for custom criteria' }
);

// =============================================================================
// HARD REQUIREMENTS SCHEMA
// =============================================================================

const hardRequirementsSchema = z.object({
  // Geographic
  state: z.boolean().default(true),
  county: z.boolean().default(false),
  city: z.boolean().default(false),
  zipCode: z.boolean().default(false),
  // Financial
  maxPrice: z.boolean().default(false),
  minPrice: z.boolean().default(false),
  // Property characteristics
  propertyType: z.boolean().default(false),
  minBedrooms: z.boolean().default(false),
  maxBedrooms: z.boolean().default(false),
  minBathrooms: z.boolean().default(false),
  maxBathrooms: z.boolean().default(false),
  minSqft: z.boolean().default(false),
  maxSqft: z.boolean().default(false),
  minYearBuilt: z.boolean().default(false),
  maxYearBuilt: z.boolean().default(false),
  // Risk factors
  allowHoa: z.boolean().default(false),
  allowFloodZone: z.boolean().default(false),
  allowStructuralIssues: z.boolean().default(false),
  allowFoundationIssues: z.boolean().default(false),
  allowFireDamage: z.boolean().default(false),
  // Occupancy
  occupancyStatus: z.boolean().default(false),
}).partial();

// =============================================================================
// SCORING WEIGHTS SCHEMA
// =============================================================================

const scoringWeightsSchema = z.object({
  geographic: z.number().min(0).max(100).default(25),
  price: z.number().min(0).max(100).default(20),
  propertyType: z.number().min(0).max(100).default(10),
  bedrooms: z.number().min(0).max(100).default(5),
  bathrooms: z.number().min(0).max(100).default(5),
  yearBuilt: z.number().min(0).max(100).default(5),
  occupancy: z.number().min(0).max(100).default(5),
  hoa: z.number().min(0).max(100).default(5),
  photos: z.number().min(0).max(100).default(5),
  condition: z.number().min(0).max(100).default(5),
  riskFactors: z.number().min(0).max(100).default(5),
  strategyMetrics: z.number().min(0).max(100).default(5),
  custom: z.number().min(0).max(100).default(0),
  marketValue: z.number().min(0).max(100).default(10),
}).partial();

// =============================================================================
// FAST BUY BOX SCHEMA (Simple endpoint)
// =============================================================================

// Base schema without refinements (for extending)
const fastBuyBoxBaseSchema = z.object({
  // Basic info (required)
  name: z.string()
    .min(2, 'Buy box name must be at least 2 characters')
    .max(100, 'Buy box name must be less than 100 characters')
    .transform(s => s.trim()),
  contactEmail: z.string()
    .email('Valid contact email is required')
    .transform(s => s.trim().toLowerCase()),

  // Basic info (optional)
  fundName: z.string().max(100).optional().transform(s => s?.trim()),
  contactPhone: z.string().max(20).optional().transform(s => s?.trim()),
  description: z.string().max(1000).optional().transform(s => s?.trim()),

  // Geographic (required)
  states: z.array(z.string().toUpperCase())
    .min(1, 'At least one state is required')
    .refine(
      (states) => states.every(s => US_STATES.includes(s as any)),
      { message: 'Invalid state code provided' }
    ),

  // Geographic (optional)
  zipcodes: z.array(zipcodeEntrySchema).optional(),
  markets: z.array(z.string()).optional(),
  excludedStates: z.array(z.string().toUpperCase()).optional(),
  excludedMarkets: z.array(z.string()).optional(),

  // Contacts
  contacts: z.array(contactSchema).optional(),

  // Property criteria
  propertyTypes: z.array(z.string()).optional().default([]),
  minPrice: z.number().min(0).max(100000000).optional().default(0),
  maxPrice: z.number().min(0).max(100000000).optional().default(10000000),
  minBedrooms: z.number().int().min(0).max(20).optional().default(1),
  maxBedrooms: z.number().int().min(0).max(20).optional().default(10),
  minBathrooms: z.number().min(0).max(20).optional().default(1),
  maxBathrooms: z.number().min(0).max(20).optional().default(10),
  minYearBuilt: z.number().int().min(1800).max(2100).optional().default(1900),
  maxYearBuilt: z.number().int().min(1800).max(2100).optional(),
  minSqft: z.number().min(0).max(100000).optional().default(500),
  maxSqft: z.number().min(0).max(100000).optional().default(10000),

  // Investment strategy
  investmentStrategies: z.array(z.string()).optional(),
  conditionLevels: z.array(z.string()).optional(),
  occupancyStatuses: z.array(z.string()).optional(),

  // Risk tolerance - Property Features (all OFF by default)
  allowHoa: z.boolean().optional().default(false),
  allowPool: z.boolean().optional().default(false),
  allowSolarPanels: z.boolean().optional().default(false),
  allowSeptic: z.boolean().optional().default(false),
  allowWell: z.boolean().optional().default(false),
  allowMainRoad: z.boolean().optional().default(false),
  maxHoaMonthly: z.number().min(0).max(10000).optional().default(500),

  // Risk tolerance - Property Issues (all OFF by default)
  allowFloodZone: z.boolean().optional().default(false),
  allowFoundationIssues: z.boolean().optional().default(false),
  allowStructuralIssues: z.boolean().optional().default(false),
  allowFireDamage: z.boolean().optional().default(false),
  allowCodeViolations: z.boolean().optional().default(false),
  allowOpenPermits: z.boolean().optional().default(false),
  allowLiensIfCurable: z.boolean().optional().default(false),

  // Risk tolerance - Community (all OFF by default)
  allowLeasingRestrictions: z.boolean().optional().default(false),
  allowAgeRestrictions: z.boolean().optional().default(false),
  crimeTolerance: z.enum(CRIME_TOLERANCES).optional().default('medium'),

  // Custom criteria
  customCriteria: z.array(customCriterionSchema).optional(),

  // Hard requirements
  hardRequirements: hardRequirementsSchema.optional(),

  // Scoring
  autoSubmit: z.boolean().optional().default(false),
  autoSubmitThreshold: z.number().min(0).max(100).optional().default(75),

  // === ADVANCED OPTIONS ===

  // Lot size
  minLotSizeSqft: z.number().min(0).optional().default(0),
  maxLotSizeSqft: z.number().min(0).optional().default(0),

  // Rehab preferences
  minRehabBudget: z.number().min(0).optional().default(0),
  maxRehabBudget: z.number().min(0).optional().default(0),

  // Deal source preference
  dealSourcePreference: z.enum(['mls_only', 'off_market_only', 'both']).optional().default('both'),

  // === STRATEGY-SPECIFIC: Fix & Flip ===
  flipMinBelowArvPercent: z.number().min(0).max(100).optional().default(0),
  flipMinExpectedProfit: z.number().min(0).optional().default(0),
  flipMaxClosingDays: z.number().int().min(0).optional().default(0),

  // === STRATEGY-SPECIFIC: Long-Term Rental ===
  rentalMinHoldYears: z.number().int().min(0).optional().default(0),
  rentalMinMonthlyRent: z.number().min(0).optional().default(0),
  rentalMaxMonthlyRent: z.number().min(0).optional().default(0),
  rentalMinRentToPrice: z.number().min(0).max(100).optional().default(0),
  rentalMinCapRate: z.number().min(0).max(100).optional().default(0),
  rentalMinCashOnCash: z.number().min(0).max(100).optional().default(0),
  rentalAllowBelowMarket: z.boolean().optional().default(false),
  rentalLeaseTypes: z.array(z.string()).optional().default([]),

  // === ZESTIMATE ===
  maxPercentBelowZestimate: z.number().min(0).max(100).optional().default(0),

  // === NOTIFICATION SETTINGS ===
  matchStrictness: z.enum(['strict', 'flexible']).optional().default('flexible'),
  deliveryFrequency: z.enum(['realtime', 'daily', 'weekly']).optional().default('realtime'),
});

// Export fastBuyBoxSchema with refinements
export const fastBuyBoxSchema = fastBuyBoxBaseSchema.refine(
  (data) => !data.maxPrice || !data.minPrice || data.maxPrice >= data.minPrice,
  { message: 'maxPrice must be greater than or equal to minPrice', path: ['maxPrice'] }
).refine(
  (data) => !data.maxBedrooms || !data.minBedrooms || data.maxBedrooms >= data.minBedrooms,
  { message: 'maxBedrooms must be greater than or equal to minBedrooms', path: ['maxBedrooms'] }
).refine(
  (data) => !data.maxSqft || !data.minSqft || data.maxSqft >= data.minSqft,
  { message: 'maxSqft must be greater than or equal to minSqft', path: ['maxSqft'] }
);

// =============================================================================
// DETAILED BUY BOX SCHEMA (Comprehensive endpoint)
// =============================================================================

// Extend the base schema (without refinements) and add more fields
export const detailedBuyBoxSchema = fastBuyBoxBaseSchema.extend({
  // Extended geographic
  counties: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  excludeStates: z.array(z.string().toUpperCase()).optional(),
  excludeCounties: z.array(z.string()).optional(),
  excludeCities: z.array(z.string()).optional(),
  excludeZipcodes: z.array(z.string()).optional(),
  msaMetroAreas: z.array(z.string()).optional(),
  excludeMsaMetroAreas: z.array(z.string()).optional(),
  radiusCenterZip: z.string().regex(/^\d{5}$/).optional(),
  radiusMiles: z.number().min(1).max(500).optional(),

  // Extended property characteristics
  minLotSizeSqft: z.number().min(0).optional(),
  maxLotSizeSqft: z.number().min(0).optional(),
  minLotSizeAcres: z.number().min(0).optional(),
  maxLotSizeAcres: z.number().min(0).optional(),
  minStories: z.number().int().min(1).max(10).optional(),
  maxStories: z.number().int().min(1).max(10).optional(),
  minUnits: z.number().int().min(1).optional(),
  maxUnits: z.number().int().min(1).optional(),
  minGarages: z.number().int().min(0).optional(),
  maxGarages: z.number().int().min(0).optional(),
  maxPropertyAge: z.number().int().min(0).optional(),

  // Property systems
  maxRoofAge: z.number().int().min(0).max(100).optional(),
  roofTypes: z.array(z.string()).optional(),
  allowRoofIssues: z.boolean().optional(),
  maxHvacAge: z.number().int().min(0).max(100).optional(),
  hvacTypes: z.array(z.string()).optional(),
  requireCentralAir: z.boolean().optional(),
  requireCentralHeat: z.boolean().optional(),
  allowNoAc: z.boolean().optional(),
  allowNoHeat: z.boolean().optional(),

  // Financial criteria
  minArv: z.number().min(0).optional(),
  maxArv: z.number().min(0).optional(),
  minEquityPercent: z.number().min(0).max(100).optional(),
  maxEquityPercent: z.number().min(0).max(100).optional(),
  maxPercentOfArv: z.number().min(0).max(100).optional(),
  minGrossMargin: z.number().optional(),
  minGrossMarginPercent: z.number().min(0).max(100).optional(),
  minGrossYield: z.number().min(0).max(100).optional(),
  minNetYield: z.number().min(0).max(100).optional(),
  minRentToPrice: z.number().min(0).max(1).optional(),
  minDaysOnMarket: z.number().int().min(0).optional(),
  maxDaysOnMarket: z.number().int().min(0).optional(),
  minPricePerSqft: z.number().min(0).optional(),
  maxPricePerSqft: z.number().min(0).optional(),

  // Rehab
  minRehabBudget: z.number().min(0).optional(),
  maxRehabBudget: z.number().min(0).optional(),

  // Additional risk tolerances
  allowMold: z.boolean().optional(),
  allowAsbestos: z.boolean().optional(),
  allowLeadPaint: z.boolean().optional(),
  allowTermiteDamage: z.boolean().optional(),
  allowWaterDamage: z.boolean().optional(),
  allowRoofDamage: z.boolean().optional(),
  allowEnvironmentalIssues: z.boolean().optional(),
  allowDemolitionRequired: z.boolean().optional(),

  // Custom scoring weights
  scoringWeights: scoringWeightsSchema.optional(),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type FastBuyBoxInput = z.infer<typeof fastBuyBoxSchema>;
export type DetailedBuyBoxInput = z.infer<typeof detailedBuyBoxSchema>;
export type HardRequirements = z.infer<typeof hardRequirementsSchema>;
export type ScoringWeights = z.infer<typeof scoringWeightsSchema>;
export type Contact = z.infer<typeof contactSchema>;

// =============================================================================
// VALIDATION HELPER
// =============================================================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Validate input against a schema and return formatted errors
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));

  return { success: false, errors };
}

/**
 * Express middleware for validating request body
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    const result = validateInput(schema, req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.errors,
      });
    }

    // Replace body with validated/transformed data
    req.body = result.data;
    next();
  };
}
