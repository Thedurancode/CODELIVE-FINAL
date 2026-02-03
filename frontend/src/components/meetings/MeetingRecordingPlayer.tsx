'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Download,
  Loader2,
  FileText,
  Video,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMeetingRecording, useMeetingTranscription } from '@/hooks/use-meetings';

// =============================================================================
// TYPES
// =============================================================================

export interface TranscriptCue {
  id: string;
  startTime: number; // seconds
  endTime: number; // seconds
  text: string;
  speaker?: string;
}

interface MeetingRecordingPlayerProps {
  meetingId: string;
  meetingTitle?: string;
  className?: string;
  showTranscript?: boolean;
}

// =============================================================================
// VTT PARSER
// =============================================================================

function parseWebVTT(vttContent: string): TranscriptCue[] {
  const lines = vttContent.split('\n');
  const cues: TranscriptCue[] = [];
  let currentCue: Partial<TranscriptCue> | null = null;
  let cueIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip WebVTT header and empty lines
    if (line === 'WEBVTT' || line === '' || line.startsWith('NOTE')) {
      if (currentCue && currentCue.text) {
        cues.push(currentCue as TranscriptCue);
        currentCue = null;
      }
      continue;
    }

    // Check for timestamp line (00:00:00.000 --> 00:00:05.000)
    const timestampMatch = line.match(
      /^(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})/
    );

    if (timestampMatch) {
      // Save previous cue if exists
      if (currentCue && currentCue.text) {
        cues.push(currentCue as TranscriptCue);
      }

      // Parse start time
      const startHours = timestampMatch[1] ? parseInt(timestampMatch[1]) : 0;
      const startMinutes = parseInt(timestampMatch[2]);
      const startSeconds = parseInt(timestampMatch[3]);
      const startMs = parseInt(timestampMatch[4]);
      const startTime = startHours * 3600 + startMinutes * 60 + startSeconds + startMs / 1000;

      // Parse end time
      const endHours = timestampMatch[5] ? parseInt(timestampMatch[5]) : 0;
      const endMinutes = parseInt(timestampMatch[6]);
      const endSeconds = parseInt(timestampMatch[7]);
      const endMs = parseInt(timestampMatch[8]);
      const endTime = endHours * 3600 + endMinutes * 60 + endSeconds + endMs / 1000;

      currentCue = {
        id: `cue-${cueIndex++}`,
        startTime,
        endTime,
        text: '',
      };
      continue;
    }

    // Check for cue number (skip it)
    if (/^\d+$/.test(line)) {
      continue;
    }

    // This is content text
    if (currentCue) {
      // Check for speaker tag like <v Speaker Name>
      const speakerMatch = line.match(/^<v\s+([^>]+)>(.*)$/);
      if (speakerMatch) {
        currentCue.speaker = speakerMatch[1];
        const text = speakerMatch[2].replace(/<[^>]+>/g, '').trim();
        currentCue.text = currentCue.text ? `${currentCue.text} ${text}` : text;
      } else {
        // Remove any remaining tags
        const cleanText = line.replace(/<[^>]+>/g, '').trim();
        if (cleanText) {
          currentCue.text = currentCue.text ? `${currentCue.text} ${cleanText}` : cleanText;
        }
      }
    }
  }

  // Add final cue if exists
  if (currentCue && currentCue.text) {
    cues.push(currentCue as TranscriptCue);
  }

  return cues;
}

function parseTimestampedTranscript(transcript: string): TranscriptCue[] {
  // For plain text transcripts without timestamps, create segments
  // Group by speaker if available, otherwise by sentences
  const cues: TranscriptCue[] = [];

  // Check if it has speaker labels like "John: Hello"
  const speakerPattern = /^([A-Za-z\s]+):\s*(.+)$/gm;
  let match;
  let cueIndex = 0;
  let currentTime = 0;
  const avgSecondsPerWord = 0.4; // Approximate speaking rate

  while ((match = speakerPattern.exec(transcript)) !== null) {
    const speaker = match[1].trim();
    const text = match[2].trim();
    const wordCount = text.split(/\s+/).length;
    const duration = wordCount * avgSecondsPerWord;

    cues.push({
      id: `cue-${cueIndex++}`,
      startTime: currentTime,
      endTime: currentTime + duration,
      text,
      speaker,
    });

    currentTime += duration;
  }

  // If no speaker pattern found, split by sentences
  if (cues.length === 0) {
    const sentences = transcript.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const text = sentence.trim();
      if (!text) continue;

      const wordCount = text.split(/\s+/).length;
      const duration = Math.max(wordCount * avgSecondsPerWord, 2);

      cues.push({
        id: `cue-${cueIndex++}`,
        startTime: currentTime,
        endTime: currentTime + duration,
        text,
      });

      currentTime += duration;
    }
  }

  return cues;
}

// =============================================================================
// TIME FORMATTING
// =============================================================================

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function MeetingRecordingPlayer({
  meetingId,
  meetingTitle,
  className,
  showTranscript = true,
}: MeetingRecordingPlayerProps) {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [transcriptCues, setTranscriptCues] = useState<TranscriptCue[]>([]);
  const [isLoadingVtt, setIsLoadingVtt] = useState(false);

  // Queries
  const { data: recording, isLoading: isLoadingRecording } = useMeetingRecording(meetingId);
  const { data: transcription, isLoading: isLoadingTranscription } = useMeetingTranscription(meetingId);

  // Get video URL (prefer Wasabi, fall back to Daily)
  const videoUrl = useMemo(() => {
    if (!recording) return null;
    return recording.wasabiRecordingUrl || recording.dailyRecordingUrl || recording.recordingUrl;
  }, [recording]);

  // Load transcript cues
  useEffect(() => {
    async function loadTranscript() {
      if (!transcription) return;

      // If we have a VTT URL, fetch and parse it
      const vttUrl = (transcription as any).vttUrl;
      if (vttUrl) {
        setIsLoadingVtt(true);
        try {
          const response = await fetch(vttUrl);
          if (response.ok) {
            const vttContent = await response.text();
            const cues = parseWebVTT(vttContent);
            setTranscriptCues(cues);
          }
        } catch (error) {
          console.error('Failed to load VTT:', error);
        } finally {
          setIsLoadingVtt(false);
        }
        return;
      }

      // If we have plain text transcript, parse it
      if (transcription.transcript) {
        const cues = parseTimestampedTranscript(transcription.transcript);
        setTranscriptCues(cues);
      }
    }

    loadTranscript();
  }, [transcription]);

  // Update active cue based on current time
  useEffect(() => {
    const activeCue = transcriptCues.find(
      (cue) => currentTime >= cue.startTime && currentTime <= cue.endTime
    );
    setActiveCueId(activeCue?.id || null);
  }, [currentTime, transcriptCues]);

  // Auto-scroll to active cue
  useEffect(() => {
    if (activeCueId && transcriptContainerRef.current) {
      const activeElement = transcriptContainerRef.current.querySelector(
        `[data-cue-id="${activeCueId}"]`
      );
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [activeCueId]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  // Controls
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  }, [isPlaying]);

  const handleSeek = useCallback((value: number[]) => {
    if (videoRef.current && value.length > 0) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  }, []);

  const handleVolumeChange = useCallback((value: number[]) => {
    if (videoRef.current && value.length > 0) {
      const newVolume = value[0];
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  const skipBack = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
    }
  }, []);

  const skipForward = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10);
    }
  }, [duration]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      videoRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const seekToCue = useCallback((cue: TranscriptCue) => {
    if (videoRef.current) {
      videoRef.current.currentTime = cue.startTime;
      setCurrentTime(cue.startTime);
      if (!isPlaying) {
        videoRef.current.play();
      }
    }
  }, [isPlaying]);

  const handleDownload = useCallback(() => {
    if (videoUrl) {
      window.open(videoUrl, '_blank');
    }
  }, [videoUrl]);

  // Loading state
  if (isLoadingRecording || isLoadingTranscription) {
    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-2 flex-1" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No recording available
  if (!recording?.hasRecording || !videoUrl) {
    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            {meetingTitle || 'Meeting Recording'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No Recording Available</p>
            <p className="text-sm mt-1">
              This meeting was not recorded or the recording is not yet available.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasTranscript = transcriptCues.length > 0 || transcription?.transcript;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            {meetingTitle || 'Meeting Recording'}
          </CardTitle>
          <div className="flex items-center gap-2">
            {recording.storageSource && (
              <Badge variant="outline" className="text-xs">
                {recording.storageSource === 'wasabi' ? 'Archived' : 'Daily.co'}
              </Badge>
            )}
            {transcription?.status === 'completed' && (
              <Badge variant="secondary" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                Transcribed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className={cn('flex', showTranscript && hasTranscript ? 'flex-col lg:flex-row' : '')}>
          {/* Video Player */}
          <div className={cn('flex-1', showTranscript && hasTranscript ? 'lg:w-2/3' : '')}>
            <div className="relative bg-black">
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full aspect-video"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={handlePlay}
                onPause={handlePause}
                onEnded={handleEnded}
                playsInline
              />

              {/* Video Controls Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                {/* Progress Bar */}
                <div className="mb-3">
                  <Slider
                    value={[currentTime]}
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    onValueChange={handleSeek}
                    className="cursor-pointer"
                  />
                </div>

                {/* Controls Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-white hover:bg-white/20"
                      onClick={togglePlay}
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-white hover:bg-white/20"
                      onClick={skipBack}
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-white hover:bg-white/20"
                      onClick={skipForward}
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>

                    <div className="flex items-center gap-2 ml-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-white hover:bg-white/20"
                        onClick={toggleMute}
                      >
                        {isMuted ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                      <div className="w-20 hidden sm:block">
                        <Slider
                          value={[isMuted ? 0 : volume]}
                          min={0}
                          max={1}
                          step={0.1}
                          onValueChange={handleVolumeChange}
                          className="cursor-pointer"
                        />
                      </div>
                    </div>

                    <span className="text-white text-sm ml-2">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-white hover:bg-white/20"
                      onClick={handleDownload}
                      title="Download recording"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-white hover:bg-white/20"
                      onClick={toggleFullscreen}
                    >
                      {isFullscreen ? (
                        <Minimize className="h-4 w-4" />
                      ) : (
                        <Maximize className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Transcript Panel */}
          {showTranscript && hasTranscript && (
            <div className={cn('border-t lg:border-t-0 lg:border-l', 'lg:w-1/3')}>
              <div className="p-3 border-b bg-muted/50">
                <h3 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Transcript
                </h3>
              </div>

              {isLoadingVtt ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : transcriptCues.length > 0 ? (
                <ScrollArea className="h-[400px] lg:h-[calc(100vh-20rem)]">
                  <div ref={transcriptContainerRef} className="p-3 space-y-2">
                    {transcriptCues.map((cue) => (
                      <button
                        key={cue.id}
                        data-cue-id={cue.id}
                        onClick={() => seekToCue(cue)}
                        className={cn(
                          'w-full text-left p-2 rounded-lg transition-all',
                          'hover:bg-muted/80 cursor-pointer',
                          activeCueId === cue.id
                            ? 'bg-primary/10 border-l-2 border-primary'
                            : 'bg-transparent'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-muted-foreground font-mono shrink-0 pt-0.5">
                            {formatTime(cue.startTime)}
                          </span>
                          <div className="flex-1 min-w-0">
                            {cue.speaker && (
                              <span className="text-xs font-semibold text-primary block mb-0.5">
                                {cue.speaker}
                              </span>
                            )}
                            <p
                              className={cn(
                                'text-sm leading-relaxed',
                                activeCueId === cue.id
                                  ? 'text-foreground font-medium'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {cue.text}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              ) : transcription?.transcript ? (
                <ScrollArea className="h-[400px] lg:h-[calc(100vh-20rem)]">
                  <div className="p-4">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {transcription.transcript}
                    </p>
                  </div>
                </ScrollArea>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default MeetingRecordingPlayer;
