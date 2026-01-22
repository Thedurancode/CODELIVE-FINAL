'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  User,
  Building2,
  Mail,
  Phone,
  Loader2,
  Users,
  Check,
  X,
} from 'lucide-react';
import { useContacts } from '@/hooks/use-contacts';
import { cn } from '@/lib/utils';
import type { Contact, ContactType } from '@/types';

interface ContactPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (contacts: Contact[]) => void;
  selectedContacts?: Contact[];
  mode?: 'single' | 'multiple';
}

const contactTypes: { value: string; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'broker', label: 'Brokers' },
  { value: 'buyer', label: 'Buyers' },
  { value: 'seller', label: 'Sellers' },
  { value: 'wholesaler', label: 'Wholesalers' },
  { value: 'other', label: 'Other' },
];

function getContactTypeColor(type: ContactType): string {
  switch (type) {
    case 'broker':
      return 'bg-blue-600';
    case 'buyer':
      return 'bg-green-600';
    case 'seller':
      return 'bg-purple-600';
    case 'wholesaler':
      return 'bg-orange-600';
    default:
      return 'bg-zinc-600';
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ContactPicker({
  open,
  onClose,
  onSelect,
  selectedContacts = [],
  mode = 'multiple',
}: ContactPickerProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<string, Contact>>(
    () => new Map(selectedContacts.map(c => [c.id, c]))
  );

  const { data, isLoading } = useContacts({
    page,
    limit: 50,
    search: search || undefined,
    type: typeFilter !== 'all' ? (typeFilter as ContactType) : undefined,
  });

  const contacts = data?.data || [];
  const pagination = data?.pagination;

  // Filter contacts that have email addresses
  const contactsWithEmail = useMemo(() => {
    return contacts.filter(c => c.email);
  }, [contacts]);

  const handleToggleContact = (contact: Contact) => {
    if (mode === 'single') {
      const newSelected = new Map<string, Contact>();
      newSelected.set(contact.id, contact);
      setSelected(newSelected);
      onSelect([contact]);
      onClose();
      return;
    }

    const newSelected = new Map(selected);
    if (newSelected.has(contact.id)) {
      newSelected.delete(contact.id);
    } else {
      newSelected.set(contact.id, contact);
    }
    setSelected(newSelected);
  };

  const handleConfirm = () => {
    onSelect(Array.from(selected.values()));
    onClose();
  };

  const handleClear = () => {
    setSelected(new Map());
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl h-[80vh] flex flex-col bg-card border">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-accent-500" />
            Select Recipients
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 bg-secondary border text-foreground"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40 bg-secondary border text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {contactTypes.map((type) => (
                <SelectItem key={type.value} value={type.value} className="text-foreground">
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Selected count */}
        {selected.size > 0 && mode === 'multiple' && (
          <div className="flex items-center justify-between py-2 px-3 bg-accent-600/20 border border-accent-600/30 rounded-lg shrink-0">
            <span className="text-sm text-accent-400">
              {selected.size} contact{selected.size !== 1 ? 's' : ''} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground h-7"
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        )}

        {/* Contact list */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : contactsWithEmail.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mb-3" />
              <p className="text-lg">No contacts found</p>
              <p className="text-sm">Try adjusting your search or add contacts with email addresses</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {contactsWithEmail.map((contact) => {
                const isSelected = selected.has(contact.id);

                return (
                  <button
                    key={contact.id}
                    onClick={() => handleToggleContact(contact)}
                    className={cn(
                      'flex items-center gap-4 p-3 rounded-lg border text-left transition-all',
                      isSelected
                        ? 'bg-accent-600/20 border-accent-600/50'
                        : 'bg-secondary/50 border hover:bg-secondary'
                    )}
                  >
                    <div className={cn(
                      'shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
                      isSelected ? 'bg-accent-600' : getContactTypeColor(contact.type)
                    )}>
                      {isSelected ? (
                        <Check className="h-5 w-5 text-foreground" />
                      ) : (
                        <span className="text-sm font-medium text-foreground">
                          {getInitials(contact.name)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          'text-sm font-medium truncate',
                          isSelected ? 'text-foreground' : 'text-foreground'
                        )}>
                          {contact.name}
                        </p>
                        <Badge
                          variant="secondary"
                          className="text-xs bg-zinc-700 text-foreground capitalize"
                        >
                          {contact.type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          <span className="truncate max-w-[200px]">{contact.email}</span>
                        </div>
                        {contact.phone && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{contact.phone}</span>
                          </div>
                        )}
                        {contact.company && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span className="truncate max-w-[150px]">{contact.company}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border shrink-0">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="text-muted-foreground"
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {pagination.totalPages} ({pagination.total} contacts)
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page === pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
              className="text-muted-foreground"
            >
              Next
            </Button>
          </div>
        )}

        {mode === 'multiple' && (
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={onClose} className="text-muted-foreground">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="bg-accent-600 hover:bg-accent-700"
            >
              Add {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
