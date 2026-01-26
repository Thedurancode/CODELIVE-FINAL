/**
 * Email Client Routes
 *
 * API routes for per-user email client functionality (inbox/outbox).
 * All routes require authentication.
 */

import { Router, Request, Response } from 'express';
import { emailClientFactory, EmailClientService } from '../services/EmailClientService';
import UserEmailConfig from '../models/UserEmailConfig';
import { emailPasswordEncryption } from '../utils/emailPasswordEncryption';
import { EmailFolder, EmailStatus } from '../models/Email';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Extend Request type to include user
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}

/**
 * Helper to get or create email client for authenticated user
 */
async function getEmailClient(req: AuthRequest): Promise<EmailClientService | null> {
  const userId = req.user?.id;
  if (!userId) {
    return null;
  }
  return emailClientFactory.createForUser(userId);
}

// ============================================================================
// EMAIL CONFIG ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/email-client/config:
 *   get:
 *     summary: Get user's email configuration
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Email configuration (password masked)
 */
router.get('/config', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const config = await UserEmailConfig.findOne({
      where: { userId },
    });

    if (!config) {
      return res.json({
        success: true,
        data: null,
      });
    }

    res.json({
      success: true,
      data: config.toSafeJSON(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get config',
    });
  }
});

/**
 * @swagger
 * /api/email-client/config:
 *   post:
 *     summary: Create or update email configuration
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountEmail
 *               - imapHost
 *               - imapUser
 *               - imapPassword
 *             properties:
 *               accountEmail:
 *                 type: string
 *               displayName:
 *                 type: string
 *               imapHost:
 *                 type: string
 *               imapPort:
 *                 type: number
 *               imapSecure:
 *                 type: boolean
 *               imapUser:
 *                 type: string
 *               imapPassword:
 *                 type: string
 *               smtpFrom:
 *                 type: string
 *     responses:
 *       200:
 *         description: Configuration saved
 */
router.post('/config', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const {
      accountEmail: rawAccountEmail,
      displayName: rawDisplayName,
      imapHost: rawImapHost,
      imapPort = 993,
      imapSecure = true,
      imapUser: rawImapUser,
      imapPassword,
      smtpFrom: rawSmtpFrom,
    } = req.body;

    // Trim whitespace from string inputs
    const accountEmail = rawAccountEmail?.trim();
    const displayName = rawDisplayName?.trim();
    const imapHost = rawImapHost?.trim();
    const imapUser = rawImapUser?.trim();
    const smtpFrom = rawSmtpFrom?.trim();

    console.log(`[EmailClient] Saving config for ${accountEmail}, host: ${imapHost}`);

    // Check if config already exists
    let config = await UserEmailConfig.findOne({ where: { userId } });

    // Validate required fields - password only required for new configs
    if (!accountEmail || !imapHost || !imapUser) {
      return res.status(400).json({
        success: false,
        error: 'accountEmail, imapHost, and imapUser are required',
      });
    }

    // Password required for new configs
    if (!config && !imapPassword) {
      return res.status(400).json({
        success: false,
        error: 'imapPassword is required for new configurations',
      });
    }

    // Initialize encryption
    emailPasswordEncryption.initialize();
    if (!emailPasswordEncryption.isAvailable()) {
      return res.status(500).json({
        success: false,
        error: 'Email encryption not configured. Contact administrator.',
      });
    }

    if (config) {
      // Update existing - only update password if provided
      const updateData: Record<string, any> = {
        accountEmail,
        displayName,
        imapHost,
        imapPort,
        imapSecure,
        imapUser,
        smtpFrom,
        isActive: true,
        lastSyncError: undefined,
        syncStatus: 'idle',
      };

      // Only update password fields if a new password is provided
      if (imapPassword) {
        const encrypted = emailPasswordEncryption.encrypt(imapPassword);
        updateData.encryptedPassword = encrypted.encryptedPassword;
        updateData.passwordIv = encrypted.passwordIv;
        updateData.passwordAuthTag = encrypted.passwordAuthTag;
      }

      await config.update(updateData);
    } else {
      // Create new - password is required (already validated above)
      const encrypted = emailPasswordEncryption.encrypt(imapPassword);
      config = await UserEmailConfig.create({
        userId,
        accountEmail,
        displayName,
        imapHost,
        imapPort,
        imapSecure,
        imapUser,
        encryptedPassword: encrypted.encryptedPassword,
        passwordIv: encrypted.passwordIv,
        passwordAuthTag: encrypted.passwordAuthTag,
        smtpFrom,
        isActive: true,
        syncStatus: 'idle',
      });
    }

    res.json({
      success: true,
      data: config.toSafeJSON(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save config',
    });
  }
});

/**
 * @swagger
 * /api/email-client/config/test:
 *   post:
 *     summary: Test IMAP connection with provided credentials
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - imapHost
 *               - imapUser
 *               - imapPassword
 *             properties:
 *               imapHost:
 *                 type: string
 *               imapPort:
 *                 type: number
 *               imapSecure:
 *                 type: boolean
 *               imapUser:
 *                 type: string
 *               imapPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Connection test result
 */
router.post('/config/test', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const {
      imapHost: rawImapHost,
      imapPort = 993,
      imapSecure = true,
      imapUser: rawImapUser,
      imapPassword,
    } = req.body;

    // Trim whitespace from string inputs
    const imapHost = rawImapHost?.trim();
    const imapUser = rawImapUser?.trim();

    if (!imapHost || !imapUser || !imapPassword) {
      return res.status(400).json({
        success: false,
        error: 'imapHost, imapUser, and imapPassword are required',
      });
    }

    console.log(`[EmailClient] Testing connection to ${imapHost}:${imapPort} for user ${imapUser}`);

    const result = await emailClientFactory.testConnection({
      imapHost,
      imapPort,
      imapSecure,
      imapUser,
      imapPassword,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
    });
  }
});

/**
 * @swagger
 * /api/email-client/config:
 *   delete:
 *     summary: Delete email configuration
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration deleted
 */
router.delete('/config', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const config = await UserEmailConfig.findOne({ where: { userId } });
    if (config) {
      await config.destroy();
    }

    res.json({
      success: true,
      message: 'Email configuration deleted',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete config',
    });
  }
});

// ============================================================================
// STATUS ENDPOINT
// ============================================================================

/**
 * @swagger
 * /api/email-client/status:
 *   get:
 *     summary: Get email client status and configuration
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Email client status
 */
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const status = await emailClientFactory.getConfigStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get status',
    });
  }
});

// ============================================================================
// SYNC ENDPOINT
// ============================================================================

/**
 * @swagger
 * /api/email-client/sync:
 *   post:
 *     summary: Sync emails from IMAP server
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: number
 *               folder:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sync result
 */
router.post('/sync', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({
        success: false,
        error: 'Email not configured. Please set up your email account in Settings.',
      });
    }

    // Update sync status
    const config = await UserEmailConfig.findOne({ where: { userId } });
    if (config) {
      await config.updateSyncStatus('syncing');
    }

    try {
      const { limit, folder } = req.body;
      const result = await emailClient.syncInbox({ limit, folder });

      // Update sync status to idle
      if (config) {
        await config.updateSyncStatus('idle');
      }

      res.json({
        success: true,
        data: {
          synced: result.synced,
          skipped: result.skipped,
          errors: result.errors,
          newEmailCount: result.newEmails.length,
        },
      });
    } catch (syncError) {
      // Update sync status to error
      if (config) {
        await config.updateSyncStatus('error', syncError instanceof Error ? syncError.message : 'Sync failed');
      }
      throw syncError;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync emails',
    });
  }
});

// ============================================================================
// UNIFIED INBOX (Admin Only)
// ============================================================================

/**
 * @swagger
 * /api/email-client/unified:
 *   get:
 *     summary: Get unified inbox (all team emails)
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: number
 *       - name: limit
 *         in: query
 *         schema:
 *           type: number
 *       - name: folder
 *         in: query
 *         schema:
 *           type: string
 *           enum: [inbox, sent, drafts, trash, archive]
 *     responses:
 *       200:
 *         description: Unified inbox emails
 */
router.get('/unified', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // TODO: Add proper admin check based on your role system
    // For now, allow all authenticated users to view unified inbox
    // if (userRole !== 'admin') {
    //   return res.status(403).json({ success: false, error: 'Admin access required' });
    // }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const folder = (req.query.folder as EmailFolder) || 'inbox';

    const result = await emailClientFactory.getUnifiedInbox({ page, limit, folder });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch unified inbox',
    });
  }
});

// ============================================================================
// FOLDER ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/email-client/folders/{folder}:
 *   get:
 *     summary: Get emails by folder
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: folder
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [inbox, sent, drafts, trash, archive]
 *     responses:
 *       200:
 *         description: List of emails
 */
router.get('/folders/:folder', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({
        success: false,
        error: 'Email not configured. Please set up your email account in Settings.',
      });
    }

    const folder = req.params.folder as EmailFolder;
    const validFolders: EmailFolder[] = ['inbox', 'sent', 'drafts', 'trash', 'archive'];

    if (!validFolders.includes(folder)) {
      return res.status(400).json({
        success: false,
        error: `Invalid folder. Must be one of: ${validFolders.join(', ')}`,
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string;
    const status = req.query.status as EmailStatus;
    const starred = req.query.starred === 'true' ? true : req.query.starred === 'false' ? false : undefined;

    const result = await emailClient.getEmails(folder, {
      page,
      limit,
      search,
      status,
      starred,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch emails',
    });
  }
});

// ============================================================================
// UNREAD COUNTS & STATS
// ============================================================================

/**
 * @swagger
 * /api/email-client/unread-counts:
 *   get:
 *     summary: Get unread counts by folder
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread counts
 */
router.get('/unread-counts', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      // Return zeros if not configured
      return res.json({
        success: true,
        data: { inbox: 0, sent: 0, drafts: 0, trash: 0, archive: 0 },
      });
    }

    const counts = await emailClient.getUnreadCounts();
    res.json({
      success: true,
      data: counts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get unread counts',
    });
  }
});

/**
 * @swagger
 * /api/email-client/stats:
 *   get:
 *     summary: Get email statistics
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Email statistics
 */
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.json({
        success: true,
        data: { total: 0, unread: 0, byFolder: { inbox: 0, sent: 0, drafts: 0, trash: 0, archive: 0 } },
      });
    }

    const stats = await emailClient.getStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    });
  }
});

// ============================================================================
// EMAIL CRUD ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/email-client/emails/{id}:
 *   get:
 *     summary: Get single email by ID
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 */
router.get('/emails/:id', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({
        success: false,
        error: 'Email not configured',
      });
    }

    const id = parseInt(req.params.id, 10);
    const email = await emailClient.getEmail(id);

    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'Email not found',
      });
    }

    // Mark as read when viewing
    await emailClient.markAsRead(id);

    res.json({
      success: true,
      data: email,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch email',
    });
  }
});

/**
 * @swagger
 * /api/email-client/threads/{threadId}:
 *   get:
 *     summary: Get email thread
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 */
router.get('/threads/:threadId', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({
        success: false,
        error: 'Email not configured',
      });
    }

    const emails = await emailClient.getThread(req.params.threadId);

    res.json({
      success: true,
      data: emails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch thread',
    });
  }
});

/**
 * @swagger
 * /api/email-client/search:
 *   get:
 *     summary: Search emails
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 */
router.get('/search', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const query = req.query.q as string;
    const folder = req.query.folder as EmailFolder | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters',
      });
    }

    const emails = await emailClient.searchEmails(query, { folder, limit });

    res.json({
      success: true,
      data: emails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
    });
  }
});

// ============================================================================
// EMAIL ACTION ENDPOINTS
// ============================================================================

router.post('/emails/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({ success: false, error: 'Email not configured' });
    }

    const id = parseInt(req.params.id, 10);
    const email = await emailClient.markAsRead(id);

    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    res.json({ success: true, data: email });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark as read',
    });
  }
});

router.post('/emails/:id/unread', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({ success: false, error: 'Email not configured' });
    }

    const id = parseInt(req.params.id, 10);
    const email = await emailClient.markAsUnread(id);

    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    res.json({ success: true, data: email });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark as unread',
    });
  }
});

router.post('/emails/:id/star', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({ success: false, error: 'Email not configured' });
    }

    const id = parseInt(req.params.id, 10);
    const email = await emailClient.toggleStarred(id);

    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    res.json({ success: true, data: email });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle star',
    });
  }
});

router.post('/emails/:id/move', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({ success: false, error: 'Email not configured' });
    }

    const id = parseInt(req.params.id, 10);
    const { folder } = req.body;

    const validFolders: EmailFolder[] = ['inbox', 'sent', 'drafts', 'trash', 'archive'];
    if (!validFolders.includes(folder)) {
      return res.status(400).json({
        success: false,
        error: `Invalid folder. Must be one of: ${validFolders.join(', ')}`,
      });
    }

    const email = await emailClient.moveToFolder(id, folder);

    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    res.json({ success: true, data: email });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to move email',
    });
  }
});

router.delete('/emails/:id', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({ success: false, error: 'Email not configured' });
    }

    const id = parseInt(req.params.id, 10);
    const deleted = await emailClient.deleteEmail(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    res.json({ success: true, message: 'Email deleted' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete email',
    });
  }
});

router.post('/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({ success: false, error: 'Email not configured' });
    }

    const { ids, status, starred, folder } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids array is required' });
    }

    const updates: any = {};
    if (status) updates.status = status;
    if (starred !== undefined) updates.starred = starred;
    if (folder) updates.folder = folder;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one update field is required',
      });
    }

    const affectedCount = await emailClient.bulkUpdate(ids, updates);

    res.json({ success: true, data: { affectedCount } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Bulk update failed',
    });
  }
});

// ============================================================================
// SEND & DRAFT ENDPOINTS
// ============================================================================

router.post('/send', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({
        success: false,
        error: 'Email not configured. Please set up your email account in Settings.',
      });
    }

    const { to, cc, bcc, subject, text, html, replyTo, inReplyTo, references } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, error: 'to field is required' });
    }

    if (!subject) {
      return res.status(400).json({ success: false, error: 'subject field is required' });
    }

    if (!text && !html) {
      return res.status(400).json({ success: false, error: 'Either text or html body is required' });
    }

    const result = await emailClient.sendEmail({
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      replyTo,
      inReplyTo,
      references,
    });

    res.json({
      success: true,
      data: { id: result.id, email: result.email },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    });
  }
});

router.post('/drafts', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({
        success: false,
        error: 'Email not configured',
      });
    }

    const { id, to, cc, subject, bodyText, bodyHtml, inReplyTo } = req.body;

    const draft = await emailClient.saveDraft({
      id,
      to: Array.isArray(to) ? to : [to],
      cc,
      subject: subject || '(No Subject)',
      bodyText,
      bodyHtml,
      inReplyTo,
    });

    res.json({ success: true, data: draft });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save draft',
    });
  }
});

/**
 * @swagger
 * /api/email-client/test-send:
 *   post:
 *     summary: Send a test email to verify email configuration
 *     tags: [Email Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *             properties:
 *               to:
 *                 type: string
 *                 description: Email address to send test to
 *     responses:
 *       200:
 *         description: Test email sent successfully
 */
router.post('/test-send', async (req: AuthRequest, res: Response) => {
  try {
    const emailClient = await getEmailClient(req);
    if (!emailClient) {
      return res.status(404).json({
        success: false,
        error: 'Email not configured. Please set up your email account in Settings.',
      });
    }

    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, error: 'to field is required' });
    }

    const result = await emailClient.sendEmail({
      to,
      subject: 'Test Email from Dispotree',
      text: `This is a test email sent from Dispotree at ${new Date().toISOString()}.\n\nIf you received this email, your email configuration is working correctly!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Test Email from Dispotree</h2>
          <p>This is a test email sent from Dispotree at <strong>${new Date().toISOString()}</strong>.</p>
          <p style="color: #28a745;">If you received this email, your email configuration is working correctly!</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">Sent via Dispotree Email Client</p>
        </div>
      `,
    });

    res.json({
      success: true,
      message: `Test email sent to ${to}`,
      data: { id: result.id },
    });
  } catch (error) {
    console.error('[EmailClient] Test send error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test email',
    });
  }
});

export default router;
