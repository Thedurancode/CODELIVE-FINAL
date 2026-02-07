/**
 * Fly.io Integration Types
 */

export interface FlyApp {
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

export interface FlyMachine {
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

export interface FlyCertificate {
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

export interface FlySecret {
  name: string;
  digest: string;
  createdAt: string;
}

export interface FlyStatus {
  configured: boolean;
  username?: string;
}

export interface CreateFlyAppOptions {
  name: string;
  org?: string;
}

export const MACHINE_STATE_COLORS: Record<string, string> = {
  started: 'bg-green-500',
  running: 'bg-green-500',
  stopped: 'bg-gray-500',
  created: 'bg-blue-500',
  destroying: 'bg-red-500',
  destroyed: 'bg-red-800',
  replacing: 'bg-yellow-500',
  suspended: 'bg-purple-500',
};

export const MACHINE_STATE_LABELS: Record<string, string> = {
  started: 'Running',
  running: 'Running',
  stopped: 'Stopped',
  created: 'Created',
  destroying: 'Destroying',
  destroyed: 'Destroyed',
  replacing: 'Replacing',
  suspended: 'Suspended',
};
