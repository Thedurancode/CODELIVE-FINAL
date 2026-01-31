/**
 * Project Brand Asset Service
 *
 * Business logic for managing brand assets (logos, images, icons) for projects.
 * Handles file uploads to Supabase Storage and CRUD operations.
 */

import ProjectBrandAsset, { BrandAssetType, BrandAssetVariant } from '../models/ProjectBrandAsset';
import MarketplaceUser from '../models/MarketplaceUser';
import { supabaseStorageService } from './SupabaseStorageService';
import sharp from 'sharp';

// =============================================================================
// TYPES
// =============================================================================

interface CreateBrandAssetInput {
  projectId: string;
  userId: string;
  organizationId: string;
  name: string;
  description?: string;
  assetType: BrandAssetType;
  variant: BrandAssetVariant;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  isPrimary?: boolean;
}

interface UpdateBrandAssetInput {
  name?: string;
  description?: string;
  assetType?: BrandAssetType;
  variant?: BrandAssetVariant;
  isPrimary?: boolean;
  sortOrder?: number;
}

interface BrandAssetResponse {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  name: string;
  description: string | null;
  assetType: BrandAssetType;
  variant: BrandAssetVariant;
  storageUrl: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  author?: {
    id: string;
    name?: string;
    email?: string;
  };
}

// =============================================================================
// SERVICE
// =============================================================================

class ProjectBrandAssetService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('ProjectBrandAssetService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  // ===========================================================================
  // CREATE
  // ===========================================================================

  /**
   * Create a new brand asset
   */
  async createBrandAsset(input: CreateBrandAssetInput): Promise<BrandAssetResponse> {
    const {
      projectId,
      userId,
      organizationId,
      name,
      description,
      assetType,
      variant,
      file,
      isPrimary = false,
    } = input;

    // Get image dimensions if it's an image
    let width: number | null = null;
    let height: number | null = null;
    let metadata: Record<string, unknown> | null = null;

    if (file.mimetype.startsWith('image/')) {
      try {
        const imageInfo = await sharp(file.buffer).metadata();
        width = imageInfo.width || null;
        height = imageInfo.height || null;
        metadata = {
          format: imageInfo.format,
          space: imageInfo.space,
          channels: imageInfo.channels,
          hasAlpha: imageInfo.hasAlpha,
        };
      } catch (err) {
        console.warn('[ProjectBrandAssetService] Could not read image metadata:', err);
      }
    }

    // Generate storage path
    const timestamp = Date.now();
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `brand-assets/${projectId}/${assetType}/${variant}/${timestamp}-${sanitizedFilename}`;

    // Upload to Supabase Storage
    const uploadResult = await supabaseStorageService.uploadToPath(
      file.buffer,
      storagePath,
      file.mimetype
    );

    if (!uploadResult.success) {
      throw new Error(`Failed to upload file: ${uploadResult.error}`);
    }

    const storageUrl = uploadResult.url;

    // If setting as primary, unset other primary assets of same type
    if (isPrimary) {
      await ProjectBrandAsset.update(
        { isPrimary: false },
        { where: { projectId, assetType, isPrimary: true } }
      );
    }

    // Get next sort order
    const maxSortOrder = await ProjectBrandAsset.max('sortOrder', {
      where: { projectId },
    }) as number | null;

    const brandAsset = await ProjectBrandAsset.create({
      projectId,
      userId,
      organizationId,
      name,
      description: description || null,
      assetType,
      variant,
      storageUrl,
      storagePath,
      mimeType: file.mimetype,
      fileSize: file.size,
      width,
      height,
      isPrimary,
      sortOrder: (maxSortOrder || 0) + 1,
      metadata,
    });

    return this.formatBrandAsset(brandAsset);
  }

  // ===========================================================================
  // READ
  // ===========================================================================

  /**
   * Get all brand assets for a project
   */
  async getBrandAssetsForProject(
    projectId: string,
    organizationId: string,
    filters?: {
      assetType?: BrandAssetType;
      variant?: BrandAssetVariant;
    }
  ): Promise<BrandAssetResponse[]> {
    const where: Record<string, unknown> = { projectId, organizationId };

    if (filters?.assetType) {
      where.assetType = filters.assetType;
    }
    if (filters?.variant) {
      where.variant = filters.variant;
    }

    const assets = await ProjectBrandAsset.findAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [
        ['assetType', 'ASC'],
        ['isPrimary', 'DESC'],
        ['sortOrder', 'ASC'],
      ],
    });

    return assets.map((asset) => this.formatBrandAsset(asset));
  }

  /**
   * Get a single brand asset by ID
   */
  async getBrandAssetById(
    assetId: number,
    organizationId: string
  ): Promise<BrandAssetResponse | null> {
    const asset = await ProjectBrandAsset.findOne({
      where: { id: assetId, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    if (!asset) return null;
    return this.formatBrandAsset(asset);
  }

  /**
   * Get primary asset for a specific type
   */
  async getPrimaryAsset(
    projectId: string,
    organizationId: string,
    assetType: BrandAssetType
  ): Promise<BrandAssetResponse | null> {
    const asset = await ProjectBrandAsset.findOne({
      where: { projectId, organizationId, assetType, isPrimary: true },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    if (!asset) return null;
    return this.formatBrandAsset(asset);
  }

  /**
   * Get assets grouped by type
   */
  async getBrandAssetsGrouped(
    projectId: string,
    organizationId: string
  ): Promise<Record<BrandAssetType, BrandAssetResponse[]>> {
    const assets = await this.getBrandAssetsForProject(projectId, organizationId);

    const grouped: Record<BrandAssetType, BrandAssetResponse[]> = {
      logo: [],
      icon: [],
      banner: [],
      favicon: [],
      watermark: [],
      background: [],
      other: [],
    };

    for (const asset of assets) {
      grouped[asset.assetType].push(asset);
    }

    return grouped;
  }

  // ===========================================================================
  // UPDATE
  // ===========================================================================

  /**
   * Update a brand asset (author only)
   */
  async updateBrandAsset(
    assetId: number,
    userId: string,
    organizationId: string,
    updates: UpdateBrandAssetInput
  ): Promise<BrandAssetResponse | null> {
    const asset = await ProjectBrandAsset.findOne({
      where: { id: assetId, organizationId },
    });

    if (!asset) return null;

    // Check author permission
    if (asset.userId !== userId) {
      throw new Error('Only the author can update this brand asset');
    }

    // If setting as primary, unset other primary assets of same type
    if (updates.isPrimary && !asset.isPrimary) {
      await ProjectBrandAsset.update(
        { isPrimary: false },
        { where: { projectId: asset.projectId, assetType: asset.assetType, isPrimary: true } }
      );
    }

    await asset.update(updates);

    // Reload with author
    await asset.reload({
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    return this.formatBrandAsset(asset);
  }

  /**
   * Reorder brand assets
   */
  async reorderBrandAssets(
    projectId: string,
    organizationId: string,
    assetIds: number[]
  ): Promise<void> {
    // Verify all assets belong to the project
    const assets = await ProjectBrandAsset.findAll({
      where: { id: assetIds, projectId, organizationId },
    });

    if (assets.length !== assetIds.length) {
      throw new Error('Some assets not found or do not belong to this project');
    }

    // Update sort orders
    await Promise.all(
      assetIds.map((id, index) =>
        ProjectBrandAsset.update(
          { sortOrder: index + 1 },
          { where: { id, projectId, organizationId } }
        )
      )
    );
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================

  /**
   * Delete a brand asset (author only)
   */
  async deleteBrandAsset(
    assetId: number,
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    const asset = await ProjectBrandAsset.findOne({
      where: { id: assetId, organizationId },
    });

    if (!asset) return false;

    // Check author permission
    if (asset.userId !== userId) {
      throw new Error('Only the author can delete this brand asset');
    }

    // Delete from Supabase Storage
    try {
      await supabaseStorageService.deletePhoto(asset.storagePath);
    } catch (error) {
      console.warn('[ProjectBrandAssetService] Failed to delete file from storage:', error);
      // Continue with database deletion even if storage deletion fails
    }

    await asset.destroy();
    return true;
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  /**
   * Get count of brand assets for a project
   */
  async getBrandAssetCount(projectId: string, organizationId: string): Promise<number> {
    return ProjectBrandAsset.count({
      where: { projectId, organizationId },
    });
  }

  /**
   * Format brand asset for response
   */
  private formatBrandAsset(asset: ProjectBrandAsset): BrandAssetResponse {
    return {
      id: asset.id,
      projectId: asset.projectId,
      userId: asset.userId,
      organizationId: asset.organizationId,
      name: asset.name,
      description: asset.description,
      assetType: asset.assetType,
      variant: asset.variant,
      storageUrl: asset.storageUrl,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
      isPrimary: asset.isPrimary,
      sortOrder: asset.sortOrder,
      metadata: asset.metadata,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      author: asset.author
        ? {
            id: asset.author.id,
            name: asset.author.name,
            email: asset.author.email,
          }
        : undefined,
    };
  }
}

export const projectBrandAssetService = new ProjectBrandAssetService();
export { CreateBrandAssetInput, UpdateBrandAssetInput, BrandAssetResponse };
