/**
 * Voice Calling Module
 *
 * Self-contained module for AI-powered voice calling with Twilio and OpenAI Realtime.
 */

// Export types
export * from './types';

// Export routes
export { default as twilioRoutes } from './routes.twilio';
export { default as callRoutes } from './routes.calls';

// Export services
export { handleTwilioConnection, getActiveSessionCount, closeAllSessions } from './ws.bridge';
export { executeToolCall, getToolDefinitions, loadContactContext, loadDealContext } from './tools';
export { runPostCallAnalysis, analyzeCall, analyzeUnprocessedCalls } from './analysis';
export { getAgentPromptConfig, getInitialGreeting, buildContextPrompt } from './prompts';
