/**
 * Test script for Deal Enrichment & Scoring Flow
 * Demonstrates the complete pipeline: Enrich → Score → Match
 *
 * Run with: npx ts-node scripts/test-deal-enrichment.ts
 *
 * Options:
 *   --address "123 Main St, Dallas, TX 75001"  Custom address to test
 *   --mock                                      Use mock data (no API calls)
 *   --verbose                                   Show detailed output
 */

import { dealProcessingService } from '../src/plugins';
import { dealAnalysisService } from '../src/plugins/ai/DealAnalysisService';
import { scoringEngine } from '../src/plugins/scoring/ScoringEngine';
import { marketDataService } from '../src/services/MarketDataService';
import sequelize from '../src/config/database';
import { NormalizedDeal } from '../src/plugins/types';

// Sample test deals
const testDeals: NormalizedDeal[] = [
  {
    externalId: 'TEST-001',
    sourceId: 'test-script',
    sourceName: 'Test Script',
    address: {
      street: '123 Oak Street',
      city: 'Dallas',
      state: 'TX',
      zip: '75201',
      county: 'Dallas',
    },
    propertyType: 'single_family',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1800,
    yearBuilt: 2005,
    askingPrice: 250000,
    occupancyStatus: 'vacant',
    confidence: 85,
    rawData: {},
    normalizedAt: new Date(),
  },
  {
    externalId: 'TEST-002',
    sourceId: 'test-script',
    sourceName: 'Test Script',
    address: {
      street: '456 Peachtree Road',
      city: 'Atlanta',
      state: 'GA',
      zip: '30308',
      county: 'Fulton',
    },
    propertyType: 'single_family',
    bedrooms: 4,
    bathrooms: 2.5,
    sqft: 2200,
    yearBuilt: 2010,
    askingPrice: 320000,
    occupancyStatus: 'vacant',
    confidence: 90,
    rawData: {},
    normalizedAt: new Date(),
  },
  {
    externalId: 'TEST-003',
    sourceId: 'test-script',
    sourceName: 'Test Script',
    address: {
      street: '789 Palm Avenue',
      city: 'Tampa',
      state: 'FL',
      zip: '33602',
      county: 'Hillsborough',
    },
    propertyType: 'single_family',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1600,
    yearBuilt: 1998,
    askingPrice: 280000,
    occupancyStatus: 'tenant',
    monthlyRent: 2100,
    confidence: 80,
    rawData: {},
    normalizedAt: new Date(),
  },
  {
    externalId: 'TEST-004',
    sourceId: 'test-script',
    sourceName: 'Test Script',
    address: {
      street: '2408 Jamestown Commons',
      city: 'Hillsborough',
      state: 'NJ',
      zip: '08844',
      county: 'Somerset',
    },
    propertyType: 'single_family',
    bedrooms: 3,
    bathrooms: 3,
    sqft: 2000,
    yearBuilt: 1970,
    askingPrice: 600000,
    occupancyStatus: 'vacant',
    confidence: 90,
    rawData: {},
    normalizedAt: new Date(),
  },
];

async function testEnrichmentFlow(verbose: boolean = false) {
  console.log('\n🧪 DEAL ENRICHMENT & SCORING TEST');
  console.log('='.repeat(60));

  // Check API key
  const hasApiKey = !!process.env.RAPIDAPI_KEY;
  console.log(`\n📡 RapidAPI Key: ${hasApiKey ? '✅ Configured' : '❌ Not configured (will use mock data)'}`);

  // Show registered providers
  const providers = dealAnalysisService.getProviders();
  console.log(`\n📦 Enrichment Providers (${providers.length}):`);
  for (const p of providers) {
    const available = await p.isAvailable();
    console.log(`   ${available ? '✅' : '⚪'} ${p.name} (${p.type}) - ${p.enrichFields.length} fields`);
  }

  // Load buy boxes
  await scoringEngine.loadFromDatabase();
  const buyBoxes = scoringEngine.getAllBuyBoxes();
  console.log(`\n📦 Buy Boxes Loaded: ${buyBoxes.length}`);
  for (const bb of buyBoxes.slice(0, 5)) {
    console.log(`   [P${bb.priority}] ${bb.name} - ${bb.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('PROCESSING TEST DEALS');
  console.log('='.repeat(60));

  for (const deal of testDeals) {
    console.log(`\n📍 Deal: ${deal.address.street}, ${deal.address.city}, ${deal.address.state}`);
    console.log(`   Price: $${deal.askingPrice.toLocaleString()} | ${deal.bedrooms}bd/${deal.bathrooms}ba | ${deal.sqft} sqft`);

    // Step 1: Enrich
    console.log('\n   ⏳ Step 1: Enriching with market data...');
    const startEnrich = Date.now();

    try {
      const { enrichedDeal, results } = await dealAnalysisService.enrichDeal(deal);
      const enrichTime = Date.now() - startEnrich;

      // Show enrichment results
      const successfulProviders = results.filter(r => r.success);
      console.log(`   ✅ Enriched in ${enrichTime}ms (${successfulProviders.length}/${results.length} providers)`);

      if (verbose) {
        for (const r of results) {
          console.log(`      ${r.success ? '✅' : '❌'} ${r.provider}: ${r.success ? `${Object.keys(r.data).length} fields` : r.error}`);
        }
      }

      // Show key enriched values
      const enrichedData = enrichedDeal.rawData?.enrichment || {};
      if (enrichedData.zestimate) {
        console.log(`   💰 Zestimate: $${enrichedData.zestimate.toLocaleString()}`);
      }
      if (enrichedData.rentZestimate) {
        console.log(`   🏠 Rent Estimate: $${enrichedData.rentZestimate.toLocaleString()}/mo`);
      }
      if (enrichedData.comparables) {
        console.log(`   📊 Comparables: ${enrichedData.comparables.length} found`);
      }

      // Step 2: Score against buy boxes
      console.log('\n   ⏳ Step 2: Scoring against buy boxes...');
      const startScore = Date.now();

      const scoringResults = await scoringEngine.scoreDealAgainstAllBuyBoxes(enrichedDeal);
      const scoreTime = Date.now() - startScore;

      console.log(`   ✅ Scored in ${scoreTime}ms against ${scoringResults.length} buy boxes`);

      // Show top matches
      const matches = scoringResults.filter(r => r.matchType !== 'no_match');
      if (matches.length > 0) {
        console.log('\n   🎯 TOP MATCHES:');
        for (const match of matches.slice(0, 3)) {
          const icon = match.matchType === 'strong' ? '🟢' : match.matchType === 'moderate' ? '🟡' : '🟠';
          console.log(`      ${icon} ${match.buyBoxName}: ${match.percentage}% (${match.matchType})`);

          if (match.marketContact) {
            console.log(`         📧 Contact: ${match.marketContact.name} <${match.marketContact.email}>`);
          }

          if (match.autoSubmitEligible) {
            console.log(`         🚀 AUTO-SUBMIT ELIGIBLE`);
          }

          if (verbose) {
            console.log(`         Breakdown:`);
            for (const b of match.breakdown.slice(0, 5)) {
              console.log(`           - ${b.criterion}: ${b.earnedPoints}/${b.maxPoints} pts ${b.passed ? '✅' : '❌'}`);
            }
          }
        }
      } else {
        console.log('\n   ⚠️ No matching buy boxes found');
      }

    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }

    console.log('\n' + '-'.repeat(60));
  }
}

async function testMarketDataDirect(address: string) {
  console.log('\n📡 DIRECT MARKET DATA TEST');
  console.log('='.repeat(60));
  console.log(`Address: ${address}`);

  try {
    // Parse address into components for display
    const parts = address.split(',').map(s => s.trim());
    const street = parts[0] || '';
    const cityPart = parts[1] || '';
    const zipPart = parts[2]?.trim() || '';

    console.log(`\nLooking up: "${address}"`);

    const result = await marketDataService.getFullPropertyLookup({
      address: address,
      city: cityPart,
      state: '',
      zip: zipPart,
    });

    if (result && result.property) {
      const prop = result.property;
      const comps = result.comparables;
      const priceHist = result.priceHistory;
      const images = result.images;

      console.log('\n✅ Market Data Retrieved:');
      console.log(`   ZPID: ${prop.zpid || 'N/A'}`);
      console.log(`   Address: ${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}`);
      console.log(`   Zestimate: $${prop.zestimate?.toLocaleString() || 'N/A'}`);
      console.log(`   Rent Estimate: $${prop.rentZestimate?.toLocaleString() || 'N/A'}/mo`);
      console.log(`   Living Area: ${prop.sqft?.toLocaleString() || 'N/A'} sqft`);
      console.log(`   Lot Size: ${prop.lotSize?.toLocaleString() || 'N/A'} sqft`);
      console.log(`   Beds/Baths: ${prop.bedrooms || 'N/A'}bd / ${prop.bathrooms || 'N/A'}ba`);
      console.log(`   Year Built: ${prop.yearBuilt || 'N/A'}`);
      console.log(`   Property Type: ${prop.propertyType || 'N/A'}`);
      console.log(`   Last Sold: $${prop.lastSoldPrice?.toLocaleString() || 'N/A'} (${prop.lastSoldDate || 'N/A'})`);
      console.log(`   Tax Assessed: $${prop.taxAssessedValue?.toLocaleString() || 'N/A'}`);
      console.log(`   County: ${prop.county || 'N/A'}`);

      // Comparables
      if (comps?.comparables && comps.comparables.length > 0) {
        console.log(`\n📊 Comparables (${comps.comparables.length} found):`);
        for (const comp of comps.comparables.slice(0, 3)) {
          console.log(`   - ${comp.address}: $${comp.price?.toLocaleString() || 'N/A'} (${comp.bedrooms}bd/${comp.bathrooms}ba, ${comp.sqft || 'N/A'} sqft)`);
        }
      }

      // Price History
      if (priceHist?.history && priceHist.history.length > 0) {
        console.log(`\n📈 Price History (${priceHist.history.length} events):`);
        for (const event of priceHist.history.slice(0, 3)) {
          console.log(`   - ${event.date}: ${event.event} - $${event.price?.toLocaleString() || 'N/A'}`);
        }
      }

      // Photos
      if (images?.photos && images.photos.length > 0) {
        console.log(`\n📷 Photos: ${images.photos.length} available`);
      }

      // Investment Analysis
      if (prop.zestimate && prop.rentZestimate) {
        const annualRent = prop.rentZestimate * 12;
        const grossYield = (annualRent / prop.zestimate) * 100;
        console.log(`\n💰 Investment Analysis:`);
        console.log(`   Gross Yield: ${grossYield.toFixed(2)}%`);
        console.log(`   1% Rule: ${prop.rentZestimate >= prop.zestimate * 0.01 ? '✅ PASS' : '❌ FAIL'} (rent $${prop.rentZestimate} vs 1% = $${(prop.zestimate * 0.01).toFixed(0)})`);
      }

    } else {
      console.log('\n❌ No market data found for this address');
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const useMock = args.includes('--mock');
  const addressIndex = args.indexOf('--address');
  const customAddress = addressIndex !== -1 ? args[addressIndex + 1] : null;

  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database');

    if (customAddress) {
      // Test specific address
      await testMarketDataDirect(customAddress);
    } else {
      // Full enrichment flow test
      await testEnrichmentFlow(verbose);
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
