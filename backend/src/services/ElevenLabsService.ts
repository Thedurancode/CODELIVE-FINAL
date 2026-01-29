/**
 * ElevenLabs Text-to-Speech Service
 *
 * Provides high-quality, realistic voice synthesis using ElevenLabs API.
 * Falls back to OpenAI TTS if ElevenLabs is not configured.
 */

import { logger } from './LoggerService';

// ElevenLabs voice IDs
export const ELEVENLABS_VOICES = {
  // Premade voices
  rachel: { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Calm, young American female' },
  drew: { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew', description: 'Well-rounded American male' },
  clyde: { id: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde', description: 'War veteran, middle-aged American male' },
  paul: { id: '5Q0t7uMcjvnagumLfvZi', name: 'Paul', description: 'Ground reporter, American male' },
  domi: { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', description: 'Strong, young American female' },
  dave: { id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave', description: 'Conversational British-Essex male' },
  fin: { id: 'D38z5RcWu1voky8WS1ja', name: 'Fin', description: 'Sailor, older Irish male' },
  sarah: { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Soft, young American female' },
  antoni: { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', description: 'Well-rounded American male' },
  thomas: { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas', description: 'Calm American male' },
  charlie: { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', description: 'Casual Australian male' },
  george: { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: 'Warm British male' },
  emily: { id: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily', description: 'Calm American female' },
  elli: { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', description: 'Emotional American female' },
  callum: { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', description: 'Hoarse American male' },
  patrick: { id: 'ODq5zmih8GrVes37Dizd', name: 'Patrick', description: 'Shouty American male' },
  harry: { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', description: 'Anxious British male' },
  liam: { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', description: 'Articulate American male' },
  dorothy: { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', description: 'Pleasant British female' },
  josh: { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', description: 'Deep American male' },
  arnold: { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', description: 'Crisp American male' },
  charlotte: { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', description: 'Seductive Swedish female' },
  matilda: { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', description: 'Warm American female' },
  matthew: { id: 'Yko7PKs6WkR9MfaPvYfi', name: 'Matthew', description: 'Confident British male' },
  james: { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'James', description: 'Calm Australian male' },
  joseph: { id: 'Zlb1dXrM653N07WRdFW3', name: 'Joseph', description: 'British male' },
  jeremy: { id: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy', description: 'Excited Irish male' },
  michael: { id: 'flq6f7yk4E4fJM5XTYuZ', name: 'Michael', description: 'Older American male' },
  ethan: { id: 'g5CIjZEefAph4nQFvHAz', name: 'Ethan', description: 'Young American male' },
  chris: { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', description: 'Casual American male' },
  gigi: { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi', description: 'Childish American female' },
  freya: { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya', description: 'American female' },
  brian: { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', description: 'Deep American male narrator' },
  grace: { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace', description: 'Southern American female' },
  daniel: { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', description: 'Deep British male' },
  lily: { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', description: 'Warm British female' },
  serena: { id: 'pMsXgVXv3BLzUgSXRplE', name: 'Serena', description: 'Pleasant American female' },
  adam: { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'Deep American male' },
  nicole: { id: 'piTKgcLEGmPE4e6mEKli', name: 'Nicole', description: 'Soft American female' },
  bill: { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', description: 'American male' },
  jessie: { id: 't0jbNlBVZ17f02VDIeMI', name: 'Jessie', description: 'Raspy American male' },
  sam: { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', description: 'Raspy American male' },
  glinda: { id: 'z9fAnlkpzviPz146aGWa', name: 'Glinda', description: 'Witch American female' },
  giovanni: { id: 'zcAOhNBS3c14rBihAFp1', name: 'Giovanni', description: 'Foreigner English male' },
  mimi: { id: 'zrHiDhphv9ZnVXBqCLjz', name: 'Mimi', description: 'Childish Swedish female' },
};

// Default voice for project recaps
const DEFAULT_VOICE = 'rachel';

interface TTSOptions {
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

class ElevenLabsService {
  private apiKey: string | null = null;
  private baseUrl = 'https://api.elevenlabs.io/v1';
  private initialized = false;

  async initialize(): Promise<void> {
    this.apiKey = process.env.ELEVENLABS_API_KEY || null;
    this.initialized = true;

    if (this.apiKey) {
      logger.info('ElevenLabs Service initialized');
    } else {
      logger.warn('ElevenLabs API key not configured - will fallback to OpenAI TTS');
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Generate speech from text using ElevenLabs
   */
  async textToSpeech(text: string, options: TTSOptions = {}): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    const voiceId = options.voiceId || ELEVENLABS_VOICES[DEFAULT_VOICE].id;
    const modelId = options.modelId || 'eleven_multilingual_v2';

    const url = `${this.baseUrl}/text-to-speech/${voiceId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': this.apiKey,
      },
      body: JSON.stringify({
        text: text.substring(0, 5000), // ElevenLabs limit
        model_id: modelId,
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarityBoost ?? 0.75,
          style: options.style ?? 0.0,
          use_speaker_boost: options.useSpeakerBoost ?? true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('ElevenLabs TTS error', { status: response.status, error: errorText });
      throw new Error(`ElevenLabs TTS failed: ${response.status} - ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Generate speech and return as base64 data URL
   */
  async textToSpeechBase64(text: string, options: TTSOptions = {}): Promise<string> {
    const audioBuffer = await this.textToSpeech(text, options);
    const base64 = audioBuffer.toString('base64');
    return `data:audio/mpeg;base64,${base64}`;
  }

  /**
   * Get list of available voices
   */
  getVoices(): Array<{ id: string; voiceId: string; name: string; description: string }> {
    return Object.entries(ELEVENLABS_VOICES).map(([key, voice]) => ({
      id: key,
      voiceId: voice.id,
      name: voice.name,
      description: voice.description,
    }));
  }

  /**
   * Get a specific voice by key name
   */
  getVoice(key: string): { id: string; name: string; description: string } | null {
    return ELEVENLABS_VOICES[key as keyof typeof ELEVENLABS_VOICES] || null;
  }
}

export const elevenLabsService = new ElevenLabsService();
