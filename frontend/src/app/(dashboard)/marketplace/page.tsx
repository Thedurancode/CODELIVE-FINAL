'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sparkles,
  LayoutGrid,
  Heart,
  BarChart3,
  Settings,
  AlertCircle,
  RefreshCw,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { MarketplaceSwipe } from '@/components/marketplace';
import { useMarketplaceStore } from '@/stores/marketplace-store';
import { useMarketplaceUser, useUserBehaviorProfile, useUserOffers } from '@/hooks/use-marketplace';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Fetch current logged-in user
function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => api.get<{ id: string; email: string; role: string; name?: string }>('/api/auth/me'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
  });
}

export default function MarketplacePage() {
  const [activeTab, setActiveTab] = useState('swipe');
  const { userId, setUserId, likedDeals, sessionStats } = useMarketplaceStore();

  // Get the actual logged-in user
  const { data: currentUser, isLoading: authLoading, error: authError } = useCurrentUser();

  // Set user ID when we get the current user
  useEffect(() => {
    if (currentUser?.id && currentUser.id !== userId) {
      setUserId(currentUser.id);
    }
  }, [currentUser?.id, userId, setUserId]);

  const currentUserId = userId || currentUser?.id || '';

  // All hooks must be called before any conditional returns
  const { data: user, isLoading: userLoading } = useMarketplaceUser(currentUserId);
  const { data: profile } = useUserBehaviorProfile(currentUserId);
  const { data: offers } = useUserOffers(currentUserId);

  const pendingOffers = offers?.filter((o) => o.status === 'pending') || [];
  const acceptedOffers = offers?.filter((o) => o.status === 'accepted') || [];

  // Show loading while fetching auth
  if (authLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading marketplace...</p>
        </div>
      </div>
    );
  }

  // Show error if auth failed
  if (authError || !currentUserId) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Authentication Required</h2>
          <p className="text-muted-foreground">Please log in to access the marketplace</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border px-4 sm:px-6 py-4">
        <div>
          <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />
            Deal Marketplace
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Swipe through deals matched to your buy boxes
          </p>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{likedDeals.length}</div>
            <div className="text-xs text-muted-foreground">Liked</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-500">{pendingOffers.length}</div>
            <div className="text-xs text-muted-foreground">Pending Offers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">{acceptedOffers.length}</div>
            <div className="text-xs text-muted-foreground">Accepted</div>
          </div>
          {profile && (
            <div className="text-center">
              <div className="text-2xl font-bold text-accent-500">
                {Math.round(profile.likeRate)}%
              </div>
              <div className="text-xs text-muted-foreground">Like Rate</div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border px-6">
          <TabsList className="h-12 bg-transparent">
            <TabsTrigger
              value="swipe"
              className="data-[state=active]:bg-secondary data-[state=active]:text-foreground text-muted-foreground"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Swipe
            </TabsTrigger>
            <TabsTrigger
              value="liked"
              className="data-[state=active]:bg-secondary data-[state=active]:text-foreground text-muted-foreground"
            >
              <Heart className="mr-2 h-4 w-4" />
              Liked ({likedDeals.length})
            </TabsTrigger>
            <TabsTrigger
              value="offers"
              className="data-[state=active]:bg-secondary data-[state=active]:text-foreground text-muted-foreground"
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Offers
              {pendingOffers.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 px-1.5">
                  {pendingOffers.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="data-[state=active]:bg-secondary data-[state=active]:text-foreground text-muted-foreground"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Swipe Tab */}
        <TabsContent value="swipe" className="flex-1 m-0 p-0">
          <div className="h-full bg-background">
            <MarketplaceSwipe userId={currentUserId} />
          </div>
        </TabsContent>

        {/* Liked Tab */}
        <TabsContent value="liked" className="flex-1 m-0 p-6 overflow-auto">
          <LikedDealsGrid userId={currentUserId} />
        </TabsContent>

        {/* Offers Tab */}
        <TabsContent value="offers" className="flex-1 m-0 p-6 overflow-auto">
          <OffersView userId={currentUserId} />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="flex-1 m-0 p-6 overflow-auto">
          <AnalyticsView userId={currentUserId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Liked Deals Grid View
function LikedDealsGrid({ userId }: { userId: string }) {
  const { likedDeals } = useMarketplaceStore();

  if (likedDeals.length === 0) {
    return (
      <Card className="bg-card border">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Heart className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">No liked deals yet</h3>
          <p className="text-muted-foreground mt-1">Swipe right on deals to add them here</p>
        </CardContent>
      </Card>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {likedDeals.map((deal) => (
        <Card key={deal.id} className="bg-card border overflow-hidden group">
          <div className="relative h-40">
            <img
              src={deal.deal.photos?.[0] || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=300&fit=crop'}
              alt="Property"
              className="w-full h-full object-cover"
            />
            <Badge
              className="absolute top-2 right-2 bg-green-500"
            >
              {deal.matchScore}% Match
            </Badge>
            {deal.hasOffer && (
              <Badge className="absolute top-2 left-2 bg-accent-500">
                Offered
              </Badge>
            )}
          </div>
          <CardContent className="p-4">
            <h3 className="font-semibold text-foreground">{formatPrice(deal.deal.price)}</h3>
            <p className="text-sm text-muted-foreground">
              {deal.deal.city}, {deal.deal.state}
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {deal.deal.bedrooms && <span>{deal.deal.bedrooms} bed</span>}
              {deal.deal.bathrooms && <span>{deal.deal.bathrooms} bath</span>}
              {deal.deal.sqft && <span>{deal.deal.sqft.toLocaleString()} sqft</span>}
            </div>
            {!deal.hasOffer && (
              <Button className="w-full mt-3 bg-green-600 hover:bg-green-700" size="sm">
                Make Offer
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Offers View
function OffersView({ userId }: { userId: string }) {
  const { data: offers, isLoading } = useUserOffers(userId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-card border">
            <CardContent className="p-4">
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!offers || offers.length === 0) {
    return (
      <Card className="bg-card border">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">No offers yet</h3>
          <p className="text-muted-foreground mt-1">Like deals and submit offers to see them here</p>
        </CardContent>
      </Card>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
    viewed: 'bg-accent-500/20 text-accent-400 border-accent-500/50',
    countered: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    accepted: 'bg-green-500/20 text-green-400 border-green-500/50',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/50',
    expired: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/50',
  };

  return (
    <div className="space-y-4">
      {offers.map((offer) => (
        <Card key={offer.id} className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-foreground">
                    {formatPrice(offer.offerAmount)}
                  </h3>
                  <Badge variant="outline" className={statusColors[offer.status]}>
                    {offer.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Deal ID: {offer.dealId.slice(0, 8)}...
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>{offer.closingDays} days to close</span>
                  <span className="capitalize">{offer.financeType.replace('_', ' ')}</span>
                  {offer.earnestMoney && (
                    <span>EMD: {formatPrice(offer.earnestMoney)}</span>
                  )}
                </div>
              </div>

              {offer.status === 'countered' && offer.counterOfferAmount && (
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Counter Offer</div>
                  <div className="font-semibold text-purple-400">
                    {formatPrice(offer.counterOfferAmount)}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" className="border-green-600 text-green-400">
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-600 text-red-400">
                      Decline
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Analytics View
function AnalyticsView({ userId }: { userId: string }) {
  const { data: profile, isLoading } = useUserBehaviorProfile(userId);
  const { sessionStats } = useMarketplaceStore();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-card border">
            <CardContent className="p-4">
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!profile) {
    return (
      <Card className="bg-card border">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">Not enough data</h3>
          <p className="text-muted-foreground mt-1">
            Swipe on at least 5 deals to see your analytics
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatPrice = (price: number) => {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="space-y-6">
      {/* Session Stats */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">This Session</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-foreground">{sessionStats.viewed}</div>
              <div className="text-sm text-muted-foreground">Viewed</div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-500">{sessionStats.liked}</div>
              <div className="text-sm text-muted-foreground">Liked</div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-red-500">{sessionStats.passed}</div>
              <div className="text-sm text-muted-foreground">Passed</div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-accent-500">{sessionStats.offers}</div>
              <div className="text-sm text-muted-foreground">Offers Made</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Engagement Metrics */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Engagement</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-foreground">
                {Math.round(profile.likeRate)}%
              </div>
              <div className="text-sm text-muted-foreground">Like Rate</div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-foreground">
                {Math.round(profile.offerRate)}%
              </div>
              <div className="text-sm text-muted-foreground">Offer Rate</div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-foreground">
                {Math.round(profile.avgDealsPerSession)}
              </div>
              <div className="text-sm text-muted-foreground">Deals/Session</div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-foreground">
                {Math.round(profile.implicitPreferences.avgViewDurationLiked / 1000)}s
              </div>
              <div className="text-sm text-muted-foreground">Avg View Time</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Preferences */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Your Preferences (Learned)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-card border">
            <CardContent className="p-4">
              <h4 className="font-medium text-foreground mb-3">Price Range</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg. Liked Price</span>
                  <span className="text-green-400">
                    {formatPrice(profile.implicitPreferences.avgLikedPrice)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg. Passed Price</span>
                  <span className="text-red-400">
                    {formatPrice(profile.implicitPreferences.avgPassedPrice)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sweet Spot</span>
                  <span className="text-foreground">
                    {formatPrice(profile.implicitPreferences.preferredPriceRange.min)} -{' '}
                    {formatPrice(profile.implicitPreferences.preferredPriceRange.max)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border">
            <CardContent className="p-4">
              <h4 className="font-medium text-foreground mb-3">Top Pass Reasons</h4>
              <div className="space-y-2">
                {profile.topPassReasons.slice(0, 4).map((reason) => (
                  <div key={reason.reason} className="flex justify-between text-sm">
                    <span className="text-muted-foreground capitalize">
                      {reason.reason.replace(/_/g, ' ')}
                    </span>
                    <span className="text-foreground">
                      {reason.count} ({Math.round(reason.percentage)}%)
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
