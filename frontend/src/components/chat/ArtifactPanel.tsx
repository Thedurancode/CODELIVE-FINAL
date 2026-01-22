'use client';

import { X, Copy, Check, Download, Code2, FileText } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useChatStore, type ArtifactContent } from '@/stores/chat-store';

interface ArtifactPanelProps {
  className?: string;
}

export function ArtifactPanel({ className }: ArtifactPanelProps) {
  const { artifactPanelOpen, currentArtifact, closeArtifact } = useChatStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!currentArtifact) return;
    await navigator.clipboard.writeText(currentArtifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!currentArtifact) return;

    const extension = currentArtifact.language || 'txt';
    const filename = `${currentArtifact.title.replace(/\s+/g, '-').toLowerCase()}.${extension}`;

    const blob = new Blob([currentArtifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revoking the URL to ensure download completes
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!artifactPanelOpen || !currentArtifact) {
    return null;
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-full border-l border-zinc-800 bg-zinc-900 w-[420px] lg:w-[520px] flex-shrink-0',
        'animate-in slide-in-from-right duration-300',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            currentArtifact.type === 'code' ? 'bg-blue-500/20' : 'bg-purple-500/20'
          )}>
            {currentArtifact.type === 'code' ? (
              <Code2 className="h-4 w-4 text-blue-400" />
            ) : (
              <FileText className="h-4 w-4 text-purple-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm text-zinc-200 truncate">{currentArtifact.title}</p>
            {currentArtifact.language && (
              <p className="text-xs text-zinc-500">{currentArtifact.language}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            onClick={closeArtifact}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 bg-zinc-950">
        {currentArtifact.type === 'code' ? (
          <pre className="p-4 text-sm font-mono text-zinc-300 leading-relaxed">
            <code className={`language-${currentArtifact.language || 'text'}`}>
              {currentArtifact.content}
            </code>
          </pre>
        ) : currentArtifact.type === 'document' ? (
          <div className="p-4 prose prose-invert prose-sm max-w-none">
            {currentArtifact.content}
          </div>
        ) : (
          <div className="p-4">
            <pre className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {currentArtifact.content}
            </pre>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
