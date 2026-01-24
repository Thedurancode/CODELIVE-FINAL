'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
import { Search, LogOut, User, Settings, MapPin, DollarSign, Loader2, Home, Users, UserCircle, Target, Phone, Mail, Bed, Bath, Square, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUniversalSearch, type UniversalSearchResult } from '@/hooks/use-universal-search';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
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

const resultIcons = {
  property: Home,
  contact: UserCircle,
  buyer: Users,
  buybox: Target,
};

const resultLabels = {
  property: 'Deals',
  contact: 'Contacts',
  buyer: 'Buyers',
  buybox: 'Buy Boxes',
};

export function Header() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
  const { data: searchResults, isLoading: isSearching } = useUniversalSearch(debouncedQuery, 3);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSuggestions(false);
      router.push(`/deals?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleResultClick = (result: UniversalSearchResult) => {
    setShowSuggestions(false);
    setSearchQuery('');
    router.push(result.href);
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

  const formatPrice = (price?: number) => {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const renderHoverContent = (result: UniversalSearchResult) => {
    const data = result.data as any;

    if (result.type === 'property') {
      return (
        <div className="w-72">
          {result.image && (
            <div className="h-32 -mx-4 -mt-4 mb-3 overflow-hidden rounded-t-lg">
              <img src={result.image} alt={result.title} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="space-y-2">
            <div>
              <p className="font-semibold text-foreground">{result.title}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {result.subtitle}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-emerald-400">{formatPrice(data.askingPrice)}</span>
              {data.arv && (
                <span className="text-xs text-muted-foreground">ARV: {formatPrice(data.arv)}</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {data.bedroomCount !== undefined && (
                <span className="flex items-center gap-1"><Bed className="h-3 w-3" />{data.bedroomCount} bed</span>
              )}
              {data.bathroomCount !== undefined && (
                <span className="flex items-center gap-1"><Bath className="h-3 w-3" />{data.bathroomCount} bath</span>
              )}
              {data.livingSpaceSqFt && (
                <span className="flex items-center gap-1"><Square className="h-3 w-3" />{data.livingSpaceSqFt.toLocaleString()} sqft</span>
              )}
            </div>
            {data.propertyType && (
              <Badge variant="outline" className="text-xs">{data.propertyType}</Badge>
            )}
          </div>
        </div>
      );
    }

    if (result.type === 'contact') {
      return (
        <div className="w-64 space-y-3">
          <div className="flex items-center gap-3">
            {result.image ? (
              <img src={result.image} alt={result.title} className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-blue-600/20 flex items-center justify-center">
                <UserCircle className="h-6 w-6 text-blue-400" />
              </div>
            )}
            <div>
              <p className="font-semibold text-foreground">{result.title}</p>
              <p className="text-xs text-muted-foreground">{data.company || data.type || 'Contact'}</p>
            </div>
          </div>
          <div className="space-y-1.5 text-sm">
            {data.email && (
              <p className="flex items-center gap-2 text-foreground">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                {data.email}
              </p>
            )}
            {data.phone && (
              <p className="flex items-center gap-2 text-foreground">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                {data.phone}
              </p>
            )}
            {(data.city || data.state) && (
              <p className="flex items-center gap-2 text-muted-foreground text-xs">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {[data.city, data.state].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
          {data.tags && data.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.tags.slice(0, 3).map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (result.type === 'buyer') {
      return (
        <div className="w-64 space-y-3">
          <div className="flex items-center gap-3">
            {result.image ? (
              <img src={result.image} alt={result.title} className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-purple-600/20 flex items-center justify-center">
                <Users className="h-6 w-6 text-purple-400" />
              </div>
            )}
            <div>
              <p className="font-semibold text-foreground">{result.title}</p>
              <p className="text-xs text-muted-foreground">{result.subtitle}</p>
            </div>
          </div>
          {data.isHot && (
            <Badge className="bg-orange-600/20 text-orange-400 border-orange-600/30">Hot Buyer</Badge>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {data.budget && (
              <div>
                <span className="text-muted-foreground">Budget</span>
                <p className="text-foreground font-medium">{formatPrice(data.budget)}</p>
              </div>
            )}
            {data.propertyTypes && data.propertyTypes.length > 0 && (
              <div>
                <span className="text-muted-foreground">Looking for</span>
                <p className="text-foreground">{data.propertyTypes.slice(0, 2).join(', ')}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (result.type === 'buybox') {
      const criteria = data.criteria || {};
      return (
        <div className="w-72 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
              <Target className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{result.title}</p>
              <p className="text-xs text-muted-foreground">{data.fundName || 'Buy Box'}</p>
            </div>
            <Badge className={data.active ? 'bg-green-600/20 text-green-400 ml-auto' : 'bg-muted text-muted-foreground ml-auto'}>
              {data.active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {criteria.states && criteria.states.length > 0 && (
              <div>
                <span className="text-muted-foreground">States</span>
                <p className="text-foreground">{criteria.states.slice(0, 4).join(', ')}{criteria.states.length > 4 ? ` +${criteria.states.length - 4}` : ''}</p>
              </div>
            )}
            {(criteria.minPrice || criteria.maxPrice) && (
              <div>
                <span className="text-muted-foreground">Price Range</span>
                <p className="text-foreground">{formatPrice(criteria.minPrice)} - {formatPrice(criteria.maxPrice)}</p>
              </div>
            )}
            {criteria.propertyTypes && criteria.propertyTypes.length > 0 && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Property Types</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {criteria.propertyTypes.slice(0, 3).map((type: string) => (
                    <Badge key={type} variant="outline" className="text-xs">{type}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          {criteria.investmentStrategies && criteria.investmentStrategies.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {criteria.investmentStrategies.map((s: string) => (
                <Badge key={s} className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {s.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const renderResultGroup = (
    results: UniversalSearchResult[],
    type: 'property' | 'contact' | 'buyer' | 'buybox'
  ) => {
    if (results.length === 0) return null;

    const Icon = resultIcons[type];
    const label = resultLabels[type];

    return (
      <div key={type}>
        <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2 bg-secondary/50">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        {results.map((result) => (
          <HoverCard key={`${result.type}-${result.id}`} openDelay={2000} closeDelay={200}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                onClick={() => handleResultClick(result)}
                className="w-full px-3 py-2.5 text-left hover:bg-secondary transition-colors flex items-center gap-3"
              >
                {/* Image/Icon thumbnail */}
                {result.image ? (
                  <div className="h-10 w-10 rounded-lg overflow-hidden flex-shrink-0 bg-secondary">
                    <img
                      src={result.image}
                      alt={result.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className={cn(
                    'h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0',
                    result.type === 'property' ? 'bg-emerald-600/20 text-emerald-400' :
                    result.type === 'contact' ? 'bg-blue-600/20 text-blue-400' :
                    result.type === 'buyer' ? 'bg-purple-600/20 text-purple-400' :
                    'bg-amber-600/20 text-amber-400'
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium text-sm truncate">
                    {result.title}
                  </p>
                  <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5 truncate">
                    {result.type === 'property' && <MapPin className="h-3 w-3 flex-shrink-0" />}
                    {result.subtitle}
                  </p>
                </div>

                {/* Meta badge */}
                {result.meta && (
                  <div className={cn(
                    'text-xs font-medium flex items-center px-2 py-1 rounded-full flex-shrink-0',
                    result.type === 'property' ? 'bg-emerald-600/20 text-emerald-400' :
                    result.meta === 'Hot Buyer' ? 'bg-orange-600/20 text-orange-400' :
                    result.meta === 'Active' ? 'bg-green-600/20 text-green-400' :
                    result.meta === 'Inactive' ? 'bg-muted text-muted-foreground' :
                    'bg-secondary text-muted-foreground'
                  )}>
                    {result.type === 'property' && <DollarSign className="h-3 w-3" />}
                    {result.type === 'property' ? result.meta.replace('$', '') : result.meta}
                  </div>
                )}
              </button>
            </HoverCardTrigger>
            <HoverCardContent side="left" align="center" sideOffset={20} className="p-4 bg-card/95 backdrop-blur-sm border shadow-2xl shadow-black/50 rounded-xl z-[100]">
              {renderHoverContent(result)}
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>
    );
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

      {/* Center - Search bar */}
      <div className="flex-1 flex justify-center">
        <div ref={searchRef} className="relative hidden md:flex items-center gap-2 w-full max-w-lg">
          <form onSubmit={handleSearch} className="relative flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search deals, contacts, buyers, buy boxes..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => searchQuery && setShowSuggestions(true)}
                className="w-full bg-secondary border pl-9 pr-3 text-foreground placeholder:text-muted-foreground focus-visible:ring-accent-600"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="bg-accent-600 hover:bg-accent-700 text-white"
            >
              Search
            </Button>
          </form>

          {/* Search Suggestions Dropdown */}
          {showSuggestions && debouncedQuery.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card border rounded-lg shadow-xl z-50 overflow-hidden max-h-[70vh] overflow-y-auto">
              {isSearching ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-accent-500" />
                  <span className="ml-2 text-muted-foreground text-sm">Searching...</span>
                </div>
              ) : hasResults ? (
                <div className="divide-y divide-border">
                  {renderResultGroup(searchResults.properties, 'property')}
                  {renderResultGroup(searchResults.contacts, 'contact')}
                  {renderResultGroup(searchResults.buyers, 'buyer')}
                  {renderResultGroup(searchResults.buyboxes, 'buybox')}

                  {/* View all results */}
                  <div className="px-4 py-3 bg-secondary/30">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSuggestions(false);
                        router.push(`/deals?search=${encodeURIComponent(searchQuery.trim())}`);
                      }}
                      className="text-accent-400 text-sm hover:text-accent-300 transition-colors"
                    >
                      View all {searchResults.total} results for "{searchQuery}"
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-6 px-4 text-center">
                  <Search className="h-8 w-8 text-muted mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No results found for "{debouncedQuery}"</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">Try different keywords or check your spelling</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right - AI Agent, Notifications & User */}
      <div className="flex items-center gap-1" suppressHydrationWarning>
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
