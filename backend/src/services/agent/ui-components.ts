/**
 * UI Component Helpers for Generative UI
 *
 * These helpers generate JSON markers that the frontend parses
 * to render rich UI components in the chat interface.
 *
 * Usage in tools:
 *   return success(data, 'Found 5 properties', {
 *     uiComponents: [
 *       createPropertyList(properties)
 *     ]
 *   });
 *
 * The frontend parses these markers and renders appropriate React components.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

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
  currentStage:
    | 'new'
    | 'analyzing'
    | 'due_diligence'
    | 'offered'
    | 'negotiating'
    | 'under_contract'
    | 'closed';
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
  action: string;
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

export interface UIComponent {
  type: UIComponentType;
  data: UIComponentData;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a UI component marker string that the frontend will parse
 */
export function createUIComponent<T extends UIComponentData>(
  type: UIComponentType,
  data: T
): string {
  return JSON.stringify({ type, data });
}

/**
 * Create a property card component
 */
export function createPropertyCard(property: PropertyCardData): string {
  return createUIComponent('property_card', property);
}

/**
 * Create a property list component
 */
export function createPropertyList(
  properties: PropertyCardData[],
  options?: { title?: string; showCount?: boolean }
): string {
  return createUIComponent('property_list', {
    properties,
    title: options?.title,
    showCount: options?.showCount ?? true,
  });
}

/**
 * Create a deal score component
 */
export function createDealScore(score: DealScoreData): string {
  return createUIComponent('deal_score', score);
}

/**
 * Create a buy box match component
 */
export function createBuyBoxMatch(match: BuyBoxMatchData): string {
  return createUIComponent('buybox_match', match);
}

/**
 * Create a pipeline card component
 */
export function createPipelineCard(pipeline: PipelineCardData): string {
  return createUIComponent('pipeline_card', pipeline);
}

/**
 * Create an offer card component
 */
export function createOfferCard(offer: OfferCardData): string {
  return createUIComponent('offer_card', offer);
}

/**
 * Create a confirmation dialog component
 */
export function createConfirmation(confirmation: ConfirmationData): string {
  return createUIComponent('confirmation', confirmation);
}

/**
 * Create a chart component
 */
export function createChart(chart: ChartData): string {
  return createUIComponent('chart', chart);
}

/**
 * Create a market data card component
 */
export function createMarketData(marketData: MarketDataCardData): string {
  return createUIComponent('market_data', marketData);
}

/**
 * Create action buttons component
 */
export function createActionButtons(buttons: ActionButtonsData): string {
  return createUIComponent('action_buttons', buttons);
}

// =============================================================================
// PROPERTY DATA TRANSFORMATION HELPERS
// =============================================================================

/**
 * Transform a raw property model into PropertyCardData
 */
export function propertyToCardData(property: any): PropertyCardData {
  const addressParts = [];
  if (property.address?.houseNumber) addressParts.push(property.address.houseNumber);
  if (property.address?.street) addressParts.push(property.address.street);

  const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : property.address || '';

  return {
    id: property.id || property.propertyId,
    propertyId: property.propertyId,
    address: fullAddress,
    city: property.city,
    state: property.state,
    zip: property.zip,
    price: property.mlsListingPrice || property.buyItNowPrice || property.price,
    arv: property.arv,
    bedroomCount: property.bedroomCount,
    bathroomCount: property.bathroomCount,
    livingSpaceSqFt: property.livingSpaceSqFt,
    yearBuilt: property.yearBuilt,
    status: property.status,
    photoLinks: property.photoLinks || [],
    propertyType: property.propertyType,
  };
}

/**
 * Transform multiple properties into a property list component
 */
export function propertiesToListComponent(
  properties: any[],
  options?: { title?: string; showCount?: boolean }
): string {
  const cards = properties.map(propertyToCardData);
  return createPropertyList(cards, options);
}

/**
 * Create a single property card component from raw property data
 */
export function propertyToCardComponent(property: any): string {
  return createPropertyCard(propertyToCardData(property));
}
