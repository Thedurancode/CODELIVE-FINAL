/**
 * Workflow Execution Model
 *
 * Persists workflow execution state to the database.
 * Used by the WorkflowEngine for resuming workflows after restart.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import {
  WorkflowExecution as WorkflowExecutionType,
  WorkflowStepExecution,
} from '../plugins/types';

interface WorkflowExecutionAttributes {
  id: string;
  workflowId: string;
  dealId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  currentStepId: string;
  stepHistory: WorkflowStepExecution[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

interface WorkflowExecutionCreationAttributes
  extends Optional<
    WorkflowExecutionAttributes,
    'id' | 'status' | 'stepHistory' | 'completedAt' | 'error'
  > {}

class WorkflowExecution
  extends Model<WorkflowExecutionAttributes, WorkflowExecutionCreationAttributes>
  implements WorkflowExecutionAttributes
{
  declare id: string;
  declare workflowId: string;
  declare dealId: string;
  declare status: 'running' | 'completed' | 'failed' | 'paused';
  declare currentStepId: string;
  declare stepHistory: WorkflowStepExecution[];
  declare startedAt: Date;
  declare completedAt: Date | undefined;
  declare error: string | undefined;

  /**
   * Convert to the WorkflowExecution type expected by WorkflowEngine
   */
  toWorkflowExecution(): WorkflowExecutionType {
    return {
      id: this.id,
      workflowId: this.workflowId,
      dealId: this.dealId,
      status: this.status,
      currentStepId: this.currentStepId,
      stepHistory: this.stepHistory,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error,
    };
  }
}

WorkflowExecution.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    workflowId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('running', 'completed', 'failed', 'paused'),
      defaultValue: 'running',
    },
    currentStepId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    stepHistory: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'workflow_executions',
    timestamps: false,
    indexes: [
      { fields: ['workflowId'] },
      { fields: ['dealId'] },
      { fields: ['status'] },
      { fields: ['startedAt'] },
    ],
  }
);

export default WorkflowExecution;
export { WorkflowExecutionAttributes, WorkflowExecutionCreationAttributes };
