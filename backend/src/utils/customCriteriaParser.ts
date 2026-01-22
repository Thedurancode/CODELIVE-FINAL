/**
 * Custom Criteria Parser
 *
 * Parses free-text custom criteria from Fast Buy Box into structured
 * criteria that the ScoringEngine can evaluate against deals.
 */

export type CriterionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'regex'
  | 'exists'
  | 'not_exists';

export interface ParsedCriterion {
  name: string;
  field: string;
  operator: CriterionOperator;
  value: any;
  weight: number;
  isNegative: boolean; // true if "no", "avoid", "exclude" was detected
  confidence: number; // 0-100, how confident we are in the parsing
}

// Keywords that indicate negative/exclusion
const NEGATIVE_KEYWORDS = [
  'no',
  'not',
  'avoid',
  'exclude',
  'without',
  'never',
  "don't",
  'dont',
  "doesn't",
  'doesnt',
  'reject',
  'refuse',
  'prohibit',
  'ban',
  'disallow',
];

// Keywords that indicate positive/requirement
const POSITIVE_KEYWORDS = [
  'must',
  'require',
  'need',
  'want',
  'prefer',
  'only',
  'has',
  'have',
  'with',
  'include',
  'yes',
  'allow',
  'accept',
];

// Field mappings: keyword patterns → deal property paths
const FIELD_MAPPINGS: Array<{
  patterns: RegExp[];
  field: string;
  type: 'boolean' | 'number' | 'string' | 'exists';
  defaultPositiveValue?: any;
  defaultNegativeValue?: any;
}> = [
  // Property features
  {
    patterns: [/pool/i, /swimming/i],
    field: 'rawData.pool',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/solar/i, /panels?/i],
    field: 'rawData.solar',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/septic/i],
    field: 'rawData.septic',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/well\s*(water)?/i],
    field: 'rawData.well',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/hoa/i, /homeowners?\s*association/i],
    field: 'rawData.hoa',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/garage/i],
    field: 'rawData.garage',
    type: 'exists',
  },
  {
    patterns: [/basement/i],
    field: 'rawData.basement',
    type: 'exists',
  },

  // Property issues/risks
  {
    patterns: [/foundation/i],
    field: 'rawData.hasFoundationIssues',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/structural/i, /structure/i],
    field: 'rawData.hasStructuralIssues',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/fire/i, /burn/i],
    field: 'rawData.hasFireDamage',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/flood/i, /flooding/i],
    field: 'rawData.inFloodZone',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/lien/i, /liens/i],
    field: 'rawData.hasLiens',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/permit/i, /permits/i],
    field: 'rawData.hasOpenPermits',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/code\s*violation/i, /violation/i],
    field: 'rawData.hasCodeViolations',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/mold/i],
    field: 'rawData.hasMold',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/asbestos/i],
    field: 'rawData.hasAsbestos',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/termite/i, /pest/i, /infestation/i],
    field: 'rawData.hasTermites',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/roof/i, /roofing/i],
    field: 'rawData.needsRoofRepair',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },

  // Location
  {
    patterns: [/main\s*road/i, /busy\s*street/i, /highway/i],
    field: 'rawData.onMainRoad',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/corner\s*lot/i],
    field: 'rawData.isCornerLot',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
  {
    patterns: [/cul[\s-]*de[\s-]*sac/i],
    field: 'rawData.isCulDeSac',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },

  // Occupancy
  {
    patterns: [/vacant/i, /empty/i, /unoccupied/i],
    field: 'occupancyStatus',
    type: 'string',
    defaultPositiveValue: 'vacant',
    defaultNegativeValue: 'occupied',
  },
  {
    patterns: [/tenant/i, /renter/i, /rented/i, /leased/i],
    field: 'occupancyStatus',
    type: 'string',
    defaultPositiveValue: 'tenant',
    defaultNegativeValue: 'vacant',
  },
  {
    patterns: [/owner\s*occupied/i],
    field: 'occupancyStatus',
    type: 'string',
    defaultPositiveValue: 'owner',
    defaultNegativeValue: 'vacant',
  },

  // Property type
  {
    patterns: [/single\s*family/i, /sfr/i, /sfh/i],
    field: 'propertyType',
    type: 'string',
    defaultPositiveValue: 'single_family',
  },
  {
    patterns: [/multi[\s-]*family/i, /duplex/i, /triplex/i, /quadplex/i],
    field: 'propertyType',
    type: 'string',
    defaultPositiveValue: 'multi_family',
  },
  {
    patterns: [/condo/i, /condominium/i],
    field: 'propertyType',
    type: 'string',
    defaultPositiveValue: 'condo',
  },
  {
    patterns: [/townhouse/i, /townhome/i],
    field: 'propertyType',
    type: 'string',
    defaultPositiveValue: 'townhouse',
  },
  {
    patterns: [/mobile/i, /manufactured/i, /trailer/i],
    field: 'propertyType',
    type: 'string',
    defaultPositiveValue: 'manufactured',
  },

  // Age restrictions
  {
    patterns: [/55\+/i, /senior/i, /age\s*restrict/i, /retirement/i],
    field: 'rawData.hasAgeRestrictions',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },

  // Leasing restrictions
  {
    patterns: [/leasing\s*restrict/i, /rental\s*restrict/i, /no\s*rent/i],
    field: 'rawData.hasLeasingRestrictions',
    type: 'boolean',
    defaultPositiveValue: true,
    defaultNegativeValue: false,
  },
];

/**
 * Detect if the text contains negative keywords
 */
function detectNegative(text: string): { isNegative: boolean; keyword: string | null } {
  const lowerText = text.toLowerCase();

  for (const keyword of NEGATIVE_KEYWORDS) {
    // Check for word boundary to avoid matching "know" when looking for "no"
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(lowerText)) {
      return { isNegative: true, keyword };
    }
  }

  return { isNegative: false, keyword: null };
}

/**
 * Detect if the text contains positive keywords
 */
function detectPositive(text: string): { isPositive: boolean; keyword: string | null } {
  const lowerText = text.toLowerCase();

  for (const keyword of POSITIVE_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(lowerText)) {
      return { isPositive: true, keyword };
    }
  }

  return { isPositive: false, keyword: null };
}

/**
 * Find the best matching field for the given text
 */
function findFieldMapping(
  text: string
): { field: string; type: string; defaultPositiveValue?: any; defaultNegativeValue?: any } | null {
  const lowerText = text.toLowerCase();

  for (const mapping of FIELD_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      if (pattern.test(lowerText)) {
        return mapping;
      }
    }
  }

  return null;
}

/**
 * Parse a single custom criterion text into structured format
 */
export function parseCustomCriterion(
  name: string,
  enabled: boolean,
  weight: number = 5
): ParsedCriterion | null {
  if (!name || name.trim().length < 2) {
    return null;
  }

  const trimmedName = name.trim();
  const { isNegative, keyword: negativeKeyword } = detectNegative(trimmedName);
  const { isPositive } = detectPositive(trimmedName);

  // Find matching field
  const fieldMapping = findFieldMapping(trimmedName);

  if (!fieldMapping) {
    // Can't determine what field this refers to - return a generic text search
    return {
      name: trimmedName,
      field: 'description',
      operator: enabled ? (isNegative ? 'not_contains' : 'contains') : 'contains',
      value: trimmedName.replace(new RegExp(`\\b(${NEGATIVE_KEYWORDS.join('|')})\\b`, 'gi'), '').trim(),
      weight,
      isNegative,
      confidence: 30, // Low confidence - just searching description
    };
  }

  // Determine operator and value based on:
  // 1. Whether negative keywords were detected in the text
  // 2. Whether the criterion is enabled
  // 3. The field type

  let operator: CriterionOperator;
  let value: any;
  let confidence = 80;

  if (fieldMapping.type === 'boolean') {
    // For boolean fields:
    // - "No pool" + enabled=true → pool should be false (don't want pool)
    // - "Must have pool" + enabled=true → pool should be true (want pool)
    // - If it's a "bad" thing like foundation issues:
    //   - "No foundation issues" + enabled=true → hasFoundationIssues should be false
    //   - "Foundation issues OK" + enabled=true → hasFoundationIssues can be true

    const wantFeature = enabled && !isNegative;
    const avoidFeature = enabled && isNegative;

    if (avoidFeature) {
      // User wants to AVOID this - value should be false
      operator = 'equals';
      value = fieldMapping.defaultNegativeValue ?? false;
    } else if (wantFeature) {
      // User WANTS this - value should be true
      operator = 'equals';
      value = fieldMapping.defaultPositiveValue ?? true;
    } else {
      // Not enabled - still track but don't fail on it
      operator = 'exists';
      value = null;
      confidence = 50;
    }
  } else if (fieldMapping.type === 'string') {
    if (isNegative && enabled) {
      operator = 'not_equals';
      value = fieldMapping.defaultPositiveValue;
    } else if (enabled) {
      operator = 'equals';
      value = fieldMapping.defaultPositiveValue;
    } else {
      operator = 'exists';
      value = null;
      confidence = 50;
    }
  } else if (fieldMapping.type === 'exists') {
    if (isNegative && enabled) {
      operator = 'not_exists';
      value = null;
    } else if (enabled) {
      operator = 'exists';
      value = null;
    } else {
      operator = 'exists';
      value = null;
      confidence = 50;
    }
  } else {
    operator = 'exists';
    value = null;
    confidence = 40;
  }

  return {
    name: trimmedName,
    field: fieldMapping.field,
    operator,
    value,
    weight,
    isNegative,
    confidence,
  };
}

/**
 * Parse an array of custom criteria from Fast Buy Box format
 * to structured format for ScoringEngine
 */
export function parseCustomCriteria(
  criteria: Array<{ name: string; enabled: boolean }>,
  totalWeight: number = 10
): ParsedCriterion[] {
  const parsed: ParsedCriterion[] = [];

  if (!criteria || criteria.length === 0) {
    return parsed;
  }

  // Only parse enabled criteria
  const enabledCriteria = criteria.filter(c => c.enabled);

  if (enabledCriteria.length === 0) {
    return parsed;
  }

  // Distribute weight among enabled criteria
  const weightPerCriterion = totalWeight / enabledCriteria.length;

  for (const criterion of enabledCriteria) {
    const result = parseCustomCriterion(criterion.name, criterion.enabled, weightPerCriterion);
    if (result) {
      parsed.push(result);
    }
  }

  return parsed;
}

/**
 * Convert parsed criteria to the format expected by ScoringEngine
 */
export function toScoringEngineCriteria(
  parsed: ParsedCriterion[]
): Array<{ name: string; field: string; operator: CriterionOperator; value: any; weight: number }> {
  return parsed.map(p => ({
    name: p.name,
    field: p.field,
    operator: p.operator,
    value: p.value,
    weight: p.weight,
  }));
}

export default {
  parseCustomCriterion,
  parseCustomCriteria,
  toScoringEngineCriteria,
};
