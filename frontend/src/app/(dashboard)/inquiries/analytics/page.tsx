'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowLeft,
  TrendingUp,
  Building2,
  Loader2,
  BarChart3,
  PieChart,
} from 'lucide-react';
import { api } from '@/lib/api';

interface InquiryAnalytics {
  overview: {
    total: number;
    pending: number;
    answered: number;
    expired: number;
    cancelled: number;
    responseRate: number;
    avgResponseTimeHours: number | null;
  };
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byDay: Array<{ date: string; created: number; answered: number }>;
  topProperties: Array<{ propertyId: number; address: string; count: number }>;
  responseTimeDistribution: {
    under1h: number;
    under6h: number;
    under24h: number;
    under72h: number;
    over72h: number;
  };
}

const categoryLabels: Record<string, string> = {
  seller_motivation: 'Seller Motivation',
  property_condition: 'Property Condition',
  property_history: 'Property History',
  closing_terms: 'Closing Terms',
  inclusions: 'Inclusions',
  pricing: 'Pricing',
  other: 'Other',
};

const priorityColors: Record<string, string> = {
  low: 'bg-zinc-600',
  normal: 'bg-blue-600',
  high: 'bg-orange-600',
  urgent: 'bg-red-600',
};

export default function InquiryAnalyticsPage() {
  const [dateRange, setDateRange] = useState('30');

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['inquiry-analytics', dateRange],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));
      return api.get<InquiryAnalytics>(`/api/inquiries/analytics?startDate=${startDate.toISOString()}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load analytics</p>
      </div>
    );
  }

  const maxDayValue = Math.max(
    ...analytics.byDay.map(d => Math.max(d.created, d.answered)),
    1
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/inquiries">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Inquiry Analytics</h1>
            <p className="text-muted-foreground text-sm">
              Performance metrics and trends
            </p>
          </div>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40 bg-secondary border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-card border">
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-6 w-6 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{analytics.overview.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 text-yellow-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{analytics.overview.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-6 w-6 text-green-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{analytics.overview.answered}</p>
            <p className="text-xs text-muted-foreground">Answered</p>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4 text-center">
            <AlertCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{analytics.overview.expired}</p>
            <p className="text-xs text-muted-foreground">Expired</p>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 text-purple-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{analytics.overview.responseRate}%</p>
            <p className="text-xs text-muted-foreground">Response Rate</p>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 text-cyan-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">
              {analytics.overview.avgResponseTimeHours
                ? `${analytics.overview.avgResponseTimeHours}h`
                : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground">Avg Response</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend */}
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" />
              Daily Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.byDay.slice(-14).map((day) => (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 flex gap-1 h-4">
                    <div
                      className="bg-blue-600 rounded-sm"
                      style={{ width: `${(day.created / maxDayValue) * 50}%` }}
                      title={`Created: ${day.created}`}
                    />
                    <div
                      className="bg-green-600 rounded-sm"
                      style={{ width: `${(day.answered / maxDayValue) * 50}%` }}
                      title={`Answered: ${day.answered}`}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {day.created}/{day.answered}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-600 rounded" />
                <span className="text-xs text-muted-foreground">Created</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-600 rounded" />
                <span className="text-xs text-muted-foreground">Answered</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Response Time Distribution */}
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-400" />
              Response Time Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'Under 1 hour', value: analytics.responseTimeDistribution.under1h, color: 'bg-green-500' },
                { label: '1-6 hours', value: analytics.responseTimeDistribution.under6h, color: 'bg-blue-500' },
                { label: '6-24 hours', value: analytics.responseTimeDistribution.under24h, color: 'bg-yellow-500' },
                { label: '24-72 hours', value: analytics.responseTimeDistribution.under72h, color: 'bg-orange-500' },
                { label: 'Over 72 hours', value: analytics.responseTimeDistribution.over72h, color: 'bg-red-500' },
              ].map((item) => {
                const total = Object.values(analytics.responseTimeDistribution).reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? (item.value / total) * 100 : 0;
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">{item.label}</span>
                      <span className="text-muted-foreground">{item.value} ({percentage.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category and Priority Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Category */}
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <PieChart className="h-5 w-5 text-blue-400" />
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.byCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([category, count]) => {
                  const total = Object.values(analytics.byCategory).reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={category} className="flex items-center gap-3">
                      <span className="text-sm text-foreground w-36 truncate">
                        {categoryLabels[category] || category}
                      </span>
                      <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-12 text-right">{count}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* By Priority */}
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-400" />
              By Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(analytics.byPriority).map(([priority, count]) => (
                <div
                  key={priority}
                  className="p-4 bg-secondary/50 rounded-lg border border text-center"
                >
                  <Badge className={`${priorityColors[priority]} text-foreground mb-2`}>
                    {priority}
                  </Badge>
                  <p className="text-2xl font-bold text-foreground">{count}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Properties */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-green-400" />
            Top Properties by Inquiries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.topProperties.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data available</p>
          ) : (
            <div className="space-y-3">
              {analytics.topProperties.map((property, index) => (
                <div
                  key={property.propertyId}
                  className="flex items-center gap-4 p-3 bg-secondary/50 rounded-lg"
                >
                  <span className="text-lg font-bold text-muted-foreground w-8">
                    #{index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-foreground">{property.address}</p>
                    <p className="text-xs text-muted-foreground">Property #{property.propertyId}</p>
                  </div>
                  <Badge variant="outline" className="border-blue-600 text-blue-400">
                    {property.count} inquiries
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
