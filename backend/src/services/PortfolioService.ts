/**
 * Portfolio Service
 *
 * Manages user's owned properties with full financials:
 * - CRUD operations for portfolio properties
 * - Valuation tracking and updates
 * - Performance metrics (ROI, cash flow, equity)
 * - Portfolio summary and analytics
 */

import { Op } from 'sequelize';
import Portfolio, {
  PortfolioStatus,
  ValuationSource,
  PortfolioCreationAttributes,
} from '../models/Portfolio';
import MarketplaceUser from '../models/MarketplaceUser';
import { activityFeedService } from './ActivityFeedService';

// Portfolio summary
export interface PortfolioSummary {
  totalProperties: number;
  totalInvested: number;
  totalCurrentValue: number;
  totalEquity: number;
  totalMonthlyCashFlow: number;
  totalAnnualCashFlow: number;
  avgCashOnCashReturn: number;
  byStatus: Record<PortfolioStatus, number>;
  byState: Record<string, number>;
}

// Performance metrics
export interface PerformanceMetrics {
  overallROI: number;
  avgEquityPerProperty: number;
  avgMonthlyCashFlow: number;
  avgCashOnCashReturn: number;
  bestPerformer: {
    id: string;
    address: string;
    cashOnCashReturn: number;
  } | null;
  worstPerformer: {
    id: string;
    address: string;
    cashOnCashReturn: number;
  } | null;
}

// Equity history point
export interface EquityHistoryPoint {
  date: string;
  totalEquity: number;
  propertyCount: number;
}

// Cash flow summary
export interface CashFlowSummary {
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  netMonthlyCashFlow: number;
  annualProjection: number;
  avgOccupancyRate: number;
  incomeProducingCount: number;
}

class PortfolioService {
  /**
   * Add a property to the portfolio
   */
  async addProperty(
    userId: string,
    details: Omit<PortfolioCreationAttributes, 'userId' | 'id'>
  ): Promise<Portfolio> {
    const portfolio = await Portfolio.create({
      ...details,
      userId,
    });

    // Log activity
    MarketplaceUser.findByPk(userId).then((user) => {
      const propertyName = details.address
        ? `${details.address}${details.city ? `, ${details.city}` : ''}`
        : 'property';
      activityFeedService.createActivity({
        eventType: 'deal_created',
        actor: {
          type: 'user',
          id: userId,
          name: user?.name || user?.email || 'Unknown',
        },
        resource: {
          type: 'deal',
          id: portfolio.id,
          name: propertyName,
          url: `/portfolio/${portfolio.id}`,
        },
        action: 'added to portfolio',
        summary: `${user?.name || 'User'} added "${propertyName}" to portfolio`,
        details: {
          acquisitionPrice: details.acquisitionPrice,
          currentValue: details.currentValue,
          status: details.status,
        },
        importance: 'high',
      });
    }).catch(() => {}); // Non-blocking

    return portfolio;
  }

  /**
   * Update a portfolio property
   */
  async updateProperty(
    portfolioId: string,
    updates: Partial<PortfolioCreationAttributes>
  ): Promise<Portfolio> {
    const portfolio = await Portfolio.findByPk(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio property ${portfolioId} not found`);
    }

    await portfolio.update(updates);
    return portfolio;
  }

  /**
   * Remove a property from the portfolio
   */
  async removeProperty(portfolioId: string): Promise<void> {
    const portfolio = await Portfolio.findByPk(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio property ${portfolioId} not found`);
    }
    await portfolio.destroy();
  }

  /**
   * Get user's portfolio
   */
  async getUserPortfolio(
    userId: string,
    options: {
      status?: PortfolioStatus;
      state?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: Portfolio[]; total: number }> {
    const { status, state, limit = 50, offset = 0 } = options;

    const where: any = { userId };
    if (status) where.status = status;
    if (state) where.state = state;

    const { rows: items, count: total } = await Portfolio.findAndCountAll({
      where,
      order: [['acquisitionDate', 'DESC']],
      limit,
      offset,
    });

    return { items, total };
  }

  /**
   * Get a single portfolio property
   */
  async getProperty(portfolioId: string): Promise<Portfolio | null> {
    return Portfolio.findByPk(portfolioId);
  }

  /**
   * Update valuation for a property
   */
  async updateValuation(
    portfolioId: string,
    value: number,
    source: ValuationSource
  ): Promise<Portfolio> {
    const portfolio = await Portfolio.findByPk(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio property ${portfolioId} not found`);
    }

    portfolio.currentValue = value;
    portfolio.lastValuedAt = new Date();
    portfolio.valuationSource = source;
    portfolio.updateCalculatedFields();

    await portfolio.save();
    return portfolio;
  }

  /**
   * Mark a property as sold
   */
  async markAsSold(
    portfolioId: string,
    soldPrice: number,
    sellingCosts?: number
  ): Promise<Portfolio> {
    const portfolio = await Portfolio.findByPk(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio property ${portfolioId} not found`);
    }

    portfolio.status = 'sold';
    portfolio.soldPrice = soldPrice;
    portfolio.soldAt = new Date();
    portfolio.sellingCosts = sellingCosts;
    portfolio.updateCalculatedFields();

    await portfolio.save();
    return portfolio;
  }

  /**
   * Get portfolio summary for a user
   */
  async getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
    const portfolios = await Portfolio.findAll({
      where: { userId, status: { [Op.ne]: 'sold' } },
    });

    const byStatus: Record<PortfolioStatus, number> = {
      holding: 0,
      renting: 0,
      renovating: 0,
      listed_for_sale: 0,
      sold: 0,
    };

    const byState: Record<string, number> = {};

    let totalInvested = 0;
    let totalCurrentValue = 0;
    let totalEquity = 0;
    let totalMonthlyCashFlow = 0;
    let totalAnnualCashFlow = 0;
    let cashFlowProperties = 0;

    for (const p of portfolios) {
      byStatus[p.status]++;
      byState[p.state] = (byState[p.state] || 0) + 1;

      totalInvested += Number(p.totalInvested) || 0;
      totalCurrentValue += Number(p.currentValue) || Number(p.acquisitionPrice);
      totalEquity += Number(p.equity) || 0;

      if (p.monthlyCashFlow) {
        totalMonthlyCashFlow += Number(p.monthlyCashFlow);
        cashFlowProperties++;
      }
      if (p.annualCashFlow) {
        totalAnnualCashFlow += Number(p.annualCashFlow);
      }
    }

    // Calculate average CoC return
    const propertiesWithCoC = portfolios.filter(
      (p) => p.cashOnCashReturn != null
    );
    const avgCashOnCashReturn =
      propertiesWithCoC.length > 0
        ? propertiesWithCoC.reduce(
            (sum, p) => sum + (Number(p.cashOnCashReturn) || 0),
            0
          ) / propertiesWithCoC.length
        : 0;

    return {
      totalProperties: portfolios.length,
      totalInvested,
      totalCurrentValue,
      totalEquity,
      totalMonthlyCashFlow,
      totalAnnualCashFlow,
      avgCashOnCashReturn,
      byStatus,
      byState,
    };
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(userId: string): Promise<PerformanceMetrics> {
    const portfolios = await Portfolio.findAll({
      where: { userId, status: { [Op.ne]: 'sold' } },
    });

    if (portfolios.length === 0) {
      return {
        overallROI: 0,
        avgEquityPerProperty: 0,
        avgMonthlyCashFlow: 0,
        avgCashOnCashReturn: 0,
        bestPerformer: null,
        worstPerformer: null,
      };
    }

    // Calculate totals
    const totalInvested = portfolios.reduce(
      (sum, p) => sum + (Number(p.totalInvested) || 0),
      0
    );
    const totalEquity = portfolios.reduce(
      (sum, p) => sum + (Number(p.equity) || 0),
      0
    );
    const totalMonthlyCashFlow = portfolios.reduce(
      (sum, p) => sum + (Number(p.monthlyCashFlow) || 0),
      0
    );

    // Find best and worst performers by CoC return
    const withReturns = portfolios.filter((p) => p.cashOnCashReturn != null);
    let bestPerformer = null;
    let worstPerformer = null;

    if (withReturns.length > 0) {
      const sorted = [...withReturns].sort(
        (a, b) =>
          (Number(b.cashOnCashReturn) || 0) - (Number(a.cashOnCashReturn) || 0)
      );
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];

      bestPerformer = {
        id: best.id,
        address: best.address,
        cashOnCashReturn: Number(best.cashOnCashReturn) || 0,
      };
      worstPerformer = {
        id: worst.id,
        address: worst.address,
        cashOnCashReturn: Number(worst.cashOnCashReturn) || 0,
      };
    }

    return {
      overallROI: totalInvested > 0 ? (totalEquity / totalInvested) * 100 : 0,
      avgEquityPerProperty: totalEquity / portfolios.length,
      avgMonthlyCashFlow: totalMonthlyCashFlow / portfolios.length,
      avgCashOnCashReturn:
        withReturns.length > 0
          ? withReturns.reduce(
              (sum, p) => sum + (Number(p.cashOnCashReturn) || 0),
              0
            ) / withReturns.length
          : 0,
      bestPerformer,
      worstPerformer,
    };
  }

  /**
   * Get cash flow summary
   */
  async getCashFlowSummary(userId: string): Promise<CashFlowSummary> {
    const portfolios = await Portfolio.findAll({
      where: { userId, status: 'renting' },
    });

    let totalMonthlyIncome = 0;
    let totalMonthlyExpenses = 0;
    let totalOccupancy = 0;
    let occupancyCount = 0;

    for (const p of portfolios) {
      totalMonthlyIncome += Number(p.monthlyRent) || 0;
      totalMonthlyExpenses += Number(p.monthlyExpenses) || 0;

      if (p.occupancyRate != null) {
        totalOccupancy += Number(p.occupancyRate);
        occupancyCount++;
      }
    }

    const netMonthlyCashFlow = totalMonthlyIncome - totalMonthlyExpenses;

    return {
      totalMonthlyIncome,
      totalMonthlyExpenses,
      netMonthlyCashFlow,
      annualProjection: netMonthlyCashFlow * 12,
      avgOccupancyRate:
        occupancyCount > 0 ? totalOccupancy / occupancyCount : 100,
      incomeProducingCount: portfolios.length,
    };
  }

  /**
   * Get total portfolio value
   */
  async getTotalValue(userId: string): Promise<{
    totalValue: number;
    totalInvested: number;
    totalEquity: number;
  }> {
    const portfolios = await Portfolio.findAll({
      where: { userId, status: { [Op.ne]: 'sold' } },
    });

    const totalValue = portfolios.reduce(
      (sum, p) =>
        sum + (Number(p.currentValue) || Number(p.acquisitionPrice) || 0),
      0
    );
    const totalInvested = portfolios.reduce(
      (sum, p) => sum + (Number(p.totalInvested) || 0),
      0
    );
    const totalEquity = portfolios.reduce(
      (sum, p) => sum + (Number(p.equity) || 0),
      0
    );

    return { totalValue, totalInvested, totalEquity };
  }

  /**
   * Get sold properties for P&L analysis
   */
  async getSoldProperties(userId: string): Promise<{
    properties: Portfolio[];
    totalProfit: number;
    avgHoldingPeriod: number;
    avgReturn: number;
  }> {
    const properties = await Portfolio.findAll({
      where: { userId, status: 'sold' },
      order: [['soldAt', 'DESC']],
    });

    let totalProfit = 0;
    let totalHoldingMonths = 0;
    let totalReturn = 0;

    for (const p of properties) {
      const profit =
        (Number(p.soldPrice) || 0) -
        (Number(p.sellingCosts) || 0) -
        (Number(p.totalInvested) || 0);
      totalProfit += profit;
      totalHoldingMonths += p.getHoldingPeriodMonths();
      if (p.totalReturn) totalReturn += Number(p.totalReturn);
    }

    return {
      properties,
      totalProfit,
      avgHoldingPeriod:
        properties.length > 0 ? totalHoldingMonths / properties.length : 0,
      avgReturn: properties.length > 0 ? totalReturn / properties.length : 0,
    };
  }
}

export const portfolioService = new PortfolioService();
export default portfolioService;
