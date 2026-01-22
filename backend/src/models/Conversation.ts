/**
 * Conversation Model
 *
 * Represents a chat conversation with AI agent.
 * Stores metadata like title, message count, and timestamps.
 * Links to ConversationHistory messages via sessionId.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface ConversationAttributes {
  id: string; // UUID, same as sessionId
  userId: string;
  title: string;
  generatedTitle: boolean; // Whether title was AI-generated or manually set
  messageCount: number;
  lastMessageAt: Date | null;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ConversationCreationAttributes
  extends Optional<
    ConversationAttributes,
    'title' | 'generatedTitle' | 'messageCount' | 'lastMessageAt' | 'metadata'
  > {}

class Conversation
  extends Model<ConversationAttributes, ConversationCreationAttributes>
  implements ConversationAttributes
{
  declare id: string;
  declare userId: string;
  declare title: string;
  declare generatedTitle: boolean;
  declare messageCount: number;
  declare lastMessageAt: Date | null;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Conversation.init(
  {
    id: {
      type: DataTypes.STRING(100),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'user_id',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'New Conversation',
    },
    generatedTitle: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'generated_title',
    },
    messageCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'message_count',
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_message_at',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'conversations',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['created_at'] },
      { fields: ['last_message_at'] },
    ],
  }
);

export default Conversation;
