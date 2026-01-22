/**
 * Portfolio Model
 *
 * Tracks user's owned properties with full financials:
 * - Acquisition details
 * - Current valuation
 * - Income and expenses
 * - Performance metrics (equity, cash flow, ROI)
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Portfolio status
export const PORTFOLIO_STATUSES = [
  'holding',
  'renting',
  'renovating',
  'listed_for_sale',
  'sold',
] as const;

export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number];

// Acquisition sources
export const ACQUISITION_SOURCES = ['pipeline', 'manual', 'import'] as const;
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

// Valuation sources
export const VALUATION_SOURCES = [
  'zestimate',
  'appraisal',
  'cma',
  'manual',
] as const;
export type ValuationSource = (typeof VALUATION_SOURCES)[number];

export interface PortfolioAttributes {
  id: string;
  userId: string;
  propertyId?: number;
  dealPipelineId?: string;

  // Property info (denormalized)
  address: string;
  city: string;
  state: string;
  zip?: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  yearBuilt?: number;

  // Acquisition
  acquisitionDate: Date;
  acquisitionPrice: number;
  acquisitionSource: AcquisitionSource;
  closingCosts?: number;

  // Current valuation
  currentValue?: number;
  lastValuedAt?: Date;
  valuationSource?: ValuationSource;

  // Costs
  rehabCost?: number;
  holdingCosts?: number;
  totalInvested: number;

  // Income (for rentals)
  monthlyRent?: number;
  monthlyExpenses?: number;
  occupancyRate?: number;

  // Status
  status: PortfolioStatus;

  // Sale info (if sold)
  soldPrice?: number;
  soldAt?: Date;
  sellingCosts?: number;

  // Calculated fields (stored for quick access)
  equity?: number;
  monthlyCashFlow?: number;
  annualCashFlow?: number;
  cashOnCashReturn?: number;
  totalReturn?: number;

  // Notes
  notes?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioCreationAttributes
  extends Optional<
    PortfolioAttributes,
    | 'id'
    | 'propertyId'
    | 'dealPipelineId'
    | 'zip'
    | 'bedrooms'
    | 'bathrooms'
    | 'sqft'
    | 'yearBuilt'
    | 'closingCosts'
    | 'currentValue'
    | 'lastValuedAt'
    | 'valuationSource'
    | 'rehabCost'
    | 'holdingCosts'
    | 'monthlyRent'
    | 'monthlyExpenses'
    | 'occupancyRate'
    | 'soldPrice'
    | 'soldAt'
    | 'sellingCosts'
    | 'equity'
    | 'monthlyCashFlow'
    | 'annualCashFlow'
    | 'cashOnCashReturn'
    | 'totalReturn'
    | 'notes'
    | 'createdAt'
    | 'updatedAt'
  > {}

class Portfolio
  extends Model<PortfolioAttributes, PortfolioCreationAttributes>
  implements PortfolioAttributes
{
  declare id: string;
  declare userId: string;
  declare propertyId?: number;
  declare dealPipelineId?: string;
  declare address: string;
  declare city: string;
  declare state: string;
  declare zip?: string;
  declare propertyType: string;
  declare bedrooms?: number;
  declare bathrooms?: number;
  declare sqft?: number;
  declare yearBuilt?: number;
  declare acquisitionDate: Date;
  declare acquisitionPrice: number;
  declare acquisitionSource: AcquisitionSource;
  declare closingCosts?: number;
  declare currentValue?: number;
  declare lastValuedAt?: Date;
  declare valuationSource?: ValuationSource;
  declare rehabCost?: number;
  declare holdingCosts?: number;
  declare totalInvested: number;
  declare monthlyRent?: number;
  declare monthlyExpenses?: number;
  declare occupancyRate?: number;
  declare status: PortfolioStatus;
  declare soldPrice?: number;
  declare soldAt?: Date;
  declare sellingCosts?: number;
  declare equity?: number;
  declare monthlyCashFlow?: number;
  declare annualCashFlow?: number;
  declare cashOnCashReturn?: number;
  declare totalReturn?: number;
  declare notes?: string;
  declare createdAt: Date;
  declare updatedAt: Date;

  /**
   * Calculate total invested (acquisition + rehab + holding + closing)
   */
  calculateTotalInvested(): number {
    return (
      (this.acquisitionPrice || 0) +
      (this.rehabCost || 0) +
      (this.holdingCosts || 0) +
      (this.closingCosts || 0)
    );
  }

  /**
   * Calculate current equity
   */
  calculateEquity(): number {
    const value = this.currentValue || this.acquisitionPrice;
    return value - this.calculateTotalInvested();
  }

  /**
   * Calculate monthly cash flow (rent - expenses)
   */
  calculateMonthlyCashFlow(): number {
    if (!this.monthlyRent) return 0;
    return (this.monthlyRent || 0) - (this.monthlyExpenses || 0);
  }

  /**
   * Calculate annual cash flow
   */
  calculateAnnualCashFlow(): number {
    const monthlyCF = this.calculateMonthlyCashFlow();
    const occupancy = (this.occupancyRate || 100) / 100;
    return monthlyCF * 12 * occupancy;
  }

  /**
   * Calculate Cash-on-Cash Return (annual cash flow / total invested)
   */
  calculateCashOnCashReturn(): number {
    const totalInvested = this.calculateTotalInvested();
    if (totalInvested === 0) return 0;
    const annualCF = this.calculateAnnualCashFlow();
    return (annualCF / totalInvested) * 100;
  }

  /**
   * Calculate total return (if sold)
   */
  calculateTotalReturn(): number | null {
    if (!this.soldPrice) return null;
    const netProceeds = this.soldPrice - (this.sellingCosts || 0);
    const totalInvested = this.calculateTotalInvested();
    return ((netProceeds - totalInvested) / totalInvested) * 100;
  }

  /**
   * Update all calculated fields
   */
  updateCalculatedFields(): void {
    this.totalInvested = this.calculateTotalInvested();
    this.equity = this.calculateEquity();
    this.monthlyCashFlow = this.calculateMonthlyCashFlow();
    this.annualCashFlow = this.calculateAnnualCashFlow();
    this.cashOnCashReturn = this.calculateCashOnCashReturn();
    this.totalReturn = this.calculateTotalReturn() || undefined;
  }

  /**
   * Get holding period in months
   */
  getHoldingPeriodMonths(): number {
    const endDate = this.soldAt || new Date();
    const startDate = this.acquisitionDate;
    const diffTime = endDate.getTime() - startDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
  }

  /**
   * Check if property is income-producing
   */
  isIncomeProducing(): boolean {
    return this.status === 'renting' && (this.monthlyRent || 0) > 0;
  }
}

Portfolio.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dealPipelineId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },
    zip: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    propertyType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bedrooms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    bathrooms: {
      type: DataTypes.DECIMAL(3, 1),
      allowNull: true,
    },
    sqft: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    yearBuilt: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    acquisitionDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    acquisitionPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    acquisitionSource: {
      type: DataTypes.ENUM(...ACQUISITION_SOURCES),
      allowNull: false,
      defaultValue: 'manual',
    },
    closingCosts: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    currentValue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    lastValuedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    valuationSource: {
      type: DataTypes.ENUM(...VALUATION_SOURCES),
      allowNull: true,
    },
    rehabCost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    holdingCosts: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    totalInvested: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    monthlyRent: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    monthlyExpenses: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    occupancyRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 100,
    },
    status: {
      type: DataTypes.ENUM(...PORTFOLIO_STATUSES),
      allowNull: false,
      defaultValue: 'holding',
    },
    soldPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    soldAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sellingCosts: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    equity: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    monthlyCashFlow: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    annualCashFlow: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    cashOnCashReturn: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: true,
    },
    totalReturn: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'portfolios',
    modelName: 'Portfolio',
    timestamps: true,
    hooks: {
      beforeSave: (instance: Portfolio) => {
        instance.updateCalculatedFields();
      },
    },
    indexes: [
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['userId', 'status'] },
      { fields: ['state'] },
      { fields: ['acquisitionDate'] },
      { fields: ['propertyId'] },
      { fields: ['dealPipelineId'] },
    ],
  }
);

export default Portfolio;
