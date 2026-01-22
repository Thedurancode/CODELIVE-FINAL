/**
 * Seed Phase Contract Templates
 *
 * Creates StateDocumentTemplate entries that map phases to DocuSeal templates.
 * These templates are automatically sent when compliance phases are completed.
 *
 * Run with: npx ts-node src/seeds/seedPhaseContractTemplates.ts
 *
 * IMPORTANT: Update the docuSealTemplateId values with your actual DocuSeal template IDs!
 */

import sequelize from '../config/database';
import StateDocumentTemplate from '../models/StateDocumentTemplate';

interface PhaseTemplate {
  state: string;
  category: string;
  displayName: string;
  description: string;
  phase: number;
  triggerOn: 'phase_enter' | 'phase_complete' | 'manual';
  autoSend: boolean;
  signerRoles: string[];
  conditionalOn?: Record<string, any>;
  docuSealTemplateId: number | null; // Set to null until actual template ID is configured
  isPrimary: boolean;
  expiresInDays: number;
  fieldMappings?: Record<string, any>;
}

// Oklahoma Phase-to-Template Mappings (7-Phase Structure)
// Phase 0: Account Setup & Entity Verification
// Phase 1: Property Submission
// Phase 2: Compliance Review & Approval
// Phase 3: Approved / Pre-Distribution
// Phase 4: Offer Accepted / Pre-Buyer Seller Acknowledgment (3-day hold)
// Phase 5: Buyer Contract Execution
// Phase 6: Title, Closing & Settlement
// Update docuSealTemplateId values with your actual DocuSeal template IDs
const OKLAHOMA_PHASE_TEMPLATES: PhaseTemplate[] = [
  // ============================================================================
  // PHASE 0 - ACCOUNT SETUP & ENTITY VERIFICATION
  // ============================================================================
  {
    state: 'OK',
    category: 'csa',
    displayName: 'Compliance Services Agreement (CSA)',
    description: 'Agreement between wholesaler LLC and Dispotree for compliance services',
    phase: 0,
    triggerOn: 'phase_enter',
    autoSend: true,
    signerRoles: ['wholesaler'],
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 30,
    fieldMappings: {
      company_name: { source: 'llcProfile', field: 'legal_name' },
      signer_name: { source: 'llcProfile', field: 'authorized_signer_name' },
      signer_email: { source: 'llcProfile', field: 'authorized_signer_email' },
      ein: { source: 'llcProfile', field: 'ein' },
      state_of_formation: { source: 'llcProfile', field: 'state_of_formation' },
      effective_date: { source: 'static', field: 'today' },
    },
  },

  // ============================================================================
  // PHASE 1 - PROPERTY SUBMISSION
  // ============================================================================
  {
    state: 'OK',
    category: 'purchase_contract',
    displayName: 'Real Estate Purchase Contract',
    description: 'Standard Oklahoma RECA-approved purchase contract template',
    phase: 1,
    triggerOn: 'manual', // User uploads their contract, not auto-sent
    autoSend: false,
    signerRoles: ['seller', 'wholesaler'],
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 30,
    fieldMappings: {
      property_address: { source: 'property', field: '_full_address' },
      purchase_price: { source: 'property', field: 'asking_price', transform: 'currency' },
      buyer_name: { source: 'llcProfile', field: 'legal_name' },
      seller_name: { source: 'contacts', field: 'seller.full_name' },
    },
  },
  {
    state: 'OK',
    category: 'wholesaler_disclosure',
    displayName: 'Wholesaler Position Disclosure',
    description: 'Oklahoma-required disclosure of wholesaler intent and profit',
    phase: 1,
    triggerOn: 'phase_enter',
    autoSend: true,
    signerRoles: ['seller'],
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 14,
    fieldMappings: {
      property_address: { source: 'property', field: '_full_address' },
      seller_name: { source: 'contacts', field: 'seller.full_name' },
      wholesaler_company: { source: 'llcProfile', field: 'legal_name' },
      assignment_fee: { source: 'property', field: 'assignment_fee', transform: 'currency' },
      disclosure_date: { source: 'static', field: 'today' },
    },
  },
  {
    state: 'OK',
    category: 'equity_disclosure',
    displayName: 'Equity Position Disclosure',
    description: 'Disclosure of property equity and financial position',
    phase: 1,
    triggerOn: 'phase_enter',
    autoSend: true,
    signerRoles: ['seller'],
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 14,
    fieldMappings: {
      property_address: { source: 'property', field: '_full_address' },
      seller_name: { source: 'contacts', field: 'seller.full_name' },
      estimated_value: { source: 'property', field: 'arv', transform: 'currency' },
      purchase_price: { source: 'property', field: 'asking_price', transform: 'currency' },
    },
  },

  // ============================================================================
  // PHASE 3 - APPROVED / PRE-DISTRIBUTION
  // ============================================================================
  {
    state: 'OK',
    category: 'msa',
    displayName: 'Marketing Services Agreement (MSA)',
    description: 'Agreement for marketing property to buyers network',
    phase: 3,
    triggerOn: 'phase_enter',
    autoSend: true,
    signerRoles: ['wholesaler'],
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 30,
    fieldMappings: {
      company_name: { source: 'llcProfile', field: 'legal_name' },
      signer_name: { source: 'llcProfile', field: 'authorized_signer_name' },
      signer_email: { source: 'llcProfile', field: 'authorized_signer_email' },
      property_address: { source: 'property', field: '_full_address' },
      asking_price: { source: 'property', field: 'asking_price', transform: 'currency' },
    },
  },
  {
    state: 'OK',
    category: 'asa',
    displayName: 'Auction Services Agreement (ASA)',
    description: 'Agreement for auction distribution channel',
    phase: 3,
    triggerOn: 'phase_enter',
    autoSend: false, // Only sent when auction channel is selected
    signerRoles: ['wholesaler'],
    conditionalOn: {
      distributionChannels: ['auction'],
    },
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 30,
    fieldMappings: {
      company_name: { source: 'llcProfile', field: 'legal_name' },
      signer_name: { source: 'llcProfile', field: 'authorized_signer_name' },
      property_address: { source: 'property', field: '_full_address' },
      reserve_price: { source: 'property', field: 'asking_price', transform: 'currency' },
    },
  },

  // ============================================================================
  // PHASE 4 - OFFER ACCEPTED / PRE-BUYER SELLER ACKNOWLEDGMENT
  // 3-day statutory hold required before proceeding to Phase 5
  // ============================================================================
  {
    state: 'OK',
    category: 'seller_acknowledgment',
    displayName: 'Seller Assignment Acknowledgment',
    description: 'Seller acknowledgment of assignment intent - triggers 3-day statutory hold',
    phase: 4,
    triggerOn: 'phase_enter',
    autoSend: true,
    signerRoles: ['seller'],
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 7,
    fieldMappings: {
      property_address: { source: 'property', field: '_full_address' },
      seller_name: { source: 'contacts', field: 'seller.full_name' },
      wholesaler_company: { source: 'llcProfile', field: 'legal_name' },
      assignment_fee: { source: 'property', field: 'assignment_fee', transform: 'currency' },
      acknowledgment_date: { source: 'static', field: 'today' },
    },
  },
  {
    state: 'OK',
    category: 'cancellation_disclosure',
    displayName: 'Cancellation Rights Disclosure',
    description: 'Required 3-day cancellation disclosure per Oklahoma law',
    phase: 4,
    triggerOn: 'phase_enter',
    autoSend: true,
    signerRoles: ['seller'],
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 3, // Must be signed within cancellation period
    fieldMappings: {
      property_address: { source: 'property', field: '_full_address' },
      seller_name: { source: 'contacts', field: 'seller.full_name' },
      contract_date: { source: 'compliance', field: 'contract_acceptance_date', transform: 'date' },
      cancellation_deadline: { source: 'compliance', field: 'cancellation_deadline', transform: 'date' },
    },
  },

  // ============================================================================
  // PHASE 5 - BUYER CONTRACT EXECUTION
  // Either Assignment Agreement (wholesale) OR Double Close PSA
  // ============================================================================
  {
    state: 'OK',
    category: 'assignment_addendum',
    displayName: 'Assignment of Contract Addendum',
    description: 'Legal assignment of purchase contract to end buyer (wholesale transactions)',
    phase: 5,
    triggerOn: 'phase_enter',
    autoSend: true,
    signerRoles: ['wholesaler', 'buyer'],
    conditionalOn: {
      transactionType: 'wholesale',
    },
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 7,
    fieldMappings: {
      property_address: { source: 'property', field: '_full_address' },
      assignor_name: { source: 'llcProfile', field: 'legal_name' },
      assignee_name: { source: 'pipeline', field: '_assignee_name' },
      assignment_fee: { source: 'property', field: 'assignment_fee', transform: 'currency' },
      original_purchase_price: { source: 'property', field: 'asking_price', transform: 'currency' },
    },
  },
  {
    state: 'OK',
    category: 'double_close_psa',
    displayName: 'Purchase & Sale Agreement (Wholesaler to Buyer)',
    description: 'PSA for double closing transactions - wholesaler sells to end buyer',
    phase: 5,
    triggerOn: 'phase_enter',
    autoSend: true,
    signerRoles: ['wholesaler', 'buyer'],
    conditionalOn: {
      transactionType: 'double_closing',
    },
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 7,
    fieldMappings: {
      property_address: { source: 'property', field: '_full_address' },
      seller_name: { source: 'llcProfile', field: 'legal_name' },
      buyer_name: { source: 'pipeline', field: '_assignee_name' },
      purchase_price: { source: 'property', field: 'resale_price', transform: 'currency' },
      original_purchase_price: { source: 'property', field: 'asking_price', transform: 'currency' },
    },
  },

  // ============================================================================
  // PHASE 6 - TITLE, CLOSING & SETTLEMENT
  // These are typically handled outside the platform but tracked for compliance
  // ============================================================================
  {
    state: 'OK',
    category: 'closing_disclosure',
    displayName: 'Closing Disclosure',
    description: 'Final transaction disclosure document',
    phase: 6,
    triggerOn: 'manual', // Title company typically handles this
    autoSend: false,
    signerRoles: ['seller', 'buyer'],
    docuSealTemplateId: null, // TODO: Set your DocuSeal template ID
    isPrimary: true,
    expiresInDays: 14,
    fieldMappings: {
      property_address: { source: 'property', field: '_full_address' },
      seller_name: { source: 'contacts', field: 'seller.full_name' },
      buyer_name: { source: 'pipeline', field: '_assignee_name' },
      final_price: { source: 'property', field: 'asking_price', transform: 'currency' },
    },
  },
];

async function seedPhaseContractTemplates(): Promise<void> {
  console.log('🌱 Seeding Oklahoma phase contract templates...');
  console.log(`📋 ${OKLAHOMA_PHASE_TEMPLATES.length} templates to process\n`);

  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // Sync model (ensure table exists with new columns)
    await StateDocumentTemplate.sync({ alter: true });
    console.log('✅ StateDocumentTemplate table synced\n');

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const template of OKLAHOMA_PHASE_TEMPLATES) {
      // Check if template already exists
      const existing = await StateDocumentTemplate.findOne({
        where: {
          state: template.state,
          category: template.category,
          phase: template.phase,
        },
      });

      if (existing) {
        // Update if docuSealTemplateId is different or other fields changed
        if (
          existing.docuSealTemplateId !== template.docuSealTemplateId ||
          existing.triggerOn !== template.triggerOn ||
          existing.autoSend !== template.autoSend
        ) {
          await existing.update({
            name: template.displayName,
            description: template.description,
            triggerOn: template.triggerOn,
            autoSend: template.autoSend,
            signerRoles: template.signerRoles as any,
            conditionalOn: template.conditionalOn,
            docuSealTemplateId: template.docuSealTemplateId as any,
            expiresInDays: template.expiresInDays,
            fieldMappings: template.fieldMappings,
          });
          console.log(`🔄 Updated "${template.displayName}" (Phase ${template.phase})`);
          updated++;
        } else {
          console.log(`⏭️  Skipping "${template.displayName}" (no changes)`);
          skipped++;
        }
        continue;
      }

      // Create new template
      await StateDocumentTemplate.create({
        state: template.state,
        category: template.category,
        displayName: template.displayName,
        description: template.description,
        phase: template.phase,
        triggerOn: template.triggerOn,
        autoSend: template.autoSend,
        signerRoles: template.signerRoles,
        conditionalOn: template.conditionalOn,
        docuSealTemplateId: template.docuSealTemplateId,
        isPrimary: template.isPrimary,
        expiresInDays: template.expiresInDays,
        fieldMappings: template.fieldMappings,
      } as any);
      console.log(`✅ Created "${template.displayName}" (Phase ${template.phase})`);
      created++;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Summary:`);
    console.log(`   ✅ Created: ${created}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`${'='.repeat(60)}`);

    // Check for missing DocuSeal template IDs
    const missingIds = OKLAHOMA_PHASE_TEMPLATES.filter((t) => !t.docuSealTemplateId);
    if (missingIds.length > 0) {
      console.log(`\n⚠️  WARNING: ${missingIds.length} templates have no DocuSeal template ID:`);
      for (const t of missingIds) {
        console.log(`   - ${t.displayName} (${t.category}, Phase ${t.phase})`);
      }
      console.log(`\n   Update these in the database or re-run this seed with actual IDs.`);
    }

    console.log('\n✅ Seeding complete!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedPhaseContractTemplates()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { seedPhaseContractTemplates, OKLAHOMA_PHASE_TEMPLATES };
