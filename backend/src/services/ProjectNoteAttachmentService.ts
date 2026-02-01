/**
 * Project Note Attachment Service
 *
 * Handles file attachments for project notes:
 * - Upload files (images, documents, audio, video)
 * - Generate thumbnails for images
 * - List and retrieve attachments
 * - Delete attachments
 */

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import ProjectNoteAttachment from '../models/ProjectNoteAttachment';
import ProjectNote from '../models/ProjectNote';
import MarketplaceUser from '../models/MarketplaceUser';
import Project from '../models/Project';
import { gitHubService } from './GitHubService';
import { wasabiStorageService, WASABI_THRESHOLD } from './WasabiStorageService';

// =============================================================================
// TYPES
// =============================================================================

interface UploadInput {
  noteId: number;
  projectId: string;
  userId: string;
  organizationId: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
}

interface AttachmentWithUploader {
  id: number;
  noteId: number;
  projectId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  type: 'image' | 'document' | 'audio' | 'video' | 'other';
  metadata?: Record<string, unknown>;
  createdAt: Date;
  uploader?: {
    id: string;
    name?: string;
    email?: string;
  };
  githubUrl?: string; // URL to file in GitHub repo (if synced)
  usedLfs?: boolean; // True if stored via Git LFS
  lfsOid?: string; // LFS object ID (SHA-256)
  // Cloud storage info
  storageType?: 'local' | 'github' | 'wasabi'; // Where the file is stored
  wasabiUrl?: string; // URL to file in Wasabi (if stored there)
  wasabiKey?: string; // Wasabi storage key
}

interface GitHubSyncResult {
  success: boolean;
  githubUrl?: string;
  commitSha?: string;
  error?: string;
  usedLfs?: boolean; // True if file was uploaded via Git LFS
  lfsOid?: string; // LFS object ID (SHA-256 hash)
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
// With Wasabi support, we can accept very large files (up to 5TB per object)
// Default to 2GB for practical purposes
const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '2147483648', 10); // 2GB default
// Files >100MB go to Wasabi (if configured), otherwise use GitHub LFS
const LARGE_FILE_THRESHOLD = WASABI_THRESHOLD; // 100MB

// MIME type to file type mapping
const MIME_TYPE_MAP: Record<string, 'image' | 'document' | 'audio' | 'video' | 'other'> = {
  // Images
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'image/bmp': 'image',
  'image/tiff': 'image',
  // Audio
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'audio/aac': 'audio',
  'audio/flac': 'audio',
  'audio/m4a': 'audio',
  'audio/x-m4a': 'audio',
  // Video
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/ogg': 'video',
  'video/quicktime': 'video',
  'video/x-msvideo': 'video',
  // Documents
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
  'application/json': 'document',
  'application/xml': 'document',
  'text/markdown': 'document',
};

// =============================================================================
// SERVICE
// =============================================================================

class ProjectNoteAttachmentService {
  private initialized = false;
  private uploadDir: string = UPLOAD_DIR;

  async initialize(): Promise<void> {
    // Ensure upload directory exists
    await fs.mkdir(this.uploadDir, { recursive: true });
    await fs.mkdir(path.join(this.uploadDir, 'note-attachments'), { recursive: true });
    await fs.mkdir(path.join(this.uploadDir, 'thumbnails'), { recursive: true });

    this.initialized = true;
    console.log('[ProjectNoteAttachmentService] Initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Determine file type from MIME type
   */
  private getFileType(mimeType: string): 'image' | 'document' | 'audio' | 'video' | 'other' {
    return MIME_TYPE_MAP[mimeType] || 'other';
  }

  /**
   * Generate a unique filename
   */
  private generateFilename(originalname: string): string {
    const ext = path.extname(originalname);
    const hash = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `${timestamp}-${hash}${ext}`;
  }

  /**
   * Get the file extension from MIME type
   */
  private getExtensionFromMime(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/webm': '.webm',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'application/pdf': '.pdf',
    };
    return mimeToExt[mimeType] || '';
  }

  /**
   * Upload a file attachment for a note
   * - Small files (<100MB): Stored locally + synced to GitHub
   * - Large files (>=100MB): Stored in Wasabi cloud storage
   */
  async uploadAttachment(input: UploadInput): Promise<AttachmentWithUploader> {
    const { noteId, projectId, userId, organizationId, file } = input;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Verify note exists and belongs to project
    const note = await ProjectNote.findOne({
      where: { id: noteId, projectId },
    });
    if (!note) {
      throw new Error('Note not found');
    }

    // Determine file type
    const fileType = this.getFileType(file.mimetype);

    // Determine storage strategy based on file size and Wasabi availability
    const isLargeFile = file.size >= LARGE_FILE_THRESHOLD;
    const useWasabi = isLargeFile && wasabiStorageService.isReady();

    let url: string;
    let filename: string;
    let wasabiKey: string | undefined;
    let wasabiUrl: string | undefined;
    let storageType: 'local' | 'github' | 'wasabi' = 'local';

    if (useWasabi) {
      // Large file: Upload to Wasabi cloud storage
      console.log(`[ProjectNoteAttachmentService] Large file (${(file.size / 1024 / 1024).toFixed(2)}MB) - uploading to Wasabi`);

      wasabiKey = wasabiStorageService.generateKey(projectId, noteId, file.originalname);
      const uploadResult = await wasabiStorageService.upload(
        wasabiKey,
        file.buffer,
        file.mimetype,
        {
          projectId,
          noteId: String(noteId),
          originalFilename: file.originalname,
          uploadedBy: userId,
        }
      );

      if (!uploadResult.success) {
        throw new Error(`Failed to upload to Wasabi: ${uploadResult.error}`);
      }

      wasabiUrl = uploadResult.url;
      url = uploadResult.url; // Use Wasabi URL as primary URL
      filename = path.basename(wasabiKey);
      storageType = 'wasabi';

      console.log(`[ProjectNoteAttachmentService] Uploaded to Wasabi: ${wasabiUrl}`);
    } else {
      // Small file: Store locally
      filename = this.generateFilename(file.originalname);
      const filePath = path.join(this.uploadDir, 'note-attachments', filename);
      await fs.writeFile(filePath, file.buffer);

      // Generate URL (relative path, frontend will need to construct full URL)
      url = `/uploads/note-attachments/${filename}`;
    }

    let thumbnailUrl: string | undefined;
    // For images, we could generate thumbnails here (TODO: implement with sharp if needed)

    // Create database record with storage info
    const metadata: Record<string, unknown> = {
      uploadedAt: new Date().toISOString(),
      storageType,
    };

    if (useWasabi) {
      metadata.wasabiKey = wasabiKey;
      metadata.wasabiUrl = wasabiUrl;
    }

    const attachment = await ProjectNoteAttachment.create({
      noteId,
      projectId,
      userId,
      organizationId,
      filename,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url,
      thumbnailUrl,
      type: fileType,
      metadata,
    });

    // For small files, auto-sync to GitHub if project has a connected repo
    // Large files in Wasabi don't need GitHub sync
    if (!useWasabi) {
      this.syncToGitHub(attachment.id, file.buffer).catch((err) => {
        console.warn(`[ProjectNoteAttachmentService] Background GitHub sync failed:`, err);
      });
    }

    // Fetch with uploader info
    const result = await this.getAttachmentById(attachment.id);
    if (!result) {
      throw new Error('Failed to retrieve created attachment');
    }

    return result;
  }

  /**
   * Get all attachments for a note
   */
  async getAttachmentsForNote(noteId: number): Promise<AttachmentWithUploader[]> {
    const attachments = await ProjectNoteAttachment.findAll({
      where: { noteId },
      include: [
        {
          model: MarketplaceUser,
          as: 'uploader',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [['createdAt', 'ASC']],
    });

    return attachments.map((a) => this.formatAttachment(a));
  }

  /**
   * Get all attachments for a project
   */
  async getAttachmentsForProject(projectId: string): Promise<AttachmentWithUploader[]> {
    const attachments = await ProjectNoteAttachment.findAll({
      where: { projectId },
      include: [
        {
          model: MarketplaceUser,
          as: 'uploader',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return attachments.map((a) => this.formatAttachment(a));
  }

  /**
   * Get a single attachment by ID
   */
  async getAttachmentById(attachmentId: number): Promise<AttachmentWithUploader | null> {
    const attachment = await ProjectNoteAttachment.findByPk(attachmentId, {
      include: [
        {
          model: MarketplaceUser,
          as: 'uploader',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    if (!attachment) return null;
    return this.formatAttachment(attachment);
  }

  /**
   * Delete an attachment (uploader only)
   */
  async deleteAttachment(
    attachmentId: number,
    userId: string
  ): Promise<boolean> {
    const attachment = await ProjectNoteAttachment.findByPk(attachmentId);

    if (!attachment) {
      return false;
    }

    // Check if user is the uploader
    if (attachment.userId !== userId) {
      throw new Error('Only the uploader can delete this attachment');
    }

    const metadata = attachment.metadata as Record<string, unknown> | null;
    const storageType = metadata?.storageType as string | undefined;

    if (storageType === 'wasabi' && metadata?.wasabiKey) {
      // Delete from Wasabi cloud storage
      try {
        const deleted = await wasabiStorageService.delete(metadata.wasabiKey as string);
        if (deleted) {
          console.log(`[ProjectNoteAttachmentService] Deleted from Wasabi: ${metadata.wasabiKey}`);
        }
      } catch (err) {
        console.warn(`[ProjectNoteAttachmentService] Failed to delete from Wasabi: ${err}`);
      }
    } else {
      // Delete file from local disk
      try {
        const filePath = path.join(this.uploadDir, 'note-attachments', attachment.filename);
        await fs.unlink(filePath);

        // Delete thumbnail if exists
        if (attachment.thumbnailUrl) {
          const thumbnailFilename = path.basename(attachment.thumbnailUrl);
          const thumbnailPath = path.join(this.uploadDir, 'thumbnails', thumbnailFilename);
          await fs.unlink(thumbnailPath).catch(() => {}); // Ignore if not found
        }
      } catch (err) {
        console.warn(`[ProjectNoteAttachmentService] Failed to delete file: ${err}`);
        // Continue with database deletion even if file deletion fails
      }

      // Delete from GitHub if synced (background, don't block)
      this.deleteFromGitHub(attachmentId).catch((err) => {
        console.warn(`[ProjectNoteAttachmentService] Background GitHub delete failed:`, err);
      });
    }

    // Delete database record
    await attachment.destroy();
    return true;
  }

  /**
   * Get attachment count for a note
   */
  async getAttachmentCount(noteId: number): Promise<number> {
    return ProjectNoteAttachment.count({
      where: { noteId },
    });
  }

  /**
   * Get file path for serving (used by static file handler)
   */
  getFilePath(filename: string): string {
    return path.join(this.uploadDir, 'note-attachments', filename);
  }

  /**
   * Sync attachment to connected GitHub repository
   * Creates a notes/ folder in a dedicated 'notes-attachments' branch
   * Uses Git LFS for files >100MB
   */
  async syncToGitHub(
    attachmentId: number,
    fileBuffer: Buffer
  ): Promise<GitHubSyncResult> {
    const NOTES_BRANCH = 'notes-attachments';

    const attachment = await ProjectNoteAttachment.findByPk(attachmentId);
    if (!attachment) {
      return { success: false, error: 'Attachment not found' };
    }

    // Get the project to find GitHub URL
    const project = await Project.findByPk(attachment.projectId);
    if (!project || !project.githubUrl) {
      return { success: false, error: 'Project has no connected GitHub repository' };
    }

    // Check if GitHub service is ready
    if (!gitHubService.isReady()) {
      return { success: false, error: 'GitHub service not configured' };
    }

    // Parse GitHub URL to get owner/repo
    const parsed = gitHubService.parseGitHubUrl(project.githubUrl);
    if (!parsed) {
      return { success: false, error: 'Invalid GitHub URL format' };
    }

    const { owner, repo } = parsed;

    // Determine if we should use LFS for this file
    const useLfs = gitHubService.shouldUseLfs(fileBuffer.length);

    try {
      // Get the default branch
      const defaultBranch = await gitHubService.getDefaultBranch(owner, repo);

      // Create the notes-attachments branch if it doesn't exist
      const branchExists = await gitHubService.getBranch(owner, repo, NOTES_BRANCH);
      if (!branchExists) {
        await gitHubService.createBranch(owner, repo, NOTES_BRANCH, defaultBranch);
        console.log(`[ProjectNoteAttachmentService] Created branch '${NOTES_BRANCH}' from '${defaultBranch}'`);
      }

      // Create the notes folder path with original filename
      const notesPath = `notes/${attachment.originalFilename}`;

      // Check if file already exists to get SHA for update
      let existingSha: string | undefined;
      try {
        const sha = await gitHubService.getFileSha(owner, repo, notesPath, NOTES_BRANCH);
        if (sha) {
          existingSha = sha;
        }
      } catch {
        // File doesn't exist, which is fine for creation
      }

      let commitSha: string;
      let lfsOid: string | undefined;

      if (useLfs) {
        // Large file: Use Git LFS
        console.log(`[ProjectNoteAttachmentService] Using LFS for large file (${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

        // Enable LFS tracking for this file type if not already enabled
        const ext = path.extname(attachment.originalFilename).toLowerCase();
        const lfsPatterns = [`*${ext}`];
        try {
          await gitHubService.enableLfs(owner, repo, NOTES_BRANCH, lfsPatterns);
        } catch (err) {
          console.warn(`[ProjectNoteAttachmentService] Could not enable LFS tracking (may already exist):`, err);
        }

        // Upload via LFS
        const lfsResult = await gitHubService.uploadLargeFile(
          owner,
          repo,
          notesPath,
          fileBuffer,
          `Add note attachment (LFS): ${attachment.originalFilename}`,
          NOTES_BRANCH,
          existingSha
        );

        commitSha = lfsResult.commit.sha;
        lfsOid = lfsResult.lfsOid;
        console.log(`[ProjectNoteAttachmentService] LFS upload complete - OID: ${lfsOid}`);
      } else {
        // Small file: Use regular Contents API
        const result = await gitHubService.createOrUpdateBinaryFile(
          owner,
          repo,
          notesPath,
          fileBuffer,
          `Add note attachment: ${attachment.originalFilename}`,
          NOTES_BRANCH,
          existingSha
        );
        commitSha = result.commit.sha;
      }

      // Construct the GitHub URL for the file (on the notes-attachments branch)
      const githubFileUrl = `https://github.com/${owner}/${repo}/blob/${NOTES_BRANCH}/${notesPath}`;

      // Update attachment metadata with GitHub info
      const metadata = (attachment.metadata || {}) as Record<string, unknown>;
      metadata.githubSynced = true;
      metadata.githubUrl = githubFileUrl;
      metadata.githubBranch = NOTES_BRANCH;
      metadata.githubCommitSha = commitSha;
      metadata.githubSyncedAt = new Date().toISOString();
      metadata.usedLfs = useLfs;
      if (lfsOid) {
        metadata.lfsOid = lfsOid;
      }

      await attachment.update({ metadata });

      console.log(`[ProjectNoteAttachmentService] Synced attachment ${attachmentId} to GitHub (${NOTES_BRANCH})${useLfs ? ' via LFS' : ''}: ${githubFileUrl}`);

      return {
        success: true,
        githubUrl: githubFileUrl,
        commitSha,
        usedLfs,
        lfsOid,
      };
    } catch (error) {
      console.error(`[ProjectNoteAttachmentService] Failed to sync to GitHub:`, error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Delete attachment from GitHub repository
   */
  async deleteFromGitHub(attachmentId: number): Promise<boolean> {
    const NOTES_BRANCH = 'notes-attachments';

    const attachment = await ProjectNoteAttachment.findByPk(attachmentId);
    if (!attachment) {
      return false;
    }

    const metadata = attachment.metadata as Record<string, unknown> | null;
    if (!metadata?.githubSynced) {
      return true; // Not synced, nothing to delete
    }

    const project = await Project.findByPk(attachment.projectId);
    if (!project || !project.githubUrl) {
      return true; // No repo connected
    }

    if (!gitHubService.isReady()) {
      return false;
    }

    const parsed = gitHubService.parseGitHubUrl(project.githubUrl);
    if (!parsed) {
      return false;
    }

    const { owner, repo } = parsed;
    const notesPath = `notes/${attachment.originalFilename}`;

    // Use the branch from metadata if available, otherwise use default
    const branch = (metadata.githubBranch as string) || NOTES_BRANCH;

    try {
      const sha = await gitHubService.getFileSha(owner, repo, notesPath, branch);

      if (sha) {
        await gitHubService.deleteFile(
          owner,
          repo,
          notesPath,
          `Remove note attachment: ${attachment.originalFilename}`,
          branch,
          sha
        );
        console.log(`[ProjectNoteAttachmentService] Deleted attachment ${attachmentId} from GitHub (${branch})`);
      }

      return true;
    } catch (error) {
      console.error(`[ProjectNoteAttachmentService] Failed to delete from GitHub:`, error);
      return false;
    }
  }

  /**
   * Format attachment for API response
   */
  private formatAttachment(attachment: any): AttachmentWithUploader {
    const uploader = attachment.uploader;
    const metadata = attachment.metadata as Record<string, unknown> | null;
    return {
      id: attachment.id,
      noteId: attachment.noteId,
      projectId: attachment.projectId,
      filename: attachment.filename,
      originalFilename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url,
      thumbnailUrl: attachment.thumbnailUrl,
      type: attachment.type,
      metadata: attachment.metadata,
      createdAt: attachment.createdAt,
      uploader: uploader
        ? {
            id: uploader.id,
            name: uploader.name,
            email: uploader.email,
          }
        : undefined,
      githubUrl: metadata?.githubUrl as string | undefined,
      usedLfs: metadata?.usedLfs as boolean | undefined,
      lfsOid: metadata?.lfsOid as string | undefined,
      // Cloud storage info
      storageType: (metadata?.storageType as 'local' | 'github' | 'wasabi') || 'local',
      wasabiUrl: metadata?.wasabiUrl as string | undefined,
      wasabiKey: metadata?.wasabiKey as string | undefined,
    };
  }
}

export const projectNoteAttachmentService = new ProjectNoteAttachmentService();
export { UploadInput, AttachmentWithUploader };
