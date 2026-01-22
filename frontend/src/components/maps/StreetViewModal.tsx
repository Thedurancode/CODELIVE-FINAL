'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Navigation, MapPin, AlertCircle, Loader2 } from 'lucide-react';

interface StreetViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  city: string;
  state: string;
  zip: string;
}

declare global {
  interface Window {
    google: typeof google;
    initGoogleMaps?: () => void;
  }
}

let googleMapsPromise: Promise<void> | null = null;

function loadGoogleMapsScript(): Promise<void> {
  if (googleMapsPromise) return googleMapsPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API key not configured'));
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }

    window.initGoogleMaps = () => {
      resolve();
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export function StreetViewModal({
  open,
  onOpenChange,
  address,
  city,
  state,
  zip,
}: StreetViewModalProps) {
  const streetViewRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noStreetView, setNoStreetView] = useState(false);

  const fullAddress = `${address}, ${city}, ${state} ${zip}`;

  const initStreetView = useCallback(async () => {
    if (!streetViewRef.current || !open) return;

    setLoading(true);
    setError(null);
    setNoStreetView(false);

    try {
      await loadGoogleMapsScript();

      const geocoder = new google.maps.Geocoder();
      const streetViewService = new google.maps.StreetViewService();

      // Geocode the address to get coordinates
      const geocodeResult = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
        geocoder.geocode({ address: fullAddress }, (results, status) => {
          if (status === 'OK' && results && results.length > 0) {
            resolve(results);
          } else {
            reject(new Error(`Geocoding failed: ${status}`));
          }
        });
      });

      const location = geocodeResult[0].geometry.location;

      // Check if Street View is available at this location
      const streetViewResult = await new Promise<google.maps.StreetViewPanoramaData | null>((resolve) => {
        streetViewService.getPanorama(
          { location, radius: 100 },
          (data, status) => {
            if (status === 'OK' && data) {
              resolve(data);
            } else {
              resolve(null);
            }
          }
        );
      });

      if (!streetViewResult) {
        setNoStreetView(true);
        setLoading(false);

        // Show a map instead when Street View is not available
        new google.maps.Map(streetViewRef.current, {
          center: location,
          zoom: 18,
          mapTypeId: 'satellite',
        });
        return;
      }

      // Create Street View panorama
      panoramaRef.current = new google.maps.StreetViewPanorama(streetViewRef.current, {
        position: streetViewResult.location?.latLng || location,
        pov: {
          heading: 0,
          pitch: 0,
        },
        zoom: 1,
        addressControl: true,
        linksControl: true,
        panControl: true,
        enableCloseButton: false,
        fullscreenControl: true,
      });

      setLoading(false);
    } catch (err) {
      console.error('Street View error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load Street View');
      setLoading(false);
    }
  }, [fullAddress, open]);

  useEffect(() => {
    if (open) {
      // Small delay to ensure the dialog is rendered
      const timer = setTimeout(initStreetView, 100);
      return () => clearTimeout(timer);
    }
  }, [open, initStreetView]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (panoramaRef.current) {
        panoramaRef.current = null;
      }
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-accent-500" />
            Street View
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{fullAddress}</p>
        </DialogHeader>

        <div className="relative w-full" style={{ height: '75vh' }}>
          {/* Loading state */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-secondary z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
                <p className="text-muted-foreground">Loading Street View...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-secondary z-10">
              <div className="flex flex-col items-center gap-3 text-center p-4">
                <AlertCircle className="h-12 w-12 text-red-500" />
                <p className="text-foreground font-medium">Failed to load Street View</p>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    const url = `https://www.google.com/maps/place/${encodeURIComponent(fullAddress)}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Open in Google Maps
                </Button>
              </div>
            </div>
          )}

          {/* No Street View available */}
          {noStreetView && !loading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-amber-500/90 text-amber-950 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Street View not available - showing satellite view</span>
            </div>
          )}

          {/* Street View container */}
          <div ref={streetViewRef} className="w-full h-full" />

          {/* Open in Google Maps button */}
          {!loading && !error && (
            <div className="absolute bottom-4 right-4 z-10">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const url = `https://www.google.com/maps/place/${encodeURIComponent(fullAddress)}`;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="bg-background/90 hover:bg-background shadow-lg"
              >
                <MapPin className="h-4 w-4 mr-2" />
                Open in Google Maps
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
