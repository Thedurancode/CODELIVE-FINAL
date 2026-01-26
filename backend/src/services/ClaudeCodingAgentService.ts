/**
 * ClaudeCodingAgentService
 *
 * Uses LLM (Claude via OpenRouter or OpenAI) to analyze codebases and generate
 * code changes. Works with the GitHub API to read/write files and implement
 * coding tasks.
 */

import { gitHubService, GitHubTreeItem } from './GitHubService';
import { openRouterService } from './openRouterService';
import CodingTask from '../models/CodingTask';

// Types for the coding agent
interface FileChange {
  path: string;
  action: 'create' | 'update' | 'delete';
  content?: string;
  originalContent?: string;
}

interface CodeAnalysis {
  relevantFiles: string[];
  suggestedChanges: FileChange[];
  explanation: string;
  testSuggestions?: string[];
}

interface CodingResult {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  commitSha: string;
  changes: FileChange[];
}

// File extensions we can process
const READABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.yml', '.yaml',
  '.css', '.scss', '.html', '.vue', '.svelte', '.py', '.go', '.rs',
  '.java', '.kt', '.swift', '.rb', '.php', '.sh', '.bash', '.zsh',
  '.env', '.env.example', '.gitignore', '.dockerignore', '.eslintrc',
  '.prettierrc', '.editorconfig', 'Dockerfile', 'Makefile',
]);

// Max file size to read (100KB)
const MAX_FILE_SIZE = 100 * 1024;

// Max total context size for LLM (roughly 100k characters)
const MAX_CONTEXT_SIZE = 100000;

class ClaudeCodingAgentService {
  private initialized = false;
  private codingModel: string;

  constructor() {
    // Prefer Claude for coding tasks if available via OpenRouter
    // Otherwise fall back to GPT-4
    const isOpenRouter = !!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY;
    this.codingModel = process.env.CODING_MODEL ||
      (isOpenRouter ? 'anthropic/claude-sonnet-4' : 'gpt-4o');
  }

  async initialize(): Promise<void> {
    if (!openRouterService.isConfigured()) {
      console.log('ClaudeCodingAgentService: No LLM API key configured - coding agent disabled');
      return;
    }

    console.log(`ClaudeCodingAgentService initialized (model: ${this.codingModel})`);
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && openRouterService.isConfigured();
  }

  /**
   * Execute coding changes for a task
   */
  async executeCoding(
    task: CodingTask,
    owner: string,
    repo: string
  ): Promise<CodingResult> {
    if (!this.isReady()) {
      throw new Error('Coding agent not initialized. Check LLM API keys.');
    }

    await task.addProgressLog('Analyzing repository structure...');

    // Step 1: Get repository structure
    const repoTree = await this.getRepoTree(owner, repo, task.featureBranch);
    await task.addProgressLog(`Found ${repoTree.length} files in repository`);

    // Step 2: Identify relevant files based on instructions
    await task.addProgressLog('Identifying relevant files...');
    const relevantFiles = await this.identifyRelevantFiles(
      task.instructions,
      repoTree,
      owner,
      repo,
      task.featureBranch
    );
    await task.addProgressLog(`Identified ${relevantFiles.length} relevant files`);

    // Step 3: Read relevant file contents
    await task.addProgressLog('Reading file contents...');
    const fileContents = await this.readFileContents(
      owner,
      repo,
      relevantFiles,
      task.featureBranch
    );

    // Step 4: Generate code changes
    await task.addProgressLog('Generating code changes...');
    const analysis = await this.generateCodeChanges(
      task.title,
      task.instructions,
      fileContents,
      repoTree
    );
    await task.addProgressLog(`Planned ${analysis.suggestedChanges.length} file changes`);

    // Step 5: Apply changes via GitHub API
    await task.addProgressLog('Applying changes...');
    const result = await this.applyChanges(
      owner,
      repo,
      task.featureBranch,
      task.title,
      analysis.suggestedChanges
    );

    await task.addProgressLog(`Applied ${result.filesChanged} file changes`);

    return result;
  }

  /**
   * Get the repository tree structure
   */
  private async getRepoTree(
    owner: string,
    repo: string,
    branch: string
  ): Promise<GitHubTreeItem[]> {
    try {
      const tree = await gitHubService.getTree(owner, repo, branch, true);
      // Filter to only include files (blobs) that we can process
      return tree.filter(item => {
        if (item.type !== 'blob') {
          return false;
        }
        if (item.size && item.size > MAX_FILE_SIZE) {
          return false;
        }

        // Check if we can read this file type
        const ext = this.getFileExtension(item.path);
        return READABLE_EXTENSIONS.has(ext) || READABLE_EXTENSIONS.has(item.path.split('/').pop() || '');
      });
    } catch (error) {
      console.error('Failed to get repo tree:', error);
      return [];
    }
  }

  /**
   * Identify files relevant to the task
   */
  private async identifyRelevantFiles(
    instructions: string,
    repoTree: GitHubTreeItem[],
    owner: string,
    repo: string,
    branch: string
  ): Promise<string[]> {
    // Build a summary of the repo structure
    const fileList = repoTree.map(f => f.path).join('\n');

    // Get README if available for context
    let readmeContent = '';
    try {
      const readme = await gitHubService.getReadme(owner, repo, branch);
      if (readme) {
        readmeContent = readme.content.substring(0, 2000);
      }
    } catch {
      // README not found, continue without it
    }

    const systemPrompt = `You are a code analysis assistant. Your job is to identify which files in a repository are most relevant to a coding task.

Repository files:
${fileList}

${readmeContent ? `README excerpt:\n${readmeContent}\n` : ''}

Based on the task instructions, return a JSON object with a "files" array containing the paths of the most relevant files to read and potentially modify. Include:
1. Files that will need to be modified
2. Related files for context (imports, types, tests)
3. Configuration files if relevant

Limit to 20 most relevant files. Prioritize files that will likely need changes.`;

    const userPrompt = `Task: ${instructions}

Return only valid JSON with the format: {"files": ["path/to/file1.ts", "path/to/file2.ts"]}`;

    try {
      const result = await openRouterService.completeJson<{ files: string[] }>(
        systemPrompt,
        userPrompt,
        { model: this.codingModel, temperature: 0.2 }
      );

      // Filter to only include files that exist in the tree
      const existingPaths = new Set(repoTree.map(f => f.path));
      return result.files.filter(f => existingPaths.has(f)).slice(0, 20);
    } catch (error) {
      console.error('Failed to identify relevant files:', error);
      // Fall back to heuristic selection
      return this.heuristicFileSelection(instructions, repoTree);
    }
  }

  /**
   * Heuristic file selection when LLM fails
   */
  private heuristicFileSelection(
    instructions: string,
    repoTree: GitHubTreeItem[]
  ): string[] {
    const keywords = instructions.toLowerCase().split(/\s+/);
    const relevantFiles: Array<{ path: string; score: number }> = [];

    for (const file of repoTree) {
      let score = 0;
      const pathLower = file.path.toLowerCase();

      // Score based on keyword matches
      for (const keyword of keywords) {
        if (keyword.length > 3 && pathLower.includes(keyword)) {
          score += 2;
        }
      }

      // Boost important files
      if (pathLower.includes('index.') || pathLower.includes('main.')) {
        score += 1;
      }
      if (pathLower.includes('config') || pathLower.includes('settings')) {
        score += 1;
      }
      if (pathLower.includes('.test.') || pathLower.includes('.spec.')) {
        score += 0.5;
      }

      if (score > 0) {
        relevantFiles.push({ path: file.path, score });
      }
    }

    // Sort by score and return top files
    return relevantFiles
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(f => f.path);
  }

  /**
   * Read contents of relevant files
   */
  private async readFileContents(
    owner: string,
    repo: string,
    filePaths: string[],
    branch: string
  ): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    let totalSize = 0;

    for (const path of filePaths) {
      if (totalSize >= MAX_CONTEXT_SIZE) {
        console.log(`Reached max context size, skipping remaining files`);
        break;
      }

      try {
        const file = await gitHubService.getFileContent(owner, repo, path, branch);
        const contentSize = file.content.length;

        if (totalSize + contentSize <= MAX_CONTEXT_SIZE) {
          contents.set(path, file.content);
          totalSize += contentSize;
        }
      } catch (error) {
        console.error(`Failed to read file ${path}:`, error);
      }
    }

    return contents;
  }

  /**
   * Generate code changes using LLM
   */
  private async generateCodeChanges(
    taskTitle: string,
    instructions: string,
    fileContents: Map<string, string>,
    repoTree: GitHubTreeItem[]
  ): Promise<CodeAnalysis> {
    // Build context from file contents
    let context = '';
    for (const [path, content] of fileContents) {
      context += `\n### File: ${path}\n\`\`\`\n${content}\n\`\`\`\n`;
    }

    // List of all files for awareness
    const allFiles = repoTree.map(f => f.path).slice(0, 100).join('\n');

    const systemPrompt = `You are an expert software engineer assistant. Your task is to analyze code and generate precise changes to implement a requested feature or fix.

IMPORTANT RULES:
1. Generate COMPLETE file contents for any files you create or modify - never use placeholders or "..."
2. Follow the existing code patterns and style in the repository
3. Make minimal, focused changes - don't refactor unrelated code
4. Include proper imports and exports
5. Consider error handling and edge cases
6. If creating new files, follow the repository's file structure conventions

Current file contents that may be relevant:
${context}

All files in repository:
${allFiles}

Return your response as valid JSON with this exact structure:
{
  "explanation": "Brief explanation of the changes",
  "changes": [
    {
      "path": "path/to/file.ts",
      "action": "create" | "update" | "delete",
      "content": "COMPLETE new file content (for create/update)",
      "description": "What this change does"
    }
  ],
  "testSuggestions": ["Optional suggestions for testing the changes"]
}`;

    const userPrompt = `Task: ${taskTitle}

Instructions:
${instructions}

Generate the necessary code changes to implement this task. Remember:
- Provide COMPLETE file contents for all changes
- Follow existing patterns in the codebase
- Make focused, minimal changes`;

    try {
      const result = await openRouterService.completeJson<{
        explanation: string;
        changes: Array<{
          path: string;
          action: 'create' | 'update' | 'delete';
          content?: string;
          description?: string;
        }>;
        testSuggestions?: string[];
      }>(systemPrompt, userPrompt, {
        model: this.codingModel,
        temperature: 0.3,
      });

      // Convert to our internal format
      const suggestedChanges: FileChange[] = result.changes.map(change => ({
        path: change.path,
        action: change.action,
        content: change.content,
        originalContent: fileContents.get(change.path),
      }));

      return {
        relevantFiles: Array.from(fileContents.keys()),
        suggestedChanges,
        explanation: result.explanation,
        testSuggestions: result.testSuggestions,
      };
    } catch (error) {
      console.error('Failed to generate code changes:', error);
      throw new Error(`LLM failed to generate code changes: ${(error as Error).message}`);
    }
  }

  /**
   * Apply changes to the repository via GitHub API
   */
  private async applyChanges(
    owner: string,
    repo: string,
    branch: string,
    taskTitle: string,
    changes: FileChange[]
  ): Promise<CodingResult> {
    let filesChanged = 0;
    let linesAdded = 0;
    let linesRemoved = 0;
    let lastCommitSha = '';
    const appliedChanges: FileChange[] = [];

    for (const change of changes) {
      try {
        if (change.action === 'create' && change.content) {
          // Create new file
          const result = await gitHubService.createOrUpdateFile(
            owner,
            repo,
            change.path,
            change.content,
            `[Claude] Add ${change.path} for: ${taskTitle}`,
            branch
          );
          lastCommitSha = result.commit.sha;
          filesChanged++;
          linesAdded += change.content.split('\n').length;
          appliedChanges.push(change);

        } else if (change.action === 'update' && change.content) {
          // Update existing file
          const existingSha = await gitHubService.getFileSha(owner, repo, change.path, branch);

          if (existingSha) {
            const result = await gitHubService.createOrUpdateFile(
              owner,
              repo,
              change.path,
              change.content,
              `[Claude] Update ${change.path} for: ${taskTitle}`,
              branch,
              existingSha
            );
            lastCommitSha = result.commit.sha;
            filesChanged++;

            // Calculate line changes
            const originalLines = change.originalContent?.split('\n').length || 0;
            const newLines = change.content.split('\n').length;
            if (newLines > originalLines) {
              linesAdded += newLines - originalLines;
            } else {
              linesRemoved += originalLines - newLines;
            }
            // Also count modified lines as additions (rough estimate)
            linesAdded += Math.min(originalLines, newLines);
            appliedChanges.push(change);
          } else {
            // File doesn't exist, create it instead
            const result = await gitHubService.createOrUpdateFile(
              owner,
              repo,
              change.path,
              change.content,
              `[Claude] Create ${change.path} for: ${taskTitle}`,
              branch
            );
            lastCommitSha = result.commit.sha;
            filesChanged++;
            linesAdded += change.content.split('\n').length;
            appliedChanges.push({ ...change, action: 'create' });
          }

        } else if (change.action === 'delete') {
          // Delete file
          const existingSha = await gitHubService.getFileSha(owner, repo, change.path, branch);

          if (existingSha) {
            const result = await gitHubService.deleteFile(
              owner,
              repo,
              change.path,
              `[Claude] Delete ${change.path} for: ${taskTitle}`,
              branch,
              existingSha
            );
            lastCommitSha = result.commit.sha;
            filesChanged++;
            linesRemoved += change.originalContent?.split('\n').length || 0;
            appliedChanges.push(change);
          }
        }
      } catch (error) {
        console.error(`Failed to apply change to ${change.path}:`, error);
        // Continue with other changes
      }
    }

    if (filesChanged === 0) {
      throw new Error('No changes were applied. LLM may have generated invalid changes.');
    }

    return {
      filesChanged,
      linesAdded,
      linesRemoved,
      commitSha: lastCommitSha,
      changes: appliedChanges,
    };
  }

  /**
   * Get file extension including the dot
   */
  private getFileExtension(path: string): string {
    const parts = path.split('.');
    if (parts.length > 1) {
      return '.' + parts[parts.length - 1];
    }
    return '';
  }

  /**
   * Analyze a codebase and provide recommendations
   * (Can be used standalone without making changes)
   */
  async analyzeCodebase(
    owner: string,
    repo: string,
    question: string,
    branch?: string
  ): Promise<string> {
    if (!this.isReady()) {
      throw new Error('Coding agent not initialized. Check LLM API keys.');
    }

    // Get repo info
    const repoInfo = await gitHubService.getRepo(owner, repo);
    const targetBranch = branch || repoInfo.default_branch;

    // Get tree
    const tree = await this.getRepoTree(owner, repo, targetBranch);

    // Get README
    let readmeContent = '';
    try {
      const readme = await gitHubService.getReadme(owner, repo, targetBranch);
      if (readme) {
        readmeContent = readme.content.substring(0, 3000);
      }
    } catch {
      // README not found, continue without it
    }

    // Build file list
    const fileList = tree.map(f => f.path).join('\n');

    const systemPrompt = `You are a helpful code analysis assistant. Analyze the repository structure and provide insights.

Repository: ${owner}/${repo}
Default branch: ${repoInfo.default_branch}
Language: ${repoInfo.language || 'Unknown'}

Files in repository:
${fileList}

${readmeContent ? `README:\n${readmeContent}` : ''}`;

    const response = await openRouterService.complete(
      systemPrompt,
      question,
      { model: this.codingModel, temperature: 0.5 }
    );

    return response;
  }
}

export const claudeCodingAgentService = new ClaudeCodingAgentService();
export { FileChange, CodeAnalysis, CodingResult };
