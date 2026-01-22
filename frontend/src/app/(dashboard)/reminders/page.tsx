'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Search,
  Plus,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Bell,
  Clock,
  Check,
  Pause,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { ReminderCard } from '@/components/reminders/ReminderCard';
import { ReminderForm } from '@/components/reminders/ReminderForm';
import {
  useReminders,
  useReminderStats,
  useCreateReminder,
  useUpdateReminder,
  useDeleteReminder,
  useSnoozeReminder,
  useAcknowledgeReminder,
  useCancelReminder,
} from '@/hooks/use-reminders';
import { toast } from 'sonner';
import type { Reminder, ReminderStatus, ReminderPriority } from '@/types';

const STATUS_FILTERS: { value: ReminderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'snoozed', label: 'Snoozed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_FILTERS: { value: ReminderPriority | 'all'; label: string }[] = [
  { value: 'all', label: 'All Priority' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

export default function RemindersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<ReminderPriority | 'all'>('all');
  const [page, setPage] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [activeTab, setActiveTab] = useState('active');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine status filter based on tab
  const getStatusFromTab = (): ReminderStatus[] | undefined => {
    switch (activeTab) {
      case 'active':
        return ['pending', 'sent', 'snoozed'];
      case 'acknowledged':
        return ['acknowledged'];
      case 'cancelled':
        return ['cancelled'];
      default:
        return undefined;
    }
  };

  const { data, isLoading, error, refetch } = useReminders({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : getStatusFromTab(),
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    sortBy: 'reminderTime',
    sortOrder: 'ASC',
  });

  const { data: statsData } = useReminderStats();

  const createReminder = useCreateReminder();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();
  const snoozeReminder = useSnoozeReminder();
  const acknowledgeReminder = useAcknowledgeReminder();
  const cancelReminder = useCancelReminder();

  const reminders = data?.data || [];
  const pagination = data?.pagination;
  const stats = statsData;

  const handleCreateReminder = async (reminderData: Partial<Reminder>) => {
    try {
      await createReminder.mutateAsync(reminderData);
      toast.success('Reminder created successfully');
      setIsCreateOpen(false);
    } catch {
      toast.error('Failed to create reminder');
    }
  };

  const handleUpdateReminder = async (reminderData: Partial<Reminder>) => {
    if (!editingReminder) return;
    try {
      await updateReminder.mutateAsync({ id: editingReminder.id, data: reminderData });
      toast.success('Reminder updated successfully');
      setEditingReminder(null);
    } catch {
      toast.error('Failed to update reminder');
    }
  };

  const handleDeleteReminder = async (id: string) => {
    if (!confirm('Are you sure you want to delete this reminder?')) return;
    try {
      await deleteReminder.mutateAsync(id);
      toast.success('Reminder deleted successfully');
    } catch {
      toast.error('Failed to delete reminder');
    }
  };

  const handleAcknowledgeReminder = async (id: string) => {
    try {
      await acknowledgeReminder.mutateAsync(id);
      toast.success('Reminder acknowledged');
    } catch {
      toast.error('Failed to acknowledge reminder');
    }
  };

  const handleSnoozeReminder = async (id: string, minutes: number) => {
    try {
      await snoozeReminder.mutateAsync({ id, minutes });
      toast.success(`Reminder snoozed for ${minutes} minutes`);
    } catch {
      toast.error('Failed to snooze reminder');
    }
  };

  const handleCancelReminder = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this reminder?')) return;
    try {
      await cancelReminder.mutateAsync(id);
      toast.success('Reminder cancelled');
    } catch {
      toast.error('Failed to cancel reminder');
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reminders</h1>
          <p className="text-muted-foreground mt-1">Manage your reminders and alerts</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load reminders</p>
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
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Reminders</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {isLoading ? 'Loading...' : `${pagination?.total || 0} reminders`}
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
            size="sm"
            className="bg-accent-600 hover:bg-accent-700 text-white"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">New Reminder</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Bell className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.overdue}</p>
                  <p className="text-xs text-muted-foreground">Overdue</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Pause className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.snoozed}</p>
                  <p className="text-xs text-muted-foreground">Snoozed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Check className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.acknowledged}</p>
                  <p className="text-xs text-muted-foreground">Done</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search reminders..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 bg-card border text-foreground"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as ReminderStatus | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px] bg-card border text-foreground">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-secondary border">
            {STATUS_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-foreground">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={priorityFilter}
          onValueChange={(v) => {
            setPriorityFilter(v as ReminderPriority | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px] bg-card border text-foreground">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent className="bg-secondary border">
            {PRIORITY_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-foreground">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary border">
          <TabsTrigger value="active" className="data-[state=active]:bg-card">
            Active
            {stats && (
              <Badge className="ml-2 bg-yellow-500/20 text-yellow-400">
                {stats.pending + stats.sent + stats.snoozed}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="acknowledged" className="data-[state=active]:bg-card">
            Done
            {stats && (
              <Badge className="ml-2 bg-green-500/20 text-green-400">{stats.acknowledged}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="data-[state=active]:bg-card">
            Cancelled
            {stats && (
              <Badge className="ml-2 bg-zinc-500/20 text-zinc-400">{stats.cancelled}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {/* Reminder List */}
          <Card className="bg-card border">
            {isLoading ? (
              <CardContent className="p-6">
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="h-12 w-12 rounded-lg" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-1/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : reminders.length > 0 ? (
              <>
                <CardContent className="p-4 space-y-3">
                  {reminders.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      onAcknowledge={handleAcknowledgeReminder}
                      onSnooze={handleSnoozeReminder}
                      onCancel={handleCancelReminder}
                      onEdit={setEditingReminder}
                      onDelete={handleDeleteReminder}
                    />
                  ))}
                </CardContent>

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
                <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No reminders found</h3>
                <p className="text-muted-foreground text-center max-w-sm mb-4">
                  {search || statusFilter !== 'all' || priorityFilter !== 'all'
                    ? 'Try adjusting your search or filters'
                    : 'Create your first reminder to get started'}
                </p>
                {!search && statusFilter === 'all' && priorityFilter === 'all' && (
                  <Button
                    className="bg-accent-600 hover:bg-accent-700 text-white"
                    onClick={() => setIsCreateOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create Reminder
                  </Button>
                )}
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Reminder Dialog */}
      {mounted && (
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="bg-card border max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create New Reminder</DialogTitle>
            </DialogHeader>
            <ReminderForm
              onSubmit={handleCreateReminder}
              onCancel={() => setIsCreateOpen(false)}
              isSubmitting={createReminder.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Reminder Dialog */}
      {mounted && (
        <Dialog open={!!editingReminder} onOpenChange={(open) => !open && setEditingReminder(null)}>
          <DialogContent className="bg-card border max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Edit Reminder</DialogTitle>
            </DialogHeader>
            {editingReminder && (
              <ReminderForm
                reminder={editingReminder}
                onSubmit={handleUpdateReminder}
                onCancel={() => setEditingReminder(null)}
                isSubmitting={updateReminder.isPending}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
