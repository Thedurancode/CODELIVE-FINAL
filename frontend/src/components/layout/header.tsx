'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
import { Search, LogOut, User, Settings, Loader2, Users, UserCircle, Phone, Mail, FolderKanban, Command } from 'lucide-react';
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

export function Header() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get current user data
  const { data: user } = useCurrentUser();

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

      {/* Spotlight Search Modal */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
            onClick={closeSearch}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-2xl mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search Container */}
              <div className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                {/* Search Input */}
                <form onSubmit={handleSearch} className="relative">
                  <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search projects and contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-16 pl-14 pr-24 text-lg bg-transparent border-0 border-b border-border/50 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <kbd className="hidden sm:inline-flex h-6 items-center rounded border border-border/50 bg-muted/50 px-1.5 text-[10px] text-muted-foreground font-mono">
                      ESC
                    </kbd>
                  </div>
                </form>

                {/* Search Results */}
                <div className="max-h-[50vh] overflow-y-auto">
                  {debouncedQuery.length >= 2 ? (
                    <>
                      {isSearching ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                        </div>
                      ) : hasResults ? (
                        <div className="py-2">
                          {/* Projects */}
                          {searchResults.projects.length > 0 && (
                            <>
                              <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                Projects
                              </div>
                              {searchResults.projects.map((result) => (
                                <button
                                  key={`${result.type}-${result.id}`}
                                  type="button"
                                  onClick={() => handleResultClick(result)}
                                  className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-muted/50 rounded-lg mx-1 transition-colors text-left group"
                                  style={{ width: 'calc(100% - 8px)' }}
                                >
                                  <div className="h-9 w-9 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                                    <FolderKanban className="h-4 w-4 text-purple-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate group-hover:text-purple-400 transition-colors">{result.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                                  </div>
                                  {result.meta && (
                                    <span className={cn(
                                      'text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0',
                                      result.meta === 'now coding' && 'bg-green-500/20 text-green-400',
                                      result.meta === 'in talks' && 'bg-purple-500/20 text-purple-400',
                                      result.meta === 'needs review' && 'bg-amber-500/20 text-amber-400',
                                      result.meta === 'completed' && 'bg-blue-500/20 text-blue-400',
                                      result.meta === 'cancelled' && 'bg-red-500/20 text-red-400'
                                    )}>
                                      {result.meta}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </>
                          )}

                          {/* Contacts */}
                          {searchResults.contacts.length > 0 && (
                            <>
                              <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
                                Contacts
                              </div>
                              {searchResults.contacts.map((result) => (
                                <button
                                  key={`${result.type}-${result.id}`}
                                  type="button"
                                  onClick={() => handleResultClick(result)}
                                  className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-muted/50 rounded-lg mx-1 transition-colors text-left group"
                                  style={{ width: 'calc(100% - 8px)' }}
                                >
                                  <div className="h-9 w-9 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                    <UserCircle className="h-4 w-4 text-blue-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate group-hover:text-blue-400 transition-colors">{result.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                                  </div>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12">
                          <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
                          <p className="text-sm text-muted-foreground">No results found</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-8 px-4 text-center">
                      <p className="text-sm text-muted-foreground">Type to search projects and contacts...</p>
                      <div className="flex items-center justify-center gap-2 mt-4">
                        <kbd className="inline-flex h-6 items-center gap-1 rounded border border-border/50 bg-muted/50 px-2 text-[10px] text-muted-foreground font-mono">
                          <Command className="h-2.5 w-2.5" />K
                        </kbd>
                        <span className="text-xs text-muted-foreground/60">to search anytime</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                {hasResults && debouncedQuery.length >= 2 && (
                  <div className="px-4 py-3 border-t border-border/50 bg-muted/30">
                    <button
                      type="button"
                      onClick={() => {
                        closeSearch();
                        router.push(`/projects?search=${encodeURIComponent(searchQuery.trim())}`);
                      }}
                      className="text-xs text-muted-foreground hover:text-purple-400 transition-colors"
                    >
                      View all {searchResults.total} results →
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right - Search, AI Agent, Notifications & User */}
      <div className="flex items-center gap-1" suppressHydrationWarning>
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

        {/* AI Agent Button */}
        {mounted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/chat">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-accent/50 group"
                >
                  <div className="absolute inset-0 rounded-md bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Image
                    src="/agent.png"
                    alt="AI Assistant"
                    width={40}
                    height={40}
                    className="h-10 w-10 object-contain rounded-lg relative z-10"
                  />
                  <span className="sr-only">AI Assistant</span>
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>AI Assistant</p>
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
