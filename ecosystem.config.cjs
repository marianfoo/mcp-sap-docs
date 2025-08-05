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
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000
    },

    // HTTP status server on :18080 (pinned port for PM2)
    {
      name: "mcp-sap-http",
      script: "node",
      args: ["/opt/mcp-sap/mcp-sap-docs/dist/src/http-server.js"],
      cwd: "/opt/mcp-sap/mcp-sap-docs",
      env: { NODE_ENV: "production", PORT: "3001" },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000
    }
  ]
}