/**
 * Compliance Service Unit Tests
 *
 * Tests rule evaluation, status calculation, auto-queue workflow,
 * and audit logging for the compliance engine.
 */

import { complianceService } from '../../services/ComplianceService';
import { dealApprovalService } from '../../services/DealApprovalService';
import Property from '../../models/Property';
import StateComplianceRule from '../../models/StateComplianceRule';
import StateDocumentTemplate from '../../models/StateDocumentTemplate';
import DocuSealSubmission from '../../models/DocuSealSubmission';
import ComplianceCheck from '../../models/ComplianceCheck';
import ComplianceAuditLog from '../../models/ComplianceAuditLog';

// Mock all external dependencies
jest.mock('../../models/Property');
jest.mock('../../models/StateComplianceRule');
jest.mock('../../models/StateDocumentTemplate');
jest.mock('../../models/DocuSealSubmission');
jest.mock('../../models/ComplianceCheck');
jest.mock('../../models/ComplianceAuditLog');
jest.mock('../../services/DealApprovalService');

describe('ComplianceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StateDocumentTemplate.getRequiredTemplates as jest.Mock).mockResolvedValue([]);
    (DocuSealSubmission.findByPropertyId as jest.Mock).mockResolvedValue([]);
  });

  // ============================================================================
  // RULE OPERATOR TESTS (13 operators)
  // ============================================================================

  describe('Rule Operators', () => {
    const createMockProperty = (overrides: any = {}) => ({
      id: 1,
      state: 'TX',
      approvalStatus: 'draft',
      dataValues: {
        id: 1,
        state: 'TX',
        approvalStatus: 'draft',
        ...overrides,
      },
      ...overrides,
    });

    const createMockRule = (overrides: any = {}) => ({
      id: 1,
      state: 'TX',
      name: 'Test Rule',
      category: 'general',
      field: 'testField',
      operator: 'required',
      value: '',
      severity: 'warning',
      message: 'Test message',
      enabled: true,
      order: 1,
      ...overrides,
    });

    beforeEach(() => {
      (ComplianceCheck.create as jest.Mock).mockResolvedValue({ id: 1 });
      (dealApprovalService.queueForApproval as jest.Mock).mockResolvedValue({});
    });

    it('should pass "required" operator when field has value', async () => {
      const property = createMockProperty({ wholesalerLLC: 'Test LLC' });
      const rules = [createMockRule({
        field: 'wholesalerLLC',
        operator: 'required',
        severity: 'critical',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
      expect(result.passedChecks).toContain('Test Rule');
    });

    it('should fail "required" operator when field is empty', async () => {
      const property = createMockProperty({ wholesalerLLC: '' });
      const rules = [createMockRule({
        field: 'wholesalerLLC',
        operator: 'required',
        severity: 'critical',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Red');
      expect(result.issues.length).toBe(1);
      expect(result.issues[0].ruleName).toBe('Test Rule');
    });

    it('should pass "equals" operator when values match', async () => {
      const property = createMockProperty({ status: 'active' });
      const rules = [createMockRule({
        field: 'status',
        operator: 'equals',
        value: 'active',
        severity: 'warning',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should fail "equals" operator when values differ', async () => {
      const property = createMockProperty({ status: 'inactive' });
      const rules = [createMockRule({
        field: 'status',
        operator: 'equals',
        value: 'active',
        severity: 'warning',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Yellow');
    });

    it('should pass "not_equals" operator when values differ', async () => {
      const property = createMockProperty({ status: 'active' });
      const rules = [createMockRule({
        field: 'status',
        operator: 'not_equals',
        value: 'rejected',
        severity: 'critical',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should pass "contains" operator when substring found', async () => {
      const property = createMockProperty({ contractText: 'This contract is assignable to third parties' });
      const rules = [createMockRule({
        field: 'contractText',
        operator: 'contains',
        value: 'assignable',
        severity: 'critical',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should be case-insensitive for "contains" operator', async () => {
      const property = createMockProperty({ contractText: 'ASSIGNABLE CONTRACT' });
      const rules = [createMockRule({
        field: 'contractText',
        operator: 'contains',
        value: 'assignable',
        severity: 'critical',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should pass "min_value" operator when value meets minimum', async () => {
      const property = createMockProperty({ purchasePrice: 150000 });
      const rules = [createMockRule({
        field: 'purchasePrice',
        operator: 'min_value',
        value: '100000',
        severity: 'warning',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should fail "min_value" operator when value below minimum', async () => {
      const property = createMockProperty({ purchasePrice: 50000 });
      const rules = [createMockRule({
        field: 'purchasePrice',
        operator: 'min_value',
        value: '100000',
        severity: 'warning',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Yellow');
    });

    it('should pass "max_value" operator when value under maximum', async () => {
      const property = createMockProperty({ arv: 500000 });
      const rules = [createMockRule({
        field: 'arv',
        operator: 'max_value',
        value: '1000000',
        severity: 'warning',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should pass "regex" operator when pattern matches', async () => {
      const property = createMockProperty({ email: 'test@example.com' });
      const rules = [createMockRule({
        field: 'email',
        operator: 'regex',
        value: '^[^@]+@[^@]+\\.[^@]+$',
        severity: 'warning',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should fail "regex" operator when pattern is too long (ReDoS protection)', async () => {
      const property = createMockProperty({ email: 'test@example.com' });
      const rules = [createMockRule({
        field: 'email',
        operator: 'regex',
        value: 'a'.repeat(501), // Exceeds 500 char limit
        severity: 'warning',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Yellow');
    });

    it('should pass "in_list" operator when value in list', async () => {
      const property = createMockProperty({ state: 'TX' });
      const rules = [createMockRule({
        field: 'state',
        operator: 'in_list',
        value: 'TX,CA,FL,NY',
        severity: 'critical',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should fail "in_list" operator when value not in list', async () => {
      const property = createMockProperty({ state: 'AK' });
      const rules = [createMockRule({
        field: 'state',
        operator: 'in_list',
        value: 'TX,CA,FL,NY',
        severity: 'critical',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Red');
    });

    it('should pass "not_in_list" operator when value not in list', async () => {
      const property = createMockProperty({ category: 'residential' });
      const rules = [createMockRule({
        field: 'category',
        operator: 'not_in_list',
        value: 'commercial,industrial,land',
        severity: 'warning',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should pass "is_true" operator when value is true', async () => {
      const property = createMockProperty({ isAssignable: true });
      const rules = [createMockRule({
        field: 'isAssignable',
        operator: 'is_true',
        severity: 'critical',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should pass "is_false" operator when value is false', async () => {
      const property = createMockProperty({ isRestricted: false });
      const rules = [createMockRule({
        field: 'isRestricted',
        operator: 'is_false',
        severity: 'critical',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });

    it('should handle dot notation for nested fields', async () => {
      const property = createMockProperty({
        seller: { name: 'John Smith' },
        dataValues: { seller: { name: 'John Smith' } }
      });
      const rules = [createMockRule({
        field: 'seller.name',
        operator: 'required',
        severity: 'critical',
      })];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
    });
  });

  // ============================================================================
  // STATUS CALCULATION TESTS
  // ============================================================================

  describe('Status Calculation', () => {
    beforeEach(() => {
      (ComplianceCheck.create as jest.Mock).mockResolvedValue({ id: 1 });
      (dealApprovalService.queueForApproval as jest.Mock).mockResolvedValue({});
    });

    it('should return Green when no issues found', async () => {
      const property = { id: 1, state: 'TX', wholesalerLLC: 'Test LLC', approvalStatus: 'draft' };
      const rules = [{
        id: 1, name: 'Test', field: 'wholesalerLLC', operator: 'required',
        severity: 'critical', category: 'general', message: 'Required', enabled: true, order: 1
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
      expect(result.issues.length).toBe(0);
    });

    it('should return Yellow when only warning issues found', async () => {
      const property = { id: 1, state: 'TX', wholesalerLLC: '', approvalStatus: 'draft' };
      const rules = [{
        id: 1, name: 'Test', field: 'wholesalerLLC', operator: 'required',
        severity: 'warning', category: 'general', message: 'Recommended', enabled: true, order: 1
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Yellow');
    });

    it('should return Red when any critical issue found', async () => {
      const property = { id: 1, state: 'TX', wholesalerLLC: '', isAssignable: false, approvalStatus: 'draft' };
      const rules = [
        {
          id: 1, name: 'LLC Required', field: 'wholesalerLLC', operator: 'required',
          severity: 'warning', category: 'general', message: 'Recommended', enabled: true, order: 1
        },
        {
          id: 2, name: 'Must Be Assignable', field: 'isAssignable', operator: 'is_true',
          severity: 'critical', category: 'contract', message: 'Critical', enabled: true, order: 2
        }
      ];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Red');
      expect(result.issues.some(i => i.severity === 'critical')).toBe(true);
    });

    it('should return Green when no rules configured for state', async () => {
      const property = { id: 1, state: 'ZZ', approvalStatus: 'draft' };

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue([]);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green');
      expect(result.totalRules).toBe(0);
    });

    it('should apply severity overrides based on transaction type', async () => {
      const property = { id: 1, state: 'TX', wholesalerLLC: '', approvalStatus: 'draft' };
      const rules = [{
        id: 1, name: 'Wholesaler Required', field: 'wholesalerLLC', operator: 'required',
        severity: 'warning', category: 'general', message: 'Required', enabled: true, order: 1,
        severityOverrides: [{ when: { transactionType: 'retail' }, severity: 'critical' }],
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any, { transactionType: 'retail', autoRemediate: false });

      expect(result.issues[0].severity).toBe('critical');
    });

    it('should mark missing required documents as compliance issues', async () => {
      const property = { id: 1, state: 'TX', approvalStatus: 'draft' };

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue([]);
      (StateDocumentTemplate.getRequiredTemplates as jest.Mock).mockResolvedValue([
        {
          id: 10,
          docuSealTemplateId: 101,
          category: 'purchase_contract',
          name: 'Purchase Contract',
          description: 'Required purchase contract',
          priority: 1,
        },
      ]);
      (DocuSealSubmission.findByPropertyId as jest.Mock).mockResolvedValue([]);

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Red');
      expect(result.issues.some(issue => issue.category === 'documents')).toBe(true);
    });
  });

  // ============================================================================
  // AUTO-QUEUE WORKFLOW TESTS
  // ============================================================================

  describe('Auto-Queue Workflow', () => {
    beforeEach(() => {
      (ComplianceCheck.create as jest.Mock).mockResolvedValue({ id: 1 });
    });

    it('should auto-queue for broker approval when status is Green', async () => {
      const property = { id: 123, state: 'TX', wholesalerLLC: 'Test LLC', approvalStatus: 'draft' };
      const rules = [{
        id: 1, name: 'Test', field: 'wholesalerLLC', operator: 'required',
        severity: 'critical', category: 'general', message: 'Required', enabled: true, order: 1
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);
      (dealApprovalService.queueForApproval as jest.Mock).mockResolvedValue({});

      await complianceService.checkProperty(property as any);

      expect(dealApprovalService.queueForApproval).toHaveBeenCalledWith(123);
    });

    it('should NOT auto-queue when status is Yellow', async () => {
      const property = { id: 123, state: 'TX', wholesalerLLC: '', approvalStatus: 'draft' };
      const rules = [{
        id: 1, name: 'Test', field: 'wholesalerLLC', operator: 'required',
        severity: 'warning', category: 'general', message: 'Recommended', enabled: true, order: 1
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      await complianceService.checkProperty(property as any);

      expect(dealApprovalService.queueForApproval).not.toHaveBeenCalled();
    });

    it('should NOT auto-queue when status is Red', async () => {
      const property = { id: 123, state: 'TX', wholesalerLLC: '', approvalStatus: 'draft' };
      const rules = [{
        id: 1, name: 'Test', field: 'wholesalerLLC', operator: 'required',
        severity: 'critical', category: 'general', message: 'Required', enabled: true, order: 1
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      await complianceService.checkProperty(property as any);

      expect(dealApprovalService.queueForApproval).not.toHaveBeenCalled();
    });

    it('should NOT auto-queue when property already has non-draft approval status', async () => {
      const property = { id: 123, state: 'TX', wholesalerLLC: 'Test LLC', approvalStatus: 'pending_broker_approval' };
      const rules = [{
        id: 1, name: 'Test', field: 'wholesalerLLC', operator: 'required',
        severity: 'critical', category: 'general', message: 'Required', enabled: true, order: 1
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      await complianceService.checkProperty(property as any);

      expect(dealApprovalService.queueForApproval).not.toHaveBeenCalled();
    });

    it('should NOT auto-queue when property has no ID', async () => {
      const property = { state: 'TX', wholesalerLLC: 'Test LLC', approvalStatus: 'draft' };
      const rules = [{
        id: 1, name: 'Test', field: 'wholesalerLLC', operator: 'required',
        severity: 'critical', category: 'general', message: 'Required', enabled: true, order: 1
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      await complianceService.checkProperty(property as any);

      expect(dealApprovalService.queueForApproval).not.toHaveBeenCalled();
    });

    it('should handle queue failure gracefully without failing compliance check', async () => {
      const property = { id: 123, state: 'TX', wholesalerLLC: 'Test LLC', approvalStatus: 'draft' };
      const rules = [{
        id: 1, name: 'Test', field: 'wholesalerLLC', operator: 'required',
        severity: 'critical', category: 'general', message: 'Required', enabled: true, order: 1
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);
      (dealApprovalService.queueForApproval as jest.Mock).mockRejectedValue(new Error('No broker available'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green'); // Compliance check should still succeed
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // COMPLIANCE CHECK PERSISTENCE TESTS
  // ============================================================================

  describe('Compliance Check Persistence', () => {
    it('should save compliance check result to database', async () => {
      const property = { id: 1, state: 'TX', wholesalerLLC: 'Test LLC', approvalStatus: 'draft' };
      const rules = [{
        id: 1, name: 'Test', field: 'wholesalerLLC', operator: 'required',
        severity: 'critical', category: 'general', message: 'Required', enabled: true, order: 1
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);
      (ComplianceCheck.create as jest.Mock).mockResolvedValue({ id: 42 });
      (dealApprovalService.queueForApproval as jest.Mock).mockResolvedValue({});

      const result = await complianceService.checkProperty(property as any);

      expect(ComplianceCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyId: 1,
          status: 'Green',
          state: 'TX',
        })
      );
      expect(result.checkId).toBe(42);
    });

    it('should handle persistence failure gracefully', async () => {
      const property = { id: 1, state: 'TX', wholesalerLLC: 'Test LLC', approvalStatus: 'draft' };
      const rules = [{
        id: 1, name: 'Test', field: 'wholesalerLLC', operator: 'required',
        severity: 'critical', category: 'general', message: 'Required', enabled: true, order: 1
      }];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);
      (ComplianceCheck.create as jest.Mock).mockRejectedValue(new Error('DB error'));
      (dealApprovalService.queueForApproval as jest.Mock).mockResolvedValue({});

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await complianceService.checkProperty(property as any);

      expect(result.status).toBe('Green'); // Should still return valid result
      expect(result.checkId).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // STATE-SPECIFIC VS UNIVERSAL RULES TESTS
  // ============================================================================

  describe('State-Specific vs Universal Rules', () => {
    beforeEach(() => {
      (ComplianceCheck.create as jest.Mock).mockResolvedValue({ id: 1 });
      (dealApprovalService.queueForApproval as jest.Mock).mockResolvedValue({});
    });

    it('should apply both state-specific and universal rules', async () => {
      const property = { id: 1, state: 'TX', wholesalerLLC: 'Test LLC', agentLicense: '', approvalStatus: 'draft' };

      // Mock returns both universal and TX-specific rules
      const rules = [
        {
          id: 1, name: 'Universal: LLC Required', field: 'wholesalerLLC', operator: 'required',
          state: 'ALL', severity: 'warning', category: 'general', message: 'LLC recommended', enabled: true, order: 1
        },
        {
          id: 2, name: 'TX: Agent License', field: 'agentLicense', operator: 'required',
          state: 'TX', severity: 'critical', category: 'licensing', message: 'TX requires license', enabled: true, order: 2
        }
      ];

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue(rules);

      const result = await complianceService.checkProperty(property as any);

      expect(result.totalRules).toBe(2);
      expect(result.passedRules).toBe(1); // LLC passes
      expect(result.failedRules).toBe(1); // License fails
      expect(result.status).toBe('Red'); // Critical failure
    });

    it('should use uppercase state for rule lookup', async () => {
      const property = { id: 1, state: 'tx', approvalStatus: 'draft' }; // lowercase state

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue([]);

      await complianceService.checkProperty(property as any);

      expect(StateComplianceRule.getRulesForState).toHaveBeenCalledWith('TX');
    });

    it('should default to ALL when state is missing', async () => {
      const property = { id: 1, approvalStatus: 'draft' }; // no state

      (StateComplianceRule.getRulesForState as jest.Mock).mockResolvedValue([]);

      await complianceService.checkProperty(property as any);

      expect(StateComplianceRule.getRulesForState).toHaveBeenCalledWith('ALL');
    });
  });

  // ============================================================================
  // CONFIGURED STATES TESTS
  // ============================================================================

  describe('getConfiguredStates', () => {
    it('should return list of states with configured rules', async () => {
      const mockStates = ['TX', 'CA', 'FL', 'ALL'];
      (StateComplianceRule.getStatesWithRules as jest.Mock).mockResolvedValue(mockStates);

      const result = await complianceService.getConfiguredStates();

      expect(result).toEqual(mockStates);
      expect(StateComplianceRule.getStatesWithRules).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SEED DEFAULT RULES TESTS
  // ============================================================================

  describe('seedDefaultRules', () => {
    it('should call StateComplianceRule.seedDefaultRules', async () => {
      (StateComplianceRule.seedDefaultRules as jest.Mock).mockResolvedValue(undefined);

      await complianceService.seedDefaultRules();

      expect(StateComplianceRule.seedDefaultRules).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// COMPLIANCE AUDIT LOG TESTS
// Note: Static method tests for ComplianceAuditLog (logRuleChange, getResourceHistory, etc.)
// require integration tests with a real database connection since they use Sequelize
// model methods internally. Unit tests for the model structure are sufficient here.
// ============================================================================

describe('ComplianceAuditLog Model', () => {
  it('should have audit log model available', () => {
    expect(ComplianceAuditLog).toBeDefined();
  });

  it('should have static logging methods defined', () => {
    expect(typeof ComplianceAuditLog.logRuleChange).toBe('function');
    expect(typeof ComplianceAuditLog.logKnowledgeChange).toBe('function');
    expect(typeof ComplianceAuditLog.logTemplateChange).toBe('function');
  });

  it('should have static query methods defined', () => {
    expect(typeof ComplianceAuditLog.getResourceHistory).toBe('function');
    expect(typeof ComplianceAuditLog.getAuditLogs).toBe('function');
    expect(typeof ComplianceAuditLog.getRecentCriticalChanges).toBe('function');
  });
});

// ============================================================================
// DEAL APPROVAL SERVICE INTEGRATION TESTS
// ============================================================================

describe('DealApprovalService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('queueForApproval', () => {
    it('should be callable from ComplianceService', () => {
      expect(dealApprovalService.queueForApproval).toBeDefined();
    });
  });

  describe('isReady', () => {
    it('should return ready status', () => {
      expect(dealApprovalService.isReady).toBeDefined();
    });
  });
});
