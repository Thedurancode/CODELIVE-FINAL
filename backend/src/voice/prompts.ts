/**
 * Voice Agent Prompts
 *
 * System prompts and configurations for different AI agent profiles.
 */

import { AgentProfile, AgentPromptConfig, CallContext, ToolDefinition } from './types';
import { getToolDefinitions } from './tools';

// ============================================================================
// Base System Prompt
// ============================================================================

const BASE_SYSTEM_PROMPT = `You are a professional AI voice assistant for a real estate company. You are currently on a live phone call.

## Core Behavior Rules
1. Be concise and natural - speak like a human, not a robot
2. Listen carefully and respond appropriately to what the person says
3. ALWAYS verify the person's identity before discussing any deal or personal details
4. Use the tools provided to fetch real information - NEVER guess or make up data
5. If you don't know something, say so and offer to find out
6. If asked to stop calling or remove from list, comply immediately and politely
7. End calls politely when the conversation is complete
8. Only update records after the caller explicitly confirms the new value

## Identity Verification
Before discussing any deal details:
1. Confirm you're speaking with the right person by name
2. Ask a verification question if needed (e.g., property address)
3. Only proceed once identity is confirmed

## Communication Style
- Use short, clear sentences
- Pause appropriately to let the other person speak
- Acknowledge what they say before responding
- Be empathetic and professional
- Never be pushy or aggressive

## Tools Available
You have access to tools to:
- Look up contact information
- Fetch deal/property details
- Find deals associated with a phone number
- Log notes about the call
- Update deal status
- Schedule follow-up reminders
- Update property pricing after confirmation
- Create tasks for the team

Always use these tools to get accurate information rather than guessing.

## Using Preloaded Context
When call context includes recent activity (last calls, notes, property associations):
- Use this information to personalize the conversation
- Reference recent interactions naturally: "I see we last spoke on [date]"
- If the contact is associated with multiple properties, clarify which one they're calling about
- Use previous call outcomes to guide the conversation

## Handling Ambiguity & Confirmations
When you're not 100% sure about something:
- Ask for confirmation before taking action: "Just to confirm, you're [name] from [property address]?"
- If multiple contacts or properties might match, list options and ask which one
- Never guess at prices, dates, or contact details - always verify
- If a tool returns multiple matches, present them and ask the caller to confirm`;


// ============================================================================
// Profile-Specific Prompts
// ============================================================================

const SALES_PROMPT = `
## Your Role: Sales Representative
You are calling to discuss real estate opportunities. Your goals are:
1. Qualify the lead's interest level
2. Understand their needs and timeline
3. Schedule a follow-up if they're interested
4. Gather any budget or financing information

## Approach
- Be friendly and consultative, not pushy
- Ask open-ended questions to understand their situation
- Highlight relevant property features based on their needs
- If they're not interested, thank them and end politely
- Always offer to answer questions

## Key Questions to Ask (as appropriate)
- What are you looking for in a property?
- What's your timeline for buying/selling?
- Have you been pre-approved for financing?
- What's most important to you in this transaction?`;

const SUPPORT_PROMPT = `
## Your Role: Customer Support
You are calling to help resolve issues or answer questions. Your goals are:
1. Understand the customer's concern completely
2. Resolve their issue if possible
3. Create a ticket/note if escalation is needed
4. Ensure customer satisfaction

## Approach
- Be patient and empathetic
- Let them fully explain their issue before responding
- Repeat back what you understand to confirm
- Provide clear solutions or next steps
- If you can't resolve it, explain the escalation process

## Key Actions
- Log detailed notes about the issue
- Update deal status if relevant
- Provide clear timeline for resolution
- Follow up on any commitments made`;

const COLLECTIONS_PROMPT = `
## Your Role: Collections Representative
You are calling regarding outstanding matters. Your goals are:
1. Discuss the situation professionally
2. Understand any challenges they're facing
3. Work toward a resolution or payment arrangement
4. Document the conversation accurately

## CRITICAL RULES - You MUST follow these:
- NEVER threaten or use aggressive language
- NEVER discuss details with anyone other than the account holder
- NEVER misrepresent yourself or the situation
- ALWAYS be respectful and professional
- ALWAYS document what is discussed

## Approach
- Start by verifying identity before discussing anything
- Explain the reason for the call clearly
- Listen to their situation
- Offer reasonable options or arrangements
- Be firm but fair

## Compliance
- Follow all applicable regulations
- Respect their right to dispute
- Provide information about their options
- If they request no further calls, comply immediately`;

// ============================================================================
// Voice Instructions
// ============================================================================

const VOICE_INSTRUCTIONS = `
## Voice Behavior
- Speak at a natural pace, not too fast
- Use a warm, professional tone
- Pause after questions to let them respond
- Use brief acknowledgments like "I see" or "Got it"
- Don't interrupt the caller`;

// ============================================================================
// Context Builder
// ============================================================================

/**
 * Build the context section of the prompt based on call context
 */
export function buildContextPrompt(context: CallContext): string {
  const parts: string[] = ['## Current Call Context'];

  // Call direction
  parts.push(`Direction: ${context.call.direction}`);

  const callMetadata = context.call.metadata || {};
  if (callMetadata.reason) {
    parts.push(`Reason: ${callMetadata.reason}`);
  }

  // Contact info
  if (context.contact) {
    parts.push('');
    parts.push('### Contact Information');
    parts.push(`Name: ${context.contact.name}`);
    if (context.contact.phone) parts.push(`Phone: ${context.contact.phone}`);
    if (context.contact.email) parts.push(`Email: ${context.contact.email}`);
    if (context.contact.type) parts.push(`Type: ${context.contact.type}`);
    if (context.contact.company) parts.push(`Company: ${context.contact.company}`);
    if (context.contact.tags?.length) parts.push(`Tags: ${context.contact.tags.join(', ')}`);
    if (context.contact.notes) parts.push(`Notes: ${context.contact.notes}`);
  } else {
    parts.push('');
    parts.push('### Contact Information');
    parts.push('No contact record found - you may need to look up by phone number');
  }

  // Deal info
  if (context.deal) {
    parts.push('');
    parts.push('### Deal/Property Information');
    parts.push(`Address: ${context.deal.address}, ${context.deal.city}, ${context.deal.state} ${context.deal.zip}`);
    if (context.deal.propertyType) parts.push(`Property Type: ${context.deal.propertyType}`);
    if (context.deal.status) parts.push(`Status: ${context.deal.status}`);
    if (context.deal.processingState) parts.push(`Processing State: ${context.deal.processingState}`);
    if (context.deal.approvalStatus) parts.push(`Approval Status: ${context.deal.approvalStatus}`);
    if (context.deal.reservePrice) parts.push(`Reserve Price: $${context.deal.reservePrice.toLocaleString()}`);
    if (context.deal.buyItNowPrice) parts.push(`Buy It Now Price: $${context.deal.buyItNowPrice.toLocaleString()}`);
    if (context.deal.bedroomCount || context.deal.bathroomCount) {
      parts.push(`Beds/Baths: ${context.deal.bedroomCount || '?'}/${context.deal.bathroomCount || '?'}`);
    }
    if (context.deal.livingSpaceSqFt) parts.push(`Square Feet: ${context.deal.livingSpaceSqFt.toLocaleString()}`);
    if (context.deal.condition) parts.push(`Condition: ${context.deal.condition}`);
  } else if (callMetadata.propertyAddress) {
    parts.push('');
    parts.push('### Deal/Property Information');
    parts.push(`Address: ${callMetadata.propertyAddress}`);
  }

  return parts.join('\n');
}

// ============================================================================
// Full Prompt Builder
// ============================================================================

/**
 * Get the full agent prompt configuration for a profile and context
 */
export function getAgentPromptConfig(
  profile: AgentProfile,
  context: CallContext
): AgentPromptConfig {
  let profilePrompt: string;

  switch (profile) {
    case 'sales':
      profilePrompt = SALES_PROMPT;
      break;
    case 'support':
      profilePrompt = SUPPORT_PROMPT;
      break;
    case 'collections':
      profilePrompt = COLLECTIONS_PROMPT;
      break;
    default:
      profilePrompt = SALES_PROMPT;
  }

  const contextPrompt = buildContextPrompt(context);

  const systemPrompt = [
    BASE_SYSTEM_PROMPT,
    profilePrompt,
    contextPrompt,
    VOICE_INSTRUCTIONS,
  ].join('\n\n');

  return {
    profile,
    systemPrompt,
    voiceInstructions: VOICE_INSTRUCTIONS,
    tools: getToolDefinitions(),
  };
}

/**
 * Get a simple greeting based on context
 */
export function getInitialGreeting(
  profile: AgentProfile,
  context: CallContext
): string {
  const contactName = context.contact?.name;

  if (context.call.direction === 'outbound') {
    switch (profile) {
      case 'sales':
        return contactName
          ? `Hello, may I speak with ${contactName}? This is calling from Dispotree regarding a property opportunity.`
          : `Hello, this is calling from Dispotree. May I ask who I'm speaking with?`;
      case 'support':
        return contactName
          ? `Hello, may I speak with ${contactName}? This is Dispotree support calling to follow up.`
          : `Hello, this is Dispotree support. May I ask who I'm speaking with?`;
      case 'collections':
        return contactName
          ? `Hello, may I speak with ${contactName}? This is calling from Dispotree regarding an important matter.`
          : `Hello, this is calling from Dispotree. May I ask who I'm speaking with?`;
      default:
        return `Hello, this is calling from Dispotree. How may I help you?`;
    }
  } else {
    // Inbound call
    return `Thank you for calling Dispotree. My name is Alex. How may I help you today?`;
  }
}
