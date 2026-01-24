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
  Github,
} from 'lucide-react';
import {
  useSpritesConfig,
  useSetSpritesToken,
  useRemoveSpritesToken,
  useGitHubConfig,
  useSetGitHubToken,
  useRemoveGitHubToken,
} from '@/hooks/use-sprites';

export function SpriteSettings() {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [showGithubToken, setShowGithubToken] = useState(false);

  const { data: config, isLoading: loadingConfig, refetch } = useSpritesConfig();
  const { data: githubConfig, isLoading: loadingGithubConfig, refetch: refetchGithub } = useGitHubConfig();
  const setSpritesToken = useSetSpritesToken();
  const removeSpritesToken = useRemoveSpritesToken();
  const setGitHubToken = useSetGitHubToken();
  const removeGitHubToken = useRemoveGitHubToken();

  const handleSaveToken = async () => {
    if (!token.trim()) {
      toast.error('Please enter an API token');
      return;
    }

    try {
      await setSpritesToken.mutateAsync(token.trim());
      toast.success('Coding Agents API token saved successfully');
      setToken('');
      refetch();
    } catch (error) {
      toast.error('Failed to save Coding Agents API token');
    }
  };

  const handleRemoveToken = async () => {
    try {
      await removeSpritesToken.mutateAsync();
      toast.success('Coding Agents API token removed');
      refetch();
    } catch (error) {
      toast.error('Failed to remove Coding Agents API token');
    }
  };

  const handleSaveGithubToken = async () => {
    if (!githubToken.trim()) {
      toast.error('Please enter a GitHub token');
      return;
    }

    // Validate token format
    if (!githubToken.startsWith('ghp_') && !githubToken.startsWith('github_pat_')) {
      toast.error('Invalid GitHub token format. Token should start with "ghp_" (classic) or "github_pat_" (fine-grained)');
      return;
    }

    try {
      await setGitHubToken.mutateAsync(githubToken.trim());
      toast.success('GitHub token saved successfully. New coding agents will be authenticated with GitHub.');
      setGithubToken('');
      refetchGithub();
    } catch (error) {
      toast.error('Failed to save GitHub token');
    }
  };

  const handleRemoveGithubToken = async () => {
    try {
      await removeGitHubToken.mutateAsync();
      toast.success('GitHub token removed');
      refetchGithub();
    } catch (error) {
      toast.error('Failed to remove GitHub token');
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
              Coding Agents
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
              Persistent Linux environments with Claude Code for your projects (powered by Sprites)
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
                Coding Agents are persistent, hardware-isolated Linux environments that can run
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
                Learn more about Coding Agents
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
                Active Coding Agents
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
                  placeholder={config?.configured ? '••••••••••••••••' : 'Enter your Coding Agents API token'}
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
                  <AlertDialogTitle>Remove Coding Agents API Token?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will disconnect Coding Agents integration. Your existing coding agents will
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

        {/* GitHub Token Configuration */}
        <div className="border-t pt-6 mt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-800">
              <Github className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-medium flex items-center gap-2">
                GitHub Authentication
                {loadingGithubConfig ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : githubConfig?.configured ? (
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
              </h3>
              <p className="text-sm text-muted-foreground">
                Allow coding agents to push commits and create pull requests
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-blue-900/20 bg-blue-900/10 p-4 mb-4">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="text-blue-100">
                  Configure a GitHub Personal Access Token to enable coding agents to:
                </p>
                <ul className="list-disc list-inside text-blue-200/80 space-y-1">
                  <li>Push commits to feature branches</li>
                  <li>Create pull requests via GitHub CLI</li>
                  <li>Access private repositories</li>
                </ul>
                <p className="text-blue-200/80 mt-2">
                  <strong>Required scopes:</strong> <code className="bg-blue-900/50 px-1 rounded">repo</code>, <code className="bg-blue-900/50 px-1 rounded">workflow</code>
                </p>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=Dispotree%20Sprites"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 mt-2"
                >
                  Create a new GitHub token
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="github-token">GitHub Personal Access Token</Label>
              {githubConfig?.tokenPrefix && (
                <p className="text-sm text-muted-foreground mb-2">
                  Current token: <code className="bg-muted px-1 rounded">{githubConfig.tokenPrefix}...</code>
                </p>
              )}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="github-token"
                    type={showGithubToken ? 'text' : 'password'}
                    placeholder={githubConfig?.configured ? '••••••••••••••••' : 'ghp_... or github_pat_...'}
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowGithubToken(!showGithubToken)}
                  >
                    {showGithubToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button
                  onClick={handleSaveGithubToken}
                  disabled={setGitHubToken.isPending || !githubToken.trim()}
                >
                  {setGitHubToken.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>

            {/* Remove GitHub Token */}
            {githubConfig?.configured && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-red-500 border-red-900/50 hover:bg-red-900/20">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove GitHub Token
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove GitHub Token?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove GitHub authentication for new coding agents. Existing coding agents
                      will keep their configured credentials until they are recreated.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemoveGithubToken}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {removeGitHubToken.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
