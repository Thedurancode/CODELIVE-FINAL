'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorOff,
  PhoneOff,
  Users,
  MessageSquare,
  Maximize2,
  Minimize2,
  Grid,
  LayoutGrid,
  Loader2,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Meeting } from '@/types';

// Note: For full Daily.co integration, install:
// npm install @daily-co/daily-js @daily-co/daily-react

interface VideoRoomProps {
  meeting: Meeting;
  token: string;
  roomUrl: string;
  onLeave?: () => void;
  className?: string;
  initialVideoEnabled?: boolean;
  initialAudioEnabled?: boolean;
}

interface Participant {
  id: string;
  name: string;
  isSpeaking: boolean;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
  isLocal: boolean;
}

export function VideoRoom({
  meeting,
  token,
  roomUrl,
  onLeave,
  className,
  initialVideoEnabled = true,
  initialAudioEnabled = true,
}: VideoRoomProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Local media controls
  const [isVideoEnabled, setIsVideoEnabled] = useState(initialVideoEnabled);
  const [isAudioEnabled, setIsAudioEnabled] = useState(initialAudioEnabled);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // UI state
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'speaker'>('grid');

  // Daily.co call frame ref
  const callFrameRef = useRef<HTMLIFrameElement>(null);
  const dailyRef = useRef<any>(null);

  // Mock participants (in real implementation, this comes from Daily.co events)
  const [participants, setParticipants] = useState<Participant[]>([
    {
      id: 'local',
      name: 'You',
      isSpeaking: false,
      isVideoEnabled: true,
      isAudioEnabled: true,
      isScreenSharing: false,
      isLocal: true,
    },
  ]);

  // Connect to Daily.co room
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let mounted = true;

    const connectToRoom = () => {
      setIsConnecting(true);
      setConnectionError(null);

      try {
        // Build Daily.co room URL with parameters
        // Daily.co prebuilt UI accepts: t (token), cam (on/off), mic (on/off)
        const params = new URLSearchParams();
        params.set('t', token);
        if (!initialVideoEnabled) params.set('cam', 'off');
        if (!initialAudioEnabled) params.set('mic', 'off');

        const joinUrl = `${roomUrl}?${params.toString()}`;
        console.log('[VideoRoom] Joining Daily.co room:', joinUrl);

        // Set iframe src to join the room
        if (callFrameRef.current) {
          callFrameRef.current.src = joinUrl;

          // Listen for iframe load event
          callFrameRef.current.onload = () => {
            if (mounted) {
              console.log('[VideoRoom] Daily.co iframe loaded');
              setIsConnected(true);
              setIsConnecting(false);
            }
          };

          callFrameRef.current.onerror = () => {
            if (mounted) {
              console.error('[VideoRoom] Daily.co iframe failed to load');
              setConnectionError('Failed to load video room');
              setIsConnecting(false);
            }
          };
        }

        // Fallback timeout in case onload doesn't fire (cross-origin iframes may not trigger it)
        timeoutId = setTimeout(() => {
          if (mounted) {
            setIsConnected(true);
            setIsConnecting(false);
          }
        }, 3000);
      } catch (error) {
        console.error('Failed to connect to meeting room:', error);
        if (mounted) {
          setConnectionError('Failed to connect to meeting room');
          setIsConnecting(false);
          setIsConnected(false);
        }
      }
    };

    if (token && roomUrl) {
      connectToRoom();
    }

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      // Cleanup: leave the room
      if (dailyRef.current) {
        dailyRef.current.leave();
        dailyRef.current.destroy();
      }
      // Clear iframe src on unmount
      if (callFrameRef.current) {
        callFrameRef.current.src = '';
      }
    };
  }, [token, roomUrl, initialVideoEnabled, initialAudioEnabled]);

  const toggleVideo = useCallback(() => {
    setIsVideoEnabled((prev) => !prev);
    if (dailyRef.current) {
      dailyRef.current.setLocalVideo(!isVideoEnabled);
    }
  }, [isVideoEnabled]);

  const toggleAudio = useCallback(() => {
    setIsAudioEnabled((prev) => !prev);
    if (dailyRef.current) {
      dailyRef.current.setLocalAudio(!isAudioEnabled);
    }
  }, [isAudioEnabled]);

  const toggleScreenShare = useCallback(async () => {
    if (dailyRef.current) {
      if (isScreenSharing) {
        dailyRef.current.stopScreenShare();
      } else {
        dailyRef.current.startScreenShare();
      }
    }
    setIsScreenSharing((prev) => !prev);
  }, [isScreenSharing]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const handleLeave = useCallback(() => {
    if (dailyRef.current) {
      dailyRef.current.leave();
    }
    onLeave?.();
  }, [onLeave]);

  if (isConnecting) {
    return (
      <div className={cn('flex flex-col items-center justify-center min-h-[400px] bg-background', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Connecting to meeting...</p>
        <p className="text-sm text-muted-foreground mt-2">{meeting.title}</p>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className={cn('flex flex-col items-center justify-center min-h-[400px] bg-background', className)}>
        <PhoneOff className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive font-medium">{connectionError}</p>
        <Button variant="outline" className="mt-4" onClick={onLeave}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-black relative', className)}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-3">
          <h2 className="text-white font-medium">{meeting.title}</h2>
          <Badge variant="outline" className="border-green-500 text-green-500">
            Live
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={() => setShowParticipants(!showParticipants)}
                >
                  <Users className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Participants</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={() => setShowChat(!showChat)}
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Chat</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={() => setLayout(layout === 'grid' ? 'speaker' : 'grid')}
                >
                  {layout === 'grid' ? (
                    <LayoutGrid className="h-5 w-5" />
                  ) : (
                    <Grid className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{layout === 'grid' ? 'Speaker View' : 'Grid View'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-5 w-5" />
                  ) : (
                    <Maximize2 className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Daily.co Embedded Frame */}
      <div className="absolute inset-0 pt-16 pb-20 px-2">
        <iframe
          ref={callFrameRef}
          className="w-full h-full border-0 rounded-lg bg-black"
          allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
          title="Video Meeting"
        />
      </div>

      {/* Controls Bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="lg"
                variant={isAudioEnabled ? 'secondary' : 'destructive'}
                className="rounded-full h-12 w-12"
                onClick={toggleAudio}
              >
                {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isAudioEnabled ? 'Mute' : 'Unmute'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="lg"
                variant={isVideoEnabled ? 'secondary' : 'destructive'}
                className="rounded-full h-12 w-12"
                onClick={toggleVideo}
              >
                {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="lg"
                variant={isScreenSharing ? 'default' : 'secondary'}
                className="rounded-full h-12 w-12"
                onClick={toggleScreenShare}
              >
                {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isScreenSharing ? 'Stop sharing' : 'Share screen'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="w-px h-8 bg-white/20 mx-2" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="lg"
                variant="destructive"
                className="rounded-full h-12 w-12"
                onClick={handleLeave}
              >
                <PhoneOff className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Leave meeting</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Participants Sidebar */}
      {showParticipants && (
        <div className="absolute right-0 top-0 bottom-0 w-72 bg-background border-l z-20">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Participants ({participants.length})</h3>
              <Button size="icon" variant="ghost" onClick={() => setShowParticipants(false)}>
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {participant.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm">
                    {participant.isLocal ? 'You' : participant.name}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {!participant.isAudioEnabled && <MicOff className="h-4 w-4 text-muted-foreground" />}
                  {!participant.isVideoEnabled && <VideoOff className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Sidebar */}
      {showChat && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-background border-l z-20 flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Chat</h3>
              <Button size="icon" variant="ghost" onClick={() => setShowChat(false)}>
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            <p className="text-sm text-muted-foreground text-center py-8">
              Chat is available in the Daily.co call frame
            </p>
          </div>
        </div>
      )}

      {/* Branding - Logo */}
      {meeting.room?.logoUrl && (
        <div className="absolute top-4 right-4 z-20">
          <img
            src={meeting.room.logoUrl}
            alt="Logo"
            className="h-10 max-w-[150px] object-contain drop-shadow-lg"
          />
        </div>
      )}

      {/* Welcome Message Toast */}
      {meeting.room?.welcomeMessage && isConnected && !connectionError && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 max-w-md">
          <div className="bg-background/90 backdrop-blur-sm border rounded-lg px-4 py-3 shadow-lg">
            <p className="text-sm text-center">{meeting.room.welcomeMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Pre-join component for testing audio/video before joining
export function VideoRoomPreJoin({
  meeting,
  onJoin,
  onCancel,
  isLoading = false,
  initialName = '',
  initialEmail = '',
}: {
  meeting: Meeting;
  onJoin: (name: string, email: string, videoEnabled: boolean, audioEnabled: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
  initialName?: string;
  initialEmail?: string;
}) {
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    // Get user media for preview
    const getMedia = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: isVideoEnabled,
          audio: isAudioEnabled,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (error) {
        console.error('Failed to get media devices:', error);
      }
    };

    if (isVideoEnabled) {
      getMedia();
    }

    return () => {
      // Stop all tracks when unmounting
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [isVideoEnabled, isAudioEnabled]);

  const handleJoin = () => {
    stream?.getTracks().forEach((track) => track.stop());
    onJoin(name || 'Guest', email || '', isVideoEnabled, isAudioEnabled);
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-background rounded-lg border">
      {/* Logo */}
      {meeting.room?.logoUrl && (
        <div className="flex justify-center mb-4">
          <img
            src={meeting.room.logoUrl}
            alt="Logo"
            className="h-10 max-w-[200px] object-contain"
          />
        </div>
      )}

      <h2 className="text-xl font-semibold mb-4 text-center">{meeting.title}</h2>

      {/* Welcome Message */}
      {meeting.room?.welcomeMessage && (
        <p className="text-sm text-muted-foreground text-center mb-4">
          {meeting.room.welcomeMessage}
        </p>
      )}

      {/* Video preview */}
      <div className="aspect-video bg-muted rounded-lg mb-4 flex items-center justify-center overflow-hidden">
        {isVideoEnabled ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover mirror"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <VideoOff className="h-12 w-12" />
            <span>Camera off</span>
          </div>
        )}
      </div>

      {/* Name/Email inputs */}
      <div className="space-y-3 mb-4">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-4 mb-6">
        <Button
          variant={isAudioEnabled ? 'secondary' : 'outline'}
          className="gap-2"
          onClick={() => setIsAudioEnabled(!isAudioEnabled)}
        >
          {isAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          {isAudioEnabled ? 'Mute' : 'Unmute'}
        </Button>
        <Button
          variant={isVideoEnabled ? 'secondary' : 'outline'}
          className="gap-2"
          onClick={() => setIsVideoEnabled(!isVideoEnabled)}
        >
          {isVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          {isVideoEnabled ? 'Stop Video' : 'Start Video'}
        </Button>
      </div>

      {/* Join button */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={handleJoin}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Joining...
            </>
          ) : (
            'Join Meeting'
          )}
        </Button>
      </div>
    </div>
  );
}
