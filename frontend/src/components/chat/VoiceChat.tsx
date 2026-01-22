'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
  Square,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface VoiceChatProps {
  sessionId: string;
  onTranscription?: (text: string) => void;
  onResponse?: (text: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

type RecordingState = 'idle' | 'recording' | 'processing' | 'playing';

const VOICES = [
  { id: 'nova', name: 'Nova', description: 'Friendly and upbeat' },
  { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
  { id: 'echo', name: 'Echo', description: 'Warm and conversational' },
  { id: 'fable', name: 'Fable', description: 'Expressive and dynamic' },
  { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
  { id: 'shimmer', name: 'Shimmer', description: 'Clear and pleasant' },
];

export function VoiceChat({
  sessionId,
  onTranscription,
  onResponse,
  onError,
  disabled = false,
  className,
}: VoiceChatProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [selectedVoice, setSelectedVoice] = useState('nova');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType,
        });
        await sendAudioToServer(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setState('recording');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(message);
      onError?.(message);
    }
  }, [onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const sendAudioToServer = useCallback(
    async (audioBlob: Blob) => {
      setState('processing');

      try {
        const token = localStorage.getItem('dispotree_token');
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('sessionId', sessionId);
        formData.append('voice', selectedVoice);

        const response = await fetch(`${API_URL}/api/voice/chat`, {
          method: 'POST',
          body: formData,
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Voice chat failed');
        }

        // Notify about transcription
        if (data.transcription) {
          onTranscription?.(data.transcription);
        }

        // Notify about response
        if (data.response) {
          onResponse?.(data.response);
        }

        // Play audio response if enabled
        if (audioEnabled && data.audio) {
          setState('playing');
          await playAudio(data.audio);
        }

        setState('idle');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Voice chat failed';
        setError(message);
        onError?.(message);
        setState('idle');
      }
    },
    [sessionId, selectedVoice, audioEnabled, onTranscription, onResponse, onError]
  );

  const playAudio = useCallback((audioDataUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioDataUrl);
      audioRef.current = audio;

      audio.onended = () => {
        resolve();
      };

      audio.onerror = () => {
        reject(new Error('Failed to play audio'));
      };

      audio.play().catch(reject);
    });
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState('idle');
    }
  }, []);

  const handleClick = useCallback(() => {
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'playing') {
      stopAudio();
    } else if (state === 'idle') {
      startRecording();
    }
  }, [state, startRecording, stopRecording, stopAudio]);

  const getButtonContent = () => {
    switch (state) {
      case 'recording':
        return (
          <>
            <Square className="h-4 w-4 mr-2 animate-pulse" />
            <span className="animate-pulse">Recording...</span>
          </>
        );
      case 'processing':
        return (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        );
      case 'playing':
        return (
          <>
            <Volume2 className="h-4 w-4 mr-2 animate-pulse" />
            Playing...
          </>
        );
      default:
        return (
          <>
            <Mic className="h-4 w-4 mr-2" />
            Voice Chat
          </>
        );
    }
  };

  const getButtonVariant = () => {
    switch (state) {
      case 'recording':
        return 'destructive';
      case 'playing':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <TooltipProvider>
      <div className={cn('flex items-center gap-2', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={getButtonVariant()}
              onClick={handleClick}
              disabled={disabled || state === 'processing'}
              className={cn(
                'min-w-[140px] transition-all',
                state === 'recording' && 'ring-2 ring-red-500 ring-offset-2'
              )}
            >
              {getButtonContent()}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {state === 'idle' && 'Click to start voice chat'}
            {state === 'recording' && 'Click to stop recording'}
            {state === 'processing' && 'Processing your voice...'}
            {state === 'playing' && 'Click to stop playback'}
          </TooltipContent>
        </Tooltip>

        {/* Audio toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={cn(!audioEnabled && 'text-muted-foreground')}
            >
              {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {audioEnabled ? 'Mute voice responses' : 'Enable voice responses'}
          </TooltipContent>
        </Tooltip>

        {/* Voice selector */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Voice settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Voice Selection</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {VOICES.map((voice) => (
              <DropdownMenuItem
                key={voice.id}
                onClick={() => setSelectedVoice(voice.id)}
                className={cn(selectedVoice === voice.id && 'bg-accent')}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{voice.name}</span>
                  <span className="text-xs text-muted-foreground">{voice.description}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {error && (
          <span className="text-destructive text-sm">{error}</span>
        )}
      </div>
    </TooltipProvider>
  );
}

// Compact version - just the mic button
export function VoiceChatButton({
  sessionId,
  onTranscription,
  onResponse,
  onError,
  disabled = false,
  className,
}: VoiceChatProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [selectedVoice] = useState('nova');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        await sendAudio(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setState('recording');
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const sendAudio = async (audioBlob: Blob) => {
    setState('processing');

    try {
      const token = localStorage.getItem('dispotree_token');
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('sessionId', sessionId);
      formData.append('voice', selectedVoice);

      const response = await fetch(`${API_URL}/api/voice/chat`, {
        method: 'POST',
        body: formData,
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      const data = await response.json();

      if (!data.success) throw new Error(data.error);

      if (data.transcription) onTranscription?.(data.transcription);
      if (data.response) onResponse?.(data.response);

      if (data.audio) {
        setState('playing');
        const audio = new Audio(data.audio);
        audioRef.current = audio;
        audio.onended = () => setState('idle');
        await audio.play();
      } else {
        setState('idle');
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Voice chat failed');
      setState('idle');
    }
  };

  const handleClick = () => {
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'playing') {
      if (audioRef.current) {
        audioRef.current.pause();
        setState('idle');
      }
    } else if (state === 'idle') {
      startRecording();
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={state === 'recording' ? 'destructive' : 'ghost'}
            size="icon"
            onClick={handleClick}
            disabled={disabled || state === 'processing'}
            className={cn(
              'relative',
              state === 'recording' && 'animate-pulse',
              className
            )}
          >
            {state === 'processing' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : state === 'playing' ? (
              <Volume2 className="h-4 w-4 animate-pulse" />
            ) : state === 'recording' ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {state === 'recording' && (
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-ping" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {state === 'idle' && 'Voice chat'}
          {state === 'recording' && 'Stop recording'}
          {state === 'processing' && 'Processing...'}
          {state === 'playing' && 'Stop playback'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default VoiceChat;
