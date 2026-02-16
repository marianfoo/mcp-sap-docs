import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./lib/logger.js";
import { BaseServerHandler } from "./lib/BaseServerHandler.js";
import { getVariantConfig } from "./lib/variant.js";

const variant = getVariantConfig();

function createServer() {
  const serverOptions: NonNullable<ConstructorParameters<typeof Server>[1]> & {
    protocolVersions?: string[];
  } = {
    protocolVersions: ["2025-07-09"],
    capabilities: {
      // resources: {},  // DISABLED: Causes 60,000+ resources which breaks Cursor
      tools: {},      // Enable tools capability
      prompts: {}     // Enable prompts capability for 2025-07-09 protocol
    }
  };

  const srv = new Server({
    name: variant.server.stdioName,
    description: variant.server.stdioDescription,
    version: "0.1.0"
  }, serverOptions);

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
