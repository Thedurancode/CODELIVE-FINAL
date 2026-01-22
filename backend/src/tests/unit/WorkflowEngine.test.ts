/**
 * WorkflowEngine Unit Tests
 */

import { WorkflowEngine, WorkflowContext, IWorkflowStepHandler, StepExecutionResult } from '../../plugins/workflow/WorkflowEngine';
import { Workflow, WorkflowStep, NormalizedDeal } from '../../plugins/types';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let mockDeal: NormalizedDeal;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new WorkflowEngine();

    mockDeal = {
      externalId: 'deal-123',
      sourceId: 'source-1',
      sourceName: 'Test Source',
      address: {
        street: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      },
      askingPrice: 150000,
      propertyType: 'single_family',
      bedrooms: 3,
      bathrooms: 2,
      sqft: 1500,
      normalizedAt: new Date(),
      confidence: 85,
      rawData: {},
      photos: [],
      documents: [],
      occupancyStatus: 'vacant',
    };
  });

  // ============================================================================
  // WORKFLOW MANAGEMENT
  // ============================================================================

  describe('Workflow Management', () => {
    describe('registerWorkflow', () => {
      it('should register a valid workflow', () => {
        const workflow = createSimpleWorkflow('test-workflow', 'Test Workflow');

        engine.registerWorkflow(workflow);

        expect(engine.getWorkflow('test-workflow')).toBeDefined();
        expect(engine.getWorkflow('test-workflow')?.name).toBe('Test Workflow');
      });

      it('should throw error for workflow without ID', () => {
        const workflow = createSimpleWorkflow('', 'Invalid Workflow');

        expect(() => engine.registerWorkflow(workflow)).toThrow('Workflow must have an ID');
      });

      it('should throw error for workflow without steps', () => {
        const workflow: Workflow = {
          id: 'test-workflow',
          name: 'Test',
          enabled: true,
          steps: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        expect(() => engine.registerWorkflow(workflow)).toThrow('Workflow must have at least one step');
      });

      it('should throw error for workflow without start step', () => {
        const workflow: Workflow = {
          id: 'test-workflow',
          name: 'Test',
          enabled: true,
          steps: [
            { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        expect(() => engine.registerWorkflow(workflow)).toThrow('Workflow must have a start step');
      });

      it('should throw error for workflow without end step', () => {
        const workflow: Workflow = {
          id: 'test-workflow',
          name: 'Test',
          enabled: true,
          steps: [
            { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [] },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        expect(() => engine.registerWorkflow(workflow)).toThrow('Workflow must have an end step');
      });
    });

    describe('updateWorkflow', () => {
      it('should update an existing workflow', () => {
        const workflow = createSimpleWorkflow('test-workflow', 'Original Name');
        engine.registerWorkflow(workflow);

        const updatedWorkflow = { ...workflow, name: 'Updated Name' };
        engine.updateWorkflow(updatedWorkflow);

        expect(engine.getWorkflow('test-workflow')?.name).toBe('Updated Name');
      });

      it('should update the updatedAt timestamp', () => {
        const workflow = createSimpleWorkflow('test-workflow', 'Test');
        const originalDate = new Date('2020-01-01');
        workflow.updatedAt = originalDate;
        engine.registerWorkflow(workflow);

        engine.updateWorkflow(workflow);

        const updated = engine.getWorkflow('test-workflow');
        expect(updated?.updatedAt.getTime()).toBeGreaterThan(originalDate.getTime());
      });
    });

    describe('removeWorkflow', () => {
      it('should remove a workflow', () => {
        const workflow = createSimpleWorkflow('test-workflow', 'Test');
        engine.registerWorkflow(workflow);

        engine.removeWorkflow('test-workflow');

        expect(engine.getWorkflow('test-workflow')).toBeUndefined();
      });

      it('should not throw when removing non-existent workflow', () => {
        expect(() => engine.removeWorkflow('non-existent')).not.toThrow();
      });
    });

    describe('getAllWorkflows', () => {
      it('should return all registered workflows', () => {
        engine.registerWorkflow(createSimpleWorkflow('workflow-1', 'Workflow 1'));
        engine.registerWorkflow(createSimpleWorkflow('workflow-2', 'Workflow 2'));
        engine.registerWorkflow(createSimpleWorkflow('workflow-3', 'Workflow 3'));

        const workflows = engine.getAllWorkflows();

        expect(workflows).toHaveLength(3);
        expect(workflows.map((w) => w.id)).toEqual(
          expect.arrayContaining(['workflow-1', 'workflow-2', 'workflow-3'])
        );
      });

      it('should return empty array when no workflows registered', () => {
        const workflows = engine.getAllWorkflows();
        expect(workflows).toHaveLength(0);
      });
    });

    describe('getWorkflow', () => {
      it('should return workflow by ID', () => {
        const workflow = createSimpleWorkflow('test-workflow', 'Test');
        engine.registerWorkflow(workflow);

        expect(engine.getWorkflow('test-workflow')).toEqual(workflow);
      });

      it('should return undefined for non-existent workflow', () => {
        expect(engine.getWorkflow('non-existent')).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // WORKFLOW TEMPLATES
  // ============================================================================

  describe('Workflow Templates', () => {
    it('should return built-in templates', () => {
      const templates = engine.getWorkflowTemplates();

      expect(templates.length).toBeGreaterThanOrEqual(4);
    });

    it('should include standard deal workflow', () => {
      const templates = engine.getWorkflowTemplates();
      const standard = templates.find((t) => t.id === 'template-standard');

      expect(standard).toBeDefined();
      expect(standard?.name).toBe('Standard Deal Processing');
    });

    it('should include fast track workflow', () => {
      const templates = engine.getWorkflowTemplates();
      const fastTrack = templates.find((t) => t.id === 'template-fasttrack');

      expect(fastTrack).toBeDefined();
      expect(fastTrack?.name).toBe('Fast Track Deal Processing');
    });

    it('should include high value workflow', () => {
      const templates = engine.getWorkflowTemplates();
      const highValue = templates.find((t) => t.id === 'template-highvalue');

      expect(highValue).toBeDefined();
      expect(highValue?.name).toBe('High Value Deal Processing');
    });

    it('should include marketplace distribution workflow', () => {
      const templates = engine.getWorkflowTemplates();
      const marketplace = templates.find((t) => t.id === 'template-marketplace');

      expect(marketplace).toBeDefined();
      expect(marketplace?.name).toBe('Marketplace Distribution');
    });

    it('templates should be valid workflows', () => {
      const templates = engine.getWorkflowTemplates();

      templates.forEach((template) => {
        expect(() => engine.registerWorkflow(template)).not.toThrow();
      });
    });
  });

  // ============================================================================
  // STEP HANDLERS
  // ============================================================================

  describe('Step Handlers', () => {
    describe('registerStepHandler', () => {
      it('should register a custom step handler', async () => {
        const customHandler: IWorkflowStepHandler = {
          type: 'custom_action' as any,
          execute: async (step, context) => ({
            success: true,
            output: { custom: 'result' },
          }),
        };

        engine.registerStepHandler(customHandler);

        // Create workflow with custom step
        const workflow: Workflow = {
          id: 'custom-workflow',
          name: 'Custom Workflow',
          enabled: true,
          steps: [
            { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'custom' }] },
            { id: 'custom', name: 'Custom', type: 'custom_action' as any, config: {}, nextSteps: [{ targetStepId: 'end' }] },
            { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        engine.registerWorkflow(workflow);
        const execution = await engine.startWorkflow('custom-workflow', mockDeal);

        expect(execution.status).toBe('completed');
      });
    });

    describe('Default Handlers', () => {
      it('should have start handler', async () => {
        const workflow = createSimpleWorkflow('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.stepHistory.some((s) => s.stepId === 'start')).toBe(true);
      });

      it('should have end handler', async () => {
        const workflow = createSimpleWorkflow('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.stepHistory.some((s) => s.stepId === 'end')).toBe(true);
        expect(execution.status).toBe('completed');
      });

      it('should have action handler', async () => {
        const workflow = createWorkflowWithAction('test', 'Test', 'test_action');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.stepHistory.some((s) => s.stepId === 'action')).toBe(true);
      });

      it('should have condition handler', async () => {
        const workflow = createWorkflowWithCondition('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.stepHistory.some((s) => s.stepId === 'condition')).toBe(true);
      });

      it('should have wait handler', async () => {
        const workflow = createWorkflowWithWait('test', 'Test', 10);
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.stepHistory.some((s) => s.stepId === 'wait')).toBe(true);
      });

      it('should have parallel handler', async () => {
        const workflow = createWorkflowWithParallel('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.stepHistory.some((s) => s.stepId === 'parallel')).toBe(true);
      });

      it('should have human_review handler', async () => {
        const workflow = createWorkflowWithHumanReview('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.status).toBe('paused');
        expect(execution.stepHistory.some((s) => s.stepId === 'review')).toBe(true);
      });
    });
  });

  // ============================================================================
  // WORKFLOW EXECUTION
  // ============================================================================

  describe('Workflow Execution', () => {
    describe('startWorkflow', () => {
      it('should start a workflow for a deal', async () => {
        const workflow = createSimpleWorkflow('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution).toBeDefined();
        expect(execution.id).toBeDefined();
        expect(execution.workflowId).toBe('test');
        expect(execution.dealId).toBe('deal-123');
      });

      it('should throw error for non-existent workflow', async () => {
        await expect(engine.startWorkflow('non-existent', mockDeal)).rejects.toThrow(
          'Workflow not found'
        );
      });

      it('should throw error for disabled workflow', async () => {
        const workflow = createSimpleWorkflow('test', 'Test');
        workflow.enabled = false;
        engine.registerWorkflow(workflow);

        await expect(engine.startWorkflow('test', mockDeal)).rejects.toThrow(
          'Workflow is disabled'
        );
      });

      it('should complete simple workflow', async () => {
        const workflow = createSimpleWorkflow('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.status).toBe('completed');
        expect(execution.completedAt).toBeDefined();
      });

      it('should record step history', async () => {
        const workflow = createWorkflowWithAction('test', 'Test', 'test_action');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.stepHistory.length).toBeGreaterThan(0);
        expect(execution.stepHistory[0].startedAt).toBeDefined();
        expect(execution.stepHistory[0].completedAt).toBeDefined();
      });

      it('should handle workflow with conditions', async () => {
        const workflow = createWorkflowWithCondition('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.status).toBe('completed');
      });
    });

    describe('pauseWorkflow (Human Review)', () => {
      it('should pause workflow at human review step', async () => {
        const workflow = createWorkflowWithHumanReview('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        expect(execution.status).toBe('paused');
      });

      it('should create pending review when paused', async () => {
        const workflow = createWorkflowWithHumanReview('test', 'Test');
        engine.registerWorkflow(workflow);

        await engine.startWorkflow('test', mockDeal);

        const reviews = engine.getPendingReviews();
        expect(reviews.length).toBeGreaterThan(0);
      });
    });

    describe('resumeWorkflow', () => {
      it('should resume a paused workflow', async () => {
        const workflow = createWorkflowWithHumanReview('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);
        expect(execution.status).toBe('paused');

        const resumed = await engine.resumeWorkflow(execution.id, {
          approved: true,
        });

        expect(resumed.status).toBe('completed');
      });

      it('should throw error for non-existent execution', async () => {
        await expect(engine.resumeWorkflow('non-existent')).rejects.toThrow(
          'Execution not found'
        );
      });

      it('should throw error for non-paused execution', async () => {
        const workflow = createSimpleWorkflow('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);

        await expect(engine.resumeWorkflow(execution.id)).rejects.toThrow(
          'Execution is not paused'
        );
      });

      it('should follow approved path when approved', async () => {
        const workflow = createWorkflowWithHumanReviewBranches('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);
        const resumed = await engine.resumeWorkflow(execution.id, {
          approved: true,
        });

        expect(resumed.stepHistory.some((s) => s.stepId === 'approved_action')).toBe(true);
      });

      it('should follow rejected path when rejected', async () => {
        const workflow = createWorkflowWithHumanReviewBranches('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);
        const resumed = await engine.resumeWorkflow(execution.id, {
          approved: false,
        });

        expect(resumed.stepHistory.some((s) => s.stepId === 'rejected_action')).toBe(true);
      });
    });

    describe('submitReview', () => {
      it('should submit review and resume workflow', async () => {
        const workflow = createWorkflowWithHumanReview('test', 'Test');
        engine.registerWorkflow(workflow);

        await engine.startWorkflow('test', mockDeal);
        const reviews = engine.getPendingReviews();
        const reviewId = reviews[0].id;

        await engine.submitReview(reviewId, true, 'Approved');

        // Review should be removed
        expect(engine.getPendingReviews().find((r) => r.id === reviewId)).toBeUndefined();
      });

      it('should throw error for non-existent review', async () => {
        await expect(engine.submitReview('non-existent', true)).rejects.toThrow(
          'Review not found'
        );
      });
    });

    describe('getPendingReviews', () => {
      it('should return all pending reviews', async () => {
        const workflow = createWorkflowWithHumanReview('test', 'Test');
        engine.registerWorkflow(workflow);

        const deal1 = { ...mockDeal, externalId: 'deal-1' };
        const deal2 = { ...mockDeal, externalId: 'deal-2' };

        await engine.startWorkflow('test', deal1);
        await engine.startWorkflow('test', deal2);

        const reviews = engine.getPendingReviews();
        expect(reviews.length).toBe(2);
      });

      it('should return empty array when no pending reviews', () => {
        expect(engine.getPendingReviews()).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // CONDITION EVALUATION
  // ============================================================================

  describe('Condition Evaluation', () => {
    it('should evaluate equals condition', async () => {
      const workflow = createWorkflowWithConditionOperator('test', 'equals', 'single_family');
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });

    it('should evaluate not_equals condition', async () => {
      const workflow = createWorkflowWithConditionOperator('test', 'not_equals', 'condo');
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });

    it('should evaluate greater_than condition', async () => {
      const workflow = createWorkflowWithNumericCondition('test', 'greater_than', 100000);
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });

    it('should evaluate less_than condition', async () => {
      const workflow = createWorkflowWithNumericCondition('test', 'less_than', 200000);
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });

    it('should evaluate greater_or_equal condition', async () => {
      const workflow = createWorkflowWithNumericCondition('test', 'greater_or_equal', 150000);
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });

    it('should evaluate less_or_equal condition', async () => {
      const workflow = createWorkflowWithNumericCondition('test', 'less_or_equal', 150000);
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });

    it('should evaluate contains condition', async () => {
      const workflow = createWorkflowWithStringCondition('test', 'contains', 'Main');
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });

    it('should evaluate not_contains condition', async () => {
      const workflow = createWorkflowWithStringCondition('test', 'not_contains', 'Oak');
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });

    it('should evaluate exists condition', async () => {
      const workflow = createWorkflowWithExistsCondition('test', 'exists', 'askingPrice');
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });

    it('should evaluate not_exists condition', async () => {
      const workflow = createWorkflowWithExistsCondition('test', 'not_exists', 'nonExistentField');
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });

    it('should evaluate nested field paths', async () => {
      const workflow = createWorkflowWithNestedCondition('test', 'address.city', 'equals', 'Austin');
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.stepHistory.some((s) => s.stepId === 'true_action')).toBe(true);
    });
  });

  // ============================================================================
  // EXECUTION QUERIES
  // ============================================================================

  describe('Execution Queries', () => {
    describe('getExecution', () => {
      it('should return execution by ID', async () => {
        const workflow = createSimpleWorkflow('test', 'Test');
        engine.registerWorkflow(workflow);

        const execution = await engine.startWorkflow('test', mockDeal);
        const retrieved = engine.getExecution(execution.id);

        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(execution.id);
      });

      it('should return undefined for non-existent execution', () => {
        expect(engine.getExecution('non-existent')).toBeUndefined();
      });
    });

    describe('getExecutionsForDeal', () => {
      it('should return all executions for a deal', async () => {
        const workflow = createSimpleWorkflow('test', 'Test');
        engine.registerWorkflow(workflow);

        await engine.startWorkflow('test', mockDeal);
        await engine.startWorkflow('test', mockDeal);

        const executions = engine.getExecutionsForDeal('deal-123');
        expect(executions).toHaveLength(2);
      });

      it('should return empty array for deal with no executions', () => {
        expect(engine.getExecutionsForDeal('non-existent-deal')).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle step without handler', async () => {
      const workflow: Workflow = {
        id: 'test',
        name: 'Test',
        enabled: true,
        steps: [
          { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'unknown' }] },
          { id: 'unknown', name: 'Unknown', type: 'unknown_type' as any, config: {}, nextSteps: [{ targetStepId: 'end' }] },
          { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      engine.registerWorkflow(workflow);
      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.status).toBe('failed');
      expect(execution.error).toContain('No handler for step type');
    });

    it('should handle missing step', async () => {
      const workflow: Workflow = {
        id: 'test',
        name: 'Test',
        enabled: true,
        steps: [
          { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'missing_step' }] },
          { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      engine.registerWorkflow(workflow);
      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.status).toBe('failed');
      expect(execution.error).toContain('Step not found');
    });
  });

  // ============================================================================
  // PARALLEL EXECUTION
  // ============================================================================

  describe('Parallel Execution', () => {
    it('should execute parallel steps', async () => {
      const workflow = createWorkflowWithParallel('test', 'Test');
      engine.registerWorkflow(workflow);

      const execution = await engine.startWorkflow('test', mockDeal);

      expect(execution.status).toBe('completed');
      const parallelStep = execution.stepHistory.find((s) => s.stepId === 'parallel');
      expect(parallelStep?.result).toBeDefined();
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createSimpleWorkflow(id: string, name: string): Workflow {
  return {
    id,
    name,
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithAction(id: string, name: string, actionName: string): Workflow {
  return {
    id,
    name,
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'action' }] },
      { id: 'action', name: 'Action', type: 'action', config: { action: actionName }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithCondition(id: string, name: string): Workflow {
  return {
    id,
    name,
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'condition' }] },
      {
        id: 'condition',
        name: 'Condition',
        type: 'condition',
        config: {},
        nextSteps: [{ targetStepId: 'end' }],
      },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithWait(id: string, name: string, duration: number): Workflow {
  return {
    id,
    name,
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'wait' }] },
      { id: 'wait', name: 'Wait', type: 'wait', config: { duration }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithParallel(id: string, name: string): Workflow {
  return {
    id,
    name,
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'parallel' }] },
      {
        id: 'parallel',
        name: 'Parallel',
        type: 'parallel',
        config: { steps: ['step1', 'step2'] },
        nextSteps: [{ targetStepId: 'end' }],
      },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithHumanReview(id: string, name: string): Workflow {
  return {
    id,
    name,
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'review' }] },
      {
        id: 'review',
        name: 'Human Review',
        type: 'human_review',
        config: { reviewType: 'approval' },
        nextSteps: [{ targetStepId: 'end' }],
      },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithHumanReviewBranches(id: string, name: string): Workflow {
  return {
    id,
    name,
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'review' }] },
      {
        id: 'review',
        name: 'Human Review',
        type: 'human_review',
        config: { reviewType: 'approval' },
        nextSteps: [
          { targetStepId: 'approved_action', condition: { id: 'approved', field: 'reviewResult.approved', operator: 'equals', value: true } },
          { targetStepId: 'rejected_action', condition: { id: 'rejected', field: 'reviewResult.approved', operator: 'equals', value: false } },
        ],
      },
      { id: 'approved_action', name: 'Approved', type: 'action', config: { action: 'approve' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'rejected_action', name: 'Rejected', type: 'action', config: { action: 'reject' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithConditionOperator(id: string, operator: string, value: any): Workflow {
  return {
    id,
    name: 'Test',
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'condition' }] },
      {
        id: 'condition',
        name: 'Condition',
        type: 'condition',
        config: {},
        nextSteps: [
          { targetStepId: 'true_action', condition: { id: 'c1', field: 'propertyType', operator: operator as any, value } },
          { targetStepId: 'false_action' },
        ],
      },
      { id: 'true_action', name: 'True', type: 'action', config: { action: 'true' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'false_action', name: 'False', type: 'action', config: { action: 'false' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithNumericCondition(id: string, operator: string, value: number): Workflow {
  return {
    id,
    name: 'Test',
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'condition' }] },
      {
        id: 'condition',
        name: 'Condition',
        type: 'condition',
        config: {},
        nextSteps: [
          { targetStepId: 'true_action', condition: { id: 'c1', field: 'askingPrice', operator: operator as any, value } },
          { targetStepId: 'false_action' },
        ],
      },
      { id: 'true_action', name: 'True', type: 'action', config: { action: 'true' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'false_action', name: 'False', type: 'action', config: { action: 'false' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithStringCondition(id: string, operator: string, value: string): Workflow {
  return {
    id,
    name: 'Test',
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'condition' }] },
      {
        id: 'condition',
        name: 'Condition',
        type: 'condition',
        config: {},
        nextSteps: [
          { targetStepId: 'true_action', condition: { id: 'c1', field: 'address.street', operator: operator as any, value } },
          { targetStepId: 'false_action' },
        ],
      },
      { id: 'true_action', name: 'True', type: 'action', config: { action: 'true' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'false_action', name: 'False', type: 'action', config: { action: 'false' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithExistsCondition(id: string, operator: string, field: string): Workflow {
  return {
    id,
    name: 'Test',
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'condition' }] },
      {
        id: 'condition',
        name: 'Condition',
        type: 'condition',
        config: {},
        nextSteps: [
          { targetStepId: 'true_action', condition: { id: 'c1', field, operator: operator as any, value: null } },
          { targetStepId: 'false_action' },
        ],
      },
      { id: 'true_action', name: 'True', type: 'action', config: { action: 'true' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'false_action', name: 'False', type: 'action', config: { action: 'false' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createWorkflowWithNestedCondition(id: string, field: string, operator: string, value: any): Workflow {
  return {
    id,
    name: 'Test',
    enabled: true,
    steps: [
      { id: 'start', name: 'Start', type: 'start', config: {}, nextSteps: [{ targetStepId: 'condition' }] },
      {
        id: 'condition',
        name: 'Condition',
        type: 'condition',
        config: {},
        nextSteps: [
          { targetStepId: 'true_action', condition: { id: 'c1', field, operator: operator as any, value } },
          { targetStepId: 'false_action' },
        ],
      },
      { id: 'true_action', name: 'True', type: 'action', config: { action: 'true' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'false_action', name: 'False', type: 'action', config: { action: 'false' }, nextSteps: [{ targetStepId: 'end' }] },
      { id: 'end', name: 'End', type: 'end', config: {}, nextSteps: [] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
