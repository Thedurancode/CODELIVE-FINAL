'use client';

import { useState, useEffect } from 'react';
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
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  ListTodo,
  Filter,
} from 'lucide-react';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskForm } from '@/components/tasks/TaskForm';
import {
  useTasks,
  useTaskStats,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCompleteTask,
  useCancelTask,
  useUpdateTaskStatus,
} from '@/hooks/use-tasks';
import { toast } from 'sonner';
import type { Task, TaskStatus, TaskPriority } from '@/types';

const STATUS_FILTERS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_FILTERS: { value: TaskPriority | 'all'; label: string }[] = [
  { value: 'all', label: 'All Priority' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

export default function TasksPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [page, setPage] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState('active');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine status filter based on tab
  const getStatusFromTab = (): TaskStatus[] | undefined => {
    switch (activeTab) {
      case 'active':
        return ['pending', 'in_progress', 'blocked'];
      case 'completed':
        return ['completed'];
      case 'cancelled':
        return ['cancelled'];
      default:
        return undefined;
    }
  };

  const { data, isLoading, error, refetch } = useTasks({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : getStatusFromTab(),
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    sortBy: 'dueDate',
    sortOrder: 'ASC',
  });

  const { data: statsData } = useTaskStats();

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const completeTask = useCompleteTask();
  const cancelTask = useCancelTask();
  const updateTaskStatus = useUpdateTaskStatus();

  const tasks = data?.data || [];
  const pagination = data?.pagination;
  const stats = statsData;

  const handleCreateTask = async (taskData: Partial<Task>) => {
    try {
      await createTask.mutateAsync(taskData);
      toast.success('Task created successfully');
      setIsCreateOpen(false);
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleUpdateTask = async (taskData: Partial<Task>) => {
    if (!editingTask) return;
    try {
      await updateTask.mutateAsync({ id: editingTask.id, data: taskData });
      toast.success('Task updated successfully');
      setEditingTask(null);
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await deleteTask.mutateAsync(id);
      toast.success('Task deleted successfully');
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const handleCompleteTask = async (id: string) => {
    try {
      await completeTask.mutateAsync(id);
      toast.success('Task completed');
    } catch {
      toast.error('Failed to complete task');
    }
  };

  const handleCancelTask = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this task?')) return;
    try {
      await cancelTask.mutateAsync(id);
      toast.success('Task cancelled');
    } catch {
      toast.error('Failed to cancel task');
    }
  };

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    try {
      await updateTaskStatus.mutateAsync({ id, status });
      toast.success(`Task status updated to ${status.replace('_', ' ')}`);
    } catch {
      toast.error('Failed to update task status');
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
          <p className="text-muted-foreground mt-1">Manage your tasks and assignments</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load tasks</p>
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
    <div className="space-y-8 max-w-[1800px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">Tasks</h1>
          <p className="text-base sm:text-lg text-muted-foreground mt-2">
            {isLoading ? 'Loading...' : `${pagination?.total || 0} tasks`}
          </p>
        </div>
        <div className="flex gap-3 sm:gap-4">
          <Button
            variant="outline"
            size="default"
            className="border text-foreground h-11 px-5"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-5 w-5 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            size="default"
            className="bg-accent-600 hover:bg-accent-700 text-white h-11 px-5"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-5 w-5 sm:mr-2" />
            <span className="hidden sm:inline">New Task</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-4 sm:gap-6">
          <Card className="bg-card border">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/20 rounded-xl">
                  <ListTodo className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total Tasks</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-500/20 rounded-xl">
                  <Clock className="h-6 w-6 text-orange-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">{stats.pending}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/20 rounded-xl">
                  <Calendar className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">{stats.inProgress}</p>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/20 rounded-xl">
                  <AlertTriangle className="h-6 w-6 text-red-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">{stats.overdue}</p>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500/20 rounded-xl">
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">{stats.completed}</p>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[250px] max-w-lg">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-12 h-12 text-base bg-card border text-foreground"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as TaskStatus | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px] h-12 bg-card border text-foreground">
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
            setPriorityFilter(v as TaskPriority | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px] h-12 bg-card border text-foreground">
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
        <TabsList className="bg-secondary border h-14 p-1.5">
          <TabsTrigger value="active" className="data-[state=active]:bg-card h-11 px-6 text-base">
            Active
            {stats && (
              <Badge className="ml-2 bg-blue-500/20 text-blue-400 text-sm px-2.5 py-0.5">
                {stats.pending + stats.inProgress + stats.blocked}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="data-[state=active]:bg-card h-11 px-6 text-base">
            Completed
            {stats && (
              <Badge className="ml-2 bg-green-500/20 text-green-400 text-sm px-2.5 py-0.5">{stats.completed}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="data-[state=active]:bg-card h-11 px-6 text-base">
            Cancelled
            {stats && (
              <Badge className="ml-2 bg-zinc-500/20 text-zinc-400 text-sm px-2.5 py-0.5">{stats.cancelled}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {/* Task List */}
          <Card className="bg-card border">
            {isLoading ? (
              <CardContent className="p-6 sm:p-8">
                <div className="space-y-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="h-14 w-14 rounded-xl" />
                      <div className="space-y-3 flex-1">
                        <Skeleton className="h-5 w-1/4" />
                        <Skeleton className="h-5 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : tasks.length > 0 ? (
              <>
                <CardContent className="p-5 sm:p-6 space-y-4">
                  {tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onComplete={handleCompleteTask}
                      onCancel={handleCancelTask}
                      onStatusChange={handleStatusChange}
                      onEdit={setEditingTask}
                      onDelete={handleDeleteTask}
                    />
                  ))}
                </CardContent>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-t border">
                    <p className="text-base text-muted-foreground">
                      Showing {(page - 1) * pagination.limit + 1} to{' '}
                      {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
                    </p>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        size="default"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                        className="border h-11 w-11"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="default"
                        onClick={() => setPage(page + 1)}
                        disabled={page >= pagination.totalPages}
                        className="border h-11 w-11"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ListTodo className="h-16 w-16 text-muted-foreground mb-5" />
                <h3 className="text-xl font-medium text-foreground mb-3">No tasks found</h3>
                <p className="text-base text-muted-foreground text-center max-w-md mb-5">
                  {search || statusFilter !== 'all' || priorityFilter !== 'all'
                    ? 'Try adjusting your search or filters'
                    : 'Create your first task to get started'}
                </p>
                {!search && statusFilter === 'all' && priorityFilter === 'all' && (
                  <Button
                    size="lg"
                    className="bg-accent-600 hover:bg-accent-700 text-white h-12 px-6"
                    onClick={() => setIsCreateOpen(true)}
                  >
                    <Plus className="mr-2 h-5 w-5" />
                    Create Task
                  </Button>
                )}
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Task Dialog */}
      {mounted && (
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="bg-card border max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl text-foreground">Create New Task</DialogTitle>
            </DialogHeader>
            <TaskForm
              onSubmit={handleCreateTask}
              onCancel={() => setIsCreateOpen(false)}
              isSubmitting={createTask.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Task Dialog */}
      {mounted && (
        <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
          <DialogContent className="bg-card border max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl text-foreground">Edit Task</DialogTitle>
            </DialogHeader>
            {editingTask && (
              <TaskForm
                task={editingTask}
                onSubmit={handleUpdateTask}
                onCancel={() => setEditingTask(null)}
                isSubmitting={updateTask.isPending}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
