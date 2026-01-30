/**
 * Remotion Type Definitions
 *
 * Types for activity data and composition props.
 */

export type ActivityEventType =
  | 'deal_created'
  | 'deal_updated'
  | 'deal_viewed'
  | 'deal_liked'
  | 'deal_passed'
  | 'offer_made'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'task_created'
  | 'task_completed'
  | 'compliance_check_passed'
  | 'compliance_check_failed'
  | 'document_signed'
  | 'message_sent'
  | 'team_member_added'
  | 'pipeline_stage_changed'
  | 'system_event';

export type ActivityImportance = 'low' | 'normal' | 'high' | 'critical';

export interface ActivityActor {
  type: 'user' | 'system' | 'automation' | 'external';
  id?: string;
  name: string;
  avatar?: string;
}

export interface ActivityResource {
  type: 'deal' | 'buyer' | 'task' | 'compliance' | 'document' | 'message' | 'team' | 'offer' | 'pipeline' | 'system';
  id?: string;
  name?: string;
  url?: string;
}

export interface Activity {
  id: string;
  eventType: ActivityEventType;
  timestamp: string;
  actor: ActivityActor;
  resource: ActivityResource;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
  importance: ActivityImportance;
}

// Composition Props
export interface ActivityTimelineProps {
  activities: Activity[];
  title?: string;
  showTimestamps?: boolean;
  theme?: 'dark' | 'light';
}

export interface MetricsDashboardProps {
  metrics: {
    label: string;
    value: number;
    change?: number;
    color?: string;
  }[];
  title?: string;
}

export interface ProjectRecapProps {
  projectTitle: string;
  projectLogo?: string;
  recap: string;
  stats?: {
    commits?: number;
    issues?: number;
    contributors?: number;
  };
}

// Theme colors
export const THEME = {
  dark: {
    background: '#0a0a0a',
    cardBackground: 'rgba(255, 255, 255, 0.05)',
    cardBorder: 'rgba(255, 255, 255, 0.1)',
    textPrimary: '#ffffff',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    accent: '#3b82f6',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    critical: '#dc2626',
  },
  light: {
    background: '#ffffff',
    cardBackground: 'rgba(0, 0, 0, 0.02)',
    cardBorder: 'rgba(0, 0, 0, 0.1)',
    textPrimary: '#18181b',
    textSecondary: '#52525b',
    textMuted: '#a1a1aa',
    accent: '#2563eb',
    success: '#16a34a',
    warning: '#ca8a04',
    error: '#dc2626',
    critical: '#b91c1c',
  },
} as const;

// Event type colors
export const EVENT_COLORS: Record<string, string> = {
  deal_created: '#22c55e',
  deal_updated: '#3b82f6',
  deal_viewed: '#8b5cf6',
  deal_liked: '#ec4899',
  offer_made: '#f59e0b',
  offer_accepted: '#22c55e',
  offer_rejected: '#ef4444',
  task_created: '#06b6d4',
  task_completed: '#22c55e',
  compliance_check_passed: '#22c55e',
  compliance_check_failed: '#ef4444',
  document_signed: '#8b5cf6',
  message_sent: '#3b82f6',
  team_member_added: '#06b6d4',
  pipeline_stage_changed: '#f59e0b',
  system_event: '#71717a',
};

// Event type icons (emoji fallback)
export const EVENT_ICONS: Record<string, string> = {
  deal_created: '🏠',
  deal_updated: '✏️',
  deal_viewed: '👁️',
  deal_liked: '❤️',
  deal_passed: '👎',
  offer_made: '💰',
  offer_accepted: '✅',
  offer_rejected: '❌',
  task_created: '📋',
  task_completed: '✔️',
  compliance_check_passed: '🛡️',
  compliance_check_failed: '⚠️',
  document_signed: '📝',
  message_sent: '💬',
  team_member_added: '👤',
  pipeline_stage_changed: '📊',
  system_event: '⚙️',
};
