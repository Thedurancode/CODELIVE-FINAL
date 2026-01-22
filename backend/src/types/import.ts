/**
 * Import Wizard Types
 * Types for the data import wizard feature supporting CSV, Excel, and CRM formats
 */

// Supported import types
export type ImportType = 'deals' | 'buyers';

// Supported file formats
export type ImportFormat = 'csv' | 'xlsx' | 'xls';

// Import status for tracking
export type ImportStatus = 'pending' | 'validating' | 'mapping' | 'previewing' | 'detecting_duplicates' | 'importing' | 'completed' | 'failed';

// Duplicate action options
export type DuplicateAction = 'skip' | 'update' | 'create_new';

// Field data types for validation
export type FieldDataType = 'string' | 'number' | 'boolean' | 'date' | 'email' | 'phone' | 'currency' | 'percentage' | 'array';

// Validation severity levels
export type ValidationSeverity = 'error' | 'warning' | 'info';

// Field definition for target schema
export interface TargetField {
  key: string;
  label: string;
  dataType: FieldDataType;
  required: boolean;
  description?: string;
  example?: string;
  aliases?: string[]; // Common alternative names for auto-mapping
}

// Source column from uploaded file
export interface SourceColumn {
  index: number;
  name: string;
  sampleValues: string[];
  detectedType: FieldDataType;
  isEmpty: boolean;
}

// Field mapping from source to target
export interface FieldMapping {
  sourceColumn: string;
  targetField: string;
  transform?: FieldTransform;
  defaultValue?: string | number | boolean;
}

// Field transformation options
export interface FieldTransform {
  type: 'uppercase' | 'lowercase' | 'trim' | 'phone_format' | 'date_format' | 'currency_parse' | 'boolean_parse' | 'split' | 'custom';
  options?: Record<string, unknown>;
}

// Validation error/warning for a single cell
export interface ValidationIssue {
  row: number;
  column: string;
  value: string;
  message: string;
  severity: ValidationSeverity;
  suggestion?: string;
}

// Validation result for the entire file
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

// Preview row with transformed data
export interface PreviewRow {
  rowNumber: number;
  original: Record<string, string>;
  transformed: Record<string, unknown>;
  issues: ValidationIssue[];
  isValid: boolean;
}

// Duplicate match information
export interface DuplicateMatch {
  rowNumber: number;
  importData: Record<string, unknown>;
  existingRecord: {
    id: string;
    data: Record<string, unknown>;
  };
  matchedFields: string[];
  confidence: number; // 0-100
  suggestedAction: DuplicateAction;
}

// Duplicate detection result
export interface DuplicateDetectionResult {
  totalChecked: number;
  duplicatesFound: number;
  matches: DuplicateMatch[];
  uniqueRecords: number;
}

// Import session state
export interface ImportSession {
  id: string;
  userId: string;
  importType: ImportType;
  format: ImportFormat;
  fileName: string;
  fileSize: number;
  status: ImportStatus;
  sourceColumns: SourceColumn[];
  fieldMappings: FieldMapping[];
  validationResult?: ValidationResult;
  duplicateResult?: DuplicateDetectionResult;
  duplicateActions: Record<number, DuplicateAction>; // rowNumber -> action
  importResult?: ImportResult;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

// Final import result
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
  duration: number; // milliseconds
}

// Request/Response DTOs
export interface UploadFileRequest {
  importType: ImportType;
}

export interface UploadFileResponse {
  sessionId: string;
  fileName: string;
  format: ImportFormat;
  sourceColumns: SourceColumn[];
  suggestedMappings: FieldMapping[];
  totalRows: number;
}

export interface SetMappingsRequest {
  sessionId: string;
  mappings: FieldMapping[];
}

export interface PreviewRequest {
  sessionId: string;
  limit?: number;
}

export interface PreviewResponse {
  rows: PreviewRow[];
  validation: ValidationResult;
}

export interface DetectDuplicatesRequest {
  sessionId: string;
}

export interface DetectDuplicatesResponse {
  result: DuplicateDetectionResult;
}

export interface SetDuplicateActionsRequest {
  sessionId: string;
  actions: Record<number, DuplicateAction>;
}

export interface CommitImportRequest {
  sessionId: string;
}

export interface CommitImportResponse {
  result: ImportResult;
}

// Target field schemas for deals and buyers
export const DEAL_TARGET_FIELDS: TargetField[] = [
  // Address
  { key: 'address.houseNumber', label: 'House Number', dataType: 'string', required: true, aliases: ['house number', 'street number', 'house #', 'street #'] },
  { key: 'address.street', label: 'Street', dataType: 'string', required: true, aliases: ['street name', 'street address'] },
  { key: 'address.address2', label: 'Address Line 2', dataType: 'string', required: false, aliases: ['unit', 'apt', 'suite', 'address2', 'address 2'] },
  { key: 'city', label: 'City', dataType: 'string', required: true, aliases: ['town', 'municipality'] },
  { key: 'state', label: 'State', dataType: 'string', required: true, aliases: ['st', 'province'] },
  { key: 'zip', label: 'ZIP Code', dataType: 'string', required: true, aliases: ['zipcode', 'zip code', 'postal code', 'postal'] },
  { key: 'county', label: 'County', dataType: 'string', required: false, aliases: ['county name'] },

  // Property Details
  { key: 'propertyType', label: 'Property Type', dataType: 'string', required: false, aliases: ['type', 'prop type', 'property_type'] },
  { key: 'bedroomCount', label: 'Bedrooms', dataType: 'number', required: false, aliases: ['beds', 'bed', 'br', 'bedroom', 'bedrooms'] },
  { key: 'bathroomCount', label: 'Bathrooms', dataType: 'number', required: false, aliases: ['baths', 'bath', 'ba', 'bathroom', 'bathrooms'] },
  { key: 'livingSpaceSqFt', label: 'Square Footage', dataType: 'number', required: false, aliases: ['sqft', 'sq ft', 'square feet', 'living space', 'area'] },
  { key: 'lotSizeSqFt', label: 'Lot Size (SqFt)', dataType: 'number', required: false, aliases: ['lot size', 'lot sqft', 'lot'] },
  { key: 'yearBuilt', label: 'Year Built', dataType: 'number', required: false, aliases: ['year', 'built'] },
  { key: 'stories', label: 'Stories', dataType: 'number', required: false, aliases: ['floors', 'levels'] },

  // Financial
  { key: 'purchaseContractPrice', label: 'Contract Price', dataType: 'currency', required: false, aliases: ['price', 'asking price', 'contract price', 'purchase price', 'asking'] },
  { key: 'arv', label: 'ARV', dataType: 'currency', required: false, aliases: ['after repair value', 'arv value', 'estimated value'] },
  { key: 'renovationBudget', label: 'Renovation Budget', dataType: 'currency', required: false, aliases: ['rehab', 'rehab cost', 'renovation', 'repair cost', 'repairs'] },
  { key: 'reservePrice', label: 'Reserve Price', dataType: 'currency', required: false, aliases: ['reserve', 'min price'] },

  // Occupancy
  { key: 'occupancyStatus', label: 'Occupancy Status', dataType: 'string', required: false, aliases: ['occupancy', 'occupied', 'vacancy'] },
  { key: 'monthlyRent', label: 'Monthly Rent', dataType: 'currency', required: false, aliases: ['rent', 'rental', 'rental income'] },

  // Features
  { key: 'pool', label: 'Pool', dataType: 'boolean', required: false, aliases: ['has pool', 'swimming pool'] },
  { key: 'garage', label: 'Garage', dataType: 'string', required: false, aliases: ['garage type', 'parking'] },
  { key: 'hoa', label: 'HOA', dataType: 'boolean', required: false, aliases: ['has hoa', 'homeowners association'] },
  { key: 'hoaDuesAmount', label: 'HOA Dues', dataType: 'currency', required: false, aliases: ['hoa amount', 'hoa fee', 'hoa dues amount'] },

  // Wholesaler Info
  { key: 'wholesalerLlcName', label: 'Wholesaler LLC', dataType: 'string', required: false, aliases: ['wholesaler', 'llc', 'company'] },
  { key: 'llcOwnerEmail', label: 'Wholesaler Email', dataType: 'email', required: false, aliases: ['email', 'contact email'] },

  // Notes
  { key: 'propertyListingDescription', label: 'Description', dataType: 'string', required: false, aliases: ['description', 'notes', 'comments', 'remarks'] },
];

export const BUYER_TARGET_FIELDS: TargetField[] = [
  { key: 'name', label: 'Buyer Name', dataType: 'string', required: true, aliases: ['buyer', 'buyer name', 'company', 'entity'] },
  { key: 'address', label: 'Address', dataType: 'string', required: false, aliases: ['mailing address', 'street address'] },
  { key: 'city', label: 'City', dataType: 'string', required: false, aliases: ['town'] },
  { key: 'state', label: 'State', dataType: 'string', required: false, aliases: ['st'] },
  { key: 'zip', label: 'ZIP Code', dataType: 'string', required: false, aliases: ['zipcode', 'postal'] },
  { key: 'buyingCounties', label: 'Buying Counties', dataType: 'array', required: false, aliases: ['counties', 'target counties', 'buying areas'] },
  { key: 'buyingState', label: 'Buying State', dataType: 'string', required: false, aliases: ['target state', 'state buying'] },
  { key: 'purchases6Month', label: 'Purchases (6 Mo)', dataType: 'number', required: false, aliases: ['purchases', '6 month purchases', 'transaction count'] },
  { key: 'status', label: 'Status', dataType: 'string', required: false, aliases: ['buyer status'] },
  { key: 'notes', label: 'Notes', dataType: 'string', required: false, aliases: ['comments', 'remarks'] },
  { key: 'tags', label: 'Tags', dataType: 'array', required: false, aliases: ['labels', 'categories'] },

  // Contact Info
  { key: 'contact.firstName', label: 'First Name', dataType: 'string', required: false, aliases: ['first', 'fname'] },
  { key: 'contact.lastName', label: 'Last Name', dataType: 'string', required: false, aliases: ['last', 'lname'] },
  { key: 'contact.phone', label: 'Phone', dataType: 'phone', required: false, aliases: ['phone number', 'tel', 'telephone'] },
  { key: 'contact.email', label: 'Email', dataType: 'email', required: false, aliases: ['email address', 'contact email'] },
];
