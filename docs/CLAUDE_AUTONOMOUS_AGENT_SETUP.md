# Claude Autonomous Agent Setup Guide

This guide will help you set up **Anthropic's official Claude Code action** to automatically work on GitHub issues and create pull requests.

## Overview

With this integration, Claude can:
- ✅ Automatically work on GitHub issues when mentioned with `@claude`
- ✅ Write code to fix bugs and implement features
- ✅ Create pull requests with comprehensive descriptions
- ✅ Review pull requests and provide feedback
- ✅ Triage new issues and add appropriate labels
- ✅ Answer questions about the codebase

## Prerequisites

1. **GitHub Repository** with admin access
2. **Anthropic API Key** from https://console.anthropic.com
3. **GitHub Personal Access Token** (optional, for enhanced features)

## Quick Setup (Recommended)

### Option 1: Using Claude Code CLI

If you have Claude Code installed locally:

```bash
# Open Claude Code
claude

# Run the installation command
/install-github-app
```

This interactive guide will:
1. Help you install the Claude GitHub app
2. Configure repository secrets
3. Set up the necessary permissions

### Option 2: Manual Setup

Follow these steps if you prefer manual configuration:

## Step 1: Install the Claude GitHub App

1. Go to https://github.com/apps/claude
2. Click "Install" or "Configure"
3. Select your repository: `Thedurancode/CODELIVE-FINAL`
4. Grant the following permissions:
   - **Contents**: Read & Write
   - **Issues**: Read & Write
   - **Pull Requests**: Read & Write
   - **Workflows**: Read & Write

## Step 2: Add Anthropic API Key

1. Go to your repository settings:
   ```
   https://github.com/Thedurancode/CODELIVE-FINAL/settings/secrets/actions
   ```

2. Click "New repository secret"

3. Add the following secret:
   - **Name**: `ANTHROPIC_API_KEY`
   - **Value**: Your API key from https://console.anthropic.com

4. Click "Add secret"

## Step 3: Verify Workflow Files

The following workflow files should be in `.github/workflows/`:

- ✅ `claude-autonomous-agent.yml` - Main agent that works on issues
- ✅ `claude-pr-review.yml` - Automatic PR reviews
- ✅ `claude-issue-triage.yml` - Automatic issue triage

These files are already committed to the repository.

## Step 4: Test the Integration

### Test 1: Issue Assignment

1. Create a new issue or use existing issue #2
2. Comment on the issue:
   ```
   @claude implement this feature
   ```
3. Watch Claude work! It will:
   - Analyze the issue
   - Write the code
   - Create a pull request
   - Link back to the issue

### Test 2: PR Review

1. Create or open any pull request
2. Comment:
   ```
   @claude review this PR
   ```
3. Claude will provide a comprehensive code review

### Test 3: Issue Triage

1. Create a new issue
2. Claude will automatically analyze it and provide:
   - Category classification
   - Priority assessment
   - Complexity estimation
   - Suggested labels

## Usage Examples

### Autonomous Coding

```markdown
@claude work on this issue

Please implement the user authentication feature described above.
Focus on security best practices and follow our existing patterns.
```

### Specific Implementation

```markdown
@claude implement this

Add a new API endpoint /api/users/:id/profile that:
- Returns user profile data
- Includes validation
- Has proper error handling
- Follows our API response format
```

### Bug Fixes

```markdown
@claude fix this bug

The error is happening in backend/src/services/UserService.ts
when processing undefined email addresses.
```

### Code Review

```markdown
@claude review

Please focus on:
- Security vulnerabilities
- TypeScript type safety
- Performance optimizations
```

### Questions

```markdown
@claude how should I implement user session management?

We need to support both JWT and cookie-based auth.
What's the best approach for our architecture?
```

## Workflow Details

### Claude Autonomous Agent

**Triggers:**
- Issue comments containing `@claude`
- Issue assignments
- Manual workflow dispatch

**Capabilities:**
- Clones repository
- Analyzes issue context
- Writes/modifies code
- Runs tests
- Creates pull requests
- Posts status updates

**Configuration:**
- Max turns: 10
- Model: Claude Sonnet 4.5
- Full repository access

### Claude PR Review

**Triggers:**
- New pull requests
- PR updates
- Comments with `@claude review`

**Review Focus:**
- Code quality
- Security issues
- Performance
- TypeScript types
- Best practices

### Claude Issue Triage

**Triggers:**
- New issues opened
- Comments with `@claude triage`

**Analysis:**
- Issue categorization
- Priority assessment
- Complexity estimation
- Component identification

## Advanced Configuration

### Custom Claude Arguments

You can customize Claude's behavior in the workflow files:

```yaml
claude_args: |
  --max-turns 15
  --model claude-sonnet-4-5-20250929
  --append-system-prompt "Focus on security and performance"
```

### Cloud Provider Authentication

If you prefer using AWS Bedrock or Google Vertex AI instead of direct Anthropic API:

#### AWS Bedrock

1. Enable Amazon Bedrock with Claude models
2. Configure GitHub OIDC
3. Add secret: `AWS_ROLE_TO_ASSUME`

#### Google Vertex AI

1. Enable Vertex AI API
2. Configure Workload Identity Federation
3. Add secrets:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`
   - `GCP_SERVICE_ACCOUNT`

See [Cloud Providers Guide](https://github.com/anthropics/claude-code-action/blob/main/docs/cloud-providers.md) for details.

## Troubleshooting

### Claude Not Responding

**Problem**: No response when mentioning `@claude`

**Solutions:**
1. Verify workflows are enabled:
   - Go to Actions tab
   - Check workflows are not disabled
2. Check API key in secrets
3. Ensure exact `@claude` mention (case-sensitive)
4. Check workflow run logs for errors

### Authentication Errors

**Problem**: "API key invalid" or permission errors

**Solutions:**
1. Verify `ANTHROPIC_API_KEY` is correct
2. Check API key has sufficient credits
3. Ensure key is not expired
4. Test key with curl:
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "anthropic-version: 2023-06-01" \
     -H "content-type: application/json" \
     -d '{"model":"claude-sonnet-4-5-20250929","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
   ```

### Workflow Not Triggering

**Problem**: Workflow doesn't start on issue comment

**Solutions:**
1. Check workflow file syntax (YAML validation)
2. Verify trigger conditions match event
3. Check repository permissions
4. Review Actions logs for errors

### Claude Makes Incorrect Changes

**Problem**: Claude's code doesn't follow project patterns

**Solutions:**
1. Update `CLAUDE.md` with specific guidelines
2. Add examples of correct patterns
3. Be more specific in issue descriptions
4. Provide code snippets for reference

## Best Practices

### Writing Effective Issues

Good issues help Claude understand what to build:

```markdown
## Problem
Users cannot reset their passwords when they forget them.

## Expected Behavior
1. User clicks "Forgot Password" link
2. Enters their email
3. Receives reset link via email
4. Clicks link and sets new password

## Technical Requirements
- Add new API endpoint: POST /api/auth/reset-password
- Use existing email service in `backend/src/services/EmailService.ts`
- Generate secure reset tokens (24-hour expiry)
- Hash passwords with bcrypt

## Acceptance Criteria
- [ ] API endpoint created and tested
- [ ] Email template for reset link
- [ ] Frontend form for password reset
- [ ] Unit tests for reset flow
- [ ] Error handling for invalid tokens

## Files to Modify
- backend/src/routes/authRoutes.ts
- backend/src/controllers/authController.ts
- backend/src/services/AuthService.ts
- frontend/src/app/(auth)/reset-password/page.tsx
```

### Cost Optimization

1. **Set appropriate max-turns**: Don't use 20 turns for simple tasks
2. **Be specific**: Clear instructions reduce back-and-forth
3. **Use timeouts**: Add workflow timeouts to prevent runaway costs
4. **Review before merging**: Claude creates *draft* PRs - always review

### Security

1. **Always review PRs**: Never merge without human review
2. **Check for secrets**: Ensure no API keys/passwords in code
3. **Validate inputs**: Verify proper sanitization
4. **Test auth changes**: Security-critical code needs extra review

## Cost Estimation

| Task Type | Typical Cost | Duration |
|-----------|-------------|----------|
| Simple bug fix | $0.15 - $0.50 | 2-5 min |
| Feature implementation | $1.00 - $3.00 | 5-15 min |
| Code review | $0.10 - $0.30 | 1-3 min |
| Issue triage | $0.05 - $0.15 | <1 min |

Costs based on Claude Sonnet 4.5 pricing at current rates.

## GitHub Actions Limits

### Free Tier (Public Repos)
- ✅ Unlimited minutes
- ✅ No cost

### Free Tier (Private Repos)
- 2,000 minutes/month
- ~40 autonomous coding sessions
- ~200 code reviews

### Paid Plans
- Pro: 3,000 minutes/month ($4)
- Team: 10,000 minutes/month per user
- Enterprise: 50,000 minutes/month

## Support and Resources

- **Official Documentation**: https://code.claude.com/docs/en/github-actions
- **GitHub Action Repo**: https://github.com/anthropics/claude-code-action
- **Issues**: https://github.com/anthropics/claude-code-action/issues
- **Anthropic Support**: support@anthropic.com

## Next Steps

1. ✅ Complete setup steps above
2. ✅ Test with a simple issue
3. ✅ Review Claude's first PR
4. ✅ Refine `CLAUDE.md` based on results
5. ✅ Gradually increase automation

---

**Setup Date**: February 2026
**Repository**: Thedurancode/CODELIVE-FINAL
**Integration**: Anthropic Claude Code Official Action v1
