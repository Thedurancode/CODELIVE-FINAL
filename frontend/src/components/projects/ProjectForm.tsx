'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Plus, Loader2, Github, Globe, Upload, ImageIcon, FileText, Calendar, Tag, Users, Link2, Activity } from 'lucide-react';
import type { Project, ProjectStatus } from '@/types';
import { GitHubRepoPicker } from './GitHubRepoPicker';
import { TeamMemberSelector } from './TeamMemberSelector';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'in_talks', label: 'In Talks' },
  { value: 'now_coding', label: 'Now Coding' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface ProjectFormProps {
  project?: Project;
  onSubmit: (data: Partial<Project> & { memberIds?: string[] }) => void;
  onCancel: () => void;
  isLoading?: boolean;
  initialMemberIds?: string[];
}

export function ProjectForm({ project, onSubmit, onCancel, isLoading, initialMemberIds = [] }: ProjectFormProps) {
  const [title, setTitle] = useState(project?.title || '');
  const [description, setDescription] = useState(project?.description || '');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(initialMemberIds);
  const [logoUrl, setLogoUrl] = useState<string | null>(project?.logoUrl || null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(project?.logoUrl || null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [githubUrl, setGithubUrl] = useState<string | null>(project?.githubUrl || null);
  const [deploymentUrl, setDeploymentUrl] = useState(project?.deploymentUrl || '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status || 'in_talks');
  const [startDate, setStartDate] = useState(
    project?.startDate ? new Date(project.startDate).toISOString().split('T')[0] : ''
  );
  const [targetEndDate, setTargetEndDate] = useState(
    project?.targetEndDate ? new Date(project.targetEndDate).toISOString().split('T')[0] : ''
  );
  const [tags, setTags] = useState<string[]>(project?.tags || []);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (project) {
      setTitle(project.title || '');
      setDescription(project.description || '');
      setLogoUrl(project.logoUrl || null);
      setLogoPreview(project.logoUrl || null);
      setGithubUrl(project.githubUrl || null);
      setDeploymentUrl(project.deploymentUrl || '');
      setStatus(project.status || 'in_talks');
      setStartDate(
        project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : ''
      );
      setTargetEndDate(
        project.targetEndDate ? new Date(project.targetEndDate).toISOString().split('T')[0] : ''
      );
      setTags(project.tags || []);
    }
  }, [project]);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log('[ProjectForm] handleLogoSelect called', { hasFile: !!file, fileName: file?.name, fileType: file?.type, fileSize: file?.size });
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.log('[ProjectForm] Invalid file type:', file.type);
        alert('Please select an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        console.log('[ProjectForm] File too large:', file.size);
        alert('File size must be less than 5MB');
        return;
      }
      console.log('[ProjectForm] Setting logo file:', file.name);
      setLogoFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoUrl(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('[ProjectForm] handleSubmit called', {
      hasLogoFile: !!logoFile,
      logoFileName: logoFile?.name,
      projectId: project?.id,
      logoUrl,
      logoPreview: logoPreview?.substring(0, 50)
    });

    // If editing and we have a logo file, we need to upload it after the project is created/updated
    // For now, we pass the logoUrl (which might be null if removed) and handle file upload separately
    const projectData: Partial<Project> & { memberIds?: string[] } = {
      title,
      description: description || undefined,
      logoUrl: logoUrl || undefined,
      githubUrl: githubUrl || undefined,
      deploymentUrl: deploymentUrl || undefined,
      status,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      targetEndDate: targetEndDate ? new Date(targetEndDate).toISOString() : undefined,
      tags,
      memberIds: selectedMemberIds.length > 0 ? selectedMemberIds : undefined,
    };

    // If there's a new logo file and we're editing an existing project, upload it first
    if (logoFile && project?.id) {
      setIsUploadingLogo(true);
      try {
        console.log('Uploading logo for project:', project.id, 'file:', logoFile.name, 'size:', logoFile.size);
        const formData = new FormData();
        formData.append('file', logoFile);
        const result = await api.upload<{ logoUrl: string }>(`/api/projects/${project.id}/logo`, formData);
        console.log('Logo upload result:', result);
        if (result?.logoUrl) {
          projectData.logoUrl = result.logoUrl;
        }
      } catch (error: any) {
        console.error('Failed to upload logo:', error);
        // Show error to user but still allow the rest of the update to proceed
        alert(`Logo upload failed: ${error?.message || 'Unknown error'}`);
      } finally {
        setIsUploadingLogo(false);
      }
    }

    // Store the logo file reference so parent can upload it after creating new project
    if (logoFile && !project?.id) {
      (projectData as any)._logoFile = logoFile;
    }

    onSubmit(projectData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-4">
          {/* Project Identity Section */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Project Identity</p>
                <p className="text-xs text-muted-foreground">Logo, name, and description</p>
              </div>
            </div>

            {/* Logo */}
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative">
                  <img
                    src={logoPreview}
                    alt="Project logo preview"
                    className="h-16 w-16 rounded-xl object-cover border border-border/50"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="h-16 w-16 rounded-xl border-2 border-dashed border-border/50 flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  className="border-border/50"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {logoPreview ? 'Change' : 'Upload'}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG up to 5MB
                </p>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Project Name *</Label>
              <Input
                placeholder="Enter project name..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-background/50 border-border/50"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Description</Label>
              <Textarea
                placeholder="Describe the project..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-background/50 border-border/50 min-h-20 resize-none"
              />
            </div>
          </div>

          {/* Team Section */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="font-medium">Team</p>
                <p className="text-xs text-muted-foreground">Assign team members</p>
              </div>
            </div>
            <TeamMemberSelector
              selectedIds={selectedMemberIds}
              onChange={setSelectedMemberIds}
            />
          </div>

          {/* Integrations Section */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Link2 className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="font-medium">Integrations</p>
                <p className="text-xs text-muted-foreground">GitHub and deployment</p>
              </div>
            </div>

            {/* GitHub Repository */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm flex items-center gap-2">
                <Github className="h-4 w-4" />
                GitHub Repository
              </Label>
              <GitHubRepoPicker
                value={githubUrl}
                onChange={setGithubUrl}
                projectName={title}
              />
            </div>

            {/* Deployment URL */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Deployment URL
              </Label>
              <Input
                type="url"
                placeholder="https://myproject.vercel.app"
                value={deploymentUrl}
                onChange={(e) => setDeploymentUrl(e.target.value)}
                className="bg-background/50 border-border/50"
              />
            </div>
          </div>

          {/* Status & Timeline Section */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Activity className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="font-medium">Status & Timeline</p>
                <p className="text-xs text-muted-foreground">Project status and dates</p>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger className="bg-background/50 border-border/50">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Start Date
                </Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-background/50 border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Target End
                </Label>
                <Input
                  type="date"
                  value={targetEndDate}
                  onChange={(e) => setTargetEndDate(e.target.value)}
                  className="bg-background/50 border-border/50"
                />
              </div>
            </div>
          </div>

          {/* Tags Section */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <Tag className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="font-medium">Tags</p>
                <p className="text-xs text-muted-foreground">Categorize your project</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="bg-background/50 border-border/50"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addTag}
                className="border-border/50 shrink-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-primary/10 text-primary border border-primary/20 px-3 py-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-2 hover:text-red-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Actions - Fixed at bottom */}
      <div className="flex gap-3 pt-4 border-t border-border/50">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border-border/50"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={isLoading || isUploadingLogo || !title.trim()}
        >
          {isLoading || isUploadingLogo ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isUploadingLogo ? 'Uploading...' : 'Saving...'}
            </>
          ) : project ? (
            'Update Project'
          ) : (
            'Create Project'
          )}
        </Button>
      </div>
    </form>
  );
}
