'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, LogOut, User, Settings, Loader2, Users, UserCircle, Phone, Mail, FolderKanban, Command, Volume2, Square, History, Play, LayoutDashboard, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUniversalSearch, type UniversalSearchResult } from '@/hooks/use-universal-search';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/hooks/use-user';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { NotificationBell } from './NotificationBell';
import { TeamProfileEditor } from '@/components/team/TeamProfileEditor';
import type { TeamConversation } from '@/types';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// Saved recap interface
interface SavedRecap {
  text: string;
  audioBase64: string;
  timestamp: string;
  projectId?: string;
  type: 'single' | 'all';
}

// Helper to get storage key for recaps
function getRecapStorageKey(projectId?: string): string {
  return projectId ? `recap_${projectId}` : 'recap_all';
}

// Helper to format relative time for recap
function formatRecapTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Audio Waveform Visualizer for Recap Playback
function RecapWaveform({ analyser, isPlaying }: { analyser: AnalyserNode | null; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!analyser || !canvasRef.current || !isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barCount = 40;
      const barWidth = (canvas.width / barCount) - 1.5;
      const barSpacing = 1.5;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex];
        const barHeight = Math.max(2, (value / 255) * canvas.height * 0.9);

        const intensity = value / 255;
        // Cyan to teal gradient (hue 175-190)
        const hue = 175 + intensity * 15;
        const saturation = 80 + intensity * 15;
        const lightness = 50 + intensity * 15;

        if (intensity > 0.5) {
          ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;
          ctx.shadowBlur = 8;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${0.8 + intensity * 0.2})`;

        const x = i * (barWidth + barSpacing);
        const y = (canvas.height - barHeight) / 2;

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isPlaying]);

  if (!isPlaying) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border border-cyan-500/20 backdrop-blur-sm">
      <canvas
        ref={canvasRef}
        width={180}
        height={36}
        className="rounded-lg"
      />
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
      </span>
    </div>
  );
}

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Recap state
  const [isLoadingRecap, setIsLoadingRecap] = useState(false);
  const [isPlayingRecap, setIsPlayingRecap] = useState(false);
  const [savedRecap, setSavedRecap] = useState<SavedRecap | null>(null);
  const [recapAnalyser, setRecapAnalyser] = useState<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Get current user data
  const { data: user } = useCurrentUser();

  // Detect if we're on a project page
  const projectDetailMatch = pathname?.match(/^\/projects\/([a-f0-9-]+)/i);
  const isProjectDetailPage = !!projectDetailMatch;
  const projectId = projectDetailMatch?.[1];
  const isProjectsListPage = pathname === '/projects' || pathname?.startsWith('/projects?');
  const showRecapButton = isProjectDetailPage || isProjectsListPage;

  
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Only render dropdown after hydration to avoid ID mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load saved recap from localStorage when page changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storageKey = getRecapStorageKey(isProjectDetailPage ? projectId : undefined);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setSavedRecap(JSON.parse(saved));
      } else {
        setSavedRecap(null);
      }
    } catch {
      setSavedRecap(null);
    }
  }, [pathname, projectId, isProjectDetailPage]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch universal search results
  const { data: searchResults = { projects: [], contacts: [], total: 0 }, isLoading: isSearching } = useUniversalSearch(debouncedQuery, 3);

  // Keyboard shortcut to open search (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setShowSearch(true);
      }
      if (event.key === 'Escape') {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when search opens
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSearch(false);
      setSearchQuery('');
      router.push(`/projects?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleResultClick = (result: UniversalSearchResult) => {
    setShowSearch(false);
    setSearchQuery('');
    router.push(result.href);
  };

  const closeSearch = () => {
    setShowSearch(false);
    setSearchQuery('');
  };

  const handleLogout = async () => {
    // Sign out from Supabase
    if (supabase) {
      await supabase.auth.signOut();
    }

    // Clear auth token from localStorage (keep remember me settings for next login)
    localStorage.removeItem('codelive_token');

    // Clear cookie
    document.cookie = 'codelive_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    // Redirect to login
    router.push('/login');
  };

  // Stop audio playback
  const stopRecap = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setRecapAnalyser(null);
    setIsPlayingRecap(false);
  };

  // Play audio from base64 with waveform visualization
  const playAudioFromBase64 = (base64: string) => {
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    // Set up audio context for waveform
    const setupAudioAnalyser = () => {
      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audio);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        audioContextRef.current = audioContext;
        setRecapAnalyser(analyser);
      } catch (e) {
        console.log('Could not set up audio analyser:', e);
      }
    };

    audio.onplay = () => {
      if (!audioContextRef.current) {
        setupAudioAnalyser();
      }
      setIsPlayingRecap(true);
    };

    audio.onended = () => {
      setIsPlayingRecap(false);
      setRecapAnalyser(null);
      audioRef.current = null;
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };

    audio.onerror = () => {
      setIsPlayingRecap(false);
      setRecapAnalyser(null);
      audioRef.current = null;
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };

    audio.play();
  };

  // Play saved recap
  const playSavedRecap = () => {
    if (!savedRecap) return;

    if (isPlayingRecap) {
      stopRecap();
      return;
    }

    playAudioFromBase64(savedRecap.audioBase64);
  };

  // Handle recap button click - uses backend API for TTS
  const handleRecapClick = async () => {
    // If already playing, stop
    if (isPlayingRecap) {
      stopRecap();
      return;
    }

    setIsLoadingRecap(true);
    try {
      const recapType: 'single' | 'all' = isProjectDetailPage && projectId ? 'single' : 'all';
      console.log('[Recap] Starting recap, type:', recapType, 'projectId:', projectId);

      if (isProjectDetailPage && projectId) {
        // Use the backend cached audio endpoint for single project
        console.log('[Recap] Fetching audio from backend...');
        const response = await api.get<{
          success: boolean;
          data: {
            audioUrl: string;
            cached: boolean;
            recap: string;
          };
        }>(`/api/projects/${projectId}/recap/audio?voice=rachel`);

        console.log('[Recap] Response:', response);

        const audioData = response?.data;
        if (audioData?.audioUrl) {
          // Play the audio with waveform visualization
          const audio = new Audio(audioData.audioUrl);
          audio.crossOrigin = 'anonymous';
          audioRef.current = audio;

          // Set up audio context for waveform
          const setupAudioAnalyser = () => {
            try {
              const audioContext = new AudioContext();
              const source = audioContext.createMediaElementSource(audio);
              const analyser = audioContext.createAnalyser();
              analyser.fftSize = 128;
              source.connect(analyser);
              analyser.connect(audioContext.destination);
              audioContextRef.current = audioContext;
              setRecapAnalyser(analyser);
            } catch (e) {
              console.log('Could not set up audio analyser:', e);
            }
          };

          audio.onplay = () => {
            console.log('[Recap] Audio playing');
            if (!audioContextRef.current) {
              setupAudioAnalyser();
            }
            setIsPlayingRecap(true);
          };

          audio.onended = () => {
            console.log('[Recap] Audio ended');
            setIsPlayingRecap(false);
            setRecapAnalyser(null);
            audioRef.current = null;
            if (audioContextRef.current) {
              audioContextRef.current.close();
              audioContextRef.current = null;
            }
          };

          audio.onerror = (e) => {
            console.error('[Recap] Audio error:', e);
            toast.error('Failed to play audio');
            setIsPlayingRecap(false);
            setRecapAnalyser(null);
            audioRef.current = null;
            if (audioContextRef.current) {
              audioContextRef.current.close();
              audioContextRef.current = null;
            }
          };

          await audio.play();

          // Save recap info for quick replay
          const savedData: SavedRecap = {
            text: audioData.recap || '',
            audioBase64: '',
            timestamp: new Date().toISOString(),
            projectId,
            type: 'single',
          };
          setSavedRecap(savedData);
        } else {
          // Fallback to browser speech if no audio URL
          console.log('[Recap] No audio URL, using browser speech');
          if (audioData?.recap) {
            speakWithBrowserTTS(audioData.recap, projectId, 'single');
          } else {
            toast.error('No recap available');
          }
        }
      } else {
        // For all projects recap, get text and use browser speech synthesis
        console.log('[Recap] Getting all projects recap...');
        const response = await api.post<{
          success: boolean;
          data: {
            recap: string;
            updatedAt: string;
          };
        }>('/api/projects/recap/all', {
          userName: user?.name,
          limit: 3,
        });

        console.log('[Recap] All projects response:', response);

        const allProjectsData = response?.data;
        if (allProjectsData?.recap) {
          speakWithBrowserTTS(allProjectsData.recap, undefined, 'all');
        } else {
          toast.error('No recap available');
        }
      }
    } catch (error) {
      console.error('Recap error:', error);
      toast.error('Failed to generate recap');
    } finally {
      setIsLoadingRecap(false);
    }
  };

  // Browser TTS fallback
  const speakWithBrowserTTS = (text: string, projectId?: string, type: 'single' | 'all' = 'single') => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      toast.error('Speech synthesis not available');
      return;
    }

    window.speechSynthesis.cancel(); // Cancel any ongoing speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      v.name.includes('Samantha') || v.name.includes('Google') || v.lang.startsWith('en')
    );
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => {
      console.log('[Recap] Browser TTS started');
      setIsPlayingRecap(true);
    };
    utterance.onend = () => {
      console.log('[Recap] Browser TTS ended');
      setIsPlayingRecap(false);
    };
    utterance.onerror = (e) => {
      console.error('[Recap] Browser TTS error:', e);
      setIsPlayingRecap(false);
    };

    window.speechSynthesis.speak(utterance);

    // Save for display
    const savedData: SavedRecap = {
      text,
      audioBase64: '',
      timestamp: new Date().toISOString(),
      projectId,
      type,
    };
    setSavedRecap(savedData);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  const hasResults = searchResults && searchResults.total > 0;

  return (
    <header
      suppressHydrationWarning
      className="fixed top-0 left-0 right-0 z-30 flex h-20 items-center border-b border bg-background/95 backdrop-blur px-4 transition-all duration-300"
    >
      {/* Left - Logo */}
      <div className="flex items-center">
        <img
          src="/codelive-logo.png"
          alt="CodeLive"
          className="h-12 w-auto object-contain"
        />
      </div>

      {/* Center - Empty spacer */}
      <div className="flex-1" />

      {/* Full Screen Search Modal */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] bg-zinc-950"
            style={{ backgroundColor: '#000000' }}
            onClick={closeSearch}
          >
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 via-transparent to-cyan-500/5 pointer-events-none" />

            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="relative h-full flex flex-col items-center pt-[12vh] px-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search Container */}
              <div className="w-full max-w-3xl">
                {/* Search Input */}
                <form onSubmit={handleSearch} className="relative mb-8">
                  <motion.div
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    className="relative"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-cyan-500/20 rounded-2xl blur-xl opacity-50" />
                    <div className="relative bg-zinc-900/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                      <Search className="absolute left-6 top-1/2 h-6 w-6 -translate-y-1/2 text-zinc-400" />
                      <Input
                        ref={searchInputRef}
                        placeholder="Search everything..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-20 pl-16 pr-28 text-xl bg-transparent border-0 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-zinc-500 text-white font-light"
                      />
                      <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-3">
                        {isSearching && (
                          <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                        )}
                        <kbd className="hidden sm:inline-flex h-8 items-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-zinc-400 font-medium">
                          ESC
                        </kbd>
                      </div>
                    </div>
                  </motion.div>
                </form>

                {/* Results Area */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
                >
                  {debouncedQuery.length >= 2 ? (
                    <>
                      {!isSearching && hasResults ? (
                        <div className="space-y-6">
                          {/* Projects */}
                          {searchResults.projects.length > 0 && (
                            <div>
                              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3 px-1">
                                Projects
                              </h3>
                              <div className="space-y-2">
                                {searchResults.projects.map((result, index) => (
                                  <motion.button
                                    key={`${result.type}-${result.id}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    type="button"
                                    onClick={() => handleResultClick(result)}
                                    className="w-full p-4 flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-purple-500/30 rounded-xl transition-all duration-200 text-left group"
                                  >
                                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                      <FolderKanban className="h-6 w-6 text-purple-300" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-base font-medium text-white truncate group-hover:text-purple-300 transition-colors">
                                        {result.title}
                                      </p>
                                      <p className="text-sm text-zinc-500 truncate mt-0.5">{result.subtitle}</p>
                                    </div>
                                    {result.meta && (
                                      <span className={cn(
                                        'text-xs font-medium px-3 py-1.5 rounded-full flex-shrink-0',
                                        result.meta === 'now coding' && 'bg-green-500/20 text-green-300 border border-green-500/30',
                                        result.meta === 'in talks' && 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
                                        result.meta === 'needs review' && 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
                                        result.meta === 'completed' && 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
                                        result.meta === 'cancelled' && 'bg-red-500/20 text-red-300 border border-red-500/30'
                                      )}>
                                        {result.meta}
                                      </span>
                                    )}
                                  </motion.button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Contacts */}
                          {searchResults.contacts.length > 0 && (
                            <div>
                              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3 px-1">
                                Contacts
                              </h3>
                              <div className="space-y-2">
                                {searchResults.contacts.map((result, index) => (
                                  <motion.button
                                    key={`${result.type}-${result.id}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: (searchResults.projects.length + index) * 0.05 }}
                                    type="button"
                                    onClick={() => handleResultClick(result)}
                                    className="w-full p-4 flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 rounded-xl transition-all duration-200 text-left group"
                                  >
                                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                      <UserCircle className="h-6 w-6 text-cyan-300" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-base font-medium text-white truncate group-hover:text-cyan-300 transition-colors">
                                        {result.title}
                                      </p>
                                      <p className="text-sm text-zinc-500 truncate mt-0.5">{result.subtitle}</p>
                                    </div>
                                  </motion.button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* View All Results */}
                          <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            type="button"
                            onClick={() => {
                              closeSearch();
                              router.push(`/projects?search=${encodeURIComponent(searchQuery.trim())}`);
                            }}
                            className="w-full py-4 text-sm text-zinc-400 hover:text-purple-300 transition-colors flex items-center justify-center gap-2"
                          >
                            View all {searchResults.total} results
                            <span className="text-lg">→</span>
                          </motion.button>
                        </div>
                      ) : !isSearching ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex flex-col items-center justify-center py-16"
                        >
                          <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                            <Search className="h-8 w-8 text-zinc-600" />
                          </div>
                          <p className="text-zinc-500 text-lg">No results found</p>
                          <p className="text-zinc-600 text-sm mt-1">Try a different search term</p>
                        </motion.div>
                      ) : null}
                    </>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center py-16"
                    >
                      <div className="flex items-center gap-4 mb-8">
                        <div className="h-14 w-14 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                          <FolderKanban className="h-7 w-7 text-purple-400" />
                        </div>
                        <div className="h-14 w-14 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                          <UserCircle className="h-7 w-7 text-cyan-400" />
                        </div>
                      </div>
                      <p className="text-zinc-400 text-lg mb-2">Search projects and contacts</p>
                      <p className="text-zinc-600 text-sm">Start typing to search...</p>
                      <div className="flex items-center gap-2 mt-6">
                        <kbd className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-zinc-500 font-medium">
                          <Command className="h-3 w-3" />K
                        </kbd>
                        <span className="text-xs text-zinc-600">to search anytime</span>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </div>

              {/* Close Button */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                onClick={closeSearch}
                className="absolute top-6 right-6 h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <span className="text-xl">×</span>
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right - Navigation, Recap, Search, Notifications & User */}
      <div className="flex items-center gap-2" suppressHydrationWarning>
        {/* Waveform Visualization when playing */}
        {mounted && isPlayingRecap && (
          <RecapWaveform analyser={recapAnalyser} isPlaying={isPlayingRecap} />
        )}

        {/* Last Saved Recap Button */}
        {mounted && savedRecap && !isLoadingRecap && !isPlayingRecap && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={playSavedRecap}
                className="h-9 px-3 text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-200 gap-2 rounded-lg border border-transparent hover:border-cyan-500/20"
              >
                <Play className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">{formatRecapTime(savedRecap.timestamp)}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Replay last recap</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* New Recap Button - Dynamic based on page */}
        {mounted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isPlayingRecap ? "default" : "ghost"}
                size="sm"
                onClick={isPlayingRecap ? stopRecap : handleRecapClick}
                disabled={isLoadingRecap}
                className={cn(
                  "h-10 px-4 gap-2 rounded-lg transition-all duration-200",
                  isPlayingRecap
                    ? "bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 text-white shadow-lg shadow-cyan-500/25"
                    : "text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20"
                )}
              >
                {isLoadingRecap ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPlayingRecap ? (
                  <Square className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
                <span className="hidden sm:inline text-sm font-medium">
                  {isLoadingRecap ? 'Loading...' : isPlayingRecap ? 'Stop' : 'AI Recap'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                {isPlayingRecap
                  ? 'Stop Playback'
                  : isProjectDetailPage
                    ? 'Generate Project Recap'
                    : 'Generate All Projects Recap'}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Search Button */}
        {mounted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSearch(true)}
                className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Search className="h-5 w-5" />
                <span className="sr-only">Search (⌘K)</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="flex items-center gap-2">
                Search
                <kbd className="inline-flex h-5 items-center gap-0.5 rounded border border-border/50 bg-muted px-1.5 text-[10px] text-muted-foreground">
                  <Command className="h-2.5 w-2.5" />K
                </kbd>
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Notification Bell */}
        {mounted && (
          <NotificationBell
            onOpenMessenger={(conversation?: TeamConversation) => {
              // Dispatch event to open messenger widget
              const event = new CustomEvent('openMessengerWidget', {
                detail: { conversation },
              });
              window.dispatchEvent(event);
            }}
          />
        )}

        {/* User Menu */}
        {mounted ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.avatar} alt={user?.name} />
                  <AvatarFallback className="bg-accent-600 text-white text-sm">
                    {getInitials(user?.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border">
              <DropdownMenuLabel className="text-muted-foreground">
                <div className="flex flex-col">
                  <span className="text-foreground font-medium">{user?.name || 'User'}</span>
                  <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <Link href="/profile">
                <DropdownMenuItem className="text-foreground focus:bg-secondary focus:text-foreground cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
              </Link>
              <TeamProfileEditor
                trigger={
                  <DropdownMenuItem
                    className="text-foreground focus:bg-secondary focus:text-foreground cursor-pointer"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Team Profile
                  </DropdownMenuItem>
                }
              />
              <Link href="/settings">
                <DropdownMenuItem className="text-foreground focus:bg-secondary focus:text-foreground cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-400 focus:bg-secondary focus:text-red-400 cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-accent-600 text-white text-sm">
                {getInitials(user?.name)}
              </AvatarFallback>
            </Avatar>
          </Button>
        )}
      </div>
    </header>
  );
}
