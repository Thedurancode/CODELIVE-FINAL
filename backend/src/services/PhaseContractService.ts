/**
 * Phase Contract Service
 *
 * Automatically sends contracts via DocuSeal based on compliance phase transitions.
 * Handles template selection, field mapping, signer resolution, and tracking.
 *
 * Smart Features:
 * - Configurable signer resolution chains (declarative, not hard-coded)
 * - Pre-flight validation of required fields before sending
 * - Email validation to prevent delivery failures
 * - Multi-source fallback signer resolution
 * - OCR data integration from contract extraction
 * - Intelligent field transforms (currency, date, uppercase)
 * - Parallel contract sending for efficiency
 * - Dead letter queue integration for failed sends
 * - Smart deduplication (prevents re-sending active contracts)
 * - Context caching for performance
 * - Manual signer override capability
 * - Missing contact feedback for UI
 * - Audit trail for all contract events
 */

import sequelize from '../config/database';
import StateDocumentTemplate, {
  DocumentCategory,
  TriggerOn,
  SignerRole,
} from '../models/StateDocumentTemplate';
import { docuSealService } from './DocuSealService';

// ============================================================================
// TYPES
// ============================================================================

export interface ContractRequirement {
  template: StateDocumentTemplate;
  required: boolean;
  conditionsMet: boolean;
  alreadySent: boolean;
  submissionId?: number;
  submissionStatus?: string;
  missingSigners?: MissingSignerInfo[];
}

export interface Signer {
  email: string;
  name: string;
  role: SignerRole;
  phone?: string;
  contactId?: number; // Link back to source contact
  source?: string; // Where this signer was resolved from
  verified?: boolean; // Whether contact has been verified
}

export interface MissingSignerInfo {
  role: SignerRole;
  reason: string;
  suggestedAction: string;
  attemptedSources: string[];
}

export interface SignerOverride {
  role: SignerRole;
  contactId?: number;
  email?: string;
  name?: string;
  phone?: string;
}

export interface ContractSendResult {
  success: boolean;
  templateId: number;
  templateName: string;
  category: DocumentCategory;
  submissionId?: number;
  signers?: Signer[];
  missingSigners?: MissingSignerInfo[];
  error?: string;
  sentAt?: Date;
}

export interface DealContext {
  dealId: number;
  state: string;
  property?: any;
  compliance?: any;
  contacts?: any[];
  llcProfile?: any;
  pipeline?: any;
  ocrData?: any;
  dealMatches?: any[];
  signerOverrides?: SignerOverride[];
  distributionChannels?: string[];
  transactionType?: string;
  _cachedAt?: number;
}

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
  invalidEmails: string[];
  missingSigners: MissingSignerInfo[];
  warnings: string[];
}

// ============================================================================
// CONFIGURABLE SIGNER RESOLUTION CHAINS
// ============================================================================

interface SignerSourceConfig {
  source: 'contacts' | 'property' | 'llcProfile' | 'pipeline' | 'ocrData' | 'dealMatch' | 'compliance';
  filter?: Record<string, any>;
  fields?: {
    email: string;
    name: string | string[];
    phone?: string;
  };
  priority: number;
}

/**
 * Declarative signer resolution chains - easily configurable per role
 * Priority determines order (lower = tried first)
 */
const SIGNER_RESOLUTION_CHAINS: Record<SignerRole, SignerSourceConfig[]> = {
  seller: [
    {
      source: 'contacts',
      filter: { contact_type: ['seller', 'owner'] },
      priority: 1,
    },
    {
      source: 'property',
      fields: { email: 'seller_email', name: 'seller_name', phone: 'seller_phone' },
      priority: 2,
    },
    {
      source: 'ocrData',
      fields: { email: 'seller_email', name: 'seller_name', phone: 'seller_phone' },
      priority: 3,
    },
    {
      source: 'compliance',
      fields: { email: 'seller_email', name: 'seller_name' },
      priority: 4,
    },
  ],

  wholesaler: [
    {
      source: 'llcProfile',
      fields: { email: 'authorized_signer_email', name: 'authorized_signer_name', phone: 'authorized_signer_phone' },
      priority: 1,
    },
    {
      source: 'property',
      fields: { email: 'agent_email', name: ['agent_first_name', 'agent_last_name'] },
      priority: 2,
    },
    {
      source: 'property',
      fields: { email: 'wholesaler_email', name: 'wholesaler_name' },
      priority: 3,
    },
    {
      source: 'contacts',
      filter: { contact_type: ['wholesaler', 'agent'] },
      priority: 4,
    },
    {
      source: 'property',
      fields: { email: 'created_by_email', name: 'created_by_name' },
      priority: 5,
    },
  ],

  buyer: [
    {
      source: 'pipeline',
      fields: { email: 'buyer_email', name: 'buyer_name', phone: 'buyer_phone' },
      priority: 1,
    },
    {
      source: 'pipeline',
      fields: { email: 'assignee_email', name: 'assignee_name' },
      priority: 2,
    },
    {
      source: 'dealMatch',
      priority: 3,
    },
    {
      source: 'contacts',
      filter: { contact_type: ['buyer', 'assignee'] },
      priority: 4,
    },
    {
      source: 'property',
      fields: { email: 'buyer_email', name: 'buyer_name' },
      priority: 5,
    },
  ],

  broker: [
    {
      source: 'contacts',
      filter: { contact_type: ['broker', 'agent'] },
      priority: 1,
    },
    {
      source: 'property',
      fields: { email: 'broker_email', name: 'broker_name', phone: 'broker_phone' },
      priority: 2,
    },
    {
      source: 'compliance',
      fields: { email: 'broker_email', name: 'broker_name' },
      priority: 3,
    },
  ],
};

// Required fields per document category
const REQUIRED_FIELDS: Record<string, string[]> = {
  csa: ['company_name', 'signer_email'],
  msa: ['company_name', 'property_address', 'signer_email'],
  asa: ['company_name', 'property_address', 'signer_email'],
  assignment_addendum: ['property_address', 'assignor_name', 'assignee_name', 'assignee_email'],
  wholesaler_disclosure: ['property_address', 'seller_name', 'seller_email'],
  cancellation_disclosure: ['property_address', 'seller_name', 'seller_email'],
  purchase_contract: ['property_address', 'seller_name', 'seller_email'],
  seller_acknowledgment: ['property_address', 'seller_name', 'seller_email'],
};

// ============================================================================
// CONTEXT CACHE
// ============================================================================

interface CacheEntry {
  context: DealContext;
  expiresAt: number;
}

const CONTEXT_CACHE_TTL_MS = 30000; // 30 seconds

// ============================================================================
// SERVICE
// ============================================================================

class PhaseContractService {
  private contextCache: Map<string, CacheEntry> = new Map();

  /**
   * Get all contracts required for a phase with their status and missing signer info
   */
  async getPhaseContracts(
    dealId: number,
    state: string,
    phase: number
  ): Promise<ContractRequirement[]> {
    const templates = await StateDocumentTemplate.getForPhase(state, phase);

    if (templates.length === 0) {
      return [];
    }

    const context = await this.buildDealContext(dealId, state);
    const existingSubmissions = await this.getExistingSubmissions(dealId);

    const requirements: ContractRequirement[] = [];

    for (const template of templates) {
      const conditionsMet = template.meetsConditions({
        distributionChannels: context.distributionChannels,
        transactionType: context.transactionType,
      });

      const existing = existingSubmissions.find(
        (s) =>
          s.template_id === template.docuSealTemplateId ||
          s.document_type === template.category
      );

      // Check for missing signers
      const signerCheck = await this.checkSignerAvailability(dealId, template);

      requirements.push({
        template,
        required: template.autoSend || false,
        conditionsMet,
        alreadySent: !!existing,
        submissionId: existing?.id,
        submissionStatus: existing?.status,
        missingSigners: signerCheck.missing,
      });
    }

    return requirements;
  }

  /**
   * Check which signers are available and which are missing
   * Returns detailed info for UI feedback
   */
  async checkSignerAvailability(
    dealId: number,
    template: StateDocumentTemplate
  ): Promise<{ available: Signer[]; missing: MissingSignerInfo[] }> {
    const roles = template.signerRoles || ['wholesaler'];
    const context = await this.buildDealContext(dealId, template.state);
    const available: Signer[] = [];
    const missing: MissingSignerInfo[] = [];

    for (const role of roles) {
      const result = await this.resolveSignerForRoleWithDetails(role, context);

      if (result.signer) {
        available.push(result.signer);
      } else {
        missing.push({
          role,
          reason: result.reason || 'No contact found',
          suggestedAction: this.getSuggestedActionForRole(role),
          attemptedSources: result.attemptedSources,
        });
      }
    }

    return { available, missing };
  }

  /**
   * Get missing signers for a template - used by UI to show what's needed
   */
  async getMissingSigners(
    dealId: number,
    templateId: number
  ): Promise<MissingSignerInfo[]> {
    const template = await StateDocumentTemplate.findByPk(templateId);
    if (!template) return [];

    const check = await this.checkSignerAvailability(dealId, template);
    return check.missing;
  }

  /**
   * Get suggested action for adding a missing signer
   */
  private getSuggestedActionForRole(role: SignerRole): string {
    switch (role) {
      case 'seller':
        return 'Add seller contact with email via Contacts tab or import from skip trace';
      case 'buyer':
        return 'Assign a buyer in Pipeline or add buyer contact';
      case 'wholesaler':
        return 'Complete LLC profile setup with authorized signer info';
      case 'broker':
        return 'Add broker contact if this deal requires broker involvement';
      default:
        return `Add ${role} contact with valid email`;
    }
  }

  /**
   * Set manual signer overrides for a deal
   * Allows user to specify exact contacts to use instead of auto-resolution
   */
  async setSignerOverrides(
    dealId: number,
    state: string,
    overrides: SignerOverride[]
  ): Promise<void> {
    // Validate overrides
    for (const override of overrides) {
      if (override.contactId) {
        // Verify contact exists and belongs to this deal
        const [results] = await sequelize.query(
          `SELECT id, email, name, contact_type FROM property_contacts
           WHERE id = :contactId AND property_id = :dealId LIMIT 1`,
          { replacements: { contactId: override.contactId, dealId } }
        );
        const contact = (results as any[])?.[0];
        if (!contact) {
          throw new Error(`Contact ${override.contactId} not found for deal ${dealId}`);
        }
        if (!contact.email || !this.isValidEmail(contact.email)) {
          throw new Error(`Contact ${override.contactId} has invalid or missing email`);
        }
      } else if (override.email) {
        if (!this.isValidEmail(override.email)) {
          throw new Error(`Invalid email for ${override.role}: ${override.email}`);
        }
        if (!override.name) {
          throw new Error(`Name required when specifying email for ${override.role}`);
        }
      } else {
        throw new Error(`Override for ${override.role} must have contactId or email`);
      }
    }

    // Store overrides in compliance record
    await sequelize.query(
      `UPDATE state_deal_compliance
       SET state_specific_data = jsonb_set(
         COALESCE(state_specific_data, '{}'),
         '{signerOverrides}',
         :overrides::jsonb
       ),
       updated_at = NOW()
       WHERE deal_id = :dealId AND state = :state`,
      {
        replacements: {
          dealId,
          state: state.toUpperCase(),
          overrides: JSON.stringify(overrides),
        },
      }
    );

    // Invalidate cache
    this.invalidateContextCache(dealId, state);

    console.log(`[PhaseContractService] Set ${overrides.length} signer overrides for deal ${dealId}`);
  }

  /**
   * Clear signer overrides for a deal
   */
  async clearSignerOverrides(dealId: number, state: string): Promise<void> {
    await sequelize.query(
      `UPDATE state_deal_compliance
       SET state_specific_data = state_specific_data - 'signerOverrides',
       updated_at = NOW()
       WHERE deal_id = :dealId AND state = :state`,
      { replacements: { dealId, state: state.toUpperCase() } }
    );

    this.invalidateContextCache(dealId, state);
  }

  /**
   * Build contract fields from deal data
   */
  async buildContractFields(
    dealId: number,
    template: StateDocumentTemplate
  ): Promise<Record<string, any>> {
    const context = await this.buildDealContext(dealId, template.state);
    const fields: Record<string, any> = {};

    // Default field mappings - using smart fields that resolve from contacts
    const defaultMappings: Record<string, string> = {
      // Property address fields
      property_address: '_full_address',
      street_address: 'address',
      city: 'city',
      state: 'state',
      zip: 'zip_code',
      county: 'county',

      // Price fields
      purchase_price: 'purchase_contract_price',
      asking_price: 'asking_price',
      arv: 'arv',
      earnest_money: 'earnest_money',
      assignment_fee: 'assignment_fee',

      // Date fields
      closing_date: 'purchase_contract_expiration',
      contract_date: 'created_at',
      today_date: '_today',

      // LLC/Company fields
      llc_name: 'llc_legal_name',
      llc_ein: 'llc_ein',
      company_name: '_llc_legal_name',

      // SMART SELLER FIELDS - resolves from contacts (owner/seller) first
      seller_name: '_seller_name',
      seller_email: '_seller_email',
      seller_phone: '_seller_phone',
      seller_full_name: '_seller_name',

      // SMART BUYER FIELDS - resolves from pipeline, deal matches, contacts
      buyer_name: '_buyer_name',
      buyer_email: '_buyer_email',
      buyer_phone: '_buyer_phone',
      assignee_name: '_buyer_name',
      assignee_email: '_buyer_email',

      // SMART WHOLESALER FIELDS - resolves from LLC profile, property, contacts
      wholesaler_name: '_wholesaler_name',
      wholesaler_email: '_wholesaler_email',
      wholesaler_phone: '_wholesaler_phone',
      assignor_name: '_wholesaler_name',
      assignor_email: '_wholesaler_email',

      // SMART BROKER FIELDS - resolves from contacts, property, compliance
      broker_name: '_broker_name',
      broker_email: '_broker_email',
      broker_phone: '_broker_phone',
    };

    const mappings = { ...defaultMappings, ...(template.fieldMappings || {}) };

    for (const [docuSealField, sourceField] of Object.entries(mappings)) {
      const value = this.resolveField(sourceField, context);
      if (value !== undefined && value !== null) {
        fields[docuSealField] = value;
      }
    }

    return fields;
  }

  /**
   * Resolve a field value from the deal context with smart fallback chain
   */
  private resolveField(
    fieldPath: string | { source: string; field: string; transform?: string },
    context: DealContext
  ): any {
    let path: string;
    let transform: string | undefined;
    let sourceHint: string | undefined;

    if (typeof fieldPath === 'object') {
      path = fieldPath.field;
      transform = fieldPath.transform;
      sourceHint = fieldPath.source;
    } else {
      path = fieldPath;
    }

    if (path.startsWith('_')) {
      return this.computeSpecialField(path, context);
    }

    let value: any;

    if (sourceHint) {
      switch (sourceHint) {
        case 'property':
          value = this.getNestedValue(context.property, path);
          break;
        case 'compliance':
          value = this.getNestedValue(context.compliance, path);
          break;
        case 'llcProfile':
          value = this.getNestedValue(context.llcProfile, path);
          break;
        case 'contacts':
          for (const contact of context.contacts || []) {
            value = this.getNestedValue(contact, path);
            if (value !== undefined) break;
          }
          break;
        case 'ocrData':
          value = this.getNestedValue(context.ocrData, path);
          break;
        case 'pipeline':
          value = this.getNestedValue(context.pipeline, path);
          break;
        case 'static':
          if (path === 'today') value = new Date().toISOString().split('T')[0];
          break;
      }
      if (value !== undefined) {
        return transform ? this.applyTransform(value, transform) : value;
      }
    }

    // Smart fallback chain
    const sources = [
      context.property,
      context.compliance,
      context.llcProfile,
      ...(context.contacts || []),
      context.ocrData,
      context.pipeline,
    ];

    for (const source of sources) {
      if (source) {
        value = this.getNestedValue(source, path);
        if (value !== undefined) {
          return transform ? this.applyTransform(value, transform) : value;
        }
      }
    }

    return undefined;
  }

  /**
   * Compute special fields (prefixed with _)
   * Smart contact resolution for seller/buyer/wholesaler/broker fields
   */
  private computeSpecialField(field: string, context: DealContext): any {
    const prop = context.property || {};
    const llc = context.llcProfile || {};
    const pipeline = context.pipeline || {};
    const ocrData = context.ocrData || {};
    const contacts = context.contacts || [];

    // Helper to find contact by type(s)
    // Checks: contact_type (role from property_contacts), type (from contacts table), category
    const findContact = (types: string[]): any => {
      return contacts.find((c: any) =>
        types.includes(c.contact_type) || // role from property_contacts (aliased)
        types.includes(c.type) ||          // type from contacts table
        types.includes(c.category)         // fallback
      );
    };

    switch (field) {
      case '_today':
        return new Date().toISOString().split('T')[0];

      case '_full_address':
        return [prop.address, prop.city, prop.state, prop.zip_code]
          .filter(Boolean)
          .join(', ');

      case '_wholesaler_full_name':
        return [prop.agent_first_name, prop.agent_last_name]
          .filter(Boolean)
          .join(' ');

      case '_llc_legal_name':
        return llc.legal_name || prop.wholesaler_llc_name;

      case '_assignee_name':
        return pipeline.buyer_name || pipeline.assignee_name;

      case '_assignee_email':
        return pipeline.buyer_email || pipeline.assignee_email;

      // =======================================================================
      // SMART SELLER FIELDS - Resolves from contacts first, then property
      // =======================================================================
      case '_seller_name':
      case '_seller_full_name': {
        const sellerContact = findContact(['seller', 'owner']);
        if (sellerContact?.name) return sellerContact.name;
        if (sellerContact?.full_name) return sellerContact.full_name;
        return prop.seller_name || ocrData?.seller_name || '';
      }

      case '_seller_email': {
        const sellerContact = findContact(['seller', 'owner']);
        if (sellerContact?.email) return sellerContact.email;
        return prop.seller_email || ocrData?.seller_email || '';
      }

      case '_seller_phone': {
        const sellerContact = findContact(['seller', 'owner']);
        if (sellerContact?.phone) return sellerContact.phone;
        return prop.seller_phone || ocrData?.seller_phone || '';
      }

      case '_seller_names_all': {
        const sellers = contacts
          .filter((c: any) => ['seller', 'owner'].includes(c.contact_type) || ['seller', 'owner'].includes(c.category))
          .map((c: any) => c.name || c.full_name)
          .filter(Boolean);
        if (sellers.length > 0) return sellers.join(' and ');
        return prop.seller_name || '';
      }

      // =======================================================================
      // SMART BUYER FIELDS - Resolves from pipeline, dealMatch, contacts
      // =======================================================================
      case '_buyer_name': {
        // Pipeline takes priority (assigned buyer)
        if (pipeline.buyer_name) return pipeline.buyer_name;
        if (pipeline.assignee_name) return pipeline.assignee_name;
        // Then check contacts
        const buyerContact = findContact(['buyer', 'assignee']);
        if (buyerContact?.name) return buyerContact.name;
        if (buyerContact?.full_name) return buyerContact.full_name;
        // Then deal matches
        const topMatch = context.dealMatches?.[0];
        if (topMatch?.buyer_name) return topMatch.buyer_name;
        if (topMatch?.company_name) return topMatch.company_name;
        return prop.buyer_name || '';
      }

      case '_buyer_email': {
        if (pipeline.buyer_email) return pipeline.buyer_email;
        if (pipeline.assignee_email) return pipeline.assignee_email;
        const buyerContact = findContact(['buyer', 'assignee']);
        if (buyerContact?.email) return buyerContact.email;
        const topMatch = context.dealMatches?.[0];
        if (topMatch?.buyer_email) return topMatch.buyer_email;
        if (topMatch?.contact_email) return topMatch.contact_email;
        return prop.buyer_email || '';
      }

      case '_buyer_phone': {
        if (pipeline.buyer_phone) return pipeline.buyer_phone;
        const buyerContact = findContact(['buyer', 'assignee']);
        if (buyerContact?.phone) return buyerContact.phone;
        const topMatch = context.dealMatches?.[0];
        if (topMatch?.buyer_phone) return topMatch.buyer_phone;
        if (topMatch?.contact_phone) return topMatch.contact_phone;
        return prop.buyer_phone || '';
      }

      // =======================================================================
      // SMART WHOLESALER FIELDS - Resolves from LLC profile, property, contacts
      // =======================================================================
      case '_wholesaler_name': {
        // LLC profile authorized signer takes priority
        if (llc.authorized_signer_name) return llc.authorized_signer_name;
        // Then agent fields
        const agentName = [prop.agent_first_name, prop.agent_last_name].filter(Boolean).join(' ');
        if (agentName) return agentName;
        if (prop.wholesaler_name) return prop.wholesaler_name;
        // Then contacts
        const wholesalerContact = findContact(['wholesaler', 'agent']);
        if (wholesalerContact?.name) return wholesalerContact.name;
        return '';
      }

      case '_wholesaler_email': {
        if (llc.authorized_signer_email) return llc.authorized_signer_email;
        if (prop.agent_email) return prop.agent_email;
        if (prop.wholesaler_email) return prop.wholesaler_email;
        const wholesalerContact = findContact(['wholesaler', 'agent']);
        if (wholesalerContact?.email) return wholesalerContact.email;
        return '';
      }

      case '_wholesaler_phone': {
        if (llc.authorized_signer_phone) return llc.authorized_signer_phone;
        if (prop.agent_phone) return prop.agent_phone;
        if (prop.wholesaler_phone) return prop.wholesaler_phone;
        const wholesalerContact = findContact(['wholesaler', 'agent']);
        if (wholesalerContact?.phone) return wholesalerContact.phone;
        return '';
      }

      // =======================================================================
      // SMART BROKER FIELDS - Resolves from contacts, property, compliance
      // =======================================================================
      case '_broker_name': {
        const brokerContact = findContact(['broker', 'agent']);
        if (brokerContact?.name) return brokerContact.name;
        if (brokerContact?.full_name) return brokerContact.full_name;
        return prop.broker_name || context.compliance?.broker_name || '';
      }

      case '_broker_email': {
        const brokerContact = findContact(['broker', 'agent']);
        if (brokerContact?.email) return brokerContact.email;
        return prop.broker_email || context.compliance?.broker_email || '';
      }

      case '_broker_phone': {
        const brokerContact = findContact(['broker', 'agent']);
        if (brokerContact?.phone) return brokerContact.phone;
        return prop.broker_phone || context.compliance?.broker_phone || '';
      }

      // =======================================================================
      // OTHER COMPUTED FIELDS
      // =======================================================================
      case '_purchase_price_formatted':
        const price = prop.purchase_contract_price || prop.asking_price;
        return price ? `$${Number(price).toLocaleString()}` : '';

      case '_assignment_fee_formatted':
        const fee = prop.assignment_fee;
        return fee ? `$${Number(fee).toLocaleString()}` : '';

      case '_closing_date':
        const expDate = prop.purchase_contract_expiration;
        if (expDate) return new Date(expDate).toLocaleDateString('en-US');
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        return futureDate.toLocaleDateString('en-US');

      case '_contract_price_with_assignment':
        const askPrice = parseFloat(prop.asking_price) || 0;
        const assignFee = parseFloat(prop.assignment_fee) || 0;
        return `$${(askPrice + assignFee).toLocaleString()}`;

      case '_property_legal_description':
        return prop.legal_description || ocrData?.legal_description || '';

      default:
        return undefined;
    }
  }

  /**
   * Resolve signers for a template using configurable chains
   */
  async resolveSigners(
    dealId: number,
    template: StateDocumentTemplate
  ): Promise<Signer[]> {
    const roles = template.signerRoles || ['wholesaler'];
    const context = await this.buildDealContext(dealId, template.state);
    const signers: Signer[] = [];

    for (const role of roles) {
      const result = await this.resolveSignerForRoleWithDetails(role, context);
      if (result.signer) {
        signers.push(result.signer);
      }
    }

    return signers;
  }

  /**
   * Resolve a single signer using configurable resolution chains
   * Returns detailed info about resolution attempt
   */
  private async resolveSignerForRoleWithDetails(
    role: SignerRole,
    context: DealContext
  ): Promise<{
    signer: Signer | null;
    reason?: string;
    attemptedSources: string[];
  }> {
    const attemptedSources: string[] = [];

    // 1. Check for manual override first
    const override = context.signerOverrides?.find((o) => o.role === role);
    if (override) {
      if (override.contactId) {
        const contact = context.contacts?.find((c) => c.id === override.contactId);
        if (contact && contact.email && this.isValidEmail(contact.email)) {
          return {
            signer: {
              email: contact.email,
              name: contact.name || contact.full_name || role,
              role,
              phone: contact.phone,
              contactId: contact.id,
              source: 'manual_override',
              verified: contact.verified || false,
            },
            attemptedSources: ['manual_override'],
          };
        }
      } else if (override.email && this.isValidEmail(override.email)) {
        return {
          signer: {
            email: override.email,
            name: override.name || role,
            role,
            phone: override.phone,
            source: 'manual_override',
          },
          attemptedSources: ['manual_override'],
        };
      }
      attemptedSources.push('manual_override (invalid)');
    }

    // 2. Use configurable resolution chain
    const chain = SIGNER_RESOLUTION_CHAINS[role];
    if (!chain) {
      return {
        signer: null,
        reason: `No resolution chain configured for role: ${role}`,
        attemptedSources,
      };
    }

    // Sort by priority
    const sortedChain = [...chain].sort((a, b) => a.priority - b.priority);

    for (const sourceConfig of sortedChain) {
      attemptedSources.push(sourceConfig.source);
      const signer = this.tryResolveFromSource(sourceConfig, role, context);

      if (signer) {
        return { signer, attemptedSources };
      }
    }

    return {
      signer: null,
      reason: `No valid contact found after checking ${attemptedSources.length} sources`,
      attemptedSources,
    };
  }

  /**
   * Try to resolve a signer from a specific source
   */
  private tryResolveFromSource(
    config: SignerSourceConfig,
    role: SignerRole,
    context: DealContext
  ): Signer | null {
    switch (config.source) {
      case 'contacts':
        return this.resolveFromContacts(config, role, context);

      case 'property':
        return this.resolveFromFields(config, role, context.property);

      case 'llcProfile':
        return this.resolveFromFields(config, role, context.llcProfile);

      case 'pipeline':
        return this.resolveFromFields(config, role, context.pipeline);

      case 'ocrData':
        return this.resolveFromFields(config, role, context.ocrData);

      case 'compliance':
        return this.resolveFromFields(config, role, context.compliance);

      case 'dealMatch':
        return this.resolveFromDealMatches(role, context);

      default:
        return null;
    }
  }

  /**
   * Resolve signer from contacts table with filtering
   */
  private resolveFromContacts(
    config: SignerSourceConfig,
    role: SignerRole,
    context: DealContext
  ): Signer | null {
    if (!context.contacts?.length) return null;

    const filter = config.filter || {};
    const contactTypes = filter.contact_type || [];

    // Find matching contacts
    // Checks: contact_type (role from property_contacts), type (from contacts table), category
    const matchingContacts = context.contacts.filter((contact) => {
      if (contactTypes.length > 0) {
        const types = Array.isArray(contactTypes) ? contactTypes : [contactTypes];
        const matchesType =
          types.includes(contact.contact_type) || // role from property_contacts (aliased)
          types.includes(contact.type) ||          // type from contacts table
          types.includes(contact.category);        // fallback
        if (!matchesType) {
          return false;
        }
      }
      return contact.email && this.isValidEmail(contact.email);
    });

    // Prefer verified contacts
    matchingContacts.sort((a, b) => {
      if (a.verified && !b.verified) return -1;
      if (!a.verified && b.verified) return 1;
      // Then by most recently updated
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    });

    const contact = matchingContacts[0];
    if (!contact) return null;

    return {
      email: contact.email,
      name: contact.name || contact.full_name || role,
      role,
      phone: contact.phone,
      contactId: contact.id,
      source: 'contacts',
      verified: contact.verified || false,
    };
  }

  /**
   * Resolve signer from object fields
   */
  private resolveFromFields(
    config: SignerSourceConfig,
    role: SignerRole,
    source: any
  ): Signer | null {
    if (!source || !config.fields) return null;

    const email = source[config.fields.email];
    if (!email || !this.isValidEmail(email)) return null;

    let name: string;
    if (Array.isArray(config.fields.name)) {
      name = config.fields.name
        .map((f) => source[f])
        .filter(Boolean)
        .join(' ');
    } else {
      name = source[config.fields.name];
    }

    return {
      email,
      name: name || role,
      role,
      phone: config.fields.phone ? source[config.fields.phone] : undefined,
      source: config.source,
    };
  }

  /**
   * Resolve buyer from deal matches
   */
  private resolveFromDealMatches(role: SignerRole, context: DealContext): Signer | null {
    if (role !== 'buyer' || !context.dealMatches?.length) return null;

    // Sort by score and find one with valid email
    const sortedMatches = [...context.dealMatches].sort(
      (a, b) => (b.score || 0) - (a.score || 0)
    );

    for (const match of sortedMatches) {
      const email = match.buyer_email || match.contact_email;
      if (email && this.isValidEmail(email)) {
        return {
          email,
          name: match.buyer_name || match.company_name || 'Buyer',
          role: 'buyer',
          phone: match.buyer_phone || match.contact_phone,
          source: 'dealMatch',
        };
      }
    }

    return null;
  }

  /**
   * Send a single phase contract
   */
  async sendPhaseContract(
    dealId: number,
    state: string,
    phase: number,
    templateId?: number
  ): Promise<ContractSendResult> {
    let template: StateDocumentTemplate | null = null;

    if (templateId) {
      template = await StateDocumentTemplate.findByPk(templateId);
    } else {
      const templates = await StateDocumentTemplate.getAutoSendTemplates(
        state,
        phase,
        'phase_enter'
      );
      template = templates[0] || null;
    }

    if (!template) {
      return {
        success: false,
        templateId: templateId || 0,
        templateName: 'Unknown',
        category: 'other',
        error: 'Template not found',
      };
    }

    const context = await this.buildDealContext(dealId, state);
    if (!template.meetsConditions(context)) {
      return {
        success: false,
        templateId: template.id,
        templateName: template.name,
        category: template.category,
        error: 'Template conditions not met',
      };
    }

    const existing = await this.getExistingSubmissionForTemplate(
      dealId,
      template.docuSealTemplateId
    );
    if (existing && existing.status !== 'expired' && existing.status !== 'declined') {
      return {
        success: false,
        templateId: template.id,
        templateName: template.name,
        category: template.category,
        submissionId: existing.id,
        error: `Contract already sent (status: ${existing.status})`,
      };
    }

    try {
      // Pre-flight validation
      const validation = await this.validateBeforeSend(dealId, template);
      if (!validation.valid) {
        const errorParts = [
          ...validation.missingFields.map((f) => `Missing: ${f}`),
          ...validation.invalidEmails.map((e) => `Invalid email: ${e}`),
          ...validation.missingSigners.map((s) => `Missing ${s.role}: ${s.reason}`),
        ];
        const errorMsg = errorParts.join('; ');

        await this.queueToDeadLetter(dealId, template, errorMsg, context);

        return {
          success: false,
          templateId: template.id,
          templateName: template.name,
          category: template.category,
          missingSigners: validation.missingSigners,
          error: `Validation failed: ${errorMsg}`,
        };
      }

      if (validation.warnings.length > 0) {
        console.warn(
          `[PhaseContractService] Warnings for ${template.category}: ${validation.warnings.join(', ')}`
        );
      }

      const fields = await this.buildContractFields(dealId, template);
      const signers = await this.resolveSigners(dealId, template);

      if (signers.length === 0) {
        const signerCheck = await this.checkSignerAvailability(dealId, template);
        await this.queueToDeadLetter(dealId, template, 'No signers could be resolved', context);
        return {
          success: false,
          templateId: template.id,
          templateName: template.name,
          category: template.category,
          missingSigners: signerCheck.missing,
          error: 'No signers could be resolved',
        };
      }

      if (!docuSealService.isReady()) {
        await this.queueToDeadLetter(dealId, template, 'DocuSeal service not configured', context);
        return {
          success: false,
          templateId: template.id,
          templateName: template.name,
          category: template.category,
          error: 'DocuSeal service not configured',
        };
      }

      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + (template.expiresInDays || 30));

      const submission = await docuSealService.createSubmission({
        templateId: template.docuSealTemplateId,
        submitters: signers.map((s) => ({
          email: s.email,
          name: s.name,
          role: s.role,
          phone: s.phone,
          fields: fields,
        })),
        sendEmail: true,
        expireAt,
        metadata: {
          dealId: dealId.toString(),
          phase: phase.toString(),
          state,
          category: template.category,
        },
      });

      await this.trackSubmission(
        dealId,
        template,
        submission.id,
        signers,
        expireAt
      );

      console.log(
        `[PhaseContractService] Sent ${template.category} contract for deal ${dealId} phase ${phase}`
      );

      return {
        success: true,
        templateId: template.id,
        templateName: template.name,
        category: template.category,
        submissionId: submission.id,
        signers,
        sentAt: new Date(),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[PhaseContractService] Error sending contract:', error);

      await this.queueToDeadLetter(dealId, template, errorMsg, { dealId, state });
      await this.logContractEvent(dealId, 'send_failed', {
        templateId: template.id,
        category: template.category,
        error: errorMsg,
      });

      return {
        success: false,
        templateId: template.id,
        templateName: template.name,
        category: template.category,
        error: errorMsg,
      };
    }
  }

  /**
   * Send all required contracts for a phase (runs in parallel)
   */
  async sendAllPhaseContracts(
    dealId: number,
    state: string,
    phase: number,
    triggerOn: TriggerOn = 'phase_enter'
  ): Promise<ContractSendResult[]> {
    const templates = await StateDocumentTemplate.getAutoSendTemplates(
      state,
      phase,
      triggerOn
    );

    if (templates.length === 0) {
      console.log(
        `[PhaseContractService] No auto-send templates for ${state} phase ${phase}`
      );
      return [];
    }

    const context = await this.buildDealContext(dealId, state);

    const eligibleTemplates = templates.filter((template) => {
      const meetsConditions = template.meetsConditions(context);
      if (!meetsConditions) {
        console.log(
          `[PhaseContractService] Skipping ${template.category} - conditions not met`
        );
      }
      return meetsConditions;
    });

    if (eligibleTemplates.length === 0) {
      console.log(
        `[PhaseContractService] No eligible templates for ${state} phase ${phase}`
      );
      return [];
    }

    console.log(
      `[PhaseContractService] Sending ${eligibleTemplates.length} contracts in parallel for deal ${dealId} phase ${phase}`
    );

    const results = await Promise.allSettled(
      eligibleTemplates.map((template) =>
        this.sendPhaseContract(dealId, state, phase, template.id)
      )
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          templateId: eligibleTemplates[index].id,
          templateName: eligibleTemplates[index].name,
          category: eligibleTemplates[index].category,
          error: result.reason?.message || 'Unknown error',
        };
      }
    });
  }

  /**
   * Check if all required contracts for a phase are signed
   */
  async arePhaseContractsSigned(
    dealId: number,
    state: string,
    phase: number
  ): Promise<boolean> {
    const requirements = await this.getPhaseContracts(dealId, state, phase);
    const required = requirements.filter((r) => r.required && r.conditionsMet);

    if (required.length === 0) {
      return true;
    }

    return required.every(
      (r) => r.alreadySent && r.submissionStatus === 'completed'
    );
  }

  /**
   * Get status of phase contracts with missing signer info
   */
  async getPhaseContractStatus(
    dealId: number,
    state: string,
    phase: number
  ): Promise<{
    total: number;
    sent: number;
    signed: number;
    pending: number;
    allSigned: boolean;
    contracts: ContractRequirement[];
    missingSigners: MissingSignerInfo[];
  }> {
    const requirements = await this.getPhaseContracts(dealId, state, phase);

    const required = requirements.filter((r) => r.required && r.conditionsMet);
    const sent = required.filter((r) => r.alreadySent);
    const signed = sent.filter((r) => r.submissionStatus === 'completed');
    const pending = sent.filter(
      (r) =>
        r.submissionStatus !== 'completed' &&
        r.submissionStatus !== 'declined' &&
        r.submissionStatus !== 'expired'
    );

    // Collect all missing signers across templates
    const allMissingSigners: MissingSignerInfo[] = [];
    for (const req of required) {
      if (req.missingSigners?.length) {
        for (const missing of req.missingSigners) {
          // Dedupe by role
          if (!allMissingSigners.find((m) => m.role === missing.role)) {
            allMissingSigners.push(missing);
          }
        }
      }
    }

    return {
      total: required.length,
      sent: sent.length,
      signed: signed.length,
      pending: pending.length,
      allSigned: required.length > 0 && signed.length === required.length,
      contracts: requirements,
      missingSigners: allMissingSigners,
    };
  }

  /**
   * Retry a failed contract send from dead letter queue
   */
  async retryFromDeadLetter(deadLetterId: number): Promise<ContractSendResult> {
    try {
      const [results] = await sequelize.query(
        `SELECT * FROM dead_letter_queue WHERE id = :id AND action_type = 'send_contract' LIMIT 1`,
        { replacements: { id: deadLetterId } }
      );

      const deadLetter = (results as any[])?.[0];
      if (!deadLetter) {
        return {
          success: false,
          templateId: 0,
          templateName: 'Unknown',
          category: 'other',
          error: 'Dead letter entry not found',
        };
      }

      const payload = typeof deadLetter.payload === 'string'
        ? JSON.parse(deadLetter.payload)
        : deadLetter.payload;

      const result = await this.sendPhaseContract(
        deadLetter.entity_id,
        payload.state,
        payload.phase,
        payload.templateId
      );

      if (result.success) {
        await sequelize.query(
          `DELETE FROM dead_letter_queue WHERE id = :id`,
          { replacements: { id: deadLetterId } }
        );
        console.log(`[PhaseContractService] Successfully retried dead letter ${deadLetterId}`);
      } else {
        await sequelize.query(
          `UPDATE dead_letter_queue
           SET retry_count = retry_count + 1,
               last_retry_at = NOW(),
               error_message = :error,
               updated_at = NOW()
           WHERE id = :id`,
          { replacements: { id: deadLetterId, error: result.error } }
        );
      }

      return result;
    } catch (error) {
      return {
        success: false,
        templateId: 0,
        templateName: 'Unknown',
        category: 'other',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get pending items from dead letter queue
   */
  async getDeadLetterItems(dealId?: number): Promise<any[]> {
    try {
      let query = `SELECT * FROM dead_letter_queue WHERE action_type = 'send_contract'`;
      const replacements: any = {};

      if (dealId) {
        query += ` AND entity_id = :dealId`;
        replacements.dealId = dealId;
      }

      query += ` ORDER BY created_at DESC LIMIT 50`;

      const [results] = await sequelize.query(query, { replacements });
      return results as any[];
    } catch {
      return [];
    }
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate email format with stronger checks
   */
  private isValidEmail(email: string): boolean {
    if (!email) return false;
    const trimmed = email.trim().toLowerCase();
    // More comprehensive email regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(trimmed)) return false;
    // Check for common invalid patterns
    if (trimmed.includes('..')) return false;
    if (trimmed.startsWith('.') || trimmed.endsWith('.')) return false;
    // Check domain has at least one dot
    const domain = trimmed.split('@')[1];
    if (!domain || !domain.includes('.')) return false;
    return true;
  }

  /**
   * Pre-flight validation before sending
   */
  async validateBeforeSend(
    dealId: number,
    template: StateDocumentTemplate
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      missingFields: [],
      invalidEmails: [],
      missingSigners: [],
      warnings: [],
    };

    const context = await this.buildDealContext(dealId, template.state);
    const fields = await this.buildContractFields(dealId, template);
    const signerCheck = await this.checkSignerAvailability(dealId, template);

    // Check required fields
    const requiredFields = REQUIRED_FIELDS[template.category] || [];
    for (const field of requiredFields) {
      if (!fields[field] || (typeof fields[field] === 'string' && !fields[field].trim())) {
        result.missingFields.push(field);
      }
    }

    // Validate signer emails
    for (const signer of signerCheck.available) {
      if (!this.isValidEmail(signer.email)) {
        result.invalidEmails.push(`${signer.role}: ${signer.email || 'missing'}`);
      }
    }

    // Add missing signers
    result.missingSigners = signerCheck.missing;

    // Check for no signers
    if (signerCheck.available.length === 0) {
      result.missingFields.push('No signers could be resolved');
    }

    // Warnings
    if (!template.docuSealTemplateId) {
      result.warnings.push('DocuSeal template ID not configured');
    }
    if (!context.llcProfile) {
      result.warnings.push('LLC profile not found - some fields may be missing');
    }
    if (!context.property) {
      result.warnings.push('Property not found');
    }

    // Check for unverified contacts (warning only)
    const unverifiedSigners = signerCheck.available.filter((s) => !s.verified);
    if (unverifiedSigners.length > 0) {
      result.warnings.push(
        `Unverified contacts: ${unverifiedSigners.map((s) => s.role).join(', ')}`
      );
    }

    result.valid =
      result.missingFields.length === 0 &&
      result.invalidEmails.length === 0 &&
      result.missingSigners.length === 0;

    return result;
  }

  /**
   * Apply field transforms
   */
  private applyTransform(value: any, transform?: string): any {
    if (value === undefined || value === null) return value;

    switch (transform) {
      case 'currency':
        const num = parseFloat(value);
        if (!isNaN(num)) {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(num);
        }
        return value;

      case 'date':
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
        return value;

      case 'date_short':
        const shortDate = new Date(value);
        if (!isNaN(shortDate.getTime())) {
          return shortDate.toLocaleDateString('en-US');
        }
        return value;

      case 'uppercase':
        return typeof value === 'string' ? value.toUpperCase() : value;

      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value;

      case 'phone':
        const cleaned = String(value).replace(/\D/g, '');
        if (cleaned.length === 10) {
          return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        return value;

      default:
        return value;
    }
  }

  // ============================================================================
  // CONTEXT BUILDING & CACHING
  // ============================================================================

  /**
   * Invalidate context cache for a deal
   */
  private invalidateContextCache(dealId: number, state: string): void {
    const cacheKey = `${dealId}:${state.toUpperCase()}`;
    this.contextCache.delete(cacheKey);
  }

  /**
   * Build deal context with caching
   */
  private async buildDealContext(
    dealId: number,
    state: string
  ): Promise<DealContext> {
    const cacheKey = `${dealId}:${state.toUpperCase()}`;
    const now = Date.now();

    // Check cache
    const cached = this.contextCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.context;
    }

    const context: DealContext = { dealId, state };

    try {
      // Run queries in parallel for performance
      const [
        propResults,
        compResults,
        contactResults,
        pipelineResults,
        matchResults,
      ] = await Promise.all([
        sequelize.query('SELECT * FROM properties WHERE id = :dealId LIMIT 1', {
          replacements: { dealId },
        }),
        sequelize.query(
          `SELECT * FROM state_deal_compliance WHERE deal_id = :dealId AND state = :state LIMIT 1`,
          { replacements: { dealId, state: state.toUpperCase() } }
        ),
        sequelize.query(
          `SELECT pc.role as contact_type, pc.is_primary, c.id, c.name, c.email, c.phone,
                  c.company, c.type, c.license_number, c.license_state, c.metadata,
                  c.signature_storage_key, c.status
           FROM property_contacts pc
           JOIN contacts c ON pc.contact_id = c.id
           WHERE pc.property_id = :dealId
           ORDER BY pc.is_primary DESC`,
          { replacements: { dealId } }
        ),
        sequelize.query('SELECT * FROM deal_pipeline WHERE property_id = :dealId LIMIT 1', {
          replacements: { dealId },
        }),
        sequelize.query(
          `SELECT dm.*, b.email as buyer_email, b.company_name, bc.email as contact_email, bc.phone as contact_phone
           FROM deal_matches dm
           LEFT JOIN buyers b ON dm.buyer_id = b.id
           LEFT JOIN buyer_contacts bc ON b.id = bc.buyer_id AND bc.is_primary = true
           WHERE dm.property_id = :dealId
           ORDER BY dm.score DESC LIMIT 5`,
          { replacements: { dealId } }
        ),
      ]);

      context.property = (propResults[0] as any[])?.[0];
      context.compliance = (compResults[0] as any[])?.[0];
      context.contacts = contactResults[0] as any[];
      context.pipeline = (pipelineResults[0] as any[])?.[0];
      context.dealMatches = matchResults[0] as any[];

      // Get distribution channels and overrides from compliance
      const stateData = context.compliance?.state_specific_data || {};
      context.distributionChannels = stateData.distributionChannels || [];
      context.transactionType = stateData.transactionType || 'wholesale';
      context.signerOverrides = stateData.signerOverrides || [];

      // Get LLC profile
      if (context.property?.llc_profile_id) {
        const [llcResults] = await sequelize.query(
          'SELECT * FROM llc_profiles WHERE id = :llcId LIMIT 1',
          { replacements: { llcId: context.property.llc_profile_id } }
        );
        context.llcProfile = (llcResults as any[])?.[0];
      }

      // Get OCR data
      context.ocrData = await this.getOCRData(dealId);

      context._cachedAt = now;

      // Store in cache
      this.contextCache.set(cacheKey, {
        context,
        expiresAt: now + CONTEXT_CACHE_TTL_MS,
      });

      // Clean old entries periodically
      if (this.contextCache.size > 100) {
        this.cleanExpiredCache();
      }
    } catch (error) {
      console.error('[PhaseContractService] Error building context:', error);
    }

    return context;
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.contextCache.entries()) {
      if (entry.expiresAt <= now) {
        this.contextCache.delete(key);
      }
    }
  }

  /**
   * Get OCR extracted data for a deal
   */
  private async getOCRData(dealId: number): Promise<any> {
    try {
      const [results] = await sequelize.query(
        `SELECT extracted_data, ocr_results
         FROM property_documents
         WHERE property_id = :dealId
           AND (extracted_data IS NOT NULL OR ocr_results IS NOT NULL)
         ORDER BY created_at DESC LIMIT 1`,
        { replacements: { dealId } }
      );
      const doc = (results as any[])?.[0];
      return doc?.extracted_data || doc?.ocr_results || {};
    } catch {
      return {};
    }
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value === undefined || value === null) return undefined;
      value = value[part];
    }
    return value;
  }

  /**
   * Queue failed send to dead letter
   */
  private async queueToDeadLetter(
    dealId: number,
    template: StateDocumentTemplate,
    error: string,
    context: any
  ): Promise<void> {
    try {
      await sequelize.query(
        `INSERT INTO dead_letter_queue
         (entity_type, entity_id, action_type, payload, error_message, retry_count, created_at, updated_at)
         VALUES ('contract', :dealId, 'send_contract', :payload, :error, 0, NOW(), NOW())`,
        {
          replacements: {
            dealId,
            payload: JSON.stringify({
              templateId: template.id,
              templateName: template.name,
              category: template.category,
              phase: template.phase,
              state: template.state,
            }),
            error,
          },
        }
      );
      console.log(`[PhaseContractService] Queued failed send to dead letter: deal ${dealId}, ${template.category}`);
    } catch (dlError) {
      console.error('[PhaseContractService] Failed to queue to dead letter:', dlError);
    }
  }

  /**
   * Get existing submissions for a deal
   */
  private async getExistingSubmissions(dealId: number): Promise<any[]> {
    try {
      const [results] = await sequelize.query(
        `SELECT id, template_id, document_type, status, created_at
         FROM docuseal_submissions
         WHERE property_id = :dealId`,
        { replacements: { dealId } }
      );
      return results as any[];
    } catch {
      return [];
    }
  }

  /**
   * Get existing submission for a specific template
   */
  private async getExistingSubmissionForTemplate(
    dealId: number,
    templateId: number
  ): Promise<any | null> {
    try {
      const [results] = await sequelize.query(
        `SELECT id, template_id, status
         FROM docuseal_submissions
         WHERE property_id = :dealId AND template_id = :templateId
         ORDER BY created_at DESC LIMIT 1`,
        { replacements: { dealId, templateId } }
      );
      return (results as any[])?.[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Track submission in local database
   */
  private async trackSubmission(
    dealId: number,
    template: StateDocumentTemplate,
    docuSealSubmissionId: number,
    signers: Signer[],
    expireAt: Date
  ): Promise<void> {
    try {
      await sequelize.query(
        `INSERT INTO docuseal_submissions
         (property_id, template_id, template_name, document_type, status,
          submitters, expire_at, sent_at, created_at, updated_at)
         VALUES
         (:propertyId, :templateId, :templateName, :documentType, 'sent',
          :submitters, :expireAt, NOW(), NOW(), NOW())`,
        {
          replacements: {
            propertyId: dealId,
            templateId: template.docuSealTemplateId,
            templateName: template.name,
            documentType: template.category,
            submitters: JSON.stringify(
              signers.map((s) => ({
                email: s.email,
                name: s.name,
                role: s.role,
                source: s.source,
                contactId: s.contactId,
              }))
            ),
            expireAt: expireAt.toISOString(),
          },
        }
      );
    } catch (error) {
      console.error('[PhaseContractService] Error tracking submission:', error);
    }
  }

  /**
   * Log contract event for audit trail
   */
  async logContractEvent(
    dealId: number,
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await sequelize.query(
        `INSERT INTO compliance_audit_log
         (property_id, action_type, action_details, created_at)
         VALUES (:dealId, :actionType, :details, NOW())`,
        {
          replacements: {
            dealId,
            actionType: `contract.${action}`,
            details: JSON.stringify(details),
          },
        }
      );
    } catch (error) {
      console.error('[PhaseContractService] Error logging event:', error);
    }
  }
}

export const phaseContractService = new PhaseContractService();
export default phaseContractService;
