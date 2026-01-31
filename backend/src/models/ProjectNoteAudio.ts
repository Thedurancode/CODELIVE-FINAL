/**
 * ProjectNoteAudio Model
 *
 * Stores audio recordings and their transcripts for project notes.
 * Audio files are stored in Supabase Storage, transcribed using OpenAI Whisper.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ProjectNoteAudioAttributes {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  audioStoragePath: string;
  duration: number | null;
  transcript: string | null;
  transcriptionStatus: TranscriptionStatus;
  transcriptionError: string | null;
  transcriptionLanguage: string | null;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectNoteAudioCreationAttributes
  extends Optional<
    ProjectNoteAudioAttributes,
    'id' | 'duration' | 'transcript' | 'transcriptionStatus' | 'transcriptionError' | 'transcriptionLanguage' | 'createdAt' | 'updatedAt'
  > {}

class ProjectNoteAudio
  extends Model<ProjectNoteAudioAttributes, ProjectNoteAudioCreationAttributes>
  implements ProjectNoteAudioAttributes
{
  declare id: number;
  declare projectId: string;
  declare userId: string;
  declare organizationId: string;
  declare audioStoragePath: string;
  declare duration: number | null;
  declare transcript: string | null;
  declare transcriptionStatus: TranscriptionStatus;
  declare transcriptionError: string | null;
  declare transcriptionLanguage: string | null;
  declare originalFilename: string;
  declare mimeType: string;
  declare fileSize: number;
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
   * Check if user is the author of this audio note
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
   * Get audio notes for a project
   */
  static async getForProject(
    projectId: string,
    organizationId: string
  ): Promise<ProjectNoteAudio[]> {
    return this.findAll({
      where: { projectId, organizationId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get audio note count for a project
   */
  static async getAudioNoteCount(projectId: string, organizationId: string): Promise<number> {
    return this.count({
      where: { projectId, organizationId },
    });
  }
}

ProjectNoteAudio.init(
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
    audioStoragePath: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'audio_storage_path',
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Duration in seconds',
    },
    transcript: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    transcriptionStatus: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'transcription_status',
    },
    transcriptionError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'transcription_error',
    },
    transcriptionLanguage: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'transcription_language',
      comment: 'Language code for transcription (e.g., en, es, fr)',
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
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'file_size',
      comment: 'File size in bytes',
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
    tableName: 'project_note_audio',
    modelName: 'ProjectNoteAudio',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['user_id'] },
      { fields: ['organization_id'] },
      { fields: ['project_id', 'organization_id'] },
      { fields: ['transcription_status'] },
      { fields: ['created_at'] },
    ],
  }
);

export default ProjectNoteAudio;
