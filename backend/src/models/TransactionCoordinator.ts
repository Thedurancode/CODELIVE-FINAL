/**
 * Transaction Coordinator Model
 *
 * Post-acceptance execution role. Activated when offer is accepted or deal
 * enters escrow/pending status. Coordinates documents, timelines, milestones.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type TCStatus = 'active' | 'inactive' | 'suspended';

interface TransactionCoordinatorAttributes {
  id: string;
  userId: string;
  licenseNumber?: string;
  licenseStates: string[];
  status: TCStatus;
  company?: string;
  phone?: string;
  email?: string;
  activeDeals: number;
  totalDealsCoordinated: number;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface TransactionCoordinatorCreationAttributes
  extends Optional<
    TransactionCoordinatorAttributes,
    | 'id'
    | 'licenseNumber'
    | 'licenseStates'
    | 'status'
    | 'company'
    | 'phone'
    | 'email'
    | 'activeDeals'
    | 'totalDealsCoordinated'
    | 'notes'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class TransactionCoordinator
  extends Model<TransactionCoordinatorAttributes, TransactionCoordinatorCreationAttributes>
  implements TransactionCoordinatorAttributes
{
  declare id: string;
  declare userId: string;
  declare licenseNumber: string | undefined;
  declare licenseStates: string[];
  declare status: TCStatus;
  declare company: string | undefined;
  declare phone: string | undefined;
  declare email: string | undefined;
  declare activeDeals: number;
  declare totalDealsCoordinated: number;
  declare notes: string | undefined;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if TC can operate in a specific state
   */
  canOperateIn(state: string): boolean {
    return this.licenseStates.includes(state.toUpperCase());
  }

  /**
   * Check if TC is active
   */
  isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Assign TC to a deal
   */
  async assignToDeal(dealId: string): Promise<void> {
    if (!this.isActive()) {
      throw new Error('Transaction coordinator is not active');
    }

    await this.update({
      activeDeals: this.activeDeals + 1,
      totalDealsCoordinated: this.totalDealsCoordinated + 1,
    });
  }

  /**
   * Complete a deal
   */
  async completeDeal(dealId: string): Promise<void> {
    await this.update({
      activeDeals: Math.max(0, this.activeDeals - 1),
    });
  }

  /**
   * Suspend TC
   */
  async suspend(reason: string): Promise<void> {
    await this.update({
      status: 'suspended',
      metadata: {
        ...this.metadata,
        suspendedAt: new Date(),
        suspendReason: reason,
      },
    });
  }

  /**
   * Reactivate suspended TC
   */
  async reactivate(): Promise<void> {
    await this.update({
      status: 'active',
      metadata: {
        ...this.metadata,
        reactivatedAt: new Date(),
      },
    });
  }

  /**
   * Get available TCs for a state
   */
  static async getAvailableTCs(state: string): Promise<TransactionCoordinator[]> {
    return TransactionCoordinator.findAll({
      where: {
        status: 'active',
        licenseStates: { [Op.contains]: [state.toUpperCase()] },
      },
      include: ['user'],
      order: [
        ['activeDeals', 'ASC'], // Prefer TCs with fewer active deals
        ['totalDealsCoordinated', 'DESC'], // Then by experience
      ],
    });
  }

  /**
   * Get TC's active deals
   */
  async getActiveDeals(): Promise<any[]> {
    // This would query the Deal/Property model for deals assigned to this TC
    // Implementation depends on how deals link to TCs
    return [];
  }

  /**
   * Add state to TC's license states
   */
  async addState(state: string): Promise<void> {
    const stateUpper = state.toUpperCase();
    if (!this.licenseStates.includes(stateUpper)) {
      await this.update({
        licenseStates: [...this.licenseStates, stateUpper],
      });
    }
  }

  /**
   * Remove state from TC's license states
   */
  async removeState(state: string): Promise<void> {
    const stateUpper = state.toUpperCase();
    await this.update({
      licenseStates: this.licenseStates.filter(s => s !== stateUpper),
    });
  }
}

import { Op } from 'sequelize';

TransactionCoordinator.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    licenseNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    licenseStates: {
      type: DataTypes.ARRAY(DataTypes.STRING(2)),
      defaultValue: [],
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended'),
      defaultValue: 'inactive',
    },
    company: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: { isEmail: true },
    },
    activeDeals: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalDealsCoordinated: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'transaction_coordinators',
    timestamps: true,
    indexes: [
      { fields: ['userId'], unique: true },
      { fields: ['status'] },
      { fields: ['licenseStates'] },
      { fields: ['status', 'licenseStates'] },
    ],
  }
);

export default TransactionCoordinator;
