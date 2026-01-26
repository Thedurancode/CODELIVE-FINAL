import { Request, Response } from 'express';
import Property from '../models/Property';
import HedgeFundBuyBoxModel from '../models/HedgeFundBuyBox';
import InvestorAction from '../models/InvestorAction';
import {
  BuyBoxMatchRequest,
  BuyBoxMatchResponse,
  BuyBoxMatch,
  MatchType,
  AIAgentResponse,
  PredictedEngagement
} from '../types/ai-agents';
import { HardRequirements, ScoringWeights } from '../types';
import behaviorLearningService from '../services/BehaviorLearningService';
import { probabilityService } from '../services/ProbabilityService';

/**
 * AI-Powered Buy Box Matching Agent
 *
 * This controller implements intelligent property-to-fund matching:
 * - Scores properties against hedge fund buy box criteria
 * - Uses weighted scoring algorithm with configurable hard requirements
 * - Provides match explanations and recommendations
 * - Supports automated submission workflows
 */

// =====================================================
// Hard Requirements Checker
// =====================================================

interface HardRequirementResult {
  passed: boolean;
  failedRequirement?: string;
  reason?: string;
}

/**
 * Check all hard requirements before scoring.
 * If any hard requirement fails, the property is excluded entirely.
 */
function checkHardRequirements(
  property: any,
  criteria: any,
  hardReqs: HardRequirements
): HardRequirementResult {
  // State is always a hard requirement by default
  const stateIsHard = hardReqs.state !== false;
  if (stateIsHard && criteria.states?.length > 0) {
    if (!criteria.states.includes(property.state)) {
      return {
        passed: false,
        failedRequirement: 'state',
        reason: `Property state (${property.state}) not in target states [${criteria.states.join(', ')}]`
      };
    }
  }

  // Max Price hard requirement
  if (hardReqs.maxPrice && criteria.maxPrice) {
    const price = property.purchaseContractPrice || property.reservePrice || 0;
    if (price > criteria.maxPrice) {
      return {
        passed: false,
        failedRequirement: 'maxPrice',
        reason: `Price $${price.toLocaleString()} exceeds max budget $${criteria.maxPrice.toLocaleString()}`
      };
    }
  }

  // Min Price hard requirement
  if (hardReqs.minPrice && criteria.minPrice) {
    const price = property.purchaseContractPrice || property.reservePrice || 0;
    if (price < criteria.minPrice) {
      return {
        passed: false,
        failedRequirement: 'minPrice',
        reason: `Price $${price.toLocaleString()} below min budget $${criteria.minPrice.toLocaleString()}`
      };
    }
  }

  // Property Type hard requirement
  if (hardReqs.propertyType && criteria.propertyTypes?.length > 0) {
    const normalizedPropertyType = property.propertyType?.toLowerCase().replace(/\s+/g, '_');
    const matchesType = criteria.propertyTypes.some(
      (t: string) => t.toLowerCase().replace(/\s+/g, '_') === normalizedPropertyType
    );
    if (!matchesType) {
      return {
        passed: false,
        failedRequirement: 'propertyType',
        reason: `Property type (${property.propertyType}) not in [${criteria.propertyTypes.join(', ')}]`
      };
    }
  }

  // Min Bedrooms hard requirement
  if (hardReqs.minBedrooms && criteria.minBedrooms) {
    if (property.bedroomCount < criteria.minBedrooms) {
      return {
        passed: false,
        failedRequirement: 'minBedrooms',
        reason: `Bedrooms (${property.bedroomCount}) below minimum (${criteria.minBedrooms})`
      };
    }
  }

  // Max Bedrooms hard requirement
  if (hardReqs.maxBedrooms && criteria.maxBedrooms) {
    if (property.bedroomCount > criteria.maxBedrooms) {
      return {
        passed: false,
        failedRequirement: 'maxBedrooms',
        reason: `Bedrooms (${property.bedroomCount}) exceeds maximum (${criteria.maxBedrooms})`
      };
    }
  }

  // Min Bathrooms hard requirement
  if (hardReqs.minBathrooms && criteria.minBathrooms) {
    if (property.bathroomCount < criteria.minBathrooms) {
      return {
        passed: false,
        failedRequirement: 'minBathrooms',
        reason: `Bathrooms (${property.bathroomCount}) below minimum (${criteria.minBathrooms})`
      };
    }
  }

  // Max Bathrooms hard requirement
  if (hardReqs.maxBathrooms && criteria.maxBathrooms) {
    if (property.bathroomCount > criteria.maxBathrooms) {
      return {
        passed: false,
        failedRequirement: 'maxBathrooms',
        reason: `Bathrooms (${property.bathroomCount}) exceeds maximum (${criteria.maxBathrooms})`
      };
    }
  }

  // Min Year Built hard requirement
  if (hardReqs.minYearBuilt && criteria.minYearBuilt) {
    if (property.yearBuilt && property.yearBuilt < criteria.minYearBuilt) {
      return {
        passed: false,
        failedRequirement: 'minYearBuilt',
        reason: `Year built (${property.yearBuilt}) below minimum (${criteria.minYearBuilt})`
      };
    }
  }

  // HOA hard requirement (if not allowed and property has HOA)
  if (hardReqs.allowHoa && criteria.allowHoa === false && property.hoa) {
    return {
      passed: false,
      failedRequirement: 'allowHoa',
      reason: 'Property has HOA but fund does not accept HOA properties'
    };
  }

  // Flood Zone hard requirement
  if (hardReqs.allowFloodZone && criteria.allowFloodZone === false && property.floodZone) {
    return {
      passed: false,
      failedRequirement: 'allowFloodZone',
      reason: 'Property is in flood zone but fund does not accept flood zone properties'
    };
  }

  // Structural Issues hard requirement
  if (hardReqs.allowStructuralIssues && criteria.allowStructuralIssues === false && property.hasStructuralIssues) {
    return {
      passed: false,
      failedRequirement: 'allowStructuralIssues',
      reason: 'Property has structural issues but fund does not accept structural issues'
    };
  }

  // Foundation Issues hard requirement
  if (hardReqs.allowFoundationIssues && criteria.allowFoundationIssues === false && property.hasFoundationIssues) {
    return {
      passed: false,
      failedRequirement: 'allowFoundationIssues',
      reason: 'Property has foundation issues but fund does not accept foundation issues'
    };
  }

  // Fire Damage hard requirement
  if (hardReqs.allowFireDamage && criteria.allowFireDamage === false && property.hasFireDamage) {
    return {
      passed: false,
      failedRequirement: 'allowFireDamage',
      reason: 'Property has fire damage but fund does not accept fire damaged properties'
    };
  }

  return { passed: true };
}

// =====================================================
// Scoring Algorithm
// =====================================================

/**
 * Advanced buy box matching algorithm with weighted scoring,
 * configurable hard requirements, and probability predictions
 */
async function calculateBuyBoxMatch(
  property: any,
  buyBox: HedgeFundBuyBoxModel
): Promise<BuyBoxMatch | null> {
  let score = 0;
  const criteria = buyBox.criteria;
  const criteriaMatched: string[] = [];
  const criteriaMissed: string[] = [];
  const reasons: string[] = [];

  // Get hard requirements (with defaults)
  const hardReqs: HardRequirements = criteria.hardRequirements || { state: true };

  // =====================================================
  // PHASE 1: Check Hard Requirements
  // =====================================================
  const hardCheck = checkHardRequirements(property, criteria, hardReqs);
  if (!hardCheck.passed) {
    // Hard requirement failed - property is excluded
    reasons.push(`✗ HARD FAIL: ${hardCheck.reason}`);
    criteriaMissed.push(hardCheck.failedRequirement!);
    return null;
  }

  // =====================================================
  // PHASE 2: Weighted Scoring for Soft Requirements
  // =====================================================

  // 1. Geographic Match (30% weight) - already passed hard check if state was hard
  if (criteria.states?.includes(property.state)) {
    score += 30;
    criteriaMatched.push('state');
    reasons.push(`✓ Property is in target state (${property.state})`);
  } else if (criteria.states && criteria.states.length > 0) {
    // State is soft requirement and didn't match
    criteriaMissed.push('state');
    reasons.push(`✗ Property state (${property.state}) not in target states [${criteria.states.join(', ')}]`);
  }

  // 2. Price Range (25% weight)
  const price = property.purchaseContractPrice || property.reservePrice || 0;
  const minPrice = criteria.minPrice || 0;
  const maxPrice = criteria.maxPrice || Infinity;

  if (price >= minPrice && price <= maxPrice) {
    score += 25;
    criteriaMatched.push('price');
    reasons.push(`✓ Price $${price.toLocaleString()} is within range ($${minPrice.toLocaleString()} - $${maxPrice.toLocaleString()})`);
  } else if (minPrice || maxPrice < Infinity) {
    // Price is outside range - if hard requirement, already failed above
    // If soft, allow 15% tolerance
    const priceDeviation = price < minPrice
      ? (minPrice - price) / minPrice
      : (price - maxPrice) / maxPrice;

    if (priceDeviation < 0.15) {
      score += 15;
      criteriaMatched.push('price_with_tolerance');
      reasons.push(`⚠ Price $${price.toLocaleString()} is within 15% tolerance of range`);
    } else {
      criteriaMissed.push('price');
      reasons.push(`✗ Price $${price.toLocaleString()} is outside acceptable range`);
    }
  }

  // 3. Bedroom Count (10% weight)
  const minBeds = criteria.minBedrooms || 0;
  const maxBeds = criteria.maxBedrooms || Infinity;

  if (property.bedroomCount >= minBeds && property.bedroomCount <= maxBeds) {
    score += 10;
    criteriaMatched.push('bedrooms');
    reasons.push(`✓ Bedrooms (${property.bedroomCount}) match criteria`);
  } else if (minBeds || maxBeds < Infinity) {
    criteriaMissed.push('bedrooms');
    reasons.push(`✗ Bedrooms (${property.bedroomCount}) outside range [${minBeds}-${maxBeds}]`);
  }

  // 4. Bathroom Count (5% weight)
  const minBaths = criteria.minBathrooms || 0;
  const maxBaths = criteria.maxBathrooms || Infinity;

  if (property.bathroomCount >= minBaths && property.bathroomCount <= maxBaths) {
    score += 5;
    criteriaMatched.push('bathrooms');
    reasons.push(`✓ Bathrooms (${property.bathroomCount}) match criteria`);
  } else if (minBaths || maxBaths < Infinity) {
    criteriaMissed.push('bathrooms');
    reasons.push(`✗ Bathrooms (${property.bathroomCount}) outside range [${minBaths}-${maxBaths}]`);
  }

  // 5. Property Type (15% weight)
  if (criteria.propertyTypes && criteria.propertyTypes.length > 0) {
    const normalizedPropertyType = property.propertyType?.toLowerCase().replace(/\s+/g, '_');
    const matchesType = criteria.propertyTypes.some(
      (t: string) => t.toLowerCase().replace(/\s+/g, '_') === normalizedPropertyType
    );

    if (matchesType) {
      score += 15;
      criteriaMatched.push('propertyType');
      reasons.push(`✓ Property type (${property.propertyType}) is in target types`);
    } else {
      criteriaMissed.push('propertyType');
      reasons.push(`✗ Property type (${property.propertyType}) not in [${criteria.propertyTypes.join(', ')}]`);
    }
  }

  // 6. Year Built (10% weight)
  const minYearBuilt = criteria.minYearBuilt || 0;
  if (property.yearBuilt && property.yearBuilt >= minYearBuilt) {
    score += 10;
    criteriaMatched.push('yearBuilt');
    reasons.push(`✓ Year built (${property.yearBuilt}) meets minimum (${minYearBuilt})`);
  } else if (property.yearBuilt && minYearBuilt) {
    criteriaMissed.push('yearBuilt');
    reasons.push(`✗ Year built (${property.yearBuilt}) below minimum (${minYearBuilt})`);
  }

  // 7. HOA preference (5% weight)
  if (criteria.allowHoa !== undefined) {
    if (!criteria.allowHoa && !property.hoa) {
      score += 5;
      criteriaMatched.push('noHOA');
      reasons.push('✓ No HOA as preferred');
    } else if (!criteria.allowHoa && property.hoa) {
      criteriaMissed.push('noHOA');
      reasons.push('✗ Property has HOA (fund prefers no HOA)');
    } else if (criteria.allowHoa) {
      score += 2;
      criteriaMatched.push('hoa_acceptable');
    }
  }

  // 8. Occupancy preference
  if (criteria.occupancyStatuses && criteria.occupancyStatuses.length > 0) {
    const isVacant = property.occupancyStatus === 'Vacant';
    const prefersVacant = criteria.occupancyStatuses.includes('vacant_only') ||
                          criteria.occupancyStatuses.includes('vacant_preferred');

    if (prefersVacant && isVacant) {
      score += 5;
      criteriaMatched.push('vacant');
      reasons.push('✓ Property is vacant as preferred');
    } else if (prefersVacant && !isVacant) {
      reasons.push(`⚠ Property is ${property.occupancyStatus} (fund prefers vacant)`);
    }
  }

  // Determine match type
  let matchType: MatchType;
  if (score >= 80) {
    matchType = 'strong';
  } else if (score >= 60) {
    matchType = 'moderate';
  } else {
    matchType = 'weak';
  }

  // Calculate probability predictions (Twitter-inspired)
  const propertyPrice = property.purchaseContractPrice || property.reservePrice || 0;
  const propertyFeatures = {
    state: property.state,
    county: property.county,
    price: propertyPrice,
    pricePerSqft: property.livingSpaceSqFt ? propertyPrice / property.livingSpaceSqFt : undefined,
    propertyType: property.propertyType,
    bedrooms: property.bedroomCount,
    bathrooms: property.bathroomCount,
    yearBuilt: property.yearBuilt,
    sqft: property.livingSpaceSqFt,
    hasHoa: property.hoa || false,
    isVacant: property.occupancyStatus === 'Vacant',
    daysOnMarket: property.daysOnMarket,
    arvSpread: property.arv && propertyPrice
      ? (property.arv - propertyPrice) / property.arv
      : undefined,
    capRate: property.capRate,
    inFloodZone: property.floodZone || false,
    hasStructuralIssues: property.hasStructuralIssues || false,
    hasSeptic: property.septic || false,
    hasWell: property.well || false,
  };

  const buyBoxCriteria = {
    states: criteria.states,
    counties: criteria.counties,
    minPrice: criteria.minPrice,
    maxPrice: criteria.maxPrice,
    propertyTypes: criteria.propertyTypes,
    minBedrooms: criteria.minBedrooms,
    maxBedrooms: criteria.maxBedrooms,
    minBathrooms: criteria.minBathrooms,
    maxBathrooms: criteria.maxBathrooms,
    minYearBuilt: criteria.minYearBuilt,
    minSqft: criteria.minLivingSpaceSqFt,
    maxSqft: criteria.maxLivingSpaceSqFt,
    noHoa: !criteria.allowHoa,
    preferVacant: criteria.occupancyStatuses?.includes('vacant_preferred'),
    maxDaysOnMarket: criteria.maxDaysOnMarket,
    minArvSpread: criteria.minArvSpread,
    minCapRate: criteria.minCapRate,
  };

  // Get engagement probabilities
  let engagement: PredictedEngagement | undefined;
  try {
    engagement = await probabilityService.calculateEngagement(
      propertyFeatures,
      buyBoxCriteria,
      buyBox.id,
      score
    );
  } catch (error) {
    console.error('Error calculating engagement probabilities:', error);
    // Continue without probabilities if calculation fails
  }

  return {
    fundId: parseInt(buyBox.id) || 0,
    fundName: buyBox.fundName || buyBox.name,
    score,
    matchType,
    reasons,
    criteriaMatched,
    criteriaMissed,
    engagement
  };
}

// =====================================================
// Controller Functions
// =====================================================

/**
 * POST /api/ai/buybox/match/:propertyId
 * Match property to all active buy boxes
 */
export const matchPropertyToBuyBoxes = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { propertyId } = req.params;
    const { minScore = 50 }: BuyBoxMatchRequest = req.body;

    // Fetch property
    const property = await Property.findByPk(propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    // Get all active buy boxes from database
    const buyBoxes = await HedgeFundBuyBoxModel.findAll({
      where: { enabled: true },
      order: [['priority', 'ASC']]
    });

    if (buyBoxes.length === 0) {
      return res.json({
        success: true,
        data: {
          propertyId: parseInt(propertyId),
          propertyAddress: `${property.city}, ${property.state}`,
          matches: [],
          strongMatches: [],
          autoSubmitRecommendation: [],
          totalMatches: 0
        },
        message: 'No active buy boxes configured. Add hedge fund buy boxes to enable matching.',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    // Calculate matches (now with probability predictions)
    const allMatches: BuyBoxMatch[] = [];

    // Process all buy boxes in parallel for better performance
    const matchPromises = buyBoxes.map(buyBox => calculateBuyBoxMatch(property, buyBox));
    const matchResults = await Promise.all(matchPromises);

    for (const match of matchResults) {
      if (match && match.score >= minScore) {
        allMatches.push(match);
      }
    }

    // Sort by score descending
    allMatches.sort((a, b) => b.score - a.score);

    // Separate strong matches
    const strongMatches = allMatches.filter(m => m.matchType === 'strong');

    // Auto-submit recommendation (strong matches only)
    const autoSubmitRecommendation = strongMatches.map(m => m.fundId);

    // Build property address string
    const propertyAddress = property.address
      ? `${property.address.houseNumber} ${property.address.street}, ${property.city}, ${property.state}`
      : `${property.city}, ${property.state}`;

    const response: BuyBoxMatchResponse = {
      propertyId: parseInt(propertyId),
      propertyAddress,
      matches: allMatches,
      strongMatches,
      autoSubmitRecommendation,
      totalMatches: allMatches.length
    };

    const apiResponse: AIAgentResponse<BuyBoxMatchResponse> = {
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    };

    res.json(apiResponse);

  } catch (error) {
    console.error('Error matching property to buy boxes:', error);

    const apiResponse: AIAgentResponse<BuyBoxMatchResponse> = {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    };

    res.status(500).json(apiResponse);
  }
};

/**
 * GET /api/ai/buybox/list
 * Get all active buy boxes
 */
export const getAllBuyBoxes = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const buyBoxes = await HedgeFundBuyBoxModel.findAll({
      where: { enabled: true },
      order: [['priority', 'ASC']]
    });

    // Transform to API format
    const formattedBuyBoxes = buyBoxes.map(bb => ({
      id: bb.id,
      fund_name: bb.fundName || bb.name,
      fund_type: bb.fundType,
      criteria: bb.criteria,
      contact_email: bb.contactEmail,
      contact_phone: bb.contactPhone,
      active: bb.enabled,
      priority: bb.priority,
      autoSubmit: bb.autoSubmit,
      autoSubmitThreshold: bb.autoSubmitThreshold
    }));

    res.json({
      success: true,
      data: formattedBuyBoxes,
      count: formattedBuyBoxes.length,
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error fetching buy boxes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });
  }
};

/**
 * POST /api/ai/buybox/create
 * Create new buy box
 */
export const createBuyBox = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const buyBoxData = req.body;

    // Validate required fields
    if (!buyBoxData.fund_name || !buyBoxData.criteria) {
      return res.status(400).json({
        success: false,
        error: 'fund_name and criteria are required',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    // Create in database
    const newBuyBox = await HedgeFundBuyBoxModel.create({
      name: buyBoxData.fund_name,
      fundName: buyBoxData.fund_name,
      fundType: buyBoxData.fund_type,
      description: buyBoxData.description,
      criteria: buyBoxData.criteria,
      scoringWeights: buyBoxData.scoring_weights || {
        geographic: 25,
        price: 20,
        propertyType: 10,
        bedrooms: 5,
        bathrooms: 5,
        yearBuilt: 5,
        occupancy: 5,
        hoa: 5,
        photos: 5,
        condition: 5,
        riskFactors: 5,
        strategyMetrics: 5,
        custom: 0
      },
      contactEmail: buyBoxData.contact_email,
      contactPhone: buyBoxData.contact_phone,
      enabled: buyBoxData.active !== false,
      priority: buyBoxData.priority || 1,
      autoSubmit: buyBoxData.auto_submit || false,
      autoSubmitThreshold: buyBoxData.auto_submit_threshold || 80
    });

    res.status(201).json({
      success: true,
      data: {
        id: newBuyBox.id,
        fund_name: newBuyBox.fundName,
        fund_type: newBuyBox.fundType,
        criteria: newBuyBox.criteria,
        contact_email: newBuyBox.contactEmail,
        active: newBuyBox.enabled,
        priority: newBuyBox.priority,
        created_at: newBuyBox.createdAt
      },
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error creating buy box:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });
  }
};

/**
 * PUT /api/ai/buybox/:id
 * Update buy box
 */
export const updateBuyBox = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { id } = req.params;
    const updates = req.body;

    const buyBox = await HedgeFundBuyBoxModel.findByPk(id);

    if (!buyBox) {
      return res.status(404).json({
        success: false,
        error: 'Buy box not found',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    // Map API fields to model fields
    const updateData: any = {};
    if (updates.fund_name !== undefined) {
      updateData.name = updates.fund_name;
      updateData.fundName = updates.fund_name;
    }
    if (updates.fund_type !== undefined) updateData.fundType = updates.fund_type;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.criteria !== undefined) updateData.criteria = updates.criteria;
    if (updates.scoring_weights !== undefined) updateData.scoringWeights = updates.scoring_weights;
    if (updates.contact_email !== undefined) updateData.contactEmail = updates.contact_email;
    if (updates.contact_phone !== undefined) updateData.contactPhone = updates.contact_phone;
    if (updates.active !== undefined) updateData.enabled = updates.active;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.auto_submit !== undefined) updateData.autoSubmit = updates.auto_submit;
    if (updates.auto_submit_threshold !== undefined) updateData.autoSubmitThreshold = updates.auto_submit_threshold;

    await buyBox.update(updateData);

    res.json({
      success: true,
      message: 'Buy box updated successfully',
      data: {
        id: buyBox.id,
        fund_name: buyBox.fundName,
        updated_at: buyBox.updatedAt
      },
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error updating buy box:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });
  }
};

/**
 * DELETE /api/ai/buybox/:id
 * Deactivate buy box (soft delete)
 */
export const deactivateBuyBox = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { id } = req.params;

    const buyBox = await HedgeFundBuyBoxModel.findByPk(id);

    if (!buyBox) {
      return res.status(404).json({
        success: false,
        error: 'Buy box not found',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    await buyBox.update({ enabled: false });

    res.json({
      success: true,
      message: 'Buy box deactivated successfully',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error deactivating buy box:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });
  }
};

// =====================================================
// Behavior Learning Endpoints
// =====================================================

/**
 * POST /api/ai/buybox/action
 * Record an investor action on a property
 */
export const recordInvestorAction = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const {
      investorId,
      investorType = 'fund',
      buyBoxId,
      propertyId,
      action,
      source,
      notes,
      metadata,
    } = req.body;

    // Validate required fields
    if (!investorId || !buyBoxId || !propertyId || !action) {
      return res.status(400).json({
        success: false,
        error: 'investorId, buyBoxId, propertyId, and action are required',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    // Validate action type
    const validActions = [
      'viewed', 'saved', 'requested_info', 'bid', 'offer_accepted',
      'closed', 'passed', 'rejected', 'expired', 'lost_to_competitor'
    ];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    // Fetch property and buy box
    const [property, buyBox] = await Promise.all([
      Property.findByPk(propertyId),
      HedgeFundBuyBoxModel.findByPk(buyBoxId),
    ]);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    if (!buyBox) {
      return res.status(404).json({
        success: false,
        error: 'Buy box not found',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    // Calculate match score
    const match = await calculateBuyBoxMatch(property, buyBox);
    const matchScore = match?.score || 0;

    // Create property snapshot
    const propertySnapshot = {
      state: property.state,
      price: property.purchaseContractPrice || property.reservePrice || 0,
      propertyType: property.propertyType,
      bedrooms: property.bedroomCount,
      bathrooms: property.bathroomCount,
      sqft: property.livingSpaceSqFt || 0,
      yearBuilt: property.yearBuilt || 0,
      hasHoa: property.hoa || false,
      hasPool: property.pool || false,
      hasSeptic: property.septic || false,
      hasWell: property.well || false,
      inFloodZone: false, // Would need to be enriched
      hasStructuralIssues: false,
      occupancyStatus: property.occupancyStatus,
      daysOnMarket: 0, // Would need to calculate
      pricePerSqft: property.livingSpaceSqFt
        ? (property.purchaseContractPrice || property.reservePrice || 0) / property.livingSpaceSqFt
        : 0,
      matchScore,
    };

    // Create buy box snapshot
    const buyBoxSnapshot = {
      states: buyBox.criteria.states || [],
      minPrice: buyBox.criteria.minPrice || 0,
      maxPrice: buyBox.criteria.maxPrice || 10000000,
      propertyTypes: buyBox.criteria.propertyTypes || [],
      minBedrooms: buyBox.criteria.minBedrooms || 0,
      maxBedrooms: buyBox.criteria.maxBedrooms || 10,
      investmentStrategies: buyBox.criteria.investmentStrategies || [],
    };

    // Record the action
    const investorAction = await behaviorLearningService.recordAction(
      investorId,
      investorType,
      buyBoxId,
      propertyId,
      action,
      propertySnapshot,
      buyBoxSnapshot,
      { source, notes, metadata }
    );

    res.status(201).json({
      success: true,
      message: `Action "${action}" recorded successfully`,
      data: {
        id: investorAction.id,
        action: investorAction.action,
        outcome: investorAction.outcome,
        propertyId,
        buyBoxId,
        matchScore,
      },
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error recording investor action:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });
  }
};

/**
 * GET /api/ai/buybox/:id/insights
 * Get learning insights for a buy box
 */
export const getBuyBoxInsights = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { id } = req.params;

    const insights = await behaviorLearningService.getInsights(id);

    if (!insights) {
      return res.status(404).json({
        success: false,
        error: 'Buy box not found or no insights available',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    res.json({
      success: true,
      data: insights,
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error fetching buy box insights:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });
  }
};

/**
 * POST /api/ai/buybox/:id/learn
 * Trigger learning and optionally apply learned weights
 */
export const learnAndApplyWeights = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { id } = req.params;
    const { apply = false } = req.body;

    // Learn weights
    const learned = await behaviorLearningService.learnWeightsForBuyBox(id);

    if (!learned) {
      return res.status(400).json({
        success: false,
        error: 'Not enough data to learn weights. Need at least 10 actions with both positive and negative outcomes.',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    // Optionally apply the learned weights
    let applied = false;
    if (apply) {
      applied = await behaviorLearningService.applyLearnedWeights(id);
    }

    res.json({
      success: true,
      message: applied
        ? 'Weights learned and applied successfully'
        : 'Weights learned. Set apply=true to apply them.',
      data: {
        buyBoxId: id,
        learnedWeights: learned.weights,
        featureImportance: learned.featureImportance,
        sampleSize: learned.sampleSize,
        accuracy: Math.round(learned.accuracy * 100) + '%',
        applied,
      },
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error learning weights:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });
  }
};

/**
 * GET /api/ai/buybox/:id/actions
 * Get recent actions for a buy box
 */
export const getBuyBoxActions = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { id } = req.params;
    const { limit = 50, offset = 0, action, outcome } = req.query;

    const where: any = { buyBoxId: id };
    if (action) where.action = action;
    if (outcome) where.outcome = outcome;

    const actions = await InvestorAction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(Number(limit) || 50, 100),
      offset: Number(offset) || 0,
    });

    // Aggregate stats
    const stats = {
      total: actions.count,
      byAction: {} as Record<string, number>,
      byOutcome: {} as Record<string, number>,
    };

    for (const a of actions.rows) {
      stats.byAction[a.action] = (stats.byAction[a.action] || 0) + 1;
      stats.byOutcome[a.outcome] = (stats.byOutcome[a.outcome] || 0) + 1;
    }

    res.json({
      success: true,
      data: {
        actions: actions.rows.map(a => ({
          id: a.id,
          action: a.action,
          outcome: a.outcome,
          propertyId: a.propertyId,
          matchScore: a.propertySnapshot.matchScore,
          price: a.propertySnapshot.price,
          propertyType: a.propertySnapshot.propertyType,
          createdAt: a.createdAt,
        })),
        stats,
        pagination: {
          total: actions.count,
          limit: Number(limit),
          offset: Number(offset),
        },
      },
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });
  }
};
