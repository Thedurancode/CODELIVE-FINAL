"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Loader2,
  AudioWaveform,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RealtimeVoiceProps {
  onTranscription?: (text: string, role: "user" | "assistant") => void;
  onUserSpeakingChange?: (speaking: boolean) => void;
  onAiSpeakingChange?: (speaking: boolean) => void;
  onError?: (error: string) => void;
  onConnectionChange?: (connected: boolean) => void;
  autoConnect?: boolean;
  className?: string;
}

type ConnectionState = "disconnected" | "connecting" | "connected";

export function RealtimeVoice({
  onTranscription,
  onUserSpeakingChange,
  onAiSpeakingChange,
  onError,
  onConnectionChange,
  autoConnect = false,
  className,
}: RealtimeVoiceProps) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const prevAutoConnectRef = useRef(false);

  // Refs to avoid stale closures in WebSocket handler
  const isSpeakerMutedRef = useRef(isSpeakerMuted);
  const currentTranscriptRef = useRef(currentTranscript);
  const onTranscriptionRef = useRef(onTranscription);
  const onUserSpeakingChangeRef = useRef(onUserSpeakingChange);
  const onAiSpeakingChangeRef = useRef(onAiSpeakingChange);
  const onErrorRef = useRef(onError);
  const onConnectionChangeRef = useRef(onConnectionChange);

  // Keep refs in sync with state/props
  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted;
  }, [isSpeakerMuted]);
  useEffect(() => {
    currentTranscriptRef.current = currentTranscript;
  }, [currentTranscript]);
  useEffect(() => {
    onTranscriptionRef.current = onTranscription;
  }, [onTranscription]);
  useEffect(() => {
    onUserSpeakingChangeRef.current = onUserSpeakingChange;
  }, [onUserSpeakingChange]);
  useEffect(() => {
    onAiSpeakingChangeRef.current = onAiSpeakingChange;
  }, [onAiSpeakingChange]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (typeof window === "undefined") return null;

    // First try localStorage
    const localToken = localStorage.getItem("dispotree_token");
    if (localToken) {
      console.log("[RealtimeVoice] Using token from localStorage");
      return localToken;
    }

    // Try Supabase session
    try {
      const { supabase } = await import("@/lib/supabase");
      if (supabase?.auth) {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          console.log("[RealtimeVoice] Using token from Supabase session");
          return data.session.access_token;
        }
      }
    } catch (e) {
      console.warn("[RealtimeVoice] Supabase auth not available:", e);
    }

    // Try cookie
    const match = document.cookie.match(/dispotree_token=([^;]+)/);
    if (match) {
      console.log("[RealtimeVoice] Using token from cookie");
      return match[1];
    }

    return null;
  }, []);

  const connect = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      console.error("[RealtimeVoice] No auth token found");
      onError?.("Not authenticated. Please log in.");
      return;
    }

    setConnectionState("connecting");
    console.log("[RealtimeVoice] Starting connection...");
    console.log("[RealtimeVoice] Token found:", token.substring(0, 20) + "...");

    try {
      // Create audio context
      console.log("[RealtimeVoice] Creating audio context...");
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });

      // Get microphone access
      console.log("[RealtimeVoice] Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      console.log("[RealtimeVoice] Microphone access granted");

      // Connect to WebSocket - use backend API URL
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const wsUrl =
        apiUrl.replace(/^http/, "ws") +
        `/ws/voice?token=${encodeURIComponent(token)}`;

      console.log(
        "[RealtimeVoice] Connecting to WebSocket:",
        wsUrl.replace(/token=[^&]+/, "token=***"),
      );

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[RealtimeVoice] WebSocket connected successfully");
        console.log(
          "[RealtimeVoice] WebSocket readyState after open:",
          ws.readyState,
        );
      };

      ws.onmessage = (event) => {
        handleServerMessage(JSON.parse(event.data));
      };

      ws.onerror = (event) => {
        console.error("[RealtimeVoice] WebSocket error event fired");
        console.error("[RealtimeVoice] WebSocket readyState:", ws.readyState);
        console.error("[RealtimeVoice] WebSocket URL was:", wsUrl.replace(/token=[^&]+/, "token=***"));
        // Note: Browser WebSocket error events don't contain useful information
        // The close event will have more details if the connection failed
      };

      ws.onclose = (event) => {
        console.log("[RealtimeVoice] WebSocket closed", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });

        // Provide helpful error messages based on close code
        let errorMessage = "Connection closed";
        if (!event.wasClean) {
          switch (event.code) {
            case 1006:
              errorMessage =
                "Connection failed. Make sure the backend server is running on port 3001.";
              break;
            case 1008:
              errorMessage =
                "Authentication failed. Please try logging in again.";
              break;
            case 1011:
              errorMessage = "Server error occurred.";
              break;
            default:
              errorMessage = `Connection closed unexpectedly (code: ${event.code})`;
          }
          onError?.(errorMessage);
        }

        setConnectionState("disconnected");
        onConnectionChange?.(false);
      };
    } catch (error) {
      console.error("[RealtimeVoice] Connection error:", error);

      // Handle specific permission errors
      let errorMessage = "Failed to connect";
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          errorMessage = "Microphone access denied. Please allow microphone permission in your browser settings and try again.";
        } else if (error.name === "NotFoundError") {
          errorMessage = "No microphone found. Please connect a microphone and try again.";
        } else if (error.name === "NotReadableError") {
          errorMessage = "Microphone is in use by another application. Please close other apps using the microphone.";
        } else {
          errorMessage = error.message;
        }
      }

      onError?.(errorMessage);
      setConnectionState("disconnected");
    }
  }, [getAuthToken, onError, onConnectionChange]);

  const disconnect = useCallback(() => {
    // Stop audio processing
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState("disconnected");
    setIsListening(false);
    setIsSpeaking(false);
    setCurrentTranscript("");
    onConnectionChangeRef.current?.(false);
    onUserSpeakingChangeRef.current?.(false);
    onAiSpeakingChangeRef.current?.(false);
  }, []);

  useEffect(() => {
    const prevAutoConnect = prevAutoConnectRef.current;

    if (autoConnect && !prevAutoConnect && connectionState === "disconnected") {
      connect();
    } else if (
      !autoConnect &&
      prevAutoConnect &&
      (connectionState === "connected" || connectionState === "connecting")
    ) {
      disconnect();
    }

    prevAutoConnectRef.current = autoConnect;
  }, [autoConnect, connectionState, connect, disconnect]);

  const startAudioCapture = useCallback(() => {
    if (!audioContextRef.current || !streamRef.current || !wsRef.current)
      return;

    const audioContext = audioContextRef.current;
    const source = audioContext.createMediaStreamSource(streamRef.current);
    sourceRef.current = source;

    // Create processor for capturing audio
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (isMuted || wsRef.current?.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // Convert Float32 to Int16 PCM
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Convert to base64 and send
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));

      wsRef.current?.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64,
        }),
      );
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  }, [isMuted]);

  const playAudioDelta = useCallback((base64Audio: string) => {
    if (!audioContextRef.current) return;

    // Decode base64 to Int16 PCM
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }

    playbackQueueRef.current.push(float32);

    if (!isPlayingRef.current) {
      playNextChunk();
    }
  }, []);

  const playNextChunk = useCallback(() => {
    if (!audioContextRef.current || playbackQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const chunk = playbackQueueRef.current.shift()!;

    const audioBuffer = audioContextRef.current.createBuffer(
      1,
      chunk.length,
      24000,
    );
    audioBuffer.getChannelData(0).set(chunk);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => playNextChunk();
    source.start();
  }, []);

  const handleServerMessage = useCallback(
    (message: any) => {
      console.log("[RealtimeVoice] Received message:", message.type);

      switch (message.type) {
        case "connection.acknowledged":
          console.log(
            "[RealtimeVoice] Connection acknowledged by server, session:",
            message.sessionId,
          );
          break;

        case "session.ready":
          console.log("[RealtimeVoice] Session ready");
          setConnectionState("connected");
          onConnectionChangeRef.current?.(true);
          startAudioCapture();
          break;

        case "input_audio_buffer.speech_started":
          setIsListening(true);
          onUserSpeakingChangeRef.current?.(true);
          break;

        case "input_audio_buffer.speech_stopped":
          setIsListening(false);
          onUserSpeakingChangeRef.current?.(false);
          break;

        case "conversation.item.input_audio_transcription.completed":
          if (message.transcript) {
            onTranscriptionRef.current?.(message.transcript, "user");
          }
          break;

        case "response.audio_transcript.delta":
          if (message.delta) {
            setCurrentTranscript((prev) => prev + message.delta);
          }
          break;

        case "response.audio_transcript.done":
          // Use ref to get current value
          const transcript = currentTranscriptRef.current;
          if (transcript) {
            onTranscriptionRef.current?.(transcript, "assistant");
            setCurrentTranscript("");
          }
          break;

        case "response.audio.delta":
          // Use ref to get current value
          if (message.delta && !isSpeakerMutedRef.current) {
            playAudioDelta(message.delta);
          }
          break;

        case "response.audio.done":
          setIsSpeaking(false);
          onAiSpeakingChangeRef.current?.(false);
          break;

        case "response.created":
          setIsSpeaking(true);
          onAiSpeakingChangeRef.current?.(true);
          break;

        case "error":
          console.error("[RealtimeVoice] Server error:", message.error);
          const errorMsg =
            typeof message.error === "string"
              ? message.error
              : message.error?.message || "Server error";
          onErrorRef.current?.(errorMsg);
          break;

        case "session.closed":
          console.log(
            "[RealtimeVoice] Session closed by server:",
            message.code,
            message.reason,
          );
          setConnectionState("disconnected");
          onConnectionChangeRef.current?.(false);
          break;
      }
    },
    [startAudioCapture, playAudioDelta],
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerMuted((prev) => !prev);
  }, []);

  const handleToggleConnection = useCallback(() => {
    if (connectionState === "connected") {
      disconnect();
    } else if (connectionState === "disconnected") {
      connect();
    }
  }, [connectionState, connect, disconnect]);

  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <div className="flex flex-col items-center gap-4">
          {/* Status indicator */}
          <div className="flex items-center gap-2 text-sm">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                connectionState === "connected" && "bg-green-500",
                connectionState === "connecting" &&
                  "bg-yellow-500 animate-pulse",
                connectionState === "disconnected" && "bg-gray-400",
              )}
            />
            <span className="text-muted-foreground">
              {connectionState === "connected" && "Connected"}
              {connectionState === "connecting" && "Connecting..."}
              {connectionState === "disconnected" && "Disconnected"}
            </span>
          </div>

          {/* Voice activity indicator */}
          {connectionState === "connected" && (
            <div className="flex items-center gap-4">
              {isListening && (
                <div className="flex items-center gap-2 text-blue-500">
                  <AudioWaveform className="h-4 w-4 animate-pulse" />
                  <span className="text-sm">Listening...</span>
                </div>
              )}
              {isSpeaking && (
                <div className="flex items-center gap-2 text-green-500">
                  <Volume2 className="h-4 w-4 animate-pulse" />
                  <span className="text-sm">Speaking...</span>
                </div>
              )}
              {!isListening && !isSpeaking && (
                <span className="text-sm text-muted-foreground">
                  Ready - start talking
                </span>
              )}
            </div>
          )}

          {/* Current transcript */}
          {currentTranscript && (
            <div className="w-full p-2 bg-secondary rounded text-sm text-muted-foreground">
              {currentTranscript}
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Main call button */}
            <Button
              size="lg"
              variant={
                connectionState === "connected" ? "destructive" : "default"
              }
              onClick={handleToggleConnection}
              disabled={connectionState === "connecting"}
              className={cn(
                "w-14 h-14 rounded-full",
                connectionState === "connected" && "animate-pulse",
              )}
            >
              {connectionState === "connecting" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : connectionState === "connected" ? (
                <PhoneOff className="h-6 w-6" />
              ) : (
                <Phone className="h-6 w-6" />
              )}
            </Button>

            {/* Mute button */}
            {connectionState === "connected" && (
              <>
                <Button
                  size="icon"
                  variant={isMuted ? "destructive" : "secondary"}
                  onClick={toggleMute}
                  className="rounded-full"
                >
                  {isMuted ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>

                {/* Speaker button */}
                <Button
                  size="icon"
                  variant={isSpeakerMuted ? "destructive" : "secondary"}
                  onClick={toggleSpeaker}
                  className="rounded-full"
                >
                  {isSpeakerMuted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Instructions */}
          {connectionState === "disconnected" && (
            <p className="text-xs text-muted-foreground text-center">
              Click the phone button to start a voice conversation with
              DispoBot.
              <br />
              You can ask about deals, create contacts, check pipeline status,
              and more.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default RealtimeVoice;
