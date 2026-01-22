/**
 * Agent Tools Module
 *
 * Barrel export for all agent tools with centralized initialization.
 *
 * Tool Categories:
 * - property-tools: Property CRUD, search, import (8 tools)
 * - analysis-tools: Deal analysis, scoring, intelligence (6 tools)
 * - buybox-tools: Buy box management (5 tools)
 * - market-data-tools: Market data, skip trace, rental trends (6 tools)
 * - pipeline-tools: Pipeline and portfolio management (8 tools)
 * - knowledge-tools: RAG search and user memory (6 tools)
 * - automation-tools: Automation rule management (6 tools)
 * - contract-tools: E-signature contracts (4 tools)
 * - web-tools: Web scraping, auction sites (4 tools)
 * - settings-tools: System settings (3 tools)
 * - file-tools: File upload analysis (4 tools)
 * - scheduling-tools: Scheduled tasks & reminders (6 tools)
 * - batch-tools: Batch operations with progress (5 tools)
 * - calendar-tools: Calendar integration (7 tools)
 * - communication-tools: Email, SMS, voice calls (15+ tools)
 * - offer-tools: Offer creation and management (5 tools)
 * - voice-tools: Voice call settings and profiles (4 tools)
 * - proxypics-tools: Property photo orders via ProxyPics (9 tools)
 * - contact-tools: Contact search, property contacts, and notes (10 tools)
 *
 * Total: ~100+ tools
 */

import { toolRegistry } from './registry';
import { registerPropertyTools } from './property-tools';
import { registerAnalysisTools } from './analysis-tools';
import { registerBuyboxTools } from './buybox-tools';
import { registerMarketDataTools } from './market-data-tools';
import { registerPipelineTools } from './pipeline-tools';
import { registerKnowledgeTools } from './knowledge-tools';
import { registerAutomationTools } from './automation-tools';
import { registerContractTools } from './contract-tools';
import { registerWebTools } from './web-tools';
import { registerSettingsTools } from './settings-tools';
import { registerFileTools } from './file-tools';
import { registerSchedulingTools } from './scheduling-tools';
import { registerBatchTools } from './batch-tools';
import { registerCalendarTools } from './calendar-tools';
import { registerCommunicationTools } from './communication-tools';
import { registerOfferTools } from './offer-tools';
import { registerTaskTools } from './task-tools';
import { registerVoiceTools } from './voice-tools';
import { registerProxyPicsTools } from './proxypics-tools';
import { registerContactTools } from './contact-tools';

let initialized = false;

/**
 * Initialize all agent tools
 * Call this during agent service initialization
 */
export function initializeTools(): void {
  if (initialized) {
    return;
  }

  // Register all tool categories
  registerPropertyTools();       // 8 tools
  registerAnalysisTools();       // 6 tools
  registerBuyboxTools();         // 5 tools
  registerMarketDataTools();     // 6 tools
  registerPipelineTools();       // 8 tools
  registerKnowledgeTools();      // 6 tools
  registerAutomationTools();     // 6 tools
  registerContractTools();       // 4 tools
  registerWebTools();            // 4 tools
  registerSettingsTools();       // 3 tools
  registerFileTools();           // 4 tools
  registerSchedulingTools();     // 6 tools
  registerBatchTools();          // 5 tools
  registerCalendarTools();       // 7 tools
  registerCommunicationTools();  // 3 tools
  registerOfferTools();          // 5 tools
  registerTaskTools();           // 1 tool
  registerVoiceTools();          // 4 tools
  registerProxyPicsTools();      // 9 tools
  registerContactTools();        // 10 tools

  initialized = true;
  console.log(`  Tool registry initialized: ${toolRegistry.getToolCount()} tools`);
}

/**
 * Check if tools have been initialized
 */
export function isToolsInitialized(): boolean {
  return initialized;
}

/**
 * Reset tools (for testing)
 */
export function resetTools(): void {
  toolRegistry.clear();
  initialized = false;
}

// Re-export registry and helpers
export { toolRegistry, success, failure, defineTool } from './registry';
export type { ToolDefinition, ToolCategory } from '../types';
