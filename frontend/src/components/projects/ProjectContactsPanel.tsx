'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Mail,
  Phone,
  Star,
  Edit2,
  Users,
  Loader2,
  Github,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  useProjectContacts,
  useAddProjectContact,
  useUpdateProjectContact,
  useRemoveProjectContact,
  useInviteContactToGitHub,
} from '@/hooks/use-project-contacts';
import { useProject } from '@/hooks/use-projects';
import { useContacts } from '@/hooks/use-contacts';
import { useSyncTeamContacts } from '@/hooks/use-team-profile';
import { toast } from 'sonner';
import type { ProjectContact, Contact, GitHubInviteStatus } from '@/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  stakeholder: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  developer: 'bg-green-500/20 text-green-400 border-green-500/30',
  reviewer: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  default: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30',
};

const GITHUB_STATUS_CONFIG: Record<GitHubInviteStatus, {
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  none: {
    label: 'Not Invited',
    color: 'text-muted-foreground',
    icon: <Github className="h-3.5 w-3.5" />,
  },
  pending: {
    label: 'Invite Pending',
    color: 'text-amber-400',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  accepted: {
    label: 'Collaborator',
    color: 'text-green-400',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  declined: {
    label: 'Declined',
    color: 'text-red-400',
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  failed: {
    label: 'Failed',
    color: 'text-red-400',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
};

interface ProjectContactsPanelProps {
  projectId: string;
}

export function ProjectContactsPanel({ projectId }: ProjectContactsPanelProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ProjectContact | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');

  const { data: project } = useProject(projectId);
  const { data: projectContacts, isLoading } = useProjectContacts(projectId);
  const { data: contactsData, isLoading: isLoadingContacts } = useContacts({
    search: searchQuery,
    limit: 10,
  });
  const addContact = useAddProjectContact(projectId);
  const updateContact = useUpdateProjectContact(projectId);
  const removeContact = useRemoveProjectContact(projectId);
  const inviteToGitHub = useInviteContactToGitHub(projectId);
  const syncTeamContacts = useSyncTeamContacts();

  const hasGitHubRepo = !!project?.githubUrl;

  const contacts = contactsData?.data || [];
  const existingContactIds = new Set(projectContacts?.map((pc: ProjectContact) => pc.contactId) || []);
  const availableContacts = contacts.filter((c: Contact) => !existingContactIds.has(c.id));

  const handleAddContact = async () => {
    if (!selectedContactId) {
      toast.error('Please select a contact');
      return;
    }
    try {
      await addContact.mutateAsync({
        contactId: selectedContactId,
        role: role || undefined,
        notes: notes || undefined,
      });
      toast.success('Contact added to project');
      setIsAddDialogOpen(false);
      setSelectedContactId(null);
      setRole('');
      setNotes('');
      setSearchQuery('');
    } catch {
      toast.error('Failed to add contact');
    }
  };

  const handleUpdateContact = async () => {
    if (!editingContact) return;
    try {
      await updateContact.mutateAsync({
        contactId: editingContact.contactId,
        data: {
          role: role || null,
          notes: notes || null,
          isPrimary: editingContact.isPrimary,
        },
      });
      toast.success('Contact updated');
      setIsEditDialogOpen(false);
      setEditingContact(null);
      setRole('');
      setNotes('');
    } catch {
      toast.error('Failed to update contact');
    }
  };

  const handleRemoveContact = async (contactId: string, contactName: string) => {
    if (!confirm(`Remove ${contactName} from this project?`)) return;
    try {
      await removeContact.mutateAsync(contactId);
      toast.success('Contact removed from project');
    } catch {
      toast.error('Failed to remove contact');
    }
  };

  const handleTogglePrimary = async (pc: ProjectContact) => {
    try {
      await updateContact.mutateAsync({
        contactId: pc.contactId,
        data: { isPrimary: !pc.isPrimary },
      });
      toast.success(pc.isPrimary ? 'Removed primary status' : 'Set as primary contact');
    } catch {
      toast.error('Failed to update contact');
    }
  };

  const handleInviteToGitHub = async (pc: ProjectContact) => {
    if (!pc.contact?.email) {
      toast.error('Contact has no email address');
      return;
    }
    try {
      const result = await inviteToGitHub.mutateAsync(pc.contactId) as { success: boolean; message?: string; error?: string };
      if (result.success) {
        toast.success(result.message || 'GitHub invite sent');
      } else {
        toast.error(result.error || result.message || 'Failed to send GitHub invite');
      }
    } catch (err: unknown) {
      const error = err as { message?: string; error?: string };
      toast.error(error?.message || error?.error || 'Failed to send GitHub invite');
    }
  };

  const openEditDialog = (pc: ProjectContact) => {
    setEditingContact(pc);
    setRole(pc.role || '');
    setNotes(pc.notes || '');
    setIsEditDialogOpen(true);
  };

  const handleSyncTeam = async () => {
    try {
      const result = await syncTeamContacts.mutateAsync();
      toast.success(`Synced ${result.created} team members to contacts`);
    } catch {
      toast.error('Failed to sync team members');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {projectContacts?.length || 0} Contact{projectContacts?.length !== 1 ? 's' : ''}
        </h3>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-accent-600 hover:bg-accent-700 text-white">
              <Plus className="h-4 w-4 mr-1" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Add Contact to Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-secondary border text-foreground"
                />
              </div>

              {isLoadingContacts ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : availableContacts.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {availableContacts.map((contact: Contact) => (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedContactId(contact.id)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedContactId === contact.id
                          ? 'bg-accent-600/20 border-accent-600'
                          : 'bg-secondary hover:bg-secondary/80'
                      }`}
                    >
                      <p className="font-medium text-foreground">{contact.name}</p>
                      <p className="text-sm text-muted-foreground">{contact.email || contact.phone || 'No contact info'}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground text-sm">
                    {searchQuery ? 'No matching contacts found' : 'No contacts available'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {searchQuery
                      ? 'Try a different search term'
                      : 'Sync your team members to make them available as contacts'}
                  </p>
                  {!searchQuery && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={handleSyncTeam}
                      disabled={syncTeamContacts.isPending}
                    >
                      {syncTeamContacts.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Sync Team Members
                    </Button>
                  )}
                </div>
              )}

              {selectedContactId && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-sm">Role (optional)</Label>
                    <Input
                      placeholder="e.g., Owner, Developer, Reviewer"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Notes (optional)</Label>
                    <Textarea
                      placeholder="Any notes about this contact's involvement..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground min-h-20"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 border text-foreground"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setSelectedContactId(null);
                    setRole('');
                    setNotes('');
                    setSearchQuery('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
                  onClick={handleAddContact}
                  disabled={!selectedContactId || addContact.isPending}
                >
                  {addContact.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Contact'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {projectContacts && projectContacts.length > 0 ? (
        <div className="space-y-2">
          {projectContacts.map((pc: ProjectContact) => (
            <Card key={pc.contactId} className="bg-secondary/50 border">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-accent-600/20 flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-accent-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground truncate">
                        {pc.contact?.name || 'Unknown Contact'}
                      </p>
                      {pc.isPrimary && (
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {pc.role && (
                        <Badge
                          variant="outline"
                          className={ROLE_COLORS[pc.role.toLowerCase()] || ROLE_COLORS.default}
                        >
                          {pc.role}
                        </Badge>
                      )}
                      {pc.contact?.email && (
                        <a
                          href={`mailto:${pc.contact.email}`}
                          className="text-xs text-muted-foreground hover:text-accent-400 flex items-center gap-1"
                        >
                          <Mail className="h-3 w-3" />
                          {pc.contact.email}
                        </a>
                      )}
                      {pc.contact?.phone && (
                        <a
                          href={`tel:${pc.contact.phone}`}
                          className="text-xs text-muted-foreground hover:text-accent-400 flex items-center gap-1"
                        >
                          <Phone className="h-3 w-3" />
                          {pc.contact.phone}
                        </a>
                      )}
                      {hasGitHubRepo && pc.githubInviteStatus && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`text-xs flex items-center gap-1 ${GITHUB_STATUS_CONFIG[pc.githubInviteStatus].color}`}>
                                {GITHUB_STATUS_CONFIG[pc.githubInviteStatus].icon}
                                <Github className="h-3 w-3" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="bg-secondary border">
                              <p>{GITHUB_STATUS_CONFIG[pc.githubInviteStatus].label}</p>
                              {pc.githubInviteError && (
                                <p className="text-xs text-red-400 mt-1">{pc.githubInviteError}</p>
                              )}
                              {pc.githubInvitedAt && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Invited: {new Date(pc.githubInvitedAt).toLocaleDateString()}
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-secondary border">
                    <DropdownMenuItem
                      onClick={() => openEditDialog(pc)}
                      className="text-foreground cursor-pointer"
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleTogglePrimary(pc)}
                      className="text-foreground cursor-pointer"
                    >
                      <Star className="mr-2 h-4 w-4" />
                      {pc.isPrimary ? 'Remove Primary' : 'Set as Primary'}
                    </DropdownMenuItem>
                    {hasGitHubRepo && pc.contact?.email && (
                      <DropdownMenuItem
                        onClick={() => handleInviteToGitHub(pc)}
                        disabled={inviteToGitHub.isPending}
                        className="text-foreground cursor-pointer"
                      >
                        {inviteToGitHub.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : pc.githubInviteStatus === 'failed' || pc.githubInviteStatus === 'declined' ? (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        ) : (
                          <Github className="mr-2 h-4 w-4" />
                        )}
                        {pc.githubInviteStatus === 'accepted'
                          ? 'Resend GitHub Invite'
                          : pc.githubInviteStatus === 'pending'
                          ? 'Resend Invite'
                          : pc.githubInviteStatus === 'failed' || pc.githubInviteStatus === 'declined'
                          ? 'Retry GitHub Invite'
                          : 'Invite to GitHub'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleRemoveContact(pc.contactId, pc.contact?.name || 'contact')}
                      className="text-red-400 cursor-pointer"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-secondary/50 border">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No contacts added yet</p>
            <p className="text-muted-foreground text-xs">Add contacts to track project stakeholders</p>
          </CardContent>
        </Card>
      )}

      {/* Edit Contact Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-card border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-muted-foreground text-sm">Role</Label>
              <Input
                placeholder="e.g., Owner, Developer, Reviewer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Notes</Label>
              <Textarea
                placeholder="Any notes about this contact's involvement..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 bg-secondary border text-foreground min-h-20"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 border text-foreground"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingContact(null);
                  setRole('');
                  setNotes('');
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
                onClick={handleUpdateContact}
                disabled={updateContact.isPending}
              >
                {updateContact.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
