/**
 * Broker Profile Model
 *
 * Stores broker licensing information, approval status, and profile data.
 * Links to MarketplaceUser for authentication.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type BrokerStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

interface BrokerProfileAttributes {
  id: string;
  userId: string;
  licenseNumber: string;
  licenseState: string;
  licensedStates: string[]; // All states the broker can operate in
  licenseExpirationDate: Date;
  brokerageCompany: string;
  brokerageAddress?: string;
  brokeragePhone?: string;
  brokerageEmail?: string;
  eoInsurancePolicy?: string;
  eoExpirationDate?: Date;
  status: BrokerStatus;
  approvedAt?: Date;
  approvedBy?: string;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
  suspendedAt?: Date;
  suspendedBy?: string;
  suspensionReason?: string;
  notes?: string;
  totalDealsSupervised: number;
  activeDeals: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface BrokerProfileCreationAttributes
  extends Optional<
    BrokerProfileAttributes,
    | 'id'
    | 'licensedStates'
    | 'brokerageAddress'
    | 'brokeragePhone'
    | 'brokerageEmail'
    | 'eoInsurancePolicy'
    | 'eoExpirationDate'
    | 'status'
    | 'approvedAt'
    | 'approvedBy'
    | 'rejectedAt'
    | 'rejectedBy'
    | 'rejectionReason'
    | 'suspendedAt'
    | 'suspendedBy'
    | 'suspensionReason'
    | 'notes'
    | 'totalDealsSupervised'
    | 'activeDeals'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class BrokerProfile
  extends Model<BrokerProfileAttributes, BrokerProfileCreationAttributes>
  implements BrokerProfileAttributes
{
  declare id: string;
  declare userId: string;
  declare licenseNumber: string;
  declare licenseState: string;
  declare licensedStates: string[];
  declare licenseExpirationDate: Date;
  declare brokerageCompany: string;
  declare brokerageAddress: string | undefined;
  declare brokeragePhone: string | undefined;
  declare brokerageEmail: string | undefined;
  declare eoInsurancePolicy: string | undefined;
  declare eoExpirationDate: Date | undefined;
  declare status: BrokerStatus;
  declare approvedAt: Date | undefined;
  declare approvedBy: string | undefined;
  declare rejectedAt: Date | undefined;
  declare rejectedBy: string | undefined;
  declare rejectionReason: string | undefined;
  declare suspendedAt: Date | undefined;
  declare suspendedBy: string | undefined;
  declare suspensionReason: string | undefined;
  declare notes: string | undefined;
  declare totalDealsSupervised: number;
  declare activeDeals: number;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if broker is active and can supervise deals
   */
  isActive(): boolean {
    return (
      this.status === 'approved' &&
      this.licenseExpirationDate > new Date()
    );
  }

  /**
   * Check if license is expiring soon (within 30 days)
   */
  isLicenseExpiringSoon(): boolean {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return this.licenseExpirationDate <= thirtyDaysFromNow;
  }

  /**
   * Get days until license expiration
   */
  daysUntilLicenseExpiration(): number {
    const now = new Date();
    const diffTime = this.licenseExpirationDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

BrokerProfile.init(
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
      allowNull: false,
    },
    licenseState: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },
    licensedStates: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    licenseExpirationDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    brokerageCompany: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    brokerageAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    brokeragePhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    brokerageEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: { isEmail: true },
    },
    eoInsurancePolicy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    eoExpirationDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'suspended', 'rejected'),
      defaultValue: 'pending',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rejectedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    suspendedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    suspendedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    suspensionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    totalDealsSupervised: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    activeDeals: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
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
    tableName: 'broker_profiles',
    timestamps: true,
    indexes: [
      { fields: ['userId'], unique: true },
      { fields: ['licenseState'] },
      { fields: ['status'] },
      { fields: ['licenseExpirationDate'] },
      { fields: ['licenseState', 'status'] },
    ],
  }
);

export default BrokerProfile;
