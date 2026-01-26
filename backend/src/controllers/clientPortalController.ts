/**
 * Client Portal Controller
 *
 * Handles API requests for the client portal functionality.
 */

import { Request, Response } from 'express';
import { clientPortalService } from '../services/ClientPortalService';
import Project from '../models/Project';

export const clientPortalController = {
  // ============================================================================
  // PUBLIC ENDPOINTS (No Auth Required)
  // ============================================================================

  /**
   * Get invite details by token
   * GET /api/client/invite/:token
   */
  async getInviteDetails(req: Request, res: Response) {
    try {
      const { token } = req.params;

      const invite = await clientPortalService.getInviteByToken(token);
      if (!invite) {
        return res.status(404).json({
          success: false,
          error: 'Invite not found',
        });
      }

      res.json({
        success: true,
        data: invite,
      });
    } catch (error) {
      console.error('Error getting invite details:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Accept invite and register new client
   * POST /api/client/invite/:token/accept
   */
  async acceptInvite(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({
          success: false,
          error: 'Email, password, and name are required',
        });
      }

      const result = await clientPortalService.acceptInvite(token, {
        email,
        password,
        name,
      });

      res.json({
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
          },
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      console.error('Error accepting invite:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // CLIENT AUTH ENDPOINTS
  // ============================================================================

  /**
   * Get current client profile
   * GET /api/client/auth/me
   */
  async getClientProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      const projects = await clientPortalService.getClientProjects(userId);

      res.json({
        success: true,
        data: {
          user: (req as any).user,
          projectCount: projects.length,
        },
      });
    } catch (error) {
      console.error('Error getting client profile:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // CLIENT PORTAL ENDPOINTS (Authenticated)
  // ============================================================================

  /**
   * List all projects client has access to
   * GET /api/client/projects
   */
  async getClientProjects(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      const projects = await clientPortalService.getClientProjects(userId);

      res.json({
        success: true,
        data: projects.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          logoUrl: p.logoUrl,
          status: p.status,
          updatedAt: p.updatedAt,
        })),
      });
    } catch (error) {
      console.error('Error getting client projects:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get project details (if client has access)
   * GET /api/client/projects/:id
   */
  async getProject(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { id: projectId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      // Verify client has access
      const access = await clientPortalService.verifyClientAccess(userId, projectId);
      if (!access) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this project',
        });
      }

      const project = await Project.findByPk(projectId);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
        });
      }

      res.json({
        success: true,
        data: {
          id: project.id,
          title: project.title,
          description: project.description,
          logoUrl: project.logoUrl,
          status: project.status,
          hasGitHub: !!project.githubUrl,
          updatedAt: project.updatedAt,
        },
      });
    } catch (error) {
      console.error('Error getting project:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get project issues
   * GET /api/client/projects/:id/issues
   */
  async getProjectIssues(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { id: projectId } = req.params;
      const { state = 'all', page = '1', per_page = '30' } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      // Verify client has access
      const access = await clientPortalService.verifyClientAccess(userId, projectId);
      if (!access) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this project',
        });
      }

      const issues = await clientPortalService.getProjectIssues(projectId, {
        state: state as 'open' | 'closed' | 'all',
        page: parseInt(page as string, 10),
        perPage: parseInt(per_page as string, 10),
      });

      res.json({
        success: true,
        data: issues,
      });
    } catch (error) {
      console.error('Error getting project issues:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get a single issue
   * GET /api/client/projects/:id/issues/:number
   */
  async getProjectIssue(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { id: projectId, number: issueNumber } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      // Verify client has access
      const access = await clientPortalService.verifyClientAccess(userId, projectId);
      if (!access) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this project',
        });
      }

      const issue = await clientPortalService.getProjectIssue(
        projectId,
        parseInt(issueNumber, 10)
      );

      if (!issue) {
        return res.status(404).json({
          success: false,
          error: 'Issue not found',
        });
      }

      res.json({
        success: true,
        data: issue,
      });
    } catch (error) {
      console.error('Error getting issue:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Submit a new issue
   * POST /api/client/projects/:id/issues
   */
  async submitIssue(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { id: projectId } = req.params;
      const { title, description } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      if (!title) {
        return res.status(400).json({
          success: false,
          error: 'Title is required',
        });
      }

      // Verify client has access
      const access = await clientPortalService.verifyClientAccess(userId, projectId);
      if (!access) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this project',
        });
      }

      const issue = await clientPortalService.submitIssue(
        projectId,
        userId,
        title,
        description || ''
      );

      res.status(201).json({
        success: true,
        data: issue,
      });
    } catch (error) {
      console.error('Error submitting issue:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get project pull requests
   * GET /api/client/projects/:id/prs
   */
  async getProjectPullRequests(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { id: projectId } = req.params;
      const { state = 'all', page = '1', per_page = '30' } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      // Verify client has access
      const access = await clientPortalService.verifyClientAccess(userId, projectId);
      if (!access) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this project',
        });
      }

      const prs = await clientPortalService.getProjectPullRequests(projectId, {
        state: state as 'open' | 'closed' | 'all',
        page: parseInt(page as string, 10),
        perPage: parseInt(per_page as string, 10),
      });

      res.json({
        success: true,
        data: prs,
      });
    } catch (error) {
      console.error('Error getting pull requests:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get project commits
   * GET /api/client/projects/:id/commits
   */
  async getProjectCommits(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { id: projectId } = req.params;
      const { page = '1', per_page = '30' } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      // Verify client has access
      const access = await clientPortalService.verifyClientAccess(userId, projectId);
      if (!access) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this project',
        });
      }

      const commits = await clientPortalService.getProjectCommits(projectId, {
        page: parseInt(page as string, 10),
        perPage: parseInt(per_page as string, 10),
      });

      res.json({
        success: true,
        data: commits,
      });
    } catch (error) {
      console.error('Error getting commits:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get project activity feed
   * GET /api/client/projects/:id/activity
   */
  async getProjectActivity(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { id: projectId } = req.params;
      const { limit = '20' } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      // Verify client has access
      const access = await clientPortalService.verifyClientAccess(userId, projectId);
      if (!access) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this project',
        });
      }

      const activity = await clientPortalService.getProjectActivity(
        projectId,
        parseInt(limit as string, 10)
      );

      res.json({
        success: true,
        data: activity,
      });
    } catch (error) {
      console.error('Error getting activity:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // ADMIN ENDPOINTS (Project Owners)
  // ============================================================================

  /**
   * List clients for a project
   * GET /api/projects/:id/clients
   */
  async listProjectClients(req: Request, res: Response) {
    try {
      const { id: projectId } = req.params;

      const clients = await clientPortalService.getProjectClients(projectId);

      res.json({
        success: true,
        data: clients.map((c) => ({
          id: c.id,
          clientUserId: c.clientUserId,
          clientEmail: c.clientEmail,
          clientName: c.clientName,
          status: c.status,
          invitedAt: c.invitedAt,
          acceptedAt: c.acceptedAt,
          lastAccessedAt: c.lastAccessedAt,
          expiresAt: c.expiresAt,
        })),
      });
    } catch (error) {
      console.error('Error listing clients:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Generate invite link for a project
   * POST /api/projects/:id/clients/invite
   */
  async generateInvite(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { id: projectId } = req.params;
      const { clientEmail, expiresInDays, sendEmail = true } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      const result = await clientPortalService.generateInvite(projectId, userId, {
        clientEmail,
        expiresInDays,
        sendEmail,
      });

      res.status(201).json({
        success: true,
        data: {
          inviteToken: result.token,
          inviteUrl: result.url,
          emailSent: result.emailSent,
          expiresAt: expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    } catch (error) {
      console.error('Error generating invite:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Revoke client access
   * DELETE /api/projects/:id/clients/:clientId
   */
  async revokeClientAccess(req: Request, res: Response) {
    try {
      const { id: projectId, clientId } = req.params;

      await clientPortalService.revokeInvite(projectId, parseInt(clientId, 10));

      res.json({
        success: true,
        message: 'Client access revoked',
      });
    } catch (error) {
      console.error('Error revoking access:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },
};

export default clientPortalController;
