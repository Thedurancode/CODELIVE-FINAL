'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Link2,
  MapPin,
  Clock,
  Users,
  ExternalLink,
} from 'lucide-react';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { EventCard } from '@/components/calendar/EventCard';
import { CreateEventDialog } from '@/components/calendar/CreateEventDialog';
import {
  useCalendarStatus,
  useCalendarEvents,
  useConnectCalendar,
  useDisconnectCalendar,
  useDeleteCalendarEvent,
  type CalendarEvent,
} from '@/hooks/use-calendar';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay, parseISO } from 'date-fns';

// Wrapper component to handle Suspense boundary for useSearchParams
export default function CalendarPage() {
  return (
    <Suspense fallback={<CalendarPageSkeleton />}>
      <CalendarPageContent />
    </Suspense>
  );
}

function CalendarPageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-6 w-64 mt-2" />
      </div>
      <Skeleton className="h-[600px] w-full" />
    </div>
  );
}

function CalendarPageContent() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    setMounted(true);
    // Check for connection status from OAuth callback
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected === 'true') {
      toast.success('Google Calendar connected successfully!');
    } else if (error) {
      toast.error(`Failed to connect: ${error}`);
    }
  }, [searchParams]);

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useCalendarStatus();
  const connectCalendar = useConnectCalendar();
  const disconnectCalendar = useDisconnectCalendar();
  const deleteEvent = useDeleteCalendarEvent();

  // Get events for the current month
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  const { data: events, isLoading: eventsLoading, refetch: refetchEvents } = useCalendarEvents({
    timeMin: monthStart.toISOString(),
    timeMax: monthEnd.toISOString(),
    maxResults: 100,
  });

  // Events for the selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate || !events) return [];
    return events.filter((event) => {
      const eventDate = parseISO(event.startTime);
      return isSameDay(eventDate, selectedDate);
    });
  }, [selectedDate, events]);

  // Stats
  const stats = useMemo(() => {
    if (!events) return { total: 0, today: 0, thisWeek: 0 };
    const today = new Date();
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
      total: events.length,
      today: events.filter((e) => isSameDay(parseISO(e.startTime), today)).length,
      thisWeek: events.filter((e) => {
        const eventDate = parseISO(e.startTime);
        return eventDate >= today && eventDate <= weekFromNow;
      }).length,
    };
  }, [events]);

  const handleConnect = async () => {
    try {
      const result = await connectCalendar.mutateAsync();
      window.location.href = result.authUrl;
    } catch {
      toast.error('Failed to get connection URL');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Google Calendar?')) return;
    try {
      await disconnectCalendar.mutateAsync();
      toast.success('Calendar disconnected');
    } catch {
      toast.error('Failed to disconnect calendar');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await deleteEvent.mutateAsync(eventId);
      toast.success('Event deleted');
    } catch {
      toast.error('Failed to delete event');
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
    setSelectedDate(null);
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
    setSelectedDate(null);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  const handleRefresh = () => {
    refetchStatus();
    refetchEvents();
    toast.success('Calendar refreshed');
  };

  // Loading state
  if (statusLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-6 w-64 mt-2" />
        </div>
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  // Not configured state
  if (!status?.configured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Calendar</h1>
          <p className="text-muted-foreground mt-1">Google Calendar integration</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Google Calendar Not Configured</p>
            <p className="text-muted-foreground text-center max-w-md">
              Google Calendar integration is not configured on this server.
              Please contact your administrator to set up Google OAuth credentials.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not connected state
  if (!status?.connected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Calendar</h1>
          <p className="text-muted-foreground mt-1">Connect your Google Calendar to get started</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarIcon className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Connect Your Calendar</p>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Connect your Google Calendar to view and manage your events, schedule showings,
              and keep track of important deadlines.
            </p>
            <Button
              size="lg"
              className="bg-accent-600 hover:bg-accent-700 text-white h-12 px-6"
              onClick={handleConnect}
              disabled={connectCalendar.isPending}
            >
              {connectCalendar.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-5 w-5" />
                  Connect Google Calendar
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">Calendar</h1>
          <p className="text-base sm:text-lg text-muted-foreground mt-2">
            {status.email && <span className="text-accent-500">{status.email}</span>}
          </p>
        </div>
        <div className="flex gap-3 sm:gap-4">
          <Button
            variant="outline"
            size="default"
            className="border text-foreground h-11 px-5"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-5 w-5 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="default"
            className="border text-foreground h-11 px-5"
            onClick={handleDisconnect}
            disabled={disconnectCalendar.isPending}
          >
            <Link2 className="h-5 w-5 sm:mr-2" />
            <span className="hidden sm:inline">Disconnect</span>
          </Button>
          <Button
            size="default"
            className="bg-accent-600 hover:bg-accent-700 text-white h-11 px-5"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-5 w-5 sm:mr-2" />
            <span className="hidden sm:inline">New Event</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
        <Card className="bg-card border">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <CalendarIcon className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-foreground">{stats.total}</p>
                <p className="text-sm text-muted-foreground">This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/20 rounded-xl">
                <Clock className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-foreground">{stats.today}</p>
                <p className="text-sm text-muted-foreground">Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border col-span-2 sm:col-span-1">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-500/20 rounded-xl">
                <Users className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-foreground">{stats.thisWeek}</p>
                <p className="text-sm text-muted-foreground">This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar and Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <Card className="bg-card border lg:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl text-foreground">
                {format(currentDate, 'MMMM yyyy')}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleToday} className="border">
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={handlePrevMonth} className="border h-9 w-9">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={handleNextMonth} className="border h-9 w-9">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <Skeleton className="h-[400px] w-full" />
            ) : (
              <CalendarGrid
                currentDate={currentDate}
                events={events || []}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            )}
          </CardContent>
        </Card>

        {/* Events List */}
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">
              {selectedDate
                ? format(selectedDate, 'EEEE, MMMM d')
                : 'Select a date'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedDate ? (
              <p className="text-muted-foreground text-center py-8">
                Click a date to see events
              </p>
            ) : selectedDateEvents.length === 0 ? (
              <div className="text-center py-8">
                <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No events on this day</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 border"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Event
                </Button>
              </div>
            ) : (
              selectedDateEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onEdit={setEditingEvent}
                  onDelete={handleDeleteEvent}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Event Dialog */}
      {mounted && (
        <CreateEventDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          defaultDate={selectedDate || undefined}
          onSuccess={() => {
            refetchEvents();
            setIsCreateOpen(false);
          }}
        />
      )}

      {/* Edit Event Dialog */}
      {mounted && editingEvent && (
        <CreateEventDialog
          open={!!editingEvent}
          onOpenChange={(open) => !open && setEditingEvent(null)}
          event={editingEvent}
          onSuccess={() => {
            refetchEvents();
            setEditingEvent(null);
          }}
        />
      )}
    </div>
  );
}
