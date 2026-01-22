/**
 * Test script for Buy Box OCR Import
 *
 * Creates a sample buy box image and tests the import service.
 * Run with: npx ts-node scripts/test-buybox-import.ts
 */

import { buyBoxImportService } from '../src/services/BuyBoxImportService';
import sequelize from '../src/config/database';
import HedgeFundBuyBox from '../src/models/HedgeFundBuyBox';

// Create a simple SVG that looks like a buy box document
function createSampleBuyBoxSVG(): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <rect width="800" height="1000" fill="white"/>

  <!-- Header -->
  <text x="400" y="50" font-family="Arial" font-size="28" font-weight="bold" text-anchor="middle" fill="#333">
    ###Sunbelt Home Buyers
  </text>
  <text x="400" y="80" font-family="Arial" font-size="16" text-anchor="middle" fill="#666">
    Single Family Rental Investment Criteria
  </text>

  <!-- Tags -->
  <text x="700" y="30" font-family="Courier" font-size="12" fill="#888">#PRIORITY:2</text>
  <text x="700" y="50" font-family="Courier" font-size="12" fill="#888">#AUTO_SUBMIT:85</text>

  <!-- Contact Section -->
  <rect x="50" y="100" width="700" height="100" fill="#f5f5f5" rx="5"/>
  <text x="70" y="130" font-family="Arial" font-size="14" font-weight="bold">Contact Information:</text>
  <text x="70" y="155" font-family="Arial" font-size="12">Main: acquisitions@sunbelthomebuyers.com | (404) 555-1234</text>
  <text x="70" y="175" font-family="Arial" font-size="12">Atlanta: John Smith - jsmith@sunbelthomebuyers.com</text>
  <text x="70" y="195" font-family="Arial" font-size="12">Tampa: Sarah Jones - sjones@sunbelthomebuyers.com</text>

  <!-- Geographic Section -->
  <text x="70" y="240" font-family="Arial" font-size="16" font-weight="bold" fill="#2563eb">TARGET MARKETS</text>
  <text x="70" y="265" font-family="Arial" font-size="12">States: GA, FL, NC, SC, TN, AL</text>
  <text x="70" y="285" font-family="Arial" font-size="12">Focus Counties: Fulton, Gwinnett, Cobb, DeKalb (GA), Hillsborough, Pinellas (FL)</text>

  <!-- Price Section -->
  <text x="70" y="330" font-family="Arial" font-size="16" font-weight="bold" fill="#2563eb">PRICING REQUIREMENTS</text>
  <text x="70" y="355" font-family="Arial" font-size="12">Purchase Price: $150,000 - $400,000</text>
  <text x="70" y="375" font-family="Arial" font-size="12">ARV Range: $200,000 - $500,000</text>
  <text x="70" y="395" font-family="Arial" font-size="12">Minimum Gross Yield: 8%</text>

  <!-- Property Specs -->
  <text x="70" y="440" font-family="Arial" font-size="16" font-weight="bold" fill="#2563eb">PROPERTY SPECIFICATIONS</text>
  <text x="70" y="465" font-family="Arial" font-size="12">Property Types: Single Family, Townhome</text>
  <text x="70" y="485" font-family="Arial" font-size="12">Bedrooms: 3-5 | Bathrooms: 2+</text>
  <text x="70" y="505" font-family="Arial" font-size="12">Square Footage: 1,200 - 2,800 sqft</text>
  <text x="70" y="525" font-family="Arial" font-size="12">Year Built: 1990 or newer</text>
  <text x="70" y="545" font-family="Arial" font-size="12">Garage: Minimum 1 car, prefer 2 car</text>

  <!-- Condition -->
  <text x="70" y="590" font-family="Arial" font-size="16" font-weight="bold" fill="#2563eb">CONDITION REQUIREMENTS</text>
  <text x="70" y="615" font-family="Arial" font-size="12">Acceptable: Light rehab, Medium rehab (cosmetic only)</text>
  <text x="70" y="635" font-family="Arial" font-size="12">Investment Strategies: Long Term Rental, Fix and Flip</text>

  <!-- Hard Nos -->
  <text x="70" y="680" font-family="Arial" font-size="16" font-weight="bold" fill="#dc2626">HARD NOs - AUTOMATIC DECLINE</text>
  <text x="70" y="705" font-family="Arial" font-size="12">No pools | No septic systems | No flood zones</text>
  <text x="70" y="725" font-family="Arial" font-size="12">No foundation issues | No structural damage | No fire damage</text>
  <text x="70" y="745" font-family="Arial" font-size="12">No mobile homes | No age-restricted communities</text>
  <text x="70" y="765" font-family="Arial" font-size="12">No properties on main roads | No open permits</text>

  <!-- Market Prices -->
  <text x="70" y="810" font-family="Arial" font-size="16" font-weight="bold" fill="#2563eb">MARKET-SPECIFIC PRICING</text>
  <text x="70" y="835" font-family="Arial" font-size="12">Atlanta Metro: Max $375,000 | Min Yield 8.5%</text>
  <text x="70" y="855" font-family="Arial" font-size="12">Tampa Bay: Max $350,000 | Min Yield 9%</text>
  <text x="70" y="875" font-family="Arial" font-size="12">Charlotte: Max $325,000 | Min Yield 8%</text>

  <!-- Footer -->
  <text x="400" y="950" font-family="Arial" font-size="10" text-anchor="middle" fill="#999">
    Sunbelt Home Buyers LLC | Updated December 2024
  </text>
</svg>
`;
}

async function testBuyBoxImport() {
  console.log('\n🧪 BUY BOX OCR IMPORT TEST\n');
  console.log('='.repeat(60));

  // Check OpenAI key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set. Cannot run OCR test.');
    process.exit(1);
  }
  console.log('✅ OpenAI API key configured');

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // Create SVG content
    const svgContent = createSampleBuyBoxSVG();
    const buffer = Buffer.from(svgContent);

    console.log('📄 Created sample buy box document (SVG)');
    console.log('   Fund: Sunbelt Home Buyers');
    console.log('   States: GA, FL, NC, SC, TN, AL');
    console.log('   Price: $150K - $400K');
    console.log('   Tags: #PRIORITY:2, #AUTO_SUBMIT:85\n');

    // Check if buy box already exists
    const existing = await HedgeFundBuyBox.findOne({ where: { name: 'Sunbelt Home Buyers' } });
    if (existing) {
      console.log('⚠️  Buy box "Sunbelt Home Buyers" already exists. Will update.\n');
    }

    console.log('⏳ Sending to GPT-4 Vision for extraction...\n');
    const startTime = Date.now();

    // Import the document
    const result = await buyBoxImportService.importFromDocument(
      buffer,
      'image/svg+xml',
      'sunbelt-buybox.svg'
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('✅ Extraction completed in ' + elapsed + 's\n');

    // Show results
    console.log('📊 IMPORT RESULT:');
    console.log('   Action:', result.action);
    console.log('   Success:', result.success);
    console.log('   Buy Box ID:', result.buyBoxId || 'N/A');
    console.log('   Buy Box Name:', result.buyBoxName || 'N/A');
    console.log('   Message:', result.message);

    if (result.tagsApplied && result.tagsApplied.length > 0) {
      console.log('   Tags Applied:', result.tagsApplied.join(', '));
    }

    console.log('\n📋 EXTRACTED DATA:');
    console.log('   Fund Name:', result.extracted.fundName);
    console.log('   Fund Type:', result.extracted.fundType || 'Not extracted');
    console.log('   Confidence:', (result.extracted.confidence * 100).toFixed(0) + '%');
    console.log('   Fields Extracted:', result.extracted.extractedFields.join(', '));

    if (result.extracted.contactEmail) {
      console.log('   Default Email:', result.extracted.contactEmail);
    }
    if (result.extracted.marketContacts && result.extracted.marketContacts.length > 0) {
      console.log('   Market Contacts:', result.extracted.marketContacts.length);
      for (const c of result.extracted.marketContacts) {
        console.log('      - ' + c.name + ': ' + c.email + ' (' + c.markets.join(', ') + ')');
      }
    }

    if (result.extracted.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      for (const w of result.extracted.warnings) {
        console.log('   -', w);
      }
    }

    console.log('\n📦 CRITERIA EXTRACTED:');
    const criteria = result.extracted.criteria as any;
    if (criteria.states) console.log('   States:', criteria.states.join(', '));
    if (criteria.counties) console.log('   Counties:', criteria.counties.slice(0, 5).join(', '));
    if (criteria.minPrice) console.log('   Min Price: $' + criteria.minPrice.toLocaleString());
    if (criteria.maxPrice) console.log('   Max Price: $' + criteria.maxPrice.toLocaleString());
    if (criteria.minBedrooms) console.log('   Min Beds:', criteria.minBedrooms);
    if (criteria.maxBedrooms) console.log('   Max Beds:', criteria.maxBedrooms);
    if (criteria.minBathrooms) console.log('   Min Baths:', criteria.minBathrooms);
    if (criteria.minSqft) console.log('   Min Sqft:', criteria.minSqft);
    if (criteria.maxSqft) console.log('   Max Sqft:', criteria.maxSqft);
    if (criteria.minYearBuilt) console.log('   Min Year:', criteria.minYearBuilt);
    if (criteria.propertyTypes) console.log('   Property Types:', criteria.propertyTypes.join(', '));
    if (criteria.investmentStrategies) console.log('   Strategies:', criteria.investmentStrategies.join(', '));
    if (criteria.conditionLevels) console.log('   Conditions:', criteria.conditionLevels.join(', '));
    if (criteria.minGrossYield) console.log('   Min Yield:', (criteria.minGrossYield * 100).toFixed(1) + '%');

    // Show boolean restrictions
    const booleans: string[] = [];
    if (criteria.allowPool === false) booleans.push('No pools');
    if (criteria.allowSeptic === false) booleans.push('No septic');
    if (criteria.allowFloodZone === false) booleans.push('No flood zone');
    if (criteria.allowFoundationIssues === false) booleans.push('No foundation issues');
    if (criteria.allowStructuralIssues === false) booleans.push('No structural');
    if (criteria.allowFireDamage === false) booleans.push('No fire damage');
    if (criteria.allowOpenPermits === false) booleans.push('No open permits');
    if (criteria.allowMainRoad === false) booleans.push('No main road');
    if (booleans.length > 0) {
      console.log('   Restrictions:', booleans.join(', '));
    }

    if (criteria.marketPrices) {
      console.log('   Market Prices:', Object.keys(criteria.marketPrices).length, 'markets');
    }

    // Verify in database
    if (result.success && result.buyBoxId) {
      console.log('\n✅ VERIFICATION - Checking database...');
      const saved = await HedgeFundBuyBox.findByPk(result.buyBoxId);
      if (saved) {
        console.log('   Found in DB: ' + saved.name);
        console.log('   Enabled:', saved.enabled);
        console.log('   Priority:', saved.priority);
        console.log('   Auto-Submit:', saved.autoSubmit ? 'Yes @ ' + saved.autoSubmitThreshold + '%' : 'No');
        console.log('   States:', saved.criteria.states?.join(', ') || 'Not set');
      }
    }

    await sequelize.close();
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await sequelize.close();
    process.exit(1);
  }
}

testBuyBoxImport();
