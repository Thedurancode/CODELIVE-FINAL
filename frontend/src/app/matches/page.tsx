'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  XCircle,
  Home,
  MapPin,
  Bed,
  Bath,
  TrendingUp,
  Star,
  Clock,
  ChevronRight,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Deal {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode?: string;
  price: number;
  arv?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  status?: string;
  photos?: string[];
  equityPercent?: number;
  createdAt: string;
}

interface Match {
  id: string;
  matchType: string;
  matchScore: number;
  matchReasons?: string[];
  status: string;
  viewedAt?: string;
  createdAt: string;
  deal: Deal | null;
}

interface MatchesData {
  user: {
    id: string;
    name: string;
    email: string;
  };
  matches: Match[];
  total: number;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getMatchTypeLabel(matchType: string): string {
  const labels: Record<string, string> = {
    super_like: 'Super Match',
    ml_prediction: 'AI Match',
    buybox_score: 'Buy Box Match',
    priority_match: 'Priority Match',
  };
  return labels[matchType] || 'Match';
}

function getMatchTypeColor(matchType: string): string {
  const colors: Record<string, string> = {
    super_like: 'bg-yellow-500',
    ml_prediction: 'bg-blue-500',
    buybox_score: 'bg-green-500',
    priority_match: 'bg-purple-500',
  };
  return colors[matchType] || 'bg-zinc-500';
}

function DealCard({ match }: { match: Match }) {
  const { deal } = match;

  if (!deal) {
    return (
      <Card className="bg-secondary/50 border">
        <CardContent className="p-6">
          <p className="text-muted-foreground">Deal no longer available</p>
        </CardContent>
      </Card>
    );
  }

  const equity = deal.arv && deal.price ? ((deal.arv - deal.price) / deal.arv * 100) : deal.equityPercent;
  const photoUrl = deal.photos?.[0] || '/placeholder-property.jpg';

  return (
    <Card className="bg-secondary/50 border overflow-hidden hover:border transition-colors">
      {/* Property Image */}
      <div className="relative h-48 bg-card">
        <img
          src={photoUrl}
          alt={deal.address}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder-property.jpg';
          }}
        />
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge className={`${getMatchTypeColor(match.matchType)} text-foreground`}>
            {getMatchTypeLabel(match.matchType)}
          </Badge>
          <Badge className="bg-card/80 text-foreground">
            {match.matchScore}% Match
          </Badge>
        </div>
        {equity && equity > 0 && (
          <div className="absolute top-3 right-3">
            <Badge className="bg-green-600 text-foreground">
              <TrendingUp className="w-3 h-3 mr-1" />
              {equity.toFixed(0)}% Equity
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-4">
        {/* Price */}
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold text-foreground">
            {formatPrice(deal.price)}
          </div>
          {deal.arv && (
            <div className="text-sm text-muted-foreground">
              ARV: {formatPrice(deal.arv)}
            </div>
          )}
        </div>

        {/* Address */}
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <div className="text-foreground font-medium">{deal.address}</div>
            <div className="text-sm text-muted-foreground">
              {deal.city}, {deal.state} {deal.zipCode}
            </div>
          </div>
        </div>

        {/* Property Details */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {deal.bedrooms && (
            <div className="flex items-center gap-1">
              <Bed className="w-4 h-4" />
              <span>{deal.bedrooms} beds</span>
            </div>
          )}
          {deal.bathrooms && (
            <div className="flex items-center gap-1">
              <Bath className="w-4 h-4" />
              <span>{deal.bathrooms} baths</span>
            </div>
          )}
          {deal.sqft && (
            <div className="flex items-center gap-1">
              <Home className="w-4 h-4" />
              <span>{deal.sqft.toLocaleString()} sqft</span>
            </div>
          )}
          {deal.yearBuilt && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Built {deal.yearBuilt}</span>
            </div>
          )}
        </div>

        {/* Match Reasons */}
        {match.matchReasons && match.matchReasons.length > 0 && (
          <div className="pt-3 border-t border">
            <p className="text-xs text-muted-foreground mb-2">Why it's a match:</p>
            <div className="flex flex-wrap gap-1">
              {match.matchReasons.slice(0, 3).map((reason, i) => (
                <Badge key={i} variant="outline" className="text-xs border text-muted-foreground">
                  {reason}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border">
          <div className="text-xs text-muted-foreground">
            Matched {formatDate(match.createdAt)}
          </div>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            onClick={() => {
              toast.info('Please log in to view deal details and make an offer.');
            }}
          >
            View Deal
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MatchesContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<MatchesData | null>(null);
  const [email, setEmail] = useState('');
  const [isRequestingLink, setIsRequestingLink] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No access token provided. Please use the link from your SMS notification.');
      return;
    }

    fetchMatches();
  }, [token]);

  const fetchMatches = async () => {
    try {
      const res = await fetch(`${API_URL}/api/marketplace/matches?token=${token}`);
      const result = await res.json();

      if (!result.success) {
        setStatus('error');
        setError(result.error || 'Failed to load matches');
        return;
      }

      setData(result.data);
      setStatus('success');
    } catch (err) {
      console.error('Failed to fetch matches:', err);
      setStatus('error');
      setError('Failed to load matches. Please try again.');
    }
  };

  const requestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    setIsRequestingLink(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/request-magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const result = await res.json();

      if (result.success) {
        toast.success('A new link has been sent to your email and phone!');
      } else {
        toast.error(result.message || 'Failed to send new link');
      }
    } catch (err) {
      toast.error('Failed to send new link. Please try again.');
    } finally {
      setIsRequestingLink(false);
    }
  };

  return (
    <>
      {/* Header */}
      <header className="border-b border bg-card/80 backdrop-blur sticky top-0">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/dispotree-long-inverted.png"
              alt="CodeLive"
              width={150}
              height={36}
              className="h-8 w-auto"
            />
            {data && (
              <div className="hidden sm:block text-sm text-muted-foreground">
                Welcome, {data.user.name}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border text-foreground hover:bg-secondary"
            onClick={() => window.location.href = '/login'}
          >
            Sign In
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-12 w-12 text-green-500 animate-spin mb-4" />
            <p className="text-muted-foreground">Loading your matched deals...</p>
          </div>
        )}

        {status === 'error' && (
          <Card className="max-w-md mx-auto bg-card/80 border">
            <CardContent className="py-8">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="rounded-full bg-red-500/20 p-4">
                  <XCircle className="h-12 w-12 text-red-500" />
                </div>
                <h2 className="text-xl font-semibold text-foreground">Link Expired</h2>
                <p className="text-muted-foreground">{error}</p>

                <div className="w-full mt-4 pt-4 border-t border">
                  <p className="text-sm text-muted-foreground mb-4">
                    Request a new link to view your matches:
                  </p>
                  <form onSubmit={requestNewLink} className="space-y-4">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full px-4 py-2 bg-secondary/50 border border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-green-500"
                      required
                    />
                    <Button
                      type="submit"
                      className="w-full bg-green-600 hover:bg-green-700"
                      disabled={isRequestingLink}
                    >
                      {isRequestingLink ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Send New Link
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {status === 'success' && data && (
          <>
            {/* Header with count */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Your Matched Deals
              </h1>
              <p className="text-muted-foreground">
                {data.total === 0
                  ? "You don't have any matches yet. Keep swiping!"
                  : `You have ${data.total} deal${data.total > 1 ? 's' : ''} that match your criteria.`}
              </p>
            </div>

            {/* Matches Grid */}
            {data.matches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.matches.map((match) => (
                  <DealCard key={match.id} match={match} />
                ))}
              </div>
            ) : (
              <Card className="bg-card/80 border">
                <CardContent className="py-12 text-center">
                  <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    No Matches Yet
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Browse the marketplace and like deals that match your investment criteria.
                    When you find a great match, it'll show up here!
                  </p>
                  <Button
                    className="mt-6 bg-green-600 hover:bg-green-700"
                    onClick={() => window.location.href = '/login'}
                  >
                    Sign In to Browse Deals
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* CTA Banner */}
            <Card className="mt-8 bg-gradient-to-r from-green-600/20 to-blue-600/20 border-green-600/30">
              <CardContent className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium text-foreground">
                    Want to make an offer?
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Sign in to view full details, make offers, and track your deals.
                  </p>
                </div>
                <Button
                  className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
                  onClick={() => window.location.href = '/login'}
                >
                  Sign In to Continue
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </>
  );
}

function LoadingFallback() {
  return (
    <>
      <header className="border-b border bg-card/80 backdrop-blur sticky top-0">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Image
            src="/dispotree-long-inverted.png"
            alt="CodeLive"
            width={150}
            height={36}
            className="h-8 w-auto"
          />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-12 w-12 text-green-500 animate-spin mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </main>
    </>
  );
}

export default function MatchesPage() {
  return (
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
    >
      {/* Dark overlay */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />

      <div className="relative z-10">
        <Suspense fallback={<LoadingFallback />}>
          <MatchesContent />
        </Suspense>
      </div>
    </div>
  );
}
