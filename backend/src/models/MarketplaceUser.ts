/**
 * Marketplace User Model
 *
 * Users who interact with deals on the marketplace
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface MarketplaceUserAttributes {
  id: string;
  email: string;
  passwordHash?: string;
  name: string;
  company?: string;
  phone?: string;
  role: 'buyer' | 'investor' | 'wholesaler' | 'agent' | 'broker' | 'broker_assistant' |
        'transaction_coordinator' | 'team_member' | 'admin' | 'super_admin' | 'client';
  verified: boolean;
  avatar?: string;
  fundId?: string; // Link to Fund for institutional buyers (from Fast Buy Box)
  organizationId?: string; // Organization the user belongs to

  // Team member profile fields
  bio?: string; // Team member biography/about section
  expertise?: string[]; // Areas of expertise (e.g., ['acquisitions', 'underwriting', 'closing'])
  title?: string; // Job title (e.g., 'Acquisitions Manager')
  timezone?: string; // User timezone for notifications

  // Buyer verification (FIX 6)
  isVerified: boolean; // Has completed full verification process
  requiresVerification: boolean; // Does this user need verification to make offers?
  proofOfFundsVerified: boolean; // Has POF been verified?
  requiresProofOfFunds: boolean; // Does this user need POF for cash offers?
  verifiedAt?: Date; // When verification was completed
  verificationNotes?: string; // Admin notes on verification

  // Notification preferences
  notifyEmail: boolean;
  notifySms: boolean;
  notifyPush: boolean;
  dealAlerts: boolean;
  instantAlerts: boolean;
  dailyDigest: boolean;

  // Stats (denormalized for performance)
  totalDealsViewed: number;
  totalLikes: number;
  totalPasses: number;
  totalOffers: number;
  acceptedOffers: number;

  // Presence/Online status
  isOnline: boolean;
  onlineStatus: 'online' | 'away' | 'offline';
  lastSeenAt?: Date;

  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
}

interface MarketplaceUserCreationAttributes
  extends Optional<
    MarketplaceUserAttributes,
    | 'id'
    | 'passwordHash'
    | 'company'
    | 'phone'
    | 'verified'
    | 'avatar'
    | 'fundId'
    | 'organizationId'
    | 'bio'
    | 'expertise'
    | 'title'
    | 'timezone'
    | 'isVerified'
    | 'requiresVerification'
    | 'proofOfFundsVerified'
    | 'requiresProofOfFunds'
    | 'verifiedAt'
    | 'verificationNotes'
    | 'notifyEmail'
    | 'notifySms'
    | 'notifyPush'
    | 'dealAlerts'
    | 'instantAlerts'
    | 'dailyDigest'
    | 'totalDealsViewed'
    | 'totalLikes'
    | 'totalPasses'
    | 'totalOffers'
    | 'acceptedOffers'
    | 'isOnline'
    | 'onlineStatus'
    | 'lastSeenAt'
    | 'createdAt'
    | 'updatedAt'
    | 'lastActiveAt'
  > {}

class MarketplaceUser
  extends Model<MarketplaceUserAttributes, MarketplaceUserCreationAttributes>
  implements MarketplaceUserAttributes
{
  declare id: string;
  declare email: string;
  declare passwordHash: string | undefined;
  declare name: string;
  declare company: string | undefined;
  declare phone: string | undefined;
  declare role: 'buyer' | 'investor' | 'wholesaler' | 'agent' | 'broker' | 'broker_assistant' |
        'transaction_coordinator' | 'team_member' | 'admin' | 'super_admin' | 'client';
  declare verified: boolean;
  declare avatar: string | undefined;
  declare fundId: string | undefined;
  declare organizationId: string | undefined;

  // Team member profile fields
  declare bio: string | undefined;
  declare expertise: string[] | undefined;
  declare title: string | undefined;
  declare timezone: string | undefined;

  // Buyer verification (FIX 6)
  declare isVerified: boolean;
  declare requiresVerification: boolean;
  declare proofOfFundsVerified: boolean;
  declare requiresProofOfFunds: boolean;
  declare verifiedAt: Date | undefined;
  declare verificationNotes: string | undefined;

  declare notifyEmail: boolean;
  declare notifySms: boolean;
  declare notifyPush: boolean;
  declare dealAlerts: boolean;
  declare instantAlerts: boolean;
  declare dailyDigest: boolean;

  declare totalDealsViewed: number;
  declare totalLikes: number;
  declare totalPasses: number;
  declare totalOffers: number;
  declare acceptedOffers: number;

  // Presence/Online status
  declare isOnline: boolean;
  declare onlineStatus: 'online' | 'away' | 'offline';
  declare lastSeenAt: Date | undefined;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare lastActiveAt: Date;
}

MarketplaceUser.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    company: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM('buyer', 'investor', 'wholesaler', 'agent', 'broker', 'broker_assistant',
                          'transaction_coordinator', 'team_member', 'admin', 'super_admin', 'client'),
      defaultValue: 'buyer',
    },
    verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    fundId: {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: 'funds',
        key: 'id',
      },
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_id',
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'Organization the user belongs to',
    },
    // Team member profile fields
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Team member biography/about section',
    },
    expertise: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
      comment: 'Areas of expertise (e.g., acquisitions, underwriting, closing)',
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Job title (e.g., Acquisitions Manager)',
    },
    timezone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'America/New_York',
      comment: 'User timezone for notifications',
    },
    // Buyer verification fields (FIX 6)
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_verified',
      comment: 'Has user completed full verification process',
    },
    requiresVerification: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'requires_verification',
      comment: 'Does this user need verification to make offers',
    },
    proofOfFundsVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'proof_of_funds_verified',
      comment: 'Has proof of funds been verified',
    },
    requiresProofOfFunds: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'requires_proof_of_funds',
      comment: 'Does this user need POF verification for cash offers',
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'verified_at',
      comment: 'When verification was completed',
    },
    verificationNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'verification_notes',
      comment: 'Admin notes on verification',
    },
    notifyEmail: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    notifySms: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    notifyPush: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    dealAlerts: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    instantAlerts: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    dailyDigest: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    totalDealsViewed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalLikes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalPasses: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalOffers: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    acceptedOffers: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    lastActiveAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    // Presence/Online status fields
    isOnline: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_online',
      comment: 'Whether user is currently online',
    },
    onlineStatus: {
      type: DataTypes.ENUM('online', 'away', 'offline'),
      defaultValue: 'offline',
      field: 'online_status',
      comment: 'User online status (online, away, offline)',
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_seen_at',
      comment: 'When user was last seen online',
    },
  },
  {
    sequelize,
    tableName: 'marketplace_users',
    timestamps: true,
    indexes: [
      { fields: ['email'], unique: true },
      { fields: ['role'] },
      { fields: ['verified'] },
      { fields: ['lastActiveAt'] },
      { fields: ['fundId'] },
      { fields: ['organization_id'] },
    ],
  }
);

export default MarketplaceUser;
