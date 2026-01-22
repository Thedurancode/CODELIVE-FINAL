'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Eye,
  BarChart3,
  Send,
  Trash2,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertCircle,
  List,
  Map,
  MapPin,
  Home,
  DollarSign,
  Bed,
  Bath,
  Satellite,
  ZoomOut,
  Kanban,
  GripVertical,
  Edit,
  Copy,
  ExternalLink,
  LayoutGrid,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProperties, useDeleteProperty, useUpdateProperty, useBulkDeleteProperties } from '@/hooks/use-properties';
import { useSubmitForApproval, useBulkSubmitForApproval } from '@/hooks/use-deal-approvals';
import { useAppStore } from '@/stores/app-store';
import { toast } from 'sonner';
import type { Property } from '@/types';
import { cn } from '@/lib/utils';
import { ComplianceBadge } from '@/components/compliance/ComplianceBadge';
import { DealGridCard } from '@/components/deals/DealGridCard';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

const statusColors: Record<string, string> = {
  new: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/50',
  Green: 'bg-green-500/20 text-green-400 border-green-500/50',
  Yellow: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  Red: 'bg-red-500/20 text-red-400 border-red-500/50',
};

// Approval status colors for marketplace visibility
const approvalStatusConfig: Record<string, { label: string; color: string; icon: string }> = {
  draft: { label: 'Draft', color: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/50', icon: '📝' },
  pending_broker_approval: { label: 'Pending', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50', icon: '⏳' },
  approved: { label: 'Approved', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50', icon: '✓' },
  rejected: { label: 'Rejected', color: 'bg-red-500/20 text-red-400 border-red-500/50', icon: '✗' },
  live: { label: 'Live', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50', icon: '●' },
};

// Row background colors for list view (subtle shades)
const approvalStatusRowColors: Record<string, string> = {
  draft: 'bg-card/50 hover:bg-secondary/70',
  pending_broker_approval: 'bg-amber-950/30 hover:bg-amber-900/30',
  approved: 'bg-blue-950/30 hover:bg-blue-900/30',
  rejected: 'bg-red-950/30 hover:bg-red-900/30',
  live: 'bg-emerald-950/30 hover:bg-emerald-900/30',
};

const pipelineStages = [
  { id: 'draft', title: 'Draft', color: '#71717a' },
  { id: 'pending_broker_approval', title: 'Pending Approval', color: '#f59e0b' },
  { id: 'approved', title: 'Approved', color: '#3b82f6' },
  { id: 'live', title: 'Live', color: '#22c55e' },
  { id: 'rejected', title: 'Rejected', color: '#ef4444' },
];

const states = ['TX', 'FL', 'GA', 'AZ', 'NC', 'TN', 'SC', 'AL', 'OH', 'IN'];

// Extend window type for Google Maps callback
declare global {
  interface Window {
    initDealsMap?: () => void;
  }
}

const DEALS_VIEW_MODE_KEY = 'dispotree_deals_view_mode';

// Sortable table header component
function SortableTableHead({
  label,
  field,
  currentSortBy,
  currentSortOrder,
  onSort,
}: {
  label: string;
  field: string;
  currentSortBy?: string;
  currentSortOrder?: 'ASC' | 'DESC';
  onSort: (field: string) => void;
}) {
  const isActive = currentSortBy === field;
  return (
    <TableHead
      className="text-muted-foreground cursor-pointer hover:bg-secondary/50 select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          currentSortOrder === 'ASC' ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );
}

function DealsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { propertyFilters, setPropertyFilters, clearPropertyFilters, selectedPropertyIds, selectAll, clearSelection, selectProperty, deselectProperty } = useAppStore();
  const [searchInput, setSearchInput] = useState(propertyFilters.search || '');
  const [viewMode, setViewMode] = useState<'list' | 'map' | 'pipeline'>('list');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Property | null>(null);
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [mapPanelView, setMapPanelView] = useState<'list' | 'grid'>('list');

  // Check if any filters are active
  const hasActiveFilters = Boolean(
    propertyFilters.search ||
    propertyFilters.state?.length ||
    propertyFilters.status ||
    propertyFilters.approvalStatus ||
    propertyFilters.minPrice ||
    propertyFilters.maxPrice ||
    propertyFilters.minBeds ||
    propertyFilters.maxBeds ||
    propertyFilters.minBaths ||
    propertyFilters.maxBaths ||
    propertyFilters.sortBy
  );

  // Clear all filters handler
  const handleClearFilters = () => {
    clearPropertyFilters();
    setSearchInput('');
  };

  // Sort handler
  const handleSort = (field: string) => {
    const newOrder = propertyFilters.sortBy === field && propertyFilters.sortOrder === 'ASC' ? 'DESC' : 'ASC';
    setPropertyFilters({ ...propertyFilters, sortBy: field, sortOrder: newOrder, page: 1 });
  };

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    deal: Property;
  } | null>(null);

  // For drag-drop to work with SSR and load persisted view mode
  useEffect(() => {
    const savedViewMode = localStorage.getItem(DEALS_VIEW_MODE_KEY) as 'list' | 'map' | 'pipeline' | null;
    if (savedViewMode && ['list', 'map', 'pipeline'].includes(savedViewMode)) {
      setViewMode(savedViewMode);
    }
    setIsMounted(true);
  }, []);

  // Persist view mode changes
  const handleViewModeChange = (mode: 'list' | 'map' | 'pipeline') => {
    // Clear map instance when switching away from map view
    // This ensures the map reinitializes properly when returning
    if (viewMode === 'map' && mode !== 'map') {
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
      mapInstanceRef.current = null;
      dealLocationsRef.current.clear();
      setSelectedDeal(null);
      setIsZoomedIn(false);
    }
    setViewMode(mode);
    localStorage.setItem(DEALS_VIEW_MODE_KEY, mode);
  };

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const dealLocationsRef = useRef<globalThis.Map<string, google.maps.LatLng>>(new globalThis.Map());

  // Read search query from URL (from header search)
  useEffect(() => {
    const searchFromUrl = searchParams.get('search');
    if (searchFromUrl && searchFromUrl !== searchInput) {
      setSearchInput(searchFromUrl);
      setPropertyFilters({ ...propertyFilters, search: searchFromUrl, page: 1 });
    }
  }, [searchParams]);

  const { data, isLoading, error, refetch } = useProperties({ ...propertyFilters, limit: viewMode === 'map' || viewMode === 'pipeline' ? 100 : propertyFilters.limit });
  const deleteProperty = useDeleteProperty();
  const updateProperty = useUpdateProperty();
  const submitForApproval = useSubmitForApproval();
  const bulkSubmitForApproval = useBulkSubmitForApproval();
  const bulkDeleteProperties = useBulkDeleteProperties();

  // Bulk delete confirmation dialog
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const deals = data?.data || [];
  const pagination = data?.pagination;

  // Load Google Maps script
  useEffect(() => {
    if (viewMode !== 'map') return;

    const loadGoogleMapsScript = () => {
      if (window.google?.maps) {
        setMapLoaded(true);
        return;
      }

      if (document.getElementById('google-maps-script-deals')) return;

      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '';
      if (!apiKey) {
        console.warn('Google Maps API key not found');
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-script-deals';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initDealsMap`;
      script.async = true;
      script.defer = true;

      window.initDealsMap = () => {
        setMapLoaded(true);
      };

      document.head.appendChild(script);
    };

    loadGoogleMapsScript();
  }, [viewMode]);

  // Initialize map when loaded
  const initializeMap = useCallback(() => {
    if (!mapRef.current || !window.google?.maps || mapInstanceRef.current) return;

    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 39.8283, lng: -98.5795 }, // Center of US
      zoom: 4,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#18181b' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#18181b' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#71717a' }] },
        { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#27272a' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#27272a' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#27272a' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c4a6e' }] },
        { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#27272a' }] },
      ],
    });

    geocoderRef.current = new window.google.maps.Geocoder();
  }, []);

  useEffect(() => {
    if (mapLoaded && viewMode === 'map') {
      initializeMap();
    }
  }, [mapLoaded, viewMode, initializeMap]);

  // Add markers for deals
  useEffect(() => {
    if (!mapInstanceRef.current || !geocoderRef.current || viewMode !== 'map' || !deals.length) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const bounds = new window.google!.maps.LatLngBounds();
    let hasValidMarkers = false;

    deals.forEach((deal: Property) => {
      const address = typeof deal.address === 'string'
        ? `${deal.address}, ${deal.city}, ${deal.state} ${deal.zip}`
        : `${deal.address?.houseNumber || ''} ${deal.address?.street || ''}, ${deal.city}, ${deal.state} ${deal.zip}`;

      geocoderRef.current!.geocode({ address }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const location = results[0].geometry.location;

          // Store location for later zoom
          dealLocationsRef.current.set(deal.id, location);

          const marker = new window.google!.maps.Marker({
            position: location,
            map: mapInstanceRef.current!,
            title: address,
            icon: {
              path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
              fillColor: deal.status === 'submitted' ? '#22c55e' : deal.status === 'rejected' ? '#ef4444' : '#3b82f6',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 1,
              scale: 1.5,
              anchor: new google.maps.Point(12, 24),
            },
          });

          marker.addListener('click', () => {
            setSelectedDeal(deal);
          });

          markersRef.current.push(marker);
          bounds.extend(location);
          hasValidMarkers = true;

          // Fit bounds after all markers are added (with delay for geocoding)
          setTimeout(() => {
            if (hasValidMarkers && markersRef.current.length > 0) {
              mapInstanceRef.current?.fitBounds(bounds);
              if (markersRef.current.length === 1) {
                mapInstanceRef.current?.setZoom(14);
              }
            }
          }, 500);
        }
      });
    });
  }, [deals, viewMode, mapLoaded]);

  // Zoom to property with satellite view
  const zoomToProperty = useCallback((dealId: string) => {
    if (!mapInstanceRef.current) return;

    const location = dealLocationsRef.current.get(dealId);
    if (location) {
      // Switch to satellite view
      mapInstanceRef.current.setMapTypeId('satellite');
      // Center and zoom to property
      mapInstanceRef.current.setCenter(location);
      mapInstanceRef.current.setZoom(19); // Close zoom for satellite
      setIsZoomedIn(true);
    }
  }, []);

  // Reset to overview
  const resetMapView = useCallback(() => {
    if (!mapInstanceRef.current) return;

    // Switch back to styled roadmap
    mapInstanceRef.current.setMapTypeId('roadmap');

    // Reset zoom to fit all markers
    if (markersRef.current.length > 0) {
      const bounds = new window.google!.maps.LatLngBounds();
      markersRef.current.forEach(marker => {
        const pos = marker.getPosition();
        if (pos) bounds.extend(pos);
      });
      mapInstanceRef.current.fitBounds(bounds);
    } else {
      mapInstanceRef.current.setCenter({ lat: 39.8283, lng: -98.5795 });
      mapInstanceRef.current.setZoom(4);
    }
    setIsZoomedIn(false);
  }, []);

  const handleSearch = () => {
    setPropertyFilters({ ...propertyFilters, search: searchInput, page: 1 });
  };

  const handleStatusFilter = (status: string) => {
    setPropertyFilters({
      ...propertyFilters,
      status: status === 'all' ? undefined : status,
      page: 1
    });
  };

  const handleStateFilter = (state: string) => {
    setPropertyFilters({
      ...propertyFilters,
      state: state === 'all' ? undefined : [state],
      page: 1
    });
  };

  const handleApprovalStatusFilter = (approvalStatus: string) => {
    setPropertyFilters({
      ...propertyFilters,
      approvalStatus: approvalStatus === 'all' ? undefined : approvalStatus,
      page: 1
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      selectAll(deals.map((d: Property) => d.id));
    } else {
      clearSelection();
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      selectProperty(id);
    } else {
      deselectProperty(id);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProperty.mutateAsync(id);
      toast.success('Deal deleted successfully');
    } catch {
      toast.error('Failed to delete deal');
    }
  };

  const handleSubmit = async (id: string) => {
    try {
      const result = await submitForApproval.mutateAsync(id);
      toast.success(result.message || 'Deal submitted for approval');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to submit deal');
    }
  };

  const handleBulkSubmit = async () => {
    if (selectedPropertyIds.length === 0) {
      toast.error('No deals selected');
      return;
    }
    try {
      const result = await bulkSubmitForApproval.mutateAsync(selectedPropertyIds);
      const { submitted, failed } = result.data;
      if (submitted.length > 0) {
        toast.success(`${submitted.length} deal(s) submitted for approval`);
      }
      if (failed.length > 0) {
        // Show first error as the reason
        const firstError = failed[0]?.error || 'Unknown error';
        toast.error(`${failed.length} deal(s) failed: ${firstError}`);
      }
      clearSelection();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to submit deals');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPropertyIds.length === 0) {
      toast.error('No deals selected');
      return;
    }
    try {
      const result = await bulkDeleteProperties.mutateAsync(selectedPropertyIds);
      const { deleted = [], notFound = [], errors = [] } = result.results || {};
      if (deleted.length > 0) {
        toast.success(`${deleted.length} deal(s) deleted successfully`);
      }
      if (notFound.length > 0) {
        toast.warning(`${notFound.length} deal(s) not found`);
      }
      if (errors.length > 0) {
        toast.error(`${errors.length} deal(s) failed to delete`);
      }
      clearSelection();
      setShowBulkDeleteDialog(false);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to delete deals');
      setShowBulkDeleteDialog(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPropertyFilters({ ...propertyFilters, page: newPage });
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getAddress = (deal: Property) => {
    return typeof deal.address === 'string'
      ? deal.address
      : `${deal.address?.houseNumber || ''} ${deal.address?.street || ''}${deal.address?.address2 ? ', ' + deal.address.address2 : ''}`;
  };

  // Handle drag and drop for pipeline view
  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Dropped outside a droppable area
    if (!destination) return;

    // Dropped in the same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Update the approval status (optimistic update happens automatically)
    const newApprovalStatus = destination.droppableId;
    updateProperty.mutate(
      { id: draggableId, data: { approvalStatus: newApprovalStatus as Property['approvalStatus'] } },
      {
        onError: () => {
          toast.error('Failed to move deal');
        },
      }
    );
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, deal: Property) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      deal,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleCopyAddress = (deal: Property) => {
    const address = getAddress(deal);
    const fullAddress = `${address}, ${deal.city}, ${deal.state} ${deal.zip}`;
    navigator.clipboard.writeText(fullAddress);
    toast.success('Address copied to clipboard');
    closeContextMenu();
  };

  const handleCopyId = (deal: Property) => {
    navigator.clipboard.writeText(String(deal.id));
    toast.success('Deal ID copied to clipboard');
    closeContextMenu();
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    const handleScroll = () => closeContextMenu();

    if (contextMenu) {
      document.addEventListener('click', handleClick);
      document.addEventListener('scroll', handleScroll, true);
      return () => {
        document.removeEventListener('click', handleClick);
        document.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [contextMenu]);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Deals</h1>
          <p className="text-muted-foreground mt-1">Manage your property deals</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load deals</p>
            <p className="text-muted-foreground mb-4">{(error as Error).message}</p>
            <Button onClick={() => refetch()} variant="outline" className="border">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Deals</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage your property deals</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* View Toggle */}
          <div className="flex rounded-lg border border overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'rounded-none px-3',
                viewMode === 'list' ? 'bg-zinc-700 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => handleViewModeChange('list')}
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'rounded-none px-3',
                viewMode === 'map' ? 'bg-zinc-700 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => handleViewModeChange('map')}
            >
              <Map className="h-4 w-4 mr-1" />
              Map
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'rounded-none px-3',
                viewMode === 'pipeline' ? 'bg-zinc-700 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => handleViewModeChange('pipeline')}
            >
              <Kanban className="h-4 w-4 mr-1" />
              Status
            </Button>
          </div>
          <Button variant="outline" className="border text-foreground" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Link href="/newdeal">
            <Button variant="outline" className="border-emerald-600 text-emerald-400 hover:bg-emerald-600/10">
              <Plus className="mr-2 h-4 w-4" />
              Add Deal
            </Button>
          </Link>
          <Link href="/import">
            <Button variant="outline" className="border text-foreground">
              <Plus className="mr-2 h-4 w-4" />
              Import Deals
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4" suppressHydrationWarning>
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search deals..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9 bg-secondary border text-foreground"
                />
              </div>
            </div>
            {isMounted && (
              <>
                <Select onValueChange={handleStatusFilter} defaultValue="all">
                  <SelectTrigger className="w-[150px] bg-secondary border text-foreground">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="analyzing">Analyzing</SelectItem>
                    <SelectItem value="matched">Matched</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Select onValueChange={handleStateFilter} defaultValue="all">
                  <SelectTrigger className="w-[150px] bg-secondary border text-foreground">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    <SelectItem value="all">All States</SelectItem>
                    {states.map((state) => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select onValueChange={handleApprovalStatusFilter} defaultValue="all">
                  <SelectTrigger className="w-[160px] bg-secondary border text-foreground">
                    <SelectValue placeholder="Marketplace" />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    <SelectItem value="all">All Marketplace</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_broker_approval">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            <Button variant="outline" className="border text-foreground" onClick={handleSearch}>
              Search
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              {showAdvancedFilters ? 'Hide Filters' : 'More Filters'}
            </Button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={handleClearFilters}
              >
                <X className="mr-1 h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t mt-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Beds</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    className="h-8 bg-secondary border text-foreground"
                    value={propertyFilters.minBeds || ''}
                    onChange={(e) => setPropertyFilters({ ...propertyFilters, minBeds: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    className="h-8 bg-secondary border text-foreground"
                    value={propertyFilters.maxBeds || ''}
                    onChange={(e) => setPropertyFilters({ ...propertyFilters, maxBeds: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Baths</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    className="h-8 bg-secondary border text-foreground"
                    value={propertyFilters.minBaths || ''}
                    onChange={(e) => setPropertyFilters({ ...propertyFilters, minBaths: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    className="h-8 bg-secondary border text-foreground"
                    value={propertyFilters.maxBaths || ''}
                    onChange={(e) => setPropertyFilters({ ...propertyFilters, maxBaths: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Min Price</label>
                <Input
                  type="number"
                  placeholder="$0"
                  className="h-8 bg-secondary border text-foreground"
                  value={propertyFilters.minPrice || ''}
                  onChange={(e) => setPropertyFilters({ ...propertyFilters, minPrice: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Max Price</label>
                <Input
                  type="number"
                  placeholder="No max"
                  className="h-8 bg-secondary border text-foreground"
                  value={propertyFilters.maxPrice || ''}
                  onChange={(e) => setPropertyFilters({ ...propertyFilters, maxPrice: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedPropertyIds.length > 0 && (
        <Card className="bg-accent-900/50 border-accent-800">
          <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-accent-400 text-sm sm:text-base">
                {selectedPropertyIds.length} deal{selectedPropertyIds.length > 1 ? 's' : ''} selected
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground h-7 px-2"
                onClick={clearSelection}
              >
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="border-accent-700 text-accent-400">
                <BarChart3 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Score Selected</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-accent-700 text-accent-400"
                onClick={handleBulkSubmit}
                disabled={bulkSubmitForApproval.isPending}
              >
                <Send className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{bulkSubmitForApproval.isPending ? 'Submitting...' : 'Submit Selected'}</span>
              </Button>
              <Button size="sm" variant="outline" className="border-accent-700 text-accent-400">
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-700 text-red-400 hover:bg-red-950/50"
                onClick={() => setShowBulkDeleteDialog(true)}
                disabled={bulkDeleteProperties.isPending}
              >
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{bulkDeleteProperties.isPending ? 'Deleting...' : 'Delete Selected'}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Map View */}
      {viewMode === 'map' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map */}
          <Card className="bg-card border lg:col-span-2 overflow-hidden">
            <CardContent className="p-0">
              <div
                ref={mapRef}
                className="w-full h-[600px]"
                style={{ minHeight: '600px' }}
              >
                {!mapLoaded && (
                  <div className="flex items-center justify-center h-full bg-secondary">
                    <div className="text-center">
                      <Map className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
                      <p className="text-muted-foreground">Loading map...</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Selected Deal Panel / Deal List */}
          <Card className="bg-card border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-foreground text-base">
                  {selectedDeal ? 'Deal Details' : `${deals.length} Deals`}
                </CardTitle>
                {!selectedDeal && (
                  <div className="flex border rounded overflow-hidden">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn('h-7 px-2 rounded-none', mapPanelView === 'list' && 'bg-secondary')}
                      onClick={() => setMapPanelView('list')}
                    >
                      <List className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn('h-7 px-2 rounded-none', mapPanelView === 'grid' && 'bg-secondary')}
                      onClick={() => setMapPanelView('grid')}
                    >
                      <LayoutGrid className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="max-h-[540px] overflow-y-auto">
              {selectedDeal ? (
                <div className="space-y-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground -ml-2"
                    onClick={() => {
                      setSelectedDeal(null);
                      if (isZoomedIn) resetMapView();
                    }}
                  >
                    ← Back to list
                  </Button>

                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">
                      {getAddress(selectedDeal)}
                    </h3>
                    <p className="text-muted-foreground text-sm flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedDeal.city}, {selectedDeal.state} {selectedDeal.zip}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-secondary rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <DollarSign className="h-3 w-3" />
                        Price
                      </div>
                      <p className="text-foreground font-semibold">{formatPrice(selectedDeal.askingPrice)}</p>
                    </div>
                    <div className="bg-secondary rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Home className="h-3 w-3" />
                        Type
                      </div>
                      <p className="text-foreground font-semibold text-sm">{selectedDeal.propertyType || 'N/A'}</p>
                    </div>
                    <div className="bg-secondary rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Bed className="h-3 w-3" />
                        Beds
                      </div>
                      <p className="text-foreground font-semibold">{selectedDeal.bedroomCount || 'N/A'}</p>
                    </div>
                    <div className="bg-secondary rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Bath className="h-3 w-3" />
                        Baths
                      </div>
                      <p className="text-foreground font-semibold">{selectedDeal.bathroomCount || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">Status:</span>
                    <Badge variant="outline" className={statusColors[selectedDeal.status || 'new']}>
                      {selectedDeal.status || 'new'}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    {/* Satellite Zoom Button */}
                    {!isZoomedIn ? (
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => zoomToProperty(selectedDeal.id)}
                      >
                        <Satellite className="mr-2 h-4 w-4" />
                        Satellite View
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full border text-foreground hover:bg-secondary"
                        onClick={resetMapView}
                      >
                        <ZoomOut className="mr-2 h-4 w-4" />
                        Reset View
                      </Button>
                    )}
                    <Link href={`/deals/${selectedDeal.id}`} className="flex-1">
                      <Button className="w-full bg-accent-600 hover:bg-accent-700 text-white">
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : deals.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No deals found</p>
              ) : mapPanelView === 'list' ? (
                <div className="space-y-2">
                  {deals.map((deal: Property) => (
                    <button
                      key={deal.id}
                      className="w-full text-left p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      onClick={() => setSelectedDeal(deal)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground font-medium text-sm truncate">
                            {getAddress(deal)}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {deal.city}, {deal.state} • {formatPrice(deal.askingPrice)}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn('ml-2 text-xs', statusColors[deal.status || 'new'])}
                        >
                          {deal.status || 'new'}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {deals.map((deal: Property) => (
                    <DealGridCard
                      key={deal.id}
                      deal={deal}
                      onClick={() => setSelectedDeal(deal)}
                      selected={selectedDeal?.id === deal.id}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* List View - Table */}
      {viewMode === 'list' && (
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground">
              {isLoading ? 'Loading...' : `${pagination?.total || 0} Deals`}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow className="border hover:bg-transparent">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={deals.length > 0 && selectedPropertyIds.length === deals.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-muted-foreground">Address</TableHead>
                  <SortableTableHead label="City" field="city" currentSortBy={propertyFilters.sortBy} currentSortOrder={propertyFilters.sortOrder} onSort={handleSort} />
                  <SortableTableHead label="State" field="state" currentSortBy={propertyFilters.sortBy} currentSortOrder={propertyFilters.sortOrder} onSort={handleSort} />
                  <SortableTableHead label="Price" field="askingPrice" currentSortBy={propertyFilters.sortBy} currentSortOrder={propertyFilters.sortOrder} onSort={handleSort} />
                  <SortableTableHead label="Beds/Baths" field="bedroomCount" currentSortBy={propertyFilters.sortBy} currentSortOrder={propertyFilters.sortOrder} onSort={handleSort} />
                  <TableHead className="text-muted-foreground">Marketplace</TableHead>
                  <TableHead className="text-muted-foreground">Offers</TableHead>
                  <TableHead className="text-muted-foreground">Compliance</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border">
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : deals.length === 0 ? (
                  <TableRow className="border">
                    <TableCell colSpan={10} className="text-center py-12">
                      <p className="text-muted-foreground">No deals found</p>
                      <Link href="/import">
                        <Button variant="link" className="text-accent-400 mt-2">
                          Import your first deal
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ) : (
                  deals.map((deal: Property) => {
                    const approvalStatus = deal.approvalStatus || 'draft';
                    const rowColor = approvalStatusRowColors[approvalStatus] || approvalStatusRowColors.draft;
                    const statusConfig = approvalStatusConfig[approvalStatus] || approvalStatusConfig.draft;
                    return (
                      <TableRow
                        key={deal.id}
                        className={cn('border cursor-pointer', rowColor)}
                        onClick={(e) => {
                          // Don't navigate if clicking on checkbox or dropdown
                          const target = e.target as HTMLElement;
                          if (target.closest('button') || target.closest('[role="checkbox"]') || target.closest('[role="menuitem"]')) {
                            return;
                          }
                          router.push(`/deals/${deal.id}`);
                        }}
                        onContextMenu={(e) => handleContextMenu(e, deal)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedPropertyIds.includes(deal.id)}
                            onCheckedChange={(checked) => handleSelectOne(deal.id, checked as boolean)}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            {getAddress(deal)}
                            {deal._hasUnreadMessages && (
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-foreground">{deal.city}</TableCell>
                        <TableCell className="text-foreground">{deal.state}</TableCell>
                        <TableCell className="text-foreground">
                          {formatPrice(deal.askingPrice)}
                        </TableCell>
                        <TableCell className="text-foreground">
                          {deal.bedroomCount || '-'} / {deal.bathroomCount || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('font-medium', statusConfig.color)}
                          >
                            <span className="mr-1">{statusConfig.icon}</span>
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {deal._offerCount && deal._offerCount > 0 ? (
                            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                              {deal._offerCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <ComplianceBadge complianceNotes={deal.complianceNotes} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-secondary border">
                              <DropdownMenuItem className="text-foreground" asChild>
                                <Link href={`/deals/${deal.id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-foreground">
                                <BarChart3 className="mr-2 h-4 w-4" />
                                Score Deal
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-foreground"
                                onClick={() => handleSubmit(deal.id)}
                                disabled={submitForApproval.isPending}
                              >
                                <Send className="mr-2 h-4 w-4" />
                                {submitForApproval.isPending ? 'Submitting...' : 'Submit for Approval'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-zinc-700" />
                              <DropdownMenuItem
                                className="text-red-400"
                                onClick={() => handleDelete(deal.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border">
                <p className="text-sm text-muted-foreground">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border text-foreground"
                    disabled={pagination.page <= 1}
                    onClick={() => handlePageChange(pagination.page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="flex items-center px-3 text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border text-foreground"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => handlePageChange(pagination.page + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pipeline View - Kanban */}
      {viewMode === 'pipeline' && isMounted && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {pipelineStages.map((stage) => {
              const stageDeals = deals.filter(
                (d: Property) => (d.approvalStatus || 'draft') === stage.id
              );
              return (
                <div key={stage.id} className="flex-shrink-0 w-72">
                  <Card className="bg-card/50 border h-full">
                    <CardHeader
                      className="pb-3"
                      style={{ borderBottom: `3px solid ${stage.color}` }}
                    >
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base text-foreground">{stage.title}</CardTitle>
                        <Badge
                          variant="secondary"
                          className="text-xs"
                          style={{
                            backgroundColor: `${stage.color}20`,
                            color: stage.color,
                          }}
                        >
                          {isLoading ? '...' : stageDeals.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-2 h-[calc(100vh-280px)] overflow-y-auto">
                      <Droppable droppableId={stage.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={cn(
                              'min-h-full rounded-lg transition-colors space-y-2',
                              snapshot.isDraggingOver && 'bg-secondary/50'
                            )}
                          >
                            {isLoading ? (
                              Array.from({ length: 2 }).map((_, i) => (
                                <Skeleton key={i} className="h-24 w-full" />
                              ))
                            ) : stageDeals.length === 0 ? (
                              <div className="text-center py-8 text-muted-foreground text-sm">
                                No deals
                              </div>
                            ) : (
                              stageDeals.map((deal: Property, index: number) => (
                                <Draggable key={deal.id} draggableId={String(deal.id)} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={cn(
                                        snapshot.isDragging && 'opacity-90'
                                      )}
                                      onContextMenu={(e) => handleContextMenu(e, deal)}
                                    >
                                      <Card
                                        className={cn(
                                          'bg-secondary/50 border cursor-grab hover:bg-secondary hover:border transition-colors',
                                          snapshot.isDragging && 'shadow-xl border-accent-500 cursor-grabbing'
                                        )}
                                      >
                                        <CardContent className="p-3">
                                          <div className="flex items-start gap-2">
                                            <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                            <div
                                              className="flex-1 min-w-0"
                                              onClick={() => router.push(`/deals/${deal.id}`)}
                                            >
                                              <p className="text-sm font-medium text-foreground truncate">
                                                {getAddress(deal)}
                                              </p>
                                              <p className="text-xs text-muted-foreground">
                                                {deal.city}, {deal.state}
                                              </p>
                                              <div className="flex items-center justify-between mt-2">
                                                <span className="text-sm font-medium text-accent-400">
                                                  {formatPrice(deal.askingPrice)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        </CardContent>
                                      </Card>
                                    </div>
                                  )}
                                </Draggable>
                              ))
                            )}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[200px] bg-card border border rounded-lg shadow-xl py-1 animate-in fade-in-0 zoom-in-95"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 220),
            top: Math.min(contextMenu.y, window.innerHeight - 350),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border">
            <p className="text-sm font-medium text-foreground truncate max-w-[180px]">
              {getAddress(contextMenu.deal)}
            </p>
            <p className="text-xs text-muted-foreground">
              {contextMenu.deal.city}, {contextMenu.deal.state}
            </p>
          </div>

          <div className="py-1">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
              onClick={() => {
                router.push(`/deals/${contextMenu.deal.id}`);
                closeContextMenu();
              }}
            >
              <Eye className="h-4 w-4" />
              View Details
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
              onClick={() => {
                router.push(`/deals/${contextMenu.deal.id}/edit`);
                closeContextMenu();
              }}
            >
              <Edit className="h-4 w-4" />
              Edit Deal
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
              onClick={() => {
                window.open(`/deals/${contextMenu.deal.id}`, '_blank');
                closeContextMenu();
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Open in New Tab
            </button>
          </div>

          <div className="border-t border py-1">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
              onClick={() => {
                handleSubmit(contextMenu.deal.id);
                closeContextMenu();
              }}
              disabled={submitForApproval.isPending}
            >
              <Send className="h-4 w-4" />
              Submit for Approval
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
              Score Deal
            </button>
          </div>

          <div className="border-t border py-1">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
              onClick={() => handleCopyAddress(contextMenu.deal)}
            >
              <Copy className="h-4 w-4" />
              Copy Address
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
              onClick={() => handleCopyId(contextMenu.deal)}
            >
              <Copy className="h-4 w-4" />
              Copy Deal ID
            </button>
          </div>

          <div className="border-t border py-1">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-950/50 transition-colors"
              onClick={() => {
                handleDelete(contextMenu.deal.id);
                closeContextMenu();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete Deal
            </button>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent className="bg-card border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete {selectedPropertyIds.length} Deal{selectedPropertyIds.length > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action cannot be undone. This will permanently delete the selected deal{selectedPropertyIds.length > 1 ? 's' : ''} and all associated data including documents, contacts, and compliance records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border text-foreground hover:bg-secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteProperties.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {bulkDeleteProperties.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete {selectedPropertyIds.length} Deal{selectedPropertyIds.length > 1 ? 's' : ''}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DealsLoadingFallback() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Deals</h1>
        <p className="text-muted-foreground mt-1">Manage your property deals</p>
      </div>
      <Card className="bg-card border">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin mb-4" />
          <p className="text-muted-foreground">Loading deals...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DealsPage() {
  return (
    <Suspense fallback={<DealsLoadingFallback />}>
      <DealsContent />
    </Suspense>
  );
}
