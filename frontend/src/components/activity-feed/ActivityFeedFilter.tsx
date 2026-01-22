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
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activities..."
            value={filters.search || ''}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
            className="pl-9"
          />
        </div>

        {/* Filter popover - only render after mount to avoid hydration mismatch */}
        {mounted ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filters</h4>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="h-auto py-1 px-2 text-xs"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              {/* Resource Type filter */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Resource Type</Label>
                <div className="flex flex-wrap gap-1">
                  {ALL_RESOURCE_TYPES.map((type) => (
                    <Badge
                      key={type}
                      variant={filters.resourceTypes?.includes(type) ? 'default' : 'outline'}
                      className="cursor-pointer text-xs"
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
                <div className="flex flex-wrap gap-1">
                  {ALL_IMPORTANCE_LEVELS.map((level) => (
                    <Badge
                      key={level}
                      variant={filters.importance?.includes(level) ? 'default' : 'outline'}
                      className="cursor-pointer text-xs"
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
                    <SelectTrigger>
                      <SelectValue placeholder="All users" />
                    </SelectTrigger>
                    <SelectContent>
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
          <Button variant="outline" className="gap-2" disabled>
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </Button>
        )}

        {/* Date range picker - only render after mount to avoid hydration mismatch */}
        {mounted ? (
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {filters.startDate || filters.endDate ? (
                  <span className="text-xs">
                    {filters.startDate ? format(filters.startDate, 'MMM d') : 'Start'}
                    {' - '}
                    {filters.endDate ? format(filters.endDate, 'MMM d') : 'End'}
                  </span>
                ) : (
                  'Date'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" align="end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Start Date</Label>
                  <Input
                    type="date"
                    value={filters.startDate ? format(filters.startDate, 'yyyy-MM-dd') : ''}
                    onChange={handleStartDateChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">End Date</Label>
                  <Input
                    type="date"
                    value={filters.endDate ? format(filters.endDate, 'yyyy-MM-dd') : ''}
                    onChange={handleEndDateChange}
                  />
                </div>
                <div className="flex justify-end gap-2">
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
                  >
                    Clear
                  </Button>
                  <Button size="sm" onClick={() => setIsDatePickerOpen(false)}>
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Button variant="outline" className="gap-2" disabled>
            <CalendarIcon className="h-4 w-4" />
            Date
          </Button>
        )}
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.eventTypes?.map((type) => (
            <Badge key={type} variant="secondary" className="gap-1">
              {EVENT_TYPE_LABELS[type]}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleEventType(type)}
              />
            </Badge>
          ))}
          {filters.resourceTypes?.map((type) => (
            <Badge key={type} variant="secondary" className="gap-1">
              {RESOURCE_TYPE_LABELS[type]}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleResourceType(type)}
              />
            </Badge>
          ))}
          {filters.importance?.map((level) => (
            <Badge key={level} variant="secondary" className="gap-1">
              {IMPORTANCE_LABELS[level]}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleImportance(level)}
              />
            </Badge>
          ))}
          {(filters.startDate || filters.endDate) && (
            <Badge variant="secondary" className="gap-1">
              {filters.startDate ? format(filters.startDate, 'MMM d') : 'Any'} -{' '}
              {filters.endDate ? format(filters.endDate, 'MMM d') : 'Any'}
              <X
                className="h-3 w-3 cursor-pointer"
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
