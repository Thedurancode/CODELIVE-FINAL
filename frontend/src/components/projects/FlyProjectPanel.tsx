/**
 * Fly.io Project Panel
 *
 * Manages Fly.io app linking and machine/certificate/secret management
 * within the project detail page. Mirrors the VercelProjectPanel UX.
 */

'use client';

import React, { useState } from 'react';
import {
  useFlyStatus,
  useFlyApps,
  useFlyApp,
  useCreateFlyApp,
  useFlyMachines,
  useStartFlyMachine,
  useStopFlyMachine,
  useRestartFlyMachine,
  useDeleteFlyMachine,
  useFlyCertificates,
  useAddFlyCertificate,
  useDeleteFlyCertificate,
  useCheckFlyCertificate,
  useFlySecrets,
  useSetFlySecrets,
} from '@/hooks/use-fly';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Plus,
  ExternalLink,
  Loader2,
  Link2,
  Server,
  Globe,
  Trash2,
  RefreshCw,
  Copy,
  Play,
  Square,
  RotateCw,
  Key,
  AlertCircle,
} from 'lucide-react';
import {
  MACHINE_STATE_COLORS,
  MACHINE_STATE_LABELS,
} from '@/types/fly';
import type { FlyApp, FlyCertificate } from '@/types/fly';

// ============================================================================
// HELPERS
// ============================================================================

function timeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function MachineStateBadge({ state }: { state: string }) {
  const color = MACHINE_STATE_COLORS[state] || 'bg-gray-500';
  const label = MACHINE_STATE_LABELS[state] || state;
  return (
    <Badge variant="outline" className="text-xs gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </Badge>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface FlyProjectPanelProps {
  projectId: string;
  flyAppName?: string | null;
  onFlyLinked?: (appName: string) => void;
}

export function FlyProjectPanel({
  projectId,
  flyAppName: initialFlyAppName,
  onFlyLinked,
}: FlyProjectPanelProps) {
  const [linkedAppName, setLinkedAppName] = useState<string | null>(initialFlyAppName || null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);

  const { data: status, isLoading: statusLoading } = useFlyStatus();
  const { data: flyApps } = useFlyApps();
  const { data: linkedApp } = useFlyApp(linkedAppName);
  const { data: machines } = useFlyMachines(linkedAppName);

  const createMutation = useCreateFlyApp();
  const startMutation = useStartFlyMachine();
  const stopMutation = useStopFlyMachine();
  const restartMutation = useRestartFlyMachine();
  const deleteMachineMutation = useDeleteFlyMachine();

  const { data: certificates, isLoading: certsLoading } = useFlyCertificates(linkedAppName);
  const addCertMutation = useAddFlyCertificate();
  const deleteCertMutation = useDeleteFlyCertificate();
  const checkCertMutation = useCheckFlyCertificate();

  const { data: secrets, isLoading: secretsLoading } = useFlySecrets(linkedAppName);
  const setSecretsMutation = useSetFlySecrets();

  // ──────────────────────────────────────────────────────────────────────────
  // NOT CONFIGURED
  // ──────────────────────────────────────────────────────────────────────────

  if (statusLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status?.configured) {
    return (
      <Card className="border-dashed">
        <CardContent className="text-center py-8">
          <Server className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Fly.io Not Configured</p>
          <p className="text-sm text-muted-foreground mt-1">
            Set the <code className="text-xs bg-muted px-1 py-0.5 rounded">FLY_API_TOKEN</code> environment variable on the backend to enable Fly.io integration.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ──────────────────────────────────────────────────────────────────────────

  const handleCreate = async (name: string) => {
    try {
      const app = await createMutation.mutateAsync({ name });
      setLinkedAppName(app.name);
      onFlyLinked?.(app.name);
      toast.success(`Fly.io app "${app.name}" created`);
      setIsCreateDialogOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleLink = (app: FlyApp) => {
    setLinkedAppName(app.name);
    onFlyLinked?.(app.name);
    toast.success(`Linked to "${app.name}"`);
    setIsLinkDialogOpen(false);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // NO APP LINKED
  // ──────────────────────────────────────────────────────────────────────────

  if (!linkedAppName) {
    return (
      <>
        <Card className="border-dashed">
          <CardContent className="text-center py-8">
            <Server className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="font-medium">No Fly.io App Linked</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create a new Fly.io app or link an existing one.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create App
              </Button>
              <Button variant="outline" onClick={() => setIsLinkDialogOpen(true)}>
                <Link2 className="h-4 w-4 mr-2" />
                Link Existing
              </Button>
            </div>
          </CardContent>
        </Card>

        <CreateAppDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          onCreate={handleCreate}
          isPending={createMutation.isPending}
        />

        <LinkAppDialog
          open={isLinkDialogOpen}
          onOpenChange={setIsLinkDialogOpen}
          apps={flyApps || []}
          onLink={handleLink}
        />
      </>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // APP LINKED — FULL VIEW
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* App Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              <div>
                <CardTitle className="text-base">
                  {linkedApp?.name || linkedAppName}
                </CardTitle>
                <CardDescription>
                  {linkedApp?.hostname || `${linkedAppName}.fly.dev`}
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`https://fly.io/apps/${linkedAppName}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLinkedAppName(null);
                  onFlyLinked?.('');
                }}
              >
                Unlink
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Machines */}
      <MachinesCard
        appName={linkedAppName}
        machines={machines || []}
        startMutation={startMutation}
        stopMutation={stopMutation}
        restartMutation={restartMutation}
        deleteMutation={deleteMachineMutation}
      />

      {/* Certificates (Custom Domains) */}
      <CertificatesCard
        appName={linkedAppName}
        certificates={certificates || []}
        isLoading={certsLoading}
        addCertMutation={addCertMutation}
        deleteCertMutation={deleteCertMutation}
        checkCertMutation={checkCertMutation}
      />

      {/* Secrets */}
      <SecretsCard
        appName={linkedAppName}
        secrets={secrets || []}
        isLoading={secretsLoading}
        setSecretsMutation={setSecretsMutation}
      />

      {/* Create Dialog */}
      <CreateAppDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreate={handleCreate}
        isPending={createMutation.isPending}
      />

      {/* Link Dialog */}
      <LinkAppDialog
        open={isLinkDialogOpen}
        onOpenChange={setIsLinkDialogOpen}
        apps={flyApps || []}
        onLink={handleLink}
      />
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function CreateAppDialog({
  open,
  onOpenChange,
  onCreate,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Fly.io App</DialogTitle>
          <DialogDescription>
            Create a new app on Fly.io. The name must be globally unique.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="my-app-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onCreate(name.trim());
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onCreate(name.trim())} disabled={isPending || !name.trim()}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkAppDialog({
  open,
  onOpenChange,
  apps,
  onLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: FlyApp[];
  onLink: (app: FlyApp) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Link Fly.io App</DialogTitle>
          <DialogDescription>
            Select an existing Fly.io app to link.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {apps.length > 0 ? (
            apps.map((app) => (
              <button
                key={app.id}
                onClick={() => onLink(app)}
                className="w-full flex items-center justify-between p-3 rounded-md border hover:bg-muted transition-colors text-left"
              >
                <div>
                  <div className="font-medium text-sm">{app.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {app.hostname}
                    {app.organization && ` \u00B7 ${app.organization}`}
                  </div>
                </div>
                <Link2 className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No Fly.io apps found</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MachinesCard({
  appName,
  machines,
  startMutation,
  stopMutation,
  restartMutation,
  deleteMutation,
}: {
  appName: string;
  machines: Array<{ id: string; name: string; state: string; region: string; image: string; createdAt: string; updatedAt: string }>;
  startMutation: ReturnType<typeof useStartFlyMachine>;
  stopMutation: ReturnType<typeof useStopFlyMachine>;
  restartMutation: ReturnType<typeof useRestartFlyMachine>;
  deleteMutation: ReturnType<typeof useDeleteFlyMachine>;
}) {
  const [machineToDelete, setMachineToDelete] = useState<string | null>(null);

  const handleStart = async (machineId: string) => {
    try {
      await startMutation.mutateAsync({ appName, machineId });
      toast.success('Machine starting...');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleStop = async (machineId: string) => {
    try {
      await stopMutation.mutateAsync({ appName, machineId });
      toast.success('Machine stopping...');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRestart = async (machineId: string) => {
    try {
      await restartMutation.mutateAsync({ appName, machineId });
      toast.success('Machine restarting...');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async (machineId: string) => {
    try {
      await deleteMutation.mutateAsync({ appName, machineId });
      toast.success('Machine deleted');
      setMachineToDelete(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const isRunning = (state: string) => state === 'started' || state === 'running';
  const isStopped = (state: string) => state === 'stopped' || state === 'created' || state === 'suspended';

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              Machines
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {machines.length} machine{machines.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {machines.length > 0 ? (
            <div className="space-y-2">
              {machines.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.region.toUpperCase()} &middot; {m.image.length > 40 ? m.image.substring(0, 40) + '...' : m.image}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <MachineStateBadge state={m.state} />
                    {isStopped(m.state) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => handleStart(m.id)}
                        disabled={startMutation.isPending}
                        title="Start"
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    )}
                    {isRunning(m.state) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => handleStop(m.id)}
                        disabled={stopMutation.isPending}
                        title="Stop"
                      >
                        <Square className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => handleRestart(m.id)}
                      disabled={restartMutation.isPending}
                      title="Restart"
                    >
                      <RotateCw className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => setMachineToDelete(m.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No machines found</p>
          )}
        </CardContent>
      </Card>

      {/* Delete Machine Confirmation */}
      <AlertDialog
        open={!!machineToDelete}
        onOpenChange={(open) => !open && setMachineToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Machine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this machine? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => machineToDelete && handleDelete(machineToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CertificatesCard({
  appName,
  certificates,
  isLoading,
  addCertMutation,
  deleteCertMutation,
  checkCertMutation,
}: {
  appName: string;
  certificates: FlyCertificate[];
  isLoading: boolean;
  addCertMutation: ReturnType<typeof useAddFlyCertificate>;
  deleteCertMutation: ReturnType<typeof useDeleteFlyCertificate>;
  checkCertMutation: ReturnType<typeof useCheckFlyCertificate>;
}) {
  const [showAddInput, setShowAddInput] = useState(false);
  const [newHostname, setNewHostname] = useState('');
  const [certToRemove, setCertToRemove] = useState<string | null>(null);
  const [expandedCert, setExpandedCert] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newHostname.trim()) return;
    try {
      await addCertMutation.mutateAsync({
        appName,
        hostname: newHostname.trim(),
      });
      toast.success(`Certificate for "${newHostname}" added`);
      setNewHostname('');
      setShowAddInput(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async (hostname: string) => {
    try {
      await deleteCertMutation.mutateAsync({ appName, hostname });
      toast.success(`Certificate for "${hostname}" removed`);
      setCertToRemove(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCheck = async (hostname: string) => {
    try {
      const result = await checkCertMutation.mutateAsync({ appName, hostname });
      if ((result as any)?.configured) {
        toast.success(`Certificate for "${hostname}" is configured!`);
      } else {
        toast.info(`DNS not yet configured for "${hostname}". Check your records.`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Custom Domains
            </CardTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAddInput(!showAddInput)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Domain
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Inline Add Input */}
          {showAddInput && (
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="example.com"
                value={newHostname}
                onChange={(e) => setNewHostname(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') {
                    setShowAddInput(false);
                    setNewHostname('');
                  }
                }}
                autoFocus
                className="text-sm"
              />
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={addCertMutation.isPending || !newHostname.trim()}
              >
                {addCertMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Add'
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowAddInput(false);
                  setNewHostname('');
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Certificate List */}
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : certificates.length > 0 ? (
            <div className="space-y-2">
              {certificates.map((c) => (
                <div key={c.id}>
                  <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">
                          <a
                            href={`https://${c.hostname}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {c.hostname}
                          </a>
                        </div>
                        {c.certificateAuthority && (
                          <div className="text-xs text-muted-foreground">
                            {c.certificateAuthority}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          c.configured
                            ? 'border-green-500 text-green-500'
                            : 'border-yellow-500 text-yellow-500'
                        }`}
                      >
                        {c.configured ? 'Configured' : 'Pending DNS'}
                      </Badge>
                      {!c.configured && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() =>
                              setExpandedCert(expandedCert === c.hostname ? null : c.hostname)
                            }
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            <span className="text-xs">DNS</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => handleCheck(c.hostname)}
                            disabled={checkCertMutation.isPending}
                          >
                            {checkCertMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => setCertToRemove(c.hostname)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* DNS Instructions (expanded) */}
                  {expandedCert === c.hostname && (
                    <Alert className="mt-2 ml-7">
                      <AlertDescription>
                        <p className="text-xs font-medium mb-2">
                          Add the following DNS records to configure this domain:
                        </p>
                        {c.dnsValidationHostname && c.dnsValidationTarget && (
                          <div className="bg-muted rounded p-2 text-xs font-mono space-y-1 mb-2">
                            <div className="flex items-center justify-between">
                              <span><strong>Type:</strong> CNAME</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="break-all">
                                <strong>Name:</strong> {c.dnsValidationHostname}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 px-1 shrink-0"
                                onClick={() => copyToClipboard(c.dnsValidationHostname!)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="break-all">
                                <strong>Target:</strong> {c.dnsValidationTarget}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 px-1 shrink-0"
                                onClick={() => copyToClipboard(c.dnsValidationTarget!)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                        {c.dnsValidationInstructions && (
                          <p className="text-xs text-muted-foreground">
                            {c.dnsValidationInstructions}
                          </p>
                        )}
                        {!c.dnsValidationHostname && !c.dnsValidationInstructions && (
                          <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                            <p>Point your domain to your Fly.io app:</p>
                            <div className="flex items-center justify-between">
                              <span><strong>Type:</strong> CNAME</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="break-all">
                                <strong>Name:</strong> {c.hostname}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 px-1 shrink-0"
                                onClick={() => copyToClipboard(c.hostname)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="break-all">
                                <strong>Target:</strong> {appName}.fly.dev
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 px-1 shrink-0"
                                onClick={() => copyToClipboard(`${appName}.fly.dev`)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom domains configured
            </p>
          )}
        </CardContent>
      </Card>

      {/* Remove Certificate Confirmation */}
      <AlertDialog
        open={!!certToRemove}
        onOpenChange={(open) => !open && setCertToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Domain</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{certToRemove}</strong>?
              This will remove the certificate and custom domain from your Fly.io app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => certToRemove && handleDelete(certToRemove)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCertMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SecretsCard({
  appName,
  secrets,
  isLoading,
  setSecretsMutation,
}: {
  appName: string;
  secrets: Array<{ name: string; digest: string; createdAt: string }>;
  isLoading: boolean;
  setSecretsMutation: ReturnType<typeof useSetFlySecrets>;
}) {
  const [showAddInput, setShowAddInput] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    try {
      await setSecretsMutation.mutateAsync({
        appName,
        secrets: [{ key: newKey.trim(), value: newValue.trim() }],
      });
      toast.success(`Secret "${newKey}" set`);
      setNewKey('');
      setNewValue('');
      setShowAddInput(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Key className="h-4 w-4" />
            Secrets
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAddInput(!showAddInput)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Secret
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Inline Add Input */}
        {showAddInput && (
          <div className="space-y-2 mb-3">
            <div className="flex gap-2">
              <Input
                placeholder="SECRET_NAME"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                autoFocus
                className="text-sm font-mono"
              />
              <Input
                placeholder="secret value"
                type="password"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') {
                    setShowAddInput(false);
                    setNewKey('');
                    setNewValue('');
                  }
                }}
                className="text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowAddInput(false);
                  setNewKey('');
                  setNewValue('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={setSecretsMutation.isPending || !newKey.trim() || !newValue.trim()}
              >
                {setSecretsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Set'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Secrets List */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : secrets.length > 0 ? (
          <div className="space-y-2">
            {secrets.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-mono font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {timeAgo(s.createdAt)} &middot; digest: {s.digest.substring(0, 12)}...
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No secrets configured
          </p>
        )}

        {/* Write-only note */}
        {secrets.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 px-1">
            Secret values are write-only and cannot be retrieved after being set.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
