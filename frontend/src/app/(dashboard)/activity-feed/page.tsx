'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ActivityFeed } from '@/components/activity-feed';
import {
  useActivityStatistics,
  RESOURCE_TYPE_COLORS,
  RESOURCE_TYPE_LABELS,
  IMPORTANCE_COLORS,
  ActivityResourceType,
  ActivityImportance,
} from '@/hooks/use-activity-feed';
import {
  Activity,
  Building2,
  Users,
  CheckSquare,
  Shield,
  TrendingUp,
  Clock,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';

// Quick filter presets
const QUICK_FILTERS = [
  { label: 'All', filter: {} },
  { label: 'Deals', filter: { resourceTypes: ['deal' as ActivityResourceType] } },
  { label: 'Buyers', filter: { resourceTypes: ['buyer' as ActivityResourceType] } },
  { label: 'Tasks', filter: { resourceTypes: ['task' as ActivityResourceType] } },
  { label: 'Compliance', filter: { resourceTypes: ['compliance' as ActivityResourceType] } },
  { label: 'High Priority', filter: { importance: ['high' as ActivityImportance, 'critical' as ActivityImportance] } },
];

export default function ActivityFeedPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedQuickFilter, setSelectedQuickFilter] = useState(0);

  // Would come from auth context in real app
  const organizationId = undefined;

  const { data: statistics, isLoading: statsLoading } = useActivityStatistics(organizationId, 7);

  // Get current filter based on quick filter selection
  const currentFilter = QUICK_FILTERS[selectedQuickFilter]?.filter || {};

  // Calculate stats
  const totalDeals = statistics?.byResourceType?.deal || 0;
  const totalBuyers = statistics?.byResourceType?.buyer || 0;
  const totalTasks = statistics?.byResourceType?.task || 0;
  const totalCompliance = statistics?.byResourceType?.compliance || 0;
  const criticalCount = statistics?.byImportance?.critical || 0;
  const highCount = statistics?.byImportance?.high || 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 sm:h-8 sm:w-8" />
            Activity Feed
          </h1>
          <p className="text-muted-foreground mt-1">
            Central feed showing all activity across your platform
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Building2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalDeals}</p>
                <p className="text-xs text-muted-foreground">Deal Activities</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Users className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalBuyers}</p>
                <p className="text-xs text-muted-foreground">Buyer Activities</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <CheckSquare className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalTasks}</p>
                <p className="text-xs text-muted-foreground">Task Activities</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{criticalCount + highCount}</p>
                <p className="text-xs text-muted-foreground">High Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((filter, index) => (
          <Badge
            key={filter.label}
            variant={selectedQuickFilter === index ? 'default' : 'outline'}
            className="cursor-pointer px-3 py-1.5"
            onClick={() => setSelectedQuickFilter(index)}
          >
            {filter.label}
          </Badge>
        ))}
      </div>

      {/* Main content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Activity feed - takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <ActivityFeed
            organizationId={organizationId}
            showHeader={false}
            showFilters={true}
            maxHeight="calc(100vh - 400px)"
            initialFilters={currentFilter}
            limit={12}
          />
        </div>

        {/* Sidebar with statistics */}
        <div className="space-y-6">
          {/* Activity breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Activity by Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {statistics?.byResourceType && Object.keys(statistics.byResourceType).length > 0 ? (
                Object.entries(statistics.byResourceType)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 6)
                  .map(([type, count]) => {
                    const total = statistics.totalActivities || 1;
                    const percentage = Math.round((count / total) * 100);
                    const color = RESOURCE_TYPE_COLORS[type as ActivityResourceType] || 'text-zinc-400';

                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className={cn('capitalize', color.split(' ')[0])}>
                            {RESOURCE_TYPE_LABELS[type as ActivityResourceType] || type}
                          </span>
                          <span className="text-muted-foreground">{count}</span>
                        </div>
                        <Progress value={percentage} className="h-1.5" />
                      </div>
                    );
                  })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No activity data yet
                </p>
              )}
            </CardContent>
          </Card>

          {/* Priority distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Priority Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {statistics?.byImportance && Object.keys(statistics.byImportance).length > 0 ? (
                ['critical', 'high', 'normal', 'low'].map((level) => {
                  const count = statistics.byImportance[level] || 0;
                  const total = statistics.totalActivities || 1;
                  const percentage = Math.round((count / total) * 100);
                  const color = IMPORTANCE_COLORS[level as ActivityImportance];

                  return (
                    <div key={level} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className={cn('capitalize', color?.split(' ')[0])}>
                          {level}
                        </span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <Progress value={percentage} className="h-1.5" />
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No priority data yet
                </p>
              )}
            </CardContent>
          </Card>

          {/* Daily activity chart (simplified) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">7-Day Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {statistics?.dailyCount && statistics.dailyCount.length > 0 ? (
                <div className="flex items-end justify-between h-20 gap-1">
                  {statistics.dailyCount.map((day, i) => {
                    const maxCount = Math.max(...statistics.dailyCount.map((d) => d.count), 1);
                    const height = Math.max((day.count / maxCount) * 100, 5);

                    return (
                      <div
                        key={day.date}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <div
                          className="w-full bg-accent-500/60 rounded-t"
                          style={{ height: `${height}%` }}
                          title={`${day.date}: ${day.count} activities`}
                        />
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                  No activity data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
