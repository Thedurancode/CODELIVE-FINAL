/**
 * Persona Service
 *
 * Manages AI persona behavior including:
 * - User communication style preferences
 * - Auto-detection of user communication patterns
 * - Contextual greeting generation
 * - Relationship stage tracking
 */

import UserPersonaPreference, {
  type PersonaStyle,
  type VerbosityLevel,
  type ProactivityLevel,
  type HumorLevel,
  type DetectedStyle,
} from '../../models/UserPersonaPreference';
import {
  buildPersonaPrompt,
  getGreeting,
  DEFAULT_PERSONA_CONFIG,
} from './prompts/persona-templates';
import { logger } from '../LoggerService';

// Thresholds for relationship stage progression
const RELATIONSHIP_THRESHOLDS = {
  familiar: 5,    // conversations to become familiar
  trusted: 20,    // conversations to become trusted
  partner: 50,    // conversations to become a partner
};

// Cooldown for style analysis to prevent excessive processing
const STYLE_ANALYSIS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Persona configuration for agent context
 */
export interface PersonaConfig {
  style: PersonaStyle;
  verbosity: VerbosityLevel;
  proactivity: ProactivityLevel;
  humorLevel: HumorLevel;
  namePreference?: string;
  customInstructions?: string;
  relationshipStage: string;
}

/**
 * Context for generating greetings
 */
export interface GreetingContext {
  lastActiveAt?: Date;
  recentDealClosed?: boolean;
  pipelineCount?: number;
}

/**
 * Message for style analysis
 */
export interface AnalysisMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

class PersonaService {
  private initialized = false;
  private cache: Map<string, { config: PersonaConfig; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure the model is synced (table exists)
      await UserPersonaPreference.sync({ alter: false });
      this.initialized = true;
      logger.info('PersonaService initialized');
    } catch (error) {
      logger.warn('PersonaService initialization failed - will use defaults', { error });
      this.initialized = true; // Continue with defaults
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get persona configuration for a user
   */
  async getPersonaConfig(userId: string): Promise<PersonaConfig> {
    // Check cache
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.config;
    }

    try {
      let preference = await UserPersonaPreference.findOne({
        where: { userId },
      });

      // Create default if not exists
      if (!preference) {
        preference = await UserPersonaPreference.create({
          userId,
          ...DEFAULT_PERSONA_CONFIG,
        });
      }

      const config: PersonaConfig = {
        style: preference.personaStyle,
        verbosity: preference.verbosity,
        proactivity: preference.proactivity,
        humorLevel: preference.humorLevel,
        namePreference: preference.namePreference,
        customInstructions: preference.customInstructions,
        relationshipStage: preference.relationshipStage,
      };

      // Update cache
      this.cache.set(userId, { config, timestamp: Date.now() });

      return config;
    } catch (error) {
      logger.warn('Failed to get persona config, using defaults', { userId, error });
      return DEFAULT_PERSONA_CONFIG as PersonaConfig;
    }
  }

  /**
   * Get persona prompt segment for injection into system prompt
   */
  async getPersonaPrompt(userId: string): Promise<string> {
    const config = await this.getPersonaConfig(userId);
    return buildPersonaPrompt(config);
  }

  /**
   * Get contextual greeting based on time, user, and context
   */
  async getContextualGreeting(
    userId: string,
    userName: string | undefined,
    context?: GreetingContext
  ): Promise<string> {
    const config = await this.getPersonaConfig(userId);
    const hour = new Date().getHours();

    return getGreeting(config.style, userName || config.namePreference, hour, context);
  }

  /**
   * Update user persona preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<{
      personaStyle: PersonaStyle;
      verbosity: VerbosityLevel;
      proactivity: ProactivityLevel;
      humorLevel: HumorLevel;
      namePreference: string;
      customInstructions: string;
    }>
  ): Promise<PersonaConfig> {
    try {
      const [preference] = await UserPersonaPreference.upsert({
        userId,
        ...updates,
      });

      // Clear cache
      this.cache.delete(userId);

      logger.info('Updated persona preferences', { userId, updates: Object.keys(updates) });

      return this.getPersonaConfig(userId);
    } catch (error) {
      logger.error('Failed to update persona preferences', { userId, error });
      throw error;
    }
  }

  /**
   * Analyze user messages to detect communication style
   */
  async analyzeUserStyle(userId: string, messages: AnalysisMessage[]): Promise<DetectedStyle | null> {
    try {
      // Get existing preference
      const preference = await UserPersonaPreference.findOne({ where: { userId } });

      // Check cooldown
      if (preference?.detectedStyle?.lastAnalyzed) {
        const timeSinceLastAnalysis = Date.now() - new Date(preference.detectedStyle.lastAnalyzed).getTime();
        if (timeSinceLastAnalysis < STYLE_ANALYSIS_COOLDOWN_MS) {
          return preference.detectedStyle;
        }
      }

      // Filter to user messages only
      const userMessages = messages.filter((m) => m.role === 'user');
      if (userMessages.length < 5) {
        return null; // Not enough messages to analyze
      }

      // Analyze patterns
      const analysis = this.performStyleAnalysis(userMessages);

      // Store the detected style
      if (preference) {
        await preference.update({ detectedStyle: analysis });
      } else {
        await UserPersonaPreference.create({
          userId,
          detectedStyle: analysis,
        });
      }

      // Clear cache
      this.cache.delete(userId);

      logger.info('Analyzed user communication style', { userId, formality: analysis.formality });

      return analysis;
    } catch (error) {
      logger.warn('Failed to analyze user style', { userId, error });
      return null;
    }
  }

  /**
   * Perform actual style analysis on messages
   */
  private performStyleAnalysis(messages: AnalysisMessage[]): DetectedStyle {
    const contents = messages.map((m) => m.content);

    // Calculate average message length
    const avgLength = contents.reduce((sum, c) => sum + c.length, 0) / contents.length;

    // Check for emoji usage
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu;
    const usesEmoji = contents.some((c) => emojiRegex.test(c));

    // Analyze formality (0-1 scale)
    const formalityScore = this.calculateFormality(contents);

    // Detect preferred terms
    const preferredTerms = this.detectPreferredTerms(contents);

    // Determine response speed preference (based on message characteristics)
    const responseSpeed = avgLength > 100 ? 'thoughtful' : 'fast';

    return {
      formality: formalityScore,
      avgMessageLength: Math.round(avgLength),
      usesEmoji,
      preferredTerms,
      responseSpeed,
      lastAnalyzed: new Date(),
      sampleCount: messages.length,
    };
  }

  /**
   * Calculate formality score from messages
   */
  private calculateFormality(contents: string[]): number {
    const allText = contents.join(' ').toLowerCase();

    // Informal indicators
    const informalPatterns = [
      /\b(hey|hi|yo|sup|yeah|yep|nope|gonna|wanna|gotta|kinda|sorta)\b/gi,
      /!{2,}/g,
      /\?\?+/g,
      /lol|haha|omg|btw|fyi|asap/gi,
      /\.\.\./g,
    ];

    // Formal indicators
    const formalPatterns = [
      /\b(please|kindly|would you|could you|thank you|appreciate|regarding|concerning)\b/gi,
      /\b(furthermore|however|therefore|additionally|consequently)\b/gi,
    ];

    let informalCount = 0;
    let formalCount = 0;

    for (const pattern of informalPatterns) {
      const matches = allText.match(pattern);
      if (matches) informalCount += matches.length;
    }

    for (const pattern of formalPatterns) {
      const matches = allText.match(pattern);
      if (matches) formalCount += matches.length;
    }

    // Calculate score (0 = very informal, 1 = very formal)
    const total = informalCount + formalCount;
    if (total === 0) return 0.5; // Neutral

    return Math.min(1, Math.max(0, formalCount / total));
  }

  /**
   * Detect user's preferred terminology
   */
  private detectPreferredTerms(contents: string[]): string[] {
    const allText = contents.join(' ').toLowerCase();
    const terms: string[] = [];

    // Real estate terminology preferences
    const termGroups = [
      { terms: ['deal', 'property', 'opportunity', 'listing'], key: 'property_reference' },
      { terms: ['arv', 'after repair value', 'value after repairs'], key: 'arv_reference' },
      { terms: ['roi', 'return', 'profit', 'yield'], key: 'return_reference' },
    ];

    for (const group of termGroups) {
      let maxCount = 0;
      let preferred = group.terms[0];

      for (const term of group.terms) {
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        const matches = allText.match(regex);
        const count = matches ? matches.length : 0;

        if (count > maxCount) {
          maxCount = count;
          preferred = term;
        }
      }

      if (maxCount > 0) {
        terms.push(preferred);
      }
    }

    return terms;
  }

  /**
   * Record a conversation and potentially update relationship stage
   */
  async recordConversation(userId: string): Promise<void> {
    try {
      const preference = await UserPersonaPreference.findOne({ where: { userId } });

      if (preference) {
        const newCount = preference.totalConversations + 1;
        const updates: Partial<UserPersonaPreference> = {
          totalConversations: newCount,
        };

        // Update first interaction if not set
        if (!preference.firstInteractionAt) {
          updates.firstInteractionAt = new Date();
        }

        // Check for relationship stage progression
        const newStage = this.calculateRelationshipStage(newCount);
        if (newStage !== preference.relationshipStage) {
          updates.relationshipStage = newStage;
          logger.info('User relationship stage progressed', {
            userId,
            from: preference.relationshipStage,
            to: newStage,
            conversations: newCount,
          });
        }

        await preference.update(updates);
        this.cache.delete(userId);
      } else {
        await UserPersonaPreference.create({
          userId,
          totalConversations: 1,
          firstInteractionAt: new Date(),
        });
      }
    } catch (error) {
      logger.warn('Failed to record conversation for persona', { userId, error });
    }
  }

  /**
   * Calculate relationship stage based on conversation count
   */
  private calculateRelationshipStage(conversationCount: number): 'new' | 'familiar' | 'trusted' | 'partner' {
    if (conversationCount >= RELATIONSHIP_THRESHOLDS.partner) {
      return 'partner';
    } else if (conversationCount >= RELATIONSHIP_THRESHOLDS.trusted) {
      return 'trusted';
    } else if (conversationCount >= RELATIONSHIP_THRESHOLDS.familiar) {
      return 'familiar';
    }
    return 'new';
  }

  /**
   * Get detected style for a user (if available)
   */
  async getDetectedStyle(userId: string): Promise<DetectedStyle | null> {
    try {
      const preference = await UserPersonaPreference.findOne({ where: { userId } });
      return preference?.detectedStyle || null;
    } catch (error) {
      logger.warn('Failed to get detected style', { userId, error });
      return null;
    }
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  clearCache(userId?: string): void {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }
}

// Export singleton instance
export const personaService = new PersonaService();
export default personaService;
