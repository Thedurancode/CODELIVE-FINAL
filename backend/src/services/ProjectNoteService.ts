/**
 * Project Note Service
 *
 * Business logic for managing notes on projects:
 * - Create/update/delete notes
 * - Author-only edit/delete permissions
 * - Organization-wide visibility
 */

import ProjectNote from '../models/ProjectNote';
import MarketplaceUser from '../models/MarketplaceUser';
import { projectRecapService } from './ProjectRecapService';
import { noteMentionService } from './NoteMentionService';

// Interfaces
interface CreateNoteInput {
  projectId: string;
  userId: string;
  organizationId: string;
  content: string;
  subject?: string;
}

interface UpdateNoteInput {
  content?: string;
  subject?: string | null;
}

interface ProjectNoteWithAuthor extends ProjectNote {
  author?: {
    id: string;
    name?: string;
    email?: string;
  };
}

class ProjectNoteService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('ProjectNoteService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Create a new note on a project
   */
  async createNote(input: CreateNoteInput): Promise<ProjectNoteWithAuthor> {
    // Process @mentions in content
    const mentionedUserIds = await noteMentionService.processMentions(
      input.content,
      input.organizationId
    );

    const note = await ProjectNote.create({
      projectId: input.projectId,
      userId: input.userId,
      organizationId: input.organizationId,
      content: input.content,
      subject: input.subject,
      mentions: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
    });

    // Queue recap update (non-blocking)
    projectRecapService.queueUpdate(input.projectId);

    // Send mention notifications (non-blocking)
    if (mentionedUserIds.length > 0) {
      noteMentionService
        .notifyMentionedUsers(note.id, { sendEmail: true, sendSms: false })
        .catch((err) => console.error('[ProjectNoteService] Mention notification error:', err));
    }

    // Fetch with author
    return this.getNoteById(note.id, input.organizationId) as Promise<ProjectNoteWithAuthor>;
  }

  /**
   * Get all notes for a project
   */
  async getNotesForProject(
    projectId: string,
    organizationId: string
  ): Promise<ProjectNoteWithAuthor[]> {
    const notes = await ProjectNote.findAll({
      where: { projectId, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return notes as ProjectNoteWithAuthor[];
  }

  /**
   * Get a single note by ID
   */
  async getNoteById(
    noteId: number,
    organizationId: string
  ): Promise<ProjectNoteWithAuthor | null> {
    const note = await ProjectNote.findOne({
      where: { id: noteId, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    return note as ProjectNoteWithAuthor | null;
  }

  /**
   * Update a note (author only)
   */
  async updateNote(
    noteId: number,
    userId: string,
    organizationId: string,
    updates: UpdateNoteInput
  ): Promise<ProjectNoteWithAuthor | null> {
    const note = await ProjectNote.findOne({
      where: { id: noteId, organizationId },
    });

    if (!note) return null;

    // Check if user is the author
    if (note.userId !== userId) {
      throw new Error('Only the author can update this note');
    }

    const updateData: Partial<ProjectNote> = {};
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.subject !== undefined) updateData.subject = updates.subject || undefined;

    // Process @mentions if content changed
    let newMentions: string[] = [];
    if (updates.content !== undefined) {
      newMentions = await noteMentionService.processMentions(
        updates.content,
        organizationId
      );
      updateData.mentions = newMentions.length > 0 ? newMentions : [];

      // Check for newly added mentions
      const previousMentions = note.mentions || [];
      const addedMentions = newMentions.filter((id) => !previousMentions.includes(id));

      // Reset notification flag if new mentions were added
      if (addedMentions.length > 0) {
        updateData.mentionNotificationsSent = false;
      }
    }

    await note.update(updateData as any);

    // Queue recap update (non-blocking)
    projectRecapService.queueUpdate(note.projectId);

    // Send notifications for new mentions (non-blocking)
    if (updates.content !== undefined && newMentions.length > 0 && !note.mentionNotificationsSent) {
      noteMentionService
        .notifyMentionedUsers(noteId, { sendEmail: true, sendSms: false })
        .catch((err) => console.error('[ProjectNoteService] Mention notification error:', err));
    }

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
    const note = await ProjectNote.findOne({
      where: { id: noteId, organizationId },
    });

    if (!note) return false;

    // Check if user is the author
    if (note.userId !== userId) {
      throw new Error('Only the author can delete this note');
    }

    const projectId = note.projectId;
    await note.destroy();

    // Queue recap update (non-blocking)
    projectRecapService.queueUpdate(projectId);

    return true;
  }

  /**
   * Get note count for a project
   */
  async getNoteCount(projectId: string, organizationId: string): Promise<number> {
    return ProjectNote.count({
      where: { projectId, organizationId },
    });
  }

  /**
   * Get recent notes across all projects for an organization
   */
  async getRecentNotes(
    organizationId: string,
    limit: number = 10
  ): Promise<ProjectNoteWithAuthor[]> {
    const notes = await ProjectNote.findAll({
      where: { organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
    });

    return notes as ProjectNoteWithAuthor[];
  }
}

export const projectNoteService = new ProjectNoteService();
export { CreateNoteInput, UpdateNoteInput, ProjectNoteWithAuthor };
