/**
 * ProxyPics API Integration Service
 *
 * Handles property photo orders via ProxyPics crowdsourced photography network.
 * - 180K+ photographers (Data Collectors) nationwide
 * - < 24 hour turnaround for exterior photos
 * - Supports Crowdsource and Direct platforms
 *
 * API Docs: https://proxypicsapi.docs.apiary.io/
 * Live API: https://api.proxypics.com/api/v3
 * Sandbox: https://sandbox.proxypics.com/api/v3
 */

export interface ProxyPicsConfig {
  apiKey: string;
  baseUrl?: string;
  webhookUrl?: string;
}

export interface PhotoTemplate {
  id: number;
  name: string;
  token: string;
  platform: 'crowdsource' | 'direct';
  tasks: { title: string; description: string }[];
  createdAt: string;
}

export interface PhotoOrder {
  id: number;
  orderId: string;
  address: string;
  smallAddress: string;
  city: string;
  state: string;
  zip: string;
  status: 'unassigned' | 'assigned' | 'upload_started' | 'completed' | 'fulfilled' | 'canceled' | 'expired' | 'on_hold';
  platform: 'crowdsource' | 'direct';
  cost: number;
  priceBoost?: number;
  unlimitedTasks: boolean;
  expiresAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  appointmentScheduledAt?: Date;
  downloadUrl?: string;
  downloadPhotosUrl?: string;
  downloadReportUrl?: string;
  externalId?: string;
  loanNumber?: string;
  additionalNotes?: string;
  tasks?: { id: number; title: string; description: string }[];
  latitude?: number;
  longitude?: number;
}

export interface PhotoOrderRequest {
  address: string | {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  templateToken?: string;
  platform?: 'crowdsource' | 'direct';
  expiresAt?: Date;
  priceBoost?: number;
  loanNumber?: string;
  externalId?: string;
  additionalNotes?: string;
  propertyOwnerPhone?: string;
  directDueDate?: Date;
  unlimitedTasks?: boolean;
  unlimitedTasksDescriptions?: string;
  tasks?: { title: string; description: string }[];
}

export interface PhotoOrderResponse {
  success: boolean;
  order?: PhotoOrder;
  error?: string;
  message?: string;
}

export interface ProxyPicsWebhook {
  id: number;
  url: string;
  method: 'get' | 'post';
  username?: string;
  password?: string;
}

export interface ProxyPicsMessage {
  id: number;
  text: string;
  senderId: string;
  senderName: string;
  photoRequestId: number;
  createdAt: string;
}

class ProxyPicsService {
  private apiKey: string | null = null;
  private baseUrl: string = 'https://sandbox.proxypics.com/api/v3';
  private webhookUrl: string | null = null;
  private initialized: boolean = false;
  private templates: PhotoTemplate[] = [];

  /**
   * Initialize the ProxyPics service
   */
  async initialize(config?: ProxyPicsConfig): Promise<void> {
    this.apiKey = config?.apiKey || process.env.PROXYPICS_API_KEY || null;
    this.baseUrl = config?.baseUrl || process.env.PROXYPICS_BASE_URL || 'https://sandbox.proxypics.com/api/v3';
    this.webhookUrl = config?.webhookUrl || process.env.PROXYPICS_WEBHOOK_URL || null;

    if (this.apiKey) {
      this.initialized = true;
      console.log('✅ ProxyPics Service initialized');

      // Fetch templates from API
      try {
        await this.fetchTemplates();
        console.log(`   Loaded ${this.templates.length} photo request templates`);
      } catch (error) {
        console.log('⚠️ Could not fetch ProxyPics templates');
      }
    } else {
      console.log('⚠️ ProxyPics Service disabled (missing PROXYPICS_API_KEY)');
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized && !!this.apiKey;
  }

  /**
   * Test connection to ProxyPics API
   */
  async testConnection(): Promise<boolean> {
    if (!this.isReady()) return false;

    try {
      const response = await fetch(`${this.baseUrl}/photo-request-templates?per_page=1`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch (error) {
      console.error('ProxyPics connection test failed:', error);
      return false;
    }
  }

  /**
   * Get available photo templates (Products)
   */
  async getTemplates(): Promise<PhotoTemplate[]> {
    if (this.templates.length === 0) {
      await this.fetchTemplates();
    }
    return this.templates;
  }

  /**
   * Fetch templates from API
   */
  private async fetchTemplates(): Promise<void> {
    if (!this.isReady()) return;

    try {
      const response = await fetch(`${this.baseUrl}/photo-request-templates`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        const templates = data.data || data;

        if (Array.isArray(templates)) {
          this.templates = templates.map((t: any) => ({
            id: t.id,
            name: t.name,
            token: t.token,
            platform: t.photo_request_platform || 'crowdsource',
            tasks: t.tasks || [],
            createdAt: t.created_at,
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  }

  /**
   * Create a photo request (order photos for a property)
   */
  async orderPhotos(request: PhotoOrderRequest): Promise<PhotoOrderResponse> {
    if (!this.isReady()) {
      return {
        success: false,
        error: 'ProxyPics service not configured',
      };
    }

    // Build full address string
    const fullAddress = typeof request.address === 'string'
      ? request.address
      : `${request.address.street}, ${request.address.city}, ${request.address.state} ${request.address.zip}`;

    // Calculate expiration (default 24h)
    const expiresAt = request.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);

    try {
      const body: any = {
        address: fullAddress,
        expires_at: expiresAt.toISOString(),
        photo_request_platform: request.platform || 'crowdsource',
      };

      // Use template if provided
      if (request.templateToken) {
        body.template_token = request.templateToken;
      } else if (request.tasks && request.tasks.length > 0) {
        body.tasks = request.tasks;
      }

      // Optional fields
      if (request.priceBoost) body.price_boost = request.priceBoost;
      if (request.loanNumber) body.loan_number = request.loanNumber;
      if (request.externalId) body.external_id = request.externalId;
      if (request.additionalNotes) body.additional_notes = request.additionalNotes;
      if (request.unlimitedTasks !== undefined) body.unlimited_tasks = request.unlimitedTasks;
      if (request.unlimitedTasksDescriptions) body.unlimited_tasks_descriptions = request.unlimitedTasksDescriptions;

      // Direct platform specific
      if (request.platform === 'direct') {
        if (request.propertyOwnerPhone) body.property_owner_phone = request.propertyOwnerPhone;
        if (request.directDueDate) body.direct_due_date = request.directDueDate.toISOString();
      }

      const response = await fetch(`${this.baseUrl}/photo-requests`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok && data.id) {
        const order = this.mapToPhotoOrder(data);
        console.log(`📸 ProxyPics order created: #${order.id} for ${order.smallAddress}`);

        return {
          success: true,
          order,
          message: `Photo request created. Expires: ${order.expiresAt?.toLocaleString()}`,
        };
      } else {
        return {
          success: false,
          error: data.errors?.join(', ') || data.error || 'Failed to create photo request',
        };
      }
    } catch (error) {
      console.error('ProxyPics order failed:', error);
      return {
        success: false,
        error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get photo request details
   */
  async getOrderStatus(orderId: string | number): Promise<PhotoOrderResponse> {
    if (!this.isReady()) {
      return { success: false, error: 'ProxyPics service not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/photo-requests/${orderId}`, {
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (response.ok && data.id) {
        return {
          success: true,
          order: this.mapToPhotoOrder(data),
        };
      } else {
        return {
          success: false,
          error: data.errors?.join(', ') || 'Order not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * List photo requests
   */
  async listOrders(options?: { page?: number; perPage?: number }): Promise<{ orders: PhotoOrder[]; total: number; page: number }> {
    if (!this.isReady()) return { orders: [], total: 0, page: 1 };

    try {
      const params = new URLSearchParams();
      if (options?.page) params.append('page', options.page.toString());
      if (options?.perPage) params.append('per_page', options.perPage.toString());

      const response = await fetch(`${this.baseUrl}/photo-requests?${params.toString()}`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        const orders = (data.data || []).map((o: any) => this.mapToPhotoOrder(o));
        const pagination = data.meta?.pagination || {};

        return {
          orders,
          total: pagination.total || orders.length,
          page: pagination.current_page || 1,
        };
      }

      return { orders: [], total: 0, page: 1 };
    } catch (error) {
      console.error('Failed to list ProxyPics orders:', error);
      return { orders: [], total: 0, page: 1 };
    }
  }

  /**
   * Cancel a photo request
   */
  async cancelOrder(orderId: string | number): Promise<boolean> {
    if (!this.isReady()) return false;

    try {
      const response = await fetch(`${this.baseUrl}/photo-requests/${orderId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to cancel ProxyPics order:', error);
      return false;
    }
  }

  /**
   * Approve a completed photo request
   */
  async approveOrder(orderId: string | number): Promise<PhotoOrderResponse> {
    if (!this.isReady()) {
      return { success: false, error: 'ProxyPics service not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/photo-requests/${orderId}/approve`, {
        method: 'PUT',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          order: this.mapToPhotoOrder(data),
          message: 'Photo request approved',
        };
      }

      return {
        success: false,
        error: data.errors?.join(', ') || 'Failed to approve',
      };
    } catch (error) {
      return {
        success: false,
        error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Reject a completed photo request
   */
  async rejectOrder(orderId: string | number, reason: string, clarification?: string): Promise<PhotoOrderResponse> {
    if (!this.isReady()) {
      return { success: false, error: 'ProxyPics service not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/photo-requests/${orderId}/reject`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          reason,
          clarification,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          order: this.mapToPhotoOrder(data),
          message: 'Photo request rejected',
        };
      }

      return {
        success: false,
        error: data.errors?.join(', ') || 'Failed to reject',
      };
    } catch (error) {
      return {
        success: false,
        error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Handle webhook callback from ProxyPics
   */
  async handleWebhook(payload: any): Promise<{
    success: boolean;
    eventName?: string;
    orderId?: number;
    status?: string;
    downloadPhotosUrl?: string;
    downloadReportUrl?: string;
    externalId?: string;
  }> {
    try {
      // ProxyPics sends event_name in payload
      const eventName = payload.event_name || payload.eventName;
      const photoRequest = payload.photo_request || payload.photoRequest || payload;

      const orderId = photoRequest.id;
      const status = photoRequest.status;
      const externalId = photoRequest.external_id || photoRequest.externalId;

      console.log(`📸 ProxyPics webhook: ${eventName} - Order #${orderId} - Status: ${status}`);

      // Check for completed/fulfilled events
      const isCompleted = eventName?.includes('Completed') ||
                          eventName?.includes('ReportGenerated') ||
                          status === 'fulfilled';

      return {
        success: true,
        eventName,
        orderId,
        status,
        downloadPhotosUrl: photoRequest.download_photos_url,
        downloadReportUrl: photoRequest.download_report_url,
        externalId,
      };
    } catch (error) {
      console.error('ProxyPics webhook handling failed:', error);
      return { success: false };
    }
  }

  // ============================================
  // WEBHOOK MANAGEMENT
  // ============================================

  /**
   * List all registered webhooks
   */
  async listWebhooks(): Promise<{ success: boolean; webhooks: ProxyPicsWebhook[]; error?: string }> {
    if (!this.isReady()) {
      return { success: false, webhooks: [], error: 'ProxyPics service not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/webhooks`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        const webhooks = (Array.isArray(data) ? data : data.data || []).map((w: any) => ({
          id: w.id,
          url: w.url,
          method: w.method,
          username: w.username,
          password: w.password,
        }));
        return { success: true, webhooks };
      }

      return { success: false, webhooks: [], error: 'Failed to fetch webhooks' };
    } catch (error) {
      console.error('Failed to list webhooks:', error);
      return { success: false, webhooks: [], error: (error as Error).message };
    }
  }

  /**
   * Create a new webhook
   */
  async createWebhook(options: {
    url: string;
    method?: 'get' | 'post';
    username?: string;
    password?: string;
  }): Promise<{ success: boolean; webhook?: ProxyPicsWebhook; error?: string }> {
    if (!this.isReady()) {
      return { success: false, error: 'ProxyPics service not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/webhooks`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          url: options.url,
          method: options.method || 'post',
          username: options.username,
          password: options.password,
        }),
      });

      const data = await response.json();

      if (response.ok && data.id) {
        console.log(`📸 ProxyPics webhook registered: ${options.url}`);
        return {
          success: true,
          webhook: {
            id: data.id,
            url: data.url,
            method: data.method,
            username: data.username,
            password: data.password,
          },
        };
      }

      return {
        success: false,
        error: data.errors?.join(', ') || 'Failed to create webhook',
      };
    } catch (error) {
      console.error('Failed to create webhook:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: number): Promise<{ success: boolean; error?: string }> {
    if (!this.isReady()) {
      return { success: false, error: 'ProxyPics service not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/webhooks/${webhookId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        console.log(`📸 ProxyPics webhook deleted: #${webhookId}`);
        return { success: true };
      }

      return { success: false, error: 'Failed to delete webhook' };
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Auto-register webhook if URL is configured
   */
  async autoRegisterWebhook(webhookUrl: string): Promise<{ success: boolean; webhookId?: number; error?: string }> {
    if (!this.isReady()) {
      return { success: false, error: 'ProxyPics service not configured' };
    }

    try {
      // Check if webhook already exists
      const { webhooks } = await this.listWebhooks();
      const existingWebhook = webhooks.find(w => w.url === webhookUrl);

      if (existingWebhook) {
        console.log(`📸 ProxyPics webhook already registered: ${webhookUrl}`);
        return { success: true, webhookId: existingWebhook.id };
      }

      // Register new webhook
      const result = await this.createWebhook({ url: webhookUrl, method: 'post' });

      if (result.success && result.webhook) {
        return { success: true, webhookId: result.webhook.id };
      }

      return { success: false, error: result.error };
    } catch (error) {
      console.error('Failed to auto-register webhook:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ============================================
  // EXTEND ORDERS
  // ============================================

  /**
   * Extend an expired photo request
   * Makes the order available again with a new expiration date
   */
  async extendOrder(orderId: string | number, expiresAt: Date): Promise<PhotoOrderResponse> {
    if (!this.isReady()) {
      return { success: false, error: 'ProxyPics service not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/photo-requests/${orderId}/extend`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          expires_at: expiresAt.toISOString(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.id) {
        console.log(`📸 ProxyPics order extended: #${orderId} until ${expiresAt.toISOString()}`);
        return {
          success: true,
          order: this.mapToPhotoOrder(data),
          message: `Order extended until ${expiresAt.toLocaleString()}`,
        };
      }

      return {
        success: false,
        error: data.errors?.join(', ') || 'Failed to extend order',
      };
    } catch (error) {
      console.error('Failed to extend order:', error);
      return {
        success: false,
        error: `Request failed: ${(error as Error).message}`,
      };
    }
  }

  // ============================================
  // MESSAGES API
  // ============================================

  /**
   * List messages for a photo request
   */
  async listMessages(photoRequestId: number): Promise<{ success: boolean; messages: ProxyPicsMessage[]; error?: string }> {
    if (!this.isReady()) {
      return { success: false, messages: [], error: 'ProxyPics service not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/messages?photo_request_id=${photoRequestId}`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        const messages = (Array.isArray(data) ? data : data.data || []).map((m: any) => ({
          id: m.id,
          text: m.text,
          senderId: m.sender_id,
          senderName: m.sender_name,
          photoRequestId: m.photo_request_id,
          createdAt: m.created_at,
        }));
        return { success: true, messages };
      }

      return { success: false, messages: [], error: 'Failed to fetch messages' };
    } catch (error) {
      console.error('Failed to list messages:', error);
      return { success: false, messages: [], error: (error as Error).message };
    }
  }

  /**
   * Send a message/note to a photo request
   * This allows communication with photographers
   */
  async sendMessage(photoRequestId: number, text: string): Promise<{ success: boolean; message?: ProxyPicsMessage; error?: string }> {
    if (!this.isReady()) {
      return { success: false, error: 'ProxyPics service not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          photo_request_id: photoRequestId,
          text,
        }),
      });

      const data = await response.json();

      if (response.ok && data.id) {
        console.log(`📸 ProxyPics message sent to order #${photoRequestId}`);
        return {
          success: true,
          message: {
            id: data.id,
            text: data.text,
            senderId: data.sender_id,
            senderName: data.sender_name,
            photoRequestId: data.photo_request_id,
            createdAt: data.created_at,
          },
        };
      }

      return {
        success: false,
        error: data.errors?.join(', ') || 'Failed to send message',
      };
    } catch (error) {
      console.error('Failed to send message:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get authorization headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey!,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  /**
   * Map API response to PhotoOrder
   */
  private mapToPhotoOrder(data: any): PhotoOrder {
    return {
      id: data.id,
      orderId: data.id.toString(),
      address: data.address,
      smallAddress: data.small_address || data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      status: data.status,
      platform: data.photo_request_platform || 'crowdsource',
      cost: data.cost || 0,
      priceBoost: data.price_boost,
      unlimitedTasks: data.unlimited_tasks || false,
      expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
      completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
      createdAt: new Date(data.created_at),
      appointmentScheduledAt: data.appointment_scheduled_at ? new Date(data.appointment_scheduled_at) : undefined,
      downloadUrl: data.download_url,
      downloadPhotosUrl: data.download_photos_url,
      downloadReportUrl: data.download_report_url,
      externalId: data.external_id,
      loanNumber: data.loan_number,
      additionalNotes: data.additional_notes,
      tasks: data.tasks,
      latitude: data.latitude,
      longitude: data.longitude,
    };
  }
}

// Singleton instance
export const proxyPicsService = new ProxyPicsService();
export default proxyPicsService;
