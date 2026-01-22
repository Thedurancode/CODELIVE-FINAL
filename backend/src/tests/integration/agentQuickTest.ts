/**
 * Quick AI Agent Tools Test
 *
 * Run with: npx ts-node src/tests/integration/agentQuickTest.ts
 *
 * Fast test of key agent tools
 */

import * as dotenv from 'dotenv';
dotenv.config();

const log = (msg: string) => console.log(`[Test] ${msg}`);
const success = (msg: string) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
const fail = (msg: string) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`);

let agentService: any;

async function chat(message: string): Promise<{ response: string; duration: number }> {
  const sessionId = `quick-${Date.now()}`;
  const start = Date.now();
  // chat(sessionId, message, userId?) - correct order
  const response = await agentService.chat(sessionId, message);
  return { response, duration: Date.now() - start };
}

async function runTests() {
  console.log('\n=== QUICK AGENT TOOLS TEST ===\n');

  // Initialize
  const module = await import('../../services/agentService');
  agentService = module.agentService;

  if (!agentService.isReady()) {
    log('Initializing agent...');
    await agentService.initialize();
  }
  success(`Agent ready (${agentService.getToolCount()} tools)`);

  const results: { name: string; passed: boolean; ms: number }[] = [];

  // Test 1: Property Count
  log('\n1. Testing property count...');
  try {
    const r = await chat('How many properties are in the database?');
    success(`Response (${r.duration}ms): ${r.response.substring(0, 100)}...`);
    results.push({ name: 'property_count', passed: true, ms: r.duration });
  } catch (e: any) {
    fail(`Error: ${e.message}`);
    results.push({ name: 'property_count', passed: false, ms: 0 });
  }

  // Test 2: Deal Analysis
  log('\n2. Testing deal analysis...');
  try {
    const r = await chat('Analyze a deal: asking $150K, ARV $220K, repairs $35K. Calculate MAO and profit.');
    success(`Response (${r.duration}ms): ${r.response.substring(0, 150)}...`);
    results.push({ name: 'deal_analysis', passed: true, ms: r.duration });
  } catch (e: any) {
    fail(`Error: ${e.message}`);
    results.push({ name: 'deal_analysis', passed: false, ms: 0 });
  }

  // Test 3: Buy Box List
  log('\n3. Testing buy box listing...');
  try {
    const r = await chat('List all buy boxes');
    success(`Response (${r.duration}ms): ${r.response.substring(0, 150)}...`);
    results.push({ name: 'list_buyboxes', passed: true, ms: r.duration });
  } catch (e: any) {
    fail(`Error: ${e.message}`);
    results.push({ name: 'list_buyboxes', passed: false, ms: 0 });
  }

  // Test 4: Knowledge Search
  log('\n4. Testing knowledge base...');
  try {
    const r = await chat('Search knowledge base for buy box criteria');
    success(`Response (${r.duration}ms): ${r.response.substring(0, 150)}...`);
    results.push({ name: 'knowledge_search', passed: true, ms: r.duration });
  } catch (e: any) {
    fail(`Error: ${e.message}`);
    results.push({ name: 'knowledge_search', passed: false, ms: 0 });
  }

  // Test 5: Memory
  log('\n5. Testing memory...');
  try {
    const r = await chat('Remember that I prefer properties in Atlanta');
    success(`Response (${r.duration}ms): ${r.response.substring(0, 100)}...`);
    results.push({ name: 'memory', passed: true, ms: r.duration });
  } catch (e: any) {
    fail(`Error: ${e.message}`);
    results.push({ name: 'memory', passed: false, ms: 0 });
  }

  // Test 6: Settings
  log('\n6. Testing settings...');
  try {
    const r = await chat('Show system settings');
    success(`Response (${r.duration}ms): ${r.response.substring(0, 150)}...`);
    results.push({ name: 'settings', passed: true, ms: r.duration });
  } catch (e: any) {
    fail(`Error: ${e.message}`);
    results.push({ name: 'settings', passed: false, ms: 0 });
  }

  // Summary
  console.log('\n=== SUMMARY ===\n');
  const passed = results.filter((r) => r.passed).length;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  for (const r of results) {
    console.log(`${r.passed ? '✅' : '❌'} ${r.name} (${r.ms}ms)`);
  }

  console.log(`\n${passed}/${results.length} passed | Total: ${(totalMs / 1000).toFixed(1)}s`);
  process.exit(passed === results.length ? 0 : 1);
}

runTests().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
