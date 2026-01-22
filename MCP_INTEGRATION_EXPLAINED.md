# MCP (Model Context Protocol) Integration Explained

## Overview

**MCP (Model Context Protocol)** is an open protocol that enables AI agents to connect to external systems and use their tools. It's like a "plugin system" for AI - allowing the agent to interact with third-party services, databases, APIs, and more through a standardized interface.

In this application, MCP is integrated to extend the AI agent's capabilities with 20+ pre-configured integrations including GitHub, Gmail, Slack, Notion, PostgreSQL, and more.

---

## Architecture

### High-Level Flow

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Frontend      │      │   Backend        │      │  MCP Servers    │
│   (Settings UI) │◄────►│   (MCP Client)   │◄────►│  (External)     │
│                 │      │                  │      │                 │
└─────────────────┘      └────────┬─────────┘      └─────────────────┘
                                   │
                                   │
                                   ▼
                          ┌─────────────────┐
                          │  Tool Registry  │
                          │  (LangChain)    │
                          └─────────────────┘
```

### Components

#### 1. **Frontend Component** (`MCPServersSettings.tsx`)

Located at: `frontend/src/components/settings/MCPServersSettings.tsx`

**Purpose:** Provides a user-friendly interface for configuring MCP servers

**Features:**
- **Quick Add Templates**: One-click setup for 20+ popular services (GitHub, Slack, Notion, etc.)
- **Custom Server Configuration**: Manual configuration for any MCP-compatible server
- **Connection Testing**: Test connections before saving
- **Real-time Status**: Shows connection status and tool counts for each server
- **Environment Variables**: Secure configuration of API keys and secrets

**Key Sections:**
1. **Global Enable/Disable**: Toggle MCP integration on/off
2. **Template Gallery**: Pre-built configurations for popular services
3. **Server List**: All configured servers with status badges
4. **Configuration Form**: Per-server settings (transport type, command, args, env vars)

#### 2. **Backend Service** (`MCPClientService.ts`)

Located at: `backend/src/services/agent/mcp/MCPClientService.ts`

**Purpose:** Manages connections to MCP servers and registers their tools

**Key Responsibilities:**

1. **Connection Management**
   - Connects to MCP servers via `stdio` (local) or `HTTP` (remote)
   - Handles connection timeouts and retries
   - Auto-reconnects on failure with exponential backoff

2. **Tool Discovery**
   - Queries each MCP server for available tools
   - Converts tool schemas from JSON Schema to Zod
   - Registers tools with the LangChain tool registry

3. **Tool Execution**
   - Routes tool calls to the appropriate MCP server
   - Handles errors and connection failures gracefully
   - Returns results in a standardized format

4. **Settings Management**
   - Watches for configuration changes every 30 seconds
   - Dynamically adds/removes servers when settings change
   - Instant refresh when settings are saved

#### 3. **Schema Converter** (`schemaConverter.ts`)

Located at: `backend/src/services/agent/mcp/schemaConverter.ts`

**Purpose:** Converts JSON Schema (MCP standard) to Zod schemas (LangChain requirement)

**Supports:**
- Primitive types: string, number, integer, boolean, array, object
- Complex types: oneOf, anyOf, allOf, enum, const
- Constraints: minLength, maxLength, pattern, minimum, maximum
- Formats: email, URL, UUID, date-time
- Nested objects and arrays

#### 4. **Type Definitions** (`types.ts`)

Located at: `backend/src/services/agent/mcp/types.ts`

**Purpose:** TypeScript definitions for MCP configuration and state

**Key Types:**
- `MCPServerConfig`: Server configuration structure
- `MCPServerState`: Runtime state (connection status, tools, errors)
- `MCPToolDefinition`: Tool schema from MCP server
- `MCPClientHealthStatus`: Overall service health

#### 5. **Settings Integration** (`Settings.ts`)

Located at: `backend/src/models/Settings.ts`

**Purpose:** Persists MCP configuration in the database

**Settings:**
- `mcp.enabled`: Global enable/disable flag (boolean)
- `mcp.servers`: Array of server configurations (JSON)

---

## How It Works

### Initialization Flow

```typescript
// 1. During application startup
await initializeAgentSystem();

// 2. Agent system initializes MCP client
await mcpClientService.initialize();

// 3. MCP client checks if enabled
const enabled = await settingsService.isEnabled(MCP_SETTINGS.ENABLED);

// 4. Loads server configurations from database
const configs = await loadServerConfigs();

// 5. Connects to each enabled server in parallel
await Promise.allSettled(
  configs
    .filter(c => c.enabled)
    .map(c => connectServer(c))
);

// 6. Discovers tools from each server
const tools = await client.listTools();

// 7. Registers tools with LangChain tool registry
toolRegistry.register(toolDef);
```

### Tool Execution Flow

```typescript
// 1. Agent decides to use a tool
const toolName = "github_create_issue";

// 2. Tool registry routes to MCP handler
await toolRegistry.execute(toolName, input, context);

// 3. MCP client calls the external server
await client.callTool({
  name: "create_issue",
  arguments: { title, body, repo }
});

// 4. Returns result to agent
return success({ issue_number: 123, url: "..." });
```

---

## Transport Types

### STDIO (Standard Input/Output)

**Use Case:** Local MCP servers running as subprocesses

**Configuration:**
```json
{
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
  }
}
```

**How it works:**
1. Backend spawns a child process with the given command
2. Communicates via stdin/stdout using JSON-RPC protocol
3. Server runs alongside the application

### HTTP (SSE - Server-Sent Events)

**Use Case:** Remote MCP servers accessed over network

**Configuration:**
```json
{
  "transport": "http",
  "url": "https://mcp.example.com/sse",
  "apiKey": "sk-..."
}
```

**How it works:**
1. Backend establishes SSE connection to URL
2. Exchanges JSON-RPC messages over HTTP
3. Server can be hosted anywhere

---

## Available Pre-Configured Integrations

The application includes **20+ pre-built templates** for popular services:

| Service | Description | Tools |
|---------|-------------|-------|
| **GitHub** | Repo management, issues, PRs | `create_issue`, `list_issues`, `create_pull_request` |
| **Gmail** | Send, search, manage emails | `send_email`, `search_messages`, `read_thread` |
| **Google Calendar** | Events, availability | `create_event`, `list_events`, `check_availability` |
| **Google Meet** | Video meetings | `create_meeting`, `get_recording` |
| **Slack** | Messages, channels | `send_message`, `list_channels`, `add_reaction` |
| **Notion** | Pages, databases | `search_pages`, `create_page`, `query_database` |
| **PostgreSQL** | Database queries | `execute_query`, `list_tables`, `get_schema` |
| **Filesystem** | Local file operations | `read_file`, `write_file`, `list_directory` |
| **Puppeteer** | Browser automation | `screenshot`, `scrape_page`, `click_element` |
| **Playwright** | Browser testing | `test_page`, `fill_form`, `navigate` |
| **Brave Search** | Web search | `search_web`, `search_local` |
| **Google Drive** | Cloud files | `list_files`, `read_file`, `search_drive` |
| **Discord** | Bot messages | `send_message`, `create_channel` |
| **Telegram** | Bot messages | `send_message`, `send_photo` |
| **Sentry** | Error tracking | `list_issues`, `get_error_details` |
| **Linear** | Issue tracking | `create_issue`, `list_projects` |
| **Airtable** | Database operations | `create_record`, `update_record` |
| **Spotify** | Music control | `play_track`, `search_tracks` |
| **Memory** | Persistent memory | `store_memory`, `recall_memory` |
| **Sequential Thinking** | Reasoning | `think_step_by_step` |

---

## Configuration Examples

### Example 1: GitHub Integration

```json
{
  "id": "mcp-github-001",
  "name": "GitHub",
  "enabled": true,
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "toolPrefix": "github",
  "timeout": 30000,
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxx"
  }
}
```

**Resulting Tools:**
- `github_create_issue`
- `github_list_issues`
- `github_create_pull_request`
- `github_add_comment`

### Example 2: Slack Integration

```json
{
  "id": "mcp-slack-001",
  "name": "Slack",
  "enabled": true,
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-slack"],
  "toolPrefix": "slack",
  "timeout": 30000,
  "env": {
    "SLACK_BOT_TOKEN": "xoxb-xxxxxxxxxxxx",
    "SLACK_TEAM_ID": "T123456789"
  }
}
```

### Example 3: Custom HTTP Server

```json
{
  "id": "mcp-custom-001",
  "name": "My Custom MCP Server",
  "enabled": true,
  "transport": "http",
  "url": "https://my-mcp-server.com/sse",
  "apiKey": "sk-xxxxxxxxxxxx",
  "toolPrefix": "custom",
  "timeout": 45000
}
```

---

## Using MCP Tools in the Agent

Once configured, MCP tools are automatically available to the AI agent:

```
User: "Create a GitHub issue for the bug in the login form"

Agent's internal reasoning:
1. Identify available tools → finds "github_create_issue"
2. Extract parameters → title, body, repository
3. Execute tool → calls MCP GitHub server
4. Get result → issue #123 created at https://...
5. Respond to user → "Issue #123 created successfully"
```

**Behind the scenes:**
```typescript
// Tool is defined in tool registry
{
  name: "github_create_issue",
  description: "Create a new issue in a GitHub repository",
  category: "mcp",
  schema: z.object({
    title: z.string(),
    body: z.string().optional(),
    repo: z.string()
  }),
  handler: async (input, context) => {
    // Routes to MCP client
    return await mcpClientService.executeMCPTool(
      'mcp-github-001',
      'create_issue',
      input,
      context
    );
  }
}
```

---

## Features & Capabilities

### 1. **Dynamic Configuration**
- Add/remove servers without restarting the application
- Settings changes take effect immediately
- 30-second polling for configuration updates

### 2. **Error Resilience**
- Connection failures don't crash the application
- Automatic retry with exponential backoff
- Graceful degradation (agent works without MCP)
- Error messages returned to user

### 3. **Security**
- API keys stored securely in database (encrypted)
- Environment variables isolated per server
- No secrets in logs
- Admin-only configuration access

### 4. **Monitoring**
- Health status endpoint (`/api/settings/mcp/status`)
- Per-server connection status
- Tool count tracking
- Last error information

### 5. **Tool Naming**
- Prefix-based naming avoids conflicts
- Format: `{prefix}_{tool_name}`
- Example: `github_create_issue`, `slack_send_message`

---

## API Endpoints

### Get MCP Status
```
GET /api/settings/mcp/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "initialized": true,
    "enabled": true,
    "serverCount": 3,
    "connectedCount": 2,
    "toolCount": 15,
    "servers": [
      {
        "id": "mcp-github-001",
        "name": "GitHub",
        "status": "connected",
        "toolCount": 5,
        "lastConnected": "2025-01-20T10:30:00Z"
      }
    ]
  }
}
```

### Test Connection
```
POST /api/settings/mcp/test
```

**Body:**
```json
{
  "id": "test-001",
  "name": "Test",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "tools": ["create_issue", "list_issues", ...]
  }
}
```

### Save Settings
```
PUT /api/settings/batch
```

**Body:**
```json
{
  "mcp.enabled": true,
  "mcp.servers": [...]
}
```

**Response:**
```json
{
  "success": true,
  "mcpRefresh": {
    "added": 2,
    "removed": 0,
    "total": 5
  }
}
```

---

## Database Schema

MCP settings are stored in the `settings` table:

```sql
CREATE TABLE settings (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  type VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT NOT NULL
);

-- MCP settings entries
INSERT INTO settings VALUES
('mcp.enabled', true, 'boolean', 'mcp', 'Enable MCP integration'),
('mcp.servers', [...], 'json', 'mcp', 'MCP server configurations');
```

---

## Troubleshooting

### Common Issues

**1. Server won't connect**
- Check the command is correct (e.g., `npx` not `npm`)
- Verify environment variables are set
- Check firewall/network access for HTTP servers
- View error message in server status

**2. Tools not appearing**
- Ensure server is connected (green badge)
- Check tool count in status badge
- Test connection to see available tools
- Verify tool prefix doesn't conflict

**3. Commands fail with "command not found"**
- Ensure the command is available in system PATH
- Use full path if needed: `/usr/local/bin/node`
- For npx, ensure Node.js is installed

**4. HTTP connection timeout**
- Increase timeout value (default 30s)
- Check URL is accessible from server
- Verify API key if required

---

## Best Practices

1. **Use Tool Prefixes**: Avoid naming conflicts between servers
2. **Set Timeouts Appropriately**: Browser tools may need 60s+, simple tools 30s
3. **Test Before Saving**: Use the Test button to verify configuration
4. **Monitor Health**: Check `/api/settings/mcp/status` regularly
5. **Secure Secrets**: Never commit API keys to version control
6. **Start Simple**: Test with one server before adding many
7. **Check Logs**: Backend logs show detailed MCP connection info

---

## Extending the Integration

### Adding a New Custom Template

Edit `frontend/src/components/settings/MCPServersSettings.tsx`:

```typescript
const MCP_TEMPLATES: MCPTemplate[] = [
  // ... existing templates
  {
    id: 'my-service',
    name: 'My Custom Service',
    description: 'Does something cool',
    icon: <MyLogo className="h-8 w-8" />,
    config: {
      name: 'My Service',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@mycompany/mcp-server'],
      toolPrefix: 'my',
      timeout: 30000,
    },
    envVars: [
      { key: 'MY_API_KEY', description: 'API key for My Service', required: true },
    ],
  },
];
```

### Creating a Custom MCP Server

See the official MCP documentation: https://modelcontextprotocol.io

---

## Summary

The MCP integration in this application provides:

✅ **20+ Pre-built integrations** with popular services
✅ **Flexible configuration** via UI
✅ **Automatic tool discovery** and registration
✅ **Error-resilient** with auto-reconnect
✅ **Secure** credential management
✅ **Real-time monitoring** and status
✅ **Zero-downtime** reconfiguration
✅ **Extensible** for custom servers

This allows the AI agent to seamlessly interact with external systems, dramatically expanding its capabilities beyond the core application features.
