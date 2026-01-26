/**
 * Buyer Agent Service
 *
 * A limited AI agent designed for buyer interactions.
 * Unlike the admin agent (agentService), this agent has restricted tools
 * focused on helping buyers:
 * - Search and view properties
 * - View buy box scores
 * - Make offers
 * - Ask questions (escalates to seller when needed)
 *
 * Key feature: When buyer asks a question the agent can't answer,
 * it escalates to the seller via the inquiry system.
 */

import { createAgent, tool, HumanMessage, AIMessage, SystemMessage } from 'langchain';
import type { BaseMessage } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import Property from '../models/Property';
import DealOffer from '../models/DealOffer';
import ConversationHistory from '../models/ConversationHistory';
import PropertyInquiry from '../models/PropertyInquiry';
import HedgeFundBuyBox from '../models/HedgeFundBuyBox';
import { Op } from 'sequelize';
import { inquiryService } from './InquiryService';
import { redisService, CACHE_PREFIX, CACHE_TTL } from './RedisService';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Cache settings
const MAX_HISTORY_MESSAGES = 50;
const RECENT_MESSAGES_TO_KEEP = 10;
const SUMMARIZATION_THRESHOLD = 12;
const SUMMARIZATION_MODEL = 'gpt-4o-mini';

// In-memory conversation cache
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const conversationCache: Map<string, CacheEntry<BaseMessage[]>> = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// SYSTEM PROMPT FOR BUYER AGENT
// ============================================================================

const BUYER_AGENT_SYSTEM_PROMPT = `You are a helpful real estate assistant for buyers on Dispotree.

## Your Role
You help buyers find, evaluate, and make offers on wholesale real estate deals. You have access to property data, scores, and can help buyers make informed decisions.

## What You Can Do
- Search for properties by location, price, bedrooms, etc.
- Show property details including scores against buy boxes
- Help buyers make offers on properties
- Answer questions about properties using available data
- Check status of buyer's offers and inquiries

## CRITICAL: Handling Questions You Cannot Answer

When a buyer asks a question that you CANNOT answer from the available property data, you MUST:

1. **Acknowledge the question** - "That's a great question about [topic]!"
2. **Explain you'll get the answer** - "Let me reach out to the seller to get that information for you."
3. **Use the contact_seller tool** - This creates an inquiry that gets sent to the seller
4. **Reassure the buyer** - "I'll notify you as soon as the seller responds!"

### Examples of Questions to Escalate to Seller:
- "Why is the seller selling?" → Escalate (seller motivation)
- "Are there any known issues with the property?" → Escalate (property condition)
- "Has there been any flooding or water damage?" → Escalate (property history)
- "Is the seller flexible on closing date?" → Escalate (closing terms)
- "What appliances are included?" → Escalate (inclusions)
- "Would the seller accept $X?" → Escalate (pricing flexibility)
- "How long has the property been on the market with them?" → Escalate (deal history)
- "Can I schedule a showing?" → Escalate (scheduling)

### Examples of Questions You CAN Answer:
- "What's the asking price?" → Answer from property data
- "How many bedrooms?" → Answer from property data
- "What's the ARV?" → Answer from property data
- "What's the property score?" → Answer from scoring data
- "Show me similar properties" → Use search tools
- "What's the status of my offer?" → Use offer tools

## Important Guidelines
- NEVER make up information about the property or seller
- NEVER guess about seller motivation, property history, or terms
- ALWAYS use the contact_seller tool when you don't have the information
- Be helpful, friendly, and transparent about what you know vs. don't know
- When seller responds (you'll see a [SELLER RESPONSE RECEIVED] message), share the answer with the buyer

## Response Style
- Be concise and helpful
- Use bullet points for listing multiple properties
- Include key metrics: price, beds, baths, sqft, score
- Offer next steps: "Would you like to make an offer?" or "Any other questions?"
`;

// ============================================================================
// BUYER AGENT SERVICE
// ============================================================================

class BuyerAgentService {
  private agent: any = null;
  private model: any = null;
  private modelName: string = '';
  private initialized = false;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('Buyer Agent already initialized');
      return;
    }

    const openAIKey = process.env.OPENAI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!openAIKey && !openRouterKey) {
      console.warn('⚠️ No API key set for Buyer Agent - Agent disabled');
      return;
    }

    try {
      // Initialize inquiry service first
      if (!inquiryService.isReady()) {
        await inquiryService.initialize();
      }

      // Create tools
      const tools = this.createBuyerTools();

      // Initialize model
      if (openAIKey) {
        this.modelName = 'gpt-4o-mini';
        this.model = new ChatOpenAI({
          model: this.modelName,
          apiKey: openAIKey,
        });
      } else {
        this.modelName = process.env.BUYER_AGENT_MODEL || 'openai/gpt-4o-mini';
        this.model = new ChatOpenAI({
          model: this.modelName,
          apiKey: openRouterKey,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
              'X-Title': 'Dispotree Buyer Agent',
            },
          },
        });
      }

      // Create agent
      this.agent = createAgent({
        model: this.model,
        tools,
        systemPrompt: BUYER_AGENT_SYSTEM_PROMPT,
      });

      this.initialized = true;
      console.log(`✅ Buyer Agent initialized (${this.modelName}) - ${tools.length} tools`);
    } catch (error) {
      console.error('❌ Failed to initialize Buyer Agent:', error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.initialized && this.agent !== null;
  }

  // ============================================================================
  // CHAT METHODS
  // ============================================================================

  /**
   * Chat with the buyer agent
   */
  async chat(
    sessionId: string,
    message: string,
    buyerId: string
  ): Promise<string> {
    if (!this.isReady()) {
      throw new Error('Buyer Agent not initialized');
    }

    // Load conversation history
    const history = await this.loadHistory(sessionId);

    // Save user message
    await this.saveMessage(sessionId, 'user', message, buyerId);

    // Prepare messages with buyer context
    const contextMessage = new SystemMessage(
      `Current buyer ID: ${buyerId}. Current session: ${sessionId}. ` +
      `Use these when creating inquiries or offers.`
    );

    // Invoke agent
    const result = await this.agent.invoke({
      messages: [contextMessage, ...history, new HumanMessage(message)],
    });

    // Extract response
    const responseText = result.messages[result.messages.length - 1].content;

    // Save assistant response
    await this.saveMessage(sessionId, 'assistant', responseText, buyerId);

    return responseText;
  }

  /**
   * Stream chat response
   */
  async *chatStream(
    sessionId: string,
    message: string,
    buyerId: string,
    includeToolEvents: boolean = true
  ): AsyncGenerator<string> {
    if (!this.isReady()) {
      throw new Error('Buyer Agent not initialized');
    }

    // Load conversation history
    const history = await this.loadHistory(sessionId);

    // Save user message
    await this.saveMessage(sessionId, 'user', message, buyerId);

    // Prepare messages
    const contextMessage = new SystemMessage(
      `Current buyer ID: ${buyerId}. Current session: ${sessionId}.`
    );

    let fullResponse = '';

    // Stream agent response
    const stream = await this.agent.streamEvents(
      { messages: [contextMessage, ...history, new HumanMessage(message)] },
      { version: 'v2' }
    );

    for await (const event of stream) {
      // Handle tool start events
      if (event.event === 'on_tool_start' && includeToolEvents) {
        const toolName = event.name || 'unknown';
        const toolMessages: Record<string, string> = {
          search_properties: 'Searching for properties...',
          get_property_details: 'Getting property details...',
          get_property_scores: 'Fetching property scores...',
          make_offer: 'Submitting your offer...',
          contact_seller: 'Reaching out to the seller...',
          get_my_offers: 'Checking your offers...',
          get_my_inquiries: 'Checking your inquiries...',
        };
        const msg = toolMessages[toolName] || `Using ${toolName}...`;
        yield `\n{"type":"tool_start","tool":"${toolName}","message":"${msg}"}\n`;
      }

      // Handle streaming content
      if (event.event === 'on_chat_model_stream') {
        const text = event.data?.chunk?.content;
        if (text) {
          fullResponse += text;
          yield text;
        }
      }

      // Handle tool end events
      if (event.event === 'on_tool_end' && includeToolEvents) {
        const toolName = event.name || 'unknown';
        yield `\n{"type":"tool_end","tool":"${toolName}"}\n`;
      }
    }

    // Save complete response
    await this.saveMessage(sessionId, 'assistant', fullResponse, buyerId);
  }

  // ============================================================================
  // BUYER TOOLS (LIMITED SET)
  // ============================================================================

  private createBuyerTools(): any[] {
    return [
      // ========================================
      // PROPERTY SEARCH
      // ========================================
      tool(
        async ({ city, state, minPrice, maxPrice, minBedrooms, maxBedrooms, propertyType, limit }) => {
          try {
            const where: any = {};
            if (city) where.city = { [Op.iLike]: `%${city}%` };
            if (state) where.state = { [Op.iLike]: state };
            if (minPrice) where.mlsListingPrice = { ...where.mlsListingPrice, [Op.gte]: minPrice };
            if (maxPrice) where.mlsListingPrice = { ...where.mlsListingPrice, [Op.lte]: maxPrice };
            if (minBedrooms) where.bedroomCount = { ...where.bedroomCount, [Op.gte]: minBedrooms };
            if (maxBedrooms) where.bedroomCount = { ...where.bedroomCount, [Op.lte]: maxBedrooms };
            if (propertyType) where.propertyType = { [Op.iLike]: `%${propertyType}%` };

            const properties = await Property.findAll({
              where,
              limit: limit || 10,
              order: [['createdAt', 'DESC']],
              attributes: [
                'id', 'propertyId', 'address', 'city', 'state', 'zip',
                'mlsListingPrice', 'buyItNowPrice', 'bedroomCount', 'bathroomCount',
                'livingSpaceSqFt', 'propertyType', 'arv', 'createdAt',
              ],
            });

            if (properties.length === 0) {
              return 'No properties found matching your criteria. Try adjusting your filters.';
            }

            return JSON.stringify({
              count: properties.length,
              properties: properties.map((p: any) => ({
                id: p.id,
                propertyId: p.propertyId,
                address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim(),
                price: p.mlsListingPrice || p.buyItNowPrice,
                bedrooms: p.bedroomCount,
                bathrooms: p.bathroomCount,
                sqft: p.livingSpaceSqFt,
                propertyType: p.propertyType,
                arv: p.arv,
                addedAt: p.createdAt,
              })),
            });
          } catch (error) {
            return `Error searching properties: ${error}`;
          }
        },
        {
          name: 'search_properties',
          description: 'Search for available properties. Filter by location, price, bedrooms, etc.',
          schema: z.object({
            city: z.string().optional().describe('City name'),
            state: z.string().optional().describe('State code (e.g., TX, FL)'),
            minPrice: z.number().optional().describe('Minimum price'),
            maxPrice: z.number().optional().describe('Maximum price'),
            minBedrooms: z.number().optional().describe('Minimum bedrooms'),
            maxBedrooms: z.number().optional().describe('Maximum bedrooms'),
            propertyType: z.string().optional().describe('Property type'),
            limit: z.number().optional().default(10).describe('Max results'),
          }),
        }
      ),

      // ========================================
      // PROPERTY DETAILS
      // ========================================
      tool(
        async ({ propertyId }) => {
          try {
            const property = await Property.findOne({
              where: { [Op.or]: [{ propertyId }, { id: propertyId }] },
            });

            if (!property) {
              return `Property ${propertyId} not found.`;
            }

            const p = property as any;
            return JSON.stringify({
              id: p.id,
              propertyId: p.propertyId,
              address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim(),
              price: p.mlsListingPrice || p.buyItNowPrice,
              arv: p.arv,
              rehabCost: p.rehabCost,
              potentialProfit: p.arv && p.mlsListingPrice ? p.arv - p.mlsListingPrice - (p.rehabCost || 0) : null,
              bedrooms: p.bedroomCount,
              bathrooms: p.bathroomCount,
              sqft: p.livingSpaceSqFt,
              lotSize: p.lotSizeSqFt,
              yearBuilt: p.yearBuilt,
              propertyType: p.propertyType,
              occupancy: p.occupancyStatus,
              description: p.propertyDescription,
              photos: p.imageUrls?.slice(0, 5) || [],
              addedAt: p.createdAt,
              // Note: We explicitly don't include seller contact info
            });
          } catch (error) {
            return `Error getting property: ${error}`;
          }
        },
        {
          name: 'get_property_details',
          description: 'Get detailed information about a specific property',
          schema: z.object({
            propertyId: z.string().describe('The property ID'),
          }),
        }
      ),

      // ========================================
      // PROPERTY SCORES
      // ========================================
      tool(
        async ({ propertyId }) => {
          try {
            const property = await Property.findOne({
              where: { [Op.or]: [{ propertyId }, { id: propertyId }] },
            });

            if (!property) {
              return `Property ${propertyId} not found.`;
            }

            const p = property as any;

            // Get buy box scores if available
            const buyBoxScores = p.buyBoxScores || [];

            return JSON.stringify({
              propertyId: p.propertyId,
              address: `${p.city}, ${p.state}`,
              overallScore: p.dealScore || null,
              buyBoxMatches: buyBoxScores.map((score: any) => ({
                buyBoxName: score.buyBoxName || 'Unknown Fund',
                score: score.score,
                matchType: score.matchType,
                passedHardRequirements: score.passedHardRequirements,
              })),
              metrics: {
                price: p.mlsListingPrice || p.buyItNowPrice,
                arv: p.arv,
                equity: p.arv && p.mlsListingPrice
                  ? Math.round(((p.arv - p.mlsListingPrice) / p.arv) * 100)
                  : null,
                rehabCost: p.rehabCost,
              },
            });
          } catch (error) {
            return `Error getting scores: ${error}`;
          }
        },
        {
          name: 'get_property_scores',
          description: 'Get the scores and buy box matches for a property',
          schema: z.object({
            propertyId: z.string().describe('The property ID'),
          }),
        }
      ),

      // ========================================
      // MAKE OFFER
      // ========================================
      tool(
        async ({ propertyId, offerAmount, message, buyerId }) => {
          try {
            const property = await Property.findOne({
              where: { [Op.or]: [{ propertyId }, { id: propertyId }] },
            });

            if (!property) {
              return `Property ${propertyId} not found.`;
            }

            const p = property as any;
            const askingPrice = p.mlsListingPrice || p.buyItNowPrice;

            // Create the offer
            const offer = await DealOffer.create({
              propertyId: p.id,
              dealId: p.propertyId || String(p.id),
              userId: buyerId,
              offerAmount: offerAmount,
              notes: message || undefined,
              status: 'pending',
              financeType: 'cash',
              closingDays: 30, // Default 30-day closing
              contingencies: [], // No contingencies for cash offer
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            });

            const percentOfAsking = askingPrice
              ? Math.round((offerAmount / askingPrice) * 100)
              : null;

            return JSON.stringify({
              success: true,
              offerId: offer.getDataValue('id'),
              message: `Your offer of $${offerAmount.toLocaleString()} has been submitted!`,
              details: {
                propertyAddress: `${p.city}, ${p.state}`,
                offerAmount,
                askingPrice,
                percentOfAsking,
                status: 'pending',
              },
              nextSteps: 'The seller will review your offer and respond. You\'ll be notified of any updates.',
            });
          } catch (error) {
            return `Error submitting offer: ${error}`;
          }
        },
        {
          name: 'make_offer',
          description: 'Submit an offer on a property',
          schema: z.object({
            propertyId: z.string().describe('The property ID'),
            offerAmount: z.number().describe('Your offer amount in dollars'),
            message: z.string().optional().describe('Optional message to the seller'),
            buyerId: z.string().describe('The buyer ID (from context)'),
          }),
        }
      ),

      // ========================================
      // CONTACT SELLER (KEY TOOL)
      // ========================================
      tool(
        async ({ propertyId, question, category, buyerId, sessionId }) => {
          try {
            // Check for existing pending inquiry
            const existing = await inquiryService.hasPendingInquiry(
              buyerId,
              parseInt(propertyId),
              question
            );

            if (existing) {
              return JSON.stringify({
                success: true,
                alreadySubmitted: true,
                inquiryId: existing.id,
                message: "You've already asked a similar question about this property. " +
                         "I'll let you know as soon as the seller responds!",
              });
            }

            // Create new inquiry
            const inquiry = await inquiryService.createInquiry({
              propertyId: parseInt(propertyId),
              buyerId,
              sessionId,
              question,
              category: category || 'other',
              priority: 'normal',
            });

            return JSON.stringify({
              success: true,
              inquiryId: inquiry.id,
              message: "I've contacted the seller with your question. " +
                       "I'll notify you as soon as they respond!",
              question,
              estimatedResponseTime: '24-48 hours',
            });
          } catch (error) {
            return `Error contacting seller: ${error}`;
          }
        },
        {
          name: 'contact_seller',
          description: 'Contact the seller to get information about a property that you cannot answer from available data. Use this when the buyer asks about seller motivation, property condition, history, closing terms, inclusions, or pricing flexibility.',
          schema: z.object({
            propertyId: z.string().describe('The property ID'),
            question: z.string().describe('The specific question to ask the seller'),
            category: z.enum([
              'seller_motivation',
              'property_condition',
              'property_history',
              'closing_terms',
              'inclusions',
              'pricing',
              'other',
            ]).optional().describe('Category of the question'),
            buyerId: z.string().describe('The buyer ID (from context)'),
            sessionId: z.string().describe('The session ID (from context)'),
          }),
        }
      ),

      // ========================================
      // GET MY OFFERS
      // ========================================
      tool(
        async ({ buyerId, status }) => {
          try {
            const where: any = { userId: buyerId };
            if (status) where.status = status;

            const offers = await DealOffer.findAll({
              where,
              order: [['createdAt', 'DESC']],
              limit: 20,
            });

            if (offers.length === 0) {
              return "You haven't made any offers yet. Would you like to browse properties?";
            }

            // Get property details for each offer
            const offerDetails = await Promise.all(
              offers.map(async (offer: any) => {
                const property = await Property.findByPk(offer.propertyId);
                return {
                  offerId: offer.id,
                  propertyId: offer.dealId,
                  address: property
                    ? `${property.getDataValue('city')}, ${property.getDataValue('state')}`
                    : 'Unknown',
                  offerAmount: offer.offerPrice,
                  status: offer.status,
                  submittedAt: offer.createdAt,
                  counterOffer: offer.counterOfferPrice,
                };
              })
            );

            return JSON.stringify({
              count: offers.length,
              offers: offerDetails,
            });
          } catch (error) {
            return `Error getting offers: ${error}`;
          }
        },
        {
          name: 'get_my_offers',
          description: "Get the buyer's submitted offers and their status",
          schema: z.object({
            buyerId: z.string().describe('The buyer ID'),
            status: z.enum(['pending', 'accepted', 'rejected', 'countered', 'expired'])
              .optional()
              .describe('Filter by status'),
          }),
        }
      ),

      // ========================================
      // GET MY INQUIRIES
      // ========================================
      tool(
        async ({ buyerId, status }) => {
          try {
            const inquiries = await inquiryService.getBuyerInquiries(
              buyerId,
              status as any
            );

            if (inquiries.length === 0) {
              return "You don't have any inquiries yet.";
            }

            return JSON.stringify({
              count: inquiries.length,
              inquiries: inquiries.map((inq) => ({
                inquiryId: inq.id,
                propertyId: inq.propertyId,
                question: inq.question,
                status: inq.status,
                askedAt: inq.createdAt,
                sellerResponse: inq.sellerResponse,
                answeredAt: inq.answeredAt,
              })),
            });
          } catch (error) {
            return `Error getting inquiries: ${error}`;
          }
        },
        {
          name: 'get_my_inquiries',
          description: "Get the buyer's submitted inquiries and their responses",
          schema: z.object({
            buyerId: z.string().describe('The buyer ID'),
            status: z.enum(['pending', 'answered', 'expired', 'cancelled'])
              .optional()
              .describe('Filter by status'),
          }),
        }
      ),

      // ========================================
      // FIND SIMILAR PROPERTIES
      // ========================================
      tool(
        async ({ propertyId, limit }) => {
          try {
            const sourceProperty = await Property.findOne({
              where: { [Op.or]: [{ propertyId }, { id: propertyId }] },
            });

            if (!sourceProperty) {
              return `Property ${propertyId} not found.`;
            }

            const p = sourceProperty as any;
            const price = p.mlsListingPrice || p.buyItNowPrice || 200000;
            const bedrooms = p.bedroomCount || 3;

            const similar = await Property.findAll({
              where: {
                id: { [Op.ne]: p.id },
                state: { [Op.iLike]: p.state },
                mlsListingPrice: {
                  [Op.between]: [price * 0.7, price * 1.3],
                },
                bedroomCount: {
                  [Op.between]: [bedrooms - 1, bedrooms + 1],
                },
              },
              limit: limit || 5,
              order: [['createdAt', 'DESC']],
            });

            if (similar.length === 0) {
              return 'No similar properties found in the same area.';
            }

            return JSON.stringify({
              basedOn: `${p.city}, ${p.state} - $${price.toLocaleString()}, ${bedrooms} beds`,
              similarProperties: similar.map((s: any) => ({
                propertyId: s.propertyId,
                address: `${s.address?.houseNumber || ''} ${s.address?.street || ''}, ${s.city}, ${s.state}`.trim(),
                price: s.mlsListingPrice || s.buyItNowPrice,
                bedrooms: s.bedroomCount,
                bathrooms: s.bathroomCount,
                sqft: s.livingSpaceSqFt,
              })),
            });
          } catch (error) {
            return `Error finding similar properties: ${error}`;
          }
        },
        {
          name: 'find_similar_properties',
          description: 'Find properties similar to a given property',
          schema: z.object({
            propertyId: z.string().describe('The property ID to find similar properties for'),
            limit: z.number().optional().default(5).describe('Max results'),
          }),
        }
      ),
    ];
  }

  // ============================================================================
  // CONVERSATION HISTORY METHODS
  // ============================================================================

  private async loadHistory(sessionId: string): Promise<BaseMessage[]> {
    // Check in-memory cache first
    const cached = conversationCache.get(sessionId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // Load from database
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

    // Cache it
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

    // Invalidate cache
    conversationCache.delete(sessionId);
  }

  /**
   * Clear conversation history for a session
   */
  async clearHistory(sessionId: string): Promise<void> {
    await ConversationHistory.destroy({ where: { sessionId } });
    conversationCache.delete(sessionId);
  }

  /**
   * Get conversation history
   */
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

  // ============================================================================
  // STATUS
  // ============================================================================

  getStatus(): {
    ready: boolean;
    model: string;
    toolCount: number;
  } {
    return {
      ready: this.isReady(),
      model: this.modelName,
      toolCount: this.isReady() ? 8 : 0, // We have 8 tools
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const buyerAgentService = new BuyerAgentService();
export default buyerAgentService;
