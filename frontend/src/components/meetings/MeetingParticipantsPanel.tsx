'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Users,
  Plus,
  MoreHorizontal,
  Trash2,
  UserPlus,
  Mail,
  Phone,
  Crown,
  Mic,
  MicOff,
  Check,
  X,
  HelpCircle,
  Clock,
  Loader2,
  Search,
} from 'lucide-react';
import {
  useMeetingParticipants,
  useAddMeetingParticipant,
  useRemoveMeetingParticipant,
  useUpdateParticipantRsvp,
} from '@/hooks/use-meetings';
import { useContacts, useSearchContacts } from '@/hooks/use-contacts';
import type { MeetingParticipant, ParticipantRole, RsvpStatus, Contact } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const roleLabels: Record<ParticipantRole, string> = {
  host: 'Host',
  co_host: 'Co-Host',
  presenter: 'Presenter',
  attendee: 'Attendee',
};

const roleColors: Record<ParticipantRole, string> = {
  host: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  co_host: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  presenter: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  attendee: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

const rsvpIcons: Record<RsvpStatus, React.ReactNode> = {
  accepted: <Check className="h-3 w-3 text-green-500" />,
  declined: <X className="h-3 w-3 text-red-500" />,
  tentative: <HelpCircle className="h-3 w-3 text-amber-500" />,
  pending: <Clock className="h-3 w-3 text-gray-500" />,
  no_response: <Clock className="h-3 w-3 text-gray-400" />,
};

const rsvpLabels: Record<RsvpStatus, string> = {
  accepted: 'Accepted',
  declined: 'Declined',
  tentative: 'Tentative',
  pending: 'Pending',
  no_response: 'No Response',
};

interface MeetingParticipantsPanelProps {
  meetingId: string;
  className?: string;
  compact?: boolean;
}

export function MeetingParticipantsPanel({
  meetingId,
  className,
  compact = false,
}: MeetingParticipantsPanelProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState<'contact' | 'manual'>('contact');
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Manual entry form
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [participantRole, setParticipantRole] = useState<ParticipantRole>('attendee');

  // Queries
  const { data: participants, isLoading } = useMeetingParticipants(meetingId);
  const { data: contactsData } = useContacts({ limit: 100 });
  const { data: searchResults } = useSearchContacts(contactSearchQuery, 10);

  // Mutations
  const addParticipant = useAddMeetingParticipant();
  const removeParticipant = useRemoveMeetingParticipant();
  const updateRsvp = useUpdateParticipantRsvp();

  const allContacts = contactsData?.data || [];
  const filteredContacts = useMemo(() => {
    if (contactSearchQuery.length >= 2 && searchResults) {
      return searchResults;
    }
    return allContacts.slice(0, 20);
  }, [contactSearchQuery, searchResults, allContacts]);

  // Filter out contacts already in the meeting
  const availableContacts = useMemo(() => {
    const participantEmails = new Set(participants?.map((p) => p.email.toLowerCase()) || []);
    const participantContactIds = new Set(participants?.map((p) => p.contactId).filter(Boolean) || []);

    return filteredContacts.filter(
      (contact) =>
        !participantContactIds.has(contact.id) &&
        (!contact.email || !participantEmails.has(contact.email.toLowerCase()))
    );
  }, [filteredContacts, participants]);

  const handleAddParticipant = async () => {
    try {
      if (addMode === 'contact' && selectedContact) {
        await addParticipant.mutateAsync({
          meetingId,
          participant: {
            email: selectedContact.email || `${selectedContact.id}@no-email.local`,
            name: selectedContact.name,
            contactId: selectedContact.id,
            role: participantRole,
            phone: selectedContact.phone,
          },
        });
        toast.success(`Added ${selectedContact.name} to meeting`);
      } else if (addMode === 'manual' && manualEmail && manualName) {
        await addParticipant.mutateAsync({
          meetingId,
          participant: {
            email: manualEmail,
            name: manualName,
            role: participantRole,
            phone: manualPhone || undefined,
          },
        });
        toast.success(`Added ${manualName} to meeting`);
      } else {
        toast.error('Please fill in required fields');
        return;
      }

      resetForm();
      setIsAddDialogOpen(false);
    } catch (error) {
      toast.error('Failed to add participant');
    }
  };

  const handleRemoveParticipant = async (participant: MeetingParticipant) => {
    if (!confirm(`Remove ${participant.name} from this meeting?`)) return;

    try {
      await removeParticipant.mutateAsync({
        meetingId,
        participantId: participant.id,
      });
      toast.success(`Removed ${participant.name}`);
    } catch (error) {
      toast.error('Failed to remove participant');
    }
  };

  const handleUpdateRsvp = async (participant: MeetingParticipant, status: RsvpStatus) => {
    try {
      await updateRsvp.mutateAsync({
        meetingId,
        participantId: participant.id,
        status,
      });
      toast.success('RSVP updated');
    } catch (error) {
      toast.error('Failed to update RSVP');
    }
  };

  const resetForm = () => {
    setSelectedContact(null);
    setManualName('');
    setManualEmail('');
    setManualPhone('');
    setParticipantRole('attendee');
    setContactSearchQuery('');
    setAddMode('contact');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const participantList = participants || [];

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {participantList.length} Participant{participantList.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setIsAddDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      <ScrollArea className={compact ? 'h-[200px]' : 'h-[300px]'}>
        <div className="space-y-2">
          {participantList.length === 0 ? (
            <div className="text-center py-6">
              <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No participants yet</p>
              <Button
                size="sm"
                variant="link"
                className="mt-1"
                onClick={() => setIsAddDialogOpen(true)}
              >
                Add first participant
              </Button>
            </div>
          ) : (
            participantList.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors group"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {getInitials(participant.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{participant.name}</span>
                    {participant.role === 'host' && (
                      <Crown className="h-3 w-3 text-amber-500" />
                    )}
                    {participant.contactId && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        Contact
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{participant.email}</span>
                    <span className="flex items-center gap-0.5">
                      {rsvpIcons[participant.rsvpStatus]}
                      {rsvpLabels[participant.rsvpStatus]}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Badge variant="outline" className={cn('text-[10px]', roleColors[participant.role])}>
                    {roleLabels[participant.role]}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleUpdateRsvp(participant, 'accepted')}
                        disabled={participant.rsvpStatus === 'accepted'}
                      >
                        <Check className="h-4 w-4 mr-2 text-green-500" />
                        Mark Accepted
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleUpdateRsvp(participant, 'declined')}
                        disabled={participant.rsvpStatus === 'declined'}
                      >
                        <X className="h-4 w-4 mr-2 text-red-500" />
                        Mark Declined
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleUpdateRsvp(participant, 'tentative')}
                        disabled={participant.rsvpStatus === 'tentative'}
                      >
                        <HelpCircle className="h-4 w-4 mr-2 text-amber-500" />
                        Mark Tentative
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleRemoveParticipant(participant)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Add Participant Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
        if (!open) resetForm();
        setIsAddDialogOpen(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Participant</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={addMode === 'contact' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAddMode('contact')}
                className="flex-1"
              >
                <Users className="h-4 w-4 mr-1" />
                From Contacts
              </Button>
              <Button
                variant={addMode === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAddMode('manual')}
                className="flex-1"
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Manual Entry
              </Button>
            </div>

            {addMode === 'contact' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Contact</Label>
                  <Popover open={contactSearchOpen} onOpenChange={setContactSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between"
                      >
                        {selectedContact ? (
                          <span className="truncate">{selectedContact.name}</span>
                        ) : (
                          <span className="text-muted-foreground">Search contacts...</span>
                        )}
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search contacts..."
                          value={contactSearchQuery}
                          onValueChange={setContactSearchQuery}
                        />
                        <CommandList>
                          <CommandEmpty>No contacts found.</CommandEmpty>
                          <CommandGroup>
                            {availableContacts.map((contact) => (
                              <CommandItem
                                key={contact.id}
                                value={contact.name}
                                onSelect={() => {
                                  setSelectedContact(contact);
                                  setContactSearchOpen(false);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarFallback className="text-[10px]">
                                      {getInitials(contact.name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{contact.name}</p>
                                    {contact.email && (
                                      <p className="text-xs text-muted-foreground truncate">
                                        {contact.email}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {selectedContact && (
                  <div className="p-3 rounded-lg bg-secondary/50 border">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{getInitials(selectedContact.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{selectedContact.name}</p>
                        {selectedContact.email && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {selectedContact.email}
                          </p>
                        )}
                        {selectedContact.phone && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {selectedContact.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
            )}

            {/* Role Selection */}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={participantRole}
                onValueChange={(v) => setParticipantRole(v as ParticipantRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendee">Attendee</SelectItem>
                  <SelectItem value="presenter">Presenter</SelectItem>
                  <SelectItem value="co_host">Co-Host</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddParticipant}
              disabled={
                addParticipant.isPending ||
                (addMode === 'contact' && !selectedContact) ||
                (addMode === 'manual' && (!manualName || !manualEmail))
              }
            >
              {addParticipant.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Participant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
