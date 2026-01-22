'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useActivityFeed,
  useMarkAsRead,
  useActivityFilterOptions,
  ActivityFeedEntry,
} from '@/hooks/use-activity-feed';
import { ActivityItem } from './ActivityItem';
import { ActivityFeedFilter, ActivityFeedFilters } from './ActivityFeedFilter';
import { Separator } from '@/components/ui/separator';
import {
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  Inbox,
} from 'lucide-react';

interface ActivityFeedProps {
  organizationId?: string;
  showHeader?: boolean;
  showFilters?: boolean;
  maxHeight?: string;
  className?: string;
  initialFilters?: ActivityFeedFilters;
  limit?: number;
}

export function ActivityFeed({
  organizationId,
  showHeader = true,
  showFilters = true,
  maxHeight = '600px',
  className,
  initialFilters,
  limit = 12,
}: ActivityFeedProps) {
  const [filters, setFiltersState] = useState<ActivityFeedFilters>(initialFilters || {});
  const [page, setPage] = useState(1);
  const [currentUserId] = useState<string | undefined>(undefined); // Would come from auth context

  // Wrap setFilters to also reset page when filters change
  const setFilters = useCallback((newFilters: ActivityFeedFilters) => {
    setFiltersState(newFilters);
    setPage(1);
  }, []);

  // Build query params
  const queryParams = {
    organizationId,
    eventTypes: filters.eventTypes,
    resourceTypes: filters.resourceTypes,
    importance: filters.importance,
    actorId: filters.actorId,
    startDate: filters.startDate?.toISOString(),
    endDate: filters.endDate?.toISOString(),
    search: filters.search,
    limit,
    offset: (page - 1) * limit,
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useActivityFeed(queryParams);
  const { data: filterOptions } = useActivityFilterOptions(organizationId);
  const markAsRead = useMarkAsRead();

  const handleMarkAsRead = (activityId: string) => {
    markAsRead.mutate([activityId]);
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const isActivityRead = (activity: ActivityFeedEntry) => {
    if (!currentUserId) return true; // Treat all as read if no user
    return activity.readBy.includes(currentUserId);
  };

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (page > 3) {
        pages.push('ellipsis');
      }

      // Show pages around current page
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (page < totalPages - 2) {
        pages.push('ellipsis');
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <Card className={cn('', className)}>
      {showHeader && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Feed
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
        </CardHeader>
      )}

      <CardContent className="space-y-4">
        {showFilters && (
          <ActivityFeedFilter
            filters={filters}
            onFiltersChange={setFilters}
            filterOptions={filterOptions}
          />
        )}

        {/* Error state */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2 text-red-400" />
            <p className="text-sm">Failed to load activities</p>
            <p className="text-xs mt-1">{error?.message || 'Unknown error'}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-4"
            >
              Try again
            </Button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 p-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && data?.activities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox className="h-12 w-12 mb-4" />
            <p className="text-lg font-medium">No activities found</p>
            <p className="text-sm mt-1">
              {filters.search || Object.keys(filters).length > 0
                ? 'Try adjusting your filters'
                : 'Activity will appear here as your team works'}
            </p>
          </div>
        )}

        {/* Activities list */}
        {!isLoading && !isError && data && data.activities.length > 0 && (
          <div className="flex flex-col" style={{ maxHeight }}>
            <ScrollArea className="flex-1">
              <div>
                {data.activities.map((activity, index) => (
                  <div key={activity.id}>
                    <ActivityItem
                      activity={activity}
                      isRead={isActivityRead(activity)}
                      onMarkAsRead={handleMarkAsRead}
                    />
                    {index < data.activities.length - 1 && (
                      <Separator className="my-0" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Footer with stats and pagination */}
            <div className="flex-shrink-0 pt-4 border-t mt-4">
              {/* Stats */}
              <div className="text-center text-xs text-muted-foreground mb-4">
                Showing {data.activities.length} of {data.total} activities
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Page info */}
                <div className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} ({data.total} total)
                </div>

                {/* Pagination buttons */}
                <div className="flex items-center gap-1">
                  {/* First page */}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlePageChange(1)}
                    disabled={page === 1 || isFetching}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>

                  {/* Previous page */}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1 || isFetching}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {/* Page numbers */}
                  <div className="flex items-center gap-1 mx-2">
                    {getPageNumbers().map((pageNum, idx) =>
                      pageNum === 'ellipsis' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                          ...
                        </span>
                      ) : (
                        <Button
                          key={pageNum}
                          variant={page === pageNum ? 'default' : 'outline'}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handlePageChange(pageNum)}
                          disabled={isFetching}
                        >
                          {pageNum}
                        </Button>
                      )
                    )}
                  </div>

                  {/* Next page */}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages || isFetching}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  {/* Last page */}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={page === totalPages || isFetching}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ActivityFeed;
