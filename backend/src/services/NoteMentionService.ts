/**
 * Note Mention Service
 *
 * Handles @mention parsing, resolution, and notifications for project notes.
 * - Parse @username patterns from note content
 * - Resolve usernames to user IDs
 * - Send email and SMS notifications to mentioned users
 */

import { Op } from 'sequelize';
import { Resend } from 'resend';
import Twilio from 'twilio';
import ProjectNote from '../models/ProjectNote';
import Project from '../models/Project';
import MarketplaceUser from '../models/MarketplaceUser';
import Contact from '../models/Contact';

// =============================================================================
// TYPES
// =============================================================================

interface MentionedUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  type: 'user' | 'contact';
}

interface NotificationResult {
  userId: string;
  email: boolean;
  sms: boolean;
  error?: string;
}

interface MentionNotificationOptions {
  sendEmail?: boolean;
  sendSms?: boolean;
}

// =============================================================================
// SERVICE
// =============================================================================

class NoteMentionService {
  private initialized = false;
  private resend: Resend | null = null;
  private twilioClient: Twilio.Twilio | null = null;
  private twilioFromNumber: string | null = null;
  private fromEmail: string = 'notifications@yourdomain.com';

  async initialize(): Promise<void> {
    // Initialize Resend for email
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
      this.fromEmail = process.env.EMAIL_FROM || 'notifications@yourdomain.com';
      console.log('[NoteMentionService] Email notifications enabled (Resend)');
    } else {
      console.warn('[NoteMentionService] Email disabled - missing RESEND_API_KEY');
    }

    // Initialize Twilio for SMS
    const twilioSid = process.env.TWILIO_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioFromNumber = process.env.TWILIO_FROM_NUMBER || null;

    if (twilioSid && twilioAuthToken && this.twilioFromNumber) {
      this.twilioClient = Twilio(twilioSid, twilioAuthToken);
      console.log('[NoteMentionService] SMS notifications enabled (Twilio)');
    } else {
      console.warn('[NoteMentionService] SMS disabled - missing Twilio credentials');
    }

    this.initialized = true;
    console.log('[NoteMentionService] Initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  isEmailEnabled(): boolean {
    return this.resend !== null;
  }

  isSmsEnabled(): boolean {
    return this.twilioClient !== null && this.twilioFromNumber !== null;
  }

  // ===========================================================================
  // MENTION PARSING & RESOLUTION
  // ===========================================================================

  /**
   * Parse @mentions from content
   * Supports @username, @email, and @"Full Name" formats
   */
  parseMentions(content: string): string[] {
    const patterns: RegExp[] = [
      /@([a-zA-Z0-9_.-]+)/g,                    // @username or @email
      /@"([^"]+)"/g,                            // @"Full Name"
      /@'([^']+)'/g,                            // @'Full Name'
    ];

    const mentions = new Set<string>();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        mentions.add(match[1].toLowerCase());
      }
    }

    return Array.from(mentions);
  }

  /**
   * Resolve mention strings to user IDs
   * Searches by name, email, or username
   */
  async resolveMentions(
    mentions: string[],
    _organizationId: string
  ): Promise<MentionedUser[]> {
    if (mentions.length === 0) return [];

    const resolvedUsers: MentionedUser[] = [];
    const resolvedIds = new Set<string>();

    // Build search conditions for users
    const searchConditions = mentions.map((mention) => ({
      [Op.or]: [
        { name: { [Op.iLike]: `%${mention}%` } },
        { email: { [Op.iLike]: `%${mention}%` } },
      ],
    }));

    // Search MarketplaceUser (no organization filtering - single-tenant)
    const users = await MarketplaceUser.findAll({
      where: {
        [Op.or]: searchConditions,
      },
      attributes: ['id', 'name', 'email', 'phone'],
    });

    for (const user of users) {
      if (!resolvedIds.has(user.id)) {
        resolvedIds.add(user.id);
        resolvedUsers.push({
          id: user.id,
          name: user.name || user.email,
          email: user.email,
          phone: user.phone || undefined,
          type: 'user',
        });
      }
    }

    // Also search Contacts (for @mentioning external contacts)
    try {
      const contacts = await Contact.findAll({
        where: {
          [Op.or]: mentions.map((mention) => ({
            [Op.or]: [
              { name: { [Op.iLike]: `%${mention}%` } },
              { email: { [Op.iLike]: `%${mention}%` } },
            ],
          })),
        },
        attributes: ['id', 'name', 'email', 'phone'],
      });

      for (const contact of contacts) {
        if (!resolvedIds.has(contact.id)) {
          resolvedIds.add(contact.id);
          resolvedUsers.push({
            id: contact.id,
            name: contact.name || contact.email || 'Contact',
            email: contact.email || '',
            phone: contact.phone || undefined,
            type: 'contact',
          });
        }
      }
    } catch {
      // Contact model might not exist or have different schema
    }

    return resolvedUsers;
  }

  /**
   * Process mentions in a note - parse, resolve, and return user IDs
   */
  async processMentions(
    content: string,
    organizationId: string
  ): Promise<string[]> {
    const mentionStrings = this.parseMentions(content);
    if (mentionStrings.length === 0) return [];

    const resolvedUsers = await this.resolveMentions(mentionStrings, organizationId);
    return resolvedUsers.map((u) => u.id);
  }

  // ===========================================================================
  // NOTIFICATIONS
  // ===========================================================================

  /**
   * Send notifications to all mentioned users
   */
  async notifyMentionedUsers(
    noteId: number,
    options: MentionNotificationOptions = { sendEmail: true, sendSms: false }
  ): Promise<NotificationResult[]> {
    const note = await ProjectNote.findByPk(noteId, {
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    if (!note || !note.mentions || note.mentions.length === 0) {
      return [];
    }

    // Get project info
    const project = await Project.findByPk(note.projectId);
    if (!project) return [];

    // Get author info
    const author = note.author;
    const authorName = author?.name || author?.email || 'Someone';

    // Get mentioned users
    const mentionedUsers = await MarketplaceUser.findAll({
      where: { id: { [Op.in]: note.mentions } },
      attributes: ['id', 'name', 'email', 'phone'],
    });

    const results: NotificationResult[] = [];

    for (const user of mentionedUsers) {
      // Don't notify the author about their own mention
      if (user.id === note.userId) continue;

      const result: NotificationResult = {
        userId: user.id,
        email: false,
        sms: false,
      };

      // Send email notification
      if (options.sendEmail !== false && this.isEmailEnabled() && user.email) {
        try {
          await this.sendMentionEmail(
            user.email,
            user.name || user.email,
            authorName,
            project.title,
            note.content,
            note.projectId,
            noteId
          );
          result.email = true;
        } catch (error) {
          result.error = `Email failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      // Send SMS notification
      if (options.sendSms && this.isSmsEnabled() && user.phone) {
        try {
          await this.sendMentionSms(
            user.phone,
            authorName,
            project.title
          );
          result.sms = true;
        } catch (error) {
          result.error = (result.error ? result.error + '; ' : '') +
            `SMS failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      results.push(result);
    }

    // Mark notifications as sent
    if (results.some((r) => r.email || r.sms)) {
      await note.update({ mentionNotificationsSent: true });
    }

    return results;
  }

  /**
   * Send mention email notification
   */
  private async sendMentionEmail(
    toEmail: string,
    toName: string,
    authorName: string,
    projectTitle: string,
    noteContent: string,
    projectId: string,
    noteId: number
  ): Promise<void> {
    if (!this.resend) throw new Error('Email not configured');

    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const noteUrl = `${appUrl}/projects/${projectId}?note=${noteId}`;

    // Truncate content for preview
    const contentPreview = noteContent.length > 200
      ? noteContent.substring(0, 200) + '...'
      : noteContent;

    await this.resend.emails.send({
      from: this.fromEmail,
      to: toEmail,
      subject: `${authorName} mentioned you in ${projectTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px 12px 0 0; padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">You were mentioned!</h1>
            </div>
            <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <p style="color: #374151; font-size: 16px; margin: 0 0 20px;">
                Hi ${toName},
              </p>
              <p style="color: #374151; font-size: 16px; margin: 0 0 20px;">
                <strong>${authorName}</strong> mentioned you in a note on <strong>${projectTitle}</strong>:
              </p>
              <div style="background: #f9fafb; border-left: 4px solid #6366f1; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="color: #4b5563; font-size: 14px; margin: 0; white-space: pre-wrap;">${contentPreview}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${noteUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  View Note
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
                This notification was sent because you were @mentioned in a project note.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`[NoteMentionService] Email sent to ${toEmail} for note mention`);
  }

  /**
   * Send mention SMS notification
   */
  private async sendMentionSms(
    toPhone: string,
    authorName: string,
    projectTitle: string
  ): Promise<void> {
    if (!this.twilioClient || !this.twilioFromNumber) {
      throw new Error('SMS not configured');
    }

    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    await this.twilioClient.messages.create({
      body: `${authorName} mentioned you in a note on "${projectTitle}". Check the project for details: ${appUrl}`,
      from: this.twilioFromNumber,
      to: toPhone,
    });

    console.log(`[NoteMentionService] SMS sent to ${toPhone} for note mention`);
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  /**
   * Get users that can be mentioned in an organization
   */
  async getMentionableUsers(
    _organizationId: string
  ): Promise<Array<{ id: string; name: string; email: string; type: 'user' | 'contact' }>> {
    // Fetch all users (single-tenant, no organization filtering)
    const users = await MarketplaceUser.findAll({
      attributes: ['id', 'name', 'email'],
      order: [['name', 'ASC']],
    });

    const mentionableUsers: Array<{ id: string; name: string; email: string; type: 'user' | 'contact' }> = users.map((u) => ({
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      type: 'user' as const,
    }));

    // Also include contacts
    try {
      const contacts = await Contact.findAll({
        attributes: ['id', 'name', 'email'],
        order: [['name', 'ASC']],
      });

      for (const contact of contacts) {
        if (contact.email) {
          mentionableUsers.push({
            id: contact.id,
            name: contact.name || contact.email,
            email: contact.email,
            type: 'contact' as const,
          });
        }
      }
    } catch {
      // Contact model might not exist
    }

    return mentionableUsers;
  }

  /**
   * Highlight mentions in content for display
   */
  highlightMentions(content: string): string {
    return content
      .replace(/@([a-zA-Z0-9_.-]+)/g, '<span class="mention">@$1</span>')
      .replace(/@"([^"]+)"/g, '<span class="mention">@$1</span>')
      .replace(/@'([^']+)'/g, '<span class="mention">@$1</span>');
  }
}

export const noteMentionService = new NoteMentionService();
export { MentionedUser, NotificationResult, MentionNotificationOptions };
