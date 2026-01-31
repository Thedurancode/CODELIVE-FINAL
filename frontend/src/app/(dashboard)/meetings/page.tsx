'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Video,
  VideoOff,
  Calendar,
  Clock,
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Play,
  Trash2,
  Edit2,
  ExternalLink,
  Phone,
  MapPin,
  Link2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Image,
  ChevronDown,
  ChevronUp,
  Palette,
} from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow, isToday, isTomorrow, isPast, addMinutes } from 'date-fns';
import {
  useMeetings,
  useUpcomingMeetings,
  useCreateMeeting,
  useUpdateMeeting,
  useDeleteMeeting,
  useStartMeeting,
  useEndMeeting,
  useMeetingRoomToken,
} from '@/hooks/use-meetings';
import { VideoRoom, VideoRoomPreJoin, MeetingParticipantsPanel } from '@/components/meetings';
import type { Meeting, MeetingStatus, MeetingType, CreateMeetingInput } from '@/types';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';

const statusColors: Record<MeetingStatus, string> = {
  scheduled: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  in_progress: 'bg-green-500/10 text-green-500 border-green-500/20',
  completed: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
  no_show: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

const statusLabels: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

const typeIcons: Record<MeetingType, React.ReactNode> = {
  video: <Video className="h-4 w-4" />,
  in_person: <MapPin className="h-4 w-4" />,
  phone: <Phone className="h-4 w-4" />,
  external_link: <Link2 className="h-4 w-4" />,
};

const typeLabels: Record<MeetingType, string> = {
  video: 'Video Call',
  in_person: 'In Person',
  phone: 'Phone Call',
  external_link: 'External Link',
};

function MeetingCard({
  meeting,
  onJoin,
  onEdit,
  onDelete,
  onStart,
  onEnd,
}: {
  meeting: Meeting;
  onJoin: (meeting: Meeting) => void;
  onEdit: (meeting: Meeting) => void;
  onDelete: (meeting: Meeting) => void;
  onStart: (meeting: Meeting) => void;
  onEnd: (meeting: Meeting) => void;
}) {
  const startDate = new Date(meeting.scheduledAt);
  const endDate = meeting.endedAt ? new Date(meeting.endedAt) : null;
  const isUpcoming = !isPast(startDate) && meeting.status === 'scheduled';
  const canJoin =
    meeting.status === 'in_progress' ||
    (meeting.status === 'scheduled' && meeting.meetingType === 'video');

  const getTimeDisplay = () => {
    if (isToday(startDate)) {
      return `Today at ${format(startDate, 'h:mm a')}`;
    }
    if (isTomorrow(startDate)) {
      return `Tomorrow at ${format(startDate, 'h:mm a')}`;
    }
    return format(startDate, 'MMM d, yyyy h:mm a');
  };

  return (
    <Card className="bg-card border hover:bg-secondary/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-muted-foreground">{typeIcons[meeting.meetingType]}</span>
              <h3 className="font-medium text-foreground truncate">{meeting.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{getTimeDisplay()}</p>
            {meeting.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{meeting.description}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={statusColors[meeting.status]}>
                {statusLabels[meeting.status]}
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {typeLabels[meeting.meetingType]}
              </Badge>
              {meeting.participantCount !== undefined && meeting.participantCount > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  <Users className="h-3 w-3 mr-1" />
                  {meeting.participantCount}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canJoin && (
              <Button size="sm" onClick={() => onJoin(meeting)}>
                <Video className="h-4 w-4 mr-1" />
                Join
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {meeting.status === 'scheduled' && (
                  <DropdownMenuItem onClick={() => onStart(meeting)}>
                    <Play className="h-4 w-4 mr-2" />
                    Start Meeting
                  </DropdownMenuItem>
                )}
                {meeting.status === 'in_progress' && (
                  <DropdownMenuItem onClick={() => onEnd(meeting)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    End Meeting
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onEdit(meeting)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(meeting)}>
                  <Users className="h-4 w-4 mr-2" />
                  Manage Participants
                </DropdownMenuItem>
                {meeting.externalLink && (
                  <DropdownMenuItem asChild>
                    <a href={meeting.externalLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open External Link
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(meeting)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MeetingsPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [joiningMeeting, setJoiningMeeting] = useState<Meeting | null>(null);
  const [inVideoRoom, setInVideoRoom] = useState(false);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [initialVideoEnabled, setInitialVideoEnabled] = useState(true);
  const [initialAudioEnabled, setInitialAudioEnabled] = useState(true);

  // Form state
  const [formData, setFormData] = useState<Partial<CreateMeetingInput>>({
    title: '',
    description: '',
    meetingType: 'video',
    scheduledAt: '',
    duration: 60,
    location: '',
    externalLink: '',
    roomSettings: {
      logoUrl: '',
      backgroundUrl: '',
      welcomeMessage: '',
      recordingEnabled: false,
    },
  });
  const [showBranding, setShowBranding] = useState(false);

  // Queries
  const { data: upcomingData, isLoading: upcomingLoading } = useMeetings({
    upcoming: true,
    sortBy: 'scheduledAt',
    sortOrder: 'asc',
  });
  const { data: pastData, isLoading: pastLoading } = useMeetings({
    status: ['completed', 'cancelled', 'no_show'],
    sortBy: 'scheduledAt',
    sortOrder: 'desc',
  });
  const { data: allData, isLoading: allLoading } = useMeetings({
    sortBy: 'scheduledAt',
    sortOrder: 'desc',
  });

  // Mutations
  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const startMeeting = useStartMeeting();
  const endMeeting = useEndMeeting();
  const getRoomToken = useMeetingRoomToken(joiningMeeting?.id || '');

  // Filtered meetings
  const currentMeetings = useMemo(() => {
    let meetings: Meeting[] = [];
    switch (activeTab) {
      case 'upcoming':
        meetings = upcomingData?.data || [];
        break;
      case 'past':
        meetings = pastData?.data || [];
        break;
      case 'all':
        meetings = allData?.data || [];
        break;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      meetings = meetings.filter(
        (m) =>
          m.title.toLowerCase().includes(query) ||
          m.description?.toLowerCase().includes(query)
      );
    }

    return meetings;
  }, [activeTab, upcomingData, pastData, allData, searchQuery]);

  const isLoading = activeTab === 'upcoming' ? upcomingLoading : activeTab === 'past' ? pastLoading : allLoading;

  const handleCreateMeeting = async () => {
    if (!formData.title || !formData.scheduledAt) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      await createMeeting.mutateAsync(formData as CreateMeetingInput);
      toast.success('Meeting created');
      setIsCreateDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Create meeting error:', error);
      toast.error(error?.message || 'Failed to create meeting');
    }
  };

  const handleUpdateMeeting = async () => {
    if (!editingMeeting) return;

    try {
      await updateMeeting.mutateAsync({
        id: editingMeeting.id,
        data: formData,
      });
      toast.success('Meeting updated');
      setEditingMeeting(null);
      resetForm();
    } catch (error) {
      toast.error('Failed to update meeting');
    }
  };

  const handleDeleteMeeting = async (meeting: Meeting) => {
    if (!confirm('Are you sure you want to delete this meeting?')) return;

    try {
      await deleteMeeting.mutateAsync(meeting.id);
      toast.success('Meeting deleted');
    } catch (error) {
      toast.error('Failed to delete meeting');
    }
  };

  const handleStartMeeting = async (meeting: Meeting) => {
    try {
      await startMeeting.mutateAsync(meeting.id);
      toast.success('Meeting started');
    } catch (error) {
      toast.error('Failed to start meeting');
    }
  };

  const handleEndMeeting = async (meeting: Meeting) => {
    try {
      await endMeeting.mutateAsync(meeting.id);
      toast.success('Meeting ended');
    } catch (error) {
      toast.error('Failed to end meeting');
    }
  };

  const handleJoinMeeting = async (meeting: Meeting) => {
    setJoiningMeeting(meeting);
  };

  const handlePreJoinComplete = async (name: string, email: string, videoEnabled: boolean, audioEnabled: boolean) => {
    if (!joiningMeeting) return;

    try {
      const response = await getRoomToken.mutateAsync({ name, email });
      console.log('[Meetings] Room token response:', response);
      // API returns { success, data: { token, roomUrl, ... } } for meetings endpoints
      const tokenData = (response as any).data || response;

      if (!tokenData?.token || !tokenData?.roomUrl) {
        console.error('[Meetings] Missing token or roomUrl:', tokenData);
        toast.error('Video room not configured. Please check Daily.co settings.');
        setJoiningMeeting(null);
        return;
      }

      console.log('[Meetings] Joining room:', tokenData.roomUrl);
      setRoomToken(tokenData.token);
      setRoomUrl(tokenData.roomUrl);
      setInitialVideoEnabled(videoEnabled);
      setInitialAudioEnabled(audioEnabled);
      setInVideoRoom(true);
    } catch (error: any) {
      console.error('Failed to join meeting:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to join meeting';
      toast.error(errorMessage);
      setJoiningMeeting(null);
    }
  };

  const handleLeaveRoom = () => {
    setInVideoRoom(false);
    setRoomToken(null);
    setRoomUrl(null);
    setJoiningMeeting(null);
    setInitialVideoEnabled(true);
    setInitialAudioEnabled(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      meetingType: 'video',
      scheduledAt: '',
      duration: 60,
      location: '',
      externalLink: '',
      roomSettings: {
        logoUrl: '',
        backgroundUrl: '',
        welcomeMessage: '',
        recordingEnabled: false,
      },
    });
    setShowBranding(false);
  };

  const openEditDialog = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setFormData({
      title: meeting.title,
      description: meeting.description || '',
      meetingType: meeting.meetingType,
      scheduledAt: meeting.scheduledAt,
      duration: meeting.duration || 60,
      location: meeting.location || '',
      externalLink: meeting.externalLink || '',
      roomSettings: {
        logoUrl: meeting.room?.logoUrl || '',
        backgroundUrl: meeting.room?.backgroundUrl || '',
        welcomeMessage: meeting.room?.welcomeMessage || '',
        recordingEnabled: meeting.room?.recordingEnabled || false,
      },
    });
    // Show branding section if any branding is set
    setShowBranding(!!(meeting.room?.logoUrl || meeting.room?.backgroundUrl || meeting.room?.welcomeMessage));
  };

  // Show video room if in call
  if (inVideoRoom && joiningMeeting && roomToken && roomUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <VideoRoom
          meeting={joiningMeeting}
          token={roomToken}
          roomUrl={roomUrl}
          onLeave={handleLeaveRoom}
          initialVideoEnabled={initialVideoEnabled}
          initialAudioEnabled={initialAudioEnabled}
        />
      </div>
    );
  }

  // Show pre-join if joining
  if (joiningMeeting && !inVideoRoom) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <VideoRoomPreJoin
          meeting={joiningMeeting}
          onJoin={handlePreJoinComplete}
          onCancel={() => setJoiningMeeting(null)}
          isLoading={getRoomToken.isPending}
          initialName={user?.name || ''}
          initialEmail={user?.email || ''}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Meetings</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Schedule and manage video meetings
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Meeting
        </Button>
      </div>

      {/* Search and Tabs */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search meetings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Meetings List */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="bg-card border">
              <CardContent className="p-4">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardContent>
            </Card>
          ))
        ) : currentMeetings.length === 0 ? (
          <Card className="bg-card border">
            <CardContent className="p-8 text-center">
              <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium text-foreground mb-1">No meetings found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {activeTab === 'upcoming'
                  ? "You don't have any upcoming meetings"
                  : activeTab === 'past'
                    ? "You don't have any past meetings"
                    : 'No meetings match your search'}
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Schedule a Meeting
              </Button>
            </CardContent>
          </Card>
        ) : (
          currentMeetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              onJoin={handleJoinMeeting}
              onEdit={openEditDialog}
              onDelete={handleDeleteMeeting}
              onStart={handleStartMeeting}
              onEnd={handleEndMeeting}
            />
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || !!editingMeeting}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingMeeting(null);
            resetForm();
          }
        }}
      >
        <DialogContent className={editingMeeting ? 'max-w-2xl' : 'max-w-lg'}>
          <DialogHeader>
            <DialogTitle>{editingMeeting ? 'Edit Meeting' : 'New Meeting'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Team Standup"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Meeting agenda..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meetingType">Type</Label>
              <Select
                value={formData.meetingType}
                onValueChange={(v) => setFormData({ ...formData, meetingType: v as MeetingType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video Call</SelectItem>
                  <SelectItem value="in_person">In Person</SelectItem>
                  <SelectItem value="phone">Phone Call</SelectItem>
                  <SelectItem value="external_link">External Link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Start Time *</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={formData.scheduledAt?.slice(0, 16)}
                  onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={15}
                  step={15}
                  value={formData.duration || 60}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value, 10) })}
                />
              </div>
            </div>

            {formData.meetingType === 'in_person' && (
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Conference Room A"
                />
              </div>
            )}

            {formData.meetingType === 'external_link' && (
              <div className="space-y-2">
                <Label htmlFor="externalLink">Meeting Link</Label>
                <Input
                  id="externalLink"
                  value={formData.externalLink}
                  onChange={(e) => setFormData({ ...formData, externalLink: e.target.value })}
                  placeholder="https://zoom.us/j/..."
                />
              </div>
            )}

            {/* Branding Settings - only for video meetings */}
            {formData.meetingType === 'video' && (
              <div className="space-y-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowBranding(!showBranding)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <Label className="cursor-pointer">Room Branding</Label>
                  </div>
                  {showBranding ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {showBranding && (
                  <div className="space-y-4 pl-6">
                    <div className="space-y-2">
                      <Label htmlFor="logoUrl" className="text-sm">
                        <div className="flex items-center gap-2">
                          <Image className="h-3 w-3" />
                          Logo URL
                        </div>
                      </Label>
                      <Input
                        id="logoUrl"
                        value={formData.roomSettings?.logoUrl || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            roomSettings: { ...formData.roomSettings, logoUrl: e.target.value },
                          })
                        }
                        placeholder="https://your-site.com/logo.png"
                      />
                      <p className="text-xs text-muted-foreground">
                        Your logo will appear in the top-left corner of the meeting room
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="backgroundUrl" className="text-sm">Background Image URL</Label>
                      <Input
                        id="backgroundUrl"
                        value={formData.roomSettings?.backgroundUrl || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            roomSettings: { ...formData.roomSettings, backgroundUrl: e.target.value },
                          })
                        }
                        placeholder="https://your-site.com/background.jpg"
                      />
                      <p className="text-xs text-muted-foreground">
                        Background image for participants without video
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="welcomeMessage" className="text-sm">Welcome Message</Label>
                      <Textarea
                        id="welcomeMessage"
                        value={formData.roomSettings?.welcomeMessage || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            roomSettings: { ...formData.roomSettings, welcomeMessage: e.target.value },
                          })
                        }
                        placeholder="Welcome to our meeting!"
                        rows={2}
                      />
                      <p className="text-xs text-muted-foreground">
                        Shown to participants when they join
                      </p>
                    </div>

                    {/* Logo Preview */}
                    {formData.roomSettings?.logoUrl && (
                      <div className="space-y-2">
                        <Label className="text-sm">Logo Preview</Label>
                        <div className="p-4 bg-muted rounded-lg">
                          <img
                            src={formData.roomSettings.logoUrl}
                            alt="Logo preview"
                            className="h-8 max-w-[200px] object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Participants - only show when editing existing meeting */}
            {editingMeeting && (
              <div className="space-y-2 pt-4 border-t">
                <Label>Participants</Label>
                <MeetingParticipantsPanel meetingId={editingMeeting.id} compact />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingMeeting(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingMeeting ? handleUpdateMeeting : handleCreateMeeting}
              disabled={createMeeting.isPending || updateMeeting.isPending}
            >
              {(createMeeting.isPending || updateMeeting.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingMeeting ? 'Save Changes' : 'Create Meeting'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
