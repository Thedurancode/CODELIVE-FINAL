#!/usr/bin/env npx tsx
/**
 * Sprite MCP Server
 *
 * A Model Context Protocol server that runs inside each sprite VM.
 * Provides Claude with tools for file operations, shell commands, and git.
 *
 * This script is installed and run inside the sprite during initialization.
 * It exposes an HTTP endpoint that the backend proxies to Claude.
 *
 * Usage:
 *   npx tsx sprite-mcp-server.ts --port 3100 --project-dir /home/sprite/project
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response } from 'express';
import * as z from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Parse command line arguments
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const projectDirIndex = args.indexOf('--project-dir');
const PORT = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3100;
const PROJECT_DIR = projectDirIndex !== -1 ? args[projectDirIndex + 1] : '/home/sprite/project';

// Create MCP server
const server = new McpServer({
  name: 'sprite-mcp-server',
  version: '1.0.0',
});

// ============================================================================
// FILE SYSTEM TOOLS
// ============================================================================

// Read file
server.registerTool(
  'read_file',
  {
    title: 'Read File',
    description: 'Read the contents of a file at the specified path',
    inputSchema: {
      path: z.string().describe('Absolute or relative path to the file'),
    },
    outputSchema: {
      content: z.string(),
      path: z.string(),
      size: z.number(),
    },
  },
  async ({ path: filePath }) => {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_DIR, filePath);
    const content = await fs.readFile(absolutePath, 'utf-8');
    const stats = await fs.stat(absolutePath);
    const output = { content, path: absolutePath, size: stats.size };
    return {
      content: [{ type: 'text', text: content }],
      structuredContent: output,
    };
  }
);

// Write file
server.registerTool(
  'write_file',
  {
    title: 'Write File',
    description: 'Write content to a file, creating it if it does not exist',
    inputSchema: {
      path: z.string().describe('Path to the file'),
      content: z.string().describe('Content to write'),
    },
    outputSchema: {
      success: z.boolean(),
      path: z.string(),
      bytes_written: z.number(),
    },
  },
  async ({ path: filePath, content }) => {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_DIR, filePath);
    // Ensure directory exists
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, 'utf-8');
    const output = { success: true, path: absolutePath, bytes_written: Buffer.byteLength(content) };
    return {
      content: [{ type: 'text', text: `Wrote ${output.bytes_written} bytes to ${absolutePath}` }],
      structuredContent: output,
    };
  }
);

// List directory
server.registerTool(
  'list_directory',
  {
    title: 'List Directory',
    description: 'List files and directories in the specified path',
    inputSchema: {
      path: z.string().describe('Path to the directory').default('.'),
      recursive: z.boolean().describe('Whether to list recursively').default(false),
    },
    outputSchema: {
      path: z.string(),
      entries: z.array(
        z.object({
          name: z.string(),
          type: z.enum(['file', 'directory', 'symlink', 'other']),
          size: z.number().optional(),
        })
      ),
    },
  },
  async ({ path: dirPath, recursive }) => {
    const absolutePath = path.isAbsolute(dirPath) ? dirPath : path.join(PROJECT_DIR, dirPath);

    async function listDir(dir: string, prefix = ''): Promise<Array<{ name: string; type: string; size?: number }>> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const results: Array<{ name: string; type: string; size?: number }> = [];

      for (const entry of entries) {
        // Skip hidden files and common ignored directories
        if (entry.name.startsWith('.') || ['node_modules', '__pycache__', 'venv'].includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          results.push({ name: relativeName, type: 'directory' });
          if (recursive) {
            const subEntries = await listDir(fullPath, relativeName);
            results.push(...subEntries);
          }
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          results.push({ name: relativeName, type: 'file', size: stats.size });
        } else if (entry.isSymbolicLink()) {
          results.push({ name: relativeName, type: 'symlink' });
        } else {
          results.push({ name: relativeName, type: 'other' });
        }
      }
      return results;
    }

    const entries = await listDir(absolutePath);
    const output = { path: absolutePath, entries };
    return {
      content: [{ type: 'text', text: entries.map((e) => `${e.type === 'directory' ? '📁' : '📄'} ${e.name}`).join('\n') }],
      structuredContent: output,
    };
  }
);

// Search files (grep)
server.registerTool(
  'search_files',
  {
    title: 'Search Files',
    description: 'Search for a pattern in files using grep',
    inputSchema: {
      pattern: z.string().describe('Search pattern (regex)'),
      path: z.string().describe('Directory to search in').default('.'),
      file_pattern: z.string().describe('File glob pattern (e.g., "*.ts")').optional(),
      case_sensitive: z.boolean().default(true),
    },
    outputSchema: {
      matches: z.array(
        z.object({
          file: z.string(),
          line: z.number(),
          content: z.string(),
        })
      ),
      total_matches: z.number(),
    },
  },
  async ({ pattern, path: searchPath, file_pattern, case_sensitive }) => {
    const absolutePath = path.isAbsolute(searchPath) ? searchPath : path.join(PROJECT_DIR, searchPath);

    let cmd = `grep -rn ${case_sensitive ? '' : '-i'} "${pattern}" "${absolutePath}"`;
    if (file_pattern) {
      cmd = `grep -rn ${case_sensitive ? '' : '-i'} --include="${file_pattern}" "${pattern}" "${absolutePath}"`;
    }

    try {
      const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
      const lines = stdout.trim().split('\n').filter(Boolean);
      const matches = lines.slice(0, 100).map((line) => {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          return { file: match[1], line: parseInt(match[2], 10), content: match[3].trim() };
        }
        return { file: '', line: 0, content: line };
      });

      const output = { matches, total_matches: lines.length };
      return {
        content: [{ type: 'text', text: `Found ${lines.length} matches:\n${matches.map((m) => `${m.file}:${m.line}: ${m.content}`).join('\n')}` }],
        structuredContent: output,
      };
    } catch (error: unknown) {
      // grep returns exit code 1 when no matches found
      const execError = error as { code?: number };
      if (execError.code === 1) {
        return {
          content: [{ type: 'text', text: 'No matches found' }],
          structuredContent: { matches: [], total_matches: 0 },
        };
      }
      throw error;
    }
  }
);

// Delete file
server.registerTool(
  'delete_file',
  {
    title: 'Delete File',
    description: 'Delete a file or empty directory',
    inputSchema: {
      path: z.string().describe('Path to delete'),
      recursive: z.boolean().describe('Delete directories recursively').default(false),
    },
    outputSchema: {
      success: z.boolean(),
      path: z.string(),
    },
  },
  async ({ path: filePath, recursive }) => {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_DIR, filePath);
    await fs.rm(absolutePath, { recursive });
    return {
      content: [{ type: 'text', text: `Deleted ${absolutePath}` }],
      structuredContent: { success: true, path: absolutePath },
    };
  }
);

// ============================================================================
// SHELL TOOLS
// ============================================================================

// Run command
server.registerTool(
  'run_command',
  {
    title: 'Run Command',
    description: 'Execute a shell command and return the output',
    inputSchema: {
      command: z.string().describe('Command to execute'),
      working_directory: z.string().describe('Working directory for the command').optional(),
      timeout: z.number().describe('Timeout in milliseconds').default(60000),
    },
    outputSchema: {
      stdout: z.string(),
      stderr: z.string(),
      exit_code: z.number(),
    },
  },
  async ({ command, working_directory, timeout }) => {
    const cwd = working_directory
      ? path.isAbsolute(working_directory)
        ? working_directory
        : path.join(PROJECT_DIR, working_directory)
      : PROJECT_DIR;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      const output = { stdout: stdout.trim(), stderr: stderr.trim(), exit_code: 0 };
      return {
        content: [{ type: 'text', text: stdout || stderr || '(no output)' }],
        structuredContent: output,
      };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; code?: number };
      const output = {
        stdout: execError.stdout?.trim() || '',
        stderr: execError.stderr?.trim() || String(error),
        exit_code: execError.code || 1,
      };
      return {
        content: [{ type: 'text', text: `Exit code ${output.exit_code}:\n${output.stderr || output.stdout}` }],
        structuredContent: output,
      };
    }
  }
);

// ============================================================================
// GIT TOOLS
// ============================================================================

// Git status
server.registerTool(
  'git_status',
  {
    title: 'Git Status',
    description: 'Get the current git status',
    inputSchema: {},
    outputSchema: {
      branch: z.string(),
      staged: z.array(z.string()),
      modified: z.array(z.string()),
      untracked: z.array(z.string()),
      ahead: z.number(),
      behind: z.number(),
    },
  },
  async () => {
    const { stdout: branchOut } = await execAsync('git branch --show-current', { cwd: PROJECT_DIR });
    const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: PROJECT_DIR });

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    for (const line of statusOut.split('\n').filter(Boolean)) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const file = line.slice(3);

      if (indexStatus !== ' ' && indexStatus !== '?') staged.push(file);
      if (workTreeStatus === 'M') modified.push(file);
      if (indexStatus === '?') untracked.push(file);
    }

    // Get ahead/behind
    let ahead = 0;
    let behind = 0;
    try {
      const { stdout: aheadBehind } = await execAsync('git rev-list --left-right --count HEAD...@{upstream}', { cwd: PROJECT_DIR });
      const [a, b] = aheadBehind.trim().split('\t').map(Number);
      ahead = a || 0;
      behind = b || 0;
    } catch {
      // No upstream configured
    }

    const output = { branch: branchOut.trim(), staged, modified, untracked, ahead, behind };
    return {
      content: [
        {
          type: 'text',
          text: `Branch: ${output.branch}\nStaged: ${staged.length}\nModified: ${modified.length}\nUntracked: ${untracked.length}\nAhead: ${ahead}, Behind: ${behind}`,
        },
      ],
      structuredContent: output,
    };
  }
);

// Git diff
server.registerTool(
  'git_diff',
  {
    title: 'Git Diff',
    description: 'Get the git diff for staged or unstaged changes',
    inputSchema: {
      staged: z.boolean().describe('Show staged changes').default(false),
      file: z.string().describe('Specific file to diff').optional(),
    },
    outputSchema: {
      diff: z.string(),
    },
  },
  async ({ staged, file }) => {
    let cmd = staged ? 'git diff --cached' : 'git diff';
    if (file) cmd += ` -- "${file}"`;

    const { stdout } = await execAsync(cmd, { cwd: PROJECT_DIR, maxBuffer: 10 * 1024 * 1024 });
    return {
      content: [{ type: 'text', text: stdout || '(no changes)' }],
      structuredContent: { diff: stdout },
    };
  }
);

// Git commit
server.registerTool(
  'git_commit',
  {
    title: 'Git Commit',
    description: 'Create a git commit with the staged changes',
    inputSchema: {
      message: z.string().describe('Commit message'),
      add_all: z.boolean().describe('Stage all changes before committing').default(false),
    },
    outputSchema: {
      success: z.boolean(),
      commit_hash: z.string(),
      message: z.string(),
    },
  },
  async ({ message, add_all }) => {
    if (add_all) {
      await execAsync('git add -A', { cwd: PROJECT_DIR });
    }

    const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: PROJECT_DIR });
    const hashMatch = stdout.match(/\[.+\s+([a-f0-9]+)\]/);
    const commitHash = hashMatch ? hashMatch[1] : '';

    return {
      content: [{ type: 'text', text: stdout }],
      structuredContent: { success: true, commit_hash: commitHash, message },
    };
  }
);

// Git push
server.registerTool(
  'git_push',
  {
    title: 'Git Push',
    description: 'Push commits to the remote repository',
    inputSchema: {
      set_upstream: z.boolean().describe('Set upstream for the current branch').default(false),
    },
    outputSchema: {
      success: z.boolean(),
      output: z.string(),
    },
  },
  async ({ set_upstream }) => {
    const { stdout: branch } = await execAsync('git branch --show-current', { cwd: PROJECT_DIR });
    let cmd = 'git push';
    if (set_upstream) {
      cmd = `git push -u origin ${branch.trim()}`;
    }

    const { stdout, stderr } = await execAsync(cmd, { cwd: PROJECT_DIR });
    const output = stdout || stderr;
    return {
      content: [{ type: 'text', text: output }],
      structuredContent: { success: true, output },
    };
  }
);

// Git log
server.registerTool(
  'git_log',
  {
    title: 'Git Log',
    description: 'Show recent git commits',
    inputSchema: {
      count: z.number().describe('Number of commits to show').default(10),
    },
    outputSchema: {
      commits: z.array(
        z.object({
          hash: z.string(),
          author: z.string(),
          date: z.string(),
          message: z.string(),
        })
      ),
    },
  },
  async ({ count }) => {
    const { stdout } = await execAsync(`git log -${count} --pretty=format:"%H|%an|%ad|%s" --date=short`, { cwd: PROJECT_DIR });

    const commits = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, author, date, ...messageParts] = line.split('|');
        return { hash, author, date, message: messageParts.join('|') };
      });

    return {
      content: [{ type: 'text', text: commits.map((c) => `${c.hash.slice(0, 7)} ${c.date} ${c.message}`).join('\n') }],
      structuredContent: { commits },
    };
  }
);

// ============================================================================
// EXPRESS SERVER
// ============================================================================

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', server: 'sprite-mcp-server', version: '1.0.0' });
});

// MCP endpoint
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// List available tools (for debugging)
app.get('/tools', (_req: Request, res: Response) => {
  const tools = [
    'read_file',
    'write_file',
    'list_directory',
    'search_files',
    'delete_file',
    'run_command',
    'git_status',
    'git_diff',
    'git_commit',
    'git_push',
    'git_log',
  ];
  res.json({ tools });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔧 Sprite MCP Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Project directory: ${PROJECT_DIR}`);
  console.log(`   MCP endpoint: POST /mcp`);
  console.log(`   Health check: GET /health`);
});
