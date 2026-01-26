/**
 * Contact Note Service
 *
 * Manages notes on contacts with team member attribution.
 */

import ContactNote from '../models/ContactNote';
import { MarketplaceUser, Contact } from '../models';
import { activityFeedService } from './ActivityFeedService';

export interface CreateContactNoteInput {
  contactId: string;
  userId: string;
  organizationId: string;
  content: string;
  subject?: string;
}

export interface UpdateContactNoteInput {
  content?: string;
  subject?: string;
}

export interface ContactNoteWithAuthor {
  id: number;
  contactId: string;
  content: string;
  subject?: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string;
    email?: string;
  };
}

class ContactNoteService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('  ContactNoteService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Create a new note on a contact
   */
  async createNote(input: CreateContactNoteInput): Promise<ContactNoteWithAuthor> {
    const note = await ContactNote.create({
      contactId: input.contactId,
      userId: input.userId,
      organizationId: input.organizationId,
      content: input.content,
      subject: input.subject,
    });

    // Fetch with author info
    const noteWithAuthor = await this.getNoteById(note.id, input.organizationId);

    // Log activity
    Promise.all([
      MarketplaceUser.findByPk(input.userId),
      Contact.findByPk(input.contactId),
    ]).then(([user, contact]) => {
      const contactName = contact?.name || contact?.email || 'Contact';
      activityFeedService.createActivity({
        organizationId: input.organizationId,
        eventType: 'message_sent',
        actor: {
          type: 'user',
          id: input.userId,
          name: user?.name || user?.email || 'Unknown',
        },
        resource: {
          type: 'message',
          id: String(note.id),
          name: `Note on ${contactName}`,
          url: `/contacts/${input.contactId}`,
        },
        action: 'added note',
        summary: `${user?.name || 'User'} added a note on ${contactName}`,
        details: { subject: input.subject, contactId: input.contactId },
        importance: 'low',
      });
    }).catch(() => {}); // Non-blocking

    return noteWithAuthor as ContactNoteWithAuthor;
  }

  /**
   * Get all notes for a contact
   */
  async getNotesForContact(
    contactId: string,
    organizationId: string
  ): Promise<ContactNoteWithAuthor[]> {
    const notes = await ContactNote.findAll({
      where: { contactId, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return notes.map((note) => this.formatNoteWithAuthor(note));
  }

  /**
   * Get a single note by ID
   */
  async getNoteById(
    noteId: number,
    organizationId: string
  ): Promise<ContactNoteWithAuthor | null> {
    const note = await ContactNote.findOne({
      where: { id: noteId, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    if (!note) return null;
    return this.formatNoteWithAuthor(note);
  }

  /**
   * Update a note (author only)
   */
  async updateNote(
    noteId: number,
    userId: string,
    organizationId: string,
    updates: UpdateContactNoteInput
  ): Promise<ContactNoteWithAuthor | null> {
    const note = await ContactNote.findOne({
      where: { id: noteId, organizationId },
    });

    if (!note) return null;

    // Check if user is the author
    if (!note.isAuthor(userId)) {
      throw new Error('Only the author can edit this note');
    }

    await note.update(updates);

    // Fetch with author info
    return this.getNoteById(noteId, organizationId);
  }

  /**
   * Delete a note (author only)
   */
  async deleteNote(
    noteId: number,
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    const note = await ContactNote.findOne({
      where: { id: noteId, organizationId },
    });

    if (!note) return false;

    // Check if user is the author
    if (!note.isAuthor(userId)) {
      throw new Error('Only the author can delete this note');
    }

    await note.destroy();
    return true;
  }

  /**
   * Get note count for a contact
   */
  async getNoteCount(contactId: string, organizationId: string): Promise<number> {
    return ContactNote.count({
      where: { contactId, organizationId },
    });
  }

  /**
   * Format note with author name
   */
  private formatNoteWithAuthor(note: ContactNote): ContactNoteWithAuthor {
    const author = note.author || { id: note.userId };
    const name = (author as any).name || (author as any).email || 'Unknown';
    const email = (author as any).email || '';

    return {
      id: note.id,
      contactId: note.contactId,
      content: note.content,
      subject: note.subject,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      author: {
        id: (author as any).id || note.userId,
        name,
        email: email || undefined,
      },
    };
  }
}

export const contactNoteService = new ContactNoteService();
export default contactNoteService;
