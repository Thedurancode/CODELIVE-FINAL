'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Droppable } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Plus,
  X,
  Mail,
  Phone,
  Building2,
  Users,
  Search,
  Loader2,
  MapPin,
  FileText,
  Tag,
  Shield,
  Clock,
  ExternalLink,
  Copy,
  CheckCircle2,
  Edit,
  Save,
  UserPlus,
  ChevronLeft,
  Paperclip,
  Briefcase,
  Home,
  DollarSign,
  TrendingUp,
  Scale,
  Key,
  UserCircle,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useDocumentDrop } from './DocumentDropContext';
import { cn } from '@/lib/utils';
import {
  usePropertyContacts,
  useAssignContact,
  useUnassignContact,
} from '@/hooks/use-property-contacts';
import { useContacts, useSearchContacts, useCreateContact, useUpdateContact } from '@/hooks/use-contacts';
import type { ContactType } from '@/types';
import { toast } from 'sonner';
import type { Contact, ContactRole, PropertyContact } from '@/types';

const ROLE_COLORS: Record<ContactRole, string> = {
  agent: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  broker: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  seller: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  wholesaler: 'bg-green-500/20 text-green-400 border-green-500/30',
  attorney: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  re_agent: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  buyer: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  team_member: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  other: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30',
};

const ROLE_LABELS: Record<ContactRole, string> = {
  agent: 'Agent',
  broker: 'Broker',
  seller: 'Seller',
  wholesaler: 'Wholesaler',
  attorney: 'Attorney',
  re_agent: 'RE Agent',
  buyer: 'Buyer',
  team_member: 'Team Member',
  other: 'Other',
};

interface PropertyContactsSectionProps {
  propertyId: string;
  externalDialogOpen?: boolean;
  onExternalDialogChange?: (open: boolean) => void;
  preselectedRole?: ContactRole;
}

// Contact types for the dropdown
const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: 'broker', label: 'Broker' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'attorney', label: 'Attorney' },
  { value: 're_agent', label: 'RE Agent' },
  { value: 'team_member', label: 'Team Member' },
  { value: 'other', label: 'Other' },
];

// Contact type details with icons and descriptions
const CONTACT_TYPE_INFO: Record<ContactType, { icon: React.ComponentType<{ className?: string }>; label: string; description: string; color: string }> = {
  broker: {
    icon: Briefcase,
    label: 'Broker',
    description: 'Real estate brokerage or firm',
    color: 'from-blue-500 to-blue-600',
  },
  buyer: {
    icon: Home,
    label: 'Buyer',
    description: 'Property buyer or investor',
    color: 'from-pink-500 to-pink-600',
  },
  seller: {
    icon: DollarSign,
    label: 'Seller',
    description: 'Property seller or owner',
    color: 'from-amber-500 to-amber-600',
  },
  wholesaler: {
    icon: TrendingUp,
    label: 'Wholesaler',
    description: 'Wholesale deal coordinator',
    color: 'from-green-500 to-green-600',
  },
  attorney: {
    icon: Scale,
    label: 'Attorney',
    description: 'Legal counsel or title attorney',
    color: 'from-indigo-500 to-indigo-600',
  },
  re_agent: {
    icon: Key,
    label: 'RE Agent',
    description: 'Licensed real estate agent',
    color: 'from-teal-500 to-teal-600',
  },
  team_member: {
    icon: Users,
    label: 'Team Member',
    description: 'Internal team member or employee',
    color: 'from-purple-500 to-purple-600',
  },
  other: {
    icon: UserCircle,
    label: 'Other',
    description: 'Other contact type',
    color: 'from-zinc-500 to-zinc-600',
  },
};

// Empty contact form state
const emptyContactForm = {
  name: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  type: 'other' as ContactType,
  notes: '',
  licenseNumber: '',
  licenseState: '',
};

export function PropertyContactsSection({
  propertyId,
  externalDialogOpen,
  onExternalDialogChange,
  preselectedRole: externalPreselectedRole,
}: PropertyContactsSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Merge external and internal dialog state
  const dialogOpen = externalDialogOpen !== undefined ? externalDialogOpen : isDialogOpen;
  const setDialogOpen = (open: boolean) => {
    setIsDialogOpen(open);
    onExternalDialogChange?.(open);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedRole, setSelectedRole] = useState<ContactRole>('other');

  // Set preselected role when external role is provided
  useEffect(() => {
    if (externalPreselectedRole && dialogOpen) {
      setSelectedRole(externalPreselectedRole);
    }
  }, [externalPreselectedRole, dialogOpen]);
  const [viewingContact, setViewingContact] = useState<PropertyContact | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [createModeStep, setCreateModeStep] = useState<'select-type' | 'fill-form'>('select-type');
  const [contactForm, setContactForm] = useState(emptyContactForm);

  // Document drop context for receiving dragged documents
  const documentDropContext = useDocumentDrop();
  const {
    selectedDocuments,
    isDragging,
    registerContact,
    unregisterContact,
  } = documentDropContext || {
    selectedDocuments: [],
    isDragging: false,
    registerContact: () => {},
    unregisterContact: () => {},
  };

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  // Format date helper
  const formatDate = (date?: string | Date) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const queryClient = useQueryClient();
  const { data: assignedContactsResponse, isLoading, refetch: refetchContacts } = usePropertyContacts(propertyId);
  const { data: searchResults, isLoading: isSearching } = useSearchContacts(searchQuery, 10);
  const { data: allContacts } = useContacts({ limit: 50 });
  const assignContact = useAssignContact();
  const unassignContact = useUnassignContact();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();

  // Start editing a contact
  const startEdit = (contact: Contact) => {
    setContactForm({
      name: contact.name || '',
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      address: contact.address || '',
      city: contact.city || '',
      state: contact.state || '',
      zip: contact.zip || '',
      type: contact.type || 'other',
      notes: contact.notes || '',
      licenseNumber: contact.licenseNumber || '',
      licenseState: contact.licenseState || '',
    });
    setIsEditMode(true);
  };

  // Start creating a new contact
  const startCreate = () => {
    setContactForm(emptyContactForm);
    setCreateModeStep('select-type');
    setIsCreateMode(true);
  };

  // Save contact (create or update)
  const handleSaveContact = async () => {
    // Validate required fields
    if (!contactForm.name.trim() && !contactForm.firstName.trim()) {
      toast.error('Name is required');
      return;
    }

    const contactData = {
      ...contactForm,
      name: contactForm.name || `${contactForm.firstName} ${contactForm.lastName}`.trim(),
    };

    try {
      if (isCreateMode) {
        const newContact = await createContact.mutateAsync(contactData);
        toast.success('Contact created successfully');
        // Auto-select the new contact for assignment
        setSelectedContact(newContact);
        setIsCreateMode(false);
      } else if (isEditMode && viewingContact?.contact) {
        await updateContact.mutateAsync({
          id: viewingContact.contact.id,
          data: contactData,
        });
        toast.success('Contact updated successfully');
        setIsEditMode(false);
        // Refetch to get updated data
        refetchContacts();
      }
    } catch {
      toast.error(isCreateMode ? 'Failed to create contact' : 'Failed to update contact');
    }
  };

  // Cancel edit/create
  const cancelEdit = () => {
    setIsEditMode(false);
    setIsCreateMode(false);
    setContactForm(emptyContactForm);
  };

  // API returns { success: true, data: [...] } for paginated endpoints
  // Helper to unwrap API response - handles both direct arrays and wrapped responses
  const unwrapResponse = <T,>(response: unknown): T[] => {
    if (!response) return [];
    if (Array.isArray(response)) return response as T[];
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = (response as { data: unknown }).data;
      if (Array.isArray(data)) return data as T[];
    }
    return [];
  };

  const contacts = unwrapResponse<PropertyContact>(assignedContactsResponse);
  const searchedContacts = unwrapResponse<Contact>(searchResults);
  const allContactsList = unwrapResponse<Contact>(allContacts);
  const availableContacts = searchQuery.length >= 2 ? searchedContacts : allContactsList;

  // Filter out already assigned contacts
  const assignedIds = new Set(contacts.map((pc: PropertyContact) => pc.contactId));
  const filteredContacts = availableContacts.filter(
    (c: Contact) => !assignedIds.has(c.id)
  );

  const handleAssign = async () => {
    if (!selectedContact) return;

    try {
      await assignContact.mutateAsync({
        propertyId,
        contactId: selectedContact.id,
        role: selectedRole,
      });
      toast.success(`${selectedContact.name} assigned as ${ROLE_LABELS[selectedRole]}`);

      // Invalidate checklist queries to refresh the checklist
      const propertyIdNum = parseInt(propertyId, 10);
      if (!isNaN(propertyIdNum)) {
        queryClient.invalidateQueries({ queryKey: ['property-checklist', propertyIdNum] });
        queryClient.invalidateQueries({ queryKey: ['property-checklist-summary', propertyIdNum] });
      }

      setDialogOpen(false);
      setSelectedContact(null);
      setSearchQuery('');
    } catch {
      toast.error('Failed to assign contact');
    }
  };

  const handleUnassign = async (contactId: string, contactName: string) => {
    try {
      await unassignContact.mutateAsync({ propertyId, contactId });
      toast.success(`${contactName} removed from deal`);

      // Invalidate checklist queries to refresh the checklist
      const propertyIdNum = parseInt(propertyId, 10);
      if (!isNaN(propertyIdNum)) {
        queryClient.invalidateQueries({ queryKey: ['property-checklist', propertyIdNum] });
        queryClient.invalidateQueries({ queryKey: ['property-checklist-summary', propertyIdNum] });
      }
    } catch {
      toast.error('Failed to remove contact');
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-card border">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-foreground text-lg">
              <Users className="h-5 w-5 text-accent-400" />
              Assigned Contacts
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="bg-accent-600 hover:bg-accent-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <div className={cn(
              "text-center py-6 text-muted-foreground rounded-lg transition-colors",
              isDragging && selectedDocuments.length > 0 && "border-2 border-dashed border"
            )}>
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No contacts assigned</p>
              <p className="text-xs mt-1">Click &quot;Add&quot; to assign contacts to this deal</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {contacts.map((pc: PropertyContact) => (
                <ContactDropZone
                  key={pc.id}
                  contact={pc}
                  isDragging={isDragging}
                  selectedDocuments={selectedDocuments}
                  registerContact={registerContact}
                  unregisterContact={unregisterContact}
                  onViewContact={() => setViewingContact(pc)}
                  onUnassign={() => handleUnassign(pc.contactId, pc.contact?.name || 'Contact')}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Contact Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setIsCreateMode(false);
          setCreateModeStep('select-type');
          setContactForm(emptyContactForm);
        }
      }}>
        <DialogContent className="bg-card border max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b pb-4 mb-2">
            <DialogTitle className="text-foreground flex items-center gap-3 text-2xl font-bold">
              {isCreateMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (createModeStep === 'fill-form') {
                      setCreateModeStep('select-type');
                    } else {
                      setIsCreateMode(false);
                    }
                  }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              )}
              {isCreateMode
                ? (createModeStep === 'select-type' ? 'Select Contact Type' : 'Create New Contact')
                : 'Assign Contact to Deal'}
            </DialogTitle>
          </DialogHeader>

          {isCreateMode ? (
            createModeStep === 'select-type' ? (
              /* Contact Type Selection Screen */
              <div className="space-y-5">
                <p className="text-muted-foreground text-base text-center">
                  Choose the type of contact you want to create
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(CONTACT_TYPE_INFO).map(([type, info]) => {
                    const Icon = info.icon;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setContactForm({ ...contactForm, type: type as ContactType });
                          setCreateModeStep('fill-form');
                        }}
                        className="group relative p-6 rounded-xl border-2 border-border/50 bg-secondary/30 hover:border-accent-500 hover:bg-accent/5 transition-all hover:shadow-lg text-left"
                      >
                        <div className={`absolute inset-0 bg-gradient-to-br ${info.color} opacity-0 group-hover:opacity-10 rounded-xl transition-opacity`} />
                        <div className="relative">
                          <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${info.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                            <Icon className="h-7 w-7 text-white" />
                          </div>
                          <h3 className="font-bold text-lg text-foreground mb-1">{info.label}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">{info.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Create New Contact Form */
              <div className="space-y-4">
                {/* Selected Type Badge */}
                {contactForm.type && CONTACT_TYPE_INFO[contactForm.type] && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-accent/5 border-2 border-accent-500/30">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${CONTACT_TYPE_INFO[contactForm.type].color} flex items-center justify-center flex-shrink-0`}>
                      {(() => {
                        const Icon = CONTACT_TYPE_INFO[contactForm.type].icon;
                        return <Icon className="h-6 w-6 text-white" />;
                      })()}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Creating</p>
                      <p className="font-bold text-lg text-foreground">{CONTACT_TYPE_INFO[contactForm.type].label} Contact</p>
                    </div>
                  </div>
                )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">First Name</Label>
                  <Input
                    value={contactForm.firstName}
                    onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Last Name</Label>
                  <Input
                    value={contactForm.lastName}
                    onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Full Name *</Label>
                <Input
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="Or enter full name directly"
                  className="mt-1 bg-secondary border text-foreground"
                />
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Contact Type</Label>
                <Select
                  value={contactForm.type}
                  onValueChange={(v) => setContactForm({ ...contactForm, type: v as ContactType })}
                >
                  <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    {CONTACT_TYPES.map(({ value, label }) => (
                      <SelectItem key={value} value={value} className="text-foreground">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">Email</Label>
                  <Input
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Phone</Label>
                  <Input
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Company</Label>
                <Input
                  value={contactForm.company}
                  onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                  className="mt-1 bg-secondary border text-foreground"
                />
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Address</Label>
                <Input
                  value={contactForm.address}
                  onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                  className="mt-1 bg-secondary border text-foreground"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">City</Label>
                  <Input
                    value={contactForm.city}
                    onChange={(e) => setContactForm({ ...contactForm, city: e.target.value })}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">State</Label>
                  <Input
                    value={contactForm.state}
                    onChange={(e) => setContactForm({ ...contactForm, state: e.target.value })}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">ZIP</Label>
                  <Input
                    value={contactForm.zip}
                    onChange={(e) => setContactForm({ ...contactForm, zip: e.target.value })}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
              </div>

              {(contactForm.type === 'broker' || contactForm.type === 're_agent' || contactForm.type === 'attorney') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      {contactForm.type === 'attorney' ? 'Bar Number' : 'License Number'}
                    </Label>
                    <Input
                      value={contactForm.licenseNumber}
                      onChange={(e) => setContactForm({ ...contactForm, licenseNumber: e.target.value })}
                      className="mt-1 bg-secondary border text-foreground"
                      placeholder={contactForm.type === 'attorney' ? 'Enter bar number' : 'Enter license number'}
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      {contactForm.type === 'attorney' ? 'Bar State' : 'License State'}
                    </Label>
                    <Input
                      value={contactForm.licenseState}
                      onChange={(e) => setContactForm({ ...contactForm, licenseState: e.target.value })}
                      className="mt-1 bg-secondary border text-foreground"
                      placeholder="State abbreviation"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground text-xs">Notes</Label>
                <Textarea
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                  className="mt-1 bg-secondary border text-foreground min-h-[80px]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 border text-foreground"
                  onClick={() => setIsCreateMode(false)}
                >
                  Back
                </Button>
                <Button
                  className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
                  onClick={handleSaveContact}
                  disabled={createContact.isPending}
                >
                  {createContact.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Create Contact
                    </>
                  )}
                </Button>
              </div>
            </div>
            )
          ) : (
            /* Search and Select Contact */
            <div className="space-y-5">
              {/* Create New Button */}
              <Button
                variant="outline"
                size="lg"
                className="w-full h-14 border-2 border-dashed text-base font-semibold text-muted-foreground hover:text-foreground hover:border-accent-500 hover:bg-accent/5"
                onClick={startCreate}
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Create New Contact
              </Button>

              {/* Search */}
              <div>
                <Label className="text-muted-foreground text-base font-medium">Search Existing Contacts</Label>
                <div className="relative mt-2">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, company..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 h-12 text-base bg-secondary border text-foreground"
                  />
                </div>
              </div>

              {/* Contact List */}
              <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                {isSearching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-base">
                    {searchQuery ? 'No contacts found' : 'No contacts available'}
                  </p>
                ) : (
                  filteredContacts.map((contact: Contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => {
                        setSelectedContact(contact);
                        if (contact.type && contact.type in ROLE_LABELS) {
                          setSelectedRole(contact.type as ContactRole);
                        }
                      }}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                        selectedContact?.id === contact.id
                          ? 'bg-accent-600/20 border-accent-500 shadow-lg'
                          : 'bg-secondary/50 border-border/50 hover:border-accent-500/30 hover:bg-accent/5'
                      }`}
                    >
                      <p className="font-bold text-lg text-foreground mb-2">{contact.name}</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`${ROLE_COLORS[contact.type as ContactRole] || 'bg-zinc-500/20 text-muted-foreground'} text-sm font-semibold px-3 py-1 border-2`}
                        >
                          {ROLE_LABELS[contact.type as ContactRole] || contact.type}
                        </Badge>
                        {contact.email && (
                          <span className="text-sm text-muted-foreground truncate flex items-center gap-1.5">
                            <Mail className="h-4 w-4" />
                            {contact.email}
                          </span>
                        )}
                        {contact.company && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Building2 className="h-4 w-4" />
                            {contact.company}
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Role Selection */}
              {selectedContact && (
                <div className="bg-accent/5 border-2 border-accent-500/30 rounded-xl p-4">
                  <Label className="text-foreground text-base font-semibold">Role on this Deal</Label>
                  <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as ContactRole)}>
                    <SelectTrigger className="mt-2 h-12 text-base bg-background border-2 text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border">
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value} className="text-foreground text-base py-3">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 border-2 text-foreground text-base h-12"
                  onClick={() => {
                    setDialogOpen(false);
                    setSelectedContact(null);
                    setSearchQuery('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="lg"
                  className="flex-1 bg-accent-600 hover:bg-accent-700 text-white text-base h-12 font-semibold"
                  onClick={handleAssign}
                  disabled={!selectedContact || assignContact.isPending}
                >
                  {assignContact.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    'Assign Contact'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Contact Details Modal */}
      <Dialog open={!!viewingContact} onOpenChange={(open) => {
        if (!open) {
          setViewingContact(null);
          setIsEditMode(false);
          setContactForm(emptyContactForm);
        }
      }}>
        <DialogContent className="bg-card border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-500 to-purple-600 flex items-center justify-center text-foreground text-lg font-semibold">
                  {isEditMode ? contactForm.name?.charAt(0).toUpperCase() || '?' : viewingContact?.contact?.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-xl">{isEditMode ? (contactForm.name || 'Edit Contact') : (viewingContact?.contact?.name || 'Unknown')}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className={ROLE_COLORS[viewingContact?.role || 'other']}>
                      {ROLE_LABELS[viewingContact?.role || 'other']}
                    </Badge>
                    {viewingContact?.isPrimary && (
                      <Badge className="bg-accent-500/20 text-accent-400 text-xs">
                        Primary
                      </Badge>
                    )}
                    {!isEditMode && (
                      <Badge
                        variant="outline"
                        className={viewingContact?.contact?.status === 'active'
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : 'bg-zinc-500/10 text-muted-foreground border-zinc-500/20'
                        }
                      >
                        {viewingContact?.contact?.status || 'unknown'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {!isEditMode && viewingContact?.contact && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => startEdit(viewingContact.contact!)}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {viewingContact?.contact && (
            <div className="space-y-4 mt-4">
              {isEditMode ? (
                /* Edit Mode Form */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-muted-foreground text-xs">First Name</Label>
                      <Input
                        value={contactForm.firstName}
                        onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                        className="mt-1 bg-secondary border text-foreground"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Last Name</Label>
                      <Input
                        value={contactForm.lastName}
                        onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                        className="mt-1 bg-secondary border text-foreground"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">Full Name *</Label>
                    <Input
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">Contact Type</Label>
                    <Select
                      value={contactForm.type}
                      onValueChange={(v) => setContactForm({ ...contactForm, type: v as ContactType })}
                    >
                      <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-secondary border">
                        {CONTACT_TYPES.map(({ value, label }) => (
                          <SelectItem key={value} value={value} className="text-foreground">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-muted-foreground text-xs">Email</Label>
                      <Input
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        className="mt-1 bg-secondary border text-foreground"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Phone</Label>
                      <Input
                        value={contactForm.phone}
                        onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                        className="mt-1 bg-secondary border text-foreground"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">Company</Label>
                    <Input
                      value={contactForm.company}
                      onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">Address</Label>
                    <Input
                      value={contactForm.address}
                      onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-muted-foreground text-xs">City</Label>
                      <Input
                        value={contactForm.city}
                        onChange={(e) => setContactForm({ ...contactForm, city: e.target.value })}
                        className="mt-1 bg-secondary border text-foreground"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">State</Label>
                      <Input
                        value={contactForm.state}
                        onChange={(e) => setContactForm({ ...contactForm, state: e.target.value })}
                        className="mt-1 bg-secondary border text-foreground"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">ZIP</Label>
                      <Input
                        value={contactForm.zip}
                        onChange={(e) => setContactForm({ ...contactForm, zip: e.target.value })}
                        className="mt-1 bg-secondary border text-foreground"
                      />
                    </div>
                  </div>

                  {(contactForm.type === 'broker' || contactForm.type === 're_agent' || contactForm.type === 'attorney') && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-muted-foreground text-xs">
                          {contactForm.type === 'attorney' ? 'Bar Number' : 'License Number'}
                        </Label>
                        <Input
                          value={contactForm.licenseNumber}
                          onChange={(e) => setContactForm({ ...contactForm, licenseNumber: e.target.value })}
                          className="mt-1 bg-secondary border text-foreground"
                          placeholder={contactForm.type === 'attorney' ? 'Enter bar number' : 'Enter license number'}
                        />
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">
                          {contactForm.type === 'attorney' ? 'Bar State' : 'License State'}
                        </Label>
                        <Input
                          value={contactForm.licenseState}
                          onChange={(e) => setContactForm({ ...contactForm, licenseState: e.target.value })}
                          className="mt-1 bg-secondary border text-foreground"
                          placeholder="State abbreviation"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-muted-foreground text-xs">Notes</Label>
                    <Textarea
                      value={contactForm.notes}
                      onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                      className="mt-1 bg-secondary border text-foreground min-h-[80px]"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 border text-foreground"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
                      onClick={handleSaveContact}
                      disabled={updateContact.isPending}
                    >
                      {updateContact.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div className="space-y-3">
                  {/* Email */}
                  {viewingContact.contact.email && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border/50">
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-accent-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">Email</p>
                          <a
                            href={`mailto:${viewingContact.contact.email}`}
                            className="text-foreground hover:text-accent-400 transition-colors"
                          >
                            {viewingContact.contact.email}
                          </a>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => copyToClipboard(viewingContact.contact!.email!, 'email')}
                      >
                        {copiedField === 'email' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Phone */}
                  {viewingContact.contact.phone && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border/50">
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-green-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">Phone</p>
                          <a
                            href={`tel:${viewingContact.contact.phone.replace(/[^+\d]/g, '')}`}
                            className="text-foreground hover:text-green-400 transition-colors"
                          >
                            {viewingContact.contact.phone}
                          </a>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => copyToClipboard(viewingContact.contact!.phone!, 'phone')}
                      >
                        {copiedField === 'phone' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Company */}
                  {viewingContact.contact.company && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border/50">
                      <Building2 className="h-4 w-4 text-blue-400" />
                      <div>
                        <p className="text-xs text-muted-foreground">Company</p>
                        <p className="text-foreground">{viewingContact.contact.company}</p>
                      </div>
                    </div>
                  )}

                  {/* Address */}
                  {(viewingContact.contact.address || viewingContact.contact.city) && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border/50">
                      <MapPin className="h-4 w-4 text-amber-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Address</p>
                        <p className="text-foreground">
                          {viewingContact.contact.address && <span>{viewingContact.contact.address}<br /></span>}
                          {[
                            viewingContact.contact.city,
                            viewingContact.contact.state,
                            viewingContact.contact.zip
                          ].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* License Info (for agents/brokers) */}
                  {viewingContact.contact.licenseNumber && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border/50">
                      <Shield className="h-4 w-4 text-purple-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">License</p>
                        <p className="text-foreground">
                          {viewingContact.contact.licenseNumber}
                          {viewingContact.contact.licenseState && (
                            <span className="text-muted-foreground"> ({viewingContact.contact.licenseState})</span>
                          )}
                        </p>
                        {viewingContact.contact.licenseExpiration && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Expires: {formatDate(viewingContact.contact.licenseExpiration)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                {/* Notes */}
                {viewingContact.contact.notes && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border/50">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-foreground whitespace-pre-wrap text-sm">{viewingContact.contact.notes}</p>
                    </div>
                  </div>
                )}

                {/* Tags */}
                {viewingContact.contact.tags && viewingContact.contact.tags.length > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border/50">
                    <Tag className="h-4 w-4 text-pink-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {viewingContact.contact.tags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="bg-zinc-700 border text-foreground text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                  {/* Timestamps */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">
                        Added to deal: {formatDate(viewingContact.createdAt)}
                      </p>
                      {viewingContact.contact.createdAt && (
                        <p className="text-xs text-muted-foreground">
                          Contact created: {formatDate(viewingContact.contact.createdAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    {viewingContact.contact.email && (
                      <Button
                        variant="outline"
                        className="flex-1 border text-foreground hover:bg-secondary"
                        onClick={() => window.open(`mailto:${viewingContact.contact!.email}`, '_blank')}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Email
                      </Button>
                    )}
                    {viewingContact.contact.phone && (
                      <Button
                        variant="outline"
                        className="flex-1 border text-foreground hover:bg-secondary"
                        onClick={() => window.open(`tel:${viewingContact.contact!.phone!.replace(/[^+\d]/g, '')}`, '_blank')}
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        Call
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="border text-foreground hover:bg-secondary"
                      onClick={() => setViewingContact(null)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Separate component for contact drop zone to handle registration
interface ContactDropZoneProps {
  contact: PropertyContact;
  isDragging: boolean;
  selectedDocuments: unknown[];
  registerContact: (contactId: string, contact: PropertyContact) => void;
  unregisterContact: (contactId: string) => void;
  onViewContact: () => void;
  onUnassign: () => void;
}

function ContactDropZone({
  contact,
  isDragging,
  selectedDocuments,
  registerContact,
  unregisterContact,
  onViewContact,
  onUnassign,
}: ContactDropZoneProps) {
  const droppableId = `contact-${contact.contactId}`;

  // Register contact on mount, unregister on unmount
  // Use contactId as stable dependency instead of the entire contact object
  useEffect(() => {
    registerContact(droppableId, contact);
    return () => unregisterContact(droppableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppableId]);

  return (
    <Droppable droppableId={droppableId}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          onClick={onViewContact}
          className={cn(
            "relative flex items-start justify-between p-2.5 rounded-lg border transition-all cursor-pointer group",
            snapshot.isDraggingOver
              ? "bg-cyan-500/20 border-cyan-500 shadow-lg shadow-cyan-500/20 scale-[1.02]"
              : isDragging && selectedDocuments.length > 0
                ? "bg-secondary/80 border-dashed border-cyan-500/50 hover:border-cyan-500"
                : "bg-secondary/50 border/50 hover:bg-secondary hover:border"
          )}
        >
          {/* Big name overlay on drag over */}
          {snapshot.isDraggingOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-cyan-500/80 rounded-lg z-[9999] backdrop-blur-sm pointer-events-none">
              <div className="text-center">
                <Mail className="h-8 w-8 text-white mx-auto mb-1 drop-shadow-lg" />
                <p className="text-xl font-bold text-white drop-shadow-lg">
                  {contact.contact?.name || 'Unknown'}
                </p>
                <p className="text-sm text-cyan-100">Drop to email</p>
              </div>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Badge variant="outline" className={cn(ROLE_COLORS[contact.role], "text-[10px] px-1.5 py-0")}>
                {ROLE_LABELS[contact.role]}
              </Badge>
              {isDragging && selectedDocuments.length > 0 && !snapshot.isDraggingOver && (
                <div className="flex items-center gap-1 text-cyan-400 text-[10px]">
                  <Paperclip className="h-2.5 w-2.5" />
                  <span>Drop</span>
                </div>
              )}
            </div>
            <p className="font-medium text-foreground text-sm truncate">
              {contact.contact?.name || 'Unknown'}
            </p>
            {contact.contact?.phone && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                <Phone className="h-2.5 w-2.5" />
                <span>{contact.contact.phone}</span>
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onUnassign();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}
