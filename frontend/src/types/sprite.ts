/**
 * Sprite Types
 *
 * Types for Sprites integration - persistent Linux environments with Claude Code.
 */

// Sprite status options
export type SpriteStatus =
  | 'creating'
  | 'initializing'
  | 'running'
  | 'hibernating'
  | 'stopped'
  | 'checkpointing'
  | 'restoring'
  | 'error'
  | 'deleted';

// URL settings from Sprites API
export interface SpriteUrlSettings {
  url?: string;
  auth?: 'sprite' | 'public';
}

// Main Sprite entity
export interface Sprite {
  id: string;
  projectId: string;
  organizationId: string;

  spriteName: string;
  spriteId: string | null;

  status: SpriteStatus;
  statusMessage: string | null;
  errorMessage: string | null;

  repoUrl: string;
  branch: string;
  workingDirectory: string;
  claudeConfigured: boolean;
  anthropicApiKeyConfigured: boolean;

  urlSettings: SpriteUrlSettings | null;

  lastCheckpointId: string | null;
  lastCheckpointAt: string | null;
  checkpointCount: number;

  createdById: string | null;
  lastAccessedAt: string | null;
  lastAccessedById: string | null;

  createdAt: string;
  updatedAt: string;

  // Extended API details (when fetched with details)
  apiDetails?: SpriteApiDetails | null;
}

// API details from Sprites service
export interface SpriteApiDetails {
  name: string;
  status: string;
  cpus: number;
  memoryMb: number;
  diskGb: number;
  created_at: string;
  urls?: {
    http?: string;
    ssh?: string;
  };
}

// Checkpoint info
export interface SpriteCheckpoint {
  id: string;
  comment?: string;
  createdAt: string;
  size?: number;
}

// Exec session info
export interface SpriteSession {
  id: string;
  status: string;
  command?: string;
  createdAt: string;
  updatedAt?: string;
}

// Terminal WebSocket info
export interface SpriteTerminalInfo {
  wsUrl: string;
  token: string;
  sessionId?: string;
}

// Sprites configuration status
export interface SpritesConfig {
  configured: boolean;
  activeSpritesCount: number;
  serviceReady: boolean;
}

// Create sprite options
export interface CreateSpriteOptions {
  projectId: string;
  branch?: string;
  initScript?: string;
  cpus?: number;
  memoryMb?: number;
}

// Terminal message types
export type TerminalMessageType =
  | 'input'
  | 'output'
  | 'error'
  | 'resize'
  | 'status'
  | 'ping'
  | 'pong'
  | 'connected'
  | 'disconnected';

// Terminal message structure
export interface TerminalMessage {
  type: TerminalMessageType;
  data?: string;
  error?: string;
  cols?: number;
  rows?: number;
  status?: 'connecting' | 'connected' | 'disconnected' | 'error';
  timestamp: string;
}

// Status badge color mapping
export const SPRITE_STATUS_COLORS: Record<SpriteStatus, string> = {
  creating: 'bg-blue-500',
  initializing: 'bg-blue-500',
  running: 'bg-green-500',
  hibernating: 'bg-yellow-500',
  stopped: 'bg-gray-500',
  checkpointing: 'bg-purple-500',
  restoring: 'bg-purple-500',
  error: 'bg-red-500',
  deleted: 'bg-gray-400',
};

// Status badge labels
export const SPRITE_STATUS_LABELS: Record<SpriteStatus, string> = {
  creating: 'Creating',
  initializing: 'Initializing',
  running: 'Running',
  hibernating: 'Hibernating',
  stopped: 'Stopped',
  checkpointing: 'Checkpointing',
  restoring: 'Restoring',
  error: 'Error',
  deleted: 'Deleted',
};

// Helper function to check if sprite is active
export function isSpriteActive(status: SpriteStatus): boolean {
  return ['running', 'hibernating', 'initializing'].includes(status);
}

// Helper function to check if sprite can be resumed
export function canResumeSprite(status: SpriteStatus): boolean {
  return ['stopped', 'hibernating'].includes(status);
}

// Helper function to check if sprite is in terminal state
export function isSpriteTerminal(status: SpriteStatus): boolean {
  return ['deleted', 'error'].includes(status);
}
