/**
 * Inquiry Service
 *
 * Handles the lifecycle of buyer inquiries:
 * 1. Buyer asks question → Buyer agent creates inquiry
 * 2. Seller/Admin is notified via email/SMS/WebSocket
 * 3. Seller/Admin answers inquiry
 * 4. Response is injected into buyer's conversation
 * 5. Buyer is notified via WebSocket/email
 *
 * Part of the multi-agent system for buyer-seller communication.
 */

import PropertyInquiry, {
  InquiryStatus,
  InquiryPriority,
  InquiryCategory,
} from '../models/PropertyInquiry';
import ConversationHistory from '../models/ConversationHistory';
import Property from '../models/Property';
import MarketplaceUser from '../models/MarketplaceUser';
import { notificationService } from './NotificationService';
import { Op } from 'sequelize';
import { Resend } from 'resend';
import Twilio from 'twilio';

// ============================================================================
// EMAIL & SMS CLIENTS
// ============================================================================

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const twilioClient =
  process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN
    ? Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'notifications@dispotree.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@dispotree.com';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateInquiryParams {
  propertyId: number;
  buyerId: string;
  sessionId: string;
  question: string;
  category?: InquiryCategory;
  priority?: InquiryPriority;
  context?: object;
  expiresInHours?: number; // Default 72 hours
}

export interface AnswerInquiryParams {
  inquiryId: number;
  response: string;
  answeredBy: string;
  answeredByRole: 'seller' | 'admin' | 'broker';
}

export interface InquiryWithDetails extends PropertyInquiry {
  property?: {
    id: number;
    address: string;
    city: string;
    state: string;
    askingPrice: number;
  };
  buyer?: {
    id: string;
    email: string;
    name: string;
  };
}

// ============================================================================
// INQUIRY SERVICE
// ============================================================================

class InquiryService {
  private initialized = false;
  private expirationIntervalId: NodeJS.Timeout | null = null;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔄 Initializing Inquiry Service...');

    // Expire any old pending inquiries
    await this.expireOldInquiries();

    // Start periodic expiration check (store interval ID for cleanup)
    this.expirationIntervalId = setInterval(() => this.expireOldInquiries(), 60 * 60 * 1000); // Every hour

    this.initialized = true;
    console.log('✅ Inquiry Service initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup resources on shutdown
   */
  shutdown(): void {
    if (this.expirationIntervalId) {
      clearInterval(this.expirationIntervalId);
      this.expirationIntervalId = null;
    }
    this.initialized = false;
    console.log('🛑 Inquiry Service shut down');
  }

  // ============================================================================
  // CREATE INQUIRY
  // ============================================================================

  /**
   * Create a new inquiry from buyer agent
   */
  async createInquiry(params: CreateInquiryParams): Promise<PropertyInquiry> {
    const {
      propertyId,
      buyerId,
      sessionId,
      question,
      category = 'other',
      priority = 'normal',
      context,
      expiresInHours = 72,
    } = params;

    // Verify property exists
    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    // Create the inquiry
    const inquiry = await PropertyInquiry.create({
      propertyId,
      buyerId,
      sessionId,
      question,
      category,
      priority,
      context,
      status: 'pending',
      notifiedBuyer: false,
      expiresAt,
    });

    console.log(`📩 Created inquiry #${inquiry.id} for property #${propertyId}`);

    // Notify seller/admin asynchronously
    this.notifySellerOfInquiry(inquiry, property).catch((err) => {
      console.error('Failed to notify seller of inquiry:', err);
    });

    return inquiry;
  }

  // ============================================================================
  // ANSWER INQUIRY
  // ============================================================================

  /**
   * Answer an inquiry (called by seller/admin)
   */
  async answerInquiry(params: AnswerInquiryParams): Promise<PropertyInquiry> {
    const { inquiryId, response, answeredBy, answeredByRole } = params;

    const inquiry = await PropertyInquiry.findByPk(inquiryId);
    if (!inquiry) {
      throw new Error(`Inquiry ${inquiryId} not found`);
    }

    if (inquiry.status !== 'pending') {
      throw new Error(`Inquiry ${inquiryId} is not pending (status: ${inquiry.status})`);
    }

    // Update inquiry with response
    await inquiry.update({
      sellerResponse: response,
      status: 'answered',
      answeredAt: new Date(),
      answeredBy,
      answeredByRole,
    });

    console.log(`✅ Inquiry #${inquiryId} answered by ${answeredByRole}`);

    // Inject response into buyer's conversation
    await this.injectResponseToConversation(inquiry);

    // Notify buyer
    await this.notifyBuyerOfResponse(inquiry);

    return inquiry;
  }

  // ============================================================================
  // CONVERSATION INJECTION
  // ============================================================================

  /**
   * Inject seller response into buyer's conversation history
   * This allows the buyer agent to see the response and relay it
   */
  private async injectResponseToConversation(inquiry: PropertyInquiry): Promise<void> {
    // Get property details for context
    const property = await Property.findByPk(inquiry.propertyId);
    const propertyAddress = property
      ? `${property.getDataValue('address')}, ${property.getDataValue('city')}, ${property.getDataValue('state')}`
      : `Property #${inquiry.propertyId}`;

    // Create system message with seller response
    const systemMessage = `[SELLER RESPONSE RECEIVED]

The seller has responded to the buyer's question about ${propertyAddress}.

**Buyer's Question:**
"${inquiry.question}"

**Seller's Response:**
"${inquiry.sellerResponse}"

---
IMPORTANT: The next time this buyer sends a message, you should:
1. Acknowledge that you received the seller's response
2. Share the seller's answer with the buyer
3. Ask if they have any follow-up questions or would like to proceed with an offer`;

    // Insert into conversation history
    await ConversationHistory.create({
      sessionId: inquiry.sessionId,
      role: 'system',
      content: systemMessage,
      metadata: {
        type: 'seller_response',
        inquiryId: inquiry.id,
        propertyId: inquiry.propertyId,
      },
    });

    console.log(`💬 Injected seller response into session ${inquiry.sessionId}`);
  }

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  /**
   * Notify seller/admin of new inquiry
   */
  private async notifySellerOfInquiry(
    inquiry: PropertyInquiry,
    property: Property
  ): Promise<void> {
    const propertyAddress = `${property.getDataValue('address')}, ${property.getDataValue('city')}, ${property.getDataValue('state')}`;

    // Get buyer info
    const buyer = await MarketplaceUser.findByPk(inquiry.buyerId);
    const buyerName = buyer?.getDataValue('name') || buyer?.getDataValue('email') || 'A buyer';

    // Send WebSocket notification to admins
    notificationService.sendToChannel('admins', {
      type: 'system',
      title: 'New Buyer Inquiry',
      message: `${buyerName} has a question about ${propertyAddress}`,
      priority: inquiry.priority,
      data: {
        inquiryId: inquiry.id,
        propertyId: inquiry.propertyId,
        question: inquiry.question,
        category: inquiry.category,
        propertyAddress,
        buyerName,
      },
    });

    // Send email notification to admin
    await this.sendInquiryEmailToAdmin(inquiry, property, buyerName);

    // Send SMS notification for urgent/high priority inquiries
    if (inquiry.priority === 'urgent' || inquiry.priority === 'high') {
      await this.sendInquirySmsToAdmin(inquiry, property, buyerName);
    }
  }

  /**
   * Send SMS notification to admin about new inquiry
   */
  private async sendInquirySmsToAdmin(
    inquiry: PropertyInquiry,
    property: Property,
    buyerName: string
  ): Promise<void> {
    if (!twilioClient || !TWILIO_FROM || !ADMIN_PHONE) {
      console.log('📱 SMS not configured - skipping admin SMS notification');
      return;
    }

    const propertyAddress = `${property.getDataValue('address')}, ${property.getDataValue('city')}, ${property.getDataValue('state')}`;
    const dashboardUrl = `${process.env.APP_URL || 'http://localhost:3000'}/inquiries`;

    try {
      await twilioClient.messages.create({
        to: ADMIN_PHONE,
        from: TWILIO_FROM,
        body: `🏠 ${inquiry.priority.toUpperCase()} INQUIRY\n\n${buyerName} asks about ${propertyAddress}:\n\n"${inquiry.question.substring(0, 100)}${inquiry.question.length > 100 ? '...' : ''}"\n\nRespond: ${dashboardUrl}`,
      });

      console.log(`📱 SMS notification sent for inquiry #${inquiry.id}`);
    } catch (error) {
      console.error('Failed to send inquiry SMS:', error);
    }
  }

  /**
   * Send email notification to admin about new inquiry
   */
  private async sendInquiryEmailToAdmin(
    inquiry: PropertyInquiry,
    property: Property,
    buyerName: string
  ): Promise<void> {
    if (!resend) {
      console.log('📧 Email not configured - skipping admin notification');
      return;
    }

    const propertyAddress = `${property.getDataValue('address')}, ${property.getDataValue('city')}, ${property.getDataValue('state')}`;
    const askingPrice = property.getDataValue('mlsListingPrice') || property.getDataValue('reservePrice');
    const dashboardUrl = `${process.env.APP_URL || 'http://localhost:3000'}/inquiries/${inquiry.id}`;

    const categoryLabels: Record<string, string> = {
      seller_motivation: 'Seller Motivation',
      property_condition: 'Property Condition',
      property_history: 'Property History',
      closing_terms: 'Closing Terms',
      inclusions: 'Inclusions',
      pricing: 'Pricing',
      other: 'General Question',
    };

    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: ADMIN_EMAIL,
        subject: `🏠 New Buyer Inquiry: ${propertyAddress}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">New Buyer Inquiry</h2>

            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="margin: 0 0 8px 0;">Property Details</h3>
              <p style="margin: 4px 0;"><strong>Address:</strong> ${propertyAddress}</p>
              <p style="margin: 4px 0;"><strong>Asking Price:</strong> ${askingPrice ? '$' + askingPrice.toLocaleString() : 'N/A'}</p>
              <p style="margin: 4px 0;"><strong>Property ID:</strong> ${inquiry.propertyId}</p>
            </div>

            <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="margin: 0 0 8px 0;">Buyer Question</h3>
              <p style="margin: 4px 0;"><strong>From:</strong> ${buyerName}</p>
              <p style="margin: 4px 0;"><strong>Category:</strong> ${categoryLabels[inquiry.category] || inquiry.category}</p>
              <p style="margin: 4px 0;"><strong>Priority:</strong> ${inquiry.priority.toUpperCase()}</p>
              <p style="margin: 12px 0 0 0; font-style: italic;">"${inquiry.question}"</p>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${dashboardUrl}"
                 style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Answer This Inquiry
              </a>
            </div>

            <p style="color: #6b7280; font-size: 12px; text-align: center;">
              This inquiry will expire in 72 hours if not answered.
            </p>
          </div>
        `,
      });

      console.log(`📧 Email notification sent for inquiry #${inquiry.id}`);
    } catch (error) {
      console.error('Failed to send inquiry email:', error);
    }
  }

  /**
   * Notify buyer that seller has responded
   */
  private async notifyBuyerOfResponse(inquiry: PropertyInquiry): Promise<void> {
    // Get property details
    const property = await Property.findByPk(inquiry.propertyId);
    const propertyAddress = property
      ? `${property.getDataValue('address')}, ${property.getDataValue('city')}, ${property.getDataValue('state')}`
      : `Property #${inquiry.propertyId}`;

    // Send WebSocket notification to buyer
    notificationService.sendToUser(inquiry.buyerId, {
      type: 'system',
      title: 'Seller Responded!',
      message: `The seller has answered your question about ${propertyAddress}. Check your chat for details.`,
      priority: 'high',
      data: {
        inquiryId: inquiry.id,
        propertyId: inquiry.propertyId,
        sessionId: inquiry.sessionId,
        question: inquiry.question,
        response: inquiry.sellerResponse,
      },
    });

    // Send email notification to buyer
    await this.sendResponseEmailToBuyer(inquiry, propertyAddress);

    // Send SMS to buyer if they have a phone
    await this.sendResponseSmsToBuyer(inquiry, propertyAddress);

    // Mark as notified
    await inquiry.update({
      notifiedBuyer: true,
      notifiedAt: new Date(),
    });

    console.log(`🔔 Notified buyer ${inquiry.buyerId} of response to inquiry #${inquiry.id}`);
  }

  /**
   * Send SMS to buyer when seller responds
   */
  private async sendResponseSmsToBuyer(
    inquiry: PropertyInquiry,
    propertyAddress: string
  ): Promise<void> {
    if (!twilioClient || !TWILIO_FROM) {
      return;
    }

    // Get buyer phone
    const buyer = await MarketplaceUser.findByPk(inquiry.buyerId);
    const buyerPhone = buyer?.getDataValue('phone');
    if (!buyerPhone) {
      return;
    }

    const chatUrl = `${process.env.APP_URL || 'http://localhost:3000'}/buyer-chat`;

    try {
      await twilioClient.messages.create({
        to: buyerPhone,
        from: TWILIO_FROM,
        body: `✅ Good news! The seller responded to your question about ${propertyAddress}.\n\nCheck your chat for details: ${chatUrl}`,
      });

      console.log(`📱 SMS sent to buyer ${buyerPhone}`);
    } catch (error) {
      console.error('Failed to send buyer SMS:', error);
    }
  }

  /**
   * Send email to buyer when seller responds
   */
  private async sendResponseEmailToBuyer(
    inquiry: PropertyInquiry,
    propertyAddress: string
  ): Promise<void> {
    if (!resend) {
      console.log('📧 Email not configured - skipping buyer notification');
      return;
    }

    // Get buyer email
    const buyer = await MarketplaceUser.findByPk(inquiry.buyerId);
    if (!buyer || !buyer.getDataValue('email')) {
      console.log('📧 Buyer email not found - skipping email notification');
      return;
    }

    const buyerEmail = buyer.getDataValue('email');
    const chatUrl = `${process.env.APP_URL || 'http://localhost:3000'}/chat?session=${inquiry.sessionId}`;

    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: buyerEmail,
        subject: `✅ Seller Responded: ${propertyAddress}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">Great News! The Seller Responded</h2>

            <p>Your question about <strong>${propertyAddress}</strong> has been answered.</p>

            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="margin: 0 0 8px 0;">Your Question</h3>
              <p style="margin: 0; font-style: italic;">"${inquiry.question}"</p>
            </div>

            <div style="background: #d1fae5; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="margin: 0 0 8px 0;">Seller's Response</h3>
              <p style="margin: 0;">"${inquiry.sellerResponse}"</p>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${chatUrl}"
                 style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Continue Conversation
              </a>
            </div>

            <p style="color: #6b7280; font-size: 14px;">
              Have more questions? Just reply in the chat and our AI assistant will help you,
              or reach out to the seller again if needed.
            </p>
          </div>
        `,
      });

      console.log(`📧 Response email sent to buyer ${buyerEmail}`);
    } catch (error) {
      console.error('Failed to send buyer response email:', error);
    }
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get pending inquiries for a property
   */
  async getPendingInquiries(propertyId: number): Promise<PropertyInquiry[]> {
    return PropertyInquiry.findAll({
      where: {
        propertyId,
        status: 'pending',
      },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get all pending inquiries (for admin dashboard)
   */
  async getAllPendingInquiries(options?: {
    limit?: number;
    offset?: number;
    priority?: InquiryPriority;
    category?: InquiryCategory;
  }): Promise<{ inquiries: InquiryWithDetails[]; total: number }> {
    const { limit = 50, offset = 0, priority, category } = options || {};

    const where: any = { status: 'pending' };
    if (priority) where.priority = priority;
    if (category) where.category = category;

    const { rows, count } = await PropertyInquiry.findAndCountAll({
      where,
      limit,
      offset,
      order: [
        ['priority', 'DESC'], // Urgent first
        ['createdAt', 'ASC'], // Oldest first
      ],
    });

    // Enrich with property and buyer details
    const inquiries = await Promise.all(
      rows.map(async (inquiry) => {
        const property = await Property.findByPk(inquiry.propertyId, {
          attributes: ['id', 'address', 'city', 'state', 'mlsListingPrice', 'reservePrice'],
        });
        const buyer = await MarketplaceUser.findByPk(inquiry.buyerId, {
          attributes: ['id', 'email', 'name'],
        });

        return {
          ...inquiry.toJSON(),
          property: property
            ? {
                id: property.getDataValue('id'),
                address: property.getDataValue('address'),
                city: property.getDataValue('city'),
                state: property.getDataValue('state'),
                askingPrice: property.getDataValue('mlsListingPrice') || property.getDataValue('reservePrice'),
              }
            : undefined,
          buyer: buyer
            ? {
                id: buyer.getDataValue('id'),
                email: buyer.getDataValue('email'),
                name: buyer.getDataValue('name'),
              }
            : undefined,
        } as InquiryWithDetails;
      })
    );

    return { inquiries, total: count };
  }

  /**
   * Get buyer's inquiries
   */
  async getBuyerInquiries(
    buyerId: string,
    status?: InquiryStatus
  ): Promise<PropertyInquiry[]> {
    const where: any = { buyerId };
    if (status) where.status = status;

    return PropertyInquiry.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get inquiry by ID
   */
  async getInquiry(inquiryId: number): Promise<InquiryWithDetails | null> {
    const inquiry = await PropertyInquiry.findByPk(inquiryId);
    if (!inquiry) return null;

    const property = await Property.findByPk(inquiry.propertyId, {
      attributes: ['id', 'address', 'city', 'state', 'askingPrice'],
    });
    const buyer = await MarketplaceUser.findByPk(inquiry.buyerId, {
      attributes: ['id', 'email', 'name'],
    });

    return {
      ...inquiry.toJSON(),
      property: property
        ? {
            id: property.getDataValue('id'),
            address: property.getDataValue('address'),
            city: property.getDataValue('city'),
            state: property.getDataValue('state'),
            askingPrice: property.getDataValue('mlsListingPrice') || property.getDataValue('reservePrice'),
          }
        : undefined,
      buyer: buyer
        ? {
            id: buyer.getDataValue('id'),
            email: buyer.getDataValue('email'),
            name: buyer.getDataValue('name'),
          }
        : undefined,
    } as InquiryWithDetails;
  }

  /**
   * Check if buyer has pending inquiry for a question (prevent duplicates)
   */
  async hasPendingInquiry(
    buyerId: string,
    propertyId: number,
    question: string
  ): Promise<PropertyInquiry | null> {
    // Simple duplicate detection - same buyer, property, similar question
    return PropertyInquiry.findOne({
      where: {
        buyerId,
        propertyId,
        status: 'pending',
        question: {
          [Op.iLike]: `%${question.substring(0, 50)}%`,
        },
      },
    });
  }

  // ============================================================================
  // LIFECYCLE MANAGEMENT
  // ============================================================================

  /**
   * Cancel an inquiry (buyer can cancel their own)
   */
  async cancelInquiry(inquiryId: number, buyerId: string): Promise<PropertyInquiry> {
    const inquiry = await PropertyInquiry.findByPk(inquiryId);
    if (!inquiry) {
      throw new Error(`Inquiry ${inquiryId} not found`);
    }

    if (inquiry.buyerId !== buyerId) {
      throw new Error('You can only cancel your own inquiries');
    }

    if (inquiry.status !== 'pending') {
      throw new Error('Can only cancel pending inquiries');
    }

    await inquiry.update({ status: 'cancelled' });
    console.log(`❌ Inquiry #${inquiryId} cancelled by buyer`);

    return inquiry;
  }

  /**
   * Expire old pending inquiries
   */
  async expireOldInquiries(): Promise<number> {
    const [affectedCount] = await PropertyInquiry.update(
      { status: 'expired' },
      {
        where: {
          status: 'pending',
          expiresAt: {
            [Op.lt]: new Date(),
          },
        },
      }
    );

    if (affectedCount > 0) {
      console.log(`⏰ Expired ${affectedCount} old inquiries`);
    }

    return affectedCount;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get inquiry statistics
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    answered: number;
    expired: number;
    avgResponseTimeHours: number | null;
  }> {
    const total = await PropertyInquiry.count();
    const pending = await PropertyInquiry.count({ where: { status: 'pending' } });
    const answered = await PropertyInquiry.count({ where: { status: 'answered' } });
    const expired = await PropertyInquiry.count({ where: { status: 'expired' } });

    // Calculate average response time for answered inquiries
    const answeredInquiries = await PropertyInquiry.findAll({
      where: { status: 'answered' },
      attributes: ['createdAt', 'answeredAt'],
    });

    let avgResponseTimeHours: number | null = null;
    if (answeredInquiries.length > 0) {
      const totalHours = answeredInquiries.reduce((sum, inq) => {
        const created = new Date(inq.createdAt).getTime();
        const answered = new Date(inq.answeredAt!).getTime();
        return sum + (answered - created) / (1000 * 60 * 60);
      }, 0);
      avgResponseTimeHours = Math.round((totalHours / answeredInquiries.length) * 10) / 10;
    }

    return {
      total,
      pending,
      answered,
      expired,
      avgResponseTimeHours,
    };
  }

  // ============================================================================
  // BULK ACTIONS
  // ============================================================================

  /**
   * Answer multiple inquiries with the same response (for common questions)
   */
  async bulkAnswerInquiries(
    inquiryIds: number[],
    response: string,
    answeredBy: string,
    answeredByRole: 'seller' | 'admin' | 'broker'
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const inquiryId of inquiryIds) {
      try {
        await this.answerInquiry({
          inquiryId,
          response,
          answeredBy,
          answeredByRole,
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Inquiry #${inquiryId}: ${(error as Error).message}`);
      }
    }

    console.log(`📦 Bulk answered ${results.success}/${inquiryIds.length} inquiries`);
    return results;
  }

  /**
   * Bulk cancel inquiries
   */
  async bulkCancelInquiries(
    inquiryIds: number[],
    adminId: string
  ): Promise<{ success: number; failed: number }> {
    const [affectedCount] = await PropertyInquiry.update(
      { status: 'cancelled' },
      {
        where: {
          id: { [Op.in]: inquiryIds },
          status: 'pending',
        },
      }
    );

    console.log(`❌ Bulk cancelled ${affectedCount} inquiries by admin ${adminId}`);
    return { success: affectedCount, failed: inquiryIds.length - affectedCount };
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Get detailed analytics for inquiries
   */
  async getAnalytics(options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    overview: {
      total: number;
      pending: number;
      answered: number;
      expired: number;
      cancelled: number;
      responseRate: number;
      avgResponseTimeHours: number | null;
    };
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    byDay: Array<{ date: string; created: number; answered: number }>;
    topProperties: Array<{ propertyId: number; address: string; count: number }>;
    responseTimeDistribution: {
      under1h: number;
      under6h: number;
      under24h: number;
      under72h: number;
      over72h: number;
    };
  }> {
    const { startDate, endDate } = options || {};

    const dateFilter: any = {};
    if (startDate) dateFilter[Op.gte] = startDate;
    if (endDate) dateFilter[Op.lte] = endDate;
    const whereClause = startDate || endDate ? { createdAt: dateFilter } : {};

    // Basic counts
    const total = await PropertyInquiry.count({ where: whereClause });
    const pending = await PropertyInquiry.count({ where: { ...whereClause, status: 'pending' } });
    const answered = await PropertyInquiry.count({ where: { ...whereClause, status: 'answered' } });
    const expired = await PropertyInquiry.count({ where: { ...whereClause, status: 'expired' } });
    const cancelled = await PropertyInquiry.count({ where: { ...whereClause, status: 'cancelled' } });

    // Response rate
    const responseRate = total > 0 ? Math.round((answered / total) * 100) : 0;

    // Average response time
    const answeredInquiries = await PropertyInquiry.findAll({
      where: { ...whereClause, status: 'answered' },
      attributes: ['createdAt', 'answeredAt'],
    });

    let avgResponseTimeHours: number | null = null;
    const responseTimeDistribution = { under1h: 0, under6h: 0, under24h: 0, under72h: 0, over72h: 0 };

    if (answeredInquiries.length > 0) {
      let totalHours = 0;
      for (const inq of answeredInquiries) {
        const hours = (new Date(inq.answeredAt!).getTime() - new Date(inq.createdAt).getTime()) / (1000 * 60 * 60);
        totalHours += hours;

        if (hours < 1) responseTimeDistribution.under1h++;
        else if (hours < 6) responseTimeDistribution.under6h++;
        else if (hours < 24) responseTimeDistribution.under24h++;
        else if (hours < 72) responseTimeDistribution.under72h++;
        else responseTimeDistribution.over72h++;
      }
      avgResponseTimeHours = Math.round((totalHours / answeredInquiries.length) * 10) / 10;
    }

    // By category
    const byCategory: Record<string, number> = {};
    const categories = ['seller_motivation', 'property_condition', 'property_history', 'closing_terms', 'inclusions', 'pricing', 'other'];
    for (const cat of categories) {
      byCategory[cat] = await PropertyInquiry.count({ where: { ...whereClause, category: cat } });
    }

    // By priority
    const byPriority: Record<string, number> = {};
    const priorities = ['low', 'normal', 'high', 'urgent'];
    for (const pri of priorities) {
      byPriority[pri] = await PropertyInquiry.count({ where: { ...whereClause, priority: pri } });
    }

    // By day (last 30 days)
    const byDay: Array<{ date: string; created: number; answered: number }> = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (let i = 0; i < 30; i++) {
      const date = new Date(thirtyDaysAgo);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const created = await PropertyInquiry.count({
        where: {
          createdAt: { [Op.gte]: date, [Op.lt]: nextDate },
        },
      });

      const answeredCount = await PropertyInquiry.count({
        where: {
          answeredAt: { [Op.gte]: date, [Op.lt]: nextDate },
        },
      });

      byDay.push({ date: dateStr, created, answered: answeredCount });
    }

    // Top properties with most inquiries
    const topPropertiesRaw = await PropertyInquiry.findAll({
      where: whereClause,
      attributes: ['propertyId', [PropertyInquiry.sequelize!.fn('COUNT', '*'), 'count']],
      group: ['propertyId'],
      order: [[PropertyInquiry.sequelize!.literal('count'), 'DESC']],
      limit: 10,
      raw: true,
    }) as unknown as Array<{ propertyId: number; count: string }>;

    const topProperties = await Promise.all(
      topPropertiesRaw.map(async (item) => {
        const property = await Property.findByPk(item.propertyId);
        return {
          propertyId: item.propertyId,
          address: property
            ? `${property.getDataValue('address')}, ${property.getDataValue('city')}, ${property.getDataValue('state')}`
            : `Property #${item.propertyId}`,
          count: parseInt(item.count, 10),
        };
      })
    );

    return {
      overview: {
        total,
        pending,
        answered,
        expired,
        cancelled,
        responseRate,
        avgResponseTimeHours,
      },
      byCategory,
      byPriority,
      byDay,
      topProperties,
      responseTimeDistribution,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const inquiryService = new InquiryService();
export default inquiryService;
