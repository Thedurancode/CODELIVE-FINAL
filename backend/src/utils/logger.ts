/**
 * Logger Utility
 *
 * Simple structured logger that wraps console methods with optional context.
 * Provides a consistent logging interface across the application.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface Logger {
  debug: (context: LogContext | string, message?: string) => void;
  info: (context: LogContext | string, message?: string) => void;
  warn: (context: LogContext | string, message?: string) => void;
  error: (context: LogContext | string, message?: string) => void;
}

function formatLog(level: LogLevel, context: LogContext | string, message?: string): string {
  const timestamp = new Date().toISOString();

  if (typeof context === 'string') {
    return `[${timestamp}] ${level.toUpperCase()}: ${context}`;
  }

  const contextStr = Object.entries(context)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');

  return `[${timestamp}] ${level.toUpperCase()}: ${message || ''} ${contextStr}`.trim();
}

export const logger: Logger = {
  debug: (context: LogContext | string, message?: string) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('debug', context, message));
    }
  },

  info: (context: LogContext | string, message?: string) => {
    console.info(formatLog('info', context, message));
  },

  warn: (context: LogContext | string, message?: string) => {
    console.warn(formatLog('warn', context, message));
  },

  error: (context: LogContext | string, message?: string) => {
    console.error(formatLog('error', context, message));
  },
};

export default logger;
