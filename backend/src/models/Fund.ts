/**
 * Fund Model
 *
 * Represents an investor/fund entity that can have multiple buy boxes.
 * Links buy boxes together by contact email/phone.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface FundAttributes {
  id: string;
  name: string;
  companyName?: string;
  contactEmail: string;
  contactPhone?: string;
  description?: string;
  website?: string;
  enabled: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface FundCreationAttributes
  extends Optional<
    FundAttributes,
    'id' | 'companyName' | 'contactPhone' | 'description' | 'website' | 'enabled' | 'metadata' | 'createdAt' | 'updatedAt'
  > {}

class Fund extends Model<FundAttributes, FundCreationAttributes> implements FundAttributes {
  declare id: string;
  declare name: string;
  declare companyName: string | undefined;
  declare contactEmail: string;
  declare contactPhone: string | undefined;
  declare description: string | undefined;
  declare website: string | undefined;
  declare enabled: boolean;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Find or create a fund by email
   * Uses transaction to prevent race conditions with concurrent requests
   */
  static async findOrCreateByEmail(data: {
    name: string;
    companyName?: string;
    contactEmail: string;
    contactPhone?: string;
  }): Promise<{ fund: Fund; created: boolean }> {
    const normalizedEmail = data.contactEmail.trim().toLowerCase();

    // Use transaction to prevent race conditions
    return await sequelize.transaction(async (transaction) => {
      // Try to find by email first with lock
      let fund = await Fund.findOne({
        where: { contactEmail: normalizedEmail },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (fund) {
        // Update phone if provided and different
        if (data.contactPhone && data.contactPhone !== fund.contactPhone) {
          await fund.update({ contactPhone: data.contactPhone }, { transaction });
        }
        return { fund, created: false };
      }

      // Try to find by phone if provided
      if (data.contactPhone) {
        fund = await Fund.findOne({
          where: { contactPhone: data.contactPhone },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (fund) {
          return { fund, created: false };
        }
      }

      // Create new fund within transaction
      try {
        fund = await Fund.create(
          {
            name: data.name,
            companyName: data.companyName,
            contactEmail: normalizedEmail,
            contactPhone: data.contactPhone,
            enabled: true,
          },
          { transaction }
        );
        return { fund, created: true };
      } catch (error: any) {
        // Handle unique constraint violation from concurrent insert
        if (error.name === 'SequelizeUniqueConstraintError') {
          fund = await Fund.findOne({
            where: { contactEmail: normalizedEmail },
            transaction,
          });
          if (fund) {
            return { fund, created: false };
          }
        }
        throw error;
      }
    });
  }
}

Fund.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: () => `fund-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    companyName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contactEmail: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    contactPhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
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
    tableName: 'funds',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['contactEmail'] },
      { fields: ['contactPhone'] },
      { fields: ['enabled'] },
      { fields: ['companyName'] },
    ],
  }
);

export default Fund;
export { FundAttributes, FundCreationAttributes };
