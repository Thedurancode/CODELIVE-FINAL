'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Mail,
  Paperclip,
  Send,
  FileSignature,
  ClipboardCheck,
  DollarSign,
  ShieldAlert,
  Camera,
  FileText,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDocumentDrop } from './DocumentDropContext';
import { formatFileSize } from '@/hooks/use-property-documents';
import { api } from '@/lib/api';

const documentTypeConfig: Record<
  string,
  { icon: React.ElementType; iconColor: string; bgColor: string }
> = {
  contract: { icon: FileSignature, iconColor: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  inspection: { icon: ClipboardCheck, iconColor: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  appraisal: { icon: DollarSign, iconColor: 'text-green-400', bgColor: 'bg-green-500/10' },
  disclosure: { icon: ShieldAlert, iconColor: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  photo: { icon: Camera, iconColor: 'text-pink-400', bgColor: 'bg-pink-500/10' },
  other: { icon: FileText, iconColor: 'text-muted-foreground', bgColor: 'bg-zinc-500/10' },
};

interface DocumentEmailModalProps {
  propertyAddress?: string;
}

export function DocumentEmailModal({ propertyAddress }: DocumentEmailModalProps) {
  const {
    pendingDrop,
    setPendingDrop,
    showEmailModal,
    setShowEmailModal,
    clearSelection,
  } = useDocumentDrop();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  // Initialize subject and body when modal opens
  useEffect(() => {
    if (showEmailModal && pendingDrop) {
      setSubject(`Documents: ${propertyAddress || 'Property'}`);
      setBody(
        `Hi ${pendingDrop.contact.contact?.name?.split(' ')[0] || ''},\n\n` +
        `Please find attached the following document(s) for ${propertyAddress || 'the property'}:\n\n` +
        pendingDrop.documents.map(d => `- ${d.originalName}`).join('\n') +
        `\n\nPlease let me know if you have any questions.\n\nBest regards`
      );
      setIsSent(false);
    }
  }, [showEmailModal, pendingDrop, propertyAddress]);

  const handleClose = () => {
    setShowEmailModal(false);
    setPendingDrop(null);
    clearSelection();
    setIsSent(false);
  };

  const handleSendEmail = async () => {
    if (!pendingDrop?.contact.contact?.email) {
      toast.error('Contact has no email address');
      return;
    }

    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    if (!body.trim()) {
      toast.error('Please enter a message');
      return;
    }

    setIsSending(true);
    try {
      const response = await api.post<{
        success: boolean;
        message: string;
        data?: {
          messageId: string;
          to: string;
          attachmentsCount: number;
        };
        error?: string;
      }>('/api/documents/send-email', {
        to: pendingDrop.contact.contact.email,
        subject,
        body,
        documentIds: pendingDrop.documents.map(d => d.id),
      });

      if (response.success) {
        setIsSent(true);
        toast.success(`Email sent to ${pendingDrop.contact.contact.name}!`);

        // Close modal after a short delay to show success state
        setTimeout(() => {
          handleClose();
        }, 1500);
      } else {
        toast.error(response.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('Failed to send email:', error);
      toast.error('Failed to send email. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const getDocTypeConfig = (docType: string) => {
    return documentTypeConfig[docType] || documentTypeConfig.other;
  };

  if (!pendingDrop) return null;

  return (
    <Dialog open={showEmailModal} onOpenChange={(open) => {
      if (!open) handleClose();
    }}>
      <DialogContent className="bg-card border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Mail className="h-5 w-5 text-cyan-500" />
            Send Documents via Email
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Compose an email to {pendingDrop.contact.contact?.name} with the selected documents attached.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Recipient */}
          <div>
            <Label className="text-muted-foreground text-xs">To</Label>
            <div className="flex items-center gap-2 mt-1 p-2 rounded-lg bg-secondary border border">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center text-foreground text-sm font-semibold">
                {pendingDrop.contact.contact?.name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1">
                <p className="text-foreground text-sm font-medium">{pendingDrop.contact.contact?.name}</p>
                <p className="text-muted-foreground text-xs">{pendingDrop.contact.contact?.email || 'No email'}</p>
              </div>
            </div>
          </div>

          {/* Subject */}
          <div>
            <Label className="text-muted-foreground text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 bg-secondary border text-foreground"
            />
          </div>

          {/* Body */}
          <div>
            <Label className="text-muted-foreground text-xs">Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="mt-1 bg-secondary border text-foreground min-h-[150px]"
            />
          </div>

          {/* Attachments */}
          <div>
            <Label className="text-muted-foreground text-xs flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5" />
              Attachments ({pendingDrop.documents.length})
            </Label>
            <div className="mt-2 space-y-2 max-h-[150px] overflow-y-auto">
              {pendingDrop.documents.map((doc) => {
                const config = getDocTypeConfig(doc.documentType);
                const DocIcon = config.icon;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 border border/50"
                  >
                    <div className={cn('w-8 h-8 rounded flex items-center justify-center', config.bgColor)}>
                      <DocIcon className={cn('h-4 w-4', config.iconColor)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{doc.originalName}</p>
                      <p className="text-[10px] text-muted-foreground">{formatFileSize(doc.fileSize)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Success State */}
          {isSent ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <p className="text-foreground font-medium">Email Sent Successfully!</p>
              <p className="text-muted-foreground text-sm mt-1">
                {pendingDrop.documents.length} document{pendingDrop.documents.length > 1 ? 's' : ''} sent to {pendingDrop.contact.contact?.name}
              </p>
            </div>
          ) : (
            /* Actions */
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 border text-foreground"
                onClick={handleClose}
                disabled={isSending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-foreground"
                onClick={handleSendEmail}
                disabled={!pendingDrop.contact.contact?.email || isSending}
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Email
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
