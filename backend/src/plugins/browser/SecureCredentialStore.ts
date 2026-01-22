/**
 * Secure Credential Store
 *
 * Encrypted storage for sensitive credentials:
 * - AES-256-GCM encryption
 * - Automatic key derivation from master password
 * - File-based persistence with encryption
 * - In-memory caching with TTL
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

export interface Credential {
  id: string;
  siteId: string;
  username: string;
  password: string;
  metadata?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncryptedCredential {
  id: string;
  siteId: string;
  encryptedData: string;
  iv: string;
  authTag: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecureStoreConfig {
  storagePath: string;
  masterKey?: string; // 32-byte hex string or will be derived from CREDENTIAL_MASTER_KEY env
  cacheTTL: number; // ms to keep decrypted credentials in memory
  keyDerivationIterations: number;
}

const DEFAULT_CONFIG: Partial<SecureStoreConfig> = {
  storagePath: './data/credentials',
  cacheTTL: 300000, // 5 minutes
  keyDerivationIterations: 100000,
};

export class SecureCredentialStore {
  private config: SecureStoreConfig;
  private encryptionKey: Buffer | null = null;
  private cache: Map<string, { credential: Credential; expiresAt: number }> = new Map();
  private initialized = false;

  constructor(config: Partial<SecureStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as SecureStoreConfig;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the credential store
   */
  async initialize(masterKeyOrPassword?: string): Promise<void> {
    if (this.initialized) return;

    // Ensure storage directory exists (async)
    try {
      await fsPromises.access(this.config.storagePath);
    } catch {
      await fsPromises.mkdir(this.config.storagePath, { recursive: true });
    }

    // Get or derive encryption key
    const keySource = masterKeyOrPassword || this.config.masterKey || process.env.CREDENTIAL_MASTER_KEY;

    if (!keySource) {
      throw new Error(
        'No master key provided. Set CREDENTIAL_MASTER_KEY environment variable or pass key to initialize()'
      );
    }

    if (keySource.length === 64 && /^[0-9a-fA-F]+$/.test(keySource)) {
      // Direct hex key
      this.encryptionKey = Buffer.from(keySource, 'hex');
    } else {
      // Derive key from password
      this.encryptionKey = await this.deriveKey(keySource);
    }

    this.initialized = true;
    console.log('🔐 Secure credential store initialized');
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private async deriveKey(password: string): Promise<Buffer> {
    const salt = await this.getOrCreateSalt();

    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        this.config.keyDerivationIterations,
        32, // 256 bits
        'sha512',
        (err, key) => {
          if (err) reject(err);
          else resolve(key);
        }
      );
    });
  }

  /**
   * Get or create salt for key derivation (async to avoid blocking I/O)
   */
  private async getOrCreateSalt(): Promise<Buffer> {
    const saltPath = path.join(this.config.storagePath, '.salt');

    try {
      // Try to read existing salt
      return await fsPromises.readFile(saltPath);
    } catch {
      // Create new salt if doesn't exist
      const salt = crypto.randomBytes(32);
      await fsPromises.writeFile(saltPath, salt);
      return salt;
    }
  }

  // ============================================================================
  // ENCRYPTION/DECRYPTION
  // ============================================================================

  /**
   * Encrypt credential data
   */
  private encrypt(data: { username: string; password: string; metadata?: Record<string, string> }): {
    encryptedData: string;
    iv: string;
    authTag: string;
  } {
    if (!this.encryptionKey) {
      throw new Error('Store not initialized');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const plaintext = JSON.stringify(data);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      encryptedData: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /**
   * Decrypt credential data
   */
  private decrypt(encryptedData: string, iv: string, authTag: string): {
    username: string;
    password: string;
    metadata?: Record<string, string>;
  } {
    if (!this.encryptionKey) {
      throw new Error('Store not initialized');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData, 'base64')),
      decipher.final(),
    ]);

    try {
      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      throw new Error('Failed to parse decrypted credential data: corrupted or invalid format');
    }
  }

  // ============================================================================
  // CREDENTIAL MANAGEMENT
  // ============================================================================

  /**
   * Store a credential
   */
  async setCredential(
    siteId: string,
    username: string,
    password: string,
    metadata?: Record<string, string>
  ): Promise<Credential> {
    if (!this.initialized) {
      await this.initialize();
    }

    const id = this.generateCredentialId(siteId);
    const now = new Date();

    // Encrypt the sensitive data
    const encrypted = this.encrypt({ username, password, metadata });

    const encryptedCredential: EncryptedCredential = {
      id,
      siteId,
      ...encrypted,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // Save to file
    const filePath = this.getCredentialPath(id);
    fs.writeFileSync(filePath, JSON.stringify(encryptedCredential, null, 2));

    // Update cache
    const credential: Credential = {
      id,
      siteId,
      username,
      password,
      metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.cacheCredential(id, credential);

    console.log(`🔐 Credential stored for: ${siteId}`);
    return credential;
  }

  /**
   * Get a credential by site ID
   */
  async getCredential(siteId: string): Promise<Credential | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    const id = this.generateCredentialId(siteId);

    // Check cache first
    const cached = this.getCachedCredential(id);
    if (cached) {
      return cached;
    }

    // Load from file
    const filePath = this.getCredentialPath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as EncryptedCredential;
      const decrypted = this.decrypt(data.encryptedData, data.iv, data.authTag);

      const credential: Credential = {
        id: data.id,
        siteId: data.siteId,
        username: decrypted.username,
        password: decrypted.password,
        metadata: decrypted.metadata,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
      };

      this.cacheCredential(id, credential);
      return credential;
    } catch (error) {
      console.error(`Failed to decrypt credential for ${siteId}:`, error);
      return null;
    }
  }

  /**
   * Update a credential
   */
  async updateCredential(
    siteId: string,
    updates: { username?: string; password?: string; metadata?: Record<string, string> }
  ): Promise<Credential | null> {
    const existing = await this.getCredential(siteId);
    if (!existing) {
      return null;
    }

    return this.setCredential(
      siteId,
      updates.username || existing.username,
      updates.password || existing.password,
      updates.metadata || existing.metadata
    );
  }

  /**
   * Delete a credential
   */
  async deleteCredential(siteId: string): Promise<boolean> {
    const id = this.generateCredentialId(siteId);
    const filePath = this.getCredentialPath(id);

    // Remove from cache
    this.cache.delete(id);

    // Remove file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Credential deleted for: ${siteId}`);
      return true;
    }

    return false;
  }

  /**
   * Check if credential exists
   */
  async hasCredential(siteId: string): Promise<boolean> {
    const id = this.generateCredentialId(siteId);
    const filePath = this.getCredentialPath(id);
    return fs.existsSync(filePath);
  }

  /**
   * List all stored site IDs
   */
  async listSiteIds(): Promise<string[]> {
    if (!fs.existsSync(this.config.storagePath)) {
      return [];
    }

    const files = fs.readdirSync(this.config.storagePath);
    const siteIds: string[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = JSON.parse(
            fs.readFileSync(path.join(this.config.storagePath, file), 'utf8')
          );
          if (data.siteId) {
            siteIds.push(data.siteId);
          }
        } catch {
          // Skip invalid files
        }
      }
    }

    return siteIds;
  }

  // ============================================================================
  // CACHING
  // ============================================================================

  private cacheCredential(id: string, credential: Credential): void {
    this.cache.set(id, {
      credential,
      expiresAt: Date.now() + this.config.cacheTTL,
    });
  }

  private getCachedCredential(id: string): Credential | null {
    const cached = this.cache.get(id);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(id);
      return null;
    }

    return cached.credential;
  }

  /**
   * Clear the credential cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear expired cache entries
   */
  pruneCache(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [id, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(id);
        pruned++;
      }
    }

    return pruned;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private generateCredentialId(siteId: string): string {
    return crypto.createHash('sha256').update(siteId).digest('hex').substring(0, 16);
  }

  private getCredentialPath(id: string): string {
    return path.join(this.config.storagePath, `${id}.json`);
  }

  /**
   * Rotate encryption key
   * Re-encrypts all credentials with new key
   */
  async rotateKey(newMasterKeyOrPassword: string): Promise<void> {
    // Load all credentials with current key
    const siteIds = await this.listSiteIds();
    const credentials: Credential[] = [];

    for (const siteId of siteIds) {
      const cred = await this.getCredential(siteId);
      if (cred) {
        credentials.push(cred);
      }
    }

    // Re-initialize with new key
    this.encryptionKey = null;
    this.initialized = false;

    // Delete old salt to generate new one
    const saltPath = path.join(this.config.storagePath, '.salt');
    if (fs.existsSync(saltPath)) {
      fs.unlinkSync(saltPath);
    }

    await this.initialize(newMasterKeyOrPassword);

    // Re-encrypt all credentials
    for (const cred of credentials) {
      await this.setCredential(cred.siteId, cred.username, cred.password, cred.metadata);
    }

    console.log(`🔄 Rotated encryption key for ${credentials.length} credentials`);
  }

  /**
   * Export credentials (for backup)
   * Returns encrypted data that can only be decrypted with the same key
   */
  async exportEncrypted(): Promise<string> {
    const siteIds = await this.listSiteIds();
    const credentials: Credential[] = [];

    for (const siteId of siteIds) {
      const cred = await this.getCredential(siteId);
      if (cred) {
        credentials.push(cred);
      }
    }

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      credentials: credentials.map((c) => ({
        siteId: c.siteId,
        username: c.username,
        password: c.password,
        metadata: c.metadata,
      })),
    };

    const encrypted = this.encrypt({
      username: '',
      password: JSON.stringify(exportData)
    });

    return JSON.stringify({
      ...encrypted,
      exportedAt: new Date().toISOString(),
    });
  }

  /**
   * Import credentials from encrypted backup
   */
  async importEncrypted(encryptedBackup: string): Promise<number> {
    const backup = JSON.parse(encryptedBackup);
    const decrypted = this.decrypt(backup.encryptedData, backup.iv, backup.authTag);
    const exportData = JSON.parse(decrypted.password);

    let imported = 0;
    for (const cred of exportData.credentials) {
      await this.setCredential(cred.siteId, cred.username, cred.password, cred.metadata);
      imported++;
    }

    console.log(`📥 Imported ${imported} credentials`);
    return imported;
  }

  /**
   * Verify that stored credentials can be decrypted
   */
  async verifyIntegrity(): Promise<{ valid: number; invalid: number; errors: string[] }> {
    const siteIds = await this.listSiteIds();
    let valid = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const siteId of siteIds) {
      try {
        const cred = await this.getCredential(siteId);
        if (cred) {
          valid++;
        } else {
          invalid++;
          errors.push(`Failed to load: ${siteId}`);
        }
      } catch (error) {
        invalid++;
        errors.push(`Decryption error for ${siteId}: ${error}`);
      }
    }

    return { valid, invalid, errors };
  }
}

// Export singleton factory
let defaultStore: SecureCredentialStore | null = null;

export function getCredentialStore(): SecureCredentialStore {
  if (!defaultStore) {
    defaultStore = new SecureCredentialStore();
  }
  return defaultStore;
}

export default SecureCredentialStore;
