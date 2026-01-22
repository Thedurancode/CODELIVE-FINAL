/**
 * Project Service
 *
 * Business logic for project management:
 * - CRUD operations for projects
 * - Filtering and pagination
 * - Tag management
 * - Statistics
 */

import { Op } from 'sequelize';
import Project, { ProjectStatus } from '../models/Project';
import MarketplaceUser from '../models/MarketplaceUser';
import Contact from '../models/Contact';
import ProjectContact from '../models/ProjectContact';
import ProjectNote from '../models/ProjectNote';
import Task from '../models/Task';

// Interfaces
interface ProjectFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProjectStatus | ProjectStatus[];
  tags?: string[];
  createdById?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

interface CreateProjectData {
  title: string;
  description?: string;
  githubUrl?: string;
  deploymentUrl?: string;
  status?: ProjectStatus;
  organizationId: string;
  createdById?: string;
  startDate?: Date | string;
  targetEndDate?: Date | string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface UpdateProjectData {
  title?: string;
  description?: string | null;
  logoUrl?: string | null;
  githubUrl?: string | null;
  deploymentUrl?: string | null;
  status?: ProjectStatus;
  startDate?: Date | string | null;
  targetEndDate?: Date | string | null;
  actualEndDate?: Date | string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface ProjectStats {
  total: number;
  byStatus: Record<ProjectStatus, number>;
  recentlyActive: number;
  overdue: number;
  withTasks: number;
  withContacts: number;
}

class ProjectService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('ProjectService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get projects with filtering and pagination
   */
  async getProjects(organizationId: string, filters: ProjectFilters = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      tags,
      createdById,
      sortBy = 'updatedAt',
      sortOrder = 'DESC',
    } = filters;

    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = { organizationId };

    // Status filter
    if (status) {
      where.status = Array.isArray(status) ? { [Op.in]: status } : status;
    }

    // Created by filter
    if (createdById) {
      where.createdById = createdById;
    }

    // Tags filter
    if (tags && tags.length > 0) {
      where.tags = { [Op.overlap]: tags };
    }

    // Search filter
    if (search) {
      where[Op.or as any] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Project.findAndCountAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'createdBy',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [[sortBy, sortOrder]],
      limit,
      offset,
      distinct: true,
    });

    const now = new Date();

    // Add computed fields
    const projectsWithComputed = rows.map((project) => {
      const projectJson = project.toJSON() as any;
      return {
        ...projectJson,
        isOverdue:
          project.targetEndDate &&
          new Date(project.targetEndDate) < now &&
          !['completed', 'archived', 'cancelled'].includes(project.status),
        daysUntilDue: project.targetEndDate
          ? Math.ceil((new Date(project.targetEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      };
    });

    return {
      data: projectsWithComputed,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Get a single project by ID
   */
  async getProject(id: string): Promise<Project | null> {
    return Project.findByPk(id, {
      include: [
        {
          model: MarketplaceUser,
          as: 'createdBy',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
        {
          model: Contact,
          as: 'contacts',
          through: { attributes: ['role', 'isPrimary', 'notes'] },
          required: false,
        },
      ],
    });
  }

  /**
   * Get project for a specific organization (with auth check)
   */
  async getProjectForOrganization(id: string, organizationId: string): Promise<Project | null> {
    return Project.findOne({
      where: { id, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'createdBy',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
        {
          model: Contact,
          as: 'contacts',
          through: { attributes: ['role', 'isPrimary', 'notes'] },
          required: false,
        },
      ],
    });
  }

  /**
   * Create a new project
   */
  async createProject(data: CreateProjectData): Promise<Project> {
    const project = await Project.create({
      title: data.title,
      description: data.description || null,
      githubUrl: data.githubUrl || null,
      deploymentUrl: data.deploymentUrl || null,
      status: data.status || 'active',
      organizationId: data.organizationId,
      createdById: data.createdById || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : null,
      tags: data.tags || [],
      metadata: data.metadata || null,
    });

    // Fetch with associations
    return this.getProject(project.id) as Promise<Project>;
  }

  /**
   * Update a project
   */
  async updateProject(id: string, organizationId: string, data: UpdateProjectData): Promise<Project | null> {
    const project = await Project.findOne({ where: { id, organizationId } });
    if (!project) return null;

    const updates: Partial<Project> = {};

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.logoUrl !== undefined) updates.logoUrl = data.logoUrl;
    if (data.githubUrl !== undefined) updates.githubUrl = data.githubUrl;
    if (data.deploymentUrl !== undefined) updates.deploymentUrl = data.deploymentUrl;
    if (data.status !== undefined) updates.status = data.status;
    if (data.startDate !== undefined) {
      updates.startDate = data.startDate ? new Date(data.startDate) : null;
    }
    if (data.targetEndDate !== undefined) {
      updates.targetEndDate = data.targetEndDate ? new Date(data.targetEndDate) : null;
    }
    if (data.actualEndDate !== undefined) {
      updates.actualEndDate = data.actualEndDate ? new Date(data.actualEndDate) : null;
    }
    if (data.tags !== undefined) updates.tags = data.tags;
    if (data.metadata !== undefined) updates.metadata = data.metadata;

    // If status is being set to completed, set actualEndDate if not already set
    if (data.status === 'completed' && !project.actualEndDate && !data.actualEndDate) {
      updates.actualEndDate = new Date();
    }

    await project.update(updates);

    return this.getProjectForOrganization(id, organizationId);
  }

  /**
   * Delete a project
   */
  async deleteProject(id: string, organizationId: string): Promise<boolean> {
    const deleted = await Project.destroy({
      where: { id, organizationId },
    });
    return deleted > 0;
  }

  /**
   * Get project statistics
   */
  async getProjectStats(organizationId: string): Promise<ProjectStats> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get all projects for the org
    const projects = await Project.findAll({
      where: { organizationId },
      attributes: ['id', 'status', 'targetEndDate', 'updatedAt'],
    });

    // Count by status
    const byStatus: Record<ProjectStatus, number> = {
      active: 0,
      on_hold: 0,
      completed: 0,
      archived: 0,
      cancelled: 0,
    };

    let overdue = 0;
    let recentlyActive = 0;

    for (const project of projects) {
      byStatus[project.status]++;

      // Check if overdue
      if (
        project.targetEndDate &&
        new Date(project.targetEndDate) < now &&
        !['completed', 'archived', 'cancelled'].includes(project.status)
      ) {
        overdue++;
      }

      // Check if recently active
      if (new Date(project.updatedAt) > thirtyDaysAgo) {
        recentlyActive++;
      }
    }

    // Count projects with tasks
    const projectsWithTasks = await ProjectContact.count({
      where: {},
      col: 'projectId',
      distinct: true,
    });

    // Count projects with contacts
    const projectsWithContacts = await ProjectContact.count({
      col: 'projectId',
      distinct: true,
    });

    return {
      total: projects.length,
      byStatus,
      recentlyActive,
      overdue,
      withTasks: projectsWithTasks,
      withContacts: projectsWithContacts,
    };
  }

  /**
   * Get all unique tags used across projects in an organization
   */
  async getAllTags(organizationId: string): Promise<{ tag: string; count: number }[]> {
    const projects = await Project.findAll({
      where: { organizationId },
      attributes: ['tags'],
    });

    const tagCounts: Record<string, number> = {};
    for (const project of projects) {
      for (const tag of project.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Bulk add tags to multiple projects
   */
  async bulkAddTags(organizationId: string, projectIds: string[], tags: string[]): Promise<number> {
    let updated = 0;

    for (const projectId of projectIds) {
      const project = await Project.findOne({ where: { id: projectId, organizationId } });
      if (project) {
        const existingTags = project.tags || [];
        const newTags = [...new Set([...existingTags, ...tags])];
        await project.update({ tags: newTags });
        updated++;
      }
    }

    return updated;
  }

  /**
   * Bulk remove tags from multiple projects
   */
  async bulkRemoveTags(organizationId: string, projectIds: string[], tags: string[]): Promise<number> {
    let updated = 0;

    for (const projectId of projectIds) {
      const project = await Project.findOne({ where: { id: projectId, organizationId } });
      if (project) {
        const existingTags = project.tags || [];
        const newTags = existingTags.filter((t) => !tags.includes(t));
        await project.update({ tags: newTags });
        updated++;
      }
    }

    return updated;
  }

  /**
   * Bulk delete projects
   */
  async bulkDelete(organizationId: string, projectIds: string[]): Promise<number> {
    const deleted = await Project.destroy({
      where: {
        id: { [Op.in]: projectIds },
        organizationId,
      },
    });
    return deleted;
  }

  /**
   * Search projects by title or description
   */
  async searchProjects(organizationId: string, query: string, limit: number = 10): Promise<Project[]> {
    return Project.findAll({
      where: {
        organizationId,
        [Op.or]: [
          { title: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } },
        ],
      },
      include: [
        {
          model: MarketplaceUser,
          as: 'createdBy',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      limit,
      order: [['updatedAt', 'DESC']],
    });
  }
}

export const projectService = new ProjectService();
export { ProjectFilters, CreateProjectData, UpdateProjectData, ProjectStats };
