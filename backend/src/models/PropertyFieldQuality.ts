/**
 * Property Field Quality Model
 *
 * Tracks per-field data quality, source, and confidence for properties.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type FieldQualityStatus = 'known' | 'unknown' | 'inferred';

export interface PropertyFieldQualityAttributes {
  id?: number;
  propertyId: number;
  field: string;
  status: FieldQualityStatus;
  source?: string | null;
  confidence?: number | null;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PropertyFieldQualityCreationAttributes
  extends Optional<PropertyFieldQualityAttributes, 'id' | 'source' | 'confidence' | 'notes' | 'createdAt' | 'updatedAt'> {}

class PropertyFieldQuality
  extends Model<PropertyFieldQualityAttributes, PropertyFieldQualityCreationAttributes>
  implements PropertyFieldQualityAttributes
{
  declare id: number;
  declare propertyId: number;
  declare field: string;
  declare status: FieldQualityStatus;
  declare source?: string | null;
  declare confidence?: number | null;
  declare notes?: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

PropertyFieldQuality.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
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
    field: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('known', 'unknown', 'inferred'),
      allowNull: false,
      defaultValue: 'known',
    },
    source: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'property_field_quality',
    timestamps: true,
    indexes: [
      { fields: ['propertyId'] },
      { fields: ['propertyId', 'field'], unique: true },
      { fields: ['status'] },
    ],
  }
);

export default PropertyFieldQuality;
