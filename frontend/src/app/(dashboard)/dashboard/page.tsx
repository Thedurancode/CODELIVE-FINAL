'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/stat-card';
import {
  Building2,
  Target,
  Send,
  TrendingUp,
  ArrowRight,
  Upload,
  BarChart3,
  MessageSquare,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import { useDealAnalytics } from '@/hooks/use-analytics';
import { useProperties } from '@/hooks/use-properties';
import { useBuyBoxes } from '@/hooks/use-buyboxes';
import type { Property } from '@/types';

const statusColors: Record<string, string> = {
  new: 'bg-accent-500/10 text-accent-500 border-accent-500/20',
  enriched: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  scored: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
  submitted: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  accepted: 'bg-green-500/10 text-green-500 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const pieColors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ef4444'];

export default function DashboardPage() {
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError, refetch: refetchAnalytics } = useDealAnalytics();
  const { data: propertiesData, isLoading: propertiesLoading } = useProperties({ limit: 5 });
  const { data: buyboxes, isLoading: buyboxesLoading } = useBuyBoxes();

  const recentDeals = propertiesData?.data || [];
  const totalDeals = propertiesData?.pagination?.total || 0;
  const buyboxList = Array.isArray(buyboxes) ? buyboxes : [];
  const activeBuyBoxes = buyboxList.filter((b: { enabled?: boolean; active?: boolean }) => b.active ?? b.enabled).length;

  // Build chart data from analytics
  const dealsByStatus = analytics?.byStatus
    ? Object.entries(analytics.byStatus).map(([name, value], index) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: value as number,
        color: pieColors[index % pieColors.length],
      }))
    : [];

  const dealsOverTime = analytics?.byMonth
    ? analytics.byMonth.map((item) => ({
        date: item.month,
        deals: item.count,
      }))
    : [];

  const dealsByState = analytics?.byState
    ? Object.entries(analytics.byState).slice(0, 5).map(([state, count]) => ({
        name: state,
        count: count as number,
      }))
    : [];

  const isLoading = analyticsLoading || propertiesLoading || buyboxesLoading;
  const hasAnalyticsError = !!analyticsError;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Welcome back! Here&apos;s your deal overview.</p>
        </div>
      </div>

      {/* Analytics Error Banner */}
      {hasAnalyticsError && (
        <Card className="bg-red-900/20 border-red-800">
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <p className="text-red-300 text-sm">
                Failed to load analytics: {(analyticsError as Error).message}
              </p>
            </div>
            <Button
              onClick={() => refetchAnalytics()}
              variant="ghost"
              size="sm"
              className="text-red-300 hover:text-red-200 hover:bg-red-900/30"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card border">
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title="Total Deals"
              value={totalDeals}
              change={`Avg $${((analytics?.avgPrice || 0) / 1000).toFixed(0)}K`}
              changeType="neutral"
              icon={Building2}
              iconColor="text-accent-500"
            />
            <StatCard
              title="Active Buy Boxes"
              value={activeBuyBoxes}
              change={`of ${(buyboxes || []).length} total`}
              changeType="neutral"
              icon={Target}
              iconColor="text-purple-500"
            />
            <StatCard
              title="Submitted"
              value={analytics?.byStatus?.submitted || 0}
              change="Total submitted"
              changeType="neutral"
              icon={Send}
              iconColor="text-amber-500"
            />
            <StatCard
              title="Avg Score"
              value={`${(analytics?.avgScore || 0).toFixed(0)}%`}
              change="Deal match score"
              changeType={(analytics?.avgScore || 0) >= 70 ? 'positive' : 'neutral'}
              icon={TrendingUp}
              iconColor="text-green-500"
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Deals by Status */}
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground">Deals by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-[200px]">
                <Skeleton className="h-40 w-40 rounded-full" />
              </div>
            ) : dealsByStatus.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={dealsByStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {dealsByStatus.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap gap-3 justify-center">
                  {dealsByStatus.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-muted-foreground">{item.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deals Over Time */}
        <Card className="bg-card border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-foreground">Deals Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : dealsOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dealsOverTime}>
                  <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                  <YAxis stroke="#71717a" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="deals"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Deals by State */}
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground">Deals by State</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : dealsByState.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dealsByState} layout="vertical">
                  <XAxis type="number" stroke="#71717a" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="#71717a" fontSize={12} width={40} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                No state data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Deals */}
        <Card className="bg-card border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground">Recent Deals</CardTitle>
            <Link href="/deals">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentDeals.length > 0 ? (
              <div className="space-y-3">
                {recentDeals.map((deal: Property) => (
                  <Link
                    key={deal.id}
                    href={`/deals/${deal.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {typeof deal.address === 'string'
                          ? deal.address
                          : `${deal.address.houseNumber} ${deal.address.street}${deal.address.address2 ? ', ' + deal.address.address2 : ''}`
                        }, {deal.city}, {deal.state}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ${deal.askingPrice?.toLocaleString() || 'N/A'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <Badge
                        variant="outline"
                        className={statusColors[deal.status || 'new']}
                      >
                        {deal.status || 'new'}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No deals yet</p>
                <Link href="/import">
                  <Button variant="link" className="text-accent-400 mt-2">
                    Import your first deal
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="text-foreground">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/buyboxes">
              <Button variant="outline" className="w-full h-auto py-6 flex-col gap-2 border hover:bg-secondary hover:border-amber-600">
                <Target className="h-6 w-6 text-amber-500" />
                <span className="text-foreground">Manage Buy Boxes</span>
              </Button>
            </Link>
            <Link href="/chat">
              <Button variant="outline" className="w-full h-auto py-6 flex-col gap-2 border hover:bg-secondary hover:border-green-600">
                <MessageSquare className="h-6 w-6 text-green-500" />
                <span className="text-foreground">AI Assistant</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
