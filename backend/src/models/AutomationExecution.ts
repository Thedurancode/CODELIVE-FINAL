/**
 * AutomationExecution Model
 *
 * Tracks the execution history of automations for monitoring and debugging.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type ExecutionStatus = 'success' | 'failed' | 'partial' | 'skipped';
export type TriggeredBy = 'event' | 'manual' | 'schedule' | 'api';

interface AutomationExecutionAttributes {
  id: number;
  automationId: string;
  automationName: string;
  status: ExecutionStatus;
  triggeredBy: TriggeredBy;
  eventType: string;
  eventPayload: object;
  results: object;
  actionsExecuted: number;
  actionsFailed: number;
  error?: string;
  duration: number;
  executedAt: Date;
  createdAt: Date;
}

interface AutomationExecutionCreationAttributes
  extends Optional<
    AutomationExecutionAttributes,
    'id' | 'error' | 'createdAt'
  > {}

class AutomationExecution
  extends Model<AutomationExecutionAttributes, AutomationExecutionCreationAttributes>
  implements AutomationExecutionAttributes
{
  declare id: number;
  declare automationId: string;
  declare automationName: string;
  declare status: ExecutionStatus;
  declare triggeredBy: TriggeredBy;
  declare eventType: string;
  declare eventPayload: object;
  declare results: object;
  declare actionsExecuted: number;
  declare actionsFailed: number;
  declare error: string | undefined;
  declare duration: number;
  declare executedAt: Date;
  declare readonly createdAt: Date;

  /**
   * Get a summary of the execution
   */
  getSummary(): string {
    if (this.status === 'success') {
      return `Executed ${this.actionsExecuted} action(s) in ${this.duration}ms`;
    } else if (this.status === 'partial') {
      return `Partially executed: ${this.actionsExecuted - this.actionsFailed}/${this.actionsExecuted} actions succeeded`;
    } else if (this.status === 'skipped') {
      return 'Skipped due to conditions not met or cooldown';
    } else {
      return this.error || 'Execution failed';
    }
  }
}

AutomationExecution.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    automationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    automationName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('success', 'failed', 'partial', 'skipped'),
      allowNull: false,
    },
    triggeredBy: {
      type: DataTypes.ENUM('event', 'manual', 'schedule', 'api'),
      allowNull: false,
      defaultValue: 'event',
    },
    eventType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    eventPayload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    results: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    actionsExecuted: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    actionsFailed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    executedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'automation_executions',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['automationId'] },
      { fields: ['status'] },
      { fields: ['executedAt'] },
      { fields: ['eventType'] },
    ],
  }
);

export default AutomationExecution;
export { AutomationExecutionAttributes, AutomationExecutionCreationAttributes };
