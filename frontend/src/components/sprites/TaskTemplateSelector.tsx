/**
 * TaskTemplateSelector
 *
 * Allows users to select a task template and fill in variables.
 */

'use client';

import { useState, useMemo } from 'react';
import {
  BookTemplate,
  ChevronRight,
  FileCode,
  Bug,
  RefreshCw,
  FileText,
  TestTube,
  Settings,
  Folder,
  Search,
  Plus,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useTaskTemplates } from '@/hooks/use-task-templates';
import type {
  TaskTemplate,
  TaskTemplateCategory,
  AppliedTaskTemplate,
} from '@/types/taskTemplate';
import {
  TASK_TEMPLATE_CATEGORY_LABELS,
  extractTemplateVariables,
  applyTemplateVariables,
} from '@/types/taskTemplate';

interface TaskTemplateSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (applied: AppliedTaskTemplate) => void;
  projectId?: string;
}

// Category icons
const CATEGORY_ICONS: Record<TaskTemplateCategory, React.ElementType> = {
  feature: FileCode,
  bugfix: Bug,
  refactor: RefreshCw,
  documentation: FileText,
  testing: TestTube,
  devops: Settings,
  other: Folder,
};

// Template card component
function TemplateCard({
  template,
  onSelect,
}: {
  template: TaskTemplate;
  onSelect: (template: TaskTemplate) => void;
}) {
  const Icon = CATEGORY_ICONS[template.category] || Folder;

  return (
    <div
      className={cn(
        'p-3 border rounded-lg cursor-pointer transition-all',
        'hover:border-primary hover:bg-primary/5',
        'flex items-start gap-3'
      )}
      onClick={() => onSelect(template)}
    >
      <div className="p-2 bg-muted rounded-md">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-sm truncate">{template.name}</h4>
          {template.usageCount > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5">
              {template.usageCount}x
            </Badge>
          )}
        </div>
        {template.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {template.description}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1.5">
          <Badge
            variant="outline"
            className="text-xs px-1.5 py-0"
          >
            {TASK_TEMPLATE_CATEGORY_LABELS[template.category]}
          </Badge>
          {template.tags.slice(0, 2).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-xs px-1.5 py-0"
            >
              {tag}
            </Badge>
          ))}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
    </div>
  );
}

// Variable input form
function VariableForm({
  template,
  onApply,
  onBack,
}: {
  template: TaskTemplate;
  onApply: (applied: AppliedTaskTemplate) => void;
  onBack: () => void;
}) {
  // Extract all variables from the template
  const variables = useMemo(() => {
    const allVars = new Set<string>();
    extractTemplateVariables(template.titleTemplate).forEach((v) => allVars.add(v));
    extractTemplateVariables(template.descriptionTemplate).forEach((v) => allVars.add(v));
    extractTemplateVariables(template.promptTemplate).forEach((v) => allVars.add(v));
    return Array.from(allVars);
  }, [template]);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(variables.map((v) => [v, '']))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const applied: AppliedTaskTemplate = {
      title: applyTemplateVariables(template.titleTemplate, values),
      description: applyTemplateVariables(template.descriptionTemplate, values),
      prompt: applyTemplateVariables(template.promptTemplate, values),
      priority: template.defaultPriority,
    };

    onApply(applied);
  };

  const isValid = variables.every((v) => values[v]?.trim());

  // Preview of the applied title
  const previewTitle = useMemo(() => {
    return applyTemplateVariables(template.titleTemplate, values);
  }, [template.titleTemplate, values]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookTemplate className="h-4 w-4" />
          <span>Fill in the template variables:</span>
        </div>

        {variables.map((varName) => (
          <div key={varName}>
            <label className="text-sm font-medium block mb-1.5 capitalize">
              {varName.replace(/([A-Z])/g, ' $1').trim()}
            </label>
            <Input
              placeholder={`Enter ${varName}...`}
              value={values[varName]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [varName]: e.target.value }))
              }
              autoFocus={variables.indexOf(varName) === 0}
            />
          </div>
        ))}
      </div>

      {/* Preview */}
      {previewTitle && (
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Preview:</p>
          <p className="text-sm font-medium">{previewTitle}</p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={!isValid}>
          Use Template
        </Button>
      </div>
    </form>
  );
}

export function TaskTemplateSelector({
  open,
  onOpenChange,
  onSelectTemplate,
  projectId,
}: TaskTemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<TaskTemplateCategory | null>(null);

  const { data: templates = [], isLoading } = useTaskTemplates({ projectId });

  // Filter templates based on search and category
  const filteredTemplates = useMemo(() => {
    let result = templates;

    if (categoryFilter) {
      result = result.filter((t) => t.category === categoryFilter);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(searchLower) ||
          t.description?.toLowerCase().includes(searchLower) ||
          t.tags.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }

    return result;
  }, [templates, categoryFilter, search]);

  // Group templates by category for display
  const groupedTemplates = useMemo(() => {
    const groups: Record<TaskTemplateCategory, TaskTemplate[]> = {
      feature: [],
      bugfix: [],
      refactor: [],
      documentation: [],
      testing: [],
      devops: [],
      other: [],
    };

    filteredTemplates.forEach((t) => {
      groups[t.category].push(t);
    });

    return Object.entries(groups).filter(([, templates]) => templates.length > 0);
  }, [filteredTemplates]);

  const handleApply = (applied: AppliedTaskTemplate) => {
    onSelectTemplate(applied);
    setSelectedTemplate(null);
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    setSearch('');
    setCategoryFilter(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookTemplate className="h-5 w-5" />
            {selectedTemplate ? selectedTemplate.name : 'Select a Template'}
          </DialogTitle>
          <DialogDescription>
            {selectedTemplate
              ? 'Fill in the variables to create your task.'
              : 'Choose a template to quickly create a task.'}
          </DialogDescription>
        </DialogHeader>

        {selectedTemplate ? (
          <VariableForm
            template={selectedTemplate}
            onApply={handleApply}
            onBack={() => setSelectedTemplate(null)}
          />
        ) : (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Category filters */}
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={categoryFilter === null ? 'secondary' : 'ghost'}
                onClick={() => setCategoryFilter(null)}
                className="h-7 text-xs"
              >
                All
              </Button>
              {Object.entries(TASK_TEMPLATE_CATEGORY_LABELS).map(([key, label]) => {
                const Icon = CATEGORY_ICONS[key as TaskTemplateCategory];
                return (
                  <Button
                    key={key}
                    size="sm"
                    variant={categoryFilter === key ? 'secondary' : 'ghost'}
                    onClick={() => setCategoryFilter(key as TaskTemplateCategory)}
                    className="h-7 text-xs gap-1"
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </Button>
                );
              })}
            </div>

            {/* Template list */}
            <ScrollArea className="h-[350px] pr-4">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading templates...
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BookTemplate className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No templates found</p>
                  {search && (
                    <p className="text-xs mt-1">
                      Try a different search term
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedTemplates.map(([category, categoryTemplates]) => (
                    <div key={category}>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        {TASK_TEMPLATE_CATEGORY_LABELS[category as TaskTemplateCategory]}
                      </h3>
                      <div className="space-y-2">
                        {categoryTemplates.map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            onSelect={setSelectedTemplate}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
