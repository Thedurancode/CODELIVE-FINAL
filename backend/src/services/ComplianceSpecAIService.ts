/**
 * Compliance Spec AI Service (Refactored)
 *
 * Translates natural language commands into compliance spec database operations.
 * Uses the command registry pattern for clean, extensible command handling.
 *
 * Key Design Principles:
 * 1. Command registry pattern - each operation is a self-contained handler
 * 2. Redis caching with memory fallback
 * 3. Webhook notifications for changes
 * 4. Every change is versioned and auditable
 * 5. Dangerous operations require human approval
 */

import sequelize from '../config/database';
import { openRouterService } from './openRouterService';
import { commandRegistry, CommandContext, CommandResult } from './compliance-spec';
import { complianceSpecCache } from './compliance-spec/SpecCache';
import { complianceSpecWebhooks } from './compliance-spec/WebhookNotifier';

// =============================================================================
// TYPES
// =============================================================================

export type AICommandIntent =
  | 'add_state'
  | 'add_phase'
  | 'add_gate'
  | 'add_rule'
  | 'add_disclosure'
  | 'add_contact'
  | 'add_document'
  | 'update_rule'
  | 'update_disclosure'
  | 'update_gate'
  | 'delete_rule'
  | 'delete_disclosure'
  | 'toggle_rule'
  | 'toggle_disclosure'
  | 'clone_state'
  | 'list_rules'
  | 'list_disclosures'
  | 'get_state_summary'
  | 'compare_states'
  | 'suggest_rules'
  | 'validate_spec'
  | 'validate_rule_logic'
  | 'export_state'
  | 'bulk_toggle_rules'
  | 'rollback_change';

export interface ParsedCommand {
  intent: AICommandIntent;
  params: Record<string, any>;
  confidence: number;
  requiresApproval: boolean;
  explanation: string;
}

// =============================================================================
// LLM PROMPT FOR COMMAND PARSING
// =============================================================================

const COMMAND_PARSING_PROMPT = `You are a compliance spec command parser. Parse the user's natural language command into a structured operation.

Available commands:
- add_rule: Add a new compliance rule (requires: stateCode, ruleCode, name, phase)
- add_disclosure: Add a disclosure requirement (requires: stateCode, disclosureCode, name)
- update_rule: Update an existing rule (requires: stateCode, ruleCode, plus fields to update)
- delete_rule: Delete a rule (requires: stateCode, ruleCode)
- list_rules: List rules for a state (requires: stateCode, optional: phase)
- list_disclosures: List disclosures (requires: stateCode)
- get_state_summary: Get state overview (requires: stateCode)
- clone_state: Copy a state spec (requires: sourceState, targetState, targetStateName)
- export_state: Export state to JSON (requires: stateCode)
- bulk_toggle_rules: Enable/disable multiple rules (requires: stateCode, active, optional: phase or ruleCodes)
- validate_rule_logic: Check if JavaScript logic is safe (requires: logic)
- validate_spec: Validate a state's spec (requires: stateCode)

State codes: OK (Oklahoma), TX (Texas), FL (Florida), AZ (Arizona), GA (Georgia), etc.

Respond with JSON:
{
  "intent": "<command_name>",
  "params": { <extracted parameters> },
  "confidence": <0-1>,
  "explanation": "<human readable explanation of what will happen>"
}

Examples:
- "Add a lead paint disclosure to Oklahoma" → {"intent": "add_disclosure", "params": {"stateCode": "OK", "disclosureCode": "OK-D-LEAD", "name": "Lead Paint Disclosure"}, "confidence": 0.9, "explanation": "Add a lead paint disclosure requirement to Oklahoma"}
- "List all rules for Texas phase 3" → {"intent": "list_rules", "params": {"stateCode": "TX", "phase": 3}, "confidence": 0.95, "explanation": "List all phase 3 rules for Texas"}
- "Clone Oklahoma to create Texas" → {"intent": "clone_state", "params": {"sourceState": "OK", "targetState": "TX", "targetStateName": "Texas"}, "confidence": 0.85, "explanation": "Clone Oklahoma's compliance spec to create Texas spec"}
- "Disable all phase 4 rules in Oklahoma" → {"intent": "bulk_toggle_rules", "params": {"stateCode": "OK", "phase": 4, "active": false}, "confidence": 0.9, "explanation": "Disable all phase 4 rules in Oklahoma"}`;

// =============================================================================
// MAIN SERVICE
// =============================================================================

class ComplianceSpecAIService {
  private initialized = false;

  /**
   * Initialize the service and its dependencies
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await complianceSpecCache.initialize();
    await complianceSpecWebhooks.initialize();

    this.initialized = true;
    console.log('[ComplianceSpecAI] Service initialized');
  }

  /**
   * Parse a natural language command into a structured operation
   */
  async parseCommand(command: string, userId: string): Promise<ParsedCommand> {
    // Try LLM parsing if configured
    if (openRouterService.isConfigured()) {
      try {
        const response = await openRouterService.completeJson<{
          intent: string;
          params: Record<string, any>;
          confidence: number;
          explanation: string;
        }>(COMMAND_PARSING_PROMPT, command, { temperature: 0.1 });

        const intent = response.intent as AICommandIntent;
        const isDangerous = commandRegistry.isDangerous(intent);

        return {
          intent,
          params: response.params,
          confidence: response.confidence,
          requiresApproval: isDangerous,
          explanation: response.explanation,
        };
      } catch (error) {
        console.warn('[ComplianceSpecAI] LLM parsing failed:', (error as Error).message);
      }
    }

    // Fallback: simple pattern matching
    return this.fallbackParse(command);
  }

  /**
   * Simple pattern matching fallback when LLM is not available
   */
  private fallbackParse(command: string): ParsedCommand {
    const lower = command.toLowerCase();

    // State code detection
    const stateMatch = command.match(/\b(OK|TX|FL|AZ|GA|OH|NC|TN|NV|IL|CA)\b/i);
    const stateCode = stateMatch ? stateMatch[1].toUpperCase() : undefined;

    // Phase detection
    const phaseMatch = lower.match(/phase\s*(\d+)/);
    const phase = phaseMatch ? parseInt(phaseMatch[1]) : undefined;

    // List rules
    if (lower.includes('list') && lower.includes('rule')) {
      return {
        intent: 'list_rules',
        params: { stateCode, phase },
        confidence: stateCode ? 0.7 : 0.3,
        requiresApproval: false,
        explanation: `List rules${stateCode ? ` for ${stateCode}` : ''}${phase !== undefined ? ` phase ${phase}` : ''}`,
      };
    }

    // List disclosures
    if (lower.includes('list') && lower.includes('disclosure')) {
      return {
        intent: 'list_disclosures',
        params: { stateCode },
        confidence: stateCode ? 0.7 : 0.3,
        requiresApproval: false,
        explanation: `List disclosures${stateCode ? ` for ${stateCode}` : ''}`,
      };
    }

    // Get summary
    if (lower.includes('summary') || lower.includes('overview') || lower.includes('status')) {
      return {
        intent: 'get_state_summary',
        params: { stateCode },
        confidence: stateCode ? 0.7 : 0.3,
        requiresApproval: false,
        explanation: `Get summary${stateCode ? ` for ${stateCode}` : ''}`,
      };
    }

    // Export
    if (lower.includes('export')) {
      return {
        intent: 'export_state',
        params: { stateCode },
        confidence: stateCode ? 0.7 : 0.3,
        requiresApproval: false,
        explanation: `Export${stateCode ? ` ${stateCode}` : ''} to JSON`,
      };
    }

    // Clone
    if (lower.includes('clone') || lower.includes('copy')) {
      const states = command.match(/\b(OK|TX|FL|AZ|GA|OH|NC|TN|NV|IL|CA)\b/gi);
      if (states && states.length >= 2) {
        return {
          intent: 'clone_state',
          params: {
            sourceState: states[0].toUpperCase(),
            targetState: states[1].toUpperCase(),
            targetStateName: states[1].toUpperCase(),
          },
          confidence: 0.6,
          requiresApproval: true,
          explanation: `Clone ${states[0]} to ${states[1]}`,
        };
      }
    }

    // Disable/enable rules
    if (lower.includes('disable') || lower.includes('enable')) {
      const active = lower.includes('enable');
      return {
        intent: 'bulk_toggle_rules',
        params: { stateCode, phase, active },
        confidence: stateCode ? 0.6 : 0.3,
        requiresApproval: true,
        explanation: `${active ? 'Enable' : 'Disable'} rules${stateCode ? ` in ${stateCode}` : ''}${phase !== undefined ? ` phase ${phase}` : ''}`,
      };
    }

    // Default fallback
    return {
      intent: 'validate_spec',
      params: { stateCode, raw: command },
      confidence: 0,
      requiresApproval: false,
      explanation: 'Could not understand command',
    };
  }

  /**
   * Execute a parsed command
   */
  async executeCommand(
    command: ParsedCommand,
    userId: string,
    skipApproval = false
  ): Promise<CommandResult> {
    await this.initialize();

    // Log the command
    const commandLog = await this.logCommand(command, userId);

    // If approval required and not skipped, queue for approval
    if (command.requiresApproval && !skipApproval) {
      return {
        success: true,
        message: `Command queued for approval: ${command.explanation}`,
        pendingApprovalId: commandLog.id,
      };
    }

    // Get the command handler
    const handler = commandRegistry.get(command.intent);
    if (!handler) {
      // Fallback for commands not in registry
      return this.executeLegacyIntent(command, userId);
    }

    // Validate parameters
    const validation = handler.validate(command.params);
    if (!validation.valid) {
      await this.updateCommandLog(commandLog.id, 'failed', null, validation.errors.join(', '));
      return {
        success: false,
        message: `Validation failed: ${validation.errors.join(', ')}`,
      };
    }

    // Execute
    try {
      const context: CommandContext = {
        userId: this.isValidUUID(userId) ? userId : null,
        stateCode: command.params.stateCode,
        skipApproval,
      };

      const result = await handler.execute(command.params, context);
      await this.updateCommandLog(commandLog.id, result.success ? 'executed' : 'failed', result);

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      await this.updateCommandLog(commandLog.id, 'failed', null, errorMessage);

      return {
        success: false,
        message: `Command failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Execute legacy intents not yet in command registry
   */
  private async executeLegacyIntent(command: ParsedCommand, userId: string): Promise<CommandResult> {
    switch (command.intent) {
      case 'validate_spec':
        return this.validateSpec(command.params.stateCode);

      case 'compare_states':
        return this.compareStates(command.params.stateCode1, command.params.stateCode2);

      case 'suggest_rules':
        return this.suggestRules(command.params.stateCode);

      case 'add_state':
        return this.addState(command.params);

      case 'add_gate':
        return this.addGate(command.params);

      default:
        return {
          success: false,
          message: `Unknown command: ${command.intent}`,
        };
    }
  }

  // ===========================================================================
  // LEGACY OPERATIONS (to be migrated to CommandRegistry)
  // ===========================================================================

  private async validateSpec(stateCode: string): Promise<CommandResult> {
    const issues: string[] = [];

    // Check state exists
    const [state] = await sequelize.query(
      `SELECT id FROM compliance_state_specs WHERE state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (!state) {
      return { success: false, message: `State ${stateCode} not found` };
    }

    // Check for rules without error messages
    const [rulesNoError] = await sequelize.query(
      `SELECT COUNT(*) as count FROM compliance_rules r
       JOIN compliance_state_specs s ON r.state_spec_id = s.id
       WHERE s.state_code = :stateCode AND (r.error_message IS NULL OR r.error_message = '')`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (parseInt(rulesNoError.count) > 0) {
      issues.push(`${rulesNoError.count} rules without error messages`);
    }

    // Check for disclosures without descriptions
    const [disclosuresNoDesc] = await sequelize.query(
      `SELECT COUNT(*) as count FROM compliance_disclosures d
       JOIN compliance_state_specs s ON d.state_spec_id = s.id
       WHERE s.state_code = :stateCode AND (d.description IS NULL OR d.description = '')`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (parseInt(disclosuresNoDesc.count) > 0) {
      issues.push(`${disclosuresNoDesc.count} disclosures without descriptions`);
    }

    // Check gates reference valid phases
    const [invalidGates] = await sequelize.query(
      `SELECT g.gate_code, g.after_phase, g.blocks_phase
       FROM compliance_gates g
       JOIN compliance_state_specs s ON g.state_spec_id = s.id
       WHERE s.state_code = :stateCode AND (g.after_phase > 12 OR g.blocks_phase > 12)`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (invalidGates) {
      issues.push(`Gate ${invalidGates.gate_code} references invalid phase`);
    }

    return {
      success: true,
      message: issues.length === 0 ? 'Spec is valid' : 'Spec has issues',
      data: { valid: issues.length === 0, issues },
    };
  }

  private async compareStates(stateCode1: string, stateCode2: string): Promise<CommandResult> {
    const [[counts1]] = await sequelize.query(
      `SELECT
        (SELECT COUNT(*) FROM compliance_rules r JOIN compliance_state_specs s ON r.state_spec_id = s.id WHERE s.state_code = :code) as rules,
        (SELECT COUNT(*) FROM compliance_disclosures d JOIN compliance_state_specs s ON d.state_spec_id = s.id WHERE s.state_code = :code) as disclosures,
        (SELECT COUNT(*) FROM compliance_gates g JOIN compliance_state_specs s ON g.state_spec_id = s.id WHERE s.state_code = :code) as gates`,
      { replacements: { code: stateCode1 }, type: 'SELECT' as any }
    ) as any;

    const [[counts2]] = await sequelize.query(
      `SELECT
        (SELECT COUNT(*) FROM compliance_rules r JOIN compliance_state_specs s ON r.state_spec_id = s.id WHERE s.state_code = :code) as rules,
        (SELECT COUNT(*) FROM compliance_disclosures d JOIN compliance_state_specs s ON d.state_spec_id = s.id WHERE s.state_code = :code) as disclosures,
        (SELECT COUNT(*) FROM compliance_gates g JOIN compliance_state_specs s ON g.state_spec_id = s.id WHERE s.state_code = :code) as gates`,
      { replacements: { code: stateCode2 }, type: 'SELECT' as any }
    ) as any;

    return {
      success: true,
      message: `Comparison of ${stateCode1} and ${stateCode2}`,
      data: {
        [stateCode1]: counts1,
        [stateCode2]: counts2,
        differences: {
          rules: parseInt(counts1.rules) - parseInt(counts2.rules),
          disclosures: parseInt(counts1.disclosures) - parseInt(counts2.disclosures),
          gates: parseInt(counts1.gates) - parseInt(counts2.gates),
        },
      },
    };
  }

  private async suggestRules(stateCode: string): Promise<CommandResult> {
    // Get common rules from other states that this state doesn't have
    const suggestions = await sequelize.query(
      `SELECT DISTINCT r.name, r.description, r.severity
       FROM compliance_rules r
       JOIN compliance_state_specs s ON r.state_spec_id = s.id
       WHERE s.state_code != :stateCode
       AND r.name NOT IN (
         SELECT r2.name FROM compliance_rules r2
         JOIN compliance_state_specs s2 ON r2.state_spec_id = s2.id
         WHERE s2.state_code = :stateCode
       )
       LIMIT 10`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    );

    return {
      success: true,
      message: `Suggested rules for ${stateCode}`,
      data: suggestions,
    };
  }

  private async addState(params: any): Promise<CommandResult> {
    const { stateCode, stateName, copyFrom } = params;

    // Check if state exists
    const [existing] = await sequelize.query(
      `SELECT id FROM compliance_state_specs WHERE state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (existing) {
      return { success: false, message: `State ${stateCode} already exists` };
    }

    if (copyFrom) {
      // Use clone command
      const handler = commandRegistry.get('clone_state');
      if (handler) {
        return handler.execute(
          { sourceState: copyFrom, targetState: stateCode, targetStateName: stateName },
          { userId: null }
        );
      }
    }

    // Create empty state
    await sequelize.query(
      `INSERT INTO compliance_state_specs (id, state_code, state_name, version, status, legal_references, notes, created_at, updated_at)
       VALUES (gen_random_uuid(), :stateCode, :stateName, '1.0.0', 'draft', '[]', NULL, NOW(), NOW())`,
      { replacements: { stateCode, stateName } }
    );

    await complianceSpecWebhooks.notify('state_created', { stateCode, stateName });

    return {
      success: true,
      message: `Created state ${stateCode} (${stateName})`,
    };
  }

  private async addGate(params: any): Promise<CommandResult> {
    const { stateCode, gateCode, name, afterPhase, blocksPhase, condition, errorMessage } = params;

    const [state] = await sequelize.query(
      `SELECT id FROM compliance_state_specs WHERE state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (!state) {
      return { success: false, message: `State ${stateCode} not found` };
    }

    await sequelize.query(
      `INSERT INTO compliance_gates (id, state_spec_id, gate_code, name, after_phase, blocks_phase, condition_description, error_message, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), :specId, :gateCode, :name, :afterPhase, :blocksPhase, :condition, :errorMessage, true, NOW(), NOW())`,
      {
        replacements: {
          specId: state.id,
          gateCode,
          name,
          afterPhase,
          blocksPhase,
          condition: condition || '',
          errorMessage: errorMessage || `Gate ${gateCode} blocked`,
        },
      }
    );

    await complianceSpecCache.invalidate(stateCode);

    return {
      success: true,
      message: `Added gate ${gateCode} to ${stateCode}`,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  private async logCommand(command: ParsedCommand, userId: string): Promise<any> {
    const validUserId = this.isValidUUID(userId) ? userId : null;

    const [log] = await sequelize.query(
      `INSERT INTO compliance_ai_commands (
        id, state_code, raw_command, parsed_intent, parsed_params, status, requires_approval, user_id, created_at
      ) VALUES (
        gen_random_uuid(), :stateCode, :rawCommand, :intent, :params, 'pending', :requiresApproval, :userId, NOW()
      ) RETURNING *`,
      {
        replacements: {
          stateCode: command.params.stateCode || null,
          rawCommand: command.explanation,
          intent: command.intent,
          params: JSON.stringify(command.params),
          requiresApproval: command.requiresApproval,
          userId: validUserId,
        },
        type: 'SELECT' as any,
      }
    ) as any[];

    return log;
  }

  private async updateCommandLog(id: string, status: string, result: any, error?: string): Promise<void> {
    await sequelize.query(
      `UPDATE compliance_ai_commands SET
        status = :status,
        execution_result = :result,
        error_message = :error,
        executed_at = CASE WHEN :status = 'executed' THEN NOW() ELSE executed_at END
       WHERE id = :id`,
      {
        replacements: {
          id,
          status,
          result: result ? JSON.stringify(result) : null,
          error: error || null,
        },
      }
    );
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<any> {
    return complianceSpecCache.getStats();
  }

  /**
   * Get webhook statistics
   */
  getWebhookStats(): any {
    return complianceSpecWebhooks.getStats();
  }

  /**
   * List available commands
   */
  listCommands(): Array<{ name: string; description: string; dangerous: boolean }> {
    return commandRegistry.list().map((h) => ({
      name: h.name,
      description: h.description,
      dangerous: h.dangerous,
    }));
  }
}

export const complianceSpecAIService = new ComplianceSpecAIService();
