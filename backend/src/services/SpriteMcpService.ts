/**
 * Sprite MCP Service
 *
 * Manages MCP (Model Context Protocol) servers running inside sprites.
 * Handles installation, startup, health checks, and proxying requests.
 */

import ProjectSprite from '../models/ProjectSprite';
import SpriteMcpServer, { McpEnvVar, McpServerStatus } from '../models/SpriteMcpServer';
import { spritesService } from './SpritesService';
import { mcpRegistryService, McpRegistryServer } from './McpRegistryService';
// Note: fetch is used for direct HTTP calls when sprite URL is available

// MCP server configuration
const MCP_PORT = 3100;
const MCP_SERVER_SCRIPT = `
#!/usr/bin/env node
/**
 * Sprite MCP Server - Lightweight version
 * Runs inside the sprite VM to provide Claude with file/shell/git tools
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const PROJECT_DIR = process.env.PROJECT_DIR || '/home/sprite/project';
const PORT = parseInt(process.env.MCP_PORT || '3100', 10);

// Tool definitions
const tools = {
  read_file: {
    description: 'Read the contents of a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' }
      },
      required: ['path']
    }
  },
  write_file: {
    description: 'Write content to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    }
  },
  list_directory: {
    description: 'List files in a directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path', default: '.' }
      }
    }
  },
  search_files: {
    description: 'Search for a pattern in files',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern' },
        path: { type: 'string', description: 'Directory to search', default: '.' }
      },
      required: ['pattern']
    }
  },
  run_command: {
    description: 'Execute a shell command',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        working_directory: { type: 'string', description: 'Working directory' },
        timeout: { type: 'number', description: 'Timeout in ms', default: 60000 }
      },
      required: ['command']
    }
  },
  git_status: {
    description: 'Get git status',
    inputSchema: { type: 'object', properties: {} }
  },
  git_diff: {
    description: 'Get git diff',
    inputSchema: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', default: false },
        file: { type: 'string' }
      }
    }
  },
  git_commit: {
    description: 'Create a git commit',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        add_all: { type: 'boolean', default: false }
      },
      required: ['message']
    }
  },
  git_push: {
    description: 'Push commits to remote',
    inputSchema: {
      type: 'object',
      properties: {
        set_upstream: { type: 'boolean', default: false }
      }
    }
  },
  git_log: {
    description: 'Show recent commits',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', default: 10 }
      }
    }
  }
};

// Tool implementations
async function executeTool(name, args) {
  const resolvePath = (p) => path.isAbsolute(p) ? p : path.join(PROJECT_DIR, p);

  switch (name) {
    case 'read_file': {
      const content = await fs.readFile(resolvePath(args.path), 'utf-8');
      return { content };
    }

    case 'write_file': {
      const filePath = resolvePath(args.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, args.content, 'utf-8');
      return { success: true, bytes_written: Buffer.byteLength(args.content) };
    }

    case 'list_directory': {
      const dirPath = resolvePath(args.path || '.');
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return {
        entries: entries
          .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
          .map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file'
          }))
      };
    }

    case 'search_files': {
      const searchPath = resolvePath(args.path || '.');
      try {
        const { stdout } = await execAsync(
          \`grep -rn "\${args.pattern}" "\${searchPath}" | head -100\`,
          { maxBuffer: 10 * 1024 * 1024 }
        );
        const matches = stdout.split('\\n').filter(Boolean).map(line => {
          const match = line.match(/^(.+?):(\\d+):(.*)$/);
          return match ? { file: match[1], line: parseInt(match[2]), content: match[3] } : null;
        }).filter(Boolean);
        return { matches, total: matches.length };
      } catch (e) {
        return { matches: [], total: 0 };
      }
    }

    case 'run_command': {
      const cwd = args.working_directory ? resolvePath(args.working_directory) : PROJECT_DIR;
      try {
        const { stdout, stderr } = await execAsync(args.command, {
          cwd,
          timeout: args.timeout || 60000,
          maxBuffer: 10 * 1024 * 1024
        });
        return { stdout, stderr, exit_code: 0 };
      } catch (e) {
        return { stdout: e.stdout || '', stderr: e.stderr || e.message, exit_code: e.code || 1 };
      }
    }

    case 'git_status': {
      const { stdout: branch } = await execAsync('git branch --show-current', { cwd: PROJECT_DIR });
      const { stdout: status } = await execAsync('git status --porcelain', { cwd: PROJECT_DIR });
      const staged = [], modified = [], untracked = [];
      status.split('\\n').filter(Boolean).forEach(line => {
        const file = line.slice(3);
        if (line[0] !== ' ' && line[0] !== '?') staged.push(file);
        if (line[1] === 'M') modified.push(file);
        if (line[0] === '?') untracked.push(file);
      });
      return { branch: branch.trim(), staged, modified, untracked };
    }

    case 'git_diff': {
      const cmd = args.staged ? 'git diff --cached' : 'git diff';
      const { stdout } = await execAsync(cmd + (args.file ? \` -- "\${args.file}"\` : ''), { cwd: PROJECT_DIR, maxBuffer: 10 * 1024 * 1024 });
      return { diff: stdout };
    }

    case 'git_commit': {
      if (args.add_all) await execAsync('git add -A', { cwd: PROJECT_DIR });
      const { stdout } = await execAsync(\`git commit -m "\${args.message.replace(/"/g, '\\\\"')}"\`, { cwd: PROJECT_DIR });
      const hash = stdout.match(/\\[.+\\s+([a-f0-9]+)\\]/)?.[1] || '';
      return { success: true, commit_hash: hash };
    }

    case 'git_push': {
      const { stdout: branch } = await execAsync('git branch --show-current', { cwd: PROJECT_DIR });
      const cmd = args.set_upstream ? \`git push -u origin \${branch.trim()}\` : 'git push';
      const { stdout, stderr } = await execAsync(cmd, { cwd: PROJECT_DIR });
      return { success: true, output: stdout || stderr };
    }

    case 'git_log': {
      const { stdout } = await execAsync(\`git log -\${args.count || 10} --pretty=format:"%H|%an|%ad|%s" --date=short\`, { cwd: PROJECT_DIR });
      const commits = stdout.split('\\n').filter(Boolean).map(line => {
        const [hash, author, date, ...msg] = line.split('|');
        return { hash, author, date, message: msg.join('|') };
      });
      return { commits };
    }

    default:
      throw new Error(\`Unknown tool: \${name}\`);
  }
}

// HTTP server
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.url === '/health') {
    return res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
  }

  if (req.method === 'GET' && req.url === '/tools') {
    return res.end(JSON.stringify({ tools: Object.keys(tools).map(name => ({ name, ...tools[name] })) }));
  }

  if (req.method === 'POST' && req.url === '/call') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { tool, arguments: args } = JSON.parse(body);
        const result = await executeTool(tool, args || {});
        res.end(JSON.stringify({ success: true, result }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(\`MCP Server running on port \${PORT}\`);
  console.log(\`Project directory: \${PROJECT_DIR}\`);
});
`;

interface McpToolCallResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

class SpriteMcpService {
  /**
   * Helper to execute a command on a sprite via the sprites API
   */
  private async execOnSprite(
    sprite: ProjectSprite,
    command: string,
    timeout: number = 30000
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const result = await spritesService.execCommand(
      sprite.organizationId,
      sprite.spriteName,
      command,
      { timeout }
    );
    return {
      stdout: result.output || '',
      stderr: '', // ExecResult combines stdout/stderr into output
      exitCode: result.exitCode || 0,
    };
  }

  /**
   * Install and start the MCP server on a sprite
   */
  async installMcpServer(spriteId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const sprite = await ProjectSprite.findByPk(spriteId);
      if (!sprite) {
        return { success: false, error: 'Sprite not found' };
      }

      if (!sprite.isActive()) {
        return { success: false, error: 'Sprite is not active' };
      }

      // Write the MCP server script to the sprite
      const scriptPath = '/home/sprite/.mcp-server.js';
      await spritesService.writeFile(spriteId, scriptPath, MCP_SERVER_SCRIPT);

      // Start the MCP server in the background using nohup
      const startCmd = `cd /home/sprite/project && PROJECT_DIR=/home/sprite/project MCP_PORT=${MCP_PORT} nohup node ${scriptPath} > /home/sprite/.mcp-server.log 2>&1 &`;
      await this.execOnSprite(sprite, startCmd, 5000);

      // Wait a moment for the server to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify the server is running
      const healthCheck = await this.checkMcpHealth(spriteId);
      if (!healthCheck.healthy) {
        return { success: false, error: 'MCP server failed to start' };
      }

      // Update sprite to mark MCP as configured
      await sprite.update({
        mcpEnabled: true,
        mcpPort: MCP_PORT,
        mcpInstalledAt: new Date(),
        statusMessage: 'MCP server running',
      });

      console.log(`[SpriteMcp] MCP server installed and running on sprite ${spriteId}`);
      return { success: true };
    } catch (error) {
      console.error(`[SpriteMcp] Failed to install MCP server:`, error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Check if the MCP server is healthy
   */
  async checkMcpHealth(spriteId: string): Promise<{ healthy: boolean; version?: string }> {
    try {
      const sprite = await ProjectSprite.findByPk(spriteId);
      if (!sprite || !sprite.isActive()) {
        return { healthy: false };
      }

      // Check via command execution
      const result = await this.execOnSprite(
        sprite,
        `curl -s http://localhost:${MCP_PORT}/health`,
        5000
      );
      if (result.stdout?.includes('"status":"ok"')) {
        const parsed = JSON.parse(result.stdout);
        return { healthy: true, version: parsed.version };
      }
      return { healthy: false };
    } catch (error) {
      console.error(`[SpriteMcp] Health check failed:`, error);
      return { healthy: false };
    }
  }

  /**
   * Get list of available tools from the MCP server
   */
  async getTools(spriteId: string): Promise<McpTool[]> {
    try {
      const sprite = await ProjectSprite.findByPk(spriteId);
      if (!sprite || !sprite.isActive()) {
        return [];
      }

      const result = await this.execOnSprite(
        sprite,
        `curl -s http://localhost:${MCP_PORT}/tools`,
        5000
      );
      const parsed = JSON.parse(result.stdout || '{}');
      return parsed.tools || [];
    } catch (error) {
      console.error(`[SpriteMcp] Failed to get tools:`, error);
      return [];
    }
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(
    spriteId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpToolCallResult> {
    try {
      const sprite = await ProjectSprite.findByPk(spriteId);
      if (!sprite || !sprite.isActive()) {
        return { success: false, error: 'Sprite is not active' };
      }

      // Escape the JSON for the shell command
      const jsonArgs = JSON.stringify({ tool: toolName, arguments: args }).replace(/'/g, "'\\''");

      const result = await this.execOnSprite(
        sprite,
        `curl -s -X POST -H "Content-Type: application/json" -d '${jsonArgs}' http://localhost:${MCP_PORT}/call`,
        120000 // 2 minute timeout for long-running commands
      );

      if (result.exitCode !== 0) {
        return { success: false, error: result.stderr || 'Command failed' };
      }

      const parsed = JSON.parse(result.stdout || '{}');
      return parsed;
    } catch (error) {
      console.error(`[SpriteMcp] Tool call failed:`, error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Read a file via MCP
   */
  async readFile(spriteId: string, filePath: string): Promise<{ content?: string; error?: string }> {
    const result = await this.callTool(spriteId, 'read_file', { path: filePath });
    if (!result.success) {
      return { error: result.error };
    }
    const content = (result.result as { content?: string })?.content;
    return { content };
  }

  /**
   * Write a file via MCP
   */
  async writeFile(
    spriteId: string,
    filePath: string,
    content: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.callTool(spriteId, 'write_file', { path: filePath, content });
    return { success: result.success, error: result.error };
  }

  /**
   * Run a command via MCP
   */
  async runCommand(
    spriteId: string,
    command: string,
    workingDirectory?: string,
    timeout?: number
  ): Promise<{ stdout?: string; stderr?: string; exit_code?: number; error?: string }> {
    const result = await this.callTool(spriteId, 'run_command', {
      command,
      working_directory: workingDirectory,
      timeout,
    });

    if (!result.success) {
      return { error: result.error };
    }

    const res = result.result as { stdout?: string; stderr?: string; exit_code?: number };
    return res;
  }

  /**
   * Get git status via MCP
   */
  async gitStatus(spriteId: string): Promise<{
    branch?: string;
    staged?: string[];
    modified?: string[];
    untracked?: string[];
    error?: string;
  }> {
    const result = await this.callTool(spriteId, 'git_status', {});
    if (!result.success) {
      return { error: result.error };
    }
    return result.result as {
      branch: string;
      staged: string[];
      modified: string[];
      untracked: string[];
    };
  }

  /**
   * Search files via MCP
   */
  async searchFiles(
    spriteId: string,
    pattern: string,
    searchPath = '.'
  ): Promise<{ matches?: Array<{ file: string; line: number; content: string }>; error?: string }> {
    const result = await this.callTool(spriteId, 'search_files', { pattern, path: searchPath });
    if (!result.success) {
      return { error: result.error };
    }
    return result.result as { matches: Array<{ file: string; line: number; content: string }> };
  }

  /**
   * Stop the MCP server on a sprite
   */
  async stopMcpServer(spriteId: string): Promise<{ success: boolean }> {
    try {
      const sprite = await ProjectSprite.findByPk(spriteId);
      if (sprite) {
        await this.execOnSprite(sprite, `pkill -f ".mcp-server.js" || true`, 5000);

        // Update sprite to mark MCP as disabled
        await sprite.update({
          mcpEnabled: false,
          mcpPort: null,
        });
      }

      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * Check if MCP is installed on a sprite (from database)
   */
  async isMcpInstalled(spriteId: string): Promise<boolean> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    return sprite?.mcpEnabled ?? false;
  }

  /**
   * Get MCP port for a sprite
   */
  async getMcpPort(spriteId: string): Promise<number | null> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    return sprite?.mcpPort ?? null;
  }

  // ============================================================================
  // MCP SERVER CONFIGURATION MANAGEMENT
  // ============================================================================

  /**
   * Get all installed MCP servers for a sprite
   */
  async getInstalledServers(spriteId: string): Promise<SpriteMcpServer[]> {
    return SpriteMcpServer.getBySprite(spriteId);
  }

  /**
   * Get a specific installed MCP server by name
   */
  async getServerByName(spriteId: string, serverName: string): Promise<SpriteMcpServer | null> {
    return SpriteMcpServer.getByName(spriteId, serverName);
  }

  /**
   * Install an MCP server from the registry with configuration
   */
  async installFromRegistry(
    spriteId: string,
    serverName: string,
    options: {
      version?: string;
      envVars?: McpEnvVar[];
      autoStart?: boolean;
    } = {}
  ): Promise<SpriteMcpServer> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.isActive()) {
      throw new Error('Sprite is not active');
    }

    // Check if already installed
    const existing = await SpriteMcpServer.getByName(spriteId, serverName);
    if (existing && existing.status !== 'uninstalled') {
      throw new Error(`Server "${serverName}" is already installed`);
    }

    // Get server details from registry
    const serverDetails = await mcpRegistryService.getServerDetails(serverName, options.version);
    if (!serverDetails) {
      throw new Error(`Server "${serverName}" not found in registry`);
    }

    // Get install/run commands from registry
    const installCommand = mcpRegistryService.getInstallCommand(serverDetails);
    const runCommand = mcpRegistryService.getRunCommand(serverDetails);

    // Get package info
    const primaryPackage = serverDetails.packages?.[0];

    // Create the server record
    const mcpServer = await SpriteMcpServer.installServer(
      spriteId,
      sprite.organizationId,
      {
        serverName,
        displayName: serverDetails.name,
        description: serverDetails.description,
        registry: primaryPackage?.registry || 'npm',
        packageName: primaryPackage?.name,
        packageVersion: serverDetails.version,
        installCommand: installCommand || undefined,
        runCommand: runCommand || undefined,
        tools: serverDetails.tools || [],
        autoStart: options.autoStart ?? true,
      }
    );

    // Set environment variables if provided
    if (options.envVars && options.envVars.length > 0) {
      await mcpServer.setEnvVars(options.envVars);
    }

    // Run the install command on the sprite
    if (installCommand) {
      try {
        const result = await this.execOnSprite(sprite, installCommand, 120000);
        if (result.exitCode !== 0) {
          await mcpServer.update({
            status: 'error',
            errorMessage: `Installation failed: ${result.stderr || result.stdout}`,
          });
          throw new Error(`Installation failed: ${result.stderr || result.stdout}`);
        }
      } catch (error) {
        await mcpServer.update({
          status: 'error',
          errorMessage: `Installation failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        throw error;
      }
    }

    // Mark as installed
    await mcpServer.markInstalled(serverDetails.version);

    console.log(`[SpriteMcp] Installed MCP server "${serverName}" on sprite ${spriteId}`);
    return mcpServer.reload();
  }

  /**
   * Update configuration for an installed MCP server
   */
  async updateServerConfig(
    spriteId: string,
    serverName: string,
    config: {
      displayName?: string;
      autoStart?: boolean;
      startOrder?: number;
      envVars?: McpEnvVar[];
    }
  ): Promise<SpriteMcpServer> {
    const mcpServer = await SpriteMcpServer.getByName(spriteId, serverName);
    if (!mcpServer) {
      throw new Error(`Server "${serverName}" not found`);
    }

    // Update basic config
    const updates: Partial<SpriteMcpServer> = {};
    if (config.displayName !== undefined) {
      updates.displayName = config.displayName;
    }
    if (config.autoStart !== undefined) {
      updates.autoStart = config.autoStart;
    }
    if (config.startOrder !== undefined) {
      updates.startOrder = config.startOrder;
    }

    if (Object.keys(updates).length > 0) {
      await mcpServer.update(updates);
    }

    // Update environment variables if provided
    if (config.envVars) {
      await mcpServer.setEnvVars(config.envVars);
    }

    console.log(`[SpriteMcp] Updated config for server "${serverName}" on sprite ${spriteId}`);
    return mcpServer.reload();
  }

  /**
   * Get environment variables for a server (with secrets masked)
   */
  async getServerEnvVars(
    spriteId: string,
    serverName: string,
    options: { includeValues?: boolean } = {}
  ): Promise<McpEnvVar[]> {
    const mcpServer = await SpriteMcpServer.getByName(spriteId, serverName);
    if (!mcpServer) {
      throw new Error(`Server "${serverName}" not found`);
    }

    if (options.includeValues) {
      // Return decrypted values (only for backend use)
      return mcpServer.getDecryptedEnvVars();
    }

    // Return with secrets masked
    const vars = mcpServer.getDecryptedEnvVars();
    return vars.map((v) => ({
      ...v,
      value: v.isSecret ? '••••••••' : v.value,
    }));
  }

  /**
   * Start an installed MCP server
   */
  async startServer(spriteId: string, serverName: string): Promise<SpriteMcpServer> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.isActive()) {
      throw new Error('Sprite is not active');
    }

    const mcpServer = await SpriteMcpServer.getByName(spriteId, serverName);
    if (!mcpServer) {
      throw new Error(`Server "${serverName}" not found`);
    }

    if (!mcpServer.canStart()) {
      throw new Error(`Server "${serverName}" cannot be started (status: ${mcpServer.status})`);
    }

    if (!mcpServer.runCommand) {
      throw new Error(`Server "${serverName}" has no run command configured`);
    }

    // Build the run command with environment variables
    const envVars = mcpServer.getEnvForShell();
    const envPrefix = Object.entries(envVars)
      .map(([key, value]) => `${key}="${value.replace(/"/g, '\\"')}"`)
      .join(' ');

    const fullCommand = envPrefix
      ? `${envPrefix} nohup ${mcpServer.runCommand} > /home/sprite/.mcp-${serverName}.log 2>&1 &`
      : `nohup ${mcpServer.runCommand} > /home/sprite/.mcp-${serverName}.log 2>&1 &`;

    try {
      const result = await this.execOnSprite(sprite, fullCommand, 30000);
      if (result.exitCode !== 0) {
        await mcpServer.markStopped(`Start failed: ${result.stderr || result.stdout}`);
        throw new Error(`Failed to start server: ${result.stderr || result.stdout}`);
      }

      await mcpServer.markStarted();
      console.log(`[SpriteMcp] Started MCP server "${serverName}" on sprite ${spriteId}`);
      return mcpServer.reload();
    } catch (error) {
      await mcpServer.markStopped(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Stop a running MCP server
   */
  async stopServer(spriteId: string, serverName: string): Promise<SpriteMcpServer> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    const mcpServer = await SpriteMcpServer.getByName(spriteId, serverName);
    if (!mcpServer) {
      throw new Error(`Server "${serverName}" not found`);
    }

    // Try to kill the process by name pattern
    try {
      await this.execOnSprite(sprite, `pkill -f "${mcpServer.packageName || serverName}" || true`, 10000);
    } catch {
      // Ignore errors - process may already be stopped
    }

    await mcpServer.markStopped();
    console.log(`[SpriteMcp] Stopped MCP server "${serverName}" on sprite ${spriteId}`);
    return mcpServer.reload();
  }

  /**
   * Uninstall an MCP server
   */
  async uninstallServer(spriteId: string, serverName: string): Promise<void> {
    const mcpServer = await SpriteMcpServer.getByName(spriteId, serverName);
    if (!mcpServer) {
      throw new Error(`Server "${serverName}" not found`);
    }

    // Stop the server first if running
    if (mcpServer.status === 'running') {
      await this.stopServer(spriteId, serverName);
    }

    // Mark as uninstalled (soft delete)
    await mcpServer.uninstall();
    console.log(`[SpriteMcp] Uninstalled MCP server "${serverName}" from sprite ${spriteId}`);
  }

  // ============================================================================
  // AUTO-START MANAGEMENT
  // ============================================================================

  /**
   * Start all auto-start servers for a sprite
   * Called when a sprite is resumed
   */
  async startAutoStartServers(spriteId: string): Promise<{
    started: string[];
    failed: Array<{ serverName: string; error: string }>;
  }> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.isActive()) {
      throw new Error('Sprite is not active');
    }

    const autoStartServers = await SpriteMcpServer.getAutoStartServers(spriteId);
    const started: string[] = [];
    const failed: Array<{ serverName: string; error: string }> = [];

    for (const server of autoStartServers) {
      try {
        await this.startServer(spriteId, server.serverName);
        started.push(server.serverName);
      } catch (error) {
        failed.push({
          serverName: server.serverName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(
      `[SpriteMcp] Auto-started ${started.length} servers on sprite ${spriteId}`,
      failed.length > 0 ? `(${failed.length} failed)` : ''
    );

    return { started, failed };
  }

  /**
   * Stop all running servers for a sprite
   * Called when a sprite is stopped/hibernated
   */
  async stopAllServers(spriteId: string): Promise<number> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      return 0;
    }

    const runningServers = await SpriteMcpServer.getRunningServers(spriteId);

    for (const server of runningServers) {
      try {
        await this.stopServer(spriteId, server.serverName);
      } catch (error) {
        console.warn(`[SpriteMcp] Failed to stop server "${server.serverName}":`, error);
      }
    }

    // Also update any that might have been missed
    const count = await SpriteMcpServer.stopAllServers(spriteId);

    console.log(`[SpriteMcp] Stopped ${count} MCP servers on sprite ${spriteId}`);
    return count;
  }

  /**
   * Get auto-start servers configuration
   */
  async getAutoStartConfig(spriteId: string): Promise<SpriteMcpServer[]> {
    return SpriteMcpServer.getAutoStartServers(spriteId);
  }

  /**
   * Set auto-start for a server
   */
  async setAutoStart(
    spriteId: string,
    serverName: string,
    autoStart: boolean
  ): Promise<SpriteMcpServer> {
    const mcpServer = await SpriteMcpServer.getByName(spriteId, serverName);
    if (!mcpServer) {
      throw new Error(`Server "${serverName}" not found`);
    }

    await mcpServer.update({ autoStart });
    console.log(`[SpriteMcp] Set auto-start for "${serverName}" to ${autoStart} on sprite ${spriteId}`);
    return mcpServer.reload();
  }

  /**
   * Reorder auto-start servers
   */
  async reorderAutoStartServers(
    spriteId: string,
    serverOrder: string[]
  ): Promise<void> {
    for (let i = 0; i < serverOrder.length; i++) {
      const serverName = serverOrder[i];
      const mcpServer = await SpriteMcpServer.getByName(spriteId, serverName);
      if (mcpServer) {
        await mcpServer.update({ startOrder: i });
      }
    }
    console.log(`[SpriteMcp] Reordered auto-start servers on sprite ${spriteId}`);
  }

  // ============================================================================
  // REQUIRED ENVIRONMENT VARIABLES
  // ============================================================================

  /**
   * Get required environment variables for a server from the registry
   */
  async getRequiredEnvVars(serverName: string): Promise<string[]> {
    const serverDetails = await mcpRegistryService.getServerDetails(serverName);
    if (!serverDetails) {
      return [];
    }

    const primaryPackage = serverDetails.packages?.[0];
    return primaryPackage?.environmentVariables || [];
  }

  /**
   * Check if a server has all required env vars configured
   */
  async hasRequiredEnvVars(spriteId: string, serverName: string): Promise<{
    complete: boolean;
    missing: string[];
    configured: string[];
  }> {
    const mcpServer = await SpriteMcpServer.getByName(spriteId, serverName);
    if (!mcpServer) {
      throw new Error(`Server "${serverName}" not found`);
    }

    const required = await this.getRequiredEnvVars(serverName);
    const configured = mcpServer.envConfig?.variables?.map((v) => v.key) || [];
    const configuredSet = new Set(configured);
    const missing = required.filter((key) => !configuredSet.has(key));

    return {
      complete: missing.length === 0,
      missing,
      configured,
    };
  }

  // ============================================================================
  // VERSION CHECKING AND UPDATES
  // ============================================================================

  /**
   * Check for updates for a single installed MCP server
   */
  async checkServerForUpdate(spriteId: string, serverName: string): Promise<{
    hasUpdate: boolean;
    currentVersion: string | null;
    latestVersion: string | null;
    changelogUrl: string | null;
    registryUrl: string | null;
  }> {
    const mcpServer = await SpriteMcpServer.getByName(spriteId, serverName);
    if (!mcpServer) {
      throw new Error(`Server "${serverName}" not found`);
    }

    // Get the latest version from the registry
    const serverDetails = await mcpRegistryService.getServerDetails(serverName);
    if (!serverDetails) {
      return {
        hasUpdate: false,
        currentVersion: mcpServer.packageVersion,
        latestVersion: null,
        changelogUrl: null,
        registryUrl: null,
      };
    }

    // Build registry URL based on package type
    const primaryPackage = serverDetails.packages?.[0];
    let registryUrl: string | null = null;
    if (primaryPackage) {
      switch (primaryPackage.registry) {
        case 'npm':
          registryUrl = `https://www.npmjs.com/package/${primaryPackage.name}`;
          break;
        case 'pypi':
          registryUrl = `https://pypi.org/project/${primaryPackage.name}`;
          break;
        case 'cargo':
          registryUrl = `https://crates.io/crates/${primaryPackage.name}`;
          break;
      }
    }

    // Build changelog URL (GitHub releases if available)
    let changelogUrl: string | null = null;
    if (serverDetails.sourceUrl) {
      // Try to construct GitHub releases URL
      const githubMatch = serverDetails.sourceUrl.match(/github\.com\/([^/]+\/[^/]+)/);
      if (githubMatch) {
        changelogUrl = `https://github.com/${githubMatch[1]}/releases`;
      }
    }

    // Update the version info in the database
    await mcpServer.updateVersionInfo({
      latestVersion: serverDetails.version,
      changelogUrl,
      registryUrl,
    });

    const hasUpdate = mcpServer.packageVersion !== serverDetails.version;

    return {
      hasUpdate,
      currentVersion: mcpServer.packageVersion,
      latestVersion: serverDetails.version,
      changelogUrl,
      registryUrl,
    };
  }

  /**
   * Check for updates for all installed servers on a sprite
   */
  async checkAllServersForUpdates(spriteId: string): Promise<{
    servers: Array<{
      serverName: string;
      displayName: string | null;
      hasUpdate: boolean;
      currentVersion: string | null;
      latestVersion: string | null;
      changelogUrl: string | null;
      registryUrl: string | null;
    }>;
    updatesAvailable: number;
    checkedAt: Date;
  }> {
    const installedServers = await SpriteMcpServer.getBySprite(spriteId);
    const results = [];
    let updatesAvailable = 0;

    for (const server of installedServers) {
      try {
        const updateInfo = await this.checkServerForUpdate(spriteId, server.serverName);
        if (updateInfo.hasUpdate) {
          updatesAvailable++;
        }
        results.push({
          serverName: server.serverName,
          displayName: server.displayName,
          ...updateInfo,
        });
      } catch (error) {
        // Continue checking other servers even if one fails
        results.push({
          serverName: server.serverName,
          displayName: server.displayName,
          hasUpdate: false,
          currentVersion: server.packageVersion,
          latestVersion: null,
          changelogUrl: null,
          registryUrl: null,
        });
      }
    }

    console.log(
      `[SpriteMcp] Checked ${results.length} servers for updates on sprite ${spriteId}: ${updatesAvailable} updates available`
    );

    return {
      servers: results,
      updatesAvailable,
      checkedAt: new Date(),
    };
  }

  /**
   * Get servers with available updates
   */
  async getServersWithUpdates(spriteId: string): Promise<SpriteMcpServer[]> {
    const servers = await SpriteMcpServer.getBySprite(spriteId);
    return servers.filter((server) => server.hasUpdate());
  }

  /**
   * Update an MCP server to the latest version
   * Preserves environment variables and configuration
   */
  async updateServer(spriteId: string, serverName: string): Promise<{
    server: SpriteMcpServer;
    previousVersion: string | null;
    newVersion: string | null;
  }> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.isActive()) {
      throw new Error('Sprite is not active');
    }

    const mcpServer = await SpriteMcpServer.getByName(spriteId, serverName);
    if (!mcpServer) {
      throw new Error(`Server "${serverName}" not found`);
    }

    const previousVersion = mcpServer.packageVersion;

    // Get the latest version from the registry
    const serverDetails = await mcpRegistryService.getServerDetails(serverName);
    if (!serverDetails) {
      throw new Error(`Server "${serverName}" not found in registry`);
    }

    // Stop the server if running
    const wasRunning = mcpServer.status === 'running';
    if (wasRunning) {
      await this.stopServer(spriteId, serverName);
    }

    // Get install command for the new version
    const installCommand = mcpRegistryService.getInstallCommand(serverDetails);
    const runCommand = mcpRegistryService.getRunCommand(serverDetails);

    // Run the update (reinstall with latest version)
    if (installCommand) {
      try {
        const result = await this.execOnSprite(sprite, installCommand, 120000);
        if (result.exitCode !== 0) {
          throw new Error(`Update failed: ${result.stderr || result.stdout}`);
        }
      } catch (error) {
        await mcpServer.update({
          status: 'error',
          errorMessage: `Update failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        throw error;
      }
    }

    // Update the server record with new version and commands
    await mcpServer.update({
      packageVersion: serverDetails.version,
      latestVersion: serverDetails.version,
      lastUpdateCheck: new Date(),
      installCommand: installCommand || mcpServer.installCommand,
      runCommand: runCommand || mcpServer.runCommand,
      status: 'installed',
      errorMessage: null,
    });

    // Restart if it was running before
    if (wasRunning) {
      try {
        await this.startServer(spriteId, serverName);
      } catch {
        // Log but don't fail the update
        console.warn(`[SpriteMcp] Server "${serverName}" updated but failed to restart`);
      }
    }

    console.log(
      `[SpriteMcp] Updated server "${serverName}" from ${previousVersion} to ${serverDetails.version} on sprite ${spriteId}`
    );

    return {
      server: await mcpServer.reload(),
      previousVersion,
      newVersion: serverDetails.version,
    };
  }

  /**
   * Update all servers with available updates
   */
  async updateAllServers(spriteId: string): Promise<{
    updated: Array<{
      serverName: string;
      previousVersion: string | null;
      newVersion: string | null;
    }>;
    failed: Array<{
      serverName: string;
      error: string;
    }>;
  }> {
    const serversWithUpdates = await this.getServersWithUpdates(spriteId);
    const updated: Array<{
      serverName: string;
      previousVersion: string | null;
      newVersion: string | null;
    }> = [];
    const failed: Array<{ serverName: string; error: string }> = [];

    for (const server of serversWithUpdates) {
      try {
        const result = await this.updateServer(spriteId, server.serverName);
        updated.push({
          serverName: server.serverName,
          previousVersion: result.previousVersion,
          newVersion: result.newVersion,
        });
      } catch (error) {
        failed.push({
          serverName: server.serverName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(
      `[SpriteMcp] Updated ${updated.length} servers on sprite ${spriteId}`,
      failed.length > 0 ? `(${failed.length} failed)` : ''
    );

    return { updated, failed };
  }
}

export const spriteMcpService = new SpriteMcpService();
export default spriteMcpService;
