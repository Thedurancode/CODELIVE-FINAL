/**
 * View Duration Signals - Test Suite
 *
 * Tests the ML prediction enhancements for view duration analysis:
 * - "Almost liked" detection
 * - Quick dismiss patterns
 * - Personalization boost from view duration
 */

import { marketplaceService } from '../services/MarketplaceService';
import DealAction from '../models/DealAction';
import MarketplaceUser from '../models/MarketplaceUser';
import sequelize from '../config/database';

// Test configuration
const TEST_USER_ID = 'test-user-view-duration';

// Mock deals for testing
const MOCK_DEALS = {
  'deal-tx-200k': {
    id: 'deal-tx-200k',
    price: 200000,
    state: 'TX',
    city: 'Houston',
    propertyType: 'single_family',
    bedrooms: 3,
    sqft: 1800,
    equity: 25,
  },
  'deal-tx-180k': {
    id: 'deal-tx-180k',
    price: 180000,
    state: 'TX',
    city: 'Dallas',
    propertyType: 'single_family',
    bedrooms: 3,
    sqft: 1600,
    equity: 28,
  },
  'deal-fl-150k': {
    id: 'deal-fl-150k',
    price: 150000,
    state: 'FL',
    city: 'Tampa',
    propertyType: 'townhouse',
    bedrooms: 2,
    sqft: 1200,
    equity: 20,
  },
};

async function setupTestData() {
  console.log('\n📦 Setting up test data...\n');

  // Create test user
  await MarketplaceUser.findOrCreate({
    where: { id: TEST_USER_ID },
    defaults: {
      id: TEST_USER_ID,
      email: 'viewduration-test@example.com',
      name: 'View Duration Test User',
      role: 'investor',
    },
  });

  // Clear previous test actions
  await DealAction.destroy({ where: { userId: TEST_USER_ID } });

  // Simulate user history with varying view durations
  const actions = [
    // Likes with long view duration (establishes baseline ~25 seconds)
    { dealId: 'like-1', actionType: 'like', viewDuration: 25000, price: 190000, state: 'TX', type: 'single_family' },
    { dealId: 'like-2', actionType: 'like', viewDuration: 30000, price: 210000, state: 'TX', type: 'single_family' },
    { dealId: 'like-3', actionType: 'like', viewDuration: 22000, price: 185000, state: 'TX', type: 'single_family' },

    // Quick dismisses (< 5 seconds) - FL townhouses
    { dealId: 'quick-1', actionType: 'pass', viewDuration: 2000, price: 140000, state: 'FL', type: 'townhouse' },
    { dealId: 'quick-2', actionType: 'pass', viewDuration: 3000, price: 160000, state: 'FL', type: 'townhouse' },
    { dealId: 'quick-3', actionType: 'pass', viewDuration: 2500, price: 145000, state: 'FL', type: 'townhouse' },
    { dealId: 'quick-4', actionType: 'pass', viewDuration: 1800, price: 155000, state: 'FL', type: 'townhouse' },
    { dealId: 'quick-5', actionType: 'pass', viewDuration: 2200, price: 150000, state: 'FL', type: 'townhouse' },

    // "Almost liked" - long view duration but passed (for price)
    { dealId: 'almost-1', actionType: 'pass', viewDuration: 35000, price: 250000, state: 'TX', type: 'single_family', reason: 'price_too_high' },
    { dealId: 'almost-2', actionType: 'pass', viewDuration: 28000, price: 240000, state: 'TX', type: 'single_family', reason: 'price_too_high' },

    // Normal passes
    { dealId: 'pass-1', actionType: 'pass', viewDuration: 8000, price: 180000, state: 'GA', type: 'condo' },
    { dealId: 'pass-2', actionType: 'pass', viewDuration: 10000, price: 175000, state: 'GA', type: 'condo' },
  ];

  for (const action of actions) {
    await DealAction.create({
      userId: TEST_USER_ID,
      dealId: action.dealId,
      actionType: action.actionType as any,
      viewDuration: action.viewDuration,
      passReason: action.reason,
      dealSnapshotPrice: action.price,
      dealSnapshotState: action.state,
      dealSnapshotPropertyType: action.type,
      dealSnapshotBedrooms: 3,
      dealSnapshotSqft: 1500,
      dealSnapshotEquity: 22,
    });
  }

  console.log(`✅ Created ${actions.length} test actions\n`);
}

async function testAlmostLikedDetection() {
  console.log('🧪 Test 1: Almost Liked Detection');
  console.log('─'.repeat(50));

  // Test with a TX single family that's cheaper than "almost liked" deals
  const prediction = await marketplaceService.predictDealInterest(
    TEST_USER_ID,
    'deal-tx-180k'
  );

  console.log('\nDeal: TX Single Family @ $180k');
  console.log(`Predicted: ${prediction.predictedAction}`);
  console.log(`Confidence: ${prediction.confidence}%`);
  console.log('\nFactors:');

  const almostLikedFactor = prediction.factors.find(f =>
    f.factor.includes('carefully considered') ||
    f.factor.includes('Better priced')
  );

  prediction.factors.forEach(f => {
    const icon = f.impact === 'positive' ? '✅' : '❌';
    console.log(`  ${icon} ${f.factor} (${f.impact}, weight: ${f.weight})`);
  });

  if (almostLikedFactor) {
    console.log('\n✅ PASS: Almost-liked signal detected!');
  } else {
    console.log('\n⚠️  Almost-liked factor not found (may need more data)');
  }

  return { name: 'Almost Liked Detection', passed: !!almostLikedFactor };
}

async function testQuickDismissDetection() {
  console.log('\n\n🧪 Test 2: Quick Dismiss Pattern Detection');
  console.log('─'.repeat(50));

  // Test with a FL townhouse (user quick-dismisses these)
  const prediction = await marketplaceService.predictDealInterest(
    TEST_USER_ID,
    'deal-fl-150k'
  );

  console.log('\nDeal: FL Townhouse @ $150k');
  console.log(`Predicted: ${prediction.predictedAction}`);
  console.log(`Confidence: ${prediction.confidence}%`);
  console.log('\nFactors:');

  const quickDismissFactor = prediction.factors.find(f =>
    f.factor.includes('quickly passes')
  );

  prediction.factors.forEach(f => {
    const icon = f.impact === 'positive' ? '✅' : '❌';
    console.log(`  ${icon} ${f.factor} (${f.impact}, weight: ${f.weight})`);
  });

  if (quickDismissFactor) {
    console.log('\n✅ PASS: Quick-dismiss pattern detected!');
  } else {
    console.log('\n⚠️  Quick-dismiss factor not found');
  }

  return { name: 'Quick Dismiss Detection', passed: !!quickDismissFactor };
}

async function testBehaviorProfile() {
  console.log('\n\n🧪 Test 3: Behavior Profile with View Duration');
  console.log('─'.repeat(50));

  const profile = await marketplaceService.getUserBehaviorProfile(TEST_USER_ID);

  if (!profile) {
    console.log('❌ FAIL: No profile returned');
    return { name: 'Behavior Profile', passed: false };
  }

  const prefs = profile.implicitPreferences;

  console.log('\nView Duration Metrics:');
  console.log(`  Avg View Duration (Liked): ${(prefs.avgViewDurationLiked / 1000).toFixed(1)}s`);
  console.log(`  Avg View Duration (Passed): ${(prefs.avgViewDurationPassed / 1000).toFixed(1)}s`);

  const hasViewDurationData =
    prefs.avgViewDurationLiked > 0 &&
    prefs.avgViewDurationPassed > 0;

  console.log('\nPrice Preferences:');
  console.log(`  Avg Liked Price: $${prefs.avgLikedPrice?.toLocaleString()}`);
  console.log(`  Avg Passed Price: $${prefs.avgPassedPrice?.toLocaleString()}`);

  console.log('\nEngagement Metrics:');
  console.log(`  Like Rate: ${profile.likeRate.toFixed(1)}%`);

  if (hasViewDurationData) {
    const ratio = prefs.avgViewDurationLiked / prefs.avgViewDurationPassed;
    console.log(`  Like/Pass Duration Ratio: ${ratio.toFixed(2)}x`);
    console.log('\n✅ PASS: View duration data captured in profile');
  } else {
    console.log('\n⚠️  View duration data incomplete');
  }

  return { name: 'Behavior Profile', passed: hasViewDurationData };
}

async function testPredictionComparison() {
  console.log('\n\n🧪 Test 4: Prediction Comparison (With vs Without View Duration)');
  console.log('─'.repeat(50));

  // Compare predictions for two similar deals
  const txDeal = await marketplaceService.predictDealInterest(TEST_USER_ID, 'deal-tx-200k');
  const flDeal = await marketplaceService.predictDealInterest(TEST_USER_ID, 'deal-fl-150k');

  console.log('\nTX Single Family ($200k):');
  console.log(`  Prediction: ${txDeal.predictedAction} (${txDeal.confidence}% confidence)`);
  console.log(`  Factors: ${txDeal.factors.length}`);

  console.log('\nFL Townhouse ($150k):');
  console.log(`  Prediction: ${flDeal.predictedAction} (${flDeal.confidence}% confidence)`);
  console.log(`  Factors: ${flDeal.factors.length}`);

  // TX should be higher confidence due to almost-liked patterns
  // FL should be lower due to quick-dismiss patterns
  const txHigher = txDeal.confidence > flDeal.confidence;
  const txLike = txDeal.predictedAction === 'like';
  const flPass = flDeal.predictedAction === 'pass';

  console.log('\nExpected Behavior:');
  console.log(`  TX deal higher confidence than FL: ${txHigher ? '✅' : '❌'}`);
  console.log(`  TX predicted as like: ${txLike ? '✅' : '❌'}`);
  console.log(`  FL predicted as pass: ${flPass ? '✅' : '⚠️ (acceptable if like)'}`);

  return { name: 'Prediction Comparison', passed: txHigher || txLike };
}

async function runTests() {
  console.log('═'.repeat(60));
  console.log('     VIEW DURATION SIGNALS - TEST SUITE');
  console.log('═'.repeat(60));

  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('\n✅ Database connected\n');

    // Setup test data
    await setupTestData();

    // Run tests
    const results = [
      await testAlmostLikedDetection(),
      await testQuickDismissDetection(),
      await testBehaviorProfile(),
      await testPredictionComparison(),
    ];

    // Summary
    console.log('\n\n' + '═'.repeat(60));
    console.log('     TEST SUMMARY');
    console.log('═'.repeat(60));

    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    results.forEach(r => {
      console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
    });

    console.log(`\n  Result: ${passed}/${total} tests passed`);
    console.log('═'.repeat(60) + '\n');

    // Cleanup
    await DealAction.destroy({ where: { userId: TEST_USER_ID } });
    await MarketplaceUser.destroy({ where: { id: TEST_USER_ID } });

    process.exit(passed === total ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

export { runTests };
