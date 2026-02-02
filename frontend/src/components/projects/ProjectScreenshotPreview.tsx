/**
 * ProjectScreenshotPreview
 *
 * Displays a live site screenshot preview for a project.
 * Uses Browserless API to capture screenshots of the deployment URL.
 */

'use client';

import { useState } from 'react';
import { ExternalLink, Camera, RefreshCw, Loader2, ImageOff, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCaptureProjectScreenshot } from '@/hooks/use-projects';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ProjectScreenshotPreviewProps {
  projectId: string;
  screenshotUrl: string | null;
  deploymentUrl: string | null;
  className?: string;
}

export function ProjectScreenshotPreview({
  projectId,
  screenshotUrl,
  deploymentUrl,
  className,
}: ProjectScreenshotPreviewProps) {
  const [imageError, setImageError] = useState(false);
  const captureScreenshot = useCaptureProjectScreenshot();

  const handleCapture = async () => {
    try {
      await captureScreenshot.mutateAsync(projectId);
      setImageError(false);
      toast.success('Screenshot captured');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('not available') || message.includes('not configured')) {
        toast.error('Screenshot service not configured', {
          description: 'Add BROWSERLESS_API_KEY to enable screenshots',
        });
      } else {
        toast.error('Failed to capture screenshot', {
          description: message,
        });
      }
    }
  };

  // No deployment URL configured
  if (!deploymentUrl) {
    return (
      <div className={cn('p-3 rounded-xl bg-muted/50 border border-border/50', className)}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Globe className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Live Preview</p>
            <p className="text-[10px] text-muted-foreground/70">No deployment URL</p>
          </div>
        </div>
        <div className="h-20 rounded-lg bg-muted/30 border border-dashed border-border/50 flex flex-col items-center justify-center">
          <ImageOff className="h-5 w-5 text-muted-foreground/40 mb-1" />
          <p className="text-[10px] text-muted-foreground/60 text-center px-2">
            Add deployment URL for previews
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('p-3 rounded-xl bg-muted/50 border border-border/50', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
            <Globe className="h-4 w-4 text-green-500" />
          </div>
          <div>
            <p className="text-sm font-medium">Live Preview</p>
            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              {new URL(deploymentUrl).hostname}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCapture}
          disabled={captureScreenshot.isPending}
          title="Refresh screenshot"
        >
          {captureScreenshot.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Screenshot Preview */}
      <div className="relative group">
        {screenshotUrl && !imageError ? (
          <>
            <a
              href={deploymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="rounded-lg overflow-hidden border border-border/50 bg-background/50">
                <img
                  src={screenshotUrl}
                  alt="Live site preview"
                  className="w-full h-auto object-contain transition-transform group-hover:scale-[1.02]"
                  onError={() => setImageError(true)}
                />
              </div>
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <div className="flex items-center gap-2 text-white text-sm font-medium">
                  <ExternalLink className="h-4 w-4" />
                  Visit Site
                </div>
              </div>
            </a>
          </>
        ) : (
          <div className="h-32 rounded-lg bg-muted/30 border border-dashed border-border/50 flex flex-col items-center justify-center">
            {captureScreenshot.isPending ? (
              <>
                <Loader2 className="h-6 w-6 text-muted-foreground/40 mb-2 animate-spin" />
                <p className="text-xs text-muted-foreground/60">Capturing...</p>
              </>
            ) : (
              <>
                <Camera className="h-6 w-6 text-muted-foreground/40 mb-2" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCapture}
                  className="text-xs h-7"
                >
                  <Camera className="h-3 w-3 mr-1" />
                  Capture Screenshot
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick action to visit site */}
      {screenshotUrl && !imageError && (
        <div className="mt-2">
          <a
            href={deploymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 w-full py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Visit Live Site
          </a>
        </div>
      )}
    </div>
  );
}

export default ProjectScreenshotPreview;
