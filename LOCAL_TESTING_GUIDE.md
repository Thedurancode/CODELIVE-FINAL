# Local Testing Guide for @claude GitHub Actions

Complete guide to testing the @claude GitHub Actions trigger system on your local machine.

## 🏃 Quick Start

### 1. Start the Backend

```bash
cd backend
npm install
npm run dev
```

Server runs on: **http://localhost:3001**

### 2. Verify Service is Running

```bash
curl http://localhost:3001/api/github/status
```

Expected response:
```json
{
  "success": true,
  "data": {
    "configured": true,
    "user": {
      "login": "your-github-username",
      "name": "Your Name",
      "avatar_url": "..."
    },
    "org": null
  }
}
```

---

## 🧪 Test Without GitHub (Command Parsing)

Test command parsing without triggering actual workflows:

### Parse Simple Command

```bash
curl -X POST http://localhost:3001/api/github-actions/parse-command \
  -H "Content-Type: application/json" \
  -d '{"comment": "@claude deploy"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "command": "deploy",
    "workflow": "deploy.yml"
  }
}
```

### Parse Complex Command

```bash
curl -X POST http://localhost:3001/api/github-actions/parse-command \
  -H "Content-Type: application/json" \
  -d '{"comment": "@claude deploy environment=production version=1.2.3 --ref main"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "command": "deploy",
    "workflow": "deploy.yml",
    "ref": "main",
    "inputs": {
      "environment": "production",
      "version": "1.2.3"
    }
  }
}
```

---

## 🔧 Test Workflow Triggering (Requires GitHub Token)

### List Available Workflows

```bash
curl "http://localhost:3001/api/github-actions/workflows?owner=YOUR_ORG&repo=YOUR_REPO"
```

### Manually Trigger a Workflow

```bash
curl -X POST http://localhost:3001/api/github-actions/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "YOUR_ORG",
    "repo": "YOUR_REPO",
    "workflowId": "claude-deploy.yml",
    "ref": "main",
    "inputs": {
      "environment": "staging",
      "version": "test-local"
    }
  }'
```

Response:
```json
{
  "success": true,
  "message": "Workflow claude-deploy.yml triggered successfully",
  "runUrl": "https://github.com/YOUR_ORG/YOUR_REPO/actions/runs/123456"
}
```

### Check Workflow Run Status

```bash
curl "http://localhost:3001/api/github-actions/runs/123456?owner=YOUR_ORG&repo=YOUR_REPO"
```

---

## 🌐 Test Full Webhook Flow (ngrok)

To test the complete flow with actual GitHub webhooks:

### 1. Install ngrok

```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

### 2. Start ngrok Tunnel

```bash
ngrok http 3001
```

You'll see:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3001
```

### 3. Configure GitHub Webhook

1. Go to your repo: **Settings → Webhooks → Add webhook**
2. Payload URL: `https://abc123.ngrok.io/api/webhooks/github`
3. Content type: `application/json`
4. Secret: Your `GITHUB_WEBHOOK_SECRET`
5. Events: ✓ Issues, ✓ Issue comments

### 4. Test Live

Comment on a GitHub issue:
```
@claude deploy
```

Watch your terminal to see:
```
📨 GitHub webhook received: issue_comment (delivery: xyz...)
🤖 @claude mentioned in issue #42
[GitHubActions] Parsed command: { command: 'deploy', workflow: 'deploy.yml' }
[GitHubActions] Triggered workflow deploy.yml on owner/repo@main
```

---

## 🎭 Mock GitHub Webhook Locally

Test webhook handler without ngrok:

### Create Test Payload

Save as `test-webhook-payload.json`:

```json
{
  "action": "created",
  "issue": {
    "number": 42,
    "title": "Test Issue",
    "body": "Test issue body",
    "state": "open",
    "html_url": "https://github.com/owner/repo/issues/42",
    "user": {
      "login": "testuser",
      "type": "User"
    }
  },
  "comment": {
    "id": 123456,
    "body": "@claude deploy environment=staging",
    "created_at": "2026-02-05T12:00:00Z",
    "user": {
      "login": "testuser",
      "type": "User"
    }
  },
  "repository": {
    "full_name": "YOUR_ORG/YOUR_REPO",
    "html_url": "https://github.com/YOUR_ORG/YOUR_REPO",
    "owner": {
      "login": "YOUR_ORG"
    }
  }
}
```

### Send Mock Webhook

```bash
curl -X POST http://localhost:3001/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issue_comment" \
  -H "X-GitHub-Delivery: test-123" \
  -d @test-webhook-payload.json
```

**Note**: This will fail signature verification unless you:
1. Set `NODE_ENV=development` (which allows unsigned webhooks)
2. Or generate a valid signature (see below)

---

## 🔐 Generate Valid Webhook Signature (Optional)

If you want to test signature verification locally:

### Create Signature Script

Save as `sign-webhook.js`:

```javascript
const crypto = require('crypto');
const fs = require('fs');

const secret = process.env.GITHUB_WEBHOOK_SECRET || 'your-secret';
const payload = fs.readFileSync('test-webhook-payload.json', 'utf8');

const signature = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

console.log('X-Hub-Signature-256:', signature);
```

### Run It

```bash
node sign-webhook.js
```

### Use the Signature

```bash
curl -X POST http://localhost:3001/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issue_comment" \
  -H "X-GitHub-Delivery: test-123" \
  -H "X-Hub-Signature-256: sha256=YOUR_GENERATED_SIGNATURE" \
  -d @test-webhook-payload.json
```

---

## 🐛 Debug Mode

### Enable Verbose Logging

Add to your `.env`:

```bash
NODE_ENV=development
DEBUG=github:*
```

Restart the server:

```bash
cd backend
npm run dev
```

You'll see detailed logs:

```
[GitHubActions] Parsed command: { ... }
[GitHubActions] Triggered workflow deploy.yml on owner/repo@main
✅ GitHubActionsService initialized
```

### Check Service Status

```bash
curl http://localhost:3001/api/health
```

---

## 📋 Testing Checklist

- [ ] Backend server running on port 3001
- [ ] `GITHUB_TOKEN` configured with `workflow` scope
- [ ] Can parse commands: `POST /api/github-actions/parse-command`
- [ ] Can list workflows: `GET /api/github-actions/workflows`
- [ ] Can trigger workflows: `POST /api/github-actions/trigger`
- [ ] Can receive mock webhooks
- [ ] (Optional) ngrok tunnel for live GitHub webhooks

---

## 🎯 Common Test Scenarios

### Scenario 1: Simple Deploy

**Command**: `@claude deploy`

**Test**:
```bash
curl -X POST http://localhost:3001/api/github-actions/parse-command \
  -H "Content-Type: application/json" \
  -d '{"comment": "@claude deploy"}'
```

**Expected**:
```json
{
  "success": true,
  "data": {
    "command": "deploy",
    "workflow": "deploy.yml"
  }
}
```

### Scenario 2: Deploy with Environment

**Command**: `@claude deploy environment=production`

**Test**:
```bash
curl -X POST http://localhost:3001/api/github-actions/parse-command \
  -H "Content-Type: application/json" \
  -d '{"comment": "@claude deploy environment=production"}'
```

**Expected**:
```json
{
  "success": true,
  "data": {
    "command": "deploy",
    "workflow": "deploy.yml",
    "inputs": {
      "environment": "production"
    }
  }
}
```

### Scenario 3: Run Specific Workflow on Branch

**Command**: `@claude run test.yml --ref develop suite=integration`

**Test**:
```bash
curl -X POST http://localhost:3001/api/github-actions/parse-command \
  -H "Content-Type: application/json" \
  -d '{"comment": "@claude run test.yml --ref develop suite=integration"}'
```

**Expected**:
```json
{
  "success": true,
  "data": {
    "command": "run",
    "workflow": "test.yml",
    "ref": "develop",
    "inputs": {
      "suite": "integration"
    }
  }
}
```

### Scenario 4: Multiple Parameters

**Command**: `@claude deploy --ref staging environment=staging version=1.0.0 dry_run=true`

**Test**:
```bash
curl -X POST http://localhost:3001/api/github-actions/parse-command \
  -H "Content-Type: application/json" \
  -d '{"comment": "@claude deploy --ref staging environment=staging version=1.0.0 dry_run=true"}'
```

**Expected**:
```json
{
  "success": true,
  "data": {
    "command": "deploy",
    "workflow": "deploy.yml",
    "ref": "staging",
    "inputs": {
      "environment": "staging",
      "version": "1.0.0",
      "dry_run": "true"
    }
  }
}
```

---

## 🚨 Troubleshooting

### Issue: "GitHub integration not configured"

**Solution**: Add to `.env`:
```bash
GITHUB_TOKEN=ghp_your_token_here
```

Make sure token has `workflow` scope.

### Issue: "Workflow not found"

**Solution**:
1. Check workflow file exists: `.github/workflows/claude-deploy.yml`
2. Workflow must have `workflow_dispatch` trigger
3. Workflow must be on the branch you're targeting

### Issue: "Invalid webhook signature"

**Solution**:
- In development: Set `NODE_ENV=development` to skip verification
- In production: Generate valid signature (see guide above)

### Issue: "Cannot trigger workflow"

**Solution**:
1. Verify `GITHUB_TOKEN` has `workflow` scope
2. Check repository exists and token has access
3. Ensure workflow is enabled in GitHub Actions settings

---

## 📊 Full Local Test Flow

### Step-by-Step

1. **Start Backend**
   ```bash
   cd backend && npm run dev
   ```

2. **Parse Command**
   ```bash
   curl -X POST http://localhost:3001/api/github-actions/parse-command \
     -H "Content-Type: application/json" \
     -d '{"comment": "@claude deploy environment=staging"}'
   ```

3. **Trigger Workflow**
   ```bash
   curl -X POST http://localhost:3001/api/github-actions/trigger \
     -H "Content-Type: application/json" \
     -d '{
       "owner": "YOUR_ORG",
       "repo": "YOUR_REPO",
       "workflowId": "claude-deploy.yml",
       "inputs": {"environment": "staging"}
     }'
   ```

4. **Check Status**
   ```bash
   curl "http://localhost:3001/api/github-actions/runs/RUN_ID?owner=YOUR_ORG&repo=YOUR_REPO"
   ```

5. **Verify on GitHub**
   - Go to: `https://github.com/YOUR_ORG/YOUR_REPO/actions`
   - See your workflow running!

---

## 🎉 Success Indicators

You know it's working when:

- ✅ Command parsing returns valid JSON
- ✅ Workflow trigger returns `"success": true`
- ✅ You see workflow run URL in response
- ✅ Workflow appears in GitHub Actions tab
- ✅ (If using webhooks) Comment triggers workflow automatically

---

## 📚 Additional Resources

- **API Docs**: http://localhost:3001/api-docs
- **Full Guide**: `docs/CLAUDE_GITHUB_ACTIONS.md`
- **Workflow Examples**: `.github/workflows/`

Need help? Check the logs in your terminal where `npm run dev` is running!
