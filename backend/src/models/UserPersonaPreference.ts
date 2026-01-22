/**
 * User Persona Preference Model
 *
 * Stores user preferences for AI persona behavior including communication style,
 * verbosity, proactivity level, and auto-detected communication patterns.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Persona style options
export type PersonaStyle = 'formal' | 'casual' | 'balanced' | 'mentor';
export type VerbosityLevel = 'concise' | 'normal' | 'detailed';
export type ProactivityLevel = 'minimal' | 'moderate' | 'high';
export type HumorLevel = 'none' | 'light' | 'moderate';

// Auto-detected communication style from user messages
export interface DetectedStyle {
  formality: number; // 0-1 scale
  avgMessageLength: number;
  usesEmoji: boolean;
  preferredTerms: string[]; // "deal" vs "property" vs "opportunity"
  responseSpeed: 'fast' | 'thoughtful';
  lastAnalyzed: Date;
  sampleCount: number; // number of messages analyzed
}

interface UserPersonaPreferenceAttributes {
  id: string;
  userId: string;

  // Explicit preferences
  personaStyle: PersonaStyle;
  verbosity: VerbosityLevel;
  proactivity: ProactivityLevel;
  humorLevel: HumorLevel;
  namePreference?: string; // what to call the user
  customInstructions?: string; // user's custom persona notes

  // Auto-detected patterns
  detectedStyle?: DetectedStyle;

  // Relationship context
  firstInteractionAt?: Date;
  totalConversations: number;
  relationshipStage: 'new' | 'familiar' | 'trusted' | 'partner';

  createdAt: Date;
  updatedAt: Date;
}

interface UserPersonaPreferenceCreationAttributes
  extends Optional<
    UserPersonaPreferenceAttributes,
    | 'id'
    | 'personaStyle'
    | 'verbosity'
    | 'proactivity'
    | 'humorLevel'
    | 'namePreference'
    | 'customInstructions'
    | 'detectedStyle'
    | 'firstInteractionAt'
    | 'totalConversations'
    | 'relationshipStage'
    | 'createdAt'
    | 'updatedAt'
  > {}

class UserPersonaPreference
  extends Model<UserPersonaPreferenceAttributes, UserPersonaPreferenceCreationAttributes>
  implements UserPersonaPreferenceAttributes
{
  declare id: string;
  declare userId: string;

  declare personaStyle: PersonaStyle;
  declare verbosity: VerbosityLevel;
  declare proactivity: ProactivityLevel;
  declare humorLevel: HumorLevel;
  declare namePreference: string | undefined;
  declare customInstructions: string | undefined;

  declare detectedStyle: DetectedStyle | undefined;

  declare firstInteractionAt: Date | undefined;
  declare totalConversations: number;
  declare relationshipStage: 'new' | 'familiar' | 'trusted' | 'partner';

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

UserPersonaPreference.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'user_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    personaStyle: {
      type: DataTypes.ENUM('formal', 'casual', 'balanced', 'mentor'),
      defaultValue: 'balanced',
      field: 'persona_style',
      comment: 'Communication style preference',
    },
    verbosity: {
      type: DataTypes.ENUM('concise', 'normal', 'detailed'),
      defaultValue: 'normal',
      comment: 'Response length preference',
    },
    proactivity: {
      type: DataTypes.ENUM('minimal', 'moderate', 'high'),
      defaultValue: 'moderate',
      comment: 'How proactive the AI should be with suggestions',
    },
    humorLevel: {
      type: DataTypes.ENUM('none', 'light', 'moderate'),
      defaultValue: 'light',
      field: 'humor_level',
      comment: 'Amount of humor in responses',
    },
    namePreference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'name_preference',
      comment: 'Preferred name to be called',
    },
    customInstructions: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'custom_instructions',
      comment: 'User-provided custom instructions for AI behavior',
    },
    detectedStyle: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'detected_style',
      comment: 'Auto-detected communication patterns from user messages',
    },
    firstInteractionAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'first_interaction_at',
      comment: 'Timestamp of first conversation with this user',
    },
    totalConversations: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_conversations',
      comment: 'Total number of conversation sessions',
    },
    relationshipStage: {
      type: DataTypes.ENUM('new', 'familiar', 'trusted', 'partner'),
      defaultValue: 'new',
      field: 'relationship_stage',
      comment: 'Current stage of AI-user relationship',
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'user_persona_preferences',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'], unique: true },
      { fields: ['persona_style'] },
      { fields: ['relationship_stage'] },
    ],
  }
);

export default UserPersonaPreference;
