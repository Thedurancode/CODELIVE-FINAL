/**
 * State Document Template Model
 *
 * Links DocuSeal templates to states for compliance documents.
 * When a deal needs a document, we know which template to use.
 */

import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export type DocumentCategory =
  | 'purchase_contract'       // Main purchase/assignment contract
  | 'assignment_addendum'     // Assignment of contract addendum
  | 'seller_disclosure'       // Seller's disclosure form
  | 'lead_paint'              // Lead-based paint disclosure
  | 'hoa_disclosure'          // HOA disclosure
  | 'inspection_notice'       // Inspection contingency
  | 'financing_addendum'      // Financing terms
  | 'closing_instructions'    // Title/closing instructions
  | 'proof_of_funds'          // POF letter template
  | 'offer_letter'            // LOI / Offer letter
  | 'jv_agreement'            // Joint venture agreement
  | 'csa'                     // Client Services Agreement
  | 'msa'                     // Marketing Services Agreement
  | 'asa'                     // Auction Services Agreement
  | 'cancellation_disclosure' // Cancellation/Right-to-Cancel form
  | 'disclosure_addendum'     // Wholesale disclosure addendum
  | 'seller_acknowledgment'   // Seller acknowledgment of assignment intent
  | 'wholesaler_disclosure'   // Wholesaler position disclosure
  | 'equity_disclosure'       // Equity position disclosure
  | 'double_close_psa'        // PSA for double closing (wholesaler to buyer)
  | 'hubzu_addendum'          // Hubzu auction platform addendum
  | 'wiring_instructions'     // Wire transfer instructions
  | 'settlement_statement'    // Settlement/closing statement
  | 'other';

export type TriggerOn = 'phase_enter' | 'phase_complete' | 'manual';

export type SignerRole = 'seller' | 'buyer' | 'wholesaler' | 'broker';

export interface ConditionalOn {
  distributionChannels?: string[];  // e.g., ['auction'] - only send if auction selected
  transactionType?: string;         // e.g., 'wholesale' - only for this transaction type
  [key: string]: any;
}

// Field mapping can be a simple string (field name) or complex object with source/field/transform
export type FieldMappingValue = string | {
  source: string;
  field: string;
  transform?: string;
};

export interface StateDocumentTemplateAttributes {
  id?: number;
  state: string;                    // State code or 'ALL'
  category: DocumentCategory;
  name: string;                     // Human-readable name
  description?: string;
  docuSealTemplateId: number;       // DocuSeal template ID
  docuSealTemplateName?: string;    // Cached template name
  requiredFor?: string[];           // When is this required? ['wholesaling', 'retail', 'all']
  fieldMappings?: Record<string, FieldMappingValue>; // Map our fields to DocuSeal fields
  enabled: boolean;
  priority: number;                 // If multiple templates, use highest priority
  // Phase-related fields for auto-send
  phase?: number;                   // Compliance phase (0-11) this document is for
  triggerOn?: TriggerOn;            // When to trigger: phase_enter, phase_complete, manual
  autoSend?: boolean;               // Auto-send when trigger fires
  signerRoles?: SignerRole[];       // Who needs to sign: seller, buyer, wholesaler, broker
  conditionalOn?: ConditionalOn;    // Conditions for when this doc is required
  expiresInDays?: number;           // Days until contract expires (default 30)
  createdAt?: Date;
  updatedAt?: Date;
}

class StateDocumentTemplate extends Model<StateDocumentTemplateAttributes> implements StateDocumentTemplateAttributes {
  public id!: number;
  public state!: string;
  public category!: DocumentCategory;
  public name!: string;
  public description?: string;
  public docuSealTemplateId!: number;
  public docuSealTemplateName?: string;
  public requiredFor?: string[];
  public fieldMappings?: Record<string, FieldMappingValue>;
  public enabled!: boolean;
  public priority!: number;
  // Phase-related fields
  public phase?: number;
  public triggerOn?: TriggerOn;
  public autoSend?: boolean;
  public signerRoles?: SignerRole[];
  public conditionalOn?: ConditionalOn;
  public expiresInDays?: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Get templates for a state and category
   */
  static async getForState(
    state: string,
    category?: DocumentCategory
  ): Promise<StateDocumentTemplate[]> {
    const where: any = {
      state: [state.toUpperCase(), 'ALL'],
      enabled: true,
    };
    if (category) where.category = category;

    return this.findAll({
      where,
      order: [['priority', 'DESC']],
    });
  }

  /**
   * Get the primary template for a state/category combination
   */
  static async getPrimaryTemplate(
    state: string,
    category: DocumentCategory
  ): Promise<StateDocumentTemplate | null> {
    const templates = await this.getForState(state, category);
    return templates[0] || null;
  }

  /**
   * Get all required templates for a state
   */
  static async getRequiredTemplates(
    state: string,
    transactionType: 'wholesaling' | 'retail' | 'all' = 'all'
  ): Promise<StateDocumentTemplate[]> {
    const { Op } = require('sequelize');

    return this.findAll({
      where: {
        state: [state.toUpperCase(), 'ALL'],
        enabled: true,
        requiredFor: {
          [Op.overlap]: [transactionType, 'all'],
        },
      },
      order: [['category', 'ASC'], ['priority', 'DESC']],
    });
  }

  /**
   * Get templates for a specific compliance phase
   */
  static async getForPhase(
    state: string,
    phase: number,
    options?: { autoSendOnly?: boolean }
  ): Promise<StateDocumentTemplate[]> {
    const where: any = {
      state: [state.toUpperCase(), 'ALL'],
      enabled: true,
      phase,
    };

    if (options?.autoSendOnly) {
      where.autoSend = true;
    }

    return this.findAll({
      where,
      order: [['priority', 'DESC']],
    });
  }

  /**
   * Get auto-send templates for a phase and trigger type
   */
  static async getAutoSendTemplates(
    state: string,
    phase: number,
    triggerOn: TriggerOn
  ): Promise<StateDocumentTemplate[]> {
    return this.findAll({
      where: {
        state: [state.toUpperCase(), 'ALL'],
        enabled: true,
        phase,
        autoSend: true,
        triggerOn,
      },
      order: [['priority', 'DESC']],
    });
  }

  /**
   * Check if a template's conditions are met for a deal
   */
  meetsConditions(dealContext: {
    distributionChannels?: string[];
    transactionType?: string;
    [key: string]: any;
  }): boolean {
    if (!this.conditionalOn) return true;

    // Check distribution channel condition
    if (this.conditionalOn.distributionChannels?.length) {
      const dealChannels = dealContext.distributionChannels || [];
      const hasRequiredChannel = this.conditionalOn.distributionChannels.some(
        (ch) => dealChannels.includes(ch)
      );
      if (!hasRequiredChannel) return false;
    }

    // Check transaction type condition
    if (this.conditionalOn.transactionType) {
      if (dealContext.transactionType !== this.conditionalOn.transactionType) {
        return false;
      }
    }

    return true;
  }
}

// Initialize the model
StateDocumentTemplate.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      state: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM(
          'purchase_contract',
          'assignment_addendum',
          'seller_disclosure',
          'lead_paint',
          'hoa_disclosure',
          'inspection_notice',
          'financing_addendum',
          'closing_instructions',
          'proof_of_funds',
          'offer_letter',
          'jv_agreement',
          'csa',
          'msa',
          'asa',
          'cancellation_disclosure',
          'disclosure_addendum',
          'seller_acknowledgment',
          'wholesaler_disclosure',
          'equity_disclosure',
          'double_close_psa',
          'hubzu_addendum',
          'wiring_instructions',
          'settlement_statement',
          'other'
        ),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      docuSealTemplateId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      docuSealTemplateName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      requiredFor: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: ['all'],
      },
      fieldMappings: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50,
      },
      phase: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Compliance phase (0-11) this document is required for',
      },
      triggerOn: {
        type: DataTypes.ENUM('phase_enter', 'phase_complete', 'manual'),
        allowNull: true,
        defaultValue: 'manual',
        field: 'trigger_on',
        comment: 'When to trigger sending this document',
      },
      autoSend: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'auto_send',
        comment: 'Whether to automatically send when trigger fires',
      },
      signerRoles: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: [],
        field: 'signer_roles',
        comment: 'Roles that need to sign: seller, buyer, wholesaler, broker',
      },
      conditionalOn: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'conditional_on',
        comment: 'Conditions for when this document is required',
      },
      expiresInDays: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 30,
        field: 'expires_in_days',
        comment: 'Number of days until the sent contract expires',
      },
    },
    {
      sequelize,
      tableName: 'state_document_templates',
      timestamps: true,
      indexes: [
        { fields: ['state'] },
        { fields: ['state', 'category'] },
        { fields: ['docuSealTemplateId'] },
        { fields: ['state', 'phase'] },
        {
          fields: ['state', 'phase', 'auto_send'],
          where: { auto_send: true },
        },
      ],
    }
  );

export default StateDocumentTemplate;
