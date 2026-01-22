/**
 * Chat Message Parser
 *
 * Parses assistant messages to detect UI component markers and
 * split content into segments for rich rendering (Generative UI).
 *
 * Supported component types:
 * - property_card: Single property display
 * - property_list: Multiple properties in a grid
 * - deal_score: Scoring results with visual bars
 * - buybox_match: Buy box matching results
 * - pipeline_card: Pipeline status visualization
 * - offer_card: Offer display
 * - confirmation: Confirmation dialog (human-in-the-loop)
 * - chart: Simple charts for analytics
 * - market_data: Market statistics display
 * - action_buttons: Interactive action buttons
 */

// ============================================================================
// Data Types for UI Components
// ============================================================================

export interface PropertyCardData {
  id: number;
  propertyId?: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  arv?: number;
  bedroomCount?: number;
  bathroomCount?: number;
  livingSpaceSqFt?: number;
  yearBuilt?: number;
  status?: string;
  photoLinks?: string[];
  propertyType?: string;
}

export interface PropertyListData {
  properties: PropertyCardData[];
  title?: string;
  showCount?: boolean;
}

export interface DealScoreData {
  propertyId: number;
  propertyAddress: string;
  overallScore: number;
  scores: {
    category: string;
    score: number;
    maxScore: number;
    details?: string;
  }[];
  recommendation?: 'strong_buy' | 'buy' | 'hold' | 'pass';
  summary?: string;
}

export interface BuyBoxMatchData {
  propertyId: number;
  propertyAddress: string;
  matches: {
    buyBoxId: number;
    buyBoxName: string;
    fundName?: string;
    matchScore: number;
    matchType: 'strong' | 'moderate' | 'weak' | 'no_match';
    matchedCriteria: string[];
    failedCriteria?: string[];
  }[];
  bestMatch?: string;
}

export interface PipelineCardData {
  propertyId: number;
  propertyAddress: string;
  currentStage: 'new' | 'analyzing' | 'due_diligence' | 'offered' | 'negotiating' | 'under_contract' | 'closed';
  daysInStage?: number;
  nextActions?: string[];
  assignedTo?: string;
}

export interface OfferCardData {
  offerId?: number;
  propertyId: number;
  propertyAddress: string;
  offerAmount: number;
  buyerName: string;
  status?: 'draft' | 'pending' | 'accepted' | 'rejected' | 'countered';
  expiresAt?: string;
  terms?: string;
}

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

export interface MarketDataCardData {
  location: string;
  medianPrice: number;
  priceChange?: number;
  daysOnMarket?: number;
  inventory?: number;
  comparables?: {
    address: string;
    price: number;
    soldDate?: string;
  }[];
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

// ============================================================================
// Parsed Segment Types
// ============================================================================

export type UIComponentType =
  | 'property_card'
  | 'property_list'
  | 'deal_score'
  | 'buybox_match'
  | 'pipeline_card'
  | 'offer_card'
  | 'confirmation'
  | 'chart'
  | 'market_data'
  | 'action_buttons';

export type UIComponentData =
  | PropertyCardData
  | PropertyListData
  | DealScoreData
  | BuyBoxMatchData
  | PipelineCardData
  | OfferCardData
  | ConfirmationData
  | ChartData
  | MarketDataCardData
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

// Legacy support - keep old interface working
export interface LegacyParsedMessageSegment {
  type: 'text' | 'property_card';
  content?: string;
  property?: PropertyCardData;
}

// ============================================================================
// Parsing Functions
// ============================================================================

// Generic regex to match any UI component: {"type":"component_type","data":{...}}
const UI_COMPONENT_REGEX = /\{"type":\s*"(property_card|property_list|deal_score|buybox_match|pipeline_card|offer_card|confirmation|chart|market_data|action_buttons)"\s*,\s*"data"\s*:\s*(\{[\s\S]*?\})\}(?=\s*(?:\{|$|[^}]))/g;

// More robust regex for nested objects
const UI_COMPONENT_REGEX_V2 = /\{"type":\s*"(property_card|property_list|deal_score|buybox_match|pipeline_card|offer_card|confirmation|chart|market_data|action_buttons)"\s*,\s*"data"\s*:\s*(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})\}/g;

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

/**
 * Legacy parser for backward compatibility
 * Returns the old format with property?: PropertyCardData
 */
export function parseMessageContentLegacy(content: string): LegacyParsedMessageSegment[] {
  const segments = parseMessageContent(content);

  return segments.map(segment => {
    if (segment.type === 'text') {
      return { type: 'text', content: segment.content };
    }
    if (segment.type === 'property_card') {
      return { type: 'property_card', property: segment.data as PropertyCardData };
    }
    // For other component types, just return as text for legacy consumers
    return { type: 'text', content: JSON.stringify(segment) };
  });
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
 * Check if a message contains property cards (legacy helper)
 */
export function hasPropertyCards(content: string): boolean {
  if (!content) return false;
  return content.includes('"type":"property_card"') || content.includes('"type": "property_card"');
}

/**
 * Extract all property cards from a message
 */
export function extractPropertyCards(content: string): PropertyCardData[] {
  const segments = parseMessageContent(content);
  return segments
    .filter((s): s is UIComponentSegment & { type: 'property_card' } =>
      s.type === 'property_card'
    )
    .map(s => s.data as PropertyCardData);
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

/**
 * Remove property card markers from text (legacy helper)
 */
export function stripPropertyCards(content: string): string {
  return stripUIComponents(content);
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
 * Create a property card marker
 */
export function createPropertyCardMarker(property: PropertyCardData): string {
  return createUIComponentMarker('property_card', property);
}

/**
 * Create a deal score marker
 */
export function createDealScoreMarker(score: DealScoreData): string {
  return createUIComponentMarker('deal_score', score);
}

/**
 * Create a buy box match marker
 */
export function createBuyBoxMatchMarker(match: BuyBoxMatchData): string {
  return createUIComponentMarker('buybox_match', match);
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
