/**
 * Memory Service Integration Test
 *
 * Tests persistent memory across sessions
 */

import { memoryService } from '../../services/MemoryService';
import { agentService } from '../../services/agentService';
import dotenv from 'dotenv';

dotenv.config();

const testUserId = 'test-memory-user-' + Date.now();
const sessionId1 = 'session-memory-1-' + Date.now();
const sessionId2 = 'session-memory-2-' + Date.now();

async function runMemoryTests() {
  console.log('\n========================================');
  console.log('🧠 MEMORY SERVICE TEST');
  console.log('========================================\n');

  // Initialize services
  console.log('Initializing services...');
  await memoryService.initialize();
  await agentService.initialize();

  if (!memoryService.isReady()) {
    console.error('❌ Memory service not ready. Check PINECONE_API_KEY and OPENAI_API_KEY');
    process.exit(1);
  }

  if (!agentService.isReady()) {
    console.error('❌ Agent service not ready. Check API keys');
    process.exit(1);
  }

  console.log('✅ Services initialized\n');

  // Test 1: Store a preference
  console.log('TEST 1: Store user preference');
  console.log('-'.repeat(40));

  const prefId = await memoryService.storePreference(
    testUserId,
    'User prefers properties in Georgia and Texas, price range $150k-$300k, minimum 3 bedrooms',
    8
  );
  console.log(`✅ Stored preference: ${prefId}\n`);

  // Test 2: Store a deal decision
  console.log('TEST 2: Store deal decision');
  console.log('-'.repeat(40));

  const decisionId = await memoryService.storeDealDecision(
    testUserId,
    'prop-123-abc',
    'liked',
    'Great ROI potential, good neighborhood, meets all criteria'
  );
  console.log(`✅ Stored decision: ${decisionId}\n`);

  // Test 3: Search memories
  console.log('TEST 3: Search memories by query');
  console.log('-'.repeat(40));

  const searchResults = await memoryService.searchMemories(
    testUserId,
    'property preferences Georgia',
    { topK: 5 }
  );

  console.log(`Found ${searchResults.length} memories:`);
  for (const mem of searchResults) {
    console.log(`  - [${mem.type}] ${mem.content.substring(0, 60)}... (score: ${mem.score.toFixed(2)})`);
  }
  console.log();

  // Test 4: Get relevant context
  console.log('TEST 4: Get relevant context for a query');
  console.log('-'.repeat(40));

  const context = await memoryService.getRelevantContext(
    testUserId,
    'Find me properties in Georgia'
  );

  if (context) {
    console.log('Context retrieved:');
    console.log(context);
  } else {
    console.log('No relevant context found');
  }
  console.log();

  // Test 5: Agent chat with memory (Session 1)
  console.log('TEST 5: Agent chat with memory - Session 1');
  console.log('-'.repeat(40));

  const response1 = await agentService.chat(
    sessionId1,
    'I really like single family homes in Atlanta under $250k with at least 3 beds',
    testUserId
  );
  console.log(`Agent response: ${response1.substring(0, 200)}...`);
  console.log();

  // Wait for memory extraction
  console.log('Waiting for memory extraction...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 6: New session should remember preferences
  console.log('TEST 6: New session with memory recall');
  console.log('-'.repeat(40));

  const response2 = await agentService.chat(
    sessionId2,
    'What kind of properties do I prefer?',
    testUserId
  );
  console.log(`Agent response: ${response2.substring(0, 300)}...`);
  console.log();

  // Test 7: Get memory stats
  console.log('TEST 7: Get memory statistics');
  console.log('-'.repeat(40));

  const stats = await memoryService.getStats(testUserId);
  console.log(`Total memories: ${stats.totalMemories}`);
  console.log('By type:', stats.byType);
  console.log();

  // Cleanup
  console.log('TEST 8: Cleanup - Clear test user memories');
  console.log('-'.repeat(40));

  await memoryService.clearUserMemories(testUserId);
  console.log('✅ Test memories cleared\n');

  // Verify cleanup
  const statsAfter = await memoryService.getStats(testUserId);
  console.log(`Memories after cleanup: ${statsAfter.totalMemories}`);

  console.log('\n========================================');
  console.log('✅ ALL MEMORY TESTS COMPLETE');
  console.log('========================================\n');

  process.exit(0);
}

runMemoryTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
