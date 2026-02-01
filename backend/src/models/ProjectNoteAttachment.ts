/**
 * Project Note Attachment Model
 *
 * Stores file attachments (images, documents, audio) for project notes.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface ProjectNoteAttachmentAttributes {
  id: number;
  noteId: number;
  projectId: string;
  userId: string;
  organizationId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  type: 'image' | 'document' | 'audio' | 'video' | 'other';
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ProjectNoteAttachmentCreationAttributes
  extends Optional<ProjectNoteAttachmentAttributes, 'id' | 'thumbnailUrl' | 'metadata' | 'createdAt' | 'updatedAt'> {}

class ProjectNoteAttachment
  extends Model<ProjectNoteAttachmentAttributes, ProjectNoteAttachmentCreationAttributes>
  implements ProjectNoteAttachmentAttributes
{
  public id!: number;
  public noteId!: number;
  public projectId!: string;
  public userId!: string;
  public organizationId!: string;
  public filename!: string;
  public originalFilename!: string;
  public mimeType!: string;
  public size!: number;
  public url!: string;
  public thumbnailUrl?: string;
  public type!: 'image' | 'document' | 'audio' | 'video' | 'other';
  public metadata?: Record<string, unknown>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ProjectNoteAttachment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    noteId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'note_id',
      references: {
        model: 'project_notes',
        key: 'id',
      },
      onDelete: 'CASCADE',
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
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
    },
    filename: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    originalFilename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'original_filename',
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'mime_type',
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    thumbnailUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'thumbnail_url',
    },
    type: {
      type: DataTypes.ENUM('image', 'document', 'audio', 'video', 'other'),
      allowNull: false,
      defaultValue: 'other',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
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
    tableName: 'project_note_attachments',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['note_id'] },
      { fields: ['project_id'] },
      { fields: ['user_id'] },
      { fields: ['organization_id'] },
      { fields: ['type'] },
    ],
  }
);

export default ProjectNoteAttachment;
export { ProjectNoteAttachmentAttributes, ProjectNoteAttachmentCreationAttributes };
