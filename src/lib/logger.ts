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
  private startTime: number = Date.now();

  constructor() {
    // Standard environment-based configuration
    const envLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    this.level = LogLevel[envLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
    this.enableJson = process.env.LOG_FORMAT === 'json';

    // Setup global error handlers
    this.setupGlobalErrorHandlers();
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

  // Setup global error handlers to catch unhandled errors
  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      this.error('Unhandled Promise Rejection', {
        reason: this.sanitizeError(String(reason)),
        stack: reason?.stack ? this.sanitizeError(reason.stack) : undefined,
        pid: process.pid,
        uptime: Date.now() - this.startTime,
        timestamp: new Date().toISOString()
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.error('Uncaught Exception', {
        message: this.sanitizeError(error.message),
        stack: this.sanitizeError(error.stack || ''),
        name: error.name,
        pid: process.pid,
        uptime: Date.now() - this.startTime,
        timestamp: new Date().toISOString()
      });
      
      // Exit after logging the error
      setTimeout(() => process.exit(1), 100);
    });

    // Handle warnings (useful for debugging deprecations and other issues)
    process.on('warning', (warning: Error) => {
      this.warn('Process Warning', {
        message: warning.message,
        name: warning.name,
        stack: warning.stack ? this.sanitizeError(warning.stack) : undefined,
        pid: process.pid,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Enhanced tool execution logging with timing
  logToolStart(tool: string, query: string, clientInfo?: Record<string, any>): { startTime: number; requestId: string } {
    const startTime = Date.now();
    const requestId = `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.info('Tool execution started', {
      tool,
      query: this.sanitizeQuery(query),
      client: clientInfo,
      requestId,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: Date.now() - this.startTime
    });
    
    return { startTime, requestId };
  }

  logToolSuccess(tool: string, requestId: string, startTime: number, resultCount?: number, additionalInfo?: Record<string, any>): void {
    const duration = Date.now() - startTime;
    
    this.info('Tool execution completed', {
      tool,
      requestId,
      duration,
      resultCount,
      ...additionalInfo,
      timestamp: new Date().toISOString(),
      pid: process.pid
    });
  }

  logToolError(tool: string, requestId: string, startTime: number, error: any, fallback?: boolean): void {
    const duration = Date.now() - startTime;
    
    this.error('Tool execution failed', {
      tool,
      requestId,
      duration,
      error: this.sanitizeError(String(error)),
      stack: error?.stack ? this.sanitizeError(error.stack) : undefined,
      errorName: error?.name,
      fallback: fallback || false,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: Date.now() - this.startTime
    });
  }

  // Enhanced request logging with more context
  logRequest(tool: string, query: string, clientInfo?: Record<string, any>): void {
    this.info('Tool request received', {
      tool,
      query: this.sanitizeQuery(query),
      client: {
        ...clientInfo,
        userAgent: clientInfo?.headers?.['user-agent'],
        contentType: clientInfo?.headers?.['content-type']
      },
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: Date.now() - this.startTime
    });
  }

  // Log transport/connection issues
  logTransportEvent(event: string, sessionId?: string, details?: Record<string, any>): void {
    this.info('Transport event', {
      event,
      sessionId,
      details,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: Date.now() - this.startTime
    });
  }

  // Log memory and performance metrics
  logPerformanceMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.debug('Performance metrics', {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      pid: process.pid,
      timestamp: new Date().toISOString()
    });
  }
}

// Export singleton logger instance
export const logger = new Logger();