'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Image,
  Upload,
  MoreVertical,
  Trash2,
  Edit2,
  Star,
  StarOff,
  Download,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  RefreshCw,
  Palette,
  Sun,
  Moon,
  Contrast,
  Paintbrush,
  Layers,
  ImageIcon,
  FileImage,
  Square,
  Info,
  Type,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useProjectBrandAssets,
  useCreateProjectBrandAsset,
  useUpdateProjectBrandAsset,
  useDeleteProjectBrandAsset,
} from '@/hooks/use-project-brand-assets';
import { useProject, useUpdateProject } from '@/hooks/use-projects';
import type { ProjectBrandAsset, BrandAssetType, BrandAssetVariant, BrandSettings, BrandStyle } from '@/types';

// Style options for design preferences
const STYLE_OPTIONS: { value: BrandStyle; label: string; description: string }[] = [
  { value: 'modern', label: 'Modern', description: 'Clean lines, minimalist approach' },
  { value: 'classic', label: 'Classic', description: 'Timeless, traditional design' },
  { value: 'minimalist', label: 'Minimalist', description: 'Simple, essential elements only' },
  { value: 'bold', label: 'Bold', description: 'Strong, attention-grabbing visuals' },
  { value: 'playful', label: 'Playful', description: 'Fun, energetic, and creative' },
  { value: 'elegant', label: 'Elegant', description: 'Sophisticated and refined' },
  { value: 'tech', label: 'Tech', description: 'Futuristic, digital-focused' },
];

// Common font options
const FONT_OPTIONS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway',
  'Playfair Display', 'Merriweather', 'Source Sans Pro', 'Nunito', 'Work Sans',
  'DM Sans', 'Space Grotesk', 'Outfit', 'Plus Jakarta Sans',
];

interface ProjectBrandPanelProps {
  projectId: string;
}

// Asset type display config
const ASSET_TYPE_CONFIG: Record<BrandAssetType, { label: string; icon: React.ReactNode; color: string }> = {
  logo: { label: 'Logo', icon: <Palette className="h-4 w-4" />, color: 'text-purple-400 bg-purple-500/20 border-purple-500/30' },
  icon: { label: 'Icon', icon: <Square className="h-4 w-4" />, color: 'text-blue-400 bg-blue-500/20 border-blue-500/30' },
  banner: { label: 'Banner', icon: <Layers className="h-4 w-4" />, color: 'text-green-400 bg-green-500/20 border-green-500/30' },
  favicon: { label: 'Favicon', icon: <ImageIcon className="h-4 w-4" />, color: 'text-amber-400 bg-amber-500/20 border-amber-500/30' },
  watermark: { label: 'Watermark', icon: <FileImage className="h-4 w-4" />, color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30' },
  background: { label: 'Background', icon: <Image className="h-4 w-4" />, color: 'text-pink-400 bg-pink-500/20 border-pink-500/30' },
  other: { label: 'Other', icon: <FileImage className="h-4 w-4" />, color: 'text-zinc-400 bg-zinc-500/20 border-zinc-500/30' },
};

// Variant display config
const VARIANT_CONFIG: Record<BrandAssetVariant, { label: string; icon: React.ReactNode }> = {
  default: { label: 'Default', icon: <Paintbrush className="h-3 w-3" /> },
  light: { label: 'Light', icon: <Sun className="h-3 w-3" /> },
  dark: { label: 'Dark', icon: <Moon className="h-3 w-3" /> },
  monochrome: { label: 'Monochrome', icon: <Contrast className="h-3 w-3" /> },
  colored: { label: 'Colored', icon: <Palette className="h-3 w-3" /> },
  transparent: { label: 'Transparent', icon: <Layers className="h-3 w-3" /> },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectBrandPanel({ projectId }: ProjectBrandPanelProps) {
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ProjectBrandAsset | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadAssetType, setUploadAssetType] = useState<BrandAssetType>('logo');
  const [uploadVariant, setUploadVariant] = useState<BrandAssetVariant>('default');
  const [uploadIsPrimary, setUploadIsPrimary] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAssetType, setEditAssetType] = useState<BrandAssetType>('logo');
  const [editVariant, setEditVariant] = useState<BrandAssetVariant>('default');
  const [editIsPrimary, setEditIsPrimary] = useState(false);

  // Brand assets hooks
  const { data: assets, isLoading, error, refetch } = useProjectBrandAssets(projectId);
  const createAsset = useCreateProjectBrandAsset(projectId);
  const updateAsset = useUpdateProjectBrandAsset(projectId);
  const deleteAsset = useDeleteProjectBrandAsset(projectId);

  // Project data hooks for about us and brand settings
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const updateProject = useUpdateProject();

  // About Us state
  const [aboutUs, setAboutUs] = useState('');
  const [aboutUsDirty, setAboutUsDirty] = useState(false);
  const [isEditingAboutUs, setIsEditingAboutUs] = useState(false);

  // Brand Settings state
  const [brandSettings, setBrandSettings] = useState<BrandSettings>({});
  const [brandSettingsDirty, setBrandSettingsDirty] = useState(false);

  // Sync state with project data
  useEffect(() => {
    if (project) {
      setAboutUs(project.aboutUs || '');
      setBrandSettings(project.brandSettings || {});
      setAboutUsDirty(false);
      setBrandSettingsDirty(false);
    }
  }, [project]);

  // Save about us
  const handleSaveAboutUs = async () => {
    try {
      await updateProject.mutateAsync({
        id: projectId,
        data: { aboutUs: aboutUs || null },
      });
      setAboutUsDirty(false);
      setIsEditingAboutUs(false);
      toast.success('About Us saved');
    } catch (err) {
      toast.error('Failed to save About Us');
    }
  };

  // Cancel editing about us
  const handleCancelAboutUs = () => {
    setAboutUs(project?.aboutUs || '');
    setAboutUsDirty(false);
    setIsEditingAboutUs(false);
  };

  // Save brand settings
  const handleSaveBrandSettings = async () => {
    try {
      await updateProject.mutateAsync({
        id: projectId,
        data: { brandSettings: Object.keys(brandSettings).length > 0 ? brandSettings : null },
      });
      setBrandSettingsDirty(false);
      toast.success('Design preferences saved');
    } catch (err) {
      toast.error('Failed to save design preferences');
    }
  };

  // Update brand settings helper
  const updateBrandSetting = <K extends keyof BrandSettings>(key: K, value: BrandSettings[K]) => {
    setBrandSettings(prev => ({ ...prev, [key]: value }));
    setBrandSettingsDirty(true);
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.includes('svg')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploadFile(file);
    setUploadName(file.name.replace(/\.[^/.]+$/, '')); // Use filename without extension

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) {
      toast.error('Please select a file and enter a name');
      return;
    }

    try {
      await createAsset.mutateAsync({
        file: uploadFile,
        name: uploadName.trim(),
        description: uploadDescription.trim() || undefined,
        assetType: uploadAssetType,
        variant: uploadVariant,
        isPrimary: uploadIsPrimary,
      });

      toast.success('Brand asset uploaded');
      resetUploadForm();
      setIsUploadDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload asset');
    }
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadPreview(null);
    setUploadName('');
    setUploadDescription('');
    setUploadAssetType('logo');
    setUploadVariant('default');
    setUploadIsPrimary(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleEdit = (asset: ProjectBrandAsset) => {
    setEditingAsset(asset);
    setEditName(asset.name);
    setEditDescription(asset.description || '');
    setEditAssetType(asset.assetType);
    setEditVariant(asset.variant);
    setEditIsPrimary(asset.isPrimary);
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingAsset || !editName.trim()) return;

    try {
      await updateAsset.mutateAsync({
        assetId: editingAsset.id,
        data: {
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          assetType: editAssetType,
          variant: editVariant,
          isPrimary: editIsPrimary,
        },
      });

      toast.success('Brand asset updated');
      setIsEditDialogOpen(false);
      setEditingAsset(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update asset');
    }
  };

  const handleDelete = async (asset: ProjectBrandAsset) => {
    if (!confirm(`Delete "${asset.name}"? This cannot be undone.`)) return;

    try {
      await deleteAsset.mutateAsync(asset.id);
      toast.success('Brand asset deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete asset');
    }
  };

  const handleSetPrimary = async (asset: ProjectBrandAsset) => {
    try {
      await updateAsset.mutateAsync({
        assetId: asset.id,
        data: { isPrimary: true },
      });
      toast.success(`"${asset.name}" set as primary`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set primary');
    }
  };

  const handleCopyUrl = (asset: ProjectBrandAsset) => {
    navigator.clipboard.writeText(asset.storageUrl);
    setCopiedUrl(asset.id);
    toast.success('URL copied to clipboard');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleDownload = (asset: ProjectBrandAsset) => {
    const link = document.createElement('a');
    link.href = asset.storageUrl;
    link.download = asset.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Group assets by type
  const groupedAssets = (assets || []).reduce((acc, asset) => {
    if (!acc[asset.assetType]) acc[asset.assetType] = [];
    acc[asset.assetType].push(asset);
    return acc;
  }, {} as Record<BrandAssetType, ProjectBrandAsset[]>);

  if (isLoading) {
    return (
      <Card className="bg-card border">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-muted-foreground">Failed to load brand assets</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
              <Palette className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-medium">Brand & Design</CardTitle>
              <p className="text-xs text-muted-foreground">
                Assets, about us, and design preferences
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="assets" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="assets" className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Assets
              </TabsTrigger>
              <TabsTrigger value="about" className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                About Us
              </TabsTrigger>
              <TabsTrigger value="design" className="flex items-center gap-2">
                <Paintbrush className="h-4 w-4" />
                Design
              </TabsTrigger>
            </TabsList>

            {/* ASSETS TAB */}
            <TabsContent value="assets" className="mt-0">
              <div className="flex justify-end mb-4">
                <Button
                  onClick={() => setIsUploadDialogOpen(true)}
                  className="bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Asset
                </Button>
              </div>
          {(!assets || assets.length === 0) ? (
            <div className="text-center py-12">
              <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Image className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground mb-2">No brand assets yet</p>
              <p className="text-xs text-muted-foreground/70 mb-4">
                Upload logos, icons, and other brand images
              </p>
              <Button
                variant="outline"
                onClick={() => setIsUploadDialogOpen(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload First Asset
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedAssets).map(([type, typeAssets]) => (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge
                      variant="outline"
                      className={ASSET_TYPE_CONFIG[type as BrandAssetType].color}
                    >
                      {ASSET_TYPE_CONFIG[type as BrandAssetType].icon}
                      <span className="ml-1">{ASSET_TYPE_CONFIG[type as BrandAssetType].label}</span>
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {typeAssets.length} asset{typeAssets.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {typeAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="group relative rounded-xl border border-border/50 bg-muted/30 overflow-hidden hover:border-border transition-all"
                      >
                        {/* Image Preview */}
                        <div className="aspect-square relative bg-[url('/checkerboard.svg')] bg-repeat bg-[length:20px_20px]">
                          <img
                            src={asset.storageUrl}
                            alt={asset.name}
                            className="absolute inset-0 w-full h-full object-contain p-2"
                          />
                          {asset.isPrimary && (
                            <div className="absolute top-2 left-2">
                              <Badge className="bg-amber-500/90 text-amber-950 text-[10px] px-1.5 py-0.5">
                                <Star className="h-3 w-3 mr-0.5" />
                                Primary
                              </Badge>
                            </div>
                          )}
                          {/* Hover Actions */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-white hover:bg-white/20"
                              onClick={() => handleCopyUrl(asset)}
                            >
                              {copiedUrl === asset.id ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-white hover:bg-white/20"
                              onClick={() => handleDownload(asset)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {/* Info */}
                        <div className="p-2">
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{asset.name}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                  {VARIANT_CONFIG[asset.variant].icon}
                                  <span className="ml-0.5">{VARIANT_CONFIG[asset.variant].label}</span>
                                </Badge>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {asset.width && asset.height
                                  ? `${asset.width}×${asset.height} · `
                                  : ''}
                                {formatFileSize(asset.fileSize)}
                              </p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 shrink-0"
                                >
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-card border">
                                <DropdownMenuItem onClick={() => handleEdit(asset)}>
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                {!asset.isPrimary && (
                                  <DropdownMenuItem onClick={() => handleSetPrimary(asset)}>
                                    <Star className="h-4 w-4 mr-2" />
                                    Set as Primary
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleCopyUrl(asset)}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy URL
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownload(asset)}>
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(asset)}
                                  className="text-red-400"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
            </TabsContent>

            {/* ABOUT US TAB */}
            <TabsContent value="about" className="mt-0">
              {isEditingAboutUs ? (
                /* Edit Mode */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-medium">Edit About Us</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Describe your company, project, or brand story
                      </p>
                    </div>
                  </div>
                  <Textarea
                    id="about-us"
                    value={aboutUs}
                    onChange={(e) => {
                      setAboutUs(e.target.value);
                      setAboutUsDirty(true);
                    }}
                    placeholder="Tell us about your company or project...

Example: We are a innovative tech company focused on building solutions that help businesses grow. Our mission is to simplify complex workflows and empower teams to do their best work."
                    rows={10}
                    className="resize-none bg-muted/30 border-muted focus:bg-background transition-colors"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {aboutUs.length} characters
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={handleCancelAboutUs}
                        disabled={updateProject.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveAboutUs}
                        disabled={!aboutUsDirty || updateProject.isPending}
                        className="bg-purple-500 hover:bg-purple-600 text-white"
                      >
                        {updateProject.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div className="space-y-4">
                  {aboutUs ? (
                    /* Has Content */
                    <div className="group relative">
                      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
                      <div className="relative rounded-2xl border border-border/50 bg-gradient-to-br from-muted/30 to-muted/10 p-6 hover:border-border transition-colors">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                              <Info className="h-5 w-5 text-purple-400" />
                            </div>
                            <div>
                              <h3 className="font-semibold">About Us</h3>
                              <p className="text-xs text-muted-foreground">Company Description</p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEditingAboutUs(true)}
                            className="border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                          >
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        </div>
                        <div className="prose prose-sm prose-invert max-w-none">
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {aboutUs}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50">
                          <span className="text-xs text-muted-foreground">
                            {aboutUs.length} characters
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ~{Math.ceil(aboutUs.split(/\s+/).length / 200)} min read
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Empty State */
                    <div className="relative rounded-2xl border-2 border-dashed border-border/50 bg-muted/10 p-12 text-center hover:border-border hover:bg-muted/20 transition-all cursor-pointer group"
                      onClick={() => setIsEditingAboutUs(true)}
                    >
                      <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center group-hover:from-purple-500/20 group-hover:to-pink-500/20 transition-colors">
                        <Info className="h-8 w-8 text-purple-400/50 group-hover:text-purple-400 transition-colors" />
                      </div>
                      <h3 className="text-lg font-medium mb-2">Add Your Story</h3>
                      <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                        Share your company&apos;s mission, vision, and what makes you unique. This helps with marketing materials and AI-generated content.
                      </p>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditingAboutUs(true);
                        }}
                        className="bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30"
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Write About Us
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* DESIGN PREFERENCES TAB */}
            <TabsContent value="design" className="mt-0">
              <div className="space-y-6">
                {/* Colors Section */}
                <div>
                  <h3 className="text-base font-medium mb-3 flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Brand Colors
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="primary-color" className="text-sm">Primary Color</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          id="primary-color"
                          value={brandSettings.primaryColor || '#8b5cf6'}
                          onChange={(e) => updateBrandSetting('primaryColor', e.target.value)}
                          className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                        />
                        <Input
                          value={brandSettings.primaryColor || ''}
                          onChange={(e) => updateBrandSetting('primaryColor', e.target.value)}
                          placeholder="#8b5cf6"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="secondary-color" className="text-sm">Secondary Color</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          id="secondary-color"
                          value={brandSettings.secondaryColor || '#06b6d4'}
                          onChange={(e) => updateBrandSetting('secondaryColor', e.target.value)}
                          className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                        />
                        <Input
                          value={brandSettings.secondaryColor || ''}
                          onChange={(e) => updateBrandSetting('secondaryColor', e.target.value)}
                          placeholder="#06b6d4"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="accent-color" className="text-sm">Accent Color</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          id="accent-color"
                          value={brandSettings.accentColor || '#f59e0b'}
                          onChange={(e) => updateBrandSetting('accentColor', e.target.value)}
                          className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                        />
                        <Input
                          value={brandSettings.accentColor || ''}
                          onChange={(e) => updateBrandSetting('accentColor', e.target.value)}
                          placeholder="#f59e0b"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="bg-color" className="text-sm">Background</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          id="bg-color"
                          value={brandSettings.backgroundColor || '#ffffff'}
                          onChange={(e) => updateBrandSetting('backgroundColor', e.target.value)}
                          className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                        />
                        <Input
                          value={brandSettings.backgroundColor || ''}
                          onChange={(e) => updateBrandSetting('backgroundColor', e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="text-color" className="text-sm">Text Color</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          id="text-color"
                          value={brandSettings.textColor || '#1f2937'}
                          onChange={(e) => updateBrandSetting('textColor', e.target.value)}
                          className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                        />
                        <Input
                          value={brandSettings.textColor || ''}
                          onChange={(e) => updateBrandSetting('textColor', e.target.value)}
                          placeholder="#1f2937"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fonts Section */}
                <div>
                  <h3 className="text-base font-medium mb-3 flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    Typography
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Heading Font</Label>
                      <Select
                        value={brandSettings.headingFont || ''}
                        onValueChange={(v) => updateBrandSetting('headingFont', v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select font..." />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((font) => (
                            <SelectItem key={font} value={font}>
                              {font}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">Body Font</Label>
                      <Select
                        value={brandSettings.bodyFont || ''}
                        onValueChange={(v) => updateBrandSetting('bodyFont', v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select font..." />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((font) => (
                            <SelectItem key={font} value={font}>
                              {font}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Style Section */}
                <div>
                  <h3 className="text-base font-medium mb-3 flex items-center gap-2">
                    <Paintbrush className="h-4 w-4" />
                    Design Style
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {STYLE_OPTIONS.map((style) => (
                      <button
                        key={style.value}
                        onClick={() => updateBrandSetting('style', style.value)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          brandSettings.style === style.value
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-border/50 hover:border-border'
                        }`}
                      >
                        <p className="font-medium text-sm">{style.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{style.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mood Keywords */}
                <div>
                  <Label className="text-sm">Mood Keywords</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    Comma-separated keywords that describe your brand&apos;s personality
                  </p>
                  <Input
                    value={(brandSettings.moodKeywords || []).join(', ')}
                    onChange={(e) => {
                      const keywords = e.target.value.split(',').map(k => k.trim()).filter(Boolean);
                      updateBrandSetting('moodKeywords', keywords);
                    }}
                    placeholder="professional, innovative, friendly, trustworthy"
                  />
                </div>

                {/* Additional Notes */}
                <div>
                  <Label className="text-sm">Additional Design Notes</Label>
                  <Textarea
                    value={brandSettings.additionalNotes || ''}
                    onChange={(e) => updateBrandSetting('additionalNotes', e.target.value)}
                    placeholder="Any other design preferences or guidelines..."
                    rows={3}
                    className="mt-1 resize-none"
                  />
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveBrandSettings}
                    disabled={!brandSettingsDirty || updateProject.isPending}
                    className="bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30"
                  >
                    {updateProject.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Design Preferences
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={(open) => {
        setIsUploadDialogOpen(open);
        if (!open) resetUploadForm();
      }}>
        <DialogContent className="bg-card border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Brand Asset
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* File Upload Area */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                uploadPreview
                  ? 'border-purple-500/50 bg-purple-500/5'
                  : 'border-border/50 hover:border-border'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.svg"
                className="hidden"
                onChange={handleFileSelect}
              />
              {uploadPreview ? (
                <div className="space-y-3">
                  <div className="w-24 h-24 mx-auto rounded-lg bg-[url('/checkerboard.svg')] bg-repeat bg-[length:10px_10px] overflow-hidden">
                    <img
                      src={uploadPreview}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {uploadFile?.name}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetUploadForm();
                    }}
                  >
                    Change File
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">
                    Click or drag to upload
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    PNG, JPG, SVG up to 10MB
                  </p>
                </>
              )}
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              <div>
                <Label htmlFor="upload-name">Name *</Label>
                <Input
                  id="upload-name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g. Company Logo"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="upload-description">Description</Label>
                <Textarea
                  id="upload-description"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Asset Type *</Label>
                  <Select
                    value={uploadAssetType}
                    onValueChange={(v) => setUploadAssetType(v as BrandAssetType)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ASSET_TYPE_CONFIG).map(([type, config]) => (
                        <SelectItem key={type} value={type}>
                          <span className="flex items-center gap-2">
                            {config.icon}
                            {config.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Variant</Label>
                  <Select
                    value={uploadVariant}
                    onValueChange={(v) => setUploadVariant(v as BrandAssetVariant)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(VARIANT_CONFIG).map(([variant, config]) => (
                        <SelectItem key={variant} value={variant}>
                          <span className="flex items-center gap-2">
                            {config.icon}
                            {config.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="upload-primary"
                  checked={uploadIsPrimary}
                  onCheckedChange={(checked) => setUploadIsPrimary(checked === true)}
                />
                <Label
                  htmlFor="upload-primary"
                  className="text-sm cursor-pointer"
                >
                  Set as primary {uploadAssetType}
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!uploadFile || !uploadName.trim() || createAsset.isPending}
              className="bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30"
            >
              {createAsset.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-card border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Edit Brand Asset
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingAsset && (
              <div className="w-20 h-20 mx-auto rounded-lg bg-[url('/checkerboard.svg')] bg-repeat bg-[length:10px_10px] overflow-hidden border border-border/50">
                <img
                  src={editingAsset.storageUrl}
                  alt={editingAsset.name}
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Asset Type</Label>
                  <Select
                    value={editAssetType}
                    onValueChange={(v) => setEditAssetType(v as BrandAssetType)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ASSET_TYPE_CONFIG).map(([type, config]) => (
                        <SelectItem key={type} value={type}>
                          <span className="flex items-center gap-2">
                            {config.icon}
                            {config.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Variant</Label>
                  <Select
                    value={editVariant}
                    onValueChange={(v) => setEditVariant(v as BrandAssetVariant)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(VARIANT_CONFIG).map(([variant, config]) => (
                        <SelectItem key={variant} value={variant}>
                          <span className="flex items-center gap-2">
                            {config.icon}
                            {config.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-primary"
                  checked={editIsPrimary}
                  onCheckedChange={(checked) => setEditIsPrimary(checked === true)}
                />
                <Label
                  htmlFor="edit-primary"
                  className="text-sm cursor-pointer"
                >
                  Set as primary {editAssetType}
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!editName.trim() || updateAsset.isPending}
            >
              {updateAsset.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
