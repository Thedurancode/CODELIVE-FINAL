/**
 * Import Wizard Controller
 *
 * API endpoints for the data import wizard feature:
 * - File upload and parsing
 * - Field mapping
 * - Preview and validation
 * - Duplicate detection
 * - Final import commit
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { dataImportService } from '../services/DataImportService';
import { duplicateDetectionService } from '../services/DuplicateDetectionService';
import {
  ImportType,
  FieldMapping,
  DuplicateAction,
} from '../types/import';

// Temporary upload directory
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'imports');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Get available target fields for an import type
 */
export const getTargetFields = async (req: Request, res: Response) => {
  try {
    const { importType } = req.params as { importType: ImportType };

    if (!['deals', 'buyers'].includes(importType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import type. Must be "deals" or "buyers"',
        timestamp: new Date().toISOString(),
      });
    }

    const fields = dataImportService.getTargetFields(importType);

    res.json({
      success: true,
      data: fields,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Upload and parse a file for import
 */
export const uploadFile = async (req: Request, res: Response) => {
  try {
    const { importType } = req.body as { importType: ImportType };

    if (!importType || !['deals', 'buyers'].includes(importType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import type. Must be "deals" or "buyers"',
        timestamp: new Date().toISOString(),
      });
    }

    // Check for file in request
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        timestamp: new Date().toISOString(),
      });
    }

    const userId = (req as any).user?.id || 'anonymous';
    const filePath = req.file.path;

    // Initialize service if needed
    if (!dataImportService.isReady()) {
      await dataImportService.initialize();
    }

    // Parse the file
    const result = await dataImportService.parseFile(filePath, importType, userId);

    // Clean up uploaded file after parsing
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      data: {
        sessionId: result.sessionId,
        fileName: req.file.originalname,
        format: result.format,
        sourceColumns: result.sourceColumns,
        suggestedMappings: result.suggestedMappings,
        totalRows: result.totalRows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get current session status and data
 */
export const getSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = dataImportService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        importType: session.importType,
        format: session.format,
        fileName: session.fileName,
        status: session.status,
        sourceColumns: session.sourceColumns,
        fieldMappings: session.fieldMappings,
        validationResult: session.validationResult,
        duplicateResult: session.duplicateResult,
        importResult: session.importResult,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update field mappings for a session
 */
export const updateMappings = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { mappings } = req.body as { mappings: FieldMapping[] };

    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({
        success: false,
        error: 'Mappings array is required',
        timestamp: new Date().toISOString(),
      });
    }

    await dataImportService.updateMappings(sessionId, mappings);

    res.json({
      success: true,
      message: 'Mappings updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Generate preview with validation
 */
export const getPreview = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string, 10) || 10;

    const result = await dataImportService.generatePreview(sessionId, limit);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Detect duplicates in the import data
 */
export const detectDuplicates = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = dataImportService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired',
        timestamp: new Date().toISOString(),
      });
    }

    const data = dataImportService.getSessionData(sessionId);
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Session data not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Initialize duplicate detection service if needed
    if (!duplicateDetectionService.isReady()) {
      await duplicateDetectionService.initialize();
    }

    // Transform raw data to import format based on mappings
    const transformedData = data.map(row => {
      const transformed: Record<string, unknown> = {};
      for (const mapping of session.fieldMappings) {
        const value = row[mapping.sourceColumn];
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
      return transformed;
    });

    const result = await duplicateDetectionService.detectDuplicates(
      session.importType,
      transformedData,
      1
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update duplicate handling actions
 */
export const updateDuplicateActions = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { actions } = req.body as { actions: Record<number, DuplicateAction> };

    if (!actions || typeof actions !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Actions object is required',
        timestamp: new Date().toISOString(),
      });
    }

    dataImportService.updateDuplicateActions(sessionId, actions);

    res.json({
      success: true,
      message: 'Duplicate actions updated',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Commit the import and create records
 */
export const commitImport = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const result = await dataImportService.commitImport(sessionId);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Cancel and delete an import session
 */
export const cancelImport = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    dataImportService.deleteSession(sessionId);

    res.json({
      success: true,
      message: 'Import session cancelled',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};
