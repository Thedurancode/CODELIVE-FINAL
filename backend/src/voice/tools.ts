/**
 * Voice Agent Tools
 *
 * Tool definitions and implementations for the AI voice agent.
 * These tools allow the agent to fetch and update data in Supabase.
 */

import { Op } from 'sequelize';
import { supabaseAdmin } from '../config/supabase';
import Contact from '../models/Contact';
import Property from '../models/Property';
import MarketplaceUser from '../models/MarketplaceUser';
import { logger } from '../services/LoggerService';
import { scheduledTaskService } from '../services/agent/ScheduledTaskService';
import { taskService } from '../services/TaskService';
import { reminderService } from '../services/ReminderService';
import { resolveCommunicationContext } from '../utils/organizationDefaults';
import {
  ToolDefinition,
  ToolCallRequest,
  ToolCallResult,
  ContactContext,
  DealContext,
} from './types';
import ContactActivity from '../models/ContactActivity';
import PropertyContact from '../models/PropertyContact';

// ============================================================================
// Tool Definitions (for OpenAI function calling)
// ============================================================================

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'get_contact',
        description: 'Get contact information by ID or phone number',
        parameters: {
          type: 'object',
          properties: {
            contact_id: {
              type: 'string',
              description: 'The UUID of the contact (if known)',
            },
            phone: {
              type: 'string',
              description: 'The phone number to look up (if contact_id not known)',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_deal',
        description: 'Get deal/property information by ID',
        parameters: {
          type: 'object',
          properties: {
            deal_id: {
              type: 'string',
              description: 'The ID of the deal/property',
            },
          },
          required: ['deal_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'find_deals_by_phone',
        description: 'Find deals/properties associated with a phone number',
        parameters: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'The phone number to search for',
            },
          },
          required: ['phone'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'log_call_note',
        description: 'Log a note or observation about this call',
        parameters: {
          type: 'object',
          properties: {
            deal_id: {
              type: 'string',
              description: 'The deal ID to attach the note to (optional)',
            },
            contact_id: {
              type: 'string',
              description: 'The contact ID to attach the note to (optional)',
            },
            note: {
              type: 'string',
              description: 'The note content',
            },
            outcome: {
              type: 'string',
              description: 'Call outcome if applicable',
              enum: [
                'follow_up',
                'hot_lead',
                'not_interested',
                'wrong_number',
                'resolved',
                'escalate',
              ],
            },
          },
          required: ['note'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'schedule_call_reminder',
        description: 'Schedule a reminder to call the contact back',
        parameters: {
          type: 'object',
          properties: {
            when: {
              type: 'string',
              description: 'When to remind (e.g., "in 5 days at 8pm")',
            },
            note: {
              type: 'string',
              description: 'Optional note to include in the reminder',
            },
            deal_id: {
              type: 'string',
              description: 'The deal/property ID (optional if call already linked)',
            },
            contact_id: {
              type: 'string',
              description: 'The contact ID (optional if call already linked)',
            },
            timezone: {
              type: 'string',
              description: 'Timezone for scheduling (e.g., America/New_York)',
            },
          },
          required: ['when'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_task',
        description: 'Create and assign a task during the call',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Task title',
            },
            description: {
              type: 'string',
              description: 'Task details',
            },
            due: {
              type: 'string',
              description: 'Due date/time (e.g., "in 5 days at 8pm")',
            },
            timezone: {
              type: 'string',
              description: 'Timezone for due date (e.g., America/New_York)',
            },
            priority: {
              type: 'string',
              enum: ['low', 'normal', 'high', 'urgent'],
              description: 'Task priority',
            },
            assignees: {
              type: 'array',
              items: { type: 'string' },
              description: 'Assignee name(s) or email(s)',
            },
            assignee_role: {
              type: 'string',
              description: 'Assign to all users with this role',
            },
            assign_to_all: {
              type: 'boolean',
              description: 'Assign to everyone in the organization',
            },
            deal_id: {
              type: 'string',
              description: 'The deal/property ID (optional if call already linked)',
            },
            notes: {
              type: 'string',
              description: 'Internal notes for the task',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Task tags',
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_deal_status',
        description: 'Update the status of a deal/property',
        parameters: {
          type: 'object',
          properties: {
            deal_id: {
              type: 'string',
              description: 'The ID of the deal to update',
            },
            status: {
              type: 'string',
              description: 'The new status',
              enum: ['Green', 'Yellow', 'Red'],
            },
          },
          required: ['deal_id', 'status'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_property_pricing',
        description:
          'Update pricing fields on the property. Use only after the caller confirms the change.',
        parameters: {
          type: 'object',
          properties: {
            deal_id: {
              type: 'string',
              description: 'The ID of the deal/property (optional if call already linked)',
            },
            price_type: {
              type: 'string',
              description: 'Which price field to update',
              enum: [
                'reserve_price',
                'buy_it_now_price',
                'mls_listing_price',
                'starting_bid_amount',
                'purchase_contract_price',
              ],
            },
            amount: {
              type: 'number',
              description: 'New price amount (numeric, no currency symbols)',
            },
          },
          required: ['price_type', 'amount'],
        },
      },
    },
  ];
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

/**
 * Get recent activity summary for a contact
 */
async function getContactActivitySummary(contactId: number): Promise<{
  lastCall?: { date: Date; outcome?: string };
  lastActivity?: { type: string; date: Date };
  totalCalls: number;
}> {
  try {
    const summary = await ContactActivity.getSummary(contactId);
    const timeline = await ContactActivity.getTimeline(contactId, { limit: 2, types: ['call'] });

    const lastCall = timeline.activities[0];

    return {
      lastCall: lastCall ? {
        date: lastCall.createdAt,
        outcome: lastCall.callOutcome || undefined,
      } : undefined,
      lastActivity: summary.lastActivity ? {
        type: 'activity',
        date: summary.lastActivity,
      } : undefined,
      totalCalls: summary.totalCalls,
    };
  } catch (error) {
    logger.warn('Failed to get contact activity summary', { contactId }, error);
    return { totalCalls: 0 };
  }
}

/**
 * Format time ago for voice responses
 */
function formatTimeAgoVoice(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return `on ${date.toLocaleDateString()}`;
}

async function resolveDealId(args: { deal_id?: string }, callId: string): Promise<number | null> {
  if (args.deal_id) {
    const dealId = parseInt(args.deal_id, 10);
    return Number.isNaN(dealId) ? null : dealId;
  }

  const { data: callData, error } = await supabaseAdmin
    .from('calls')
    .select('deal_id')
    .eq('id', callId)
    .single();

  if (error || !callData?.deal_id) {
    return null;
  }

  return callData.deal_id as number;
}

async function loadCallInfo(callId: string): Promise<{
  dealId: number | null;
  contactId: string | null;
  initiatedBy: string | null;
  toNumber: string | null;
  organizationId: string | null;
}> {
  const { data: callData, error } = await supabaseAdmin
    .from('calls')
    .select('deal_id, contact_id, initiated_by, to_number, organization_id')
    .eq('id', callId)
    .single();

  if (error || !callData) {
    return {
      dealId: null,
      contactId: null,
      initiatedBy: null,
      toNumber: null,
      organizationId: null,
    };
  }

  return {
    dealId: callData.deal_id ?? null,
    contactId: callData.contact_id ?? null,
    initiatedBy: callData.initiated_by ?? null,
    toNumber: callData.to_number ?? null,
    organizationId: callData.organization_id ?? null,
  };
}

type AssigneeMatch = {
  id: string;
  name: string;
  email: string;
  role: string;
};

async function findAssigneeByNameOrEmail(
  query: string,
  organizationId: string | null
): Promise<AssigneeMatch | null | { error: string }> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const where: Record<string, unknown> = {};
  if (organizationId) where.organizationId = organizationId;

  let matches: MarketplaceUser[] = [];
  if (trimmed.includes('@')) {
    matches = await MarketplaceUser.findAll({
      where: {
        ...where,
        email: { [Op.iLike]: trimmed },
      },
      limit: 5,
    });
  } else {
    matches = await MarketplaceUser.findAll({
      where: {
        ...where,
        name: { [Op.iLike]: `%${trimmed}%` },
      },
      limit: 5,
    });
  }

  if (matches.length === 0) {
    return { error: `No user found for "${trimmed}".` };
  }

  if (matches.length > 1) {
    const names = matches.map((m) => `${m.name} <${m.email}>`).join(', ');
    return { error: `Multiple users matched "${trimmed}": ${names}` };
  }

  const match = matches[0];
  return {
    id: match.id,
    name: match.name,
    email: match.email,
    role: match.role,
  };
}

async function resolveAssigneesForCall(
  args: {
    assignees?: string[];
    assignee_role?: string;
    assign_to_all?: boolean;
  },
  callId: string
): Promise<{ assignees: AssigneeMatch[]; initiatedBy: string; organizationId: string | null } | { error: string }> {
  const callInfo = await loadCallInfo(callId);
  const { userId: initiatedBy, organizationId } = await resolveCommunicationContext({
    userId: callInfo.initiatedBy,
    organizationId: callInfo.organizationId,
  });
  if (!initiatedBy) {
    return { error: 'No user linked to this call.' };
  }

  if (args.assign_to_all) {
    if (!organizationId) {
      return { error: 'Organization not found for assigning tasks.' };
    }
    const users = await MarketplaceUser.findAll({
      where: { organizationId },
      attributes: ['id', 'name', 'email', 'role'],
    });
    if (users.length === 0) {
      return { error: 'No users found in this organization.' };
    }
    return {
      assignees: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      })),
      initiatedBy,
      organizationId,
    };
  }

  if (args.assignee_role) {
    if (!organizationId) {
      return { error: 'Organization not found for assigning tasks.' };
    }
    const users = await MarketplaceUser.findAll({
      where: { organizationId, role: args.assignee_role },
      attributes: ['id', 'name', 'email', 'role'],
    });
    if (users.length === 0) {
      return { error: `No users found with role "${args.assignee_role}".` };
    }
    return {
      assignees: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      })),
      initiatedBy,
      organizationId,
    };
  }

  const list = args.assignees || [];
  if (list.length === 0) {
    const self = await MarketplaceUser.findByPk(initiatedBy, { attributes: ['id', 'name', 'email', 'role'] });
    if (!self) {
      return { error: 'User not found for task assignment.' };
    }
    return {
      assignees: [{
        id: self.id,
        name: self.name,
        email: self.email,
        role: self.role,
      }],
      initiatedBy,
      organizationId,
    };
  }

  if (!organizationId) {
    return { error: 'Organization not found for assigning tasks.' };
  }

  const resolved: AssigneeMatch[] = [];
  for (const query of list) {
    const match = await findAssigneeByNameOrEmail(query, organizationId);
    if (!match || 'error' in match) {
      return { error: match?.error || `No user found for "${query}".` };
    }
    resolved.push(match);
  }

  return {
    assignees: resolved,
    initiatedBy,
    organizationId,
  };
}

/**
 * Get contact by ID or phone number
 */
async function getContact(args: {
  contact_id?: string;
  phone?: string;
}): Promise<ToolCallResult> {
  try {
    let contact: Contact | null = null;

    if (args.contact_id) {
      contact = await Contact.findByPk(args.contact_id);
    } else if (args.phone) {
      const normalizedPhone = normalizePhone(args.phone);
      // Search for contact with matching phone
      const contacts = await Contact.findAll({
        where: { status: 'active' },
        limit: 100,
      });

      contact = contacts.find((c) => {
        if (!c.phone) return false;
        return normalizePhone(c.phone) === normalizedPhone;
      }) || null;
    }

    if (!contact) {
      return {
        success: false,
        error: 'Contact not found',
        suggestion: args.phone
          ? `No contact found with phone number ${args.phone}. You may need to create a new contact record.`
          : 'Contact ID not found in the database.',
      };
    }

    // Get activity summary for context
    const activitySummary = await getContactActivitySummary(contact.id);

    // Get associated properties
    const propertyAssignments = await PropertyContact.findAll({
      where: { contactId: contact.id },
      include: [{ model: Property, as: 'property' }],
      limit: 3,
    });

    const associatedProperties = propertyAssignments
      .filter((pa) => pa.property)
      .map((pa) => ({
        id: pa.property!.id,
        address: `${pa.property!.address?.houseNumber || ''} ${pa.property!.address?.street || ''}`.trim(),
        city: pa.property!.city,
        state: pa.property!.state,
        role: pa.role,
      }));

    const result: ContactContext & {
      recentActivity?: {
        lastCall?: string;
        lastCallOutcome?: string;
        totalCalls: number;
      };
      associatedProperties?: Array<{
        id: number;
        address: string;
        city?: string;
        state?: string;
        role?: string;
      }>;
    } = {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      type: contact.type,
      company: contact.company,
      tags: contact.tags || [],
      notes: contact.notes,
      recentActivity: {
        lastCall: activitySummary.lastCall ? formatTimeAgoVoice(activitySummary.lastCall.date) : undefined,
        lastCallOutcome: activitySummary.lastCall?.outcome,
        totalCalls: activitySummary.totalCalls,
      },
      associatedProperties: associatedProperties.length > 0 ? associatedProperties : undefined,
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    logger.error('Error in get_contact tool', {}, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get contact',
    };
  }
}

/**
 * Get deal/property by ID
 */
async function getDeal(args: { deal_id: string }): Promise<ToolCallResult> {
  try {
    const dealId = parseInt(args.deal_id, 10);
    if (isNaN(dealId)) {
      return { success: false, error: 'Invalid deal ID' };
    }

    const property = await Property.findByPk(dealId);

    if (!property) {
      return { success: false, error: 'Deal not found' };
    }

    const address = property.address;
    const fullAddress = address
      ? `${address.houseNumber || ''} ${address.street || ''}`.trim()
      : 'Unknown Address';

    const result: DealContext = {
      id: property.id,
      propertyId: property.propertyId,
      address: fullAddress,
      city: property.city || '',
      state: property.state || '',
      zip: property.zip || '',
      status: property.status || null,
      processingState: property.processingState || null,
      approvalStatus: property.approvalStatus || null,
      reservePrice: property.reservePrice ? Number(property.reservePrice) : null,
      buyItNowPrice: property.buyItNowPrice ? Number(property.buyItNowPrice) : null,
      propertyType: property.propertyType || null,
      bedroomCount: property.bedroomCount || null,
      bathroomCount: property.bathroomCount || null,
      livingSpaceSqFt: property.livingSpaceSqFt || null,
      condition: property.condition || null,
    };

    return { success: true, data: result };
  } catch (error) {
    logger.error('Error in get_deal tool', {}, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get deal',
    };
  }
}

/**
 * Find deals associated with a phone number
 */
async function findDealsByPhone(args: { phone: string }): Promise<ToolCallResult> {
  try {
    const normalizedPhone = normalizePhone(args.phone);

    // First, find contacts with this phone
    const contacts = await Contact.findAll({
      where: { status: 'active' },
      limit: 100,
    });

    const matchingContacts = contacts.filter((c) => {
      if (!c.phone) return false;
      return normalizePhone(c.phone) === normalizedPhone;
    });

    // Also search properties by owner phones
    const properties = await Property.findAll({
      where: {},
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    const matchingProperties = properties.filter((p) => {
      if (p.ownerPhones && Array.isArray(p.ownerPhones)) {
        return p.ownerPhones.some(
          (phone) => normalizePhone(phone) === normalizedPhone
        );
      }
      if (p.agentPhoneNumber && normalizePhone(p.agentPhoneNumber) === normalizedPhone) {
        return true;
      }
      return false;
    });

    const results = matchingProperties.slice(0, 5).map((p) => {
      const address = p.address;
      const fullAddress = address
        ? `${address.houseNumber || ''} ${address.street || ''}`.trim()
        : 'Unknown Address';

      return {
        id: p.id,
        address: fullAddress,
        city: p.city,
        state: p.state,
        status: p.status,
        processingState: p.processingState,
        reservePrice: p.reservePrice ? Number(p.reservePrice) : null,
      };
    });

    return {
      success: true,
      data: {
        contacts: matchingContacts.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
        })),
        deals: results,
        total_deals: matchingProperties.length,
      },
    };
  } catch (error) {
    logger.error('Error in find_deals_by_phone tool', {}, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find deals',
    };
  }
}

/**
 * Log a note about the call
 */
async function logCallNote(
  args: {
    deal_id?: string;
    contact_id?: string;
    note: string;
    outcome?: string;
  },
  callId: string
): Promise<ToolCallResult> {
  try {
    // Store in call_events table
    const { error } = await supabaseAdmin.from('call_events').insert({
      call_id: callId,
      type: 'tool_result',
      speaker: 'system',
      payload: {
        tool: 'log_call_note',
        deal_id: args.deal_id || null,
        contact_id: args.contact_id || null,
        note: args.note,
        outcome: args.outcome || null,
      },
    });

    if (error) {
      throw error;
    }

    // Also update contact notes if contact_id provided
    if (args.contact_id) {
      const contact = await Contact.findByPk(args.contact_id);
      if (contact) {
        const existingNotes = contact.notes || '';
        const timestamp = new Date().toISOString().split('T')[0];
        const newNote = `[${timestamp}] ${args.note}`;
        await contact.update({
          notes: existingNotes
            ? `${existingNotes}\n${newNote}`
            : newNote,
        });
      }
    }

    return {
      success: true,
      data: { message: 'Note logged successfully' },
    };
  } catch (error) {
    logger.error('Error in log_call_note tool', {}, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log note',
    };
  }
}

/**
 * Schedule a reminder to call the contact back
 */
async function scheduleCallReminder(
  args: {
    when: string;
    note?: string;
    deal_id?: string;
    contact_id?: string;
    timezone?: string;
  },
  callId: string
): Promise<ToolCallResult> {
  try {
    if (!args.when) {
      return { success: false, error: 'Reminder time is required.' };
    }

    const callInfo = await loadCallInfo(callId);
    const { userId: initiatedBy, organizationId } = await resolveCommunicationContext({
      userId: callInfo.initiatedBy,
      organizationId: callInfo.organizationId,
    });
    if (!initiatedBy) {
      return { success: false, error: 'No user linked to this call.' };
    }

    const scheduledFor = scheduledTaskService.parseNaturalTime(args.when, args.timezone);
    if (!scheduledFor) {
      return {
        success: false,
        error: `Could not understand the time "${args.when}".`,
      };
    }

    if (scheduledFor <= new Date()) {
      return { success: false, error: 'Scheduled time must be in the future.' };
    }

    const contactId = args.contact_id || callInfo.contactId || null;
    const contact = contactId ? await Contact.findByPk(contactId) : null;
    const contactName = contact?.name || 'contact';
    const contactPhone = contact?.phone || callInfo.toNumber || null;

    const dealId = await resolveDealId({ deal_id: args.deal_id }, callId);
    const property = dealId ? await Property.findByPk(dealId) : null;
    const propertyAddress = property
      ? `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim()
      : null;

    const messageParts = [`Call back ${contactName}`];
    if (contactPhone) messageParts.push(`Phone: ${contactPhone}`);
    if (propertyAddress) messageParts.push(`Property: ${propertyAddress}`);
    if (args.note) messageParts.push(`Note: ${args.note}`);

    const reminder = await reminderService.createReminder({
      title: `Call back ${contactName}`,
      description: messageParts.join(' | '),
      reminderTime: scheduledFor,
      timezone: args.timezone,
      userId: initiatedBy,
      organizationId: organizationId || undefined,
      linkType: dealId ? 'deal' : 'general',
      propertyId: dealId || undefined,
      notes: args.note,
      metadata: {
        callId,
        contactId,
        contactPhone,
        propertyAddress,
      },
    });

    return {
      success: true,
      data: {
        reminderId: reminder.id,
        scheduledFor: reminder.reminderTime.toISOString(),
        timezone: reminder.timezone,
        contactId,
        dealId,
      },
      message: `Reminder scheduled for ${reminder.reminderTime.toLocaleString()}.`,
    };
  } catch (error) {
    logger.error('Error scheduling call reminder', { callId }, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to schedule reminder',
    };
  }
}

/**
 * Update deal status
 */
async function updateDealStatus(args: {
  deal_id: string;
  status: 'Green' | 'Yellow' | 'Red';
}): Promise<ToolCallResult> {
  try {
    const dealId = parseInt(args.deal_id, 10);
    if (isNaN(dealId)) {
      return { success: false, error: 'Invalid deal ID' };
    }

    const property = await Property.findByPk(dealId);
    if (!property) {
      return { success: false, error: 'Deal not found' };
    }

    await property.update({ status: args.status });

    return {
      success: true,
      data: {
        message: `Deal status updated to ${args.status}`,
        deal_id: dealId,
        new_status: args.status,
      },
    };
  } catch (error) {
    logger.error('Error in update_deal_status tool', {}, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update status',
    };
  }
}

/**
 * Create tasks during a call
 */
async function createTaskFromCall(
  args: {
    title: string;
    description?: string;
    due?: string;
    timezone?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    assignees?: string[];
    assignee_role?: string;
    assign_to_all?: boolean;
    deal_id?: string;
    notes?: string;
    tags?: string[];
  },
  callId: string
): Promise<ToolCallResult> {
  try {
    if (!args.title) {
      return { success: false, error: 'Task title is required.' };
    }

    const assigneeResult = await resolveAssigneesForCall(
      {
        assignees: args.assignees,
        assignee_role: args.assignee_role,
        assign_to_all: args.assign_to_all,
      },
      callId
    );

    if ('error' in assigneeResult) {
      return { success: false, error: assigneeResult.error };
    }

    let dueDate: Date | undefined;
    if (args.due) {
      const parsed = scheduledTaskService.parseNaturalTime(args.due, args.timezone);
      if (!parsed) {
        return { success: false, error: `Could not understand the time "${args.due}".` };
      }
      dueDate = parsed;
    }

    const dealId = await resolveDealId({ deal_id: args.deal_id }, callId);

    const created = [];
    for (const assignee of assigneeResult.assignees) {
      const task = await taskService.createTask({
        title: args.title,
        description: args.description,
        priority: args.priority,
        dueDate: dueDate ? dueDate.toISOString() : undefined,
        assignedTo: assignee.id,
        assignedBy: assigneeResult.initiatedBy,
        createdBy: assigneeResult.initiatedBy,
        organizationId: assigneeResult.organizationId || undefined,
        propertyId: dealId || undefined,
        notes: args.notes,
        tags: args.tags,
      });

      created.push({
        id: task.id,
        title: task.title,
        assignee: { id: assignee.id, name: assignee.name, email: assignee.email },
        dueDate: task.dueDate?.toISOString() || null,
        priority: task.priority,
      });
    }

    return {
      success: true,
      data: {
        count: created.length,
        tasks: created,
      },
    };
  } catch (error) {
    logger.error('Error in create_task tool', { callId }, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create task',
    };
  }
}

/**
 * Update property pricing fields
 */
async function updatePropertyPricing(
  args: { deal_id?: string; price_type: string; amount: number },
  callId: string
): Promise<ToolCallResult> {
  try {
    const dealId = await resolveDealId({ deal_id: args.deal_id }, callId);
    if (!dealId) {
      return { success: false, error: 'Deal not found for this call. Provide deal_id.' };
    }

    if (!Number.isFinite(args.amount) || args.amount < 0) {
      return { success: false, error: 'Invalid amount provided.' };
    }

    const fieldMap: Record<string, keyof Property> = {
      reserve_price: 'reservePrice',
      buy_it_now_price: 'buyItNowPrice',
      mls_listing_price: 'mlsListingPrice',
      starting_bid_amount: 'startingBidAmount',
      purchase_contract_price: 'purchaseContractPrice',
    };

    const field = fieldMap[args.price_type];
    if (!field) {
      return { success: false, error: 'Invalid price_type provided.' };
    }

    const property = await Property.findByPk(dealId);
    if (!property) {
      return { success: false, error: 'Deal not found.' };
    }

    const previousValue = (property as any)[field] as number | null | undefined;
    await property.update({ [field]: args.amount });

    return {
      success: true,
      data: {
        deal_id: dealId,
        field: args.price_type,
        previous: previousValue ?? null,
        updated: args.amount,
      },
    };
  } catch (error) {
    logger.error('Error in update_property_pricing tool', { callId }, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update pricing',
    };
  }
}

// ============================================================================
// Tool Router
// ============================================================================

/**
 * Execute a tool call and return the result
 */
export async function executeToolCall(request: ToolCallRequest): Promise<ToolCallResult> {
  const { name, arguments: args, call_id } = request;

  logger.info('Executing tool call', { tool: name, args });

  switch (name) {
    case 'get_contact':
      return getContact(args as { contact_id?: string; phone?: string });

    case 'get_deal':
      return getDeal(args as { deal_id: string });

    case 'find_deals_by_phone':
      return findDealsByPhone(args as { phone: string });

    case 'log_call_note':
      return logCallNote(
        args as {
          deal_id?: string;
          contact_id?: string;
          note: string;
          outcome?: string;
        },
        call_id
      );

    case 'schedule_call_reminder':
      return scheduleCallReminder(
        args as {
          when: string;
          note?: string;
          deal_id?: string;
          contact_id?: string;
          timezone?: string;
        },
        call_id
      );

    case 'create_task':
      return createTaskFromCall(
        args as {
          title: string;
          description?: string;
          due?: string;
          timezone?: string;
          priority?: 'low' | 'normal' | 'high' | 'urgent';
          assignees?: string[];
          assignee_role?: string;
          assign_to_all?: boolean;
          deal_id?: string;
          notes?: string;
          tags?: string[];
        },
        call_id
      );

    case 'update_deal_status':
      return updateDealStatus(
        args as { deal_id: string; status: 'Green' | 'Yellow' | 'Red' }
      );

    case 'update_property_pricing':
      return updatePropertyPricing(
        args as { deal_id?: string; price_type: string; amount: number },
        call_id
      );

    default:
      return {
        success: false,
        error: `Unknown tool: ${name}`,
      };
  }
}

// ============================================================================
// Context Loaders
// ============================================================================

/**
 * Load contact context from database
 */
export async function loadContactContext(
  contactId: string
): Promise<ContactContext | null> {
  try {
    const contact = await Contact.findByPk(contactId);
    if (!contact) return null;

    return {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      type: contact.type,
      company: contact.company,
      tags: contact.tags || [],
      notes: contact.notes,
    };
  } catch (error) {
    logger.error('Error loading contact context', { contactId }, error);
    return null;
  }
}

/**
 * Load deal context from database
 */
export async function loadDealContext(dealId: number): Promise<DealContext | null> {
  try {
    const property = await Property.findByPk(dealId);
    if (!property) return null;

    const address = property.address;
    const fullAddress = address
      ? `${address.houseNumber || ''} ${address.street || ''}`.trim()
      : 'Unknown Address';

    return {
      id: property.id,
      propertyId: property.propertyId,
      address: fullAddress,
      city: property.city || '',
      state: property.state || '',
      zip: property.zip || '',
      status: property.status || null,
      processingState: property.processingState || null,
      approvalStatus: property.approvalStatus || null,
      reservePrice: property.reservePrice ? Number(property.reservePrice) : null,
      buyItNowPrice: property.buyItNowPrice ? Number(property.buyItNowPrice) : null,
      propertyType: property.propertyType || null,
      bedroomCount: property.bedroomCount || null,
      bathroomCount: property.bathroomCount || null,
      livingSpaceSqFt: property.livingSpaceSqFt || null,
      condition: property.condition || null,
    };
  } catch (error) {
    logger.error('Error loading deal context', { dealId }, error);
    return null;
  }
}

/**
 * Find contact by phone number
 */
export async function findContactByPhone(phone: string): Promise<ContactContext | null> {
  try {
    const normalizedPhone = normalizePhone(phone);
    const contacts = await Contact.findAll({
      where: { status: 'active' },
      limit: 100,
    });

    const contact = contacts.find((c) => {
      if (!c.phone) return false;
      return normalizePhone(c.phone) === normalizedPhone;
    });

    if (!contact) return null;

    return {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      type: contact.type,
      company: contact.company,
      tags: contact.tags || [],
      notes: contact.notes,
    };
  } catch (error) {
    logger.error('Error finding contact by phone', { phone }, error);
    return null;
  }
}
