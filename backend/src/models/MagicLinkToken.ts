/**
 * Magic Link Token Model
 *
 * Stores single-use tokens for passwordless authentication.
 * Used to bridge Fast Buy Box submissions to MarketplaceUser accounts.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';
import crypto from 'crypto';

interface MagicLinkTokenAttributes {
  id: string;
  email: string;
  token: string;
  fundId?: string;
  buyBoxId?: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface MagicLinkTokenCreationAttributes
  extends Optional<MagicLinkTokenAttributes, 'id' | 'fundId' | 'buyBoxId' | 'usedAt' | 'createdAt' | 'updatedAt'> {}

class MagicLinkToken
  extends Model<MagicLinkTokenAttributes, MagicLinkTokenCreationAttributes>
  implements MagicLinkTokenAttributes
{
  declare id: string;
  declare email: string;
  declare token: string;
  declare fundId: string | undefined;
  declare buyBoxId: string | undefined;
  declare expiresAt: Date;
  declare usedAt: Date | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Generate a new magic link token for an email
   */
  static async generateToken(data: {
    email: string;
    fundId?: string;
    buyBoxId?: string;
    expiresInHours?: number;
  }): Promise<MagicLinkToken> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const expiresInHours = data.expiresInHours || 72; // Default 72 hours (3 days)

    // Invalidate any existing unused tokens for this email
    await MagicLinkToken.update(
      { usedAt: new Date() },
      {
        where: {
          email: normalizedEmail,
          usedAt: { [Op.is]: null },
        } as any,
      }
    );

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');

    // Create new token
    return MagicLinkToken.create({
      email: normalizedEmail,
      token,
      fundId: data.fundId,
      buyBoxId: data.buyBoxId,
      expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
    });
  }

  /**
   * Verify a token and return the associated data
   * Returns null if token is invalid, expired, or already used
   */
  static async verifyToken(token: string): Promise<MagicLinkToken | null> {
    const record = await MagicLinkToken.findOne({
      where: {
        token,
        usedAt: { [Op.is]: null },
      } as any,
    });

    if (!record) {
      return null;
    }

    // Check if expired
    if (new Date() > record.expiresAt) {
      return null;
    }

    return record;
  }

  /**
   * Mark token as used
   */
  async markUsed(): Promise<void> {
    await this.update({ usedAt: new Date() });
  }

  /**
   * Check if token is valid (not expired, not used)
   */
  isValid(): boolean {
    return !this.usedAt && new Date() < this.expiresAt;
  }
}

MagicLinkToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isEmail: true },
    },
    token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    fundId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    buyBoxId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    usedAt: {
      type: DataTypes.DATE,
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
    tableName: 'magic_link_tokens',
    timestamps: true,
    indexes: [
      { fields: ['token'], unique: true },
      { fields: ['email'] },
      { fields: ['expiresAt'] },
      { fields: ['usedAt'] },
    ],
  }
);

export default MagicLinkToken;
export { MagicLinkTokenAttributes, MagicLinkTokenCreationAttributes };
