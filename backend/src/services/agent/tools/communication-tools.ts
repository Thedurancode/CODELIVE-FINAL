/**
 * Communication Tools
 *
 * Tools for sending emails, SMS, and managing communications.
 * All communications are logged to ContactActivity for unified tracking.
 */

import { z } from 'zod';
import twilio from 'twilio';
import { toolRegistry, success, failure, defineTool } from './registry';
import { emailClientFactory } from '../../EmailClientService';
import { supabaseStorageService } from '../../SupabaseStorageService';
import PropertyDocument from '../../../models/PropertyDocument';
import { Resend } from 'resend';
import { Contact, ContactActivity, MarketplaceUser, Organization, Property, PropertyContact } from '../../../models';
import { Op } from 'sequelize';
import sequelize from '../../../config/database';
import { supabaseAdmin } from '../../../config/supabase';
import { MarketDataService } from '../../MarketDataService';
import { propertyService } from '../../propertyService';
import { resolveCommunicationContext } from '../../../utils/organizationDefaults';
import {
  buildContactConfirmation,
  createSuggestionResponse,
  formatConfirmationAsToolResponse,
} from '../confirmationHelper';
import { loadContactActivity, loadContactContext, semanticSearchContacts } from '../contextLoader';
import { entitySearchService } from '../../EntitySearchService';
import { getDefaultAgentProfile, getVoiceSettings } from './voice-tools';
import { scheduledTaskService } from '../ScheduledTaskService';
import { calendarIntegrationService } from '../CalendarIntegrationService';

// Lazy import to avoid circular dependency
let _agentService: any = null;
function getAgentService() {
  if (!_agentService) {
    _agentService = require('../../agentService').agentService;
  }
  return _agentService;
}

// Initialize Resend for direct sending (when user email config not available)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Initialize Twilio for SMS
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

/**
 * Find contact by email address
 */
async function findContactByEmail(email: string): Promise<Contact | null> {
  return Contact.findOne({
    where: { email: { [Op.iLike]: email } },
  });
}

/**
 * Find contact by phone number
 */
async function findContactByPhone(phone: string): Promise<Contact | null> {
  // Normalize phone number (remove all non-digits except leading +)
  const normalized = phone.replace(/[^\d+]/g, '');
  return Contact.findOne({
    where: {
      [Op.or]: [
        { phone: normalized },
        { phone: phone },
        { phone: { [Op.like]: `%${normalized.slice(-10)}` } }, // Match last 10 digits
      ],
    },
  });
}

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i += 1) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function stringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / len;
}

function formatPropertyAddress(property: Property | null | undefined): string | null {
  if (!property) return null;
  const streetParts = [
    property.address?.houseNumber,
    property.address?.street,
  ].filter(Boolean).join(' ').trim();
  const cityStateZip = [
    property.city,
    property.state,
    property.zip,
  ].filter(Boolean).join(', ');

  const addressParts = [streetParts, cityStateZip].filter(Boolean);
  return addressParts.length > 0 ? addressParts.join(', ') : null;
}

async function findSimilarContactsByName(
  name: string,
  organizationId?: string | null,
  threshold = 0.65,
  limit = 3
): Promise<Array<{ contact: Contact; score: number; propertyAddress: string | null }>> {
  const normalizedQuery = normalizeForComparison(name);
  if (!normalizedQuery) return [];

  // Try semantic search first if available (handles "lawyer" -> "attorney" etc.)
  if (entitySearchService.isReady()) {
    try {
      const semanticResults = await entitySearchService.searchContacts(name, {
        organizationId: organizationId || undefined,
        topK: limit,
        minScore: 0.6,
      });

      if (semanticResults.length > 0) {
        const results: Array<{ contact: Contact; score: number; propertyAddress: string | null }> = [];

        for (const result of semanticResults) {
          const contact = await Contact.findByPk(result.entityId);
          if (!contact) continue;

          const assignment = await PropertyContact.findOne({
            where: { contactId: contact.id },
            include: [{ model: Property, as: 'property' }],
            order: [['createdAt', 'DESC']],
          });
          const propertyAddress = formatPropertyAddress(assignment?.property);

          results.push({
            contact,
            score: result.score,
            propertyAddress,
          });
        }

        if (results.length > 0) {
          return results;
        }
      }
    } catch (error) {
      console.warn('[findSimilarContactsByName] Semantic search failed, using string matching:', error);
    }
  }

  // Fall back to fuzzy string matching
  const where: Record<string, unknown> = {};
  if (organizationId) where.organizationId = organizationId;
  where.status = 'active';

  const contacts = await Contact.findAll({
    where,
    limit: 100,
    order: [['updatedAt', 'DESC']],
  });

  const scored: Array<{ contact: Contact; score: number; propertyAddress: string | null }> = [];

  for (const contact of contacts) {
    const normalizedContact = normalizeForComparison(contact.name || '');
    if (!normalizedContact) continue;
    const score = stringSimilarity(normalizedQuery, normalizedContact);
    if (score < threshold) continue;

    const assignment = await PropertyContact.findOne({
      where: { contactId: contact.id },
      include: [{ model: Property, as: 'property' }],
      order: [['createdAt', 'DESC']],
    });
    const propertyAddress = formatPropertyAddress(assignment?.property);

    scored.push({ contact, score, propertyAddress });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function normalizePhoneNumber(phone: string): string {
  let normalized = phone.replace(/[^\d+]/g, '');
  if (!normalized) return '';
  if (!normalized.startsWith('+')) {
    normalized = normalized.length === 10 ? `+1${normalized}` : `+${normalized}`;
  }
  return normalized;
}

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

function normalizeContactRole(role?: string): string | null {
  if (!role) return null;
  const normalized = role.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'lawyer') return 'attorney';
  if (normalized === 'owner') return 'seller';
  return normalized;
}

async function loadContactPropertySummaries(contactId: string): Promise<Array<{ id: number; address: string }>> {
  const assignments = await PropertyContact.findAll({
    where: { contactId },
    include: [{ model: Property, as: 'property' }],
    order: [['createdAt', 'DESC']],
    limit: 5,
  });

  return assignments
    .map((assignment: any) => {
      const property = assignment.property as Property | null;
      if (!property) return null;
      const address = `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim();
      return { id: property.id, address };
    })
    .filter(Boolean) as Array<{ id: number; address: string }>;
}

function parseAddressInput(input: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): { street?: string; city?: string; state?: string; zip?: string; fullAddress?: string } {
  if (!input.address) return {};

  let street = input.address.trim();
  let city = input.city?.trim();
  let state = input.state?.trim().toUpperCase();
  let zip = input.zip?.trim();

  const parts = input.address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    street = parts[0];
    const tail = parts.slice(1);

    if (!city && tail.length >= 1) {
      if (tail.length >= 2) {
        city = tail[0];
      } else {
        const tokens = tail[0].split(/\s+/).filter(Boolean);
        if (tokens.length >= 2) {
          const maybeStateZip = tokens.slice(-2).join(' ');
          const match = maybeStateZip.match(/([A-Za-z]{2})(?:\s+(\d{5}))?/);
          if (match) {
            state = state || match[1].toUpperCase();
            zip = zip || match[2];
            city = tokens.slice(0, tokens.length - (match[2] ? 2 : 1)).join(' ');
          } else {
            city = tail[0];
          }
        } else {
          city = tail[0];
        }
      }
    }

    if (!state && tail.length >= 2) {
      const stateZip = tail[1];
      const match = stateZip.match(/([A-Za-z]{2})(?:\s+(\d{5}))?/);
      if (match) {
        state = match[1].toUpperCase();
        zip = zip || match[2];
      }
    }
  }

  const addressParts = [street];
  if (city) addressParts.push(city);
  const stateZip = [state, zip].filter(Boolean).join(' ');
  if (stateZip) addressParts.push(stateZip);

  return {
    street,
    city,
    state,
    zip,
    fullAddress: addressParts.filter(Boolean).join(', '),
  };
}

async function getOrganizationIdForUser(userId?: string): Promise<string | null> {
  if (userId) {
    const user = await MarketplaceUser.findByPk(userId, { attributes: ['organizationId'] });
    if (user?.organizationId) return user.organizationId;
  }

  const organization = await Organization.findOne({
    where: { status: 'active' },
    order: [['createdAt', 'ASC']],
    attributes: ['id'],
  });

  return organization?.id || null;
}

async function ensurePropertyContactLink(propertyId: number, contactId: string): Promise<void> {
  const existing = await PropertyContact.findOne({
    where: { propertyId, contactId, role: 'seller' },
  });

  if (!existing) {
    await PropertyContact.create({
      propertyId,
      contactId,
      role: 'seller',
      isPrimary: false,
    });
  }
}

/**
 * Register all communication tools with the registry
 */
export function registerCommunicationTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // SEND EMAIL
    // =========================================================================
    defineTool({
      name: 'send_email',
      description: `Send an email to one or more recipients. Use this to:
- Contact buyers about deals
- Follow up with sellers
- Send deal information to hedge funds
- Notify contacts about property updates
- Send general communications`,
      category: 'communication',
      schema: z.object({
        to: z
          .union([z.string(), z.array(z.string())])
          .describe('Recipient email address(es)'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body content (plain text)'),
        html: z.string().optional().describe('Optional HTML version of the email body'),
        cc: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('CC recipient(s)'),
        bcc: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('BCC recipient(s)'),
        replyTo: z.string().optional().describe('Reply-to email address'),
        contactId: z.number().optional().describe('Contact ID to log this email to'),
        propertyId: z.number().optional().describe('Related property ID for tracking'),
        dealId: z.number().optional().describe('Related deal ID for tracking'),
      }),
      handler: async (input, context) => {
        try {
          // Validate email addresses
          const toAddresses = Array.isArray(input.to) ? input.to : [input.to];
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const contactForContext = input.contactId ? await Contact.findByPk(input.contactId) : null;
          const { userId: actorUserId, organizationId } = await resolveCommunicationContext({
            userId: context.userId,
            organizationId: contactForContext?.organizationId,
          });

          for (const email of toAddresses) {
            if (!emailRegex.test(email)) {
              return failure(`Invalid email address: ${email}`);
            }
          }

          let messageId: string | undefined;
          let fromAddress: string = process.env.RESEND_FROM_EMAIL || 'noreply@dispotree.com';

          // Try to use user's configured email first
          if (actorUserId) {
            try {
              const emailClient = await emailClientFactory.createForUser(actorUserId);
              if (emailClient && emailClient.canSend()) {
                const result = await emailClient.sendEmail({
                  to: toAddresses,
                  cc: input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : undefined,
                  bcc: input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : undefined,
                  subject: input.subject,
                  text: input.body,
                  html: input.html,
                  replyTo: input.replyTo,
                });
                messageId = result.id;
                fromAddress = emailClient.getAccountEmail() || fromAddress;
              }
            } catch (e) {
              // Fall through to Resend
              console.log('[Communication Tools] User email config not available, using Resend');
            }
          }

          // Fall back to Resend API if not sent yet
          if (!messageId) {
            if (!resend) {
              return failure(
                'Email sending not configured. Please set up your email account in Settings or configure RESEND_API_KEY.'
              );
            }

            const response = await resend.emails.send({
              from: fromAddress,
              to: toAddresses,
              cc: input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : undefined,
              bcc: input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : undefined,
              subject: input.subject,
              text: input.body,
              html: input.html,
              replyTo: input.replyTo,
            });

            if (response.error) {
              return failure(`Failed to send email: ${response.error.message}`);
            }
            messageId = response.data?.id;
          }

          // Log to ContactActivity for each recipient
          const ccAddresses = input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : [];
          const bccAddresses = input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : [];

          for (const toEmail of toAddresses) {
            // Find contact by provided ID or email
            let contact: Contact | null = null;
            if (input.contactId) {
              contact = contactForContext;
            } else {
              contact = await findContactByEmail(toEmail);
            }

            if (contact) {
              try {
                await ContactActivity.logEmail({
                  contactId: contact.id,
                  direction: 'outbound',
                  messageId,
                  from: fromAddress,
                  to: toAddresses,
                  cc: ccAddresses.length > 0 ? ccAddresses : undefined,
                  bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
                  subject: input.subject,
                  content: input.body,
                  userId: actorUserId || undefined,
                  organizationId: contact.organizationId || organizationId || undefined,
                  dealId: input.dealId,
                  propertyId: input.propertyId,
                });
              } catch (logError) {
                console.error('[Communication Tools] Failed to log email activity:', logError);
              }
            }
          }

          return success({
            sent: true,
            messageId,
            recipients: toAddresses,
            subject: input.subject,
            from: fromAddress,
            propertyId: input.propertyId,
            dealId: input.dealId,
            logged: true,
            message: `Email sent successfully to ${toAddresses.length} recipient(s) and logged to activity.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error sending email: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SEND BULK EMAIL
    // =========================================================================
    defineTool({
      name: 'send_bulk_email',
      description: `Send the same email to multiple recipients (batch send). Use for:
- Distributing deals to multiple buyers
- Mass notifications
- Newsletter-style communications`,
      category: 'communication',
      schema: z.object({
        recipients: z
          .array(
            z.object({
              email: z.string().describe('Recipient email'),
              name: z.string().optional().describe('Recipient name for personalization'),
            })
          )
          .describe('List of recipients'),
        subject: z.string().describe('Email subject (can use {{name}} for personalization)'),
        body: z.string().describe('Email body (can use {{name}} for personalization)'),
        html: z.string().optional().describe('Optional HTML body'),
      }),
      handler: async (input, context) => {
        try {
          if (!resend) {
            return failure('Bulk email not configured. Please set RESEND_API_KEY.');
          }

          const fromAddress = process.env.RESEND_FROM_EMAIL || 'noreply@dispotree.com';
          const results: Array<{ email: string; success: boolean; messageId?: string; error?: string }> = [];

          for (const recipient of input.recipients) {
            try {
              // Personalize content
              const personalizedSubject = input.subject.replace(/\{\{name\}\}/g, recipient.name || 'there');
              const personalizedBody = input.body.replace(/\{\{name\}\}/g, recipient.name || 'there');
              const personalizedHtml = input.html?.replace(/\{\{name\}\}/g, recipient.name || 'there');

              const response = await resend.emails.send({
                from: fromAddress,
                to: recipient.email,
                subject: personalizedSubject,
                text: personalizedBody,
                html: personalizedHtml,
              });

              if (response.error) {
                results.push({ email: recipient.email, success: false, error: response.error.message });
              } else {
                results.push({ email: recipient.email, success: true, messageId: response.data?.id });
              }
            } catch (e) {
              results.push({
                email: recipient.email,
                success: false,
                error: e instanceof Error ? e.message : 'Unknown error',
              });
            }
          }

          const successCount = results.filter((r) => r.success).length;
          const failureCount = results.filter((r) => !r.success).length;

          return success({
            sent: successCount,
            failed: failureCount,
            total: input.recipients.length,
            results,
            message: `Sent ${successCount}/${input.recipients.length} emails successfully.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error sending bulk email: ${errorMessage}`);
        }
      },
      cacheable: false,
      supportsProgress: true,
    }),

    // =========================================================================
    // GET EMAIL STATUS
    // =========================================================================
    defineTool({
      name: 'get_email_status',
      description: 'Check if email sending is configured and working.',
      category: 'communication',
      schema: z.object({}),
      handler: async (input, context) => {
        try {
          let userEmailConfigured = false;
          let userEmail: string | null = null;

          if (context.userId) {
            const status = await emailClientFactory.getConfigStatus(context.userId);
            userEmailConfigured = status.configured;
            userEmail = status.accountEmail;
          }

          return success({
            resendConfigured: !!resend,
            userEmailConfigured,
            userEmail,
            canSend: !!resend || userEmailConfigured,
            message: !!resend || userEmailConfigured
              ? 'Email sending is available.'
              : 'Email sending not configured. Set up your email in Settings or configure RESEND_API_KEY.',
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error checking email status: ${errorMessage}`);
        }
      },
      cacheable: true,
      cacheTTL: 5 * 60, // 5 minutes
    }),

    // =========================================================================
    // SEND SMS
    // =========================================================================
    defineTool({
      name: 'send_sms',
      description: `Send an SMS text message to a phone number. Use this to:
- Send quick updates to contacts
- Follow up with leads
- Send appointment reminders
- Notify about deal status changes`,
      category: 'communication',
      schema: z.object({
        to: z.string().describe('Recipient phone number (E.164 format preferred, e.g., +14155551234)'),
        message: z.string().describe('SMS message content (max 1600 characters)'),
        contactId: z.number().optional().describe('Contact ID to log this SMS to'),
        propertyId: z.number().optional().describe('Related property ID for tracking'),
        dealId: z.number().optional().describe('Related deal ID for tracking'),
      }),
      handler: async (input, context) => {
        try {
          if (!twilioClient) {
            return failure(
              'SMS not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_NUMBER.'
            );
          }

          const fromNumber = process.env.TWILIO_NUMBER;
          if (!fromNumber) {
            return failure('TWILIO_NUMBER not configured.');
          }

          const contactForContext = input.contactId ? await Contact.findByPk(input.contactId) : null;
          const { userId: actorUserId, organizationId } = await resolveCommunicationContext({
            userId: context.userId,
            organizationId: contactForContext?.organizationId,
          });

          // Normalize phone number
          let toNumber = input.to.replace(/[^\d+]/g, '');
          if (!toNumber.startsWith('+')) {
            // Assume US number if no country code
            toNumber = toNumber.length === 10 ? `+1${toNumber}` : `+${toNumber}`;
          }

          // Validate message length
          if (input.message.length > 1600) {
            return failure('SMS message too long. Maximum 1600 characters.');
          }

          // Send SMS via Twilio
          const result = await twilioClient.messages.create({
            to: toNumber,
            from: fromNumber,
            body: input.message,
          });

          // Find contact to log activity
          let contact: Contact | null = null;
          if (input.contactId) {
            contact = contactForContext;
          } else {
            contact = await findContactByPhone(toNumber);
          }

          // Log to ContactActivity
          if (contact) {
            try {
              await ContactActivity.logSms({
                contactId: contact.id,
                direction: 'outbound',
                smsSid: result.sid,
                from: fromNumber,
                to: toNumber,
                content: input.message,
                userId: actorUserId || undefined,
                organizationId: contact.organizationId || organizationId || undefined,
                dealId: input.dealId,
                propertyId: input.propertyId,
              });
            } catch (logError) {
              console.error('[Communication Tools] Failed to log SMS activity:', logError);
            }
          }

          return success({
            sent: true,
            messageSid: result.sid,
            to: toNumber,
            from: fromNumber,
            status: result.status,
            logged: !!contact,
            message: `SMS sent successfully to ${toNumber}${contact ? ' and logged to activity' : ''}.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error sending SMS: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // CALL PROPERTY OWNER (VOICE)
    // =========================================================================
    defineTool({
      name: 'call_property_owner',
      description: `Initiate an outbound AI voice call to a property contact. Use when a user asks to call the owner/seller/lawyer/broker for a specific address.`,
      category: 'communication',
      schema: z.object({
        address: z.string().optional().describe('Property street address (prefer full address with city/state/zip)'),
        city: z.string().optional().describe('City (if not included in address)'),
        state: z.string().optional().describe('State code (if not included in address)'),
        zip: z.string().optional().describe('ZIP code (if not included in address)'),
        propertyId: z.number().optional().describe('Property ID if already known'),
        fromNumber: z.string().optional().describe('Twilio phone number to call from'),
        agentProfile: z.enum(['sales', 'support', 'collections']).optional().describe('AI agent profile for the call'),
        contactRole: z.string().optional().describe('Target role (owner, seller, attorney, broker, agent, etc.)'),
        reason: z.string().optional().describe('Reason for the call (used to brief the AI agent)'),
        useSkipTrace: z.boolean().optional().default(true)
          .describe('Use skip trace if owner phone is not in the database'),
      }),
      handler: async (input, context) => {
        try {
          if (!twilioClient) {
            return failure(
              'Voice calling not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
            );
          }

          if (!input.address && !input.propertyId) {
            return failure('Provide an address or propertyId to call the owner.');
          }

          const fromNumber = normalizePhoneNumber(input.fromNumber || process.env.TWILIO_NUMBER || '');
          if (!fromNumber) {
            return failure('TWILIO_NUMBER not configured.');
          }

          const { userId: actorUserId, organizationId: fallbackOrganizationId } = await resolveCommunicationContext({
            userId: context.userId,
          });

          const parsedAddress = parseAddressInput({
            address: input.address,
            city: input.city,
            state: input.state,
            zip: input.zip,
          });

          const street = parsedAddress.street || input.address?.trim();
          const city = parsedAddress.city;
          const state = parsedAddress.state;
          const zip = parsedAddress.zip;
          const fullAddress = parsedAddress.fullAddress || input.address?.trim();
          const targetRole = normalizeContactRole(input.contactRole);
          const allowOwnerFallback = !targetRole || ['seller', 'owner'].includes(targetRole);

          let property: Property | null = null;
          if (input.propertyId) {
            property = await Property.findByPk(input.propertyId);
          } else if (street && city && state) {
            property = await propertyService.findByAddress(street, city, state, zip);
          }

          let contact: Contact | null = null;
          let contactSource: string | null = null;
          let ownerName: string | null = null;

          if (property) {
            const assignments = await PropertyContact.findAll({
              where: { propertyId: property.id },
              include: [{ model: Contact, as: 'contact' }],
              order: [['isPrimary', 'DESC'], ['createdAt', 'ASC']],
            });

            const candidates = assignments
              .map((assignment: any) => ({
                contact: assignment.contact as Contact | null,
                role: assignment.role as string | null,
                isPrimary: assignment.isPrimary as boolean,
              }))
              .filter((entry) => entry.contact && entry.contact.phone);

            const roleFiltered = targetRole
              ? candidates.filter((entry) => entry.role === targetRole)
              : candidates;

            const roleCandidates = roleFiltered.length > 0 ? roleFiltered : candidates;

            if (roleCandidates.length > 0) {
              roleCandidates.sort((a, b) => {
                const scoreA = (a.isPrimary ? 2 : 0) + (a.role === 'seller' ? 1 : 0);
                const scoreB = (b.isPrimary ? 2 : 0) + (b.role === 'seller' ? 1 : 0);
                return scoreB - scoreA;
              });
              contact = roleCandidates[0].contact;
              contactSource = targetRole ? `property_contact_${targetRole}` : 'property_contact';
            }
          }

          if (!contact && property && allowOwnerFallback) {
            const phoneCandidates = new Set<string>();
            const propertyData = property as any;

            if (Array.isArray(propertyData.ownerPhones)) {
              propertyData.ownerPhones.forEach((phone: string) => {
                if (phone) phoneCandidates.add(phone);
              });
            }
            if (propertyData.llcOwnerPhone) {
              phoneCandidates.add(propertyData.llcOwnerPhone);
            }

            ownerName = propertyData.ownerName || propertyData.llcOwnerName || null;

            const phoneCandidate = Array.from(phoneCandidates)[0];
            if (phoneCandidate) {
              contact = await findContactByPhone(phoneCandidate);
              if (contact && !contact.phone) {
                await contact.update({ phone: normalizePhoneNumber(phoneCandidate) });
              }
              if (!contact) {
                const organizationId = fallbackOrganizationId;
                if (!organizationId) {
                  return failure('No active organization found to create contact.');
                }
                contact = await Contact.create({
                  organizationId,
                  createdById: actorUserId || null,
                  type: 'seller',
                  name: ownerName || `Owner ${street || phoneCandidate}`,
                  phone: normalizePhoneNumber(phoneCandidate),
                  notes: fullAddress
                    ? `Auto-created from call request for ${fullAddress}`
                    : 'Auto-created from call request',
                  status: 'active',
                });
              }

              contactSource = 'property_owner_phone';
              if (property && contact) {
                await ensurePropertyContactLink(property.id, contact.id);
              }
            }
          }

          if (!contact && allowOwnerFallback && input.useSkipTrace !== false && fullAddress) {
            const service = MarketDataService.getInstance();
            const skipTrace = await service.getSkipTrace({
              address: fullAddress,
              city,
              state,
              zip,
            });

            const firstOwner = skipTrace?.owners?.[0];
            const phoneCandidate = firstOwner?.phones?.find((p: any) => p?.number)?.number;
            ownerName = ownerName || firstOwner?.name || null;

            if (phoneCandidate) {
              contact = await findContactByPhone(phoneCandidate);
              if (contact && !contact.phone) {
                await contact.update({ phone: normalizePhoneNumber(phoneCandidate) });
              }
              if (!contact) {
                const organizationId = fallbackOrganizationId;
                if (!organizationId) {
                  return failure('No active organization found to create contact.');
                }
                contact = await Contact.create({
                  organizationId,
                  createdById: actorUserId || null,
                  type: 'seller',
                  name: ownerName || `Owner ${street || phoneCandidate}`,
                  phone: normalizePhoneNumber(phoneCandidate),
                  notes: fullAddress
                    ? `Auto-created from skip trace for ${fullAddress}`
                    : 'Auto-created from skip trace',
                  status: 'active',
                });
              }

              contactSource = 'skip_trace';
              if (property && contact) {
                await ensurePropertyContactLink(property.id, contact.id);
              }
            }
          }

          if (!contact || !contact.phone) {
            if (targetRole && !allowOwnerFallback) {
              return failure(`No ${targetRole} phone found for this property.`);
            }
            return failure('No owner phone found to place a call. Provide a full address or enable skip trace.');
          }

          const toNumber = normalizePhoneNumber(contact.phone);
          if (!toNumber) {
            return failure('Owner phone number is invalid.');
          }

          const organizationId = contact.organizationId || fallbackOrganizationId;
          const agentProfile = input.agentProfile || 'sales';
          const metadata = {
            reason: input.reason,
            propertyAddress: fullAddress,
            contactRole: targetRole,
            contactSource,
          };
          Object.keys(metadata).forEach((key) => {
            if (metadata[key as keyof typeof metadata] == null) {
              delete metadata[key as keyof typeof metadata];
            }
          });

          const { data: callData, error: insertError } = await supabaseAdmin
            .from('calls')
            .insert({
              direction: 'outbound',
              from_number: fromNumber,
              to_number: toNumber,
              contact_id: contact.id,
              deal_id: property ? property.id : null,
              organization_id: organizationId,
              initiated_by: actorUserId || null,
              agent_profile: agentProfile,
              status: 'initiated',
              metadata,
            })
            .select()
            .single();

          if (insertError || !callData) {
            return failure('Failed to create call record.');
          }

          const callId = callData.id;
          const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';

          try {
            const call = await twilioClient.calls.create({
              to: toNumber,
              from: fromNumber,
              url: `${baseUrl}/voice/twilio/outbound?callId=${callId}`,
              statusCallback: `${baseUrl}/voice/twilio/status`,
              statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
              statusCallbackMethod: 'POST',
              record: true,
              recordingStatusCallback: `${baseUrl}/voice/twilio/recording`,
              recordingStatusCallbackMethod: 'POST',
              machineDetection: 'DetectMessageEnd',
              machineDetectionTimeout: 30,
            });

            await supabaseAdmin
              .from('calls')
              .update({
                call_sid: call.sid,
                status: 'ringing',
                updated_at: new Date().toISOString(),
              })
              .eq('id', callId);

            return success({
              callId,
              callSid: call.sid,
              to: toNumber,
              from: fromNumber,
              contact: {
                id: contact.id,
                name: contact.name,
                phone: contact.phone,
              },
              property: property
                ? {
                    id: property.id,
                    address: fullAddress
                      || `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim(),
                    city: property.city,
                    state: property.state,
                    zip: property.zip,
                  }
                : null,
              contactSource,
              message: `Call initiated to ${contact.name || 'owner'} at ${toNumber}.`,
            });
          } catch (callError) {
            await supabaseAdmin
              .from('calls')
              .update({
                status: 'failed',
                metadata: { error: (callError as Error).message },
                updated_at: new Date().toISOString(),
              })
              .eq('id', callId);

            return failure('Failed to initiate call.');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error placing call: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // CALL CONTACT
    // =========================================================================
    defineTool({
      name: 'call_contact',
      description: `Initiate an outbound AI voice call to any contact. Use when a user asks to call someone by:
- Contact ID: "call contact 123"
- Name: "call John Smith"
- First name + property: "call Ed at 141 Throop Ave"
- Scheduled: "call Ed tomorrow at 2pm" or "call John next Monday at 10am"
This is more flexible than call_property_owner as it doesn't require a property context.
Supports scheduling calls for future times - creates a calendar event and scheduled task.`,
      category: 'communication',
      schema: z.object({
        contactId: z.string().optional().describe('Contact ID if known'),
        name: z.string().optional().describe('Contact name to search (can be first name, last name, or full name)'),
        propertyAddress: z.string().optional().describe('Property address to disambiguate contact (e.g., "141 Throop Ave, Brooklyn, NY")'),
        city: z.string().optional().describe('City (if not included in propertyAddress)'),
        state: z.string().optional().describe('State (if not included in propertyAddress)'),
        zip: z.string().optional().describe('ZIP (if not included in propertyAddress)'),
        fromNumber: z.string().optional().describe('Twilio phone number to call from'),
        agentProfile: z.enum(['sales', 'support', 'collections']).optional().describe('AI agent profile for the call (defaults to user setting)'),
        reason: z.string().optional().describe('Reason for the call (used to brief the AI agent)'),
        scheduledFor: z.string().optional().describe('Schedule call for a future time (e.g., "tomorrow at 2pm", "next Monday at 10am"). Creates calendar event.'),
        addToCalendar: z.boolean().optional().default(true).describe('Add scheduled call to calendar (default: true)'),
      }),
      handler: async (input, context) => {
        try {
          if (!twilioClient) {
            return failure(
              'Voice calling not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
            );
          }

          if (!input.contactId && !input.name) {
            return failure('Provide either a contactId or a name to call.');
          }

          const fromNumber = normalizePhoneNumber(input.fromNumber || process.env.TWILIO_NUMBER || '');
          if (!fromNumber) {
            return failure('TWILIO_NUMBER not configured.');
          }

          const { userId: actorUserId, organizationId: fallbackOrganizationId } = await resolveCommunicationContext({
            userId: context.userId,
          });

          let contact: Contact | null = null;
          let contactSource: string = 'direct';
          let property: Property | null = null;

          // 1. Try direct contact ID lookup
          if (input.contactId) {
            contact = await Contact.findByPk(input.contactId);
            if (!contact) {
              return failure(`Contact not found with ID ${input.contactId}`);
            }
            contactSource = 'contact_id';
          }

          // 2. Search by name
          if (!contact && input.name) {
            const trimmedName = input.name.trim();
            const organizationId = await getOrganizationIdForUser(context.userId);

            // Parse property address if provided
            let parsedAddress: ReturnType<typeof parseAddressInput> | null = null;
            if (input.propertyAddress) {
              parsedAddress = parseAddressInput({
                address: input.propertyAddress,
                city: input.city,
                state: input.state,
                zip: input.zip,
              });

              // Try to find the property
              if (parsedAddress.street && parsedAddress.city && parsedAddress.state) {
                property = await propertyService.findByAddress(
                  parsedAddress.street,
                  parsedAddress.city,
                  parsedAddress.state,
                  parsedAddress.zip
                );
              }
            }

            // If we have a property, search contacts linked to that property first
            if (property) {
              const assignments = await PropertyContact.findAll({
                where: { propertyId: property.id },
                include: [{ model: Contact, as: 'contact' }],
              });

              // Filter by name match (case-insensitive, partial match)
              const normalizedSearch = normalizeForComparison(trimmedName);
              for (const assignment of assignments) {
                const assignedContact = (assignment as any).contact as Contact | null;
                if (!assignedContact || !assignedContact.phone) continue;

                const contactNameNormalized = normalizeForComparison(assignedContact.name || '');
                const firstNameNormalized = normalizeForComparison((assignedContact.name || '').split(' ')[0]);

                // Match on full name, first name, or fuzzy match
                if (
                  contactNameNormalized.includes(normalizedSearch) ||
                  normalizedSearch.includes(contactNameNormalized) ||
                  firstNameNormalized === normalizedSearch ||
                  stringSimilarity(normalizedSearch, contactNameNormalized) > 0.7 ||
                  stringSimilarity(normalizedSearch, firstNameNormalized) > 0.8
                ) {
                  contact = assignedContact;
                  contactSource = 'property_contact_name_match';
                  break;
                }
              }
            }

            // If no property match, do a general name search
            if (!contact) {
              const where: Record<string, unknown> = {
                status: 'active',
                phone: { [Op.ne]: null },
              };

              if (organizationId) {
                where.organizationId = organizationId;
              }

              // Try exact-ish match first (iLike)
              const directMatches = await Contact.findAll({
                where: {
                  ...where,
                  [Op.or]: [
                    { name: { [Op.iLike]: `${trimmedName}%` } }, // Starts with
                    { name: { [Op.iLike]: `% ${trimmedName}%` } }, // First name in middle/end
                    { name: { [Op.iLike]: `%${trimmedName}` } }, // Ends with
                  ],
                },
                limit: 10,
                order: [['updatedAt', 'DESC']],
              });

              if (directMatches.length === 1) {
                contact = directMatches[0];
                contactSource = 'name_search';
              } else if (directMatches.length > 1) {
                // Multiple matches - need disambiguation
                const matches = await Promise.all(
                  directMatches.slice(0, 5).map(async (c) => {
                    const properties = await loadContactPropertySummaries(c.id);
                    const recentActivity = await loadContactActivity(c.id, { limit: 1 });
                    const lastActivityStr = recentActivity.length > 0
                      ? `${recentActivity[0].type} ${formatTimeAgo(recentActivity[0].createdAt)}`
                      : null;

                    return {
                      contact: {
                        id: c.id,
                        name: c.name,
                        phone: c.phone,
                        email: c.email,
                        company: c.company,
                      },
                      properties,
                      lastActivity: lastActivityStr,
                    };
                  })
                );

                const candidateLines = matches.map((m, i) => {
                  const phoneStr = m.contact.phone ? ` (${m.contact.phone})` : '';
                  const propStr = m.properties.length > 0 ? ` - ${m.properties[0].address}` : '';
                  const actStr = m.lastActivity ? ` [last ${m.lastActivity}]` : '';
                  return `${i + 1}. **${m.contact.name}**${phoneStr}${propStr}${actStr}`;
                }).join('\n');

                const confirmMessage = `I found ${directMatches.length} contacts matching "${trimmedName}":\n\n${candidateLines}\n\nWhich one would you like to call? Say the number or provide a property address to help narrow it down.`;

                try {
                  const agentSvc = getAgentService();
                  agentSvc.setPendingConfirmation({
                    action: 'call contact',
                    entityType: 'contact',
                    candidateId: matches[0].contact.id,
                    candidateName: matches[0].contact.name,
                    candidates: matches.map((m) => ({
                      id: m.contact.id,
                      name: m.contact.name,
                      details: m.contact.phone || undefined,
                    })),
                    originalQuery: trimmedName,
                    toolName: 'call_contact',
                    toolArgs: input,
                    sessionId: context.sessionId,
                  });
                } catch (e) {
                  // Non-critical
                }

                return success({
                  needsDisambiguation: true,
                  matches,
                  confirmationMessage: confirmMessage,
                  originalQuery: trimmedName,
                });
              } else {
                // No direct matches - try fuzzy search
                const similar = await findSimilarContactsByName(trimmedName, organizationId, 0.6, 5);
                const withPhone = similar.filter((s) => s.contact.phone);

                if (withPhone.length === 1) {
                  contact = withPhone[0].contact;
                  contactSource = 'fuzzy_name_match';
                } else if (withPhone.length > 1) {
                  const candidateLines = withPhone.map((m, i) => {
                    const phoneStr = m.contact.phone ? ` (${m.contact.phone})` : '';
                    const propStr = m.propertyAddress ? ` - ${m.propertyAddress}` : '';
                    return `${i + 1}. **${m.contact.name}**${phoneStr}${propStr}`;
                  }).join('\n');

                  const confirmMessage = `I found similar contacts to "${trimmedName}":\n\n${candidateLines}\n\nWhich one would you like to call?`;

                  try {
                    const agentSvc = getAgentService();
                    agentSvc.setPendingConfirmation({
                      action: 'call contact',
                      entityType: 'contact',
                      candidateId: withPhone[0].contact.id,
                      candidateName: withPhone[0].contact.name,
                      candidates: withPhone.map((m) => ({
                        id: m.contact.id,
                        name: m.contact.name,
                        details: m.contact.phone || undefined,
                      })),
                      originalQuery: trimmedName,
                      toolName: 'call_contact',
                      toolArgs: input,
                      sessionId: context.sessionId,
                    });
                  } catch (e) {
                    // Non-critical
                  }

                  return success({
                    needsDisambiguation: true,
                    matches: withPhone.map((m) => ({
                      contact: {
                        id: m.contact.id,
                        name: m.contact.name,
                        phone: m.contact.phone,
                        email: m.contact.email,
                      },
                      propertyAddress: m.propertyAddress,
                      similarityScore: m.score,
                    })),
                    confirmationMessage: confirmMessage,
                    originalQuery: trimmedName,
                  });
                } else {
                  return failure(`No contacts found matching "${trimmedName}" with a phone number on file.`);
                }
              }
            }
          }

          if (!contact) {
            return failure('Could not find a matching contact.');
          }

          if (!contact.phone) {
            return failure(`Contact "${contact.name}" does not have a phone number on file.`);
          }

          const toNumber = normalizePhoneNumber(contact.phone);
          if (!toNumber) {
            return failure(`Contact "${contact.name}" has an invalid phone number.`);
          }

          const organizationId = contact.organizationId || fallbackOrganizationId;

          // Get agent profile - use input or default from settings
          const agentProfile = input.agentProfile || await getDefaultAgentProfile();
          const voiceSettings = await getVoiceSettings();

          const metadata: Record<string, unknown> = {
            reason: input.reason,
            contactSource,
          };
          if (property) {
            metadata.propertyId = property.id;
            metadata.propertyAddress = input.propertyAddress;
          }
          Object.keys(metadata).forEach((key) => {
            if (metadata[key] == null) {
              delete metadata[key];
            }
          });

          // Handle scheduled calls
          if (input.scheduledFor) {
            const scheduledTime = scheduledTaskService.parseNaturalTime(input.scheduledFor);
            if (!scheduledTime) {
              return failure(
                `Could not understand the time "${input.scheduledFor}". Try something like "tomorrow at 2pm", "next Monday at 10am", or "in 2 hours".`
              );
            }

            // Check if time is in the past
            if (scheduledTime <= new Date()) {
              return failure('Scheduled time must be in the future. Please specify a future time.');
            }

            // User authentication required for scheduling
            if (!context.userId) {
              return failure('User authentication required to schedule calls.');
            }

            // Create scheduled task for the call
            const task = await scheduledTaskService.createTask({
              userId: context.userId,
              sessionId: context.sessionId,
              type: 'action',
              title: `Call ${contact.name}${input.reason ? `: ${input.reason}` : ''}`,
              message: `Scheduled call to ${contact.name} at ${toNumber}`,
              scheduledFor: scheduledTime,
              actionType: 'call_contact',
              actionParams: {
                contactId: contact.id,
                propertyAddress: input.propertyAddress,
                agentProfile,
                reason: input.reason,
                fromNumber: input.fromNumber,
              },
              metadata: {
                contactName: contact.name,
                contactPhone: toNumber,
                propertyId: property?.id,
              },
            });

            // Add to calendar if enabled
            let calendarEvent: any = null;
            if (input.addToCalendar !== false && context.userId) {
              try {
                const isCalendarConnected = await calendarIntegrationService.isConnected(context.userId);
                if (isCalendarConnected) {
                  const callDuration = voiceSettings.defaultCallDuration || 15;
                  const endTime = new Date(scheduledTime.getTime() + callDuration * 60000);

                  calendarEvent = await calendarIntegrationService.createEvent(context.userId, {
                    title: `Call: ${contact.name}${property ? ` (${input.propertyAddress || property.city})` : ''}`,
                    description: [
                      `Scheduled call with ${contact.name}`,
                      `Phone: ${toNumber}`,
                      input.reason ? `Reason: ${input.reason}` : '',
                      `Agent Profile: ${agentProfile}`,
                      property ? `Property: ${input.propertyAddress || `${property.city}, ${property.state}`}` : '',
                    ].filter(Boolean).join('\n'),
                    startTime: scheduledTime,
                    endTime,
                    reminders: [
                      { method: 'popup', minutes: 5 },
                      { method: 'popup', minutes: 15 },
                    ],
                    propertyId: property?.id,
                  });
                }
              } catch (calError) {
                // Calendar is optional, don't fail the whole operation
                console.warn('[call_contact] Failed to create calendar event:', calError);
              }
            }

            return success({
              scheduled: true,
              taskId: task.id,
              scheduledFor: scheduledTime.toISOString(),
              formattedTime: scheduledTime.toLocaleString(),
              contact: {
                id: contact.id,
                name: contact.name,
                phone: toNumber,
              },
              property: property
                ? {
                    id: property.id,
                    address: input.propertyAddress || `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim(),
                  }
                : null,
              agentProfile,
              calendarEvent: calendarEvent
                ? {
                    id: calendarEvent.id,
                    link: calendarEvent.htmlLink,
                  }
                : null,
              message: `Call to ${contact.name} scheduled for ${scheduledTime.toLocaleString()}.${calendarEvent ? ' Added to calendar.' : ''}`,
            });
          }

          const { data: callData, error: insertError } = await supabaseAdmin
            .from('calls')
            .insert({
              direction: 'outbound',
              from_number: fromNumber,
              to_number: toNumber,
              contact_id: contact.id,
              deal_id: property ? property.id : null,
              organization_id: organizationId,
              initiated_by: actorUserId || null,
              agent_profile: agentProfile,
              status: 'initiated',
              metadata,
            })
            .select()
            .single();

          if (insertError || !callData) {
            return failure('Failed to create call record.');
          }

          const callId = callData.id;
          const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';

          try {
            const call = await twilioClient.calls.create({
              to: toNumber,
              from: fromNumber,
              url: `${baseUrl}/voice/twilio/outbound?callId=${callId}`,
              statusCallback: `${baseUrl}/voice/twilio/status`,
              statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
              statusCallbackMethod: 'POST',
              record: true,
              recordingStatusCallback: `${baseUrl}/voice/twilio/recording`,
              recordingStatusCallbackMethod: 'POST',
              machineDetection: 'DetectMessageEnd',
              machineDetectionTimeout: 30,
            });

            await supabaseAdmin
              .from('calls')
              .update({
                call_sid: call.sid,
                status: 'ringing',
                updated_at: new Date().toISOString(),
              })
              .eq('id', callId);

            return success({
              callId,
              callSid: call.sid,
              to: toNumber,
              from: fromNumber,
              contact: {
                id: contact.id,
                name: contact.name,
                phone: contact.phone,
              },
              property: property
                ? {
                    id: property.id,
                    address: input.propertyAddress || `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim(),
                  }
                : null,
              contactSource,
              message: `Call initiated to ${contact.name} at ${toNumber}.`,
            });
          } catch (callError) {
            await supabaseAdmin
              .from('calls')
              .update({
                status: 'failed',
                metadata: { error: (callError as Error).message },
                updated_at: new Date().toISOString(),
              })
              .eq('id', callId);

            return failure(`Failed to initiate call: ${(callError as Error).message}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error placing call: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // CHECK INBOX
    // =========================================================================
    defineTool({
      name: 'check_inbox',
      description: `Check the email inbox for recent messages. Shows unread emails and recent communications.`,
      category: 'communication',
      schema: z.object({
        folder: z.enum(['inbox', 'sent', 'drafts', 'trash', 'archive']).optional().default('inbox')
          .describe('Email folder to check'),
        limit: z.number().optional().default(10).describe('Maximum number of emails to return'),
        unreadOnly: z.boolean().optional().default(false).describe('Only show unread emails'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required to check inbox.');
          }

          const emailClient = await emailClientFactory.createForUser(context.userId);
          if (!emailClient) {
            return failure('Email not configured. Please set up your email account in Settings.');
          }

          const emails = await emailClient.getEmails(input.folder, {
            limit: input.limit,
            status: input.unreadOnly ? 'unread' : undefined,
          });

          const unreadCounts = await emailClient.getUnreadCounts();

          return success({
            folder: input.folder,
            emails: emails.data.map((email: any) => ({
              id: email.id,
              from: email.from?.email || 'Unknown',
              fromName: email.from?.name,
              subject: email.subject,
              snippet: email.snippet,
              status: email.status,
              starred: email.starred,
              hasAttachments: email.hasAttachments,
              receivedAt: email.receivedAt,
            })),
            unreadCounts,
            total: emails.pagination.total,
            message: `Found ${emails.data.length} emails in ${input.folder}. ${unreadCounts.inbox || 0} unread in inbox.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error checking inbox: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // READ EMAIL
    // =========================================================================
    defineTool({
      name: 'read_email',
      description: `Read the full content of a specific email by ID.`,
      category: 'communication',
      schema: z.object({
        emailId: z.number().describe('Email ID to read'),
        markAsRead: z.boolean().optional().default(true).describe('Mark the email as read'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required to read emails.');
          }

          const emailClient = await emailClientFactory.createForUser(context.userId);
          if (!emailClient) {
            return failure('Email not configured. Please set up your email account in Settings.');
          }

          const email = await emailClient.getEmail(input.emailId);
          if (!email) {
            return failure(`Email not found with ID ${input.emailId}`);
          }

          if (input.markAsRead && email.status === 'unread') {
            await emailClient.markAsRead(input.emailId);
          }

          return success({
            id: email.id,
            from: email.from,
            to: email.to,
            cc: email.cc,
            subject: email.subject,
            body: email.bodyText,
            htmlBody: email.bodyHtml,
            attachments: email.attachments,
            hasAttachments: email.hasAttachments,
            status: email.status,
            starred: email.starred,
            folder: email.folder,
            receivedAt: email.receivedAt,
            sentAt: email.sentAt,
            inReplyTo: email.inReplyTo,
            threadId: email.threadId,
            message: `Email from ${email.from?.name || email.from?.email} - "${email.subject}"`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error reading email: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SAVE DRAFT
    // =========================================================================
    defineTool({
      name: 'save_draft',
      description: `Save an email as a draft for later editing or sending.`,
      category: 'communication',
      schema: z.object({
        to: z.array(z.string()).describe('Recipient email addresses'),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body (plain text)'),
        html: z.string().optional().describe('HTML version of the body'),
        cc: z.array(z.string()).optional().describe('CC recipients'),
        draftId: z.number().optional().describe('Existing draft ID to update'),
        inReplyTo: z.string().optional().describe('Message ID if this is a reply'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required to save drafts.');
          }

          const emailClient = await emailClientFactory.createForUser(context.userId);
          if (!emailClient) {
            return failure('Email not configured. Please set up your email account in Settings.');
          }

          const draft = await emailClient.saveDraft({
            id: input.draftId,
            to: input.to,
            cc: input.cc,
            subject: input.subject,
            bodyText: input.body,
            bodyHtml: input.html,
            inReplyTo: input.inReplyTo,
          });

          return success({
            draftId: draft.id,
            to: input.to,
            subject: input.subject,
            message: `Draft saved successfully. ID: ${draft.id}`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error saving draft: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // LIST PROPERTY DOCUMENTS
    // =========================================================================
    defineTool({
      name: 'list_property_documents',
      description: `List documents attached to a property. Use this to find contracts, disclosures, or other documents to attach to emails.`,
      category: 'communication',
      schema: z.object({
        propertyId: z.number().describe('Property ID to list documents for'),
        documentType: z.enum(['contract', 'photo', 'inspection', 'appraisal', 'disclosure', 'title', 'other']).optional()
          .describe('Filter by document type'),
      }),
      handler: async (input) => {
        try {
          const where: Record<string, unknown> = { propertyId: input.propertyId, status: 'ready' };
          if (input.documentType) {
            where.documentType = input.documentType;
          }

          const documents = await PropertyDocument.findAll({
            where,
            order: [['createdAt', 'DESC']],
          });

          return success({
            propertyId: input.propertyId,
            documents: documents.map((doc: PropertyDocument) => ({
              id: doc.id,
              fileName: doc.originalName,
              documentType: doc.documentType,
              mimeType: doc.mimeType,
              fileSize: doc.fileSize,
              uploadedAt: doc.createdAt,
            })),
            total: documents.length,
            message: `Found ${documents.length} documents for property ${input.propertyId}`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error listing documents: ${errorMessage}`);
        }
      },
      cacheable: true,
      cacheTTL: 60,
    }),

    // =========================================================================
    // DRAFT EMAIL WITH ATTACHMENTS
    // =========================================================================
    defineTool({
      name: 'draft_email_with_attachments',
      description: `Draft an email with document attachments from properties. Use this to prepare emails with contracts, disclosures, or other property documents attached.`,
      category: 'communication',
      schema: z.object({
        to: z.array(z.string()).describe('Recipient email addresses'),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body (plain text)'),
        html: z.string().optional().describe('HTML version of the body'),
        cc: z.array(z.string()).optional().describe('CC recipients'),
        documentIds: z.array(z.number()).describe('Property document IDs to attach'),
        sendImmediately: z.boolean().optional().default(false)
          .describe('Send immediately instead of saving as draft'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          // Fetch the documents
          const documents = await PropertyDocument.findAll({
            where: { id: { [Op.in]: input.documentIds }, status: 'ready' },
          });

          if (documents.length === 0) {
            return failure('No valid documents found with the provided IDs.');
          }

          // Download document contents
          const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
          const attachmentErrors: string[] = [];

          for (const doc of documents) {
            try {
              const downloadResult = await supabaseStorageService.downloadDocument(doc.storageKey);
              if (downloadResult.success && downloadResult.data) {
                // Convert Blob to Buffer
                const arrayBuffer = await downloadResult.data.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                attachments.push({
                  filename: doc.originalName,
                  content: buffer,
                  contentType: doc.mimeType,
                });
              } else {
                attachmentErrors.push(`Failed to download ${doc.originalName}: ${downloadResult.error}`);
              }
            } catch (e) {
              attachmentErrors.push(`Error downloading ${doc.originalName}: ${e instanceof Error ? e.message : 'Unknown'}`);
            }
          }

          if (attachments.length === 0) {
            return failure(`Could not download any documents. Errors: ${attachmentErrors.join('; ')}`);
          }

          if (input.sendImmediately) {
            // Send the email with attachments
            const emailClient = await emailClientFactory.createForUser(context.userId);

            if (emailClient && emailClient.canSend()) {
              const result = await emailClient.sendEmail({
                to: input.to,
                cc: input.cc,
                subject: input.subject,
                text: input.body,
                html: input.html,
                attachments: attachments.map(att => ({
                  filename: att.filename,
                  content: att.content,
                  contentType: att.contentType,
                })),
              });

              return success({
                sent: true,
                messageId: result.id,
                to: input.to,
                subject: input.subject,
                attachments: attachments.map(a => a.filename),
                errors: attachmentErrors.length > 0 ? attachmentErrors : undefined,
                message: `Email sent to ${input.to.join(', ')} with ${attachments.length} attachment(s).`,
              });
            } else if (resend) {
              // Fallback to Resend
              const fromAddress = process.env.RESEND_FROM_EMAIL || 'admin@dispotree.com';
              const response = await resend.emails.send({
                from: fromAddress,
                to: input.to,
                cc: input.cc,
                subject: input.subject,
                text: input.body,
                html: input.html,
                attachments: attachments.map(att => ({
                  filename: att.filename,
                  content: att.content,
                })),
              });

              if (response.error) {
                return failure(`Failed to send: ${response.error.message}`);
              }

              return success({
                sent: true,
                messageId: response.data?.id,
                to: input.to,
                subject: input.subject,
                attachments: attachments.map(a => a.filename),
                errors: attachmentErrors.length > 0 ? attachmentErrors : undefined,
                message: `Email sent from ${fromAddress} to ${input.to.join(', ')} with ${attachments.length} attachment(s).`,
              });
            } else {
              return failure('Email sending not configured.');
            }
          } else {
            // Save as draft (note: draft attachments are stored separately)
            // For now, we'll return the draft info without actually saving attachments
            // The user can then send from the drafts folder
            return success({
              drafted: true,
              to: input.to,
              subject: input.subject,
              body: input.body,
              attachments: attachments.map(a => ({ filename: a.filename, size: a.content.length })),
              errors: attachmentErrors.length > 0 ? attachmentErrors : undefined,
              message: `Draft prepared with ${attachments.length} attachment(s). Ready to send.`,
              note: 'Use send_email or set sendImmediately=true to send this email with attachments.',
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error drafting email: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // EMAIL PROPERTY TEAM
    // =========================================================================
    defineTool({
      name: 'email_property_team',
      description: `Send an email to all team members/contacts associated with a property, optionally including all documents.
Use when user says things like:
- "Email everyone on 141 Throop Ave"
- "Send all documents on the 555 Main St deal to the team"
- "Email the property team with all contracts"
Automatically finds all contacts linked to the property and attaches requested documents.`,
      category: 'communication',
      schema: z.object({
        propertyAddress: z.string().optional().describe('Property address to find (e.g., "141 Throop Ave, Brooklyn, NY")'),
        propertyId: z.number().optional().describe('Property ID if known'),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body'),
        includeDocuments: z.boolean().optional().default(true).describe('Attach all property documents'),
        documentTypes: z.array(z.enum(['contract', 'photo', 'inspection', 'appraisal', 'disclosure', 'title', 'other']))
          .optional().describe('Filter document types to attach (default: all)'),
        roles: z.array(z.enum(['agent', 'broker', 'seller', 'wholesaler', 'attorney', 're_agent', 'buyer', 'other']))
          .optional().describe('Filter contacts by role (default: all roles)'),
        excludeRoles: z.array(z.enum(['agent', 'broker', 'seller', 'wholesaler', 'attorney', 're_agent', 'buyer', 'other']))
          .optional().describe('Exclude contacts with these roles'),
        cc: z.array(z.string()).optional().describe('Additional CC recipients'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          // Find the property
          let property: Property | null = null;

          if (input.propertyId) {
            property = await Property.findByPk(input.propertyId);
          } else if (input.propertyAddress) {
            const parsedAddress = parseAddressInput({ address: input.propertyAddress });
            if (parsedAddress.street && parsedAddress.city && parsedAddress.state) {
              property = await propertyService.findByAddress(
                parsedAddress.street,
                parsedAddress.city,
                parsedAddress.state,
                parsedAddress.zip
              );
            }

            // Fallback: search by partial address
            if (!property) {
              const searchResults = await Property.findAll({
                where: {
                  [Op.or]: [
                    { 'address.street': { [Op.iLike]: `%${input.propertyAddress}%` } },
                    { city: { [Op.iLike]: `%${input.propertyAddress}%` } },
                  ],
                },
                limit: 5,
              });

              if (searchResults.length === 1) {
                property = searchResults[0];
              } else if (searchResults.length > 1) {
                return success({
                  needsDisambiguation: true,
                  properties: searchResults.map((p: Property) => ({
                    id: p.id,
                    address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city || ''}, ${p.state || ''} ${p.zip || ''}`.trim(),
                    status: p.status,
                  })),
                  message: `Found ${searchResults.length} properties matching "${input.propertyAddress}". Please specify which one.`,
                });
              }
            }
          }

          if (!property) {
            return failure(`Property not found. Please provide a valid property address or ID.`);
          }

          const propertyAddress = `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim();

          // Find all contacts for this property
          const contactWhere: Record<string, unknown> = { propertyId: property.id };
          if (input.roles && input.roles.length > 0) {
            contactWhere.role = { [Op.in]: input.roles };
          }
          if (input.excludeRoles && input.excludeRoles.length > 0) {
            contactWhere.role = { ...((contactWhere.role as any) || {}), [Op.notIn]: input.excludeRoles };
          }

          const propertyContacts = await PropertyContact.findAll({
            where: contactWhere,
            include: [{ model: Contact, as: 'contact' }],
          });

          // Filter to contacts with email addresses
          const contactsWithEmail = propertyContacts
            .map((pc: any) => ({ contact: pc.contact as Contact, role: pc.role }))
            .filter((c) => c.contact && c.contact.email);

          if (contactsWithEmail.length === 0) {
            return failure(`No contacts with email addresses found for property ${propertyAddress}.`);
          }

          const recipientEmails = contactsWithEmail.map((c) => c.contact.email!);
          const recipientDetails = contactsWithEmail.map((c) => ({
            name: c.contact.name,
            email: c.contact.email,
            role: c.role,
          }));

          // Get documents if requested
          let attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
          let documentList: Array<{ id: number; fileName: string; type: string }> = [];
          const attachmentErrors: string[] = [];

          if (input.includeDocuments !== false) {
            const docWhere: Record<string, unknown> = { propertyId: property.id, status: 'ready' };
            if (input.documentTypes && input.documentTypes.length > 0) {
              docWhere.documentType = { [Op.in]: input.documentTypes };
            }

            const documents = await PropertyDocument.findAll({ where: docWhere });

            documentList = documents.map((doc: PropertyDocument) => ({
              id: doc.id,
              fileName: doc.originalName,
              type: doc.documentType,
            }));

            // Download and prepare attachments
            for (const doc of documents) {
              try {
                const downloadResult = await supabaseStorageService.downloadDocument(doc.storageKey);
                if (downloadResult.success && downloadResult.data) {
                  const arrayBuffer = await downloadResult.data.arrayBuffer();
                  const buffer = Buffer.from(arrayBuffer);
                  attachments.push({
                    filename: doc.originalName,
                    content: buffer,
                    contentType: doc.mimeType,
                  });
                } else {
                  attachmentErrors.push(`Failed to download ${doc.originalName}`);
                }
              } catch (e) {
                attachmentErrors.push(`Error with ${doc.originalName}: ${e instanceof Error ? e.message : 'Unknown'}`);
              }
            }
          }

          // Send the email
          const { userId: actorUserId, organizationId } = await resolveCommunicationContext({
            userId: context.userId,
          });

          const emailClient = await emailClientFactory.createForUser(context.userId);
          let fromAddress = '';
          let messageId = '';

          if (emailClient) {
            const userEmail = await MarketplaceUser.findByPk(context.userId);
            fromAddress = userEmail?.email || 'noreply@dispotree.com';

            const sendResult = await emailClient.sendEmail({
              to: recipientEmails,
              cc: input.cc,
              subject: input.subject,
              text: input.body,
              html: input.body.replace(/\n/g, '<br>'),
              attachments: attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType,
              })),
            });

            messageId = sendResult.messageId || `msg-${Date.now()}`;
          } else if (resend) {
            fromAddress = 'Dispotree <noreply@dispotree.com>';

            const sendResult = await resend.emails.send({
              from: fromAddress,
              to: recipientEmails,
              cc: input.cc,
              subject: input.subject,
              text: input.body,
              html: input.body.replace(/\n/g, '<br>'),
              attachments: attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
              })),
            });

            messageId = sendResult.data?.id || `resend-${Date.now()}`;
          } else {
            return failure('Email sending not configured.');
          }

          // Log activity for each contact
          for (const { contact } of contactsWithEmail) {
            try {
              await ContactActivity.logEmail({
                contactId: contact.id as any,
                direction: 'outbound',
                messageId,
                from: fromAddress,
                to: recipientEmails,
                subject: input.subject,
                content: input.body,
                userId: actorUserId || undefined,
                organizationId: organizationId || undefined,
                propertyId: property.id,
              });
            } catch (logError) {
              // Non-critical
              console.warn('[email_property_team] Failed to log activity:', logError);
            }
          }

          return success({
            sent: true,
            messageId,
            property: {
              id: property.id,
              address: propertyAddress,
            },
            recipients: recipientDetails,
            recipientCount: recipientEmails.length,
            attachments: documentList,
            attachmentCount: attachments.length,
            errors: attachmentErrors.length > 0 ? attachmentErrors : undefined,
            message: `Email sent to ${recipientEmails.length} team member(s) on ${propertyAddress}${attachments.length > 0 ? ` with ${attachments.length} document(s) attached` : ''}.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error sending team email: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SEARCH EMAILS
    // =========================================================================
    defineTool({
      name: 'search_emails',
      description: `Search through emails by keyword. Searches subject and body content.`,
      category: 'communication',
      schema: z.object({
        query: z.string().describe('Search query (searches subject and body)'),
        folder: z.enum(['inbox', 'sent', 'drafts', 'trash', 'archive']).optional()
          .describe('Limit search to specific folder'),
        limit: z.number().optional().default(20).describe('Maximum results to return'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required to search emails.');
          }

          const emailClient = await emailClientFactory.createForUser(context.userId);
          if (!emailClient) {
            return failure('Email not configured. Please set up your email account in Settings.');
          }

          const emails = await emailClient.searchEmails(input.query, {
            folder: input.folder,
            limit: input.limit,
          });

          return success({
            query: input.query,
            results: emails.map((email: any) => ({
              id: email.id,
              from: email.from?.email,
              fromName: email.from?.name,
              subject: email.subject,
              snippet: email.snippet,
              folder: email.folder,
              receivedAt: email.receivedAt,
            })),
            total: emails.length,
            message: `Found ${emails.length} emails matching "${input.query}"`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error searching emails: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // REPLY TO EMAIL
    // =========================================================================
    defineTool({
      name: 'reply_to_email',
      description: `Reply to an existing email. Automatically includes threading headers.`,
      category: 'communication',
      schema: z.object({
        emailId: z.number().describe('ID of the email to reply to'),
        body: z.string().describe('Reply message body'),
        html: z.string().optional().describe('HTML version of the reply'),
        replyAll: z.boolean().optional().default(false).describe('Reply to all recipients'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required to reply to emails.');
          }

          const emailClient = await emailClientFactory.createForUser(context.userId);
          if (!emailClient) {
            return failure('Email not configured. Please set up your email account in Settings.');
          }

          // Get the original email
          const originalEmail = await emailClient.getEmail(input.emailId);
          if (!originalEmail) {
            return failure(`Email not found with ID ${input.emailId}`);
          }

          // Build recipients
          const toAddresses = [originalEmail.from?.email].filter(Boolean) as string[];
          let ccAddresses: string[] = [];

          if (input.replyAll) {
            // Add original To recipients (except ourselves) to CC
            const ourEmail = emailClient.getAccountEmail();
            const originalTo = originalEmail.to?.map((t: any) => t.email).filter((e: string) => e !== ourEmail) || [];
            const originalCc = originalEmail.cc?.map((c: any) => c.email).filter((e: string) => e !== ourEmail) || [];
            ccAddresses = [...originalTo, ...originalCc];
          }

          // Build subject with Re: prefix
          const subject = originalEmail.subject?.startsWith('Re:')
            ? originalEmail.subject
            : `Re: ${originalEmail.subject}`;

          // Build references for threading
          const references = originalEmail.references || [];
          if (originalEmail.messageId && !references.includes(originalEmail.messageId)) {
            references.push(originalEmail.messageId);
          }

          // Send the reply
          const result = await emailClient.sendEmail({
            to: toAddresses,
            cc: ccAddresses.length > 0 ? ccAddresses : undefined,
            subject,
            text: input.body,
            html: input.html,
            inReplyTo: originalEmail.messageId,
            references,
          });

          return success({
            sent: true,
            messageId: result.id,
            to: toAddresses,
            cc: ccAddresses,
            subject,
            inReplyTo: originalEmail.messageId,
            message: `Reply sent to ${toAddresses.join(', ')}`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error replying to email: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SYNC INBOX
    // =========================================================================
    defineTool({
      name: 'sync_inbox',
      description: `Sync emails from the mail server. Fetches new emails from IMAP.`,
      category: 'communication',
      schema: z.object({
        limit: z.number().optional().default(50).describe('Maximum emails to sync'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required to sync inbox.');
          }

          const emailClient = await emailClientFactory.createForUser(context.userId);
          if (!emailClient) {
            return failure('Email not configured. Please set up your email account in Settings.');
          }

          const result = await emailClient.syncInbox({ limit: input.limit });

          return success({
            synced: result.synced,
            skipped: result.skipped,
            errors: result.errors,
            newEmails: result.newEmails.slice(0, 5).map((email: any) => ({
              id: email.id,
              from: email.from?.email,
              subject: email.subject,
            })),
            message: `Synced ${result.synced} new emails (${result.skipped} already existed, ${result.errors} errors)`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error syncing inbox: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET SMS STATUS
    // =========================================================================
    defineTool({
      name: 'get_sms_status',
      description: 'Check if SMS sending is configured and working.',
      category: 'communication',
      schema: z.object({}),
      handler: async () => {
        const configured = !!twilioClient && !!process.env.TWILIO_NUMBER;
        return success({
          configured,
          fromNumber: configured ? process.env.TWILIO_NUMBER : null,
          message: configured
            ? 'SMS sending is available via Twilio.'
            : 'SMS not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_NUMBER.',
        });
      },
      cacheable: true,
      cacheTTL: 5 * 60,
    }),

    // =========================================================================
    // LOG NOTE TO CONTACT
    // =========================================================================
    defineTool({
      name: 'add_contact_note',
      description: `Add a note to a contact's activity log. Use this to:
- Record conversation summaries
- Note important information about the contact
- Track follow-up reminders
- Document meeting outcomes`,
      category: 'communication',
      schema: z.object({
        contactId: z.number().describe('Contact ID to add the note to'),
        content: z.string().describe('Note content'),
        subject: z.string().optional().describe('Optional note subject/title'),
        propertyId: z.number().optional().describe('Related property ID'),
        dealId: z.number().optional().describe('Related deal ID'),
      }),
      handler: async (input, context) => {
        try {
          const contact = await Contact.findByPk(input.contactId);
          if (!contact) {
            return failure(`Contact not found with ID ${input.contactId}`);
          }

          const { userId: actorUserId, organizationId } = await resolveCommunicationContext({
            userId: context.userId,
            organizationId: contact.organizationId,
          });

          await ContactActivity.logNote({
            contactId: contact.id,
            content: input.content,
            subject: input.subject,
            userId: actorUserId || undefined,
            organizationId: organizationId || undefined,
            dealId: input.dealId,
            propertyId: input.propertyId,
          });

          return success({
            logged: true,
            contactId: contact.id,
            contactName: contact.name,
            message: `Note added to ${contact.name}'s activity log.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error adding note: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET CONTACT ACTIVITY
    // =========================================================================
    defineTool({
      name: 'get_contact_activity',
      description: `Get the activity timeline for a contact. Shows all communications including calls, emails, SMS, and notes.`,
      category: 'communication',
      schema: z.object({
        contactId: z.number().describe('Contact ID to get activity for'),
        types: z.array(z.enum(['call', 'email', 'sms', 'note', 'meeting', 'task', 'voicemail'])).optional()
          .describe('Filter by activity types'),
        limit: z.number().optional().describe('Maximum number of activities to return (default 20)'),
      }),
      handler: async (input) => {
        try {
          const contact = await Contact.findByPk(input.contactId);
          if (!contact) {
            return failure(`Contact not found with ID ${input.contactId}`);
          }

          const { activities, total } = await ContactActivity.getTimeline(input.contactId, {
            types: input.types as any,
            limit: input.limit || 20,
          });

          const summary = await ContactActivity.getSummary(input.contactId);

          return success({
            contact: {
              id: contact.id,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
            },
            summary: {
              totalCalls: summary.totalCalls,
              totalEmails: summary.totalEmails,
              totalSms: summary.totalSms,
              totalNotes: summary.totalNotes,
              lastActivity: summary.lastActivity,
              lastCall: summary.lastCall,
              lastEmail: summary.lastEmail,
            },
            activities: activities.map(a => ({
              id: a.id,
              type: a.type,
              direction: a.direction,
              status: a.status,
              subject: a.subject,
              content: a.content?.substring(0, 200) + (a.content && a.content.length > 200 ? '...' : ''),
              summary: a.summary,
              callDuration: a.callDuration,
              callOutcome: a.callOutcome,
              createdAt: a.createdAt,
            })),
            total,
            message: `Found ${total} activities for ${contact.name}.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error getting contact activity: ${errorMessage}`);
        }
      },
      cacheable: true,
      cacheTTL: 30, // 30 seconds
    }),

    // =========================================================================
    // GET LAST CONTACT ACTIVITY BY NAME
    // =========================================================================
    defineTool({
      name: 'get_last_contact_activity_by_name',
      description: `Find a contact by name and return the most recent activity. If the name is close to an existing contact, the tool will suggest the match before creating a duplicate.`,
      category: 'communication',
      schema: z.object({
        name: z.string().describe('Contact name to search (full or partial)'),
        propertyAddress: z.string().optional().describe('Property address to disambiguate (e.g., "141 Throop Ave, Brooklyn, NY")'),
        city: z.string().optional().describe('City (if not included in propertyAddress)'),
        state: z.string().optional().describe('State (if not included in propertyAddress)'),
        zip: z.string().optional().describe('ZIP (if not included in propertyAddress)'),
        includeAllMatches: z.boolean().optional().default(false)
          .describe('Return all matching contacts with their last activity'),
      }),
      handler: async (input, context) => {
        try {
          const trimmedName = input.name.trim();
          if (!trimmedName) {
            return failure('Contact name is required.');
          }

          const organizationId = await getOrganizationIdForUser(context.userId);
          const where: Record<string, unknown> = {
            name: { [Op.iLike]: `%${trimmedName}%` },
          };

          if (organizationId) {
            where.organizationId = organizationId;
          } else if (context.userId) {
            where.createdById = context.userId;
          }

          let contacts = await Contact.findAll({
            where,
            limit: 10,
            order: [['updatedAt', 'DESC']],
          });

          if (contacts.length === 0) {
            const similar = await findSimilarContactsByName(trimmedName, organizationId);
            if (similar.length > 0) {
              const candidate = similar[0];
              const phoneStr = candidate.contact.phone ? `(${candidate.contact.phone})` : '';
              const propertyHint = candidate.propertyAddress ? ` near ${candidate.propertyAddress}` : '';

              // Load recent activity for better context
              const recentActivity = await loadContactActivity(candidate.contact.id, { limit: 1 });
              const activityHint = recentActivity.length > 0
                ? ` - last ${recentActivity[0].type} ${formatTimeAgo(recentActivity[0].createdAt)}`
                : '';

              // Build conversational confirmation message
              const confirmMessage = `I couldn't find "${trimmedName}", but I found **${candidate.contact.name}** ${phoneStr}${propertyHint}${activityHint}. Is this who you're looking for? Just say "yes" to confirm.`;

              // Store pending confirmation state
              try {
                const agentSvc = getAgentService();
                agentSvc.setPendingConfirmation({
                  action: 'lookup contact',
                  entityType: 'contact',
                  candidateId: candidate.contact.id,
                  candidateName: candidate.contact.name,
                  candidates: [{ id: candidate.contact.id, name: candidate.contact.name, details: phoneStr }],
                  originalQuery: trimmedName,
                  toolName: 'get_last_contact_activity_by_name',
                  toolArgs: input,
                  sessionId: context.sessionId,
                });
              } catch (e) {
                // Non-critical, continue without state tracking
              }

              return success({
                needsConfirmation: true,
                suggestedContact: {
                  id: candidate.contact.id,
                  name: candidate.contact.name,
                  phone: candidate.contact.phone,
                  email: candidate.contact.email,
                  company: candidate.contact.company,
                  propertyAddress: candidate.propertyAddress,
                  similarityScore: candidate.score,
                },
                confirmationMessage: confirmMessage,
                originalQuery: trimmedName,
              });
            }
            return failure(`No contacts found matching "${trimmedName}". Could you provide more details like their phone number, email, or the property they're associated with?`);
          }

          let property: Property | null = null;
          if (input.propertyAddress) {
            const parsed = parseAddressInput({
              address: input.propertyAddress,
              city: input.city,
              state: input.state,
              zip: input.zip,
            });
            if (parsed.street && parsed.city && parsed.state) {
              property = await propertyService.findByAddress(
                parsed.street,
                parsed.city,
                parsed.state,
                parsed.zip
              );
            }
          }

          if (contacts.length > 1 && property) {
            const assignments = await PropertyContact.findAll({
              where: { propertyId: property.id },
            });
            const propertyContactIds = new Set(assignments.map((a) => a.contactId));
            const filtered = contacts.filter((contact) => propertyContactIds.has(contact.id));

            if (filtered.length > 0) {
              contacts = filtered;
            }
          }

          if (contacts.length > 1 && !input.includeAllMatches) {
            // Return candidates with property links and activity for disambiguation
            const matches = await Promise.all(
              contacts.slice(0, 5).map(async (contact) => {
                const [properties, recentActivity, summary] = await Promise.all([
                  loadContactPropertySummaries(contact.id),
                  loadContactActivity(contact.id, { limit: 1 }),
                  ContactActivity.getSummary(contact.id),
                ]);

                const lastActivityStr = recentActivity.length > 0
                  ? `${recentActivity[0].type} ${formatTimeAgo(recentActivity[0].createdAt)}`
                  : null;

                return {
                  contact: {
                    id: contact.id,
                    name: contact.name,
                    phone: contact.phone,
                    email: contact.email,
                    company: contact.company,
                  },
                  properties,
                  lastActivity: lastActivityStr,
                  totalCalls: summary.totalCalls,
                };
              })
            );

            // Build conversational disambiguation message
            const candidateLines = matches.map((m, i) => {
              const phoneStr = m.contact.phone ? ` (${m.contact.phone})` : '';
              const propStr = m.properties.length > 0 ? ` - ${m.properties[0].address}` : '';
              const actStr = m.lastActivity ? ` [last ${m.lastActivity}]` : '';
              return `${i + 1}. **${m.contact.name}**${phoneStr}${propStr}${actStr}`;
            }).join('\n');

            const confirmMessage = `I found ${contacts.length} contacts matching "${trimmedName}":\n\n${candidateLines}\n\nWhich one did you mean? You can say the number (1, 2, etc.), their full name, or mention a property address to help me identify the right person.`;

            // Store pending confirmation state with all candidates
            try {
              const agentSvc = getAgentService();
              agentSvc.setPendingConfirmation({
                action: 'lookup contact',
                entityType: 'contact',
                candidateId: matches[0].contact.id, // Default to first
                candidateName: matches[0].contact.name,
                candidates: matches.map((m) => ({
                  id: m.contact.id,
                  name: m.contact.name,
                  details: m.contact.phone || undefined,
                })),
                originalQuery: trimmedName,
                toolName: 'get_last_contact_activity_by_name',
                toolArgs: input,
                sessionId: context.sessionId,
              });
            } catch (e) {
              // Non-critical
            }

            return success({
              needsDisambiguation: true,
              matches,
              confirmationMessage: confirmMessage,
              originalQuery: trimmedName,
            });
          }

          const includePropertyLinks = contacts.length > 1;
          const results = [];
          for (const contact of contacts) {
            const [summary, timeline, properties] = await Promise.all([
              ContactActivity.getSummary(contact.id as any),
              ContactActivity.getTimeline(contact.id as any, { limit: 1 }),
              includePropertyLinks ? loadContactPropertySummaries(contact.id) : Promise.resolve([]),
            ]);

            const lastActivity = timeline.activities[0];

            results.push({
              contact: {
                id: contact.id,
                name: contact.name,
                phone: contact.phone,
                email: contact.email,
                company: contact.company,
              },
              properties,
              lastActivity: lastActivity
                ? {
                    type: lastActivity.type,
                    direction: lastActivity.direction,
                    createdAt: lastActivity.createdAt,
                    summary: lastActivity.summary || lastActivity.subject || lastActivity.content,
                  }
                : null,
              lastCallAt: summary.lastCall,
              lastEmailAt: summary.lastEmail,
              lastActivityAt: summary.lastActivity,
              totals: {
                calls: summary.totalCalls,
                emails: summary.totalEmails,
                sms: summary.totalSms,
                notes: summary.totalNotes,
              },
            });
          }

          if (results.length === 1) {
            return success({
              ...results[0],
              message: `Last activity found for ${results[0].contact.name}.`,
            });
          }

          return success({
            matches: results,
            message: `Found ${results.length} contacts matching "${trimmedName}".`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error finding last activity: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // LOOKUP TEAM MEMBERS
    // =========================================================================
    defineTool({
      name: 'lookup_team_members',
      description: `Look up team members by name within your organization. Use this to:
- Find team member contact info (email, phone)
- Learn about team members (bio, expertise, title, role)
- Answer questions about who does what on the team
- Verify team member names before sending communications
Returns full profile including name, email, phone, role, title, bio, expertise, and timezone.`,
      category: 'communication',
      schema: z.object({
        names: z
          .array(z.string())
          .optional()
          .describe('List of team member names to look up (e.g., ["Ed", "George"]). If empty, returns all team members.'),
        listAll: z
          .boolean()
          .optional()
          .describe('Set to true to list all team members in the organization'),
      }),
      handler: async (input, context) => {
        try {
          const { organizationId } = await resolveCommunicationContext({
            userId: context.userId,
          });

          if (!organizationId) {
            return failure('No organization context found. Please ensure you are logged in.');
          }

          // If listAll is true or no names provided, return all team members
          if (input.listAll || !input.names || input.names.length === 0) {
            const allMembers = await MarketplaceUser.findAll({
              where: { organizationId },
              attributes: ['id', 'name', 'email', 'phone', 'role', 'title', 'bio', 'expertise', 'timezone'],
              order: [['name', 'ASC']],
            });

            return success({
              teamMembers: allMembers.map((member) => ({
                id: member.id,
                name: member.name,
                email: member.email,
                phone: member.phone || undefined,
                role: member.role,
                title: member.title || undefined,
                bio: member.bio || undefined,
                expertise: member.expertise || [],
                timezone: member.timezone || undefined,
              })),
              total: allMembers.length,
              message: `Found ${allMembers.length} team member(s) in your organization.`,
            });
          }

          const results: Array<{
            searchedName: string;
            found: boolean;
            matches: Array<{
              id: string;
              name: string;
              email: string;
              phone?: string;
              role: string;
              title?: string;
              bio?: string;
              expertise: string[];
              timezone?: string;
            }>;
          }> = [];

          for (const searchName of input.names) {
            const trimmedName = searchName.trim().toLowerCase();
            if (!trimmedName) {
              results.push({
                searchedName: searchName,
                found: false,
                matches: [],
              });
              continue;
            }

            // Search for team members in the same organization
            const teamMembers = await MarketplaceUser.findAll({
              where: {
                organizationId,
                [Op.or]: [
                  // Match by first name (case-insensitive)
                  { name: { [Op.iLike]: `${trimmedName}%` } },
                  // Match by full name containing the search term
                  { name: { [Op.iLike]: `%${trimmedName}%` } },
                ],
              },
              attributes: ['id', 'name', 'email', 'phone', 'role', 'title', 'bio', 'expertise', 'timezone'],
              limit: 5,
            });

            results.push({
              searchedName: searchName,
              found: teamMembers.length > 0,
              matches: teamMembers.map((member) => ({
                id: member.id,
                name: member.name,
                email: member.email,
                phone: member.phone || undefined,
                role: member.role,
                title: member.title || undefined,
                bio: member.bio || undefined,
                expertise: member.expertise || [],
                timezone: member.timezone || undefined,
              })),
            });
          }

          const foundCount = results.filter((r) => r.found).length;
          const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

          return success({
            results,
            summary: {
              searched: input.names.length,
              found: foundCount,
              totalMatches,
            },
            message: `Found ${totalMatches} team member(s) matching ${foundCount} of ${input.names.length} names.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error looking up team members: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // CREATE TEAM MEMBER
    // =========================================================================
    defineTool({
      name: 'create_team_member',
      description: `Create a new team member in your organization. Use this to:
- Add new employees or colleagues to the team
- Set up team member profiles with their info
- Onboard new hires with their role, title, and expertise
Example: "Add John Smith to the team as an Acquisitions Manager"`,
      category: 'communication',
      schema: z.object({
        name: z.string().describe('Full name of the team member (e.g., "John Smith")'),
        email: z.string().email().describe('Email address (must be unique)'),
        title: z.string().optional().describe('Job title (e.g., "Acquisitions Manager", "Underwriter")'),
        phone: z.string().optional().describe('Phone number'),
        bio: z.string().optional().describe('Biography or about section describing the team member'),
        expertise: z
          .array(z.string())
          .optional()
          .describe('Areas of expertise (e.g., ["acquisitions", "underwriting", "closing"])'),
        timezone: z.string().optional().describe('Timezone (e.g., "America/New_York", "America/Los_Angeles")'),
        role: z
          .enum(['team_member', 'admin', 'broker', 'broker_assistant', 'transaction_coordinator'])
          .optional()
          .describe('System role - defaults to "team_member"'),
      }),
      handler: async (input, context) => {
        try {
          const { organizationId } = await resolveCommunicationContext({
            userId: context.userId,
          });

          if (!organizationId) {
            return failure('No organization context found. Please ensure you are logged in.');
          }

          // Check if current user is an admin
          const currentUser = await MarketplaceUser.findByPk(context.userId);
          if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
            return failure('Only administrators can create team members. Please contact an admin to add new team members.');
          }

          // Check if email already exists
          const existingUser = await MarketplaceUser.findOne({
            where: { email: { [Op.iLike]: input.email } },
          });

          if (existingUser) {
            return failure(`A user with email "${input.email}" already exists.`);
          }

          // Create the new team member
          const newMember = await MarketplaceUser.create({
            name: input.name,
            email: input.email.toLowerCase(),
            role: input.role || 'team_member',
            title: input.title,
            phone: input.phone,
            bio: input.bio,
            expertise: input.expertise || [],
            timezone: input.timezone || 'America/New_York',
            organizationId,
            verified: true, // Auto-verify team members added by existing users
            notifyEmail: true,
            notifyPush: true,
            dailyDigest: true,
          });

          return success({
            created: true,
            teamMember: {
              id: newMember.id,
              name: newMember.name,
              email: newMember.email,
              phone: newMember.phone || undefined,
              role: newMember.role,
              title: newMember.title || undefined,
              bio: newMember.bio || undefined,
              expertise: newMember.expertise || [],
              timezone: newMember.timezone || undefined,
            },
            message: `Successfully created team member "${newMember.name}" (${newMember.email}).`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error creating team member: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // UPDATE TEAM MEMBER
    // =========================================================================
    defineTool({
      name: 'update_team_member',
      description: `Update an existing team member's profile. Use this to:
- Update someone's title, bio, or expertise
- Change contact information
- Modify team member details
Example: "Update Ed's title to Senior Acquisitions Manager"`,
      category: 'communication',
      schema: z.object({
        name: z.string().describe('Name of the team member to update'),
        updates: z.object({
          title: z.string().optional().describe('New job title'),
          phone: z.string().optional().describe('New phone number'),
          bio: z.string().optional().describe('New biography'),
          expertise: z.array(z.string()).optional().describe('New expertise areas'),
          timezone: z.string().optional().describe('New timezone'),
        }).describe('Fields to update'),
      }),
      handler: async (input, context) => {
        try {
          const { organizationId } = await resolveCommunicationContext({
            userId: context.userId,
          });

          if (!organizationId) {
            return failure('No organization context found. Please ensure you are logged in.');
          }

          // Check if current user is an admin
          const currentUser = await MarketplaceUser.findByPk(context.userId);
          if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
            return failure('Only administrators can update team member profiles. Please contact an admin to make changes.');
          }

          // Find the team member by name
          const trimmedName = input.name.trim().toLowerCase();
          const teamMember = await MarketplaceUser.findOne({
            where: {
              organizationId,
              [Op.or]: [
                { name: { [Op.iLike]: `${trimmedName}%` } },
                { name: { [Op.iLike]: `%${trimmedName}%` } },
              ],
            },
          });

          if (!teamMember) {
            return failure(`Could not find team member "${input.name}" in your organization.`);
          }

          // Apply updates
          const updateData: Partial<{
            title: string;
            phone: string;
            bio: string;
            expertise: string[];
            timezone: string;
          }> = {};

          if (input.updates.title !== undefined) updateData.title = input.updates.title;
          if (input.updates.phone !== undefined) updateData.phone = input.updates.phone;
          if (input.updates.bio !== undefined) updateData.bio = input.updates.bio;
          if (input.updates.expertise !== undefined) updateData.expertise = input.updates.expertise;
          if (input.updates.timezone !== undefined) updateData.timezone = input.updates.timezone;

          if (Object.keys(updateData).length === 0) {
            return failure('No updates provided. Please specify at least one field to update.');
          }

          await teamMember.update(updateData);

          return success({
            updated: true,
            teamMember: {
              id: teamMember.id,
              name: teamMember.name,
              email: teamMember.email,
              phone: teamMember.phone || undefined,
              role: teamMember.role,
              title: teamMember.title || undefined,
              bio: teamMember.bio || undefined,
              expertise: teamMember.expertise || [],
              timezone: teamMember.timezone || undefined,
            },
            updatedFields: Object.keys(updateData),
            message: `Successfully updated ${teamMember.name}'s profile (${Object.keys(updateData).join(', ')}).`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error updating team member: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SEND TEAM EMAIL
    // =========================================================================
    defineTool({
      name: 'send_team_email',
      description: `Send an email to team members by name. This tool looks up team members in your organization and sends them an email.
Use for:
- Meeting reminders to team members
- Internal notifications
- Team communications
Example: "Send an email to Ed, George and Dave reminding them about tomorrow's meeting"`,
      category: 'communication',
      schema: z.object({
        names: z
          .array(z.string())
          .describe('Team member names to email (e.g., ["Ed", "George", "Dave"])'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body content (plain text)'),
        html: z.string().optional().describe('Optional HTML version of the email body'),
      }),
      handler: async (input, context) => {
        try {
          const { userId: actorUserId, organizationId } = await resolveCommunicationContext({
            userId: context.userId,
          });

          if (!organizationId) {
            return failure('No organization context found. Please ensure you are logged in.');
          }

          // Look up all team members by name
          const lookupResults: Array<{
            name: string;
            found: boolean;
            member?: { id: string; name: string; email: string };
          }> = [];

          const recipientEmails: string[] = [];
          const recipientNames: string[] = [];

          for (const searchName of input.names) {
            const trimmedName = searchName.trim().toLowerCase();
            if (!trimmedName) continue;

            // Find best match for this name
            const teamMembers = await MarketplaceUser.findAll({
              where: {
                organizationId,
                [Op.or]: [
                  { name: { [Op.iLike]: `${trimmedName}%` } },
                  { name: { [Op.iLike]: `%${trimmedName}%` } },
                ],
              },
              attributes: ['id', 'name', 'email'],
              limit: 1,
              order: [
                // Prefer exact first name matches
                [
                  sequelize.literal(
                    `CASE WHEN LOWER(name) LIKE '${trimmedName} %' THEN 0 WHEN LOWER(name) = '${trimmedName}' THEN 1 ELSE 2 END`
                  ),
                  'ASC',
                ],
              ],
            });

            if (teamMembers.length > 0) {
              const member = teamMembers[0];
              lookupResults.push({
                name: searchName,
                found: true,
                member: { id: member.id, name: member.name, email: member.email },
              });
              if (!recipientEmails.includes(member.email)) {
                recipientEmails.push(member.email);
                recipientNames.push(member.name);
              }
            } else {
              lookupResults.push({ name: searchName, found: false });
            }
          }

          // Check if we found anyone
          if (recipientEmails.length === 0) {
            return failure(
              `Could not find any team members matching: ${input.names.join(', ')}. Please check the names and try again.`
            );
          }

          // Report any names we couldn't find
          const notFound = lookupResults.filter((r) => !r.found).map((r) => r.name);

          // Send the email
          let messageId: string | undefined;
          let fromAddress: string = process.env.RESEND_FROM_EMAIL || 'noreply@dispotree.com';

          // Try to use user's configured email first
          if (actorUserId) {
            try {
              const emailClient = await emailClientFactory.createForUser(actorUserId);
              if (emailClient && emailClient.canSend()) {
                const result = await emailClient.sendEmail({
                  to: recipientEmails,
                  subject: input.subject,
                  text: input.body,
                  html: input.html,
                });
                messageId = result.id;
                fromAddress = emailClient.getAccountEmail() || fromAddress;
              }
            } catch (e) {
              console.log('[Communication Tools] User email config not available, using Resend');
            }
          }

          // Fall back to Resend API if not sent yet
          if (!messageId) {
            if (!resend) {
              return failure(
                'Email sending not configured. Please set up your email account in Settings or configure RESEND_API_KEY.'
              );
            }

            const response = await resend.emails.send({
              from: fromAddress,
              to: recipientEmails,
              subject: input.subject,
              text: input.body,
              html: input.html,
            });

            if (response.error) {
              return failure(`Failed to send email: ${response.error.message}`);
            }
            messageId = response.data?.id;
          }

          const response = {
            sent: true,
            messageId,
            recipients: lookupResults
              .filter((r) => r.found)
              .map((r) => ({
                name: r.member!.name,
                email: r.member!.email,
              })),
            subject: input.subject,
            from: fromAddress,
            notFound: notFound.length > 0 ? notFound : undefined,
            message:
              notFound.length > 0
                ? `Email sent to ${recipientNames.join(', ')}. Could not find: ${notFound.join(', ')}.`
                : `Email sent successfully to ${recipientNames.join(', ')}.`,
          };

          return success(response);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error sending team email: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerCommunicationTools;
