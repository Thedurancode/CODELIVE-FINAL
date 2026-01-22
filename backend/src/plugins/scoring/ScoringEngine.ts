/**
 * Extensible Buy Box Scoring Engine
 *
 * A flexible scoring system that evaluates deals against buy box criteria.
 * Supports:
 * - Configurable scoring weights
 * - Custom scoring criteria
 * - Hard requirements vs soft preferences
 * - Multi-stage scoring pipelines
 * - AI-enhanced scoring (pluggable)
 */

import {
  BuyBox,
  BuyBoxCriteria,
  ScoringWeights,
  ScoringResult,
  ScoreBreakdown,
  NormalizedDeal,
  CustomCriterion,
  CriterionOperator,
  MarketContact,
} from '../types';
import HedgeFundBuyBox from '../../models/HedgeFundBuyBox';
import { marketDataService, PropertyMarketData } from '../../services/MarketDataService';
import { knowledgeService } from '../../services/knowledge/KnowledgeService';
import { redisService } from '../../services/RedisService';
import sequelize from '../../config/database';
import { scoreRangeMatch, scoreBooleanMatch, scoreListMatch } from './scoringUtils';

export interface IScoringPlugin {
  name: string;
  score(deal: NormalizedDeal, buyBox: BuyBox): Promise<ScoreBreakdown[]>;
}

export interface ScoringEngineConfig {
  defaultWeights: ScoringWeights;
  strongMatchThreshold: number;
  moderateMatchThreshold: number;
  weakMatchThreshold: number;
  plugins?: IScoringPlugin[];
}

const DEFAULT_CONFIG: ScoringEngineConfig = {
  defaultWeights: {
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
    custom: 0,
    marketValue: 10, // New: market data scoring
  },
  strongMatchThreshold: 80,
  moderateMatchThreshold: 60,
  weakMatchThreshold: 50,
};

export class ScoringEngine {
  private config: ScoringEngineConfig;
  private plugins: IScoringPlugin[] = [];
  private buyBoxes: Map<string, BuyBox> = new Map();

  constructor(config: Partial<ScoringEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.plugins) {
      this.plugins = config.plugins;
    }
  }

  // ============================================================================
  // BUY BOX MANAGEMENT (with Database Persistence)
  // ============================================================================

  /**
   * Load all buy boxes from database into memory cache
   */
  public async loadFromDatabase(): Promise<void> {
    try {
      const dbBuyBoxes = await HedgeFundBuyBox.findAll();
      this.buyBoxes.clear();
      for (const dbBuyBox of dbBuyBoxes) {
        const buyBox = dbBuyBox.toBuyBox();
        this.buyBoxes.set(buyBox.id, buyBox);
      }
      console.log(`✅ Loaded ${dbBuyBoxes.length} buy boxes from database`);
    } catch (error: any) {
      // Handle case where table doesn't exist yet
      if (error?.original?.code === '42P01') {
        console.log('⚠️ Buy box table does not exist yet, will be created on first use');
      } else {
        console.error('❌ Failed to load buy boxes from database:', error?.message || error);
      }
    }
  }

  /**
   * Register a buy box for scoring (saves to database)
   * Uses transaction to ensure atomicity between DB and cache
   */
  public async registerBuyBox(buyBox: BuyBox): Promise<void> {
    const transaction = await sequelize.transaction();

    try {
      // Save to database within transaction
      await HedgeFundBuyBox.create({
        id: buyBox.id,
        name: buyBox.name,
        description: buyBox.description,
        fundName: buyBox.fundName,
        contactEmail: buyBox.contactEmail,
        enabled: buyBox.enabled,
        priority: buyBox.priority,
        criteria: buyBox.criteria,
        scoringWeights: buyBox.scoringWeights,
        autoSubmit: buyBox.autoSubmit,
        autoSubmitThreshold: buyBox.autoSubmitThreshold,
      } as any, { transaction });

      // Update memory cache
      this.buyBoxes.set(buyBox.id, buyBox);

      // Commit transaction
      await transaction.commit();
      console.log(`✅ Registered buy box: ${buyBox.name} (${buyBox.id})`);
    } catch (error) {
      // Rollback on error and remove from cache if it was added
      await transaction.rollback();
      this.buyBoxes.delete(buyBox.id);
      throw error;
    }
  }

  /**
   * Update an existing buy box (updates database)
   * Uses transaction to ensure atomicity and cache consistency
   */
  public async updateBuyBox(buyBox: BuyBox): Promise<void> {
    const transaction = await sequelize.transaction();

    try {
      const existing = await HedgeFundBuyBox.findByPk(buyBox.id, { transaction });
      if (!existing) {
        await transaction.rollback();
        throw new Error(`Buy box not found: ${buyBox.id}`);
      }

      await existing.update({
        name: buyBox.name,
        description: buyBox.description,
        fundName: buyBox.fundName,
        contactEmail: buyBox.contactEmail,
        enabled: buyBox.enabled,
        priority: buyBox.priority,
        criteria: buyBox.criteria,
        scoringWeights: buyBox.scoringWeights,
        autoSubmit: buyBox.autoSubmit,
        autoSubmitThreshold: buyBox.autoSubmitThreshold,
      }, { transaction });

      // Commit transaction first to ensure DB consistency
      await transaction.commit();

      // Update memory cache only after successful commit
      this.buyBoxes.set(buyBox.id, { ...buyBox, updatedAt: new Date() });

      // Invalidate cached scores for this buy box (non-critical, log errors)
      try {
        await redisService.invalidateBuyBoxCache(buyBox.id);
      } catch (cacheError) {
        console.error(`Failed to invalidate Redis cache for buy box ${buyBox.id}:`, cacheError);
        // Cache will eventually be consistent, don't throw
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Remove a buy box (deletes from database)
   * Uses transaction to ensure atomicity
   */
  public async removeBuyBox(buyBoxId: string): Promise<void> {
    const transaction = await sequelize.transaction();

    try {
      await HedgeFundBuyBox.destroy({ where: { id: buyBoxId }, transaction });

      // Commit transaction first to ensure DB consistency
      await transaction.commit();

      // Update memory cache only after successful commit
      this.buyBoxes.delete(buyBoxId);

      // Invalidate cached scores for this buy box (non-critical, log errors)
      try {
        await redisService.invalidateBuyBoxCache(buyBoxId);
      } catch (cacheError) {
        console.error(`Failed to invalidate Redis cache for buy box ${buyBoxId}:`, cacheError);
        // Cache will eventually be consistent, don't throw
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Get all registered buy boxes (from memory cache)
   */
  public getAllBuyBoxes(): BuyBox[] {
    return Array.from(this.buyBoxes.values())
      .filter((bb) => bb.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get all buy boxes including disabled (from memory cache)
   */
  public getAllBuyBoxesIncludingDisabled(): BuyBox[] {
    return Array.from(this.buyBoxes.values())
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get a specific buy box
   */
  public getBuyBox(buyBoxId: string): BuyBox | undefined {
    return this.buyBoxes.get(buyBoxId);
  }

  // ============================================================================
  // SCORING PLUGINS
  // ============================================================================

  /**
   * Register a custom scoring plugin
   */
  public registerPlugin(plugin: IScoringPlugin): void {
    this.plugins.push(plugin);
    console.log(`✅ Registered scoring plugin: ${plugin.name}`);
  }

  // ============================================================================
  // SCORING OPERATIONS
  // ============================================================================

  /**
   * Score a deal against a specific buy box
   */
  public async scoreDealAgainstBuyBox(deal: NormalizedDeal, buyBox: BuyBox): Promise<ScoringResult> {
    const startTime = Date.now();
    const breakdown: ScoreBreakdown[] = [];
    const failedHardRequirements: string[] = [];

    const weights = buyBox.scoringWeights || this.config.defaultWeights;
    const criteria = buyBox.criteria;

    // 1. Geographic scoring (HARD REQUIREMENT)
    // If buy box specifies states and deal is NOT in those states, it's a hard fail
    if (criteria.states && criteria.states.length > 0) {
      const dealState = deal.address.state?.toUpperCase();
      const targetStates = criteria.states.map(s => s.toUpperCase());
      if (!dealState || !targetStates.includes(dealState)) {
        // Hard fail - this buy box doesn't cover this state
        failedHardRequirements.push(`State ${dealState || 'unknown'} not in target states: ${criteria.states.join(', ')}`);
      }
    }
    const geoResult = this.scoreGeographic(deal, criteria, weights.geographic);
    breakdown.push(geoResult);

    // 2. Price scoring
    const priceResult = this.scorePrice(deal, criteria, weights.price);
    breakdown.push(priceResult);
    if (!priceResult.passed && criteria.maxPrice !== undefined) {
      // Price can be a hard requirement if deal is way over budget
      const priceRatio = deal.askingPrice / (criteria.maxPrice || deal.askingPrice);
      if (priceRatio > 1.25) {
        failedHardRequirements.push('Price significantly over maximum');
      }
    }

    // 3. Property type scoring
    const typeResult = this.scorePropertyType(deal, criteria, weights.propertyType);
    breakdown.push(typeResult);

    // 4. Bedrooms scoring (HARD REQUIREMENT if specified)
    if (criteria.minBedrooms !== undefined || criteria.maxBedrooms !== undefined) {
      const beds = deal.bedrooms;
      const min = criteria.minBedrooms || 0;
      const max = criteria.maxBedrooms || 99;
      if (beds !== undefined && (beds < min || beds > max)) {
        failedHardRequirements.push(`${beds} bedrooms outside required range (${min}-${max})`);
      }
    }
    const bedroomResult = this.scoreBedrooms(deal, criteria, weights.bedrooms);
    breakdown.push(bedroomResult);

    // 5. Bathrooms scoring
    const bathroomResult = this.scoreBathrooms(deal, criteria, weights.bathrooms);
    breakdown.push(bathroomResult);

    // 6. Year built scoring
    const yearResult = this.scoreYearBuilt(deal, criteria, weights.yearBuilt);
    breakdown.push(yearResult);

    // 7. Occupancy scoring
    const occupancyResult = this.scoreOccupancy(deal, criteria, weights.occupancy);
    breakdown.push(occupancyResult);

    // 8. HOA scoring
    const hoaResult = this.scoreHOA(deal, criteria, weights.hoa);
    breakdown.push(hoaResult);

    // 9. Photos scoring
    const photosResult = this.scorePhotos(deal, criteria, weights.photos);
    breakdown.push(photosResult);

    // 10. Market data scoring (uses real-time data from Zillow API)
    const marketWeight = (weights as any).marketValue || 10;
    const marketResult = await this.scoreMarketValue(deal, criteria, marketWeight);
    breakdown.push(marketResult);

    // 11. Custom criteria scoring
    // Prefer parsed custom criteria (structured format) over raw format
    const customCriteriaToUse = (criteria as any).customCriteriaParsed || criteria.customCriteria;
    if (customCriteriaToUse && customCriteriaToUse.length > 0) {
      const customResults = this.scoreCustomCriteria(deal, customCriteriaToUse, weights.custom);
      breakdown.push(...customResults);
    }

    // 11. Plugin scoring
    for (const plugin of this.plugins) {
      try {
        const pluginResults = await plugin.score(deal, buyBox);
        breakdown.push(...pluginResults);
      } catch (error) {
        console.error(`Scoring plugin ${plugin.name} failed:`, error);
      }
    }

    // Calculate totals
    const totalScore = breakdown.reduce((sum, b) => sum + b.earnedPoints, 0);
    const maxPossibleScore = breakdown.reduce((sum, b) => sum + b.maxPoints, 0);
    const percentage = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;

    // Determine match type
    let matchType: ScoringResult['matchType'];
    if (failedHardRequirements.length > 0) {
      matchType = 'no_match';
    } else if (percentage >= this.config.strongMatchThreshold) {
      matchType = 'strong';
    } else if (percentage >= this.config.moderateMatchThreshold) {
      matchType = 'moderate';
    } else if (percentage >= this.config.weakMatchThreshold) {
      matchType = 'weak';
    } else {
      matchType = 'no_match';
    }

    // Generate recommendation
    const recommendation = this.generateRecommendation(matchType, percentage, failedHardRequirements, buyBox);

    // Find the right market contact for this deal's location
    const contactResult = this.findContactForDeal(deal, buyBox);

    return {
      buyBoxId: buyBox.id,
      buyBoxName: buyBox.name,
      fundName: buyBox.fundName,
      totalScore,
      maxPossibleScore,
      percentage,
      matchType,
      breakdown,
      passedHardRequirements: failedHardRequirements.length === 0,
      failedHardRequirements,
      recommendation,
      autoSubmitEligible: buyBox.autoSubmit && percentage >= buyBox.autoSubmitThreshold && failedHardRequirements.length === 0,
      marketContact: contactResult?.contact,
      contactMatchedOn: contactResult?.matchedOn,
    };
  }

  /**
   * Find the right market contact for a deal based on its location
   * Uses smart matching: city+state → county+state → city → county → state
   */
  private findContactForDeal(
    deal: NormalizedDeal,
    buyBox: BuyBox
  ): { contact: MarketContact; matchedOn: string } | undefined {
    if (!buyBox.marketContacts || buyBox.marketContacts.length === 0) {
      return undefined;
    }

    const { city, state, county } = deal.address;
    const normalize = (s: string) => s.toLowerCase().trim();

    // Helper to check if market matches search term with word boundary awareness
    const matchesMarket = (market: string, term: string): boolean => {
      const marketLower = normalize(market);
      const termLower = normalize(term);

      // Exact match
      if (marketLower === termLower) return true;

      // For short terms (2-3 chars like state codes), require word boundary
      if (termLower.length <= 3) {
        // Split market into words and check for exact word match
        const marketWords = marketLower.split(/[\s,]+/);
        return marketWords.some(word => word === termLower);
      }

      // For longer terms, allow substring matching
      return (
        marketLower.includes(termLower) ||
        termLower.includes(marketLower) ||
        marketLower.replace(/,/g, '').includes(termLower.replace(/,/g, ''))
      );
    };

    // Helper to check if any market string matches the search term
    const findMatch = (searchTerms: string[]): MarketContact | undefined => {
      for (const term of searchTerms) {
        const found = buyBox.marketContacts!.find(contact =>
          contact.markets.some(m => matchesMarket(m, term))
        );
        if (found) return found;
      }
      return undefined;
    };

    // Strategy 1: City + State (most specific)
    if (city && state) {
      const variations = [
        `${city} ${state}`,
        `${city}, ${state}`,
      ];
      const contact = findMatch(variations);
      if (contact) return { contact, matchedOn: `${city}, ${state}` };
    }

    // Strategy 2: County + State
    if (county && state) {
      const countyClean = county.replace(' County', '').replace(' Parish', '');
      const variations = [
        `${countyClean} ${state}`,
        `${countyClean}, ${state}`,
        `${county} ${state}`,
      ];
      const contact = findMatch(variations);
      if (contact) return { contact, matchedOn: `${county}, ${state}` };
    }

    // Strategy 3: City only
    if (city) {
      const contact = findMatch([city]);
      if (contact) return { contact, matchedOn: city };
    }

    // Strategy 4: County only
    if (county) {
      const countyClean = county.replace(' County', '').replace(' Parish', '');
      const contact = findMatch([countyClean, county]);
      if (contact) return { contact, matchedOn: county };
    }

    // Strategy 5: State only (fallback)
    if (state) {
      const contact = findMatch([state]);
      if (contact) return { contact, matchedOn: state };
    }

    // Strategy 6: Buy box default contact (if no regional contact matched)
    // Only use if the buy box has a default contactEmail set
    if (buyBox.contactEmail) {
      return {
        contact: {
          name: buyBox.fundName || buyBox.name,
          email: buyBox.contactEmail,
          phone: buyBox.contactPhone,
          markets: ['Default'],
        },
        matchedOn: 'Default Contact',
      };
    }

    // No contact available
    return undefined;
  }

  /**
   * Score a deal against all registered buy boxes
   * Results are cached in Redis for 1 hour to avoid expensive re-computation
   */
  public async scoreDealAgainstAllBuyBoxes(deal: NormalizedDeal): Promise<ScoringResult[]> {
    const cacheKey = this.getDealCacheKey(deal);

    // Check cache first
    const cached = await redisService.getBuyBoxScores<ScoringResult[]>(cacheKey);
    if (cached) {
      console.log(`📦 Cache HIT for property scoring: ${cacheKey}`);
      return cached;
    }

    console.log(`🔄 Cache MISS for property ${cacheKey}, computing scores...`);

    const results: ScoringResult[] = [];

    for (const buyBox of this.getAllBuyBoxes()) {
      const result = await this.scoreDealAgainstBuyBox(deal, buyBox);
      results.push(result);
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.percentage - a.percentage);

    // Cache results (1 hour TTL)
    await redisService.cacheBuyBoxScores(cacheKey, results);

    return results;
  }

  /**
   * Find the best matching buy boxes for a deal
   */
  public async findBestMatches(deal: NormalizedDeal, limit: number = 5): Promise<ScoringResult[]> {
    const allResults = await this.scoreDealAgainstAllBuyBoxes(deal);

    // Filter out no-matches and return top N
    return allResults.filter((r) => r.matchType !== 'no_match').slice(0, limit);
  }

  // ============================================================================
  // PINECONE SEMANTIC PRE-FILTERING
  // ============================================================================

  /**
   * State abbreviation to full name mapping for better search queries
   */
  private stateNames: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  };

  /**
   * Convert a deal to a semantic search query for Pinecone
   */
  private buildSearchQueryFromDeal(deal: NormalizedDeal): string {
    const parts: string[] = [];

    // Geographic
    if (deal.address.state) {
      const stateCode = deal.address.state.toUpperCase();
      const stateName = this.stateNames[stateCode] || stateCode;
      parts.push(`${stateName} ${stateCode} property investment`);
    }
    if (deal.address.city) {
      parts.push(deal.address.city);
    }
    if (deal.address.county) {
      parts.push(deal.address.county);
    }

    // Property type
    if (deal.propertyType) {
      const typeMap: Record<string, string> = {
        'single_family': 'single family home SFR',
        'Single Family': 'single family home SFR',
        'townhouse': 'townhouse townhome',
        'condo': 'condominium condo',
        'duplex': 'duplex multi-family',
        'triplex': 'triplex multi-family',
        'fourplex': 'fourplex multi-family',
      };
      parts.push(typeMap[deal.propertyType] || deal.propertyType);
    }

    // Price range context
    if (deal.askingPrice) {
      if (deal.askingPrice <= 200000) {
        parts.push('affordable budget entry-level');
      } else if (deal.askingPrice <= 400000) {
        parts.push('mid-range moderate price');
      } else if (deal.askingPrice <= 600000) {
        parts.push('upper-mid higher-value');
      } else {
        parts.push('premium high-value luxury');
      }
    }

    // Bedrooms
    if (deal.bedrooms) {
      parts.push(`${deal.bedrooms} bedroom`);
      if (deal.bedrooms >= 3) {
        parts.push('family-sized home');
      }
    }

    // Year built
    if (deal.yearBuilt) {
      if (deal.yearBuilt >= 2000) {
        parts.push('newer construction modern');
      } else if (deal.yearBuilt >= 1980) {
        parts.push('1980s construction');
      } else {
        parts.push('older construction');
      }
    }

    // Investment keywords
    parts.push('rental investment buy box criteria');

    return parts.join(' ');
  }

  /**
   * Use Pinecone semantic search to pre-filter buy boxes before scoring
   * Returns buy box IDs that are most likely to match the deal
   */
  public async getRelevantBuyBoxIds(deal: NormalizedDeal, topK: number = 10): Promise<string[]> {
    try {
      const query = this.buildSearchQueryFromDeal(deal);
      console.log(`🔍 Pinecone query: "${query.substring(0, 80)}..."`);

      const results = await knowledgeService.searchBuyBoxes(query, topK);

      // Extract unique buy box IDs from results
      const buyBoxIds = new Set<string>();
      for (const result of results) {
        const meta = result.metadata as any;
        if (meta?.buyBoxId) {
          // buyBoxId in metadata is the original ID, not the doc ID
          buyBoxIds.add(meta.buyBoxId);
        } else if (result.id.startsWith('buybox-')) {
          // Extract ID from document ID format: buybox-{id}-{chunk}
          const match = result.id.match(/^buybox-(.+?)-\d+$/);
          if (match) {
            buyBoxIds.add(match[1]);
          }
        }
      }

      console.log(`📊 Pinecone found ${buyBoxIds.size} relevant buy boxes`);
      return Array.from(buyBoxIds);
    } catch (error) {
      console.warn('Pinecone pre-filtering failed, falling back to all buy boxes:', error);
      return []; // Empty means use all buy boxes
    }
  }

  /**
   * Score a deal against buy boxes with Pinecone pre-filtering
   * First uses semantic search to find relevant buy boxes, then only scores those
   * Results are cached in Redis for 1 hour
   */
  public async scoreDealWithPreFiltering(
    deal: NormalizedDeal,
    options: { topK?: number; fallbackToAll?: boolean } = {}
  ): Promise<ScoringResult[]> {
    const { topK = 10, fallbackToAll = true } = options;
    const cacheKey = `${this.getDealCacheKey(deal)}:prefilter:${topK}`;

    // Check cache first
    const cached = await redisService.getBuyBoxScores<ScoringResult[]>(cacheKey);
    if (cached) {
      console.log(`📦 Cache HIT for pre-filtered scoring: ${cacheKey}`);
      return cached;
    }

    console.log(`🔄 Cache MISS for pre-filtered ${cacheKey}, computing scores...`);

    const results: ScoringResult[] = [];

    // Get relevant buy box IDs from Pinecone
    const relevantIds = await this.getRelevantBuyBoxIds(deal, topK);

    let buyBoxesToScore: BuyBox[];

    if (relevantIds.length > 0) {
      // Score only the relevant buy boxes
      buyBoxesToScore = this.getAllBuyBoxes().filter(bb => relevantIds.includes(bb.id));
      console.log(`⚡ Scoring against ${buyBoxesToScore.length} pre-filtered buy boxes (of ${this.getAllBuyBoxes().length} total)`);
    } else if (fallbackToAll) {
      // Fallback to scoring all buy boxes
      buyBoxesToScore = this.getAllBuyBoxes();
      console.log(`📦 Fallback: Scoring against all ${buyBoxesToScore.length} buy boxes`);
    } else {
      return [];
    }

    for (const buyBox of buyBoxesToScore) {
      const result = await this.scoreDealAgainstBuyBox(deal, buyBox);
      results.push(result);
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.percentage - a.percentage);

    // Cache results (1 hour TTL)
    await redisService.cacheBuyBoxScores(cacheKey, results);

    return results;
  }

  /**
   * Find best matches using Pinecone pre-filtering for faster results
   */
  public async findBestMatchesWithPreFiltering(
    deal: NormalizedDeal,
    limit: number = 5,
    options: { topK?: number } = {}
  ): Promise<ScoringResult[]> {
    const allResults = await this.scoreDealWithPreFiltering(deal, {
      topK: options.topK || Math.max(limit * 2, 10), // Get more candidates than needed
      fallbackToAll: true,
    });

    // Filter out no-matches and return top N
    return allResults.filter((r) => r.matchType !== 'no_match').slice(0, limit);
  }

  // ============================================================================
  // SCORING METHODS
  // ============================================================================

  private scoreGeographic(deal: NormalizedDeal, criteria: BuyBoxCriteria, maxPoints: number): ScoreBreakdown {
    let earned = 0;
    const details: string[] = [];

    // State check (primary)
    if (criteria.states && criteria.states.length > 0) {
      const dealState = deal.address.state?.toUpperCase();
      if (dealState && criteria.states.map((s) => s.toUpperCase()).includes(dealState)) {
        earned += maxPoints * 0.6; // 60% for state match
        details.push(`State ${dealState} in target states`);
      } else {
        details.push(`State ${dealState || 'unknown'} NOT in target states`);
      }
    } else {
      earned += maxPoints * 0.6; // No state restriction = full state points
      details.push('No state restrictions');
    }

    // County check (secondary)
    if (criteria.counties && criteria.counties.length > 0) {
      const dealCounty = deal.address.county?.toLowerCase();
      if (dealCounty && criteria.counties.map((c) => c.toLowerCase()).includes(dealCounty)) {
        earned += maxPoints * 0.2;
        details.push(`County ${dealCounty} in target counties`);
      }
    } else {
      earned += maxPoints * 0.2;
    }

    // City check (secondary)
    if (criteria.cities && criteria.cities.length > 0) {
      const dealCity = deal.address.city?.toLowerCase();
      if (dealCity && criteria.cities.map((c) => c.toLowerCase()).includes(dealCity)) {
        earned += maxPoints * 0.1;
        details.push(`City ${dealCity} in target cities`);
      }
    } else {
      earned += maxPoints * 0.1;
    }

    // ZIP code check
    if (criteria.zipCodes && criteria.zipCodes.length > 0) {
      if (criteria.zipCodes.includes(deal.address.zip)) {
        earned += maxPoints * 0.1;
        details.push('ZIP code matches');
      }
    } else {
      earned += maxPoints * 0.1;
    }

    // ZIP code exclusions
    if (criteria.excludeZipCodes && criteria.excludeZipCodes.includes(deal.address.zip)) {
      earned = 0;
      details.push('ZIP code is excluded');
    }

    return {
      criterion: 'Geographic Location',
      weight: maxPoints,
      maxPoints,
      earnedPoints: Math.round(earned),
      passed: earned > 0,
      details: details.join('; '),
    };
  }

  private scorePrice(deal: NormalizedDeal, criteria: BuyBoxCriteria, maxPoints: number): ScoreBreakdown {
    let earned = 0;
    const details: string[] = [];
    const price = deal.askingPrice;

    if (criteria.minPrice === undefined && criteria.maxPrice === undefined) {
      // No price restrictions
      earned = maxPoints;
      details.push('No price restrictions');
    } else {
      const minPrice = criteria.minPrice || 0;
      const maxPrice = criteria.maxPrice || Infinity;

      if (price >= minPrice && price <= maxPrice) {
        earned = maxPoints;
        details.push(`Price $${price.toLocaleString()} within range`);
      } else if (price < minPrice) {
        // Below minimum - partial points
        const ratio = price / minPrice;
        earned = Math.max(0, maxPoints * ratio * 0.5);
        details.push(`Price $${price.toLocaleString()} below minimum $${minPrice.toLocaleString()}`);
      } else {
        // Above maximum - check tolerance
        const overagePercent = ((price - maxPrice) / maxPrice) * 100;
        if (overagePercent <= 15) {
          earned = maxPoints * 0.6;
          details.push(`Price $${price.toLocaleString()} is ${overagePercent.toFixed(0)}% over max (within 15% tolerance)`);
        } else if (overagePercent <= 25) {
          earned = maxPoints * 0.3;
          details.push(`Price $${price.toLocaleString()} is ${overagePercent.toFixed(0)}% over max (within 25% tolerance)`);
        } else {
          earned = 0;
          details.push(`Price $${price.toLocaleString()} significantly over max $${maxPrice.toLocaleString()}`);
        }
      }
    }

    // ARV percentage check
    if (criteria.maxArvPercentage && deal.arv) {
      const arvPercentage = (price / deal.arv) * 100;
      if (arvPercentage <= criteria.maxArvPercentage) {
        earned = Math.min(earned + maxPoints * 0.2, maxPoints);
        details.push(`ARV ratio ${arvPercentage.toFixed(0)}% meets criteria`);
      } else {
        earned = Math.max(0, earned - maxPoints * 0.2);
        details.push(`ARV ratio ${arvPercentage.toFixed(0)}% exceeds max ${criteria.maxArvPercentage}%`);
      }
    }

    return {
      criterion: 'Price',
      weight: maxPoints,
      maxPoints,
      earnedPoints: Math.round(earned),
      passed: earned >= maxPoints * 0.5,
      details: details.join('; '),
    };
  }

  /**
   * Score property type using reusable list matching utility
   */
  private scorePropertyType(deal: NormalizedDeal, criteria: BuyBoxCriteria, maxPoints: number): ScoreBreakdown {
    return scoreListMatch(
      'Property Type',
      deal.propertyType,
      criteria.propertyTypes,
      criteria.excludePropertyTypes,
      maxPoints,
      {
        exactMatchPoints: 1.0,
        partialMatchPoints: 0.8,
        caseInsensitive: true,
      }
    );
  }

  /**
   * Score bedrooms using reusable range matching utility
   */
  private scoreBedrooms(deal: NormalizedDeal, criteria: BuyBoxCriteria, maxPoints: number): ScoreBreakdown {
    return scoreRangeMatch(
      'Bedrooms',
      deal.bedrooms,
      criteria.minBedrooms,
      criteria.maxBedrooms,
      maxPoints,
      { tolerance: 1, closeRangePoints: 0.5 }
    );
  }

  /**
   * Score bathrooms using reusable range matching utility
   */
  private scoreBathrooms(deal: NormalizedDeal, criteria: BuyBoxCriteria, maxPoints: number): ScoreBreakdown {
    return scoreRangeMatch(
      'Bathrooms',
      deal.bathrooms,
      criteria.minBathrooms,
      criteria.maxBathrooms,
      maxPoints,
      { tolerance: 0.5, closeRangePoints: 0.3 }
    );
  }

  /**
   * Score year built using reusable range matching utility
   */
  private scoreYearBuilt(deal: NormalizedDeal, criteria: BuyBoxCriteria, maxPoints: number): ScoreBreakdown {
    return scoreRangeMatch(
      'Year Built',
      deal.yearBuilt,
      criteria.minYearBuilt,
      criteria.maxYearBuilt,
      maxPoints,
      {
        tolerance: 10,
        closeRangePoints: 0.6,
        formatValue: (v) => `Built ${v}`,
      }
    );
  }

  private scoreOccupancy(deal: NormalizedDeal, criteria: BuyBoxCriteria, maxPoints: number): ScoreBreakdown {
    const occupancy = deal.occupancyStatus;
    const details: string[] = [];
    let earned = 0;

    if (criteria.preferVacant && occupancy === 'vacant') {
      earned = maxPoints;
      details.push('Property is vacant (preferred)');
    } else if (occupancy === 'vacant') {
      earned = maxPoints;
      details.push('Property is vacant');
    } else if (occupancy === 'tenant' && criteria.allowTenant !== false) {
      earned = maxPoints * 0.7;
      details.push('Tenant occupied (allowed)');
    } else if (occupancy === 'tenant' && criteria.allowTenant === false) {
      earned = 0;
      details.push('Tenant occupied (not allowed)');
    } else if ((occupancy === 'occupied' || occupancy === 'owner') && criteria.allowOccupied !== false) {
      earned = maxPoints * 0.6;
      details.push(`Property is ${occupancy} (allowed)`);
    } else if (occupancy === 'unknown') {
      earned = maxPoints * 0.5;
      details.push('Occupancy unknown');
    } else {
      earned = maxPoints * 0.3;
      details.push(`Occupancy status: ${occupancy}`);
    }

    return {
      criterion: 'Occupancy',
      weight: maxPoints,
      maxPoints,
      earnedPoints: Math.round(earned),
      passed: earned > 0,
      details: details.join('; '),
    };
  }

  private scoreHOA(deal: NormalizedDeal, criteria: BuyBoxCriteria, maxPoints: number): ScoreBreakdown {
    const rawData = deal.rawData || {};
    const hasHoa = rawData.hasHoa || rawData.hoa || rawData.hoaDues;
    const hoaDues = rawData.hoaDuesAmount || rawData.hoaDues;
    const details: string[] = [];
    let earned = 0;

    if (criteria.allowHoa === false && hasHoa) {
      earned = 0;
      details.push('Has HOA (not allowed)');
    } else if (!hasHoa) {
      earned = maxPoints;
      details.push('No HOA');
    } else if (criteria.maxHoaMonthly && hoaDues) {
      if (hoaDues <= criteria.maxHoaMonthly) {
        earned = maxPoints;
        details.push(`HOA $${hoaDues}/mo within limit`);
      } else {
        earned = maxPoints * 0.5;
        details.push(`HOA $${hoaDues}/mo exceeds $${criteria.maxHoaMonthly} max`);
      }
    } else {
      earned = maxPoints * 0.7;
      details.push('Has HOA (allowed)');
    }

    return {
      criterion: 'HOA',
      weight: maxPoints,
      maxPoints,
      earnedPoints: Math.round(earned),
      passed: earned > 0,
      details: details.join('; '),
    };
  }

  private scorePhotos(deal: NormalizedDeal, criteria: BuyBoxCriteria, maxPoints: number): ScoreBreakdown {
    const photoCount = deal.photos?.length || 0;
    const details: string[] = [];
    let earned = 0;

    if (criteria.requirePhotos && photoCount === 0) {
      earned = 0;
      details.push('No photos (required)');
    } else if (criteria.minPhotoCount && photoCount < criteria.minPhotoCount) {
      earned = maxPoints * (photoCount / criteria.minPhotoCount);
      details.push(`${photoCount} photos (min ${criteria.minPhotoCount} required)`);
    } else if (photoCount >= 10) {
      earned = maxPoints;
      details.push(`${photoCount} photos (excellent)`);
    } else if (photoCount >= 5) {
      earned = maxPoints * 0.8;
      details.push(`${photoCount} photos (good)`);
    } else if (photoCount > 0) {
      earned = maxPoints * 0.5;
      details.push(`${photoCount} photos`);
    } else {
      earned = maxPoints * 0.3;
      details.push('No photos');
    }

    return {
      criterion: 'Photos',
      weight: maxPoints,
      maxPoints,
      earnedPoints: Math.round(earned),
      passed: earned >= maxPoints * 0.3,
      details: details.join('; '),
    };
  }

  /**
   * Score based on real-time market data from Zillow API
   * Evaluates: price vs Zestimate, rent yield, market trends
   */
  private async scoreMarketValue(
    deal: NormalizedDeal,
    criteria: BuyBoxCriteria,
    maxPoints: number
  ): Promise<ScoreBreakdown> {
    const details: string[] = [];
    let earned = 0;

    try {
      // Build full address for API lookup
      const fullAddress = `${deal.address.street}, ${deal.address.city}, ${deal.address.state} ${deal.address.zip}`;

      // Fetch real market data
      const marketData = await marketDataService.getMarketData({
        address: fullAddress,
        city: deal.address.city,
        state: deal.address.state,
        zip: deal.address.zip,
      });

      // If using fallback data (no API), give partial points
      if (marketData.dataSource === 'fallback') {
        earned = maxPoints * 0.5;
        details.push('Market data unavailable (using estimates)');
        return {
          criterion: 'Market Value',
          weight: maxPoints,
          maxPoints,
          earnedPoints: Math.round(earned),
          passed: true,
          details: details.join('; '),
        };
      }

      // 1. Compare asking price to Zestimate (40% of market score)
      if (marketData.zestimate && deal.askingPrice) {
        const priceToZestimate = deal.askingPrice / marketData.zestimate;

        if (priceToZestimate <= 0.70) {
          // 30%+ below Zestimate - excellent deal
          earned += maxPoints * 0.4;
          const discount = Math.round((1 - priceToZestimate) * 100);
          details.push(`${discount}% below Zestimate ($${marketData.zestimate.toLocaleString()}) - Excellent`);
        } else if (priceToZestimate <= 0.80) {
          // 20-30% below
          earned += maxPoints * 0.35;
          details.push(`${Math.round((1 - priceToZestimate) * 100)}% below Zestimate - Great`);
        } else if (priceToZestimate <= 0.90) {
          // 10-20% below
          earned += maxPoints * 0.25;
          details.push(`${Math.round((1 - priceToZestimate) * 100)}% below Zestimate - Good`);
        } else if (priceToZestimate <= 1.0) {
          // At or slightly below
          earned += maxPoints * 0.15;
          details.push(`At or near Zestimate`);
        } else {
          // Above Zestimate - not great
          earned += maxPoints * 0.05;
          details.push(`${Math.round((priceToZestimate - 1) * 100)}% above Zestimate - Overpriced`);
        }
      }

      // 2. Evaluate rent yield potential (30% of market score)
      if (marketData.rentZestimate && deal.askingPrice) {
        const annualRent = marketData.rentZestimate * 12;
        const grossYield = (annualRent / deal.askingPrice) * 100;

        if (grossYield >= 12) {
          earned += maxPoints * 0.3;
          details.push(`${grossYield.toFixed(1)}% gross yield - Excellent cash flow`);
        } else if (grossYield >= 10) {
          earned += maxPoints * 0.25;
          details.push(`${grossYield.toFixed(1)}% gross yield - Great cash flow`);
        } else if (grossYield >= 8) {
          earned += maxPoints * 0.2;
          details.push(`${grossYield.toFixed(1)}% gross yield - Good cash flow`);
        } else if (grossYield >= 6) {
          earned += maxPoints * 0.1;
          details.push(`${grossYield.toFixed(1)}% gross yield - Moderate`);
        } else {
          earned += maxPoints * 0.05;
          details.push(`${grossYield.toFixed(1)}% gross yield - Low`);
        }
      }

      // 3. Market trend bonus (20% of market score)
      if (marketData.priceChange1Year !== null && marketData.priceChange1Year !== undefined) {
        if (marketData.priceChange1Year >= 5) {
          earned += maxPoints * 0.2;
          details.push(`Market up ${marketData.priceChange1Year}% YoY - Appreciating`);
        } else if (marketData.priceChange1Year >= 0) {
          earned += maxPoints * 0.15;
          details.push(`Market stable (${marketData.priceChange1Year}% YoY)`);
        } else if (marketData.priceChange1Year >= -5) {
          earned += maxPoints * 0.1;
          details.push(`Market softening (${marketData.priceChange1Year}% YoY)`);
        } else {
          earned += maxPoints * 0.05;
          details.push(`Market declining (${marketData.priceChange1Year}% YoY) - Caution`);
        }
      }

      // 4. Price per sqft comparison (10% of market score)
      if (marketData.pricePerSqft && deal.sqft && deal.askingPrice) {
        const dealPricePerSqft = deal.askingPrice / deal.sqft;
        const ratio = dealPricePerSqft / marketData.pricePerSqft;

        if (ratio <= 0.7) {
          earned += maxPoints * 0.1;
          details.push(`$${dealPricePerSqft.toFixed(0)}/sqft vs market $${marketData.pricePerSqft}/sqft - Great value`);
        } else if (ratio <= 0.85) {
          earned += maxPoints * 0.08;
          details.push(`Below market $/sqft`);
        } else if (ratio <= 1.0) {
          earned += maxPoints * 0.05;
          details.push(`At market $/sqft`);
        }
      }

      // Store market data in deal for later use
      (deal as any)._marketData = marketData;

    } catch (error) {
      console.error('Market data scoring error:', error);
      earned = maxPoints * 0.5; // Partial points on error
      details.push('Market data lookup failed (using base score)');
    }

    return {
      criterion: 'Market Value',
      weight: maxPoints,
      maxPoints,
      earnedPoints: Math.round(earned),
      passed: earned >= maxPoints * 0.3,
      details: details.join('; '),
    };
  }

  private scoreCustomCriteria(
    deal: NormalizedDeal,
    customCriteria: CustomCriterion[],
    totalWeight: number
  ): ScoreBreakdown[] {
    const results: ScoreBreakdown[] = [];
    const weightPerCriterion = totalWeight / customCriteria.length;

    for (const criterion of customCriteria) {
      const value = this.getValueByPath(deal, criterion.field);
      const passed = this.evaluateCriterion(value, criterion.operator, criterion.value);

      const earnedPoints = passed ? criterion.weight || weightPerCriterion : 0;

      results.push({
        criterion: criterion.name || criterion.field,
        weight: criterion.weight || weightPerCriterion,
        maxPoints: criterion.weight || weightPerCriterion,
        earnedPoints: Math.round(earnedPoints),
        passed,
        details: `Custom: ${criterion.field} ${criterion.operator} ${criterion.value} = ${passed ? 'PASS' : 'FAIL'}`,
      });
    }

    return results;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Generate a cache key for a deal based on property ID or address
   */
  private getDealCacheKey(deal: NormalizedDeal): string {
    // Use externalId or sourceId if available, otherwise hash address
    if (deal.externalId) return deal.externalId;
    if (deal.sourceId) return deal.sourceId;
    const addr = deal.address;
    return `${addr.street}-${addr.city}-${addr.state}-${addr.zip}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-');
  }

  private getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value && value[part] !== undefined) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  private evaluateCriterion(value: any, operator: CriterionOperator | string, target: any): boolean {
    switch (operator) {
      case 'equals':
        return value === target;
      case 'not_equals':
        return value !== target;
      case 'greater_than':
        return value > target;
      case 'less_than':
        return value < target;
      case 'greater_or_equal':
        return value >= target;
      case 'less_or_equal':
        return value <= target;
      case 'contains':
        return String(value).toLowerCase().includes(String(target).toLowerCase());
      case 'not_contains':
        return !String(value).toLowerCase().includes(String(target).toLowerCase());
      case 'in':
        return Array.isArray(target) && target.includes(value);
      case 'not_in':
        return Array.isArray(target) && !target.includes(value);
      case 'regex':
        return new RegExp(target).test(String(value));
      case 'exists':
        return value !== undefined && value !== null;
      case 'not_exists':
        return value === undefined || value === null;
      default:
        return false;
    }
  }

  private generateRecommendation(
    matchType: ScoringResult['matchType'],
    percentage: number,
    failedHardRequirements: string[],
    buyBox: BuyBox
  ): string {
    if (failedHardRequirements.length > 0) {
      return `Not recommended - failed hard requirements: ${failedHardRequirements.join(', ')}`;
    }

    switch (matchType) {
      case 'strong':
        if (buyBox.autoSubmit) {
          return `Excellent match (${percentage}%)! Auto-submit eligible for ${buyBox.fundName || buyBox.name}`;
        }
        return `Excellent match (${percentage}%)! Highly recommend submitting to ${buyBox.fundName || buyBox.name}`;

      case 'moderate':
        return `Good match (${percentage}%). Consider submitting to ${buyBox.fundName || buyBox.name} - review criteria gaps first`;

      case 'weak':
        return `Weak match (${percentage}%). May submit to ${buyBox.fundName || buyBox.name} if no better options`;

      default:
        return `Does not meet minimum criteria for ${buyBox.fundName || buyBox.name}`;
    }
  }

  // ============================================================================
  // ASYNC SCORING (Non-blocking)
  // ============================================================================

  /**
   * Enqueue a deal for async scoring (non-blocking)
   * Returns a job ID that can be used to check status or retrieve results later
   *
   * Use this for bulk operations or when immediate results are not needed
   */
  public async enqueueForScoring(deal: NormalizedDeal): Promise<string> {
    // Lazy import to avoid circular dependencies
    const { scoringQueueService } = await import('../../services/ScoringQueueService');

    // Set the scoring function if not already set
    scoringQueueService.setScoringFunction(async (d: NormalizedDeal) => {
      return this.scoreDealAgainstAllBuyBoxes(d);
    });

    return scoringQueueService.enqueue(deal);
  }

  /**
   * Enqueue multiple deals for async scoring
   * Returns an array of job IDs
   */
  public async enqueueBulkScoring(deals: NormalizedDeal[]): Promise<string[]> {
    const jobIds: string[] = [];

    for (const deal of deals) {
      const jobId = await this.enqueueForScoring(deal);
      jobIds.push(jobId);
    }

    return jobIds;
  }

  /**
   * Get the status of an async scoring job
   */
  public async getScoringJobStatus(jobId: string): Promise<string | null> {
    const { scoringQueueService } = await import('../../services/ScoringQueueService');
    return scoringQueueService.getJobStatus(jobId);
  }

  /**
   * Get the result of a completed async scoring job
   */
  public async getScoringJobResult(jobId: string): Promise<ScoringResult[] | null> {
    const { scoringQueueService } = await import('../../services/ScoringQueueService');
    const result = await scoringQueueService.getJobResult(jobId);
    return result as ScoringResult[] | null;
  }

  /**
   * Get queue statistics
   */
  public async getQueueStats(): Promise<{ pending: number; processing: number; maxConcurrent: number }> {
    const { scoringQueueService } = await import('../../services/ScoringQueueService');
    return scoringQueueService.getStats();
  }
}

// Export singleton instance
export const scoringEngine = new ScoringEngine();
export default scoringEngine;
