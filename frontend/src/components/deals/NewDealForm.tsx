'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useCreateProperty } from '@/hooks/use-properties';
import { useMarketDataLookup, ZillowPropertyData, FullPropertyLookup } from '@/hooks/use-market-data';
import { toast } from 'sonner';
import {
  MapPin,
  Home,
  DollarSign,
  Building2,
  Sparkles,
  Check,
  Loader2,
  Plus,
  X,
  ChevronDown,
  History,
  Receipt,
  Users,
  Image,
  LayoutGrid,
  TrendingUp,
  Upload,
  ImagePlus,
  Link2,
  Mic,
  MicOff,
} from 'lucide-react';
import { api } from '@/lib/api';
import { DealContactSelector } from './DealContactSelector';
import type { Property, Contact } from '@/types';

// Constants
const PROPERTY_TYPES = [
  'Single Family',
  'Townhouse',
  'Condo',
  'Multi-Family (2-4)',
  'Duplex',
  'Triplex',
  'Fourplex',
  'Manufactured',
  'Land',
  'Other',
];

const OWNERSHIP_TYPES = [
  'Fee Simple',
  'Leasehold',
  'Condominium',
  'Timeshare',
  'Life Estate',
  'Other',
];

const OCCUPANCY_STATUSES = [
  'Vacant',
  'Owner Occupied',
  'Tenant Occupied',
  'Unknown',
];

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

interface NewDealFormProps {
  onSuccess?: (property: Property) => void;
}

// Extend window type for Google Maps callback
declare global {
  interface Window {
    initGoogleMaps?: () => void;
  }
}

export function NewDealForm({ onSuccess }: NewDealFormProps) {
  const createProperty = useCreateProperty();
  const marketDataLookup = useMarketDataLookup();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingZillow, setIsLoadingZillow] = useState(false);
  const [photoInput, setPhotoInput] = useState('');
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [photoInputMode, setPhotoInputMode] = useState<'upload' | 'url'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [houseNumber, setHouseNumber] = useState('');
  const [street, setStreet] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [county, setCounty] = useState('');

  // Google Places Autocomplete
  const [autocompleteValue, setAutocompleteValue] = useState('');
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<any[]>([]);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteService = useRef<any>(null);
  const placesService = useRef<any>(null);
  const autocompleteInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Other form fields
  const [propertyType, setPropertyType] = useState('');
  const [propertyOwnership, setPropertyOwnership] = useState('');
  const [bedroomCount, setBedroomCount] = useState('');
  const [bathroomCount, setBathroomCount] = useState('');
  const [livingSpaceSqFt, setLivingSpaceSqFt] = useState('');
  const [lotSizeSqFt, setLotSizeSqFt] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [stories, setStories] = useState('');
  const [pool, setPool] = useState(false);
  const [solar, setSolar] = useState(false);
  const [septic, setSeptic] = useState(false);
  const [well, setWell] = useState(false);
  const [occupancyStatus, setOccupancyStatus] = useState('');
  const [occupancyDetails, setOccupancyDetails] = useState('');
  const [deliveredVacant, setDeliveredVacant] = useState(false);
  const [reservePrice, setReservePrice] = useState('');
  const [buyItNowPrice, setBuyItNowPrice] = useState('');
  const [arv, setArv] = useState('');
  const [renovationBudget, setRenovationBudget] = useState('');
  const [wholesalerLlcName, setWholesalerLlcName] = useState('');
  const [llcOwnerName, setLlcOwnerName] = useState('');
  const [llcOwnerEmail, setLlcOwnerEmail] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [assignable, setAssignable] = useState(false);
  const [marketingClauseFound, setMarketingClauseFound] = useState(false);
  const [brokerOnFile, setBrokerOnFile] = useState(false);
  const [description, setDescription] = useState('');
  const [photoLinks, setPhotoLinks] = useState<string[]>([]);
  const [enrichMarketData, setEnrichMarketData] = useState(true);
  const [runComplianceCheck, setRunComplianceCheck] = useState(true);
  const [scoreAgainstBuyBoxes, setScoreAgainstBuyBoxes] = useState(true);

  // Granular Zillow enrichment options (only used when enrichMarketData is true)
  const [fetchZestimate, setFetchZestimate] = useState(true);
  const [fetchPriceHistory, setFetchPriceHistory] = useState(true);
  const [fetchTaxHistory, setFetchTaxHistory] = useState(true);
  const [fetchSkipTrace, setFetchSkipTrace] = useState(true);
  const [fetchPropertyImages, setFetchPropertyImages] = useState(true);
  const [fetchComparables, setFetchComparables] = useState(true);
  const [showEnrichmentOptions, setShowEnrichmentOptions] = useState(true);

  // Speech recognition for text fields
  const [listeningField, setListeningField] = useState<'description' | 'occupancy' | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeFieldRef = useRef<'description' | 'occupancy' | null>(null);

  // Prevent hydration mismatch with Radix UI components
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            }
          }

          if (finalTranscript) {
            const addText = (prev: string) => {
              const separator = prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : '';
              return prev + separator + finalTranscript;
            };

            if (activeFieldRef.current === 'description') {
              setDescription(addText);
            } else if (activeFieldRef.current === 'occupancy') {
              setOccupancyDetails(addText);
            }
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setListeningField(null);
          activeFieldRef.current = null;
          if (event.error === 'not-allowed') {
            toast.error('Microphone access denied. Please enable microphone permissions.');
          }
        };

        recognitionRef.current.onend = () => {
          setListeningField(null);
          activeFieldRef.current = null;
        };
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleSpeechRecognition = (field: 'description' | 'occupancy') => {
    if (!recognitionRef.current) {
      toast.error('Speech recognition is not supported in your browser');
      return;
    }

    // If already listening to this field, stop
    if (listeningField === field) {
      recognitionRef.current.stop();
      setListeningField(null);
      activeFieldRef.current = null;
    } else {
      // Stop any existing recognition first
      if (listeningField) {
        recognitionRef.current.stop();
      }
      // Start new recognition
      activeFieldRef.current = field;
      recognitionRef.current.start();
      setListeningField(field);
      toast.success('Listening... Speak now');
    }
  };

  // Load Google Maps script
  useEffect(() => {
    const loadGoogleMapsScript = () => {
      // Check if already loaded
      if (window.google && window.google.maps && window.google.maps.places) {
        autocompleteService.current = new window.google.maps.places.AutocompleteService();
        placesService.current = new window.google.maps.places.PlacesService(document.createElement('div'));
        return;
      }

      // Check if script is already in document
      if (document.getElementById('google-maps-script')) return;

      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '';
      if (!apiKey) {
        console.warn('Google Maps API key not found');
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`;
      script.async = true;
      script.defer = true;

      // Global callback for when script loads
      window.initGoogleMaps = () => {
        if (window.google && window.google.maps && window.google.maps.places) {
          autocompleteService.current = new window.google.maps.places.AutocompleteService();
          placesService.current = new window.google.maps.places.PlacesService(document.createElement('div'));
        }
      };

      // Handle script load error
      script.onerror = () => {
        console.error('Failed to load Google Maps script');
      };

      document.head.appendChild(script);
    };

    loadGoogleMapsScript();
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Google Places autocomplete search
  const handleAddressSearch = (value: string) => {
    setAutocompleteValue(value);

    if (!value || !autocompleteService.current) {
      setAutocompleteSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoadingAddress(true);

    autocompleteService.current.getPlacePredictions(
      {
        input: value,
        componentRestrictions: { country: 'us' },
        types: ['address'],
      },
      (predictions: any[] | null, status: any) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setAutocompleteSuggestions(predictions);
          setShowSuggestions(true);
        } else {
          setAutocompleteSuggestions([]);
          setShowSuggestions(false);
        }
        setIsLoadingAddress(false);
      }
    );
  };

  // Handle selecting a place from suggestions
  const handleSelectPlace = (placeId: string) => {
    if (!placesService.current) return;

    placesService.current.getDetails(
      { placeId },
      (place: any, status: any) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
          // Parse address components
          const components = place.address_components || [];
          const getComponent = (type: string) =>
            components.find((c: any) => c.types.includes(type))?.long_name || '';
          const getShortComponent = (type: string) =>
            components.find((c: any) => c.types.includes(type))?.short_name || '';

          // Extract address parts
          const streetNumber = getComponent('street_number');
          const streetName = getComponent('route');
          const cityName = getComponent('locality');
          const stateName = getShortComponent('administrative_area_level_1');
          const zipCode = getComponent('postal_code');
          const countyName = getComponent('administrative_area_level_2');

          // Set form fields
          setHouseNumber(streetNumber);
          setStreet(streetName);
          setCity(cityName);
          setState(stateName || '');
          setZip(zipCode);
          setCounty(countyName);

          // Set autocomplete value to formatted address
          setAutocompleteValue(place.formatted_address || '');
          setShowSuggestions(false);
          setAutocompleteSuggestions([]);
        }
      }
    );
  };

  // Fetch Zillow data and auto-fill form fields
  const fetchZillowData = async (address: string, city?: string, state?: string, zip?: string) => {
    setIsLoadingZillow(true);
    try {
      const lookup: FullPropertyLookup = await marketDataLookup.mutateAsync({
        address,
        city,
        state,
        zip,
        maxAgeDays: 1, // Use fresh data
        includeImages: fetchPropertyImages,
        includePriceHistory: fetchPriceHistory,
        includeTaxHistory: fetchTaxHistory,
        includeComparables: fetchComparables,
        includeSkipTrace: fetchSkipTrace,
      });

      console.log('Zillow lookup data:', lookup);
      console.log('Property data:', lookup.property);

      if (lookup?.property) {
        autoFillFromZillow(lookup.property, lookup.images);
        toast.success('Property data auto-filled from Zillow');
      }
    } catch (error) {
      console.error('Failed to fetch Zillow data:', error);
      // Don't show error toast - this is optional enrichment
    } finally {
      setIsLoadingZillow(false);
    }
  };

  // Auto-fill form fields from Zillow data
  const autoFillFromZillow = (data: ZillowPropertyData, images?: any) => {
    console.log('=== ZILLOW AUTO-FILL DEBUG ===');
    console.log('Full property data:', data);
    console.log('Bedrooms:', data.bedrooms, 'Type:', typeof data.bedrooms);
    console.log('Bathrooms:', data.bathrooms, 'Type:', typeof data.bathrooms);
    console.log('Sqft:', data.sqft);
    console.log('Lot size:', data.lotSize);
    console.log('Year built:', data.yearBuilt);
    console.log('Property type:', data.propertyType);
    console.log('Zestimate:', data.zestimate);
    console.log('==============================');

    // Property details
    if (data.bedrooms) {
      console.log('Setting bedroomCount to:', String(data.bedrooms));
      setBedroomCount(String(data.bedrooms));
    }
    if (data.bathrooms) {
      console.log('Setting bathroomCount to:', String(data.bathrooms));
      setBathroomCount(String(data.bathrooms));
    }
    if (data.sqft) setLivingSpaceSqFt(String(data.sqft));
    if (data.lotSize) setLotSizeSqFt(String(data.lotSize));
    if (data.yearBuilt) setYearBuilt(String(data.yearBuilt));

    // Property type mapping (normalize to lowercase for matching)
    if (data.propertyType) {
      const normalizedType = data.propertyType.toUpperCase().replace(/[^A-Z_]/g, '_');
      const propertyTypeMap: Record<string, string> = {
        'SINGLE_FAMILY': 'Single Family',
        'TOWNHOUSE': 'Townhouse',
        'CONDO': 'Condo',
        'MULTI_FAMILY': 'Multi-Family (2-4)',
        'DUPLEX': 'Duplex',
        'TRIPLEX': 'Triplex',
        'FOURPLEX': 'Fourplex',
        'MANUFACTURED': 'Manufactured',
        'LAND': 'Land',
      };
      setPropertyType(propertyTypeMap[normalizedType] || data.propertyType);
    }

    // Set default ownership if not set
    if (!propertyOwnership) {
      setPropertyOwnership('Fee Simple');
    }

    // ARV - use Zestimate if available
    if (data.zestimate && !arv) {
      setArv(String(Math.round(data.zestimate)));
    }

    // Photos from Zillow images - handle various formats
    const imageList = images?.photos || images?.images || [];
    if (imageList.length > 0) {
      console.log('Raw image list:', imageList);

      // Extract URLs from photo objects - handle multiple possible structures
      const urls = imageList
        .map((img: any) => {
          // If it's already a string, return it
          if (typeof img === 'string') return img;

          // If it's an object, try various possible URL fields
          if (typeof img === 'object' && img !== null) {
            // Common image URL field names
            return (
              img.url ||
              img.image_url ||
              img.src ||
              img.href ||
              img.link ||
              img.images?.url ||
              img.images?.[0]?.url ||
              null
            );
          }

          return null;
        })
        .filter((url: unknown): url is string => Boolean(url && typeof url === 'string' && url.startsWith('http')));

      console.log('Extracted photo URLs:', urls.slice(0, 20));
      setPhotoLinks(urls.slice(0, 20)); // Limit to 20 photos
    }

    // Description - create from available data
    if (!description) {
      const descParts = [];
      if (data.bedrooms) descParts.push(`${data.bedrooms} bed`);
      if (data.bathrooms) descParts.push(`${data.bathrooms} bath`);
      if (data.sqft) descParts.push(`${data.sqft.toLocaleString()} sqft`);
      if (data.yearBuilt) descParts.push(`Built in ${data.yearBuilt}`);
      if (descParts.length > 0) {
        setDescription(descParts.join(' • '));
      }
    }
  };

  const validateForm = () => {
    if (!houseNumber.trim()) {
      toast.error('House number is required');
      return false;
    }
    if (!street.trim()) {
      toast.error('Street name is required');
      return false;
    }
    if (!city.trim()) {
      toast.error('City is required');
      return false;
    }
    if (!state) {
      toast.error('State is required');
      return false;
    }
    if (!zip.trim()) {
      toast.error('ZIP code is required');
      return false;
    }
    if (!propertyType) {
      toast.error('Property type is required');
      return false;
    }
    if (!propertyOwnership) {
      toast.error('Ownership type is required');
      return false;
    }
    if (!occupancyStatus) {
      toast.error('Occupancy status is required');
      return false;
    }
    return true;
  };

  const onSubmit = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);

    try {
      console.log('Creating property with data:', {
        address: { houseNumber, street, address2: address2 || undefined },
        city,
        state,
        zip,
        propertyType,
        bedroomCount,
        bathroomCount,
      });

      const propertyData = {
        propertyId: `PROP-${Date.now()}`,
        address: {
          houseNumber,
          street,
          address2: address2 || undefined,
        },
        city,
        state,
        zip,
        county: county || undefined,
        propertyType,
        propertyOwnership,
        bedroomCount: bedroomCount ? parseInt(bedroomCount) : 0,
        bathroomCount: bathroomCount ? parseFloat(bathroomCount) : 0,
        livingSpaceSqFt: livingSpaceSqFt ? parseInt(livingSpaceSqFt) : undefined,
        lotSizeSqFt: lotSizeSqFt ? parseInt(lotSizeSqFt) : undefined,
        yearBuilt: yearBuilt ? parseInt(yearBuilt) : undefined,
        stories: stories ? parseInt(stories) : undefined,
        pool,
        solar,
        septic,
        well,
        occupancyStatus,
        occupancyDetails: occupancyDetails || undefined,
        deliveredVacant,
        reservePrice: reservePrice ? parseFloat(reservePrice) : undefined,
        buyItNowPrice: buyItNowPrice ? parseFloat(buyItNowPrice) : undefined,
        arv: arv ? parseFloat(arv) : undefined,
        renovationBudget: renovationBudget ? parseFloat(renovationBudget) : undefined,
        // Contact information - use selected contact or manual fields
        contactId: selectedContact?.id || undefined,
        wholesalerLlcName: selectedContact?.company || wholesalerLlcName || undefined,
        llcOwnerName: selectedContact?.name || llcOwnerName || undefined,
        llcOwnerEmail: selectedContact?.email || llcOwnerEmail || undefined,
        assignable,
        marketingClauseFound,
        brokerOnFile,
        propertyListingDescription: description || undefined,
        photoLinks: photoLinks.length > 0 ? photoLinks : undefined,
        status: 'new' as const,
        // Enrichment options
        enrichmentOptions: enrichMarketData ? {
          enabled: true,
          fetchZestimate,
          fetchPriceHistory,
          fetchTaxHistory,
          fetchSkipTrace,
          fetchPropertyImages,
          fetchComparables,
        } : { enabled: false },
        // Other automation options
        runComplianceCheck,
        scoreAgainstBuyBoxes,
      };

      const result = await createProperty.mutateAsync(propertyData as any);

      console.log('Property created successfully! Result:', result);
      console.log('Property ID:', result.id);

      toast.success('Deal created successfully!', {
        description: 'The property has been added to the platform.',
      });

      onSuccess?.(result as Property);
    } catch (error) {
      console.error('Error creating property:', error);
      toast.error('Failed to create deal', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addPhoto = () => {
    if (!photoInput.trim()) {
      console.log('No photo input to add');
      return;
    }
    console.log('Adding photo:', photoInput.trim());
    setPhotoLinks([...photoLinks, photoInput.trim()]);
    setPhotoInput('');
  };

  const removePhoto = (index: number) => {
    setPhotoLinks(photoLinks.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPhotos(true);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append('photos', file);
      });

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      // Get auth token
      let token = null;
      if (typeof window !== 'undefined') {
        try {
          const { supabase } = await import('@/lib/supabase');
          if (supabase?.auth) {
            const { data } = await supabase.auth.getSession();
            token = data?.session?.access_token;
          }
        } catch (e) {
          console.warn('Supabase auth not available:', e);
        }
        if (!token) {
          token = localStorage.getItem('dispotree_token');
        }
      }

      const response = await fetch(`${API_URL}/api/listings/upload-temp-photos`, {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: formData,
      });

      const result = await response.json();

      if (result.success && result.data?.urls) {
        setPhotoLinks([...photoLinks, ...result.data.urls]);
        toast.success(`${result.data.count} photo(s) uploaded successfully`);
      } else {
        toast.error(result.error || 'Failed to upload photos');
      }
    } catch (error) {
      console.error('Error uploading photos:', error);
      toast.error('Failed to upload photos');
    } finally {
      setIsUploadingPhotos(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatSuggestion = (suggestion: any) => {
    const mainText = suggestion.structured_formatting?.main_text || '';
    const secondaryText = suggestion.structured_formatting?.secondary_text || '';
    return secondaryText ? `${mainText}, ${secondaryText}` : mainText;
  };

  // Prevent hydration mismatch - show loading skeleton until client-side mount
  if (!mounted) {
    return (
      <div className="space-y-6">
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <MapPin className="h-5 w-5 text-accent-400" />
              Property Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="animate-pulse space-y-4">
              <div className="h-10 bg-secondary rounded" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-10 bg-secondary rounded" />
                <div className="h-10 bg-secondary rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Address Section with Google Autocomplete */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <MapPin className="h-5 w-5 text-accent-400" />
            Property Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google Autocomplete Input */}
          <div className="relative" ref={suggestionsRef}>
            <Label className="text-muted-foreground text-sm">Search Address *</Label>
            <div className="relative mt-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={autocompleteInputRef}
                placeholder="Start typing an address..."
                value={autocompleteValue}
                onChange={(e) => handleAddressSearch(e.target.value)}
                onFocus={() => autocompleteSuggestions.length > 0 && setShowSuggestions(true)}
                className="pl-9 bg-secondary border text-foreground"
              />
              {isLoadingAddress && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-accent-500 animate-spin" />
              )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && autocompleteSuggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-secondary border border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {autocompleteSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.place_id}
                    type="button"
                    onClick={() => handleSelectPlace(suggestion.place_id)}
                    className="w-full px-4 py-3 text-left hover:bg-zinc-700 transition-colors border-b border last:border-0"
                  >
                    <p className="text-sm text-foreground">{formatSuggestion(suggestion)}</p>
                    <p className="text-xs text-muted-foreground">
                      {suggestion.description?.split(',').slice(-2).join(',')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manual Address Fields (pre-filled from autocomplete) */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-3">
              <Label className="text-muted-foreground text-sm">Number *</Label>
              <Input
                placeholder="123"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
            <div className="col-span-9">
              <Label className="text-muted-foreground text-sm">Street Name *</Label>
              <Input
                placeholder="Main Street"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm">Apt, Suite, Unit (optional)</Label>
            <Input
              placeholder="Apt 4B"
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
              className="mt-1 bg-secondary border text-foreground"
            />
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-5">
              <Label className="text-muted-foreground text-sm">City *</Label>
              <Input
                placeholder="Austin"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
            <div className="col-span-3">
              <Label className="text-muted-foreground text-sm">State *</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                  <SelectValue placeholder="ST" />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  {STATES.map((s) => (
                    <SelectItem key={s} value={s} className="text-foreground">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-4">
              <Label className="text-muted-foreground text-sm">ZIP Code *</Label>
              <Input
                placeholder="78701"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm">County</Label>
            <Input
              placeholder="Travis County"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              className="mt-1 bg-secondary border text-foreground"
            />
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-foreground">
            <div className="flex items-center gap-2">
              <Home className="h-5 w-5 text-pink-400" />
              Description
            </div>
            <Button
              type="button"
              variant={listeningField === 'description' ? "default" : "outline"}
              size="sm"
              onClick={() => toggleSpeechRecognition('description')}
              className={`gap-2 ${
                listeningField === 'description'
                  ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                  : 'border text-foreground hover:bg-secondary'
              }`}
            >
              {listeningField === 'description' ? (
                <>
                  <MicOff className="h-4 w-4" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  Speak
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Textarea
              placeholder="Describe the property, highlights, repairs needed... or click 'Speak' to dictate"
              className={`bg-secondary border text-foreground min-h-24 ${
                listeningField === 'description' ? 'border-red-500 ring-1 ring-red-500' : ''
              }`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {listeningField === 'description' && (
              <div className="absolute bottom-2 right-2 flex items-center gap-2 text-red-500 text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                Recording...
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Property Type & Occupancy */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Home className="h-5 w-5 text-purple-400" />
            Property Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-muted-foreground text-sm">Property Type *</Label>
              <Select value={propertyType} onValueChange={setPropertyType}>
                <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  {PROPERTY_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="text-foreground">
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Ownership Type *</Label>
              <Select value={propertyOwnership} onValueChange={setPropertyOwnership}>
                <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                  <SelectValue placeholder="Select ownership" />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  {OWNERSHIP_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="text-foreground">
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Occupancy Status *</Label>
              <Select value={occupancyStatus} onValueChange={setOccupancyStatus}>
                <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  {OCCUPANCY_STATUSES.map((status) => (
                    <SelectItem key={status} value={status} className="text-foreground">
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
              <Label className="text-sm text-foreground">Delivered Vacant</Label>
              <Switch checked={deliveredVacant} onCheckedChange={setDeliveredVacant} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-muted-foreground text-sm">Occupancy Details</Label>
              <Button
                type="button"
                variant={listeningField === 'occupancy' ? "default" : "outline"}
                size="sm"
                onClick={() => toggleSpeechRecognition('occupancy')}
                className={`gap-2 h-7 text-xs ${
                  listeningField === 'occupancy'
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                    : 'border text-foreground hover:bg-secondary'
                }`}
              >
                {listeningField === 'occupancy' ? (
                  <>
                    <MicOff className="h-3 w-3" />
                    Stop
                  </>
                ) : (
                  <>
                    <Mic className="h-3 w-3" />
                    Speak
                  </>
                )}
              </Button>
            </div>
            <div className="relative">
              <Textarea
                placeholder="Any additional occupancy information (lease terms, tenant details, etc.)... or click 'Speak' to dictate"
                className={`bg-secondary border text-foreground min-h-20 ${
                  listeningField === 'occupancy' ? 'border-red-500 ring-1 ring-red-500' : ''
                }`}
                value={occupancyDetails}
                onChange={(e) => setOccupancyDetails(e.target.value)}
              />
              {listeningField === 'occupancy' && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2 text-red-500 text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  Recording...
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Information */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <DollarSign className="h-5 w-5 text-green-400" />
            Financial Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-sm">Reserve Price</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  placeholder="150000"
                  value={reservePrice}
                  onChange={(e) => setReservePrice(e.target.value)}
                  className="pl-8 bg-secondary border text-foreground"
                />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Buy It Now Price</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  placeholder="175000"
                  value={buyItNowPrice}
                  onChange={(e) => setBuyItNowPrice(e.target.value)}
                  className="pl-8 bg-secondary border text-foreground"
                />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">After Repair Value (ARV)</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  placeholder="250000"
                  value={arv}
                  onChange={(e) => setArv(e.target.value)}
                  className="pl-8 bg-secondary border text-foreground"
                />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Renovation Budget</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  placeholder="30000"
                  value={renovationBudget}
                  onChange={(e) => setRenovationBudget(e.target.value)}
                  className="pl-8 bg-secondary border text-foreground"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Details Accordion */}
      <Card className="bg-card border">
        <CardContent className="p-0">
          <Accordion type="multiple" defaultValue={[]} className="w-full">
            {/* Wholesaler/Seller Contact */}
            <AccordionItem value="contact" className="border-b border px-6">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-2 text-foreground">
                  <Building2 className="h-4 w-4 text-amber-400" />
                  Contact Information
                  {selectedContact && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({selectedContact.name})
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <DealContactSelector
                  selectedContact={selectedContact}
                  onContactSelect={setSelectedContact}
                  label="Wholesaler / Seller Contact"
                  defaultType="wholesaler"
                  placeholder="Select or create a contact"
                />
              </AccordionContent>
            </AccordionItem>

            {/* Contract & Compliance */}
            <AccordionItem value="contract" className="border-b border px-6">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-2 text-foreground">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  Contract & Compliance
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                    <div>
                      <Label className="text-sm text-foreground">Assignable Contract</Label>
                    </div>
                    <Switch checked={assignable} onCheckedChange={setAssignable} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                    <div>
                      <Label className="text-sm text-foreground">Marketing Clause</Label>
                    </div>
                    <Switch checked={marketingClauseFound} onCheckedChange={setMarketingClauseFound} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                    <div>
                      <Label className="text-sm text-foreground">Broker on File</Label>
                    </div>
                    <Switch checked={brokerOnFile} onCheckedChange={setBrokerOnFile} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </CardContent>
      </Card>

      {/* Automation Options */}
      <Card className="bg-gradient-to-br from-accent-900/30 to-purple-900/20 border-accent-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Sparkles className="h-5 w-5 text-accent-400" />
            Automation Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure which automated processes run when this deal is created.
          </p>
          <div className="space-y-3">
            {/* Market Data Enrichment with expandable options */}
            <div className="rounded-lg bg-secondary/50 overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowEnrichmentOptions(!showEnrichmentOptions)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showEnrichmentOptions ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div>
                    <p className="text-foreground">Market Data Enrichment</p>
                    <p className="text-xs text-muted-foreground">
                      Fetch Zillow estimates, comps, and market data
                    </p>
                  </div>
                </div>
                <Switch checked={enrichMarketData} onCheckedChange={setEnrichMarketData} />
              </div>

              {/* Expandable sub-options */}
              {showEnrichmentOptions && enrichMarketData && (
                <div className="border-t border/50 bg-card/50 px-4 py-3 space-y-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Enrichment Options</p>

                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                      <div>
                        <p className="text-sm text-foreground">Zestimate & Valuations</p>
                        <p className="text-xs text-muted-foreground">Home value, rent estimate, price/sqft</p>
                      </div>
                    </div>
                    <Switch checked={fetchZestimate} onCheckedChange={setFetchZestimate} />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-accent-400" />
                      <div>
                        <p className="text-sm text-foreground">Price History</p>
                        <p className="text-xs text-muted-foreground">Listing events, sales, price changes</p>
                      </div>
                    </div>
                    <Switch checked={fetchPriceHistory} onCheckedChange={setFetchPriceHistory} />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-amber-400" />
                      <div>
                        <p className="text-sm text-foreground">Tax History</p>
                        <p className="text-xs text-muted-foreground">Annual taxes, assessed values</p>
                      </div>
                    </div>
                    <Switch checked={fetchTaxHistory} onCheckedChange={setFetchTaxHistory} />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-400" />
                      <div>
                        <p className="text-sm text-foreground">Skip Trace (Owner Info)</p>
                        <p className="text-xs text-muted-foreground">Owner name, phone, email, mailing address</p>
                      </div>
                    </div>
                    <Switch checked={fetchSkipTrace} onCheckedChange={setFetchSkipTrace} />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Image className="h-4 w-4 text-pink-400" />
                      <div>
                        <p className="text-sm text-foreground">Property Images</p>
                        <p className="text-xs text-muted-foreground">Photos, street view</p>
                      </div>
                    </div>
                    <Switch checked={fetchPropertyImages} onCheckedChange={setFetchPropertyImages} />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4 text-cyan-400" />
                      <div>
                        <p className="text-sm text-foreground">Comparable Properties</p>
                        <p className="text-xs text-muted-foreground">Nearby sold homes for comparison</p>
                      </div>
                    </div>
                    <Switch checked={fetchComparables} onCheckedChange={setFetchComparables} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit Actions */}
      <div className="flex gap-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border text-foreground"
          onClick={() => (window.location.href = '/deals')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Deal...
            </>
          ) : (
            <>
              Create Deal
              <Check className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
