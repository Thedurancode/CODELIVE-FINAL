/**
 * Project Controller
 *
 * API endpoints for project management:
 * - CRUD operations for projects
 * - Contact management
 * - Notes management
 * - Task integration
 */

import { Request, Response } from 'express';
import { projectService } from '../services/ProjectService';
import { projectContactService } from '../services/ProjectContactService';
import { projectNoteService } from '../services/ProjectNoteService';
import { projectNoteAudioService } from '../services/ProjectNoteAudioService';
import { projectNoteAttachmentService } from '../services/ProjectNoteAttachmentService';
import { projectEnvVariableService } from '../services/ProjectEnvVariableService';
import { projectBrandAssetService } from '../services/ProjectBrandAssetService';
import { projectRecapService } from '../services/ProjectRecapService';
import { noteMentionService } from '../services/NoteMentionService';
import type { BrandAssetType, BrandAssetVariant } from '../models/ProjectBrandAsset';
import { taskService } from '../services/TaskService';
import { gitHubService } from '../services/GitHubService';
import type { ProjectStatus } from '../models/Project';
import ProjectMember from '../models/ProjectMember';
import { MarketplaceUser } from '../models';
import DocuSealSubmission from '../models/DocuSealSubmission';
import ContractSigner from '../models/ContractSigner';
import Contact from '../models/Contact';
import { docuSealService } from '../services/DocuSealService';

// Permission mapping for project roles to GitHub permissions
type GitHubPermission = 'pull' | 'push' | 'admin' | 'maintain' | 'triage';
const PROJECT_ROLE_TO_GITHUB_PERMISSION: Record<string, GitHubPermission> = {
  owner: 'admin',
  lead: 'maintain',
  manager: 'maintain',
  developer: 'push',
  designer: 'push',
  contributor: 'push',
  viewer: 'pull',
};

/**
 * Auto-invite a project member to GitHub repository
 * This runs async and doesn't block the response
 */
async function autoInviteMemberToGitHub(
  projectId: string,
  memberId: number,
  userId: string,
  githubUrl: string | null | undefined,
  projectRole: string
): Promise<void> {
  if (!githubUrl || !gitHubService.isConfigured()) {
    return;
  }

  try {
    // Parse GitHub URL
    const parsed = gitHubService.parseGitHubUrl(githubUrl);
    if (!parsed) {
      console.log(`Could not parse GitHub URL: ${githubUrl}`);
      return;
    }

    // Get user's email for the invite
    const user = await MarketplaceUser.findByPk(userId, {
      attributes: ['email', 'name'],
    });

    if (!user?.email) {
      console.log(`User ${userId} has no email, cannot invite to GitHub`);
      return;
    }

    // Map project role to GitHub permission
    const permission = PROJECT_ROLE_TO_GITHUB_PERMISSION[projectRole] || 'pull';

    // Send invite
    const result = await gitHubService.inviteCollaboratorByEmail(
      parsed.owner,
      parsed.repo,
      user.email,
      permission
    );

    // Update project member record
    const projectMember = await ProjectMember.findByPk(memberId);
    if (projectMember && result.success) {
      await projectMember.update({
        githubInvited: true,
        githubInvitedAt: new Date(),
      });
      console.log(`GitHub invite sent to ${user.email} for ${parsed.owner}/${parsed.repo} (${permission})`);
    } else if (!result.success) {
      console.log(`GitHub invite failed for ${user.email}: ${result.message}`);
    }
  } catch (error) {
    console.error('Failed to auto-invite member to GitHub:', error);
    // Don't throw - this is a background operation
  }
}

// ============================================================================
// PROJECTS CRUD
// ============================================================================

export const getProjects = async (req: Request, res: Response) => {
  try {
    const {
      page,
      limit,
      search,
      status,
      tags,
      createdById,
      sortBy,
      sortOrder,
    } = req.query;

    // Get all projects (shared workspace - all authenticated users can see all projects)
    const result = await projectService.getProjects({
      // No userId filter - all users can view all projects
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      status: status ? ((status as string).split(',') as ProjectStatus[]) : undefined,
      tags: tags ? (tags as string).split(',') : undefined,
      createdById: createdById as string,
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
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    // Get project by ID (user access check can be added later if needed)
    const project = await projectService.getProject(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: project,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const createProject = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    console.log('[createProject] Creating project:', { userId, body: req.body });

    const project = await projectService.createProject({
      ...req.body,
      createdById: userId,
      organizationId: null, // Legacy field - now uses createdById for access control
    });

    console.log('[createProject] Project created:', project?.id);

    res.status(201).json({
      success: true,
      data: project,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[createProject] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const updateProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await projectService.updateProject(id, undefined, req.body);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: project,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const deleteProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await projectService.deleteProject(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Project deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getProjectStats = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    const stats = await projectService.getProjectStats(organizationId);

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const searchProjects = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { q, limit } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
        timestamp: new Date().toISOString(),
      });
    }

    const projects = await projectService.searchProjects(
      organizationId,
      q as string,
      limit ? parseInt(limit as string, 10) : 10
    );

    res.json({
      success: true,
      data: projects,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getProjectTags = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    const tags = await projectService.getAllTags(organizationId);

    res.json({
      success: true,
      data: tags,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export const bulkAddTags = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { projectIds, tags } = req.body;

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Project IDs are required',
        timestamp: new Date().toISOString(),
      });
    }

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tags are required',
        timestamp: new Date().toISOString(),
      });
    }

    const updated = await projectService.bulkAddTags(organizationId, projectIds, tags);

    res.json({
      success: true,
      data: { updatedCount: updated },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const bulkRemoveTags = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { projectIds, tags } = req.body;

    const updated = await projectService.bulkRemoveTags(organizationId, projectIds, tags);

    res.json({
      success: true,
      data: { updatedCount: updated },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const bulkDelete = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { projectIds } = req.body;

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Project IDs are required',
        timestamp: new Date().toISOString(),
      });
    }

    const deleted = await projectService.bulkDelete(organizationId, projectIds);

    res.json({
      success: true,
      data: { deletedCount: deleted },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECT CONTACTS
// ============================================================================

export const getProjectContacts = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const contacts = await projectContactService.getProjectContacts(id);

    res.json({
      success: true,
      data: contacts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const addProjectContact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const { contactId, role, isPrimary, notes } = req.body;

    if (!contactId) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    const projectContact = await projectContactService.addContact({
      projectId: id,
      contactId,
      role,
      isPrimary,
      addedById: userId,
      notes,
    });

    res.status(201).json({
      success: true,
      data: projectContact,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const updateProjectContact = async (req: Request, res: Response) => {
  try {
    const { id, contactId } = req.params;
    const { role, isPrimary, notes } = req.body;

    const projectContact = await projectContactService.updateContact(id, contactId, {
      role,
      isPrimary,
      notes,
    });

    if (!projectContact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found on this project',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: projectContact,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const removeProjectContact = async (req: Request, res: Response) => {
  try {
    const { id, contactId } = req.params;

    const removed = await projectContactService.removeContact(id, contactId);
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found on this project',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Contact removed from project',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const inviteContactToGitHub = async (req: Request, res: Response) => {
  try {
    const { id: projectId, contactId } = req.params;
    const { permission } = req.body;

    const result = await projectContactService.inviteToGitHub(projectId, contactId, permission);

    if (!result.success) {
      // Determine appropriate status code
      const statusCode = result.message.includes('not found') ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        error: result.message,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECT NOTES
// ============================================================================

export const getProjectNotes = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

    const notes = await projectNoteService.getNotesForProject(id, organizationId);

    res.json({
      success: true,
      data: notes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const createProjectNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    const { content, subject } = req.body;

    console.log('[createProjectNote] Request:', { projectId: id, userId, organizationId, contentLength: content?.length });

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required',
        timestamp: new Date().toISOString(),
      });
    }

    if (!userId) {
      console.error('[createProjectNote] Missing userId');
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    // If user has no organization, we need to get the organization from the project
    let noteOrganizationId = organizationId;
    if (!noteOrganizationId) {
      console.log('[createProjectNote] User has no organization, getting from project');
      const project = await projectService.getProject(id);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
          timestamp: new Date().toISOString(),
        });
      }
      noteOrganizationId = project.organizationId;
    }

    if (!noteOrganizationId) {
      console.error('[createProjectNote] Could not determine organization');
      return res.status(400).json({
        success: false,
        error: 'Could not determine organization for note',
        timestamp: new Date().toISOString(),
      });
    }

    const note = await projectNoteService.createNote({
      projectId: id,
      userId,
      organizationId: noteOrganizationId,
      content,
      subject,
    });

    console.log('[createProjectNote] Note created:', note?.id);

    res.status(201).json({
      success: true,
      data: note,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[createProjectNote] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const updateProjectNote = async (req: Request, res: Response) => {
  try {
    const { id, noteId } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    const { content, subject } = req.body;

    const note = await projectNoteService.updateNote(
      parseInt(noteId, 10),
      userId,
      organizationId,
      { content, subject }
    );

    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: note,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if ((error as Error).message.includes('Only the author')) {
      return res.status(403).json({
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const deleteProjectNote = async (req: Request, res: Response) => {
  try {
    const { id, noteId } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;

    const deleted = await projectNoteService.deleteNote(
      parseInt(noteId, 10),
      userId,
      organizationId
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Note deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if ((error as Error).message.includes('Only the author')) {
      return res.status(403).json({
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get users that can be @mentioned in project notes
 */
export const getMentionableUsers = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID required',
        timestamp: new Date().toISOString(),
      });
    }

    const users = await noteMentionService.getMentionableUsers(organizationId);

    res.json({
      success: true,
      data: users,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECT NOTE ATTACHMENTS
// ============================================================================

export const getNoteAttachments = async (req: Request, res: Response) => {
  try {
    const { noteId } = req.params;

    const attachments = await projectNoteAttachmentService.getAttachmentsForNote(
      parseInt(noteId, 10)
    );

    res.json({
      success: true,
      data: attachments,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const uploadNoteAttachment = async (req: Request, res: Response) => {
  try {
    const { id: projectId, noteId } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        timestamp: new Date().toISOString(),
      });
    }

    const attachment = await projectNoteAttachmentService.uploadAttachment({
      noteId: parseInt(noteId, 10),
      projectId,
      userId,
      organizationId,
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
    });

    res.status(201).json({
      success: true,
      data: attachment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if ((error as Error).message === 'Note not found') {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
        timestamp: new Date().toISOString(),
      });
    }
    if ((error as Error).message.includes('exceeds maximum')) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const deleteNoteAttachment = async (req: Request, res: Response) => {
  try {
    const { attachmentId } = req.params;
    const userId = (req as any).user?.id;

    const deleted = await projectNoteAttachmentService.deleteAttachment(
      parseInt(attachmentId, 10),
      userId
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Attachment not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Attachment deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if ((error as Error).message.includes('Only the uploader')) {
      return res.status(403).json({
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getProjectAttachments = async (req: Request, res: Response) => {
  try {
    const { id: projectId } = req.params;

    const attachments = await projectNoteAttachmentService.getAttachmentsForProject(projectId);

    res.json({
      success: true,
      data: attachments,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECT AUDIO NOTES
// ============================================================================

export const getProjectAudioNotes = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

    const audioNotes = await projectNoteAudioService.getAudioNotesForProject(id, organizationId);

    res.json({
      success: true,
      data: audioNotes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const createProjectAudioNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    const file = req.file;

    console.log('[createProjectAudioNote] Request:', { projectId: id, userId, hasFile: !!file });

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided',
        timestamp: new Date().toISOString(),
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    // If user has no organization, get it from the project
    let noteOrganizationId = organizationId;
    if (!noteOrganizationId) {
      const project = await projectService.getProject(id);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
          timestamp: new Date().toISOString(),
        });
      }
      noteOrganizationId = project.organizationId;
    }

    // Get language parameter from request body
    const { language } = req.body;

    // Read file buffer
    const fs = await import('fs');
    const audioBuffer = fs.readFileSync(file.path);

    // Create audio note (will upload to Supabase and start transcription)
    const audioNote = await projectNoteAudioService.createAudioNote({
      projectId: id,
      userId,
      organizationId: noteOrganizationId,
      audioBuffer,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      language: language || undefined,
    });

    // Clean up temp file
    fs.unlink(file.path, () => {});

    console.log('[createProjectAudioNote] Audio note created:', audioNote?.id);

    res.status(201).json({
      success: true,
      data: audioNote,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[createProjectAudioNote] Error:', error);

    // Clean up temp file on error
    if (req.file?.path) {
      const fs = await import('fs');
      fs.unlink(req.file.path, () => {});
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getProjectAudioNote = async (req: Request, res: Response) => {
  try {
    const { id, audioId } = req.params;
    const organizationId = (req as any).user?.organizationId;

    const audioNote = await projectNoteAudioService.getAudioNoteById(
      parseInt(audioId, 10),
      organizationId
    );

    if (!audioNote) {
      return res.status(404).json({
        success: false,
        error: 'Audio note not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: audioNote,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const deleteProjectAudioNote = async (req: Request, res: Response) => {
  try {
    const { id, audioId } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;

    const deleted = await projectNoteAudioService.deleteAudioNote(
      parseInt(audioId, 10),
      userId,
      organizationId
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Audio note not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Audio note deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if ((error as Error).message.includes('Only the author')) {
      return res.status(403).json({
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const retryAudioNoteTranscription = async (req: Request, res: Response) => {
  try {
    const { id, audioId } = req.params;
    const organizationId = (req as any).user?.organizationId;

    const audioNote = await projectNoteAudioService.retryTranscription(
      parseInt(audioId, 10),
      organizationId
    );

    if (!audioNote) {
      return res.status(404).json({
        success: false,
        error: 'Audio note not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: audioNote,
      message: 'Transcription retry started',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECT ENVIRONMENT VARIABLES
// ============================================================================

export const getProjectEnvVariables = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

    const envVariables = await projectEnvVariableService.getEnvVariablesForProject(id, organizationId);

    res.json({
      success: true,
      data: envVariables,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const createProjectEnvVariable = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    const { name, value, description } = req.body;

    if (!name || !value) {
      return res.status(400).json({
        success: false,
        error: 'Name and value are required',
        timestamp: new Date().toISOString(),
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    // If user has no organization, get it from the project
    let envOrganizationId = organizationId;
    if (!envOrganizationId) {
      const project = await projectService.getProject(id);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
          timestamp: new Date().toISOString(),
        });
      }
      envOrganizationId = project.organizationId;
    }

    const envVariable = await projectEnvVariableService.createEnvVariable({
      projectId: id,
      userId,
      organizationId: envOrganizationId,
      name,
      value,
      description,
    });

    res.status(201).json({
      success: true,
      data: envVariable,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getProjectEnvVariableValue = async (req: Request, res: Response) => {
  try {
    const { id, envId } = req.params;
    const organizationId = (req as any).user?.organizationId;

    const value = await projectEnvVariableService.getDecryptedValue(
      parseInt(envId, 10),
      organizationId
    );

    if (value === null) {
      return res.status(404).json({
        success: false,
        error: 'Environment variable not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: { value },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const updateProjectEnvVariable = async (req: Request, res: Response) => {
  try {
    const { id, envId } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    const { name, value, description } = req.body;

    const envVariable = await projectEnvVariableService.updateEnvVariable(
      parseInt(envId, 10),
      userId,
      organizationId,
      { name, value, description }
    );

    if (!envVariable) {
      return res.status(404).json({
        success: false,
        error: 'Environment variable not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: envVariable,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if ((error as Error).message.includes('Only the author')) {
      return res.status(403).json({
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const deleteProjectEnvVariable = async (req: Request, res: Response) => {
  try {
    const { id, envId } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;

    const deleted = await projectEnvVariableService.deleteEnvVariable(
      parseInt(envId, 10),
      userId,
      organizationId
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Environment variable not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Environment variable deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if ((error as Error).message.includes('Only the author')) {
      return res.status(403).json({
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECT TASKS
// ============================================================================

export const getProjectTasks = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    const tasks = await taskService.getTasksByProject(
      id,
      status ? (status as string).split(',') as any : undefined
    );

    res.json({
      success: true,
      data: tasks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const createProjectTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;

    const task = await taskService.createTask({
      ...req.body,
      projectId: id,
      linkType: 'project',
      createdBy: userId,
      organizationId: req.body.organizationId || organizationId,
    });

    res.status(201).json({
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECT LOGO
// ============================================================================

export const uploadProjectLogo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let organizationId = (req as any).user?.organizationId;
    const file = req.file;

    console.log('[uploadProjectLogo] Request received:', { id, organizationId, hasFile: !!file, fileName: file?.originalname });

    if (!file) {
      console.log('[uploadProjectLogo] No file in request');
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        timestamp: new Date().toISOString(),
      });
    }

    // If user has no organization, get it from the project
    if (!organizationId) {
      console.log('[uploadProjectLogo] User has no organization, fetching from project');
      const existingProject = await projectService.getProject(id);
      if (existingProject) {
        organizationId = existingProject.organizationId;
      }
    }

    // Import storage service dynamically to avoid circular dependencies
    const { storageService } = await import('../services/StorageService');

    // Upload to storage with project-specific path
    const logoUrl = await storageService.uploadFile(file.path, `projects/${id}/logo`, file.originalname);

    // Update project with logo URL
    const project = await projectService.updateProject(id, organizationId, { logoUrl });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Clean up temp file
    const fs = await import('fs');
    fs.unlink(file.path, () => {});

    res.json({
      success: true,
      data: { logoUrl },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const deleteProjectLogo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

    const project = await projectService.updateProject(id, organizationId, { logoUrl: null });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Logo removed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PUBLIC PROJECT ACCESS (No auth required)
// ============================================================================

export const getPublicProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await projectService.getProject(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Return only public-safe fields
    res.json({
      success: true,
      data: {
        id: project.id,
        title: project.title,
        description: project.description,
        logoUrl: project.logoUrl,
        status: project.status,
        githubUrl: project.githubUrl ? true : false, // Just indicate if GitHub is linked, don't expose URL
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get projects for TV display (public endpoint, no auth required)
 * Returns all projects with minimal info for Roku/TV display app
 */
export const getTVDisplayProjects = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);

    // Get all projects (we'll fetch without org filter since this is public)
    const result = await projectService.getProjects({
      page: 1,
      limit,
      sortBy: 'updatedAt',
      sortOrder: 'DESC',
    });

    // Return only public-safe fields for TV display
    const tvProjects = result.data.map((project: any) => ({
      id: project.id,
      name: project.title,
      description: project.description,
      status: project.status,
      logoUrl: project.logoUrl,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
      clientName: project.clientName || null,
    }));

    res.json({
      success: true,
      data: tvProjects,
      total: result.pagination.total,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getTVDisplayProjects] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects for TV display',
      timestamp: new Date().toISOString(),
    });
  }
};

export const submitPublicTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, email, name } = req.body;

    // Validate required fields
    if (!title || !description || !email) {
      return res.status(400).json({
        success: false,
        error: 'Title, description, and email are required',
        timestamp: new Date().toISOString(),
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address',
        timestamp: new Date().toISOString(),
      });
    }

    const project = await projectService.getProject(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!project.githubUrl) {
      return res.status(400).json({
        success: false,
        error: 'This project does not accept public tickets',
        timestamp: new Date().toISOString(),
      });
    }

    // Parse GitHub URL to get owner/repo
    const githubUrlMatch = project.githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!githubUrlMatch) {
      return res.status(400).json({
        success: false,
        error: 'Invalid project configuration',
        timestamp: new Date().toISOString(),
      });
    }

    const [, owner, repo] = githubUrlMatch;
    const repoName = repo.replace(/\.git$/, '');

    // Import GitHubService
    const { gitHubService } = await import('../services/GitHubService');

    // Build issue body with submitter info
    const issueBody = `${description}

---
**Submitted via Public Form**
- **Name:** ${name || 'Not provided'}
- **Email:** ${email}

*This ticket was submitted through the public project page.*`;

    // Create the GitHub issue
    const issue = await gitHubService.createIssue(owner, repoName, {
      title,
      body: issueBody,
      labels: ['public-submission'],
    });

    res.status(201).json({
      success: true,
      data: {
        ticketNumber: issue.number,
        message: 'Your ticket has been submitted successfully. We will contact you via email.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[submitPublicTicket] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit ticket. Please try again later.',
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// NOTE TO GITHUB ISSUE
// ============================================================================

export const createGitHubIssueFromNote = async (req: Request, res: Response) => {
  try {
    const { id: projectId, noteId } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { labels } = req.body;

    // Get the project to check GitHub URL
    const project = await projectService.getProjectForOrganization(projectId, organizationId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!project.githubUrl) {
      return res.status(400).json({
        success: false,
        error: 'Project has no GitHub repository linked',
        timestamp: new Date().toISOString(),
      });
    }

    // Get the note
    const note = await projectNoteService.getNoteById(parseInt(noteId, 10), organizationId);
    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Parse GitHub URL to get owner/repo
    const githubUrlMatch = project.githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!githubUrlMatch) {
      return res.status(400).json({
        success: false,
        error: 'Invalid GitHub repository URL',
        timestamp: new Date().toISOString(),
      });
    }

    const [, owner, repo] = githubUrlMatch;
    const repoName = repo.replace(/\.git$/, '');

    // Import GitHubService
    const { gitHubService } = await import('../services/GitHubService');

    // Create the issue
    const issueTitle = note.subject || `Note from ${project.title}`;
    const issueBody = `${note.content}\n\n---\n*Created from project note in Dispotree*`;

    const issue = await gitHubService.createIssue(owner, repoName, {
      title: issueTitle,
      body: issueBody,
      labels: labels || [],
    });

    res.status(201).json({
      success: true,
      data: {
        issueNumber: issue.number,
        issueUrl: issue.html_url,
        title: issue.title,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[createGitHubIssueFromNote] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECT MEMBERS (Team Members)
// ============================================================================

/**
 * Get all team members (for team selector)
 * Returns all users since organizations were removed
 */
export const getOrganizationTeamMembers = async (req: Request, res: Response) => {
  try {
    const members = await MarketplaceUser.findAll({
      attributes: ['id', 'name', 'email', 'avatar', 'title', 'role', 'isOnline', 'onlineStatus'],
      order: [['name', 'ASC']],
    });

    res.json({
      success: true,
      data: members,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get members assigned to a project
 */
export const getProjectMembers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

    // Verify project belongs to organization
    const project = await projectService.getProjectForOrganization(id, organizationId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    const members = await ProjectMember.findAll({
      where: { projectId: id, isActive: true },
      include: [
        {
          model: MarketplaceUser,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatar', 'title', 'role', 'isOnline', 'onlineStatus'],
        },
      ],
      order: [['projectRole', 'ASC'], ['assignedAt', 'ASC']],
    });

    res.json({
      success: true,
      data: members,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Add a member to a project
 */
export const addProjectMember = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    const { memberId, projectRole, githubUsername } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        error: 'Member ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Verify project belongs to organization
    const project = await projectService.getProjectForOrganization(id, organizationId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    const role = projectRole || 'contributor';
    const member = await ProjectMember.assignToProject({
      projectId: id,
      userId: memberId,
      organizationId,
      projectRole: role,
      assignedBy: userId,
      githubUsername,
    });

    // Auto-invite to GitHub (async, don't block response)
    autoInviteMemberToGitHub(
      id,
      member.id,
      memberId,
      project.githubUrl,
      role
    ).catch((err) => console.error('GitHub auto-invite failed:', err));

    // Fetch with user details
    const memberWithUser = await ProjectMember.findByPk(member.id, {
      include: [
        {
          model: MarketplaceUser,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatar', 'title', 'role'],
        },
      ],
    });

    res.status(201).json({
      success: true,
      data: memberWithUser,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Bulk add members to a project
 */
export const bulkAddProjectMembers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    const { memberIds, projectRole } = req.body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Member IDs array is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Verify project belongs to organization
    const project = await projectService.getProjectForOrganization(id, organizationId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    const role = projectRole || 'contributor';
    const members = await ProjectMember.bulkAssignToProject(
      id,
      organizationId,
      memberIds,
      userId,
      role
    );

    // Auto-invite all members to GitHub (async, don't block response)
    if (project.githubUrl) {
      for (let i = 0; i < members.length; i++) {
        autoInviteMemberToGitHub(
          id,
          members[i].id,
          memberIds[i],
          project.githubUrl,
          role
        ).catch((err) => console.error('GitHub auto-invite failed:', err));
      }
    }

    res.status(201).json({
      success: true,
      data: { addedCount: members.length },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update a project member's role
 */
export const updateProjectMember = async (req: Request, res: Response) => {
  try {
    const { id, memberId } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { projectRole, githubUsername, notes } = req.body;

    // Verify project belongs to organization
    const project = await projectService.getProjectForOrganization(id, organizationId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    const member = await ProjectMember.findOne({
      where: { projectId: id, userId: memberId, isActive: true },
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found on project',
        timestamp: new Date().toISOString(),
      });
    }

    await member.update({
      ...(projectRole && { projectRole }),
      ...(githubUsername !== undefined && { githubUsername }),
      ...(notes !== undefined && { notes }),
    });

    const updatedMember = await ProjectMember.findByPk(member.id, {
      include: [
        {
          model: MarketplaceUser,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatar', 'title', 'role'],
        },
      ],
    });

    res.json({
      success: true,
      data: updatedMember,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Remove a member from a project
 */
export const removeProjectMember = async (req: Request, res: Response) => {
  try {
    const { id, memberId } = req.params;
    const organizationId = (req as any).user?.organizationId;

    // Verify project belongs to organization
    const project = await projectService.getProjectForOrganization(id, organizationId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    const removed = await ProjectMember.removeFromProject(id, memberId);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Member not found on project',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Member removed from project',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get AI-generated project recap
 * Returns the current recap or generates a new one if stale/missing
 */
export const getProjectRecap = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    // Get recap (will generate if needed)
    const recap = await projectRecapService.getRecap(id);

    if (recap === null) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        projectId: id,
        recap,
        updatedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getProjectRecap] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Force refresh the AI-generated project recap
 * Bypasses cache and generates a new recap immediately
 */
export const refreshProjectRecap = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userName } = req.body || {};
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    // Force refresh with optional user name for personalization
    const recap = await projectRecapService.refreshRecap(id, userName);

    if (recap === null) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        projectId: id,
        recap,
        updatedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[refreshProjectRecap] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get AI-generated recap of all recent projects
 * Returns a summary of recent activity across all projects
 */
export const getAllProjectsRecap = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { userName, limit } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    // Generate recap of recent projects
    const recap = await projectRecapService.generateAllProjectsRecap(
      userName,
      limit || 3
    );

    res.json({
      success: true,
      data: {
        recap,
        updatedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getAllProjectsRecap] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECT RECAP AUDIO (Cached TTS)
// ============================================================================

/**
 * Get cached TTS audio for project recap
 * Generates and caches audio using ElevenLabs if not already cached
 */
export const getProjectRecapAudio = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const voice = (req.query.voice as string) || 'rachel';
    const regenerate = req.query.regenerate === 'true';
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    // Import services dynamically to avoid circular dependencies
    const { elevenLabsService } = await import('../services/ElevenLabsService');
    const { supabaseStorageService } = await import('../services/SupabaseStorageService');
    const Project = (await import('../models/Project')).default;

    // Check if ElevenLabs is configured
    if (!elevenLabsService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'ElevenLabs TTS not configured. Add ELEVENLABS_API_KEY to enable.',
        timestamp: new Date().toISOString(),
      });
    }

    // Get project
    const project = await Project.findByPk(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Check if we have a cached audio URL and user doesn't want to regenerate
    if (project.aiRecapAudioUrl && !regenerate) {
      return res.json({
        success: true,
        data: {
          audioUrl: project.aiRecapAudioUrl,
          cached: true,
          recap: project.aiRecap,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Get or generate the recap text
    let recapText = project.aiRecap;
    if (!recapText) {
      // Generate recap first
      recapText = await projectRecapService.getRecap(id);
      if (!recapText) {
        return res.status(404).json({
          success: false,
          error: 'Could not generate project recap',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Generate TTS audio
    console.log(`[RecapAudio] Generating TTS for project ${id} with voice: ${voice}`);
    const voiceData = elevenLabsService.getVoice(voice);
    const audioBuffer = await elevenLabsService.textToSpeech(recapText, {
      voiceId: voiceData?.id,
    });

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const storagePath = `recap-audio/${id}/${timestamp}.mp3`;
    const uploadResult = await supabaseStorageService.uploadToPath(
      audioBuffer,
      storagePath,
      'audio/mpeg'
    );

    if (!uploadResult.success) {
      // If storage upload fails, return the audio as base64 (fallback)
      console.warn('[RecapAudio] Storage upload failed, returning base64:', uploadResult.error);
      const base64Audio = audioBuffer.toString('base64');
      return res.json({
        success: true,
        data: {
          audioUrl: `data:audio/mpeg;base64,${base64Audio}`,
          cached: false,
          recap: recapText,
          warning: 'Audio could not be cached, returned as base64',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Save the audio URL to the project
    await project.update({
      aiRecapAudioUrl: uploadResult.url,
    });

    console.log(`[RecapAudio] Audio cached for project ${id}: ${uploadResult.url}`);

    res.json({
      success: true,
      data: {
        audioUrl: uploadResult.url,
        cached: false,
        recap: recapText,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getProjectRecapAudio] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECT CONTRACTS (DocuSeal Integration)
// ============================================================================

/**
 * Get contracts associated with a project
 */
export const getProjectContracts = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    // Verify project exists
    const project = await projectService.getProject(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Build where clause
    const where: Record<string, unknown> = { projectId: id };
    if (status) {
      where.status = status;
    }

    const contracts = await DocuSealSubmission.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      data: contracts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Link an existing DocuSeal submission to a project
 */
export const linkProjectContract = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { docuSealSubmissionId } = req.body;

    if (!docuSealSubmissionId) {
      return res.status(400).json({
        success: false,
        error: 'docuSealSubmissionId is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Verify project exists
    const project = await projectService.getProject(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Find the submission by DocuSeal ID
    let submission = await DocuSealSubmission.findByDocuSealId(docuSealSubmissionId);

    // If not found locally, try to fetch from DocuSeal API and create local record
    if (!submission) {
      if (!docuSealService.isReady()) {
        return res.status(400).json({
          success: false,
          error: 'DocuSeal service is not configured',
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const dsSubmission = await docuSealService.getSubmission(docuSealSubmissionId);

        // Create local record
        submission = await DocuSealSubmission.create({
          docuSealSubmissionId: dsSubmission.id,
          templateId: dsSubmission.template.id,
          templateName: dsSubmission.template.name,
          projectId: id,
          status: dsSubmission.status === 'pending' ? 'pending' :
                  dsSubmission.status === 'completed' ? 'completed' :
                  dsSubmission.status === 'expired' ? 'expired' :
                  dsSubmission.status === 'archived' ? 'archived' : 'pending',
          submitters: dsSubmission.submitters.map((s) => ({
            id: s.id,
            email: s.email,
            name: s.name,
            role: s.role,
            status: s.status,
            sentAt: s.sent_at,
            openedAt: s.opened_at,
            completedAt: s.completed_at,
          })),
          auditLogUrl: dsSubmission.audit_log_url,
          combinedDocumentUrl: dsSubmission.combined_document_url,
          sentAt: dsSubmission.created_at ? new Date(dsSubmission.created_at) : undefined,
          completedAt: dsSubmission.completed_at ? new Date(dsSubmission.completed_at) : undefined,
          expireAt: dsSubmission.expire_at ? new Date(dsSubmission.expire_at) : undefined,
        });
      } catch (err) {
        return res.status(404).json({
          success: false,
          error: 'DocuSeal submission not found',
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      // Update existing submission with project ID
      await submission.update({ projectId: id });
    }

    res.json({
      success: true,
      data: submission,
      message: 'Contract linked to project',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Unlink a contract from a project
 */
export const unlinkProjectContract = async (req: Request, res: Response) => {
  try {
    const { id, contractId } = req.params;

    // Find the submission
    const submission = await DocuSealSubmission.findByPk(parseInt(contractId, 10));

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (submission.projectId !== id) {
      return res.status(400).json({
        success: false,
        error: 'Contract is not linked to this project',
        timestamp: new Date().toISOString(),
      });
    }

    // Remove project link (don't delete the submission)
    await submission.update({ projectId: null });

    res.json({
      success: true,
      message: 'Contract unlinked from project',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get all contract signers for a project
 */
export const getProjectSigners = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    const where: any = { projectId: id };
    if (status) {
      where.status = status;
    }

    const signers = await ContractSigner.findAll({
      where,
      include: [
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'name', 'email', 'phone'],
          required: false,
        },
        {
          model: DocuSealSubmission,
          as: 'submission',
          attributes: ['id', 'templateName', 'status', 'sentAt', 'completedAt'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    // Calculate stats
    const stats = {
      total: signers.length,
      pending: signers.filter(s => s.status === 'pending').length,
      sent: signers.filter(s => s.status === 'sent').length,
      opened: signers.filter(s => s.status === 'opened').length,
      completed: signers.filter(s => s.status === 'completed').length,
      declined: signers.filter(s => s.status === 'declined').length,
      completionRate: signers.length > 0
        ? Math.round((signers.filter(s => s.status === 'completed').length / signers.length) * 100)
        : 0,
    };

    res.json({
      success: true,
      data: signers,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// =============================================================================
// BRAND ASSETS
// =============================================================================

/**
 * Get all brand assets for a project
 */
export const getProjectBrandAssets = async (req: Request, res: Response) => {
  try {
    const { id: projectId } = req.params;
    const { assetType, variant } = req.query;
    const user = (req as any).user;

    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const assets = await projectBrandAssetService.getBrandAssetsForProject(
      projectId,
      user.organizationId,
      {
        assetType: assetType as BrandAssetType | undefined,
        variant: variant as BrandAssetVariant | undefined,
      }
    );

    res.json({ success: true, data: assets });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Create a new brand asset
 */
export const createProjectBrandAsset = async (req: Request, res: Response) => {
  try {
    const { id: projectId } = req.params;
    const { name, description, assetType, variant, isPrimary } = req.body;
    const user = (req as any).user;
    const file = req.file;

    if (!user?.id || !user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    if (!file) {
      return res.status(400).json({ success: false, error: 'File is required' });
    }

    if (!name || !assetType) {
      return res.status(400).json({ success: false, error: 'Name and assetType are required' });
    }

    const asset = await projectBrandAssetService.createBrandAsset({
      projectId,
      userId: user.id,
      organizationId: user.organizationId,
      name,
      description,
      assetType: assetType as BrandAssetType,
      variant: (variant as BrandAssetVariant) || 'default',
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      isPrimary: isPrimary === 'true' || isPrimary === true,
    });

    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Get a single brand asset
 */
export const getProjectBrandAsset = async (req: Request, res: Response) => {
  try {
    const { assetId } = req.params;
    const user = (req as any).user;

    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const asset = await projectBrandAssetService.getBrandAssetById(
      parseInt(assetId, 10),
      user.organizationId
    );

    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    res.json({ success: true, data: asset });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Update a brand asset
 */
export const updateProjectBrandAsset = async (req: Request, res: Response) => {
  try {
    const { assetId } = req.params;
    const { name, description, assetType, variant, isPrimary, sortOrder } = req.body;
    const user = (req as any).user;

    if (!user?.id || !user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const asset = await projectBrandAssetService.updateBrandAsset(
      parseInt(assetId, 10),
      user.id,
      user.organizationId,
      {
        name,
        description,
        assetType,
        variant,
        isPrimary,
        sortOrder,
      }
    );

    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    res.json({ success: true, data: asset });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only the author')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Delete a brand asset
 */
export const deleteProjectBrandAsset = async (req: Request, res: Response) => {
  try {
    const { assetId } = req.params;
    const user = (req as any).user;

    if (!user?.id || !user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const deleted = await projectBrandAssetService.deleteBrandAsset(
      parseInt(assetId, 10),
      user.id,
      user.organizationId
    );

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    res.json({ success: true, message: 'Asset deleted' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only the author')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Reorder brand assets
 */
export const reorderProjectBrandAssets = async (req: Request, res: Response) => {
  try {
    const { id: projectId } = req.params;
    const { assetIds } = req.body;
    const user = (req as any).user;

    if (!user?.organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    if (!Array.isArray(assetIds)) {
      return res.status(400).json({ success: false, error: 'assetIds must be an array' });
    }

    await projectBrandAssetService.reorderBrandAssets(projectId, user.organizationId, assetIds);

    res.json({ success: true, message: 'Assets reordered' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
