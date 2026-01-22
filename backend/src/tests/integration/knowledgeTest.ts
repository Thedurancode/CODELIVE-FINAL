/**
 * Knowledge Base (Vector DB) Test
 *
 * Run with: npx ts-node src/tests/integration/knowledgeTest.ts
 *
 * Tests the Pinecone vector database and semantic search
 */

import * as dotenv from 'dotenv';
dotenv.config();

const log = (msg: string) => console.log(`[KB Test] ${msg}`);
const success = (msg: string) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
const fail = (msg: string) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`);
const info = (msg: string) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`);

async function runTests() {
  console.log('\n' + '═'.repeat(50));
  console.log('  KNOWLEDGE BASE (VECTOR DB) TEST');
  console.log('═'.repeat(50) + '\n');

  // Check environment
  const hasPinecone = !!process.env.PINECONE_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  info(`Pinecone API Key: ${hasPinecone ? 'configured' : 'MISSING'}`);
  info(`OpenAI API Key: ${hasOpenAI ? 'configured' : 'MISSING'}`);

  if (!hasPinecone || !hasOpenAI) {
    fail('Missing required API keys for knowledge base');
    process.exit(1);
  }

  // Test 1: Initialize Knowledge Service
  log('\n1. Initializing Knowledge Service...');
  let knowledgeService: any;
  try {
    const module = await import('../../services/knowledge');
    knowledgeService = module.knowledgeService;

    if (!knowledgeService.isReady()) {
      await knowledgeService.initialize();
    }

    if (knowledgeService.isReady()) {
      success('Knowledge Service initialized');
    } else {
      fail('Knowledge Service failed to initialize');
      process.exit(1);
    }
  } catch (e: any) {
    fail(`Init error: ${e.message}`);
    process.exit(1);
  }

  // Test 2: Get Stats
  log('\n2. Getting Knowledge Base Stats...');
  try {
    const stats = await knowledgeService.getStats();
    success('Got stats:');
    console.log(`   - Total Documents: ${stats.totalDocuments}`);
    console.log(`   - Total Chunks: ${stats.totalChunks}`);
    console.log(`   - Index: ${stats.indexName}`);
    console.log(`   - Status: ${stats.status}`);
  } catch (e: any) {
    fail(`Stats error: ${e.message}`);
  }

  // Test 3: List Documents
  log('\n3. Listing Indexed Documents...');
  try {
    const docs = await knowledgeService.listDocuments();
    if (docs.length > 0) {
      success(`Found ${docs.length} documents:`);
      docs.slice(0, 5).forEach((doc: any) => {
        console.log(`   - ${doc.filename} (${doc.chunksCount} chunks, ${doc.status})`);
      });
      if (docs.length > 5) {
        console.log(`   ... and ${docs.length - 5} more`);
      }
    } else {
      info('No documents indexed yet');
    }
  } catch (e: any) {
    fail(`List error: ${e.message}`);
  }

  // Test 4: Semantic Search - Buy Box Criteria
  log('\n4. Testing Semantic Search: "Tricon buy box criteria"...');
  try {
    const results = await knowledgeService.search('What are the Tricon buy box criteria?', 3);
    if (results.length > 0) {
      success(`Found ${results.length} results:`);
      results.forEach((r: any, i: number) => {
        console.log(`\n   Result ${i + 1} (score: ${r.score.toFixed(3)}):`);
        console.log(`   File: ${r.metadata.filename}`);
        console.log(`   Text: ${r.text.substring(0, 200).replace(/\n/g, ' ')}...`);
      });
    } else {
      info('No results found - documents may not be indexed yet');
    }
  } catch (e: any) {
    fail(`Search error: ${e.message}`);
  }

  // Test 5: Search for specific criteria
  log('\n5. Testing Search: "What states does Tricon buy in?"...');
  try {
    const results = await knowledgeService.search('What states does Tricon buy properties in?', 3);
    if (results.length > 0) {
      success(`Found ${results.length} results:`);
      results.forEach((r: any, i: number) => {
        console.log(`\n   Result ${i + 1} (score: ${r.score.toFixed(3)}):`);
        console.log(`   File: ${r.metadata.filename}`);
        console.log(`   Text: ${r.text.substring(0, 200).replace(/\n/g, ' ')}...`);
      });
    } else {
      info('No results found');
    }
  } catch (e: any) {
    fail(`Search error: ${e.message}`);
  }

  // Test 6: Search for price ranges
  log('\n6. Testing Search: "What is the maximum price for institutional buyers?"...');
  try {
    const results = await knowledgeService.search('What is the maximum purchase price for institutional buyers?', 3);
    if (results.length > 0) {
      success(`Found ${results.length} results:`);
      results.forEach((r: any, i: number) => {
        console.log(`\n   Result ${i + 1} (score: ${r.score.toFixed(3)}):`);
        console.log(`   File: ${r.metadata.filename}`);
        console.log(`   Text: ${r.text.substring(0, 200).replace(/\n/g, ' ')}...`);
      });
    } else {
      info('No results found');
    }
  } catch (e: any) {
    fail(`Search error: ${e.message}`);
  }

  // Test 7: Test through Agent
  log('\n7. Testing Knowledge Base through AI Agent...');
  try {
    const agentModule = await import('../../services/agentService');
    const agentService = agentModule.agentService;

    if (!agentService.isReady()) {
      await agentService.initialize();
    }

    const sessionId = `kb-test-${Date.now()}`;
    const response = await agentService.chat(
      sessionId,
      'Search the knowledge base and tell me what buy box criteria Tricon has. What states do they buy in and what are their price limits?'
    );

    if (response && response.length > 0) {
      success('Agent responded with knowledge base info:');
      console.log(`\n   ${response.substring(0, 500).replace(/\n/g, '\n   ')}...`);
    } else {
      fail('Empty response from agent');
    }
  } catch (e: any) {
    fail(`Agent test error: ${e.message}`);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('  KNOWLEDGE BASE TEST COMPLETE');
  console.log('═'.repeat(50) + '\n');
}

runTests().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
