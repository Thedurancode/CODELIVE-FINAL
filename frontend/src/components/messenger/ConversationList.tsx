'use client';

import { useState, useMemo } from 'react';
import { Search, Plus, MapPin, MessageSquare, Mail, Phone, Archive, Trash2, UserPlus, ExternalLink, MessageSquareOff, Home } from 'lucide-react';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { useOnlineUsers } from '@/hooks/use-user-presence';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useSearchTeamConversations, useDeleteTeamConversation, useArchiveTeamConversation, useTeamMembers, useAddParticipants, useConversationParticipants } from '@/hooks/use-team-chat';
import type { TeamConversation } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { NewConversationDialog } from './NewConversationDialog';
import { PropertyPreviewCard } from './PropertyPreviewCard';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';

export interface ConversationListProps {
  conversations: TeamConversation[];
  isLoading: boolean;
  onSelectConversation: (conversation: TeamConversation) => void;
}

function getSourceIcon(source?: string) {
  switch (source) {
    case 'sms':
      return <Phone className="h-3 w-3" />;
    case 'email':
      return <Mail className="h-3 w-3" />;
    default:
      return <MessageSquare className="h-3 w-3" />;
  }
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface ConversationItemProps {
  conversation: TeamConversation;
  onClick: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onAddPeople: () => void;
  onlineParticipantCount?: number;
}

// Helper function to clean up undefined and placeholder values in strings
function cleanDisplayText(text: string | null | undefined): string | null {
  if (!text) return null;
  // Remove "undefined" strings, placeholder values, and clean up punctuation
  const cleaned = text
    .replace(/Property #undefined/gi, '')
    .replace(/Public Discussion:\s*,?\s*undefined/gi, 'Public Discussion')
    .replace(/,?\s*undefined\s*/gi, '')
    // Remove "Unknown" placeholder values
    .replace(/,?\s*Unknown City\s*/gi, '')
    .replace(/,?\s*Unknown State\s*/gi, '')
    .replace(/,?\s*Unknown\s*/gi, '')
    .replace(/,?\s*00000\s*/gi, '')
    .replace(/^[,\s]+|[,\s]+$/g, '') // trim commas and spaces
    .replace(/,\s*,/g, ',') // remove double commas
    .replace(/:\s*,/g, ':') // remove colon followed by comma
    .trim();
  return cleaned || null;
}

function ConversationItem({
  conversation,
  onClick,
  onDelete,
  onArchive,
  onAddPeople,
  onlineParticipantCount = 0,
}: ConversationItemProps) {
  const unreadCount = conversation.unreadCount ?? 0;
  const lastMessageTime = conversation.lastMessageAt
    ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
    : null;

  const isOffRecord = !conversation.propertyId;

  // Clean up title and address to remove "undefined" strings
  const cleanTitle = cleanDisplayText(conversation.title);
  const cleanAddress = cleanDisplayText(conversation.propertyAddress);

  // Get property data if available
  const property = conversation.property || conversation.propertyPreview;

  // Handle address - it can be a string or an object with houseNumber/street
  const formatAddress = () => {
    if (!property) return null;

    // Helper to check if a value is a valid display value (not a placeholder)
    const isValidValue = (val: unknown): val is string =>
      typeof val === 'string' &&
      val.trim() !== '' &&
      val.toLowerCase() !== 'unknown' &&
      val !== 'Unknown City' &&
      val !== 'Unknown State' &&
      val !== '00000';

    let streetAddress: string | null = null;

    // Check if address is an object with houseNumber/street
    if (property.address && typeof property.address === 'object') {
      const addr = property.address as { houseNumber?: string; street?: string };
      const validParts = [addr.houseNumber, addr.street].filter(isValidValue);
      if (validParts.length > 0) {
        streetAddress = validParts.join(' ');
      }
    } else if (isValidValue(property.address)) {
      streetAddress = property.address;
    }

    // Build full address from components, filtering out placeholder values
    const city = isValidValue(property.city) ? property.city : null;
    const state = isValidValue(property.state) ? property.state : null;
    const zip = isValidValue(property.zip) ? property.zip : null;

    const parts = [streetAddress, city, state, zip].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  const propertyAddress = formatAddress();
  const propertyPhoto = property?.photoLinks?.[0];

  const displayTitle = cleanTitle ||
                       propertyAddress ||
                       cleanAddress ||
                       (conversation.propertyId ? `Property #${conversation.propertyId}` : 'General');
  const displayAddress = propertyAddress && propertyAddress !== displayTitle ? propertyAddress :
                         (cleanAddress && cleanAddress !== displayTitle ? cleanAddress : null);

  const conversationButton = (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b last:border-b-0',
        unreadCount > 0 && 'bg-primary/5'
      )}
    >
      {/* Property Image or Icon with Online Indicator */}
      <div className="relative flex-shrink-0">
        <div className={cn(
          'h-10 w-10 rounded-lg flex items-center justify-center overflow-hidden',
          propertyPhoto ? 'bg-transparent' : (isOffRecord ? 'bg-orange-500/10' : 'bg-primary/10')
        )}>
          {propertyPhoto ? (
            <img
              src={propertyPhoto}
              alt={displayTitle}
              className="h-full w-full object-cover"
            />
          ) : isOffRecord ? (
            <MessageSquareOff className="h-5 w-5 text-orange-500" />
          ) : (
            <MapPin className="h-5 w-5 text-primary" />
          )}
        </div>
        {onlineParticipantCount > 0 && (
          <OnlineIndicator
            isOnline={true}
            size="sm"
            className="absolute -bottom-0.5 -right-0.5"
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate">
            {displayTitle}
          </span>
          {lastMessageTime && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {lastMessageTime}
            </span>
          )}
        </div>

        {displayAddress && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {displayAddress}
          </p>
        )}

        {conversation.lastMessagePreview && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-muted-foreground">
              {getSourceIcon(conversation.lastMessageSource)}
            </span>
            <p className="text-xs text-muted-foreground truncate">
              {conversation.lastMessagePreview}
            </p>
          </div>
        )}
      </div>

      {/* Unread Badge */}
      {unreadCount > 0 && (
        <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      )}

      {/* Archived indicator */}
      {conversation.isArchived && (
        <Archive className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {conversationButton}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>
          <MessageSquare className="mr-2 h-4 w-4" />
          Open Chat
        </ContextMenuItem>
        <ContextMenuItem onClick={onAddPeople}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add People
        </ContextMenuItem>
        {conversation.propertyId && (
          <ContextMenuItem onClick={() => window.open(`/deals/${conversation.propertyId}`, '_blank')}>
            <ExternalLink className="mr-2 h-4 w-4" />
            View Property
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {conversation.propertyId && (
          <ContextMenuItem onClick={onArchive}>
            <Archive className="mr-2 h-4 w-4" />
            {conversation.isArchived ? 'Unarchive' : 'Archive'}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onClick={conversation.propertyId ? onArchive : onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {conversation.propertyId
            ? (conversation.isArchived ? 'Delete (Unarchive)' : 'Delete (Archive)')
            : 'Delete Conversation'
          }
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <div className="flex-1">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function ConversationList({
  conversations,
  isLoading,
  onSelectConversation,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [deleteConversation, setDeleteConversation] = useState<TeamConversation | null>(null);
  const [addPeopleConversation, setAddPeopleConversation] = useState<TeamConversation | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // Online users tracking
  const { onlineUserIds } = useOnlineUsers();

  // Hooks
  const { data: searchResults, isLoading: searchLoading } = useSearchTeamConversations(
    searchQuery,
    10
  );

  // Calculate online participants per conversation
  const getOnlineParticipantCount = useMemo(() => {
    return (participantIds?: string[]) => {
      if (!participantIds || participantIds.length === 0) return 0;
      return participantIds.filter((id) => onlineUserIds.includes(id)).length;
    };
  }, [onlineUserIds]);
  const deleteConversationMutation = useDeleteTeamConversation();
  const archiveConversationMutation = useArchiveTeamConversation();
  const addParticipantsMutation = useAddParticipants();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: currentParticipants = [] } = useConversationParticipants(addPeopleConversation?.id || null);

  const displayedConversations = searchQuery.length >= 2
    ? (searchResults || [])
    : showArchived
    ? conversations.filter((c) => c.isArchived)
    : conversations.filter((c) => !c.isArchived);

  const handleConversationCreated = (conversation: TeamConversation) => {
    onSelectConversation(conversation);
  };

  const handleDelete = async () => {
    if (!deleteConversation) return;
    try {
      await deleteConversationMutation.mutateAsync(deleteConversation.id);
      toast.success('Conversation deleted');
      setDeleteConversation(null);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to delete conversation');
    }
  };

  const handleArchive = async (conversation: TeamConversation) => {
    try {
      await archiveConversationMutation.mutateAsync(conversation.id);
      toast.success(conversation.isArchived ? 'Conversation unarchived' : 'Conversation archived');
    } catch (error) {
      toast.error('Failed to archive conversation');
    }
  };

  const handleAddPeople = async () => {
    if (!addPeopleConversation || selectedMembers.length === 0) return;
    try {
      await addParticipantsMutation.mutateAsync({
        conversationId: addPeopleConversation.id,
        userIds: selectedMembers,
      });
      toast.success(`Added ${selectedMembers.length} people to the conversation`);
      setAddPeopleConversation(null);
      setSelectedMembers([]);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to add participants');
    }
  };

  // Filter out members who are already participants
  const currentParticipantIds = currentParticipants.map((p: any) => p.id);
  const availableMembers = teamMembers.filter((m) => !currentParticipantIds.includes(m.id));

  return (
    <div className="flex flex-col h-full">
      {/* Search and New Conversation */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setIsNewDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Conversation
          </Button>
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
            title={showArchived ? "Hide archived" : "Show archived"}
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={isNewDialogOpen}
        onOpenChange={setIsNewDialogOpen}
        onConversationCreated={handleConversationCreated}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConversation} onOpenChange={(open) => !open && setDeleteConversation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this conversation? This will permanently delete all messages and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add People Dialog */}
      <Dialog open={!!addPeopleConversation} onOpenChange={(open) => {
        if (!open) {
          setAddPeopleConversation(null);
          setSelectedMembers([]);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add People to Conversation</DialogTitle>
            <DialogDescription>
              Select team members to add to this conversation.
            </DialogDescription>
          </DialogHeader>

          {/* Current Participants */}
          {currentParticipants.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Already in conversation:</p>
              <div className="flex flex-wrap gap-2">
                {currentParticipants.map((participant: any) => {
                  const isOnline = onlineUserIds.includes(participant.id);
                  return (
                    <Badge key={participant.id} variant="secondary" className="gap-1">
                      <div className="relative">
                        <Avatar className="h-4 w-4">
                          <AvatarFallback className="text-[8px]">
                            {getInitials(participant.name)}
                          </AvatarFallback>
                        </Avatar>
                        {isOnline && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-green-500 ring-1 ring-background" />
                        )}
                      </div>
                      {participant.name}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available Members */}
          <ScrollArea className="max-h-[250px] pr-4">
            {availableMembers.length > 0 ? (
              <div className="space-y-2">
                {availableMembers.map((member) => {
                  const isOnline = onlineUserIds.includes(member.id);
                  return (
                    <label
                      key={member.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedMembers.includes(member.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedMembers([...selectedMembers, member.id]);
                          } else {
                            setSelectedMembers(selectedMembers.filter((id) => id !== member.id));
                          }
                        }}
                      />
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        {isOnline && (
                          <OnlineIndicator
                            isOnline={true}
                            size="sm"
                            className="absolute -bottom-0.5 -right-0.5"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <UserPlus className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  All team members are already in this conversation
                </p>
              </div>
            )}
          </ScrollArea>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => {
              setAddPeopleConversation(null);
              setSelectedMembers([]);
            }} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleAddPeople}
              disabled={selectedMembers.length === 0 || addParticipantsMutation.isPending}
              className="flex-1"
            >
              {addParticipantsMutation.isPending ? 'Adding...' : `Add ${selectedMembers.length > 0 ? `(${selectedMembers.length})` : ''}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        {isLoading || searchLoading ? (
          <>
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
          </>
        ) : displayedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
            {!searchQuery && (
              <p className="text-xs text-muted-foreground mt-1">
                Start a new conversation to chat with your team
              </p>
            )}
          </div>
        ) : (
          displayedConversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              onClick={() => onSelectConversation(conversation)}
              onDelete={() => setDeleteConversation(conversation)}
              onArchive={() => handleArchive(conversation)}
              onAddPeople={() => setAddPeopleConversation(conversation)}
              onlineParticipantCount={getOnlineParticipantCount(conversation.participantIds)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}

export default ConversationList;
