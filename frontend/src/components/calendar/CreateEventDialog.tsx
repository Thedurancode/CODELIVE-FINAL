'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw } from 'lucide-react';
import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  type CalendarEvent,
  type CreateEventInput,
} from '@/hooks/use-calendar';
import { toast } from 'sonner';
import { format, parseISO, addHours } from 'date-fns';

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent;
  defaultDate?: Date;
  onSuccess: () => void;
}

export function CreateEventDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
  onSuccess,
}: CreateEventDialogProps) {
  const isEditing = !!event;
  const createEvent = useCreateCalendarEvent();
  const updateEvent = useUpdateCalendarEvent();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [attendees, setAttendees] = useState('');

  // Initialize form when dialog opens or event changes
  useEffect(() => {
    if (open) {
      if (event) {
        // Editing existing event
        const start = parseISO(event.startTime);
        const end = parseISO(event.endTime);
        setTitle(event.title);
        setDescription(event.description || '');
        setStartDate(format(start, 'yyyy-MM-dd'));
        setStartTime(format(start, 'HH:mm'));
        setEndDate(format(end, 'yyyy-MM-dd'));
        setEndTime(format(end, 'HH:mm'));
        setLocation(event.location || '');
        setAttendees(event.attendees.join(', '));
      } else {
        // Creating new event
        const defaultStart = defaultDate || new Date();
        const defaultEnd = addHours(defaultStart, 1);
        setTitle('');
        setDescription('');
        setStartDate(format(defaultStart, 'yyyy-MM-dd'));
        setStartTime(format(defaultStart, 'HH:mm'));
        setEndDate(format(defaultEnd, 'yyyy-MM-dd'));
        setEndTime(format(defaultEnd, 'HH:mm'));
        setLocation('');
        setAttendees('');
      }
    }
  }, [open, event, defaultDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    const startDateTime = new Date(`${startDate}T${startTime}`);
    const endDateTime = new Date(`${endDate}T${endTime}`);

    if (endDateTime <= startDateTime) {
      toast.error('End time must be after start time');
      return;
    }

    const attendeeList = attendees
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email);

    try {
      if (isEditing && event) {
        await updateEvent.mutateAsync({
          id: event.id,
          title: title.trim(),
          description: description.trim() || undefined,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          location: location.trim() || undefined,
        });
        toast.success('Event updated');
      } else {
        const input: CreateEventInput = {
          title: title.trim(),
          description: description.trim() || undefined,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          location: location.trim() || undefined,
          attendees: attendeeList.length > 0 ? attendeeList : undefined,
        };
        await createEvent.mutateAsync(input);
        toast.success('Event created');
      }
      onSuccess();
    } catch (error) {
      toast.error(isEditing ? 'Failed to update event' : 'Failed to create event');
    }
  };

  const isPending = createEvent.isPending || updateEvent.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground">
            {isEditing ? 'Edit Event' : 'Create Event'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-foreground">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="bg-secondary border text-foreground"
              required
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-foreground">
                Start Date
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-secondary border text-foreground"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startTime" className="text-foreground">
                Start Time
              </Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-secondary border text-foreground"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-foreground">
                End Date
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-secondary border text-foreground"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime" className="text-foreground">
                End Time
              </Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-secondary border text-foreground"
                required
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location" className="text-foreground">
              Location
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Event location (optional)"
              className="bg-secondary border text-foreground"
            />
          </div>

          {/* Attendees */}
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="attendees" className="text-foreground">
                Attendees
              </Label>
              <Input
                id="attendees"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="email@example.com, another@example.com"
                className="bg-secondary border text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of email addresses
              </p>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-foreground">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Event description (optional)"
              className="bg-secondary border text-foreground min-h-[100px]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-accent-600 hover:bg-accent-700 text-white"
            >
              {isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : isEditing ? (
                'Update Event'
              ) : (
                'Create Event'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
