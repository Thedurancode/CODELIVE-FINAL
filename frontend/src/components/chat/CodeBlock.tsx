'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chat-store';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  className?: string;
}

export function CodeBlock({ code, language = 'text', title, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { openArtifact } = useChatStore();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExpand = () => {
    openArtifact({
      id: `code-${Date.now()}`,
      type: 'code',
      title: title || `${language} code`,
      content: code,
      language,
    });
  };

  return (
    <div className={cn(
      'relative group rounded-xl overflow-hidden',
      'bg-zinc-900 border border-zinc-800',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
        <span className="text-xs font-medium text-zinc-400">
          {title || language}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleExpand}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
      {/* Code */}
      <pre className="p-4 overflow-x-auto text-sm bg-zinc-950">
        <code className={`language-${language} text-zinc-300 leading-relaxed`}>{code}</code>
      </pre>
    </div>
  );
}
