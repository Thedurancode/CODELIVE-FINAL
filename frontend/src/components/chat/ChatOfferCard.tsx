'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { OfferCardData } from '@/lib/chat-parser';
import {
  DollarSign,
  User,
  Clock,
  FileText,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
} from 'lucide-react';

interface ChatOfferCardProps {
  data: OfferCardData;
  className?: string;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function getStatusConfig(status?: string) {
  switch (status) {
    case 'draft':
      return {
        label: 'Draft',
        icon: FileText,
        className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
      };
    case 'pending':
      return {
        label: 'Pending',
        icon: Clock,
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      };
    case 'accepted':
      return {
        label: 'Accepted',
        icon: CheckCircle2,
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        icon: XCircle,
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
      };
    case 'countered':
      return {
        label: 'Countered',
        icon: AlertCircle,
        className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      };
    default:
      return {
        label: 'New',
        icon: Send,
        className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      };
  }
}

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ChatOfferCard({ data, className }: ChatOfferCardProps) {
  const router = useRouter();
  const {
    offerId,
    propertyId,
    propertyAddress,
    offerAmount,
    buyerName,
    status,
    expiresAt,
    terms,
  } = data;

  const statusConfig = getStatusConfig(status);
  const StatusIcon = statusConfig.icon;

  const handleViewProperty = () => {
    router.push(`/deals/${propertyId}`);
  };

  const handleViewOffer = () => {
    if (offerId) {
      router.push(`/deals/${propertyId}?tab=offers&offer=${offerId}`);
    } else {
      router.push(`/deals/${propertyId}?tab=offers`);
    }
  };

  return (
    <div className={cn('w-full max-w-sm bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden my-3', className)}>
      {/* Header with Status */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Offer Details</h3>
          <p className="text-xs text-zinc-500 truncate max-w-[200px]">{propertyAddress}</p>
        </div>
        <Badge className={cn('gap-1', statusConfig.className)}>
          <StatusIcon className="h-3 w-3" />
          {statusConfig.label}
        </Badge>
      </div>

      {/* Offer Amount */}
      <div className="px-4 py-4 bg-zinc-900/50">
        <div className="flex items-center justify-center gap-2">
          <DollarSign className="h-6 w-6 text-green-400" />
          <span className="text-2xl font-bold text-green-400">
            {formatPrice(offerAmount)}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2">
        {/* Buyer */}
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-zinc-500" />
          <span className="text-zinc-400">Buyer:</span>
          <span className="text-zinc-200 font-medium">{buyerName}</span>
        </div>

        {/* Expires */}
        {expiresAt && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-zinc-500" />
            <span className="text-zinc-400">Expires:</span>
            <span className="text-zinc-200">{formatDate(expiresAt)}</span>
          </div>
        )}

        {/* Terms */}
        {terms && (
          <div className="mt-3 p-2 bg-zinc-800/50 rounded-lg">
            <p className="text-xs text-zinc-400 mb-1">Terms:</p>
            <p className="text-xs text-zinc-300">{terms}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-zinc-800 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs h-8"
          onClick={handleViewOffer}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" />
          View Offer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-xs h-8"
          onClick={handleViewProperty}
        >
          Property
        </Button>
      </div>
    </div>
  );
}

export default ChatOfferCard;
