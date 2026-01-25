/**
 * SpriteTaskQueuePanel
 *
 * Main container for the task queue with stats, filters, and task list.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Plus,
  RefreshCw,
  List,
  GitPullRequest,
  Activity,
  Keyboard,
  Layers,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  useSpriteTasksByProject,
  useSpriteTaskStats,
} from '@/hooks/use-sprite-tasks';
import { useSpriteByProject } from '@/hooks/use-sprites';
import { useProjectSyncEvents } from '@/hooks/use-github-sync-websocket';
import { SpriteTaskCard } from './SpriteTaskCard';
import { SpriteTaskProgress } from './SpriteTaskProgress';
import { CreateSpriteTaskDialog } from './CreateSpriteTaskDialog';
import { SpriteActivityTimeline } from './SpriteActivityTimeline';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { BatchTaskDialog } from './BatchTaskDialog';
import { useKeyboardShortcuts, type KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import type { SpriteTaskStatus } from '@/types/spriteTask';

interface SpriteTaskQueuePanelProps {
  projectId: string;
  className?: string;
}

// Tab filter configuration
type TabFilter = 'all' | 'active' | 'completed' | 'failed' | 'activity';

const TAB_FILTERS: Record<TabFilter, SpriteTaskStatus[] | undefined> = {
  all: undefined,
  active: ['pending', 'assigned', 'in_progress'],
  completed: ['pr_created', 'completed'],
  failed: ['failed', 'cancelled'],
  activity: undefined, // Activity tab shows all tasks
};

export function SpriteTaskQueuePanel({
  projectId,
  className,
}: SpriteTaskQueuePanelProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(false);

  // Get the sprite for this project (if any)
  const { data: sprite } = useSpriteByProject(projectId);
  const spriteId = sprite?.id;

  // Subscribe to real-time GitHub sync events
  const { isConnected: syncConnected } = useProjectSyncEvents(projectId);

  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useSpriteTaskStats(projectId);

  const statusFilter = TAB_FILTERS[activeTab];
  const {
    data: tasks,
    isLoading: tasksLoading,
    refetch: refetchTasks,
  } = useSpriteTasksByProject(projectId, {
    status: statusFilter,
    limit: 50,
  });

  const isLoading = statsLoading || tasksLoading;

  // Find active task for progress display
  const activeTask = tasks?.find(
    (t) => t.status === 'in_progress' || t.status === 'assigned'
  );

  const handleRefresh = useCallback(() => {
    refetchStats();
    refetchTasks();
  }, [refetchStats, refetchTasks]);

  // Keyboard shortcuts
  const shortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      {
        key: 'n',
        description: 'Create new task',
        action: () => setIsCreateOpen(true),
      },
      {
        key: 'r',
        description: 'Refresh task list',
        action: handleRefresh,
      },
      {
        key: 'a',
        description: 'Toggle activity view',
        action: () => setActiveTab(activeTab === 'activity' ? 'all' : 'activity'),
      },
      {
        key: '1',
        description: 'Show all tasks',
        action: () => setActiveTab('all'),
      },
      {
        key: '2',
        description: 'Show active tasks',
        action: () => setActiveTab('active'),
      },
      {
        key: '3',
        description: 'Show completed tasks',
        action: () => setActiveTab('completed'),
      },
      {
        key: '4',
        description: 'Show failed tasks',
        action: () => setActiveTab('failed'),
      },
      {
        key: 'b',
        description: 'Batch create tasks',
        action: () => setIsBatchOpen(true),
      },
      {
        key: '?',
        shift: true,
        description: 'Show keyboard shortcuts',
        action: () => setIsShortcutsOpen(true),
      },
      {
        key: 'Escape',
        description: 'Close dialogs',
        action: () => {
          setIsCreateOpen(false);
          setIsShortcutsOpen(false);
          setIsBatchOpen(false);
        },
      },
    ],
    [activeTab, handleRefresh]
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <StatCard
          label="Pending"
          value={stats?.pending ?? 0}
          icon={<Clock className="h-4 w-4" />}
          color="text-gray-500"
          loading={statsLoading}
        />
        <StatCard
          label="In Progress"
          value={stats?.inProgress ?? 0}
          icon={<Loader2 className="h-4 w-4 animate-spin" />}
          color="text-yellow-500"
          loading={statsLoading}
        />
        <StatCard
          label="Completed"
          value={(stats?.completed ?? 0) + (stats?.prCreated ?? 0)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="text-green-500"
          loading={statsLoading}
        />
        <StatCard
          label="Failed"
          value={stats?.failed ?? 0}
          icon={<AlertCircle className="h-4 w-4" />}
          color="text-red-500"
          loading={statsLoading}
        />
      </div>

      {/* Active Task Progress */}
      {activeTask && (
        <div className="mb-4">
          <SpriteTaskProgress
            taskId={activeTask.id}
            onComplete={handleRefresh}
          />
        </div>
      )}

      {/* Main Panel */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <List className="h-5 w-5" />
              Task Queue
              {stats?.total !== undefined && (
                <Badge variant="secondary" className="ml-1">
                  {stats.total}
                </Badge>
              )}
              {/* Real-time sync indicator */}
              <div
                className={cn(
                  'flex items-center gap-1 text-xs',
                  syncConnected ? 'text-green-500' : 'text-muted-foreground'
                )}
                title={syncConnected ? 'Real-time sync active' : 'Real-time sync disconnected'}
              >
                <Radio className={cn('h-3 w-3', syncConnected && 'animate-pulse')} />
                <span className="hidden sm:inline">{syncConnected ? 'Live' : 'Offline'}</span>
              </div>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsShortcutsOpen(true)}
                title="Keyboard shortcuts (Shift+?)"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefresh}
                disabled={isLoading}
                title="Refresh (R)"
              >
                <RefreshCw
                  className={cn(
                    'h-4 w-4',
                    isLoading && 'animate-spin'
                  )}
                />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsBatchOpen(true)}
                title="Batch create (B)"
              >
                <Layers className="h-4 w-4 mr-1" />
                Batch
              </Button>
              <Button size="sm" onClick={() => setIsCreateOpen(true)} title="Add task (N)">
                <Plus className="h-4 w-4 mr-1" />
                Add Task
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-4 pt-2 flex flex-col min-h-0">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabFilter)}
            className="flex flex-col flex-1"
          >
            <TabsList className="w-full justify-start mb-3">
              <TabsTrigger value="all" className="flex-1">
                All
              </TabsTrigger>
              <TabsTrigger value="active" className="flex-1">
                Active
                {(stats?.pending ?? 0) + (stats?.inProgress ?? 0) > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {(stats?.pending ?? 0) + (stats?.inProgress ?? 0)}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex-1">
                Completed
              </TabsTrigger>
              <TabsTrigger value="failed" className="flex-1">
                Failed
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex-1">
                <Activity className="h-3.5 w-3.5 mr-1" />
                Activity
              </TabsTrigger>
            </TabsList>

            {/* Activity Tab */}
            <TabsContent value="activity" className="flex-1 mt-0">
              {tasksLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <SpriteActivityTimeline tasks={tasks || []} />
              )}
            </TabsContent>

            {/* Task List Tabs */}
            {activeTab !== 'activity' && (
              <TabsContent value={activeTab} className="flex-1 mt-0">
                <ScrollArea className="h-[400px]">
                  {tasksLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : tasks && tasks.length > 0 ? (
                    <div className="space-y-3 pr-4">
                      {tasks.map((task) => (
                        <SpriteTaskCard
                          key={task.id}
                          task={task}
                          spriteId={spriteId}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState filter={activeTab} />
                  )}
                </ScrollArea>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Create Task Dialog */}
      <CreateSpriteTaskDialog
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        open={isShortcutsOpen}
        onOpenChange={setIsShortcutsOpen}
      />

      {/* Batch Task Dialog */}
      <BatchTaskDialog
        projectId={projectId}
        open={isBatchOpen}
        onOpenChange={setIsBatchOpen}
      />
    </div>
  );
}

// Stat card component
interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
}

function StatCard({ label, value, icon, color, loading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <span className={color}>{icon}</span>
          <div>
            {loading ? (
              <div className="h-6 w-8 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-xl font-bold">{value}</p>
            )}
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Empty state component
function EmptyState({ filter }: { filter: TabFilter }) {
  const messages: Record<TabFilter, { icon: React.ReactNode; text: string }> = {
    all: {
      icon: <List className="h-10 w-10" />,
      text: 'No tasks in the queue. Add a task to get started!',
    },
    active: {
      icon: <Clock className="h-10 w-10" />,
      text: 'No active tasks. Tasks will appear here when they are processing.',
    },
    completed: {
      icon: <CheckCircle2 className="h-10 w-10" />,
      text: 'No completed tasks yet.',
    },
    failed: {
      icon: <AlertCircle className="h-10 w-10" />,
      text: 'No failed tasks. Great job!',
    },
    activity: {
      icon: <Activity className="h-10 w-10" />,
      text: 'No activity to display yet.',
    },
  };

  const { icon, text } = messages[filter];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      {icon}
      <p className="mt-3 text-sm text-center max-w-xs">{text}</p>
    </div>
  );
}
