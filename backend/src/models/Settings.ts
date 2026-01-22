/**
 * Settings Model
 *
 * Global key-value settings store for app-wide configuration.
 * Allows managing features like auto-enrichment, scoring, notifications, etc.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type SettingType = 'boolean' | 'number' | 'string' | 'json';
export type SettingCategory = 'enrichment' | 'scoring' | 'notifications' | 'marketplace' | 'api' | 'general' | 'voice' | 'mcp';

interface SettingsAttributes {
  key: string;
  value: any;
  type: SettingType;
  category: SettingCategory;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SettingsCreationAttributes
  extends Optional<SettingsAttributes, 'createdAt' | 'updatedAt'> {}

class Settings
  extends Model<SettingsAttributes, SettingsCreationAttributes>
  implements SettingsAttributes
{
  declare key: string;
  declare value: any;
  declare type: SettingType;
  declare category: SettingCategory;
  declare description: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Get the typed value
   */
  getTypedValue(): boolean | number | string | object {
    switch (this.type) {
      case 'boolean':
        return this.value === true || this.value === 'true';
      case 'number':
        return Number(this.value);
      case 'json':
        return typeof this.value === 'string' ? JSON.parse(this.value) : this.value;
      default:
        return String(this.value);
    }
  }
}

Settings.init(
  {
    key: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('boolean', 'number', 'string', 'json'),
      allowNull: false,
      defaultValue: 'string',
    },
    category: {
      type: DataTypes.ENUM('enrichment', 'scoring', 'notifications', 'marketplace', 'api', 'general', 'voice', 'mcp'),
      allowNull: false,
      defaultValue: 'general',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'settings',
    timestamps: true,
    indexes: [
      { fields: ['category'] },
    ],
  }
);

// Default settings configuration
export const DEFAULT_SETTINGS: Omit<SettingsCreationAttributes, 'createdAt' | 'updatedAt'>[] = [
  // Enrichment settings
  {
    key: 'enrichment.enabled',
    value: true,
    type: 'boolean',
    category: 'enrichment',
    description: 'Automatically enrich properties with market data on creation',
  },
  {
    key: 'enrichment.skipTrace',
    value: true,
    type: 'boolean',
    category: 'enrichment',
    description: 'Include owner skip trace data when enriching properties',
  },
  {
    key: 'enrichment.comparables',
    value: true,
    type: 'boolean',
    category: 'enrichment',
    description: 'Fetch comparable properties when enriching',
  },
  // Scoring settings
  {
    key: 'scoring.enabled',
    value: true,
    type: 'boolean',
    category: 'scoring',
    description: 'Automatically score properties against buy boxes on creation',
  },
  {
    key: 'scoring.autoSubmitEnabled',
    value: false,
    type: 'boolean',
    category: 'scoring',
    description: 'Automatically submit deals to matching buy boxes when score threshold is met',
  },
  {
    key: 'scoring.autoSubmitThreshold',
    value: 80,
    type: 'number',
    category: 'scoring',
    description: 'Minimum score percentage required for auto-submission (0-100)',
  },
  // Notification settings
  {
    key: 'notifications.email',
    value: false,
    type: 'boolean',
    category: 'notifications',
    description: 'Enable email notifications for important events',
  },
  {
    key: 'notifications.webhook',
    value: true,
    type: 'boolean',
    category: 'notifications',
    description: 'Enable webhook notifications for automations',
  },
  {
    key: 'notifications.webhookUrl',
    value: '',
    type: 'string',
    category: 'notifications',
    description: 'Default webhook URL for notifications',
  },
  {
    key: 'notifications.sound',
    value: { enabled: true, volume: 50 },
    type: 'json',
    category: 'notifications',
    description: 'Chat notification sound settings (enabled, volume 0-100)',
  },
  // Marketplace settings
  {
    key: 'marketplace.autoList',
    value: false,
    type: 'boolean',
    category: 'marketplace',
    description: 'Automatically list high-scoring deals to the marketplace',
  },
  {
    key: 'marketplace.autoListThreshold',
    value: 85,
    type: 'number',
    category: 'marketplace',
    description: 'Minimum score for automatic marketplace listing (0-100)',
  },
  // API settings
  {
    key: 'api.rateLimitPerMinute',
    value: 100,
    type: 'number',
    category: 'api',
    description: 'Maximum API requests per minute',
  },
  {
    key: 'api.enrichmentCacheTTL',
    value: 86400,
    type: 'number',
    category: 'api',
    description: 'Cache TTL for market data enrichment in seconds (default: 24 hours)',
  },
  // Voice settings
  {
    key: 'voice.defaultAgentProfile',
    value: 'sales',
    type: 'string',
    category: 'voice',
    description: 'Default AI agent profile for voice calls (sales, support, collections)',
  },
  {
    key: 'voice.autoScheduleFollowUp',
    value: true,
    type: 'boolean',
    category: 'voice',
    description: 'Automatically offer to schedule follow-up after calls',
  },
  {
    key: 'voice.recordCalls',
    value: true,
    type: 'boolean',
    category: 'voice',
    description: 'Record all outbound voice calls',
  },
  {
    key: 'voice.defaultCallDuration',
    value: 15,
    type: 'number',
    category: 'voice',
    description: 'Default calendar event duration for scheduled calls (minutes)',
  },
  // MCP (Model Context Protocol) settings
  {
    key: 'mcp.enabled',
    value: true,
    type: 'boolean',
    category: 'mcp',
    description: 'Enable MCP server connections for external tool integration',
  },
  {
    key: 'mcp.servers',
    value: [],
    type: 'json',
    category: 'mcp',
    description: 'MCP server configurations with connection details',
  },
];

export default Settings;
export { SettingsAttributes, SettingsCreationAttributes };
