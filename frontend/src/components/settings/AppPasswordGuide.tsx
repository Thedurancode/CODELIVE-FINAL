'use client';

import { ExternalLink, HelpCircle, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EMAIL_PROVIDER_SETUP, type EmailProviderKey } from '@/hooks/use-user-email-config';

interface AppPasswordGuideProps {
  provider: EmailProviderKey;
  showAlert?: boolean;
}

export function AppPasswordGuide({ provider, showAlert = true }: AppPasswordGuideProps) {
  const setup = EMAIL_PROVIDER_SETUP[provider];

  if (!setup.requiresAppPassword) {
    return null;
  }

  return (
    <div className="space-y-3">
      {showAlert && (
        <Alert>
          <Key className="h-4 w-4" />
          <AlertTitle>{setup.name} requires an App Password</AlertTitle>
          <AlertDescription>
            Most accounts have 2-Step Verification enabled, which requires an App Password for email apps like CodeLive.
          </AlertDescription>
        </Alert>
      )}

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="guide" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 text-sm font-medium">
              <HelpCircle className="h-4 w-4" />
              How to get your {setup.name} App Password
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                {setup.steps.map((step, index) => (
                  <li key={index} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap gap-2 pt-2">
                {setup.appPasswordUrl && (
                  <Button
                    variant="default"
                    size="sm"
                    asChild
                  >
                    <a
                      href={setup.appPasswordUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open {setup.name}
                      <ExternalLink className="ml-2 h-3 w-3" />
                    </a>
                  </Button>
                )}
                {setup.helpUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a
                      href={setup.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Need more help?
                      <ExternalLink className="ml-2 h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

interface AppPasswordErrorGuideProps {
  provider: EmailProviderKey;
  errorMessage?: string;
}

export function AppPasswordErrorGuide({ provider, errorMessage }: AppPasswordErrorGuideProps) {
  const setup = EMAIL_PROVIDER_SETUP[provider];

  const isAuthError = errorMessage?.toLowerCase().includes('auth') ||
    errorMessage?.toLowerCase().includes('credentials') ||
    errorMessage?.toLowerCase().includes('password') ||
    errorMessage?.toLowerCase().includes('login');

  const isConnectionError = errorMessage?.toLowerCase().includes('connect') ||
    errorMessage?.toLowerCase().includes('timeout') ||
    errorMessage?.toLowerCase().includes('network') ||
    errorMessage?.toLowerCase().includes('host') ||
    errorMessage?.toLowerCase().includes('enotfound') ||
    errorMessage?.toLowerCase().includes('refused');

  // Show auth error UI
  if (isAuthError || setup.requiresAppPassword) {
    return (
      <Alert variant="destructive">
        <Key className="h-4 w-4" />
        <AlertTitle>Authentication Failed</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Your password was rejected. This usually means:
          </p>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>You need an App Password (not your regular password)</li>
            <li>The App Password was typed incorrectly</li>
            {!setup.requiresAppPassword && (
              <li>Your IMAP credentials are incorrect</li>
            )}
          </ul>
          {setup.requiresAppPassword && setup.appPasswordUrl && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-background"
                asChild
              >
                <a
                  href={setup.appPasswordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Generate App Password
                  <ExternalLink className="ml-2 h-3 w-3" />
                </a>
              </Button>
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // Show connection error UI
  if (isConnectionError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Connection Failed</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Could not connect to the email server.</p>
          {errorMessage && (
            <p className="text-sm font-mono bg-destructive/10 p-2 rounded">
              {errorMessage}
            </p>
          )}
          <ul className="list-disc list-inside text-sm space-y-1 pt-2">
            <li>Check your IMAP host and port settings</li>
            <li>Make sure your firewall allows the connection</li>
            <li>Verify the server supports SSL/TLS if enabled</li>
          </ul>
        </AlertDescription>
      </Alert>
    );
  }

  // Show generic error UI for any other error
  return (
    <Alert variant="destructive">
      <AlertTitle>Connection Test Failed</AlertTitle>
      <AlertDescription className="space-y-2">
        {errorMessage ? (
          <p className="text-sm font-mono bg-destructive/10 p-2 rounded">
            {errorMessage}
          </p>
        ) : (
          <p>An unknown error occurred while testing the connection.</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
