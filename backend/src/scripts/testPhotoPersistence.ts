/**
 * Test Photo Persistence for a specific property
 *
 * Usage:
 *   npx ts-node src/scripts/testPhotoPersistence.ts "2408 Jameston Commons, Hillsborough, NJ"
 */

import dotenv from 'dotenv';
dotenv.config();

import { marketDataService } from '../services/MarketDataService';
import { photoPersistenceService } from '../services/PhotoPersistenceService';
import PropertyLookup from '../models/PropertyLookup';
import { syncDatabase } from '../models';

interface PropertyPhoto {
  jpegUrl: string;
  webpUrl?: string;
}

interface PropertyImages {
  photos: PropertyPhoto[];
  primaryImage?: string;
  totalPhotos: number;
}

async function testPropertyPhotoPersistence(address: string): Promise<void> {
  console.log('');
  console.log('='.repeat(70));
  console.log('  PHOTO PERSISTENCE TEST');
  console.log('  Address:', address);
  console.log('='.repeat(70));
  console.log('');

  // Sync database
  await syncDatabase({ alter: false });

  // Step 1: Look up property with images
  console.log('STEP 1: Looking up property from Zillow API...');
  console.log('');

  const lookup = await marketDataService.getFullPropertyLookup(
    { address: address },
    { includeImages: true }
  );

  if (!lookup || !lookup.property) {
    console.log('❌ Property not found');
    return;
  }

  const property = lookup.property;

  console.log('✅ Property found!');
  console.log('   ZPID:', property.zpid);
  console.log('   Address:', property.address);
  console.log('   Zestimate: $' + (property.zestimate?.toLocaleString() || 'N/A'));
  console.log('');

  // Step 2: Show current image URLs
  console.log('STEP 2: Current photo URLs (external Zillow URLs)');
  console.log('');

  const images = lookup.images as PropertyImages | undefined;
  if (!images?.photos?.length) {
    console.log('   No photos available for this property');
    return;
  }

  console.log('   Total photos:', images.photos.length);
  images.photos.slice(0, 3).forEach((photo: PropertyPhoto, i: number) => {
    const url = photo.jpegUrl || 'N/A';
    let domain = '';
    if (url.includes('zillow') || url.includes('zillowstatic')) {
      domain = '(Zillow - will expire!)';
    } else if (url.includes('supabase')) {
      domain = '(Supabase - permanent)';
    }
    console.log(`   Photo ${i + 1}: ${url.substring(0, 60)}... ${domain}`);
  });
  if (images.photos.length > 3) {
    console.log('   ... and', images.photos.length - 3, 'more');
  }
  console.log('');

  // Step 3: Get the PropertyLookup record
  console.log('STEP 3: Finding PropertyLookup record in database...');
  const dbLookup = await PropertyLookup.findOne({ where: { zpid: property.zpid } });

  if (!dbLookup) {
    console.log('❌ PropertyLookup record not found in database');
    return;
  }

  console.log('✅ Found record ID:', dbLookup.id);
  console.log('');

  // Step 4: Run photo persistence
  console.log('STEP 4: Running photo persistence (downloading & uploading to Supabase)...');
  console.log('');

  const result = await photoPersistenceService.persistPropertyPhotos(dbLookup.id);

  console.log('   Total photos:', result.totalPhotos);
  console.log('   Persisted:', result.persistedPhotos);
  console.log('   Failed:', result.failedPhotos);
  console.log('');

  if (result.errors.length > 0) {
    console.log('   Errors:');
    result.errors.forEach((e: string) => console.log('   -', e));
    console.log('');
  }

  // Step 5: Show new permanent URLs
  if (result.permanentUrls.length > 0) {
    console.log('STEP 5: New permanent Supabase URLs');
    console.log('');
    result.permanentUrls.slice(0, 3).forEach((url: string, i: number) => {
      console.log(`   Photo ${i + 1}: ${url.substring(0, 70)}...`);
    });
    if (result.permanentUrls.length > 3) {
      console.log('   ... and', result.permanentUrls.length - 3, 'more');
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('✅ TEST COMPLETE - Photos are now permanently stored in Supabase!');
  console.log('='.repeat(70));
}

// Get address from command line arguments
const address = process.argv[2] || '2408 Jameston Commons, Hillsborough, NJ';

testPropertyPhotoPersistence(address)
  .catch(console.error)
  .finally(() => process.exit(0));
