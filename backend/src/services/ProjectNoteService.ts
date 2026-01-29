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
    const note = await ProjectNote.create({
      projectId: input.projectId,
      userId: input.userId,
      organizationId: input.organizationId,
      content: input.content,
      subject: input.subject,
    });

    // Queue recap update (non-blocking)
    projectRecapService.queueUpdate(input.projectId);

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

    await note.update(updateData);

    // Queue recap update (non-blocking)
    projectRecapService.queueUpdate(note.projectId);

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
