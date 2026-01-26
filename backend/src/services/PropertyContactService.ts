/**
 * Property Contact Service
 *
 * Handles assigning/unassigning contacts to properties (deals)
 */

import PropertyContact from '../models/PropertyContact';
import Contact from '../models/Contact';
import type { ContactRole } from '../models/PropertyContact';

interface AssignContactData {
  propertyId: number | string;
  contactId: string;
  role: ContactRole;
  isPrimary?: boolean;
  notes?: string;
}

class PropertyContactService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('✅ PropertyContactService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Assign a contact to a property
   */
  async assignContact(data: AssignContactData): Promise<PropertyContact> {
    const { propertyId, contactId, role, isPrimary = false, notes } = data;

    // Convert propertyId to number if it's a string
    const numericPropertyId = typeof propertyId === 'string' ? parseInt(propertyId, 10) : propertyId;

    // Check if already assigned with same role
    const existing = await PropertyContact.findOne({
      where: { propertyId: numericPropertyId, contactId, role },
    });

    if (existing) {
      // Update existing assignment
      await existing.update({ isPrimary, notes });
      return existing;
    }

    // Create new assignment
    return await PropertyContact.create({
      propertyId: numericPropertyId,
      contactId,
      role,
      isPrimary,
      notes,
    });
  }

  /**
   * Unassign a contact from a property
   */
  async unassignContact(propertyId: number | string, contactId: string, role?: ContactRole): Promise<boolean> {
    const numericPropertyId = typeof propertyId === 'string' ? parseInt(propertyId, 10) : propertyId;
    const where: Record<string, unknown> = { propertyId: numericPropertyId, contactId };
    if (role) {
      where.role = role;
    }

    const deleted = await PropertyContact.destroy({ where });
    return deleted > 0;
  }

  /**
   * Get all contacts assigned to a property
   */
  async getPropertyContacts(propertyId: number | string) {
    const numericPropertyId = typeof propertyId === 'string' ? parseInt(propertyId, 10) : propertyId;
    return await PropertyContact.findAll({
      where: { propertyId: numericPropertyId },
      include: [
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'name', 'email', 'phone', 'company', 'type', 'status', 'tags'],
        },
      ],
      order: [
        ['isPrimary', 'DESC'],
        ['role', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
  }

  /**
   * Get all properties a contact is assigned to (with full property data)
   */
  async getContactProperties(contactId: string) {
    // Import Property model here to avoid circular dependencies
    const Property = (await import('../models/Property')).default;

    return await PropertyContact.findAll({
      where: { contactId },
      include: [
        {
          model: Property,
          as: 'property',
          attributes: [
            'id', 'address', 'city', 'state', 'zip', 'county',
            'purchaseContractPrice', 'arv', 'propertyType', 'bedroomCount', 'bathroomCount',
            'livingSpaceSqFt', 'status', 'photoLinks', 'createdAt', 'updatedAt'
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Update an assignment (role, isPrimary, notes)
   */
  async updateAssignment(
    propertyId: number | string,
    contactId: string,
    updates: { role?: ContactRole; isPrimary?: boolean; notes?: string }
  ): Promise<PropertyContact | null> {
    const numericPropertyId = typeof propertyId === 'string' ? parseInt(propertyId, 10) : propertyId;
    const assignment = await PropertyContact.findOne({
      where: { propertyId: numericPropertyId, contactId },
    });

    if (!assignment) {
      return null;
    }

    await assignment.update(updates);
    return assignment;
  }

  /**
   * Set a contact as primary for their role on a property
   */
  async setPrimaryContact(propertyId: number | string, contactId: string, role: ContactRole): Promise<void> {
    const numericPropertyId = typeof propertyId === 'string' ? parseInt(propertyId, 10) : propertyId;
    // First, unset all primary flags for this role on this property
    await PropertyContact.update(
      { isPrimary: false },
      { where: { propertyId: numericPropertyId, role } }
    );

    // Then set the specified contact as primary
    await PropertyContact.update(
      { isPrimary: true },
      { where: { propertyId: numericPropertyId, contactId, role } }
    );
  }

  /**
   * Get contacts by role for a property
   */
  async getPropertyContactsByRole(propertyId: number | string, role: ContactRole) {
    const numericPropertyId = typeof propertyId === 'string' ? parseInt(propertyId, 10) : propertyId;
    return await PropertyContact.findAll({
      where: { propertyId: numericPropertyId, role },
      include: [
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'name', 'email', 'phone', 'company', 'type', 'status'],
        },
      ],
      order: [['isPrimary', 'DESC']],
    });
  }

  /**
   * Check if a contact is assigned to a property
   */
  async isContactAssigned(propertyId: number | string, contactId: string): Promise<boolean> {
    const numericPropertyId = typeof propertyId === 'string' ? parseInt(propertyId, 10) : propertyId;
    const count = await PropertyContact.count({
      where: { propertyId: numericPropertyId, contactId },
    });
    return count > 0;
  }
}

export const propertyContactService = new PropertyContactService();
export default propertyContactService;
