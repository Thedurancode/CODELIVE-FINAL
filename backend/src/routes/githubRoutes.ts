/**
 * GitHub Routes
 *
 * API endpoints for GitHub integration:
 * - Search repositories
 * - Create repositories
 * - Get repository details
 */

import { Router, Request, Response } from 'express';
import { gitHubService } from '../services/GitHubService';

const router = Router();

/**
 * @swagger
 * /api/github/status:
 *   get:
 *     summary: Check GitHub integration status
 *     tags: [GitHub]
 *     responses:
 *       200:
 *         description: GitHub integration status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const configured = gitHubService.isConfigured();

    if (!configured) {
      return res.json({
        success: true,
        data: {
          configured: false,
          message: 'GitHub token not configured',
        },
      });
    }

    const user = await gitHubService.getAuthenticatedUser();

    res.json({
      success: true,
      data: {
        configured: true,
        user: {
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url,
        },
        org: process.env.GITHUB_ORG || null,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos:
 *   get:
 *     summary: List repositories
 *     tags: [GitHub]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of repositories
 */
router.get('/repos', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 30;

    const repos = await gitHubService.listRepos({ page, perPage });

    res.json({
      success: true,
      data: repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        description: repo.description,
        private: repo.private,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at,
        owner: repo.owner,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos/search:
 *   get:
 *     summary: Search repositories
 *     tags: [GitHub]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/repos/search', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const query = req.query.q as string;
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters',
      });
    }

    const repos = await gitHubService.searchRepos(query);

    res.json({
      success: true,
      data: repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        description: repo.description,
        private: repo.private,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
        updatedAt: repo.updated_at,
        owner: repo.owner,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos:
 *   post:
 *     summary: Create a new repository
 *     tags: [GitHub]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               private:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Repository created
 */
router.post('/repos', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { name, description, private: isPrivate } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Repository name is required',
      });
    }

    const repo = await gitHubService.createRepo({
      name,
      description,
      private: isPrivate,
    });

    res.status(201).json({
      success: true,
      data: {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        description: repo.description,
        private: repo.private,
        defaultBranch: repo.default_branch,
        owner: repo.owner,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}:
 *   get:
 *     summary: Get repository details
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository details
 */
router.get('/repos/:owner/:repo', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo } = req.params;
    const stats = await gitHubService.getRepoStats(owner, repo);

    res.json({
      success: true,
      data: {
        id: stats.repo.id,
        name: stats.repo.name,
        fullName: stats.repo.full_name,
        url: stats.repo.html_url,
        description: stats.repo.description,
        private: stats.repo.private,
        language: stats.repo.language,
        stars: stats.repo.stargazers_count,
        forks: stats.repo.forks_count,
        openIssues: stats.openIssues,
        openPRs: stats.openPRs,
        defaultBranch: stats.repo.default_branch,
        updatedAt: stats.repo.updated_at,
        pushedAt: stats.repo.pushed_at,
        owner: stats.repo.owner,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/issues:
 *   get:
 *     summary: Get issues from a repository
 *     tags: [GitHub]
 *     parameters:
 *       - in: query
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *           enum: [open, closed, all]
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of issues
 */
router.get('/issues', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const owner = req.query.owner as string;
    const repo = req.query.repo as string;

    if (!owner || !repo) {
      return res.status(400).json({
        success: false,
        error: 'Owner and repo are required',
      });
    }

    const state = (req.query.state as 'open' | 'closed' | 'all') || 'open';
    const perPage = parseInt(req.query.perPage as string) || 10;

    const issues = await gitHubService.listIssues(owner, repo, { state, perPage });

    res.json({
      success: true,
      data: issues.map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        url: issue.html_url,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        closedAt: issue.closed_at,
        user: issue.user,
        labels: issue.labels,
        assignees: issue.assignees,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/issues:
 *   post:
 *     summary: Create a new issue in a repository
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               labels:
 *                 type: array
 *                 items:
 *                   type: string
 *               assignees:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Issue created successfully
 */
router.post('/repos/:owner/:repo/issues', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo } = req.params;
    const { title, body, labels, assignees } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required',
      });
    }

    const issue = await gitHubService.createIssue(owner, repo, {
      title,
      body,
      labels,
      assignees,
    });

    res.status(201).json({
      success: true,
      data: {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        url: issue.html_url,
        createdAt: issue.created_at,
        user: issue.user,
        labels: issue.labels,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/issues/bulk:
 *   post:
 *     summary: Get issues from multiple repositories
 *     tags: [GitHub]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repos
 *             properties:
 *               repos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     owner:
 *                       type: string
 *                     repo:
 *                       type: string
 *                     projectTitle:
 *                       type: string
 *               state:
 *                 type: string
 *                 enum: [open, closed, all]
 *               perPage:
 *                 type: integer
 *     responses:
 *       200:
 *         description: List of issues from all repos
 */
router.post('/issues/bulk', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { repos, state = 'open', perPage = 5 } = req.body;

    if (!repos || !Array.isArray(repos) || repos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'repos array is required',
      });
    }

    const issues = await gitHubService.listIssuesFromRepos(repos, { state, perPage });

    res.json({
      success: true,
      data: issues.map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        url: issue.html_url,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        closedAt: issue.closed_at,
        user: issue.user,
        labels: issue.labels,
        assignees: issue.assignees,
        repoName: issue.repoName,
        projectTitle: issue.projectTitle,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// =========================================================================
// REPOSITORY CONTENT ROUTES
// =========================================================================

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/contents:
 *   get:
 *     summary: List contents of a directory
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: path
 *         schema:
 *           type: string
 *         description: Directory path (empty for root)
 *       - in: query
 *         name: ref
 *         schema:
 *           type: string
 *         description: Branch or commit SHA
 *     responses:
 *       200:
 *         description: Directory contents
 */
router.get('/repos/:owner/:repo/contents', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo } = req.params;
    const path = (req.query.path as string) || '';
    const ref = req.query.ref as string | undefined;

    const contents = await gitHubService.listContents(owner, repo, path, ref);

    // Sort: directories first, then files, alphabetically
    const sorted = contents.sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (a.type !== 'dir' && b.type === 'dir') return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      success: true,
      data: sorted.map((item) => ({
        type: item.type,
        name: item.name,
        path: item.path,
        sha: item.sha,
        size: item.size,
        url: item.html_url,
        downloadUrl: item.download_url,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/file:
 *   get:
 *     summary: Get file content
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: File path
 *       - in: query
 *         name: ref
 *         schema:
 *           type: string
 *         description: Branch or commit SHA
 *     responses:
 *       200:
 *         description: File content
 */
router.get('/repos/:owner/:repo/file', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo } = req.params;
    const path = req.query.path as string;
    const ref = req.query.ref as string | undefined;

    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'File path is required',
      });
    }

    const file = await gitHubService.getFileContent(owner, repo, path, ref);

    res.json({
      success: true,
      data: {
        content: file.content,
        encoding: file.encoding,
        sha: file.sha,
        size: file.size,
        path,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/readme:
 *   get:
 *     summary: Get README content
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: ref
 *         schema:
 *           type: string
 *         description: Branch or commit SHA
 *     responses:
 *       200:
 *         description: README content
 */
router.get('/repos/:owner/:repo/readme', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo } = req.params;
    const ref = req.query.ref as string | undefined;

    const readme = await gitHubService.getReadme(owner, repo, ref);

    if (!readme) {
      return res.json({
        success: true,
        data: null,
      });
    }

    res.json({
      success: true,
      data: {
        content: readme.content,
        path: readme.path,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/commits:
 *   get:
 *     summary: List commits
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sha
 *         schema:
 *           type: string
 *         description: Branch name or commit SHA
 *       - in: query
 *         name: path
 *         schema:
 *           type: string
 *         description: File path to get commits for
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of commits
 */
router.get('/repos/:owner/:repo/commits', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo } = req.params;
    const sha = req.query.sha as string | undefined;
    const path = req.query.path as string | undefined;
    const perPage = parseInt(req.query.perPage as string) || 30;
    const page = parseInt(req.query.page as string) || 1;

    const commits = await gitHubService.listCommits(owner, repo, {
      sha,
      path,
      perPage,
      page,
    });

    res.json({
      success: true,
      data: commits.map((commit) => ({
        sha: commit.sha,
        shortSha: commit.sha.substring(0, 7),
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: commit.commit.author.date,
          login: commit.author?.login,
          avatarUrl: commit.author?.avatar_url,
        },
        committer: {
          name: commit.commit.committer.name,
          email: commit.commit.committer.email,
          date: commit.commit.committer.date,
          login: commit.committer?.login,
          avatarUrl: commit.committer?.avatar_url,
        },
        url: commit.html_url,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/branches:
 *   get:
 *     summary: List branches
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of branches
 */
router.get('/repos/:owner/:repo/branches', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo } = req.params;

    const branches = await gitHubService.listBranches(owner, repo);

    res.json({
      success: true,
      data: branches.map((branch) => ({
        name: branch.name,
        commitSha: branch.commit.sha,
        protected: branch.protected,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/tree:
 *   get:
 *     summary: Get full repository tree
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sha
 *         schema:
 *           type: string
 *         description: Branch or commit SHA (default HEAD)
 *     responses:
 *       200:
 *         description: Repository tree
 */
router.get('/repos/:owner/:repo/tree', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo } = req.params;
    const sha = (req.query.sha as string) || 'HEAD';

    const tree = await gitHubService.getTree(owner, repo, sha, true);

    res.json({
      success: true,
      data: tree.map((item) => ({
        path: item.path,
        type: item.type === 'blob' ? 'file' : 'dir',
        sha: item.sha,
        size: item.size,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/pulls:
 *   get:
 *     summary: List pull requests
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *           enum: [open, closed, all]
 *         description: State of pull requests to list
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [created, updated, popularity, long-running]
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of pull requests
 */
router.get('/repos/:owner/:repo/pulls', async (req: Request, res: Response) => {
  try {
    if (!gitHubService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    const { owner, repo } = req.params;
    const state = (req.query.state as 'open' | 'closed' | 'all') || 'open';
    const sort = (req.query.sort as 'created' | 'updated' | 'popularity' | 'long-running') || 'created';
    const direction = (req.query.direction as 'asc' | 'desc') || 'desc';
    const perPage = parseInt(req.query.perPage as string) || 30;
    const page = parseInt(req.query.page as string) || 1;

    const pullRequests = await gitHubService.listPullRequests(owner, repo, {
      state,
      sort,
      direction,
      perPage,
      page,
    });

    res.json({
      success: true,
      data: pullRequests.map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        draft: pr.draft,
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        closedAt: pr.closed_at,
        mergedAt: pr.merged_at,
        user: pr.user,
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
        },
        labels: pr.labels,
        assignees: pr.assignees,
        requestedReviewers: pr.requested_reviewers,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
