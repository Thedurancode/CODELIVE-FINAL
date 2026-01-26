/**
 * MCP Registry Browser
 *
 * Browse and install MCP servers from the official registry.
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Loader2,
  Package,
  ExternalLink,
  Github,
  Download,
  Check,
  AlertCircle,
  Terminal,
  Code2,
  FileCode,
  Globe,
} from 'lucide-react';
import { useMcpRegistrySearch, useMcpRegistryPopular, useInstallMcpFromRegistry } from '@/hooks/use-sprites';
import type { McpRegistryServer } from '@/types/sprite';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface McpRegistryBrowserProps {
  spriteId: string | null | undefined;
  onInstalled?: (serverName: string) => void;
  className?: string;
}

// Package registry colors and icons
const REGISTRY_COLORS: Record<string, string> = {
  npm: 'bg-red-500/20 text-red-400 border-red-500/30',
  pypi: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cargo: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  docker: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

function ServerCard({
  server,
  onSelect,
  installing,
}: {
  server: McpRegistryServer;
  onSelect: (server: McpRegistryServer) => void;
  installing: boolean;
}) {
  const primaryPackage = server.packages?.[0];

  return (
    <Card
      className={cn(
        'bg-muted/50 border-border/50 hover:border-primary/30 cursor-pointer transition-all',
        installing && 'opacity-50 pointer-events-none'
      )}
      onClick={() => onSelect(server)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-sm truncate">{server.name}</h3>
              {primaryPackage && (
                <Badge variant="outline" className={cn('text-xs', REGISTRY_COLORS[primaryPackage.registry])}>
                  {primaryPackage.registry}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {server.description || 'No description available'}
            </p>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              {server.version && <span>v{server.version}</span>}
              {server.tools && server.tools.length > 0 && (
                <span className="flex items-center gap-1">
                  <Terminal className="h-3 w-3" />
                  {server.tools.length} tools
                </span>
              )}
            </div>
          </div>
          <Button size="sm" variant="ghost" className="shrink-0">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ServerDetailDialog({
  server,
  spriteId,
  open,
  onOpenChange,
  onInstalled,
}: {
  server: McpRegistryServer | null;
  spriteId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled?: (serverName: string) => void;
}) {
  const installMutation = useInstallMcpFromRegistry();
  const [installed, setInstalled] = useState(false);

  if (!server) return null;

  const primaryPackage = server.packages?.[0];

  const handleInstall = async () => {
    if (!spriteId) {
      toast.error('No sprite available', { description: 'Please launch a sprite first' });
      return;
    }

    try {
      await installMutation.mutateAsync({
        spriteId,
        serverName: server.name,
      });
      setInstalled(true);
      toast.success(`Installed ${server.name}`, {
        description: 'MCP server installed successfully',
      });
      onInstalled?.(server.name);
    } catch (error) {
      toast.error('Installation failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2">
                {server.name}
                {primaryPackage && (
                  <Badge variant="outline" className={cn('text-xs', REGISTRY_COLORS[primaryPackage.registry])}>
                    {primaryPackage.registry}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                v{server.version} {server.license && `• ${server.license}`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Description */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-sm">{server.description || 'No description available'}</p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-2">
            {server.repository?.url && (
              <Button variant="outline" size="sm" asChild>
                <a href={server.repository.url} target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4 mr-1" />
                  Repository
                </a>
              </Button>
            )}
            {server.website && (
              <Button variant="outline" size="sm" asChild>
                <a href={server.website} target="_blank" rel="noopener noreferrer">
                  <Globe className="h-4 w-4 mr-1" />
                  Website
                </a>
              </Button>
            )}
          </div>

          {/* Tools */}
          {server.tools && server.tools.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Available Tools ({server.tools.length})
              </h4>
              <div className="flex flex-wrap gap-1">
                {server.tools.slice(0, 10).map((tool) => (
                  <Badge key={tool} variant="secondary" className="text-xs">
                    {tool}
                  </Badge>
                ))}
                {server.tools.length > 10 && (
                  <Badge variant="secondary" className="text-xs">
                    +{server.tools.length - 10} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Install Command */}
          {server.installCommand && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                Install Command
              </h4>
              <div className="p-2 rounded bg-secondary/50 font-mono text-xs overflow-x-auto">
                {server.installCommand}
              </div>
            </div>
          )}

          {/* Run Command */}
          {server.runCommand && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <FileCode className="h-4 w-4" />
                Run Command
              </h4>
              <div className="p-2 rounded bg-secondary/50 font-mono text-xs overflow-x-auto">
                {server.runCommand}
              </div>
            </div>
          )}

          {/* Environment Variables */}
          {primaryPackage?.environmentVariables && primaryPackage.environmentVariables.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 text-amber-400">Required Environment Variables</h4>
              <div className="flex flex-wrap gap-1">
                {primaryPackage.environmentVariables.map((env) => (
                  <Badge key={env} variant="outline" className="text-xs text-amber-400 border-amber-400/30">
                    {env}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleInstall}
            disabled={!spriteId || installMutation.isPending || installed}
            className={cn(
              installed && 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
            )}
          >
            {installMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Installing...
              </>
            ) : installed ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Installed
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Install to Sprite
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function McpRegistryBrowser({ spriteId, onInstalled, className }: McpRegistryBrowserProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedServer, setSelectedServer] = useState<McpRegistryServer | null>(null);

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    // Simple debounce
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data: searchResults, isLoading: searchLoading, error: searchError } = useMcpRegistrySearch(
    debouncedSearch || undefined,
    { limit: 50 }
  );

  const { data: popularServers, isLoading: popularLoading } = useMcpRegistryPopular();

  const servers = debouncedSearch ? searchResults : popularServers;
  const isLoading = debouncedSearch ? searchLoading : popularLoading;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Search Header */}
      <div className="p-4 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search MCP servers..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 bg-muted/50 border-border/50"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {debouncedSearch
            ? `Searching for "${debouncedSearch}"`
            : 'Showing popular MCP servers from registry.modelcontextprotocol.io'}
        </p>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : searchError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mb-2" />
              <p className="text-sm text-muted-foreground">Failed to load servers</p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchError instanceof Error ? searchError.message : 'Unknown error'}
              </p>
            </div>
          ) : !servers || servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No servers found</p>
              {debouncedSearch && (
                <p className="text-xs text-muted-foreground mt-1">
                  Try a different search term
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {servers.length} server{servers.length !== 1 ? 's' : ''} available
              </p>
              {servers.map((server) => (
                <ServerCard
                  key={server.name}
                  server={server}
                  onSelect={setSelectedServer}
                  installing={false}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* External Link */}
      <div className="p-4 border-t border-border/50">
        <Button variant="outline" size="sm" className="w-full" asChild>
          <a
            href="https://registry.modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Browse Full Registry
          </a>
        </Button>
      </div>

      {/* Server Detail Dialog */}
      <ServerDetailDialog
        server={selectedServer}
        spriteId={spriteId}
        open={!!selectedServer}
        onOpenChange={(open) => !open && setSelectedServer(null)}
        onInstalled={(name) => {
          onInstalled?.(name);
          setSelectedServer(null);
        }}
      />
    </div>
  );
}

export default McpRegistryBrowser;
