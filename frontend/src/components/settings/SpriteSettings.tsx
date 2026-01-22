/**
 * SpriteSettings
 *
 * Settings component for configuring Sprites integration.
 * Allows users to set the Sprites API token and view configuration status.
 */

'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Bot,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Trash2,
  Server,
  Info,
} from 'lucide-react';
import {
  useSpritesConfig,
  useSetSpritesToken,
  useRemoveSpritesToken,
} from '@/hooks/use-sprites';

export function SpriteSettings() {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const { data: config, isLoading: loadingConfig, refetch } = useSpritesConfig();
  const setSpritesToken = useSetSpritesToken();
  const removeSpritesToken = useRemoveSpritesToken();

  const handleSaveToken = async () => {
    if (!token.trim()) {
      toast.error('Please enter an API token');
      return;
    }

    try {
      await setSpritesToken.mutateAsync(token.trim());
      toast.success('Sprites API token saved successfully');
      setToken('');
      refetch();
    } catch (error) {
      toast.error('Failed to save Sprites API token');
    }
  };

  const handleRemoveToken = async () => {
    try {
      await removeSpritesToken.mutateAsync();
      toast.success('Sprites API token removed');
      refetch();
    } catch (error) {
      toast.error('Failed to remove Sprites API token');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600/10">
            <Bot className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              Claude Sprites
              {loadingConfig ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : config?.configured ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Configured
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="mr-1 h-3 w-3" />
                  Not Configured
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Persistent Linux environments with Claude Code for your projects
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Info Section */}
        <div className="rounded-lg border border-purple-900/20 bg-purple-900/10 p-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="text-purple-100">
                Sprites are persistent, hardware-isolated Linux environments that can run
                Claude Code on your project repositories.
              </p>
              <ul className="list-disc list-inside text-purple-200/80 space-y-1">
                <li>Clone and work on your GitHub repositories</li>
                <li>Run Claude Code with full terminal access</li>
                <li>Save checkpoints to preserve state</li>
                <li>Auto-hibernate after 30 seconds of inactivity</li>
              </ul>
              <a
                href="https://sprites.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 mt-2"
              >
                Learn more about Sprites
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Status Section */}
        {config && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Server className="h-4 w-4" />
                Service Status
              </div>
              <div className="font-medium">
                {config.serviceReady ? (
                  <span className="text-green-500">Ready</span>
                ) : (
                  <span className="text-yellow-500">Not Ready</span>
                )}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Bot className="h-4 w-4" />
                Active Sprites
              </div>
              <div className="font-medium">{config.activeSpritesCount}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CheckCircle2 className="h-4 w-4" />
                Token Status
              </div>
              <div className="font-medium">
                {config.configured ? (
                  <span className="text-green-500">Configured</span>
                ) : (
                  <span className="text-muted-foreground">Not Set</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Token Configuration */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="sprites-token">API Token</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Get your API token from{' '}
              <a
                href="https://sprites.dev/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300"
              >
                sprites.dev/settings
              </a>
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="sprites-token"
                  type={showToken ? 'text' : 'password'}
                  placeholder={config?.configured ? '••••••••••••••••' : 'Enter your Sprites API token'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button
                onClick={handleSaveToken}
                disabled={setSpritesToken.isPending || !token.trim()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {setSpritesToken.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>

          {/* Remove Token */}
          {config?.configured && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-500 border-red-900/50 hover:bg-red-900/20">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove Token
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Sprites API Token?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will disconnect Sprites integration. Your existing sprites will
                    remain on the Sprites platform but won't be accessible from this
                    application until you add a new token.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRemoveToken}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {removeSpritesToken.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
