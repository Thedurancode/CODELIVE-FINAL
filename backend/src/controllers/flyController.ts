/**
 * Fly.io Controller
 *
 * Handles HTTP requests for Fly.io app and machine management.
 */

import { Request, Response } from 'express';
import { flyService } from '../services/FlyService';

/**
 * Get Fly.io integration status
 */
export const getStatus = async (_req: Request, res: Response) => {
  try {
    const status = await flyService.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('[flyController] getStatus error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * List Fly.io apps
 */
export const listApps = async (_req: Request, res: Response) => {
  try {
    const apps = await flyService.listApps();
    res.json({ success: true, data: apps });
  } catch (error) {
    console.error('[flyController] listApps error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Get a single Fly.io app
 */
export const getApp = async (req: Request, res: Response) => {
  try {
    const { appName } = req.params;
    const app = await flyService.getApp(appName);
    res.json({ success: true, data: app });
  } catch (error) {
    console.error('[flyController] getApp error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Create a new Fly.io app
 */
export const createApp = async (req: Request, res: Response) => {
  try {
    const { name, org } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const app = await flyService.createApp({ name, org });
    res.json({ success: true, data: app });
  } catch (error) {
    console.error('[flyController] createApp error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * List machines for a Fly.io app
 */
export const listMachines = async (req: Request, res: Response) => {
  try {
    const { appName } = req.params;
    const machines = await flyService.listMachines(appName);
    res.json({ success: true, data: machines });
  } catch (error) {
    console.error('[flyController] listMachines error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Get a single machine
 */
export const getMachine = async (req: Request, res: Response) => {
  try {
    const { appName, machineId } = req.params;
    const machine = await flyService.getMachine(appName, machineId);
    res.json({ success: true, data: machine });
  } catch (error) {
    console.error('[flyController] getMachine error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Start a machine
 */
export const startMachine = async (req: Request, res: Response) => {
  try {
    const { appName, machineId } = req.params;
    await flyService.startMachine(appName, machineId);
    res.json({ success: true, data: { started: true } });
  } catch (error) {
    console.error('[flyController] startMachine error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Stop a machine
 */
export const stopMachine = async (req: Request, res: Response) => {
  try {
    const { appName, machineId } = req.params;
    await flyService.stopMachine(appName, machineId);
    res.json({ success: true, data: { stopped: true } });
  } catch (error) {
    console.error('[flyController] stopMachine error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Restart a machine
 */
export const restartMachine = async (req: Request, res: Response) => {
  try {
    const { appName, machineId } = req.params;
    await flyService.restartMachine(appName, machineId);
    res.json({ success: true, data: { restarted: true } });
  } catch (error) {
    console.error('[flyController] restartMachine error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Delete a machine
 */
export const deleteMachine = async (req: Request, res: Response) => {
  try {
    const { appName, machineId } = req.params;
    await flyService.deleteMachine(appName, machineId);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[flyController] deleteMachine error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * List certificates for a Fly.io app
 */
export const listCertificates = async (req: Request, res: Response) => {
  try {
    const { appName } = req.params;
    const certs = await flyService.listCertificates(appName);
    res.json({ success: true, data: certs });
  } catch (error) {
    console.error('[flyController] listCertificates error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Add a certificate (custom domain)
 */
export const addCertificate = async (req: Request, res: Response) => {
  try {
    const { appName } = req.params;
    const { hostname } = req.body;

    if (!hostname) {
      return res.status(400).json({ success: false, error: 'hostname is required' });
    }

    const cert = await flyService.addCertificate(appName, hostname);
    res.json({ success: true, data: cert });
  } catch (error) {
    console.error('[flyController] addCertificate error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Delete a certificate
 */
export const deleteCertificate = async (req: Request, res: Response) => {
  try {
    const { appName, hostname } = req.params;
    await flyService.deleteCertificate(appName, hostname);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[flyController] deleteCertificate error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Check certificate status
 */
export const checkCertificate = async (req: Request, res: Response) => {
  try {
    const { appName, hostname } = req.params;
    const cert = await flyService.checkCertificate(appName, hostname);
    res.json({ success: true, data: cert });
  } catch (error) {
    console.error('[flyController] checkCertificate error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * List secrets for a Fly.io app
 */
export const listSecrets = async (req: Request, res: Response) => {
  try {
    const { appName } = req.params;
    const secrets = await flyService.listSecrets(appName);
    res.json({ success: true, data: secrets });
  } catch (error) {
    console.error('[flyController] listSecrets error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

/**
 * Set secrets for a Fly.io app
 */
export const setSecrets = async (req: Request, res: Response) => {
  try {
    const { appName } = req.params;
    const { secrets } = req.body;

    if (!Array.isArray(secrets) || secrets.length === 0) {
      return res.status(400).json({ success: false, error: 'secrets array is required' });
    }

    await flyService.setSecrets(appName, secrets);
    res.json({ success: true, data: { set: true } });
  } catch (error) {
    console.error('[flyController] setSecrets error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export default {
  getStatus,
  listApps,
  getApp,
  createApp,
  listMachines,
  getMachine,
  startMachine,
  stopMachine,
  restartMachine,
  deleteMachine,
  listCertificates,
  addCertificate,
  deleteCertificate,
  checkCertificate,
  listSecrets,
  setSecrets,
};
