/**
 * Meeting Transcription Service
 *
 * Handles transcription of meeting recordings using OpenAI Whisper:
 * - Download recording from Daily.co or provided URL
 * - Transcribe audio using Whisper API
 * - Store transcript and update meeting record
 * - Support for retry and status tracking
 * - Chunked transcription for long recordings (>25MB)
 */

import Meeting from '../models/Meeting';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import { wasabiStorageService } from './WasabiStorageService';

// Whisper API has a 25MB file size limit
const WHISPER_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
// Split into 10-minute chunks for safety (typically ~15-20MB for mp3)
const CHUNK_DURATION_SECONDS = 10 * 60; // 10 minutes

// =============================================================================
// TYPES
// =============================================================================

export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TranscriptionResult {
  success: boolean;
  transcript?: string;
  duration?: number;
  language?: string;
  error?: string;
}

export interface MeetingTranscriptionMetadata {
  transcriptionStatus: TranscriptionStatus;
  transcriptionError?: string;
  transcriptionStartedAt?: string;
  transcriptionCompletedAt?: string;
  transcriptionDuration?: number; // Duration of recording in seconds
  transcriptionLanguage?: string;
  transcriptionModel?: string;
  transcriptionChunks?: number; // Number of chunks transcribed (for long recordings)
  transcriptionProgress?: number; // Progress percentage for chunked transcription
}

// =============================================================================
// SERVICE
// =============================================================================

class MeetingTranscriptionService {
  private initialized = false;
  private openai: OpenAI | null = null;

  async initialize(): Promise<void> {
    // Initialize OpenAI client if API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      console.log('[MeetingTranscriptionService] Initialized with Whisper transcription');
    } else {
      console.log('[MeetingTranscriptionService] Initialized (Whisper unavailable - no OPENAI_API_KEY)');
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
  // TRANSCRIPTION
  // ===========================================================================

  /**
   * Transcribe a meeting recording from a URL
   * This is the main entry point for transcription
   */
  async transcribeMeetingFromUrl(
    meetingId: string,
    recordingUrl: string,
    options?: {
      language?: string;
      organizationId?: string;
    }
  ): Promise<TranscriptionResult> {
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return { success: false, error: 'Meeting not found' };
    }

    // Update status to processing
    await this.updateMeetingTranscriptionStatus(meeting, 'processing');

    if (!this.openai) {
      await this.updateMeetingTranscriptionStatus(meeting, 'failed', {
        error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to enable transcription.',
      });
      return { success: false, error: 'OpenAI API key not configured' };
    }

    try {
      // Download the recording
      console.log(`[MeetingTranscription] Downloading recording for meeting ${meetingId}...`);
      const audioBuffer = await this.downloadRecording(recordingUrl);

      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('Failed to download recording or file is empty');
      }

      console.log(`[MeetingTranscription] Downloaded ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB`);

      // Transcribe the audio (pass meeting for progress tracking on long recordings)
      const result = await this.transcribeAudio(audioBuffer, options?.language, undefined, meeting);

      if (result.success && result.transcript) {
        // Update meeting with transcript
        await meeting.update({
          transcriptUrl: null, // We store the actual transcript text instead
          metadata: {
            ...(meeting.metadata || {}),
            transcriptionStatus: 'completed',
            transcriptionCompletedAt: new Date().toISOString(),
            transcriptionDuration: result.duration,
            transcriptionLanguage: result.language,
            transcriptionModel: 'whisper-1',
            transcript: result.transcript, // Store full transcript in metadata
          },
        });

        console.log(`[MeetingTranscription] Transcription completed for meeting ${meetingId}`);
        return result;
      } else {
        await this.updateMeetingTranscriptionStatus(meeting, 'failed', {
          error: result.error || 'Transcription failed',
        });
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[MeetingTranscription] Error transcribing meeting ${meetingId}:`, error);

      await this.updateMeetingTranscriptionStatus(meeting, 'failed', {
        error: errorMessage,
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Transcribe a meeting from an uploaded audio buffer
   */
  async transcribeMeetingFromBuffer(
    meetingId: string,
    audioBuffer: Buffer,
    mimeType: string,
    options?: {
      language?: string;
    }
  ): Promise<TranscriptionResult> {
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return { success: false, error: 'Meeting not found' };
    }

    // Update status to processing
    await this.updateMeetingTranscriptionStatus(meeting, 'processing');

    if (!this.openai) {
      await this.updateMeetingTranscriptionStatus(meeting, 'failed', {
        error: 'OpenAI API key not configured',
      });
      return { success: false, error: 'OpenAI API key not configured' };
    }

    try {
      // Pass meeting for progress tracking on long recordings
      const result = await this.transcribeAudio(audioBuffer, options?.language, mimeType, meeting);

      if (result.success && result.transcript) {
        await meeting.update({
          metadata: {
            ...(meeting.metadata || {}),
            transcriptionStatus: 'completed',
            transcriptionCompletedAt: new Date().toISOString(),
            transcriptionDuration: result.duration,
            transcriptionLanguage: result.language,
            transcriptionModel: 'whisper-1',
            transcript: result.transcript,
          },
        });

        console.log(`[MeetingTranscription] Transcription completed for meeting ${meetingId}`);
        return result;
      } else {
        await this.updateMeetingTranscriptionStatus(meeting, 'failed', {
          error: result.error || 'Transcription failed',
        });
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateMeetingTranscriptionStatus(meeting, 'failed', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Queue transcription to run asynchronously (non-blocking)
   */
  async queueTranscription(
    meetingId: string,
    recordingUrl: string,
    options?: { language?: string }
  ): Promise<void> {
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      console.error(`[MeetingTranscription] Meeting ${meetingId} not found for transcription queue`);
      return;
    }

    // Mark as pending
    await this.updateMeetingTranscriptionStatus(meeting, 'pending');

    // Run transcription asynchronously
    this.transcribeMeetingFromUrl(meetingId, recordingUrl, options).catch((err) => {
      console.error(`[MeetingTranscription] Background transcription failed for ${meetingId}:`, err);
    });
  }

  /**
   * Retry a failed transcription
   */
  async retryTranscription(
    meetingId: string,
    recordingUrl?: string,
    language?: string
  ): Promise<TranscriptionResult> {
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return { success: false, error: 'Meeting not found' };
    }

    const metadata = meeting.metadata as MeetingTranscriptionMetadata | null;
    const status = metadata?.transcriptionStatus;

    if (status !== 'failed') {
      return { success: false, error: 'Can only retry failed transcriptions' };
    }

    // Use provided URL or existing recording URL
    const url = recordingUrl || meeting.recordingUrl;
    if (!url) {
      return { success: false, error: 'No recording URL available' };
    }

    return this.transcribeMeetingFromUrl(meetingId, url, { language });
  }

  /**
   * Get transcription status for a meeting
   */
  async getTranscriptionStatus(meetingId: string): Promise<{
    status: TranscriptionStatus;
    transcript?: string;
    error?: string;
    duration?: number;
    language?: string;
    completedAt?: string;
    chunks?: number;
    progress?: number;
    source?: 'daily' | 'whisper';
  } | null> {
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) return null;

    const metadata = meeting.metadata as MeetingTranscriptionMetadata | null;

    return {
      status: metadata?.transcriptionStatus || 'pending',
      transcript: (metadata as any)?.transcript,
      error: metadata?.transcriptionError,
      duration: metadata?.transcriptionDuration,
      language: metadata?.transcriptionLanguage,
      completedAt: metadata?.transcriptionCompletedAt,
      chunks: metadata?.transcriptionChunks,
      progress: metadata?.transcriptionProgress,
      source: (metadata as any)?.transcriptionSource as 'daily' | 'whisper' | undefined,
    };
  }

  /**
   * Get the transcript text for a meeting
   */
  async getTranscript(meetingId: string): Promise<string | null> {
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) return null;

    const metadata = meeting.metadata as any;
    return metadata?.transcript || null;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Download recording from URL
   */
  private async downloadRecording(url: string): Promise<Buffer> {
    const response = await fetch(url, {
      headers: {
        Accept: 'audio/*,video/*,*/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download recording: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Transcribe audio buffer using Whisper
   * Automatically handles long recordings by chunking with ffmpeg
   */
  private async transcribeAudio(
    audioBuffer: Buffer,
    language?: string,
    mimeType?: string,
    meeting?: Meeting
  ): Promise<TranscriptionResult> {
    if (!this.openai) {
      return { success: false, error: 'OpenAI not configured' };
    }

    const fileSizeMB = audioBuffer.length / 1024 / 1024;
    console.log(`[MeetingTranscription] Audio size: ${fileSizeMB.toFixed(2)}MB`);

    // Check if file exceeds Whisper's 25MB limit
    if (audioBuffer.length > WHISPER_MAX_FILE_SIZE) {
      console.log(`[MeetingTranscription] File exceeds 25MB limit, using chunked transcription...`);
      if (!meeting) {
        return {
          success: false,
          error: 'Large audio file requires meeting context for progress tracking',
        };
      }
      return this.transcribeLongAudio(audioBuffer, meeting, language, mimeType);
    }

    // Retry configuration
    const MAX_RETRIES = 3;
    const INITIAL_DELAY_MS = 1000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Write buffer to temp file (Whisper API requires file)
        const ext = this.getExtensionFromMime(mimeType || 'audio/webm');
        const tempPath = path.join(os.tmpdir(), `meeting-${uuidv4()}${ext}`);
        fs.writeFileSync(tempPath, audioBuffer);

        console.log(`[MeetingTranscription] Transcribing audio (attempt ${attempt}/${MAX_RETRIES})...`);

        const transcriptionOptions: any = {
          file: fs.createReadStream(tempPath),
          model: 'whisper-1',
          response_format: 'verbose_json',
        };

        // Only set language if explicitly provided
        if (language && language !== 'auto') {
          transcriptionOptions.language = language;
        }

        const transcription = await this.openai.audio.transcriptions.create(transcriptionOptions);

        // Clean up temp file
        fs.unlink(tempPath, () => {});

        // Extract verbose_json properties
        const verboseTranscription = transcription as any;

        return {
          success: true,
          transcript: transcription.text,
          duration: Math.round(verboseTranscription.duration || 0),
          language: verboseTranscription.language || language || 'auto',
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Transcription failed');
        console.error(`[MeetingTranscription] Transcription error (attempt ${attempt}):`, error);

        // Don't retry on certain errors
        const errorMessage = lastError.message.toLowerCase();
        if (
          errorMessage.includes('invalid api key') ||
          errorMessage.includes('authentication')
        ) {
          break;
        }

        // If file too large error, try chunked transcription
        if (errorMessage.includes('file too large') || errorMessage.includes('maximum')) {
          console.log('[MeetingTranscription] API rejected file size, trying chunked transcription...');
          if (meeting) {
            return this.transcribeLongAudio(audioBuffer, meeting, language, mimeType);
          }
          break;
        }

        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`[MeetingTranscription] Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Transcription failed after multiple attempts',
    };
  }

  /**
   * Update meeting transcription status in metadata
   */
  private async updateMeetingTranscriptionStatus(
    meeting: Meeting,
    status: TranscriptionStatus,
    extra?: { error?: string }
  ): Promise<void> {
    const currentMetadata = (meeting.metadata || {}) as Record<string, unknown>;

    const updatedMetadata: Record<string, unknown> = {
      ...currentMetadata,
      transcriptionStatus: status,
    };

    if (status === 'processing') {
      updatedMetadata.transcriptionStartedAt = new Date().toISOString();
      delete updatedMetadata.transcriptionError;
    }

    if (status === 'failed' && extra?.error) {
      updatedMetadata.transcriptionError = extra.error;
    }

    await meeting.update({ metadata: updatedMetadata });
  }

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
      'video/webm': '.webm',
      'video/mp4': '.mp4',
    };
    return mimeToExt[mimeType] || '.webm';
  }

  // ===========================================================================
  // AUDIO CHUNKING (for long recordings)
  // ===========================================================================

  /**
   * Check if ffmpeg is available on the system
   */
  private async isFfmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('ffmpeg', ['-version']);
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });
  }

  /**
   * Get audio duration using ffprobe
   */
  private async getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ]);

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) {
          const duration = parseFloat(output.trim());
          resolve(isNaN(duration) ? 0 : duration);
        } else {
          reject(new Error(`ffprobe exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Split audio file into chunks using ffmpeg
   * Returns array of chunk file paths
   */
  private async splitAudioIntoChunks(
    inputPath: string,
    chunkDurationSeconds: number = CHUNK_DURATION_SECONDS
  ): Promise<string[]> {
    const duration = await this.getAudioDuration(inputPath);
    const numChunks = Math.ceil(duration / chunkDurationSeconds);
    const chunkPaths: string[] = [];
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const tempDir = os.tmpdir();

    console.log(`[MeetingTranscription] Splitting ${Math.round(duration / 60)}min audio into ${numChunks} chunks...`);

    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDurationSeconds;
      const chunkPath = path.join(tempDir, `${baseName}-chunk-${i}.mp3`);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', [
          '-i', inputPath,
          '-ss', String(startTime),
          '-t', String(chunkDurationSeconds),
          '-acodec', 'libmp3lame',
          '-ab', '128k',
          '-ar', '16000', // 16kHz is optimal for Whisper
          '-ac', '1', // Mono
          '-y', // Overwrite output
          chunkPath,
        ]);

        proc.on('error', (err) => reject(err));
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`ffmpeg chunk ${i} failed with code ${code}`));
          }
        });
      });

      // Verify chunk was created and has content
      if (fs.existsSync(chunkPath)) {
        const stats = fs.statSync(chunkPath);
        if (stats.size > 0) {
          chunkPaths.push(chunkPath);
          console.log(`[MeetingTranscription] Created chunk ${i + 1}/${numChunks} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
        }
      }
    }

    return chunkPaths;
  }

  /**
   * Convert audio to mp3 format optimized for Whisper
   */
  private async convertToOptimizedMp3(inputPath: string): Promise<string> {
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(os.tmpdir(), `${baseName}-optimized.mp3`);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-i', inputPath,
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-ar', '16000', // 16kHz is optimal for Whisper
        '-ac', '1', // Mono
        '-y', // Overwrite output
        outputPath,
      ]);

      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg conversion failed with code ${code}`));
        }
      });
    });

    return outputPath;
  }

  /**
   * Transcribe a single chunk
   */
  private async transcribeChunk(
    chunkPath: string,
    language?: string
  ): Promise<{ text: string; duration: number }> {
    if (!this.openai) {
      throw new Error('OpenAI not configured');
    }

    const transcriptionOptions: any = {
      file: fs.createReadStream(chunkPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
    };

    if (language && language !== 'auto') {
      transcriptionOptions.language = language;
    }

    const transcription = await this.openai.audio.transcriptions.create(transcriptionOptions);
    const verboseTranscription = transcription as any;

    return {
      text: transcription.text,
      duration: verboseTranscription.duration || 0,
    };
  }

  /**
   * Transcribe a long audio file by splitting into chunks
   */
  private async transcribeLongAudio(
    audioBuffer: Buffer,
    meeting: Meeting,
    language?: string,
    mimeType?: string
  ): Promise<TranscriptionResult> {
    // Check if ffmpeg is available
    const ffmpegAvailable = await this.isFfmpegAvailable();
    if (!ffmpegAvailable) {
      return {
        success: false,
        error: 'Audio file exceeds 25MB limit and ffmpeg is not available for chunking. Please install ffmpeg to transcribe long recordings.',
      };
    }

    // Write buffer to temp file
    const ext = this.getExtensionFromMime(mimeType || 'audio/webm');
    const tempPath = path.join(os.tmpdir(), `meeting-${uuidv4()}${ext}`);
    fs.writeFileSync(tempPath, audioBuffer);

    try {
      // Convert to optimized mp3 first (reduces file size significantly)
      console.log('[MeetingTranscription] Converting audio to optimized mp3...');
      const optimizedPath = await this.convertToOptimizedMp3(tempPath);

      // Check if optimized file is small enough
      const optimizedSize = fs.statSync(optimizedPath).size;
      console.log(`[MeetingTranscription] Optimized size: ${(optimizedSize / 1024 / 1024).toFixed(2)}MB`);

      if (optimizedSize < WHISPER_MAX_FILE_SIZE) {
        // Optimized file is small enough, transcribe directly
        console.log('[MeetingTranscription] Optimized file fits within limit, transcribing directly...');
        const result = await this.transcribeChunk(optimizedPath, language);

        // Clean up
        fs.unlink(tempPath, () => {});
        fs.unlink(optimizedPath, () => {});

        return {
          success: true,
          transcript: result.text,
          duration: Math.round(result.duration),
          language: language || 'auto',
        };
      }

      // Still too large, split into chunks
      const chunkPaths = await this.splitAudioIntoChunks(optimizedPath);

      if (chunkPaths.length === 0) {
        throw new Error('Failed to create audio chunks');
      }

      // Update status with chunk info
      await this.updateMeetingTranscriptionProgress(meeting, 0, chunkPaths.length);

      // Transcribe each chunk
      const transcripts: string[] = [];
      let totalDuration = 0;
      let detectedLanguage = language || 'auto';

      for (let i = 0; i < chunkPaths.length; i++) {
        console.log(`[MeetingTranscription] Transcribing chunk ${i + 1}/${chunkPaths.length}...`);

        try {
          const result = await this.transcribeChunk(chunkPaths[i], language);
          transcripts.push(result.text);
          totalDuration += result.duration;

          // Update progress
          const progress = Math.round(((i + 1) / chunkPaths.length) * 100);
          await this.updateMeetingTranscriptionProgress(meeting, progress, chunkPaths.length);
        } catch (chunkError) {
          console.error(`[MeetingTranscription] Chunk ${i + 1} failed:`, chunkError);
          // Continue with remaining chunks, mark this part as [inaudible]
          transcripts.push('[transcription failed for this segment]');
        }

        // Clean up chunk file
        fs.unlink(chunkPaths[i], () => {});
      }

      // Clean up original files
      fs.unlink(tempPath, () => {});
      fs.unlink(optimizedPath, () => {});

      // Combine transcripts with segment markers
      const combinedTranscript = transcripts.join('\n\n');

      return {
        success: true,
        transcript: combinedTranscript,
        duration: Math.round(totalDuration),
        language: detectedLanguage,
      };
    } catch (error) {
      // Clean up temp files on error
      fs.unlink(tempPath, () => {});
      throw error;
    }
  }

  /**
   * Update transcription progress for chunked transcription
   */
  private async updateMeetingTranscriptionProgress(
    meeting: Meeting,
    progress: number,
    totalChunks: number
  ): Promise<void> {
    const currentMetadata = (meeting.metadata || {}) as Record<string, unknown>;
    await meeting.update({
      metadata: {
        ...currentMetadata,
        transcriptionProgress: progress,
        transcriptionChunks: totalChunks,
      },
    });
  }

  // ===========================================================================
  // DAILY.CO RECORDING INTEGRATION
  // ===========================================================================

  /**
   * Get recording URL from Daily.co for a meeting room
   * This can be called after a meeting ends to retrieve the recording
   */
  async getDailyRecordingUrl(roomName: string): Promise<string | null> {
    const dailyApiKey = process.env.DAILY_API_KEY;
    if (!dailyApiKey) {
      console.warn('[MeetingTranscription] Daily.co API key not configured');
      return null;
    }

    try {
      // Get recordings for the room
      const response = await fetch(
        `https://api.daily.co/v1/recordings?room_name=${encodeURIComponent(roomName)}`,
        {
          headers: {
            Authorization: `Bearer ${dailyApiKey}`,
          },
        }
      );

      if (!response.ok) {
        console.error(`[MeetingTranscription] Failed to get Daily recordings: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const recordings = data.data || [];

      if (recordings.length === 0) {
        console.log(`[MeetingTranscription] No recordings found for room ${roomName}`);
        return null;
      }

      // Get the most recent recording
      const latestRecording = recordings[0];

      // Get the download link for the recording
      const downloadResponse = await fetch(
        `https://api.daily.co/v1/recordings/${latestRecording.id}/access-link`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${dailyApiKey}`,
          },
        }
      );

      if (!downloadResponse.ok) {
        console.error(`[MeetingTranscription] Failed to get recording access link: ${downloadResponse.status}`);
        return null;
      }

      const downloadData = await downloadResponse.json();
      return downloadData.download_link || null;
    } catch (error) {
      console.error('[MeetingTranscription] Error getting Daily recording:', error);
      return null;
    }
  }

  /**
   * Get transcript from Daily.co's native transcription (Deepgram)
   * Daily stores transcripts when enable_transcription_storage is true
   */
  async getDailyTranscript(roomName: string): Promise<{
    success: boolean;
    transcript?: string;
    vttUrl?: string;
    duration?: number;
    error?: string;
  }> {
    const dailyApiKey = process.env.DAILY_API_KEY;
    if (!dailyApiKey) {
      return { success: false, error: 'Daily.co API key not configured' };
    }

    try {
      // Get transcripts for the room
      // Daily.co stores transcripts at /v1/transcript endpoint
      const response = await fetch(
        `https://api.daily.co/v1/transcript?room_name=${encodeURIComponent(roomName)}`,
        {
          headers: {
            Authorization: `Bearer ${dailyApiKey}`,
          },
        }
      );

      if (!response.ok) {
        // 404 means no transcript available (transcription wasn't enabled or meeting too short)
        if (response.status === 404) {
          return { success: false, error: 'No transcript available from Daily.co' };
        }
        return { success: false, error: `Daily API error: ${response.status}` };
      }

      const data = await response.json();
      const transcripts = data.data || [];

      if (transcripts.length === 0) {
        return { success: false, error: 'No transcripts found for this room' };
      }

      // Get the most recent transcript
      const latestTranscript = transcripts[0];

      // Get the transcript access link
      const accessResponse = await fetch(
        `https://api.daily.co/v1/transcript/${latestTranscript.transcriptId}/access-link`,
        {
          headers: {
            Authorization: `Bearer ${dailyApiKey}`,
          },
        }
      );

      if (!accessResponse.ok) {
        return { success: false, error: 'Failed to get transcript access link' };
      }

      const accessData = await accessResponse.json();
      const vttUrl = accessData.link;

      if (!vttUrl) {
        return { success: false, error: 'No transcript URL returned' };
      }

      // Download and parse the WebVTT transcript
      const vttResponse = await fetch(vttUrl);
      if (!vttResponse.ok) {
        return { success: false, error: 'Failed to download transcript' };
      }

      const vttContent = await vttResponse.text();

      // Parse WebVTT to plain text
      const plainText = this.parseVttToText(vttContent);

      return {
        success: true,
        transcript: plainText,
        vttUrl,
        duration: latestTranscript.duration,
      };
    } catch (error) {
      console.error('[MeetingTranscription] Error getting Daily transcript:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Parse WebVTT format to plain text
   */
  private parseVttToText(vttContent: string): string {
    const lines = vttContent.split('\n');
    const textLines: string[] = [];
    let lastSpeaker = '';

    for (const line of lines) {
      // Skip WebVTT header and timing lines
      if (
        line.startsWith('WEBVTT') ||
        line.includes('-->') ||
        line.match(/^\d+$/) ||
        line.trim() === ''
      ) {
        continue;
      }

      // Check if line has speaker prefix like "<v Speaker Name>text"
      const speakerMatch = line.match(/^<v ([^>]+)>(.*)$/);
      if (speakerMatch) {
        const speaker = speakerMatch[1];
        const text = speakerMatch[2].trim();
        if (speaker !== lastSpeaker) {
          textLines.push(`\n${speaker}:`);
          lastSpeaker = speaker;
        }
        if (text) {
          textLines.push(text);
        }
      } else {
        // Plain text line
        const cleanLine = line.replace(/<[^>]+>/g, '').trim();
        if (cleanLine) {
          textLines.push(cleanLine);
        }
      }
    }

    return textLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Upload a recording to Wasabi storage for permanent archival
   */
  async uploadRecordingToWasabi(
    meetingId: string,
    recordingBuffer: Buffer,
    contentType: string = 'video/mp4'
  ): Promise<{ success: boolean; storagePath?: string; url?: string; error?: string }> {
    if (!wasabiStorageService.isConfigured()) {
      console.log('[MeetingTranscription] Wasabi not configured, skipping upload');
      return { success: false, error: 'Wasabi storage not configured' };
    }

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return { success: false, error: 'Meeting not found' };
    }

    try {
      // Generate storage path: meetings/{organizationId}/{year}/{month}/{meetingId}.mp4
      const date = new Date(meeting.scheduledAt);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const ext = contentType.includes('webm') ? 'webm' : 'mp4';
      const storagePath = `meetings/${meeting.organizationId}/${year}/${month}/${meetingId}.${ext}`;

      console.log(`[MeetingTranscription] Uploading recording to Wasabi: ${storagePath} (${(recordingBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

      const result = await wasabiStorageService.upload(
        storagePath,
        recordingBuffer,
        contentType,
        {
          meetingId,
          meetingTitle: meeting.title,
          organizationId: meeting.organizationId,
          scheduledAt: meeting.scheduledAt.toISOString(),
        }
      );

      if (result.success) {
        // Update meeting with storage path
        await meeting.update({ recordingStoragePath: result.key });
        console.log(`[MeetingTranscription] Recording uploaded to Wasabi: ${result.key}`);
        return { success: true, storagePath: result.key, url: result.url };
      } else {
        console.error(`[MeetingTranscription] Failed to upload recording to Wasabi: ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('[MeetingTranscription] Error uploading to Wasabi:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Download recording from URL and upload to Wasabi
   */
  async downloadAndArchiveRecording(
    meetingId: string,
    recordingUrl: string
  ): Promise<{ success: boolean; storagePath?: string; error?: string }> {
    try {
      console.log(`[MeetingTranscription] Downloading recording for archival: ${meetingId}`);

      const recordingBuffer = await this.downloadRecording(recordingUrl);
      if (!recordingBuffer || recordingBuffer.length === 0) {
        return { success: false, error: 'Failed to download recording' };
      }

      console.log(`[MeetingTranscription] Downloaded ${(recordingBuffer.length / 1024 / 1024).toFixed(2)}MB, uploading to Wasabi...`);

      // Determine content type from URL
      let contentType = 'video/mp4';
      if (recordingUrl.includes('.webm')) {
        contentType = 'video/webm';
      }

      return this.uploadRecordingToWasabi(meetingId, recordingBuffer, contentType);
    } catch (error) {
      console.error('[MeetingTranscription] Error downloading/archiving recording:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Auto-transcribe meeting after it ends
   * First tries Daily.co's native transcription, falls back to Whisper if needed
   * Also archives recording to Wasabi for permanent storage
   * Called from MeetingService.endMeeting()
   */
  async autoTranscribeIfRecordingAvailable(
    meetingId: string,
    roomName?: string
  ): Promise<void> {
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) return;

    // First, try to get transcript from Daily.co's native transcription (Deepgram)
    if (roomName) {
      console.log(`[MeetingTranscription] Checking for Daily.co native transcript for room ${roomName}...`);

      // Wait a bit for Daily to process the transcript (it's near real-time but may need a moment)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const dailyTranscript = await this.getDailyTranscript(roomName);

      if (dailyTranscript.success && dailyTranscript.transcript) {
        console.log(`[MeetingTranscription] Got native transcript from Daily.co (${dailyTranscript.transcript.length} chars)`);

        // Store the transcript
        await meeting.update({
          transcriptUrl: dailyTranscript.vttUrl || null,
          metadata: {
            ...(meeting.metadata || {}),
            transcriptionStatus: 'completed',
            transcriptionCompletedAt: new Date().toISOString(),
            transcriptionDuration: dailyTranscript.duration,
            transcriptionModel: 'daily-deepgram',
            transcriptionSource: 'daily',
            transcript: dailyTranscript.transcript,
          },
        });

        console.log(`[MeetingTranscription] Saved Daily.co transcript for meeting ${meetingId}`);
      } else {
        console.log(`[MeetingTranscription] No Daily.co transcript available: ${dailyTranscript.error}`);
      }
    }

    // Get recording URL from Daily.co
    let recordingUrl = meeting.recordingUrl;

    if (!recordingUrl && roomName) {
      console.log(`[MeetingTranscription] Fetching recording URL from Daily.co for room ${roomName}...`);
      recordingUrl = await this.getDailyRecordingUrl(roomName);

      if (recordingUrl) {
        // Store the recording URL on the meeting
        await meeting.update({ recordingUrl });
        console.log(`[MeetingTranscription] Recording URL saved for meeting ${meetingId}`);
      }
    }

    if (!recordingUrl) {
      console.log(`[MeetingTranscription] No recording available for meeting ${meetingId}`);
      return;
    }

    // Archive recording to Wasabi (async, non-blocking for the main flow)
    // This ensures we have a permanent copy even after Daily.co expires
    this.downloadAndArchiveRecording(meetingId, recordingUrl)
      .then((result) => {
        if (result.success) {
          console.log(`[MeetingTranscription] Recording archived to Wasabi: ${result.storagePath}`);
        } else {
          console.warn(`[MeetingTranscription] Failed to archive recording to Wasabi: ${result.error}`);
        }
      })
      .catch((err) => {
        console.error(`[MeetingTranscription] Error archiving recording:`, err);
      });

    // If we don't have a Daily transcript, fall back to Whisper
    const metadata = meeting.metadata as MeetingTranscriptionMetadata | null;
    if (!metadata?.transcriptionStatus || metadata.transcriptionStatus !== 'completed') {
      console.log(`[MeetingTranscription] Queueing Whisper transcription for meeting ${meetingId}`);
      await this.queueTranscription(meetingId, recordingUrl);
    }
  }
}

export const meetingTranscriptionService = new MeetingTranscriptionService();
