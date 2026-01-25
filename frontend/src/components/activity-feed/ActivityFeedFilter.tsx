'use client';

import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import {
  Search,
  Calendar as CalendarIcon,
  X,
  SlidersHorizontal,
  Filter,
} from 'lucide-react';
import {
  ActivityEventType,
  ActivityResourceType,
  ActivityImportance,
  EVENT_TYPE_LABELS,
  RESOURCE_TYPE_LABELS,
  IMPORTANCE_LABELS,
} from '@/hooks/use-activity-feed';

export interface ActivityFeedFilters {
  search?: string;
  eventTypes?: ActivityEventType[];
  resourceTypes?: ActivityResourceType[];
  importance?: ActivityImportance[];
  startDate?: Date;
  endDate?: Date;
  actorId?: string;
}

interface ActivityFeedFilterProps {
  filters: ActivityFeedFilters;
  onFiltersChange: (filters: ActivityFeedFilters) => void;
  filterOptions?: {
    eventTypes: string[];
    resourceTypes: string[];
    actors: { id: string; name: string }[];
  };
}

const ALL_RESOURCE_TYPES: ActivityResourceType[] = [
  'deal',
  'buyer',
  'task',
  'compliance',
  'document',
  'message',
  'team',
  'offer',
  'pipeline',
];

const ALL_IMPORTANCE_LEVELS: ActivityImportance[] = ['low', 'normal', 'high', 'critical'];

export function ActivityFeedFilter({
  filters,
  onFiltersChange,
  filterOptions,
}: ActivityFeedFilterProps) {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Prevent hydration mismatch with Radix UI Popover IDs
  // Using useSyncExternalStore to safely detect client-side rendering
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const hasActiveFilters = !!(
    filters.search ||
    filters.eventTypes?.length ||
    filters.resourceTypes?.length ||
    filters.importance?.length ||
    filters.startDate ||
    filters.endDate ||
    filters.actorId
  );

  const activeFilterCount =
    (filters.eventTypes?.length || 0) +
    (filters.resourceTypes?.length || 0) +
    (filters.importance?.length || 0) +
    (filters.startDate ? 1 : 0) +
    (filters.endDate ? 1 : 0) +
    (filters.actorId ? 1 : 0);

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  const toggleEventType = (eventType: ActivityEventType) => {
    const current = filters.eventTypes || [];
    const updated = current.includes(eventType)
      ? current.filter((t) => t !== eventType)
      : [...current, eventType];
    onFiltersChange({ ...filters, eventTypes: updated.length ? updated : undefined });
  };

  const toggleResourceType = (resourceType: ActivityResourceType) => {
    const current = filters.resourceTypes || [];
    const updated = current.includes(resourceType)
      ? current.filter((t) => t !== resourceType)
      : [...current, resourceType];
    onFiltersChange({ ...filters, resourceTypes: updated.length ? updated : undefined });
  };

  const toggleImportance = (importance: ActivityImportance) => {
    const current = filters.importance || [];
    const updated = current.includes(importance)
      ? current.filter((t) => t !== importance)
      : [...current, importance];
    onFiltersChange({ ...filters, importance: updated.length ? updated : undefined });
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onFiltersChange({
      ...filters,
      startDate: value ? new Date(value) : undefined,
    });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onFiltersChange({
      ...filters,
      endDate: value ? new Date(value) : undefined,
    });
  };

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activities..."
            value={filters.search || ''}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
            className="pl-9 bg-background/50 border-border/50 rounded-xl"
          />
        </div>

        {/* Filter popover - only render after mount to avoid hydration mismatch */}
        {mounted ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 rounded-xl border-border/50 bg-background/50">
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 bg-card/95 backdrop-blur-xl border-border/50 rounded-xl" align="end">
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Filter className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium">Filters</span>
                  </div>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear all
                    </Button>
                  )}
                </div>

                {/* Resource Type filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Resource Type</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_RESOURCE_TYPES.map((type) => (
                      <Badge
                        key={type}
                        variant={filters.resourceTypes?.includes(type) ? 'default' : 'outline'}
                        className={`cursor-pointer text-[10px] px-2 py-0.5 rounded-lg transition-all ${
                          filters.resourceTypes?.includes(type)
                            ? ''
                            : 'border-border/50 hover:border-border hover:bg-muted/50'
                        }`}
                        onClick={() => toggleResourceType(type)}
                      >
                        {RESOURCE_TYPE_LABELS[type]}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Importance filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Importance</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_IMPORTANCE_LEVELS.map((level) => (
                      <Badge
                        key={level}
                        variant={filters.importance?.includes(level) ? 'default' : 'outline'}
                        className={`cursor-pointer text-[10px] px-2 py-0.5 rounded-lg transition-all ${
                          filters.importance?.includes(level)
                            ? ''
                            : 'border-border/50 hover:border-border hover:bg-muted/50'
                        }`}
                        onClick={() => toggleImportance(level)}
                      >
                        {IMPORTANCE_LABELS[level]}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Actor filter */}
                {filterOptions?.actors && filterOptions.actors.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">User</Label>
                    <Select
                      value={filters.actorId || ''}
                      onValueChange={(value) =>
                        onFiltersChange({ ...filters, actorId: value || undefined })
                      }
                    >
                      <SelectTrigger className="bg-background/50 border-border/50 rounded-lg">
                        <SelectValue placeholder="All users" />
                      </SelectTrigger>
                      <SelectContent className="bg-card/95 backdrop-blur-xl border-border/50">
                        <SelectItem value="">All users</SelectItem>
                        {filterOptions.actors.map((actor) => (
                          <SelectItem key={actor.id} value={actor.id}>
                            {actor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Button variant="outline" className="gap-2 rounded-xl border-border/50" disabled>
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
          </Button>
        )}

        {/* Date range picker - only render after mount to avoid hydration mismatch */}
        {mounted ? (
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 rounded-xl border-border/50 bg-background/50">
                <CalendarIcon className="h-4 w-4" />
                {filters.startDate || filters.endDate ? (
                  <span className="text-xs hidden sm:inline">
                    {filters.startDate ? format(filters.startDate, 'MMM d') : 'Start'}
                    {' - '}
                    {filters.endDate ? format(filters.endDate, 'MMM d') : 'End'}
                  </span>
                ) : (
                  <span className="hidden sm:inline">Date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0 bg-card/95 backdrop-blur-xl border-border/50 rounded-xl" align="end">
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <CalendarIcon className="h-4 w-4 text-blue-500" />
                  </div>
                  <span className="font-medium">Date Range</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Start Date</Label>
                    <Input
                      type="date"
                      value={filters.startDate ? format(filters.startDate, 'yyyy-MM-dd') : ''}
                      onChange={handleStartDateChange}
                      className="bg-background/50 border-border/50 rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">End Date</Label>
                    <Input
                      type="date"
                      value={filters.endDate ? format(filters.endDate, 'yyyy-MM-dd') : ''}
                      onChange={handleEndDateChange}
                      className="bg-background/50 border-border/50 rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onFiltersChange({
                        ...filters,
                        startDate: undefined,
                        endDate: undefined,
                      });
                      setIsDatePickerOpen(false);
                    }}
                    className="text-xs"
                  >
                    Clear
                  </Button>
                  <Button size="sm" onClick={() => setIsDatePickerOpen(false)} className="text-xs">
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Button variant="outline" className="gap-2 rounded-xl border-border/50" disabled>
            <CalendarIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Date</span>
          </Button>
        )}
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5">
          {filters.eventTypes?.map((type) => (
            <Badge
              key={type}
              variant="secondary"
              className="gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20"
            >
              {EVENT_TYPE_LABELS[type]}
              <X
                className="h-3 w-3 cursor-pointer hover:text-red-400 transition-colors"
                onClick={() => toggleEventType(type)}
              />
            </Badge>
          ))}
          {filters.resourceTypes?.map((type) => (
            <Badge
              key={type}
              variant="secondary"
              className="gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20"
            >
              {RESOURCE_TYPE_LABELS[type]}
              <X
                className="h-3 w-3 cursor-pointer hover:text-red-400 transition-colors"
                onClick={() => toggleResourceType(type)}
              />
            </Badge>
          ))}
          {filters.importance?.map((level) => (
            <Badge
              key={level}
              variant="secondary"
              className="gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20"
            >
              {IMPORTANCE_LABELS[level]}
              <X
                className="h-3 w-3 cursor-pointer hover:text-red-400 transition-colors"
                onClick={() => toggleImportance(level)}
              />
            </Badge>
          ))}
          {(filters.startDate || filters.endDate) && (
            <Badge
              variant="secondary"
              className="gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-green-500/10 border border-green-500/20"
            >
              {filters.startDate ? format(filters.startDate, 'MMM d') : 'Any'} -{' '}
              {filters.endDate ? format(filters.endDate, 'MMM d') : 'Any'}
              <X
                className="h-3 w-3 cursor-pointer hover:text-red-400 transition-colors"
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    startDate: undefined,
                    endDate: undefined,
                  })
                }
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export default ActivityFeedFilter;
