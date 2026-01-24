/**
 * Client Portal Service
 *
 * Handles client portal functionality including:
 * - Invite generation and acceptance
 * - Client access verification
 * - GitHub data fetching (issues, PRs, commits)
 * - Email notifications for invites
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import ProjectClient from '../models/ProjectClient';
import Project from '../models/Project';
import MarketplaceUser from '../models/MarketplaceUser';
import Contact from '../models/Contact';
import ProjectContact from '../models/ProjectContact';
import { gitHubService } from './GitHubService';

// Initialize Resend for email notifications
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Supabase client for auth operations
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

export interface InviteDetails {
  token: string;
  projectId: string;
  projectTitle: string;
  projectLogo?: string;
  invitedByName?: string;
  invitedByEmail?: string;
  clientEmail?: string;
  expiresAt?: Date;
  isValid: boolean;
  isExpired: boolean;
  status: string;
}

export interface ClientRegistrationData {
  email: string;
  password: string;
  name: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string; color: string }>;
  user: { login: string; avatar_url: string } | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  user: { login: string; avatar_url: string } | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  } | null;
  committer: {
    name: string;
    email: string;
    date: string;
  } | null;
  html_url: string;
}

class ClientPortalService {
  // ============================================================================
  // INVITE MANAGEMENT
  // ============================================================================

  /**
   * Generate an invite link for a project
   */
  async generateInvite(
    projectId: string,
    invitedByUserId: string,
    options: {
      clientEmail?: string;
      expiresInDays?: number;
      sendEmail?: boolean;
    } = {}
  ): Promise<{ token: string; url: string; emailSent: boolean }> {
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const invitedBy = await MarketplaceUser.findByPk(invitedByUserId);

    const token = ProjectClient.generateToken();
    const expiresAt = options.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 7 days

    await ProjectClient.create({
      projectId,
      inviteToken: token,
      invitedByUserId,
      clientEmail: options.clientEmail || null,
      expiresAt,
      status: 'pending',
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const url = `${baseUrl}/client/invite/${token}`;

    // Send email notification if email provided and sendEmail is true (or not specified)
    let emailSent = false;
    if (options.clientEmail && options.sendEmail !== false) {
      emailSent = await this.sendInviteEmail({
        clientEmail: options.clientEmail,
        inviteUrl: url,
        projectTitle: project.title,
        projectLogo: project.logoUrl,
        inviterName: invitedBy?.name || 'A team member',
        expiresAt,
      });
    }

    return { token, url, emailSent };
  }

  /**
   * Send invite email notification
   */
  private async sendInviteEmail(params: {
    clientEmail: string;
    inviteUrl: string;
    projectTitle: string;
    projectLogo?: string | null;
    inviterName: string;
    expiresAt: Date | null;
  }): Promise<boolean> {
    if (!resend) {
      console.warn('[ClientPortal] Email not sent - RESEND_API_KEY not configured');
      return false;
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@dispotree.com';
    const expiresText = params.expiresAt
      ? `This invite expires on ${params.expiresAt.toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric'
        })}.`
      : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background-color: #18181b; border-radius: 12px; padding: 40px; border: 1px solid #27272a;">
            ${params.projectLogo ? `
              <div style="text-align: center; margin-bottom: 24px;">
                <img src="${params.projectLogo}" alt="${params.projectTitle}" style="width: 64px; height: 64px; border-radius: 12px; object-fit: cover;">
              </div>
            ` : ''}

            <h1 style="color: #fafafa; font-size: 24px; font-weight: 600; margin: 0 0 16px 0; text-align: center;">
              You're invited to ${params.projectTitle}
            </h1>

            <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
              ${params.inviterName} has invited you to access the client portal for <strong style="color: #fafafa;">${params.projectTitle}</strong>.
            </p>

            <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
              As a client, you'll be able to:
            </p>

            <ul style="color: #a1a1aa; font-size: 14px; line-height: 1.8; margin: 0 0 32px 0; padding-left: 20px;">
              <li>View project issues and their status</li>
              <li>Submit new issues and feature requests</li>
              <li>Track pull requests and code changes</li>
              <li>See commit history and project activity</li>
            </ul>

            <div style="text-align: center; margin-bottom: 24px;">
              <a href="${params.inviteUrl}" style="display: inline-block; background-color: #22c55e; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                Accept Invitation
              </a>
            </div>

            ${expiresText ? `
              <p style="color: #71717a; font-size: 12px; text-align: center; margin: 0 0 16px 0;">
                ${expiresText}
              </p>
            ` : ''}

            <p style="color: #52525b; font-size: 12px; text-align: center; margin: 0;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>

          <p style="color: #52525b; font-size: 12px; text-align: center; margin-top: 24px;">
            Sent via Client Portal
          </p>
        </div>
      </body>
      </html>
    `;

    try {
      await resend.emails.send({
        from: fromEmail,
        to: [params.clientEmail],
        subject: `You're invited to ${params.projectTitle}`,
        html,
      });
      console.log(`[ClientPortal] Invite email sent to ${params.clientEmail}`);
      return true;
    } catch (error) {
      console.error('[ClientPortal] Failed to send invite email:', error);
      return false;
    }
  }

  /**
   * Get invite details by token
   */
  async getInviteByToken(token: string): Promise<InviteDetails | null> {
    const invite = await ProjectClient.findByToken(token);
    if (!invite) return null;

    const project = await Project.findByPk(invite.projectId);
    const invitedBy = await MarketplaceUser.findByPk(invite.invitedByUserId);

    const isExpired = invite.expiresAt ? new Date(invite.expiresAt) < new Date() : false;
    const isValid = invite.status !== 'revoked' && !isExpired;

    return {
      token: invite.inviteToken,
      projectId: invite.projectId,
      projectTitle: project?.title || 'Unknown Project',
      projectLogo: project?.logoUrl || undefined,
      invitedByName: invitedBy?.name || undefined,
      invitedByEmail: invitedBy?.email || undefined,
      clientEmail: invite.clientEmail || undefined,
      expiresAt: invite.expiresAt || undefined,
      isValid,
      isExpired,
      status: invite.status,
    };
  }

  /**
   * Accept an invite and register/link a client
   */
  async acceptInvite(
    token: string,
    registration: ClientRegistrationData
  ): Promise<{ user: MarketplaceUser; accessToken: string }> {
    const invite = await ProjectClient.findByToken(token);
    if (!invite) {
      throw new Error('Invalid invite token');
    }

    if (!invite.isValid()) {
      throw new Error('Invite has expired or been revoked');
    }

    if (invite.status === 'active') {
      throw new Error('Invite has already been accepted');
    }

    // Check if user already exists
    let user = await MarketplaceUser.findOne({
      where: { email: registration.email },
    });

    let accessToken: string;

    if (user) {
      // User exists - verify they're a client or upgrade their role
      if (user.role !== 'client') {
        // For now, don't change existing user roles
        // They can access the portal with their existing account
      }

      // Generate a session token for existing user
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: registration.email,
          password: registration.password,
        });
        if (error) {
          throw new Error('Invalid credentials for existing account');
        }
        accessToken = data.session?.access_token || '';
      } else {
        // Development mode - generate a simple token
        accessToken = `dev_token_${user.id}`;
      }
    } else {
      // Create new client user
      if (supabase) {
        // Create Supabase auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: registration.email,
          password: registration.password,
          email_confirm: true,
          user_metadata: {
            name: registration.name,
            role: 'client',
          },
        });

        if (authError) {
          throw new Error(`Failed to create account: ${authError.message}`);
        }

        // Create MarketplaceUser record
        user = await MarketplaceUser.create({
          id: authData.user.id,
          email: registration.email,
          name: registration.name,
          role: 'client',
          verified: true,
        });

        // Sign in to get access token
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: registration.email,
          password: registration.password,
        });

        if (signInError) {
          throw new Error('Account created but login failed');
        }

        accessToken = signInData.session?.access_token || '';
      } else {
        // Development mode
        const { v4: uuidv4 } = require('uuid');
        user = await MarketplaceUser.create({
          id: uuidv4(),
          email: registration.email,
          name: registration.name,
          role: 'client',
          verified: true,
        });
        accessToken = `dev_token_${user.id}`;
      }
    }

    // Accept the invite
    await invite.accept(user.id, registration.name);

    // Create contact and link to project
    await this.createClientContact(invite.projectId, user.id, registration.name, registration.email, invite.invitedByUserId);

    return { user, accessToken };
  }

  /**
   * Create a Contact for the client and link them to the project
   */
  private async createClientContact(
    projectId: string,
    clientUserId: string,
    clientName: string,
    clientEmail: string,
    invitedByUserId: string
  ): Promise<void> {
    try {
      const project = await Project.findByPk(projectId);
      if (!project) return;

      // Check if a contact with this email already exists for this organization
      let contact = await Contact.findOne({
        where: {
          organizationId: project.organizationId,
          email: clientEmail,
        },
      });

      if (!contact) {
        // Create new contact
        contact = await Contact.create({
          organizationId: project.organizationId,
          createdById: invitedByUserId,
          type: 'other',
          role: 'Client',
          name: clientName,
          email: clientEmail,
          linkedUserId: clientUserId,
          tags: ['client-portal'],
          status: 'active',
        });
      } else {
        // Link the existing contact to the user if not already linked
        if (!contact.linkedUserId) {
          await contact.update({ linkedUserId: clientUserId });
        }
      }

      // Check if contact is already linked to this project
      const existingLink = await ProjectContact.findOne({
        where: {
          projectId,
          contactId: contact.id,
        },
      });

      if (!existingLink) {
        // Create project-contact relationship
        await ProjectContact.create({
          projectId,
          contactId: contact.id,
          role: 'Client',
          addedById: invitedByUserId,
          notes: 'Added via Client Portal invite',
        });
      }

      console.log(`[ClientPortal] Contact created/linked for client ${clientEmail} on project ${projectId}`);
    } catch (error) {
      // Log but don't fail the invite acceptance if contact creation fails
      console.error('[ClientPortal] Failed to create client contact:', error);
    }
  }

  /**
   * Accept invite for existing logged-in user
   */
  async acceptInviteForUser(token: string, userId: string): Promise<ProjectClient> {
    const invite = await ProjectClient.findByToken(token);
    if (!invite) {
      throw new Error('Invalid invite token');
    }

    if (!invite.isValid()) {
      throw new Error('Invite has expired or been revoked');
    }

    const user = await MarketplaceUser.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await invite.accept(userId, user.name);

    // Create contact and link to project
    if (user.email) {
      await this.createClientContact(
        invite.projectId,
        userId,
        user.name || user.email,
        user.email,
        invite.invitedByUserId
      );
    }

    return invite.reload();
  }

  /**
   * Revoke a client invite
   */
  async revokeInvite(projectId: string, inviteId: number): Promise<void> {
    const invite = await ProjectClient.findOne({
      where: { id: inviteId, projectId },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    await invite.revoke();
  }

  /**
   * List all clients for a project
   */
  async getProjectClients(projectId: string): Promise<ProjectClient[]> {
    return ProjectClient.getByProject(projectId, true); // Include revoked
  }

  // ============================================================================
  // CLIENT ACCESS
  // ============================================================================

  /**
   * Verify client has access to a project
   */
  async verifyClientAccess(
    clientUserId: string,
    projectId: string
  ): Promise<ProjectClient | null> {
    const access = await ProjectClient.findOne({
      where: {
        clientUserId,
        projectId,
        status: 'active',
      },
    });

    if (access) {
      await access.touch(); // Update last accessed
    }

    return access;
  }

  /**
   * Get all projects a client has access to
   */
  async getClientProjects(clientUserId: string): Promise<Project[]> {
    const clientAccess = await ProjectClient.getByClient(clientUserId);
    const projectIds = clientAccess.map((ca) => ca.projectId);

    if (projectIds.length === 0) return [];

    return Project.findAll({
      where: { id: projectIds },
      order: [['updatedAt', 'DESC']],
    });
  }

  // ============================================================================
  // GITHUB DATA
  // ============================================================================

  /**
   * Parse GitHub URL to extract owner and repo
   */
  private parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    if (!url) return null;

    // Handle various GitHub URL formats
    const patterns = [
      /github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/,
      /^([^/]+)\/([^/]+)$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    }

    return null;
  }

  /**
   * Get issues for a project
   */
  async getProjectIssues(
    projectId: string,
    options: { state?: 'open' | 'closed' | 'all'; page?: number; perPage?: number } = {}
  ): Promise<GitHubIssue[]> {
    const project = await Project.findByPk(projectId);
    if (!project?.githubUrl) {
      return [];
    }

    const parsed = this.parseGitHubUrl(project.githubUrl);
    if (!parsed) return [];

    try {
      const issues = await gitHubService.listIssues(parsed.owner, parsed.repo, {
        state: options.state || 'all',
        perPage: options.perPage || 30,
        page: options.page || 1,
      });

      return issues.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels || [],
        user: issue.user,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at,
        html_url: issue.html_url,
      }));
    } catch (error) {
      console.error('Error fetching issues:', error);
      return [];
    }
  }

  /**
   * Get a single issue
   */
  async getProjectIssue(projectId: string, issueNumber: number): Promise<GitHubIssue | null> {
    const project = await Project.findByPk(projectId);
    if (!project?.githubUrl) return null;

    const parsed = this.parseGitHubUrl(project.githubUrl);
    if (!parsed) return null;

    try {
      // Fetch issues and find the one matching the number
      const issues = await gitHubService.listIssues(parsed.owner, parsed.repo, {
        state: 'all',
        perPage: 100,
      });
      const issue = issues.find((i) => i.number === issueNumber);
      if (!issue) return null;

      return {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels || [],
        user: issue.user,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at,
        html_url: issue.html_url,
      };
    } catch (error) {
      console.error('Error fetching issue:', error);
      return null;
    }
  }

  /**
   * Submit a new issue
   */
  async submitIssue(
    projectId: string,
    clientUserId: string,
    title: string,
    description: string
  ): Promise<GitHubIssue> {
    const project = await Project.findByPk(projectId);
    if (!project?.githubUrl) {
      throw new Error('Project does not have a GitHub repository configured');
    }

    const parsed = this.parseGitHubUrl(project.githubUrl);
    if (!parsed) {
      throw new Error('Invalid GitHub URL');
    }

    const client = await MarketplaceUser.findByPk(clientUserId);
    const clientLabel = `client-submitted`;

    // Add client attribution to the body
    const fullBody = `${description}\n\n---\n_Submitted by ${client?.name || 'Client'} via Client Portal_`;

    try {
      const issue = await gitHubService.createIssue(parsed.owner, parsed.repo, {
        title,
        body: fullBody,
        labels: [clientLabel],
      });

      return {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels || [],
        user: issue.user,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at,
        html_url: issue.html_url,
      };
    } catch (error) {
      throw new Error(`Failed to create issue: ${(error as Error).message}`);
    }
  }

  /**
   * Get pull requests for a project
   */
  async getProjectPullRequests(
    projectId: string,
    options: { state?: 'open' | 'closed' | 'all'; page?: number; perPage?: number } = {}
  ): Promise<GitHubPullRequest[]> {
    const project = await Project.findByPk(projectId);
    if (!project?.githubUrl) return [];

    const parsed = this.parseGitHubUrl(project.githubUrl);
    if (!parsed) return [];

    try {
      const prs = await gitHubService.listPullRequests(parsed.owner, parsed.repo, {
        state: options.state || 'all',
        perPage: options.perPage || 30,
        page: options.page || 1,
      });

      return prs.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        merged: pr.merged_at !== null,
        user: pr.user,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at,
        closed_at: pr.closed_at,
        html_url: pr.html_url,
        head: pr.head,
        base: pr.base,
      }));
    } catch (error) {
      console.error('Error fetching pull requests:', error);
      return [];
    }
  }

  /**
   * Get commits for a project
   */
  async getProjectCommits(
    projectId: string,
    options: { page?: number; perPage?: number } = {}
  ): Promise<GitHubCommit[]> {
    const project = await Project.findByPk(projectId);
    if (!project?.githubUrl) return [];

    const parsed = this.parseGitHubUrl(project.githubUrl);
    if (!parsed) return [];

    try {
      const commits = await gitHubService.listCommits(parsed.owner, parsed.repo, {
        perPage: options.perPage || 30,
        page: options.page || 1,
      });

      return commits.map((commit: any) => ({
        sha: commit.sha,
        message: commit.commit?.message || '',
        author: commit.commit?.author || null,
        committer: commit.commit?.committer || null,
        html_url: commit.html_url,
      }));
    } catch (error) {
      console.error('Error fetching commits:', error);
      return [];
    }
  }

  /**
   * Get project activity (combined issues, PRs, commits)
   */
  async getProjectActivity(
    projectId: string,
    limit: number = 20
  ): Promise<Array<{
    type: 'issue' | 'pr' | 'commit';
    date: string;
    title: string;
    url: string;
    data: any;
  }>> {
    const [issues, prs, commits] = await Promise.all([
      this.getProjectIssues(projectId, { perPage: limit }),
      this.getProjectPullRequests(projectId, { perPage: limit }),
      this.getProjectCommits(projectId, { perPage: limit }),
    ]);

    const activities: Array<{
      type: 'issue' | 'pr' | 'commit';
      date: string;
      title: string;
      url: string;
      data: any;
    }> = [];

    issues.forEach((issue) => {
      activities.push({
        type: 'issue',
        date: issue.updated_at || issue.created_at,
        title: issue.title,
        url: issue.html_url,
        data: issue,
      });
    });

    prs.forEach((pr) => {
      activities.push({
        type: 'pr',
        date: pr.updated_at || pr.created_at,
        title: pr.title,
        url: pr.html_url,
        data: pr,
      });
    });

    commits.forEach((commit) => {
      activities.push({
        type: 'commit',
        date: commit.author?.date || commit.committer?.date || '',
        title: commit.message.split('\n')[0], // First line only
        url: commit.html_url,
        data: commit,
      });
    });

    // Sort by date descending
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return activities.slice(0, limit);
  }
}

export const clientPortalService = new ClientPortalService();
export default clientPortalService;
