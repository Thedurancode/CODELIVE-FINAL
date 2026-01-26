/**
 * Entity Search Service - Semantic Search for Contacts & Properties
 *
 * Uses Pinecone vector database to enable semantic search.
 * "lawyer at 141 Throop" finds contacts with role "attorney" at that property.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { Op } from 'sequelize';
import { Contact, Property, PropertyContact } from '../models';

// ============================================================================
// Types
// ============================================================================

export interface EntityVector {
  id: string;
  type: 'contact' | 'property';
  entityId: number;
  content: string; // Searchable text representation
  metadata: {
    name: string;
    type: string;
    organizationId?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    roles?: string; // For contacts: "attorney,seller,owner"
    propertyIds?: string; // Comma-separated associated property IDs
    updatedAt: string;
  };
}

export interface EntitySearchResult {
  entityId: number;
  type: 'contact' | 'property';
  name: string;
  score: number;
  metadata: EntityVector['metadata'];
}

// ============================================================================
// Service
// ============================================================================

class EntitySearchService {
  private pinecone: Pinecone | null = null;
  private openai: OpenAI | null = null;
  private indexName: string = 'dispotree-entities';
  private initialized: boolean = false;
  private embeddingModel: string = 'text-embedding-3-small';
  private embeddingDimensions: number = 1536;

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    const pineconeKey = process.env.PINECONE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!pineconeKey || !openaiKey) {
      console.warn('  Entity Search Service: Missing API keys - disabled');
      return;
    }

    try {
      this.pinecone = new Pinecone({ apiKey: pineconeKey });
      this.openai = new OpenAI({ apiKey: openaiKey });

      await this.ensureIndex();
      this.initialized = true;
      console.log(`  Entity Search Service initialized with index: ${this.indexName}`);
    } catch (error) {
      console.error('  Failed to initialize Entity Search Service:', error);
    }
  }

  /**
   * Ensure the Pinecone index exists
   */
  private async ensureIndex(): Promise<void> {
    if (!this.pinecone) return;

    try {
      const indexes = await this.pinecone.listIndexes();
      const indexExists = indexes.indexes?.some((idx) => idx.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating entity index: ${this.indexName}...`);
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: this.embeddingDimensions,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1',
            },
          },
        });

        // Wait for index to be ready
        await this.waitForIndex();
      }
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        throw error;
      }
    }
  }

  private async waitForIndex(): Promise<void> {
    if (!this.pinecone) return;

    let ready = false;
    let attempts = 0;

    while (!ready && attempts < 60) {
      const description = await this.pinecone.describeIndex(this.indexName);
      ready = description.status?.ready === true;

      if (!ready) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;
      }
    }

    if (!ready) {
      throw new Error('Entity index failed to become ready');
    }
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }

    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return response.data[0].embedding;
  }

  // ============================================================================
  // Contact Indexing
  // ============================================================================

  /**
   * Build searchable text for a contact
   */
  private async buildContactText(contact: Contact): Promise<string> {
    const parts: string[] = [];

    // Name and aliases
    parts.push(contact.name);
    if (contact.company) parts.push(`works at ${contact.company}`);

    // Type/role
    if (contact.type) parts.push(contact.type);

    // Contact info
    if (contact.phone) parts.push(`phone ${contact.phone}`);
    if (contact.email) parts.push(`email ${contact.email}`);

    // Get associated properties and roles
    const assignments = await PropertyContact.findAll({
      where: { contactId: contact.id },
      include: [{ model: Property, as: 'property' }],
      limit: 10,
    });

    const roles = new Set<string>();
    const addresses: string[] = [];

    for (const assignment of assignments) {
      if (assignment.role) roles.add(assignment.role);
      if (assignment.property) {
        const addr = this.formatPropertyAddress(assignment.property);
        if (addr) addresses.push(addr);
      }
    }

    if (roles.size > 0) {
      parts.push(`role: ${Array.from(roles).join(', ')}`);
    }

    if (addresses.length > 0) {
      parts.push(`properties: ${addresses.join('; ')}`);
    }

    // Notes (truncated)
    if (contact.notes) {
      parts.push(contact.notes.substring(0, 200));
    }

    // Tags
    if (contact.tags?.length) {
      parts.push(`tags: ${contact.tags.join(', ')}`);
    }

    return parts.join(' | ');
  }

  /**
   * Index a single contact
   */
  async indexContact(contact: Contact): Promise<void> {
    if (!this.initialized || !this.pinecone) return;

    const content = await this.buildContactText(contact);
    const embedding = await this.generateEmbedding(content);

    // Get associated property IDs and roles
    const assignments = await PropertyContact.findAll({
      where: { contactId: contact.id },
      attributes: ['propertyId', 'role'],
    });

    const propertyIds = assignments.map((a) => a.propertyId).join(',');
    const roles = [...new Set(assignments.map((a) => a.role).filter(Boolean))].join(',');

    const index = this.pinecone.index(this.indexName);

    await index.upsert([
      {
        id: `contact-${contact.id}`,
        values: embedding,
        metadata: {
          type: 'contact',
          entityId: contact.id,
          name: contact.name,
          organizationId: contact.organizationId || '',
          phone: contact.phone || '',
          email: contact.email || '',
          roles: roles || contact.type || '',
          propertyIds,
          updatedAt: new Date().toISOString(),
        },
      },
    ]);
  }

  /**
   * Index multiple contacts in batch
   */
  async indexContacts(contacts: Contact[]): Promise<number> {
    if (!this.initialized || !this.pinecone) return 0;

    const vectors = await Promise.all(
      contacts.map(async (contact) => {
        try {
          const content = await this.buildContactText(contact);
          const embedding = await this.generateEmbedding(content);

          const assignments = await PropertyContact.findAll({
            where: { contactId: contact.id },
            attributes: ['propertyId', 'role'],
          });

          const propertyIds = assignments.map((a) => a.propertyId).join(',');
          const roles = [...new Set(assignments.map((a) => a.role).filter(Boolean))].join(',');

          return {
            id: `contact-${contact.id}`,
            values: embedding,
            metadata: {
              type: 'contact',
              entityId: contact.id,
              name: contact.name,
              organizationId: contact.organizationId || '',
              phone: contact.phone || '',
              email: contact.email || '',
              roles: roles || contact.type || '',
              propertyIds,
              updatedAt: new Date().toISOString(),
            },
          };
        } catch (error) {
          console.warn(`Failed to index contact ${contact.id}:`, error);
          return null;
        }
      })
    );

    const validVectors = vectors.filter(Boolean) as any[];
    if (validVectors.length === 0) return 0;

    const index = this.pinecone.index(this.indexName);

    // Batch upsert (Pinecone limit is 100 per request)
    for (let i = 0; i < validVectors.length; i += 100) {
      const batch = validVectors.slice(i, i + 100);
      await index.upsert(batch);
    }

    return validVectors.length;
  }

  // ============================================================================
  // Property Indexing
  // ============================================================================

  /**
   * Build searchable text for a property
   */
  private buildPropertyText(property: Property): string {
    const parts: string[] = [];

    // Address
    const addr = this.formatPropertyAddress(property);
    if (addr) parts.push(addr);

    // Location
    if (property.city) parts.push(property.city);
    if (property.state) parts.push(property.state);
    if (property.zip) parts.push(property.zip);

    // Property details
    if (property.propertyType) parts.push(property.propertyType);
    if (property.bedroomCount) parts.push(`${property.bedroomCount} bed`);
    if (property.bathroomCount) parts.push(`${property.bathroomCount} bath`);

    // Price
    if (property.askingPrice) {
      parts.push(`$${property.askingPrice.toLocaleString()}`);
    }

    // Status
    if (property.status) parts.push(`status: ${property.status}`);

    // Notes (truncated)
    if (property.notes) {
      parts.push(property.notes.substring(0, 200));
    }

    return parts.join(' | ');
  }

  /**
   * Index a single property
   */
  async indexProperty(property: Property): Promise<void> {
    if (!this.initialized || !this.pinecone) return;

    const content = this.buildPropertyText(property);
    const embedding = await this.generateEmbedding(content);

    const addr = this.formatPropertyAddress(property);

    const index = this.pinecone.index(this.indexName);

    await index.upsert([
      {
        id: `property-${property.id}`,
        values: embedding,
        metadata: {
          type: 'property',
          entityId: property.id,
          name: addr || `Property ${property.id}`,
          address: addr || '',
          city: property.city || '',
          state: property.state || '',
          organizationId: property.organizationId || '',
          updatedAt: new Date().toISOString(),
        },
      },
    ]);
  }

  /**
   * Index multiple properties in batch
   */
  async indexProperties(properties: Property[]): Promise<number> {
    if (!this.initialized || !this.pinecone) return 0;

    const vectors = await Promise.all(
      properties.map(async (property) => {
        try {
          const content = this.buildPropertyText(property);
          const embedding = await this.generateEmbedding(content);
          const addr = this.formatPropertyAddress(property);

          return {
            id: `property-${property.id}`,
            values: embedding,
            metadata: {
              type: 'property',
              entityId: property.id,
              name: addr || `Property ${property.id}`,
              address: addr || '',
              city: property.city || '',
              state: property.state || '',
              organizationId: property.organizationId || '',
              updatedAt: new Date().toISOString(),
            },
          };
        } catch (error) {
          console.warn(`Failed to index property ${property.id}:`, error);
          return null;
        }
      })
    );

    const validVectors = vectors.filter(Boolean) as any[];
    if (validVectors.length === 0) return 0;

    const index = this.pinecone.index(this.indexName);

    for (let i = 0; i < validVectors.length; i += 100) {
      const batch = validVectors.slice(i, i + 100);
      await index.upsert(batch);
    }

    return validVectors.length;
  }

  // ============================================================================
  // Semantic Search
  // ============================================================================

  /**
   * Search for entities semantically
   */
  async search(
    query: string,
    options: {
      types?: ('contact' | 'property')[];
      organizationId?: string;
      topK?: number;
      minScore?: number;
    } = {}
  ): Promise<EntitySearchResult[]> {
    if (!this.initialized || !this.pinecone) {
      return [];
    }

    const { types, organizationId, topK = 5, minScore = 0.5 } = options;

    const queryEmbedding = await this.generateEmbedding(query);
    const index = this.pinecone.index(this.indexName);

    // Build filter
    const filter: Record<string, any> = {};
    if (types?.length === 1) {
      filter.type = types[0];
    } else if (types?.length) {
      filter.type = { $in: types };
    }
    if (organizationId) {
      filter.organizationId = organizationId;
    }

    const results = await index.query({
      vector: queryEmbedding,
      topK,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      includeMetadata: true,
    });

    return (results.matches || [])
      .filter((match) => (match.score || 0) >= minScore)
      .map((match) => ({
        entityId: match.metadata?.entityId as number,
        type: match.metadata?.type as 'contact' | 'property',
        name: (match.metadata?.name as string) || '',
        score: match.score || 0,
        metadata: {
          name: (match.metadata?.name as string) || '',
          type: (match.metadata?.type as string) || '',
          organizationId: match.metadata?.organizationId as string,
          phone: match.metadata?.phone as string,
          email: match.metadata?.email as string,
          address: match.metadata?.address as string,
          city: match.metadata?.city as string,
          state: match.metadata?.state as string,
          roles: match.metadata?.roles as string,
          propertyIds: match.metadata?.propertyIds as string,
          updatedAt: match.metadata?.updatedAt as string,
        },
      }));
  }

  /**
   * Search specifically for contacts
   */
  async searchContacts(
    query: string,
    options: {
      organizationId?: string;
      topK?: number;
      minScore?: number;
    } = {}
  ): Promise<EntitySearchResult[]> {
    return this.search(query, { ...options, types: ['contact'] });
  }

  /**
   * Search specifically for properties
   */
  async searchProperties(
    query: string,
    options: {
      organizationId?: string;
      topK?: number;
      minScore?: number;
    } = {}
  ): Promise<EntitySearchResult[]> {
    return this.search(query, { ...options, types: ['property'] });
  }

  // ============================================================================
  // Sync & Maintenance
  // ============================================================================

  /**
   * Full sync of all contacts and properties
   */
  async fullSync(organizationId?: string): Promise<{ contacts: number; properties: number }> {
    const where: Record<string, any> = { status: 'active' };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    // Sync contacts
    const contacts = await Contact.findAll({ where, limit: 1000 });
    const contactCount = await this.indexContacts(contacts);

    // Sync properties
    const propWhere: Record<string, any> = {};
    if (organizationId) {
      propWhere.organizationId = organizationId;
    }
    const properties = await Property.findAll({ where: propWhere, limit: 1000 });
    const propertyCount = await this.indexProperties(properties);

    console.log(`Entity sync complete: ${contactCount} contacts, ${propertyCount} properties`);

    return { contacts: contactCount, properties: propertyCount };
  }

  /**
   * Incremental sync of recently updated entities
   */
  async incrementalSync(sinceMinutes: number = 60): Promise<{ contacts: number; properties: number }> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);

    // Sync updated contacts
    const contacts = await Contact.findAll({
      where: {
        status: 'active',
        updatedAt: { [Op.gte]: since },
      },
      limit: 500,
    });
    const contactCount = await this.indexContacts(contacts);

    // Sync updated properties
    const properties = await Property.findAll({
      where: {
        updatedAt: { [Op.gte]: since },
      },
      limit: 500,
    });
    const propertyCount = await this.indexProperties(properties);

    if (contactCount > 0 || propertyCount > 0) {
      console.log(`Incremental sync: ${contactCount} contacts, ${propertyCount} properties`);
    }

    return { contacts: contactCount, properties: propertyCount };
  }

  /**
   * Delete an entity from the index
   */
  async deleteEntity(type: 'contact' | 'property', entityId: number): Promise<void> {
    if (!this.initialized || !this.pinecone) return;

    const index = this.pinecone.index(this.indexName);
    await index.deleteOne(`${type}-${entityId}`);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private formatPropertyAddress(property: Property): string {
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

    return parts.join(', ');
  }

  isReady(): boolean {
    return this.initialized;
  }
}

export const entitySearchService = new EntitySearchService();
export default entitySearchService;
