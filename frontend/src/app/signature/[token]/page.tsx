'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { usePublicSignatureRequest, useUploadSignature } from '@/hooks/use-contact-signature';
import { SignatureCapture } from '@/components/signature/SignatureCapture';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Clock, Loader2, PenLine } from 'lucide-react';

/**
 * Public Signature Upload Page
 *
 * This page is accessed via a unique token link sent to contacts via SMS.
 * No authentication required - the token validates the request.
 */
export default function SignatureUploadPage() {
  const params = useParams();
  const token = params.token as string;
  const [isComplete, setIsComplete] = useState(false);

  // Fetch request details
  const { data: request, isLoading, error } = usePublicSignatureRequest(token);

  // Upload mutation
  const uploadMutation = useUploadSignature();

  // Handle signature capture and upload
  const handleCapture = async (file: File, cleanupStrength: number) => {
    try {
      await uploadMutation.mutateAsync({
        token,
        file,
        cleanupStrength,
      });
      setIsComplete(true);
    } catch (err) {
      // Error is handled by the mutation
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state - invalid or expired token
  if (error || !request) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
              <h1 className="text-xl font-semibold text-foreground mb-2">
                Invalid or Expired Link
              </h1>
              <p className="text-muted-foreground mb-6">
                This signature request link is no longer valid. It may have expired or already been used.
              </p>
              <p className="text-sm text-muted-foreground">
                Please contact the person who sent you this link to request a new one.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already completed
  if (request.status === 'completed' || isComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <h1 className="text-xl font-semibold text-foreground mb-2">
                {isComplete ? 'Signature Saved!' : 'Already Completed'}
              </h1>
              <p className="text-muted-foreground mb-6">
                {isComplete
                  ? 'Your signature has been successfully saved. You can close this page.'
                  : 'This signature request has already been completed.'}
              </p>
              {request.organizationName && (
                <p className="text-sm text-muted-foreground">
                  Thank you for providing your signature to {request.organizationName}.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Expired
  if (request.status === 'expired') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
                <Clock className="h-8 w-8 text-amber-500" />
              </div>
              <h1 className="text-xl font-semibold text-foreground mb-2">
                Link Expired
              </h1>
              <p className="text-muted-foreground mb-6">
                This signature request link has expired.
              </p>
              <p className="text-sm text-muted-foreground">
                Please contact the person who sent you this link to request a new one.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate time remaining
  const expiresAt = new Date(request.expiresAt);
  const now = new Date();
  const hoursRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));

  // Active request - show capture UI
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <PenLine className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Signature Request
          </h1>
          {request.contactName && (
            <p className="text-lg text-muted-foreground mt-1">
              Hello, {request.contactName}
            </p>
          )}
          {request.organizationName && (
            <p className="text-sm text-muted-foreground mt-2">
              {request.organizationName} has requested your signature on file.
            </p>
          )}
        </div>

        {/* Expiration warning */}
        {hoursRemaining <= 24 && (
          <div className="flex items-center gap-2 text-amber-500 text-sm justify-center">
            <Clock className="h-4 w-4" />
            <span>
              {hoursRemaining > 0
                ? `This link expires in ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`
                : 'This link expires soon'}
            </span>
          </div>
        )}

        {/* Error display */}
        {uploadMutation.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium text-red-500">Upload Failed</p>
                <p className="text-sm text-red-400 mt-1">
                  {uploadMutation.error.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Signature capture component */}
        <SignatureCapture
          onCapture={handleCapture}
          isUploading={uploadMutation.isPending}
        />
      </div>
    </div>
  );
}
