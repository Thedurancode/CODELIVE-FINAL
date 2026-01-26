/**
 * Contact Routes
 * API endpoints for contact management (CRM)
 *
 * SECURITY:
 * - Authentication required for all endpoints
 * - Ownership validation for user-specific resources
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { contactService } from '../services/ContactService';
import { propertyContactService } from '../services/PropertyContactService';
import { contactNoteService } from '../services/ContactNoteService';
import { signatureContactRoutes } from './signatureRoutes';
import { authenticate } from '../middleware/auth';
import MarketplaceUser from '../models/MarketplaceUser';
import Organization from '../models/Organization';
import Contact from '../models/Contact';
import ContactActivity, { ActivityType } from '../models/ContactActivity';

const router = Router();

// Rate limiting
const contactLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication to ALL contact routes
router.use(authenticate);
router.use(contactLimiter);

/**
 * @swagger
 * /api/contacts:
 *   get:
 *     summary: Get all contacts
 *     description: Retrieve all contacts for the authenticated user
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [broker, buyer, seller, wholesaler, other]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, archived]
 *     responses:
 *       200:
 *         description: List of contacts with pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { page, limit, search, type, status, sortBy, sortOrder } = req.query;

    const result = await contactService.getContacts(userId, {
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? Math.min(parseInt(limit as string, 10), 100) : 20,
      search: search as string,
      type: type as any,
      status: status as any,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'ASC' | 'DESC',
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/stats:
 *   get:
 *     summary: Get contact statistics
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contact statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const stats = await contactService.getContactStats(userId);

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching contact stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/tags:
 *   get:
 *     summary: Get all unique tags with counts
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tags with counts
 */
router.get('/tags', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const tags = await contactService.getAllTags(userId);

    res.json({
      success: true,
      data: tags,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/bulk/tags:
 *   post:
 *     summary: Add tags to multiple contacts
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contactIds
 *               - tags
 *             properties:
 *               contactIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Tags added successfully
 */
router.post('/bulk/tags', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { contactIds, tags } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Contact IDs array is required' });
    }

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ success: false, error: 'Tags array is required' });
    }

    const updatedCount = await contactService.bulkAddTags(userId, contactIds, tags);

    res.json({
      success: true,
      data: { updatedCount },
      message: `Tags added to ${updatedCount} contacts`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error adding tags:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/bulk/tags:
 *   delete:
 *     summary: Remove tags from multiple contacts
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contactIds
 *               - tags
 *             properties:
 *               contactIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Tags removed successfully
 */
router.delete('/bulk/tags', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { contactIds, tags } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Contact IDs array is required' });
    }

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ success: false, error: 'Tags array is required' });
    }

    const updatedCount = await contactService.bulkRemoveTags(userId, contactIds, tags);

    res.json({
      success: true,
      data: { updatedCount },
      message: `Tags removed from ${updatedCount} contacts`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error removing tags:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/bulk/delete:
 *   post:
 *     summary: Delete multiple contacts
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contactIds
 *             properties:
 *               contactIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Contacts deleted successfully
 */
router.post('/bulk/delete', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { contactIds } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Contact IDs array is required' });
    }

    const deletedCount = await contactService.bulkDelete(userId, contactIds);

    res.json({
      success: true,
      data: { deletedCount },
      message: `${deletedCount} contacts deleted`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error deleting contacts:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/search:
 *   get:
 *     summary: Search contacts
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { q, limit } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!q) {
      return res.status(400).json({ success: false, error: 'Search query required' });
    }

    const contacts = await contactService.searchContacts(
      userId,
      q as string,
      limit ? parseInt(limit as string, 10) : 10
    );

    res.json({
      success: true,
      data: contacts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/{id}/make-team-member:
 *   post:
 *     summary: Promote a contact to team member
 *     description: |
 *       Promotes a contact to a team member by updating their linked MarketplaceUser role.
 *       If the contact doesn't have a linked user account, creates one.
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contact promoted to team member
 *       404:
 *         description: Contact not found
 *       403:
 *         description: Not authorized (requires admin role)
 */
router.post('/:id/make-team-member', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const shouldSetDefault = Boolean(req.body?.setDefaultProfile ?? req.body?.setDefault ?? req.body?.makeDefault);

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check if user is admin
    const currentUser = await MarketplaceUser.findByPk(userId);
    if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // Get the contact
    const contact = await Contact.findByPk(id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    let marketplaceUser: MarketplaceUser | null = null;
    const organizationId = contact.organizationId || currentUser.organizationId || null;

    if (contact.linkedUserId) {
      // Contact already has a linked user - update their role
      marketplaceUser = await MarketplaceUser.findByPk(contact.linkedUserId);
      if (marketplaceUser) {
        const updates: { role: MarketplaceUser['role']; organizationId?: string } = { role: 'team_member' };
        if (!marketplaceUser.organizationId && organizationId) {
          updates.organizationId = organizationId;
        }
        await marketplaceUser.update(updates);
      }
    } else {
      // No linked user - create a new MarketplaceUser account
      if (!contact.email) {
        return res.status(400).json({
          success: false,
          error: 'Cannot create team member without email',
          message: 'This contact does not have an email address. Please add an email first.',
        });
      }

      // Check if a user already exists with this email
      const existingUser = await MarketplaceUser.findOne({
        where: { email: contact.email },
      });

      if (existingUser) {
        // Link existing user to contact and update role
        const updates: { role: MarketplaceUser['role']; organizationId?: string } = { role: 'team_member' };
        if (!existingUser.organizationId && organizationId) {
          updates.organizationId = organizationId;
        }
        await existingUser.update(updates);
        await contact.update({ linkedUserId: existingUser.id });
        marketplaceUser = existingUser;
      } else {
        // Create new MarketplaceUser
        marketplaceUser = await MarketplaceUser.create({
          email: contact.email,
          name: contact.name,
          company: contact.company || undefined,
          phone: contact.phone || undefined,
          role: 'team_member',
          verified: false,
          organizationId: organizationId || undefined,
        });

        // Link contact to new user
        await contact.update({ linkedUserId: marketplaceUser.id });
      }
    }

    // Update contact type to reflect team status
    await contact.update({
      tags: [...new Set([...contact.tags, 'team-member'])],
    });

    if (shouldSetDefault && marketplaceUser && organizationId) {
      const organization = await Organization.findByPk(organizationId);
      if (organization) {
        const settings = { ...(organization.settings || {}) } as Record<string, unknown>;
        settings.defaultCommunicationUserId = marketplaceUser.id;
        await organization.update({ settings });
      }
    }

    res.json({
      success: true,
      message: 'Contact promoted to team member',
      data: {
        contact: await Contact.findByPk(id),
        user: marketplaceUser ? {
          id: marketplaceUser.id,
          email: marketplaceUser.email,
          name: marketplaceUser.name,
          role: marketplaceUser.role,
        } : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error promoting contact to team member:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/{id}/properties:
 *   get:
 *     summary: Get properties associated with a contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of properties associated with the contact
 *       404:
 *         description: Contact not found
 */
router.get('/:id/properties', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Verify ownership of contact
    const contact = await contactService.getContactForUser(id, userId);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const propertyAssignments = await propertyContactService.getContactProperties(id);

    res.json({
      success: true,
      data: propertyAssignments,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching contact properties:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/{id}:
 *   get:
 *     summary: Get contact by ID
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contact details
 *       404:
 *         description: Contact not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const contact = await contactService.getContactForUser(id, userId);

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    res.json({
      success: true,
      data: contact,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts:
 *   post:
 *     summary: Create a new contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [broker, buyer, seller, wholesaler, other]
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               company:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zip:
 *                 type: string
 *               notes:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, archived]
 *     responses:
 *       201:
 *         description: Contact created successfully
 *       400:
 *         description: Invalid request data
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const contactData = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!contactData.name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const contact = await contactService.createContact(userId, contactData);

    res.status(201).json({
      success: true,
      data: contact,
      message: 'Contact created successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/{id}:
 *   patch:
 *     summary: Update a contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Contact updated successfully
 *       404:
 *         description: Contact not found
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Verify ownership
    const existing = await contactService.getContactForUser(id, userId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const contact = await contactService.updateContact(id, updates);

    res.json({
      success: true,
      data: contact,
      message: 'Contact updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/{id}:
 *   delete:
 *     summary: Delete a contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contact deleted successfully
 *       404:
 *         description: Contact not found
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Verify ownership
    const existing = await contactService.getContactForUser(id, userId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    await contactService.deleteContact(id);

    res.json({
      success: true,
      message: 'Contact deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/contacts/bulk:
 *   post:
 *     summary: Bulk import contacts
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contacts:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Contacts imported successfully
 */
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { contacts } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ success: false, error: 'Contacts array is required' });
    }

    const imported = await contactService.bulkImport(userId, contacts);

    res.status(201).json({
      success: true,
      data: imported,
      message: `${imported.length} contacts imported successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error bulk importing contacts:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// Contact Activity Routes
// ============================================================================

/**
 * @swagger
 * /api/contacts/{contactId}/activities:
 *   get:
 *     summary: Get activity timeline for a contact
 *     description: Returns all communications (calls, emails, SMS, notes) for a contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *           description: Comma-separated list of activity types (call,email,sms,note,meeting,task,voicemail)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Activity timeline retrieved successfully
 */
router.get('/:contactId/activities', async (req: Request, res: Response) => {
  try {
    const contactId = parseInt(req.params.contactId, 10);
    const {
      types,
      limit = '50',
      offset = '0',
      startDate,
      endDate,
    } = req.query;

    const contact = await Contact.findByPk(contactId);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const typeFilter = types
      ? (types as string).split(',').filter(t =>
          ['call', 'email', 'sms', 'note', 'meeting', 'task', 'voicemail'].includes(t)
        ) as ActivityType[]
      : undefined;

    const { activities, total } = await ContactActivity.getTimeline(contactId, {
      types: typeFilter,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: {
        contact: { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone },
        activities: activities.map(a => ({
          id: a.id,
          type: a.type,
          direction: a.direction,
          status: a.status,
          subject: a.subject,
          content: a.content,
          summary: a.summary,
          callSid: a.callSid,
          callDuration: a.callDuration,
          callRecordingUrl: a.callRecordingUrl,
          callOutcome: a.callOutcome,
          emailMessageId: a.emailMessageId,
          emailFrom: a.emailFrom,
          emailTo: a.emailTo,
          smsSid: a.smsSid,
          smsFrom: a.smsFrom,
          smsTo: a.smsTo,
          dealId: a.dealId,
          propertyId: a.propertyId,
          createdAt: a.createdAt,
          completedAt: a.completedAt,
        })),
        pagination: { total, limit: parseInt(limit as string, 10), offset: parseInt(offset as string, 10) },
      },
    });
  } catch (error) {
    console.error('Error getting contact activities:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * @swagger
 * /api/contacts/{contactId}/activities/summary:
 *   get:
 *     summary: Get activity summary for a contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Activity summary retrieved successfully
 */
router.get('/:contactId/activities/summary', async (req: Request, res: Response) => {
  try {
    const contactId = parseInt(req.params.contactId, 10);
    const contact = await Contact.findByPk(contactId);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const summary = await ContactActivity.getSummary(contactId);
    res.json({
      success: true,
      data: { contact: { id: contact.id, name: contact.name }, summary },
    });
  } catch (error) {
    console.error('Error getting activity summary:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * @swagger
 * /api/contacts/{contactId}/activities/note:
 *   post:
 *     summary: Add a note to a contact's activity log
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               subject:
 *                 type: string
 *     responses:
 *       201:
 *         description: Note added successfully
 */
router.post('/:contactId/activities/note', async (req: Request, res: Response) => {
  try {
    const contactId = parseInt(req.params.contactId, 10);
    const { content, subject, dealId, propertyId } = req.body;
    const userId = req.user?.id;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Note content is required' });
    }

    const contact = await Contact.findByPk(contactId);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const activity = await ContactActivity.logNote({
      contactId,
      content,
      subject,
      userId,
      dealId,
      propertyId,
    });

    res.status(201).json({
      success: true,
      data: { id: activity.id, type: activity.type, content: activity.content, createdAt: activity.createdAt },
    });
  } catch (error) {
    console.error('Error adding contact note:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ===========================================================================
// CONTACT NOTES ROUTES
// ===========================================================================

/**
 * @swagger
 * /api/contacts/{id}/notes:
 *   get:
 *     summary: Get all notes for a contact
 *     tags: [Contacts, Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contact ID
 *     responses:
 *       200:
 *         description: List of notes with author info
 */
router.get('/:id/notes', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Verify ownership
    const contact = await contactService.getContactForUser(id, userId);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const notes = await contactNoteService.getNotesForContact(id, organizationId);

    res.json({
      success: true,
      data: notes,
      count: notes.length,
    });
  } catch (error) {
    console.error('Error fetching contact notes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch notes',
    });
  }
});

/**
 * @swagger
 * /api/contacts/{id}/notes:
 *   post:
 *     summary: Create a new note on a contact
 *     tags: [Contacts, Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contact ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The note content
 *               subject:
 *                 type: string
 *                 description: Optional note title/subject
 *     responses:
 *       201:
 *         description: Note created successfully
 */
router.post('/:id/notes', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Verify ownership
    const contact = await contactService.getContactForUser(id, userId);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const { content, subject } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Note content is required',
      });
    }

    const note = await contactNoteService.createNote({
      contactId: id,
      userId,
      organizationId,
      content: content.trim(),
      subject: subject?.trim(),
    });

    res.status(201).json({
      success: true,
      data: note,
      message: 'Note created successfully',
    });
  } catch (error) {
    console.error('Error creating contact note:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create note',
    });
  }
});

/**
 * @swagger
 * /api/contacts/{id}/notes/{noteId}:
 *   patch:
 *     summary: Update a note (author only)
 *     tags: [Contacts, Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               subject:
 *                 type: string
 *     responses:
 *       200:
 *         description: Note updated successfully
 *       403:
 *         description: Only the author can edit this note
 */
router.patch('/:id/notes/:noteId', async (req: Request, res: Response) => {
  try {
    const noteId = parseInt(req.params.noteId, 10);
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (isNaN(noteId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid note ID',
      });
    }

    const { content, subject } = req.body;
    const updates: { content?: string; subject?: string } = {};

    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Note content cannot be empty',
        });
      }
      updates.content = content.trim();
    }

    if (subject !== undefined) {
      updates.subject = subject?.trim() || undefined;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid updates provided',
      });
    }

    const note = await contactNoteService.updateNote(noteId, userId, organizationId, updates);

    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
      });
    }

    res.json({
      success: true,
      data: note,
      message: 'Note updated successfully',
    });
  } catch (error) {
    console.error('Error updating contact note:', error);

    // Check if it's an authorization error
    if (error instanceof Error && error.message.includes('Only the author')) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update note',
    });
  }
});

/**
 * @swagger
 * /api/contacts/{id}/notes/{noteId}:
 *   delete:
 *     summary: Delete a note (author only)
 *     tags: [Contacts, Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Note deleted successfully
 *       403:
 *         description: Only the author can delete this note
 */
router.delete('/:id/notes/:noteId', async (req: Request, res: Response) => {
  try {
    const noteId = parseInt(req.params.noteId, 10);
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (isNaN(noteId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid note ID',
      });
    }

    const deleted = await contactNoteService.deleteNote(noteId, userId, organizationId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
      });
    }

    res.json({
      success: true,
      message: 'Note deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting contact note:', error);

    // Check if it's an authorization error
    if (error instanceof Error && error.message.includes('Only the author')) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete note',
    });
  }
});

// ===========================================================================
// SIGNATURE ROUTES
// ===========================================================================

/**
 * @swagger
 * /api/contacts/{id}/request-signature:
 *   post:
 *     summary: Request a signature from a contact
 *     description: Send an SMS to the contact with a link to upload their signature
 *     tags: [Contacts, Signatures]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contact ID
 *     responses:
 *       201:
 *         description: Signature request created and SMS sent
 *       400:
 *         description: Contact has no phone number or request already pending
 */
router.post('/:id/request-signature', signatureContactRoutes.requestSignature);

/**
 * @swagger
 * /api/contacts/{id}/signature:
 *   get:
 *     summary: Get a contact's signature
 *     description: Get the signature URL for a contact
 *     tags: [Contacts, Signatures]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contact ID
 *     responses:
 *       200:
 *         description: Signature details
 */
router.get('/:id/signature', signatureContactRoutes.getContactSignature);

/**
 * @swagger
 * /api/contacts/{id}/signature:
 *   delete:
 *     summary: Delete a contact's signature
 *     description: Remove the signature from a contact's profile
 *     tags: [Contacts, Signatures]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contact ID
 *     responses:
 *       200:
 *         description: Signature deleted
 */
router.delete('/:id/signature', signatureContactRoutes.deleteContactSignature);

/**
 * @swagger
 * /api/contacts/{id}/signature-request:
 *   get:
 *     summary: Get pending signature request for a contact
 *     description: Check if there's a pending signature request for this contact
 *     tags: [Contacts, Signatures]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contact ID
 *     responses:
 *       200:
 *         description: Pending request details or null
 */
router.get('/:id/signature-request', signatureContactRoutes.getPendingRequest);

export default router;
