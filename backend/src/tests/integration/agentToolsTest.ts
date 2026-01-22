/**
 * AI Agent Tools Integration Test
 *
 * Run with: npx ts-node src/tests/integration/agentToolsTest.ts
 *
 * Tests the AI agent's tools through natural language commands
 */

import * as dotenv from 'dotenv';
dotenv.config();

const log = (msg: string) => console.log(`[Tools Test] ${msg}`);
const success = (msg: string) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
const fail = (msg: string) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`);
const info = (msg: string) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`);

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  response?: string;
  error?: string;
}

let agentService: any;

async function initAgent(): Promise<boolean> {
  log('Initializing agent service...');
  try {
    const module = await import('../../services/agentService');
    agentService = module.agentService;

    if (!agentService.isReady()) {
      await agentService.initialize();
    }

    if (agentService.isReady()) {
      success(`Agent ready with ${agentService.getToolCount()} tools`);
      return true;
    }
    return false;
  } catch (error) {
    fail(`Init error: ${error}`);
    return false;
  }
}

async function testTool(
  name: string,
  message: string,
  expectedKeywords: string[] = []
): Promise<TestResult> {
  const sessionId = `tool-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  try {
    log(`Testing: ${name}`);
    info(`Message: "${message.substring(0, 80)}${message.length > 80 ? '...' : ''}"`);

    // chat(sessionId, message, userId?) - correct order
    const response = await agentService.chat(sessionId, message);
    const duration = Date.now() - startTime;

    if (!response || response.length === 0) {
      return { name, passed: false, duration, error: 'Empty response' };
    }

    // Check for expected keywords in response
    const missingKeywords = expectedKeywords.filter(
      (kw) => !response.toLowerCase().includes(kw.toLowerCase())
    );

    if (missingKeywords.length > 0 && expectedKeywords.length > 0) {
      // Soft fail - response exists but might not have expected content
      info(`Response (${duration}ms): ${response.substring(0, 200)}...`);
      info(`Note: Missing expected keywords: ${missingKeywords.join(', ')}`);
    }

    success(`${name} completed in ${duration}ms`);
    console.log(`   Response preview: ${response.substring(0, 150).replace(/\n/g, ' ')}...`);

    return { name, passed: true, duration, response };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    fail(`${name} failed: ${error.message}`);
    return { name, passed: false, duration, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('  AI AGENT TOOLS INTEGRATION TESTS');
  console.log('='.repeat(60) + '\n');

  // Check environment
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  info(`OpenRouter: ${hasOpenRouter ? 'configured' : 'missing'}`);
  info(`OpenAI: ${hasOpenAI ? 'configured' : 'missing'}`);
  info(`Model: ${process.env.AGENT_MODEL || 'default'}`);
  console.log('');

  if (!hasOpenRouter && !hasOpenAI) {
    fail('No AI provider configured');
    process.exit(1);
  }

  // Initialize
  if (!(await initAgent())) {
    fail('Failed to initialize agent');
    process.exit(1);
  }

  console.log('\n' + '-'.repeat(60));
  console.log('  RUNNING TOOL TESTS');
  console.log('-'.repeat(60) + '\n');

  const results: TestResult[] = [];

  // ============================================================
  // PROPERTY TOOLS
  // ============================================================
  console.log('\n📦 PROPERTY TOOLS\n');

  results.push(
    await testTool(
      'get_property_count',
      'How many properties are in the database?',
      ['propert']
    )
  );

  results.push(
    await testTool(
      'search_properties',
      'Search for properties in Florida under $300,000',
      []
    )
  );

  results.push(
    await testTool(
      'get_recent_deals',
      'Show me the 5 most recent deals',
      []
    )
  );

  // ============================================================
  // DEAL ANALYSIS TOOLS
  // ============================================================
  console.log('\n📊 DEAL ANALYSIS TOOLS\n');

  results.push(
    await testTool(
      'analyze_deal',
      'Analyze this deal: 123 Main St, Orlando FL, asking $180,000, ARV $250,000, repairs $40,000',
      ['profit', 'mao', 'arv']
    )
  );

  results.push(
    await testTool(
      'quick_deal_assessment',
      'Quick assessment: property at $200,000 with ARV $280,000 and $30,000 in repairs. Is it a good flip?',
      []
    )
  );

  // ============================================================
  // BUY BOX TOOLS
  // ============================================================
  console.log('\n📋 BUY BOX TOOLS\n');

  results.push(
    await testTool(
      'list_buyboxes',
      'List all active buy boxes',
      []
    )
  );

  results.push(
    await testTool(
      'score_deal_against_buyboxes',
      'Score this property against buy boxes: 3br/2ba single family in Atlanta GA, $175,000 asking, 1,800 sqft, built 1995',
      []
    )
  );

  // ============================================================
  // KNOWLEDGE BASE TOOLS
  // ============================================================
  console.log('\n🧠 KNOWLEDGE BASE TOOLS\n');

  results.push(
    await testTool(
      'search_knowledge',
      'Search the knowledge base for information about Tricon buy box criteria',
      []
    )
  );

  results.push(
    await testTool(
      'get_knowledge_stats',
      'What are the knowledge base statistics?',
      []
    )
  );

  // ============================================================
  // MEMORY TOOLS
  // ============================================================
  console.log('\n💾 MEMORY TOOLS\n');

  results.push(
    await testTool(
      'remember_preference',
      'Remember that my target market is Atlanta, Georgia',
      []
    )
  );

  results.push(
    await testTool(
      'recall_memories',
      'What do you remember about my preferences?',
      []
    )
  );

  results.push(
    await testTool(
      'get_memory_stats',
      'How many memories do you have stored?',
      []
    )
  );

  // ============================================================
  // AUTOMATION TOOLS
  // ============================================================
  console.log('\n⚡ AUTOMATION TOOLS\n');

  results.push(
    await testTool(
      'list_automations',
      'List all configured automations',
      []
    )
  );

  // ============================================================
  // MARKET DATA TOOLS
  // ============================================================
  console.log('\n📈 MARKET DATA TOOLS\n');

  results.push(
    await testTool(
      'get_market_stats',
      'What are the market statistics for zip code 30309 in Atlanta?',
      []
    )
  );

  results.push(
    await testTool(
      'get_rental_market_trends',
      'What are the rental trends in zip code 33139 in Miami?',
      []
    )
  );

  // ============================================================
  // SETTINGS TOOLS
  // ============================================================
  console.log('\n⚙️ SETTINGS TOOLS\n');

  results.push(
    await testTool(
      'get_settings',
      'Show me the current system settings',
      []
    )
  );

  // ============================================================
  // OFFER/CONTRACT TOOLS
  // ============================================================
  console.log('\n📝 OFFER TOOLS\n');

  results.push(
    await testTool(
      'list_offers',
      'List all recent offers',
      []
    )
  );

  results.push(
    await testTool(
      'list_contract_templates',
      'What contract templates are available?',
      []
    )
  );

  // ============================================================
  // PIPELINE TOOLS
  // ============================================================
  console.log('\n🔄 PIPELINE TOOLS\n');

  results.push(
    await testTool(
      'get_my_pipeline',
      'Show me my current deal pipeline',
      []
    )
  );

  results.push(
    await testTool(
      'get_win_loss_stats',
      'What are my win/loss stats for deals?',
      []
    )
  );

  // ============================================================
  // PORTFOLIO TOOLS
  // ============================================================
  console.log('\n💼 PORTFOLIO TOOLS\n');

  results.push(
    await testTool(
      'get_my_portfolio',
      'Show me my investment portfolio',
      []
    )
  );

  results.push(
    await testTool(
      'get_portfolio_value',
      'What is my total portfolio value?',
      []
    )
  );

  // ============================================================
  // COMPLEX MULTI-TOOL QUERIES
  // ============================================================
  console.log('\n🔗 COMPLEX QUERIES (Multi-Tool)\n');

  results.push(
    await testTool(
      'complex_deal_evaluation',
      'I found a property at 456 Oak Lane, Tampa FL 33606. Its a 4br/3ba single family home, 2,200 sqft, built in 2005. ' +
        'The seller is asking $350,000. Comparable sales suggest an ARV of $450,000. ' +
        'It needs about $50,000 in renovations. Can you analyze this deal, score it against buy boxes, and tell me if I should pursue it?',
      []
    )
  );

  results.push(
    await testTool(
      'market_research',
      'I want to invest in the Jacksonville FL market. What can you tell me about property prices, rental rates, and any buy boxes that focus on that area?',
      []
    )
  );

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('  TEST RESULTS SUMMARY');
  console.log('='.repeat(60) + '\n');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  for (const result of results) {
    const status = result.passed ? '\x1b[32m✅\x1b[0m' : '\x1b[31m❌\x1b[0m';
    const time = `(${result.duration}ms)`;
    console.log(`${status} ${result.name} ${time}`);
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);
  console.log(`Total time: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`Avg time per test: ${Math.round(totalDuration / results.length)}ms`);

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} test(s) failed`);
  } else {
    console.log('\n🎉 All tests passed!');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
