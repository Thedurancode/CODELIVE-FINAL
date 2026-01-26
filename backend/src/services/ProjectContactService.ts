/**
 * Project Contact Service
 *
 * Business logic for managing contacts assigned to projects:
 * - Add/remove contacts from projects
 * - Update contact roles and notes
 * - Query contact assignments
 * - Auto-invite contacts to GitHub repositories
 */

import ProjectContact from '../models/ProjectContact';
import Contact from '../models/Contact';
import Project from '../models/Project';
import MarketplaceUser from '../models/MarketplaceUser';
import { gitHubService, CollaboratorPermission } from './GitHubService';

// Interfaces
interface AddContactData {
  projectId: string;
  contactId: string;
  role?: string;
  isPrimary?: boolean;
  addedById?: string;
  notes?: string;
}

interface UpdateContactData {
  role?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

interface ProjectContactWithRelations extends ProjectContact {
  contact?: Contact;
  project?: Project;
  addedBy?: MarketplaceUser;
}

class ProjectContactService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('ProjectContactService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get all contacts for a project
   */
  async getProjectContacts(projectId: string): Promise<ProjectContactWithRelations[]> {
    const projectContacts = await ProjectContact.findAll({
      where: { projectId },
      include: [
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'name', 'email', 'phone', 'type', 'company', 'status'],
        },
        {
          model: MarketplaceUser,
          as: 'addedBy',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [
        ['isPrimary', 'DESC'],
        ['createdAt', 'ASC'],
      ],
    });

    return projectContacts as ProjectContactWithRelations[];
  }

  /**
   * Get all projects for a contact
   */
  async getContactProjects(contactId: string): Promise<ProjectContactWithRelations[]> {
    const projectContacts = await ProjectContact.findAll({
      where: { contactId },
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'title', 'status', 'githubUrl'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return projectContacts as ProjectContactWithRelations[];
  }

  /**
   * Check if a contact is already on a project
   */
  async isContactOnProject(projectId: string, contactId: string): Promise<boolean> {
    const count = await ProjectContact.count({ where: { projectId, contactId } });
    return count > 0;
  }

  /**
   * Add a contact to a project
   * Automatically invites the contact to the project's GitHub repo if configured
   */
  async addContact(data: AddContactData): Promise<ProjectContactWithRelations> {
    // Check if already exists
    const existing = await ProjectContact.findOne({
      where: { projectId: data.projectId, contactId: data.contactId },
    });

    if (existing) {
      throw new Error('Contact is already assigned to this project');
    }

    // If this is set as primary, remove primary from others
    if (data.isPrimary) {
      await ProjectContact.update(
        { isPrimary: false },
        { where: { projectId: data.projectId } }
      );
    }

    const projectContact = await ProjectContact.create({
      projectId: data.projectId,
      contactId: data.contactId,
      role: data.role || null,
      isPrimary: data.isPrimary || false,
      addedById: data.addedById || null,
      notes: data.notes || null,
    });

    // Fetch with associations
    const result = await ProjectContact.findByPk(projectContact.id, {
      include: [
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'name', 'email', 'phone', 'type', 'company', 'status'],
        },
        {
          model: MarketplaceUser,
          as: 'addedBy',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    // Auto-invite to GitHub repo (async, don't block the response)
    this.autoInviteToGitHub(data.projectId, data.contactId, projectContact.id).catch((err) => {
      console.error('GitHub auto-invite failed:', err);
    });

    return result as ProjectContactWithRelations;
  }

  /**
   * Auto-invite a contact to the project's GitHub repository
   */
  private async autoInviteToGitHub(
    projectId: string,
    contactId: string,
    projectContactId: number
  ): Promise<void> {
    // Check if GitHub service is configured
    if (!gitHubService.isConfigured()) {
      console.log('GitHub service not configured, skipping auto-invite');
      return;
    }

    // Get project with GitHub URL
    const project = await Project.findByPk(projectId);
    if (!project?.githubUrl) {
      console.log(`Project ${projectId} has no GitHub URL, skipping auto-invite`);
      return;
    }

    // Parse GitHub URL
    const repoInfo = gitHubService.parseGitHubUrl(project.githubUrl);
    if (!repoInfo) {
      console.log(`Could not parse GitHub URL: ${project.githubUrl}`);
      return;
    }

    // Get contact with email
    const contact = await Contact.findByPk(contactId);
    if (!contact?.email) {
      console.log(`Contact ${contactId} has no email, skipping GitHub invite`);
      await ProjectContact.update(
        {
          githubInviteStatus: 'failed',
          githubInviteError: 'Contact has no email address',
        },
        { where: { id: projectContactId } }
      );
      return;
    }

    // Determine permission level based on role
    const permission = this.getGitHubPermissionForRole(contact.type);

    try {
      console.log(`Inviting ${contact.email} to ${repoInfo.owner}/${repoInfo.repo} with ${permission} permission`);

      const result = await gitHubService.inviteCollaboratorByEmail(
        repoInfo.owner,
        repoInfo.repo,
        contact.email,
        permission
      );

      if (result.success) {
        await ProjectContact.update(
          {
            githubInviteStatus: result.method === 'existing' ? 'accepted' : 'pending',
            githubInviteId: result.invitation?.id || null,
            githubInvitedAt: new Date(),
            githubInviteError: null,
          },
          { where: { id: projectContactId } }
        );
        console.log(`GitHub invite successful: ${result.message}`);
      } else {
        await ProjectContact.update(
          {
            githubInviteStatus: 'failed',
            githubInviteError: result.message,
          },
          { where: { id: projectContactId } }
        );
        console.log(`GitHub invite failed: ${result.message}`);
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      await ProjectContact.update(
        {
          githubInviteStatus: 'failed',
          githubInviteError: errorMessage,
        },
        { where: { id: projectContactId } }
      );
      console.error(`GitHub invite error: ${errorMessage}`);
    }
  }

  /**
   * Map contact type/role to GitHub permission level
   */
  private getGitHubPermissionForRole(contactType?: string): CollaboratorPermission {
    switch (contactType) {
      case 'team_member':
        return 'push'; // Write access
      case 'broker':
      case 'buyer':
      case 'seller':
      case 'attorney':
        return 'pull'; // Read-only access
      default:
        return 'pull'; // Default to read-only
    }
  }

  /**
   * Manually trigger GitHub invite for a project contact
   */
  async inviteToGitHub(
    projectId: string,
    contactId: string,
    permission?: CollaboratorPermission
  ): Promise<{ success: boolean; message: string }> {
    const projectContact = await ProjectContact.findOne({
      where: { projectId, contactId },
    });

    if (!projectContact) {
      return { success: false, message: 'Contact not found on project' };
    }

    // Check if GitHub service is configured
    if (!gitHubService.isConfigured()) {
      return { success: false, message: 'GitHub integration not configured' };
    }

    // Get project with GitHub URL
    const project = await Project.findByPk(projectId);
    if (!project?.githubUrl) {
      return { success: false, message: 'Project has no GitHub URL' };
    }

    // Parse GitHub URL
    const repoInfo = gitHubService.parseGitHubUrl(project.githubUrl);
    if (!repoInfo) {
      return { success: false, message: 'Could not parse GitHub URL' };
    }

    // Get contact with email
    const contact = await Contact.findByPk(contactId);
    if (!contact?.email) {
      return { success: false, message: 'Contact has no email address' };
    }

    const finalPermission = permission || this.getGitHubPermissionForRole(contact.type);

    try {
      const result = await gitHubService.inviteCollaboratorByEmail(
        repoInfo.owner,
        repoInfo.repo,
        contact.email,
        finalPermission
      );

      await ProjectContact.update(
        {
          githubInviteStatus: result.success
            ? (result.method === 'existing' ? 'accepted' : 'pending')
            : 'failed',
          githubInviteId: result.invitation?.id || null,
          githubInvitedAt: result.success ? new Date() : projectContact.githubInvitedAt,
          githubInviteError: result.success ? null : result.message,
        },
        { where: { id: projectContact.id } }
      );

      return { success: result.success, message: result.message };
    } catch (error) {
      const errorMessage = (error as Error).message;
      await ProjectContact.update(
        {
          githubInviteStatus: 'failed',
          githubInviteError: errorMessage,
        },
        { where: { id: projectContact.id } }
      );
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Update a contact's role/notes on a project
   */
  async updateContact(
    projectId: string,
    contactId: string,
    data: UpdateContactData
  ): Promise<ProjectContactWithRelations | null> {
    const projectContact = await ProjectContact.findOne({
      where: { projectId, contactId },
    });

    if (!projectContact) return null;

    const updates: Partial<ProjectContact> = {};

    if (data.role !== undefined) updates.role = data.role;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.isPrimary !== undefined) {
      updates.isPrimary = data.isPrimary;

      // If setting as primary, remove primary from others
      if (data.isPrimary) {
        await ProjectContact.update(
          { isPrimary: false },
          { where: { projectId, contactId: { [require('sequelize').Op.ne]: contactId } } }
        );
      }
    }

    await projectContact.update(updates);

    // Fetch with associations
    const result = await ProjectContact.findByPk(projectContact.id, {
      include: [
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'name', 'email', 'phone', 'type', 'company', 'status'],
        },
        {
          model: MarketplaceUser,
          as: 'addedBy',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    return result as ProjectContactWithRelations;
  }

  /**
   * Remove a contact from a project
   */
  async removeContact(projectId: string, contactId: string): Promise<boolean> {
    const deleted = await ProjectContact.destroy({
      where: { projectId, contactId },
    });
    return deleted > 0;
  }

  /**
   * Get the primary contact for a project
   */
  async getPrimaryContact(projectId: string): Promise<ProjectContactWithRelations | null> {
    const projectContact = await ProjectContact.findOne({
      where: { projectId, isPrimary: true },
      include: [
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'name', 'email', 'phone', 'type', 'company', 'status'],
        },
      ],
    });

    return projectContact as ProjectContactWithRelations | null;
  }

  /**
   * Set a contact as the primary contact for a project
   */
  async setPrimaryContact(projectId: string, contactId: string): Promise<boolean> {
    // Check if the contact is on the project
    const exists = await this.isContactOnProject(projectId, contactId);
    if (!exists) return false;

    // Remove primary from all
    await ProjectContact.update({ isPrimary: false }, { where: { projectId } });

    // Set the specified contact as primary
    const [updated] = await ProjectContact.update(
      { isPrimary: true },
      { where: { projectId, contactId } }
    );

    return updated > 0;
  }

  /**
   * Get contact count for a project
   */
  async getContactCount(projectId: string): Promise<number> {
    return ProjectContact.count({ where: { projectId } });
  }
}

export const projectContactService = new ProjectContactService();
export { AddContactData, UpdateContactData, ProjectContactWithRelations };
