/**
 * Seller Agent Service
 *
 * A limited AI agent designed for seller/admin interactions.
 * Helps sellers manage their properties and respond to buyer inquiries.
 *
 * Tools available:
 * - View pending inquiries
 * - Answer buyer inquiries
 * - View property details
 * - Get inquiry statistics
 * - Search their properties
 */

import { createAgent, tool, HumanMessage, AIMessage, SystemMessage } from 'langchain';
import type { BaseMessage } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import Property from '../models/Property';
import PropertyInquiry from '../models/PropertyInquiry';
import ConversationHistory from '../models/ConversationHistory';
import MarketplaceUser from '../models/MarketplaceUser';
import { Op } from 'sequelize';
import { inquiryService } from './InquiryService';

// ============================================================================
// CONFIGURATION
// ============================================================================

const MAX_HISTORY_MESSAGES = 50;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const conversationCache: Map<string, CacheEntry<BaseMessage[]>> = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// SYSTEM PROMPT FOR SELLER AGENT
// ============================================================================

const SELLER_AGENT_SYSTEM_PROMPT = `You are a helpful assistant for sellers and administrators on Dispotree.

## Your Role
You help sellers and admins manage buyer inquiries about their properties. You can view pending questions from buyers and help craft thoughtful responses.

## What You Can Do
- View all pending buyer inquiries
- Answer buyer questions about properties
- View property details
- Get statistics about inquiries
- Search through properties

## How Inquiry Answering Works
When you answer an inquiry using the 'answer_inquiry' tool:
1. Your response is automatically sent to the buyer
2. The buyer receives an email notification
3. The response is injected into the buyer's chat conversation
4. The buyer agent will share your response with them

## Best Practices for Answering Inquiries
- Be honest and transparent
- Provide specific details when possible
- If you don't know something, say so
- Keep responses professional but friendly
- Address the buyer's specific question directly

## Response Style
- Be concise and helpful
- Use bullet points when listing multiple items
- Include relevant property details when helpful
- Suggest next steps when appropriate
`;

// ============================================================================
// SELLER AGENT SERVICE
// ============================================================================

class SellerAgentService {
  private agent: any = null;
  private model: any = null;
  private modelName: string = '';
  private initialized = false;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('Seller Agent already initialized');
      return;
    }

    const openAIKey = process.env.OPENAI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!openAIKey && !openRouterKey) {
      console.warn('⚠️ No API key set for Seller Agent - Agent disabled');
      return;
    }

    try {
      // Create tools
      const tools = this.createSellerTools();

      // Initialize model
      if (openAIKey) {
        this.modelName = 'gpt-4o-mini';
        this.model = new ChatOpenAI({
          model: this.modelName,
          apiKey: openAIKey,
        });
      } else {
        this.modelName = process.env.SELLER_AGENT_MODEL || 'openai/gpt-4o-mini';
        this.model = new ChatOpenAI({
          model: this.modelName,
          apiKey: openRouterKey,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
              'X-Title': 'Dispotree Seller Agent',
            },
          },
        });
      }

      // Create agent
      this.agent = createAgent({
        model: this.model,
        tools,
        systemPrompt: SELLER_AGENT_SYSTEM_PROMPT,
      });

      this.initialized = true;
      console.log(`✅ Seller Agent initialized (${this.modelName}) - ${tools.length} tools`);
    } catch (error) {
      console.error('❌ Failed to initialize Seller Agent:', error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.initialized && this.agent !== null;
  }

  // ============================================================================
  // CHAT METHODS
  // ============================================================================

  async chat(
    sessionId: string,
    message: string,
    sellerId: string
  ): Promise<string> {
    if (!this.isReady()) {
      throw new Error('Seller Agent not initialized');
    }

    const history = await this.loadHistory(sessionId);
    await this.saveMessage(sessionId, 'user', message, sellerId);

    const contextMessage = new SystemMessage(
      `Current seller/admin ID: ${sellerId}. Current session: ${sessionId}.`
    );

    const result = await this.agent.invoke({
      messages: [contextMessage, ...history, new HumanMessage(message)],
    });

    const responseText = result.messages[result.messages.length - 1].content;
    await this.saveMessage(sessionId, 'assistant', responseText, sellerId);

    return responseText;
  }

  async *chatStream(
    sessionId: string,
    message: string,
    sellerId: string,
    includeToolEvents: boolean = true
  ): AsyncGenerator<string> {
    if (!this.isReady()) {
      throw new Error('Seller Agent not initialized');
    }

    const history = await this.loadHistory(sessionId);
    await this.saveMessage(sessionId, 'user', message, sellerId);

    const contextMessage = new SystemMessage(
      `Current seller/admin ID: ${sellerId}. Current session: ${sessionId}.`
    );

    let fullResponse = '';

    const stream = await this.agent.streamEvents(
      { messages: [contextMessage, ...history, new HumanMessage(message)] },
      { version: 'v2' }
    );

    for await (const event of stream) {
      if (event.event === 'on_tool_start' && includeToolEvents) {
        const toolName = event.name || 'unknown';
        const toolMessages: Record<string, string> = {
          get_pending_inquiries: 'Fetching pending inquiries...',
          get_inquiry_details: 'Getting inquiry details...',
          answer_inquiry: 'Submitting your response...',
          get_property_details: 'Getting property details...',
          search_my_properties: 'Searching properties...',
          get_inquiry_stats: 'Fetching statistics...',
        };
        const msg = toolMessages[toolName] || `Using ${toolName}...`;
        yield `\n{"type":"tool_start","tool":"${toolName}","message":"${msg}"}\n`;
      }

      if (event.event === 'on_chat_model_stream') {
        const text = event.data?.chunk?.content;
        if (text) {
          fullResponse += text;
          yield text;
        }
      }

      if (event.event === 'on_tool_end' && includeToolEvents) {
        const toolName = event.name || 'unknown';
        yield `\n{"type":"tool_end","tool":"${toolName}"}\n`;
      }
    }

    await this.saveMessage(sessionId, 'assistant', fullResponse, sellerId);
  }

  // ============================================================================
  // SELLER TOOLS
  // ============================================================================

  private createSellerTools(): any[] {
    return [
      // ========================================
      // GET PENDING INQUIRIES
      // ========================================
      tool(
        async ({ limit, priority, category }) => {
          try {
            const result = await inquiryService.getAllPendingInquiries({
              limit: limit || 10,
              priority,
              category,
            });

            if (result.inquiries.length === 0) {
              return 'No pending inquiries at this time.';
            }

            return JSON.stringify({
              total: result.total,
              showing: result.inquiries.length,
              inquiries: result.inquiries.map((inq: any) => ({
                id: inq.id,
                propertyId: inq.propertyId,
                propertyAddress: inq.property
                  ? `${inq.property.address}, ${inq.property.city}, ${inq.property.state}`
                  : 'Unknown',
                buyerName: inq.buyer?.name || inq.buyer?.email || 'Anonymous',
                question: inq.question,
                category: inq.category,
                priority: inq.priority,
                askedAt: inq.createdAt,
              })),
            });
          } catch (error) {
            return `Error fetching inquiries: ${error}`;
          }
        },
        {
          name: 'get_pending_inquiries',
          description: 'Get all pending buyer inquiries that need responses',
          schema: z.object({
            limit: z.number().optional().default(10).describe('Max number of inquiries'),
            priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
            category: z.enum([
              'seller_motivation', 'property_condition', 'property_history',
              'closing_terms', 'inclusions', 'pricing', 'other'
            ]).optional(),
          }),
        }
      ),

      // ========================================
      // GET INQUIRY DETAILS
      // ========================================
      tool(
        async ({ inquiryId }) => {
          try {
            const inquiry = await inquiryService.getInquiry(inquiryId);

            if (!inquiry) {
              return `Inquiry #${inquiryId} not found.`;
            }

            return JSON.stringify({
              id: inquiry.id,
              status: inquiry.status,
              property: inquiry.property
                ? {
                    id: inquiry.property.id,
                    address: `${inquiry.property.address}, ${inquiry.property.city}, ${inquiry.property.state}`,
                    askingPrice: inquiry.property.askingPrice,
                  }
                : null,
              buyer: inquiry.buyer
                ? {
                    name: inquiry.buyer.name,
                    email: inquiry.buyer.email,
                  }
                : null,
              question: inquiry.question,
              category: inquiry.category,
              priority: inquiry.priority,
              askedAt: inquiry.createdAt,
              sellerResponse: inquiry.sellerResponse,
              answeredAt: inquiry.answeredAt,
            });
          } catch (error) {
            return `Error fetching inquiry: ${error}`;
          }
        },
        {
          name: 'get_inquiry_details',
          description: 'Get detailed information about a specific inquiry',
          schema: z.object({
            inquiryId: z.number().describe('The inquiry ID'),
          }),
        }
      ),

      // ========================================
      // ANSWER INQUIRY
      // ========================================
      tool(
        async ({ inquiryId, response, sellerId }) => {
          try {
            const inquiry = await inquiryService.answerInquiry({
              inquiryId,
              response,
              answeredBy: sellerId,
              answeredByRole: 'seller',
            });

            return JSON.stringify({
              success: true,
              inquiryId: inquiry.id,
              message: 'Your response has been sent to the buyer. They will receive an email notification and see your response in their chat.',
              respondedAt: inquiry.answeredAt,
            });
          } catch (error) {
            return `Error answering inquiry: ${error}`;
          }
        },
        {
          name: 'answer_inquiry',
          description: 'Answer a buyer inquiry. The response will be sent to the buyer via email and injected into their chat conversation.',
          schema: z.object({
            inquiryId: z.number().describe('The inquiry ID to answer'),
            response: z.string().describe('Your response to the buyer\'s question'),
            sellerId: z.string().describe('The seller ID (from context)'),
          }),
        }
      ),

      // ========================================
      // GET PROPERTY DETAILS
      // ========================================
      tool(
        async ({ propertyId }) => {
          try {
            const property = await Property.findByPk(propertyId);

            if (!property) {
              return `Property #${propertyId} not found.`;
            }

            const p = property as any;
            return JSON.stringify({
              id: p.id,
              propertyId: p.propertyId,
              address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim(),
              price: p.mlsListingPrice || p.buyItNowPrice,
              arv: p.arv,
              rehabCost: p.rehabCost,
              bedrooms: p.bedroomCount,
              bathrooms: p.bathroomCount,
              sqft: p.livingSpaceSqFt,
              yearBuilt: p.yearBuilt,
              propertyType: p.propertyType,
              occupancy: p.occupancyStatus,
              description: p.propertyDescription,
              // Include seller-relevant info
              ownerName: p.llcOwnerName,
              ownerEmail: p.llcOwnerEmail,
              ownerPhone: p.llcOwnerPhone,
              dealSource: p.dealSource,
              createdAt: p.createdAt,
            });
          } catch (error) {
            return `Error fetching property: ${error}`;
          }
        },
        {
          name: 'get_property_details',
          description: 'Get detailed information about a property',
          schema: z.object({
            propertyId: z.number().describe('The property ID'),
          }),
        }
      ),

      // ========================================
      // SEARCH PROPERTIES
      // ========================================
      tool(
        async ({ city, state, limit }) => {
          try {
            const where: any = {};
            if (city) where.city = { [Op.iLike]: `%${city}%` };
            if (state) where.state = { [Op.iLike]: state };

            const properties = await Property.findAll({
              where,
              limit: limit || 10,
              order: [['createdAt', 'DESC']],
            });

            if (properties.length === 0) {
              return 'No properties found matching the criteria.';
            }

            return JSON.stringify({
              count: properties.length,
              properties: properties.map((p: any) => ({
                id: p.id,
                propertyId: p.propertyId,
                address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state}`.trim(),
                price: p.mlsListingPrice || p.buyItNowPrice,
                bedrooms: p.bedroomCount,
                status: p.status,
                createdAt: p.createdAt,
              })),
            });
          } catch (error) {
            return `Error searching properties: ${error}`;
          }
        },
        {
          name: 'search_properties',
          description: 'Search for properties',
          schema: z.object({
            city: z.string().optional().describe('City to filter by'),
            state: z.string().optional().describe('State code (e.g., TX, FL)'),
            limit: z.number().optional().default(10).describe('Max results'),
          }),
        }
      ),

      // ========================================
      // GET INQUIRY STATISTICS
      // ========================================
      tool(
        async () => {
          try {
            const stats = await inquiryService.getStats();

            return JSON.stringify({
              totalInquiries: stats.total,
              pending: stats.pending,
              answered: stats.answered,
              expired: stats.expired,
              averageResponseTime: stats.avgResponseTimeHours
                ? `${stats.avgResponseTimeHours} hours`
                : 'N/A',
              responseRate: stats.total > 0
                ? `${Math.round((stats.answered / stats.total) * 100)}%`
                : 'N/A',
            });
          } catch (error) {
            return `Error fetching stats: ${error}`;
          }
        },
        {
          name: 'get_inquiry_stats',
          description: 'Get statistics about inquiries (total, pending, answered, response time)',
          schema: z.object({}),
        }
      ),

      // ========================================
      // GET INQUIRIES FOR PROPERTY
      // ========================================
      tool(
        async ({ propertyId }) => {
          try {
            const inquiries = await inquiryService.getPendingInquiries(propertyId);

            if (inquiries.length === 0) {
              return `No pending inquiries for property #${propertyId}.`;
            }

            return JSON.stringify({
              propertyId,
              count: inquiries.length,
              inquiries: inquiries.map((inq) => ({
                id: inq.id,
                question: inq.question,
                category: inq.category,
                priority: inq.priority,
                askedAt: inq.createdAt,
              })),
            });
          } catch (error) {
            return `Error fetching property inquiries: ${error}`;
          }
        },
        {
          name: 'get_property_inquiries',
          description: 'Get all pending inquiries for a specific property',
          schema: z.object({
            propertyId: z.number().describe('The property ID'),
          }),
        }
      ),
    ];
  }

  // ============================================================================
  // CONVERSATION HISTORY
  // ============================================================================

  private async loadHistory(sessionId: string): Promise<BaseMessage[]> {
    const cached = conversationCache.get(sessionId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const messages = await ConversationHistory.findAll({
      where: { sessionId },
      order: [['createdAt', 'ASC']],
      limit: MAX_HISTORY_MESSAGES,
    });

    const history: BaseMessage[] = messages.map((msg) => {
      switch (msg.role) {
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        case 'system':
          return new SystemMessage(msg.content);
        default:
          return new HumanMessage(msg.content);
      }
    });

    conversationCache.set(sessionId, { data: history, timestamp: Date.now() });
    return history;
  }

  private async saveMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    userId?: string
  ): Promise<void> {
    await ConversationHistory.create({
      sessionId,
      userId,
      role,
      content,
    });
    conversationCache.delete(sessionId);
  }

  async clearHistory(sessionId: string): Promise<void> {
    await ConversationHistory.destroy({ where: { sessionId } });
    conversationCache.delete(sessionId);
  }

  async getHistory(sessionId: string): Promise<any[]> {
    const messages = await ConversationHistory.findAll({
      where: { sessionId },
      order: [['createdAt', 'ASC']],
    });

    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    }));
  }

  getStatus(): { ready: boolean; model: string; toolCount: number } {
    return {
      ready: this.isReady(),
      model: this.modelName,
      toolCount: this.isReady() ? 7 : 0,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const sellerAgentService = new SellerAgentService();
export default sellerAgentService;
