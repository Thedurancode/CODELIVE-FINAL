'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Clock,
  MapPin,
  Users,
  ExternalLink,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { CalendarEvent } from '@/hooks/use-calendar';

interface EventCardProps {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
}

export function EventCard({ event, onEdit, onDelete }: EventCardProps) {
  const startTime = parseISO(event.startTime);
  const endTime = parseISO(event.endTime);

  return (
    <Card className="bg-secondary/50 border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-foreground truncate">{event.title}</h4>

            {/* Time */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {event.isAllDay
                  ? 'All day'
                  : `${format(startTime, 'h:mm a')} - ${format(endTime, 'h:mm a')}`}
              </span>
            </div>

            {/* Location */}
            {event.location && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">{event.location}</span>
              </div>
            )}

            {/* Attendees */}
            {event.attendees.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <Users className="h-3.5 w-3.5" />
                <span>{event.attendees.length} attendee{event.attendees.length > 1 ? 's' : ''}</span>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {event.description}
              </p>
            )}

            {/* Status badge */}
            {event.status === 'cancelled' && (
              <Badge variant="destructive" className="mt-2">
                Cancelled
              </Badge>
            )}
            {event.status === 'tentative' && (
              <Badge variant="secondary" className="mt-2">
                Tentative
              </Badge>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-secondary border">
              {event.link && (
                <DropdownMenuItem
                  className="text-foreground cursor-pointer"
                  onClick={() => window.open(event.link, '_blank')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in Google
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-foreground cursor-pointer"
                onClick={() => onEdit(event)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-500 cursor-pointer"
                onClick={() => onDelete(event.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
