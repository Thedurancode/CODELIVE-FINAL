'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Search,
  Upload,
  Edit2,
  Trash2,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Home,
  Zap,
  AlertCircle,
  RefreshCw,
  LayoutGrid,
  List,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Building2,
  Layers,
  Eye,
  X,
  Calendar,
  Target,
  TrendingUp,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBuyBoxes, useToggleBuyBox, useDeleteBuyBox } from '@/hooks/use-buyboxes';
import { toast } from 'sonner';
import type { HedgeFundBuyBox } from '@/types';
import { AdminBuyBoxForm } from '@/components/buybox/AdminBuyBoxForm';

const VIEW_MODE_KEY = 'dispotree_buybox_view_mode';
const SORT_KEY = 'dispotree_buybox_sort';
const GROUP_KEY = 'dispotree_buybox_group';

type SortOption = 'name' | 'fundName' | 'priority' | 'createdAt';
type SortDirection = 'asc' | 'desc';

const SORT_LABELS: Record<SortOption, string> = {
  name: 'Name',
  fundName: 'Fund',
  priority: 'Priority',
  createdAt: 'Date Created',
};

export default function BuyBoxesPage() {
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBuyBox, setEditingBuyBox] = useState<HedgeFundBuyBox | null>(null);
  const [viewingBuyBox, setViewingBuyBox] = useState<HedgeFundBuyBox | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('fundName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [groupByFund, setGroupByFund] = useState(true);
  const [expandedFunds, setExpandedFunds] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  // Load persisted preferences and mark as mounted
  useEffect(() => {
    const savedViewMode = localStorage.getItem(VIEW_MODE_KEY) as 'grid' | 'list' | null;
    if (savedViewMode && (savedViewMode === 'grid' || savedViewMode === 'list')) {
      setViewMode(savedViewMode);
    }
    const savedSort = localStorage.getItem(SORT_KEY);
    if (savedSort) {
      const [sort, dir] = savedSort.split(':') as [SortOption, SortDirection];
      setSortBy(sort);
      setSortDirection(dir);
    }
    const savedGroup = localStorage.getItem(GROUP_KEY);
    if (savedGroup !== null) {
      setGroupByFund(savedGroup === 'true');
    }
    setMounted(true);
  }, []);

  // Persist view mode changes
  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  // Handle sort changes
  const handleSortChange = (option: SortOption) => {
    if (sortBy === option) {
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
      localStorage.setItem(SORT_KEY, `${option}:${newDirection}`);
    } else {
      setSortBy(option);
      setSortDirection('asc');
      localStorage.setItem(SORT_KEY, `${option}:asc`);
    }
  };

  // Handle group toggle
  const handleGroupToggle = () => {
    const newValue = !groupByFund;
    setGroupByFund(newValue);
    localStorage.setItem(GROUP_KEY, String(newValue));
  };

  // Toggle fund expand/collapse (collapsed by default)
  const toggleFundExpand = (fundName: string) => {
    setExpandedFunds((prev) => {
      const next = new Set(prev);
      if (next.has(fundName)) {
        next.delete(fundName);
      } else {
        next.add(fundName);
      }
      return next;
    });
  };

  const { data: buyBoxes, isLoading, error, refetch } = useBuyBoxes();
  const toggleBuyBox = useToggleBuyBox();
  const deleteBuyBox = useDeleteBuyBox();

  const allBuyBoxes = Array.isArray(buyBoxes) ? buyBoxes : [];

  // Filter by search
  const filteredBoxes = allBuyBoxes.filter(
    (box: HedgeFundBuyBox) =>
      box.name?.toLowerCase().includes(search.toLowerCase()) ||
      box.fundName?.toLowerCase().includes(search.toLowerCase())
  );

  // Sort boxes
  const sortedBoxes = [...filteredBoxes].sort((a: HedgeFundBuyBox, b: HedgeFundBuyBox) => {
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = (a.name || '').localeCompare(b.name || '');
        break;
      case 'fundName':
        comparison = (a.fundName || '').localeCompare(b.fundName || '');
        break;
      case 'priority':
        comparison = (b.priority || 0) - (a.priority || 0); // Higher priority first
        break;
      case 'createdAt':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Group boxes by fund
  const groupedBoxes = sortedBoxes.reduce((acc, box) => {
    const fundName = box.fundName || 'Unknown Fund';
    if (!acc[fundName]) {
      acc[fundName] = [];
    }
    acc[fundName].push(box);
    return acc;
  }, {} as Record<string, HedgeFundBuyBox[]>);

  // Get fund names sorted
  const fundNames = Object.keys(groupedBoxes).sort((a, b) => a.localeCompare(b));

  const toggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      await toggleBuyBox.mutateAsync({ id, enabled: !currentEnabled });
      toast.success(`Buy box ${!currentEnabled ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update buy box');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBuyBox.mutateAsync(id);
      toast.success('Buy box deleted');
    } catch {
      toast.error('Failed to delete buy box');
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'N/A';
    return `$${(price / 1000).toFixed(0)}K`;
  };

  // Check both 'enabled' and 'active' fields (API returns 'active')
  const isBoxActive = (box: HedgeFundBuyBox) => (box as HedgeFundBuyBox & { active?: boolean }).active ?? box.enabled;
  const enabledCount = allBuyBoxes.filter((b: HedgeFundBuyBox) => isBoxActive(b)).length;

  // Render a single buy box card
  const renderBuyBoxCard = (box: HedgeFundBuyBox, showFundName = true) => (
    <Card
      key={box.id}
      className={`bg-card border-2 transition-colors cursor-pointer hover:border-accent-500 ${
        isBoxActive(box) ? 'border-accent-600' : 'border opacity-60'
      }`}
      onClick={() => setViewingBuyBox(box)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg text-foreground hover:text-accent-400 transition-colors">{box.name}</CardTitle>
            {showFundName && <p className="text-sm text-muted-foreground">{box.fundName}</p>}
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {box.priority !== undefined && (
              <Badge
                variant="outline"
                className={
                  box.priority >= 8
                    ? 'border-red-500 text-red-500'
                    : box.priority >= 5
                    ? 'border-amber-500 text-amber-500'
                    : 'border-zinc-500 text-muted-foreground'
                }
              >
                P{box.priority}
              </Badge>
            )}
            <Switch
              checked={isBoxActive(box)}
              onCheckedChange={() => toggleEnabled(box.id, isBoxActive(box))}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* States */}
        <div className="flex flex-wrap gap-1.5">
          {box.criteria?.states?.slice(0, 4).map((state: string) => (
            <Badge key={state} variant="secondary" className="bg-secondary text-foreground">
              {state}
            </Badge>
          ))}
          {(box.criteria?.states?.length || 0) > 4 && (
            <Badge variant="secondary" className="bg-secondary text-muted-foreground">
              +{(box.criteria?.states?.length || 0) - 4} more
            </Badge>
          )}
        </div>

        {/* Quick Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span>
              {formatPrice(box.criteria?.minPrice)} - {formatPrice(box.criteria?.maxPrice)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Home className="h-4 w-4" />
            <span>{box.criteria?.minBedrooms || 'Any'}+ beds</span>
          </div>
        </div>

        {/* Auto Submit */}
        {box.autoSubmit && (
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-500">
              Auto-submit at {box.autoSubmitThreshold || 75}%
            </span>
          </div>
        )}

        {/* Contact */}
        <div className="space-y-1.5 text-sm">
          {box.contactEmail && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{box.contactEmail}</span>
            </div>
          )}
          {box.contactPhone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{box.contactPhone}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border text-foreground"
            onClick={() => setViewingBuyBox(box)}
          >
            <Eye className="mr-2 h-4 w-4" />
            View
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border text-foreground"
            onClick={() => setEditingBuyBox(box)}
          >
            <Edit2 className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-red-700/50 text-red-400 hover:bg-red-900/20"
            onClick={() => handleDelete(box.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Buy Boxes</h1>
          <p className="text-muted-foreground mt-1">Manage hedge fund buy box criteria</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load buy boxes</p>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Buy Boxes</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {isLoading ? 'Loading...' : `${enabledCount} of ${allBuyBoxes.length} active`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button variant="outline" size="sm" className="border text-foreground" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" className="border text-foreground">
            <Upload className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Import from PDF</span>
          </Button>
          {mounted ? (
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button className="bg-accent-600 hover:bg-accent-700 text-white">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Buy Box
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border max-w-2xl w-[95vw] max-h-[85vh] overflow-y-auto" showCloseButton={false}>
                <AdminBuyBoxForm
                  onSuccess={() => setIsFormOpen(false)}
                  onCancel={() => setIsFormOpen(false)}
                />
              </DialogContent>
            </Dialog>
          ) : (
            <Button className="bg-accent-600 hover:bg-accent-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Add Buy Box
            </Button>
          )}
        </div>
      </div>

      {/* Search, Sort, Group, and View Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search buy boxes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border text-foreground"
          />
        </div>

        {/* Sort Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border text-foreground">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              {SORT_LABELS[sortBy]}
              {sortDirection === 'desc' && ' ↓'}
              {sortDirection === 'asc' && ' ↑'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-card border">
            {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
              <DropdownMenuItem
                key={option}
                onClick={() => handleSortChange(option)}
                className={`text-foreground hover:bg-secondary ${sortBy === option ? 'bg-secondary' : ''}`}
              >
                {SORT_LABELS[option]}
                {sortBy === option && (
                  <span className="ml-2 text-accent-500">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Group by Fund Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleGroupToggle}
          className={`border ${groupByFund ? 'bg-accent-600/20 border-accent-600 text-accent-400' : 'text-white'}`}
        >
          <Layers className="h-4 w-4 mr-2" />
          Group by Fund
        </Button>

        {/* View Mode Toggle */}
        <div className="flex border border rounded-lg overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleViewModeChange('grid')}
            className={`rounded-none ${viewMode === 'grid' ? 'bg-zinc-700' : ''}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleViewModeChange('list')}
            className={`rounded-none ${viewMode === 'list' ? 'bg-zinc-700' : ''}`}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        viewMode === 'grid' ? (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="bg-card border">
                <CardHeader className="pb-3">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-24 mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-card border">
            <CardContent className="p-6">
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <Skeleton className="h-10 w-10 rounded" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-1/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      ) : sortedBoxes.length > 0 ? (
        viewMode === 'list' ? (
          groupByFund ? (
            /* Grouped List View */
            <div className="space-y-4">
              {fundNames.map((fundName) => {
                const fundBoxes = groupedBoxes[fundName];
                const isExpanded = expandedFunds.has(fundName);
                const activeCount = fundBoxes.filter((b) => isBoxActive(b)).length;

                return (
                  <Card key={fundName} className="bg-card border overflow-hidden">
                    {/* Fund Header */}
                    <button
                      onClick={() => toggleFundExpand(fundName)}
                      className="flex items-center gap-3 w-full text-left p-4 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <Building2 className="h-5 w-5 text-accent-500" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {fundName}
                      </h3>
                      <Badge variant="secondary" className="bg-secondary text-foreground">
                        {fundBoxes.length} buy box{fundBoxes.length !== 1 ? 'es' : ''}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={activeCount === fundBoxes.length ? 'border-green-500 text-green-500' : 'border text-muted-foreground'}
                      >
                        {activeCount} active
                      </Badge>
                    </button>

                    {/* Fund Buy Boxes Table */}
                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <Table className="min-w-[700px]">
                          <TableHeader>
                            <TableRow className="border hover:bg-transparent">
                              <TableHead className="text-muted-foreground">Name</TableHead>
                              <TableHead className="text-muted-foreground">States</TableHead>
                              <TableHead className="text-muted-foreground">Price Range</TableHead>
                              <TableHead className="text-muted-foreground">Email</TableHead>
                              <TableHead className="text-muted-foreground">Phone</TableHead>
                              <TableHead className="text-muted-foreground">Status</TableHead>
                              <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fundBoxes.map((box: HedgeFundBuyBox) => (
                              <TableRow key={box.id} className="border">
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-foreground">{box.name}</p>
                                    <p className="text-sm text-muted-foreground">{box.fundType || 'Institutional'}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {box.criteria?.states?.slice(0, 3).map((state: string) => (
                                      <Badge key={state} variant="secondary" className="bg-secondary text-foreground text-xs">
                                        {state}
                                      </Badge>
                                    ))}
                                    {(box.criteria?.states?.length || 0) > 3 && (
                                      <Badge variant="secondary" className="bg-secondary text-muted-foreground text-xs">
                                        +{(box.criteria?.states?.length || 0) - 3}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="text-foreground">
                                    {formatPrice(box.criteria?.minPrice)} - {formatPrice(box.criteria?.maxPrice)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {box.contactEmail ? (
                                    <a
                                      href={`mailto:${box.contactEmail}`}
                                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-400 transition-colors"
                                    >
                                      <Mail className="h-3.5 w-3.5" />
                                      <span className="truncate max-w-[150px]">{box.contactEmail}</span>
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {box.contactPhone ? (
                                    <a
                                      href={`tel:${box.contactPhone.replace(/[^+\d]/g, '')}`}
                                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-400 transition-colors"
                                    >
                                      <Phone className="h-3.5 w-3.5" />
                                      <span>{box.contactPhone}</span>
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Switch
                                    checked={isBoxActive(box)}
                                    onCheckedChange={() => toggleEnabled(box.id, isBoxActive(box))}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex gap-2 justify-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingBuyBox(box)}
                                      className="h-8 w-8 p-0"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDelete(box.id)}
                                      className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            /* Flat List View */
            <Card className="bg-card border overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow className="border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Name</TableHead>
                    <TableHead className="text-muted-foreground">Fund</TableHead>
                    <TableHead className="text-muted-foreground">States</TableHead>
                    <TableHead className="text-muted-foreground">Price Range</TableHead>
                    <TableHead className="text-muted-foreground">Email</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedBoxes.map((box: HedgeFundBuyBox) => (
                    <TableRow key={box.id} className="border">
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{box.name}</p>
                          <p className="text-sm text-muted-foreground">{box.fundType || 'Institutional'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-foreground">{box.fundName}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {box.criteria?.states?.slice(0, 3).map((state: string) => (
                            <Badge key={state} variant="secondary" className="bg-secondary text-foreground text-xs">
                              {state}
                            </Badge>
                          ))}
                          {(box.criteria?.states?.length || 0) > 3 && (
                            <Badge variant="secondary" className="bg-secondary text-muted-foreground text-xs">
                              +{(box.criteria?.states?.length || 0) - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-foreground">
                          {formatPrice(box.criteria?.minPrice)} - {formatPrice(box.criteria?.maxPrice)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {box.contactEmail ? (
                          <a
                            href={`mailto:${box.contactEmail}`}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-400 transition-colors"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            <span className="truncate max-w-[150px]">{box.contactEmail}</span>
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={isBoxActive(box)}
                          onCheckedChange={() => toggleEnabled(box.id, isBoxActive(box))}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingBuyBox(box)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(box.id)}
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )
        ) : groupByFund ? (
          /* Grouped Grid View */
          <div className="space-y-6">
            {fundNames.map((fundName) => {
              const fundBoxes = groupedBoxes[fundName];
              const isExpanded = expandedFunds.has(fundName);
              const activeCount = fundBoxes.filter((b) => isBoxActive(b)).length;

              return (
                <div key={fundName} className="space-y-3">
                  {/* Fund Header */}
                  <button
                    onClick={() => toggleFundExpand(fundName)}
                    className="flex items-center gap-3 w-full text-left group"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                      )}
                      <Building2 className="h-5 w-5 text-accent-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground group-hover:text-accent-400 transition-colors">
                      {fundName}
                    </h3>
                    <Badge variant="secondary" className="bg-secondary text-foreground">
                      {fundBoxes.length} buy box{fundBoxes.length !== 1 ? 'es' : ''}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={activeCount === fundBoxes.length ? 'border-green-500 text-green-500' : 'border text-muted-foreground'}
                    >
                      {activeCount} active
                    </Badge>
                  </button>

                  {/* Fund Buy Boxes */}
                  {isExpanded && (
                    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pl-7">
                      {fundBoxes.map((box) => renderBuyBoxCard(box, false))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Flat Grid View */
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {sortedBoxes.map((box) => renderBuyBoxCard(box, true))}
          </div>
        )) : (
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No buy boxes found</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              {search
                ? 'Try adjusting your search terms'
                : 'Add your first buy box to start matching deals'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      {mounted && (
        <Dialog open={!!editingBuyBox} onOpenChange={(open) => !open && setEditingBuyBox(null)}>
          <DialogContent className="bg-card border max-w-2xl w-[95vw] max-h-[85vh] overflow-y-auto" showCloseButton={false}>
            <DialogTitle className="sr-only">Edit Buy Box</DialogTitle>
            {editingBuyBox && (
              <AdminBuyBoxForm
                buyBox={editingBuyBox}
                onSuccess={() => setEditingBuyBox(null)}
                onCancel={() => setEditingBuyBox(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* View Dialog - Fast Buy Box Style Preview */}
      {mounted && (
        <Dialog open={!!viewingBuyBox} onOpenChange={(open) => !open && setViewingBuyBox(null)}>
          <DialogContent className="bg-card border max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogTitle className="sr-only">View Buy Box Details</DialogTitle>
            {viewingBuyBox && (
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between pb-4 border-b border">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-bold text-foreground">{viewingBuyBox.name}</h2>
                      <Badge
                        className={isBoxActive(viewingBuyBox) ? 'bg-green-600' : 'bg-zinc-600'}
                      >
                        {isBoxActive(viewingBuyBox) ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {viewingBuyBox.fundName}
                    </p>
                  </div>
                  {viewingBuyBox.priority !== undefined && (
                    <Badge
                      variant="outline"
                      className={`text-lg px-3 py-1 ${
                        viewingBuyBox.priority >= 8
                          ? 'border-red-500 text-red-500 bg-red-500/10'
                          : viewingBuyBox.priority >= 5
                          ? 'border-amber-500 text-amber-500 bg-amber-500/10'
                          : 'border-zinc-500 text-muted-foreground'
                      }`}
                    >
                      P{viewingBuyBox.priority}
                    </Badge>
                  )}
                </div>

                {/* Quick Stats Grid - Fast Buy Box Style */}
                <div className="bg-secondary/50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {/* States */}
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">States</span>
                      <p className="text-foreground mt-1">
                        {(viewingBuyBox.criteria?.states?.length ?? 0) > 0
                          ? viewingBuyBox.criteria!.states!.slice(0, 5).join(', ') + (viewingBuyBox.criteria!.states!.length > 5 ? ` +${viewingBuyBox.criteria!.states!.length - 5} more` : '')
                          : 'All States'}
                      </p>
                    </div>
                    {/* Price Range */}
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">Price Range</span>
                      <p className="text-foreground mt-1">
                        {formatPrice(viewingBuyBox.criteria?.minPrice)} - {formatPrice(viewingBuyBox.criteria?.maxPrice)}
                      </p>
                    </div>
                    {/* Bedrooms */}
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">Bedrooms</span>
                      <p className="text-foreground mt-1">
                        {viewingBuyBox.criteria?.minBedrooms || 'Any'} - {viewingBuyBox.criteria?.maxBedrooms || 'Any'} beds
                      </p>
                    </div>
                    {/* Contact */}
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">Contact</span>
                      <p className="text-foreground mt-1 truncate">
                        {viewingBuyBox.contactEmail || 'Not set'}
                      </p>
                    </div>
                    {/* ARV if set */}
                    {(viewingBuyBox.criteria?.minARV || viewingBuyBox.criteria?.maxARV) && (
                      <div>
                        <span className="text-muted-foreground text-xs uppercase tracking-wide">ARV Range</span>
                        <p className="text-foreground mt-1">
                          {viewingBuyBox.criteria?.minARV ? formatPrice(viewingBuyBox.criteria.minARV) : 'Any'} - {viewingBuyBox.criteria?.maxARV ? formatPrice(viewingBuyBox.criteria.maxARV) : 'Any'}
                        </p>
                      </div>
                    )}
                    {/* Auto Submit */}
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">Auto-Submit</span>
                      <p className={`mt-1 ${viewingBuyBox.autoSubmit ? 'text-green-400' : 'text-muted-foreground'}`}>
                        {viewingBuyBox.autoSubmit ? `Yes (${viewingBuyBox.autoSubmitThreshold || 75}% threshold)` : 'Disabled'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Property Types */}
                {viewingBuyBox.criteria?.propertyTypes && viewingBuyBox.criteria.propertyTypes.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Property Types</p>
                    <div className="flex flex-wrap gap-2">
                      {viewingBuyBox.criteria.propertyTypes.map((type: string) => (
                        <Badge key={type} className="bg-accent-600/20 text-accent-400 border border-accent-600/30">
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Investment Strategies */}
                {viewingBuyBox.criteria?.investmentStrategies && viewingBuyBox.criteria.investmentStrategies.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Investment Strategies</p>
                    <div className="flex flex-wrap gap-2">
                      {viewingBuyBox.criteria.investmentStrategies.map((strategy: string) => (
                        <Badge key={strategy} className="bg-green-600/20 text-green-400 border border-green-600/30">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {strategy.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risk Tolerance - Toggle Style */}
                {viewingBuyBox.criteria && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-3">Risk Tolerance</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { key: 'allowHoa', label: 'HOA' },
                        { key: 'allowPool', label: 'Pool' },
                        { key: 'allowFloodZone', label: 'Flood Zone' },
                        { key: 'allowFoundationIssues', label: 'Foundation' },
                        { key: 'allowSeptic', label: 'Septic' },
                        { key: 'allowWell', label: 'Well Water' },
                        { key: 'allowSolarPanels', label: 'Solar Panels' },
                        { key: 'allowFireDamage', label: 'Fire Damage' },
                        { key: 'allowCodeViolations', label: 'Code Violations' },
                      ].map(({ key, label }) => {
                        const isAllowed = viewingBuyBox.criteria?.[key as keyof typeof viewingBuyBox.criteria];
                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                              isAllowed
                                ? 'bg-green-600/10 border border-green-600/30 text-green-400'
                                : 'bg-secondary/50 border border text-muted-foreground'
                            }`}
                          >
                            {isAllowed ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Contact Details */}
                {(viewingBuyBox.contactEmail || viewingBuyBox.contactPhone) && (
                  <div className="bg-secondary/30 rounded-lg p-4">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-3">Contact Details</p>
                    <div className="flex flex-wrap gap-4">
                      {viewingBuyBox.contactEmail && (
                        <a
                          href={`mailto:${viewingBuyBox.contactEmail}`}
                          className="flex items-center gap-2 text-foreground hover:text-accent-400 transition-colors"
                        >
                          <Mail className="h-4 w-4" />
                          <span>{viewingBuyBox.contactEmail}</span>
                        </a>
                      )}
                      {viewingBuyBox.contactPhone && (
                        <a
                          href={`tel:${viewingBuyBox.contactPhone.replace(/[^+\d]/g, '')}`}
                          className="flex items-center gap-2 text-foreground hover:text-accent-400 transition-colors"
                        >
                          <Phone className="h-4 w-4" />
                          <span>{viewingBuyBox.contactPhone}</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Created Date */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Created {new Date(viewingBuyBox.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border">
                  <Button
                    className="flex-1 bg-accent-600 hover:bg-accent-700"
                    onClick={() => {
                      setViewingBuyBox(null);
                      setEditingBuyBox(viewingBuyBox);
                    }}
                  >
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit Buy Box
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border text-foreground"
                    onClick={() => setViewingBuyBox(null)}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
