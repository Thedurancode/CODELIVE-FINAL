/**
 * Email Password Encryption Utility
 *
 * Provides AES-256-GCM encryption/decryption for email account passwords.
 * Uses a dedicated encryption key separate from other credentials.
 */

import * as crypto from 'crypto';

export interface EncryptedPassword {
  encryptedPassword: string;
  passwordIv: string;
  passwordAuthTag: string;
}

class EmailPasswordEncryption {
  private encryptionKey: Buffer | null = null;
  private initialized = false;

  /**
   * Initialize the encryption utility
   * Call this at application startup
   */
  initialize(): void {
    if (this.initialized) return;

    const key = process.env.EMAIL_ENCRYPTION_KEY;

    if (!key) {
      console.warn('[EmailPasswordEncryption] EMAIL_ENCRYPTION_KEY not set - email password encryption disabled');
      return;
    }

    if (key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
      throw new Error('EMAIL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }

    this.encryptionKey = Buffer.from(key, 'hex');
    this.initialized = true;
    console.log('[EmailPasswordEncryption] Initialized');
  }

  /**
   * Check if encryption is available
   */
  isAvailable(): boolean {
    return this.initialized && this.encryptionKey !== null;
  }

  /**
   * Encrypt a password
   */
  encrypt(password: string): EncryptedPassword {
    if (!this.encryptionKey) {
      throw new Error('Email password encryption not initialized. Set EMAIL_ENCRYPTION_KEY environment variable.');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(password, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      encryptedPassword: encrypted.toString('base64'),
      passwordIv: iv.toString('base64'),
      passwordAuthTag: authTag.toString('base64'),
    };
  }

  /**
   * Decrypt a password
   */
  decrypt(encryptedPassword: string, passwordIv: string, passwordAuthTag: string): string {
    if (!this.encryptionKey) {
      throw new Error('Email password encryption not initialized. Set EMAIL_ENCRYPTION_KEY environment variable.');
    }

    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(passwordIv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(passwordAuthTag, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedPassword, 'base64')),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error('Failed to decrypt email password: invalid or corrupted data');
    }
  }

  /**
   * Generate a new encryption key (for setup)
   * Returns a 64-character hex string
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Export singleton instance
export const emailPasswordEncryption = new EmailPasswordEncryption();

// Also export class for testing
export { EmailPasswordEncryption };
