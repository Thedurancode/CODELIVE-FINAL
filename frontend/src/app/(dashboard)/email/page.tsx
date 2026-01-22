'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useEmails,
  useEmail,
  useEmailUnreadCounts,
  useEmailClientStatus,
  useSyncEmails,
  useMarkAsRead,
  useMarkAsUnread,
  useToggleStarred,
  useMoveToFolder,
  useDeleteEmail,
  useSendEmail,
  type Email,
  type EmailFolder,
  type DocumentWithProperty,
  formatEmailAddress,
  getEmailInitials,
} from '@/hooks/use-email-client';
import { DocumentPicker } from '@/components/email/DocumentPicker';
import { ContactPicker } from '@/components/email/ContactPicker';
import { api } from '@/lib/api';
import type { Contact } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  Archive,
  Star,
  StarOff,
  RefreshCw,
  Search,
  MoreVertical,
  Reply,
  Forward,
  Mail,
  MailOpen,
  Paperclip,
  ChevronLeft,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Users,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

const folders: { id: EmailFolder; label: string; icon: typeof Inbox }[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileText },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'archive', label: 'Archive', icon: Archive },
];

// Wrapper component with Suspense for useSearchParams
export default function EmailClientPage() {
  return (
    <Suspense fallback={
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <EmailClientContent />
    </Suspense>
  );
}

function EmailClientContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentFolder, setCurrentFolder] = useState<EmailFolder>('inbox');
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showCompose, setShowCompose] = useState(false);
  const [replyToEmail, setReplyToEmail] = useState<Email | null>(null);

  // Compose state
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeAttachments, setComposeAttachments] = useState<DocumentWithProperty[]>([]);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Queries
  const { data: clientStatus } = useEmailClientStatus();
  const { data: unreadCounts } = useEmailUnreadCounts();
  const { data: emailsData, isLoading: isLoadingEmails, refetch } = useEmails(currentFolder, {
    page,
    limit: 50,
    search: searchQuery || undefined,
  });
  const { data: selectedEmail, isLoading: isLoadingEmail } = useEmail(selectedEmailId);

  const isConfigured = clientStatus?.configured ?? false;

  // Mutations
  const syncEmails = useSyncEmails();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const toggleStarred = useToggleStarred();
  const moveToFolder = useMoveToFolder();
  const deleteEmail = useDeleteEmail();
  const sendEmail = useSendEmail();

  // Handle URL params
  useEffect(() => {
    const folder = searchParams.get('folder');
    if (folder && folders.some(f => f.id === folder)) {
      setCurrentFolder(folder as EmailFolder);
    }
    const emailId = searchParams.get('email');
    if (emailId) {
      setSelectedEmailId(parseInt(emailId, 10));
    }
  }, [searchParams]);

  // Update URL when folder or email changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('folder', currentFolder);
    if (selectedEmailId) {
      params.set('email', String(selectedEmailId));
    }
    router.replace(`/email?${params}`, { scroll: false });
  }, [currentFolder, selectedEmailId, router]);

  const handleSync = async () => {
    try {
      const result = await syncEmails.mutateAsync({});
      toast.success(`Synced ${result.synced} emails`);
    } catch (error) {
      toast.error('Failed to sync emails');
    }
  };

  const handleSelectEmail = (email: Email) => {
    setSelectedEmailId(email.id);
    if (email.status === 'unread') {
      markAsRead.mutate(email.id);
    }
  };

  const handleToggleStar = async (e: React.MouseEvent, email: Email) => {
    e.stopPropagation();
    await toggleStarred.mutateAsync(email.id);
  };

  const handleDelete = async (email: Email) => {
    await deleteEmail.mutateAsync(email.id);
    if (selectedEmailId === email.id) {
      setSelectedEmailId(null);
    }
    toast.success(email.folder === 'trash' ? 'Email permanently deleted' : 'Email moved to trash');
  };

  const handleArchive = async (email: Email) => {
    await moveToFolder.mutateAsync({ id: email.id, folder: 'archive' });
    if (selectedEmailId === email.id) {
      setSelectedEmailId(null);
    }
    toast.success('Email archived');
  };

  const handleReply = (email: Email) => {
    setReplyToEmail(email);
    setComposeTo(email.from.email);
    setComposeSubject(`Re: ${email.subject.replace(/^Re:\s*/i, '')}`);
    setComposeBody(`\n\n---\nOn ${format(new Date(email.receivedAt || email.createdAt), 'PPpp')}, ${formatEmailAddress(email.from)} wrote:\n\n${email.bodyText || ''}`);
    setComposeAttachments([]);
    setShowCompose(true);
  };

  const handleCompose = () => {
    setReplyToEmail(null);
    setComposeTo('');
    setComposeCc('');
    setComposeSubject('');
    setComposeBody('');
    setComposeAttachments([]);
    setShowCompose(true);
  };

  const handleSend = async () => {
    if (!composeTo.trim()) {
      toast.error('Please enter a recipient');
      return;
    }
    if (!composeSubject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    // Check if email can be sent
    if (!clientStatus?.canSend) {
      toast.error('Email sending is not available. Configure RESEND_API_KEY to enable sending.');
      return;
    }

    setIsSending(true);
    try {
      // If we have document attachments, use the documents/send-email endpoint
      if (composeAttachments.length > 0) {
        await api.post('/api/documents/send-email', {
          documentIds: composeAttachments.map(d => d.id),
          to: composeTo.split(',').map(e => e.trim())[0], // Backend expects single email
          subject: composeSubject,
          body: composeBody,
        });
      } else {
        // Regular email without document attachments
        await sendEmail.mutateAsync({
          to: composeTo.split(',').map(e => e.trim()),
          cc: composeCc ? composeCc.split(',').map(e => e.trim()) : undefined,
          subject: composeSubject,
          text: composeBody,
          inReplyTo: replyToEmail?.messageId,
          references: replyToEmail?.references,
        });
      }
      toast.success('Email sent');
      setShowCompose(false);
      setComposeTo('');
      setComposeCc('');
      setComposeSubject('');
      setComposeBody('');
      setComposeAttachments([]);
      setReplyToEmail(null);
    } catch (error) {
      toast.error('Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  const handleRemoveAttachment = (docId: number) => {
    setComposeAttachments(prev => prev.filter(d => d.id !== docId));
  };

  const handleAddContacts = (contacts: Contact[]) => {
    const emails = contacts.map(c => c.email).filter(Boolean) as string[];
    if (emails.length === 0) return;

    // Append to existing emails, avoiding duplicates
    const existingEmails = composeTo.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const newEmails = emails.filter(e => !existingEmails.includes(e.toLowerCase()));

    if (newEmails.length > 0) {
      setComposeTo(prev => {
        const current = prev.trim();
        return current ? `${current}, ${newEmails.join(', ')}` : newEmails.join(', ');
      });
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return format(d, 'h:mm a');
    } else if (diffDays < 7) {
      return format(d, 'EEE');
    } else {
      return format(d, 'MMM d');
    }
  };

  const emails = emailsData?.data || [];
  const pagination = emailsData?.pagination;

  // Show setup prompt if email is not configured
  if (!isConfigured) {
    return (
      <div className="h-[calc(100vh-8rem)] flex flex-col items-center justify-center">
        <Card className="max-w-md bg-card border">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <Mail className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-foreground">Connect Your Email</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Connect your email account to sync messages, send emails, and manage your inbox directly from the platform.
            </p>
            <Button
              onClick={() => router.push('/settings')}
              className="bg-accent-600 hover:bg-accent-700"
            >
              <Settings className="h-4 w-4 mr-2" />
              Configure Email in Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)]">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Email</h1>
          <p className="text-sm text-muted-foreground truncate">{clientStatus?.accountEmail || 'Loading...'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncEmails.isPending}
            className="border text-foreground hover:bg-secondary"
          >
            <RefreshCw className={cn('h-4 w-4 sm:mr-2', syncEmails.isPending && 'animate-spin')} />
            <span className="hidden sm:inline">Sync</span>
          </Button>
          <Button
            size="sm"
            onClick={handleCompose}
            disabled={!clientStatus?.canSend}
            className="bg-accent-600 hover:bg-accent-700"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Compose</span>
          </Button>
        </div>
      </div>

      {/* Mobile Folder Tabs */}
      <div className="md:hidden mb-3 overflow-x-auto">
        <div className="flex gap-2 pb-2">
          {folders.map((folder) => {
            const Icon = folder.icon;
            const unread = unreadCounts?.[folder.id] || 0;
            const isActive = currentFolder === folder.id;

            return (
              <button
                key={folder.id}
                onClick={() => {
                  setCurrentFolder(folder.id);
                  setSelectedEmailId(null);
                  setPage(1);
                }}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-accent-600 text-white'
                    : 'bg-secondary text-muted-foreground hover:bg-zinc-700 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{folder.label}</span>
                {unread > 0 && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      'text-xs px-1.5',
                      isActive ? 'bg-white/20 text-foreground' : 'bg-zinc-700 text-foreground'
                    )}
                  >
                    {unread}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 md:gap-4 h-[calc(100%-7rem)] md:h-[calc(100%-3rem)]">
        {/* Folder Sidebar - Hidden on mobile */}
        <Card className="hidden md:block w-48 shrink-0 bg-card border">
          <CardContent className="p-2">
            <nav className="space-y-1">
              {folders.map((folder) => {
                const Icon = folder.icon;
                const unread = unreadCounts?.[folder.id] || 0;
                const isActive = currentFolder === folder.id;

                return (
                  <button
                    key={folder.id}
                    onClick={() => {
                      setCurrentFolder(folder.id);
                      setSelectedEmailId(null);
                      setPage(1);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      isActive
                        ? 'bg-accent-600 text-white'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{folder.label}</span>
                    {unread > 0 && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-xs px-1.5',
                          isActive ? 'bg-white/20 text-foreground' : 'bg-zinc-700 text-foreground'
                        )}
                      >
                        {unread}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </nav>
          </CardContent>
        </Card>

        {/* Email List - Hidden on mobile when email is selected */}
        <Card className={cn(
          "w-full md:w-80 shrink-0 bg-card border flex flex-col",
          selectedEmailId ? "hidden md:flex" : "flex"
        )}>
          <CardHeader className="py-3 px-4 border-b border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-secondary border text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </CardHeader>
          <ScrollArea className="flex-1">
            {isLoadingEmails ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Mail className="h-8 w-8 mb-2" />
                <p className="text-sm">No emails in {currentFolder}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {emails.map((email) => (
                  <button
                    key={email.id}
                    onClick={() => handleSelectEmail(email)}
                    className={cn(
                      'w-full p-3 text-left transition-colors hover:bg-secondary',
                      selectedEmailId === email.id && 'bg-secondary',
                      email.status === 'unread' && 'bg-secondary/50'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className={cn(
                          'text-xs',
                          email.status === 'unread' ? 'bg-accent-600 text-white' : 'bg-zinc-700 text-foreground'
                        )}>
                          {getEmailInitials(email.from)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(
                            'text-sm truncate',
                            email.status === 'unread' ? 'font-semibold text-foreground' : 'text-foreground'
                          )}>
                            {email.from.name || email.from.email}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatDate(email.receivedAt || email.createdAt)}
                          </span>
                        </div>
                        <p className={cn(
                          'text-sm truncate',
                          email.status === 'unread' ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {email.subject}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {email.snippet}
                        </p>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <button
                          onClick={(e) => handleToggleStar(e, email)}
                          className="p-1 hover:bg-zinc-700 rounded"
                        >
                          {email.starred ? (
                            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                          ) : (
                            <Star className="h-4 w-4 text-muted-foreground hover:text-muted-foreground" />
                          )}
                        </button>
                        {email.hasAttachments && (
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
          {pagination && pagination.totalPages > 1 && (
            <div className="p-2 border-t border flex items-center justify-between">
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
                Page {page} of {pagination.totalPages}
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
        </Card>

        {/* Email Detail - Hidden on mobile when no email selected */}
        <Card className={cn(
          "flex-1 bg-card border flex flex-col overflow-hidden",
          selectedEmailId ? "flex" : "hidden md:flex"
        )}>
          {selectedEmailId ? (
            isLoadingEmail ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedEmail ? (
              <>
                <CardHeader className="py-3 px-4 border-b border shrink-0">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedEmailId(null)}
                        className="text-muted-foreground md:hidden"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-accent-600 text-white">
                          {getEmailInitials(selectedEmail.from)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="text-foreground font-medium">
                          {selectedEmail.from.name || selectedEmail.from.email}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          To: {selectedEmail.to.map(t => t.email).join(', ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleReply(selectedEmail)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Reply className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleStar({ stopPropagation: () => {} } as any, selectedEmail)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {selectedEmail.starred ? (
                          <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                        ) : (
                          <Star className="h-4 w-4" />
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border">
                          <DropdownMenuItem
                            onClick={() => selectedEmail.status === 'unread'
                              ? markAsRead.mutate(selectedEmail.id)
                              : markAsUnread.mutate(selectedEmail.id)
                            }
                            className="text-foreground"
                          >
                            {selectedEmail.status === 'unread' ? (
                              <>
                                <MailOpen className="h-4 w-4 mr-2" />
                                Mark as read
                              </>
                            ) : (
                              <>
                                <Mail className="h-4 w-4 mr-2" />
                                Mark as unread
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleArchive(selectedEmail)}
                            className="text-foreground"
                          >
                            <Archive className="h-4 w-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-secondary" />
                          <DropdownMenuItem
                            onClick={() => handleDelete(selectedEmail)}
                            className="text-red-400"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="mt-3">
                    <h2 className="text-lg font-semibold text-foreground">{selectedEmail.subject}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(selectedEmail.receivedAt || selectedEmail.createdAt), 'PPpp')}
                    </p>
                  </div>
                </CardHeader>
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {selectedEmail.bodyHtml ? (
                      <div
                        className="prose prose-invert prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                      />
                    ) : (
                      <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">
                        {selectedEmail.bodyText}
                      </pre>
                    )}
                    {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                      <div className="mt-6 pt-4 border-t border">
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">
                          Attachments ({selectedEmail.attachments.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedEmail.attachments.map((att, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg text-sm"
                            >
                              <Paperclip className="h-4 w-4 text-muted-foreground" />
                              <span className="text-foreground">{att.filename}</span>
                              <span className="text-muted-foreground text-xs">
                                ({Math.round(att.size / 1024)}KB)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p>Email not found</p>
              </div>
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Mail className="h-12 w-12 mb-4" />
              <p className="text-lg">Select an email to read</p>
              <p className="text-sm mt-1">Choose from the list on the left</p>
            </div>
          )}
        </Card>
      </div>

      {/* Compose Dialog */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl bg-card border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {replyToEmail ? 'Reply' : 'New Email'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">To</label>
              <div className="flex gap-2">
                <Input
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="bg-secondary border text-foreground flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowContactPicker(true)}
                  className="border text-foreground hover:bg-secondary shrink-0"
                  title="Select from contacts"
                >
                  <Users className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Cc</label>
              <Input
                value={composeCc}
                onChange={(e) => setComposeCc(e.target.value)}
                placeholder="cc@example.com"
                className="bg-secondary border text-foreground"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Subject</label>
              <Input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Subject"
                className="bg-secondary border text-foreground"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Message</label>
              <Textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Write your message..."
                rows={6}
                className="bg-secondary border text-foreground resize-none sm:min-h-[200px]"
              />
            </div>

            {/* Attachments Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted-foreground">Attachments</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDocumentPicker(true)}
                  className="border text-foreground hover:bg-secondary"
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  Attach Documents
                </Button>
              </div>
              {composeAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-secondary/50 rounded-lg border border">
                  {composeAttachments.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 rounded-full text-sm"
                    >
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <span className="text-foreground max-w-[200px] truncate">
                        {doc.originalName}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(doc.id)}
                        className="p-0.5 hover:bg-zinc-600 rounded-full"
                      >
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowCompose(false)}
              className="text-muted-foreground w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending || sendEmail.isPending}
              className="bg-accent-600 hover:bg-accent-700 w-full sm:w-auto"
            >
              {isSending || sendEmail.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send {composeAttachments.length > 0 && `(${composeAttachments.length} files)`}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Picker Dialog */}
      <DocumentPicker
        open={showDocumentPicker}
        onClose={() => setShowDocumentPicker(false)}
        onSelect={(documents) => {
          setComposeAttachments(documents);
        }}
        selectedDocuments={composeAttachments}
      />

      {/* Contact Picker Dialog */}
      <ContactPicker
        open={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        onSelect={handleAddContacts}
        mode="multiple"
      />
    </div>
  );
}
