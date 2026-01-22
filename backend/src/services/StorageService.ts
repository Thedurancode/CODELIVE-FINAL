/**
 * Storage Service
 *
 * Handles file storage operations using Supabase Storage.
 * This is an adapter that maintains backwards compatibility while
 * delegating to SupabaseStorageService.
 *
 * MIGRATION: Previously used local filesystem, now uses Supabase Storage.
 */

import * as fs from 'fs';
import { promisify } from 'util';
import { supabaseStorageService } from './SupabaseStorageService';

const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

// =============================================================================
// TYPES (Maintained for backwards compatibility)
// =============================================================================

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
}

export interface StorageResult {
  success: boolean;
  storageKey: string;
  fileName: string;
  url: string;
  error?: string;
}

// =============================================================================
// STORAGE SERVICE
// =============================================================================

class StorageService {
  /**
   * Upload a file to Supabase Storage
   */
  async upload(file: UploadedFile, propertyId: number): Promise<StorageResult> {
    try {
      // Read file from temp location
      const buffer = await readFile(file.path);

      // Upload to Supabase
      const result = await supabaseStorageService.uploadDocument(
        buffer,
        propertyId,
        file.originalname,
        file.mimetype
      );

      // Clean up temp file
      try {
        await unlink(file.path);
      } catch {
        // Ignore cleanup errors
      }

      if (!result.success) {
        return {
          success: false,
          storageKey: '',
          fileName: '',
          url: '',
          error: result.error,
        };
      }

      // Extract filename from path
      const pathParts = result.path.split('/');
      const fileName = pathParts[pathParts.length - 1];

      return {
        success: true,
        storageKey: result.path, // Full Supabase path
        fileName,
        url: '', // Use getSignedUrl for actual URL
      };
    } catch (error) {
      return {
        success: false,
        storageKey: '',
        fileName: '',
        url: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Upload a file to a custom path in Supabase Storage
   * Returns the public URL
   */
  async uploadFile(filePath: string, storagePath: string, originalName: string): Promise<string> {
    try {
      // Read file from temp location
      const buffer = await readFile(filePath);

      // Generate unique filename
      const timestamp = Date.now();
      const ext = originalName.includes('.') ? '.' + originalName.split('.').pop()?.toLowerCase() : '';
      const sanitizedName = originalName
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .substring(0, 50);
      const fileName = `${timestamp}-${sanitizedName}${ext ? '.' + ext : ''}`;

      // Determine content type
      const contentTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
      };
      const contentType = contentTypes[ext || ''] || 'application/octet-stream';

      // Upload to Supabase
      const fullPath = `${storagePath}/${fileName}`;
      const result = await supabaseStorageService.uploadToPath(buffer, fullPath, contentType);

      // Clean up temp file
      try {
        await unlink(filePath);
      } catch {
        // Ignore cleanup errors
      }

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      return result.url;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Download/read a file from Supabase Storage
   */
  async download(storageKey: string): Promise<{ data: Buffer; exists: boolean; error?: string }> {
    const result = await supabaseStorageService.downloadDocument(storageKey);

    if (result.data === null) {
      return {
        data: Buffer.from(''),
        exists: false,
        error: result.error,
      };
    }

    return {
      data: result.data,
      exists: true,
    };
  }

  /**
   * Delete a file from Supabase Storage
   */
  async delete(storageKey: string): Promise<boolean> {
    return supabaseStorageService.deleteDocument(storageKey);
  }

  /**
   * Check if a file exists in Supabase Storage
   */
  async exists(storageKey: string): Promise<boolean> {
    return supabaseStorageService.exists(storageKey);
  }

  /**
   * Get a signed URL for secure file access
   * @param storageKey - The storage path
   * @param expiresIn - Expiry time in seconds (default: 1 hour)
   */
  async getSignedUrl(storageKey: string, expiresIn?: number): Promise<string | null> {
    const result = await supabaseStorageService.getSignedUrl(storageKey, expiresIn);
    return result.success ? result.signedUrl : null;
  }

  /**
   * Get the storage path (same as storageKey for Supabase)
   * @deprecated - Files are now in Supabase Storage, not local filesystem
   */
  getFilePath(storageKey: string): string {
    console.warn('[StorageService] getFilePath() is deprecated - files are now in Supabase Storage');
    return storageKey;
  }

  /**
   * Get the public URL placeholder (use getSignedUrl for actual access)
   * Returns API endpoint for backwards compatibility
   */
  getUrl(storageKey: string): string {
    // Return API endpoint - actual signed URL generated on access
    return `/api/documents/download/${encodeURIComponent(storageKey)}`;
  }

  /**
   * Get file stats - not available in Supabase, returns null
   * @deprecated - Not supported with Supabase Storage
   */
  async getStats(storageKey: string): Promise<null> {
    console.warn('[StorageService] getStats() is deprecated - not supported with Supabase Storage');
    return null;
  }
}

export const storageService = new StorageService();
export default storageService;
