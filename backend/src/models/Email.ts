/**
 * Email Model
 *
 * Stores emails for inbox and outbox functionality.
 * Supports IMAP sync for received emails and tracks sent emails.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'archive';
export type EmailStatus = 'unread' | 'read' | 'replied' | 'forwarded';

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  content?: string; // Base64 encoded for small attachments
  path?: string; // File path for larger attachments
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface EmailAttributes {
  id: number;
  userId?: string; // The user who owns this email (FK to MarketplaceUser)
  accountEmail: string; // The email account (e.g., info@dispotree.com)
  messageId: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
  folder: EmailFolder;
  status: EmailStatus;
  starred: boolean;
  important: boolean;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string; // Short preview text
  attachments?: EmailAttachment[];
  hasAttachments: boolean;
  labels?: string[];
  headers?: Record<string, string>;
  sentAt?: Date;
  receivedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

interface EmailCreationAttributes
  extends Optional<
    EmailAttributes,
    | 'id'
    | 'userId'
    | 'threadId'
    | 'inReplyTo'
    | 'references'
    | 'status'
    | 'starred'
    | 'important'
    | 'cc'
    | 'bcc'
    | 'replyTo'
    | 'bodyText'
    | 'bodyHtml'
    | 'snippet'
    | 'attachments'
    | 'hasAttachments'
    | 'labels'
    | 'headers'
    | 'sentAt'
    | 'receivedAt'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'
  > {}

class Email
  extends Model<EmailAttributes, EmailCreationAttributes>
  implements EmailAttributes
{
  public id!: number;
  public userId?: string;
  public accountEmail!: string;
  public messageId!: string;
  public threadId?: string;
  public inReplyTo?: string;
  public references?: string[];
  public folder!: EmailFolder;
  public status!: EmailStatus;
  public starred!: boolean;
  public important!: boolean;
  public from!: EmailAddress;
  public to!: EmailAddress[];
  public cc?: EmailAddress[];
  public bcc?: EmailAddress[];
  public replyTo?: EmailAddress;
  public subject!: string;
  public bodyText?: string;
  public bodyHtml?: string;
  public snippet?: string;
  public attachments?: EmailAttachment[];
  public hasAttachments!: boolean;
  public labels?: string[];
  public headers?: Record<string, string>;
  public sentAt?: Date;
  public receivedAt?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public deletedAt?: Date;

  /**
   * Get emails by folder with pagination
   */
  static async getByFolder(
    accountEmail: string,
    folder: EmailFolder,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      status?: EmailStatus;
      starred?: boolean;
    } = {}
  ): Promise<{ emails: Email[]; total: number; pages: number }> {
    const { page = 1, limit = 50, search, status, starred } = options;
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {
      accountEmail,
      folder,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    if (starred !== undefined) {
      where.starred = starred;
    }

    if (search) {
      where[Op.or as unknown as string] = [
        { subject: { [Op.iLike]: `%${search}%` } },
        { bodyText: { [Op.iLike]: `%${search}%` } },
        sequelize.where(
          sequelize.cast(sequelize.col('from'), 'text'),
          { [Op.iLike]: `%${search}%` }
        ),
      ];
    }

    const { rows: emails, count: total } = await Email.findAndCountAll({
      where,
      order: [['receivedAt', 'DESC']],
      limit,
      offset,
    });

    return {
      emails,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Get thread emails
   */
  static async getThread(threadId: string): Promise<Email[]> {
    return Email.findAll({
      where: {
        threadId,
        deletedAt: null,
      },
      order: [['receivedAt', 'ASC']],
    });
  }

  /**
   * Get unread count by folder
   */
  static async getUnreadCounts(accountEmail: string): Promise<Record<EmailFolder, number>> {
    const results = await Email.findAll({
      where: {
        accountEmail,
        status: 'unread',
        deletedAt: null,
      },
      attributes: [
        'folder',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      group: ['folder'],
      raw: true,
    }) as unknown as Array<{ folder: EmailFolder; count: string }>;

    const counts: Record<EmailFolder, number> = {
      inbox: 0,
      sent: 0,
      drafts: 0,
      trash: 0,
      archive: 0,
    };

    for (const row of results) {
      counts[row.folder] = parseInt(row.count, 10) || 0;
    }

    return counts;
  }

  /**
   * Get emails by folder for a specific user with pagination
   */
  static async getByFolderForUser(
    userId: string,
    accountEmail: string,
    folder: EmailFolder,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      status?: EmailStatus;
      starred?: boolean;
    } = {}
  ): Promise<{ data: Email[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const { page = 1, limit = 50, search, status, starred } = options;
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {
      userId,
      accountEmail,
      folder,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    if (starred !== undefined) {
      where.starred = starred;
    }

    if (search) {
      where[Op.or as unknown as string] = [
        { subject: { [Op.iLike]: `%${search}%` } },
        { bodyText: { [Op.iLike]: `%${search}%` } },
        sequelize.where(
          sequelize.cast(sequelize.col('from'), 'text'),
          { [Op.iLike]: `%${search}%` }
        ),
      ];
    }

    const { rows: data, count: total } = await Email.findAndCountAll({
      where,
      order: [['receivedAt', 'DESC']],
      limit,
      offset,
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get thread emails for a specific user
   */
  static async getThreadForUser(userId: string, threadId: string): Promise<Email[]> {
    return Email.findAll({
      where: {
        userId,
        threadId,
        deletedAt: null,
      },
      order: [['receivedAt', 'ASC']],
    });
  }

  /**
   * Get unread count by folder for a specific user
   */
  static async getUnreadCountsForUser(userId: string, accountEmail: string): Promise<Record<EmailFolder, number>> {
    const results = await Email.findAll({
      where: {
        userId,
        accountEmail,
        status: 'unread',
        deletedAt: null,
      },
      attributes: [
        'folder',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      group: ['folder'],
      raw: true,
    }) as unknown as Array<{ folder: EmailFolder; count: string }>;

    const counts: Record<EmailFolder, number> = {
      inbox: 0,
      sent: 0,
      drafts: 0,
      trash: 0,
      archive: 0,
    };

    for (const row of results) {
      counts[row.folder] = parseInt(row.count, 10) || 0;
    }

    return counts;
  }

  /**
   * Mark email as read
   */
  async markAsRead(): Promise<void> {
    if (this.status === 'unread') {
      await this.update({ status: 'read' });
    }
  }

  /**
   * Mark email as unread
   */
  async markAsUnread(): Promise<void> {
    await this.update({ status: 'unread' });
  }

  /**
   * Toggle starred status
   */
  async toggleStarred(): Promise<void> {
    await this.update({ starred: !this.starred });
  }

  /**
   * Move to folder
   */
  async moveToFolder(folder: EmailFolder): Promise<void> {
    await this.update({ folder });
  }

  /**
   * Soft delete (move to trash)
   */
  async softDelete(): Promise<void> {
    if (this.folder === 'trash') {
      // Permanently delete if already in trash
      await this.update({ deletedAt: new Date() });
    } else {
      // Move to trash
      await this.update({ folder: 'trash' });
    }
  }

  /**
   * Restore from trash
   */
  async restore(originalFolder: EmailFolder = 'inbox'): Promise<void> {
    await this.update({ folder: originalFolder, deletedAt: null });
  }

  /**
   * Generate snippet from body
   */
  static generateSnippet(text: string, maxLength: number = 150): string {
    if (!text) return '';
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.substring(0, maxLength - 3) + '...';
  }
}

Email.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      field: 'user_id',
    },
    accountEmail: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'account_email',
    },
    messageId: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'message_id',
    },
    threadId: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'thread_id',
    },
    inReplyTo: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'in_reply_to',
    },
    references: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    folder: {
      type: DataTypes.ENUM('inbox', 'sent', 'drafts', 'trash', 'archive'),
      allowNull: false,
      defaultValue: 'inbox',
    },
    status: {
      type: DataTypes.ENUM('unread', 'read', 'replied', 'forwarded'),
      allowNull: false,
      defaultValue: 'unread',
    },
    starred: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    important: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    from: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    to: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    cc: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    bcc: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    replyTo: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'reply_to',
    },
    subject: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      defaultValue: '(No Subject)',
    },
    bodyText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'body_text',
    },
    bodyHtml: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'body_html',
    },
    snippet: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    attachments: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    hasAttachments: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'has_attachments',
    },
    labels: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    headers: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_at',
    },
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'received_at',
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  },
  {
    sequelize,
    tableName: 'emails',
    underscored: true,
    paranoid: false, // We handle soft deletes manually with deletedAt
    indexes: [
      { fields: ['user_id'] },
      { fields: ['account_email'] },
      { fields: ['folder'] },
      { fields: ['status'] },
      { fields: ['starred'] },
      { fields: ['received_at'] },
      { fields: ['thread_id'] },
      { fields: ['message_id'], unique: true },
      { fields: ['deleted_at'] },
      { fields: ['user_id', 'folder'] },
      { fields: ['user_id', 'account_email'] },
    ],
  }
);

export default Email;
