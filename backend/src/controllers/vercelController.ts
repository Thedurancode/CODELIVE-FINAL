/**
 * Vercel Controller
 *
 * Handles HTTP requests for Vercel project management.
 */

import { Request, Response } from 'express';
import { vercelService } from '../services/VercelService';

/**
 * Get Vercel integration status
 */
export const getStatus = async (_req: Request, res: Response) => {
  try {
    const status = await vercelService.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('[vercelController] getStatus error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * List Vercel projects
 */
export const listProjects = async (_req: Request, res: Response) => {
  try {
    const projects = await vercelService.listProjects();
    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('[vercelController] listProjects error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Get a single Vercel project
 */
export const getProject = async (req: Request, res: Response) => {
  try {
    const { idOrName } = req.params;
    const project = await vercelService.getProject(idOrName);
    res.json({ success: true, data: project });
  } catch (error) {
    console.error('[vercelController] getProject error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Create a new Vercel project
 */
export const createProject = async (req: Request, res: Response) => {
  try {
    const { name, framework, gitRepository, buildCommand, installCommand, rootDirectory } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const project = await vercelService.createProject({
      name,
      framework,
      gitRepository,
      buildCommand,
      installCommand,
      rootDirectory,
    });

    res.json({ success: true, data: project });
  } catch (error) {
    console.error('[vercelController] createProject error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Delete a Vercel project
 */
export const deleteProject = async (req: Request, res: Response) => {
  try {
    const { idOrName } = req.params;
    await vercelService.deleteProject(idOrName);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[vercelController] deleteProject error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * List environment variables for a Vercel project
 */
export const getEnvVars = async (req: Request, res: Response) => {
  try {
    const { idOrName } = req.params;
    const envVars = await vercelService.getEnvVars(idOrName);
    res.json({ success: true, data: envVars });
  } catch (error) {
    console.error('[vercelController] getEnvVars error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Create an environment variable
 */
export const createEnvVar = async (req: Request, res: Response) => {
  try {
    const { idOrName } = req.params;
    const { key, value, type, target, gitBranch } = req.body;

    if (!key || !value || !target) {
      return res.status(400).json({ success: false, error: 'key, value, and target are required' });
    }

    const envVar = await vercelService.createEnvVar(idOrName, {
      key,
      value,
      type,
      target,
      gitBranch,
    });

    res.json({ success: true, data: envVar });
  } catch (error) {
    console.error('[vercelController] createEnvVar error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Update an environment variable
 */
export const updateEnvVar = async (req: Request, res: Response) => {
  try {
    const { idOrName, envId } = req.params;
    const updates = req.body;

    const envVar = await vercelService.updateEnvVar(idOrName, envId, updates);
    res.json({ success: true, data: envVar });
  } catch (error) {
    console.error('[vercelController] updateEnvVar error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Delete an environment variable
 */
export const deleteEnvVar = async (req: Request, res: Response) => {
  try {
    const { idOrName, envId } = req.params;
    await vercelService.deleteEnvVar(idOrName, envId);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[vercelController] deleteEnvVar error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * List deployments for a Vercel project
 */
export const listDeployments = async (req: Request, res: Response) => {
  try {
    const { idOrName } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const deployments = await vercelService.listDeployments(idOrName, limit);
    res.json({ success: true, data: deployments });
  } catch (error) {
    console.error('[vercelController] listDeployments error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Create a deployment
 */
export const createDeployment = async (req: Request, res: Response) => {
  try {
    const { idOrName } = req.params;
    const { target, gitBranch } = req.body;

    const deployment = await vercelService.createDeployment(idOrName, { target, gitBranch });
    res.json({ success: true, data: deployment });
  } catch (error) {
    console.error('[vercelController] createDeployment error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * List domains for a Vercel project
 */
export const getDomains = async (req: Request, res: Response) => {
  try {
    const { idOrName } = req.params;
    const domains = await vercelService.getDomains(idOrName);
    res.json({ success: true, data: domains });
  } catch (error) {
    console.error('[vercelController] getDomains error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Add a domain to a Vercel project
 */
export const addDomain = async (req: Request, res: Response) => {
  try {
    const { idOrName } = req.params;
    const { name, gitBranch, redirect, redirectStatusCode } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const domain = await vercelService.addDomain(idOrName, {
      name,
      gitBranch,
      redirect,
      redirectStatusCode,
    });
    res.json({ success: true, data: domain });
  } catch (error) {
    console.error('[vercelController] addDomain error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Get details for a single domain
 */
export const getDomain = async (req: Request, res: Response) => {
  try {
    const { idOrName, domain } = req.params;
    const result = await vercelService.getDomain(idOrName, domain);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[vercelController] getDomain error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Remove a domain from a Vercel project
 */
export const removeDomain = async (req: Request, res: Response) => {
  try {
    const { idOrName, domain } = req.params;
    await vercelService.removeDomain(idOrName, domain);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[vercelController] removeDomain error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Verify a domain on a Vercel project
 */
export const verifyDomain = async (req: Request, res: Response) => {
  try {
    const { idOrName, domain } = req.params;
    const result = await vercelService.verifyDomain(idOrName, domain);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[vercelController] verifyDomain error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export default {
  getStatus,
  listProjects,
  getProject,
  createProject,
  deleteProject,
  getEnvVars,
  createEnvVar,
  updateEnvVar,
  deleteEnvVar,
  listDeployments,
  createDeployment,
  getDomains,
  addDomain,
  getDomain,
  removeDomain,
  verifyDomain,
};
