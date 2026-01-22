/**
 * Settings Tools
 *
 * Tools for managing system and user settings.
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import Settings from '../../../models/Settings';

/**
 * Register all settings tools with the registry
 */
export function registerSettingsTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // GET SETTINGS
    // =========================================================================
    defineTool({
      name: 'get_settings',
      description: 'Get current system or user settings.',
      category: 'settings',
      schema: z.object({
        category: z
          .string()
          .optional()
          .describe('Settings category to retrieve (notifications, automation, etc.)'),
      }),
      handler: async (input, context) => {
        try {
          const where: any = {};
          if (input.category) where.category = input.category;

          const settings = await Settings.findAll({ where });

          // Group by category
          const grouped: Record<string, any> = {};
          for (const s of settings) {
            const setting = s as any;
            if (!grouped[setting.category]) {
              grouped[setting.category] = {};
            }
            grouped[setting.category][setting.key] = {
              value: setting.value,
              description: setting.description,
              updatedAt: setting.updatedAt,
            };
          }

          return success({
            settings: grouped,
            categories: Object.keys(grouped),
            count: settings.length,
          });
        } catch (error) {
          return failure(`Error getting settings: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 30 * 60, // 30 minutes
    }),

    // =========================================================================
    // UPDATE SETTING
    // =========================================================================
    defineTool({
      name: 'update_setting',
      description: 'Update a system or user setting.',
      category: 'settings',
      schema: z.object({
        category: z.string().describe('Settings category'),
        key: z.string().describe('Setting key'),
        value: z.any().describe('New value'),
      }),
      handler: async (input, context) => {
        try {
          const [setting, created] = await Settings.findOrCreate({
            where: {
              category: input.category,
              key: input.key,
            },
            defaults: {
              category: input.category,
              key: input.key,
              value: input.value,
            } as any,
          });

          if (!created) {
            await setting.update({ value: input.value });
          }

          return success({
            category: input.category,
            key: input.key,
            value: input.value,
            created,
            message: created
              ? `Setting "${input.key}" created in category "${input.category}".`
              : `Setting "${input.key}" updated in category "${input.category}".`,
          });
        } catch (error) {
          return failure(`Error updating setting: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // RESET SETTING
    // =========================================================================
    defineTool({
      name: 'reset_setting',
      description: 'Reset a setting to its default value or delete it.',
      category: 'settings',
      schema: z.object({
        category: z.string().describe('Settings category'),
        key: z.string().describe('Setting key'),
        confirm: z.boolean().describe('Must be true to confirm reset'),
      }),
      handler: async (input, context) => {
        try {
          if (!input.confirm) {
            return failure('Reset not confirmed. Set confirm=true to reset the setting.');
          }

          const setting = await Settings.findOne({
            where: {
              category: input.category,
              key: input.key,
            },
          });

          if (!setting) {
            return failure(`Setting "${input.key}" not found in category "${input.category}".`);
          }

          await setting.destroy();

          return success({
            category: input.category,
            key: input.key,
            message: `Setting "${input.key}" has been reset/deleted.`,
          });
        } catch (error) {
          return failure(`Error resetting setting: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerSettingsTools;
