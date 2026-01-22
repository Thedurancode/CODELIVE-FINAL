/**
 * Email Client Service
 *
 * Provides per-user email client functionality for inbox/outbox management.
 * Supports IMAP for fetching emails and Resend for sending.
 * Uses factory pattern to create service instances for each user.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';
import Email, { EmailFolder, EmailStatus, EmailAddress, EmailAttachment } from '../models/Email';
import UserEmailConfig from '../models/UserEmailConfig';
import { emailPasswordEncryption } from '../utils/emailPasswordEncryption';
import { Op } from 'sequelize';
import { activityFeedService } from './ActivityFeedService';

export interface EmailClientConfig {
  userId: string;
  accountEmail: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPassword: string;
  smtpFrom?: string;
}

interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  inReplyTo?: string;
  references?: string[];
}

interface SyncResult {
  synced: number;
  skipped: number;
  errors: number;
  newEmails: Email[];
}

interface TestConnectionResult {
  success: boolean;
  error?: string;
  mailboxes?: string[];
}

class EmailClientService {
  private resend: Resend | null = null;
  private config: EmailClientConfig;
  private isSyncing = false;

  constructor(config: EmailClientConfig) {
    this.config = config;

    // Initialize Resend if API key is available
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
  }

  /**
   * Get the user ID this service is configured for
   */
  getUserId(): string {
    return this.config.userId;
  }

  /**
   * Get configured account email
   */
  getAccountEmail(): string {
    return this.config.accountEmail;
  }

  /**
   * Check if sending is enabled
   */
  canSend(): boolean {
    return this.resend !== null;
  }

  /**
   * Sync emails from IMAP server
   */
  async syncInbox(options: { limit?: number; folder?: string } = {}): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    const result: SyncResult = {
      synced: 0,
      skipped: 0,
      errors: 0,
      newEmails: [],
    };

    let client: ImapFlow | null = null;

    try {
      client = new ImapFlow({
        host: this.config.imapHost,
        port: this.config.imapPort,
        secure: this.config.imapSecure,
        auth: {
          user: this.config.imapUser,
          pass: this.config.imapPassword,
        },
        logger: false,
      });

      await client.connect();

      // Get mailbox to sync (default INBOX)
      const mailbox = options.folder || 'INBOX';
      const lock = await client.getMailboxLock(mailbox);

      try {
        // Calculate date for fetching (last 30 days by default)
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 30);

        // Search for messages
        const searchResult = await client.search(
          { since: sinceDate },
          { uid: true }
        );

        const messageUids: number[] = searchResult === false ? [] : (searchResult as number[]);
        const limit = options.limit || 100;
        const uidsToFetch = messageUids.slice(-limit).reverse(); // Most recent first

        // Get existing message IDs to skip duplicates
        const existingMessageIds = new Set(
          (await Email.findAll({
            where: { accountEmail: this.config.accountEmail, userId: this.config.userId },
            attributes: ['messageId'],
            raw: true,
          })).map((e: { messageId: string }) => e.messageId)
        );

        // Fetch messages
        for await (const message of client.fetch(uidsToFetch, {
          source: true,
          uid: true,
          flags: true,
          envelope: true,
        })) {
          try {
            const sourceBuffer = message.source;
            if (!sourceBuffer) continue;

            const parsed: ParsedMail = await simpleParser(sourceBuffer);
            const messageId = parsed.messageId || `imap-${message.uid}-${Date.now()}`;

            // Skip if already exists
            if (existingMessageIds.has(messageId)) {
              result.skipped++;
              continue;
            }

            // Parse email addresses
            const fromAddress = this.parseAddresses(parsed.from)[0] || { email: 'unknown@unknown.com' };
            const toAddresses = this.parseAddresses(parsed.to);
            const ccAddresses = this.parseAddresses(parsed.cc);

            // Parse attachments
            const attachments: EmailAttachment[] = [];
            if (parsed.attachments && parsed.attachments.length > 0) {
              for (const att of parsed.attachments) {
                attachments.push({
                  filename: att.filename || 'attachment',
                  contentType: att.contentType || 'application/octet-stream',
                  size: att.size || 0,
                  contentId: att.contentId,
                  // Don't store content for large attachments
                  content: att.size && att.size < 1024 * 1024 ? att.content.toString('base64') : undefined,
                });
              }
            }

            // Determine folder based on IMAP mailbox
            let folder: EmailFolder = 'inbox';
            if (mailbox.toLowerCase().includes('sent')) {
              folder = 'sent';
            } else if (mailbox.toLowerCase().includes('draft')) {
              folder = 'drafts';
            } else if (mailbox.toLowerCase().includes('trash') || mailbox.toLowerCase().includes('deleted')) {
              folder = 'trash';
            } else if (mailbox.toLowerCase().includes('archive')) {
              folder = 'archive';
            }

            // Check if read
            const flags = message.flags || new Set();
            const isRead = flags.has('\\Seen');

            // Create email record
            const email = await Email.create({
              userId: this.config.userId,
              accountEmail: this.config.accountEmail,
              messageId,
              threadId: parsed.references?.[0] || messageId,
              inReplyTo: parsed.inReplyTo || undefined,
              references: parsed.references as string[] || [],
              folder,
              status: isRead ? 'read' : 'unread',
              starred: flags.has('\\Flagged'),
              important: flags.has('\\Important') || false,
              from: fromAddress,
              to: toAddresses,
              cc: ccAddresses.length > 0 ? ccAddresses : undefined,
              subject: parsed.subject || '(No Subject)',
              bodyText: parsed.text || '',
              bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
              snippet: Email.generateSnippet(parsed.text || ''),
              attachments: attachments.length > 0 ? attachments : undefined,
              hasAttachments: attachments.length > 0,
              headers: this.parseHeaders(parsed.headers),
              receivedAt: parsed.date || new Date(),
            });

            result.synced++;
            result.newEmails.push(email);
          } catch (parseError) {
            console.error('Failed to parse email:', parseError);
            result.errors++;
          }
        }
      } finally {
        lock.release();
      }

      // Also sync Sent folder if we synced INBOX
      if (mailbox === 'INBOX') {
        try {
          const sentLock = await client.getMailboxLock('[Gmail]/Sent Mail');
          try {
            await this.syncSentFolder(client, result);
          } finally {
            sentLock.release();
          }
        } catch {
          // Sent folder may have different name, try alternatives
          try {
            const sentLock = await client.getMailboxLock('Sent');
            try {
              await this.syncSentFolder(client, result);
            } finally {
              sentLock.release();
            }
          } catch {
            console.log('Could not find Sent folder');
          }
        }
      }

      await client.logout();
    } catch (error) {
      console.error('IMAP sync error:', error);
      throw error;
    } finally {
      this.isSyncing = false;
      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore
        }
      }
    }

    console.log(`[EmailClientService] Sync complete for ${this.config.accountEmail}: ${result.synced} synced, ${result.skipped} skipped, ${result.errors} errors`);
    return result;
  }

  /**
   * Sync sent folder
   */
  private async syncSentFolder(client: ImapFlow, result: SyncResult): Promise<void> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 30);

    const searchResult = await client.search({ since: sinceDate }, { uid: true });
    const messageUids: number[] = searchResult === false ? [] : (searchResult as number[]);
    const uidsToFetch = messageUids.slice(-50).reverse();

    const existingMessageIds = new Set(
      (await Email.findAll({
        where: { accountEmail: this.config.accountEmail, userId: this.config.userId, folder: 'sent' },
        attributes: ['messageId'],
        raw: true,
      })).map((e: { messageId: string }) => e.messageId)
    );

    for await (const message of client.fetch(uidsToFetch, {
      source: true,
      uid: true,
      flags: true,
      envelope: true,
    })) {
      try {
        const sourceBuffer = message.source;
        if (!sourceBuffer) continue;

        const parsed: ParsedMail = await simpleParser(sourceBuffer);
        const messageId = parsed.messageId || `sent-${message.uid}-${Date.now()}`;

        if (existingMessageIds.has(messageId)) {
          result.skipped++;
          continue;
        }

        const fromAddress = this.parseAddresses(parsed.from)[0] || { email: this.config.accountEmail };
        const toAddresses = this.parseAddresses(parsed.to);

        await Email.create({
          userId: this.config.userId,
          accountEmail: this.config.accountEmail,
          messageId,
          threadId: parsed.references?.[0] || messageId,
          folder: 'sent',
          status: 'read',
          starred: false,
          important: false,
          from: fromAddress,
          to: toAddresses,
          subject: parsed.subject || '(No Subject)',
          bodyText: parsed.text || '',
          bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
          snippet: Email.generateSnippet(parsed.text || ''),
          hasAttachments: parsed.attachments ? parsed.attachments.length > 0 : false,
          sentAt: parsed.date || new Date(),
          receivedAt: parsed.date || new Date(),
        });

        result.synced++;
      } catch {
        result.errors++;
      }
    }
  }

  /**
   * Parse email addresses from mailparser format
   */
  private parseAddresses(addresses: any): EmailAddress[] {
    if (!addresses) return [];

    const list: EmailAddress[] = [];

    if (typeof addresses === 'string') {
      const match = addresses.match(/<?([^<>@\s]+@[^<>@\s]+)>?/);
      if (match) {
        list.push({ email: match[1] });
      }
      return list;
    }

    if (addresses.value && Array.isArray(addresses.value)) {
      for (const addr of addresses.value) {
        if (addr.address) {
          list.push({
            name: addr.name || undefined,
            email: addr.address,
          });
        }
      }
    }

    return list;
  }

  /**
   * Parse headers to a simple object
   */
  private parseHeaders(headers: any): Record<string, string> | undefined {
    if (!headers) return undefined;

    const result: Record<string, string> = {};
    const importantHeaders = ['x-mailer', 'x-priority', 'list-unsubscribe', 'reply-to'];

    for (const key of importantHeaders) {
      const value = headers.get(key);
      if (value) {
        result[key] = typeof value === 'string' ? value : String(value);
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Get emails by folder with pagination
   */
  async getEmails(
    folder: EmailFolder,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      status?: EmailStatus;
      starred?: boolean;
    } = {}
  ) {
    return Email.getByFolderForUser(this.config.userId, this.config.accountEmail, folder, options);
  }

  /**
   * Get email by ID (ensuring it belongs to this user)
   */
  async getEmail(id: number): Promise<Email | null> {
    return Email.findOne({
      where: { id, userId: this.config.userId },
    });
  }

  /**
   * Get email thread
   */
  async getThread(threadId: string): Promise<Email[]> {
    return Email.getThreadForUser(this.config.userId, threadId);
  }

  /**
   * Get unread counts for all folders
   */
  async getUnreadCounts() {
    return Email.getUnreadCountsForUser(this.config.userId, this.config.accountEmail);
  }

  /**
   * Mark email as read
   */
  async markAsRead(id: number): Promise<Email | null> {
    const email = await this.getEmail(id);
    if (email) {
      await email.markAsRead();
    }
    return email;
  }

  /**
   * Mark email as unread
   */
  async markAsUnread(id: number): Promise<Email | null> {
    const email = await this.getEmail(id);
    if (email) {
      await email.markAsUnread();
    }
    return email;
  }

  /**
   * Toggle starred status
   */
  async toggleStarred(id: number): Promise<Email | null> {
    const email = await this.getEmail(id);
    if (email) {
      await email.toggleStarred();
    }
    return email;
  }

  /**
   * Move email to folder
   */
  async moveToFolder(id: number, folder: EmailFolder): Promise<Email | null> {
    const email = await this.getEmail(id);
    if (email) {
      await email.moveToFolder(folder);
    }
    return email;
  }

  /**
   * Delete email (moves to trash, or permanently deletes if already in trash)
   */
  async deleteEmail(id: number): Promise<boolean> {
    const email = await this.getEmail(id);
    if (email) {
      await email.softDelete();
      return true;
    }
    return false;
  }

  /**
   * Bulk update emails
   */
  async bulkUpdate(
    ids: number[],
    updates: {
      status?: EmailStatus;
      starred?: boolean;
      folder?: EmailFolder;
    }
  ): Promise<number> {
    const [affectedCount] = await Email.update(updates, {
      where: {
        id: { [Op.in]: ids },
        userId: this.config.userId,
      },
    });
    return affectedCount;
  }

  /**
   * Get SMTP host from IMAP host (common pattern: imap.example.com -> smtp.example.com)
   */
  private getSmtpHost(): string {
    const imapHost = this.config.imapHost;
    // Replace imap. prefix with smtp., or prepend smtp. if no imap. prefix
    if (imapHost.startsWith('imap.')) {
      return imapHost.replace('imap.', 'smtp.');
    }
    return `smtp.${imapHost.replace(/^(mail\.|email\.)/i, '')}`;
  }

  /**
   * Build raw RFC822 email message
   */
  private buildRawMessage(options: SendEmailOptions, messageId: string): string {
    const fromAddress = this.config.smtpFrom || this.config.accountEmail;
    const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    const ccAddresses = options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined;
    const date = new Date().toUTCString();
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2)}`;

    let headers = [
      `From: ${fromAddress}`,
      `To: ${toAddresses}`,
      ccAddresses ? `Cc: ${ccAddresses}` : '',
      `Subject: ${options.subject}`,
      `Date: ${date}`,
      `Message-ID: ${messageId}`,
      options.inReplyTo ? `In-Reply-To: ${options.inReplyTo}` : '',
      options.references ? `References: ${options.references.join(' ')}` : '',
      `MIME-Version: 1.0`,
    ].filter(h => h).join('\r\n');

    let body: string;
    if (options.html && options.text) {
      headers += `\r\nContent-Type: multipart/alternative; boundary="${boundary}"`;
      body = [
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        options.text,
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        options.html,
        `--${boundary}--`,
      ].join('\r\n');
    } else if (options.html) {
      headers += `\r\nContent-Type: text/html; charset=utf-8`;
      body = `\r\n\r\n${options.html}`;
    } else {
      headers += `\r\nContent-Type: text/plain; charset=utf-8`;
      body = `\r\n\r\n${options.text || ''}`;
    }

    return headers + body;
  }

  /**
   * Send an email using SMTP (nodemailer)
   */
  private async sendEmailViaSMTP(options: SendEmailOptions): Promise<{ messageId: string; rawMessage: string }> {
    const smtpHost = this.getSmtpHost();
    const fromAddress = this.config.smtpFrom || this.config.accountEmail;

    // Create transporter with SSL (port 465) or TLS (port 587)
    // Try SSL first (most common for secure connections)
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: 465, // SSL port
      secure: true, // Use SSL
      auth: {
        user: this.config.imapUser,
        pass: this.config.imapPassword,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certs
      },
    });

    // Prepare recipients
    const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    const ccAddresses = options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined;
    const bccAddresses = options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined;

    // Prepare attachments
    const attachments = options.attachments?.map(att => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
    }));

    // Send email
    const info = await transporter.sendMail({
      from: `"${this.config.smtpFrom || this.config.accountEmail}" <${fromAddress}>`,
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject: options.subject,
      text: options.text,
      html: options.html,
      replyTo: options.replyTo,
      inReplyTo: options.inReplyTo,
      references: options.references?.join(' '),
      attachments,
    });

    const messageId = info.messageId || `<sent-${Date.now()}@${this.config.accountEmail.split('@')[1]}>`;
    const rawMessage = this.buildRawMessage(options, messageId);

    return { messageId, rawMessage };
  }

  /**
   * Append a sent email to the IMAP Sent folder
   */
  private async appendToSentFolder(rawMessage: string, messageId: string): Promise<void> {
    const client = new ImapFlow({
      host: this.config.imapHost,
      port: this.config.imapPort,
      secure: this.config.imapSecure,
      auth: {
        user: this.config.imapUser,
        pass: this.config.imapPassword,
      },
      logger: false,
    });

    try {
      await client.connect();

      // Try different Sent folder names
      const sentFolderNames = [
        'Sent',
        'Sent Mail',
        'Sent Items',
        '[Gmail]/Sent Mail',
        'INBOX.Sent',
        'INBOX/Sent',
      ];

      let sentFolder: string | null = null;

      // List mailboxes to find the Sent folder
      const mailboxes = await client.list();
      for (const mailbox of mailboxes) {
        const name = mailbox.name.toLowerCase();
        if (name === 'sent' || name.includes('sent')) {
          sentFolder = mailbox.path;
          break;
        }
      }

      // If no Sent folder found, try common names
      if (!sentFolder) {
        for (const name of sentFolderNames) {
          try {
            await client.mailboxOpen(name);
            sentFolder = name;
            break;
          } catch {
            // Folder doesn't exist, try next
          }
        }
      }

      if (!sentFolder) {
        console.warn('[EmailClient] Could not find Sent folder, creating one');
        try {
          await client.mailboxCreate('Sent');
          sentFolder = 'Sent';
        } catch {
          console.error('[EmailClient] Could not create Sent folder');
          return;
        }
      }

      // Append the message to the Sent folder
      const result = await client.append(sentFolder, rawMessage, ['\\Seen'], new Date());
      console.log(`[EmailClient] Appended message to ${sentFolder}, UID: ${result.uid}`);
    } catch (error) {
      console.error('[EmailClient] Failed to append to Sent folder:', (error as Error).message);
    } finally {
      await client.logout().catch(() => {});
    }
  }

  /**
   * Send an email using Resend or SMTP fallback
   */
  async sendEmail(options: SendEmailOptions): Promise<{ id: string; email: Email }> {
    // Use smtp_from config, then RESEND_FROM_EMAIL env var, then account email as fallback
    const fromAddress = this.config.smtpFrom || process.env.RESEND_FROM_EMAIL || this.config.accountEmail;

    // Prepare recipients
    const toAddresses = Array.isArray(options.to) ? options.to : [options.to];
    const ccAddresses = options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : undefined;
    const bccAddresses = options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : undefined;

    let messageId: string;

    // Use Resend if available, otherwise fall back to SMTP
    if (this.resend) {
      // Prepare attachments for Resend
      const resendAttachments = options.attachments?.map(att => ({
        filename: att.filename,
        content: typeof att.content === 'string' ? Buffer.from(att.content, 'base64') : att.content,
      }));

      // Send via Resend
      const response = await this.resend.emails.send({
        from: fromAddress,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        attachments: resendAttachments,
        headers: options.inReplyTo ? {
          'In-Reply-To': options.inReplyTo,
          'References': options.references?.join(' ') || options.inReplyTo,
        } : undefined,
      });

      if (response.error) {
        throw new Error(`Failed to send email: ${response.error.message}`);
      }

      messageId = response.data?.id || `sent-${Date.now()}`;
    } else {
      // Fall back to SMTP using user's email credentials
      console.log(`[EmailClient] Sending via SMTP (Resend not configured)`);
      const result = await this.sendEmailViaSMTP(options);
      messageId = result.messageId;

      // Append to IMAP Sent folder (don't await - do it in background)
      this.appendToSentFolder(result.rawMessage, messageId).catch(err => {
        console.warn('[EmailClient] Failed to save to Sent folder:', err.message);
      });
    }

    // Save to sent folder
    const email = await Email.create({
      userId: this.config.userId,
      accountEmail: this.config.accountEmail,
      messageId,
      threadId: options.inReplyTo || messageId,
      inReplyTo: options.inReplyTo,
      references: options.references,
      folder: 'sent',
      status: 'read',
      starred: false,
      important: false,
      from: { email: fromAddress },
      to: toAddresses.map(email => ({ email })),
      cc: ccAddresses?.map(email => ({ email })),
      bcc: bccAddresses?.map(email => ({ email })),
      subject: options.subject,
      bodyText: options.text || '',
      bodyHtml: options.html,
      snippet: Email.generateSnippet(options.text || ''),
      hasAttachments: options.attachments ? options.attachments.length > 0 : false,
      attachments: options.attachments?.map(att => ({
        filename: att.filename,
        contentType: att.contentType || 'application/octet-stream',
        size: typeof att.content === 'string' ? att.content.length : att.content.length,
      })),
      sentAt: new Date(),
      receivedAt: new Date(),
    });

    // If this is a reply, mark original as replied
    if (options.inReplyTo) {
      await Email.update(
        { status: 'replied' },
        { where: { messageId: options.inReplyTo, userId: this.config.userId } }
      );
    }

    // Log activity feed event
    activityFeedService.logActivity({
      eventType: 'email_sent',
      entityType: 'communication',
      entityId: messageId,
      entityName: options.subject,
      actor: {
        id: this.config.userId,
        name: 'User',
        type: 'user',
      },
      metadata: {
        to: toAddresses,
        cc: ccAddresses,
        subject: options.subject,
        hasAttachments: options.attachments ? options.attachments.length > 0 : false,
        isReply: !!options.inReplyTo,
      },
    }).catch(err => console.warn('Activity logging failed:', err.message));

    return { id: messageId, email };
  }

  /**
   * Save draft email
   */
  async saveDraft(options: {
    id?: number;
    to: string[];
    cc?: string[];
    subject: string;
    bodyText?: string;
    bodyHtml?: string;
    inReplyTo?: string;
  }): Promise<Email> {
    if (options.id) {
      // Update existing draft
      const draft = await this.getEmail(options.id);
      if (draft && draft.folder === 'drafts') {
        await draft.update({
          to: options.to.map(email => ({ email })),
          cc: options.cc?.map(email => ({ email })),
          subject: options.subject,
          bodyText: options.bodyText || '',
          bodyHtml: options.bodyHtml,
          snippet: Email.generateSnippet(options.bodyText || ''),
        });
        return draft;
      }
    }

    // Create new draft
    return Email.create({
      userId: this.config.userId,
      accountEmail: this.config.accountEmail,
      messageId: `draft-${Date.now()}`,
      folder: 'drafts',
      status: 'unread',
      starred: false,
      important: false,
      from: { email: this.config.accountEmail },
      to: options.to.map(email => ({ email })),
      cc: options.cc?.map(email => ({ email })),
      subject: options.subject,
      bodyText: options.bodyText || '',
      bodyHtml: options.bodyHtml,
      snippet: Email.generateSnippet(options.bodyText || ''),
      hasAttachments: false,
      inReplyTo: options.inReplyTo,
      receivedAt: new Date(),
    });
  }

  /**
   * Search emails across all folders
   */
  async searchEmails(
    query: string,
    options: { limit?: number; folder?: EmailFolder } = {}
  ): Promise<Email[]> {
    const where: Record<string, unknown> = {
      userId: this.config.userId,
      accountEmail: this.config.accountEmail,
      deletedAt: null,
      [Op.or as unknown as string]: [
        { subject: { [Op.iLike]: `%${query}%` } },
        { bodyText: { [Op.iLike]: `%${query}%` } },
      ],
    };

    if (options.folder) {
      where.folder = options.folder;
    }

    return Email.findAll({
      where,
      order: [['receivedAt', 'DESC']],
      limit: options.limit || 50,
    });
  }

  /**
   * Get email statistics
   */
  async getStats(): Promise<{
    total: number;
    unread: number;
    byFolder: Record<EmailFolder, number>;
  }> {
    const total = await Email.count({
      where: { userId: this.config.userId, accountEmail: this.config.accountEmail, deletedAt: null },
    });

    const unread = await Email.count({
      where: { userId: this.config.userId, accountEmail: this.config.accountEmail, status: 'unread', deletedAt: null },
    });

    const byFolder = await Email.getUnreadCountsForUser(this.config.userId, this.config.accountEmail);

    return { total, unread, byFolder };
  }
}

/**
 * Factory for creating EmailClientService instances
 */
class EmailClientServiceFactory {
  /**
   * Create an EmailClientService for a user from their saved config
   */
  async createForUser(userId: string): Promise<EmailClientService | null> {
    const config = await UserEmailConfig.findOne({
      where: { userId, isActive: true },
    });

    if (!config) {
      return null;
    }

    // Initialize encryption if needed
    emailPasswordEncryption.initialize();

    if (!emailPasswordEncryption.isAvailable()) {
      throw new Error('Email password encryption not configured');
    }

    // Access values through get() to handle Sequelize field mapping
    const encryptedPassword = config.get('encryptedPassword') as string;
    const passwordIv = config.get('passwordIv') as string;
    const passwordAuthTag = config.get('passwordAuthTag') as string;
    const accountEmail = config.get('accountEmail') as string;
    const imapHost = config.get('imapHost') as string;
    const imapPort = config.get('imapPort') as number;
    const imapSecure = config.get('imapSecure') as boolean;
    const imapUser = config.get('imapUser') as string;
    const smtpFrom = config.get('smtpFrom') as string | undefined;

    // Decrypt password
    const password = emailPasswordEncryption.decrypt(
      encryptedPassword,
      passwordIv,
      passwordAuthTag
    );

    return new EmailClientService({
      userId,
      accountEmail,
      imapHost,
      imapPort,
      imapSecure,
      imapUser,
      imapPassword: password,
      smtpFrom,
    });
  }

  /**
   * Create an EmailClientService from provided config (for testing or setup)
   */
  createFromConfig(config: EmailClientConfig): EmailClientService {
    return new EmailClientService(config);
  }

  /**
   * Test IMAP connection with provided credentials
   */
  async testConnection(config: {
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string;
    imapPassword: string;
  }): Promise<TestConnectionResult> {
    let client: ImapFlow | null = null;

    try {
      client = new ImapFlow({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapSecure,
        auth: {
          user: config.imapUser,
          pass: config.imapPassword,
        },
        logger: false,
      });

      await client.connect();

      // List mailboxes to verify access
      const mailboxes: string[] = [];
      for await (const mailbox of client.list()) {
        mailboxes.push(mailbox.path);
      }

      await client.logout();

      return {
        success: true,
        mailboxes,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[EmailClientFactory] Connection test failed:', errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore
        }
      }
    }
  }

  /**
   * Get aggregated emails from all users (for unified inbox)
   * Admin only - call with appropriate authorization
   */
  async getUnifiedInbox(options: {
    page?: number;
    limit?: number;
    folder?: EmailFolder;
  } = {}): Promise<{
    data: Email[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { page = 1, limit = 50, folder = 'inbox' } = options;
    const offset = (page - 1) * limit;

    const { count, rows } = await Email.findAndCountAll({
      where: {
        folder,
        deletedAt: null,
      },
      order: [['receivedAt', 'DESC']],
      limit,
      offset,
    });

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Get user's email configuration status
   */
  async getConfigStatus(userId: string): Promise<{
    configured: boolean;
    canSend: boolean;
    accountEmail: string | null;
    lastSyncAt: Date | null;
    syncStatus: string | null;
    lastSyncError: string | null;
  }> {
    const config = await UserEmailConfig.findOne({
      where: { userId, isActive: true },
    });

    if (!config) {
      return {
        configured: false,
        canSend: !!process.env.RESEND_API_KEY,
        accountEmail: null,
        lastSyncAt: null,
        syncStatus: null,
        lastSyncError: null,
      };
    }

    return {
      configured: true,
      canSend: !!process.env.RESEND_API_KEY,
      accountEmail: config.accountEmail,
      lastSyncAt: config.lastSyncAt || null,
      syncStatus: config.syncStatus,
      lastSyncError: config.lastSyncError || null,
    };
  }
}

export const emailClientFactory = new EmailClientServiceFactory();
export { EmailClientService };
export default emailClientFactory;
