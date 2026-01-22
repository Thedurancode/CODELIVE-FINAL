/**
 * Show DocuSeal Template Fields
 *
 * Displays detailed field information for each template.
 * Run with: npx ts-node src/scripts/showTemplateFields.ts
 */

import { docuSealService } from '../services/DocuSealService';
import * as dotenv from 'dotenv';
dotenv.config();

async function showTemplateFields() {
  console.log('📄 Fetching DocuSeal template fields...\n');

  docuSealService.initialize();

  if (!docuSealService.isReady()) {
    console.log('❌ DocuSeal service not configured.');
    process.exit(1);
  }

  try {
    const templates = await docuSealService.listTemplates({ limit: 100 });

    // Filter to templates with fields
    const templatesWithFields = templates.filter((t: any) => t.fields && t.fields.length > 0);
    const templatesWithoutFields = templates.filter((t: any) => !t.fields || t.fields.length === 0);

    console.log(`📊 Summary:`);
    console.log(`   Total templates: ${templates.length}`);
    console.log(`   With fields configured: ${templatesWithFields.length}`);
    console.log(`   Without fields: ${templatesWithoutFields.length}`);
    console.log('');

    if (templatesWithFields.length === 0) {
      console.log('⚠️  No templates have fields configured yet.');
      console.log('   You need to add fields in DocuSeal template editor.\n');

      console.log('Templates without fields:');
      console.log('-'.repeat(60));
      for (const t of templatesWithoutFields) {
        console.log(`  ID: ${t.id} - ${t.name}`);
      }
      process.exit(0);
    }

    console.log('='.repeat(80));
    console.log('TEMPLATES WITH FIELDS CONFIGURED');
    console.log('='.repeat(80));

    for (const template of templatesWithFields) {
      console.log(`\n📋 ID: ${template.id} - ${template.name}`);
      console.log(`   Created: ${new Date(template.created_at).toLocaleDateString()}`);
      console.log(`   Fields (${template.fields.length}):`);
      console.log('   ' + '-'.repeat(70));

      for (const field of template.fields) {
        const required = field.required ? '(required)' : '(optional)';
        const type = field.type || 'text';
        const name = field.name || '(unnamed field)';
        console.log(`     • ${name.padEnd(35)} [${type.padEnd(12)}] ${required}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('TEMPLATES WITHOUT FIELDS (need configuration)');
    console.log('='.repeat(80));

    // Group by likely category
    const okTemplates = templatesWithoutFields.filter((t: any) =>
      t.name.toLowerCase().includes('ok') ||
      t.name.toLowerCase().includes('oklahoma') ||
      t.name.toLowerCase().includes('dispotree') ||
      t.name.toLowerCase().includes('csa') ||
      t.name.toLowerCase().includes('msa') ||
      t.name.toLowerCase().includes('asa')
    );

    const sampleTemplates = templatesWithoutFields.filter((t: any) =>
      t.name.toLowerCase().includes('sample') ||
      t.name.toLowerCase().includes('training')
    );

    const otherTemplates = templatesWithoutFields.filter((t: any) =>
      !okTemplates.includes(t) && !sampleTemplates.includes(t)
    );

    if (okTemplates.length > 0) {
      console.log('\n🏠 Oklahoma/Production Templates:');
      for (const t of okTemplates) {
        console.log(`   ID: ${String(t.id).padEnd(4)} - ${t.name}`);
      }
    }

    if (sampleTemplates.length > 0) {
      console.log('\n📚 Sample/Training Templates:');
      for (const t of sampleTemplates) {
        console.log(`   ID: ${String(t.id).padEnd(4)} - ${t.name}`);
      }
    }

    if (otherTemplates.length > 0) {
      console.log('\n📄 Other Templates:');
      for (const t of otherTemplates) {
        console.log(`   ID: ${String(t.id).padEnd(4)} - ${t.name}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('RECOMMENDED OKLAHOMA TEMPLATE MAPPING');
    console.log('='.repeat(80));

    // Find best matches for each category
    const recommendations = [
      { category: 'csa', phase: 0, patterns: ['csa', 'client services'], signers: ['wholesaler'] },
      { category: 'msa', phase: 3, patterns: ['ok-msa', 'ok-marketing', 'marketing services'], signers: ['wholesaler'] },
      { category: 'asa', phase: 3, patterns: ['ok-asa', 'ok-auction', 'auction services'], signers: ['wholesaler'] },
      { category: 'purchase_contract', phase: 1, patterns: ['purchase', 'psa', 'sale agreement'], signers: ['seller', 'wholesaler'] },
      { category: 'wholesaler_disclosure', phase: 1, patterns: ['wholesaler disclosure', 'oklahoma wholesaler'], signers: ['seller'] },
      { category: 'seller_acknowledgment', phase: 4, patterns: ['seller ack', 'acknowledgment'], signers: ['seller'] },
      { category: 'assignment_addendum', phase: 5, patterns: ['assignment'], signers: ['wholesaler', 'buyer'] },
    ];

    console.log('\nCategory'.padEnd(25) + 'Phase'.padEnd(8) + 'Template ID'.padEnd(14) + 'Has Fields?'.padEnd(14) + 'Signers');
    console.log('-'.repeat(85));

    for (const rec of recommendations) {
      let match = templates.find((t: any) => {
        const name = t.name.toLowerCase();
        return rec.patterns.some(p => name.includes(p)) && !name.includes('sample') && !name.includes('training');
      });

      // Fall back to sample/training if no production template
      if (!match) {
        match = templates.find((t: any) => {
          const name = t.name.toLowerCase();
          return rec.patterns.some(p => name.includes(p));
        });
      }

      if (match) {
        const hasFields = match.fields && match.fields.length > 0 ? `✅ ${match.fields.length} fields` : '❌ No fields';
        console.log(
          `${rec.category.padEnd(25)}${String(rec.phase).padEnd(8)}${String(match.id).padEnd(14)}${hasFields.padEnd(14)}${rec.signers.join(', ')}`
        );
      } else {
        console.log(
          `${rec.category.padEnd(25)}${String(rec.phase).padEnd(8)}${'MISSING'.padEnd(14)}${'--'.padEnd(14)}${rec.signers.join(', ')}`
        );
      }
    }

    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

showTemplateFields();
