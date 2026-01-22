/**
 * Deal Intelligence Test
 */

import { agentService } from '../../services/agentService';
import { knowledgeService } from '../../services/knowledge/KnowledgeService';
import { dealProcessingService } from '../../plugins';
import dotenv from 'dotenv';

dotenv.config();

async function runTest() {
  console.log('\n' + '='.repeat(70));
  console.log('🧠 TESTING DEAL INTELLIGENCE');
  console.log('='.repeat(70) + '\n');

  await dealProcessingService.initialize();
  await dealProcessingService.loadBuyBoxesFromDatabase();
  await knowledgeService.initialize();
  await agentService.initialize();

  console.log('Services ready. Running tests...\n');

  // Test 1: Full deal intelligence
  console.log('TEST 1: "Is this a good deal: 3 bed in Houston, $220k, ARV $290k, 45 days on market?"');
  console.log('-'.repeat(70));

  const response1 = await agentService.chat(
    'intel-test-1-' + Date.now(),
    'Is this a good deal: 3 bed house in Houston for $220k, ARV $290k, been on market 45 days?',
    'test-user'
  );
  console.log('\nAgent Response:');
  console.log(response1);

  // Test 2: Pricing strategy
  console.log('\n' + '='.repeat(70));
  console.log('\nTEST 2: "What should I offer on a $350k property in Atlanta, listed 60 days?"');
  console.log('-'.repeat(70));

  const response2 = await agentService.chat(
    'intel-test-2-' + Date.now(),
    'What should I offer on a $350k property in Atlanta that has been listed for 60 days?',
    'test-user'
  );
  console.log('\nAgent Response:');
  console.log(response2);

  // Test 3: Fund matching
  console.log('\n' + '='.repeat(70));
  console.log('\nTEST 3: "Which funds would most likely buy a 4 bed in Dallas for $275k?"');
  console.log('-'.repeat(70));

  const response3 = await agentService.chat(
    'intel-test-3-' + Date.now(),
    'Which funds would most likely buy a 4 bed in Dallas for $275k?',
    'test-user'
  );
  console.log('\nAgent Response:');
  console.log(response3);

  console.log('\n' + '='.repeat(70));
  console.log('✅ INTELLIGENCE TESTS COMPLETE');
  console.log('='.repeat(70) + '\n');

  process.exit(0);
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
