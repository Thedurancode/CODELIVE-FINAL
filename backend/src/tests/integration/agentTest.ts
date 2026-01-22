/**
 * AI Agent Integration Test
 *
 * Run with: npx ts-node src/tests/integration/agentTest.ts
 *
 * Tests the AI agent service directly without HTTP server
 */

import * as dotenv from 'dotenv';
dotenv.config();

const log = (msg: string) => console.log(`[Agent Test] ${msg}`);
const success = (msg: string) => console.log(`✅ ${msg}`);
const fail = (msg: string) => console.log(`❌ ${msg}`);

async function testAgentInitialization(): Promise<boolean> {
  log('Testing agent initialization...');

  try {
    const { agentService } = await import('../../services/agentService');

    // Check if already initialized or initialize
    if (!agentService.isReady()) {
      log('Initializing agent service...');
      await agentService.initialize();
    }

    if (agentService.isReady()) {
      success('Agent service initialized successfully');

      // Get status
      const modelName = agentService.getModelName();
      const toolCount = agentService.getToolCount();
      log(`  Model: ${modelName || 'default'}`);
      log(`  Tools: ${toolCount} available`);

      return true;
    } else {
      fail('Agent service failed to initialize');
      return false;
    }
  } catch (error) {
    fail(`Initialization error: ${error}`);
    return false;
  }
}

async function testSimpleChat(): Promise<boolean> {
  log('Testing simple chat...');

  try {
    const { agentService } = await import('../../services/agentService');

    if (!agentService.isReady()) {
      fail('Agent not ready');
      return false;
    }

    const sessionId = `test-session-${Date.now()}`;
    const testMessage = 'Hello! What can you help me with?';

    log(`Sending message: "${testMessage}"`);
    const startTime = Date.now();

    // chat(sessionId, message, userId?) - correct order
    const response = await agentService.chat(sessionId, testMessage);

    const duration = Date.now() - startTime;
    log(`Response received in ${duration}ms`);

    if (response && response.length > 0) {
      success('Received response from agent');
      log(`  Response preview: ${response.substring(0, 150)}...`);
      return true;
    } else {
      fail('Empty response from agent');
      return false;
    }
  } catch (error) {
    fail(`Chat error: ${error}`);
    return false;
  }
}

async function testPropertySearch(): Promise<boolean> {
  log('Testing property search tool...');

  try {
    const { agentService } = await import('../../services/agentService');

    if (!agentService.isReady()) {
      fail('Agent not ready');
      return false;
    }

    const sessionId = `test-property-${Date.now()}`;
    const testMessage = 'How many properties do we have in the database?';

    log(`Sending message: "${testMessage}"`);
    const startTime = Date.now();

    // chat(sessionId, message, userId?) - correct order
    const response = await agentService.chat(sessionId, testMessage);

    const duration = Date.now() - startTime;
    log(`Response received in ${duration}ms`);

    if (response && response.length > 0) {
      success('Property search completed');
      log(`  Response: ${response.substring(0, 200)}...`);
      return true;
    } else {
      fail('No response from property search');
      return false;
    }
  } catch (error) {
    fail(`Property search error: ${error}`);
    return false;
  }
}

async function testDealAnalysis(): Promise<boolean> {
  log('Testing deal analysis...');

  try {
    const { agentService } = await import('../../services/agentService');

    if (!agentService.isReady()) {
      fail('Agent not ready');
      return false;
    }

    const sessionId = `test-analysis-${Date.now()}`;
    const testMessage = 'What would be the profit potential on a property with asking price $150,000, ARV of $220,000, and estimated repairs of $35,000?';

    log(`Sending message: "${testMessage}"`);
    const startTime = Date.now();

    // chat(sessionId, message, userId?) - correct order
    const response = await agentService.chat(sessionId, testMessage);

    const duration = Date.now() - startTime;
    log(`Response received in ${duration}ms`);

    if (response && response.length > 0) {
      success('Deal analysis completed');
      log(`  Response: ${response.substring(0, 300)}...`);
      return true;
    } else {
      fail('No response from deal analysis');
      return false;
    }
  } catch (error) {
    fail(`Deal analysis error: ${error}`);
    return false;
  }
}

async function testToolListing(): Promise<boolean> {
  log('Testing available tools...');

  try {
    const { agentService } = await import('../../services/agentService');

    const toolCount = agentService.getToolCount();

    if (toolCount > 0) {
      success(`Agent has ${toolCount} tools available`);

      // The agent should have 36+ tools based on the code
      if (toolCount >= 30) {
        log(`  Expected 30+ tools, found ${toolCount}`);
        return true;
      } else {
        fail(`Expected 30+ tools, only found ${toolCount}`);
        return false;
      }
    } else {
      fail('No tools available');
      return false;
    }
  } catch (error) {
    fail(`Tool listing error: ${error}`);
    return false;
  }
}

async function runAllTests() {
  console.log('\n========================================');
  console.log('  AI AGENT INTEGRATION TESTS');
  console.log('========================================\n');

  // Check environment
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  log(`OpenRouter API Key: ${hasOpenRouter ? '✓ configured' : '✗ missing'}`);
  log(`OpenAI API Key: ${hasOpenAI ? '✓ configured' : '✗ missing'}`);
  log(`Agent Model: ${process.env.AGENT_MODEL || 'default'}`);
  console.log('');

  if (!hasOpenRouter && !hasOpenAI) {
    fail('No AI provider configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY');
    process.exit(1);
  }

  const results: { name: string; passed: boolean }[] = [];

  // Run tests
  results.push({
    name: 'Agent Initialization',
    passed: await testAgentInitialization(),
  });

  results.push({
    name: 'Tool Listing',
    passed: await testToolListing(),
  });

  results.push({
    name: 'Simple Chat',
    passed: await testSimpleChat(),
  });

  results.push({
    name: 'Property Search',
    passed: await testPropertySearch(),
  });

  results.push({
    name: 'Deal Analysis',
    passed: await testDealAnalysis(),
  });

  // Summary
  console.log('\n========================================');
  console.log('  TEST RESULTS SUMMARY');
  console.log('========================================\n');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    console.log(`${result.passed ? '✅' : '❌'} ${result.name}`);
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} test(s) failed - check output above for details`);
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
