/**
 * Supabase Storage Service
 *
 * Handles file storage operations using Supabase Storage.
 *
 * Bucket Structure:
 * - storage/documents/{propertyId}/ - Private documents (signed URLs)
 * - storage/photos/{propertyId}/    - Public photos (direct URLs)
 */

import { supabaseAdmin } from '../config/supabase';
import crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export interface SupabaseUploadResult {
  success: boolean;
  path: string;
  url: string;
  error?: string;
}

export interface SignedUrlResult {
  success: boolean;
  signedUrl: string;
  expiresAt: Date;
  error?: string;
}

export interface DownloadResult {
  data: Buffer | null;
  error?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const BUCKET_NAME = 'photos';
const DOCUMENTS_FOLDER = 'documents';
const PHOTOS_FOLDER = '';

// Signed URL expiry time in seconds (1 hour default)
const DEFAULT_SIGNED_URL_EXPIRY = 3600;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Sanitize filename to remove dangerous characters
 */
function sanitizeFilename(filename: string): string {
  // Remove path separators and null bytes
  let safe = filename.replace(/[/\\:\x00]/g, '_');
  // Remove leading dots (hidden files, parent traversal)
  safe = safe.replace(/^\.+/, '');
  // Only allow alphanumeric, dots, dashes, underscores
  safe = safe.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Limit length
  return safe.substring(0, 100);
}

/**
 * Generate a unique filename with timestamp
 */
function generateUniqueFilename(originalName: string): string {
  const timestamp = Date.now();
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  const sanitized = sanitizeFilename(baseName).substring(0, 50);
  return `${timestamp}-${sanitized}${ext}`;
}

/**
 * Generate a hash from buffer for photo filenames
 */
function generateFileHash(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
}

// =============================================================================
// SUPABASE STORAGE SERVICE
// =============================================================================

class SupabaseStorageService {
  private bucket: string;
  private documentsFolder: string;
  private photosFolder: string;

  constructor() {
    this.bucket = BUCKET_NAME;
    this.documentsFolder = DOCUMENTS_FOLDER;
    this.photosFolder = PHOTOS_FOLDER;
  }

  // ===========================================================================
  // DOCUMENT OPERATIONS (Private - Signed URLs)
  // ===========================================================================

  /**
   * Upload a document to Supabase Storage
   */
  async uploadDocument(
    buffer: Buffer,
    propertyId: number,
    originalName: string,
    mimeType: string
  ): Promise<SupabaseUploadResult> {
    try {
      const fileName = generateUniqueFilename(originalName);
      const path = `${this.documentsFolder}/${propertyId}/${fileName}`;

      const { data, error } = await supabaseAdmin.storage
        .from(this.bucket)
        .upload(path, buffer, {
          contentType: mimeType,
          cacheControl: 'no-cache', // Documents shouldn't be cached
          upsert: false,
        });

      if (error) {
        console.error('[SupabaseStorage] Upload error:', error.message);
        return {
          success: false,
          path: '',
          url: '',
          error: error.message,
        };
      }

      return {
        success: true,
        path: data.path,
        url: '', // Use getSignedUrl for documents
      };
    } catch (error) {
      console.error('[SupabaseStorage] Upload exception:', error);
      return {
        success: false,
        path: '',
        url: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Download a document from Supabase Storage
   */
  async downloadDocument(storagePath: string): Promise<DownloadResult> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(this.bucket)
        .download(storagePath);

      if (error) {
        console.error('[SupabaseStorage] Download error:', error.message);
        return { data: null, error: error.message };
      }

      // Convert Blob to Buffer
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return { data: buffer };
    } catch (error) {
      console.error('[SupabaseStorage] Download exception:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete a document from Supabase Storage
   */
  async deleteDocument(storagePath: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin.storage
        .from(this.bucket)
        .remove([storagePath]);

      if (error) {
        console.error('[SupabaseStorage] Delete error:', error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[SupabaseStorage] Delete exception:', error);
      return false;
    }
  }

  /**
   * Get a signed URL for secure document access
   */
  async getSignedUrl(
    storagePath: string,
    expiresIn: number = DEFAULT_SIGNED_URL_EXPIRY
  ): Promise<SignedUrlResult> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(this.bucket)
        .createSignedUrl(storagePath, expiresIn);

      if (error) {
        console.error('[SupabaseStorage] Signed URL error:', error.message);
        return {
          success: false,
          signedUrl: '',
          expiresAt: new Date(),
          error: error.message,
        };
      }

      return {
        success: true,
        signedUrl: data.signedUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    } catch (error) {
      console.error('[SupabaseStorage] Signed URL exception:', error);
      return {
        success: false,
        signedUrl: '',
        expiresAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // PHOTO OPERATIONS (Public - Direct URLs)
  // ===========================================================================

  /**
   * Upload a photo to Supabase Storage (public access)
   */
  async uploadPhoto(
    buffer: Buffer,
    propertyId: number,
    index: number
  ): Promise<SupabaseUploadResult> {
    try {
      const hash = generateFileHash(buffer);
      const timestamp = Date.now();
      const fileName = `${timestamp}-${index}-${hash}.jpg`;
      const path = this.photosFolder ? `${this.photosFolder}/${propertyId}/${fileName}` : `${propertyId}/${fileName}`;

      const { data, error } = await supabaseAdmin.storage
        .from(this.bucket)
        .upload(path, buffer, {
          contentType: 'image/jpeg',
          cacheControl: '31536000', // 1 year cache for photos
          upsert: true, // Allow overwriting photos
        });

      if (error) {
        console.error('[SupabaseStorage] Photo upload error:', error.message);
        return {
          success: false,
          path: '',
          url: '',
          error: error.message,
        };
      }

      // Get public URL for photos
      const publicUrl = this.getPhotoPublicUrl(data.path);

      return {
        success: true,
        path: data.path,
        url: publicUrl,
      };
    } catch (error) {
      console.error('[SupabaseStorage] Photo upload exception:', error);
      return {
        success: false,
        path: '',
        url: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Upload a file to a custom path in Supabase Storage (public access)
   */
  async uploadToPath(
    buffer: Buffer,
    path: string,
    contentType: string
  ): Promise<SupabaseUploadResult> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(this.bucket)
        .upload(path, buffer, {
          contentType,
          cacheControl: '31536000', // 1 year cache
          upsert: true,
        });

      if (error) {
        console.error('[SupabaseStorage] Custom path upload error:', error.message);
        return {
          success: false,
          path: '',
          url: '',
          error: error.message,
        };
      }

      // Get public URL
      const publicUrl = this.getPhotoPublicUrl(data.path);

      return {
        success: true,
        path: data.path,
        url: publicUrl,
      };
    } catch (error) {
      console.error('[SupabaseStorage] Custom path upload exception:', error);
      return {
        success: false,
        path: '',
        url: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete a photo from Supabase Storage
   */
  async deletePhoto(storagePath: string): Promise<boolean> {
    return this.deleteDocument(storagePath); // Same operation
  }

  /**
   * Get public URL for a photo
   */
  getPhotoPublicUrl(storagePath: string): string {
    const { data } = supabaseAdmin.storage
      .from(this.bucket)
      .getPublicUrl(storagePath);

    return data.publicUrl;
  }

  // ===========================================================================
  // UTILITY OPERATIONS
  // ===========================================================================

  /**
   * Check if a file exists in storage
   */
  async exists(storagePath: string): Promise<boolean> {
    try {
      // List files in the directory to check existence
      const pathParts = storagePath.split('/');
      const fileName = pathParts.pop();
      const folder = pathParts.join('/');

      const { data, error } = await supabaseAdmin.storage
        .from(this.bucket)
        .list(folder, {
          search: fileName,
        });

      if (error) {
        return false;
      }

      return data.some(file => file.name === fileName);
    } catch {
      return false;
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(folder: string): Promise<string[]> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(this.bucket)
        .list(folder);

      if (error) {
        console.error('[SupabaseStorage] List files error:', error.message);
        return [];
      }

      return data.map(file => `${folder}/${file.name}`);
    } catch (error) {
      console.error('[SupabaseStorage] List files exception:', error);
      return [];
    }
  }

  /**
   * List all property folders in documents directory
   */
  async listPropertyFolders(): Promise<string[]> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(this.bucket)
        .list(this.documentsFolder);

      if (error) {
        console.error('[SupabaseStorage] List folders error:', error.message);
        return [];
      }

      // Filter to only folders (they have null metadata)
      return data
        .filter(item => item.id === null)
        .map(folder => folder.name);
    } catch (error) {
      console.error('[SupabaseStorage] List folders exception:', error);
      return [];
    }
  }

  /**
   * Get bucket name (for external reference)
   */
  getBucketName(): string {
    return this.bucket;
  }

  /**
   * Build document path from components
   */
  buildDocumentPath(propertyId: number, fileName: string): string {
    return `${this.documentsFolder}/${propertyId}/${fileName}`;
  }

  /**
   * Build photo path from components
   */
  buildPhotoPath(propertyId: number, fileName: string): string {
    return this.photosFolder ? `${this.photosFolder}/${propertyId}/${fileName}` : `${propertyId}/${fileName}`;
  }
}

// Export singleton instance
export const supabaseStorageService = new SupabaseStorageService();
export default supabaseStorageService;
