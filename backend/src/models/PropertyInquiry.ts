/**
 * PropertyInquiry Model
 *
 * Tracks buyer questions about properties that require seller/admin input.
 * Part of the multi-agent system where the buyer agent escalates questions
 * it cannot answer to sellers, then relays responses back to buyers.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// ============================================================================
// TYPES
// ============================================================================

export type InquiryStatus = 'pending' | 'answered' | 'expired' | 'cancelled';
export type InquiryPriority = 'low' | 'normal' | 'high' | 'urgent';
export type InquiryCategory =
  | 'seller_motivation'    // Why is the seller selling?
  | 'property_condition'   // Any issues with the property?
  | 'property_history'     // Has there been flooding, repairs, etc.?
  | 'closing_terms'        // Is seller flexible on closing date?
  | 'inclusions'           // What's included in the sale?
  | 'pricing'              // Is seller negotiable on price?
  | 'other';               // General questions

export interface PropertyInquiryAttributes {
  id: number;
  propertyId: number;
  buyerId: string;           // MarketplaceUser ID (the buyer asking)
  sessionId: string;         // Buyer's chat session ID (to inject response)
  question: string;          // The buyer's question
  category: InquiryCategory; // Type of question for routing
  context?: object;          // Additional context from conversation
  priority: InquiryPriority; // How urgent is this inquiry
  status: InquiryStatus;
  sellerResponse?: string;   // The seller's answer
  answeredAt?: Date;
  answeredBy?: string;       // MarketplaceUser ID of responder
  answeredByRole?: 'seller' | 'admin' | 'broker';
  notifiedBuyer: boolean;    // Has buyer been notified of response?
  notifiedAt?: Date;         // When was buyer notified
  expiresAt?: Date;          // When inquiry expires if unanswered
  metadata?: Record<string, any>; // Additional data
  createdAt?: Date;
  updatedAt?: Date;
}

interface PropertyInquiryCreationAttributes
  extends Optional<
    PropertyInquiryAttributes,
    | 'id'
    | 'category'
    | 'context'
    | 'priority'
    | 'sellerResponse'
    | 'answeredAt'
    | 'answeredBy'
    | 'answeredByRole'
    | 'notifiedBuyer'
    | 'notifiedAt'
    | 'expiresAt'
    | 'metadata'
  > {}

// ============================================================================
// MODEL
// ============================================================================

class PropertyInquiry
  extends Model<PropertyInquiryAttributes, PropertyInquiryCreationAttributes>
  implements PropertyInquiryAttributes
{
  public id!: number;
  public propertyId!: number;
  public buyerId!: string;
  public sessionId!: string;
  public question!: string;
  public category!: InquiryCategory;
  public context?: object;
  public priority!: InquiryPriority;
  public status!: InquiryStatus;
  public sellerResponse?: string;
  public answeredAt?: Date;
  public answeredBy?: string;
  public answeredByRole?: 'seller' | 'admin' | 'broker';
  public notifiedBuyer!: boolean;
  public notifiedAt?: Date;
  public expiresAt?: Date;
  public metadata?: Record<string, any>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ============================================================================
  // INSTANCE METHODS
  // ============================================================================

  /**
   * Check if inquiry is still pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if inquiry has expired
   */
  isExpired(): boolean {
    if (this.status === 'expired') return true;
    if (this.expiresAt && new Date() > this.expiresAt) return true;
    return false;
  }

  /**
   * Check if buyer needs to be notified
   */
  needsNotification(): boolean {
    return this.status === 'answered' && !this.notifiedBuyer;
  }

  /**
   * Format for API response
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      propertyId: this.propertyId,
      buyerId: this.buyerId,
      sessionId: this.sessionId,
      question: this.question,
      category: this.category,
      priority: this.priority,
      status: this.status,
      sellerResponse: this.sellerResponse,
      answeredAt: this.answeredAt,
      answeredBy: this.answeredBy,
      answeredByRole: this.answeredByRole,
      notifiedBuyer: this.notifiedBuyer,
      notifiedAt: this.notifiedAt,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

PropertyInquiry.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'property_id',
      references: {
        model: 'properties',
        key: 'id',
      },
    },
    buyerId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'buyer_id',
    },
    sessionId: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'session_id',
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM(
        'seller_motivation',
        'property_condition',
        'property_history',
        'closing_terms',
        'inclusions',
        'pricing',
        'other'
      ),
      allowNull: false,
      defaultValue: 'other',
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      allowNull: false,
      defaultValue: 'normal',
    },
    status: {
      type: DataTypes.ENUM('pending', 'answered', 'expired', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    sellerResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'seller_response',
    },
    answeredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'answered_at',
    },
    answeredBy: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'answered_by',
    },
    answeredByRole: {
      type: DataTypes.ENUM('seller', 'admin', 'broker'),
      allowNull: true,
      field: 'answered_by_role',
    },
    notifiedBuyer: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'notified_buyer',
    },
    notifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'notified_at',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'property_inquiries',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['property_id'] },
      { fields: ['buyer_id'] },
      { fields: ['session_id'] },
      { fields: ['status'] },
      { fields: ['status', 'notified_buyer'] }, // For finding unnotified answered inquiries
      { fields: ['created_at'] },
      { fields: ['expires_at'] },
    ],
  }
);

export default PropertyInquiry;
