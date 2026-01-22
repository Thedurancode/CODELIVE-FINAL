'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  Phone,
  Loader2,
  Users,
  Shield,
  ArrowRight,
  Mail,
  Smile,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useGuestAuth,
  usePublicChatInfo,
  usePublicChatMessages,
  useCheckPhone,
  useRegisterGuest,
  useVerifyMagicToken,
  useSendPublicMessage,
  usePublicChatParticipants,
  usePublicChatRealtime,
  useSendTyping,
  useMessageReaction,
  useEditMessage,
  useDeleteMessage,
  useReportContent,
  useBlockUser,
  useBlockedUsers,
  type PublicChatMessage,
} from '@/hooks/use-public-chat';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Flag, Ban } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

// Report reasons
const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'other', label: 'Other' },
];

// Common emoji reactions
const EMOJI_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

interface PublicPropertyChatProps {
  propertyId: number;
  propertyAddress?: string;
  magicToken?: string | null;
}

function formatPhoneInput(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');

  // Format as (XXX) XXX-XXXX
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Add +1 if 10 digits (US number)
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

type Step = 'phone' | 'register' | 'waiting' | 'chat';

export function PublicPropertyChat({ propertyId, propertyAddress, magicToken }: PublicPropertyChatProps) {
  const { guestInfo, isAuthenticated, isLoading: authLoading } = useGuestAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [tokenVerified, setTokenVerified] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, { name: string; timeout: NodeJS.Timeout }>>(new Map());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ messageId?: string; userId?: string; userName?: string } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // API hooks
  const { data: chatInfo, isLoading: infoLoading } = usePublicChatInfo(propertyId);
  const { data: participants } = usePublicChatParticipants(propertyId);
  const { data: messages, isLoading: messagesLoading } = usePublicChatMessages(
    propertyId,
    isAuthenticated
  );
  const checkPhone = useCheckPhone(propertyId);
  const registerGuest = useRegisterGuest(propertyId);
  const verifyMagicToken = useVerifyMagicToken(propertyId);
  const sendMessage = useSendPublicMessage(propertyId);
  const sendTyping = useSendTyping(propertyId);
  const addReaction = useMessageReaction(propertyId);
  const editMessage = useEditMessage(propertyId);
  const deleteMessage = useDeleteMessage(propertyId);
  const reportContent = useReportContent(propertyId);
  const blockUser = useBlockUser(propertyId);
  const { data: blockedUsers = [] } = useBlockedUsers(propertyId);

  // Handle typing events
  const handleTypingEvent = useCallback(
    (data: { guestId: string; guestName: string; isTyping: boolean }) => {
      if (data.guestId === guestInfo?.phone) return; // Ignore own typing

      setTypingUsers((prev) => {
        const newMap = new Map(prev);
        if (data.isTyping) {
          // Clear existing timeout
          const existing = newMap.get(data.guestId);
          if (existing) clearTimeout(existing.timeout);

          // Set new timeout to auto-clear after 3s
          const timeout = setTimeout(() => {
            setTypingUsers((p) => {
              const m = new Map(p);
              m.delete(data.guestId);
              return m;
            });
          }, 3000);

          newMap.set(data.guestId, { name: data.guestName, timeout });
        } else {
          const existing = newMap.get(data.guestId);
          if (existing) clearTimeout(existing.timeout);
          newMap.delete(data.guestId);
        }
        return newMap;
      });
    },
    [guestInfo?.phone]
  );

  // Realtime events handlers
  const realtimeEvents = useMemo(
    () => ({
      onTyping: handleTypingEvent,
    }),
    [handleTypingEvent]
  );

  // Subscribe to realtime updates
  usePublicChatRealtime(propertyId, isAuthenticated, realtimeEvents);

  // Auto-verify magic token if provided
  useEffect(() => {
    if (magicToken && !tokenVerified && !isAuthenticated && !authLoading) {
      setTokenVerified(true);
      verifyMagicToken.mutateAsync(magicToken)
        .then(() => {
          setStep('chat');
          toast.success('Welcome! You can now chat.');
        })
        .catch((error) => {
          toast.error(error.message || 'Invalid or expired link');
          setStep('phone');
        });
    }
  }, [magicToken, tokenVerified, isAuthenticated, authLoading]);

  // Set step based on auth state
  useEffect(() => {
    if (!authLoading && !magicToken) {
      if (isAuthenticated) {
        setStep('chat');
      } else {
        setStep('phone');
      }
    }
  }, [isAuthenticated, authLoading, magicToken]);

  // Auto-scroll to bottom when new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleCheckPhone = async () => {
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }

    try {
      const result = await checkPhone.mutateAsync(normalizePhone(phone));

      if (result.exists && result.linkSent) {
        // Known user - link sent immediately
        setStep('waiting');
        toast.success(`Welcome back${result.name ? `, ${result.name}` : ''}! Check your phone.`);
        if (result.magicLink) {
          toast.info(`Dev mode - Open: ${result.magicLink}`, { duration: 10000 });
        }
      } else if (result.needsRegistration) {
        // New user - need name/email
        setStep('register');
      }
    } catch (error) {
      toast.error((error as Error).message || 'Failed to check phone');
    }
  };

  const handleRegister = async () => {
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }

    try {
      const result = await registerGuest.mutateAsync({
        phone: normalizePhone(phone),
        name: name.trim(),
        email: email.trim() || undefined,
      });

      setStep('waiting');
      toast.success('Welcome! Check your phone for the link.');

      if (result.magicLink) {
        toast.info(`Dev mode - Open: ${result.magicLink}`, { duration: 10000 });
      }
    } catch (error) {
      toast.error((error as Error).message || 'Failed to register');
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      await sendMessage.mutateAsync(message.trim());
      setMessage('');
      sendTyping(false); // Stop typing indicator
    } catch (error) {
      toast.error((error as Error).message || 'Failed to send message');
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    if (e.target.value.trim()) {
      sendTyping(true);
    } else {
      sendTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (step === 'phone') handleCheckPhone();
      else if (step === 'register') handleRegister();
      else if (step === 'chat') handleSendMessage();
    }
  };

  // Handle adding reaction
  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      await addReaction.mutateAsync({ messageId, reaction: emoji, action: 'add' });
    } catch (error) {
      toast.error('Failed to add reaction');
    }
  };

  // Handle removing reaction
  const handleRemoveReaction = async (messageId: string, emoji: string) => {
    try {
      await addReaction.mutateAsync({ messageId, reaction: emoji, action: 'remove' });
    } catch (error) {
      toast.error('Failed to remove reaction');
    }
  };

  // Handle edit message
  const handleEditMessage = async () => {
    if (!editingMessageId || !editContent.trim()) return;

    try {
      await editMessage.mutateAsync({ messageId: editingMessageId, content: editContent.trim() });
      setEditingMessageId(null);
      setEditContent('');
      toast.success('Message edited');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to edit message');
    }
  };

  // Handle delete message
  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMessage.mutateAsync(messageId);
      toast.success('Message deleted');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to delete message');
    }
  };

  // Start editing a message
  const startEditing = (msg: PublicChatMessage) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  // Check if message can be edited/deleted (within 15 min)
  const canModifyMessage = (msg: PublicChatMessage) => {
    if (msg.senderPhone !== guestInfo?.phone) return false;
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
    return new Date(msg.createdAt).getTime() > fifteenMinAgo;
  };

  // Get typing indicator text
  const typingText = useMemo(() => {
    const names = Array.from(typingUsers.values()).map((u) => u.name);
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names[0]} and ${names.length - 1} others are typing...`;
  }, [typingUsers]);

  // Filter out messages from blocked users
  const filteredMessages = useMemo(() => {
    if (!messages) return [];
    return messages.filter((msg) => {
      // Get sender ID from metadata or senderPhone
      const senderId = (msg as any).metadata?.guestSessionId || msg.senderPhone;
      return !blockedUsers.includes(senderId);
    });
  }, [messages, blockedUsers]);

  // Open report dialog
  const openReportDialog = (messageId?: string, userId?: string, userName?: string) => {
    setReportTarget({ messageId, userId, userName });
    setReportReason('');
    setReportDetails('');
    setReportDialogOpen(true);
  };

  // Submit report
  const handleSubmitReport = async () => {
    if (!reportTarget || !reportReason) {
      toast.error('Please select a reason');
      return;
    }

    try {
      await reportContent.mutateAsync({
        messageId: reportTarget.messageId,
        userId: reportTarget.userId,
        reason: reportReason,
        details: reportDetails || undefined,
      });
      toast.success('Report submitted. Thank you for helping keep the community safe.');
      setReportDialogOpen(false);
      setReportTarget(null);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to submit report');
    }
  };

  // Block user
  const handleBlockUser = async (userId: string, userName: string) => {
    try {
      await blockUser.mutateAsync(userId);
      toast.success(`${userName} has been blocked. You won't see their messages anymore.`);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to block user');
    }
  };

  if (authLoading || infoLoading) {
    return (
      <Card className="bg-card border">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-accent-400" />
            Public Discussion
          </CardTitle>
          {participants && (
            <Badge variant="outline" className="text-muted-foreground border">
              <Users className="h-3 w-3 mr-1" />
              {participants.count} participants
            </Badge>
          )}
        </div>
        {chatInfo && (
          <p className="text-sm text-muted-foreground">
            {chatInfo.messageCount} messages
            {chatInfo.lastMessageAt && (
              <> · Last activity {formatDistanceToNow(new Date(chatInfo.lastMessageAt), { addSuffix: true })}</>
            )}
          </p>
        )}
      </CardHeader>

      <CardContent>
        {/* Phone Entry Step */}
        {step === 'phone' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border border">
              <Shield className="h-5 w-5 text-green-500 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                Enter your phone number to join the discussion.
              </p>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Phone Number</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="(555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                    onKeyPress={handleKeyPress}
                    className="bg-secondary border pl-10"
                    maxLength={14}
                    autoFocus
                  />
                </div>
                <Button
                  onClick={handleCheckPhone}
                  disabled={checkPhone.isPending || phone.replace(/\D/g, '').length < 10}
                  className="bg-accent-600 hover:bg-accent-700"
                >
                  {checkPhone.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Join
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Register Step - New Users */}
        {step === 'register' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border border">
              <Users className="h-5 w-5 text-accent-400 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                Welcome! Tell us a bit about yourself to join.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Your Name</label>
                <Input
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="bg-secondary border"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Email (optional)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="bg-secondary border pl-10"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep('phone')}
                  className="border text-muted-foreground"
                >
                  Back
                </Button>
                <Button
                  onClick={handleRegister}
                  disabled={registerGuest.isPending || !name.trim()}
                  className="flex-1 bg-accent-600 hover:bg-accent-700"
                >
                  {registerGuest.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Send Link
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Waiting for Magic Link Step */}
        {step === 'waiting' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8">
              <div className="relative mb-4">
                <Phone className="h-12 w-12 text-accent-400" />
                <div className="absolute -top-1 -right-1 h-4 w-4 bg-green-500 rounded-full animate-pulse" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Check your phone!</h3>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                We sent a magic link to <strong className="text-foreground">{phone}</strong>.
                Tap the link to join the chat instantly.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for you to tap the link...
            </div>

            <div className="flex flex-col gap-2 pt-4 border-t border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCheckPhone()}
                disabled={checkPhone.isPending}
                className="text-muted-foreground"
              >
                {checkPhone.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Resend link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('phone')}
                className="text-muted-foreground"
              >
                Use a different number
              </Button>
            </div>
          </div>
        )}

        {/* Chat Step */}
        {step === 'chat' && (
          <div className="space-y-3">
            {/* Messages */}
            <ScrollArea className="h-[300px] pr-4" ref={scrollRef}>
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredMessages && filteredMessages.length > 0 ? (
                <div className="space-y-3">
                  {filteredMessages.map((msg) => {
                    const isOwn = msg.senderPhone === guestInfo?.phone;
                    const senderId = (msg as any).metadata?.guestSessionId || msg.senderPhone;
                    const metadata = (msg as any).metadata || {};
                    const reactions = metadata.reactions || {};
                    const isEdited = !!metadata.editedAt;
                    const isDeleted = !!metadata.deletedAt;
                    const isEditing = editingMessageId === msg.id;

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2 group ${isOwn ? 'flex-row-reverse' : ''}`}
                      >
                        {!isOwn && (
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="text-xs bg-zinc-700">
                              {getInitials(msg.senderName)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`max-w-[75%] ${isOwn ? 'text-right' : ''}`}>
                          {!isOwn && (
                            <p className="text-xs text-muted-foreground mb-1">{msg.senderName}</p>
                          )}

                          {/* Message bubble with actions */}
                          <div className="relative">
                            {isEditing ? (
                              <div className="flex gap-2 items-center">
                                <Input
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') handleEditMessage();
                                    if (e.key === 'Escape') cancelEditing();
                                  }}
                                  className="bg-secondary border text-sm"
                                  autoFocus
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={handleEditMessage}
                                  disabled={editMessage.isPending}
                                >
                                  {editMessage.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3 text-green-500" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={cancelEditing}
                                >
                                  <X className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div
                                  className={`rounded-2xl px-3 py-2 ${
                                    isDeleted
                                      ? 'bg-secondary/50 text-muted-foreground italic'
                                      : isOwn
                                      ? 'bg-accent-600 text-white rounded-br-md'
                                      : 'bg-secondary text-foreground rounded-bl-md'
                                  }`}
                                >
                                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                </div>

                                {/* Message actions - show on hover */}
                                {!isDeleted && (
                                  <div
                                    className={`absolute top-0 ${
                                      isOwn ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'
                                    } opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1`}
                                  >
                                    {/* Reaction picker */}
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 bg-secondary/80"
                                        >
                                          <Smile className="h-3 w-3" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-2 bg-secondary border">
                                        <div className="flex gap-1">
                                          {EMOJI_REACTIONS.map((emoji) => (
                                            <button
                                              key={emoji}
                                              onClick={() => handleReaction(msg.id, emoji)}
                                              className="text-lg hover:scale-125 transition-transform p-1"
                                            >
                                              {emoji}
                                            </button>
                                          ))}
                                        </div>
                                      </PopoverContent>
                                    </Popover>

                                    {/* Message menu */}
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 bg-secondary/80"
                                        >
                                          <MoreHorizontal className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align={isOwn ? 'start' : 'end'}
                                        className="bg-secondary border"
                                      >
                                        {/* Edit/Delete - only for own messages within 15 min */}
                                        {canModifyMessage(msg) && (
                                          <>
                                            <DropdownMenuItem
                                              onClick={() => startEditing(msg)}
                                              className="text-foreground focus:bg-zinc-700"
                                            >
                                              <Pencil className="h-3 w-3 mr-2" />
                                              Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              onClick={() => handleDeleteMessage(msg.id)}
                                              className="text-red-400 focus:bg-zinc-700"
                                            >
                                              <Trash2 className="h-3 w-3 mr-2" />
                                              Delete
                                            </DropdownMenuItem>
                                          </>
                                        )}
                                        {/* Report/Block - for other users' messages */}
                                        {!isOwn && (
                                          <>
                                            <DropdownMenuItem
                                              onClick={() => openReportDialog(msg.id, senderId, msg.senderName)}
                                              className="text-foreground focus:bg-zinc-700"
                                            >
                                              <Flag className="h-3 w-3 mr-2" />
                                              Report message
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              onClick={() => handleBlockUser(senderId, msg.senderName)}
                                              className="text-orange-400 focus:bg-zinc-700"
                                            >
                                              <Ban className="h-3 w-3 mr-2" />
                                              Block {msg.senderName.split(' ')[0]}
                                            </DropdownMenuItem>
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Reactions display */}
                          {Object.keys(reactions).length > 0 && (
                            <div className={`flex gap-1 mt-1 flex-wrap ${isOwn ? 'justify-end' : ''}`}>
                              {Object.entries(reactions).map(([emoji, users]) => {
                                const userList = users as { guestId: string; guestName: string }[];
                                const hasReacted = userList.some(
                                  (u) => u.guestId === guestInfo?.phone
                                );
                                return (
                                  <button
                                    key={emoji}
                                    onClick={() =>
                                      hasReacted
                                        ? handleRemoveReaction(msg.id, emoji)
                                        : handleReaction(msg.id, emoji)
                                    }
                                    className={`text-xs px-1.5 py-0.5 rounded-full border ${
                                      hasReacted
                                        ? 'bg-accent-600/20 border-accent-500/50'
                                        : 'bg-secondary border'
                                    }`}
                                    title={userList.map((u) => u.guestName).join(', ')}
                                  >
                                    {emoji} {userList.length}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <p className="text-[10px] text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            {isEdited && !isDeleted && (
                              <span className="ml-1 text-muted-foreground">(edited)</span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="h-10 w-10 text-zinc-700 mb-2" />
                  <p className="text-sm text-muted-foreground">No messages yet</p>
                  <p className="text-xs text-muted-foreground">Be the first to start the discussion!</p>
                </div>
              )}
            </ScrollArea>

            {/* Typing indicator */}
            {typingText && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span>{typingText}</span>
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2 pt-2 border-t border">
              <Input
                placeholder="Type a message..."
                value={message}
                onChange={handleMessageChange}
                onKeyPress={handleKeyPress}
                className="bg-secondary border"
                disabled={sendMessage.isPending}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!message.trim() || sendMessage.isPending}
                size="icon"
                className="bg-accent-600 hover:bg-accent-700"
              >
                {sendMessage.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Current user info */}
            {guestInfo && (
              <p className="text-xs text-muted-foreground text-center">
                Chatting as <span className="text-muted-foreground">{guestInfo.name || guestInfo.phone}</span>
                {guestInfo.email && <span className="text-muted-foreground"> ({guestInfo.email})</span>}
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="bg-card border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Report Content</DialogTitle>
            <DialogDescription>
              {reportTarget?.userName
                ? `Report this message from ${reportTarget.userName}`
                : 'Report this content'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Reason</Label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger className="bg-secondary border">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  {REPORT_REASONS.map((reason) => (
                    <SelectItem
                      key={reason.value}
                      value={reason.value}
                      className="text-foreground focus:bg-zinc-700"
                    >
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Additional details (optional)</Label>
              <Textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Provide any additional context..."
                className="bg-secondary border min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReportDialogOpen(false)}
              className="border text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitReport}
              disabled={!reportReason || reportContent.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {reportContent.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Flag className="h-4 w-4 mr-2" />
              )}
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default PublicPropertyChat;
