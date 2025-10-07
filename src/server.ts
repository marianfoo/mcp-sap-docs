import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./lib/logger.js";
import { BaseServerHandler } from "./lib/BaseServerHandler.js";

function createServer() {
  const srv = new Server({
    name: "Local SAP Docs",
    description:
      "Offline SAPUI5 & CAP documentation server with SAP Community, SAP Help Portal, and ABAP Keyword Documentation integration",
    version: "0.1.0"
  }, {
    capabilities: { 
      // resources: {},  // DISABLED: Causes 60,000+ resources which breaks Cursor
      tools: {},      // Enable tools capability
      prompts: {}     // Enable prompts capability for 2025-06-18 protocol
    }
  });

  // Configure server with shared handlers
  BaseServerHandler.configureServer(srv);

  return srv;
}

async function main() {
  // Initialize search system with metadata
  BaseServerHandler.initializeMetadata();
  
  const srv = createServer();
  
  // Log server startup
  logger.info("MCP SAP Docs server starting up", {
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    logFormat: process.env.LOG_FORMAT
  });
  
  await srv.connect(new StdioServerTransport());
  console.error("📚 MCP server ready (stdio) with Tools and Prompts support.");
  
  // Log successful startup
  logger.info("MCP SAP Docs server ready and connected", {
    transport: "stdio",
    pid: process.pid
  });
  
  // Set up performance monitoring (every 10 minutes for stdio servers)
  const performanceInterval = setInterval(() => {
    logger.logPerformanceMetrics();
  }, 10 * 60 * 1000);

  // Handle server shutdown
  process.on('SIGINT', () => {
    logger.info('Shutdown signal received, closing stdio server gracefully');
    clearInterval(performanceInterval);
    logger.info('Stdio server shutdown complete');
    process.exit(0);
  });
  
  // Log the port if we're running in HTTP mode (for debugging)
  if (process.env.PORT) {
    console.error(`📚 MCP server configured for port: ${process.env.PORT}`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
}); 