/**
 * Broker Communication Service
 *
 * Handles broker-mediated communication routing.
 * AI processes messages and auto-sends, broker can review/intervene.
 * Provides full audit trail for compliance.
 */

import DealCommunication, {
  PartyType,
  MessageType,
  CommunicationStatus,
  CommunicationDirection,
} from '../models/DealCommunication';
import DealBrokerMSA from '../models/DealBrokerMSA';
import BrokerProfile from '../models/BrokerProfile';
import MarketplaceUser from '../models/MarketplaceUser';
import Property from '../models/Property';
import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';

export interface SendMessageOptions {
  dealId: string;
  fromType: PartyType;
  fromUserId: string;
  toType: PartyType;
  content: string;
  messageType: MessageType;
  subject?: string;
  parentMessageId?: string;
}

export interface AIProcessingResult {
  shouldSend: boolean;
  response?: string;
  confidenceScore: number;
  suggestedAction?: 'approve' | 'review' | 'block';
  reason?: string;
}

export interface CommunicationAuditEntry {
  id: string;
  timestamp: Date;
  direction: CommunicationDirection;
  from: string;
  to: string;
  messageType: MessageType;
  status: CommunicationStatus;
  aiProcessed: boolean;
  brokerReviewed: boolean;
  wasOverridden: boolean;
}

class BrokerCommunicationService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('BrokerCommunicationService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Route a message through the broker-mediated system
   */
  async routeMessage(options: SendMessageOptions): Promise<DealCommunication> {
    // Get the MSA for this deal
    const msa = await DealBrokerMSA.findOne({
      where: { dealId: options.dealId },
    });

    if (!msa) {
      throw new Error('No MSA found for this deal');
    }

    if (!msa.isActive()) {
      throw new Error('MSA is not active');
    }

    // Get property for context
    const property = await Property.findByPk(msa.propertyId);

    // Determine direction
    const direction: CommunicationDirection =
      options.fromType === 'buyer' ? 'inbound' : 'outbound';

    // Get sender info
    const fromUser = await this.getPartyInfo(options.fromType, options.fromUserId);
    const toUser = await this.getToPartyInfo(options.toType, msa);

    // Generate thread ID if this is a new thread
    const threadId = options.parentMessageId
      ? (
          await DealCommunication.findByPk(options.parentMessageId)
        )?.threadId || uuidv4()
      : uuidv4();

    // Create communication record
    const communication = await DealCommunication.create({
      dealId: options.dealId,
      msaId: msa.id,
      propertyId: msa.propertyId,
      direction,
      fromType: options.fromType,
      fromUserId: options.fromUserId,
      fromName: fromUser?.name,
      fromEmail: fromUser?.email,
      toType: options.toType,
      toUserId: toUser?.id || '',
      toName: toUser?.name,
      toEmail: toUser?.email,
      messageType: options.messageType,
      subject: options.subject,
      content: options.content,
      threadId,
      parentMessageId: options.parentMessageId,
      status: 'pending',
      aiProcessed: false,
      brokerReviewed: false,
      brokerOverridden: false,
    });

    // Process with AI (auto-send mode)
    await this.processWithAI(communication, property);

    return communication;
  }

  /**
   * Process a communication with AI
   * In auto-send mode, messages are sent automatically
   * Broker can review and intervene after the fact
   */
  async processWithAI(
    communication: DealCommunication,
    property?: Property | null
  ): Promise<AIProcessingResult> {
    try {
      // Simple AI processing simulation
      // In production, this would call the actual AI agent
      const result = await this.analyzeMessage(communication, property);

      // Record AI processing
      await communication.recordAIProcessing(
        result.response || 'Message approved for sending',
        result.confidenceScore,
        result.suggestedAction
      );

      // Auto-send mode: send unless explicitly blocked
      if (result.shouldSend) {
        await this.sendMessage(communication);
      } else if (result.suggestedAction === 'block') {
        // AI flagged for blocking - still send but flag for review
        await communication.update({ status: 'processing' });
        // In production, notify broker for review
      }

      return result;
    } catch (error) {
      console.error('AI processing error:', error);
      // On AI error, still send the message (fail-open)
      await this.sendMessage(communication);
      return {
        shouldSend: true,
        confidenceScore: 0,
        suggestedAction: 'review',
        reason: 'AI processing failed, message sent for review',
      };
    }
  }

  /**
   * Analyze a message for compliance and appropriateness
   */
  private async analyzeMessage(
    communication: DealCommunication,
    property?: Property | null
  ): Promise<AIProcessingResult> {
    // Basic compliance checks
    const content = communication.content.toLowerCase();

    // Check for prohibited content
    const prohibitedPatterns = [
      /circumvent.*broker/i,
      /direct.*payment/i,
      /skip.*closing/i,
      /off.*record/i,
    ];

    for (const pattern of prohibitedPatterns) {
      if (pattern.test(content)) {
        return {
          shouldSend: false,
          confidenceScore: 0.95,
          suggestedAction: 'block',
          reason: 'Message contains potentially non-compliant content',
        };
      }
    }

    // Check for personally identifiable information that shouldn't be shared
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{16}\b/, // Credit card
    ];

    for (const pattern of piiPatterns) {
      if (pattern.test(content)) {
        return {
          shouldSend: false,
          confidenceScore: 0.99,
          suggestedAction: 'block',
          reason: 'Message contains sensitive PII',
        };
      }
    }

    // Standard approval
    return {
      shouldSend: true,
      confidenceScore: 0.85,
      suggestedAction: 'approve',
      response: 'Message approved for sending',
    };
  }

  /**
   * Send a message (mark as sent)
   */
  private async sendMessage(communication: DealCommunication): Promise<void> {
    await communication.markSent();

    // In production, this would:
    // 1. Send email notification
    // 2. Send push notification
    // 3. Update real-time feeds
  }

  /**
   * Get party information
   */
  private async getPartyInfo(
    partyType: PartyType,
    userId: string
  ): Promise<{ id: string; name: string; email: string } | null> {
    if (partyType === 'ai_assistant') {
      return {
        id: 'ai_assistant',
        name: 'DispoTree AI Assistant',
        email: 'ai@dispotree.com',
      };
    }

    const user = await MarketplaceUser.findByPk(userId);
    if (user) {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
      };
    }
    return null;
  }

  /**
   * Get recipient party information based on MSA
   */
  private async getToPartyInfo(
    toType: PartyType,
    msa: DealBrokerMSA
  ): Promise<{ id: string; name: string; email: string } | null> {
    if (toType === 'ai_assistant') {
      return {
        id: 'ai_assistant',
        name: 'DispoTree AI Assistant',
        email: 'ai@dispotree.com',
      };
    }

    if (toType === 'broker') {
      const broker = await BrokerProfile.findByPk(msa.brokerId);
      if (broker) {
        const user = await MarketplaceUser.findByPk(broker.userId);
        if (user) {
          return { id: broker.id, name: user.name, email: user.email };
        }
      }
    }

    if (toType === 'wholesaler') {
      const user = await MarketplaceUser.findByPk(msa.wholesalerId);
      if (user) {
        return { id: user.id, name: user.name, email: user.email };
      }
    }

    // For buyers, we'd need to track the buyer separately
    return null;
  }

  /**
   * Broker reviews a communication
   */
  async reviewCommunication(
    communicationId: string,
    brokerId: string,
    approved: boolean,
    notes?: string
  ): Promise<DealCommunication> {
    const communication = await DealCommunication.findByPk(communicationId);
    if (!communication) {
      throw new Error('Communication not found');
    }

    await communication.markReviewed(brokerId, approved, notes);
    return communication;
  }

  /**
   * Broker overrides a communication
   */
  async overrideCommunication(
    communicationId: string,
    brokerId: string,
    newContent: string,
    reason: string
  ): Promise<DealCommunication> {
    const communication = await DealCommunication.findByPk(communicationId);
    if (!communication) {
      throw new Error('Communication not found');
    }

    await communication.override(brokerId, newContent, reason);

    // Resend with new content
    await this.sendMessage(communication);

    return communication;
  }

  /**
   * Broker blocks a communication
   */
  async blockCommunication(
    communicationId: string,
    brokerId: string,
    reason: string
  ): Promise<DealCommunication> {
    const communication = await DealCommunication.findByPk(communicationId);
    if (!communication) {
      throw new Error('Communication not found');
    }

    await communication.block(brokerId, reason);
    return communication;
  }

  /**
   * Get communications for a broker's review queue
   */
  async getBrokerReviewQueue(brokerId: string): Promise<DealCommunication[]> {
    // Get all MSAs for this broker
    const msas = await DealBrokerMSA.findAll({
      where: { brokerId, status: 'active' },
    });

    const msaIds = msas.map((m) => m.id);

    // Get unreviewed communications
    return DealCommunication.findAll({
      where: {
        msaId: { [Op.in]: msaIds },
        brokerReviewed: false,
        status: { [Op.notIn]: ['blocked', 'failed'] },
      },
      include: [{ model: DealBrokerMSA, as: 'msa' }],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Get all communications for a deal
   */
  async getDealCommunications(dealId: string): Promise<DealCommunication[]> {
    return DealCommunication.findAll({
      where: { dealId },
      order: [['createdAt', 'ASC']],
    });
  }

  /**
   * Get communication thread
   */
  async getThread(threadId: string): Promise<DealCommunication[]> {
    return DealCommunication.getThread(threadId);
  }

  /**
   * Get communication audit log for a deal
   */
  async getAuditLog(dealId: string): Promise<CommunicationAuditEntry[]> {
    const communications = await this.getDealCommunications(dealId);

    return communications.map((c) => ({
      id: c.id,
      timestamp: c.createdAt,
      direction: c.direction,
      from: `${c.fromType}: ${c.fromName || c.fromUserId}`,
      to: `${c.toType}: ${c.toName || c.toUserId}`,
      messageType: c.messageType,
      status: c.status,
      aiProcessed: c.aiProcessed,
      brokerReviewed: c.brokerReviewed,
      wasOverridden: c.brokerOverridden,
    }));
  }

  /**
   * Get broker supervision summary
   */
  async getBrokerSupervisionSummary(brokerId: string): Promise<{
    totalDeals: number;
    pendingReviews: number;
    reviewedToday: number;
    overriddenThisWeek: number;
    blockedThisWeek: number;
  }> {
    const msas = await DealBrokerMSA.findAll({
      where: { brokerId, status: 'active' },
    });

    const msaIds = msas.map((m) => m.id);

    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [pendingReviews, reviewedToday, overriddenThisWeek, blockedThisWeek] =
      await Promise.all([
        DealCommunication.count({
          where: {
            msaId: { [Op.in]: msaIds },
            brokerReviewed: false,
            status: { [Op.notIn]: ['blocked', 'failed'] },
          },
        }),
        DealCommunication.count({
          where: {
            msaId: { [Op.in]: msaIds },
            brokerReviewed: true,
            brokerReviewedAt: { [Op.gte]: startOfDay },
          },
        }),
        DealCommunication.count({
          where: {
            msaId: { [Op.in]: msaIds },
            brokerOverridden: true,
            brokerOverriddenAt: { [Op.gte]: startOfWeek },
          },
        }),
        DealCommunication.count({
          where: {
            msaId: { [Op.in]: msaIds },
            status: 'blocked',
            blockedAt: { [Op.gte]: startOfWeek },
          },
        }),
      ]);

    return {
      totalDeals: msas.length,
      pendingReviews,
      reviewedToday,
      overriddenThisWeek,
      blockedThisWeek,
    };
  }

  /**
   * Generate AI response for an inquiry
   */
  async generateAIResponse(
    dealId: string,
    inquiryId: string
  ): Promise<DealCommunication> {
    const inquiry = await DealCommunication.findByPk(inquiryId);
    if (!inquiry) {
      throw new Error('Inquiry not found');
    }

    const msa = await DealBrokerMSA.findByPk(inquiry.msaId);
    if (!msa) {
      throw new Error('MSA not found');
    }

    const property = await Property.findByPk(msa.propertyId);

    // Generate AI response
    const aiResponse = await this.generatePropertyResponse(inquiry, property);

    // Create response communication
    const response = await this.routeMessage({
      dealId,
      fromType: 'ai_assistant',
      fromUserId: 'ai_assistant',
      toType: inquiry.fromType,
      content: aiResponse,
      messageType: 'response',
      subject: `RE: ${inquiry.subject || 'Property Inquiry'}`,
      parentMessageId: inquiryId,
    });

    return response;
  }

  /**
   * Generate a response about a property
   */
  private async generatePropertyResponse(
    inquiry: DealCommunication,
    property: Property | null
  ): Promise<string> {
    // Simple response generation
    // In production, this would use the AI agent
    const propertyAddress = this.formatPropertyAddress(property);
    const askingPrice = property?.reservePrice || property?.buyItNowPrice
      ? `$${(property.reservePrice || property.buyItNowPrice)?.toLocaleString()}`
      : 'Please contact us';

    return `Thank you for your inquiry about ${propertyAddress}.

The current asking price is ${askingPrice}.

This communication is supervised by a licensed real estate broker through DispoTree's compliance platform. A broker representative will follow up with additional details shortly.

Best regards,
DispoTree AI Assistant`;
  }

  /**
   * Format property address as a string
   */
  private formatPropertyAddress(property: Property | null): string {
    if (!property) return 'the property';
    const address = property.address;
    if (typeof address === 'string') return address;
    if (address && typeof address === 'object') {
      const parts = [
        address.houseNumber,
        address.street,
        address.address2,
      ].filter(Boolean);
      return `${parts.join(' ')}, ${property.city}, ${property.state} ${property.zip}`;
    }
    return 'the property';
  }
}

export const brokerCommunicationService = new BrokerCommunicationService();
export default brokerCommunicationService;
