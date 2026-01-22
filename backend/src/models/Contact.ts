import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Contact type options
export type ContactType =
  | 'broker'
  | 'buyer'
  | 'seller'
  | 'wholesaler'
  | 'attorney'
  | 're_agent'
  | 'transaction_coordinator'
  | 'title_company'
  | 'team_member'
  | 'other';

// Contact status options
export type ContactStatus = 'active' | 'inactive' | 'archived';

// Contact attributes interface
interface ContactAttributes {
  id: string;
  organizationId: string; // Organization that owns this contact (team-shared)
  createdById: string | null; // User who created this contact (SET NULL on delete)
  type: ContactType;
  role: string | null; // Specific role (e.g., "Seller Attorney", "Buyer RE Agent")
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  tags: string[];
  status: ContactStatus;
  // License info for brokers/agents
  licenseNumber: string | null;
  licenseState: string | null;
  licenseExpiration: Date | null;
  // Link to MarketplaceUser if this contact is a platform user
  linkedUserId: string | null;
  // Flexible metadata for additional fields
  metadata: Record<string, any> | null;
  // Signature on file
  signatureStorageKey: string | null;
  signatureUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Attributes for creating a new contact (optional fields)
interface ContactCreationAttributes
  extends Optional<
    ContactAttributes,
    | 'id'
    | 'createdById'
    | 'role'
    | 'email'
    | 'phone'
    | 'company'
    | 'address'
    | 'city'
    | 'state'
    | 'zip'
    | 'notes'
    | 'tags'
    | 'status'
    | 'licenseNumber'
    | 'licenseState'
    | 'licenseExpiration'
    | 'linkedUserId'
    | 'metadata'
    | 'signatureStorageKey'
    | 'signatureUpdatedAt'
    | 'createdAt'
    | 'updatedAt'
  > {}

// Contact model class
class Contact
  extends Model<ContactAttributes, ContactCreationAttributes>
  implements ContactAttributes
{
  declare id: string;
  declare organizationId: string;
  declare createdById: string | null;
  declare type: ContactType;
  declare role: string | null;
  declare name: string;
  declare email: string | null;
  declare phone: string | null;
  declare company: string | null;
  declare address: string | null;
  declare city: string | null;
  declare state: string | null;
  declare zip: string | null;
  declare notes: string | null;
  declare tags: string[];
  declare status: ContactStatus;
  declare licenseNumber: string | null;
  declare licenseState: string | null;
  declare licenseExpiration: Date | null;
  declare linkedUserId: string | null;
  declare metadata: Record<string, any> | null;
  declare signatureStorageKey: string | null;
  declare signatureUpdatedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual getter for backwards compatibility
  get userId(): string | null {
    return this.createdById;
  }
}

// Initialize the model
Contact.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
      comment: 'Organization that owns this contact (team-shared)',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'User who created this contact (preserved on user deletion)',
    },
    type: {
      type: DataTypes.ENUM(
        'broker',
        'buyer',
        'seller',
        'wholesaler',
        'attorney',
        're_agent',
        'transaction_coordinator',
        'title_company',
        'team_member',
        'other'
      ),
      allowNull: false,
      defaultValue: 'other',
    },
    role: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Specific role (e.g., Seller Attorney, Buyer RE Agent)',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true,
      },
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    company: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING(2),
      allowNull: true,
    },
    zip: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'archived'),
      allowNull: false,
      defaultValue: 'active',
    },
    licenseNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'License number for brokers/agents',
    },
    licenseState: {
      type: DataTypes.STRING(2),
      allowNull: true,
      comment: 'State where license is issued',
    },
    licenseExpiration: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'License expiration date',
    },
    linkedUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'linked_user_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'Link to MarketplaceUser if this contact is a platform user',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Flexible metadata for additional fields',
    },
    signatureStorageKey: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'signature_storage_key',
      comment: 'Supabase storage key for signature image',
    },
    signatureUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'signature_updated_at',
      comment: 'When the signature was last updated',
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
    tableName: 'contacts',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['organization_id'] },
      { fields: ['created_by_id'] },
      { fields: ['email'] },
      { fields: ['type'] },
      { fields: ['status'] },
      { fields: ['organization_id', 'type'] },
      { fields: ['organization_id', 'status'] },
      { fields: ['linked_user_id'] },
    ],
  }
);

export default Contact;
export { ContactAttributes, ContactCreationAttributes };
