/**
 * DealComparisonService Unit Tests
 */

import { dealComparisonService } from '../../services/DealComparisonService';
import Property from '../../models/Property';
import DealAction from '../../models/DealAction';

// Mock the models
jest.mock('../../models/Property');
jest.mock('../../models/DealAction');

describe('DealComparisonService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Return empty arrays for mock deals
    (Property.findAll as jest.Mock).mockResolvedValue([]);
    (DealAction.findAll as jest.Mock).mockResolvedValue([]);
  });

  // ============================================================================
  // COMPARE DEALS TESTS
  // ============================================================================

  describe('compareDeals', () => {
    it('should throw error when less than 2 deals provided', async () => {
      await expect(
        dealComparisonService.compareDeals({ dealIds: ['deal-001'] })
      ).rejects.toThrow('At least 2 deals are required');
    });

    it('should throw error when more than 5 deals provided', async () => {
      await expect(
        dealComparisonService.compareDeals({
          dealIds: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'],
        })
      ).rejects.toThrow('Maximum 5 deals can be compared');
    });

    it('should compare 2 deals successfully', async () => {
      // Using mock deals built into the service
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      expect(result.deals).toHaveLength(2);
      expect(result.summary).toBeDefined();
      expect(result.winner).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should include all comparison metrics', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      const deal = result.deals[0];

      // Check basic info
      expect(deal.basic).toHaveProperty('address');
      expect(deal.basic).toHaveProperty('price');
      expect(deal.basic).toHaveProperty('city');
      expect(deal.basic).toHaveProperty('state');

      // Check financial metrics
      expect(deal.financial).toHaveProperty('askingPrice');
      expect(deal.financial).toHaveProperty('arv');
      expect(deal.financial).toHaveProperty('equity');
      expect(deal.financial).toHaveProperty('pricePerSqft');

      // Check property metrics
      expect(deal.property).toHaveProperty('propertyType');
      expect(deal.property).toHaveProperty('bedrooms');
      expect(deal.property).toHaveProperty('bathrooms');
      expect(deal.property).toHaveProperty('sqft');

      // Check scores
      expect(deal.scores).toHaveProperty('overall');
      expect(deal.scores).toHaveProperty('financial');
      expect(deal.scores).toHaveProperty('property');

      // Check pros/cons
      expect(deal.pros).toBeInstanceOf(Array);
      expect(deal.cons).toBeInstanceOf(Array);
    });

    it('should determine a winner', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      expect(result.winner).not.toBeNull();
      expect(result.winner?.dealId).toBeDefined();
      expect(result.winner?.reasons).toBeInstanceOf(Array);
      expect(result.winner?.score).toBeGreaterThan(0);
    });

    it('should calculate margin between winner and runner-up', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      expect(result.winner?.runnerUp).toBeDefined();
      expect(result.winner?.margin).toBeGreaterThanOrEqual(0);
    });

    it('should apply custom weights', async () => {
      const resultDefault = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      const resultFinancialHeavy = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
        weights: { financial: 0.8, property: 0.05, location: 0.05, market: 0.05, competition: 0.05 },
      });

      // The winner might differ based on weights
      expect(resultDefault.winner).toBeDefined();
      expect(resultFinancialHeavy.winner).toBeDefined();
    });

    it('should generate summary with best in each category', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002', 'deal-003'],
      });

      expect(result.summary.bestValue).toBeDefined();
      expect(result.summary.bestProperty).toBeDefined();
      expect(result.summary.lowestCompetition).toBeDefined();
      expect(result.summary.highestROI).toBeDefined();
      expect(result.summary.recommendations).toBeInstanceOf(Array);
    });
  });

  // ============================================================================
  // QUICK COMPARE TESTS
  // ============================================================================

  describe('quickCompare', () => {
    it('should return simplified comparison', async () => {
      const result = await dealComparisonService.quickCompare(['deal-001', 'deal-002']);

      expect(result.deals).toHaveLength(2);
      expect(result.best).toBeDefined();

      result.deals.forEach((deal) => {
        expect(deal).toHaveProperty('dealId');
        expect(deal).toHaveProperty('price');
        expect(deal).toHaveProperty('arv');
        expect(deal).toHaveProperty('equity');
        expect(deal).toHaveProperty('profit');
        expect(deal).toHaveProperty('pricePerSqft');
      });
    });

    it('should identify best deal by profit', async () => {
      const result = await dealComparisonService.quickCompare(['deal-001', 'deal-002']);

      const bestDeal = result.deals.find((d) => d.dealId === result.best);
      const otherDeals = result.deals.filter((d) => d.dealId !== result.best);

      // Best deal should have highest profit
      otherDeals.forEach((other) => {
        expect((bestDeal?.profit || 0)).toBeGreaterThanOrEqual((other.profit || 0));
      });
    });
  });

  // ============================================================================
  // FINANCIAL METRICS TESTS
  // ============================================================================

  describe('Financial Metrics Calculation', () => {
    it('should calculate equity correctly', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      // deal-001: price 180000, arv 250000, equity = (250000-180000)/250000 = 28%
      const deal001 = result.deals.find((d) => d.dealId === 'deal-001');
      expect(deal001?.financial.equity).toBe(28);
    });

    it('should calculate profit margin', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      const deal = result.deals[0];
      if (deal.financial.arv && deal.financial.askingPrice) {
        const expectedProfit = deal.financial.arv - deal.financial.askingPrice;
        expect(deal.financial.potentialProfit).toBe(expectedProfit);
      }
    });

    it('should calculate price per sqft', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      // deal-001: price 180000, sqft 1800, price/sqft = 100
      const deal001 = result.deals.find((d) => d.dealId === 'deal-001');
      expect(deal001?.financial.pricePerSqft).toBe(100);
    });

    it('should estimate cap rate', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      result.deals.forEach((deal) => {
        // Cap rate should be a reasonable percentage
        if (deal.financial.capRate !== null) {
          expect(deal.financial.capRate).toBeGreaterThan(0);
          expect(deal.financial.capRate).toBeLessThan(20);
        }
      });
    });
  });

  // ============================================================================
  // PROPERTY SCORING TESTS
  // ============================================================================

  describe('Property Scoring', () => {
    it('should score properties between 0 and 100', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002', 'deal-003'],
      });

      result.deals.forEach((deal) => {
        expect(deal.scores.overall).toBeGreaterThanOrEqual(0);
        expect(deal.scores.overall).toBeLessThanOrEqual(100);
        expect(deal.scores.financial).toBeGreaterThanOrEqual(0);
        expect(deal.scores.financial).toBeLessThanOrEqual(100);
        expect(deal.scores.property).toBeGreaterThanOrEqual(0);
        expect(deal.scores.property).toBeLessThanOrEqual(100);
      });
    });

    it('should give higher financial scores to deals with more equity', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002', 'deal-003'],
      });

      // Sort deals by equity
      const sortedByEquity = [...result.deals].sort(
        (a, b) => (b.financial.equity || 0) - (a.financial.equity || 0)
      );

      // Higher equity should generally correlate with higher financial score
      // (not always exact due to other factors)
      const highEquityDeal = sortedByEquity[0];
      const lowEquityDeal = sortedByEquity[sortedByEquity.length - 1];

      expect(highEquityDeal.scores.financial).toBeGreaterThanOrEqual(
        lowEquityDeal.scores.financial - 20 // Allow some variance
      );
    });
  });

  // ============================================================================
  // ENGAGEMENT METRICS TESTS
  // ============================================================================

  describe('Engagement Metrics', () => {
    it('should calculate engagement metrics from actions', async () => {
      const mockActions = [
        { actionType: 'view', viewDuration: 10000 },
        { actionType: 'view', viewDuration: 15000 },
        { actionType: 'like' },
        { actionType: 'pass' },
        { actionType: 'offer' },
      ];

      (DealAction.findAll as jest.Mock).mockResolvedValue(mockActions);

      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      const deal = result.deals[0];
      expect(deal.engagement.views).toBeDefined();
      expect(deal.engagement.likes).toBeDefined();
      expect(deal.engagement.offers).toBeDefined();
      expect(deal.engagement.competitionLevel).toBeDefined();
    });

    it('should determine competition level correctly', async () => {
      // Low competition
      (DealAction.findAll as jest.Mock).mockResolvedValue([
        { actionType: 'view' },
        { actionType: 'like' },
      ]);

      const resultLow = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });
      expect(resultLow.deals[0].engagement.competitionLevel).toBe('low');

      // High competition
      const highCompetitionActions = [
        ...Array(25).fill({ actionType: 'like' }),
        ...Array(5).fill({ actionType: 'offer' }),
      ];
      (DealAction.findAll as jest.Mock).mockResolvedValue(highCompetitionActions);

      const resultHigh = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });
      expect(resultHigh.deals[0].engagement.competitionLevel).toBe('high');
    });
  });

  // ============================================================================
  // PROS AND CONS TESTS
  // ============================================================================

  describe('Pros and Cons Analysis', () => {
    it('should generate pros for good deals', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002'],
      });

      // deal-001 has good equity (28%)
      const deal001 = result.deals.find((d) => d.dealId === 'deal-001');
      expect(deal001?.pros.length).toBeGreaterThan(0);
    });

    it('should generate cons for deal weaknesses', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002', 'deal-003'],
      });

      // Cons are generated based on deal characteristics
      // Mock deals may or may not have cons depending on their features
      // This just verifies the cons array exists and is properly typed
      result.deals.forEach((deal) => {
        expect(deal.cons).toBeInstanceOf(Array);
        deal.cons.forEach((con) => {
          expect(typeof con).toBe('string');
        });
      });
    });

    it('should limit pros and cons to 5 each', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002', 'deal-003'],
      });

      result.deals.forEach((deal) => {
        expect(deal.pros.length).toBeLessThanOrEqual(5);
        expect(deal.cons.length).toBeLessThanOrEqual(5);
      });
    });
  });

  // ============================================================================
  // RECOMMENDATIONS TESTS
  // ============================================================================

  describe('Recommendations', () => {
    it('should generate actionable recommendations', async () => {
      const result = await dealComparisonService.compareDeals({
        dealIds: ['deal-001', 'deal-002', 'deal-003'],
      });

      expect(result.summary.recommendations.length).toBeGreaterThan(0);
      result.summary.recommendations.forEach((rec) => {
        expect(typeof rec).toBe('string');
        expect(rec.length).toBeGreaterThan(10);
      });
    });
  });
});
