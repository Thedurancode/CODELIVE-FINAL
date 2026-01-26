/**
 * Chat Message Parser
 *
 * Parses assistant messages to detect UI component markers and
 * split content into segments for rich rendering (Generative UI).
 *
 * Supported component types:
 * - confirmation: Confirmation dialog (human-in-the-loop)
 * - chart: Simple charts for analytics
 * - action_buttons: Interactive action buttons
 */

// ============================================================================
// Data Types for UI Components
// ============================================================================

export interface ConfirmationData {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'danger';
  confirmLabel?: string;
  cancelLabel?: string;
  details?: Record<string, string | number>;
  action: string; // The action to perform on confirm
  actionData?: Record<string, unknown>;
}

export interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'donut';
  title?: string;
  data: {
    label: string;
    value: number;
    color?: string;
  }[];
  showLegend?: boolean;
}

export interface ActionButtonsData {
  buttons: {
    label: string;
    action: string;
    variant?: 'default' | 'primary' | 'secondary' | 'destructive' | 'outline';
    icon?: string;
    data?: Record<string, unknown>;
  }[];
  layout?: 'horizontal' | 'vertical';
}

export interface PropertyCardData {
  id?: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  arv?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  status?: string;
  imageUrl?: string;
}

// ============================================================================
// Parsed Segment Types
// ============================================================================

export type UIComponentType =
  | 'confirmation'
  | 'chart'
  | 'action_buttons';

export type UIComponentData =
  | ConfirmationData
  | ChartData
  | ActionButtonsData;

export interface TextSegment {
  type: 'text';
  content: string;
}

export interface UIComponentSegment {
  type: UIComponentType;
  data: UIComponentData;
}

export type ParsedMessageSegment = TextSegment | UIComponentSegment;

// ============================================================================
// Parsing Functions
// ============================================================================

// Regex for nested objects - matches confirmation, chart, action_buttons
const UI_COMPONENT_REGEX_V2 = /\{"type":\s*"(confirmation|chart|action_buttons)"\s*,\s*"data"\s*:\s*(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})\}/g;

// Regex to match tool event markers (tool_start, tool_end) - these should be hidden
const TOOL_EVENT_REGEX = /\{"type":\s*"tool_(start|end)"[^}]*\}/g;

// Regex for wrapped tool events
const WRAPPED_TOOL_EVENT_REGEX = /\[TOOL_EVENT\][\s\S]*?\[\/TOOL_EVENT\]/g;

/**
 * Strip tool event markers from content
 */
function stripToolEvents(content: string): string {
  return content
    .replace(WRAPPED_TOOL_EVENT_REGEX, '')
    .replace(TOOL_EVENT_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Safely parse JSON with error handling
 */
function safeJsonParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Parse message content into segments (text and UI components)
 */
export function parseMessageContent(content: string): ParsedMessageSegment[] {
  if (!content) {
    return [];
  }

  // First, strip out tool events
  content = stripToolEvents(content);

  const segments: ParsedMessageSegment[] = [];
  let lastIndex = 0;

  // Find all UI component markers
  UI_COMPONENT_REGEX_V2.lastIndex = 0;
  let match;

  while ((match = UI_COMPONENT_REGEX_V2.exec(content)) !== null) {
    const [fullMatch, componentType, dataJson] = match;

    // Add text before this marker
    if (match.index > lastIndex) {
      const textContent = content.slice(lastIndex, match.index).trim();
      if (textContent) {
        segments.push({ type: 'text', content: textContent });
      }
    }

    // Try to parse the component data
    const data = safeJsonParse<UIComponentData>(dataJson);
    if (data) {
      segments.push({
        type: componentType as UIComponentType,
        data,
      });
    } else {
      // If JSON parsing fails, treat it as text
      console.warn('Failed to parse UI component data:', componentType, dataJson);
      segments.push({ type: 'text', content: fullMatch });
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining text after last marker
  if (lastIndex < content.length) {
    const remainingText = content.slice(lastIndex).trim();
    if (remainingText) {
      segments.push({ type: 'text', content: remainingText });
    }
  }

  // If no markers found, return entire content as text
  if (segments.length === 0 && content.trim()) {
    return [{ type: 'text', content: content.trim() }];
  }

  return segments;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a message contains any UI components
 */
export function hasUIComponents(content: string): boolean {
  if (!content) return false;
  UI_COMPONENT_REGEX_V2.lastIndex = 0;
  return UI_COMPONENT_REGEX_V2.test(content);
}

/**
 * Extract components of a specific type
 */
export function extractComponents<T extends UIComponentData>(
  content: string,
  componentType: UIComponentType
): T[] {
  const segments = parseMessageContent(content);
  return segments
    .filter((s): s is UIComponentSegment => s.type === componentType)
    .map(s => s.data as T);
}

/**
 * Remove all UI component markers from text (for display purposes)
 */
export function stripUIComponents(content: string): string {
  if (!content) return '';
  UI_COMPONENT_REGEX_V2.lastIndex = 0;
  return stripToolEvents(content.replace(UI_COMPONENT_REGEX_V2, '')).trim();
}

// ============================================================================
// Component Emission Helpers (for backend use)
// ============================================================================

/**
 * Create a UI component marker string
 */
export function createUIComponentMarker<T extends UIComponentData>(
  type: UIComponentType,
  data: T
): string {
  return JSON.stringify({ type, data });
}

/**
 * Create a confirmation marker
 */
export function createConfirmationMarker(confirmation: ConfirmationData): string {
  return createUIComponentMarker('confirmation', confirmation);
}

/**
 * Create an action buttons marker
 */
export function createActionButtonsMarker(buttons: ActionButtonsData): string {
  return createUIComponentMarker('action_buttons', buttons);
}
