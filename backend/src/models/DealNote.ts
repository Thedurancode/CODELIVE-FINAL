/**
 * DealNote Model
 *
 * Stores notes on deals/properties with team member attribution.
 * All notes visible to organization members, authors can edit/delete their own.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface DealNoteAttributes {
  id: number;
  propertyId: number;
  userId: string;
  organizationId: string;
  content: string;
  subject?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DealNoteCreationAttributes
  extends Optional<DealNoteAttributes, 'id' | 'subject' | 'createdAt' | 'updatedAt'> {}

class DealNote
  extends Model<DealNoteAttributes, DealNoteCreationAttributes>
  implements DealNoteAttributes
{
  declare id: number;
  declare propertyId: number;
  declare userId: string;
  declare organizationId: string;
  declare content: string;
  declare subject?: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual field populated by association
  declare author?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };

  /**
   * Check if user is the author of this note
   */
  isAuthor(userId: string): boolean {
    return this.userId === userId;
  }

  /**
   * Get formatted author name
   */
  getAuthorName(): string {
    if (!this.author) return 'Unknown';
    const { firstName, lastName, email } = this.author;
    if (firstName || lastName) {
      return [firstName, lastName].filter(Boolean).join(' ');
    }
    return email || 'Unknown';
  }

  /**
   * Get notes for a property
   */
  static async getForProperty(
    propertyId: number,
    organizationId: string
  ): Promise<DealNote[]> {
    return this.findAll({
      where: { propertyId, organizationId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Create a note
   */
  static async createNote(data: {
    propertyId: number;
    userId: string;
    organizationId: string;
    content: string;
    subject?: string;
  }): Promise<DealNote> {
    return this.create(data);
  }

  /**
   * Update a note (author only)
   */
  static async updateNote(
    noteId: number,
    userId: string,
    updates: { content?: string; subject?: string }
  ): Promise<DealNote | null> {
    const note = await this.findByPk(noteId);
    if (!note || !note.isAuthor(userId)) {
      return null;
    }
    return note.update(updates);
  }

  /**
   * Delete a note (author only)
   */
  static async deleteNote(noteId: number, userId: string): Promise<boolean> {
    const note = await this.findByPk(noteId);
    if (!note || !note.isAuthor(userId)) {
      return false;
    }
    await note.destroy();
    return true;
  }
}

DealNote.init(
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
      onDelete: 'CASCADE',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'deal_notes',
    modelName: 'DealNote',
    timestamps: true,
    indexes: [
      { fields: ['propertyId'] },
      { fields: ['userId'] },
      { fields: ['organizationId'] },
      { fields: ['propertyId', 'organizationId'] },
      { fields: ['createdAt'] },
    ],
  }
);

export default DealNote;
