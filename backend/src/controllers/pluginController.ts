/**
 * Plugin System Controller
 *
 * API endpoints for managing the extensible plugin system:
 * - Deal sources
 * - Buy boxes
 * - Automations
 * - Workflows
 * - Deal processing
 */

import { Request, Response } from 'express';
import {
  dealProcessingService,
  DealSourceConfig,
  BuyBox,
  Automation,
  Workflow,
  NormalizedDeal,
  pluginRegistry,
  FirecrawlDealSourcePlugin,
  FirecrawlSiteConfig,
} from '../plugins';
import { BulkSaveResult } from '../services/propertyService';
import { dealIntakeService } from '../services/DealIntakeService';
import { auctionSubmission, AuctionSiteConfig } from '../plugins/browser';
import Property from '../models/Property';
import EmailInbox from '../models/EmailInbox';
import DealSource from '../models/DealSource';
import { safeParseInt } from '../utils/security';
import { EmailDealSourcePlugin } from '../plugins/sources/EmailDealSourcePlugin';

// Request is just Request - user type is globally defined in Express namespace

// ============================================================================
// DEAL SOURCES
// ============================================================================

/**
 * Get available deal source plugin types
 */
export const getAvailableSourceTypes = async (req: Request, res: Response) => {
  try {
    const types = dealProcessingService.getAvailableSourceTypes();
    res.json({
      success: true,
      data: types,
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
 * Get all active deal sources
 */
export const getActiveSources = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    // Load sources from database
    const dbSources = userId
      ? await DealSource.findAll({
          where: { userId },
          order: [['createdAt', 'DESC']],
        })
      : await DealSource.findAll({
          order: [['createdAt', 'DESC']],
        });

    // Ensure all enabled DB sources are activated in memory
    for (const dbSource of dbSources) {
      if (dbSource.enabled) {
        const existing = pluginRegistry.getActiveSource(dbSource.id);
        if (!existing) {
          // Activate this source in memory
          const config: DealSourceConfig = {
            id: dbSource.id,
            name: dbSource.name,
            type: dbSource.type as any,
            enabled: dbSource.enabled,
            settings: dbSource.settings,
            createdAt: dbSource.createdAt,
            updatedAt: dbSource.updatedAt,
          };
          await pluginRegistry.activateDealSource(config);
        }
      }
    }

    // Return database sources (formatted to match frontend expectations)
    const sources = dbSources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      enabled: s.enabled,
      settings: s.settings,
      lastFetchAt: s.lastFetchAt,
      lastFetchStatus: s.lastFetchStatus,
      totalDealsIngested: s.totalDealsIngested,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    res.json({
      success: true,
      data: sources,
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
 * Add a new deal source
 */
export const addDealSource = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        timestamp: new Date().toISOString(),
      });
    }

    const { id, name, type, enabled, settings } = req.body;
    const sourceId = id || `source-${Date.now()}`;

    // Save to database first
    const dbSource = await DealSource.create({
      id: sourceId,
      userId,
      name,
      type,
      enabled: enabled !== false,
      settings: settings || {},
    });

    // Also activate in memory for immediate use
    const config: DealSourceConfig = {
      id: dbSource.id,
      name: dbSource.name,
      type: dbSource.type as any,
      enabled: dbSource.enabled,
      settings: dbSource.settings,
      createdAt: dbSource.createdAt,
      updatedAt: dbSource.updatedAt,
    };

    const result = await pluginRegistry.activateDealSource(config);

    if (!result.valid) {
      // If activation failed, still return success since it's saved to DB
      // It will be activated when fetched next time
      console.warn(`Source saved but activation failed: ${result.errors?.join(', ')}`);
    }

    res.status(201).json({
      success: true,
      data: {
        id: dbSource.id,
        name: dbSource.name,
        type: dbSource.type,
        enabled: dbSource.enabled,
        settings: dbSource.settings,
        createdAt: dbSource.createdAt,
        updatedAt: dbSource.updatedAt,
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
 * Remove a deal source
 */
export const removeDealSource = async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    // Delete from database first
    const deleted = await DealSource.destroy({
      where: { id: sourceId },
    });

    if (deleted === 0) {
      return res.status(404).json({
        success: false,
        error: `Source not found: ${sourceId}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Also remove from memory
    await dealProcessingService.removeDealSource(sourceId);

    res.json({
      success: true,
      message: `Source ${sourceId} removed`,
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
 * Fetch deals from a specific source
 */
export const fetchDealsFromSource = async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const result = await dealProcessingService.fetchDealsFromSource(sourceId);

    res.json({
      success: result.success,
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
 * Fetch deals from all sources
 */
export const fetchDealsFromAllSources = async (req: Request, res: Response) => {
  try {
    const results = await dealProcessingService.fetchDealsFromAllSources();
    const data: Record<string, any> = {};

    results.forEach((result, sourceId) => {
      data[sourceId] = result;
    });

    res.json({
      success: true,
      data,
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
 * Test email connection before saving
 */
export const testEmailConnection = async (req: Request, res: Response) => {
  try {
    const settings = req.body;

    // Create a temporary plugin to test connection
    const testPlugin = new EmailDealSourcePlugin();
    const result = await testPlugin.testConnection({
      id: 'test-connection',
      name: 'Test Connection',
      type: 'email',
      enabled: true,
      settings,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json({
      success: result.success,
      message: result.message,
      details: result.details,
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
 * Update an existing deal source
 */
export const updateDealSource = async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const updates = req.body;

    // Find source in database
    const dbSource = await DealSource.findByPk(sourceId);
    if (!dbSource) {
      return res.status(404).json({
        success: false,
        error: `Source not found: ${sourceId}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Merge settings
    const mergedSettings = {
      ...dbSource.settings,
      ...updates.settings,
    };

    // Update database record
    await dbSource.update({
      name: updates.name ?? dbSource.name,
      type: updates.type ?? dbSource.type,
      enabled: updates.enabled ?? dbSource.enabled,
      settings: mergedSettings,
    });

    // Remove from memory and re-activate with updated config
    await dealProcessingService.removeDealSource(sourceId);

    const updatedConfig: DealSourceConfig = {
      id: dbSource.id,
      name: dbSource.name,
      type: dbSource.type as any,
      enabled: dbSource.enabled,
      settings: dbSource.settings,
      createdAt: dbSource.createdAt,
      updatedAt: dbSource.updatedAt,
    };

    const result = await pluginRegistry.activateDealSource(updatedConfig);

    if (!result.valid) {
      console.warn(`Source updated in DB but activation failed: ${result.errors?.join(', ')}`);
    }

    res.json({
      success: true,
      data: {
        id: dbSource.id,
        name: dbSource.name,
        type: dbSource.type,
        enabled: dbSource.enabled,
        settings: dbSource.settings,
        createdAt: dbSource.createdAt,
        updatedAt: dbSource.updatedAt,
      },
      message: `Source ${sourceId} updated successfully`,
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
 * Get email inbox history for a source
 */
export const getEmailInbox = async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const limit = safeParseInt(req.query.limit, { min: 1, max: 200, defaultValue: 50 }) || 50;
    const offset = safeParseInt(req.query.offset, { min: 0, max: 10000, defaultValue: 0 }) || 0;
    const status = req.query.status as string | undefined;

    const where: any = { sourceId };
    if (status) {
      where.status = status;
    }

    const { count, rows } = await EmailInbox.findAndCountAll({
      where,
      order: [['receivedAt', 'DESC']],
      limit,
      offset,
    });

    res.json({
      success: true,
      data: {
        emails: rows,
        pagination: {
          total: count,
          limit,
          offset,
          hasMore: offset + rows.length < count,
        },
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
 * Get email inbox summary for a source
 */
export const getEmailInboxSummary = async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    const summary = await EmailInbox.getSourceSummary(sourceId);

    res.json({
      success: true,
      data: summary,
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
 * Handle incoming webhook for a deal source (email forwarding, webhook receiver, etc.)
 */
export const handleSourceWebhook = async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const headers: Record<string, string> = {};

    // Extract relevant headers
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }

    // Get raw body for signature verification (captured by express.json verify option)
    const rawBody = (req as any).rawBody as string | undefined;

    const result = await dealProcessingService.handleSourceWebhook(sourceId, req.body, headers, rawBody);

    res.json({
      success: result.success,
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

// ============================================================================
// BUY BOXES
// ============================================================================

/**
 * Get all buy boxes
 */
export const getAllBuyBoxes = async (req: Request, res: Response) => {
  try {
    const buyBoxes = dealProcessingService.getAllBuyBoxes();
    res.json({
      success: true,
      data: buyBoxes,
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
 * Add a buy box
 */
export const addBuyBox = async (req: Request, res: Response) => {
  try {
    const buyBox: BuyBox = {
      ...req.body,
      id: req.body.id || `buybox-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await dealProcessingService.addBuyBox(buyBox);

    res.status(201).json({
      success: true,
      data: buyBox,
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
 * Update a buy box
 */
export const updateBuyBox = async (req: Request, res: Response) => {
  try {
    const { buyBoxId } = req.params;
    const buyBox: BuyBox = {
      ...req.body,
      id: buyBoxId,
      updatedAt: new Date(),
    };

    await dealProcessingService.updateBuyBox(buyBox);

    res.json({
      success: true,
      data: buyBox,
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
 * Remove a buy box
 */
export const removeBuyBox = async (req: Request, res: Response) => {
  try {
    const { buyBoxId } = req.params;
    await dealProcessingService.removeBuyBox(buyBoxId);

    res.json({
      success: true,
      message: `Buy box ${buyBoxId} removed`,
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
 * Score a deal against buy boxes
 */
export const scoreDeal = async (req: Request, res: Response) => {
  try {
    const deal: NormalizedDeal = req.body;
    const results = await dealProcessingService.scoreDeal(deal);

    res.json({
      success: true,
      data: results,
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
 * Find best matching buy boxes
 */
export const findBestMatches = async (req: Request, res: Response) => {
  try {
    const deal: NormalizedDeal = req.body;
    // SECURITY: Safe parseInt with range validation
    const limit = safeParseInt(req.query.limit, { min: 1, max: 50, defaultValue: 5 }) || 5;
    const results = await dealProcessingService.findBestMatches(deal, limit);

    res.json({
      success: true,
      data: results,
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

// ============================================================================
// DEAL ANALYSIS
// ============================================================================

/**
 * Enrich a deal with external data
 */
export const enrichDeal = async (req: Request, res: Response) => {
  try {
    const deal: NormalizedDeal = req.body.deal;
    const providers = req.body.providers;

    const enrichedDeal = await dealProcessingService.enrichDeal(deal, providers);

    res.json({
      success: true,
      data: enrichedDeal,
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
 * Analyze a deal
 */
export const analyzeDeal = async (req: Request, res: Response) => {
  try {
    const deal: NormalizedDeal = req.body;
    const analysis = await dealProcessingService.analyzeDeal(deal);

    res.json({
      success: true,
      data: analysis,
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

// ============================================================================
// AUTOMATIONS
// ============================================================================

/**
 * Get all automations
 */
export const getAllAutomations = async (req: Request, res: Response) => {
  try {
    const automations = dealProcessingService.getAllAutomations();
    res.json({
      success: true,
      data: automations,
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
 * Add an automation
 */
export const addAutomation = async (req: Request, res: Response) => {
  try {
    const automation: Automation = {
      ...req.body,
      id: req.body.id || `automation-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      executionCount: 0,
    };

    dealProcessingService.addAutomation(automation);

    res.status(201).json({
      success: true,
      data: automation,
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
 * Trigger an automation
 */
export const triggerAutomation = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;
    const payload = req.body;

    const result = await dealProcessingService.triggerAutomation(automationId, payload);

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
 * Get automation by ID
 */
export const getAutomationById = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;
    const automation = dealProcessingService.getAutomation(automationId);

    if (!automation) {
      return res.status(404).json({
        success: false,
        error: `Automation "${automationId}" not found`,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: automation,
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
 * Update an automation
 */
export const updateAutomation = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;
    const updates = req.body;

    const automation = dealProcessingService.getAutomation(automationId);
    if (!automation) {
      return res.status(404).json({
        success: false,
        error: `Automation "${automationId}" not found`,
        timestamp: new Date().toISOString(),
      });
    }

    const updated = await dealProcessingService.updateAutomation(automationId, updates);

    res.json({
      success: true,
      data: updated,
      message: `Automation "${automationId}" updated successfully`,
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
 * Delete an automation
 */
export const deleteAutomation = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;

    const automation = dealProcessingService.getAutomation(automationId);
    if (!automation) {
      return res.status(404).json({
        success: false,
        error: `Automation "${automationId}" not found`,
        timestamp: new Date().toISOString(),
      });
    }

    await dealProcessingService.deleteAutomation(automationId);

    res.json({
      success: true,
      message: `Automation "${automationId}" deleted successfully`,
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
 * Toggle an automation's enabled status
 */
export const toggleAutomation = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;
    const { enabled } = req.body;

    const automation = dealProcessingService.getAutomation(automationId);
    if (!automation) {
      return res.status(404).json({
        success: false,
        error: `Automation "${automationId}" not found`,
        timestamp: new Date().toISOString(),
      });
    }

    // Toggle if no value provided, otherwise use the provided value
    const newEnabled = enabled !== undefined ? enabled : !automation.enabled;
    const updated = await dealProcessingService.updateAutomation(automationId, { enabled: newEnabled });

    res.json({
      success: true,
      data: updated,
      message: `Automation "${automationId}" ${newEnabled ? 'enabled' : 'disabled'}`,
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
 * Get automation execution history
 */
export const getAutomationHistory = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;
    // SECURITY: Safe parseInt with range validation
    const limit = safeParseInt(req.query.limit, { min: 1, max: 200, defaultValue: 50 }) || 50;

    // Import model here to avoid circular dependency issues
    const { AutomationExecution } = await import('../models');

    const history = await AutomationExecution.findAll({
      where: { automationId },
      order: [['executedAt', 'DESC']],
      limit,
    });

    res.json({
      success: true,
      data: {
        automationId,
        executions: history,
        count: history.length,
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
 * Test an automation (dry run)
 */
export const testAutomation = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;
    const { payload } = req.body;

    const automation = dealProcessingService.getAutomation(automationId);
    if (!automation) {
      return res.status(404).json({
        success: false,
        error: `Automation "${automationId}" not found`,
        timestamp: new Date().toISOString(),
      });
    }

    // For now, just return what would happen
    res.json({
      success: true,
      data: {
        automationId,
        automation: {
          name: automation.name,
          trigger: automation.trigger,
          conditions: automation.conditions,
          actions: automation.actions.map(a => ({
            type: a.type,
            order: a.order,
          })),
        },
        testPayload: payload || {},
        message: 'Dry run - no actions executed',
        wouldExecute: automation.enabled,
        actionCount: automation.actions.length,
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
 * Get execution statistics for automations
 */
export const getExecutionStats = async (req: Request, res: Response) => {
  try {
    const { automationId, startDate, endDate } = req.query;

    const stats = await dealProcessingService.getExecutionStats({
      automationId: automationId as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: stats,
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
 * Get execution history with filtering
 */
export const getExecutionHistoryFiltered = async (req: Request, res: Response) => {
  try {
    const { automationId, status, triggeredBy, startDate, endDate, limit, offset } = req.query;

    // Validate and sanitize pagination parameters
    const parsedLimit = limit ? parseInt(limit as string, 10) : 50;
    const parsedOffset = offset ? parseInt(offset as string, 10) : 0;
    const safeLimit = isNaN(parsedLimit) || parsedLimit < 1 ? 50 : Math.min(parsedLimit, 500);
    const safeOffset = isNaN(parsedOffset) || parsedOffset < 0 ? 0 : parsedOffset;

    const result = await dealProcessingService.getExecutionHistory({
      automationId: automationId as string | undefined,
      status: status as any,
      triggeredBy: triggeredBy as any,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: safeLimit,
      offset: safeOffset,
    });

    res.json({
      success: true,
      data: result.executions,
      pagination: {
        total: result.total,
        limit: safeLimit,
        offset: safeOffset,
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
 * Cleanup old execution records
 */
export const cleanupExecutions = async (req: Request, res: Response) => {
  try {
    const { retentionDays } = req.body;
    const days = retentionDays ? parseInt(retentionDays, 10) : 30;

    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        error: 'retentionDays must be between 1 and 365',
        timestamp: new Date().toISOString(),
      });
    }

    const deleted = await dealProcessingService.cleanupOldExecutions(days);

    res.json({
      success: true,
      data: {
        deletedCount: deleted,
        retentionDays: days,
      },
      message: `Cleaned up ${deleted} execution records older than ${days} days`,
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

// ============================================================================
// WORKFLOWS
// ============================================================================

/**
 * Get all workflows
 */
export const getAllWorkflows = async (req: Request, res: Response) => {
  try {
    const workflows = dealProcessingService.getAllWorkflows();
    res.json({
      success: true,
      data: workflows,
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
 * Get workflow templates
 */
export const getWorkflowTemplates = async (req: Request, res: Response) => {
  try {
    const templates = dealProcessingService.getWorkflowTemplates();
    res.json({
      success: true,
      data: templates,
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
 * Add a workflow
 */
export const addWorkflow = async (req: Request, res: Response) => {
  try {
    const workflow: Workflow = {
      ...req.body,
      id: req.body.id || `workflow-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    dealProcessingService.addWorkflow(workflow);

    res.status(201).json({
      success: true,
      data: workflow,
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
 * Start a workflow for a deal
 */
export const startWorkflow = async (req: Request, res: Response) => {
  try {
    const { workflowId } = req.params;
    const deal: NormalizedDeal = req.body;

    const execution = await dealProcessingService.startWorkflow(workflowId, deal);

    res.json({
      success: true,
      data: execution,
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
 * Resume a paused workflow
 */
export const resumeWorkflow = async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const input = req.body;

    const execution = await dealProcessingService.resumeWorkflow(executionId, input);

    res.json({
      success: true,
      data: execution,
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
 * Get pending human reviews
 */
export const getPendingReviews = async (req: Request, res: Response) => {
  try {
    const reviews = dealProcessingService.getPendingReviews();
    res.json({
      success: true,
      data: reviews,
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
 * Submit a human review
 */
export const submitReview = async (req: Request, res: Response) => {
  try {
    const { reviewId } = req.params;
    const { approved, notes } = req.body;

    await dealProcessingService.submitReview(reviewId, approved, notes);

    res.json({
      success: true,
      message: 'Review submitted',
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

// ============================================================================
// FULL DEAL PROCESSING
// ============================================================================

/**
 * Process a deal through the full pipeline
 */
export const processDeal = async (req: Request, res: Response) => {
  try {
    const { deal, options } = req.body;

    const result = await dealProcessingService.processDeal(deal, options);

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

// ============================================================================
// FIRECRAWL SPECIFIC
// ============================================================================

/**
 * Helper to get the Firecrawl plugin instance
 */
const getFirecrawlPlugin = (sourceId: string): FirecrawlDealSourcePlugin | null => {
  const source = pluginRegistry.getActiveSource(sourceId);
  if (source && source.plugin instanceof FirecrawlDealSourcePlugin) {
    return source.plugin;
  }
  return null;
};

/**
 * Get all Firecrawl sites for a source
 */
export const getFirecrawlSites = async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const plugin = getFirecrawlPlugin(sourceId);

    if (!plugin) {
      return res.status(404).json({
        success: false,
        error: 'Firecrawl source not found or not active',
        timestamp: new Date().toISOString(),
      });
    }

    const sites = plugin.getSites();
    res.json({
      success: true,
      data: sites,
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
 * Get a specific Firecrawl site
 */
export const getFirecrawlSite = async (req: Request, res: Response) => {
  try {
    const { sourceId, siteId } = req.params;
    const plugin = getFirecrawlPlugin(sourceId);

    if (!plugin) {
      return res.status(404).json({
        success: false,
        error: 'Firecrawl source not found or not active',
        timestamp: new Date().toISOString(),
      });
    }

    const site = plugin.getSite(siteId);
    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: site,
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
 * Add a new Firecrawl site
 */
export const addFirecrawlSite = async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const plugin = getFirecrawlPlugin(sourceId);

    if (!plugin) {
      return res.status(404).json({
        success: false,
        error: 'Firecrawl source not found or not active',
        timestamp: new Date().toISOString(),
      });
    }

    const site: FirecrawlSiteConfig = {
      id: req.body.id || `site-${Date.now()}`,
      name: req.body.name,
      url: req.body.url,
      enabled: req.body.enabled !== false,
      crawlMode: req.body.crawlMode || 'scrape',
      urlPatterns: req.body.urlPatterns,
      extractionSchema: req.body.extractionSchema,
      customPrompt: req.body.customPrompt,
      maxPages: req.body.maxPages,
      schedule: req.body.schedule,
    };

    plugin.addSite(site);

    res.status(201).json({
      success: true,
      data: site,
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
 * Update a Firecrawl site
 */
export const updateFirecrawlSite = async (req: Request, res: Response) => {
  try {
    const { sourceId, siteId } = req.params;
    const plugin = getFirecrawlPlugin(sourceId);

    if (!plugin) {
      return res.status(404).json({
        success: false,
        error: 'Firecrawl source not found or not active',
        timestamp: new Date().toISOString(),
      });
    }

    const updated = plugin.updateSite(siteId, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: updated,
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
 * Delete a Firecrawl site
 */
export const deleteFirecrawlSite = async (req: Request, res: Response) => {
  try {
    const { sourceId, siteId } = req.params;
    const plugin = getFirecrawlPlugin(sourceId);

    if (!plugin) {
      return res.status(404).json({
        success: false,
        error: 'Firecrawl source not found or not active',
        timestamp: new Date().toISOString(),
      });
    }

    const deleted = plugin.removeSite(siteId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: `Site ${siteId} deleted`,
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
 * Trigger a crawl for a specific site
 */
export const crawlFirecrawlSite = async (req: Request, res: Response) => {
  try {
    const { sourceId, siteId } = req.params;
    const plugin = getFirecrawlPlugin(sourceId);

    if (!plugin) {
      return res.status(404).json({
        success: false,
        error: 'Firecrawl source not found or not active',
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch deals with site filter
    const result = await plugin.fetchDeals({ filters: { siteId } });

    res.json({
      success: result.success,
      data: {
        dealsFound: result.deals.length,
        deals: result.deals,
        errors: result.errors,
        metadata: result.metadata,
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
 * Test Firecrawl API connection
 */
export const testFirecrawlConnection = async (req: Request, res: Response) => {
  try {
    const { apiKey, apiUrl } = req.body;

    // Create a temporary plugin to test
    const testPlugin = new FirecrawlDealSourcePlugin();
    const result = await testPlugin.testConnection({
      id: 'test',
      name: 'Test',
      type: 'firecrawl',
      enabled: true,
      settings: {
        apiKey: apiKey || null,
        apiUrl: apiUrl || 'https://api.firecrawl.dev',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json({
      success: result.success,
      message: result.message,
      details: result.details,
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
 * Preview extraction from a URL
 */
export const previewFirecrawlExtraction = async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const { url, schema, prompt } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
        timestamp: new Date().toISOString(),
      });
    }

    const plugin = getFirecrawlPlugin(sourceId);

    if (!plugin) {
      return res.status(404).json({
        success: false,
        error: 'Firecrawl source not found or not active',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await plugin.previewExtraction(url, schema, prompt);

    res.json({
      success: result.success,
      data: result.data,
      error: result.error,
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
 * Crawl a URL and save extracted properties to the database
 * This is the main entry point for crawling real estate sites and persisting data
 */
export const crawlAndSaveToDatabase = async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const {
      url,
      siteId,
      prompt,
      schema,
      saveToDb = true,
      skipDuplicates = false, // If true, skip properties that already exist (by address)
      allowUpdate = true, // If false, don't update existing properties
    } = req.body;

    if (!url && !siteId) {
      return res.status(400).json({
        success: false,
        error: 'Either URL or siteId is required',
        timestamp: new Date().toISOString(),
      });
    }

    const plugin = getFirecrawlPlugin(sourceId);

    if (!plugin) {
      return res.status(404).json({
        success: false,
        error: 'Firecrawl source not found or not active',
        timestamp: new Date().toISOString(),
      });
    }

    let deals: NormalizedDeal[] = [];
    let crawlErrors: any[] = [];

    // If URL provided, create a temporary site config and crawl it
    if (url) {
      const tempSite: FirecrawlSiteConfig = {
        id: `temp-${Date.now()}`,
        name: 'Temporary Crawl',
        url: url,
        enabled: true,
        crawlMode: 'scrape',
        customPrompt: prompt,
        extractionSchema: schema,
      };

      const result = await plugin.scrapeSingleUrl(tempSite);
      deals = result.deals;
      crawlErrors = result.errors;
    } else if (siteId) {
      // Use existing site configuration
      const result = await plugin.fetchDeals({ filters: { siteId } });
      deals = result.deals;
      crawlErrors = result.errors;
    }

    // Save to database if requested and we have deals
    let dbResult: BulkSaveResult | null = null;
    if (saveToDb && deals.length > 0) {
      dbResult = await dealIntakeService.bulkIngestDeals(deals, {
        allowUpdate,
        skipDuplicates,
        queueProcessing: true,
      });
    }

    res.json({
      success: true,
      data: {
        crawl: {
          dealsExtracted: deals.length,
          deals: deals,
          errors: crawlErrors,
        },
        database: dbResult
          ? {
              saved: true,
              total: dbResult.total,
              created: dbResult.created,
              updated: dbResult.updated,
              duplicates: dbResult.duplicates,
              ownerChanges: dbResult.ownerChanges,
              skipped: dbResult.skipped,
              errors: dbResult.errors.map((e) => e.error),
              duplicateProperties: dbResult.duplicateProperties.map((d) => ({
                address: d.deal.address.street,
                existingPropertyId: d.existingPropertyId,
              })),
              ownerChangeRecords: dbResult.ownerChangeRecords,
            }
          : {
              saved: false,
              reason: saveToDb ? 'No deals to save' : 'saveToDb set to false',
            },
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
 * Crawl a site and save all extracted properties to the database
 */
export const crawlSiteAndSave = async (req: Request, res: Response) => {
  try {
    const { sourceId, siteId } = req.params;
    const plugin = getFirecrawlPlugin(sourceId);

    if (!plugin) {
      return res.status(404).json({
        success: false,
        error: 'Firecrawl source not found or not active',
        timestamp: new Date().toISOString(),
      });
    }

    const site = plugin.getSite(siteId);
    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch deals from the site
    const crawlResult = await plugin.fetchDeals({ filters: { siteId } });

    // Save to database
    let dbResult: BulkSaveResult | null = null;
    if (crawlResult.deals.length > 0) {
      dbResult = await dealIntakeService.bulkIngestDeals(crawlResult.deals, { queueProcessing: true });
    }

    res.json({
      success: true,
      data: {
        site: {
          id: site.id,
          name: site.name,
          url: site.url,
        },
        crawl: {
          success: crawlResult.success,
          dealsExtracted: crawlResult.deals.length,
          errors: crawlResult.errors,
          metadata: crawlResult.metadata,
        },
        database: dbResult
          ? {
              saved: true,
              total: dbResult.total,
              created: dbResult.created,
              updated: dbResult.updated,
              skipped: dbResult.skipped,
              errorCount: dbResult.errors.length,
              properties: dbResult.properties.map((p) => ({
                propertyId: p.propertyId,
                address: p.address,
                city: p.city,
                state: p.state,
                price: p.mlsListingPrice,
              })),
            }
          : {
              saved: false,
              reason: 'No deals extracted',
            },
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

// ============================================================================
// BROWSER AUTOMATION - AUCTION SUBMISSION
// ============================================================================

/**
 * Get all configured auction sites
 */
export const getAuctionSites = async (req: Request, res: Response) => {
  try {
    const sites = auctionSubmission.getAllSites();

    // Remove credentials from response
    const safeSites = sites.map((site) => ({
      ...site,
      credentials: {
        username: site.credentials.username ? '***configured***' : '',
        password: site.credentials.password ? '***configured***' : '',
      },
    }));

    res.json({
      success: true,
      data: safeSites,
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
 * Register or update an auction site
 */
export const registerAuctionSite = async (req: Request, res: Response) => {
  try {
    const config: AuctionSiteConfig = req.body;

    if (!config.id || !config.name || !config.type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: id, name, type',
        timestamp: new Date().toISOString(),
      });
    }

    auctionSubmission.registerSite(config);

    res.status(201).json({
      success: true,
      data: {
        id: config.id,
        name: config.name,
        type: config.type,
        enabled: config.enabled,
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
 * Update auction site credentials
 */
export const updateAuctionCredentials = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: username, password',
        timestamp: new Date().toISOString(),
      });
    }

    const site = auctionSubmission.getSite(siteId);
    if (!site) {
      return res.status(404).json({
        success: false,
        error: `Site not found: ${siteId}`,
        timestamp: new Date().toISOString(),
      });
    }

    auctionSubmission.updateCredentials(siteId, username, password);

    res.json({
      success: true,
      message: `Credentials updated for ${site.name}`,
      data: {
        siteId,
        siteName: site.name,
        enabled: true,
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
 * Test login to an auction site
 */
export const testAuctionLogin = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;

    const site = auctionSubmission.getSite(siteId);
    if (!site) {
      return res.status(404).json({
        success: false,
        error: `Site not found: ${siteId}`,
        timestamp: new Date().toISOString(),
      });
    }

    if (!site.credentials.username || !site.credentials.password) {
      return res.status(400).json({
        success: false,
        error: 'Credentials not configured for this site',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await auctionSubmission.testLogin(siteId);

    res.json({
      success: result.success,
      data: {
        siteId,
        siteName: site.name,
        loginSuccess: result.success,
        error: result.error,
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
 * Submit a deal to an auction site
 */
export const submitToAuction = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const deal: NormalizedDeal = req.body;

    if (!deal.address) {
      return res.status(400).json({
        success: false,
        error: 'Deal must have an address',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await auctionSubmission.submitDeal(deal, siteId);

    res.json({
      success: result.success,
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
 * Submit a deal to multiple auction sites
 */
export const submitToMultipleAuctions = async (req: Request, res: Response) => {
  try {
    const { deal, siteIds } = req.body;

    if (!deal || !deal.address) {
      return res.status(400).json({
        success: false,
        error: 'Deal with address is required',
        timestamp: new Date().toISOString(),
      });
    }

    if (!siteIds || !Array.isArray(siteIds) || siteIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'siteIds array is required',
        timestamp: new Date().toISOString(),
      });
    }

    const job = await auctionSubmission.submitToMultipleSites(deal, siteIds);

    res.json({
      success: true,
      data: job,
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
 * Submit a deal to all enabled auction sites
 */
export const submitToAllAuctions = async (req: Request, res: Response) => {
  try {
    const deal: NormalizedDeal = req.body;

    if (!deal.address) {
      return res.status(400).json({
        success: false,
        error: 'Deal with address is required',
        timestamp: new Date().toISOString(),
      });
    }

    const enabledSites = auctionSubmission.getEnabledSites();
    if (enabledSites.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No enabled auction sites configured',
        timestamp: new Date().toISOString(),
      });
    }

    const job = await auctionSubmission.submitToAllEnabled(deal);

    res.json({
      success: true,
      data: job,
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
 * Get submission jobs
 */
export const getSubmissionJobs = async (req: Request, res: Response) => {
  try {
    // SECURITY: Safe parseInt with range validation
    const limit = safeParseInt(req.query.limit, { min: 1, max: 100, defaultValue: 10 }) || 10;
    const jobs = auctionSubmission.getRecentJobs(limit);

    res.json({
      success: true,
      data: jobs,
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
 * Get a specific submission job
 */
export const getSubmissionJob = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = auctionSubmission.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: `Job not found: ${jobId}`,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: job,
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
 * Remove an auction site
 */
export const removeAuctionSite = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;

    const site = auctionSubmission.getSite(siteId);
    if (!site) {
      return res.status(404).json({
        success: false,
        error: `Site not found: ${siteId}`,
        timestamp: new Date().toISOString(),
      });
    }

    auctionSubmission.removeSite(siteId);

    res.json({
      success: true,
      message: `Site removed: ${site.name}`,
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

// ============================================================================
// DATABASE TO AUCTION SITE SUBMISSION
// ============================================================================

/**
 * Convert a Property model to NormalizedDeal format
 */
const propertyToNormalizedDeal = (property: Property): NormalizedDeal => {
  return {
    externalId: property.propertyId,
    sourceId: `db-${property.propertyId}`,
    sourceName: 'Database',
    normalizedAt: new Date(),
    confidence: 1.0,
    address: {
      street: property.address
        ? `${property.address.houseNumber || ''} ${property.address.street || ''}`.trim()
        : '',
      city: property.city,
      state: property.state,
      zip: property.zip,
      county: property.county,
    },
    propertyType: property.propertyType,
    askingPrice: property.mlsListingPrice || property.buyItNowPrice || property.reservePrice || 0,
    arv: property.arv,
    repairEstimate: property.rehabCost || property.renovationBudget,
    bedrooms: property.bedroomCount || 0,
    bathrooms: property.bathroomCount || 0,
    sqft: property.livingSpaceSqFt,
    lotSize: property.lotSizeSqFt,
    yearBuilt: property.yearBuilt,
    description: property.propertyListingDescription,
    photos: property.photoLinks,
    occupancyStatus: property.occupancyStatus as any,
    rawData: {
      propertyId: property.propertyId,
      county: property.county,
      stories: property.stories,
      garage: property.garage,
      garageCount: property.garageCount,
      pool: property.pool,
      mlsNumber: property.mlsNumber,
      monthlyRent: property.monthlyRent,
    },
  };
};

/**
 * Update property listing tracking after submission
 */
const updatePropertyListingTracking = async (
  property: Property,
  siteId: string,
  siteName: string,
  result: { success: boolean; confirmationNumber?: string }
): Promise<void> => {
  if (!result.success) return;

  const now = new Date();

  // Get current listing history or initialize
  const listingHistory = property.listingHistory || [];

  // Add new listing entry
  listingHistory.push({
    siteId,
    siteName,
    submittedAt: now,
    confirmationNumber: result.confirmationNumber,
    status: 'active' as const,
  });

  // Update current listings array
  const currentListings = property.currentListings || [];
  if (!currentListings.includes(siteId)) {
    currentListings.push(siteId);
  }

  // Update property
  await property.update({
    listingHistory,
    currentListings,
    lastSubmittedAt: now,
    lastSubmittedTo: siteId,
  });

  console.log(`📝 Updated property ${property.propertyId} - now listed on: ${currentListings.join(', ')}`);
};

/**
 * Fetch a property from database and submit to an auction site
 */
export const submitPropertyFromDatabase = async (req: Request, res: Response) => {
  try {
    const { propertyId, siteId } = req.params;

    // Fetch property from database
    const property = await Property.findOne({
      where: { propertyId },
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        error: `Property not found: ${propertyId}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Get site info
    const site = auctionSubmission.getSite(siteId);
    const siteName = site?.name || siteId;

    // Convert to NormalizedDeal
    const deal = propertyToNormalizedDeal(property);

    // Submit to auction site
    const result = await auctionSubmission.submitDeal(deal, siteId);

    // Update property tracking if successful
    if (result.success) {
      await updatePropertyListingTracking(property, siteId, siteName, result);
    }

    res.json({
      success: result.success,
      data: {
        property: {
          propertyId: property.propertyId,
          address: `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city}, ${property.state} ${property.zip}`,
          price: property.mlsListingPrice || property.buyItNowPrice,
          currentListings: result.success ? [...(property.currentListings || []), siteId] : property.currentListings,
        },
        submission: result,
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
 * Fetch a property from database and submit to multiple auction sites
 */
export const submitPropertyToMultipleSites = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { siteIds } = req.body;

    if (!siteIds || !Array.isArray(siteIds) || siteIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'siteIds array is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch property from database
    const property = await Property.findOne({
      where: { propertyId },
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        error: `Property not found: ${propertyId}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Convert to NormalizedDeal
    const deal = propertyToNormalizedDeal(property);

    // Submit to multiple sites
    const job = await auctionSubmission.submitToMultipleSites(deal, siteIds);

    // Update tracking for each successful submission
    for (const result of job.results) {
      if (result.success) {
        await updatePropertyListingTracking(property, result.siteId, result.siteName, result);
      }
    }

    // Reload property to get updated listings
    await property.reload();

    res.json({
      success: true,
      data: {
        property: {
          propertyId: property.propertyId,
          address: `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city}, ${property.state} ${property.zip}`,
          price: property.mlsListingPrice || property.buyItNowPrice,
          currentListings: property.currentListings,
        },
        job,
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
 * Get property listing status - where is it currently listed
 */
export const getPropertyListingStatus = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;

    const property = await Property.findOne({
      where: { propertyId },
      attributes: [
        'propertyId',
        'address',
        'city',
        'state',
        'zip',
        'listingHistory',
        'currentListings',
        'lastSubmittedAt',
        'lastSubmittedTo',
        'llcOwnerName',
        'llcOwnerEmail',
        'syndication',
        'listedOnMLS',
        'mlsNumber',
      ],
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        error: `Property not found: ${propertyId}`,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        propertyId: property.propertyId,
        address: `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city}, ${property.state} ${property.zip}`,
        owner: {
          name: property.llcOwnerName,
          email: property.llcOwnerEmail,
        },
        listings: {
          currentSites: property.currentListings || [],
          mls: {
            listed: property.listedOnMLS,
            number: property.mlsNumber,
          },
          syndication: property.syndication || [],
          lastSubmittedAt: property.lastSubmittedAt,
          lastSubmittedTo: property.lastSubmittedTo,
        },
        history: property.listingHistory || [],
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
 * Submit all properties matching criteria to auction sites
 */
export const submitPropertiesByCriteria = async (req: Request, res: Response) => {
  try {
    const { siteIds, criteria, limit = 10 } = req.body;

    if (!siteIds || !Array.isArray(siteIds) || siteIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'siteIds array is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Build query from criteria
    const where: any = {};
    if (criteria) {
      if (criteria.state) where.state = criteria.state;
      if (criteria.city) where.city = criteria.city;
      if (criteria.minPrice) where.mlsListingPrice = { ...where.mlsListingPrice, $gte: criteria.minPrice };
      if (criteria.maxPrice) where.mlsListingPrice = { ...where.mlsListingPrice, $lte: criteria.maxPrice };
      if (criteria.propertyType) where.propertyType = criteria.propertyType;
      if (criteria.minBedrooms) where.bedroomCount = { ...where.bedroomCount, $gte: criteria.minBedrooms };
    }

    // Fetch properties from database
    const properties = await Property.findAll({
      where,
      limit: Math.min(limit, 50), // Cap at 50 to prevent abuse
    });

    if (properties.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No properties match the criteria',
        timestamp: new Date().toISOString(),
      });
    }

    // Submit each property
    const results = [];
    for (const property of properties) {
      const deal = propertyToNormalizedDeal(property);
      const job = await auctionSubmission.submitToMultipleSites(deal, siteIds);
      results.push({
        propertyId: property.propertyId,
        address: `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city}, ${property.state}`,
        job,
      });
    }

    res.json({
      success: true,
      data: {
        propertiesProcessed: properties.length,
        sitesTargeted: siteIds.length,
        results,
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
