/**
 * Confirmation Helper
 *
 * Transforms ambiguous lookup results into natural-language confirmations.
 * This allows the agent to ask the user for clarification before executing
 * actions like calling, emailing, or logging notes to the wrong contact.
 */

import { Contact, Property, PropertyContact } from '../../models';
import { ContactContextInfo, loadContactActivity } from './contextLoader';

// ============================================================================
// Types
// ============================================================================

export interface ConfirmationCandidate {
  type: 'contact' | 'property';
  id: number;
  displayName: string;
  details: string[];
  confidence: number;
  contextHints?: string[];
}

export interface ConfirmationRequest {
  action: string;
  candidates: ConfirmationCandidate[];
  originalQuery: string;
  suggestedCandidate?: ConfirmationCandidate;
  confirmationMessage: string;
}

export interface ConfirmationResponse {
  needsConfirmation: true;
  request: ConfirmationRequest;
}

export interface ResolvedResponse {
  needsConfirmation: false;
  resolved: {
    type: 'contact' | 'property';
    id: number;
    data: Contact | Property;
  };
}

export type ConfirmationResult = ConfirmationResponse | ResolvedResponse;

// ============================================================================
// Contact Confirmation Helpers
// ============================================================================

/**
 * Build a confirmation request for contact disambiguation
 */
export async function buildContactConfirmation(
  action: string,
  contacts: Contact[],
  originalQuery: string,
  similarityScores?: Map<number, number>,
  propertyHints?: Map<number, string[]>
): Promise<ConfirmationRequest> {
  const candidates: ConfirmationCandidate[] = [];

  for (const contact of contacts) {
    const details: string[] = [];
    if (contact.phone) details.push(`Phone: ${contact.phone}`);
    if (contact.email) details.push(`Email: ${contact.email}`);
    if (contact.company) details.push(`Company: ${contact.company}`);
    if (contact.type) details.push(`Type: ${contact.type}`);

    // Get recent activity for context
    const recentActivity = await loadContactActivity(contact.id, { limit: 2 });
    if (recentActivity.length > 0) {
      const lastActivity = recentActivity[0];
      const timeAgo = formatTimeAgo(lastActivity.createdAt);
      details.push(`Last ${lastActivity.type}: ${timeAgo}`);
    }

    const contextHints = propertyHints?.get(contact.id) || [];
    const confidence = similarityScores?.get(contact.id) || 0.5;

    candidates.push({
      type: 'contact',
      id: contact.id,
      displayName: contact.name,
      details,
      confidence,
      contextHints,
    });
  }

  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Generate natural language confirmation message
  const confirmationMessage = generateContactConfirmationMessage(action, candidates, originalQuery);

  return {
    action,
    candidates,
    originalQuery,
    suggestedCandidate: candidates.length > 0 ? candidates[0] : undefined,
    confirmationMessage,
  };
}

/**
 * Generate a natural language confirmation message for contacts
 */
function generateContactConfirmationMessage(
  action: string,
  candidates: ConfirmationCandidate[],
  originalQuery: string
): string {
  if (candidates.length === 0) {
    return `I couldn't find anyone matching "${originalQuery}". Could you provide more details like their full name, phone number, or the property they're associated with?`;
  }

  if (candidates.length === 1) {
    const c = candidates[0];
    const detailStr = c.details.length > 0 ? ` (${c.details[0]})` : '';
    const propertyStr = c.contextHints?.length ? ` near ${c.contextHints[0]}` : '';
    return `I found **${c.displayName}**${detailStr}${propertyStr}. Would you like me to ${action}?`;
  }

  // Multiple candidates - ask for clarification
  const candidateList = candidates.slice(0, 3).map((c, i) => {
    const details: string[] = [];
    if (c.details[0]) details.push(c.details[0]);
    if (c.contextHints?.[0]) details.push(`at ${c.contextHints[0]}`);
    const detailStr = details.length > 0 ? ` - ${details.join(', ')}` : '';
    return `${i + 1}. **${c.displayName}**${detailStr}`;
  }).join('\n');

  return `I found multiple contacts matching "${originalQuery}":\n\n${candidateList}\n\nWhich one did you mean? You can say the number, full name, or mention the property address to help me identify the right person.`;
}

// ============================================================================
// Property Confirmation Helpers
// ============================================================================

/**
 * Build a confirmation request for property disambiguation
 */
export async function buildPropertyConfirmation(
  action: string,
  properties: Property[],
  originalQuery: string,
  similarityScores?: Map<number, number>
): Promise<ConfirmationRequest> {
  const candidates: ConfirmationCandidate[] = [];

  for (const property of properties) {
    const address = formatPropertyAddress(property);
    const details: string[] = [];

    if (property.askingPrice) details.push(`Price: $${property.askingPrice.toLocaleString()}`);
    if (property.status) details.push(`Status: ${property.status}`);

    // Get associated contacts
    const contacts = await PropertyContact.findAll({
      where: { propertyId: property.id },
      include: [{ model: Contact, as: 'contact' }],
      limit: 2,
    });

    const contactNames = contacts
      .filter((pc) => pc.contact)
      .map((pc) => pc.contact!.name);
    if (contactNames.length > 0) {
      details.push(`Contacts: ${contactNames.join(', ')}`);
    }

    const confidence = similarityScores?.get(property.id) || 0.5;

    candidates.push({
      type: 'property',
      id: property.id,
      displayName: address,
      details,
      confidence,
    });
  }

  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Generate confirmation message
  const confirmationMessage = generatePropertyConfirmationMessage(action, candidates, originalQuery);

  return {
    action,
    candidates,
    originalQuery,
    suggestedCandidate: candidates.length > 0 ? candidates[0] : undefined,
    confirmationMessage,
  };
}

/**
 * Generate a natural language confirmation message for properties
 */
function generatePropertyConfirmationMessage(
  action: string,
  candidates: ConfirmationCandidate[],
  originalQuery: string
): string {
  if (candidates.length === 0) {
    return `I couldn't find a property matching "${originalQuery}". Could you provide the full address including city and state?`;
  }

  if (candidates.length === 1) {
    const p = candidates[0];
    const detailStr = p.details.length > 0 ? ` (${p.details[0]})` : '';
    return `I found **${p.displayName}**${detailStr}. Would you like me to ${action}?`;
  }

  // Multiple candidates
  const candidateList = candidates.slice(0, 3).map((p, i) => {
    const detailStr = p.details.length > 0 ? ` - ${p.details[0]}` : '';
    return `${i + 1}. **${p.displayName}**${detailStr}`;
  }).join('\n');

  return `I found multiple properties matching "${originalQuery}":\n\n${candidateList}\n\nWhich one did you mean?`;
}

// ============================================================================
// Combined Confirmation for Contact + Property
// ============================================================================

/**
 * Build a confirmation request when both contact and property need clarification
 */
export function buildCombinedConfirmation(
  action: string,
  contactName: string,
  propertyAddress: string,
  matchedContacts: Array<{ contact: Contact; propertyAddresses: string[] }>,
): ConfirmationRequest {
  const candidates: ConfirmationCandidate[] = [];

  for (const match of matchedContacts) {
    const details: string[] = [];
    if (match.contact.phone) details.push(`Phone: ${match.contact.phone}`);

    candidates.push({
      type: 'contact',
      id: match.contact.id,
      displayName: match.contact.name,
      details,
      confidence: 0.7,
      contextHints: match.propertyAddresses,
    });
  }

  let confirmationMessage: string;

  if (candidates.length === 0) {
    confirmationMessage = `I couldn't find "${contactName}" associated with "${propertyAddress}". Could you provide more details?`;
  } else if (candidates.length === 1) {
    const c = candidates[0];
    const phoneStr = c.details[0] || '';
    const propStr = c.contextHints?.[0] ? ` (Property: ${c.contextHints[0]})` : '';
    confirmationMessage = `I found **${c.displayName}** ${phoneStr}${propStr}. Would you like me to ${action}?`;
  } else {
    const list = candidates.map((c, i) => {
      const propStr = c.contextHints?.length ? ` - ${c.contextHints.join(', ')}` : '';
      return `${i + 1}. **${c.displayName}**${propStr}`;
    }).join('\n');

    confirmationMessage = `I found multiple contacts:\n\n${list}\n\nWhich "${contactName}" did you mean?`;
  }

  return {
    action,
    candidates,
    originalQuery: `${contactName} at ${propertyAddress}`,
    suggestedCandidate: candidates.length > 0 ? candidates[0] : undefined,
    confirmationMessage,
  };
}

// ============================================================================
// Response Formatting for Tools
// ============================================================================

/**
 * Format a confirmation result as a tool response
 */
export function formatConfirmationAsToolResponse(request: ConfirmationRequest): {
  success: false;
  needsConfirmation: true;
  confirmationMessage: string;
  candidates: Array<{
    id: number;
    type: string;
    name: string;
    details: string[];
    suggested: boolean;
  }>;
} {
  return {
    success: false,
    needsConfirmation: true,
    confirmationMessage: request.confirmationMessage,
    candidates: request.candidates.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.displayName,
      details: c.details,
      suggested: c === request.suggestedCandidate,
    })),
  };
}

/**
 * Create a simple suggestion response for similar matches
 */
export function createSuggestionResponse(
  action: string,
  entityType: 'contact' | 'property',
  suggestedName: string,
  suggestedId: number,
  originalQuery: string,
  additionalDetails?: string
): string {
  const detailStr = additionalDetails ? ` ${additionalDetails}` : '';

  if (entityType === 'contact') {
    return `I couldn't find "${originalQuery}", but I found **${suggestedName}**${detailStr}. Would you like me to ${action}? Just say "yes" to confirm.`;
  }

  return `I couldn't find "${originalQuery}", but I found a property at **${suggestedName}**${detailStr}. Would you like me to ${action}? Just say "yes" to confirm.`;
}

/**
 * Check if user message is a confirmation
 */
export function isUserConfirmation(message: string): boolean {
  const confirmationPatterns = [
    /^yes\b/i,
    /^yeah\b/i,
    /^yep\b/i,
    /^sure\b/i,
    /^ok\b/i,
    /^okay\b/i,
    /^go ahead\b/i,
    /^do it\b/i,
    /^confirm\b/i,
    /^that'?s? (right|correct|the one)/i,
    /^(him|her|them|that one)\b/i,
  ];

  const trimmed = message.trim().toLowerCase();
  return confirmationPatterns.some((p) => p.test(trimmed));
}

/**
 * Check if user message is a rejection
 */
export function isUserRejection(message: string): boolean {
  const rejectionPatterns = [
    /^no\b/i,
    /^nope\b/i,
    /^cancel\b/i,
    /^never mind\b/i,
    /^not (that|them|him|her)/i,
    /^wrong\b/i,
    /^different\b/i,
  ];

  const trimmed = message.trim().toLowerCase();
  return rejectionPatterns.some((p) => p.test(trimmed));
}

/**
 * Extract selection from user message (e.g., "the first one", "number 2", "John Smith")
 */
export function extractSelection(
  message: string,
  candidates: ConfirmationCandidate[]
): ConfirmationCandidate | null {
  const trimmed = message.trim().toLowerCase();

  // Check for numeric selection
  const numberMatch = trimmed.match(/^(\d+|first|second|third|1st|2nd|3rd)\b/i);
  if (numberMatch) {
    const numMap: Record<string, number> = {
      '1': 0, 'first': 0, '1st': 0,
      '2': 1, 'second': 1, '2nd': 1,
      '3': 2, 'third': 2, '3rd': 2,
    };
    const index = numMap[numberMatch[1].toLowerCase()] ?? parseInt(numberMatch[1]) - 1;
    if (index >= 0 && index < candidates.length) {
      return candidates[index];
    }
  }

  // Check for name match
  for (const candidate of candidates) {
    const candidateName = candidate.displayName.toLowerCase();
    if (trimmed.includes(candidateName) || candidateName.includes(trimmed)) {
      return candidate;
    }
  }

  return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} mins ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function formatPropertyAddress(property: Property): string {
  const parts: string[] = [];

  if (property.address) {
    const street = [property.address.houseNumber, property.address.street]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (street) parts.push(street);
  }

  if (property.city) parts.push(property.city);
  if (property.state) parts.push(property.state);
  if (property.zip) parts.push(property.zip);

  return parts.join(', ') || `Property #${property.id}`;
}

// Export all helpers
export const confirmationHelper = {
  buildContactConfirmation,
  buildPropertyConfirmation,
  buildCombinedConfirmation,
  formatConfirmationAsToolResponse,
  createSuggestionResponse,
  isUserConfirmation,
  isUserRejection,
  extractSelection,
};

export default confirmationHelper;
