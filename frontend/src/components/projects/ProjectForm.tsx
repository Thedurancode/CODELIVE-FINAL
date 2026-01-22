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
import { X, Plus, Loader2, Github, Globe, Upload, ImageIcon, Trash2 } from 'lucide-react';
import type { Project, ProjectStatus } from '@/types';
import { GitHubRepoPicker } from './GitHubRepoPicker';
import { TeamMemberSelector } from './TeamMemberSelector';
import { api } from '@/lib/api';

const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
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
  const [status, setStatus] = useState<ProjectStatus>(project?.status || 'active');
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
      setStatus(project.status || 'active');
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Logo */}
      <div>
        <Label className="text-muted-foreground text-sm flex items-center gap-2 mb-2">
          <ImageIcon className="h-4 w-4" />
          Project Logo
        </Label>
        <div className="flex items-center gap-4">
          {logoPreview ? (
            <div className="relative">
              <img
                src={logoPreview}
                alt="Project logo preview"
                className="h-16 w-16 rounded-lg object-cover border border-border"
              />
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => logoInputRef.current?.click()}
              className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-accent-400 hover:bg-secondary/50 transition-colors"
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
              className="border"
            >
              <Upload className="h-4 w-4 mr-2" />
              {logoPreview ? 'Change' : 'Upload'}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPG up to 5MB. Recommended: 256x256px
            </p>
          </div>
        </div>
      </div>

      {/* Title */}
      <div>
        <Label className="text-muted-foreground text-sm">Title *</Label>
        <Input
          placeholder="Project title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 bg-secondary border text-foreground"
          required
        />
      </div>

      {/* Description */}
      <div>
        <Label className="text-muted-foreground text-sm">Description</Label>
        <Textarea
          placeholder="Describe the project..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 bg-secondary border text-foreground min-h-24"
        />
      </div>

      {/* Team Members */}
      <TeamMemberSelector
        selectedIds={selectedMemberIds}
        onChange={setSelectedMemberIds}
        label="Team Members"
      />

      {/* GitHub Repository */}
      <div>
        <Label className="text-muted-foreground text-sm flex items-center gap-2 mb-2">
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
      <div>
        <Label className="text-muted-foreground text-sm flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Deployment URL
        </Label>
        <Input
          type="url"
          placeholder="https://myproject.vercel.app"
          value={deploymentUrl}
          onChange={(e) => setDeploymentUrl(e.target.value)}
          className="mt-1 bg-secondary border text-foreground"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Live preview or production URL for this project
        </p>
      </div>

      {/* Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-muted-foreground text-sm">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
            <SelectTrigger className="mt-1 bg-secondary border text-foreground">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-foreground">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-muted-foreground text-sm">Start Date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 bg-secondary border text-foreground"
          />
        </div>
        <div>
          <Label className="text-muted-foreground text-sm">Target End Date</Label>
          <Input
            type="date"
            value={targetEndDate}
            onChange={(e) => setTargetEndDate(e.target.value)}
            className="mt-1 bg-secondary border text-foreground"
          />
        </div>
      </div>

      {/* Tags */}
      <div>
        <Label className="text-muted-foreground text-sm">Tags</Label>
        <div className="flex gap-2 mt-1">
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
            className="bg-secondary border text-foreground"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={addTag}
            className="border"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="bg-accent-500/20 text-accent-400"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4 border-t border">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border text-foreground"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
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
