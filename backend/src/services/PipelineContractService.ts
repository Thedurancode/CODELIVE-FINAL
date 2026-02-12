/**
 * Pipeline Contract Service
 *
 * Bridges pipeline stage changes with automatic contract sending.
 * Maps pipeline stages to compliance phases and triggers PhaseContractService.
 *
 * Flow:
 * 1. Pipeline stage changes (via PipelineService.updateStage)
 * 2. This service maps stage → compliance phase
 * 3. Triggers PhaseContractService.sendAllPhaseContracts()
 * 4. Contracts are sent in parallel to appropriate signers
 */

import { PipelineStage } from '../models/DealPipeline';
import { Property } from '../models';
import { phaseContractService } from './PhaseContractService';
import { TriggerOn } from './PhaseContractService';

// ============================================================================
// STAGE TO PHASE MAPPING
// ============================================================================

/**
 * Maps pipeline stages to compliance phases.
 * Each stage can trigger contracts for a specific phase.
 *
 * Phase definitions:
 * 0 - Account Setup (initial onboarding docs)
 * 1 - Property Submission (initial deal docs)
 * 2 - Compliance Review (due diligence docs)
 * 3 - Pre-Distribution (wholesaler disclosures)
 * 4 - Offer Accepted (seller contracts)
 * 5 - Buyer Contract (assignment/buyer docs)
 * 6 - Closing (final closing docs)
 */
const STAGE_TO_PHASE_MAP: Partial<Record<PipelineStage, number>> = {
  // When deal enters due diligence, send compliance review docs (phase 2)
  due_diligence: 2,

  // When deal is offered, send pre-distribution docs (phase 3)
  offered: 3,

  // When negotiating, send seller contracts (phase 4)
  negotiating: 4,

  // When under contract, send buyer/assignment docs (phase 5)
  under_contract: 5,

  // When closed won, send final closing docs (phase 6)
  closed_won: 6,
};

/**
 * For "phase_complete" triggers - when exiting a stage
 */
const STAGE_EXIT_PHASE_MAP: Partial<Record<PipelineStage, number>> = {
  // When leaving due_diligence (completed), trigger phase 2 complete
  due_diligence: 2,

  // When leaving offered (offer accepted), trigger phase 3 complete
  offered: 3,

  // When leaving negotiating (deal struck), trigger phase 4 complete
  negotiating: 4,
};

// ============================================================================
// SERVICE
// ============================================================================

export interface ContractTriggerResult {
  triggered: boolean;
  phase?: number;
  triggerType?: TriggerOn;
  contractsSent: number;
  contractsFailed: number;
  results: Array<{
    templateName: string;
    success: boolean;
    error?: string;
    submissionId?: number;
  }>;
}

class PipelineContractService {
  /**
   * Handle pipeline stage change and trigger appropriate contracts
   *
   * @param propertyId - The property/deal ID
   * @param previousStage - Stage we're leaving
   * @param newStage - Stage we're entering
   * @returns Results of contract sending
   */
  async handleStageChange(
    propertyId: number,
    previousStage: PipelineStage,
    newStage: PipelineStage
  ): Promise<ContractTriggerResult[]> {
    const results: ContractTriggerResult[] = [];

    // Get property state for template lookup
    const property = await Property.findByPk(propertyId);
    if (!property?.state) {
      console.log(
        `[PipelineContractService] No property or state for ID ${propertyId}`
      );
      return results;
    }

    const state = property.state.toUpperCase();

    // 1. Handle "phase_complete" trigger for the stage we're LEAVING
    const exitPhase = STAGE_EXIT_PHASE_MAP[previousStage];
    if (exitPhase !== undefined) {
      const exitResult = await this.triggerPhaseContracts(
        propertyId,
        state,
        exitPhase,
        'phase_complete',
        previousStage
      );
      results.push(exitResult);
    }

    // 2. Handle "phase_enter" trigger for the stage we're ENTERING
    const enterPhase = STAGE_TO_PHASE_MAP[newStage];
    if (enterPhase !== undefined) {
      const enterResult = await this.triggerPhaseContracts(
        propertyId,
        state,
        enterPhase,
        'phase_enter',
        newStage
      );
      results.push(enterResult);
    }

    return results;
  }

  /**
   * Trigger contracts for a specific phase
   */
  private async triggerPhaseContracts(
    propertyId: number,
    state: string,
    phase: number,
    triggerType: TriggerOn,
    stage: PipelineStage
  ): Promise<ContractTriggerResult> {
    console.log(
      `[PipelineContractService] Triggering ${triggerType} contracts for ${state} phase ${phase} (stage: ${stage})`
    );

    try {
      const sendResults = await phaseContractService.sendAllPhaseContracts(
        propertyId,
        state,
        phase,
        triggerType
      );

      const successful = sendResults.filter((r) => r.success);
      const failed = sendResults.filter((r) => !r.success);

      if (sendResults.length > 0) {
        console.log(
          `[PipelineContractService] ${triggerType} results: ${successful.length} sent, ${failed.length} failed`
        );
      }

      return {
        triggered: true,
        phase,
        triggerType,
        contractsSent: successful.length,
        contractsFailed: failed.length,
        results: sendResults.map((r) => ({
          templateName: r.templateName,
          success: r.success,
          error: r.error,
          submissionId: r.submissionId,
        })),
      };
    } catch (error) {
      console.error(
        `[PipelineContractService] Error triggering ${triggerType} contracts:`,
        error
      );
      return {
        triggered: false,
        phase,
        triggerType,
        contractsSent: 0,
        contractsFailed: 1,
        results: [
          {
            templateName: 'Unknown',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  /**
   * Get the compliance phase for a pipeline stage
   */
  getPhaseForStage(stage: PipelineStage): number | undefined {
    return STAGE_TO_PHASE_MAP[stage];
  }

  /**
   * Get all stage-to-phase mappings (for debugging/admin UI)
   */
  getStagePhaseMappings(): {
    enterMappings: Record<string, number>;
    exitMappings: Record<string, number>;
  } {
    return {
      enterMappings: { ...STAGE_TO_PHASE_MAP } as Record<string, number>,
      exitMappings: { ...STAGE_EXIT_PHASE_MAP } as Record<string, number>,
    };
  }

  /**
   * Manually trigger contracts for a deal at a specific phase
   * Useful for admin/testing or re-sending
   */
  async manualTrigger(
    propertyId: number,
    phase: number,
    triggerType: TriggerOn = 'manual'
  ): Promise<ContractTriggerResult> {
    const property = await Property.findByPk(propertyId);
    if (!property?.state) {
      return {
        triggered: false,
        contractsSent: 0,
        contractsFailed: 0,
        results: [
          {
            templateName: 'N/A',
            success: false,
            error: 'Property not found or missing state',
          },
        ],
      };
    }

    const state = property.state.toUpperCase();

    console.log(
      `[PipelineContractService] Manual trigger for ${state} phase ${phase}`
    );

    try {
      const sendResults = await phaseContractService.sendAllPhaseContracts(
        propertyId,
        state,
        phase,
        triggerType
      );

      const successful = sendResults.filter((r) => r.success);
      const failed = sendResults.filter((r) => !r.success);

      return {
        triggered: true,
        phase,
        triggerType,
        contractsSent: successful.length,
        contractsFailed: failed.length,
        results: sendResults.map((r) => ({
          templateName: r.templateName,
          success: r.success,
          error: r.error,
          submissionId: r.submissionId,
        })),
      };
    } catch (error) {
      return {
        triggered: false,
        phase,
        triggerType,
        contractsSent: 0,
        contractsFailed: 1,
        results: [
          {
            templateName: 'Unknown',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }
}

export const pipelineContractService = new PipelineContractService();
export default pipelineContractService;
