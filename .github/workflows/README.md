# Claude GitHub Actions Workflows

These workflows can be triggered using `@claude` mentions in GitHub issue comments.

## Available Workflows

### 1. Deploy Workflow (`claudecode-deploy.yml`)

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

### 2. Test Workflow (`claudecode-test.yml`)

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

### 3. Build Workflow (`claudecode-build.yml`)

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

## See Also

- [Full Documentation](../../docs/CLAUDECODE_GITHUB_ACTIONS.md)
- [API Documentation](http://localhost:3001/api-docs)
