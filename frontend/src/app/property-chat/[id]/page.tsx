'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useGuestAuth, usePublicChatInfo } from '@/hooks/use-public-chat';
import { PublicPropertyChat } from '@/components/deals/PublicPropertyChat';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Home, AlertCircle, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function PublicPropertyChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const propertyId = params.id ? parseInt(params.id as string, 10) : null;
  const magicToken = searchParams.get('token');

  const { isAuthenticated, isLoading: authLoading } = useGuestAuth();
  const { data: chatInfo, isLoading, error } = usePublicChatInfo(propertyId);

  if (isLoading || authLoading) {
    return <PublicChatSkeleton />;
  }

  if (error || !chatInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="bg-card border max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Property not found</p>
            <p className="text-muted-foreground text-center">
              This property discussion link may be invalid or the property is no longer available.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatCurrency = (amount?: number) => {
    if (!amount) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const property = chatInfo.property;
  const propertyAddress = property?.address || chatInfo.propertyAddress || 'Property';
  const propertyCity = property?.city || '';
  const propertyState = property?.state || '';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/Dispotree-icon.png"
              alt="CodeLive"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
            <span className="text-foreground font-semibold">CodeLive</span>
          </Link>
          {!isAuthenticated && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <MessageSquare className="h-4 w-4" />
              Property Discussion
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Property Card - Only show when authenticated */}
        {isAuthenticated && (
          <Card className="bg-card border overflow-hidden">
            <div className="flex items-center gap-4 p-4">
              {/* Property Image - Small */}
              <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-secondary">
                {property?.photoLinks?.[0] ? (
                  <img
                    src={property.photoLinks[0]}
                    alt={propertyAddress}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Home className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Property Info - Compact */}
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-semibold text-foreground truncate">
                  {propertyAddress}
                </h1>
                <p className="text-muted-foreground text-sm flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {propertyCity}{propertyCity && propertyState ? ', ' : ''}{propertyState}
                </p>
              </div>

              {/* Price */}
              {property?.askingPrice && (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 flex-shrink-0">
                  {formatCurrency(property.askingPrice)}
                </Badge>
              )}
            </div>
          </Card>
        )}

        {/* Chat Component */}
        {propertyId && (
          <PublicPropertyChat
            propertyId={propertyId}
            propertyAddress={`${propertyAddress}${propertyCity ? ', ' + propertyCity : ''}${propertyState ? ', ' + propertyState : ''}`}
            magicToken={magicToken}
          />
        )}

        {/* Footer - Only show when not authenticated */}
        {!isAuthenticated && (
          <div className="text-center text-muted-foreground text-xs py-2">
            <p>Join the discussion about this property</p>
          </div>
        )}
      </main>
    </div>
  );
}

function PublicChatSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <Skeleton className="h-8 w-32" />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Card className="bg-card border">
          <CardContent className="py-8">
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
