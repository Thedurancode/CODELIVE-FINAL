/**
 * State Compliance Controller
 *
 * API endpoints for universal state-based compliance workflow.
 * Works with any state - loads rules from compliance-specs JSON files.
 */

import { Request, Response } from 'express';
import { stateComplianceEngine } from '../services/StateComplianceEngine';
import { blockingGateService } from '../services/BlockingGateService';
import { agreementTriggerService } from '../services/AgreementTriggerService';
import { phaseContractService } from '../services/PhaseContractService';
import StateDealCompliance, { initStateDealCompliance } from '../models/StateDealCompliance';
import StateWorkflowState, { initStateWorkflowState } from '../models/StateWorkflowState';
import sequelize from '../config/database';

// Try to import AutomationEngine for event emission
let automationEngine: any = null;
try {
  automationEngine = require('../plugins/automation/AutomationEngine').automationEngine;
} catch (e) {
  console.warn('AutomationEngine not available for phase events');
}

// Initialize models if not already done
let modelsInitialized = false;
async function ensureModels() {
  if (!modelsInitialized) {
    try {
      initStateDealCompliance(sequelize);
      initStateWorkflowState(sequelize);
      modelsInitialized = true;
    } catch (err) {
      console.warn('State compliance models may already be initialized');
    }
  }
}

// ============================================================================
// STATE SPECS
// ============================================================================

/**
 * @swagger
 * /api/state-compliance/states:
 *   get:
 *     summary: Get list of available states with compliance specs
 *     tags: [State Compliance]
 *     responses:
 *       200:
 *         description: List of available states
 */
export async function getAvailableStates(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();
    const states = stateComplianceEngine.getAvailableStates();

    res.json({
      success: true,
      data: states,
      count: states.length,
    });
  } catch (error) {
    console.error('Error fetching available states:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch states',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/states/{state}:
 *   get:
 *     summary: Get compliance spec summary for a state
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State code (e.g., OK, TX, FL)
 *     responses:
 *       200:
 *         description: State compliance spec summary
 */
export async function getStateSummary(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();
    const { state } = req.params;

    const summary = stateComplianceEngine.getStateSummary(state.toUpperCase());

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: `No compliance spec found for state: ${state}`,
      });
    }

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error fetching state summary:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch state summary',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/states/{state}/contacts:
 *   get:
 *     summary: Get contact requirements for a state
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: phase
 *         schema:
 *           type: integer
 *         description: Filter by phase number
 *     responses:
 *       200:
 *         description: Contact requirements
 */
export async function getStateContacts(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();
    const { state } = req.params;
    const phase = req.query.phase ? parseInt(req.query.phase as string) : undefined;

    const contacts = stateComplianceEngine.getContactRequirements(state.toUpperCase(), phase);

    res.json({
      success: true,
      data: contacts,
      count: contacts.length,
    });
  } catch (error) {
    console.error('Error fetching state contacts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch contacts',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/states/{state}/documents:
 *   get:
 *     summary: Get document requirements for a state
 *     tags: [State Compliance]
 */
export async function getStateDocuments(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();
    const { state } = req.params;
    const phase = req.query.phase ? parseInt(req.query.phase as string) : undefined;

    const documents = stateComplianceEngine.getDocumentRequirements(state.toUpperCase(), phase);

    res.json({
      success: true,
      data: documents,
      count: documents.length,
    });
  } catch (error) {
    console.error('Error fetching state documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch documents',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/states/{state}/disclosures:
 *   get:
 *     summary: Get disclosure requirements for a state
 *     tags: [State Compliance]
 */
export async function getStateDisclosures(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();
    const { state } = req.params;

    const disclosures = stateComplianceEngine.getDisclosures(state.toUpperCase());

    res.json({
      success: true,
      data: disclosures,
      count: disclosures.length,
      requiredCount: disclosures.filter((d) => d.required).length,
    });
  } catch (error) {
    console.error('Error fetching state disclosures:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch disclosures',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/states/{state}/rules:
 *   get:
 *     summary: Get compliance rules for a state
 *     tags: [State Compliance]
 */
export async function getStateRules(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();
    const { state } = req.params;
    const phase = req.query.phase ? parseInt(req.query.phase as string) : undefined;

    const rules = stateComplianceEngine.getRules(state.toUpperCase(), phase);

    res.json({
      success: true,
      data: rules,
      count: rules.length,
      blockingCount: rules.filter((r) => r.blocking).length,
    });
  } catch (error) {
    console.error('Error fetching state rules:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch rules',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/states/{state}/gates:
 *   get:
 *     summary: Get blocking gates for a state
 *     tags: [State Compliance]
 */
export async function getStateGates(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();
    const { state } = req.params;

    const gates = stateComplianceEngine.getBlockingGates(state.toUpperCase());

    res.json({
      success: true,
      data: gates,
      count: gates.length,
    });
  } catch (error) {
    console.error('Error fetching state gates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch gates',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/states/{state}/extraction-profiles:
 *   get:
 *     summary: Get OCR extraction profiles for a state
 *     tags: [State Compliance]
 */
export async function getStateExtractionProfiles(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();
    const { state } = req.params;

    const spec = stateComplianceEngine.getSpec(state.toUpperCase());
    if (!spec) {
      return res.status(404).json({
        success: false,
        error: `No compliance spec found for state: ${state}`,
      });
    }

    res.json({
      success: true,
      data: spec.extractionProfiles,
      count: spec.extractionProfiles.length,
    });
  } catch (error) {
    console.error('Error fetching extraction profiles:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch profiles',
    });
  }
}

// ============================================================================
// DEAL COMPLIANCE
// ============================================================================

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}:
 *   get:
 *     summary: Get compliance status for a deal
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deal compliance status
 */
export async function getDealCompliance(req: Request, res: Response) {
  try {
    await ensureModels();
    const { dealId } = req.params;
    const { state } = req.query; // Allow state to be passed as query param

    // Query using raw SQL to avoid model mapping issues
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId' +
        (state ? ' AND state = :state' : '') +
        ' LIMIT 1',
      {
        replacements: { dealId: parseInt(dealId), state: state?.toString().toUpperCase() },
      }
    );

    const compliance = (complianceResults as any[])?.[0];

    if (!compliance) {
      return res.status(404).json({
        success: false,
        error: `No compliance record found for deal: ${dealId}`,
      });
    }

    // Get workflow state
    const [workflowResults] = await sequelize.query(
      'SELECT * FROM state_workflow_state WHERE deal_id = :dealId AND state = :state LIMIT 1',
      {
        replacements: { dealId: parseInt(dealId), state: compliance.state },
      }
    );
    const workflow = (workflowResults as any[])?.[0] || null;

    res.json({
      success: true,
      data: {
        compliance,
        workflow,
      },
    });
  } catch (error) {
    console.error('Error fetching deal compliance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch deal compliance',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/initialize:
 *   post:
 *     summary: Initialize compliance tracking for a deal
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - state
 *               - llcId
 *             properties:
 *               state:
 *                 type: string
 *               llcId:
 *                 type: integer
 *               county:
 *                 type: string
 */
export async function initializeDealCompliance(req: Request, res: Response) {
  try {
    await ensureModels();
    await stateComplianceEngine.initialize();

    const { dealId } = req.params;
    const { state, llcId, county } = req.body;

    if (!state || !llcId) {
      return res.status(400).json({
        success: false,
        error: 'state and llcId are required',
      });
    }

    // Check if spec exists
    const spec = stateComplianceEngine.getSpec(state.toUpperCase());
    if (!spec) {
      return res.status(400).json({
        success: false,
        error: `No compliance spec found for state: ${state}`,
      });
    }

    // Validate state format (2-letter uppercase)
    const stateCode = state.toUpperCase();
    if (!/^[A-Z]{2}$/.test(stateCode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid state code. Must be 2-letter uppercase (e.g., OK, TX, FL)',
      });
    }

    // Check if already exists
    const existing = await StateDealCompliance.findOne({
      where: { dealId: parseInt(dealId), state: stateCode },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Compliance already initialized for deal ${dealId} in ${state}`,
        data: existing,
      });
    }

    // Use database transaction to ensure both records are created atomically
    const transaction = await sequelize.transaction();

    try {
      // Create compliance record
      const compliance = await StateDealCompliance.create(
        {
          dealId: parseInt(dealId),
          llcId,
          state: stateCode,
          county: county || 'ALL',
          specVersion: spec.version,
          canDistribute: false,
          canExecuteAssignment: false,
          disclosureResults: {},
          disclosureEvidence: {},
          stateSpecificData: {},
        },
        { transaction }
      );

      // Create workflow state
      const maxPhase = stateComplianceEngine.getMaxPhase(stateCode);
      const workflow = await StateWorkflowState.create(
        {
          dealId: parseInt(dealId),
          state: stateCode,
          county: county || 'ALL',
          currentPhase: 0,
          maxPhase,
          phaseCompletions: {},
          phaseCompletedAt: {},
          blocked: false,
          startedAt: new Date(),
        },
        { transaction }
      );

      // Commit transaction
      await transaction.commit();

      res.status(201).json({
        success: true,
        data: {
          compliance,
          workflow,
          spec: {
            state: spec.state,
            version: spec.version,
            totalContacts: spec.contacts.length,
            totalDocuments: spec.documents.length,
            totalDisclosures: spec.disclosures.length,
            requiredDisclosures: spec.disclosures.filter((d) => d.required).length,
          },
        },
      });
    } catch (txError) {
      // Rollback transaction on error
      await transaction.rollback();
      throw txError;
    }
  } catch (error) {
    console.error('Error initializing deal compliance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize compliance',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/phase3:
 *   post:
 *     summary: Update Phase 3 (contract validation) results
 *     tags: [State Compliance]
 */
export async function updatePhase3(req: Request, res: Response) {
  try {
    await ensureModels();
    const { dealId } = req.params;
    const {
      buyerMatchesLlc,
      sellerMatchesRecords,
      contractAssignable,
      asIsLanguage,
      contractNotExpired,
      sellerSignaturePresent,
      details,
    } = req.body;

    // Use raw query to get compliance record
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const complianceRecord = (complianceResults as any[])?.[0];

    if (!complianceRecord) {
      return res.status(404).json({
        success: false,
        error: `No compliance record found for deal: ${dealId}`,
      });
    }

    // Calculate phase 3 status
    const allChecks = [
      buyerMatchesLlc ?? complianceRecord.buyer_matches_llc,
      sellerMatchesRecords ?? complianceRecord.seller_matches_records,
      contractAssignable ?? complianceRecord.contract_assignable,
      asIsLanguage ?? complianceRecord.as_is_language,
      contractNotExpired ?? complianceRecord.contract_not_expired,
      sellerSignaturePresent ?? complianceRecord.seller_signature_present,
    ];

    const allPassed = allChecks.every((c) => c === true);
    const anyFailed = allChecks.some((c) => c === false);
    const phase3Status = allPassed ? 'GREEN' : anyFailed ? 'RED' : 'YELLOW';

    // Update compliance record
    await sequelize.query(
      `UPDATE state_deal_compliance SET
        buyer_matches_llc = COALESCE(:buyerMatchesLlc, buyer_matches_llc),
        seller_matches_records = COALESCE(:sellerMatchesRecords, seller_matches_records),
        contract_assignable = COALESCE(:contractAssignable, contract_assignable),
        as_is_language = COALESCE(:asIsLanguage, as_is_language),
        contract_not_expired = COALESCE(:contractNotExpired, contract_not_expired),
        seller_signature_present = COALESCE(:sellerSignaturePresent, seller_signature_present),
        phase3_status = :phase3Status,
        phase3_details = COALESCE(:details::jsonb, phase3_details),
        updated_at = NOW()
      WHERE deal_id = :dealId`,
      {
        replacements: {
          dealId: parseInt(dealId),
          buyerMatchesLlc: buyerMatchesLlc ?? null,
          sellerMatchesRecords: sellerMatchesRecords ?? null,
          contractAssignable: contractAssignable ?? null,
          asIsLanguage: asIsLanguage ?? null,
          contractNotExpired: contractNotExpired ?? null,
          sellerSignaturePresent: sellerSignaturePresent ?? null,
          phase3Status,
          details: details ? JSON.stringify(details) : null,
        },
      }
    );

    // Update workflow if phase 3 passes
    if (phase3Status === 'GREEN') {
      await sequelize.query(
        `UPDATE state_workflow_state SET
          phase_completions = phase_completions || '{"3": true}'::jsonb,
          current_phase = GREATEST(current_phase, 4),
          last_advanced_at = NOW(),
          updated_at = NOW()
        WHERE deal_id = :dealId AND state = :state`,
        { replacements: { dealId: parseInt(dealId), state: complianceRecord.state } }
      );
    }

    // Fetch updated record
    const [updatedResults] = await sequelize.query(
      'SELECT phase3_status, overall_status, can_distribute FROM state_deal_compliance WHERE deal_id = :dealId',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const updated = (updatedResults as any[])?.[0];

    res.json({
      success: true,
      data: {
        phase3Status: updated?.phase3_status || phase3Status,
        checks: {
          buyerMatchesLlc: buyerMatchesLlc ?? complianceRecord.buyer_matches_llc,
          sellerMatchesRecords: sellerMatchesRecords ?? complianceRecord.seller_matches_records,
          contractAssignable: contractAssignable ?? complianceRecord.contract_assignable,
          asIsLanguage: asIsLanguage ?? complianceRecord.as_is_language,
          contractNotExpired: contractNotExpired ?? complianceRecord.contract_not_expired,
          sellerSignaturePresent: sellerSignaturePresent ?? complianceRecord.seller_signature_present,
        },
        canDistribute: updated?.can_distribute || false,
      },
    });
  } catch (error) {
    console.error('Error updating Phase 3:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update Phase 3',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/disclosures:
 *   post:
 *     summary: Update disclosure validation results (Phase 4)
 *     tags: [State Compliance]
 */
export async function updateDisclosures(req: Request, res: Response) {
  try {
    await ensureModels();
    await stateComplianceEngine.initialize();

    const { dealId } = req.params;
    const { disclosureResults, disclosureEvidence } = req.body;

    // Use raw SQL to get compliance record
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const complianceRecord = (complianceResults as any[])?.[0];

    if (!complianceRecord) {
      return res.status(404).json({
        success: false,
        error: `No compliance record found for deal: ${dealId}`,
      });
    }

    // Get required disclosures count from spec
    const disclosures = stateComplianceEngine.getDisclosures(complianceRecord.state);
    const requiredCount = disclosures.filter((d) => d.required).length;

    // Calculate disclosure score
    const results = disclosureResults || {};
    const passedCount = Object.values(results).filter((v) => v === true).length;
    const percentage = requiredCount > 0 ? Math.round((passedCount / requiredCount) * 100) : 0;

    // Determine phase 4 status
    let phase4Status: string;
    if (passedCount === requiredCount) {
      phase4Status = 'GREEN';
    } else if (percentage >= 50) {
      phase4Status = 'YELLOW';
    } else {
      phase4Status = 'RED';
    }

    // Determine overall status
    const phase3Status = complianceRecord.phase3_status || 'YELLOW';
    let overallStatus: string;
    if (phase3Status === 'RED' || phase4Status === 'RED') {
      overallStatus = 'RED';
    } else if (phase3Status === 'GREEN' && phase4Status === 'GREEN') {
      overallStatus = 'GREEN';
    } else {
      overallStatus = 'YELLOW';
    }

    // Update compliance record with raw SQL
    await sequelize.query(
      `UPDATE state_deal_compliance SET
        disclosure_results = :disclosureResults::jsonb,
        disclosure_evidence = :disclosureEvidence::jsonb,
        disclosure_score = :disclosureScore,
        total_disclosures = :totalDisclosures,
        phase4_status = :phase4Status,
        overall_status = :overallStatus,
        can_distribute = :canDistribute,
        updated_at = NOW()
      WHERE deal_id = :dealId`,
      {
        replacements: {
          dealId: parseInt(dealId),
          disclosureResults: JSON.stringify(disclosureResults || {}),
          disclosureEvidence: JSON.stringify(disclosureEvidence || {}),
          disclosureScore: passedCount,
          totalDisclosures: requiredCount,
          phase4Status,
          overallStatus,
          canDistribute: overallStatus === 'GREEN',
        },
      }
    );

    // Update workflow if phase 4 passes
    if (phase4Status === 'GREEN') {
      await sequelize.query(
        `UPDATE state_workflow_state SET
          phase_completions = phase_completions || '{"4": true}'::jsonb,
          current_phase = GREATEST(current_phase, 5),
          last_advanced_at = NOW(),
          updated_at = NOW()
        WHERE deal_id = :dealId AND state = :state`,
        { replacements: { dealId: parseInt(dealId), state: complianceRecord.state } }
      );
    }

    res.json({
      success: true,
      data: {
        phase4Status,
        disclosureScore: passedCount,
        totalDisclosures: requiredCount,
        overallStatus,
        canDistribute: overallStatus === 'GREEN',
      },
    });
  } catch (error) {
    console.error('Error updating disclosures:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update disclosures',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/validate-disclosures:
 *   post:
 *     summary: Extract and validate disclosures from document text
 *     tags: [State Compliance]
 */
export async function validateDisclosuresFromText(req: Request, res: Response) {
  try {
    await ensureModels();
    await stateComplianceEngine.initialize();

    const { dealId } = req.params;
    const { textContent } = req.body;

    if (!textContent) {
      return res.status(400).json({
        success: false,
        error: 'textContent is required',
      });
    }

    // Use raw SQL to get compliance record
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const complianceRecord = (complianceResults as any[])?.[0];

    if (!complianceRecord) {
      return res.status(404).json({
        success: false,
        error: `No compliance record found for deal: ${dealId}`,
      });
    }

    // Validate all disclosures against text
    const validationResults = stateComplianceEngine.validateAllDisclosures(
      complianceRecord.state,
      textContent
    );

    // Build results maps
    const disclosureResults: Record<string, boolean> = {};
    const disclosureEvidence: Record<string, string> = {};

    for (const result of validationResults) {
      disclosureResults[result.disclosureId] = result.found;
      if (result.evidence) {
        disclosureEvidence[result.disclosureId] = result.evidence;
      }
    }

    // Calculate score and status
    const requiredCount = validationResults.filter((r) => r.required).length;
    const passedCount = validationResults.filter((r) => r.required && r.found).length;
    const percentage = requiredCount > 0 ? Math.round((passedCount / requiredCount) * 100) : 0;

    // Determine phase 4 status
    let phase4Status: string;
    if (passedCount === requiredCount) {
      phase4Status = 'GREEN';
    } else if (percentage >= 50) {
      phase4Status = 'YELLOW';
    } else {
      phase4Status = 'RED';
    }

    // Determine overall status
    const phase3Status = complianceRecord.phase3_status || 'YELLOW';
    let overallStatus: string;
    if (phase3Status === 'RED' || phase4Status === 'RED') {
      overallStatus = 'RED';
    } else if (phase3Status === 'GREEN' && phase4Status === 'GREEN') {
      overallStatus = 'GREEN';
    } else {
      overallStatus = 'YELLOW';
    }

    // Update compliance record with raw SQL
    await sequelize.query(
      `UPDATE state_deal_compliance SET
        disclosure_results = :disclosureResults::jsonb,
        disclosure_evidence = :disclosureEvidence::jsonb,
        disclosure_score = :disclosureScore,
        total_disclosures = :totalDisclosures,
        phase4_status = :phase4Status,
        overall_status = :overallStatus,
        can_distribute = :canDistribute,
        updated_at = NOW()
      WHERE deal_id = :dealId`,
      {
        replacements: {
          dealId: parseInt(dealId),
          disclosureResults: JSON.stringify(disclosureResults),
          disclosureEvidence: JSON.stringify(disclosureEvidence),
          disclosureScore: passedCount,
          totalDisclosures: requiredCount,
          phase4Status,
          overallStatus,
          canDistribute: overallStatus === 'GREEN',
        },
      }
    );

    res.json({
      success: true,
      data: {
        results: validationResults,
        phase4Status,
        disclosureScore: passedCount,
        totalDisclosures: requiredCount,
        overallStatus,
        canDistribute: overallStatus === 'GREEN',
      },
    });
  } catch (error) {
    console.error('Error validating disclosures:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate disclosures',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/timing:
 *   post:
 *     summary: Update timing validation (Phase 10)
 *     tags: [State Compliance]
 */
export async function updateTiming(req: Request, res: Response) {
  try {
    await ensureModels();
    const { dealId } = req.params;
    const {
      contractAcceptanceDate,
      cancellationDeliveryDate,
      cancellationAcknowledged,
      assignmentExecutionDate,
    } = req.body;

    // Use raw SQL to get compliance record
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const complianceRecord = (complianceResults as any[])?.[0];

    if (!complianceRecord) {
      return res.status(404).json({
        success: false,
        error: `No compliance record found for deal: ${dealId}`,
      });
    }

    // Get current values or use new ones
    const newContractAcceptanceDate = contractAcceptanceDate
      ? new Date(contractAcceptanceDate)
      : complianceRecord.contract_acceptance_date;
    const newCancellationDeliveryDate = cancellationDeliveryDate
      ? new Date(cancellationDeliveryDate)
      : complianceRecord.cancellation_delivery_date;
    const newCancellationAcknowledged =
      cancellationAcknowledged !== undefined
        ? cancellationAcknowledged
        : complianceRecord.cancellation_acknowledged;
    const newAssignmentExecutionDate = assignmentExecutionDate
      ? new Date(assignmentExecutionDate)
      : complianceRecord.assignment_execution_date;

    // Validate timing: cancellation must be delivered and acknowledged before assignment
    // And cancellation must be delivered within 3 days of contract acceptance
    let timingValid = true;

    if (newContractAcceptanceDate && newCancellationDeliveryDate) {
      const acceptDate = new Date(newContractAcceptanceDate);
      const deliveryDate = new Date(newCancellationDeliveryDate);
      const diffDays = (deliveryDate.getTime() - acceptDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) {
        timingValid = false; // Cancellation not delivered within 3 days
      }
    }

    // canExecuteAssignment requires timing valid AND cancellation acknowledged
    const canExecuteAssignment = timingValid && newCancellationAcknowledged === true;

    // Update with raw SQL
    await sequelize.query(
      `UPDATE state_deal_compliance SET
        contract_acceptance_date = COALESCE(:contractAcceptanceDate, contract_acceptance_date),
        cancellation_delivery_date = COALESCE(:cancellationDeliveryDate, cancellation_delivery_date),
        cancellation_acknowledged = COALESCE(:cancellationAcknowledged, cancellation_acknowledged),
        assignment_execution_date = COALESCE(:assignmentExecutionDate, assignment_execution_date),
        timing_valid = :timingValid,
        can_execute_assignment = :canExecuteAssignment,
        updated_at = NOW()
      WHERE deal_id = :dealId`,
      {
        replacements: {
          dealId: parseInt(dealId),
          contractAcceptanceDate: contractAcceptanceDate || null,
          cancellationDeliveryDate: cancellationDeliveryDate || null,
          cancellationAcknowledged: cancellationAcknowledged ?? null,
          assignmentExecutionDate: assignmentExecutionDate || null,
          timingValid,
          canExecuteAssignment,
        },
      }
    );

    // Update workflow if timing passes
    if (timingValid) {
      await sequelize.query(
        `UPDATE state_workflow_state SET
          phase_completions = phase_completions || '{"10": true}'::jsonb,
          current_phase = GREATEST(current_phase, 11),
          last_advanced_at = NOW(),
          updated_at = NOW()
        WHERE deal_id = :dealId AND state = :state`,
        { replacements: { dealId: parseInt(dealId), state: complianceRecord.state } }
      );
    }

    res.json({
      success: true,
      data: {
        timingValid,
        canExecuteAssignment,
      },
    });
  } catch (error) {
    console.error('Error updating timing:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update timing',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/assignment:
 *   post:
 *     summary: Record assignment execution (Phase 11)
 *     tags: [State Compliance]
 */
export async function recordAssignment(req: Request, res: Response) {
  try {
    await ensureModels();
    const { dealId } = req.params;
    const { assigneeName, assigneeEntityType, assignmentFee, assignmentExecutionDate, details } = req.body;

    // Use raw SQL to get compliance record
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const complianceRecord = (complianceResults as any[])?.[0];

    if (!complianceRecord) {
      return res.status(404).json({
        success: false,
        error: `No compliance record found for deal: ${dealId}`,
      });
    }

    // Check if assignment is allowed
    if (!complianceRecord.can_execute_assignment) {
      return res.status(400).json({
        success: false,
        error: 'Cannot execute assignment - timing validation not complete',
        timingValid: complianceRecord.timing_valid,
        cancellationAcknowledged: complianceRecord.cancellation_acknowledged,
      });
    }

    const execDate = assignmentExecutionDate ? new Date(assignmentExecutionDate) : new Date();

    // Update assignment fields with raw SQL
    await sequelize.query(
      `UPDATE state_deal_compliance SET
        assignee_name = :assigneeName,
        assignee_entity_type = :assigneeEntityType,
        assignment_fee = :assignmentFee,
        assignment_execution_date = :assignmentExecutionDate,
        phase11_details = COALESCE(:details::jsonb, phase11_details),
        updated_at = NOW()
      WHERE deal_id = :dealId`,
      {
        replacements: {
          dealId: parseInt(dealId),
          assigneeName: assigneeName || null,
          assigneeEntityType: assigneeEntityType || null,
          assignmentFee: assignmentFee || null,
          assignmentExecutionDate: execDate,
          details: details ? JSON.stringify(details) : null,
        },
      }
    );

    // Update workflow - complete phase 11
    await sequelize.query(
      `UPDATE state_workflow_state SET
        phase_completions = phase_completions || '{"11": true}'::jsonb,
        completed_at = NOW(),
        last_advanced_at = NOW(),
        updated_at = NOW()
      WHERE deal_id = :dealId AND state = :state`,
      { replacements: { dealId: parseInt(dealId), state: complianceRecord.state } }
    );

    res.json({
      success: true,
      data: {
        assignmentRecorded: true,
        timingValid: complianceRecord.timing_valid,
        assigneeName,
        assignmentFee,
      },
    });
  } catch (error) {
    console.error('Error recording assignment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record assignment',
    });
  }
}

// ============================================================================
// WORKFLOW
// ============================================================================

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/workflow:
 *   get:
 *     summary: Get workflow state for a deal
 *     tags: [State Compliance]
 */
export async function getDealWorkflow(req: Request, res: Response) {
  try {
    await ensureModels();
    const { dealId } = req.params;

    const workflow = await StateWorkflowState.findOne({
      where: { dealId: parseInt(dealId) },
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: `No workflow found for deal: ${dealId}`,
      });
    }

    res.json({
      success: true,
      data: {
        workflow,
        completionPercentage: workflow.getCompletionPercentage(),
        incompletePha: workflow.getIncompletePhases(),
        completedPhasesInOrder: workflow.getCompletedPhasesInOrder(),
      },
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch workflow',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/workflow/complete-phase:
 *   post:
 *     summary: Mark a phase as complete (with gate enforcement)
 *     tags: [State Compliance]
 */
export async function completePhase(req: Request, res: Response) {
  try {
    await ensureModels();
    await stateComplianceEngine.initialize();

    const { dealId } = req.params;
    const { phase, skipGateCheck } = req.body;

    if (phase === undefined) {
      return res.status(400).json({
        success: false,
        error: 'phase is required',
      });
    }

    // Get workflow using raw SQL to avoid Sequelize issues
    const [workflowResults] = await sequelize.query(
      'SELECT * FROM state_workflow_state WHERE deal_id = :dealId LIMIT 1',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const workflowRecord = (workflowResults as any[])?.[0];

    if (!workflowRecord) {
      return res.status(404).json({
        success: false,
        error: `No workflow found for deal: ${dealId}`,
      });
    }

    // GATE ENFORCEMENT: Check if target phase is blocked by a gate
    if (!skipGateCheck) {
      const gateCheck = await blockingGateService.canEnterPhase(
        parseInt(dealId),
        workflowRecord.state,
        phase
      );

      if (!gateCheck.allowed) {
        return res.status(403).json({
          success: false,
          error: `Phase ${phase} blocked by gate`,
          blockedBy: gateCheck.blockedBy,
          reason: gateCheck.reason,
          missingRequirements: gateCheck.missingRequirements,
          hint: 'Complete the missing requirements before advancing to this phase',
        });
      }
    }

    // Check prerequisites (existing logic)
    const prerequisites = stateComplianceEngine.getPhasePrerequisites(workflowRecord.state, phase);
    const phaseCompletions = workflowRecord.phase_completions || {};

    // Check if all prerequisites are complete
    const prereqsMet = prerequisites.every((p: number) => phaseCompletions[p] === true);
    if (!prereqsMet && !workflowRecord.blocked) {
      return res.status(400).json({
        success: false,
        error: `Cannot complete phase ${phase} - prerequisites not met`,
        prerequisites,
        phaseCompletions,
      });
    }

    // Update workflow using raw SQL
    const newPhaseCompletions = { ...phaseCompletions, [phase]: true };
    const newCurrentPhase = Math.max(workflowRecord.current_phase, phase + 1);
    const isComplete = newCurrentPhase > workflowRecord.max_phase;

    await sequelize.query(
      `UPDATE state_workflow_state SET
        phase_completions = :phaseCompletions::jsonb,
        phase_completed_at = phase_completed_at || :phaseCompletedAt::jsonb,
        current_phase = :currentPhase,
        last_advanced_at = NOW(),
        completed_at = CASE WHEN :isComplete THEN NOW() ELSE completed_at END,
        updated_at = NOW()
      WHERE deal_id = :dealId`,
      {
        replacements: {
          dealId: parseInt(dealId),
          phaseCompletions: JSON.stringify(newPhaseCompletions),
          phaseCompletedAt: JSON.stringify({ [phase]: new Date().toISOString() }),
          currentPhase: newCurrentPhase,
          isComplete,
        },
      }
    );

    // Calculate completion percentage
    const completedCount = Object.values(newPhaseCompletions).filter((v) => v === true).length;
    const completionPercentage = Math.round((completedCount / (workflowRecord.max_phase + 1)) * 100);

    // EMIT PHASE COMPLETION EVENT for automation triggers
    if (automationEngine) {
      try {
        automationEngine.safeEmitEvent({
          id: `phase-complete-${dealId}-${phase}-${Date.now()}`,
          type: 'compliance.phase_completed',
          timestamp: new Date(),
          payload: {
            dealId: parseInt(dealId),
            state: workflowRecord.state,
            phase,
            previousPhase: workflowRecord.current_phase,
            newPhase: newCurrentPhase,
            completionPercentage,
            isWorkflowComplete: isComplete,
          },
          metadata: {
            dealId: dealId.toString(),
            sourceId: 'stateComplianceController',
          },
        });
        console.log(`[StateCompliance] Emitted phase_completed event for deal ${dealId} phase ${phase}`);
      } catch (eventError) {
        console.warn('Failed to emit phase completion event:', eventError);
      }
    }

    // TRIGGER PHASE CONTRACTS - send any auto-send contracts for the new phase
    let contractResults: any[] = [];
    try {
      contractResults = await phaseContractService.sendAllPhaseContracts(
        parseInt(dealId),
        workflowRecord.state,
        newCurrentPhase,
        'phase_enter'
      );
      if (contractResults.length > 0) {
        console.log(
          `[StateCompliance] Sent ${contractResults.length} contracts for deal ${dealId} phase ${newCurrentPhase}`
        );
      }
    } catch (contractError) {
      console.warn('Failed to send phase contracts:', contractError);
    }

    res.json({
      success: true,
      data: {
        currentPhase: newCurrentPhase,
        phaseCompletions: newPhaseCompletions,
        completionPercentage,
        completedAt: isComplete ? new Date().toISOString() : null,
        contractsSent: contractResults.filter((r) => r.success).length,
        contractErrors: contractResults.filter((r) => !r.success).map((r) => r.error),
      },
    });
  } catch (error) {
    console.error('Error completing phase:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete phase',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/workflow/block:
 *   post:
 *     summary: Block workflow with reason
 *     tags: [State Compliance]
 */
export async function blockWorkflow(req: Request, res: Response) {
  try {
    await ensureModels();
    const { dealId } = req.params;
    const { reason, gateId } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'reason is required',
      });
    }

    const workflow = await StateWorkflowState.findOne({
      where: { dealId: parseInt(dealId) },
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: `No workflow found for deal: ${dealId}`,
      });
    }

    await workflow.block(reason, gateId);

    res.json({
      success: true,
      data: {
        blocked: workflow.blocked,
        blockedReason: workflow.blockedReason,
        blockedAtPhase: workflow.blockedAtPhase,
        blockedByGate: workflow.blockedByGate,
      },
    });
  } catch (error) {
    console.error('Error blocking workflow:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to block workflow',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/workflow/unblock:
 *   post:
 *     summary: Unblock workflow
 *     tags: [State Compliance]
 */
export async function unblockWorkflow(req: Request, res: Response) {
  try {
    await ensureModels();
    const { dealId } = req.params;

    const workflow = await StateWorkflowState.findOne({
      where: { dealId: parseInt(dealId) },
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: `No workflow found for deal: ${dealId}`,
      });
    }

    await workflow.unblock();

    res.json({
      success: true,
      data: {
        blocked: workflow.blocked,
        currentPhase: workflow.currentPhase,
      },
    });
  } catch (error) {
    console.error('Error unblocking workflow:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unblock workflow',
    });
  }
}

// ============================================================================
// BLOCKING GATE ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/gates:
 *   get:
 *     summary: Get gate status for a deal
 *     description: Evaluates all blocking gates and returns their status
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: state
 *         required: false
 *         schema:
 *           type: string
 *         description: State code (defaults to OK)
 *     responses:
 *       200:
 *         description: Gate status summary
 */
export async function getGateStatus(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();

    const { dealId } = req.params;
    const state = (req.query.state as string) || 'OK';

    const summary = await blockingGateService.evaluateAllGates(parseInt(dealId), state);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error getting gate status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get gate status',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/gates/can-advance:
 *   get:
 *     summary: Check if deal can advance to a specific phase
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: targetPhase
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: state
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Whether advancement is allowed
 */
export async function canAdvanceToPhase(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();

    const { dealId } = req.params;
    const targetPhase = parseInt(req.query.targetPhase as string);
    const state = (req.query.state as string) || 'OK';

    if (isNaN(targetPhase)) {
      return res.status(400).json({
        success: false,
        error: 'targetPhase query parameter is required',
      });
    }

    const result = await blockingGateService.canEnterPhase(parseInt(dealId), state, targetPhase);

    res.json({
      success: true,
      data: {
        targetPhase,
        ...result,
      },
    });
  } catch (error) {
    console.error('Error checking phase advancement:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check phase advancement',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/gates/summary:
 *   get:
 *     summary: Get human-readable gate summary
 *     tags: [State Compliance]
 */
export async function getGateSummaryText(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();

    const { dealId } = req.params;
    const state = (req.query.state as string) || 'OK';

    const summaryText = await blockingGateService.getGateSummaryText(parseInt(dealId), state);

    res.json({
      success: true,
      data: {
        summary: summaryText,
      },
    });
  } catch (error) {
    console.error('Error getting gate summary:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get gate summary',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/gates/{gateId}:
 *   get:
 *     summary: Get status of a specific gate
 *     tags: [State Compliance]
 */
export async function getSpecificGateStatus(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();

    const { dealId, gateId } = req.params;
    const state = (req.query.state as string) || 'OK';

    const summary = await blockingGateService.evaluateAllGates(parseInt(dealId), state);
    const gate = summary.gates.find((g) => g.gateId === gateId);

    if (!gate) {
      return res.status(404).json({
        success: false,
        error: `Gate ${gateId} not found for state ${state}`,
      });
    }

    res.json({
      success: true,
      data: gate,
    });
  } catch (error) {
    console.error('Error getting specific gate status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get gate status',
    });
  }
}

// ============================================================================
// PHASE-SPECIFIC ENDPOINTS (Oklahoma Workflow)
// ============================================================================

/**
 * @swagger
 * /api/state-compliance/states/{state}/transaction-types:
 *   get:
 *     summary: Get allowed transaction types for a state
 *     tags: [State Compliance]
 */
export async function getTransactionTypes(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();
    const { state } = req.params;

    const types = stateComplianceEngine.getAllowedTransactionTypes(state.toUpperCase());

    res.json({
      success: true,
      data: types,
    });
  } catch (error) {
    console.error('Error fetching transaction types:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch transaction types',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/states/{state}/distribution-channels:
 *   get:
 *     summary: Get available distribution channels for a state
 *     tags: [State Compliance]
 */
export async function getDistributionChannels(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();
    const { state } = req.params;

    const channels = stateComplianceEngine.getDistributionChannelOptions(state.toUpperCase());

    res.json({
      success: true,
      data: channels,
    });
  } catch (error) {
    console.error('Error fetching distribution channels:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch distribution channels',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/states/{state}/broker-decisions:
 *   get:
 *     summary: Get broker decision options
 *     tags: [State Compliance]
 */
export async function getBrokerDecisions(req: Request, res: Response) {
  try {
    await stateComplianceEngine.initialize();

    const decisions = stateComplianceEngine.getBrokerDecisionOptions();

    res.json({
      success: true,
      data: decisions,
    });
  } catch (error) {
    console.error('Error fetching broker decisions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch broker decisions',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/phase1:
 *   post:
 *     summary: Update Phase 1 (Transaction Type)
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionType
 *             properties:
 *               transactionType:
 *                 type: string
 *                 enum: [wholesale, novation, double_closing]
 */
export async function updatePhase1(req: Request, res: Response) {
  try {
    await ensureModels();
    await stateComplianceEngine.initialize();

    const { dealId } = req.params;
    const { transactionType } = req.body;

    if (!transactionType) {
      return res.status(400).json({
        success: false,
        error: 'transactionType is required',
      });
    }

    // Get compliance record
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const complianceRecord = (complianceResults as any[])?.[0];

    if (!complianceRecord) {
      return res.status(404).json({
        success: false,
        error: `No compliance record found for deal: ${dealId}`,
      });
    }

    // Validate transaction type for state
    const validation = stateComplianceEngine.validateTransactionType(
      complianceRecord.state,
      transactionType
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    // Update compliance record
    await sequelize.query(
      `UPDATE state_deal_compliance SET
        transaction_type = :transactionType,
        updated_at = NOW()
      WHERE deal_id = :dealId`,
      {
        replacements: {
          dealId: parseInt(dealId),
          transactionType,
        },
      }
    );

    // Complete phase 1 in workflow
    await sequelize.query(
      `UPDATE state_workflow_state SET
        phase_completions = phase_completions || '{"1": true}'::jsonb,
        phase_completed_at = phase_completed_at || :phaseCompletedAt::jsonb,
        current_phase = GREATEST(current_phase, 2),
        last_advanced_at = NOW(),
        updated_at = NOW()
      WHERE deal_id = :dealId AND state = :state`,
      {
        replacements: {
          dealId: parseInt(dealId),
          state: complianceRecord.state,
          phaseCompletedAt: JSON.stringify({ '1': new Date().toISOString() }),
        },
      }
    );

    res.json({
      success: true,
      data: {
        transactionType,
        phaseCompleted: true,
      },
    });
  } catch (error) {
    console.error('Error updating Phase 1:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update Phase 1',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/phase6:
 *   post:
 *     summary: Update Phase 6 (Distribution Channels)
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - distributionChannels
 *             properties:
 *               distributionChannels:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [auction, funds, private_buyers]
 */
export async function updatePhase6(req: Request, res: Response) {
  try {
    await ensureModels();
    await stateComplianceEngine.initialize();

    const { dealId } = req.params;
    const { distributionChannels } = req.body;

    if (!distributionChannels || !Array.isArray(distributionChannels)) {
      return res.status(400).json({
        success: false,
        error: 'distributionChannels array is required',
      });
    }

    // Get compliance record
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const complianceRecord = (complianceResults as any[])?.[0];

    if (!complianceRecord) {
      return res.status(404).json({
        success: false,
        error: `No compliance record found for deal: ${dealId}`,
      });
    }

    // Validate distribution channels
    const validation = stateComplianceEngine.validateDistributionChannels(
      complianceRecord.state,
      distributionChannels
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    // Get required agreements based on channels
    const requiredAgreements = stateComplianceEngine.getRequiredAgreements(
      complianceRecord.state,
      distributionChannels
    );

    // Update state_specific_data with distribution channels
    const currentStateData = complianceRecord.state_specific_data || {};
    const newStateData = {
      ...currentStateData,
      distributionChannels,
    };

    await sequelize.query(
      `UPDATE state_deal_compliance SET
        state_specific_data = :stateSpecificData::jsonb,
        updated_at = NOW()
      WHERE deal_id = :dealId`,
      {
        replacements: {
          dealId: parseInt(dealId),
          stateSpecificData: JSON.stringify(newStateData),
        },
      }
    );

    // Complete phase 6 in workflow
    await sequelize.query(
      `UPDATE state_workflow_state SET
        phase_completions = phase_completions || '{"6": true}'::jsonb,
        phase_completed_at = phase_completed_at || :phaseCompletedAt::jsonb,
        current_phase = GREATEST(current_phase, 7),
        last_advanced_at = NOW(),
        updated_at = NOW()
      WHERE deal_id = :dealId AND state = :state`,
      {
        replacements: {
          dealId: parseInt(dealId),
          state: complianceRecord.state,
          phaseCompletedAt: JSON.stringify({ '6': new Date().toISOString() }),
        },
      }
    );

    // Trigger required agreements (Phase 7)
    const triggerResult = await agreementTriggerService.onPhase6Complete(
      parseInt(dealId),
      complianceRecord.state
    );

    res.json({
      success: true,
      data: {
        distributionChannels,
        requiredAgreements,
        triggeredAgreements: triggerResult.triggeredAgreements,
        pendingAgreements: triggerResult.pendingAgreements,
        warnings: [...(validation.warnings || []), ...triggerResult.errors],
        phaseCompleted: true,
      },
    });
  } catch (error) {
    console.error('Error updating Phase 6:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update Phase 6',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/phase8:
 *   post:
 *     summary: Record Broker Review (Phase 8)
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reviewedBy
 *               - decision
 *             properties:
 *               reviewedBy:
 *                 type: string
 *               decision:
 *                 type: string
 *                 enum: [approved, rejected, needs_info]
 *               notes:
 *                 type: string
 */
export async function updatePhase8(req: Request, res: Response) {
  try {
    await ensureModels();
    await stateComplianceEngine.initialize();

    const { dealId } = req.params;
    const { reviewedBy, decision, notes } = req.body;

    if (!reviewedBy || !decision) {
      return res.status(400).json({
        success: false,
        error: 'reviewedBy and decision are required',
      });
    }

    // Validate broker review
    const validation = stateComplianceEngine.validateBrokerReview(decision, notes);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    // Get compliance record
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const complianceRecord = (complianceResults as any[])?.[0];

    if (!complianceRecord) {
      return res.status(404).json({
        success: false,
        error: `No compliance record found for deal: ${dealId}`,
      });
    }

    // Determine if canDistribute based on decision and overall status
    const canDistribute = decision === 'approved' && complianceRecord.overall_status === 'GREEN';

    // Update compliance record with broker review
    await sequelize.query(
      `UPDATE state_deal_compliance SET
        broker_reviewed = true,
        broker_reviewed_by = :reviewedBy,
        broker_reviewed_at = NOW(),
        broker_decision = :decision,
        broker_notes = :notes,
        can_distribute = :canDistribute,
        updated_at = NOW()
      WHERE deal_id = :dealId`,
      {
        replacements: {
          dealId: parseInt(dealId),
          reviewedBy,
          decision,
          notes: notes || null,
          canDistribute,
        },
      }
    );

    // Complete phase 8 in workflow if approved
    if (decision === 'approved') {
      await sequelize.query(
        `UPDATE state_workflow_state SET
          phase_completions = phase_completions || '{"8": true}'::jsonb,
          phase_completed_at = phase_completed_at || :phaseCompletedAt::jsonb,
          current_phase = GREATEST(current_phase, 9),
          last_advanced_at = NOW(),
          updated_at = NOW()
        WHERE deal_id = :dealId AND state = :state`,
        {
          replacements: {
            dealId: parseInt(dealId),
            state: complianceRecord.state,
            phaseCompletedAt: JSON.stringify({ '8': new Date().toISOString() }),
          },
        }
      );
    }

    res.json({
      success: true,
      data: {
        brokerReviewed: true,
        reviewedBy,
        decision,
        canDistribute,
        phaseCompleted: decision === 'approved',
      },
    });
  } catch (error) {
    console.error('Error updating Phase 8:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update Phase 8',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/phase9:
 *   post:
 *     summary: Update Distribution Status (Phase 9)
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, in_progress, completed, failed]
 *               notes:
 *                 type: string
 */
export async function updatePhase9(req: Request, res: Response) {
  try {
    await ensureModels();
    const { dealId } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'status is required',
      });
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Get compliance record
    const [complianceResults] = await sequelize.query(
      'SELECT * FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1',
      { replacements: { dealId: parseInt(dealId) } }
    );
    const complianceRecord = (complianceResults as any[])?.[0];

    if (!complianceRecord) {
      return res.status(404).json({
        success: false,
        error: `No compliance record found for deal: ${dealId}`,
      });
    }

    // Check if broker has approved before allowing distribution
    if (status === 'in_progress' && complianceRecord.broker_decision !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Cannot start distribution without broker approval',
      });
    }

    // Determine if we should set distribution_started_at
    const shouldSetStartedAt = status === 'in_progress' && !complianceRecord.distribution_started_at;

    // Update compliance record
    await sequelize.query(
      `UPDATE state_deal_compliance SET
        distribution_status = :status,
        distribution_notes = :notes,
        distribution_started_at = CASE WHEN :shouldSetStartedAt THEN NOW() ELSE distribution_started_at END,
        updated_at = NOW()
      WHERE deal_id = :dealId`,
      {
        replacements: {
          dealId: parseInt(dealId),
          status,
          notes: notes || null,
          shouldSetStartedAt,
        },
      }
    );

    // Complete phase 9 in workflow if completed
    if (status === 'completed') {
      await sequelize.query(
        `UPDATE state_workflow_state SET
          phase_completions = phase_completions || '{"9": true}'::jsonb,
          phase_completed_at = phase_completed_at || :phaseCompletedAt::jsonb,
          current_phase = GREATEST(current_phase, 10),
          last_advanced_at = NOW(),
          updated_at = NOW()
        WHERE deal_id = :dealId AND state = :state`,
        {
          replacements: {
            dealId: parseInt(dealId),
            state: complianceRecord.state,
            phaseCompletedAt: JSON.stringify({ '9': new Date().toISOString() }),
          },
        }
      );
    }

    res.json({
      success: true,
      data: {
        distributionStatus: status,
        distributionNotes: notes,
        phaseCompleted: status === 'completed',
      },
    });
  } catch (error) {
    console.error('Error updating Phase 9:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update Phase 9',
    });
  }
}

// ============================================================================
// PHASE CONTRACT ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/phase/{phase}/contracts:
 *   get:
 *     summary: Get contracts required for a phase
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: phase
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of contracts for the phase
 */
export async function getPhaseContracts(req: Request, res: Response) {
  try {
    const { dealId, phase } = req.params;
    const state = (req.query.state as string) || 'OK';

    const contracts = await phaseContractService.getPhaseContracts(
      parseInt(dealId),
      state,
      parseInt(phase)
    );

    // Collect all missing signers across contracts
    const allMissingSigners: any[] = [];
    const seenRoles = new Set<string>();
    for (const c of contracts) {
      if (c.missingSigners?.length) {
        for (const missing of c.missingSigners) {
          if (!seenRoles.has(missing.role)) {
            seenRoles.add(missing.role);
            allMissingSigners.push(missing);
          }
        }
      }
    }

    res.json({
      success: true,
      data: contracts.map((c) => ({
        templateId: c.template.id,
        templateName: c.template.name,
        category: c.template.category,
        required: c.required,
        conditionsMet: c.conditionsMet,
        alreadySent: c.alreadySent,
        submissionStatus: c.submissionStatus,
        submissionId: c.submissionId,
        signerRoles: c.template.signerRoles,
        autoSend: c.template.autoSend,
        missingSigners: c.missingSigners,
      })),
      count: contracts.length,
      missingSigners: allMissingSigners,
      canSendAll: allMissingSigners.length === 0,
    });
  } catch (error) {
    console.error('Error fetching phase contracts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch phase contracts',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/phase/{phase}/contracts/send:
 *   post:
 *     summary: Send contracts for a phase (manual trigger)
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: phase
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               templateId:
 *                 type: integer
 *                 description: Specific template ID (optional - sends all if not provided)
 *               state:
 *                 type: string
 */
export async function sendPhaseContracts(req: Request, res: Response) {
  try {
    const { dealId, phase } = req.params;
    const { templateId, state: bodyState } = req.body;
    const state = bodyState || (req.query.state as string) || 'OK';

    let results;
    if (templateId) {
      // Send specific contract
      const result = await phaseContractService.sendPhaseContract(
        parseInt(dealId),
        state,
        parseInt(phase),
        templateId
      );
      results = [result];
    } else {
      // Send all contracts for phase
      results = await phaseContractService.sendAllPhaseContracts(
        parseInt(dealId),
        state,
        parseInt(phase),
        'manual'
      );
    }

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    res.json({
      success: failed.length === 0,
      data: {
        sent: successful.length,
        failed: failed.length,
        results: results.map((r) => ({
          templateName: r.templateName,
          category: r.category,
          success: r.success,
          submissionId: r.submissionId,
          error: r.error,
        })),
      },
    });
  } catch (error) {
    console.error('Error sending phase contracts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send phase contracts',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/phase/{phase}/contracts/status:
 *   get:
 *     summary: Get signing status of phase contracts
 *     tags: [State Compliance]
 */
export async function getPhaseContractStatus(req: Request, res: Response) {
  try {
    const { dealId, phase } = req.params;
    const state = (req.query.state as string) || 'OK';

    const status = await phaseContractService.getPhaseContractStatus(
      parseInt(dealId),
      state,
      parseInt(phase)
    );

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Error fetching contract status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch contract status',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/contracts/all:
 *   get:
 *     summary: Get all contracts across all phases for a deal
 *     tags: [State Compliance]
 */
export async function getAllDealContracts(req: Request, res: Response) {
  try {
    const { dealId } = req.params;
    const state = (req.query.state as string) || 'OK';

    // Get max phase
    await stateComplianceEngine.initialize();
    const maxPhase = stateComplianceEngine.getMaxPhase(state);

    // Collect contracts from all phases
    const allContracts: any[] = [];
    for (let phase = 0; phase <= maxPhase; phase++) {
      const contracts = await phaseContractService.getPhaseContracts(
        parseInt(dealId),
        state,
        phase
      );
      for (const c of contracts) {
        allContracts.push({
          phase,
          templateId: c.template.id,
          templateName: c.template.name,
          category: c.template.category,
          required: c.required,
          conditionsMet: c.conditionsMet,
          alreadySent: c.alreadySent,
          submissionStatus: c.submissionStatus,
        });
      }
    }

    res.json({
      success: true,
      data: allContracts,
      count: allContracts.length,
      summary: {
        total: allContracts.length,
        sent: allContracts.filter((c) => c.alreadySent).length,
        signed: allContracts.filter((c) => c.submissionStatus === 'completed').length,
        pending: allContracts.filter(
          (c) => c.alreadySent && c.submissionStatus !== 'completed'
        ).length,
      },
    });
  } catch (error) {
    console.error('Error fetching all deal contracts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch contracts',
    });
  }
}

// ============================================================================
// DEAD LETTER / RETRY ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/state-compliance/dead-letter/contracts:
 *   get:
 *     summary: Get failed contract sends from dead letter queue
 *     tags: [State Compliance]
 *     parameters:
 *       - in: query
 *         name: dealId
 *         schema:
 *           type: integer
 *         description: Filter by deal ID
 *     responses:
 *       200:
 *         description: Dead letter items
 */
export async function getDeadLetterContracts(req: Request, res: Response) {
  try {
    const dealId = req.query.dealId ? parseInt(req.query.dealId as string) : undefined;
    const items = await phaseContractService.getDeadLetterItems(dealId);

    res.json({
      success: true,
      data: items,
      count: items.length,
    });
  } catch (error) {
    console.error('Error fetching dead letter contracts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dead letter items',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/dead-letter/{id}/retry:
 *   post:
 *     summary: Retry a failed contract send from dead letter queue
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Dead letter queue item ID
 *     responses:
 *       200:
 *         description: Retry result
 */
export async function retryDeadLetterContract(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await phaseContractService.retryFromDeadLetter(parseInt(id));

    res.json({
      success: result.success,
      data: result,
      message: result.success
        ? 'Contract resent successfully'
        : `Retry failed: ${result.error}`,
    });
  } catch (error) {
    console.error('Error retrying dead letter contract:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retry',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/contracts/{category}/resend:
 *   post:
 *     summary: Manually resend a specific contract type for a deal
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Contract category (msa, asa, csa, etc.)
 *     responses:
 *       200:
 *         description: Resend result
 */
export async function resendContract(req: Request, res: Response) {
  try {
    const { dealId, category } = req.params;
    const state = (req.query.state as string) || 'OK';

    // Find the template for this category
    const StateDocumentTemplate = require('../models/StateDocumentTemplate').default;
    const template = await StateDocumentTemplate.getPrimaryTemplate(state, category);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `No template found for category: ${category}`,
      });
    }

    // Send the contract
    const result = await phaseContractService.sendPhaseContract(
      parseInt(dealId),
      state,
      template.phase || 0,
      template.id
    );

    res.json({
      success: result.success,
      data: result,
      message: result.success
        ? `${category.toUpperCase()} contract sent successfully`
        : `Failed to send: ${result.error}`,
    });
  } catch (error) {
    console.error('Error resending contract:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resend contract',
    });
  }
}

// ============================================================================
// SIGNER MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/signers/missing:
 *   get:
 *     summary: Get missing signers for a deal's contracts
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         default: OK
 *       - in: query
 *         name: phase
 *         schema:
 *           type: integer
 *         description: Optional phase to check (checks all if not specified)
 *     responses:
 *       200:
 *         description: Missing signers info with suggested actions
 */
export async function getMissingSigners(req: Request, res: Response) {
  try {
    const { dealId } = req.params;
    const state = (req.query.state as string) || 'OK';
    const phase = req.query.phase ? parseInt(req.query.phase as string) : undefined;

    if (phase !== undefined) {
      // Get missing signers for a specific phase
      const status = await phaseContractService.getPhaseContractStatus(
        parseInt(dealId),
        state,
        phase
      );

      return res.json({
        success: true,
        data: {
          phase,
          missingSigners: status.missingSigners,
          canSendContracts: status.missingSigners.length === 0,
        },
      });
    }

    // Get missing signers across all phases
    await stateComplianceEngine.initialize();
    const maxPhase = stateComplianceEngine.getMaxPhase(state);
    const allMissing: any[] = [];
    const seenRoles = new Set<string>();

    for (let p = 0; p <= maxPhase; p++) {
      const status = await phaseContractService.getPhaseContractStatus(
        parseInt(dealId),
        state,
        p
      );

      for (const missing of status.missingSigners) {
        if (!seenRoles.has(missing.role)) {
          seenRoles.add(missing.role);
          allMissing.push({
            ...missing,
            affectedPhases: [p],
          });
        } else {
          // Add to affected phases
          const existing = allMissing.find((m) => m.role === missing.role);
          if (existing) {
            existing.affectedPhases.push(p);
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        missingSigners: allMissing,
        totalMissing: allMissing.length,
        canSendAllContracts: allMissing.length === 0,
      },
    });
  } catch (error) {
    console.error('Error fetching missing signers:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch missing signers',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/signers/check:
 *   get:
 *     summary: Check signer availability for a specific template
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: templateId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Signer availability check result
 */
export async function checkSignerAvailability(req: Request, res: Response) {
  try {
    const { dealId } = req.params;
    const templateId = parseInt(req.query.templateId as string);

    if (!templateId) {
      return res.status(400).json({
        success: false,
        error: 'templateId query parameter is required',
      });
    }

    const StateDocumentTemplate = require('../models/StateDocumentTemplate').default;
    const template = await StateDocumentTemplate.findByPk(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `Template not found: ${templateId}`,
      });
    }

    const result = await phaseContractService.checkSignerAvailability(
      parseInt(dealId),
      template
    );

    res.json({
      success: true,
      data: {
        templateId,
        templateName: template.name,
        category: template.category,
        requiredRoles: template.signerRoles || ['wholesaler'],
        available: result.available.map((s) => ({
          role: s.role,
          name: s.name,
          email: s.email,
          source: s.source,
          verified: s.verified,
          contactId: s.contactId,
        })),
        missing: result.missing,
        canSend: result.missing.length === 0,
      },
    });
  } catch (error) {
    console.error('Error checking signer availability:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check signers',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/signers/overrides:
 *   post:
 *     summary: Set manual signer overrides for a deal
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               state:
 *                 type: string
 *                 default: OK
 *               overrides:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [seller, buyer, wholesaler, broker]
 *                     contactId:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     phone:
 *                       type: string
 *     responses:
 *       200:
 *         description: Overrides set successfully
 */
export async function setSignerOverrides(req: Request, res: Response) {
  try {
    const { dealId } = req.params;
    const { state = 'OK', overrides } = req.body;

    if (!overrides || !Array.isArray(overrides)) {
      return res.status(400).json({
        success: false,
        error: 'overrides array is required in request body',
      });
    }

    await phaseContractService.setSignerOverrides(
      parseInt(dealId),
      state,
      overrides
    );

    res.json({
      success: true,
      message: `Set ${overrides.length} signer override(s) for deal ${dealId}`,
      data: { overrides },
    });
  } catch (error) {
    console.error('Error setting signer overrides:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set signer overrides',
    });
  }
}

/**
 * @swagger
 * /api/state-compliance/deals/{dealId}/signers/overrides:
 *   delete:
 *     summary: Clear all signer overrides for a deal
 *     tags: [State Compliance]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         default: OK
 *     responses:
 *       200:
 *         description: Overrides cleared successfully
 */
export async function clearSignerOverrides(req: Request, res: Response) {
  try {
    const { dealId } = req.params;
    const state = (req.query.state as string) || 'OK';

    await phaseContractService.clearSignerOverrides(parseInt(dealId), state);

    res.json({
      success: true,
      message: `Cleared signer overrides for deal ${dealId}`,
    });
  } catch (error) {
    console.error('Error clearing signer overrides:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear signer overrides',
    });
  }
}

export default {
  getAvailableStates,
  getStateSummary,
  getStateContacts,
  getStateDocuments,
  getStateDisclosures,
  getStateRules,
  getStateGates,
  getStateExtractionProfiles,
  getDealCompliance,
  initializeDealCompliance,
  updatePhase3,
  updateDisclosures,
  validateDisclosuresFromText,
  updateTiming,
  recordAssignment,
  getDealWorkflow,
  completePhase,
  blockWorkflow,
  unblockWorkflow,
  // Gate endpoints
  getGateStatus,
  canAdvanceToPhase,
  getGateSummaryText,
  getSpecificGateStatus,
  // Phase-specific endpoints (Oklahoma workflow)
  getTransactionTypes,
  getDistributionChannels,
  getBrokerDecisions,
  updatePhase1,
  updatePhase6,
  updatePhase8,
  updatePhase9,
  // Phase contract endpoints
  getPhaseContracts,
  sendPhaseContracts,
  getPhaseContractStatus,
  getAllDealContracts,
  // Dead letter endpoints
  getDeadLetterContracts,
  retryDeadLetterContract,
  resendContract,
  // Signer management endpoints
  getMissingSigners,
  checkSignerAvailability,
  setSignerOverrides,
  clearSignerOverrides,
};
