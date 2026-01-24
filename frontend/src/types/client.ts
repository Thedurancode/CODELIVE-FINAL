/**
 * Client Portal Types
 *
 * Types for the client portal feature.
 */

export interface ClientProject {
  id: string;
  title: string;
  description?: string;
  logoUrl?: string;
  status: string;
  hasGitHub: boolean;
  updatedAt: string;
}

export interface ClientIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string; color: string }>;
  user: { login: string; avatar_url: string } | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
}

export interface ClientPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  user: { login: string; avatar_url: string } | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
}

export interface ClientCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  } | null;
  committer: {
    name: string;
    email: string;
    date: string;
  } | null;
  html_url: string;
}

export interface ClientActivity {
  type: 'issue' | 'pr' | 'commit';
  date: string;
  title: string;
  description?: string;
  user?: string;
  state?: string;
  url?: string;
}

export interface InviteDetails {
  token: string;
  projectId: string;
  projectTitle: string;
  projectLogo?: string;
  invitedByName?: string;
  invitedByEmail?: string;
  clientEmail?: string;
  expiresAt: string | null;
  isExpired: boolean;
  isAccepted: boolean;
}

export interface ClientUser {
  id: string;
  email: string;
  name: string;
  role: string;
  projectCount?: number;
}

export interface ProjectClient {
  id: number;
  clientUserId?: string;
  clientEmail?: string;
  clientName?: string;
  status: 'pending' | 'active' | 'revoked';
  invitedAt: string;
  acceptedAt?: string;
  lastAccessedAt?: string;
  expiresAt?: string;
}
