/**
 * Codelive Service
 *
 * Integrates with Codelive (Automaker) for:
 * - Feature/task management
 * - AI agent execution
 * - Real-time event streaming via WebSocket
 * - Bidirectional sync between Dispotree tasks and Codelive features
 */

import WebSocket from 'ws';
import { logger } from './LoggerService';

// Codelive Feature interface matching Automaker's feature structure
export interface CodeliveFeature {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'ready' | 'in-progress' | 'review' | 'done';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  labels?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface CreateFeatureData {
  title: string;
  description: string;
  status?: 'backlog' | 'ready' | 'in-progress' | 'review' | 'done';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  labels?: string[];
  metadata?: Record<string, unknown>;
}

export interface CodeliveStatus {
  connected: boolean;
  version?: string;
  uptime?: number;
}

export interface ProjectAnalysis {
  projectPath: string;
  structure: Record<string, unknown>;
  languages: string[];
  frameworks: string[];
  analyzedAt: string;
}

export interface AgentRunOptions {
  featureId: string;
  projectPath: string;
  autoCommit?: boolean;
  planningMode?: boolean;
}

export interface CodeliveEvent {
  type: string;
  featureId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

type EventHandler = (event: CodeliveEvent) => void;

class CodeliveService {
  private initialized = false;
  private baseUrl: string = '';
  private wsUrl: string = '';
  private apiKey: string | null = null;
  private ws: WebSocket | null = null;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    this.baseUrl = process.env.CODELIVE_URL || 'http://localhost:3008';
    this.wsUrl = process.env.CODELIVE_WS_URL || 'ws://localhost:3008/api/events';
    this.apiKey = process.env.CODELIVE_API_KEY || null;

    // Test connection to Codelive server
    try {
      const status = await this.getStatus();
      if (status.connected) {
        logger.info('CodeliveService initialized and connected', {
          baseUrl: this.baseUrl,
          version: status.version,
        });

        // Connect WebSocket for real-time events
        if (process.env.CODELIVE_AUTO_CONNECT_WS !== 'false') {
          this.connectWebSocket();
        }
      } else {
        logger.warn('CodeliveService initialized but Codelive server not responding');
      }
    } catch (error) {
      logger.warn('CodeliveService initialized but Codelive server not available', {}, error);
    }

    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }

  isConfigured(): boolean {
    return !!this.baseUrl;
  }

  // =========================================================================
  // HTTP API Methods
  // =========================================================================

  /**
   * Make a request to the Codelive API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      const err = new Error(`Codelive API error: ${error.message || response.statusText}`) as Error & { status: number };
      err.status = response.status;
      throw err;
    }

    return response.json();
  }

  /**
   * Check Codelive server status
   */
  async getStatus(): Promise<CodeliveStatus> {
    try {
      const response = await this.request<{ status: string; uptime?: number; version?: string }>('/api/health');
      return {
        connected: response.status === 'ok',
        version: response.version,
        uptime: response.uptime,
      };
    } catch (error) {
      return { connected: false };
    }
  }

  /**
   * List all features for a project
   */
  async listFeatures(projectPath: string): Promise<CodeliveFeature[]> {
    const response = await this.request<{ success: boolean; features: CodeliveFeature[] }>(
      '/api/features/list',
      {
        method: 'POST',
        body: JSON.stringify({ projectPath }),
      }
    );
    return response.features || [];
  }

  /**
   * Get a single feature by ID
   */
  async getFeature(projectPath: string, featureId: string): Promise<CodeliveFeature | null> {
    try {
      const response = await this.request<{ success: boolean; feature: CodeliveFeature }>(
        '/api/features/get',
        {
          method: 'POST',
          body: JSON.stringify({ projectPath, featureId }),
        }
      );
      return response.feature;
    } catch {
      return null;
    }
  }

  /**
   * Create a new feature
   */
  async createFeature(projectPath: string, feature: CreateFeatureData): Promise<CodeliveFeature> {
    const response = await this.request<{ success: boolean; feature: CodeliveFeature }>(
      '/api/features/create',
      {
        method: 'POST',
        body: JSON.stringify({
          projectPath,
          feature,
        }),
      }
    );
    return response.feature;
  }

  /**
   * Update a feature
   */
  async updateFeature(
    projectPath: string,
    featureId: string,
    updates: Partial<CreateFeatureData>
  ): Promise<CodeliveFeature> {
    const response = await this.request<{ success: boolean; feature: CodeliveFeature }>(
      '/api/features/update',
      {
        method: 'POST',
        body: JSON.stringify({
          projectPath,
          featureId,
          updates,
        }),
      }
    );
    return response.feature;
  }

  /**
   * Delete a feature
   */
  async deleteFeature(projectPath: string, featureId: string): Promise<boolean> {
    try {
      await this.request('/api/features/delete', {
        method: 'POST',
        body: JSON.stringify({ projectPath, featureId }),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run AI agent on a feature
   */
  async runFeature(options: AgentRunOptions): Promise<void> {
    await this.request('/api/auto-mode/run-feature', {
      method: 'POST',
      body: JSON.stringify({
        projectPath: options.projectPath,
        featureId: options.featureId,
        autoCommit: options.autoCommit ?? false,
        planningMode: options.planningMode ?? false,
      }),
    });
    logger.info('Codelive agent started', { featureId: options.featureId });
  }

  /**
   * Stop a running agent
   */
  async stopFeature(featureId: string): Promise<void> {
    await this.request('/api/auto-mode/stop-feature', {
      method: 'POST',
      body: JSON.stringify({ featureId }),
    });
    logger.info('Codelive agent stopped', { featureId });
  }

  /**
   * Resume a paused feature
   */
  async resumeFeature(projectPath: string, featureId: string): Promise<void> {
    await this.request('/api/auto-mode/resume-feature', {
      method: 'POST',
      body: JSON.stringify({ projectPath, featureId }),
    });
    logger.info('Codelive agent resumed', { featureId });
  }

  /**
   * Get agent output for a feature
   */
  async getAgentOutput(projectPath: string, featureId: string): Promise<string> {
    const response = await this.request<{ success: boolean; content: string }>(
      '/api/features/agent-output',
      {
        method: 'POST',
        body: JSON.stringify({ projectPath, featureId }),
      }
    );
    return response.content || '';
  }

  /**
   * Get auto-mode status for running features
   */
  async getAutoModeStatus(): Promise<Record<string, unknown>> {
    const response = await this.request<{ success: boolean; [key: string]: unknown }>(
      '/api/auto-mode/status',
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );
    const { success, ...status } = response;
    return status;
  }

  /**
   * Analyze a project for AI context (starts analysis in background)
   */
  async analyzeProject(projectPath: string): Promise<{ message: string }> {
    const response = await this.request<{ success: boolean; message: string }>(
      '/api/auto-mode/analyze-project',
      {
        method: 'POST',
        body: JSON.stringify({ projectPath }),
      }
    );
    return { message: response.message };
  }

  /**
   * Generate AI suggestions for a project
   */
  async generateSuggestions(projectPath: string): Promise<void> {
    await this.request('/api/suggestions/generate', {
      method: 'POST',
      body: JSON.stringify({ projectPath }),
    });
    logger.info('Codelive suggestions generation started', { projectPath });
  }

  /**
   * Stop suggestions generation
   */
  async stopSuggestions(projectPath: string): Promise<void> {
    await this.request('/api/suggestions/stop', {
      method: 'POST',
      body: JSON.stringify({ projectPath }),
    });
  }

  /**
   * Commit feature changes
   */
  async commitFeature(projectPath: string, featureId: string, message?: string): Promise<void> {
    await this.request('/api/auto-mode/commit-feature', {
      method: 'POST',
      body: JSON.stringify({ projectPath, featureId, message }),
    });
    logger.info('Codelive feature changes committed', { featureId });
  }

  /**
   * Approve a plan for a feature in planning mode
   */
  async approvePlan(projectPath: string, featureId: string): Promise<void> {
    await this.request('/api/auto-mode/approve-plan', {
      method: 'POST',
      body: JSON.stringify({ projectPath, featureId }),
    });
    logger.info('Codelive plan approved', { featureId });
  }

  /**
   * Send follow-up instructions to a running agent
   */
  async followUpFeature(
    projectPath: string,
    featureId: string,
    message: string
  ): Promise<void> {
    await this.request('/api/auto-mode/follow-up-feature', {
      method: 'POST',
      body: JSON.stringify({ projectPath, featureId, message }),
    });
    logger.info('Codelive follow-up sent', { featureId });
  }

  // =========================================================================
  // WebSocket Methods for Real-time Events
  // =========================================================================

  /**
   * Connect to Codelive WebSocket for real-time events
   */
  connectWebSocket(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        logger.info('Codelive WebSocket connected');
        this.reconnectAttempts = 0;

        // Start ping interval to keep connection alive
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.ping();
          }
        }, 30000);
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const event: CodeliveEvent = JSON.parse(data.toString());
          this.handleEvent(event);
        } catch (error) {
          logger.warn('Failed to parse Codelive event', {}, error);
        }
      });

      this.ws.on('close', () => {
        logger.warn('Codelive WebSocket disconnected');
        this.cleanupWebSocket();
        this.attemptReconnect();
      });

      this.ws.on('error', (error: Error) => {
        logger.error('Codelive WebSocket error', {}, error);
      });
    } catch (error) {
      logger.error('Failed to connect Codelive WebSocket', {}, error);
      this.attemptReconnect();
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    this.cleanupWebSocket();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    logger.info('Codelive WebSocket disconnected intentionally');
  }

  /**
   * Clean up WebSocket resources
   */
  private cleanupWebSocket(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Attempt to reconnect WebSocket
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('Max Codelive WebSocket reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`Attempting Codelive WebSocket reconnect in ${delay}ms`, {
      attempt: this.reconnectAttempts,
    });

    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  /**
   * Handle incoming WebSocket event
   */
  private handleEvent(event: CodeliveEvent): void {
    // Emit to specific event type handlers
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          logger.error('Codelive event handler error', { eventType: event.type }, error);
        }
      });
    }

    // Emit to wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          logger.error('Codelive wildcard event handler error', {}, error);
        }
      });
    }
  }

  /**
   * Subscribe to Codelive events
   * @returns Unsubscribe function
   */
  onEvent(eventType: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(eventType);
        }
      }
    };
  }

  /**
   * Check if WebSocket is connected
   */
  isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // =========================================================================
  // Sync Methods - Bridge between Dispotree and Codelive
  // =========================================================================

  /**
   * Map Dispotree task status to Codelive feature status
   */
  private mapTaskStatusToFeatureStatus(
    taskStatus: string
  ): 'backlog' | 'ready' | 'in-progress' | 'review' | 'done' {
    const mapping: Record<string, 'backlog' | 'ready' | 'in-progress' | 'review' | 'done'> = {
      pending: 'ready',
      in_progress: 'in-progress',
      completed: 'done',
      blocked: 'backlog',
      cancelled: 'done', // Treat cancelled as done in Codelive
    };
    return mapping[taskStatus] || 'backlog';
  }

  /**
   * Map Codelive feature status to Dispotree task status
   */
  private mapFeatureStatusToTaskStatus(
    featureStatus: string
  ): 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled' {
    const mapping: Record<string, 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'> = {
      backlog: 'pending',
      ready: 'pending',
      'in-progress': 'in_progress',
      review: 'in_progress',
      done: 'completed',
    };
    return mapping[featureStatus] || 'pending';
  }

  /**
   * Map Dispotree priority to Codelive priority
   */
  private mapTaskPriorityToFeaturePriority(
    taskPriority: string
  ): 'low' | 'normal' | 'high' | 'urgent' {
    const mapping: Record<string, 'low' | 'normal' | 'high' | 'urgent'> = {
      low: 'low',
      normal: 'normal',
      high: 'high',
      urgent: 'urgent',
    };
    return mapping[taskPriority] || 'normal';
  }

  /**
   * Create a Codelive feature from a Dispotree task
   */
  async createFeatureFromTask(
    projectPath: string,
    task: {
      id: string;
      title: string;
      description?: string | null;
      status: string;
      priority: string;
      tags?: string[];
      metadata?: Record<string, unknown> | null;
    }
  ): Promise<CodeliveFeature> {
    const feature = await this.createFeature(projectPath, {
      title: task.title,
      description: task.description || '',
      status: this.mapTaskStatusToFeatureStatus(task.status),
      priority: this.mapTaskPriorityToFeaturePriority(task.priority),
      labels: task.tags || [],
      metadata: {
        dispotreeTaskId: task.id,
        ...(task.metadata || {}),
      },
    });

    logger.info('Created Codelive feature from Dispotree task', {
      taskId: task.id,
      featureId: feature.id,
    });

    return feature;
  }

  /**
   * Create a Codelive feature from a GitHub issue
   */
  async createFeatureFromGitHubIssue(
    projectPath: string,
    issue: {
      id: number;
      number: number;
      title: string;
      body: string | null;
      state: 'open' | 'closed';
      html_url: string;
      labels: Array<{ name: string; color: string }>;
    }
  ): Promise<CodeliveFeature> {
    const feature = await this.createFeature(projectPath, {
      title: issue.title,
      description: issue.body || '',
      status: issue.state === 'closed' ? 'done' : 'ready',
      priority: 'normal',
      labels: issue.labels.map((l) => l.name),
      metadata: {
        githubIssueId: issue.id,
        githubIssueNumber: issue.number,
        githubIssueUrl: issue.html_url,
      },
    });

    logger.info('Created Codelive feature from GitHub issue', {
      issueNumber: issue.number,
      featureId: feature.id,
    });

    return feature;
  }

  /**
   * Convert Codelive feature data to Dispotree task fields
   */
  featureToTaskData(feature: CodeliveFeature): {
    title: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
    priority: string;
    tags: string[];
    metadata: Record<string, unknown>;
  } {
    return {
      title: feature.title,
      description: feature.description,
      status: this.mapFeatureStatusToTaskStatus(feature.status),
      priority: feature.priority || 'normal',
      tags: feature.labels || [],
      metadata: {
        codeliveFeatureId: feature.id,
        ...(feature.metadata || {}),
      },
    };
  }

  // =========================================================================
  // Deal Validation with AI Agent
  // =========================================================================

  /**
   * Use Codelive AI agent to validate a deal/property
   * Creates a temporary feature, runs analysis, and returns results
   */
  async validateDealWithAI(
    projectPath: string,
    dealInfo: {
      propertyId: number;
      address: string;
      documents: string[];
      requirements: string[];
    }
  ): Promise<{
    featureId: string;
    status: 'started' | 'error';
    error?: string;
  }> {
    try {
      // Create a validation feature
      const feature = await this.createFeature(projectPath, {
        title: `Validate Deal: ${dealInfo.address}`,
        description: `
## Deal Validation Request

**Property ID:** ${dealInfo.propertyId}
**Address:** ${dealInfo.address}

### Documents to Analyze
${dealInfo.documents.map((d) => `- ${d}`).join('\n')}

### Validation Requirements
${dealInfo.requirements.map((r) => `- ${r}`).join('\n')}

### Instructions
1. Analyze all provided documents
2. Check compliance with requirements
3. Identify any red flags or issues
4. Provide a summary with pass/fail status for each requirement
5. Generate an overall validation report
        `.trim(),
        status: 'ready',
        priority: 'high',
        labels: ['deal-validation', 'ai-review'],
        metadata: {
          validationType: 'deal',
          propertyId: dealInfo.propertyId,
          documentCount: dealInfo.documents.length,
        },
      });

      // Start the AI agent
      await this.runFeature({
        projectPath,
        featureId: feature.id,
        planningMode: true, // Use planning mode for review
      });

      return {
        featureId: feature.id,
        status: 'started',
      };
    } catch (error) {
      logger.error('Failed to start deal validation', { propertyId: dealInfo.propertyId }, error);
      return {
        featureId: '',
        status: 'error',
        error: (error as Error).message,
      };
    }
  }
}

export const codeliveService = new CodeliveService();
export default codeliveService;
