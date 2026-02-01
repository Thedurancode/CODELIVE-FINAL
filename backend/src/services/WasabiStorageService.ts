/**
 * Wasabi Storage Service
 *
 * S3-compatible cloud storage for large files.
 * Used for note attachments that exceed GitHub's size limits.
 *
 * Wasabi is significantly cheaper than S3:
 * - $6.99/TB/month storage
 * - No egress fees
 * - S3-compatible API
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';

// =============================================================================
// TYPES
// =============================================================================

interface UploadResult {
  success: boolean;
  key: string;
  url: string;
  size: number;
  contentType: string;
  etag?: string;
  error?: string;
}

interface StorageInfo {
  key: string;
  size: number;
  lastModified?: Date;
  contentType?: string;
  etag?: string;
}

interface WasabiConfig {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Wasabi region endpoints
const WASABI_ENDPOINTS: Record<string, string> = {
  'us-east-1': 'https://s3.wasabisys.com',
  'us-east-2': 'https://s3.us-east-2.wasabisys.com',
  'us-central-1': 'https://s3.us-central-1.wasabisys.com',
  'us-west-1': 'https://s3.us-west-1.wasabisys.com',
  'eu-central-1': 'https://s3.eu-central-1.wasabisys.com',
  'eu-central-2': 'https://s3.eu-central-2.wasabisys.com',
  'eu-west-1': 'https://s3.eu-west-1.wasabisys.com',
  'eu-west-2': 'https://s3.eu-west-2.wasabisys.com',
  'ap-northeast-1': 'https://s3.ap-northeast-1.wasabisys.com',
  'ap-northeast-2': 'https://s3.ap-northeast-2.wasabisys.com',
  'ap-southeast-1': 'https://s3.ap-southeast-1.wasabisys.com',
  'ap-southeast-2': 'https://s3.ap-southeast-2.wasabisys.com',
};

// File size threshold for using Wasabi (100MB - same as GitHub limit)
const WASABI_THRESHOLD = 100 * 1024 * 1024;

// =============================================================================
// SERVICE
// =============================================================================

class WasabiStorageService {
  private client: S3Client | null = null;
  private bucket: string = '';
  private region: string = '';
  private endpoint: string = '';
  private initialized = false;

  /**
   * Initialize the Wasabi storage service
   */
  async initialize(): Promise<void> {
    const accessKeyId = process.env.WASABI_ACCESS_KEY_ID;
    const secretAccessKey = process.env.WASABI_SECRET_ACCESS_KEY;
    const bucket = process.env.WASABI_BUCKET;
    const region = process.env.WASABI_REGION || 'us-east-1';

    if (!accessKeyId || !secretAccessKey || !bucket) {
      console.log('[WasabiStorageService] Not configured - WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, or WASABI_BUCKET missing');
      this.initialized = true; // Mark as initialized but not ready
      return;
    }

    this.bucket = bucket;
    this.region = region;
    this.endpoint = WASABI_ENDPOINTS[region] || WASABI_ENDPOINTS['us-east-1'];

    this.client = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Required for Wasabi
    });

    this.initialized = true;
    console.log(`[WasabiStorageService] Initialized (bucket: ${this.bucket}, region: ${this.region})`);
  }

  /**
   * Check if the service is ready to use
   */
  isReady(): boolean {
    return this.initialized && this.client !== null;
  }

  /**
   * Check if Wasabi is configured
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Determine if a file should use Wasabi storage (>100MB)
   */
  shouldUseWasabi(size: number): boolean {
    return size > WASABI_THRESHOLD;
  }

  /**
   * Generate a unique storage key for a file
   */
  generateKey(projectId: string, noteId: number, originalFilename: string): string {
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalFilename);
    const safeName = path.basename(originalFilename, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .substring(0, 50);

    return `notes/${projectId}/${noteId}/${hash}-${safeName}${ext}`;
  }

  /**
   * Upload a file to Wasabi storage
   */
  async upload(
    key: string,
    content: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    if (!this.client) {
      return {
        success: false,
        key,
        url: '',
        size: content.length,
        contentType,
        error: 'Wasabi storage not configured',
      };
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
        ContentLength: content.length,
        Metadata: metadata,
      });

      const result = await this.client.send(command);

      // Construct the public URL
      const url = this.getPublicUrl(key);

      console.log(`[WasabiStorageService] Uploaded ${key} (${(content.length / 1024 / 1024).toFixed(2)}MB)`);

      return {
        success: true,
        key,
        url,
        size: content.length,
        contentType,
        etag: result.ETag?.replace(/"/g, ''),
      };
    } catch (error) {
      console.error('[WasabiStorageService] Upload failed:', error);
      return {
        success: false,
        key,
        url: '',
        size: content.length,
        contentType,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get a pre-signed URL for temporary access to a file
   * Useful for private buckets
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      return url;
    } catch (error) {
      console.error('[WasabiStorageService] Failed to generate signed URL:', error);
      return null;
    }
  }

  /**
   * Get the public URL for a file
   * Note: Bucket must have public read access for this to work
   */
  getPublicUrl(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  /**
   * Delete a file from Wasabi storage
   */
  async delete(key: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      console.log(`[WasabiStorageService] Deleted ${key}`);
      return true;
    } catch (error) {
      console.error('[WasabiStorageService] Delete failed:', error);
      return false;
    }
  }

  /**
   * Check if a file exists in Wasabi storage
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file info from Wasabi storage
   */
  async getInfo(key: string): Promise<StorageInfo | null> {
    if (!this.client) {
      return null;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const result = await this.client.send(command);
      return {
        key,
        size: result.ContentLength || 0,
        lastModified: result.LastModified,
        contentType: result.ContentType,
        etag: result.ETag?.replace(/"/g, ''),
      };
    } catch {
      return null;
    }
  }

  /**
   * List files in a directory (prefix)
   */
  async listFiles(prefix: string, maxKeys: number = 100): Promise<StorageInfo[]> {
    if (!this.client) {
      return [];
    }

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const result = await this.client.send(command);

      return (result.Contents || []).map((item) => ({
        key: item.Key || '',
        size: item.Size || 0,
        lastModified: item.LastModified,
        etag: item.ETag?.replace(/"/g, ''),
      }));
    } catch (error) {
      console.error('[WasabiStorageService] List failed:', error);
      return [];
    }
  }

  /**
   * Get storage stats for a project
   */
  async getProjectStats(projectId: string): Promise<{ fileCount: number; totalSize: number }> {
    const files = await this.listFiles(`notes/${projectId}/`, 1000);

    return {
      fileCount: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
    };
  }

  /**
   * Get the bucket name
   */
  getBucket(): string {
    return this.bucket;
  }

  /**
   * Get the region
   */
  getRegion(): string {
    return this.region;
  }
}

export const wasabiStorageService = new WasabiStorageService();
export { UploadResult, StorageInfo, WasabiConfig, WASABI_THRESHOLD };
