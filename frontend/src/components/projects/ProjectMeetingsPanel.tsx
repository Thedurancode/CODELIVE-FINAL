'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
  MoreHorizontal,
  Play,
  Trash2,
  Edit2,
  ExternalLink,
  Phone,
  MapPin,
  Link2,
  CheckCircle2,
  Loader2,
  FileText,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import Link from 'next/link';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import {
  useMeetingsByProject,
  useCreateMeeting,
  useUpdateMeeting,
  useDeleteMeeting,
  useStartMeeting,
  useEndMeeting,
  useMeetingTranscription,
  useStartMeetingTranscription,
  useRetryMeetingTranscription,
} from '@/hooks/use-meetings';
import { useProjectContacts } from '@/hooks/use-project-contacts';
import { MeetingParticipantsPanel } from '@/components/meetings';
import { Checkbox } from '@/components/ui/checkbox';
import type { Meeting, MeetingStatus, MeetingType, CreateMeetingInput, ProjectContact } from '@/types';
import { toast } from 'sonner';

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

// Transcription Badge Component
function MeetingTranscriptionBadge({ meetingId, status }: { meetingId: string; status: MeetingStatus }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: transcription, isLoading } = useMeetingTranscription(meetingId);
  const startTranscription = useStartMeetingTranscription();
  const retryTranscription = useRetryMeetingTranscription();

  // Only show for completed video meetings
  if (status !== 'completed') return null;

  const handleStartTranscription = async () => {
    try {
      await startTranscription.mutateAsync({ meetingId });
      toast.success('Transcription started');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to start transcription');
    }
  };

  const handleRetryTranscription = async () => {
    try {
      await retryTranscription.mutateAsync({ meetingId });
      toast.success('Retrying transcription');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to retry transcription');
    }
  };

  if (isLoading) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Loading...
      </Badge>
    );
  }

  const transcriptionStatus = transcription?.status;

  if (!transcriptionStatus || transcriptionStatus === 'pending') {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={handleStartTranscription}
        disabled={startTranscription.isPending}
      >
        {startTranscription.isPending ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <FileText className="h-3 w-3 mr-1" />
        )}
        Transcribe
      </Button>
    );
  }

  if (transcriptionStatus === 'processing') {
    const progress = transcription?.progress;
    const chunks = transcription?.chunks;
    const showProgress = progress !== undefined && progress > 0;

    return (
      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        {showProgress ? (
          <span>Transcribing... {progress}%{chunks && chunks > 1 ? ` (${chunks} chunks)` : ''}</span>
        ) : (
          <span>Transcribing...</span>
        )}
      </Badge>
    );
  }

  if (transcriptionStatus === 'failed') {
    return (
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
          <AlertCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={handleRetryTranscription}
          disabled={retryTranscription.isPending}
          title="Retry transcription"
        >
          <RefreshCw className={`h-3 w-3 ${retryTranscription.isPending ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    );
  }

  if (transcriptionStatus === 'completed' && transcription?.transcript) {
    return (
      <div className="w-full mt-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs text-green-500 hover:text-green-400"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <FileText className="h-3 w-3 mr-1" />
          Transcript
          {isExpanded ? (
            <ChevronUp className="h-3 w-3 ml-1" />
          ) : (
            <ChevronDown className="h-3 w-3 ml-1" />
          )}
        </Button>
        {isExpanded && (
          <div className="mt-2 p-3 rounded-md bg-secondary/50 border text-sm text-muted-foreground max-h-48 overflow-y-auto">
            <p className="whitespace-pre-wrap">{transcription.transcript}</p>
            {transcription.language && (
              <p className="mt-2 text-xs text-muted-foreground/70">
                Language: {transcription.language}
                {transcription.duration && ` · Duration: ${Math.round(transcription.duration / 60)}m`}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}

interface ProjectMeetingsPanelProps {
  projectId: string;
  className?: string;
}

export function ProjectMeetingsPanel({ projectId, className }: ProjectMeetingsPanelProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  // Form state
  const [formData, setFormData] = useState<Partial<CreateMeetingInput>>({
    title: '',
    description: '',
    meetingType: 'video',
    scheduledAt: '',
    duration: 60,
    location: '',
    externalLink: '',
    projectId,
  });

  // Queries
  const { data: meetingsData, isLoading } = useMeetingsByProject(projectId, {
    sortBy: 'scheduledAt',
    sortOrder: 'desc',
  });
  const { data: projectContacts } = useProjectContacts(projectId);

  // Mutations
  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const startMeeting = useStartMeeting();
  const endMeeting = useEndMeeting();

  const meetings = meetingsData?.data || [];

  const handleCreateMeeting = async () => {
    if (!formData.title || !formData.scheduledAt) {
      toast.error('Please fill in required fields');
      return;
    }

    // Build participants from selected contacts
    const participants = selectedContactIds
      .map((contactId) => {
        const projectContact = projectContacts?.find((pc) => pc.contactId === contactId);
        if (!projectContact?.contact) return null;
        return {
          contactId: projectContact.contactId,
          email: projectContact.contact.email || '',
          name: projectContact.contact.name || '',
          phone: projectContact.contact.phone || undefined,
          role: 'attendee' as const,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && !!p.email);

    try {
      await createMeeting.mutateAsync({
        ...formData,
        projectId,
        participants: participants.length > 0 ? participants : undefined,
      } as CreateMeetingInput);
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

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      meetingType: 'video',
      scheduledAt: '',
      duration: 60,
      location: '',
      externalLink: '',
      projectId,
    });
    setSelectedContactIds([]);
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
      projectId,
    });
  };

  const getTimeDisplay = (meeting: Meeting) => {
    const startDate = new Date(meeting.scheduledAt);
    if (isToday(startDate)) {
      return `Today at ${format(startDate, 'h:mm a')}`;
    }
    if (isTomorrow(startDate)) {
      return `Tomorrow at ${format(startDate, 'h:mm a')}`;
    }
    return format(startDate, 'MMM d, yyyy h:mm a');
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
        </div>
        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Schedule Meeting
        </Button>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border bg-secondary/30">
                <Skeleton className="h-5 w-48 mb-2" />
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))
          ) : meetings.length === 0 ? (
            <div className="text-center py-8">
              <Video className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">No meetings scheduled</p>
              <Button size="sm" variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Schedule First Meeting
              </Button>
            </div>
          ) : (
            meetings.map((meeting) => {
              const canJoin =
                meeting.status === 'in_progress' ||
                (meeting.status === 'scheduled' && meeting.meetingType === 'video');

              return (
                <div
                  key={meeting.id}
                  className="p-3 rounded-lg border bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-muted-foreground">{typeIcons[meeting.meetingType]}</span>
                        <h4 className="font-medium text-foreground truncate">{meeting.title}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{getTimeDisplay(meeting)}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={statusColors[meeting.status]}>
                          {statusLabels[meeting.status]}
                        </Badge>
                        {meeting.participantCount !== undefined && meeting.participantCount > 0 && (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Users className="h-3 w-3 mr-1" />
                            {meeting.participantCount}
                          </Badge>
                        )}
                        {/* Transcription badge for completed video meetings */}
                        {meeting.meetingType === 'video' && (
                          <MeetingTranscriptionBadge meetingId={meeting.id} status={meeting.status} />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {canJoin && (
                        <Link href={`/meetings?join=${meeting.id}`}>
                          <Button size="sm" variant="outline">
                            <Video className="h-3 w-3 mr-1" />
                            Join
                          </Button>
                        </Link>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {meeting.status === 'scheduled' && (
                            <DropdownMenuItem onClick={() => handleStartMeeting(meeting)}>
                              <Play className="h-4 w-4 mr-2" />
                              Start Meeting
                            </DropdownMenuItem>
                          )}
                          {meeting.status === 'in_progress' && (
                            <DropdownMenuItem onClick={() => handleEndMeeting(meeting)}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              End Meeting
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => openEditDialog(meeting)}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {meeting.externalLink && (
                            <DropdownMenuItem asChild>
                              <a href={meeting.externalLink} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open Link
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteMeeting(meeting)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

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
            <DialogTitle>{editingMeeting ? 'Edit Meeting' : 'Schedule Meeting'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Project Sync"
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

            {/* Contact Selection - only show when creating new meeting */}
            {!editingMeeting && projectContacts && projectContacts.length > 0 && (
              <div className="space-y-2">
                <Label>Invite Contacts</Label>
                <div className="rounded-lg border p-3 space-y-2 max-h-36 overflow-y-auto">
                  {projectContacts.map((pc) => {
                    if (!pc.contact) return null;
                    const isSelected = selectedContactIds.includes(pc.contactId);
                    return (
                      <div
                        key={pc.contactId}
                        className="flex items-center gap-3 py-1"
                      >
                        <Checkbox
                          id={`contact-${pc.contactId}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedContactIds([...selectedContactIds, pc.contactId]);
                            } else {
                              setSelectedContactIds(selectedContactIds.filter((id) => id !== pc.contactId));
                            }
                          }}
                        />
                        <label
                          htmlFor={`contact-${pc.contactId}`}
                          className="flex-1 flex items-center gap-2 cursor-pointer text-sm"
                        >
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{pc.contact.name}</span>
                          {pc.contact.email && (
                            <span className="text-muted-foreground text-xs">{pc.contact.email}</span>
                          )}
                          {pc.role && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {pc.role}
                            </Badge>
                          )}
                        </label>
                      </div>
                    );
                  })}
                </div>
                {selectedContactIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedContactIds.length} contact{selectedContactIds.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            )}

            {formData.meetingType === 'video' && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  {formData.roomSettings?.recordingEnabled !== false ? (
                    <Video className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <VideoOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="space-y-0.5">
                    <Label htmlFor="recordingEnabled" className="text-sm font-medium cursor-pointer">
                      Record meeting
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Enable automatic recording and transcription
                    </p>
                  </div>
                </div>
                <Switch
                  id="recordingEnabled"
                  checked={formData.roomSettings?.recordingEnabled !== false}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      roomSettings: {
                        ...formData.roomSettings,
                        recordingEnabled: checked,
                      },
                    })
                  }
                />
              </div>
            )}

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
              {editingMeeting ? 'Save Changes' : 'Schedule Meeting'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
