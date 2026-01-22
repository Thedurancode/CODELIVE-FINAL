/**
 * Quick seed for Oklahoma document templates
 * Run with: npx ts-node src/seeds/seedOklahomaTemplates.ts
 */

import sequelize from '../config/database';
import StateDocumentTemplate from '../models/StateDocumentTemplate';

// Oklahoma Document Templates (7-Phase Structure)
// Phase 0: Account Setup & Entity Verification
// Phase 1: Property Submission
// Phase 2: Compliance Review & Approval
// Phase 3: Approved / Pre-Distribution
// Phase 4: Offer Accepted / Pre-Buyer Seller Acknowledgment (3-day hold)
// Phase 5: Buyer Contract Execution
// Phase 6: Title, Closing & Settlement
const OKLAHOMA_TEMPLATES = [
  {
    state: 'OK',
    category: 'purchase_contract',
    name: 'Purchase and Sale Agreement',
    description: 'Main purchase contract for Oklahoma properties',
    docuSealTemplateId: 1, // Placeholder - update with actual template ID
    requiredFor: ['wholesaling', 'all'],
    enabled: true,
    priority: 100,
    phase: 1, // Property Submission
    triggerOn: 'manual' as const,
    autoSend: false,
    signerRoles: ['seller', 'buyer'],
    expiresInDays: 30,
  },
  {
    state: 'OK',
    category: 'assignment_addendum',
    name: 'Assignment of Contract Addendum',
    description: 'Assigns contract rights to end buyer (wholesale transactions)',
    docuSealTemplateId: 2, // Placeholder
    requiredFor: ['wholesaling', 'all'],
    enabled: true,
    priority: 90,
    phase: 5, // Buyer Contract Execution
    triggerOn: 'phase_enter' as const,
    autoSend: true,
    signerRoles: ['wholesaler', 'buyer'],
    expiresInDays: 7,
  },
  {
    state: 'OK',
    category: 'seller_disclosure',
    name: 'Seller Property Disclosure',
    description: 'Oklahoma seller disclosure statement',
    docuSealTemplateId: 3, // Placeholder
    requiredFor: ['wholesaling', 'retail', 'all'],
    enabled: true,
    priority: 80,
    phase: 1, // Property Submission
    triggerOn: 'manual' as const,
    autoSend: false,
    signerRoles: ['seller'],
    expiresInDays: 30,
  },
];

async function seedOklahoma() {
  try {
    console.log('🌱 Seeding Oklahoma document templates...');

    await sequelize.authenticate();
    console.log('✅ Database connected');

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const template of OKLAHOMA_TEMPLATES) {
      const existing = await StateDocumentTemplate.findOne({
        where: {
          state: template.state,
          category: template.category,
        },
      });

      if (!existing) {
        await StateDocumentTemplate.create(template as any);
        console.log(`✅ Created "${template.name}"`);
        created++;
      } else {
        console.log(`⏭️  Skipping "${template.name}" (already exists)`);
        skipped++;
      }
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedOklahoma();
