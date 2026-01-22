/**
 * Contact Alias Model
 *
 * Stores nicknames, aliases, and alternative names for contacts.
 * Supports:
 * - Built-in common nicknames (Ed → Edward, Mike → Michael)
 * - User-defined aliases
 * - Learned preferences from corrections ("the other John" → boost)
 */

import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type AliasSource = 'builtin' | 'user' | 'learned';

export interface ContactAliasAttributes {
  id: number;
  contactId: number;
  alias: string;
  source: AliasSource;
  weight: number; // 0-1, higher = more preferred
  userId?: string; // Who created/learned this alias
  organizationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactAliasCreationAttributes
  extends Optional<ContactAliasAttributes, 'id' | 'weight' | 'userId' | 'organizationId' | 'createdAt' | 'updatedAt'> {}

class ContactAlias extends Model<ContactAliasAttributes, ContactAliasCreationAttributes>
  implements ContactAliasAttributes {
  public id!: number;
  public contactId!: number;
  public alias!: string;
  public source!: AliasSource;
  public weight!: number;
  public userId?: string;
  public organizationId?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ============================================================================
  // Static Methods
  // ============================================================================

  /**
   * Find contacts by alias
   */
  static async findContactIdsByAlias(
    alias: string,
    organizationId?: string
  ): Promise<Array<{ contactId: number; weight: number }>> {
    const normalizedAlias = alias.toLowerCase().trim();

    const where: Record<string, unknown> = {
      alias: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('alias')),
        normalizedAlias
      ),
    };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const aliases = await ContactAlias.findAll({
      where,
      attributes: ['contactId', 'weight'],
      order: [['weight', 'DESC']],
    });

    return aliases.map((a) => ({
      contactId: a.contactId,
      weight: a.weight,
    }));
  }

  /**
   * Add or update an alias for a contact
   */
  static async addAlias(
    contactId: number,
    alias: string,
    options: {
      source: AliasSource;
      weight?: number;
      userId?: string;
      organizationId?: string;
    }
  ): Promise<ContactAlias> {
    const normalizedAlias = alias.toLowerCase().trim();

    const [aliasRecord, created] = await ContactAlias.findOrCreate({
      where: {
        contactId,
        alias: normalizedAlias,
      },
      defaults: {
        contactId,
        alias: normalizedAlias,
        source: options.source,
        weight: options.weight ?? 0.8,
        userId: options.userId,
        organizationId: options.organizationId,
      },
    });

    // If exists and learned, boost the weight
    if (!created && options.source === 'learned') {
      const newWeight = Math.min(1.0, aliasRecord.weight + 0.1);
      await aliasRecord.update({ weight: newWeight });
    }

    return aliasRecord;
  }

  /**
   * Boost alias weight (when user confirms this contact)
   */
  static async boostAlias(contactId: number, alias: string, amount: number = 0.1): Promise<void> {
    const normalizedAlias = alias.toLowerCase().trim();

    await ContactAlias.update(
      {
        weight: sequelize.literal(`LEAST(1.0, weight + ${amount})`),
      } as any,
      {
        where: {
          contactId,
          alias: normalizedAlias,
        },
      }
    );
  }

  /**
   * Reduce alias weight (when user rejects this contact)
   */
  static async reduceAlias(contactId: number, alias: string, amount: number = 0.1): Promise<void> {
    const normalizedAlias = alias.toLowerCase().trim();

    await ContactAlias.update(
      {
        weight: sequelize.literal(`GREATEST(0.0, weight - ${amount})`),
      } as any,
      {
        where: {
          contactId,
          alias: normalizedAlias,
        },
      }
    );
  }

  /**
   * Get all aliases for a contact
   */
  static async getAliasesForContact(contactId: number): Promise<string[]> {
    const aliases = await ContactAlias.findAll({
      where: { contactId },
      attributes: ['alias'],
      order: [['weight', 'DESC']],
    });

    return aliases.map((a) => a.alias);
  }
}

ContactAlias.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    contactId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'contact_id',
      references: {
        model: 'contacts',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    alias: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    source: {
      type: DataTypes.ENUM('builtin', 'user', 'learned'),
      allowNull: false,
      defaultValue: 'user',
    },
    weight: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.8,
      validate: {
        min: 0,
        max: 1,
      },
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
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
    tableName: 'contact_aliases',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['alias'],
      },
      {
        fields: ['contact_id'],
      },
      {
        fields: ['organization_id'],
      },
      {
        unique: true,
        fields: ['contact_id', 'alias'],
      },
    ],
  }
);

export default ContactAlias;
