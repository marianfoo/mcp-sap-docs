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
const VERSION = "0.2.6";


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
  const srv = new Server({
    name: "SAP Docs Streamable HTTP",
    description:
      "SAP documentation server with Streamable HTTP transport - supports SAPUI5, CAP, wdi5, SAP Community, SAP Help Portal, and ABAP Keyword Documentation integration",
    version: VERSION
  }, {
    capabilities: { 
      resources: {},  // Enable resources capability
      tools: {} 
    }
  });

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

  // Handle all MCP Streamable HTTP requests (GET, POST, DELETE) on a single endpoint
  app.all('/mcp', async (req: Request, res: Response) => {
    console.log(`Received ${req.method} request to /mcp`);
    
    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string;
      let transport: StreamableHTTPServerTransport;
      
      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
        // New initialization request - create new transport
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore, // Enable resumability
          onsessioninitialized: (sessionId: string) => {
            // Store the transport by session ID when session is initialized
            console.log(`StreamableHTTP session initialized with ID: ${sessionId}`);
            transports[sessionId] = transport;
          }
        });
        
        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`Transport closed for session ${sid}, removing from transports map`);
            delete transports[sid];
          }
        };
        
        // Connect the transport to the MCP server
        const server = createServer();
        await server.connect(transport);
      } else {
        // Invalid request - no session ID or not initialization request
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
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
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
      protocol: '2025-03-26'
    });
  });

  // Start the server (bind to localhost for local-only access)
  app.listen(MCP_PORT, '127.0.0.1', (error?: Error) => {
    if (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
    console.log(`📚 MCP Streamable HTTP Server listening on http://127.0.0.1:${MCP_PORT}`);
    console.log(`
==============================================
MCP STREAMABLE HTTP SERVER
Protocol version: 2025-03-26

Endpoint: /mcp
Methods: GET, POST, DELETE
Usage: 
  - Initialize with POST to /mcp
  - Establish SSE stream with GET to /mcp
  - Send requests with POST to /mcp
  - Terminate session with DELETE to /mcp

Health check: GET /health
==============================================
`);
  });

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

  // Handle server shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // Close all active transports to properly clean up resources
    for (const sessionId in transports) {
      try {
        console.log(`Closing transport for session ${sessionId}`);
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    console.log('Server shutdown complete');
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});