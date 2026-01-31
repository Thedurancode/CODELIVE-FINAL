'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Edit2,
  Calendar,
  Loader2,
  Video,
  Phone,
  MapPin,
  Link2,
  Users,
  Clock,
  Play,
  Square,
  ExternalLink,
  Copy,
  Check,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useMeetings,
  useMeetingsByProject,
  useCreateMeeting,
  useUpdateMeeting,
  useDeleteMeeting,
  useStartMeeting,
  useEndMeeting,
  useMeetingRoomToken,
} from '@/hooks/use-meetings';
import { toast } from 'sonner';
import type {
  Meeting,
  MeetingType,
  MeetingStatus,
  RecurrencePattern,
  CreateMeetingInput,
  ParticipantRole,
} from '@/types';

interface MeetingsPanelProps {
  projectId?: string;
  showHeader?: boolean;
  maxItems?: number;
  compact?: boolean;
  onJoinMeeting?: (meeting: Meeting, token: string) => void;
}

const meetingTypeIcons: Record<MeetingType, React.ReactNode> = {
  video: <Video className="h-4 w-4" />,
  phone: <Phone className="h-4 w-4" />,
  in_person: <MapPin className="h-4 w-4" />,
  external_link: <Link2 className="h-4 w-4" />,
};

const meetingTypeLabels: Record<MeetingType, string> = {
  video: 'Video Call',
  phone: 'Phone Call',
  in_person: 'In Person',
  external_link: 'External Link',
};

const statusColors: Record<MeetingStatus, string> = {
  scheduled: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  in_progress: 'bg-green-500/10 text-green-500 border-green-500/20',
  completed: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
  no_show: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

const recurrenceLabels: Record<RecurrencePattern, string> = {
  none: 'No repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  custom: 'Custom',
};

function formatDateTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return `Today at ${timeStr}`;
  }
  if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });

  return `${dateStr} at ${timeStr}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function isUpcoming(meeting: Meeting) {
  return meeting.status === 'scheduled' && new Date(meeting.scheduledAt) > new Date();
}

function isHappeningNow(meeting: Meeting) {
  if (meeting.status === 'in_progress') return true;
  const now = new Date();
  const start = new Date(meeting.scheduledAt);
  const end = new Date(start.getTime() + meeting.duration * 60000);
  return meeting.status === 'scheduled' && now >= start && now <= end;
}

interface ParticipantInput {
  email: string;
  name: string;
  role: ParticipantRole;
}

export function MeetingsPanel({
  projectId,
  showHeader = true,
  maxItems,
  compact = false,
  onJoinMeeting,
}: MeetingsPanelProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [newMeeting, setNewMeeting] = useState<CreateMeetingInput>({
    title: '',
    scheduledAt: '',
    duration: 30,
    meetingType: 'video',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    participants: [],
  });
  const [newParticipant, setNewParticipant] = useState<ParticipantInput>({
    email: '',
    name: '',
    role: 'attendee',
  });
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [joiningMeetingId, setJoiningMeetingId] = useState<string | null>(null);

  // Fetch meetings
  const meetingsQuery = projectId
    ? useMeetingsByProject(projectId, { limit: maxItems, upcoming: true })
    : useMeetings({ limit: maxItems, upcoming: true });

  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const startMeeting = useStartMeeting();
  const endMeeting = useEndMeeting();
  const getRoomToken = useMeetingRoomToken(joiningMeetingId || '');

  const meetings = useMemo(() => {
    const data = meetingsQuery.data;
    if (!data) return [];
    return 'data' in data ? data.data : data;
  }, [meetingsQuery.data]);

  const handleCreateMeeting = async () => {
    if (!newMeeting.title || !newMeeting.scheduledAt) {
      toast.error('Please fill in the required fields');
      return;
    }

    try {
      const input: CreateMeetingInput = {
        ...newMeeting,
        projectId: projectId,
      };
      await createMeeting.mutateAsync(input);
      toast.success('Meeting scheduled');
      setIsCreateOpen(false);
      setNewMeeting({
        title: '',
        scheduledAt: '',
        duration: 30,
        meetingType: 'video',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        participants: [],
      });
    } catch (error) {
      toast.error('Failed to schedule meeting');
    }
  };

  const handleUpdateMeeting = async () => {
    if (!editingMeeting) return;

    try {
      await updateMeeting.mutateAsync({
        id: editingMeeting.id,
        data: {
          title: editingMeeting.title,
          description: editingMeeting.description || undefined,
          scheduledAt: editingMeeting.scheduledAt,
          duration: editingMeeting.duration,
          meetingType: editingMeeting.meetingType,
          location: editingMeeting.location || undefined,
          externalLink: editingMeeting.externalLink || undefined,
          agenda: editingMeeting.agenda || undefined,
        },
      });
      toast.success('Meeting updated');
      setIsEditOpen(false);
      setEditingMeeting(null);
    } catch (error) {
      toast.error('Failed to update meeting');
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    try {
      await deleteMeeting.mutateAsync(id);
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
    if (meeting.meetingType === 'external_link' && meeting.externalLink) {
      window.open(meeting.externalLink, '_blank');
      return;
    }

    if (meeting.meetingType === 'video') {
      setJoiningMeetingId(meeting.id);
      try {
        const token = await getRoomToken.mutateAsync({});
        if (onJoinMeeting) {
          onJoinMeeting(meeting, token.token);
        } else {
          // Default behavior: open in new tab or navigate
          toast.success('Joining meeting...');
        }
      } catch (error) {
        toast.error('Failed to join meeting');
      } finally {
        setJoiningMeetingId(null);
      }
    }
  };

  const handleCopyLink = (meeting: Meeting) => {
    const link = meeting.externalLink || `${window.location.origin}/meetings/${meeting.id}/join`;
    navigator.clipboard.writeText(link);
    setCopiedLink(meeting.id);
    toast.success('Link copied');
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const addParticipant = () => {
    if (!newParticipant.email || !newParticipant.name) {
      toast.error('Please enter participant email and name');
      return;
    }
    setNewMeeting((prev) => ({
      ...prev,
      participants: [
        ...(prev.participants || []),
        { ...newParticipant },
      ],
    }));
    setNewParticipant({ email: '', name: '', role: 'attendee' });
  };

  const removeParticipant = (index: number) => {
    setNewMeeting((prev) => ({
      ...prev,
      participants: prev.participants?.filter((_, i) => i !== index),
    }));
  };

  if (meetingsQuery.isLoading) {
    return (
      <div className="space-y-3">
        {showHeader && <Skeleton className="h-8 w-32" />}
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Meetings</h3>
            {meetings.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {meetings.length}
              </Badge>
            )}
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Schedule Meeting</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={newMeeting.title}
                    onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                    placeholder="Meeting title"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scheduledAt">Date & Time *</Label>
                    <Input
                      id="scheduledAt"
                      type="datetime-local"
                      value={newMeeting.scheduledAt}
                      onChange={(e) => setNewMeeting({ ...newMeeting, scheduledAt: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration</Label>
                    <Select
                      value={String(newMeeting.duration)}
                      onValueChange={(v) => setNewMeeting({ ...newMeeting, duration: parseInt(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1.5 hours</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Meeting Type</Label>
                  <Select
                    value={newMeeting.meetingType}
                    onValueChange={(v) => setNewMeeting({ ...newMeeting, meetingType: v as MeetingType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">
                        <div className="flex items-center gap-2">
                          <Video className="h-4 w-4" />
                          Video Call
                        </div>
                      </SelectItem>
                      <SelectItem value="phone">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Phone Call
                        </div>
                      </SelectItem>
                      <SelectItem value="in_person">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          In Person
                        </div>
                      </SelectItem>
                      <SelectItem value="external_link">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4" />
                          External Link (Zoom, Meet, etc.)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newMeeting.meetingType === 'in_person' && (
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={newMeeting.location || ''}
                      onChange={(e) => setNewMeeting({ ...newMeeting, location: e.target.value })}
                      placeholder="Enter meeting location"
                    />
                  </div>
                )}

                {newMeeting.meetingType === 'external_link' && (
                  <div className="space-y-2">
                    <Label htmlFor="externalLink">Meeting Link</Label>
                    <Input
                      id="externalLink"
                      value={newMeeting.externalLink || ''}
                      onChange={(e) => setNewMeeting({ ...newMeeting, externalLink: e.target.value })}
                      placeholder="https://zoom.us/j/..."
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Recurrence</Label>
                  <Select
                    value={newMeeting.recurrence || 'none'}
                    onValueChange={(v) => setNewMeeting({ ...newMeeting, recurrence: v as RecurrencePattern })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(recurrenceLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newMeeting.description || ''}
                    onChange={(e) => setNewMeeting({ ...newMeeting, description: e.target.value })}
                    placeholder="Meeting description or notes"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Participants</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email"
                      value={newParticipant.email}
                      onChange={(e) => setNewParticipant({ ...newParticipant, email: e.target.value })}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Name"
                      value={newParticipant.name}
                      onChange={(e) => setNewParticipant({ ...newParticipant, name: e.target.value })}
                      className="flex-1"
                    />
                    <Button type="button" size="icon" variant="outline" onClick={addParticipant}>
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                  {newMeeting.participants && newMeeting.participants.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {newMeeting.participants.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1">
                          <span>{p.name} ({p.email})</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeParticipant(i)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateMeeting} disabled={createMeeting.isPending}>
                  {createMeeting.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Schedule Meeting
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {meetings.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No upcoming meetings</p>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Schedule a meeting
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {meetings.map((meeting) => (
            <Card key={meeting.id} className={compact ? 'p-3' : ''}>
              <CardContent className={compact ? 'p-0' : 'pt-4'}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 p-2 rounded-lg bg-muted">
                      {meetingTypeIcons[meeting.meetingType]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium truncate">{meeting.title}</h4>
                        <Badge variant="outline" className={statusColors[meeting.status]}>
                          {meeting.status.replace('_', ' ')}
                        </Badge>
                        {isHappeningNow(meeting) && (
                          <Badge className="bg-green-500 animate-pulse">Live</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(meeting.scheduledAt)}
                        </span>
                        <span>{formatDuration(meeting.duration)}</span>
                        {meeting.participants && meeting.participants.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {meeting.participants.length}
                          </span>
                        )}
                      </div>
                      {meeting.description && !compact && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {meeting.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {(meeting.meetingType === 'video' || meeting.meetingType === 'external_link') && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => handleCopyLink(meeting)}
                            >
                              {copiedLink === meeting.id ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy meeting link</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    {(isUpcoming(meeting) || isHappeningNow(meeting)) && (
                      <Button
                        size="sm"
                        variant={isHappeningNow(meeting) ? 'default' : 'outline'}
                        onClick={() => handleJoinMeeting(meeting)}
                        disabled={joiningMeetingId === meeting.id}
                      >
                        {joiningMeetingId === meeting.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : meeting.meetingType === 'external_link' ? (
                          <>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-1" />
                            Join
                          </>
                        )}
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingMeeting(meeting);
                            setIsEditOpen(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {meeting.status === 'scheduled' && (
                          <DropdownMenuItem onClick={() => handleStartMeeting(meeting)}>
                            <Play className="h-4 w-4 mr-2" />
                            Start Meeting
                          </DropdownMenuItem>
                        )}
                        {meeting.status === 'in_progress' && (
                          <DropdownMenuItem onClick={() => handleEndMeeting(meeting)}>
                            <Square className="h-4 w-4 mr-2" />
                            End Meeting
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDeleteMeeting(meeting.id)}
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
          ))}
        </div>
      )}

      {/* Edit Meeting Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Meeting</DialogTitle>
          </DialogHeader>
          {editingMeeting && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editingMeeting.title}
                  onChange={(e) => setEditingMeeting({ ...editingMeeting, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-scheduledAt">Date & Time</Label>
                  <Input
                    id="edit-scheduledAt"
                    type="datetime-local"
                    value={editingMeeting.scheduledAt.slice(0, 16)}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, scheduledAt: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-duration">Duration</Label>
                  <Select
                    value={String(editingMeeting.duration)}
                    onValueChange={(v) => setEditingMeeting({ ...editingMeeting, duration: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingMeeting.description || ''}
                  onChange={(e) => setEditingMeeting({ ...editingMeeting, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateMeeting} disabled={updateMeeting.isPending}>
              {updateMeeting.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
