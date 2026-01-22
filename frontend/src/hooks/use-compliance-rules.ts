import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ComplianceRule {
  id: number;
  state: string;
  name: string;
  description?: string;
  category: 'contract' | 'disclosure' | 'licensing' | 'general';
  field: string;
  operator: string;
  value?: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  enabled: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRulePayload {
  state: string;
  name: string;
  description?: string;
  category: 'contract' | 'disclosure' | 'licensing' | 'general';
  field: string;
  operator: string;
  value?: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  enabled?: boolean;
  order?: number;
}

export type UpdateRulePayload = Partial<CreateRulePayload>;

// Available operators for rules
export const RULE_OPERATORS = [
  { value: 'required', label: 'Required', description: 'Field must have a value' },
  { value: 'equals', label: 'Equals', description: 'Must equal specified value' },
  { value: 'not_equals', label: 'Not Equals', description: 'Must not equal specified value' },
  { value: 'contains', label: 'Contains', description: 'Must contain substring' },
  { value: 'min_value', label: 'Minimum Value', description: 'Numeric minimum threshold' },
  { value: 'max_value', label: 'Maximum Value', description: 'Numeric maximum threshold' },
  { value: 'min_days_until', label: 'Min Days Until', description: 'Date must be X days in future' },
  { value: 'max_days_until', label: 'Max Days Until', description: 'Date must be within X days' },
  { value: 'regex', label: 'Regex Pattern', description: 'Match regex pattern' },
  { value: 'in_list', label: 'In List', description: 'Value in comma-separated list' },
  { value: 'not_in_list', label: 'Not In List', description: 'Value not in comma-separated list' },
  { value: 'is_true', label: 'Is True', description: 'Boolean must be true' },
  { value: 'is_false', label: 'Is False', description: 'Boolean must be false' },
];

// Common property fields that can be checked
export const PROPERTY_FIELDS = [
  { value: 'askingPrice', label: 'Asking Price', category: 'financial' },
  { value: 'arv', label: 'ARV (After Repair Value)', category: 'financial' },
  { value: 'repairCost', label: 'Repair Cost', category: 'financial' },
  { value: 'wholesaleFee', label: 'Wholesale Fee', category: 'financial' },
  { value: 'bedrooms', label: 'Bedrooms', category: 'property' },
  { value: 'bathrooms', label: 'Bathrooms', category: 'property' },
  { value: 'sqft', label: 'Square Feet', category: 'property' },
  { value: 'yearBuilt', label: 'Year Built', category: 'property' },
  { value: 'lotSize', label: 'Lot Size', category: 'property' },
  { value: 'propertyType', label: 'Property Type', category: 'property' },
  { value: 'condition', label: 'Condition', category: 'property' },
  { value: 'occupancy', label: 'Occupancy', category: 'property' },
  { value: 'state', label: 'State', category: 'location' },
  { value: 'city', label: 'City', category: 'location' },
  { value: 'zip', label: 'ZIP Code', category: 'location' },
  { value: 'county', label: 'County', category: 'location' },
  { value: 'assignable', label: 'Assignable', category: 'contract' },
  { value: 'ownerOccupied', label: 'Owner Occupied', category: 'contract' },
  { value: 'brokerOnFile', label: 'Broker On File', category: 'contract' },
  { value: 'marketingClauseFound', label: 'Marketing Clause Found', category: 'contract' },
  { value: 'wholesalerLlcName', label: 'Wholesaler LLC Name', category: 'licensing' },
  { value: 'llcOwnerEmail', label: 'LLC Owner Email', category: 'licensing' },
  { value: 'agentLicenseNumber', label: 'Agent License Number', category: 'licensing' },
  { value: 'brokerLicenseNumber', label: 'Broker License Number', category: 'licensing' },
  { value: 'brokerCompany', label: 'Broker Company', category: 'licensing' },
  { value: 'purchaseContractExpiration', label: 'Contract Expiration', category: 'dates' },
  { value: 'closingDate', label: 'Closing Date', category: 'dates' },
  { value: 'inspectionDeadline', label: 'Inspection Deadline', category: 'dates' },
  { value: 'knownMaterialDefects', label: 'Known Material Defects', category: 'disclosure' },
  { value: 'hoa', label: 'HOA', category: 'disclosure' },
  { value: 'hoaFees', label: 'HOA Fees', category: 'disclosure' },
];

// US States
export const US_STATES = [
  { value: 'ALL', label: 'All States (Universal)' },
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

// Fetch all compliance rules
export function useComplianceRules(state?: string) {
  return useQuery({
    queryKey: ['compliance-rules', state],
    queryFn: async () => {
      const url = state && state !== 'all'
        ? `/api/compliance/rules?state=${state}`
        : '/api/compliance/rules';
      // api.get auto-unwraps data.data, so response is already the array
      const response = await api.get<ComplianceRule[]>(url);
      return Array.isArray(response) ? response : [];
    },
    retry: 1,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}

// Fetch a single rule
export function useComplianceRule(id: number) {
  return useQuery({
    queryKey: ['compliance-rule', id],
    queryFn: () => api.get<ComplianceRule>(`/api/compliance/rules/${id}`),
    enabled: !!id,
  });
}

// Fetch configured states
export function useConfiguredStates() {
  return useQuery({
    queryKey: ['compliance-states'],
    queryFn: async () => {
      // api.get auto-unwraps data.data, so response is already the array
      const response = await api.get<string[]>('/api/compliance/states');
      return Array.isArray(response) ? response : [];
    },
    retry: 1,
    staleTime: 30000,
  });
}

// Create a new rule
export function useCreateComplianceRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRulePayload) =>
      api.post<ComplianceRule>('/api/compliance/rules', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-rules'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-states'] });
    },
  });
}

// Update a rule
export function useUpdateComplianceRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateRulePayload }) =>
      api.put<ComplianceRule>(`/api/compliance/rules/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['compliance-rules'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-rule', id] });
    },
  });
}

// Delete a rule
export function useDeleteComplianceRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/compliance/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-rules'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-states'] });
    },
  });
}

// Toggle rule enabled/disabled
export function useToggleComplianceRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.put<ComplianceRule>(`/api/compliance/rules/${id}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-rules'] });
    },
  });
}

// Seed default rules
export function useSeedDefaultRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post('/api/compliance/seed', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-rules'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-states'] });
    },
  });
}

// ============================================================================
// AI-POWERED RULE GENERATION
// ============================================================================

export interface GeneratedRule {
  state: string;
  name: string;
  description?: string;
  category: string;
  field: string;
  operator: string;
  value?: string;
  severity: string;
  message: string;
  enabled: boolean;
  order: number;
}

export interface GenerateRulesResponse {
  description: string;
  state: string;
  suggestedRules: GeneratedRule[];
  count: number;
}

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  rule: {
    name: string;
    category: string;
    field: string;
    operator: string;
    value?: string;
    severity: string;
    message: string;
  };
}

// Generate rules from AI description
export function useGenerateRulesFromAI() {
  return useMutation({
    mutationFn: async ({ description, state }: { description: string; state?: string }) => {
      const response = await api.post<GenerateRulesResponse>('/api/compliance/rules/generate', {
        description,
        state: state || 'ALL',
      });
      return response;
    },
  });
}

// Fetch rule templates
export function useRuleTemplates() {
  return useQuery({
    queryKey: ['compliance-rule-templates'],
    queryFn: async () => {
      const response = await api.get<RuleTemplate[]>('/api/compliance/rules/templates');
      return Array.isArray(response) ? response : [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Create multiple rules at once (for AI-generated rules)
export function useCreateMultipleRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rules: CreateRulePayload[]) => {
      const results = await Promise.all(
        rules.map(rule => api.post<ComplianceRule>('/api/compliance/rules', rule))
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-rules'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-states'] });
    },
  });
}

// ============================================================================
// COMPLIANCE DASHBOARD & ANALYTICS
// ============================================================================

export interface ContractOcrSummary {
  success: boolean;
  confidence: number;
  extractedFields?: {
    assignable?: boolean;
    marketingClauseFound?: boolean;
    sellerName?: string;
    buyerName?: string;
    propertyAddress?: string;
    purchasePrice?: number;
    closingDate?: string;
    contractExpirationDate?: string;
    [key: string]: any;
  };
  fieldEvidence?: Record<string, { page?: number; snippet?: string; confidence?: number }>;
  pageCount?: number;
  processedAt?: string;
  source?: 'vision' | 'tesseract' | 'cache';
  model?: string;
  error?: string;
}

export interface ComplianceIssue {
  issueId?: string;
  ruleId: number;
  ruleName: string;
  category: string;
  field: string;
  severity: 'critical' | 'warning' | 'info';
  baseSeverity?: 'critical' | 'warning' | 'info';
  message: string;
  currentValue?: any;
  expectedValue?: string;
  valueSource?: 'property' | 'contact' | 'ocr' | 'document' | 'evidence' | 'system';
  sourceDetail?: {
    role?: string;
    contactId?: number;
    documentId?: number;
    templateId?: number;
    docuSealTemplateId?: number;
    submissionId?: number;
  };
  links?: Record<string, string>;
  dataQuality?: {
    status: 'known' | 'unknown' | 'inferred';
    source?: string | null;
    confidence?: number | null;
    updatedAt?: string;
  };
}

export interface ComplianceCheckDetail {
  id: number;
  propertyId: number;
  status: 'Green' | 'Yellow' | 'Red';
  state: string;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  issues: ComplianceIssue[];
  passedChecks: string[];
  checkedAt: string;
  ruleVersionHash?: string;
  propertySnapshot?: Record<string, any>;
  evidenceSnapshot?: Record<string, any>;
  ruleSnapshot?: Record<string, any>[];
}

export interface ComplianceIssueReview {
  id: number;
  propertyId: number;
  checkId: number;
  issueId: string;
  ruleId?: number | null;
  decision: 'confirmed' | 'dismissed' | 'overridden';
  reviewerId?: string | null;
  reviewerEmail?: string | null;
  notes?: string | null;
  overrideSeverity?: 'critical' | 'warning' | 'info' | null;
  overrideMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  summary: {
    total: number;
    passed: number;
    failed: number;
    unchecked: number;
    passRate: number;
    criticalIssues: number;
    warningIssues: number;
    infoIssues: number;
    totalRules: number;
  };
  issuesByState: Record<string, { critical: number; warning: number; info: number; total: number }>;
  issuesByCategory: Record<string, number>;
  rulesByState: Record<string, number>;
  recentChecks: Array<{
    propertyId: number;
    state: string;
    status: string;
    issues: number;
    date: string;
    ocr?: ContractOcrSummary | null;
  }>;
}

export interface BulkCheckResult {
  checked: number;
  total: number;
  passed: number;
  failed: number;
  limited: boolean;
  results: Array<{
    propertyId: number;
    address: string;
    state: string;
    status: 'passed' | 'warning' | 'critical';
    issueCount: number;
    criticalCount: number;
    warningCount: number;
  }>;
}

export interface RuleTestResult {
  rule: {
    id: number;
    name: string;
    state: string;
    field: string;
    operator: string;
    value?: string;
    severity: string;
  };
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  properties: Array<{
    id: number;
    address: string;
    state: string;
    wouldPass: boolean;
    fieldValue: any;
    reason?: string;
  }>;
}

export interface LatestComplianceCheck {
  id: number;
  propertyId: number;
  status: 'Green' | 'Yellow' | 'Red';
  checkedAt: string;
  issuesCount: number;
  ruleVersionHash?: string;
  contractOcr?: ContractOcrSummary | null;
}

// Fetch dashboard statistics
export function useComplianceDashboard() {
  return useQuery({
    queryKey: ['compliance-dashboard'],
    queryFn: async () => {
      const response = await api.get<DashboardStats>('/api/compliance/dashboard');
      return response;
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });
}

// Fetch latest compliance check (with OCR summary) for a property
export function useLatestComplianceCheck(propertyId?: string | number) {
  return useQuery({
    queryKey: ['compliance-latest-check', propertyId],
    queryFn: () => api.get<LatestComplianceCheck | null>(`/api/compliance/checks/latest/${propertyId}`),
    enabled: !!propertyId,
    staleTime: 30000,
  });
}

// Fetch a compliance check by ID (full detail)
export function useComplianceCheck(checkId?: number) {
  return useQuery({
    queryKey: ['compliance-check', checkId],
    queryFn: () => api.get<ComplianceCheckDetail>(`/api/compliance/checks/${checkId}`),
    enabled: !!checkId,
    staleTime: 30000,
  });
}

// Fetch issue reviews for a compliance check
export function useComplianceIssueReviews(checkId?: number) {
  return useQuery({
    queryKey: ['compliance-check-reviews', checkId],
    queryFn: () => api.get<ComplianceIssueReview[]>(`/api/compliance/checks/${checkId}/reviews`),
    enabled: !!checkId,
    staleTime: 30000,
  });
}

// Review a compliance issue
export function useReviewComplianceIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      checkId: number;
      issueId: string;
      decision: 'confirmed' | 'dismissed' | 'overridden';
      notes?: string | null;
      overrideSeverity?: 'critical' | 'warning' | 'info' | null;
      overrideMessage?: string | null;
    }) => {
      const { checkId, issueId, ...payload } = params;
      return api.post<ComplianceIssueReview>(
        `/api/compliance/checks/${checkId}/issues/${issueId}/review`,
        payload
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['compliance-check-reviews', vars.checkId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-check', vars.checkId] });
    },
  });
}

// Bulk compliance check
export function useBulkComplianceCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { state?: string; propertyIds?: number[]; uncheckedOnly?: boolean }) => {
      const response = await api.post<BulkCheckResult>('/api/compliance/bulk-check', params);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

// Test a rule against properties
export function useTestRule() {
  return useMutation({
    mutationFn: async (ruleId: number) => {
      const response = await api.get<RuleTestResult>(`/api/compliance/rules/${ruleId}/test`);
      return response;
    },
  });
}
