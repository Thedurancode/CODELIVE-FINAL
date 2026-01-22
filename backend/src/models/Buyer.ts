import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Buyer status options
export type BuyerStatus = 'active' | 'inactive' | 'archived';

// Buyer attributes interface
interface BuyerAttributes {
  id: string;
  name: string;
  // Buyer's mailing address
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  // Counties where buyer purchases properties (e.g., NJ counties)
  buyingCounties: string[];
  buyingState: string;
  purchases6Month: number;
  status: BuyerStatus;
  notes: string | null;
  tags: string[];
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

// Attributes for creating a new buyer (optional fields)
interface BuyerCreationAttributes
  extends Optional<
    BuyerAttributes,
    | 'id'
    | 'address'
    | 'city'
    | 'state'
    | 'zip'
    | 'buyingCounties'
    | 'purchases6Month'
    | 'status'
    | 'notes'
    | 'tags'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

// Buyer model class
class Buyer
  extends Model<BuyerAttributes, BuyerCreationAttributes>
  implements BuyerAttributes
{
  declare id: string;
  declare name: string;
  declare address: string | null;
  declare city: string | null;
  declare state: string | null;
  declare zip: string | null;
  declare buyingCounties: string[];
  declare buyingState: string;
  declare purchases6Month: number;
  declare status: BuyerStatus;
  declare notes: string | null;
  declare tags: string[];
  declare metadata: Record<string, any> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual property for hot potential status
  get isHotPotential(): boolean {
    return this.purchases6Month > 10;
  }
}

// Initialize the model
Buyer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Buyer company/entity name',
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Buyer mailing address',
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Buyer mailing city',
    },
    state: {
      type: DataTypes.STRING(2),
      allowNull: true,
      comment: 'Buyer mailing state',
    },
    zip: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: 'Buyer mailing zip',
    },
    buyingCounties: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
      comment: 'Counties where buyer purchases properties',
    },
    buyingState: {
      type: DataTypes.STRING(2),
      allowNull: false,
      defaultValue: 'NJ',
      comment: 'State where buyer purchases properties',
    },
    purchases6Month: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of purchases in last 6 months',
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'archived'),
      allowNull: false,
      defaultValue: 'active',
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
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Flexible metadata for additional fields',
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
    tableName: 'buyers',
    timestamps: true,
    indexes: [
      { fields: ['name'] },
      { fields: ['buyingState'] },
      { fields: ['status'] },
      { fields: ['purchases6Month'] },
    ],
  }
);

export default Buyer;
export { BuyerAttributes, BuyerCreationAttributes };
