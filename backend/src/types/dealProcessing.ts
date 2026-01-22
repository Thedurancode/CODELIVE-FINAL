/**
 * Deal Processing Types
 *
 * Defines the state machine and types for the improved deal processing flow.
 */

/**
 * Deal Processing State Machine
 *
 * States and valid transitions:
 *
 * CREATED → COMPLIANCE_PENDING
 * COMPLIANCE_PENDING → COMPLIANCE_PASSED | COMPLIANCE_FAILED
 * COMPLIANCE_PASSED → SCORING
 * COMPLIANCE_FAILED → BLOCKED (terminal)
 * SCORING → SCORED
 * SCORED → APPROVAL_PENDING
 * APPROVAL_PENDING → ACTIVE | REJECTED
 * ACTIVE (terminal - visible in marketplace)
 * REJECTED (terminal)
 * BLOCKED (terminal)
 */
export enum DealProcessingState {
  // Initial state when deal is created
  CREATED = 'created',

  // Compliance check in progress
  COMPLIANCE_PENDING = 'compliance_pending',

  // Compliance passed, ready for scoring
  COMPLIANCE_PASSED = 'compliance_passed',

  // Compliance failed, deal blocked
  COMPLIANCE_FAILED = 'compliance_failed',

  // Scoring in progress
  SCORING = 'scoring',

  // Scoring complete
  SCORED = 'scored',

  // Waiting for broker approval
  APPROVAL_PENDING = 'approval_pending',

  // Deal is live and visible
  ACTIVE = 'active',

  // Deal was rejected by broker
  REJECTED = 'rejected',

  // Deal is blocked due to compliance issues
  BLOCKED = 'blocked',
}

/**
 * Valid state transitions
 */
export const VALID_TRANSITIONS: Record<DealProcessingState, DealProcessingState[]> = {
  [DealProcessingState.CREATED]: [DealProcessingState.COMPLIANCE_PENDING],
  [DealProcessingState.COMPLIANCE_PENDING]: [
    DealProcessingState.COMPLIANCE_PASSED,
    DealProcessingState.COMPLIANCE_FAILED,
  ],
  [DealProcessingState.COMPLIANCE_PASSED]: [DealProcessingState.SCORING],
  [DealProcessingState.COMPLIANCE_FAILED]: [DealProcessingState.BLOCKED],
  [DealProcessingState.SCORING]: [DealProcessingState.SCORED],
  [DealProcessingState.SCORED]: [DealProcessingState.APPROVAL_PENDING],
  [DealProcessingState.APPROVAL_PENDING]: [
    DealProcessingState.ACTIVE,
    DealProcessingState.REJECTED,
  ],
  // Terminal states - no transitions out
  [DealProcessingState.ACTIVE]: [],
  [DealProcessingState.REJECTED]: [],
  [DealProcessingState.BLOCKED]: [],
};

/**
 * Terminal states - processing is complete
 */
export const TERMINAL_STATES: DealProcessingState[] = [
  DealProcessingState.ACTIVE,
  DealProcessingState.REJECTED,
  DealProcessingState.BLOCKED,
];

/**
 * States where deal is visible in queries
 */
export const VISIBLE_STATES: DealProcessingState[] = [
  DealProcessingState.ACTIVE,
];

/**
 * Check if a state transition is valid
 */
export function isValidTransition(
  from: DealProcessingState,
  to: DealProcessingState
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Check if a state is terminal
 */
export function isTerminalState(state: DealProcessingState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Check if a deal in this state should be visible
 */
export function isVisibleState(state: DealProcessingState): boolean {
  return VISIBLE_STATES.includes(state);
}

/**
 * Deal processing job payload
 */
export interface DealProcessingJob {
  propertyId: number;
  sourceId: string;
  sourceName: string;
  triggeredAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Processing step result
 */
export interface ProcessingStepResult {
  success: boolean;
  step: string;
  duration: number;
  data?: Record<string, any>;
  error?: string;
}

/**
 * Full processing result
 */
export interface DealProcessingResult {
  propertyId: number;
  success: boolean;
  finalState: DealProcessingState;
  steps: ProcessingStepResult[];
  totalDuration: number;
  error?: string;
}

/**
 * State transition event for audit logging
 */
export interface StateTransitionEvent {
  propertyId: number;
  fromState: DealProcessingState;
  toState: DealProcessingState;
  reason?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}
