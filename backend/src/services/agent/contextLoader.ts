/**
 * Context Loader Service
 *
 * Preloads conversation context by feeding in call/activity/property history.
 * This enables the agent to have rich context about contacts, properties,
 * tasks, and recent interactions without requiring extra prompts.
 */

import { Op } from 'sequelize';
import { Contact, ContactActivity, Property, PropertyContact, Task, ScheduledTask } from '../../models';
import { getOrganizationIdForUserId } from '../../utils/organizationDefaults';
import type { ActivityType } from '../../models/ContactActivity';
import { entitySearchService } from '../EntitySearchService';

// ============================================================================
// Types
// ============================================================================

export interface ContactContextInfo {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  type?: string;
  role?: string;
  company?: string;
  recentActivity: Array<{
    type: ActivityType;
    direction: string;
    summary?: string;
    content?: string;
    callOutcome?: string;
    callTranscript?: string;
    createdAt: Date;
  }>;
  activitySummary: {
    totalCalls: number;
    totalEmails: number;
    totalSms: number;
    lastContactedAt?: Date;
  };
}

export interface PropertyContextInfo {
  id: number;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  status?: string;
  notes?: string;
  contacts: Array<{
    id: number;
    name: string;
    role?: string;
    phone?: string;
  }>;
  recentDeals?: Array<{
    stage: string;
    updatedAt: Date;
  }>;
}

export interface TaskContextInfo {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: Date;
  propertyAddress?: string;
  assigneeName?: string;
}

export interface ConversationContextData {
  contacts: ContactContextInfo[];
  properties: PropertyContextInfo[];
  pendingTasks: TaskContextInfo[];
  upcomingReminders: Array<{
    id: number;
    title: string;
    message?: string;
    scheduledFor: Date;
  }>;
}

// ============================================================================
// Context Loader Functions
// ============================================================================

/**
 * Load recent activity for a contact
 */
export async function loadContactActivity(
  contactId: number,
  options?: {
    limit?: number;
    types?: ActivityType[];
  }
): Promise<ContactContextInfo['recentActivity']> {
  const where: Record<string, unknown> = { contactId };
  if (options?.types?.length) {
    where.type = { [Op.in]: options.types };
  }

  const activities = await ContactActivity.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: options?.limit || 5,
    attributes: [
      'type',
      'direction',
      'summary',
      'content',
      'callOutcome',
      'callTranscript',
      'createdAt',
    ],
  });

  return activities.map((a) => ({
    type: a.type,
    direction: a.direction,
    summary: a.summary || undefined,
    content: a.content ? truncateText(a.content, 200) : undefined,
    callOutcome: a.callOutcome || undefined,
    callTranscript: a.callTranscript ? truncateText(a.callTranscript, 500) : undefined,
    createdAt: a.createdAt,
  }));
}

/**
 * Load full context for a contact including activity history
 */
export async function loadContactContext(contactId: number): Promise<ContactContextInfo | null> {
  const contact = await Contact.findByPk(contactId);
  if (!contact) return null;

  const [recentActivity, summary] = await Promise.all([
    loadContactActivity(contactId, { limit: 5 }),
    ContactActivity.getSummary(contactId),
  ]);

  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone || undefined,
    email: contact.email || undefined,
    type: contact.type || undefined,
    company: contact.company || undefined,
    recentActivity,
    activitySummary: {
      totalCalls: summary.totalCalls,
      totalEmails: summary.totalEmails,
      totalSms: summary.totalSms,
      lastContactedAt: summary.lastActivity || undefined,
    },
  };
}

/**
 * Load contacts associated with a property
 */
export async function loadPropertyContacts(propertyId: number): Promise<PropertyContextInfo['contacts']> {
  const assignments = await PropertyContact.findAll({
    where: { propertyId },
    include: [{ model: Contact, as: 'contact' }],
    order: [['isPrimary', 'DESC'], ['createdAt', 'DESC']],
    limit: 5,
  });

  return assignments
    .filter((a) => a.contact)
    .map((a) => ({
      id: a.contact!.id,
      name: a.contact!.name,
      role: a.role || undefined,
      phone: a.contact!.phone || undefined,
    }));
}

/**
 * Load full context for a property including contacts and notes
 */
export async function loadPropertyContext(propertyId: number): Promise<PropertyContextInfo | null> {
  const property = await Property.findByPk(propertyId);
  if (!property) return null;

  const contacts = await loadPropertyContacts(propertyId);

  const address = formatPropertyAddress(property);

  return {
    id: property.id,
    address,
    city: property.city || undefined,
    state: property.state || undefined,
    zip: property.zip || undefined,
    price: property.askingPrice || undefined,
    status: property.status || undefined,
    notes: property.notes ? truncateText(property.notes, 300) : undefined,
    contacts,
  };
}

/**
 * Load pending tasks for a user
 */
export async function loadPendingTasks(
  userId: string,
  options?: { limit?: number; propertyId?: number }
): Promise<TaskContextInfo[]> {
  const where: Record<string, unknown> = {
    assignedTo: userId,
    status: { [Op.in]: ['pending', 'in_progress'] },
  };

  if (options?.propertyId) {
    where.propertyId = options.propertyId;
  }

  const tasks = await Task.findAll({
    where,
    order: [
      ['priority', 'DESC'],
      ['dueDate', 'ASC'],
    ],
    limit: options?.limit || 5,
    include: [{ model: Property, as: 'property' }],
  });

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description || undefined,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate || undefined,
    propertyAddress: t.property ? formatPropertyAddress(t.property) : undefined,
  }));
}

/**
 * Load upcoming reminders for a user
 */
export async function loadUpcomingReminders(
  userId: string,
  options?: { limit?: number }
): Promise<ConversationContextData['upcomingReminders']> {
  const reminders = await ScheduledTask.findAll({
    where: {
      userId,
      type: 'reminder',
      status: 'pending',
      scheduledFor: { [Op.gte]: new Date() },
    },
    order: [['scheduledFor', 'ASC']],
    limit: options?.limit || 5,
  });

  return reminders.map((r) => ({
    id: r.id,
    title: r.title,
    message: r.description || undefined,
    scheduledFor: r.scheduledFor,
  }));
}

/**
 * Load contacts by partial name match with recent activity
 */
export async function loadContactsByName(
  name: string,
  organizationId?: string | null,
  options?: { limit?: number }
): Promise<ContactContextInfo[]> {
  const where: Record<string, unknown> = {
    name: { [Op.iLike]: `%${name}%` },
    status: 'active',
  };

  if (organizationId) {
    where.organizationId = organizationId;
  }

  const contacts = await Contact.findAll({
    where,
    order: [['updatedAt', 'DESC']],
    limit: options?.limit || 5,
  });

  const results: ContactContextInfo[] = [];
  for (const contact of contacts) {
    const context = await loadContactContext(contact.id);
    if (context) {
      results.push(context);
    }
  }

  return results;
}

/**
 * Load property context by address
 */
export async function loadPropertyByAddress(
  street: string,
  city?: string,
  state?: string
): Promise<PropertyContextInfo | null> {
  const whereClause: Record<string, unknown> = {};

  // Search by street in the address JSON field
  if (street) {
    whereClause[Op.or as symbol] = [
      { 'address.street': { [Op.iLike]: `%${street}%` } },
      { 'address.houseNumber': { [Op.iLike]: `%${street.split(' ')[0]}%` } },
    ];
  }

  if (city) {
    whereClause.city = { [Op.iLike]: city };
  }

  if (state) {
    whereClause.state = { [Op.iLike]: state };
  }

  const property = await Property.findOne({
    where: whereClause,
    order: [['updatedAt', 'DESC']],
  });

  if (!property) return null;

  return loadPropertyContext(property.id);
}

// ============================================================================
// Semantic Search (Pinecone)
// ============================================================================

/**
 * Search contacts semantically - finds "attorney" when you search "lawyer"
 */
export async function semanticSearchContacts(
  query: string,
  organizationId?: string | null,
  options?: { limit?: number; minScore?: number }
): Promise<ContactContextInfo[]> {
  if (!entitySearchService.isReady()) {
    // Fall back to string search
    return loadContactsByName(query, organizationId, options);
  }

  try {
    const results = await entitySearchService.searchContacts(query, {
      organizationId: organizationId || undefined,
      topK: options?.limit || 5,
      minScore: options?.minScore || 0.6,
    });

    const contacts: ContactContextInfo[] = [];
    for (const result of results) {
      const context = await loadContactContext(result.entityId);
      if (context) {
        contacts.push(context);
      }
    }

    return contacts;
  } catch (error) {
    console.warn('Semantic contact search failed, falling back to string search:', error);
    return loadContactsByName(query, organizationId, options);
  }
}

/**
 * Search properties semantically
 */
export async function semanticSearchProperties(
  query: string,
  organizationId?: string | null,
  options?: { limit?: number; minScore?: number }
): Promise<PropertyContextInfo[]> {
  if (!entitySearchService.isReady()) {
    // Fall back to address search - extract first part as street
    const parts = query.split(/[,\s]+/);
    return loadPropertyByAddress(parts[0]).then(p => p ? [p] : []);
  }

  try {
    const results = await entitySearchService.searchProperties(query, {
      organizationId: organizationId || undefined,
      topK: options?.limit || 5,
      minScore: options?.minScore || 0.6,
    });

    const properties: PropertyContextInfo[] = [];
    for (const result of results) {
      const context = await loadPropertyContext(result.entityId);
      if (context) {
        properties.push(context);
      }
    }

    return properties;
  } catch (error) {
    console.warn('Semantic property search failed:', error);
    return [];
  }
}

/**
 * Combined semantic search for any entity type
 */
export async function semanticSearch(
  query: string,
  organizationId?: string | null,
  options?: { limit?: number; minScore?: number }
): Promise<{ contacts: ContactContextInfo[]; properties: PropertyContextInfo[] }> {
  if (!entitySearchService.isReady()) {
    return { contacts: [], properties: [] };
  }

  try {
    const results = await entitySearchService.search(query, {
      organizationId: organizationId || undefined,
      topK: options?.limit || 10,
      minScore: options?.minScore || 0.6,
    });

    const contacts: ContactContextInfo[] = [];
    const properties: PropertyContextInfo[] = [];

    for (const result of results) {
      if (result.type === 'contact') {
        const context = await loadContactContext(result.entityId);
        if (context) contacts.push(context);
      } else if (result.type === 'property') {
        const context = await loadPropertyContext(result.entityId);
        if (context) properties.push(context);
      }
    }

    return { contacts, properties };
  } catch (error) {
    console.warn('Semantic search failed:', error);
    return { contacts: [], properties: [] };
  }
}

// ============================================================================
// Full Context Builder
// ============================================================================

/**
 * Build comprehensive conversation context based on entities mentioned
 */
export async function buildConversationContext(options: {
  userId?: string;
  contactIds?: number[];
  propertyIds?: number[];
  mentionedNames?: string[];
  mentionedAddresses?: string[];
}): Promise<ConversationContextData> {
  const result: ConversationContextData = {
    contacts: [],
    properties: [],
    pendingTasks: [],
    upcomingReminders: [],
  };

  const organizationId = options.userId
    ? await getOrganizationIdForUserId(options.userId)
    : null;

  // Load explicit contact IDs
  if (options.contactIds?.length) {
    const contactPromises = options.contactIds.map((id) => loadContactContext(id));
    const contacts = await Promise.all(contactPromises);
    result.contacts.push(...contacts.filter(Boolean) as ContactContextInfo[]);
  }

  // Load contacts by mentioned names
  if (options.mentionedNames?.length) {
    for (const name of options.mentionedNames) {
      const contacts = await loadContactsByName(name, organizationId, { limit: 2 });
      for (const contact of contacts) {
        if (!result.contacts.some((c) => c.id === contact.id)) {
          result.contacts.push(contact);
        }
      }
    }
  }

  // Load explicit property IDs
  if (options.propertyIds?.length) {
    const propertyPromises = options.propertyIds.map((id) => loadPropertyContext(id));
    const properties = await Promise.all(propertyPromises);
    result.properties.push(...properties.filter(Boolean) as PropertyContextInfo[]);
  }

  // Load properties by mentioned addresses
  if (options.mentionedAddresses?.length) {
    for (const address of options.mentionedAddresses) {
      const parts = parseAddressString(address);
      if (parts.street) {
        const property = await loadPropertyByAddress(parts.street, parts.city, parts.state);
        if (property && !result.properties.some((p) => p.id === property.id)) {
          result.properties.push(property);
        }
      }
    }
  }

  // Load pending tasks for the user
  if (options.userId) {
    result.pendingTasks = await loadPendingTasks(options.userId, { limit: 5 });
    result.upcomingReminders = await loadUpcomingReminders(options.userId, { limit: 3 });
  }

  return result;
}

/**
 * Format conversation context as a prompt string
 */
export function formatContextAsPrompt(context: ConversationContextData): string {
  const sections: string[] = [];

  // Format contacts with activity history
  if (context.contacts.length > 0) {
    const contactLines: string[] = ['### Relevant Contacts'];
    for (const contact of context.contacts) {
      const details: string[] = [
        `**${contact.name}** (ID: ${contact.id})`,
      ];

      if (contact.phone) details.push(`  Phone: ${contact.phone}`);
      if (contact.email) details.push(`  Email: ${contact.email}`);
      if (contact.company) details.push(`  Company: ${contact.company}`);
      if (contact.type) details.push(`  Type: ${contact.type}`);

      // Activity summary
      const { activitySummary } = contact;
      if (activitySummary.totalCalls || activitySummary.totalEmails || activitySummary.totalSms) {
        details.push(
          `  Activity: ${activitySummary.totalCalls} calls, ${activitySummary.totalEmails} emails, ${activitySummary.totalSms} SMS`
        );
      }
      if (activitySummary.lastContactedAt) {
        details.push(`  Last contacted: ${formatRelativeTime(activitySummary.lastContactedAt)}`);
      }

      // Recent activity
      if (contact.recentActivity.length > 0) {
        details.push('  Recent activity:');
        for (const activity of contact.recentActivity.slice(0, 3)) {
          const activityLine = formatActivityLine(activity);
          details.push(`    - ${activityLine}`);
        }
      }

      contactLines.push(details.join('\n'));
    }
    sections.push(contactLines.join('\n\n'));
  }

  // Format properties with contacts
  if (context.properties.length > 0) {
    const propertyLines: string[] = ['### Relevant Properties'];
    for (const property of context.properties) {
      const details: string[] = [
        `**${property.address}** (ID: ${property.id})`,
      ];

      if (property.price) details.push(`  Price: $${property.price.toLocaleString()}`);
      if (property.status) details.push(`  Status: ${property.status}`);
      if (property.notes) details.push(`  Notes: ${property.notes}`);

      // Property contacts
      if (property.contacts.length > 0) {
        details.push('  Contacts:');
        for (const contact of property.contacts) {
          const roleStr = contact.role ? ` (${contact.role})` : '';
          const phoneStr = contact.phone ? ` - ${contact.phone}` : '';
          details.push(`    - ${contact.name}${roleStr}${phoneStr}`);
        }
      }

      propertyLines.push(details.join('\n'));
    }
    sections.push(propertyLines.join('\n\n'));
  }

  // Format pending tasks
  if (context.pendingTasks.length > 0) {
    const taskLines: string[] = ['### Pending Tasks'];
    for (const task of context.pendingTasks) {
      const dueStr = task.dueDate ? ` (due: ${formatRelativeTime(task.dueDate)})` : '';
      const priorityStr = task.priority !== 'normal' ? ` [${task.priority}]` : '';
      const propertyStr = task.propertyAddress ? ` - ${task.propertyAddress}` : '';
      taskLines.push(`- ${task.title}${priorityStr}${dueStr}${propertyStr}`);
    }
    sections.push(taskLines.join('\n'));
  }

  // Format upcoming reminders
  if (context.upcomingReminders.length > 0) {
    const reminderLines: string[] = ['### Upcoming Reminders'];
    for (const reminder of context.upcomingReminders) {
      reminderLines.push(`- ${reminder.title} (${formatRelativeTime(reminder.scheduledFor)})`);
    }
    sections.push(reminderLines.join('\n'));
  }

  if (sections.length === 0) {
    return '';
  }

  return `## Preloaded Context\n${sections.join('\n\n')}`;
}

// ============================================================================
// Entity Extraction from User Message
// ============================================================================

/**
 * Extract potential entity references from a user message
 */
export function extractEntityReferences(message: string): {
  names: string[];
  addresses: string[];
} {
  const names: string[] = [];
  const addresses: string[] = [];

  // Common name patterns: "the lawyer John", "Ed from", "call Mike", "contact Sarah"
  const namePatterns = [
    /(?:call|contact|email|text|speak with|talk to|the)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:at|on|from|near)/gi,
  ];

  for (const pattern of namePatterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const name = match[1].trim();
      if (name.length >= 2 && !isCommonWord(name)) {
        names.push(name);
      }
    }
  }

  // Address patterns: "123 Main St", "141 Throop Ave", etc.
  const addressPatterns = [
    /(\d+\s+[A-Za-z]+(?:\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Circle|Court|Drive|Lane|Boulevard|Avenue|Street|Road))?)/gi,
    /(?:at|on|property at|deal at|house at)\s+([^,\n]+(?:,\s*[A-Za-z]+(?:,?\s*[A-Z]{2})?)?)/gi,
  ];

  for (const pattern of addressPatterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const address = match[1].trim();
      if (address.length >= 5) {
        addresses.push(address);
      }
    }
  }

  return {
    names: [...new Set(names)],
    addresses: [...new Set(addresses)],
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
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

  const cityStateZip = [property.city, property.state, property.zip].filter(Boolean).join(', ');
  if (cityStateZip) parts.push(cityStateZip);

  return parts.join(', ') || `Property #${property.id}`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (Math.abs(diffMins) < 60) {
    if (diffMins < 0) return `${Math.abs(diffMins)} mins ago`;
    return `in ${diffMins} mins`;
  }

  if (Math.abs(diffHours) < 24) {
    if (diffHours < 0) return `${Math.abs(diffHours)} hours ago`;
    return `in ${diffHours} hours`;
  }

  if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
  return `in ${diffDays} days`;
}

function formatActivityLine(activity: {
  type: string;
  direction: string;
  summary?: string;
  callOutcome?: string;
  createdAt: Date;
}): string {
  const timeStr = formatRelativeTime(activity.createdAt);
  const dirStr = activity.direction !== 'internal' ? ` (${activity.direction})` : '';
  const summaryStr = activity.summary || activity.callOutcome || '';

  return `${activity.type}${dirStr} ${timeStr}${summaryStr ? ': ' + summaryStr : ''}`;
}

function parseAddressString(address: string): { street?: string; city?: string; state?: string } {
  const parts = address.split(',').map((p) => p.trim());

  if (parts.length >= 3) {
    const stateZipMatch = parts[2].match(/([A-Z]{2})/i);
    return {
      street: parts[0],
      city: parts[1],
      state: stateZipMatch?.[1]?.toUpperCase(),
    };
  }

  if (parts.length === 2) {
    const stateMatch = parts[1].match(/([A-Z]{2})/i);
    return {
      street: parts[0],
      city: stateMatch ? undefined : parts[1],
      state: stateMatch?.[1]?.toUpperCase(),
    };
  }

  return { street: parts[0] };
}

function isCommonWord(word: string): boolean {
  const common = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have',
    'call', 'email', 'text', 'send', 'deal', 'property', 'contact',
    'about', 'what', 'when', 'where', 'which', 'who', 'how',
  ]);
  return common.has(word.toLowerCase());
}

// Export singleton-style functions for easy access
export const contextLoader = {
  loadContactContext,
  loadContactActivity,
  loadPropertyContext,
  loadPropertyContacts,
  loadPendingTasks,
  loadUpcomingReminders,
  loadContactsByName,
  loadPropertyByAddress,
  buildConversationContext,
  formatContextAsPrompt,
  extractEntityReferences,
};

export default contextLoader;
