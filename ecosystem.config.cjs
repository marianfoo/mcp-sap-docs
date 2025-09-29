// PM2 configuration for SAP Docs MCP server
// Modern MCP streamable HTTP transport only (SSE proxy removed)
module.exports = {
  apps: [
    // HTTP status server on :3001 (pinned port for PM2)
    {
      name: "mcp-sap-http",
      script: "node",
      args: ["/opt/mcp-sap/mcp-sap-docs/dist/src/http-server.js"],
      cwd: "/opt/mcp-sap/mcp-sap-docs",
      env: { 
        NODE_ENV: "production", 
        PORT: "3001",
        LOG_LEVEL: "DEBUG",  // Enhanced for debugging
        LOG_FORMAT: "json",
        // BM25-only search configuration
        RETURN_K: "30"  // Centralized result limit (can override CONFIG.RETURN_K)
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      // Enhanced logging configuration
      log_file: "/opt/mcp-sap/logs/mcp-http-combined.log",
      out_file: "/opt/mcp-sap/logs/mcp-http-out.log",
      error_file: "/opt/mcp-sap/logs/mcp-http-error.log",
      log_type: "json",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Log rotation
      max_size: "10M",
      retain: 10,
      compress: true
    },

    // Streamable HTTP MCP server (latest MCP spec)
    {
      name: "mcp-sap-streamable",
      script: "node",
      args: ["/opt/mcp-sap/mcp-sap-docs/dist/src/streamable-http-server.js"],
      cwd: "/opt/mcp-sap/mcp-sap-docs",
      env: { 
        NODE_ENV: "production", 
        MCP_PORT: "3122",
        LOG_LEVEL: "DEBUG",  // Enhanced for debugging
        LOG_FORMAT: "json",
        // BM25-only search configuration
        RETURN_K: "30"  // Centralized result limit (can override CONFIG.RETURN_K)
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      // Enhanced logging configuration
      log_file: "/opt/mcp-sap/logs/mcp-streamable-combined.log",
      out_file: "/opt/mcp-sap/logs/mcp-streamable-out.log",
      error_file: "/opt/mcp-sap/logs/mcp-streamable-error.log",
      log_type: "json",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Log rotation
      max_size: "10M",
      retain: 10,
      compress: true
    }
  ]
}