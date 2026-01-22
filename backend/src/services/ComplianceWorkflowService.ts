/**
 * Compliance Workflow Service
 *
 * Orchestrates compliance remediation workflows:
 * - Triggers workflows based on compliance issues
 * - Creates and assigns tasks automatically
 * - Tracks deadlines and escalations
 * - Integrates with deal pipeline for auto-hold
 */

import { Op, Transaction } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import ComplianceWorkflow, {
  ComplianceWorkflowExecution,
  WorkflowStep,
  TaskTemplate,
  EscalationRule,
  ExecutionStatus,
  StepExecution,
  SeverityTrigger,
} from '../models/ComplianceWorkflow';
import Task, { TaskPriority } from '../models/Task';
import ComplianceCheck, { ComplianceIssueRecord } from '../models/ComplianceCheck';
import DealPipeline from '../models/DealPipeline';
import Property from '../models/Property';
import MarketplaceUser from '../models/MarketplaceUser';
import sequelize from '../config/database';
import { taskService } from './TaskService';

// Interfaces
interface CreateWorkflowData {
  name: string;
  description?: string;
  userId: string;
  organizationId?: string;
  triggerConditions: {
    severities: SeverityTrigger[];
    categories?: string[];
    ruleIds?: number[];
    states?: string[];
    dealStages?: string[];
    excludeRuleIds?: number[];
    minIssueCount?: number;
  };
  steps: WorkflowStep[];
  autoHoldEnabled?: boolean;
  autoHoldSeverities?: SeverityTrigger[];
  autoHoldDealStages?: string[];
  defaultDeadlineDays?: number;
  escalationRules?: EscalationRule[];
}

interface UpdateWorkflowData {
  name?: string;
  description?: string;
  status?: 'active' | 'paused' | 'archived';
  triggerConditions?: {
    severities: SeverityTrigger[];
    categories?: string[];
    ruleIds?: number[];
    states?: string[];
    dealStages?: string[];
    excludeRuleIds?: number[];
    minIssueCount?: number;
  };
  steps?: WorkflowStep[];
  autoHoldEnabled?: boolean;
  autoHoldSeverities?: SeverityTrigger[];
  autoHoldDealStages?: string[];
  defaultDeadlineDays?: number;
  escalationRules?: EscalationRule[];
}

interface TriggerContext {
  complianceCheck: ComplianceCheck;
  issue: ComplianceIssueRecord;
  property: Property;
  dealPipeline?: DealPipeline;
  userId?: string;
}

interface WorkflowStats {
  totalWorkflows: number;
  activeWorkflows: number;
  totalExecutions: number;
  pendingExecutions: number;
  activeHolds: number;
  avgResolutionHours: number;
  successRate: number;
}

class ComplianceWorkflowService {
  private initialized = false;
  private escalationCheckInterval: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    // Start escalation checker
    this.startEscalationChecker();
    this.initialized = true;
    console.log('ComplianceWorkflowService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // WORKFLOW CRUD
  // ============================================================================

  /**
   * Create a new compliance workflow
   */
  async createWorkflow(data: CreateWorkflowData): Promise<ComplianceWorkflow> {
    // Validate steps have unique IDs
    const stepIds = data.steps.map(s => s.id);
    if (new Set(stepIds).size !== stepIds.length) {
      throw new Error('Workflow steps must have unique IDs');
    }

    // Ensure steps have proper ordering
    const sortedSteps = [...data.steps].sort((a, b) => a.order - b.order);

    const workflow = await ComplianceWorkflow.create({
      name: data.name,
      description: data.description,
      userId: data.userId,
      organizationId: data.organizationId,
      triggerConditions: data.triggerConditions,
      steps: sortedSteps,
      autoHoldEnabled: data.autoHoldEnabled ?? false,
      autoHoldSeverities: data.autoHoldSeverities ?? ['critical'],
      autoHoldDealStages: data.autoHoldDealStages,
      defaultDeadlineDays: data.defaultDeadlineDays ?? 7,
      escalationRules: data.escalationRules ?? [],
    });

    return workflow;
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(id: number, data: UpdateWorkflowData): Promise<ComplianceWorkflow | null> {
    const workflow = await ComplianceWorkflow.findByPk(id);
    if (!workflow) return null;

    // If updating steps, validate unique IDs
    if (data.steps) {
      const stepIds = data.steps.map(s => s.id);
      if (new Set(stepIds).size !== stepIds.length) {
        throw new Error('Workflow steps must have unique IDs');
      }
      data.steps = [...data.steps].sort((a, b) => a.order - b.order);
    }

    await workflow.update(data);
    return workflow;
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(id: number): Promise<ComplianceWorkflow | null> {
    return await ComplianceWorkflow.findByPk(id);
  }

  /**
   * Get workflows for a user or organization
   */
  async getWorkflows(userId: string, organizationId?: string): Promise<ComplianceWorkflow[]> {
    const where: Record<string, unknown> = organizationId
      ? { [Op.or]: [{ organizationId }, { userId }] }
      : { userId };

    return await ComplianceWorkflow.findAll({
      where,
      order: [['updatedAt', 'DESC']],
    });
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(id: number): Promise<boolean> {
    const workflow = await ComplianceWorkflow.findByPk(id);
    if (!workflow) return false;

    // Archive instead of hard delete if there are executions
    const executionCount = await ComplianceWorkflowExecution.count({
      where: { workflowId: id },
    });

    if (executionCount > 0) {
      await workflow.update({ status: 'archived' });
    } else {
      await workflow.destroy();
    }

    return true;
  }

  // ============================================================================
  // WORKFLOW EXECUTION
  // ============================================================================

  /**
   * Trigger workflows for a compliance check
   */
  async triggerWorkflows(context: TriggerContext): Promise<ComplianceWorkflowExecution[]> {
    const { complianceCheck, issue, property, dealPipeline } = context;

    // Find matching workflows
    const matchingWorkflows = await ComplianceWorkflow.getMatchingWorkflows({
      severity: issue.severity,
      category: issue.category,
      ruleId: issue.ruleId,
      state: complianceCheck.state,
      dealStage: dealPipeline?.stage,
    });

    if (matchingWorkflows.length === 0) {
      return [];
    }

    const executions: ComplianceWorkflowExecution[] = [];

    for (const workflow of matchingWorkflows) {
      // Check if there's already an active execution for this issue
      const existingExecution = await ComplianceWorkflowExecution.findOne({
        where: {
          workflowId: workflow.id,
          complianceCheckId: complianceCheck.id,
          issueId: issue.issueId || `${issue.ruleId}`,
          status: { [Op.in]: ['pending', 'in_progress'] },
        },
      });

      if (existingExecution) {
        continue; // Skip if already being processed
      }

      // Create execution
      const execution = await this.createExecution(workflow, context);
      executions.push(execution);

      // Start executing the workflow
      await this.executeWorkflow(execution, workflow);
    }

    return executions;
  }

  /**
   * Create a workflow execution
   */
  private async createExecution(
    workflow: ComplianceWorkflow,
    context: TriggerContext
  ): Promise<ComplianceWorkflowExecution> {
    const { complianceCheck, issue, property, dealPipeline } = context;

    // Initialize step executions
    const stepExecutions: StepExecution[] = workflow.getSortedSteps().map(step => ({
      stepId: step.id,
      stepName: step.name,
      status: 'pending' as ExecutionStatus,
    }));

    return await ComplianceWorkflowExecution.create({
      workflowId: workflow.id,
      complianceCheckId: complianceCheck.id!,
      propertyId: property.id!,
      dealPipelineId: dealPipeline?.id,
      issueId: issue.issueId || `${issue.ruleId}`,
      issueSeverity: issue.severity,
      issueCategory: issue.category,
      issueRuleId: issue.ruleId,
      status: 'pending',
      stepExecutions,
      triggeredAt: new Date(),
    });
  }

  /**
   * Execute a workflow
   */
  private async executeWorkflow(
    execution: ComplianceWorkflowExecution,
    workflow: ComplianceWorkflow
  ): Promise<void> {
    await execution.update({ status: 'in_progress' });

    const steps = workflow.getSortedSteps();
    let success = true;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Check if step has a condition
      if (step.condition && !this.evaluateCondition(step.condition, execution)) {
        // Skip step if condition not met
        await execution.updateStepStatus(step.id, 'completed', {
          result: { skipped: true, reason: 'Condition not met' },
        });
        continue;
      }

      // Handle delay if specified
      if (step.delayMinutes && step.delayMinutes > 0) {
        // Schedule for later (in a real implementation, use a job queue)
        // For now, we'll skip the delay in the immediate execution
      }

      try {
        await this.executeStep(step, execution, workflow);
        await execution.updateStepStatus(step.id, 'completed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await execution.updateStepStatus(step.id, 'failed', { error: errorMessage });
        success = false;

        // Continue to next step unless it's a critical failure
        if (step.actionType === 'hold_deal') {
          // Critical step failed, stop execution
          break;
        }
      }

      await execution.update({ currentStepIndex: i + 1 });
    }

    // Update execution status
    await execution.update({
      status: success ? 'completed' : 'failed',
      completedAt: new Date(),
    });

    // Record execution on workflow
    await workflow.recordExecution(success);
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    execution: ComplianceWorkflowExecution,
    workflow: ComplianceWorkflow
  ): Promise<void> {
    // Update step status to in_progress
    const stepExecutions = [...execution.stepExecutions];
    const stepIndex = stepExecutions.findIndex(s => s.stepId === step.id);
    if (stepIndex >= 0) {
      stepExecutions[stepIndex] = {
        ...stepExecutions[stepIndex],
        status: 'in_progress',
        startedAt: new Date(),
      };
      await execution.update({ stepExecutions });
    }

    switch (step.actionType) {
      case 'create_task':
        await this.executeCreateTask(step, execution, workflow);
        break;

      case 'assign_task':
        await this.executeAssignTask(step, execution);
        break;

      case 'send_notification':
        await this.executeSendNotification(step, execution);
        break;

      case 'hold_deal':
        await this.executeHoldDeal(step, execution, workflow);
        break;

      case 'escalate':
        await this.executeEscalate(step, execution);
        break;

      case 'custom':
        // Custom actions can be handled by metadata
        break;

      default:
        throw new Error(`Unknown action type: ${step.actionType}`);
    }
  }

  /**
   * Execute create_task action
   */
  private async executeCreateTask(
    step: WorkflowStep,
    execution: ComplianceWorkflowExecution,
    workflow: ComplianceWorkflow
  ): Promise<void> {
    if (!step.taskTemplate) {
      throw new Error('Task template is required for create_task action');
    }

    const template = step.taskTemplate;

    // Resolve template variables
    const title = this.resolveTemplate(template.titleTemplate, execution);
    const description = template.descriptionTemplate
      ? this.resolveTemplate(template.descriptionTemplate, execution)
      : undefined;

    // Determine assignee based on strategy
    const assignedTo = await this.resolveAssignment(
      template.assignmentStrategy,
      execution,
      template.assignToUserId,
      template.assignToRoleId
    );

    // Calculate due date
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (template.dueDays || workflow.defaultDeadlineDays));

    // Create task
    const task = await taskService.createTask({
      title,
      description,
      priority: template.priority,
      dueDate,
      assignedTo,
      linkType: 'compliance',
      complianceCheckId: execution.complianceCheckId,
      propertyId: execution.propertyId,
      tags: [...template.tags, 'compliance-workflow', `workflow-${workflow.id}`],
      metadata: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        executionId: execution.id,
        issueId: execution.issueId,
        issueSeverity: execution.issueSeverity,
        stepId: step.id,
      },
    });

    // Track task in execution
    await execution.addTask(task.id);

    // Update step with task ID
    await execution.updateStepStatus(step.id, 'completed', { taskId: task.id });
  }

  /**
   * Execute assign_task action
   */
  private async executeAssignTask(
    step: WorkflowStep,
    execution: ComplianceWorkflowExecution
  ): Promise<void> {
    // This action reassigns existing tasks created by this execution
    if (execution.assignedTasks.length === 0) {
      return;
    }

    const assignedTo = await this.resolveAssignment(
      step.taskTemplate?.assignmentStrategy || 'round_robin',
      execution,
      step.taskTemplate?.assignToUserId,
      step.taskTemplate?.assignToRoleId
    );

    if (assignedTo) {
      for (const taskId of execution.assignedTasks) {
        await taskService.assignTask(taskId, assignedTo, 'workflow');
      }
    }
  }

  /**
   * Execute send_notification action
   */
  private async executeSendNotification(
    step: WorkflowStep,
    execution: ComplianceWorkflowExecution
  ): Promise<void> {
    if (!step.notificationConfig) {
      return;
    }

    const { channels, recipients, messageTemplate, subject } = step.notificationConfig;

    // Resolve message template
    const message = this.resolveTemplate(messageTemplate, execution);
    const resolvedSubject = subject ? this.resolveTemplate(subject, execution) : undefined;

    // Resolve recipients
    const resolvedRecipients = await this.resolveRecipients(recipients, execution);

    // In a real implementation, dispatch to notification service
    // For now, we'll log the notification
    console.log('Sending notification:', {
      channels,
      recipients: resolvedRecipients,
      subject: resolvedSubject,
      message,
    });

    // TODO: Integrate with NotificationService
    // await notificationService.send({ channels, recipients: resolvedRecipients, message, subject: resolvedSubject });
  }

  /**
   * Execute hold_deal action
   */
  private async executeHoldDeal(
    step: WorkflowStep,
    execution: ComplianceWorkflowExecution,
    workflow: ComplianceWorkflow
  ): Promise<void> {
    // Check if workflow should hold deals
    if (!workflow.autoHoldEnabled) {
      return;
    }

    // Check severity
    if (!workflow.shouldHoldDeal(execution.issueSeverity, undefined)) {
      return;
    }

    const config = step.holdDealConfig;

    // Get deal pipeline
    let dealPipeline: DealPipeline | null = null;
    if (execution.dealPipelineId) {
      dealPipeline = await DealPipeline.findByPk(execution.dealPipelineId);
    } else {
      // Find pipeline by property
      dealPipeline = await DealPipeline.findOne({
        where: { propertyId: execution.propertyId },
        order: [['createdAt', 'DESC']],
      });
    }

    if (!dealPipeline) {
      return;
    }

    // Check if deal is in a stage that should be held
    if (config?.holdStages?.length && !config.holdStages.includes(dealPipeline.stage)) {
      return;
    }

    // Hold the deal by updating the pipeline
    const holdReason = `Compliance issue: ${execution.issueSeverity} - ${execution.issueCategory || 'Unknown category'}`;

    // Add hold to stage history
    const stageHistory = [...dealPipeline.stageHistory];
    stageHistory.push({
      stage: dealPipeline.stage,
      enteredAt: new Date().toISOString(),
      notes: `HELD: ${holdReason}`,
      triggeredBy: 'automation',
    });

    await dealPipeline.update({
      stageHistory,
      notes: `${dealPipeline.notes || ''}\n\n[COMPLIANCE HOLD] ${new Date().toISOString()}: ${holdReason}`,
    });

    // Record hold in execution
    await execution.holdDeal(holdReason);

    // Notify deal owner if configured
    if (config?.notifyDealOwner) {
      // TODO: Send notification to deal owner
      console.log('Notifying deal owner of compliance hold:', dealPipeline.userId);
    }
  }

  /**
   * Execute escalate action
   */
  private async executeEscalate(
    step: WorkflowStep,
    execution: ComplianceWorkflowExecution
  ): Promise<void> {
    const config = step.escalationConfig;
    if (!config || !config.enabled) {
      return;
    }

    // Send escalation notifications
    for (const userId of config.escalateTo) {
      // TODO: Integrate with notification service
      console.log(`Escalating to ${userId}:`, {
        executionId: execution.id,
        issueId: execution.issueId,
        severity: execution.issueSeverity,
      });
    }

    // Update escalation count in step execution
    const stepExecutions = [...execution.stepExecutions];
    const stepIndex = stepExecutions.findIndex(s => s.stepId === step.id);
    if (stepIndex >= 0) {
      stepExecutions[stepIndex] = {
        ...stepExecutions[stepIndex],
        escalationCount: (stepExecutions[stepIndex].escalationCount || 0) + 1,
        lastEscalatedAt: new Date(),
      };
      await execution.update({ stepExecutions });
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Resolve template variables
   */
  private resolveTemplate(template: string, execution: ComplianceWorkflowExecution): string {
    return template
      .replace(/\{\{issue\.id\}\}/g, execution.issueId)
      .replace(/\{\{issue\.severity\}\}/g, execution.issueSeverity)
      .replace(/\{\{issue\.category\}\}/g, execution.issueCategory || 'Unknown')
      .replace(/\{\{issue\.ruleId\}\}/g, String(execution.issueRuleId || ''))
      .replace(/\{\{property\.id\}\}/g, String(execution.propertyId))
      .replace(/\{\{execution\.id\}\}/g, String(execution.id))
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString());
  }

  /**
   * Resolve assignment based on strategy
   */
  private async resolveAssignment(
    strategy: TaskTemplate['assignmentStrategy'],
    execution: ComplianceWorkflowExecution,
    specificUserId?: string,
    roleId?: string
  ): Promise<string | undefined> {
    switch (strategy) {
      case 'specific_user':
        return specificUserId;

      case 'property_owner':
        // Get deal pipeline to find owner
        const pipeline = execution.dealPipelineId
          ? await DealPipeline.findByPk(execution.dealPipelineId)
          : await DealPipeline.findOne({ where: { propertyId: execution.propertyId } });
        return pipeline?.userId;

      case 'round_robin':
      case 'workload_based':
        // Get team members and find one with least tasks
        // For simplicity, return undefined (unassigned)
        // In production, implement proper round-robin or workload logic
        return undefined;

      case 'role_based':
        // Find users with the specified role
        // For simplicity, return undefined
        // In production, query UserRole model
        return undefined;

      default:
        return undefined;
    }
  }

  /**
   * Resolve recipients list
   */
  private async resolveRecipients(
    recipients: string[],
    execution: ComplianceWorkflowExecution
  ): Promise<string[]> {
    const resolved: string[] = [];

    for (const recipient of recipients) {
      if (recipient === 'deal_owner') {
        const pipeline = execution.dealPipelineId
          ? await DealPipeline.findByPk(execution.dealPipelineId)
          : await DealPipeline.findOne({ where: { propertyId: execution.propertyId } });
        if (pipeline?.userId) {
          resolved.push(pipeline.userId);
        }
      } else if (recipient === 'assignee') {
        // Get task assignees
        for (const taskId of execution.assignedTasks) {
          const task = await Task.findByPk(taskId);
          if (task?.assignedTo) {
            resolved.push(task.assignedTo);
          }
        }
      } else {
        // Assume it's a user ID
        resolved.push(recipient);
      }
    }

    return [...new Set(resolved)]; // Remove duplicates
  }

  /**
   * Evaluate step condition
   */
  private evaluateCondition(
    condition: WorkflowStep['condition'],
    execution: ComplianceWorkflowExecution
  ): boolean {
    if (!condition) return true;

    const { field, operator, value } = condition;

    // Get field value from execution
    let fieldValue: unknown;
    if (field.startsWith('issue.')) {
      const issueField = field.replace('issue.', '');
      switch (issueField) {
        case 'severity':
          fieldValue = execution.issueSeverity;
          break;
        case 'category':
          fieldValue = execution.issueCategory;
          break;
        case 'ruleId':
          fieldValue = execution.issueRuleId;
          break;
        default:
          fieldValue = undefined;
      }
    }

    // Evaluate condition
    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'not_equals':
        return fieldValue !== value;
      case 'contains':
        return typeof fieldValue === 'string' && fieldValue.includes(String(value));
      case 'gt':
        return typeof fieldValue === 'number' && fieldValue > Number(value);
      case 'lt':
        return typeof fieldValue === 'number' && fieldValue < Number(value);
      case 'in':
        return Array.isArray(value) && value.includes(fieldValue);
      default:
        return true;
    }
  }

  /**
   * Start escalation checker (runs periodically)
   */
  private startEscalationChecker(): void {
    // Check for escalations every 15 minutes
    this.escalationCheckInterval = setInterval(
      () => this.checkEscalations(),
      15 * 60 * 1000
    );
  }

  /**
   * Check for needed escalations
   */
  private async checkEscalations(): Promise<void> {
    try {
      const pendingExecutions = await ComplianceWorkflowExecution.getPending();

      for (const execution of pendingExecutions) {
        const workflow = await ComplianceWorkflow.findByPk(execution.workflowId);
        if (!workflow) continue;

        // Check each escalation rule
        for (const rule of workflow.escalationRules) {
          if (!rule.enabled) continue;

          const hoursElapsed =
            (Date.now() - execution.triggeredAt.getTime()) / (1000 * 60 * 60);

          if (hoursElapsed >= rule.afterHours) {
            // Check if we've hit max escalations
            const stepExecution = execution.stepExecutions.find(
              s => s.stepId === `escalation-${rule.id}`
            );
            const escalationCount = stepExecution?.escalationCount || 0;

            if (rule.maxEscalations && escalationCount >= rule.maxEscalations) {
              continue;
            }

            // Check repeat interval
            if (stepExecution?.lastEscalatedAt && rule.repeatInterval) {
              const hoursSinceLastEscalation =
                (Date.now() - new Date(stepExecution.lastEscalatedAt).getTime()) /
                (1000 * 60 * 60);
              if (hoursSinceLastEscalation < rule.repeatInterval) {
                continue;
              }
            }

            // Trigger escalation
            await this.executeEscalate(
              {
                id: `escalation-${rule.id}`,
                order: 999,
                name: rule.name,
                actionType: 'escalate',
                escalationConfig: rule,
              },
              execution
            );
          }
        }
      }
    } catch (error) {
      console.error('Error checking escalations:', error);
    }
  }

  // ============================================================================
  // EXECUTION MANAGEMENT
  // ============================================================================

  /**
   * Get execution by ID
   */
  async getExecution(id: number): Promise<ComplianceWorkflowExecution | null> {
    return await ComplianceWorkflowExecution.findByPk(id, {
      include: [{ model: ComplianceWorkflow, as: 'workflow' }],
    });
  }

  /**
   * Get executions for a property
   */
  async getExecutionsByProperty(propertyId: number): Promise<ComplianceWorkflowExecution[]> {
    return await ComplianceWorkflowExecution.getByProperty(propertyId);
  }

  /**
   * Get active holds
   */
  async getActiveHolds(): Promise<ComplianceWorkflowExecution[]> {
    return await ComplianceWorkflowExecution.getActiveHolds();
  }

  /**
   * Resolve an execution
   */
  async resolveExecution(
    id: number,
    userId: string,
    notes?: string
  ): Promise<ComplianceWorkflowExecution | null> {
    const execution = await ComplianceWorkflowExecution.findByPk(id);
    if (!execution) return null;

    await execution.resolve(userId, notes);

    // Complete any pending tasks
    for (const taskId of execution.assignedTasks) {
      try {
        await taskService.completeTask(taskId, userId);
      } catch (error) {
        // Task may already be completed
        console.log(`Could not complete task ${taskId}:`, error);
      }
    }

    return execution;
  }

  /**
   * Release a deal hold
   */
  async releaseDealHold(
    executionId: number,
    userId: string
  ): Promise<ComplianceWorkflowExecution | null> {
    const execution = await ComplianceWorkflowExecution.findByPk(executionId);
    if (!execution || !execution.dealHeld) return null;

    await execution.releaseDeal();

    // Update deal pipeline notes
    if (execution.dealPipelineId) {
      const pipeline = await DealPipeline.findByPk(execution.dealPipelineId);
      if (pipeline) {
        await pipeline.update({
          notes: `${pipeline.notes || ''}\n\n[COMPLIANCE HOLD RELEASED] ${new Date().toISOString()} by ${userId}`,
        });
      }
    }

    return execution;
  }

  /**
   * Cancel an execution
   */
  async cancelExecution(id: number): Promise<ComplianceWorkflowExecution | null> {
    const execution = await ComplianceWorkflowExecution.findByPk(id);
    if (!execution) return null;

    await execution.update({
      status: 'cancelled',
      completedAt: new Date(),
    });

    // Release deal if held
    if (execution.dealHeld && !execution.dealReleasedAt) {
      await execution.releaseDeal();
    }

    return execution;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get workflow statistics
   */
  async getStats(userId?: string, organizationId?: string): Promise<WorkflowStats> {
    const workflowWhere: Record<string, unknown> = {};
    if (userId) workflowWhere.userId = userId;
    if (organizationId) workflowWhere.organizationId = organizationId;

    const [totalWorkflows, activeWorkflows] = await Promise.all([
      ComplianceWorkflow.count({ where: workflowWhere }),
      ComplianceWorkflow.count({ where: { ...workflowWhere, status: 'active' } }),
    ]);

    // Get workflow IDs for execution stats
    const workflows = await ComplianceWorkflow.findAll({
      where: workflowWhere,
      attributes: ['id'],
    });
    const workflowIds = workflows.map(w => w.id);

    if (workflowIds.length === 0) {
      return {
        totalWorkflows,
        activeWorkflows,
        totalExecutions: 0,
        pendingExecutions: 0,
        activeHolds: 0,
        avgResolutionHours: 0,
        successRate: 0,
      };
    }

    const executionWhere = { workflowId: { [Op.in]: workflowIds } };

    const [totalExecutions, pendingExecutions, activeHolds, completedExecutions] =
      await Promise.all([
        ComplianceWorkflowExecution.count({ where: executionWhere }),
        ComplianceWorkflowExecution.count({
          where: { ...executionWhere, status: { [Op.in]: ['pending', 'in_progress'] } },
        }),
        ComplianceWorkflowExecution.count({
          where: { ...executionWhere, dealHeld: true, dealReleasedAt: null },
        }),
        ComplianceWorkflowExecution.findAll({
          where: { ...executionWhere, status: 'completed' },
          attributes: ['triggeredAt', 'completedAt'],
        }),
      ]);

    // Calculate average resolution time
    let totalHours = 0;
    for (const execution of completedExecutions) {
      if (execution.completedAt && execution.triggeredAt) {
        const hours =
          (execution.completedAt.getTime() - execution.triggeredAt.getTime()) /
          (1000 * 60 * 60);
        totalHours += hours;
      }
    }
    const avgResolutionHours =
      completedExecutions.length > 0
        ? Math.round((totalHours / completedExecutions.length) * 10) / 10
        : 0;

    // Calculate success rate
    const successfulExecutions = await ComplianceWorkflowExecution.count({
      where: { ...executionWhere, status: 'completed' },
    });
    const successRate =
      totalExecutions > 0 ? Math.round((successfulExecutions / totalExecutions) * 100) : 0;

    return {
      totalWorkflows,
      activeWorkflows,
      totalExecutions,
      pendingExecutions,
      activeHolds,
      avgResolutionHours,
      successRate,
    };
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.escalationCheckInterval) {
      clearInterval(this.escalationCheckInterval);
      this.escalationCheckInterval = null;
    }
  }
}

export const complianceWorkflowService = new ComplianceWorkflowService();
export default complianceWorkflowService;
