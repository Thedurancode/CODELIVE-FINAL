/**
 * Project Environment Variable Service
 *
 * Business logic for managing encrypted environment variables for projects:
 * - Secure storage with AES-256-GCM encryption
 * - CRUD operations with author-only edit/delete
 * - Values never exposed in logs
 */

import ProjectEnvVariable from '../models/ProjectEnvVariable';
import MarketplaceUser from '../models/MarketplaceUser';
import Project from '../models/Project';
import { vercelService } from './VercelService';

// =============================================================================
// TYPES
// =============================================================================

interface CreateEnvVariableInput {
  projectId: string;
  userId: string;
  organizationId: string;
  name: string;
  value: string;
  description?: string;
  syncToVercel?: boolean;
  vercelTarget?: string[];
}

interface UpdateEnvVariableInput {
  name?: string;
  value?: string;
  description?: string;
  syncToVercel?: boolean;
  vercelTarget?: string[];
}

interface EnvVariableResponse {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  name: string;
  description: string | null;
  syncToVercel: boolean;
  vercelTarget: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  author?: {
    id: string;
    name?: string;
    email?: string;
  };
  // Note: value is NOT included by default for security
}

interface EnvVariableWithValue extends EnvVariableResponse {
  value: string;
}

// =============================================================================
// SERVICE
// =============================================================================

class ProjectEnvVariableService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('ProjectEnvVariableService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  // ===========================================================================
  // CREATE
  // ===========================================================================

  /**
   * Create a new environment variable
   */
  async createEnvVariable(input: CreateEnvVariableInput): Promise<EnvVariableResponse> {
    const { projectId, userId, organizationId, name, value, description, syncToVercel, vercelTarget } = input;

    // Check for duplicate name
    const existing = await ProjectEnvVariable.findOne({
      where: { projectId, name },
    });

    if (existing) {
      throw new Error(`Environment variable '${name}' already exists for this project`);
    }

    // Encrypt the value
    const encrypted = ProjectEnvVariable.encrypt(value);

    const envVar = await ProjectEnvVariable.create({
      projectId,
      userId,
      organizationId,
      name: name.toUpperCase(), // Convention: env vars are uppercase
      encryptedValue: encrypted.encryptedValue,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      description: description || null,
      syncToVercel: syncToVercel || false,
      vercelTarget: syncToVercel ? (vercelTarget || ['production', 'preview', 'development']) : null,
    });

    // Sync to Vercel if enabled (fire-and-forget)
    if (envVar.syncToVercel) {
      this.syncToVercelProject(envVar, value).catch(() => {});
    }

    // Return without value
    return this.formatEnvVariable(envVar);
  }

  // ===========================================================================
  // READ
  // ===========================================================================

  /**
   * Get all environment variables for a project (without values)
   */
  async getEnvVariablesForProject(
    projectId: string,
    organizationId: string
  ): Promise<EnvVariableResponse[]> {
    const envVars = await ProjectEnvVariable.findAll({
      where: { projectId, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [['name', 'ASC']],
    });

    return envVars.map((ev) => this.formatEnvVariable(ev));
  }

  /**
   * Get a single environment variable by ID (without value)
   */
  async getEnvVariableById(
    envVarId: number,
    organizationId: string
  ): Promise<EnvVariableResponse | null> {
    const envVar = await ProjectEnvVariable.findOne({
      where: { id: envVarId, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    if (!envVar) return null;
    return this.formatEnvVariable(envVar);
  }

  /**
   * Get the decrypted value of an environment variable
   * This is a sensitive operation - only call when user explicitly requests the value
   */
  async getDecryptedValue(
    envVarId: number,
    organizationId: string
  ): Promise<string | null> {
    const envVar = await ProjectEnvVariable.findOne({
      where: { id: envVarId, organizationId },
    });

    if (!envVar) return null;

    try {
      return envVar.getDecryptedValue();
    } catch (error) {
      console.error('[ProjectEnvVariableService] Failed to decrypt value:', error);
      throw new Error('Failed to decrypt value. The encryption key may have changed.');
    }
  }

  // ===========================================================================
  // UPDATE
  // ===========================================================================

  /**
   * Update an environment variable (author only)
   */
  async updateEnvVariable(
    envVarId: number,
    userId: string,
    organizationId: string,
    updates: UpdateEnvVariableInput
  ): Promise<EnvVariableResponse | null> {
    const envVar = await ProjectEnvVariable.findOne({
      where: { id: envVarId, organizationId },
    });

    if (!envVar) return null;

    // Check author permission
    if (envVar.userId !== userId) {
      throw new Error('Only the author can update this environment variable');
    }

    const updateData: any = {};

    if (updates.name !== undefined) {
      // Check for duplicate name
      const existing = await ProjectEnvVariable.findOne({
        where: { projectId: envVar.projectId, name: updates.name.toUpperCase() },
      });
      if (existing && existing.id !== envVarId) {
        throw new Error(`Environment variable '${updates.name}' already exists for this project`);
      }
      updateData.name = updates.name.toUpperCase();
    }

    if (updates.value !== undefined) {
      const encrypted = ProjectEnvVariable.encrypt(updates.value);
      updateData.encryptedValue = encrypted.encryptedValue;
      updateData.iv = encrypted.iv;
      updateData.authTag = encrypted.authTag;
    }

    if (updates.description !== undefined) {
      updateData.description = updates.description || null;
    }

    if (updates.syncToVercel !== undefined) {
      updateData.syncToVercel = updates.syncToVercel;
      updateData.vercelTarget = updates.syncToVercel
        ? (updates.vercelTarget || envVar.vercelTarget || ['production', 'preview', 'development'])
        : envVar.vercelTarget;
    } else if (updates.vercelTarget !== undefined) {
      updateData.vercelTarget = updates.vercelTarget;
    }

    const wasSynced = envVar.syncToVercel;
    await envVar.update(updateData);

    // Handle Vercel sync changes (fire-and-forget)
    if (envVar.syncToVercel && (updates.value !== undefined || updates.name !== undefined || (!wasSynced && envVar.syncToVercel))) {
      const decryptedValue = updates.value || envVar.getDecryptedValue();
      this.syncToVercelProject(envVar, decryptedValue).catch(() => {});
    } else if (wasSynced && !envVar.syncToVercel) {
      // Sync was turned off — remove from Vercel
      this.deleteFromVercelProject(envVar).catch(() => {});
    }

    // Reload with author
    await envVar.reload({
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    return this.formatEnvVariable(envVar);
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================

  /**
   * Delete an environment variable (author only)
   */
  async deleteEnvVariable(
    envVarId: number,
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    const envVar = await ProjectEnvVariable.findOne({
      where: { id: envVarId, organizationId },
    });

    if (!envVar) return false;

    // Check author permission
    if (envVar.userId !== userId) {
      throw new Error('Only the author can delete this environment variable');
    }

    // Remove from Vercel if synced (fire-and-forget)
    if (envVar.syncToVercel) {
      await this.deleteFromVercelProject(envVar).catch(() => {});
    }

    await envVar.destroy();
    return true;
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  /**
   * Get count of env variables for a project
   */
  async getEnvVariableCount(projectId: string, organizationId: string): Promise<number> {
    return ProjectEnvVariable.count({
      where: { projectId, organizationId },
    });
  }

  /**
   * Format env variable for response (without sensitive data)
   */
  private formatEnvVariable(envVar: ProjectEnvVariable): EnvVariableResponse {
    return {
      id: envVar.id,
      projectId: envVar.projectId,
      userId: envVar.userId,
      organizationId: envVar.organizationId,
      name: envVar.name,
      description: envVar.description,
      syncToVercel: envVar.syncToVercel || false,
      vercelTarget: envVar.vercelTarget || null,
      createdAt: envVar.createdAt,
      updatedAt: envVar.updatedAt,
      author: envVar.author
        ? {
            id: envVar.author.id,
            name: envVar.author.name,
            email: envVar.author.email,
          }
        : undefined,
    };
  }

  // ===========================================================================
  // VERCEL SYNC
  // ===========================================================================

  /**
   * Sync a single env var to the linked Vercel project.
   * Fire-and-forget: logs warnings but does not throw.
   */
  private async syncToVercelProject(envVar: ProjectEnvVariable, decryptedValue: string): Promise<void> {
    try {
      const project = await Project.findByPk(envVar.projectId);
      if (!project) return;

      const vercelProjectId = (project.metadata as any)?.vercelProjectId;
      if (!vercelProjectId) {
        console.warn(`[ProjectEnvVariableService] No Vercel project linked for project ${envVar.projectId}`);
        return;
      }

      if (!vercelService.isConfigured()) {
        console.warn('[ProjectEnvVariableService] Vercel not configured, skipping sync');
        return;
      }

      const target = envVar.vercelTarget || ['production', 'preview', 'development'];

      await vercelService.createEnvVar(vercelProjectId, {
        key: envVar.name,
        value: decryptedValue,
        type: 'encrypted',
        target,
      });

      console.log(`[ProjectEnvVariableService] Synced ${envVar.name} to Vercel project ${vercelProjectId}`);
    } catch (error) {
      console.error(`[ProjectEnvVariableService] Failed to sync ${envVar.name} to Vercel:`, (error as Error).message);
    }
  }

  /**
   * Delete an env var from the linked Vercel project.
   */
  private async deleteFromVercelProject(envVar: ProjectEnvVariable): Promise<void> {
    try {
      const project = await Project.findByPk(envVar.projectId);
      if (!project) return;

      const vercelProjectId = (project.metadata as any)?.vercelProjectId;
      if (!vercelProjectId || !vercelService.isConfigured()) return;

      const vercelEnvVars = await vercelService.getEnvVars(vercelProjectId);
      const match = vercelEnvVars.find((v: any) => v.key === envVar.name);
      if (match) {
        await vercelService.deleteEnvVar(vercelProjectId, match.id);
        console.log(`[ProjectEnvVariableService] Deleted ${envVar.name} from Vercel project ${vercelProjectId}`);
      }
    } catch (error) {
      console.error(`[ProjectEnvVariableService] Failed to delete ${envVar.name} from Vercel:`, (error as Error).message);
    }
  }

  /**
   * Bulk sync all env vars marked with syncToVercel=true for a project.
   */
  async bulkSyncToVercel(projectId: string, organizationId: string): Promise<{ synced: number; failed: number }> {
    const envVars = await ProjectEnvVariable.findAll({
      where: { projectId, organizationId, syncToVercel: true },
    });

    let synced = 0;
    let failed = 0;

    for (const envVar of envVars) {
      try {
        const value = envVar.getDecryptedValue();
        await this.syncToVercelProject(envVar, value);
        synced++;
      } catch {
        failed++;
      }
    }

    return { synced, failed };
  }

  /**
   * Export env variables as .env format (for download)
   */
  async exportAsEnvFormat(
    projectId: string,
    organizationId: string
  ): Promise<string> {
    const envVars = await ProjectEnvVariable.findAll({
      where: { projectId, organizationId },
      order: [['name', 'ASC']],
    });

    const lines = envVars.map((ev) => {
      const value = ev.getDecryptedValue();
      // Escape special characters in value
      const escapedValue = value.includes('\n') || value.includes('"')
        ? `"${value.replace(/"/g, '\\"')}"`
        : value;
      const comment = ev.description ? `# ${ev.description}\n` : '';
      return `${comment}${ev.name}=${escapedValue}`;
    });

    return lines.join('\n');
  }
}

export const projectEnvVariableService = new ProjectEnvVariableService();
export { CreateEnvVariableInput, UpdateEnvVariableInput, EnvVariableResponse, EnvVariableWithValue };
