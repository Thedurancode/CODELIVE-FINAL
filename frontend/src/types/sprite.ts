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
  featureBranch: string | null;
  workingDirectory: string;
  claudeConfigured: boolean;
  anthropicApiKeyConfigured: boolean;
  githubConfigured: boolean;

  // Task automation settings
  autoShutdownAfterTask: boolean;

  urlSettings: SpriteUrlSettings | null;

  lastCheckpointId: string | null;
  lastCheckpointAt: string | null;
  checkpointCount: number;

  createdById: string | null;
  lastAccessedAt: string | null;
  lastAccessedById: string | null;

  // Session tracking
  currentSessionId: string | null;
  totalRuntimeSeconds: number;
  sessionCount: number;

  // Shell persistence
  lastShellDirectory: string | null;
  startupCommand: string | null;
  tmuxSessionName: string | null;

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

// ============================================================================
// SERVICES TYPES
// ============================================================================

// Service status
export type ServiceStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error';

// Service definition
export interface SpriteService {
  id: string;
  name: string;
  command: string;
  args?: string[];
  workingDir?: string;
  env?: Record<string, string>;
  status: ServiceStatus;
  pid?: number;
  port?: number;
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
  exitCode?: number;
  error?: string;
}

// Create service options
export interface CreateServiceOptions {
  name: string;
  command: string;
  args?: string[];
  workingDir?: string;
  env?: Record<string, string>;
  autoStart?: boolean;
  port?: number;
}

// Service log entry
export interface ServiceLogEntry {
  timestamp: string;
  stream: 'stdout' | 'stderr';
  data: string;
}

// Service logs response
export interface ServiceLogsResponse {
  serviceId: string;
  logs: ServiceLogEntry[];
  hasMore: boolean;
}

// Service status colors and labels
export const SERVICE_STATUS_COLORS: Record<ServiceStatus, string> = {
  running: 'bg-green-500',
  stopped: 'bg-gray-500',
  starting: 'bg-blue-500',
  stopping: 'bg-yellow-500',
  error: 'bg-red-500',
};

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  running: 'Running',
  stopped: 'Stopped',
  starting: 'Starting',
  stopping: 'Stopping',
  error: 'Error',
};

// Helper function to check if service is active
export function isServiceActive(status: ServiceStatus): boolean {
  return status === 'running' || status === 'starting';
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

// GitHub configuration status
export interface GitHubConfig {
  configured: boolean;
  tokenPrefix: string | null;
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
  | 'disconnected'
  | 'port_opened'
  | 'port_closed'
  | 'session_info';

// Port notification from Sprites API
export interface PortNotification {
  type: 'port_opened' | 'port_closed';
  port: number;
  address: string; // Proxy URL for accessing the port
  pid: number; // Process ID that opened/closed the port
  timestamp: string;
}

// Session info from Sprites API
export interface SessionInfo {
  type: 'session_info';
  sessionId: number;
  command: string;
  cols: number;
  rows: number;
  isOwner: boolean;
  tty: boolean;
  timestamp: string;
}

// Terminal message structure
export interface TerminalMessage {
  type: TerminalMessageType;
  data?: string;
  error?: string;
  cols?: number;
  rows?: number;
  status?: 'connecting' | 'connected' | 'disconnected' | 'error';
  timestamp: string;
  // Port notification fields
  port?: number;
  address?: string;
  pid?: number;
  // Session info fields
  sessionId?: number;
  command?: string;
  isOwner?: boolean;
  tty?: boolean;
}

// Kill session event types
export type KillSessionEventType = 'signal' | 'timeout' | 'exited' | 'killed' | 'error' | 'complete';

export interface KillSessionEvent {
  type: KillSessionEventType;
  message?: string;
  signal?: string;
  pid?: number;
  exit_code?: number;
}

// Kill session response
export interface KillSessionResponse {
  events: KillSessionEvent[];
  sessionId: string;
}

// ============================================================================
// FILESYSTEM API TYPES
// ============================================================================

// File/directory entry from list operation
export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mode: string; // Octal permissions e.g., '0644'
  modTime: string; // ISO timestamp
  uid: number;
  gid: number;
}

// List directory response
export interface ListDirectoryResponse {
  path: string;
  entries: FileEntry[];
}

// Read file text response
export interface ReadFileTextResponse {
  path: string;
  content: string;
}

// Delete options
export interface DeleteFileOptions {
  path: string;
  workingDir: string;
  recursive: boolean;
  asRoot?: boolean;
}

// Rename/move options
export interface RenameFileOptions {
  source: string;
  dest: string;
  workingDir: string;
  asRoot?: boolean;
}

// Copy options
export interface CopyFileOptions {
  source: string;
  dest: string;
  workingDir: string;
  recursive?: boolean;
  preserveAttrs?: boolean;
  asRoot?: boolean;
}

// Chmod options
export interface ChmodOptions {
  path: string;
  workingDir: string;
  mode: string; // Octal e.g., '0755'
  recursive?: boolean;
  asRoot?: boolean;
}

// Chown options
export interface ChownOptions {
  path: string;
  workingDir: string;
  uid: number | string;
  gid: number | string;
  recursive?: boolean;
  asRoot?: boolean;
}

// Watch event types
export type WatchEventType = 'create' | 'modify' | 'delete' | 'rename' | 'chmod';

// Watch event from filesystem WebSocket
export interface WatchEvent {
  type: 'event' | 'error' | 'subscribed' | 'unsubscribed';
  path?: string;
  event?: WatchEventType;
  timestamp?: string;
  size?: number;
  isDir?: boolean;
  message?: string;
}

// Watch subscription request
export interface WatchRequest {
  type: 'subscribe' | 'unsubscribe';
  paths: string[];
  recursive?: boolean;
  workingDir: string;
}

// Filesystem watch WebSocket info
export interface FilesystemWatchInfo {
  wsUrl: string;
  token: string;
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

// Helper function to check if sprite is active (actually running and accepting commands)
export function isSpriteActive(status: SpriteStatus): boolean {
  // Only 'running' is truly active - hibernating sprites are suspended and need to be resumed
  // 'initializing' and 'restoring' are transitional states where the sprite is becoming active
  return ['running', 'initializing', 'restoring'].includes(status);
}

// Helper function to check if sprite can be resumed
export function canResumeSprite(status: SpriteStatus): boolean {
  return ['stopped', 'hibernating'].includes(status);
}

// Helper function to check if sprite is in terminal state
export function isSpriteTerminal(status: SpriteStatus): boolean {
  return ['deleted', 'error'].includes(status);
}

// ============================================================================
// GIT & PULL REQUEST TYPES
// ============================================================================

// Branch status (commits ahead/behind, uncommitted changes)
export interface BranchStatus {
  featureBranch: string;
  baseBranch: string;
  ahead: number;
  behind: number;
  hasUncommittedChanges: boolean;
  lastCommitMessage: string | null;
  lastCommitAuthor: string | null;
  lastCommitDate: string | null;
}

// Pull request info
export interface PullRequestInfo {
  url: string;
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  headBranch: string;
  baseBranch: string;
}

// Create PR options
export interface CreatePullRequestOptions {
  title?: string;
  body?: string;
  draft?: boolean;
}

// Push result
export interface PushResult {
  success: boolean;
  message: string;
}
