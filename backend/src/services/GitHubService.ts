/**
 * GitHub Service
 *
 * Integrates with GitHub API for:
 * - Searching user/org repositories
 * - Creating new repositories
 * - Getting repository details
 * - Inviting collaborators to repositories
 */

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

interface CreateRepoOptions {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
}

interface SearchOptions {
  query?: string;
  sort?: 'updated' | 'pushed' | 'full_name' | 'created';
  direction?: 'asc' | 'desc';
  perPage?: number;
  page?: number;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: {
    login: string;
    avatar_url: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
}

interface IssueOptions {
  state?: 'open' | 'closed' | 'all';
  sort?: 'created' | 'updated' | 'comments';
  direction?: 'asc' | 'desc';
  perPage?: number;
  page?: number;
}

type CollaboratorPermission = 'pull' | 'push' | 'admin' | 'maintain' | 'triage';

interface GitHubInvitation {
  id: number;
  repository: {
    id: number;
    name: string;
    full_name: string;
  };
  invitee: {
    login: string;
    email?: string;
  } | null;
  inviter: {
    login: string;
  };
  permissions: string;
  created_at: string;
  url: string;
  html_url: string;
}

interface InviteResult {
  success: boolean;
  method: 'username' | 'email' | 'existing';
  invitation?: GitHubInvitation;
  message: string;
}

class GitHubService {
  private token: string | null = null;
  private org: string | null = null;
  private defaultPrivate: boolean = true;
  private initialized = false;

  async initialize(): Promise<void> {
    this.token = process.env.GITHUB_TOKEN || null;
    this.org = process.env.GITHUB_ORG || null;
    this.defaultPrivate = process.env.GITHUB_REPOS_PRIVATE !== 'false';

    if (this.token) {
      console.log(`GitHubService initialized (org: ${this.org || 'personal'})`);
    } else {
      console.log('GitHubService: No GITHUB_TOKEN configured - GitHub features disabled');
    }

    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && !!this.token;
  }

  isConfigured(): boolean {
    return !!this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.token) {
      throw new Error('GitHub token not configured');
    }

    const url = endpoint.startsWith('http')
      ? endpoint
      : `https://api.github.com${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      const err = new Error(`GitHub API error: ${error.message || response.statusText}`) as Error & { status: number };
      err.status = response.status;
      throw err;
    }

    return response.json();
  }

  /**
   * Get the authenticated user's info
   */
  async getAuthenticatedUser(): Promise<{ login: string; avatar_url: string; name: string }> {
    return this.request('/user');
  }

  /**
   * List repositories for the authenticated user or organization
   */
  async listRepos(options: SearchOptions = {}): Promise<GitHubRepo[]> {
    const {
      sort = 'updated',
      direction = 'desc',
      perPage = 30,
      page = 1,
    } = options;

    const params = new URLSearchParams({
      sort,
      direction,
      per_page: String(perPage),
      page: String(page),
    });

    if (this.org) {
      return this.request<GitHubRepo[]>(`/orgs/${this.org}/repos?${params}`);
    }

    return this.request<GitHubRepo[]>(`/user/repos?${params}`);
  }

  /**
   * Search repositories accessible to the user
   */
  async searchRepos(query: string, options: SearchOptions = {}): Promise<GitHubRepo[]> {
    const {
      sort = 'updated',
      perPage = 20,
      page = 1,
    } = options;

    // If org is configured, search within org
    // Otherwise search user's repos
    let searchQuery = query;
    if (this.org) {
      searchQuery = `${query} org:${this.org}`;
    } else {
      // Get user login first
      const user = await this.getAuthenticatedUser();
      searchQuery = `${query} user:${user.login}`;
    }

    const params = new URLSearchParams({
      q: searchQuery,
      sort,
      per_page: String(perPage),
      page: String(page),
    });

    const result = await this.request<{ items: GitHubRepo[] }>(`/search/repositories?${params}`);
    return result.items;
  }

  /**
   * Get a specific repository
   */
  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(`/repos/${owner}/${repo}`);
  }

  /**
   * Create a new repository
   */
  async createRepo(options: CreateRepoOptions): Promise<GitHubRepo> {
    const {
      name,
      description = '',
      private: isPrivate = this.defaultPrivate,
      autoInit = true,
    } = options;

    // Slugify the name
    const repoName = this.slugify(name);

    const body = {
      name: repoName,
      description,
      private: isPrivate,
      auto_init: autoInit,
    };

    if (this.org) {
      return this.request<GitHubRepo>(`/orgs/${this.org}/repos`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    return this.request<GitHubRepo>('/user/repos', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Get repository stats (issues, commits count, etc.)
   */
  async getRepoStats(owner: string, repo: string): Promise<{
    repo: GitHubRepo;
    openIssues: number;
    openPRs: number;
  }> {
    const repoData = await this.getRepo(owner, repo);

    // Get open PRs count
    const prs = await this.request<{ total_count: number }>(
      `/search/issues?q=repo:${owner}/${repo}+type:pr+state:open`
    );

    return {
      repo: repoData,
      openIssues: repoData.open_issues_count - prs.total_count,
      openPRs: prs.total_count,
    };
  }

  /**
   * List issues for a repository
   */
  async listIssues(owner: string, repo: string, options: IssueOptions = {}): Promise<GitHubIssue[]> {
    const {
      state = 'open',
      sort = 'created',
      direction = 'desc',
      perPage = 10,
      page = 1,
    } = options;

    const params = new URLSearchParams({
      state,
      sort,
      direction,
      per_page: String(perPage),
      page: String(page),
    });

    return this.request<GitHubIssue[]>(`/repos/${owner}/${repo}/issues?${params}`);
  }

  /**
   * Create an issue in a repository
   */
  async createIssue(
    owner: string,
    repo: string,
    options: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
    }
  ): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: options.title,
        body: options.body,
        labels: options.labels,
        assignees: options.assignees,
      }),
    });
  }

  /**
   * List issues across multiple repositories
   */
  async listIssuesFromRepos(
    repos: Array<{ owner: string; repo: string; projectTitle?: string }>,
    options: IssueOptions = {}
  ): Promise<Array<GitHubIssue & { repoName: string; projectTitle?: string }>> {
    const allIssues: Array<GitHubIssue & { repoName: string; projectTitle?: string }> = [];

    await Promise.all(
      repos.map(async ({ owner, repo, projectTitle }) => {
        try {
          const issues = await this.listIssues(owner, repo, options);
          issues.forEach((issue) => {
            // GitHub API returns PRs in issues endpoint, filter them out
            if (!(issue as any).pull_request) {
              allIssues.push({
                ...issue,
                repoName: `${owner}/${repo}`,
                projectTitle,
              });
            }
          });
        } catch (error) {
          console.error(`Failed to fetch issues for ${owner}/${repo}:`, error);
        }
      })
    );

    // Sort by created date descending
    allIssues.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return allIssues;
  }

  /**
   * Invite a collaborator to a repository by email
   * GitHub will send an email invitation to the user
   */
  async inviteCollaboratorByEmail(
    owner: string,
    repo: string,
    email: string,
    permission: CollaboratorPermission = 'push'
  ): Promise<InviteResult> {
    if (!this.token) {
      throw new Error('GitHub token not configured');
    }

    // First, try to find if a GitHub user exists with this email
    try {
      const searchResult = await this.request<{ total_count: number; items: Array<{ login: string }> }>(
        `/search/users?q=${encodeURIComponent(email)}+in:email`
      );

      if (searchResult.total_count > 0 && searchResult.items[0]) {
        // User found, invite by username
        return this.inviteCollaboratorByUsername(owner, repo, searchResult.items[0].login, permission);
      }
    } catch (error) {
      // Search failed, continue with email invite
      console.log(`Could not search for user by email, attempting direct email invite: ${error}`);
    }

    // No user found, send email invitation directly
    // Note: This requires the repo to be in an organization with email invites enabled
    // For personal repos, this may not work - the user needs a GitHub account
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/invitations`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            permission,
          }),
        }
      );

      if (response.ok) {
        const invitation = await response.json();
        return {
          success: true,
          method: 'email',
          invitation,
          message: `Invitation sent to ${email}`,
        };
      }

      // If email invite doesn't work, return informative message
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        method: 'email',
        message: `Could not invite by email. User may need a GitHub account first. Error: ${errorData.message || response.statusText}`,
      };
    } catch (error) {
      return {
        success: false,
        method: 'email',
        message: `Failed to send invitation: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Invite a collaborator to a repository by GitHub username
   */
  async inviteCollaboratorByUsername(
    owner: string,
    repo: string,
    username: string,
    permission: CollaboratorPermission = 'push'
  ): Promise<InviteResult> {
    if (!this.token) {
      throw new Error('GitHub token not configured');
    }

    try {
      // Check if already a collaborator
      const checkResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/collaborators/${username}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (checkResponse.status === 204) {
        return {
          success: true,
          method: 'existing',
          message: `${username} is already a collaborator on this repository`,
        };
      }

      // Add as collaborator (sends invitation)
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/collaborators/${username}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            permission,
          }),
        }
      );

      if (response.status === 201) {
        // Invitation created
        const invitation = await response.json();
        return {
          success: true,
          method: 'username',
          invitation,
          message: `Invitation sent to ${username}`,
        };
      }

      if (response.status === 204) {
        // User added directly (happens when user is org member)
        return {
          success: true,
          method: 'username',
          message: `${username} added as collaborator`,
        };
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        method: 'username',
        message: `Failed to invite ${username}: ${errorData.message || response.statusText}`,
      };
    } catch (error) {
      return {
        success: false,
        method: 'username',
        message: `Failed to invite collaborator: ${(error as Error).message}`,
      };
    }
  }

  /**
   * List pending invitations for a repository
   */
  async listPendingInvitations(owner: string, repo: string): Promise<GitHubInvitation[]> {
    return this.request<GitHubInvitation[]>(`/repos/${owner}/${repo}/invitations`);
  }

  /**
   * Cancel a pending invitation
   */
  async cancelInvitation(owner: string, repo: string, invitationId: number): Promise<boolean> {
    try {
      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/invitations/${invitationId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove a collaborator from a repository
   */
  async removeCollaborator(owner: string, repo: string, username: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/collaborators/${username}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );
      return response.status === 204;
    } catch {
      return false;
    }
  }

  /**
   * List collaborators for a repository
   */
  async listCollaborators(owner: string, repo: string): Promise<Array<{ login: string; avatar_url: string; permissions: any }>> {
    return this.request(`/repos/${owner}/${repo}/collaborators`);
  }

  /**
   * Check if the authenticated user is a collaborator on a repository
   * Returns the permission level if they are, null if not
   *
   * Note: This uses the backend's GITHUB_TOKEN, so it can only check repos
   * that token has access to. For repos the token can't access, we return
   * isCollaborator: true as a fallback (let the user try and get a proper
   * error from their Git client if they truly don't have access).
   */
  async checkCollaboratorAccess(
    owner: string,
    repo: string
  ): Promise<{ isCollaborator: boolean; permission: string | null; error?: string }> {
    try {
      // First get the authenticated user
      const user = await this.getAuthenticatedUser();

      // Check if user is the owner
      if (user.login.toLowerCase() === owner.toLowerCase()) {
        return { isCollaborator: true, permission: 'admin' };
      }

      // Check collaborator permission using the permission endpoint
      // This returns 200 with permission level, or 404 if not a collaborator
      const response = await this.request<{ permission: string }>(
        `/repos/${owner}/${repo}/collaborators/${user.login}/permission`
      );

      // GitHub returns 'none' for non-collaborators on public repos
      const isCollaborator = response.permission !== 'none';
      return {
        isCollaborator,
        permission: isCollaborator ? response.permission : null,
      };
    } catch (error) {
      const err = error as Error & { status?: number };

      // 404 on the collaborator endpoint means user is not a collaborator
      // But 404 "Not Found" on the repo itself means the token can't access the repo
      if (err.message?.includes('Not Found')) {
        // The backend token can't access this repo - default to allowing
        // (the user will get a proper error from their Git client if they don't have access)
        console.log(`GitHub: Can't access repo ${owner}/${repo} - defaulting to allow clone buttons`);
        return { isCollaborator: true, permission: null, error: 'repo_not_accessible' };
      }

      // For 403 (no permission to check collaborators), default to allow
      if (err.status === 403) {
        console.log(`GitHub: No permission to check collaborators on ${owner}/${repo} - defaulting to allow`);
        return { isCollaborator: true, permission: null, error: 'no_permission_to_check' };
      }

      // For other errors, log and default to allow
      console.error('Error checking collaborator access:', error);
      return { isCollaborator: true, permission: null, error: 'unknown_error' };
    }
  }

  /**
   * Convert a string to a valid repo name slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Parse a GitHub URL to extract owner and repo
   */
  parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    try {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        return { owner: match[1], repo: match[2].replace('.git', '') };
      }
    } catch {}
    return null;
  }

  // =========================================================================
  // REPOSITORY CONTENT METHODS
  // =========================================================================

  /**
   * List contents of a directory in a repository
   */
  async listContents(
    owner: string,
    repo: string,
    path: string = '',
    ref?: string
  ): Promise<GitHubContent[]> {
    const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const endpoint = `/repos/${owner}/${repo}/contents/${path}${params}`;
    const result = await this.request<GitHubContent | GitHubContent[]>(endpoint);

    // If it's a single file, wrap it in an array
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Get file content (decoded from base64)
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<{ content: string; encoding: string; sha: string; size: number }> {
    const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const endpoint = `/repos/${owner}/${repo}/contents/${path}${params}`;
    const result = await this.request<GitHubContent>(endpoint);

    if (result.type !== 'file' || !result.content) {
      throw new Error('Not a file or content not available');
    }

    // Decode base64 content
    const decodedContent = Buffer.from(result.content, 'base64').toString('utf-8');

    return {
      content: decodedContent,
      encoding: result.encoding || 'utf-8',
      sha: result.sha,
      size: result.size,
    };
  }

  /**
   * Get README content for a repository
   */
  async getReadme(owner: string, repo: string, ref?: string): Promise<{ content: string; path: string } | null> {
    try {
      const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const result = await this.request<GitHubContent>(`/repos/${owner}/${repo}/readme${params}`);

      if (result.content) {
        const decodedContent = Buffer.from(result.content, 'base64').toString('utf-8');
        return {
          content: decodedContent,
          path: result.path,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * List commits for a repository
   */
  async listCommits(
    owner: string,
    repo: string,
    options: {
      sha?: string;
      path?: string;
      author?: string;
      since?: string;
      until?: string;
      perPage?: number;
      page?: number;
    } = {}
  ): Promise<GitHubCommit[]> {
    const params = new URLSearchParams();
    if (options.sha) params.set('sha', options.sha);
    if (options.path) params.set('path', options.path);
    if (options.author) params.set('author', options.author);
    if (options.since) params.set('since', options.since);
    if (options.until) params.set('until', options.until);
    params.set('per_page', String(options.perPage || 30));
    params.set('page', String(options.page || 1));

    return this.request<GitHubCommit[]>(`/repos/${owner}/${repo}/commits?${params}`);
  }

  /**
   * List branches for a repository
   */
  async listBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    return this.request<GitHubBranch[]>(`/repos/${owner}/${repo}/branches`);
  }

  /**
   * Get the default branch for a repository
   */
  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const repoData = await this.getRepo(owner, repo);
    return repoData.default_branch;
  }

  /**
   * Get repository tree (all files recursively)
   */
  async getTree(
    owner: string,
    repo: string,
    sha: string = 'HEAD',
    recursive: boolean = true
  ): Promise<GitHubTreeItem[]> {
    const params = recursive ? '?recursive=1' : '';
    const result = await this.request<{ tree: GitHubTreeItem[]; truncated: boolean }>(
      `/repos/${owner}/${repo}/git/trees/${sha}${params}`
    );
    return result.tree;
  }

  /**
   * List pull requests for a repository
   */
  async listPullRequests(
    owner: string,
    repo: string,
    options: PullRequestOptions = {}
  ): Promise<GitHubPullRequest[]> {
    const {
      state = 'open',
      sort = 'created',
      direction = 'desc',
      perPage = 30,
      page = 1,
    } = options;

    const params = new URLSearchParams({
      state,
      sort,
      direction,
      per_page: String(perPage),
      page: String(page),
    });

    return this.request<GitHubPullRequest[]>(`/repos/${owner}/${repo}/pulls?${params}`);
  }

  // =========================================================================
  // BRANCH MANAGEMENT METHODS (for Coding Tasks)
  // =========================================================================

  /**
   * Get a specific branch
   */
  async getBranch(owner: string, repo: string, branch: string): Promise<GitHubBranch | null> {
    try {
      return await this.request<GitHubBranch>(`/repos/${owner}/${repo}/branches/${branch}`);
    } catch {
      return null;
    }
  }

  /**
   * Get the SHA of a branch
   */
  async getBranchSha(owner: string, repo: string, branch: string): Promise<string> {
    const ref = await this.request<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/ref/heads/${branch}`
    );
    return ref.object.sha;
  }

  /**
   * Create a new branch from a base branch
   */
  async createBranch(
    owner: string,
    repo: string,
    newBranch: string,
    baseBranch: string = 'main'
  ): Promise<{ ref: string; sha: string }> {
    // Get the SHA of the base branch
    const baseSha = await this.getBranchSha(owner, repo, baseBranch);

    // Create the new branch reference
    const result = await this.request<{ ref: string; object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${newBranch}`,
          sha: baseSha,
        }),
      }
    );

    return {
      ref: result.ref,
      sha: result.object.sha,
    };
  }

  /**
   * Delete a branch
   */
  async deleteBranch(owner: string, repo: string, branch: string): Promise<boolean> {
    try {
      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // FILE OPERATIONS (for Coding Tasks)
  // =========================================================================

  /**
   * Create or update a file in a repository
   */
  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string // Required for updates
  ): Promise<{ commit: { sha: string; html_url: string }; content: GitHubContent }> {
    // Encode content to base64
    const encodedContent = Buffer.from(content, 'utf-8').toString('base64');

    const body: any = {
      message,
      content: encodedContent,
      branch,
    };

    // If SHA is provided, this is an update
    if (sha) {
      body.sha = sha;
    }

    return this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * Delete a file in a repository
   */
  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    branch: string,
    sha: string
  ): Promise<{ commit: { sha: string } }> {
    return this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({
        message,
        sha,
        branch,
      }),
    });
  }

  /**
   * Get file SHA (needed for updates)
   */
  async getFileSha(owner: string, repo: string, path: string, ref?: string): Promise<string | null> {
    try {
      const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const result = await this.request<GitHubContent>(`/repos/${owner}/${repo}/contents/${path}${params}`);
      return result.sha;
    } catch {
      return null;
    }
  }

  // =========================================================================
  // PULL REQUEST MANAGEMENT (for Coding Tasks)
  // =========================================================================

  /**
   * Create a pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    options: CreatePullRequestOptions
  ): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
        draft: options.draft || false,
      }),
    });
  }

  /**
   * Update a pull request
   */
  async updatePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    options: {
      title?: string;
      body?: string;
      state?: 'open' | 'closed';
    }
  ): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls/${pullNumber}`, {
      method: 'PATCH',
      body: JSON.stringify(options),
    });
  }

  /**
   * Get a single pull request
   */
  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
  }

  /**
   * Add reviewers to a pull request
   */
  async addPullRequestReviewers(
    owner: string,
    repo: string,
    pullNumber: number,
    reviewers: string[]
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, {
      method: 'POST',
      body: JSON.stringify({ reviewers }),
    });
  }

  /**
   * Add labels to a pull request
   */
  async addPullRequestLabels(
    owner: string,
    repo: string,
    pullNumber: number,
    labels: string[]
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/issues/${pullNumber}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels }),
    });
  }

  /**
   * Get pull request diff
   */
  async getPullRequestDiff(owner: string, repo: string, pullNumber: number): Promise<string> {
    if (!this.token) {
      throw new Error('GitHub token not configured');
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3.diff',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get PR diff: ${response.statusText}`);
    }

    return response.text();
  }

  // =========================================================================
  // COMMIT OPERATIONS (for Coding Tasks)
  // =========================================================================

  /**
   * Get a specific commit
   */
  async getCommit(owner: string, repo: string, sha: string): Promise<GitHubCommit> {
    return this.request<GitHubCommit>(`/repos/${owner}/${repo}/commits/${sha}`);
  }

  /**
   * Compare two commits/branches
   */
  async compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string
  ): Promise<{
    status: 'diverged' | 'ahead' | 'behind' | 'identical';
    ahead_by: number;
    behind_by: number;
    total_commits: number;
    files: Array<{
      filename: string;
      status: 'added' | 'removed' | 'modified' | 'renamed';
      additions: number;
      deletions: number;
      changes: number;
    }>;
  }> {
    return this.request(`/repos/${owner}/${repo}/compare/${base}...${head}`);
  }
}

// Additional interfaces for repo content
interface GitHubContent {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  download_url: string | null;
  content?: string;
  encoding?: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: {
    login: string;
    avatar_url: string;
  } | null;
  committer: {
    login: string;
    avatar_url: string;
  } | null;
  html_url: string;
}

interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  draft: boolean;
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  requested_reviewers: Array<{
    login: string;
    avatar_url: string;
  }>;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

interface PullRequestOptions {
  state?: 'open' | 'closed' | 'all';
  sort?: 'created' | 'updated' | 'popularity' | 'long-running';
  direction?: 'asc' | 'desc';
  perPage?: number;
  page?: number;
}

interface CreatePullRequestOptions {
  title: string;
  body?: string;
  head: string; // Branch name containing changes
  base: string; // Branch to merge into
  draft?: boolean;
}

export const gitHubService = new GitHubService();
export {
  GitHubRepo,
  GitHubIssue,
  GitHubInvitation,
  InviteResult,
  CreateRepoOptions,
  SearchOptions,
  IssueOptions,
  CollaboratorPermission,
  GitHubContent,
  GitHubCommit,
  GitHubBranch,
  GitHubTreeItem,
  GitHubPullRequest,
  PullRequestOptions,
  CreatePullRequestOptions,
};
