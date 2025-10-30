import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  isInitializeRequest
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./lib/logger.js";
import { BaseServerHandler } from "./lib/BaseServerHandler.js";

// Version will be updated by deployment script
const VERSION = "0.3.20";


// Simple in-memory event store for resumability
class InMemoryEventStore {
  private events: Map<string, Array<{ eventId: string; message: any }>> = new Map();
  private eventCounter = 0;

  async storeEvent(streamId: string, message: any): Promise<string> {
    const eventId = `event-${this.eventCounter++}`;
    
    if (!this.events.has(streamId)) {
      this.events.set(streamId, []);
    }
    
    this.events.get(streamId)!.push({ eventId, message });
    
    // Keep only last 100 events per stream to prevent memory issues
    const streamEvents = this.events.get(streamId)!;
    if (streamEvents.length > 100) {
      streamEvents.splice(0, streamEvents.length - 100);
    }
    
    return eventId;
  }

  async replayEventsAfter(lastEventId: string, { send }: { send: (eventId: string, message: any) => Promise<void> }): Promise<string> {
    // Find the stream that contains this event ID
    for (const [streamId, events] of this.events.entries()) {
      const eventIndex = events.findIndex(e => e.eventId === lastEventId);
      if (eventIndex !== -1) {
        // Replay all events after the specified event ID
        for (let i = eventIndex + 1; i < events.length; i++) {
          const event = events[i];
          await send(event.eventId, event.message);
        }
        return streamId;
      }
    }
    
    // If event ID not found, return a new stream ID
    return `stream-${randomUUID()}`;
  }
}

function createServer() {
  const serverOptions: NonNullable<ConstructorParameters<typeof Server>[1]> & {
    protocolVersions?: string[];
  } = {
    protocolVersions: ["2025-07-09"],
    capabilities: {
      // resources: {},  // DISABLED: Causes 60,000+ resources which breaks Cursor
      tools: {}       // Enable tools capability
    }
  };

  const srv = new Server({
    name: "SAP Docs Streamable HTTP",
    description:
      "SAP documentation server with Streamable HTTP transport - supports SAPUI5, CAP, wdi5, SAP Community, SAP Help Portal, and ABAP Keyword Documentation integration",
    version: VERSION
  }, serverOptions);

  // Configure server with shared handlers
  BaseServerHandler.configureServer(srv);

  return srv;
}

async function main() {
  // Initialize search system with metadata
  BaseServerHandler.initializeMetadata();

  const MCP_PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3122;
  
  // Create Express application
  const app = express();
  app.use(express.json());
  
  // Configure CORS to expose Mcp-Session-Id header for browser-based clients
  app.use(cors({
    origin: '*', // Allow all origins - adjust as needed for production
    exposedHeaders: ['Mcp-Session-Id']
  }));

  // Store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  
  // Create event store for resumability
  const eventStore = new InMemoryEventStore();

  // Legacy SSE endpoint - redirect to MCP
  app.all('/sse', (req: Request, res: Response) => {
    const redirectInfo = {
      error: "SSE endpoint deprecated",
      message: "The /sse endpoint has been removed. Please use the modern /mcp endpoint instead.",
      migration: {
        old_endpoint: "/sse",
        new_endpoint: "/mcp",
        transport: "MCP Streamable HTTP", 
        protocol_version: "2025-07-09"
      },
      documentation: "https://github.com/marianfoo/mcp-sap-docs#connect-from-your-mcp-client",
      alternatives: {
        "Local MCP Streamable HTTP": "http://127.0.0.1:3122/mcp",
        "Public MCP Streamable HTTP": "https://mcp-sap-docs.marianzeis.de/mcp"
      }
    };
    
    res.status(410).json(redirectInfo);
  });

  // Handle all MCP Streamable HTTP requests (GET, POST, DELETE) on a single endpoint
  app.all('/mcp', async (req: Request, res: Response) => {
    const requestId = `http_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    logger.debug(`Received ${req.method} request to /mcp`, { 
      requestId,
      userAgent: req.headers['user-agent'],
      contentLength: req.headers['content-length'],
      sessionId: req.headers['mcp-session-id'] as string || 'none'
    });
    
    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string;
      let transport: StreamableHTTPServerTransport;
      
      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
        logger.logTransportEvent('transport_reused', sessionId, { 
          requestId, 
          method: req.method,
          transportCount: Object.keys(transports).length
        });
      } else if (!sessionId && req.method === 'POST' && req.is('application/json') && req.body?.method === 'initialize') {
        // New initialization request - create new transport
        const cleanupTransport = (
          sessionId: string | undefined,
          trigger: "onsessionclosed" | "onclose",
          context: Record<string, unknown> = {}
        ) => {
          if (!sessionId) {
            return;
          }

          const hadTransport = Boolean(transports[sessionId]);

          if (hadTransport) {
            delete transports[sessionId];
          }

          logger.logTransportEvent("session_closed", sessionId, {
            ...context,
            trigger,
            transportCount: Object.keys(transports).length,
            ...(hadTransport ? {} : { note: "session already cleaned up" })
          });
        };

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore, // Enable resumability
          onsessioninitialized: (sessionId: string) => {
            // Store the transport by session ID when session is initialized
            logger.logTransportEvent('session_initialized', sessionId, {
              requestId,
              transportCount: Object.keys(transports).length + 1
            });
            transports[sessionId] = transport;
          },
          onsessionclosed: (sessionId: string) => {
            cleanupTransport(sessionId, 'onsessionclosed');
          }
        });

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          cleanupTransport(transport.sessionId, 'onclose', { requestId });
        };
        
        // Connect the transport to the MCP server
        const server = createServer();
        await server.connect(transport);
        
        logger.logTransportEvent('transport_created', undefined, { 
          requestId,
          method: req.method
        });
      } else {
        // Invalid request - no session ID or not initialization request
        logger.warn('Invalid MCP request', {
          requestId,
          method: req.method,
          hasSessionId: !!sessionId,
          isInitRequest: req.method === 'POST' && req.is('application/json') && req.body?.method === 'initialize',
          sessionId: sessionId || 'none',
          userAgent: req.headers['user-agent']
        });
        
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided or not an initialization request',
          },
          id: null,
        });
        return;
      }
      
      // Handle the request with the transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP request', {
        requestId,
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        method: req.method,
        sessionId: req.headers['mcp-session-id'] as string || 'none',
        userAgent: req.headers['user-agent']
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: `Internal server error. Request ID: ${requestId}`,
          },
          id: null,
        });
      }
    }
  });

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'mcp-sap-docs-streamable',
      version: VERSION,
      timestamp: new Date().toISOString(),
      transport: 'streamable-http',
      protocol: '2025-07-09'
    });
  });

  // Start the server (bind to localhost for local-only access)
  const server = app.listen(MCP_PORT, '127.0.0.1', (error?: Error) => {
    if (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

  // Configure server timeouts for MCP connections
  server.timeout = 0;           // Disable HTTP timeout for long-lived MCP connections
  server.keepAliveTimeout = 0;  // Disable keep-alive timeout
  server.headersTimeout = 0;    // Disable headers timeout
  
  console.log(`📚 MCP Streamable HTTP Server listening on http://127.0.0.1:${MCP_PORT}`);
  console.log(`
==============================================
MCP STREAMABLE HTTP SERVER
Protocol version: 2025-07-09

Endpoint: /mcp
Methods: GET, POST, DELETE
Usage: 
  - Initialize with POST to /mcp
  - Establish stream with GET to /mcp
  - Send requests with POST to /mcp
  - Terminate session with DELETE to /mcp

Health check: GET /health
==============================================
`);

  // Log server startup
  logger.info("MCP SAP Docs Streamable HTTP server starting up", {
    port: MCP_PORT,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    logFormat: process.env.LOG_FORMAT
  });

  // Log successful startup
  logger.info("MCP SAP Docs Streamable HTTP server ready", {
    transport: "streamable-http",
    port: MCP_PORT,
    pid: process.pid
  });

  // Set up performance monitoring (every 5 minutes)
  const performanceInterval = setInterval(() => {
    logger.logPerformanceMetrics();
    logger.info('Active sessions status', {
      activeSessions: Object.keys(transports).length,
      sessionIds: Object.keys(transports),
      timestamp: new Date().toISOString()
    });
  }, 5 * 60 * 1000);

  // Handle server shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutdown signal received, closing server gracefully');
    
    // Clear performance monitoring
    clearInterval(performanceInterval);
    
    // Close all active transports to properly clean up resources
    const sessionIds = Object.keys(transports);
    logger.info(`Closing ${sessionIds.length} active sessions`);
    
    for (const sessionId of sessionIds) {
      try {
        logger.logTransportEvent('session_shutdown', sessionId);
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        logger.error('Error closing transport during shutdown', {
          sessionId,
          error: String(error)
        });
      }
    }
    
    logger.info('Server shutdown complete');
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
