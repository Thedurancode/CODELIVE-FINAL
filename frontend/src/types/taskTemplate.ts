/**
 * Task Template Types
 *
 * Types for reusable task templates in the sprite task queue system.
 */

import type { SpriteTaskPriority } from './spriteTask';

// Template scope - who can see/use the template
export type TaskTemplateScope = 'personal' | 'project' | 'organization';

// Template category for organization
export type TaskTemplateCategory =
  | 'feature'
  | 'bugfix'
  | 'refactor'
  | 'documentation'
  | 'testing'
  | 'devops'
  | 'other';

// Main TaskTemplate entity
export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;

  // Template content
  titleTemplate: string;       // Can include {{variables}}
  descriptionTemplate: string; // Can include {{variables}}
  promptTemplate: string;      // Can include {{variables}}

  // Defaults
  defaultPriority: SpriteTaskPriority;

  // Metadata
  category: TaskTemplateCategory;
  scope: TaskTemplateScope;
  tags: string[];

  // Usage tracking
  usageCount: number;
  lastUsedAt: string | null;

  // Ownership
  createdById: string;
  projectId: string | null;      // If scope is 'project'
  organizationId: string | null; // If scope is 'organization'

  createdAt: string;
  updatedAt: string;
}

// Create template options
export interface CreateTaskTemplateOptions {
  name: string;
  description?: string;
  titleTemplate: string;
  descriptionTemplate: string;
  promptTemplate: string;
  defaultPriority?: SpriteTaskPriority;
  category?: TaskTemplateCategory;
  scope?: TaskTemplateScope;
  tags?: string[];
  projectId?: string;
}

// Update template options
export interface UpdateTaskTemplateOptions {
  name?: string;
  description?: string;
  titleTemplate?: string;
  descriptionTemplate?: string;
  promptTemplate?: string;
  defaultPriority?: SpriteTaskPriority;
  category?: TaskTemplateCategory;
  scope?: TaskTemplateScope;
  tags?: string[];
}

// Template with variables replaced
export interface AppliedTaskTemplate {
  title: string;
  description: string;
  prompt: string;
  priority: SpriteTaskPriority;
}

// Template variable definition
export interface TemplateVariable {
  name: string;
  description: string;
  type: 'text' | 'number' | 'select';
  options?: string[];  // For select type
  defaultValue?: string;
  required: boolean;
}

// Category labels and icons
export const TASK_TEMPLATE_CATEGORY_LABELS: Record<TaskTemplateCategory, string> = {
  feature: 'New Feature',
  bugfix: 'Bug Fix',
  refactor: 'Refactor',
  documentation: 'Documentation',
  testing: 'Testing',
  devops: 'DevOps',
  other: 'Other',
};

// Scope labels
export const TASK_TEMPLATE_SCOPE_LABELS: Record<TaskTemplateScope, string> = {
  personal: 'Personal',
  project: 'Project',
  organization: 'Organization',
};

// Default templates to show to new users
export const DEFAULT_TASK_TEMPLATES: Omit<TaskTemplate, 'id' | 'createdById' | 'projectId' | 'organizationId' | 'usageCount' | 'lastUsedAt' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Add New Feature',
    description: 'Template for implementing new features',
    titleTemplate: 'Add {{featureName}}',
    descriptionTemplate: 'Implement a new feature: {{featureName}}\n\n## Requirements\n{{requirements}}\n\n## Acceptance Criteria\n- {{criteria}}',
    promptTemplate: 'Please implement the following feature:\n\n# {{featureName}}\n\n{{requirements}}\n\nMake sure to:\n- Write clean, well-documented code\n- Add appropriate tests\n- Follow existing code patterns',
    defaultPriority: 'medium',
    category: 'feature',
    scope: 'personal',
    tags: ['feature', 'new'],
  },
  {
    name: 'Fix Bug',
    description: 'Template for fixing bugs',
    titleTemplate: 'Fix: {{bugSummary}}',
    descriptionTemplate: '## Bug Description\n{{bugDescription}}\n\n## Steps to Reproduce\n{{stepsToReproduce}}\n\n## Expected Behavior\n{{expectedBehavior}}',
    promptTemplate: 'Please fix the following bug:\n\n# Bug: {{bugSummary}}\n\n## Description\n{{bugDescription}}\n\n## Steps to Reproduce\n{{stepsToReproduce}}\n\n## Expected Behavior\n{{expectedBehavior}}\n\nPlease:\n1. Identify the root cause\n2. Implement the fix\n3. Add a test to prevent regression',
    defaultPriority: 'high',
    category: 'bugfix',
    scope: 'personal',
    tags: ['bug', 'fix'],
  },
  {
    name: 'Refactor Component',
    description: 'Template for refactoring code',
    titleTemplate: 'Refactor {{componentName}}',
    descriptionTemplate: '## Component to Refactor\n{{componentName}}\n\n## Reason for Refactor\n{{reason}}\n\n## Goals\n{{goals}}',
    promptTemplate: 'Please refactor the following component:\n\n# {{componentName}}\n\n## Why Refactor?\n{{reason}}\n\n## Goals\n{{goals}}\n\nGuidelines:\n- Maintain backward compatibility\n- Improve code readability\n- Add/update documentation\n- Ensure tests pass',
    defaultPriority: 'medium',
    category: 'refactor',
    scope: 'personal',
    tags: ['refactor', 'cleanup'],
  },
  {
    name: 'Add Tests',
    description: 'Template for adding test coverage',
    titleTemplate: 'Add tests for {{component}}',
    descriptionTemplate: '## Component to Test\n{{component}}\n\n## Test Coverage Goals\n{{coverageGoals}}',
    promptTemplate: 'Please add comprehensive tests for:\n\n# {{component}}\n\n## Goals\n{{coverageGoals}}\n\nPlease:\n- Add unit tests for all public methods\n- Include edge cases\n- Use existing test patterns in the codebase\n- Aim for high coverage',
    defaultPriority: 'medium',
    category: 'testing',
    scope: 'personal',
    tags: ['testing', 'coverage'],
  },
  {
    name: 'Update Documentation',
    description: 'Template for documentation tasks',
    titleTemplate: 'Update docs: {{docSection}}',
    descriptionTemplate: '## Documentation Section\n{{docSection}}\n\n## Changes Needed\n{{changesNeeded}}',
    promptTemplate: 'Please update the documentation for:\n\n# {{docSection}}\n\n## Changes Needed\n{{changesNeeded}}\n\nGuidelines:\n- Use clear, concise language\n- Include code examples\n- Follow existing documentation style\n- Update any related sections',
    defaultPriority: 'low',
    category: 'documentation',
    scope: 'personal',
    tags: ['docs', 'documentation'],
  },
];

// Helper to extract variables from a template string
export function extractTemplateVariables(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;
  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1]);
  }
  return Array.from(variables);
}

// Helper to apply variables to a template
export function applyTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return variables[varName] ?? match;
  });
}
