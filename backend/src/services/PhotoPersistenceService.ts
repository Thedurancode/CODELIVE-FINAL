/**
 * Photo Persistence Service
 *
 * Background job that downloads Zillow property photos and persists them
 * to Supabase Storage to prevent URL expiration (Zillow URLs expire after ~30 days).
 *
 * Features:
 * - Downloads photos from external URLs (Zillow)
 * - Uploads to Supabase Storage with permanent URLs
 * - Updates PropertyLookup.imagesData with new permanent URLs
 * - Runs as a scheduled cron job (daily at 3 AM)
 * - Can be triggered manually via API
 */

import cron from 'node-cron';
import { Op } from 'sequelize';
import PropertyLookup from '../models/PropertyLookup';
import { supabaseStorageService } from './SupabaseStorageService';

// =============================================================================
// TYPES
// =============================================================================

interface PropertyImages {
  primaryImage?: string;
  streetViewUrl?: string;
  propertyUrl?: string;
  photos: PropertyPhoto[];
  totalPhotos: number;
  lastUpdated: Date;
  dataSource: string;
  // Added by this service
  persistedToSupabase?: boolean;
  supabaseUrls?: string[];
}

interface PropertyPhoto {
  jpegUrl: string;
  webpUrl?: string;
  resolutions: Array<{
    url: string;
    width: number;
    format: 'jpeg' | 'webp';
  }>;
}

export interface PhotoPersistenceResult {
  propertyLookupId: number;
  zpid: string;
  totalPhotos: number;
  persistedPhotos: number;
  failedPhotos: number;
  permanentUrls: string[];
  errors: string[];
}

export interface PhotoPersistenceStats {
  processed: number;
  pending: number;
  failed: number;
  lastRunAt: Date | null;
  isRunning: boolean;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Cron schedule: Daily at 3:00 AM
const CRON_SCHEDULE = '0 3 * * *';

// Maximum concurrent photo downloads
const MAX_CONCURRENT_DOWNLOADS = 3;

// Batch size for processing properties
const BATCH_SIZE = 10;

// Supabase URL pattern to identify already-persisted photos
const SUPABASE_URL_PATTERN = /supabase\.co/;

// =============================================================================
// PHOTO PERSISTENCE SERVICE
// =============================================================================

class PhotoPersistenceService {
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private lastRunAt: Date | null = null;
  private stats = {
    processed: 0,
    pending: 0,
    failed: 0,
  };

  // ===========================================================================
  // SCHEDULER CONTROLS
  // ===========================================================================

  /**
   * Start the photo persistence scheduler
   */
  start(): void {
    if (this.cronJob) {
      console.log('[PhotoPersistence] Scheduler already running');
      return;
    }

    this.cronJob = cron.schedule(CRON_SCHEDULE, async () => {
      console.log('[PhotoPersistence] Scheduled job started');
      await this.runNow();
    });

    console.log('[PhotoPersistence] Scheduler started - runs daily at 3:00 AM');
  }

  /**
   * Stop the photo persistence scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[PhotoPersistence] Scheduler stopped');
    }
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.cronJob !== null;
  }

  /**
   * Get service statistics
   */
  getStats(): PhotoPersistenceStats {
    return {
      ...this.stats,
      lastRunAt: this.lastRunAt,
      isRunning: this.isRunning,
    };
  }

  // ===========================================================================
  // MAIN JOB EXECUTION
  // ===========================================================================

  /**
   * Run the photo persistence job now
   */
  async runNow(): Promise<void> {
    if (this.isRunning) {
      console.log('[PhotoPersistence] Job already running, skipping');
      return;
    }

    this.isRunning = true;
    this.lastRunAt = new Date();
    this.stats.processed = 0;
    this.stats.failed = 0;

    try {
      // Find properties that need photo persistence
      const propertyIds = await this.findPropertiesNeedingPersistence();
      this.stats.pending = propertyIds.length;

      console.log(`[PhotoPersistence] Found ${propertyIds.length} properties needing photo persistence`);

      if (propertyIds.length === 0) {
        console.log('[PhotoPersistence] No properties to process');
        return;
      }

      // Process in batches
      for (let i = 0; i < propertyIds.length; i += BATCH_SIZE) {
        const batch = propertyIds.slice(i, i + BATCH_SIZE);
        console.log(`[PhotoPersistence] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(propertyIds.length / BATCH_SIZE)}`);

        await this.persistBatchPhotos(batch);
      }

      console.log(`[PhotoPersistence] Job completed - Processed: ${this.stats.processed}, Failed: ${this.stats.failed}`);

    } catch (error) {
      console.error('[PhotoPersistence] Job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // ===========================================================================
  // PROPERTY DETECTION
  // ===========================================================================

  /**
   * Find properties that need photo persistence
   * Criteria:
   * - Has imagesData
   * - Photos are still external URLs (not Supabase)
   * - Lookup is older than 25 days (URLs may expire at 30)
   */
  async findPropertiesNeedingPersistence(): Promise<number[]> {
    try {
      // Find all lookups with images
      const lookups = await PropertyLookup.findAll({
        where: {
          imagesData: { [Op.ne]: null },
        },
        attributes: ['id', 'imagesData'],
      });

      // Filter to those with external URLs (not already persisted)
      // Use dataValues to work around Sequelize public class field shadowing issue
      const needsPersistence = lookups.filter(lookup => {
        const data = lookup.dataValues || lookup;
        const imagesData = data.imagesData as PropertyImages | null;
        if (!imagesData?.photos?.length) return false;

        // Check if already persisted
        if (imagesData.persistedToSupabase) return false;

        // Check if photos contain external URLs (not Supabase)
        const hasExternalUrls = imagesData.photos.some(
          photo => photo.jpegUrl && !SUPABASE_URL_PATTERN.test(photo.jpegUrl)
        );

        return hasExternalUrls;
      });

      return needsPersistence.map(l => (l.dataValues || l).id);

    } catch (error) {
      console.error('[PhotoPersistence] Error finding properties:', error);
      return [];
    }
  }

  // ===========================================================================
  // PHOTO PERSISTENCE
  // ===========================================================================

  /**
   * Persist photos for a batch of properties
   */
  async persistBatchPhotos(propertyLookupIds: number[]): Promise<Map<number, PhotoPersistenceResult>> {
    const results = new Map<number, PhotoPersistenceResult>();

    for (const id of propertyLookupIds) {
      try {
        const result = await this.persistPropertyPhotos(id);
        results.set(id, result);

        if (result.persistedPhotos > 0) {
          this.stats.processed++;
        }
        if (result.failedPhotos > 0) {
          this.stats.failed++;
        }

      } catch (error) {
        console.error(`[PhotoPersistence] Error processing property ${id}:`, error);
        this.stats.failed++;
      }
    }

    return results;
  }

  /**
   * Persist photos for a single property
   */
  async persistPropertyPhotos(propertyLookupId: number): Promise<PhotoPersistenceResult> {
    const result: PhotoPersistenceResult = {
      propertyLookupId,
      zpid: '',
      totalPhotos: 0,
      persistedPhotos: 0,
      failedPhotos: 0,
      permanentUrls: [],
      errors: [],
    };

    try {
      // Get property lookup
      const lookup = await PropertyLookup.findByPk(propertyLookupId);
      if (!lookup) {
        result.errors.push('Property lookup not found');
        return result;
      }

      // Use dataValues to work around Sequelize public class field shadowing issue
      const lookupData = lookup.dataValues || lookup;
      result.zpid = lookupData.zpid;

      const imagesData = lookupData.imagesData as PropertyImages | null;
      if (!imagesData?.photos?.length) {
        return result;
      }

      result.totalPhotos = imagesData.photos.length;

      // Download and upload photos with concurrency limit
      // Create generator functions (not promises) for controlled execution
      const photoGenerators = imagesData.photos.map((photo, index) =>
        () => this.persistSinglePhoto(photo, propertyLookupId, index)
      );

      // Process with limited concurrency
      const persistedPhotos = await this.processWithConcurrency(
        photoGenerators,
        MAX_CONCURRENT_DOWNLOADS
      );

      // Collect results
      for (const persistedPhoto of persistedPhotos) {
        if (persistedPhoto.success && persistedPhoto.url) {
          result.permanentUrls.push(persistedPhoto.url);
          result.persistedPhotos++;
        } else if (persistedPhoto.error) {
          result.errors.push(persistedPhoto.error);
          result.failedPhotos++;
        }
      }

      // Update property lookup with permanent URLs
      if (result.persistedPhotos > 0) {
        await this.updatePropertyPhotos(lookup, result.permanentUrls, imagesData);
      }

      console.log(`[PhotoPersistence] Property ${lookupData.zpid}: ${result.persistedPhotos}/${result.totalPhotos} photos persisted`);

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Persist a single photo
   */
  private async persistSinglePhoto(
    photo: PropertyPhoto,
    propertyLookupId: number,
    index: number
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      // Get the best URL to download
      const sourceUrl = photo.jpegUrl || photo.webpUrl;
      if (!sourceUrl) {
        return { success: false, error: `Photo ${index}: No URL available` };
      }

      // Skip if already a Supabase URL
      if (SUPABASE_URL_PATTERN.test(sourceUrl)) {
        return { success: true, url: sourceUrl };
      }

      // Download image
      const response = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dispotree/1.0)',
        },
      });

      if (!response.ok) {
        return { success: false, error: `Photo ${index}: HTTP ${response.status}` };
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Upload to Supabase
      const uploadResult = await supabaseStorageService.uploadPhoto(
        buffer,
        propertyLookupId,
        index
      );

      if (!uploadResult.success) {
        return { success: false, error: `Photo ${index}: ${uploadResult.error}` };
      }

      return { success: true, url: uploadResult.url };

    } catch (error) {
      return {
        success: false,
        error: `Photo ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Update PropertyLookup with permanent URLs
   */
  private async updatePropertyPhotos(
    lookup: PropertyLookup,
    permanentUrls: string[],
    originalImagesData: PropertyImages
  ): Promise<void> {
    // Update photos with new URLs
    const updatedPhotos = originalImagesData.photos.map((photo, index) => ({
      ...photo,
      // Replace jpegUrl with permanent URL if available
      jpegUrl: permanentUrls[index] || photo.jpegUrl,
    }));

    // Update imagesData
    const updatedImagesData: PropertyImages = {
      ...originalImagesData,
      photos: updatedPhotos,
      primaryImage: permanentUrls[0] || originalImagesData.primaryImage,
      persistedToSupabase: true,
      supabaseUrls: permanentUrls,
      lastUpdated: new Date(),
    };

    await lookup.update({
      imagesData: updatedImagesData as unknown as object,
    });
  }

  /**
   * Process promises with limited concurrency
   */
  private async processWithConcurrency<T>(
    generators: (() => Promise<T>)[],
    concurrency: number
  ): Promise<T[]> {
    const results: T[] = new Array(generators.length);
    let currentIndex = 0;

    async function worker(): Promise<void> {
      while (currentIndex < generators.length) {
        const index = currentIndex++;
        try {
          results[index] = await generators[index]();
        } catch (error) {
          // Store error result - will be handled by caller
          results[index] = { success: false, error: String(error) } as T;
        }
      }
    }

    // Start workers
    const workers = Array(Math.min(concurrency, generators.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);
    return results;
  }

  // ===========================================================================
  // MANUAL OPERATIONS
  // ===========================================================================

  /**
   * Manually persist photos for a specific property by ZPID
   */
  async persistByZpid(zpid: string): Promise<PhotoPersistenceResult | null> {
    const lookup = await PropertyLookup.findOne({ where: { zpid } });
    if (!lookup) {
      return null;
    }
    return this.persistPropertyPhotos(lookup.id);
  }

  /**
   * Check if a property has persisted photos
   */
  async hasPersisted(zpid: string): Promise<boolean> {
    const lookup = await PropertyLookup.findOne({ where: { zpid } });
    if (!lookup) return false;

    const imagesData = lookup.imagesData as PropertyImages | null;
    return imagesData?.persistedToSupabase === true;
  }
}

// Export singleton instance
export const photoPersistenceService = new PhotoPersistenceService();
export default photoPersistenceService;
