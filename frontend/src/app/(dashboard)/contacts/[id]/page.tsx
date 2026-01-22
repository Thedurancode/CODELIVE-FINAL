'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  MapPin,
  Tag,
  FileText,
  Home,
  DollarSign,
  Bed,
  Bath,
  Square,
  AlertCircle,
  RefreshCw,
  Calendar,
  Shield,
  ExternalLink,
  Edit2,
  MessageSquare,
  Copy,
  Check,
  PenLine,
  Clock,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useContact, useContactProperties, useUpdateContact } from '@/hooks/use-contacts';
import {
  useContactSignature,
  usePendingSignatureRequest,
  useRequestSignature,
  useDeleteSignature,
} from '@/hooks/use-contact-signature';
import {
  useContactNotes,
  useCreateContactNote,
  useDeleteContactNote,
  formatRelativeTime,
  type ContactNote,
} from '@/hooks/use-contact-notes';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useState } from 'react';
import type { ContactType, ContactStatus, ContactRole, PropertyContact } from '@/types';

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

const ROLE_COLORS: Record<ContactRole, string> = {
  agent: 'bg-teal-500/20 text-teal-400',
  broker: 'bg-purple-500/20 text-purple-400',
  seller: 'bg-amber-500/20 text-amber-400',
  wholesaler: 'bg-blue-500/20 text-blue-400',
  attorney: 'bg-indigo-500/20 text-indigo-400',
  re_agent: 'bg-teal-500/20 text-teal-400',
  buyer: 'bg-green-500/20 text-green-400',
  team_member: 'bg-cyan-500/20 text-cyan-400',
  other: 'bg-zinc-500/20 text-muted-foreground',
};

function formatCurrency(value?: number): string {
  if (!value) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAddress(property: PropertyContact['property']): string {
  if (!property) return '-';
  const { address, city, state, zip } = property;
  const streetAddress = address
    ? `${address.houseNumber || ''} ${address.street || ''}`.trim()
    : '';
  return `${streetAddress}`;
}

function formatLocation(property: PropertyContact['property']): string {
  if (!property) return '';
  return `${property.city}, ${property.state} ${property.zip || ''}`.trim();
}

function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');

  const { data: contact, isLoading: contactLoading, error: contactError, refetch: refetchContact } = useContact(contactId);

  // Notes hooks
  const { data: notes = [], isLoading: notesLoading } = useContactNotes(contactId);
  const createNote = useCreateContactNote(contactId);
  const deleteNote = useDeleteContactNote(contactId);
  const { data: propertiesData, isLoading: propertiesLoading, error: propertiesError, refetch: refetchProperties } = useContactProperties(contactId);
  const updateContact = useUpdateContact();

  // Signature hooks
  const { data: signatureData, isLoading: signatureLoading } = useContactSignature(contactId);
  const { data: pendingRequest, isLoading: pendingRequestLoading } = usePendingSignatureRequest(contactId);
  const requestSignature = useRequestSignature();
  const deleteSignature = useDeleteSignature();

  const properties = propertiesData || [];

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.warn('Clipboard access denied:', error);
      toast.error('Could not copy to clipboard. Please copy manually.');
    }
  };

  const handleStatusToggle = async (checked: boolean) => {
    if (!contact) return;
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        data: { status: checked ? 'active' : 'inactive' },
      });
      toast.success(`Contact ${checked ? 'activated' : 'deactivated'}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleRequestSignature = async () => {
    if (!contact) return;
    try {
      await requestSignature.mutateAsync({ contactId: contact.id, sendSms: true });
      toast.success('Signature request sent');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to send signature request');
    }
  };

  const handleDeleteSignature = async () => {
    if (!contact) return;
    try {
      await deleteSignature.mutateAsync(contact.id);
      toast.success('Signature removed');
    } catch {
      toast.error('Failed to remove signature');
    }
  };

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;
    try {
      await createNote.mutateAsync({ content: newNoteContent.trim() });
      setNewNoteContent('');
      toast.success('Note added');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to add note');
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      await deleteNote.mutateAsync(noteId);
      toast.success('Note deleted');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to delete note');
    }
  };

  // Calculate time remaining for pending request
  const getPendingRequestTimeRemaining = () => {
    if (!pendingRequest?.expiresAt) return null;
    const expiresAt = new Date(pendingRequest.expiresAt);
    const now = new Date();
    const hoursRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
    if (hoursRemaining > 24) {
      const days = Math.floor(hoursRemaining / 24);
      return `${days} day${days !== 1 ? 's' : ''}`;
    }
    return `${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`;
  };

  if (contactError) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Contacts
        </Button>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load contact</p>
            <p className="text-muted-foreground mb-4">{(contactError as Error).message}</p>
            <Button onClick={() => refetchContact()} variant="outline" className="border">
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border text-foreground">
            <Edit2 className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Contact Info */}
        <div className="lg:col-span-1 space-y-4">
          {/* Profile Card */}
          <Card className="bg-card/50 border overflow-hidden">
            {/* Cover gradient */}
            <div className="h-20 bg-gradient-to-r from-accent-600/30 to-purple-600/30" />

            <CardContent className="pt-0 -mt-10">
              {contactLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-20 rounded-full mx-auto" />
                  <Skeleton className="h-6 w-32 mx-auto" />
                  <Skeleton className="h-4 w-24 mx-auto" />
                </div>
              ) : contact ? (
                <div className="text-center">
                  {/* Avatar */}
                  <Avatar className="h-20 w-20 mx-auto border-4 border-zinc-900 shadow-xl">
                    <AvatarImage src={(contact as any).avatar} alt={contact.name} />
                    <AvatarFallback className="bg-accent-600 text-white text-xl font-semibold">
                      {getInitials(contact.name)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name & Type */}
                  <h1 className="text-xl font-bold text-foreground mt-3">{contact.name}</h1>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Badge variant="outline" className={TYPE_COLORS[contact.type]}>
                      {contact.type}
                    </Badge>
                  </div>

                  {/* Active Toggle */}
                  <div className="flex items-center justify-center gap-3 mt-4 py-3 border-t border">
                    <span className="text-sm text-muted-foreground">Active</span>
                    <Switch
                      checked={contact.status === 'active'}
                      onCheckedChange={handleStatusToggle}
                      className="data-[state=checked]:bg-green-500"
                    />
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-2 mt-4">
                    {contact.email && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border text-foreground"
                        onClick={() => window.location.href = `mailto:${contact.email}`}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                    )}
                    {contact.phone && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border text-foreground"
                        onClick={() => window.location.href = `tel:${contact.phone?.replace(/[^+\d]/g, '')}`}
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border text-foreground"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Contact Details Card */}
          <Card className="bg-card/50 border">
            <CardContent className="p-4 space-y-4">
              {contactLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : contact ? (
                <>
                  {/* Email */}
                  {contact.email && (
                    <div className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                          <Mail className="h-4 w-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Email</p>
                          <p className="text-sm text-foreground">{contact.email}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(contact.email!, 'email')}
                      >
                        {copiedField === 'email' ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Phone */}
                  {contact.phone && (
                    <div className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                          <Phone className="h-4 w-4 text-green-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Phone</p>
                          <p className="text-sm text-foreground">{contact.phone}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(contact.phone!, 'phone')}
                      >
                        {copiedField === 'phone' ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Company */}
                  {contact.company && (
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Company</p>
                        <p className="text-sm text-foreground">{contact.company}</p>
                      </div>
                    </div>
                  )}

                  {/* Address */}
                  {(contact.city || contact.state) && (
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <MapPin className="h-4 w-4 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Location</p>
                        <p className="text-sm text-foreground">
                          {[contact.city, contact.state].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* License */}
                  {contact.licenseNumber && (
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                        <Shield className="h-4 w-4 text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">License</p>
                        <p className="text-sm text-foreground">
                          {contact.licenseNumber}
                          {contact.licenseState && ` (${contact.licenseState})`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Created */}
                  <div className="flex items-center gap-3 pt-3 border-t border">
                    <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="text-sm text-muted-foreground">{formatDate(contact.createdAt)}</p>
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* Signature Card */}
          <Card className="bg-card/50 border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <PenLine className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Signature on File</span>
              </div>

              {signatureLoading || pendingRequestLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : signatureData?.hasSignature && signatureData?.signatureUrl ? (
                // Has signature - show preview
                <div className="space-y-3">
                  <div className="p-3 bg-white rounded-lg border">
                    <img
                      src={signatureData.signatureUrl}
                      alt="Contact signature"
                      className="w-full h-auto max-h-20 object-contain"
                    />
                  </div>
                  {signatureData.signatureUpdatedAt && (
                    <p className="text-xs text-muted-foreground">
                      Updated {formatDate(signatureData.signatureUpdatedAt)}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border text-foreground"
                      onClick={handleRequestSignature}
                      disabled={requestSignature.isPending || !contact?.phone}
                    >
                      {requestSignature.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Request New
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border text-red-400 hover:text-red-300 hover:border-red-500/50"
                      onClick={handleDeleteSignature}
                      disabled={deleteSignature.isPending}
                    >
                      {deleteSignature.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : pendingRequest && pendingRequest.status === 'pending' ? (
                // Has pending request
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm">
                      Request pending - expires in {getPendingRequestTimeRemaining()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A signature request has been sent to this contact.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border text-foreground"
                    onClick={handleRequestSignature}
                    disabled={requestSignature.isPending}
                  >
                    {requestSignature.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Resend Request
                  </Button>
                </div>
              ) : (
                // No signature
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    No signature on file for this contact.
                  </p>
                  {contact?.phone ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border text-foreground"
                      onClick={handleRequestSignature}
                      disabled={requestSignature.isPending}
                    >
                      {requestSignature.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <PenLine className="mr-2 h-4 w-4" />
                      )}
                      Request Signature
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Add a phone number to request a signature via SMS.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tags Card */}
          {contact?.tags && contact.tags.length > 0 && (
            <Card className="bg-card/50 border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Tags</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contact.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="bg-secondary text-foreground">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes Card */}
          {contact?.notes && (
            <Card className="bg-card/50 border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Notes</span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{contact.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Associated Properties */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Home className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">Associated Properties</h2>
              {!propertiesLoading && (
                <Badge variant="outline" className="border text-muted-foreground">
                  {properties.length}
                </Badge>
              )}
            </div>
            {propertiesError && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchProperties()}
                className="border"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            )}
          </div>

          {propertiesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
            </div>
          ) : propertiesError ? (
            <Card className="bg-card/50 border">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-muted-foreground">Failed to load properties</p>
              </CardContent>
            </Card>
          ) : properties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {properties.map((assignment: PropertyContact) => (
                <Link
                  key={assignment.id}
                  href={`/deals/${assignment.propertyId}`}
                  className="group"
                >
                  <Card className="bg-card/50 border overflow-hidden hover:border transition-all hover:shadow-lg hover:shadow-black/20">
                    {/* Property Image */}
                    <div className="relative h-32 bg-secondary">
                      {assignment.property?.photoLinks?.[0] ? (
                        <img
                          src={assignment.property.photoLinks[0]}
                          alt={formatAddress(assignment.property)}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Home className="h-10 w-10 text-zinc-700" />
                        </div>
                      )}
                      {/* Role Badge */}
                      <Badge className={`absolute top-2 left-2 ${ROLE_COLORS[assignment.role]}`}>
                        {assignment.role}
                      </Badge>
                      {assignment.isPrimary && (
                        <Badge className="absolute top-2 right-2 bg-accent-600 text-white">
                          Primary
                        </Badge>
                      )}
                      {/* Status */}
                      <Badge
                        className={`absolute bottom-2 right-2 ${
                          assignment.property?.status === 'accepted'
                            ? 'bg-green-500/90 text-foreground'
                            : assignment.property?.status === 'rejected'
                            ? 'bg-red-500/90 text-foreground'
                            : 'bg-zinc-700/90 text-foreground'
                        }`}
                      >
                        {assignment.property?.status || 'new'}
                      </Badge>
                    </div>

                    {/* Property Info */}
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate group-hover:text-accent-400 transition-colors">
                            {formatAddress(assignment.property)}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" />
                            {formatLocation(assignment.property)}
                          </p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-accent-400 transition-colors flex-shrink-0" />
                      </div>

                      {/* Price */}
                      <div className="flex items-center gap-1 mt-3">
                        <DollarSign className="h-4 w-4 text-emerald-400" />
                        <span className="text-lg font-bold text-emerald-400">
                          {formatCurrency(assignment.property?.purchaseContractPrice)?.replace('$', '')}
                        </span>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                        {assignment.property?.bedroomCount !== undefined && (
                          <span className="flex items-center gap-1">
                            <Bed className="h-3.5 w-3.5" />
                            {assignment.property.bedroomCount}
                          </span>
                        )}
                        {assignment.property?.bathroomCount !== undefined && (
                          <span className="flex items-center gap-1">
                            <Bath className="h-3.5 w-3.5" />
                            {assignment.property.bathroomCount}
                          </span>
                        )}
                        {assignment.property?.livingSpaceSqFt && (
                          <span className="flex items-center gap-1">
                            <Square className="h-3.5 w-3.5" />
                            {assignment.property.livingSpaceSqFt.toLocaleString()}
                          </span>
                        )}
                        {assignment.property?.propertyType && (
                          <Badge variant="outline" className="text-xs border text-muted-foreground">
                            {assignment.property.propertyType}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="bg-card/50 border">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <Home className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No properties yet</h3>
                <p className="text-muted-foreground text-sm text-center max-w-sm">
                  This contact is not associated with any properties. Properties will appear here when they're linked.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Notes Section */}
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">Notes</h2>
              {!notesLoading && (
                <Badge variant="outline" className="border text-muted-foreground">
                  {notes.length}
                </Badge>
              )}
            </div>

            {/* Add Note Form */}
            <Card className="bg-card/50 border mb-4">
              <CardContent className="p-4">
                <Textarea
                  placeholder="Add a note about this contact..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="min-h-[80px] bg-secondary/50 border resize-none mb-3"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleAddNote();
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Press {typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to save
                  </p>
                  <Button
                    size="sm"
                    onClick={handleAddNote}
                    disabled={!newNoteContent.trim() || createNote.isPending}
                    className="bg-accent-600 hover:bg-accent-700"
                  >
                    {createNote.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Add Note
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Notes List */}
            {notesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ) : notes.length > 0 ? (
              <div className="space-y-3">
                {notes.map((note: ContactNote) => (
                  <Card key={note.id} className="bg-card/50 border group">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="bg-accent-600/20 text-accent-400 text-xs">
                              {getInitials(note.author.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm text-foreground">
                                {note.author.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(note.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                              {note.content}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                          onClick={() => handleDeleteNote(note.id)}
                          disabled={deleteNote.isPending}
                        >
                          {deleteNote.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-card/50 border">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mb-3">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">No notes yet</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Add a note above to get started
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
