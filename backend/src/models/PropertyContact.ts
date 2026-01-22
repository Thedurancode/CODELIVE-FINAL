import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Role options for property-contact assignment
export type ContactRole = 'agent' | 'broker' | 'seller' | 'wholesaler' | 'attorney' | 're_agent' | 'buyer' | 'other';

// PropertyContact attributes interface
interface PropertyContactAttributes {
  id: string;
  propertyId: number;
  contactId: string;
  role: ContactRole;
  isPrimary: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Attributes for creating a new property-contact link
interface PropertyContactCreationAttributes
  extends Optional<
    PropertyContactAttributes,
    'id' | 'isPrimary' | 'notes' | 'createdAt' | 'updatedAt'
  > {}

// PropertyContact model class
class PropertyContact
  extends Model<PropertyContactAttributes, PropertyContactCreationAttributes>
  implements PropertyContactAttributes
{
  declare id: string;
  declare propertyId: number;
  declare contactId: string;
  declare role: ContactRole;
  declare isPrimary: boolean;
  declare notes: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Associations (will be set up in index.ts)
  declare contact?: any;
  declare property?: any;
}

// Initialize the model
PropertyContact.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    contactId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'contacts',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    role: {
      type: DataTypes.ENUM('agent', 'broker', 'seller', 'wholesaler', 'attorney', 're_agent', 'buyer', 'other'),
      allowNull: false,
      defaultValue: 'other',
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notes: {
      type: DataTypes.TEXT,
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
    tableName: 'property_contacts',
    timestamps: true,
    indexes: [
      { fields: ['propertyId'] },
      { fields: ['contactId'] },
      { fields: ['propertyId', 'contactId', 'role'], unique: true },
      { fields: ['propertyId', 'role'] },
    ],
  }
);

export default PropertyContact;
export { PropertyContactAttributes, PropertyContactCreationAttributes };
