/**
 * MCP Update Dialog
 *
 * Dialog for previewing and confirming MCP server updates.
 * Shows version comparison, changelog link, and handles the update process.
 */

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  Download,
  Package,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useMcpServerUpdates,
  useUpdateMcpServer,
  useUpdateAllMcpServers,
  useCheckMcpUpdates,
} from '@/hooks/use-sprites';
import type { McpServerUpdateInfo } from '@/types/sprite';

interface McpUpdateDialogProps {
  spriteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialServerName?: string; // Pre-select a specific server
}

function ServerUpdateRow({
  server,
  spriteId,
  onUpdated,
}: {
  server: McpServerUpdateInfo;
  spriteId: string;
  onUpdated: () => void;
}) {
  const updateServer = useUpdateMcpServer();
  const isUpdating = updateServer.isPending;

  const handleUpdate = async () => {
    try {
      await updateServer.mutateAsync({ spriteId, serverName: server.serverName });
      toast.success(`Updated ${server.displayName || server.serverName}`);
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update server');
    }
  };

  if (!server.hasUpdate) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
        <div className="flex items-center gap-3">
          <Package className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">{server.displayName || server.serverName}</div>
            <div className="text-xs text-muted-foreground">
              v{server.currentVersion || 'unknown'}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Up to date
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
      <div className="flex items-center gap-3">
        <Package className="h-4 w-4 text-amber-400" />
        <div>
          <div className="text-sm font-medium">{server.displayName || server.serverName}</div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">v{server.currentVersion}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-green-400 font-medium">v{server.latestVersion}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {server.changelogUrl && (
          <a
            href={server.changelogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
          onClick={handleUpdate}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          Update
        </Button>
      </div>
    </div>
  );
}

export function McpUpdateDialog({
  spriteId,
  open,
  onOpenChange,
  initialServerName,
}: McpUpdateDialogProps) {
  const [showUpdateAllConfirm, setShowUpdateAllConfirm] = useState(false);

  const { data: updateData, isLoading, refetch } = useMcpServerUpdates(open ? spriteId : null);
  const checkUpdates = useCheckMcpUpdates();
  const updateAllServers = useUpdateAllMcpServers();

  const servers = updateData?.servers || [];
  const updatesAvailable = updateData?.updatesAvailable || 0;
  const serversWithUpdates = servers.filter((s) => s.hasUpdate);

  const handleCheckUpdates = async () => {
    try {
      await checkUpdates.mutateAsync({ spriteId });
      toast.success('Update check complete');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to check for updates');
    }
  };

  const handleUpdateAll = async () => {
    try {
      const result = await updateAllServers.mutateAsync({ spriteId });
      if (result.updated.length > 0) {
        toast.success(`Updated ${result.updated.length} server(s)`);
      }
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} server(s) failed to update`);
      }
      setShowUpdateAllConfirm(false);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update servers');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Download className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <DialogTitle>MCP Server Updates</DialogTitle>
                <DialogDescription>
                  {updatesAvailable > 0
                    ? `${updatesAvailable} update${updatesAvailable !== 1 ? 's' : ''} available`
                    : 'All servers are up to date'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No MCP servers installed</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                {/* Summary */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Last checked: </span>
                    <span>
                      {updateData?.checkedAt
                        ? new Date(updateData.checkedAt).toLocaleString()
                        : 'Never'}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5"
                    onClick={handleCheckUpdates}
                    disabled={checkUpdates.isPending}
                  >
                    {checkUpdates.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Check Now
                  </Button>
                </div>

                {/* Servers with updates */}
                {serversWithUpdates.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                        Updates Available
                      </h4>
                      {serversWithUpdates.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5"
                          onClick={() => setShowUpdateAllConfirm(true)}
                          disabled={updateAllServers.isPending}
                        >
                          {updateAllServers.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          Update All
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {serversWithUpdates.map((server) => (
                        <ServerUpdateRow
                          key={server.serverName}
                          server={server}
                          spriteId={spriteId}
                          onUpdated={refetch}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Up to date servers */}
                {servers.filter((s) => !s.hasUpdate).length > 0 && (
                  <>
                    {serversWithUpdates.length > 0 && <Separator />}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        Up to Date
                      </h4>
                      <div className="space-y-2">
                        {servers
                          .filter((s) => !s.hasUpdate)
                          .map((server) => (
                            <ServerUpdateRow
                              key={server.serverName}
                              server={server}
                              spriteId={spriteId}
                              onUpdated={refetch}
                            />
                          ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update All Confirmation */}
      <AlertDialog open={showUpdateAllConfirm} onOpenChange={setShowUpdateAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update All Servers?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update {serversWithUpdates.length} MCP server
              {serversWithUpdates.length !== 1 ? 's' : ''} to their latest versions. Your
              configuration (environment variables, auto-start settings) will be preserved.
              <br />
              <br />
              Running servers will be stopped, updated, and restarted automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUpdateAll}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              {updateAllServers.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Update All
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default McpUpdateDialog;
