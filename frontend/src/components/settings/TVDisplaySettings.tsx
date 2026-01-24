'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Tv,
  Plus,
  Trash2,
  GripVertical,
  Play,
  ExternalLink,
  Save,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Slideshow types - must match the TV page
type SlideType = 'overview' | 'column-active' | 'column-on_hold' | 'column-completed' | 'column-archived' | 'logo' | 'top3' | 'video' | 'youtube' | 'recent-issues' | 'recent-commits' | 'hacker-news' | 'reddit';

interface SlideConfig {
  type: SlideType;
  duration: number;
  label: string;
  url?: string;
}

interface SlideshowSettings {
  enabled: boolean;
  slides: SlideConfig[];
  redditSubreddits?: string[];
}

const DEFAULT_SUBREDDITS = ['news', 'technology', 'worldnews', 'science', 'business', 'stocks', 'realestate', 'programming'];

const DEFAULT_SLIDESHOW_SETTINGS: SlideshowSettings = {
  enabled: false,
  slides: [
    { type: 'overview', duration: 20, label: 'All Projects' },
    { type: 'column-active', duration: 20, label: 'Active Projects' },
    { type: 'logo', duration: 5, label: 'Logo' },
  ],
  redditSubreddits: DEFAULT_SUBREDDITS,
};

const AVAILABLE_SLIDES: { type: SlideType; label: string; description: string; hasUrl?: boolean }[] = [
  { type: 'overview', label: 'All Projects (Kanban)', description: 'Shows all projects in a kanban board view' },
  { type: 'top3', label: 'Top 3 In Talks', description: 'Highlights your top 3 projects in talks' },
  { type: 'recent-issues', label: 'Recent GitHub Issues', description: 'Shows recent issues from connected repos' },
  { type: 'recent-commits', label: 'Recent Commits', description: 'Shows recent commits from connected repos' },
  { type: 'hacker-news', label: 'Hacker News Feed', description: 'Live feed from Hacker News top stories' },
  { type: 'reddit', label: 'Reddit Feed', description: 'Live feed from selected subreddits' },
  { type: 'column-active', label: 'In Talks Column', description: 'Shows only projects in talks' },
  { type: 'column-on_hold', label: 'Now Coding Column', description: 'Shows only projects being coded' },
  { type: 'column-completed', label: 'In Review Column', description: 'Shows only projects in review' },
  { type: 'column-archived', label: 'Complete Column', description: 'Shows only completed projects' },
  { type: 'logo', label: 'Logo Screen', description: 'Displays your company logo' },
  { type: 'video', label: 'MP4 Video', description: 'Play a custom MP4 video', hasUrl: true },
  { type: 'youtube', label: 'YouTube Video', description: 'Embed a YouTube video', hasUrl: true },
];

// Load settings from localStorage
const loadSlideshowSettings = (): SlideshowSettings => {
  if (typeof window === 'undefined') return DEFAULT_SLIDESHOW_SETTINGS;
  try {
    const saved = localStorage.getItem('tv-slideshow-settings');
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_SLIDESHOW_SETTINGS;
};

// Save settings to localStorage
const saveSlideshowSettings = (settings: SlideshowSettings) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('tv-slideshow-settings', JSON.stringify(settings));
};

export default function TVDisplaySettings() {
  const [settings, setSettings] = useState<SlideshowSettings>(DEFAULT_SLIDESHOW_SETTINGS);
  const [showAddSlide, setShowAddSlide] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoLabel, setVideoLabel] = useState('');
  const [addingSlideType, setAddingSlideType] = useState<SlideType | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [newSubreddit, setNewSubreddit] = useState('');

  // Load settings on mount
  useEffect(() => {
    const loaded = loadSlideshowSettings();
    // Ensure redditSubreddits exists
    if (!loaded.redditSubreddits) {
      loaded.redditSubreddits = DEFAULT_SUBREDDITS;
    }
    setSettings(loaded);
  }, []);

  const handleAddSubreddit = () => {
    const sub = newSubreddit.trim().toLowerCase().replace(/^r\//, '');
    if (!sub) return;
    if (settings.redditSubreddits?.includes(sub)) {
      toast.error('Subreddit already added');
      return;
    }
    setSettings(prev => ({
      ...prev,
      redditSubreddits: [...(prev.redditSubreddits || []), sub],
    }));
    setNewSubreddit('');
    setHasChanges(true);
  };

  const handleRemoveSubreddit = (sub: string) => {
    setSettings(prev => ({
      ...prev,
      redditSubreddits: (prev.redditSubreddits || []).filter(s => s !== sub),
    }));
    setHasChanges(true);
  };

  const handleAddSlide = (type: SlideType) => {
    const slideInfo = AVAILABLE_SLIDES.find(s => s.type === type);
    if (!slideInfo) return;

    if (slideInfo.hasUrl) {
      setAddingSlideType(type);
      setVideoUrl('');
      setVideoLabel('');
      return;
    }

    const newSlide: SlideConfig = {
      type,
      duration: 15,
      label: slideInfo.label,
    };

    setSettings(prev => ({
      ...prev,
      slides: [...prev.slides, newSlide],
    }));
    setHasChanges(true);
    setShowAddSlide(false);
  };

  const handleAddVideoSlide = () => {
    if (!videoUrl.trim() || !addingSlideType) return;

    const slideInfo = AVAILABLE_SLIDES.find(s => s.type === addingSlideType);
    const newSlide: SlideConfig = {
      type: addingSlideType,
      duration: 30,
      label: videoLabel.trim() || slideInfo?.label || addingSlideType,
      url: videoUrl.trim(),
    };

    setSettings(prev => ({
      ...prev,
      slides: [...prev.slides, newSlide],
    }));
    setHasChanges(true);
    setAddingSlideType(null);
    setVideoUrl('');
    setVideoLabel('');
  };

  const handleRemoveSlide = (index: number) => {
    setSettings(prev => ({
      ...prev,
      slides: prev.slides.filter((_, i) => i !== index),
    }));
    setHasChanges(true);
  };

  const handleDurationChange = (index: number, duration: number) => {
    setSettings(prev => ({
      ...prev,
      slides: prev.slides.map((slide, i) =>
        i === index ? { ...slide, duration: Math.max(5, duration) } : slide
      ),
    }));
    setHasChanges(true);
  };

  const handleToggleEnabled = (enabled: boolean) => {
    setSettings(prev => ({ ...prev, enabled }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveSlideshowSettings(settings);
    setHasChanges(false);
    toast.success('TV Display settings saved');
  };

  const handleReset = () => {
    setSettings(DEFAULT_SLIDESHOW_SETTINGS);
    setHasChanges(true);
  };

  const moveSlide = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= settings.slides.length) return;

    const newSlides = [...settings.slides];
    const [removed] = newSlides.splice(fromIndex, 1);
    newSlides.splice(toIndex, 0, removed);

    setSettings(prev => ({ ...prev, slides: newSlides }));
    setHasChanges(true);
  };

  const totalDuration = settings.slides.reduce((acc, slide) => acc + slide.duration, 0);

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={settings.enabled}
              onCheckedChange={handleToggleEnabled}
            />
            <Label>Auto-start slideshow</Label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/tv/projects', '_blank')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open TV Display
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Tv className="h-4 w-4" />
            <span className="text-sm">Slides</span>
          </div>
          <p className="text-2xl font-bold">{settings.slides.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Total Duration</span>
          </div>
          <p className="text-2xl font-bold">{Math.floor(totalDuration / 60)}m {totalDuration % 60}s</p>
        </div>
        <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Play className="h-4 w-4" />
            <span className="text-sm">Status</span>
          </div>
          <p className="text-2xl font-bold">{settings.enabled ? 'Auto' : 'Manual'}</p>
        </div>
      </div>

      {/* Current Slides */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Slideshow Order</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddSlide(!showAddSlide)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Slide
          </Button>
        </div>

        {settings.slides.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-border/50 text-center">
            <Tv className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No slides configured</p>
            <p className="text-sm text-muted-foreground/70">Add slides to create your TV display slideshow</p>
          </div>
        ) : (
          <div className="space-y-2">
            {settings.slides.map((slide, index) => (
              <div
                key={`${slide.type}-${index}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/50 group"
              >
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-50 hover:opacity-100"
                    onClick={() => moveSlide(index, index - 1)}
                    disabled={index === 0}
                  >
                    <span className="text-xs">↑</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-50 hover:opacity-100"
                    onClick={() => moveSlide(index, index + 1)}
                    disabled={index === settings.slides.length - 1}
                  >
                    <span className="text-xs">↓</span>
                  </Button>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{slide.label}</span>
                    <Badge variant="outline" className="text-xs">
                      {slide.type}
                    </Badge>
                  </div>
                  {slide.url && (
                    <p className="text-xs text-muted-foreground truncate max-w-md">
                      {slide.url}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={slide.duration}
                      onChange={(e) => handleDurationChange(index, parseInt(e.target.value) || 5)}
                      className="w-16 h-8 text-center"
                      min={5}
                    />
                    <span className="text-sm text-muted-foreground">sec</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveSlide(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Slide Panel */}
      {showAddSlide && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-4">
          <Label className="text-base font-semibold">Available Slides</Label>
          <div className="grid grid-cols-2 gap-2">
            {AVAILABLE_SLIDES.filter(s => !s.hasUrl).map((slide) => (
              <button
                key={slide.type}
                onClick={() => handleAddSlide(slide.type)}
                className="p-3 rounded-lg bg-background border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
              >
                <p className="font-medium text-sm">{slide.label}</p>
                <p className="text-xs text-muted-foreground">{slide.description}</p>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-border/50">
            <Label className="text-sm font-medium text-muted-foreground mb-2 block">Media Slides</Label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_SLIDES.filter(s => s.hasUrl).map((slide) => (
                <button
                  key={slide.type}
                  onClick={() => handleAddSlide(slide.type)}
                  className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/20 transition-all text-left"
                >
                  <p className="font-medium text-sm text-blue-400">{slide.label}</p>
                  <p className="text-xs text-muted-foreground">{slide.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Video URL Modal */}
      {addingSlideType && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-4">
          <Label className="text-base font-semibold">
            Add {addingSlideType === 'video' ? 'MP4 Video' : 'YouTube Video'}
          </Label>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm">URL</Label>
              <Input
                placeholder={addingSlideType === 'video' ? 'https://example.com/video.mp4' : 'https://youtube.com/watch?v=...'}
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Label (optional)</Label>
              <Input
                placeholder="Custom label for this slide"
                value={videoLabel}
                onChange={(e) => setVideoLabel(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleAddVideoSlide} disabled={!videoUrl.trim()}>
                Add Slide
              </Button>
              <Button variant="outline" onClick={() => setAddingSlideType(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reddit Subreddits Configuration */}
      <div className="space-y-3 pt-4 border-t border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">Reddit Subreddits</Label>
            <p className="text-sm text-muted-foreground">Customize which subreddits appear in the Reddit slide</p>
          </div>
        </div>

        {/* Current subreddits */}
        <div className="flex flex-wrap gap-2">
          {(settings.redditSubreddits || DEFAULT_SUBREDDITS).map((sub) => (
            <Badge
              key={sub}
              variant="secondary"
              className="pl-3 pr-1 py-1.5 flex items-center gap-1 bg-orange-500/10 text-orange-400 border border-orange-500/30"
            >
              r/{sub}
              <button
                onClick={() => handleRemoveSubreddit(sub)}
                className="ml-1 p-0.5 rounded-full hover:bg-orange-500/20 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        {/* Add new subreddit */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Enter subreddit name (e.g., programming)"
            value={newSubreddit}
            onChange={(e) => setNewSubreddit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSubreddit();
              }
            }}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddSubreddit}
            disabled={!newSubreddit.trim()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </div>

        {/* Reset to defaults */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSettings(prev => ({ ...prev, redditSubreddits: DEFAULT_SUBREDDITS }));
            setHasChanges(true);
          }}
          className="text-muted-foreground"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to default subreddits
        </Button>
      </div>
    </div>
  );
}
