// PM2 configuration for BM25-only SAP Docs MCP server
// Simplified configuration without reranker dependencies
module.exports = {
  apps: [
    {
      name: "mcp-sap-proxy",
      script: "/opt/mcp-sap/venv/bin/mcp-proxy",
      args: [
        "--host", "127.0.0.1",
        "--port", "18080",             // <— pin the port
        "--",
        "node", "/opt/mcp-sap/mcp-sap-docs/dist/src/server.js"
      ],
      interpreter: "none",                 // <— very important (Python app, not Node)
      cwd: "/opt/mcp-sap/mcp-sap-docs",
      env: { 
        NODE_ENV: "production",
        LOG_LEVEL: "INFO",
        LOG_FORMAT: "json",
        // BM25-only search configuration
        RETURN_K: "25"  // Centralized result limit (can override CONFIG.RETURN_K)
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000
    },

    // HTTP status server on :3001 (pinned port for PM2)
    {
      name: "mcp-sap-http",
      script: "node",
      args: ["/opt/mcp-sap/mcp-sap-docs/dist/src/http-server.js"],
      cwd: "/opt/mcp-sap/mcp-sap-docs",
      env: { 
        NODE_ENV: "production", 
        PORT: "3001",
        // BM25-only search configuration
        RETURN_K: "25"  // Centralized result limit (can override CONFIG.RETURN_K)
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000
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
        // BM25-only search configuration
        RETURN_K: "25"  // Centralized result limit (can override CONFIG.RETURN_K)
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000
    }
  ]
}