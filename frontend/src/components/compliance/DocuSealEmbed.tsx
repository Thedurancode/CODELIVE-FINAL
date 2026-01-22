'use client';

import { useState } from 'react';
import { DocusealForm } from '@docuseal/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ExternalLink, FileSignature } from 'lucide-react';

interface DocuSealEmbedProps {
  templateId: number;
  templateName: string;
  templateSlug?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseUrl?: string;
}

export function DocuSealEmbed({
  templateId,
  templateName,
  templateSlug,
  open,
  onOpenChange,
  baseUrl = 'https://sign.dispotree.com',
}: DocuSealEmbedProps) {
  const [email, setEmail] = useState('');
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);

  // The embed URL format for DocuSeal - use slug if available, otherwise template ID
  const embedSrc = `${baseUrl}/d/${templateSlug || templateId}`;

  const handleComplete = (data: any) => {
    console.log('Document signed:', data);
    setCompleted(true);
  };

  const handleStart = () => {
    if (email) {
      setStarted(true);
    }
  };

  const resetForm = () => {
    setEmail('');
    setStarted(false);
    setCompleted(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="bg-card border max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-emerald-500" />
            {templateName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-[70vh]">
          {!started ? (
            <div className="flex flex-col items-center justify-center h-full space-y-6 p-8">
              <div className="text-center space-y-2">
                <h3 className="text-lg font-medium text-foreground">Preview & Sign Document</h3>
                <p className="text-muted-foreground text-sm max-w-md">
                  Enter an email address to preview this template or send it for signing.
                </p>
              </div>

              <div className="w-full max-w-sm space-y-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Signer Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="signer@example.com"
                    className="bg-secondary border text-foreground"
                  />
                </div>

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleStart}
                  disabled={!email}
                >
                  <FileSignature className="mr-2 h-4 w-4" />
                  Open Signing Form
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full border text-foreground"
                  onClick={() => window.open(`${baseUrl}/templates/${templateId}`, '_blank')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in DocuSeal
                </Button>
              </div>
            </div>
          ) : completed ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <FileSignature className="h-8 w-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-medium text-foreground">Document Signed!</h3>
              <p className="text-muted-foreground text-sm text-center max-w-md">
                The document has been successfully signed. You can close this dialog.
              </p>
              <Button
                variant="outline"
                className="border text-foreground"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden rounded-lg border border">
              <DocusealForm
                src={embedSrc}
                email={email}
                onComplete={handleComplete}
                className="w-full h-full"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Simpler preview component for just viewing a template
interface DocuSealPreviewProps {
  slug: string;
  baseUrl?: string;
}

export function DocuSealPreview({ slug, baseUrl = 'https://sign.dispotree.com' }: DocuSealPreviewProps) {
  return (
    <iframe
      src={`${baseUrl}/d/${slug}`}
      className="w-full h-full border-0"
      title="DocuSeal Preview"
    />
  );
}
