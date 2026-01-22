/**
 * DocuSeal Service
 *
 * API client for DocuSeal e-signature platform.
 * Handles document templates, submissions, and signing workflows.
 *
 * Features:
 * - Create submissions from templates
 * - Track signing status
 * - Download signed documents
 * - Pre-fill form fields
 */

// Types for DocuSeal API
export interface DocuSealTemplate {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  folder_name?: string;
  fields: DocuSealField[];
}

export interface DocuSealField {
  name: string;
  type: 'text' | 'signature' | 'initials' | 'date' | 'checkbox' | 'image' | 'file';
  required: boolean;
  submitter_uuid?: string;
}

export interface DocuSealSubmitter {
  email: string;
  name?: string;
  role?: string;
  phone?: string;
  fields?: Array<{
    name: string;
    default_value?: string;
    readonly?: boolean;
  }>;
  send_email?: boolean;
  send_sms?: boolean;
  completed?: boolean;
  metadata?: Record<string, any>;
}

export interface DocuSealSubmission {
  id: number;
  source: string;
  submitters_order: 'random' | 'preserved';
  slug: string;
  audit_log_url: string;
  combined_document_url?: string;
  expire_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  status: 'pending' | 'completed' | 'expired' | 'archived';
  submitters: DocuSealSubmitterResponse[];
  template: {
    id: number;
    name: string;
  };
  documents: DocuSealDocument[];
}

export interface DocuSealSubmitterResponse {
  id: number;
  submission_id: number;
  uuid: string;
  email: string;
  slug: string;
  name?: string;
  phone?: string;
  status: 'pending' | 'opened' | 'sent' | 'completed' | 'declined';
  role: string;
  completed_at?: string;
  opened_at?: string;
  sent_at?: string;
  created_at: string;
  updated_at: string;
  embed_src: string;
  metadata?: Record<string, any>;
  values: Array<{
    field: string;
    value: any;
  }>;
  documents: DocuSealDocument[];
}

export interface DocuSealDocument {
  name: string;
  url: string;
}

export interface CreateSubmissionOptions {
  templateId: number;
  submitters: DocuSealSubmitter[];
  sendEmail?: boolean;
  sendSms?: boolean;
  order?: 'random' | 'preserved';
  expireAt?: Date;
  message?: {
    subject?: string;
    body?: string;
  };
  metadata?: Record<string, any>;
}

export interface WebhookPayload {
  event_type: 'form.viewed' | 'form.started' | 'form.completed' | 'form.declined' |
              'submission.created' | 'submission.completed' | 'submission.expired' | 'submission.archived' |
              'template.created' | 'template.updated';
  timestamp: string;
  data: {
    id: number;
    submission_id?: number;
    email?: string;
    status?: string;
    metadata?: Record<string, any>;
    [key: string]: any;
  };
}

class DocuSealService {
  private apiKey: string | null = null;
  private baseUrl: string = 'https://api.docuseal.com';
  private initialized: boolean = false;

  /**
   * Initialize the DocuSeal service
   */
  initialize(): void {
    this.apiKey = process.env.DOCUSEAL_API_KEY || null;
    const customUrl = process.env.DOCUSEAL_API_URL;

    if (customUrl) {
      this.baseUrl = customUrl.replace(/\/$/, ''); // Remove trailing slash
    }

    if (this.apiKey) {
      this.initialized = true;
      console.log('✅ DocuSeal Service initialized');
    } else {
      console.log('⚠️ DocuSeal Service disabled (missing DOCUSEAL_API_KEY)');
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized && !!this.apiKey;
  }

  /**
   * Make API request to DocuSeal
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: any
  ): Promise<T> {
    if (!this.isReady()) {
      throw new Error('DocuSeal service not initialized');
    }

    const url = `${this.baseUrl}${endpoint}`;
    // Safe assertion: isReady() check above guarantees apiKey is defined
    const headers: Record<string, string> = {
      'X-Auth-Token': this.apiKey as string,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DocuSeal API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  // ==========================================================================
  // TEMPLATES
  // ==========================================================================

  /**
   * List all templates
   */
  async listTemplates(options: {
    limit?: number;
    offset?: number;
    folder?: string;
    archived?: boolean;
  } = {}): Promise<DocuSealTemplate[]> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    if (options.folder) params.append('folder', options.folder);
    if (options.archived !== undefined) params.append('archived', options.archived.toString());

    const query = params.toString();
    // DocuSeal API returns { data: [...], pagination: {...} }
    const response = await this.request<{ data: DocuSealTemplate[]; pagination?: any }>('GET', `/api/templates${query ? `?${query}` : ''}`);
    return response.data || [];
  }

  /**
   * Get a specific template
   */
  async getTemplate(templateId: number): Promise<DocuSealTemplate> {
    return this.request<DocuSealTemplate>('GET', `/templates/${templateId}`);
  }

  /**
   * Get template PDF document URLs
   * Returns the original document PDFs used to create the template
   */
  async getTemplateDocuments(templateId: number): Promise<{ documents: Array<{ name: string; url: string }> }> {
    const template = await this.request<any>('GET', `/templates/${templateId}`);
    return {
      documents: template.documents || [],
    };
  }

  /**
   * Get base URL for DocuSeal (for building embed/preview URLs)
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Clone a template
   */
  async cloneTemplate(templateId: number, name?: string): Promise<DocuSealTemplate> {
    return this.request<DocuSealTemplate>('POST', `/templates/${templateId}/clone`, { name });
  }

  // ==========================================================================
  // SUBMISSIONS
  // ==========================================================================

  /**
   * Create a new submission (signature request)
   */
  async createSubmission(options: CreateSubmissionOptions): Promise<DocuSealSubmission> {
    const body: any = {
      template_id: options.templateId,
      submitters: options.submitters.map(s => ({
        email: s.email,
        name: s.name,
        role: s.role || 'Signer',
        phone: s.phone,
        send_email: s.send_email ?? options.sendEmail ?? true,
        send_sms: s.send_sms ?? options.sendSms ?? false,
        fields: s.fields,
        metadata: s.metadata,
      })),
      order: options.order || 'preserved',
    };

    if (options.expireAt) {
      body.expire_at = options.expireAt.toISOString();
    }

    if (options.message) {
      body.message = options.message;
    }

    return this.request<DocuSealSubmission>('POST', '/submissions', body);
  }

  /**
   * Create submission from template with custom options
   * This is an alias for createSubmission with a simpler interface
   */
  async createSubmissionFromTemplate(
    templateId: number,
    options: {
      submitters: Array<{
        email: string;
        name?: string;
        role?: string;
        fields?: Array<{ name: string; default_value?: string }>;
      }>;
      send_email?: boolean;
      message?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<DocuSealSubmission> {
    return this.createSubmission({
      templateId,
      submitters: options.submitters.map(s => ({
        email: s.email,
        name: s.name,
        role: s.role,
        fields: s.fields,
        send_email: options.send_email,
      })),
      sendEmail: options.send_email,
      message: options.message ? { body: options.message } : undefined,
      metadata: options.metadata,
    });
  }

  /**
   * Create submission for a deal with pre-filled property data
   */
  async createDealSubmission(
    templateId: number,
    dealData: {
      propertyAddress: string;
      city: string;
      state: string;
      zip: string;
      purchasePrice: number;
      sellerName: string;
      sellerEmail: string;
      buyerName?: string;
      buyerEmail?: string;
      closingDate?: Date;
    },
    options: {
      sendEmail?: boolean;
      expireInDays?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<DocuSealSubmission> {
    const submitters: DocuSealSubmitter[] = [
      {
        email: dealData.sellerEmail,
        name: dealData.sellerName,
        role: 'Seller',
        send_email: options.sendEmail ?? true,
        fields: [
          { name: 'property_address', default_value: dealData.propertyAddress },
          { name: 'city', default_value: dealData.city },
          { name: 'state', default_value: dealData.state },
          { name: 'zip', default_value: dealData.zip },
          { name: 'purchase_price', default_value: dealData.purchasePrice.toString() },
          { name: 'seller_name', default_value: dealData.sellerName },
          ...(dealData.closingDate ? [{ name: 'closing_date', default_value: dealData.closingDate.toISOString().split('T')[0] }] : []),
        ],
        metadata: options.metadata,
      },
    ];

    // Add buyer if provided
    if (dealData.buyerEmail) {
      submitters.push({
        email: dealData.buyerEmail,
        name: dealData.buyerName,
        role: 'Buyer',
        send_email: options.sendEmail ?? true,
        fields: [
          { name: 'buyer_name', default_value: dealData.buyerName },
        ],
      });
    }

    const expireAt = options.expireInDays
      ? new Date(Date.now() + options.expireInDays * 24 * 60 * 60 * 1000)
      : undefined;

    return this.createSubmission({
      templateId,
      submitters,
      sendEmail: options.sendEmail,
      expireAt,
      metadata: options.metadata,
    });
  }

  /**
   * List submissions
   */
  async listSubmissions(options: {
    limit?: number;
    offset?: number;
    templateId?: number;
    status?: 'pending' | 'completed' | 'expired' | 'archived';
  } = {}): Promise<DocuSealSubmission[]> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    if (options.templateId) params.append('template_id', options.templateId.toString());
    if (options.status) params.append('status', options.status);

    const query = params.toString();
    return this.request<DocuSealSubmission[]>('GET', `/submissions${query ? `?${query}` : ''}`);
  }

  /**
   * Get a specific submission
   */
  async getSubmission(submissionId: number): Promise<DocuSealSubmission> {
    return this.request<DocuSealSubmission>('GET', `/submissions/${submissionId}`);
  }

  /**
   * Get submission documents (signed PDFs)
   */
  async getSubmissionDocuments(submissionId: number): Promise<DocuSealDocument[]> {
    return this.request<DocuSealDocument[]>('GET', `/submissions/${submissionId}/documents`);
  }

  /**
   * Archive a submission
   */
  async archiveSubmission(submissionId: number): Promise<void> {
    await this.request<void>('DELETE', `/submissions/${submissionId}`);
  }

  // ==========================================================================
  // SUBMITTERS
  // ==========================================================================

  /**
   * Get submitter details
   */
  async getSubmitter(submitterId: number): Promise<DocuSealSubmitterResponse> {
    return this.request<DocuSealSubmitterResponse>('GET', `/submitters/${submitterId}`);
  }

  /**
   * Update submitter (resend email, update fields, etc.)
   */
  async updateSubmitter(
    submitterId: number,
    updates: {
      email?: string;
      name?: string;
      phone?: string;
      send_email?: boolean;
      send_sms?: boolean;
      fields?: Array<{ name: string; default_value?: string }>;
    }
  ): Promise<DocuSealSubmitterResponse> {
    return this.request<DocuSealSubmitterResponse>('PUT', `/submitters/${submitterId}`, updates);
  }

  /**
   * Resend signing request email
   */
  async resendEmail(submitterId: number): Promise<DocuSealSubmitterResponse> {
    return this.updateSubmitter(submitterId, { send_email: true });
  }

  // ==========================================================================
  // WEBHOOK HANDLING
  // ==========================================================================

  /**
   * Parse and validate webhook payload
   */
  parseWebhook(body: any): WebhookPayload {
    if (!body || !body.event_type || !body.data) {
      throw new Error('Invalid webhook payload');
    }

    return {
      event_type: body.event_type,
      timestamp: body.timestamp || new Date().toISOString(),
      data: body.data,
    };
  }

  /**
   * Get deal ID from submission metadata
   */
  getDealIdFromWebhook(payload: WebhookPayload): string | null {
    return payload.data.metadata?.dealId ||
           payload.data.metadata?.deal_id ||
           null;
  }

  /**
   * Get pipeline ID from submission metadata
   */
  getPipelineIdFromWebhook(payload: WebhookPayload): string | null {
    return payload.data.metadata?.pipelineId ||
           payload.data.metadata?.pipeline_id ||
           null;
  }
}

export const docuSealService = new DocuSealService();
export default docuSealService;
