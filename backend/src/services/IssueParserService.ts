/**
 * IssueParserService
 *
 * Smart parsing of GitHub issue content to extract structured task data:
 * - Checklists → subtasks
 * - File paths → target files for context
 * - Acceptance criteria → success conditions
 * - Labels → priority mapping
 * - Code blocks → technical context
 */

import type { SpriteTaskPriority } from '../models/SpriteTask';

// Parsed issue structure
export interface ParsedIssue {
  title: string;
  description: string;
  subtasks: ParsedSubtask[];
  targetFiles: string[];
  acceptanceCriteria: string[];
  priority: SpriteTaskPriority;
  technicalContext: TechnicalContext;
  relatedIssues: RelatedIssue[];
  estimatedComplexity: 'trivial' | 'simple' | 'moderate' | 'complex';
  prompt: string; // Generated prompt for Claude
}

export interface ParsedSubtask {
  title: string;
  completed: boolean;
  order: number;
}

export interface TechnicalContext {
  codeBlocks: CodeBlock[];
  mentionedTechnologies: string[];
  dependencies: string[];
}

export interface CodeBlock {
  language: string | null;
  code: string;
  context?: string; // Text before the code block
}

export interface RelatedIssue {
  type: 'blocks' | 'blocked_by' | 'related' | 'duplicate';
  issueNumber: number;
}

// Label to priority mapping
const LABEL_PRIORITY_MAP: Record<string, SpriteTaskPriority> = {
  // Urgent
  urgent: 'urgent',
  critical: 'urgent',
  'p0': 'urgent',
  'priority: critical': 'urgent',
  blocker: 'urgent',
  // High
  'high-priority': 'high',
  'high priority': 'high',
  'p1': 'high',
  'priority: high': 'high',
  important: 'high',
  // Medium (default)
  bug: 'medium',
  'p2': 'medium',
  'priority: medium': 'medium',
  // Low
  enhancement: 'low',
  'good first issue': 'low',
  'help wanted': 'low',
  'p3': 'low',
  'priority: low': 'low',
  documentation: 'low',
  chore: 'low',
};

// Common technology keywords
const TECHNOLOGY_KEYWORDS = [
  'react', 'next.js', 'nextjs', 'typescript', 'javascript', 'node', 'express',
  'postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'prisma', 'sequelize',
  'tailwind', 'css', 'html', 'graphql', 'rest', 'api', 'websocket',
  'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'vercel', 'netlify',
  'jest', 'vitest', 'cypress', 'playwright', 'testing',
  'zustand', 'redux', 'tanstack', 'react-query', 'swr',
  'shadcn', 'radix', 'mui', 'chakra', 'ant design',
];

class IssueParserService {
  /**
   * Parse a GitHub issue into structured task data
   */
  parseIssue(
    title: string,
    body: string | null,
    labels: string[] = []
  ): ParsedIssue {
    const bodyText = body || '';

    // Extract components
    const subtasks = this.extractSubtasks(bodyText);
    const targetFiles = this.extractFilePaths(bodyText);
    const acceptanceCriteria = this.extractAcceptanceCriteria(bodyText);
    const priority = this.determinePriority(labels, bodyText);
    const technicalContext = this.extractTechnicalContext(bodyText);
    const relatedIssues = this.extractRelatedIssues(bodyText);
    const description = this.cleanDescription(bodyText, subtasks);
    const estimatedComplexity = this.estimateComplexity(
      subtasks,
      targetFiles,
      bodyText
    );

    // Generate optimized prompt for Claude
    const prompt = this.generatePrompt({
      title,
      description,
      subtasks,
      targetFiles,
      acceptanceCriteria,
      technicalContext,
    });

    return {
      title,
      description,
      subtasks,
      targetFiles,
      acceptanceCriteria,
      priority,
      technicalContext,
      relatedIssues,
      estimatedComplexity,
      prompt,
    };
  }

  /**
   * Extract checklist items as subtasks
   * Supports: - [ ] item, - [x] item, * [ ] item
   */
  private extractSubtasks(body: string): ParsedSubtask[] {
    const subtasks: ParsedSubtask[] = [];
    const checklistRegex = /^[\s]*[-*]\s*\[([ xX])\]\s*(.+)$/gm;

    let match;
    let order = 0;
    while ((match = checklistRegex.exec(body)) !== null) {
      const completed = match[1].toLowerCase() === 'x';
      const title = match[2].trim();

      // Skip empty or very short items
      if (title.length > 2) {
        subtasks.push({
          title,
          completed,
          order: order++,
        });
      }
    }

    return subtasks;
  }

  /**
   * Extract file paths mentioned in the issue
   * Supports: backticks, "Files to modify" sections, common patterns
   */
  private extractFilePaths(body: string): string[] {
    const paths = new Set<string>();

    // Pattern 1: Backticked paths (e.g., `src/App.tsx`)
    const backtickRegex = /`([^`]+\.[a-zA-Z]{1,10})`/g;
    let match;
    while ((match = backtickRegex.exec(body)) !== null) {
      const path = match[1];
      if (this.looksLikeFilePath(path)) {
        paths.add(path);
      }
    }

    // Pattern 2: "Files" section
    const filesSectionRegex =
      /(?:files?\s*(?:to\s*(?:modify|change|update|edit)|affected|involved)?|locations?):?\s*\n((?:[-*]\s*[^\n]+\n?)+)/gi;
    while ((match = filesSectionRegex.exec(body)) !== null) {
      const section = match[1];
      const lineRegex = /[-*]\s*`?([^`\n]+)`?/g;
      let lineMatch;
      while ((lineMatch = lineRegex.exec(section)) !== null) {
        const path = lineMatch[1].trim();
        if (this.looksLikeFilePath(path)) {
          paths.add(path);
        }
      }
    }

    // Pattern 3: Common file path patterns without backticks
    const pathRegex = /(?:^|\s)((?:src|lib|app|components|pages|hooks|utils|services|models|routes|config|public|assets|styles)\/[a-zA-Z0-9/_.-]+\.[a-zA-Z]{1,10})/gm;
    while ((match = pathRegex.exec(body)) !== null) {
      paths.add(match[1]);
    }

    return Array.from(paths);
  }

  /**
   * Check if a string looks like a file path
   */
  private looksLikeFilePath(str: string): boolean {
    // Must have an extension
    if (!/\.[a-zA-Z]{1,10}$/.test(str)) return false;
    // Must have a path separator or start with known dir
    if (!/[/\\]/.test(str) && !/^(src|lib|app|components|pages)/.test(str)) {
      return false;
    }
    // Exclude URLs
    if (/^https?:\/\//.test(str)) return false;
    // Exclude common non-file patterns
    if (/^(www\.|.*@.*\.)/.test(str)) return false;
    return true;
  }

  /**
   * Extract acceptance criteria from the issue
   */
  private extractAcceptanceCriteria(body: string): string[] {
    const criteria: string[] = [];

    // Pattern 1: "Acceptance Criteria" section
    const acSectionRegex =
      /(?:acceptance\s*criteria|success\s*criteria|definition\s*of\s*done|requirements?|expected\s*(?:behavior|outcome)):?\s*\n((?:[-*]\s*[^\n]+\n?)+)/gi;

    let match;
    while ((match = acSectionRegex.exec(body)) !== null) {
      const section = match[1];
      const lineRegex = /[-*]\s*(.+)/g;
      let lineMatch;
      while ((lineMatch = lineRegex.exec(section)) !== null) {
        const criterion = lineMatch[1].trim();
        if (criterion.length > 5) {
          criteria.push(criterion);
        }
      }
    }

    // Pattern 2: "Should" statements (common in acceptance criteria)
    if (criteria.length === 0) {
      const shouldRegex = /(?:^|\n)[-*]?\s*((?:should|must|needs? to|has to|will)\s+.{10,})/gi;
      while ((match = shouldRegex.exec(body)) !== null) {
        criteria.push(match[1].trim());
      }
    }

    return criteria;
  }

  /**
   * Determine priority from labels and body content
   */
  private determinePriority(labels: string[], body: string): SpriteTaskPriority {
    // Check labels first (highest priority source)
    for (const label of labels) {
      const normalizedLabel = label.toLowerCase().trim();
      if (LABEL_PRIORITY_MAP[normalizedLabel]) {
        return LABEL_PRIORITY_MAP[normalizedLabel];
      }
    }

    // Check body for priority indicators
    const bodyLower = body.toLowerCase();
    if (
      bodyLower.includes('urgent') ||
      bodyLower.includes('critical') ||
      bodyLower.includes('asap') ||
      bodyLower.includes('blocker')
    ) {
      return 'high';
    }

    // Default to medium
    return 'medium';
  }

  /**
   * Extract technical context from code blocks and mentions
   */
  private extractTechnicalContext(body: string): TechnicalContext {
    const codeBlocks: CodeBlock[] = [];
    const mentionedTechnologies = new Set<string>();
    const dependencies = new Set<string>();

    // Extract code blocks
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(body)) !== null) {
      const language = match[1] || null;
      const code = match[2].trim();

      // Get context (text before the code block)
      const beforeIndex = match.index;
      const contextStart = Math.max(0, beforeIndex - 200);
      const contextText = body.slice(contextStart, beforeIndex).split('\n').pop() || '';

      codeBlocks.push({
        language,
        code,
        context: contextText.trim() || undefined,
      });
    }

    // Detect technologies
    const bodyLower = body.toLowerCase();
    for (const tech of TECHNOLOGY_KEYWORDS) {
      if (bodyLower.includes(tech)) {
        mentionedTechnologies.add(tech);
      }
    }

    // Extract npm/package dependencies mentioned
    const packageRegex = /(?:npm|yarn|pnpm)\s+(?:install|add|i)\s+([a-z@][a-z0-9@/_.-]+)/gi;
    while ((match = packageRegex.exec(body)) !== null) {
      dependencies.add(match[1]);
    }

    // Also check import statements in code blocks
    for (const block of codeBlocks) {
      const importRegex = /(?:import|require)\s*\(?['"]([^'"]+)['"]/g;
      while ((match = importRegex.exec(block.code)) !== null) {
        const pkg = match[1];
        // Only add if it's a package (not relative path)
        if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
          dependencies.add(pkg.split('/')[0].replace(/^@/, '@' + pkg.split('/')[1]?.split('/')[0]));
        }
      }
    }

    return {
      codeBlocks,
      mentionedTechnologies: Array.from(mentionedTechnologies),
      dependencies: Array.from(dependencies),
    };
  }

  /**
   * Extract related issue references
   */
  private extractRelatedIssues(body: string): RelatedIssue[] {
    const related: RelatedIssue[] = [];

    // Pattern: "Blocks #123", "Blocked by #456", "Related to #789"
    const patterns: Array<{ regex: RegExp; type: RelatedIssue['type'] }> = [
      { regex: /blocks?\s*#(\d+)/gi, type: 'blocks' },
      { regex: /blocked\s*by\s*#(\d+)/gi, type: 'blocked_by' },
      { regex: /(?:related\s*(?:to)?|see\s*also)\s*#(\d+)/gi, type: 'related' },
      { regex: /(?:duplicate\s*(?:of)?|dupe)\s*#(\d+)/gi, type: 'duplicate' },
    ];

    for (const { regex, type } of patterns) {
      let match;
      while ((match = regex.exec(body)) !== null) {
        related.push({
          type,
          issueNumber: parseInt(match[1], 10),
        });
      }
    }

    return related;
  }

  /**
   * Clean description by removing parsed sections
   */
  private cleanDescription(body: string, subtasks: ParsedSubtask[]): string {
    let description = body;

    // Remove checklist items (we have them as subtasks)
    description = description.replace(/^[\s]*[-*]\s*\[[ xX]\]\s*.+$/gm, '');

    // Remove common sections that we've extracted
    const sectionsToRemove = [
      /(?:acceptance\s*criteria|success\s*criteria|definition\s*of\s*done):?\s*\n(?:[-*]\s*[^\n]+\n?)+/gi,
      /(?:files?\s*(?:to\s*(?:modify|change|update|edit)|affected)):?\s*\n(?:[-*]\s*[^\n]+\n?)+/gi,
      /(?:tasks?|checklist|todo):?\s*\n(?:[-*]\s*[^\n]+\n?)+/gi,
    ];

    for (const regex of sectionsToRemove) {
      description = description.replace(regex, '');
    }

    // Clean up whitespace
    description = description
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // If nothing left, use subtasks as description
    if (!description && subtasks.length > 0) {
      description = subtasks.map((s) => `- ${s.title}`).join('\n');
    }

    return description;
  }

  /**
   * Estimate task complexity
   */
  private estimateComplexity(
    subtasks: ParsedSubtask[],
    targetFiles: string[],
    body: string
  ): ParsedIssue['estimatedComplexity'] {
    const factors = {
      subtaskCount: subtasks.length,
      fileCount: targetFiles.length,
      bodyLength: body.length,
      hasMultipleCodeBlocks: (body.match(/```/g) || []).length > 2,
    };

    // Scoring
    let score = 0;
    score += Math.min(factors.subtaskCount * 10, 30);
    score += Math.min(factors.fileCount * 15, 30);
    score += factors.bodyLength > 2000 ? 20 : factors.bodyLength > 500 ? 10 : 0;
    score += factors.hasMultipleCodeBlocks ? 10 : 0;

    if (score < 15) return 'trivial';
    if (score < 35) return 'simple';
    if (score < 60) return 'moderate';
    return 'complex';
  }

  /**
   * Generate optimized prompt for Claude
   */
  private generatePrompt(data: {
    title: string;
    description: string;
    subtasks: ParsedSubtask[];
    targetFiles: string[];
    acceptanceCriteria: string[];
    technicalContext: TechnicalContext;
  }): string {
    const lines: string[] = [];

    // Main task
    lines.push(`# Task: ${data.title}`);
    lines.push('');

    // Description
    if (data.description) {
      lines.push('## Description');
      lines.push(data.description);
      lines.push('');
    }

    // Subtasks
    if (data.subtasks.length > 0) {
      lines.push('## Implementation Steps');
      for (const subtask of data.subtasks) {
        const checkbox = subtask.completed ? '[x]' : '[ ]';
        lines.push(`- ${checkbox} ${subtask.title}`);
      }
      lines.push('');
    }

    // Target files
    if (data.targetFiles.length > 0) {
      lines.push('## Files to Focus On');
      for (const file of data.targetFiles) {
        lines.push(`- \`${file}\``);
      }
      lines.push('');
    }

    // Acceptance criteria
    if (data.acceptanceCriteria.length > 0) {
      lines.push('## Success Criteria');
      lines.push('Ensure the following are met:');
      for (const criterion of data.acceptanceCriteria) {
        lines.push(`- ${criterion}`);
      }
      lines.push('');
    }

    // Technical context
    if (data.technicalContext.mentionedTechnologies.length > 0) {
      lines.push('## Technical Context');
      lines.push(`Technologies: ${data.technicalContext.mentionedTechnologies.join(', ')}`);
      lines.push('');
    }

    // Code examples
    if (data.technicalContext.codeBlocks.length > 0) {
      lines.push('## Reference Code');
      for (const block of data.technicalContext.codeBlocks.slice(0, 3)) {
        if (block.context) {
          lines.push(`_${block.context}_`);
        }
        lines.push('```' + (block.language || ''));
        lines.push(block.code);
        lines.push('```');
        lines.push('');
      }
    }

    return lines.join('\n').trim();
  }

  /**
   * Parse issue from GitHub issue URL or API response
   */
  parseGitHubIssue(issue: {
    title: string;
    body: string | null;
    labels?: Array<{ name: string }>;
  }): ParsedIssue {
    const labels = issue.labels?.map((l) => l.name) || [];
    return this.parseIssue(issue.title, issue.body, labels);
  }
}

// Export singleton instance
export const issueParserService = new IssueParserService();
