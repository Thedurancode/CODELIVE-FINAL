/**
 * Contact Service
 *
 * Handles CRUD operations for contacts (CRM functionality)
 * Contacts are organization-scoped (team-shared) not user-scoped
 */

import { Op } from 'sequelize';
import Contact from '../models/Contact';
import MarketplaceUser from '../models/MarketplaceUser';
import PropertyContact from '../models/PropertyContact';
import { complianceTriggerService } from './ComplianceTriggerService';
import { entitySearchService } from './EntitySearchService';
import { activityFeedService } from './ActivityFeedService';
import type { ContactType, ContactStatus } from '../models/Contact';

interface ContactFilters {
  page?: number;
  limit?: number;
  search?: string;
  type?: ContactType;
  status?: ContactStatus;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

interface CreateContactData {
  type?: ContactType;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  tags?: string[];
  status?: ContactStatus;
}

interface UpdateContactData {
  type?: ContactType;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  tags?: string[];
  status?: ContactStatus;
}

class ContactService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('✅ ContactService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get the organizationId for a user
   * Returns null if user has no organization (legacy users)
   */
  private async getOrganizationId(userId: string): Promise<string | null> {
    const user = await MarketplaceUser.findByPk(userId, {
      attributes: ['organizationId'],
    });
    return user?.organizationId || null;
  }

  /**
   * Get all contacts for a user's organization with filtering and pagination
   * Contacts are team-shared within an organization
   */
  async getContacts(userId: string, filters: ContactFilters = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      status,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filters;

    const offset = (page - 1) * limit;

    // Get user's organization
    const organizationId = await this.getOrganizationId(userId);

    // Build where clause - filter by organization (team-shared)
    const where: Record<string, unknown> = {};

    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      // Fallback for users without organization: show contacts they created
      where.createdById = userId;
    }

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where[Op.or as unknown as string] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { company: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Contact.findAndCountAll({
      where,
      order: [[sortBy, sortOrder]],
      limit,
      offset,
      include: [{
        model: MarketplaceUser,
        as: 'createdBy',
        attributes: ['id', 'name', 'email'],
        required: false,
      }],
    });

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Get a single contact by ID
   */
  async getContact(id: string): Promise<Contact | null> {
    return await Contact.findByPk(id, {
      include: [{
        model: MarketplaceUser,
        as: 'createdBy',
        attributes: ['id', 'name', 'email'],
        required: false,
      }],
    });
  }

  /**
   * Get contact by ID with organization access check
   * Contacts are team-shared, so any user in the same organization can access
   */
  async getContactForUser(id: string, userId: string): Promise<Contact | null> {
    const organizationId = await this.getOrganizationId(userId);

    const where: Record<string, unknown> = { id };

    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      // Fallback for users without organization
      where.createdById = userId;
    }

    return await Contact.findOne({
      where,
      include: [{
        model: MarketplaceUser,
        as: 'createdBy',
        attributes: ['id', 'name', 'email'],
        required: false,
      }],
    });
  }

  /**
   * Create a new contact
   * Contact is created under the user's organization (team-shared)
   */
  async createContact(userId: string, data: CreateContactData): Promise<Contact> {
    const organizationId = await this.getOrganizationId(userId);

    // Allow users without organization to create personal contacts
    const contact = await Contact.create({
      organizationId: organizationId || null,
      createdById: userId,
      type: data.type || 'other',
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      company: data.company || null,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      zip: data.zip || null,
      notes: data.notes || null,
      tags: data.tags || [],
      status: data.status || 'active',
    });

    // Index contact for semantic search (async, non-blocking)
    entitySearchService.indexContact(contact).catch((err) => {
      console.warn('[ContactService] Failed to index contact for search:', err.message);
    });

    // Log activity (only if user has organization)
    if (organizationId) {
      MarketplaceUser.findByPk(userId).then((user) => {
        activityFeedService.createActivity({
          organizationId,
        eventType: 'buyer_created', // Using buyer_created as generic contact event
        actor: {
          type: 'user',
          id: userId,
          name: user?.name || user?.email || 'Unknown',
        },
        resource: {
          type: 'buyer',
          id: contact.id,
          name: contact.name,
          url: `/contacts/${contact.id}`,
        },
        action: 'created',
        summary: `${user?.name || 'User'} added new contact "${contact.name}"`,
        details: { type: data.type, company: data.company },
        importance: 'normal',
      });
      }).catch(() => {}); // Non-blocking
    }

    return contact;
  }

  /**
   * Update an existing contact
   */
  async updateContact(id: string, data: UpdateContactData): Promise<Contact | null> {
    const contact = await Contact.findByPk(id);
    if (!contact) {
      return null;
    }

    // Track name/company changes for sanctions re-screening
    const previousName = contact.name;
    const previousCompany = contact.company;
    const nameChanged = data.name && data.name !== previousName;
    const companyChanged = data.company && data.company !== previousCompany;

    await contact.update(data);

    // If name or company changed, fire sanctions re-screening for all linked properties
    if (nameChanged || companyChanged) {
      this.triggerSanctionsRescreening(contact, {
        previousName,
        previousCompany,
        newName: data.name,
        newCompany: data.company,
      }).catch(err => console.warn('Contact change trigger failed:', err.message));
    }

    // Re-index contact for semantic search (async, non-blocking)
    entitySearchService.indexContact(contact).catch((err) => {
      console.warn('[ContactService] Failed to re-index contact for search:', err.message);
    });

    return contact;
  }

  /**
   * Trigger sanctions re-screening for all properties linked to a contact
   */
  private async triggerSanctionsRescreening(
    contact: Contact,
    changes: { previousName?: string | null; previousCompany?: string | null; newName?: string; newCompany?: string }
  ): Promise<void> {
    // Get all properties this contact is linked to
    const propertyLinks = await PropertyContact.findAll({
      where: { contactId: contact.id },
      attributes: ['propertyId', 'role'],
    });

    if (propertyLinks.length === 0) {
      return;
    }

    console.log(`🔍 Triggering sanctions re-screening for ${propertyLinks.length} properties due to contact change`);

    // Fire trigger for each linked property
    for (const link of propertyLinks) {
      complianceTriggerService
        .handlePropertyEvent('property.seller_changed', link.propertyId, {
          contactId: contact.id,
          contactRole: link.role,
          previousName: changes.previousName,
          newName: changes.newName,
          previousCompany: changes.previousCompany,
          newCompany: changes.newCompany,
          source: 'contact_update',
        })
        .catch(err => console.warn(`Sanctions trigger failed for property ${link.propertyId}:`, err.message));
    }
  }

  /**
   * Delete a contact
   */
  async deleteContact(id: string): Promise<boolean> {
    const deleted = await Contact.destroy({ where: { id } });
    return deleted > 0;
  }

  /**
   * Search contacts by query within the organization
   */
  async searchContacts(userId: string, query: string, limit: number = 10) {
    const organizationId = await this.getOrganizationId(userId);

    const where: Record<string, unknown> = {
      [Op.or]: [
        { name: { [Op.iLike]: `%${query}%` } },
        { email: { [Op.iLike]: `%${query}%` } },
        { company: { [Op.iLike]: `%${query}%` } },
      ],
    };

    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.createdById = userId;
    }

    return await Contact.findAll({
      where,
      limit,
      order: [['name', 'ASC']],
      include: [{
        model: MarketplaceUser,
        as: 'createdBy',
        attributes: ['id', 'name', 'email'],
        required: false,
      }],
    });
  }

  /**
   * Get contacts by type within the organization
   */
  async getContactsByType(userId: string, type: ContactType) {
    const organizationId = await this.getOrganizationId(userId);

    const where: Record<string, unknown> = { type };

    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.createdById = userId;
    }

    return await Contact.findAll({
      where,
      order: [['name', 'ASC']],
    });
  }

  /**
   * Get contact statistics for the organization
   */
  async getContactStats(userId: string) {
    const organizationId = await this.getOrganizationId(userId);

    const where: Record<string, unknown> = {};
    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.createdById = userId;
    }

    const total = await Contact.count({ where });
    const byType = await Contact.findAll({
      where,
      attributes: [
        'type',
        [Contact.sequelize!.fn('COUNT', Contact.sequelize!.col('type')), 'count'],
      ],
      group: ['type'],
      raw: true,
    });
    const byStatus = await Contact.findAll({
      where,
      attributes: [
        'status',
        [Contact.sequelize!.fn('COUNT', Contact.sequelize!.col('status')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });

    return {
      total,
      byType,
      byStatus,
    };
  }

  /**
   * Bulk import contacts into the organization
   */
  async bulkImport(userId: string, contacts: CreateContactData[]): Promise<Contact[]> {
    const organizationId = await this.getOrganizationId(userId);

    if (!organizationId) {
      throw new Error('User must belong to an organization to import contacts');
    }

    const contactsWithOrg = contacts.map((c) => ({
      ...c,
      organizationId,
      createdById: userId,
      type: c.type || 'other',
      tags: c.tags || [],
      status: c.status || 'active',
    }));

    return await Contact.bulkCreate(contactsWithOrg as any);
  }

  /**
   * Get all unique tags with counts for the organization
   */
  async getAllTags(userId: string): Promise<{ tag: string; count: number }[]> {
    const organizationId = await this.getOrganizationId(userId);

    const where: Record<string, unknown> = {};
    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.createdById = userId;
    }

    const contacts = await Contact.findAll({
      where,
      attributes: ['tags'],
      raw: true,
    });

    // Aggregate tags and counts
    const tagCounts: Record<string, number> = {};
    for (const contact of contacts) {
      const tags = (contact as any).tags || [];
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    // Convert to array and sort by count (descending)
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Add tags to multiple contacts (within the organization)
   */
  async bulkAddTags(userId: string, contactIds: string[], tagsToAdd: string[]): Promise<number> {
    const organizationId = await this.getOrganizationId(userId);

    const where: Record<string, unknown> = { id: contactIds };
    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.createdById = userId;
    }

    const contacts = await Contact.findAll({ where });

    let updatedCount = 0;
    for (const contact of contacts) {
      const currentTags = contact.tags || [];
      const newTags = [...new Set([...currentTags, ...tagsToAdd])];
      if (newTags.length !== currentTags.length) {
        await contact.update({ tags: newTags });
        updatedCount++;
      }
    }

    return updatedCount;
  }

  /**
   * Remove tags from multiple contacts (within the organization)
   */
  async bulkRemoveTags(userId: string, contactIds: string[], tagsToRemove: string[]): Promise<number> {
    const organizationId = await this.getOrganizationId(userId);

    const where: Record<string, unknown> = { id: contactIds };
    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.createdById = userId;
    }

    const contacts = await Contact.findAll({ where });

    let updatedCount = 0;
    for (const contact of contacts) {
      const currentTags = contact.tags || [];
      const newTags = currentTags.filter((t: string) => !tagsToRemove.includes(t));
      if (newTags.length !== currentTags.length) {
        await contact.update({ tags: newTags });
        updatedCount++;
      }
    }

    return updatedCount;
  }

  /**
   * Bulk delete contacts (within the organization)
   */
  async bulkDelete(userId: string, contactIds: string[]): Promise<number> {
    const organizationId = await this.getOrganizationId(userId);

    const where: Record<string, unknown> = { id: contactIds };
    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.createdById = userId;
    }

    const deleted = await Contact.destroy({ where });
    return deleted;
  }
}

export const contactService = new ContactService();
export default contactService;
