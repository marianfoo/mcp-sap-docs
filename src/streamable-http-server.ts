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
import { getVariantConfig, isToolEnabled } from "./lib/variant.js";
import { prefetchFeatureMatrix } from "./lib/softwareHeroes/abapFeatureMatrix.js";
import { prefetchUi5LibDiff } from "./lib/ui5LibDiff/index.js";
import { loadEmbeddingModel } from "./lib/embeddingSearch.js";
import { CONFIG } from "./lib/config.js";
import { BoundedEventStore } from "./lib/boundedEventStore.js";
import { SessionRecord, SessionRegistry } from "./lib/sessionRegistry.js";
import { startSseKeepAlive } from "./lib/sseKeepAlive.js";

const VERSION = "0.3.53"; // x-release-please-version
const variant = getVariantConfig();

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    logger.warn(`Ignoring invalid ${name}`, { value: raw, fallback });
    return fallback;
  }

  return parsed;
}

interface ActiveSession {
  transport: StreamableHTTPServerTransport;
  server: Server;
  eventStore: BoundedEventStore;
}

function createServer() {
  const serverOptions: NonNullable<ConstructorParameters<typeof Server>[1]> & {
    protocolVersions?: string[];
  } = {
    protocolVersions: ["2025-11-25"],
    capabilities: {
      // resources: {},  // DISABLED: Causes 60,000+ resources which breaks Cursor
      tools: {}       // Enable tools capability
    }
  };

  const srv = new Server({
    name: variant.server.streamableName,
    description: variant.server.streamableDescription,
    version: VERSION
  }, serverOptions);

  // Configure server with shared handlers
  BaseServerHandler.configureServer(srv);

  return srv;
}

async function main() {
  // Initialize search system with metadata
  BaseServerHandler.initializeMetadata();

  // Pre-warm the ABAP Feature Matrix (fire-and-forget, never blocks startup)
  prefetchFeatureMatrix();

  // Pre-warm the UI5 Lib Diff data when the tool is enabled (fire-and-forget)
  if (isToolEnabled("ui5LibDiff")) {
    prefetchUi5LibDiff().catch((err: Error) =>
      logger.warn("ui5 lib diff prefetch failed", { error: err.message })
    );
  }

  if (CONFIG.PRELOAD_EMBEDDINGS) {
    // Pre-load the embedding model so the first search is fast (fire-and-forget)
    loadEmbeddingModel().catch((err: Error) =>
      logger.warn("embedding model pre-load failed", { error: err.message })
    );
  }

  const portEnv = process.env.PORT || process.env.MCP_PORT;
  const MCP_PORT = portEnv ? parseInt(portEnv, 10) : variant.server.streamablePort;
  const MCP_HOST = process.env.MCP_HOST || '127.0.0.1';
  const sessionIdleTtlMs = positiveIntegerEnv("MCP_SESSION_IDLE_TTL_MS", 30 * 60 * 1000);
  const sessionSweepIntervalMs = positiveIntegerEnv("MCP_SESSION_SWEEP_INTERVAL_MS", 60 * 1000);
  const maxSessions = positiveIntegerEnv("MCP_MAX_SESSIONS", 1000);
  const maxRssMb = positiveIntegerEnv("MCP_MAX_RSS_MB", 1024);
  const eventStoreTtlMs = positiveIntegerEnv("MCP_EVENT_STORE_TTL_MS", 5 * 60 * 1000);
  const maxEventStreamsPerSession = positiveIntegerEnv("MCP_MAX_EVENT_STREAMS_PER_SESSION", 8);
  const maxEventsPerStream = positiveIntegerEnv("MCP_MAX_EVENTS_PER_STREAM", 16);
  
  // Create Express application
  const app = express();
  app.use(express.json());
  
  // Configure CORS to expose Mcp-Session-Id header for browser-based clients
  app.use(cors({
    origin: '*', // Allow all origins - adjust as needed for production
    exposedHeaders: ['Mcp-Session-Id']
  }));

  // Public clients frequently abandon sessions without sending DELETE. Keep the
  // registry bounded so those transports cannot retain MCP Server instances
  // until the process exhausts its heap.
  const sessions = new SessionRegistry<ActiveSession>({
    idleTtlMs: sessionIdleTtlMs,
    maxSessions,
  });

  const removeSession = (
    sessionId: string | undefined,
    trigger: "onsessionclosed" | "onclose",
    context: Record<string, unknown> = {},
  ) => {
    if (!sessionId) return;

    const removed = sessions.delete(sessionId);
    if (removed) {
      removed.value.eventStore.clear();
      logger.logTransportEvent("session_closed", sessionId, {
        ...context,
        trigger,
        transportCount: sessions.size,
      });
    }
  };

  const closeSession = async (
    record: SessionRecord<ActiveSession>,
    trigger: "idle_timeout" | "capacity_limit" | "shutdown",
  ) => {
    logger.logTransportEvent("session_evicted", record.id, {
      trigger,
      idleMs: Date.now() - record.lastActivityAt,
      transportCount: sessions.size,
    });

    try {
      await record.value.server.close();
    } catch (error) {
      logger.warn("Error closing evicted MCP session", {
        sessionId: record.id,
        trigger,
        error: String(error),
      });
    } finally {
      record.value.eventStore.clear();
    }
  };

  // Legacy SSE endpoint - redirect to MCP
  app.all('/sse', (req: Request, res: Response) => {
    const redirectInfo = {
      error: "SSE endpoint deprecated",
      message: "The /sse endpoint has been removed. Please use the modern /mcp endpoint instead.",
      migration: {
        old_endpoint: "/sse",
        new_endpoint: "/mcp",
        transport: "MCP Streamable HTTP", 
        protocol_version: "2025-11-25"
      },
      documentation: "https://github.com/marianfoo/mcp-sap-docs#connect-from-your-mcp-client",
      alternatives: {
        "Local MCP Streamable HTTP": "http://127.0.0.1:" + variant.server.streamablePort + "/mcp",
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
    
    let oneShotServer: Server | undefined;

    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string;
      let transport: StreamableHTTPServerTransport;
      const activeSession = sessionId ? sessions.get(sessionId) : undefined;
      
      if (activeSession) {
        // Reuse existing transport
        transport = activeSession.value.transport;
        logger.logTransportEvent('transport_reused', sessionId, { 
          requestId, 
          method: req.method,
          transportCount: sessions.size
        });
      } else if (req.method === 'POST' && req.is('application/json') && req.body?.method === 'initialize') {
        // Initialization request — create a fresh transport.
        //
        // We also enter this branch if `sessionId` is present but doesn't match
        // any live transport (server restarted, session cleaned up via
        // `onsessionclosed`, in-memory map wiped). Per MCP spec the client is
        // permitted to re-send `initialize` to recover; the server generates a
        // new Mcp-Session-Id and the client should adopt it.
        let mcpServer: Server;
        const eventStore = new BoundedEventStore({
          ttlMs: eventStoreTtlMs,
          maxStreams: maxEventStreamsPerSession,
          maxEventsPerStream,
        });
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore,
          onsessioninitialized: (sessionId: string) => {
            // Store the transport by session ID when session is initialized
            logger.logTransportEvent('session_initialized', sessionId, {
              requestId,
              transportCount: sessions.size + 1
            });
            const evicted = sessions.add(sessionId, { transport, server: mcpServer, eventStore });
            for (const record of evicted) {
              void closeSession(record, "capacity_limit");
            }
          },
          onsessionclosed: (sessionId: string) => {
            removeSession(sessionId, 'onsessionclosed');
          }
        });

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          removeSession(transport.sessionId, 'onclose', { requestId });
        };
        
        // Connect the transport to the MCP server
        mcpServer = createServer();
        await mcpServer.connect(transport);
        
        logger.logTransportEvent('transport_created', undefined, { 
          requestId,
          method: req.method
        });
      } else if (req.method === 'POST' && req.is('application/json')) {
        // Stateless one-shot transport. Reached in two cases:
        //   1. No session ID (clients like Joule Studio that don't maintain sessions).
        //   2. Session ID present but unknown to the server (stale session — server
        //      restarted, container redeployed, or session was cleaned up). Without
        //      this fallback the client gets a hard HTTP 400 and many MCP clients
        //      (notably Cursor) won't auto-recover by re-initializing, so the user
        //      sees "No valid session ID" errors until they manually reconnect the
        //      MCP. Treating stale sessions as one-shot trades a tiny amount of
        //      per-session state for restart resilience — appropriate for a public,
        //      read-only docs/search server.
        logger.debug('Stateless / stale-session MCP request — creating one-shot transport', {
          requestId,
          bodyMethod: req.body?.method,
          hasStaleSessionId: Boolean(sessionId),
          userAgent: req.headers['user-agent']
        });

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Stateless — no session
        });

        oneShotServer = createServer();
        await oneShotServer.connect(transport);
      } else {
        // Invalid request — only non-POST or non-JSON requests reach this branch
        // after the stateless-fallback above. Typical case: GET/DELETE /mcp
        // without a live session (the MCP spec uses POST for the actual JSON-RPC
        // traffic; GET/DELETE are only valid on an already-initialized stream).
        logger.warn('Invalid MCP request', {
          requestId,
          method: req.method,
          hasSessionId: !!sessionId,
          contentType: req.headers['content-type'] || 'none',
          sessionId: sessionId || 'none',
          userAgent: req.headers['user-agent']
        });

        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: MCP requests must be POST with application/json (or GET/DELETE on a live session).',
          },
          id: null,
        });
        return;
      }
      
      // Stop idle SSE streams from being killed after 5 min and triggering a 409 reconnect
      // storm — see the comment on startSseKeepAlive.
      startSseKeepAlive(
        res,
        undefined,
        sessionId ? () => sessions.get(sessionId) : undefined,
      );

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
    } finally {
      // Stateless requests have no registry entry or future stream to retain.
      // Close their server explicitly instead of waiting for garbage collection.
      if (oneShotServer) {
        try {
          await oneShotServer.close();
        } catch (error) {
          logger.debug("Error closing one-shot MCP server", { error: String(error) });
        }
      }
    }
  });

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: variant.server.pm2StreamableName,
      version: VERSION,
      timestamp: new Date().toISOString(),
      transport: 'streamable-http',
      protocol: '2025-11-25',
      activeSessions: sessions.size,
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  });

  // Bind host is configurable; default remains localhost unless overridden.
  const server = app.listen(MCP_PORT, MCP_HOST, (error?: Error) => {
    if (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

  // Configure server timeouts for MCP connections
  server.timeout = 0;                // Long-lived MCP streams are allowed
  server.keepAliveTimeout = 65_000;  // Bound idle HTTP keep-alive sockets
  server.headersTimeout = 70_000;    // Must remain greater than keepAliveTimeout
  
  console.log(`📚 MCP Streamable HTTP Server listening on http://${MCP_HOST}:${MCP_PORT}`);
  console.log(`
==============================================
MCP STREAMABLE HTTP SERVER
Protocol version: 2025-11-25

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
    pid: process.pid,
    sessionIdleTtlMs,
    sessionSweepIntervalMs,
    maxSessions,
    maxRssMb,
    eventStoreTtlMs,
    maxEventStreamsPerSession,
    maxEventsPerStream,
  });

  const sessionSweepInterval = setInterval(() => {
    const expired = sessions.sweepExpired();
    if (expired.length > 0) {
      logger.info("Expired abandoned MCP sessions", {
        expiredSessions: expired.length,
        activeSessions: sessions.size,
      });
      for (const record of expired) {
        void closeSession(record, "idle_timeout");
      }
    }
  }, sessionSweepIntervalMs);

  // Set up performance monitoring (every 5 minutes). Log aggregates only;
  // serializing every session ID generated very large production logs.
  const performanceInterval = setInterval(() => {
    const memory = process.memoryUsage();
    logger.logPerformanceMetrics();
    logger.info('Active sessions status', {
      activeSessions: sessions.size,
      oldestIdleMs: sessions.oldestIdleMs(),
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      timestamp: new Date().toISOString()
    });
  }, 5 * 60 * 1000);

  let shuttingDown = false;
  const shutdown = async (reason: string, exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Shutdown requested, closing server gracefully', { reason });
    clearInterval(sessionSweepInterval);
    clearInterval(performanceInterval);
    clearInterval(memoryWatchInterval);

    const activeSessions = sessions.takeAll();
    logger.info(`Closing ${activeSessions.length} active sessions`, { reason });
    await Promise.allSettled(activeSessions.map((record) => closeSession(record, "shutdown")));

    server.close();
    logger.info('Server shutdown complete', { reason, exitCode });
    process.exit(exitCode);
  };

  // PM2 metrics are not always available. This in-process RSS watchdog is a
  // final circuit breaker that restarts cleanly before V8 reaches a fatal OOM.
  const memoryWatchInterval = setInterval(() => {
    const rssMb = process.memoryUsage().rss / 1024 / 1024;
    if (rssMb > maxRssMb) {
      logger.error("RSS memory ceiling exceeded", {
        rssMb: Math.round(rssMb),
        maxRssMb,
        activeSessions: sessions.size,
      });
      void shutdown("rss_memory_ceiling", 1);
    }
  }, 60 * 1000);

  process.on('SIGINT', () => void shutdown("SIGINT", 0));
  process.on('SIGTERM', () => void shutdown("SIGTERM", 0));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
