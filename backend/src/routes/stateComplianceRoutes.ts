/**
 * State Compliance Routes
 *
 * Universal state-based compliance workflow endpoints.
 * Works with any state - loads rules from compliance-specs JSON files.
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
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
  // Contract endpoints
  getPhaseContracts,
  sendPhaseContracts,
  getPhaseContractStatus,
  getAllDealContracts,
  // Dead letter / retry endpoints
  getDeadLetterContracts,
  retryDeadLetterContract,
  resendContract,
  // Signer management endpoints
  getMissingSigners,
  checkSignerAvailability,
  setSignerOverrides,
  clearSignerOverrides,
} from '../controllers/stateComplianceController';

const router = Router();

// Async handler wrapper
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ============================================================================
// STATE SPEC ENDPOINTS
// ============================================================================

/**
 * @swagger
 * tags:
 *   name: State Compliance
 *   description: Universal state-based compliance workflow
 */

// Get available states
router.get('/states', asyncHandler(getAvailableStates));

// Get state summary
router.get('/states/:state', asyncHandler(getStateSummary));

// Get state contact requirements
router.get('/states/:state/contacts', asyncHandler(getStateContacts));

// Get state document requirements
router.get('/states/:state/documents', asyncHandler(getStateDocuments));

// Get state disclosures
router.get('/states/:state/disclosures', asyncHandler(getStateDisclosures));

// Get state rules
router.get('/states/:state/rules', asyncHandler(getStateRules));

// Get state blocking gates
router.get('/states/:state/gates', asyncHandler(getStateGates));

// Get state extraction profiles
router.get('/states/:state/extraction-profiles', asyncHandler(getStateExtractionProfiles));

// Get allowed transaction types for a state
router.get('/states/:state/transaction-types', asyncHandler(getTransactionTypes));

// Get available distribution channels for a state
router.get('/states/:state/distribution-channels', asyncHandler(getDistributionChannels));

// Get broker decision options
router.get('/states/:state/broker-decisions', asyncHandler(getBrokerDecisions));

// ============================================================================
// DEAL COMPLIANCE ENDPOINTS
// ============================================================================

// Get deal compliance status
router.get('/deals/:dealId', asyncHandler(getDealCompliance));

// Initialize compliance for a deal
router.post('/deals/:dealId/initialize', asyncHandler(initializeDealCompliance));

// Update Phase 3 (contract validation)
router.post('/deals/:dealId/phase3', asyncHandler(updatePhase3));

// Update disclosure results
router.post('/deals/:dealId/disclosures', asyncHandler(updateDisclosures));

// Validate disclosures from document text
router.post('/deals/:dealId/validate-disclosures', asyncHandler(validateDisclosuresFromText));

// Update timing validation (Phase 10)
router.post('/deals/:dealId/timing', asyncHandler(updateTiming));

// Record assignment (Phase 11)
router.post('/deals/:dealId/assignment', asyncHandler(recordAssignment));

// Update Phase 1 (Transaction Type)
router.post('/deals/:dealId/phase1', asyncHandler(updatePhase1));

// Update Phase 6 (Distribution Channels)
router.post('/deals/:dealId/phase6', asyncHandler(updatePhase6));

// Update Phase 8 (Broker Review)
router.post('/deals/:dealId/phase8', asyncHandler(updatePhase8));

// Update Phase 9 (Distribution Status)
router.post('/deals/:dealId/phase9', asyncHandler(updatePhase9));

// ============================================================================
// WORKFLOW ENDPOINTS
// ============================================================================

// Get workflow state
router.get('/deals/:dealId/workflow', asyncHandler(getDealWorkflow));

// Complete a phase
router.post('/deals/:dealId/workflow/complete-phase', asyncHandler(completePhase));

// Block workflow
router.post('/deals/:dealId/workflow/block', asyncHandler(blockWorkflow));

// Unblock workflow
router.post('/deals/:dealId/workflow/unblock', asyncHandler(unblockWorkflow));

// ============================================================================
// GATE STATUS ENDPOINTS
// ============================================================================

// Get all gate status for a deal
router.get('/deals/:dealId/gates', asyncHandler(getGateStatus));

// Check if can advance to a specific phase
router.get('/deals/:dealId/gates/can-advance', asyncHandler(canAdvanceToPhase));

// Get human-readable gate summary
router.get('/deals/:dealId/gates/summary', asyncHandler(getGateSummaryText));

// Get status of a specific gate
router.get('/deals/:dealId/gates/:gateId', asyncHandler(getSpecificGateStatus));

// ============================================================================
// CONTRACT ENDPOINTS
// ============================================================================

// Get required contracts for a phase
router.get('/deals/:dealId/phase/:phase/contracts', asyncHandler(getPhaseContracts));

// Send contracts for a phase (manual trigger)
router.post('/deals/:dealId/phase/:phase/contracts/send', asyncHandler(sendPhaseContracts));

// Get contract status for a phase
router.get('/deals/:dealId/phase/:phase/contracts/status', asyncHandler(getPhaseContractStatus));

// Get all contracts for a deal (across all phases)
router.get('/deals/:dealId/contracts/all', asyncHandler(getAllDealContracts));

// Manually resend a specific contract type
router.post('/deals/:dealId/contracts/:category/resend', asyncHandler(resendContract));

// ============================================================================
// DEAD LETTER / RETRY ENDPOINTS
// ============================================================================

// Get failed contract sends from dead letter queue
router.get('/dead-letter/contracts', asyncHandler(getDeadLetterContracts));

// Retry a failed contract send
router.post('/dead-letter/:id/retry', asyncHandler(retryDeadLetterContract));

// ============================================================================
// SIGNER MANAGEMENT ENDPOINTS
// ============================================================================

// Get missing signers for a deal (all phases or specific phase)
router.get('/deals/:dealId/signers/missing', asyncHandler(getMissingSigners));

// Check signer availability for a specific template
router.get('/deals/:dealId/signers/check', asyncHandler(checkSignerAvailability));

// Set manual signer overrides
router.post('/deals/:dealId/signers/overrides', asyncHandler(setSignerOverrides));

// Clear signer overrides
router.delete('/deals/:dealId/signers/overrides', asyncHandler(clearSignerOverrides));

export default router;
