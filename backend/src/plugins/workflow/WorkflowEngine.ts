/**
 * Workflow Orchestration Engine
 *
 * Manages multi-step deal processing workflows:
 * - Visual workflow builder support
 * - Conditional branching
 * - Parallel execution
 * - Human-in-the-loop steps
 * - Workflow templates
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Workflow,
  WorkflowStep,
  WorkflowStepType,
  WorkflowTransition,
  WorkflowExecution,
  WorkflowStepExecution,
  NormalizedDeal,
  AutomationCondition,
  CriterionOperator,
  SystemEvent,
} from '../types';
import WorkflowExecutionModel from '../../models/WorkflowExecution';

export interface WorkflowContext {
  workflowId: string;
  executionId: string;
  deal: NormalizedDeal;
  variables: Record<string, any>;
  stepResults: Map<string, any>;
}

export interface IWorkflowStepHandler {
  type: WorkflowStepType;
  execute(step: WorkflowStep, context: WorkflowContext): Promise<StepExecutionResult>;
}

export interface StepExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  nextStepId?: string;
  shouldPause?: boolean;
  pauseReason?: string;
}

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private stepHandlers: Map<WorkflowStepType, IWorkflowStepHandler> = new Map();
  private pendingHumanReviews: Map<string, { executionId: string; stepId: string; data: any }> = new Map();

  constructor() {
    this.registerDefaultStepHandlers();
  }

  // ============================================================================
  // WORKFLOW MANAGEMENT
  // ============================================================================

  /**
   * Register a workflow
   */
  public registerWorkflow(workflow: Workflow): void {
    this.validateWorkflow(workflow);
    this.workflows.set(workflow.id, workflow);
    console.log(`✅ Registered workflow: ${workflow.name} (${workflow.id})`);
  }

  /**
   * Update a workflow
   */
  public updateWorkflow(workflow: Workflow): void {
    this.validateWorkflow(workflow);
    this.workflows.set(workflow.id, { ...workflow, updatedAt: new Date() });
  }

  /**
   * Remove a workflow
   */
  public removeWorkflow(workflowId: string): void {
    this.workflows.delete(workflowId);
  }

  /**
   * Get all workflows
   */
  public getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get workflow by ID
   */
  public getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  // ============================================================================
  // WORKFLOW TEMPLATES
  // ============================================================================

  /**
   * Get built-in workflow templates
   */
  public getWorkflowTemplates(): Workflow[] {
    return [
      this.createStandardDealWorkflow(),
      this.createFastTrackWorkflow(),
      this.createHighValueWorkflow(),
      this.createMarketplaceDistributionWorkflow(),
    ];
  }

  // ============================================================================
  // DATABASE PERSISTENCE
  // ============================================================================

  /**
   * Load paused and running executions from database
   */
  public async loadExecutionsFromDatabase(): Promise<void> {
    try {
      const dbExecutions = await WorkflowExecutionModel.findAll({
        where: {
          status: ['running', 'paused'],
        },
      });

      for (const dbExecution of dbExecutions) {
        const execution = dbExecution.toWorkflowExecution();
        this.executions.set(execution.id, execution);
      }

      console.log(`✅ Loaded ${dbExecutions.length} active workflow executions from database`);
    } catch (error: any) {
      if (error?.original?.code === '42P01') {
        console.log('⚠️ Workflow executions table does not exist yet, will be created on first use');
      } else {
        console.error('❌ Failed to load workflow executions from database:', error?.message || error);
      }
    }
  }

  /**
   * Save execution to database
   */
  private async saveExecution(execution: WorkflowExecution): Promise<void> {
    try {
      await WorkflowExecutionModel.upsert({
        id: execution.id,
        workflowId: execution.workflowId,
        dealId: execution.dealId,
        status: execution.status,
        currentStepId: execution.currentStepId,
        stepHistory: execution.stepHistory,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        error: execution.error,
      });
    } catch (error: any) {
      console.error('❌ Failed to save workflow execution:', error?.message || error);
    }
  }

  /**
   * Delete completed executions older than specified days (cleanup)
   */
  public async cleanupOldExecutions(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const { Op } = await import('sequelize');
      const deleted = await WorkflowExecutionModel.destroy({
        where: {
          status: ['completed', 'failed'],
          completedAt: { [Op.lt]: cutoffDate },
        },
      });

      console.log(`🧹 Cleaned up ${deleted} old workflow executions`);
      return deleted;
    } catch (error: any) {
      console.error('❌ Failed to cleanup workflow executions:', error?.message || error);
      return 0;
    }
  }

  private createStandardDealWorkflow(): Workflow {
    return {
      id: 'template-standard',
      name: 'Standard Deal Processing',
      description: 'Standard workflow for processing incoming deals with full review',
      enabled: true,
      steps: [
        {
          id: 'start',
          name: 'Start',
          type: 'start',
          config: {},
          nextSteps: [{ targetStepId: 'enrich' }],
        },
        {
          id: 'enrich',
          name: 'Enrich Deal Data',
          type: 'action',
          config: { action: 'enrich_deal', providers: ['all'] },
          nextSteps: [{ targetStepId: 'score' }],
        },
        {
          id: 'score',
          name: 'Score Against Buy Boxes',
          type: 'action',
          config: { action: 'score_deal' },
          nextSteps: [{ targetStepId: 'check_score' }],
        },
        {
          id: 'check_score',
          name: 'Check Score',
          type: 'condition',
          config: {
            conditions: [
              { field: 'scoringResult.percentage', operator: 'greater_or_equal', value: 80 },
            ],
          },
          nextSteps: [
            { targetStepId: 'auto_submit', condition: { id: 'high_score', field: 'scoringResult.percentage', operator: 'greater_or_equal', value: 80 } },
            { targetStepId: 'human_review', condition: { id: 'low_score', field: 'scoringResult.percentage', operator: 'less_than', value: 80 } },
          ],
        },
        {
          id: 'auto_submit',
          name: 'Auto Submit to Marketplace',
          type: 'action',
          config: { action: 'submit_to_marketplace', marketplace: 'auto' },
          nextSteps: [{ targetStepId: 'notify_success' }],
        },
        {
          id: 'human_review',
          name: 'Human Review Required',
          type: 'human_review',
          config: { reviewType: 'deal_approval', timeout: 24 * 60 * 60 * 1000 },
          nextSteps: [
            { targetStepId: 'submit_after_review', condition: { id: 'approved', field: 'reviewResult.approved', operator: 'equals', value: true } },
            { targetStepId: 'archive', condition: { id: 'rejected', field: 'reviewResult.approved', operator: 'equals', value: false } },
          ],
        },
        {
          id: 'submit_after_review',
          name: 'Submit After Review',
          type: 'action',
          config: { action: 'submit_to_marketplace', marketplace: 'selected' },
          nextSteps: [{ targetStepId: 'notify_success' }],
        },
        {
          id: 'notify_success',
          name: 'Notify Success',
          type: 'action',
          config: { action: 'send_notification', channel: 'deals', message: 'Deal submitted successfully' },
          nextSteps: [{ targetStepId: 'end' }],
        },
        {
          id: 'archive',
          name: 'Archive Deal',
          type: 'action',
          config: { action: 'update_deal', updates: { status: 'archived' } },
          nextSteps: [{ targetStepId: 'end' }],
        },
        {
          id: 'end',
          name: 'End',
          type: 'end',
          config: {},
          nextSteps: [],
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private createFastTrackWorkflow(): Workflow {
    return {
      id: 'template-fasttrack',
      name: 'Fast Track Deal Processing',
      description: 'Streamlined workflow for pre-approved wholesalers',
      enabled: true,
      steps: [
        {
          id: 'start',
          name: 'Start',
          type: 'start',
          config: {},
          nextSteps: [{ targetStepId: 'validate' }],
        },
        {
          id: 'validate',
          name: 'Quick Validation',
          type: 'action',
          config: { action: 'validate_deal', quick: true },
          nextSteps: [{ targetStepId: 'score' }],
        },
        {
          id: 'score',
          name: 'Quick Score',
          type: 'action',
          config: { action: 'score_deal', buyBoxId: 'default' },
          nextSteps: [{ targetStepId: 'submit' }],
        },
        {
          id: 'submit',
          name: 'Auto Submit',
          type: 'action',
          config: { action: 'submit_to_marketplace', marketplace: 'best_match' },
          nextSteps: [{ targetStepId: 'end' }],
        },
        {
          id: 'end',
          name: 'End',
          type: 'end',
          config: {},
          nextSteps: [],
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private createHighValueWorkflow(): Workflow {
    return {
      id: 'template-highvalue',
      name: 'High Value Deal Processing',
      description: 'Comprehensive workflow for deals over $500k with multiple reviews',
      enabled: true,
      steps: [
        {
          id: 'start',
          name: 'Start',
          type: 'start',
          config: {},
          nextSteps: [{ targetStepId: 'full_enrich' }],
        },
        {
          id: 'full_enrich',
          name: 'Full Data Enrichment',
          type: 'action',
          config: { action: 'enrich_deal', providers: ['all'], deep: true },
          nextSteps: [{ targetStepId: 'parallel_analysis' }],
        },
        {
          id: 'parallel_analysis',
          name: 'Parallel Analysis',
          type: 'parallel',
          config: {
            steps: ['compliance_check', 'market_analysis', 'risk_analysis'],
          },
          nextSteps: [{ targetStepId: 'senior_review' }],
        },
        {
          id: 'compliance_check',
          name: 'Compliance Check',
          type: 'action',
          config: { action: 'run_compliance_check' },
          nextSteps: [],
        },
        {
          id: 'market_analysis',
          name: 'Market Analysis',
          type: 'action',
          config: { action: 'analyze_market' },
          nextSteps: [],
        },
        {
          id: 'risk_analysis',
          name: 'Risk Analysis',
          type: 'action',
          config: { action: 'analyze_risk' },
          nextSteps: [],
        },
        {
          id: 'senior_review',
          name: 'Senior Review',
          type: 'human_review',
          config: { reviewType: 'senior_approval', timeout: 48 * 60 * 60 * 1000 },
          nextSteps: [
            { targetStepId: 'premium_submit', condition: { id: 'approved', field: 'reviewResult.approved', operator: 'equals', value: true } },
            { targetStepId: 'archive', condition: { id: 'rejected', field: 'reviewResult.approved', operator: 'equals', value: false } },
          ],
        },
        {
          id: 'premium_submit',
          name: 'Premium Marketplace Submit',
          type: 'action',
          config: { action: 'submit_to_marketplace', marketplace: 'premium', priority: 'high' },
          nextSteps: [{ targetStepId: 'end' }],
        },
        {
          id: 'archive',
          name: 'Archive',
          type: 'action',
          config: { action: 'update_deal', updates: { status: 'archived' } },
          nextSteps: [{ targetStepId: 'end' }],
        },
        {
          id: 'end',
          name: 'End',
          type: 'end',
          config: {},
          nextSteps: [],
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private createMarketplaceDistributionWorkflow(): Workflow {
    return {
      id: 'template-marketplace',
      name: 'Marketplace Distribution',
      description: 'Distribute deals to the user marketplace with buyer matching and engagement tracking',
      enabled: true,
      steps: [
        {
          id: 'start',
          name: 'Start',
          type: 'start',
          config: {},
          nextSteps: [{ targetStepId: 'enrich' }],
        },
        {
          id: 'enrich',
          name: 'Enrich Deal Data',
          type: 'action',
          config: { action: 'enrich_deal', providers: ['zillow', 'google_maps'] },
          nextSteps: [{ targetStepId: 'compliance_check' }],
        },
        {
          id: 'compliance_check',
          name: 'Compliance Check',
          type: 'action',
          config: { action: 'run_compliance_check' },
          nextSteps: [{ targetStepId: 'check_compliance_status' }],
        },
        {
          id: 'check_compliance_status',
          name: 'Check Compliance Status',
          type: 'condition',
          config: {
            conditions: [
              { field: 'complianceResult.status', operator: 'equals', value: 'green' },
            ],
          },
          nextSteps: [
            { targetStepId: 'match_buyers', condition: { id: 'compliant', field: 'complianceResult.status', operator: 'not_equals', value: 'red' } },
            { targetStepId: 'compliance_review', condition: { id: 'non_compliant', field: 'complianceResult.status', operator: 'equals', value: 'red' } },
          ],
        },
        {
          id: 'compliance_review',
          name: 'Compliance Review Required',
          type: 'human_review',
          config: { reviewType: 'compliance_approval', timeout: 24 * 60 * 60 * 1000 },
          nextSteps: [
            { targetStepId: 'match_buyers', condition: { id: 'approved', field: 'reviewResult.approved', operator: 'equals', value: true } },
            { targetStepId: 'archive', condition: { id: 'rejected', field: 'reviewResult.approved', operator: 'equals', value: false } },
          ],
        },
        {
          id: 'match_buyers',
          name: 'Match to Buyer Buy Boxes',
          type: 'action',
          config: { action: 'marketplace_match_buyers', minScore: 50 },
          nextSteps: [{ targetStepId: 'calculate_priority' }],
        },
        {
          id: 'calculate_priority',
          name: 'Calculate Deal Priority',
          type: 'action',
          config: { action: 'marketplace_calculate_priority' },
          nextSteps: [{ targetStepId: 'publish_to_marketplace' }],
        },
        {
          id: 'publish_to_marketplace',
          name: 'Publish to Marketplace',
          type: 'action',
          config: {
            action: 'marketplace_publish',
            visibility: 'matched_buyers_first',
            delayPublicHours: 24,
          },
          nextSteps: [{ targetStepId: 'notify_matched_buyers' }],
        },
        {
          id: 'notify_matched_buyers',
          name: 'Notify Matched Buyers',
          type: 'action',
          config: {
            action: 'marketplace_notify_buyers',
            channels: ['email', 'push', 'in_app'],
            includeMatchScore: true,
          },
          nextSteps: [{ targetStepId: 'monitor_engagement' }],
        },
        {
          id: 'monitor_engagement',
          name: 'Monitor Deal Engagement',
          type: 'action',
          config: {
            action: 'marketplace_monitor',
            trackMetrics: ['views', 'likes', 'passes', 'offers', 'pass_reasons'],
            duration: 72 * 60 * 60 * 1000, // 72 hours
          },
          nextSteps: [{ targetStepId: 'check_engagement' }],
        },
        {
          id: 'check_engagement',
          name: 'Check Engagement Level',
          type: 'condition',
          config: {
            conditions: [
              { field: 'engagement.offerCount', operator: 'greater_or_equal', value: 1 },
            ],
          },
          nextSteps: [
            { targetStepId: 'process_offers', condition: { id: 'has_offers', field: 'engagement.offerCount', operator: 'greater_or_equal', value: 1 } },
            { targetStepId: 'boost_deal', condition: { id: 'no_offers', field: 'engagement.offerCount', operator: 'equals', value: 0 } },
          ],
        },
        {
          id: 'process_offers',
          name: 'Process Incoming Offers',
          type: 'action',
          config: { action: 'marketplace_process_offers', rankBy: 'best_terms' },
          nextSteps: [{ targetStepId: 'end' }],
        },
        {
          id: 'boost_deal',
          name: 'Boost Deal Visibility',
          type: 'action',
          config: {
            action: 'marketplace_boost',
            boostType: 'featured',
            expandAudience: true,
          },
          nextSteps: [{ targetStepId: 'end' }],
        },
        {
          id: 'archive',
          name: 'Archive Deal',
          type: 'action',
          config: { action: 'update_deal', updates: { status: 'archived', reason: 'compliance_rejected' } },
          nextSteps: [{ targetStepId: 'end' }],
        },
        {
          id: 'end',
          name: 'End',
          type: 'end',
          config: {},
          nextSteps: [],
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ============================================================================
  // STEP HANDLERS
  // ============================================================================

  /**
   * Register a step handler
   */
  public registerStepHandler(handler: IWorkflowStepHandler): void {
    this.stepHandlers.set(handler.type, handler);
  }

  private registerDefaultStepHandlers(): void {
    // Start handler
    this.registerStepHandler({
      type: 'start',
      execute: async (step, context) => {
        console.log(`🚀 Workflow ${context.workflowId} started`);
        return { success: true, nextStepId: step.nextSteps[0]?.targetStepId };
      },
    });

    // End handler
    this.registerStepHandler({
      type: 'end',
      execute: async (step, context) => {
        console.log(`✅ Workflow ${context.workflowId} completed`);
        return { success: true };
      },
    });

    // Action handler
    this.registerStepHandler({
      type: 'action',
      execute: async (step, context) => {
        const action = step.config.action;
        console.log(`⚡ Executing action: ${action}`);

        // In production, dispatch to actual action handlers
        const result = { success: true, actionExecuted: action };
        context.stepResults.set(step.id, result);

        return {
          success: true,
          output: result,
          nextStepId: step.nextSteps[0]?.targetStepId,
        };
      },
    });

    // Condition handler
    this.registerStepHandler({
      type: 'condition',
      execute: async (step, context) => {
        console.log(`🔀 Evaluating condition: ${step.name}`);

        for (const transition of step.nextSteps) {
          if (transition.condition) {
            const conditionMet = this.evaluateCondition(transition.condition, context);
            if (conditionMet) {
              console.log(`  ✓ Condition met, going to ${transition.targetStepId}`);
              return { success: true, nextStepId: transition.targetStepId };
            }
          }
        }

        // Default path if no conditions match
        const defaultTransition = step.nextSteps.find((t) => !t.condition);
        return {
          success: true,
          nextStepId: defaultTransition?.targetStepId,
        };
      },
    });

    // Parallel handler
    this.registerStepHandler({
      type: 'parallel',
      execute: async (step, context) => {
        console.log(`⏳ Executing parallel steps: ${step.config.steps?.join(', ')}`);

        // In production, execute steps in parallel
        const parallelSteps = step.config.steps || [];
        const results = await Promise.all(
          parallelSteps.map(async (stepId: string) => {
            console.log(`  Running parallel step: ${stepId}`);
            return { stepId, success: true };
          })
        );

        context.stepResults.set(step.id, { parallelResults: results });

        return {
          success: true,
          output: results,
          nextStepId: step.nextSteps[0]?.targetStepId,
        };
      },
    });

    // Wait handler
    this.registerStepHandler({
      type: 'wait',
      execute: async (step, context) => {
        const duration = step.config.duration || 0;
        console.log(`⏱️ Waiting for ${duration}ms`);

        // In production, implement proper async waiting
        await new Promise((resolve) => setTimeout(resolve, Math.min(duration, 5000)));

        return {
          success: true,
          nextStepId: step.nextSteps[0]?.targetStepId,
        };
      },
    });

    // Human review handler
    this.registerStepHandler({
      type: 'human_review',
      execute: async (step, context) => {
        console.log(`👤 Human review required: ${step.config.reviewType}`);

        // Store pending review
        const reviewId = `review-${uuidv4()}`;
        this.pendingHumanReviews.set(reviewId, {
          executionId: context.executionId,
          stepId: step.id,
          data: {
            deal: context.deal,
            reviewType: step.config.reviewType,
            timeout: step.config.timeout,
          },
        });

        return {
          success: true,
          shouldPause: true,
          pauseReason: `Awaiting human review: ${step.config.reviewType}`,
        };
      },
    });
  }

  // ============================================================================
  // WORKFLOW EXECUTION
  // ============================================================================

  /**
   * Start a workflow for a deal
   */
  public async startWorkflow(workflowId: string, deal: NormalizedDeal): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (!workflow.enabled) {
      throw new Error(`Workflow is disabled: ${workflowId}`);
    }

    // Find start step
    const startStep = workflow.steps.find((s) => s.type === 'start');
    if (!startStep) {
      throw new Error(`Workflow has no start step: ${workflowId}`);
    }

    // Create execution
    const execution: WorkflowExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workflowId,
      dealId: deal.externalId || `deal-${Date.now()}`,
      status: 'running',
      currentStepId: startStep.id,
      stepHistory: [],
      startedAt: new Date(),
    };

    this.executions.set(execution.id, execution);

    // Persist to database (fire and forget, but log errors)
    this.saveExecution(execution).catch(err => {
      console.error(`[WorkflowEngine] Failed to persist execution ${execution.id}:`, err);
    });

    // Start execution
    await this.executeWorkflow(execution, workflow, deal);

    return execution;
  }

  /**
   * Resume a paused workflow
   */
  public async resumeWorkflow(executionId: string, input?: Record<string, any>): Promise<WorkflowExecution> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== 'paused') {
      throw new Error(`Execution is not paused: ${executionId}`);
    }

    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${execution.workflowId}`);
    }

    // Update status
    execution.status = 'running';

    // Get deal (in production, fetch from database)
    const deal = { externalId: execution.dealId } as NormalizedDeal;

    // Add input to context
    const context: WorkflowContext = {
      workflowId: workflow.id,
      executionId: execution.id,
      deal,
      variables: { ...input, reviewResult: input },
      stepResults: new Map(),
    };

    // Find current step and determine next
    const currentStep = workflow.steps.find((s) => s.id === execution.currentStepId);
    if (currentStep) {
      // Re-evaluate transitions with new input
      for (const transition of currentStep.nextSteps) {
        if (transition.condition) {
          const conditionMet = this.evaluateCondition(transition.condition, context);
          if (conditionMet) {
            execution.currentStepId = transition.targetStepId;
            break;
          }
        } else {
          execution.currentStepId = transition.targetStepId;
          break;
        }
      }
    }

    // Continue execution
    await this.executeWorkflow(execution, workflow, deal, context.variables);

    return execution;
  }

  /**
   * Submit human review result
   */
  public async submitReview(reviewId: string, approved: boolean, notes?: string): Promise<void> {
    const review = this.pendingHumanReviews.get(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }

    this.pendingHumanReviews.delete(reviewId);

    await this.resumeWorkflow(review.executionId, {
      approved,
      notes,
      reviewedAt: new Date(),
    });
  }

  /**
   * Get pending reviews
   */
  public getPendingReviews(): Array<{ id: string; executionId: string; stepId: string; data: any }> {
    return Array.from(this.pendingHumanReviews.entries()).map(([id, review]) => ({
      id,
      ...review,
    }));
  }

  private async executeWorkflow(
    execution: WorkflowExecution,
    workflow: Workflow,
    deal: NormalizedDeal,
    additionalVariables: Record<string, any> = {}
  ): Promise<void> {
    const context: WorkflowContext = {
      workflowId: workflow.id,
      executionId: execution.id,
      deal,
      variables: { deal, ...additionalVariables },
      stepResults: new Map(),
    };

    try {
      while (execution.status === 'running' && execution.currentStepId) {
        const step = workflow.steps.find((s) => s.id === execution.currentStepId);
        if (!step) {
          throw new Error(`Step not found: ${execution.currentStepId}`);
        }

        // Record step start
        const stepExecution: WorkflowStepExecution = {
          stepId: step.id,
          status: 'running',
          startedAt: new Date(),
        };
        execution.stepHistory.push(stepExecution);

        // Execute step
        const handler = this.stepHandlers.get(step.type);
        if (!handler) {
          throw new Error(`No handler for step type: ${step.type}`);
        }

        const result = await handler.execute(step, context);

        // Update step execution
        stepExecution.status = result.success ? 'completed' : 'failed';
        stepExecution.completedAt = new Date();
        stepExecution.result = result.output;
        stepExecution.error = result.error;

        if (!result.success) {
          execution.status = 'failed';
          execution.error = result.error;
          break;
        }

        if (result.shouldPause) {
          execution.status = 'paused';
          break;
        }

        // Move to next step
        if (result.nextStepId) {
          execution.currentStepId = result.nextStepId;
        } else {
          // No next step = workflow complete
          execution.status = 'completed';
          execution.completedAt = new Date();
          break;
        }
      }
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      console.error(`Workflow execution failed:`, error);
    }

    // Update execution in store
    this.executions.set(execution.id, execution);

    // Persist to database (fire and forget, but log errors)
    this.saveExecution(execution).catch(err => {
      console.error(`[WorkflowEngine] Failed to persist execution ${execution.id}:`, err);
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private validateWorkflow(workflow: Workflow): void {
    if (!workflow.id) {
      throw new Error('Workflow must have an ID');
    }
    if (!workflow.steps || workflow.steps.length === 0) {
      throw new Error('Workflow must have at least one step');
    }
    if (!workflow.steps.some((s) => s.type === 'start')) {
      throw new Error('Workflow must have a start step');
    }
    if (!workflow.steps.some((s) => s.type === 'end')) {
      throw new Error('Workflow must have an end step');
    }
  }

  private evaluateCondition(condition: AutomationCondition, context: WorkflowContext): boolean {
    const value = this.getValueByPath(context.variables, condition.field) ?? this.getValueByPath(context.deal, condition.field);

    return this.evaluateOperator(value, condition.operator, condition.value);
  }

  private evaluateOperator(value: any, operator: CriterionOperator, target: any): boolean {
    switch (operator) {
      case 'equals':
        return value === target;
      case 'not_equals':
        return value !== target;
      case 'greater_than':
        return Number(value) > Number(target);
      case 'less_than':
        return Number(value) < Number(target);
      case 'greater_or_equal':
        return Number(value) >= Number(target);
      case 'less_or_equal':
        return Number(value) <= Number(target);
      case 'contains':
        return String(value).toLowerCase().includes(String(target).toLowerCase());
      case 'not_contains':
        return !String(value).toLowerCase().includes(String(target).toLowerCase());
      case 'exists':
        return value !== undefined && value !== null;
      case 'not_exists':
        return value === undefined || value === null;
      default:
        return false;
    }
  }

  private getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value && value[part] !== undefined) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  /**
   * Get execution by ID
   */
  public getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all executions for a deal
   */
  public getExecutionsForDeal(dealId: string): WorkflowExecution[] {
    return Array.from(this.executions.values()).filter((e) => e.dealId === dealId);
  }
}

// Export singleton
export const workflowEngine = new WorkflowEngine();
export default workflowEngine;
