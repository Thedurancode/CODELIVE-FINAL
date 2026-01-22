/**
 * Guest Session Model
 *
 * Represents a guest user session authenticated via phone number (SMS verification).
 * Allows external users (buyers) to access conversations without a full account.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';
import crypto from 'crypto';

interface GuestSessionAttributes {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  verificationCode: string | null;
  verificationExpires: Date | null;
  magicLinkToken: string | null;
  magicLinkExpires: Date | null;
  isVerified: boolean;
  linkedUserId: string | null;
  propertyAccess: number[];
  sessionToken: string | null;
  sessionExpires: Date | null;
  lastActiveAt: Date | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

interface GuestSessionCreationAttributes
  extends Optional<
    GuestSessionAttributes,
    | 'id'
    | 'email'
    | 'name'
    | 'verificationCode'
    | 'verificationExpires'
    | 'magicLinkToken'
    | 'magicLinkExpires'
    | 'isVerified'
    | 'linkedUserId'
    | 'propertyAccess'
    | 'sessionToken'
    | 'sessionExpires'
    | 'lastActiveAt'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class GuestSession
  extends Model<GuestSessionAttributes, GuestSessionCreationAttributes>
  implements GuestSessionAttributes
{
  declare id: string;
  declare phone: string;
  declare email: string | null;
  declare name: string | null;
  declare verificationCode: string | null;
  declare verificationExpires: Date | null;
  declare magicLinkToken: string | null;
  declare magicLinkExpires: Date | null;
  declare isVerified: boolean;
  declare linkedUserId: string | null;
  declare propertyAccess: number[];
  declare sessionToken: string | null;
  declare sessionExpires: Date | null;
  declare lastActiveAt: Date | null;
  declare metadata: Record<string, any> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Generate a new verification code
   */
  async generateVerificationCode(): Promise<string> {
    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.verificationCode = code;
    this.verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await this.save();
    return code;
  }

  /**
   * Generate a magic link token
   */
  async generateMagicLinkToken(): Promise<string> {
    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    this.magicLinkToken = token;
    this.magicLinkExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await this.save();
    return token;
  }

  /**
   * Verify magic link token and activate session
   */
  async verifyMagicLink(token: string): Promise<boolean> {
    if (!this.magicLinkToken || !this.magicLinkExpires) {
      return false;
    }

    if (new Date() > this.magicLinkExpires) {
      // Token expired
      this.magicLinkToken = null;
      this.magicLinkExpires = null;
      await this.save();
      return false;
    }

    if (this.magicLinkToken !== token) {
      return false;
    }

    // Token is valid - generate session
    this.isVerified = true;
    this.magicLinkToken = null;
    this.magicLinkExpires = null;
    this.sessionToken = crypto.randomBytes(32).toString('hex');
    this.sessionExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    this.lastActiveAt = new Date();
    await this.save();
    return true;
  }

  /**
   * Find session by magic link token
   */
  static async findByMagicToken(token: string): Promise<GuestSession | null> {
    return GuestSession.findOne({
      where: {
        magicLinkToken: token,
        magicLinkExpires: { [Op.gt]: new Date() },
      },
    });
  }

  /**
   * Verify the code and activate session
   */
  async verifyCode(code: string): Promise<boolean> {
    if (!this.verificationCode || !this.verificationExpires) {
      return false;
    }

    if (new Date() > this.verificationExpires) {
      // Code expired
      this.verificationCode = null;
      this.verificationExpires = null;
      await this.save();
      return false;
    }

    if (this.verificationCode !== code) {
      return false;
    }

    // Code is valid - generate session
    this.isVerified = true;
    this.verificationCode = null;
    this.verificationExpires = null;
    this.sessionToken = crypto.randomBytes(32).toString('hex');
    this.sessionExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    this.lastActiveAt = new Date();
    await this.save();
    return true;
  }

  /**
   * Check if session is valid
   */
  isSessionValid(): boolean {
    if (!this.isVerified || !this.sessionToken || !this.sessionExpires) {
      return false;
    }
    return new Date() < this.sessionExpires;
  }

  /**
   * Refresh session (extend expiry)
   */
  async refreshSession(): Promise<void> {
    if (this.isSessionValid()) {
      this.sessionExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      this.lastActiveAt = new Date();
      await this.save();
    }
  }

  /**
   * Invalidate session (logout)
   */
  async invalidateSession(): Promise<void> {
    this.sessionToken = null;
    this.sessionExpires = null;
    await this.save();
  }

  /**
   * Grant access to a property
   */
  async grantPropertyAccess(propertyId: number): Promise<void> {
    if (!this.propertyAccess.includes(propertyId)) {
      this.propertyAccess = [...this.propertyAccess, propertyId];
      await this.save();
    }
  }

  /**
   * Revoke access to a property
   */
  async revokePropertyAccess(propertyId: number): Promise<void> {
    this.propertyAccess = this.propertyAccess.filter((id) => id !== propertyId);
    await this.save();
  }

  /**
   * Check if guest has access to a property
   */
  hasPropertyAccess(propertyId: number): boolean {
    return this.propertyAccess.includes(propertyId);
  }

  /**
   * Link to an existing MarketplaceUser
   */
  async linkToUser(userId: string): Promise<void> {
    this.linkedUserId = userId;
    await this.save();
  }

  /**
   * Find or create a guest session by phone
   */
  static async findOrCreateByPhone(phone: string): Promise<[GuestSession, boolean]> {
    // Normalize phone number (remove spaces, dashes, etc.)
    const normalizedPhone = phone.replace(/[^+\d]/g, '');

    const [session, created] = await GuestSession.findOrCreate({
      where: { phone: normalizedPhone },
      defaults: {
        phone: normalizedPhone,
        propertyAccess: [],
      },
    });

    return [session, created];
  }

  /**
   * Find session by token
   */
  static async findByToken(token: string): Promise<GuestSession | null> {
    const session = await GuestSession.findOne({
      where: {
        sessionToken: token,
        sessionExpires: { [Op.gt]: new Date() },
      },
    });

    if (session) {
      // Update last active
      session.lastActiveAt = new Date();
      await session.save();
    }

    return session;
  }

  /**
   * Find session by phone
   */
  static async findByPhone(phone: string): Promise<GuestSession | null> {
    const normalizedPhone = phone.replace(/[^+\d]/g, '');
    return GuestSession.findOne({
      where: { phone: normalizedPhone },
    });
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpired(): Promise<number> {
    const result = await GuestSession.update(
      {
        sessionToken: null,
        sessionExpires: null,
      },
      {
        where: {
          sessionExpires: { [Op.lt]: new Date() },
          sessionToken: { [Op.ne]: null },
        },
      }
    );
    return result[0];
  }

  /**
   * Get sessions with property access
   */
  static async getSessionsWithPropertyAccess(
    propertyId: number
  ): Promise<GuestSession[]> {
    return GuestSession.findAll({
      where: {
        propertyAccess: { [Op.contains]: [propertyId] },
        isVerified: true,
      },
    });
  }
}

GuestSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    verificationCode: {
      type: DataTypes.STRING(6),
      allowNull: true,
    },
    verificationExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    magicLinkToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    magicLinkExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    linkedUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    propertyAccess: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: [],
    },
    sessionToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    sessionExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastActiveAt: {
      type: DataTypes.DATE,
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
    tableName: 'guest_sessions',
    timestamps: true,
    indexes: [
      { fields: ['phone'], unique: true },
      { fields: ['sessionToken'] },
      { fields: ['linkedUserId'] },
    ],
  }
);

export default GuestSession;
