'use client';

import { useState, useEffect, Fragment } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Search,
  Trash2,
  Mail,
  Phone,
  MoreHorizontal,
  Users,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Flame,
  MapPin,
  Building2,
  TrendingUp,
  Upload,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import {
  useBuyers,
  useBuyerStats,
  useDeleteBuyer,
  useImportBuyers,
} from '@/hooks/use-buyers';
import { toast } from 'sonner';
import type { Buyer, BuyerStatus, BuyerContact } from '@/types';

const STATUS_COLORS: Record<BuyerStatus, string> = {
  active: 'bg-green-500/20 text-green-400',
  inactive: 'bg-zinc-500/20 text-muted-foreground',
  archived: 'bg-red-500/20 text-red-400',
};

export default function BuyersPage() {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<BuyerStatus | 'all'>('all');
  const [hotOnlyFilter, setHotOnlyFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<Buyer | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Import state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data, isLoading, error, refetch } = useBuyers({
    page,
    limit: 20,
    search: search || undefined,
    state: stateFilter !== 'all' ? stateFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    hotOnly: hotOnlyFilter || undefined,
  });

  const { data: statsData } = useBuyerStats();
  const deleteBuyer = useDeleteBuyer();
  const importBuyers = useImportBuyers();

  const buyers = data?.data || [];
  const pagination = data?.pagination;
  const stats = statsData;

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this buyer?')) return;
    try {
      await deleteBuyer.mutateAsync(id);
      toast.success('Buyer deleted successfully');
    } catch {
      toast.error('Failed to delete buyer');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error('Please select a CSV file');
      return;
    }

    setIsImporting(true);
    try {
      // Read file content
      const csvContent = await selectedFile.text();
      const result = await importBuyers.mutateAsync(csvContent);
      toast.success(`Imported ${result.imported} buyers`);
      if (result.totalErrors > 0) {
        toast.warning(`${result.totalErrors} errors during import`);
      }
      setIsImportOpen(false);
      setSelectedFile(null);
    } catch (err) {
      toast.error(`Import failed: ${(err as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const formatPhone = (phone: string) => {
    return phone.replace(/[^+\d]/g, '');
  };

  const getPrimaryContact = (contacts?: BuyerContact[]) => {
    if (!contacts || contacts.length === 0) return null;
    return contacts.find((c) => c.isPrimary) || contacts[0];
  };

  // Group buyers by name
  const groupedBuyers = buyers.reduce((acc: Record<string, Buyer[]>, buyer: Buyer) => {
    const name = buyer.name.toUpperCase().trim();
    if (!acc[name]) {
      acc[name] = [];
    }
    acc[name].push(buyer);
    return acc;
  }, {});

  // Sort groups by total purchases (descending)
  const sortedGroups = Object.entries(groupedBuyers).sort((a, b) => {
    const totalA = a[1].reduce((sum, buyer) => sum + (buyer.purchases6Month || 0), 0);
    const totalB = b[1].reduce((sum, buyer) => sum + (buyer.purchases6Month || 0), 0);
    return totalB - totalA;
  });

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const getGroupStats = (buyers: Buyer[]) => {
    const totalPurchases = buyers.reduce((sum, b) => sum + (b.purchases6Month || 0), 0);
    const allCounties = [...new Set(buyers.flatMap((b) => b.buyingCounties || []))];
    const allContacts = buyers.flatMap((b) => b.contacts || []);
    const isHot = totalPurchases > 10 || buyers.some((b) => b.isHotPotential);
    return { totalPurchases, allCounties, allContacts, isHot, count: buyers.length };
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Buyers</h1>
          <p className="text-muted-foreground mt-1">Cash buyer database for property matching</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load buyers</p>
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
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Buyers</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {isLoading ? 'Loading...' : `${pagination?.total || 0} cash buyers`}
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            className="border text-foreground"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border text-foreground"
            onClick={() => setIsImportOpen(true)}
          >
            <Upload className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Import CSV</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Buyers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <Flame className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.hotBuyers}</p>
                  <p className="text-xs text-muted-foreground">Hot Potential</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.regularBuyers}</p>
                  <p className="text-xs text-muted-foreground">Regular Buyers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <MapPin className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.countiesCovered || 0}</p>
                  <p className="text-xs text-muted-foreground">Counties Covered</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search buyers..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 bg-card border text-foreground"
          />
        </div>
        <Select
          value={stateFilter}
          onValueChange={(v) => {
            setStateFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[120px] bg-card border text-foreground">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent className="bg-secondary border">
            <SelectItem value="all" className="text-foreground">
              All States
            </SelectItem>
            <SelectItem value="NJ" className="text-foreground">
              NJ
            </SelectItem>
            <SelectItem value="NY" className="text-foreground">
              NY
            </SelectItem>
            <SelectItem value="PA" className="text-foreground">
              PA
            </SelectItem>
            <SelectItem value="FL" className="text-foreground">
              FL
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as BuyerStatus | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[130px] bg-card border text-foreground">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-secondary border">
            <SelectItem value="all" className="text-foreground">
              All Status
            </SelectItem>
            <SelectItem value="active" className="text-foreground">
              Active
            </SelectItem>
            <SelectItem value="inactive" className="text-foreground">
              Inactive
            </SelectItem>
            <SelectItem value="archived" className="text-foreground">
              Archived
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={hotOnlyFilter ? 'default' : 'outline'}
          onClick={() => {
            setHotOnlyFilter(!hotOnlyFilter);
            setPage(1);
          }}
          className={
            hotOnlyFilter
              ? 'bg-orange-600 hover:bg-orange-700 text-foreground'
              : 'border text-foreground'
          }
        >
          <Flame className="mr-2 h-4 w-4" />
          Hot Only
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-card border">
        {isLoading ? (
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        ) : buyers.length > 0 ? (
          <>
            <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow className="border hover:bg-transparent">
                  <TableHead className="text-muted-foreground w-8"></TableHead>
                  <TableHead className="text-muted-foreground">Buyer</TableHead>
                  <TableHead className="text-muted-foreground">Location</TableHead>
                  <TableHead className="text-muted-foreground">Purchases (6M)</TableHead>
                  <TableHead className="text-muted-foreground">Contacts</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedGroups.map(([groupName, groupBuyers]) => {
                  const stats = getGroupStats(groupBuyers);
                  const isExpanded = expandedGroups.has(groupName);
                  const hasMultiple = groupBuyers.length > 1;
                  const firstBuyer = groupBuyers[0];
                  const primaryContact = getPrimaryContact(stats.allContacts);

                  return (
                    <Fragment key={groupName}>
                      {/* Group Header Row */}
                      <TableRow
                        className={`border ${hasMultiple ? 'cursor-pointer hover:bg-secondary/50' : ''}`}
                        onClick={() => hasMultiple && toggleGroup(groupName)}
                      >
                        <TableCell className="w-8">
                          {hasMultiple && (
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {stats.isHot && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Flame className="h-4 w-4 text-orange-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Hot Potential (&gt;10 purchases)</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <div>
                              <p className="font-medium text-foreground">{groupName}</p>
                              {hasMultiple ? (
                                <p className="text-sm text-muted-foreground">
                                  {stats.count} locations
                                </p>
                              ) : (
                                firstBuyer.address && (
                                  <p className="text-sm text-muted-foreground">{firstBuyer.address}</p>
                                )
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-foreground">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">
                                Buys in {firstBuyer.buyingState}
                              </p>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <p className="text-sm text-muted-foreground cursor-help">
                                      {stats.allCounties.length} counties
                                    </p>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-medium mb-1">Counties:</p>
                                    <p>{stats.allCounties.join(', ') || 'None'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={
                                stats.totalPurchases > 10
                                  ? 'bg-orange-500/20 text-orange-400'
                                  : 'bg-zinc-500/20 text-muted-foreground'
                              }
                            >
                              {stats.totalPurchases}
                            </Badge>
                            {stats.totalPurchases > 10 && (
                              <span className="text-xs text-orange-400">Hot</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-zinc-700 text-foreground">
                              {stats.allContacts.length} contacts
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[firstBuyer.status]}>
                            {firstBuyer.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-secondary border">
                              <DropdownMenuItem
                                onClick={() => setSelectedBuyer(firstBuyer)}
                                className="text-foreground cursor-pointer"
                              >
                                <Building2 className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              {groupBuyers.map((buyer) => (
                                <DropdownMenuItem
                                  key={buyer.id}
                                  onClick={() => handleDelete(buyer.id)}
                                  className="text-red-400 cursor-pointer"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete {hasMultiple ? `(${buyer.address?.slice(0, 20)}...)` : ''}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Rows - Individual Locations */}
                      {isExpanded &&
                        groupBuyers.map((buyer) => {
                          const contact = getPrimaryContact(buyer.contacts);
                          return (
                            <TableRow
                              key={buyer.id}
                              className="border bg-secondary/30"
                            >
                              <TableCell></TableCell>
                              <TableCell>
                                <div className="pl-4 border-l-2 border">
                                  <p className="text-sm text-muted-foreground">{buyer.address}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {buyer.city}, {buyer.state} {buyer.zip}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-muted-foreground">
                                  {buyer.buyingCounties?.length || 0} counties
                                </p>
                              </TableCell>
                              <TableCell>
                                <Badge className="bg-zinc-700 text-muted-foreground">
                                  {buyer.purchases6Month}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {contact ? (
                                  <div>
                                    <p className="text-sm text-foreground">
                                      {contact.firstName} {contact.lastName}
                                    </p>
                                    <div className="flex gap-2 mt-1">
                                      {contact.phones?.[0] && (
                                        <a
                                          href={`tel:${formatPhone(contact.phones[0].number)}`}
                                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent-400"
                                        >
                                          <Phone className="h-3 w-3" />
                                          {contact.phones[0].number}
                                        </a>
                                      )}
                                      {contact.emails?.[0] && (
                                        <a
                                          href={`mailto:${contact.emails[0]}`}
                                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent-400"
                                        >
                                          <Mail className="h-3 w-3" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">No contact</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge className={STATUS_COLORS[buyer.status]}>
                                  {buyer.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setSelectedBuyer(buyer)}
                                >
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="border"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= pagination.totalPages}
                    className="border"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No buyers found</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              {search || stateFilter !== 'all' || statusFilter !== 'all' || hotOnlyFilter
                ? 'Try adjusting your search or filters'
                : 'Import buyers from a CSV file to get started'}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Buyer Details Dialog */}
      {mounted && (
        <Dialog open={!!selectedBuyer} onOpenChange={(open) => !open && setSelectedBuyer(null)}>
          <DialogContent className="bg-card border max-w-[95vw] sm:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                {selectedBuyer?.isHotPotential && <Flame className="h-5 w-5 text-orange-500" />}
                {selectedBuyer?.name}
              </DialogTitle>
            </DialogHeader>
            {selectedBuyer && (
              <div className="space-y-6">
                {/* Buyer Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Mailing Address</p>
                    {selectedBuyer.address ? (
                      <div className="text-foreground">
                        <p>{selectedBuyer.address}</p>
                        <p className="text-muted-foreground">
                          {selectedBuyer.city ? `${selectedBuyer.city}, ` : ''}
                          {selectedBuyer.state} {selectedBuyer.zip}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Not available</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Purchases (6 Months)</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {selectedBuyer.purchases6Month}
                      </span>
                      {selectedBuyer.isHotPotential && (
                        <Badge className="bg-orange-500/20 text-orange-400">Hot</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Buying Areas */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Buying In</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedBuyer.buyingCounties?.map((county: string) => (
                      <Badge key={county} className="bg-accent-500/20 text-accent-400">
                        {county}, {selectedBuyer.buyingState}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Contacts */}
                {selectedBuyer.contacts && selectedBuyer.contacts.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-3">Contacts</h4>
                    <div className="space-y-3">
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
                              <Badge className="bg-accent-500/20 text-accent-400">Primary</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-4">
                            {contact.phones?.map((phone, idx) => (
                              <a
                                key={idx}
                                href={`tel:${formatPhone(phone.number)}`}
                                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-accent-400"
                              >
                                <Phone className="h-3.5 w-3.5" />
                                {phone.number}
                                {phone.type && (
                                  <span className="text-xs text-muted-foreground">({phone.type})</span>
                                )}
                              </a>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-4 mt-2">
                            {contact.emails?.map((email, idx) => (
                              <a
                                key={idx}
                                href={`mailto:${email}`}
                                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-accent-400"
                              >
                                <Mail className="h-3.5 w-3.5" />
                                {email}
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
      )}

      {/* Import Dialog */}
      {mounted && (
        <Dialog open={isImportOpen} onOpenChange={(open) => {
          setIsImportOpen(open);
          if (!open) setSelectedFile(null);
        }}>
          <DialogContent className="bg-card border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Import Buyers from CSV</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-2">Select CSV File</label>
                <div className="border-2 border-dashed border rounded-lg p-6 text-center hover:border transition-colors">
                  {selectedFile ? (
                    <div className="space-y-2">
                      <CheckCircle2 className="h-10 w-10 mx-auto text-green-500" />
                      <p className="text-foreground font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedFile(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Choose different file
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-foreground font-medium mb-1">Click to select CSV file</p>
                      <p className="text-xs text-muted-foreground">or drag and drop</p>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsImportOpen(false);
                    setSelectedFile(null);
                  }}
                  className="flex-1 border text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={isImporting || !selectedFile}
                  className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Import
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
