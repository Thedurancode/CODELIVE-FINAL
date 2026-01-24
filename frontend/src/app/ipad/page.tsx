'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTVRemoteController, generateRoomCode, type SlideConfig } from '@/hooks/use-tv-remote';

// Dynamically import Scanner to avoid SSR issues with camera APIs
const Scanner = dynamic(
  () => import('@yudiel/react-qr-scanner').then((mod) => mod.Scanner),
  { ssr: false }
);
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Maximize,
  RefreshCw,
  Sun,
  Monitor,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Tv,
  LayoutGrid,
  Sparkles,
  MessageSquare,
  GitCommit,
  Newspaper,
  Share,
  Plus,
  X,
  Trash2,
  GripVertical,
  Clock,
  Settings2,
  Power,
  Video,
  Youtube,
  Link2,
  Unlink,
  Copy,
  Check,
  Camera,
  QrCode,
} from 'lucide-react';

const SPEED_OPTIONS = [0.5, 1, 1.5, 2];

const AVAILABLE_SLIDE_TYPES = [
  { type: 'overview', label: 'All Projects', icon: LayoutGrid },
  { type: 'top3', label: 'Top 3 Projects', icon: LayoutGrid },
  { type: 'logo', label: 'Logo Animation', icon: Sparkles },
  { type: 'recent-commits', label: 'Recent Commits', icon: GitCommit },
  { type: 'recent-issues', label: 'GitHub Issues', icon: GitCommit },
  { type: 'hacker-news', label: 'Hacker News', icon: Newspaper },
  { type: 'reddit', label: 'Reddit Feed', icon: MessageSquare },
  { type: 'column-active', label: 'Active Column', icon: LayoutGrid },
  { type: 'column-on_hold', label: 'On Hold Column', icon: LayoutGrid },
  { type: 'column-completed', label: 'Completed Column', icon: LayoutGrid },
  { type: 'video', label: 'Video (MP4)', icon: Video, hasUrl: true },
  { type: 'youtube', label: 'YouTube Video', icon: Youtube, hasUrl: true },
];

const SLIDE_ICONS: Record<string, React.ReactNode> = {
  overview: <LayoutGrid className="h-6 w-6" />,
  logo: <Sparkles className="h-6 w-6" />,
  reddit: <MessageSquare className="h-6 w-6" />,
  'recent-commits': <GitCommit className="h-6 w-6" />,
  'recent-issues': <GitCommit className="h-6 w-6" />,
  'hacker-news': <Newspaper className="h-6 w-6" />,
  top3: <LayoutGrid className="h-6 w-6" />,
  video: <Video className="h-6 w-6" />,
  youtube: <Youtube className="h-6 w-6" />,
};

export default function IPadControllerPage() {
  // Room code for cross-device connection
  const [roomCode, setRoomCode] = useState<string | undefined>(undefined);
  const [roomInput, setRoomInput] = useState('');
  const [showRoomSetup, setShowRoomSetup] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    status,
    isConnected,
    connectionMode,
    roomInfo,
    next,
    prev,
    goTo,
    togglePause,
    toggleFullscreen,
    setSpeed,
    setBrightness,
    refresh,
    addSlide,
    removeSlide,
    updateSlide,
    reorderSlide,
    toggleSlideshow,
  } = useTVRemoteController(roomCode);

  const [showSettings, setShowSettings] = useState(false);
  const [showSlideManager, setShowSlideManager] = useState(false);
  const [showAddSlide, setShowAddSlide] = useState(false);
  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  // Load room code from URL query param or localStorage
  useEffect(() => {
    // Check URL for room code (from QR code scan)
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');

    if (roomFromUrl) {
      // Auto-connect from QR code
      const code = roomFromUrl.toUpperCase();
      setRoomCode(code);
      localStorage.setItem('tv-remote-room', code);
      // Clean up URL
      window.history.replaceState({}, '', '/ipad');
    } else {
      // Load from localStorage
      const savedRoom = localStorage.getItem('tv-remote-room');
      if (savedRoom) {
        setRoomCode(savedRoom);
      }
    }
  }, []);

  // Generate and set a new room code
  const createRoom = () => {
    const code = generateRoomCode();
    setRoomCode(code);
    localStorage.setItem('tv-remote-room', code);
    setShowRoomSetup(false);
  };

  // Join an existing room
  const joinRoom = () => {
    if (roomInput.length >= 4) {
      const code = roomInput.toUpperCase();
      setRoomCode(code);
      localStorage.setItem('tv-remote-room', code);
      setShowRoomSetup(false);
      setRoomInput('');
    }
  };

  // Disconnect from room (use BroadcastChannel only)
  const disconnectRoom = () => {
    setRoomCode(undefined);
    localStorage.removeItem('tv-remote-room');
  };

  // Copy room code to clipboard
  const copyRoomCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Handle QR code scan result
  const handleScanResult = (result: string) => {
    setScanError(null);

    // Try to extract room code from URL (e.g., /ipad?room=ABC123)
    try {
      const url = new URL(result);
      const roomFromUrl = url.searchParams.get('room');
      if (roomFromUrl) {
        const code = roomFromUrl.toUpperCase();
        setRoomCode(code);
        localStorage.setItem('tv-remote-room', code);
        setShowScanner(false);
        setShowRoomSetup(false);
        return;
      }
    } catch {
      // Not a URL, might be just the room code
    }

    // Check if it's just a room code (6 alphanumeric characters)
    const cleanCode = result.trim().toUpperCase();
    if (/^[A-Z0-9]{4,8}$/.test(cleanCode)) {
      setRoomCode(cleanCode);
      localStorage.setItem('tv-remote-room', cleanCode);
      setShowScanner(false);
      setShowRoomSetup(false);
      return;
    }

    setScanError('Invalid QR code. Please scan a TV remote QR code.');
  };

  // Detect if running as PWA
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Show install prompt if not standalone and not dismissed
    if (!standalone) {
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) {
        setShowInstallPrompt(true);
      }
    }
  }, []);

  const dismissInstallPrompt = () => {
    setShowInstallPrompt(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  const currentSpeed = status?.speed ?? 1;
  const currentBrightness = status?.brightness ?? 100;
  const isPaused = status?.isPaused ?? false;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 pb-safe select-none">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="https://i.ibb.co/nsx4Njzz/CODELIVE1.png" alt="CodeLive" className="h-10" />
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 rounded-xl">
            <Tv className="h-5 w-5 text-emerald-400" />
            <span className="text-lg font-semibold">Remote</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Room Code Badge */}
          {roomCode && (
            <button
              onClick={copyRoomCode}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 rounded-full hover:bg-blue-500/30 transition-colors"
            >
              {copied ? (
                <Check className="h-4 w-4 text-blue-400" />
              ) : (
                <Copy className="h-4 w-4 text-blue-400" />
              )}
              <span className="text-blue-400 font-mono font-medium text-sm">{roomCode}</span>
            </button>
          )}

          {/* Connection Status */}
          {isConnected ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 rounded-full">
              <Wifi className="h-5 w-5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">
                {connectionMode === 'websocket' ? 'Remote' : 'Local'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/20 rounded-full">
              <WifiOff className="h-5 w-5 text-red-400" />
              <span className="text-red-400 font-medium">Disconnected</span>
            </div>
          )}
        </div>
      </header>

      {/* Room Setup Card */}
      <div className="bg-zinc-900 rounded-2xl p-4 mb-6 border border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              roomCode ? 'bg-blue-500/20' : 'bg-zinc-800'
            }`}>
              {roomCode ? (
                <Link2 className="h-5 w-5 text-blue-400" />
              ) : (
                <Unlink className="h-5 w-5 text-zinc-500" />
              )}
            </div>
            <div>
              <p className="font-medium">
                {roomCode ? 'Cross-Device Mode' : 'Same-Device Mode'}
              </p>
              <p className="text-sm text-zinc-500">
                {roomCode
                  ? `Room: ${roomCode} ${roomInfo ? `(${roomInfo.remoteCount} remote${roomInfo.remoteCount !== 1 ? 's' : ''})` : ''}`
                  : 'Using BroadcastChannel for local tabs'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {roomCode ? (
              <button
                onClick={disconnectRoom}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-colors"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => setShowRoomSetup(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition-colors"
              >
                Connect Remote
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Room Setup Modal */}
      {showRoomSetup && !showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setShowRoomSetup(false)}>
          <div
            className="bg-zinc-900 rounded-2xl p-6 w-full max-w-md border border-zinc-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Connect to TV</h3>
              <button onClick={() => setShowRoomSetup(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scan QR Code - Primary Option */}
            <div className="mb-6">
              <button
                onClick={() => setShowScanner(true)}
                className="w-full py-5 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <Camera className="h-6 w-6" />
                Scan TV QR Code
              </button>
              <p className="text-xs text-zinc-500 mt-2 text-center">
                Point your camera at the QR code on the TV
              </p>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-700" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-zinc-900 px-4 text-sm text-zinc-500">or enter code manually</span>
              </div>
            </div>

            {/* Join Existing Room */}
            <div className="mb-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="Enter room code"
                  className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl font-mono text-lg tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={joinRoom}
                  disabled={roomInput.length < 4}
                  className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed rounded-xl font-semibold transition-colors"
                >
                  Join
                </button>
              </div>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-700" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-zinc-900 px-4 text-sm text-zinc-500">or create new</span>
              </div>
            </div>

            {/* Create New Room */}
            <div>
              <button
                onClick={createRoom}
                className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-semibold flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <Plus className="h-5 w-5" />
                Generate Room Code
              </button>
              <p className="text-xs text-zinc-500 mt-2 text-center">
                Share this code with the TV to connect
              </p>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-zinc-900/80 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <Camera className="h-6 w-6 text-blue-400" />
              <h3 className="text-lg font-bold">Scan QR Code</h3>
            </div>
            <button
              onClick={() => {
                setShowScanner(false);
                setScanError(null);
              }}
              className="p-2 hover:bg-zinc-800 rounded-lg"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Scanner */}
          <div className="flex-1 relative bg-zinc-900">
            <Scanner
              onScan={(result) => {
                if (result && result.length > 0) {
                  handleScanResult(result[0].rawValue);
                }
              }}
              onError={(error) => {
                console.error('Scanner error:', error);
                setScanError('Camera access denied or not available. Please allow camera access and try again.');
              }}
              constraints={{
                facingMode: 'environment', // Use back camera
              }}
              styles={{
                container: {
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                },
                video: {
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                },
              }}
              scanDelay={300}
            />

            {/* Scanning overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-64 border-2 border-blue-400 rounded-3xl relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-2xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-2xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-2xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-2xl" />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 bg-zinc-900/80 backdrop-blur-sm">
            {scanError ? (
              <div className="text-center">
                <p className="text-red-400 mb-4">{scanError}</p>
                <button
                  onClick={() => setScanError(null)}
                  className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-semibold"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <p className="text-center text-zinc-400">
                Point your camera at the QR code displayed on the TV
              </p>
            )}

            <button
              onClick={() => {
                setShowScanner(false);
                setScanError(null);
              }}
              className="w-full mt-4 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-semibold transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Status Display */}
      <div className="bg-zinc-900 rounded-2xl p-6 mb-6 border border-zinc-800">
        {!isConnected ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Tv className="h-8 w-8 text-zinc-500" />
            </div>
            <h2 className="text-xl font-bold mb-2 text-zinc-300">No TV Connected</h2>
            <p className="text-zinc-500 text-sm mb-4">
              Open the TV display in another browser tab to connect
            </p>
            <button
              onClick={() => window.open('/tv/projects', '_blank')}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold transition-all active:scale-95"
            >
              Open TV Display
            </button>
          </div>
        ) : (
        <div className="text-center">
          <p className="text-zinc-400 text-sm mb-1">Now Playing</p>
          <h2 className="text-3xl font-bold mb-2">
            {status?.currentSlideLabel || 'Unknown'}
          </h2>
          {status && (
            <p className="text-zinc-500">
              Slide {status.currentSlideIndex + 1} of {status.totalSlides}
            </p>
          )}
          <div className="mt-3 flex items-center justify-center gap-2">
            {isPaused ? (
              <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium">
                Paused
              </span>
            ) : (
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium">
                Playing
              </span>
            )}
            {status?.isFullscreen && (
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
                Fullscreen
              </span>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Navigation Controls - Big Buttons */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={prev}
          disabled={!isConnected}
          className="h-32 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-3xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border border-zinc-700"
        >
          <SkipBack className="h-12 w-12" />
          <span className="text-xl font-semibold">PREV</span>
        </button>
        <button
          onClick={next}
          disabled={!isConnected}
          className="h-32 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-3xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border border-zinc-700"
        >
          <SkipForward className="h-12 w-12" />
          <span className="text-xl font-semibold">NEXT</span>
        </button>
      </div>

      {/* Play/Pause - Giant Button */}
      <button
        onClick={togglePause}
        disabled={!isConnected}
        className={`w-full h-28 rounded-3xl flex items-center justify-center gap-4 transition-all active:scale-95 mb-6 border ${
          isPaused
            ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 border-emerald-500'
            : 'bg-amber-600 hover:bg-amber-500 active:bg-amber-400 border-amber-500'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isPaused ? (
          <>
            <Play className="h-10 w-10" />
            <span className="text-2xl font-bold">PLAY</span>
          </>
        ) : (
          <>
            <Pause className="h-10 w-10" />
            <span className="text-2xl font-bold">PAUSE</span>
          </>
        )}
      </button>

      {/* Speed Control */}
      <div className="bg-zinc-900 rounded-2xl p-4 mb-6 border border-zinc-800">
        <p className="text-zinc-400 text-sm mb-3 text-center">Playback Speed</p>
        <div className="grid grid-cols-4 gap-2">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              onClick={() => setSpeed(speed)}
              disabled={!isConnected}
              className={`py-4 rounded-xl font-bold text-lg transition-all active:scale-95 ${
                currentSpeed === speed
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {/* Quick Jump - Modern Carousel */}
      {status?.slides && status.slides.length > 0 && (
        <div className="mb-8 py-4">
          <div className="flex items-center justify-between mb-4 px-1">
            <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Quick Jump</p>
            <p className="text-zinc-500 text-sm">{status.currentSlideIndex + 1} / {status.totalSlides}</p>
          </div>

          {/* Horizontal Scrollable Carousel */}
          <div className="flex gap-4 overflow-x-auto pt-3 pb-4 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
            {status.slides.map((slide, index) => {
              const isActive = status.currentSlideIndex === index;
              const slideIcon = SLIDE_ICONS[slide.type] || <Monitor className="h-6 w-6" />;

              return (
                <button
                  key={index}
                  onClick={() => goTo(index)}
                  disabled={!isConnected}
                  className={`
                    relative flex-shrink-0 snap-center
                    w-36 h-36 rounded-3xl
                    flex flex-col items-center justify-center gap-3
                    transition-all duration-200 active:scale-95
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${isActive
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-xl shadow-emerald-500/40 scale-105'
                      : 'bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-300 hover:from-zinc-700 hover:to-zinc-800 border border-zinc-700/50'
                    }
                  `}
                >
                  {/* Slide Number Badge */}
                  <span className={`
                    absolute -top-2 -right-2 w-7 h-7 rounded-full text-sm font-bold
                    flex items-center justify-center shadow-lg
                    ${isActive
                      ? 'bg-white text-emerald-600'
                      : 'bg-zinc-700 text-zinc-300'
                    }
                  `}>
                    {index + 1}
                  </span>

                  {/* Icon */}
                  <div className={`
                    w-14 h-14 rounded-2xl flex items-center justify-center
                    ${isActive
                      ? 'bg-white/20'
                      : 'bg-zinc-700/50'
                    }
                  `}>
                    {slideIcon}
                  </div>

                  {/* Label */}
                  <span className="text-sm font-medium text-center px-3 leading-tight line-clamp-2">
                    {slide.label}
                  </span>

                  {/* Active Indicator */}
                  {isActive && (
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-white rounded-full shadow-lg" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Settings Toggle */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="w-full bg-zinc-900 hover:bg-zinc-800 rounded-2xl p-4 mb-4 border border-zinc-800 flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-3">
          <Sun className="h-6 w-6 text-zinc-400" />
          <span className="font-semibold">Display Settings</span>
        </div>
        {showSettings ? (
          <ChevronUp className="h-6 w-6 text-zinc-400" />
        ) : (
          <ChevronDown className="h-6 w-6 text-zinc-400" />
        )}
      </button>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-zinc-900 rounded-2xl p-6 mb-6 border border-zinc-800">
          {/* Brightness */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400">Brightness</span>
              <span className="font-bold text-lg">{currentBrightness}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="150"
              value={currentBrightness}
              onChange={(e) => setBrightness(parseInt(e.target.value))}
              disabled={!isConnected}
              className="w-full h-3 bg-zinc-700 rounded-full appearance-none cursor-pointer disabled:opacity-50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500"
            />
            <div className="flex justify-between text-sm text-zinc-500 mt-2">
              <span>50%</span>
              <span>100%</span>
              <span>150%</span>
            </div>
          </div>

          {/* Quick Brightness Presets */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setBrightness(75)}
              disabled={!isConnected}
              className="py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50"
            >
              Dim
            </button>
            <button
              onClick={() => setBrightness(100)}
              disabled={!isConnected}
              className="py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50"
            >
              Normal
            </button>
            <button
              onClick={() => setBrightness(125)}
              disabled={!isConnected}
              className="py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50"
            >
              Bright
            </button>
          </div>
        </div>
      )}

      {/* Slide Manager Toggle */}
      <button
        onClick={() => setShowSlideManager(!showSlideManager)}
        className="w-full bg-zinc-900 hover:bg-zinc-800 rounded-2xl p-4 mb-4 border border-zinc-800 flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-3">
          <Settings2 className="h-6 w-6 text-zinc-400" />
          <span className="font-semibold">Manage Slides</span>
          {status?.slides && (
            <span className="px-2 py-0.5 bg-zinc-700 rounded-full text-xs text-zinc-400">
              {status.slides.length}
            </span>
          )}
        </div>
        {showSlideManager ? (
          <ChevronUp className="h-6 w-6 text-zinc-400" />
        ) : (
          <ChevronDown className="h-6 w-6 text-zinc-400" />
        )}
      </button>

      {/* Slide Manager Panel */}
      {showSlideManager && (
        <div className="bg-zinc-900 rounded-2xl p-4 mb-6 border border-zinc-800">
          {/* Slideshow Toggle */}
          <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl mb-4">
            <div className="flex items-center gap-3">
              <Power className={`h-5 w-5 ${status?.slideshowEnabled ? 'text-emerald-400' : 'text-zinc-500'}`} />
              <span className="font-medium">Slideshow</span>
            </div>
            <button
              onClick={() => toggleSlideshow(!status?.slideshowEnabled)}
              disabled={!isConnected}
              className={`w-14 h-8 rounded-full transition-colors disabled:opacity-50 ${
                status?.slideshowEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
              }`}
            >
              <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                status?.slideshowEnabled ? 'translate-x-7' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Slide List */}
          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {status?.slides?.map((slide, index) => {
              const SlideIcon = AVAILABLE_SLIDE_TYPES.find(t => t.type === slide.type)?.icon || Monitor;
              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    status.currentSlideIndex === index
                      ? 'bg-emerald-500/20 border border-emerald-500/30'
                      : 'bg-zinc-800/50'
                  }`}
                >
                  {/* Reorder Buttons */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => index > 0 && reorderSlide(index, index - 1)}
                      disabled={!isConnected || index === 0}
                      className="p-1 hover:bg-zinc-700 rounded disabled:opacity-30 transition-colors"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => status.slides && index < status.slides.length - 1 && reorderSlide(index, index + 1)}
                      disabled={!isConnected || !status.slides || index === status.slides.length - 1}
                      className="p-1 hover:bg-zinc-700 rounded disabled:opacity-30 transition-colors"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Icon */}
                  <div className="w-10 h-10 bg-zinc-700/50 rounded-lg flex items-center justify-center">
                    <SlideIcon className="h-5 w-5 text-zinc-300" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{slide.label}</p>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Clock className="h-3 w-3" />
                      <span>{slide.duration}s</span>
                    </div>
                  </div>

                  {/* Duration Adjuster */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateSlide(index, { duration: Math.max(5, slide.duration - 5) })}
                      disabled={!isConnected}
                      className="w-8 h-8 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-bold disabled:opacity-50"
                    >
                      -
                    </button>
                    <span className="w-10 text-center text-sm">{slide.duration}s</span>
                    <button
                      onClick={() => updateSlide(index, { duration: Math.min(120, slide.duration + 5) })}
                      disabled={!isConnected}
                      className="w-8 h-8 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-bold disabled:opacity-50"
                    >
                      +
                    </button>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => removeSlide(index)}
                    disabled={!isConnected}
                    className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add Slide Button */}
          <button
            onClick={() => setShowAddSlide(true)}
            disabled={!isConnected}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <Plus className="h-5 w-5" />
            Add Slide
          </button>
        </div>
      )}

      {/* Add Slide Modal */}
      {showAddSlide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setShowAddSlide(false)}>
          <div
            className="bg-zinc-900 rounded-2xl p-4 w-full max-w-md max-h-[80vh] overflow-y-auto border border-zinc-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Add Slide</h3>
              <button onClick={() => setShowAddSlide(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {AVAILABLE_SLIDE_TYPES.map((slideType) => {
                const Icon = slideType.icon;
                return (
                  <button
                    key={slideType.type}
                    onClick={() => {
                      addSlide({
                        type: slideType.type,
                        label: slideType.label,
                        duration: slideType.type === 'logo' ? 5 : 20,
                      });
                      setShowAddSlide(false);
                    }}
                    className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl flex flex-col items-center gap-2 transition-all active:scale-95"
                  >
                    <div className="w-12 h-12 bg-zinc-700/50 rounded-xl flex items-center justify-center">
                      <Icon className="h-6 w-6 text-emerald-400" />
                    </div>
                    <span className="text-sm font-medium text-center">{slideType.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={toggleFullscreen}
          disabled={!isConnected}
          className="h-20 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 border border-zinc-700"
        >
          <Maximize className="h-7 w-7" />
          <span className="font-semibold">Fullscreen</span>
        </button>
        <button
          onClick={refresh}
          disabled={!isConnected}
          className="h-20 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 border border-zinc-700"
        >
          <RefreshCw className="h-7 w-7" />
          <span className="font-semibold">Refresh</span>
        </button>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center text-zinc-600 text-sm">
        {isStandalone ? (
          <p>CodeLive TV Remote</p>
        ) : (
          <p>Open /tv/projects in another tab to control</p>
        )}
      </footer>

      {/* PWA Install Prompt */}
      {showInstallPrompt && !isStandalone && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-zinc-900 via-zinc-900 to-transparent">
          <div className="bg-zinc-800 rounded-2xl p-4 border border-zinc-700 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Plus className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white mb-1">Add to Home Screen</h3>
                <p className="text-sm text-zinc-400 mb-3">
                  Install this app for quick access and a fullscreen experience
                </p>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <span>Tap</span>
                  <Share className="h-4 w-4" />
                  <span>then &quot;Add to Home Screen&quot;</span>
                </div>
              </div>
              <button
                onClick={dismissInstallPrompt}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
