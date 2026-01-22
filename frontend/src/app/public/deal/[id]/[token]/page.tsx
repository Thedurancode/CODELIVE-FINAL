'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Home,
  DollarSign,
  Bed,
  Bath,
  Maximize,
  Calendar,
  Building2,
  FileText,
  Users,
  Eye,
  MessageSquare,
  Phone,
  Mail,
  MapPin,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Image from 'next/image';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

interface PublicDealSettings {
  showFinancials: boolean;
  showPropertyDetails: boolean;
  showOccupancy: boolean;
  showFeatures: boolean;
  showDocuments: boolean;
  showCompliance: boolean;
  showViewers: boolean;
  showBuyers: boolean;
  showOffers: boolean;
  showSkipTrace: boolean;
  showContacts: boolean;
  showDiscussion: boolean;
  showPhotos: boolean;
}

export default function PublicDealPage() {
  const params = useParams();
  const propertyId = params.id as string;
  const token = params.token as string;

  const [property, setProperty] = useState<any>(null);
  const [settings, setSettings] = useState<PublicDealSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [joiningDiscussion, setJoiningDiscussion] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    fetchPublicDeal();
  }, [propertyId, token]);

  const fetchPublicDeal = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/public/deal/${propertyId}/${token}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Deal not found or link has expired');
        }
        if (response.status === 403) {
          throw new Error('Invalid access token');
        }
        throw new Error('Failed to load deal');
      }

      const data = await response.json();
      setProperty(data.data.property);
      setSettings(data.data.settings);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinDiscussion = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }

    try {
      setJoiningDiscussion(true);
      const response = await fetch(`/api/public/deal/${propertyId}/join-discussion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, token }),
      });

      if (!response.ok) throw new Error('Failed to join discussion');

      toast.success('Joined discussion! You can now chat about this property.');
      // Refresh to show discussion interface
      fetchPublicDeal();
    } catch (err) {
      toast.error('Failed to join discussion');
    } finally {
      setJoiningDiscussion(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Error</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!property || !settings) {
    return null;
  }

  const address = property.address?.houseNumber && property.address?.street
    ? `${property.address.houseNumber} ${property.address.street}`
    : property.propertyAddress || 'Address Not Available';

  const photos = property.photoLinks || [];
  const hasPhotos = photos.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{address}</h1>
              <p className="text-muted-foreground">
                {property.city}, {property.state} {property.zip}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Powered by</p>
              <p className="text-lg font-bold text-accent-600">DispoTree</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Photos */}
        {settings.showPhotos && hasPhotos && (
          <Card>
            <CardContent className="p-0">
              <div className="relative aspect-video bg-muted">
                <Image
                  src={photos[currentPhotoIndex]}
                  alt={`Property photo ${currentPhotoIndex + 1}`}
                  fill
                  className="object-cover rounded-t-lg"
                />
                {photos.length > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2"
                      onClick={() => setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={() => setCurrentPhotoIndex((prev) => (prev + 1) % photos.length)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                      {currentPhotoIndex + 1} / {photos.length}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Financial Summary */}
        {settings.showFinancials && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Financial Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {property.arv && (
                  <div>
                    <p className="text-sm text-muted-foreground">ARV</p>
                    <p className="text-lg font-semibold">{formatCurrency(property.arv)}</p>
                  </div>
                )}
                {property.askingPrice && (
                  <div>
                    <p className="text-sm text-muted-foreground">Asking Price</p>
                    <p className="text-lg font-semibold">{formatCurrency(property.askingPrice)}</p>
                  </div>
                )}
                {property.purchaseContractPrice && (
                  <div>
                    <p className="text-sm text-muted-foreground">Purchase Price</p>
                    <p className="text-lg font-semibold">{formatCurrency(property.purchaseContractPrice)}</p>
                  </div>
                )}
                {property.rehabCost && (
                  <div>
                    <p className="text-sm text-muted-foreground">Rehab Cost</p>
                    <p className="text-lg font-semibold">{formatCurrency(property.rehabCost)}</p>
                  </div>
                )}
                {property.zestimate && (
                  <div>
                    <p className="text-sm text-muted-foreground">Zestimate</p>
                    <p className="text-lg font-semibold">{formatCurrency(property.zestimate)}</p>
                  </div>
                )}
                {property.rentZestimate && (
                  <div>
                    <p className="text-sm text-muted-foreground">Rent Zestimate</p>
                    <p className="text-lg font-semibold">{formatCurrency(property.rentZestimate)}/mo</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Property Details */}
        {settings.showPropertyDetails && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-5 w-5" />
                Property Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {property.propertyType && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-medium">{property.propertyType}</p>
                    </div>
                  </div>
                )}
                {property.bedroomCount && (
                  <div className="flex items-center gap-2">
                    <Bed className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Bedrooms</p>
                      <p className="font-medium">{property.bedroomCount}</p>
                    </div>
                  </div>
                )}
                {property.bathroomCount && (
                  <div className="flex items-center gap-2">
                    <Bath className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Bathrooms</p>
                      <p className="font-medium">{property.bathroomCount}</p>
                    </div>
                  </div>
                )}
                {property.livingSpaceSqFt && (
                  <div className="flex items-center gap-2">
                    <Maximize className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Sq Ft</p>
                      <p className="font-medium">{property.livingSpaceSqFt.toLocaleString()}</p>
                    </div>
                  </div>
                )}
                {property.yearBuilt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Year Built</p>
                      <p className="font-medium">{property.yearBuilt}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Features & Amenities */}
        {settings.showFeatures && (
          <Card>
            <CardHeader>
              <CardTitle>Features & Amenities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <FeatureItem label="Pool" value={property.pool} />
                <FeatureItem label="Solar Panels" value={property.solarPanels} />
                <FeatureItem label="Septic" value={property.septic} />
                <FeatureItem label="Well Water" value={property.wellWater} />
                <FeatureItem label="HOA" value={property.hoa} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Public Discussion */}
        {settings.showDiscussion && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Public Discussion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Join the conversation about this property. Enter your phone number to participate.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    placeholder="Phone Number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                  <Button onClick={handleJoinDiscussion} disabled={joiningDiscussion}>
                    <Phone className="h-4 w-4 mr-2" />
                    Join
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Interested in this property?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Contact us to learn more or schedule a viewing.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1">
                <Phone className="h-4 w-4 mr-2" />
                Call Now
              </Button>
              <Button variant="outline" className="flex-1">
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureItem({ label, value }: { label: string; value: boolean | null | undefined }) {
  const hasValue = value === true || value === false;

  return (
    <div className="flex items-center gap-2">
      {hasValue ? (
        value ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )
      ) : (
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm">{label}</span>
    </div>
  );
}
