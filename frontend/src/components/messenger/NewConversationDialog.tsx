'use client';

import { useState, useEffect } from 'react';
import { Search, MapPin, Home, Building2, Loader2, MessageSquareOff, MessageSquare, ExternalLink, Copy, CheckCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useProperties } from '@/hooks/use-properties';
import { useCreateTeamConversation } from '@/hooks/use-team-chat';
import type { Property, TeamConversation } from '@/types';

export interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversation: TeamConversation) => void;
}

function formatAddress(property: Property): string {
  let addressStr: string;
  if (typeof property.address === 'string') {
    addressStr = property.address;
  } else if (property.address && typeof property.address === 'object') {
    const addr = property.address as { street?: string; houseNumber?: string; address2?: string };
    addressStr = `${addr.houseNumber || ''} ${addr.street || ''}${addr.address2 ? ', ' + addr.address2 : ''}`.trim();
  } else {
    addressStr = 'Address not available';
  }

  const parts = [addressStr];
  if (property.city) parts.push(property.city);
  if (property.state) parts.push(property.state);
  if (property.zip) parts.push(property.zip);
  return parts.join(', ');
}

function getAddressLine(property: Property): string {
  if (typeof property.address === 'string') {
    return property.address;
  } else if (property.address && typeof property.address === 'object') {
    const addr = property.address as { street?: string; houseNumber?: string; address2?: string };
    return `${addr.houseNumber || ''} ${addr.street || ''}${addr.address2 ? ', ' + addr.address2 : ''}`.trim() || 'Address not available';
  }
  return 'Address not available';
}

function formatPrice(price?: number | null): string {
  if (!price) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

type Step = 'choose' | 'search-property' | 'confirm';

export function NewConversationDialog({
  open,
  onOpenChange,
  onConversationCreated,
}: NewConversationDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [step, setStep] = useState<Step>('choose');
  const [conversationType, setConversationType] = useState<'off-record' | 'property' | null>(null);

  const createConversation = useCreateTeamConversation();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch properties with search - only when there's a search query
  const { data: propertiesData, isLoading } = useProperties({
    search: debouncedSearch || undefined,
    limit: 20,
    enabled: debouncedSearch.length >= 2, // Only fetch when 2+ characters typed
  });

  const properties = debouncedSearch.length >= 2 ? (propertiesData?.data || []) : [];

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setDebouncedSearch('');
      setSelectedProperty(null);
      setCustomTitle('');
      setStep('choose');
      setConversationType(null);
    }
  }, [open]);

  const handleChooseOffRecord = () => {
    setConversationType('off-record');
    setSelectedProperty(null);
    setCustomTitle('');
    setStep('confirm');
  };

  const handleChooseProperty = () => {
    setConversationType('property');
    setStep('search-property');
  };

  const handleSelectProperty = (property: Property) => {
    setSelectedProperty(property);
    setCustomTitle(formatAddress(property));
    setStep('confirm');
  };

  const handleBack = () => {
    if (step === 'confirm' && conversationType === 'property') {
      setStep('search-property');
      setSelectedProperty(null);
    } else {
      setStep('choose');
      setConversationType(null);
      setSelectedProperty(null);
      setSearchQuery('');
    }
  };

  const handleCreate = async () => {
    try {
      const conversation = await createConversation.mutateAsync({
        propertyId: selectedProperty?.id ? Number(selectedProperty.id) : undefined,
        title: customTitle || (selectedProperty ? formatAddress(selectedProperty) : 'Off the Record'),
      });
      onConversationCreated(conversation);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'choose':
        return 'New Conversation';
      case 'search-property':
        return 'Select Property';
      case 'confirm':
        return conversationType === 'off-record' ? 'Off the Record' : 'Confirm Conversation';
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 'choose':
        return 'What type of conversation would you like to start?';
      case 'search-property':
        return 'Search for a property to discuss';
      case 'confirm':
        return conversationType === 'off-record'
          ? 'Start a private conversation not linked to any property'
          : 'Confirm the details for this property conversation';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
          <DialogDescription>{getStepDescription()}</DialogDescription>
        </DialogHeader>

        {/* Step 1: Choose conversation type */}
        {step === 'choose' && (
          <div className="grid grid-cols-1 gap-3 py-4">
            <button
              onClick={handleChooseProperty}
              className={cn(
                'flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left',
                'hover:border-primary hover:bg-primary/5'
              )}
            >
              <div className="flex-shrink-0 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Home className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Discuss a Property</p>
                <p className="text-sm text-muted-foreground">
                  Link this conversation to a specific property deal
                </p>
              </div>
            </button>

            <button
              onClick={handleChooseOffRecord}
              className={cn(
                'flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left',
                'hover:border-orange-500 hover:bg-orange-500/5'
              )}
            >
              <div className="flex-shrink-0 h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <MessageSquareOff className="h-6 w-6 text-orange-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Off the Record</p>
                <p className="text-sm text-muted-foreground">
                  General team chat not linked to any property
                </p>
              </div>
            </button>
          </div>
        )}

        {/* Step 2: Search and select property */}
        {step === 'search-property' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by address, city, or zip..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {/* Property List */}
            <ScrollArea className="flex-1 -mx-6 px-6 min-h-[200px]">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : properties.length > 0 ? (
                <div className="space-y-2">
                  {properties.map((property) => (
                    <ContextMenu key={property.id}>
                      <ContextMenuTrigger asChild>
                        <button
                          onClick={() => handleSelectProperty(property)}
                          className={cn(
                            'w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left',
                            'hover:bg-muted/50 hover:border-primary/50'
                          )}
                        >
                          <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            {property.propertyType === 'multi_family' ? (
                              <Building2 className="h-5 w-5 text-primary" />
                            ) : (
                              <Home className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {getAddressLine(property)}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {property.city}, {property.state} {property.zip}
                            </p>
                            {property.askingPrice && (
                              <p className="text-xs font-medium text-primary mt-1">
                                {formatPrice(property.askingPrice)}
                              </p>
                            )}
                          </div>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48">
                        <ContextMenuItem onClick={() => handleSelectProperty(property)}>
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Start Conversation
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => window.open(`/deals/${property.id}`, '_blank')}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View Property
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => {
                            navigator.clipboard.writeText(formatAddress(property));
                            toast.success('Address copied to clipboard');
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Address
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              ) : searchQuery && searchQuery.length < 2 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Type at least 2 characters to search
                  </p>
                </div>
              ) : searchQuery ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MapPin className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No properties found matching &quot;{searchQuery}&quot;
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Start typing an address to search
                  </p>
                </div>
              )}
            </ScrollArea>

            {/* Back button */}
            <div className="pt-4 border-t mt-4">
              <Button variant="outline" onClick={handleBack} className="w-full">
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            {/* Selected Property Preview (for property conversations) */}
            {selectedProperty && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Home className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {getAddressLine(selectedProperty)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedProperty.city}, {selectedProperty.state} {selectedProperty.zip}
                  </p>
                  {selectedProperty.askingPrice && (
                    <p className="text-xs font-medium text-primary mt-1">
                      {formatPrice(selectedProperty.askingPrice)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Off the record indicator */}
            {conversationType === 'off-record' && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <MessageSquareOff className="h-5 w-5 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Off the Record</p>
                  <p className="text-xs text-muted-foreground">
                    This conversation won&apos;t be linked to any property
                  </p>
                </div>
              </div>
            )}

            {/* Custom Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Conversation Title</Label>
              <Input
                id="title"
                placeholder={conversationType === 'off-record'
                  ? "e.g., Team sync, Quick question..."
                  : "Enter a title for this conversation..."}
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {selectedProperty
                  ? 'Defaults to property address if left empty'
                  : 'Give this conversation a descriptive title'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createConversation.isPending}
                className="flex-1"
              >
                {createConversation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Start Conversation'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default NewConversationDialog;
