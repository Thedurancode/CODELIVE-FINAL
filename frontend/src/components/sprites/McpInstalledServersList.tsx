/**
 * MCP Installed Servers List
 *
 * Component showing all installed MCP servers on a sprite with status,
 * start/stop controls, and configuration options.
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2,
  Play,
  Square,
  Settings,
  Trash2,
  ChevronDown,
  ChevronRight,
  Package,
  MoreVertical,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Power,
  RefreshCw,
  Key,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useInstalledMcpServers,
  useStartMcpServer,
  useStopMcpServer,
  useUninstallMcpServer,
  useUpdateMcpServerConfig,
  useMcpServerUpdates,
  useUpdateMcpServer,
} from '@/hooks/use-sprites';
import type { InstalledMcpServer, McpInstalledServerStatus } from '@/types/sprite';
import { McpServerConfigDialog } from './McpServerConfigDialog';
import { McpServerUpdateBadge } from './McpServerUpdateBadge';
import { McpUpdateDialog } from './McpUpdateDialog';

interface McpInstalledServersListProps {
  spriteId: string | null | undefined;
  isActive: boolean;
  className?: string;
}

// Status badge styles
const STATUS_STYLES: Record<McpInstalledServerStatus, { color: string; Icon: React.ElementType; label: string }> = {
  pending: { color: 'text-yellow-400 border-yellow-400/30', Icon: Clock, label: 'Pending' },
  installed: { color: 'text-blue-400 border-blue-400/30', Icon: Package, label: 'Installed' },
  running: { color: 'text-green-400 border-green-400/30', Icon: CheckCircle2, label: 'Running' },
  stopped: { color: 'text-zinc-400 border-zinc-400/30', Icon: Square, label: 'Stopped' },
  error: { color: 'text-red-400 border-red-400/30', Icon: XCircle, label: 'Error' },
  uninstalled: { color: 'text-zinc-500 border-zinc-500/30', Icon: Trash2, label: 'Uninstalled' },
};

function ServerStatusBadge({ status }: { status: McpInstalledServerStatus }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.stopped;
  const { color, Icon, label } = style;

  return (
    <Badge variant="outline" className={cn('text-xs gap-1', color)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function ServerCard({
  server,
  spriteId,
  isActive,
  onConfigure,
  onUpdate,
}: {
  server: InstalledMcpServer;
  spriteId: string;
  isActive: boolean;
  onConfigure: (serverName: string) => void;
  onUpdate?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showUninstallDialog, setShowUninstallDialog] = useState(false);

  const startServer = useStartMcpServer();
  const stopServer = useStopMcpServer();
  const uninstallServer = useUninstallMcpServer();
  const updateConfig = useUpdateMcpServerConfig();
  const updateServer = useUpdateMcpServer();

  const isLoading = startServer.isPending || stopServer.isPending || uninstallServer.isPending;
  const hasUpdate = server.packageVersion && server.latestVersion && server.packageVersion !== server.latestVersion;

  const handleUpdate = async () => {
    try {
      await updateServer.mutateAsync({ spriteId, serverName: server.serverName });
      toast.success(`Updated ${server.displayName || server.serverName}`);
      onUpdate?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update server');
    }
  };
  const canStart = ['installed', 'stopped', 'error'].includes(server.status) && isActive;
  const canStop = server.status === 'running' && isActive;

  const handleStart = async () => {
    try {
      await startServer.mutateAsync({ spriteId, serverName: server.serverName });
      toast.success(`Started ${server.displayName || server.serverName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start server');
    }
  };

  const handleStop = async () => {
    try {
      await stopServer.mutateAsync({ spriteId, serverName: server.serverName });
      toast.success(`Stopped ${server.displayName || server.serverName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to stop server');
    }
  };

  const handleUninstall = async () => {
    try {
      await uninstallServer.mutateAsync({ spriteId, serverName: server.serverName });
      toast.success(`Uninstalled ${server.displayName || server.serverName}`);
      setShowUninstallDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to uninstall server');
    }
  };

  const handleToggleAutoStart = async (autoStart: boolean) => {
    try {
      await updateConfig.mutateAsync({
        spriteId,
        serverName: server.serverName,
        autoStart,
      });
      toast.success(`Auto-start ${autoStart ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update auto-start');
    }
  };

  return (
    <>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center gap-3 p-3 hover:bg-secondary/30 transition-colors text-left">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <Package className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">
                    {server.displayName || server.serverName}
                  </span>
                  <ServerStatusBadge status={server.status} />
                  {hasUpdate && (
                    <McpServerUpdateBadge
                      currentVersion={server.packageVersion}
                      latestVersion={server.latestVersion}
                      changelogUrl={server.changelogUrl}
                      registryUrl={server.registryUrl}
                      isUpdating={updateServer.isPending}
                      onUpdate={isActive ? handleUpdate : undefined}
                      compact
                    />
                  )}
                  {!server.hasEnvConfig && server.status !== 'running' && (
                    <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30 gap-1">
                      <Key className="h-3 w-3" />
                      Config needed
                    </Badge>
                  )}
                </div>
                {server.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {server.description}
                  </p>
                )}
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {canStart && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-green-400 hover:text-green-300"
                    onClick={handleStart}
                    disabled={isLoading}
                  >
                    {startServer.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {canStop && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-yellow-400 hover:text-yellow-300"
                    onClick={handleStop}
                    disabled={isLoading}
                  >
                    {stopServer.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onConfigure(server.serverName)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Configure
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setShowUninstallDialog(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Uninstall
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="border-t border-border/50 p-3 space-y-3 bg-muted/20">
              {/* Server details */}
              <div className="text-xs space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Registry:</span>
                  <Badge variant="outline" className="text-xs">
                    {server.registry}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Package:</span>
                  <span className="font-mono">{server.packageName || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Version:</span>
                  <McpServerUpdateBadge
                    currentVersion={server.packageVersion}
                    latestVersion={server.latestVersion}
                    changelogUrl={server.changelogUrl}
                    registryUrl={server.registryUrl}
                    isUpdating={updateServer.isPending}
                    onUpdate={isActive && hasUpdate ? handleUpdate : undefined}
                    showVersions={true}
                  />
                </div>
                {server.tools && server.tools.length > 0 && (
                  <div className="flex justify-between">
                    <span>Tools:</span>
                    <span>{server.tools.length}</span>
                  </div>
                )}
              </div>

              {/* Auto-start toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs">
                  <Power className="h-4 w-4 text-muted-foreground" />
                  <span>Auto-start on resume</span>
                </div>
                <Switch
                  checked={server.autoStart}
                  onCheckedChange={handleToggleAutoStart}
                  disabled={updateConfig.isPending}
                />
              </div>

              {/* Error message */}
              {server.status === 'error' && server.errorMessage && (
                <div className="p-2 rounded bg-red-500/10 border border-red-500/30">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-400">{server.errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Configure button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 gap-1.5"
                onClick={() => onConfigure(server.serverName)}
              >
                <Settings className="h-4 w-4" />
                Configure Environment Variables
              </Button>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Uninstall confirmation dialog */}
      <AlertDialog open={showUninstallDialog} onOpenChange={setShowUninstallDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall {server.displayName || server.serverName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the server from this sprite. Any environment variable configuration
              will be lost. You can reinstall it later from the registry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUninstall}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {uninstallServer.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Uninstall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function McpInstalledServersList({
  spriteId,
  isActive,
  className,
}: McpInstalledServersListProps) {
  const [configureServer, setConfigureServer] = useState<string | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const { data: servers, isLoading, refetch } = useInstalledMcpServers(spriteId);
  const { data: updateData } = useMcpServerUpdates(spriteId);

  const updatesAvailable = updateData?.updatesAvailable || 0;

  if (!spriteId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No sprite selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!servers || servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No MCP servers installed</p>
        <p className="text-xs text-muted-foreground mt-1">
          Browse the registry to install servers
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {servers.length} server{servers.length !== 1 ? 's' : ''} installed
        </span>
        <div className="flex items-center gap-2">
          {updatesAvailable > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
              onClick={() => setShowUpdateDialog(true)}
            >
              <Download className="h-3 w-3" />
              {updatesAvailable} Update{updatesAvailable !== 1 ? 's' : ''}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-2 pr-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              spriteId={spriteId}
              isActive={isActive}
              onConfigure={setConfigureServer}
              onUpdate={refetch}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Configuration dialog */}
      <McpServerConfigDialog
        spriteId={spriteId}
        serverName={configureServer}
        open={!!configureServer}
        onOpenChange={(open) => !open && setConfigureServer(null)}
        onSaved={() => refetch()}
      />

      {/* Update dialog */}
      {spriteId && (
        <McpUpdateDialog
          spriteId={spriteId}
          open={showUpdateDialog}
          onOpenChange={setShowUpdateDialog}
        />
      )}
    </div>
  );
}

export default McpInstalledServersList;
