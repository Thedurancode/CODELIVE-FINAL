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
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  HandCoins,
  User,
  Building2,
  Phone,
  Mail,
  Calendar,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Check,
  X,
  MessageSquare,
} from 'lucide-react';
import {
  useDealOffers,
  useRespondToOffer,
  formatCurrency,
  getOfferStatusColor,
  getOfferStatusLabel,
  DealOfferWithUser,
} from '@/hooks/use-deal-offers';
import { FINANCE_TYPE_LABELS } from '@/types/marketplace';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface OffersSectionProps {
  propertyId: string;
}

export function OffersSection({ propertyId }: OffersSectionProps) {
  const { data: offers, isLoading, error } = useDealOffers(propertyId);
  const respondToOffer = useRespondToOffer();
  const [expanded, setExpanded] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<DealOfferWithUser | null>(null);
  const [counterDialogOpen, setCounterDialogOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterDays, setCounterDays] = useState('');
  const [counterNotes, setCounterNotes] = useState('');

  const displayOffers = expanded ? offers : offers?.slice(0, 3);
  const pendingCount = offers?.filter((o) => o.status === 'pending' || o.status === 'viewed').length || 0;

  const handleAccept = async (offer: DealOfferWithUser) => {
    try {
      await respondToOffer.mutateAsync({
        offerId: offer.id,
        dealId: propertyId,
        response: 'accepted',
      });
      toast.success('Offer accepted!');
      setSelectedOffer(null);
    } catch {
      toast.error('Failed to accept offer');
    }
  };

  const handleReject = async (offer: DealOfferWithUser) => {
    try {
      await respondToOffer.mutateAsync({
        offerId: offer.id,
        dealId: propertyId,
        response: 'rejected',
      });
      toast.success('Offer rejected');
      setSelectedOffer(null);
    } catch {
      toast.error('Failed to reject offer');
    }
  };

  const handleCounter = async () => {
    if (!selectedOffer || !counterAmount) return;
    try {
      await respondToOffer.mutateAsync({
        offerId: selectedOffer.id,
        dealId: propertyId,
        response: 'countered',
        counterOffer: {
          amount: Number(counterAmount),
          closingDays: counterDays ? Number(counterDays) : undefined,
          notes: counterNotes || undefined,
        },
      });
      toast.success('Counter offer sent!');
      setCounterDialogOpen(false);
      setSelectedOffer(null);
      setCounterAmount('');
      setCounterDays('');
      setCounterNotes('');
    } catch {
      toast.error('Failed to send counter offer');
    }
  };

  const openCounterDialog = (offer: DealOfferWithUser) => {
    setSelectedOffer(offer);
    setCounterAmount(String(offer.offerAmount));
    setCounterDays(String(offer.closingDays));
    setCounterDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <HandCoins className="h-5 w-5 text-green-500" />
            Offers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <HandCoins className="h-5 w-5 text-green-500" />
            Offers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load offers</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-foreground">
              <HandCoins className="h-5 w-5 text-green-500" />
              Offers
            </span>
            <div className="flex gap-2">
              {pendingCount > 0 && (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  {pendingCount} pending
                </Badge>
              )}
              {offers && offers.length > 0 && (
                <Badge variant="outline" className="text-muted-foreground border">
                  {offers.length} total
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!offers || offers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <HandCoins className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">No offers yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayOffers?.map((offer) => (
                <div
                  key={offer.id}
                  className="p-4 rounded-lg bg-secondary/50 border border/50 hover:border transition-colors cursor-pointer"
                  onClick={() => setSelectedOffer(offer)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-green-400 font-semibold text-lg">
                          {formatCurrency(offer.offerAmount)}
                        </span>
                        <Badge
                          variant="outline"
                          className={getOfferStatusColor(offer.status)}
                        >
                          {getOfferStatusLabel(offer.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {offer.user && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {offer.user.name}
                          </span>
                        )}
                        {offer.user?.company && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {offer.user.company}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {offer.closingDays} days
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(offer.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                    {(offer.status === 'pending' || offer.status === 'viewed') && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAccept(offer);
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReject(offer);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {offers.length > 3 && (
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-foreground"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-2" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Show all {offers.length} offers
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Offer Details Dialog */}
      <Dialog open={!!selectedOffer && !counterDialogOpen} onOpenChange={() => setSelectedOffer(null)}>
        <DialogContent className="bg-card border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-green-500" />
              Offer Details
            </DialogTitle>
          </DialogHeader>
          {selectedOffer && (
            <div className="space-y-4">
              {/* Amount and Status */}
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-green-400">
                  {formatCurrency(selectedOffer.offerAmount)}
                </span>
                <Badge
                  variant="outline"
                  className={getOfferStatusColor(selectedOffer.status)}
                >
                  {getOfferStatusLabel(selectedOffer.status)}
                </Badge>
              </div>

              {/* Buyer Info */}
              {selectedOffer.user && (
                <div className="p-3 rounded-lg bg-secondary/50 space-y-2">
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {selectedOffer.user.name}
                  </div>
                  {selectedOffer.user.company && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Building2 className="h-4 w-4" />
                      {selectedOffer.user.company}
                    </div>
                  )}
                  {selectedOffer.user.email && (
                    <a
                      href={`mailto:${selectedOffer.user.email}`}
                      className="flex items-center gap-2 text-muted-foreground text-sm hover:text-accent-400"
                    >
                      <Mail className="h-4 w-4" />
                      {selectedOffer.user.email}
                    </a>
                  )}
                  {selectedOffer.user.phone && (
                    <a
                      href={`tel:${selectedOffer.user.phone}`}
                      className="flex items-center gap-2 text-muted-foreground text-sm hover:text-accent-400"
                    >
                      <Phone className="h-4 w-4" />
                      {selectedOffer.user.phone}
                    </a>
                  )}
                </div>
              )}

              {/* Offer Details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-muted-foreground text-xs mb-1">Closing Days</div>
                  <div className="text-foreground font-medium flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {selectedOffer.closingDays} days
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-muted-foreground text-xs mb-1">Finance Type</div>
                  <div className="text-foreground font-medium flex items-center gap-1">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    {FINANCE_TYPE_LABELS[selectedOffer.financeType] || selectedOffer.financeType}
                  </div>
                </div>
                {selectedOffer.earnestMoney && (
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <div className="text-muted-foreground text-xs mb-1">Earnest Money</div>
                    <div className="text-foreground font-medium">
                      {formatCurrency(selectedOffer.earnestMoney)}
                    </div>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-muted-foreground text-xs mb-1">Proof of Funds</div>
                  <div className={`font-medium ${selectedOffer.proofOfFunds ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {selectedOffer.proofOfFunds ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>

              {/* Contingencies */}
              {selectedOffer.contingencies && selectedOffer.contingencies.length > 0 && (
                <div>
                  <div className="text-muted-foreground text-xs mb-2">Contingencies</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedOffer.contingencies.map((c) => (
                      <Badge key={c} variant="outline" className="text-foreground border">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedOffer.notes && (
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
                    <MessageSquare className="h-3 w-3" />
                    Notes
                  </div>
                  <p className="text-foreground text-sm">{selectedOffer.notes}</p>
                </div>
              )}

              {/* Counter Offer Info */}
              {selectedOffer.status === 'countered' && selectedOffer.counterOfferAmount && (
                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                  <div className="text-purple-400 text-xs mb-1">Your Counter Offer</div>
                  <div className="text-purple-300 font-bold">
                    {formatCurrency(selectedOffer.counterOfferAmount)}
                  </div>
                  {selectedOffer.counterOfferClosingDays && (
                    <div className="text-purple-300 text-sm">
                      {selectedOffer.counterOfferClosingDays} days closing
                    </div>
                  )}
                  {selectedOffer.counterOfferNotes && (
                    <p className="text-purple-300/80 text-sm mt-1">{selectedOffer.counterOfferNotes}</p>
                  )}
                </div>
              )}

              {/* Actions */}
              {(selectedOffer.status === 'pending' || selectedOffer.status === 'viewed') && (
                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleAccept(selectedOffer)}
                    disabled={respondToOffer.isPending}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                    onClick={() => openCounterDialog(selectedOffer)}
                    disabled={respondToOffer.isPending}
                  >
                    Counter
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                    onClick={() => handleReject(selectedOffer)}
                    disabled={respondToOffer.isPending}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Counter Offer Dialog */}
      <Dialog open={counterDialogOpen} onOpenChange={setCounterDialogOpen}>
        <DialogContent className="bg-card border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>Counter Offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedOffer && (
              <div className="text-sm text-muted-foreground">
                Original offer: {formatCurrency(selectedOffer.offerAmount)}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="counter-amount">Counter Amount ($)</Label>
              <Input
                id="counter-amount"
                type="number"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                className="bg-secondary border"
                placeholder="Enter counter amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="counter-days">Closing Days (optional)</Label>
              <Input
                id="counter-days"
                type="number"
                value={counterDays}
                onChange={(e) => setCounterDays(e.target.value)}
                className="bg-secondary border"
                placeholder="Enter closing days"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="counter-notes">Notes (optional)</Label>
              <Textarea
                id="counter-notes"
                value={counterNotes}
                onChange={(e) => setCounterNotes(e.target.value)}
                className="bg-secondary border"
                placeholder="Add any notes..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCounterDialogOpen(false)}
              className="border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCounter}
              disabled={!counterAmount || respondToOffer.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Send Counter Offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
