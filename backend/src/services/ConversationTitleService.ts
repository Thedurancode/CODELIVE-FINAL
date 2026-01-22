/**
 * ConversationTitleService
 *
 * Generates smart, concise titles for chat conversations using AI.
 * Uses a fast, cheap model (gpt-4o-mini) for quick title generation.
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import Conversation from '../models/Conversation';

class ConversationTitleService {
  private model: ChatOpenAI | null = null;
  private initialized = false;

  /**
   * Initialize the title generation model
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const openAIKey = process.env.OPENAI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (openAIKey) {
      // Use OpenAI directly
      this.model = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        openAIApiKey: openAIKey,
        temperature: 0.3,
        maxTokens: 50,
      });
      console.log('✅ ConversationTitleService initialized with OpenAI');
    } else if (openRouterKey) {
      // Use OpenRouter with a fast, cheap model
      this.model = new ChatOpenAI({
        modelName: 'openai/gpt-4o-mini',
        openAIApiKey: openRouterKey,
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
        },
        temperature: 0.3,
        maxTokens: 50,
      });
      console.log('✅ ConversationTitleService initialized with OpenRouter');
    } else {
      console.warn('⚠️ ConversationTitleService: No API key available, using fallback titles');
    }

    this.initialized = true;
  }

  /**
   * Generate a smart title for a conversation based on the first message exchange
   * @param firstUserMessage - The first message from the user
   * @param firstAssistantResponse - The first response from the assistant (optional, truncated)
   * @returns Generated title (3-6 words)
   */
  async generateTitle(
    firstUserMessage: string,
    firstAssistantResponse?: string
  ): Promise<string> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // If no model available, use fallback
    if (!this.model) {
      return this.generateFallbackTitle(firstUserMessage);
    }

    try {
      const truncatedResponse = firstAssistantResponse
        ? firstAssistantResponse.slice(0, 500)
        : '';

      const systemPrompt = `You are a title generator for a real estate deal management chat. Generate a concise 3-6 word title that captures the main topic of the conversation.

Focus on:
- Location/state if mentioned (e.g., "Texas", "NJ", "California")
- Price range if mentioned (e.g., "Under $300K", "$200K-$500K")
- Property type if mentioned (e.g., "Single Family", "Multi-family")
- Action type (e.g., "Search", "Analysis", "Scoring", "Pipeline")

Examples of good titles:
- "Texas Properties Under $300K"
- "NJ Fix & Flip Search"
- "Houston Deal Analysis"
- "Florida Multi-Family Deals"
- "California Buy Box Setup"
- "Property Pipeline Review"
- "ARV Analysis Request"
- "Deal Inquiry"
- "Property Question"
- "Market Research"

IMPORTANT: NEVER respond with phrases like "No specific topic provided", "No topic", "Untitled", or similar. Always provide a meaningful title based on the content, even if generic like "Deal Discussion" or "Property Inquiry".

Return ONLY the title, no quotes or punctuation at the end.`;

      const userPrompt = `User message: "${firstUserMessage}"
${truncatedResponse ? `\nAssistant response (excerpt): "${truncatedResponse}"` : ''}

Generate a title:`;

      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const title = (response.content as string).trim();

      // Check for bad/generic titles
      const badTitles = [
        'no specific topic',
        'no topic',
        'untitled',
        'no title',
        'no details',
        'not specified',
        'n/a',
        'none',
        'no active conversation',
      ];

      const lowerTitle = title.toLowerCase();
      if (badTitles.some(bad => lowerTitle.includes(bad))) {
        return this.generateFallbackTitle(firstUserMessage);
      }

      // Validate title length (2-8 words)
      const words = title.split(/\s+/);
      if (words.length >= 2 && words.length <= 8) {
        return title;
      }

      // If title is too long or short, use fallback
      return this.generateFallbackTitle(firstUserMessage);
    } catch (error) {
      console.error('Error generating title:', error);
      return this.generateFallbackTitle(firstUserMessage);
    }
  }

  /**
   * Generate a fallback title using simple extraction
   * @param message - The first user message
   * @returns Extracted title
   */
  private generateFallbackTitle(message: string): string {
    // Extract key entities from the message
    const entities = this.extractKeyEntities(message);

    if (entities.state && entities.priceRange) {
      return `${entities.state} ${entities.action || 'Deals'} ${entities.priceRange}`;
    }

    if (entities.state) {
      return `${entities.state} ${entities.action || 'Property Search'}`;
    }

    if (entities.priceRange) {
      return `Deals ${entities.priceRange}`;
    }

    if (entities.action) {
      return `Property ${entities.action}`;
    }

    // Fallback to truncated message or generic title
    const cleanedMessage = message.replace(/[^\w\s]/g, '').trim();
    if (cleanedMessage.length < 5) {
      return 'Deal Discussion';
    }

    const words = cleanedMessage.split(/\s+/).slice(0, 5);
    const title = words.join(' ');

    // If the truncated message is too short or generic, use a default
    if (title.length < 10) {
      return 'Property Inquiry';
    }

    return title + (cleanedMessage.split(/\s+/).length > 5 ? '...' : '');
  }

  /**
   * Extract key entities from a message for fallback title generation
   */
  private extractKeyEntities(text: string): {
    state?: string;
    priceRange?: string;
    action?: string;
  } {
    const result: { state?: string; priceRange?: string; action?: string } = {};

    // State extraction (common US states)
    const states: Record<string, string> = {
      texas: 'Texas',
      tx: 'Texas',
      florida: 'Florida',
      fl: 'Florida',
      california: 'California',
      ca: 'California',
      'new jersey': 'NJ',
      nj: 'NJ',
      'new york': 'NY',
      ny: 'NY',
      georgia: 'Georgia',
      ga: 'Georgia',
      ohio: 'Ohio',
      oh: 'Ohio',
      pennsylvania: 'PA',
      pa: 'PA',
      arizona: 'Arizona',
      az: 'Arizona',
      nevada: 'Nevada',
      nv: 'Nevada',
      colorado: 'Colorado',
      co: 'Colorado',
      illinois: 'Illinois',
      il: 'Illinois',
    };

    const lowerText = text.toLowerCase();
    for (const [key, value] of Object.entries(states)) {
      if (lowerText.includes(key)) {
        result.state = value;
        break;
      }
    }

    // Price range extraction
    const priceMatch = text.match(/\$?(\d{1,3})[,.]?(\d{3})?\s*[kK]?/);
    if (priceMatch) {
      const amount = parseInt(priceMatch[1] + (priceMatch[2] || '000'));
      if (amount > 0) {
        if (lowerText.includes('under') || lowerText.includes('below') || lowerText.includes('<')) {
          result.priceRange = `Under $${Math.round(amount / 1000)}K`;
        } else if (lowerText.includes('over') || lowerText.includes('above') || lowerText.includes('>')) {
          result.priceRange = `Over $${Math.round(amount / 1000)}K`;
        } else {
          result.priceRange = `$${Math.round(amount / 1000)}K`;
        }
      }
    }

    // Action extraction
    const actions: Record<string, string> = {
      find: 'Search',
      search: 'Search',
      show: 'Search',
      list: 'Search',
      analyze: 'Analysis',
      analysis: 'Analysis',
      score: 'Scoring',
      scoring: 'Scoring',
      pipeline: 'Pipeline',
      compare: 'Comparison',
      buybox: 'Buy Box',
      'buy box': 'Buy Box',
    };

    for (const [key, value] of Object.entries(actions)) {
      if (lowerText.includes(key)) {
        result.action = value;
        break;
      }
    }

    return result;
  }

  /**
   * Create or update a conversation with a generated title
   */
  async createConversation(
    sessionId: string,
    userId: string,
    firstUserMessage: string,
    firstAssistantResponse?: string
  ): Promise<Conversation> {
    const title = await this.generateTitle(firstUserMessage, firstAssistantResponse);

    const [conversation] = await Conversation.findOrCreate({
      where: { id: sessionId },
      defaults: {
        id: sessionId,
        userId,
        title,
        generatedTitle: true,
        messageCount: 1,
        lastMessageAt: new Date(),
      },
    });

    return conversation;
  }

  /**
   * Update conversation title (manual edit)
   */
  async updateTitle(
    sessionId: string,
    title: string,
    isGenerated: boolean = false
  ): Promise<void> {
    await Conversation.update(
      {
        title,
        generatedTitle: isGenerated,
      },
      { where: { id: sessionId } }
    );
  }

  /**
   * Increment message count and update last message timestamp
   */
  async incrementMessageCount(sessionId: string): Promise<void> {
    await Conversation.increment('messageCount', {
      by: 1,
      where: { id: sessionId },
    });
    await Conversation.update(
      { lastMessageAt: new Date() },
      { where: { id: sessionId } }
    );
  }

  /**
   * Get all conversations for a user
   */
  async getConversations(userId: string): Promise<Conversation[]> {
    return Conversation.findAll({
      where: { userId },
      order: [['lastMessageAt', 'DESC']],
    });
  }

  /**
   * Get a single conversation
   */
  async getConversation(sessionId: string): Promise<Conversation | null> {
    return Conversation.findByPk(sessionId);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(sessionId: string): Promise<void> {
    await Conversation.destroy({ where: { id: sessionId } });
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }
}

export const conversationTitleService = new ConversationTitleService();
export default conversationTitleService;
