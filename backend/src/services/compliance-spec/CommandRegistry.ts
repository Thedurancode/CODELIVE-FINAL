/**
 * Command Registry Pattern for Compliance Spec AI
 *
 * Each command is a self-contained handler with:
 * - execute() - performs the operation
 * - validate() - validates params before execution
 * - describe() - returns human-readable description
 */

import sequelize from '../../config/database';
import { complianceSpecCache } from './SpecCache';
import { complianceSpecWebhooks } from './WebhookNotifier';

// =============================================================================
// TYPES
// =============================================================================

export interface CommandContext {
  userId: string | null;
  stateCode?: string;
  skipApproval?: boolean;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  pendingApprovalId?: string;
}

export interface CommandHandler {
  name: string;
  description: string;
  dangerous: boolean; // Requires approval
  execute(params: Record<string, any>, context: CommandContext): Promise<CommandResult>;
  validate(params: Record<string, any>): { valid: boolean; errors: string[] };
}

// =============================================================================
// COMMAND HANDLERS
// =============================================================================

const addRuleCommand: CommandHandler = {
  name: 'add_rule',
  description: 'Add a new compliance rule to a state',
  dangerous: true,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    if (!params.ruleCode) errors.push('ruleCode is required');
    if (!params.name) errors.push('name is required');
    if (params.phase === undefined) errors.push('phase is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode, ruleCode, phase, name, description, severity, isBlocking, errorMessage, remediation } = params;

    // Get state spec ID
    const [state] = await sequelize.query(
      `SELECT id FROM compliance_state_specs WHERE state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (!state) {
      return { success: false, message: `State ${stateCode} not found` };
    }

    // Check for duplicate rule code
    const [existing] = await sequelize.query(
      `SELECT id FROM compliance_rules WHERE state_spec_id = :specId AND rule_code = :ruleCode`,
      { replacements: { specId: state.id, ruleCode }, type: 'SELECT' as any }
    ) as any[];

    if (existing) {
      return { success: false, message: `Rule ${ruleCode} already exists in ${stateCode}` };
    }

    // Insert rule
    await sequelize.query(
      `INSERT INTO compliance_rules (
        id, state_spec_id, rule_code, phase, name, description,
        validation_type, severity, is_blocking, error_message, remediation,
        is_active, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), :specId, :ruleCode, :phase, :name, :description,
        'custom', :severity, :isBlocking, :errorMessage, :remediation,
        true, NOW(), NOW()
      )`,
      {
        replacements: {
          specId: state.id,
          ruleCode,
          phase,
          name,
          description: description || name,
          severity: severity || 'warning',
          isBlocking: isBlocking ?? false,
          errorMessage: errorMessage || `Rule ${ruleCode} failed`,
          remediation: remediation || null,
        },
      }
    );

    // Invalidate cache and notify
    await complianceSpecCache.invalidate(stateCode);
    await complianceSpecWebhooks.notify('rule_added', { stateCode, ruleCode, name });

    return { success: true, message: `Added rule ${ruleCode} to ${stateCode}`, data: { ruleCode } };
  },
};

const addDisclosureCommand: CommandHandler = {
  name: 'add_disclosure',
  description: 'Add a new disclosure requirement to a state',
  dangerous: true,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    if (!params.disclosureCode) errors.push('disclosureCode is required');
    if (!params.name) errors.push('name is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode, disclosureCode, name, description, legalCitation, isRequired, phase, keywords } = params;

    const [state] = await sequelize.query(
      `SELECT id FROM compliance_state_specs WHERE state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (!state) {
      return { success: false, message: `State ${stateCode} not found` };
    }

    // Format keywords for PostgreSQL array
    const keywordsArray = keywords || [];
    const pgKeywords = `{${keywordsArray.map((k: string) => `"${k.replace(/"/g, '\\"')}"`).join(',')}}`;

    await sequelize.query(
      `INSERT INTO compliance_disclosures (
        id, state_spec_id, disclosure_code, name, description, legal_citation,
        is_required, phase, keywords, is_active, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), :specId, :code, :name, :description, :citation,
        :required, :phase, :keywords, true, NOW(), NOW()
      )`,
      {
        replacements: {
          specId: state.id,
          code: disclosureCode,
          name,
          description: description || name,
          citation: legalCitation || null,
          required: isRequired ?? true,
          phase: phase ?? 4,
          keywords: pgKeywords,
        },
      }
    );

    await complianceSpecCache.invalidate(stateCode);
    await complianceSpecWebhooks.notify('disclosure_added', { stateCode, disclosureCode, name });

    return { success: true, message: `Added disclosure ${disclosureCode} to ${stateCode}`, data: { disclosureCode } };
  },
};

const listRulesCommand: CommandHandler = {
  name: 'list_rules',
  description: 'List all rules for a state',
  dangerous: false,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode, phase } = params;

    // Try cache first
    const cacheKey = phase !== undefined ? `rules:${stateCode}:${phase}` : `rules:${stateCode}`;
    const cached = await complianceSpecCache.get(cacheKey);
    if (cached) {
      return { success: true, message: `Rules for ${stateCode}`, data: cached };
    }

    let query = `
      SELECT r.rule_code, r.phase, r.name, r.description, r.severity, r.is_blocking, r.is_active
      FROM compliance_rules r
      JOIN compliance_state_specs s ON r.state_spec_id = s.id
      WHERE s.state_code = :stateCode
    `;
    const replacements: any = { stateCode };

    if (phase !== undefined) {
      query += ` AND r.phase = :phase`;
      replacements.phase = phase;
    }

    query += ` ORDER BY r.phase, r.rule_code`;

    const rules = await sequelize.query(query, { replacements, type: 'SELECT' as any });

    // Cache for 5 minutes
    await complianceSpecCache.set(cacheKey, rules, 300);

    return { success: true, message: `Rules for ${stateCode}`, data: rules };
  },
};

const listDisclosuresCommand: CommandHandler = {
  name: 'list_disclosures',
  description: 'List all disclosures for a state',
  dangerous: false,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode } = params;

    const cached = await complianceSpecCache.get(`disclosures:${stateCode}`);
    if (cached) {
      return { success: true, message: `Disclosures for ${stateCode}`, data: cached };
    }

    const disclosures = await sequelize.query(
      `SELECT d.disclosure_code, d.name, d.description, d.is_required, d.phase, d.is_active
       FROM compliance_disclosures d
       JOIN compliance_state_specs s ON d.state_spec_id = s.id
       WHERE s.state_code = :stateCode
       ORDER BY d.disclosure_code`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    );

    await complianceSpecCache.set(`disclosures:${stateCode}`, disclosures, 300);

    return { success: true, message: `Disclosures for ${stateCode}`, data: disclosures };
  },
};

const getStateSummaryCommand: CommandHandler = {
  name: 'get_state_summary',
  description: 'Get summary of a state spec',
  dangerous: false,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode } = params;

    const cached = await complianceSpecCache.get(`summary:${stateCode}`);
    if (cached) {
      return { success: true, message: `Summary for ${stateCode}`, data: cached };
    }

    const [state] = await sequelize.query(
      `SELECT state_code, state_name, version, status FROM compliance_state_specs WHERE state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (!state) {
      return { success: false, message: `State ${stateCode} not found` };
    }

    const [[{ count: rules }]] = await sequelize.query(
      `SELECT COUNT(*) as count FROM compliance_rules r JOIN compliance_state_specs s ON r.state_spec_id = s.id WHERE s.state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any;

    const [[{ count: disclosures }]] = await sequelize.query(
      `SELECT COUNT(*) as count FROM compliance_disclosures d JOIN compliance_state_specs s ON d.state_spec_id = s.id WHERE s.state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any;

    const [[{ count: gates }]] = await sequelize.query(
      `SELECT COUNT(*) as count FROM compliance_gates g JOIN compliance_state_specs s ON g.state_spec_id = s.id WHERE s.state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any;

    const summary = {
      stateCode: state.state_code,
      stateName: state.state_name,
      version: state.version,
      status: state.status,
      rules: parseInt(rules),
      disclosures: parseInt(disclosures),
      gates: parseInt(gates),
    };

    await complianceSpecCache.set(`summary:${stateCode}`, summary, 300);

    return { success: true, message: `Summary for ${stateCode}`, data: summary };
  },
};

const bulkToggleRulesCommand: CommandHandler = {
  name: 'bulk_toggle_rules',
  description: 'Enable or disable multiple rules at once',
  dangerous: true,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    if (params.active === undefined) errors.push('active (true/false) is required');
    if (!params.phase && !params.ruleCodes) errors.push('Either phase or ruleCodes is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode, phase, ruleCodes, active } = params;

    const [state] = await sequelize.query(
      `SELECT id FROM compliance_state_specs WHERE state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (!state) {
      return { success: false, message: `State ${stateCode} not found` };
    }

    let query = `UPDATE compliance_rules SET is_active = :active, updated_at = NOW() WHERE state_spec_id = :specId`;
    const replacements: any = { specId: state.id, active };

    if (phase !== undefined) {
      query += ` AND phase = :phase`;
      replacements.phase = phase;
    }

    if (ruleCodes && ruleCodes.length > 0) {
      query += ` AND rule_code IN (:ruleCodes)`;
      replacements.ruleCodes = ruleCodes;
    }

    const [, rowCount] = await sequelize.query(query, { replacements }) as any;

    await complianceSpecCache.invalidate(stateCode);
    await complianceSpecWebhooks.notify('rules_toggled', { stateCode, active, count: rowCount });

    return {
      success: true,
      message: `${active ? 'Enabled' : 'Disabled'} ${rowCount} rules in ${stateCode}`,
      data: { affected: rowCount },
    };
  },
};

const cloneStateCommand: CommandHandler = {
  name: 'clone_state',
  description: 'Clone an existing state spec to create a new one',
  dangerous: true,

  validate(params) {
    const errors: string[] = [];
    if (!params.sourceState) errors.push('sourceState is required');
    if (!params.targetState) errors.push('targetState is required');
    if (!params.targetStateName) errors.push('targetStateName is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { sourceState, targetState, targetStateName } = params;
    const transaction = await sequelize.transaction();

    try {
      // Get source state
      const [source] = await sequelize.query(
        `SELECT * FROM compliance_state_specs WHERE state_code = :stateCode`,
        { replacements: { stateCode: sourceState }, type: 'SELECT' as any, transaction }
      ) as any[];

      if (!source) {
        await transaction.rollback();
        return { success: false, message: `Source state ${sourceState} not found` };
      }

      // Check target doesn't exist
      const [existing] = await sequelize.query(
        `SELECT id FROM compliance_state_specs WHERE state_code = :stateCode`,
        { replacements: { stateCode: targetState }, type: 'SELECT' as any, transaction }
      ) as any[];

      if (existing) {
        await transaction.rollback();
        return { success: false, message: `Target state ${targetState} already exists` };
      }

      // Create new state spec
      const [[newState]] = await sequelize.query(
        `INSERT INTO compliance_state_specs (
          id, state_code, state_name, version, status, legal_references, notes, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), :stateCode, :stateName, '1.0.0', 'draft', :legalRefs, :notes, NOW(), NOW()
        ) RETURNING id`,
        {
          replacements: {
            stateCode: targetState,
            stateName: targetStateName,
            legalRefs: '[]',
            notes: `Cloned from ${sourceState}`,
          },
          type: 'SELECT' as any,
          transaction,
        }
      ) as any;

      const newSpecId = newState.id;

      // Clone phases
      await sequelize.query(
        `INSERT INTO compliance_phases (id, state_spec_id, phase_number, name, short_name, description, icon, is_active, created_at, updated_at)
         SELECT gen_random_uuid(), :newSpecId, phase_number, name, short_name, description, icon, is_active, NOW(), NOW()
         FROM compliance_phases WHERE state_spec_id = :sourceSpecId`,
        { replacements: { newSpecId, sourceSpecId: source.id }, transaction }
      );

      // Clone gates (update rule_code prefix)
      await sequelize.query(
        `INSERT INTO compliance_gates (id, state_spec_id, gate_code, name, after_phase, blocks_phase, condition_description, error_message, is_active, created_at, updated_at)
         SELECT gen_random_uuid(), :newSpecId, REPLACE(gate_code, :sourceState, :targetState), name, after_phase, blocks_phase, condition_description, error_message, is_active, NOW(), NOW()
         FROM compliance_gates WHERE state_spec_id = :sourceSpecId`,
        { replacements: { newSpecId, sourceSpecId: source.id, sourceState, targetState }, transaction }
      );

      // Clone rules
      await sequelize.query(
        `INSERT INTO compliance_rules (id, state_spec_id, rule_code, phase, name, description, validation_type, field_to_check, compare_to_field, operator, expected_value, custom_logic, severity, is_blocking, error_message, remediation, is_active, created_at, updated_at)
         SELECT gen_random_uuid(), :newSpecId, REPLACE(rule_code, :sourceState, :targetState), phase, name, description, validation_type, field_to_check, compare_to_field, operator, expected_value, custom_logic, severity, is_blocking, error_message, remediation, is_active, NOW(), NOW()
         FROM compliance_rules WHERE state_spec_id = :sourceSpecId`,
        { replacements: { newSpecId, sourceSpecId: source.id, sourceState, targetState }, transaction }
      );

      // Clone disclosures
      await sequelize.query(
        `INSERT INTO compliance_disclosures (id, state_spec_id, disclosure_code, name, description, legal_citation, is_required, phase, keywords, regex_pattern, is_active, created_at, updated_at)
         SELECT gen_random_uuid(), :newSpecId, REPLACE(disclosure_code, :sourceState, :targetState), name, description, NULL, is_required, phase, keywords, regex_pattern, is_active, NOW(), NOW()
         FROM compliance_disclosures WHERE state_spec_id = :sourceSpecId`,
        { replacements: { newSpecId, sourceSpecId: source.id, sourceState, targetState }, transaction }
      );

      // Clone contacts
      await sequelize.query(
        `INSERT INTO compliance_contact_requirements (id, state_spec_id, contact_type, role, phase, is_required, is_blocking, required_fields, is_active, created_at, updated_at)
         SELECT gen_random_uuid(), :newSpecId, contact_type, role, phase, is_required, is_blocking, required_fields, is_active, NOW(), NOW()
         FROM compliance_contact_requirements WHERE state_spec_id = :sourceSpecId`,
        { replacements: { newSpecId, sourceSpecId: source.id }, transaction }
      );

      // Clone documents
      await sequelize.query(
        `INSERT INTO compliance_document_requirements (id, state_spec_id, document_type, official_name, category, phase, is_required, extraction_fields, retention_period, is_active, created_at, updated_at)
         SELECT gen_random_uuid(), :newSpecId, document_type, official_name, category, phase, is_required, extraction_fields, retention_period, is_active, NOW(), NOW()
         FROM compliance_document_requirements WHERE state_spec_id = :sourceSpecId`,
        { replacements: { newSpecId, sourceSpecId: source.id }, transaction }
      );

      await transaction.commit();

      await complianceSpecWebhooks.notify('state_cloned', { sourceState, targetState, targetStateName });

      return {
        success: true,
        message: `Cloned ${sourceState} to ${targetState} (${targetStateName})`,
        data: { newStateId: newSpecId },
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

const exportStateCommand: CommandHandler = {
  name: 'export_state',
  description: 'Export a state spec to JSON format',
  dangerous: false,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode } = params;

    const [state] = await sequelize.query(
      `SELECT * FROM compliance_state_specs WHERE state_code = :stateCode`,
      { replacements: { stateCode }, type: 'SELECT' as any }
    ) as any[];

    if (!state) {
      return { success: false, message: `State ${stateCode} not found` };
    }

    const phases = await sequelize.query(
      `SELECT phase_number, name, short_name, description, icon FROM compliance_phases WHERE state_spec_id = :specId ORDER BY phase_number`,
      { replacements: { specId: state.id }, type: 'SELECT' as any }
    );

    const gates = await sequelize.query(
      `SELECT gate_code, name, after_phase, blocks_phase, condition_description, error_message FROM compliance_gates WHERE state_spec_id = :specId ORDER BY after_phase`,
      { replacements: { specId: state.id }, type: 'SELECT' as any }
    );

    const rules = await sequelize.query(
      `SELECT rule_code, phase, name, description, validation_type, field_to_check, compare_to_field, operator, expected_value, custom_logic, severity, is_blocking, error_message, remediation FROM compliance_rules WHERE state_spec_id = :specId ORDER BY phase, rule_code`,
      { replacements: { specId: state.id }, type: 'SELECT' as any }
    );

    const disclosures = await sequelize.query(
      `SELECT disclosure_code, name, description, legal_citation, is_required, phase, keywords FROM compliance_disclosures WHERE state_spec_id = :specId ORDER BY disclosure_code`,
      { replacements: { specId: state.id }, type: 'SELECT' as any }
    );

    const contacts = await sequelize.query(
      `SELECT contact_type, role, phase, is_required, is_blocking, required_fields FROM compliance_contact_requirements WHERE state_spec_id = :specId ORDER BY phase`,
      { replacements: { specId: state.id }, type: 'SELECT' as any }
    );

    const documents = await sequelize.query(
      `SELECT document_type, official_name, category, phase, is_required, extraction_fields, retention_period FROM compliance_document_requirements WHERE state_spec_id = :specId ORDER BY phase`,
      { replacements: { specId: state.id }, type: 'SELECT' as any }
    );

    const exportData = {
      state: state.state_code,
      stateName: state.state_name,
      version: state.version,
      exportedAt: new Date().toISOString(),
      metadata: {
        legalReferences: JSON.parse(state.legal_references || '[]'),
        notes: state.notes,
      },
      phases,
      blockingGates: gates,
      rules,
      disclosures,
      contacts,
      documents,
    };

    return {
      success: true,
      message: `Exported ${stateCode} spec`,
      data: exportData,
    };
  },
};

const validateRuleLogicCommand: CommandHandler = {
  name: 'validate_rule_logic',
  description: 'Validate that custom rule logic is safe JavaScript',
  dangerous: false,

  validate(params) {
    const errors: string[] = [];
    if (!params.logic) errors.push('logic is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { logic } = params;
    const issues: string[] = [];

    // Dangerous patterns to check
    const dangerousPatterns = [
      { pattern: /\beval\b/, message: 'eval() is not allowed' },
      { pattern: /\bFunction\b/, message: 'Function constructor is not allowed' },
      { pattern: /\brequire\b/, message: 'require() is not allowed' },
      { pattern: /\bimport\b/, message: 'import is not allowed' },
      { pattern: /\bprocess\b/, message: 'process access is not allowed' },
      { pattern: /\bglobal\b/, message: 'global access is not allowed' },
      { pattern: /\bwindow\b/, message: 'window access is not allowed' },
      { pattern: /\bdocument\b/, message: 'document access is not allowed' },
      { pattern: /\bfetch\b/, message: 'fetch() is not allowed' },
      { pattern: /\bXMLHttpRequest\b/, message: 'XMLHttpRequest is not allowed' },
      { pattern: /\bchild_process\b/, message: 'child_process is not allowed' },
      { pattern: /\bfs\b\./, message: 'fs module access is not allowed' },
      { pattern: /\bexec\b/, message: 'exec is not allowed' },
      { pattern: /\bspawn\b/, message: 'spawn is not allowed' },
      { pattern: /while\s*\(\s*true\s*\)/, message: 'Infinite loops are not allowed' },
      { pattern: /for\s*\(\s*;\s*;\s*\)/, message: 'Infinite loops are not allowed' },
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(logic)) {
        issues.push(message);
      }
    }

    // Try to parse as JavaScript
    try {
      new Function('property', 'ocrResult', 'compliance', 'selectedLLC', 'publicRecords', logic);
    } catch (syntaxError) {
      issues.push(`Syntax error: ${(syntaxError as Error).message}`);
    }

    const isValid = issues.length === 0;

    return {
      success: true,
      message: isValid ? 'Logic is valid and safe' : 'Logic has issues',
      data: { valid: isValid, issues },
    };
  },
};

const deleteRuleCommand: CommandHandler = {
  name: 'delete_rule',
  description: 'Delete a rule from a state',
  dangerous: true,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    if (!params.ruleCode) errors.push('ruleCode is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode, ruleCode } = params;

    const [result] = await sequelize.query(
      `DELETE FROM compliance_rules r
       USING compliance_state_specs s
       WHERE r.state_spec_id = s.id AND s.state_code = :stateCode AND r.rule_code = :ruleCode
       RETURNING r.id`,
      { replacements: { stateCode, ruleCode }, type: 'SELECT' as any }
    ) as any[];

    if (!result) {
      return { success: false, message: `Rule ${ruleCode} not found in ${stateCode}` };
    }

    await complianceSpecCache.invalidate(stateCode);
    await complianceSpecWebhooks.notify('rule_deleted', { stateCode, ruleCode });

    return { success: true, message: `Deleted rule ${ruleCode} from ${stateCode}` };
  },
};

const toggleRuleCommand: CommandHandler = {
  name: 'toggle_rule',
  description: 'Enable or disable a single rule',
  dangerous: false,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    if (!params.ruleCode) errors.push('ruleCode is required');
    if (params.active === undefined) errors.push('active (true/false) is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode, ruleCode, active } = params;

    const [result] = await sequelize.query(
      `UPDATE compliance_rules r
       SET is_active = :active, updated_at = NOW()
       FROM compliance_state_specs s
       WHERE r.state_spec_id = s.id AND s.state_code = :stateCode AND r.rule_code = :ruleCode
       RETURNING r.id, r.name`,
      { replacements: { stateCode, ruleCode, active }, type: 'SELECT' as any }
    ) as any[];

    if (!result) {
      return { success: false, message: `Rule ${ruleCode} not found in ${stateCode}` };
    }

    await complianceSpecCache.invalidate(stateCode);
    await complianceSpecWebhooks.notify('rule_toggled', { stateCode, ruleCode, active });

    return {
      success: true,
      message: `${active ? 'Enabled' : 'Disabled'} rule ${ruleCode} (${result.name})`,
      data: { ruleCode, active },
    };
  },
};

const toggleDisclosureCommand: CommandHandler = {
  name: 'toggle_disclosure',
  description: 'Enable or disable a single disclosure',
  dangerous: false,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    if (!params.disclosureCode) errors.push('disclosureCode is required');
    if (params.active === undefined) errors.push('active (true/false) is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode, disclosureCode, active } = params;

    const [result] = await sequelize.query(
      `UPDATE compliance_disclosures d
       SET is_active = :active, updated_at = NOW()
       FROM compliance_state_specs s
       WHERE d.state_spec_id = s.id AND s.state_code = :stateCode AND d.disclosure_code = :disclosureCode
       RETURNING d.id, d.name`,
      { replacements: { stateCode, disclosureCode, active }, type: 'SELECT' as any }
    ) as any[];

    if (!result) {
      return { success: false, message: `Disclosure ${disclosureCode} not found in ${stateCode}` };
    }

    await complianceSpecCache.invalidate(stateCode);
    await complianceSpecWebhooks.notify('disclosure_toggled', { stateCode, disclosureCode, active });

    return {
      success: true,
      message: `${active ? 'Enabled' : 'Disabled'} disclosure ${disclosureCode} (${result.name})`,
      data: { disclosureCode, active },
    };
  },
};

const updateRuleCommand: CommandHandler = {
  name: 'update_rule',
  description: 'Update an existing rule',
  dangerous: true,

  validate(params) {
    const errors: string[] = [];
    if (!params.stateCode) errors.push('stateCode is required');
    if (!params.ruleCode) errors.push('ruleCode is required');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const { stateCode, ruleCode, ...updates } = params;

    // Build dynamic UPDATE query
    const allowedFields = ['name', 'description', 'severity', 'is_blocking', 'error_message', 'remediation', 'is_active'];
    const setClause: string[] = [];
    const replacements: any = { stateCode, ruleCode };

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClause.push(`${snakeKey} = :${key}`);
        replacements[key] = value;
      }
    }

    if (setClause.length === 0) {
      return { success: false, message: 'No valid fields to update' };
    }

    setClause.push('updated_at = NOW()');

    const [result] = await sequelize.query(
      `UPDATE compliance_rules r
       SET ${setClause.join(', ')}
       FROM compliance_state_specs s
       WHERE r.state_spec_id = s.id AND s.state_code = :stateCode AND r.rule_code = :ruleCode
       RETURNING r.id`,
      { replacements, type: 'SELECT' as any }
    ) as any[];

    if (!result) {
      return { success: false, message: `Rule ${ruleCode} not found in ${stateCode}` };
    }

    await complianceSpecCache.invalidate(stateCode);
    await complianceSpecWebhooks.notify('rule_updated', { stateCode, ruleCode, updates });

    return { success: true, message: `Updated rule ${ruleCode}` };
  },
};

// =============================================================================
// REGISTRY
// =============================================================================

class CommandRegistry {
  private commands = new Map<string, CommandHandler>();

  constructor() {
    // Register all commands
    this.register(addRuleCommand);
    this.register(addDisclosureCommand);
    this.register(listRulesCommand);
    this.register(listDisclosuresCommand);
    this.register(getStateSummaryCommand);
    this.register(bulkToggleRulesCommand);
    this.register(cloneStateCommand);
    this.register(exportStateCommand);
    this.register(validateRuleLogicCommand);
    this.register(deleteRuleCommand);
    this.register(updateRuleCommand);
    this.register(toggleRuleCommand);
    this.register(toggleDisclosureCommand);
  }

  register(handler: CommandHandler) {
    this.commands.set(handler.name, handler);
  }

  get(name: string): CommandHandler | undefined {
    return this.commands.get(name);
  }

  list(): CommandHandler[] {
    return Array.from(this.commands.values());
  }

  isDangerous(name: string): boolean {
    return this.commands.get(name)?.dangerous ?? false;
  }
}

export const commandRegistry = new CommandRegistry();
