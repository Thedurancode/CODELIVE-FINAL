'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Mail,
  Phone,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Send,
  FileSignature,
  UserPlus,
  Link2,
  Bell,
  AlertCircle,
  User,
} from 'lucide-react';
import {
  useContractSigners,
  useAddContractSigner,
  useUpdateContractSigner,
  useRemoveContractSigner,
  useSendSignerReminder,
  useLinkSignerToContact,
  getSignerStatusColor,
  getSignerStatusLabel,
  type ContractSigner,
} from '@/hooks/use-project-contracts';
import { useContacts } from '@/hooks/use-contacts';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// Signer roles
const SIGNER_ROLES = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'witness', label: 'Witness' },
  { value: 'notary', label: 'Notary' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'agent', label: 'Agent' },
  { value: 'signer', label: 'Signer' },
];

// Status configuration
const STATUS_CONFIG: Record<ContractSigner['status'], {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}> = {
  pending: {
    label: 'Pending',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-500/20',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  sent: {
    label: 'Sent',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    icon: <Send className="h-3.5 w-3.5" />,
  },
  opened: {
    label: 'Viewed',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    icon: <Eye className="h-3.5 w-3.5" />,
  },
  completed: {
    label: 'Signed',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  declined: {
    label: 'Declined',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

interface ContractSignersPanelProps {
  contractId: number;
  projectId?: string;
  showStats?: boolean;
  compact?: boolean;
}

export function ContractSignersPanel({
  contractId,
  projectId,
  showStats = true,
  compact = false,
}: ContractSignersPanelProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [selectedSigner, setSelectedSigner] = useState<ContractSigner | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState('signer');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Queries and mutations
  const { data: signersResponse, isLoading } = useContractSigners(contractId);
  const signers = signersResponse?.data;
  const { data: contactsData, isLoading: isLoadingContacts } = useContacts({
    search: searchQuery,
    limit: 10,
  });
  const addSigner = useAddContractSigner();
  const updateSigner = useUpdateContractSigner();
  const removeSigner = useRemoveContractSigner();
  const sendReminder = useSendSignerReminder();
  const linkToContact = useLinkSignerToContact();

  // Calculate stats
  const stats = signers ? {
    total: signers.length,
    pending: signers.filter(s => s.status === 'pending').length,
    sent: signers.filter(s => s.status === 'sent').length,
    opened: signers.filter(s => s.status === 'opened').length,
    completed: signers.filter(s => s.status === 'completed').length,
    declined: signers.filter(s => s.status === 'declined').length,
    completionRate: signers.length > 0
      ? Math.round((signers.filter(s => s.status === 'completed').length / signers.length) * 100)
      : 0,
  } : null;

  const handleAddSigner = async () => {
    if (!newEmail.trim()) {
      toast.error('Email is required');
      return;
    }

    try {
      await addSigner.mutateAsync({
        contractId,
        email: newEmail.trim(),
        name: newName.trim() || undefined,
        phone: newPhone.trim() || undefined,
        role: newRole,
        contactId: selectedContactId || undefined,
      });
      toast.success('Signer added');
      setIsAddDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add signer');
    }
  };

  const handleRemoveSigner = async (signer: ContractSigner) => {
    try {
      await removeSigner.mutateAsync({
        signerId: signer.id,
        contractId,
      });
      toast.success('Signer removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove signer');
    }
  };

  const handleSendReminder = async (signer: ContractSigner) => {
    try {
      await sendReminder.mutateAsync({
        signerId: signer.id,
        contractId,
      });
      toast.success(`Reminder sent to ${signer.email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reminder');
    }
  };

  const handleLinkToContact = async (contactId: string) => {
    if (!selectedSigner) return;

    try {
      await linkToContact.mutateAsync({
        signerId: selectedSigner.id,
        contactId,
        contractId,
      });
      toast.success('Signer linked to contact');
      setIsLinkDialogOpen(false);
      setSelectedSigner(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link contact');
    }
  };

  const resetForm = () => {
    setNewEmail('');
    setNewName('');
    setNewPhone('');
    setNewRole('signer');
    setSelectedContactId(null);
    setSearchQuery('');
  };

  const contacts = contactsData?.data || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Signers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-5 w-5" />
            Signers
            {signers && signers.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {signers.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            className="h-8"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Stats bar */}
        {showStats && stats && stats.total > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Completion</span>
              <span className="font-medium">{stats.completionRate}%</span>
            </div>
            <Progress value={stats.completionRate} className="h-2" />
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                {stats.completed} signed
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                {stats.opened} viewed
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                {stats.sent + stats.pending} pending
              </span>
              {stats.declined > 0 && (
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  {stats.declined} declined
                </span>
              )}
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {!signers || signers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileSignature className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No signers added yet</p>
            <p className="text-xs mt-1">Add signers to track document signatures</p>
          </div>
        ) : (
          signers.map((signer) => (
            <SignerCard
              key={signer.id}
              signer={signer}
              compact={compact}
              onRemove={() => handleRemoveSigner(signer)}
              onSendReminder={() => handleSendReminder(signer)}
              onLinkContact={() => {
                setSelectedSigner(signer);
                setIsLinkDialogOpen(true);
              }}
              isRemoving={removeSigner.isPending}
              isSendingReminder={sendReminder.isPending}
            />
          ))
        )}
      </CardContent>

      {/* Add Signer Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Signer</DialogTitle>
            <DialogDescription>
              Add a new signer to this contract. They will receive signing requests.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Search existing contacts */}
            <div className="space-y-2">
              <Label>Link to existing contact (optional)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {searchQuery && contacts.length > 0 && (
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {contacts.map((contact: any) => (
                    <button
                      key={contact.id}
                      className={`w-full px-3 py-2 text-left hover:bg-muted/50 flex items-center gap-2 ${
                        selectedContactId === contact.id ? 'bg-muted' : ''
                      }`}
                      onClick={() => {
                        setSelectedContactId(contact.id);
                        setNewEmail(contact.email || '');
                        setNewName(contact.name || '');
                        setNewPhone(contact.phone || '');
                        setSearchQuery('');
                      }}
                    >
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedContactId && (
                <Badge variant="secondary" className="gap-1">
                  <Link2 className="h-3 w-3" />
                  Linked to contact
                  <button
                    onClick={() => setSelectedContactId(null)}
                    className="ml-1 hover:text-destructive"
                  >
                    <XCircle className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="signer@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Full name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="(555) 123-4567"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {SIGNER_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAddDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleAddSigner} disabled={addSigner.isPending}>
              {addSigner.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Signer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link to Contact Dialog */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to Contact</DialogTitle>
            <DialogDescription>
              Link this signer to an existing contact in your CRM.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="border rounded-md max-h-60 overflow-y-auto">
              {isLoadingContacts ? (
                <div className="p-4 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  {searchQuery ? 'No contacts found' : 'Type to search contacts'}
                </div>
              ) : (
                contacts.map((contact: any) => (
                  <button
                    key={contact.id}
                    className="w-full px-3 py-2 text-left hover:bg-muted/50 flex items-center gap-3 border-b last:border-b-0"
                    onClick={() => handleLinkToContact(contact.id)}
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{contact.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsLinkDialogOpen(false);
              setSelectedSigner(null);
              setSearchQuery('');
            }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Individual signer card component
interface SignerCardProps {
  signer: ContractSigner;
  compact?: boolean;
  onRemove: () => void;
  onSendReminder: () => void;
  onLinkContact: () => void;
  isRemoving?: boolean;
  isSendingReminder?: boolean;
}

function SignerCard({
  signer,
  compact,
  onRemove,
  onSendReminder,
  onLinkContact,
  isRemoving,
  isSendingReminder,
}: SignerCardProps) {
  const statusConfig = STATUS_CONFIG[signer.status];
  const canSendReminder = ['pending', 'sent', 'opened'].includes(signer.status);
  const canRemove = signer.status !== 'completed';

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      {/* Status indicator */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`h-9 w-9 rounded-full flex items-center justify-center ${statusConfig.bgColor}`}>
              <span className={statusConfig.color}>{statusConfig.icon}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{statusConfig.label}</p>
            {signer.completedAt && (
              <p className="text-xs text-muted-foreground">
                Signed {formatDistanceToNow(new Date(signer.completedAt), { addSuffix: true })}
              </p>
            )}
            {signer.declinedAt && signer.declineReason && (
              <p className="text-xs text-muted-foreground">
                Reason: {signer.declineReason}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Signer info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">
            {signer.name || signer.email}
          </p>
          <Badge variant="outline" className="text-xs capitalize">
            {signer.role}
          </Badge>
          {signer.contact && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Link2 className="h-3 w-3" />
                    CRM
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Linked to contact: {signer.contact.name}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {!compact && (
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" />
              {signer.email}
            </span>
            {signer.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {signer.phone}
              </span>
            )}
            {signer.reminderCount > 0 && (
              <span className="flex items-center gap-1">
                <Bell className="h-3 w-3" />
                {signer.reminderCount} reminder{signer.reminderCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canSendReminder && (
            <DropdownMenuItem onClick={onSendReminder} disabled={isSendingReminder}>
              {isSendingReminder ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Bell className="h-4 w-4 mr-2" />
              )}
              Send Reminder
            </DropdownMenuItem>
          )}
          {signer.embedUrl && (
            <DropdownMenuItem onClick={() => window.open(signer.embedUrl, '_blank')}>
              <FileSignature className="h-4 w-4 mr-2" />
              Open Signing Link
            </DropdownMenuItem>
          )}
          {!signer.contactId && (
            <DropdownMenuItem onClick={onLinkContact}>
              <UserPlus className="h-4 w-4 mr-2" />
              Link to Contact
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {canRemove && (
            <DropdownMenuItem
              onClick={onRemove}
              disabled={isRemoving}
              className="text-destructive focus:text-destructive"
            >
              {isRemoving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remove Signer
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default ContractSignersPanel;
