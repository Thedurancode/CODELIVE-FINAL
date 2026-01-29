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
import { Search, LogOut, User, Settings, Loader2, Users, UserCircle, Phone, Mail, FolderKanban, Command, Volume2, Square, History, Play } from 'lucide-react';
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    setIsPlayingRecap(false);
  };

  // Play audio from base64
  const playAudioFromBase64 = (base64: string) => {
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    audioRef.current = audio;
    setIsPlayingRecap(true);

    audio.onended = () => {
      setIsPlayingRecap(false);
      audioRef.current = null;
    };

    audio.onerror = () => {
      setIsPlayingRecap(false);
      audioRef.current = null;
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

  // Handle recap button click
  const handleRecapClick = async () => {
    // If already playing, stop
    if (isPlayingRecap) {
      stopRecap();
      return;
    }

    setIsLoadingRecap(true);
    try {
      let recap: string;
      const recapType: 'single' | 'all' = isProjectDetailPage && projectId ? 'single' : 'all';

      if (isProjectDetailPage && projectId) {
        // Get single project recap
        const response = await api.post<{ recap: string }>(`/api/projects/${projectId}/recap/refresh`, {
          userName: user?.name,
        });
        recap = response.recap;
      } else {
        // Get all projects recap
        const response = await api.post<{ recap: string }>('/api/projects/recap/all', {
          userName: user?.name,
          limit: 3,
        });
        recap = response.recap;
      }

      // Use ElevenLabs TTS
      const ELEVENLABS_API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
      const VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // Default voice

      if (!ELEVENLABS_API_KEY) {
        console.error('ElevenLabs API key not configured');
        return;
      }

      const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: recap,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      });

      if (!ttsResponse.ok) {
        throw new Error('TTS request failed');
      }

      const audioBlob = await ttsResponse.blob();

      // Convert blob to base64 for storage
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];

        // Save recap to localStorage
        const savedData: SavedRecap = {
          text: recap,
          audioBase64: base64,
          timestamp: new Date().toISOString(),
          projectId: recapType === 'single' ? projectId : undefined,
          type: recapType,
        };

        const storageKey = getRecapStorageKey(recapType === 'single' ? projectId : undefined);
        try {
          localStorage.setItem(storageKey, JSON.stringify(savedData));
          setSavedRecap(savedData);
        } catch (e) {
          console.warn('Failed to save recap to localStorage:', e);
        }
      };
      reader.readAsDataURL(audioBlob);

      // Play the audio
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audioRef.current = audio;
      setIsPlayingRecap(true);

      audio.onended = () => {
        setIsPlayingRecap(false);
        audioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setIsPlayingRecap(false);
        audioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (error) {
      console.error('Recap error:', error);
    } finally {
      setIsLoadingRecap(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
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

      {/* Right - Recap, Search, Notifications & User */}
      <div className="flex items-center gap-1" suppressHydrationWarning>
        {/* Last Saved Recap Button */}
        {mounted && savedRecap && !isLoadingRecap && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={playSavedRecap}
                className={cn(
                  "h-10 px-3 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors gap-2",
                  isPlayingRecap && "text-purple-500 hover:text-purple-400 bg-purple-500/10"
                )}
              >
                {isPlayingRecap ? (
                  <Square className="h-4 w-4 fill-current" />
                ) : (
                  <History className="h-4 w-4" />
                )}
                <span className="text-xs">{formatRecapTime(savedRecap.timestamp)}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{isPlayingRecap ? 'Stop' : 'Quick Recap'}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* New Recap Button - Dynamic based on page */}
        {mounted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRecapClick}
                disabled={isLoadingRecap}
                className={cn(
                  "h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                  isPlayingRecap && !savedRecap && "text-purple-500 hover:text-purple-400 bg-purple-500/10"
                )}
              >
                {isLoadingRecap ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
                <span className="sr-only">
                  {isProjectDetailPage ? 'New Project Recap' : 'New All Projects Recap'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                {isProjectDetailPage
                  ? 'Generate New Recap'
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
