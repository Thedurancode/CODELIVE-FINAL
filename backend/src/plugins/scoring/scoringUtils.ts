/**
 * Scoring Utilities
 *
 * Reusable helper functions for scoring calculations.
 * Eliminates code duplication across scoring methods.
 */

import { ScoreBreakdown } from '../types';

// =============================================================================
// TYPES
// =============================================================================

export interface RangeMatchOptions {
  /** Points to award when value is unknown/undefined */
  undefinedPoints?: number;
  /** Allow values outside range by this tolerance (e.g., 1 means allow ±1) */
  tolerance?: number;
  /** Partial points for being close to range (0-1, e.g., 0.5 = 50%) */
  closeRangePoints?: number;
  /** Custom formatter for the value in details */
  formatValue?: (value: number) => string;
  /** Custom formatter for range in details */
  formatRange?: (min: number, max: number) => string;
}

export interface BooleanMatchOptions {
  /** Points to award when value matches preference */
  matchPoints?: number;
  /** Points to award when value doesn't match but is allowed */
  partialPoints?: number;
  /** Points to award when value doesn't match and isn't allowed */
  noMatchPoints?: number;
}

export interface ListMatchOptions {
  /** Points for exact match */
  exactMatchPoints?: number;
  /** Points for partial/fuzzy match */
  partialMatchPoints?: number;
  /** Points when no restriction is set */
  noRestrictionPoints?: number;
  /** Case-insensitive matching */
  caseInsensitive?: boolean;
}

// =============================================================================
// RANGE MATCHING (Numbers within min/max)
// =============================================================================

/**
 * Score a numeric value against a range (min/max)
 * Used for: bedrooms, bathrooms, sqft, year built, price, etc.
 */
export function scoreRangeMatch(
  criterionName: string,
  value: number | undefined,
  min: number | undefined,
  max: number | undefined,
  maxPoints: number,
  options: RangeMatchOptions = {}
): ScoreBreakdown {
  const {
    undefinedPoints = 0.5,
    tolerance = 0,
    closeRangePoints = 0.5,
    formatValue = (v) => v.toString(),
    formatRange = (minV, maxV) => `${minV}-${maxV}`,
  } = options;

  const details: string[] = [];
  let earned = 0;

  // Handle undefined value
  if (value === undefined || value === null) {
    earned = maxPoints * undefinedPoints;
    details.push(`${criterionName} unknown`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  // No restrictions
  if (min === undefined && max === undefined) {
    earned = maxPoints;
    details.push(`No ${criterionName.toLowerCase()} restrictions`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  const effectiveMin = min ?? -Infinity;
  const effectiveMax = max ?? Infinity;

  // Value within range
  if (value >= effectiveMin && value <= effectiveMax) {
    earned = maxPoints;
    details.push(`${formatValue(value)} within range`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  // Value within tolerance
  if (tolerance > 0) {
    const withinTolerance =
      (value >= effectiveMin - tolerance && value < effectiveMin) ||
      (value <= effectiveMax + tolerance && value > effectiveMax);

    if (withinTolerance) {
      earned = maxPoints * closeRangePoints;
      details.push(`${formatValue(value)} close to range ${formatRange(effectiveMin, effectiveMax)}`);
      return createBreakdown(criterionName, maxPoints, earned, details);
    }
  }

  // Value outside range
  if (value < effectiveMin) {
    details.push(`${formatValue(value)} below minimum ${formatValue(effectiveMin)}`);
  } else {
    details.push(`${formatValue(value)} above maximum ${formatValue(effectiveMax)}`);
  }

  return createBreakdown(criterionName, maxPoints, earned, details);
}

// =============================================================================
// BOOLEAN PREFERENCE MATCHING
// =============================================================================

/**
 * Score a boolean value against a preference
 * Used for: allowHoa, allowPool, allowSeptic, etc.
 */
export function scoreBooleanMatch(
  criterionName: string,
  hasFeature: boolean | undefined,
  isAllowed: boolean | undefined,
  isPreferred: boolean | undefined,
  maxPoints: number,
  options: BooleanMatchOptions = {}
): ScoreBreakdown {
  const {
    matchPoints = 1.0,
    partialPoints = 0.7,
    noMatchPoints = 0,
  } = options;

  const details: string[] = [];
  let earned = 0;

  // Feature not allowed and property has it
  if (isAllowed === false && hasFeature) {
    earned = maxPoints * noMatchPoints;
    details.push(`Has ${criterionName} (not allowed)`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  // No feature
  if (!hasFeature) {
    earned = maxPoints * matchPoints;
    details.push(`No ${criterionName}`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  // Has feature and it's preferred
  if (isPreferred && hasFeature) {
    earned = maxPoints * matchPoints;
    details.push(`Has ${criterionName} (preferred)`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  // Has feature and it's allowed
  if (hasFeature && isAllowed !== false) {
    earned = maxPoints * partialPoints;
    details.push(`Has ${criterionName} (allowed)`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  // Default case
  earned = maxPoints * partialPoints;
  details.push(`${criterionName}: ${hasFeature ? 'yes' : 'no'}`);
  return createBreakdown(criterionName, maxPoints, earned, details);
}

// =============================================================================
// LIST MATCHING (Value in allowed list)
// =============================================================================

/**
 * Score a value against a list of allowed values
 * Used for: states, property types, occupancy status, etc.
 */
export function scoreListMatch(
  criterionName: string,
  value: string | undefined,
  allowedValues: string[] | undefined,
  excludedValues: string[] | undefined,
  maxPoints: number,
  options: ListMatchOptions = {}
): ScoreBreakdown {
  const {
    exactMatchPoints = 1.0,
    partialMatchPoints = 0.8,
    noRestrictionPoints = 1.0,
    caseInsensitive = true,
  } = options;

  const details: string[] = [];
  let earned = 0;

  const normalize = (s: string) => caseInsensitive ? s.toLowerCase().trim() : s.trim();
  const normalizedValue = value ? normalize(value) : undefined;

  // Check exclusions first
  if (excludedValues && excludedValues.length > 0 && normalizedValue) {
    const normalizedExcluded = excludedValues.map(normalize);
    if (normalizedExcluded.includes(normalizedValue)) {
      earned = 0;
      details.push(`${criterionName} "${value}" is excluded`);
      return createBreakdown(criterionName, maxPoints, earned, details, false);
    }
  }

  // No allowed list restriction
  if (!allowedValues || allowedValues.length === 0) {
    earned = maxPoints * noRestrictionPoints;
    details.push(`No ${criterionName.toLowerCase()} restrictions`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  // Value not provided
  if (!normalizedValue) {
    earned = maxPoints * 0.5;
    details.push(`${criterionName} unknown`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  const normalizedAllowed = allowedValues.map(normalize);

  // Exact match
  if (normalizedAllowed.includes(normalizedValue)) {
    earned = maxPoints * exactMatchPoints;
    details.push(`${criterionName} "${value}" matches`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  // Fuzzy match (partial string match)
  const fuzzyMatch = normalizedAllowed.some(
    (allowed) => normalizedValue.includes(allowed) || allowed.includes(normalizedValue)
  );

  if (fuzzyMatch) {
    earned = maxPoints * partialMatchPoints;
    details.push(`${criterionName} "${value}" partial match`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  // No match
  details.push(`${criterionName} "${value}" not in allowed list`);
  return createBreakdown(criterionName, maxPoints, earned, details, false);
}

// =============================================================================
// PERCENTAGE SCORING
// =============================================================================

/**
 * Score based on how a value compares to a target (percentage difference)
 * Used for: price vs ARV, price vs Zestimate, etc.
 */
export function scorePercentageMatch(
  criterionName: string,
  actualValue: number | undefined,
  targetValue: number | undefined,
  maxPoints: number,
  thresholds: {
    excellent: number;  // e.g., 0.70 = 30% below target
    good: number;       // e.g., 0.80 = 20% below target
    fair: number;       // e.g., 0.90 = 10% below target
    poor: number;       // e.g., 1.00 = at target
  }
): ScoreBreakdown {
  const details: string[] = [];
  let earned = 0;

  if (!actualValue || !targetValue || targetValue === 0) {
    earned = maxPoints * 0.5;
    details.push(`${criterionName} data unavailable`);
    return createBreakdown(criterionName, maxPoints, earned, details);
  }

  const ratio = actualValue / targetValue;
  const percentDiff = Math.round((1 - ratio) * 100);

  if (ratio <= thresholds.excellent) {
    earned = maxPoints;
    details.push(`${percentDiff}% below target - Excellent`);
  } else if (ratio <= thresholds.good) {
    earned = maxPoints * 0.85;
    details.push(`${percentDiff}% below target - Good`);
  } else if (ratio <= thresholds.fair) {
    earned = maxPoints * 0.6;
    details.push(`${percentDiff}% below target - Fair`);
  } else if (ratio <= thresholds.poor) {
    earned = maxPoints * 0.3;
    details.push(`At or near target`);
  } else {
    earned = maxPoints * 0.1;
    details.push(`${Math.abs(percentDiff)}% above target`);
  }

  return createBreakdown(criterionName, maxPoints, earned, details);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create a score breakdown object
 */
function createBreakdown(
  criterion: string,
  maxPoints: number,
  earnedPoints: number,
  details: string[],
  passed?: boolean
): ScoreBreakdown {
  const earned = Math.round(earnedPoints);
  return {
    criterion,
    weight: maxPoints,
    maxPoints,
    earnedPoints: earned,
    passed: passed ?? earned >= maxPoints * 0.5,
    details: details.join('; '),
  };
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

/**
 * Format percentage for display
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Calculate percentage difference between two values
 */
export function percentDifference(actual: number, target: number): number {
  if (target === 0) return 0;
  return ((target - actual) / target) * 100;
}
