'use client';

import { useState, useEffect } from 'react';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Plus,
  User,
  Building2,
  Mail,
  Phone,
  Loader2,
  Check,
  X,
  UserPlus,
  ChevronRight,
} from 'lucide-react';
import { useContacts, useCreateContact } from '@/hooks/use-contacts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Contact, ContactType } from '@/types';

const CONTACT_TYPES: { value: ContactType; label: string; color: string }[] = [
  { value: 'wholesaler', label: 'Wholesaler', color: 'bg-orange-600' },
  { value: 'seller', label: 'Seller', color: 'bg-purple-600' },
  { value: 'broker', label: 'Broker', color: 'bg-blue-600' },
  { value: 're_agent', label: 'RE Agent', color: 'bg-cyan-600' },
  { value: 'buyer', label: 'Buyer', color: 'bg-green-600' },
  { value: 'attorney', label: 'Attorney', color: 'bg-amber-600' },
  { value: 'other', label: 'Other', color: 'bg-zinc-600' },
];

function getContactTypeColor(type: ContactType): string {
  return CONTACT_TYPES.find(t => t.value === type)?.color || 'bg-zinc-600';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface DealContactSelectorProps {
  selectedContact: Contact | null;
  onContactSelect: (contact: Contact | null) => void;
  label?: string;
  defaultType?: ContactType;
  placeholder?: string;
}

export function DealContactSelector({
  selectedContact,
  onContactSelect,
  label = 'Contact',
  defaultType = 'wholesaler',
  placeholder = 'Select or create a contact',
}: DealContactSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Create contact form state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ContactType>(defaultType);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');

  const { data, isLoading } = useContacts({
    page,
    limit: 20,
    search: search || undefined,
    type: typeFilter !== 'all' ? (typeFilter as ContactType) : undefined,
    status: 'active',
  });

  const createContact = useCreateContact();

  const contacts = data?.data || [];
  const pagination = data?.pagination;

  const resetForm = () => {
    setNewName('');
    setNewType(defaultType);
    setNewEmail('');
    setNewPhone('');
    setNewCompany('');
  };

  const handleSelectContact = (contact: Contact) => {
    onContactSelect(contact);
    setIsOpen(false);
    setMode('search');
    setSearch('');
  };

  const handleCreateContact = async () => {
    if (!newName.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      const contact = await createContact.mutateAsync({
        name: newName.trim(),
        type: newType,
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        company: newCompany.trim() || undefined,
        status: 'active',
      });

      onContactSelect(contact);
      setIsOpen(false);
      setMode('search');
      resetForm();
      toast.success('Contact created and selected');
    } catch (error) {
      toast.error('Failed to create contact');
    }
  };

  const handleClearContact = () => {
    onContactSelect(null);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setMode('search');
      setSearch('');
      resetForm();
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground text-sm">{label}</Label>

      {selectedContact ? (
        // Show selected contact
        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary border">
          <div className={cn(
            'shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
            getContactTypeColor(selectedContact.type)
          )}>
            <span className="text-sm font-medium text-white">
              {getInitials(selectedContact.name)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground truncate">
                {selectedContact.name}
              </p>
              <Badge variant="secondary" className="text-xs capitalize">
                {selectedContact.type.replace('_', ' ')}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {selectedContact.email && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {selectedContact.email}
                </span>
              )}
              {selectedContact.phone && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {selectedContact.phone}
                </span>
              )}
              {selectedContact.company && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {selectedContact.company}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              Change
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClearContact}
              className="text-muted-foreground hover:text-red-400 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        // Show select button
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsOpen(true)}
          className="w-full justify-start text-muted-foreground border-dashed"
        >
          <UserPlus className="h-4 w-4 mr-2" />
          {placeholder}
        </Button>
      )}

      {/* Contact Selection Dialog */}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-xl max-h-[80vh] flex flex-col bg-card border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <User className="h-5 w-5 text-accent-500" />
              {mode === 'search' ? 'Select Contact' : 'Create New Contact'}
            </DialogTitle>
          </DialogHeader>

          {mode === 'search' ? (
            <>
              {/* Search & Filter */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or company..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-9 bg-secondary border text-foreground"
                    autoFocus
                  />
                </div>
                <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-36 bg-secondary border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    <SelectItem value="all" className="text-foreground">All Types</SelectItem>
                    {CONTACT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-foreground">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Create New Button */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMode('create');
                  // Pre-fill name from search if it looks like a name
                  if (search && !search.includes('@') && contacts.length === 0) {
                    setNewName(search);
                  }
                }}
                className="justify-start border-dashed text-accent-400 hover:text-accent-300 hover:bg-accent-600/10"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Contact
                <ChevronRight className="h-4 w-4 ml-auto" />
              </Button>

              {/* Contact List */}
              <ScrollArea className="flex-1 -mx-6 px-6 min-h-[200px]">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <User className="h-12 w-12 mb-3" />
                    <p className="text-lg">No contacts found</p>
                    <p className="text-sm">Try a different search or create a new contact</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => handleSelectContact(contact)}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-secondary/50 hover:bg-secondary w-full text-left transition-colors"
                      >
                        <div className={cn(
                          'shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
                          getContactTypeColor(contact.type)
                        )}>
                          <span className="text-sm font-medium text-white">
                            {getInitials(contact.name)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">
                              {contact.name}
                            </p>
                            <Badge variant="secondary" className="text-xs capitalize">
                              {contact.type.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {contact.email && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                <span className="truncate max-w-[150px]">{contact.email}</span>
                              </span>
                            )}
                            {contact.phone && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </span>
                            )}
                            {contact.company && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                <span className="truncate max-w-[100px]">{contact.company}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="text-muted-foreground"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {pagination.totalPages}
                  </span>
                  <Button
                    type="button"
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
            </>
          ) : (
            // Create Contact Form
            <div className="space-y-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode('search')}
                className="text-muted-foreground -ml-2"
              >
                <ChevronRight className="h-4 w-4 mr-1 rotate-180" />
                Back to search
              </Button>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-muted-foreground text-sm">Name *</Label>
                  <Input
                    placeholder="John Doe"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1 bg-secondary border text-foreground"
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Type</Label>
                  <Select value={newType} onValueChange={(v) => setNewType(v as ContactType)}>
                    <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border">
                      {CONTACT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value} className="text-foreground">
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Company</Label>
                  <Input
                    placeholder="ABC Properties LLC"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Email</Label>
                  <Input
                    type="email"
                    placeholder="john@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Phone</Label>
                  <Input
                    placeholder="(555) 123-4567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setMode('search')}
                  className="text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateContact}
                  disabled={!newName.trim() || createContact.isPending}
                  className="bg-accent-600 hover:bg-accent-700"
                >
                  {createContact.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Create & Select
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
