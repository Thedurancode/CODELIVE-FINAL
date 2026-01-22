/**
 * Portfolio Service Unit Tests
 *
 * Tests for owned property portfolio management:
 * - CRUD operations for portfolio properties
 * - Valuation tracking and updates
 * - Performance metrics calculation
 * - Cash flow analysis
 */

import { portfolioService } from '../../services/PortfolioService';
import Portfolio from '../../models/Portfolio';

// Mock Portfolio model
jest.mock('../../models/Portfolio', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
  },
}));

describe('PortfolioService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // ADD PROPERTY TESTS
  // ============================================================================

  describe('addProperty', () => {
    it('should add a new property to portfolio', async () => {
      const mockPortfolio = {
        id: 'portfolio-123',
        userId: 'user-123',
        address: '123 Main St',
        acquisitionPrice: 150000,
      };

      (Portfolio.create as jest.Mock).mockResolvedValue(mockPortfolio);

      const result = await portfolioService.addProperty('user-123', {
        address: '123 Main St',
        city: 'Austin',
        state: 'TX',
        propertyType: 'SFR',
        acquisitionDate: new Date(),
        acquisitionPrice: 150000,
        acquisitionSource: 'pipeline',
        totalInvested: 175000,
        status: 'renting',
      });

      expect(Portfolio.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          address: '123 Main St',
          acquisitionPrice: 150000,
        })
      );
      expect(result).toEqual(mockPortfolio);
    });
  });

  // ============================================================================
  // UPDATE PROPERTY TESTS
  // ============================================================================

  describe('updateProperty', () => {
    it('should update portfolio property', async () => {
      const mockPortfolio = {
        id: 'portfolio-123',
        address: '123 Main St',
        monthlyRent: 1500,
        update: jest.fn().mockResolvedValue(true),
      };

      (Portfolio.findByPk as jest.Mock).mockResolvedValue(mockPortfolio);

      const result = await portfolioService.updateProperty('portfolio-123', {
        monthlyRent: 1800,
      });

      expect(mockPortfolio.update).toHaveBeenCalledWith({ monthlyRent: 1800 });
      expect(result).toEqual(mockPortfolio);
    });

    it('should throw error if property not found', async () => {
      (Portfolio.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        portfolioService.updateProperty('nonexistent', { monthlyRent: 1800 })
      ).rejects.toThrow('Portfolio property nonexistent not found');
    });
  });

  // ============================================================================
  // REMOVE PROPERTY TESTS
  // ============================================================================

  describe('removeProperty', () => {
    it('should remove property from portfolio', async () => {
      const mockPortfolio = {
        id: 'portfolio-123',
        destroy: jest.fn().mockResolvedValue(true),
      };

      (Portfolio.findByPk as jest.Mock).mockResolvedValue(mockPortfolio);

      await portfolioService.removeProperty('portfolio-123');

      expect(mockPortfolio.destroy).toHaveBeenCalled();
    });

    it('should throw error if property not found', async () => {
      (Portfolio.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        portfolioService.removeProperty('nonexistent')
      ).rejects.toThrow('Portfolio property nonexistent not found');
    });
  });

  // ============================================================================
  // GET USER PORTFOLIO TESTS
  // ============================================================================

  describe('getUserPortfolio', () => {
    it('should return user portfolio with pagination', async () => {
      const mockItems = [
        { id: 'p1', address: '123 Main St' },
        { id: 'p2', address: '456 Oak Ave' },
      ];

      (Portfolio.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: mockItems,
        count: 2,
      });

      const result = await portfolioService.getUserPortfolio('user-123');

      expect(Portfolio.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
          limit: 50,
          offset: 0,
        })
      );
      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(2);
    });

    it('should filter by status', async () => {
      (Portfolio.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await portfolioService.getUserPortfolio('user-123', { status: 'renting' });

      expect(Portfolio.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123', status: 'renting' },
        })
      );
    });

    it('should filter by state', async () => {
      (Portfolio.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await portfolioService.getUserPortfolio('user-123', { state: 'TX' });

      expect(Portfolio.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123', state: 'TX' },
        })
      );
    });

    it('should respect pagination options', async () => {
      (Portfolio.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 100,
      });

      await portfolioService.getUserPortfolio('user-123', {
        limit: 20,
        offset: 40,
      });

      expect(Portfolio.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
          offset: 40,
        })
      );
    });
  });

  // ============================================================================
  // UPDATE VALUATION TESTS
  // ============================================================================

  describe('updateValuation', () => {
    it('should update property valuation', async () => {
      const mockPortfolio = {
        id: 'portfolio-123',
        currentValue: 180000,
        lastValuedAt: null,
        valuationSource: 'manual',
        updateCalculatedFields: jest.fn(),
        save: jest.fn().mockResolvedValue(true),
      };

      (Portfolio.findByPk as jest.Mock).mockResolvedValue(mockPortfolio);

      const result = await portfolioService.updateValuation(
        'portfolio-123',
        220000,
        'zestimate'
      );

      expect(mockPortfolio.currentValue).toBe(220000);
      expect(mockPortfolio.valuationSource).toBe('zestimate');
      expect(mockPortfolio.lastValuedAt).toBeInstanceOf(Date);
      expect(mockPortfolio.updateCalculatedFields).toHaveBeenCalled();
      expect(mockPortfolio.save).toHaveBeenCalled();
    });

    it('should throw error if property not found', async () => {
      (Portfolio.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        portfolioService.updateValuation('nonexistent', 200000, 'manual')
      ).rejects.toThrow('Portfolio property nonexistent not found');
    });
  });

  // ============================================================================
  // MARK AS SOLD TESTS
  // ============================================================================

  describe('markAsSold', () => {
    it('should mark property as sold with price', async () => {
      const mockPortfolio: any = {
        id: 'portfolio-123',
        status: 'renting',
        soldPrice: null,
        soldAt: null,
        updateCalculatedFields: jest.fn(),
        save: jest.fn().mockResolvedValue(true),
      };

      (Portfolio.findByPk as jest.Mock).mockResolvedValue(mockPortfolio);

      await portfolioService.markAsSold('portfolio-123', 250000, 15000);

      expect(mockPortfolio.status).toBe('sold');
      expect(mockPortfolio.soldPrice).toBe(250000);
      expect(mockPortfolio.sellingCosts).toBe(15000);
      expect(mockPortfolio.soldAt).toBeInstanceOf(Date);
      expect(mockPortfolio.updateCalculatedFields).toHaveBeenCalled();
      expect(mockPortfolio.save).toHaveBeenCalled();
    });

    it('should throw error if property not found', async () => {
      (Portfolio.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        portfolioService.markAsSold('nonexistent', 250000)
      ).rejects.toThrow('Portfolio property nonexistent not found');
    });
  });

  // ============================================================================
  // PORTFOLIO SUMMARY TESTS
  // ============================================================================

  describe('getPortfolioSummary', () => {
    it('should calculate portfolio summary correctly', async () => {
      const mockPortfolios = [
        {
          status: 'renting',
          state: 'TX',
          totalInvested: 150000,
          currentValue: 180000,
          equity: 30000,
          monthlyCashFlow: 500,
          annualCashFlow: 6000,
          cashOnCashReturn: 12,
        },
        {
          status: 'holding',
          state: 'FL',
          totalInvested: 200000,
          currentValue: 220000,
          equity: 20000,
          monthlyCashFlow: null,
          annualCashFlow: null,
          cashOnCashReturn: null,
        },
      ];

      (Portfolio.findAll as jest.Mock).mockResolvedValue(mockPortfolios);

      const summary = await portfolioService.getPortfolioSummary('user-123');

      expect(summary.totalProperties).toBe(2);
      expect(summary.totalInvested).toBe(350000);
      expect(summary.totalCurrentValue).toBe(400000);
      expect(summary.totalEquity).toBe(50000);
      expect(summary.totalMonthlyCashFlow).toBe(500);
      expect(summary.byStatus.renting).toBe(1);
      expect(summary.byStatus.holding).toBe(1);
      expect(summary.byState.TX).toBe(1);
      expect(summary.byState.FL).toBe(1);
      expect(summary.avgCashOnCashReturn).toBe(12); // Only one property has CoC
    });

    it('should handle empty portfolio', async () => {
      (Portfolio.findAll as jest.Mock).mockResolvedValue([]);

      const summary = await portfolioService.getPortfolioSummary('user-123');

      expect(summary.totalProperties).toBe(0);
      expect(summary.totalInvested).toBe(0);
      expect(summary.avgCashOnCashReturn).toBe(0);
    });
  });

  // ============================================================================
  // PERFORMANCE METRICS TESTS
  // ============================================================================

  describe('getPerformanceMetrics', () => {
    it('should calculate performance metrics correctly', async () => {
      const mockPortfolios = [
        {
          id: 'p1',
          address: '123 Main St',
          totalInvested: 100000,
          equity: 20000,
          monthlyCashFlow: 500,
          cashOnCashReturn: 15,
        },
        {
          id: 'p2',
          address: '456 Oak Ave',
          totalInvested: 150000,
          equity: 30000,
          monthlyCashFlow: 400,
          cashOnCashReturn: 8,
        },
      ];

      (Portfolio.findAll as jest.Mock).mockResolvedValue(mockPortfolios);

      const metrics = await portfolioService.getPerformanceMetrics('user-123');

      expect(metrics.overallROI).toBe(20); // 50000 / 250000 * 100
      expect(metrics.avgEquityPerProperty).toBe(25000);
      expect(metrics.avgMonthlyCashFlow).toBe(450);
      expect(metrics.avgCashOnCashReturn).toBe(11.5);
      expect(metrics.bestPerformer?.id).toBe('p1');
      expect(metrics.bestPerformer?.cashOnCashReturn).toBe(15);
      expect(metrics.worstPerformer?.id).toBe('p2');
      expect(metrics.worstPerformer?.cashOnCashReturn).toBe(8);
    });

    it('should handle empty portfolio', async () => {
      (Portfolio.findAll as jest.Mock).mockResolvedValue([]);

      const metrics = await portfolioService.getPerformanceMetrics('user-123');

      expect(metrics.overallROI).toBe(0);
      expect(metrics.bestPerformer).toBeNull();
      expect(metrics.worstPerformer).toBeNull();
    });
  });

  // ============================================================================
  // CASH FLOW SUMMARY TESTS
  // ============================================================================

  describe('getCashFlowSummary', () => {
    it('should calculate cash flow summary for renting properties', async () => {
      const mockPortfolios = [
        {
          monthlyRent: 1500,
          monthlyExpenses: 500,
          occupancyRate: 95,
        },
        {
          monthlyRent: 2000,
          monthlyExpenses: 700,
          occupancyRate: 100,
        },
      ];

      (Portfolio.findAll as jest.Mock).mockResolvedValue(mockPortfolios);

      const summary = await portfolioService.getCashFlowSummary('user-123');

      expect(summary.totalMonthlyIncome).toBe(3500);
      expect(summary.totalMonthlyExpenses).toBe(1200);
      expect(summary.netMonthlyCashFlow).toBe(2300);
      expect(summary.annualProjection).toBe(27600);
      expect(summary.avgOccupancyRate).toBe(97.5);
      expect(summary.incomeProducingCount).toBe(2);
    });

    it('should only query renting properties', async () => {
      (Portfolio.findAll as jest.Mock).mockResolvedValue([]);

      await portfolioService.getCashFlowSummary('user-123');

      expect(Portfolio.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123', status: 'renting' },
        })
      );
    });
  });

  // ============================================================================
  // TOTAL VALUE TESTS
  // ============================================================================

  describe('getTotalValue', () => {
    it('should calculate total portfolio value', async () => {
      const mockPortfolios = [
        {
          currentValue: 200000,
          acquisitionPrice: 150000,
          totalInvested: 175000,
          equity: 25000,
        },
        {
          currentValue: null,
          acquisitionPrice: 180000,
          totalInvested: 200000,
          equity: 15000,
        },
      ];

      (Portfolio.findAll as jest.Mock).mockResolvedValue(mockPortfolios);

      const result = await portfolioService.getTotalValue('user-123');

      expect(result.totalValue).toBe(380000); // 200000 + 180000 (fallback)
      expect(result.totalInvested).toBe(375000);
      expect(result.totalEquity).toBe(40000);
    });
  });

  // ============================================================================
  // SOLD PROPERTIES TESTS
  // ============================================================================

  describe('getSoldProperties', () => {
    it('should return sold properties with P&L analysis', async () => {
      const mockPortfolios = [
        {
          soldPrice: 250000,
          sellingCosts: 15000,
          totalInvested: 175000,
          totalReturn: 30,
          getHoldingPeriodMonths: () => 18,
        },
        {
          soldPrice: 180000,
          sellingCosts: 10000,
          totalInvested: 150000,
          totalReturn: 12,
          getHoldingPeriodMonths: () => 12,
        },
      ];

      (Portfolio.findAll as jest.Mock).mockResolvedValue(mockPortfolios);

      const result = await portfolioService.getSoldProperties('user-123');

      expect(result.properties).toEqual(mockPortfolios);
      // Profit: (250000 - 15000 - 175000) + (180000 - 10000 - 150000) = 60000 + 20000 = 80000
      expect(result.totalProfit).toBe(80000);
      expect(result.avgHoldingPeriod).toBe(15); // (18 + 12) / 2
      expect(result.avgReturn).toBe(21); // (30 + 12) / 2
    });

    it('should handle no sold properties', async () => {
      (Portfolio.findAll as jest.Mock).mockResolvedValue([]);

      const result = await portfolioService.getSoldProperties('user-123');

      expect(result.properties).toEqual([]);
      expect(result.totalProfit).toBe(0);
      expect(result.avgHoldingPeriod).toBe(0);
      expect(result.avgReturn).toBe(0);
    });
  });
});
