/**
 * Structured logging implementation
 * Provides hierarchical logging with context and formatting
 */

import type { Logger } from "./types.js";

/**
 * Log level enumeration
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context: Record<string, any>;
  error?: Error;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStructured: boolean;
  contextData?: Record<string, any>;
}

/**
 * Console logger implementation
 */
export class ConsoleLogger implements Logger {
  private context: Record<string, any> = {};

  constructor(private config: LoggerConfig = {
    level: LogLevel.INFO,
    enableConsole: true,
    enableStructured: false
  }) {
    this.context = { ...config.contextData };
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, undefined, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, undefined, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, undefined, ...args);
  }

  error(message: string, error?: Error, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, error, ...args);
  }

  child(context: Record<string, any>): Logger {
    return new ConsoleLogger({
      ...this.config,
      contextData: { ...this.context, ...context }
    });
  }

  private log(level: LogLevel, message: string, error?: Error, ...args: any[]): void {
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context: { ...this.context },
      error
    };

    // Add args to context
    if (args.length > 0) {
      entry.context.args = args;
    }

    if (this.config.enableConsole) {
      this.writeToConsole(entry);
    }
  }

  private writeToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const timestamp = entry.timestamp.toISOString();
    
    if (this.config.enableStructured) {
      // Structured JSON output
      const structured: any = {
        timestamp,
        level: levelName,
        message: entry.message,
        ...entry.context
      };
      
      if (entry.error) {
        structured.error = {
          message: entry.error.message,
          stack: entry.error.stack
        };
      }
      
      console.log(JSON.stringify(structured));
    } else {
      // Human-readable output
      const contextStr = Object.keys(entry.context).length > 0 
        ? ` ${JSON.stringify(entry.context)}`
        : '';
      
      const logMessage = `[${timestamp}] ${levelName}: ${entry.message}${contextStr}`;
      
      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(logMessage);
          break;
        case LogLevel.INFO:
          console.info(logMessage);
          break;
        case LogLevel.WARN:
          console.warn(logMessage);
          if (entry.error) console.warn(entry.error);
          break;
        case LogLevel.ERROR:
          console.error(logMessage);
          if (entry.error) console.error(entry.error);
          break;
      }
    }
  }
}

/**
 * No-op logger for testing or disabled logging
 */
export class NoOpLogger implements Logger {
  debug(_message: string, ..._args: any[]): void {
    // No-op
  }

  info(_message: string, ..._args: any[]): void {
    // No-op
  }

  warn(_message: string, ..._args: any[]): void {
    // No-op
  }

  error(_message: string, _error?: Error, ..._args: any[]): void {
    // No-op
  }

  child(_context: Record<string, any>): Logger {
    return new NoOpLogger();
  }
}

/**
 * Factory function to create logger instances
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  const fullConfig: LoggerConfig = {
    level: LogLevel.INFO,
    enableConsole: true,
    enableStructured: false,
    ...config
  };

  return new ConsoleLogger(fullConfig);
}

/**
 * Create a logger from environment variables
 */
export function createLoggerFromEnv(): Logger {
  const levelStr = process.env.LOG_LEVEL || 'INFO';
  const level = LogLevel[levelStr.toUpperCase() as keyof typeof LogLevel] || LogLevel.INFO;
  const enableStructured = process.env.LOG_STRUCTURED === 'true';
  
  return createLogger({
    level,
    enableStructured,
    enableConsole: true
  });
}