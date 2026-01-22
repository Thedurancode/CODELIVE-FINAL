'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Users,
  UserPlus,
  RefreshCw,
  Building2,
  Mail,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useOrganization,
  useTeamMembers,
  useInviteTeamMember,
  useSyncTeamContacts,
  TEAM_ROLE_OPTIONS,
} from '@/hooks/use-team-profile';

export default function TeamManagement() {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('team_member');

  const { data: organization, isLoading: orgLoading, error: orgError } = useOrganization();
  const { data: teamMembers, isLoading: membersLoading } = useTeamMembers();
  const inviteMember = useInviteTeamMember();
  const syncContacts = useSyncTeamContacts();

  const handleInvite = async () => {
    if (!inviteEmail) {
      toast.error('Please enter an email address');
      return;
    }

    try {
      await inviteMember.mutateAsync({
        email: inviteEmail,
        role: inviteRole,
      });
      toast.success('Team member invited successfully');
      setIsInviteDialogOpen(false);
      setInviteEmail('');
      setInviteRole('team_member');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to invite team member');
    }
  };

  const handleSyncContacts = async () => {
    try {
      const result = await syncContacts.mutateAsync();
      toast.success(`Synced ${result.created} contacts (${result.skipped} already existed)`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync contacts');
    }
  };

  // Show error state if no organization
  if (orgError || (!orgLoading && !organization)) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Manage your team and organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-foreground">No Organization Found</p>
              <p className="text-xs text-muted-foreground">
                Please log out and log back in to create your organization.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-card-foreground flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization & Team
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Manage your organization members and sync them as contacts
            </CardDescription>
          </div>
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent-600 hover:bg-accent-700">
                <UserPlus className="mr-2 h-4 w-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Add an existing user to your organization by email. They must already have an account.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="teammate@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {TEAM_ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleInvite}
                  disabled={inviteMember.isPending || !inviteEmail}
                  className="bg-accent-600 hover:bg-accent-700"
                >
                  {inviteMember.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Inviting...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Invite
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Organization Info */}
        {orgLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading organization...
          </div>
        ) : organization ? (
          <div className="p-4 rounded-lg bg-secondary/50 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-medium text-foreground">{organization.name}</p>
                <p className="text-sm text-muted-foreground">
                  {organization.memberCount} member{organization.memberCount !== 1 ? 's' : ''}
                </p>
              </div>
              <Badge variant="outline" className="border-accent-500/50 text-accent-500">
                {organization.plan.charAt(0).toUpperCase() + organization.plan.slice(1)} Plan
              </Badge>
            </div>
          </div>
        ) : null}

        {/* Team Members */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Members
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncContacts}
              disabled={syncContacts.isPending}
            >
              {syncContacts.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync to Contacts
            </Button>
          </div>

          {membersLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading team members...
            </div>
          ) : teamMembers && teamMembers.length > 0 ? (
            <div className="space-y-2">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent-500/20 flex items-center justify-center">
                      <span className="text-accent-500 font-medium">
                        {member.name?.charAt(0).toUpperCase() || member.email.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {member.role.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No team members yet</p>
              <p className="text-xs">Invite members to collaborate on projects</p>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <CheckCircle className="h-5 w-5 text-blue-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Team Contacts Sync</p>
            <p className="text-xs text-muted-foreground">
              Click &quot;Sync to Contacts&quot; to make all team members available as contacts.
              This allows you to add them to projects and other workflows.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
