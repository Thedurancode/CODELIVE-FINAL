'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Users,
  Flame,
  MapPin,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { useMatchedBuyers } from '@/hooks/use-buyers';
import type { MatchedBuyer, BuyerContact } from '@/types';

interface PotentialBuyersSectionProps {
  propertyId: string;
}

export function PotentialBuyersSection({ propertyId }: PotentialBuyersSectionProps) {
  const { data, isLoading, error } = useMatchedBuyers(propertyId);
  const [expanded, setExpanded] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<MatchedBuyer | null>(null);

  const buyers = data?.data || [];
  const meta = data?.meta;
  const displayBuyers = expanded ? buyers : buyers.slice(0, 3);

  const formatPhone = (phone: string) => phone.replace(/[^+\d]/g, '');

  const getPrimaryContact = (contacts?: BuyerContact[]) => {
    if (!contacts || contacts.length === 0) return null;
    return contacts.find((c) => c.isPrimary) || contacts[0];
  };

  if (isLoading) {
    return (
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Users className="h-5 w-5 text-orange-500" />
            Potential Buyers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return null;
  }

  // Hide section if no matched buyers
  if (!isLoading && buyers.length === 0) {
    return null;
  }

  return (
    <Card className="bg-card border">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-foreground">
            <Users className="h-5 w-5 text-orange-500" />
            Potential Buyers
          </span>
          {meta && (
            <div className="flex gap-2">
              {meta.hotBuyers > 0 && (
                <Badge className="bg-orange-500/20 text-orange-400">
                  <Flame className="h-3 w-3 mr-1" />
                  {meta.hotBuyers} hot
                </Badge>
              )}
              <Badge className="bg-zinc-700 text-foreground">{meta.total} total</Badge>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayBuyers.map((buyer) => {
            const primaryContact = getPrimaryContact(buyer.contacts);
            return (
              <div
                key={buyer.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors"
                onClick={() => setSelectedBuyer(buyer)}
              >
                <div className="flex-shrink-0">
                  {buyer.isHotPotential ? (
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                      <Flame className="h-5 w-5 text-orange-500" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-foreground font-semibold">
                      {buyer.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-foreground font-medium truncate">{buyer.name}</p>
                    {buyer.isHotPotential && (
                      <Badge className="bg-orange-500/20 text-orange-400 text-xs">Hot</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>
                      {buyer.buyingCounties?.length || 0} counties in {buyer.buyingState}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <Badge
                    className={
                      buyer.matchType === 'zipcode'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }
                  >
                    {buyer.matchType === 'zipcode' ? 'Zip Match' : 'County Match'}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    {buyer.purchases6Month} purchases
                  </p>
                </div>
              </div>
            );
          })}

          {buyers.length > 3 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              {expanded ? (
                <>
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Show {buyers.length - 3} More
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>

      {/* Buyer Details Dialog */}
      <Dialog open={!!selectedBuyer} onOpenChange={(open) => !open && setSelectedBuyer(null)}>
        <DialogContent className="bg-card border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              {selectedBuyer?.isHotPotential && <Flame className="h-5 w-5 text-orange-500" />}
              {selectedBuyer?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedBuyer && (
            <div className="space-y-4">
              {/* Match Info */}
              <div className="flex gap-2">
                <Badge
                  className={
                    selectedBuyer.matchType === 'zipcode'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }
                >
                  {selectedBuyer.matchType === 'zipcode' ? 'Zipcode Match' : 'County Match'}
                </Badge>
                {selectedBuyer.isHotPotential && (
                  <Badge className="bg-orange-500/20 text-orange-400">
                    <Flame className="h-3 w-3 mr-1" />
                    Hot Potential
                  </Badge>
                )}
              </div>

              {/* Buyer Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Buying In</p>
                  <p className="text-foreground">
                    {selectedBuyer.buyingCounties?.length || 0} counties in {selectedBuyer.buyingState}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedBuyer.buyingCounties?.slice(0, 5).map((county: string) => (
                      <Badge key={county} className="bg-zinc-700 text-foreground text-xs">
                        {county}
                      </Badge>
                    ))}
                    {selectedBuyer.buyingCounties && selectedBuyer.buyingCounties.length > 5 && (
                      <Badge className="bg-zinc-700 text-foreground text-xs">
                        +{selectedBuyer.buyingCounties.length - 5} more
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Purchases (6 Months)</p>
                  <p className="text-2xl font-bold text-foreground">{selectedBuyer.purchases6Month}</p>
                </div>
              </div>

              {/* Contacts */}
              {selectedBuyer.contacts && selectedBuyer.contacts.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3">Contacts</h4>
                  <div className="space-y-2">
                    {selectedBuyer.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="p-3 bg-secondary rounded-lg border border"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-foreground">
                            {contact.firstName} {contact.lastName}
                          </p>
                          {contact.isPrimary && (
                            <Badge className="bg-accent-500/20 text-accent-400 text-xs">
                              Primary
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {contact.phones?.slice(0, 2).map((phone, idx) => (
                            <a
                              key={idx}
                              href={`tel:${formatPhone(phone.number)}`}
                              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-accent-400"
                            >
                              <Phone className="h-3.5 w-3.5" />
                              {phone.number}
                            </a>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1">
                          {contact.emails?.slice(0, 2).map((email, idx) => (
                            <a
                              key={idx}
                              href={`mailto:${email}`}
                              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-accent-400"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[180px]">{email}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
