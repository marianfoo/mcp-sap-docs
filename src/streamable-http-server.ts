import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  searchLibraries,
  fetchLibraryDocumentation,
  listDocumentationResources,
  readDocumentationResource,
  searchCommunity
} from "./lib/localDocs.js";
import { searchSapHelp, getSapHelpContent } from "./lib/sapHelp.js";
import { SearchResponse } from "./lib/types.js";
import { logger } from "./lib/logger.js";

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

// Helper function to extract client metadata from request
function extractClientMetadata(request: any): Record<string, any> {
  const metadata: Record<string, any> = {};
  
  // Try to extract available metadata from the request
  if (request.meta) {
    metadata.meta = request.meta;
  }
  
  // Extract any client identification from headers or other sources
  if (request.headers) {
    metadata.headers = request.headers;
  }
  
  // Extract transport information if available
  if (request.transport) {
    metadata.transport = request.transport;
  }
  
  // Extract session or connection info
  if (request.id) {
    metadata.requestId = request.id;
  }
  
  return metadata;
}

function createServer() {
  const srv = new Server({
    name: "SAP Docs Streamable HTTP",
    description:
      "SAP documentation server with Streamable HTTP transport - supports SAPUI5, CAP, wdi5, SAP Community and SAP Help Portal integration",
    version: "0.2.0"
  }, {
    capabilities: { 
      resources: {},  // Enable resources capability
      tools: {} 
    }
  });

  // ================================================================ RESOURCES
  // List available resources
  srv.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = await listDocumentationResources();
    return { resources };
  });

  // Read resource contents
  srv.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
      return await readDocumentationResource(uri);
    } catch (error: any) {
      return {
        contents: [{
          uri,
          mimeType: "text/plain",
          text: `Error reading resource: ${error.message}`
        }]
      };
    }
  });

  // ================================================================ TOOLS
  // List available tools
  srv.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "sap_docs_search",
          description: "Search across SAP documentation and UI5 control APIs. Searches through SAPUI5 documentation, CAP documentation, wdi5 testing framework, and OpenUI5 control APIs. Use this to find specific controls (like Button, Table, Wizard), concepts (like annotations, routing, authentication), testing topics (like wdi5, e2e testing, browser automation), or any SAP development topic. Returns a ranked list of matching documentation and controls with their IDs for use in sap_docs_get.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "What to search for. Examples: 'button' (finds UI5 Button controls), 'wizard' (finds Wizard controls and docs), 'annotation' (finds annotation docs across CAP/UI5), 'wdi5' (finds testing framework docs), 'testing' (finds testing and automation docs), 'routing', 'authentication', 'table', 'odata', 'fiori elements', 'cds', or any SAP development concept. Can be UI5 control names, technical concepts, testing topics, or general topics."
              }
            },
            required: ["query"]
          }
        },
        {
          name: "sap_community_search",
          description: "Search the SAP Community for blog posts, discussions, and solutions related to SAPUI5 and CAP development. Returns real-time results from the SAP Community with links to the original content and IDs for retrieving full posts. This tool searches across high-quality community content (posts with kudos > 5) to find practical, real-world solutions and best practices from SAP developers.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "What to search for in the SAP Community. Examples: 'wizard implementation', 'button best practices', 'authentication', 'deployment', 'fiori elements', or any SAP development topic. Searches both post titles and content for comprehensive results."
              }
            },
            required: ["query"]
          }
        },
        {
          name: "sap_docs_get",
          description: "Retrieve specific SAP documentation, UI5 control API details, wdi5 testing docs, or SAP Community posts. Use the IDs returned from sap_docs_search or sap_community_search to get full content. Works with library IDs, document IDs, and community post IDs (e.g., 'community-12345').",
          inputSchema: {
            type: "object",
            properties: {
              library_id: {
                type: "string",
                description: "Library or document ID from sap_docs_search results. Can be a library ID like '/sapui5', '/cap', '/wdi5', '/openui5-api' for general docs, or a specific document ID like '/openui5-api/sap/m/Button' for detailed control API documentation, or '/wdi5/authentication' for testing docs. For community posts, use IDs like 'community-12345' from sap_community_search results."
              },
              topic: {
                type: "string",
                description: "Optional topic filter to narrow down results within a library. Examples: 'properties', 'events', 'methods', 'aggregations', 'routing', 'authentication', 'annotations', 'testing', 'locators', 'pageObjects'. Most useful with library IDs rather than specific document IDs."
              }
            },
            required: ["library_id"]
          }
        },
        {
          name: "sap_help_search",
          description: "Search the SAP Help Portal using private APIs. This searches across all SAP Help documentation including product guides, implementation guides, and technical documentation. Returns real-time results from help.sap.com with IDs for retrieving full content.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "What to search for in SAP Help Portal. Examples: 'S/4HANA configuration', 'Fiori Launchpad setup', 'BTP integration', 'ABAP development', 'SAP Analytics Cloud', or any SAP product or technical topic. Searches across all SAP Help content."
              }
            },
            required: ["query"]
          }
        },
        {
          name: "sap_help_get",
          description: "Retrieve the full content of a specific SAP Help page. Use the IDs returned from sap_help_search to get the complete documentation page content. This uses the private SAP Help APIs to fetch metadata and page content.",
          inputSchema: {
            type: "object",
            properties: {
              result_id: {
                type: "string",
                description: "The ID from sap_help_search results (e.g., 'sap-help-12345abc'). This ID is used to fetch the complete page content including metadata."
              }
            },
            required: ["result_id"]
          }
        }
      ]
    };
  });

  // Handle tool execution
  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const clientMetadata = extractClientMetadata(request);

    if (name === "sap_docs_search") {
      const { query } = args as { query: string };
      
      // Log the search request with client metadata
      logger.logRequest(name, query, clientMetadata);
      
      const res: SearchResponse = await searchLibraries(query);
      
      if (!res.results.length) {
        return {
          content: [
            {
              type: "text",
              text: res.error || `No results found for "${query}". Try searching for UI5 controls like 'button', 'table', 'wizard', testing topics like 'wdi5', 'testing', 'e2e', or concepts like 'routing', 'annotation', 'authentication'.`
            }
          ]
        };
      }
      
      // Use the new formatted response from the improved search
      return {
        content: [
          {
            type: "text",
            text: res.results[0].description
          }
        ]
      };
    }

    if (name === "sap_community_search") {
      const { query } = args as { query: string };
      
      // Log the community search request
      logger.logRequest(name, query, clientMetadata);
      
      const res: SearchResponse = await searchCommunity(query);
      
      if (!res.results.length) {
        return {
          content: [
            {
              type: "text",
              text: res.error || `No SAP Community posts found for "${query}". Try different keywords or check your connection.`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: res.results[0].description
          }
        ]
      };
    }

    if (name === "sap_docs_get") {
      const { library_id, topic = "" } = args as { 
        library_id: string; 
        topic?: string; 
      };
      
      // Log the docs get request
      logger.logRequest(name, library_id + (topic ? `/${topic}` : ''), clientMetadata);
      
      const text = await fetchLibraryDocumentation(library_id, topic);
      
      if (!text) {
        return {
          content: [
            {
              type: "text",
              text: `Nothing found for ${library_id}`
            }
          ]
        };
      }
      
      return { content: [{ type: "text", text }] };
    }

    if (name === "sap_help_search") {
      const { query } = args as { query: string };
      
      // Log the SAP Help search request
      logger.logRequest(name, query, clientMetadata);
      
      const res: SearchResponse = await searchSapHelp(query);
      
      if (!res.results.length) {
        return {
          content: [
            {
              type: "text",
              text: res.error || `No SAP Help results found for "${query}". Try different keywords or check your connection.`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: res.results[0].description
          }
        ]
      };
    }

    if (name === "sap_help_get") {
      const { result_id } = args as { result_id: string };
      
      // Log the SAP Help get request
      logger.logRequest(name, result_id, clientMetadata);
      
      try {
        const content = await getSapHelpContent(result_id);
        
        return {
          content: [
            {
              type: "text",
              text: content
            }
          ]
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving SAP Help content: ${error.message}`
            }
          ]
        };
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return srv;
}

async function main() {
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
      version: '0.2.0',
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