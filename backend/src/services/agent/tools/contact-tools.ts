/**
 * Contact Tools
 *
 * Agent tools for managing and searching contacts.
 * Enables the agent to find contacts, get property contacts,
 * and extract contact info for meetings/communications.
 *
 * Tools:
 * - search_contacts: Search contacts by name, company, type, or tags
 * - get_contact: Get a single contact by ID
 * - get_property_contacts: Get all contacts for a property/deal
 * - get_contact_emails: Get emails for multiple contacts (for meetings)
 * - list_contacts: List contacts with filters
 */

import { z } from 'zod';
import { Op } from 'sequelize';
import { toolRegistry, success, failure, defineTool } from './registry';
import Contact from '../../../models/Contact';
import ContactNote from '../../../models/ContactNote';
import PropertyContact from '../../../models/PropertyContact';
import Property from '../../../models/Property';

/**
 * Register all contact tools
 */
export function registerContactTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // SEARCH CONTACTS
    // =========================================================================
    defineTool({
      name: 'search_contacts',
      description:
        'Search for contacts by name, email, company, type, or tags. ' +
        'Returns matching contacts with their details including email and phone. ' +
        'Use this to find contacts before adding them to meetings or communications.',
      category: 'contacts',
      schema: z.object({
        query: z
          .string()
          .optional()
          .describe('Search query - matches name, email, or company'),
        type: z
          .enum([
            'broker',
            'buyer',
            'seller',
            'wholesaler',
            'attorney',
            're_agent',
            'transaction_coordinator',
            'title_company',
            'team_member',
            'other',
          ])
          .optional()
          .describe('Filter by contact type'),
        company: z.string().optional().describe('Filter by company name'),
        tags: z
          .array(z.string())
          .optional()
          .describe('Filter by tags (matches any)'),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe('Maximum results to return'),
      }),
      cacheable: true,
      cacheTTL: 60, // 1 minute cache
      handler: async (input, context) => {
        const { query, type, company, tags, limit } = input;

        const where: any = {
          organizationId: context.organizationId,
          status: 'active',
        };

        // Text search on name, email, company
        if (query) {
          where[Op.or] = [
            { name: { [Op.iLike]: `%${query}%` } },
            { email: { [Op.iLike]: `%${query}%` } },
            { company: { [Op.iLike]: `%${query}%` } },
          ];
        }

        if (type) {
          where.type = type;
        }

        if (company) {
          where.company = { [Op.iLike]: `%${company}%` };
        }

        if (tags && tags.length > 0) {
          where.tags = { [Op.overlap]: tags };
        }

        const contacts = await Contact.findAll({
          where,
          limit,
          order: [['name', 'ASC']],
          attributes: [
            'id',
            'name',
            'email',
            'phone',
            'company',
            'type',
            'role',
            'tags',
          ],
        });

        return success(
          {
            contacts: contacts.map((c) => c.toJSON()),
            count: contacts.length,
          },
          `Found ${contacts.length} contact(s)`
        );
      },
    }),

    // =========================================================================
    // GET CONTACT
    // =========================================================================
    defineTool({
      name: 'get_contact',
      description:
        'Get full details for a single contact by ID. ' +
        'Returns all contact information including address and notes.',
      category: 'contacts',
      schema: z.object({
        contactId: z.string().uuid().describe('Contact ID'),
      }),
      cacheable: true,
      cacheTTL: 120,
      handler: async (input, context) => {
        const contact = await Contact.findOne({
          where: {
            id: input.contactId,
            organizationId: context.organizationId,
          },
        });

        if (!contact) {
          return failure('Contact not found');
        }

        return success(contact.toJSON(), `Contact: ${contact.name}`);
      },
    }),

    // =========================================================================
    // GET PROPERTY CONTACTS
    // =========================================================================
    defineTool({
      name: 'get_property_contacts',
      description:
        'Get all contacts associated with a property/deal. ' +
        'Returns contacts with their roles (buyer, seller, attorney, etc.). ' +
        'Use this to see who is involved in a deal before scheduling meetings.',
      category: 'contacts',
      schema: z.object({
        propertyId: z.number().describe('Property/deal ID'),
        role: z
          .enum([
            'agent',
            'broker',
            'seller',
            'wholesaler',
            'attorney',
            're_agent',
            'buyer',
            'other',
          ])
          .optional()
          .describe('Filter by role on this property'),
      }),
      cacheable: true,
      cacheTTL: 60,
      handler: async (input, context) => {
        const { propertyId, role } = input;

        // First verify the property belongs to this organization
        const property = await Property.findOne({
          where: {
            id: propertyId,
            userId: context.userId,
          },
          attributes: ['id', 'address', 'city', 'state'],
        });

        if (!property) {
          return failure('Property not found or access denied');
        }

        const where: any = { propertyId };
        if (role) {
          where.role = role;
        }

        const propertyContacts = await PropertyContact.findAll({
          where,
          include: [
            {
              model: Contact,
              as: 'contact',
              attributes: [
                'id',
                'name',
                'email',
                'phone',
                'company',
                'type',
                'role',
              ],
            },
          ],
          order: [['isPrimary', 'DESC'], ['role', 'ASC']],
        });

        const contacts = propertyContacts.map((pc: any) => ({
          id: pc.contact?.id,
          name: pc.contact?.name,
          email: pc.contact?.email,
          phone: pc.contact?.phone,
          company: pc.contact?.company,
          contactType: pc.contact?.type,
          roleOnProperty: pc.role,
          isPrimary: pc.isPrimary,
          notes: pc.notes,
        }));

        const propertyAddress = `${property.address}, ${property.city}, ${property.state}`;

        return success(
          {
            property: {
              id: property.id,
              address: propertyAddress,
            },
            contacts,
            count: contacts.length,
          },
          `Found ${contacts.length} contact(s) for ${propertyAddress}`
        );
      },
    }),

    // =========================================================================
    // GET CONTACT EMAILS
    // =========================================================================
    defineTool({
      name: 'get_contact_emails',
      description:
        'Get email addresses for multiple contacts by ID. ' +
        'Perfect for preparing meeting invitations or group emails. ' +
        'Returns a list of emails that can be passed to meeting/email tools.',
      category: 'contacts',
      schema: z.object({
        contactIds: z
          .array(z.string().uuid())
          .describe('Array of contact IDs'),
        includeNames: z
          .boolean()
          .optional()
          .default(true)
          .describe('Include names with emails'),
      }),
      cacheable: true,
      cacheTTL: 60,
      handler: async (input, context) => {
        const { contactIds, includeNames } = input;

        const contacts = await Contact.findAll({
          where: {
            id: { [Op.in]: contactIds },
            organizationId: context.organizationId,
            email: { [Op.ne]: null },
          },
          attributes: ['id', 'name', 'email'],
        });

        const result = contacts.map((c) => ({
          id: c.id,
          name: includeNames ? c.name : undefined,
          email: c.email,
        }));

        const emails = contacts
          .filter((c) => c.email)
          .map((c) => c.email as string);

        return success(
          {
            contacts: result,
            emails,
            count: emails.length,
            missingEmailCount: contactIds.length - emails.length,
          },
          `Retrieved ${emails.length} email(s)`
        );
      },
    }),

    // =========================================================================
    // GET PROPERTY CONTACT EMAILS
    // =========================================================================
    defineTool({
      name: 'get_property_contact_emails',
      description:
        'Get all email addresses for contacts on a property/deal. ' +
        'Can filter by role or get all contacts. ' +
        'Perfect for scheduling meetings with all parties on a deal.',
      category: 'contacts',
      schema: z.object({
        propertyId: z.number().describe('Property/deal ID'),
        roles: z
          .array(
            z.enum([
              'agent',
              'broker',
              'seller',
              'wholesaler',
              'attorney',
              're_agent',
              'buyer',
              'other',
            ])
          )
          .optional()
          .describe('Filter by specific roles (omit for all contacts)'),
        excludeRoles: z
          .array(
            z.enum([
              'agent',
              'broker',
              'seller',
              'wholesaler',
              'attorney',
              're_agent',
              'buyer',
              'other',
            ])
          )
          .optional()
          .describe('Exclude specific roles'),
      }),
      cacheable: true,
      cacheTTL: 60,
      handler: async (input, context) => {
        const { propertyId, roles, excludeRoles } = input;

        // Verify property access
        const property = await Property.findOne({
          where: {
            id: propertyId,
            userId: context.userId,
          },
          attributes: ['id', 'address', 'city', 'state'],
        });

        if (!property) {
          return failure('Property not found or access denied');
        }

        const where: any = { propertyId };
        if (roles && roles.length > 0) {
          where.role = { [Op.in]: roles };
        }
        if (excludeRoles && excludeRoles.length > 0) {
          where.role = { ...where.role, [Op.notIn]: excludeRoles };
        }

        const propertyContacts = await PropertyContact.findAll({
          where,
          include: [
            {
              model: Contact,
              as: 'contact',
              attributes: ['id', 'name', 'email', 'company'],
              where: {
                email: { [Op.ne]: null },
              },
            },
          ],
        });

        const contacts = propertyContacts
          .filter((pc: any) => pc.contact?.email)
          .map((pc: any) => ({
            id: pc.contact.id,
            name: pc.contact.name,
            email: pc.contact.email,
            company: pc.contact.company,
            role: pc.role,
          }));

        const emails = contacts.map((c) => c.email);
        const propertyAddress = `${property.address}, ${property.city}, ${property.state}`;

        return success(
          {
            property: {
              id: property.id,
              address: propertyAddress,
            },
            contacts,
            emails,
            count: emails.length,
          },
          `Found ${emails.length} contact email(s) for ${propertyAddress}`
        );
      },
    }),

    // =========================================================================
    // LIST CONTACTS
    // =========================================================================
    defineTool({
      name: 'list_contacts',
      description:
        'List all contacts with optional filters. ' +
        'Use for browsing contacts or finding contacts by type.',
      category: 'contacts',
      schema: z.object({
        type: z
          .enum([
            'broker',
            'buyer',
            'seller',
            'wholesaler',
            'attorney',
            're_agent',
            'transaction_coordinator',
            'title_company',
            'team_member',
            'other',
          ])
          .optional()
          .describe('Filter by contact type'),
        status: z
          .enum(['active', 'inactive', 'archived'])
          .optional()
          .default('active')
          .describe('Filter by status'),
        limit: z.number().optional().default(50).describe('Maximum results'),
        offset: z.number().optional().default(0).describe('Offset for pagination'),
      }),
      cacheable: true,
      cacheTTL: 120,
      handler: async (input, context) => {
        const { type, status, limit, offset } = input;

        const where: any = {
          organizationId: context.organizationId,
        };

        if (type) where.type = type;
        if (status) where.status = status;

        const { rows: contacts, count: total } = await Contact.findAndCountAll({
          where,
          limit,
          offset,
          order: [['name', 'ASC']],
          attributes: [
            'id',
            'name',
            'email',
            'phone',
            'company',
            'type',
            'role',
            'tags',
            'status',
          ],
        });

        return success(
          {
            contacts: contacts.map((c) => c.toJSON()),
            total,
            limit,
            offset,
            hasMore: offset + contacts.length < total,
          },
          `Listed ${contacts.length} of ${total} contact(s)`
        );
      },
    }),

    // =========================================================================
    // ADD NOTE TO CONTACT
    // =========================================================================
    defineTool({
      name: 'add_contact_note',
      description:
        'Add a note to a contact. Use this to record conversations, ' +
        'meeting summaries, follow-up reminders, or any information about the contact.',
      category: 'contacts',
      schema: z.object({
        contactId: z.string().uuid().describe('Contact ID to add note to'),
        content: z.string().min(1).describe('Note content'),
        subject: z.string().optional().describe('Optional subject/title for the note'),
      }),
      handler: async (input, context) => {
        const { contactId, content, subject } = input;

        // Verify contact exists and belongs to organization
        const contact = await Contact.findOne({
          where: {
            id: contactId,
            organizationId: context.organizationId,
          },
          attributes: ['id', 'name'],
        });

        if (!contact) {
          return failure('Contact not found');
        }

        const note = await ContactNote.createNote({
          contactId,
          userId: context.userId,
          organizationId: context.organizationId,
          content,
          subject,
        });

        return success(
          {
            noteId: note.id,
            contactId,
            contactName: contact.name,
            subject: note.subject,
            content: note.content,
            createdAt: note.createdAt,
          },
          `Added note to ${contact.name}`
        );
      },
    }),

    // =========================================================================
    // GET CONTACT NOTES
    // =========================================================================
    defineTool({
      name: 'get_contact_notes',
      description:
        'Get all notes for a contact. Returns notes in reverse chronological order.',
      category: 'contacts',
      schema: z.object({
        contactId: z.string().uuid().describe('Contact ID'),
        limit: z.number().optional().default(20).describe('Maximum notes to return'),
      }),
      cacheable: true,
      cacheTTL: 30,
      handler: async (input, context) => {
        const { contactId, limit } = input;

        // Verify contact exists and belongs to organization
        const contact = await Contact.findOne({
          where: {
            id: contactId,
            organizationId: context.organizationId,
          },
          attributes: ['id', 'name'],
        });

        if (!contact) {
          return failure('Contact not found');
        }

        const notes = await ContactNote.findAll({
          where: {
            contactId,
            organizationId: context.organizationId,
          },
          order: [['createdAt', 'DESC']],
          limit,
        });

        return success(
          {
            contact: {
              id: contact.id,
              name: contact.name,
            },
            notes: notes.map((n) => ({
              id: n.id,
              subject: n.subject,
              content: n.content,
              createdAt: n.createdAt,
              updatedAt: n.updatedAt,
            })),
            count: notes.length,
          },
          `Found ${notes.length} note(s) for ${contact.name}`
        );
      },
    }),

    // =========================================================================
    // UPDATE CONTACT NOTE
    // =========================================================================
    defineTool({
      name: 'update_contact_note',
      description: 'Update an existing note. Only the note author can update it.',
      category: 'contacts',
      schema: z.object({
        noteId: z.number().describe('Note ID to update'),
        content: z.string().optional().describe('New note content'),
        subject: z.string().optional().describe('New subject/title'),
      }),
      handler: async (input, context) => {
        const { noteId, content, subject } = input;

        if (!content && !subject) {
          return failure('Provide content or subject to update');
        }

        const updates: { content?: string; subject?: string } = {};
        if (content) updates.content = content;
        if (subject) updates.subject = subject;

        const note = await ContactNote.updateNote(noteId, context.userId, updates);

        if (!note) {
          return failure('Note not found or you are not the author');
        }

        return success(
          {
            noteId: note.id,
            subject: note.subject,
            content: note.content,
            updatedAt: note.updatedAt,
          },
          'Note updated'
        );
      },
    }),

    // =========================================================================
    // DELETE CONTACT NOTE
    // =========================================================================
    defineTool({
      name: 'delete_contact_note',
      description: 'Delete a note. Only the note author can delete it.',
      category: 'contacts',
      schema: z.object({
        noteId: z.number().describe('Note ID to delete'),
      }),
      handler: async (input, context) => {
        const deleted = await ContactNote.deleteNote(input.noteId, context.userId);

        if (!deleted) {
          return failure('Note not found or you are not the author');
        }

        return success({ deleted: true }, 'Note deleted');
      },
    }),
  ]);
}
