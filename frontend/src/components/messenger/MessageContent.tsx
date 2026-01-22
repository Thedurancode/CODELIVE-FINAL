'use client';

import { useState, useEffect, useMemo, memo } from 'react';
import { ExternalLink, Image as ImageIcon, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// URL DETECTION & LINK PREVIEW
// ============================================================================

// Regex to detect URLs in text
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

// Cache for link previews to avoid re-fetching
const linkPreviewCache = new Map<string, LinkPreviewData | null>();

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

/**
 * Fetch link preview data using a server-side API or Open Graph parser
 * Falls back to basic URL info if preview unavailable
 */
async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  // Check cache first
  if (linkPreviewCache.has(url)) {
    return linkPreviewCache.get(url) || null;
  }

  try {
    // Try to get Open Graph data via a proxy API
    // For now, just extract basic info from the URL
    const urlObj = new URL(url);
    const preview: LinkPreviewData = {
      url,
      siteName: urlObj.hostname.replace('www.', ''),
      favicon: `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`,
    };

    // Special handling for known domains
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      preview.siteName = 'YouTube';
      preview.title = 'YouTube Video';
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      preview.siteName = 'X (Twitter)';
    } else if (url.includes('github.com')) {
      preview.siteName = 'GitHub';
    } else if (url.includes('linkedin.com')) {
      preview.siteName = 'LinkedIn';
    }

    // Check if URL is an image
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)) {
      preview.image = url;
      preview.title = 'Image';
    }

    linkPreviewCache.set(url, preview);
    return preview;
  } catch (error) {
    linkPreviewCache.set(url, null);
    return null;
  }
}

/**
 * Link Preview Component - Shows a preview card for URLs
 */
export const LinkPreview = memo(function LinkPreview({ url }: { url: string }) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetchLinkPreview(url).then((data) => {
      if (mounted) {
        setPreview(data);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [url]);

  if (isLoading) {
    return (
      <div className="mt-2 p-2 rounded-lg border bg-muted/30 animate-pulse">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading preview...</span>
        </div>
      </div>
    );
  }

  if (!preview) return null;

  const isImage = preview.image && !imageError && preview.title === 'Image';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden"
    >
      {/* Image preview for direct image URLs */}
      {isImage && (
        <div className="relative">
          <img
            src={preview.image}
            alt="Preview"
            className="w-full max-h-48 object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      )}

      {/* Text preview */}
      <div className="p-2.5">
        <div className="flex items-start gap-2">
          {/* Favicon or icon */}
          <div className="flex-shrink-0 mt-0.5">
            {preview.favicon ? (
              <img
                src={preview.favicon}
                alt=""
                className="h-4 w-4 rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Site name */}
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {preview.siteName}
            </p>

            {/* Title */}
            {preview.title && (
              <p className="text-sm font-medium text-foreground truncate">
                {preview.title}
              </p>
            )}

            {/* Description */}
            {preview.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {preview.description}
              </p>
            )}

            {/* URL */}
            <p className="text-[10px] text-muted-foreground truncate mt-1">
              {url}
            </p>
          </div>
        </div>
      </div>
    </a>
  );
});

// ============================================================================
// @MENTION HIGHLIGHTING
// ============================================================================

// Regex to detect @mentions
const MENTION_REGEX = /@([\w\s]+?)(?=\s|$|[.,!?])/g;

interface MentionHighlightProps {
  name: string;
  isCurrentUser?: boolean;
  onClick?: () => void;
}

/**
 * Mention Highlight Component - Renders an @mention with styling
 */
export const MentionHighlight = memo(function MentionHighlight({
  name,
  isCurrentUser,
  onClick,
}: MentionHighlightProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1 py-0.5 rounded text-sm font-medium cursor-pointer transition-colors',
        isCurrentUser
          ? 'bg-primary/20 text-primary hover:bg-primary/30'
          : 'bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30'
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      @{name}
    </span>
  );
});

// ============================================================================
// MESSAGE CONTENT RENDERER
// ============================================================================

interface MessageContentProps {
  content: string;
  currentUserId?: string;
  mentions?: string[]; // Array of mentioned user IDs
  showLinkPreviews?: boolean;
  className?: string;
}

/**
 * Parses message content and renders with:
 * - @mention highlighting
 * - Clickable links
 * - Link previews for URLs
 */
export function MessageContent({
  content,
  currentUserId,
  mentions = [],
  showLinkPreviews = true,
  className,
}: MessageContentProps) {
  // Extract URLs from content
  const urls = useMemo(() => {
    const matches = content.match(URL_REGEX);
    return matches ? [...new Set(matches)] : [];
  }, [content]);

  // Parse and render content with mentions and links
  const renderedContent = useMemo(() => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let partKey = 0;

    // Combined regex for mentions and URLs
    const combinedRegex = new RegExp(
      `(${MENTION_REGEX.source})|(${URL_REGEX.source})`,
      'g'
    );

    let match;
    while ((match = combinedRegex.exec(content)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${partKey++}`}>
            {content.slice(lastIndex, match.index)}
          </span>
        );
      }

      const fullMatch = match[0];

      // Check if it's a mention
      if (fullMatch.startsWith('@')) {
        const mentionName = fullMatch.slice(1).trim();
        parts.push(
          <MentionHighlight
            key={`mention-${partKey++}`}
            name={mentionName}
            isCurrentUser={mentions.includes(currentUserId || '')}
          />
        );
      }
      // Check if it's a URL
      else if (URL_REGEX.test(fullMatch)) {
        parts.push(
          <a
            key={`link-${partKey++}`}
            href={fullMatch}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600 underline underline-offset-2 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {fullMatch.length > 50 ? `${fullMatch.slice(0, 50)}...` : fullMatch}
          </a>
        );
      }

      lastIndex = match.index + fullMatch.length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${partKey++}`}>{content.slice(lastIndex)}</span>
      );
    }

    return parts.length > 0 ? parts : content;
  }, [content, currentUserId, mentions]);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Message text with highlights */}
      <p className="text-sm whitespace-pre-wrap break-words">{renderedContent}</p>

      {/* Link previews */}
      {showLinkPreviews && urls.length > 0 && (
        <div className="space-y-2">
          {urls.slice(0, 3).map((url) => (
            <LinkPreview key={url} url={url} />
          ))}
          {urls.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{urls.length - 3} more links
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default MessageContent;
