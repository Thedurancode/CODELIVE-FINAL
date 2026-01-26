/**
 * Data Import Service
 *
 * Handles file parsing, field mapping, validation, and data transformation
 * for importing deals and buyers from CSV and Excel files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import {
  ImportType,
  ImportFormat,
  ImportSession,
  SourceColumn,
  FieldMapping,
  FieldDataType,
  TargetField,
  ValidationResult,
  ValidationIssue,
  PreviewRow,
  FieldTransform,
  ImportResult,
  DEAL_TARGET_FIELDS,
  BUYER_TARGET_FIELDS,
} from '../types/import';
import Property from '../models/Property';
import Buyer from '../models/Buyer';
import BuyerContact from '../models/BuyerContact';

// In-memory session storage (in production, use Redis or database)
const sessions = new Map<string, ImportSession>();
const sessionData = new Map<string, Record<string, string>[]>();

// Session expiration time (1 hour)
const SESSION_TTL = 60 * 60 * 1000;

class DataImportService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('✅ DataImportService initialized');

    // Clean up expired sessions periodically
    setInterval(() => this.cleanExpiredSessions(), 5 * 60 * 1000);
  }

  isReady(): boolean {
    return this.initialized;
  }

  private cleanExpiredSessions(): void {
    const now = new Date();
    for (const [id, session] of sessions.entries()) {
      if (session.expiresAt < now) {
        sessions.delete(id);
        sessionData.delete(id);
      }
    }
  }

  /**
   * Parse uploaded file and create import session
   */
  async parseFile(
    filePath: string,
    importType: ImportType,
    userId: string
  ): Promise<{
    sessionId: string;
    sourceColumns: SourceColumn[];
    suggestedMappings: FieldMapping[];
    totalRows: number;
    format: ImportFormat;
  }> {
    const ext = path.extname(filePath).toLowerCase().slice(1) as ImportFormat;
    const fileName = path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;

    let rawData: Record<string, string>[];

    if (ext === 'csv') {
      rawData = await this.parseCSV(filePath);
    } else if (ext === 'xlsx' || ext === 'xls') {
      rawData = await this.parseExcel(filePath);
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }

    if (rawData.length === 0) {
      throw new Error('File is empty or contains no valid data');
    }

    // Analyze columns
    const sourceColumns = this.analyzeColumns(rawData);

    // Get target fields based on import type
    const targetFields = importType === 'deals' ? DEAL_TARGET_FIELDS : BUYER_TARGET_FIELDS;

    // Generate suggested mappings
    const suggestedMappings = this.generateSuggestedMappings(sourceColumns, targetFields);

    // Create session
    const sessionId = uuidv4();
    const now = new Date();
    const session: ImportSession = {
      id: sessionId,
      userId,
      importType,
      format: ext,
      fileName,
      fileSize,
      status: 'mapping',
      sourceColumns,
      fieldMappings: suggestedMappings,
      duplicateActions: {},
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL),
    };

    sessions.set(sessionId, session);
    sessionData.set(sessionId, rawData);

    return {
      sessionId,
      sourceColumns,
      suggestedMappings,
      totalRows: rawData.length,
      format: ext,
    };
  }

  /**
   * Parse CSV file
   */
  private async parseCSV(filePath: string): Promise<Record<string, string>[]> {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    });
  }

  /**
   * Parse Excel file
   */
  private async parseExcel(filePath: string): Promise<Record<string, string>[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('No worksheets found in Excel file');
    }

    const data: Record<string, string>[] = [];
    const headers: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // Header row
        row.eachCell((cell, colNumber) => {
          headers[colNumber - 1] = String(cell.value || `Column${colNumber}`).trim();
        });
      } else {
        // Data row
        const rowData: Record<string, string> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1] || `Column${colNumber}`;
          rowData[header] = String(cell.value || '').trim();
        });

        // Only add non-empty rows
        if (Object.values(rowData).some(v => v.length > 0)) {
          data.push(rowData);
        }
      }
    });

    return data;
  }

  /**
   * Analyze source columns and detect data types
   */
  private analyzeColumns(data: Record<string, string>[]): SourceColumn[] {
    if (data.length === 0) return [];

    const columns = Object.keys(data[0]);
    const sampleSize = Math.min(10, data.length);

    return columns.map((name, index) => {
      const sampleValues = data.slice(0, sampleSize).map(row => row[name] || '');
      const nonEmptyValues = sampleValues.filter(v => v.length > 0);
      const isEmpty = nonEmptyValues.length === 0;
      const detectedType = isEmpty ? 'string' : this.detectDataType(nonEmptyValues);

      return {
        index,
        name,
        sampleValues: sampleValues.slice(0, 5),
        detectedType,
        isEmpty,
      };
    });
  }

  /**
   * Detect the most likely data type for a set of values
   */
  private detectDataType(values: string[]): FieldDataType {
    const patterns = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      phone: /^[\d\s\-\(\)\+\.]+$/,
      currency: /^\$?[\d,]+\.?\d{0,2}$/,
      percentage: /^\d+\.?\d*%$/,
      date: /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/,
      number: /^-?\d+\.?\d*$/,
      boolean: /^(true|false|yes|no|1|0|y|n)$/i,
    };

    let scores: Record<FieldDataType, number> = {
      string: 0,
      number: 0,
      boolean: 0,
      date: 0,
      email: 0,
      phone: 0,
      currency: 0,
      percentage: 0,
      array: 0,
    };

    for (const value of values) {
      if (patterns.email.test(value)) scores.email++;
      else if (patterns.currency.test(value)) scores.currency++;
      else if (patterns.percentage.test(value)) scores.percentage++;
      else if (patterns.phone.test(value) && value.length >= 7) scores.phone++;
      else if (patterns.date.test(value)) scores.date++;
      else if (patterns.boolean.test(value)) scores.boolean++;
      else if (patterns.number.test(value)) scores.number++;
      else scores.string++;
    }

    // Find the type with highest score
    const entries = Object.entries(scores) as [FieldDataType, number][];
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }

  /**
   * Generate suggested field mappings based on column names
   */
  private generateSuggestedMappings(
    sourceColumns: SourceColumn[],
    targetFields: TargetField[]
  ): FieldMapping[] {
    const mappings: FieldMapping[] = [];
    const usedTargets = new Set<string>();

    for (const column of sourceColumns) {
      if (column.isEmpty) continue;

      const normalizedName = column.name.toLowerCase().replace(/[_\-\s]+/g, ' ').trim();

      // Find matching target field
      let bestMatch: { field: TargetField; score: number } | null = null;

      for (const field of targetFields) {
        if (usedTargets.has(field.key)) continue;

        let score = 0;
        const normalizedLabel = field.label.toLowerCase();
        const normalizedKey = field.key.toLowerCase().replace(/\./g, ' ');

        // Exact match
        if (normalizedName === normalizedLabel || normalizedName === normalizedKey) {
          score = 100;
        }
        // Check aliases
        else if (field.aliases) {
          for (const alias of field.aliases) {
            if (normalizedName === alias.toLowerCase()) {
              score = 90;
              break;
            }
            if (normalizedName.includes(alias.toLowerCase()) || alias.toLowerCase().includes(normalizedName)) {
              score = Math.max(score, 70);
            }
          }
        }
        // Partial match
        else if (normalizedName.includes(normalizedLabel) || normalizedLabel.includes(normalizedName)) {
          score = 60;
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { field, score };
        }
      }

      if (bestMatch && bestMatch.score >= 60) {
        usedTargets.add(bestMatch.field.key);
        mappings.push({
          sourceColumn: column.name,
          targetField: bestMatch.field.key,
        });
      }
    }

    return mappings;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ImportSession | null {
    return sessions.get(sessionId) || null;
  }

  /**
   * Update field mappings for a session
   */
  async updateMappings(sessionId: string, mappings: FieldMapping[]): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.fieldMappings = mappings;
    session.status = 'previewing';
    session.updatedAt = new Date();
  }

  /**
   * Generate preview with validation
   */
  async generatePreview(sessionId: string, limit: number = 10): Promise<{
    rows: PreviewRow[];
    validation: ValidationResult;
  }> {
    const session = sessions.get(sessionId);
    const data = sessionData.get(sessionId);

    if (!session || !data) {
      throw new Error('Session not found');
    }

    const targetFields = session.importType === 'deals' ? DEAL_TARGET_FIELDS : BUYER_TARGET_FIELDS;
    const fieldMap = new Map(targetFields.map(f => [f.key, f]));

    const allIssues: ValidationIssue[] = [];
    const previewRows: PreviewRow[] = [];

    // Process all rows for validation but only return limited preview
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 1;
      const rowIssues: ValidationIssue[] = [];
      const transformed: Record<string, unknown> = {};

      // Apply mappings
      for (const mapping of session.fieldMappings) {
        const sourceValue = row[mapping.sourceColumn] || '';
        const targetField = fieldMap.get(mapping.targetField);

        if (!targetField) continue;

        // Validate and transform
        const { value, issues } = this.validateAndTransform(
          sourceValue,
          targetField,
          mapping,
          rowNumber
        );

        transformed[mapping.targetField] = value;
        rowIssues.push(...issues);
      }

      // Check required fields
      for (const field of targetFields) {
        if (field.required) {
          const hasMapping = session.fieldMappings.some(m => m.targetField === field.key);
          const value = transformed[field.key];

          if (!hasMapping || value === undefined || value === null || value === '') {
            rowIssues.push({
              row: rowNumber,
              column: field.key,
              value: '',
              message: `Required field "${field.label}" is missing`,
              severity: 'error',
            });
          }
        }
      }

      allIssues.push(...rowIssues);

      if (i < limit) {
        previewRows.push({
          rowNumber,
          original: row,
          transformed,
          issues: rowIssues,
          isValid: rowIssues.filter(i => i.severity === 'error').length === 0,
        });
      }
    }

    const errors = allIssues.filter(i => i.severity === 'error');
    const warnings = allIssues.filter(i => i.severity === 'warning');

    const validation: ValidationResult = {
      isValid: errors.length === 0,
      totalRows: data.length,
      validRows: data.length - new Set(errors.map(e => e.row)).size,
      invalidRows: new Set(errors.map(e => e.row)).size,
      issues: allIssues,
      summary: {
        errors: errors.length,
        warnings: warnings.length,
        info: allIssues.filter(i => i.severity === 'info').length,
      },
    };

    session.validationResult = validation;
    session.status = 'detecting_duplicates';
    session.updatedAt = new Date();

    return { rows: previewRows, validation };
  }

  /**
   * Validate and transform a single value
   */
  private validateAndTransform(
    value: string,
    field: TargetField,
    mapping: FieldMapping,
    rowNumber: number
  ): { value: unknown; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];
    let transformedValue: unknown = value;

    // Apply transform if specified
    if (mapping.transform) {
      transformedValue = this.applyTransform(value, mapping.transform);
    }

    // Apply default if empty
    if ((transformedValue === '' || transformedValue === null || transformedValue === undefined) && mapping.defaultValue !== undefined) {
      transformedValue = mapping.defaultValue;
    }

    // Type-specific validation and conversion
    switch (field.dataType) {
      case 'number':
        if (value !== '') {
          const num = parseFloat(String(transformedValue).replace(/[,$]/g, ''));
          if (isNaN(num)) {
            issues.push({
              row: rowNumber,
              column: mapping.sourceColumn,
              value,
              message: `Invalid number for ${field.label}`,
              severity: 'error',
            });
          } else {
            transformedValue = num;
          }
        } else {
          transformedValue = null;
        }
        break;

      case 'currency':
        if (value !== '') {
          const amount = parseFloat(String(transformedValue).replace(/[$,]/g, ''));
          if (isNaN(amount)) {
            issues.push({
              row: rowNumber,
              column: mapping.sourceColumn,
              value,
              message: `Invalid currency for ${field.label}`,
              severity: 'error',
            });
          } else {
            transformedValue = amount;
          }
        } else {
          transformedValue = null;
        }
        break;

      case 'boolean':
        if (value !== '') {
          const lower = String(transformedValue).toLowerCase();
          transformedValue = ['true', 'yes', '1', 'y'].includes(lower);
        } else {
          transformedValue = null;
        }
        break;

      case 'email':
        if (value !== '') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(transformedValue))) {
            issues.push({
              row: rowNumber,
              column: mapping.sourceColumn,
              value,
              message: `Invalid email format for ${field.label}`,
              severity: 'warning',
            });
          }
        } else {
          transformedValue = null;
        }
        break;

      case 'phone':
        if (value !== '') {
          // Normalize phone number
          const digits = String(transformedValue).replace(/\D/g, '');
          if (digits.length < 7) {
            issues.push({
              row: rowNumber,
              column: mapping.sourceColumn,
              value,
              message: `Invalid phone number for ${field.label}`,
              severity: 'warning',
            });
          } else {
            transformedValue = digits;
          }
        } else {
          transformedValue = null;
        }
        break;

      case 'array':
        if (value !== '') {
          // Split by comma, semicolon, or pipe
          transformedValue = String(transformedValue)
            .split(/[,;|]/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        } else {
          transformedValue = [];
        }
        break;

      case 'date':
        if (value !== '') {
          const date = new Date(String(transformedValue));
          if (isNaN(date.getTime())) {
            issues.push({
              row: rowNumber,
              column: mapping.sourceColumn,
              value,
              message: `Invalid date format for ${field.label}`,
              severity: 'warning',
            });
          } else {
            transformedValue = date;
          }
        } else {
          transformedValue = null;
        }
        break;

      default:
        // String - just trim
        transformedValue = String(transformedValue).trim() || null;
    }

    return { value: transformedValue, issues };
  }

  /**
   * Apply a field transform
   */
  private applyTransform(value: string, transform: FieldTransform): string {
    switch (transform.type) {
      case 'uppercase':
        return value.toUpperCase();
      case 'lowercase':
        return value.toLowerCase();
      case 'trim':
        return value.trim();
      case 'phone_format':
        return value.replace(/\D/g, '');
      case 'currency_parse':
        return value.replace(/[$,]/g, '');
      default:
        return value;
    }
  }

  /**
   * Commit the import and create records
   */
  async commitImport(sessionId: string): Promise<ImportResult> {
    const session = sessions.get(sessionId);
    const data = sessionData.get(sessionId);

    if (!session || !data) {
      throw new Error('Session not found');
    }

    const startTime = Date.now();
    const result: ImportResult = {
      success: true,
      totalProcessed: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      importedIds: [],
      duration: 0,
    };

    session.status = 'importing';
    session.updatedAt = new Date();

    try {
      if (session.importType === 'deals') {
        await this.importDeals(session, data, result);
      } else {
        await this.importBuyers(session, data, result);
      }

      result.success = result.failed === 0;
      result.duration = Date.now() - startTime;

      session.importResult = result;
      session.status = 'completed';
      session.updatedAt = new Date();

      return result;
    } catch (error) {
      session.status = 'failed';
      session.updatedAt = new Date();
      throw error;
    }
  }

  /**
   * Import deals from session data
   */
  private async importDeals(
    session: ImportSession,
    data: Record<string, string>[],
    result: ImportResult
  ): Promise<void> {
    const targetFields = DEAL_TARGET_FIELDS;
    const fieldMap = new Map(targetFields.map(f => [f.key, f]));

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 1;
      result.totalProcessed++;

      try {
        // Check duplicate action
        const action = session.duplicateActions[rowNumber] || 'create_new';
        if (action === 'skip') {
          result.skipped++;
          continue;
        }

        // Transform row data
        const transformed: Record<string, unknown> = {};
        for (const mapping of session.fieldMappings) {
          const sourceValue = row[mapping.sourceColumn] || '';
          const targetField = fieldMap.get(mapping.targetField);
          if (!targetField) continue;

          const { value } = this.validateAndTransform(sourceValue, targetField, mapping, rowNumber);

          // Handle nested fields (e.g., address.houseNumber)
          if (mapping.targetField.includes('.')) {
            const [parent, child] = mapping.targetField.split('.');
            if (!transformed[parent]) {
              transformed[parent] = {};
            }
            (transformed[parent] as Record<string, unknown>)[child] = value;
          } else {
            transformed[mapping.targetField] = value;
          }
        }

        // Create property
        const property = await Property.create({
          address: transformed.address as { houseNumber: string; street: string; address2?: string } || { houseNumber: '', street: '' },
          city: transformed.city as string || '',
          state: (transformed.state as string || '').toUpperCase(),
          zip: transformed.zip as string || '',
          county: transformed.county as string || null,
          propertyType: transformed.propertyType as string || null,
          bedroomCount: transformed.bedroomCount as number || null,
          bathroomCount: transformed.bathroomCount as number || null,
          livingSpaceSqFt: transformed.livingSpaceSqFt as number || null,
          lotSizeSqFt: transformed.lotSizeSqFt as number || null,
          yearBuilt: transformed.yearBuilt as number || null,
          stories: transformed.stories as number || null,
          purchaseContractPrice: transformed.purchaseContractPrice as number || null,
          arv: transformed.arv as number || null,
          renovationBudget: transformed.renovationBudget as number || null,
          reservePrice: transformed.reservePrice as number || null,
          occupancyStatus: transformed.occupancyStatus as string || null,
          monthlyRent: transformed.monthlyRent as number || null,
          pool: transformed.pool as boolean || false,
          garage: transformed.garage as string || null,
          hoa: transformed.hoa as boolean || false,
          hoaDuesAmount: transformed.hoaDuesAmount as number || null,
          wholesalerLlcName: transformed.wholesalerLlcName as string || null,
          llcOwnerEmail: transformed.llcOwnerEmail as string || null,
          propertyListingDescription: transformed.propertyListingDescription as string || null,
          processingState: 'created',
          approvalStatus: 'draft',
          tags: ['imported'],
        } as any);

        result.imported++;
        result.importedIds.push(String(property.id));
      } catch (error) {
        result.failed++;
        result.errors.push({
          row: rowNumber,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Import buyers from session data
   */
  private async importBuyers(
    session: ImportSession,
    data: Record<string, string>[],
    result: ImportResult
  ): Promise<void> {
    const targetFields = BUYER_TARGET_FIELDS;
    const fieldMap = new Map(targetFields.map(f => [f.key, f]));

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 1;
      result.totalProcessed++;

      try {
        // Check duplicate action
        const action = session.duplicateActions[rowNumber] || 'create_new';
        if (action === 'skip') {
          result.skipped++;
          continue;
        }

        // Transform row data
        const transformed: Record<string, unknown> = {};
        for (const mapping of session.fieldMappings) {
          const sourceValue = row[mapping.sourceColumn] || '';
          const targetField = fieldMap.get(mapping.targetField);
          if (!targetField) continue;

          const { value } = this.validateAndTransform(sourceValue, targetField, mapping, rowNumber);

          // Handle nested fields (e.g., contact.firstName)
          if (mapping.targetField.includes('.')) {
            const [parent, child] = mapping.targetField.split('.');
            if (!transformed[parent]) {
              transformed[parent] = {};
            }
            (transformed[parent] as Record<string, unknown>)[child] = value;
          } else {
            transformed[mapping.targetField] = value;
          }
        }

        // Create buyer
        const buyer = await Buyer.create({
          name: transformed.name as string,
          address: transformed.address as string || null,
          city: transformed.city as string || null,
          state: (transformed.state as string || '').toUpperCase() || null,
          zip: transformed.zip as string || null,
          buyingCounties: (transformed.buyingCounties as string[]) || [],
          buyingState: (transformed.buyingState as string || 'NJ').toUpperCase(),
          purchases6Month: transformed.purchases6Month as number || 0,
          status: (transformed.status as 'active' | 'inactive' | 'archived') || 'active',
          notes: transformed.notes as string || null,
          tags: (transformed.tags as string[]) || ['imported'],
        });

        // Create contact if contact info provided
        const contact = transformed.contact as Record<string, unknown> | undefined;
        if (contact && (contact.firstName || contact.lastName || contact.email || contact.phone)) {
          await BuyerContact.create({
            buyerId: buyer.id,
            personIndex: 1,
            firstName: contact.firstName as string || null,
            lastName: contact.lastName as string || null,
            phones: contact.phone ? [{ number: contact.phone as string, type: null, lastReported: null }] : [],
            emails: contact.email ? [contact.email as string] : [],
            isPrimary: true,
          });
        }

        result.imported++;
        result.importedIds.push(buyer.id);
      } catch (error) {
        result.failed++;
        result.errors.push({
          row: rowNumber,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Get target fields for an import type
   */
  getTargetFields(importType: ImportType): TargetField[] {
    return importType === 'deals' ? DEAL_TARGET_FIELDS : BUYER_TARGET_FIELDS;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    sessions.delete(sessionId);
    sessionData.delete(sessionId);
  }

  /**
   * Get raw data for a session
   */
  getSessionData(sessionId: string): Record<string, string>[] | null {
    return sessionData.get(sessionId) || null;
  }

  /**
   * Update duplicate actions
   */
  updateDuplicateActions(sessionId: string, actions: Record<number, 'skip' | 'update' | 'create_new'>): void {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    session.duplicateActions = actions;
    session.updatedAt = new Date();
  }
}

export const dataImportService = new DataImportService();
export default dataImportService;
