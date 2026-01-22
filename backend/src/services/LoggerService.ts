/**
 * Structured Logging Service
 *
 * Replaces scattered console.log statements with structured, leveled logging.
 * Supports JSON output for production, pretty printing for development.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

interface LogContext {
  requestId?: string;
  userId?: string;
  service?: string;
  operation?: string;
  duration?: number;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class LoggerService {
  private level: LogLevel;
  private service: string;
  private isProduction: boolean;

  constructor(service: string = 'dispotree') {
    this.service = service;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.level = this.parseLogLevel(process.env.LOG_LEVEL || 'info');
  }

  private parseLogLevel(level: string): LogLevel {
    const levels: Record<string, LogLevel> = {
      debug: LogLevel.DEBUG,
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
      fatal: LogLevel.FATAL,
    };
    return levels[level.toLowerCase()] ?? LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatError(error: unknown): LogEntry['error'] | undefined {
    if (!error) return undefined;
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: this.isProduction ? undefined : error.stack,
      };
    }
    return { name: 'UnknownError', message: String(error) };
  }

  private log(level: LogLevel, levelName: string, message: string, context?: LogContext, error?: unknown): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: levelName,
      message,
      context: {
        service: this.service,
        ...context,
      },
      error: this.formatError(error),
    };

    // Remove undefined fields
    if (!entry.error) delete entry.error;
    if (!entry.context || Object.keys(entry.context).length === 1) {
      entry.context = undefined;
    }

    if (this.isProduction) {
      // JSON output for production (machine readable)
      console.log(JSON.stringify(entry));
    } else {
      // Pretty output for development
      const emoji = this.getEmoji(level);
      const coloredLevel = this.colorLevel(levelName, level);
      const contextStr = context ? ` ${JSON.stringify(context)}` : '';

      if (error) {
        console.log(`${emoji} [${entry.timestamp}] ${coloredLevel}: ${message}${contextStr}`);
        console.error(this.formatError(error));
      } else {
        console.log(`${emoji} [${entry.timestamp}] ${coloredLevel}: ${message}${contextStr}`);
      }
    }
  }

  private getEmoji(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '🔍';
      case LogLevel.INFO: return '📋';
      case LogLevel.WARN: return '⚠️';
      case LogLevel.ERROR: return '❌';
      case LogLevel.FATAL: return '💀';
      default: return '📝';
    }
  }

  private colorLevel(level: string, logLevel: LogLevel): string {
    // ANSI color codes for terminal
    const colors: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: '\x1b[36m',   // Cyan
      [LogLevel.INFO]: '\x1b[32m',    // Green
      [LogLevel.WARN]: '\x1b[33m',    // Yellow
      [LogLevel.ERROR]: '\x1b[31m',   // Red
      [LogLevel.FATAL]: '\x1b[35m',   // Magenta
    };
    const reset = '\x1b[0m';
    return `${colors[logLevel] || ''}${level}${reset}`;
  }

  // Public logging methods
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, 'INFO', message, context);
  }

  warn(message: string, context?: LogContext, error?: unknown): void {
    this.log(LogLevel.WARN, 'WARN', message, context, error);
  }

  error(message: string, context?: LogContext, error?: unknown): void {
    this.log(LogLevel.ERROR, 'ERROR', message, context, error);
  }

  fatal(message: string, context?: LogContext, error?: unknown): void {
    this.log(LogLevel.FATAL, 'FATAL', message, context, error);
  }

  // Convenience method for timing operations
  time(operation: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug(`${operation} completed`, { operation, duration });
    };
  }

  // Create a child logger with preset context
  child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }
}

class ChildLogger {
  constructor(private parent: LoggerService, private context: LogContext) {}

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, { ...this.context, ...context });
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, { ...this.context, ...context });
  }

  warn(message: string, context?: LogContext, error?: unknown): void {
    this.parent.warn(message, { ...this.context, ...context }, error);
  }

  error(message: string, context?: LogContext, error?: unknown): void {
    this.parent.error(message, { ...this.context, ...context }, error);
  }

  fatal(message: string, context?: LogContext, error?: unknown): void {
    this.parent.fatal(message, { ...this.context, ...context }, error);
  }

  time(operation: string): () => void {
    return this.parent.time(operation);
  }
}

// Export singleton instance
export const logger = new LoggerService();

// Export class for testing or custom instances
export { LoggerService, ChildLogger, LogContext };
