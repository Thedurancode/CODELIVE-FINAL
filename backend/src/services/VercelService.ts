/**
 * Vercel Service
 *
 * Integrates with the Vercel API for:
 * - Creating and managing Vercel projects
 * - Managing environment variables
 * - Listing deployments
 * - Triggering deployments
 */

import { Vercel } from '@vercel/sdk';

// ============================================================================
// INTERFACES
// ============================================================================

export interface VercelProjectInfo {
  id: string;
  name: string;
  framework: string | null;
  createdAt: number;
  updatedAt: number;
  link?: {
    type: string;
    org: string;
    repo: string;
  };
  targets?: Record<string, {
    id: string;
    url: string;
    readyState: string;
    createdAt: number;
  }>;
  latestDeployments?: Array<{
    uid: string;
    url: string;
    state: string;
    created: number;
    target: string | null;
  }>;
}

export interface VercelDeploymentInfo {
  uid: string;
  url: string;
  state: string;
  created: number;
  target: string | null;
  inspectorUrl: string;
  readyState: string;
  name: string;
  meta?: Record<string, unknown>;
}

export interface VercelEnvVarInfo {
  id: string;
  key: string;
  value: string;
  type: 'plain' | 'encrypted' | 'secret' | 'sensitive';
  target: string[];
  gitBranch: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProjectOptions {
  name: string;
  framework?: string;
  gitRepository?: {
    repo: string;
    type: string;
  };
  buildCommand?: string;
  installCommand?: string;
  rootDirectory?: string;
}

export interface CreateEnvVarOptions {
  key: string;
  value: string;
  type?: 'plain' | 'encrypted' | 'secret' | 'sensitive';
  target: string[];
  gitBranch?: string;
}

export interface VercelDomainInfo {
  name: string;
  apexName: string;
  verified: boolean;
  gitBranch: string | null;
  redirect: string | null;
  redirectStatusCode: number | null;
  createdAt: number;
  updatedAt: number;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
}

export interface AddDomainOptions {
  name: string;
  gitBranch?: string;
  redirect?: string;
  redirectStatusCode?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

class VercelService {
  private client: Vercel | null = null;
  private initialized = false;
  private teamId: string | null = null;

  async initialize(): Promise<void> {
    const token = process.env.VERCEL_TOKEN || null;
    this.teamId = process.env.VERCEL_TEAM_ID || null;

    if (token) {
      this.client = new Vercel({ bearerToken: token });
      console.log(`VercelService initialized${this.teamId ? ` (team: ${this.teamId})` : ''}`);
    } else {
      console.log('VercelService: No VERCEL_TOKEN configured - Vercel features disabled');
    }

    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && !!this.client;
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  private getClient(): Vercel {
    if (!this.client) {
      throw new Error('Vercel API token not configured. Set VERCEL_TOKEN environment variable.');
    }
    return this.client;
  }

  private teamParams() {
    return this.teamId ? { teamId: this.teamId } : {};
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  async getStatus(): Promise<{ configured: boolean; user?: { username: string; email: string }; teamId?: string }> {
    if (!this.client) {
      return { configured: false };
    }

    try {
      const user = await this.getClient().user.getAuthUser();
      return {
        configured: true,
        user: {
          username: (user as any).user?.username || (user as any).username || 'unknown',
          email: (user as any).user?.email || (user as any).email || 'unknown',
        },
        teamId: this.teamId || undefined,
      };
    } catch (error) {
      console.error('[VercelService] Failed to get status:', (error as Error).message);
      return { configured: true, user: undefined };
    }
  }

  // ==========================================================================
  // PROJECTS
  // ==========================================================================

  async listProjects(): Promise<VercelProjectInfo[]> {
    const client = this.getClient();

    const result: any = await client.projects.getProjects({
      ...this.teamParams(),
    });

    return (result.projects || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      framework: p.framework || null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      link: p.link ? {
        type: p.link.type,
        org: p.link.org,
        repo: p.link.repo,
      } : undefined,
      targets: p.targets,
      latestDeployments: p.latestDeployments?.map((d: any) => ({
        uid: d.id || d.uid,
        url: d.url,
        state: d.readyState || d.state,
        created: d.createdAt || d.created,
        target: d.target || null,
      })),
    }));
  }

  async getProject(idOrName: string): Promise<VercelProjectInfo> {
    const client = this.getClient();

    const p: any = await (client.projects as any).getProject({
      idOrName,
      ...this.teamParams(),
    });

    return {
      id: p.id,
      name: p.name,
      framework: p.framework || null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      link: p.link ? {
        type: p.link.type,
        org: p.link.org,
        repo: p.link.repo,
      } : undefined,
      targets: p.targets,
      latestDeployments: p.latestDeployments?.map((d: any) => ({
        uid: d.id || d.uid,
        url: d.url,
        state: d.readyState || d.state,
        created: d.createdAt || d.created,
        target: d.target || null,
      })),
    };
  }

  async createProject(options: CreateProjectOptions): Promise<VercelProjectInfo> {
    const client = this.getClient();

    const body: any = {
      name: options.name,
      framework: options.framework || null,
      buildCommand: options.buildCommand || null,
      installCommand: options.installCommand || null,
      rootDirectory: options.rootDirectory || null,
    };

    if (options.gitRepository) {
      body.gitRepository = {
        repo: options.gitRepository.repo,
        type: options.gitRepository.type || 'github',
      };
    }

    const p: any = await client.projects.createProject({
      ...this.teamParams(),
      requestBody: body,
    });

    return {
      id: p.id,
      name: p.name,
      framework: p.framework || null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      link: p.link ? {
        type: p.link.type,
        org: p.link.org,
        repo: p.link.repo,
      } : undefined,
    };
  }

  async deleteProject(idOrName: string): Promise<void> {
    const client = this.getClient();

    await client.projects.deleteProject({
      idOrName,
      ...this.teamParams(),
    });
  }

  // ==========================================================================
  // ENVIRONMENT VARIABLES
  // ==========================================================================

  async getEnvVars(projectId: string): Promise<VercelEnvVarInfo[]> {
    const client = this.getClient();

    const result: any = await client.projects.filterProjectEnvs({
      idOrName: projectId,
      ...this.teamParams(),
    });

    return (result.envs || []).map((env: any) => ({
      id: env.id,
      key: env.key,
      value: env.value || '',
      type: env.type || 'plain',
      target: env.target || [],
      gitBranch: env.gitBranch || null,
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
    }));
  }

  async createEnvVar(projectId: string, options: CreateEnvVarOptions): Promise<VercelEnvVarInfo> {
    const client = this.getClient();

    const result: any = await client.projects.createProjectEnv({
      idOrName: projectId,
      upsert: 'true',
      ...this.teamParams(),
      requestBody: {
        key: options.key,
        value: options.value,
        type: options.type || 'encrypted',
        target: options.target as any,
        gitBranch: options.gitBranch,
      },
    });

    const env = result.created?.[0] || result;
    return {
      id: env.id,
      key: env.key,
      value: env.value || '',
      type: env.type || 'plain',
      target: env.target || [],
      gitBranch: env.gitBranch || null,
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
    };
  }

  async updateEnvVar(projectId: string, envId: string, updates: Partial<CreateEnvVarOptions>): Promise<VercelEnvVarInfo> {
    const client = this.getClient();

    const result: any = await client.projects.editProjectEnv({
      idOrName: projectId,
      id: envId,
      ...this.teamParams(),
      requestBody: {
        value: updates.value,
        type: updates.type,
        target: updates.target as any,
        gitBranch: updates.gitBranch,
      },
    });

    return {
      id: result.id,
      key: result.key,
      value: result.value || '',
      type: result.type || 'plain',
      target: result.target || [],
      gitBranch: result.gitBranch || null,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  async deleteEnvVar(projectId: string, envId: string): Promise<void> {
    const client = this.getClient();

    await client.projects.removeProjectEnv({
      idOrName: projectId,
      id: envId,
      ...this.teamParams(),
    });
  }

  // ==========================================================================
  // DEPLOYMENTS
  // ==========================================================================

  async listDeployments(projectId: string, limit: number = 10): Promise<VercelDeploymentInfo[]> {
    const client = this.getClient();

    const result: any = await client.deployments.getDeployments({
      projectId,
      limit,
      ...this.teamParams(),
    });

    return (result.deployments || []).map((d: any) => ({
      uid: d.uid,
      url: d.url,
      state: d.state,
      created: d.created,
      target: d.target || null,
      inspectorUrl: d.inspectorUrl || '',
      readyState: d.readyState || d.state,
      name: d.name || '',
      meta: d.meta,
    }));
  }

  async getDeployment(deploymentId: string): Promise<VercelDeploymentInfo> {
    const client = this.getClient();

    const d: any = await client.deployments.getDeployment({
      idOrUrl: deploymentId,
      ...this.teamParams(),
    });

    return {
      uid: d.uid || d.id,
      url: d.url,
      state: d.state,
      created: d.created,
      target: d.target || null,
      inspectorUrl: d.inspectorUrl || '',
      readyState: d.readyState || d.state,
      name: d.name || '',
      meta: d.meta,
    };
  }

  async createDeployment(projectId: string, options?: {
    target?: 'production' | 'preview';
    gitBranch?: string;
  }): Promise<VercelDeploymentInfo> {
    const client = this.getClient();

    // Get project to find git source info
    const project = await this.getProject(projectId);

    const body: any = {
      name: project.name,
      target: options?.target || 'production',
      project: projectId,
    };

    if (project.link) {
      body.gitSource = {
        type: project.link.type || 'github',
        org: project.link.org,
        repo: project.link.repo,
        ref: options?.gitBranch || 'main',
      };
    }

    const d: any = await client.deployments.createDeployment({
      ...this.teamParams(),
      requestBody: body,
    });

    return {
      uid: d.id || d.uid,
      url: d.url,
      state: d.state || 'BUILDING',
      created: d.created || Date.now(),
      target: d.target || null,
      inspectorUrl: d.inspectorUrl || '',
      readyState: d.readyState || 'BUILDING',
      name: d.name || '',
      meta: d.meta,
    };
  }

  // ==========================================================================
  // DOMAINS
  // ==========================================================================

  private mapDomain(d: any): VercelDomainInfo {
    return {
      name: d.name,
      apexName: d.apexName || d.name,
      verified: d.verified ?? false,
      gitBranch: d.gitBranch || null,
      redirect: d.redirect || null,
      redirectStatusCode: d.redirectStatusCode || null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      verification: d.verification,
    };
  }

  async getDomains(projectId: string): Promise<VercelDomainInfo[]> {
    const client = this.getClient();

    const result: any = await (client.projects as any).getProjectDomains({
      idOrName: projectId,
      ...this.teamParams(),
    });

    return (result.domains || []).map((d: any) => this.mapDomain(d));
  }

  async addDomain(projectId: string, options: AddDomainOptions): Promise<VercelDomainInfo> {
    const client = this.getClient();

    const d: any = await (client.projects as any).addProjectDomain({
      idOrName: projectId,
      ...this.teamParams(),
      requestBody: {
        name: options.name,
        gitBranch: options.gitBranch,
        redirect: options.redirect,
        redirectStatusCode: options.redirectStatusCode,
      },
    });

    return this.mapDomain(d);
  }

  async removeDomain(projectId: string, domain: string): Promise<void> {
    const client = this.getClient();

    await (client.projects as any).removeProjectDomain({
      idOrName: projectId,
      domain,
      ...this.teamParams(),
    });
  }

  async verifyDomain(projectId: string, domain: string): Promise<VercelDomainInfo> {
    const client = this.getClient();

    const d: any = await (client.projects as any).verifyProjectDomain({
      idOrName: projectId,
      domain,
      ...this.teamParams(),
    });

    return this.mapDomain(d);
  }

  async getDomain(projectId: string, domain: string): Promise<VercelDomainInfo> {
    const client = this.getClient();

    const d: any = await (client.projects as any).getProjectDomain({
      idOrName: projectId,
      domain,
      ...this.teamParams(),
    });

    return this.mapDomain(d);
  }
}

export const vercelService = new VercelService();
