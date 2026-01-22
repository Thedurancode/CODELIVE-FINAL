/**
 * Batch import all buy box documents from knowledge/Buyboxes folder
 */
import { buyBoxImportService } from '../src/services/BuyBoxImportService';
import sequelize from '../src/config/database';
import fs from 'fs';
import path from 'path';

const buyboxDir = './knowledge/Buyboxes';

async function processAll() {
  await sequelize.authenticate();
  console.log('\n🚀 BATCH PROCESSING BUY BOX DOCUMENTS\n');
  console.log('='.repeat(60));
  
  const pngFiles = fs.readdirSync(buyboxDir).filter(f => f.endsWith('.png'));
  console.log('Found ' + pngFiles.length + ' PNG files to process\n');
  
  const results: any[] = [];
  
  for (let i = 0; i < pngFiles.length; i++) {
    const file = pngFiles[i];
    const filePath = path.join(buyboxDir, file);
    
    console.log('\n[' + (i+1) + '/' + pngFiles.length + '] Processing: ' + file.substring(0, 50) + '...');
    
    try {
      const buffer = fs.readFileSync(filePath);
      const result = await buyBoxImportService.importFromDocument(buffer, 'image/png', file);
      
      results.push({
        file,
        success: result.success,
        action: result.action,
        fundName: result.extracted.fundName,
        confidence: result.extracted.confidence,
        criteria: result.extracted.criteria
      });
      
      if (result.success) {
        console.log('   ✅ ' + result.action + ': ' + result.extracted.fundName + ' (' + (result.extracted.confidence * 100).toFixed(0) + '%)');
        const c = result.extracted.criteria as any;
        if (c.states && c.states.length) console.log('      States: ' + c.states.join(', '));
        if (c.minPrice || c.maxPrice) console.log('      Price: $' + (c.minPrice||0).toLocaleString() + ' - $' + (c.maxPrice||0).toLocaleString());
      } else {
        console.log('   ❌ Failed: ' + result.message);
      }
    } catch (error: any) {
      console.log('   ❌ Error: ' + error.message);
      results.push({ file, success: false, error: error.message });
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY\n');
  
  const successful = results.filter(r => r.success);
  console.log('✅ Successful: ' + successful.length + '/' + results.length);
  
  if (successful.length > 0) {
    console.log('\n📦 BUY BOXES EXTRACTED:\n');
    for (const r of successful) {
      const c = r.criteria as any;
      console.log(r.fundName + ':');
      console.log('   States: ' + (c.states ? c.states.join(', ') : 'N/A'));
      console.log('   Price: $' + (c.minPrice||0).toLocaleString() + ' - $' + (c.maxPrice||0).toLocaleString());
      console.log('   Beds: ' + (c.minBedrooms || 'any') + ' - ' + (c.maxBedrooms || 'any'));
      console.log('');
    }
  }
  
  await sequelize.close();
}

processAll().catch(e => console.error('Error:', e.message));
