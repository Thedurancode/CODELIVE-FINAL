'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Mail,
  Phone,
  PhoneOutgoing,
  Building2,
  MoreHorizontal,
  Users,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  Tag,
  X,
  Check,
} from 'lucide-react';
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useBulkImportContacts,
  useContactTags,
  useBulkAddTags,
  useBulkRemoveTags,
  useBulkDeleteContacts,
  useMakeTeamMember,
  getTagColor,
} from '@/hooks/use-contacts';
import { useInitiateCall } from '@/hooks/use-calls';
import { useTeamMembers, useUpdateUserRole, type TeamMember } from '@/hooks/use-team-chat';
import { useUpdateTeamMember, EXPERTISE_OPTIONS, TIMEZONE_OPTIONS } from '@/hooks/use-team-profile';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { Contact, ContactType, ContactStatus } from '@/types';
import { ContactForm } from '@/components/contacts/ContactForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { MessageCircle, Shield, UserCog, PenLine, Link2 } from 'lucide-react';
import { useRequestSignature, useGenerateSignatureLink } from '@/hooks/use-contact-signature';

const TYPE_COLORS: Record<ContactType, string> = {
  broker: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  buyer: 'bg-green-500/20 text-green-400 border-green-500/30',
  seller: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  wholesaler: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  attorney: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  re_agent: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  team_member: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  other: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  admin: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  broker: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  broker_assistant: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  transaction_coordinator: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  agent: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  wholesaler: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  investor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  team_member: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  buyer: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const AVAILABLE_ROLES = [
  { value: 'team_member', label: 'Team Member' },
  { value: 'admin', label: 'Admin' },
  { value: 'broker', label: 'Broker' },
  { value: 'broker_assistant', label: 'Broker Assistant' },
  { value: 'transaction_coordinator', label: 'Transaction Coordinator' },
  { value: 'agent', label: 'Agent' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'investor', label: 'Investor' },
  { value: 'buyer', label: 'Buyer' },
];

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatRole(role: string) {
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const STATUS_COLORS: Record<ContactStatus, string> = {
  active: 'bg-green-500/20 text-green-400',
  inactive: 'bg-zinc-500/20 text-muted-foreground',
  archived: 'bg-red-500/20 text-red-400',
};

// CSV Template columns
const CSV_TEMPLATE = `name,type,email,phone,company,address,city,state,zip,notes,tags,status
John Smith,buyer,john@example.com,(555) 123-4567,ABC Investments,123 Main St,Miami,FL,33101,VIP client,investor;repeat-buyer,active
Jane Doe,broker,jane@broker.com,(555) 987-6543,XYZ Realty,456 Oak Ave,Orlando,FL,32801,Top producer,broker;referral,active`;

interface ParsedContact {
  name: string;
  type: ContactType;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  tags?: string[];
  status: ContactStatus;
  isValid: boolean;
  errors: string[];
}

export default function ContactsPage() {
  const [activeTab, setActiveTab] = useState<'contacts' | 'team'>('contacts');
  const [search, setSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContactType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editingTeamMember, setEditingTeamMember] = useState<TeamMember | null>(null);
  const [mounted, setMounted] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Bulk tag dialog state
  const [isAddTagOpen, setIsAddTagOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  // Bulk import state
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [importResults, setImportResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch team members
  const { data: teamMembers = [], isLoading: isLoadingTeam } = useTeamMembers(teamSearch || undefined);

  const { data, isLoading, error, refetch } = useContacts({
    page,
    limit: 20,
    search: search || undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const bulkImportContacts = useBulkImportContacts();
  const updateUserRole = useUpdateUserRole();
  const updateTeamMember = useUpdateTeamMember();

  // Tag hooks
  const { data: tagsData } = useContactTags();
  const bulkAddTags = useBulkAddTags();
  const bulkRemoveTags = useBulkRemoveTags();
  const bulkDeleteContacts = useBulkDeleteContacts();
  const makeTeamMember = useMakeTeamMember();
  const initiateCall = useInitiateCall();
  const requestSignature = useRequestSignature();
  const generateSignatureLink = useGenerateSignatureLink();

  const allTags: { tag: string; count: number }[] = Array.isArray(tagsData) ? tagsData : ((tagsData as any)?.data || []);

  const contacts = data?.data || [];
  const pagination = data?.pagination;

  // Filter contacts by tag if tagFilter is set
  const filteredContacts = tagFilter
    ? contacts.filter((c: Contact) => c.tags?.includes(tagFilter))
    : contacts;

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map((c: Contact) => c.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk tag operations
  const handleBulkAddTag = async (tag: string) => {
    if (!tag.trim() || selectedIds.size === 0) return;
    try {
      await bulkAddTags.mutateAsync({
        contactIds: Array.from(selectedIds),
        tags: [tag.trim()],
      });
      toast.success(`Tag "${tag}" added to ${selectedIds.size} contacts`);
      setNewTagInput('');
      setIsAddTagOpen(false);
    } catch {
      toast.error('Failed to add tag');
    }
  };

  const handleBulkRemoveTag = async (tag: string) => {
    if (selectedIds.size === 0) return;
    try {
      await bulkRemoveTags.mutateAsync({
        contactIds: Array.from(selectedIds),
        tags: [tag],
      });
      toast.success(`Tag "${tag}" removed from contacts`);
    } catch {
      toast.error('Failed to remove tag');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} contacts?`)) return;
    try {
      await bulkDeleteContacts.mutateAsync(Array.from(selectedIds));
      toast.success(`${selectedIds.size} contacts deleted`);
      clearSelection();
    } catch {
      toast.error('Failed to delete contacts');
    }
  };

  // Download CSV template
  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Parse CSV file
  const parseCSV = (text: string): ParsedContact[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const validTypes: ContactType[] = ['broker', 'buyer', 'seller', 'wholesaler', 'attorney', 're_agent', 'other'];
    const validStatuses: ContactStatus[] = ['active', 'inactive', 'archived'];

    return lines.slice(1).map((line, index) => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      // Handle CSV with quoted fields
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const errors: string[] = [];
      const getValue = (header: string) => {
        const idx = headers.indexOf(header);
        return idx >= 0 && values[idx] ? values[idx] : undefined;
      };

      const name = getValue('name') || '';
      if (!name) errors.push('Name is required');

      let type = (getValue('type') || 'other').toLowerCase() as ContactType;
      if (!validTypes.includes(type)) {
        type = 'other';
      }

      let status = (getValue('status') || 'active').toLowerCase() as ContactStatus;
      if (!validStatuses.includes(status)) {
        status = 'active';
      }

      const tagsStr = getValue('tags');
      const tags = tagsStr ? tagsStr.split(';').map(t => t.trim()).filter(Boolean) : undefined;

      return {
        name,
        type,
        email: getValue('email'),
        phone: getValue('phone'),
        company: getValue('company'),
        address: getValue('address'),
        city: getValue('city'),
        state: getValue('state'),
        zip: getValue('zip'),
        notes: getValue('notes'),
        tags,
        status,
        isValid: errors.length === 0,
        errors,
      };
    });
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setParsedContacts(parsed);
      setImportStep('preview');
    };
    reader.readAsText(file);
  };

  // Handle bulk import
  const handleBulkImport = async () => {
    const validContacts = parsedContacts.filter(c => c.isValid);
    if (validContacts.length === 0) {
      toast.error('No valid contacts to import');
      return;
    }

    setImportStep('importing');

    try {
      const contactsToImport = validContacts.map(({ isValid, errors, ...contact }) => contact);
      await bulkImportContacts.mutateAsync(contactsToImport);
      setImportResults({ success: validContacts.length, failed: parsedContacts.length - validContacts.length });
      setImportStep('complete');
      toast.success(`${validContacts.length} contacts imported successfully`);
    } catch {
      toast.error('Failed to import contacts');
      setImportStep('preview');
    }
  };

  // Reset bulk import dialog
  const resetBulkImport = () => {
    setParsedContacts([]);
    setImportStep('upload');
    setImportResults({ success: 0, failed: 0 });
  };

  const closeBulkImport = () => {
    setIsBulkImportOpen(false);
    resetBulkImport();
  };

  const handleCreate = async (contactData: Partial<Contact>) => {
    try {
      await createContact.mutateAsync(contactData);
      toast.success('Contact created successfully');
      setIsFormOpen(false);
    } catch {
      toast.error('Failed to create contact');
    }
  };

  const handleUpdate = async (contactData: Partial<Contact>) => {
    if (!editingContact) return;
    try {
      await updateContact.mutateAsync({ id: editingContact.id, data: contactData });
      toast.success('Contact updated successfully');
      setEditingContact(null);
    } catch {
      toast.error('Failed to update contact');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      await deleteContact.mutateAsync(id);
      toast.success('Contact deleted successfully');
    } catch {
      toast.error('Failed to delete contact');
    }
  };

  const openEditDialog = (contact: Contact) => {
    setEditingContact(contact);
  };

  const handleMakeTeamMember = async (contact: Contact) => {
    try {
      await makeTeamMember.mutateAsync(contact.id);
      toast.success(`${contact.name} promoted to team member`);
    } catch (error) {
      const message = (error as Error).message || 'Failed to promote contact';
      if (message.includes('Admin access required')) {
        toast.error('You need admin access to perform this action');
      } else if (message.includes('email')) {
        toast.error('Contact must have an email address');
      } else {
        toast.error(message);
      }
    }
  };

  const handleChangeRole = async (userId: string, newRole: string, userName: string) => {
    try {
      await updateUserRole.mutateAsync({ userId, role: newRole });
      toast.success(`${userName}'s role updated to ${formatRole(newRole)}`);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to update role');
    }
  };

  const handleInitiateCall = async (contact: Contact) => {
    if (!contact.phone) {
      toast.error('Contact has no phone number');
      return;
    }
    try {
      toast.info(`Initiating call to ${contact.name}...`);
      const result = await initiateCall.mutateAsync({
        contact_id: contact.id,
        agent_profile: 'sales',
      });
      if (result.success) {
        toast.success(`Call initiated to ${contact.name}`);
      } else {
        toast.error(result.error || 'Failed to initiate call');
      }
    } catch (error) {
      toast.error((error as Error).message || 'Failed to initiate call');
    }
  };

  const handleRequestSignature = async (contact: Contact) => {
    if (!contact.phone) {
      toast.error('Contact has no phone number');
      return;
    }
    try {
      toast.info(`Sending signature request to ${contact.name}...`);
      const result = await requestSignature.mutateAsync({ contactId: contact.id, sendSms: true });
      toast.success(`Signature request sent to ${contact.name}! Link expires at ${new Date(result.expiresAt).toLocaleString()}`);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to send signature request');
    }
  };

  const handleCopySignatureLink = async (contact: Contact) => {
    try {
      toast.info(`Generating signature link for ${contact.name}...`);
      const result = await generateSignatureLink.mutateAsync(contact.id);

      // Try to copy to clipboard with fallback
      try {
        await navigator.clipboard.writeText(result.signatureUrl);
        toast.success('Signature link copied to clipboard!');
      } catch (clipboardError) {
        // Clipboard failed - show the link in a toast so user can copy manually
        console.warn('Clipboard access denied:', clipboardError);
        toast.success(
          <div className="space-y-2">
            <p>Signature link generated:</p>
            <code className="block text-xs bg-secondary p-2 rounded break-all select-all">
              {result.signatureUrl}
            </code>
            <p className="text-xs text-muted-foreground">Click the link above to select and copy</p>
          </div>,
          { duration: 10000 }
        );
      }
    } catch (error) {
      toast.error((error as Error).message || 'Failed to generate signature link');
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contacts</h1>
          <p className="text-muted-foreground mt-1">Manage your CRM contacts</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load contacts</p>
            <p className="text-muted-foreground mb-4">{(error as Error).message}</p>
            <Button onClick={() => refetch()} variant="outline" className="border">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {activeTab === 'contacts'
              ? isLoading ? 'Loading...' : `${pagination?.total || 0} contacts`
              : isLoadingTeam ? 'Loading...' : `${teamMembers.length} team members`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            className="border text-foreground"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {activeTab === 'contacts' && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="border text-foreground"
                onClick={() => setIsBulkImportOpen(true)}
              >
                <Upload className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Bulk Import</span>
              </Button>
              {mounted ? (
                <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-accent-600 hover:bg-accent-700 text-white">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Contact
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-foreground">Add Contact</DialogTitle>
                    </DialogHeader>
                    <ContactForm
                      onSubmit={handleCreate}
                      onCancel={() => setIsFormOpen(false)}
                      isLoading={createContact.isPending}
                    />
                  </DialogContent>
                </Dialog>
              ) : (
                <Button className="bg-accent-600 hover:bg-accent-700 text-white">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Contact
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'contacts' | 'team')}>
        <TabsList className="bg-secondary border">
          <TabsTrigger value="contacts" className="data-[state=active]:bg-secondary">
            <Users className="h-4 w-4 mr-2" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="team" className="data-[state=active]:bg-secondary">
            <MessageCircle className="h-4 w-4 mr-2" />
            Team Members
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="mt-4">
          <div className="flex gap-6">
            {/* Tag Sidebar */}
            <div className="hidden lg:block w-48 shrink-0 space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground px-2 flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Tags
              </h3>
              <div className="space-y-1">
                <button
                  onClick={() => setTagFilter(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    tagFilter === null
                      ? 'bg-accent-600/20 text-accent-400'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  All Contacts
                  <span className="float-right text-muted-foreground">{pagination?.total || 0}</span>
                </button>
                {allTags.map(({ tag, count }) => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tag)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                      tagFilter === tag
                        ? 'bg-accent-600/20 text-accent-400'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Badge variant="outline" className={`${getTagColor(tag)} text-xs`}>
                        {tag}
                      </Badge>
                    </span>
                    <span className="text-muted-foreground ml-2">{count}</span>
                  </button>
                ))}
                {allTags.length === 0 && (
                  <p className="text-xs text-muted-foreground px-3 py-2">No tags yet</p>
                )}
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 space-y-4">
              {/* Bulk Action Bar */}
              {selectedIds.size > 0 && (
                <div className="bg-accent-600/10 border border-accent-600/30 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.size === filteredContacts.length && filteredContacts.length > 0}
                      onCheckedChange={() => toggleSelectAll()}
                    />
                    <span className="text-sm text-foreground">
                      {selectedIds.size} contact{selectedIds.size !== 1 ? 's' : ''} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DropdownMenu open={isAddTagOpen} onOpenChange={setIsAddTagOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="border">
                          <Tag className="h-4 w-4 mr-2" />
                          Add Tag
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-secondary border w-56">
                        <div className="p-2">
                          <Input
                            placeholder="New tag name..."
                            value={newTagInput}
                            onChange={(e) => setNewTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleBulkAddTag(newTagInput);
                              }
                            }}
                            className="bg-card border text-foreground text-sm h-8"
                          />
                        </div>
                        {allTags.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-muted-foreground">Existing tags:</div>
                            {allTags.slice(0, 5).map(({ tag }) => (
                              <DropdownMenuItem
                                key={tag}
                                onClick={() => handleBulkAddTag(tag)}
                                className="text-foreground cursor-pointer"
                              >
                                <Badge variant="outline" className={`${getTagColor(tag)} mr-2`}>
                                  {tag}
                                </Badge>
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {allTags.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="border">
                            <X className="h-4 w-4 mr-2" />
                            Remove Tag
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-secondary border">
                          {allTags.map(({ tag }) => (
                            <DropdownMenuItem
                              key={tag}
                              onClick={() => handleBulkRemoveTag(tag)}
                              className="text-foreground cursor-pointer"
                            >
                              <Badge variant="outline" className={`${getTagColor(tag)} mr-2`}>
                                {tag}
                              </Badge>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-700 text-red-400 hover:bg-red-900/20"
                      onClick={handleBulkDelete}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search contacts..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-9 bg-card border text-foreground"
                  />
                </div>
                {/* Mobile tag filter */}
                <Select
                  value={tagFilter || 'all'}
                  onValueChange={(v) => setTagFilter(v === 'all' ? null : v)}
                >
                  <SelectTrigger className="w-[150px] bg-card border text-foreground lg:hidden">
                    <Tag className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Tag" />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    <SelectItem value="all" className="text-foreground">All Tags</SelectItem>
                    {allTags.map(({ tag }) => (
                      <SelectItem key={tag} value={tag} className="text-foreground">{tag}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={typeFilter}
                  onValueChange={(v) => {
                    setTypeFilter(v as ContactType | 'all');
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[150px] bg-card border text-foreground">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    <SelectItem value="all" className="text-foreground">All Types</SelectItem>
                    <SelectItem value="broker" className="text-foreground">Broker</SelectItem>
                    <SelectItem value="buyer" className="text-foreground">Buyer</SelectItem>
                    <SelectItem value="seller" className="text-foreground">Seller</SelectItem>
                    <SelectItem value="wholesaler" className="text-foreground">Wholesaler</SelectItem>
                    <SelectItem value="attorney" className="text-foreground">Attorney</SelectItem>
                    <SelectItem value="re_agent" className="text-foreground">RE Agent</SelectItem>
                    <SelectItem value="other" className="text-foreground">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v as ContactStatus | 'all');
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[150px] bg-card border text-foreground">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    <SelectItem value="all" className="text-foreground">All Status</SelectItem>
                    <SelectItem value="active" className="text-foreground">Active</SelectItem>
                    <SelectItem value="inactive" className="text-foreground">Inactive</SelectItem>
                    <SelectItem value="archived" className="text-foreground">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

      {/* Table */}
      <Card className="bg-card border">
        {isLoading ? (
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        ) : filteredContacts.length > 0 ? (
          <>
            <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow className="border hover:bg-transparent">
                  <TableHead className="text-muted-foreground w-10">
                    <Checkbox
                      checked={selectedIds.size === filteredContacts.length && filteredContacts.length > 0}
                      onCheckedChange={() => toggleSelectAll()}
                    />
                  </TableHead>
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">Tags</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Email</TableHead>
                  <TableHead className="text-muted-foreground">Phone</TableHead>
                  <TableHead className="text-muted-foreground text-center">Active</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.map((contact: Contact) => (
                  <ContextMenu key={contact.id}>
                    <ContextMenuTrigger asChild>
                      <TableRow
                        className={`border hover:bg-secondary/50 cursor-context-menu ${selectedIds.has(contact.id) ? 'bg-accent-600/10' : ''}`}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(contact.id)}
                            onCheckedChange={() => toggleSelect(contact.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Link href={`/contacts/${contact.id}`} className="block">
                            <p className="font-medium text-foreground hover:text-accent-400 transition-colors">{contact.name}</p>
                            {contact.city && contact.state && (
                              <p className="text-sm text-muted-foreground">
                                {contact.city}, {contact.state}
                              </p>
                            )}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {contact.tags && contact.tags.length > 0 ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              {contact.tags.slice(0, 2).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className={`${getTagColor(tag)} text-xs cursor-pointer`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTagFilter(tag);
                                  }}
                                >
                                  {tag}
                                </Badge>
                              ))}
                              {contact.tags.length > 2 && (
                                <span className="text-xs text-muted-foreground">+{contact.tags.length - 2}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={TYPE_COLORS[contact.type]}
                          >
                            {contact.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {contact.email ? (
                            <a
                              href={`mailto:${contact.email}`}
                              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-400 transition-colors"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[200px]">{contact.email}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {contact.phone ? (
                            <div className="flex items-center gap-2">
                              <a
                                href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}
                                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-400 transition-colors"
                              >
                                <Phone className="h-3.5 w-3.5" />
                                <span>{contact.phone}</span>
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleInitiateCall(contact);
                                }}
                                disabled={initiateCall.isPending}
                                title="Click to call via AI agent"
                              >
                                {initiateCall.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <PhoneOutgoing className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={contact.status === 'active'}
                            onCheckedChange={async (checked) => {
                              try {
                                await updateContact.mutateAsync({
                                  id: contact.id,
                                  data: { status: checked ? 'active' : 'inactive' },
                                });
                                toast.success(`${contact.name} ${checked ? 'activated' : 'deactivated'}`);
                              } catch {
                                toast.error('Failed to update status');
                              }
                            }}
                            className="data-[state=checked]:bg-green-500"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="bg-secondary border"
                            >
                              <DropdownMenuItem
                                onClick={() => openEditDialog(contact)}
                                className="text-foreground cursor-pointer"
                              >
                                <Edit2 className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(contact.id)}
                                className="text-red-400 cursor-pointer"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-56 bg-secondary border">
                      {/* Add Tag Submenu */}
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="text-foreground cursor-pointer">
                          <Tag className="mr-2 h-4 w-4" />
                          Add Tag
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-secondary border max-h-64 overflow-y-auto">
                          {allTags.length > 0 ? (
                            allTags.map(({ tag }) => {
                              const hasTag = contact.tags?.includes(tag);
                              return (
                                <ContextMenuItem
                                  key={tag}
                                  onClick={async () => {
                                    if (hasTag) return;
                                    try {
                                      await bulkAddTags.mutateAsync({
                                        contactIds: [contact.id],
                                        tags: [tag],
                                      });
                                      toast.success(`Tag "${tag}" added to ${contact.name}`);
                                    } catch {
                                      toast.error('Failed to add tag');
                                    }
                                  }}
                                  disabled={hasTag}
                                  className={`text-foreground cursor-pointer ${hasTag ? 'opacity-50' : ''}`}
                                >
                                  <Badge variant="outline" className={`${getTagColor(tag)} mr-2`}>
                                    {tag}
                                  </Badge>
                                  {hasTag && <Check className="ml-auto h-4 w-4 text-green-500" />}
                                </ContextMenuItem>
                              );
                            })
                          ) : (
                            <ContextMenuItem disabled className="text-muted-foreground">
                              No tags available
                            </ContextMenuItem>
                          )}
                        </ContextMenuSubContent>
                      </ContextMenuSub>

                      {/* Remove Tag Submenu - only show if contact has tags */}
                      {contact.tags && contact.tags.length > 0 && (
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="text-foreground cursor-pointer">
                            <X className="mr-2 h-4 w-4" />
                            Remove Tag
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-secondary border">
                            {contact.tags.map((tag) => (
                              <ContextMenuItem
                                key={tag}
                                onClick={async () => {
                                  try {
                                    await bulkRemoveTags.mutateAsync({
                                      contactIds: [contact.id],
                                      tags: [tag],
                                    });
                                    toast.success(`Tag "${tag}" removed from ${contact.name}`);
                                  } catch {
                                    toast.error('Failed to remove tag');
                                  }
                                }}
                                className="text-foreground cursor-pointer"
                              >
                                <Badge variant="outline" className={`${getTagColor(tag)} mr-2`}>
                                  {tag}
                                </Badge>
                              </ContextMenuItem>
                            ))}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                      )}

                      <ContextMenuSeparator className="bg-zinc-700" />

                      {/* Quick Actions */}
                      <ContextMenuItem
                        onClick={() => openEditDialog(contact)}
                        className="text-foreground cursor-pointer"
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit Contact
                      </ContextMenuItem>

                      <ContextMenuItem
                        onClick={() => handleMakeTeamMember(contact)}
                        className="text-cyan-400 cursor-pointer"
                        disabled={makeTeamMember.isPending}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Make Team Member
                      </ContextMenuItem>

                      {contact.email && (
                        <ContextMenuItem
                          onClick={() => window.location.assign(`mailto:${contact.email}`)}
                          className="text-foreground cursor-pointer"
                        >
                          <Mail className="mr-2 h-4 w-4" />
                          Send Email
                        </ContextMenuItem>
                      )}

                      {contact.phone && (
                        <>
                          <ContextMenuItem
                            onClick={() => window.location.assign(`tel:${contact.phone?.replace(/[^+\d]/g, '')}`)}
                            className="text-foreground cursor-pointer"
                          >
                            <Phone className="mr-2 h-4 w-4" />
                            Call (Phone App)
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleInitiateCall(contact)}
                            className="text-green-400 cursor-pointer"
                            disabled={initiateCall.isPending}
                          >
                            <PhoneOutgoing className="mr-2 h-4 w-4" />
                            Call with AI Agent
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleRequestSignature(contact)}
                            className="text-purple-400 cursor-pointer"
                            disabled={requestSignature.isPending}
                          >
                            <PenLine className="mr-2 h-4 w-4" />
                            Request Signature (SMS)
                          </ContextMenuItem>
                        </>
                      )}

                      <ContextMenuItem
                        onClick={() => handleCopySignatureLink(contact)}
                        className="text-blue-400 cursor-pointer"
                        disabled={generateSignatureLink.isPending}
                      >
                        <Link2 className="mr-2 h-4 w-4" />
                        Copy Signature Link
                      </ContextMenuItem>

                      <ContextMenuSeparator className="bg-zinc-700" />

                      <ContextMenuItem
                        onClick={() => handleDelete(contact.id)}
                        className="text-red-400 cursor-pointer focus:text-red-400"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Contact
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="border"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= pagination.totalPages}
                    className="border"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No contacts found</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              {search || typeFilter !== 'all' || statusFilter !== 'all' || tagFilter
                ? 'Try adjusting your search or filters'
                : 'Add your first contact to get started'}
            </p>
          </CardContent>
        )}
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Team Members Tab */}
        <TabsContent value="team" className="mt-4 space-y-4">
          {/* Team Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search team members..."
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              className="pl-9 bg-card border text-foreground"
            />
          </div>

          {/* Team Members Table */}
          <Card className="bg-card border">
            {isLoadingTeam ? (
              <CardContent className="p-6">
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-1/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : teamMembers.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Name</TableHead>
                      <TableHead className="text-muted-foreground">Role</TableHead>
                      <TableHead className="text-muted-foreground">Email</TableHead>
                      <TableHead className="text-muted-foreground">Phone</TableHead>
                      <TableHead className="text-muted-foreground">Company</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member: TeamMember) => (
                      <ContextMenu key={member.id}>
                        <ContextMenuTrigger asChild>
                          <TableRow className="border hover:bg-secondary/50 cursor-context-menu">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10">
                                  <AvatarFallback className="bg-accent-600 text-white">
                                    {getInitials(member.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-foreground">{member.name}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={ROLE_COLORS[member.role] || 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30'}
                              >
                                {formatRole(member.role)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {member.email ? (
                                <a
                                  href={`mailto:${member.email}`}
                                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-400 transition-colors"
                                >
                                  <Mail className="h-3.5 w-3.5" />
                                  <span className="truncate max-w-[200px]">{member.email}</span>
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {member.phone ? (
                                <a
                                  href={`tel:${member.phone.replace(/[^+\d]/g, '')}`}
                                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-400 transition-colors"
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                  <span>{member.phone}</span>
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {member.company ? (
                                <div className="flex items-center gap-2 text-foreground">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span>{member.company}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-56 bg-secondary border">
                          <ContextMenuItem
                            onClick={() => setEditingTeamMember(member)}
                            className="text-foreground cursor-pointer"
                          >
                            <Edit2 className="mr-2 h-4 w-4" />
                            Edit Member
                          </ContextMenuItem>
                          <ContextMenuSeparator className="bg-zinc-700" />
                          <ContextMenuSub>
                            <ContextMenuSubTrigger className="text-foreground cursor-pointer">
                              <UserCog className="mr-2 h-4 w-4" />
                              Change Role
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="bg-secondary border">
                              {AVAILABLE_ROLES.map((role) => (
                                <ContextMenuItem
                                  key={role.value}
                                  onClick={() => handleChangeRole(member.id, role.value, member.name)}
                                  disabled={member.role === role.value || member.role === 'super_admin'}
                                  className={`text-foreground cursor-pointer ${member.role === role.value ? 'bg-accent-600/20' : ''}`}
                                >
                                  {member.role === role.value && (
                                    <Shield className="mr-2 h-4 w-4 text-accent-400" />
                                  )}
                                  {role.label}
                                </ContextMenuItem>
                              ))}
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          <ContextMenuSeparator className="bg-zinc-700" />
                          <ContextMenuItem
                            onClick={() => member.email && window.location.assign(`mailto:${member.email}`)}
                            disabled={!member.email}
                            className="text-foreground cursor-pointer"
                          >
                            <Mail className="mr-2 h-4 w-4" />
                            Send Email
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => member.phone && window.location.assign(`tel:${member.phone.replace(/[^+\d]/g, '')}`)}
                            disabled={!member.phone}
                            className="text-foreground cursor-pointer"
                          >
                            <Phone className="mr-2 h-4 w-4" />
                            Call
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No team members found</h3>
                <p className="text-muted-foreground text-center max-w-sm">
                  {teamSearch ? 'Try adjusting your search' : 'No team members available'}
                </p>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      {mounted && (
        <Dialog open={!!editingContact} onOpenChange={(open) => !open && setEditingContact(null)}>
          <DialogContent className="bg-card border max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Edit Contact</DialogTitle>
            </DialogHeader>
            {editingContact && (
              <ContactForm
                contact={editingContact}
                onSubmit={handleUpdate}
                onCancel={() => setEditingContact(null)}
                isLoading={updateContact.isPending}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Team Member Dialog */}
      {mounted && (
        <Dialog open={!!editingTeamMember} onOpenChange={(open) => !open && setEditingTeamMember(null)}>
          <DialogContent className="bg-card border max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Edit Team Member</DialogTitle>
            </DialogHeader>
            {editingTeamMember && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const expertiseValues = formData.getAll('expertise') as string[];

                  try {
                    await updateTeamMember.mutateAsync({
                      userId: editingTeamMember.id,
                      name: formData.get('name') as string,
                      phone: formData.get('phone') as string || undefined,
                      company: formData.get('company') as string || undefined,
                      title: formData.get('title') as string || undefined,
                      bio: formData.get('bio') as string || undefined,
                      timezone: formData.get('timezone') as string || undefined,
                      expertise: expertiseValues.length > 0 ? expertiseValues : undefined,
                    });
                    toast.success(`${formData.get('name')} updated successfully`);
                    setEditingTeamMember(null);
                  } catch (error) {
                    toast.error((error as Error).message || 'Failed to update team member');
                  }
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-foreground">Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={editingTeamMember.name}
                      required
                      className="bg-secondary border text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-foreground">Title</Label>
                    <Input
                      id="title"
                      name="title"
                      defaultValue={editingTeamMember.title || ''}
                      placeholder="e.g., Senior Acquisitions Manager"
                      className="bg-secondary border text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground">Email</Label>
                    <Input
                      id="email"
                      value={editingTeamMember.email}
                      disabled
                      className="bg-secondary/50 border text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-foreground">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      defaultValue={editingTeamMember.phone || ''}
                      placeholder="(555) 123-4567"
                      className="bg-secondary border text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company" className="text-foreground">Company</Label>
                    <Input
                      id="company"
                      name="company"
                      defaultValue={(editingTeamMember as any).company || ''}
                      placeholder="Company name"
                      className="bg-secondary border text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone" className="text-foreground">Timezone</Label>
                    <Select name="timezone" defaultValue={editingTeamMember.timezone || ''}>
                      <SelectTrigger className="bg-secondary border text-foreground">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent className="bg-secondary border">
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value} className="text-foreground">
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio" className="text-foreground">Bio</Label>
                  <Textarea
                    id="bio"
                    name="bio"
                    defaultValue={editingTeamMember.bio || ''}
                    placeholder="Brief bio or description..."
                    rows={3}
                    className="bg-secondary border text-foreground resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">Expertise</Label>
                  <div className="grid grid-cols-2 gap-2 p-3 bg-secondary/50 rounded-lg border">
                    {EXPERTISE_OPTIONS.map((option) => (
                      <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          name="expertise"
                          value={option.value}
                          defaultChecked={editingTeamMember.expertise?.includes(option.value)}
                        />
                        <span className="text-sm text-foreground">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingTeamMember(null)}
                    className="border text-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateTeamMember.isPending}
                    className="bg-accent-600 hover:bg-accent-700 text-white"
                  >
                    {updateTeamMember.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk Import Dialog */}
      {mounted && (
        <Dialog open={isBulkImportOpen} onOpenChange={(open) => !open && closeBulkImport()}>
          <DialogContent className="bg-card border max-w-[95vw] sm:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Bulk Import Contacts
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              {/* Upload Step */}
              {importStep === 'upload' && (
                <div className="space-y-6 py-4">
                  <div className="text-center p-8 border-2 border-dashed border rounded-lg">
                    <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Upload CSV File</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Upload a CSV file with your contacts. Download the template to see the required format.
                    </p>
                    <div className="flex gap-3 justify-center">
                      <Button
                        variant="outline"
                        onClick={downloadTemplate}
                        className="border text-foreground"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download Template
                      </Button>
                      <label className="cursor-pointer">
                        <Button className="bg-accent-600 hover:bg-accent-700 text-white pointer-events-none">
                          <Upload className="mr-2 h-4 w-4" />
                          Upload CSV
                        </Button>
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="bg-secondary/50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-foreground mb-2">CSV Format</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Your CSV should have the following columns (name is required):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['name*', 'type', 'email', 'phone', 'company', 'address', 'city', 'state', 'zip', 'notes', 'tags', 'status'].map((col) => (
                        <Badge key={col} variant="outline" className="text-xs border text-foreground">
                          {col}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      <strong>Type:</strong> broker, buyer, seller, wholesaler, attorney, re_agent, other<br />
                      <strong>Status:</strong> active, inactive, archived<br />
                      <strong>Tags:</strong> Use semicolon to separate multiple tags (e.g., investor;vip)
                    </p>
                  </div>
                </div>
              )}

              {/* Preview Step */}
              {importStep === 'preview' && (
                <div className="space-y-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Badge className="bg-green-600 text-foreground">
                        {parsedContacts.filter(c => c.isValid).length} valid
                      </Badge>
                      {parsedContacts.filter(c => !c.isValid).length > 0 && (
                        <Badge className="bg-red-600 text-foreground">
                          {parsedContacts.filter(c => !c.isValid).length} invalid
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetBulkImport}
                      className="border text-foreground"
                    >
                      Upload Different File
                    </Button>
                  </div>

                  <div className="border border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border hover:bg-transparent">
                          <TableHead className="text-muted-foreground w-10">Status</TableHead>
                          <TableHead className="text-muted-foreground">Name</TableHead>
                          <TableHead className="text-muted-foreground">Type</TableHead>
                          <TableHead className="text-muted-foreground">Email</TableHead>
                          <TableHead className="text-muted-foreground">Phone</TableHead>
                          <TableHead className="text-muted-foreground">Company</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedContacts.slice(0, 10).map((contact, idx) => (
                          <TableRow key={idx} className="border">
                            <TableCell>
                              {contact.isValid ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-foreground">{contact.name || '-'}</span>
                              {!contact.isValid && (
                                <p className="text-xs text-red-400">{contact.errors.join(', ')}</p>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={TYPE_COLORS[contact.type]}>
                                {contact.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{contact.email || '-'}</TableCell>
                            <TableCell className="text-muted-foreground">{contact.phone || '-'}</TableCell>
                            <TableCell className="text-muted-foreground">{contact.company || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {parsedContacts.length > 10 && (
                      <div className="px-4 py-2 text-center text-sm text-muted-foreground border-t border">
                        And {parsedContacts.length - 10} more contacts...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Importing Step */}
              {importStep === 'importing' && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 text-accent-500 animate-spin mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Importing Contacts...</h3>
                  <p className="text-muted-foreground text-sm">
                    Importing {parsedContacts.filter(c => c.isValid).length} contacts
                  </p>
                </div>
              )}

              {/* Complete Step */}
              {importStep === 'complete' && (
                <div className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Import Complete!</h3>
                  <div className="flex gap-4 mb-6">
                    <Badge className="bg-green-600 text-foreground">
                      {importResults.success} imported
                    </Badge>
                    {importResults.failed > 0 && (
                      <Badge className="bg-red-600 text-foreground">
                        {importResults.failed} failed
                      </Badge>
                    )}
                  </div>
                  <Button onClick={closeBulkImport} className="bg-accent-600 hover:bg-accent-700 text-white">
                    Done
                  </Button>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            {(importStep === 'upload' || importStep === 'preview') && (
              <div className="flex gap-3 pt-4 border-t border">
                <Button
                  variant="outline"
                  onClick={closeBulkImport}
                  className="flex-1 border text-foreground"
                >
                  Cancel
                </Button>
                {importStep === 'preview' && (
                  <Button
                    onClick={handleBulkImport}
                    disabled={parsedContacts.filter(c => c.isValid).length === 0}
                    className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
                  >
                    Import {parsedContacts.filter(c => c.isValid).length} Contacts
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
