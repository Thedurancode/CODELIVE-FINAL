/**
 * Deal Comparison Service
 *
 * Compare multiple deals side-by-side with:
 * - Financial analysis (ROI, Cap Rate, Cash-on-Cash)
 * - Property comparison metrics
 * - Market comparison
 * - Scoring and ranking
 */

import { Op } from 'sequelize';
import Property from '../models/Property';
import DealAction from '../models/DealAction';
import { marketplaceService } from './MarketplaceService';
import { marketDataService } from './MarketDataService';

// ============================================================================
// TYPES
// ============================================================================

export interface DealComparison {
  deals: ComparedDeal[];
  summary: ComparisonSummary;
  winner: DealWinner | null;
  createdAt: Date;
}

export interface ComparedDeal {
  dealId: string;
  basic: BasicInfo;
  financial: FinancialMetrics;
  property: PropertyMetrics;
  market: MarketMetrics;
  engagement: EngagementMetrics;
  scores: DealScores;
  pros: string[];
  cons: string[];
}

export interface BasicInfo {
  address: string;
  city: string;
  state: string;
  zipCode?: string;
  price: number;
  listDate?: Date;
  daysOnMarket: number;
}

export interface FinancialMetrics {
  askingPrice: number;
  arv: number | null;
  equity: number | null;          // percentage
  equityAmount: number | null;    // dollar amount
  rehabCost: number | null;
  potentialProfit: number | null;
  profitMargin: number | null;    // percentage
  pricePerSqft: number | null;
  arvPerSqft: number | null;
  capRate: number | null;
  cashOnCash: number | null;
  breakEvenRent: number | null;
}

export interface PropertyMetrics {
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  lotSize: number | null;
  yearBuilt: number | null;
  condition: string | null;
  hasPool: boolean;
  hasGarage: boolean;
  hasHOA: boolean;
  hoaFees: number | null;
}

export interface MarketMetrics {
  medianAreaPrice: number | null;
  avgDaysOnMarket: number | null;
  priceVsMedian: number | null;   // percentage difference from median
  marketTrend: 'rising' | 'stable' | 'declining' | null;
  comparableCount: number;
  neighborhood: string | null;
}

export interface EngagementMetrics {
  views: number;
  likes: number;
  passes: number;
  offers: number;
  saves: number;
  likeRate: number;
  offerRate: number;
  avgViewDuration: number | null;
  competitionLevel: 'low' | 'medium' | 'high';
}

export interface DealScores {
  overall: number;            // 0-100
  financial: number;          // 0-100
  property: number;           // 0-100
  location: number;           // 0-100
  market: number;             // 0-100
  competition: number;        // 0-100 (inverse - lower competition = higher score)
}

export interface ComparisonSummary {
  bestValue: string | null;       // Deal ID with best financial metrics
  bestProperty: string | null;    // Deal ID with best property features
  lowestCompetition: string | null;
  highestROI: string | null;
  recommendations: string[];
}

export interface DealWinner {
  dealId: string;
  reasons: string[];
  score: number;
  runnerUp: string | null;
  margin: number;             // Score difference to runner-up
}

export interface ComparisonRequest {
  dealIds: string[];
  userId?: string;
  weights?: Partial<ComparisonWeights>;
}

export interface ComparisonWeights {
  financial: number;
  property: number;
  location: number;
  market: number;
  competition: number;
}

const DEFAULT_WEIGHTS: ComparisonWeights = {
  financial: 0.35,
  property: 0.20,
  location: 0.15,
  market: 0.15,
  competition: 0.15,
};

// ============================================================================
// DEAL COMPARISON SERVICE
// ============================================================================

class DealComparisonService {
  // ============================================================================
  // MAIN COMPARISON METHODS
  // ============================================================================

  /**
   * Compare multiple deals
   */
  async compareDeals(request: ComparisonRequest): Promise<DealComparison> {
    const { dealIds, userId, weights = {} } = request;

    if (dealIds.length < 2) {
      throw new Error('At least 2 deals are required for comparison');
    }

    if (dealIds.length > 5) {
      throw new Error('Maximum 5 deals can be compared at once');
    }

    // Fetch all deal data
    const deals = await this.fetchDeals(dealIds);

    // Build comparison for each deal
    const comparedDeals = await Promise.all(
      deals.map(async (deal) => this.buildComparedDeal(deal, userId))
    );

    // Calculate summary and winner
    const appliedWeights = { ...DEFAULT_WEIGHTS, ...weights };
    const summary = this.calculateSummary(comparedDeals);
    const winner = this.determineWinner(comparedDeals, appliedWeights);

    return {
      deals: comparedDeals,
      summary,
      winner,
      createdAt: new Date(),
    };
  }

  /**
   * Quick compare - just financial metrics
   */
  async quickCompare(dealIds: string[]): Promise<{
    deals: Array<{
      dealId: string;
      price: number;
      arv: number | null;
      equity: number | null;
      profit: number | null;
      pricePerSqft: number | null;
    }>;
    best: string;
  }> {
    const deals = await this.fetchDeals(dealIds);

    const compared = deals.map((deal) => ({
      dealId: deal.id,
      price: deal.price,
      arv: deal.arv || null,
      equity: deal.equity || null,
      profit: deal.arv && deal.price ? deal.arv - deal.price : null,
      pricePerSqft: deal.sqft && deal.price ? Math.round(deal.price / deal.sqft) : null,
    }));

    // Find best deal by profit margin
    const best = compared.reduce((a, b) => {
      const aProfit = a.profit || 0;
      const bProfit = b.profit || 0;
      return aProfit > bProfit ? a : b;
    });

    return {
      deals: compared,
      best: best.dealId,
    };
  }

  // ============================================================================
  // DEAL DATA FETCHING
  // ============================================================================

  private async fetchDeals(dealIds: string[]): Promise<any[]> {
    // First try to fetch from database
    const dbDeals = await Property.findAll({
      where: { id: { [Op.in]: dealIds } },
    });

    // For any deals not in database, use mock data
    const foundIds = new Set(dbDeals.map((d) => String(d.id)));
    const mockDeals = dealIds
      .filter((id) => !foundIds.has(String(id)))
      .map((id) => this.getMockDeal(id))
      .filter(Boolean);

    return [...dbDeals.map((d) => d.toJSON()), ...mockDeals];
  }

  private getMockDeal(dealId: string): any {
    // Mock deals for testing
    const mockDeals: Record<string, any> = {
      'deal-001': {
        id: 'deal-001',
        address: '123 Main St',
        city: 'Dallas',
        state: 'TX',
        price: 180000,
        arv: 250000,
        equity: 28,
        propertyType: 'single_family',
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1800,
        yearBuilt: 1985,
        hasPool: false,
        hasGarage: true,
        hasHOA: false,
        createdAt: new Date(),
      },
      'deal-002': {
        id: 'deal-002',
        address: '456 Oak Ave',
        city: 'Houston',
        state: 'TX',
        price: 225000,
        arv: 310000,
        equity: 27,
        propertyType: 'single_family',
        bedrooms: 4,
        bathrooms: 2.5,
        sqft: 2200,
        yearBuilt: 1992,
        hasPool: true,
        hasGarage: true,
        hasHOA: true,
        hoaFees: 150,
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
      'deal-003': {
        id: 'deal-003',
        address: '789 Palm Dr',
        city: 'Tampa',
        state: 'FL',
        price: 145000,
        arv: 195000,
        equity: 25,
        propertyType: 'townhouse',
        bedrooms: 2,
        bathrooms: 2,
        sqft: 1400,
        yearBuilt: 2005,
        hasPool: false,
        hasGarage: false,
        hasHOA: true,
        hoaFees: 200,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    };

    return mockDeals[dealId] || null;
  }

  // ============================================================================
  // BUILD COMPARED DEAL
  // ============================================================================

  private async buildComparedDeal(deal: any, userId?: string): Promise<ComparedDeal> {
    const financial = this.calculateFinancialMetrics(deal);
    const property = this.extractPropertyMetrics(deal);
    const market = await this.getMarketMetrics(deal);
    const engagement = await this.getEngagementMetrics(deal.id);
    const scores = this.calculateScores(financial, property, market, engagement);
    const { pros, cons } = this.analyzeProsAndCons(deal, financial, engagement);

    return {
      dealId: deal.id,
      basic: {
        address: deal.address || 'Unknown',
        city: deal.city || 'Unknown',
        state: deal.state || 'Unknown',
        zipCode: deal.zipCode,
        price: deal.price,
        listDate: deal.createdAt,
        daysOnMarket: this.calculateDaysOnMarket(deal.createdAt),
      },
      financial,
      property,
      market,
      engagement,
      scores,
      pros,
      cons,
    };
  }

  // ============================================================================
  // FINANCIAL METRICS
  // ============================================================================

  private calculateFinancialMetrics(deal: any): FinancialMetrics {
    const price = deal.price || 0;
    const arv = deal.arv || null;
    const rehabCost = deal.rehabCost || null;
    const sqft = deal.sqft || null;

    // Equity calculations
    let equity: number | null = null;
    let equityAmount: number | null = null;
    if (arv && price) {
      equityAmount = arv - price;
      equity = Math.round((equityAmount / arv) * 100);
    } else if (deal.equity) {
      equity = deal.equity;
      equityAmount = arv && equity ? Math.round(arv * (equity / 100)) : null;
    }

    // Profit calculations
    let potentialProfit: number | null = null;
    let profitMargin: number | null = null;
    if (arv && price) {
      potentialProfit = arv - price - (rehabCost || 0);
      profitMargin = Math.round((potentialProfit / price) * 100);
    }

    // Per sqft calculations
    const pricePerSqft = sqft ? Math.round(price / sqft) : null;
    const arvPerSqft = arv && sqft ? Math.round(arv / sqft) : null;

    // Investment metrics (estimated)
    const capRate = this.estimateCapRate(deal);
    const cashOnCash = this.estimateCashOnCash(deal);
    const breakEvenRent = this.calculateBreakEvenRent(deal);

    return {
      askingPrice: price,
      arv,
      equity,
      equityAmount,
      rehabCost,
      potentialProfit,
      profitMargin,
      pricePerSqft,
      arvPerSqft,
      capRate,
      cashOnCash,
      breakEvenRent,
    };
  }

  private estimateCapRate(deal: any): number | null {
    // Estimate based on typical rent-to-price ratios
    const price = deal.price;
    if (!price) return null;

    // Rough estimate: 1% rule for monthly rent
    const estimatedMonthlyRent = price * 0.008; // 0.8% (conservative)
    const annualRent = estimatedMonthlyRent * 12;
    const expenses = annualRent * 0.4; // 40% expense ratio estimate
    const noi = annualRent - expenses;

    return Math.round((noi / price) * 100 * 10) / 10;
  }

  private estimateCashOnCash(deal: any): number | null {
    const price = deal.price;
    if (!price) return null;

    // Assume 25% down payment
    const downPayment = price * 0.25;
    const loanAmount = price * 0.75;
    const monthlyPayment = (loanAmount * 0.07) / 12; // Rough estimate at 7% rate

    const estimatedMonthlyRent = price * 0.008;
    const expenses = estimatedMonthlyRent * 0.4;
    const cashFlow = estimatedMonthlyRent - expenses - monthlyPayment;
    const annualCashFlow = cashFlow * 12;

    return Math.round((annualCashFlow / downPayment) * 100 * 10) / 10;
  }

  private calculateBreakEvenRent(deal: any): number | null {
    const price = deal.price;
    if (!price) return null;

    // Calculate minimum rent needed to break even
    const downPayment = price * 0.25;
    const loanAmount = price * 0.75;
    const monthlyPayment = (loanAmount * 0.07) / 12;
    const taxes = price * 0.015 / 12; // 1.5% annual property tax
    const insurance = price * 0.005 / 12; // 0.5% annual insurance
    const maintenance = price * 0.01 / 12; // 1% annual maintenance

    return Math.round(monthlyPayment + taxes + insurance + maintenance);
  }

  // ============================================================================
  // PROPERTY METRICS
  // ============================================================================

  private extractPropertyMetrics(deal: any): PropertyMetrics {
    return {
      propertyType: deal.propertyType || 'unknown',
      bedrooms: deal.bedrooms || null,
      bathrooms: deal.bathrooms || null,
      sqft: deal.sqft || null,
      lotSize: deal.lotSize || null,
      yearBuilt: deal.yearBuilt || null,
      condition: deal.condition || null,
      hasPool: deal.hasPool || false,
      hasGarage: deal.hasGarage || false,
      hasHOA: deal.hasHOA || false,
      hoaFees: deal.hoaFees || null,
    };
  }

  // ============================================================================
  // MARKET METRICS
  // ============================================================================

  private async getMarketMetrics(deal: any): Promise<MarketMetrics> {
    try {
      // Build address for market data lookup
      const address = `${deal.streetAddress || deal.address}, ${deal.city}, ${deal.state} ${deal.zipCode || deal.zip || ''}`.trim();

      // Fetch real market data from Zillow API
      const marketData = await marketDataService.getMarketData({
        address,
        city: deal.city,
        state: deal.state,
        zip: deal.zipCode || deal.zip,
      });

      // Use Zestimate or state median as the area median
      const medianAreaPrice = marketData.zestimate ||
        marketData.neighborhoodMedianPrice ||
        marketData.cityMedianPrice ||
        marketData.stateMedianPrice ||
        300000;

      const priceVsMedian = deal.price
        ? Math.round(((deal.price - medianAreaPrice) / medianAreaPrice) * 100)
        : null;

      // Determine market trend from price change data
      let marketTrend: 'rising' | 'stable' | 'declining' | null = 'stable';
      if (marketData.priceChange1Year !== null && marketData.priceChange1Year !== undefined) {
        if (marketData.priceChange1Year >= 3) {
          marketTrend = 'rising';
        } else if (marketData.priceChange1Year <= -3) {
          marketTrend = 'declining';
        } else {
          marketTrend = 'stable';
        }
      }

      return {
        medianAreaPrice,
        avgDaysOnMarket: marketData.daysOnMarket || 35,
        priceVsMedian,
        marketTrend,
        comparableCount: marketData.comparables?.length || 0,
        neighborhood: deal.neighborhood || null,
      };
    } catch (error) {
      console.error('Failed to get market metrics:', error);

      // Fallback to basic state-level estimates
      const fallbackMedians: Record<string, number> = {
        TX: 320000, FL: 400000, GA: 330000, AZ: 440000, NC: 320000,
        CA: 750000, NY: 450000, WA: 580000, CO: 550000, TN: 320000,
      };

      const medianAreaPrice = fallbackMedians[deal.state] || 300000;
      const priceVsMedian = deal.price
        ? Math.round(((deal.price - medianAreaPrice) / medianAreaPrice) * 100)
        : null;

      return {
        medianAreaPrice,
        avgDaysOnMarket: 35,
        priceVsMedian,
        marketTrend: 'stable',
        comparableCount: 0,
        neighborhood: deal.neighborhood || null,
      };
    }
  }

  // ============================================================================
  // ENGAGEMENT METRICS
  // ============================================================================

  private async getEngagementMetrics(dealId: string): Promise<EngagementMetrics> {
    // Get actions for this deal
    const actions = await DealAction.findAll({
      where: { dealId },
    });

    const views = actions.filter((a) => a.actionType === 'view').length;
    const likes = actions.filter((a) => a.actionType === 'like').length;
    const passes = actions.filter((a) => a.actionType === 'pass').length;
    const offers = actions.filter((a) => a.actionType === 'offer').length;
    const saves = actions.filter((a) => a.actionType === 'save').length;

    const likeRate = views > 0 ? Math.round((likes / views) * 100) : 0;
    const offerRate = likes > 0 ? Math.round((offers / likes) * 100) : 0;

    const viewDurations = actions
      .filter((a) => a.viewDuration)
      .map((a) => a.viewDuration!);
    const avgViewDuration = viewDurations.length > 0
      ? viewDurations.reduce((a, b) => a + b, 0) / viewDurations.length
      : null;

    // Determine competition level
    let competitionLevel: 'low' | 'medium' | 'high' = 'low';
    if (offers >= 5 || likes >= 20) {
      competitionLevel = 'high';
    } else if (offers >= 2 || likes >= 10) {
      competitionLevel = 'medium';
    }

    return {
      views,
      likes,
      passes,
      offers,
      saves,
      likeRate,
      offerRate,
      avgViewDuration,
      competitionLevel,
    };
  }

  // ============================================================================
  // SCORING
  // ============================================================================

  private calculateScores(
    financial: FinancialMetrics,
    property: PropertyMetrics,
    market: MarketMetrics,
    engagement: EngagementMetrics
  ): DealScores {
    const financialScore = this.scoreFinancial(financial);
    const propertyScore = this.scoreProperty(property);
    const locationScore = 70; // Would need location data API
    const marketScore = this.scoreMarket(market);
    const competitionScore = this.scoreCompetition(engagement);

    // Weighted overall score
    const overall = Math.round(
      financialScore * 0.35 +
      propertyScore * 0.20 +
      locationScore * 0.15 +
      marketScore * 0.15 +
      competitionScore * 0.15
    );

    return {
      overall,
      financial: financialScore,
      property: propertyScore,
      location: locationScore,
      market: marketScore,
      competition: competitionScore,
    };
  }

  private scoreFinancial(metrics: FinancialMetrics): number {
    let score = 50; // Base score

    // Equity scoring (max +30)
    if (metrics.equity) {
      if (metrics.equity >= 30) score += 30;
      else if (metrics.equity >= 25) score += 25;
      else if (metrics.equity >= 20) score += 15;
      else if (metrics.equity >= 15) score += 5;
    }

    // Profit margin scoring (max +15)
    if (metrics.profitMargin) {
      if (metrics.profitMargin >= 40) score += 15;
      else if (metrics.profitMargin >= 30) score += 10;
      else if (metrics.profitMargin >= 20) score += 5;
    }

    // Cap rate (max +5)
    if (metrics.capRate && metrics.capRate >= 6) {
      score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  private scoreProperty(metrics: PropertyMetrics): number {
    let score = 60; // Base score

    // Bedrooms
    if (metrics.bedrooms && metrics.bedrooms >= 3) score += 10;

    // Bathrooms
    if (metrics.bathrooms && metrics.bathrooms >= 2) score += 5;

    // Sqft
    if (metrics.sqft && metrics.sqft >= 1500) score += 10;

    // Year built
    if (metrics.yearBuilt && metrics.yearBuilt >= 1990) score += 5;

    // Features
    if (metrics.hasGarage) score += 5;
    if (!metrics.hasHOA) score += 5; // No HOA is often preferred

    return Math.min(100, Math.max(0, score));
  }

  private scoreMarket(metrics: MarketMetrics): number {
    let score = 60; // Base score

    // Below median price is good
    if (metrics.priceVsMedian && metrics.priceVsMedian < 0) {
      score += Math.min(20, Math.abs(metrics.priceVsMedian));
    }

    // Market trend
    if (metrics.marketTrend === 'rising') score += 10;
    if (metrics.marketTrend === 'stable') score += 5;

    // Comparables available
    if (metrics.comparableCount >= 5) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  private scoreCompetition(metrics: EngagementMetrics): number {
    // Lower competition = higher score
    switch (metrics.competitionLevel) {
      case 'low':
        return 90;
      case 'medium':
        return 60;
      case 'high':
        return 30;
      default:
        return 50;
    }
  }

  // ============================================================================
  // PROS AND CONS ANALYSIS
  // ============================================================================

  private analyzeProsAndCons(
    deal: any,
    financial: FinancialMetrics,
    engagement: EngagementMetrics
  ): { pros: string[]; cons: string[] } {
    const pros: string[] = [];
    const cons: string[] = [];

    // Financial pros/cons
    if (financial.equity && financial.equity >= 25) {
      pros.push(`Strong equity position (${financial.equity}%)`);
    } else if (financial.equity && financial.equity < 15) {
      cons.push(`Limited equity (${financial.equity}%)`);
    }

    if (financial.profitMargin && financial.profitMargin >= 30) {
      pros.push(`Excellent profit margin (${financial.profitMargin}%)`);
    }

    if (financial.pricePerSqft && financial.pricePerSqft < 100) {
      pros.push(`Low price per sqft ($${financial.pricePerSqft})`);
    }

    // Property pros/cons
    if (deal.bedrooms >= 3 && deal.bathrooms >= 2) {
      pros.push('3+ bed, 2+ bath - broad appeal');
    }

    if (deal.hasGarage) {
      pros.push('Has garage');
    }

    if (!deal.hasHOA) {
      pros.push('No HOA fees');
    } else if (deal.hoaFees && deal.hoaFees > 200) {
      cons.push(`High HOA fees ($${deal.hoaFees}/mo)`);
    }

    if (deal.yearBuilt && deal.yearBuilt < 1970) {
      cons.push(`Older property (built ${deal.yearBuilt})`);
    }

    // Competition
    if (engagement.competitionLevel === 'low') {
      pros.push('Low competition - fewer offers');
    } else if (engagement.competitionLevel === 'high') {
      cons.push(`High competition (${engagement.offers} offers)`);
    }

    return { pros: pros.slice(0, 5), cons: cons.slice(0, 5) };
  }

  // ============================================================================
  // SUMMARY AND WINNER
  // ============================================================================

  private calculateSummary(deals: ComparedDeal[]): ComparisonSummary {
    // Find best in each category
    const bestValue = deals.reduce((a, b) =>
      (a.financial.potentialProfit || 0) > (b.financial.potentialProfit || 0) ? a : b
    ).dealId;

    const bestProperty = deals.reduce((a, b) =>
      a.scores.property > b.scores.property ? a : b
    ).dealId;

    const lowestCompetition = deals.reduce((a, b) =>
      a.scores.competition > b.scores.competition ? a : b
    ).dealId;

    const highestROI = deals.reduce((a, b) =>
      (a.financial.profitMargin || 0) > (b.financial.profitMargin || 0) ? a : b
    ).dealId;

    // Generate recommendations
    const recommendations: string[] = [];

    if (bestValue === highestROI) {
      const deal = deals.find((d) => d.dealId === bestValue);
      recommendations.push(
        `${deal?.basic.address} offers the best value with highest profit potential`
      );
    }

    if (lowestCompetition !== bestValue) {
      const deal = deals.find((d) => d.dealId === lowestCompetition);
      recommendations.push(
        `${deal?.basic.address} has the lowest competition - may close faster`
      );
    }

    const highestEquity = deals.reduce((a, b) =>
      (a.financial.equity || 0) > (b.financial.equity || 0) ? a : b
    );
    if (highestEquity.financial.equity && highestEquity.financial.equity >= 25) {
      recommendations.push(
        `${highestEquity.basic.address} has the strongest equity position for financing`
      );
    }

    return {
      bestValue,
      bestProperty,
      lowestCompetition,
      highestROI,
      recommendations,
    };
  }

  private determineWinner(deals: ComparedDeal[], weights: ComparisonWeights): DealWinner | null {
    if (deals.length === 0) return null;

    // Calculate weighted scores
    const scored = deals.map((deal) => ({
      dealId: deal.dealId,
      weightedScore:
        deal.scores.financial * weights.financial +
        deal.scores.property * weights.property +
        deal.scores.location * weights.location +
        deal.scores.market * weights.market +
        deal.scores.competition * weights.competition,
      deal,
    }));

    // Sort by score
    scored.sort((a, b) => b.weightedScore - a.weightedScore);

    const winner = scored[0];
    const runnerUp = scored.length > 1 ? scored[1] : null;

    // Determine winning reasons
    const reasons: string[] = [];
    const winnerDeal = winner.deal;

    if (winnerDeal.scores.financial > 80) {
      reasons.push('Best financial metrics');
    }
    if (winnerDeal.scores.property > 80) {
      reasons.push('Superior property features');
    }
    if (winnerDeal.scores.competition > 80) {
      reasons.push('Low competition');
    }
    if (winnerDeal.financial.equity && winnerDeal.financial.equity >= 25) {
      reasons.push(`Strong ${winnerDeal.financial.equity}% equity`);
    }

    if (reasons.length === 0) {
      reasons.push('Best overall score across all criteria');
    }

    return {
      dealId: winner.dealId,
      reasons,
      score: Math.round(winner.weightedScore),
      runnerUp: runnerUp?.dealId || null,
      margin: runnerUp ? Math.round(winner.weightedScore - runnerUp.weightedScore) : 0,
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private calculateDaysOnMarket(listDate: Date | undefined): number {
    if (!listDate) return 0;
    const now = new Date();
    const diff = now.getTime() - new Date(listDate).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }
}

export const dealComparisonService = new DealComparisonService();
export default dealComparisonService;
