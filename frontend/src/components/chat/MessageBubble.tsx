'use client';

import { useState } from 'react';
import {
  X, ChevronLeft, ChevronRight, ZoomIn,
  MapPin, DollarSign, Home, Bed, Bath, Image, Ruler, Calendar,
  Building2, Hash, FileText, TrendingUp, Percent, Clock, User,
  Phone, Mail, Tag, Info, CheckCircle2, Square, Trash2, Copy,
  RefreshCw, Edit3
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { parseMessageContent, type UIComponentType } from '@/lib/chat-parser';
import { ChatUIComponent } from './ChatComponentRegistry';
import { ThinkingIndicator } from './ThinkingIndicator';
import { CodeBlock } from './CodeBlock';
import { ToolProgress } from './ToolProgress';
import { useAgent } from '@/contexts/agent-context';
import type { Components } from 'react-markdown';
import { motion } from 'framer-motion';

// Helper to get icon for list item based on content
function getListItemIcon(text: string): React.ReactNode {
  const lowerText = text.toLowerCase();
  const iconClass = "h-5 w-5 flex-shrink-0 text-accent-400";

  // Address/Location
  if (lowerText.startsWith('address') || lowerText.includes('location') || lowerText.includes('street')) {
    return <MapPin className={iconClass} />;
  }
  // Price/Cost
  if (lowerText.startsWith('price') || lowerText.startsWith('cost') || lowerText.startsWith('asking') || lowerText.includes('arv') || lowerText.startsWith('value')) {
    return <DollarSign className={iconClass} />;
  }
  // Property Type
  if (lowerText.startsWith('property type') || lowerText.startsWith('type:')) {
    return <Home className={iconClass} />;
  }
  // Bedrooms
  if (lowerText.startsWith('bedroom') || lowerText.startsWith('bed') || lowerText.includes('br:')) {
    return <Bed className={iconClass} />;
  }
  // Bathrooms
  if (lowerText.startsWith('bathroom') || lowerText.startsWith('bath') || lowerText.includes('ba:')) {
    return <Bath className={iconClass} />;
  }
  // Square Footage
  if (lowerText.startsWith('sq') || lowerText.includes('square') || lowerText.includes('footage') || lowerText.includes('sqft')) {
    return <Ruler className={iconClass} />;
  }
  // Year Built
  if (lowerText.startsWith('year') || lowerText.includes('built')) {
    return <Calendar className={iconClass} />;
  }
  // Lot Size
  if (lowerText.startsWith('lot')) {
    return <Square className={iconClass} />;
  }
  // Stories/Floors
  if (lowerText.startsWith('stor') || lowerText.startsWith('floor')) {
    return <Building2 className={iconClass} />;
  }
  // MLS/ID
  if (lowerText.startsWith('mls') || lowerText.startsWith('id:') || lowerText.includes('listing id')) {
    return <Hash className={iconClass} />;
  }
  // Description/Notes
  if (lowerText.startsWith('description') || lowerText.startsWith('notes') || lowerText.startsWith('details')) {
    return <FileText className={iconClass} />;
  }
  // ROI/Returns
  if (lowerText.startsWith('roi') || lowerText.includes('return') || lowerText.includes('profit')) {
    return <TrendingUp className={iconClass} />;
  }
  // Percentage/Rate
  if (lowerText.includes('rate') || lowerText.includes('percentage') || lowerText.includes('cap rate')) {
    return <Percent className={iconClass} />;
  }
  // Days on Market
  if (lowerText.startsWith('days') || lowerText.includes('dom') || lowerText.includes('on market')) {
    return <Clock className={iconClass} />;
  }
  // Owner/Seller
  if (lowerText.startsWith('owner') || lowerText.startsWith('seller')) {
    return <User className={iconClass} />;
  }
  // Phone
  if (lowerText.startsWith('phone') || lowerText.startsWith('tel')) {
    return <Phone className={iconClass} />;
  }
  // Email
  if (lowerText.startsWith('email')) {
    return <Mail className={iconClass} />;
  }
  // Status
  if (lowerText.startsWith('status')) {
    return <Tag className={iconClass} />;
  }
  // Pictures/Photos/Images
  if (lowerText.startsWith('pic') || lowerText.startsWith('photo') || lowerText.startsWith('image')) {
    return <Image className={iconClass} />;
  }
  // Default - info icon or checkmark for general items
  if (lowerText.includes(':')) {
    return <Info className={iconClass} />;
  }
  return <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-zinc-500" />;
}

// Helper to extract images from markdown content
function extractImagesFromMarkdown(content: string): { src: string; alt: string }[] {
  const images: { src: string; alt: string }[] = [];

  // Match markdown image syntax: ![alt](src)
  const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownImageRegex.exec(content)) !== null) {
    images.push({ alt: match[1], src: match[2] });
  }

  // Match HTML img tags: <img src="..." alt="..." />
  const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*\/?>/gi;
  while ((match = htmlImageRegex.exec(content)) !== null) {
    images.push({ src: match[1], alt: match[2] || '' });
  }

  return images;
}

// Image Gallery Component for displaying images in chat
function ImageGallery({ images }: { images: { src: string; alt: string }[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  const openLightbox = (index: number) => setSelectedIndex(index);
  const closeLightbox = () => setSelectedIndex(null);
  const goNext = () => setSelectedIndex((prev) => (prev !== null ? (prev + 1) % images.length : 0));
  const goPrev = () => setSelectedIndex((prev) => (prev !== null ? (prev - 1 + images.length) % images.length : 0));

  return (
    <>
      {/* Gallery Grid */}
      <div className="flex flex-wrap gap-2 my-3">
        {images.map((img, index) => (
          <button
            key={index}
            onClick={() => openLightbox(index)}
            className="group relative rounded-lg overflow-hidden bg-zinc-800/50 hover:ring-2 hover:ring-accent-500 transition-all"
          >
            <img
              src={img.src}
              alt={img.alt || `Image ${index + 1}`}
              className="h-24 w-auto max-w-[120px] object-contain transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="absolute left-4 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="absolute right-4 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Image */}
          <img
            src={images[selectedIndex].src}
            alt={images[selectedIndex].alt || `Image ${selectedIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Image counter */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-300 text-sm">
              {selectedIndex + 1} / {images.length}
            </div>
          )}
        </div>
      )}
    </>
  );
}

interface ToolCall {
  name: string;
  status: 'running' | 'done';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  className?: string;
  onDelete?: (messageId: string) => void;
  onCopy?: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
}

export function MessageBubble({
  message,
  isStreaming = false,
  className,
  onDelete,
  onCopy,
  onRegenerate,
  onEdit,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const { agent } = useAgent();

  const handleCopy = () => {
    if (onCopy) {
      onCopy(message.content);
    } else {
      navigator.clipboard.writeText(message.content);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(message.id);
    }
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate(message.id);
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(message.id, message.content);
    }
  };

  // Markdown components with code block handling
  const markdownComponents: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');

      // Check if this is a code block (has language or is multiline)
      if (match || codeString.includes('\n')) {
        return (
          <CodeBlock
            code={codeString}
            language={match?.[1] || 'text'}
            className="my-3"
          />
        );
      }

      // Inline code
      return (
        <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 text-sm font-mono" {...props}>
          {children}
        </code>
      );
    },
    pre({ children }) {
      // Just return children since code block handles rendering
      return <>{children}</>;
    },
    // Hide inline images - we'll render them in the gallery
    img() {
      return null;
    },
    // Custom list with no default bullets
    ul({ children }) {
      return <ul className="space-y-1.5 my-2 list-none pl-0">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="space-y-1.5 my-2 list-none pl-0">{children}</ol>;
    },
    // Custom list items with icons
    li({ children }) {
      // Extract text content from children to determine icon
      const textContent = typeof children === 'string'
        ? children
        : Array.isArray(children)
          ? children.map(child =>
              typeof child === 'string' ? child :
              (child as React.ReactElement<{ children?: React.ReactNode }>)?.props?.children || ''
            ).join('')
          : '';

      const icon = getListItemIcon(textContent);

      return (
        <li className="flex items-start gap-2.5 text-zinc-300 text-[17px]">
          <span className="mt-1">{icon}</span>
          <span className="flex-1">{children}</span>
        </li>
      );
    },
  };

  // Handle UI component actions (for interactive components like confirmations)
  const handleComponentAction = (action: string, data?: Record<string, unknown>) => {
    console.log('Component action:', action, data);
    // TODO: Implement action handling - could send to backend or trigger local state changes
    // For now, just log the action
  };

  // Render message content
  const renderContent = () => {
    if (!message.content) {
      return <ThinkingIndicator />;
    }

    if (isUser) {
      return <span className="whitespace-pre-wrap">{message.content}</span>;
    }

    const segments = parseMessageContent(message.content);

    return (
      <div className="space-y-3">
        {segments.map((segment, index) => {
          // Handle text segments
          if (segment.type === 'text') {
            const images = extractImagesFromMarkdown(segment.content);
            return (
              <div key={`text-${index}`} className="chat-markdown">
                <ReactMarkdown components={markdownComponents}>
                  {segment.content}
                </ReactMarkdown>
                {images.length > 0 && <ImageGallery images={images} />}
              </div>
            );
          }

          // Handle UI component segments using the registry
          return (
            <ChatUIComponent
              key={`${segment.type}-${index}`}
              type={segment.type as UIComponentType}
              data={segment.data}
              onAction={handleComponentAction}
            />
          );
        })}
        {isStreaming && <span className="inline-block w-2 h-5 bg-accent-400 animate-pulse ml-0.5" />}
      </div>
    );
  };

  if (isUser) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <motion.div
            className={cn('flex justify-end items-end gap-3', className)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.25,
              ease: 'easeOut',
            }}
          >
            <div className="max-w-[85%] lg:max-w-[70%]">
              <div className={cn(
                'bg-accent-600 text-white rounded-2xl rounded-br-md px-4 py-3',
                'shadow-lg shadow-accent-600/20 cursor-context-menu'
              )}>
                <p className="text-[17px] leading-relaxed">{message.content}</p>
              </div>
            </div>
            {/* User Avatar */}
            <div className="relative flex-shrink-0">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 ring-2 ring-zinc-800 overflow-hidden flex items-center justify-center shadow-lg">
                <User className="h-5 w-5 text-white" />
              </div>
            </div>
          </motion.div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48 bg-zinc-900 border-zinc-700">
          <ContextMenuItem onClick={handleCopy} className="text-zinc-200 focus:bg-zinc-800 focus:text-white">
            <Copy className="h-4 w-4 mr-2" />
            Copy message
          </ContextMenuItem>
          {onEdit && (
            <ContextMenuItem onClick={handleEdit} className="text-zinc-200 focus:bg-zinc-800 focus:text-white">
              <Edit3 className="h-4 w-4 mr-2" />
              Edit message
            </ContextMenuItem>
          )}
          <ContextMenuSeparator className="bg-zinc-700" />
          {onDelete && (
            <ContextMenuItem onClick={handleDelete} variant="destructive" className="text-red-400 focus:bg-red-500/10 focus:text-red-400">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete message
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  const hasContent = !!message.content;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          className={cn(
            'flex gap-4 cursor-context-menu',
            !hasContent && 'items-center', // Center vertically when showing loading indicator
            className
          )}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.25,
            ease: 'easeOut',
          }}
        >
          {/* Assistant Avatar with glow effect when streaming */}
          <div className="relative flex-shrink-0">
            {/* Animated glow effect - only visible when streaming */}
            {isStreaming && (
              <>
                <motion.div
                  className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-cyan-400/40 via-accent-500/30 to-fuchsia-500/40 blur-xl"
                  animate={{
                    opacity: [0.4, 0.7, 0.4],
                    scale: [0.95, 1.05, 0.95],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
                <motion.div
                  className="absolute -inset-1 rounded-xl border border-accent-400/30"
                  animate={{
                    opacity: [0.3, 0.6, 0.3],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </>
            )}
            {/* Square avatar with rounded corners */}
            <div className={cn(
              "relative h-12 w-12 rounded-xl overflow-hidden ring-2 shadow-lg transition-all duration-300",
              isStreaming
                ? "ring-accent-400/50 shadow-accent-500/30"
                : "ring-zinc-700 shadow-zinc-900/50"
            )}>
              <img
                src={agent.avatar}
                alt={agent.name}
                className="h-full w-full object-cover"
              />
            </div>
            {/* Online indicator - only show when streaming/typing */}
            {isStreaming && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-zinc-950 bg-accent-400 animate-pulse" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            {/* Tool progress indicator */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <ToolProgress tools={message.toolCalls} />
            )}
            {/* Message content */}
            <div className="text-zinc-200 text-[17px] leading-relaxed">
              {renderContent()}
            </div>
          </div>
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48 bg-zinc-900 border-zinc-700">
        <ContextMenuItem onClick={handleCopy} className="text-zinc-200 focus:bg-zinc-800 focus:text-white">
          <Copy className="h-4 w-4 mr-2" />
          Copy message
        </ContextMenuItem>
        {onRegenerate && !isStreaming && (
          <ContextMenuItem onClick={handleRegenerate} className="text-zinc-200 focus:bg-zinc-800 focus:text-white">
            <RefreshCw className="h-4 w-4 mr-2" />
            Regenerate response
          </ContextMenuItem>
        )}
        <ContextMenuSeparator className="bg-zinc-700" />
        {onDelete && (
          <ContextMenuItem onClick={handleDelete} variant="destructive" className="text-red-400 focus:bg-red-500/10 focus:text-red-400">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete message
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
