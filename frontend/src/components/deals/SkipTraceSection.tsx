'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  UserSearch,
  Phone,
  Mail,
  Copy,
  Check,
  RefreshCw,
  User,
  AlertCircle,
  MapPin,
  Building2,
  Calendar,
  Shield,
  ChevronRight,
  Smartphone,
  Home,
  Users,
  Clock,
  Signal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Property } from '@/types';
import { api } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SkipTraceSectionProps {
  property: Property;
}

// Types for the full skip trace data from marketDataEnrichment
interface PhoneInfo {
  number: string;
  type?: 'mobile' | 'landline' | 'voip' | 'unknown';
  carrier?: string;
  isPrimary?: boolean;
}

interface OwnerInfo {
  name: string;
  firstName?: string;
  lastName?: string;
  phones?: PhoneInfo[];
  emails?: string[];
  age?: number;
  ageRange?: string;
  associatedAddresses?: string[];
}

interface SkipTraceData {
  owners: OwnerInfo[];
  ownerOccupied?: boolean;
  ownershipType?: string;
  mailingAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  lastUpdated?: string;
  dataSource?: string;
  confidence?: number;
}

interface MarketDataEnrichment {
  skipTrace?: SkipTraceData;
  fetchedAt?: string;
}

export function SkipTraceSection({ property }: SkipTraceSectionProps) {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const queryClient = useQueryClient();

  const hasSkipTrace = property.ownerName ||
    (property.ownerPhones && property.ownerPhones.length > 0) ||
    (property.ownerEmails && property.ownerEmails.length > 0) ||
    property.ownerMailingAddress;

  // Get full skip trace data from marketDataEnrichment
  const enrichment = property.marketDataEnrichment as MarketDataEnrichment | undefined;
  const fullSkipTrace = enrichment?.skipTrace;

  // Mutation to refresh skip trace data
  const refreshSkipTrace = useMutation({
    mutationFn: async () => {
      const address = `${property.address?.houseNumber || ''} ${property.address?.street || ''}`.trim();
      const response = await api.post<{ success: boolean; data: unknown }>('/api/market-data/skip-trace', {
        address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        propertyId: property.id,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', property.id] });
      toast.success('Skip trace data refreshed');
    },
    onError: (error) => {
      console.error('Skip trace error:', error);
      toast.error('Failed to fetch skip trace data');
    },
  });

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(text);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedItem(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11) {
      return `+${cleaned[0]} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const getPhoneIcon = (type?: string) => {
    switch (type) {
      case 'mobile':
        return Smartphone;
      case 'landline':
        return Phone;
      default:
        return Phone;
    }
  };

  const getPhoneTypeBadge = (type?: string) => {
    switch (type) {
      case 'mobile':
        return <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">Mobile</Badge>;
      case 'landline':
        return <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">Landline</Badge>;
      case 'voip':
        return <Badge variant="outline" className="text-xs text-purple-400 border-purple-500/30">VoIP</Badge>;
      default:
        return null;
    }
  };

  const getOwnershipTypeBadge = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'individual':
        return <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30">Individual</Badge>;
      case 'trust':
        return <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30">Trust</Badge>;
      case 'llc':
        return <Badge className="bg-orange-600/20 text-orange-400 border-orange-500/30">LLC</Badge>;
      case 'corporation':
        return <Badge className="bg-red-600/20 text-red-400 border-red-500/30">Corporation</Badge>;
      default:
        return type ? <Badge className="bg-zinc-600/20 text-muted-foreground border-zinc-500/30">{type}</Badge> : null;
    }
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-muted-foreground';
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <>
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-foreground">
              <UserSearch className="h-5 w-5 text-purple-500" />
              Skip Trace
            </span>
            <div className="flex items-center gap-2">
              {hasSkipTrace && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDetailDialog(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                  Details
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refreshSkipTrace.mutate()}
                disabled={refreshSkipTrace.isPending}
                className="text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshSkipTrace.isPending ? 'animate-spin' : ''}`} />
                {refreshSkipTrace.isPending ? 'Fetching...' : 'Refresh'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasSkipTrace ? (
            <div className="flex flex-col items-center justify-center py-8">
              <UserSearch className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm mb-4">No owner information available</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshSkipTrace.mutate()}
                disabled={refreshSkipTrace.isPending}
                className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
              >
                <UserSearch className="h-4 w-4 mr-2" />
                Run Skip Trace
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Owner Name - Clickable */}
              {property.ownerName && (
                <button
                  onClick={() => setShowDetailDialog(true)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Owner</div>
                      <div className="text-foreground font-medium">{property.ownerName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {fullSkipTrace?.ownershipType && getOwnershipTypeBadge(fullSkipTrace.ownershipType)}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              )}

              {/* Phone Numbers - Clickable */}
              {property.ownerPhones && property.ownerPhones.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide px-1">Phone Numbers</div>
                  {property.ownerPhones.slice(0, 2).map((phone, index) => {
                    const phoneInfo = fullSkipTrace?.owners?.[0]?.phones?.[index];
                    return (
                      <button
                        key={index}
                        onClick={() => setShowDetailDialog(true)}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                            <Phone className="h-4 w-4 text-green-400" />
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={`tel:${phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-foreground hover:text-green-400 transition-colors"
                            >
                              {formatPhone(phone)}
                            </a>
                            {index === 0 && (
                              <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">
                                Primary
                              </Badge>
                            )}
                            {phoneInfo?.type && getPhoneTypeBadge(phoneInfo.type)}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(phone, 'Phone number');
                            }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {copiedItem === phone ? (
                              <Check className="h-4 w-4 text-green-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </button>
                    );
                  })}
                  {property.ownerPhones.length > 2 && (
                    <button
                      onClick={() => setShowDetailDialog(true)}
                      className="w-full text-sm text-purple-400 hover:text-purple-300 py-1"
                    >
                      +{property.ownerPhones.length - 2} more phone{property.ownerPhones.length - 2 > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              )}

              {/* Email Addresses - Clickable */}
              {property.ownerEmails && property.ownerEmails.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide px-1">Email Addresses</div>
                  {property.ownerEmails.slice(0, 2).map((email, index) => (
                    <button
                      key={index}
                      onClick={() => setShowDetailDialog(true)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <Mail className="h-4 w-4 text-blue-400" />
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={`mailto:${email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-foreground hover:text-blue-400 transition-colors"
                          >
                            {email}
                          </a>
                          {index === 0 && (
                            <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">
                              Primary
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(email, 'Email');
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedItem === email ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </button>
                  ))}
                  {property.ownerEmails.length > 2 && (
                    <button
                      onClick={() => setShowDetailDialog(true)}
                      className="w-full text-sm text-purple-400 hover:text-purple-300 py-1"
                    >
                      +{property.ownerEmails.length - 2} more email{property.ownerEmails.length - 2 > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              )}

              {/* Quick Stats */}
              <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
                {fullSkipTrace?.confidence !== undefined && (
                  <div className="flex items-center gap-1">
                    <Signal className={cn("h-3 w-3", getConfidenceColor(fullSkipTrace.confidence))} />
                    <span>{fullSkipTrace.confidence}% confidence</span>
                  </div>
                )}
                {fullSkipTrace?.ownerOccupied !== undefined && (
                  <div className="flex items-center gap-1">
                    <Home className="h-3 w-3" />
                    <span>{fullSkipTrace.ownerOccupied ? 'Owner Occupied' : 'Non-Owner Occupied'}</span>
                  </div>
                )}
              </div>

              {/* Data Source Note */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                <AlertCircle className="h-3 w-3" />
                <span>Data sourced from public records. Verify before contacting.</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] bg-card border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <UserSearch className="h-5 w-5 text-purple-500" />
              Skip Trace Details
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-6">
              {/* Confidence & Metadata */}
              <div className="flex flex-wrap gap-3">
                {fullSkipTrace?.confidence !== undefined && (
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg",
                    fullSkipTrace.confidence >= 80 ? "bg-green-500/10" :
                    fullSkipTrace.confidence >= 60 ? "bg-yellow-500/10" : "bg-red-500/10"
                  )}>
                    <Shield className={cn("h-4 w-4", getConfidenceColor(fullSkipTrace.confidence))} />
                    <span className={cn("text-sm font-medium", getConfidenceColor(fullSkipTrace.confidence))}>
                      {fullSkipTrace.confidence}% Confidence
                    </span>
                  </div>
                )}
                {fullSkipTrace?.ownerOccupied !== undefined && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {fullSkipTrace.ownerOccupied ? 'Owner Occupied' : 'Non-Owner Occupied'}
                    </span>
                  </div>
                )}
                {fullSkipTrace?.ownershipType && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {getOwnershipTypeBadge(fullSkipTrace.ownershipType)}
                  </div>
                )}
                {enrichment?.fetchedAt && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      Fetched {format(new Date(enrichment.fetchedAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
              </div>

              <Separator className="bg-secondary" />

              {/* Owners Section */}
              {fullSkipTrace?.owners && fullSkipTrace.owners.length > 0 ? (
                fullSkipTrace.owners.map((owner, ownerIndex) => (
                  <div key={ownerIndex} className="space-y-4">
                    {fullSkipTrace.owners.length > 1 && (
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-purple-400" />
                        <span className="text-sm font-medium text-purple-400">
                          Owner {ownerIndex + 1}
                        </span>
                      </div>
                    )}

                    {/* Owner Name */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                          <User className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">Name</div>
                          <div className="text-foreground font-medium">{owner.name}</div>
                          {(owner.age || owner.ageRange) && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {owner.age ? `Age ${owner.age}` : owner.ageRange}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(owner.name, 'Owner name')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedItem === owner.name ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    {/* Phone Numbers */}
                    {owner.phones && owner.phones.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide px-1">
                          Phone Numbers ({owner.phones.length})
                        </div>
                        {owner.phones.map((phone, phoneIndex) => {
                          const PhoneIcon = getPhoneIcon(phone.type);
                          return (
                            <div
                              key={phoneIndex}
                              className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                                  <PhoneIcon className="h-4 w-4 text-green-400" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={`tel:${phone.number}`}
                                      className="text-foreground hover:text-green-400 transition-colors"
                                    >
                                      {formatPhone(phone.number)}
                                    </a>
                                    {phone.isPrimary && (
                                      <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">
                                        Primary
                                      </Badge>
                                    )}
                                    {phone.type && getPhoneTypeBadge(phone.type)}
                                  </div>
                                  {phone.carrier && (
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      Carrier: {phone.carrier}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(phone.number, 'Phone number')}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                {copiedItem === phone.number ? (
                                  <Check className="h-4 w-4 text-green-400" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Email Addresses */}
                    {owner.emails && owner.emails.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide px-1">
                          Email Addresses ({owner.emails.length})
                        </div>
                        {owner.emails.map((email, emailIndex) => (
                          <div
                            key={emailIndex}
                            className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <Mail className="h-4 w-4 text-blue-400" />
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={`mailto:${email}`}
                                  className="text-foreground hover:text-blue-400 transition-colors"
                                >
                                  {email}
                                </a>
                                {emailIndex === 0 && (
                                  <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">
                                    Primary
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(email, 'Email')}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {copiedItem === email ? (
                                <Check className="h-4 w-4 text-green-400" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Associated Addresses */}
                    {owner.associatedAddresses && owner.associatedAddresses.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide px-1">
                          Associated Addresses ({owner.associatedAddresses.length})
                        </div>
                        {owner.associatedAddresses.map((address, addrIndex) => (
                          <div
                            key={addrIndex}
                            className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                                <MapPin className="h-4 w-4 text-orange-400" />
                              </div>
                              <div className="text-foreground text-sm">{address}</div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(address, 'Address')}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {copiedItem === address ? (
                                <Check className="h-4 w-4 text-green-400" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {ownerIndex < fullSkipTrace.owners.length - 1 && (
                      <Separator className="bg-secondary my-4" />
                    )}
                  </div>
                ))
              ) : (
                // Fallback to simple data if no full skip trace
                <div className="space-y-4">
                  {property.ownerName && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                          <User className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">Owner</div>
                          <div className="text-foreground font-medium">{property.ownerName}</div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(property.ownerName!, 'Owner name')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedItem === property.ownerName ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}

                  {property.ownerPhones && property.ownerPhones.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide px-1">Phone Numbers</div>
                      {property.ownerPhones.map((phone, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                              <Phone className="h-4 w-4 text-green-400" />
                            </div>
                            <a
                              href={`tel:${phone}`}
                              className="text-foreground hover:text-green-400 transition-colors"
                            >
                              {formatPhone(phone)}
                            </a>
                            {index === 0 && (
                              <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">
                                Primary
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(phone, 'Phone number')}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {copiedItem === phone ? (
                              <Check className="h-4 w-4 text-green-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {property.ownerEmails && property.ownerEmails.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide px-1">Email Addresses</div>
                      {property.ownerEmails.map((email, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                              <Mail className="h-4 w-4 text-blue-400" />
                            </div>
                            <a
                              href={`mailto:${email}`}
                              className="text-foreground hover:text-blue-400 transition-colors"
                            >
                              {email}
                            </a>
                            {index === 0 && (
                              <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">
                                Primary
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(email, 'Email')}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {copiedItem === email ? (
                              <Check className="h-4 w-4 text-green-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mailing Address */}
              {(property.ownerMailingAddress || fullSkipTrace?.mailingAddress) && (
                <>
                  <Separator className="bg-secondary" />
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide px-1">Mailing Address</div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                          <MapPin className="h-4 w-4 text-orange-400" />
                        </div>
                        <div className="text-foreground">
                          {fullSkipTrace?.mailingAddress
                            ? `${fullSkipTrace.mailingAddress.street}, ${fullSkipTrace.mailingAddress.city}, ${fullSkipTrace.mailingAddress.state} ${fullSkipTrace.mailingAddress.zip}`
                            : property.ownerMailingAddress}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(
                          fullSkipTrace?.mailingAddress
                            ? `${fullSkipTrace.mailingAddress.street}, ${fullSkipTrace.mailingAddress.city}, ${fullSkipTrace.mailingAddress.state} ${fullSkipTrace.mailingAddress.zip}`
                            : property.ownerMailingAddress!,
                          'Mailing address'
                        )}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedItem === (fullSkipTrace?.mailingAddress
                          ? `${fullSkipTrace.mailingAddress.street}, ${fullSkipTrace.mailingAddress.city}, ${fullSkipTrace.mailingAddress.state} ${fullSkipTrace.mailingAddress.zip}`
                          : property.ownerMailingAddress) ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Data Source Warning */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground pt-4 p-3 rounded-lg bg-secondary/30">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-muted-foreground">Data Source Notice</p>
                  <p className="mt-1">
                    This information is sourced from public records and third-party data providers.
                    Always verify contact information before reaching out. Data accuracy may vary.
                  </p>
                  {fullSkipTrace?.dataSource && (
                    <p className="mt-1 text-muted-foreground">Source: {fullSkipTrace.dataSource}</p>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
