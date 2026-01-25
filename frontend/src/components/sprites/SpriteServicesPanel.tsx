/**
 * SpriteServicesPanel
 *
 * Panel showing open ports (dev servers, etc.) detected automatically by the Sprites API.
 * When a process opens a port, the Sprites API sends a port_opened event via WebSocket
 * with a proxy URL for accessing the service.
 */

'use client';

import { useState } from 'react';
import {
  ExternalLink,
  Copy,
  Check,
  Globe,
  Server,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useOpenPorts, type OpenPort } from '@/stores/sprite-store';

interface SpriteServicesPanelProps {
  spriteId: string | null | undefined;
  isActive: boolean;
  className?: string;
}

// Port item component
function PortItem({ port }: { port: OpenPort }) {
  const [urlCopied, setUrlCopied] = useState(false);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(port.address).then(() => {
      setUrlCopied(true);
      toast.success('Preview URL copied');
      setTimeout(() => setUrlCopied(false), 2000);
    });
  };

  // Guess what type of server based on port
  const getPortLabel = (portNum: number) => {
    const commonPorts: Record<number, string> = {
      3000: 'Dev Server',
      3001: 'API Server',
      5173: 'Vite',
      5174: 'Vite',
      8000: 'Python',
      8080: 'HTTP',
      4200: 'Angular',
      8888: 'Jupyter',
      5000: 'Flask',
      4000: 'Phoenix',
      1234: 'Parcel',
    };
    return commonPorts[portNum] || `Port ${portNum}`;
  };

  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-background/50 border border-border/50 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-medium truncate">{getPortLabel(port.port)}</span>
        <Badge variant="outline" className="text-xs shrink-0">
          :{port.port}
        </Badge>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          asChild
        >
          <a href={port.address} target="_blank" rel="noopener noreferrer">
            <Globe className="h-3 w-3" />
            Open
            <ExternalLink className="h-3 w-3" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCopyUrl}
        >
          {urlCopied ? (
            <Check className="h-3 w-3 text-green-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function SpriteServicesPanel({
  spriteId,
  isActive,
  className,
}: SpriteServicesPanelProps) {
  const openPorts = useOpenPorts(spriteId);

  // Don't show if sprite is not active
  if (!isActive) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wifi className="h-4 w-4 text-green-400" />
        <span className="text-sm font-medium">Preview URLs</span>
        {openPorts.length > 0 && (
          <Badge variant="outline" className="text-xs text-green-400 border-green-400/50">
            {openPorts.length} {openPorts.length === 1 ? 'port' : 'ports'}
          </Badge>
        )}
      </div>

      {/* Ports List */}
      {openPorts.length > 0 ? (
        <div className="space-y-2">
          {openPorts.map((port) => (
            <PortItem key={port.port} port={port} />
          ))}
        </div>
      ) : (
        <div className="text-center py-3 text-xs text-muted-foreground bg-background/30 rounded-lg border border-dashed border-border/50">
          <Server className="h-4 w-4 mx-auto mb-1 opacity-50" />
          <p>No services running</p>
          <p className="mt-0.5 opacity-70">
            Start a dev server (e.g., <code className="text-[10px]">npm run dev</code>) to see preview URLs
          </p>
        </div>
      )}
    </div>
  );
}
