/**
 * EmailInbox Model
 *
 * Tracks received emails and the deals extracted from them.
 * Used for auditing email ingestion and debugging extraction issues.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface ExtractedDeal {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  arv?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  propertyType?: string;
  confidence?: number;
  propertyId?: number; // ID of created property if saved to DB
}

export interface EmailInboxAttributes {
  id: number;
  sourceId: string;
  sourceName: string;
  messageId: string;
  from: string;
  to?: string;
  subject: string;
  receivedAt: Date;
  processedAt?: Date;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  parsingMode?: 'ai' | 'template' | 'regex';
  hasPdfAttachment: boolean;
  pdfFileName?: string;
  extractedDeals: ExtractedDeal[];
  dealCount: number;
  errorMessage?: string;
  rawEmailPreview?: string; // First 500 chars of email body
  processingTimeMs?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface EmailInboxCreationAttributes
  extends Optional<
    EmailInboxAttributes,
    | 'id'
    | 'to'
    | 'processedAt'
    | 'parsingMode'
    | 'pdfFileName'
    | 'extractedDeals'
    | 'dealCount'
    | 'errorMessage'
    | 'rawEmailPreview'
    | 'processingTimeMs'
    | 'createdAt'
    | 'updatedAt'
  > {}

class EmailInbox
  extends Model<EmailInboxAttributes, EmailInboxCreationAttributes>
  implements EmailInboxAttributes
{
  public id!: number;
  public sourceId!: string;
  public sourceName!: string;
  public messageId!: string;
  public from!: string;
  public to?: string;
  public subject!: string;
  public receivedAt!: Date;
  public processedAt?: Date;
  public status!: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  public parsingMode?: 'ai' | 'template' | 'regex';
  public hasPdfAttachment!: boolean;
  public pdfFileName?: string;
  public extractedDeals!: ExtractedDeal[];
  public dealCount!: number;
  public errorMessage?: string;
  public rawEmailPreview?: string;
  public processingTimeMs?: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Get inbox summary for a source
   */
  static async getSourceSummary(sourceId: string): Promise<{
    total: number;
    success: number;
    failed: number;
    pending: number;
    totalDeals: number;
    lastProcessed?: Date;
  }> {
    const { fn, col } = sequelize;

    const results = await EmailInbox.findAll({
      where: { sourceId },
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', col('dealCount')), 'totalDeals'],
        [fn('MAX', col('processedAt')), 'lastProcessed'],
      ],
      group: ['status'],
      raw: true,
    });

    const summary = {
      total: 0,
      success: 0,
      failed: 0,
      pending: 0,
      totalDeals: 0,
      lastProcessed: undefined as Date | undefined,
    };

    for (const row of results as any[]) {
      const count = parseInt(row.count, 10) || 0;
      summary.total += count;

      if (row.status === 'success') {
        summary.success = count;
        summary.totalDeals = parseInt(row.totalDeals, 10) || 0;
      } else if (row.status === 'failed') {
        summary.failed = count;
      } else if (row.status === 'pending' || row.status === 'processing') {
        summary.pending += count;
      }

      if (row.lastProcessed) {
        const date = new Date(row.lastProcessed);
        if (!summary.lastProcessed || date > summary.lastProcessed) {
          summary.lastProcessed = date;
        }
      }
    }

    return summary;
  }

  /**
   * Record an incoming email
   */
  static async recordEmail(
    sourceId: string,
    sourceName: string,
    email: {
      messageId: string;
      from: string;
      to?: string;
      subject: string;
      body?: string;
      receivedAt?: Date;
      hasPdfAttachment?: boolean;
      pdfFileName?: string;
    }
  ): Promise<EmailInbox> {
    return EmailInbox.create({
      sourceId,
      sourceName,
      messageId: email.messageId,
      from: email.from,
      to: email.to,
      subject: email.subject,
      receivedAt: email.receivedAt || new Date(),
      status: 'pending',
      hasPdfAttachment: email.hasPdfAttachment || false,
      pdfFileName: email.pdfFileName,
      extractedDeals: [],
      dealCount: 0,
      rawEmailPreview: email.body?.substring(0, 500),
    });
  }

  /**
   * Update email with extraction results
   */
  async recordExtractionResult(
    success: boolean,
    deals: ExtractedDeal[],
    parsingMode: 'ai' | 'template' | 'regex',
    processingTimeMs: number,
    errorMessage?: string
  ): Promise<void> {
    await this.update({
      status: success ? 'success' : 'failed',
      processedAt: new Date(),
      parsingMode,
      extractedDeals: deals,
      dealCount: deals.length,
      processingTimeMs,
      errorMessage,
    });
  }
}

EmailInbox.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    sourceId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'source_id',
    },
    sourceName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'source_name',
    },
    messageId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'message_id',
    },
    from: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    to: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'received_at',
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'success', 'failed', 'skipped'),
      allowNull: false,
      defaultValue: 'pending',
    },
    parsingMode: {
      type: DataTypes.ENUM('ai', 'template', 'regex'),
      allowNull: true,
      field: 'parsing_mode',
    },
    hasPdfAttachment: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'has_pdf_attachment',
    },
    pdfFileName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'pdf_file_name',
    },
    extractedDeals: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'extracted_deals',
    },
    dealCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'deal_count',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    },
    rawEmailPreview: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'raw_email_preview',
    },
    processingTimeMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'processing_time_ms',
    },
  },
  {
    sequelize,
    tableName: 'email_inbox',
    underscored: true,
    indexes: [
      { fields: ['source_id'] },
      { fields: ['status'] },
      { fields: ['received_at'] },
      { fields: ['message_id'], unique: true },
    ],
  }
);

export default EmailInbox;
