/**
 * Deal Note Service
 *
 * Manages notes on deals/properties with team member attribution.
 */

import DealNote from '../models/DealNote';
import { MarketplaceUser } from '../models';
import { dealActivityNotificationService } from './DealActivityNotificationService';

export interface CreateNoteInput {
  propertyId: number;
  userId: string;
  organizationId: string;
  content: string;
  subject?: string;
}

export interface UpdateNoteInput {
  content?: string;
  subject?: string;
}

export interface NoteWithAuthor {
  id: number;
  propertyId: number;
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

class DealNoteService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('  DealNoteService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Create a new note on a deal
   */
  async createNote(input: CreateNoteInput): Promise<NoteWithAuthor> {
    const note = await DealNote.create({
      propertyId: input.propertyId,
      userId: input.userId,
      organizationId: input.organizationId,
      content: input.content,
      subject: input.subject,
    });

    // Fetch with author info
    const noteWithAuthor = await this.getNoteById(note.id, input.organizationId) as NoteWithAuthor;

    // Notify team members of new note
    dealActivityNotificationService.notifyOfNewNote(
      input.propertyId,
      input.organizationId,
      {
        authorName: noteWithAuthor.author.name,
        preview: input.content,
        subject: input.subject,
      },
      input.userId
    ).catch((err) => console.warn('Failed to send note notification:', err.message));

    return noteWithAuthor;
  }

  /**
   * Get all notes for a property
   */
  async getNotesForProperty(
    propertyId: number,
    organizationId: string
  ): Promise<NoteWithAuthor[]> {
    const notes = await DealNote.findAll({
      where: { propertyId, organizationId },
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
  ): Promise<NoteWithAuthor | null> {
    const note = await DealNote.findOne({
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
    updates: UpdateNoteInput
  ): Promise<NoteWithAuthor | null> {
    const note = await DealNote.findOne({
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
    const note = await DealNote.findOne({
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
   * Get note count for a property
   */
  async getNoteCount(propertyId: number, organizationId: string): Promise<number> {
    return DealNote.count({
      where: { propertyId, organizationId },
    });
  }

  /**
   * Format note with author name
   */
  private formatNoteWithAuthor(note: DealNote): NoteWithAuthor {
    const author = note.author || { id: note.userId };
    const name = (author as any).name || (author as any).email || 'Unknown';
    const email = (author as any).email || '';

    return {
      id: note.id,
      propertyId: note.propertyId,
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

export const dealNoteService = new DealNoteService();
export default dealNoteService;
