/**
 * Voice Context Loader
 *
 * Proactively loads user context before voice interactions.
 * This makes the AI agent "aware" of the user's current state
 * without requiring multiple back-and-forth questions.
 */

import { Op } from 'sequelize';
import { Property, Contact, DealPipeline, UserBuyBox, Reminder, Task } from '../models';
import { memoryService } from './MemoryService';
import { logger } from './LoggerService';

const log = logger.child({ service: 'voice-context' });

export interface VoiceContext {
  // Pipeline summary
  pipeline: {
    total: number;
    byStage: Record<string, number>;
    recentDeals: Array<{
      id: number;
      address: string;
      city: string;
      state: string;
      stage: string;
      price?: number;
    }>;
  };

  // Recent activity
  recentProperties: Array<{
    id: number;
    address: string;
    city: string;
    state: string;
    price?: number;
    status?: string;
    updatedAt: Date;
  }>;

  // Tasks and reminders due
  dueTasks: Array<{
    id: string;
    title: string;
    dueDate?: Date;
    priority: string;
  }>;

  dueReminders: Array<{
    id: string;
    title: string;
    reminderTime: Date;
  }>;

  // User preferences (from memory)
  preferences: {
    markets?: string[];
    strategy?: string;
    priceRange?: { min?: number; max?: number };
    propertyTypes?: string[];
    other: string[];
  };

  // Buy box matches (new opportunities)
  newMatches: Array<{
    propertyId: number;
    address: string;
    buyBoxName: string;
    matchScore: number;
  }>;

  // Recent contacts
  recentContacts: Array<{
    id: string;
    name: string;
    type?: string;
    lastActivity?: Date;
  }>;

  // Summary for prompt injection
  summary: string;
}

class VoiceContextLoader {
  /**
   * Load full context for a user
   */
  async loadContext(userId: string, organizationId?: string): Promise<VoiceContext> {
    const startTime = Date.now();

    try {
      // Fetch all data in parallel for speed
      const [
        pipelineData,
        recentProperties,
        dueTasks,
        dueReminders,
        preferences,
        recentContacts,
      ] = await Promise.all([
        this.loadPipeline(userId, organizationId),
        this.loadRecentProperties(userId, organizationId),
        this.loadDueTasks(userId),
        this.loadDueReminders(userId),
        this.loadPreferences(userId),
        this.loadRecentContacts(organizationId),
      ]);

      const context: VoiceContext = {
        pipeline: pipelineData,
        recentProperties,
        dueTasks,
        dueReminders,
        preferences,
        newMatches: [], // TODO: Implement buy box match detection
        recentContacts,
        summary: '', // Will be generated below
      };

      // Generate human-readable summary
      context.summary = this.generateSummary(context);

      log.info('Voice context loaded', {
        userId,
        duration: Date.now() - startTime,
        pipelineCount: context.pipeline.total,
        tasksDue: context.dueTasks.length,
        remindersDue: context.dueReminders.length,
      });

      return context;
    } catch (error) {
      log.error('Failed to load voice context', { userId }, error);
      // Return empty context on error - don't break the voice session
      return this.getEmptyContext();
    }
  }

  /**
   * Load pipeline summary
   */
  private async loadPipeline(
    userId: string,
    organizationId?: string
  ): Promise<VoiceContext['pipeline']> {
    try {
      const where: any = {};
      if (organizationId) {
        where.organizationId = organizationId;
      }

      const pipeline = await DealPipeline.findAll({
        where,
        include: [
          {
            model: Property,
            as: 'property',
            attributes: ['id', 'address', 'city', 'state', 'askingPrice'],
          },
        ],
        order: [['updatedAt', 'DESC']],
        limit: 50,
      });

      // Count by stage
      const byStage: Record<string, number> = {};
      for (const deal of pipeline) {
        byStage[deal.stage] = (byStage[deal.stage] || 0) + 1;
      }

      // Get recent deals (last 5 updated)
      const recentDeals = pipeline.slice(0, 5).map((deal: any) => ({
        id: deal.property?.id || deal.propertyId,
        address: deal.property?.address || 'Unknown',
        city: deal.property?.city || '',
        state: deal.property?.state || '',
        stage: deal.stage,
        price: deal.property?.askingPrice,
      }));

      return {
        total: pipeline.length,
        byStage,
        recentDeals,
      };
    } catch (error) {
      log.warn('Failed to load pipeline', { userId }, error);
      return { total: 0, byStage: {}, recentDeals: [] };
    }
  }

  /**
   * Load recently worked on properties
   */
  private async loadRecentProperties(
    userId: string,
    organizationId?: string
  ): Promise<VoiceContext['recentProperties']> {
    try {
      const where: any = {};
      if (organizationId) {
        where.organizationId = organizationId;
      }

      const properties = await Property.findAll({
        where,
        order: [['updatedAt', 'DESC']],
        limit: 5,
        attributes: ['id', 'address', 'city', 'state', 'askingPrice', 'status', 'updatedAt'],
      });

      return properties.map((p) => ({
        id: p.id,
        address: typeof p.address === 'object'
          ? `${(p.address as any).houseNumber || ''} ${(p.address as any).street || ''}`.trim()
          : String(p.address || ''),
        city: p.city || '',
        state: p.state || '',
        price: p.reservePrice,
        status: p.status,
        updatedAt: p.updatedAt,
      }));
    } catch (error) {
      log.warn('Failed to load recent properties', { userId }, error);
      return [];
    }
  }

  /**
   * Load tasks due today or overdue
   */
  private async loadDueTasks(userId: string): Promise<VoiceContext['dueTasks']> {
    try {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const tasks = await Task.findAll({
        where: {
          assignedTo: userId,
          status: { [Op.notIn]: ['completed', 'cancelled'] },
          [Op.or]: [
            { dueDate: { [Op.lte]: endOfToday } },
            { dueDate: null }, // Include tasks without due date
          ],
        },
        order: [['dueDate', 'ASC']],
        limit: 5,
      });

      return tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate || undefined,
        priority: t.priority || 'normal',
      }));
    } catch (error) {
      log.warn('Failed to load due tasks', { userId }, error);
      return [];
    }
  }

  /**
   * Load reminders due soon
   */
  private async loadDueReminders(userId: string): Promise<VoiceContext['dueReminders']> {
    try {
      const next24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const reminders = await Reminder.findAll({
        where: {
          userId,
          status: 'pending',
          reminderTime: { [Op.lte]: next24Hours },
        },
        order: [['reminderTime', 'ASC']],
        limit: 5,
      });

      return reminders.map((r) => ({
        id: r.id,
        title: r.title,
        reminderTime: r.reminderTime,
      }));
    } catch (error) {
      log.warn('Failed to load due reminders', { userId }, error);
      return [];
    }
  }

  /**
   * Load user preferences from memory service
   */
  private async loadPreferences(userId: string): Promise<VoiceContext['preferences']> {
    const preferences: VoiceContext['preferences'] = {
      other: [],
    };

    try {
      // Try to search for preferences from memory service
      if (memoryService.isReady()) {
        const memories = await memoryService.searchMemories(userId, 'user preferences investment strategy', { topK: 10 });

        for (const memory of memories) {
          const content = memory.content.toLowerCase();

          // Extract market preferences
          if (content.includes('market') || content.includes('state') || content.includes('location')) {
            const states = content.match(/\b(GA|FL|TX|NC|SC|TN|AL|OH|IN|AZ|NV)\b/gi);
            if (states) {
              preferences.markets = [...new Set(states.map((s: string) => s.toUpperCase()))];
            }
          }

          // Extract strategy preferences
          if (content.includes('fix and flip') || content.includes('flip')) {
            preferences.strategy = 'Fix & Flip';
          } else if (content.includes('buy and hold') || content.includes('rental')) {
            preferences.strategy = 'Buy & Hold';
          } else if (content.includes('wholesale')) {
            preferences.strategy = 'Wholesale';
          }

          // Extract price range
          const priceMatch = content.match(/\$?([\d,]+)k?\s*[-–to]+\s*\$?([\d,]+)k?/i);
          if (priceMatch) {
            const min = parseInt(priceMatch[1].replace(/,/g, '')) * (priceMatch[1].includes('k') ? 1000 : 1);
            const max = parseInt(priceMatch[2].replace(/,/g, '')) * (priceMatch[2].includes('k') ? 1000 : 1);
            preferences.priceRange = { min, max };
          }

          // Store other preferences
          if (!preferences.markets && !preferences.strategy && !preferences.priceRange) {
            preferences.other.push(memory.content);
          }
        }
      }
    } catch (error) {
      log.warn('Failed to load preferences', { userId }, error);
    }

    return preferences;
  }

  /**
   * Load recent contacts
   */
  private async loadRecentContacts(
    organizationId?: string
  ): Promise<VoiceContext['recentContacts']> {
    try {
      const where: any = { status: 'active' };
      if (organizationId) {
        where.organizationId = organizationId;
      }

      const contacts = await Contact.findAll({
        where,
        order: [['updatedAt', 'DESC']],
        limit: 5,
        attributes: ['id', 'name', 'type', 'updatedAt'],
      });

      return contacts.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        lastActivity: c.updatedAt,
      }));
    } catch (error) {
      log.warn('Failed to load recent contacts', {}, error);
      return [];
    }
  }

  /**
   * Generate a human-readable summary for the system prompt
   */
  private generateSummary(context: VoiceContext): string {
    const parts: string[] = [];

    // Pipeline summary
    if (context.pipeline.total > 0) {
      const stageList = Object.entries(context.pipeline.byStage)
        .map(([stage, count]) => `${count} ${stage}`)
        .join(', ');
      parts.push(`Pipeline: ${context.pipeline.total} deals (${stageList})`);
    }

    // Recent properties
    if (context.recentProperties.length > 0) {
      const recent = context.recentProperties[0];
      parts.push(`Last worked on: ${recent.address}, ${recent.city} ${recent.state}`);
    }

    // Due tasks
    if (context.dueTasks.length > 0) {
      const urgent = context.dueTasks.filter((t) => t.priority === 'urgent' || t.priority === 'high');
      if (urgent.length > 0) {
        parts.push(`Urgent tasks: ${urgent.map((t) => t.title).join(', ')}`);
      } else {
        parts.push(`Tasks due: ${context.dueTasks.length} (${context.dueTasks[0].title})`);
      }
    }

    // Due reminders
    if (context.dueReminders.length > 0) {
      const nextReminder = context.dueReminders[0];
      const timeUntil = this.formatTimeUntil(nextReminder.reminderTime);
      parts.push(`Next reminder: "${nextReminder.title}" ${timeUntil}`);
    }

    // Preferences
    if (context.preferences.markets?.length) {
      parts.push(`Preferred markets: ${context.preferences.markets.join(', ')}`);
    }
    if (context.preferences.strategy) {
      parts.push(`Strategy: ${context.preferences.strategy}`);
    }

    return parts.join('\n');
  }

  /**
   * Format time until a date in human-readable form
   */
  private formatTimeUntil(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 0) return 'overdue';
    if (diffMins < 60) return `in ${diffMins} minutes`;
    if (diffHours < 24) return `in ${diffHours} hours`;
    return `on ${date.toLocaleDateString()}`;
  }

  /**
   * Get empty context (used on error)
   */
  private getEmptyContext(): VoiceContext {
    return {
      pipeline: { total: 0, byStage: {}, recentDeals: [] },
      recentProperties: [],
      dueTasks: [],
      dueReminders: [],
      preferences: { other: [] },
      newMatches: [],
      recentContacts: [],
      summary: '',
    };
  }
}

export const voiceContextLoader = new VoiceContextLoader();
export default voiceContextLoader;
