/**
 * ContractSigner Model
 *
 * Tracks individual signers for contract submissions (DocuSeal).
 * Links signers to contacts for CRM integration and enables
 * querying signer history across contracts.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export type SignerStatus = 'pending' | 'sent' | 'opened' | 'completed' | 'declined';

export interface ContractSignerAttributes {
  id: number;
  submissionId: number; // FK to DocuSealSubmission
  contactId?: string; // FK to Contact (optional - for linked contacts)
  projectId?: string; // FK to Project (denormalized for easier queries)

  // DocuSeal signer ID (from their API)
  docuSealSignerId?: number;

  // Signer info (may differ from Contact if external signer)
  email: string;
  name?: string;
  phone?: string;
  role: string; // e.g., "buyer", "seller", "witness", "notary"

  // Signing status
  status: SignerStatus;
  order?: number; // Signing order (1, 2, 3...)

  // Timestamps from signing process
  sentAt?: Date;
  openedAt?: Date;
  completedAt?: Date;
  declinedAt?: Date;
  declineReason?: string;

  // Signing URLs
  embedUrl?: string;
  signedDocumentUrl?: string;

  // Reminder tracking
  lastReminderAt?: Date;
  reminderCount: number;

  // Metadata
  metadata?: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

type ContractSignerCreationAttributes = Optional<
  ContractSignerAttributes,
  | 'id'
  | 'contactId'
  | 'projectId'
  | 'docuSealSignerId'
  | 'name'
  | 'phone'
  | 'order'
  | 'sentAt'
  | 'openedAt'
  | 'completedAt'
  | 'declinedAt'
  | 'declineReason'
  | 'embedUrl'
  | 'signedDocumentUrl'
  | 'lastReminderAt'
  | 'reminderCount'
  | 'metadata'
  | 'createdAt'
  | 'updatedAt'
>;

class ContractSigner
  extends Model<ContractSignerAttributes, ContractSignerCreationAttributes>
  implements ContractSignerAttributes
{
  declare id: number;
  declare submissionId: number;
  declare contactId?: string;
  declare projectId?: string;
  declare docuSealSignerId?: number;
  declare email: string;
  declare name?: string;
  declare phone?: string;
  declare role: string;
  declare status: SignerStatus;
  declare order?: number;
  declare sentAt?: Date;
  declare openedAt?: Date;
  declare completedAt?: Date;
  declare declinedAt?: Date;
  declare declineReason?: string;
  declare embedUrl?: string;
  declare signedDocumentUrl?: string;
  declare lastReminderAt?: Date;
  declare reminderCount: number;
  declare metadata?: Record<string, any>;
  declare createdAt: Date;
  declare updatedAt: Date;

  // ============================================================================
  // STATIC HELPER METHODS
  // ============================================================================

  /**
   * Find all signers for a submission
   */
  static async findBySubmissionId(submissionId: number): Promise<ContractSigner[]> {
    return ContractSigner.findAll({
      where: { submissionId },
      order: [['order', 'ASC'], ['createdAt', 'ASC']],
    });
  }

  /**
   * Find all signers for a project
   */
  static async findByProjectId(projectId: string): Promise<ContractSigner[]> {
    return ContractSigner.findAll({
      where: { projectId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Find all contracts a contact has signed or needs to sign
   */
  static async findByContactId(contactId: string): Promise<ContractSigner[]> {
    return ContractSigner.findAll({
      where: { contactId },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Find all contracts for an email address (including non-linked contacts)
   */
  static async findByEmail(email: string): Promise<ContractSigner[]> {
    return ContractSigner.findAll({
      where: { email: email.toLowerCase() },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Find pending signers that haven't completed
   */
  static async findPending(submissionId?: number): Promise<ContractSigner[]> {
    const where: any = {
      status: ['pending', 'sent', 'opened'],
    };
    if (submissionId) {
      where.submissionId = submissionId;
    }
    return ContractSigner.findAll({
      where,
      order: [['sentAt', 'ASC']],
    });
  }

  /**
   * Get signing statistics for a project
   */
  static async getProjectStats(projectId: string): Promise<{
    total: number;
    pending: number;
    sent: number;
    opened: number;
    completed: number;
    declined: number;
    completionRate: number;
  }> {
    const signers = await ContractSigner.findAll({
      where: { projectId },
    });

    const total = signers.length;
    const stats = {
      total,
      pending: 0,
      sent: 0,
      opened: 0,
      completed: 0,
      declined: 0,
      completionRate: 0,
    };

    for (const signer of signers) {
      stats[signer.status]++;
    }

    stats.completionRate = total > 0 ? (stats.completed / total) * 100 : 0;

    return stats;
  }

  /**
   * Get signing statistics for a contact
   */
  static async getContactStats(contactId: string): Promise<{
    totalContracts: number;
    completed: number;
    pending: number;
    declined: number;
  }> {
    const signers = await ContractSigner.findAll({
      where: { contactId },
    });

    return {
      totalContracts: signers.length,
      completed: signers.filter(s => s.status === 'completed').length,
      pending: signers.filter(s => ['pending', 'sent', 'opened'].includes(s.status)).length,
      declined: signers.filter(s => s.status === 'declined').length,
    };
  }

  // ============================================================================
  // INSTANCE METHODS
  // ============================================================================

  /**
   * Update status from DocuSeal webhook
   */
  async updateFromWebhook(data: {
    status?: SignerStatus;
    sentAt?: Date;
    openedAt?: Date;
    completedAt?: Date;
    declinedAt?: Date;
    declineReason?: string;
    embedUrl?: string;
    signedDocumentUrl?: string;
  }): Promise<ContractSigner> {
    const updates: Partial<ContractSignerAttributes> = {};

    if (data.status) updates.status = data.status;
    if (data.sentAt) updates.sentAt = data.sentAt;
    if (data.openedAt) updates.openedAt = data.openedAt;
    if (data.completedAt) updates.completedAt = data.completedAt;
    if (data.declinedAt) updates.declinedAt = data.declinedAt;
    if (data.declineReason) updates.declineReason = data.declineReason;
    if (data.embedUrl) updates.embedUrl = data.embedUrl;
    if (data.signedDocumentUrl) updates.signedDocumentUrl = data.signedDocumentUrl;

    return this.update(updates);
  }

  /**
   * Record reminder sent
   */
  async recordReminderSent(): Promise<ContractSigner> {
    return this.update({
      lastReminderAt: new Date(),
      reminderCount: (this.reminderCount || 0) + 1,
    });
  }

  /**
   * Link to a contact
   */
  async linkToContact(contactId: string): Promise<ContractSigner> {
    return this.update({ contactId });
  }

  /**
   * Check if signer has completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if signer has declined
   */
  isDeclined(): boolean {
    return this.status === 'declined';
  }

  /**
   * Check if awaiting action
   */
  isPending(): boolean {
    return ['pending', 'sent', 'opened'].includes(this.status);
  }
}

ContractSigner.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    submissionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'submission_id',
      references: {
        model: 'docuseal_submissions',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    contactId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'contact_id',
      references: {
        model: 'contacts',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    projectId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'project_id',
      references: {
        model: 'projects',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    docuSealSignerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'docuseal_signer_id',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      set(value: string) {
        this.setDataValue('email', value.toLowerCase().trim());
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'signer',
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'opened', 'completed', 'declined'),
      allowNull: false,
      defaultValue: 'pending',
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'signing_order',
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_at',
    },
    openedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'opened_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    declinedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'declined_at',
    },
    declineReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'decline_reason',
    },
    embedUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
      field: 'embed_url',
    },
    signedDocumentUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
      field: 'signed_document_url',
    },
    lastReminderAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_reminder_at',
    },
    reminderCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'reminder_count',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'contract_signers',
    modelName: 'ContractSigner',
    timestamps: true,
    indexes: [
      { fields: ['submission_id'] },
      { fields: ['contact_id'] },
      { fields: ['project_id'] },
      { fields: ['email'] },
      { fields: ['status'] },
      { fields: ['docuseal_signer_id'] },
      // Composite indexes
      { fields: ['submission_id', 'email'], unique: true },
      { fields: ['project_id', 'status'] },
      { fields: ['contact_id', 'status'] },
    ],
  }
);

export default ContractSigner;
