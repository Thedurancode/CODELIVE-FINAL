/**
 * List DocuSeal Templates
 *
 * Quick script to see what templates are available in your DocuSeal account.
 * Run with: npx ts-node src/scripts/listDocuSealTemplates.ts
 */

import { docuSealService } from '../services/DocuSealService';

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config();

async function listTemplates() {
  console.log('📄 Fetching DocuSeal templates...\n');

  // Initialize the service (loads env vars)
  docuSealService.initialize();

  if (!docuSealService.isReady()) {
    console.log('❌ DocuSeal service not configured.');
    console.log('   Check that DOCUSEAL_API_KEY and DOCUSEAL_API_URL are set in your .env file.\n');
    process.exit(1);
  }

  try {
    const templates = await docuSealService.listTemplates({ limit: 100 });

    if (templates.length === 0) {
      console.log('No templates found in DocuSeal.');
      console.log('Create templates at your DocuSeal dashboard first.\n');
      process.exit(0);
    }

    console.log(`Found ${templates.length} template(s):\n`);
    console.log('='.repeat(80));
    console.log(`${'ID'.padEnd(8)} | ${'Name'.padEnd(40)} | ${'Fields'.padEnd(8)} | Created`);
    console.log('='.repeat(80));

    for (const t of templates) {
      const id = String(t.id).padEnd(8);
      const name = (t.name || 'Untitled').substring(0, 38).padEnd(40);
      const fields = String(t.fields?.length || 0).padEnd(8);
      const created = t.created_at ? new Date(t.created_at).toLocaleDateString() : 'Unknown';
      console.log(`${id} | ${name} | ${fields} | ${created}`);
    }

    console.log('='.repeat(80));
    console.log('\n📋 Template details for Oklahoma mapping:\n');

    // Map to Oklahoma categories based on name patterns
    const categoryPatterns: Record<string, string[]> = {
      csa: ['csa', 'client services', 'compliance services'],
      msa: ['msa', 'marketing services', 'marketing agreement'],
      asa: ['asa', 'auction services', 'auction agreement'],
      purchase_contract: ['purchase', 'psa', 'purchase agreement', 'real estate contract'],
      assignment_addendum: ['assignment', 'addendum'],
      seller_disclosure: ['seller disclosure', 'property disclosure'],
      wholesaler_disclosure: ['wholesaler disclosure', 'position disclosure'],
      equity_disclosure: ['equity disclosure'],
      seller_acknowledgment: ['seller acknowledgment', 'seller ack', 'acknowledgment'],
      cancellation_disclosure: ['cancellation', 'right to cancel', '3-day'],
      double_close_psa: ['double close', 'double closing', 'bc psa'],
      closing_disclosure: ['closing disclosure', 'settlement'],
    };

    const suggestions: { templateId: number; templateName: string; suggestedCategory: string }[] = [];

    for (const t of templates) {
      const nameLower = (t.name || '').toLowerCase();
      for (const [category, patterns] of Object.entries(categoryPatterns)) {
        if (patterns.some(p => nameLower.includes(p))) {
          suggestions.push({
            templateId: t.id,
            templateName: t.name || 'Untitled',
            suggestedCategory: category,
          });
          break;
        }
      }
    }

    if (suggestions.length > 0) {
      console.log('Suggested category mappings based on template names:');
      console.log('-'.repeat(60));
      for (const s of suggestions) {
        console.log(`  ${s.suggestedCategory.padEnd(25)} → ID: ${s.templateId} (${s.templateName})`);
      }
      console.log('\nTo update, run SQL like:');
      console.log(`  UPDATE state_document_templates SET docu_seal_template_id = <ID> WHERE state = 'OK' AND category = '<category>';`);
    } else {
      console.log('No matching template names found. You may need to rename templates in DocuSeal or manually map them.');
    }

    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error fetching templates:', error);
    process.exit(1);
  }
}

listTemplates();
