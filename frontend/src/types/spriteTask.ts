/**
 * Sprite Task Types
 *
 * Types for the sprite task queue system.
 */

// Task status lifecycle
export type SpriteTaskStatus =
  | 'pending'      // Waiting in queue
  | 'assigned'     // Assigned to a sprite, waiting to start
  | 'in_progress'  // Sprite is actively working on it
  | 'pr_created'   // PR has been created, waiting for review/merge
  | 'completed'    // Task completed (PR merged or manually closed)
  | 'failed'       // Task failed (error during execution)
  | 'cancelled';   // Task was cancelled

// Task priority levels
export type SpriteTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// Task source - where did this task come from
export type SpriteTaskSource = 'manual' | 'github_issue' | 'github_label' | 'automation';

// Main SpriteTask entity
export interface SpriteTask {
  id: string;
  projectId: string;
  organizationId: string;
  spriteId: string | null;

  // Task details
  title: string;
  description: string | null;
  prompt: string | null;

  // Status
  status: SpriteTaskStatus;
  priority: SpriteTaskPriority;
  statusMessage: string | null;
  errorMessage: string | null;

  // Source tracking
  source: SpriteTaskSource;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;

  // Branch & PR
  branchName: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;

  // Timing
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;

  // Audit
  createdById: string | null;
  assignedById: string | null;

  createdAt: string;
  updatedAt: string;
}

// Create task options
export interface CreateSpriteTaskOptions {
  projectId: string;
  title: string;
  description?: string;
  prompt?: string;
  priority?: SpriteTaskPriority;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
}

// Queue statistics
export interface SpriteTaskQueueStats {
  pending: number;
  inProgress: number;
  prCreated: number;
  completed: number;
  failed: number;
  total: number;
}

// Status badge color mapping
export const SPRITE_TASK_STATUS_COLORS: Record<SpriteTaskStatus, string> = {
  pending: 'bg-gray-500',
  assigned: 'bg-blue-500',
  in_progress: 'bg-yellow-500',
  pr_created: 'bg-purple-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-400',
};

// Status labels
export const SPRITE_TASK_STATUS_LABELS: Record<SpriteTaskStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pr_created: 'PR Created',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

// Priority colors
export const SPRITE_TASK_PRIORITY_COLORS: Record<SpriteTaskPriority, string> = {
  low: 'bg-gray-400',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
};

// Priority labels
export const SPRITE_TASK_PRIORITY_LABELS: Record<SpriteTaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

// Helper functions
export function isTaskActive(status: SpriteTaskStatus): boolean {
  return ['assigned', 'in_progress'].includes(status);
}

export function canCancelTask(status: SpriteTaskStatus): boolean {
  return ['pending', 'assigned'].includes(status);
}

export function canRetryTask(status: SpriteTaskStatus): boolean {
  return ['failed', 'cancelled'].includes(status);
}

export function isTaskComplete(status: SpriteTaskStatus): boolean {
  return ['completed', 'pr_created'].includes(status);
}

// ============================================================================
// GITHUB ISSUE SYNC TYPES
// ============================================================================

// Activity entry types
export type TaskActivityType = 'status_change' | 'comment' | 'pr_created' | 'error';

// Activity timeline entry
export interface TaskActivityEntry {
  type: TaskActivityType;
  timestamp: string;
  message: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

// Sync status for a task
export interface TaskSyncStatus {
  hasLinkedIssue: boolean;
  lastSynced: string | null;
  issueNumber: number | null;
  issueUrl: string | null;
  commentCount: number;
  currentLabels: string[];
}

// Sync result
export interface TaskSyncResult {
  issueUpdated: boolean;
  newComments: number;
  labelsUpdated: boolean;
  issueClosed: boolean;
}

// Status label mapping (for display)
export const GITHUB_STATUS_LABELS: Record<SpriteTaskStatus, string> = {
  pending: 'sprite:queued',
  assigned: 'sprite:assigned',
  in_progress: 'sprite:in-progress',
  pr_created: 'sprite:pr-ready',
  completed: 'sprite:completed',
  failed: 'sprite:failed',
  cancelled: 'sprite:cancelled',
};

// ============================================================================
// SMART ISSUE PARSING TYPES
// ============================================================================

// Parsed subtask from checklist
export interface ParsedSubtask {
  title: string;
  completed: boolean;
  order: number;
}

// Code block from issue body
export interface CodeBlock {
  language: string | null;
  code: string;
  context?: string;
}

// Technical context extracted from issue
export interface TechnicalContext {
  codeBlocks: CodeBlock[];
  mentionedTechnologies: string[];
  dependencies: string[];
}

// Related issue reference
export interface RelatedIssue {
  type: 'blocks' | 'blocked_by' | 'related' | 'duplicate';
  issueNumber: number;
}

// Task complexity estimate
export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex';

// Full parsed issue result
export interface ParsedIssue {
  title: string;
  description: string;
  subtasks: ParsedSubtask[];
  targetFiles: string[];
  acceptanceCriteria: string[];
  priority: SpriteTaskPriority;
  technicalContext: TechnicalContext;
  relatedIssues: RelatedIssue[];
  estimatedComplexity: TaskComplexity;
  prompt: string;
}

// Parsed GitHub issue (includes metadata)
export interface ParsedGitHubIssue extends ParsedIssue {
  issueNumber: number;
  issueUrl: string;
  issueState: 'open' | 'closed';
  issueLabels: string[];
}

// Complexity colors for UI
export const TASK_COMPLEXITY_COLORS: Record<TaskComplexity, string> = {
  trivial: 'bg-green-500',
  simple: 'bg-blue-500',
  moderate: 'bg-yellow-500',
  complex: 'bg-red-500',
};

// Complexity labels for UI
export const TASK_COMPLEXITY_LABELS: Record<TaskComplexity, string> = {
  trivial: 'Trivial',
  simple: 'Simple',
  moderate: 'Moderate',
  complex: 'Complex',
};
