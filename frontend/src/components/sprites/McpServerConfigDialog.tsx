/**
 * MCP Server Configuration Dialog
 *
 * Dialog for configuring environment variables and settings for an installed MCP server.
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Key,
  AlertCircle,
  Settings,
  Power,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useInstalledMcpServer,
  useUpdateMcpServerConfig,
  useMcpServerRequiredEnvVars,
} from '@/hooks/use-sprites';
import type { InstalledMcpServer, McpEnvVar } from '@/types/sprite';

interface McpServerConfigDialogProps {
  spriteId: string;
  serverName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

function EnvVarRow({
  envVar,
  required,
  onUpdate,
  onRemove,
}: {
  envVar: McpEnvVar;
  required?: boolean;
  onUpdate: (updated: McpEnvVar) => void;
  onRemove: () => void;
}) {
  const [showValue, setShowValue] = useState(false);

  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={envVar.key}
            onChange={(e) => onUpdate({ ...envVar, key: e.target.value })}
            placeholder="Variable name"
            className="h-8 font-mono text-sm flex-1"
          />
          {required && (
            <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30">
              Required
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowValue(!showValue)}
          >
            {showValue ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type={showValue ? 'text' : 'password'}
            value={envVar.value}
            onChange={(e) => onUpdate({ ...envVar, value: e.target.value })}
            placeholder={envVar.isSecret ? 'Secret value (encrypted)' : 'Value'}
            className="h-8 font-mono text-sm flex-1"
          />
          <div className="flex items-center gap-1.5">
            <Switch
              id={`secret-${envVar.key}`}
              checked={envVar.isSecret}
              onCheckedChange={(checked) => onUpdate({ ...envVar, isSecret: checked })}
            />
            <Label htmlFor={`secret-${envVar.key}`} className="text-xs text-muted-foreground">
              Secret
            </Label>
          </div>
        </div>
        {envVar.description && (
          <p className="text-xs text-muted-foreground">{envVar.description}</p>
        )}
      </div>
    </div>
  );
}

export function McpServerConfigDialog({
  spriteId,
  serverName,
  open,
  onOpenChange,
  onSaved,
}: McpServerConfigDialogProps) {
  const { data: server, isLoading: serverLoading } = useInstalledMcpServer(
    open ? spriteId : null,
    serverName
  );
  const { data: requiredEnvData } = useMcpServerRequiredEnvVars(open ? serverName : null);
  const updateConfig = useUpdateMcpServerConfig();

  // Local state for edits
  const [displayName, setDisplayName] = useState('');
  const [autoStart, setAutoStart] = useState(true);
  const [envVars, setEnvVars] = useState<McpEnvVar[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local state with server data
  useEffect(() => {
    if (server) {
      setDisplayName(server.displayName || '');
      setAutoStart(server.autoStart);
      setEnvVars(server.envVars || []);
      setHasChanges(false);
    }
  }, [server]);

  const requiredEnvVars = requiredEnvData?.requiredEnvVars || [];
  const configuredKeys = new Set(envVars.map((v) => v.key));
  const missingRequired = requiredEnvVars.filter((key) => !configuredKeys.has(key));

  const handleAddEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '', isSecret: false }]);
    setHasChanges(true);
  };

  const handleAddRequiredVar = (key: string) => {
    setEnvVars([...envVars, { key, value: '', isSecret: true, description: 'Required' }]);
    setHasChanges(true);
  };

  const handleUpdateEnvVar = (index: number, updated: McpEnvVar) => {
    const newVars = [...envVars];
    newVars[index] = updated;
    setEnvVars(newVars);
    setHasChanges(true);
  };

  const handleRemoveEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!serverName) return;

    try {
      // Filter out empty env vars
      const validEnvVars = envVars.filter((v) => v.key.trim() !== '');

      await updateConfig.mutateAsync({
        spriteId,
        serverName,
        displayName: displayName || undefined,
        autoStart,
        envVars: validEnvVars,
      });

      toast.success('Configuration saved');
      setHasChanges(false);
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save configuration');
    }
  };

  if (!serverName) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Configure {serverName}</DialogTitle>
              <DialogDescription>
                {server?.description || 'Manage environment variables and settings'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {serverLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-6 pr-4">
              {/* General Settings */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">General Settings</h4>

                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      setHasChanges(true);
                    }}
                    placeholder={serverName}
                    className="h-9"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoStart" className="flex items-center gap-2">
                      <Power className="h-4 w-4" />
                      Auto-start on Resume
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically start this server when the sprite resumes
                    </p>
                  </div>
                  <Switch
                    id="autoStart"
                    checked={autoStart}
                    onCheckedChange={(checked) => {
                      setAutoStart(checked);
                      setHasChanges(true);
                    }}
                  />
                </div>
              </div>

              <Separator />

              {/* Environment Variables */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Environment Variables
                  </h4>
                  <Button variant="outline" size="sm" onClick={handleAddEnvVar} className="h-7 gap-1">
                    <Plus className="h-3 w-3" />
                    Add Variable
                  </Button>
                </div>

                {/* Missing required variables warning */}
                {missingRequired.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5" />
                      <div className="space-y-2">
                        <p className="text-sm text-amber-400">
                          {missingRequired.length} required variable{missingRequired.length > 1 ? 's' : ''} not
                          configured
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {missingRequired.map((key) => (
                            <Badge
                              key={key}
                              variant="outline"
                              className="text-xs text-amber-400 border-amber-400/30 cursor-pointer hover:bg-amber-500/20"
                              onClick={() => handleAddRequiredVar(key)}
                            >
                              + {key}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Env var list */}
                <div className="space-y-2">
                  {envVars.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      No environment variables configured.
                      {requiredEnvVars.length > 0 && (
                        <> Click the badges above to add required variables.</>
                      )}
                    </div>
                  ) : (
                    envVars.map((envVar, index) => (
                      <EnvVarRow
                        key={index}
                        envVar={envVar}
                        required={requiredEnvVars.includes(envVar.key)}
                        onUpdate={(updated) => handleUpdateEnvVar(index, updated)}
                        onRemove={() => handleRemoveEnvVar(index)}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Server Info */}
              {server && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Server Info</h4>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Package:</span>
                        <span className="font-mono">{server.packageName || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Version:</span>
                        <span>{server.packageVersion || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            server.status === 'running' && 'text-green-400 border-green-400/30',
                            server.status === 'stopped' && 'text-zinc-400 border-zinc-400/30',
                            server.status === 'error' && 'text-red-400 border-red-400/30'
                          )}
                        >
                          {server.status}
                        </Badge>
                      </div>
                      {server.installedAt && (
                        <div className="flex justify-between">
                          <span>Installed:</span>
                          <span>{new Date(server.installedAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateConfig.isPending}
            className={cn(!hasChanges && 'opacity-50')}
          >
            {updateConfig.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Configuration
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default McpServerConfigDialog;
