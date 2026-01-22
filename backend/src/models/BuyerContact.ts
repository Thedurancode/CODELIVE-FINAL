import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Phone entry type
interface PhoneEntry {
  number: string;
  type: string | null;
  lastReported: string | null;
}

// BuyerContact attributes interface
interface BuyerContactAttributes {
  id: string;
  buyerId: string;
  personIndex: number;
  firstName: string | null;
  lastName: string | null;
  phones: PhoneEntry[];
  emails: string[];
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Attributes for creating a new contact (optional fields)
interface BuyerContactCreationAttributes
  extends Optional<
    BuyerContactAttributes,
    | 'id'
    | 'firstName'
    | 'lastName'
    | 'phones'
    | 'emails'
    | 'isPrimary'
    | 'createdAt'
    | 'updatedAt'
  > {}

// BuyerContact model class
class BuyerContact
  extends Model<BuyerContactAttributes, BuyerContactCreationAttributes>
  implements BuyerContactAttributes
{
  declare id: string;
  declare buyerId: string;
  declare personIndex: number;
  declare firstName: string | null;
  declare lastName: string | null;
  declare phones: PhoneEntry[];
  declare emails: string[];
  declare isPrimary: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual property for full name
  get fullName(): string {
    const parts = [this.firstName, this.lastName].filter(Boolean);
    return parts.join(' ') || 'Unknown';
  }

  // Get primary phone
  get primaryPhone(): string | null {
    return this.phones.length > 0 ? this.phones[0].number : null;
  }

  // Get primary email
  get primaryEmail(): string | null {
    return this.emails.length > 0 ? this.emails[0] : null;
  }
}

// Initialize the model
BuyerContact.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    buyerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'buyers',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    personIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Person 1-5 from CSV (1-indexed)',
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phones: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: 'Array of phone entries with number, type, lastReported',
    },
    emails: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether this is the primary contact for the buyer',
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
    tableName: 'buyer_contacts',
    timestamps: true,
    indexes: [
      { fields: ['buyerId'] },
      { fields: ['isPrimary'] },
      { fields: ['buyerId', 'personIndex'], unique: true },
    ],
  }
);

export default BuyerContact;
export { BuyerContactAttributes, BuyerContactCreationAttributes, PhoneEntry };
