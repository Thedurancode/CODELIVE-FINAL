/**
 * Voice Tools
 *
 * Tools for managing voice call settings and configurations.
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import Settings from '../../../models/Settings';

/**
 * Get the default agent profile from settings
 */
export async function getDefaultAgentProfile(): Promise<'sales' | 'support' | 'collections'> {
  const setting = await Settings.findOne({
    where: { key: 'voice.defaultAgentProfile' },
  });
  const value = setting?.value || 'sales';
  if (['sales', 'support', 'collections'].includes(value)) {
    return value as 'sales' | 'support' | 'collections';
  }
  return 'sales';
}

/**
 * Get voice settings
 */
export async function getVoiceSettings(): Promise<{
  defaultAgentProfile: string;
  autoScheduleFollowUp: boolean;
  recordCalls: boolean;
  defaultCallDuration: number;
}> {
  const settings = await Settings.findAll({
    where: { category: 'voice' },
  });

  const result: Record<string, any> = {
    defaultAgentProfile: 'sales',
    autoScheduleFollowUp: true,
    recordCalls: true,
    defaultCallDuration: 15,
  };

  for (const setting of settings) {
    const key = setting.key.replace('voice.', '');
    result[key] = setting.getTypedValue();
  }

  return result as any;
}

/**
 * Register all voice tools with the registry
 */
export function registerVoiceTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // GET VOICE SETTINGS
    // =========================================================================
    defineTool({
      name: 'get_voice_settings',
      description: `Get current voice call settings including:
- Default agent profile (sales, support, collections)
- Auto schedule follow-up preference
- Call recording preference
- Default call duration for calendar events`,
      category: 'voice',
      schema: z.object({}),
      handler: async () => {
        try {
          const settings = await getVoiceSettings();

          return success({
            ...settings,
            profiles: ['sales', 'support', 'collections'],
            message: `Current default profile: ${settings.defaultAgentProfile}`,
          });
        } catch (error) {
          return failure(`Error getting voice settings: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 5 * 60, // 5 minutes
    }),

    // =========================================================================
    // SET DEFAULT AGENT PROFILE
    // =========================================================================
    defineTool({
      name: 'set_default_agent_profile',
      description: `Set the default AI agent profile for voice calls. Available profiles:
- sales: Qualify leads, understand needs, schedule follow-ups
- support: Resolve issues, create tickets, ensure satisfaction
- collections: Discuss outstanding matters professionally`,
      category: 'voice',
      schema: z.object({
        profile: z
          .enum(['sales', 'support', 'collections'])
          .describe('The agent profile to use as default'),
      }),
      handler: async (input) => {
        try {
          const [setting, created] = await Settings.findOrCreate({
            where: { key: 'voice.defaultAgentProfile' },
            defaults: {
              key: 'voice.defaultAgentProfile',
              value: input.profile,
              type: 'string',
              category: 'voice',
              description: 'Default AI agent profile for voice calls (sales, support, collections)',
            },
          });

          if (!created) {
            await setting.update({ value: input.profile });
          }

          return success({
            profile: input.profile,
            previousProfile: created ? null : setting.value,
            message: `Default agent profile set to "${input.profile}". All future calls will use this profile unless overridden.`,
          });
        } catch (error) {
          return failure(`Error setting default profile: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // UPDATE VOICE SETTING
    // =========================================================================
    defineTool({
      name: 'update_voice_setting',
      description: `Update a voice call setting. Available settings:
- autoScheduleFollowUp: Offer to schedule follow-up after calls (true/false)
- recordCalls: Record all outbound calls (true/false)
- defaultCallDuration: Default calendar event duration in minutes`,
      category: 'voice',
      schema: z.object({
        setting: z
          .enum(['autoScheduleFollowUp', 'recordCalls', 'defaultCallDuration'])
          .describe('Setting to update'),
        value: z.union([z.boolean(), z.number()]).describe('New value for the setting'),
      }),
      handler: async (input) => {
        try {
          const key = `voice.${input.setting}`;
          const type = typeof input.value === 'boolean' ? 'boolean' : 'number';

          const descriptions: Record<string, string> = {
            autoScheduleFollowUp: 'Automatically offer to schedule follow-up after calls',
            recordCalls: 'Record all outbound voice calls',
            defaultCallDuration: 'Default calendar event duration for scheduled calls (minutes)',
          };

          const [setting, created] = await Settings.findOrCreate({
            where: { key },
            defaults: {
              key,
              value: input.value,
              type,
              category: 'voice',
              description: descriptions[input.setting],
            },
          });

          if (!created) {
            await setting.update({ value: input.value });
          }

          return success({
            setting: input.setting,
            value: input.value,
            message: `Voice setting "${input.setting}" updated to ${input.value}.`,
          });
        } catch (error) {
          return failure(`Error updating voice setting: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET AGENT PROFILE DETAILS
    // =========================================================================
    defineTool({
      name: 'get_agent_profile_details',
      description: 'Get detailed information about an AI agent profile, including its behavior and approach.',
      category: 'voice',
      schema: z.object({
        profile: z
          .enum(['sales', 'support', 'collections'])
          .describe('Profile to get details for'),
      }),
      handler: async (input) => {
        const profiles = {
          sales: {
            name: 'Sales Representative',
            goals: [
              'Qualify the lead\'s interest level',
              'Understand their needs and timeline',
              'Schedule a follow-up if interested',
              'Gather budget or financing information',
            ],
            approach: 'Friendly and consultative, not pushy. Asks open-ended questions to understand their situation.',
            bestFor: 'Outreach to potential sellers, buyer qualification, property inquiries',
          },
          support: {
            name: 'Customer Support',
            goals: [
              'Understand the customer\'s concern completely',
              'Resolve their issue if possible',
              'Create a ticket/note if escalation needed',
              'Ensure customer satisfaction',
            ],
            approach: 'Patient and empathetic. Lets them fully explain before responding. Confirms understanding.',
            bestFor: 'Issue resolution, answering questions, deal status updates',
          },
          collections: {
            name: 'Collections Representative',
            goals: [
              'Discuss the situation professionally',
              'Understand any challenges they\'re facing',
              'Work toward resolution or payment arrangement',
              'Document the conversation accurately',
            ],
            approach: 'Firm but fair. Never threatening or aggressive. Respects their rights.',
            bestFor: 'Outstanding payments, contract obligations, deposit discussions',
          },
        };

        const details = profiles[input.profile];

        return success({
          profile: input.profile,
          ...details,
        });
      },
      cacheable: true,
      cacheTTL: 60 * 60, // 1 hour
    }),
  ]);
}

export default registerVoiceTools;
