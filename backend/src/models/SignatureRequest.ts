import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import crypto from 'crypto';

// Signature request status options
export type SignatureRequestStatus = 'pending' | 'completed' | 'expired';

// SignatureRequest attributes interface
interface SignatureRequestAttributes {
  id: string;
  contactId: string;
  organizationId: string;
  requestedById: string;
  token: string;
  status: SignatureRequestStatus;
  expiresAt: Date;
  completedAt: Date | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

// Attributes for creating a new signature request
interface SignatureRequestCreationAttributes
  extends Optional<
    SignatureRequestAttributes,
    'id' | 'token' | 'status' | 'completedAt' | 'metadata' | 'createdAt' | 'updatedAt'
  > {}

// SignatureRequest model class
class SignatureRequest
  extends Model<SignatureRequestAttributes, SignatureRequestCreationAttributes>
  implements SignatureRequestAttributes
{
  declare id: string;
  declare contactId: string;
  declare organizationId: string;
  declare requestedById: string;
  declare token: string;
  declare status: SignatureRequestStatus;
  declare expiresAt: Date;
  declare completedAt: Date | null;
  declare metadata: Record<string, any> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Check if the request is expired
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  // Check if the request is valid (pending and not expired)
  isValid(): boolean {
    return this.status === 'pending' && !this.isExpired();
  }

  // Mark request as completed
  async markCompleted(): Promise<void> {
    this.status = 'completed';
    this.completedAt = new Date();
    await this.save();
  }

  // Mark request as expired
  async markExpired(): Promise<void> {
    this.status = 'expired';
    await this.save();
  }

  // Generate a secure URL-safe token
  static generateToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  // Find a request by token and validate it
  static async findValidByToken(token: string): Promise<SignatureRequest | null> {
    const request = await SignatureRequest.findOne({
      where: { token },
    });

    if (!request) return null;

    // Auto-expire if past expiration date
    if (request.status === 'pending' && request.isExpired()) {
      await request.markExpired();
      return null;
    }

    // Only return if still pending
    if (request.status !== 'pending') return null;

    return request;
  }

  // Find latest pending request for a contact
  static async findPendingForContact(contactId: string): Promise<SignatureRequest | null> {
    const request = await SignatureRequest.findOne({
      where: {
        contactId,
        status: 'pending',
      },
      order: [['createdAt', 'DESC']],
    });

    if (!request) return null;

    // Auto-expire if past expiration date
    if (request.isExpired()) {
      await request.markExpired();
      return null;
    }

    return request;
  }
}

// Initialize the model
SignatureRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    contactId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'contact_id',
      references: {
        model: 'contacts',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    requestedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'requested_by_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      defaultValue: () => SignatureRequest.generateToken(),
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'expired'),
      allowNull: false,
      defaultValue: 'pending',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional tracking data (IP, user agent, etc.)',
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
    tableName: 'signature_requests',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['contact_id'] },
      { fields: ['organization_id'] },
      { fields: ['requested_by_id'] },
      { unique: true, fields: ['token'] },
      { fields: ['status'] },
      { fields: ['expires_at'] },
      { fields: ['contact_id', 'status'] },
    ],
  }
);

export default SignatureRequest;
export { SignatureRequestAttributes, SignatureRequestCreationAttributes };
