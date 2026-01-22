'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  format,
} from 'date-fns';
import type { CalendarEvent } from '@/hooks/use-calendar';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}

export function CalendarGrid({
  currentDate,
  events,
  selectedDate,
  onSelectDate,
}: CalendarGridProps) {
  // Get all days to display in the calendar grid
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const dateKey = format(parseISO(event.startTime), 'yyyy-MM-dd');
      const existing = map.get(dateKey) || [];
      map.set(dateKey, [...existing, event]);
    });
    return map;
  }, [events]);

  return (
    <div className="select-none">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-px mb-2">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-center text-sm font-medium text-muted-foreground py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate.get(dateKey) || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isDayToday = isToday(day);

          return (
            <button
              key={dateKey}
              onClick={() => onSelectDate(day)}
              className={cn(
                'min-h-[80px] sm:min-h-[100px] p-2 text-left transition-colors bg-card hover:bg-accent/50',
                !isCurrentMonth && 'opacity-40',
                isSelected && 'ring-2 ring-accent-500 ring-inset',
              )}
            >
              <div className="flex flex-col h-full">
                {/* Day number */}
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium',
                    isDayToday && 'bg-accent-600 text-white',
                    !isDayToday && isCurrentMonth && 'text-foreground',
                    !isDayToday && !isCurrentMonth && 'text-muted-foreground',
                  )}
                >
                  {format(day, 'd')}
                </span>

                {/* Event dots/badges */}
                <div className="flex-1 mt-1 space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className="text-xs truncate px-1 py-0.5 rounded bg-accent-500/20 text-accent-400"
                      title={event.title}
                    >
                      <span className="hidden sm:inline">
                        {format(parseISO(event.startTime), 'HH:mm')}
                      </span>{' '}
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-muted-foreground px-1">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
