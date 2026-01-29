/**
 * Compliance Workflow Model
 *
 * Automates compliance remediation workflows with:
 * - Task assignment rules
 * - Deadline tracking
 * - Escalation rules
 * - Deal pipeline auto-hold integration
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

// Workflow status options
export type WorkflowStatus = 'active' | 'paused' | 'archived';

// Severity levels that trigger the workflow
export type SeverityTrigger = 'critical' | 'warning' | 'info' | 'all';

// Action types for workflow steps
export type WorkflowActionType =
  | 'create_task'
  | 'assign_task'
  | 'send_notification'
  | 'hold_deal'
  | 'escalate'
  | 'custom';

// Assignment strategy
export type AssignmentStrategy =
  | 'round_robin'      // Distribute among team members
  | 'workload_based'   // Assign to person with least tasks
  | 'specific_user'    // Assign to a specific user
  | 'role_based'       // Assign to users with specific role
  | 'property_owner';  // Assign to deal owner

// Escalation rule configuration
export interface EscalationRule {
  id: string;
  name: string;
  enabled: boolean;
  afterHours: number;           // Escalate after X hours
  escalateTo: string[];         // User IDs or role names
  notificationChannels: ('email' | 'sms' | 'slack' | 'in_app')[];
  messageTemplate?: string;
  repeatInterval?: number;      // Re-escalate every X hours if not resolved
  maxEscalations?: number;      // Maximum number of escalations
}

// Task template for auto-creation
export interface TaskTemplate {
  titleTemplate: string;        // Supports variables like {{issue.ruleName}}
  descriptionTemplate?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueDays: number;              // Days from issue detection
  tags: string[];
  assignmentStrategy: AssignmentStrategy;
  assignToUserId?: string;      // If strategy is 'specific_user'
  assignToRoleId?: string;      // If strategy is 'role_based'
}

// Workflow step definition
export interface WorkflowStep {
  id: string;
  order: number;
  name: string;
  description?: string;
  actionType: WorkflowActionType;
  condition?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'in';
    value: unknown;
  };
  taskTemplate?: TaskTemplate;
  notificationConfig?: {
    channels: ('email' | 'sms' | 'slack' | 'in_app')[];
    recipients: string[];       // User IDs or 'deal_owner', 'assignee'
    messageTemplate: string;
    subject?: string;
  };
  holdDealConfig?: {
    holdStages: string[];       // Which pipeline stages to hold at
    releaseOnResolution: boolean;
    notifyDealOwner: boolean;
  };
  escalationConfig?: EscalationRule;
  delayMinutes?: number;        // Delay before executing this step
  metadata?: Record<string, unknown>;
}

// Trigger conditions
export interface TriggerConditions {
  severities: SeverityTrigger[];
  categories?: string[];        // Compliance categories to trigger on
  ruleIds?: number[];           // Specific rule IDs
  states?: string[];            // US states
  minIssueCount?: number;       // Minimum issues to trigger
  dealStages?: string[];        // Only trigger for deals in these stages
  excludeRuleIds?: number[];    // Rules to exclude
}

export interface ComplianceWorkflowAttributes {
  id?: number;
  name: string;
  description?: string;
  status: WorkflowStatus;
  organizationId?: string;
  userId: string;               // Creator

  // Trigger configuration
  triggerConditions: TriggerConditions;

  // Workflow steps
  steps: WorkflowStep[];

  // Auto-hold configuration
  autoHoldEnabled: boolean;
  autoHoldSeverities: SeverityTrigger[];
  autoHoldDealStages?: string[];

  // Deadline tracking
  defaultDeadlineDays: number;

  // Global escalation rules
  escalationRules: EscalationRule[];

  // Statistics
  totalExecutions: number;
  successfulExecutions: number;
  lastExecutedAt?: Date;

  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
}

type ComplianceWorkflowCreationAttributes = Optional<
  ComplianceWorkflowAttributes,
  | 'id'
  | 'description'
  | 'organizationId'
  | 'status'
  | 'autoHoldEnabled'
  | 'autoHoldSeverities'
  | 'autoHoldDealStages'
  | 'defaultDeadlineDays'
  | 'escalationRules'
  | 'totalExecutions'
  | 'successfulExecutions'
  | 'lastExecutedAt'
  | 'createdAt'
  | 'updatedAt'
>;

class ComplianceWorkflow
  extends Model<ComplianceWorkflowAttributes, ComplianceWorkflowCreationAttributes>
  implements ComplianceWorkflowAttributes
{
  declare id: number;
  declare name: string;
  declare description?: string;
  declare status: WorkflowStatus;
  declare organizationId?: string;
  declare userId: string;
  declare triggerConditions: TriggerConditions;
  declare steps: WorkflowStep[];
  declare autoHoldEnabled: boolean;
  declare autoHoldSeverities: SeverityTrigger[];
  declare autoHoldDealStages?: string[];
  declare defaultDeadlineDays: number;
  declare escalationRules: EscalationRule[];
  declare totalExecutions: number;
  declare successfulExecutions: number;
  declare lastExecutedAt?: Date;
  declare createdAt: Date;
  declare updatedAt: Date;

  /**
   * Get all active workflows
   */
  static async getActiveWorkflows(): Promise<ComplianceWorkflow[]> {
    return this.findAll({
      where: { status: 'active' },
      order: [['name', 'ASC']],
    });
  }

  /**
   * Get workflows for a user or organization
   */
  static async getByUserOrOrg(userId: string, organizationId?: string): Promise<ComplianceWorkflow[]> {
    const where: Record<string, unknown> = organizationId
      ? { organizationId }
      : { userId };

    return this.findAll({
      where,
      order: [['updatedAt', 'DESC']],
    });
  }

  /**
   * Get workflows that match the given compliance issue
   */
  static async getMatchingWorkflows(issue: {
    severity: string;
    category?: string;
    ruleId?: number;
    state?: string;
    dealStage?: string;
  }): Promise<ComplianceWorkflow[]> {
    const activeWorkflows = await this.getActiveWorkflows();

    return activeWorkflows.filter(workflow => {
      const { triggerConditions } = workflow;

      // Check severity
      if (!triggerConditions.severities.includes('all')) {
        if (!triggerConditions.severities.includes(issue.severity as SeverityTrigger)) {
          return false;
        }
      }

      // Check category
      if (triggerConditions.categories?.length && issue.category) {
        if (!triggerConditions.categories.includes(issue.category)) {
          return false;
        }
      }

      // Check specific rule IDs
      if (triggerConditions.ruleIds?.length && issue.ruleId) {
        if (!triggerConditions.ruleIds.includes(issue.ruleId)) {
          return false;
        }
      }

      // Check excluded rule IDs
      if (triggerConditions.excludeRuleIds?.length && issue.ruleId) {
        if (triggerConditions.excludeRuleIds.includes(issue.ruleId)) {
          return false;
        }
      }

      // Check state
      if (triggerConditions.states?.length && issue.state) {
        if (!triggerConditions.states.includes(issue.state)) {
          return false;
        }
      }

      // Check deal stage
      if (triggerConditions.dealStages?.length && issue.dealStage) {
        if (!triggerConditions.dealStages.includes(issue.dealStage)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Check if workflow should auto-hold a deal
   */
  shouldHoldDeal(severity: string, dealStage?: string): boolean {
    if (!this.autoHoldEnabled) return false;

    // Check severity
    if (!this.autoHoldSeverities.includes('all')) {
      if (!this.autoHoldSeverities.includes(severity as SeverityTrigger)) {
        return false;
      }
    }

    // Check deal stage
    if (this.autoHoldDealStages?.length && dealStage) {
      if (!this.autoHoldDealStages.includes(dealStage)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get sorted workflow steps
   */
  getSortedSteps(): WorkflowStep[] {
    return [...this.steps].sort((a, b) => a.order - b.order);
  }

  /**
   * Record workflow execution
   */
  async recordExecution(success: boolean): Promise<void> {
    await this.update({
      totalExecutions: this.totalExecutions + 1,
      successfulExecutions: success ? this.successfulExecutions + 1 : this.successfulExecutions,
      lastExecutedAt: new Date(),
    });
  }

  /**
   * Get success rate
   */
  getSuccessRate(): number {
    if (this.totalExecutions === 0) return 0;
    return Math.round((this.successfulExecutions / this.totalExecutions) * 100);
  }
}

ComplianceWorkflow.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('active', 'paused', 'archived'),
      allowNull: false,
      defaultValue: 'active',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id',
      },
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    triggerConditions: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    steps: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    autoHoldEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    autoHoldSeverities: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ['critical'],
    },
    autoHoldDealStages: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    defaultDeadlineDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 7,
    },
    escalationRules: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    totalExecutions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    successfulExecutions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'compliance_workflows',
    timestamps: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['userId'] },
      { fields: ['organizationId'] },
      { fields: ['autoHoldEnabled'] },
      { fields: ['lastExecutedAt'] },
    ],
  }
);

// ============================================================================
// COMPLIANCE WORKFLOW EXECUTION MODEL
// ============================================================================

export type ExecutionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface StepExecution {
  stepId: string;
  stepName: string;
  status: ExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: Record<string, unknown>;
  taskId?: string;            // If a task was created
  escalationCount?: number;   // Number of escalations for this step
  lastEscalatedAt?: Date;
}

export interface ComplianceWorkflowExecutionAttributes {
  id?: number;
  workflowId: number;
  complianceCheckId: number;
  propertyId: number;
  dealPipelineId?: string;

  // Issue details
  issueId: string;
  issueSeverity: string;
  issueCategory?: string;
  issueRuleId?: number;

  // Execution status
  status: ExecutionStatus;
  stepExecutions: StepExecution[];
  currentStepIndex: number;

  // Deal hold status
  dealHeld: boolean;
  dealHeldAt?: Date;
  dealReleasedAt?: Date;
  holdReason?: string;

  // Assignment tracking
  assignedTasks: string[];    // Task IDs created by this execution

  // Resolution tracking
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;

  // Timestamps
  triggeredAt: Date;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

type ComplianceWorkflowExecutionCreationAttributes = Optional<
  ComplianceWorkflowExecutionAttributes,
  | 'id'
  | 'dealPipelineId'
  | 'issueCategory'
  | 'issueRuleId'
  | 'stepExecutions'
  | 'currentStepIndex'
  | 'dealHeld'
  | 'dealHeldAt'
  | 'dealReleasedAt'
  | 'holdReason'
  | 'assignedTasks'
  | 'resolvedAt'
  | 'resolvedBy'
  | 'resolutionNotes'
  | 'completedAt'
  | 'createdAt'
  | 'updatedAt'
>;

class ComplianceWorkflowExecution
  extends Model<ComplianceWorkflowExecutionAttributes, ComplianceWorkflowExecutionCreationAttributes>
  implements ComplianceWorkflowExecutionAttributes
{
  declare id: number;
  declare workflowId: number;
  declare complianceCheckId: number;
  declare propertyId: number;
  declare dealPipelineId?: string;
  declare issueId: string;
  declare issueSeverity: string;
  declare issueCategory?: string;
  declare issueRuleId?: number;
  declare status: ExecutionStatus;
  declare stepExecutions: StepExecution[];
  declare currentStepIndex: number;
  declare dealHeld: boolean;
  declare dealHeldAt?: Date;
  declare dealReleasedAt?: Date;
  declare holdReason?: string;
  declare assignedTasks: string[];
  declare resolvedAt?: Date;
  declare resolvedBy?: string;
  declare resolutionNotes?: string;
  declare triggeredAt: Date;
  declare completedAt?: Date;
  declare createdAt: Date;
  declare updatedAt: Date;

  /**
   * Get pending executions
   */
  static async getPending(): Promise<ComplianceWorkflowExecution[]> {
    return this.findAll({
      where: {
        status: { [Op.in]: ['pending', 'in_progress'] },
      },
      order: [['triggeredAt', 'ASC']],
    });
  }

  /**
   * Get executions for a property
   */
  static async getByProperty(propertyId: number): Promise<ComplianceWorkflowExecution[]> {
    return this.findAll({
      where: { propertyId },
      order: [['triggeredAt', 'DESC']],
    });
  }

  /**
   * Get active holds
   */
  static async getActiveHolds(): Promise<ComplianceWorkflowExecution[]> {
    return this.findAll({
      where: {
        dealHeld: true,
        dealReleasedAt: { [Op.is]: null },
      },
      order: [['dealHeldAt', 'ASC']],
    });
  }

  /**
   * Update step execution status
   */
  async updateStepStatus(
    stepId: string,
    status: ExecutionStatus,
    details?: { error?: string; result?: Record<string, unknown>; taskId?: string }
  ): Promise<void> {
    const stepExecutions = [...this.stepExecutions];
    const stepIndex = stepExecutions.findIndex(s => s.stepId === stepId);

    if (stepIndex >= 0) {
      stepExecutions[stepIndex] = {
        ...stepExecutions[stepIndex],
        status,
        completedAt: status === 'completed' || status === 'failed' ? new Date() : undefined,
        error: details?.error,
        result: details?.result,
        taskId: details?.taskId,
      };

      await this.update({ stepExecutions });
    }
  }

  /**
   * Hold the deal
   */
  async holdDeal(reason: string): Promise<void> {
    await this.update({
      dealHeld: true,
      dealHeldAt: new Date(),
      holdReason: reason,
    });
  }

  /**
   * Release the deal hold
   */
  async releaseDeal(): Promise<void> {
    await this.update({
      dealHeld: false,
      dealReleasedAt: new Date(),
    });
  }

  /**
   * Mark as resolved
   */
  async resolve(userId: string, notes?: string): Promise<void> {
    await this.update({
      status: 'completed',
      resolvedAt: new Date(),
      resolvedBy: userId,
      resolutionNotes: notes,
      completedAt: new Date(),
    });

    // Release deal if held
    if (this.dealHeld && !this.dealReleasedAt) {
      await this.releaseDeal();
    }
  }

  /**
   * Add task to execution
   */
  async addTask(taskId: string): Promise<void> {
    await this.update({
      assignedTasks: [...this.assignedTasks, taskId],
    });
  }

  /**
   * Get duration in hours
   */
  getDurationHours(): number {
    const endTime = this.completedAt || new Date();
    const diffMs = endTime.getTime() - this.triggeredAt.getTime();
    return Math.round(diffMs / (1000 * 60 * 60) * 10) / 10;
  }
}

ComplianceWorkflowExecution.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    workflowId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'compliance_workflows',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    complianceCheckId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'compliance_checks',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    dealPipelineId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'deal_pipelines',
        key: 'id',
      },
    },
    issueId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    issueSeverity: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    issueCategory: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    issueRuleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    stepExecutions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    currentStepIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    dealHeld: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    dealHeldAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    dealReleasedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    holdReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    assignedTasks: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolvedBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    triggeredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'compliance_workflow_executions',
    timestamps: true,
    indexes: [
      { fields: ['workflowId'] },
      { fields: ['complianceCheckId'] },
      { fields: ['propertyId'] },
      { fields: ['dealPipelineId'] },
      { fields: ['status'] },
      { fields: ['dealHeld'] },
      { fields: ['issueId'] },
      { fields: ['triggeredAt'] },
      { fields: ['resolvedAt'] },
    ],
  }
);

// Define associations
ComplianceWorkflow.hasMany(ComplianceWorkflowExecution, {
  foreignKey: 'workflowId',
  as: 'executions',
});
ComplianceWorkflowExecution.belongsTo(ComplianceWorkflow, {
  foreignKey: 'workflowId',
  as: 'workflow',
});

export { ComplianceWorkflowExecution };
export default ComplianceWorkflow;
