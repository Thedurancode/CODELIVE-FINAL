'use client';

import { useState, useMemo } from 'react';
import { Check, Users, Search, UserCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTeamMembers } from '@/hooks/use-projects';
import type { TeamMember } from '@/types';

interface TeamMemberSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}

export function TeamMemberSelector({
  selectedIds,
  onChange,
  label = 'Team Members',
}: TeamMemberSelectorProps) {
  const { data: teamMembers = [], isLoading } = useTeamMembers();
  const [search, setSearch] = useState('');

  // Filter members based on search
  const filteredMembers = useMemo(() => {
    if (!search.trim()) return teamMembers;
    const lower = search.toLowerCase();
    return teamMembers.filter(
      (m) =>
        m.name?.toLowerCase().includes(lower) ||
        m.email?.toLowerCase().includes(lower) ||
        m.title?.toLowerCase().includes(lower)
    );
  }, [teamMembers, search]);

  // Check if all are selected
  const allSelected = teamMembers.length > 0 && selectedIds.length === teamMembers.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < teamMembers.length;

  const handleSelectAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(teamMembers.map((m) => m.id));
    }
  };

  const handleToggleMember = (memberId: string) => {
    if (selectedIds.includes(memberId)) {
      onChange(selectedIds.filter((id) => id !== memberId));
    } else {
      onChange([...selectedIds, memberId]);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getAvatarColor = (id: string) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-cyan-500',
      'bg-indigo-500',
      'bg-rose-500',
    ];
    const index = id.charCodeAt(0) % colors.length;
    return colors[index];
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label className="text-muted-foreground text-sm flex items-center gap-2">
          <Users className="h-4 w-4" />
          {label}
        </Label>
        <div className="bg-secondary/50 rounded-lg border border-border p-4">
          <div className="flex items-center justify-center py-4">
            <div className="animate-pulse flex items-center gap-2 text-muted-foreground">
              <div className="h-8 w-8 rounded-full bg-secondary" />
              <div className="h-4 w-24 bg-secondary rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground text-sm flex items-center gap-2">
        <Users className="h-4 w-4" />
        {label}
      </Label>

      <div className="bg-secondary/50 rounded-lg border border-border overflow-hidden">
        {/* Header with Select All and Search */}
        <div className="p-3 border-b border-border bg-secondary/30">
          <div className="flex items-center justify-between gap-4">
            {/* Select All */}
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-sm hover:text-accent-400 transition-colors"
            >
              <div
                className={cn(
                  'h-5 w-5 rounded border-2 flex items-center justify-center transition-all',
                  allSelected
                    ? 'bg-accent-500 border-accent-500'
                    : someSelected
                    ? 'border-accent-500 bg-accent-500/30'
                    : 'border-muted-foreground/50 hover:border-accent-500'
                )}
              >
                {(allSelected || someSelected) && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
              <span className="text-foreground font-medium">
                {allSelected ? 'Deselect All' : 'Select All'}
              </span>
              <span className="text-muted-foreground">
                ({selectedIds.length}/{teamMembers.length})
              </span>
            </button>

            {/* Search */}
            {teamMembers.length > 5 && (
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-sm bg-secondary border"
                />
              </div>
            )}
          </div>
        </div>

        {/* Member List */}
        <div className="max-h-64 overflow-y-auto">
          {filteredMembers.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {search ? 'No members found' : 'No team members available'}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredMembers.map((member) => {
                const isSelected = selectedIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => handleToggleMember(member.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 text-left transition-colors',
                      isSelected
                        ? 'bg-accent-500/10 hover:bg-accent-500/20'
                        : 'hover:bg-secondary/80'
                    )}
                  >
                    {/* Checkbox */}
                    <div
                      className={cn(
                        'h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                        isSelected
                          ? 'bg-accent-500 border-accent-500'
                          : 'border-muted-foreground/50'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>

                    {/* Avatar */}
                    {member.avatar ? (
                      <img
                        src={member.avatar}
                        alt={member.name}
                        className="h-9 w-9 rounded-full object-cover ring-2 ring-border"
                      />
                    ) : (
                      <div
                        className={cn(
                          'h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-medium ring-2 ring-border',
                          getAvatarColor(member.id)
                        )}
                      >
                        {getInitials(member.name)}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">
                          {member.name}
                        </span>
                        {member.isOnline && (
                          <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{member.email}</span>
                        {member.title && (
                          <>
                            <span className="text-border">|</span>
                            <span className="truncate">{member.title}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Role Badge */}
                    {member.role && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground flex-shrink-0">
                        {member.role}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Summary Footer */}
        {selectedIds.length > 0 && (
          <div className="p-2 border-t border-border bg-secondary/30 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Selected:</span>
            <div className="flex -space-x-2">
              {selectedIds.slice(0, 5).map((id) => {
                const member = teamMembers.find((m) => m.id === id);
                if (!member) return null;
                return member.avatar ? (
                  <img
                    key={id}
                    src={member.avatar}
                    alt={member.name}
                    title={member.name}
                    className="h-6 w-6 rounded-full object-cover ring-2 ring-background"
                  />
                ) : (
                  <div
                    key={id}
                    title={member.name}
                    className={cn(
                      'h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-medium ring-2 ring-background',
                      getAvatarColor(id)
                    )}
                  >
                    {getInitials(member.name)}
                  </div>
                );
              })}
              {selectedIds.length > 5 && (
                <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-xs text-muted-foreground ring-2 ring-background">
                  +{selectedIds.length - 5}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
