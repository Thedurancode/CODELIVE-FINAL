'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  Star,
  Trash2,
  X,
  Loader2,
  ImageIcon,
  Check,
  GripVertical,
  Share2,
  Copy,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Camera,
  Clock,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';

// Dynamically import Stripe component to avoid SSR issues
const StripeCheckout = dynamic(() => import('@/components/payments/StripeCheckout'), {
  ssr: false,
});

type ModalView = 'gallery' | 'order' | 'payment';

interface ProxyPicsOrder {
  id: number;
  orderId: string;
  status: 'unassigned' | 'assigned' | 'upload_started' | 'completed' | 'fulfilled' | 'canceled' | 'expired' | 'on_hold';
  address: string;
  createdAt: string;
  expiresAt?: string;
  completedAt?: string;
  downloadPhotosUrl?: string;
  cost?: number;
}

interface ProxyPicsTemplate {
  id: number;
  name: string;
  token: string;
  platform: string;
}

interface PropertyPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  photos: string[];
  onPhotosChange?: (photos: string[]) => void;
  propertyAddress?: string;
}

export function PropertyPhotosModal({
  isOpen,
  onClose,
  propertyId,
  photos: initialPhotos,
  onPhotosChange,
  propertyAddress,
}: PropertyPhotosModalProps) {
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [currentView, setCurrentView] = useState<ModalView>('gallery');
  const [proxyPicsStatus, setProxyPicsStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [proxyPicsOrder, setProxyPicsOrder] = useState<ProxyPicsOrder | null>(null);
  const [proxyPicsTemplates, setProxyPicsTemplates] = useState<ProxyPicsTemplate[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [orderingPhotos, setOrderingPhotos] = useState(false);
  const [loadingProxyPics, setLoadingProxyPics] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [processingOrder, setProcessingOrder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Slideshow handlers
  const openSlideshow = useCallback((index: number) => {
    setSlideshowIndex(index);
    setSlideshowOpen(true);
  }, []);

  const closeSlideshow = useCallback(() => {
    setSlideshowOpen(false);
  }, []);

  const nextSlide = useCallback(() => {
    setSlideshowIndex((prev) => (prev + 1) % photos.length);
  }, [photos.length]);

  const prevSlide = useCallback(() => {
    setSlideshowIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  // Keyboard navigation for slideshow
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!slideshowOpen) return;
    if (e.key === 'Escape') closeSlideshow();
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
  }, [slideshowOpen, closeSlideshow, nextSlide, prevSlide]);

  // Add keyboard listener for slideshow
  useEffect(() => {
    if (slideshowOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [slideshowOpen, handleKeyDown]);

  // Fetch ProxyPics status and templates when order view is opened
  const fetchProxyPicsData = useCallback(async () => {
    setLoadingProxyPics(true);
    try {
      // Fetch status
      const statusResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/proxypics/status`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('dispotree_token')}`,
          },
        }
      );
      const statusData = await statusResponse.json();
      if (statusData.success) {
        setProxyPicsStatus(statusData.data);
      }

      // Fetch templates
      const templatesResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/proxypics/templates`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('dispotree_token')}`,
          },
        }
      );
      const templatesData = await templatesResponse.json();
      if (templatesData.success && templatesData.data) {
        setProxyPicsTemplates(templatesData.data);
      }

      // Check for existing order on this property by fetching property details
      const propertyResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/listings/${propertyId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('dispotree_token')}`,
          },
        }
      );
      const propertyData = await propertyResponse.json();
      if (propertyData.success && propertyData.data?.marketDataEnrichment?.proxyPicsOrderId) {
        // Fetch order status
        const orderId = propertyData.data.marketDataEnrichment.proxyPicsOrderId;
        const orderResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/proxypics/order/${orderId}`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('dispotree_token')}`,
            },
          }
        );
        const orderData = await orderResponse.json();
        if (orderData.success && orderData.data) {
          setProxyPicsOrder(orderData.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch ProxyPics data:', error);
    } finally {
      setLoadingProxyPics(false);
    }
  }, [propertyId]);

  // Fetch ProxyPics data when switching to order view
  useEffect(() => {
    if (currentView === 'order' && isOpen) {
      fetchProxyPicsData();
    }
  }, [currentView, isOpen, fetchProxyPicsData]);

  // Handle ordering photos - Step 1: Create payment intent
  const handleOrderPhotos = useCallback(async () => {
    if (selectedTemplates.length === 0) {
      toast.error('Please select at least one photo template');
      return;
    }

    setOrderingPhotos(true);
    try {
      // Create payment intent
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/payments/create-intent/proxypics`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('dispotree_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            propertyId,
            templateTokens: selectedTemplates,
          }),
        }
      );

      const data = await response.json();

      if (data.success && data.data?.clientSecret) {
        setPaymentClientSecret(data.data.clientSecret);
        setPaymentAmount(data.data.amount);
        setCurrentView('payment');
      } else {
        throw new Error(data.error || 'Failed to create payment intent');
      }
    } catch (error) {
      console.error('Create payment intent error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to initialize payment');
    } finally {
      setOrderingPhotos(false);
    }
  }, [propertyId, selectedTemplates]);

  // Handle successful payment - Step 2: Confirm and place order
  const handlePaymentSuccess = useCallback(async (paymentIntentId: string) => {
    setProcessingOrder(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/payments/confirm-and-order/proxypics`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('dispotree_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentIntentId,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        if (data.data?.order) {
          setProxyPicsOrder(data.data.order);
        }
        toast.success(data.message || 'Photo order placed successfully!');
        queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
        setSelectedTemplates([]);
        setPaymentClientSecret(null);
        setCurrentView('order');
      } else {
        throw new Error(data.error || 'Failed to place order');
      }
    } catch (error) {
      console.error('Confirm order error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to place order after payment');
    } finally {
      setProcessingOrder(false);
    }
  }, [propertyId, queryClient]);

  // Handle payment cancellation
  const handlePaymentCancel = useCallback(() => {
    setPaymentClientSecret(null);
    setPaymentAmount(0);
    setCurrentView('order');
  }, []);

  // Cancel order
  const handleCancelOrder = useCallback(async () => {
    if (!proxyPicsOrder?.orderId) return;
    if (!confirm('Are you sure you want to cancel this order?')) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/proxypics/order/${proxyPicsOrder.orderId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('dispotree_token')}`,
          },
        }
      );
      const data = await response.json();

      if (data.success) {
        setProxyPicsOrder(null);
        toast.success('Order cancelled');
        queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
      } else {
        throw new Error(data.error || 'Failed to cancel order');
      }
    } catch (error) {
      console.error('Cancel order error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to cancel order');
    }
  }, [proxyPicsOrder, propertyId, queryClient]);

  const handleGetShareLink = useCallback(async () => {
    setGeneratingLink(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/public/photos/token/${propertyId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('dispotree_token')}`,
          },
        }
      );
      const data = await response.json();

      if (data.success) {
        setShareLink(data.data.uploadUrl);
      } else {
        throw new Error(data.error || 'Failed to generate link');
      }
    } catch (error) {
      console.error('Share link error:', error);
      toast.error('Failed to generate share link');
    } finally {
      setGeneratingLink(false);
    }
  }, [propertyId]);

  const handleCopyLink = useCallback(async () => {
    if (shareLink) {
      try {
        await navigator.clipboard.writeText(shareLink);
        setLinkCopied(true);
        toast.success('Link copied to clipboard!');
        setTimeout(() => setLinkCopied(false), 2000);
      } catch {
        toast.error('Failed to copy to clipboard');
      }
    }
  }, [shareLink]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append('photos', file);
      });

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/listings/${propertyId}/photos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('dispotree_token')}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setPhotos(data.data.allPhotos);
        onPhotosChange?.(data.data.allPhotos);
        queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
        toast.success(`${files.length} photo(s) uploaded successfully`);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [propertyId, onPhotosChange, queryClient]);

  const handleSetPrimary = useCallback(async (photoUrl: string) => {
    if (photos[0] === photoUrl) return; // Already primary

    setSettingPrimary(photoUrl);
    try {
      // api.put returns data.data (unwrapped), so response IS the data object
      const responseData = await api.put<{ allPhotos: string[]; primaryPhoto: string }>(
        `/api/listings/${propertyId}/photos/primary`,
        { photoUrl }
      );

      if (responseData?.allPhotos) {
        setPhotos(responseData.allPhotos);
        onPhotosChange?.(responseData.allPhotos);
        queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
        toast.success('Primary photo updated');
      }
    } catch (error) {
      console.error('Set primary error:', error);
      toast.error('Failed to set primary photo');
    } finally {
      setSettingPrimary(null);
    }
  }, [photos, propertyId, onPhotosChange, queryClient]);

  const handleDelete = useCallback(async (photoUrl: string) => {
    if (!confirm('Are you sure you want to delete this photo?')) return;

    setDeleting(photoUrl);
    try {
      // Use fetch directly since api.delete doesn't support body
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/listings/${propertyId}/photos`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || localStorage.getItem('dispotree_token')}`,
          },
          body: JSON.stringify({ photoUrl }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setPhotos(data.data.remainingPhotos);
        onPhotosChange?.(data.data.remainingPhotos);
        queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
        toast.success('Photo deleted');
      } else {
        throw new Error(data.error || 'Failed to delete photo');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete photo');
    } finally {
      setDeleting(null);
    }
  }, [propertyId, onPhotosChange, queryClient]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newPhotos = [...photos];
    const draggedPhoto = newPhotos[draggedIndex];
    newPhotos.splice(draggedIndex, 1);
    newPhotos.splice(index, 0, draggedPhoto);
    setPhotos(newPhotos);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;
    setDraggedIndex(null);

    // Save new order to backend
    try {
      await api.put(`/api/listings/${propertyId}/photos/reorder`, { photos });
      onPhotosChange?.(photos);
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
    } catch (error) {
      console.error('Reorder error:', error);
      toast.error('Failed to save photo order');
    }
  };

  const getPhotoUrl = (url: string) => {
    if (url.startsWith('http')) return url;
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${url}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ImageIcon className="h-5 w-5 text-accent-500" />
            Property Photos
            <Badge variant="outline" className="ml-2 bg-secondary text-muted-foreground">
              {photos.length} photos
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Action Buttons */}
          <div className="mb-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex gap-2 mb-4">
              <Button
                onClick={() => { setCurrentView('gallery'); fileInputRef.current?.click(); }}
                disabled={uploading}
                variant={currentView === 'gallery' ? 'default' : 'outline'}
                className={cn(
                  "flex-1 h-12",
                  currentView === 'gallery'
                    ? "bg-accent-600 hover:bg-accent-700"
                    : "border bg-secondary/50 hover:bg-secondary"
                )}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload
              </Button>
              <Button
                onClick={shareLink ? handleCopyLink : handleGetShareLink}
                disabled={generatingLink}
                variant="outline"
                className="flex-1 h-12 border bg-secondary/50 hover:bg-secondary hover:border-blue-500"
              >
                {generatingLink ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : linkCopied ? (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Share2 className="mr-2 h-4 w-4" />
                    Media Upload URL
                  </>
                )}
              </Button>
              <Button
                onClick={() => setCurrentView('order')}
                variant={currentView === 'order' ? 'default' : 'outline'}
                className={cn(
                  "flex-1 h-12",
                  currentView === 'order'
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "border bg-secondary/50 hover:bg-secondary hover:border-green-500"
                )}
              >
                <Camera className="mr-2 h-4 w-4" />
                Order Photos
              </Button>
            </div>

            {/* Share Link Display */}
            {shareLink && currentView === 'gallery' && (
              <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg border border mb-3">
                <span className="text-xs text-muted-foreground truncate flex-1">{shareLink}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyLink}
                  className="shrink-0"
                >
                  {linkCopied ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Order Photos View */}
          {currentView === 'order' && (
            <div className="space-y-4">
              {loadingProxyPics ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-green-500 mb-4" />
                  <p className="text-muted-foreground">Loading ProxyPics...</p>
                </div>
              ) : proxyPicsOrder ? (
                // Show existing order status
                <div className="space-y-4">
                  <div className="p-4 bg-secondary rounded-lg border border">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-foreground">Order Status</h3>
                      <Badge
                        variant="outline"
                        className={cn(
                          proxyPicsOrder.status === 'completed' || proxyPicsOrder.status === 'fulfilled'
                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                            : proxyPicsOrder.status === 'canceled' || proxyPicsOrder.status === 'expired'
                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                            : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                        )}
                      >
                        {proxyPicsOrder.status === 'unassigned' && (
                          <>
                            <Clock className="h-3 w-3 mr-1" />
                            Waiting for Photographer
                          </>
                        )}
                        {proxyPicsOrder.status === 'assigned' && (
                          <>
                            <Clock className="h-3 w-3 mr-1" />
                            Photographer Assigned
                          </>
                        )}
                        {proxyPicsOrder.status === 'upload_started' && (
                          <>
                            <Upload className="h-3 w-3 mr-1" />
                            Uploading Photos
                          </>
                        )}
                        {(proxyPicsOrder.status === 'completed' || proxyPicsOrder.status === 'fulfilled') && (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Completed
                          </>
                        )}
                        {proxyPicsOrder.status === 'canceled' && 'Canceled'}
                        {proxyPicsOrder.status === 'expired' && 'Expired'}
                        {proxyPicsOrder.status === 'on_hold' && 'On Hold'}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Order ID</span>
                        <span className="text-foreground">#{proxyPicsOrder.orderId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Address</span>
                        <span className="text-foreground truncate max-w-[200px]">{proxyPicsOrder.address}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Created</span>
                        <span className="text-foreground">{new Date(proxyPicsOrder.createdAt).toLocaleDateString()}</span>
                      </div>
                      {proxyPicsOrder.expiresAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expires</span>
                          <span className="text-foreground">{new Date(proxyPicsOrder.expiresAt).toLocaleDateString()}</span>
                        </div>
                      )}
                      {proxyPicsOrder.cost !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cost</span>
                          <span className="text-foreground">${proxyPicsOrder.cost.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border">
                      {(proxyPicsOrder.status === 'completed' || proxyPicsOrder.status === 'fulfilled') && proxyPicsOrder.downloadPhotosUrl && (
                        <Button
                          onClick={() => window.open(proxyPicsOrder.downloadPhotosUrl, '_blank')}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Download Photos
                        </Button>
                      )}
                      {(proxyPicsOrder.status === 'unassigned' || proxyPicsOrder.status === 'on_hold') && (
                        <Button
                          onClick={handleCancelOrder}
                          variant="outline"
                          className="flex-1 border-red-600 text-red-500 hover:bg-red-600 hover:text-foreground"
                        >
                          Cancel Order
                        </Button>
                      )}
                      <Button
                        onClick={fetchProxyPicsData}
                        variant="outline"
                        size="icon"
                        className="border"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Info about ordering again */}
                  {(proxyPicsOrder.status === 'completed' || proxyPicsOrder.status === 'fulfilled' ||
                    proxyPicsOrder.status === 'canceled' || proxyPicsOrder.status === 'expired') && (
                    <div className="p-4 bg-secondary/50 rounded-lg border border">
                      <p className="text-sm text-muted-foreground text-center">
                        Order another photo session for this property?
                      </p>
                      <Button
                        onClick={() => setProxyPicsOrder(null)}
                        variant="outline"
                        className="w-full mt-3 border-green-600 text-green-400 hover:bg-green-600 hover:text-foreground"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        New Order
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                // Show order form
                <div className="space-y-4">
                  {/* Not configured warning */}
                  {!proxyPicsStatus?.configured && (
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-yellow-400 font-medium text-sm">ProxyPics Not Configured</p>
                        <p className="text-yellow-500/70 text-xs mt-1">
                          Set PROXYPICS_API_KEY to enable ordering. Showing demo templates.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-secondary rounded-lg border border">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Order Professional Photos</h3>

                    {propertyAddress && (
                      <div className="mb-4 p-3 bg-card rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Property Address</p>
                        <p className="text-foreground">{propertyAddress}</p>
                      </div>
                    )}

                    {/* Templates - show demo templates if none from API */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-muted-foreground">Select Photo Templates</label>
                        {selectedTemplates.length > 0 && (
                          <span className="text-xs text-green-400">{selectedTemplates.length} selected</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {(proxyPicsTemplates.length > 0 ? proxyPicsTemplates : [
                          { token: 'exterior-standard', name: 'Exterior Standard', platform: 'crowdsource' },
                          { token: 'full-property', name: 'Full Property (Interior + Exterior)', platform: 'crowdsource' },
                          { token: 'drive-by', name: 'Drive-By Inspection', platform: 'crowdsource' },
                        ]).map((template) => {
                          const isSelected = selectedTemplates.includes(template.token);
                          return (
                            <button
                              key={template.token}
                              onClick={() => {
                                setSelectedTemplates(prev =>
                                  isSelected
                                    ? prev.filter(t => t !== template.token)
                                    : [...prev, template.token]
                                );
                              }}
                              className={cn(
                                "w-full p-3 rounded-lg border text-left transition-all flex items-center gap-3",
                                isSelected
                                  ? "border-green-500 bg-green-500/10"
                                  : "border bg-card hover:border"
                              )}
                            >
                              <div className={cn(
                                "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0",
                                isSelected
                                  ? "border-green-500 bg-green-500"
                                  : "border"
                              )}>
                                {isSelected && <Check className="h-3 w-3 text-foreground" />}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-foreground">{template.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Platform: {template.platform}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Button
                      onClick={handleOrderPhotos}
                      disabled={orderingPhotos || selectedTemplates.length === 0 || !proxyPicsStatus?.configured}
                      className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                    >
                      {orderingPhotos ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Placing Order...
                        </>
                      ) : (
                        <>
                          <Camera className="mr-2 h-4 w-4" />
                          Order Photos
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">
                      Photos typically delivered within 24 hours
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment View */}
          {currentView === 'payment' && paymentClientSecret && (
            <div className="space-y-4">
              <div className="p-4 bg-secondary rounded-lg border border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Complete Payment</h3>

                {processingOrder ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-green-500 mb-4" />
                    <p className="text-muted-foreground">Processing your order...</p>
                    <p className="text-xs text-muted-foreground mt-2">This may take a few moments</p>
                  </div>
                ) : (
                  <StripeCheckout
                    clientSecret={paymentClientSecret}
                    amount={paymentAmount}
                    onSuccess={handlePaymentSuccess}
                    onCancel={handlePaymentCancel}
                  />
                )}
              </div>
            </div>
          )}

          {/* Photos Grid */}
          {currentView === 'gallery' && (
            photos.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((photo, index) => {
                const isPrimary = index === 0;
                const isSettingPrimary = settingPrimary === photo;
                const isDeleting = deleting === photo;

                return (
                  <div
                    key={photo}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      'relative group rounded-lg overflow-hidden border-2 transition-all cursor-move',
                      isPrimary
                        ? 'border-accent-500 ring-2 ring-accent-500/20'
                        : 'border hover:border',
                      draggedIndex === index && 'opacity-50 scale-95'
                    )}
                  >
                    {/* Primary Badge */}
                    {isPrimary && (
                      <div className="absolute top-2 left-2 z-10">
                        <Badge className="bg-accent-500 text-foreground text-xs">
                          <Star className="h-3 w-3 mr-1 fill-current" />
                          Primary
                        </Badge>
                      </div>
                    )}

                    {/* Drag Handle */}
                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="p-1 bg-background/50 rounded">
                        <GripVertical className="h-4 w-4 text-foreground" />
                      </div>
                    </div>

                    {/* Image */}
                    <div className="aspect-square">
                      <img
                        src={getPhotoUrl(photo)}
                        alt={`Property photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openSlideshow(index)}
                        className="bg-zinc-700 hover:bg-zinc-600 text-foreground"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                      {!isPrimary && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSetPrimary(photo)}
                          disabled={isSettingPrimary}
                          className="bg-accent-600 hover:bg-accent-700 text-white"
                        >
                          {isSettingPrimary ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Star className="h-4 w-4 mr-1" />
                              Set Primary
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(photo)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ImageIcon className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-lg mb-2">No photos yet</p>
                <p className="text-muted-foreground text-sm">
                  Upload photos to showcase this property
                </p>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t border mt-4">
          <p className="text-sm text-muted-foreground">
            Drag photos to reorder • First photo is the primary photo
          </p>
          <Button variant="outline" onClick={onClose} className="border">
            Done
          </Button>
        </div>
      </DialogContent>

      {/* Fullscreen Slideshow */}
      {slideshowOpen && photos.length > 0 && (
        <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={closeSlideshow}
            className="absolute top-4 right-4 z-10 text-foreground hover:bg-white/20 h-12 w-12"
          >
            <X className="h-8 w-8" />
          </Button>

          {/* Photo counter */}
          <div className="absolute top-4 left-4 z-10 text-foreground text-lg font-medium bg-background/50 px-4 py-2 rounded-lg">
            {slideshowIndex + 1} / {photos.length}
          </div>

          {/* Previous button */}
          {photos.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={prevSlide}
              className="absolute left-4 z-10 text-foreground hover:bg-white/20 h-16 w-16"
            >
              <ChevronLeft className="h-12 w-12" />
            </Button>
          )}

          {/* Main image */}
          <div className="w-full h-full flex items-center justify-center p-16">
            <img
              src={getPhotoUrl(photos[slideshowIndex])}
              alt={`Property photo ${slideshowIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Next button */}
          {photos.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={nextSlide}
              className="absolute right-4 z-10 text-foreground hover:bg-white/20 h-16 w-16"
            >
              <ChevronRight className="h-12 w-12" />
            </Button>
          )}

          {/* Thumbnail strip */}
          {photos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-background/50 p-2 rounded-lg max-w-[90vw] overflow-x-auto">
              {photos.map((photo, index) => (
                <button
                  key={photo}
                  onClick={() => setSlideshowIndex(index)}
                  className={cn(
                    'w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all',
                    index === slideshowIndex
                      ? 'border-white ring-2 ring-white/50'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  )}
                >
                  <img
                    src={getPhotoUrl(photo)}
                    alt={`Thumbnail ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
