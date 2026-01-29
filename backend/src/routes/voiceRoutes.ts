/**
 * Voice Chat Routes
 *
 * Provides voice-to-voice chat with the AI agent using OpenAI Whisper (STT) and TTS.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { agentService } from '../services/agentService';
import { elevenLabsService } from '../services/ElevenLabsService';
import { authenticate } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmpDir = path.join(os.tmpdir(), 'dispotree-voice');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `voice-${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max (Whisper limit)
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/webm',
      'audio/mp3',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'audio/ogg',
      'audio/flac',
      'audio/m4a',
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(webm|mp3|mp4|wav|ogg|flac|m4a)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid audio format: ${file.mimetype}`));
    }
  },
});

// Initialize OpenAI client
const getOpenAIClient = (): OpenAI | null => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
};

/**
 * @swagger
 * /api/voice/chat:
 *   post:
 *     summary: Voice chat with AI agent
 *     description: Send audio, get transcription processed by agent, receive TTS response
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - audio
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Audio file (webm, mp3, wav, etc.)
 *               sessionId:
 *                 type: string
 *                 description: Session ID for conversation continuity
 *               voice:
 *                 type: string
 *                 enum: [alloy, echo, fable, onyx, nova, shimmer]
 *                 default: nova
 *                 description: TTS voice to use
 *     responses:
 *       200:
 *         description: Voice response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transcription:
 *                   type: string
 *                 response:
 *                   type: string
 *                 audioUrl:
 *                   type: string
 */
router.post('/chat', authenticate, upload.single('audio'), async (req: Request, res: Response) => {
  const audioFile = req.file;

  try {
    if (!audioFile) {
      return res.status(400).json({ success: false, error: 'No audio file provided' });
    }

    const openai = getOpenAIClient();
    if (!openai) {
      return res.status(503).json({ success: false, error: 'OpenAI API key not configured' });
    }

    if (!agentService.isReady()) {
      return res.status(503).json({ success: false, error: 'AI Agent not available' });
    }

    const sessionId = (req.body.sessionId as string) || `voice-${uuidv4()}`;
    const userId = req.user!.id;
    const voice = (req.body.voice as string) || 'nova';

    // Step 1: Transcribe audio with Whisper
    console.log(`[Voice] Transcribing audio: ${audioFile.path}`);
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.path),
      model: 'whisper-1',
      language: 'en',
    });

    const userMessage = transcription.text;
    console.log(`[Voice] Transcription: "${userMessage}"`);

    if (!userMessage || userMessage.trim().length === 0) {
      // Cleanup audio file
      fs.unlink(audioFile.path, () => {});
      return res.status(400).json({
        success: false,
        error: 'Could not transcribe audio. Please speak clearly and try again.'
      });
    }

    // Step 2: Send to agent
    console.log(`[Voice] Sending to agent...`);
    const agentResponse = await agentService.chat(sessionId, userMessage, userId);
    console.log(`[Voice] Agent response: "${agentResponse.substring(0, 100)}..."`);

    // Step 3: Generate TTS response
    console.log(`[Voice] Generating TTS with voice: ${voice}`);
    const ttsResponse = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: agentResponse.substring(0, 4096), // TTS has a limit
      response_format: 'mp3',
    });

    // Convert to base64 for easy frontend consumption
    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    const audioBase64 = audioBuffer.toString('base64');

    // Cleanup input audio file
    fs.unlink(audioFile.path, () => {});

    res.json({
      success: true,
      transcription: userMessage,
      response: agentResponse,
      audio: `data:audio/mp3;base64,${audioBase64}`,
      sessionId,
    });

  } catch (error) {
    console.error('[Voice] Error:', error);

    // Cleanup audio file on error
    if (audioFile?.path) {
      fs.unlink(audioFile.path, () => {});
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Voice chat failed',
    });
  }
});

/**
 * @swagger
 * /api/voice/transcribe:
 *   post:
 *     summary: Transcribe audio to text
 *     description: Convert audio to text using OpenAI Whisper
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 */
router.post('/transcribe', authenticate, upload.single('audio'), async (req: Request, res: Response) => {
  const audioFile = req.file;

  try {
    if (!audioFile) {
      return res.status(400).json({ success: false, error: 'No audio file provided' });
    }

    const openai = getOpenAIClient();
    if (!openai) {
      return res.status(503).json({ success: false, error: 'OpenAI API key not configured' });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.path),
      model: 'whisper-1',
      language: 'en',
    });

    // Cleanup
    fs.unlink(audioFile.path, () => {});

    res.json({
      success: true,
      text: transcription.text,
    });

  } catch (error) {
    if (audioFile?.path) {
      fs.unlink(audioFile.path, () => {});
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Transcription failed',
    });
  }
});

/**
 * @swagger
 * /api/voice/speak:
 *   post:
 *     summary: Convert text to speech
 *     description: Generate audio from text using OpenAI TTS
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 */
router.post('/speak', authenticate, async (req: Request, res: Response) => {
  try {
    const { text, voice = 'nova' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const openai = getOpenAIClient();
    if (!openai) {
      return res.status(503).json({ success: false, error: 'OpenAI API key not configured' });
    }

    const ttsResponse = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: text.substring(0, 4096),
      response_format: 'mp3',
    });

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    const audioBase64 = audioBuffer.toString('base64');

    res.json({
      success: true,
      audio: `data:audio/mp3;base64,${audioBase64}`,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'TTS failed',
    });
  }
});

/**
 * @swagger
 * /api/voice/voices:
 *   get:
 *     summary: Get available TTS voices
 *     tags: [Voice]
 */
router.get('/voices', (req: Request, res: Response) => {
  res.json({
    success: true,
    voices: [
      { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
      { id: 'echo', name: 'Echo', description: 'Warm and conversational' },
      { id: 'fable', name: 'Fable', description: 'Expressive and dynamic' },
      { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
      { id: 'nova', name: 'Nova', description: 'Friendly and upbeat (recommended)' },
      { id: 'shimmer', name: 'Shimmer', description: 'Clear and pleasant' },
    ],
  });
});

/**
 * @swagger
 * /api/voice/realtime-status:
 *   get:
 *     summary: Check realtime voice service status
 *     description: Returns whether the realtime voice WebSocket service is available and tool count
 *     tags: [Voice]
 */
router.get('/realtime-status', async (req: Request, res: Response) => {
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

  // Dynamically import the bridge to get tool count
  let toolCount = 0;
  try {
    const { realtimeAgentBridge } = await import('../services/RealtimeAgentBridge');
    if (realtimeAgentBridge.isReady()) {
      toolCount = realtimeAgentBridge.getToolCount();
    }
  } catch (e) {
    // Bridge not initialized yet
  }

  res.json({
    success: true,
    status: hasOpenAIKey ? 'available' : 'unavailable',
    websocketPath: '/ws/voice',
    message: hasOpenAIKey
      ? `Realtime voice service is available with ${toolCount}+ agent tools. Connect via WebSocket at /ws/voice`
      : 'OpenAI API key not configured. Realtime voice is unavailable.',
    configuration: {
      openaiConfigured: hasOpenAIKey,
      model: 'gpt-4o-realtime-preview',
      voice: 'nova',
      toolCount,
      features: [
        'Full agent tool access (100+ tools)',
        'Property search & creation',
        'Deal analysis & scoring',
        'Pipeline management',
        'Contact management',
        'Scheduling & reminders',
        'Market data lookups',
        'Knowledge base search',
      ],
    },
  });
});

// =============================================================================
// ELEVENLABS TTS ENDPOINTS
// =============================================================================

/**
 * @swagger
 * /api/voice/elevenlabs/speak:
 *   post:
 *     summary: Convert text to speech using ElevenLabs
 *     description: Generate high-quality, realistic speech from text using ElevenLabs TTS
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: Text to convert to speech (max 5000 chars)
 *               voice:
 *                 type: string
 *                 default: rachel
 *                 description: Voice key name (e.g., rachel, adam, sarah)
 *               stability:
 *                 type: number
 *                 default: 0.5
 *                 description: Voice stability (0-1)
 *               similarityBoost:
 *                 type: number
 *                 default: 0.75
 *                 description: Voice similarity boost (0-1)
 *     responses:
 *       200:
 *         description: Audio data URL
 *       503:
 *         description: ElevenLabs not configured
 */
router.post('/elevenlabs/speak', authenticate, async (req: Request, res: Response) => {
  try {
    const { text, voice = 'rachel', voiceId: directVoiceId, stability, similarityBoost } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    if (!elevenLabsService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'ElevenLabs API key not configured',
      });
    }

    // Use direct voiceId if provided, otherwise look up by voice key name
    let voiceId = directVoiceId;
    if (!voiceId) {
      const voiceData = elevenLabsService.getVoice(voice);
      voiceId = voiceData?.id;
    }

    const audioDataUrl = await elevenLabsService.textToSpeechBase64(text, {
      voiceId,
      stability,
      similarityBoost,
    });

    res.json({
      success: true,
      audio: audioDataUrl,
      voice: directVoiceId ? 'custom' : voice,
    });

  } catch (error) {
    console.error('[ElevenLabs TTS] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'ElevenLabs TTS failed',
    });
  }
});

/**
 * @swagger
 * /api/voice/elevenlabs/voices:
 *   get:
 *     summary: Get available ElevenLabs voices
 *     tags: [Voice]
 */
router.get('/elevenlabs/voices', (req: Request, res: Response) => {
  const voices = elevenLabsService.getVoices();
  const isConfigured = elevenLabsService.isConfigured();

  res.json({
    success: true,
    configured: isConfigured,
    voices: voices,
    recommended: ['rachel', 'adam', 'sarah', 'josh', 'emily'],
  });
});

/**
 * @swagger
 * /api/voice/elevenlabs/status:
 *   get:
 *     summary: Check ElevenLabs service status
 *     tags: [Voice]
 */
router.get('/elevenlabs/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    configured: elevenLabsService.isConfigured(),
    message: elevenLabsService.isConfigured()
      ? 'ElevenLabs TTS is available'
      : 'ElevenLabs API key not configured. Add ELEVENLABS_API_KEY to enable.',
  });
});

export default router;
