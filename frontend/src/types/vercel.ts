/**
 * Vercel Integration Types
 */

export interface VercelProject {
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
  latestDeployments?: VercelDeployment[];
}

export interface VercelDeployment {
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

export interface VercelEnvVar {
  id: string;
  key: string;
  value: string;
  type: 'plain' | 'encrypted' | 'secret' | 'sensitive';
  target: string[];
  gitBranch: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface VercelStatus {
  configured: boolean;
  user?: {
    username: string;
    email: string;
  };
  teamId?: string;
}

export interface CreateVercelProjectOptions {
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

export interface CreateVercelEnvVarOptions {
  key: string;
  value: string;
  type?: 'plain' | 'encrypted' | 'secret' | 'sensitive';
  target: string[];
  gitBranch?: string;
}

export interface VercelDomain {
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

export interface AddVercelDomainOptions {
  name: string;
  gitBranch?: string;
  redirect?: string;
  redirectStatusCode?: number;
}

export type VercelFramework =
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'nuxtjs'
  | 'svelte'
  | 'gatsby'
  | 'angular'
  | 'remix'
  | 'astro'
  | 'hugo'
  | null;

export const FRAMEWORK_LABELS: Record<string, string> = {
  nextjs: 'Next.js',
  react: 'React (Create React App)',
  vue: 'Vue.js',
  nuxtjs: 'Nuxt.js',
  svelte: 'SvelteKit',
  gatsby: 'Gatsby',
  angular: 'Angular',
  remix: 'Remix',
  astro: 'Astro',
  hugo: 'Hugo',
};

export const DEPLOYMENT_STATE_COLORS: Record<string, string> = {
  READY: 'bg-green-500',
  BUILDING: 'bg-yellow-500',
  ERROR: 'bg-red-500',
  CANCELED: 'bg-gray-500',
  QUEUED: 'bg-blue-500',
  INITIALIZING: 'bg-blue-500',
};

export const DEPLOYMENT_STATE_LABELS: Record<string, string> = {
  READY: 'Ready',
  BUILDING: 'Building',
  ERROR: 'Error',
  CANCELED: 'Canceled',
  QUEUED: 'Queued',
  INITIALIZING: 'Initializing',
};
