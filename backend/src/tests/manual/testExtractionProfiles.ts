/**
 * Manual Test Script for Extraction Profile System
 *
 * Usage:
 *   npx ts-node src/tests/manual/testExtractionProfiles.ts <path-to-pdf> [state] [category]
 *
 * Examples:
 *   npx ts-node src/tests/manual/testExtractionProfiles.ts ./test-contracts/tx-contract.pdf TX purchase_contract
 *   npx ts-node src/tests/manual/testExtractionProfiles.ts ./test-contracts/fl-contract.pdf FL
 *   npx ts-node src/tests/manual/testExtractionProfiles.ts ./test-contracts/generic.pdf
 */

import fs from 'fs';
import path from 'path';
import { complianceOCRService } from '../../services/ComplianceOCRService';
import ComplianceExtractionProfile from '../../models/ComplianceExtractionProfile';

async function testExtraction() {
  console.log('🧪 Testing Extraction Profile System\n');
  console.log('='.repeat(80));

  // Parse command line arguments
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('❌ Error: PDF file path required');
    console.log('\nUsage:');
    console.log('  npx ts-node src/tests/manual/testExtractionProfiles.ts <path-to-pdf> [state] [category]');
    console.log('\nExamples:');
    console.log('  npx ts-node src/tests/manual/testExtractionProfiles.ts ./contracts/tx-contract.pdf TX purchase_contract');
    console.log('  npx ts-node src/tests/manual/testExtractionProfiles.ts ./contracts/fl-contract.pdf FL');
    process.exit(1);
  }

  const pdfPath = args[0];
  const state = args[1] || undefined;
  const category = args[2] || undefined;

  // Validate file exists
  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ Error: File not found: ${pdfPath}`);
    process.exit(1);
  }

  console.log(`📄 PDF File: ${pdfPath}`);
  console.log(`🗺️  State: ${state || 'auto-detect'}`);
  console.log(`📋 Category: ${category || 'auto-detect'}`);
  console.log('='.repeat(80));
  console.log();

  try {
    // Initialize database
    console.log('🔌 Connecting to database...');
    const { default: sequelize } = await import('../../config/database');
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // Check if profiles exist
    console.log('🔍 Checking extraction profiles...');
    const profileCount = await ComplianceExtractionProfile.count();
    console.log(`   Found ${profileCount} profiles in database`);

    if (profileCount === 0) {
      console.log('⚠️  No profiles found. Run: npx ts-node src/seeds/seedExtractionProfiles.ts');
      console.log('   Continuing with generic extraction...\n');
    } else {
      console.log('✅ Profiles loaded\n');
    }

    // Load the PDF
    console.log('📖 Reading PDF file...');
    const buffer = fs.readFileSync(pdfPath);
    const stats = fs.statSync(pdfPath);
    console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   Type: application/pdf\n`);

    // Find best profile
    if (state) {
      console.log('🎯 Finding best extraction profile...');
      const profile = await ComplianceExtractionProfile.findBestProfile(state, undefined, category);
      if (profile) {
        console.log(`   ✅ Profile: ${profile.name}`);
        console.log(`   📍 State: ${profile.state}`);
        console.log(`   📂 Category: ${profile.category}`);
        console.log(`   🎚️  Min Confidence: ${profile.minConfidence}`);
        console.log(`   ⭐ Priority: ${profile.priority}\n`);
      } else {
        console.log(`   ⚠️  No specific profile found for ${state}, using generic\n`);
      }
    }

    // Extract fields
    console.log('🔬 Extracting contract fields...');
    console.log('   This may take 10-30 seconds...\n');

    const startTime = Date.now();
    const result = await complianceOCRService.extractContractFields(
      buffer,
      'application/pdf',
      state,
      undefined,
      category
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('='.repeat(80));
    console.log('📊 EXTRACTION RESULTS');
    console.log('='.repeat(80));
    console.log();

    // Display results
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log();

    console.log('📝 Extracted Fields:');
    console.log('-'.repeat(80));

    const fields = [
      'sellerName',
      'buyerName',
      'propertyAddress',
      'purchasePrice',
      'earnestMoney',
      'closingDate',
      'contractExpirationDate',
      'assignable',
      'marketingClauseFound'
    ];

    for (const field of fields) {
      const value = result[field as keyof typeof result];
      if (value !== null && value !== undefined) {
        console.log(`   ${field.padEnd(25)}: ${value}`);
      } else {
        console.log(`   ${field.padEnd(25)}: (not found)`);
      }
    }

    console.log();

    // Display field evidence if available
    if (result.fieldEvidence && Object.keys(result.fieldEvidence).length > 0) {
      console.log('🔍 Field Evidence:');
      console.log('-'.repeat(80));

      for (const [field, evidence] of Object.entries(result.fieldEvidence)) {
        console.log(`   ${field}:`);
        console.log(`      Snippet: "${evidence.snippet}"`);
        console.log(`      Confidence: ${(evidence.confidence * 100).toFixed(1)}%`);
      }
      console.log();
    }

    // Quality assessment
    console.log('✅ Quality Assessment:');
    console.log('-'.repeat(80));

    const requiredFields = ['sellerName', 'buyerName', 'propertyAddress', 'purchasePrice'];
    const foundRequired = requiredFields.filter(f => result[f as keyof typeof result] !== null);
    const completeness = (foundRequired.length / requiredFields.length * 100).toFixed(1);

    console.log(`   Required Fields Found: ${foundRequired.length}/${requiredFields.length} (${completeness}%)`);
    console.log(`   Overall Confidence: ${(result.confidence * 100).toFixed(1)}%`);

    if (result.confidence >= 0.75) {
      console.log(`   ✅ HIGH QUALITY - Ready for production use`);
    } else if (result.confidence >= 0.50) {
      console.log(`   ⚠️  MEDIUM QUALITY - May need review`);
    } else {
      console.log(`   ❌ LOW QUALITY - Needs manual review`);
    }

    console.log();
    console.log('='.repeat(80));
    console.log('✅ Test completed successfully');
    console.log('='.repeat(80));

    await sequelize.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run test
testExtraction();
