/**
 * AI-Powered Deal Analysis & Enrichment Service
 *
 * Provides intelligent analysis and data enrichment for deals:
 * - Property data enrichment from multiple sources
 * - AI-powered deal scoring and recommendations
 * - Market analysis and comparables
 * - Risk assessment
 * - Investment analysis
 */

import { NormalizedDeal } from '../types';
import { marketDataService, PropertyMarketData } from '../../services/MarketDataService';

// ============================================================================
// ENRICHMENT PROVIDER INTERFACE
// ============================================================================

export interface IEnrichmentProvider {
  name: string;
  type: EnrichmentProviderType;
  enrichFields: string[];
  enrich(deal: NormalizedDeal): Promise<EnrichmentResult>;
  isAvailable(): Promise<boolean>;
}

export type EnrichmentProviderType =
  | 'property_data'      // Property characteristics
  | 'valuation'          // Property values (ARV, etc.)
  | 'rental'             // Rental estimates
  | 'market'             // Market data
  | 'demographics'       // Neighborhood demographics
  | 'ownership'          // Owner information
  | 'tax'                // Tax data
  | 'permits'            // Building permits
  | 'sales_history'      // Past sales
  | 'photos'             // Property photos
  | 'ai_analysis';       // AI-powered analysis

export interface EnrichmentResult {
  success: boolean;
  provider: string;
  data: Record<string, any>;
  confidence: number;
  timestamp: Date;
  error?: string;
}

// ============================================================================
// ANALYSIS RESULT TYPES
// ============================================================================

export interface DealAnalysis {
  dealId: string;
  timestamp: Date;

  // Overall assessment
  overallScore: number;
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'pass';
  confidence: number;

  // Financial analysis
  financialAnalysis: FinancialAnalysis;

  // Market analysis
  marketAnalysis: MarketAnalysis;

  // Risk assessment
  riskAssessment: RiskAssessment;

  // Comparable properties
  comparables: ComparableProperty[];

  // AI insights
  aiInsights: string[];

  // Recommendations
  recommendations: string[];
}

export interface FinancialAnalysis {
  estimatedArv: number;
  arvConfidence: number;

  estimatedRepairs: number;
  repairConfidence: number;

  estimatedRent: number;
  rentConfidence: number;

  maxAllowableOffer: number;
  potentialProfit: number;
  profitMargin: number;

  capRate?: number;
  cashOnCash?: number;

  breakdownNotes: string[];
}

export interface MarketAnalysis {
  marketTemperature: 'hot' | 'warm' | 'neutral' | 'cool' | 'cold';
  daysOnMarketAvg: number;
  pricePerSqftAvg: number;
  pricePerSqftSubject: number;

  supplyDemandRatio: number;
  inventoryMonths: number;

  appreciationRate1yr: number;
  appreciationRate5yr: number;

  neighborhoodGrade: string;
  schoolRating: number;
  crimeIndex: number;

  marketTrend: 'appreciating' | 'stable' | 'depreciating';
  marketNotes: string[];
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;

  risks: RiskFactor[];
  mitigations: string[];
}

export interface RiskFactor {
  category: string;
  factor: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
}

export interface ComparableProperty {
  address: string;
  distance: number; // miles
  soldPrice: number;
  soldDate: Date;
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  pricePerSqft: number;
  similarity: number; // 0-100
  adjustedValue: number;
}

// ============================================================================
// DEAL ANALYSIS SERVICE
// ============================================================================

export class DealAnalysisService {
  private providers: Map<string, IEnrichmentProvider> = new Map();
  private cache: Map<string, { data: any; expiry: Date }> = new Map();
  private cacheTimeout = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.registerDefaultProviders();
  }

  // ============================================================================
  // PROVIDER MANAGEMENT
  // ============================================================================

  /**
   * Register an enrichment provider
   */
  public registerProvider(provider: IEnrichmentProvider): void {
    this.providers.set(provider.name, provider);
    console.log(`✅ Registered enrichment provider: ${provider.name}`);
  }

  /**
   * Get all registered providers
   */
  public getProviders(): IEnrichmentProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Register default providers (real + mock fallbacks)
   */
  private registerDefaultProviders(): void {
    // REAL Zillow provider using MarketDataService (RapidAPI)
    this.registerProvider({
      name: 'ZillowRealAPI',
      type: 'valuation',
      enrichFields: [
        'zpid', 'zestimate', 'rentZestimate', 'arv', 'taxAssessment',
        'priceHistory', 'comparables', 'lastSoldPrice', 'lastSoldDate',
        'livingArea', 'lotSize', 'yearBuilt', 'propertyType',
        'latitude', 'longitude', 'photos'
      ],
      enrich: async (deal) => this.realZillowEnrich(deal),
      isAvailable: async () => {
        // Check if Zillow API key is configured
        return !!process.env.RAPIDAPI_KEY;
      },
    });

    // Mock Zillow fallback (used when API is not configured)
    this.registerProvider({
      name: 'ZillowMock',
      type: 'valuation',
      enrichFields: ['arv', 'zestimate', 'rentEstimate', 'taxAssessment'],
      enrich: async (deal) => this.mockZillowEnrich(deal),
      isAvailable: async () => !process.env.RAPIDAPI_KEY, // Only use if real API not available
    });

    // ATTOM-like provider
    this.registerProvider({
      name: 'AttomAPI',
      type: 'property_data',
      enrichFields: ['yearBuilt', 'sqft', 'lotSize', 'ownerName', 'lastSaleDate', 'lastSalePrice'],
      enrich: async (deal) => this.mockAttomEnrich(deal),
      isAvailable: async () => true,
    });

    // Rentometer-like provider
    this.registerProvider({
      name: 'RentometerAPI',
      type: 'rental',
      enrichFields: ['rentEstimate', 'rentRange', 'rentPerSqft'],
      enrich: async (deal) => this.mockRentometerEnrich(deal),
      isAvailable: async () => true,
    });

    // Market data provider
    this.registerProvider({
      name: 'MarketDataAPI',
      type: 'market',
      enrichFields: ['marketTemperature', 'daysOnMarket', 'supplyDemand', 'appreciation'],
      enrich: async (deal) => this.mockMarketDataEnrich(deal),
      isAvailable: async () => true,
    });

    // AI Analysis provider
    this.registerProvider({
      name: 'AIAnalysis',
      type: 'ai_analysis',
      enrichFields: ['insights', 'recommendations', 'riskFactors'],
      enrich: async (deal) => this.mockAIAnalysis(deal),
      isAvailable: async () => true,
    });
  }

  // ============================================================================
  // ENRICHMENT OPERATIONS
  // ============================================================================

  /**
   * Enrich a deal with data from all available providers
   */
  public async enrichDeal(deal: NormalizedDeal, providerNames?: string[]): Promise<{
    enrichedDeal: NormalizedDeal;
    results: EnrichmentResult[];
  }> {
    const results: EnrichmentResult[] = [];
    let enrichedDeal = { ...deal };

    // Check cache first
    const cacheKey = `enrich-${deal.externalId || deal.address.street}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Get providers to use
    let providers = Array.from(this.providers.values());
    if (providerNames && providerNames.length > 0) {
      providers = providers.filter((p) => providerNames.includes(p.name));
    }

    // Run enrichment from each provider
    for (const provider of providers) {
      try {
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          console.log(`Provider ${provider.name} is not available`);
          continue;
        }

        const result = await provider.enrich(enrichedDeal);
        results.push(result);

        if (result.success) {
          // Merge enriched data
          enrichedDeal = this.mergeEnrichmentData(enrichedDeal, result.data);
        }
      } catch (error) {
        results.push({
          success: false,
          provider: provider.name,
          data: {},
          confidence: 0,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const response = { enrichedDeal, results };
    this.setCache(cacheKey, response);

    return response;
  }

  /**
   * Perform comprehensive deal analysis
   */
  public async analyzeDeal(deal: NormalizedDeal): Promise<DealAnalysis> {
    // Enrich deal first
    const { enrichedDeal } = await this.enrichDeal(deal);

    // Perform analysis
    const financialAnalysis = this.performFinancialAnalysis(enrichedDeal);
    const marketAnalysis = await this.performMarketAnalysis(enrichedDeal);
    const riskAssessment = this.performRiskAssessment(enrichedDeal, financialAnalysis, marketAnalysis);
    const comparables = await this.findComparables(enrichedDeal);
    const aiInsights = this.generateAIInsights(enrichedDeal, financialAnalysis, marketAnalysis, riskAssessment);
    const recommendations = this.generateRecommendations(enrichedDeal, financialAnalysis, marketAnalysis, riskAssessment);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(financialAnalysis, marketAnalysis, riskAssessment);
    const recommendation = this.determineRecommendation(overallScore, riskAssessment);
    const confidence = this.calculateConfidence(enrichedDeal);

    return {
      dealId: deal.externalId || `deal-${Date.now()}`,
      timestamp: new Date(),
      overallScore,
      recommendation,
      confidence,
      financialAnalysis,
      marketAnalysis,
      riskAssessment,
      comparables,
      aiInsights,
      recommendations,
    };
  }

  // ============================================================================
  // ANALYSIS METHODS
  // ============================================================================

  private performFinancialAnalysis(deal: NormalizedDeal): FinancialAnalysis {
    const askingPrice = deal.askingPrice;
    const arv = deal.arv || this.estimateArv(deal);
    const repairs = deal.repairEstimate || this.estimateRepairs(deal);
    const rent = deal.monthlyRent || this.estimateRent(deal);

    // 70% rule calculation
    const maxAllowableOffer = arv * 0.7 - repairs;
    const potentialProfit = arv - askingPrice - repairs;
    const profitMargin = arv > 0 ? (potentialProfit / arv) * 100 : 0;

    // Rental metrics
    const annualRent = rent * 12;
    const capRate = askingPrice > 0 ? (annualRent / askingPrice) * 100 : 0;

    const notes: string[] = [];
    if (askingPrice <= maxAllowableOffer) {
      notes.push('Price meets 70% rule');
    } else {
      const overAmount = askingPrice - maxAllowableOffer;
      notes.push(`Price is $${overAmount.toLocaleString()} over 70% rule MAO`);
    }

    if (profitMargin >= 20) {
      notes.push(`Strong profit margin: ${profitMargin.toFixed(1)}%`);
    } else if (profitMargin >= 10) {
      notes.push(`Moderate profit margin: ${profitMargin.toFixed(1)}%`);
    } else {
      notes.push(`Low profit margin: ${profitMargin.toFixed(1)}%`);
    }

    return {
      estimatedArv: arv,
      arvConfidence: deal.arv ? 85 : 65,
      estimatedRepairs: repairs,
      repairConfidence: deal.repairEstimate ? 80 : 50,
      estimatedRent: rent,
      rentConfidence: deal.monthlyRent ? 85 : 60,
      maxAllowableOffer: Math.max(0, maxAllowableOffer),
      potentialProfit,
      profitMargin,
      capRate,
      cashOnCash: capRate * 0.8, // Simplified
      breakdownNotes: notes,
    };
  }

  private async performMarketAnalysis(deal: NormalizedDeal): Promise<MarketAnalysis> {
    // In production, fetch real market data
    const pricePerSqft = deal.sqft && deal.sqft > 0 ? deal.askingPrice / deal.sqft : 0;

    return {
      marketTemperature: this.determineMarketTemperature(deal),
      daysOnMarketAvg: Math.floor(Math.random() * 30) + 15, // Mock
      pricePerSqftAvg: pricePerSqft * (0.9 + Math.random() * 0.2), // Mock
      pricePerSqftSubject: pricePerSqft,
      supplyDemandRatio: 0.8 + Math.random() * 0.4, // Mock
      inventoryMonths: 2 + Math.random() * 4, // Mock
      appreciationRate1yr: 3 + Math.random() * 7, // Mock
      appreciationRate5yr: 15 + Math.random() * 25, // Mock
      neighborhoodGrade: ['A', 'A-', 'B+', 'B', 'B-', 'C+'][Math.floor(Math.random() * 6)],
      schoolRating: 5 + Math.floor(Math.random() * 5),
      crimeIndex: 20 + Math.floor(Math.random() * 60),
      marketTrend: ['appreciating', 'stable', 'depreciating'][Math.floor(Math.random() * 3)] as any,
      marketNotes: [
        `Market in ${deal.address.city || 'area'} is showing steady demand`,
        'Inventory levels are below historical average',
      ],
    };
  }

  private performRiskAssessment(
    deal: NormalizedDeal,
    financial: FinancialAnalysis,
    market: MarketAnalysis
  ): RiskAssessment {
    const risks: RiskFactor[] = [];

    // Financial risks
    if (financial.profitMargin < 10) {
      risks.push({
        category: 'Financial',
        factor: 'Low Profit Margin',
        severity: financial.profitMargin < 5 ? 'high' : 'medium',
        description: `Profit margin of ${financial.profitMargin.toFixed(1)}% is below target`,
        impact: 'Reduced return on investment, limited negotiation room',
      });
    }

    if (deal.askingPrice > financial.maxAllowableOffer * 1.1) {
      risks.push({
        category: 'Financial',
        factor: 'Over-Priced',
        severity: 'high',
        description: 'Deal is priced above maximum allowable offer',
        impact: 'May result in loss if repairs exceed estimates',
      });
    }

    // Market risks
    if (market.marketTemperature === 'cold' || market.marketTemperature === 'cool') {
      risks.push({
        category: 'Market',
        factor: 'Slow Market',
        severity: 'medium',
        description: 'Market conditions may extend hold time',
        impact: 'Increased carrying costs, potential price reductions',
      });
    }

    // Property risks
    if (deal.yearBuilt && deal.yearBuilt < 1960) {
      risks.push({
        category: 'Property',
        factor: 'Older Construction',
        severity: 'medium',
        description: `Property built in ${deal.yearBuilt} may have outdated systems`,
        impact: 'Potential for unexpected repair costs (plumbing, electrical)',
      });
    }

    if (deal.occupancyStatus === 'tenant' || deal.occupancyStatus === 'occupied') {
      risks.push({
        category: 'Occupancy',
        factor: 'Occupied Property',
        severity: deal.occupancyStatus === 'tenant' ? 'medium' : 'high',
        description: 'Property is currently occupied',
        impact: 'May require eviction process, delayed possession',
      });
    }

    // Confidence risks
    if (deal.confidence < 70) {
      risks.push({
        category: 'Data Quality',
        factor: 'Low Data Confidence',
        severity: 'medium',
        description: `Deal data confidence is ${deal.confidence}%`,
        impact: 'Key metrics may be inaccurate, verify before proceeding',
      });
    }

    // Calculate overall risk
    const riskScore = risks.reduce((sum, r) => {
      const severityScore = { low: 1, medium: 2, high: 3, critical: 4 }[r.severity] || 0;
      return sum + severityScore;
    }, 0);

    let overallRisk: RiskAssessment['overallRisk'];
    if (riskScore === 0) overallRisk = 'low';
    else if (riskScore <= 4) overallRisk = 'low';
    else if (riskScore <= 8) overallRisk = 'medium';
    else if (riskScore <= 12) overallRisk = 'high';
    else overallRisk = 'critical';

    const mitigations: string[] = [];
    if (risks.some((r) => r.category === 'Financial')) {
      mitigations.push('Negotiate purchase price down');
      mitigations.push('Get multiple contractor bids for repairs');
    }
    if (risks.some((r) => r.category === 'Market')) {
      mitigations.push('Build in longer holding period to budget');
      mitigations.push('Consider rental strategy if flip takes longer');
    }
    if (risks.some((r) => r.category === 'Occupancy')) {
      mitigations.push('Verify occupancy status before purchase');
      mitigations.push('Factor eviction timeline into projections');
    }

    return {
      overallRisk,
      riskScore,
      risks,
      mitigations,
    };
  }

  private async findComparables(deal: NormalizedDeal): Promise<ComparableProperty[]> {
    // In production, fetch real comparables from MLS/API
    const basePrice = deal.arv || deal.askingPrice * 1.3;
    const baseSqft = deal.sqft || 1500;

    return Array.from({ length: 5 }, (_, i) => ({
      address: `${100 + i * 10} ${['Oak', 'Maple', 'Pine', 'Cedar', 'Elm'][i]} St, ${deal.address.city}, ${deal.address.state}`,
      distance: 0.2 + Math.random() * 0.8,
      soldPrice: basePrice * (0.9 + Math.random() * 0.2),
      soldDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
      sqft: baseSqft * (0.85 + Math.random() * 0.3),
      bedrooms: deal.bedrooms || 3,
      bathrooms: deal.bathrooms || 2,
      pricePerSqft: (basePrice * (0.9 + Math.random() * 0.2)) / (baseSqft * (0.85 + Math.random() * 0.3)),
      similarity: 70 + Math.random() * 25,
      adjustedValue: basePrice * (0.95 + Math.random() * 0.1),
    }));
  }

  private generateAIInsights(
    deal: NormalizedDeal,
    financial: FinancialAnalysis,
    market: MarketAnalysis,
    risk: RiskAssessment
  ): string[] {
    const insights: string[] = [];

    // Financial insights
    if (financial.profitMargin >= 20) {
      insights.push(`Strong profit potential with ${financial.profitMargin.toFixed(1)}% margin - this deal has room for unexpected costs`);
    }

    if (deal.askingPrice <= financial.maxAllowableOffer) {
      insights.push(`Price is at or below the 70% rule MAO of $${financial.maxAllowableOffer.toLocaleString()}`);
    }

    // Market insights
    if (market.marketTrend === 'appreciating') {
      insights.push(`Market is appreciating at ${market.appreciationRate1yr.toFixed(1)}% annually - favorable for hold strategies`);
    }

    if (market.inventoryMonths < 3) {
      insights.push(`Low inventory (${market.inventoryMonths.toFixed(1)} months) indicates seller's market - quick disposition likely`);
    }

    // Property-specific insights
    if (deal.yearBuilt && deal.yearBuilt > 2000) {
      insights.push('Newer construction typically means lower repair costs and faster buyer appeal');
    }

    if (deal.occupancyStatus === 'vacant') {
      insights.push('Vacant property allows immediate access for inspections and renovations');
    }

    // Rental insights
    if (financial.capRate && financial.capRate > 8) {
      insights.push(`Strong cap rate of ${financial.capRate.toFixed(1)}% - consider rental strategy as backup exit`);
    }

    return insights;
  }

  private generateRecommendations(
    deal: NormalizedDeal,
    financial: FinancialAnalysis,
    market: MarketAnalysis,
    risk: RiskAssessment
  ): string[] {
    const recommendations: string[] = [];

    // Pricing recommendations
    if (deal.askingPrice > financial.maxAllowableOffer) {
      const targetPrice = financial.maxAllowableOffer;
      recommendations.push(`Negotiate price down to $${targetPrice.toLocaleString()} or below for optimal returns`);
    }

    // Due diligence recommendations
    recommendations.push('Order professional inspection before finalizing offer');

    if (deal.yearBuilt && deal.yearBuilt < 1980) {
      recommendations.push('Recommend sewer scope and electrical panel inspection for older property');
    }

    // Exit strategy recommendations
    if (market.marketTemperature === 'hot' || market.marketTemperature === 'warm') {
      recommendations.push('Market conditions favor quick flip strategy - target 60-90 day renovation');
    } else {
      recommendations.push('Consider BRRRR strategy given current market conditions');
    }

    // Risk mitigation
    if (risk.overallRisk === 'high' || risk.overallRisk === 'critical') {
      recommendations.push('Given elevated risk level, build 20% contingency into repair budget');
    }

    // Financing recommendations
    recommendations.push(`Max funding needed: $${(deal.askingPrice + financial.estimatedRepairs).toLocaleString()}`);

    return recommendations;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private estimateArv(deal: NormalizedDeal): number {
    // Simple ARV estimation based on asking price
    // In production, use comparables and market data
    return deal.askingPrice * (1.3 + Math.random() * 0.2);
  }

  private estimateRepairs(deal: NormalizedDeal): number {
    // Simple repair estimation based on year built and sqft
    const baseCost = 15; // $ per sqft
    const ageFactor = deal.yearBuilt ? Math.max(1, (2024 - deal.yearBuilt) / 50) : 1.5;
    const sqft = deal.sqft || 1500;

    return Math.round(sqft * baseCost * ageFactor);
  }

  private estimateRent(deal: NormalizedDeal): number {
    // Simple rent estimation
    // 1% rule as rough estimate
    return Math.round(deal.askingPrice * 0.008);
  }

  private determineMarketTemperature(deal: NormalizedDeal): MarketAnalysis['marketTemperature'] {
    // In production, use real market data
    const temperatures: MarketAnalysis['marketTemperature'][] = ['hot', 'warm', 'neutral', 'cool', 'cold'];
    return temperatures[Math.floor(Math.random() * 3)]; // Bias towards warmer
  }

  private calculateOverallScore(
    financial: FinancialAnalysis,
    market: MarketAnalysis,
    risk: RiskAssessment
  ): number {
    let score = 50; // Base score

    // Financial factors (up to +30)
    if (financial.profitMargin >= 25) score += 30;
    else if (financial.profitMargin >= 20) score += 25;
    else if (financial.profitMargin >= 15) score += 20;
    else if (financial.profitMargin >= 10) score += 10;
    else if (financial.profitMargin >= 5) score += 5;

    // Market factors (up to +15)
    if (market.marketTemperature === 'hot') score += 15;
    else if (market.marketTemperature === 'warm') score += 10;
    else if (market.marketTemperature === 'neutral') score += 5;
    else if (market.marketTemperature === 'cool') score += 0;
    else score -= 5;

    // Risk factors (up to -25)
    if (risk.overallRisk === 'low') score += 5;
    else if (risk.overallRisk === 'medium') score -= 5;
    else if (risk.overallRisk === 'high') score -= 15;
    else score -= 25;

    return Math.max(0, Math.min(100, score));
  }

  private determineRecommendation(score: number, risk: RiskAssessment): DealAnalysis['recommendation'] {
    if (risk.overallRisk === 'critical') return 'pass';
    if (score >= 80) return 'strong_buy';
    if (score >= 65) return 'buy';
    if (score >= 50) return 'hold';
    return 'pass';
  }

  private calculateConfidence(deal: NormalizedDeal): number {
    let confidence = 50;

    if (deal.arv) confidence += 15;
    if (deal.repairEstimate) confidence += 10;
    if (deal.monthlyRent) confidence += 10;
    if (deal.photos && deal.photos.length > 5) confidence += 5;
    if (deal.yearBuilt) confidence += 5;
    if (deal.sqft) confidence += 5;

    return Math.min(100, confidence);
  }

  private mergeEnrichmentData(deal: NormalizedDeal, data: Record<string, any>): NormalizedDeal {
    const merged = { ...deal };

    // Only update fields that are missing or have higher confidence
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        if ((merged as any)[key] === undefined || (merged as any)[key] === null) {
          (merged as any)[key] = value;
        }
      }
    }

    // Merge into rawData for reference
    merged.rawData = {
      ...merged.rawData,
      enrichment: {
        ...(merged.rawData.enrichment || {}),
        ...data,
      },
    };

    return merged;
  }

  // ============================================================================
  // REAL ENRICHMENT PROVIDERS
  // ============================================================================

  /**
   * Real Zillow enrichment using MarketDataService (RapidAPI)
   * Fetches comprehensive property data including:
   * - Zestimate and rent estimate
   * - Price history and tax history
   * - Comparable sales
   * - Property details and photos
   */
  private async realZillowEnrich(deal: NormalizedDeal): Promise<EnrichmentResult> {
    try {
      const fullAddress = `${deal.address.street}, ${deal.address.city}, ${deal.address.state} ${deal.address.zip}`;
      console.log(`🏠 Enriching deal with real Zillow data: ${fullAddress}`);

      // Use the full property lookup for comprehensive data
      const result = await marketDataService.getFullPropertyLookup({
        address: fullAddress,
        city: deal.address.city,
        state: deal.address.state,
        zip: deal.address.zip,
      });

      if (!result || !result.property) {
        console.log('⚠️ No Zillow data found for property');
        return {
          success: false,
          provider: 'ZillowRealAPI',
          data: {},
          confidence: 0,
          timestamp: new Date(),
          error: 'Property not found in Zillow database',
        };
      }

      const prop = result.property;
      const comps = result.comparables;
      const priceHist = result.priceHistory;
      const taxHist = result.taxHistory;
      const images = result.images;

      // Extract and format the enrichment data
      const enrichmentData: Record<string, any> = {
        // Zillow ID
        zpid: prop.zpid,

        // Valuations
        zestimate: prop.zestimate,
        rentZestimate: prop.rentZestimate,
        arv: prop.zestimate, // Use Zestimate as ARV baseline
        taxAssessment: prop.taxAssessedValue,

        // Sale history
        lastSoldPrice: prop.lastSoldPrice,
        lastSoldDate: prop.lastSoldDate,

        // Property details
        sqft: prop.sqft,
        lotSize: prop.lotSize,
        yearBuilt: prop.yearBuilt,
        propertyType: prop.propertyType,
        bedrooms: prop.bedrooms,
        bathrooms: prop.bathrooms,

        // Location
        county: prop.county,

        // Comparables (extract from nested structure)
        comparables: comps?.comparables?.slice(0, 5),

        // Price history (extract from nested structure)
        priceHistory: priceHist?.history?.slice(0, 10),

        // Tax history (extract from nested structure)
        taxHistory: taxHist?.history?.slice(0, 5),

        // Photos
        photos: images?.photos?.slice(0, 20),

        // Market metrics (calculated from comps)
        medianCompPrice: this.calculateMedianCompPrice(comps?.comparables),
        avgPricePerSqft: this.calculateAvgPricePerSqft(comps?.comparables),
      };

      console.log(`✅ Zillow enrichment complete: zpid=${prop.zpid}, zestimate=$${prop.zestimate?.toLocaleString()}`);

      return {
        success: true,
        provider: 'ZillowRealAPI',
        data: enrichmentData,
        confidence: prop.zestimate ? 90 : 70, // Higher confidence with Zestimate
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('❌ Zillow enrichment failed:', error);
      return {
        success: false,
        provider: 'ZillowRealAPI',
        data: {},
        confidence: 0,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Calculate median price from comparable sales
   */
  private calculateMedianCompPrice(comparables?: any[]): number | undefined {
    if (!comparables || comparables.length === 0) return undefined;
    const prices = comparables.map(c => c.price || c.zestimate).filter(p => p > 0).sort((a, b) => a - b);
    if (prices.length === 0) return undefined;
    const mid = Math.floor(prices.length / 2);
    return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  }

  /**
   * Calculate average price per sqft from comparables
   */
  private calculateAvgPricePerSqft(comparables?: any[]): number | undefined {
    if (!comparables || comparables.length === 0) return undefined;
    const ppsfValues = comparables
      .filter(c => c.sqft && c.sqft > 0 && (c.price || c.zestimate))
      .map(c => (c.price || c.zestimate) / c.sqft);
    if (ppsfValues.length === 0) return undefined;
    return ppsfValues.reduce((a, b) => a + b, 0) / ppsfValues.length;
  }

  // ============================================================================
  // MOCK ENRICHMENT PROVIDERS (FALLBACKS)
  // ============================================================================

  private async mockZillowEnrich(deal: NormalizedDeal): Promise<EnrichmentResult> {
    await this.delay(100); // Simulate API call

    const baseValue = deal.askingPrice * 1.2;
    return {
      success: true,
      provider: 'ZillowAPI',
      data: {
        zestimate: baseValue * (0.95 + Math.random() * 0.1),
        rentZestimate: baseValue * 0.007,
        taxAssessment: baseValue * 0.8,
        lastSoldPrice: baseValue * 0.7,
        lastSoldDate: new Date(Date.now() - Math.random() * 365 * 5 * 24 * 60 * 60 * 1000),
      },
      confidence: 75,
      timestamp: new Date(),
    };
  }

  private async mockAttomEnrich(deal: NormalizedDeal): Promise<EnrichmentResult> {
    await this.delay(100);

    return {
      success: true,
      provider: 'AttomAPI',
      data: {
        ownerName: 'Property Owner',
        ownerType: 'individual',
        ownerOccupied: deal.occupancyStatus === 'owner',
        propertyClass: 'residential',
        buildingStyle: deal.propertyType || 'single_family',
        constructionType: 'frame',
        roofType: 'asphalt',
        heatingType: 'central',
        coolingType: 'central',
      },
      confidence: 85,
      timestamp: new Date(),
    };
  }

  private async mockRentometerEnrich(deal: NormalizedDeal): Promise<EnrichmentResult> {
    await this.delay(100);

    const baseRent = deal.askingPrice * 0.008;
    return {
      success: true,
      provider: 'RentometerAPI',
      data: {
        rentEstimate: Math.round(baseRent),
        rentLow: Math.round(baseRent * 0.85),
        rentHigh: Math.round(baseRent * 1.15),
        rentMedian: Math.round(baseRent * 0.98),
        rentPerSqft: deal.sqft ? baseRent / deal.sqft : 1,
        sampleSize: 15 + Math.floor(Math.random() * 20),
      },
      confidence: 70,
      timestamp: new Date(),
    };
  }

  private async mockMarketDataEnrich(deal: NormalizedDeal): Promise<EnrichmentResult> {
    await this.delay(100);

    return {
      success: true,
      provider: 'MarketDataAPI',
      data: {
        medianHomePrice: deal.askingPrice * (0.9 + Math.random() * 0.3),
        medianDaysOnMarket: 20 + Math.floor(Math.random() * 40),
        priceToRentRatio: 15 + Math.random() * 10,
        populationGrowth: Math.random() * 5,
        employmentRate: 93 + Math.random() * 5,
        medianIncome: 50000 + Math.random() * 50000,
      },
      confidence: 80,
      timestamp: new Date(),
    };
  }

  private async mockAIAnalysis(deal: NormalizedDeal): Promise<EnrichmentResult> {
    await this.delay(200);

    return {
      success: true,
      provider: 'AIAnalysis',
      data: {
        sentimentScore: 60 + Math.random() * 30,
        keyInsights: [
          'Property appears to be in a growing neighborhood',
          'Price point aligns with recent comparable sales',
          'Potential for value-add through cosmetic updates',
        ],
        suggestedImprovements: ['Kitchen update', 'Bathroom refresh', 'Landscaping'],
        investorProfile: 'fix_and_flip',
      },
      confidence: 65,
      timestamp: new Date(),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // CACHING
  // ============================================================================

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > new Date()) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expiry: new Date(Date.now() + this.cacheTimeout),
    });
  }
}

// Export singleton
export const dealAnalysisService = new DealAnalysisService();
export default dealAnalysisService;
