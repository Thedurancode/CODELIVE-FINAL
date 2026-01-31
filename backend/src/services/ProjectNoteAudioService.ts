/**
 * Project Note Audio Service
 *
 * Business logic for managing audio recordings with transcription on project notes:
 * - Upload audio to Supabase Storage
 * - Transcribe audio using OpenAI Whisper
 * - Manage audio note CRUD operations
 * - Author-only edit/delete permissions
 */

import ProjectNoteAudio, { TranscriptionStatus } from '../models/ProjectNoteAudio';
import MarketplaceUser from '../models/MarketplaceUser';
import { supabaseStorageService } from './SupabaseStorageService';
import { projectRecapService } from './ProjectRecapService';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

interface CreateAudioNoteInput {
  projectId: string;
  userId: string;
  organizationId: string;
  audioBuffer: Buffer;
  originalFilename: string;
  mimeType: string;
  language?: string;
}

interface ProjectNoteAudioWithAuthor extends ProjectNoteAudio {
  author?: {
    id: string;
    name?: string;
    email?: string;
  };
  audioUrl?: string; // Signed URL for playback
}

// =============================================================================
// SERVICE
// =============================================================================

class ProjectNoteAudioService {
  private initialized = false;
  private openai: OpenAI | null = null;

  async initialize(): Promise<void> {
    // Initialize OpenAI client if API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      console.log('ProjectNoteAudioService initialized with Whisper transcription');
    } else {
      console.log('ProjectNoteAudioService initialized (Whisper unavailable - no API key)');
    }
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }

  isWhisperAvailable(): boolean {
    return this.openai !== null;
  }

  // ===========================================================================
  // CREATE AUDIO NOTE
  // ===========================================================================

  /**
   * Create a new audio note with automatic transcription
   */
  async createAudioNote(input: CreateAudioNoteInput): Promise<ProjectNoteAudioWithAuthor> {
    const { projectId, userId, organizationId, audioBuffer, originalFilename, mimeType, language } = input;

    // Validate file size (50MB max)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (audioBuffer.length > MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum size is 50MB, received ${(audioBuffer.length / (1024 * 1024)).toFixed(1)}MB`);
    }

    // Generate unique storage path
    const timestamp = Date.now();
    const ext = path.extname(originalFilename) || this.getExtensionFromMime(mimeType);
    const storagePath = `audio/projects/${projectId}/${timestamp}-${uuidv4().substring(0, 8)}${ext}`;

    // Upload to Supabase Storage
    const uploadResult = await supabaseStorageService.uploadToPath(
      audioBuffer,
      storagePath,
      mimeType
    );

    if (!uploadResult.success) {
      throw new Error(`Failed to upload audio: ${uploadResult.error}`);
    }

    // Create database record
    const audioNote = await ProjectNoteAudio.create({
      projectId,
      userId,
      organizationId,
      audioStoragePath: uploadResult.path,
      originalFilename,
      mimeType,
      fileSize: audioBuffer.length,
      transcriptionStatus: 'pending',
      transcriptionLanguage: language || null,
    });

    // Start transcription asynchronously (non-blocking)
    this.transcribeAudioAsync(audioNote.id, audioBuffer, mimeType, language).catch(err => {
      console.error(`[ProjectNoteAudio] Transcription failed for ${audioNote.id}:`, err);
    });

    // Queue recap update (non-blocking)
    projectRecapService.queueUpdate(projectId);

    // Return with author info
    return this.getAudioNoteById(audioNote.id, organizationId) as Promise<ProjectNoteAudioWithAuthor>;
  }

  /**
   * Transcribe audio asynchronously with retry logic
   */
  private async transcribeAudioAsync(
    audioNoteId: number,
    audioBuffer: Buffer,
    mimeType: string,
    language?: string
  ): Promise<void> {
    const audioNote = await ProjectNoteAudio.findByPk(audioNoteId);
    if (!audioNote) return;

    // Update status to processing
    await audioNote.update({ transcriptionStatus: 'processing' });

    if (!this.openai) {
      await audioNote.update({
        transcriptionStatus: 'failed',
        transcriptionError: 'OpenAI API key not configured. Please add OPENAI_API_KEY to enable transcription.',
      });
      return;
    }

    // Retry configuration
    const MAX_RETRIES = 3;
    const INITIAL_DELAY_MS = 1000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Write buffer to temp file (Whisper requires file path)
        const ext = this.getExtensionFromMime(mimeType);
        const tempPath = path.join(os.tmpdir(), `whisper-${audioNoteId}${ext}`);
        fs.writeFileSync(tempPath, audioBuffer);

        // Transcribe with Whisper
        console.log(`[ProjectNoteAudio] Transcribing audio ${audioNoteId} (attempt ${attempt}/${MAX_RETRIES})...`);

        const transcriptionOptions: any = {
          file: fs.createReadStream(tempPath),
          model: 'whisper-1',
          response_format: 'verbose_json',
        };

        // Only set language if explicitly provided (auto-detect if not set)
        if (language && language !== 'auto') {
          transcriptionOptions.language = language;
        }

        const transcription = await this.openai.audio.transcriptions.create(transcriptionOptions);

        // Clean up temp file
        fs.unlink(tempPath, () => {});

        // Cast to access verbose_json properties (duration, language)
        const verboseTranscription = transcription as any;

        // Detect language from response if available
        const detectedLanguage = verboseTranscription.language || language || 'auto';

        // Update record with transcription
        await audioNote.update({
          transcript: transcription.text,
          transcriptionStatus: 'completed',
          transcriptionError: null,
          transcriptionLanguage: detectedLanguage,
          duration: Math.round(verboseTranscription.duration || 0),
        });

        console.log(`[ProjectNoteAudio] Transcription completed for ${audioNoteId} (language: ${detectedLanguage})`);

        // Queue recap update with new transcript
        projectRecapService.queueUpdate(audioNote.projectId);

        return; // Success, exit retry loop

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Transcription failed');
        console.error(`[ProjectNoteAudio] Transcription error for ${audioNoteId} (attempt ${attempt}):`, error);

        // Don't retry on certain errors
        const errorMessage = lastError.message.toLowerCase();
        if (errorMessage.includes('invalid api key') || errorMessage.includes('authentication')) {
          break; // Don't retry auth errors
        }
        if (errorMessage.includes('file too large') || errorMessage.includes('exceeded maximum')) {
          break; // Don't retry file size errors
        }

        if (attempt < MAX_RETRIES) {
          // Exponential backoff
          const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`[ProjectNoteAudio] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    await audioNote.update({
      transcriptionStatus: 'failed',
      transcriptionError: lastError?.message || 'Transcription failed after multiple attempts',
    });
  }

  /**
   * Retry transcription for a failed audio note
   */
  async retryTranscription(
    audioNoteId: number,
    organizationId: string,
    newLanguage?: string
  ): Promise<ProjectNoteAudioWithAuthor | null> {
    const audioNote = await ProjectNoteAudio.findOne({
      where: { id: audioNoteId, organizationId },
    });

    if (!audioNote) return null;

    if (audioNote.transcriptionStatus !== 'failed') {
      throw new Error('Can only retry failed transcriptions');
    }

    // Download audio from storage
    const downloadResult = await supabaseStorageService.downloadDocument(audioNote.audioStoragePath);
    if (!downloadResult.data) {
      throw new Error('Failed to download audio for transcription');
    }

    // Use new language if provided, otherwise use the stored language
    const language = newLanguage || audioNote.transcriptionLanguage || undefined;

    // Reset status and re-transcribe
    await audioNote.update({
      transcriptionStatus: 'pending',
      transcriptionError: null,
      ...(newLanguage && { transcriptionLanguage: newLanguage }),
    });

    this.transcribeAudioAsync(audioNote.id, downloadResult.data, audioNote.mimeType, language).catch(err => {
      console.error(`[ProjectNoteAudio] Retry transcription failed for ${audioNote.id}:`, err);
    });

    return this.getAudioNoteById(audioNoteId, organizationId);
  }

  // ===========================================================================
  // READ OPERATIONS
  // ===========================================================================

  /**
   * Get all audio notes for a project
   */
  async getAudioNotesForProject(
    projectId: string,
    organizationId: string
  ): Promise<ProjectNoteAudioWithAuthor[]> {
    const audioNotes = await ProjectNoteAudio.findAll({
      where: { projectId, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    // Add signed URLs for playback
    return Promise.all(
      audioNotes.map(async (note) => {
        const noteWithUrl = note as ProjectNoteAudioWithAuthor;
        noteWithUrl.audioUrl = await this.getSignedAudioUrl(note.audioStoragePath);
        return noteWithUrl;
      })
    );
  }

  /**
   * Get a single audio note by ID
   */
  async getAudioNoteById(
    audioNoteId: number,
    organizationId: string
  ): Promise<ProjectNoteAudioWithAuthor | null> {
    const audioNote = await ProjectNoteAudio.findOne({
      where: { id: audioNoteId, organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    if (!audioNote) return null;

    // Add signed URL for playback
    const noteWithUrl = audioNote as ProjectNoteAudioWithAuthor;
    noteWithUrl.audioUrl = await this.getSignedAudioUrl(audioNote.audioStoragePath);
    return noteWithUrl;
  }

  /**
   * Get signed URL for audio playback
   */
  private async getSignedAudioUrl(storagePath: string): Promise<string> {
    const result = await supabaseStorageService.getSignedUrl(storagePath, 3600); // 1 hour
    return result.success ? result.signedUrl : '';
  }

  // ===========================================================================
  // DELETE OPERATIONS
  // ===========================================================================

  /**
   * Delete an audio note (author only)
   */
  async deleteAudioNote(
    audioNoteId: number,
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    const audioNote = await ProjectNoteAudio.findOne({
      where: { id: audioNoteId, organizationId },
    });

    if (!audioNote) return false;

    // Check if user is the author
    if (audioNote.userId !== userId) {
      throw new Error('Only the author can delete this audio note');
    }

    const projectId = audioNote.projectId;

    // Delete from Supabase Storage
    await supabaseStorageService.deleteDocument(audioNote.audioStoragePath);

    // Delete database record
    await audioNote.destroy();

    // Queue recap update (non-blocking)
    projectRecapService.queueUpdate(projectId);

    return true;
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMime(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'audio/webm': '.webm',
      'audio/mp3': '.mp3',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/flac': '.flac',
      'audio/m4a': '.m4a',
      'audio/x-m4a': '.m4a',
    };
    return mimeToExt[mimeType] || '.webm';
  }

  /**
   * Get audio note count for a project
   */
  async getAudioNoteCount(projectId: string, organizationId: string): Promise<number> {
    return ProjectNoteAudio.count({
      where: { projectId, organizationId },
    });
  }

  /**
   * Get recent audio notes across all projects for an organization
   */
  async getRecentAudioNotes(
    organizationId: string,
    limit: number = 10
  ): Promise<ProjectNoteAudioWithAuthor[]> {
    const audioNotes = await ProjectNoteAudio.findAll({
      where: { organizationId },
      include: [
        {
          model: MarketplaceUser,
          as: 'author',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
    });

    // Add signed URLs for playback
    return Promise.all(
      audioNotes.map(async (note) => {
        const noteWithUrl = note as ProjectNoteAudioWithAuthor;
        noteWithUrl.audioUrl = await this.getSignedAudioUrl(note.audioStoragePath);
        return noteWithUrl;
      })
    );
  }
}

export const projectNoteAudioService = new ProjectNoteAudioService();
export { CreateAudioNoteInput, ProjectNoteAudioWithAuthor };
