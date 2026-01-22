'use client';

/**
 * Deal Team Section Component
 *
 * Displays team members assigned to a deal/property.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Users,
  Phone,
  Mail,
  Crown,
  Briefcase,
  FileSearch,
  Gavel,
  Eye,
  UserPlus,
  ChevronRight,
} from 'lucide-react';

interface DealTeamMember {
  id: number;
  propertyId: number;
  userId: string;
  dealRole: string;
  assignedAt: string;
  isActive: boolean;
  user?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    title?: string;
    expertise?: string[];
    bio?: string;
  };
  // For contacts with team_member type
  isContact?: boolean;
  contact?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    company?: string;
  };
}

interface DealTeamSectionProps {
  propertyId: number;
  className?: string;
  compact?: boolean;
}

const ROLE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  lead: { icon: <Crown className="h-3 w-3" />, label: 'Lead', color: 'bg-amber-500' },
  acquisitions: { icon: <Briefcase className="h-3 w-3" />, label: 'Acquisitions', color: 'bg-blue-500' },
  underwriting: { icon: <FileSearch className="h-3 w-3" />, label: 'Underwriting', color: 'bg-purple-500' },
  closing: { icon: <Gavel className="h-3 w-3" />, label: 'Closing', color: 'bg-green-500' },
  support: { icon: <Users className="h-3 w-3" />, label: 'Support', color: 'bg-slate-500' },
  observer: { icon: <Eye className="h-3 w-3" />, label: 'Observer', color: 'bg-gray-400' },
};

export function DealTeamSection({ propertyId, className, compact = false }: DealTeamSectionProps) {
  const [selectedMember, setSelectedMember] = useState<DealTeamMember | null>(null);

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['deal-team', propertyId],
    queryFn: async () => {
      // Fetch both deal team members and property contacts with team_member role
      const [teamResponse, contactsResponse] = await Promise.all([
        api.get<DealTeamMember[]>(`/api/listings/${propertyId}/team`).catch(() => []),
        api.get<{ id: string; contactId: string; role: string; createdAt: string; contact?: { id: string; name: string; email?: string; phone?: string; company?: string } }[]>(
          `/api/listings/${propertyId}/contacts`
        ).catch(() => []),
      ]);

      // Get regular team members
      const team = Array.isArray(teamResponse) ? teamResponse : [];

      // Get contacts array
      const contacts = Array.isArray(contactsResponse)
        ? contactsResponse
        : (contactsResponse && typeof contactsResponse === 'object' && 'data' in contactsResponse)
          ? (contactsResponse as { data: typeof contactsResponse }).data
          : [];

      // Filter contacts with team_member role and transform to DealTeamMember format
      const teamContacts: DealTeamMember[] = (contacts || [])
        .filter((c: { role: string }) => c.role === 'team_member')
        .map((c: { id: string; contactId: string; role: string; createdAt: string; contact?: { id: string; name: string; email?: string; phone?: string; company?: string } }) => ({
          id: parseInt(c.id) || Date.now(),
          propertyId,
          userId: c.contactId,
          dealRole: 'support', // Default role for team member contacts
          assignedAt: c.createdAt || new Date().toISOString(),
          isActive: true,
          isContact: true,
          contact: c.contact,
          user: c.contact ? {
            id: c.contact.id,
            name: c.contact.name,
            email: c.contact.email || '',
            phone: c.contact.phone,
          } : undefined,
        }));

      return [...team, ...teamContacts];
    },
    enabled: !!propertyId,
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleConfig = (role: string) => {
    return ROLE_CONFIG[role] || ROLE_CONFIG.support;
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Deal Team
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-24 bg-muted rounded" />
                  <div className="h-2 w-16 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!teamMembers || teamMembers.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Deal Team
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No team members assigned</p>
            <Button variant="outline" size="sm" className="mt-2">
              <UserPlus className="h-4 w-4 mr-2" />
              Assign Team Member
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by role priority
  const rolePriority = ['lead', 'acquisitions', 'underwriting', 'closing', 'support', 'observer'];
  const sortedMembers = [...teamMembers].sort(
    (a, b) => rolePriority.indexOf(a.dealRole) - rolePriority.indexOf(b.dealRole)
  );

  if (compact) {
    return (
      <div className={className}>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground mr-1">Team:</span>
            {sortedMembers.slice(0, 4).map((member) => {
              const roleConfig = getRoleConfig(member.dealRole);
              return (
                <Tooltip key={member.id}>
                  <TooltipTrigger asChild>
                    <div className="relative">
                      <Avatar className="h-7 w-7 border-2 border-background -ml-1 first:ml-0 cursor-pointer">
                        <AvatarImage src={member.user?.avatar} />
                        <AvatarFallback className="text-xs">
                          {member.user?.name ? getInitials(member.user.name) : '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ${roleConfig.color} flex items-center justify-center`}>
                        {roleConfig.icon}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{member.user?.name}</p>
                    <p className="text-xs text-muted-foreground">{roleConfig.label}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {sortedMembers.length > 4 && (
              <Badge variant="secondary" className="text-xs ml-1">
                +{sortedMembers.length - 4}
              </Badge>
            )}
          </div>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Deal Team
          </span>
          <Badge variant="secondary" className="text-xs">
            {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-auto max-h-[300px]">
          <div className="space-y-3">
            {sortedMembers.map((member) => {
              const roleConfig = getRoleConfig(member.dealRole);
              return (
                <Dialog key={member.id}>
                  <DialogTrigger asChild>
                    <div
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors group"
                      onClick={() => setSelectedMember(member)}
                    >
                      <div className="relative">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={member.user?.avatar} />
                          <AvatarFallback>
                            {member.user?.name ? getInitials(member.user.name) : '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ${roleConfig.color} flex items-center justify-center border-2 border-background`}>
                          {roleConfig.icon}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{member.user?.name}</p>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0"
                          >
                            {roleConfig.label}
                          </Badge>
                          {member.user?.title && (
                            <span className="text-xs text-muted-foreground truncate">
                              {member.user.title}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={member.user?.avatar} />
                          <AvatarFallback className="text-lg">
                            {member.user?.name ? getInitials(member.user.name) : '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span>{member.user?.name}</span>
                          <p className="text-sm font-normal text-muted-foreground">
                            {member.user?.title || roleConfig.label}
                          </p>
                        </div>
                      </DialogTitle>
                      <DialogDescription className="sr-only">
                        Team member details
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 mt-4">
                      <div className="flex items-center gap-3">
                        <Badge className={roleConfig.color}>
                          {roleConfig.icon}
                          <span className="ml-1">{roleConfig.label}</span>
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Assigned {new Date(member.assignedAt).toLocaleDateString()}
                        </span>
                      </div>

                      {member.user?.bio && (
                        <div>
                          <h4 className="text-sm font-medium mb-1">About</h4>
                          <p className="text-sm text-muted-foreground">{member.user.bio}</p>
                        </div>
                      )}

                      {member.user?.expertise && member.user.expertise.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Expertise</h4>
                          <div className="flex flex-wrap gap-1">
                            {member.user.expertise.map((exp) => (
                              <Badge key={exp} variant="secondary" className="text-xs">
                                {exp.replace(/_/g, ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-4 border-t">
                        {member.user?.email && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={`mailto:${member.user.email}`}>
                              <Mail className="h-4 w-4 mr-2" />
                              Email
                            </a>
                          </Button>
                        )}
                        {member.user?.phone && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={`tel:${member.user.phone}`}>
                              <Phone className="h-4 w-4 mr-2" />
                              Call
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default DealTeamSection;
