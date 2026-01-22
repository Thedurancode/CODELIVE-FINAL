/**
 * Import Wizard Types (Frontend)
 * Types for the data import wizard feature
 */

// Import types
export type ImportType = 'deals' | 'buyers';
export type ImportFormat = 'csv' | 'xlsx' | 'xls';
export type ImportStatus = 'pending' | 'validating' | 'mapping' | 'previewing' | 'detecting_duplicates' | 'importing' | 'completed' | 'failed';
export type DuplicateAction = 'skip' | 'update' | 'create_new';
export type FieldDataType = 'string' | 'number' | 'boolean' | 'date' | 'email' | 'phone' | 'currency' | 'percentage' | 'array';
export type ValidationSeverity = 'error' | 'warning' | 'info';

// Step in the wizard
export type WizardStep = 'upload' | 'mapping' | 'preview' | 'duplicates' | 'results';

// Target field definition
export interface TargetField {
  key: string;
  label: string;
  dataType: FieldDataType;
  required: boolean;
  description?: string;
  example?: string;
  aliases?: string[];
}

// Source column from uploaded file
export interface SourceColumn {
  index: number;
  name: string;
  sampleValues: string[];
  detectedType: FieldDataType;
  isEmpty: boolean;
}

// Field mapping
export interface FieldMapping {
  sourceColumn: string;
  targetField: string;
  transform?: FieldTransform;
  defaultValue?: string | number | boolean;
}

// Field transform
export interface FieldTransform {
  type: 'uppercase' | 'lowercase' | 'trim' | 'phone_format' | 'date_format' | 'currency_parse' | 'boolean_parse' | 'split' | 'custom';
  options?: Record<string, unknown>;
}

// Validation issue
export interface ValidationIssue {
  row: number;
  column: string;
  value: string;
  message: string;
  severity: ValidationSeverity;
  suggestion?: string;
}

// Validation result
export interface ValidationResult {
  isValid: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

// Preview row
export interface PreviewRow {
  rowNumber: number;
  original: Record<string, string>;
  transformed: Record<string, unknown>;
  issues: ValidationIssue[];
  isValid: boolean;
}

// Duplicate match
export interface DuplicateMatch {
  rowNumber: number;
  importData: Record<string, unknown>;
  existingRecord: {
    id: string;
    data: Record<string, unknown>;
  };
  matchedFields: string[];
  confidence: number;
  suggestedAction: DuplicateAction;
}

// Duplicate detection result
export interface DuplicateDetectionResult {
  totalChecked: number;
  duplicatesFound: number;
  matches: DuplicateMatch[];
  uniqueRecords: number;
}

// Import result
export interface ImportResult {
  success: boolean;
  totalProcessed: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{
    row: number;
    error: string;
  }>;
  importedIds: string[];
  duration: number;
}

// Import session
export interface ImportSession {
  id: string;
  importType: ImportType;
  format: ImportFormat;
  fileName: string;
  status: ImportStatus;
  sourceColumns: SourceColumn[];
  fieldMappings: FieldMapping[];
  validationResult?: ValidationResult;
  duplicateResult?: DuplicateDetectionResult;
  importResult?: ImportResult;
  createdAt: string;
  expiresAt: string;
}

// Upload response
export interface UploadResponse {
  sessionId: string;
  fileName: string;
  format: ImportFormat;
  sourceColumns: SourceColumn[];
  suggestedMappings: FieldMapping[];
  totalRows: number;
}

// Preview response
export interface PreviewResponse {
  rows: PreviewRow[];
  validation: ValidationResult;
}

// Wizard state
export interface ImportWizardState {
  step: WizardStep;
  importType: ImportType | null;
  sessionId: string | null;
  fileName: string | null;
  totalRows: number;
  sourceColumns: SourceColumn[];
  targetFields: TargetField[];
  mappings: FieldMapping[];
  preview: PreviewRow[];
  validation: ValidationResult | null;
  duplicates: DuplicateMatch[];
  duplicateActions: Record<number, DuplicateAction>;
  result: ImportResult | null;
  isLoading: boolean;
  error: string | null;
}
