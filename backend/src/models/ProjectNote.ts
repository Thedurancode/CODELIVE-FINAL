/**
 * ProjectNote Model
 *
 * Stores notes on projects with team member attribution.
 * All notes visible to organization members, authors can edit/delete their own.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface ProjectNoteAttributes {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  content: string;
  subject?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectNoteCreationAttributes
  extends Optional<ProjectNoteAttributes, 'id' | 'subject' | 'createdAt' | 'updatedAt'> {}

class ProjectNote
  extends Model<ProjectNoteAttributes, ProjectNoteCreationAttributes>
  implements ProjectNoteAttributes
{
  declare id: number;
  declare projectId: string;
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
    name?: string;
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
    const { firstName, lastName, name, email } = this.author;
    if (name) return name;
    if (firstName || lastName) {
      return [firstName, lastName].filter(Boolean).join(' ');
    }
    return email || 'Unknown';
  }

  /**
   * Get notes for a project
   */
  static async getForProject(
    projectId: string,
    organizationId: string
  ): Promise<ProjectNote[]> {
    return this.findAll({
      where: { projectId, organizationId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Create a note
   */
  static async createNote(data: {
    projectId: string;
    userId: string;
    organizationId: string;
    content: string;
    subject?: string;
  }): Promise<ProjectNote> {
    return this.create(data);
  }

  /**
   * Update a note (author only)
   */
  static async updateNote(
    noteId: number,
    userId: string,
    updates: { content?: string; subject?: string }
  ): Promise<ProjectNote | null> {
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

  /**
   * Get note count for a project
   */
  static async getNoteCount(projectId: string, organizationId: string): Promise<number> {
    return this.count({
      where: { projectId, organizationId },
    });
  }
}

ProjectNote.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    projectId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'project_id',
      references: {
        model: 'projects',
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
    tableName: 'project_notes',
    modelName: 'ProjectNote',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['user_id'] },
      { fields: ['organization_id'] },
      { fields: ['project_id', 'organization_id'] },
      { fields: ['created_at'] },
    ],
  }
);

export default ProjectNote;
