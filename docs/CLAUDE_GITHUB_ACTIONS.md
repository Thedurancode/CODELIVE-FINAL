# @claude GitHub Actions Integration

Trigger GitHub Actions workflows directly from issue comments using `@claude` mentions.

## 🚀 Quick Start

### 1. Add Workflow Files

Add one or more workflow files to `.github/workflows/` in your repository. Examples:

- `.github/workflows/claudecode-deploy.yml` - Deployment workflow
- `.github/workflows/claudecode-test.yml` - Test runner
- `.github/workflows/claudecode-build.yml` - Build workflow

See [Example Workflows](#example-workflows) below.

### 2. Configure GitHub Webhook

Your repository webhook should already be configured if you're using this platform. If not:

1. Go to **Settings → Webhooks** in your GitHub repo
2. Add webhook: `https://your-domain.com/api/webhooks/github`
3. Content type: `application/json`
4. Secret: Set `GITHUB_WEBHOOK_SECRET` in your environment
5. Events: ✓ Issues, ✓ Issue comments, ✓ Pull requests

### 3. Use @claude in Comments

Comment on any GitHub issue:

```
@claude deploy environment=production
```

Claude will:
- ✅ Parse your command
- ✅ Trigger the corresponding workflow
- ✅ Post a response comment with the workflow run link

---

## 📝 Command Syntax

### Simple Commands

```
@claude deploy
@claude test
@claude build
```

Triggers workflows named: `deploy.yml`, `test.yml`, `build.yml`

### Complex Commands

```
@claude run deploy.yml environment=production version=1.2.3
```

- Workflow: `deploy.yml`
- Inputs: `environment=production`, `version=1.2.3`

### With Branch/Ref

```
@claude run deploy.yml --ref staging environment=staging
@claude deploy --branch main
```

- Workflow: `deploy.yml`
- Branch: `staging` or `main`
- Inputs: `environment=staging`

---

## 🎯 Command Parsing Rules

| Command | Workflow | Ref | Inputs |
|---------|----------|-----|--------|
| `@claude deploy` | `deploy.yml` | `main` | - |
| `@claude run test.yml` | `test.yml` | `main` | - |
| `@claude deploy env=prod` | `deploy.yml` | `main` | `env=prod` |
| `@claude run deploy.yml --ref dev` | `deploy.yml` | `dev` | - |
| `@claude deploy --ref staging env=staging version=1.0` | `deploy.yml` | `staging` | `env=staging`, `version=1.0` |

---

## Example Workflows

### Deploy Workflow

`.github/workflows/claudecode-deploy.yml`:

```yaml
name: Claude Deploy

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: false
        default: 'production'
        type: choice
        options:
          - development
          - staging
          - production

      version:
        description: 'Version to deploy'
        required: false
        default: 'latest'
        type: string

      # These are auto-filled by Claude
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

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy to ${{ inputs.environment }}
        run: |
          echo "Deploying to ${{ inputs.environment }}..."
          # Your deployment commands here

      - name: Comment on issue (success)
        if: success() && inputs.issue_number
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: ${{ inputs.issue_number }},
              body: `✅ **Deployment Successful**\n\n` +
                    `Environment: \`${{ inputs.environment }}\`\n` +
                    `Version: \`${{ inputs.version }}\`\n` +
                    `Workflow: [View run](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})`
            });

      - name: Comment on issue (failure)
        if: failure() && inputs.issue_number
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: ${{ inputs.issue_number }},
              body: `❌ **Deployment Failed**\n\n` +
                    `Workflow: [View run](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})`
            });
```

### Test Workflow

`.github/workflows/claudecode-test.yml`:

```yaml
name: Claude Test

on:
  workflow_dispatch:
    inputs:
      suite:
        description: 'Test suite to run'
        required: false
        default: 'all'
        type: choice
        options:
          - all
          - unit
          - integration
          - e2e

      issue_number:
        required: false
        type: string

      triggered_by:
        required: false
        default: 'manual'
        type: string

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Run tests
        run: |
          npm ci
          npm test -- --suite=${{ inputs.suite }}

      - name: Comment test results
        if: always() && inputs.issue_number
        uses: actions/github-script@v7
        with:
          script: |
            const status = '${{ job.status }}';
            const emoji = status === 'success' ? '✅' : '❌';

            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: ${{ inputs.issue_number }},
              body: `${emoji} **Test Suite: \`${{ inputs.suite }}\`**\n\n` +
                    `Status: ${status}\n` +
                    `Workflow: [View run](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})`
            });
```

---

## API Endpoints

### List Workflows

```bash
GET /api/github-actions/workflows?owner=myorg&repo=myrepo
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 12345,
      "name": "Claude Deploy",
      "path": ".github/workflows/claudecode-deploy.yml",
      "state": "active",
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

### Trigger Workflow (Manual)

```bash
POST /api/github-actions/trigger
```

Request:
```json
{
  "owner": "myorg",
  "repo": "myrepo",
  "workflowId": "deploy.yml",
  "ref": "main",
  "inputs": {
    "environment": "production",
    "version": "1.2.3"
  }
}
```

Response:
```json
{
  "success": true,
  "message": "Workflow deploy.yml triggered successfully",
  "runUrl": "https://github.com/myorg/myrepo/actions/runs/123456"
}
```

### Get Workflow Run Status

```bash
GET /api/github-actions/runs/123456?owner=myorg&repo=myrepo
```

Response:
```json
{
  "success": true,
  "data": {
    "id": 123456,
    "name": "Claude Deploy",
    "status": "completed",
    "conclusion": "success",
    "html_url": "https://github.com/myorg/myrepo/actions/runs/123456",
    "created_at": "2026-02-05T10:00:00Z",
    "head_branch": "main"
  }
}
```

### Cancel Workflow Run

```bash
POST /api/github-actions/runs/123456/cancel
```

Request:
```json
{
  "owner": "myorg",
  "repo": "myrepo"
}
```

### Parse Command (Test)

```bash
POST /api/github-actions/parse-command
```

Request:
```json
{
  "comment": "@claude deploy environment=production version=1.2.3"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "command": "deploy",
    "workflow": "deploy.yml",
    "inputs": {
      "environment": "production",
      "version": "1.2.3"
    }
  }
}
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ CLAUDECODE GITHUB ACTIONS FLOW                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Developer comments on GitHub issue:                     │
│     "@claude deploy environment=production"             │
│                                                             │
│  2. GitHub sends webhook to platform:                       │
│     POST /api/webhooks/github                               │
│     Event: issue_comment.created                            │
│                                                             │
│  3. Webhook handler detects @claude mention             │
│     githubWebhookRoutes.ts:268                              │
│                                                             │
│  4. GitHubActionsService parses command:                    │
│     - Command: "deploy"                                     │
│     - Workflow: "deploy.yml"                                │
│     - Inputs: { environment: "production" }                 │
│                                                             │
│  5. Trigger workflow via GitHub API:                        │
│     POST /repos/:owner/:repo/actions/workflows/deploy.yml/dispatches │
│                                                             │
│  6. GitHub Actions runs workflow:                           │
│     - Receives inputs (environment, issue_number, etc.)     │
│     - Executes deployment steps                             │
│     - Comments back on issue with status                    │
│                                                             │
│  7. Platform posts response comment:                        │
│     "✅ Claude Response                                 │
│      Workflow deploy.yml triggered successfully            │
│      🔄 Workflow Run: [Link]                                │
│      Status: queued"                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Environment Setup

Add to your `.env`:

```bash
# GitHub Integration (Required)
GITHUB_TOKEN=ghp_your_github_token_here

# GitHub Webhook (Required for @claude)
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
```

**GitHub Token Permissions:**

The token needs:
- ✅ `repo` (Full control of private repositories)
- ✅ `workflow` (Update GitHub Action workflows)
- ✅ `write:discussion` (Read and write discussions)

---

## Security Considerations

### Authentication
- Webhook signatures are verified using `GITHUB_WEBHOOK_SECRET`
- GitHub API calls use authenticated `GITHUB_TOKEN`
- Workflows run with repository's `GITHUB_TOKEN` (scoped to repo)

### Authorization
- Only users with write access can trigger workflows via comments
- Workflow permissions are controlled by GitHub Actions settings
- Sensitive inputs should use GitHub Secrets

### Best Practices
1. **Use environment protection rules** for production deployments
2. **Require manual approval** for critical workflows
3. **Limit workflow permissions** to minimum required
4. **Validate inputs** in workflow files
5. **Don't expose secrets** in comments or logs

---

## Troubleshooting

### Command Not Recognized

**Issue**: Comment `@claude deploy` doesn't trigger workflow

**Solutions**:
- ✅ Ensure workflow file exists: `.github/workflows/deploy.yml`
- ✅ Verify workflow has `workflow_dispatch` trigger
- ✅ Check webhook is configured and receiving events
- ✅ Confirm `GITHUB_TOKEN` has `workflow` scope

### Workflow Not Triggered

**Issue**: Response comment says "triggered" but workflow doesn't run

**Solutions**:
- ✅ Check workflow file syntax (YAML errors prevent dispatch)
- ✅ Verify `ref` (branch) exists in repository
- ✅ Ensure workflow is enabled in GitHub Actions settings
- ✅ Check repository Actions tab for disabled workflows

### Permission Denied

**Issue**: API returns 403 or 404 errors

**Solutions**:
- ✅ Verify `GITHUB_TOKEN` has correct permissions
- ✅ Check token hasn't expired
- ✅ Confirm repository access for token owner
- ✅ For organizations, check org-level restrictions

### Workflow Inputs Not Received

**Issue**: Workflow runs but inputs are empty

**Solutions**:
- ✅ Ensure workflow defines inputs under `workflow_dispatch`
- ✅ Check input names match (case-sensitive)
- ✅ Verify inputs are passed in `@claude` command
- ✅ Check workflow file uses `${{ inputs.input_name }}`

---

## Advanced Usage

### Custom Workflow Inputs

Define any custom inputs in your workflow:

```yaml
on:
  workflow_dispatch:
    inputs:
      custom_param:
        description: 'My custom parameter'
        required: false
        type: string
```

Trigger with:
```
@claude run my-workflow.yml custom_param=value
```

### Multiple Commands

You can chain multiple workflows:

```
Issue Comment #1:
@claude test

Issue Comment #2 (after tests pass):
@claude deploy environment=staging

Issue Comment #3 (after staging verified):
@claude deploy environment=production
```

### Workflow Status Callbacks

Use `actions/github-script` to post detailed status updates:

```yaml
- name: Custom status update
  uses: actions/github-script@v7
  with:
    script: |
      const { data: run } = await github.rest.actions.getWorkflowRun({
        owner: context.repo.owner,
        repo: context.repo.repo,
        run_id: context.runId
      });

      await github.rest.issues.createComment({
        issue_number: ${{ inputs.issue_number }},
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `📊 **Workflow Progress**\n\n` +
              `Jobs completed: ${run.jobs.filter(j => j.conclusion === 'success').length}/${run.jobs.length}\n` +
              `Time elapsed: ${Math.round((new Date() - new Date(run.created_at)) / 1000)}s`
      });
```

---

## Examples

### Deploy to Production

**Issue Comment**:
```
@claude deploy environment=production version=1.2.3
```

**Claude Response**:
```
✅ Claude Response

Workflow deploy.yml triggered successfully

🔄 Workflow Run: Claude Deploy #123
Status: queued

---
Automated by Claude
```

**Workflow Updates Issue**:
```
✅ Deployment Successful

Environment: `production`
Version: `1.2.3`
Workflow: View run
```

### Run Tests

**Issue Comment**:
```
@claude test suite=integration
```

**Result**:
```
✅ Test Suite: `integration`

Status: success
Workflow: View run
```

---

## Summary

| Feature | Status |
|---------|--------|
| Trigger workflows from comments | ✅ |
| Parse command with inputs | ✅ |
| Auto-fill issue context | ✅ |
| Status response comments | ✅ |
| Multiple workflow support | ✅ |
| Branch/ref selection | ✅ |
| Error handling | ✅ |
| API endpoints | ✅ |
| Webhook integration | ✅ |
| Security (signature verification) | ✅ |

---

**Need help?** Check the [API documentation](http://localhost:3001/api-docs) or review the [example workflows](.github/workflows/).
