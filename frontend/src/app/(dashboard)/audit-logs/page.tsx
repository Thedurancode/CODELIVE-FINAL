'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  useAuditLogs,
  useAuditStatistics,
  useAuditFilterOptions,
  useRetentionInfo,
  useVerifyChain,
  useExportAuditLogs,
  useCleanupExpiredLogs,
  AuditLogEntry,
  AuditLogQueryParams,
  SEVERITY_COLORS,
  CATEGORY_COLORS,
  OUTCOME_COLORS,
  ACTOR_TYPE_LABELS,
  CATEGORY_LABELS,
} from '@/hooks/use-audit-logs';
import { toast } from 'sonner';
import {
  Shield,
  Search,
  RefreshCw,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  User,
  Server,
  Activity,
  Database,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  Calendar,
  Filter,
  ShieldCheck,
  Trash2,
  BarChart3,
} from 'lucide-react';

export default function AuditLogsPage() {
  // Filter state
  const [filters, setFilters] = useState<AuditLogQueryParams>({
    limit: 25,
    offset: 0,
  });
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });

  // UI state
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('logs');

  // Data queries
  const { data: logsData, isLoading, refetch } = useAuditLogs({
    ...filters,
    startDate: dateRange.start || undefined,
    endDate: dateRange.end || undefined,
  });
  const { data: statistics, isLoading: statsLoading } = useAuditStatistics(30);
  const { data: filterOptions } = useAuditFilterOptions();
  const { data: retentionInfo } = useRetentionInfo();

  // Mutations
  const verifyChain = useVerifyChain();
  const exportLogs = useExportAuditLogs();
  const cleanupLogs = useCleanupExpiredLogs();

  // Pagination
  const page = Math.floor((filters.offset || 0) / (filters.limit || 25)) + 1;
  const totalPages = logsData ? Math.ceil(logsData.total / (filters.limit || 25)) : 1;

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({
      ...prev,
      offset: (newPage - 1) * (prev.limit || 25),
    }));
  };

  const handleFilterChange = useCallback((key: keyof AuditLogQueryParams, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      offset: 0, // Reset pagination when filters change
    }));
  }, []);

  const handleExport = async (format: 'json' | 'csv') => {
    if (!dateRange.start || !dateRange.end) {
      toast.error('Please select a date range for export');
      return;
    }

    try {
      const result = await exportLogs.mutateAsync({
        startDate: dateRange.start,
        endDate: dateRange.end,
        format,
        includeDetails: true,
      });

      if (format === 'json' && result.logs) {
        // Download JSON file
        const blob = new Blob([JSON.stringify(result.logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-export-${result.exportId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }

      toast.success(`Exported ${result.count} audit log entries`);
      setShowExportDialog(false);
    } catch (error) {
      toast.error('Failed to export audit logs');
    }
  };

  const handleVerifyChain = async () => {
    try {
      const result = await verifyChain.mutateAsync(undefined);
      if (result.valid) {
        toast.success(`Chain verified: ${result.entriesChecked} entries checked, all valid`);
      } else {
        toast.error(`Chain verification failed: ${result.errors.length} errors found`);
      }
    } catch (error) {
      toast.error('Failed to verify chain');
    }
  };

  const handleCleanup = async () => {
    try {
      const result = await cleanupLogs.mutateAsync();
      toast.success(result.message);
    } catch (error) {
      toast.error('Failed to cleanup expired logs');
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return <XCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'info':
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActorIcon = (actorType: string) => {
    switch (actorType) {
      case 'user':
        return <User className="h-4 w-4" />;
      case 'system':
      case 'automation':
        return <Server className="h-4 w-4" />;
      case 'api':
        return <Activity className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-accent-500" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground mt-1">
            SOC 2 compliant audit trail with cryptographic verification
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleVerifyChain}
            disabled={verifyChain.isPending}
          >
            {verifyChain.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            Verify Chain
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowExportDialog(true)}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            variant="outline"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="logs">
            <FileText className="h-4 w-4 mr-2" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="statistics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Statistics
          </TabsTrigger>
          <TabsTrigger value="retention">
            <Database className="h-4 w-4 mr-2" />
            Retention
          </TabsTrigger>
        </TabsList>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          {/* Filters */}
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* Date Range */}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="datetime-local"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="bg-secondary border text-foreground w-48"
                    placeholder="Start Date"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="datetime-local"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="bg-secondary border text-foreground w-48"
                    placeholder="End Date"
                  />
                </div>

                {/* Category Filter */}
                <Select
                  value={filters.eventCategories?.[0] || 'all'}
                  onValueChange={(value) => handleFilterChange('eventCategories', value === 'all' ? undefined : [value])}
                >
                  <SelectTrigger className="bg-secondary border text-foreground w-40">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    <SelectItem value="all">All Categories</SelectItem>
                    {filterOptions?.eventCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] || cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Severity Filter */}
                <Select
                  value={filters.severities?.[0] || 'all'}
                  onValueChange={(value) => handleFilterChange('severities', value === 'all' ? undefined : [value])}
                >
                  <SelectTrigger className="bg-secondary border text-foreground w-36">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    <SelectItem value="all">All Severities</SelectItem>
                    {filterOptions?.severities.map((sev) => (
                      <SelectItem key={sev} value={sev}>
                        {sev.charAt(0).toUpperCase() + sev.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Outcome Filter */}
                <Select
                  value={filters.outcomes?.[0] || 'all'}
                  onValueChange={(value) => handleFilterChange('outcomes', value === 'all' ? undefined : [value])}
                >
                  <SelectTrigger className="bg-secondary border text-foreground w-36">
                    <SelectValue placeholder="Outcome" />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    <SelectItem value="all">All Outcomes</SelectItem>
                    {filterOptions?.outcomes.map((outcome) => (
                      <SelectItem key={outcome} value={outcome}>
                        {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Clear Filters */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilters({ limit: 25, offset: 0 });
                    setDateRange({ start: '', end: '' });
                  }}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table */}
          <Card className="bg-card border">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : logsData?.logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <FileText className="h-12 w-12 mb-4" />
                  <p>No audit logs found</p>
                  <p className="text-sm">Try adjusting your filters</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-40">Timestamp</TableHead>
                        <TableHead className="w-24">Severity</TableHead>
                        <TableHead className="w-28">Category</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead className="w-36">Actor</TableHead>
                        <TableHead className="w-36">Resource</TableHead>
                        <TableHead className="w-24">Outcome</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsData?.logs.map((log) => (
                        <TableRow
                          key={log.id}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedLog(log);
                            setShowDetailDialog(true);
                          }}
                        >
                          <TableCell className="text-muted-foreground text-xs">
                            {formatTimestamp(log.timestamp)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={SEVERITY_COLORS[log.severity]}
                            >
                              <span className="flex items-center gap-1">
                                {getSeverityIcon(log.severity)}
                                {log.severity}
                              </span>
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={CATEGORY_COLORS[log.eventCategory]}
                            >
                              {CATEGORY_LABELS[log.eventCategory]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-foreground font-medium text-sm">{log.action}</p>
                              <p className="text-muted-foreground text-xs">{log.eventType}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getActorIcon(log.actorType)}
                              <div>
                                <p className="text-foreground text-sm">{log.actorName || log.actorId || '-'}</p>
                                <p className="text-muted-foreground text-xs">
                                  {ACTOR_TYPE_LABELS[log.actorType]}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-foreground text-sm">{log.resourceName || log.resourceId || '-'}</p>
                              <p className="text-muted-foreground text-xs">{log.resourceType}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={OUTCOME_COLORS[log.outcome]}
                            >
                              {log.outcome}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {((page - 1) * (filters.limit || 25)) + 1} to{' '}
                      {Math.min(page * (filters.limit || 25), logsData?.total || 0)} of{' '}
                      {logsData?.total || 0} entries
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-foreground">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(page + 1)}
                        disabled={page >= totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics" className="space-y-4">
          {statsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : statistics ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-card border">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Entries (30d)</p>
                        <p className="text-3xl font-bold text-foreground mt-1">
                          {statistics.totalEntries.toLocaleString()}
                        </p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-accent-500/20 flex items-center justify-center">
                        <FileText className="h-6 w-6 text-accent-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Chain Integrity</p>
                        <p className={`text-3xl font-bold mt-1 ${statistics.chainIntegrity ? 'text-emerald-500' : 'text-red-500'}`}>
                          {statistics.chainIntegrity ? 'Valid' : 'Invalid'}
                        </p>
                      </div>
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${statistics.chainIntegrity ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                        <ShieldCheck className={`h-6 w-6 ${statistics.chainIntegrity ? 'text-emerald-500' : 'text-red-500'}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Success Rate</p>
                        <p className="text-3xl font-bold text-emerald-500 mt-1">
                          {statistics.byOutcome?.success
                            ? Math.round((statistics.byOutcome.success / statistics.totalEntries) * 100)
                            : 0}%
                        </p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Failures</p>
                        <p className="text-3xl font-bold text-red-500 mt-1">
                          {statistics.byOutcome?.failure || 0}
                        </p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center">
                        <XCircle className="h-6 w-6 text-red-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Breakdown Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* By Category */}
                <Card className="bg-card border">
                  <CardHeader>
                    <CardTitle className="text-foreground text-lg">By Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(statistics.byCategory || {})
                        .sort((a, b) => b[1] - a[1])
                        .map(([category, count]) => (
                          <div key={category} className="flex items-center justify-between">
                            <Badge
                              variant="outline"
                              className={CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] || ''}
                            >
                              {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category}
                            </Badge>
                            <span className="text-foreground font-medium">{count.toLocaleString()}</span>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>

                {/* By Severity */}
                <Card className="bg-card border">
                  <CardHeader>
                    <CardTitle className="text-foreground text-lg">By Severity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(statistics.bySeverity || {})
                        .sort((a, b) => {
                          const order = ['critical', 'error', 'warning', 'info', 'debug'];
                          return order.indexOf(a[0]) - order.indexOf(b[0]);
                        })
                        .map(([severity, count]) => (
                          <div key={severity} className="flex items-center justify-between">
                            <Badge
                              variant="outline"
                              className={SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] || ''}
                            >
                              {severity.charAt(0).toUpperCase() + severity.slice(1)}
                            </Badge>
                            <span className="text-foreground font-medium">{count.toLocaleString()}</span>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>

                {/* By Outcome */}
                <Card className="bg-card border">
                  <CardHeader>
                    <CardTitle className="text-foreground text-lg">By Outcome</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(statistics.byOutcome || {})
                        .sort((a, b) => b[1] - a[1])
                        .map(([outcome, count]) => (
                          <div key={outcome} className="flex items-center justify-between">
                            <Badge
                              variant="outline"
                              className={OUTCOME_COLORS[outcome as keyof typeof OUTCOME_COLORS] || ''}
                            >
                              {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
                            </Badge>
                            <span className="text-foreground font-medium">{count.toLocaleString()}</span>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Time Range */}
              <Card className="bg-card border">
                <CardHeader>
                  <CardTitle className="text-foreground text-lg">Data Range</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-sm text-muted-foreground">Oldest Entry</p>
                      <p className="text-foreground">
                        {statistics.oldestEntry ? formatTimestamp(statistics.oldestEntry) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Newest Entry</p>
                      <p className="text-foreground">
                        {statistics.newestEntry ? formatTimestamp(statistics.newestEntry) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mb-4" />
              <p>No statistics available</p>
            </div>
          )}
        </TabsContent>

        {/* Retention Tab */}
        <TabsContent value="retention" className="space-y-4">
          {retentionInfo ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-card border">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Retention Period</p>
                        <p className="text-3xl font-bold text-foreground mt-1">
                          {retentionInfo.retentionYears} years
                        </p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-accent-500/20 flex items-center justify-center">
                        <Clock className="h-6 w-6 text-accent-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Entries</p>
                        <p className="text-3xl font-bold text-foreground mt-1">
                          {retentionInfo.totalEntries.toLocaleString()}
                        </p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-accent-500/20 flex items-center justify-center">
                        <Database className="h-6 w-6 text-accent-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Expiring Within Year</p>
                        <p className="text-3xl font-bold text-amber-500 mt-1">
                          {retentionInfo.expiringWithinYear.toLocaleString()}
                        </p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <AlertTriangle className="h-6 w-6 text-amber-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border">
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">Cleanup Expired</p>
                      <Button
                        variant="outline"
                        className="border-red-500 text-red-500 hover:bg-red-500/10"
                        onClick={handleCleanup}
                        disabled={cleanupLogs.isPending}
                      >
                        {cleanupLogs.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Run Cleanup
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-card border">
                <CardHeader>
                  <CardTitle className="text-foreground text-lg">Retention Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Oldest Entry</p>
                      <p className="text-foreground">
                        {retentionInfo.oldestEntry ? formatTimestamp(retentionInfo.oldestEntry) : 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Retention until: {retentionInfo.oldestRetentionDate ? formatTimestamp(retentionInfo.oldestRetentionDate) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Newest Entry</p>
                      <p className="text-foreground">
                        {retentionInfo.newestEntry ? formatTimestamp(retentionInfo.newestEntry) : 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Retention until: {retentionInfo.newestRetentionDate ? formatTimestamp(retentionInfo.newestRetentionDate) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-card border max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Audit Log Details</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Sequence #{selectedLog?.sequenceNumber}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              {/* Header Info */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={SEVERITY_COLORS[selectedLog.severity]}>
                  {selectedLog.severity}
                </Badge>
                <Badge variant="outline" className={CATEGORY_COLORS[selectedLog.eventCategory]}>
                  {CATEGORY_LABELS[selectedLog.eventCategory]}
                </Badge>
                <Badge variant="outline" className={OUTCOME_COLORS[selectedLog.outcome]}>
                  {selectedLog.outcome}
                </Badge>
                {selectedLog.verified ? (
                  <Badge variant="outline" className="text-emerald-400 bg-emerald-500/10 border-emerald-500/40">
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-red-400 bg-red-500/10 border-red-500/40">
                    Unverified
                  </Badge>
                )}
              </div>

              {/* Main Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Timestamp</p>
                  <p className="text-foreground">{formatTimestamp(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Event Type</p>
                  <p className="text-foreground">{selectedLog.eventType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Action</p>
                  <p className="text-foreground">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Retention Until</p>
                  <p className="text-foreground">{formatTimestamp(selectedLog.retentionDate)}</p>
                </div>
              </div>

              {/* Actor Info */}
              <div className="p-4 rounded-lg bg-secondary/50">
                <p className="text-sm font-medium text-foreground mb-2">Actor</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Type</p>
                    <p className="text-foreground">{ACTOR_TYPE_LABELS[selectedLog.actorType]}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ID</p>
                    <p className="text-foreground">{selectedLog.actorId || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Name</p>
                    <p className="text-foreground">{selectedLog.actorName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">IP</p>
                    <p className="text-foreground">{selectedLog.actorIp || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Resource Info */}
              <div className="p-4 rounded-lg bg-secondary/50">
                <p className="text-sm font-medium text-foreground mb-2">Resource</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Type</p>
                    <p className="text-foreground">{selectedLog.resourceType}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ID</p>
                    <p className="text-foreground">{selectedLog.resourceId || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Name</p>
                    <p className="text-foreground">{selectedLog.resourceName || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Details */}
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div className="p-4 rounded-lg bg-secondary/50">
                  <p className="text-sm font-medium text-foreground mb-2">Details</p>
                  <pre className="text-xs text-muted-foreground overflow-auto max-h-40 bg-zinc-900 p-2 rounded">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}

              {/* Changes */}
              {selectedLog.changes && (
                <div className="p-4 rounded-lg bg-secondary/50">
                  <p className="text-sm font-medium text-foreground mb-2">Changes</p>
                  {selectedLog.changes.diff && selectedLog.changes.diff.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-muted-foreground mb-1">Diff:</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedLog.changes.diff.map((d, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className={
                              d.startsWith('+') ? 'text-emerald-400 border-emerald-500/40' :
                              d.startsWith('-') ? 'text-red-400 border-red-500/40' :
                              'text-amber-400 border-amber-500/40'
                            }
                          >
                            {d}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    {selectedLog.changes.before && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Before:</p>
                        <pre className="text-xs text-muted-foreground overflow-auto max-h-32 bg-zinc-900 p-2 rounded">
                          {JSON.stringify(selectedLog.changes.before, null, 2)}
                        </pre>
                      </div>
                    )}
                    {selectedLog.changes.after && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">After:</p>
                        <pre className="text-xs text-muted-foreground overflow-auto max-h-32 bg-zinc-900 p-2 rounded">
                          {JSON.stringify(selectedLog.changes.after, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Hash Info */}
              <div className="p-4 rounded-lg bg-secondary/50">
                <p className="text-sm font-medium text-foreground mb-2">Cryptographic Chain</p>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Previous Hash</p>
                    <p className="text-foreground font-mono text-xs break-all">{selectedLog.previousHash}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Current Hash</p>
                    <p className="text-foreground font-mono text-xs break-all">{selectedLog.currentHash}</p>
                  </div>
                  {selectedLog.signature && (
                    <div>
                      <p className="text-muted-foreground">Signature</p>
                      <p className="text-foreground font-mono text-xs break-all">{selectedLog.signature}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="bg-card border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Export Audit Logs</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Export audit logs for compliance review
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Date Range</p>
              <div className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-secondary border text-foreground"
                  placeholder="Start Date"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="datetime-local"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-secondary border text-foreground"
                  placeholder="End Date"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
                onClick={() => handleExport('json')}
                disabled={exportLogs.isPending}
              >
                {exportLogs.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export JSON
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleExport('csv')}
                disabled={exportLogs.isPending}
              >
                {exportLogs.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export CSV
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
