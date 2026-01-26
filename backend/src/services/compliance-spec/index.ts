/**
 * Compliance Spec Module
 *
 * Database-driven compliance specifications with:
 * - Command registry pattern for operations
 * - Redis caching with memory fallback
 * - Webhook notifications for changes
 * - AI-friendly natural language interface
 */

export { commandRegistry, CommandHandler, CommandContext, CommandResult } from './CommandRegistry';
export { complianceSpecCache } from './SpecCache';
export { complianceSpecWebhooks, WebhookEventType } from './WebhookNotifier';
