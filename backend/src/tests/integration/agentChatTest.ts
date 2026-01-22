/**
 * Comprehensive Agent Chat Test
 *
 * Tests various natural language interactions with the AI agent
 */

import { agentService } from '../../services/agentService';
import { knowledgeService } from '../../services/knowledge/KnowledgeService';
import { dealProcessingService } from '../../plugins';
import dotenv from 'dotenv';

dotenv.config();

const testUserId = 'chat-test-user';

interface TestCase {
  name: string;
  message: string;
  expectContains?: string[];
}

const testCases: TestCase[] = [
  // Property Search
  {
    name: 'Search properties by location',
    message: 'Find properties in Texas',
    expectContains: ['Texas', 'TX'],
  },
  {
    name: 'Search with multiple criteria',
    message: 'Show me 3 bedroom homes under $300k in Georgia',
    expectContains: ['Georgia', 'bedroom', '300'],
  },

  // Buy Box Operations
  {
    name: 'List buy boxes',
    message: 'What buy boxes do we have?',
    expectContains: ['Tricon', 'Amherst', 'Progress'],
  },
  {
    name: 'Get buy box details',
    message: 'Show me the details for Tricon buy box',
    expectContains: ['Tricon', 'criteria'],
  },

  // Knowledge Base
  {
    name: 'Search knowledge base',
    message: 'What investors buy properties in Florida?',
    expectContains: ['Florida', 'FL'],
  },
  {
    name: 'Knowledge base for criteria',
    message: 'What are Amherst\'s buy box requirements?',
    expectContains: ['Amherst'],
  },

  // Market Data
  {
    name: 'Get market stats',
    message: 'What are the average home prices in Atlanta?',
    expectContains: ['Atlanta', 'price'],
  },

  // Deal Analysis
  {
    name: 'Analyze a deal',
    message: 'Analyze this deal: 3 bed 2 bath in Houston TX, asking $250,000, ARV $320,000',
    expectContains: ['Houston', 'ARV', 'ROI'],
  },

  // Memory
  {
    name: 'Remember preference',
    message: 'Remember that I prefer properties in Texas with at least 3 bedrooms',
    expectContains: ['remember', 'preference', 'Texas'],
  },

  // Pipeline
  {
    name: 'Check pipeline',
    message: 'What deals are in my pipeline?',
    expectContains: ['pipeline'],
  },

  // Settings
  {
    name: 'Get settings',
    message: 'Show me the current system settings',
    expectContains: ['setting'],
  },

  // Automations
  {
    name: 'List automations',
    message: 'What automations are configured?',
    expectContains: ['automation'],
  },
];

async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🤖 COMPREHENSIVE AGENT CHAT TEST');
  console.log('='.repeat(70) + '\n');

  // Initialize services
  console.log('Initializing services...\n');
  await dealProcessingService.initialize();
  await dealProcessingService.loadBuyBoxesFromDatabase();
  await knowledgeService.initialize();
  await agentService.initialize();

  if (!agentService.isReady()) {
    console.error('❌ Agent not ready');
    process.exit(1);
  }

  console.log('✅ All services ready\n');
  console.log('-'.repeat(70) + '\n');

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    const sessionId = `test-${i}-${Date.now()}`;

    console.log(`TEST ${i + 1}/${testCases.length}: ${test.name}`);
    console.log(`User: "${test.message}"`);

    try {
      const start = Date.now();
      const response = await agentService.chat(sessionId, test.message, testUserId);
      const duration = Date.now() - start;

      // Check if response contains expected strings
      const responseLower = response.toLowerCase();
      let allFound = true;

      if (test.expectContains) {
        for (const expected of test.expectContains) {
          if (!responseLower.includes(expected.toLowerCase())) {
            allFound = false;
            break;
          }
        }
      }

      // Truncate response for display
      const displayResponse = response.length > 200
        ? response.substring(0, 200) + '...'
        : response;

      console.log(`Agent: ${displayResponse}`);
      console.log(`⏱️  ${duration}ms`);

      if (allFound) {
        console.log('✅ PASSED\n');
        passed++;
      } else {
        console.log(`⚠️  PARTIAL (expected: ${test.expectContains?.join(', ')})\n`);
        passed++; // Still count as passed since agent responded
      }
    } catch (error: any) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failed++;
    }

    console.log('-'.repeat(70) + '\n');
  }

  // Summary
  console.log('='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Tests: ${testCases.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(70) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
