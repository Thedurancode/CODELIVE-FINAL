/**
 * Contact Relationship Model
 *
 * Stores relationships between contacts (relationship graph).
 * Examples:
 * - "Sarah is John's attorney"
 * - "Mike is the broker for 141 Throop"
 * - "Jane referred Bob"
 *
 * Enables queries like:
 * - "call John's lawyer" → finds Sarah
 * - "who is the attorney for this deal?" → finds linked attorney
 */

import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type RelationshipType =
  | 'attorney'
  | 'broker'
  | 'agent'
  | 'partner'
  | 'spouse'
  | 'assistant'
  | 'referrer'
  | 'referred_by'
  | 'employer'
  | 'employee'
  | 'contractor'
  | 'client'
  | 'vendor'
  | 'lender'
  | 'title_company'
  | 'inspector'
  | 'appraiser'
  | 'property_manager'
  | 'tenant'
  | 'co_owner'
  | 'successor'
  | 'other';

export interface ContactRelationshipAttributes {
  id: number;
  fromContactId: number;
  toContactId: number;
  relationshipType: RelationshipType;
  label?: string; // Custom label like "closing attorney"
  propertyId?: number; // Context: relationship for specific property
  dealId?: number; // Context: relationship for specific deal
  notes?: string;
  isActive: boolean;
  createdById?: string;
  organizationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactRelationshipCreationAttributes
  extends Optional<
    ContactRelationshipAttributes,
    'id' | 'label' | 'propertyId' | 'dealId' | 'notes' | 'isActive' | 'createdById' | 'organizationId' | 'createdAt' | 'updatedAt'
  > {}

class ContactRelationship
  extends Model<ContactRelationshipAttributes, ContactRelationshipCreationAttributes>
  implements ContactRelationshipAttributes
{
  public id!: number;
  public fromContactId!: number;
  public toContactId!: number;
  public relationshipType!: RelationshipType;
  public label?: string;
  public propertyId?: number;
  public dealId?: number;
  public notes?: string;
  public isActive!: boolean;
  public createdById?: string;
  public organizationId?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public fromContact?: any;
  public toContact?: any;
  public property?: any;

  // ============================================================================
  // Static Methods
  // ============================================================================

  /**
   * Find contacts related to a given contact by relationship type
   * "John's attorney" → find contacts where fromContactId=John and type=attorney
   */
  static async findRelatedContacts(
    contactId: number,
    relationshipType?: RelationshipType | RelationshipType[],
    options?: {
      propertyId?: number;
      dealId?: number;
      includeInactive?: boolean;
    }
  ): Promise<ContactRelationship[]> {
    const where: Record<string, unknown> = {
      fromContactId: contactId,
    };

    if (relationshipType) {
      where.relationshipType = Array.isArray(relationshipType)
        ? relationshipType
        : relationshipType;
    }

    if (options?.propertyId) {
      where.propertyId = options.propertyId;
    }

    if (options?.dealId) {
      where.dealId = options.dealId;
    }

    if (!options?.includeInactive) {
      where.isActive = true;
    }

    return ContactRelationship.findAll({
      where,
      include: [
        {
          association: 'toContact',
          attributes: ['id', 'name', 'phone', 'email', 'type'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Find who has a relationship TO this contact
   * "Who does John work for?" → find contacts where toContactId=John
   */
  static async findReverseRelationships(
    contactId: number,
    relationshipType?: RelationshipType | RelationshipType[]
  ): Promise<ContactRelationship[]> {
    const where: Record<string, unknown> = {
      toContactId: contactId,
      isActive: true,
    };

    if (relationshipType) {
      where.relationshipType = Array.isArray(relationshipType)
        ? relationshipType
        : relationshipType;
    }

    return ContactRelationship.findAll({
      where,
      include: [
        {
          association: 'fromContact',
          attributes: ['id', 'name', 'phone', 'email', 'type'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Find relationships for a property
   * "Who is the attorney for 141 Throop?"
   */
  static async findPropertyRelationships(
    propertyId: number,
    relationshipType?: RelationshipType
  ): Promise<ContactRelationship[]> {
    const where: Record<string, unknown> = {
      propertyId,
      isActive: true,
    };

    if (relationshipType) {
      where.relationshipType = relationshipType;
    }

    return ContactRelationship.findAll({
      where,
      include: [
        {
          association: 'fromContact',
          attributes: ['id', 'name', 'phone', 'email', 'type'],
        },
        {
          association: 'toContact',
          attributes: ['id', 'name', 'phone', 'email', 'type'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Create a bidirectional relationship (e.g., partners)
   */
  static async createBidirectional(
    contact1Id: number,
    contact2Id: number,
    relationshipType: RelationshipType,
    options?: {
      label?: string;
      propertyId?: number;
      dealId?: number;
      createdById?: string;
      organizationId?: string;
    }
  ): Promise<[ContactRelationship, ContactRelationship]> {
    const rel1 = await ContactRelationship.create({
      fromContactId: contact1Id,
      toContactId: contact2Id,
      relationshipType,
      ...options,
    });

    const rel2 = await ContactRelationship.create({
      fromContactId: contact2Id,
      toContactId: contact1Id,
      relationshipType,
      ...options,
    });

    return [rel1, rel2];
  }

  /**
   * Create relationship with inverse
   * "Sarah is John's attorney" → also creates "John is Sarah's client"
   */
  static async createWithInverse(
    fromContactId: number,
    toContactId: number,
    relationshipType: RelationshipType,
    options?: {
      label?: string;
      propertyId?: number;
      dealId?: number;
      createdById?: string;
      organizationId?: string;
    }
  ): Promise<ContactRelationship> {
    const relationship = await ContactRelationship.create({
      fromContactId,
      toContactId,
      relationshipType,
      ...options,
    });

    // Create inverse relationship
    const inverseType = this.getInverseRelationship(relationshipType);
    if (inverseType) {
      await ContactRelationship.findOrCreate({
        where: {
          fromContactId: toContactId,
          toContactId: fromContactId,
          relationshipType: inverseType,
          propertyId: options?.propertyId,
          dealId: options?.dealId,
        },
        defaults: {
          fromContactId: toContactId,
          toContactId: fromContactId,
          relationshipType: inverseType,
          ...options,
        },
      });
    }

    return relationship;
  }

  /**
   * Get the inverse relationship type
   */
  static getInverseRelationship(type: RelationshipType): RelationshipType | null {
    const inverses: Partial<Record<RelationshipType, RelationshipType>> = {
      attorney: 'client',
      client: 'attorney',
      broker: 'client',
      employer: 'employee',
      employee: 'employer',
      referrer: 'referred_by',
      referred_by: 'referrer',
      contractor: 'client',
      vendor: 'client',
      lender: 'client',
      tenant: 'property_manager',
      property_manager: 'tenant',
    };

    return inverses[type] || null;
  }

  /**
   * Get relationship type from natural language
   */
  static parseRelationshipType(text: string): RelationshipType | null {
    const normalized = text.toLowerCase().trim();

    const mappings: Record<string, RelationshipType> = {
      // Attorney variations
      attorney: 'attorney',
      lawyer: 'attorney',
      counsel: 'attorney',
      'legal counsel': 'attorney',
      solicitor: 'attorney',

      // Broker/Agent variations
      broker: 'broker',
      realtor: 'agent',
      agent: 'agent',
      'real estate agent': 'agent',
      'listing agent': 'agent',
      "buyer's agent": 'agent',
      "seller's agent": 'agent',

      // Partner variations
      partner: 'partner',
      'business partner': 'partner',
      'co-investor': 'partner',
      associate: 'partner',

      // Assistant variations
      assistant: 'assistant',
      secretary: 'assistant',
      admin: 'assistant',
      pa: 'assistant',

      // Family
      spouse: 'spouse',
      wife: 'spouse',
      husband: 'spouse',

      // Referral
      referrer: 'referrer',
      referral: 'referrer',
      'referred by': 'referred_by',

      // Employment
      employer: 'employer',
      boss: 'employer',
      employee: 'employee',
      'works for': 'employee',

      // Service providers
      contractor: 'contractor',
      vendor: 'vendor',
      supplier: 'vendor',
      lender: 'lender',
      'mortgage broker': 'lender',
      'title company': 'title_company',
      'title agent': 'title_company',
      inspector: 'inspector',
      'home inspector': 'inspector',
      appraiser: 'appraiser',
      'property manager': 'property_manager',
      pm: 'property_manager',

      // Tenant/Owner
      tenant: 'tenant',
      renter: 'tenant',
      'co-owner': 'co_owner',
      'joint owner': 'co_owner',
    };

    return mappings[normalized] || null;
  }
}

ContactRelationship.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    fromContactId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'from_contact_id',
      references: {
        model: 'contacts',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    toContactId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'to_contact_id',
      references: {
        model: 'contacts',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    relationshipType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'relationship_type',
    },
    label: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'property_id',
      references: {
        model: 'properties',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    dealId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'deal_id',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_id',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'contact_relationships',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['from_contact_id'],
      },
      {
        fields: ['to_contact_id'],
      },
      {
        fields: ['relationship_type'],
      },
      {
        fields: ['property_id'],
      },
      {
        fields: ['organization_id'],
      },
      {
        unique: true,
        fields: ['from_contact_id', 'to_contact_id', 'relationship_type', 'property_id'],
        where: {
          is_active: true,
        },
      },
    ],
  }
);

export default ContactRelationship;
