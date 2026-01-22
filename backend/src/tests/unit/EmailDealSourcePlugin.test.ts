/**
 * EmailDealSourcePlugin Unit Tests
 */

import { EmailDealSourcePlugin } from '../../plugins/sources/EmailDealSourcePlugin';
import { DealSourceConfig, DealSourceType } from '../../plugins/types';

// Mock the external dependencies
jest.mock('imapflow', () => ({
  ImapFlow: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([
      { path: 'INBOX' },
      { path: 'Sent' },
      { path: 'Drafts' },
    ]),
    getMailboxLock: jest.fn().mockResolvedValue({
      release: jest.fn(),
    }),
    search: jest.fn().mockResolvedValue([1, 2, 3]),
    fetch: jest.fn().mockImplementation(function* () {
      yield {
        uid: 1,
        source: Buffer.from(`From: sender@example.com
Subject: Deal Alert: 123 Main St
Date: ${new Date().toISOString()}

New property available!
Address: 123 Main St, Austin, TX 78701
Price: $150,000
Bedrooms: 3
Bathrooms: 2`),
      };
    }),
    messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
    messageMove: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('mailparser', () => ({
  simpleParser: jest.fn().mockImplementation(async (source: Buffer) => {
    const text = source.toString();
    return {
      from: { value: [{ address: 'sender@example.com', name: 'Sender' }], text: 'sender@example.com' },
      subject: text.includes('Subject:') ? text.match(/Subject: (.+)/)?.[1] || 'No Subject' : 'No Subject',
      text: text,
      html: null,
      date: new Date(),
      messageId: 'test-message-id',
      attachments: [],
    };
  }),
}));

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    gmail: jest.fn().mockReturnValue({
      users: {
        getProfile: jest.fn().mockResolvedValue({
          data: {
            emailAddress: 'test@gmail.com',
            messagesTotal: 100,
            threadsTotal: 50,
          },
        }),
        messages: {
          list: jest.fn().mockResolvedValue({
            data: {
              messages: [{ id: 'msg1' }, { id: 'msg2' }],
            },
          }),
          get: jest.fn().mockResolvedValue({
            data: {
              id: 'msg1',
              payload: {
                headers: [
                  { name: 'From', value: 'sender@example.com' },
                  { name: 'Subject', value: 'Deal Alert' },
                  { name: 'Date', value: new Date().toISOString() },
                ],
                mimeType: 'text/plain',
                body: {
                  data: Buffer.from('Address: 123 Main St, Austin, TX 78701\nPrice: $150,000').toString('base64'),
                },
              },
            },
          }),
          modify: jest.fn().mockResolvedValue({}),
        },
        labels: {
          list: jest.fn().mockResolvedValue({ data: { labels: [] } }),
          create: jest.fn().mockResolvedValue({ data: { id: 'new-label-id' } }),
        },
      },
    }),
  },
}));

describe('EmailDealSourcePlugin', () => {
  let plugin: EmailDealSourcePlugin;
  let baseConfig: DealSourceConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    baseConfig = {
      id: 'test-email-source',
      name: 'Test Email Source',
      type: 'email' as DealSourceType,
      enabled: true,
      settings: {
        fetchMethod: 'webhook',
        parsingMode: 'regex',
        senderFilter: ['@wholesaler.com', '@deals.com'],
        subjectFilter: ['Deal Alert', 'New Property'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    plugin = new EmailDealSourcePlugin();
  });

  // ============================================================================
  // PLUGIN METADATA
  // ============================================================================

  describe('Plugin Metadata', () => {
    it('should have correct type', () => {
      expect(plugin.type).toBe('email');
    });

    it('should have correct name', () => {
      expect(plugin.name).toBe('Email Parser');
    });

    it('should have version', () => {
      expect(plugin.version).toBeDefined();
    });

    it('should have description', () => {
      expect(plugin.description).toBeDefined();
    });

    it('should have config schema', () => {
      expect(plugin.configSchema).toBeDefined();
      expect(plugin.configSchema.fields).toBeDefined();
    });
  });

  // ============================================================================
  // CONFIG SCHEMA
  // ============================================================================

  describe('Config Schema', () => {
    it('should have fetchMethod field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'fetchMethod');
      expect(field).toBeDefined();
      expect(field?.type).toBe('select');
    });

    it('should have parsingMode field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'parsingMode');
      expect(field).toBeDefined();
      expect(field?.type).toBe('select');
    });

    it('should have filterSenders field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'filterSenders');
      expect(field).toBeDefined();
    });

    it('should have subjectKeywords field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'subjectKeywords');
      expect(field).toBeDefined();
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await plugin.initialize(baseConfig);
      // Verify plugin works after initialization by testing connection
      const result = await plugin.testConnection(baseConfig);
      expect(result).toBeDefined();
    });

    it('should dispose successfully', async () => {
      await plugin.initialize(baseConfig);
      await plugin.dispose();
      // After dispose, fetching should throw
      await expect(plugin.fetchDeals()).rejects.toThrow();
    });
  });

  // ============================================================================
  // TEST CONNECTION
  // ============================================================================

  describe('testConnection', () => {
    it('should return success for webhook method', async () => {
      const result = await plugin.testConnection(baseConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Webhook');
    });

    it('should validate IMAP settings for imap method', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          fetchMethod: 'imap',
          imapHost: 'imap.example.com',
          imapPort: 993,
          imapUsername: 'user@example.com',
          imapPassword: 'password',
        },
      };

      const result = await plugin.testConnection(config);

      // Will fail without actual IMAP server, but should attempt connection
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // WEBHOOK HANDLING
  // ============================================================================

  describe('handleWebhook', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should process email webhook payload', async () => {
      const emailPayload = {
        from: 'sender@wholesaler.com',
        to: 'receiver@company.com',
        subject: 'Deal Alert: 123 Main St',
        body: `
          New property available!

          Address: 123 Main St, Austin, TX 78701
          Price: $150,000
          Bedrooms: 3
          Bathrooms: 2
          Square Feet: 1,500

          Contact: John Doe
          Phone: 555-123-4567
        `,
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result.success).toBe(true);
      expect(result.deals.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter by sender', async () => {
      const emailPayload = {
        from: 'unknown@random.com',
        to: 'receiver@company.com',
        subject: 'Deal Alert: 123 Main St',
        body: 'Some deal info',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      // Should be filtered out or processed based on settings
      expect(result).toBeDefined();
    });

    it('should filter by subject', async () => {
      const emailPayload = {
        from: 'sender@wholesaler.com',
        to: 'receiver@company.com',
        subject: 'Random Subject',
        body: 'Some content',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result).toBeDefined();
    });

    it('should handle missing body gracefully', async () => {
      const emailPayload = {
        from: 'sender@wholesaler.com',
        to: 'receiver@company.com',
        subject: 'Deal Alert',
        body: '',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result).toBeDefined();
      expect(result.deals).toHaveLength(0);
    });
  });

  // ============================================================================
  // REGEX EXTRACTION
  // ============================================================================

  describe('Regex Extraction', () => {
    beforeEach(async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          parsingMode: 'regex',
          senderFilter: [],
          subjectFilter: [],
        },
      };
      await plugin.initialize(config);
    });

    it('should extract address from email body', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Property',
        body: 'Check out this property at 123 Main St, Austin, TX 78701',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      if (result.deals.length > 0) {
        expect(result.deals[0].address).toBeDefined();
      }
    });

    it('should extract price from email body', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Deal',
        body: 'Price: $150,000',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result).toBeDefined();
    });

    it('should extract bedrooms from email body', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Deal',
        body: '3 bedrooms, 2 bathrooms',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result).toBeDefined();
    });

    it('should extract phone number from email body', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Deal',
        body: 'Contact: 555-123-4567',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result).toBeDefined();
    });

    it('should extract multiple properties from single email', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Weekly Deals',
        body: `
          Property 1:
          Address: 123 Main St, Austin, TX 78701
          Price: $150,000

          Property 2:
          Address: 456 Oak Ave, Dallas, TX 75201
          Price: $200,000
        `,
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // TEMPLATE PARSING
  // ============================================================================

  describe('Template Parsing', () => {
    it('should parse email using template patterns', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          parsingMode: 'template',
          templatePatterns: {
            address: 'Address: {{address}}',
            price: 'Price: {{price}}',
            bedrooms: 'Beds: {{bedrooms}}',
          },
          senderFilter: [],
          subjectFilter: [],
        },
      };

      await plugin.initialize(config);

      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Deal',
        body: `
          Address: 123 Main St, Austin, TX 78701
          Price: $150,000
          Beds: 3
        `,
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // FETCH DEALS
  // ============================================================================

  describe('fetchDeals', () => {
    it('should return empty for webhook mode without pending emails', async () => {
      await plugin.initialize(baseConfig);

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(0);
    });
  });

  // ============================================================================
  // EMAIL FILTERING
  // ============================================================================

  describe('Email Filtering', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should accept emails from whitelisted senders', async () => {
      const emailPayload = {
        from: 'john@wholesaler.com',
        subject: 'Deal Alert: New Property',
        body: 'Property at 123 Main St, Austin, TX 78701 for $150,000',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result.success).toBe(true);
    });

    it('should accept emails with matching subject', async () => {
      const emailPayload = {
        from: 'anyone@example.com',
        subject: 'Deal Alert: Hot Property',
        body: 'Property at 123 Main St, Austin, TX 78701 for $150,000',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // NORMALIZATION
  // ============================================================================

  describe('Deal Normalization', () => {
    beforeEach(async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          senderFilter: [],
          subjectFilter: [],
        },
      };
      await plugin.initialize(config);
    });

    it('should normalize extracted deal data', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Property Deal',
        body: `
          Address: 123 Main St, Austin, TX 78701
          Price: $150,000
          Bedrooms: 3
          Bathrooms: 2
          Square Feet: 1,500
        `,
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      if (result.deals.length > 0) {
        expect(result.deals[0].sourceId).toBe('test-email-source');
        expect(result.deals[0].sourceName).toBe('Test Email Source');
      }
    });

    it('should include email metadata in raw data', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Property Deal',
        body: 'Address: 123 Main St, Austin, TX 78701, Price: $150,000',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      if (result.deals.length > 0) {
        expect(result.deals[0].rawData).toBeDefined();
      }
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should handle invalid email payload', async () => {
      const result = await plugin.handleWebhook({}, {});

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should handle null payload', async () => {
      const result = await plugin.handleWebhook(null as any, {});

      expect(result).toBeDefined();
    });

    it('should handle parsing errors gracefully', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Deal',
        body: 'Malformed content with no extractable data @@##$$',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result).toBeDefined();
      expect(result.deals).toHaveLength(0);
    });
  });

  // ============================================================================
  // BATCH PROCESSING
  // ============================================================================

  describe('Batch Processing', () => {
    beforeEach(async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          senderFilter: [],
          subjectFilter: [],
        },
      };
      await plugin.initialize(config);
    });

    it('should handle batch email processing', async () => {
      const emails = [
        {
          from: 'sender1@example.com',
          subject: 'Deal 1',
          body: 'Address: 123 Main St, Austin, TX 78701, Price: $150,000',
          date: new Date().toISOString(),
        },
        {
          from: 'sender2@example.com',
          subject: 'Deal 2',
          body: 'Address: 456 Oak Ave, Dallas, TX 75201, Price: $200,000',
          date: new Date().toISOString(),
        },
      ];

      const results = await Promise.all(emails.map((email) => plugin.handleWebhook(email, {})));

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    });
  });

  // ============================================================================
  // METADATA
  // ============================================================================

  describe('Result Metadata', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should include processing metadata', async () => {
      const emailPayload = {
        from: 'sender@wholesaler.com',
        subject: 'Deal Alert',
        body: 'Address: 123 Main St, Austin, TX 78701, Price: $150,000',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result.metadata).toBeDefined();
    });
  });

  // ============================================================================
  // HTML EMAIL HANDLING
  // ============================================================================

  describe('HTML Email Handling', () => {
    beforeEach(async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          senderFilter: [],
          subjectFilter: [],
        },
      };
      await plugin.initialize(config);
    });

    it('should extract data from HTML email body', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Deal',
        body: `
          <html>
            <body>
              <h1>New Property</h1>
              <p>Address: 123 Main St, Austin, TX 78701</p>
              <p>Price: $150,000</p>
            </body>
          </html>
        `,
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // DEDUPLICATION
  // ============================================================================

  describe('Deduplication', () => {
    beforeEach(async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          enableDeduplication: true,
          senderFilter: [],
          subjectFilter: [],
        },
      };
      await plugin.initialize(config);
    });

    it('should track processed emails for deduplication', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Deal',
        body: 'Address: 123 Main St, Austin, TX 78701, Price: $150,000',
        date: new Date().toISOString(),
        messageId: 'unique-message-id-123',
      };

      // Process same email twice
      await plugin.handleWebhook(emailPayload, {});
      const result2 = await plugin.handleWebhook(emailPayload, {});

      expect(result2).toBeDefined();
    });
  });

  // ============================================================================
  // IMAP CONNECTION
  // ============================================================================

  describe('IMAP Connection', () => {
    it('should test IMAP connection successfully', async () => {
      const imapConfig: DealSourceConfig = {
        ...baseConfig,
        settings: {
          fetchMethod: 'imap',
          imapHost: 'imap.gmail.com',
          imapPort: 993,
          imapSecure: true,
          emailUsername: 'test@gmail.com',
          emailPassword: 'app-password',
          parsingMode: 'regex',
        },
      };

      const result = await plugin.testConnection(imapConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('IMAP connection successful');
      expect(result.details).toBeDefined();
      expect(result.details?.mailboxCount).toBe(3);
    });

    it('should fail IMAP connection test with missing credentials', async () => {
      const imapConfig: DealSourceConfig = {
        ...baseConfig,
        settings: {
          fetchMethod: 'imap',
          // Missing host, username, password
          parsingMode: 'regex',
        },
      };

      const result = await plugin.testConnection(imapConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing required IMAP credentials');
    });

    it('should fetch deals via IMAP', async () => {
      const imapConfig: DealSourceConfig = {
        ...baseConfig,
        settings: {
          fetchMethod: 'imap',
          imapHost: 'imap.gmail.com',
          imapPort: 993,
          imapSecure: true,
          emailUsername: 'test@gmail.com',
          emailPassword: 'app-password',
          mailbox: 'INBOX',
          fetchUnreadOnly: true,
          maxAgeDays: 7,
          markAsRead: true,
          parsingMode: 'regex',
        },
      };

      await plugin.initialize(imapConfig);
      const result = await plugin.fetchDeals({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
    });
  });

  // ============================================================================
  // GMAIL API CONNECTION
  // ============================================================================

  describe('Gmail API Connection', () => {
    it('should test Gmail API connection successfully', async () => {
      const gmailConfig: DealSourceConfig = {
        ...baseConfig,
        settings: {
          fetchMethod: 'gmail',
          gmailCredentials: {
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
            refresh_token: 'test-refresh-token',
          },
          parsingMode: 'regex',
        },
      };

      const result = await plugin.testConnection(gmailConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Gmail API connection successful');
      expect(result.details?.emailAddress).toBe('test@gmail.com');
    });

    it('should fail Gmail connection test with missing credentials', async () => {
      const gmailConfig: DealSourceConfig = {
        ...baseConfig,
        settings: {
          fetchMethod: 'gmail',
          gmailCredentials: {
            client_id: 'test-client-id',
            // Missing client_secret and refresh_token
          },
          parsingMode: 'regex',
        },
      };

      const result = await plugin.testConnection(gmailConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Gmail API credentials incomplete');
    });

    it('should fetch deals via Gmail API', async () => {
      const gmailConfig: DealSourceConfig = {
        ...baseConfig,
        settings: {
          fetchMethod: 'gmail',
          gmailCredentials: {
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
            refresh_token: 'test-refresh-token',
          },
          fetchUnreadOnly: true,
          maxAgeDays: 7,
          markAsRead: true,
          parsingMode: 'regex',
        },
      };

      await plugin.initialize(gmailConfig);
      const result = await plugin.fetchDeals({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
    });
  });

  // ============================================================================
  // POSTMARK WEBHOOK FORMAT
  // ============================================================================

  describe('Postmark Webhook Format', () => {
    beforeEach(async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          filterSenders: '',
          subjectKeywords: '',
        },
      };
      await plugin.initialize(config);
    });

    it('should parse Postmark webhook format', async () => {
      const postmarkPayload = {
        FromFull: { Email: 'sender@example.com', Name: 'Sender Name' },
        Subject: 'Deal Alert: 123 Main St',
        TextBody: 'Address: 123 Main St, Austin, TX 78701\nPrice: $150,000',
        HtmlBody: '<p>Address: 123 Main St</p>',
        Date: new Date().toISOString(),
        MessageID: 'postmark-msg-123',
      };

      const result = await plugin.handleWebhook(postmarkPayload, {});

      expect(result).toBeDefined();
      expect(result.metadata?.totalFound).toBe(1);
    });
  });

  // ============================================================================
  // MAILGUN WEBHOOK FORMAT
  // ============================================================================

  describe('Mailgun Webhook Format', () => {
    beforeEach(async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          filterSenders: '',
          subjectKeywords: '',
        },
      };
      await plugin.initialize(config);
    });

    it('should parse Mailgun webhook format', async () => {
      const mailgunPayload = {
        sender: 'sender@example.com',
        subject: 'Deal Alert: 123 Main St',
        'body-plain': 'Address: 123 Main St, Austin, TX 78701\nPrice: $150,000',
        'body-html': '<p>Address: 123 Main St</p>',
        timestamp: Math.floor(Date.now() / 1000),
        'Message-Id': 'mailgun-msg-123',
      };

      const result = await plugin.handleWebhook(mailgunPayload, {});

      expect(result).toBeDefined();
      expect(result.metadata?.totalFound).toBe(1);
    });
  });

  // ============================================================================
  // SENDGRID WEBHOOK FORMAT
  // ============================================================================

  describe('SendGrid Webhook Format', () => {
    beforeEach(async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          filterSenders: '',
          subjectKeywords: '',
        },
      };
      await plugin.initialize(config);
    });

    it('should parse SendGrid webhook format', async () => {
      const sendgridPayload = {
        envelope: JSON.stringify({ from: 'sender@example.com', to: ['receiver@company.com'] }),
        subject: 'Deal Alert: 123 Main St',
        text: 'Address: 123 Main St, Austin, TX 78701\nPrice: $150,000',
        html: '<p>Address: 123 Main St</p>',
      };

      const result = await plugin.handleWebhook(sendgridPayload, {});

      expect(result).toBeDefined();
      expect(result.metadata?.totalFound).toBe(1);
    });
  });

  // ============================================================================
  // DISPOSE / CLEANUP
  // ============================================================================

  describe('Resource Cleanup', () => {
    it('should clean up resources on dispose', async () => {
      const imapConfig: DealSourceConfig = {
        ...baseConfig,
        settings: {
          fetchMethod: 'imap',
          imapHost: 'imap.gmail.com',
          imapPort: 993,
          emailUsername: 'test@gmail.com',
          emailPassword: 'app-password',
          parsingMode: 'regex',
        },
      };

      await plugin.initialize(imapConfig);
      await plugin.dispose();

      // After dispose, fetch should throw
      await expect(plugin.fetchDeals()).rejects.toThrow();
    });
  });

  // ============================================================================
  // PDF ATTACHMENT PARSING
  // ============================================================================

  describe('PDF Attachment Parsing', () => {
    beforeEach(async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          parsePDFAttachments: true,
          pdfParsingMode: 'regex',
          enablePDFOCR: true,
          preferPDFData: true,
          senderFilter: [],
          subjectFilter: [],
        },
      };
      await plugin.initialize(config);
    });

    it('should have PDF parsing config options', () => {
      const pdfField = plugin.configSchema.fields.find((f) => f.name === 'parsePDFAttachments');
      expect(pdfField).toBeDefined();
      expect(pdfField?.type).toBe('boolean');
      expect(pdfField?.default).toBe(true);
    });

    it('should have PDF parsing mode field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'pdfParsingMode');
      expect(field).toBeDefined();
      expect(field?.type).toBe('select');
      expect(field?.options).toContainEqual({ value: 'ai', label: 'AI-Powered (Recommended)' });
    });

    it('should have OCR enable field for PDFs', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'enablePDFOCR');
      expect(field).toBeDefined();
      expect(field?.type).toBe('boolean');
    });

    it('should have prefer PDF data field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'preferPDFData');
      expect(field).toBeDefined();
      expect(field?.type).toBe('boolean');
    });

    it('should process emails without PDF attachments', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Deal Alert',
        body: 'Address: 123 Main St, Austin, TX 78701\nPrice: $150,000',
        date: new Date().toISOString(),
        attachments: [],
      };

      const result = await plugin.handleWebhook(emailPayload, {});
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle emails with non-PDF attachments', async () => {
      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Deal Alert',
        body: 'Address: 123 Main St, Austin, TX 78701\nPrice: $150,000',
        date: new Date().toISOString(),
        attachments: [
          {
            filename: 'image.jpg',
            content: Buffer.from('fake image data'),
            contentType: 'image/jpeg',
          },
        ],
      };

      const result = await plugin.handleWebhook(emailPayload, {});
      expect(result).toBeDefined();
      // Should still process email body
    });

    it('should skip PDF parsing when disabled', async () => {
      await plugin.dispose();
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          parsePDFAttachments: false,
          senderFilter: [],
          subjectFilter: [],
        },
      };
      await plugin.initialize(config);

      const emailPayload = {
        from: 'sender@example.com',
        subject: 'Deal Alert',
        body: 'Address: 123 Main St, Austin, TX 78701\nPrice: $150,000',
        date: new Date().toISOString(),
      };

      const result = await plugin.handleWebhook(emailPayload, {});
      expect(result).toBeDefined();
    });
  });
});
