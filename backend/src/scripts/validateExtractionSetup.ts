/**
 * Extraction Profile System Setup Validator
 *
 * Checks if all dependencies, configurations, and database setup
 * are ready for the extraction profile system to work.
 *
 * Usage:
 *   npx ts-node src/scripts/validateExtractionSetup.ts
 */

import fs from 'fs';
import path from 'path';

interface ValidationResult {
  category: string;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }>;
}

async function validateSetup(): Promise<void> {
  console.log('🔍 Validating Extraction Profile System Setup\n');
  console.log('='.repeat(80));
  console.log();

  const results: ValidationResult[] = [];
  let hasErrors = false;
  let hasWarnings = false;

  // ============================================================================
  // 1. Check Dependencies
  // ============================================================================
  console.log('📦 Checking Dependencies...\n');
  const depChecks: ValidationResult = {
    category: 'Dependencies',
    checks: []
  };

  const requiredDeps = [
    { name: 'pdfjs-dist', required: true },
    { name: '@napi-rs/canvas', required: false },
    { name: 'tesseract.js', required: false },
  ];

  for (const dep of requiredDeps) {
    try {
      require.resolve(dep.name);
      depChecks.checks.push({
        name: dep.name,
        passed: true,
        message: `✅ Installed`,
        severity: 'info'
      });
    } catch {
      const severity = dep.required ? 'error' : 'warning';
      if (severity === 'error') hasErrors = true;
      if (severity === 'warning') hasWarnings = true;

      depChecks.checks.push({
        name: dep.name,
        passed: false,
        message: dep.required
          ? `❌ REQUIRED - Install with: npm install ${dep.name}`
          : `⚠️  OPTIONAL - Install with: npm install ${dep.name}`,
        severity
      });
    }
  }

  results.push(depChecks);

  // ============================================================================
  // 2. Check Environment Variables
  // ============================================================================
  console.log('🔐 Checking Environment Variables...\n');
  const envChecks: ValidationResult = {
    category: 'Environment Variables',
    checks: []
  };

  const requiredEnvVars = [
    { key: 'OPENAI_API_KEY', required: true, description: 'Required for vision-based extraction' },
    { key: 'DATABASE_URL', required: true, description: 'Database connection string' },
    { key: 'JWT_SECRET', required: true, description: 'Authentication secret' },
  ];

  const optionalEnvVars = [
    { key: 'OPENROUTER_API_KEY', required: false, description: 'Alternative LLM provider' },
    { key: 'REDIS_URL', required: false, description: 'Cache layer (falls back to in-memory)' },
  ];

  const allEnvVars = [...requiredEnvVars, ...optionalEnvVars];

  for (const envVar of allEnvVars) {
    const value = process.env[envVar.key];
    if (value) {
      envChecks.checks.push({
        name: envVar.key,
        passed: true,
        message: `✅ Set (${envVar.description})`,
        severity: 'info'
      });
    } else {
      const severity = envVar.required ? 'error' : 'warning';
      if (severity === 'error') hasErrors = true;
      if (severity === 'warning') hasWarnings = true;

      envChecks.checks.push({
        name: envVar.key,
        passed: false,
        message: envVar.required
          ? `❌ REQUIRED - ${envVar.description}`
          : `⚠️  OPTIONAL - ${envVar.description}`,
        severity
      });
    }
  }

  results.push(envChecks);

  // ============================================================================
  // 3. Check Database Connection
  // ============================================================================
  console.log('🗄️  Checking Database...\n');
  const dbChecks: ValidationResult = {
    category: 'Database',
    checks: []
  };

  try {
    const { default: sequelize } = await import('../config/database');
    await sequelize.authenticate();

    dbChecks.checks.push({
      name: 'Connection',
      passed: true,
      message: '✅ Database connected',
      severity: 'info'
    });

    // Check if extraction profile table exists
    const [results] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'compliance_extraction_profiles'
      ) as exists;
    `);

    const tableExists = (results as any)[0].exists;

    if (tableExists) {
      dbChecks.checks.push({
        name: 'Migration',
        passed: true,
        message: '✅ compliance_extraction_profiles table exists',
        severity: 'info'
      });

      // Check if profiles are seeded
      const ComplianceExtractionProfile = (await import('../models/ComplianceExtractionProfile')).default;
      const profileCount = await ComplianceExtractionProfile.count();

      if (profileCount > 0) {
        dbChecks.checks.push({
          name: 'Seed Data',
          passed: true,
          message: `✅ ${profileCount} extraction profiles loaded`,
          severity: 'info'
        });
      } else {
        hasWarnings = true;
        dbChecks.checks.push({
          name: 'Seed Data',
          passed: false,
          message: '⚠️  No profiles found - Run: npx ts-node src/seeds/seedExtractionProfiles.ts',
          severity: 'warning'
        });
      }
    } else {
      hasErrors = true;
      dbChecks.checks.push({
        name: 'Migration',
        passed: false,
        message: '❌ Table missing - Run: npm run migrate',
        severity: 'error'
      });
    }

    await sequelize.close();

  } catch (error) {
    hasErrors = true;
    dbChecks.checks.push({
      name: 'Connection',
      passed: false,
      message: `❌ Database connection failed: ${(error as Error).message}`,
      severity: 'error'
    });
  }

  results.push(dbChecks);

  // ============================================================================
  // 4. Check File System
  // ============================================================================
  console.log('📁 Checking File System...\n');
  const fsChecks: ValidationResult = {
    category: 'File System',
    checks: []
  };

  const requiredFiles = [
    'src/models/ComplianceExtractionProfile.ts',
    'src/services/ComplianceOCRService.ts',
    'src/seeds/seedExtractionProfiles.ts',
    'src/controllers/complianceController.ts',
    'src/routes/complianceRoutes.ts',
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      fsChecks.checks.push({
        name: file,
        passed: true,
        message: '✅ Exists',
        severity: 'info'
      });
    } else {
      hasErrors = true;
      fsChecks.checks.push({
        name: file,
        passed: false,
        message: '❌ Missing',
        severity: 'error'
      });
    }
  }

  results.push(fsChecks);

  // ============================================================================
  // Print Results
  // ============================================================================
  console.log('='.repeat(80));
  console.log('📊 VALIDATION RESULTS');
  console.log('='.repeat(80));
  console.log();

  for (const result of results) {
    console.log(`\n📋 ${result.category}:`);
    console.log('-'.repeat(80));
    for (const check of result.checks) {
      console.log(`   ${check.message}`);
    }
  }

  console.log();
  console.log('='.repeat(80));

  if (hasErrors) {
    console.log('❌ SETUP INCOMPLETE - Fix errors above before using the system');
    console.log('='.repeat(80));
    console.log();
    console.log('Quick Fix Commands:');
    console.log('  npm install pdfjs-dist @napi-rs/canvas tesseract.js');
    console.log('  npm run migrate');
    console.log('  npx ts-node src/seeds/seedExtractionProfiles.ts');
    console.log();
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️  SETUP MOSTLY COMPLETE - Warnings above should be addressed');
    console.log('='.repeat(80));
    process.exit(0);
  } else {
    console.log('✅ SETUP COMPLETE - System ready for use!');
    console.log('='.repeat(80));
    console.log();
    console.log('Next Steps:');
    console.log('  1. Test with a sample PDF:');
    console.log('     npx ts-node src/tests/manual/testExtractionProfiles.ts <path-to-pdf> TX purchase_contract');
    console.log('  2. Start the server:');
    console.log('     npm run dev');
    console.log('  3. Test API endpoints:');
    console.log('     GET  http://localhost:3001/api/compliance/extraction-profiles');
    console.log('     POST http://localhost:3001/api/compliance/analyze-contract (with PDF upload)');
    console.log();
    process.exit(0);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Validation failed:');
  console.error(error);
  process.exit(1);
});

// Run validation
validateSetup();
