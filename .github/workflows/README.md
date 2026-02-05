# Claude GitHub Actions Workflows

This directory contains two types of Claude-powered workflows:
1. **Autonomous Agent** - Uses Anthropic's official action to write code and create PRs
2. **Manual Triggers** - Executes predefined workflows (deploy, test, build)

## 🤖 Autonomous Coding Agent (NEW)

### Claude Autonomous Agent (`claude-autonomous-agent.yml`)

**The main feature** - Uses Anthropic's official `claude-code-action` to automatically work on issues and create PRs.

**Triggers:**
- `@claude work on this` - Analyzes issue and implements solution
- `@claude implement this` - Writes code based on requirements
- `@claude fix this bug` - Debugs and fixes issues
- Issue assignment to Claude

**What it does:**
1. Clones your repository
2. Analyzes the issue completely
3. Writes/modifies code to solve the problem
4. Runs tests to verify changes
5. Creates a pull request with detailed description
6. Links PR back to original issue

**Example:**
```
@claude work on this

Please implement the password reset feature described in the issue.
Make sure to follow our existing authentication patterns.
```

### Claude PR Review (`claude-pr-review.yml`)

Automatically reviews pull requests with intelligent analysis.

**Trigger:** PR opened, or `@claude review`

**Reviews:**
- Code quality and best practices
- Security vulnerabilities
- Performance issues
- TypeScript type safety

### Claude Issue Triage (`claude-issue-triage.yml`)

Automatically categorizes and analyzes new issues.

**Trigger:** New issue opened, or `@claude triage`

---

## 🚀 Manual Trigger Workflows

These workflows execute predefined tasks:

### 1. Deploy Workflow (`claude-deploy.yml`)

**Trigger**: `@claude deploy`

**Parameters**:
- `environment` - Deployment target (development, staging, production)
- `version` - Version to deploy (default: latest)

**Examples**:
```
@claude deploy
@claude deploy environment=staging
@claude deploy environment=production version=1.2.3
```

### 2. Test Workflow (`claude-test.yml`)

**Trigger**: `@claude test`

**Parameters**:
- `suite` - Test suite to run (all, unit, integration, e2e)
- `coverage` - Generate coverage report (true/false)

**Examples**:
```
@claude test
@claude test suite=unit
@claude test suite=integration coverage=true
```

### 3. Build Workflow (`claude-build.yml`)

**Trigger**: `@claude build`

**Parameters**:
- `target` - Build target (all, backend, frontend)

**Examples**:
```
@claude build
@claude build target=frontend
@claude build target=backend
```

## Advanced Usage

### Specify Branch

```
@claude run deploy.yml --ref staging
@claude deploy --branch main
```

### Full Command Syntax

```
@claude run <workflow-file> --ref <branch> param1=value1 param2=value2
```

## How It Works

1. Comment on any GitHub issue with `@claude <command>`
2. Platform webhook receives the comment
3. Command is parsed and workflow is triggered
4. Workflow runs with specified inputs
5. Results are posted back to the issue

## Response Format

When you use `@claude`, you'll get a response like:

```
✅ Claude Response

Workflow deploy.yml triggered successfully

🔄 Workflow Run: Claude Deploy #123
Status: queued

---
Automated by Claude
```

The workflow itself will also post updates to the issue when it completes.

## Creating Custom Workflows

To create your own workflow that works with `@claude`:

1. Create a file in `.github/workflows/` (e.g., `claudecode-custom.yml`)
2. Add `workflow_dispatch` trigger with your inputs
3. Include these standard inputs:
   ```yaml
   inputs:
     issue_number:
       description: 'GitHub issue number'
       required: false
       type: string

     triggered_by:
       description: 'Trigger source'
       required: false
       default: 'manual'
       type: string

     comment_id:
       description: 'Comment ID'
       required: false
       type: string
   ```
4. Use `actions/github-script` to post status updates back to the issue

Trigger with: `@claude custom` or `@claude run custom.yml`

## Setup Instructions

### Quick Setup for Autonomous Agent

```bash
# In Claude Code CLI
claude
/install-github-app
```

Or manually:
1. Install: https://github.com/apps/claude
2. Add secret: `ANTHROPIC_API_KEY` to repository settings
3. Done! Start using `@claude` in issues

### Full Setup for Manual Triggers

1. Add `workflow` scope to GitHub token
2. Configure webhooks (for production)
3. See setup guide for details

## Documentation

- **🆕 Autonomous Agent Setup**: [docs/CLAUDE_AUTONOMOUS_AGENT_SETUP.md](../../docs/CLAUDE_AUTONOMOUS_AGENT_SETUP.md)
- **Manual Triggers Guide**: [docs/CLAUDE_GITHUB_ACTIONS.md](../../docs/CLAUDE_GITHUB_ACTIONS.md)
- **Local Testing**: [LOCAL_TESTING_GUIDE.md](../../LOCAL_TESTING_GUIDE.md)
- **Project Guidelines**: [CLAUDE.md](../../CLAUDE.md)
- **API Documentation**: http://localhost:3001/api-docs

## See Also

- Official Action: https://github.com/anthropics/claude-code-action
- Claude Code Docs: https://code.claude.com/docs/en/github-actions
