/**
 * useTaskTemplates Hook
 *
 * Manages task templates with local storage persistence.
 * Templates are stored locally until backend support is added.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  TaskTemplate,
  CreateTaskTemplateOptions,
  UpdateTaskTemplateOptions,
  AppliedTaskTemplate,
  TaskTemplateCategory,
} from '@/types/taskTemplate';
import {
  DEFAULT_TASK_TEMPLATES,
  extractTemplateVariables,
  applyTemplateVariables,
} from '@/types/taskTemplate';

const STORAGE_KEY = 'sprite-task-templates';

// Generate a unique ID
function generateId(): string {
  return `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Load templates from localStorage
function loadTemplates(): TaskTemplate[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    // Initialize with default templates on first load
    const defaults = DEFAULT_TASK_TEMPLATES.map((t, idx) => ({
      ...t,
      id: `default_${idx}`,
      createdById: 'system',
      projectId: null,
      organizationId: null,
      usageCount: 0,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    saveTemplates(defaults);
    return defaults;
  } catch (e) {
    console.error('[useTaskTemplates] Failed to load templates:', e);
    return [];
  }
}

// Save templates to localStorage
function saveTemplates(templates: TaskTemplate[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (e) {
    console.error('[useTaskTemplates] Failed to save templates:', e);
  }
}

/**
 * Hook to get all task templates
 */
export function useTaskTemplates(options?: {
  category?: TaskTemplateCategory;
  projectId?: string;
}) {
  return useQuery({
    queryKey: ['task-templates', options?.category, options?.projectId],
    queryFn: async () => {
      let templates = loadTemplates();

      // Filter by category if provided
      if (options?.category) {
        templates = templates.filter(t => t.category === options.category);
      }

      // Filter by project if provided
      if (options?.projectId) {
        templates = templates.filter(
          t => t.scope === 'personal' ||
               t.projectId === options.projectId ||
               t.scope === 'organization'
        );
      }

      // Sort by usage count (most used first)
      return templates.sort((a, b) => b.usageCount - a.usageCount);
    },
    staleTime: Infinity, // Templates don't change often
  });
}

/**
 * Hook to get a single template by ID
 */
export function useTaskTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ['task-template', templateId],
    queryFn: async () => {
      if (!templateId) return null;

      const templates = loadTemplates();
      return templates.find(t => t.id === templateId) ?? null;
    },
    enabled: !!templateId,
  });
}

/**
 * Hook to create a new template
 */
export function useCreateTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: CreateTaskTemplateOptions) => {
      const templates = loadTemplates();

      const newTemplate: TaskTemplate = {
        id: generateId(),
        name: options.name,
        description: options.description ?? null,
        titleTemplate: options.titleTemplate,
        descriptionTemplate: options.descriptionTemplate,
        promptTemplate: options.promptTemplate,
        defaultPriority: options.defaultPriority ?? 'medium',
        category: options.category ?? 'other',
        scope: options.scope ?? 'personal',
        tags: options.tags ?? [],
        usageCount: 0,
        lastUsedAt: null,
        createdById: 'current-user', // TODO: Get from auth
        projectId: options.projectId ?? null,
        organizationId: null, // TODO: Get from auth
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      templates.push(newTemplate);
      saveTemplates(templates);

      return newTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
    },
  });
}

/**
 * Hook to update a template
 */
export function useUpdateTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      updates,
    }: {
      templateId: string;
      updates: UpdateTaskTemplateOptions;
    }) => {
      const templates = loadTemplates();
      const index = templates.findIndex(t => t.id === templateId);

      if (index === -1) {
        throw new Error('Template not found');
      }

      const updated: TaskTemplate = {
        ...templates[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      templates[index] = updated;
      saveTemplates(templates);

      return updated;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
      queryClient.invalidateQueries({ queryKey: ['task-template', updated.id] });
    },
  });
}

/**
 * Hook to delete a template
 */
export function useDeleteTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const templates = loadTemplates();
      const filtered = templates.filter(t => t.id !== templateId);
      saveTemplates(filtered);
      return templateId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
    },
  });
}

/**
 * Hook to track template usage
 */
export function useTrackTemplateUsage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const templates = loadTemplates();
      const index = templates.findIndex(t => t.id === templateId);

      if (index === -1) return;

      templates[index] = {
        ...templates[index],
        usageCount: templates[index].usageCount + 1,
        lastUsedAt: new Date().toISOString(),
      };

      saveTemplates(templates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
    },
  });
}

/**
 * Hook to apply template with variables
 */
export function useApplyTemplate() {
  const trackUsage = useTrackTemplateUsage();

  return useCallback(
    (
      template: TaskTemplate,
      variables: Record<string, string>
    ): AppliedTaskTemplate => {
      // Track usage
      trackUsage.mutate(template.id);

      return {
        title: applyTemplateVariables(template.titleTemplate, variables),
        description: applyTemplateVariables(template.descriptionTemplate, variables),
        prompt: applyTemplateVariables(template.promptTemplate, variables),
        priority: template.defaultPriority,
      };
    },
    [trackUsage]
  );
}

/**
 * Hook to get template variables
 */
export function useTemplateVariables(template: TaskTemplate | null): string[] {
  if (!template) return [];

  const allVars = new Set<string>();

  extractTemplateVariables(template.titleTemplate).forEach(v => allVars.add(v));
  extractTemplateVariables(template.descriptionTemplate).forEach(v => allVars.add(v));
  extractTemplateVariables(template.promptTemplate).forEach(v => allVars.add(v));

  return Array.from(allVars);
}
