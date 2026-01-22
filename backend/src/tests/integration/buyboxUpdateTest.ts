/**
 * Test updating a buy box via natural language chat
 */

import { agentService } from '../../services/agentService';
import { knowledgeService } from '../../services/knowledge/KnowledgeService';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('Initializing services...');
  await knowledgeService.initialize();
  await agentService.initialize();

  console.log('✅ Services ready\n');

  const sessionId = 'test-buybox-update-' + Date.now();

  console.log('User: "Update the Tricon buy box - they now accept pools on their deals"\n');

  const response = await agentService.chat(
    sessionId,
    'Update the Tricon buy box - they now accept pools on their deals',
    'test-user'
  );

  console.log('='.repeat(60));
  console.log('AGENT RESPONSE:');
  console.log('='.repeat(60));
  console.log(response);
  console.log('='.repeat(60));

  process.exit(0);
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
