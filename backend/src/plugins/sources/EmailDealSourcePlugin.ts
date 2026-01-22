/**
 * Email Deal Source Plugin
 *
 * Parse deals from forwarded wholesaler emails - supports:
 * - IMAP email fetching (real implementation)
 * - Gmail API integration (real implementation)
 * - Email forwarding webhook
 * - AI-powered email parsing
 * - Template-based extraction
 */

import { BaseDealSourcePlugin } from './BaseDealSourcePlugin';
import {
  DealSourceType,
  DealSourceConfig,
  DealSourceResult,
  RawDeal,
  NormalizedDeal,
  ConnectionTestResult,
  FetchOptions,
  PluginConfigSchema,
  DealSourceError,
} from '../types';

// Import email libraries
import { ImapFlow, FetchMessageObject } from 'imapflow';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import { google, gmail_v1 } from 'googleapis';

interface ParsedEmail {
  from: string;
  subject: string;
  body: string;
  html?: string;
  receivedAt: Date;
  messageId?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

interface PDFExtractionResult {
  text: string;
  usedOCR: boolean;
  pageCount: number;
}

interface ExtractedDealData {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: string;
  arv?: string;
  bedrooms?: string;
  bathrooms?: string;
  sqft?: string;
  description?: string;
  photos?: string[];
  wholesalerName?: string;
  wholesalerEmail?: string;
  wholesalerPhone?: string;
  [key: string]: any;
}

interface GmailCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  access_token?: string;
}

export class EmailDealSourcePlugin extends BaseDealSourcePlugin {
  readonly type: DealSourceType = 'email';
  readonly name = 'Email Parser';
  readonly version = '2.1.0';
  readonly description = 'Parse deals from forwarded wholesaler emails using IMAP, Gmail API, or webhooks. Now with PDF attachment parsing!';

  private imapClient: ImapFlow | null = null;
  private gmailClient: gmail_v1.Gmail | null = null;
  private isDisposed: boolean = false;

  readonly configSchema: PluginConfigSchema = {
    fields: [
      {
        name: 'fetchMethod',
        label: 'Email Fetch Method',
        type: 'select',
        required: true,
        default: 'webhook',
        options: [
          { value: 'webhook', label: 'Email Forwarding Webhook' },
          { value: 'imap', label: 'IMAP Connection' },
          { value: 'gmail', label: 'Gmail API' },
        ],
      },
      {
        name: 'imapHost',
        label: 'IMAP Host',
        type: 'string',
        required: false,
        description: 'Email server hostname (e.g., imap.gmail.com, outlook.office365.com)',
      },
      {
        name: 'imapPort',
        label: 'IMAP Port',
        type: 'number',
        required: false,
        default: 993,
        validation: { min: 1, max: 65535 },
      },
      {
        name: 'imapSecure',
        label: 'Use SSL/TLS',
        type: 'boolean',
        required: false,
        default: true,
      },
      {
        name: 'emailUsername',
        label: 'Email Username',
        type: 'string',
        required: false,
        description: 'Your email address or username',
      },
      {
        name: 'emailPassword',
        label: 'Email Password / App Password',
        type: 'password',
        required: false,
        description: 'For Gmail, use an App Password (not your regular password)',
      },
      {
        name: 'gmailCredentials',
        label: 'Gmail API Credentials',
        type: 'json',
        required: false,
        description: 'Gmail OAuth credentials JSON with client_id, client_secret, and refresh_token',
      },
      {
        name: 'mailbox',
        label: 'Mailbox/Folder',
        type: 'string',
        required: false,
        default: 'INBOX',
        description: 'Mailbox to fetch emails from',
      },
      {
        name: 'parsingMode',
        label: 'Parsing Mode',
        type: 'select',
        required: false,
        default: 'ai',
        options: [
          { value: 'ai', label: 'AI-Powered (Recommended)' },
          { value: 'template', label: 'Template-Based' },
          { value: 'regex', label: 'Regex Patterns' },
        ],
      },
      {
        name: 'extractionPatterns',
        label: 'Extraction Patterns',
        type: 'json',
        required: false,
        description: 'Custom regex patterns for field extraction (JSON object)',
      },
      {
        name: 'templateConfig',
        label: 'Template Configuration',
        type: 'json',
        required: false,
        description: 'Template markers for parsing structured emails',
      },
      {
        name: 'filterSenders',
        label: 'Allowed Sender Domains',
        type: 'textarea',
        required: false,
        description: 'Comma-separated list of allowed sender domains (leave empty for all)',
      },
      {
        name: 'subjectKeywords',
        label: 'Subject Keywords',
        type: 'textarea',
        required: false,
        description: 'Comma-separated keywords that must be in subject line',
      },
      {
        name: 'markAsRead',
        label: 'Mark as Read After Processing',
        type: 'boolean',
        required: false,
        default: true,
      },
      {
        name: 'moveToFolder',
        label: 'Move to Folder After Processing',
        type: 'string',
        required: false,
        description: 'Folder to move processed emails to (e.g., "Processed")',
      },
      {
        name: 'fetchUnreadOnly',
        label: 'Fetch Unread Emails Only',
        type: 'boolean',
        required: false,
        default: true,
      },
      {
        name: 'maxAgeDays',
        label: 'Max Email Age (Days)',
        type: 'number',
        required: false,
        default: 7,
        description: 'Only fetch emails from the last N days',
      },
      {
        name: 'parsePDFAttachments',
        label: 'Parse PDF Attachments',
        type: 'boolean',
        required: false,
        default: true,
        description: 'Extract deal data from PDF attachments in emails',
      },
      {
        name: 'pdfParsingMode',
        label: 'PDF Parsing Mode',
        type: 'select',
        required: false,
        default: 'ai',
        options: [
          { value: 'ai', label: 'AI-Powered (Recommended)' },
          { value: 'regex', label: 'Regex Patterns' },
          { value: 'hybrid', label: 'Hybrid (AI + Regex)' },
        ],
        description: 'Method for extracting deal data from PDFs',
      },
      {
        name: 'enablePDFOCR',
        label: 'Enable OCR for Scanned PDFs',
        type: 'boolean',
        required: false,
        default: true,
        description: 'Use OCR when PDF text extraction returns minimal content',
      },
      {
        name: 'preferPDFData',
        label: 'Prefer PDF Data Over Email Body',
        type: 'boolean',
        required: false,
        default: true,
        description: 'When PDF and email body both have data, prefer PDF values',
      },
    ],
  };

  // Queue for webhook-received emails
  private emailQueue: ParsedEmail[] = [];
  private processedMessageIds: Set<string> = new Set();

  // Default extraction patterns
  private defaultPatterns: Record<string, RegExp[]> = {
    address: [
      /(?:address|property|location)[:\s]*([0-9]+\s+[A-Za-z0-9\s,]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)[.\s,]*)/i,
      /([0-9]+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place))/i,
    ],
    city: [/(?:city)[:\s]*([A-Za-z\s]+)/i, /,\s*([A-Za-z\s]+),?\s*[A-Z]{2}\s*\d{5}/],
    state: [/(?:state)[:\s]*([A-Z]{2})/i, /,\s*[A-Za-z\s]+,?\s*([A-Z]{2})\s*\d{5}/],
    zip: [/(?:zip|postal)[:\s]*(\d{5}(?:-\d{4})?)/i, /[A-Z]{2}\s*(\d{5}(?:-\d{4})?)/],
    price: [
      /(?:asking|contract|purchase)\s*(?:price)?[:\s]*\$?\s*([0-9,]+)/i,
      /\$\s*([0-9,]+(?:\.[0-9]{2})?)/,
      /(?:price)[:\s]*\$?\s*([0-9,]+)/i,
    ],
    arv: [/(?:arv|after\s*repair\s*value)[:\s]*\$?\s*([0-9,]+)/i, /(?:estimated\s*value)[:\s]*\$?\s*([0-9,]+)/i],
    bedrooms: [/([0-9]+)\s*(?:bed|br|bedroom)/i, /(?:bed|bedroom|br)[:\s]*([0-9]+)/i],
    bathrooms: [/([0-9.]+)\s*(?:bath|ba|bathroom)/i, /(?:bath|bathroom|ba)[:\s]*([0-9.]+)/i],
    sqft: [/([0-9,]+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i, /(?:sq\.?\s*ft|sqft|living\s*area)[:\s]*([0-9,]+)/i],
    yearBuilt: [/(?:year\s*built|built)[:\s]*(\d{4})/i, /(\d{4})\s*(?:build|construction)/i],
    phone: [/(?:phone|cell|mobile|call)[:\s]*([0-9\-\(\)\s\.]+)/i, /(\(?[0-9]{3}\)?[\s\-\.][0-9]{3}[\s\-\.][0-9]{4})/],
    email: [/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/],
    photos: [/(https?:\/\/[^\s<>"]+\.(?:jpg|jpeg|png|gif|webp))/gi, /(?:photo|image)\s*(?:link|url)?[:\s]*(https?:\/\/[^\s<>"]+)/gi],
  };

  /**
   * Add an email to the processing queue (for webhook-based delivery)
   */
  public queueEmail(email: ParsedEmail): void {
    this.emailQueue.push(email);
  }

  /**
   * Handle incoming webhook with email data
   */
  async handleWebhook(payload: any, headers: Record<string, string>): Promise<DealSourceResult> {
    const startTime = Date.now();

    try {
      // Parse webhook payload to email format
      const email = this.parseWebhookPayload(payload);

      if (!email) {
        return {
          success: false,
          deals: [],
          errors: [{ error: 'Invalid webhook payload' }],
          metadata: {
            totalFound: 0,
            totalProcessed: 0,
            totalErrors: 1,
            syncDuration: Date.now() - startTime,
          },
        };
      }

      // Process the email
      const result = await this.processEmail(email);

      return {
        success: result !== null,
        deals: result ? [result] : [],
        errors: result ? [] : [{ error: 'Failed to extract deal from email' }],
        metadata: {
          totalFound: 1,
          totalProcessed: result ? 1 : 0,
          totalErrors: result ? 0 : 1,
          syncDuration: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        deals: [],
        errors: [{ error: error instanceof Error ? error.message : String(error) }],
        metadata: {
          totalFound: 0,
          totalProcessed: 0,
          totalErrors: 1,
          syncDuration: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Test connection to email server
   */
  async testConnection(config: DealSourceConfig): Promise<ConnectionTestResult> {
    const method = config.settings.fetchMethod;

    if (method === 'webhook') {
      return {
        success: true,
        message: 'Webhook method - ready to receive forwarded emails',
        details: {
          webhookUrl: `/api/sources/${config.id}/webhook`,
        },
      };
    }

    if (method === 'imap') {
      return await this.testImapConnection(config);
    }

    if (method === 'gmail') {
      return await this.testGmailConnection(config);
    }

    return {
      success: false,
      message: `Unknown fetch method: ${method}`,
    };
  }

  /**
   * Test IMAP connection
   */
  private async testImapConnection(config: DealSourceConfig): Promise<ConnectionTestResult> {
    const { imapHost, imapPort, imapSecure, emailUsername, emailPassword } = config.settings;

    if (!imapHost || !emailUsername || !emailPassword) {
      return {
        success: false,
        message: 'Missing required IMAP credentials (host, username, or password)',
      };
    }

    let client: ImapFlow | null = null;

    try {
      client = new ImapFlow({
        host: imapHost,
        port: imapPort || 993,
        secure: imapSecure !== false,
        auth: {
          user: emailUsername,
          pass: emailPassword,
        },
        logger: false,
      });

      await client.connect();

      // List mailboxes to verify full access
      const mailboxes = await client.list();
      const mailboxCount = mailboxes.length;

      await client.logout();

      return {
        success: true,
        message: `IMAP connection successful`,
        details: {
          host: imapHost,
          port: imapPort || 993,
          secure: imapSecure !== false,
          mailboxCount,
          mailboxes: mailboxes.slice(0, 5).map(m => m.path),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Provide helpful error messages
      let suggestion = '';
      if (errorMessage.includes('AUTHENTICATIONFAILED') || errorMessage.includes('Invalid credentials')) {
        suggestion = ' For Gmail, you may need to use an App Password instead of your regular password.';
      } else if (errorMessage.includes('ECONNREFUSED')) {
        suggestion = ' Check that the host and port are correct.';
      } else if (errorMessage.includes('certificate')) {
        suggestion = ' There may be an SSL certificate issue. Try a different port or check server settings.';
      }

      return {
        success: false,
        message: `IMAP connection failed: ${errorMessage}${suggestion}`,
      };
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore logout errors
        }
      }
    }
  }

  /**
   * Test Gmail API connection
   */
  private async testGmailConnection(config: DealSourceConfig): Promise<ConnectionTestResult> {
    const credentials = config.settings.gmailCredentials as GmailCredentials;

    if (!credentials || !credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
      return {
        success: false,
        message: 'Gmail API credentials incomplete. Required: client_id, client_secret, refresh_token',
      };
    }

    try {
      const oauth2Client = new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret
      );

      oauth2Client.setCredentials({
        refresh_token: credentials.refresh_token,
        access_token: credentials.access_token,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Test by getting user profile
      const profile = await gmail.users.getProfile({ userId: 'me' });

      return {
        success: true,
        message: 'Gmail API connection successful',
        details: {
          emailAddress: profile.data.emailAddress,
          messagesTotal: profile.data.messagesTotal,
          threadsTotal: profile.data.threadsTotal,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      let suggestion = '';
      if (errorMessage.includes('invalid_grant')) {
        suggestion = ' The refresh token may have expired. Please re-authenticate.';
      } else if (errorMessage.includes('invalid_client')) {
        suggestion = ' Check that client_id and client_secret are correct.';
      }

      return {
        success: false,
        message: `Gmail API connection failed: ${errorMessage}${suggestion}`,
      };
    }
  }

  /**
   * Fetch deals from email source
   */
  async fetchDeals(options?: FetchOptions): Promise<DealSourceResult> {
    if (this.isDisposed) {
      throw new Error(`Plugin ${this.name} has been disposed and cannot fetch deals.`);
    }
    this.ensureInitialized();
    const startTime = Date.now();
    const deals: NormalizedDeal[] = [];
    const errors: DealSourceError[] = [];

    try {
      let emails: ParsedEmail[] = [];
      const method = this.config!.settings.fetchMethod;

      if (method === 'webhook') {
        // Process queued emails from webhooks
        emails = [...this.emailQueue];
        this.emailQueue = [];
      } else if (method === 'imap') {
        emails = await this.fetchFromImap(options);
      } else if (method === 'gmail') {
        emails = await this.fetchFromGmail(options);
      }

      // Filter emails based on configuration
      emails = this.filterEmails(emails);

      // Apply limit from options
      if (options?.limit) {
        emails = emails.slice(0, options.limit);
      }

      // Process each email
      for (const email of emails) {
        try {
          // Skip already processed emails
          if (email.messageId && this.processedMessageIds.has(email.messageId)) {
            continue;
          }

          const deal = await this.processEmail(email);
          if (deal) {
            deals.push(deal);
            if (email.messageId) {
              this.processedMessageIds.add(email.messageId);
            }
          } else {
            errors.push({
              error: 'Could not extract deal data from email',
              rawData: { subject: email.subject, from: email.from },
            });
          }
        } catch (error) {
          errors.push({
            error: error instanceof Error ? error.message : String(error),
            rawData: { subject: email.subject, from: email.from },
          });
        }
      }

      return {
        success: true,
        deals,
        errors,
        metadata: {
          totalFound: emails.length,
          totalProcessed: deals.length,
          totalErrors: errors.length,
          syncDuration: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        deals: [],
        errors: [{ error: error instanceof Error ? error.message : String(error) }],
        metadata: {
          totalFound: 0,
          totalProcessed: 0,
          totalErrors: 1,
          syncDuration: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Fetch emails via IMAP
   */
  private async fetchFromImap(options?: FetchOptions): Promise<ParsedEmail[]> {
    const { imapHost, imapPort, imapSecure, emailUsername, emailPassword, mailbox, fetchUnreadOnly, maxAgeDays, markAsRead, moveToFolder } = this.config!.settings;

    if (!imapHost || !emailUsername || !emailPassword) {
      throw new Error('IMAP credentials not configured');
    }

    const emails: ParsedEmail[] = [];
    let client: ImapFlow | null = null;

    try {
      client = new ImapFlow({
        host: imapHost,
        port: imapPort || 993,
        secure: imapSecure !== false,
        auth: {
          user: emailUsername,
          pass: emailPassword,
        },
        logger: false,
      });

      await client.connect();

      // Open the mailbox
      const targetMailbox = mailbox || 'INBOX';
      const lock = await client.getMailboxLock(targetMailbox);

      try {
        // Build search criteria
        const searchCriteria: any[] = [];

        if (fetchUnreadOnly !== false) {
          searchCriteria.push('UNSEEN');
        }

        // Filter by date if maxAgeDays is set
        if (maxAgeDays) {
          const sinceDate = new Date();
          sinceDate.setDate(sinceDate.getDate() - maxAgeDays);
          searchCriteria.push(['SINCE', sinceDate]);
        }

        // Search for messages - use proper imapflow SearchObject format
        const searchQuery: any = searchCriteria.length > 0
          ? { and: searchCriteria }
          : { all: true };
        const searchResult = await client.search(searchQuery, { uid: true });

        // Handle search result - can be number[] or false
        const messageUids: number[] = searchResult === false ? [] : (searchResult as number[]);

        // Limit the number of messages to fetch
        const limit = options?.limit || 50;
        const uidsToFetch = messageUids.slice(0, limit);

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

            const email: ParsedEmail = {
              from: this.extractEmailAddress(parsed.from),
              subject: parsed.subject || 'No Subject',
              body: parsed.text || '',
              html: typeof parsed.html === 'string' ? parsed.html : undefined,
              receivedAt: parsed.date || new Date(),
              messageId: parsed.messageId || `imap-${message.uid}`,
              attachments: parsed.attachments?.map((att: Attachment) => ({
                filename: att.filename || 'attachment',
                content: att.content,
              })),
            };

            emails.push(email);

            // Mark as read if configured
            if (markAsRead) {
              await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
            }

            // Move to folder if configured
            if (moveToFolder) {
              await client.messageMove(message.uid, moveToFolder, { uid: true });
            }
          } catch (parseError) {
            console.error('Failed to parse email:', parseError);
          }
        }
      } finally {
        lock.release();
      }

      await client.logout();
      console.log(`Fetched ${emails.length} emails via IMAP from ${imapHost}`);

      return emails;
    } catch (error) {
      console.error('IMAP fetch error:', error);
      throw error;
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore logout errors
        }
      }
    }
  }

  /**
   * Fetch emails via Gmail API
   */
  private async fetchFromGmail(options?: FetchOptions): Promise<ParsedEmail[]> {
    const credentials = this.config!.settings.gmailCredentials as GmailCredentials;

    if (!credentials || !credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
      throw new Error('Gmail API credentials not configured');
    }

    const emails: ParsedEmail[] = [];

    try {
      const oauth2Client = new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret
      );

      oauth2Client.setCredentials({
        refresh_token: credentials.refresh_token,
        access_token: credentials.access_token,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Build query
      const queryParts: string[] = [];

      if (this.config!.settings.fetchUnreadOnly !== false) {
        queryParts.push('is:unread');
      }

      if (this.config!.settings.maxAgeDays) {
        queryParts.push(`newer_than:${this.config!.settings.maxAgeDays}d`);
      }

      // Filter by sender domains if configured
      if (this.config!.settings.filterSenders) {
        const domains = this.config!.settings.filterSenders.split(',').map((d: string) => d.trim());
        if (domains.length > 0) {
          queryParts.push(`from:(${domains.map((d: string) => `@${d}`).join(' OR ')})`);
        }
      }

      // Filter by subject keywords if configured
      if (this.config!.settings.subjectKeywords) {
        const keywords = this.config!.settings.subjectKeywords.split(',').map((k: string) => k.trim());
        if (keywords.length > 0) {
          queryParts.push(`subject:(${keywords.join(' OR ')})`);
        }
      }

      const query = queryParts.join(' ');
      const limit = options?.limit || 50;

      // List messages
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        q: query || undefined,
        maxResults: limit,
      });

      const messageIds = listResponse.data.messages || [];

      // Fetch each message
      for (const msgRef of messageIds) {
        try {
          const message = await gmail.users.messages.get({
            userId: 'me',
            id: msgRef.id!,
            format: 'full',
          });

          const email = this.parseGmailMessage(message.data);
          if (email) {
            emails.push(email);

            // Mark as read if configured
            if (this.config!.settings.markAsRead) {
              await gmail.users.messages.modify({
                userId: 'me',
                id: msgRef.id!,
                requestBody: {
                  removeLabelIds: ['UNREAD'],
                },
              });
            }

            // Move to folder (add label) if configured
            if (this.config!.settings.moveToFolder) {
              // First, ensure the label exists
              const labelName = this.config!.settings.moveToFolder;
              let labelId: string | undefined;

              const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
              const existingLabel = labelsResponse.data.labels?.find(l => l.name === labelName);

              if (existingLabel) {
                labelId = existingLabel.id!;
              } else {
                const createResponse = await gmail.users.labels.create({
                  userId: 'me',
                  requestBody: { name: labelName },
                });
                labelId = createResponse.data.id!;
              }

              await gmail.users.messages.modify({
                userId: 'me',
                id: msgRef.id!,
                requestBody: {
                  addLabelIds: [labelId],
                },
              });
            }
          }
        } catch (msgError) {
          console.error(`Failed to fetch Gmail message ${msgRef.id}:`, msgError);
        }
      }

      console.log(`Fetched ${emails.length} emails via Gmail API`);
      return emails;
    } catch (error) {
      console.error('Gmail API fetch error:', error);
      throw error;
    }
  }

  /**
   * Parse Gmail API message to ParsedEmail format
   */
  private parseGmailMessage(message: gmail_v1.Schema$Message): ParsedEmail | null {
    try {
      const headers = message.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const from = getHeader('from');
      const subject = getHeader('subject');
      const date = getHeader('date');
      const messageId = getHeader('message-id') || message.id || '';

      // Extract body
      let body = '';
      let html = '';

      const extractBody = (part: gmail_v1.Schema$MessagePart) => {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }

        if (part.parts) {
          for (const subPart of part.parts) {
            extractBody(subPart);
          }
        }
      };

      if (message.payload) {
        extractBody(message.payload);
      }

      // If no plain text, strip HTML tags for body
      if (!body && html) {
        body = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      return {
        from,
        subject,
        body,
        html: html || undefined,
        receivedAt: date ? new Date(date) : new Date(),
        messageId,
      };
    } catch (error) {
      console.error('Failed to parse Gmail message:', error);
      return null;
    }
  }

  /**
   * Extract email address from parsed mail 'from' field
   */
  private extractEmailAddress(from: any): string {
    if (!from) return '';
    if (typeof from === 'string') return from;
    if (from.value && Array.isArray(from.value) && from.value.length > 0) {
      const first = from.value[0];
      return first.address || first.name || '';
    }
    if (from.text) return from.text;
    return '';
  }

  private parseWebhookPayload(payload: any): ParsedEmail | null {
    // Support multiple webhook formats (SendGrid, Mailgun, Postmark, etc.)
    if (!payload) {
      return null;
    }

    try {
      // Generic format
      if (payload.from && (payload.body || payload.text || payload.html)) {
        return {
          from: payload.from,
          subject: payload.subject || 'No Subject',
          body: payload.body || payload.text || '',
          html: payload.html,
          receivedAt: new Date(payload.timestamp || payload.receivedAt || Date.now()),
          messageId: payload.messageId || payload['Message-Id'],
          attachments: payload.attachments,
        };
      }

      // SendGrid format
      if (payload.envelope && payload.text) {
        return {
          from: JSON.parse(payload.envelope).from,
          subject: payload.subject,
          body: payload.text,
          html: payload.html,
          receivedAt: new Date(),
          attachments: payload.attachments,
        };
      }

      // Mailgun format
      if (payload.sender && payload['body-plain']) {
        return {
          from: payload.sender,
          subject: payload.subject,
          body: payload['body-plain'],
          html: payload['body-html'],
          receivedAt: new Date(payload.timestamp * 1000),
          messageId: payload['Message-Id'],
        };
      }

      // Postmark format
      if (payload.FromFull || payload.From) {
        return {
          from: payload.FromFull?.Email || payload.From,
          subject: payload.Subject,
          body: payload.TextBody || '',
          html: payload.HtmlBody,
          receivedAt: new Date(payload.Date || Date.now()),
          messageId: payload.MessageID,
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to parse webhook payload:', error);
      return null;
    }
  }

  private filterEmails(emails: ParsedEmail[]): ParsedEmail[] {
    const allowedDomains = this.config!.settings.filterSenders
      ? this.config!.settings.filterSenders.split(',').map((d: string) => d.trim().toLowerCase())
      : null;

    const subjectKeywords = this.config!.settings.subjectKeywords
      ? this.config!.settings.subjectKeywords.split(',').map((k: string) => k.trim().toLowerCase())
      : null;

    return emails.filter((email) => {
      // Filter by sender domain
      if (allowedDomains && allowedDomains.length > 0) {
        const senderDomain = email.from.split('@')[1]?.toLowerCase();
        if (!allowedDomains.some((d: string) => senderDomain?.includes(d))) {
          return false;
        }
      }

      // Filter by subject keywords
      if (subjectKeywords && subjectKeywords.length > 0) {
        const subject = email.subject.toLowerCase();
        if (!subjectKeywords.some((k: string) => subject.includes(k))) {
          return false;
        }
      }

      return true;
    });
  }

  private async processEmail(email: ParsedEmail): Promise<NormalizedDeal | null> {
    const parsingMode = this.config!.settings.parsingMode || 'ai';
    const parsePDFAttachments = this.config!.settings.parsePDFAttachments !== false;
    const preferPDFData = this.config!.settings.preferPDFData !== false;

    let extractedData: ExtractedDealData;
    let pdfData: ExtractedDealData | null = null;

    // Step 1: Try to extract data from PDF attachments if enabled
    if (parsePDFAttachments && email.attachments && email.attachments.length > 0) {
      pdfData = await this.extractFromPDFAttachments(email);
      if (pdfData) {
        console.log(`Extracted deal data from PDF attachment in email: ${email.subject}`);
      }
    }

    // Step 2: Extract data from email body
    switch (parsingMode) {
      case 'ai':
        extractedData = await this.extractWithAI(email);
        break;
      case 'template':
        extractedData = this.extractWithTemplate(email);
        break;
      case 'regex':
      default:
        extractedData = this.extractWithPatterns(email);
        break;
    }

    // Step 3: Merge PDF and email data based on preference
    if (pdfData) {
      if (preferPDFData) {
        // PDF data takes priority, email data fills gaps
        extractedData = { ...extractedData, ...pdfData };
      } else {
        // Email data takes priority, PDF data fills gaps
        extractedData = { ...pdfData, ...extractedData };
      }
    }

    // Validate minimum required data
    if (!extractedData.address && !extractedData.city && !extractedData.street) {
      return null;
    }

    // Create raw deal
    const rawDeal: RawDeal = {
      sourceId: this.config!.id,
      sourceName: this.config!.name,
      externalId: email.messageId || `email-${Date.now()}`,
      rawData: {
        ...extractedData,
        emailFrom: email.from,
        emailSubject: email.subject,
        emailBody: email.body,
        _hasPDFAttachment: !!pdfData,
      },
      receivedAt: email.receivedAt,
    };

    return this.normalizeDeal(rawDeal);
  }

  private extractWithPatterns(email: ParsedEmail): ExtractedDealData {
    const text = `${email.subject}\n${email.body}`;
    const customPatterns = this.config!.settings.extractionPatterns || {};
    const patterns = { ...this.defaultPatterns, ...customPatterns };

    const extracted: ExtractedDealData = {};

    for (const [field, regexes] of Object.entries(patterns)) {
      for (const regex of regexes as RegExp[]) {
        const match = text.match(regex);
        if (match && match[1]) {
          if (field === 'photos') {
            // Collect all photo URLs
            const allMatches = text.matchAll(new RegExp(regex, 'gi'));
            extracted.photos = Array.from(allMatches, (m) => m[1] || m[0]);
          } else {
            extracted[field] = match[1].trim();
          }
          break;
        }
      }
    }

    // Extract wholesaler info from sender
    extracted.wholesalerEmail = email.from;
    const nameMatch = email.from.match(/^([^<]+)</) || email.from.match(/^([^@]+)@/);
    if (nameMatch) {
      extracted.wholesalerName = nameMatch[1].trim();
    }

    return extracted;
  }

  private extractWithTemplate(email: ParsedEmail): ExtractedDealData {
    const templateConfig = this.config!.settings.templateConfig || {};
    const text = email.body;
    const extracted: ExtractedDealData = {};

    // Template-based extraction using markers
    for (const [field, config] of Object.entries(templateConfig) as [string, any][]) {
      const startMarker = config.start;
      const endMarker = config.end;

      const startIndex = text.indexOf(startMarker);
      if (startIndex !== -1) {
        const valueStart = startIndex + startMarker.length;
        const endIndex = endMarker ? text.indexOf(endMarker, valueStart) : text.indexOf('\n', valueStart);
        if (endIndex !== -1) {
          extracted[field] = text.substring(valueStart, endIndex).trim();
        }
      }
    }

    // Fall back to pattern extraction for missing fields
    const patternExtracted = this.extractWithPatterns(email);
    return { ...patternExtracted, ...extracted };
  }

  private async extractWithAI(email: ParsedEmail): Promise<ExtractedDealData> {
    // Try to use OpenAI/LangChain if available
    try {
      const openAIKey = process.env.OPENAI_API_KEY;
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      const apiKey = openAIKey || openRouterKey;
      const useOpenAI = !!openAIKey;

      if (apiKey) {
        // Dynamic import to avoid requiring langchain if not using AI mode
        const { ChatOpenAI } = await import('@langchain/openai');

        const model = new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: useOpenAI ? 'gpt-4o-mini' : 'openai/gpt-4o-mini',
          temperature: 0,
          configuration: useOpenAI ? undefined : {
            baseURL: 'https://openrouter.ai/api/v1',
          },
        });

        const prompt = `Extract real estate deal information from this email. Return a JSON object with these fields (use null if not found):
- address: street address
- city: city name
- state: 2-letter state code
- zip: ZIP code
- price: asking price (number only)
- arv: after repair value (number only)
- bedrooms: number of bedrooms
- bathrooms: number of bathrooms
- sqft: square footage (number only)
- yearBuilt: year built
- propertyType: type of property (Single Family, Multi-Family, etc.)
- description: brief property description
- photos: array of photo URLs
- wholesalerName: name of the wholesaler
- wholesalerPhone: phone number

Email Subject: ${email.subject}
Email From: ${email.from}

Email Body:
${email.body.substring(0, 4000)}

Return ONLY valid JSON, no other text.`;

        const response = await model.invoke(prompt);
        const content = typeof response.content === 'string' ? response.content : '';

        // Parse the JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          // Add wholesaler email from sender
          parsed.wholesalerEmail = email.from;
          return parsed;
        }
      }
    } catch (error) {
      console.log('AI extraction failed, falling back to pattern extraction:', error);
    }

    // Fallback to pattern extraction
    return this.extractWithPatterns(email);
  }

  protected async customNormalization(normalized: NormalizedDeal, rawDeal: RawDeal): Promise<NormalizedDeal> {
    // Set confidence based on extraction method
    const parsingMode = this.config?.settings.parsingMode || 'regex';
    const confidenceBoost = parsingMode === 'ai' ? 10 : parsingMode === 'template' ? 5 : 0;
    normalized.confidence = Math.min(100, normalized.confidence + confidenceBoost);

    // Add PDF extraction boost if data came from PDF
    if (rawDeal.rawData._extractedFromPDF) {
      normalized.confidence = Math.min(100, normalized.confidence + 5);
    }

    return normalized;
  }

  // ============================================================================
  // PDF ATTACHMENT PARSING
  // ============================================================================

  /**
   * Extract and process PDF attachments from an email
   */
  private async extractFromPDFAttachments(email: ParsedEmail): Promise<ExtractedDealData | null> {
    if (!email.attachments || email.attachments.length === 0) {
      return null;
    }

    // Filter for PDF attachments
    const pdfAttachments = email.attachments.filter(att =>
      att.filename?.toLowerCase().endsWith('.pdf') ||
      att.contentType?.includes('pdf')
    );

    if (pdfAttachments.length === 0) {
      return null;
    }

    console.log(`Found ${pdfAttachments.length} PDF attachment(s) in email from ${email.from}`);

    // Process each PDF and merge results (first PDF with valid data wins)
    for (const attachment of pdfAttachments) {
      try {
        const pdfResult = await this.extractTextFromPDF(attachment.content);

        if (pdfResult.text && pdfResult.text.trim().length > 50) {
          console.log(`Extracted ${pdfResult.text.length} chars from PDF "${attachment.filename}" (OCR: ${pdfResult.usedOCR})`);

          const pdfParsingMode = this.config?.settings.pdfParsingMode || 'ai';
          let extractedData: ExtractedDealData;

          if (pdfParsingMode === 'ai' || pdfParsingMode === 'hybrid') {
            extractedData = await this.extractDealFromPDFWithAI(pdfResult.text, attachment.filename || 'attachment.pdf');

            // For hybrid mode, fill in missing fields with regex
            if (pdfParsingMode === 'hybrid') {
              const regexData = this.extractDealFromPDFWithPatterns(pdfResult.text);
              extractedData = { ...regexData, ...extractedData };
            }
          } else {
            extractedData = this.extractDealFromPDFWithPatterns(pdfResult.text);
          }

          // Mark that this data came from PDF
          extractedData._extractedFromPDF = true;
          extractedData._pdfFilename = attachment.filename;
          extractedData._pdfUsedOCR = pdfResult.usedOCR;

          // Return if we got meaningful data
          if (extractedData.address || extractedData.price || extractedData.street) {
            return extractedData;
          }
        }
      } catch (error) {
        console.error(`Failed to process PDF attachment "${attachment.filename}":`, error);
      }
    }

    return null;
  }

  /**
   * Extract text from PDF buffer using pdf-parse with OCR fallback
   */
  private async extractTextFromPDF(content: Buffer): Promise<PDFExtractionResult> {
    let text = '';
    let usedOCR = false;
    let pageCount = 0;

    try {
      // Try text extraction first using pdf-parse
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: content });

      // Get text from PDF
      const textResult = await parser.getText();
      text = textResult.text || '';
      pageCount = textResult.pages?.length || 0;

      // Clean up parser
      await parser.destroy();

      // Check if we got meaningful text
      const minThreshold = 100;
      const cleanText = text.replace(/\s+/g, ' ').trim();

      if (cleanText.length < minThreshold && this.config?.settings.enablePDFOCR !== false) {
        console.log(`PDF text extraction returned only ${cleanText.length} chars, attempting OCR...`);
        const ocrResult = await this.performPDFOCR(content);
        if (ocrResult && ocrResult.length > cleanText.length) {
          text = ocrResult;
          usedOCR = true;
        }
      }
    } catch (error) {
      console.error('PDF text extraction failed:', error);

      // Try OCR as last resort
      if (this.config?.settings.enablePDFOCR !== false) {
        try {
          text = await this.performPDFOCR(content) || '';
          usedOCR = true;
        } catch (ocrError) {
          console.error('OCR also failed:', ocrError);
        }
      }
    }

    return { text, usedOCR, pageCount };
  }

  /**
   * Perform OCR on PDF using tesseract.js
   */
  private async performPDFOCR(pdfContent: Buffer): Promise<string | null> {
    try {
      const { createWorker } = await import('tesseract.js');

      // Create worker with English language
      const worker = await createWorker('eng');

      try {
        // Attempt to recognize text from the PDF buffer
        // Note: tesseract works best with images, so this may have limited success
        // For production, consider using pdf-to-image conversion first
        const result = await worker.recognize(pdfContent);
        await worker.terminate();
        return result.data.text;
      } catch (recognizeError) {
        await worker.terminate();
        console.log('Direct PDF OCR had limited success, may need pdf-to-image conversion');
        return null;
      }
    } catch (error) {
      console.error('OCR initialization error:', error);
      return null;
    }
  }

  /**
   * Extract deal data from PDF text using regex patterns
   */
  private extractDealFromPDFWithPatterns(text: string): ExtractedDealData {
    const extracted: ExtractedDealData = {};

    // PDF-specific patterns (similar to email patterns but optimized for PDF layouts)
    const pdfPatterns: Record<string, RegExp[]> = {
      address: [
        /(?:property\s*address|address|location)[:\s]*([0-9]+\s+[A-Za-z0-9\s,]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)[.\s,]*)/i,
        /([0-9]+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place))/i,
      ],
      city: [
        /(?:city)[:\s]*([A-Za-z\s]+)/i,
        /,\s*([A-Za-z\s]+),?\s*[A-Z]{2}\s*\d{5}/,
      ],
      state: [
        /(?:state)[:\s]*([A-Z]{2})/i,
        /,\s*[A-Za-z\s]+,?\s*([A-Z]{2})\s*\d{5}/,
      ],
      zip: [
        /(?:zip|postal)[:\s]*(\d{5}(?:-\d{4})?)/i,
        /[A-Z]{2}\s*(\d{5}(?:-\d{4})?)/,
      ],
      price: [
        /(?:asking\s*price|contract\s*price|purchase\s*price|price)[:\s]*\$?\s*([0-9,]+)/i,
        /\$\s*([0-9,]+(?:\.[0-9]{2})?)/,
      ],
      arv: [
        /(?:arv|after\s*repair\s*value|estimated\s*value)[:\s]*\$?\s*([0-9,]+)/i,
      ],
      repairEstimate: [
        /(?:repair|rehab|renovation|repairs\s*needed)[:\s]*\$?\s*([0-9,]+)/i,
      ],
      bedrooms: [
        /([0-9]+)\s*(?:bed|br|bedroom)/i,
        /(?:bed|bedroom|br)[:\s]*([0-9]+)/i,
      ],
      bathrooms: [
        /([0-9.]+)\s*(?:bath|ba|bathroom)/i,
        /(?:bath|bathroom|ba)[:\s]*([0-9.]+)/i,
      ],
      sqft: [
        /([0-9,]+)\s*(?:sq\.?\s*ft|sqft|square\s*feet|sf)/i,
        /(?:sq\.?\s*ft|sqft|living\s*area)[:\s]*([0-9,]+)/i,
      ],
      yearBuilt: [
        /(?:year\s*built|built|construction)[:\s]*(\d{4})/i,
      ],
      wholesalerName: [
        /(?:wholesaler|seller|contact|presented\s*by|submitted\s*by)[:\s]*([A-Za-z\s]+?)(?:\n|,|$)/i,
      ],
      wholesalerPhone: [
        /(?:phone|cell|mobile|tel)[:\s]*([0-9\-\(\)\s\.]+)/i,
        /(\(?[0-9]{3}\)?[\s\-\.][0-9]{3}[\s\-\.][0-9]{4})/,
      ],
      wholesalerEmail: [
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
      ],
      assignmentFee: [
        /(?:assignment\s*fee|fee|profit)[:\s]*\$?\s*([0-9,]+)/i,
      ],
      emDeposit: [
        /(?:emd|earnest\s*money|deposit)[:\s]*\$?\s*([0-9,]+)/i,
      ],
      occupancyStatus: [
        /(?:occupancy|occupied|status)[:\s]*(vacant|occupied|tenant|owner)/i,
      ],
    };

    for (const [field, regexes] of Object.entries(pdfPatterns)) {
      for (const regex of regexes) {
        const match = text.match(regex);
        if (match && match[1]) {
          extracted[field] = match[1].trim();
          break;
        }
      }
    }

    return extracted;
  }

  /**
   * Extract deal data from PDF text using AI
   */
  private async extractDealFromPDFWithAI(text: string, filename: string): Promise<ExtractedDealData> {
    try {
      const openAIKey = process.env.OPENAI_API_KEY;
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      const apiKey = openAIKey || openRouterKey;
      const useOpenAI = !!openAIKey;

      if (!apiKey) {
        console.log('No OpenAI key for PDF AI extraction, using regex');
        return this.extractDealFromPDFWithPatterns(text);
      }

      const { ChatOpenAI } = await import('@langchain/openai');

      const model = new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName: useOpenAI ? 'gpt-4o-mini' : 'openai/gpt-4o-mini',
        temperature: 0,
        configuration: useOpenAI ? undefined : {
          baseURL: 'https://openrouter.ai/api/v1',
        },
      });

      const prompt = `Extract real estate deal information from this PDF document (likely a wholesaler deal sheet).

Return a JSON object with these fields (use null if not found):
- address: full street address
- city: city name
- state: 2-letter state code
- zip: ZIP code
- price: asking/contract price (number only)
- arv: after repair value (number only)
- repairEstimate: repair cost estimate (number only)
- bedrooms: number of bedrooms
- bathrooms: number of bathrooms
- sqft: square footage (number only)
- yearBuilt: year built
- propertyType: single_family, multi_family, condo, townhouse, mobile, land
- description: brief property description
- wholesalerName: wholesaler/seller name
- wholesalerEmail: contact email
- wholesalerPhone: contact phone
- wholesalerCompany: company name
- assignmentFee: assignment fee amount
- emDeposit: earnest money deposit
- occupancyStatus: vacant, occupied, tenant, or owner

PDF Filename: ${filename}

PDF Content:
${text.substring(0, 5000)}

Return ONLY valid JSON, no markdown or other text.`;

      const response = await model.invoke(prompt);
      const content = typeof response.content === 'string' ? response.content : '';

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Clean null values
        const cleaned: ExtractedDealData = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (value !== null && value !== undefined && value !== '') {
            cleaned[key] = value;
          }
        }
        return cleaned;
      }
    } catch (error) {
      console.log('PDF AI extraction failed, falling back to regex:', error);
    }

    return this.extractDealFromPDFWithPatterns(text);
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    this.isDisposed = true;
    if (this.imapClient) {
      try {
        await this.imapClient.logout();
      } catch {
        // Ignore
      }
      this.imapClient = null;
    }
    this.gmailClient = null;
    this.processedMessageIds.clear();
  }
}
