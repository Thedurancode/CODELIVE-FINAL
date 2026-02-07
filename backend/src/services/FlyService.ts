/**
 * Fly.io Service
 *
 * Integrates with the Fly.io API for:
 * - Listing and creating Fly apps
 * - Managing machines (start, stop, restart, delete)
 * - Managing certificates (custom domains) via GraphQL
 * - Managing secrets via GraphQL
 */

// ============================================================================
// INTERFACES
// ============================================================================

export interface FlyAppInfo {
  id: string;
  name: string;
  organization: string;
  hostname: string;
  status: string;
  currentRelease?: {
    id: string;
    version: number;
    imageRef: string;
    createdAt: string;
  };
  machineCount?: number;
}

export interface FlyMachineInfo {
  id: string;
  name: string;
  state: string;
  region: string;
  image: string;
  createdAt: string;
  updatedAt: string;
  privateIp?: string;
  config?: Record<string, unknown>;
}

export interface FlyCertificateInfo {
  id: string;
  hostname: string;
  configured: boolean;
  acmeDnsConfigured: boolean;
  certificateAuthority: string;
  createdAt: string;
  source: string;
  clientStatus: string;
  dnsValidationInstructions?: string;
  dnsValidationHostname?: string;
  dnsValidationTarget?: string;
}

export interface FlySecretInfo {
  name: string;
  digest: string;
  createdAt: string;
}

export interface CreateAppOptions {
  name: string;
  org?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

class FlyService {
  private token: string | null = null;
  private initialized = false;

  private static readonly MACHINES_API = 'https://api.machines.dev/v1';
  private static readonly GRAPHQL_API = 'https://api.fly.io/graphql';

  async initialize(): Promise<void> {
    this.token = process.env.FLY_API_TOKEN || null;

    if (this.token) {
      console.log('FlyService initialized');
    } else {
      console.log('FlyService: No FLY_API_TOKEN configured - Fly.io features disabled');
    }

    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && !!this.token;
  }

  isConfigured(): boolean {
    return !!this.token;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private getToken(): string {
    if (!this.token) {
      throw new Error('Fly.io API token not configured. Set FLY_API_TOKEN environment variable.');
    }
    return this.token;
  }

  private async machinesApi<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const url = `${FlyService.MACHINES_API}${path}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Fly.io API error (${res.status}): ${body}`);
    }

    // Some endpoints return empty body (e.g. DELETE, start, stop)
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  private async graphql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const token = this.getToken();

    const res = await fetch(FlyService.GRAPHQL_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Fly.io GraphQL error (${res.status}): ${body}`);
    }

    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`Fly.io GraphQL error: ${json.errors.map((e: any) => e.message).join(', ')}`);
    }

    return json.data as T;
  }

  // ==========================================================================
  // MAPPERS
  // ==========================================================================

  private mapApp(a: any): FlyAppInfo {
    return {
      id: a.id || a.name,
      name: a.name,
      organization: a.organization?.slug || a.org_slug || '',
      hostname: a.hostname || `${a.name}.fly.dev`,
      status: a.status || 'unknown',
      currentRelease: a.currentRelease || undefined,
      machineCount: a.machine_count ?? a.machineCount ?? undefined,
    };
  }

  private mapMachine(m: any): FlyMachineInfo {
    return {
      id: m.id,
      name: m.name || m.id,
      state: m.state,
      region: m.region,
      image: m.config?.image || m.image_ref?.repository || 'unknown',
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      privateIp: m.private_ip,
      config: m.config,
    };
  }

  private mapCertificate(c: any): FlyCertificateInfo {
    return {
      id: c.id,
      hostname: c.hostname,
      configured: c.configured ?? false,
      acmeDnsConfigured: c.acmeDnsConfigured ?? false,
      certificateAuthority: c.certificateAuthority || '',
      createdAt: c.createdAt,
      source: c.source || 'fly',
      clientStatus: c.clientStatus || 'unknown',
      dnsValidationInstructions: c.dnsValidationInstructions || undefined,
      dnsValidationHostname: c.dnsValidationHostname || undefined,
      dnsValidationTarget: c.dnsValidationTarget || undefined,
    };
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  async getStatus(): Promise<{ configured: boolean; username?: string }> {
    if (!this.token) {
      return { configured: false };
    }

    try {
      // Quick auth check — list apps (limit response)
      await this.machinesApi('/apps?org_slug=personal');
      return { configured: true };
    } catch {
      return { configured: false };
    }
  }

  // ==========================================================================
  // APPS
  // ==========================================================================

  async listApps(): Promise<FlyAppInfo[]> {
    const data = await this.machinesApi<any>('/apps?org_slug=personal');
    const apps = data.apps || data.total_apps ? data.apps : (Array.isArray(data) ? data : []);
    return (apps || []).map((a: any) => this.mapApp(a));
  }

  async getApp(appName: string): Promise<FlyAppInfo> {
    const data = await this.machinesApi<any>(`/apps/${encodeURIComponent(appName)}`);
    return this.mapApp(data);
  }

  async createApp(options: CreateAppOptions): Promise<FlyAppInfo> {
    const data = await this.machinesApi<any>('/apps', {
      method: 'POST',
      body: JSON.stringify({
        app_name: options.name,
        org_slug: options.org || 'personal',
      }),
    });
    return this.mapApp(data);
  }

  // ==========================================================================
  // MACHINES
  // ==========================================================================

  async listMachines(appName: string): Promise<FlyMachineInfo[]> {
    const data = await this.machinesApi<any[]>(`/apps/${encodeURIComponent(appName)}/machines`);
    return (Array.isArray(data) ? data : []).map((m: any) => this.mapMachine(m));
  }

  async getMachine(appName: string, machineId: string): Promise<FlyMachineInfo> {
    const data = await this.machinesApi<any>(
      `/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}`
    );
    return this.mapMachine(data);
  }

  async startMachine(appName: string, machineId: string): Promise<void> {
    await this.machinesApi(
      `/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}/start`,
      { method: 'POST' }
    );
  }

  async stopMachine(appName: string, machineId: string): Promise<void> {
    await this.machinesApi(
      `/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}/stop`,
      { method: 'POST' }
    );
  }

  async restartMachine(appName: string, machineId: string): Promise<void> {
    await this.machinesApi(
      `/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}/restart`,
      { method: 'POST' }
    );
  }

  async deleteMachine(appName: string, machineId: string): Promise<void> {
    await this.machinesApi(
      `/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}`,
      { method: 'DELETE' }
    );
  }

  // ==========================================================================
  // CERTIFICATES (GraphQL)
  // ==========================================================================

  async listCertificates(appName: string): Promise<FlyCertificateInfo[]> {
    const data = await this.graphql<any>(
      `query($appName: String!) {
        app(name: $appName) {
          certificates {
            nodes {
              id
              hostname
              configured
              acmeDnsConfigured
              certificateAuthority
              createdAt
              source
              clientStatus
              dnsValidationInstructions
              dnsValidationHostname
              dnsValidationTarget
            }
          }
        }
      }`,
      { appName }
    );

    const nodes = data.app?.certificates?.nodes || [];
    return nodes.map((c: any) => this.mapCertificate(c));
  }

  async addCertificate(appName: string, hostname: string): Promise<FlyCertificateInfo> {
    // addCertificate mutation requires the app ID, so look it up first
    const app = await this.getApp(appName);

    const data = await this.graphql<any>(
      `mutation($appId: ID!, $hostname: String!) {
        addCertificate(appId: $appId, hostname: $hostname) {
          certificate {
            id
            hostname
            configured
            acmeDnsConfigured
            certificateAuthority
            createdAt
            source
            clientStatus
            dnsValidationInstructions
            dnsValidationHostname
            dnsValidationTarget
          }
        }
      }`,
      { appId: app.id, hostname }
    );

    return this.mapCertificate(data.addCertificate.certificate);
  }

  async deleteCertificate(appName: string, hostname: string): Promise<void> {
    const app = await this.getApp(appName);

    await this.graphql(
      `mutation($appId: ID!, $hostname: String!) {
        deleteCertificate(appId: $appId, hostname: $hostname) {
          app { name }
        }
      }`,
      { appId: app.id, hostname }
    );
  }

  async checkCertificate(appName: string, hostname: string): Promise<FlyCertificateInfo> {
    const data = await this.graphql<any>(
      `query($appName: String!, $hostname: String!) {
        app(name: $appName) {
          certificate(hostname: $hostname) {
            id
            hostname
            configured
            acmeDnsConfigured
            certificateAuthority
            createdAt
            source
            clientStatus
            dnsValidationInstructions
            dnsValidationHostname
            dnsValidationTarget
          }
        }
      }`,
      { appName, hostname }
    );

    return this.mapCertificate(data.app.certificate);
  }

  // ==========================================================================
  // SECRETS (GraphQL)
  // ==========================================================================

  async listSecrets(appName: string): Promise<FlySecretInfo[]> {
    const data = await this.graphql<any>(
      `query($appName: String!) {
        app(name: $appName) {
          secrets {
            name
            digest
            createdAt
          }
        }
      }`,
      { appName }
    );

    return (data.app?.secrets || []).map((s: any) => ({
      name: s.name,
      digest: s.digest,
      createdAt: s.createdAt,
    }));
  }

  async setSecrets(appName: string, secrets: Array<{ key: string; value: string }>): Promise<void> {
    const app = await this.getApp(appName);

    await this.graphql(
      `mutation($input: SetSecretsInput!) {
        setSecrets(input: $input) {
          app { name }
        }
      }`,
      {
        input: {
          appId: app.id,
          secrets: secrets.map(s => ({ key: s.key, value: s.value })),
        },
      }
    );
  }
}

export const flyService = new FlyService();
