/**
 * SpriteMcpPanel
 *
 * Panel for managing MCP (Model Context Protocol) servers on a sprite.
 * Allows installing, viewing tools, and testing MCP tool calls.
 * Also provides access to browse and install servers from the registry.
 */

'use client';

import { useState } from 'react';
import {
  Plug,
  Play,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Wrench,
  Terminal,
  FileText,
  GitBranch,
  Search,
  Folder,
  Store,
  Settings,
  Boxes,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useMcpHealth,
  useMcpTools,
  useInstallMcp,
  useCallMcpTool,
  useSprite,
} from '@/hooks/use-sprites';
import type { McpTool } from '@/types/sprite';
import { McpRegistryBrowser } from './McpRegistryBrowser';
import { McpInstalledServersList } from './McpInstalledServersList';

interface SpriteMcpPanelProps {
  spriteId: string | null | undefined;
  className?: string;
}

// Tool icons by category
const TOOL_ICONS: Record<string, React.ElementType> = {
  read_file: FileText,
  write_file: FileText,
  list_directory: Folder,
  search_files: Search,
  run_command: Terminal,
  git_status: GitBranch,
  git_diff: GitBranch,
  git_commit: GitBranch,
  git_push: GitBranch,
  git_log: GitBranch,
};

function getToolIcon(toolName: string): React.ElementType {
  return TOOL_ICONS[toolName] || Wrench;
}

function ToolCard({ tool, onTest }: { tool: McpTool; onTest: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const Icon = getToolIcon(tool.name);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-secondary/50 transition-colors text-left">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <Icon className="h-4 w-4 text-purple-400 shrink-0" />
          <span className="font-mono text-sm text-foreground">{tool.name}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-10 pr-2 pb-2">
        <p className="text-xs text-muted-foreground mb-2">{tool.description}</p>
        {tool.inputSchema.properties && (
          <div className="text-xs space-y-1 mb-2">
            <span className="text-muted-foreground">Parameters:</span>
            {Object.entries(tool.inputSchema.properties).map(([name, schema]) => (
              <div key={name} className="pl-2 flex items-center gap-1">
                <code className="text-purple-300">{name}</code>
                {tool.inputSchema.required?.includes(name) && (
                  <span className="text-red-400">*</span>
                )}
                <span className="text-muted-foreground">
                  - {(schema as { description?: string }).description || 'No description'}
                </span>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onTest();
          }}
          className="h-6 text-xs gap-1"
        >
          <Play className="h-3 w-3" />
          Test
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}

function InstalledToolsContent({
  spriteId,
  isActive,
  mcpEnabled,
}: {
  spriteId: string;
  isActive: boolean;
  mcpEnabled: boolean;
}) {
  const [toolsExpanded, setToolsExpanded] = useState(true);

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useMcpHealth(
    isActive && mcpEnabled ? spriteId : null
  );
  const { data: toolsData, isLoading: toolsLoading } = useMcpTools(
    isActive && mcpEnabled && health?.healthy ? spriteId : null
  );
  const installMcp = useInstallMcp();
  const callMcpTool = useCallMcpTool();

  const tools = toolsData?.tools || [];
  const isHealthy = health?.healthy ?? false;

  const handleInstall = async () => {
    try {
      toast.loading('Installing MCP server...');
      await installMcp.mutateAsync({ spriteId });
      toast.dismiss();
      toast.success('MCP server installed and running');
      refetchHealth();
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to install MCP server');
    }
  };

  const handleTestTool = async (toolName: string) => {
    try {
      toast.loading(`Testing ${toolName}...`);

      // Default test arguments for common tools
      const testArgs: Record<string, Record<string, unknown>> = {
        read_file: { path: 'package.json' },
        list_directory: { path: '.' },
        git_status: {},
        git_log: { count: 5 },
        run_command: { command: 'pwd' },
      };

      const result = await callMcpTool.mutateAsync({
        spriteId,
        tool: toolName,
        args: testArgs[toolName] || {},
      });

      toast.dismiss();
      if (result.success) {
        toast.success(`${toolName} executed successfully`, {
          description: typeof result.result === 'string'
            ? result.result.slice(0, 100)
            : JSON.stringify(result.result).slice(0, 100),
        });
      } else {
        toast.error(`${toolName} failed: ${result.error}`);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Tool execution failed');
    }
  };

  if (!isActive) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-center">
        <Plug className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground mb-2">Sprite is not active</p>
        <p className="text-xs text-muted-foreground">
          Start the sprite to use MCP tools.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Status</h3>
        <div className="flex items-center gap-2">
          {mcpEnabled && isHealthy ? (
            <Badge variant="outline" className="text-green-400 border-green-400/50 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : mcpEnabled ? (
            <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              Disconnected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-zinc-400 border-zinc-400/50 text-xs">
              Not installed
            </Badge>
          )}
        </div>
      </div>

      {/* Install/Reconnect Button */}
      {!mcpEnabled ? (
        <div className="text-center py-6">
          <Plug className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            Install MCP server to enable Claude to use file, shell, and git tools.
          </p>
          <Button
            onClick={handleInstall}
            disabled={installMcp.isPending}
            className="gap-2 bg-purple-600 hover:bg-purple-700"
          >
            {installMcp.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            Install MCP Server
          </Button>
        </div>
      ) : !isHealthy ? (
        <div className="text-center py-6">
          <XCircle className="h-10 w-10 text-yellow-400 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            MCP server is not responding. Try reinstalling.
          </p>
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchHealth()}
              disabled={healthLoading}
              className="gap-1.5"
            >
              {healthLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Check Status
            </Button>
            <Button
              onClick={handleInstall}
              disabled={installMcp.isPending}
              size="sm"
              className="gap-1.5"
            >
              {installMcp.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              Reinstall
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Server Info */}
          <div className="space-y-1 text-xs text-muted-foreground p-3 rounded-lg bg-muted/50">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="text-green-400">Running</span>
            </div>
            {health?.version && (
              <div className="flex justify-between">
                <span>Version:</span>
                <span className="text-foreground">{health.version}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tools available:</span>
              <span className="text-foreground">{tools.length}</span>
            </div>
          </div>

          <Separator />

          {/* Tools List */}
          <Collapsible open={toolsExpanded} onOpenChange={setToolsExpanded}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between p-2 rounded-md hover:bg-secondary/50 transition-colors">
                <span className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Available Tools
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {tools.length}
                  </Badge>
                  {toolsExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1">
              {toolsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : tools.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  No tools available
                </p>
              ) : (
                tools.map((tool) => (
                  <ToolCard
                    key={tool.name}
                    tool={tool}
                    onTest={() => handleTestTool(tool.name)}
                  />
                ))
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Quick Actions */}
          <Separator />
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Quick Actions</span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestTool('git_status')}
                disabled={callMcpTool.isPending}
                className="h-7 text-xs gap-1"
              >
                <GitBranch className="h-3 w-3" />
                Git Status
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestTool('list_directory')}
                disabled={callMcpTool.isPending}
                className="h-7 text-xs gap-1"
              >
                <Folder className="h-3 w-3" />
                List Files
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchHealth()}
                disabled={healthLoading}
                className="h-7 text-xs gap-1"
              >
                <RefreshCw className={cn("h-3 w-3", healthLoading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function SpriteMcpPanel({ spriteId, className }: SpriteMcpPanelProps) {
  const { data: sprite } = useSprite(spriteId);

  const isActive = sprite?.status === 'running' || sprite?.status === 'initializing' || sprite?.status === 'restoring';
  const mcpEnabled = sprite?.mcpEnabled ?? false;

  if (!spriteId) {
    return (
      <Card className={cn('bg-card border h-full flex flex-col', className)}>
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <Plug className="h-5 w-5 text-purple-400" />
            MCP Servers
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Plug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">No sprite selected</p>
            <p className="text-xs text-muted-foreground mt-1">
              Launch a sprite to manage MCP servers
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('bg-card border h-full flex flex-col', className)}>
      <CardHeader className="pb-0 shrink-0">
        <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
          <Plug className="h-5 w-5 text-purple-400" />
          MCP Servers
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <Tabs defaultValue="configured" className="h-full flex flex-col">
          <TabsList className="mx-4 mt-4 bg-muted/50">
            <TabsTrigger value="configured" className="gap-1.5">
              <Boxes className="h-4 w-4" />
              Configured
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-1.5">
              <Wrench className="h-4 w-4" />
              Tools
            </TabsTrigger>
            <TabsTrigger value="registry" className="gap-1.5">
              <Store className="h-4 w-4" />
              Registry
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configured" className="flex-1 mt-0 overflow-auto p-4">
            <McpInstalledServersList
              spriteId={spriteId}
              isActive={isActive}
              className="h-full"
            />
          </TabsContent>

          <TabsContent value="tools" className="flex-1 mt-0 overflow-auto">
            <InstalledToolsContent
              spriteId={spriteId}
              isActive={isActive}
              mcpEnabled={mcpEnabled}
            />
          </TabsContent>

          <TabsContent value="registry" className="flex-1 mt-0 overflow-hidden">
            <McpRegistryBrowser
              spriteId={spriteId}
              className="h-full"
              onInstalled={() => {
                toast.success('Server installed', {
                  description: 'The MCP server has been installed. You may need to configure it.',
                });
              }}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
