/**
 * Project Recap Service
 *
 * Generates AI-powered project activity recaps that auto-update
 * when notes, status changes, or commits occur. Uses debouncing
 * to batch rapid updates and avoid excessive API calls.
 */

import Project from '../models/Project';
import ProjectNote from '../models/ProjectNote';
import ProjectContact from '../models/ProjectContact';
import Contact from '../models/Contact';
import MarketplaceUser from '../models/MarketplaceUser';
import { openRouterService } from './openRouterService';
import { gitHubService } from './GitHubService';
import { logger } from './LoggerService';

// System prompt for generating recaps - optimized for ElevenLabs voice synthesis
const RECAP_SYSTEM_PROMPT = `You are a friendly project assistant giving a spoken status update. Write exactly as you would naturally speak it aloud.

PRIORITY RULES:
- Lead with the MOST RECENT note first - it's the current state
- Then briefly recap other recent notes and who wrote them
- Mention team members by name when summarizing their contributions
- If the latest note is critical (cancelled, paused, blocked, urgent), emphasize it but still mention prior context

VOICE STYLE RULES:
- Write in first person as if you're personally briefing the listener
- Use contractions naturally (it's, we've, they're, hasn't)
- Add natural speech rhythm with commas for pauses
- Start with a warm greeting like "Hey" or "Alright" or "So"
- Keep sentences short and punchy - easy to speak and hear
- Spell out abbreviations (PR becomes "pull request")
- No markdown, bullets, URLs, or special characters

CONTENT TO COVER (3-5 sentences):
1. Lead with the most recent note and who wrote it
2. Summarize other recent notes briefly, mentioning each person by name
3. Reference any commits or code activity
4. Mention GitHub issues - especially open ones that need attention or recently closed ones
5. Mention who's on the team if contacts are listed (e.g., "Sarah's on design, John's handling dev")
6. End with current status and what's next

EXAMPLE:
"Hey, quick update on the dashboard project. Eddie just left a note about cancelling the project, so that's the latest. Before that, Sarah had noted the API integration was done, and John mentioned he fixed the auth bug last week. On the GitHub side, there are two open issues - one's a bug with the login flow, and another for adding dark mode. The login bug was just closed yesterday. On the team, we've got Sarah handling design and John on dev. There were also a few commits from the team on the UI side. So looks like we're wrapping up here."

Write naturally, like you're chatting with a colleague giving a full recap.`;

interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface IssueInfo {
  number: number;
  title: string;
  state: string;
  author: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

interface NoteInfo {
  content: string;
  authorName: string;
  createdAt: Date;
}

interface ContactInfo {
  name: string;
  role: string | null;
  type: string | null;
  isPrimary: boolean;
}

class ProjectRecapService {
  private initialized = false;
  private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
  private DEBOUNCE_MS = 10000; // 10 seconds

  async initialize(): Promise<void> {
    this.initialized = true;
    logger.info('ProjectRecapService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Queue a recap update for a project (debounced)
   * Multiple calls within DEBOUNCE_MS will be batched
   */
  queueUpdate(projectId: string): void {
    // Clear existing timer for this project
    if (this.pendingUpdates.has(projectId)) {
      clearTimeout(this.pendingUpdates.get(projectId));
    }

    // Set new timer
    const timer = setTimeout(async () => {
      try {
        await this.generateRecap(projectId);
        logger.info('Project recap updated', { projectId });
      } catch (error) {
        logger.error('Failed to generate project recap', { projectId }, error);
      }
      this.pendingUpdates.delete(projectId);
    }, this.DEBOUNCE_MS);

    this.pendingUpdates.set(projectId, timer);
    logger.debug('Queued recap update', { projectId, debounceMs: this.DEBOUNCE_MS });
  }

  /**
   * Get the current recap for a project
   * Returns existing recap or generates a new one if stale/missing
   */
  async getRecap(projectId: string, maxAgeMinutes: number = 30): Promise<string | null> {
    const project = await Project.findByPk(projectId);
    if (!project) {
      return null;
    }

    // Check if recap exists and is fresh enough
    if (project.aiRecap && project.aiRecapUpdatedAt) {
      const age = Date.now() - new Date(project.aiRecapUpdatedAt).getTime();
      const maxAge = maxAgeMinutes * 60 * 1000;
      if (age < maxAge) {
        return project.aiRecap;
      }
    }

    // Generate fresh recap
    return this.generateRecap(projectId);
  }

  /**
   * Force refresh the recap immediately
   */
  async refreshRecap(projectId: string, userName?: string): Promise<string | null> {
    // Cancel any pending update
    if (this.pendingUpdates.has(projectId)) {
      clearTimeout(this.pendingUpdates.get(projectId));
      this.pendingUpdates.delete(projectId);
    }

    return this.generateRecap(projectId, userName);
  }

  /**
   * Generate and save a new recap for the project
   */
  async generateRecap(projectId: string, userName?: string): Promise<string | null> {
    const project = await Project.findByPk(projectId);
    if (!project) {
      logger.warn('Cannot generate recap: project not found', { projectId });
      return null;
    }

    try {
      // Gather data in parallel
      const [notes, commits, issues, contacts] = await Promise.all([
        this.getRecentNotes(projectId, 10),
        this.getRecentCommits(project),
        this.getRecentIssues(project),
        this.getProjectContacts(projectId),
      ]);

      // Build context for AI
      const context = this.buildContext(project, notes, commits, issues, contacts);

      // Check if we have any content to summarize
      if (!context.trim() || context === 'No recent activity.') {
        const defaultRecap = `${project.title} is currently in "${this.formatStatus(project.status)}" status. No recent activity recorded.`;
        await project.update({
          aiRecap: defaultRecap,
          aiRecapUpdatedAt: new Date(),
        });
        return defaultRecap;
      }

      // Build personalized prompt with user's name
      const personalizedPrompt = userName
        ? `${RECAP_SYSTEM_PROMPT}\n\nIMPORTANT PERSONALIZATION:
- Address the listener by their first name. Their name is "${userName}". Start with "Hey ${userName.split(' ')[0]}," or similar.
- When "${userName}" appears as a note author or committer, say "you" instead of their name.
- Example: If ${userName} left a note, say "You just noted..." NOT "${userName} just noted..."
- For other team members, use their actual names.
- If commits are from "codelive" or bot/automated accounts, say "someone from the team" or "the team" instead.`
        : RECAP_SYSTEM_PROMPT;

      // Generate AI summary
      const recap = await openRouterService.complete(
        personalizedPrompt,
        context,
        { model: 'gpt-4o-mini', temperature: 0.3 }
      );

      // Save to project
      await project.update({
        aiRecap: recap,
        aiRecapUpdatedAt: new Date(),
      });

      return recap;
    } catch (error) {
      logger.error('Error generating recap', { projectId }, error);

      // Fallback to basic recap
      const fallbackRecap = this.generateFallbackRecap(project);
      await project.update({
        aiRecap: fallbackRecap,
        aiRecapUpdatedAt: new Date(),
      });
      return fallbackRecap;
    }
  }

  /**
   * Get recent notes for a project with author info
   */
  private async getRecentNotes(projectId: string, limit: number = 10): Promise<NoteInfo[]> {
    const notes = await ProjectNote.findAll({
      where: { projectId },
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

    return notes.map((note: any) => ({
      content: note.content,
      authorName: note.author?.name || 'Unknown',
      createdAt: note.createdAt,
    }));
  }

  /**
   * Get recent commits from GitHub if project has a repo linked
   */
  private async getRecentCommits(project: Project): Promise<CommitInfo[]> {
    if (!project.githubUrl) {
      return [];
    }

    try {
      // Parse owner/repo from GitHub URL
      const match = project.githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        return [];
      }

      const [, owner, repo] = match;
      const repoName = repo.replace('.git', '');

      // Check if GitHubService is available
      if (!gitHubService.isConfigured()) {
        return [];
      }

      const commits = await gitHubService.listCommits(owner, repoName, {
        perPage: 5,
      });

      return commits.map((c: any) => ({
        sha: c.sha?.substring(0, 7) || '',
        message: c.commit?.message?.split('\n')[0] || '',
        author: c.commit?.author?.name || c.author?.login || 'Unknown',
        date: c.commit?.author?.date || '',
      }));
    } catch (error) {
      logger.debug('Could not fetch commits for recap', { projectId: project.id });
      return [];
    }
  }

  /**
   * Get recent issues from GitHub if project has a repo linked
   */
  private async getRecentIssues(project: Project): Promise<IssueInfo[]> {
    if (!project.githubUrl) {
      return [];
    }

    try {
      // Parse owner/repo from GitHub URL
      const match = project.githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        return [];
      }

      const [, owner, repo] = match;
      const repoName = repo.replace('.git', '');

      // Check if GitHubService is available
      if (!gitHubService.isConfigured()) {
        return [];
      }

      const issues = await gitHubService.listIssues(owner, repoName, {
        state: 'all',
        perPage: 5,
        sort: 'updated',
        direction: 'desc',
      });

      return issues.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login || 'Unknown',
        labels: issue.labels?.map((l: any) => l.name) || [],
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      }));
    } catch (error) {
      logger.debug('Could not fetch issues for recap', { projectId: project.id });
      return [];
    }
  }

  /**
   * Get contacts assigned to a project
   */
  private async getProjectContacts(projectId: string): Promise<ContactInfo[]> {
    const projectContacts = await ProjectContact.findAll({
      where: { projectId },
      include: [
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'name', 'type'],
          required: true,
        },
      ],
      order: [
        ['isPrimary', 'DESC'],
        ['createdAt', 'ASC'],
      ],
      limit: 10,
    });

    return projectContacts.map((pc: any) => ({
      name: pc.contact?.name || 'Unknown',
      role: pc.role,
      type: pc.contact?.type,
      isPrimary: pc.isPrimary,
    }));
  }

  /**
   * Build context string for AI from gathered data
   */
  private buildContext(project: Project, notes: NoteInfo[], commits: CommitInfo[], issues: IssueInfo[] = [], contacts: ContactInfo[] = []): string {
    const parts: string[] = [];

    // Project info
    parts.push(`Project: ${project.title}`);
    parts.push(`Status: ${this.formatStatus(project.status)}`);

    if (project.targetEndDate) {
      const daysUntil = project.getDaysUntilDue();
      if (daysUntil !== null) {
        if (daysUntil < 0) {
          parts.push(`Due date: ${Math.abs(daysUntil)} days overdue`);
        } else if (daysUntil === 0) {
          parts.push(`Due date: Today`);
        } else {
          parts.push(`Due date: ${daysUntil} days remaining`);
        }
      }
    }

    // Team/Contacts
    if (contacts.length > 0) {
      parts.push(`\nTeam (${contacts.length} contact${contacts.length > 1 ? 's' : ''}):`);
      contacts.slice(0, 5).forEach((contact) => {
        const role = contact.role || contact.type || 'member';
        const primary = contact.isPrimary ? ' (primary)' : '';
        parts.push(`- ${contact.name}: ${role}${primary}`);
      });
    }

    // Recent notes
    if (notes.length > 0) {
      parts.push('\nRecent Notes:');
      notes.slice(0, 5).forEach((note) => {
        const date = this.formatRelativeDate(note.createdAt);
        const preview = note.content.substring(0, 150).replace(/\n/g, ' ');
        parts.push(`- ${note.authorName} (${date}): "${preview}${note.content.length > 150 ? '...' : ''}"`);
      });
    }

    // Recent commits
    if (commits.length > 0) {
      parts.push('\nRecent Commits:');
      commits.forEach((commit) => {
        const date = commit.date ? this.formatRelativeDate(new Date(commit.date)) : '';
        parts.push(`- ${commit.author}: "${commit.message}" ${date ? `(${date})` : ''}`);
      });
    }

    // GitHub Issues
    if (issues.length > 0) {
      const openIssues = issues.filter((i) => i.state === 'open');
      const closedIssues = issues.filter((i) => i.state === 'closed');

      parts.push(`\nGitHub Issues (${openIssues.length} open, ${closedIssues.length} recently closed):`);
      issues.slice(0, 5).forEach((issue) => {
        const status = issue.state === 'open' ? 'OPEN' : 'CLOSED';
        const labels = issue.labels.length > 0 ? ` [${issue.labels.join(', ')}]` : '';
        const date = this.formatRelativeDate(new Date(issue.updatedAt));
        parts.push(`- #${issue.number} ${status}: "${issue.title}"${labels} by ${issue.author} (updated ${date})`);
      });
    }

    if (notes.length === 0 && commits.length === 0 && issues.length === 0 && contacts.length === 0) {
      return 'No recent activity.';
    }

    return parts.join('\n');
  }

  /**
   * Generate a basic recap without AI when API is unavailable
   */
  private generateFallbackRecap(project: Project): string {
    const status = this.formatStatus(project.status);
    let recap = `${project.title} is currently in "${status}" status.`;

    if (project.targetEndDate) {
      const daysUntil = project.getDaysUntilDue();
      if (daysUntil !== null && daysUntil < 0) {
        recap += ` The project is ${Math.abs(daysUntil)} days overdue.`;
      } else if (daysUntil === 0) {
        recap += ` The due date is today.`;
      } else if (daysUntil !== null && daysUntil <= 7) {
        recap += ` Due in ${daysUntil} days.`;
      }
    }

    return recap;
  }

  /**
   * Format status for human readability
   */
  private formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
      in_talks: 'In Talks',
      now_coding: 'Now Coding',
      needs_review: 'Needs Review',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };
    return statusMap[status] || status;
  }

  /**
   * Format date as relative time
   */
  private formatRelativeDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  }

  /**
   * Get number of pending updates (for monitoring)
   */
  getPendingCount(): number {
    return this.pendingUpdates.size;
  }

  /**
   * Generate a summary recap of recent projects (for dashboard/overview)
   */
  async generateAllProjectsRecap(userName?: string, limit: number = 3): Promise<string> {
    try {
      // Get recent projects with activity
      const projects = await Project.findAll({
        order: [['updatedAt', 'DESC']],
        limit,
      });

      if (projects.length === 0) {
        return "Hey, looks like there aren't any projects yet. Time to create your first one!";
      }

      // Gather data for each project
      const projectSummaries: string[] = [];

      for (const project of projects) {
        const notes = await this.getRecentNotes(project.id, 2);
        const status = this.formatStatus(project.status);

        let summary = `${project.title} (${status})`;
        if (notes.length > 0) {
          const latestNote = notes[0];
          summary += ` - latest: "${latestNote.content.substring(0, 50)}${latestNote.content.length > 50 ? '...' : ''}" by ${latestNote.authorName}`;
        }
        projectSummaries.push(summary);
      }

      // Build context for AI
      const context = `Recent Projects Summary:\n${projectSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

      const allProjectsPrompt = `You are a friendly assistant giving a quick spoken overview of recent project activity. Write exactly as you would naturally speak it aloud.

VOICE STYLE RULES:
- Write in first person as if you're personally briefing the listener
- Use contractions naturally (it's, we've, they're)
- Keep it brief - 2-4 sentences max
- Start with a warm greeting
- No markdown, bullets, URLs, or special characters

${userName ? `Address the listener as "${userName.split(' ')[0]}".` : ''}

Give a quick, conversational summary of what's happening across these projects. Mention each project by name and its current state.`;

      const recap = await openRouterService.complete(
        allProjectsPrompt,
        context,
        { model: 'gpt-4o-mini', temperature: 0.3 }
      );

      return recap;
    } catch (error) {
      logger.error('Error generating all projects recap', {}, error);
      return "Hey, I couldn't pull up the project summaries right now. Try again in a moment.";
    }
  }
}

export const projectRecapService = new ProjectRecapService();
