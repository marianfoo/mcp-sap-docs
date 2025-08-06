// src/lib/logger.ts
// Standard logging utility with configurable levels

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export class Logger {
  private level: LogLevel;
  private enableJson: boolean;

  constructor() {
    // Standard environment-based configuration
    const envLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    this.level = LogLevel[envLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
    this.enableJson = process.env.LOG_FORMAT === 'json';
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private formatMessage(level: string, message: string, meta?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    
    if (this.enableJson) {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...meta
      });
    } else {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level}] ${message}${metaStr}`;
    }
  }

  error(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      // Always use stderr for MCP stdio compatibility
      process.stderr.write(this.formatMessage('ERROR', message, meta) + '\n');
    }
  }

  warn(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      // Always use stderr for MCP stdio compatibility
      process.stderr.write(this.formatMessage('WARN', message, meta) + '\n');
    }
  }

  info(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      // Always use stderr for MCP stdio compatibility
      process.stderr.write(this.formatMessage('INFO', message, meta) + '\n');
    }
  }

  debug(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      // Always use stderr for MCP stdio compatibility
      process.stderr.write(this.formatMessage('DEBUG', message, meta) + '\n');
    }
  }

  // Log request analytics - where requests come from and what's being requested
  logRequest(tool: string, query: string, clientInfo?: Record<string, any>): void {
    this.info('Tool request received', {
      tool,
      query: this.sanitizeQuery(query),
      client: clientInfo,
      timestamp: new Date().toISOString()
    });
  }

  private sanitizeQuery(query: string): string {
    // Basic sanitization for logging
    return query
      .replace(/\b\d{4,}\b/g, '[NUM]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .substring(0, 200);
  }

  private sanitizeError(error: string): string {
    return error
      .replace(/\/[^\s]+/g, '[PATH]')
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')
      .substring(0, 300);
  }
}

// Export singleton logger instance
export const logger = new Logger();