/**
 * FileAnalysisService
 *
 * Handles parsing and analysis of uploaded files (PDF, CSV, images, text).
 * Used by file tools for document analysis in chat.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseCSV } from 'csv-parse/sync';
import { logger } from '../../utils/logger';
import type { ParsedFileContent, TableData, AttachedFile } from './types';

// PDF parsing (optional - gracefully degrade if not available)
let pdfParse: ((buffer: Buffer) => Promise<{ text: string; numpages: number }>) | null = null;
try {
  pdfParse = require('pdf-parse');
} catch {
  logger.warn('pdf-parse not available, PDF parsing disabled');
}

/**
 * Supported file types for analysis
 */
export const SUPPORTED_MIME_TYPES = {
  // Documents
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/csv': 'csv',
  // Spreadsheets
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  // Images (for future OCR support)
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
} as const;

export type SupportedFileType = (typeof SUPPORTED_MIME_TYPES)[keyof typeof SUPPORTED_MIME_TYPES];

class FileAnalysisService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    logger.info('FileAnalysisService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Parse a file and extract its content
   */
  async parseFile(file: AttachedFile): Promise<ParsedFileContent> {
    const fileType = this.getFileType(file.mimeType);

    if (!fileType) {
      throw new Error(`Unsupported file type: ${file.mimeType}`);
    }

    switch (fileType) {
      case 'pdf':
        return this.parsePDF(file.path);
      case 'csv':
        return this.parseCSV(file.path);
      case 'text':
        return this.parseText(file.path);
      case 'excel':
        return this.parseExcel(file.path);
      case 'image':
        return this.parseImage(file.path);
      default:
        throw new Error(`Parser not implemented for type: ${fileType}`);
    }
  }

  /**
   * Parse multiple files
   */
  async parseFiles(files: AttachedFile[]): Promise<Map<string, ParsedFileContent>> {
    const results = new Map<string, ParsedFileContent>();

    for (const file of files) {
      try {
        const parsed = await this.parseFile(file);
        results.set(file.id, parsed);
      } catch (error) {
        logger.error({ error, fileId: file.id }, 'Failed to parse file');
        // Continue with other files
      }
    }

    return results;
  }

  /**
   * Get file type from MIME type
   */
  getFileType(mimeType: string): SupportedFileType | null {
    return (SUPPORTED_MIME_TYPES as Record<string, SupportedFileType>)[mimeType] || null;
  }

  /**
   * Check if file type is supported
   */
  isSupported(mimeType: string): boolean {
    return mimeType in SUPPORTED_MIME_TYPES;
  }

  /**
   * Parse PDF file
   */
  private async parsePDF(filePath: string): Promise<ParsedFileContent> {
    if (!pdfParse) {
      return {
        type: 'pdf',
        textContent: '[PDF parsing not available - install pdf-parse package]',
        metadata: { error: 'pdf-parse not installed' },
      };
    }

    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);

    const textContent = data.text.trim();
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;

    // Try to extract tables from text (basic heuristic)
    const tables = this.extractTablesFromText(textContent);

    return {
      type: 'pdf',
      textContent,
      tables,
      pageCount: data.numpages,
      wordCount,
      metadata: {
        pageCount: data.numpages,
      },
    };
  }

  /**
   * Parse CSV file
   */
  private async parseCSV(filePath: string): Promise<ParsedFileContent> {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse CSV
    const records = parseCSV(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    if (records.length === 0) {
      return {
        type: 'csv',
        textContent: content,
        tables: [],
        metadata: { rowCount: 0 },
      };
    }

    // Extract headers and rows
    const headers = Object.keys(records[0]);
    const rows = records.map((record) => headers.map((h) => record[h] || ''));

    const table: TableData = {
      headers,
      rows,
      name: path.basename(filePath, '.csv'),
    };

    return {
      type: 'csv',
      textContent: content,
      tables: [table],
      metadata: {
        rowCount: rows.length,
        columnCount: headers.length,
        headers,
      },
    };
  }

  /**
   * Parse plain text file
   */
  private async parseText(filePath: string): Promise<ParsedFileContent> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const lineCount = content.split('\n').length;

    return {
      type: 'text',
      textContent: content,
      wordCount,
      metadata: {
        lineCount,
        characterCount: content.length,
      },
    };
  }

  /**
   * Parse Excel file (placeholder - would need xlsx package)
   */
  private async parseExcel(filePath: string): Promise<ParsedFileContent> {
    // For now, return a placeholder
    // Full implementation would use 'xlsx' package
    return {
      type: 'excel',
      textContent: '[Excel parsing requires xlsx package - not yet implemented]',
      metadata: { error: 'xlsx not installed' },
    };
  }

  /**
   * Parse image file (placeholder for OCR)
   */
  private async parseImage(filePath: string): Promise<ParsedFileContent> {
    // For now, return metadata only
    // Full implementation would use tesseract.js for OCR
    const stats = fs.statSync(filePath);

    return {
      type: 'image',
      textContent: '[Image OCR not yet implemented - install tesseract.js for text extraction]',
      metadata: {
        size: stats.size,
        path: filePath,
      },
    };
  }

  /**
   * Extract tables from text (basic heuristic for PDF text)
   */
  private extractTablesFromText(text: string): TableData[] {
    const tables: TableData[] = [];
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // Look for lines that might be table rows (contain multiple tab/space separated values)
    let currentTable: { headers: string[]; rows: string[][] } | null = null;

    for (const line of lines) {
      // Check if line looks like a table row (multiple whitespace-separated columns)
      const parts = line.split(/\s{2,}|\t/).map((p) => p.trim()).filter(Boolean);

      if (parts.length >= 3) {
        if (!currentTable) {
          // Start new table with this as header
          currentTable = { headers: parts, rows: [] };
        } else if (parts.length === currentTable.headers.length) {
          // Add as row
          currentTable.rows.push(parts);
        } else {
          // Different column count - might be new table
          if (currentTable.rows.length > 0) {
            tables.push(currentTable);
          }
          currentTable = { headers: parts, rows: [] };
        }
      } else {
        // End current table if we have one
        if (currentTable && currentTable.rows.length > 0) {
          tables.push(currentTable);
          currentTable = null;
        }
      }
    }

    // Don't forget last table
    if (currentTable && currentTable.rows.length > 0) {
      tables.push(currentTable);
    }

    return tables;
  }

  /**
   * Summarize file content for context
   */
  summarizeContent(parsed: ParsedFileContent, maxLength: number = 2000): string {
    let summary = '';

    // Add type info
    summary += `[${parsed.type.toUpperCase()} Document]\n`;

    // Add metadata
    if (parsed.pageCount) {
      summary += `Pages: ${parsed.pageCount}\n`;
    }
    if (parsed.wordCount) {
      summary += `Words: ${parsed.wordCount}\n`;
    }

    // Add tables summary
    if (parsed.tables && parsed.tables.length > 0) {
      summary += `\nTables found: ${parsed.tables.length}\n`;
      for (const table of parsed.tables) {
        summary += `- ${table.name || 'Table'}: ${table.rows.length} rows, ${table.headers.length} columns\n`;
        summary += `  Headers: ${table.headers.join(', ')}\n`;
      }
    }

    // Add text preview
    if (parsed.textContent) {
      const textPreview =
        parsed.textContent.length > maxLength
          ? parsed.textContent.substring(0, maxLength) + '...'
          : parsed.textContent;
      summary += `\nContent Preview:\n${textPreview}`;
    }

    return summary;
  }

  /**
   * Clean up temp file after processing
   */
  async cleanupFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      logger.warn({ error, filePath }, 'Failed to cleanup temp file');
    }
  }
}

export const fileAnalysisService = new FileAnalysisService();
export default FileAnalysisService;
