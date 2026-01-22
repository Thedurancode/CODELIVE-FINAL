/**
 * ConversationHistory Model
 *
 * Persists AI agent conversation history for continuity across sessions.
 * Enables users to continue conversations after server restarts.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface ConversationHistoryAttributes {
  id: number;
  sessionId: string;
  userId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: any[];
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ConversationHistoryCreationAttributes
  extends Optional<ConversationHistoryAttributes, 'id' | 'userId' | 'toolCalls' | 'metadata'> {}

class ConversationHistory
  extends Model<ConversationHistoryAttributes, ConversationHistoryCreationAttributes>
  implements ConversationHistoryAttributes
{
  public id!: number;
  public sessionId!: string;
  public userId?: string;
  public role!: 'user' | 'assistant' | 'system';
  public content!: string;
  public toolCalls?: any[];
  public metadata?: Record<string, any>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ConversationHistory.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    sessionId: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'session_id',
    },
    userId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'user_id',
    },
    role: {
      type: DataTypes.ENUM('user', 'assistant', 'system'),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    toolCalls: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'tool_calls',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'conversation_history',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['session_id'] },
      { fields: ['user_id'] },
      { fields: ['created_at'] },
    ],
  }
);

export default ConversationHistory;
