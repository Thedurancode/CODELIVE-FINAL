/**
 * Advanced AI Agent Tools Test
 *
 * Run with: npx ts-node src/tests/integration/agentAdvancedTest.ts
 *
 * Tests advanced agent tools: market data, pipeline, offers, scraping, automations
 */

import * as dotenv from 'dotenv';
dotenv.config();

const log = (msg: string) => console.log(`[Test] ${msg}`);
const success = (msg: string) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
const fail = (msg: string) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`);
const section = (title: string) => console.log(`\n\x1b[33m━━━ ${title} ━━━\x1b[0m\n`);

let agentService: any;
const testUserId = 'test-user-' + Date.now();

async function chat(message: string, userId?: string): Promise<{ response: string; duration: number }> {
  const sessionId = `adv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const start = Date.now();
  const response = await agentService.chat(sessionId, message, userId);
  return { response, duration: Date.now() - start };
}

async function test(name: string, message: string, userId?: string): Promise<boolean> {
  log(`Testing: ${name}`);
  try {
    const { response, duration } = await chat(message, userId);
    if (response && response.length > 0) {
      success(`${name} (${duration}ms)`);
      console.log(`   → ${response.substring(0, 120).replace(/\n/g, ' ')}...`);
      return true;
    }
    fail(`${name}: Empty response`);
    return false;
  } catch (e: any) {
    fail(`${name}: ${e.message}`);
    return false;
  }
}

async function runTests() {
  console.log('\n' + '═'.repeat(50));
  console.log('  ADVANCED AGENT TOOLS TEST');
  console.log('═'.repeat(50));

  // Initialize
  const module = await import('../../services/agentService');
  agentService = module.agentService;
  if (!agentService.isReady()) {
    log('Initializing agent...');
    await agentService.initialize();
  }
  success(`Agent ready with ${agentService.getToolCount()} tools\n`);

  const results: boolean[] = [];

  // ══════════════════════════════════════════════════
  section('PROPERTY SEARCH & COMPARISON');
  // ══════════════════════════════════════════════════

  results.push(await test(
    'search_properties',
    'Search for single family homes under $250,000'
  ));

  results.push(await test(
    'get_recent_deals',
    'Show me the 3 most recent deals added to the system'
  ));

  results.push(await test(
    'get_top_deals',
    'What are the top 5 best deals based on profit potential?'
  ));

  // ══════════════════════════════════════════════════
  section('MARKET DATA & ENRICHMENT');
  // ══════════════════════════════════════════════════

  results.push(await test(
    'lookup_market_data',
    'Look up market data for 123 Peachtree St, Atlanta, GA 30309'
  ));

  results.push(await test(
    'get_market_stats',
    'What are the real estate market stats for zip code 33139 in Miami?'
  ));

  results.push(await test(
    'get_rental_market_trends',
    'What are the rental market trends for Atlanta zip code 30309?'
  ));

  // ══════════════════════════════════════════════════
  section('DEAL PIPELINE');
  // ══════════════════════════════════════════════════

  results.push(await test(
    'get_my_pipeline',
    'Show me my current deal pipeline',
    testUserId
  ));

  results.push(await test(
    'get_win_loss_stats',
    'What are my win/loss statistics for deals?',
    testUserId
  ));

  // ══════════════════════════════════════════════════
  section('PORTFOLIO');
  // ══════════════════════════════════════════════════

  results.push(await test(
    'get_my_portfolio',
    'Show me my investment portfolio',
    testUserId
  ));

  results.push(await test(
    'get_portfolio_value',
    'What is the total value of my portfolio?',
    testUserId
  ));

  // ══════════════════════════════════════════════════
  section('OFFERS & CONTRACTS');
  // ══════════════════════════════════════════════════

  results.push(await test(
    'list_offers',
    'List all recent offers I have made'
  ));

  results.push(await test(
    'list_contract_templates',
    'What contract templates are available for sending?'
  ));

  // ══════════════════════════════════════════════════
  section('AUTOMATIONS');
  // ══════════════════════════════════════════════════

  results.push(await test(
    'list_automations',
    'Show me all configured automations'
  ));

  results.push(await test(
    'get_automation_history',
    'Show the recent automation execution history'
  ));

  // ══════════════════════════════════════════════════
  section('MARKETPLACE & AUCTION');
  // ══════════════════════════════════════════════════

  results.push(await test(
    'list_auction_sites',
    'What auction sites and marketplaces can I submit properties to?'
  ));

  // ══════════════════════════════════════════════════
  section('WEB SCRAPING');
  // ══════════════════════════════════════════════════

  results.push(await test(
    'scrape_website',
    'Scrape this page and tell me what it contains: https://example.com'
  ));

  // ══════════════════════════════════════════════════
  section('COMPLEX MULTI-STEP QUERIES');
  // ══════════════════════════════════════════════════

  results.push(await test(
    'full_deal_workflow',
    'I have a property at 456 Oak Street, Tampa FL 33606. It is a 3br/2ba, 1,800 sqft single family ' +
    'built in 1998. The seller wants $275,000. Comparable sales show ARV of $380,000. ' +
    'It needs about $45,000 in renovations (new roof, kitchen update, paint). ' +
    'Analyze this deal, calculate MAO at 70% ARV, and tell me if I should pursue it.'
  ));

  results.push(await test(
    'market_analysis',
    'I want to start investing in Jacksonville, FL. Give me an overview of the market - ' +
    'typical home prices, rental rates, and what areas might be good for buy-and-hold investing.'
  ));

  results.push(await test(
    'investment_comparison',
    'Compare a fix-and-flip strategy vs buy-and-hold for a $200,000 property with ' +
    '$30,000 in repairs, ARV of $280,000, and potential rent of $1,800/month.'
  ));

  // ══════════════════════════════════════════════════
  section('AGENT ANALYTICS');
  // ══════════════════════════════════════════════════

  results.push(await test(
    'get_agent_accuracy',
    'How accurate have your deal predictions been?'
  ));

  // ══════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(50));
  console.log('  TEST SUMMARY');
  console.log('═'.repeat(50) + '\n');

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`\x1b[${passed === total ? '32' : '33'}m${passed}/${total} tests passed\x1b[0m`);

  if (passed === total) {
    console.log('\n🎉 All advanced tests passed!');
  } else {
    console.log(`\n⚠️  ${total - passed} test(s) had issues`);
  }

  process.exit(passed === total ? 0 : 1);
}

runTests().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
