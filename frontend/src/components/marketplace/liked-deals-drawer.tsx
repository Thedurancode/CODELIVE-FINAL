'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, DollarSign, Check, Clock, AlertCircle, Mail, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { DealCardCompact } from './deal-card';
import { useMarketplaceStore } from '@/stores/marketplace-store';
import type { MarketplaceDeal } from '@/types/marketplace';

interface LikedDealsDrawerProps {
  open: boolean;
  onClose: () => void;
  onMakeOffer: (deal: MarketplaceDeal) => void;
  onViewDeal?: (deal: MarketplaceDeal) => void;
}

export function LikedDealsDrawer({
  open,
  onClose,
  onMakeOffer,
  onViewDeal,
}: LikedDealsDrawerProps) {
  const { likedDeals, removeLikedDeal, sessionStats, userId } = useMarketplaceStore();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportDeals = async () => {
    if (!userId) {
      toast.error('User not found. Please refresh the page.');
      return;
    }

    if (likedDeals.length === 0) {
      toast.error('No liked deals to export');
      return;
    }

    setIsExporting(true);
    try {
      await api.post(`/api/marketplace/users/${userId}/export/email`);
      toast.success('Export sent! Check your email for the CSV and PDF attachments.');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to send export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-background/50"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-background shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                  <Heart className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h2 className="font-semibold">Liked Deals</h2>
                  <p className="text-sm text-muted-foreground">
                    {likedDeals.length} deal{likedDeals.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExportDeals}
                  disabled={isExporting || likedDeals.length === 0}
                  title="Email liked deals as CSV & PDF"
                >
                  {isExporting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Mail className="h-5 w-5" />
                  )}
                </Button>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Session stats */}
            <div className="flex gap-4 border-b px-4 py-3">
              <div className="text-center">
                <div className="text-lg font-semibold">{sessionStats.viewed}</div>
                <div className="text-xs text-muted-foreground">Viewed</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-green-600">{sessionStats.liked}</div>
                <div className="text-xs text-muted-foreground">Liked</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-red-500">{sessionStats.passed}</div>
                <div className="text-xs text-muted-foreground">Passed</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-accent-600">{sessionStats.offers}</div>
                <div className="text-xs text-muted-foreground">Offers</div>
              </div>
            </div>

            {/* Deals list */}
            <ScrollArea className="flex-1">
              {likedDeals.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <Heart className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium">No liked deals yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Swipe right on deals you&apos;re interested in
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {likedDeals.map((likedDeal, index) => (
                    <motion.div
                      key={likedDeal.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group relative"
                    >
                      <DealCardCompact
                        deal={likedDeal}
                        onClick={() => onViewDeal?.(likedDeal)}
                        onMakeOffer={() => onMakeOffer(likedDeal)}
                        showOfferButton={!likedDeal.hasOffer}
                      />

                      {/* Status badges */}
                      <div className="absolute right-2 top-2 flex gap-1">
                        {likedDeal.hasOffer ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            <Check className="mr-1 h-3 w-3" />
                            Offered
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="mr-1 h-3 w-3" />
                            {formatTimeAgo(likedDeal.likedAt)}
                          </Badge>
                        )}
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLikedDeal(likedDeal.id);
                        }}
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Footer with summary */}
            {likedDeals.length > 0 && (
              <div className="border-t px-4 py-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Value</span>
                  <span className="font-semibold">
                    {formatPrice(likedDeals.reduce((sum, d) => sum + d.deal.price, 0))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pending Offers</span>
                  <span className="font-semibold">
                    {likedDeals.filter((d) => !d.hasOffer).length} deals
                  </span>
                </div>

                {likedDeals.some((d) => !d.hasOffer) && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <p>
                      You have {likedDeals.filter((d) => !d.hasOffer).length} liked deal
                      {likedDeals.filter((d) => !d.hasOffer).length !== 1 ? 's' : ''} without
                      offers. Submit offers before they expire!
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
